import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const UX_TOPICS = [
  'Design research',
  'User needs',
  'Synthesis',
  'Personas',
  'Journey maps',
  'Information architecture',
  'Wireframes',
  'Prototyping',
  'Usability testing',
  'Accessibility',
  'Portfolio review',
  'UX case study',
];

function uxStudioCourseMap() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: `Use ${topic.toLowerCase()} to make a stronger design decision.`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a user-evidence artifact.`,
          weeklyAssessments: `${topic} critique checkpoint`,
          asyncActivities: `Review assigned ${topic.toLowerCase()} materials and prepare critique notes.`,
          syncActivities: `Discuss ${topic.toLowerCase()} evidence and revise a design rationale.`,
          supportingResources: `${topic} reading; studio critique notes`,
          evaluateDesign: `Score ${topic.toLowerCase()} evidence, reasoning, and revision quality.`,
        },
      ],
    })),
  };
}

function textValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues);
  return [];
}

describe('v0.15.136 quiz-bank texture', () => {
  it('varies multiple-choice intended-use notes instead of repeating the distractor-review shingle', () => {
    const blueprint = buildCourseBlueprint(uxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      configMap: { quizBank: { questionsPerLesson: 6 } },
    });
    const values = textValues(compiled.quizBank);
    const quizText = values.join('\n');
    const intendedUses = values.filter((value) => /for Lesson \d+:.+; /.test(value));

    expect(quizText).not.toMatch(/review distractor choices before the next/i);
    expect(intendedUses.length).toBeGreaterThanOrEqual(UX_TOPICS.length);
    expect(intendedUses.some((value) => /compare each distractor/i.test(value))).toBe(true);
    expect(intendedUses.some((value) => /use the options to surface/i.test(value))).toBe(true);
    expect(intendedUses.some((value) => /wrong option misses/i.test(value))).toBe(true);
    expect(intendedUses.some((value) => /practice moment/i.test(value))).toBe(true);
  });
});
