import { loadPdfLibs, getDocx, getSaveAs, isInternalExportMetadataKey, resolveFeatureLabel } from './exporterUtils.js';
import { expandKeys } from '../keyMaps.js';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector.js';
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
      metaColor: '7A869A',
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
const SINGLE_SP = 252;

function formatSourceArtifact(artifact) {
  if (typeof artifact === 'string') return artifact;
  return [artifact?.title || artifact?.name || artifact?.label, artifact?.locator, artifact?.use || artifact?.purpose]
    .filter(Boolean)
    .join(' — ');
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
      spacing: { after: 60 },
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
      spacing: { line: LINE_SP, after: 100 },
      children: [
        new TextRun({
          text: courseName || 'Course',
          bold: true,
          size: H1_SIZE,
          font: FONT_HEAD,
          color: theme.headingColor,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: theme.accent, space: 6 } },
      children: [],
    }),
  );
  return children;
}

export function buildDocxDocument(docx, children, { courseName, label, landscape = false }) {
  const { Document, Paragraph, TextRun, Footer, PageNumber, TabStopType, TabStopPosition, BorderStyle } = docx;
  const theme = activeTheme();
  // v0.12.1: explicit US Letter (the docx default is A4, which clipped every
  // fixed-width table in the v0.12 audit); rubrics render landscape so the
  // 6-column matrix gets usable column widths.
  const pageSize = landscape
    ? { width: 15840, height: 12240, orientation: 'landscape' }
    : { width: 12240, height: 15840 };
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
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
    sections: [{ properties: { page: { size: pageSize } }, footers: { default: footer }, children }],
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
  } = docx;

  const theme = activeTheme();

  const makeHeading = (text) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { line: LINE_SP, before: 420, after: 140 },
      // Accent bar in the left margin anchors each lesson section.
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: theme.accent, space: 10 } },
      children: [new TextRun({ text, bold: true, size: H2_SIZE, font: FONT_HEAD, color: theme.headingColor })],
    });
  const makeSubHeading = (text) =>
    new Paragraph({
      // Real heading level so section labels appear in Word's navigation
      // pane, TOCs, and screen-reader outlines instead of reading as bold
      // body text. Rendered as a tracked-uppercase kicker.
      heading: HeadingLevel.HEADING_3,
      keepNext: true,
      spacing: { line: SINGLE_SP, before: 280, after: 80 },
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
      spacing: { line: SINGLE_SP, before: 40, after: 80 },
      children: [new TextRun({ text: text || '', size: BODY_SIZE, font: FONT, color: '333333' })],
    });
  // Meta strip for the "90 min · Week 3"-style lines under a heading.
  const makeMeta = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 0, after: 140 },
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
  const makeBold = (label, text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 40, after: 60 },
      children: [
        // v0.12.1: an explicit "Label: value" separator — the old two-space
        // glue read as a typo in hundreds of paragraphs per package.
        new TextRun({
          text: `${String(label || '').replace(/[:\s]+$/, '')}: `,
          bold: true,
          size: BODY_SIZE,
          font: FONT,
          color: theme.headingColor,
        }),
        new TextRun({ text: text || '', size: BODY_SIZE, font: FONT, color: '404040' }),
      ],
    });
  // v0.12.1: borderless two-column layout table for label/value blocks
  // (study-guide key terms, lesson-plan assessment and homework, FAQ
  // see-also) — real structure instead of glued label paragraphs.
  const makeKeyValueTable = (pairs) => {
    const rows = pairs
      .filter(([k, v]) => k && v)
      .map(
        ([k, v]) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 2400, type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: theme.bandFill || 'F3F7FB' },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    spacing: { line: SINGLE_SP },
                    children: [
                      new TextRun({
                        text: String(k),
                        bold: true,
                        size: BODY_SIZE,
                        font: FONT,
                        color: theme.headingColor,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 6960, type: WidthType.DXA },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    spacing: { line: SINGLE_SP },
                    children: [new TextRun({ text: String(v), size: BODY_SIZE, font: FONT, color: '333333' })],
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
      rows,
    });
  };
  const makeBullet = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 50 },
      indent: { left: 360 },
      bullet: { level: 0 },
      children: [new TextRun({ text: text || '', size: BODY_SIZE, font: FONT, color: '333333' })],
    });
  const makeItalic = (text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 50 },
      indent: { left: 360 },
      children: [new TextRun({ text: text || '', italics: true, size: BODY_SIZE, font: FONT, color: theme.metaColor })],
    });
  const makeNumbered = (num, text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 20, after: 50 },
      indent: { left: 360 },
      children: [
        new TextRun({ text: `${num}. `, bold: true, size: BODY_SIZE, font: FONT, color: theme.accent }),
        new TextRun({ text: text || '', size: BODY_SIZE, font: FONT, color: '333333' }),
      ],
    });
  // Tinted callout strip with a tracked-uppercase label — used for answer
  // keys, misconception corrections, and other "stop and look" content.
  const makeCallout = (label, text) =>
    new Paragraph({
      spacing: { line: SINGLE_SP, before: 80, after: 120 },
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
        new TextRun({ text: text || '', size: BODY_SIZE, font: FONT, color: '333333', break: 1 }),
      ],
    });
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: theme.ruleColor };
  const makeTableFn = (colDXA, headerTexts, dataRows, { cantSplit = false } = {}) => {
    const hdr = new TableRow({
      tableHeader: true,
      children: headerTexts.map(
        (h, idx) =>
          new TableCell({
            width: { size: colDXA[idx], type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: theme.accent },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
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
                shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: theme.bandFill || 'F5F7FA' } : undefined,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                verticalAlign: 'top',
                children: [
                  new Paragraph({
                    spacing: { line: SINGLE_SP },
                    children: [new TextRun({ text: String(v || ''), size: BODY_SIZE, font: FONT, color: '333333' })],
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
      rows: [hdr, ...rows],
    });
  };

  switch (featureId) {
    // ─── LESSON PLANS ───────────────────────────────────────────
    case 'lessonPlans': {
      const expanded = expandKeys('lessonPlans', data);
      const key = expanded.plans ? 'plans' : 'lessonPlans';
      for (const p of expanded[key] || []) {
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
          p.assessmentBlock.forEach((entry) =>
            children.push(
              makeBullet(
                `${entry.title}${entry.weight === 'in class' ? ' — in class' : entry.weight ? ` (${entry.weight})` : ''}`,
              ),
            ),
          );
        }
        // Session Outline — as a table
        if (p.outline?.length) {
          children.push(makeSubHeading('Session Outline'));
          const colDXA = [1100, 2000, 6260]; // Time, Activity, Description
          const outlineRows = p.outline.map((row) => {
            let desc = row.description || '';
            if (row.grouping) desc += `${desc ? '\n' : ''}Grouping: ${row.grouping}`;
            if (row.instructorNotes || row.notes) desc += `\nInstructor Notes: ${row.instructorNotes || row.notes}`;
            const actParts = [row.activity || ''];
            if (row.type) actParts.push(row.type);
            if (row.bloomsLevel) actParts.push(`Bloom: ${row.bloomsLevel}`);
            return [row.time || '', actParts.filter(Boolean).join(' · '), desc];
          });
          children.push(makeTableFn(colDXA, ['Time', 'Activity', 'Description & Notes'], outlineRows));
        }
        // v0.13.3: the quantitative walkthrough — problem, numbered steps,
        // result callout — so "a concise worked example" is never a promise.
        if (p.workedExample?.problem) {
          children.push(makeSubHeading('Worked Example'));
          children.push(makeText(p.workedExample.problem));
          (p.workedExample.steps || []).forEach((step, si) => children.push(makeNumbered(si + 1, step)));
          if (p.workedExample.result) children.push(makeCallout('Result', p.workedExample.result));
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
          p.evidenceBase.forEach((entry) => {
            if (entry?.note) children.push(makeBold(entry.label || entry.move, entry.note));
          });
        }
        // v0.14 P1: prerequisite check — cited primers for genome
        // prerequisites this lesson builds on but the course never teaches.
        if (p.prerequisiteCheck?.primers?.length) {
          children.push(makeSubHeading('Prerequisite Check'));
          if (p.prerequisiteCheck.note) children.push(makeText(p.prerequisiteCheck.note));
          p.prerequisiteCheck.primers.forEach((primer) => {
            children.push(
              makeBold(primer.term, `${primer.definition}${primer.source ? ` (Source: ${primer.source})` : ''}`),
            );
            if (primer.keyFact) children.push(makeBullet(primer.keyFact));
            if (primer.why) children.push(makeItalic(primer.why));
          });
        }
        // Formative Assessment — v0.12.1: label/value pairs as a table.
        if (p.formativeCheck) {
          children.push(makeSubHeading('Formative Assessment'));
          const fcPairs = [
            ['Type', p.formativeCheck.type],
            ['Aligns to', p.formativeCheck.objectiveAligned],
          ].filter(([, v]) => v);
          if (fcPairs.length) children.push(makeKeyValueTable(fcPairs));
          if (p.formativeCheck.prompt) children.push(makeItalic(`"${p.formativeCheck.prompt}"`));
          if (p.formativeCheck.instructorAction)
            children.push(makeItalic(`Instructor Action: ${p.formativeCheck.instructorAction}`));
        }
        // UDL Notes
        if (p.udlNotes && (p.udlNotes.representation || p.udlNotes.engagement || p.udlNotes.expression)) {
          children.push(makeSubHeading('UDL Notes'));
          children.push(
            makeKeyValueTable(
              [
                ['Representation', p.udlNotes.representation],
                ['Engagement', p.udlNotes.engagement],
                ['Expression', p.udlNotes.expression],
              ].filter(([, v]) => v),
            ),
          );
        }
        // Homework
        if (p.homework) {
          children.push(makeSubHeading('Homework'));
          if (typeof p.homework === 'object') {
            if (p.homework.title) children.push(makeBold('Title', p.homework.title));
            if (p.homework.description) children.push(makeText(p.homework.description));
            const hwPairs = [
              ['Estimated Time', p.homework.estimatedTime],
              ['Connection to Next Lesson', p.homework.connectionToNext],
            ].filter(([, v]) => v);
            if (hwPairs.length) children.push(makeKeyValueTable(hwPairs));
          } else {
            children.push(makeText(String(p.homework)));
          }
        }
        // Closing Activity
        if (p.closingActivity) {
          children.push(makeSubHeading('Closing & Wrap-Up'));
          children.push(makeText(p.closingActivity));
        }
        // Spacer between lessons
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── RUBRICS ────────────────────────────────────────────────
    case 'rubrics': {
      const expanded = expandKeys('rubrics', data);
      const COL_DXA = [2060, 750, 1640, 1640, 1640, 1630];
      for (const r of expanded.rubrics || []) {
        const gradedWork = r.gradedWork || r.assignmentTitle || r.title || '';
        children.push(makeHeading(r.lessonTitle || r.title || 'Rubric'));
        if (gradedWork) children.push(makeBold('Graded Student Work', gradedWork));
        if (r.title && r.lessonTitle) children.push(makeBold('Rubric', r.title));
        const rMeta = [r.totalPoints && `${r.totalPoints} points`, r.assessmentType, r.bloomsLevel].filter(Boolean);
        if (rMeta.length) children.push(makeMeta(rMeta.join('  ·  ')));
        if (r.taskDirections) children.push(makeBold('Task Directions', r.taskDirections));
        if (r.instructorFacilitationNote)
          children.push(makeBold('Instructor Facilitation', r.instructorFacilitationNote));
        if (r.accessibilityAndUDL) children.push(makeBold('Accessibility & UDL', r.accessibilityAndUDL));
        if (Array.isArray(r.anchorExamples) && r.anchorExamples.length > 0) {
          children.push(makeSubHeading('Anchor Examples'));
          r.anchorExamples.forEach((example) => children.push(makeBullet(example)));
        }
        const criteria = r.criteria || [];
        if (criteria.length > 0) {
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
              { cantSplit: true },
            ),
          );
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── SLIDE DECKS ────────────────────────────────────────────
    case 'slideDecks': {
      const expanded = expandKeys('slideDecks', data);
      const key = expanded.decks ? 'decks' : 'slideDecks';
      for (const d of expanded[key] || []) {
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
      const key = expanded.quizzes ? 'quizzes' : 'quizBank';
      const stripOptionLetter = (option) => String(option ?? '').replace(/^[A-Z][.)]\s+/, '');
      for (const quiz of expanded[key] || []) {
        children.push(makeHeading(quiz.lessonTitle || 'Quiz'));
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
          children.push(makeBold(`Q${j + 1}` + (qMeta.length ? ` (${qMeta.join(', ')})` : ''), q.question || ''));
          // Lettered options read as an exam paper, not a bullet list. The
          // compiler bakes "A. " into the option text — strip it so the
          // exporter's own letter doesn't double up ("A. A. unit elastic").
          if (q.options)
            q.options.forEach((o, oi) =>
              children.push(makeNumbered(String.fromCharCode(65 + (oi % 26)), stripOptionLetter(o))),
            );
        }

        // Part 2 — the instructor answer key, on its own page.
        const hasKeyContent = questions.some(
          (q) => q.answer || q.explanation || q.sampleAnswer || q.rubricHints || q.scoringGuidance,
        );
        if (hasKeyContent) {
          children.push(new Paragraph({ children: [new PageBreak()] }));
          children.push(makeHeading(`Answer Key — ${quiz.lessonTitle || 'Quiz'}`));
          let prevObjectiveAligned = '';
          const allTags = new Set();
          for (let j = 0; j < questions.length; j++) {
            const q = questions[j];
            (q.tags || []).forEach((tag) => allTags.add(tag));
            const keyMeta = [q.bloomsLevel, q.difficulty].filter(Boolean);
            children.push(makeBold(`Q${j + 1}`, keyMeta.length ? `(${keyMeta.join(', ')})` : ''));
            // The callout label is rendered in tracked uppercase — only
            // short keys (a letter / a phrase) belong there. Full-sentence
            // answers (short-answer keys) must stay in body case.
            const answerText = String(q.answer || '').trim();
            if (answerText && q.explanation) {
              if (answerText.length <= 40) {
                children.push(makeCallout(`Answer — ${answerText}`, q.explanation));
              } else {
                children.push(makeCallout('Answer', answerText));
                children.push(makeBold('Explanation', q.explanation));
              }
            } else if (answerText) {
              children.push(makeCallout('Answer', answerText));
            } else if (q.explanation) {
              children.push(makeBold('Explanation', q.explanation));
            }
            // Single-objective lessons would otherwise repeat the same
            // "Aligns to" sentence under every question.
            if (q.objectiveAligned && q.objectiveAligned !== prevObjectiveAligned) {
              children.push(makeItalic(`Aligns to: ${q.objectiveAligned}`));
              prevObjectiveAligned = q.objectiveAligned;
            }
            if (q.sampleAnswer) children.push(makeBold('Sample Answer', q.sampleAnswer));
            if (q.rubricHints) children.push(makeBold('Rubric Hints', q.rubricHints));
            if (q.scoringGuidance) children.push(makeBold('Scoring Guidance', q.scoringGuidance));
            if (q.intendedUse) children.push(makeItalic(`Intended use: ${q.intendedUse}`));
            if (q.feedback) children.push(makeItalic(`Feedback: ${q.feedback}`));
          }
          // Tags once per quiz instead of after every question.
          if (allTags.size > 0) children.push(makeItalic(`Tags: ${[...allTags].join(', ')}`));
        }
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── DISCUSSIONS ────────────────────────────────────────────
    case 'discussions': {
      const expanded = expandKeys('discussions', data);
      for (const d of expanded.discussions || []) {
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
        if (d.equityConsiderations) children.push(makeBold('Equity Considerations', d.equityConsiderations));
        if (d.guidelines) children.push(makeBold('Guidelines', d.guidelines));
        if (d.followUp) children.push(makeBold('Follow-up', d.followUp));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── ASSIGNMENTS ────────────────────────────────────────────
    case 'assignments': {
      const expanded = expandKeys('assignments', data);
      for (const a of expanded.assignments || []) {
        children.push(makeHeading(a.title || 'Assignment'));
        const aMeta = [
          a.assignmentType,
          a.bloomsLevel,
          a.dueWeek || a.dueDate,
          a.estimatedTime,
          a.totalPoints && `${a.totalPoints} pts`,
          a.percentOfGrade,
          // v0.14.1 (3.3b): the reverse stamp — "Course Map L8 · A8.1 · 5%"
          // ties the brief back to the map cell that promised it.
          a.courseMapRef,
        ].filter(Boolean);
        if (aMeta.length) children.push(makeMeta(aMeta.join('  ·  ')));
        if (a.relatedLessons?.length) children.push(makeBold('Related Lessons', a.relatedLessons.join(', ')));
        if (a.overview) children.push(makeBold('Overview', a.overview));
        if (a.description) children.push(makeBold('Description', a.description));
        // v0.14.1 (3.2c): oral prompt sheets carry their speaking tasks.
        if (Array.isArray(a.speakingPrompts) && a.speakingPrompts.length > 0) {
          children.push(makeSubHeading('Speaking Prompts'));
          a.speakingPrompts.forEach((prompt) => children.push(makeBullet(prompt)));
        }
        if (a.objectives?.length) {
          children.push(makeSubHeading('Learning Objectives'));
          a.objectives.forEach((o) => children.push(makeBullet(o)));
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
          if (frPairs.length) children.push(makeKeyValueTable(frPairs));
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
        if (a.feedbackLoop) children.push(makeBold('Feedback Loop', a.feedbackLoop));
        // Scaffolding milestones
        if (a.scaffoldingMilestones?.length) {
          children.push(makeSubHeading('Scaffolding Milestones'));
          a.scaffoldingMilestones.forEach((m) => {
            const parts = [m.milestone || m.name || '', m.dueDate ? `(${m.dueDate})` : ''].filter(Boolean);
            const details = [
              m.description || '',
              m.feedbackChannel ? `Feedback: ${m.feedbackChannel}` : '',
              m.points !== undefined && m.points !== null ? `Points: ${m.points}` : '',
            ]
              .filter(Boolean)
              .join(' ');
            children.push(makeBold(parts.join(' '), details));
            if (Array.isArray(m.uploadChecklist) && m.uploadChecklist.length > 0) {
              m.uploadChecklist.forEach((item) => children.push(makeBullet(item)));
            }
          });
        }
        // Support resources
        if (a.supportResources?.length) {
          children.push(makeSubHeading('Support Resources'));
          a.supportResources.forEach((r) => children.push(makeBullet(typeof r === 'string' ? r : r.name || '')));
        }
        if (a.academicIntegrityStatement) children.push(makeBold('Academic Integrity', a.academicIntegrityStatement));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── STUDY GUIDES ───────────────────────────────────────────
    case 'studyGuides': {
      const expanded = expandKeys('studyGuides', data);
      const key = expanded.guides ? 'guides' : 'studyGuides';
      for (const g of expanded[key] || []) {
        children.push(makeHeading(g.lessonTitle || 'Study Guide'));
        if (g.examScope) children.push(makeText(g.examScope));
        if (g.summary) {
          children.push(makeSubHeading('Concept Summary'));
          children.push(makeText(g.summary));
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
            ),
          );
        }
        // v0.13.3: the worked example students study from.
        if (g.workedExample?.problem) {
          children.push(makeSubHeading('Worked Example'));
          children.push(makeText(g.workedExample.problem));
          (g.workedExample.steps || []).forEach((step, si) => children.push(makeNumbered(si + 1, step)));
          if (g.workedExample.result) children.push(makeCallout('Result', g.workedExample.result));
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
              children.push(makeBold('Misconception', m.misconception || ''));
              children.push(makeCallout('Correction', m.correction));
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
            children.push(makeNumbered(j + 1, `${q.question || q}${bloomLabel}`));
            if (q.hint) children.push(makeItalic(`Hint: ${q.hint}`));
          });
        }
        // Practice activities
        if (g.practiceActivities?.length) {
          children.push(makeSubHeading('Practice Activities'));
          g.practiceActivities.forEach((a) => children.push(makeBullet(typeof a === 'string' ? a : a.activity || '')));
        }
        // Exam prep
        if (g.examPrep) {
          children.push(makeSubHeading('Exam Preparation'));
          if (Array.isArray(g.examPrep.keyTopicsToKnow) && g.examPrep.keyTopicsToKnow.length) {
            children.push(makeBold('Key Topics', ''));
            g.examPrep.keyTopicsToKnow.forEach((t) =>
              children.push(makeBullet(typeof t === 'string' ? t : JSON.stringify(t))),
            );
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
        // Legacy examTips
        if (g.examTips && !g.examPrep) children.push(makeBold('Exam Tips', g.examTips));
        // Connection to next
        if (g.connectionToNext) children.push(makeBold('Connection to Next Lesson', g.connectionToNext));
        children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
      }
      break;
    }

    // ─── SYLLABUS ───────────────────────────────────────────────
    case 'syllabus': {
      const syl = data.syllabus || data;
      // v0.12.1: a ~10-page document gets a navigable ToC (heading styles now
      // match the rendered formatting, so Word can actually build it).
      if (docx.TableOfContents) {
        children.push(makeHeading('Contents'));
        children.push(new docx.TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }));
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      // Course info — a tidy two-column table instead of stacked lines.
      const infoPairs = [
        ['Semester', syl.semester],
        ['Credits', syl.credits],
        ['Meeting', syl.meetingPattern],
        ['Location', syl.location],
        ['Delivery', syl.deliveryMode],
        ['Prerequisites', syl.prerequisites],
      ].filter(([, v]) => v);
      if (infoPairs.length) children.push(makeKeyValueTable(infoPairs));
      // Instructor info
      const instrPairs = [
        ['Instructor', syl.instructor],
        ['Email', syl.instructorEmail],
        ['Office Hours', syl.officeHours],
        ['Office', syl.officeLocation],
      ].filter(([, v]) => v);
      if (instrPairs.length) {
        children.push(makeHeading('Instructor Information'));
        children.push(makeKeyValueTable(instrPairs));
      }
      if (syl.instructorBio) {
        children.push(makeSubHeading('Instructor Bio'));
        children.push(makeText(syl.instructorBio));
      }
      if (syl.courseDescription) {
        children.push(makeHeading('Course Description'));
        children.push(makeText(syl.courseDescription));
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
        children.push(
          makeTableFn(
            [3900, 1100, 2180, 2180],
            ['Outcome', "Bloom's", 'Practiced In', 'Assessed By'],
            syl.outcomeAlignmentMatrix.map((row) => [
              row.outcome || '',
              row.bloomsLevel || '',
              Array.isArray(row.practicedIn) ? row.practicedIn.join('; ') : row.practicedIn || '',
              Array.isArray(row.assessedBy) ? row.assessedBy.join('; ') : row.assessedBy || '',
            ]),
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
        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(makeHeading('Course Schedule'));
        // v0.12.1: a Dates column that merely repeats the Week label rendered
        // as "Week 1 || Week 1" — only keep it when it adds information.
        const hasDates = syl.weeklySchedule.some((w) => w.dates && w.dates !== w.week);
        const headers = hasDates
          ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments']
          : ['Week', 'Topic', 'Readings', 'Assignments'];
        const wsDXA = hasDates ? [780, 1200, 2500, 2440, 2440] : [936, 2995, 2810, 2619];
        children.push(
          makeTableFn(
            wsDXA,
            headers,
            syl.weeklySchedule.map((w) =>
              hasDates
                ? [
                    w.week || '',
                    (w.dates !== w.week && w.dates) || '',
                    w.topic || '',
                    w.readings || '',
                    w.assignments || '',
                  ]
                : [w.week || '', w.topic || '', w.readings || '', w.assignments || ''],
            ),
          ),
        );
      }
      // Policies — start the policy block on a fresh page.
      let policyPageBroken = false;
      const policySection = (heading, text) => {
        if (text) {
          if (!policyPageBroken) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
            policyPageBroken = true;
          }
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
        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(makeHeading(syl.methodsStatement.title || 'Evidence-Based Course Design'));
        if (syl.methodsStatement.summary) children.push(makeText(syl.methodsStatement.summary));
        syl.methodsStatement.methods.forEach((method) => {
          children.push(makeSubHeading(method.label));
          if (method.claim) children.push(makeText(method.claim));
          (method.references || []).forEach((reference) => children.push(makeBullet(reference)));
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
        children.push(makeHeading(syl.sourcesAndLicenses.title || 'Sources & Licenses'));
        if (syl.sourcesAndLicenses.note) children.push(makeText(syl.sourcesAndLicenses.note));
        syl.sourcesAndLicenses.groups.forEach((group) => {
          children.push(makeSubHeading(group.label));
          group.entries.forEach((entry) => {
            const licenseTail = [entry.license, entry.attribution].filter(Boolean).join(' · ');
            children.push(makeBullet(`${entry.citation}${licenseTail ? ` — ${licenseTail}` : ''}`));
          });
        });
      }
      if (syl.importantDates?.length) {
        children.push(makeHeading('Important Dates'));
        children.push(
          makeTableFn(
            [1872, 7488],
            ['When', 'Milestone'],
            syl.importantDates.map((d) => [d.date || '', d.event || '']),
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
      const faqs = expanded.faqs || expanded.courseFaq || [];
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
              spacing: { line: SINGLE_SP, before: 240, after: 60 },
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
          // Answer text
          children.push(makeText(q.answer || ''));
          if (q.studentAction) children.push(makeBold('Student Action', q.studentAction));
          if (q.assessmentConnection) children.push(makeItalic(`Assessment connection: ${q.assessmentConnection}`));
          if (q.accessibilitySupport) children.push(makeItalic(`Support: ${q.accessibilitySupport}`));
          if (q.concreteExample) children.push(makeItalic(`Example: ${q.concreteExample}`));
          if (q.instructorNote) children.push(makeItalic(`Instructor note: ${q.instructorNote}`));
          // Related concepts as "See also:" for student-facing professionalism
          if (Array.isArray(q.relatedConcepts) && q.relatedConcepts.length > 0) {
            children.push(makeItalic(`See also: ${q.relatedConcepts.join(', ')}`));
          }
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
  const children = buildDocxTitleChildren(docx, courseName, label);

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER });

  const doc = buildDocxDocument(docx, children, { courseName, label, landscape: featureId === 'rubrics' });

  const blob = await Packer.toBlob(doc);
  await assertOfficeExportHasNoInternalText(blob, 'docx', label);
  const fileName = `${courseName || 'Course'} - ${label}.docx`;
  saveAs(blob, fileName);
  return fileName;
}

// ════════════════════════════════════════════════════════════════
