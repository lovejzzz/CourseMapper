/**
 * Tests for useCourseMapEditor pure logic functions.
 * Extracted from the hook to test without React.
 */
import { describe, it, expect } from 'vitest';

// ── Re-implement setAtPath (pure function from useCourseMapEditor) ──
function setAtPath(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setAtPath(clone[head], rest, value);
  return clone;
}

// ── Re-implement optimisticTitleReplace ──
function getArrayKey(featureId, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const KNOWN_KEYS = {
    lessonPlans: 'lessonPlans',
    slideDecks: 'slideDecks',
    rubrics: 'rubrics',
    quizBank: 'quizzes',
    discussions: 'discussions',
    assignments: 'assignments',
    studyGuides: 'studyGuides',
    courseFaq: 'faqs',
  };
  const ALIASES = {
    slideDecks: ['decks', 'slides'],
    lessonPlans: ['plans', 'lessons'],
    studyGuides: ['guides'],
    courseFaq: ['faq', 'courseFAQ'],
  };
  const known = KNOWN_KEYS[featureId];
  if (known && parsed[known]) return known;
  const aliases = ALIASES[featureId];
  if (aliases) {
    for (const alias of aliases) {
      if (parsed[alias] && Array.isArray(parsed[alias])) return alias;
    }
  }
  for (const k of Object.keys(parsed)) {
    if (Array.isArray(parsed[k])) return k;
  }
  return null;
}

function optimisticTitleReplace(data, featureId, lessonIdx, oldTitle, newTitle) {
  if (!data || typeof data !== 'object') return null;
  const arrKey = getArrayKey(featureId, data);
  if (!arrKey) return null;
  const arr = data[arrKey];
  if (!Array.isArray(arr) || lessonIdx >= arr.length) return null;
  const item = arr[lessonIdx];
  if (!item) return null;
  const hasLessonTitle = item.lessonTitle === oldTitle;
  const hasTitle = item.title === oldTitle;
  if (!hasLessonTitle && !hasTitle) return null;
  const patched = { ...item };
  if (hasLessonTitle) patched.lessonTitle = newTitle;
  if (hasTitle) patched.title = newTitle;
  const patchedArr = [...arr];
  patchedArr[lessonIdx] = patched;
  return { ...data, [arrKey]: patchedArr };
}

// ── setAtPath tests ──

describe('setAtPath', () => {
  it('sets a top-level key', () => {
    const obj = { a: 1, b: 2 };
    const result = setAtPath(obj, ['a'], 10);
    expect(result.a).toBe(10);
    expect(result.b).toBe(2);
  });

  it('sets a nested key', () => {
    const obj = { lessons: [{ title: 'Old', sections: [{ lo: 'x' }] }] };
    const result = setAtPath(obj, ['lessons', 0, 'title'], 'New');
    expect(result.lessons[0].title).toBe('New');
  });

  it('sets a deeply nested key in sections', () => {
    const obj = { lessons: [{ sections: [{ learningObjectives: 'old' }] }] };
    const result = setAtPath(obj, ['lessons', 0, 'sections', 0, 'learningObjectives'], 'new');
    expect(result.lessons[0].sections[0].learningObjectives).toBe('new');
  });

  it('does not mutate the original object (immutable update)', () => {
    const obj = { lessons: [{ title: 'Original' }] };
    const result = setAtPath(obj, ['lessons', 0, 'title'], 'Changed');
    expect(obj.lessons[0].title).toBe('Original');
    expect(result.lessons[0].title).toBe('Changed');
  });

  it('does not mutate sibling array elements', () => {
    const obj = { lessons: [{ title: 'L1' }, { title: 'L2' }] };
    const result = setAtPath(obj, ['lessons', 0, 'title'], 'Updated');
    expect(result.lessons[0].title).toBe('Updated');
    expect(result.lessons[1]).toBe(obj.lessons[1]); // same reference
  });

  it('handles empty path (returns value directly)', () => {
    expect(setAtPath({ a: 1 }, [], 'replaced')).toBe('replaced');
  });

  it('handles array elements', () => {
    const obj = { items: ['a', 'b', 'c'] };
    const result = setAtPath(obj, ['items', 1], 'B');
    expect(result.items).toEqual(['a', 'B', 'c']);
    expect(obj.items[1]).toBe('b'); // original unchanged
  });
});

// ── optimisticTitleReplace tests ──

describe('optimisticTitleReplace', () => {
  it('replaces lessonTitle in lesson plans', () => {
    const data = {
      lessonPlans: [
        { lessonTitle: 'Lesson 1: Intro', objectives: ['A'] },
        { lessonTitle: 'Lesson 2: Basics', objectives: ['B'] },
      ],
    };
    const result = optimisticTitleReplace(data, 'lessonPlans', 0, 'Lesson 1: Intro', 'Lesson 1: Introduction');
    expect(result.lessonPlans[0].lessonTitle).toBe('Lesson 1: Introduction');
    expect(result.lessonPlans[1].lessonTitle).toBe('Lesson 2: Basics'); // unchanged
  });

  it('replaces title in quiz bank (uses "quizzes" key)', () => {
    const data = {
      quizzes: [{ lessonTitle: 'Quiz 1', questions: [] }],
    };
    const result = optimisticTitleReplace(data, 'quizBank', 0, 'Quiz 1', 'Quiz 1: Updated');
    expect(result.quizzes[0].lessonTitle).toBe('Quiz 1: Updated');
  });

  it('returns null when title does not match', () => {
    const data = {
      lessonPlans: [{ lessonTitle: 'Different Title' }],
    };
    expect(optimisticTitleReplace(data, 'lessonPlans', 0, 'Wrong Title', 'New')).toBeNull();
  });

  it('returns null for null data', () => {
    expect(optimisticTitleReplace(null, 'lessonPlans', 0, 'a', 'b')).toBeNull();
  });

  it('returns null for out-of-range lesson index', () => {
    const data = { lessonPlans: [{ lessonTitle: 'Only lesson' }] };
    expect(optimisticTitleReplace(data, 'lessonPlans', 5, 'Only lesson', 'New')).toBeNull();
  });

  it('handles aliased array keys (decks)', () => {
    const data = {
      decks: [{ lessonTitle: 'Deck 1', slides: [] }],
    };
    const result = optimisticTitleReplace(data, 'slideDecks', 0, 'Deck 1', 'Deck 1: Renamed');
    expect(result.decks[0].lessonTitle).toBe('Deck 1: Renamed');
  });

  it('replaces "title" field when used instead of "lessonTitle"', () => {
    const data = {
      rubrics: [{ title: 'Rubric 1', criteria: [] }],
    };
    const result = optimisticTitleReplace(data, 'rubrics', 0, 'Rubric 1', 'Rubric 1: Updated');
    expect(result.rubrics[0].title).toBe('Rubric 1: Updated');
  });

  it('does not mutate original data', () => {
    const data = {
      lessonPlans: [{ lessonTitle: 'Original', objectives: ['A'] }],
    };
    optimisticTitleReplace(data, 'lessonPlans', 0, 'Original', 'New');
    expect(data.lessonPlans[0].lessonTitle).toBe('Original');
  });
});
