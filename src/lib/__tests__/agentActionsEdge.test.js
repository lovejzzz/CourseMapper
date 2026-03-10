/**
 * Edge-case tests for agentActions.js
 *
 * Covers: FIELD_ALIASES resolution, all 8 action types with edge inputs,
 * preValidateAction bounds/status checks, SUB_ARRAY_KEYS behaviour,
 * and DEDUP_FIELDS duplicate detection nuances.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAction, preValidateAction, ACTION_TYPES } from '../agentActions';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMockEditor() {
  return {
    handleCellEdit: vi.fn(),
    handleTitleEdit: vi.fn(),
    handleAddLesson: vi.fn(),
    handleDeleteLesson: vi.fn(),
  };
}

function makeCourseMap(lessonCount = 3) {
  return {
    lessons: Array.from({ length: lessonCount }, (_, i) => ({
      title: `Lesson ${i + 1}`,
      sections: [
        {
          learningObjectives: `Obj ${i + 1}`,
          learningGoals: `Goal ${i + 1}`,
          topicSection: `Topic ${i + 1}`,
          weeklyAssessments: `Assess ${i + 1}`,
          asyncActivities: `Async ${i + 1}`,
          supportingResources: `Res ${i + 1}`,
        },
      ],
    })),
  };
}

function makeMockDeliverables() {
  return {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          { lt: 'L1', tq: 2, qs: [{ q: 'What is X?', ty: 'mc' }, { q: 'Explain Y', ty: 'essay' }] },
          { lt: 'L2', tq: 1, qs: [{ q: 'Define Z', ty: 'mc' }] },
        ],
      },
    },
    slideDecks: {
      status: 'done',
      data: {
        decks: [
          { lt: 'L1', ts: 1, sl: [{ t: 'Slide 1' }] },
          { lt: 'L2', ts: 1, sl: [{ t: 'Slide A' }] },
        ],
      },
    },
    lessonPlans: {
      status: 'done',
      data: {
        lessonPlans: [
          { lt: 'L1', ob: 'Obj' },
          { lt: 'L2', ob: 'Obj2' },
        ],
      },
    },
    courseFaq: {
      status: 'done',
      data: {
        faqs: [
          { lt: 'L1', qs: [{ q: 'FAQ Q1', a: 'Answer 1' }] },
        ],
      },
    },
    rubrics: {
      status: 'done',
      data: {
        rubrics: [
          { lt: 'L1', cr: [{ cn: 'Criterion A', wt: 10 }] },
        ],
      },
    },
    discussions: {
      status: 'idle',
      data: null,
    },
    assignments: {
      status: 'done',
      data: {
        assignments: [
          { t: 'HW1', desc: 'First homework' },
        ],
      },
    },
    syllabus: {
      status: 'done',
      data: {
        syllabus: { title: 'Course Syllabus', instructor: 'Dr. X' },
      },
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    editor: makeMockEditor(),
    courseMap: makeCourseMap(),
    deliverables: makeMockDeliverables(),
    optimisticUpdate: vi.fn(),
    snapshot: vi.fn(),
    skipSnapshot: false,
    regenerateLesson: vi.fn(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FIELD_ALIASES resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('FIELD_ALIASES resolution via editCell', () => {
  const aliases = [
    ['lo', 'learningObjectives'],
    ['lg', 'learningGoals'],
    ['tp', 'topicSection'],
    ['as', 'weeklyAssessments'],
    ['ac', 'asyncActivities'],
    ['rs', 'supportingResources'],
  ];

  it.each(aliases)('resolves shorthand "%s" to "%s"', (alias, expected) => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: alias, value: 'updated' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(0, 0, expected, 'updated');
  });

  it('passes through an unknown alias unchanged', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: 'unknownFieldXyz', value: '!' },
      ctx,
    );
    expect(result.success).toBe(true);
    // Unknown alias should pass through as-is
    expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(0, 0, 'unknownFieldXyz', '!');
  });

  it('uses field as-is when it already exists in sections', () => {
    const ctx = makeCtx();
    // 'learningObjectives' exists directly in sections, should not be remapped
    const result = executeAction(
      { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: 'learningObjectives', value: 'new' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(0, 0, 'learningObjectives', 'new');
  });

  it('defaults sectionIndex to 0 when omitted', () => {
    const ctx = makeCtx();
    executeAction(
      { type: 'editCell', lessonIndex: 1, field: 'lo', value: 'val' },
      ctx,
    );
    expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(1, 0, 'learningObjectives', 'val');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. executeAction — all 8 action types with edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('executeAction edge cases', () => {
  // ── General ──

  it('returns error for null action', () => {
    const result = executeAction(null, makeCtx());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/missing type/i);
  });

  it('returns error for action without type', () => {
    const result = executeAction({ lessonIndex: 0 }, makeCtx());
    expect(result.success).toBe(false);
  });

  it('returns error for unknown action type', () => {
    const result = executeAction({ type: 'destroyEverything' }, makeCtx());
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown action type');
  });

  // ── editCell ──

  describe('editCell', () => {
    it('fails when editor is missing', () => {
      const result = executeAction(
        { type: 'editCell', lessonIndex: 0, field: 'lo', value: 'x' },
        { editor: null, courseMap: makeCourseMap() },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Editor not available');
    });

    it('fails when editor has no handleCellEdit method', () => {
      const result = executeAction(
        { type: 'editCell', lessonIndex: 0, field: 'lo', value: 'x' },
        { editor: {}, courseMap: makeCourseMap() },
      );
      expect(result.success).toBe(false);
    });

    it('rejects missing field', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editCell', lessonIndex: 0, value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing field');
    });

    it('handles out-of-range lessonIndex without crashing (sections is undefined)', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editCell', lessonIndex: 99, sectionIndex: 0, field: 'lo', value: 'x' },
        ctx,
      );
      // The function does not bounds-check lessonIndex; it just resolves the field
      // and delegates to the editor. sections will be undefined, alias mapping kicks in.
      expect(result.success).toBe(true);
      expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(99, 0, 'learningObjectives', 'x');
    });
  });

  // ── editTitle ──

  describe('editTitle', () => {
    it('fails when editor is missing', () => {
      const result = executeAction(
        { type: 'editTitle', lessonIndex: 0, newTitle: 'Hi' },
        { editor: null },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Editor not available');
    });

    it('rejects an empty string title', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editTitle', lessonIndex: 0, newTitle: '' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing newTitle');
    });

    it('accepts special characters in title', () => {
      const ctx = makeCtx();
      const title = 'Lesson <1> & "Quotes" — émojis 🎉';
      const result = executeAction(
        { type: 'editTitle', lessonIndex: 0, newTitle: title },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(ctx.editor.handleTitleEdit).toHaveBeenCalledWith(0, title);
    });
  });

  // ── addLesson ──

  describe('addLesson', () => {
    it('fails when editor is missing', () => {
      const result = executeAction(
        { type: 'addLesson', title: 'New' },
        { editor: null, courseMap: makeCourseMap() },
      );
      expect(result.success).toBe(false);
    });

    it('adds lesson with sections and populates them', () => {
      const ctx = makeCtx();
      const result = executeAction(
        {
          type: 'addLesson',
          title: 'Advanced Topics',
          sections: [{ learningObjectives: 'LO1', topicSection: 'TP1' }],
        },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(ctx.editor.handleAddLesson).toHaveBeenCalled();
      expect(ctx.editor.handleTitleEdit).toHaveBeenCalledWith(3, 'Advanced Topics');
      expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(3, 0, 'learningObjectives', 'LO1');
      expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(3, 0, 'topicSection', 'TP1');
    });

    it('adds lesson without sections', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addLesson', title: 'Minimal' },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(ctx.editor.handleAddLesson).toHaveBeenCalled();
      expect(ctx.editor.handleCellEdit).not.toHaveBeenCalled();
    });

    it('adds lesson with null title — uses default label', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addLesson', title: null },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('New Lesson');
      // handleTitleEdit should NOT be called when title is null/falsy
      expect(ctx.editor.handleTitleEdit).not.toHaveBeenCalled();
    });

    it('skips section fields with falsy values', () => {
      const ctx = makeCtx();
      executeAction(
        { type: 'addLesson', title: 'T', sections: [{ learningObjectives: '', topicSection: 'TP' }] },
        ctx,
      );
      // '' is falsy, so only topicSection should be set
      expect(ctx.editor.handleCellEdit).toHaveBeenCalledTimes(1);
      expect(ctx.editor.handleCellEdit).toHaveBeenCalledWith(3, 0, 'topicSection', 'TP');
    });
  });

  // ── deleteLesson ──

  describe('deleteLesson', () => {
    it('fails when trying to delete the only lesson', () => {
      const ctx = makeCtx({ courseMap: makeCourseMap(1) });
      const result = executeAction(
        { type: 'deleteLesson', lessonIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot delete the only lesson');
    });

    it('succeeds when there are multiple lessons', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'deleteLesson', lessonIndex: 1 },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(ctx.editor.handleDeleteLesson).toHaveBeenCalledWith(1);
    });

    it('fails when editor is missing', () => {
      const result = executeAction(
        { type: 'deleteLesson', lessonIndex: 0 },
        { editor: null, courseMap: makeCourseMap(3) },
      );
      expect(result.success).toBe(false);
    });

    it('treats undefined courseMap lessons as length 0 and blocks delete', () => {
      const result = executeAction(
        { type: 'deleteLesson', lessonIndex: 0 },
        { editor: makeMockEditor(), courseMap: {} },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot delete the only lesson');
    });
  });

  // ── addItem ──

  describe('addItem', () => {
    it('fails when optimisticUpdate is missing', () => {
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'New?' } },
        { deliverables: makeMockDeliverables(), optimisticUpdate: null },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Optimistic update not available');
    });

    it('fails when deliverable has no data', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'discussions', lessonIndex: 0, item: { pr: 'Discuss' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('not generated yet');
    });

    it('detects exact duplicate question in quizBank', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is X?', ty: 'mc' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate detected');
    });

    it('detects case-insensitive duplicate', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'WHAT IS X?', ty: 'mc' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('detects whitespace-trimmed duplicate', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: '  What is X?  ', ty: 'mc' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('allows non-duplicate with similar text', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is X and Y?', ty: 'mc' } },
        ctx,
      );
      expect(result.success).toBe(true);
    });

    it('detects duplicate slide title in slideDecks', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'slideDecks', lessonIndex: 0, item: { t: 'Slide 1' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('detects duplicate FAQ question in courseFaq', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'courseFaq', lessonIndex: 0, item: { q: 'FAQ Q1', a: 'New answer' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('detects duplicate criterion name in rubrics', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Criterion A', wt: 20 } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('fails with out-of-range lessonIndex', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 99, item: { q: 'Q?' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('fails with negative lessonIndex', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: -1, item: { q: 'Q?' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('pushes to assignments flat array', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'assignments', item: { t: 'HW2', desc: 'Second' } },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('HW2');
      expect(ctx.optimisticUpdate).toHaveBeenCalledWith('assignments', expect.objectContaining({
        assignments: expect.arrayContaining([
          expect.objectContaining({ t: 'HW2' }),
        ]),
      }));
    });

    it('merges fields into syllabus object', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'addItem', featureId: 'syllabus', item: { instructor: 'Dr. Y' } },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('syllabus');
    });

    it('replaces entire lesson entry for discussions-style deliverables (no sub-array)', () => {
      const deliverables = makeMockDeliverables();
      // Make discussions available with data
      deliverables.discussions = {
        status: 'done',
        data: {
          discussions: [
            { lt: 'L1', pr: 'Old prompt', rb: 'Old rubric' },
          ],
        },
      };
      const ctx = makeCtx({ deliverables });
      const result = executeAction(
        { type: 'addItem', featureId: 'discussions', lessonIndex: 0, item: { pr: 'New prompt' } },
        ctx,
      );
      expect(result.success).toBe(true);
    });

    it('creates sub-array when subKey specified but does not exist yet', () => {
      const deliverables = makeMockDeliverables();
      // lessonPlans has no sub-array key — but we can pass a custom subKey
      const ctx = makeCtx({ deliverables });
      const result = executeAction(
        {
          type: 'addItem',
          featureId: 'lessonPlans',
          lessonIndex: 0,
          subKey: 'customList',
          item: { note: 'new' },
        },
        ctx,
      );
      expect(result.success).toBe(true);
      // The optimistic update should have been called with lessonPlans[0].customList = [item]
      const callArg = ctx.optimisticUpdate.mock.calls[0][1];
      expect(callArg.lessonPlans[0].customList).toEqual([{ note: 'new' }]);
    });

    it('calls snapshot before mutating when snapshot is provided', () => {
      const ctx = makeCtx();
      executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'Brand new Q', ty: 'mc' } },
        ctx,
      );
      expect(ctx.snapshot).toHaveBeenCalledWith('quizBank', ctx.deliverables.quizBank.data);
    });

    it('skips snapshot when skipSnapshot is true', () => {
      const ctx = makeCtx({ skipSnapshot: true });
      executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'Another Q', ty: 'mc' } },
        ctx,
      );
      expect(ctx.snapshot).not.toHaveBeenCalled();
    });

    it('updates tq count after adding quiz question', () => {
      const ctx = makeCtx();
      executeAction(
        { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'New unique Q?', ty: 'mc' } },
        ctx,
      );
      const data = ctx.optimisticUpdate.mock.calls[0][1];
      expect(data.quizzes[0].tq).toBe(3); // was 2, now 3
    });

    it('updates ts count after adding slide', () => {
      const ctx = makeCtx();
      executeAction(
        { type: 'addItem', featureId: 'slideDecks', lessonIndex: 0, item: { t: 'New Slide' } },
        ctx,
      );
      const data = ctx.optimisticUpdate.mock.calls[0][1];
      expect(data.decks[0].ts).toBe(2); // was 1, now 2
    });
  });

  // ── removeItem ──

  describe('removeItem', () => {
    it('fails when optimisticUpdate is missing', () => {
      const result = executeAction(
        { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 0 },
        { deliverables: makeMockDeliverables(), optimisticUpdate: null },
      );
      expect(result.success).toBe(false);
    });

    it('fails when deliverable has no data', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'discussions', lessonIndex: 0, itemIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('not generated yet');
    });

    it('fails with out-of-range itemIndex in sub-array', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 99 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('fails with negative itemIndex', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: -1 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('fails with out-of-range lessonIndex', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'quizBank', lessonIndex: 99, itemIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('fails when deliverable has no sub-array (e.g., lessonPlans)', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'lessonPlans', lessonIndex: 0, itemIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('no sub-array');
    });

    it('removes item from assignments flat array', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'assignments', itemIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('HW1');
    });

    it('fails removing from assignments with out-of-range index', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'assignments', itemIndex: 99 },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('out of range');
    });

    it('fails removing from assignments with negative index', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'assignments', itemIndex: -1 },
        ctx,
      );
      expect(result.success).toBe(false);
    });

    it('successfully removes a quiz question and updates tq', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 0 },
        ctx,
      );
      expect(result.success).toBe(true);
      const data = ctx.optimisticUpdate.mock.calls[0][1];
      expect(data.quizzes[0].tq).toBe(1); // was 2, removed 1
      expect(data.quizzes[0].qs).toHaveLength(1);
    });
  });

  // ── editItem ──

  describe('editItem', () => {
    it('fails when optimisticUpdate is missing', () => {
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'qs', 0, 'q'], value: 'Updated' },
        { deliverables: makeMockDeliverables(), optimisticUpdate: null },
      );
      expect(result.success).toBe(false);
    });

    it('fails with null path', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: null, value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid path');
    });

    it('fails with empty path array', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: [], value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid path');
    });

    it('fails with non-array path', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: 'quizzes.0.qs', value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid path');
    });

    it('resolves root key alias: agent sends "slideDecks" but data has "decks"', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'slideDecks', path: ['slideDecks', 0, 'sl', 0, 't'], value: 'Renamed Slide' },
        ctx,
      );
      expect(result.success).toBe(true);
      const data = ctx.optimisticUpdate.mock.calls[0][1];
      expect(data.decks[0].sl[0].t).toBe('Renamed Slide');
    });

    it('works when root key matches data key directly', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'qs', 0, 'q'], value: 'Edited Q' },
        ctx,
      );
      expect(result.success).toBe(true);
      const data = ctx.optimisticUpdate.mock.calls[0][1];
      expect(data.quizzes[0].qs[0].q).toBe('Edited Q');
    });

    it('fails when path traversal hits null', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'nonexistent', 0, 'q'], value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid path');
    });

    it('fails when deliverable has no data', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'discussions', path: ['discussions', 0, 'pr'], value: 'x' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('not generated yet');
    });

    it('sets value with single-element path', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'editItem', featureId: 'syllabus', path: ['syllabus'], value: { title: 'New Title' } },
        ctx,
      );
      // path length 1: target = data, finalKey = 'syllabus'
      expect(result.success).toBe(true);
    });
  });

  // ── regenerateLesson ──

  describe('regenerateLesson', () => {
    it('fails when regenerateLesson function is missing', () => {
      const result = executeAction(
        { type: 'regenerateLesson', featureId: 'quizBank', lessonIndex: 0 },
        { regenerateLesson: null, courseMap: makeCourseMap() },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('Regenerate not available');
    });

    it('succeeds and passes correct arguments', () => {
      const ctx = makeCtx();
      const result = executeAction(
        { type: 'regenerateLesson', featureId: 'quizBank', lessonIndex: 1 },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(ctx.regenerateLesson).toHaveBeenCalledWith('quizBank', ctx.courseMap, 1);
      expect(result.message).toContain('Lesson 2');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. preValidateAction — bounds and status checking
// ─────────────────────────────────────────────────────────────────────────────

describe('preValidateAction', () => {
  it('returns invalid for null action', () => {
    const result = preValidateAction(null, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing action type');
  });

  it('returns invalid for action without type', () => {
    const result = preValidateAction({ featureId: 'quizBank' }, {});
    expect(result.valid).toBe(false);
  });

  it('returns valid for a well-formed editCell action', () => {
    const result = preValidateAction(
      { type: 'editCell', lessonIndex: 0 },
      { courseMap: makeCourseMap(), deliverables: makeMockDeliverables() },
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for editCell without courseMap', () => {
    const result = preValidateAction(
      { type: 'editCell', lessonIndex: 0 },
      { courseMap: null, deliverables: makeMockDeliverables() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No course map loaded');
  });

  it('returns invalid for editCell with out-of-range lessonIndex', () => {
    const result = preValidateAction(
      { type: 'editCell', lessonIndex: 99 },
      { courseMap: makeCourseMap(3), deliverables: makeMockDeliverables() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('out of range');
  });

  it('returns invalid for editCell with negative lessonIndex', () => {
    const result = preValidateAction(
      { type: 'editCell', lessonIndex: -1 },
      { courseMap: makeCourseMap(3), deliverables: makeMockDeliverables() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('out of range');
  });

  it('returns invalid for deleteLesson when only one lesson', () => {
    const result = preValidateAction(
      { type: 'deleteLesson', lessonIndex: 0 },
      { courseMap: makeCourseMap(1), deliverables: {} },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Cannot delete the only lesson');
  });

  it('returns invalid for addItem with missing featureId', () => {
    const result = preValidateAction(
      { type: 'addItem', lessonIndex: 0, item: {} },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing featureId');
  });

  it('returns invalid for addItem when deliverable has no data (idle)', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'discussions', lessonIndex: 0, item: {} },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not generated yet');
  });

  it('returns invalid for addItem with out-of-range lessonIndex on deliverable', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 99, item: { q: 'Q?' } },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('out of range');
  });

  it('skips lessonIndex bounds check for assignments (flat array)', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'assignments', lessonIndex: 99, item: { t: 'HW' } },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    // assignments skips bounds check — lessonIndex is ignored for flat arrays
    expect(result.valid).toBe(true);
  });

  it('skips lessonIndex bounds check for syllabus', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'syllabus', lessonIndex: 99, item: {} },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(true);
  });

  it('detects duplicate in preValidation for quizBank', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is X?' } },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Duplicate');
  });

  it('detects case-insensitive duplicate in preValidation', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: '  WHAT IS X?  ' } },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Duplicate');
  });

  it('allows non-duplicate in preValidation', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'Completely new question?' } },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for regenerateLesson with missing featureId', () => {
    const result = preValidateAction(
      { type: 'regenerateLesson', lessonIndex: 0 },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing featureId');
  });

  it('returns invalid for regenerateLesson when deliverable not generated', () => {
    const result = preValidateAction(
      { type: 'regenerateLesson', featureId: 'discussions', lessonIndex: 0 },
      { deliverables: makeMockDeliverables(), courseMap: makeCourseMap() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not generated yet');
  });

  it('returns valid for addLesson (no lessonIndex needed)', () => {
    const result = preValidateAction(
      { type: 'addLesson' },
      { courseMap: makeCourseMap(), deliverables: {} },
    );
    expect(result.valid).toBe(true);
  });

  it('returns valid for editTitle with valid lessonIndex', () => {
    const result = preValidateAction(
      { type: 'editTitle', lessonIndex: 0 },
      { courseMap: makeCourseMap(), deliverables: {} },
    );
    expect(result.valid).toBe(true);
  });

  it('returns invalid for editTitle with out-of-range lessonIndex', () => {
    const result = preValidateAction(
      { type: 'editTitle', lessonIndex: 10 },
      { courseMap: makeCourseMap(3), deliverables: {} },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('out of range');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUB_ARRAY_KEYS behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('SUB_ARRAY_KEYS behavior — addItem pushes to correct sub-array', () => {
  it('quizBank uses sub-key "qs"', () => {
    const ctx = makeCtx();
    executeAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 1, item: { q: 'New Q for L2', ty: 'mc' } },
      ctx,
    );
    expect(ctx.optimisticUpdate).toHaveBeenCalled();
    const data = ctx.optimisticUpdate.mock.calls[0][1];
    // The new item should appear in quizzes[1].qs
    expect(data.quizzes[1].qs).toContainEqual(expect.objectContaining({ q: 'New Q for L2' }));
  });

  it('slideDecks uses sub-key "sl"', () => {
    const ctx = makeCtx();
    executeAction(
      { type: 'addItem', featureId: 'slideDecks', lessonIndex: 1, item: { t: 'New Slide for L2' } },
      ctx,
    );
    const data = ctx.optimisticUpdate.mock.calls[0][1];
    expect(data.decks[1].sl).toContainEqual(expect.objectContaining({ t: 'New Slide for L2' }));
  });

  it('courseFaq uses sub-key "qs"', () => {
    const ctx = makeCtx();
    executeAction(
      { type: 'addItem', featureId: 'courseFaq', lessonIndex: 0, item: { q: 'New FAQ', a: 'Answer' } },
      ctx,
    );
    const data = ctx.optimisticUpdate.mock.calls[0][1];
    expect(data.faqs[0].qs).toContainEqual(expect.objectContaining({ q: 'New FAQ' }));
  });

  it('rubrics uses sub-key "cr"', () => {
    const ctx = makeCtx();
    executeAction(
      { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'New Criterion', wt: 15 } },
      ctx,
    );
    const data = ctx.optimisticUpdate.mock.calls[0][1];
    expect(data.rubrics[0].cr).toContainEqual(expect.objectContaining({ cn: 'New Criterion' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEDUP_FIELDS — duplicate detection specifics
// ─────────────────────────────────────────────────────────────────────────────

describe('DEDUP_FIELDS — duplicate detection', () => {
  it('quizBank dedup uses field "q" and reports "question" in message', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is X?', ty: 'mc' } },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('question');
  });

  it('slideDecks dedup uses field "t" and reports "text" in message', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'addItem', featureId: 'slideDecks', lessonIndex: 0, item: { t: 'Slide 1' } },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('text');
  });

  it('courseFaq dedup uses field "q" and reports "question"', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'addItem', featureId: 'courseFaq', lessonIndex: 0, item: { q: 'FAQ Q1' } },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('question');
  });

  it('rubrics dedup uses field "cn" and reports "text"', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Criterion A' } },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('text');
  });

  it('skips dedup when item has no value for the dedup field', () => {
    const ctx = makeCtx();
    // Use courseFaq (has dedup on 'q' but no REQUIRED_FIELDS validation)
    const result = executeAction(
      { type: 'addItem', featureId: 'courseFaq', lessonIndex: 0, item: { a: 'just an answer' } },
      ctx,
    );
    // No 'q' field on item → dedup is skipped, item is added
    expect(result.success).toBe(true);
  });

  it('no dedup for deliverables not in DEDUP_FIELDS (e.g., lessonPlans)', () => {
    const ctx = makeCtx();
    const result = executeAction(
      { type: 'addItem', featureId: 'lessonPlans', lessonIndex: 0, item: { ob: 'Obj' } },
      ctx,
    );
    // lessonPlans has no sub-array key (null), so item is merged into lesson entry
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ACTION_TYPES export correctness
// ─────────────────────────────────────────────────────────────────────────────

describe('ACTION_TYPES', () => {
  it('exports all 8 action types', () => {
    expect(Object.keys(ACTION_TYPES)).toHaveLength(8);
  });

  it.each([
    'editCell', 'editTitle', 'addLesson', 'deleteLesson',
    'addItem', 'removeItem', 'editItem', 'regenerateLesson',
  ])('contains action type "%s"', (type) => {
    expect(ACTION_TYPES[type]).toBe(type);
  });
});
