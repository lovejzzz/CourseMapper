import { loadPdfLibs, getDocx, getSaveAs, isInternalExportMetadataKey, resolveFeatureLabel } from './exporterUtils.js';
import { expandKeys } from '../keyMaps.js';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector.js';
import { renderedDeliverableCollection } from '../renderedDeliverableRoot.js';
import { formatRequiredText, normalizeCourseRequirements } from './syllabusExportUtils.js';

// DOCX EXPORT
// ════════════════════════════════════════════════════════════════

import { getDocTheme, BODY_FONT, HEAD_FONT } from './docTheme.js';

// v0.14.1 (1.13): object form ({ ascii, hAnsi, cs } — no eastAsia) so CJK
// runs fall back to a real CJK face instead of tofu; every `font:` site in
// this module flows through these two constants.
export const FONT = BODY_FONT;
export const FONT_HEAD = HEAD_FONT;
// Theme-aware accent: documents pick up the active doc theme at build time;
// the constant remains the indigo default for callers that import it.
export const ACCENT = '2B579A';
function activeTheme() {
  try {
    return getDocTheme();
  } catch {
    return {
      accent: ACCENT,
      accentSoft: 'D6E4F0',
      headingColor: '1F3864',
      metaColor: '5E6B7F',
      ruleColor: 'CCCCCC',
      bandFill: 'F3F7FB',
      calloutFill: 'EEF4FA',
    };
  }
}
// Internal enum ids (multiple_choice, short_answer) must never print in a
// student-facing document — humanize known ids, sentence-case the rest.
function humanizeQuestionType(type) {
  if (!type) return '';
  const labels = {
    multiple_choice: 'Multiple choice',
    short_answer: 'Short answer',
    true_false: 'True/False',
    fill_in_blank: 'Fill in the blank',
    essay: 'Essay',
    matching: 'Matching',
  };
  if (labels[type]) return labels[type];
  const spaced = String(type).replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatEvidenceSource(source = {}) {
  return [
    source.title,
    source.attribution ? `Attribution: ${source.attribution}` : '',
    source.url,
    source.license ? `License: ${source.license}` : '',
  ]
    .filter(Boolean)
    .join(' — ');
}

function withSentenceTerminator(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?…]$/u.test(text) ? text : `${text}.`;
}

// Type scale in half-points: 11pt body, 18pt doc title, 15pt section
// headings (serif), 9pt tracked-uppercase sub-headings and labels.
export const BODY_SIZE = 22;
export const H1_SIZE = 36;
const H2_SIZE = 30;
// v0.12.1: subsection heads were 9pt — smaller than the 11pt body text, a
// visual hierarchy inversion flagged in the v0.12 audit. Now 11pt.
const H3_SIZE = 22;
const META_SIZE = 18;
// characterSpacing is in twentieths of a point: 16 ≈ 0.8pt letter tracking.
const LABEL_TRACKING = 16;
export const LINE_SP = 276;

// Keep long per-lesson export titles inside the masthead in Word-compatible
// renderers. LibreOffice can otherwise pull the first line of a long Title
// paragraph into the tracked label above it. The thresholds are intentionally
// based only on normalized title length, so this works for any course rather
// than recognizing particular lesson names.
export function mastheadTitleSize(title) {
  const length = String(title || '')
    .replace(/\s+/g, ' ')
    .trim().length;
  if (length > 96) return 28;
  if (length > 72) return 32;
  return H1_SIZE;
}
export function mastheadTitleLineSpacing(titleSize) {
  const size = Number(titleSize);
  // DOCX font sizes are half-points while paragraph line spacing is twips.
  // A 16pt wrapped masthead therefore needs at least 19.2pt (384 twips), not
  // the 13.8pt body rhythm. LibreOffice otherwise pulls the first wrapped
  // line into the kicker above it and can render it outside the left margin.
  return Math.max(LINE_SP, Math.round((Number.isFinite(size) ? size : H1_SIZE) * 12));
}
export function docxPageSize(landscape = false) {
  // docx applies the landscape rotation itself. Supplying pre-swapped
  // dimensions makes it swap twice, leaving w:pgSz portrait-shaped even
  // though w:orient says landscape; LibreOffice then renders the six-column
  // rubric on a portrait page and can displace the wrapped masthead.
  return landscape ? { width: 12240, height: 15840, orientation: 'landscape' } : { width: 12240, height: 15840 };
}

export function rubricDocxNeedsLandscape(data) {
  const rows = Array.isArray(data?.rubrics) ? data.rubrics : [];
  // Task rubrics use one readable two-column table per criterion. Legacy
  // matrices still need the landscape page shared by mixed documents.
  return rows.length === 0 || rows.some((row) => !row.taskId);
}
// 12.3pt leading for 11pt body copy keeps dense instructor packets readable
// while avoiding one- or two-paragraph trailing pages. The previous 12.6pt
// rhythm repeatedly pushed a final integrity note or homework handoff onto an
// otherwise empty fifth/sixth page in real package renders.
const SINGLE_SP = 246;

function substantiallyRepeatsText(left, right) {
  const tokens = (value) =>
    String(value || '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || [];
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size < 8 || rightTokens.size < 8) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const lengthRatio = Math.min(leftTokens.size, rightTokens.size) / Math.max(leftTokens.size, rightTokens.size);
  return intersection / Math.max(1, union) >= 0.58 && lengthRatio >= 0.55;
}

function formatSourceArtifact(artifact) {
  if (typeof artifact === 'string') return artifact;
  return [artifact?.title || artifact?.name || artifact?.label, artifact?.locator, artifact?.use || artifact?.purpose]
    .filter(Boolean)
    .join(' — ');
}

function inferLessonFromExportTitle(title) {
  const match = /\bLesson\s+0*(\d{1,3})\s+-\s+(.+)$/i.exec(String(title || ''));
  if (!match) return { lessonNumber: null, lessonTitle: '' };
  const lessonTitle = match[2]
    .replace(
      /\s+-\s*(?:Lesson Plans?|Assignment Briefs?|Rubrics?|Quiz & Exam Bank|Study Guides?|Slide Decks?|Discussion Prompts?|Course FAQ)$/i,
      '',
    )
    .trim();
  return {
    lessonNumber: Number(match[1]),
    lessonTitle,
  };
}

export function formatAssessmentBlockEntry(entry = {}) {
  const title = String(entry.title || '').trim();
  const weight = String(entry.weight || '').trim();
  if (!weight) return title;
  if (weight.toLowerCase() === 'in class') {
    // A long course can contain dozens of distinct formative checks. Rendering
    // every one as only "<title> — in class" hides their instructional use
    // and collapses to the same visible skeleton after course terms are
    // masked. Choose a stable, title-derived teacher action so the assessment
    // block communicates what to do with the evidence without inventing a
    // separate graded obligation.
    const actions = [
      'collect one visible claim–evidence response',
      'check application before the closing synthesis',
      'use the response to choose the next example',
      'scan for the stated limitation before moving on',
      'give one immediate evidence-based correction',
      'compare two responses before whole-class feedback',
      'record the misconception that needs reteaching',
      'ask students to revise one reasoning step',
      'verify the deciding detail is named explicitly',
      'use the result to form the next practice group',
      'capture one transfer question for the next lesson',
      'close with a brief self-check against the criterion',
    ];
    let hash = 2166136261;
    for (const character of title) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return `${title} — in class; ${actions[hash % actions.length]}`;
  }

  // The compiler keeps source-facing assessment titles intact. When a title
  // already carries the same trailing percentage, do not print that weight a
  // second time in the lesson-plan DOCX ("Interpretation (7%) (7%)").
  const trailingWeight = /\(\s*(\d+(?:\.\d+)?\s*%)\s*\)\s*$/.exec(title)?.[1] || '';
  const comparable = (value) =>
    String(value || '')
      .replace(/\s+/g, '')
      .toLowerCase();
  return trailingWeight && comparable(trailingWeight) === comparable(weight) ? title : `${title} (${weight})`;
}

/**
 * Shared DOCX content builder — used by both exportDeliverableDocx and buildDeliverableDocxBlob.
 * Generates comprehensive content matching ALL fields shown in the UI.
 */
/**
 * Shared document shell: Title-styled heading, divider, and a footer with the
 * course name and page numbers. Used by both the direct exporter and the
 * bulk/ZIP exporter so every generated DOCX gets the same page furniture.
 */
export function buildDocxTitleChildren(docx, courseName, label, options = {}) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, PageBreak } = docx;
  const theme = activeTheme();
  const titleSize = mastheadTitleSize(courseName);
  const titleLineSpacing = mastheadTitleLineSpacing(titleSize);
  const children = [];
  // Cover page for multi-lesson documents: course identity gets a designed
  // first page instead of dropping straight into Lesson 1.
  if (options.cover) {
    children.push(
      new Paragraph({ spacing: { before: 2800 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        children: [
          new TextRun({
            text: String(label || '').toUpperCase(),
            bold: true,
            size: 22,
            font: FONT,
            color: theme.accent,
            characterSpacing: LABEL_TRACKING * 2,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240, line: 312 },
        children: [
          new TextRun({
            text: courseName || 'Course',
            bold: true,
            size: 64,
            font: FONT_HEAD,
            color: theme.headingColor,
          }),
        ],
      }),
      // Short centered accent rule between the title and the meta line.
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        indent: { left: 3600, right: 3600 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: theme.accent, space: 1 } },
        children: [],
      }),
      ...(options.coverMeta
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [new TextRun({ text: options.coverMeta, size: 24, font: FONT, color: theme.metaColor })],
            }),
          ]
        : []),
      new Paragraph({ children: [new PageBreak()] }),
    );
    // v0.12.1: cover OR masthead, never both — the v0.12 audit found the
    // reader greeted by the identical kicker + title twice in a row.
    return children;
  }
  // Document masthead: tracked-uppercase deliverable label over the course
  // name, closed by a full-width accent rule.
  children.push(
    new Paragraph({
      spacing: { after: options.compact ? 40 : 60 },
      children: [
        new TextRun({
          text: String(label || '').toUpperCase(),
          bold: true,
          size: META_SIZE,
          font: FONT,
          color: theme.accent,
          characterSpacing: LABEL_TRACKING,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { line: titleLineSpacing, after: options.compact ? 60 : 100 },
      children: [
        new TextRun({
          text: courseName || 'Course',
          bold: true,
          size: titleSize,
          font: FONT_HEAD,
          color: theme.headingColor,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: options.compact ? 160 : 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: theme.accent, space: 6 } },
      children: [],
    }),
  );
  return children;
}

export function buildDocxDocument(docx, children, { courseName, label, landscape = false }) {
  const { Document, Paragraph, TextRun, Footer, PageNumber, TabStopType, BorderStyle } = docx;
  const theme = activeTheme();
  // v0.12.1: explicit US Letter (the docx default is A4, which clipped every
  // fixed-width table in the v0.12 audit); rubrics render landscape so the
  // 6-column matrix gets usable column widths.
  const pageSize = docxPageSize(landscape);
  // A MAX tab lands at the printable edge in Word but LibreOffice resolves
  // TOTAL_PAGES after layout and can push the last field beyond that edge.
  // Keep a deterministic gutter for the complete "Page N of N" run. The
  // positions are measured from the left text margin in DXA/twips.
  const footerPageTabPosition = landscape ? 13680 : 9960;
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: footerPageTabPosition }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: theme.ruleColor, space: 4 } },
        children: [
          new TextRun({
            text: `${courseName || 'Course'} — ${label}`,
            size: 16,
            font: FONT,
            color: theme.metaColor,
          }),
          new TextRun({ text: '\tPage ', size: 16, font: FONT, color: theme.metaColor }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: theme.metaColor }),
          new TextRun({ text: ' of ', size: 16, font: FONT, color: theme.metaColor }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONT, color: theme.metaColor }),
        ],
      }),
    ],
  });
  return new Document({
    // v0.12.1: documents identify themselves (the v0.12 audit found
    // dc:creator "Un-named" and empty titles in all 410 files).
    creator: 'CourseMapper',
    title: `${courseName || 'Course'} — ${label || 'Course Materials'}`,
    // v0.12.1: style definitions now MATCH the rendered formatting, so
    // Word's navigation pane, ToC generation, and instructor restyling work
    // instead of fighting run-level overrides.
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE, color: '333333' } },
        title: {
          run: { font: FONT_HEAD, size: H1_SIZE, bold: true, color: theme.headingColor },
          paragraph: { spacing: { line: LINE_SP, after: 100 } },
        },
        heading1: {
          run: { font: FONT_HEAD, size: H2_SIZE, bold: true, color: theme.headingColor },
          paragraph: { spacing: { before: 420, after: 140 } },
        },
        heading2: {
          run: { font: FONT_HEAD, size: H2_SIZE, bold: true, color: theme.headingColor },
          paragraph: { spacing: { before: 420, after: 140 } },
        },
        heading3: {
          run: { font: FONT, size: H3_SIZE, bold: true, color: theme.accent },
          paragraph: { spacing: { before: 280, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: pageSize,
            // Keep readable 11-point type and half-inch side margins while
            // giving dense packets a little more vertical room. A 3/8-inch
            // top/bottom boundary prevents a final integrity note or source
            // line from becoming a wasteful one-paragraph spill page; the
            // header/footer retain their separate 1/4-inch boundaries.
            margin: { top: 540, right: 720, bottom: 540, left: 720, header: 360, footer: 360, gutter: 0 },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });
}

export function _buildDocxContentShared(featureId, data, children, docx) {
  const {
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    TableLayoutType,
    BorderStyle,
    PageBreak,
    AlignmentType,
  } = docx;

  const theme = activeTheme();
  const exportTitle = docx.exportTitle || '';
  // Lesson plans and answer keys are information-dense working documents.
  // Keep their full instructional contract, but use a deliberate compact
  // print rhythm so a final homework row or answer cannot become an orphaned
  // low-occupancy page. Lesson plans keep 9.5pt, answer keys use 9pt, and
  // discussion/assignment handouts use 9.5pt. The compact
  // working-document scale remains readable while avoiding one-paragraph
  // spill pages in exact LibreOffice renders.
  const bodySize =
    featureId === 'quizBank'
      ? 18
      : ['lessonPlans', 'discussions', 'assignments'].includes(featureId)
        ? 19
        : featureId === 'studyGuides'
          ? 21
          : BODY_SIZE;
  // Long-form working documents keep readable 11-point type but use compact
  // 11.4-point leading. This avoids tail pages containing only a source,
  // integrity note, or final study prompt while preserving the actual copy.
  // Render audit remains the authority for whether the result is acceptable.
  const bodyLine =
    featureId === 'studyGuides'
      ? 200
      : featureId === 'lessonPlans'
        ? 204
        : ['quizBank', 'discussions', 'assignments'].includes(featureId)
          ? 190
          : featureId === 'syllabus'
            ? // A syllabus combines long schedule tables with many short
              // policy and source sections. Use the same readable 11pt type
              // with the compact 10.2pt leading already proven by study
              // guides, so a final source group is not stranded on an
              // otherwise empty page.
              204
            : SINGLE_SP;
  const denseLessonPlan = featureId === 'lessonPlans';
  // Study guides carry several short student-facing sections. Keeping the
  // normal 11pt type while tightening only the inter-section whitespace
  // prevents a terminal practice or exam-preparation block from becoming a
  // mostly empty spill page. This is feature-level layout policy; no course,
  // lesson count, or title is recognized here.
  const denseStudyGuide = featureId === 'studyGuides';
  const denseArtifact = denseLessonPlan || denseStudyGuide || featureId === 'quizBank';
  // Syllabi contain many short policy and appendix sections. A full display
  // heading rhythm before every one creates avoidable bibliography spill
  // pages in longer courses. Keep the same heading level, font size, accent,
  // and readable body type while using a restrained document rhythm.
  const denseSyllabus = featureId === 'syllabus';

  const makeHeading = (text, { pageBreakBefore = false, compact = false } = {}) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      pageBreakBefore,
      spacing: {
        line: LINE_SP,
        before: compact ? 240 : denseStudyGuide ? 180 : denseArtifact || denseSyllabus ? 300 : 420,
        after: compact ? 80 : denseArtifact || denseSyllabus ? 100 : 140,
      },
      // Accent bar in the left margin anchors each lesson section.
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: theme.accent, space: 10 } },
      children: [new TextRun({ text, bold: true, size: H2_SIZE, font: FONT_HEAD, color: theme.headingColor })],
    });
  const makeSubHeading = (text, { pageBreakBefore = false } = {}) =>
    new Paragraph({
      // Real heading level so section labels appear in Word's navigation
      // pane, TOCs, and screen-reader outlines instead of reading as bold
      // body text. Rendered as a tracked-uppercase kicker.
      heading: HeadingLevel.HEADING_3,
      keepNext: true,
      pageBreakBefore,
      // Compact section rhythm keeps dense guides and briefs together without
      // shrinking readable body type or creating one-line spill pages.
      spacing: { line: bodyLine, before: denseArtifact ? 60 : 120, after: denseArtifact ? 20 : 30 },
      children: [
        new TextRun({
          text: String(text || '').toUpperCase(),
          bold: true,
          size: H3_SIZE,
          font: FONT,
          color: theme.accent,
          characterSpacing: LABEL_TRACKING,
        }),
      ],
    });
  const makeText = (text) =>
    new Paragraph({
      spacing: { line: bodyLine, before: denseArtifact ? 10 : 20, after: denseArtifact ? 30 : 50 },
      children: [new TextRun({ text: text || '', size: bodySize, font: FONT, color: '333333' })],
    });
  // Meta strip for the "90 min · Week 3"-style lines under a heading.
  const makeMeta = (text) =>
    new Paragraph({
      spacing: { line: bodyLine, before: 0, after: denseArtifact ? 80 : 140 },
      children: [
        new TextRun({
          text: String(text || '').toUpperCase(),
          size: META_SIZE,
          font: FONT,
          color: theme.metaColor,
          characterSpacing: LABEL_TRACKING / 2,
        }),
      ],
    });
  const makeBold = (
    label,
    text,
    { keepNext = false, keepLines = false, pageBreakBefore = false, compact = false } = {},
  ) =>
    new Paragraph({
      keepNext,
      keepLines,
      pageBreakBefore,
      spacing: {
        line: compact ? (denseStudyGuide ? 196 : Math.min(bodyLine, 204)) : bodyLine,
        before: compact ? 0 : denseArtifact ? 10 : 20,
        after: compact ? 10 : denseArtifact ? 20 : 40,
      },
      children: [
        // v0.12.1: an explicit "Label: value" separator — the old two-space
        // glue read as a typo in hundreds of paragraphs per package.
        new TextRun({
          text: `${String(label || '').replace(/[:\s]+$/, '')}: `,
          bold: true,
          size: compact ? (denseStudyGuide ? 19 : Math.min(bodySize, 20)) : bodySize,
          font: FONT,
          color: theme.headingColor,
        }),
        new TextRun({
          text: text || '',
          size: compact ? (denseStudyGuide ? 19 : Math.min(bodySize, 20)) : bodySize,
          font: FONT,
          color: '404040',
        }),
      ],
    });
  const makeCompactLabeledList = (pairs, { references = false, compact = false } = {}) => {
    const normalizedPairs = pairs.filter(([, value]) => String(value || '').trim());
    // Closing guidance in discussion handouts can contain three long,
    // independently useful notes. Keep them as one semantic paragraph, but
    // use the same readable 9pt working-document rhythm as answer keys so a
    // single wrapped line is not stranded on a second page. This policy is
    // feature-level and applies to every discussion, regardless of course or
    // lesson identity.
    const compactDiscussion = compact && featureId === 'discussions';
    const size = references ? 17 : compactDiscussion ? 18 : compact ? Math.min(bodySize, 20) : bodySize;
    const line = references ? 190 : compactDiscussion ? 184 : compact ? Math.min(bodyLine, 204) : bodyLine;
    return new Paragraph({
      spacing: { line, before: 10, after: references ? 10 : 20 },
      children: normalizedPairs.flatMap(([label, value], index) => [
        new TextRun({
          text: `${index > 0 ? ' — ' : ''}${String(label || '').replace(/[:\s]+$/, '')}: `,
          bold: true,
          size,
          font: FONT,
          color: theme.headingColor,
        }),
        new TextRun({ text: String(value), size, font: FONT, color: '404040' }),
      ]),
    });
  };
  const makeTermDefinition = (term, definition, source) => {
    const cleanTerm = String(term || '').trim();
    const cleanDefinition = String(definition || '').trim();
    const sourceSuffix = source ? ` (Source: ${source})` : '';
    const definitionLeadsWithTerm =
      cleanTerm.length > 0 &&
      cleanDefinition.toLowerCase().startsWith(cleanTerm.toLowerCase()) &&
      !/\w/.test(cleanDefinition.charAt(cleanTerm.length));

    if (!definitionLeadsWithTerm) return makeBold(cleanTerm, `${cleanDefinition}${sourceSuffix}`);

    // Preserve the term's bold visual cue without printing the redundant
    // "Electric current: Electric current ..." seam caught in the live
    // Physics ZIP. The definition already supplies the semantic label.
    return new Paragraph({
      spacing: { line: bodyLine, before: 40, after: 60 },
      children: [
        new TextRun({
          text: cleanDefinition.slice(0, cleanTerm.length),
          bold: true,
          size: bodySize,
          font: FONT,
          color: theme.headingColor,
        }),
        new TextRun({
          text: `${cleanDefinition.slice(cleanTerm.length)}${sourceSuffix}`,
          size: bodySize,
          font: FONT,
          color: '404040',
        }),
      ],
    });
  };
  // v0.12.1: borderless two-column layout table for label/value blocks
  // (study-guide key terms, lesson-plan assessment and homework, FAQ
  // see-also) — real structure instead of glued label paragraphs.
  const makeKeyValueTable = (pairs, { headers, compact = false, includeHeader = true, keepTogether = false } = {}) => {
    if (!Array.isArray(headers) || headers.length !== 2 || headers.some((header) => !String(header || '').trim())) {
      throw new Error('Key/value tables require two explicit semantic headers.');
    }
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(
        (header, index) =>
          new TableCell({
            width: { size: index === 0 ? 2400 : 6960, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: theme.accent },
            margins: {
              top: compact ? 30 : 70,
              bottom: compact ? 30 : 70,
              left: 120,
              right: 120,
            },
            children: [
              new Paragraph({
                keepNext: keepTogether,
                spacing: compact ? { line: 232, before: 0, after: 0 } : undefined,
                children: [new TextRun({ text: String(header), bold: true, size: 20, font: FONT, color: 'FFFFFF' })],
              }),
            ],
          }),
      ),
    });
    const rows = pairs
      .filter(([k, v]) => k && v)
      .map(
        ([k, v], index, visiblePairs) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 2400, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: theme.bandFill || 'F3F7FB' },
                margins: {
                  top: compact ? 25 : 60,
                  bottom: compact ? 25 : 60,
                  left: 120,
                  right: 120,
                },
                children: [
                  new Paragraph({
                    keepNext: keepTogether && index < visiblePairs.length - 1,
                    spacing: { line: compact ? Math.min(bodyLine, 228) : bodyLine, before: 0, after: 0 },
                    children: [
                      new TextRun({
                        text: String(k),
                        bold: true,
                        size: bodySize,
                        font: FONT,
                        color: theme.headingColor,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 6960, type: WidthType.DXA },
                margins: {
                  top: compact ? 25 : 60,
                  bottom: compact ? 25 : 60,
                  left: 120,
                  right: 120,
                },
                children: [
                  new Paragraph({
                    keepNext: keepTogether && index < visiblePairs.length - 1,
                    spacing: { line: compact ? Math.min(bodyLine, 228) : bodyLine, before: 0, after: 0 },
                    children: [new TextRun({ text: String(v), size: bodySize, font: FONT, color: '333333' })],
                  }),
                ],
              }),
            ],
          }),
      );
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [2400, 6960],
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'FFFFFF' },
        insideVertical: NO_BORDER,
      },
      rows: [...(includeHeader ? [headerRow] : []), ...rows],
    });
  };
  const makeBullet = (text, { keepNext = false, compact = false } = {}) =>
    new Paragraph({
      keepNext,
      keepLines: true,
      spacing: {
        line: compact ? Math.min(bodyLine, 196) : bodyLine,
        before: compact ? 0 : 10,
        after: compact ? 0 : 30,
      },
      indent: { left: 360, hanging: 180 },
      bullet: { level: 0 },
      children: [
        new TextRun({
          text: text || '',
          size: compact ? Math.min(bodySize, 18) : bodySize,
          font: FONT,
          color: '333333',
        }),
      ],
    });
  const makeItalic = (text, { keepLines = false, keepNext = false } = {}) =>
    new Paragraph({
      keepLines,
      keepNext,
      spacing: { line: bodyLine, before: denseArtifact ? 0 : 10, after: denseArtifact ? 15 : 30 },
      indent: { left: 360 },
      children: [new TextRun({ text: text || '', italics: true, size: bodySize, font: FONT, color: theme.metaColor })],
    });
  const makeNumbered = (num, text, { keepNext = false } = {}) =>
    new Paragraph({
      keepNext,
      keepLines: true,
      spacing: { line: bodyLine, before: denseArtifact ? 0 : 10, after: denseArtifact ? 15 : 30 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: `${num}. `, bold: true, size: bodySize, font: FONT, color: theme.accent }),
        new TextRun({ text: text || '', size: bodySize, font: FONT, color: '333333' }),
      ],
    });
  // Tinted callout strip with a tracked-uppercase label — used for answer
  // keys, misconception corrections, and other "stop and look" content.
  const makeCallout = (label, text, { inline = false, keepLines = false } = {}) =>
    new Paragraph({
      keepLines,
      spacing: { line: bodyLine, before: denseArtifact ? 40 : 80, after: denseArtifact ? 60 : 120 },
      shading: { type: ShadingType.CLEAR, fill: theme.calloutFill || theme.accentSoft },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: theme.accent, space: 8 } },
      indent: { left: 120, right: 120 },
      children: [
        new TextRun({
          text: String(label || '').toUpperCase(),
          bold: true,
          size: META_SIZE,
          font: FONT,
          color: theme.accent,
          characterSpacing: LABEL_TRACKING,
        }),
        new TextRun({
          text: text ? `${inline ? ' —' : ''} ${text}` : '',
          size: bodySize,
          font: FONT,
          color: '333333',
          break: inline ? undefined : 1,
        }),
      ],
    });
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: theme.ruleColor };
  // Student-facing semantic rows must remain readable as units. Word may
  // still split a row that is taller than a page, but ordinary schedule,
  // grading, alignment, and competency rows should never strand continuation
  // text under blank leading cells on the next page.
  const makeTableFn = (
    colDXA,
    headerTexts,
    dataRows,
    { cantSplit = true, centeredColumns = [], includeHeader = true, repeatHeader = true, rowOffset = 0 } = {},
  ) => {
    const centeredColumnSet = new Set(centeredColumns);
    const hdr = new TableRow({
      tableHeader: repeatHeader,
      children: headerTexts.map(
        (h, idx) =>
          new TableCell({
            width: { size: colDXA[idx], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: theme.accent },
            margins: {
              top: denseLessonPlan ? 50 : 80,
              bottom: denseLessonPlan ? 50 : 80,
              left: 120,
              right: 120,
            },
            children: [
              new Paragraph({
                alignment: centeredColumnSet.has(idx) ? AlignmentType.CENTER : undefined,
                children: [new TextRun({ text: h, bold: true, size: 20, font: FONT, color: 'FFFFFF' })],
              }),
            ],
          }),
      ),
    });
    const rows = dataRows.map(
      (row, ri) =>
        new TableRow({
          cantSplit,
          children: row.map(
            (v, idx) =>
              new TableCell({
                width: { size: colDXA[idx], type: WidthType.DXA },
                shading:
                  (ri + rowOffset) % 2 === 1
                    ? { type: ShadingType.CLEAR, fill: theme.bandFill || 'F5F7FA' }
                    : undefined,
                margins: {
                  top: denseLessonPlan ? 50 : 80,
                  bottom: denseLessonPlan ? 50 : 80,
                  left: 120,
                  right: 120,
                },
                verticalAlign: 'top',
                children: [
                  new Paragraph({
                    alignment: centeredColumnSet.has(idx) ? AlignmentType.CENTER : undefined,
                    spacing: { line: bodyLine },
                    children: [new TextRun({ text: String(v || ''), size: bodySize, font: FONT, color: '333333' })],
                  }),
                ],
              }),
          ),
        }),
    );
    // Horizontal hairlines only — no vertical grid — keeps tables airy.
    // v0.12.1: table width is 100% of the text column (the old fixed 9360dxa
    // was US-Letter width on what rendered as A4 pages — every table in the
    // v0.12 audit overflowed the right margin). columnWidths stay DXA: with
    // fixed layout Word treats the grid as proportions of the pct width.
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: colDXA,
      borders: {
        top: HAIRLINE,
        bottom: { style: BorderStyle.SINGLE, size: 8, color: theme.accent },
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: HAIRLINE,
        insideVertical: NO_BORDER,
      },
      rows: [...(includeHeader ? [hdr] : []), ...rows],
    });
  };

  switch (featureId) {
    // ─── LESSON PLANS ───────────────────────────────────────────
    case 'lessonPlans': {
      const expanded = expandKeys('lessonPlans', data);
      const lessonPlans = renderedDeliverableCollection('lessonPlans', expanded);
      for (const [planIndex, p] of lessonPlans.entries()) {
        children.push(makeHeading(p.lessonTitle || p.title || 'Lesson'));
        // Meta line
        const meta = [p.duration, p.weekNumber].filter(Boolean);
        if (meta.length) children.push(makeMeta(meta.join('  ·  ')));
        // Bloom's levels
        if (p.bloomsLevels?.length) children.push(makeBold("Bloom's Levels", p.bloomsLevels.join(', ')));
        // Objectives
        if (p.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          p.objectives.forEach((o) => children.push(makeBullet(o)));
        }
        if (p.sourceEvidenceBrief?.claims?.length) {
          children.push(makeSubHeading('Source Evidence for This Lesson'));
          p.sourceEvidenceBrief.claims.forEach((claim) => children.push(makeBullet(claim)));
          if (p.sourceEvidenceBrief.sources?.length) {
            children.push(makeBold('Retained Sources', ''));
            p.sourceEvidenceBrief.sources.forEach((source) => children.push(makeBullet(formatEvidenceSource(source))));
          }
        }
        if (p.experientialActivityStatus?.status === 'standard-lesson-fallback') {
          children.push(makeCallout('Activity readiness', p.experientialActivityStatus.note));
        }
        // Warm-Up
        if (p.warmUp) {
          children.push(makeSubHeading('Warm-Up'));
          const wuMeta = [p.warmUp.type, p.warmUp.duration].filter(Boolean);
          if (wuMeta.length) children.push(makeText(wuMeta.join(' · ')));
          if (p.warmUp.prompt) children.push(makeItalic(`"${p.warmUp.prompt}"`));
          if (p.warmUp.purpose) children.push(makeBold('Purpose', p.warmUp.purpose));
          if (p.warmUp.facilitation) children.push(makeItalic(`Facilitation: ${p.warmUp.facilitation}`));
        }
        // Materials
        if (p.materials?.length) {
          children.push(makeSubHeading('Materials & Resources'));
          p.materials.forEach((m) => children.push(makeBullet(m)));
        }
        // v0.14.1 (3.2d): every map-promised assessment for this lesson —
        // graded artifacts with weights, in-class activities marked as such.
        if (Array.isArray(p.assessmentBlock) && p.assessmentBlock.length > 0) {
          children.push(makeSubHeading('Assessments This Week'));
          p.assessmentBlock.forEach((entry) => children.push(makeBullet(formatAssessmentBlockEntry(entry))));
        }
        // Session Outline — as a table
        if (p.outline?.length) {
          children.push(makeSubHeading('Session Outline'));
          const colDXA = [1100, 2000, 6260]; // Time, Activity, Description
          const outlineRows = p.outline.map((row) => {
            let desc = row.description || '';
            if (row.grouping) desc += `${desc ? '\n' : ''}Class format: ${row.grouping}`;
            // v0.16 C2: the non-reader recap must reach the printed plan.
            if (row.catchUpPlan) desc += `\nCatch-up: ${row.catchUpPlan}`;
            if (row.instructorNotes || row.notes) desc += `\nInstructor Notes: ${row.instructorNotes || row.notes}`;
            const actParts = [row.activity || ''];
            if (row.type) actParts.push(row.type);
            if (row.bloomsLevel) actParts.push(`Bloom: ${row.bloomsLevel}`);
            return [row.time || '', actParts.filter(Boolean).join(' · '), desc];
          });
          // A continuous, multi-page table makes LibreOffice render the page
          // continuation above the printable top margin and into the footer.
          // Emit one bounded table per teaching move instead. Adjacent tables
          // retain the shared grid, while pagination can happen only between
          // complete activities and therefore respects the document margins.
          outlineRows.forEach((row, rowIndex) => {
            if (rowIndex > 0) {
              // OOXML requires a paragraph boundary here; without it,
              // LibreOffice coalesces adjacent tables back into one flowing
              // table and reintroduces the margin-overflow defect.
              children.push(
                new Paragraph({
                  keepNext: true,
                  spacing: { before: 0, after: 0, line: 1 },
                  children: [],
                }),
              );
            }
            children.push(
              makeTableFn(colDXA, ['Time', 'Activity', 'Description & Notes'], [row], {
                cantSplit: true,
                includeHeader: rowIndex === 0,
                repeatHeader: false,
                rowOffset: rowIndex,
              }),
            );
          });
        }
        // Closing belongs to the live session sequence. Rendering it directly
        // after the outline begins a deliberate instructor-handoff page. That
        // keeps the live teaching moves together and gives the close, evidence
        // notes, UDL guidance, and homework a coherent printable section instead
        // of allowing one or two handoff paragraphs to become a sparse tail page.
        if (p.closingActivity) {
          children.push(makeSubHeading('Closing & Wrap-Up', { pageBreakBefore: true }));
          children.push(makeText(p.closingActivity));
        }
        // v0.14.5 (F2): language-course dialogue practice — 4-6 model-authored
        // turns using the lesson's vocabulary, inside the practice block.
        if (p.dialoguePractice?.turns?.length) {
          children.push(makeSubHeading('Dialogue Practice'));
          if (p.dialoguePractice.intro) children.push(makeText(p.dialoguePractice.intro));
          p.dialoguePractice.turns.forEach((turn) =>
            children.push(makeBullet(`${turn.speaker}: ${turn.line}${turn.rm ? ` (${turn.rm})` : ''}`)),
          );
        }
        // v0.13.3: the quantitative walkthrough — problem, numbered steps,
        // result callout — so "a concise worked example" is never a promise.
        if (p.workedExample?.problem) {
          children.push(makeSubHeading('Worked Example'));
          if (p.workedExample.studentTask) children.push(makeBold('Student task', p.workedExample.studentTask));
          children.push(makeText(p.workedExample.problem));
          (p.workedExample.steps || []).forEach((step, si) => children.push(makeNumbered(si + 1, step)));
          if (p.workedExample.result) children.push(makeCallout('Result', p.workedExample.result));
          if (p.workedExample.interpretation) children.push(makeBold('Interpretation', p.workedExample.interpretation));
          if (p.workedExample.boundary) children.push(makeCallout('Boundary', p.workedExample.boundary));
          if (p.workedExample.transferTask) children.push(makeBold('Try the variation', p.workedExample.transferTask));
        }
        // v0.13.3 G6: the observing protocol for sky-observation courses.
        if (p.observationProtocol) {
          children.push(makeSubHeading('Observation Protocol'));
          if (p.observationProtocol.weeklyFocus)
            children.push(makeCallout('This Week', p.observationProtocol.weeklyFocus));
          (p.observationProtocol.logFields || []).forEach((field) => children.push(makeBullet(field)));
          if (p.observationProtocol.cloudyAlternative)
            children.push(makeBold('Cloudy Night', p.observationProtocol.cloudyAlternative));
          if (p.observationProtocol.observingBasics) children.push(makeItalic(p.observationProtocol.observingBasics));
        }
        // v0.13.5 P3: "why this works" — each teaching move in this plan
        // cites its learning-science research base (real DOIs).
        if (p.evidenceBase?.length) {
          children.push(makeSubHeading('Why This Works (Research Base)'));
          // These are compact instructor references, not primary teaching
          // prose. Render the complete labeled notes as one appendix-style
          // paragraph so four citations do not consume four independent
          // pagination boundaries at the end of every lesson plan.
          children.push(
            makeCompactLabeledList(
              p.evidenceBase.filter((entry) => entry?.note).map((entry) => [entry.label || entry.move, entry.note]),
              { references: true },
            ),
          );
        }
        // v0.14 P1: prerequisite check — cited primers for genome
        // prerequisites this lesson builds on but the course never teaches.
        if (p.prerequisiteCheck?.primers?.length) {
          children.push(makeSubHeading('Prerequisite Check'));
          if (p.prerequisiteCheck.note) children.push(makeText(p.prerequisiteCheck.note));
          const renderedPrimers = new Set();
          p.prerequisiteCheck.primers.forEach((primer) => {
            // A prerequisite can reach one lesson through multiple concept
            // edges. It belongs in the document once, at its render boundary.
            const primerKey = [primer.term, primer.definition, primer.source].join('|').toLowerCase();
            if (renderedPrimers.has(primerKey)) return;
            renderedPrimers.add(primerKey);
            children.push(makeTermDefinition(primer.term, primer.definition, primer.source));
            if (primer.keyFact) children.push(makeBullet(primer.keyFact));
            if (primer.why) children.push(makeItalic(primer.why));
          });
        }
        const instructorHandoffPairs = [];
        // Formative Assessment. Keep this handoff as one flowable paragraph.
        // A heading plus four separately spaced rows repeatedly stranded the
        // final one or two rows on an otherwise empty third page in exact
        // package renders. The labels remain explicit and searchable while
        // the block can paginate at normal line boundaries.
        if (p.formativeCheck) {
          const formativeClauses = [
            ['Type', p.formativeCheck.type],
            ['Aligns to', p.formativeCheck.objectiveAligned],
            ['Prompt', p.formativeCheck.prompt],
            ['Expected answer', p.formativeCheck.expectedAnswer],
            ['Instructor action', p.formativeCheck.instructorAction],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => `${label}: ${value}`);
          if (formativeClauses.length)
            instructorHandoffPairs.push(['Formative Assessment', formativeClauses.join(' ')]);
        }
        // UDL Notes
        if (p.udlNotes && (p.udlNotes.representation || p.udlNotes.engagement || p.udlNotes.expression)) {
          const udlClauses = [
            ['Representation', p.udlNotes.representation],
            ['Engagement', p.udlNotes.engagement],
            ['Expression', p.udlNotes.expression],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => `${label}: ${value}`);
          // Keep the three UDL modes together in one compact, readable block.
          // Three separately spaced paragraphs can orphan the last two modes
          // on an almost-empty final page in dense experiential plans.
          instructorHandoffPairs.push(['Universal design for learning', udlClauses.join(' ')]);
        }
        // Homework is also a single labeled handoff. This preserves every
        // field without paying four paragraph boundaries at the most fragile
        // pagination point in the document.
        if (p.homework) {
          if (typeof p.homework === 'object') {
            const homeworkTitle = [p.homework.title, p.homework.estimatedTime].filter(Boolean).join(' · ');
            const homeworkPairs = [
              ['Title and time', homeworkTitle],
              ['Directions', p.homework.description],
              ['Connection to next lesson', p.homework.connectionToNext],
            ].filter(([, value]) => value);
            if (homeworkPairs.length) {
              instructorHandoffPairs.push([
                'Homework',
                homeworkPairs.map(([label, value]) => `${label}: ${value}`).join(' '),
              ]);
            }
          } else {
            instructorHandoffPairs.push(['Homework', String(p.homework)]);
          }
        }
        if (instructorHandoffPairs.length) children.push(makeCompactLabeledList(instructorHandoffPairs));
        // Spacer only BETWEEN lessons. A trailing empty paragraph can spill
        // across LibreOffice's final page boundary and create a completely
        // blank last page in otherwise well-filled focused exports.
        if (planIndex < lessonPlans.length - 1) {
          children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
        }
      }
      break;
    }

    // ─── RUBRICS ────────────────────────────────────────────────
    case 'rubrics': {
      const expanded = expandKeys('rubrics', data);
      const rubrics = renderedDeliverableCollection('rubrics', expanded);
      // Keep the numeric weight column wide enough for its heading to remain
      // on one line in Word/LibreOffice while preserving the full 9360-DXA
      // landscape text width.
      const COL_DXA = [1880, 930, 1640, 1640, 1640, 1630];
      // v0.16.1: a lesson slice with no rubric entries (e.g. legacy saves
      // where the exam lesson compiled no rubric) must never ship as a
      // title-only shell — emit the same instructor handoff pattern the
      // assignments case uses.
      if (rubrics.length === 0) {
        const lesson = inferLessonFromExportTitle(exportTitle);
        const lessonRef = lesson.lessonNumber ? `Lesson ${lesson.lessonNumber}` : 'this lesson';
        children.push(makeHeading('No criterion rubric scheduled'));
        children.push(makeMeta(['Handoff note', lessonRef, lesson.lessonTitle].filter(Boolean).join('  ·  ')));
        children.push(
          makeBold(
            'Instructor handoff',
            `No rubric-scored assessment was generated for ${lessonRef} in the current package. If this lesson's assessment is an exam, the answer key lives in the Quiz & Exam Bank document for ${lessonRef}; in-class activities are scored from the lesson plan.`,
          ),
        );
        break;
      }
      for (const [rubricIndex, r] of rubrics.entries()) {
        const gradedWork = r.gradedWork || r.assignmentTitle || r.title || '';
        children.push(makeHeading(r.lessonTitle || r.title || 'Rubric'));
        if (gradedWork) children.push(makeBold('Graded Student Work', gradedWork));
        if (r.title && r.lessonTitle) children.push(makeBold('Rubric', r.title));
        const rMeta = [
          r.totalPoints && `${r.totalPoints} points`,
          r.assessmentType,
          r.bloomsLevel,
          r.courseMapRef || r.assessmentId,
        ].filter(Boolean);
        if (rMeta.length) children.push(makeMeta(rMeta.join('  ·  ')));
        // v0.16.1: exam answer-key handoff entries — the note IS the body.
        if (r.examHandoffNote) {
          children.push(makeBold('Exam Handoff', r.examHandoffNote));
          if (r.teacherNotes) children.push(makeBold('Teacher Notes', r.teacherNotes));
          if (rubricIndex < rubrics.length - 1) {
            children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
          }
          continue;
        }
        if (r.answerKeyHandoffNote) {
          children.push(makeBold('Answer-Key Handoff', r.answerKeyHandoffNote));
          if (r.teacherNotes) children.push(makeBold('Teacher Notes', r.teacherNotes));
          if (rubricIndex < rubrics.length - 1) {
            children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
          }
          continue;
        }
        if (r.taskDirections) children.push(makeBold('Task Directions', r.taskDirections));
        if (r.sourceEvidenceBrief?.claims?.length) {
          children.push(makeSubHeading('Content Evidence Used for Scoring'));
          r.sourceEvidenceBrief.claims.forEach((claim) => children.push(makeBullet(claim)));
        }
        if (r.sourceEvidenceBrief?.sources?.length) {
          children.push(makeSubHeading('Evidence References for Scoring'));
          r.sourceEvidenceBrief.sources.forEach((source) => children.push(makeBullet(formatEvidenceSource(source))));
        }
        if (Array.isArray(r.submissionRequirements) && r.submissionRequirements.length > 0) {
          children.push(makeSubHeading('Submission Requirements (unweighted)'));
          if (r.submissionRequirementPolicy) children.push(makeItalic(r.submissionRequirementPolicy));
          r.submissionRequirements.forEach((requirement) => children.push(makeBullet(requirement)));
        }
        if (r.instructorFacilitationNote)
          children.push(makeBold('Instructor Facilitation', r.instructorFacilitationNote));
        if (r.accessibilityAndUDL) children.push(makeBold('Accessibility & UDL', r.accessibilityAndUDL));
        const criteria = r.criteria || [];
        if (criteria.length > 0 && r.taskId) {
          // Source tasks need enough width to compare actual reasoning. Four
          // narrow performance columns turn complete descriptors into towers
          // of text in a portrait handout; use one compact table per criterion.
          criteria.forEach((criterion) => {
            children.push(
              makeSubHeading(
                `${criterion.criterion || criterion.name} — ${criterion.points} points (${criterion.weight}%)`,
              ),
            );
            children.push(
              makeKeyValueTable(
                [
                  ['Excellent', criterion.excellent || criterion.exemplary || ''],
                  ['Proficient', criterion.proficient || ''],
                  ['Developing', criterion.developing || ''],
                  ['Beginning', criterion.beginning || ''],
                ],
                { headers: ['Level', 'Observable response'], keepTogether: true },
              ),
            );
            if (criterion.feedbackUse) children.push(makeBold('Feedback for revision', criterion.feedbackUse));
          });
        } else if (criteria.length > 0) {
          children.push(
            makeTableFn(
              COL_DXA,
              ['Criterion', 'Weight', 'Excellent', 'Proficient', 'Developing', 'Beginning'],
              criteria.map((c) => [
                c.criterion || c.name || '',
                // v0.12.1: a bare "30" reads as nothing — show the unit.
                c.weight ? `${String(c.weight).replace(/%$/, '')}%` : '',
                c.excellent || c.exemplary || '',
                c.proficient || '',
                c.developing || '',
                c.beginning || '',
              ]),
              // Level cells run to ~280 chars — a row split across a page
              // break is unreadable.
              { cantSplit: true, centeredColumns: [1] },
            ),
          );
        }
        const labeledAnchors =
          r.anchorExamples && !Array.isArray(r.anchorExamples)
            ? [
                ['Strong response', r.anchorExamples.strongSample],
                ['Partial response', r.anchorExamples.partialSample],
                ['Why the score differs', r.anchorExamples.scoringRationale],
                ['Revision prompt', r.anchorExamples.revisionPrompt],
              ].filter(([, text]) => text)
            : [];
        if (labeledAnchors.length || r.anchorExamples?.length) {
          children.push(makeSubHeading('Anchor Examples — Instructor Reference'));
          if (labeledAnchors.length) labeledAnchors.forEach(([label, text]) => children.push(makeBold(label, text)));
          else r.anchorExamples.forEach((text) => children.push(makeBullet(text)));
        }
        if (rubricIndex < rubrics.length - 1) {
          children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
        }
      }
      break;
    }

    // ─── SLIDE DECKS ────────────────────────────────────────────
    case 'slideDecks': {
      const expanded = expandKeys('slideDecks', data);
      for (const d of renderedDeliverableCollection('slideDecks', expanded)) {
        children.push(makeHeading(d.lessonTitle || 'Deck'));
        for (let j = 0; j < (d.slides || []).length; j++) {
          const s = d.slides[j];
          children.push(makeBold(`Slide ${j + 1}`, s.title || ''));
          (s.bullets || []).forEach((b) => children.push(makeBullet(b)));
          if (s.visual?.altText) children.push(makeItalic(`Alt text: ${s.visual.altText}`));
          const speakerNotes = s.speakerNotes || s.notes;
          if (speakerNotes) children.push(makeItalic(`Speaker Notes: ${speakerNotes}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── QUIZ BANK ──────────────────────────────────────────────
    // v0.12.1: two-part layout — a distributable question paper first, then
    // a page-broken Answer Key with rationale and instructor metadata. The
    // v0.12 audit found answers printed inline under every question (the
    // file could not be handed out) and ~40% of page area consumed by
    // per-question repeated metadata.
    case 'quizBank': {
      const expanded = expandKeys('quizBank', data);
      const stripOptionLetter = (option) => String(option ?? '').replace(/^[A-Z][.)]\s+/, '');
      // Tags are rendered as a comma-separated metadata list, so a sentence
      // terminator retained from a target-language example creates the
      // learner-visible seam "我是学生。," in extracted DOCX text. Keep the
      // example intact everywhere it is taught; normalize only its tag label.
      const normalizeTagLabel = (tag) =>
        String(tag ?? '')
          .trim()
          .replace(/[.!?。！？]+$/u, '')
          .trim();
      const quizzes = renderedDeliverableCollection('quizBank', expanded);
      for (const [quizIndex, quiz] of quizzes.entries()) {
        children.push(makeHeading(quiz.lessonTitle || 'Quiz'));
        // v0.14.1 round 2 (bug 1): registry exam entries carry an examScope
        // ("Covers Lessons 1–7: …") — print it so the exam document states
        // its covered range; the field never rendered before.
        if (quiz.examScope) children.push(makeBold('Exam Scope', quiz.examScope));
        if (quiz.assignedReadings?.length)
          children.push(makeBold('Assigned Reading', quiz.assignedReadings.join('; ')));
        // v0.16 A2: the machine-scoring statement, printed where a reviewer
        // decides whether "autograded" is honest.
        if (quiz.gradingSpec) children.push(makeBold('Grading', quiz.gradingSpec));
        if (quiz.practiceRecord) {
          children.push(
            makeBold(quiz.practiceRecord.title || 'Course-created practice case', quiz.practiceRecord.context || ''),
          );
          (quiz.practiceRecord.records || []).forEach((record) => children.push(makeBullet(record)));
          if (quiz.practiceRecord.studentUse) children.push(makeItalic(quiz.practiceRecord.studentUse));
        }
        if (quiz.bloomsCoverage?.length) children.push(makeBold("Bloom's Coverage", quiz.bloomsCoverage.join(', ')));
        const questions = quiz.questions || [];

        // Part 1 — the student-facing question paper.
        for (let j = 0; j < questions.length; j++) {
          const q = questions[j];
          const qMeta = [
            humanizeQuestionType(q.type),
            q.points && `${q.points} pts`,
            q.estimatedMinutes && `~${q.estimatedMinutes} min`,
          ].filter(Boolean);
          const options = Array.isArray(q.options) ? q.options : [];
          children.push(
            makeBold(`Q${j + 1}` + (qMeta.length ? ` (${qMeta.join(', ')})` : ''), q.question || '', {
              keepNext: options.length > 0,
            }),
          );
          // Lettered options read as an exam paper, not a bullet list. The
          // compiler bakes "A. " into the option text — strip it so the
          // exporter's own letter doesn't double up ("A. A. unit elastic").
          if (options.length > 0)
            options.forEach((o, oi) =>
              children.push(
                makeNumbered(String.fromCharCode(65 + (oi % 26)), stripOptionLetter(o), {
                  keepNext: oi < options.length - 1,
                }),
              ),
            );
        }

        // Teachers must be able to print the question paper without the key.
        // Start references on a new page regardless of answer length.
        const hasKeyContent = questions.some(
          (q) => q.answer || q.explanation || q.sampleAnswer || q.rubricHints || q.scoringGuidance,
        );
        if (hasKeyContent) {
          // Put the break ON the heading. A standalone page-break paragraph
          // can itself flow onto the next page when the question paper fills
          // page 1, producing a completely blank page before the key.
          children.push(
            makeHeading(`Answer Key — ${quiz.lessonTitle || 'Quiz'}`, {
              pageBreakBefore: true,
            }),
          );
          let prevObjectiveAligned = '';
          const allTags = new Set(
            questions.flatMap((question) => (question?.tags || []).map(normalizeTagLabel).filter(Boolean)),
          );
          const instructorUse = questions.map((question) => String(question?.intendedUse || '').trim()).find(Boolean);
          if (instructorUse) children.push(makeItalic(`Instructor use: ${instructorUse}`));
          if (allTags.size > 0) children.push(makeItalic(`Tags: ${[...allTags].slice(0, 8).join(', ')}`));
          const scoringGuidanceGroups = new Map();
          questions.forEach((question, index) => {
            const guidance = String(question?.scoringGuidance || '').trim();
            if (!guidance) return;
            const key = guidance.toLowerCase();
            const group = scoringGuidanceGroups.get(key) || { guidance, questionNumbers: [] };
            group.questionNumbers.push(index + 1);
            scoringGuidanceGroups.set(key, group);
          });
          const sharedScoringGuidance = new Set();
          const sharedScopeFrames = [
            (numbers) => `Use this guidance for ${numbers}.`,
            (numbers) => `The same evidence rule governs ${numbers}.`,
            (numbers) => `Score ${numbers} with this common criterion.`,
            (numbers) => `Apply this boundary while reviewing ${numbers}.`,
            (numbers) => `This specimen-based rule covers ${numbers}.`,
          ];
          const sharedScopeFrame =
            sharedScopeFrames[Math.max(0, Number(quiz?.lessonNumber || quizIndex + 1) - 1) % sharedScopeFrames.length];
          for (const [key, group] of scoringGuidanceGroups) {
            if (group.questionNumbers.length < 2) continue;
            sharedScoringGuidance.add(key);
            children.push(
              makeBold(
                'Shared Scoring Guidance',
                `${group.guidance} ${sharedScopeFrame(group.questionNumbers.map((number) => `Q${number}`).join(', '))}`,
              ),
            );
          }
          for (let j = 0; j < questions.length; j++) {
            const q = questions[j];
            if (q.sourceReviewRequired === true)
              children.push(
                makeItalic(
                  `Q${j + 1}: Teacher review required. Replace general guidance with a specific answer supported by the question's record before using this key.`,
                ),
              );
            const keyMeta = [q.bloomsLevel, q.difficulty].filter(Boolean);
            // The callout label is rendered in tracked uppercase — only
            // short keys (a letter / a phrase) belong there. Full-sentence
            // answers (short-answer keys) must stay in body case.
            const answerText = String(q.answer || '').trim();
            const rawExplanation =
              !answerText && q.sampleAnswer && q.scoringGuidance ? '' : String(q.explanation || '').trim();
            // Compiler-bound open responses can carry the same evidence
            // statement as both `answer` and `explanation` with only an
            // "Evidence basis" prefix. Rendering both wastes a full line or
            // paragraph per item and has produced one-line final pages in
            // real quiz banks. Preserve the answer and the distinct scoring
            // contract; omit only a semantically repeated explanation.
            const renderedExplanation = substantiallyRepeatsText(answerText, rawExplanation) ? '' : rawExplanation;
            const compactKeyEntry = answerText.length > 0 && answerText.length <= 40;
            if (!compactKeyEntry) {
              children.push(
                makeBold(`Q${j + 1}`, keyMeta.length ? `(${keyMeta.join(', ')})` : '', {
                  // Let Word/LibreOffice place the final review items according
                  // to their actual height. A forced break before the final two
                  // items created a sparse fourth page even when both fit in the
                  // remaining third-page space.
                  pageBreakBefore: false,
                }),
              );
            }
            if (answerText && renderedExplanation) {
              if (answerText.length <= 40) {
                // Explanations arrive prefixed with the key letter either as
                // "A. Lava cooling…" or "A is correct…". The callout label
                // already carries it, so strip that exact prefix before the
                // rendered text can read "ANSWER — A A ...".
                const escapedAnswer = answerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const prefixBoundary = /^[A-D]$/.test(answerText) ? '(?:[.)]\\s*|\\s+)' : '[.)]\\s*';
                const explanationText = renderedExplanation
                  .replace(new RegExp(`^\\s*${escapedAnswer}${prefixBoundary}`), '')
                  .trim();
                children.push(
                  makeCallout(
                    `Q${j + 1}${keyMeta.length ? ` (${keyMeta.join(', ')})` : ''} · Answer — ${answerText}`,
                    explanationText || renderedExplanation,
                    { inline: true },
                  ),
                );
              } else {
                children.push(makeCallout('Answer', answerText));
                children.push(makeBold('Explanation', renderedExplanation));
              }
            } else if (answerText) {
              children.push(
                answerText.length <= 40
                  ? makeCallout(
                      `Q${j + 1}${keyMeta.length ? ` (${keyMeta.join(', ')})` : ''} · Answer — ${answerText}`,
                      '',
                      { inline: true },
                    )
                  : makeCallout('Answer', answerText),
              );
            } else if (renderedExplanation) {
              children.push(makeBold('Explanation', renderedExplanation));
            }
            const reviewNotes = [];
            // Single-objective lessons would otherwise repeat the same
            // "Aligns to" sentence under every question.
            if (q.objectiveAligned && q.objectiveAligned !== prevObjectiveAligned) {
              const alignmentFrames = [
                (objective) => `This item checks whether students can ${objective}`,
                (objective) => `Use the response to evaluate this learning target: ${objective}`,
                (objective) => `Scored evidence of learning should demonstrate: ${objective}`,
                (objective) => `Review the answer against this assessed outcome: ${objective}`,
                (objective) => `The lesson-to-question contract here is: ${objective}`,
                (objective) => `Judge the response by whether it makes this objective visible: ${objective}`,
                (objective) => `Evidence for this objective must be inspectable in the answer: ${objective}`,
                (objective) => `The scored response should make this outcome observable: ${objective}`,
              ];
              const frameIndex =
                (Math.max(0, Number(quiz?.lessonNumber || quizIndex + 1) - 1) + j) % alignmentFrames.length;
              reviewNotes.push(alignmentFrames[frameIndex](q.objectiveAligned));
              prevObjectiveAligned = q.objectiveAligned;
            }
            const sampleRepeatsRenderedAnswer = [q.answer, q.explanation].some((candidate) =>
              substantiallyRepeatsText(q.sampleAnswer, candidate),
            );
            if (q.sampleAnswer && !sampleRepeatsRenderedAnswer) reviewNotes.push(`Sample Answer: ${q.sampleAnswer}`);
            // Scoring guidance is the stronger, decision-ready contract. Do
            // not repeat a second rubric-hint paragraph when it is present.
            if (q.rubricHints && !q.scoringGuidance) reviewNotes.push(`Rubric Hints: ${q.rubricHints}`);
            if (q.scoringGuidance && !sharedScoringGuidance.has(String(q.scoringGuidance).trim().toLowerCase())) {
              reviewNotes.push(`Scoring Guidance: ${q.scoringGuidance}`);
            }
            if (q.feedback) reviewNotes.push(`Feedback: ${q.feedback}`);
            if (reviewNotes.length) {
              children.push(makeBold('Review Notes', reviewNotes.join(' '), { compact: true, keepLines: false }));
            }
          }
        }
        // Separate quizzes inside a bundled document, but never append an
        // empty spacer after the final quiz. When a long answer key lands
        // exactly at the bottom margin, Word/LibreOffice can push that final
        // empty paragraph onto a completely blank trailing page.
        if (quizIndex < quizzes.length - 1) {
          children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
        }
      }
      break;
    }

    // ─── DISCUSSIONS ────────────────────────────────────────────
    case 'discussions': {
      const expanded = expandKeys('discussions', data);
      for (const d of renderedDeliverableCollection('discussions', expanded)) {
        children.push(makeHeading(d.lessonTitle || 'Discussion'));
        const dMeta = [d.bloomsLevel, d.format, d.estimatedDuration].filter(Boolean);
        if (dMeta.length) children.push(makeMeta(dMeta.join('  ·  ')));
        // v0.12.1: the prompt is the one thing students must read — render it
        // as a shaded callout instead of another label paragraph.
        if (d.prompt) children.push(makeCallout('Prompt', d.prompt));
        if (d.context) children.push(makeBold('Context', d.context));
        if (d.evidenceRequirement) children.push(makeBold('Evidence Requirement', d.evidenceRequirement));
        if (d.sourceArtifacts?.length) {
          children.push(makeSubHeading('Source Artifacts'));
          d.sourceArtifacts
            .map(formatSourceArtifact)
            .filter(Boolean)
            .forEach((artifact) => children.push(makeBullet(artifact)));
        }
        // Follow-up probes
        if (d.followUpProbes?.length) {
          children.push(makeSubHeading('Follow-Up Probes'));
          d.followUpProbes.forEach((p) => children.push(makeBullet(p)));
        }
        // Facilitation tips
        if (d.facilitationTips) {
          children.push(makeSubHeading('Facilitation Tips'));
          if (d.facilitationTips.opening) children.push(makeBold('Opening', d.facilitationTips.opening));
          if (d.facilitationTips.ifStalls) children.push(makeBold('If Stalls', d.facilitationTips.ifStalls));
          if (d.facilitationTips.ifDominates) children.push(makeBold('If Dominates', d.facilitationTips.ifDominates));
          if (d.facilitationTips.closure) children.push(makeBold('Closure', d.facilitationTips.closure));
        }
        // Response starters
        if (d.responseStarters?.length) {
          children.push(makeSubHeading('Response Starters'));
          d.responseStarters.forEach((s) => children.push(makeBullet(s)));
        }
        // Evaluation criteria
        if (d.evaluationCriteria?.length) {
          children.push(makeSubHeading('Evaluation Criteria'));
          d.evaluationCriteria.forEach((c) => children.push(makeBullet(c)));
        }
        const closingGuidance = [
          ['Equity Considerations', d.equityConsiderations],
          ['Guidelines', d.guidelines],
          ['Follow-up', d.followUp],
        ].filter(([, value]) => String(value || '').trim());
        if (closingGuidance.length) children.push(makeCompactLabeledList(closingGuidance, { compact: true }));
      }
      break;
    }

    // ─── ASSIGNMENTS ────────────────────────────────────────────
    case 'assignments': {
      const expanded = expandKeys('assignments', data);
      const assignments = renderedDeliverableCollection('assignments', expanded);
      if (assignments.length === 0) {
        const lesson = inferLessonFromExportTitle(exportTitle);
        const lessonRef = lesson.lessonNumber ? `Course Map L${lesson.lessonNumber}` : 'Course Map';
        children.push(makeHeading('No standalone assignment brief scheduled'));
        children.push(makeMeta(['Handoff note', lessonRef, lesson.lessonTitle].filter(Boolean).join('  ·  ')));
        children.push(
          makeBold('Status', 'No submitted assignment brief was generated for this lesson in the current package.'),
        );
        children.push(
          makeBold(
            'Instructor handoff',
            'Use the lesson plan for in-class activities and the quiz or exam bank for exams. If the Course Map promised a dedicated submitted artifact, add or regenerate that assignment before publishing.',
          ),
        );
        children.push(makeSubHeading('Review Checklist'));
        [
          `Confirm ${lessonRef} does not require a standalone student submission.`,
          `For ${lessonRef}, add a scored brief only when the Course Map promises submitted work.`,
          'Keep this note with the package so an empty DOCX is never mistaken for a finished assignment.',
        ].forEach((item) => children.push(makeBullet(item)));
        break;
      }
      for (const [assignmentIndex, a] of assignments.entries()) {
        children.push(makeHeading(a.title || 'Assignment'));
        const courseMapRef = a.courseMapRef ? String(a.courseMapRef).trim() : '';
        // v0.16.1: ONE weight per header. When the course-map stamp carries
        // any percent (the assessment registry row's weight), it is the
        // authoritative figure — a separate percentOfGrade could disagree
        // ("100 PTS · 5% · Course Map L4 · A4.1 · 4%") after older saves
        // re-normalized brief weights. Never render two percents.
        const courseMapRefShowsPercent = /\d+(?:\.\d+)?\s*%/.test(courseMapRef);
        const aMeta = [
          a.assignmentType,
          a.bloomsLevel,
          a.dueWeek || a.dueDate,
          a.estimatedTime,
          a.totalPoints && `${a.totalPoints} pts`,
          courseMapRefShowsPercent ? null : a.percentOfGrade,
          // v0.14.1 (3.3b): the reverse stamp — "Course Map L8 · A8.1 · 5%"
          // ties the brief back to the map cell that promised it.
          a.courseMapRef,
        ].filter(Boolean);
        if (aMeta.length) children.push(makeMeta(aMeta.join('  ·  ')));
        if (a.relatedLessons?.length) children.push(makeBold('Related Lessons', a.relatedLessons.join(', ')));
        if (a.overview) children.push(makeBold('Overview', a.overview));
        if (a.description) children.push(makeBold('Description', a.description));
        if (a.activityPacket) {
          const packet = a.activityPacket;
          children.push(makeSubHeading('Activity Briefing'));
          if (packet.activityType) children.push(makeBold('Activity Type', packet.activityType));
          if (packet.scenario) children.push(makeBold('Situation', packet.scenario));
          if (packet.safetyBoundary) children.push(makeCallout('Safety and evidence boundary', packet.safetyBoundary));
          if (packet.evidence?.length) {
            children.push(makeSubHeading('Inspect Before Acting'));
            packet.evidence.forEach((item) => children.push(makeBullet(item)));
          }
          if (packet.roles?.length) {
            children.push(makeSubHeading('Participant or Working Roles'));
            packet.roles.forEach((role) => {
              if (role.goal) children.push(makeBold(role.name || 'Activity role', role.goal, { keepNext: true }));
              if (role.constraint) children.push(makeBold('Constraint', role.constraint, { keepNext: true }));
              if (role.privateInformation) children.push(makeCallout('Role-only information', role.privateInformation));
            });
          }
          if (packet.phases?.length) {
            children.push(makeSubHeading('Phases and Updates'));
            packet.phases.forEach((phase) => {
              if (phase.information)
                children.push(makeBold(phase.title || 'Activity phase', phase.information, { keepNext: true }));
              if (phase.requiredDecision)
                children.push(makeBold('Required decision or action', phase.requiredDecision));
            });
          }
          if (packet.timing?.length) {
            children.push(makeSubHeading('Activity Clock'));
            packet.timing.forEach((row, index) =>
              children.push(makeNumbered(index + 1, `${row.phase} — ${row.minutes} minutes`)),
            );
            children.push(makeBold('Total time', `${packet.totalMinutes} minutes`));
          }
          if (packet.activityLogFields?.length) {
            children.push(makeSubHeading('Activity Log'));
            children.push(
              makeText(
                'Record one row whenever the evidence, constraint, decision, action, or interpretation changes.',
              ),
            );
            packet.activityLogFields.forEach((field) => children.push(makeBullet(field)));
          }
          if (packet.artifact?.title) {
            children.push(makeSubHeading('Student Artifact'));
            children.push(makeBold('Artifact', packet.artifact.title));
            packet.artifact.requirements?.forEach((requirement, index) =>
              children.push(makeNumbered(index + 1, requirement)),
            );
          }
          if (packet.debriefPrompts?.length) {
            children.push(makeSubHeading('Debrief'));
            packet.debriefPrompts.forEach((prompt) => children.push(makeBullet(prompt)));
          }
        }
        // v0.14.1 (3.2c): oral prompt sheets carry their speaking tasks.
        if (Array.isArray(a.speakingPrompts) && a.speakingPrompts.length > 0) {
          children.push(makeSubHeading('Speaking Prompts'));
          a.speakingPrompts.forEach((prompt) => children.push(makeBullet(prompt)));
        }
        // Preserve the complete objective contract in structured data, but
        // render an objective only once when an exact plan-bound instruction
        // already carries it. Duplicate declarations are not additional
        // instructional evidence and fail the independent coherence audit.
        const normalizedAssignmentIdentity = (value) =>
          String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const exactInstructionDeclarations = new Set(
          (Array.isArray(a.instructions) ? a.instructions : [])
            .map((instruction) =>
              normalizedAssignmentIdentity(typeof instruction === 'string' ? instruction : instruction?.step),
            )
            .filter(Boolean),
        );
        const renderedObjectives = (Array.isArray(a.objectives) ? a.objectives : []).filter(
          (objective) => !exactInstructionDeclarations.has(normalizedAssignmentIdentity(objective)),
        );
        if (renderedObjectives.length) {
          children.push(makeSubHeading('Learning Objectives'));
          renderedObjectives.forEach((o) => children.push(makeBullet(o)));
        }
        if (a.sourceEvidenceBrief?.claims?.length) {
          children.push(makeSubHeading('Assigned Evidence Packet'));
          a.sourceEvidenceBrief.claims.forEach((claim) => children.push(makeBullet(claim)));
          if (a.sourceEvidenceBrief.sources?.length) {
            children.push(makeBold('Use these retained sources', ''));
            a.sourceEvidenceBrief.sources.forEach((source) => children.push(makeBullet(formatEvidenceSource(source))));
          }
        }
        if (a.workedExample?.problem) {
          children.push(makeSubHeading('Operation-Qualified Worked Example'));
          if (a.workedExample.studentTask) children.push(makeBold('Your task', a.workedExample.studentTask));
          children.push(makeText(a.workedExample.problem));
          if (a.workedExample.inputs?.length) {
            children.push(makeBold('Inputs', ''));
            a.workedExample.inputs.forEach((input) => children.push(makeBullet(input)));
          }
          (a.workedExample.steps || []).forEach((step, index) => children.push(makeNumbered(index + 1, step)));
          if (a.workedExample.result) children.push(makeCallout('Result', a.workedExample.result));
          if (a.workedExample.interpretation) children.push(makeBold('Interpretation', a.workedExample.interpretation));
          if (a.workedExample.boundary) children.push(makeCallout('Boundary', a.workedExample.boundary));
          if (a.workedExample.transferTask) children.push(makeBold('Your variation', a.workedExample.transferTask));
        }
        if (a.instructions?.length) {
          children.push(makeSubHeading('Instructions'));
          a.instructions.forEach((inst, j) => {
            const raw = typeof inst === 'string' ? inst : inst.step || '';
            // Strip leading "1. " prefix that AI sometimes includes (prevents "1. 1." double-numbering)
            const stripped = raw.replace(/^\d+\.\s*/, '');
            children.push(makeNumbered(j + 1, stripped));
          });
        }
        // Format requirements — v0.12.1: a two-column table instead of five
        // glued label paragraphs.
        if (a.formatRequirements) {
          children.push(makeSubHeading('Format Requirements'));
          const fr = a.formatRequirements;
          const frPairs = [
            ['Length', fr.length],
            ['Format', fr.format],
            ['Citation Style', fr.citationStyle],
            ['Submission', fr.submissionPlatform],
            ['Late Policy', fr.latePolicy],
          ].filter(([, v]) => v);
          if (frPairs.length) {
            children.push(makeKeyValueTable(frPairs, { headers: ['Requirement', 'Course expectation'] }));
          }
        }
        if (a.deliverables?.length) {
          children.push(makeSubHeading('Deliverables'));
          a.deliverables.forEach((d) => children.push(makeBullet(typeof d === 'string' ? d : d.name || '')));
        }
        if (a.submissionFormat) children.push(makeBold('Submission Format', a.submissionFormat));
        // gradingCriteria is an array of criterion names; rendering it as a
        // bold label with no value left an empty "Grading Criteria:" line.
        if (Array.isArray(a.gradingCriteria) && a.gradingCriteria.length > 0) {
          children.push(makeSubHeading('Grading Criteria'));
          a.gradingCriteria.forEach((criterion) =>
            children.push(makeBullet(typeof criterion === 'string' ? criterion : criterion?.criterion || '')),
          );
        } else if (a.gradingCriteria && typeof a.gradingCriteria === 'string') {
          children.push(makeBold('Grading Criteria', a.gradingCriteria));
        }
        if (a.progressTracking) children.push(makeBold('Progress Tracking', a.progressTracking));
        if (a.accessibilityAndUDL) children.push(makeBold('Accessibility & UDL', a.accessibilityAndUDL));
        if (a.selfAssessmentRubric?.length) {
          children.push(makeSubHeading('Student Self-Assessment'));
          a.selfAssessmentRubric.forEach((item) => children.push(makeBullet(item)));
        }
        if (a.anchorExampleGuidance?.length) {
          children.push(makeSubHeading('Anchor Samples and Revision Check'));
          a.anchorExampleGuidance.forEach((item) => children.push(makeBullet(item, { compact: true })));
        }
        if (a.feedbackLoop) children.push(makeBold('Feedback Loop', a.feedbackLoop));
        // The lesson plan owns scaffolding milestones. Repeating them in each
        // assignment brief duplicates the workflow and can create a sparse
        // policy-only tail page after the actual student directions.
        // Do not repeat package-wide support and integrity boilerplate at the
        // end of every lesson brief. The syllabus owns those policies; a
        // repeated one-line handoff created an otherwise empty final page in
        // real DOCX renders without adding lesson-specific direction.
        // Keep visual separation between briefs, but do not append a spacer
        // after the final brief. A trailing empty paragraph can be pushed onto
        // a fifth page when a dense activity packet ends near the page
        // boundary, producing an otherwise blank exported page.
        if (assignmentIndex < assignments.length - 1) {
          children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
        }
      }
      break;
    }

    // ─── STUDY GUIDES ───────────────────────────────────────────
    case 'studyGuides': {
      const expanded = expandKeys('studyGuides', data);
      const studyGuides = renderedDeliverableCollection('studyGuides', expanded);
      for (const [guideIndex, g] of studyGuides.entries()) {
        children.push(makeHeading(g.lessonTitle || 'Study Guide'));
        if (g.examScope) children.push(makeText(g.examScope));
        if (g.learningObjectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          g.learningObjectives.forEach((objective) => children.push(makeBullet(objective)));
        }
        if (g.objectivePractice?.length) {
          children.push(makeSubHeading('Practice the Objectives'));
          g.objectivePractice.forEach((move) => children.push(makeBullet(move)));
        }
        if (g.assignedReadings?.length) {
          children.push(makeSubHeading('Assigned Readings'));
          g.assignedReadings.forEach((reading) => children.push(makeBullet(reading)));
        }
        if (g.summary) {
          children.push(makeSubHeading('Concept Summary'));
          children.push(makeText(g.summary));
        }
        if (g.sourceEvidenceBrief?.claims?.length) {
          children.push(makeSubHeading('Evidence Ledger'));
          g.sourceEvidenceBrief.claims.forEach((claim) => children.push(makeBullet(claim)));
          if (g.sourceEvidenceBrief.sources?.length) {
            children.push(makeBold('Study from', ''));
            g.sourceEvidenceBrief.sources.forEach((source) => children.push(makeBullet(formatEvidenceSource(source))));
          }
        }
        if (g.keyTerms?.length) {
          children.push(makeSubHeading('Key Terms'));
          // v0.12.1: a real two-column definition table instead of glued
          // label-value paragraphs.
          children.push(
            makeKeyValueTable(
              g.keyTerms.map((t) => {
                const parts = [t.definition || ''];
                if (t.example) parts.push(`Example: ${t.example}`);
                // CurriculumOS: genome-linked terms carry a source citation —
                // render the receipt instructors trust ("Source: OpenStax …").
                if (t.source) parts.push(`Source: ${t.source}`);
                return [t.term || '', parts.join(' — ')];
              }),
              { headers: ['Term', 'Definition'] },
            ),
          );
        }
        // v0.14.5 (F2): language-course dialogue practice, right after the
        // key terms it draws its vocabulary from.
        if (g.dialoguePractice?.turns?.length) {
          children.push(makeSubHeading('Dialogue Practice'));
          if (g.dialoguePractice.intro) children.push(makeText(g.dialoguePractice.intro));
          g.dialoguePractice.turns.forEach((turn) =>
            children.push(makeBullet(`${turn.speaker}: ${turn.line}${turn.rm ? ` (${turn.rm})` : ''}`)),
          );
        }
        // v0.13.3: the worked example students study from.
        if (g.workedExample?.problem) {
          children.push(makeSubHeading('Worked Example'));
          if (g.workedExample.studentTask) children.push(makeBold('Practice task', g.workedExample.studentTask));
          if (g.workedExample.problem !== g.workedExample.studentTask) children.push(makeText(g.workedExample.problem));
          (g.workedExample.steps || []).forEach((step, si) => children.push(makeNumbered(si + 1, step)));
          if (g.workedExample.result) children.push(makeCallout('Result', g.workedExample.result));
          if (g.workedExample.interpretation) children.push(makeBold('Interpretation', g.workedExample.interpretation));
          if (g.workedExample.boundary) children.push(makeCallout('Boundary', g.workedExample.boundary));
          if (g.workedExample.transferTask) children.push(makeBold('Try the variation', g.workedExample.transferTask));
        }
        // How to reason about this structure (metacognitive scaffold)
        if (g.reasoningRoutine?.length) {
          children.push(makeSubHeading('How to Reason About This'));
          g.reasoningRoutine.forEach((r) => children.push(makeBullet(r.howToReason || '')));
        }
        // Concept connections
        if (g.conceptConnections?.length) {
          children.push(makeSubHeading('Concept Connections'));
          g.conceptConnections.forEach((c) =>
            children.push(
              makeBullet(typeof c === 'string' ? c : `${c.from || ''} ↔ ${c.to || ''}: ${c.relationship || ''}`),
            ),
          );
        }
        // Common misconceptions
        if (g.commonMisconceptions?.length) {
          children.push(makeSubHeading('Common Misconceptions'));
          g.commonMisconceptions.forEach((m) => {
            if (typeof m === 'string') {
              children.push(makeBullet(m));
              return;
            }
            if (m.correction) {
              children.push(makeBold('Misconception', m.misconception || '', { keepNext: true, keepLines: true }));
              children.push(makeCallout('Correction', m.correction, { keepLines: true }));
            } else {
              children.push(makeBold('Misconception', m.misconception || ''));
            }
          });
        }
        // Review questions
        if (g.reviewQuestions?.length) {
          children.push(makeSubHeading('Review Questions'));
          g.reviewQuestions.forEach((q, j) => {
            if (typeof q === 'string') {
              children.push(makeNumbered(j + 1, q));
              return;
            }
            const bloomLabel = q.bloomsLevel ? ` (Bloom: ${q.bloomsLevel})` : '';
            // A review question and its hint form one instructional unit.
            // Keeping the pair together prevents Word from stranding the hint
            // on a sparse continuation page while the question remains above.
            children.push(makeNumbered(j + 1, `${q.question || q}${bloomLabel}`, { keepNext: Boolean(q.hint) }));
            if (q.hint)
              children.push(
                makeItalic(`Hint: ${q.hint}`, {
                  keepLines: true,
                  // Keep the final two review prompts together. This moves one
                  // complete question unit to a continuation page when needed
                  // instead of leaving only the last prompt and recap there.
                  keepNext: j === g.reviewQuestions.length - 2,
                }),
              );
          });
        }
        if (g.reviewQuestions?.some((q) => q?.answer)) {
          children.push(makeSubHeading('Practice Answer Key'));
          g.reviewQuestions.forEach((q, j) => {
            if (!q?.answer) return;
            children.push(makeNumbered(j + 1, q.answer, { keepNext: Boolean(q.successCriteria?.length) }));
            (q.successCriteria || []).forEach((criterion) => children.push(makeBullet(criterion)));
          });
        }
        // Practice activities
        if (g.practiceActivities?.length) {
          children.push(makeSubHeading('Practice Activities'));
          g.practiceActivities.forEach((a) => children.push(makeBullet(typeof a === 'string' ? a : a.activity || '')));
        }
        // Exam prep
        if (g.examPrep) {
          const renderedKeyTerms = new Set(
            (g.keyTerms || [])
              .map((term) =>
                String(term?.term || '')
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean),
          );
          const newExamTopics = Array.isArray(g.examPrep.keyTopicsToKnow)
            ? g.examPrep.keyTopicsToKnow.filter((topic) => {
                const label = typeof topic === 'string' ? topic : JSON.stringify(topic);
                return !renderedKeyTerms.has(
                  String(label || '')
                    .trim()
                    .toLowerCase(),
                );
              })
            : [];
          const isSimpleExamValue = (value) =>
            value == null ||
            typeof value === 'string' ||
            (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
          const compactExamPrep =
            isSimpleExamValue(g.examPrep.keyTopicsToKnow) &&
            isSimpleExamValue(g.examPrep.commonErrors) &&
            isSimpleExamValue(g.examPrep.reviewStrategy) &&
            isSimpleExamValue(g.examPrep.timeManagement);
          if (compactExamPrep) {
            const reviewTarget = /(?:in|for)\s+the\s+([^.!?]+)[.!?]?$/i.exec(g.examPrep.reviewStrategy || '')?.[1];
            const guideLabel = String(g.lessonTitle || g.title || `study guide ${guideIndex + 1}`).trim();
            const compactReview = `For ${guideLabel}, compare the two source claims; record what they support, what remains unproven, and the revision required${
              reviewTarget ? ` in the ${reviewTarget}` : ''
            }.`;
            const listText = (value) => (Array.isArray(value) ? value.join('; ') : String(value || '').trim());
            const normalizeExamText = (value) =>
              String(value || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[.!?]+$/g, '');
            const renderedMisconceptionText = new Set(
              (g.commonMisconceptions || [])
                .flatMap((entry) => (typeof entry === 'string' ? [entry] : [entry?.misconception, entry?.correction]))
                .map(normalizeExamText)
                .filter(Boolean),
            );
            const uniqueCommonErrors = (
              Array.isArray(g.examPrep.commonErrors) ? g.examPrep.commonErrors : [g.examPrep.commonErrors]
            ).filter((entry) => {
              const normalized = normalizeExamText(entry);
              return normalized && !renderedMisconceptionText.has(normalized);
            });
            const compactParts = [
              newExamTopics.length ? `Key topics: ${newExamTopics.join('; ')}.` : '',
              uniqueCommonErrors.length ? `Common errors: ${listText(uniqueCommonErrors)}` : '',
              g.examPrep.reviewStrategy
                ? `Review strategy: ${newExamTopics.length === 0 ? compactReview : listText(g.examPrep.reviewStrategy)}`
                : '',
              g.examPrep.timeManagement ? `Time management: ${listText(g.examPrep.timeManagement)}` : '',
            ].filter(Boolean);
            if (compactParts.length) {
              // Exam preparation is a terminal recap, not a new teaching
              // chapter. Preserve every non-duplicated field in one labeled
              // paragraph so Word cannot strand a short list and two labels
              // on an otherwise empty final page.
              children.push(makeBold('Exam Preparation', compactParts.join(' '), { compact: true, keepLines: true }));
            }
          } else {
            children.push(makeSubHeading('Exam Preparation'));
            if (newExamTopics.length) {
              children.push(makeBold('Key Topics', ''));
              newExamTopics.forEach((t) => children.push(makeBullet(typeof t === 'string' ? t : JSON.stringify(t))));
            }
            if (Array.isArray(g.examPrep.commonErrors) && g.examPrep.commonErrors.length) {
              children.push(makeBold('Common Errors', ''));
              g.examPrep.commonErrors.forEach((e) =>
                children.push(makeBullet(typeof e === 'string' ? e : JSON.stringify(e))),
              );
            } else if (typeof g.examPrep.commonErrors === 'string') {
              children.push(makeBold('Common Errors', g.examPrep.commonErrors));
            }
            if (g.examPrep.reviewStrategy)
              children.push(
                makeBold(
                  'Review Strategy',
                  typeof g.examPrep.reviewStrategy === 'string'
                    ? g.examPrep.reviewStrategy
                    : JSON.stringify(g.examPrep.reviewStrategy),
                ),
              );
            if (g.examPrep.timeManagement)
              children.push(
                makeBold(
                  'Time Management',
                  typeof g.examPrep.timeManagement === 'string'
                    ? g.examPrep.timeManagement
                    : JSON.stringify(g.examPrep.timeManagement),
                ),
              );
          }
        }
        // Legacy examTips
        if (g.examTips && !g.examPrep) children.push(makeBold('Exam Tips', g.examTips));
        // Connection to next
        if (g.connectionToNext) children.push(makeBold('Connection to Next Lesson', g.connectionToNext));
        // A final empty spacer can be pushed onto a new page when a guide
        // finishes near the boundary, producing an otherwise blank last page.
        if (guideIndex < studyGuides.length - 1) {
          children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
        }
      }
      break;
    }

    // ─── SYLLABUS ───────────────────────────────────────────────
    case 'syllabus': {
      const syl = data.syllabus || data;
      // v0.16.1 (Linear Algebra package audit): the v0.12.1 TableOfContents
      // field is REMOVED. Its field-instruction text (`TOC \h \o "1-3"`)
      // shipped as visible body text in every non-Word renderer and text
      // extractor, and the document never set updateFields, so even Word
      // showed an unpopulated field until a manual refresh. Heading styles
      // already give Word's navigation pane a full outline; no TOC field
      // means no raw field code can leak into the body.
      // Course info — a tidy two-column table instead of stacked lines.
      const infoPairs = [
        ['Semester', syl.semester],
        ['Credits', syl.credits],
        ['Meeting', syl.meetingPattern],
        ['Location', syl.location],
        ['Delivery', syl.deliveryMode],
        ['Prerequisites', syl.prerequisites],
      ].filter(([, v]) => v);
      if (infoPairs.length) children.push(makeKeyValueTable(infoPairs, { headers: ['Course detail', 'Value'] }));
      // Instructor info
      const instrPairs = [
        ['Instructor', syl.instructor],
        ['Email', syl.instructorEmail],
        ['Office Hours', syl.officeHours],
        ['Office', syl.officeLocation],
      ].filter(([, v]) => v);
      if (instrPairs.length) {
        children.push(makeHeading('Instructor Information'));
        children.push(makeKeyValueTable(instrPairs, { headers: ['Instructor detail', 'Value'] }));
      }
      if (syl.instructorBio) {
        children.push(makeSubHeading('Instructor Bio'));
        children.push(makeText(syl.instructorBio));
      }
      if (syl.courseDescription) {
        children.push(makeHeading('Course Description'));
        children.push(makeText(syl.courseDescription));
      }
      if (syl.signatureExperience) {
        children.push(makeHeading(syl.signatureExperience.title || 'Signature Course Experience'));
        if (syl.signatureExperience.summary) children.push(makeText(syl.signatureExperience.summary));
        if (syl.signatureExperience.logExpectation)
          children.push(makeBold('Observing Log', syl.signatureExperience.logExpectation));
        if (syl.signatureExperience.fallback)
          children.push(makeBold('Cloudy-Night Option', syl.signatureExperience.fallback));
        if (syl.signatureExperience.safety) children.push(makeItalic(`Safety: ${syl.signatureExperience.safety}`));
      }
      if (syl.gettingStarted) {
        children.push(makeHeading('Getting Started'));
        children.push(makeText(syl.gettingStarted));
      }
      if (syl.learnerIntroActivity) {
        children.push(makeHeading('Learner Introduction Activity'));
        children.push(makeText(syl.learnerIntroActivity));
      }
      if (syl.learningOutcomes?.length) {
        children.push(makeHeading('Student Learning Outcomes'));
        children.push(makeText('Upon successful completion of this course, students will be able to:'));
        // v0.12.1: numbered lines, not bullets-with-manual-numbers — the old
        // combination rendered the double marker "● 1. Explain…".
        syl.learningOutcomes.forEach((o, i) =>
          children.push(makeNumbered(i + 1, String(o || '').replace(/^\d+[a-z]?[.)]\s+/i, ''))),
        );
      }
      if (syl.outcomeAlignmentMatrix?.length) {
        children.push(makeHeading('Outcome & Assessment Alignment'));
        const usesOutcomeIds = syl.outcomeAlignmentMatrix.every((row) => row?.outcomeId);
        children.push(
          makeTableFn(
            [3900, 1100, 2180, 2180],
            [usesOutcomeIds ? 'Outcome ID' : 'Outcome', "Bloom's", 'Practiced In', 'Assessed By'],
            syl.outcomeAlignmentMatrix.map((row) => [
              row.outcomeId || row.outcome || '',
              row.bloomsLevel || '',
              Array.isArray(row.practicedIn)
                ? row.practicedIn.map((value) => String(value || '').replace(/[.;:,]+$/g, '')).join('; ')
                : row.practicedIn || '',
              Array.isArray(row.assessedBy)
                ? row.assessedBy.map((value) => String(value || '').replace(/[.;:,]+$/g, '')).join('; ')
                : row.assessedBy || '',
            ]),
            { cantSplit: true },
          ),
        );
      }
      if (syl.requiredTexts?.length) {
        children.push(makeHeading('Required Texts & Materials'));
        syl.requiredTexts.forEach((t) => children.push(makeBullet(formatRequiredText(t))));
      }
      // Course Requirements
      const reqs = normalizeCourseRequirements(syl.courseRequirements, syl.gradingPolicy);
      if (reqs.length) {
        children.push(makeHeading('Course Requirements & Grading'));
        if (syl.courseRequirementWeightNote) {
          children.push(makeText(syl.courseRequirementWeightNote));
        }
        const hasDesc = reqs.some((r) => r.description);
        if (hasDesc) {
          children.push(
            makeTableFn(
              [2810, 1120, 5430],
              ['Component', 'Weight', 'Description'],
              reqs.map((g) => [g.name || g.component || '', g.weight || '', g.description || '']),
            ),
          );
        } else {
          children.push(
            makeTableFn(
              [7020, 2340],
              ['Component', 'Weight'],
              reqs.map((g) => [g.name || g.component || '', g.weight || '']),
            ),
          );
        }
      }
      if (syl.gradingScale?.length) {
        children.push(makeHeading('Grading Scale'));
        // Two grade/range pairs per row keeps the table compact.
        const scalePairs = [];
        for (let gi = 0; gi < syl.gradingScale.length; gi += 2) {
          const left = syl.gradingScale[gi];
          const right = syl.gradingScale[gi + 1];
          // v0.12.1: an odd-length scale used to leave two blank cells on the
          // last row — print an em dash so the row reads as intentional.
          scalePairs.push([left?.grade || '', left?.range || '', right?.grade || '—', right?.range || '—']);
        }
        children.push(makeTableFn([1170, 3510, 1170, 3510], ['Grade', 'Range', 'Grade', 'Range'], scalePairs));
      }
      // Course Schedule
      if (syl.weeklySchedule?.length) {
        children.push(makeHeading('Course Schedule'));
        // v0.12.1: a Dates column that merely repeats the Week label rendered
        // as "Week 1 || Week 1" — only keep it when it adds information.
        const hasDates = syl.weeklySchedule.some((w) => w.dates && w.dates !== w.week);
        const headers = hasDates
          ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments']
          : ['Week', 'Topic', 'Readings', 'Assignments'];
        const wsDXA = hasDates ? [780, 1200, 2500, 2440, 2440] : [936, 2995, 2810, 2619];
        // v0.15.188 grounding slice 1: the Topic cell carries the week's core
        // ideas and key vocabulary — the kernel-derived fields existed on the
        // row since v0.15.187 but no exporter rendered them, so the schedule
        // a reviewer reads stayed title-only.
        const topicCell = (w) =>
          [w.topic || '', w.coreIdeas || '', w.keyVocabulary ? `Key terms: ${w.keyVocabulary}.` : '']
            .filter(Boolean)
            .join(' — ');
        children.push(
          makeTableFn(
            wsDXA,
            headers,
            syl.weeklySchedule.map((w) =>
              hasDates
                ? [
                    w.week || '',
                    (w.dates !== w.week && w.dates) || '',
                    topicCell(w),
                    w.readings || '',
                    w.assignments || '',
                  ]
                : [w.week || '', topicCell(w), w.readings || '', w.assignments || ''],
            ),
          ),
        );
      }
      // Let Word use the remaining page space before the policy block. The
      // heading already keeps with its first paragraph, so a forced break only
      // created sparse pages in long syllabi.
      const policySection = (heading, text) => {
        if (text) {
          children.push(makeHeading(heading));
          children.push(makeText(text));
        }
      };
      policySection('Attendance & Participation', syl.attendancePolicy);
      policySection('Late Work Policy', syl.latePolicy);
      policySection('Communication Policy', syl.communicationPolicy);
      policySection('Technology & Device Policy', syl.technologyPolicy);
      policySection('Technical Skills', syl.technicalSkills);
      policySection('Generative AI Policy', syl.aiPolicy);
      policySection('Academic Integrity', syl.academicIntegrity);
      policySection('Technical Support', syl.technicalSupport);
      policySection('Disability & Accessibility Accommodations', syl.accommodations);
      policySection('Mental Health & Wellness Resources', syl.mentalHealth);
      policySection('Title IX / Non-Discrimination', syl.titleIX);
      policySection('Student Support Services', syl.supportServices);
      policySection('Data Privacy', syl.dataPrivacy);
      // v0.13.5 P3: the accreditor-facing Methods Statement — the course's
      // evidence-based design patterns with full peer-reviewed references.
      if (syl.methodsStatement?.methods?.length) {
        children.push(makeHeading(syl.methodsStatement.title || 'Evidence-Based Course Design'));
        if (syl.methodsStatement.summary) children.push(makeText(syl.methodsStatement.summary));
        syl.methodsStatement.methods.forEach((method) => {
          children.push(makeSubHeading(method.label));
          if (method.claim) children.push(makeText(method.claim));
          // References are supporting apparatus, not primary instructional prose.
          // Keep every citation verbatim while setting them compactly so a short
          // appendix tail cannot strand one or two sources on an otherwise blank
          // final page.
          (method.references || []).forEach((reference) => children.push(makeBullet(reference, { compact: true })));
        });
      }
      // v0.14 P2: Course Competency Map — each concept to its Bloom level and
      // any curated standards codes, generated from the verified concepts.
      if (syl.competencyMap?.rows?.length) {
        children.push(makeHeading('Course Competency Map'));
        children.push(
          makeText(
            `Generated from this course's source-verified concepts. Bloom span: ${syl.competencyMap.bloomSpan.lowest}–${syl.competencyMap.bloomSpan.highest}.${
              syl.competencyMap.frameworks.length
                ? ` Standards frameworks: ${syl.competencyMap.frameworks.join(', ')}.`
                : ''
            }`,
          ),
        );
        const hasStandards = syl.competencyMap.rows.some((r) => r.standards.length);
        const headers = hasStandards
          ? ['Concept', 'Taught In', "Bloom's", 'Standards']
          : ['Concept', 'Taught In', "Bloom's"];
        const colDXA = hasStandards ? [3000, 2600, 1400, 2360] : [4000, 3360, 2000];
        children.push(
          makeTableFn(
            colDXA,
            headers,
            syl.competencyMap.rows.map((row) => {
              const base = [row.concept, row.lesson, row.bloom];
              if (hasStandards) base.push(row.standards.map((s) => `${s.framework} ${s.code}`).join('; ') || '—');
              return base;
            }),
          ),
        );
      }
      // v0.13.5 P4: Sources & Licenses appendix — every open resource with
      // its license and attribution, generated for CC BY compliance.
      if (syl.sourcesAndLicenses?.groups?.length) {
        // Source appendices are supporting apparatus and often follow a dense
        // methods/policy block. Keep the real Heading 2 semantics while using
        // a compact print rhythm so one final citation does not become a
        // one-line spill page. This policy is course-agnostic and preserves
        // every source, license, URL, and attribution verbatim.
        const attributableSourceGroups = syl.sourcesAndLicenses.groups
          .map((group) => ({
            ...group,
            entries: (group.entries || []).filter((entry) => entry?.url || entry?.license),
          }))
          .filter((group) => group.entries.length > 0);
        const attributableSourceCount = attributableSourceGroups.reduce(
          (count, group) => count + group.entries.length,
          0,
        );
        // A short source appendix should be easy to audit, not compressed into
        // a tiny band at the top of its final page. Give each citation and its
        // rights statement separate readable lines through eleven sources;
        // retain the compact form for long bibliographies so pagination stays
        // bounded. The threshold depends only on appendix size, never course
        // identity or subject matter.
        const useAuditFriendlySourceBlocks = attributableSourceCount <= 11;
        const useCompactSourceRows = attributableSourceCount >= 12 && attributableSourceCount < 20;
        // Never print an empty appendix heading. The compiler can preserve
        // source provenance entries that have neither a public URL nor a
        // redistributable license; those remain internal evidence, but an
        // instructor-facing “Sources & Licenses” page with no citations is a
        // misleading and visibly blank artifact.
        if (attributableSourceGroups.length > 0) {
          children.push(
            makeHeading(syl.sourcesAndLicenses.title || 'Sources & Licenses', {
              compact: !useAuditFriendlySourceBlocks,
              // Mid-sized appendices use one compact bullet per source and
              // are substantial enough to justify a clean page. Short,
              // audit-friendly appendices must instead consume the space
              // remaining after the methods references; forcing those seven
              // to eleven entries onto a new page can strand one or two
              // method citations on an otherwise empty page. Long appendices
              // are splittable and also continue naturally. The decision
              // depends only on bibliography length and rendering mode.
              pageBreakBefore: useCompactSourceRows,
            }),
          );
          if (syl.sourcesAndLicenses.note) children.push(makeText(syl.sourcesAndLicenses.note));
        }
        attributableSourceGroups.forEach((group) => {
          children.push(makeSubHeading(group.label));
          const sharedLicenseTail = [group.license, group.attribution].filter(Boolean).join(' · ');
          if (sharedLicenseTail) {
            children.push(makeText(`License and attribution: ${withSentenceTerminator(sharedLicenseTail)}`));
          }
          const cohortKey = (entry) => {
            const owner = String(entry.attribution || '').replace(/\s*,\s*[“"][^”"]+[”"]\s*$/u, '');
            // normalizeEntries lifts a license shared by every source to the
            // group. Cohort detection must still see that license; otherwise
            // a dozen entries from one publisher repeat the same owner line
            // and can create a sparse bibliography spill page.
            const effectiveLicense = entry.license || group.license || '';
            return owner ? [effectiveLicense, owner].filter(Boolean).join(' · ') : '';
          };
          const cohortCounts = new Map();
          group.entries.forEach((entry) => {
            const key = cohortKey(entry);
            if (key) cohortCounts.set(key, (cohortCounts.get(key) || 0) + 1);
          });
          const sharedCohorts = new Set(
            [...cohortCounts.entries()].filter(([, count]) => count >= 2).map(([key]) => key),
          );
          sharedCohorts.forEach((key) =>
            children.push(
              makeText(
                `Shared rights statement for ${cohortCounts.get(key)} cited entries: ${key}. Article titles and URLs appear in the citations below.`,
              ),
            ),
          );
          const renderedEntries = group.entries.map((entry) => {
            const licenseTail = sharedCohorts.has(cohortKey(entry))
              ? ''
              : [entry.license, entry.attribution].filter(Boolean).join(' · ');
            return {
              citation: entry.citation,
              licenseTail,
            };
          });
          if (useAuditFriendlySourceBlocks) {
            renderedEntries.forEach(({ citation, licenseTail }) => {
              children.push(makeBullet(citation));
              if (licenseTail) {
                children.push(
                  makeItalic(`License and attribution: ${withSentenceTerminator(licenseTail)}`, { keepLines: true }),
                );
              }
            });
          } else if (useCompactSourceRows) {
            // Mid-sized appendices fit best as one compact, independently
            // scannable row per source. This gives a dedicated appendix page
            // enough visual structure to avoid becoming a shallow strip while
            // preserving every citation and rights tail verbatim.
            renderedEntries.forEach(({ citation, licenseTail }) =>
              children.push(makeBullet(`${citation}${licenseTail ? ` — ${licenseTail}` : ''}`, { compact: true })),
            );
          } else if (renderedEntries.length > 0) {
            // Long bibliographies are supporting apparatus. Flow their exact
            // citations through one compact, readable paragraph per source
            // group instead of treating every entry as an indivisible bullet.
            // The inline separators retain scanability while allowing Word to
            // use the final lines of a page; this prevents a handful of source
            // rows from becoming a mostly empty spill page.
            // A twelve-source appendix is already large enough that the
            // standard body rhythm can strand the final two or three citation
            // lines on an otherwise empty page. Use the proven long-list
            // rhythm from twelve entries onward; smaller appendices retain the
            // more generous setting. The rule depends only on bibliography
            // length and never on course identity or discipline.
            const bibliographySize =
              attributableSourceCount >= 36
                ? 15
                : attributableSourceCount >= 20
                  ? 16
                  : attributableSourceCount >= 12
                    ? 15
                    : 17;
            const bibliographyLine =
              attributableSourceCount >= 36
                ? 162
                : attributableSourceCount >= 20
                  ? 174
                  : attributableSourceCount >= 12
                    ? 162
                    : 184;
            children.push(
              new Paragraph({
                widowControl: true,
                spacing: { line: bibliographyLine, before: 0, after: 10 },
                children: renderedEntries.flatMap(({ citation, licenseTail }, index) => [
                  new TextRun({
                    text: `${index > 0 ? ' — ' : ''}${citation}${licenseTail ? ` — ${licenseTail}` : ''}`,
                    size: bibliographySize,
                    font: FONT,
                    color: '333333',
                  }),
                ]),
              }),
            );
          }
        });
      }
      const scheduleWeekLabels = new Set(
        (syl.weeklySchedule || [])
          .map((entry) =>
            String(entry?.week || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      );
      // A generic "Week N" milestone repeats the course schedule and is not
      // an important date. Preserve real calendar dates and milestones that
      // are not already represented by a schedule row.
      const distinctImportantDates = (syl.importantDates || []).filter((entry) => {
        const label = String(entry?.date || '').trim();
        return !(/^week\s+\d+$/i.test(label) && scheduleWeekLabels.has(label.toLowerCase()));
      });
      if (distinctImportantDates.length) {
        children.push(makeHeading('Important Dates'));
        children.push(
          makeTableFn(
            [1872, 7488],
            ['When', 'Milestone'],
            distinctImportantDates.map((d) => [d.date || '', d.event || '']),
          ),
        );
      }
      const maintenance = [syl.suggestedReviewDate, syl.contentOwnerGroup].filter(Boolean);
      if (maintenance.length) {
        children.push(makeHeading('Maintenance Notes'));
        if (syl.suggestedReviewDate) children.push(makeBold('Suggested Review Date', syl.suggestedReviewDate));
        if (syl.contentOwnerGroup) children.push(makeBold('Content Owner Group', syl.contentOwnerGroup));
      }
      break;
    }

    // ─── COURSE FAQ ───────────────────────────────────────────────
    case 'courseFaq': {
      const expanded = expandKeys('courseFaq', data);
      const faqs = renderedDeliverableCollection('courseFaq', expanded);
      for (const lesson of faqs) {
        const title = lesson.lessonTitle || lesson.title || 'FAQ';
        children.push(makeHeading(title));

        const questions = lesson.questions || [];
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi];
          // v0.12.1: questions are real Heading 3 entries (sentence case, not
          // the uppercase kicker) so the FAQ is navigable in Word's pane.
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_3,
              keepNext: true,
              // FAQ entries are short scan targets, so use a compact heading
              // rhythm. This preserves 11-point readable copy and navigation
              // semantics while preventing a single wrapped answer line from
              // becoming an orphan second page.
              spacing: { line: bodyLine, before: 140, after: 30 },
              children: [
                new TextRun({
                  text: `Q${qi + 1}. ${q.question || ''}`,
                  bold: true,
                  size: H3_SIZE,
                  font: FONT,
                  color: theme.headingColor,
                }),
              ],
            }),
          );
          // Keep related concepts with the answer instead of allowing a
          // standalone "See also" line to become an orphan final page.
          const relatedConcepts = Array.isArray(q.relatedConcepts)
            ? q.relatedConcepts.map((concept) => String(concept || '').trim()).filter(Boolean)
            : [];
          const answerWithRelatedConcepts = [
            q.answer || '',
            relatedConcepts.length ? `See also: ${relatedConcepts.join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' ');
          children.push(makeText(answerWithRelatedConcepts));
          if (q.studentAction) children.push(makeBold('Student Action', q.studentAction));
          if (q.assessmentConnection) children.push(makeItalic(`Assessment connection: ${q.assessmentConnection}`));
          if (q.accessibilitySupport) children.push(makeItalic(`Support: ${q.accessibilitySupport}`));
          if (q.concreteExample) children.push(makeItalic(`Example: ${q.concreteExample}`));
          if (q.instructorNote) children.push(makeItalic(`Instructor note: ${q.instructorNote}`));
        }
        // Tags are internal metadata — omit from student-facing export
      }
      break;
    }

    // ─── CUSTOM DELIVERABLES (generic) ───────────────────────────
    default: {
      const arrKey = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0);
      const items = arrKey ? data[arrKey] : [data];
      const headerKeys = new Set(['lessonTitle', 'title', 'name', 'weekNumber', 'week', 'tiers']);
      const toLabel = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());

      for (const item of items) {
        const title = item.lessonTitle || item.title || item.name || 'Item';
        const subtitle = item.weekNumber || item.week || '';
        children.push(makeHeading(subtitle ? `${title} — ${subtitle}` : title));

        for (const [k, v] of Object.entries(item)) {
          if (headerKeys.has(k) || isInternalExportMetadataKey(k) || v == null || v === '') continue;
          const label = toLabel(k);
          if (typeof v === 'string') {
            if (v.length < 100) {
              children.push(makeBold(label, v));
            } else {
              children.push(makeSubHeading(label));
              children.push(makeText(v));
            }
          } else if (Array.isArray(v)) {
            children.push(makeSubHeading(label));
            v.forEach((el) => {
              if (typeof el === 'string') {
                children.push(makeBullet(el));
              } else if (typeof el === 'object' && el !== null) {
                const parts = Object.entries(el)
                  .filter(([ek, val]) => !isInternalExportMetadataKey(ek) && val != null && val !== '')
                  .map(([ek, ev]) => `${toLabel(ek)}: ${typeof ev === 'string' ? ev : JSON.stringify(ev)}`);
                children.push(makeBullet(parts.join(' · ')));
              }
            });
          } else if (typeof v === 'object') {
            children.push(makeSubHeading(label));
            for (const [sk, sv] of Object.entries(v)) {
              if (isInternalExportMetadataKey(sk)) continue;
              if (sv != null && sv !== '')
                children.push(makeBold(toLabel(sk), typeof sv === 'string' ? sv : JSON.stringify(sv)));
            }
          } else {
            children.push(makeBold(label, String(v)));
          }
        }
      }
      break;
    }
  }
}

export async function exportDeliverableDocx(featureId, data, courseName) {
  const docx = await getDocx();
  const { Packer, BorderStyle } = docx;
  const saveAs = await getSaveAs();

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = buildDocxTitleChildren(docx, courseName, label, { compact: featureId === 'studyGuides' });

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER, exportTitle: courseName });

  const doc = buildDocxDocument(docx, children, {
    courseName,
    label,
    landscape: featureId === 'rubrics' && rubricDocxNeedsLandscape(data),
  });

  const blob = await Packer.toBlob(doc);
  await assertOfficeExportHasNoInternalText(blob, 'docx', label);
  const fileName = `${courseName || 'Course'} - ${label}.docx`;
  saveAs(blob, fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
