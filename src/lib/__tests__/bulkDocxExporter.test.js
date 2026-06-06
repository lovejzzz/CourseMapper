import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';

async function docxDocumentXml(blob) {
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  return await zip.file('word/document.xml').async('string');
}

describe('buildDeliverableDocxBlob', () => {
  it('omits internal compiler metadata from generic custom deliverable DOCX exports', async () => {
    const blob = await buildDeliverableDocxBlob(
      'custom_reflection',
      {
        items: [
          {
            lessonTitle: 'Lesson 1',
            promptTitle: 'Weekly Reflection 1',
            responsePrompt: 'Connect the lesson evidence to your next revision.',
            sourceGrounding: {
              compilerDecision: 'deterministic-compile',
              publishGate: 'ready-with-spot-check',
            },
            nestedEvidence: {
              studentCue: 'Use one concrete course detail.',
              sourceGrounding: 'Internal source-grounding trace.',
            },
            checklist: [
              {
                item: 'Name one revision priority.',
                blueprintGrounding: 'Internal blueprint trace.',
              },
            ],
            qualityReceipt: 'Internal proof packet only.',
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Weekly Reflection 1');
    expect(xml).toContain('Use one concrete course detail');
    expect(xml).toContain('Name one revision priority');
    expect(xml).not.toContain('Source Grounding');
    expect(xml).not.toContain('deterministic-compile');
    expect(xml).not.toContain('Internal source-grounding trace');
    expect(xml).not.toContain('Internal blueprint trace');
    expect(xml).not.toContain('Internal proof packet');
  });

  it('uses Word list structure instead of literal bullet glyphs for slide-deck bullets', async () => {
    const blob = await buildDeliverableDocxBlob(
      'slideDecks',
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Export Structure',
            slides: [
              {
                title: 'Structured Bullet Export',
                bullets: ['Review the generated DOCX.', 'Confirm list semantics survive export.'],
              },
            ],
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('Review the generated DOCX.');
    expect(xml).not.toContain('• Review the generated DOCX.');
  });
});
