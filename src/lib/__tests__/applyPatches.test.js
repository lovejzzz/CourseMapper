import { describe, it, expect } from 'vitest';
import applyPatches from '../applyPatches';

const baseMap = {
  courseName: 'Test Course',
  semester: 'FA25',
  lessons: [
    {
      title: 'Lesson 1: Intro',
      sections: [
        { learningGoals: 'Goal A', topicSection: 'Topic A' },
        { learningGoals: 'Goal B', topicSection: 'Topic B' },
      ],
    },
    {
      title: 'Lesson 2: Advanced',
      sections: [
        { learningGoals: 'Goal C', topicSection: 'Topic C' },
      ],
    },
  ],
};

describe('applyPatches', () => {
  it('patches a section field', () => {
    const result = applyPatches(baseMap, [
      { lessonIndex: 0, sectionIndex: 1, field: 'learningGoals', value: 'Updated Goal B' },
    ]);
    expect(result.lessons[0].sections[1].learningGoals).toBe('Updated Goal B');
    // Original unchanged
    expect(baseMap.lessons[0].sections[1].learningGoals).toBe('Goal B');
  });

  it('patches a lesson title', () => {
    const result = applyPatches(baseMap, [
      { lessonIndex: 1, field: 'title', value: 'Lesson 2: Expert' },
    ]);
    expect(result.lessons[1].title).toBe('Lesson 2: Expert');
  });

  it('patches course-level fields', () => {
    const result = applyPatches(baseMap, [
      { field: 'courseName', value: 'New Name' },
      { field: 'semester', value: 'SP26' },
    ]);
    expect(result.courseName).toBe('New Name');
    expect(result.semester).toBe('SP26');
  });

  it('adds a new lesson', () => {
    const newLesson = { title: 'Lesson 3: New', sections: [{ learningGoals: 'Goal D' }] };
    const result = applyPatches(baseMap, [
      { action: 'addLesson', lessonIndex: 2, lesson: newLesson },
    ]);
    expect(result.lessons).toHaveLength(3);
    expect(result.lessons[2].title).toBe('Lesson 3: New');
  });

  it('removes a lesson', () => {
    const result = applyPatches(baseMap, [
      { action: 'removeLesson', lessonIndex: 0 },
    ]);
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].title).toBe('Lesson 2: Advanced');
  });

  it('adds a new section', () => {
    const newSection = { learningGoals: 'Goal X', topicSection: 'Topic X' };
    const result = applyPatches(baseMap, [
      { action: 'addSection', lessonIndex: 1, sectionIndex: 1, section: newSection },
    ]);
    expect(result.lessons[1].sections).toHaveLength(2);
    expect(result.lessons[1].sections[1].learningGoals).toBe('Goal X');
  });

  it('does not mutate the original map', () => {
    applyPatches(baseMap, [
      { lessonIndex: 0, sectionIndex: 0, field: 'learningGoals', value: 'Mutated' },
    ]);
    expect(baseMap.lessons[0].sections[0].learningGoals).toBe('Goal A');
  });

  it('handles empty patches array', () => {
    const result = applyPatches(baseMap, []);
    expect(result.lessons).toHaveLength(2);
  });
});
