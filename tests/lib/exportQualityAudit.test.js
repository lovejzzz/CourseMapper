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
});
