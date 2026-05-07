/**
 * agent-prose-regression.test.js — pins prose-style regressions surfaced in
 * the live audit pass.
 *
 * Live traces showed three issues in Sonnet 4.6 output:
 *   1. Agent sometimes emits "Let me read the …" as a TEXT block before a
 *      tool call — violates the explicit prompt rule banning that.
 *   2. When responding to an un-actionable request (deliverable not
 *      generated), the agent tacks on a multi-step "how to get started" list
 *      that (a) pads the reply past the "concise" directive and (b) risks
 *      giving UI advice that doesn't match reality.
 *   3. After run_tool returns an aggregated result, the agent re-reads the
 *      same deliverables the macro already consumed — wastes iterations.
 *
 * Each test is a single live API call against claude-sonnet-4-6, so the
 * suite is ~30s wall time. Skipped without ANTHROPIC_API_KEY.
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const describeWithKey = KEY ? describe : describe.skip;

const COURSE = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Supervised Learning Basics',
      sections: [
        { learningObjectives: 'Explain supervised vs unsupervised', topicSection: 'Classification, Regression' },
      ],
    },
    {
      title: 'Decision Trees and Random Forests',
      sections: [
        { learningObjectives: 'Implement decision tree classifiers', topicSection: 'Trees, Pruning, Ensembles' },
      ],
    },
    {
      title: 'Neural Networks Fundamentals',
      sections: [{ learningObjectives: 'Describe feedforward architecture', topicSection: 'Perceptrons, Backprop' }],
    },
  ],
};
const DELIV = {
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

// Direct single-turn call so we can inspect the RAW text + tool_use blocks.
async function rawCall(userMessage, { activeTab = 'quizBank' } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE, activeTab, DELIV);
  const tools = buildNativeTools('anthropic', AGENT_TOOLS);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.3,
      system: systemPrompt,
      tools,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || JSON.stringify(json));
  const blocks = json.content || [];
  return {
    text: blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(''),
    calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, args: b.input })),
  };
}

describeWithKey(`Prose regression probes (${MODEL})`, { timeout: 300_000 }, () => {
  it('Q-prose-1: does not emit "Let me …" / "I\'ll …" / "I\'m going to …" in a USER-VISIBLE reply', async () => {
    // Same prompt that produced the bug in the earlier live trace.
    // Sonnet sometimes emits a leading TEXT block with "Let me read…" BEFORE
    // a tool_use. In CourseMapper's agent loop (useToolInvoker.js), that text
    // is discarded — when a tool call is present, `textContent` is never
    // surfaced. Users only see text when the agent returns a response with
    // NO tool calls (text-only fallback) or as part of respond()'s chatReply.
    // So this test flags only prose in those two user-visible channels.
    const r = await rawCall('Fix the typo in the Lesson 1 quiz');
    const bannedPrefixes = /\b(let\s+me|i['’]ll|i\s+will|i['’]m\s+going\s+to|let\s+us|i'd\s+like\s+to)\b/i;
    const chatReply = r.calls.find((c) => c.name === 'respond')?.args?.chatReply || '';
    const hasToolCall = (r.calls || []).length > 0;
    // If there are no tool calls, the text block IS the user-visible answer.
    const userVisible = hasToolCall ? chatReply : r.text || '';
    expect(
      userVisible.match(bannedPrefixes),
      `Banned prefix matched in user-visible output: ${JSON.stringify(userVisible.slice(0, 400))}`,
    ).toBeNull();
  });

  it('Q-prose-2: declining an un-actionable request stays concise (≤2 sentences)', async () => {
    // rubrics is NOT in DELIV — agent should say so briefly, not launch into
    // a "Navigate to tab X, click button Y" UI tutorial.
    const r = await runMultiTurn({
      apiKey: KEY,
      model: MODEL,
      courseMap: COURSE,
      deliverables: DELIV,
      maxIterations: 4,
      userMessage: 'Add a new rubric criterion about code quality to Lesson 2.',
    });
    const chatReply = r.finalResponse?.chatReply || '';
    expect(chatReply, 'should get a chatReply').toBeTruthy();
    // Count sentences by looking at terminal punctuation. Tolerant: the agent
    // may include one follow-up sentence after explaining. Three+ is where it
    // starts reading as a tutorial.
    const sentences = chatReply.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 4);
    expect(sentences.length, `expected ≤2 sentences, got ${sentences.length}: ${chatReply}`).toBeLessThanOrEqual(2);
    // And should not enumerate UI steps ("1.", "2.", "Navigate to")
    expect(chatReply, 'must not launch a UI tutorial').not.toMatch(/^\s*\d+\.\s/m);
    expect(chatReply.toLowerCase(), 'must not prescribe clicking tabs').not.toMatch(
      /click\s+(the\s+)?(generate|create)\s+button|navigate\s+to\s+the/i,
    );
  });

  it('Q-prose-3: after run_tool returns, agent does not re-read the same deliverables', async () => {
    const r = await runMultiTurn({
      apiKey: KEY,
      model: MODEL,
      courseMap: COURSE,
      deliverables: DELIV,
      maxIterations: 12,
      userMessage:
        'Create a reusable tool called `audit_bloom_floor` that takes a featureId and runs ' +
        'validate_course plus read_deliverable on that feature. Then run it on quizBank. ' +
        "Trust the macro's output — do NOT re-read quizBank after running the macro.",
    });
    // Find the iteration where run_tool fired.
    const runToolIter = r.trace.findIndex((t) => t.calls.some((c) => c.name === 'run_tool'));
    expect(runToolIter, 'run_tool should have fired').toBeGreaterThanOrEqual(0);

    // In all iterations AFTER run_tool, there should be no read_deliverable
    // against quizBank — the macro already produced that result.
    const subsequentReads = r.trace
      .slice(runToolIter + 1)
      .flatMap((t) => t.calls.filter((c) => c.name === 'read_deliverable' && c.args?.featureId === 'quizBank'));
    expect(
      subsequentReads.length,
      `agent re-read quizBank ${subsequentReads.length} times after run_tool. Trace: ${JSON.stringify(r.trace.map((t) => t.calls.map((c) => c.name)))}`,
    ).toBe(0);
  });
});
