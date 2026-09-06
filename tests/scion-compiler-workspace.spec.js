import { expect, test } from '@playwright/test';

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
  await expect(checks).toHaveCount(6);
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
