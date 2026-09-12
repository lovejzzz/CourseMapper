import JSZip from 'jszip';
import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { CODING_PRACTICE } from '../src/lib/codingPracticeCatalog.js';
const example = (id) => CODING_PRACTICE.find((row) => row.id === id);

test('coding reference pages meet keyboard and responsive acceptance checks', async ({ page }) => {
  for (const id of ['semantic-page', 'responsive-grid']) {
    await page.setContent(example(id).solution);
    if (id === 'semantic-page') {
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('searchbox', { name: 'Find a project' })).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('searchbox')).toBeFocused();
    }
    for (const [width, columns] of [
      [390, 1],
      [699, 1],
      [700, 2],
      [900, 2],
    ]) {
      await page.setViewportSize({ width, height: 844 });
      const rects = await page
        .locator('article')
        .evaluateAll((nodes) => nodes.map((n) => ({ top: n.offsetTop, left: n.offsetLeft })));
      expect(rects[0].top === rects[1].top).toBe(columns === 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setContent(example('dom-counter').solution);
  await expect(page.locator('output')).toHaveText('0');
  await page.getByRole('button', { name: 'Add' }).click({ clickCount: 3 });
  await expect(page.locator('output')).toHaveText('3');
  await page.getByRole('button', { name: 'Add' }).press('Enter');
  await expect(page.locator('output')).toHaveText('4');
  await page.setContent(example('dom-list').solution);
  const input = page.getByRole('textbox', { name: 'Project name' });
  await input.fill('   ');
  await input.press('Enter');
  await expect(page.locator('li')).toHaveCount(0);
  await input.fill('Portfolio');
  await input.press('Enter');
  await expect(page.locator('li')).toHaveText(['Portfolio']);
  await expect(input).toHaveValue('');
  await input.fill('<b>Tracker</b>');
  await page.getByRole('button', { name: 'Add project' }).click();
  await expect(page.locator('li')).toHaveText(['Portfolio', '<b>Tracker</b>']);
  await expect(page.locator('li b')).toHaveCount(0);
});

test('integrated reference app handles success, missing route and a stopped server', async ({ page }) => {
  // Keep the exact handler and page from the exported answer; the test owns an
  // ephemeral listening port so it cannot collide with a learner's server.
  const source = example('full-stack-health').solution.replace('createServer(handler).listen(3000, "127.0.0.1");', '');
  const { handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(url);
    await expect(page.locator('output')).toHaveText('Not checked');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.locator('output')).toHaveText('Healthy');
    expect((await page.request.get(url + '/missing')).status()).toBe(404);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.locator('output')).toHaveText('Unavailable');
  } finally {
    if (server.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('coding materials render, retain literal code and survive autosave with a full localStorage bucket', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const snapshot = await page.evaluate(async () => {
    const { buildCourseBlueprint, compileBlueprintDeliverables } = await import('/src/lib/courseBlueprintCompiler.js');
    const titles = [
      'HTML and CSS',
      'JavaScript and DOM',
      'APIs and Front End Frameworks',
      'Responsive Design',
      'Document Object Model',
      'Working With Apis',
      'Server-side Basics',
      'Databases',
      'Authentication',
      'Front End Frameworks',
      'Deployment',
      'Final Application',
    ];
    const courseMap = {
      courseName: 'Full-Stack Web Development',
      lessons: titles.map((title) => ({
        title: `Lesson ${titles.indexOf(title) + 1}: ${title}`,
        sections: [{ topicSection: title, learningObjectives: `Implement ${title} and verify behavior.` }],
      })),
    };
    const features = [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'assignments',
      'rubrics',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ];
    const facts = [
      'HTML elements are the building blocks of HTML pages.',
      'HTML describes the structure of a web page semantically.',
      'HTML elements are delineated by tags, written using angle brackets.',
    ];
    const enrichment = {
      lessonContent: {
        'lesson-1': {
          enrichmentSource: 'evidence-authority-replay',
          sourceFactAuthority: 'admitted-evidence-authority',
          kernel: {
            facts,
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'admitted-evidence-authority',
              copiedFactsVerbatim: true,
              factCount: 3,
            },
          },
        },
      },
    };
    const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap, { enrichment }), features);

    return {
      formatVersion: 2,
      courseMap,
      hasGenerated: true,
      selectedFeatures: ['courseMap', ...features],
      activeTab: 'lessonPlans',
      deliverables: Object.fromEntries(features.map((id) => [id, { status: 'done', data: compiled[id] }])),
    };
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'coding-practice.coursemapper',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(snapshot)),
    });
  // Importing the full twelve-lesson archive includes decoding and graph migration.
  // Wait for completion, as the existing large-project roundtrip audit does.
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 30000 });
  for (const tab of [
    'Lesson Plans',
    'Assignment Briefs',
    'Rubrics',
    'Quiz & Exam Bank',
    'Study Guides',
    'Slide Decks',
    'Syllabus',
    'Discussion Prompts',
    'Course FAQ',
  ]) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const content = page.getByTestId('workspace-content-panel');
    await expect(content).not.toContainText('Generation failed');
    await expect(content).not.toContainText('Teacher review required: replace general guidance');
    await page.screenshot({ path: info.outputPath(`${tab.replaceAll(' ', '-')}.png`) });
  }
  await page.getByTestId('export-scope-all').click();
  await page.getByTestId('export-download-zip').click();
  await expect(page.getByTestId('readiness-status')).toContainText(/(?:Files|Review draft) ready to download/, {
    timeout: 90000,
  });
  await expect(page.getByTestId('teaching-readiness-caveat')).toContainText('Teaching readiness requires review');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download-zip').click(),
  ]);
  const zipPath = info.outputPath('coding-review.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  expect(zip.file('QUALITY_REPORT.md')).toBeTruthy();
  const planPath = Object.keys(zip.files).find((path) => /^Lesson Plans\/Lesson 07.*\.docx$/.test(path));
  const word = await JSZip.loadAsync(await zip.file(planPath).async('uint8array'));
  expect(await word.file('word/document.xml').async('string')).toContain('res.writeHead');
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  await expect(page.getByTestId('workspace-content-panel')).toContainText('Reference implementation');
  await expect(page.locator('[data-code-snippet]').first()).toBeVisible();
  expect(
    await page
      .locator('[data-code-snippet]')
      .first()
      .evaluate((node) => getComputedStyle(node).whiteSpace),
  ).toBe('pre-wrap');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-coding-guide.png') });
  // The user run saturated this origin-wide bucket while the exact IDB save
  // succeeded. Reproduce that boundary without affecting the user's profile.
  await page.evaluate(() => {
    let i = 0;
    try {
      while (true) localStorage.setItem(`quota-fixture-${i++}`, 'x'.repeat(65536));
    } catch {}
    // Force the tiny marker refusal too: removing the old marker can otherwise
    // free enough bytes for an equally-sized replacement in this fixture.
    localStorage.removeItem('coursemapper-project');
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'coursemapper-project') throw new DOMException('Full bucket', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Lesson Plans', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { loadProjectIndexedDbAutosave } = await import('/src/lib/projectIndexedDbAutosave.js');
          const value = await loadProjectIndexedDbAutosave();
          if (!value) return false;
          const saved = JSON.parse(value);
          return saved.activeTab === 'lessonPlans' && Object.keys(saved.deliverables || {}).length === 9;
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(page.getByText('Local save failed', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('workspace-content-panel')).toContainText('Reference implementation', {
    timeout: 30000,
  });
  expect(errors).toEqual([]);
});
