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
              successCriteria: [
                'Evidence names the exact exported file inspected.',
                'Model work explains the format risk and the instructor handoff decision.',
              ],
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
                {
                  time: '15 min',
                  activity: 'Handoff synthesis',
                  description: 'Document one export risk, one verification step, and the next handoff action.',
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
              successCriteria: [
                'Evidence compares at least two export formats for a named reviewer workflow.',
                'Model work justifies the recommended format with a maintenance or accessibility reason.',
              ],
              outline: [
                {
                  time: '30 min',
                  activity: 'Format comparison',
                  description: 'Compare CSV, DOCX, PDF, XLSX, and PPTX outputs.',
                },
                {
                  time: '45 min',
                  activity: 'Workflow decision lab',
                  description: 'Select a format for a named reviewer workflow and defend the maintenance tradeoff.',
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
                  title: 'Regression Coverage Activity',
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
                  title: 'Format Selection Activity',
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

function makeIntroPsychCourseMap(lessonCount = 15) {
  const topics = [
    'What Psychology Is and How Psychologists Study Behavior',
    'History, Perspectives, and Research Ethics',
    'Research Methods, Measurement, and Bias',
    'Biology, Brain, and Behavior',
    'Sensation and Perception',
    'Learning and Conditioning',
    'Memory and Information Processing',
    'Thinking, Language, and Intelligence',
    'Human Development Across the Lifespan',
    'Motivation, Emotion, and Stress',
    'Personality Theories and Assessment',
    'Social Psychology and Group Influence',
    'Psychological Disorders and Diagnosis',
    'Treatment, Therapy, and Help-Seeking',
    'Applied Psychology and Course Synthesis',
  ];
  return {
    courseName: 'Intro to Psychology',
    semester: 'Spring 2026',
    lessons: Array.from({ length: lessonCount }, (_, index) => {
      const topic = topics[index] || `Psychology Topic ${index + 1}`;
      return {
        title: `Lesson ${index + 1}: ${topic}`,
        sections: [
          {
            learningGoals: `Explain major ideas in ${topic.toLowerCase()} using introductory psychology evidence.`,
            topicSection: topic,
            learningObjectives: `Identify core concepts in ${topic.toLowerCase()}. Apply those concepts to a short case example. Evaluate strengths and limits of the evidence.`,
            weeklyAssessments: `Lesson ${index + 1} case response and concept check.`,
            asyncActivities: `Read the assigned textbook section on ${topic.toLowerCase()} and complete a short preparation note.`,
            syncActivities: `Discuss a brief scenario, compare explanations, and connect the evidence to everyday behavior.`,
            technologyNeeded: 'LMS quiz, shared notes, and accessible slides.',
          },
        ],
      };
    }),
  };
}

function makeCompiledIntroRubrics(courseMap) {
  return {
    rubrics: (courseMap.lessons || []).map((lesson, index) => {
      const objective = lesson.sections?.[0]?.learningObjectives || 'Apply introductory psychology concepts.';
      return {
        title: `Lesson ${index + 1} Case Response Rubric`,
        lessonTitle: lesson.title,
        gradedWork: 'Case response and concept check',
        assessmentType: 'Assignment',
        totalPoints: 100,
        bloomsLevel: 'Evaluate',
        taskDirections:
          'Score the response with the criteria below. Look for lesson evidence, accurate concept use, and clear explanation.',
        instructorFacilitationNote:
          'Share the rubric before students draft, then use criterion-level feedback for revision guidance and calibration.',
        accessibilityAndUDL:
          'Allow equivalent accessible formats when students demonstrate the same evidence, reasoning, and communication criteria.',
        criteria: [
          {
            criterion: 'Concept accuracy',
            objectiveAligned: objective,
            weight: 25,
            points: 25,
            exemplary:
              'Explains the psychology concept accurately and connects it to the case with specific lesson evidence.',
            proficient: 'Explains the concept accurately and connects it to the case with relevant evidence.',
            developing: 'Names the concept but needs clearer explanation or stronger evidence from the lesson.',
            beginning: 'Uses general description with little accurate concept evidence.',
          },
          {
            criterion: 'Evidence use',
            objectiveAligned: objective,
            weight: 25,
            points: 25,
            exemplary:
              'Uses precise lesson evidence, distinguishes observation from interpretation, and explains why the evidence matters.',
            proficient: 'Uses relevant lesson evidence and explains how it supports the response.',
            developing: 'Includes some evidence but the connection to the response is incomplete.',
            beginning: 'Provides claims with minimal or unclear evidence.',
          },
          {
            criterion: 'Application to behavior',
            objectiveAligned: objective,
            weight: 25,
            points: 25,
            exemplary:
              'Applies the concept to behavior with a careful explanation of context, limits, and alternative interpretations.',
            proficient: 'Applies the concept to behavior with a clear explanation of the main reasoning.',
            developing: 'Attempts application but leaves important reasoning steps unclear.',
            beginning: 'Mentions behavior without a clear course-based application.',
          },
          {
            criterion: 'Communication and revision',
            objectiveAligned: objective,
            weight: 25,
            points: 25,
            exemplary:
              'Organizes the response clearly, uses respectful language, and identifies one useful revision based on feedback.',
            proficient: 'Organizes the response clearly and uses respectful language.',
            developing: 'Communicates the idea but needs clearer organization or revision.',
            beginning: 'Response is difficult to follow or missing revision evidence.',
          },
        ],
      };
    }),
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

async function uncheckAllExportLessons(page) {
  const editButton = page.getByTestId('lesson-scope-edit');
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
  }
  await page.getByRole('button', { name: 'Uncheck all' }).click();
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
    await expect(page.getByTestId('export-format-xlsx')).toHaveCount(0);
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
    await expect(page.getByTestId('export-side-panel')).toContainText('4 materials ready');
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

    // Save .coursemapper lives in the header's project/file disclosure.
    await page.getByTestId('workspace-more-menu-trigger').click();
    await expectDownload(page, () => page.getByTestId('workspace-menu-save-project').click(), {
      extension: 'coursemapper',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
  });

  test('all ZIP export includes only selected workspace deliverables', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'lessonPlans'];
      snapshot.deliverableConfig = { lessonPlans: {} };
      // Extra generated outputs can remain in saved state after users revise
      // selected tabs. The exported package must follow the selected workspace.
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('export-side-panel')).toContainText('2 materials ready');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const fileNames = Object.keys(zip.files);
    expect(fileNames.some((name) => name.includes('Course Map/'))).toBe(true);
    expect(fileNames.some((name) => name.includes('Lesson Plans/'))).toBe(true);
    expect(fileNames.some((name) => name.includes('Slide Decks/'))).toBe(false);
    expect(fileNames.some((name) => name.includes('Course FAQ/'))).toBe(false);
  });

  test('exports compact lesson plans to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'lessonPlans'];
      snapshot.activeTab = 'lessonPlans';
      snapshot.deliverableConfig = { lessonPlans: {} };
      snapshot.deliverables = {
        lessonPlans: {
          status: 'done',
          data: {
            plans: snapshot.courseMap.lessons.map((lesson, lessonIndex) => ({
              lt: lesson.title,
              wk: `Week ${lessonIndex + 1}`,
              dur: '75 minutes',
              bls: lessonIndex === 0 ? ['Analyze', 'Evaluate'] : ['Apply'],
              ob:
                lessonIndex === 0
                  ? ['Verify compact lesson-plan exports', 'Inspect instructor handoff artifacts']
                  : ['Match export formats to reviewer workflows'],
              mt: lessonIndex === 0 ? ['Export checklist', 'Generated workspace'] : ['Portable format matrix'],
              wu: {
                dur: '10 minutes',
                ty: 'Think-Pair-Share',
                pr:
                  lessonIndex === 0
                    ? 'Which lesson-plan field is easiest to lose during export?'
                    : 'Which file format would you inspect first?',
                pu: 'Activate artifact-review criteria.',
              },
              ol: [
                {
                  tm: '20 min',
                  ac: lessonIndex === 0 ? 'CSV audit' : 'DOCX review',
                  ty: 'Workshop',
                  de:
                    lessonIndex === 0
                      ? 'Inspect the downloaded CSV for compact lesson-plan content.'
                      : 'Compare exported lesson-plan prose against the workspace.',
                  in: 'Confirm objectives, warm-up, and homework survived.',
                  gr: 'Pairs',
                  bl: lessonIndex === 0 ? 'Analyze' : 'Apply',
                },
                {
                  tm: '55 min',
                  ac: lessonIndex === 0 ? 'Handoff verification' : 'Portable workflow decision',
                  ty: 'Workshop',
                  de:
                    lessonIndex === 0
                      ? 'Trace objectives, activities, and homework through both export formats, then document the handoff result.'
                      : 'Select a portable format for a named reviewer workflow and justify the decision with export evidence.',
                  in: 'Record the artifact checked, the evidence found, and one revision or release decision.',
                  gr: 'Pairs',
                  bl: lessonIndex === 0 ? 'Evaluate' : 'Apply',
                },
              ],
              fc: {
                ty: 'Exit ticket',
                pr: 'Name one exported lesson-plan field that needs review.',
                oa: lessonIndex === 0 ? 'Verify compact lesson-plan exports' : 'Match export formats',
              },
              un: {
                rp: 'Provide a checklist and example artifact.',
                eg: 'Let students choose CSV or DOCX evidence.',
                ex: 'Students submit a short audit note.',
              },
              hw: {
                t: lessonIndex === 0 ? 'Review the DOCX plan' : 'Revise the handoff checklist',
                de: 'Compare the DOCX lesson plan against the workspace.',
                et: '30 minutes',
                cn: 'Feeds the next export-readiness discussion.',
              },
              ca: 'Collect one concrete exporter quality risk.',
            })),
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Lesson Plans');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Verify compact lesson-plan exports');
    expect(csv).toContain('Which lesson-plan field is easiest to lose during export?');
    expect(csv).toContain('Inspect the downloaded CSV for compact lesson-plan content.');
    expect(csv).toContain('Review the DOCX plan');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Verify compact lesson-plan exports');
    expect(documentXml).toContain('Which lesson-plan field is easiest to lose during export?');
    expect(documentXml).toContain('Inspect the downloaded CSV for compact lesson-plan content.');
    expect(documentXml).toContain('Review the DOCX plan');
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

    const pdfDownload = await expectDownload(page, () => page.getByTestId('export-format-slidepdf').click(), {
      extension: 'pdf',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const pdfBytes = await fs.readFile(pdfDownload.path);
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('exports compact rubrics to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.activeTab = 'rubrics';
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.courseMap.lessons[1].sections[0].weeklyAssessments = 'Format selection report';
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

  test('fills missing rubric coverage in the current tab instead of showing a regenerate warning', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.activeTab = 'rubrics';
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.courseMap.lessons[1].sections[0].weeklyAssessments = 'Format selection report';
      snapshot.deliverables = {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              {
                title: 'Export Reliability Rubric',
                lessonTitle: 'Lesson 1: Export Reliability',
                assessmentType: 'Project',
                totalPoints: 100,
                criteria: [
                  {
                    criterion: 'Export evidence',
                    weight: 100,
                    points: 100,
                    exemplary: 'Uses specific exported files as evidence.',
                    proficient: 'Names exported files with enough evidence.',
                    developing: 'Mentions exports with limited evidence.',
                    beginning: 'Does not use export evidence.',
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

    await switchWorkspaceTab(page, 'Rubrics');
    await expect(page.getByText('Missing coverage')).toHaveCount(0);
    await expect(page.getByText('Lesson 2: Portable Course Materials').first()).toBeVisible();
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
                fp: [
                  'What would change your recommendation?',
                  'Which artifact needs another review pass?',
                  'How would you document the final handoff decision?',
                ],
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
                fp: [
                  'Who is the reviewer?',
                  'What later revision is likely?',
                  'Which format best supports that revision?',
                ],
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

  test('exports syllabus orientation and alignment fields to current-tab CSV and DOCX', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'syllabus'];
      snapshot.activeTab = 'syllabus';
      snapshot.deliverableConfig = { syllabus: {} };
      snapshot.deliverables = {
        syllabus: {
          status: 'done',
          data: {
            courseTitle: 'Export Smoke Course',
            semester: 'Spring 2026',
            instructor: 'Prof. Example',
            instructorBio: 'Prof. Example helps instructors inspect course handoff artifacts before publication.',
            courseDescription: 'Students learn to review generated course materials before sharing them.',
            gettingStarted: 'Open the course site, find the syllabus, and post one export-readiness question.',
            learnerIntroActivity: 'Record a short introduction that names one export format you use often.',
            learningOutcomes: ['Analyze generated course materials for publication readiness.'],
            outcomeAlignmentMatrix: [
              {
                outcome: 'Analyze generated course materials for publication readiness.',
                bloomsLevel: 'Analyze',
                practicedIn: ['Lesson 1: Export Reliability'],
                assessedBy: ['Artifact audit memo'],
              },
            ],
            requiredTexts: [
              {
                author: 'Rivera',
                title: 'Course Export Review',
                edition: '2nd ed.',
                isbn: '9780000000002',
                note: 'Suggested - verify before adoption',
              },
            ],
            courseRequirements: [
              {
                name: 'Artifact audit memo',
                weight: '25%',
                description: 'Students explain whether exported materials are ready to publish.',
              },
            ],
            weeklySchedule: [
              {
                week: 'Week 1',
                dates: 'Jan 20',
                topic: 'Export readiness review',
                readings: 'Course Export Review, chapter 1',
                assignments: 'Artifact audit memo draft',
              },
            ],
            technicalSkills: 'Upload a DOCX file and inspect CSV downloads.',
            technicalSupport: 'Use institutional technical support for LMS access issues.',
            dataPrivacy: 'Student data remains protected under institutional privacy policies.',
            suggestedReviewDate: 'Review by Fall 2027',
            contentOwnerGroup: 'Curriculum Operations',
          },
          error: null,
          stale: false,
        },
      };
    });

    await switchWorkspaceTab(page, 'Syllabus');
    await expect(page.getByTestId('readiness-status')).toContainText('Ready');

    const csvDownload = await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
      extension: 'csv',
      nameIncludes: 'Export Smoke Course',
      minBytes: 100,
    });
    const csv = await fs.readFile(csvDownload.path, 'utf8');
    expect(csv).toContain('Getting Started');
    expect(csv).toContain('Artifact audit memo');
    expect(csv).toContain('ISBN: 9780000000002');
    expect(csv).toContain('Data Privacy');

    const docxDownload = await expectDownload(page, () => page.getByTestId('export-format-docx').click(), {
      extension: 'docx',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const docx = await JSZip.loadAsync(await fs.readFile(docxDownload.path));
    const documentXml = await docx.file('word/document.xml').async('string');
    expect(documentXml).toContain('Getting Started');
    expect(documentXml).toContain('Artifact audit memo');
    expect(documentXml).toContain('Technical Support');
    expect(documentXml).toContain('Data Privacy');
  });

  test('does not block ZIP export on title-only readability noise', async ({ page }) => {
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
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('fewer than 5 questions');

    await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 500,
    });
    await expect(page.getByTestId('readiness-confirm')).toBeHidden();
  });

  test('auto-fixes missing checklist rubric coverage before ZIP export', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.deliverables = {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                title: 'Format Selection Note Rubric',
                totalPoints: 100,
                criteria: [
                  {
                    criterion: 'Format rationale',
                    weight: 100,
                    points: 100,
                    exemplary: 'Selection is justified with clear workflow evidence.',
                    proficient: 'Selection is justified with relevant evidence.',
                    developing: 'Selection has partial workflow evidence.',
                    beginning: 'Selection is listed without support.',
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
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('Rubrics are missing assessed lesson');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    expect(zip.file('READINESS_REPORT.txt')).toBeFalsy();

    const rubricPath = Object.keys(zip.files).find((name) => /Rubrics\/.*\.docx$/.test(name));
    expect(rubricPath).toBeTruthy();
    const rubricDocx = await JSZip.loadAsync(await zip.file(rubricPath).async('uint8array'));
    const rubricXml = await rubricDocx.file('word/document.xml').async('string');
    expect(rubricXml).toContain('Lesson 1: Export Reliability');
  });

  test('downloads compiled intro rubrics without blocking on readability formula noise', async ({ page }) => {
    const courseMap = makeIntroPsychCourseMap(15);
    const rubrics = makeCompiledIntroRubrics(courseMap);

    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.courseMap = courseMap;
      snapshot.promptText = 'Intro to Psychology, 15 lessons, undergraduate';
      snapshot.activeTab = 'rubrics';
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.deliverables = {
        rubrics: {
          status: 'done',
          data: rubrics,
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('Rubrics readability');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Intro to Psychology',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const rubricPath = Object.keys(zip.files).find((name) => /Rubrics\/.*\.docx$/.test(name));
    expect(rubricPath).toBeTruthy();
  });

  test('downloads ZIP when finalizer reports broad rubric readability review guidance', async ({ page }) => {
    const courseMap = makeIntroPsychCourseMap(2);
    const complexDescriptor =
      'Demonstrates comprehensive conceptualization through multidimensional interpretation, methodological differentiation, psychometric contextualization, diagnostically sophisticated synthesis, and theoretically nuanced evaluation of behavioral evidence while maintaining explicit consideration of competing explanatory frameworks, epistemological limitations, and longitudinal developmental implications.';

    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.courseMap = courseMap;
      snapshot.promptText = 'Intro to Psychology, 2 lessons, undergraduate';
      snapshot.activeTab = 'rubrics';
      snapshot.selectedFeatures = ['courseMap', 'rubrics'];
      snapshot.deliverableConfig = { rubrics: {} };
      snapshot.deliverables = {
        rubrics: {
          status: 'done',
          data: {
            rubrics: courseMap.lessons.map((lesson, index) => ({
              lessonTitle: lesson.title,
              title: `Lesson ${index + 1} Case Response Rubric`,
              gradedWork: 'Case response',
              totalPoints: 100,
              criteria: ['Concept accuracy', 'Evidence use', 'Application'].map((criterion) => ({
                criterion,
                objectiveAligned: lesson.sections?.[0]?.learningObjectives,
                weight: 33,
                points: 33,
                exemplary: complexDescriptor,
                proficient: complexDescriptor,
                developing: complexDescriptor,
                beginning: complexDescriptor,
              })),
            })),
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Intro to Psychology',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const rubricPath = Object.keys(zip.files).find((name) => /Rubrics\/.*\.docx$/.test(name));
    expect(rubricPath).toBeTruthy();
    await expect(page.getByTestId('readiness-confirm')).toBeHidden();
  });

  test('blocks ZIP export when one selected deliverable failed', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'lessonPlans', 'courseFaq'];
      snapshot.deliverables = {
        lessonPlans: snapshot.deliverables.lessonPlans,
        courseFaq: {
          status: 'error',
          data: null,
          error: 'All chunks failed',
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Finish package');
    await expect(page.getByTestId('readiness-panel')).toContainText('Course FAQ failed to generate');
    await expect(page.getByTestId('export-download-zip')).toBeEnabled();

    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('readiness-confirm')).toContainText('Needs attention before export');
    await expect(page.getByTestId('readiness-confirm')).toContainText('Course FAQ failed to generate');
    await expect(page.getByTestId('readiness-confirm')).toContainText('Automatic finishing ran');
    await expect(page.getByTestId('readiness-export-anyway')).toHaveCount(0);
  });

  test('downloads an explicitly labeled draft ZIP when generated quiz content needs review notes', async ({ page }) => {
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
    await expect(page.getByTestId('readiness-status')).toContainText('Finish package');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('fewer than 5 questions');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('missing answer guidance');
    await expect(page.getByTestId('readiness-panel')).toContainText('Lesson 2 quiz keys every multiple-choice answer');
    await expect(page.getByTestId('export-download-zip')).toContainText('Finish package');
    await page.getByTestId('export-download-zip').click();
    await expect(page.getByTestId('export-download-zip')).toContainText('Download ZIP');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const qualityReport = await zip.file('QUALITY_REPORT.md').async('string');
    const readinessReport = await zip.file('READINESS_REPORT.txt').async('string');
    expect(manifest.readiness).toMatchObject({ status: 'blocked', isBlocked: true });
    expect(readinessReport).toContain('Lesson 2 quiz keys every multiple-choice answer');
    expect(qualityReport).toContain('package readiness reports 1 blocker');
    await expect(page.getByTestId('readiness-confirm')).toBeHidden();
  });

  test('downloads ZIP when discussion guidance only has review notes', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.selectedFeatures = ['courseMap', 'discussions'];
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
                cx: 'Students compare exported materials for instructor handoff.',
                pr: 'Which export artifact would you trust first, and why?',
                fp: ['What evidence supports that choice?'],
                ft: { op: 'Ask students to name the artifact first.' },
                ec: ['Uses artifact evidence'],
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
                fp: ['Who is the reviewer?', 'What later revision is likely?', 'Which file would you open next?'],
                ft: {
                  op: 'Start with a quick format poll.',
                  is: 'Ask for the next file the reviewer would open.',
                  cl: 'Summarize tradeoffs by audience.',
                },
                ec: ['Names the audience', 'Justifies the format'],
                eq: 'Offer a written response option before group share-out.',
                gl: 'Compare concrete workflows, not personal preferences.',
              },
            ],
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('missing instructor guidance');
    await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
  });

  test('blocks non-ZIP export with review notes without promising a readiness report', async ({ page }) => {
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
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expectDownload(page, () => page.getByTestId('export-format-csv').click(), {
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
    await uncheckAllExportLessons(page);
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
    await uncheckAllExportLessons(page);
    await expect(page.getByText('0 of 2 lessons selected')).toBeVisible();
    await expect(page.getByTestId('readiness-status')).toContainText('Finish package');
    await expect(page.getByTestId('readiness-panel')).toContainText('Select at least one lesson before exporting.');
    await expect(page.getByTestId('export-download-zip')).toBeDisabled();
  });

  test('keeps current-tab export independent from the all-export lesson scope', async ({ page }) => {
    await restoreExportWorkspace(page);

    await page.getByTestId('export-scope-all').click();
    await uncheckAllExportLessons(page);
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

  test('auto-fixes syllabus publishability placeholders before ZIP export', async ({ page }) => {
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
            courseRequirements: [
              {
                name: 'Readiness revision memo',
                weight: '100%',
                description:
                  'Students use the readiness checklist, rubric criteria, and instructor feedback to revise unresolved syllabus details.',
              },
            ],
            coursePolicies:
              'Course policy language covers attendance, late work, academic integrity, accessibility accommodations, and responsible AI use.',
            instructor: '[Instructor name]',
          },
          error: null,
          stale: false,
        },
      };
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('[Instructor name]');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('[Verify time]');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report || '').not.toContain('[Instructor name]');
    expect(report || '').not.toContain('[Verify time]');
    const syllabusPath = Object.keys(zip.files).find((name) => /Syllabus\.docx$/.test(name));
    expect(syllabusPath).toBeTruthy();
    const syllabusDocx = await JSZip.loadAsync(await zip.file(syllabusPath).async('nodebuffer'));
    const documentXml = await syllabusDocx.file('word/document.xml').async('string');
    expect(documentXml).not.toContain('[Instructor name]');
    expect(documentXml).not.toContain('[Verify time]');
  });

  test('auto-fixes course-map objective stems before ZIP export', async ({ page }) => {
    await restoreExportWorkspace(page, (snapshot) => {
      snapshot.courseMap = {
        courseName: 'Data Analytics for Decision-Making',
        semester: 'Spring 2026',
        lessons: Array.from({ length: 15 }, (_, index) => ({
          title: `Lesson ${index + 1}: Analytics Decision Topic ${index + 1}`,
          sections: [
            {
              learningGoals: `Evaluate analytics decisions for stakeholder context ${index + 1}.`,
              topicSection: `Analytics workflow ${index + 1}`,
              learningObjectives: `Students will be able to:\n${index + 1}a. Analyze evidence quality for analytics decision ${index + 1}.\n${index + 1}b. Recommend a responsible action from the data.`,
              weeklyAssessments: `Lesson ${index + 1} applied analytics checkpoint.`,
              asyncActivities: `Review the data scenario and prepare a decision note for lesson ${index + 1}.`,
              syncActivities: `Compare recommendations and revise the decision rationale for lesson ${index + 1}.`,
              technologyNeeded: 'Spreadsheet software, accessible data files, and LMS submission.',
            },
          ],
        })),
      };
      snapshot.promptText = 'Data Analytics for Decision-Making, 15 lessons';
      snapshot.selectedFeatures = ['courseMap'];
      snapshot.deliverableConfig = {};
      snapshot.deliverables = {};
      snapshot.activeTab = 'courseMap';
    });

    await page.getByTestId('export-scope-all').click();
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('objective stem');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('Students will be able to');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Data Analytics for Decision-Making',
      minBytes: 1000,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report || '').not.toContain('objective stem');
    expect(report || '').not.toContain('Students will be able to');
  });

  test('auto-fixes generic syllabus placeholder copy before ZIP export', async ({ page }) => {
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
    await expect(page.getByTestId('readiness-status')).toContainText('Ready to download');
    await expect(page.getByTestId('readiness-panel')).not.toContainText('placeholder content');

    const zipDownload = await expectDownload(page, () => page.getByTestId('export-download-zip').click(), {
      extension: 'zip',
      nameIncludes: 'Export Smoke Course',
      minBytes: 1000,
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await fs.readFile(zipDownload.path));
    const report = await zip.file('READINESS_REPORT.txt')?.async('string');
    expect(report || '').not.toContain('placeholder content');
    const syllabusPath = Object.keys(zip.files).find((name) => /Syllabus\.docx$/.test(name));
    expect(syllabusPath).toBeTruthy();
    const syllabusDocx = await JSZip.loadAsync(await zip.file(syllabusPath).async('nodebuffer'));
    const documentXml = await syllabusDocx.file('word/document.xml').async('string');
    expect(documentXml).not.toContain('placeholder content');
  });
});
