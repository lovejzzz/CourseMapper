import { expect, test } from '@playwright/test';

const MUTATING_AGENT_TOOLS = [
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'save_preference',
  'remember',
  'forget',
  'undo_last',
  'create_tool',
  'run_tool',
];

function generatedWorkspaceFixture() {
  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    courseMap: {
      courseName: 'Agent Dry Run Course',
      semester: 'Spring 2026',
      lessons: [
        {
          title: 'Lesson 1',
          learningGoals: ['Explain safe agent editing behavior.'],
          topics: ['Dry-run mode'],
          learningObjectives: ['Distinguish read-only analysis from direct edits.'],
          weeklyAssessments: ['Short reflection'],
          asynchronousActivities: ['Review the generated lesson plan.'],
          synchronousActivities: ['Discuss agent safety defaults.'],
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
    promptText: 'Agent dry run course',
    activeTab: 'lessonPlans',
    deliverables: {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1',
              overview: 'A generated lesson plan that puts the workspace in agent mode.',
              activities: ['Check that dry-run mode cannot apply edits.'],
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
    localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
    localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    localStorage.setItem('coursemapper-apikey', 'sk-proj-coursemapper-dry-run-test-key');
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
                id: 'call_dry_run_1',
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

test.describe('Agent dry-run mode', () => {
  test('keeps mutating tools out of a real agent request', async ({ page }) => {
    const agentRequests = [];
    const consoleErrors = [];

    await seedGeneratedWorkspaceWithConfiguredOpenAI(page);

    await page.route('https://api.openai.com/v1/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'gpt-4o-mini', created: 1_700_000_000 }],
        }),
      }),
    );

    await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
      const body = route.request().postDataJSON();
      if (Array.isArray(body.tools)) {
        agentRequests.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: openAiRespondStream('Dry run complete. No workspace changes were applied.'),
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
    await expect(agentPanel.getByText('Apply directly')).toBeVisible();

    await agentPanel.getByTestId('agent-dry-run-toggle').click();
    await expect(agentPanel.getByTestId('agent-dry-run-toggle')).toContainText('Dry run');
    await expect(agentPanel.getByText('No auto-edits')).toBeVisible();

    await agentPanel.locator('textarea').fill('Make the lesson plan more active.');
    await agentPanel.getByLabel('Send message').click();

    await expect.poll(() => agentRequests.length, { timeout: 10000 }).toBe(1);
    await expect(agentPanel.getByText('Dry run complete. No workspace changes were applied.')).toBeVisible({
      timeout: 10000,
    });

    const toolNames = agentRequests[0].tools.map((tool) => tool.function?.name).filter(Boolean);
    for (const toolName of MUTATING_AGENT_TOOLS) {
      expect(toolNames).not.toContain(toolName);
    }
    expect(toolNames).toContain('validate_course');
    expect(toolNames).toContain('read_deliverable');
    expect(toolNames).toContain('respond');
    expect(agentRequests[0].messages[0].content).toContain('CURRENT AGENT MODE: DRY RUN / READ-ONLY');
    expect(consoleErrors).toEqual([]);
  });
});
