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

test('local autosave preserves an oversized restored project exactly in IndexedDB', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async (project) => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('coursemapper-project-autosave-v1');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.setItem('coursemapper-project', JSON.stringify(project));
  }, oversizedSavedProject());
  await page.reload();

  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const marker = JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
          if (marker.indexedDbAutosave !== true) {
            return {
              mode: marker.localSaveMode || '',
              indexedDbAutosave: false,
              markerHasSentinel: JSON.stringify(marker).includes('autosave-oversized-rubric-sentinel'),
              exactRubricStatus: '',
              exactHasSentinel: false,
              exactDeliverableSaveMode: '',
            };
          }
          const exact = await new Promise((resolve) => {
            const open = indexedDB.open('coursemapper-project-autosave-v1', 1);
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
              const database = open.result;
              const transaction = database.transaction('projects', 'readonly');
              const read = transaction.objectStore('projects').get('current');
              read.onerror = () => resolve(null);
              read.onsuccess = () => {
                try {
                  resolve(JSON.parse(read.result?.payload || 'null'));
                } catch {
                  resolve(null);
                }
              };
            };
          });
          return {
            mode: marker.localSaveMode || '',
            indexedDbAutosave: marker.indexedDbAutosave === true,
            markerHasSentinel: JSON.stringify(marker).includes('autosave-oversized-rubric-sentinel'),
            exactRubricStatus: exact?.deliverables?.rubrics?.status || '',
            exactHasSentinel: JSON.stringify(exact).includes('autosave-oversized-rubric-sentinel'),
            exactDeliverableSaveMode: exact?.deliverableSaveMode || '',
          };
        }),
      { timeout: 7000 },
    )
    .toEqual({
      mode: 'indexeddb-autosave',
      indexedDbAutosave: true,
      markerHasSentinel: false,
      exactRubricStatus: 'done',
      exactHasSentinel: true,
      exactDeliverableSaveMode: '',
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
  // A quota-saturated 15-lesson project must hydrate nine material families
  // and open its IndexedDB fallback before the workspace mounts. Shared CI
  // runners can take longer than the old 10-second assertion even though the
  // trace shows the exact workspace immediately afterward. Keep the user
  // contract strict, but wait for the real recovery boundary rather than a
  // runner-speed threshold.
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 30000 });
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
