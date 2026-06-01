import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDeliverableCsv } from '../deliverableExporters';
import { saveToGoogleDocsBlob, saveToGoogleSheets, saveToGoogleSlides } from '../googleDrive';

async function makeOfficeXmlBlob(path, xml) {
  const zip = new JSZip();
  zip.file(path, xml);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([buffer]);
}

async function makeOfficeXmlBuffer(path, xml) {
  return await (await makeOfficeXmlBlob(path, xml)).arrayBuffer();
}

describe('direct export integrity guards', () => {
  it('blocks current-tab CSV exports that expose internal proof language', async () => {
    await expect(
      exportDeliverableCsv(
        'lessonPlans',
        {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1',
              warmUp: {
                prompt: 'This prompt exposes the compiler decision.',
              },
            },
          ],
        },
        'Research Methods',
      ),
    ).rejects.toThrow('Lesson Plans CSV export exposes internal compiler decision language in Warm-Up.');
  });

  it('blocks Google Docs uploads when the source DOCX exposes internal proof language', async () => {
    const blob = await makeOfficeXmlBlob(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>This document exposes the publish gate.</w:t></w:r></w:p></w:body></w:document>',
    );

    await expect(saveToGoogleDocsBlob(blob, 'Lesson Plans', 'Research Methods', {})).rejects.toThrow(
      'Lesson Plans DOCX export exposes internal publish gate language in word/document.xml.',
    );
  });

  it('blocks Google Sheets uploads when the source XLSX exposes internal proof language', async () => {
    const buffer = await makeOfficeXmlBuffer(
      'xl/sharedStrings.xml',
      '<sst><si><t>This sheet exposes source grounding details.</t></si></sst>',
    );

    await expect(saveToGoogleSheets(buffer, 'Course Map.xlsx', 'Research Methods', {})).rejects.toThrow(
      'Course Map.xlsx XLSX export exposes internal source grounding language in xl/sharedStrings.xml.',
    );
  });

  it('blocks Google Slides uploads when speaker notes expose internal proof language', async () => {
    const blob = await makeOfficeXmlBlob(
      'ppt/notesSlides/notesSlide1.xml',
      '<p:notes><a:t>These notes expose the model-use policy.</a:t></p:notes>',
    );

    await expect(saveToGoogleSlides(blob, 'Slide Decks', 'Research Methods', {})).rejects.toThrow(
      'Slide Decks PPTX export exposes internal model-use policy language in ppt/notesSlides/notesSlide1.xml.',
    );
  });
});
