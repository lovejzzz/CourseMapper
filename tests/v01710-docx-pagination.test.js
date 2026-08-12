import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter';
import { auditOfficeAccessibility } from '../src/lib/exportRenderedTextAudit';

function occurrences(text, pattern) {
  return text.match(pattern)?.length || 0;
}

describe('v0.17.10 lesson-plan DOCX pagination', () => {
  it('emits each session-outline move as a margin-safe bounded table', async () => {
    const outline = Array.from({ length: 5 }, (_, index) => ({
      time: `${10 + index} minutes`,
      activity: `Activity ${index + 1}`,
      type: 'Workshop',
      bloomsLevel: 'Apply',
      description: `Evidence protocol ${index + 1}. ${'Inspect, compare, explain, and revise the evidence. '.repeat(18)}`,
      instructorNotes: `Keep activity ${index + 1} together when the document paginates.`,
    }));
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      { lessonPlans: [{ lessonTitle: 'Pagination proof', outline }] },
      'DOCX Pagination Proof',
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const outlineXml = xml.slice(xml.indexOf('SESSION OUTLINE'));

    expect(occurrences(outlineXml, /<w:tbl>/g)).toBe(outline.length);
    expect(occurrences(outlineXml, /<w:cantSplit\/>/g)).toBe(outline.length);
    expect(occurrences(outlineXml, /Description &amp; Notes/g)).toBe(1);
    expect(occurrences(outlineXml, /<w:tblHeader w:val="false"\/>/g)).toBe(1);
    expect(occurrences(outlineXml, /<w:keepNext\/><w:spacing w:before="0" w:after="0" w:line="1"\/>/g)).toBe(
      outline.length - 1,
    );
    for (const row of outline) expect(outlineXml).toContain(row.activity);
    expect(await auditOfficeAccessibility(blob, 'docx')).toBeNull();
  });

  it('flags a data table whose first row is not marked as a semantic header', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      [
        '<w:document><w:body>',
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Lesson</w:t></w:r></w:p>',
        '<w:tbl>',
        '<w:tr><w:tc><w:p><w:r><w:t>Activity</w:t></w:r></w:p></w:tc></w:tr>',
        '<w:tr><w:tc><w:p><w:r><w:t>Practice</w:t></w:r></w:p></w:tc></w:tr>',
        '</w:tbl>',
        '</w:body></w:document>',
      ].join(''),
    );
    zip.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>Footer</w:t></w:r></w:p></w:ftr>');
    const blob = await zip.generateAsync({ type: 'blob' });

    expect(await auditOfficeAccessibility(blob, 'docx')).toMatchObject({
      code: 'accessibility',
      problems: ['table-without-header-semantics'],
    });
  });
});

describe('working-document tail pagination', () => {
  it('lets long quiz answer keys paginate naturally without a forced continuation page', async () => {
    const questions = Array.from({ length: 12 }, (_, index) => ({
      question: `Question ${index + 1}`,
      answer: `Answer ${index + 1} ${'with evidence and reasoning '.repeat(12)}`,
      scoringGuidance: `Award credit for a supported answer ${index + 1}.`,
    }));
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      { quizzes: [{ lessonTitle: 'Lesson 1: Pagination', questions }] },
      'Quiz Pagination Proof',
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');

    expect(xml).not.toContain('Answer Key Continued');
    expect(xml).not.toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('Answer 12');
  });

  it('omits repeated package-wide support and integrity boilerplate from lesson briefs', async () => {
    const blob = await buildDeliverableDocxBlob(
      'assignments',
      {
        assignments: [
          {
            lessonNumber: 4,
            title: 'Evidence brief',
            task: 'Write the brief.',
            supportResources: ['Writing center', 'Source ledger'],
            academicIntegrityStatement: 'Required',
          },
        ],
      },
      'Assignment Pagination Proof',
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).not.toContain('Support Resources');
    expect(xml).not.toContain('Academic Integrity');
  });
});

describe('syllabus source-appendix pagination', () => {
  it('renders a short source appendix as readable citation and rights blocks', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            note: 'Open resources used in this course package.',
            groups: [
              {
                label: 'Course resources',
                entries: [
                  {
                    citation: 'Open resource one — https://example.edu/one',
                    url: 'https://example.edu/one',
                    license: 'CC BY 4.0',
                    attribution: 'Example University',
                  },
                  {
                    citation: 'Open resource two — https://example.edu/two',
                    url: 'https://example.edu/two',
                    license: 'CC BY-SA 4.0',
                    attribution: 'Example Press metadata.',
                  },
                ],
              },
            ],
          },
        },
      },
      'Source Appendix Proof',
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');

    expect(xml).toContain('Open resource one — https://example.edu/one');
    expect(xml).toContain('License and attribution: CC BY 4.0 · Example University.');
    expect(xml).toContain('Open resource two — https://example.edu/two');
    expect(xml).toContain('License and attribution: CC BY-SA 4.0 · Example Press metadata.');
    expect(xml).not.toContain('Example Press metadata..');
    // Short appendices use the normal readable 11pt body size (22 half-points),
    // not the compact 9pt bibliography fallback.
    const firstCitation = xml.indexOf('Open resource one');
    expect(xml.slice(Math.max(0, firstCitation - 400), firstCitation)).toContain('<w:sz w:val="22"/>');
    expect(await auditOfficeAccessibility(blob, 'docx')).toBeNull();
  });
});
