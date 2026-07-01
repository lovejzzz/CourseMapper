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

const GENERAL_TOPICS = [
  'community observation',
  'evidence notes',
  'stakeholder examples',
  'field comparison',
  'draft response',
  'peer review',
  'source synthesis',
  'presentation planning',
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

function weakGeneralCourseMap() {
  return {
    courseName: 'Interdisciplinary Community Seminar',
    lessons: GENERAL_TOPICS.map((topic, index) => ({
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

function weakPythonTwoSectionCourseMap() {
  const topics = [
    ['Introduction', 'Python basics'],
    ['Variables', 'Data types'],
    ['Conditionals', 'Boolean logic'],
    ['Loops', 'Iteration'],
    ['Functions', 'Parameters'],
    ['Lists', 'Strings'],
    ['Dictionaries', 'Sets'],
    ['Files', 'Exception handling'],
    ['Algorithms', 'Debugging'],
    ['Object-oriented programming', 'Classes'],
    ['Recursion', 'Problem solving'],
    ['Review', 'Project wrap-up'],
  ];
  return {
    courseName: 'Introduction to Computer Science with Python',
    lessons: topics.map((lessonTopics, lessonIndex) => ({
      title: `Lesson ${lessonIndex + 1}: ${lessonTopics.join(' and ')}`,
      sections: lessonTopics.map((topic, sectionIndex) => ({
        topicSection: `${lessonIndex + 1}.${sectionIndex + 1}: ${topic}`,
        learningGoals: '',
        learningObjectives: '',
        weeklyAssessments: '',
        asyncActivities: '',
        syncActivities: '',
        technologyNeeded: '',
        presentationFormat: '',
        supportingResources: '',
        evaluateDesign: '',
      })),
    })),
  };
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
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

  it('uses varied generic repairs instead of repeated evidence-check and assigned-material scaffolds', () => {
    const result = repairCourseMapReadiness({ courseMap: weakGeneralCourseMap() });
    const cells = result.courseMap.lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) => [
        section.weeklyAssessments,
        section.asyncActivities,
        section.syncActivities,
        section.technologyNeeded,
        section.supportingResources,
        section.evaluateDesign,
      ]),
    );
    const text = cells.join('\n');

    expect(text).not.toMatch(
      /Quick evidence check|closing evidence check|Review assigned materials|Read the assigned materials/i,
    );
    expect(text).not.toMatch(/Study the assigned materials|same evidence standard|same evidence of learning/i);
    expect(text).not.toMatch(
      /discipline-specific tools|Instructor-approved (?:readings, examples, or lab materials|source)/i,
    );
    expect(text).toMatch(/visible product|source detail|observable response|activity prompt/i);
    expect(new Set(cells.filter(Boolean)).size).toBeGreaterThan(GENERAL_TOPICS.length * 4);
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

  it('does not duplicate long Python evaluate-design scaffolds across two-section courses', () => {
    const result = repairCourseMapReadiness({ courseMap: weakPythonTwoSectionCourseMap() });
    const evaluateCells = result.courseMap.lessons.flatMap((lesson) =>
      lesson.sections.map((section) => section.evaluateDesign).filter(Boolean),
    );
    const text = evaluateCells.join('\n');

    expect(evaluateCells).toHaveLength(24);
    expect(new Set(evaluateCells).size).toBe(24);
    expect(count(text, /one observable behavior/gi)).toBe(0);
    expect(count(text, /same programming decision/gi)).toBe(0);
    expect(count(text, /visible code revision/gi)).toBe(0);
    expect(count(text, /boundary case across the activity and assessment/gi)).toBe(0);
    expect(text).toMatch(/starter file|runnable code|edge-case run|fresh run|trace table/i);
  });
});
