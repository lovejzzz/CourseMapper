import { expect, test } from '@playwright/test';

function sseJson(content) {
  return [`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`, '', 'data: [DONE]', ''].join('\n');
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
                id: 'call_auto_review_1',
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

function courseMapFixture() {
  return {
    courseName: 'Auto Review Regression Course',
    semester: 'Spring 2026',
    lessons: [1, 2].map((n) => ({
      title: `Lesson ${n}: Agent Review ${n}`,
      sections: [
        {
          learningGoals: `Evaluate how generated materials support a complete course review in lesson ${n}.`,
          topicSection: `Agent review workflow ${n}`,
          learningObjectives: `Analyze generated deliverables and identify one improvement path for lesson ${n}.`,
          weeklyAssessments: `Review memo ${n}`,
          asyncActivities: `Read the generated materials for lesson ${n}.`,
          syncActivities: `Discuss what the agent should review after generation completes.`,
          technologyNeeded: 'Browser, mocked provider, and generated workspace.',
        },
      ],
    })),
  };
}

function lessonPlansFixture() {
  return {
    lessonPlans: [1, 2].map((n) => ({
      lessonTitle: `Lesson ${n}: Agent Review ${n}`,
      overview: `Students inspect generated materials and practice interpreting automated review findings for lesson ${n}.`,
      objectives: [
        `Analyze the relationship between objectives and assessments in lesson ${n}.`,
        'Evaluate whether agent feedback is actionable for an instructor.',
      ],
      materials: ['Generated course map', 'Review checklist'],
      activities: [
        'Annotate one generated objective.',
        'Compare the assessment against the stated objective.',
        'Draft a concrete improvement recommendation.',
      ],
    })),
  };
}

function studyGuidesFixture() {
  return {
    guides: [1, 2].map((n) => ({
      lessonTitle: `Lesson ${n}: Agent Review ${n}`,
      summary:
        `This guide explains how students can use generated materials to evaluate course coherence in lesson ${n}. ` +
        'It emphasizes evidence, specificity, and alignment between activities and assessments.',
      keyTerms: [
        {
          term: 'Course alignment',
          definition: 'The relationship among outcomes, activities, and assessments.',
          example: 'An assessment asks students to analyze the same concept named in the objective.',
        },
      ],
      conceptConnections: [
        {
          from: 'Objectives',
          to: 'Assessments',
          relationship: 'Assessments should make the objective observable.',
        },
      ],
      commonMisconceptions: [
        {
          misconception: 'A broad activity automatically proves alignment.',
          correction: 'The activity must produce evidence tied to a stated objective.',
        },
      ],
      reviewQuestions: [
        {
          question: 'What evidence shows that a generated deliverable is aligned?',
          bloomsLevel: 'Analyze',
          hint: 'Look for shared verbs, concepts, and assessment evidence.',
        },
      ],
      practiceActivities: ['Mark one aligned item and one weak item in the generated course.'],
      examPrep: {
        keyTopicsToKnow: ['Alignment', 'Actionable feedback'],
        reviewStrategy: 'Use a checklist before writing recommendations.',
      },
    })),
  };
}

async function installMockOpenAI(page, agentRequests) {
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'gpt-4o-mini', created: 1 }] }),
    }),
  );

  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (Array.isArray(body.tools)) {
      agentRequests.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: openAiRespondStream('Background review complete. No blocking issues found.'),
      });
    }

    if (!body.stream) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      });
    }

    const system =
      body.messages?.find((message) => message.role === 'system')?.content || body.messages?.[0]?.content || '';
    let content = JSON.stringify(courseMapFixture());
    if (/quality assurance review/i.test(system)) {
      content = JSON.stringify({ patches: [] });
    } else if (/lesson plans/i.test(system)) {
      content = JSON.stringify(lessonPlansFixture());
    } else if (/study guides/i.test(system)) {
      content = JSON.stringify(studyGuidesFixture());
    }

    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseJson(content),
    });
  });
}

test.describe('Agent auto-review', () => {
  test('runs deterministic final pass silently without showing a user-authored Review my course bubble', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const agentRequests = [];
    await installMockOpenAI(page, agentRequests);

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('coursemapper-provider', 'openai');
      localStorage.setItem('coursemapper-apikey', 'sk-proj-auto-review-test-key');
      localStorage.setItem('coursemapper-modelid', 'gpt-4o-mini');
      localStorage.setItem('coursemapper-modelname', 'GPT-4o mini');
    });

    await page.goto('/');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 10000 });
    await page.locator('textarea').fill('Build a 2-week course for the auto-review regression test.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Choose deliverables')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Lesson Plans/ }).click();
    await page.getByRole('button', { name: /Study Guides/ }).click();
    await page.getByRole('button', { name: /Configure & Generate/ }).click();

    await expect(page.getByRole('heading', { name: 'Configure generation' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Generate/ }).click();

    await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
    const agentPanel = page.getByTestId('workspace-agent-panel');
    const packageSummary = agentPanel.getByTestId('package-summary-card').last();
    await expect(packageSummary.getByText(/Package (ready|needs attention|needs review)/)).toBeVisible({
      timeout: 30000,
    });
    await expect(packageSummary.getByText(/Ready to download|Finish package|Decision needed/)).toBeVisible();

    // The final pass now runs through deterministic finalization, not through
    // a hidden user-authored chat turn or agent tool-call request.
    await page.waitForTimeout(3500);
    expect(agentRequests).toHaveLength(0);
    await expect(agentPanel.getByTestId('chat-message-user').filter({ hasText: 'Review my course' })).toHaveCount(0);
    await expect(agentPanel.getByText('[AUTO-REVIEW]')).toHaveCount(0);
  });
});
