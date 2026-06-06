import { expect, test } from '@playwright/test';

function generatedWorkspaceFixture() {
  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    modelName: 'GPT-5.4 mini',
    courseMap: {
      courseName: 'Agent Command Course',
      semester: 'Spring 2026',
      lessons: [
        {
          title: 'Lesson 1',
          learningGoals: ['Explain how agent commands should stay actionable.'],
          topics: ['Agent workflow'],
          learningObjectives: ['Use the command strip to improve generated content.'],
          weeklyAssessments: ['Short reflection'],
          asynchronousActivities: ['Review the generated lesson plan.'],
          synchronousActivities: ['Discuss safe agent edits.'],
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
    promptText: 'Agent command course',
    activeTab: 'lessonPlans',
    deliverables: {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1',
              overview: 'A generated lesson plan that needs more classroom-specific detail.',
              activities: ['Students discuss agent safety defaults.'],
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

async function seedGeneratedWorkspaceWithConfiguredOpenAI(page) {
  await page.addInitScript((snapshot) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('coursemapper-project', JSON.stringify(snapshot));
    localStorage.setItem('coursemapper-provider', 'openai');
    localStorage.setItem('coursemapper-modelid', 'gpt-5.4-mini');
    localStorage.setItem('coursemapper-modelname', 'GPT-5.4 mini');
    localStorage.setItem('coursemapper-apikey', 'sk-proj-coursemapper-agent-command-test-key');
  }, generatedWorkspaceFixture());
}

function openAiRespondStream(text) {
  return [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_agent_command_1',
                type: 'function',
                function: {
                  name: 'respond',
                  arguments: JSON.stringify({ chatReply: text }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    })}`,
    'data: [DONE]',
    '',
  ].join('\n');
}

function openAiToolCallStream(calls) {
  return [
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id || `call_agent_command_tool_${index + 1}`,
              type: 'function',
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments || {}),
              },
            })),
          },
          finish_reason: 'tool_calls',
        },
      ],
    })}`,
    'data: [DONE]',
    '',
  ].join('\n');
}

test.describe('Agent command entry points', () => {
  test('keeps generic suggestions out of the panel while typed and starter commands still work', async ({ page }) => {
    const agentRequests = [];
    const consoleErrors = [];

    await seedGeneratedWorkspaceWithConfiguredOpenAI(page);

    await page.route('https://api.openai.com/v1/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'gpt-5.4-mini', created: 1_700_000_000 }],
        }),
      }),
    );

    await page.route('https://api.openai.com/v1/responses', async (route) => {
      const body = route.request().postDataJSON();
      const hasToolProbe = Array.isArray(body.tools);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          hasToolProbe
            ? {
                output: [
                  {
                    type: 'function_call',
                    name: 'coursemapper_capability_echo',
                    arguments: JSON.stringify({ ok: true }),
                  },
                ],
                output_text: '',
              }
            : {
                output_text: body.text?.format?.type === 'json_object' ? '{"ok":true}' : 'ok',
                output: [
                  {
                    content: [
                      {
                        type: 'output_text',
                        text: body.text?.format?.type === 'json_object' ? '{"ok":true}' : 'ok',
                      },
                    ],
                  },
                ],
              },
        ),
      });
    });

    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      const body = route.request().postDataJSON();
      if (Array.isArray(body.tools)) {
        agentRequests.push(body);
        const latestUserMessage = body.messages?.filter((message) => message.role === 'user').at(-1)?.content || '';
        const hasToolResult = body.messages?.some((message) => message.role === 'tool');
        if (latestUserMessage.includes('Improve Lesson Plans for specificity') && !hasToolResult) {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: openAiToolCallStream([
              { name: 'read_deliverable', arguments: { featureId: 'lessonPlans' } },
              { name: 'validate_course' },
            ]),
          });
          return;
        }
        if (latestUserMessage.includes('plan_workspace_next_step') && !hasToolResult) {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: openAiToolCallStream([{ name: 'inspect_workspace' }, { name: 'plan_workspace_next_step' }]),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: openAiRespondStream(
            hasToolResult && latestUserMessage.includes('Improve Lesson Plans for specificity')
              ? 'Lesson Plans improved. I checked the active deliverable and no export risk changed.'
              : hasToolResult
                ? 'I planned the next step from the current workspace.'
                : 'Lesson Plans improved. I checked the active deliverable and no export risk changed.',
          ),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Resume")')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Resume")').click();
    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByRole('heading', { name: 'Agent' })).toBeVisible();

    await expect(agentPanel.getByTestId('agent-command-strip')).toHaveCount(0);

    const workingSet = agentPanel.getByTestId('agent-working-set-panel');
    await expect(workingSet).toBeVisible();
    await expect(workingSet.getByTestId('agent-working-target')).toContainText('Working on Lesson Plans');
    await expect(workingSet.getByTestId('agent-working-materials')).toContainText('1 lesson');
    await expect(workingSet.getByTestId('agent-working-materials')).toContainText('1 ready');
    await expect(workingSet.getByTestId('agent-working-materials')).toContainText('AI connected');
    await expect(workingSet.getByTestId('agent-working-package-status')).toBeVisible();

    const composer = agentPanel.locator('textarea');
    await composer.fill('/commands');
    await expect(agentPanel.getByTestId('agent-slash-command-palette')).toBeVisible();
    await agentPanel.getByTestId('agent-slash-command-agent-help').click();
    await expect(agentPanel.getByTestId('agent-help-card')).toContainText('Agent guide');
    await expect(agentPanel.getByTestId('agent-help-card')).toContainText('Working on Lesson Plans');
    expect(agentRequests.length).toBe(0);

    await composer.fill('audit quality');
    await composer.press('Enter');
    await expect(agentPanel.getByText('Audit quality')).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByText('Running a read-only package audit from the Agent command.')).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByText('Audit complete.', { exact: false })).toBeVisible({ timeout: 10000 });
    expect(agentRequests.length).toBe(0);

    await agentPanel.getByTestId('agent-starter-finish-package').click();
    await expect(agentPanel.getByText('Running package finishing from the Agent starter.')).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByText('Package finishing finished with', { exact: false })).toBeVisible({
      timeout: 10000,
    });
    expect(agentRequests.length).toBe(0);

    await agentPanel.locator('input[type="file"]').setInputFiles({
      name: 'field-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Students need more lab notebook scaffolding and clearer validation evidence.'),
    });
    await expect(agentPanel.getByText('field-notes.txt')).toBeVisible({ timeout: 10000 });

    await composer.fill('/badcommand');
    await expect(agentPanel.getByTestId('agent-slash-command-palette')).toBeVisible();
    await expect(agentPanel.getByTestId('agent-slash-command-empty')).toContainText('No matching command');
    await expect(agentPanel.getByLabel('Choose a valid command')).toBeDisabled();
    await composer.fill('');

    await composer.fill('/improve');
    await expect(agentPanel.getByTestId('agent-slash-command-palette')).toBeVisible();
    await agentPanel.getByTestId('agent-slash-command-improve-active').click();

    await expect.poll(() => agentRequests.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect(agentPanel.getByText('Improve Lesson Plans [+1 file]')).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByTestId('source-context-card')).toContainText('field-notes.txt');
    await expect(agentPanel.getByTestId('source-context-card')).toContainText('lab notebook scaffolding');
    await expect(
      agentPanel.getByText('Lesson Plans improved. I checked the active deliverable and no export risk changed.'),
    ).toBeVisible({ timeout: 10000 });
    const activityReceipt = agentPanel
      .getByTestId('agent-activity-receipt')
      .filter({ hasText: 'Lesson Plans' })
      .first();
    await expect(activityReceipt).toContainText('2 tools');
    await expect(activityReceipt).toContainText('2 checks');
    await expect(activityReceipt).toContainText('0 issues');
    await expect(activityReceipt).toContainText('Lesson Plans');

    const request = agentRequests[0];
    expect(request.model).toBe('gpt-5.4-mini');
    expect(request.temperature).toBeUndefined();
    expect(request.tools.map((tool) => tool.function?.name)).toContain('inspect_workspace');
    expect(request.tools.map((tool) => tool.function?.name)).toContain('plan_workspace_next_step');
    const userMessage = request.messages.filter((message) => message.role === 'user').at(-1)?.content || '';
    expect(userMessage).toContain('Improve Lesson Plans for specificity');
    expect(userMessage).toContain('Apply safe changes directly');
    expect(userMessage).toContain('=== Attached File: field-notes.txt ===');
    expect(userMessage).toContain('lab notebook scaffolding');
    expect(userMessage).not.toBe('Improve Lesson Plans');
    await expect(agentPanel.getByText('Apply safe changes directly')).toHaveCount(0);

    await composer.fill('plan next');
    await composer.press('Enter');
    await expect(agentPanel.getByText('Plan next step')).toBeVisible({ timeout: 10000 });
    await expect(
      agentPanel.getByText('Inspecting the workspace and building a plan from the Agent command.'),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(agentPanel.getByTestId('workspace-plan-card')).toBeVisible({ timeout: 10000 });
    await expect(agentPanel.getByTestId('workspace-plan-card')).toContainText('Workspace plan');
    await expect(agentPanel.getByTestId('workspace-plan-card')).toContainText('Improve the active Lesson Plans');
    await expect(agentPanel.getByText('Plan ready. Start with:', { exact: false })).toBeVisible({
      timeout: 10000,
    });
    expect(agentRequests.length).toBe(2);

    const planCard = agentPanel.getByTestId('workspace-plan-card');
    const improvePlanAction = planCard.getByTestId('workspace-plan-action-improve_active_feature');
    await improvePlanAction.scrollIntoViewIfNeeded();
    await improvePlanAction.click();
    await expect.poll(() => agentRequests.length, { timeout: 10000 }).toBeGreaterThanOrEqual(3);
    await expect(planCard.getByTestId('workspace-plan-action-state-improve_active_feature')).toContainText(
      'Sent to Agent',
    );
    await expect(agentPanel.getByText('Improve: Improve the active Lesson Plans')).toBeVisible({ timeout: 10000 });
    const planFollowUpMessage = agentRequests
      .at(-1)
      .messages.filter((message) => message.role === 'user')
      .at(-1)?.content;
    expect(planFollowUpMessage).toContain('Intent: improve_active_feature');
    expect(planFollowUpMessage).toContain('Read the active deliverable first');
    await expect(agentPanel.getByText('Intent: improve_active_feature')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });
});
