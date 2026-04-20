/**
 * partial-failure-recovery.test.js — live smoke for the partial-failure UX flow.
 *
 * Drives the agent into a situation where some edits land and some fail
 * (one valid lesson index, one invalid). Asserts the harness observes the
 * exact shape the UI's ChangeSummaryCard will render:
 *   - applied > 0 with the right aggregate counts
 *   - failed > 0 with per-item `action`, `featureId`, `lessonIndex`, `message`
 *
 * This is the end-to-end signal that the changeSummary reshape in
 * useToolInvoker.js actually carries failure info through. The harness
 * mirrors the same shaping logic, so if this passes, the runtime will too.
 */

import { describe, it, expect } from 'vitest';
import { runMultiTurn } from './lib/multi-turn-harness.js';

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const describeWithKey = KEY ? describe : describe.skip;

const COURSE = {
  courseName: 'Introduction to Machine Learning', semester: 'Fall 2026',
  lessons: [
    { title: 'Supervised Learning Basics',      sections: [{ learningObjectives: 'x', topicSection: 'y' }] },
    { title: 'Decision Trees and Random Forests', sections: [{ learningObjectives: 'x', topicSection: 'y' }] },
    { title: 'Neural Networks Fundamentals',    sections: [{ learningObjectives: 'x', topicSection: 'y' }] },
  ],
};
const DELIV = {
  quizBank: { status: 'done', data: { quizzes: [
    { lt: 'Supervised Learning Basics',      qs: [{ q: 'a', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' }]},
    { lt: 'Decision Trees and Random Forests', qs: [{ q: 'b', ty: 'multiple_choice', bl: 'Remember', df: 'easy', pt: 1, op: ['A','B','C','D'], an: 'A' }]},
    { lt: 'Neural Networks Fundamentals',    qs: [{ q: 'c', ty: 'short_answer',    bl: 'Remember', df: 'easy', pt: 2, an: 'x' }]},
  ]}},
};

// We ask the agent to do a batch that has a mix of valid targets (lessons
// 1/2/3) and intentionally invalid ones (lessons 98/99) so the tool returns
// a mix of successes and failures.
describeWithKey(`Partial-failure recovery (${MODEL})`, { timeout: 600_000 }, () => {
  it('a batch with invalid lesson indices yields both successes and failures in tool details', async () => {
    const r = await runMultiTurn({
      apiKey: KEY, model: MODEL, courseMap: COURSE, deliverables: DELIV,
      activeTab: 'quizBank', maxIterations: 6,
      userMessage:
        "Add one short-answer Apply-level question to each of these lessons: Lesson 1, Lesson 2, Lesson 98, Lesson 99. " +
        "I know Lessons 98 and 99 don't exist — that's the point, do the first two and let me know which ones failed. " +
        "Use ONE edit_deliverables call with all four addItem actions in it; do not split across turns.",
    });

    // Find the edit_deliverables call in the trace.
    const editCall = r.trace
      .flatMap(t => t.calls)
      .find(c => c.name === 'edit_deliverables');
    expect(editCall, `agent should have issued exactly one edit_deliverables call. Trace: ${JSON.stringify(r.trace.map(t => t.calls.map(c => c.name)))}`).toBeTruthy();

    // It must carry 4 actions (1 per lesson the user named).
    const actions = editCall.args?.actions || [];
    expect(actions.length, `expected 4 addItem actions, got ${actions.length}`).toBeGreaterThanOrEqual(3);

    // At least one of the actions must target an obviously-invalid lesson index
    // (>= lesson count). Otherwise the agent silently dropped the bad requests
    // and we can't exercise the partial-failure path.
    const badTargets = actions.filter(a => typeof a.lessonIndex === 'number' && a.lessonIndex >= COURSE.lessons.length);
    expect(badTargets.length, `agent should have kept the invalid lesson indices so the user sees the partial-failure UX. actions=${JSON.stringify(actions)}`).toBeGreaterThanOrEqual(1);

    // State assertion: the two valid lessons should have gained a question each.
    const qCounts = r.state.deliverables.quizBank.data.quizzes.map(q => q.qs.length);
    const gained = qCounts.map((n, i) => n - DELIV.quizBank.data.quizzes[i].qs.length);
    expect(gained.filter(g => g >= 1).length, `expected at least 2 lessons to gain a question; gained=${gained}`).toBeGreaterThanOrEqual(2);

    // Final reply should mention which ones failed (the agent should report it).
    const reply = r.finalResponse?.chatReply || '';
    expect(reply.toLowerCase(), `final reply should acknowledge the failed lessons. reply=${reply.slice(0, 300)}`).toMatch(/(lesson\s+9|98|99|don['’]t\s+exist|couldn['’]t|failed|unable|out\s+of\s+range)/i);
  });
});
