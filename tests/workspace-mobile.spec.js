import { expect, test } from '@playwright/test';

async function restoreGeneratedWorkspace(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        modelName: 'GPT-4o mini',
        courseMap: {
          courseName: 'Mobile Layout Course',
          semester: 'Spring 2026',
          lessons: [
            {
              title: 'Lesson 1',
              learningGoals: ['Goal 1'],
              topics: ['Topic 1'],
              learningObjectives: ['Objective 1'],
              weeklyAssessments: ['Assessment 1'],
              asynchronousActivities: ['Activity 1'],
              synchronousActivities: ['Discussion 1'],
            },
          ],
        },
        columns: [],
        userEdits: [],
        chatHistory: [],
        fileNames: [],
        versionHistory: [],
        selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
        deliverableConfig: { lessonPlans: {}, slideDecks: { slideCount: 3 } },
        lessonScope: { type: 'all' },
        promptText: 'Mobile layout course',
        activeTab: 'lessonPlans',
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: {
              lessonPlans: [
                {
                  lessonTitle: 'Lesson 1',
                  overview: 'A practical lesson plan for mobile layout testing.',
                  activities: ['Discuss responsive workspace patterns.'],
                },
              ],
            },
            error: null,
            stale: false,
          },
          slideDecks: {
            status: 'done',
            data: {
              decks: [
                {
                  lessonTitle: 'Lesson 1',
                  slides: [
                    { title: 'Intro', bullets: ['A'] },
                    { title: 'Practice', bullets: ['B'] },
                  ],
                },
              ],
            },
            error: null,
            stale: false,
          },
        },
        savedAt: Date.now(),
      }),
    );
  });
  await page.reload();
  await expect(page.locator('button:has-text("Resume")')).toBeVisible({ timeout: 10000 });
  await page.locator('button:has-text("Resume")').click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe('Generated workspace mobile layout', () => {
  for (const viewport of [
    { label: 'phone', width: 390, height: 844 },
    { label: 'tablet', width: 768, height: 1024 },
  ]) {
    test(`keeps content, agent, and export panels within a ${viewport.label} viewport`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await restoreGeneratedWorkspace(page);

      await expect(page.getByTestId('mobile-workspace-switcher')).toBeVisible();
      await expect(page.getByTestId('workspace-content-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-agent-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);

      await page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Agent' }).click();
      await expect(page.getByTestId('workspace-agent-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-content-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);

      await page.getByTestId('mobile-workspace-switcher').getByRole('button', { name: 'Export' }).click();
      await expect(page.getByTestId('workspace-export-panel')).toBeVisible();
      await expect(page.getByTestId('workspace-agent-panel')).toBeHidden();
      await expectNoHorizontalOverflow(page);
    });
  }
});
