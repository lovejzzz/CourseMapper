import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness.js';

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

const CS_TOPICS = [
  'variables',
  'data types',
  'conditionals',
  'loops',
  'functions',
  'lists',
  'dictionaries',
  'strings',
  'file input',
  'debugging',
  'testing',
  'final Python project',
];

function uxStudioCourseMap() {
  return {
    courseName: 'User Experience Design Studio',
    lessons: UX_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningGoals: `Use ${topic.toLowerCase()} to improve a UX artifact.`,
          learningObjectives: `Explain ${topic.toLowerCase()} and apply it to a design decision.`,
          weeklyAssessments: `${topic} studio checkpoint`,
          asyncActivities: `Prepare ${topic.toLowerCase()} notes`,
          syncActivities: `Critique the ${topic.toLowerCase()} artifact`,
          supportingResources: `UX reading packet on ${topic.toLowerCase()}`,
        },
      ],
    })),
  };
}

function weakPythonCourseMap() {
  return {
    courseName: 'Introduction to Computer Science with Python',
    lessons: CS_TOPICS.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic}`,
          learningGoals: '',
          learningObjectives: '',
          weeklyAssessments: '',
          asyncActivities: '',
          syncActivities: '',
          technologyNeeded: '',
          presentationFormat: '',
          supportingResources: '',
          evaluateDesign: '',
        },
      ],
    })),
  };
}

describe('v0.15.127 texture variation', () => {
  it('does not repeat the same UX studio scaffolds across every compiled lesson', () => {
    const blueprint = buildCourseBlueprint(uxStudioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'slideDecks']);
    const plansText = JSON.stringify(compiled.lessonPlans);
    const decksText = JSON.stringify(compiled.slideDecks);

    expect(plansText.match(/Whole class, then quick pair share/g) || []).toHaveLength(0);
    expect(decksText.match(/Close with the handoff/g) || []).toHaveLength(0);
    expect(
      decksText.match(
        /collect critique notes, usability evidence, and rationale changes before the next iteration/gi,
      ) || [],
    ).toHaveLength(0);
    expect(
      decksText.match(/cite specific user research findings instead of general impressions/gi) || [],
    ).not.toHaveLength(UX_TOPICS.length);
  });

  it('varies generic course-map fallback review language by lesson and section', () => {
    const courseMap = uxStudioCourseMap();
    const weakMap = {
      ...courseMap,
      lessons: courseMap.lessons.map((lesson) => ({
        ...lesson,
        sections: lesson.sections.map((section) => ({
          ...section,
          evaluateDesign: '',
        })),
      })),
    };

    const result = repairCourseMapReadiness({ courseMap: weakMap });
    const reviewCells = result.courseMap.lessons.flatMap((lesson) =>
      lesson.sections.map((section) => section.evaluateDesign).filter(Boolean),
    );

    expect(new Set(reviewCells).size).toBeGreaterThan(3);
    expect(reviewCells.join('\n').match(/same evidence of learning/g) || []).not.toHaveLength(UX_TOPICS.length);
  });

  it('uses CS/Python-specific Course Map repairs instead of generic assigned-materials scaffolds', () => {
    const result = repairCourseMapReadiness({ courseMap: weakPythonCourseMap() });
    const cells = result.courseMap.lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) => [
        section.asyncActivities,
        section.syncActivities,
        section.technologyNeeded,
        section.presentationFormat,
        section.supportingResources,
        section.evaluateDesign,
      ]),
    );
    const text = cells.join('\n');

    expect(text).not.toMatch(/Review assigned materials|Read the assigned materials|Study the assigned materials/i);
    expect(text).not.toMatch(/discipline-specific tools|same evidence of learning|course activities/i);
    expect(text).toMatch(/Python|code|debug|test|output|program/i);
    expect(new Set(cells.filter(Boolean)).size).toBeGreaterThan(CS_TOPICS.length * 4);
  });
});
