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

function lessonPlansFixture() {
  return {
    lessonPlans: [1, 2, 3, 4].map((n) => ({
      lessonTitle: `Lesson ${n}: Terminal State ${n}`,
      overview:
        `This plan gives instructors a concrete workflow for testing terminal deliverable states in lesson ${n}. ` +
        'Students examine completed, failed, and retryable states so the user interface remains understandable.',
      objectives: [
        `Analyze how a generated deliverable reaches a terminal state in lesson ${n}.`,
        'Evaluate whether a user can continue when one deliverable fails.',
      ],
      activities: [
        'Inspect a successful output row and identify the completion signal.',
        'Inspect a failed output row and describe the recovery path.',
        'Compare progress text before and after all selected deliverables finish.',
      ],
      materials: ['Mock provider trace', 'Terminal-state checklist', 'Course Mapper workspace'],
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
    } else if (/lesson plans/i.test(system)) {
      content = JSON.stringify(lessonPlansFixture());
    } else if (/study guides/i.test(system)) {
      content = 'intentionally invalid study guide response with no JSON object';
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
    await installMockOpenAI(page);
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-terminal-state-test-key');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });

    await page.goto('/');
    await expect(page.locator('text=Connected').first()).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Build a 4-week course about testing deliverable terminal states.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('text=Choose deliverables')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Lesson Plans/ }).click();
    await page.getByRole('button', { name: /Study Guides/ }).click();
    await page.getByRole('button', { name: /Configure & Generate/ }).click();

    await expect(page.locator('h1:has-text("Configure generation")')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Generate/ }).click();

    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('workspace-agent-panel').getByText('Complete')).toBeVisible({ timeout: 20000 });

    await page.getByLabel('Expand generation progress').click();
    const agentPanel = page.getByTestId('workspace-agent-panel');
    await expect(agentPanel.getByText('Lesson Plans', { exact: true })).toBeVisible();
    await expect(agentPanel.getByText('Study Guides', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Study Guides/ }).click();
    await expect(page.getByText('All chunks failed')).toBeVisible();
    await expect(page.locator('text=Generating')).toHaveCount(0);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
          return {
            lessonPlans: saved.deliverables?.lessonPlans?.status,
            studyGuides: saved.deliverables?.studyGuides?.status,
          };
        }),
      )
      .toEqual({ lessonPlans: 'done', studyGuides: 'error' });
  });
});
