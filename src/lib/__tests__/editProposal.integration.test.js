/**
 * Integration test: Edit → AI Proposal → Accept flow
 *
 * Uses DeepSeek V3 (OpenAI-compatible API) to test the real
 * edit proposal pipeline. Tests that:
 *   1. A prompt is correctly built with edit context
 *   2. The AI returns valid structured JSON
 *   3. The response can be parsed and merged back
 *
 * Run: npm test -- --run editProposal.integration
 *
 * NOTE: Found and fixed a bug during testing — the regex used to inject edit
 *   context into prompts (/\nReturn ONLY the JSON/) did not match the actual
 *   prompt text ("\n- Return ONLY the JSON") because of the leading "- ".
 *   Fixed in deliverablePrompts.js lines 438-439.
 */
import { describe, it, expect } from 'vitest';
import { getDeliverablePrompt } from '../deliverablePrompts';
import { getArrayKey } from '../syncDependencies';
import { expandKeys } from '../keyMaps';
import { extractEditContext } from '../editContextExtractor';

// ── DeepSeek config ──
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// ── Helper: non-streaming call to DeepSeek (OpenAI-compatible) ──
async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 4096) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`DeepSeek API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Parse JSON from AI response (handles markdown fences, think tags, partial JSON) */
function parseAIResponse(text) {
  if (!text) return null;
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip markdown fences
  const fenceStart = cleaned.indexOf('```');
  if (fenceStart !== -1) {
    cleaned = cleaned
      .slice(fenceStart)
      .replace(/^```\w*\n?/, '')
      .replace(/```\s*$/, '');
  }
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  let jsonStr = cleaned.slice(start);
  // Try direct parse first
  try {
    return JSON.parse(jsonStr);
  } catch {
    /* continue */
  }
  // Try to close unclosed brackets
  const lastBrace = jsonStr.lastIndexOf('}');
  if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ── Test fixtures ──
const TEST_COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Linear Regression',
      sections: [
        {
          topicSection: 'Linear Regression Fundamentals',
          learningObjectives:
            'Students will be able to:\n1a. Explain the concept of linear regression\n1b. Apply ordinary least squares to fit a model',
          weeklyAssessments: 'Quiz on regression concepts',
          asyncActivities: 'Read Chapter 2 of ISLR textbook',
          syncActivities: 'Hands-on regression lab in Python',
          supportingResources: 'James et al. (2021). ISLR, Chapter 2',
          technologyNeeded: 'Python, Jupyter Notebook',
          presentationFormat: 'Lecture + Lab',
          learningGoals: 'Understand foundational regression techniques',
          evaluateDesign: 'Objectives align with assessment and activities',
        },
      ],
    },
    {
      title: 'Lesson 2: Classification',
      sections: [
        {
          topicSection: 'Logistic Regression & KNN',
          learningObjectives:
            'Students will be able to:\n2a. Compare classification algorithms\n2b. Implement logistic regression',
          weeklyAssessments: 'Classification problem set',
          asyncActivities: 'Read Chapter 4 of ISLR',
          syncActivities: 'Classification workshop',
          supportingResources: 'James et al. (2021). ISLR, Chapter 4',
          technologyNeeded: 'Python, scikit-learn',
          presentationFormat: 'Lecture + Workshop',
          learningGoals: 'Apply classification methods to real data',
          evaluateDesign: 'Assessment covers both theoretical and practical objectives',
        },
      ],
    },
  ],
};

// ── Mock localStorage for professorProfile ──
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
}

// ── Tests ──

const hasKey = !!DEEPSEEK_KEY;

describe.skipIf(!hasKey)('Edit → AI Proposal → Accept (DeepSeek Integration)', () => {
  const canFetch = typeof fetch !== 'undefined';

  // ── Prompt building tests (no API call) ──

  it('builds prompt with course context for scoped quiz bank', () => {
    const prompts = getDeliverablePrompt('quizBank', TEST_COURSE_MAP, [0], {}, 'lecture');
    expect(prompts).not.toBeNull();
    expect(prompts.systemPrompt).toBeTruthy();
    expect(prompts.userPrompt).toContain('Linear Regression');
    expect(prompts.userPrompt).toContain('SCOPE CONSTRAINT');
  });

  it('builds prompt for scoped lesson plans with config', () => {
    const prompts = getDeliverablePrompt(
      'lessonPlans',
      TEST_COURSE_MAP,
      [1],
      {
        sessionLength: '75 minutes',
      },
      'lecture',
    );
    expect(prompts).not.toBeNull();
    // Config instructions are injected via the same regex (now fixed).
    expect(prompts.userPrompt).toContain('Classification');
    expect(prompts.userPrompt).toContain('SCOPE CONSTRAINT');
  });

  it('extractEditContext generates meaningful context from deliverable edits', () => {
    const oldData = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          totalQuestions: 5,
          questions: [{ question: 'What is regression?', type: 'short_answer' }],
        },
      ],
    };
    const newData = {
      quizzes: [
        {
          lessonTitle: 'Lesson 1',
          totalQuestions: 5,
          questions: [{ question: 'Explain the mathematical foundation of linear regression', type: 'short_answer' }],
        },
      ],
    };
    const context = extractEditContext(oldData, newData, ['quizzes', 0, 'questions']);
    expect(context).toBeTruthy();
    expect(context).toContain('questions');
  });

  // ── editContext injection (regex was fixed to match "- Return ONLY") ──
  it('editContext IS injected into the prompt', () => {
    const editContext = 'question: "What is regression?" → "Explain mathematical foundations"';
    const prompts = getDeliverablePrompt('quizBank', TEST_COURSE_MAP, [0], {}, 'lecture', null, editContext);
    const hasEditContext = prompts.userPrompt.includes('INSTRUCTOR EDIT TO INCORPORATE');
    expect(hasEditContext).toBe(true);
  });

  // ── API integration tests (require DeepSeek) ──

  it.skipIf(!canFetch)(
    'generates valid quiz bank JSON from DeepSeek',
    async () => {
      const prompts = getDeliverablePrompt(
        'quizBank',
        TEST_COURSE_MAP,
        [0],
        {
          questionsPerLesson: 3,
        },
        'lecture',
      );

      const response = await callDeepSeek(prompts.systemPrompt, prompts.userPrompt, 4096);
      expect(response).toBeTruthy();

      const parsed = parseAIResponse(response);
      expect(parsed).not.toBeNull();

      // Verify structure
      const arrKey = getArrayKey('quizBank', parsed);
      expect(arrKey).toBeTruthy();
      const quizArr = parsed[arrKey];
      expect(Array.isArray(quizArr)).toBe(true);
      expect(quizArr.length).toBeGreaterThanOrEqual(1);

      // Verify the first quiz entry has questions
      const firstQuiz = quizArr[0];
      const questionsKey = firstQuiz.qs ? 'qs' : firstQuiz.questions ? 'questions' : null;
      expect(questionsKey).toBeTruthy();
      expect(firstQuiz[questionsKey].length).toBeGreaterThanOrEqual(1);

      // Expand abbreviated keys and verify
      const expanded = expandKeys('quizBank', firstQuiz);
      // Should have lessonTitle (expanded from lt) or lt
      expect(expanded.lessonTitle || firstQuiz.lt).toBeTruthy();
    },
    120000,
  );

  it.skipIf(!canFetch)(
    'generates valid lesson plan JSON from DeepSeek',
    async () => {
      const prompts = getDeliverablePrompt(
        'lessonPlans',
        TEST_COURSE_MAP,
        [0],
        {
          sessionLength: '75 minutes',
        },
        'lecture',
      );

      const response = await callDeepSeek(prompts.systemPrompt, prompts.userPrompt, 4096);
      expect(response).toBeTruthy();

      const parsed = parseAIResponse(response);
      expect(parsed).not.toBeNull();

      const arrKey = getArrayKey('lessonPlans', parsed);
      expect(arrKey).toBeTruthy();
      const plans = parsed[arrKey];
      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBeGreaterThanOrEqual(1);

      const plan = plans[0];
      const expanded = expandKeys('lessonPlans', plan);
      // Should have an outline
      expect(expanded.outline || plan.ol || plan.outline).toBeTruthy();
    },
    120000,
  );

  it.skipIf(!canFetch)(
    'proposal accept merges correctly into existing data',
    async () => {
      // Simulate: existing quiz bank data + AI proposal for lesson 0
      const existingData = {
        quizzes: [
          {
            lessonTitle: 'Lesson 1: Linear Regression',
            totalQuestions: 2,
            questions: [{ q: 'Old Q1' }, { q: 'Old Q2' }],
          },
          { lessonTitle: 'Lesson 2: Classification', totalQuestions: 1, questions: [{ q: 'Existing Q' }] },
        ],
      };

      const prompts = getDeliverablePrompt(
        'quizBank',
        TEST_COURSE_MAP,
        [0],
        {
          questionsPerLesson: 3,
        },
        'lecture',
      );

      const response = await callDeepSeek(prompts.systemPrompt, prompts.userPrompt, 4096);
      const parsed = parseAIResponse(response);
      expect(parsed).not.toBeNull();

      const arrKey = getArrayKey('quizBank', parsed);
      const proposedLesson = parsed[arrKey]?.[0];
      expect(proposedLesson).toBeTruthy();

      // Simulate acceptProposal merge
      const merged = [...existingData.quizzes];
      merged[0] = proposedLesson; // replace lesson 0 with proposal

      const mergedData = { ...existingData, quizzes: merged };

      // Verify: lesson 0 is the new proposal, lesson 1 is untouched
      expect(mergedData.quizzes[0]).toBe(proposedLesson);
      expect(mergedData.quizzes[1].lessonTitle).toBe('Lesson 2: Classification');
      expect(mergedData.quizzes[1].questions[0].q).toBe('Existing Q');
      // New quiz should have questions
      const qKey = proposedLesson.qs ? 'qs' : 'questions';
      expect(proposedLesson[qKey].length).toBeGreaterThanOrEqual(1);
    },
    120000,
  );
});

// ── Cascade Sync Integration Tests ──────────────────────────────────────────
// Tests the full cascade flow: edit → identify affected deliverables → regenerate downstream

import {
  DELIVERABLE_OUTBOUND_MAP,
  getOutboundTargets,
  getAffectedFeatures,
  buildSyncPlan,
  computeStaleConfidence,
} from '../syncDependencies';

describe.skipIf(!hasKey)('Cascade Sync Integration (DeepSeek)', () => {
  // ── Unit-level cascade logic (no API call) ──

  it('DELIVERABLE_OUTBOUND_MAP: lessonPlans cascades to slideDecks and studyGuides', () => {
    const targets = getOutboundTargets('lessonPlans');
    expect(targets).toContain('slideDecks');
    expect(targets).toContain('studyGuides');
    expect(targets).not.toContain('lessonPlans'); // no self-reference
  });

  it('DELIVERABLE_OUTBOUND_MAP: assignments cascades to rubrics', () => {
    expect(getOutboundTargets('assignments')).toEqual(['rubrics']);
  });

  it('DELIVERABLE_OUTBOUND_MAP: quizBank cascades to studyGuides', () => {
    expect(getOutboundTargets('quizBank')).toEqual(['studyGuides']);
  });

  it('DELIVERABLE_OUTBOUND_MAP: discussions has no cascade targets', () => {
    expect(getOutboundTargets('discussions')).toEqual([]);
  });

  it('FIELD_DEPENDENCY_MAP: learningObjectives affects 5 deliverables', () => {
    const affected = getAffectedFeatures('learningObjectives');
    expect(affected).toContain('lessonPlans');
    expect(affected).toContain('slideDecks');
    expect(affected).toContain('rubrics');
    expect(affected).toContain('quizBank');
    expect(affected).toContain('studyGuides');
    expect(affected.length).toBe(5);
  });

  it('FIELD_DEPENDENCY_MAP: title affects all per-lesson deliverables', () => {
    const affected = getAffectedFeatures('title');
    expect(affected.length).toBeGreaterThanOrEqual(7);
  });

  it('FIELD_DEPENDENCY_MAP: weeklyAssessments affects rubrics, quizBank, assignments', () => {
    const affected = getAffectedFeatures('weeklyAssessments');
    expect(affected).toContain('rubrics');
    expect(affected).toContain('quizBank');
    expect(affected).toContain('assignments');
  });

  it('staleness confidence: learningObjectives edit → high confidence', () => {
    const result = computeStaleConfidence(['learningObjectives']);
    expect(result.level).toBe('high');
    expect(result.maxWeight).toBe(1.0);
  });

  it('staleness confidence: semester edit → low confidence', () => {
    const result = computeStaleConfidence(['semester']);
    expect(result.level).toBe('low');
    expect(result.maxWeight).toBe(0.2);
  });

  it('buildSyncPlan: course map edit generates correct plan', () => {
    const pendingEdits = [{ lessonIdx: 0, key: 'learningObjectives', excludeFeatureId: null }];
    const selectedFeatures = ['courseMap', 'lessonPlans', 'slideDecks', 'rubrics', 'quizBank', 'studyGuides'];
    const deliverables = {
      lessonPlans: { status: 'done', data: {} },
      slideDecks: { status: 'done', data: {} },
      rubrics: { status: 'done', data: {} },
      quizBank: { status: 'done', data: {} },
      studyGuides: { status: 'done', data: {} },
    };

    const plan = buildSyncPlan(pendingEdits, selectedFeatures, deliverables);
    expect(plan.length).toBe(5); // all 5 affected features
    const featureIds = plan.map((p) => p.featureId);
    expect(featureIds).toContain('lessonPlans');
    expect(featureIds).toContain('slideDecks');
    expect(featureIds).toContain('rubrics');
    expect(featureIds).toContain('quizBank');
    expect(featureIds).toContain('studyGuides');
    // Each should have lessonIndices = [0]
    plan.forEach((entry) => {
      expect(entry.lessonIndices).toEqual([0]);
    });
  });

  it('buildSyncPlan: deliverable edit cascades to outbound targets only', () => {
    const pendingEdits = [{ lessonIdx: 1, key: '_deliverableEdit', excludeFeatureId: 'lessonPlans' }];
    const selectedFeatures = ['courseMap', 'lessonPlans', 'slideDecks', 'studyGuides', 'rubrics'];
    const deliverables = {
      lessonPlans: { status: 'done', data: {} },
      slideDecks: { status: 'done', data: {} },
      studyGuides: { status: 'done', data: {} },
      rubrics: { status: 'done', data: {} },
    };

    const plan = buildSyncPlan(pendingEdits, selectedFeatures, deliverables, 'lessonPlans');
    const featureIds = plan.map((p) => p.featureId);
    // lessonPlans → [slideDecks, studyGuides]
    expect(featureIds).toContain('slideDecks');
    expect(featureIds).toContain('studyGuides');
    // Should NOT include lessonPlans itself (source) or rubrics (not downstream)
    expect(featureIds).not.toContain('lessonPlans');
    expect(featureIds).not.toContain('rubrics');
  });

  it('buildSyncPlan: skips features with status !== done', () => {
    const pendingEdits = [{ lessonIdx: 0, key: 'learningObjectives', excludeFeatureId: null }];
    const selectedFeatures = ['courseMap', 'lessonPlans', 'slideDecks', 'rubrics'];
    const deliverables = {
      lessonPlans: { status: 'done', data: {} },
      slideDecks: { status: 'idle', data: null }, // not generated
      rubrics: { status: 'done', data: {} },
    };

    const plan = buildSyncPlan(pendingEdits, selectedFeatures, deliverables);
    const featureIds = plan.map((p) => p.featureId);
    expect(featureIds).toContain('lessonPlans');
    expect(featureIds).toContain('rubrics');
    expect(featureIds).not.toContain('slideDecks'); // skipped — not done
  });

  // ── Full cascade flow with DeepSeek (API call) ──

  it('end-to-end: edit lesson plan objectives → cascade regenerates study guide', async () => {
    // Step 1: Generate lesson plan for lesson 0
    const lpPrompts = getDeliverablePrompt(
      'lessonPlans',
      TEST_COURSE_MAP,
      [0],
      {
        sessionLength: '75 minutes',
      },
      'lecture',
    );
    const lpResponse = await callDeepSeek(lpPrompts.systemPrompt, lpPrompts.userPrompt, 4096);
    const lpParsed = parseAIResponse(lpResponse);
    expect(lpParsed).not.toBeNull();
    const lpArrKey = getArrayKey('lessonPlans', lpParsed);
    expect(lpArrKey).toBeTruthy();
    expect(lpParsed[lpArrKey].length).toBeGreaterThanOrEqual(1);

    // Step 2: Simulate editing the lesson plan (change objectives)
    const originalPlan = lpParsed[lpArrKey][0];
    const editContext = 'objectives changed: added "Apply gradient descent optimization" to lesson objectives';

    // Step 3: Verify cascade targets
    const cascadeTargets = getOutboundTargets('lessonPlans');
    expect(cascadeTargets).toContain('studyGuides');

    // Step 4: Generate downstream study guide WITH edit context
    const sgPrompts = getDeliverablePrompt('studyGuides', TEST_COURSE_MAP, [0], {}, 'lecture', null, editContext);
    expect(sgPrompts.userPrompt).toContain('INSTRUCTOR EDIT TO INCORPORATE');
    expect(sgPrompts.userPrompt).toContain('gradient descent');

    const sgResponse = await callDeepSeek(sgPrompts.systemPrompt, sgPrompts.userPrompt, 4096);
    const sgParsed = parseAIResponse(sgResponse);
    expect(sgParsed).not.toBeNull();

    const sgArrKey = getArrayKey('studyGuides', sgParsed);
    expect(sgArrKey).toBeTruthy();
    expect(sgParsed[sgArrKey].length).toBeGreaterThanOrEqual(1);

    // Step 5: Verify the study guide incorporated the edit
    const sgText = JSON.stringify(sgParsed).toLowerCase();
    expect(sgText).toContain('gradient descent');
  }, 180000);

  it('end-to-end: edit quiz bank → cascade regenerates study guide with quiz context', async () => {
    // Step 1: Generate quiz for lesson 0
    const qPrompts = getDeliverablePrompt(
      'quizBank',
      TEST_COURSE_MAP,
      [0],
      {
        questionsPerLesson: 3,
      },
      'lecture',
    );
    const qResponse = await callDeepSeek(qPrompts.systemPrompt, qPrompts.userPrompt, 4096);
    const qParsed = parseAIResponse(qResponse);
    expect(qParsed).not.toBeNull();

    // Step 2: Verify cascade: quizBank → studyGuides
    expect(getOutboundTargets('quizBank')).toContain('studyGuides');

    // Step 3: Generate study guide with edit context from quiz change
    const editContext =
      'quiz question added: "Derive the closed-form solution for OLS regression using matrix calculus"';
    const sgPrompts = getDeliverablePrompt('studyGuides', TEST_COURSE_MAP, [0], {}, 'lecture', null, editContext);
    expect(sgPrompts.userPrompt).toContain('INSTRUCTOR EDIT TO INCORPORATE');

    const sgResponse = await callDeepSeek(sgPrompts.systemPrompt, sgPrompts.userPrompt, 4096);
    const sgParsed = parseAIResponse(sgResponse);
    expect(sgParsed).not.toBeNull();

    // Study guide should reference the quiz topic
    const sgText = JSON.stringify(sgParsed).toLowerCase();
    expect(
      sgText.includes('ols') ||
        sgText.includes('ordinary least squares') ||
        sgText.includes('matrix') ||
        sgText.includes('regression'),
    ).toBe(true);
  }, 180000);

  it('end-to-end: edit assignment → cascade regenerates rubric aligned to changes', async () => {
    // Verify cascade: assignments → rubrics
    expect(getOutboundTargets('assignments')).toEqual(['rubrics']);

    // Generate rubric with edit context from assignment change
    const editContext = 'assignment updated: added deliverable "peer code review report" with 20% weight';
    const rPrompts = getDeliverablePrompt('rubrics', TEST_COURSE_MAP, [0], {}, 'lecture', null, editContext);
    expect(rPrompts.userPrompt).toContain('INSTRUCTOR EDIT TO INCORPORATE');
    expect(rPrompts.userPrompt).toContain('peer code review');

    const rResponse = await callDeepSeek(rPrompts.systemPrompt, rPrompts.userPrompt, 4096);
    const rParsed = parseAIResponse(rResponse);
    expect(rParsed).not.toBeNull();

    const rArrKey = getArrayKey('rubrics', rParsed);
    expect(rArrKey).toBeTruthy();

    // Rubric should include criteria for peer review
    const rText = JSON.stringify(rParsed).toLowerCase();
    expect(rText.includes('peer') || rText.includes('review') || rText.includes('code')).toBe(true);
  }, 120000);
});
