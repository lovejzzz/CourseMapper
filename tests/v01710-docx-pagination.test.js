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

  it('still flags an unshaded table when it has a header-plus-data relationship', async () => {
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
      problems: ['table-without-header-shading'],
    });
  });
});
