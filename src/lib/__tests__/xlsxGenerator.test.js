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
});
