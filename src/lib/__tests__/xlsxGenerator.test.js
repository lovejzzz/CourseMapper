import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildXlsxBuffer } from '../xlsxGenerator';

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
});
