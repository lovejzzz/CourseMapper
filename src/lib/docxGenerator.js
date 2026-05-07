import { safeImport } from './safeImport.js';

// Lazy-loaded heavy dependencies
let _docx, _saveAs;
async function getDocx() {
  if (!_docx) _docx = await safeImport(() => import('docx'));
  return _docx;
}
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await safeImport(() => import('file-saver'))).saveAs;
  return _saveAs;
}

// Column key → human-readable label
const DEFAULT_LABELS = {
  learningGoals: 'Learning Goals',
  topicSection: 'Topic / Section',
  learningObjectives: 'Learning Objectives',
  weeklyAssessments: 'Assessments',
  asyncActivities: 'Asynchronous Activities',
  syncActivities: 'Synchronous Activities',
  technologyNeeded: 'Technology Needed',
  presentationFormat: 'Presentation Format',
  supportingResources: 'Supporting Resources',
  evaluateDesign: 'Evaluate Design',
};

// ── Design tokens ──
const FONT = 'Calibri';
const ACCENT = '2B579A';
const ACCENT_LIGHT = 'D6E4F0';
const H2_COLOR = '333333';
const BODY_SIZE = 22; // 11pt
const H1_SIZE = 28; // 14pt
const H2_SIZE = 24; // 12pt
const TITLE_SIZE = 36; // 18pt
const SUBTITLE_SIZE = 28; // 14pt
const LINE_SP = 276; // 1.15× line spacing
const SINGLE_SP = 240; // 1.0×

// ── Page geometry (US Letter, 1-inch margins) ──
const PAGE_W = 12240; // 8.5″ in DXA
const PAGE_H = 15840; // 11″  in DXA
const MARGIN = 1440; // 1″   in DXA
const CONTENT_W = 9360; // PAGE_W - 2×MARGIN
const LABEL_COL = 2400; // ~25.6% of content width
const CONTENT_COL = 6960; // remainder — sums to 9360

/**
 * Split jammed inline numbered lists into separate items.
 * "1. xxx2. xxx3. xxx" → ["1. xxx", "2. xxx", "3. xxx"]
 */
function splitToListItems(text) {
  if (!text || typeof text !== 'string') return [String(text || '')];
  const lines = text.split(/\n/);
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Split jammed numbered items where a digit follows non-whitespace
    const parts = trimmed.split(/(?<=\S)\s*(?=\d+\.\s)/);
    for (const p of parts) {
      const t = p.trim();
      if (t) result.push(t);
    }
  }
  return result.length ? result : [text.trim()];
}

/**
 * Build a modern, scannable .docx blob from course map data.
 * Calibri 11pt, 1.15 line spacing, 2-column tables per section,
 * color-coded headings, manual TOC, and proper list formatting.
 */
export async function buildDocxBlob(courseMap, customColumns) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
    Header,
    PageNumber,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    ShadingType,
    TableLayoutType,
  } = await getDocx();

  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };

  const enabledColumns = customColumns?.length > 0 ? customColumns.filter((c) => c.enabled !== false) : null;
  const colKeys = enabledColumns ? enabledColumns.map((c) => c.key) : Object.keys(DEFAULT_LABELS);
  const colLabels = {};
  if (enabledColumns) {
    for (const col of enabledColumns) colLabels[col.key] = col.label || DEFAULT_LABELS[col.key] || col.key;
  } else {
    Object.assign(colLabels, DEFAULT_LABELS);
  }

  const courseName = courseMap.courseName || 'Course Map';
  const semester = courseMap.semester || '';
  const lessons = courseMap.lessons || [];

  // ── Helper: build content cell paragraphs with list splitting ──
  function contentParagraphs(text) {
    const items = splitToListItems(text);
    if (items.length <= 1) {
      return [
        new Paragraph({
          spacing: { line: SINGLE_SP, before: 20, after: 20 },
          children: [new TextRun({ text: items[0] || '', size: BODY_SIZE, font: FONT })],
        }),
      ];
    }
    return items.map(
      (item) =>
        new Paragraph({
          spacing: { line: SINGLE_SP, before: 20, after: 20 },
          bullet: { level: 0 },
          children: [new TextRun({ text: item, size: BODY_SIZE, font: FONT })],
        }),
    );
  }

  // ── Helper: build a 2-column category table for one section ──
  function buildSectionTable(section) {
    const rows = [];
    for (const key of colKeys) {
      if (key === 'topicSection') continue;
      const rawValue = section[key];
      if (key === 'evaluateDesign') {
        const checked = rawValue === true || rawValue === 'true';
        if (!checked) continue;
      }
      if (!rawValue && rawValue !== true) continue;
      if (typeof rawValue === 'string' && !rawValue.trim()) continue;
      const label = colLabels[key] || key;
      const valueText = key === 'evaluateDesign' ? '✓ Yes' : String(rawValue);

      rows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: LABEL_COL, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: ACCENT_LIGHT },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { line: SINGLE_SP, before: 0, after: 0 },
                  children: [new TextRun({ text: label, bold: true, size: BODY_SIZE, font: FONT, color: '333333' })],
                }),
              ],
            }),
            new TableCell({
              width: { size: CONTENT_COL, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: contentParagraphs(valueText),
            }),
          ],
        }),
      );
    }
    if (rows.length === 0) return null;
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [LABEL_COL, CONTENT_COL],
      borders: {
        top: THIN_BORDER,
        bottom: THIN_BORDER,
        left: THIN_BORDER,
        right: THIN_BORDER,
        insideHorizontal: THIN_BORDER,
        insideVertical: THIN_BORDER,
      },
      rows,
    });
  }

  // ── Title Page ──
  const titleChildren = [];
  for (let i = 0; i < 8; i++) {
    titleChildren.push(new Paragraph({ spacing: { line: SINGLE_SP } }));
  }
  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE_SP, after: 80 },
      children: [new TextRun({ text: courseName, bold: true, size: TITLE_SIZE, font: FONT, color: ACCENT })],
    }),
  );
  if (semester) {
    titleChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: LINE_SP, after: 40 },
        children: [new TextRun({ text: semester, size: SUBTITLE_SIZE, font: FONT, color: '666666' })],
      }),
    );
  }
  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE_SP, after: 200 },
      children: [new TextRun({ text: 'Course Map', size: SUBTITLE_SIZE, font: FONT, color: '888888' })],
    }),
  );
  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: SINGLE_SP, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
      children: [],
    }),
  );

  // ── Table of Contents (manual) ──
  const tocChildren = [];
  tocChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { line: LINE_SP, after: 200 },
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: H1_SIZE, font: FONT, color: ACCENT })],
    }),
  );
  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];
    tocChildren.push(
      new Paragraph({
        spacing: { line: LINE_SP, before: 80, after: 40 },
        children: [
          new TextRun({
            text: `${li + 1}.  ${lesson.title || `Lesson ${li + 1}`}`,
            bold: true,
            size: BODY_SIZE,
            font: FONT,
            color: ACCENT,
          }),
        ],
      }),
    );
    for (let si = 0; si < (lesson.sections || []).length; si++) {
      const section = lesson.sections[si];
      const rawTopic = section.topicSection || `Section ${si + 1}`;
      // Strip any leading number prefix (e.g. "1.1: " or "1.1 ") to avoid doubling
      const cleanTopic = rawTopic.replace(/^\d+(\.\d+)*[.:]?\s*/, '');
      tocChildren.push(
        new Paragraph({
          spacing: { line: SINGLE_SP, before: 0, after: 0 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text: `${li + 1}.${si + 1}  ${cleanTopic || rawTopic}`,
              size: BODY_SIZE,
              font: FONT,
              color: '666666',
            }),
          ],
        }),
      );
    }
  }
  tocChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Body ──
  const bodyChildren = [];
  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];

    // Lesson heading — colored with accent underline, keepNext to attach to content
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        spacing: { line: LINE_SP, before: li > 0 ? 360 : 0, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 8 } },
        children: [
          new TextRun({
            text: lesson.title || `Lesson ${li + 1}`,
            bold: true,
            size: H1_SIZE,
            font: FONT,
            color: ACCENT,
          }),
        ],
      }),
    );

    for (let si = 0; si < (lesson.sections || []).length; si++) {
      const section = lesson.sections[si];
      const topicText = section.topicSection || `Section ${si + 1}`;

      // Section heading — keepNext to attach to its table
      bodyChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          spacing: { line: LINE_SP, before: 240, after: 120 },
          children: [
            new TextRun({
              text: topicText,
              bold: true,
              size: H2_SIZE,
              font: FONT,
              color: H2_COLOR,
            }),
          ],
        }),
      );

      // 2-column category table
      const table = buildSectionTable(section);
      if (table) bodyChildren.push(table);
    }

    // Page break between lessons
    if (li < lessons.length - 1) {
      bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // ── Page header: course name + page number ──
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${courseName}  |  `, size: 18, font: FONT, color: 'AAAAAA', italics: true }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: 'AAAAAA' }),
        ],
      }),
    ],
  });

  // ── Build Document ──
  const doc = new Document({
    language: { value: 'en-US' },
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
        heading1: { run: { font: FONT, size: H1_SIZE, bold: true, color: ACCENT } },
        heading2: { run: { font: FONT, size: H2_SIZE, bold: true, color: H2_COLOR } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
          titlePage: true,
        },
        children: titleChildren,
      },
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        headers: { default: pageHeader },
        children: [...tocChildren, ...bodyChildren],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export async function generateDocx(courseMap, customColumns) {
  const saveAs = await getSaveAs();
  const blob = await buildDocxBlob(courseMap, customColumns);
  const courseName = courseMap.courseName || 'Course Map';
  const semester = courseMap.semester || '';
  const fileName = `${courseName} Course Map (${semester || 'TBD'}).docx`;
  saveAs(blob, fileName);
  return fileName;
}
