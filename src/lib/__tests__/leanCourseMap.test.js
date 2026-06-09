import { describe, expect, it } from 'vitest';
import { expandLeanCourseMap, expandLeanSectionField, isLeanCourseMapEnabled } from '../leanCourseMap';
import { buildUserPrompt } from '../prompts';

describe('expandLeanSectionField', () => {
  it('renders the objectives stem once and numbers unprefixed atoms', () => {
    const out = expandLeanSectionField('learningObjectives', [
      'Analyze the impact of immigration policy on communities',
      'Compare federal and state policy frameworks',
    ]);
    expect(out).toBe(
      'Students will be able to:\n1. Analyze the impact of immigration policy on communities\n2. Compare federal and state policy frameworks',
    );
  });

  it('preserves goal-reference prefixes from the model', () => {
    const out = expandLeanSectionField('learningObjectives', ['1a. Analyze policy impact', '2b. Evaluate strategies']);
    expect(out).toBe('Students will be able to:\n1a. Analyze policy impact\n2b. Evaluate strategies');
  });

  it('renders numbered lines for list fields and joins evaluateDesign sentences', () => {
    expect(expandLeanSectionField('asyncActivities', ['Read: Chapter 5', 'Watch: Documentary (45 min)'])).toBe(
      '1. Read: Chapter 5\n2. Watch: Documentary (45 min)',
    );
    expect(expandLeanSectionField('evaluateDesign', ['Objectives are measurable.', 'Assessments align.'])).toBe(
      'Objectives are measurable. Assessments align.',
    );
  });

  it('keeps single-value fields as plain strings and passes strings through', () => {
    expect(expandLeanSectionField('presentationFormat', ['Case discussion'])).toBe('Case discussion');
    expect(expandLeanSectionField('learningObjectives', 'Students will be able to:\n1. Analyze X')).toBe(
      'Students will be able to:\n1. Analyze X',
    );
  });

  it('keeps a single learning goal unnumbered and numbers multiple goals', () => {
    expect(expandLeanSectionField('learningGoals', ['Understand policy systems'])).toBe('Understand policy systems');
    expect(expandLeanSectionField('learningGoals', ['Goal one', 'Goal two'])).toBe('1. Goal one\n2. Goal two');
  });
});

describe('expandLeanCourseMap', () => {
  const leanMap = {
    courseName: 'Policy 101',
    lessons: [
      {
        title: 'Lesson 1: Foundations',
        sections: [
          {
            topicSection: '1.1: Overview',
            learningObjectives: ['Analyze policy frameworks'],
            asyncActivities: ['Read: Chapter 1'],
          },
        ],
      },
    ],
  };

  it('expands every lean section into standard course-map prose', () => {
    const expanded = expandLeanCourseMap(leanMap);
    const section = expanded.lessons[0].sections[0];
    expect(section.learningObjectives).toBe('Students will be able to:\n1. Analyze policy frameworks');
    expect(section.asyncActivities).toBe('1. Read: Chapter 1');
    expect(section.topicSection).toBe('1.1: Overview');
  });

  it('is idempotent and returns the same object when nothing is lean', () => {
    const expanded = expandLeanCourseMap(leanMap);
    const again = expandLeanCourseMap(expanded);
    expect(again).toBe(expanded);
  });

  it('handles null and malformed maps defensively', () => {
    expect(expandLeanCourseMap(null)).toBeNull();
    expect(expandLeanCourseMap({ lessons: [{ title: 'X' }] }).lessons[0].title).toBe('X');
  });
});

describe('lean prompt contract', () => {
  const columns = [
    { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
    { key: 'asyncActivities', label: 'Async Activities', enabled: true },
  ];

  it('uses compact atom definitions and drops the prose stem rule in lean mode', () => {
    const prompt = buildUserPrompt('Syllabus text', columns, null, false, null, null, { lean: true });
    expect(prompt).toContain('LEAN OUTPUT MODE');
    expect(prompt).toContain('["compact atom 1", "compact atom 2"]');
    expect(prompt).not.toContain('Write "Students will be able to:" ONCE');
  });

  it('keeps the verbose contract by default', () => {
    const prompt = buildUserPrompt('Syllabus text', columns, null, false, null, null);
    expect(prompt).not.toContain('LEAN OUTPUT MODE');
    expect(prompt).toContain('Students will be able to:');
  });

  it('is meaningfully shorter than the verbose prompt', () => {
    const verbose = buildUserPrompt('Syllabus text', null, null, false, null, null);
    const lean = buildUserPrompt('Syllabus text', null, null, false, null, null, { lean: true });
    expect(lean.length).toBeLessThan(verbose.length);
  });
});

describe('isLeanCourseMapEnabled', () => {
  it('is opt-in only', () => {
    expect(isLeanCourseMapEnabled({ leanCourseMapAtoms: true })).toBe(true);
    expect(isLeanCourseMapEnabled({})).toBe(false);
    expect(isLeanCourseMapEnabled(null)).toBe(false);
  });
});
