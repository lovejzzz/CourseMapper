import { describe, expect, it } from 'vitest';
import {
  AGENT_CONFIRMATION_OUTCOMES,
  buildConfirmationPolicyToolResult,
  evaluateAgentMutationConfirmation,
  hasExplicitAgentMutationConfirmation,
  isBroadRewriteRequest,
} from '../agentConfirmationPolicy.js';

function baseCtx(overrides = {}) {
  return {
    userMessage: 'Rename Lesson 2 to Tool Safety Lab',
    courseMap: {
      lessons: [
        { title: 'Foundations', sections: [{ learningObjectives: 'Define reliability' }] },
        { title: 'Tool Use', sections: [{ learningObjectives: 'Use tools safely' }] },
        { title: 'Recovery', sections: [{ learningObjectives: 'Recover safely' }] },
      ],
    },
    deliverables: {
      assignments: {
        status: 'done',
        data: { assignments: [{ t: 'Reliability memo', ov: 'Explain reliability.' }] },
      },
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            { lt: 'Foundations', qs: [{ q: 'What is reliability?' }] },
            { lt: 'Tool Use', qs: [{ q: 'What should validation prevent?' }] },
          ],
        },
      },
      rubrics: {
        status: 'done',
        data: { rubrics: [{ lt: 'Foundations', cr: [{ cn: 'Accuracy' }] }] },
      },
      slideDecks: {
        status: 'done',
        data: { decks: [{ lessonTitle: 'Foundations', slides: [{ title: 'Reliability' }] }] },
      },
    },
    ...overrides,
  };
}

function expectAllowed(decision) {
  expect(decision).toMatchObject({
    outcome: AGENT_CONFIRMATION_OUTCOMES.ALLOW,
    allowed: true,
    requiresConfirmation: false,
  });
  expect(buildConfirmationPolicyToolResult(decision)).toBeNull();
}

function expectAsk(decision) {
  expect(decision).toMatchObject({
    outcome: AGENT_CONFIRMATION_OUTCOMES.ASK,
    allowed: false,
    requiresConfirmation: true,
  });
  expect(buildConfirmationPolicyToolResult(decision)).toMatchObject({
    requiresConfirmation: true,
    refused: false,
    confirmationPolicy: expect.objectContaining({ outcome: AGENT_CONFIRMATION_OUTCOMES.ASK }),
  });
}

function expectRefuse(decision) {
  expect(decision).toMatchObject({
    outcome: AGENT_CONFIRMATION_OUTCOMES.REFUSE,
    allowed: false,
    requiresConfirmation: false,
    refused: true,
  });
  expect(buildConfirmationPolicyToolResult(decision)).toMatchObject({
    requiresConfirmation: false,
    refused: true,
    confirmationPolicy: expect.objectContaining({ outcome: AGENT_CONFIRMATION_OUTCOMES.REFUSE }),
  });
}

describe('agent confirmation policy', () => {
  it('recognizes explicit confirmation wording', () => {
    expect(hasExplicitAgentMutationConfirmation('Yes, delete Lesson 2')).toBe(true);
    expect(hasExplicitAgentMutationConfirmation('Go ahead and apply the changes')).toBe(true);
    expect(hasExplicitAgentMutationConfirmation('Please delete Lesson 2')).toBe(false);
  });

  it('recognizes broad rewrite language', () => {
    expect(isBroadRewriteRequest('Rewrite the entire course from scratch')).toBe(true);
    expect(isBroadRewriteRequest('Rename Lesson 2')).toBe(false);
  });

  it('allows safe targeted course-map edits', () => {
    expectAllowed(
      evaluateAgentMutationConfirmation(
        'edit_course_map',
        { patches: [{ lessonIndex: 1, field: 'title', value: 'Tool Safety Lab' }] },
        baseCtx(),
      ),
    );
  });

  it('asks before deleting a lesson unless the user confirmed', () => {
    const args = { patches: [{ action: 'removeLesson', lessonIndex: 1 }] };

    expectAsk(evaluateAgentMutationConfirmation('edit_course_map', args, baseCtx({ userMessage: 'Delete Lesson 2' })));
    expectAllowed(
      evaluateAgentMutationConfirmation('edit_course_map', args, baseCtx({ userMessage: 'Yes, delete Lesson 2' })),
    );
  });

  it('asks before ambiguous course-map mutations', () => {
    const decision = evaluateAgentMutationConfirmation(
      'edit_course_map',
      { patches: [{ field: 'title', value: 'Missing target' }] },
      baseCtx(),
    );

    expectAsk(decision);
    expect(decision.issues[0]).toContain('lessonIndex');
  });

  it('asks before broad course-map rewrites', () => {
    const patches = Array.from({ length: 7 }, (_, lessonIndex) => ({
      lessonIndex,
      field: 'learningObjectives',
      value: `Rewrite objective ${lessonIndex + 1}`,
    }));

    expectAsk(
      evaluateAgentMutationConfirmation(
        'edit_course_map',
        { patches },
        baseCtx({ userMessage: 'Rewrite the whole course' }),
      ),
    );
  });

  it('allows safe targeted deliverable edits and additions', () => {
    expectAllowed(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              lessonIndex: 0,
              path: ['quizzes', 0, 'qs', 0, 'q'],
              value: 'What proves the verifier ran?',
            },
          ],
        },
        baseCtx(),
      ),
    );

    expectAllowed(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        {
          actions: [
            {
              type: 'editItem',
              featureId: 'assignments',
              path: 'assignments.0.title',
              value: 'Evidence-backed recovery memo',
            },
          ],
        },
        baseCtx(),
      ),
    );

    expectAllowed(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        { actions: [{ type: 'addItem', featureId: 'assignments', item: { t: 'Recovery memo' } }] },
        baseCtx(),
      ),
    );
  });

  it('asks before ambiguous per-lesson deliverable additions', () => {
    const decision = evaluateAgentMutationConfirmation(
      'edit_deliverables',
      { actions: [{ type: 'addItem', featureId: 'quizBank', item: { q: 'Missing lesson target' } }] },
      baseCtx(),
    );

    expectAsk(decision);
    expect(decision.issues[0]).toContain('lessonIndex');
  });

  it('asks instead of throwing when an edit path is missing', () => {
    const decision = evaluateAgentMutationConfirmation(
      'edit_deliverables',
      {
        actions: [{ type: 'editItem', featureId: 'assignments', value: 'Missing target' }],
      },
      baseCtx(),
    );

    expectAsk(decision);
    expect(decision.issues[0]).toContain('path');
  });

  it('asks before deliverable removal, regeneration, and root overwrites', () => {
    expectAsk(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        { actions: [{ type: 'removeItem', featureId: 'assignments', itemIndex: 0 }] },
        baseCtx({ userMessage: 'Remove the assignment' }),
      ),
    );

    expectAsk(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        { actions: [{ type: 'regenerateLesson', featureId: 'quizBank', lessonIndex: 0 }] },
        baseCtx({ userMessage: 'Regenerate Lesson 1 quiz' }),
      ),
    );

    expectAsk(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        { actions: [{ type: 'editItem', featureId: 'assignments', path: ['assignments'], value: [] }] },
        baseCtx({ userMessage: 'Overwrite assignments' }),
      ),
    );
  });

  it('allows confirmed destructive deliverable changes', () => {
    expectAllowed(
      evaluateAgentMutationConfirmation(
        'edit_deliverables',
        { actions: [{ type: 'removeItem', featureId: 'assignments', itemIndex: 0 }] },
        baseCtx({ userMessage: 'I confirm, remove the assignment' }),
      ),
    );
  });

  it('refuses missing or unavailable deliverables instead of asking to create ghosts', () => {
    const missingDecision = evaluateAgentMutationConfirmation(
      'edit_deliverables',
      { actions: [{ type: 'addItem', featureId: 'courseFaq', lessonIndex: 0, item: { q: 'Ghost FAQ' } }] },
      baseCtx(),
    );
    expectRefuse(missingDecision);
    expect(missingDecision.reason).toContain('ghost artifact');

    const loadingDecision = evaluateAgentMutationConfirmation(
      'edit_deliverables',
      { actions: [{ type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Too soon' } }] },
      baseCtx({
        deliverables: {
          ...baseCtx().deliverables,
          rubrics: { status: 'loading', data: null },
        },
      }),
    );
    expectRefuse(loadingDecision);
  });

  it('asks before forced slide image overwrites but allows normal image generation', () => {
    expectAllowed(evaluateAgentMutationConfirmation('generate_slide_images', { lessonIndex: 0 }, baseCtx()));
    expectAsk(
      evaluateAgentMutationConfirmation(
        'generate_slide_images',
        { lessonIndex: 0, force: true },
        baseCtx({ userMessage: 'Regenerate the first slide image' }),
      ),
    );
    expectAllowed(
      evaluateAgentMutationConfirmation(
        'generate_slide_images',
        { lessonIndex: 0, force: true },
        baseCtx({ userMessage: 'Go ahead and regenerate the first slide image' }),
      ),
    );
  });

  it('does not gate read-only or unrelated tools', () => {
    expectAllowed(evaluateAgentMutationConfirmation('read_deliverable', { featureId: 'quizBank' }, baseCtx()));
  });
});
