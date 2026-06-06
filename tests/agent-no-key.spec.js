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

async function restoreGeneratedWorkspaceWithSavedKey(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    const snapshot = {
      formatVersion: 1,
      hasGenerated: true,
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 mini',
      courseMap: {
        courseName: 'Agent Saved Key Course',
        semester: 'Spring 2026',
        lessons: [
          {
            title: 'Lesson 1',
            learningGoals: ['Explain restored agent readiness.'],
            topics: ['Saved provider state'],
            learningObjectives: ['Use the agent after resuming a saved workspace.'],
            weeklyAssessments: ['Short reflection'],
            asynchronousActivities: ['Review saved workspace state.'],
            synchronousActivities: ['Discuss resume behavior.'],
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
      promptText: 'Agent saved key course',
      activeTab: 'lessonPlans',
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              {
                lessonTitle: 'Lesson 1',
                overview: 'A generated lesson plan for restored readiness testing.',
                activities: ['Check that saved provider configuration enables agent actions.'],
              },
            ],
          },
          error: null,
          stale: false,
        },
      },
      savedAt: Date.now(),
    };
    const fakeKey = 'sk-proj-restored-agent-key-12345678901234567890';
    localStorage.setItem('coursemapper-project', JSON.stringify(snapshot));
    localStorage.setItem('coursemapper-provider', 'openai');
    localStorage.setItem('coursemapper-modelid', 'gpt-5.4-mini');
    localStorage.setItem('coursemapper-modelname', 'GPT-5.4 mini');
    localStorage.setItem('coursemapper-apikey', fakeKey);
    localStorage.setItem('coursemapper-apikey-provider:openai', fakeKey);
  });
  await page.reload();
  await expect(page.locator('button:has-text("Resume")')).toBeVisible({ timeout: 10000 });
  await page.locator('button:has-text("Resume")').click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
}

async function routeSuccessfulOpenAIConfig(page, { modelId = 'gpt-4o-mini' } = {}) {
  await page.route('https://api.openai.com/v1/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: modelId, created: 1_700_000_000 }] }),
    });
  });
  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    });
  });
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ output_text: 'ok' }),
    });
  });
}

async function routeInvalidOpenAIConfig(page) {
  await page.route('https://api.openai.com/v1/models', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Invalid API key' } }),
    });
  });
}

async function openWorkspaceModelConfigFromHeader(page) {
  const agentPanel = page.getByTestId('workspace-agent-panel');
  await agentPanel.getByTestId('workspace-model-config-trigger').click();
  await expect(page.getByTestId('workspace-model-config-panel')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  return page.getByTestId('workspace-model-config-panel');
}

test.describe('Agent no-key behavior', () => {
  test('restores saved provider readiness when resuming before validation finishes', async ({ page }) => {
    await page.route('https://api.openai.com/v1/models', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'gpt-5.4-mini', created: 1_700_000_000 }] }),
      });
    });
    await page.route('https://api.openai.com/v1/responses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ output_text: 'ok' }),
      });
    });
    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      });
    });

    await restoreGeneratedWorkspaceWithSavedKey(page);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel).toBeVisible();
    await expect(agentPanel.getByText('Provider/key required')).toHaveCount(0);
    await expect(agentPanel.getByTestId('workspace-model-config-trigger')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-strip')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-improve-active')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-configure-agent')).toHaveCount(0);

    const composer = agentPanel.locator('textarea');
    await expect(composer).toBeEnabled();
    await composer.fill('Improve the lesson plan wording');
    await expect(agentPanel.getByLabel('Send message')).toBeEnabled();
  });

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
    await expect(agentPanel.getByTestId('agent-command-strip')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-audit-quality')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-plan-next')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-configure-agent')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-improve-active')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-starter-local-audit')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-starter-local-plan')).toBeVisible();
    const composer = agentPanel.locator('textarea');
    await expect(composer).toBeEnabled();
    await expect(composer).toHaveAttribute('placeholder', 'Configure AI to chat with the agent…');
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
    await expect(agentPanel.getByTestId('package-compact-trust-receipt').last()).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByTestId('package-compact-trust-receipt').last()).toContainText('Compiled');
    await expect(agentPanel.getByTestId('package-review-actions').last()).toContainText(
      /Course Map|Lesson Plans|Official dates|Local policy|Source permissions/,
    );
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

    await agentPanel.getByTestId('workspace-model-recovery-action').click();
    await expect(page.getByTestId('workspace-model-config-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.locator('h1:has-text("Everything you need")')).toHaveCount(0);

    expect(aiRequests).toEqual([]);
    expect(consoleErrors.filter((text) => text.includes('NO_API_KEY'))).toEqual([]);
  });

  test('opens model configuration from the restored workspace header', async ({ page }) => {
    await restoreGeneratedWorkspaceWithoutKey(page);

    const panel = await openWorkspaceModelConfigFromHeader(page);

    await expect(panel.getByText('AI Configuration')).toBeVisible();
    await expect(panel.getByLabel('Provider')).toHaveValue('openai');
    await expect(page.locator('h1:has-text("Everything you need")')).toHaveCount(0);
  });

  test('opens model configuration from the recovery banner action', async ({ page }) => {
    await restoreGeneratedWorkspaceWithoutKey(page);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await agentPanel.getByTestId('workspace-model-recovery-action').click();

    await expect(page.getByTestId('workspace-model-config-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
  });

  test('opens model configuration from the disabled composer recovery button', async ({ page }) => {
    await restoreGeneratedWorkspaceWithoutKey(page);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await agentPanel.getByRole('button', { name: /^Configure AI$/ }).click();

    await expect(page.getByTestId('workspace-model-config-panel')).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.locator('textarea')).toHaveAttribute('placeholder', 'Configure AI to chat with the agent…');
  });

  test('keeps local audit and plan available after an invalid restored key attempt', async ({ page }) => {
    await routeInvalidOpenAIConfig(page);
    await restoreGeneratedWorkspaceWithoutKey(page);

    const panel = await openWorkspaceModelConfigFromHeader(page);
    await panel.getByLabel('API Key').fill('sk-proj-invalid-browser-recovery-key-1234567890');

    await expect(panel.getByText('Invalid API key').first()).toBeVisible({ timeout: 15000 });
    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByText('Provider/key required')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-strip')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-starter-local-audit')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-starter-local-plan')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-command-improve-active')).toHaveCount(0);
  });

  test('reconnects the restored workspace after entering a valid key in place', async ({ page }) => {
    await routeSuccessfulOpenAIConfig(page, { modelId: 'gpt-4o-mini' });
    await restoreGeneratedWorkspaceWithoutKey(page);

    const panel = await openWorkspaceModelConfigFromHeader(page);
    await panel.getByLabel('API Key').fill('sk-proj-valid-browser-recovery-key-12345678901234567890');

    await expect(panel.getByText('Connected')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('workspace-model-config-close').click();

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByText('Provider/key required')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-configure-agent')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-strip')).toHaveCount(0);
    await expect(agentPanel.getByTestId('agent-command-improve-active')).toHaveCount(0);
    await agentPanel.locator('textarea').fill('Improve this lesson plan');
    await expect(agentPanel.getByLabel('Send message')).toBeEnabled();
  });

  test('lets restored users switch provider without leaving the workspace', async ({ page }) => {
    await restoreGeneratedWorkspaceWithoutKey(page);

    const panel = await openWorkspaceModelConfigFromHeader(page);
    await panel.getByLabel('Provider').selectOption('anthropic');

    await expect(panel.getByLabel('API Key')).toHaveAttribute('placeholder', 'sk-ant-...');
    await expect(page.getByTestId('workspace-shell')).toBeVisible();
    await expect(page.locator('h1:has-text("Everything you need")')).toHaveCount(0);
  });

  test('persists the recovered model choice after closing and reopening settings', async ({ page }) => {
    await routeSuccessfulOpenAIConfig(page, { modelId: 'gpt-4o-mini' });
    await restoreGeneratedWorkspaceWithoutKey(page);

    let panel = await openWorkspaceModelConfigFromHeader(page);
    await panel.getByLabel('API Key').fill('sk-proj-persisted-browser-recovery-key-12345678901234567890');
    await expect(panel.getByText('Connected')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('workspace-model-config-close').click();

    await expect(page.getByTestId('workspace-model-config-overlay')).toHaveCount(0);
    panel = await openWorkspaceModelConfigFromHeader(page);
    await expect(panel.getByLabel('Model')).toHaveValue('gpt-4o-mini');
  });

  test('keeps the active workspace view intact when settings are dismissed', async ({ page }) => {
    await restoreGeneratedWorkspaceWithoutKey(page);

    await openWorkspaceModelConfigFromHeader(page);
    await page.getByTestId('workspace-model-config-close').click();

    await expect(page.getByTestId('workspace-model-config-overlay')).toHaveCount(0);
    await expect(page.getByTestId('workspace-agent-panel')).toBeVisible();
    await expect(page.getByTestId('workspace-content-panel')).toBeVisible();
  });

  test('runs natural local audit requests without an AI key', async ({ page }) => {
    const aiRequests = [];
    await page.route(
      /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.deepseek\.com/,
      (route) => {
        aiRequests.push(route.request().url());
        return route.abort();
      },
    );

    await restoreGeneratedWorkspaceWithoutKey(page);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    const composer = agentPanel.locator('textarea');
    await composer.fill('can you audit this package?');
    await expect(agentPanel.getByTestId('agent-command-preview')).toContainText('Audit quality');
    await composer.press('Enter');

    await expect(agentPanel.getByText('Running a read-only package audit from the Agent command.')).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByText('Audit complete.', { exact: false })).toBeVisible({ timeout: 10000 });
    expect(aiRequests).toEqual([]);
  });
});
