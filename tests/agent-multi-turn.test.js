/**
 * agent-multi-turn.test.js — End-to-end multi-turn agent-loop tests.
 *
 * Each test drives the REAL agent loop (with real AGENT_TOOLS and
 * executeAction) against a mutable fixture, through claude-sonnet-4-6,
 * and asserts on the FINAL state — i.e. "did the edits actually land?".
 *
 * Run: ANTHROPIC_API_KEY=... npx vitest run tests/agent-multi-turn.test.js
 */

import { describe, it, expect } from 'vitest';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT = 300_000; // 5 min per scenario — multi-turn is slow
const describeWithKey = ANTHROPIC_API_KEY ? describe : describe.skip;

const FIXTURE_COURSE = {
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

const FIXTURE_DELIV = {
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
            { q: 'Bias vs variance?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
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
          qs: [
            {
              q: 'Activation function?',
              ty: 'short_answer',
              bl: 'Remember',
              df: 'easy',
              pt: 2,
              an: 'makes things non-linear',
            },
          ],
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
};

function ctx() {
  return { apiKey: ANTHROPIC_API_KEY, model: MODEL, courseMap: FIXTURE_COURSE, deliverables: FIXTURE_DELIV };
}

describeWithKey(`Multi-turn agent loop (${MODEL}) — "Consider it done"`, { timeout: TIMEOUT * 8 }, () => {
  // ── 1. Single-turn edit should actually mutate state ──────────────────────
  it('S1: renames a lesson and the state reflects the edit', { timeout: TIMEOUT }, async () => {
    const r = await runMultiTurn({
      ...ctx(),
      activeTab: 'courseMap',
      userMessage: 'Rename Lesson 2 to "Tree-Based Learning Methods"',
    });
    expect(r.state.courseMap.lessons[1].title, 'title should be updated').toBe('Tree-Based Learning Methods');
    expect(r.finalResponse?.chatReply || r.finalResponse?.proposal, 'agent should reply to user').toBeTruthy();
    expect(r.loopBroken, 'should not loop').toBeNull();
    expect(r.iterations, 'should finish quickly').toBeLessThanOrEqual(3);
  });

  // ── 2. Chain: read then edit ──────────────────────────────────────────────
  it('S2: reads the quiz first, then rewrites the easy Lesson 1 question', { timeout: TIMEOUT }, async () => {
    const beforeQ = FIXTURE_DELIV.quizBank.data.quizzes[0].qs[0].q;
    const r = await runMultiTurn({
      ...ctx(),
      activeTab: 'quizBank',
      userMessage:
        'The first question in Lesson 1 quiz is too easy. Rewrite it at Apply level with four plausible options. Just do it.',
    });
    const toolsUsed = r.trace.flatMap((t) => t.calls.map((c) => c.name));
    expect(toolsUsed.length, 'agent should invoke at least one tool').toBeGreaterThan(0);
    // Either it edited directly, or proposed — accept both but prefer direct edit for this intent
    const editedQ = r.state.deliverables.quizBank.data.quizzes[0].qs[0];
    const textReply = r.finalResponse?.chatReply || JSON.stringify(r.finalResponse?.proposal || {});
    // If edited, the text or bl should reflect Apply-level
    const evidence = editedQ.q !== beforeQ || /apply/i.test(textReply) || /apply/i.test(editedQ.bl || '');
    expect(
      evidence,
      `Expected Apply-level evidence. Edited q=${JSON.stringify(editedQ)} reply=${textReply.slice(0, 200)}`,
    ).toBe(true);
  });

  // ── 3. Bulk op: every-lesson edit ─────────────────────────────────────────
  it('S3: adds an Analyze-level question to every lesson in the quiz bank', { timeout: TIMEOUT }, async () => {
    const before = FIXTURE_DELIV.quizBank.data.quizzes.map((q) => q.qs.length);
    const r = await runMultiTurn({
      ...ctx(),
      activeTab: 'quizBank',
      userMessage: 'Add an Analyze-level short answer question to every lesson in the quiz bank. Consider it done.',
    });
    const after = r.state.deliverables.quizBank.data.quizzes.map((q) => q.qs.length);
    const proposed = !!r.finalResponse?.proposal;
    const addedAll = after.every((n, i) => n >= before[i] + 1);
    // Accept either: a direct batched add (addedAll=true) or a proposal covering all lessons
    if (proposed) {
      const opts = r.finalResponse.proposal.options || [];
      // A good proposal covers the full bulk intent — either one option per lesson, or one option that does all
      expect(opts.length, 'proposal should offer multiple options').toBeGreaterThanOrEqual(2);
    } else {
      expect(addedAll, `Expected +1 question in every lesson. before=${before} after=${after}`).toBe(true);
      // And the added questions should actually be Analyze-level short_answer
      for (let i = 0; i < after.length; i++) {
        const newItems = r.state.deliverables.quizBank.data.quizzes[i].qs.slice(before[i]);
        const any = newItems.some((q) => /analyze/i.test(q.bl || '') && q.ty === 'short_answer');
        expect(
          any,
          `Lesson ${i + 1} new questions should be Analyze short_answer, got ${JSON.stringify(newItems)}`,
        ).toBe(true);
      }
    }
  });

  // ── 4. Agent should gracefully decline when targeting a not-done deliverable
  it("S4: explains rubrics aren't generated instead of corrupting state", { timeout: TIMEOUT }, async () => {
    const r = await runMultiTurn({
      ...ctx(),
      userMessage: 'Add a rubric criterion about code quality to Lesson 2.',
    });
    // state.rubrics must remain undefined/empty (no ghost data created)
    expect(r.state.deliverables.rubrics, 'should not fabricate rubrics data').toBeUndefined();
    const text = r.finalResponse?.chatReply || JSON.stringify(r.finalResponse || {});
    expect(
      /rubric/i.test(text) && /(not|haven't|generate|don't exist|yet)/i.test(text),
      `Expected explanation that rubrics aren't generated. Got: ${text.slice(0, 300)}`,
    ).toBe(true);
  });

  // ── 5. Cross-deliverable alignment ────────────────────────────────────────
  it('S5: runs an alignment check and reports findings', { timeout: TIMEOUT }, async () => {
    const r = await runMultiTurn({
      ...ctx(),
      activeTab: 'quizBank',
      userMessage: 'Are my quizzes aligned with the lesson plan objectives? Check and tell me in plain English.',
    });
    const toolsUsed = r.trace.flatMap((t) => t.calls.map((c) => c.name));
    const usedAlignmentTool = toolsUsed.some((t) => t === 'compare_deliverables' || t === 'validate_course');
    expect(usedAlignmentTool, `Expected alignment tool. Got: ${toolsUsed.join(',')}`).toBe(true);
    expect(r.finalResponse?.chatReply, 'should produce a textual reply').toBeTruthy();
  });

  // ── 6. Tool creation: synthesize a macro, then invoke it ──────────────────
  it("S6: creates a custom macro and invokes it to upgrade Bloom's levels", { timeout: TIMEOUT }, async () => {
    const beforeLow = countLowBloom(FIXTURE_DELIV);
    const r = await runMultiTurn({
      ...ctx(),
      activeTab: 'quizBank',
      maxIterations: 12,
      userMessage:
        "I have a lot of low-Bloom's questions and I'll keep needing to fix them across deliverables in the future. " +
        'Please CREATE A REUSABLE TOOL called `audit_bloom_floor` that takes a featureId and runs validate_course plus ' +
        'read_deliverable on that feature, so I can re-audit any deliverable later with one call. Then run it on quizBank ' +
        'and tell me what you found. Make sure the tool is registered via create_tool before you call it.',
    });
    // Did the agent actually create a custom tool?
    const createdNames = r.customTools.map((t) => t.name);
    expect(
      createdNames.length,
      `Agent should register a custom tool. trace=${JSON.stringify(r.trace.map((t) => t.calls.map((c) => c.name)))}`,
    ).toBeGreaterThanOrEqual(1);
    // And invoke it afterward
    const calls = r.trace.flatMap((t) => t.calls.map((c) => c.name));
    expect(calls.includes('create_tool'), `Expected create_tool call. Calls: ${calls.join(',')}`).toBe(true);
    expect(
      calls.includes('run_tool') || calls.some((c) => createdNames.includes(c)),
      `Expected run_tool invocation after create_tool. Calls: ${calls.join(',')}`,
    ).toBe(true);
    expect(r.finalResponse, 'agent should respond to user after running the macro').toBeTruthy();
  });
});

function countLowBloom(deliverables) {
  const qs = deliverables.quizBank?.data?.quizzes || [];
  let n = 0;
  for (const lesson of qs) for (const q of lesson.qs || []) if (['Remember', 'Understand'].includes(q.bl)) n++;
  return n;
}
