import { expect, test } from '@playwright/test';
import twoSessions from '../benchmarks/classroom/v1/cases/held-two-session-design.json' with { type: 'json' };

test('source compiler keeps worked examples, shared answers, and the lesson clock through regeneration', async ({
  page,
}) => {
  const modelRequests = [];
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  page.on('request', (request) => {
    if (/generativelanguage|api\/scion\/complete|huggingface.co|\.gguf/.test(request.url()))
      modelRequests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { buildCourseBlueprint, compileBlueprintDeliverables } = await import('/src/lib/courseBlueprintCompiler.js');
    const facts = [
      '20 volunteers joined a daytime workshop; 16 completed it.',
      'The sample proportion is 16/20 = 0.80 = 80%.',
      'Night-shift workers could not attend.',
    ];
    const courseMap = {
      courseName: 'Compiler classroom verification',
      lessons: [
        {
          title: 'Sample proportion calculation',
          sections: [
            {
              topicSection: 'Sample proportion',
              learningObjectives: 'Calculate the observed proportion and explain the source limits.',
            },
          ],
        },
      ],
    };
    const promptText = `A single 45-minute statistics lesson. Source facts: ${facts.join('; ')}`;
    const blueprint = buildCourseBlueprint(courseMap, {
      sessionMinutes: 45,
      sourceBrief: promptText,
      instructorProvidedFacts: facts,
    });
    const enrichment = {
      keyTerms: [],
      kernel: {
        facts,
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          authority: 'instructor-supplied',
          copiedFactsVerbatim: true,
          factCount: facts.length,
        },
      },
    };
    blueprint.lessons[0].enrichment = enrichment;
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides', 'lessonPlans']);
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'public',
        modelId: 'scion-public',
        modelName: 'Scion',
        courseMap,
        promptText,
        selectedFeatures: ['courseMap', 'studyGuides', 'lessonPlans'],
        activeTab: 'studyGuides',
        columns: [
          { key: 'topicSection', label: 'Topics', enabled: true },
          { key: 'learningObjectives', label: 'Objectives', enabled: true },
        ],
        deliverables: Object.fromEntries(
          Object.entries(compiled).map(([id, data]) => [id, { status: 'done', data, stale: false, error: null }]),
        ),
        courseBlueprint: blueprint,
        deliverableConfig: {},
        lessonScope: { type: 'all' },
        chatHistory: [],
        userEdits: [],
        fileNames: [],
        versionHistory: [],
        savedAt: Date.now(),
      }),
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  await expect(page.getByText('Worked Example', { exact: true })).toBeVisible();
  const checks = page.getByText('Check your answer', { exact: true });
  await expect(checks).toHaveCount(7);
  const conversionCheck = page
    .locator('details')
    .filter({ hasText: '0.80 is a decimal proportion; it converts to 80%.' });
  await expect(conversionCheck).toHaveCount(1);
  await conversionCheck.locator('summary').click();
  await expect(
    conversionCheck.getByText('0.80 is a decimal proportion; it converts to 80%.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Lesson Plans', exact: true }).click();
  await expect(page.getByText(/^45 minutes · Week 1$/).first()).toBeVisible();
  await expect(page.getByText(/^0.80 × 20 = 16\./).first()).toBeVisible();
  await expect(
    page
      .getByText(/Recover the numerator from 80% of 20, then state one source limitation\./)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Regen', exact: true }).click();
  await expect.poll(() => logs.some((line) => line.includes('lesson_regen_compiled')), { timeout: 20000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Regen', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByText(/^45 minutes · Week 1$/).first()).toBeVisible();
  await expect(page.getByText(/^0.80 × 20 = 16\./).first()).toBeVisible();
  expect(modelRequests).toEqual([]);
});

test('two-session source tasks restore with distinct answers and regenerate without model requests', async ({
  page,
}) => {
  const requests = [];
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  page.on('request', (request) => {
    if (/generativelanguage|api\/scion\/complete|huggingface.co|\.gguf/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(async (fixture) => {
    const { buildCourseBlueprint, compactBlueprintForStorage, compileBlueprintDeliverables } =
      await import('/src/lib/courseBlueprintCompiler.js');
    const { extractInstructorProvidedFacts } = await import('/src/lib/sourceBriefConstraints.js');
    const { completeNativeKernelSurfaces } = await import('/src/lib/nativeGraphAuthoring.js');
    const lessonContent = fixture.lessonContent;
    for (const [id, payload] of Object.entries(lessonContent))
      lessonContent[id] = completeNativeKernelSurfaces(
        payload,
        fixture.map.lessons[Number(id.replace('lesson-', '')) - 1],
      );
    const blueprint = buildCourseBlueprint(fixture.map, {
      sourceBrief: fixture.sourceBrief,
      instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
      sessionMinutes: fixture.sessionMinutes,
      enrichment: { lessonContent },
    });
    const features = ['studyGuides', 'lessonPlans', 'syllabus', 'quizBank'];
    const compiled = compileBlueprintDeliverables(blueprint, features);
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'public',
        modelId: 'scion-public',
        modelName: 'Scion',
        courseMap: fixture.map,
        promptText: fixture.sourceBrief,
        selectedFeatures: ['courseMap', ...features],
        activeTab: 'studyGuides',
        columns: [],
        deliverables: Object.fromEntries(
          Object.entries(compiled).map(([id, data]) => [id, { status: 'done', data, stale: false, error: null }]),
        ),
        courseBlueprint: compactBlueprintForStorage(blueprint),
        deliverableConfig: {},
        lessonScope: { type: 'all' },
        chatHistory: [],
        userEdits: [],
        fileNames: [],
        versionHistory: [],
        savedAt: Date.now(),
      }),
    );
  }, twoSessions);
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Syllabus', exact: true }).click();
  await expect(page.getByText('2 sessions of 40 minutes', { exact: true })).toBeVisible();
  await expect(page.getByText(/No course-grade percentages have been invented/)).toBeVisible();
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  await expect(page.getByText('Check your answer', { exact: true })).toHaveCount(13);
  await expect(page.getByText(/Retrieve your comparison and confound diagnosis from Lesson 1/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Regen', exact: true }).nth(1).click();
  await expect.poll(() => logs.some((line) => line.includes('lesson_regen_compiled')), { timeout: 20000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Regen', exact: true }).nth(1)).toBeEnabled({ timeout: 20000 });
  await expect(page.getByText('Check your answer', { exact: true })).toHaveCount(13);
  await expect(page.getByText(/Retrieve your comparison and confound diagnosis from Lesson 1/).first()).toBeVisible();
  expect(requests).toEqual([]);
});

test('source edits update linked answers atomically, retain teacher edits and survive undo, redo and reload', async ({
  page,
}) => {
  const modelRequests = [];
  const logs = [];
  page.on('console', (message) => logs.push(message.text()));
  page.on('request', (request) => {
    if (/generativelanguage|api\/scion\/complete|huggingface.co|\.gguf/.test(request.url()))
      modelRequests.push(request.url());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const {
      buildCourseBlueprint,
      compileBlueprintDeliverables,
      BLUEPRINT_COMPILE_CONTEXT,
      reconcileCourseMapWithBlueprintSemanticAdmission,
    } = await import('/src/lib/courseBlueprintCompiler.js');
    const facts = [
      'The observed completion proportion is 16/20.',
      'Participation was voluntary.',
      'No night-shift learners attended.',
    ];
    const map = {
      courseName: 'Workshop proportions',
      lessons: [
        {
          title: 'Interpreting completion',
          sections: [
            {
              topicSection: 'Proportion',
              learningObjectives: 'Calculate the observed completion proportion and explain the source limits.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(map, {
      sessionMinutes: 45,
      sourceBrief: facts.join('\n'),
      instructorProvidedFacts: facts,
    });
    const features = [
      'studyGuides',
      'assignments',
      'rubrics',
      'quizBank',
      'lessonPlans',
      'slideDecks',
      'discussions',
      'syllabus',
      'courseFaq',
    ];
    const compiled = compileBlueprintDeliverables(blueprint, features);
    const courseMap = reconcileCourseMapWithBlueprintSemanticAdmission(map, compiled[BLUEPRINT_COMPILE_CONTEXT]);
    // A real local-model prose recovery can save a map without task links.
    // Source editing must reconstruct this metadata without inventing a
    // competing teacher edit; the actual outline remains protected.
    delete courseMap.teachingTaskSources;
    for (const lesson of courseMap.lessons) delete lesson.teachingTaskLink;
    localStorage.setItem(
      'coursemapper-project',
      JSON.stringify({
        formatVersion: 1,
        hasGenerated: true,
        provider: 'local',
        modelId: 'scion-local',
        modelName: 'Scion',
        courseMap,
        promptText: facts.join('\n'),
        selectedFeatures: ['courseMap', ...features],
        activeTab: 'studyGuides',
        columns: [
          { key: 'topicSection', label: 'Topics', enabled: true },
          { key: 'learningObjectives', label: 'Objectives', enabled: true },
        ],
        deliverables: Object.fromEntries(
          features.map((id) => [id, { status: 'done', data: compiled[id], stale: false, error: null }]),
        ),
        courseBlueprint: blueprint,
        deliverableConfig: {},
        lessonScope: { type: 'all' },
        chatHistory: [],
        userEdits: [],
        fileNames: [],
        versionHistory: [],
        savedAt: Date.now(),
      }),
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  // Exercise the real editor; the fixture setup above does not mutate the app's live state.
  const source = page.getByText('The observed completion proportion is 16/20.', { exact: true }).first();
  await source.click();
  await page.locator('textarea:focus').fill('The observed completion proportion is 12/20.');
  await page.locator('textarea:focus').press('Enter');
  await expect(page.getByText('12/20 = 0.6 = 60%.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Assignment Briefs/ }).click();
  await page.locator('details[data-teaching-task-reference] > summary').click();
  const answer = page
    .locator('[title="Click to edit · Right-click for AI"]')
    .filter({ hasText: /^12 ÷ 20 = 0.6;/ })
    .first();
  await expect(answer).toBeVisible();
  await page.getByTitle('Undo deliverable edit', { exact: true }).click();
  await expect(
    page
      .locator('[title="Click to edit · Right-click for AI"]')
      .filter({ hasText: /^16 ÷ 20 = 0.8;/ })
      .first(),
  ).toBeVisible();
  await page.getByTitle('Redo deliverable edit', { exact: true }).click();
  await expect(answer).toBeVisible();
  await answer.click();
  await page.locator('textarea:focus').fill('Teacher explanation: 60%, using counters before the calculation.');
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  await page.getByText('The observed completion proportion is 12/20.', { exact: true }).first().click();
  await page.locator('textarea:focus').fill('The observed completion proportion is 10/20.');
  await page.locator('textarea:focus').press('Enter');
  await expect(page.getByText('10/20 = 0.5 = 50%.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Assignment Briefs/ }).click();
  await page.locator('details[data-teaching-task-reference] > summary').click();
  await expect(page.getByText(/Review \d+ linked update/)).toBeVisible();
  await expect(
    page.getByText('Teacher explanation: 60%, using counters before the calculation.', { exact: true }).last(),
  ).toBeVisible();
  await page.getByText(/Review \d+ linked update/).click();
  await expect(page.getByRole('button', { name: 'Use updated version', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Use updated version', exact: true }).click();
  await expect(page.getByText(/Review \d+ linked update/)).toHaveCount(0);
  await expect(
    page
      .locator('[title="Click to edit · Right-click for AI"]')
      .filter({ hasText: /^10 ÷ 20 = 0.5;/ })
      .first(),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const project = JSON.parse(localStorage.getItem('coursemapper-project'));
        return project?.deliverables?.studyGuides?.data?.studyGuides?.[0]?.workedExample?.result;
      }),
    )
    .toBe('10/20 = 0.5 = 50%.');
  const savedSources = await page.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('coursemapper-project')).deliverables).map(
      (entry) => entry.data.teachingTaskSources,
    ),
  );
  for (const sources of savedSources) {
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBeTruthy();
    expect(sources[0].inputs.every((input) => input.id && !('ifDominates' in input))).toBe(true);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Study Guides', exact: true }).click();
  await expect(page.getByText('10/20 = 0.5 = 50%.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Regen', exact: true }).click();
  await expect.poll(() => logs.some((line) => line.includes('lesson_regen_compiled')), { timeout: 20000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Regen', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(page.getByText('10/20 = 0.5 = 50%.', { exact: true })).toBeVisible();
  expect(modelRequests).toEqual([]);
});
