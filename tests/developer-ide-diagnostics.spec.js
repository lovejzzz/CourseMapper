import { expect, test } from '@playwright/test';

const SECRET_DIAGNOSTIC_PATH = 'deliverableConfig.slideDecks.extraInstructions';
const CONFIG_WARNING_PATH = 'deliverableConfig.slideDecks.customUserPrompt';
const FAKE_OPENAI_KEY = ['sk', 'proj', 'developerdiagnosticstestkey1234567890'].join('-');

function developerDiagnosticsFixture() {
  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    courseMap: {
      courseName: 'Developer Diagnostics Course',
      semester: 'Spring 2026',
      lessons: [
        {
          title: 'Lesson 1',
          sections: [
            {
              learningGoals: 'Explain how developer diagnostics protect project state.',
              topicSection: 'Developer Mode health checks',
              learningObjectives: 'Trace a JSON diagnostic to its editable location.',
              weeklyAssessments: 'Short audit memo',
              asyncActivities: 'Review a project snapshot fixture.',
              syncActivities: 'Click diagnostics and inspect the selected editor line.',
            },
          ],
        },
      ],
    },
    columns: [
      { key: 'learningGoals', label: 'Learning Goals', enabled: true },
      { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
    ],
    userEdits: [],
    chatHistory: [],
    fileNames: [],
    versionHistory: [],
    selectedFeatures: ['courseMap', 'slideDecks'],
    deliverableConfig: {
      slideDecks: {
        slideCount: 4,
        extraInstructions: `Never persist this fake test key: ${FAKE_OPENAI_KEY}`,
        customUserPrompt: 'Generate slide decks without the required course-map placeholder.',
      },
    },
    lessonScope: { type: 'all' },
    promptText: 'Developer diagnostics course',
    activeTab: 'slideDecks',
    deliverables: {
      slideDecks: {
        status: 'done',
        data: {
          decks: [
            {
              lessonTitle: 'Lesson 1',
              slides: [
                { title: 'Diagnostics', bullets: ['Find secret-bearing snapshot values.'] },
                { title: 'Jump to Path', bullets: ['Open the config editor at the diagnostic path.'] },
              ],
            },
          ],
        },
        error: null,
        stale: false,
      },
    },
    savedAt: Date.now(),
  };
}

async function restoreDeveloperWorkspace(page) {
  const snapshot = developerDiagnosticsFixture();
  await page.addInitScript((projectSnapshot) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('coursemapper-project', JSON.stringify(projectSnapshot));
    localStorage.setItem('coursemapper-developer-mode', 'true');
  }, snapshot);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
}

test.describe('Developer IDE diagnostics', () => {
  test('sanitizes secret-bearing snapshots and jumps to the matching diagnostic editor location', async ({ page }) => {
    await restoreDeveloperWorkspace(page);

    await page.getByTestId('signed-out-advanced-menu').click();
    await page.getByRole('button', { name: 'Open Developer IDE' }).click();
    await expect(page.getByTestId('developer-mode-panel')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('developer-section-diagnostics').click();
    await expect(page.getByTestId('developer-diagnostics-panel')).toBeVisible();

    const secretFinding = page.locator(
      `[data-testid="developer-diagnostic-finding"][data-path="${SECRET_DIAGNOSTIC_PATH}"]`,
    );
    await expect(secretFinding).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(FAKE_OPENAI_KEY);

    const configFinding = page.locator(
      `[data-testid="developer-diagnostic-finding"][data-path="${CONFIG_WARNING_PATH}"]`,
    );
    await expect(configFinding).toBeVisible();
    await expect(configFinding).toHaveAttribute('data-level', 'warning');
    await expect(configFinding).toContainText('Custom user prompt should include {{courseMap}}.');

    await page.locator(`[data-testid="developer-diagnostic-path"][data-path="${CONFIG_WARNING_PATH}"]`).click();

    await expect(page.getByTestId('developer-code-editor-config')).toBeVisible();
    await expect(page.getByTestId('developer-code-editor-config')).toContainText('[redacted secret]');
    await expect(page.getByTestId('developer-code-editor-config')).not.toContainText(FAKE_OPENAI_KEY);
    await expect(page.getByTestId('developer-status')).toContainText(`Selected ${CONFIG_WARNING_PATH} at line`);
    await expect(page.getByTestId('developer-code-cursor')).toContainText(/Ln \d+, Col \d+/);
  });
});
