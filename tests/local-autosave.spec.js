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
