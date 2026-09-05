import { describe, expect, it } from 'vitest';
import {
  resolveProposalArrayKey,
  resolveProposalEditPath,
  resolveProposalRemovedItem,
  resolveProposalReplacementItem,
} from '../useProposalHandler.js';
import { executeAction } from '../../../lib/agentActions.js';

describe('resolveProposalArrayKey', () => {
  it('uses canonical-first array-valid authority for known deliverables', () => {
    expect(
      resolveProposalArrayKey('quizBank', {
        metadata: ['not deliverable content'],
        quizBank: [{ lessonTitle: 'Canonical quiz' }],
        quizzes: [{ lessonTitle: 'Stale quiz' }],
      }),
    ).toBe('quizBank');

    expect(
      resolveProposalArrayKey('lessonPlans', {
        lessonPlans: { malformed: true },
        lessons: [{ lessonTitle: 'Valid alias' }],
      }),
    ).toBe('lessons');
  });

  it('does not guess an unrelated first array for a known deliverable', () => {
    expect(resolveProposalArrayKey('slideDecks', { metadata: ['not decks'] })).toBeNull();
  });

  it('retains generic first-array discovery for custom deliverables', () => {
    expect(resolveProposalArrayKey('custom_labPacket', { packets: [{ title: 'Lab packet' }] })).toBe('packets');
  });
});

describe('resolveProposalEditPath', () => {
  it('rewrites present stale and canonical roots to rendered authority', () => {
    const data = {
      quizBank: [{ questions: [{ question: 'Canonical' }] }],
      quizzes: [{ questions: [{ question: 'Stale' }] }],
    };

    expect(resolveProposalEditPath('quizBank', data, ['quizzes', 0, 'questions', 0, 'question'])[0]).toBe('quizBank');
    expect(resolveProposalEditPath('quizBank', data, ['quizBank', 0, 'questions', 0, 'question'])[0]).toBe('quizBank');
  });

  it('recovers from malformed canonical data and rejects a missing known root', () => {
    expect(
      resolveProposalEditPath('quizBank', { quizBank: { malformed: true }, quizzes: [{ questions: [] }] }, [
        'quizBank',
        0,
        'questions',
      ])[0],
    ).toBe('quizzes');
    expect(resolveProposalEditPath('quizBank', { metadata: [] }, ['quizzes', 0])).toBeNull();
  });
});

describe('resolveProposalReplacementItem', () => {
  it('previews the declared quiz sub-array instead of an earlier metadata array', () => {
    const data = { quizBank: [{ metadata: ['receipt'], questions: [{ question: 'Actual old question' }] }] };

    expect(resolveProposalReplacementItem('quizBank', data, 0, 0)).toEqual({
      question: 'Actual old question',
    });
  });

  it('fails closed when the declared sub-array is absent', () => {
    expect(resolveProposalReplacementItem('quizBank', { quizBank: [{ metadata: ['receipt'] }] }, 0, 0)).toBeNull();
  });

  it('previews exactly the canonical quiz item that execution replaces', () => {
    const canonicalQuestion = { question: 'Actual old question' };
    const staleQuizzes = [{ questions: [{ question: 'Stale question' }] }];
    const data = {
      quizBank: [{ metadata: ['receipt'], questions: [canonicalQuestion] }],
      quizzes: staleQuizzes,
    };
    const previewed = resolveProposalReplacementItem('quizBank', data, 0, 0);
    let updated;

    const result = executeAction(
      {
        type: 'replaceItem',
        featureId: 'quizBank',
        lessonIndex: 0,
        itemIndex: 0,
        item: { question: 'Replacement question' },
      },
      {
        deliverables: { quizBank: { status: 'done', data } },
        optimisticUpdate: (_featureId, nextData) => {
          updated = nextData;
        },
      },
    );

    expect(previewed).toBe(canonicalQuestion);
    expect(result.success).toBe(true);
    expect(updated.quizBank[0].questions[0].question).toBe('Replacement question');
    expect(updated.quizzes).toEqual(staleQuizzes);
  });

  it('previews and replaces a flat assignment when both assessment coordinates are present', () => {
    const assignment = { title: 'Old brief', assessmentId: 'A1.1', sourceGrounding: { source: 'compiler' } };
    const data = { assignments: [assignment] };
    const previewed = resolveProposalReplacementItem('assignments', data, 0, 0);
    let updated;

    const result = executeAction(
      {
        type: 'replaceItem',
        featureId: 'assignments',
        lessonIndex: 0,
        itemIndex: 0,
        item: { title: 'Replacement brief' },
      },
      {
        deliverables: { assignments: { status: 'done', data } },
        optimisticUpdate: (_featureId, nextData) => {
          updated = nextData;
        },
      },
    );

    expect(previewed).toBe(assignment);
    expect(result.success).toBe(true);
    expect(updated.assignments[0]).toEqual({
      title: 'Replacement brief',
      sourceGrounding: { source: 'compiler' },
    });
  });

  it('fails closed when flat-assignment coordinates disagree', () => {
    const data = { assignments: [{ title: 'First' }, { title: 'Second' }] };
    expect(resolveProposalReplacementItem('assignments', data, 0, 1)).toBeNull();
  });
});

describe('resolveProposalRemovedItem', () => {
  it('previews the canonical quiz question that removal targets, not earlier metadata or a stale alias', () => {
    const canonicalQuestion = { question: 'Actual question' };
    const data = {
      quizBank: [{ metadata: ['receipt'], questions: [canonicalQuestion] }],
      quizzes: [{ questions: [{ question: 'Stale question' }] }],
    };

    expect(resolveProposalRemovedItem('quizBank', data, 0, 0)).toBe(canonicalQuestion);
  });

  it('previews flat assignment removal by item index', () => {
    const assignment = { title: 'Policy memo' };
    expect(resolveProposalRemovedItem('assignments', { assignments: [assignment] }, undefined, 0)).toBe(assignment);
  });

  it('fails closed when the declared sub-array is absent', () => {
    expect(resolveProposalRemovedItem('quizBank', { quizBank: [{ metadata: ['receipt'] }] }, 0, 0)).toBeNull();
  });
});
