import { expect, test } from '@playwright/test';

function sseJson(content) {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`, '', 'data: [DONE]', ''].join('\n');
}

function courseMapFixture() {
  return {
    courseName: 'Landing Context Course',
    semester: 'Spring 2026',
    lessons: [
      {
        title: 'Lesson 1: Notebook Workflow',
        sections: [
          {
            learningGoals: 'Explain how a notebook-based course uses data and model evidence.',
            topicSection: 'Notebook workflow and validation evidence',
            learningObjectives: 'Connect starter materials to lesson planning decisions.',
            weeklyAssessments: 'Notebook checkpoint',
            asyncActivities: 'Review the starter notebook outline.',
            syncActivities: 'Discuss how course materials shape the generated plan.',
            technologyNeeded: 'Jupyter notebook and browser',
            presentationFormat: 'Lab workshop',
            supportingResources: 'Starter notebook outline',
            evaluateDesign: 'Check whether the notebook evidence supports the lesson objective.',
          },
        ],
      },
      {
        title: 'Lesson 2: Model Card Review',
        sections: [
          {
            learningGoals: 'Evaluate model-card evidence for classroom-ready feedback.',
            topicSection: 'Model cards and performance tradeoffs',
            learningObjectives: 'Use validation results to improve a lesson plan.',
            weeklyAssessments: 'Model-card memo',
            asyncActivities: 'Annotate a model-card template.',
            syncActivities: 'Compare model evidence with course outcomes.',
            technologyNeeded: 'Notebook export and model-card template',
            presentationFormat: 'Lab critique',
            supportingResources: 'Model-card review checklist',
            evaluateDesign: 'Check whether validation evidence is visible in the model-card memo.',
          },
        ],
      },
    ],
  };
}

const landingSetupButton = (page) => page.getByTestId('landing-setup-button');

function lessonPlansFixture() {
  return {
    lessonPlans: courseMapFixture().lessons.map((lesson) => ({
      lessonTitle: lesson.title,
      overview: `${lesson.title} turns the landing prompt and uploaded starter materials into a concrete class session.`,
      objectives: [lesson.sections[0].learningObjectives],
      materials: ['Starter notebook outline', 'Course map preview'],
      activities: ['Open the starter outline.', 'Identify one evidence decision.', 'Draft an instructor-facing note.'],
    })),
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

  await page.route('https://api.openai.com/v1/responses', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output_text: 'ok',
        output: [{ content: [{ type: 'output_text', text: 'ok' }] }],
      }),
    }),
  );

  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (!body.stream) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      });
      return;
    }

    const system =
      body.messages?.find((message) => message.role === 'system')?.content || body.messages?.[0]?.content || '';
    const content = /lesson plans/i.test(system) ? lessonPlansFixture() : courseMapFixture();
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseJson(JSON.stringify(content)),
    });
  });
}

test.describe('Landing to Agent continuity', () => {
  test('carries the landing prompt and uploaded file names into the workspace Agent chat', async ({ page }) => {
    test.setTimeout(120000);
    await installMockOpenAI(page);

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-landing-context-test-key');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });

    await page.goto('/');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 10000 });

    const landingPrompt = 'Build a 2-week applied machine learning lab using weekly notebooks and a final model card.';
    await page.locator('textarea').fill(landingPrompt);
    await page.locator('#landing-file-input').setInputFiles({
      name: 'starter-notebook-outline.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Week 1 notebook: validation split. Week 2 notebook: model card review.'),
    });
    await expect(page.getByText('starter-notebook-outline.txt')).toBeVisible({ timeout: 10000 });

    await landingSetupButton(page).click();
    await expect(page.getByRole('heading', { name: 'Choose materials' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Lesson Plans/ }).click();
    await page.getByTestId('feature-select-continue').click();

    await expect(page.getByRole('heading', { name: 'Configure generation' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Generate/ }).click();

    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByRole('heading', { name: 'Agent' })).toBeVisible();
    await expect(agentPanel.getByTestId('agent-context-strip')).toContainText('Project brief');
    await expect(agentPanel.getByTestId('agent-context-strip')).toContainText(
      'Starting request + starter-notebook-outline.txt + 1 source note',
    );
    await expect(agentPanel.getByTestId('agent-working-materials')).toContainText('2 lessons');
    await expect(agentPanel.getByTestId('agent-working-materials')).toContainText('No generated materials yet');

    const landingContextCard = agentPanel.getByTestId('landing-context-card');
    await expect(landingContextCard).toContainText('Starting brief', { timeout: 30000 });
    await expect(landingContextCard).toContainText(landingPrompt, { timeout: 30000 });
    await expect(landingContextCard).toContainText('starter-notebook-outline.txt');
    await expect(landingContextCard).toContainText('Week 1 notebook: validation split');
    await expect(
      agentPanel.getByTestId('chat-message-user').filter({ hasText: 'Here is what I am starting with.' }),
    ).toHaveCount(0);
    await expect(agentPanel.getByText('I have your starting request and 1 uploaded material')).toBeVisible();
    await expect(agentPanel.getByText('1 compact source note')).toBeVisible();
  });
});
