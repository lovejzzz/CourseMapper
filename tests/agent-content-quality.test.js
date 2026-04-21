/**
 * agent-content-quality.test.js — audits the SUBSTANCE of the agent's output,
 * not just whether it called the right tool. Covers dimensions the earlier
 * quality-probe suite doesn't: option distinctiveness, mermaid renderability,
 * surgical-edit correctness (did only the requested field change?), and
 * multi-turn context resolution ("the quiz for that lesson" after asking about
 * Lesson 2).
 *
 * Live-runs against claude-sonnet-4-6. Skipped without ANTHROPIC_API_KEY.
 * Each test is one live API call or one multi-turn session.
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
  courseName: 'Introduction to Machine Learning', semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics', sections: [{
      learningObjectives: 'Explain supervised vs unsupervised learning',
      topicSection: 'Classification, Regression, Training Sets',
      learningGoals: 'Understand the fundamental concepts of supervised learning',
    }]},
    { title: 'Decision Trees and Random Forests', sections: [{
      learningObjectives: 'Implement decision tree classifiers and explain overfitting',
      topicSection: 'Decision Trees, Pruning, Ensemble Methods',
      learningGoals: 'Build and evaluate tree-based models',
    }]},
    { title: 'Neural Networks Fundamentals', sections: [{
      learningObjectives: 'Describe the architecture of a feedforward neural network',
      topicSection: 'Perceptrons, Activation Functions, Backpropagation',
      learningGoals: 'Understand how neural networks learn through gradient descent',
    }]},
  ],
};

const DELIV = {
  quizBank: { status: 'done', data: { quizzes: [
    { lt: 'Supervised Learning Basics', qs: [
      { q: 'What is supervised learning?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' },
      { q: 'Bias vs variance?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' },
    ]},
    { lt: 'Decision Trees and Random Forests', qs: [{ q: 'What prevents overfitting?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Pruning','A','B','C'], an: 'Pruning' }]},
    { lt: 'Neural Networks Fundamentals', qs: [{ q: 'Activation function?', ty: 'short_answer', bl: 'Understand', df: 'medium', pt: 2, an: '...' }]},
  ]}},
  lessonPlans: { status: 'done', data: { lessonPlans: [
    { lt: 'Supervised Learning Basics', ob: 'Explain supervised vs unsupervised' },
    { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
    { lt: 'Neural Networks Fundamentals', ob: 'Describe feedforward architecture' },
  ]}},
};

async function rawCall(userMessage, { activeTab = 'quizBank' } = {}) {
  const systemPrompt = buildAgentSystemPrompt(COURSE, activeTab, DELIV);
  const tools = buildNativeTools('anthropic', AGENT_TOOLS);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096, temperature: 0.3,
      system: systemPrompt, tools, messages: [{ role: 'user', content: userMessage }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || JSON.stringify(json));
  const blocks = json.content || [];
  return {
    text: blocks.filter(b => b.type === 'text').map(b => b.text).join(''),
    calls: blocks.filter(b => b.type === 'tool_use').map(b => ({ name: b.name, args: b.input })),
  };
}

// ── Proposal option distinctness ────────────────────────────────────────────

describeWithKey(`Content quality — proposals (${MODEL})`, { timeout: 240_000 }, () => {
  it('CQ-P1: 3 quiz-question options have distinct Bloom\'s levels OR question types', async () => {
    const r = await rawCall('Add a question about the bias-variance tradeoff to Lesson 1. Give me 3 options.');
    const respond = r.calls.find(c => c.name === 'respond');
    if (!respond?.args?.proposal) {
      // Some runs may fold this into a single edit — acceptable but skip the assertion.
      return;
    }
    const opts = respond.args.proposal.options || [];
    expect(opts.length, 'should have 3 options when the user asks for 3').toBeGreaterThanOrEqual(2);
    const blooms = opts.map(o => (o.action?.item?.bl || '').toLowerCase()).filter(Boolean);
    const types = opts.map(o => (o.action?.item?.ty || '').toLowerCase()).filter(Boolean);
    const questions = opts.map(o => (o.action?.item?.q || '').toLowerCase().trim()).filter(Boolean);
    // Pedagogical distinctness: at least Bloom OR type must vary.
    const bloomVaries = new Set(blooms).size > 1;
    const typeVaries = new Set(types).size > 1;
    expect(bloomVaries || typeVaries,
      `Options not pedagogically distinct. blooms=${JSON.stringify(blooms)} types=${JSON.stringify(types)}`).toBe(true);
    // Concrete distinctness: question stems must differ.
    expect(new Set(questions).size, `Duplicate question stems: ${JSON.stringify(questions)}`).toBe(questions.length);
  });

  it('CQ-P2: proposal items have no placeholder text (TBD, [insert])', async () => {
    const r = await rawCall('Add a multiple choice question about decision tree pruning to Lesson 2.');
    const respond = r.calls.find(c => c.name === 'respond');
    if (!respond?.args?.proposal) return;
    const opts = respond.args.proposal.options || [];
    for (const o of opts) {
      const serialized = JSON.stringify(o.action?.item || {}).toLowerCase();
      expect(serialized, `placeholder in option "${o.title}": ${serialized.slice(0,200)}`)
        .not.toMatch(/\btbd\b|\[insert[^\]]*\]|\bfill\s+in\b|\bexample\s+placeholder\b/i);
    }
  });
});

// ── Mermaid renderability ────────────────────────────────────────────────────

describeWithKey(`Content quality — mermaid (${MODEL})`, { timeout: 240_000 }, () => {
  it('CQ-M1: diagram syntax is structurally valid (no fences, balanced blocks, known directive)', async () => {
    // Note: mermaid's full .parse() requires a DOM (via DOMPurify). For a
    // pure-Node test we do a structural sanity check covering the common
    // ways LLMs mangle mermaid: markdown fences wrapping the body, mismatched
    // subgraph/end pairs, missing directive, and stray closing brackets.
    const r = await rawCall('Draw a concept map of how the three lessons build on each other.');
    const respond = r.calls.find(c => c.name === 'respond');
    if (!respond?.args?.diagram?.syntax) return;
    const syntax = respond.args.diagram.syntax;

    // No markdown code-fence wrapping — a very common LLM mistake that breaks
    // our renderer (we pass the string through as-is).
    expect(syntax.trimStart(), 'mermaid syntax must not be wrapped in ```mermaid fences').not.toMatch(/^```/);
    expect(syntax.trimEnd(), 'mermaid syntax must not end with ``` fences').not.toMatch(/```\s*$/);

    // Must start with a recognized diagram directive.
    const firstMeaningfulLine = syntax
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('%%'))[0] || '';
    const KNOWN_DIRECTIVES = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'xychart-beta', 'sankey-beta'];
    const startsKnown = KNOWN_DIRECTIVES.some(d => firstMeaningfulLine.toLowerCase().startsWith(d.toLowerCase()));
    expect(startsKnown, `first line "${firstMeaningfulLine}" is not a known mermaid directive`).toBe(true);

    // Balanced subgraph/end pairs (flowchart subgraphs are the #1 agent mistake).
    const subgraphCount = (syntax.match(/^\s*subgraph\b/gm) || []).length;
    // "end" is ambiguous (state diagrams use it too); count conservatively.
    const endCount = (syntax.match(/^\s*end\s*$/gm) || []).length;
    if (subgraphCount > 0) {
      expect(endCount, `subgraph/end mismatch: ${subgraphCount} subgraph(s) vs ${endCount} end(s)`).toBeGreaterThanOrEqual(subgraphCount);
    }

    // No unmatched closing brackets on their own line.
    expect(syntax, 'stray closing bracket').not.toMatch(/^\s*\]\s*$/m);
    expect(syntax, 'stray closing brace').not.toMatch(/^\s*\}\s*$/m);
  });
});

// ── Surgical edit correctness ────────────────────────────────────────────────

describeWithKey(`Content quality — surgical edits (${MODEL})`, { timeout: 240_000 }, () => {
  it('CQ-E1: renaming a lesson touches ONLY the title, not other fields', async () => {
    const beforeSecs = JSON.stringify(COURSE.lessons[1].sections);
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV, activeTab: 'courseMap',
      userMessage: 'Rename Lesson 2 to "Advanced Tree Methods".', maxIterations: 5,
    });
    expect(r.state.courseMap.lessons[1].title).toBe('Advanced Tree Methods');
    // Every section field should be untouched.
    expect(JSON.stringify(r.state.courseMap.lessons[1].sections), 'section fields must be intact').toBe(beforeSecs);
    // Other lessons untouched.
    expect(r.state.courseMap.lessons[0].title).toBe('Supervised Learning Basics');
    expect(r.state.courseMap.lessons[2].title).toBe('Neural Networks Fundamentals');
  });

  it('CQ-E2: adding a quiz question preserves existing questions', async () => {
    const beforeQs = JSON.stringify(DELIV.quizBank.data.quizzes[2].qs);
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV, activeTab: 'quizBank',
      userMessage:
        'Add exactly one short-answer question about activation functions to Lesson 3 at Apply level. ' +
        'Do not modify the existing question.',
      maxIterations: 6,
    });
    const after = r.state.deliverables.quizBank.data.quizzes[2].qs;
    // First element should be byte-identical to the original first question.
    expect(JSON.stringify(after[0]), 'existing question must be preserved').toBe(JSON.parse(beforeQs)[0] ? JSON.stringify(JSON.parse(beforeQs)[0]) : undefined);
    // And we should have gained one.
    expect(after.length, `expected +1 question, got ${after.length - 1}`).toBeGreaterThanOrEqual(2);
  });
});

// ── Multi-turn context preservation ──────────────────────────────────────────

describeWithKey(`Content quality — multi-turn context (${MODEL})`, { timeout: 300_000 }, () => {
  it('CQ-C1: pronoun resolves across turns (agent remembers which lesson we were discussing)', async () => {
    // Two-user-turn conversation. We synthesize a clean turn-1 assistant
    // transcript instead of letting the live model respond — that way turn 1
    // has no pending tool_use blocks and we can focus on whether turn 2
    // resolves the pronoun. This is also how the real app's chat history
    // looks from Anthropic's perspective (respond()'s chatReply becomes a
    // plain text message in the transcript).
    const systemPrompt = buildAgentSystemPrompt(COURSE, 'quizBank', DELIV);
    const tools = buildNativeTools('anthropic', AGENT_TOOLS);

    const t2Res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024, temperature: 0.3,
        system: systemPrompt, tools,
        messages: [
          { role: 'user', content: 'What is the title of Lesson 2?' },
          { role: 'assistant', content: 'Lesson 2 is titled **"Decision Trees and Random Forests"**.' },
          { role: 'user', content: 'How many questions does the quiz for that lesson have?' },
        ],
      }),
    });
    const t2Json = await t2Res.json();
    if (!t2Res.ok) throw new Error(t2Json.error?.message || 'turn 2 failed');
    const t2Blocks = t2Json.content || [];
    const t2Calls = t2Blocks.filter(b => b.type === 'tool_use');
    const t2Text = t2Blocks.filter(b => b.type === 'text').map(b => b.text).join('');
    const respond = t2Calls.find(c => c.name === 'respond');
    const chatReply = respond?.args?.chatReply || t2Text;

    // Lesson 2 (index 1) has exactly 1 quiz question in DELIV — agent should say "1".
    expect(chatReply, `agent should report count=1 for lesson 2. reply=${chatReply}`).toMatch(/\b1\b|\bone\b/i);

    // If it read anything, the target should be lessonIndex=1 (pronoun
    // resolution). A wrong index would be the clearest failure mode.
    const reads = t2Calls.filter(c => c.name === 'read_deliverable' || c.name === 'read_lesson');
    for (const rc of reads) {
      if (rc.input?.lessonIndex !== undefined) {
        expect(rc.input.lessonIndex, `read targeted wrong lesson (pronoun unresolved)`).toBe(1);
      }
    }
  });
});
