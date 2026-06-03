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
      agentPanel.getByText(
        'Your generated workspace is ready. I can still run local Audit and Plan. Configure AI for chat and model edits.',
      ),
    ).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-audit-quality')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-plan-next')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-configure-agent')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-improve-active')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-starter-local-audit')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-starter-local-plan')).toBeVisible();
    await expect(
      agentPanel.getByText('Local Audit and Plan are available above. Connect AI for chat and model-based edits.'),
    ).toBeVisible();

    const composer = agentPanel.locator('textarea');
    await expect(composer).toBeEnabled();
    await expect(composer).toHaveAttribute('placeholder', 'Configure AI to chat or edit with the agent…');
    await expect(agentPanel.getByLabel('Send message')).toBeDisabled();

    await composer.fill('Please improve this without a key');
    await expect(agentPanel.getByLabel('Send message')).toBeDisabled();

    await composer.fill('/plan');
    await expect(agentPanel.getByTestId('agent-slash-command-palette')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-slash-command-plan-next')).toBeVisible();
    await composer.press('Enter');
    await expect(
      agentPanel.getByText('Inspecting the workspace and building a plan from the Agent command.'),
    ).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByTestId('agent-activity-receipt').first()).toContainText('2 tools', {
      timeout: 10000,
    });
    await expect(agentPanel.getByTestId('agent-activity-receipt').first()).toContainText('0 issues');
    await expect(agentPanel.getByTestId('workspace-plan-card')).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByText('Plan ready. Start with:', { exact: false })).toBeVisible({ timeout: 10000 });
    expect(aiRequests).toEqual([]);

    const planningReceipt = agentPanel.getByTestId('agent-receipt-card').filter({ hasText: 'Planning receipt' });
    await expect(planningReceipt).toHaveCount(1);
    await expect(planningReceipt).toContainText('Plan ready');
    await planningReceipt.getByTestId('agent-receipt-action-audit-quality').click();
    await expect(agentPanel.getByText('Running a read-only package audit from the Agent receipt.')).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByTestId('agent-activity-receipt').last()).toContainText('3 tools', {
      timeout: 10000,
    });
    await expect(agentPanel.getByText('Audit complete.', { exact: false })).toHaveCount(1, { timeout: 10000 });
    await expect(planningReceipt.getByTestId('agent-receipt-action-audit-quality')).toContainText('Done');
    await expect(planningReceipt.getByTestId('agent-receipt-action-state-audit-quality')).toContainText('Done');
    expect(aiRequests).toEqual([]);

    await agentPanel.getByTestId('agent-starter-local-audit').click();
    await expect(agentPanel.getByText('Running a read-only package audit from the Agent starter.')).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByTestId('agent-activity-receipt').last()).toContainText('3 tools', {
      timeout: 10000,
    });
    await expect(agentPanel.getByText('Audit complete.', { exact: false })).toHaveCount(2, { timeout: 10000 });
    expect(aiRequests).toEqual([]);

    await agentPanel.getByTestId('configure-agent-ai-button').click();
    await expect(page.locator('h1:has-text("Everything you need")')).toBeVisible({ timeout: 10000 });

    expect(aiRequests).toEqual([]);
    expect(consoleErrors.filter((text) => text.includes('NO_API_KEY'))).toEqual([]);
  });
});
