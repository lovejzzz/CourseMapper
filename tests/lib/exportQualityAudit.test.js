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
});
