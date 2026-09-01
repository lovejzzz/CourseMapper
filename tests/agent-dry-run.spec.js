import { expect, test } from '@playwright/test';

const MUTATING_AGENT_TOOLS = [
  'edit_course_map',
  'edit_deliverables',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
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
    promptText: 'Agent review-only course',
    activeTab: 'lessonPlans',
    deliverables: {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1',
              overview: 'A generated lesson plan that puts the workspace in agent mode.',
              activities: ['Check that review-only mode cannot apply edits.'],
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

test.describe('Agent conversation-driven mode', () => {
  test('keeps mode choice in the conversation instead of a review-only toggle', async ({ page }) => {
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
          body: openAiRespondStream('I can revise the lesson plan and will ask before broad changes.'),
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
    await expect(page.getByTestId('ai-config-summary')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Resume")')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Resume")').click();
    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });

    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByRole('heading', { name: 'Agent' })).toBeVisible();
    await expect(agentPanel.getByTestId('agent-dry-run-toggle')).toHaveCount(0);
    await expect(agentPanel.getByText('No edits', { exact: true })).toHaveCount(0);
    await expect(agentPanel.getByText('Lesson Plans', { exact: true }).first()).toBeVisible();

    await agentPanel.locator('textarea').fill('Make the lesson plan more active.');
    await agentPanel.getByLabel('Send message').click();

    await expect.poll(() => agentRequests.length, { timeout: 10000 }).toBe(1);
    await expect(agentPanel.getByText('I can revise the lesson plan and will ask before broad changes.')).toBeVisible({
      timeout: 10000,
    });

    const toolNames = agentRequests[0].tools.map((tool) => tool.function?.name).filter(Boolean);
    expect(toolNames.some((toolName) => MUTATING_AGENT_TOOLS.includes(toolName))).toBe(true);
    expect(toolNames).toContain('validate_course');
    expect(toolNames).toContain('read_deliverable');
    expect(toolNames).toContain('respond');
    expect(agentRequests[0].messages[0].content).not.toContain('CURRENT AGENT MODE: REVIEW ONLY / READ-ONLY');
    expect(consoleErrors).toEqual([]);
  });
});
