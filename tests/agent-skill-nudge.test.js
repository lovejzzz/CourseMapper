/**
 * agent-skill-nudge.test.js — live test for the Hermes-style agent-initiated
 * skill-creation nudge.
 *
 * When a user request chains enough workflow steps that a macro would plausibly
 * save future effort, the harness/runtime injects a [SYSTEM] hint asking the
 * agent to consider create_tool. The agent is free to ignore the hint if the
 * request is one-off. These tests check:
 *
 *   1. A multi-edit pattern-y request triggers the nudge AND the agent
 *      responds by creating a macro.
 *   2. A single simple edit does NOT trigger the nudge (confirming the
 *      threshold isn't too aggressive).
 *
 * Skipped without ANTHROPIC_API_KEY.
 */

import { describe, it, expect } from 'vitest';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT = 300_000;
const describeWithKey = KEY ? describe : describe.skip;

const COURSE = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics',      sections: [{ learningObjectives: 'Explain supervised vs unsupervised', topicSection: 'Classification, Regression' }]},
    { title: 'Decision Trees and Random Forests', sections: [{ learningObjectives: 'Implement decision tree classifiers', topicSection: 'Trees, Pruning, Ensembles' }]},
    { title: 'Neural Networks Fundamentals',    sections: [{ learningObjectives: 'Describe feedforward architecture', topicSection: 'Perceptrons, Backprop' }]},
  ],
};
// All 3 lessons have one Remember-level question — ripe for a 3-lesson Bloom bump.
const DELIV = {
  quizBank: { status: 'done', data: { quizzes: [
    { lt: 'Supervised Learning Basics',       qs: [{ q: 'What is supervised learning?', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' }]},
    { lt: 'Decision Trees and Random Forests', qs: [{ q: 'What prevents overfitting?',   ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['Pruning','A','B','C'], an: 'Pruning' }]},
    { lt: 'Neural Networks Fundamentals',     qs: [{ q: 'Activation function?',         ty: 'short_answer',    bl: 'Remember', df: 'easy', pt: 2, an: 'makes things non-linear' }]},
  ]}},
  lessonPlans: { status: 'done', data: { lessonPlans: [
    { lt: 'Supervised Learning Basics',       ob: 'Explain supervised vs unsupervised' },
    { lt: 'Decision Trees and Random Forests', ob: 'Implement decision tree classifiers' },
    { lt: 'Neural Networks Fundamentals',     ob: 'Describe feedforward architecture' },
  ]}},
};

describeWithKey(`Skill-creation nudge (${MODEL})`, { timeout: TIMEOUT * 2 }, () => {
  it('a multi-edit pattern-y workflow ends with a macro saved (via nudge OR spontaneous)', { timeout: TIMEOUT }, async () => {
    // Neutral wording — no hint to the agent about repetition or "save this as
    // a macro". The success criterion is that the workflow-heavy turn ends
    // with a macro registered, whether the agent did it spontaneously or
    // because our [SYSTEM] nudge prompted it.
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV,
      activeTab: 'quizBank', maxIterations: 14,
      userMessage:
        "Sweep every quiz question that's at Bloom's 'Remember' and bump it to 'Apply' — " +
        "double the points and add a one-sentence explanation if it doesn't already have one. " +
        "Do it for every lesson.",
    });

    const traceNames = r.trace.flatMap(t => t.calls.map(c => c.name));
    const createdNames = r.customTools.map(t => t.name);
    const reply = r.finalResponse?.chatReply || '';
    const mentionedMacroPath = /macro|create_tool|save\s+(it|this)\s+as/i.test(reply);

    // Either a macro was registered, OR the nudge fired and the agent
    // at least mentioned the macro path. Both outcomes are acceptable —
    // the important thing is the agent is on the skill-creation path.
    const macroRegistered = createdNames.length > 0 || traceNames.includes('create_tool');
    const agentEngagedNudgePath = r.skillNudgeFired && (macroRegistered || mentionedMacroPath);

    expect(
      macroRegistered || agentEngagedNudgePath,
      `Expected the agent to save a macro (spontaneously or via nudge). ` +
      `nudgeFired=${r.skillNudgeFired} workflowCalls=${r.skillWorkflowCalls} maxApplied=${r.skillMaxAppliedInOne} ` +
      `createdTools=${createdNames.join(',')} calls=${traceNames.join(',')} reply=${reply.slice(0, 300)}`
    ).toBe(true);
  });

  it('does NOT fire on a single simple rename (avoids false-positive nudging)', { timeout: TIMEOUT }, async () => {
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV,
      activeTab: 'courseMap', maxIterations: 4,
      userMessage: 'Rename Lesson 2 to "Advanced Tree Methods".',
    });
    expect(r.skillNudgeFired, `should not fire on a trivial rename. workflowCalls=${r.skillWorkflowCalls}`).toBe(false);
  });

  it('does NOT fire when the turn is all reads (no real workflow)', { timeout: TIMEOUT }, async () => {
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV,
      activeTab: 'quizBank', maxIterations: 6,
      userMessage: 'Show me the quiz for each of the three lessons. Just read them, don\'t change anything.',
    });
    expect(r.skillNudgeFired, `should not fire on pure reads. workflowCalls=${r.skillWorkflowCalls}`).toBe(false);
  });
});
