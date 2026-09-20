import { chromium } from '@playwright/test';
import PptxGenJS from 'pptxgenjs';
import { buildXlsxWorkbook } from '../../src/lib/lightweightXlsx.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const output = new URL('../../verification-output/external-authoring/formats/', import.meta.url);
await mkdir(output, { recursive: true });
// Minimal two-page PDF fixture, including an xref table for a real parser.
const pdfObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  ...[6, 7].map(
    (stream) =>
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${stream} 0 R >>`,
  ),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ...['PDF-FIRST-PAGE teaching evidence', 'PDF-SECOND-PAGE assessment evidence'].map((text) => {
    const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }),
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
for (const [index, object] of pdfObjects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 8\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
  .join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const slides = new PptxGenJS();
slides.addSlide().addText('SLIDE-FIRST 中文 learning objective', { x: 1, y: 1, w: 8, h: 1 });
slides.addSlide().addText('SLIDE-SECOND rubric evidence', { x: 1, y: 1, w: 8, h: 1 });
const workbook = await buildXlsxWorkbook({
  sheets: [
    {
      name: 'Objectives',
      rows: [
        ['SHEET-FIRST', '中文目标'],
        ['Compare', '30'],
      ],
    },
    {
      name: 'Assessment',
      rows: [
        ['SHEET-SECOND', 'Rubric'],
        ['Evidence', '70'],
      ],
    },
  ],
});
const files = [
  { name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
  {
    name: 'evidence.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: await slides.write({ outputType: 'nodebuffer' }),
  },
  {
    name: 'evidence.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(workbook),
  },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [],
  externalWorkerRequests = [],
  transmissions = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.postData()?.match(/PDF-FIRST|SLIDE-FIRST|SHEET-FIRST/)) transmissions.push(request.url());
});
await context.route('https://cdnjs.cloudflare.com/**', (route) => {
  externalWorkerRequests.push(route.request().url());
  return route.abort();
});
try {
  await page.goto(`${process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5189'}/?authoring=1`);
  await page.getByLabel('Course title', { exact: true }).fill('Document format verification');
  await page.getByLabel('Teaching brief', { exact: true }).fill('Use the selected text evidence.');
  await page.getByLabel('Source files to review', { exact: true }).setInputFiles(files);
  for (const file of files) {
    const share = page.getByRole('checkbox', { name: `Share ${file.name}`, exact: true });
    await share.waitFor();
    assert.equal(await share.isChecked(), false);
    await share.check();
    await page.getByText(`Review extracted text: ${file.name}`, { exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page.getByText('Shared source: evidence.pdf', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copy task for AI', exact: true }).click();
  await page.getByText('Task copied. Paste it into your AI conversation.', { exact: true }).waitFor();
  const task = await page.evaluate(() => navigator.clipboard.readText());
  for (const text of [
    'PDF-FIRST-PAGE',
    'PDF-SECOND-PAGE',
    'SLIDE-FIRST',
    'SLIDE-SECOND',
    '中文',
    'SHEET-FIRST',
    'SHEET-SECOND',
    '中文目标',
  ])
    assert(task.includes(text), `Missing extracted evidence: ${text}`);
  assert.equal((task.match(/"visualStatus":"unreviewed"/g) || []).length, 3);
  assert.deepEqual(externalWorkerRequests, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(transmissions, []);
  await page.screenshot({ path: fileURLToPath(new URL('formats.png', output)), fullPage: true });
  await writeFile(
    new URL('result.json', output),
    JSON.stringify(
      {
        passed: true,
        formats: ['pdf', 'pptx', 'xlsx'],
        multiPageSlideSheetVerified: true,
        unicodeOfficeTextVerified: true,
        visualLimitationsPreserved: true,
        externalWorkerRequests,
        errors,
        transmissions,
      },
      null,
      2,
    ),
  );
  console.log('PDF, PPTX and XLSX local extraction passed with external CDN blocked.');
} catch (error) {
  console.error(error);
  await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), timeout: 5000 }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
