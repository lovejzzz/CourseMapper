/**
 * Tests for DiffReviewCard pure logic — describeDiff and getDeliverableLabel.
 * Re-implements the functions since they're not exported from the JSX component.
 */
import { describe, it, expect } from 'vitest';

// Re-implement from DiffReviewCard.jsx
const ACTION_LABELS = {
  addItem: 'Add',
  removeItem: 'Remove',
  editItem: 'Edit',
  editCell: 'Edit cell',
  editTitle: 'Rename lesson',
  addLesson: 'Add lesson',
  deleteLesson: 'Delete lesson',
};

function getDeliverableLabel(featureId) {
  const map = {
    quizBank: 'Quiz Bank',
    discussions: 'Discussions',
    assignments: 'Assignments',
    slideDecks: 'Slide Decks',
    courseFaq: 'Course FAQ',
    rubrics: 'Rubrics',
    studyGuides: 'Study Guides',
    lessonPlans: 'Lesson Plans',
    syllabus: 'Syllabus',
  };
  return map[featureId] || featureId;
}

function describeDiff(action, preview) {
  const type = action?.type;
  const label = ACTION_LABELS[type] || 'Change';
  const featureLabel = action?.featureId ? getDeliverableLabel(action.featureId) : '';
  const lessonNum = action?.lessonIndex != null ? `Lesson ${action.lessonIndex + 1}` : '';

  const parts = [label];
  switch (type) {
    case 'addItem':
      parts.push(`item to ${featureLabel}`);
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'removeItem':
      parts.push(`item from ${featureLabel}`);
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'editItem':
      parts.push(`in ${featureLabel}`);
      break;
    case 'editCell':
      parts.push(`"${action.field || ''}" in ${lessonNum}`);
      break;
    case 'editTitle':
      if (lessonNum) parts.push(lessonNum);
      break;
    case 'addLesson':
      parts.push(`"${action.title || 'New lesson'}"`);
      break;
    case 'deleteLesson':
      if (lessonNum) parts.push(lessonNum);
      break;
    default:
      parts.push('content');
  }
  return parts.join(' — ');
}

// ─── getDeliverableLabel ─────────────────────────────────────────────────────

describe('getDeliverableLabel', () => {
  it.each([
    ['quizBank', 'Quiz Bank'],
    ['discussions', 'Discussions'],
    ['assignments', 'Assignments'],
    ['slideDecks', 'Slide Decks'],
    ['courseFaq', 'Course FAQ'],
    ['rubrics', 'Rubrics'],
    ['studyGuides', 'Study Guides'],
    ['lessonPlans', 'Lesson Plans'],
    ['syllabus', 'Syllabus'],
  ])('maps "%s" → "%s"', (featureId, expected) => {
    expect(getDeliverableLabel(featureId)).toBe(expected);
  });

  it('returns the raw featureId for unknown keys', () => {
    expect(getDeliverableLabel('unknownFeature')).toBe('unknownFeature');
  });

  it('returns the raw string for an empty string', () => {
    expect(getDeliverableLabel('')).toBe('');
  });
});

// ─── describeDiff — each action type ─────────────────────────────────────────

describe('describeDiff', () => {
  describe('addItem', () => {
    it('describes adding an item to a feature with lesson number', () => {
      const action = { type: 'addItem', featureId: 'quizBank', lessonIndex: 2 };
      expect(describeDiff(action)).toBe('Add — item to Quiz Bank — Lesson 3');
    });

    it('omits lesson number when lessonIndex is absent', () => {
      const action = { type: 'addItem', featureId: 'discussions' };
      expect(describeDiff(action)).toBe('Add — item to Discussions');
    });
  });

  describe('removeItem', () => {
    it('describes removing an item from a feature with lesson', () => {
      const action = { type: 'removeItem', featureId: 'assignments', lessonIndex: 0 };
      expect(describeDiff(action)).toBe('Remove — item from Assignments — Lesson 1');
    });

    it('omits lesson number when lessonIndex is absent', () => {
      const action = { type: 'removeItem', featureId: 'rubrics' };
      expect(describeDiff(action)).toBe('Remove — item from Rubrics');
    });
  });

  describe('editItem', () => {
    it('describes editing in a feature', () => {
      const action = { type: 'editItem', featureId: 'slideDecks' };
      expect(describeDiff(action)).toBe('Edit — in Slide Decks');
    });
  });

  describe('editCell', () => {
    it('describes editing a specific field in a lesson', () => {
      const action = { type: 'editCell', field: 'topic', lessonIndex: 4 };
      expect(describeDiff(action)).toBe('Edit cell — "topic" in Lesson 5');
    });

    it('uses empty string when field is missing', () => {
      const action = { type: 'editCell', lessonIndex: 0 };
      expect(describeDiff(action)).toBe('Edit cell — "" in Lesson 1');
    });
  });

  describe('editTitle', () => {
    it('describes renaming a lesson', () => {
      const action = { type: 'editTitle', lessonIndex: 1 };
      expect(describeDiff(action)).toBe('Rename lesson — Lesson 2');
    });

    it('has no lesson part when lessonIndex is absent', () => {
      const action = { type: 'editTitle' };
      expect(describeDiff(action)).toBe('Rename lesson');
    });
  });

  describe('addLesson', () => {
    it('includes the lesson title', () => {
      const action = { type: 'addLesson', title: 'Intro to AI' };
      expect(describeDiff(action)).toBe('Add lesson — "Intro to AI"');
    });

    it('defaults to "New lesson" when title is missing', () => {
      const action = { type: 'addLesson' };
      expect(describeDiff(action)).toBe('Add lesson — "New lesson"');
    });
  });

  describe('deleteLesson', () => {
    it('describes deleting a specific lesson', () => {
      const action = { type: 'deleteLesson', lessonIndex: 3 };
      expect(describeDiff(action)).toBe('Delete lesson — Lesson 4');
    });

    it('has no lesson part when lessonIndex is absent', () => {
      const action = { type: 'deleteLesson' };
      expect(describeDiff(action)).toBe('Delete lesson');
    });
  });

  describe('default / unknown type', () => {
    it('falls back to "Change — content" for unknown types', () => {
      const action = { type: 'someNewAction' };
      expect(describeDiff(action)).toBe('Change — content');
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles null action gracefully', () => {
      expect(describeDiff(null)).toBe('Change — content');
    });

    it('handles undefined action gracefully', () => {
      expect(describeDiff(undefined)).toBe('Change — content');
    });

    it('handles action with no type', () => {
      expect(describeDiff({})).toBe('Change — content');
    });

    it('handles missing fields on a known type', () => {
      // editCell with no field and no lessonIndex
      const action = { type: 'editCell' };
      expect(describeDiff(action)).toBe('Edit cell — "" in ');
    });

    it('treats lessonIndex 0 as valid → "Lesson 1"', () => {
      const action = { type: 'addItem', featureId: 'studyGuides', lessonIndex: 0 };
      expect(describeDiff(action)).toBe('Add — item to Study Guides — Lesson 1');
    });

    it('treats lessonIndex 0 in editTitle → "Lesson 1"', () => {
      const action = { type: 'editTitle', lessonIndex: 0 };
      expect(describeDiff(action)).toBe('Rename lesson — Lesson 1');
    });
  });

  // ─── Description format ────────────────────────────────────────────────

  describe('format', () => {
    it('uses " — " (space-dash-space) as separator', () => {
      const action = { type: 'addItem', featureId: 'quizBank', lessonIndex: 0 };
      const desc = describeDiff(action);
      const segments = desc.split(' — ');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toBe('Add');
      expect(segments[1]).toBe('item to Quiz Bank');
      expect(segments[2]).toBe('Lesson 1');
    });

    it('lesson numbering is 1-based', () => {
      for (let i = 0; i < 5; i++) {
        const action = { type: 'deleteLesson', lessonIndex: i };
        expect(describeDiff(action)).toContain(`Lesson ${i + 1}`);
      }
    });
  });
});
