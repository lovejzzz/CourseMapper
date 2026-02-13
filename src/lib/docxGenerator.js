// Lazy-loaded heavy dependencies
let _docx, _saveAs;
async function getDocx() {
  if (!_docx) _docx = await import('docx');
  return _docx;
}
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await import('file-saver')).saveAs;
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

/**
 * Build a professional APA-formatted .docx document from course map data.
 * APA 7th edition: Times New Roman 12pt, double-spaced, 1-inch margins,
 * proper heading hierarchy, page numbers, and title page.
 */
export async function generateDocx(courseMap, customColumns) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Header, PageNumber } = await getDocx();
  const saveAs = await getSaveAs();

  const FONT = 'Times New Roman';
  const BODY = 24;   // 12pt in half-points
  const DBL = 480;   // double spacing (240ths of a line)
  const INDENT = 720; // 0.5-inch first-line indent (twips)

  const colKeys = customColumns && customColumns.length > 0
    ? customColumns.map(c => c.key)
    : Object.keys(DEFAULT_LABELS);

  const colLabels = {};
  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      colLabels[col.key] = col.label || DEFAULT_LABELS[col.key] || col.key;
    }
  } else {
    Object.assign(colLabels, DEFAULT_LABELS);
  }

  const courseName = courseMap.courseName || 'Course Map';
  const semester = courseMap.semester || '';

  // ── Title Page (APA-style centered block) ──
  const titleChildren = [];

  // Push title block toward vertical center
  for (let i = 0; i < 6; i++) {
    titleChildren.push(new Paragraph({ spacing: { line: DBL } }));
  }

  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: courseName, bold: true, size: BODY, font: FONT })],
    }),
  );

  if (semester) {
    titleChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: DBL, after: 0 },
        children: [new TextRun({ text: semester, size: BODY, font: FONT })],
      }),
    );
  }

  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: 'Course Map', size: BODY, font: FONT })],
    }),
  );

  const generated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  titleChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DBL, after: 0 },
      children: [new TextRun({ text: generated, size: BODY, font: FONT })],
    }),
  );

  // ── Body Pages ──
  const bodyChildren = [];

  for (let li = 0; li < courseMap.lessons.length; li++) {
    const lesson = courseMap.lessons[li];

    // APA Level 1: Centered, Bold
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { line: DBL, before: li > 0 ? 240 : 0, after: 0 },
        children: [new TextRun({ text: lesson.title || `Lesson ${li + 1}`, bold: true, size: BODY, font: FONT })],
      }),
    );

    for (let si = 0; si < (lesson.sections || []).length; si++) {
      const section = lesson.sections[si];
      const topicText = section.topicSection || `Section ${si + 1}`;

      // APA Level 2: Left-Aligned, Bold
      bodyChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { line: DBL, before: 240, after: 0 },
          children: [new TextRun({ text: topicText, bold: true, size: BODY, font: FONT })],
        }),
      );

      for (const key of colKeys) {
        if (key === 'topicSection' || key === 'evaluateDesign') continue;
        const value = section[key];
        if (!value || (typeof value === 'string' && !value.trim())) continue;
        const label = colLabels[key] || key;

        // APA Level 3: Left-Aligned, Bold Italic, ending with period, text follows
        bodyChildren.push(
          new Paragraph({
            spacing: { line: DBL, after: 0 },
            indent: { firstLine: INDENT },
            children: [
              new TextRun({ text: `${label}. `, bold: true, italics: true, size: BODY, font: FONT }),
              new TextRun({ text: String(value), size: BODY, font: FONT }),
            ],
          }),
        );
      }
    }

    // Page break between lessons (except after the last one)
    if (li < courseMap.lessons.length - 1) {
      bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // ── Page header with right-aligned page number ──
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: BODY, font: FONT })],
      }),
    ],
  });

  // ── Build and save ──
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY } },
        heading1: { run: { font: FONT, size: BODY, bold: true, color: '000000' } },
        heading2: { run: { font: FONT, size: BODY, bold: true, color: '000000' } },
      },
    },
    sections: [
      // Title page (no header)
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
          titlePage: true,
        },
        children: titleChildren,
      },
      // Body pages with page numbers
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        headers: { default: pageHeader },
        children: bodyChildren,
      },
    ],
  });

  const buffer = await Packer.toBlob(doc);
  const fileName = `${courseName} Course Map (${semester || 'TBD'}).docx`;
  saveAs(buffer, fileName);
  return fileName;
}
