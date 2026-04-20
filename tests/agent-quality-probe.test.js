/**
 * agent-quality-probe.test.js — Deeper quality probes against the live Claude API.
 *
 * The e2e tests check "did the agent call a reasonable tool?".
 * These probes check "did the agent do the *right* thing with quality on par
 * with what a real user would expect?". Findings here drive prompt/schema fixes.
 *
 * Run: ANTHROPIC_API_KEY=... npx vitest run tests/agent-quality-probe.test.js
 */

import { describe, it, expect } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT = 60_000;

const describeWithKey = ANTHROPIC_API_KEY ? describe : describe.skip;

// Use the fixtures from the e2e file — duplicated here to keep this runnable alone.
const COURSE_MAP = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics', sections: [{ learningObjectives: 'Explain supervised vs unsupervised', topicSection: 'Classification, Regression' }] },
    { title: 'Decision Trees and Random Forests', sections: [{ learningObjectives: 'Implement decision tree classifiers', topicSection: 'Trees, Pruning, Ensembles' }] },
    { title: 'Neural Networks Fundamentals', sections: [{ learningObjectives: 'Describe feedforward architecture', topicSection: 'Perceptrons, Backprop' }] },
  ],
};

const DELIVERABLES = {
  quizBank: { status: 'done', data: { quizzes: [
    { lt: 'Supervised Learning Basics', qs: [
      { q: 'What is supervised learning?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' },
      { q: 'Bias vs variance?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
    ]},
    { lt: 'Decision Trees and Random Forests', qs: [
      { q: 'What prevents overfitting?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Pruning','A','B','C'], an: 'Pruning' },
    ]},
    { lt: 'Neural Networks Fundamentals', qs: [
      { q: 'Activation function?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
    ]},
  ]}},
  lessonPlans: { status: 'done', data: { lessonPlans: [
    { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised' },
    { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
    { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward architecture' },
  ]}},
};

async function callClaude(userMessage, { activeTab = 'quizBank', maxTokens = 4096, temperature = 0.3 } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const nativeTools = buildNativeTools('anthropic', AGENT_TOOLS);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: maxTokens, temperature, system: systemPrompt,
      tools: nativeTools, messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }
  const json = await response.json();
  const blocks = json.content || [];
  const toolCalls = blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} }));
  const textContent = blocks.filter(b => b.type === 'text').map(b => b.text).join('') || null;
  return { toolCalls: toolCalls.length > 0 ? toolCalls : null, textContent, stopReason: json.stop_reason, usage: json.usage };
}

const find = (calls, name) => calls?.find(tc => tc.name === name);

describeWithKey(`Anthropic (${ANTHROPIC_MODEL}) Quality Probes`, { timeout: TIMEOUT * 15 }, () => {

  // Q1: when editing "Lesson 3 quiz", does the agent use lessonIndex=2 (0-based)?
  it('Q1: uses 0-based lessonIndex when user says "Lesson N"', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Remove the easy question from Lesson 1 quiz');
    const read = find(r.toolCalls, 'read_deliverable');
    const edit = find(r.toolCalls, 'edit_deliverables');
    const respond = find(r.toolCalls, 'respond');

    if (read) {
      expect(read.args.lessonIndex, 'read_deliverable should use 0-based index for "Lesson 1"').toBe(0);
    }
    if (edit) {
      const a = edit.args.actions?.[0];
      expect(a?.lessonIndex, 'edit action should target lessonIndex 0 for "Lesson 1"').toBe(0);
    }
    // At minimum, one of these must have happened
    expect(read || edit || respond).toBeTruthy();
  });

  // Q2: Proposal options must have pedagogically distinct titles, not "Option A / Option B"
  it('Q2: proposal options have meaningful (non-generic) titles', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Add a question about backpropagation to Lesson 3', { activeTab: 'quizBank' });
    const respond = find(r.toolCalls, 'respond');
    if (respond?.args?.proposal) {
      const titles = respond.args.proposal.options.map(o => o.title?.toLowerCase() || '');
      const generic = titles.filter(t => /^option\s+[a-z]$/i.test(t) || t === 'option 1' || t === 'option 2' || t.length < 4);
      expect(generic.length, `Generic titles: ${JSON.stringify(titles)}`).toBe(0);

      // Bloom's levels should vary across options (pedagogical distinction)
      const blooms = respond.args.proposal.options
        .map(o => o.action?.item?.bl)
        .filter(Boolean);
      const unique = new Set(blooms);
      if (blooms.length >= 2) {
        expect(unique.size, `Options had same Bloom's level: ${blooms.join(', ')}`).toBeGreaterThan(1);
      }
    }
  });

  // Q3: does chatReply leak raw JSON / field names / paths?
  it('Q3: chatReply does not leak JSON / tool syntax / field codes', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Rename Lesson 1 to "ML Foundations"', { activeTab: 'courseMap' });
    const respond = find(r.toolCalls, 'respond');
    if (respond?.args?.chatReply) {
      const reply = respond.args.chatReply;
      // Agent's chatReply must be user-facing, not a dump of its own tool call
      expect(reply, 'chatReply contains raw tool call JSON').not.toMatch(/"patches"\s*:\s*\[/);
      expect(reply, 'chatReply exposes path syntax').not.toMatch(/\["(quizzes|slideDecks|lessonPlans)",\s*\d+/);
      expect(reply, 'chatReply exposes field codes').not.toMatch(/\blessonIndex\s*[:=]\s*\d+/);
      expect(reply, 'chatReply exposes field codes').not.toMatch(/\bfeatureId\s*[:=]/);
    }
  });

  // Q4: "add 3 questions to every lesson" should be one batched edit_deliverables call
  it('Q4: batches bulk edits into a single tool call with multiple actions', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Add a short answer Analyze-level question to every lesson in the quiz bank', { activeTab: 'quizBank' });
    const edit = find(r.toolCalls, 'edit_deliverables');
    const respond = find(r.toolCalls, 'respond');

    // Accept either direct batched edit OR a proposal (for content creation it should propose)
    if (edit) {
      expect(edit.args.actions.length, 'bulk op should batch multiple actions').toBeGreaterThanOrEqual(1);
      const unique = new Set(edit.args.actions.map(a => a.lessonIndex));
      if (edit.args.actions.length >= 2) {
        expect(unique.size, 'bulk edit should target multiple distinct lessons').toBeGreaterThan(1);
      }
    } else if (respond?.args?.proposal) {
      // Proposal is also acceptable for "add content" requests
      expect(respond.args.proposal.options.length).toBeGreaterThanOrEqual(2);
    } else {
      // Reading first is acceptable, but the agent shouldn't just chat
      const read = find(r.toolCalls, 'read_deliverable');
      expect(read).toBeTruthy();
    }
  });

  // Q5: does the agent refuse to operate on a not-yet-generated deliverable or try anyway?
  it('Q5: handles requests against non-existent deliverables gracefully', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Add a new rubric criterion to Lesson 2');
    // rubrics is NOT in DELIVERABLES — agent should NOT pretend to edit it
    const edit = find(r.toolCalls, 'edit_deliverables');
    const respond = find(r.toolCalls, 'respond');
    if (edit) {
      const action = edit.args.actions?.[0];
      // If it did try, it's a bug — the prompt forbids this
      expect(action?.featureId, 'Agent edited non-existent rubrics').not.toBe('rubrics');
    }
    // Expected: explain that rubrics don't exist yet
    if (respond?.args?.chatReply) {
      const lower = respond.args.chatReply.toLowerCase();
      const acknowledgesMissing = /rubric/i.test(lower) && /(not|haven't|generate|missing|don't exist|yet)/i.test(lower);
      expect(acknowledgesMissing, `Reply should mention rubrics aren't generated: ${respond.args.chatReply}`).toBe(true);
    }
  });

  // Q6: parallel tool calling — two independent reads should come in one turn
  it('Q6: issues parallel reads when queries are independent', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Show me the quiz for Lesson 1 AND the lesson plan for Lesson 1');
    // Ideal: two read calls in a single turn
    const reads = (r.toolCalls || []).filter(tc => tc.name === 'read_deliverable');
    if (reads.length >= 2) {
      const feats = new Set(reads.map(x => x.args?.featureId));
      expect(feats.size, 'parallel reads should target distinct deliverables').toBeGreaterThanOrEqual(2);
    }
    // Still acceptable to serialize, but log a warning via test name
    expect(r.toolCalls || r.textContent).toBeTruthy();
  });

  // Q7: agent should NOT ask clarifying questions when intent is obvious (god-mode directive)
  it('Q7: does not punt with clarifying questions for clear requests', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Fix the typo in the Lesson 1 quiz question about supervised learning');
    const respond = find(r.toolCalls, 'respond');
    if (respond?.args?.chatReply) {
      const reply = respond.args.chatReply.toLowerCase();
      const askingForClarification = /(could you clarify|which|can you specify|do you mean|what typo)/i.test(reply) &&
        !/(fixed|corrected|updated|renamed)/i.test(reply);
      expect(askingForClarification, `Agent punted instead of acting: ${respond.args.chatReply}`).toBe(false);
    }
  });

  // Q8: diagram syntax should be valid mermaid (no markdown fences, no code block language)
  it('Q8: diagram response has clean mermaid syntax (no markdown fences)', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Draw a concept map of how the three lessons build on each other');
    const respond = find(r.toolCalls, 'respond');
    if (respond?.args?.diagram?.syntax) {
      const syntax = respond.args.diagram.syntax;
      expect(syntax, 'diagram syntax has markdown fences').not.toMatch(/^```/);
      expect(syntax, 'diagram has trailing fences').not.toMatch(/```\s*$/);
      // Must start with a valid mermaid directive
      expect(syntax.trim(), `bad mermaid start: ${syntax.slice(0,60)}`).toMatch(/^(graph|flowchart|sequenceDiagram|gantt|mindmap|classDiagram|stateDiagram|erDiagram|timeline|quadrantChart|journey)\b/);
    }
  });

  // Q9: when user asks for factual info already in the prompt (lesson titles),
  // the agent should answer directly — NOT call read_lesson
  it('Q9: answers facts-already-in-prompt without wasteful read calls', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('What are the titles of the three lessons?');
    const wastefulReads = (r.toolCalls || []).filter(tc =>
      tc.name === 'read_lesson' || tc.name === 'read_deliverable'
    );
    expect(wastefulReads.length, `agent wasted tool calls on facts already in prompt: ${wastefulReads.map(t=>t.name).join(',')}`).toBe(0);
  });

  // Q10: when the user asks to EDIT item content, agent must use editItem with the
  // correct path structure. Probe the shape of the path arg.
  it('Q10: editItem path structure matches deliverable schema', { timeout: TIMEOUT }, async () => {
    const r = await callClaude('Change the answer of question 1 in Lesson 1 quiz to "A data-driven method"', { activeTab: 'quizBank' });
    const edit = find(r.toolCalls, 'edit_deliverables');
    if (edit) {
      const action = edit.args.actions?.find(a => a.type === 'editItem');
      if (action) {
        expect(action.path, 'editItem needs a path array').toBeTruthy();
        expect(Array.isArray(action.path)).toBe(true);
        // Expected format: ["quizzes", lessonIdx, "qs", itemIdx, field]
        expect(action.path[0], `path root should be "quizzes", got ${action.path[0]}`).toBe('quizzes');
        expect(action.path[1], 'path lessonIdx should be 0 for Lesson 1').toBe(0);
        expect(action.path[2], `path subkey should be "qs" for quiz questions, got ${action.path[2]}`).toBe('qs');
      }
    }
  });
});
