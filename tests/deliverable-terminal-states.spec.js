import { expect, test } from '@playwright/test';

function sseJson(content) {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`, '', 'data: [DONE]', ''].join('\n');
}

function courseMapFixture() {
  return {
    courseName: 'Terminal State Course',
    semester: 'Spring 2026',
    lessons: [1, 2, 3, 4].map((n) => ({
      title: `Lesson ${n}: Terminal State ${n}`,
      sections: [
        {
          learningGoals: `Goal ${n}: understand reliable course generation workflows.`,
          topicSection: `Terminal state handling ${n}`,
          learningObjectives: `Analyze terminal states and identify safe retry paths for lesson ${n}.`,
          weeklyAssessments: `Reflection ${n}: explain how users recover from partial deliverable failures.`,
          asyncActivities: `Read a short note about reliable background generation for lesson ${n}.`,
          syncActivities: `Discuss how timeout and error states should appear in the workspace.`,
          technologyNeeded: 'Browser, local storage, and mocked AI provider.',
          presentationFormat: 'Interactive workshop',
          supportingResources: 'Course Mapper reliability audit notes.',
          evaluateDesign: 'Objectives, activities, and assessments align to terminal-state reliability.',
        },
      ],
    })),
  };
}

const CUSTOM_FAILURE_ID = 'custom_terminal_failure_pack';
const CUSTOM_FAILURE_NAME = 'Terminal Failure Pack';
const landingSetupButton = (page) => page.getByTestId('landing-setup-button');

function customFailureDeliverableFixture() {
  return {
    [CUSTOM_FAILURE_ID]: {
      id: CUSTOM_FAILURE_ID,
      name: CUSTOM_FAILURE_NAME,
      description: 'A test-only custom deliverable that remains provider-generated while built-ins compile locally.',
      color: 'rose',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      systemPrompt:
        'You are generating the Terminal Failure Pack custom deliverable. Return only valid JSON with one item per lesson.',
      userPromptTemplate: `Generate a Terminal Failure Pack for each lesson.

Course data:
{{courseMap}}

Return JSON with this shape:
{
  "terminal_failure_pack": [
    {
      "lessonTitle": "Lesson title",
      "weekNumber": "Week 1",
      "checks": ["Check one", "Check two"]
    }
  ]
}`,
      defaultConfig: {
        tone: 'Professional',
        style: 'Bullet points',
        length: 'Brief',
      },
      createdAt: 1,
      updatedAt: 1,
    },
  };
}

async function installMockOpenAI(page) {
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'gpt-4o-mini', created: 1 }] }),
    }),
  );

  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');

    if (!body.stream) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      });
    }

    const system = body.messages?.[0]?.content || '';
    let content = JSON.stringify(courseMapFixture());
    if (/quality assurance review/i.test(system)) {
      content = JSON.stringify({ patches: [] });
    } else if (/terminal failure pack/i.test(system)) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      content = 'intentionally invalid terminal failure pack response with no JSON object';
    }

    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseJson(content),
    });
  });
}

test.describe('All-deliverables terminal states', () => {
  test('finishes when one selected deliverable succeeds and another errors', async ({ page }) => {
    test.setTimeout(60000);
    await installMockOpenAI(page);
    await page.addInitScript((customDeliverables) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-terminal-state-test-key');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
      localStorage.setItem('coursemapper-developer-mode', 'true');
      localStorage.setItem('coursemapper-custom-deliverables', JSON.stringify(customDeliverables));
    }, customFailureDeliverableFixture());

    await page.goto('/');
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Build a 4-week course about testing deliverable terminal states.');
    await landingSetupButton(page).click();

    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Lesson Plans/ }).click();
    await page
      .locator('button')
      .filter({ has: page.getByText(CUSTOM_FAILURE_NAME, { exact: true }) })
      .first()
      .click();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.locator('h1:has-text("Configure generation")')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Generate/ }).click();

    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('signed-out-advanced-menu').click();
    const ideButton = page.getByRole('button', { name: /Open Developer IDE/i });
    await expect(ideButton).toBeDisabled({ timeout: 5000 });
    await expect(ideButton).toHaveAttribute('title', /Deliverables are still generating/i);
    await ideButton.click({ force: true });
    await expect(page.getByTestId('developer-mode-panel')).toHaveCount(0);

    const agentPanel = page.getByTestId('workspace-agent-panel');
    const packageSummary = agentPanel.getByTestId('package-summary-card').last();

    await expect
      .poll(
        async () =>
          page.evaluate((customFailureId) => {
            const saved = JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
            return {
              lessonPlans: saved.deliverables?.lessonPlans?.status,
              customFailure: saved.deliverables?.[customFailureId]?.status,
            };
          }, CUSTOM_FAILURE_ID),
        { timeout: 30000 },
      )
      .toEqual({ lessonPlans: 'done', customFailure: 'error' });

    await expect(packageSummary.getByText('Package refinement')).toBeVisible({ timeout: 30000 });
    await expect(packageSummary).toContainText('1 issue to fix');
    await expect(packageSummary).toContainText('Terminal Failure Pack failed to generate');
    await expect(ideButton).toBeEnabled({ timeout: 5000 });

    await page.getByRole('button', { name: new RegExp(`^${CUSTOM_FAILURE_NAME}`) }).click();
    await expect(page.getByText('All chunks failed')).toBeVisible();
    await expect(page.locator('text=Generating')).toHaveCount(0);
  });
});
