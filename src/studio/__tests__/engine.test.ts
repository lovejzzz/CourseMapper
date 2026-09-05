import { describe, it, expect } from 'vitest';
import { buildCourse } from '../engine';
import { createCourse, type Course, type Plan } from '../domain';
import type { Inference, InferenceResult } from '../scion';
import { validateReview } from '../pedagogy';

// Small synthetic responses test orchestration, not educational quality.
const numeric = { datasets: [], calculations: [] };
const material = { kind: 'fictional', text: 'Fictional notice: the reading room closes at eight.' };
const teaching = {
  preparation: 'Paper and the included notice.',
  explanation: 'A notice states a rule; an inference goes beyond its wording.',
  workedExample: {
    material,
    prompt: 'What closing time does the notice state?',
    steps: ['Locate the closing rule.', 'The rule names eight as the closing time.'],
    answer: 'The room closes at eight.',
    evidence: [],
    ...numeric,
  },
  debrief: 'Ask whether this notice tells us when the room opens. It does not.',
  exitTicket: {
    prompt: 'Does the notice give an opening time?',
    answer: 'No opening time is given.',
    nextLessonDecision: 'If a learner invents a time, return to what the notice actually states.',
    ...numeric,
  },
};
function activity(kind: string) {
  return {
    title: `${kind} reading`,
    material,
    ...numeric,
    prompt:
      kind === 'guided'
        ? 'Name one rule from the notice and explain which words establish it.'
        : 'Can you establish an opening time from the notice? Explain the limit.',
    product: 'A statement and its textual basis.',
    hint: 'Separate stated words from missing information.',
    answerParts: [
      {
        title: 'Response',
        text:
          kind === 'guided'
            ? 'The room closes at eight, as the notice explicitly states.'
            : 'The opening time is unknown because the notice gives only a closing time.',
        length: null,
      },
    ],
    reasoning: ['Locate the explicit time statement.', 'Do not fill missing information with a guess.'],
    feedback: [
      {
        error: 'Invents an opening time.',
        diagnosis: 'Treats an assumption as a record.',
        nextStep: 'Point to the words supporting that opening time.',
      },
      {
        error: 'Omits a reason.',
        diagnosis: 'Gives a conclusion without showing its basis.',
        nextStep: 'Add the specific words that justify the statement.',
      },
    ],
    rubric: ['Textual support', 'Limitations'].map((criterion) => ({
      criterion,
      points: 2,
      fullCredit: 'Shows the relevant words and respects what is missing.',
      partialCredit: 'Gives a defensible response without locating the words.',
      noCredit: 'Adds unsupported information.',
    })),
    evidence: [],
  };
}
const plan = {
  title: 'Reading carefully',
  overview: 'Distinguish explicit rules from assumptions.',
  prerequisites: 'Read a short notice.',
  finalProduct: 'A statement with its evidential limit.',
  goals: ['Find explicit information.', 'Identify what is unknown.'],
  lessons: [0, 1].map((i) => ({
    title: `Reading ${i + 1}`,
    objective: 'Separate a recorded rule from an assumption.',
    scope: 'Use a fictional notice to produce a supported statement.',
    goalIndices: [i],
    sourceIds: [],
    buildsOn: i ? [0] : [],
    practice: {
      demonstration: 'Read an explicit closing time from a short notice.',
      guided: 'Use a sentence frame to identify an explicit rule.',
      independent: 'Identify missing information and justify the limit without a frame.',
      change: 'Move from extracting an explicit statement to identifying an unsupported inference.',
    },
  })),
};
const initial = () =>
  createCourse(
    {
      description: 'Teach careful reading with explicit information and missing details.',
      audience: 'Adult educators',
      language: 'en',
      lessonCount: 2,
      minutesPerLesson: 50,
      allowFictional: true,
    },
    [],
  );
const response = (value: unknown): InferenceResult => ({
  text: JSON.stringify(value),
  finishReason: 'stop',
  inputTokens: 10,
  outputTokens: 10,
  elapsedMs: 1,
  model: 'synthetic-test-only',
  route: 'server',
});

describe('course engine checkpoints and repairs', () => {
  it('keeps readings available when a plan omits a source ID and gives each author only its own phase design', async () => {
    const course = initial();
    course.sources = {
      mentioned: {
        id: 'mentioned',
        title: 'First record',
        text: 'The first record states eight.',
        kind: 'provided',
        version: 1,
      },
      omitted: {
        id: 'omitted',
        title: 'Second record',
        text: 'Exact omitted-source fact: C21 has a paper repair.',
        kind: 'provided',
        version: 1,
      },
    };
    const mappedPlan: Plan = structuredClone(plan);
    mappedPlan.lessons[0].sourceIds = ['mentioned'];
    mappedPlan.lessons[0].practice!.guided = 'GUIDED_DESIGN_SENTINEL';
    mappedPlan.lessons[0].practice!.independent = 'INDEPENDENT_DESIGN_SENTINEL';
    const prompts: string[] = [];
    await expect(
      buildCourse(course, {
        checkpoint: async () => {},
        inference: {
          complete: async (request) => {
            prompts.push(request.prompt);
            if (prompts.length <= 2) return response(mappedPlan);
            if (prompts.length === 3) return response(teaching);
            throw new Error('probe complete');
          },
        },
      }),
    ).rejects.toThrow('probe complete');
    expect(prompts[1]).toContain('Exact omitted-source fact: C21 has a paper repair.');
    expect(prompts[2]).not.toContain('GUIDED_DESIGN_SENTINEL');
    expect(prompts[3]).toContain('GUIDED_DESIGN_SENTINEL');
    expect(prompts[3]).not.toContain('INDEPENDENT_DESIGN_SENTINEL');
  });
  it('resumes after a guided task without regenerating its teaching, plan or already accepted activity', async () => {
    let saved: Course = initial();
    const controller = new AbortController();
    const responses = [
      plan,
      plan,
      teaching,
      activity('guided'),
      activity('independent'),
      { issues: [] },
      teaching,
      activity('guided'),
      activity('independent'),
      { issues: [] },
    ];
    let calls = 0;
    const inference: Inference = { complete: async () => response(responses[calls++]) };
    await expect(
      buildCourse(saved, {
        inference,
        signal: controller.signal,
        async checkpoint(course) {
          saved = course;
          if (Object.values(course.drafts).some((d) => d.activities.length === 1)) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(4);
    expect(saved.status).toBe('paused');
    const ids = [...saved.planLessonIds];
    const accepted = structuredClone(saved.drafts[ids[0]].activities[0]);
    const complete = await buildCourse(saved, {
      inference,
      async checkpoint(course) {
        saved = course;
      },
    });
    expect(calls).toBe(10);
    expect(complete.planLessonIds).toEqual(ids);
    expect(complete.lessons[ids[0]].activities[0]).toMatchObject(accepted);
    expect(complete.status).toBe('review');
    expect(complete.runs).toHaveLength(10);
    expect(
      validateReview(
        [
          {
            component: 'guided',
            quote: 'A quote the author never wrote.',
            explanation: 'Test',
            sourceIds: ['invented-source'],
            correction: 'Test',
          },
        ],
        complete.lessons[ids[0]],
        complete,
      ),
    ).toHaveLength(2);
  });
  it('retains truncated raw responses and pauses after a bounded number of repairs', async () => {
    let saved = initial();
    let calls = 0;
    await expect(
      buildCourse(saved, {
        inference: {
          complete: async () => {
            calls++;
            return { ...response(plan), finishReason: 'length' };
          },
        },
        async checkpoint(course) {
          saved = course;
        },
      }),
    ).rejects.toThrow('bounded repair');
    expect(calls).toBe(3);
    expect(saved.runs).toHaveLength(3);
    expect(saved.runs.every((r) => r.raw === JSON.stringify(plan) && r.issues.length > 0)).toBe(true);
    expect(saved.plan).toBeNull();
    expect(saved.status).toBe('paused');
  });
  it('limits pedagogical rewrites to one round and preserves unresolved advice for the instructor', async () => {
    const finding = {
      component: 'guided',
      quote: 'Name one rule from the notice and explain which words establish it.',
      explanation: 'The scaffold could be more explicit.',
      sourceIds: [],
      correction: 'Give a useful starting question.',
    };
    const candidate = {
      passageId: `author:guided:prompt@1:0-${finding.quote.length}`,
      explanation: finding.explanation,
      sourceIds: [],
      correction: finding.correction,
    };
    const responses = [
      plan,
      plan,
      teaching,
      activity('guided'),
      activity('independent'),
      { issues: [candidate] },
      activity('guided'),
      activity('independent'),
      { issues: [candidate] },
      teaching,
      activity('guided'),
      activity('independent'),
      { issues: [] },
    ];
    let calls = 0;
    const result = await buildCourse(initial(), {
      inference: {
        complete: async (request) => {
          const value = responses[calls++];
          if ('issues' in value && value.issues.length) {
            const passages = JSON.parse(request.prompt.split('DRAFT PASSAGES: ')[1]) as {
              text: string;
              passageId: string;
            }[];
            return response({
              issues: [
                { ...candidate, passageId: passages.find((passage) => passage.text === finding.quote)!.passageId },
              ],
            });
          }
          return response(value);
        },
      },
      checkpoint: async () => {},
    });
    expect(calls).toBe(13);
    const first = result.lessons[result.planLessonIds[0]];
    expect(first.pedagogy).toMatchObject({ round: 1, complete: true, issues: [finding] });
    expect(first.review).toBe('pending');
    expect(result.edits).toHaveLength(1);
  });
});
