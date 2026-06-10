import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildXlsxBuffer } from '../xlsxGenerator';
import { assertOfficeExportHasNoInternalText } from '../exportTextInspector';

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function sheetText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  return decodeXml(xml);
}

async function stylesText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('xl/styles.xml').async('string');
}

async function workbookText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return decodeXml(await zip.file('xl/workbook.xml').async('string'));
}

describe('xlsxGenerator', () => {
  const columns = [
    { key: 'learningGoals', label: 'Learning Goals', enabled: true },
    { key: 'topicSection', label: 'Topic/Section', enabled: true },
    { key: 'evaluateDesign', label: 'Evaluate Design', enabled: true },
  ];

  it('preserves textual Evaluate Design alignment notes in course-map exports', async () => {
    const buffer = await buildXlsxBuffer(
      {
        courseName: 'Export Audit',
        semester: 'Spring 2027',
        lessons: [
          {
            title: 'Lesson 1: Evidence',
            sections: [
              {
                learningGoals: 'Use evidence.',
                topicSection: 'Evidence review',
                evaluateDesign: 'Objectives, activities, and assessments align to evidence review.',
              },
            ],
          },
          {
            title: 'Lesson 2: Checkpoint',
            sections: [
              {
                learningGoals: 'Check alignment.',
                topicSection: 'Alignment checkpoint',
                evaluateDesign: true,
              },
            ],
          },
        ],
      },
      columns,
    );

    const text = await sheetText(buffer);

    expect(text).toContain('Evaluate Design');
    expect(text).toContain('Objectives, activities, and assessments align to evidence review.');
    expect(text).toContain('✓');
  });

  it('still removes Evaluate Design when the column is entirely empty', async () => {
    const buffer = await buildXlsxBuffer(
      {
        courseName: 'Export Audit',
        lessons: [
          {
            title: 'Lesson 1: Evidence',
            sections: [{ learningGoals: 'Use evidence.', topicSection: 'Evidence review' }],
          },
        ],
      },
      columns,
    );

    const text = await sheetText(buffer);

    expect(text).not.toContain('Evaluate Design');
  });

  it('uses standards-valid vertical alignment values', async () => {
    const buffer = await buildXlsxBuffer(
      {
        courseName: 'Export Audit',
        lessons: [
          {
            title: 'Lesson 1: Evidence',
            sections: [{ learningGoals: 'Use evidence.', topicSection: 'Evidence review' }],
          },
        ],
      },
      columns,
    );

    const styles = await stylesText(buffer);

    expect(styles).toContain('vertical="center"');
    expect(styles).not.toContain('vertical="middle"');
  });

  it('exports clean course-map headers without instructional prompt text', async () => {
    const buffer = await buildXlsxBuffer({
      courseName: 'Intro Psychology',
      lessons: [
        {
          title: 'Lesson 1: What Psychology Is',
          sections: [{ learningGoals: 'Define the field.', learningObjectives: 'Explain core perspectives.' }],
        },
      ],
    });

    const text = await sheetText(buffer);

    expect(text).toContain('Learning Goals');
    expect(text).toContain('Learning Objectives');
    expect(text).not.toContain('What are the big ideas');
    expect(text).not.toContain('What students will know or be able to do');
  });

  it('translates internal review tags before writing public course-map exports', async () => {
    const buffer = await buildXlsxBuffer(
      {
        courseName: 'Human Services Field Placement Seminar',
        lessons: [
          {
            title: 'Lesson 1: Orientation',
            sections: [
              {
                learningGoals: 'Prepare for agency-based practice.',
                topicSection: 'Field placement readiness',
                evaluateDesign:
                  'Score pathway accuracy, constraint analysis, feasibility reasoning, and local-review cue. Source-review-required rows use a publish gate before handoff-review focus.',
              },
            ],
          },
        ],
      },
      columns,
    );

    const text = await sheetText(buffer);

    expect(text).toContain('local confirmation cue');
    expect(text).toContain('source confirmation needed rows use a publish checkpoint before handoff focus');
    expect(text).not.toMatch(/\blocal-review\b|\bsource-review-required\b|\bpublish gate\b|\bhandoff-review focus\b/i);
    await expect(assertOfficeExportHasNoInternalText(buffer, 'xlsx', 'Course Map')).resolves.toBeUndefined();
  });

  const longText =
    'Students will analyze primary sources, synthesize competing interpretations, and draft an evidence-based argument that ' +
    'addresses counterclaims, cites at least three peer-reviewed studies, and reflects on the limits of the available evidence.';

  function twoLessonMap() {
    return {
      courseName: 'Render Audit',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: Foundations of Evidence-Based Reasoning in the Social Sciences',
          sections: [
            { learningGoals: longText, topicSection: 'Evidence foundations', evaluateDesign: longText },
          ],
        },
        {
          title: 'Lesson 2: Checkpoint',
          sections: [
            { learningGoals: 'Check alignment.\nReview rubric.', topicSection: 'Alignment checkpoint', evaluateDesign: true },
          ],
        },
      ],
    };
  }

  it('stores explicit heights on the header and every data row', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const text = await sheetText(buffer);

    // Header band shrinks from 120pt to a 32pt label row
    expect(text).toContain('<row r="1" ht="32" customHeight="1">');

    // Every data row carries an estimated height tall enough to show wrapped text
    const dataRowHeights = [...text.matchAll(/<row r="(\d+)" ht="([\d.]+)" customHeight="1">/g)]
      .filter(([, rowNumber]) => Number(rowNumber) > 1)
      .map(([, , height]) => Number(height));
    expect(dataRowHeights).toHaveLength(2);
    for (const height of dataRowHeights) {
      expect(height).toBeGreaterThan(15);
    }
    // The long-text lesson row needs several wrapped lines, not a sliver
    expect(dataRowHeights[0]).toBeGreaterThan(60);
  });

  it('wraps Evaluate Design cells top-aligned like every other data column', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const text = await sheetText(buffer);
    const styles = await stylesText(buffer);

    // Evaluate Design (col D here) uses the wrapped data style, not the centered one
    expect(text).toContain('<c r="D2" t="inlineStr" s="2">');
    expect(text).not.toContain('s="5"');
    expect(styles).toMatch(/<xf numFmtId="0" fontId="2" fillId="0" [^>]*><alignment vertical="top" horizontal="left" wrapText="1"\/>/);
  });

  it('bands alternating lesson blocks with the soft fill', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const text = await sheetText(buffer);
    const styles = await stylesText(buffer);

    // Lesson 1 rows stay plain, lesson 2 rows pick up the band style (xf 4 -> FFF2F6FC)
    expect(text).toContain('<c r="B2" t="inlineStr" s="2">');
    expect(text).toContain('<c r="B3" t="inlineStr" s="4">');
    expect(text).toContain('<c r="D3" t="inlineStr" s="4">');
    // Lesson title column keeps its own style in banded blocks
    expect(text).toContain('<c r="A3" t="inlineStr" s="3">');
    expect(styles).toContain('FFF2F6FC');
  });

  it('adds autofilter, tab color, and landscape fit-to-width print setup', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const text = await sheetText(buffer);
    const workbook = await workbookText(buffer);

    expect(text).toContain('<autoFilter ref="A1:D1"/>');
    expect(text).toContain('<tabColor rgb="FF4472C4"/>');
    expect(text).toContain('<pageSetUpPr fitToPage="1"/>');
    expect(text).toContain('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
    expect(text).toContain('<pageMargins');
    // Header row repeats on every printed page
    expect(workbook).toContain('_xlnm.Print_Titles');
    expect(workbook).toContain("'Course Map'!$1:$1");
  });

  it('right-sizes columns from the production audit', async () => {
    const map = twoLessonMap();
    map.lessons[0].sections[0].presentationFormat = 'Slides + live demo';
    const buffer = await buildXlsxBuffer(map, [
      ...columns,
      { key: 'presentationFormat', label: 'Presentation Format', enabled: true },
    ]);
    const text = await sheetText(buffer);

    expect(text).toContain('<col min="1" max="1" width="34" customWidth="1"/>'); // lesson titles
    expect(text).toContain('<col min="4" max="4" width="46" customWidth="1"/>'); // evaluateDesign
    expect(text).toContain('<col min="5" max="5" width="22" customWidth="1"/>'); // presentationFormat
  });

  it('uses universally installed fonts instead of Inter', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const styles = await stylesText(buffer);

    expect(styles).toContain('name val="Calibri"');
    expect(styles).not.toContain('Inter');
  });

  it('vertically centers the header labels', async () => {
    const buffer = await buildXlsxBuffer(twoLessonMap(), columns);
    const styles = await stylesText(buffer);

    expect(styles).toMatch(/<xf numFmtId="0" fontId="1" fillId="2" [^>]*><alignment vertical="center" horizontal="left" wrapText="1"\/>/);
  });
});
