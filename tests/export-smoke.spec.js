import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { auditCourseMaterialsZip } from './lib/exportQualityAudit.js';

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
    selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks', 'courseFaq'],
    deliverableConfig: {
      lessonPlans: {},
      slideDecks: { slideCount: 4 },
      courseFaq: {},
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
                  speakerNotes:
                    'Introduce the smoke test goals and explain why each exported artifact needs a quick inspection.',
                },
                {
                  title: 'Regression Coverage',
                  bullets: ['Course map', 'Lesson plans', 'Slide decks', 'ZIP bundle'],
                  speakerNotes:
                    'Connect each export button to a concrete format risk that instructors would notice during handoff.',
                },
                {
                  title: 'Local Downloads',
                  bullets: ['XLSX for maps', 'CSV for tabular deliverables'],
                  speakerNotes:
                    'Discuss how spreadsheet formats support sorting, filtering, and comparison across generated course rows.',
                },
                {
                  title: 'Rich Documents',
                  bullets: ['PDF for reading', 'DOCX for editing'],
                  speakerNotes:
                    'Discuss why prose-heavy materials need editable document exports before students receive them.',
                },
                {
                  title: 'Bundle Export',
                  bullets: ['ZIP combines generated materials', 'Project backup keeps source state'],
                  speakerNotes:
                    'Close by connecting ZIP downloads and project backups to reliable course portability workflows.',
                },
              ],
            },
            {
              lessonTitle: 'Lesson 2: Portable Course Materials',
              slides: [
                {
                  title: 'Portable Materials',
                  bullets: ['Shareable formats', 'Cloud handoff', 'Offline backup'],
                  speakerNotes:
                    'Discuss the instructor workflow differences between shareable exports, cloud handoff, and offline backup.',
                },
                {
                  title: 'Format Selection',
                  bullets: ['Choose files by audience', 'Keep source state versioned'],
                  speakerNotes:
                    'Frame export choices as operational decisions based on reviewer needs and future revision paths.',
                },
                {
                  title: 'Cloud Export Path',
                  bullets: ['Needs Google auth', 'Must report clear errors'],
                  speakerNotes:
                    'Explain why the test mocks a Google script failure and expects a clear recovery message.',
                },
                {
                  title: 'Download Verification',
                  bullets: ['Assert file extension', 'Assert non-empty file size'],
                  speakerNotes:
                    'Describe how extension, filename, size, and content assertions catch export regressions quickly.',
                },
                {
                  title: 'Release Gate',
                  bullets: ['Run before production release', 'Keep heavy exporters lazy'],
                  speakerNotes:
                    'Connect export coverage to release readiness by naming the risks each automated check reduces.',
                },
              ],
            },
          ],
        },
        error: null,
        stale: false,
      },
      courseFaq: {
        status: 'done',
        data: {
          faqs: [
            {
              lessonTitle: 'Lesson 1: Export Reliability',
              questions: [
                {
                  question: 'How do I confirm a course map export worked?',
                  answer:
                    'Open the exported workbook and verify that each lesson row, enabled column, and course title is present.',
                  category: 'Course Logistics',
                  relatedConcepts: ['Course Map', 'Export QA'],
                  difficulty: 'Basic',
                },
                {
                  question: 'Why does the export smoke test include multiple file formats?',
                  answer:
                    'Each format exercises a different exporter, so the test catches regressions in tabular, document, and slide pipelines.',
                  category: 'Technical Help',
                  relatedConcepts: ['Regression Coverage'],
                  difficulty: 'Intermediate',
                },
                {
                  question: 'What should an instructor do when a cloud export fails?',
                  answer:
                    'Use the local download first, then reconnect Google Drive after reviewing the displayed authentication error.',
                  category: 'Course Logistics',
                  relatedConcepts: ['Google Drive', 'Fallback Export'],
                  difficulty: 'Basic',
                },
                {
                  question: 'How can exported materials support a teaching-team handoff?',
                  answer:
                    'They package the course plan in editable files that instructors can inspect, revise, and archive outside the app.',
                  category: 'Assignment Clarification',
                  relatedConcepts: ['Course Operations'],
                  difficulty: 'Intermediate',
                },
                {
                  question: 'What is the strongest signal that ZIP export is production-ready?',
                  answer:
                    'The ZIP contains every selected deliverable folder with readable files and no draft markers or empty notes.',
                  category: 'Assessment Prep',
                  relatedConcepts: ['ZIP Audit'],
                  difficulty: 'Advanced',
                },
              ],
              tags: ['export', 'quality assurance'],
            },
            {
              lessonTitle: 'Lesson 2: Portable Course Materials',
              questions: [
                {
                  question: 'Which export format is best for spreadsheet review?',
                  answer:
                    'Use XLSX or CSV when the reviewer needs rows, columns, sorting, or quick comparison across lessons.',
                  category: 'Technical Help',
                  relatedConcepts: ['XLSX', 'CSV'],
                  difficulty: 'Basic',
                },
                {
                  question: 'Which export format is best for instructor editing?',
                  answer:
                    'Use DOCX when instructors need to revise prose-heavy materials before sharing them with students.',
                  category: 'Course Logistics',
                  relatedConcepts: ['DOCX'],
                  difficulty: 'Basic',
                },
                {
                  question: 'Why should slide speaker notes be audited?',
                  answer:
                    'Speaker notes carry teaching guidance that is invisible on slides, so empty notes weaken classroom usability.',
                  category: 'Concept Explanation',
                  relatedConcepts: ['Slide Decks', 'Speaker Notes'],
                  difficulty: 'Intermediate',
                },
                {
                  question: 'How should teams archive a generated workspace?',
                  answer:
                    'Download the project file alongside the exported materials so the source state can be reopened later.',
                  category: 'Course Logistics',
                  relatedConcepts: ['Project Backup'],
                  difficulty: 'Intermediate',
                },
                {
                  question: 'What does a ZIP quality audit catch that size checks miss?',
                  answer:
                    'It inspects file contents for missing folders, leaked draft markers, short notes, and FAQ count regressions.',
                  category: 'Assessment Prep',
                  relatedConcepts: ['Content Audit'],
                  difficulty: 'Advanced',
                },
              ],
              tags: ['portable formats', 'course archive'],
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

async function restoreExportWorkspace(page, mutateSnapshot = null) {
  const snapshot = exportFixture();
  if (mutateSnapshot) mutateSnapshot(snapshot);
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
  return { fileName, path, size: stat.size };
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

    await expect(page.getByTestId('readiness-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

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
    await expect(page.getByTestId('export-side-panel')).toContainText('4 deliverables ready');
    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const audit = await auditCourseMaterialsZip(zipDownload.path, {
      expectedFolders: ['Course Map', 'Lesson Plans', 'Slide Decks', 'Course FAQ'],
      expectedFaqQuestionsPerLesson: {
        'Lesson 1: Export Reliability': 5,
        'Lesson 2: Portable Course Materials': 5,
      },
      minSpeakerNoteWords: 20,
    });
    expect(audit.issues).toEqual([]);

    await expectDownload(page, () => page.getByTestId('export-save-project').click(), {
      extension: 'coursemapper',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
  });

  test('exports compact quiz-bank questions to current-tab CSV', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'quizBank'];
      snapshot.activeTab = 'quizBank';
      snapshot.deliverableConfig = { quizBank: {} };
      snapshot.deliverables = {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Export Reliability',
                qs: Array.from({ length: 5 }, (_, index) => ({
                  type: index === 0 ? 'multiple_choice' : 'short_answer',
                  bloomsLevel: index === 0 ? 'Analyze' : 'Apply',
                  difficulty: 'Medium',
                  estimatedMinutes: 3,
                  question:
                    index === 0
                      ? 'Which audit catches compact quiz rows in a CSV export?'
                      : `Name export verification step ${index + 1}.`,
                  options:
                    index === 0
                      ? ['A. Theme preview', 'B. CSV row inspection', 'C. Login retry', 'D. Palette scan']
                      : undefined,
                  answer: index === 0 ? 'B' : `Verification step ${index + 1}`,
                  explanation:
                    index === 0
                      ? 'CSV row inspection confirms generated questions survive the export path.'
                      : `The step checks artifact content ${index + 1}.`,
                  points: 2,
                })),
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                qs: Array.from({ length: 5 }, (_, index) => ({
                  type: 'short_answer',
                  bloomsLevel: 'Apply',
                  difficulty: 'Medium',
                  estimatedMinutes: 3,
                  question: `How should instructors inspect portable export ${index + 1}?`,
                  answer: `Open the artifact and compare portable export ${index + 1} with the workspace.`,
                  explanation: `This confirms the portable export preserved lesson content ${index + 1}.`,
                  points: 2,
                })),
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Quiz & Exam Bank');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');

    expect(csv).toContain('Which audit catches compact quiz rows in a CSV export?');
    expect(csv).toContain('CSV row inspection confirms generated questions survive the export path.');
    expect(csv).toContain('Name export verification step 5.');
  });

  test('exports compact slide decks to current-tab PPTX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'slideDecks'];
      snapshot.activeTab = 'slideDecks';
      snapshot.deliverableConfig = { slideDecks: { slideCount: 3 } };
      snapshot.deliverables = {
        slideDecks: {
          status: 'done',
          data: {
            decks: snapshot.courseMap.lessons.map((lesson, lessonIndex) => ({
              lt: lesson.title,
              sl: Array.from({ length: 3 }, (_, slideIndex) => ({
                t:
                  lessonIndex === 0 && slideIndex === 0
                    ? 'Compact slide title survives export'
                    : `Compact slide ${lessonIndex + 1}.${slideIndex + 1}`,
                ty: slideIndex === 0 ? 'content' : 'activity',
                bu:
                  lessonIndex === 0 && slideIndex === 0
                    ? ['Compact bullet survives export', 'PowerPoint output remains reviewable']
                    : ['Review exported deck', 'Confirm speaker notes are present'],
                no:
                  lessonIndex === 0 && slideIndex === 0
                    ? 'These compact speaker notes should appear in the downloaded PowerPoint notes pane for artifact review.'
                    : 'Use these speaker notes to guide the instructor through the exported compact slide deck.',
              })),
            })),
          },
          error: null,
          stale: false,
        },
      };
    });

    await expect(page.getByTestId('readiness-status')).toContainText('Ready');
    const download = await expectDownload(page, () => page.getByTestId('export-format-pptx').click(), {
      extension: 'pptx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(download.path));
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
    const notesXml = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');

    expect(slideXml).toContain('Compact slide title survives export');
    expect(slideXml).toContain('Compact bullet survives export');
    expect(notesXml).toContain('compact speaker notes');
  });

  test('exports compact rubrics to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.activeTab = 'rubrics';
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.deliverables = {
        rubrics: {
          status: 'done',
          data: {
            rubrics: snapshot.courseMap.lessons.map((lesson, lessonIndex) => ({
              t: lessonIndex === 0 ? 'Compact Rubric Export Audit' : 'Portable Materials Rubric',
              lt: lesson.title,
              at: 'Project',
              tp: 100,
              bl: 'Evaluate',
              cr: [
                {
                  cn: lessonIndex === 0 ? 'Artifact evidence' : 'Format decision evidence',
                  oa: 'Export verification workflow',
                  wt: 40,
                  pt: 40,
                  ex:
                    lessonIndex === 0
                      ? 'Specific evidence from CSV and DOCX artifacts.'
                      : 'Specific evidence from portable export comparisons.',
                  pr: 'Names relevant exported files and one quality signal.',
                  dv: 'Mentions an export but gives little artifact evidence.',
                  bg: 'Does not inspect exported materials.',
                },
                {
                  cn: 'Recommendation quality',
                  oa: 'Instructor handoff decision',
                  wt: 60,
                  pt: 60,
                  ex: 'Recommendation clearly matches the instructor handoff workflow.',
                  pr: 'Recommendation is usable but misses one workflow constraint.',
                  dv: 'Recommendation is generic and weakly connected to export evidence.',
                  bg: 'No actionable recommendation is provided.',
                },
              ],
            })),
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Rubrics');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Compact Rubric Export Audit');
    expect(csv).toContain('Artifact evidence');
    expect(csv).toContain('Specific evidence from CSV and DOCX artifacts.');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Compact Rubric Export Audit');
    expect(documentXml).toContain('Artifact evidence');
    expect(documentXml).toContain('Specific evidence from CSV and DOCX artifacts.');
  });

  test('exports compact assignment briefs to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'assignments'];
      snapshot.activeTab = 'assignments';
      snapshot.deliverableConfig = { assignments: {} };
      snapshot.deliverables = {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                t: 'Compact Assignment Export Audit',
                at: 'Project',
                rl: ['Lesson 1: Export Reliability'],
                dw: 'Week 4',
                et: '3 hours',
                tp: 50,
                pg: '50%',
                bl: 'Evaluate',
                ov: 'Audit exported course materials for instructor handoff readiness.',
                ob: ['Verify assignment artifacts', 'Document remaining readiness warnings'],
                ins: ['Open each exported file.', { step: 'Record any missing assignment details.' }],
                fr: { ln: '2 pages', fm: 'Memo', cs: 'APA 7th', sp: 'LMS upload' },
                dl: ['Audit memo', { name: 'Evidence checklist' }],
                sm: [{ ms: 'Draft audit', dd: 'Week 3', de: 'Submit initial export findings.' }],
                gc: 'Specific evidence and actionable recommendations.',
                sr: ['Export checklist'],
                ai: 'Use generated materials only as reviewed course evidence.',
              },
              {
                t: 'Portable Materials Reflection',
                at: 'Reflection',
                rl: ['Lesson 2: Portable Course Materials'],
                dw: 'Week 5',
                et: '2 hours',
                tp: 50,
                pg: '50%',
                bl: 'Apply',
                ov: 'Recommend the best export package for a teaching-team handoff.',
                ob: ['Compare export formats'],
                ins: ['Choose a format bundle.', 'Justify your recommendation.'],
                fr: { ln: '1 page', fm: 'Brief' },
                dl: ['Recommendation brief'],
                gc: 'Clear fit between format choice and reviewer workflow.',
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Assignment Briefs');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Compact Assignment Export Audit');
    expect(csv).toContain('Evidence checklist');
    expect(csv).toContain('APA 7th');
    expect(csv).not.toContain('Record any missing assignment details.,,,');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Compact Assignment Export Audit');
    expect(documentXml).toContain('Record any missing assignment details.');
    expect(documentXml).toContain('Evidence checklist');
    expect(documentXml).toContain('Specific evidence and actionable recommendations.');
  });

  test('exports compact discussion prompts to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'discussions'];
      snapshot.activeTab = 'discussions';
      snapshot.deliverableConfig = { discussions: {} };
      snapshot.deliverables = {
        discussions: {
          status: 'done',
          data: {
            discussions: [
              {
                lt: 'Lesson 1: Export Reliability',
                bl: 'Evaluate',
                fm: 'Small groups',
                ed: '20 minutes',
                cx: 'Students have just inspected exported materials.',
                pr: 'Which export artifact would you trust for instructor handoff?',
                er: 'Cite one concrete file-quality signal from the exported materials.',
                fp: ['What would change your recommendation?', 'Which artifact needs another review pass?'],
                ft: {
                  op: 'Ask students to name the artifact first.',
                  is: 'Compare CSV and DOCX review workflows.',
                  id: 'Invite quieter groups to report a different format.',
                  cl: 'Collect one export-quality criterion.',
                },
                rs: ['I would trust...', 'The strongest evidence is...'],
                ec: ['Uses artifact evidence', 'Explains tradeoffs'],
                eq: 'Offer a written response option for students who need processing time.',
                gl: 'Keep recommendations grounded in downloaded files.',
              },
              {
                lt: 'Lesson 2: Portable Course Materials',
                bl: 'Analyze',
                fm: 'Threaded discussion',
                ed: '25 minutes',
                cx: 'Students compare portable export formats.',
                pr: 'How should a teaching team choose between CSV and DOCX handoff files?',
                er: 'Reference the reviewer workflow and one artifact limitation.',
                fp: ['Who is the reviewer?', 'What later revision is likely?'],
                ft: {
                  op: 'Start with a quick format poll.',
                  is: 'Ask for the next file the reviewer would open.',
                  cl: 'Summarize tradeoffs by audience.',
                },
                rs: ['For spreadsheet review...', 'For prose revision...'],
                ec: ['Names the audience', 'Justifies the format'],
                gl: 'Compare concrete workflows, not personal preferences.',
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Discussion Prompts');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Which export artifact would you trust for instructor handoff?');
    expect(csv).toContain('Cite one concrete file-quality signal from the exported materials.');
    expect(csv).toContain('Invite quieter groups to report a different format.');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Which export artifact would you trust for instructor handoff?');
    expect(documentXml).toContain('Cite one concrete file-quality signal from the exported materials.');
    expect(documentXml).toContain('Invite quieter groups to report a different format.');
  });

  test('exports compact study guides to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'studyGuides'];
      snapshot.activeTab = 'studyGuides';
      snapshot.deliverableConfig = { studyGuides: {} };
      snapshot.deliverables = {
        studyGuides: {
          status: 'done',
          data: {
            guides: [
              {
                lt: 'Lesson 1: Export Reliability',
                es: 'Covers export verification vocabulary and review workflows.',
                su: 'Students use this guide to inspect whether generated artifacts are ready for instructor handoff.',
                kt: [
                  {
                    tm: 'Artifact audit',
                    df: 'A structured check of downloaded course materials.',
                    ex: 'Opening a CSV to confirm compact study guide terms appear.',
                  },
                ],
                cc: ['Readiness warnings connect to later revision planning.'],
                cm: [
                  {
                    mc: 'A completed download means the content is complete.',
                    co: 'Reviewers still need to inspect fields.',
                  },
                ],
                rq: [
                  {
                    q: 'Which field proves a compact guide survived export?',
                    bl: 'Analyze',
                    ht: 'Look for lesson-specific terms.',
                  },
                ],
                pa: ['Close the app and reconstruct the export checklist from memory.'],
                ep: {
                  kk: ['Artifact audit', 'Readiness report'],
                  tl: 'Spend two minutes on each exported file before deeper review.',
                  ce: 'Students often skip speaker notes and study guide prompts.',
                  rv: 'Use spaced retrieval to revisit each export-quality signal.',
                },
              },
              {
                lt: 'Lesson 2: Portable Course Materials',
                es: 'Covers portable file review choices.',
                su: 'Students compare exported formats and explain which file supports each teaching workflow.',
                kt: [
                  {
                    tm: 'Portable handoff',
                    df: 'A package that lets another instructor inspect and revise course materials.',
                    ex: 'Sharing a DOCX study guide with editable review questions.',
                  },
                ],
                cc: ['CSV review supports the same evidence check as DOCX review.'],
                cm: [
                  {
                    mc: 'Every format serves the same reviewer.',
                    co: 'Different formats support different review tasks.',
                  },
                ],
                rq: [
                  { q: 'When should a reviewer choose DOCX over CSV?', bl: 'Apply', ht: 'Think about prose revision.' },
                ],
                pa: ['Match three export formats to three reviewer needs.'],
                ep: {
                  kk: ['Portable handoff', 'Reviewer workflow'],
                  tl: 'Start with the format that answers the review question.',
                  ce: 'Students often ignore who will revise the artifact.',
                  rv: 'Practice explaining the reviewer workflow aloud.',
                },
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Study Guides');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Artifact audit: A structured check of downloaded course materials.');
    expect(csv).toContain('Which field proves a compact guide survived export?');
    expect(csv).toContain('Time: Spend two minutes on each exported file before deeper review.');
    expect(csv).toContain('Errors: Students often skip speaker notes and study guide prompts.');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Artifact audit');
    expect(documentXml).toContain('Which field proves a compact guide survived export?');
    expect(documentXml).toContain('Spend two minutes on each exported file before deeper review.');
    expect(documentXml).toContain('Students often skip speaker notes and study guide prompts.');
  });

  test('allows ZIP export with confirmation when selected generated materials only have warnings', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'courseFaq'];
      snapshot.deliverables = {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Export Reliability',
                questions: [
                  {
                    question: 'How do I verify an export?',
                    answer: 'Check the downloaded file for the expected content.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Which format is best for editing?',
                    answer: 'DOCX works well for prose edits.',
                    category: 'Technical Help',
                  },
                  {
                    question: 'What if a download fails?',
                    answer: 'Retry the export and review the error message.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Why keep a project backup?',
                    answer: 'It preserves the editable workspace outside the browser.',
                    category: 'Assignment Clarification',
                  },
                ],
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                questions: [
                  {
                    question: 'When should I use CSV?',
                    answer: 'Use CSV for simple spreadsheet review and imports.',
                    category: 'Technical Help',
                  },
                  {
                    question: 'When should I use PDF?',
                    answer: 'Use PDF for read-only review and sharing.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Why export slide decks separately?',
                    answer: 'Slides need their own presentation-specific format.',
                    category: 'Assessment Prep',
                  },
                  {
                    question: 'What should I archive after release?',
                    answer: 'Archive both the exported files and the project backup.',
                    category: 'Course Logistics',
                  },
                ],
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                questions: [
                  {
                    question: 'When should I use CSV?',
                    answer: 'Use CSV for simple spreadsheet review and imports.',
                    category: 'Technical Help',
                  },
                  {
                    question: 'When should I use PDF?',
                    answer: 'Use PDF for read-only review and sharing.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Why export slide decks separately?',
                    answer: 'Slides need their own presentation-specific format.',
                    category: 'Assessment Prep',
                  },
                  {
                    question: 'What should I archive after release?',
                    answer: 'Archive both the exported files and the project backup.',
                    category: 'Course Logistics',
                  },
                ],
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                questions: [
                  {
                    question: 'When should I use CSV?',
                    answer: 'Use CSV for simple spreadsheet review and imports.',
                    category: 'Technical Help',
                  },
                  {
                    question: 'When should I use PDF?',
                    answer: 'Use PDF for read-only review and sharing.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Why export slide decks separately?',
                    answer: 'Slides need their own presentation-specific format.',
                    category: 'Assessment Prep',
                  },
                  {
                    question: 'What should I archive after release?',
                    answer: 'Archive both the exported files and the project backup.',
                    category: 'Course Logistics',
                  },
                ],
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready with warnings');
    await expect(page.getByTestId('readiness-panel')).toContainText('Course FAQ');
    await expect(page.getByTestId('readiness-panel')).toContainText('fewer than 5 questions');
    await expect(page.getByTestId('export-download-zip')).toBeEnabled();
    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('readiness-confirm')).toBeVisible();
    await expect(page.getByTestId('readiness-confirm')).toContainText('Export anyway');

    const zipDownload = await expectDownload(page, () => page.getByTestId('readiness-export-anyway').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report).toContain('Course FAQ');
    expect(report).toContain('fewer than 5 questions');
  });

  test('allows ZIP export with confirmation when generated quiz content is thin', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'quizBank'];
      snapshot.deliverables = {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Export Reliability',
                questions: [
                  {
                    type: 'multiple_choice',
                    difficulty: 'Easy',
                    estimatedMinutes: 2,
                    question: 'Which export format bundles all selected materials?',
                    options: ['ZIP', 'CSV', 'PDF', 'TXT'],
                    answer: 'ZIP',
                  },
                  {
                    type: 'short_answer',
                    difficulty: 'Medium',
                    estimatedMinutes: 4,
                    question: 'Name one reason to inspect a readiness report.',
                    answer: 'It documents known issues before sharing draft materials.',
                  },
                ],
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                questions: Array.from({ length: 5 }, (_, index) => ({
                  type: 'multiple_choice',
                  difficulty: 'Medium',
                  estimatedMinutes: 3,
                  question: `Portable format question ${index + 1}?`,
                  options: ['DOCX', 'PPTX', 'XLSX', 'PDF'],
                  answer: 'DOCX',
                })),
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready with warnings');
    await expect(page.getByTestId('readiness-panel')).toContainText('Quiz & Exam Bank');
    await expect(page.getByTestId('readiness-panel')).toContainText('fewer than 5 questions');
    await expect(page.getByTestId('export-download-zip')).toBeEnabled();
    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('readiness-confirm')).toBeVisible();
    await expect(page.getByTestId('readiness-confirm')).toContainText('Export anyway');
    await expect(page.getByTestId('readiness-export-anyway')).toBeVisible();

    const zipDownload = await expectDownload(page, () => page.getByTestId('readiness-export-anyway').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report).toContain('Quiz & Exam Bank');
    expect(report).toContain('fewer than 5 questions');
  });

  test('requires confirmation before non-ZIP export with warnings without promising a readiness report', async ({
    page,
  }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'courseFaq'];
      snapshot.courseMap.lessons = snapshot.courseMap.lessons.slice(0, 1);
      snapshot.deliverables = {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Export Reliability',
                questions: [
                  {
                    question: 'How do I verify an export?',
                    answer: 'Check the downloaded file for the expected content.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Which format is best for editing?',
                    answer: 'DOCX works well for prose edits.',
                    category: 'Technical Help',
                  },
                  {
                    question: 'What if a download fails?',
                    answer: 'Retry the export and review the error message.',
                    category: 'Course Logistics',
                  },
                  {
                    question: 'Why keep a project backup?',
                    answer: 'It preserves the editable workspace outside the browser.',
                    category: 'Assignment Clarification',
                  },
                ],
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Course FAQ');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready with warnings');
    await page.getByTestId('export-format-csv').click();
    await expect(page.getByTestId('readiness-confirm')).toBeVisible();
    await expect(page.getByTestId('readiness-confirm')).toContainText(
      'This format will not include a readiness report.',
    );
    await expect(page.getByTestId('readiness-confirm')).not.toContainText('The ZIP will include a readiness report.');

    await expectDownload(page, () => page.getByTestId('readiness-export-anyway').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
  });

  test('exports a selected clean lesson without inheriting unselected placeholder blockers', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'courseFaq'];
      snapshot.deliverables = {
        courseFaq: {
          status: 'done',
          data: {
            faqs: [
              {
                lessonTitle: 'Lesson 1: Export Reliability',
                questions: Array.from({ length: 5 }, (_, index) => ({
                  question: `Lesson 1 question ${index + 1}`,
                  answer: `Lesson 1 answer ${index + 1}`,
                  category: 'Course Logistics',
                })),
              },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                questions: Array.from({ length: 5 }, (_, index) => ({
                  question: `Lesson 2 question ${index + 1}`,
                  answer:
                    index === 0 ? 'Replace this placeholder content before release.' : `Lesson 2 answer ${index + 1}`,
                  category: 'Course Logistics',
                })),
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await page.getByRole('button', { name: 'Uncheck all' }).click();
    await page.getByRole('button', { name: 'Lesson 1: Export Reliability' }).click();
    await expect(page.getByText('1 of 2 lessons selected')).toBeVisible();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('placeholder content');
    await expect(page.getByTestId('export-download-zip')).toBeEnabled();

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const audit = await auditCourseMaterialsZip(zipDownload.path, {
      expectedFolders: ['Course Map', 'Course FAQ'],
      expectedFaqQuestionsPerLesson: {
        'Lesson 1: Export Reliability': 5,
      },
    });
    expect(audit.issues).toEqual([]);
  });

  test('blocks all-export readiness when no lessons are selected', async ({ page }) => {
    await restoreExportWorkspace(page);

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');
    await page.getByRole('button', { name: 'Uncheck all' }).click();
    await expect(page.getByText('0 of 2 lessons selected')).toBeVisible();
    await expect(page.getByTestId('readiness-status')).toContainText('Review before export');
    await expect(page.getByTestId('readiness-panel')).toContainText('Select at least one lesson before exporting.');
    await expect(page.getByTestId('export-download-zip')).toBeDisabled();
  });

  test('keeps current-tab export independent from the all-export lesson scope', async ({ page }) => {
    await restoreExportWorkspace(page);

    await page.getByTestId('export-scope-all').click();
    await page.getByRole('button', { name: 'Uncheck all' }).click();
    await expect(page.getByTestId('readiness-panel')).toContainText('Select at least one lesson before exporting.');

    await page.getByTestId('export-scope-current').click();
    await switchWorkspaceTab(page, 'Course FAQ');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('Select at least one lesson before exporting.');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    const normalized = csv.replace(/^\uFEFF/, '');

    expect(normalized.split(/\r?\n/)[0]).toBe('Lesson,Category,Question,Answer,Related Concepts,Difficulty');
    expect(normalized).toContain(
      'Lesson 1: Export Reliability,Course Logistics,How do I confirm a course map export worked?',
    );
    expect(normalized).toContain('Course Map; Export QA');
    expect(normalized).not.toContain('{"question"');
  });

  test('allows ZIP export with confirmation when syllabus still has publishability placeholders', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'syllabus'];
      snapshot.deliverables = {
        syllabus: {
          status: 'done',
          data: {
            courseTitle: 'Export Smoke Course',
            courseDescription: 'Students learn how to inspect and ship publishable course materials.',
            weeklySchedule: [
              {
                week: 'Week 1',
                dates: '[Verify time]',
                topic: 'Readiness review',
                readings: 'Release checklist',
                assignments: 'Fix unresolved placeholders',
              },
            ],
            instructor: '[Instructor name]',
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready with warnings');
    await expect(page.getByTestId('readiness-panel')).toContainText('Syllabus');
    await expect(page.getByTestId('readiness-panel')).toContainText('[Instructor name]');
    await expect(page.getByTestId('readiness-panel')).toContainText('[Verify time]');
    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('readiness-confirm')).toBeVisible();
    await expect(page.getByTestId('readiness-confirm')).toContainText('Export anyway');
    await expect(page.getByTestId('readiness-confirm')).toContainText('[Instructor name]');
    await expect(page.getByTestId('readiness-confirm')).toContainText('[Verify time]');
    await expect(page.getByTestId('readiness-export-anyway')).toBeVisible();

    const zipDownload = await expectDownload(page, () => page.getByTestId('readiness-export-anyway').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report).toContain('Warnings');
    expect(report).toContain('[Instructor name]');
    expect(report).toContain('[Verify time]');
  });

  test('requires confirmation before ZIP export when syllabus still contains generic placeholder copy', async ({
    page,
  }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'syllabus'];
      snapshot.deliverables = {
        syllabus: {
          status: 'done',
          data: {
            courseTitle: 'Export Smoke Course',
            courseDescription: 'Replace this placeholder content before sharing the syllabus with students.',
            weeklySchedule: [
              {
                week: 'Week 1',
                dates: 'Jan 20',
                topic: 'Release review',
                readings: 'Publishing checklist',
                assignments: 'Revise the final draft',
              },
            ],
            instructor: 'Prof. Example',
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready with warnings');
    await expect(page.getByTestId('readiness-panel')).toContainText('placeholder content');
    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('readiness-confirm')).toBeVisible();
    await expect(page.getByTestId('readiness-confirm')).toContainText('placeholder content');
    await expect(page.getByTestId('readiness-export-anyway')).toBeVisible();
  });
});
