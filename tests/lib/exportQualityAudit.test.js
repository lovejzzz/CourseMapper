import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { auditCourseMaterialsZip } from './exportQualityAudit.js';

const tempPaths = [];

async function writeTempZip(name, outerZip) {
  const target = path.join(os.tmpdir(), name);
  tempPaths.push(target);
  await fs.writeFile(target, await outerZip.generateAsync({ type: 'nodebuffer' }));
  return target;
}

async function buildDocxBuffer(documentText) {
  const docx = new JSZip();
  docx.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document><w:body><w:p><w:r><w:t>${documentText}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return docx.generateAsync({ type: 'nodebuffer' });
}

async function buildXlsxBuffer(sharedText) {
  const xlsx = new JSZip();
  xlsx.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst><si><t>${sharedText}</t></si></sst>`);
  xlsx.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData><row><c t="s"><v>0</v></c></row></sheetData></worksheet>',
  );
  return xlsx.generateAsync({ type: 'nodebuffer' });
}

async function buildPptxBuffer(slideText, noteText = '') {
  const pptx = new JSZip();
  pptx.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?><p:sld><p:cSld><a:t>${slideText}</a:t></p:cSld></p:sld>`,
  );
  if (noteText) {
    pptx.file(
      'ppt/notesSlides/notesSlide1.xml',
      `<?xml version="1.0" encoding="UTF-8"?><p:notes><a:t>${noteText}</a:t></p:notes>`,
    );
  }
  return pptx.generateAsync({ type: 'nodebuffer' });
}

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((target) => fs.rm(target, { force: true })));
});

describe('auditCourseMaterialsZip', () => {
  it('flags unresolved syllabus placeholders that make the export non-publishable', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Syllabus/Placeholder Course - Syllabus.docx',
      await buildDocxBuffer('Meeting: [Verify time] Instructor: [Instructor email] Office: [Office location]'),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues.join(' ')).toContain('[Verify time]');
    expect(audit.issues.join(' ')).toContain('[Instructor email]');
  });

  it('reports multiple distinct placeholders from the same placeholder family', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Syllabus/Placeholder Course - Syllabus.docx',
      await buildDocxBuffer('Meeting: [Verify time] Deadline: [Verify deadline] Office: [Office location]'),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-multi.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues.join(' ')).toContain('[Verify time]');
    expect(audit.issues.join(' ')).toContain('[Verify deadline]');
    expect(audit.issues.join(' ')).toContain('[Office location]');
  });

  it('flags course-map spreadsheet authoring guidance that leaks into exports', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Course Map/Placeholder Course - Course Map.xlsx',
      await buildXlsxBuffer(
        "Week or Module [Topic] [Learning Objective: Describe what students will need to be able to know and do using active verbs from Revised Bloom's taxonomy] [Ask yourself: Is everything in this row aligned and coherent?]",
      ),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-xlsx.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues.join(' ')).toContain('Week or Module [Topic]');
    expect(audit.issues.join(' ')).toContain('Learning Objective: Describe');
    expect(audit.issues.join(' ')).toContain('Ask yourself');
  });

  it('flags internal compiler proof language in exported Office files', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Lesson Plans/Proof Leak - Lesson Plans.docx',
      await buildDocxBuffer('This instructor handout exposes the compiler decision.'),
    );
    outerZip.file(
      'Slide Decks/Proof Leak - Slide Decks.pptx',
      await buildPptxBuffer('Clean slide title', 'Speaker notes expose the publish gate.'),
    );
    outerZip.file(
      'Course Map/Proof Leak - Course Map.xlsx',
      await buildXlsxBuffer('This workbook exposes source grounding details.'),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-proof-language.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath, { minSpeakerNoteWords: 1 });
    const issues = audit.issues.join('\n');

    expect(issues).toContain('Lesson Plans/Proof Leak - Lesson Plans.docx: leaked internal compiler decision language');
    expect(issues).toContain('Slide Decks/Proof Leak - Slide Decks.pptx: leaked internal publish gate language');
    expect(issues).toContain('Course Map/Proof Leak - Course Map.xlsx: leaked internal source grounding language');
  });

  it('aggregates Course FAQ question counts across per-lesson files', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Course FAQ/Lesson 01 - Foundations - Course FAQ.docx',
      await buildDocxBuffer('Lesson 1: Foundations Q1 What matters? Q2 How do I prepare?'),
    );
    outerZip.file(
      'Course FAQ/Lesson 02 - Policy History - Course FAQ.docx',
      await buildDocxBuffer('Lesson 2: Policy History Q1 What changed? Q2 What evidence should I use?'),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-faq-split.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath, {
      expectedFaqQuestionsPerLesson: {
        'Lesson 1: Foundations': 2,
        'Lesson 2: Policy History': 2,
      },
    });

    expect(audit.issues).toEqual([]);
  });

  it('flags data-science packages that reference lab assets without bundling or marking them', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Study Guides/Lesson 01 - Model Validation - Study Guides.docx',
      await buildDocxBuffer(
        'Use the Jupyter notebook and course dataset to compare train-test validation, confusion matrix, precision, recall, threshold choice, and model card limits.',
      ),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-missing-lab-assets.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues.join('\n')).toContain('includes no lab asset file and no Required Assets marker');
  });

  it('does not treat UX research notebooks or usability datasets as data-science lab assets', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Study Guides/Lesson 01 - UX Research - Study Guides.docx',
      await buildDocxBuffer(
        'Use a critique notebook, interview notes, usability-testing dataset, prototype validation questions, and journey-map evidence to improve the design case study.',
      ),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-ux-research-assets.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues).toEqual([]);
  });

  it('does not combine generic finance notebook and rubric precision language into a data-science asset signal', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Assignment Briefs/Lesson 04 - Finance Worksheet - Assignment Briefs.docx',
      await buildDocxBuffer(
        'Complete a cap table worksheet and notebook entry that explains ownership, dilution, and valuation choices.',
      ),
    );
    outerZip.file(
      'Rubrics/Lesson 04 - Finance Worksheet - Rubrics.docx',
      await buildDocxBuffer(
        'Evaluate precision, recall of venture terms, classification of investor-friendly clauses, and explanation quality.',
      ),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-finance-notebook.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues).toEqual([]);
  });

  it('does not treat AI-governance model-card documentation as a missing lab asset by itself', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Study Guides/Lesson 02 - Model Documentation - Study Guides.docx',
      await buildDocxBuffer(
        'Compare model-card documentation, privacy law basics, algorithmic bias evidence, and public-sector procurement review in an AI governance policy memo.',
      ),
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-ai-governance-model-card.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues).toEqual([]);
  });

  it('accepts data-science packages with an explicit required lab-assets marker', async () => {
    const outerZip = new JSZip();
    outerZip.file(
      'Study Guides/Lesson 01 - Model Validation - Study Guides.docx',
      await buildDocxBuffer(
        'Use the Jupyter notebook and course dataset to compare train-test validation, confusion matrix, precision, recall, threshold choice, and model card limits.',
      ),
    );
    outerZip.file(
      'Required Assets/Applied Machine Learning - Required Lab Assets.md',
      '# Required Lab Assets\n\n- Course dataset (.csv)\n- Starter lab notebook (.ipynb)\n- Model card or validation template (.md)',
    );

    const zipPath = await writeTempZip('coursemapper-export-quality-audit-lab-assets-marker.zip', outerZip);
    const audit = await auditCourseMaterialsZip(zipPath);

    expect(audit.issues).toEqual([]);
  });
});
