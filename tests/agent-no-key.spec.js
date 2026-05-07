import { expect, test } from '@playwright/test';

async function restoreGeneratedWorkspaceWithoutKey(page) {
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
          courseName: 'Agent No Key Course',
          semester: 'Spring 2026',
          lessons: [
            {
              title: 'Lesson 1',
              learningGoals: ['Explain reliable agent behavior.'],
              topics: ['Agent readiness'],
              learningObjectives: ['Identify when agent actions should be disabled.'],
              weeklyAssessments: ['Short reflection'],
              asynchronousActivities: ['Read the agent workflow notes.'],
              synchronousActivities: ['Discuss safe defaults.'],
            },
          ],
        },
        columns: [],
        userEdits: [],
        chatHistory: [],
        fileNames: [],
        versionHistory: [],
        selectedFeatures: ['courseMap', 'lessonPlans'],
        deliverableConfig: { lessonPlans: {} },
        lessonScope: { type: 'all' },
        promptText: 'Agent no key course',
        activeTab: 'lessonPlans',
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: {
              lessonPlans: [
                {
                  lessonTitle: 'Lesson 1',
                  overview: 'A generated lesson plan that puts the workspace in agent mode.',
                  activities: ['Check that missing provider configuration gates actions.'],
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

test.describe('Agent no-key behavior', () => {
  test('gates restored workspace agent actions until AI is configured', async ({ page }) => {
    const aiRequests = [];
    const consoleErrors = [];

    await page.route(
      /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.deepseek\.com/,
      (route) => {
        aiRequests.push(route.request().url());
        return route.abort();
      },
    );
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await restoreGeneratedWorkspaceWithoutKey(page);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel).toBeVisible();
    await expect(agentPanel.getByRole('heading', { name: 'Agent' })).toBeVisible();
    await expect(agentPanel.getByText('Provider/key required')).toBeVisible();
    await expect(
      agentPanel.getByText('Your generated workspace is ready. Configure AI to use the agent.'),
    ).toBeVisible();
    await expect(agentPanel.getByText('Agent actions need a connected AI provider or Local AI model.')).toBeVisible();

    const composer = agentPanel.locator('textarea');
    await expect(composer).toBeDisabled();
    await expect(composer).toHaveAttribute('placeholder', 'Configure AI to use the agent…');
    await expect(agentPanel.getByLabel('Send message')).toBeDisabled();

    await agentPanel.getByTestId('configure-agent-ai-button').click();
    await expect(page.locator('h1:has-text("Everything you need")')).toBeVisible({ timeout: 10000 });

    expect(aiRequests).toEqual([]);
    expect(consoleErrors.filter((text) => text.includes('NO_API_KEY'))).toEqual([]);
  });
});
