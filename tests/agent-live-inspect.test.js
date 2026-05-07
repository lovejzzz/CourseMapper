/**
 * Live inspection — prints raw agent payloads for human review.
 * Not a real assertion test. Run with: ANTHROPIC_API_KEY=... npx vitest run tests/agent-live-inspect.test.js
 */
import { test } from 'vitest';
import { buildAgentSystemPrompt } from '../src/lib/agentPrompts.js';
import { buildNativeTools } from '../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
const runTest = KEY ? test : test.skip;

const COURSE_MAP = {
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
};

async function call(prompt, activeTab = 'quizBank') {
  const systemPrompt = buildAgentSystemPrompt(COURSE_MAP, activeTab, DELIVERABLES);
  const tools = buildNativeTools('anthropic', AGENT_TOOLS);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      tools,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || JSON.stringify(json));
  const blocks = json.content || [];
  return {
    stop: json.stop_reason,
    text: blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(''),
    calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, args: b.input })),
    usage: json.usage,
  };
}

const SCENARIOS = [
  { tag: '[A] add-question', prompt: 'Add a question about backpropagation to Lesson 3' },
  { tag: '[B] rename-lesson', prompt: 'Rename Lesson 2 to "Tree-Based Learning Methods"', activeTab: 'courseMap' },
  { tag: '[C] bulk-add', prompt: 'Add an Analyze-level short answer question to every lesson in the quiz bank' },
  { tag: '[D] concept-map', prompt: 'Draw a concept map of how the three lessons build on each other' },
  { tag: '[E] factual', prompt: 'What are the titles of the three lessons?' },
  { tag: '[F] ambiguous-typo', prompt: 'Fix the typo in the Lesson 1 quiz' },
  { tag: '[G] nonexistent', prompt: 'Add a new rubric criterion to Lesson 2' },
  { tag: '[H] parallel-reads', prompt: 'Show me the quiz for Lesson 1 AND the lesson plan for Lesson 1' },
  { tag: '[I] alignment', prompt: 'Are the quizzes aligned with lesson plan objectives?' },
  { tag: '[J] greeting', prompt: 'Hey there!' },
  { tag: '[K] course-research', prompt: 'Find me a peer-reviewed paper on bias-variance tradeoff' },
  {
    tag: '[L] long-request',
    prompt:
      'Please redesign lesson 3 so it covers more modern architectures like transformers, make the quiz harder, and rewrite the objectives to Apply level',
  },
];

runTest('inspect', { timeout: 600_000 }, async () => {
  for (const s of SCENARIOS) {
    try {
      const r = await call(s.prompt, s.activeTab);
      console.log(
        `\n${'='.repeat(80)}\n${s.tag}  stop=${r.stop}  in=${r.usage.input_tokens} out=${r.usage.output_tokens}\nUSER: ${s.prompt}`,
      );
      if (r.text) console.log(`TEXT: ${r.text.slice(0, 400)}${r.text.length > 400 ? '…' : ''}`);
      for (const c of r.calls) {
        const argStr = JSON.stringify(c.args);
        console.log(`CALL ${c.name}: ${argStr.length > 900 ? argStr.slice(0, 900) + '…' : argStr}`);
      }
    } catch (err) {
      console.log(`\n${'='.repeat(80)}\n${s.tag}  ERROR: ${err.message}`);
    }
  }
});
