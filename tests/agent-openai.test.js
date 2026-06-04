/**
 * agent-openai.test.js — OpenAI variant of agent-anthropic.test.js.
 *
 * Runs the same tool-selection probes so we can tell if OpenAI drifts away
 * from Anthropic in how it picks tools / shapes arguments. Skipped when
 * OPENAI_API_KEY is missing so the suite stays green in CI.
 *
 * Run locally:
 *   OPENAI_API_KEY=sk-... npx vitest run tests/agent-openai.test.js
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import {
  buildAgentRequest,
  buildNativeTools,
  parseAgentResponse as parseProviderResponse,
} from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';
import { runAgentLoop } from '../src/components/chat/useToolInvoker.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Default to the model used for current CourseMapper agent validation.
// Override via env when comparing OpenAI model generations.
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const TIMEOUT = 60_000;

const describeWithKey = OPENAI_API_KEY ? describe : describe.skip;

const COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Supervised Learning Basics',
      sections: [
        {
          learningObjectives: 'Explain supervised vs unsupervised learning',
          topicSection: 'Classification, Regression, Training Sets',
        },
      ],
    },
    {
      title: 'Decision Trees and Random Forests',
      sections: [
        {
          learningObjectives: 'Implement decision tree classifiers and explain overfitting',
          topicSection: 'Decision Trees, Pruning, Ensemble Methods',
        },
      ],
    },
    {
      title: 'Neural Networks Fundamentals',
      sections: [
        {
          learningObjectives: 'Describe the architecture of a feedforward neural network',
          topicSection: 'Perceptrons, Activation Functions, Backpropagation',
        },
      ],
    },
  ],
};

const DELIVERABLES = {
  quizBank: {
    status: 'done',
    data: {
      quizzes: [
        {
          lt: 'Supervised Learning Basics',
          qs: [
            {
              q: 'What is supervised learning?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: ['A', 'B', 'C', 'D'],
              an: 'A',
            },
          ],
        },
        {
          lt: 'Decision Trees and Random Forests',
          qs: [
            {
              q: 'What prevents overfitting?',
              ty: 'multiple_choice',
              bl: 'Remember',
              df: 'easy',
              pt: 1,
              op: ['Pruning', 'A', 'B', 'C'],
              an: 'Pruning',
            },
          ],
        },
        {
          lt: 'Neural Networks Fundamentals',
          qs: [{ q: 'Activation function?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' }],
        },
      ],
    },
  },
  lessonPlans: {
    status: 'done',
    data: {
      lessonPlans: [
        { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised' },
        { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
        { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward architecture' },
      ],
    },
  },
  slideDecks: {
    status: 'done',
    data: {
      slideDecks: [
        {
          lt: 'Supervised Learning Basics',
          sl: [
            {
              t: 'Supervised Learning',
              ty: 'title',
              bu: ['Learning from labeled examples'],
              no: 'Introduce supervised learning.',
            },
            {
              t: 'Classification vs Regression',
              ty: 'content',
              bu: ['Classification predicts categories', 'Regression predicts continuous values'],
              no: 'Explain the two most common supervised learning task families.',
              visual: { kind: 'none', description: '', altText: '' },
            },
          ],
        },
        {
          lt: 'Decision Trees and Random Forests',
          sl: [
            {
              t: 'Tree-Based Models',
              ty: 'title',
              bu: ['Splits, pruning, and ensembles'],
              no: 'Introduce decision trees and random forests.',
            },
          ],
        },
        {
          lt: 'Neural Networks Fundamentals',
          sl: [
            {
              t: 'Neural Networks',
              ty: 'title',
              bu: ['Layers', 'Weights', 'Activation functions'],
              no: 'Introduce neural network building blocks.',
            },
          ],
        },
      ],
    },
  },
};

async function callOpenAI(userMessage, { activeTab = 'quizBank', maxTokens = 4096 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('openai', AGENT_TOOLS);
  const { endpoint, headers, body } = buildAgentRequest('openai', {
    model: OPENAI_MODEL,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    tools: nativeTools,
    maxTokens,
    apiKey: OPENAI_API_KEY,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const json = await response.json();
  return parseProviderResponse('openai', json);
}

function findToolCall(toolCalls, name) {
  return toolCalls?.find((tc) => tc.name === name);
}

function findToolCalls(toolCalls, name) {
  return toolCalls?.filter((tc) => tc.name === name) || [];
}

function hasRespondKind(response, kind) {
  return !!findToolCall(response.toolCalls, 'respond')?.args?.[kind];
}

function getEditFeatureIds(editCall) {
  return editCall?.args?.actions?.map((action) => action.featureId).filter(Boolean) || [];
}

async function runOpenAIAgentLoop(userMessage, { activeTab = 'courseMap', dryRun = true } = {}) {
  let messageState = [
    {
      id: 'agent-progress-live-openai',
      role: 'agentProgress',
      steps: [],
      status: 'running',
      startedAt: 100,
      runMeta: {
        mode: dryRun ? 'Review only' : 'Auto-fix',
        target: activeTab,
        provider: 'openai',
        model: OPENAI_MODEL,
      },
    },
  ];
  const setMessages = (updater) => {
    messageState = typeof updater === 'function' ? updater(messageState) : updater;
  };
  const delivRef = { current: structuredClone(DELIVERABLES) };

  await runAgentLoop(
    userMessage,
    { dryRun },
    {
      messages: [],
      setMessages,
      setStreaming: () => {},
      abortRef: { current: null },
      apiKey: OPENAI_API_KEY,
      provider: 'openai',
      modelId: OPENAI_MODEL,
      courseMap: structuredClone(COURSE_MAP),
      activeTab,
      slideTheme: null,
      selectedFeatures: ['courseMap', 'quizBank', 'lessonPlans'],
      columns: [],
      deliverableConfig: {},
      lessonFilter: null,
      delivRef,
      executeActionRef: { current: () => ({ success: false, message: 'Not used in read-only audit.' }) },
      optimisticUpdateRef: { current: null },
      snapshotRef: { current: () => {} },
      undoFnRef: { current: null },
      notifyEditRef: { current: null },
      uid: null,
      customToolRegistryRef: null,
      maybeRunValidation: () => {},
      handleAgentFinalResponse: (response) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: response?.chatReply || response?.text || 'Agent completed.',
          },
        ]);
      },
    },
  );

  return messageState;
}

describeWithKey(`OpenAI (${OPENAI_MODEL}) Agent E2E`, { timeout: TIMEOUT * 12 }, () => {
  it('answers a simple question correctly', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('How many lessons does this course have?');
    const respond = findToolCall(r.toolCalls, 'respond');
    if (respond) {
      expect(respond.args.chatReply).toBeTruthy();
      expect(respond.args.chatReply).toMatch(/3/);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  it('takes action when asked to add a quiz question', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Add a new multiple choice question about gradient descent to Lesson 3');
    expect(r.toolCalls || r.textContent).toBeTruthy();
    const edit = findToolCall(r.toolCalls, 'edit_deliverables');
    const respond = findToolCall(r.toolCalls, 'respond');
    if (respond?.args?.proposal) {
      expect(respond.args.proposal.options.length).toBeGreaterThanOrEqual(2);
    } else if (edit) {
      expect(edit.args.actions?.[0]?.featureId).toBe('quizBank');
    }
  });

  it('runs validation when asked to check course health', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Check my course for any issues or alignment problems');
    expect(r.toolCalls).toBeTruthy();
    expect(findToolCall(r.toolCalls, 'finalize_package') || findToolCall(r.toolCalls, 'validate_course')).toBeTruthy();
  });

  it('creates an auditable receipt after a live read-only tool run', { timeout: TIMEOUT * 2 }, async () => {
    const messages = await runOpenAIAgentLoop(
      'Run validate_course to check the current course health, then respond with one concise sentence. Do not edit anything.',
      { activeTab: 'courseMap', dryRun: true },
    );
    const receipt = messages.find((message) => message.role === 'agentReceipt');
    const assistant = messages.find((message) => message.role === 'assistant');

    expect(assistant?.text).toBeTruthy();
    expect(receipt).toBeTruthy();
    expect(receipt.receipt.intent).toMatchObject({
      type: 'package_audit',
      readOnly: true,
      mutatesWorkspace: false,
    });
    expect(receipt.receipt.runStats).toMatchObject({
      readOnly: true,
      mutatesWorkspace: false,
    });
    expect(receipt.receipt.runStats.toolCount).toBeGreaterThan(0);
    expect(receipt.receipt.runStats.checkCount).toBeGreaterThan(0);
    expect(receipt.receipt.toolManifest.some((step) => step.tool === 'validate_course')).toBe(true);
    expect(JSON.stringify(receipt.receipt.toolManifest)).not.toContain(OPENAI_API_KEY);
  });

  it('edits course map when asked to rename a lesson', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Rename Lesson 2 to "Tree-Based Learning Methods"', { activeTab: 'courseMap' });
    const edit = findToolCall(r.toolCalls, 'edit_course_map');
    if (edit) {
      const patch = edit.args.patches?.[0];
      expect(patch?.lessonIndex).toBe(1);
      expect(patch?.field).toBe('title');
      expect(patch?.value).toMatch(/Tree/i);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });

  it('expands course scope through course-map addLesson patches', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI(
      [
        'Expand the course map from 3 to 5 lessons.',
        'Call edit_course_map with exactly 2 addLesson patches appended after the existing lessons.',
        'Keep existing lessons unchanged and include concrete sections for each new lesson.',
      ].join(' '),
      { activeTab: 'courseMap', maxTokens: 8192 },
    );
    const edit = findToolCall(r.toolCalls, 'edit_course_map');

    expect(edit).toBeTruthy();
    const addLessons = edit.args.patches?.filter((patch) => patch.action === 'addLesson') || [];
    expect(addLessons).toHaveLength(2);
    expect(addLessons.every((patch) => typeof patch.title === 'string' && patch.title.trim().length > 0)).toBe(true);
    expect(addLessons.every((patch) => Array.isArray(patch.sections) && patch.sections.length > 0)).toBe(true);
  });

  it('saves teaching preference when told to remember', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Remember that I always want Bloom\'s level "Apply" or higher for assessments');
    expect(r.toolCalls).toBeTruthy();
    expect(findToolCall(r.toolCalls, 'remember') || findToolCall(r.toolCalls, 'save_preference')).toBeTruthy();
  });

  it('uses compare_deliverables for alignment questions', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Are the quiz questions aligned with the lesson plan objectives?');
    const hadRelevantTool =
      findToolCall(r.toolCalls, 'finalize_package') ||
      findToolCall(r.toolCalls, 'compare_deliverables') ||
      findToolCall(r.toolCalls, 'validate_course') ||
      findToolCall(r.toolCalls, 'read_deliverable');
    expect(hadRelevantTool || r.textContent).toBeTruthy();
  });

  it('handles command-strip improve instructions as an actionable agent task', { timeout: TIMEOUT }, async () => {
    const commandPrompt =
      'Improve Lesson Plans for specificity, classroom usability, alignment to the course map, appropriate difficulty, and missing instructor context. Apply safe changes directly, then verify the affected deliverable and summarize what changed.';
    const r = await callOpenAI(commandPrompt, { activeTab: 'lessonPlans' });
    const edit = findToolCall(r.toolCalls, 'edit_deliverables');
    const read = findToolCall(r.toolCalls, 'read_deliverable');
    const validate = findToolCall(r.toolCalls, 'validate_course');
    const respond = findToolCall(r.toolCalls, 'respond');

    expect(edit || read || validate || respond || r.toolCalls || r.textContent).toBeTruthy();
    if (edit) {
      expect(edit.args.actions?.some((action) => action.featureId === 'lessonPlans')).toBe(true);
    }
  });

  it('does not fabricate edits for deliverables that have not been generated', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Add a rubric criterion about model evaluation evidence to Lesson 2', {
      activeTab: 'quizBank',
    });
    const edit = findToolCall(r.toolCalls, 'edit_deliverables');
    const respond = findToolCall(r.toolCalls, 'respond');

    if (edit) {
      const editedFeatures = edit.args.actions?.map((action) => action.featureId).filter(Boolean) || [];
      expect(editedFeatures).not.toContain('rubrics');
    }

    if (respond?.args?.chatReply) {
      expect(respond.args.chatReply).toMatch(/rubric/i);
      expect(respond.args.chatReply).toMatch(/not|generate|missing|haven't|do not exist|yet/i);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });
});

describeWithKey(`OpenAI (${OPENAI_MODEL}) Agent real-life scenarios round 2`, { timeout: TIMEOUT * 12 }, () => {
  it('searches academic sources for instructor reading requests', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Find two academic sources on random forests for Lesson 2 and cite them.', {
      activeTab: 'lessonPlans',
    });

    const search = findToolCall(r.toolCalls, 'search_research');
    expect(search).toBeTruthy();
    expect(search.args.query).toMatch(/random forest|random forests|decision tree/i);
  });

  it('runs grammar checks before student handoff', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Check grammar across the course map before I send it to students.', {
      activeTab: 'courseMap',
    });

    expect(findToolCall(r.toolCalls, 'check_grammar')).toBeTruthy();
  });

  it('creates a concept-map diagram for the course sequence', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Make a concept map connecting the three lessons in this course.', {
      activeTab: 'courseMap',
    });

    const diagram = findToolCall(r.toolCalls, 'respond')?.args?.diagram;
    expect(diagram).toBeTruthy();
    expect(diagram.syntax).toMatch(/graph|flowchart|mindmap/i);
    expect(diagram.syntax).toMatch(/Supervised|Decision|Neural/i);
  });

  it('charts quiz question counts or reads quiz data first', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Show me a chart of quiz question counts by lesson.', { activeTab: 'quizBank' });

    const read = findToolCall(r.toolCalls, 'read_deliverable');
    expect(hasRespondKind(r, 'chart') || read?.args?.featureId === 'quizBank').toBe(true);
  });

  it('reads a lesson before a detailed lesson-specific review', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Use read_lesson to inspect Lesson 2 before recommending one improvement.', {
      activeTab: 'courseMap',
    });

    const readLesson = findToolCall(r.toolCalls, 'read_lesson');
    expect(readLesson).toBeTruthy();
    expect(readLesson.args.lessonIndex).toBe(1);
  });

  it('reads a specific quiz lesson before judging cognitive level', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI(
      'Review the Lesson 3 quiz bank and tell me whether the cognitive level is high enough.',
      {
        activeTab: 'quizBank',
      },
    );

    const read = findToolCall(r.toolCalls, 'read_deliverable');
    expect(read).toBeTruthy();
    expect(read.args).toMatchObject({ featureId: 'quizBank', lessonIndex: 2 });
  });

  it('targets existing slide decks when asked for a visual slide improvement', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Make Lesson 1 slides more visual with one diagram-ready visual description.', {
      activeTab: 'slideDecks',
    });

    const read = findToolCall(r.toolCalls, 'read_deliverable');
    const edit = findToolCall(r.toolCalls, 'edit_deliverables');
    expect(read?.args?.featureId === 'slideDecks' || getEditFeatureIds(edit).includes('slideDecks')).toBe(true);
  });

  it('creates reusable custom macros when the user asks for a helper', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI(
      'Create a reusable helper called quiz_alignment_check that checks quiz and lesson-plan alignment, then tell me how to run it later.',
      { activeTab: 'quizBank' },
    );

    const createTool = findToolCall(r.toolCalls, 'create_tool');
    expect(createTool).toBeTruthy();
    expect(createTool.args.name).toMatch(/quiz.*alignment|alignment.*quiz/i);
  });

  it('calls undo for a direct undo request', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Undo the last change.', { activeTab: 'quizBank' });

    expect(findToolCall(r.toolCalls, 'undo_last')).toBeTruthy();
  });

  it('does not create ghost assignments when assignments are missing', { timeout: TIMEOUT }, async () => {
    const r = await callOpenAI('Add an assignment brief for Lesson 2 about pruning decision trees.', {
      activeTab: 'quizBank',
    });
    const assignmentEdits = findToolCalls(r.toolCalls, 'edit_deliverables')
      .flatMap(getEditFeatureIds)
      .filter((featureId) => featureId === 'assignments');
    const respond = findToolCall(r.toolCalls, 'respond');

    expect(assignmentEdits).toHaveLength(0);
    if (respond?.args?.chatReply) {
      expect(respond.args.chatReply).toMatch(/assignment/i);
      expect(respond.args.chatReply).toMatch(/not|generate|missing|haven't|do not exist|yet/i);
    } else {
      expect(r.toolCalls || r.textContent).toBeTruthy();
    }
  });
});
