import { beforeEach, describe, expect, it } from 'vitest';

// Mock localStorage for the journal (vitest node env has no real storage).
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
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
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
import { buildPostGenerationDigest } from '../agentDigest.js';
import { addJournalEntry, buildJournalContext, getJournal, resolveThread } from '../courseJournal.js';
import { AGENT_TOOLS } from '../agentTools.js';
import { executeAction, preValidateAction } from '../agentActions.js';
import { buildAgentSystemPrompt } from '../agentPrompts.js';

const COURSE_MAP = {
  courseName: 'TA Probe Course',
  semester: 'Fall 2026',
  lessons: [
    {
      title: 'Lesson 1: Threat Modeling Foundations',
      sections: [
        {
          learningObjectives: 'Analyze attack surfaces in a small web application.',
          weeklyAssessments: 'Threat model memo 1: attack surface table.',
        },
      ],
    },
  ],
};

function quizDeliverable(bloomsLevel) {
  return {
    status: 'done',
    data: {
      quizzes: [
        {
          lessonTitle: 'Lesson 1: Threat Modeling Foundations',
          questions: [
            { type: 'multiple_choice', bloomsLevel, question: 'Define attack surface.', answer: 'A' },
            { type: 'multiple_choice', bloomsLevel, question: 'List the STRIDE categories.', answer: 'B' },
          ],
        },
      ],
    },
  };
}

describe('buildPostGenerationDigest', () => {
  it('flags all-recall quizzes with observe-only prompts', () => {
    const digest = buildPostGenerationDigest({
      courseMap: COURSE_MAP,
      deliverables: { quizBank: quizDeliverable('Remember') },
    });
    expect(digest).not.toBeNull();
    const blooms = digest.observations.find((entry) => entry.id === 'blooms-flat');
    expect(blooms).toBeTruthy();
    expect(blooms.prompts.length).toBeGreaterThan(0);
    // Non-leading contract: observations carry prompts (conversation starters),
    // never executable actions.
    for (const entry of digest.observations) {
      expect(entry.action).toBeUndefined();
      expect(entry.actions).toBeUndefined();
    }
  });

  it('stays silent on a clean package', () => {
    const digest = buildPostGenerationDigest({
      courseMap: COURSE_MAP,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Threat Modeling Foundations',
                questions: [
                  {
                    type: 'multiple_choice',
                    bloomsLevel: 'Analyze',
                    question: 'Analyze the attack surfaces in the sample web application and pick the riskiest.',
                    answer: 'A',
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(digest).toBeNull();
  });

  it('recognizes a lesson-local morphological objective echo instead of warning falsely', () => {
    const digest = buildPostGenerationDigest({
      courseMap: {
        courseName: 'Interval Evidence Studio',
        lessons: [
          {
            title: 'Lesson 1: Inclusive Counting',
            sections: [{ learningObjectives: 'Count intervals inclusively.' }],
          },
        ],
      },
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Inclusive Counting',
                questions: [
                  {
                    type: 'multiple_choice',
                    bloomsLevel: 'Apply',
                    question: 'Apply inclusive letter-name counting to C4–E-flat4 and classify the interval.',
                    answer: 'A minor third.',
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(digest?.observations || []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'coverage-l1' })]),
    );
  });

  it('caps observations at three', () => {
    const noisy = {
      status: 'done',
      data: {
        quizzes: [
          {
            lessonTitle: 'L1',
            questions: [
              {
                type: 'multiple_choice',
                bloomsLevel: 'Remember',
                question: 'Explains a Energy decision in.',
                answer: 'A',
              },
            ],
          },
        ],
      },
    };
    const digest = buildPostGenerationDigest({
      courseMap: COURSE_MAP,
      deliverables: { quizBank: noisy, studyGuides: noisy, lessonPlans: noisy, rubrics: noisy },
    });
    expect(digest.observations.length).toBeLessThanOrEqual(3);
  });
});

describe('courseJournal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records decisions with rationale and surfaces them in the prompt context', () => {
    addJournalEntry('TA Probe Course', {
      kind: 'decision',
      text: 'Week 3 goes case-based',
      rationale: 'cohort is practitioners',
    });
    const context = buildJournalContext('TA Probe Course');
    expect(context).toContain('Week 3 goes case-based');
    expect(context).toContain('because cohort is practitioners');
  });

  it('tracks open threads until resolved', () => {
    addJournalEntry('TA Probe Course', { kind: 'thread', text: 'revisit rubric weights' });
    expect(buildJournalContext('TA Probe Course')).toContain('open thread: revisit rubric weights');
    expect(resolveThread('TA Probe Course', 'rubric weights')).toBe(true);
    expect(buildJournalContext('TA Probe Course')).not.toContain('open thread');
    expect(getJournal('TA Probe Course').find((entry) => entry.kind === 'thread').status).toBe('closed');
  });

  it('log_decision tool records and resolves through the journal', async () => {
    const ctx = { courseMap: COURSE_MAP };
    const recorded = await AGENT_TOOLS.log_decision.execute(
      { text: 'quizzes stay at 6 questions', kind: 'decision', rationale: 'exam fatigue' },
      ctx,
    );
    expect(recorded.recorded).toBe('decision');
    await AGENT_TOOLS.log_decision.execute({ text: 'tighten lesson 2 rubric', kind: 'thread' }, ctx);
    const resolved = await AGENT_TOOLS.log_decision.execute({ text: 'lesson 2 rubric', resolve: true }, ctx);
    expect(resolved.resolved).toBe(true);
  });

  it('journal context appears in the dynamic agent prompt', () => {
    addJournalEntry('TA Probe Course', { kind: 'thread', text: 'revisit rubric weights' });
    const prompt = buildAgentSystemPrompt(COURSE_MAP, 'quizBank', {});
    expect(prompt).toContain('Course journal');
    expect(prompt).toContain('revisit rubric weights');
  });
});

describe('replaceItem (author-grade editing)', () => {
  function makeCtx() {
    const updates = [];
    return {
      updates,
      ctx: {
        deliverables: {
          quizBank: {
            status: 'done',
            data: {
              quizzes: [
                {
                  lessonTitle: 'L1',
                  blueprintGrounding: { sourceRowLabel: 'Lesson 1' },
                  questions: [
                    { type: 'multiple_choice', question: 'Old question?', answer: 'A' },
                    { type: 'multiple_choice', question: 'Keep me.', answer: 'B' },
                  ],
                },
              ],
            },
          },
        },
        optimisticUpdate: (featureId, data) => updates.push({ featureId, data }),
        snapshot: () => {},
      },
    };
  }

  it('replaces a sub-item in place', () => {
    const { ctx, updates } = makeCtx();
    const result = executeAction(
      {
        type: 'replaceItem',
        featureId: 'quizBank',
        lessonIndex: 0,
        itemIndex: 0,
        item: { type: 'multiple_choice', question: 'New, sharper question?', answer: 'C' },
      },
      ctx,
    );
    expect(result.success).toBe(true);
    const questions = updates[0].data.quizzes[0].questions;
    expect(questions[0].question).toBe('New, sharper question?');
    expect(questions[1].question).toBe('Keep me.');
  });

  it('preserves internal compiler records when replacing a whole lesson item', () => {
    const { ctx, updates } = makeCtx();
    const result = executeAction(
      {
        type: 'replaceItem',
        featureId: 'quizBank',
        lessonIndex: 0,
        item: { lessonTitle: 'L1 rewritten', questions: [] },
      },
      ctx,
    );
    expect(result.success).toBe(true);
    const lesson = updates[0].data.quizzes[0];
    expect(lesson.lessonTitle).toBe('L1 rewritten');
    expect(lesson.blueprintGrounding).toEqual({ sourceRowLabel: 'Lesson 1' });
  });

  it('preValidateAction requires a replacement payload', () => {
    const { ctx } = makeCtx();
    const invalid = preValidateAction({ type: 'replaceItem', featureId: 'quizBank', lessonIndex: 0 }, ctx);
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toMatch(/item object/);
  });
});

describe('trace_objective', () => {
  it('reports the chain and names the gap honestly', async () => {
    const ctx = {
      courseMap: COURSE_MAP,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lessonTitle: 'Lesson 1: Threat Modeling Foundations',
                questions: [
                  {
                    type: 'multiple_choice',
                    question: 'Which attack surfaces does the sample web application expose?',
                    answer: 'A',
                  },
                ],
              },
            ],
          },
        },
        rubrics: {
          status: 'done',
          data: { rubrics: [{ lessonTitle: 'L1', criteria: [{ criterionName: 'Citation hygiene' }] }] },
        },
      },
    };
    const result = await AGENT_TOOLS.trace_objective.execute(
      { objective: 'Analyze attack surfaces in a small web application' },
      ctx,
    );
    expect(result.chain.quizBank).toBeTruthy();
    expect(result.gaps).toContain('rubrics');
    expect(result.note).toMatch(/chain breaks/);
  });
});
