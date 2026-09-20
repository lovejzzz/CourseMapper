// Run against a production build with all three VITE_AUTHORING_*_ENABLED flags false.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
const output = new URL('../../verification-output/external-authoring/', import.meta.url);
await mkdir(new URL('rollback/', output), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(20000);
await page.addInitScript(() => {
  window.__registeredPageTools = [];
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool(tool) {
        window.__registeredPageTools.push(tool.name);
      },
      unregisterTool() {},
    },
  });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${process.env.AUTHORING_TEST_URL || 'http://127.0.0.1:5189'}/?authoring=1`);
  await page.getByText('Some authoring functions are temporarily disabled.', { exact: false }).waitFor();
  await page.getByLabel('Course title', { exact: true }).fill('Disabled request');
  await page.getByLabel('Teaching brief', { exact: true }).fill('Must not create a request');
  assert.equal(await page.getByRole('button', { name: 'Save request', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#landing-file-input').setInputFiles({
    name: 'saved.coursemapper',
    mimeType: 'application/json',
    buffer: await readFile(new URL('roundtrip.coursemapper', output)),
  });
  await page.getByRole('heading', { name: 'Authoring browser acceptance', exact: true }).waitFor();
  await page.getByRole('button', { name: /^Lesson Plans/ }).click();
  await page.getByText('Teacher edit: preserve this exact explanation.', { exact: false }).first().waitFor();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '.docx', exact: true }).click();
  const download = await waiting;
  await download.saveAs(fileURLToPath(new URL('rollback/preserved-lesson.docx', output)));
  assert.deepEqual(await page.evaluate(() => window.__registeredPageTools), []);
  const zip = await JSZip.loadAsync(await readFile(new URL('rollback/preserved-lesson.docx', output)));
  const xml = await zip.file('word/document.xml').async('string');
  assert(xml.includes('Teacher edit: preserve this exact explanation.'));
  assert(xml.includes('回环卡'));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: fileURLToPath(new URL('rollback/preserved-course.png', output)), fullPage: true });
  await writeFile(
    new URL('rollback/result.json', output),
    JSON.stringify(
      {
        passed: true,
        newRequestsDisabled: true,
        pageToolRegistrationDisabled: true,
        docxContentsVerified: true,
        existingCourseReadable: true,
        teacherEditPreserved: true,
        docxExportSucceeded: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('Disabled build rejects new requests and reads/exports existing authored course.');
} catch (error) {
  console.error(error);
  await page
    .screenshot({ path: fileURLToPath(new URL('rollback/failure.png', output)), timeout: 5000 })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
