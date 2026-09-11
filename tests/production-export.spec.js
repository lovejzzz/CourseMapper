import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('built-site PDF reports a failed font fetch, then downloads complete symbols on retry under the real CSP', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'public',
        modelId: 'scion-public',
        courseMap: {
          courseName: 'Production PDF Check ✓',
          lessons: [
            {
              title: 'Proportions',
              sections: [
                {
                  learningGoals: 'Calculate a proportion.',
                  topicSection: 'Observed proportion',
                  learningObjectives: 'Calculate 7/12 as a percentage.',
                  weeklyAssessments: 'Calculation → Assignment Briefs / Lesson 01',
                  evaluateDesign: true,
                },
              ],
            },
          ],
        },
        columns: [
          { key: 'weeklyAssessments', label: 'Assessments', enabled: true },
          { key: 'evaluateDesign', label: 'Evaluate', enabled: true },
        ],
        selectedFeatures: ['courseMap'],
        deliverables: {},
        activeTab: 'courseMap',
        promptText: 'A formative proportions workshop.',
        userEdits: [],
        chatHistory: [],
        fileNames: [],
        versionHistory: [],
      }),
    );
  });
  let modelRequests = 0;
  await page.route(/huggingface\.co|\/api\/scion\/complete|generativelanguage\.googleapis\.com/, (route) => {
    modelRequests++;
    return route.abort();
  });
  const symbolAsset = /\/assets\/NotoSansSC-Symbols-.*\.otf(?:\?|$)/;
  await page.route(symbolAsset, (route) => route.fulfill({ status: 503, body: 'Temporary font outage' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  const panel = page.getByTestId('export-side-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('export-format-pdf').click();
  await expect(panel.getByRole('alert')).toContainText('PDF symbols could not be loaded');
  await expect(panel.getByText('✓ Done!', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Failed to export:/)).toHaveCount(0);
  await page.unroute(symbolAsset);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-format-pdf').click()]);
  expect(await download.failure()).toBeNull();
  const file = testInfo.outputPath('production-course-map.pdf');
  await download.saveAs(file);
  const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(file)), isEvalSupported: false }).promise;
  const pageOne = await pdf.getPage(1);
  const text = (await pageOne.getTextContent()).items
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ');
  await pdf.destroy();
  expect(text).toContain('Calculation → Assignment Briefs / Lesson 01');
  expect(text).toContain('✓');
  expect(modelRequests).toBe(0);
});

test('built-site policy permits configured public reference providers and blocks unknown origins', async ({ page }) => {
  const providers = [
    'https://api.openalex.org/works',
    'https://api.ies.ed.gov/eric/',
    'https://openlibrary.org/search.json',
    'https://api.crossref.org/works',
    'https://en.wikipedia.org/w/api.php',
    'https://www.loc.gov/search/',
    'https://archive.org/advancedsearch.php',
    'https://doaj.org/api/search/articles',
    'https://www.ebi.ac.uk/europepmc/webservices/rest/search',
    'https://www.w3.org/WAI/tutorials/forms/',
  ];
  for (const url of providers) {
    await page.route(url, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ provider: url }),
      }),
    );
  }
  await page.goto('/');
  const results = await page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (url) => {
          try {
            return await (await fetch(url, { credentials: 'omit' })).json();
          } catch {
            return { failed: url };
          }
        }),
      ),
    providers,
  );
  expect(results).toEqual(providers.map((provider) => ({ provider })));
  await page.route('https://unconfigured-reference.invalid/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      body: 'unexpected',
    }),
  );
  expect(
    await page.evaluate(async () => {
      try {
        await fetch('https://unconfigured-reference.invalid/');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    }),
  ).toBe('blocked');
});
