import { expect, test } from '@playwright/test';

/**
 * v0.8.6 — package trust strip.
 *
 * Restores a generated workspace with a mix of compiled, custom, stale, and
 * failed deliverables, then verifies the workspace header surfaces honest
 * provenance chips without opening receipts.
 */
async function restoreMixedTrustWorkspace(page) {
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
          courseName: 'Trust Strip Course',
          semester: 'Spring 2026',
          lessons: [
            {
              title: 'Lesson 1: Provenance',
              sections: [
                {
                  topicSection: '1.1: Compiled output',
                  learningObjectives: 'Students will be able to:\n1. Explain compiled provenance.',
                },
              ],
            },
          ],
        },
        columns: [],
        userEdits: [],
        chatHistory: [],
        fileNames: [],
        versionHistory: [],
        selectedFeatures: ['courseMap', 'lessonPlans', 'quizBank', 'custom_feedback_form', 'rubrics'],
        deliverableConfig: { lessonPlans: {}, quizBank: {}, custom_feedback_form: {}, rubrics: {} },
        lessonScope: { type: 'all' },
        promptText: 'Trust strip course',
        activeTab: 'lessonPlans',
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: { lessonPlans: [{ lessonTitle: 'Lesson 1: Provenance', overview: 'Compiled plan.' }] },
            error: null,
            stale: false,
          },
          quizBank: {
            status: 'done',
            data: { quizzes: [{ lt: 'Lesson 1: Provenance', qs: [] }] },
            error: null,
            stale: true,
          },
          custom_feedback_form: {
            status: 'done',
            data: { items: [{ title: 'Feedback form 1' }] },
            error: null,
            stale: false,
          },
          rubrics: {
            status: 'error',
            data: null,
            error: 'Generation failed for rubrics.',
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

test.describe('Package trust strip', () => {
  test('shows compiled, custom, stale, and failed chips for a restored mixed package', async ({ page }) => {
    await restoreMixedTrustWorkspace(page);

    const strip = page.getByTestId('package-trust-strip');
    await expect(strip).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('trust-chip-compiled')).toHaveText('2 compiled');
    await expect(page.getByTestId('trust-chip-custom')).toHaveText('1 custom');
    await expect(page.getByTestId('trust-chip-stale')).toHaveText('1 stale');
    await expect(page.getByTestId('trust-chip-failed')).toHaveText('1 failed');
  });

  test('shows no trust strip on a fresh landing page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await expect(page.getByTestId('package-trust-strip')).toHaveCount(0);
  });
});
