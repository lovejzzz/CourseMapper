import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const UX_TOPICS = [
  'design research',
  'user needs',
  'synthesis',
  'ideation',
  'sketching',
  'wireframes',
  'prototyping',
  'usability testing',
  'accessibility',
  'visual hierarchy',
  'handoff',
  'portfolio capstone',
];

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function uxStudioBlueprintWithNativeEnrichment() {
  const blueprint = buildCourseBlueprint({
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic}`,
          learningGoals: `Use ${topic} to improve a studio project decision.`,
          learningObjectives: `Apply ${topic} in a design studio artifact and explain the evidence behind the decision.`,
          weeklyAssessments: `Week ${index + 1} assessment: ${topic} design prototype`,
          asyncActivities: `Review assigned UX materials and prepare notes on ${topic}.`,
          syncActivities: `Critique examples and practice applying ${topic}.`,
          supportingResources: `Open UX readings and studio examples for ${topic}.`,
        },
      ],
    })),
  });

  blueprint.lessons.forEach((lesson, index) => {
    const topic = UX_TOPICS[index];
    lesson.enrichment = {
      ...(lesson.enrichment || {}),
      assignmentCore: {
        parameters: [
          `Include two concrete ${topic} evidence points`,
          `Explain one ${topic} decision`,
          `Add one limitation for the Week ${index + 1} assessment`,
        ],
      },
      kernel: {
        facts: [`${topic} changes the next design decision when students test it with users`],
      },
    };
  });

  return blueprint;
}

describe('v0.15.105 UX texture tail rotation', () => {
  it('varies assignment, rubric, and lesson-plan scaffolds from the v0.15.104 fresh audit', () => {
    const compiled = compileBlueprintDeliverables(uxStudioBlueprintWithNativeEnrichment(), [
      'assignments',
      'rubrics',
      'lessonPlans',
    ]);

    const assignmentPackets = compiled.assignments.assignments.map((assignment) =>
      assignment.supportResources.join(' | '),
    );
    expect(new Set(assignmentPackets).size).toBeGreaterThanOrEqual(6);
    expect(assignmentPackets.join('\n')).not.toMatch(/notes and assigned readings/i);
    expect(assignmentPackets.join('\n')).not.toMatch(/Office hours or course communication channel/i);

    const parameterRows = compiled.rubrics.rubrics.map((rubric) => rubric.criteria[0]);
    const proficientBands = parameterRows.map((row) => row.proficient);
    expect(new Set(proficientBands).size).toBeGreaterThanOrEqual(4);
    expect(countMatches(proficientBands.join('\n'), /integration with the rest of .* assessment/i)).toBeLessThanOrEqual(
      3,
    );

    const taskDirections = compiled.rubrics.rubrics.map((rubric) => rubric.taskDirections);
    expect(new Set(taskDirections).size).toBeGreaterThanOrEqual(4);
    expect(countMatches(taskDirections.join('\n'), /and look for this evidence standard/i)).toBeLessThanOrEqual(3);

    const miniLessonDescriptions = compiled.lessonPlans.lessonPlans
      .map((plan) => plan.outline?.find((item) => item.type === 'Mini-lesson')?.description || '')
      .filter(Boolean);
    expect(miniLessonDescriptions).toHaveLength(12);
    expect(
      countMatches(miniLessonDescriptions.join('\n'), /build the explanation students will reuse/i),
    ).toBeLessThanOrEqual(2);
  });
});
