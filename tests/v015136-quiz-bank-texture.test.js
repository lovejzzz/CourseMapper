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
  it('varies intended-use notes without manufacturing distractor-review prose', () => {
    const blueprint = buildCourseBlueprint(uxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      configMap: { quizBank: { questionsPerLesson: 6 } },
    });
    const values = textValues(compiled.quizBank);
    const quizText = values.join('\n');
    const questions = compiled.quizBank.quizzes.flatMap((quiz) => quiz.questions);
    const intendedUses = questions.map((question) => question.intendedUse).filter(Boolean);

    expect(quizText).not.toMatch(/review distractor choices before the next/i);
    expect(intendedUses.length).toBeGreaterThanOrEqual(UX_TOPICS.length);
    expect(new Set(intendedUses).size).toBeGreaterThanOrEqual(UX_TOPICS.length);
    expect(intendedUses.some((value) => /wrong option misses|breaks the evidence rule/i.test(value))).toBe(false);
    expect(questions.filter((question) => question.type === 'multiple_choice')).toHaveLength(0);
    expect(
      questions.filter((question) => question.type === 'short_answer').every((question) => question.scoringGuidance),
    ).toBe(true);
  });
});
