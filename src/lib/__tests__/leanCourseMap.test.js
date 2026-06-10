import { describe, expect, it } from 'vitest';
import {
  COMPILER_OWNED_LEAN_KEYS,
  deriveCompilerOwnedColumns,
  expandLeanCourseMap,
  expandLeanSectionField,
  isLeanCourseMapEnabled,
} from '../leanCourseMap';
import { createBaseModelCapabilities, createGenerationPlan } from '../modelCapabilities';
import { buildUserPrompt } from '../prompts';

describe('expandLeanSectionField', () => {
  // v0.12.1: the stem never lives in the cell — the readiness repair strips
  // it and the validator treats it as non-publishable, so the expander must
  // not add it back (it used to, guaranteeing a fake "repair" every run).
  it('numbers unprefixed atoms without adding the objectives stem', () => {
    const out = expandLeanSectionField('learningObjectives', [
      'Analyze the impact of immigration policy on communities',
      'Compare federal and state policy frameworks',
    ]);
    expect(out).toBe(
      '1. Analyze the impact of immigration policy on communities\n2. Compare federal and state policy frameworks',
    );
  });

  it('preserves goal-reference prefixes from the model', () => {
    const out = expandLeanSectionField('learningObjectives', ['1a. Analyze policy impact', '2b. Evaluate strategies']);
    expect(out).toBe('1a. Analyze policy impact\n2b. Evaluate strategies');
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
    expect(section.learningObjectives).toBe('1. Analyze policy frameworks');
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
    // v0.12.1: both contracts forbid the stem in the cell — the app renders it.
    expect(prompt).toContain('do NOT write any "Students will be able to" stem');
  });

  it('is meaningfully shorter than the verbose prompt', () => {
    const verbose = buildUserPrompt('Syllabus text', null, null, false, null, null);
    const lean = buildUserPrompt('Syllabus text', null, null, false, null, null, { lean: true });
    expect(lean.length).toBeLessThan(verbose.length);
  });
});

describe('isLeanCourseMapEnabled', () => {
  it('reads the explicit plan flag', () => {
    expect(isLeanCourseMapEnabled({ leanCourseMapAtoms: true })).toBe(true);
    expect(isLeanCourseMapEnabled({})).toBe(false);
    expect(isLeanCourseMapEnabled(null)).toBe(false);
  });

  it('is on by default for structured-output models and off for prompt-only profiles (v0.9.11 P3)', () => {
    const openai = createGenerationPlan(
      createBaseModelCapabilities('openai', { id: 'gpt-5-mini', maxOutputTokens: 128000 }),
    );
    expect(openai.leanCourseMapAtoms).toBe(true);
    expect(isLeanCourseMapEnabled(openai)).toBe(true);

    const webllm = createGenerationPlan(createBaseModelCapabilities('webllm', { id: 'llama-3.2-3b' }));
    expect(isLeanCourseMapEnabled(webllm)).toBe(false);

    // Saved-plan opt-out stays respected.
    expect(isLeanCourseMapEnabled({ ...openai, leanCourseMapAtoms: false })).toBe(false);
  });
});

describe('compiler-owned columns (v0.9.11 P3b)', () => {
  const sectionFor = (overrides = {}) => ({
    learningGoals: 'Understand policy systems',
    topicSection: '1.1: Policy Foundations',
    learningObjectives:
      'Students will be able to:\n1. Analyze the impact of immigration policy on communities\n2. Compare federal and state frameworks',
    weeklyAssessments: '1. Reflection Paper: impact of policy on communities',
    asyncActivities: '1. Read: Chapter 5 on policy frameworks',
    syncActivities: '1. Debate: immigration policy impacts',
    supportingResources: '1. Nazario, S. (2020). Chapter 3.',
    ...overrides,
  });
  const mapFor = (sections) => ({
    courseName: 'Policy 101',
    lessons: sections.map((section, index) => ({
      title: `Lesson ${index + 1}: Topic ${index + 1}`,
      sections: [section],
    })),
  });

  it('derives the three compiler-owned columns from section content with provenance', () => {
    const derived = deriveCompilerOwnedColumns(mapFor([sectionFor()]));
    const section = derived.lessons[0].sections[0];
    expect(section.presentationFormat).toBe('Interactive seminar + reading');
    expect(section.technologyNeeded).toContain('LMS');
    expect(section.technologyNeeded).toContain('Video conferencing');
    // evaluateDesign is computed from the section's actual mapping, not asserted.
    expect(section.evaluateDesign.toLowerCase()).toContain('analyze and compare');
    expect(section.evaluateDesign.toLowerCase()).toContain('reflection paper');
    expect(derived.lessons[0].compilerDerived).toEqual(COMPILER_OWNED_LEAN_KEYS.slice().sort());
  });

  it('varies evaluateDesign across lessons via rotation and interpolation', () => {
    const derived = deriveCompilerOwnedColumns(
      mapFor([
        sectionFor(),
        sectionFor({
          learningObjectives: 'Students will be able to:\n1. Evaluate advocacy strategies',
          weeklyAssessments: '1. Case Brief: advocacy outcomes',
          syncActivities: '1. Workshop: stakeholder mapping',
        }),
        sectionFor({
          learningObjectives: 'Students will be able to:\n1. Design a policy memo',
          weeklyAssessments: '1. Memo Draft: housing policy',
          syncActivities: '1. Peer review: memo outlines',
        }),
      ]),
    );
    const cells = derived.lessons.map((lesson) => lesson.sections[0].evaluateDesign);
    expect(new Set(cells).size).toBe(3);
  });

  it('consumes specialTools atoms into technologyNeeded and removes the key', () => {
    const derived = deriveCompilerOwnedColumns(mapFor([sectionFor({ specialTools: ['SPSS', 'ArcGIS'] })]));
    const section = derived.lessons[0].sections[0];
    expect(section.technologyNeeded).toContain('SPSS');
    expect(section.technologyNeeded).toContain('ArcGIS');
    expect(section.specialTools).toBeUndefined();
  });

  it('never overwrites cells that already have content', () => {
    const derived = deriveCompilerOwnedColumns(
      mapFor([
        sectionFor({
          presentationFormat: 'Simulation workshop',
          technologyNeeded: '1. NYU Brightspace (submission)',
          evaluateDesign: 'Hand-written alignment note.',
        }),
      ]),
    );
    const section = derived.lessons[0].sections[0];
    expect(section.presentationFormat).toBe('Simulation workshop');
    expect(section.technologyNeeded).toBe('1. NYU Brightspace (submission)');
    expect(section.evaluateDesign).toBe('Hand-written alignment note.');
    expect(derived.lessons[0].compilerDerived).toBeUndefined();
  });

  it('drops compiler-owned columns from the lean contract and offers specialTools', () => {
    const columns = [
      { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
      { key: 'evaluateDesign', label: 'Evaluate Design', enabled: true },
      { key: 'technologyNeeded', label: 'Technology Needed', enabled: true },
      { key: 'presentationFormat', label: 'Presentation Format', enabled: true },
    ];
    const lean = buildUserPrompt('Syllabus text', columns, null, false, null, null, { lean: true });
    expect(lean).not.toContain('- evaluateDesign:');
    expect(lean).not.toContain('- presentationFormat:');
    expect(lean).not.toContain('- technologyNeeded:');
    expect(lean).toContain('- specialTools:');
    expect(lean).toContain('Do NOT generate evaluateDesign');

    const verbose = buildUserPrompt('Syllabus text', columns, null, false, null, null);
    expect(verbose).toContain('- evaluateDesign:');
    expect(verbose).toContain('- presentationFormat:');
  });
});
