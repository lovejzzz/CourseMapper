import { describe, it, expect } from 'vitest';
import { ACTION_TYPES, executeAction, preValidateAction } from '../agentActions';

// ── Test helpers ──
const makeCourseMap = (lessonCount = 3) => ({
  lessons: Array.from({ length: lessonCount }, (_, i) => ({
    title: `Lesson ${i + 1}`,
    sections: [{ learningObjectives: `Objective ${i + 1}`, topicSection: `Topic ${i + 1}` }],
  })),
});

const makeDeliverables = () => ({
  quizBank: {
    status: 'done',
    data: {
      quizzes: [
        { lt: 'Lesson 1', tq: 2, qs: [{ q: 'Q1', ty: 'mc' }, { q: 'Q2', ty: 'sa' }] },
        { lt: 'Lesson 2', tq: 1, qs: [{ q: 'Q3', ty: 'mc' }] },
      ],
    },
  },
  assignments: {
    status: 'done',
    data: {
      assignments: [{ t: 'Assignment 1' }, { t: 'Assignment 2' }],
    },
  },
});

describe('ACTION_TYPES', () => {
  it('has all expected action types', () => {
    expect(ACTION_TYPES.editCell).toBe('editCell');
    expect(ACTION_TYPES.editTitle).toBe('editTitle');
    expect(ACTION_TYPES.addLesson).toBe('addLesson');
    expect(ACTION_TYPES.deleteLesson).toBe('deleteLesson');
    expect(ACTION_TYPES.addItem).toBe('addItem');
    expect(ACTION_TYPES.removeItem).toBe('removeItem');
    expect(ACTION_TYPES.editItem).toBe('editItem');
    expect(ACTION_TYPES.regenerateLesson).toBe('regenerateLesson');
  });
});

describe('executeAction', () => {
  it('returns failure for null action', () => {
    const result = executeAction(null, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid action');
  });

  it('returns failure for missing type', () => {
    const result = executeAction({}, {});
    expect(result.success).toBe(false);
  });

  it('returns failure for unknown action type', () => {
    const result = executeAction({ type: 'unknownAction' }, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown action type');
  });

  it('editCell calls editor.handleCellEdit', () => {
    let editedArgs = null;
    const ctx = {
      editor: {
        handleCellEdit: (...args) => { editedArgs = args; },
      },
      courseMap: makeCourseMap(),
    };
    const result = executeAction({ type: 'editCell', lessonIndex: 0, field: 'learningObjectives', value: 'New obj' }, ctx);
    expect(result.success).toBe(true);
    expect(editedArgs[0]).toBe(0); // lessonIndex
    expect(editedArgs[2]).toBe('learningObjectives'); // field
    expect(editedArgs[3]).toBe('New obj'); // value
  });

  it('editCell resolves field aliases', () => {
    let editedField = null;
    const ctx = {
      editor: {
        handleCellEdit: (_, __, field) => { editedField = field; },
      },
      courseMap: makeCourseMap(),
    };
    executeAction({ type: 'editCell', lessonIndex: 0, field: 'lo', value: 'test' }, ctx);
    expect(editedField).toBe('learningObjectives');
  });

  it('editTitle calls editor.handleTitleEdit', () => {
    let titleArgs = null;
    const ctx = {
      editor: { handleTitleEdit: (...args) => { titleArgs = args; } },
    };
    const result = executeAction({ type: 'editTitle', lessonIndex: 1, newTitle: 'New Title' }, ctx);
    expect(result.success).toBe(true);
    expect(titleArgs).toEqual([1, 'New Title']);
  });

  it('deleteLesson fails when only one lesson', () => {
    const ctx = {
      editor: { handleDeleteLesson: () => {} },
      courseMap: makeCourseMap(1),
    };
    const result = executeAction({ type: 'deleteLesson', lessonIndex: 0 }, ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('only lesson');
  });

  it('editCell fails without editor', () => {
    const result = executeAction({ type: 'editCell', lessonIndex: 0, field: 'test', value: 'x' }, { editor: {} });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Editor not available');
  });
});

describe('preValidateAction', () => {
  it('rejects null action', () => {
    expect(preValidateAction(null, {}).valid).toBe(false);
  });

  it('rejects missing action type', () => {
    expect(preValidateAction({}, {}).valid).toBe(false);
  });

  it('validates course map actions require courseMap', () => {
    const result = preValidateAction({ type: 'editCell', lessonIndex: 0 }, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('No course map');
  });

  it('validates lessonIndex bounds for course map', () => {
    const ctx = { courseMap: makeCourseMap(3) };
    expect(preValidateAction({ type: 'editCell', lessonIndex: 5 }, ctx).valid).toBe(false);
    expect(preValidateAction({ type: 'editCell', lessonIndex: -1 }, ctx).valid).toBe(false);
    expect(preValidateAction({ type: 'editCell', lessonIndex: 2 }, ctx).valid).toBe(true);
  });

  it('prevents deleting the only lesson', () => {
    const ctx = { courseMap: makeCourseMap(1) };
    const result = preValidateAction({ type: 'deleteLesson', lessonIndex: 0 }, ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('only lesson');
  });

  it('requires featureId for deliverable actions', () => {
    const result = preValidateAction({ type: 'addItem' }, { deliverables: makeDeliverables() });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing featureId');
  });

  it('requires deliverable to be generated', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'slideDecks' },
      { deliverables: {} },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not generated yet');
  });

  it('accepts valid addItem action', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'New question' } },
      { deliverables: makeDeliverables() },
    );
    expect(result.valid).toBe(true);
  });

  it('detects duplicate quiz questions', () => {
    const result = preValidateAction(
      { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'Q1' } },
      { deliverables: makeDeliverables() },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Duplicate');
  });
});
