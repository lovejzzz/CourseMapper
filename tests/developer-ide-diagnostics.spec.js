import { expect, test } from '@playwright/test';

const SECRET_DIAGNOSTIC_PATH = 'deliverableConfig.slideDecks.extraInstructions';
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
  test('flags secret-bearing snapshot fields and jumps to the matching editor location', async ({ page }) => {
    await restoreDeveloperWorkspace(page);

    await page.getByRole('button', { name: 'IDE', exact: true }).click();
    await expect(page.getByTestId('developer-mode-panel')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('developer-section-diagnostics').click();
    await expect(page.getByTestId('developer-diagnostics-panel')).toBeVisible();

    const secretFinding = page.locator(
      `[data-testid="developer-diagnostic-finding"][data-path="${SECRET_DIAGNOSTIC_PATH}"]`,
    );
    await expect(secretFinding).toBeVisible();
    await expect(secretFinding).toHaveAttribute('data-level', 'error');
    await expect(secretFinding).toContainText('OpenAI API key detected');
    await expect(secretFinding).toContainText('Remove it before applying or saving developer state.');

    await page.locator(`[data-testid="developer-diagnostic-path"][data-path="${SECRET_DIAGNOSTIC_PATH}"]`).click();

    await expect(page.getByTestId('developer-code-editor-config')).toBeVisible();
    await expect(page.getByTestId('developer-status')).toContainText(`Selected ${SECRET_DIAGNOSTIC_PATH} at line`);
    await expect(page.getByTestId('developer-code-cursor')).toContainText(/Ln \d+, Col \d+/);
  });
});
