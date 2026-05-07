import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

function exportFixture() {
  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    modelName: 'GPT-4o mini',
    courseMap: {
      courseName: 'Export Smoke Course',
      semester: 'Spring 2026',
      lessons: [
        {
          title: 'Lesson 1: Export Reliability',
          sections: [
            {
              learningGoals: 'Explain how file exports support curriculum operations.',
              topicSection: 'Export smoke testing',
              learningObjectives: 'Verify that generated course artifacts can be downloaded.',
              weeklyAssessments: 'Export checklist',
              asyncActivities: 'Review generated artifacts.',
              syncActivities: 'Compare downloaded files.',
              technologyNeeded: 'Browser download support',
            },
          ],
        },
        {
          title: 'Lesson 2: Portable Course Materials',
          sections: [
            {
              learningGoals: 'Evaluate portable file formats for instructors.',
              topicSection: 'Portable deliverables',
              learningObjectives: 'Choose an export format for a given teaching workflow.',
              weeklyAssessments: 'Format selection note',
              asyncActivities: 'Inspect CSV, DOCX, PDF, XLSX, and PPTX outputs.',
              syncActivities: 'Discuss export failure recovery.',
              technologyNeeded: 'Spreadsheet and document viewers',
            },
          ],
        },
      ],
    },
    columns: [
      { key: 'learningGoals', label: 'Learning Goals', enabled: true },
      { key: 'topicSection', label: 'Topics', enabled: true },
      { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
      { key: 'weeklyAssessments', label: 'Assessments', enabled: true },
      { key: 'asyncActivities', label: 'Async Activities', enabled: true },
      { key: 'syncActivities', label: 'Sync Activities', enabled: true },
      { key: 'technologyNeeded', label: 'Technology', enabled: true },
    ],
    userEdits: [],
    chatHistory: [],
    fileNames: [],
    versionHistory: [],
    selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
    deliverableConfig: {
      lessonPlans: {},
      slideDecks: { slideCount: 4 },
    },
    lessonScope: { type: 'all' },
    promptText: 'Export smoke course',
    activeTab: 'courseMap',
    deliverables: {
      lessonPlans: {
        status: 'done',
        data: {
          lessonPlans: [
            {
              lessonTitle: 'Lesson 1: Export Reliability',
              duration: '75 minutes',
              bloomsLevels: ['Analyze', 'Evaluate'],
              objectives: ['Verify generated exports', 'Identify format-specific risks'],
              materials: ['Export checklist', 'Generated workspace'],
              outline: [
                {
                  time: '15 min',
                  activity: 'Warm-up',
                  description: 'List formats instructors need for course delivery.',
                },
                {
                  time: '45 min',
                  activity: 'Export lab',
                  description: 'Download and inspect representative generated materials.',
                },
              ],
              closingActivity: 'Name one export failure a smoke test should catch.',
            },
            {
              lessonTitle: 'Lesson 2: Portable Course Materials',
              duration: '75 minutes',
              bloomsLevels: ['Apply'],
              objectives: ['Match workflows to formats'],
              materials: ['Sample export files'],
              outline: [
                {
                  time: '30 min',
                  activity: 'Format comparison',
                  description: 'Compare CSV, DOCX, PDF, XLSX, and PPTX outputs.',
                },
              ],
              closingActivity: 'Pick a default format for a teaching team handoff.',
            },
          ],
        },
        error: null,
        stale: false,
      },
      slideDecks: {
        status: 'done',
        data: {
          decks: [
            {
              lessonTitle: 'Lesson 1: Export Reliability',
              slides: [
                {
                  title: 'Export Reliability',
                  bullets: ['Downloads must complete', 'Files need meaningful names'],
                  speakerNotes: 'Introduce the smoke test goals.',
                },
                {
                  title: 'Regression Coverage',
                  bullets: ['Course map', 'Lesson plans', 'Slide decks', 'ZIP bundle'],
                  speakerNotes: 'Connect each button to a format risk.',
                },
                {
                  title: 'Local Downloads',
                  bullets: ['XLSX for maps', 'CSV for tabular deliverables'],
                  speakerNotes: 'Discuss data handoff formats.',
                },
                {
                  title: 'Rich Documents',
                  bullets: ['PDF for reading', 'DOCX for editing'],
                  speakerNotes: 'Discuss instructor review workflows.',
                },
                {
                  title: 'Bundle Export',
                  bullets: ['ZIP combines generated materials', 'Project backup keeps source state'],
                  speakerNotes: 'Close with backup and portability expectations.',
                },
              ],
            },
            {
              lessonTitle: 'Lesson 2: Portable Course Materials',
              slides: [
                {
                  title: 'Portable Materials',
                  bullets: ['Shareable formats', 'Cloud handoff', 'Offline backup'],
                  speakerNotes: 'Discuss instructor workflows.',
                },
                {
                  title: 'Format Selection',
                  bullets: ['Choose files by audience', 'Keep source state versioned'],
                  speakerNotes: 'Frame export choices as operational decisions.',
                },
                {
                  title: 'Cloud Export Path',
                  bullets: ['Needs Google auth', 'Must report clear errors'],
                  speakerNotes: 'Explain why the test mocks a Google script failure.',
                },
                {
                  title: 'Download Verification',
                  bullets: ['Assert file extension', 'Assert non-empty file size'],
                  speakerNotes: 'Describe the smoke test assertions.',
                },
                {
                  title: 'Release Gate',
                  bullets: ['Run before production release', 'Keep heavy exporters lazy'],
                  speakerNotes: 'Connect export coverage to release readiness.',
                },
              ],
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

async function restoreExportWorkspace(page) {
  const snapshot = exportFixture();
  await page.addInitScript((projectSnapshot) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('coursemapper-project', JSON.stringify(projectSnapshot));
  }, snapshot);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('workspace-shell')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('export-side-panel')).toBeVisible({ timeout: 10000 });
}

async function expectDownload(page, click, { extension, nameIncludes, minBytes = 50 }) {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  const fileName = download.suggestedFilename();
  await expect(download.failure()).resolves.toBeNull();
  expect(fileName).toContain(nameIncludes);
  expect(fileName.toLowerCase()).toMatch(new RegExp(`\\.${extension.toLowerCase()}$`));

  const path = await download.path();
  const stat = await fs.stat(path);
  expect(stat.size).toBeGreaterThan(minBytes);
  return { fileName, size: stat.size };
}

async function switchWorkspaceTab(page, label) {
  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
  await expect(page.getByTestId('export-side-panel')).toContainText(`${label} only`);
}

test.describe('Export smoke', () => {
  test('downloads representative generated workspace formats and reports cloud auth errors', async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await restoreExportWorkspace(page);

    await expectDownload(page, () => page.getByTestId('export-format-xlsx').click(), {
      extension: 'xlsx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    await expectDownload(page, () => page.getByTestId('export-format-pdf').click(), {
      extension: 'pdf',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });

    await switchWorkspaceTab(page, 'Lesson Plans');
    await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });

    await page.route('https://accounts.google.com/gsi/client', (route) => route.abort());
    const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await page.getByTestId('export-format-gdocs').click();
    const popup = await popupPromise;
    await expect(page.getByTestId('export-error')).toContainText('Google Identity Services', { timeout: 15000 });
    await popup?.close().catch(() => {});

    await switchWorkspaceTab(page, 'Slide Decks');
    await expectDownload(page, () => page.getByTestId('export-format-pptx').click(), {
      extension: 'pptx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('export-side-panel')).toContainText('3 items ready');
    await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    await expectDownload(page, () => page.getByTestId('export-save-project').click(), {
      extension: 'coursemapper',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
  });
});
