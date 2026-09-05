import { describe, it, expect } from 'vitest';
import { condenseCourseMap, COLUMN_EXTRACTORS } from '../prompts/promptUtils';

// ── Test fixtures ──
const makeCourseMap = (lessonCount = 3) => ({
  courseName: 'Intro to AI',
  semester: 'Fall 2026',
  lessons: Array.from({ length: lessonCount }, (_, i) => ({
    title: `Lesson ${i + 1}: Topic ${i + 1}`,
    sections: [
      {
        topicSection: `Topic ${i + 1}`,
        learningObjectives: `Objective ${i + 1}`,
        weeklyAssessments: `Assessment ${i + 1}`,
        asyncActivities: `Async ${i + 1}`,
        syncActivities: `Sync ${i + 1}`,
        supportingResources: `Resource ${i + 1}`,
        technologyNeeded: `Tech ${i + 1}`,
        presentationFormat: 'Lecture',
        evaluateDesign: `Eval ${i + 1}`,
        learningGoals: `Goal ${i + 1}`,
      },
    ],
  })),
});

describe('COLUMN_EXTRACTORS', () => {
  it('has extractors for all standard column keys', () => {
    const expectedKeys = [
      'topicSection',
      'learningObjectives',
      'weeklyAssessments',
      'supportingResources',
      'learningGoals',
      'asyncActivities',
      'syncActivities',
      'technologyNeeded',
      'presentationFormat',
      'evaluateDesign',
    ];
    for (const key of expectedKeys) {
      expect(COLUMN_EXTRACTORS).toHaveProperty(key);
      expect(COLUMN_EXTRACTORS[key]).toHaveProperty('key');
      expect(typeof COLUMN_EXTRACTORS[key].extract).toBe('function');
    }
  });
});

describe('condenseCourseMap', () => {
  it('produces valid JSON', () => {
    const result = condenseCourseMap(makeCourseMap());
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('includes courseName and semester', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap()));
    expect(parsed.courseName).toBe('Intro to AI');
    expect(parsed.semester).toBe('Fall 2026');
  });

  it('includes all lessons by default', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(5)));
    expect(parsed.lessons).toHaveLength(5);
    expect(parsed.totalLessonsInCourse).toBe(5);
  });

  it('includes correct lesson numbers (1-based)', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(3)));
    expect(parsed.lessons[0].lessonNumber).toBe(1);
    expect(parsed.lessons[2].lessonNumber).toBe(3);
  });

  it('extracts column data into lesson entries', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(1)));
    const lesson = parsed.lessons[0];
    expect(lesson.topics).toBeDefined();
    expect(lesson.objectives).toContain('Objective 1');
    expect(lesson.assessments).toContain('Assessment 1');
  });

  it('groups async/sync activities under "activities"', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(1)));
    const lesson = parsed.lessons[0];
    expect(lesson.activities).toBeDefined();
    expect(lesson.activities.async).toContain('Async 1');
    expect(lesson.activities.sync).toContain('Sync 1');
  });

  // ── Scope filtering ──
  it('filters by scopeIndices', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(5), [1, 3]));
    expect(parsed.lessons).toHaveLength(2);
    expect(parsed.lessons[0].lessonNumber).toBe(2); // index 1 → lesson 2
    expect(parsed.lessons[1].lessonNumber).toBe(4); // index 3 → lesson 4
  });

  it('preserves totalLessonsInCourse when scoped', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(10), [2, 5]));
    expect(parsed.totalLessonsInCourse).toBe(10);
  });

  // ── Column filtering ──
  it('respects column enable/disable', () => {
    const columns = [
      { key: 'topicSection', enabled: true },
      { key: 'learningObjectives', enabled: true },
      { key: 'weeklyAssessments', enabled: false },
      { key: 'asyncActivities', enabled: false },
      { key: 'syncActivities', enabled: false },
    ];
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(1), null, null, columns));
    const lesson = parsed.lessons[0];
    expect(lesson.topics).toBeDefined();
    expect(lesson.objectives).toBeDefined();
    expect(lesson.assessments).toBeUndefined();
    expect(lesson.activities).toBeUndefined();
  });

  // ── Verified changes ──
  it('includes verified changes when provided', () => {
    const changes = ['Fixed objective in Lesson 1', 'Corrected assessment in Lesson 3'];
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(), null, changes));
    expect(parsed._verifiedByExamination).toBeDefined();
    expect(parsed._verifiedByExamination.verifiedItems).toHaveLength(2);
  });

  it('excludes rejected changes', () => {
    const changes = ['Good change', '__REJECTED__: bad change'];
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap(), null, changes));
    expect(parsed._verifiedByExamination.verifiedItems).toHaveLength(1);
    expect(parsed._verifiedByExamination.verifiedItems[0]).toBe('Good change');
  });

  it('omits _verifiedByExamination when no changes', () => {
    const parsed = JSON.parse(condenseCourseMap(makeCourseMap()));
    expect(parsed._verifiedByExamination).toBeUndefined();
  });

  // ── Edge cases ──
  it('handles empty course map', () => {
    const parsed = JSON.parse(condenseCourseMap({ lessons: [] }));
    expect(parsed.lessons).toHaveLength(0);
  });

  it('handles lessons with empty sections', () => {
    const cm = { courseName: 'Test', semester: 'Spring', lessons: [{ title: 'Empty', sections: [{}] }] };
    const parsed = JSON.parse(condenseCourseMap(cm));
    expect(parsed.lessons).toHaveLength(1);
    expect(parsed.lessons[0].title).toBe('Empty');
  });
});
