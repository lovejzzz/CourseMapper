import { expect, test } from '@playwright/test';

function oversizedSavedProject() {
  const largeRubricBody = `autosave-oversized-rubric-sentinel ${'rubric body '.repeat(370_000)}`;

  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    courseMap: {
      courseName: 'Autosave Recovery Course',
      semester: 'Spring 2026',
      lessons: [
        {
          title: 'Lesson 1: Recovery',
          sections: [
            {
              learningGoals: 'Explain why recoverable local autosave matters.',
              topicSection: 'Browser storage limits',
              learningObjectives: 'Verify compact project snapshots can reopen a workspace.',
              weeklyAssessments: 'Recovery checklist',
              asyncActivities: 'Inspect saved project metadata.',
              syncActivities: 'Discuss export backup expectations.',
              technologyNeeded: 'Browser localStorage',
            },
          ],
        },
      ],
    },
    columns: [
      { key: 'learningGoals', label: 'Learning Goals', enabled: true },
      { key: 'topicSection', label: 'Topic/Section', enabled: true },
      { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
      { key: 'weeklyAssessments', label: 'Weekly Assessments', enabled: true },
      { key: 'asyncActivities', label: 'Asynchronous Activities', enabled: true },
      { key: 'syncActivities', label: 'Synchronous Activities', enabled: true },
      { key: 'technologyNeeded', label: 'Technology Needed', enabled: true },
    ],
    userEdits: [],
    chatHistory: [],
    fileNames: [],
    versionHistory: [],
    selectedFeatures: ['courseMap', 'rubrics'],
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    promptText: 'Autosave recovery course',
    activeTab: 'courseMap',
    deliverables: {
      rubrics: {
        status: 'done',
        stale: false,
        error: null,
        data: {
          title: 'Oversized rubric',
          body: largeRubricBody,
        },
      },
    },
  };
}

function quotaPressureProject() {
  const selectedFeatures = [
    'courseMap',
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignmentBriefs',
    'rubrics',
    'discussionPrompts',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ];
  return {
    formatVersion: 2,
    hasGenerated: true,
    provider: 'public',
    modelId: 'scion-public',
    modelName: 'Scion V0.16.72',
    courseMap: {
      courseName: 'IndexedDB Autosave Recovery',
      semester: 'Fall 2026',
      lessons: Array.from({ length: 15 }, (_, index) => ({
        lessonNumber: index + 1,
        title: `Lesson ${index + 1}: Recovery concept ${index + 1}`,
        sections: [
          {
            learningGoals: `Explain recovery concept ${index + 1} and prepare evidence for the next assessment.`,
            topicSection: `Recovery concept ${index + 1}`,
            learningObjectives: `Apply recovery concept ${index + 1} to a bounded course example.`,
            weeklyAssessments: `Evidence check for recovery concept ${index + 1}`,
            asyncActivities: `Annotate a source for recovery concept ${index + 1}.`,
            syncActivities: `Compare two applications of recovery concept ${index + 1}.`,
            technologyNeeded: 'Browser storage inspector',
          },
        ],
      })),
    },
    columns: [],
    userEdits: [],
    chatHistory: [],
    fileNames: [],
    versionHistory: [],
    selectedFeatures,
    deliverableFeatureIds: selectedFeatures.filter((featureId) => featureId !== 'courseMap'),
    deliverableManifest: Object.fromEntries(
      selectedFeatures
        .filter((featureId) => featureId !== 'courseMap')
        .map((featureId) => [featureId, { status: 'done' }]),
    ),
    deliverableConfig: {},
    lessonScope: { type: 'all' },
    promptText: 'A 15-lesson browser autosave recovery course.',
    activeTab: 'courseMap',
    deliverableSaveMode: 'recompile-on-open',
    deliverables: {},
  };
}

test('local autosave compacts oversized restored projects instead of failing quota', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((project) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('coursemapper-project', JSON.stringify(project));
  }, oversizedSavedProject());
  await page.reload();

  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const saved = JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
          return {
            mode: saved.localSaveMode || '',
            deliverableSaveMode: saved.deliverableSaveMode || '',
            deliverablesEmpty: Object.keys(saved.deliverables || {}).length === 0,
            rubricStatus: saved.deliverableManifest?.rubrics?.status || '',
            hasSentinel: JSON.stringify(saved).includes('autosave-oversized-rubric-sentinel'),
          };
        }),
      { timeout: 7000 },
    )
    .toEqual({
      mode: 'compact-autosave',
      deliverableSaveMode: 'recompile-on-open',
      deliverablesEmpty: true,
      rubricStatus: 'done',
      hasSentinel: false,
    });
});

test('local autosave moves an exact project to IndexedDB when the origin storage bucket is full', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (project) => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('coursemapper-project-autosave-v1');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.setItem('coursemapper-project', JSON.stringify(project));

    // Fill the origin bucket while preserving the small project seed. The
    // restored compiler expands the nine material families, forcing the
    // autosave onto the larger IndexedDB belt.
    let low = 0;
    let high = 5_200_000;
    while (low + 1024 < high) {
      const next = Math.floor((low + high) / 2);
      try {
        localStorage.setItem('coursemapper-quota-pressure', 'q'.repeat(next));
        low = next;
      } catch {
        high = next;
      }
    }
  }, quotaPressureProject());
  await page.reload();

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const marker = JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
          return {
            indexedDbAutosave: marker.indexedDbAutosave === true,
            localSaveMode: marker.localSaveMode || '',
            saveFailureVisible: document.body.textContent.includes('Local save failed'),
          };
        }),
      { timeout: 10000 },
    )
    .toEqual({
      indexedDbAutosave: true,
      localSaveMode: 'indexeddb-autosave',
      saveFailureVisible: false,
    });

  const indexedDbPayload = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('coursemapper-project-autosave-v1', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('projects', 'readonly');
          const getRequest = transaction.objectStore('projects').get('current');
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => resolve(getRequest.result?.payload || '');
        };
      }),
  );
  expect(indexedDbPayload).toContain('IndexedDB Autosave Recovery');
  expect(indexedDbPayload).toContain('quizBank');

  await page.reload();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('heading', { name: 'IndexedDB Autosave Recovery' })).toBeVisible({ timeout: 10000 });
});
