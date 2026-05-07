/**
 * Trace-dumper for multi-turn scenarios. Prints each iteration's tool calls
 * to stdout so a human can read the agent's decision path.
 */
import { describe, it } from 'vitest';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
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

function summarize(r) {
  const lines = [];
  lines.push(
    `iterations=${r.iterations}  loopBroken=${r.loopBroken ? JSON.stringify(r.loopBroken) : 'none'}  customTools=${r.customTools.map((t) => t.name).join(',') || 'none'}`,
  );
  for (const step of r.trace) {
    const calls = step.calls.map((c) => `${c.name}(${summarizeArgs(c.name, c.args)})`).join(' | ');
    const tk = `in=${step.usage?.input_tokens ?? '?'} out=${step.usage?.output_tokens ?? '?'}`;
    lines.push(`  [${step.iter}] ${tk}  ${calls || '(no tool calls)'}`);
  }
  const final = r.finalResponse || {};
  if (final.chatReply)
    lines.push(`  FINAL chatReply: ${final.chatReply.slice(0, 220)}${final.chatReply.length > 220 ? '…' : ''}`);
  if (final.proposal) lines.push(`  FINAL proposal: ${(final.proposal.options || []).length} options`);
  if (final.diagram) lines.push(`  FINAL diagram: ${final.diagram.title}`);
  return lines.join('\n');
}

function summarizeArgs(toolName, args) {
  if (!args) return '';
  if (toolName === 'read_deliverable')
    return `${args.featureId}${args.lessonIndex != null ? `#${args.lessonIndex}` : ''}`;
  if (toolName === 'edit_course_map') return `patches=${args.patches?.length}`;
  if (toolName === 'edit_deliverables') return `actions=${args.actions?.length}`;
  if (toolName === 'compare_deliverables') return `${args.featureA}↔${args.featureB}`;
  if (toolName === 'validate_course') return '';
  if (toolName === 'search_research') return `"${args.query?.slice(0, 40)}"`;
  if (toolName === 'create_tool') return `name="${args.name}" steps=${args.plan?.length}`;
  if (toolName === 'run_tool') return `name="${args.name}"`;
  if (toolName === 'respond') {
    if (args.chatReply) return 'chatReply';
    if (args.proposal) return `proposal(${args.proposal.options?.length || 0})`;
    if (args.diagram) return 'diagram';
    if (args.chart) return 'chart';
    return '?';
  }
  const s = JSON.stringify(args);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}

describeWithKey('Multi-turn TRACE DUMP', { timeout: 600_000 }, () => {
  const scenarios = [
    { tag: 'S1 rename', msg: 'Rename Lesson 2 to "Tree-Based Learning Methods"', activeTab: 'courseMap' },
    {
      tag: 'S2 rewrite',
      msg: 'The first question in Lesson 1 quiz is too easy. Rewrite it at Apply level with four plausible options. Just do it.',
      activeTab: 'quizBank',
    },
    {
      tag: 'S3 bulk',
      msg: 'Add an Analyze-level short answer question to every lesson in the quiz bank. Consider it done.',
      activeTab: 'quizBank',
    },
    { tag: 'S4 missing', msg: 'Add a rubric criterion about code quality to Lesson 2.' },
    {
      tag: 'S5 align',
      msg: 'Are my quizzes aligned with the lesson plan objectives? Check and tell me in plain English.',
      activeTab: 'quizBank',
    },
    {
      tag: 'S6 make-tool',
      msg: "I have a lot of low-Bloom's questions and I'll keep needing to fix them across deliverables in the future. Please CREATE A REUSABLE TOOL called `audit_bloom_floor` that takes a featureId and runs validate_course plus read_deliverable on that feature, so I can re-audit any deliverable later with one call. Then run it on quizBank and tell me what you found. Make sure the tool is registered via create_tool before you call it.",
      activeTab: 'quizBank',
      maxIterations: 12,
    },
  ];

  it('dump all scenarios', async () => {
    for (const s of scenarios) {
      const r = await runMultiTurn({
        apiKey: KEY,
        model: MODEL,
        courseMap: COURSE,
        deliverables: DELIV,
        userMessage: s.msg,
        activeTab: s.activeTab || 'quizBank',
        maxIterations: s.maxIterations || 20,
      });
      console.log(
        `\n${'='.repeat(80)}\n${s.tag}\nUSER: ${s.msg.slice(0, 120)}${s.msg.length > 120 ? '…' : ''}\n${summarize(r)}`,
      );
    }
  });
});
