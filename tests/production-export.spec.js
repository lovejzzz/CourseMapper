import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openWorkspaceDrawer } from './lib/workspaceDrawers.js';

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
  await openWorkspaceDrawer(page, 'export');
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
    'https://zh.wikipedia.org/w/api.php',
    'https://en.wikisource.org/w/api.php',
    'https://zh.wikisource.org/w/api.php',
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

test('built-site Firebase sign-in can load Google bootstrap while unknown scripts remain blocked', async ({ page }) => {
  // Exercise Firebase's real sign-in entry point under the built HTML's CSP.
  // Only the network response is stubbed; this does not claim OAuth succeeds.
  await page.route('https://apis.google.com/js/api.js?*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.__googleAuthBootstrapLoaded = true;' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Continue with Google' }).click();
  await expect.poll(() => page.evaluate(() => window.__googleAuthBootstrapLoaded === true)).toBe(true);
  await page.route('https://unconfigured-script.invalid/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'window.__unexpectedScriptLoaded = true;' }),
  );
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://unconfigured-script.invalid/test.js';
        script.onload = () => resolve('allowed');
        script.onerror = () => resolve('blocked');
        document.head.append(script);
      }),
  );
  expect(result).toBe('blocked');
  expect(await page.evaluate(() => window.__unexpectedScriptLoaded)).toBeUndefined();
});

test('release page preserves latest details and the complete historical changelog', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'v0.20.08', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'v0.20.08', exact: true }).click();
  await expect(page).toHaveURL(/#\/changelog$/);
  await expect(page.locator('[id="release-0.20.08"]')).toContainText('Your material reaches the quiz');
  await expect(page.locator('[id="release-0.20.08"]')).toContainText('Retain v0.20.07 and all earlier release notes');
  await page.getByRole('button', { name: 'Browse previous releases' }).click();
  await expect(page.locator('[id="release-0.20.07"]')).toBeInViewport();
  await expect(page.locator('[id="release-0.20.06"]')).toHaveCount(1);
  await expect(page.locator('[id="release-0.19.99"]')).toContainText('Linked Materials, Reliable Revisions');
  await expect(page.locator('[id="release-0.19.2"]')).toHaveCount(1);
  await expect(page.locator('[id="release-0.15.3"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[id="release-0.20.08"]')).toHaveCount(1);
  await expect(page.locator('[id="release-0.20.07"]')).toHaveCount(1);
  await expect(page.locator('[id="release-0.20.06"]')).toHaveCount(1);
  await expect(page.locator('[id="release-0.19.99"]')).toHaveCount(1);
  const response = await page.request.get('/release.json');
  expect(await response.json()).toMatchObject({ version: '0.20.8', displayVersion: '0.20.08' });
  expect(errors).toEqual([]);
});

test('read-only MCP inspects output without authoring requests or course mutation and revokes on reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const tools = new Map();
    window.courseMcpTestTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: (tool) => tools.set(tool.name, tool),
        unregisterTool: (name) => tools.delete(name),
      },
    });
    if (!localStorage.getItem('coursemapper-project'))
      localStorage.setItem(
        'coursemapper-project',
        JSON.stringify({
          formatVersion: 1,
          hasGenerated: true,
          provider: 'public',
          modelId: 'scion-public',
          courseMap: {
            courseName: 'Direct MCP test',
            lessons: [
              {
                id: 'mcp-lesson',
                title: 'Original lesson',
                sections: [
                  { topicSection: 'Topic', learningGoals: 'Original goal', learningObjectives: 'Original goal' },
                ],
              },
            ],
          },
          selectedFeatures: ['courseMap'],
          deliverables: {},
          activeTab: 'courseMap',
          userEdits: [],
          chatHistory: [],
          fileNames: [],
          versionHistory: [],
        }),
      );
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'MCP', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI authoring', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MCP', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.courseMcpTestTools.size)).toBe(0);
  await page.goto('/?debug=output');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'MCP', exact: true }).click();
  const access = page.getByLabel('Allow MCP to inspect generated output in this tab');
  await access.check();
  const call = (name, args = {}) =>
    page.evaluate(({ name, args }) => window.courseMcpTestTools.get(name).execute(args), { name, args });
  const read = await call('cm_course_read');
  expect(read.ok).toBe(true);
  expect(JSON.parse(read.data.text).courseName).toBe('Direct MCP test');
  const diagnostics = await call('cm_course_diagnostics');
  expect(diagnostics.data.paths).toContain('/courseMap');
  expect(diagnostics.data.lessonCount).toBe(1);
  expect(await page.evaluate(() => [...window.courseMcpTestTools.keys()].sort())).toEqual([
    'cm_course_diagnostics',
    'cm_course_read',
    'cm_course_status',
  ]);
  await access.uncheck();
  expect((await call('cm_course_read')).error.code).toBe('ACCESS_REQUIRED');
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText('Original lesson', { exact: true }).first()).toBeVisible();
  expect((await call('cm_course_read')).error.code).toBe('ACCESS_REQUIRED');
  expect(errors).toEqual([]);
});
