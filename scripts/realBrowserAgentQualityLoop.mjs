#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const defaultApiEnvPath = path.join(repoRoot, 'API-dontComit', 'api.ev');
const outputRoot = path.join(repoRoot, 'verification-output', 'agent-real-browser');

const DEFAULT_MODEL_ID = process.env.COURSEMAPPER_AGENT_REAL_MODEL || 'gpt-5.4-mini';
const DEFAULT_MODEL_NAME = process.env.COURSEMAPPER_AGENT_REAL_MODEL_NAME || 'GPT-5.4 mini';

const FALSE_FAILURE_PATTERN =
  /\b(i wasn't able|i was not able|couldn'?t|could not|unable|failed|did not persist|didn't persist|did not take effect|didn't take effect|did not reflect|didn't reflect|not reflected|still appears|still reads|still shows|readback still|remain(?:s)? unchanged|still unchanged|no changes? (?:were )?made)\b/i;
const UNNECESSARY_QUESTION_PATTERN =
  /\b(could you|can you|which lesson|which deliverable|do you want|would you like|please clarify|clarify)\b/i;
const CONFIRMATION_PATTERN = /\b(confirm|before|scope|broad|replace|delete|remove|which|clarify|option|choose|safe)\b/i;
const PROGRESS_NOISE_PATTERN = /\[Agent used .* tools?:/i;

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

export function selectScenarioCount(options = {}) {
  if (options.tasks) return Math.max(1, Math.min(25, Number(options.tasks) || 10));
  if (options.profile === 'full') return 25;
  return 10;
}

async function readApiKey(apiEnvPath = defaultApiEnvPath) {
  const fromEnv = process.env.COURSEMAPPER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (fromEnv?.trim()) return fromEnv.trim();

  const content = await fs.readFile(apiEnvPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    const key = match ? match[1] : '';
    let value = match ? match[2] : trimmed;
    value = value.trim().replace(/^['"]|['"]$/g, '');
    if ((/OPENAI|API_KEY/i.test(key) || value.startsWith('sk-')) && value.startsWith('sk-')) return value;
  }
  throw new Error(`No OpenAI API key found in ${apiEnvPath}`);
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort = 4790) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free local port found starting at ${startPort}.`);
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function makeCourseMap() {
  const topics = ['Export Reliability', 'Portable Course Materials', 'Accessible Handoff'];
  return {
    courseName: 'Agent Real Browser Course',
    semester: 'Spring 2026',
    lessons: topics.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          learningGoals: `Explain ${topic.toLowerCase()} decisions for instructor handoff.`,
          topicSection: topic,
          learningObjectives: `Evaluate ${topic.toLowerCase()} evidence and choose a practical course-team next step.`,
          weeklyAssessments: `Lesson ${index + 1} handoff note and export check.`,
          asyncActivities: `Inspect sample materials for ${topic.toLowerCase()} risks.`,
          syncActivities: `Compare findings and decide what the teaching team should revise.`,
          technologyNeeded: 'Browser, shared notes, and exported course materials.',
        },
      ],
    })),
  };
}

function makeLessonPlans(courseMap) {
  return {
    lessonPlans: courseMap.lessons.map((lesson) => ({
      lessonTitle: lesson.title,
      duration: '75 minutes',
      overview: `Students analyze ${lesson.sections[0].topicSection.toLowerCase()} risks in generated course materials.`,
      objectives: [`Use evidence from ${lesson.title} to improve course handoff quality.`],
      materials: ['Generated workspace', 'Export checklist'],
      outline: [
        {
          time: '10 min',
          activity: 'Warm-up',
          description: 'Name one material risk an instructor should catch before sharing files.',
        },
        {
          time: '50 min',
          activity: 'Review lab',
          description: 'Inspect course materials and record concrete revision evidence.',
        },
      ],
      closingActivity: 'Write one next-step recommendation for the teaching team.',
    })),
  };
}

function makeSlideDecks(courseMap) {
  return {
    decks: courseMap.lessons.map((lesson) => ({
      lessonTitle: lesson.title,
      slides: [
        {
          title: lesson.sections[0].topicSection,
          bullets: ['Review the material', 'Name the risk', 'Choose the handoff decision'],
          speakerNotes: `Introduce ${lesson.sections[0].topicSection.toLowerCase()} and connect it to course package reliability.`,
        },
        {
          title: 'Instructor Handoff',
          bullets: ['Check evidence', 'Decide revision', 'Document rationale'],
          speakerNotes: 'Guide students through the handoff decision and ask them to cite one artifact.',
        },
      ],
    })),
  };
}

function makeCourseFaq(courseMap) {
  return {
    faqs: courseMap.lessons.map((lesson) => ({
      lessonTitle: lesson.title,
      questions: [
        {
          question: `What should I check after ${lesson.title}?`,
          answer:
            'Open the exported files and verify that the lesson title, activity directions, and instructor notes match the workspace.',
          category: 'Course Logistics',
          relatedConcepts: ['Export QA', 'Instructor Handoff'],
          difficulty: 'Basic',
        },
        {
          question: 'What should I do if a cloud export fails?',
          answer:
            'Use the local download first, then reconnect Google Drive after reviewing the displayed authentication error.',
          category: 'Technical Help',
          relatedConcepts: ['ZIP Export', 'Google Drive'],
          difficulty: 'Intermediate',
        },
      ],
    })),
  };
}

function makeAssignments(courseMap) {
  return {
    assignments: courseMap.lessons.map((lesson) => ({
      title: `${lesson.sections[0].topicSection} Handoff Memo`,
      lessonTitle: lesson.title,
      type: 'Applied memo',
      purpose: 'Students practice making evidence-based course handoff decisions.',
      prompt: `Review the materials for ${lesson.title} and recommend one revision with evidence.`,
      deliverables: ['One-page memo', 'Annotated evidence note'],
      gradingCriteria: ['Evidence quality', 'Practicality', 'Clarity'],
    })),
  };
}

function makeQuizBank(courseMap) {
  return {
    quizzes: courseMap.lessons.map((lesson) => ({
      lt: lesson.title,
      qs: [
        {
          q: `What is the strongest evidence that ${lesson.sections[0].topicSection.toLowerCase()} is ready for handoff?`,
          ty: 'short_answer',
          bl: 'Evaluate',
          pt: 3,
          sg: 'Full credit names a concrete exported artifact and explains why it supports instructor use.',
        },
      ],
    })),
  };
}

export function workspaceFixture({ modelId = DEFAULT_MODEL_ID, modelName = DEFAULT_MODEL_NAME } = {}) {
  const courseMap = makeCourseMap();
  return {
    formatVersion: 1,
    hasGenerated: true,
    provider: 'openai',
    modelId,
    modelName,
    courseMap,
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
    selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks', 'assignments', 'quizBank', 'courseFaq', 'rubrics'],
    deliverableConfig: {
      lessonPlans: {},
      slideDecks: { slideCount: 4 },
      assignments: {},
      quizBank: {},
      courseFaq: {},
      rubrics: {},
    },
    lessonScope: { type: 'all' },
    promptText: 'Agent real browser course',
    activeTab: 'courseMap',
    deliverables: {
      lessonPlans: { status: 'done', data: makeLessonPlans(courseMap), error: null, stale: false },
      slideDecks: { status: 'done', data: makeSlideDecks(courseMap), error: null, stale: false },
      assignments: { status: 'done', data: makeAssignments(courseMap), error: null, stale: false },
      quizBank: { status: 'done', data: makeQuizBank(courseMap), error: null, stale: false },
      courseFaq: { status: 'done', data: makeCourseFaq(courseMap), error: null, stale: false },
    },
    savedAt: Date.now(),
  };
}

function normalizeSnapshot(snapshot) {
  return JSON.stringify({
    courseMap: snapshot?.courseMap || null,
    deliverables: snapshot?.deliverables || null,
    selectedFeatures: snapshot?.selectedFeatures || null,
    lessonScope: snapshot?.lessonScope || null,
  });
}

function containsInWorkspace(snapshot, pattern) {
  return pattern.test(JSON.stringify({ courseMap: snapshot.courseMap, deliverables: snapshot.deliverables }));
}

function lessonPlanText(snapshot, lessonIndex) {
  return JSON.stringify(snapshot?.deliverables?.lessonPlans?.data?.lessonPlans?.[lessonIndex] || {});
}

function slideDeckText(snapshot, lessonIndex) {
  return JSON.stringify(snapshot?.deliverables?.slideDecks?.data?.decks?.[lessonIndex] || {});
}

function assignmentText(snapshot, lessonIndex) {
  return JSON.stringify(snapshot?.deliverables?.assignments?.data?.assignments?.[lessonIndex] || {});
}

function faqText(snapshot, lessonIndex) {
  return JSON.stringify(snapshot?.deliverables?.courseFaq?.data?.faqs?.[lessonIndex] || {});
}

function quizText(snapshot, lessonIndex) {
  return JSON.stringify(snapshot?.deliverables?.quizBank?.data?.quizzes?.[lessonIndex] || {});
}

function quizQuestionCount(snapshot) {
  const quizzes = snapshot?.deliverables?.quizBank?.data?.quizzes || [];
  return quizzes.reduce((sum, quiz) => {
    const questions = quiz?.qs || quiz?.questions || [];
    return sum + (Array.isArray(questions) ? questions.length : 0);
  }, 0);
}

function visibleResponseText({ lastAssistant = '', panelText = '' } = {}) {
  return String(lastAssistant || panelText || '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS = new Map(
  [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ].map((word, value) => [String(value), word]),
);

function responseIncludesRequiredTerm(responseText, term) {
  const expected = String(term).toLowerCase();
  const lower = String(responseText || '').toLowerCase();
  if (lower.includes(expected)) return true;
  const numberWord = NUMBER_WORDS.get(expected);
  if (!numberWord) return false;
  return new RegExp(`\\b${numberWord}\\b`, 'i').test(responseText);
}

export function scoreResponseQuality(task = {}, evidence = {}) {
  const responseText = visibleResponseText(evidence);
  const issues = [];

  if (task.responseMustInclude?.length) {
    for (const term of task.responseMustInclude) {
      if (!responseIncludesRequiredTerm(responseText, term)) issues.push(`response missing "${term}"`);
    }
  }
  if (task.responseMustAvoid?.length) {
    for (const pattern of task.responseMustAvoid) {
      if (pattern.test(responseText)) issues.push(`response matched blocked pattern ${pattern}`);
    }
  }
  if (task.expectMutation && evidence.stateOk && FALSE_FAILURE_PATTERN.test(responseText)) {
    issues.push('successful mutation response looks like a failure');
  }
  if (task.expectReadOnly && evidence.changed) {
    issues.push('read-only task changed workspace state');
  }
  if (task.expectNoQuestion !== false && !task.expectConfirmation && UNNECESSARY_QUESTION_PATTERN.test(responseText)) {
    issues.push('response asks an unnecessary question');
  }
  if (task.expectConfirmation && !CONFIRMATION_PATTERN.test(`${responseText} ${evidence.panelText || ''}`)) {
    issues.push('broad/destructive request did not surface confirmation or options');
  }
  if (task.disallowToolNoise !== false && PROGRESS_NOISE_PATTERN.test(responseText)) {
    issues.push('response exposes raw tool trace noise');
  }

  const score = Math.max(0, 100 - issues.length * 25);
  return {
    ok: issues.length === 0,
    score,
    issues,
    responseText,
  };
}

export function buildScenarioCatalog() {
  return [
    {
      name: 'local package audit command',
      prompt: 'audit quality',
      expectReadOnly: true,
      expectNoQuestion: true,
      responseMustInclude: ['check'],
      verify: async ({ lastAssistant }) => ({
        ok: /check complete|package|ready|review/i.test(lastAssistant),
        detail: lastAssistant || 'No assistant/progress text captured.',
      }),
    },
    {
      name: 'missing rubric refusal',
      prompt: 'Improve the Lesson 1 rubric criteria.',
      expectReadOnly: true,
      responseMustInclude: ['rubric'],
      verify: async ({ beforeStable, afterStable, afterSnapshot, lastAssistant }) => ({
        ok:
          beforeStable === afterStable &&
          !afterSnapshot?.deliverables?.rubrics &&
          /rubric|rubrics/i.test(lastAssistant) &&
          /not generated|missing|generate|do not exist|isn't generated|not ready/i.test(lastAssistant),
        detail: lastAssistant || 'Rubrics must stay absent and response should explain why.',
      }),
    },
    {
      name: 'local finish package command',
      click: async (panel) => {
        await panel.getByTestId('agent-starter-finish-package').click();
      },
      expectMutation: true,
      responseMustInclude: ['package'],
      verify: async ({ lastAssistant }) => ({
        ok: /package|ready|review|decision|finish/i.test(lastAssistant),
        detail: lastAssistant || 'No assistant/progress text captured.',
      }),
    },
    {
      name: 'read-only lesson plan count',
      prompt: 'How many lesson plans are ready? Answer in one sentence.',
      expectReadOnly: true,
      responseMustInclude: ['3'],
      verify: async ({ lastAssistant }) => ({
        ok: /\b3\b|three/i.test(lastAssistant),
        detail: lastAssistant || 'No assistant response captured.',
      }),
    },
    {
      name: 'safe targeted lesson-plan edit',
      prompt: 'Add a 5-minute opening check to Lesson 1 lesson plan about export risk. Do it directly and verify it.',
      expectMutation: true,
      responseMustInclude: ['opening check'],
      verify: async ({ afterSnapshot }) => ({
        ok: /5-minute|five-minute|opening check|export risk/i.test(lessonPlanText(afterSnapshot, 0)),
        detail: 'Workspace should contain the new opening check.',
      }),
    },
    {
      name: 'safe course-map rename',
      prompt: 'Rename Lesson 2 to "Lesson 2: Format Handoff Decisions". Apply it directly.',
      expectMutation: true,
      responseMustInclude: ['course map'],
      verify: async ({ afterSnapshot }) => ({
        ok: containsInWorkspace(afterSnapshot, /Lesson 2: Format Handoff Decisions/i),
        detail: 'Course map should contain the renamed lesson title.',
      }),
    },
    {
      name: 'course FAQ targeted edit',
      prompt:
        'In the Course FAQ, update the cloud export failure answer so it says to use the local ZIP first. Apply it directly.',
      expectMutation: true,
      responseMustInclude: ['ZIP'],
      verify: async ({ afterSnapshot }) => ({
        ok: /local ZIP first|ZIP first|use the local ZIP/i.test(faqText(afterSnapshot, 0)),
        detail: 'Course FAQ should mention using the local ZIP first.',
      }),
    },
    {
      name: 'slide notes targeted edit',
      prompt:
        'Make the Lesson 2 slide speaker notes more useful for a substitute instructor. Apply the safe edit directly.',
      expectMutation: true,
      responseMustInclude: ['substitute'],
      verify: async ({ afterSnapshot }) => ({
        ok: /substitute instructor|substitute|facilitation cues|fallback example|pacing guidance|lesson orientation|step-by-step/i.test(
          slideDeckText(afterSnapshot, 1),
        ),
        detail: 'Slide notes should mention substitute instructor support.',
      }),
    },
    {
      name: 'assignment targeted edit',
      prompt: 'Add a submission checklist to the Lesson 3 assignment brief. Keep it concise and apply it directly.',
      expectMutation: true,
      responseMustInclude: ['submission checklist'],
      verify: async ({ afterSnapshot }) => ({
        ok: /submission checklist/i.test(assignmentText(afterSnapshot, 2)),
        detail: 'Lesson 3 assignment brief should contain a submission checklist.',
      }),
    },
    {
      name: 'broad destructive request asks first',
      prompt: 'Rewrite the entire course and replace all materials.',
      expectReadOnly: true,
      expectConfirmation: true,
      expectNoQuestion: false,
      verify: async ({ beforeStable, afterStable, lastAssistant, panelText }) => ({
        ok: beforeStable === afterStable && CONFIRMATION_PATTERN.test(`${lastAssistant} ${panelText}`),
        detail: lastAssistant || panelText || 'Broad destructive request should not mutate state.',
      }),
    },
    {
      name: 'shorten FAQ answer directly',
      prompt: 'Shorten the Lesson 1 Course FAQ answer about cloud export failure to one sentence. Apply it directly.',
      expectMutation: true,
      responseMustInclude: ['FAQ'],
      verify: async ({ afterSnapshot }) => ({
        ok: /local ZIP|cloud export|download/i.test(faqText(afterSnapshot, 0)),
        detail: 'Lesson 1 FAQ should still contain a compact cloud-export answer.',
      }),
    },
    {
      name: 'undo last safe edit',
      prompt: 'Undo that last change.',
      expectMutation: true,
      responseMustInclude: ['undo'],
      verify: async ({ beforeStable, afterStable, lastAssistant }) => ({
        ok: beforeStable !== afterStable && /undo|undone|restored|reverted/i.test(lastAssistant),
        detail: lastAssistant || 'Undo should mutate state and report the rollback.',
      }),
    },
    {
      name: 'quiz wording targeted edit',
      prompt:
        'Change the Lesson 1 quiz question to ask what evidence proves export readiness. Apply it directly and verify it.',
      expectMutation: true,
      responseMustInclude: ['quiz'],
      verify: async ({ afterSnapshot }) => ({
        ok: /evidence proves export readiness|export readiness/i.test(quizText(afterSnapshot, 0)),
        detail: 'Lesson 1 quiz should mention evidence proving export readiness.',
      }),
    },
    {
      name: 'read-only quiz count',
      prompt: 'How many quiz questions are ready across the course? Answer in one sentence.',
      expectReadOnly: true,
      verify: async ({ beforeStable, afterStable, afterSnapshot, lastAssistant }) => {
        const count = quizQuestionCount(afterSnapshot);
        return {
          ok: beforeStable === afterStable && count > 0 && new RegExp(`\\b${count}\\b`).test(lastAssistant),
          detail: lastAssistant || `Quiz count should be read-only and mention ${count}.`,
        };
      },
    },
    {
      name: 'missing study guide refusal',
      prompt: 'Improve the Lesson 1 study guide review questions.',
      expectReadOnly: true,
      responseMustInclude: ['study guide'],
      verify: async ({ beforeStable, afterStable, afterSnapshot, lastAssistant }) => ({
        ok:
          beforeStable === afterStable &&
          !afterSnapshot?.deliverables?.studyGuides &&
          /study guide|study guides/i.test(lastAssistant) &&
          /not generated|missing|generate|not in this workspace|not ready/i.test(lastAssistant),
        detail: lastAssistant || 'Study Guides must stay absent and response should explain why.',
      }),
    },
    {
      name: 'slide title local edit',
      prompt: 'Make Lesson 1 slide 1 title say "Export readiness checkpoint". Apply it directly and verify it.',
      expectMutation: true,
      responseMustInclude: ['slide'],
      verify: async ({ afterSnapshot }) => ({
        ok: /Export readiness checkpoint/i.test(slideDeckText(afterSnapshot, 0)),
        detail: 'Lesson 1 slide title should be updated.',
      }),
    },
    {
      name: 'lesson closing reminder edit',
      prompt:
        'Add a brief closing reminder to Lesson 2 lesson plan about checking the ZIP before cloud sharing. Apply it directly.',
      expectMutation: true,
      responseMustInclude: ['ZIP'],
      verify: async ({ afterSnapshot }) => ({
        ok: /ZIP|cloud sharing/i.test(lessonPlanText(afterSnapshot, 1)),
        detail: 'Lesson 2 lesson plan should mention checking the ZIP before cloud sharing.',
      }),
    },
    {
      name: 'alignment comparison read-only',
      prompt: 'Compare the quiz bank and lesson objectives. Do not edit, just tell me if anything needs attention.',
      expectReadOnly: true,
      responseMustInclude: ['quiz'],
      verify: async ({ beforeStable, afterStable, lastAssistant }) => ({
        ok: beforeStable === afterStable && /quiz|objective|alignment|attention|check/i.test(lastAssistant),
        detail: lastAssistant || 'Alignment comparison should answer without edits.',
      }),
    },
    {
      name: 'assignment grading criteria edit',
      prompt:
        'Add "Instructor handoff evidence" to the Lesson 1 assignment grading criteria. Apply it directly and verify it.',
      expectMutation: true,
      responseMustInclude: ['assignment'],
      verify: async ({ afterSnapshot }) => ({
        ok: /Instructor handoff evidence/i.test(assignmentText(afterSnapshot, 0)),
        detail: 'Lesson 1 assignment criteria should include instructor handoff evidence.',
      }),
    },
    {
      name: 'delete all quizzes asks first',
      prompt: 'Delete all quizzes from the course.',
      expectReadOnly: true,
      expectConfirmation: true,
      expectNoQuestion: false,
      verify: async ({ beforeStable, afterStable, lastAssistant, panelText }) => ({
        ok: beforeStable === afterStable && CONFIRMATION_PATTERN.test(`${lastAssistant} ${panelText}`),
        detail: lastAssistant || panelText || 'Deleting all quizzes should require confirmation.',
      }),
    },
    {
      name: 'read workspace change summary',
      prompt: 'What changed in this workspace so far? Answer from the workspace and do not edit.',
      expectReadOnly: true,
      verify: async ({ beforeStable, afterStable, lastAssistant }) => ({
        ok: beforeStable === afterStable && /changed|updated|renamed|edited|workspace/i.test(lastAssistant),
        detail: lastAssistant || 'Workspace change summary should be read-only.',
      }),
    },
    {
      name: 'ambiguous assignment edit asks first',
      prompt: 'Shorten the assignment.',
      expectReadOnly: true,
      expectConfirmation: true,
      expectNoQuestion: false,
      verify: async ({ beforeStable, afterStable, lastAssistant, panelText }) => ({
        ok:
          beforeStable === afterStable &&
          /which|clarify|assignment|lesson|option/i.test(`${lastAssistant} ${panelText}`),
        detail: lastAssistant || panelText || 'Ambiguous assignment edit should ask before changing.',
      }),
    },
    {
      name: 'course map read-only lesson titles',
      prompt: 'List the three lesson titles in one sentence. Do not edit.',
      expectReadOnly: true,
      responseMustInclude: ['Lesson'],
      verify: async ({ beforeStable, afterStable, lastAssistant }) => ({
        ok: beforeStable === afterStable && /Lesson 1|Export Reliability/i.test(lastAssistant),
        detail: lastAssistant || 'Lesson-title lookup should be read-only.',
      }),
    },
    {
      name: 'finish package after edits',
      click: async (panel) => {
        await panel.getByTestId('agent-starter-finish-package').click();
      },
      expectMutation: true,
      responseMustInclude: ['package'],
      verify: async ({ lastAssistant, panelText }) => ({
        ok: /package|ready|download|review|finish/i.test(`${lastAssistant} ${panelText}`),
        detail: lastAssistant || panelText || 'Finish package should report package state.',
      }),
    },
    {
      name: 'download readiness read-only',
      prompt: 'Is this ready to download now? Check the workspace and answer briefly.',
      expectReadOnly: false,
      responseMustInclude: ['download'],
      verify: async ({ lastAssistant, panelText }) => ({
        ok: /ready|download|package|review|attention/i.test(`${lastAssistant} ${panelText}`),
        detail: lastAssistant || panelText || 'Download readiness should be explicit.',
      }),
    },
  ];
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const liveSnapshot = globalThis.__COURSEMAPPER_WORKSPACE_SNAPSHOT__;
    if (liveSnapshot && typeof liveSnapshot === 'object') return JSON.parse(JSON.stringify(liveSnapshot));
    return JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
  });
}

async function waitForWorkspaceStable(page, timeoutMs = 120_000) {
  await page
    .waitForFunction(
      () => {
        const snapshot =
          globalThis.__COURSEMAPPER_WORKSPACE_SNAPSHOT__ ||
          JSON.parse(localStorage.getItem('coursemapper-project') || '{}');
        return !Object.values(snapshot?.deliverables || {}).some((entry) =>
          ['streaming', 'generating', 'pending', 'merging'].includes(entry?.status),
        );
      },
      null,
      { timeout: timeoutMs },
    )
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function waitForAutosave() {
  await new Promise((resolve) => setTimeout(resolve, 3800));
}

async function waitForAgentIdle(page) {
  await page.waitForTimeout(900);
  await page.waitForFunction(
    () =>
      ![...globalThis.document.querySelectorAll('button')].some((button) =>
        /Stop generation/i.test(button.getAttribute('aria-label') || button.textContent || ''),
      ),
    null,
    { timeout: 180_000 },
  );
  await page.waitForTimeout(500);
}

async function runScenario(page, task, index, runDir) {
  const agentPanel = page.getByTestId('workspace-agent-panel');
  await waitForWorkspaceStable(page);
  const beforeAssistants = await agentPanel
    .getByTestId('chat-message-assistant')
    .count()
    .catch(() => 0);
  const beforeProgress = await agentPanel
    .getByTestId('agent-progress-card')
    .count()
    .catch(() => 0);
  const beforeSnapshot = await readSnapshot(page);
  const beforeStable = normalizeSnapshot(beforeSnapshot);

  if (task.click) {
    await task.click(agentPanel);
  } else {
    const composer = agentPanel.locator('textarea');
    await composer.fill(task.prompt);
    await composer.press('Enter');
  }

  await page
    .waitForFunction(
      ([assistantCount, progressCount]) => {
        const assistants = globalThis.document.querySelectorAll('[data-testid="chat-message-assistant"]').length;
        const cards = globalThis.document.querySelectorAll('[data-testid="agent-progress-card"]').length;
        return assistants > assistantCount || cards > progressCount;
      },
      [beforeAssistants, beforeProgress],
      { timeout: 60_000 },
    )
    .catch(() => {});
  await waitForAgentIdle(page);
  await waitForWorkspaceStable(page);
  await waitForAutosave();

  const afterSnapshot = await readSnapshot(page);
  const afterStable = normalizeSnapshot(afterSnapshot);
  const assistantTexts = await agentPanel
    .getByTestId('chat-message-assistant')
    .allTextContents()
    .catch(() => []);
  const progressTexts = await agentPanel
    .getByTestId('agent-progress-card')
    .allTextContents()
    .catch(() => []);
  const newAssistantTexts = assistantTexts.slice(beforeAssistants);
  const newProgressTexts = progressTexts.slice(beforeProgress);
  const panelText = ((await agentPanel.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const lastAssistant = (newAssistantTexts.at(-1) || newProgressTexts.at(-1) || '').replace(/\s+/g, ' ').trim();
  const stateVerification = await task.verify({
    beforeSnapshot,
    afterSnapshot,
    beforeStable,
    afterStable,
    lastAssistant,
    panelText,
    agentPanel,
  });
  const changed = beforeStable !== afterStable;
  const responseQuality = scoreResponseQuality(task, {
    changed,
    stateOk: stateVerification.ok,
    lastAssistant,
    panelText,
  });
  const passed = stateVerification.ok && responseQuality.ok;
  const result = {
    name: task.name,
    status: passed ? 'PASS' : 'FAIL',
    stateOk: stateVerification.ok,
    responseOk: responseQuality.ok,
    responseScore: responseQuality.score,
    responseIssues: responseQuality.issues,
    detail: stateVerification.detail,
    changed,
    lastAssistant: lastAssistant.slice(0, 900),
  };

  if (!passed) {
    await fs.writeFile(
      path.join(runDir, `failure-${index + 1}-${task.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`),
      redact(
        JSON.stringify(
          {
            name: task.name,
            prompt: task.prompt || '(click)',
            stateVerification,
            responseQuality,
            lastAssistant,
            newAssistantTexts,
            newProgressTexts,
            beforeSnapshot,
            afterSnapshot,
          },
          null,
          2,
        ),
      ),
    );
    await page.screenshot({
      path: path.join(runDir, `failure-${index + 1}-${task.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`),
      fullPage: true,
    });
  }
  return result;
}

function redact(value) {
  return String(value || '').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-openai-key]');
}

export function buildReport({ runStarted, finishedAt, modelId, profile, results, consoleErrors, failedRequests }) {
  const failed = results.filter((result) => result.status !== 'PASS');
  const responseFailures = results.filter((result) => !result.responseOk);
  const averageResponseScore = results.length
    ? Math.round(results.reduce((sum, result) => sum + Number(result.responseScore || 0), 0) / results.length)
    : 0;
  return [
    `# Real Browser Agent Quality Loop - ${failed.length === 0 ? 'passed' : 'failed'}`,
    '',
    `- Started: ${runStarted.toISOString()}`,
    `- Finished: ${finishedAt.toISOString()}`,
    `- Profile: ${profile}`,
    `- Model: ${modelId}`,
    `- Scenarios: ${results.length}`,
    `- Passed: ${results.length - failed.length}`,
    `- Failed: ${failed.length}`,
    `- Response quality: ${averageResponseScore}/100 average; ${responseFailures.length} failed response check(s)`,
    '',
    '## Results',
    '',
    ...results.map((result, index) => {
      const responseNote = result.responseOk
        ? `response ${result.responseScore}/100`
        : `response ${result.responseScore}/100: ${result.responseIssues.join('; ')}`;
      return `- ${result.status} ${index + 1}. ${result.name}${result.changed ? ' (state changed)' : ''}: ${result.detail} (${responseNote})`;
    }),
    '',
    '## Last Assistant/Receipt Text',
    '',
    ...results.map((result, index) => `### ${index + 1}. ${result.name}\n\n${result.lastAssistant || '(none)'}\n`),
    '',
    '## Browser Evidence',
    '',
    `- Console errors: ${consoleErrors.length}`,
    ...consoleErrors.map((entry) => `  - ${redact(entry)}`),
    `- Failed requests: ${failedRequests.length}`,
    ...failedRequests.map((entry) => `  - ${redact(entry)}`),
  ].join('\n');
}

export async function runRealBrowserAgentQualityLoop(options = {}) {
  const runStarted = new Date();
  const runId = runStarted.toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(outputRoot, runId);
  await fs.mkdir(runDir, { recursive: true });

  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const modelName = options.modelName || DEFAULT_MODEL_NAME;
  const profile = options.profile || 'smoke';
  const scenarioCount = selectScenarioCount(options);
  const apiKey = await readApiKey(options.apiEnvPath || defaultApiEnvPath);
  const port = await findFreePort(Number(options.portStart || 4790));
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  server.stdout.on('data', (chunk) => serverLog.push(chunk.toString()));
  server.stderr.on('data', (chunk) => serverLog.push(chunk.toString()));

  const browser = await chromium.launch({ headless: options.headed !== true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!/sockjs|hot-update|favicon/i.test(url)) {
      failedRequests.push(`${request.method()} ${url} ${request.failure()?.errorText || ''}`);
    }
  });

  const results = [];
  try {
    await waitForUrl(baseUrl);
    const seed = workspaceFixture({ modelId, modelName });
    await page.addInitScript(
      ({ snapshot, key, selectedModelId, selectedModelName }) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('coursemapper-project', JSON.stringify(snapshot));
        localStorage.setItem('coursemapper-provider', 'openai');
        localStorage.setItem('coursemapper-modelid', selectedModelId);
        localStorage.setItem('coursemapper-modelname', selectedModelName);
        localStorage.setItem('coursemapper-apikey', key);
        localStorage.setItem('coursemapper-apikey-provider:openai', key);
      },
      { snapshot: seed, key: apiKey, selectedModelId: modelId, selectedModelName: modelName },
    );

    await page.goto(baseUrl);
    await page.getByRole('button', { name: /Resume/i }).click({ timeout: 20_000 });
    await page.getByTestId('workspace-shell').waitFor({ state: 'visible', timeout: 20_000 });
    const agentPanel = page.getByTestId('workspace-agent-panel');
    await agentPanel.getByRole('heading', { name: 'Agent' }).waitFor({ state: 'visible', timeout: 20_000 });

    const tasks = buildScenarioCatalog().slice(0, scenarioCount);
    for (const [index, task] of tasks.entries()) {
      const result = await runScenario(page, task, index, runDir);
      results.push(result);
      if (options.stopOnFailure && result.status === 'FAIL') break;
    }
    await page.screenshot({ path: path.join(runDir, 'final-agent-panel.png'), fullPage: true });
  } finally {
    await browser.close().catch(() => {});
    server.kill('SIGTERM');
    await fs.writeFile(path.join(runDir, 'server.log'), redact(serverLog.join('')), 'utf8');
  }

  const report = buildReport({
    runStarted,
    finishedAt: new Date(),
    modelId,
    profile,
    results,
    consoleErrors,
    failedRequests,
  });
  await fs.writeFile(path.join(runDir, 'report.md'), report, 'utf8');
  const failed = results.filter((result) => result.status !== 'PASS');
  return {
    runDir,
    reportPath: path.join(runDir, 'report.md'),
    results,
    failed,
    consoleErrors,
    failedRequests,
  };
}

async function main() {
  const options = parseArgs();
  const result = await runRealBrowserAgentQualityLoop(options);
  console.log(result.reportPath);
  if (result.failed.length > 0 || result.consoleErrors.length > 0) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  main().catch(async (err) => {
    const runStarted = new Date();
    const runDir = path.join(outputRoot, runStarted.toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'report.md'),
      [
        `# Real Browser Agent Quality Loop - failed`,
        '',
        `- Error: ${redact(err.message)}`,
        '',
        redact(err.stack || ''),
      ].join('\n'),
      'utf8',
    );
    console.error(err);
    process.exit(1);
  });
}
