import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter';

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
  });
});
