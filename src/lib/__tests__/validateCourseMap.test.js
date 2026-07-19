import { describe, it, expect } from 'vitest';
import { validateCourseMap } from '../validateCourseMap';

const columns = [
  { key: 'learningGoals', label: 'Learning Goals' },
  { key: 'topicSection', label: 'Topic / Section' },
  { key: 'learningObjectives', label: 'Learning Objectives' },
];

describe('validateCourseMap', () => {
  it('returns valid for a well-formed course map', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [
        {
          title: 'Lesson 1: Intro',
          sections: [{ learningGoals: 'A', topicSection: 'B', learningObjectives: 'C' }],
        },
      ],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('returns invalid for null course map', () => {
    const { valid, warnings } = validateCourseMap(null, columns);
    expect(valid).toBe(false);
    expect(warnings[0]).toMatch(/No lessons found/);
  });

  it('returns invalid for empty lessons array', () => {
    const { valid } = validateCourseMap({ lessons: [] }, columns);
    expect(valid).toBe(false);
  });

  it('auto-fills missing courseName and semester', () => {
    const map = {
      lessons: [{ title: 'L1', sections: [{ learningGoals: 'A', topicSection: 'B', learningObjectives: 'C' }] }],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.courseName).toBe('Untitled Course');
    expect(map.semester).toBe('TBD');
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('auto-fills missing lesson title', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [{ title: '', sections: [{ learningGoals: 'A', topicSection: 'B', learningObjectives: 'C' }] }],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.lessons[0].title).toBe('Lesson 1: Untitled');
    expect(warnings.some((w) => w.includes('missing title'))).toBe(true);
  });

  it('converts flat lesson keys to sections format', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [{ title: 'L1', learningGoals: 'Goal', topicSection: 'Topic', learningObjectives: 'Obj' }],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.lessons[0].sections).toHaveLength(1);
    expect(map.lessons[0].sections[0].learningGoals).toBe('Goal');
    expect(warnings.some((w) => w.includes('converted flat keys'))).toBe(true);
  });

  it('adds missing column keys to sections', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [{ title: 'L1', sections: [{ learningGoals: 'A' }] }],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.lessons[0].sections[0].topicSection).toBe('');
    expect(map.lessons[0].sections[0].learningObjectives).toBe('');
    expect(warnings.some((w) => w.includes("missing 'topicSection'"))).toBe(true);
  });

  it('auto-fills blank presentationFormat with an inferred delivery label', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [
        {
          title: 'L1',
          sections: [
            {
              learningGoals: 'A',
              topicSection: 'Case analysis',
              learningObjectives: 'C',
              syncActivities: 'Debate a case in seminar',
              presentationFormat: '',
            },
          ],
        },
      ],
    };
    const formatColumns = [...columns, { key: 'presentationFormat', label: 'Presentation Format' }];

    const { valid, warnings } = validateCourseMap(map, formatColumns);

    expect(valid).toBe(true);
    expect(map.lessons[0].sections[0].presentationFormat).toBe('Case discussion');
    expect(warnings.some((w) => w.includes('blank presentationFormat'))).toBe(true);
  });

  it('replaces non-object lesson with empty lesson', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: ['not an object'],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.lessons[0].title).toBe('Lesson 1: Untitled');
    expect(map.lessons[0].sections).toHaveLength(1);
    expect(warnings.some((w) => w.includes('was not an object'))).toBe(true);
  });

  it('replaces non-object section with empty section', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [{ title: 'L1', sections: ['bad section'] }],
    };
    const { valid, warnings } = validateCourseMap(map, columns);
    expect(valid).toBe(true);
    expect(map.lessons[0].sections[0]).toEqual({
      learningGoals: '',
      topicSection: '',
      learningObjectives: '',
    });
    expect(warnings.some((w) => w.includes('was not an object'))).toBe(true);
  });

  it('works with empty columns array', () => {
    const map = {
      courseName: 'CS101',
      semester: 'FA25',
      lessons: [{ title: 'L1', sections: [{ custom: 'data' }] }],
    };
    const { valid, warnings } = validateCourseMap(map, []);
    expect(valid).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('flags duplicate topic identities after stripping lesson numbers and expanding CPI', () => {
    const map = {
      courseName: 'Macroeconomics',
      semester: 'FA25',
      lessons: [
        { title: 'Lesson 3: Inflation and CPI', sections: [{}] },
        { title: 'Lesson 4: Inflation and Consumer Price Index', sections: [{}] },
      ],
    };

    const { valid, warnings } = validateCourseMap(map, []);

    expect(valid).toBe(true);
    expect(warnings).toContain(
      'Lessons 1, 2: duplicate topic identity "inflation consumer price index" requires a distinct focus',
    );
  });
});
