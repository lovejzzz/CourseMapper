import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { courseIRToCourseMap } from '../src/lib/courseIR.js';

const GENERIC_PUBLICATION_CONSTRAINT =
  'Confirm local timing, modality, accessibility, source permissions, and grading policy before publishing.';
const WORKSHOP_SHINGLE = 'the draft must show how the lesson evidence changes the work';

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

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function stringValues(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValues);
  return [];
}

function uxCourseMapWithRepeatedConstraint() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: `Use ${topic.toLowerCase()} to make design decisions.`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a user evidence artifact.`,
          weeklyAssessments: `${topic} design studio checkpoint`,
          asyncActivities: `Review assigned ${topic.toLowerCase()} materials.`,
          syncActivities: `Critique ${topic.toLowerCase()} evidence with peers.`,
          supportingResources: `Constraint: ${GENERIC_PUBLICATION_CONSTRAINT}`,
        },
      ],
    })),
  };
}

function uxCourseIRWithCourseConstraint() {
  return {
    course: { title: 'User Experience Design Studio' },
    constraints: [{ id: 'K1', scope: 'course', text: GENERIC_PUBLICATION_CONSTRAINT, severity: 'review' }],
    concepts: UX_TOPICS.map((topic, index) => ({
      id: `C${index + 1}`,
      term: topic,
      definition: `${topic} helps designers make evidence-backed product decisions.`,
    })),
    lessons: UX_TOPICS.map((topic, index) => ({
      id: `L${index + 1}`,
      title: `Lesson ${index + 1}: ${topic}`,
      topic,
      conceptIds: [`C${index + 1}`],
      outcomes: [
        {
          statement: `Apply ${topic.toLowerCase()} to a UX studio decision.`,
          conceptIds: [`C${index + 1}`],
          sourceRefs: [],
        },
      ],
      syncActivities: [`Critique ${topic.toLowerCase()} evidence with peers.`],
      practiceItems: [`Use ${topic.toLowerCase()} in a studio artifact.`],
    })),
  };
}

describe('v0.15.134 lesson plan texture variation', () => {
  it('localizes a generic CourseIR publication constraint before rendering Course Map resources', () => {
    const courseMap = courseIRToCourseMap(uxCourseIRWithCourseConstraint());
    const text = stringValues(courseMap).join('\n');
    const resourceLines = courseMap.lessons.map((lesson) => lesson.sections[0].supportingResources);

    expect(text).not.toContain(`Constraint: ${GENERIC_PUBLICATION_CONSTRAINT}`);
    expect(count(text, /source permissions/gi)).toBeGreaterThanOrEqual(UX_TOPICS.length);
    expect(new Set(resourceLines).size).toBeGreaterThan(4);
  });

  it('does not stamp the same publication and workshop scaffolds through every deep lesson plan', () => {
    const blueprint = buildCourseBlueprint(uxCourseMapWithRepeatedConstraint());
    blueprint.lessons.forEach((lesson, index) => {
      lesson.enrichment = {
        keyTerms: [
          {
            term: `${UX_TOPICS[index]} evidence`,
            definition: `${UX_TOPICS[index]} evidence helps designers justify a visible product decision.`,
          },
        ],
        kernel: { facts: [] },
      };
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: { lessonPlans: { depth: 'deep' } },
    });
    const text = stringValues(compiled.lessonPlans).join('\n');
    const materialsText = compiled.lessonPlans.lessonPlans.flatMap((plan) => plan.materials || []).join('\n');

    expect(text).not.toContain(GENERIC_PUBLICATION_CONSTRAINT);
    expect(text).not.toContain(WORKSHOP_SHINGLE);
    expect(materialsText).not.toMatch(/(?:constraint:|before publishing|source permissions)/i);
    expect(
      count(
        text,
        /lesson evidence changed (?:the work|it)|evidence shifted the choice|evidence behind the changed decision|evidence that changed their next step/gi,
      ),
    ).toBeGreaterThanOrEqual(UX_TOPICS.length);
  });
});
