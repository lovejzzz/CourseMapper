import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSlideDeckIntermediateRepresentation,
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
} from '../courseBlueprintCompiler';
import { evaluateClassroomReadiness } from '../classroomReadiness';
import { validateDeliverableGeneration } from '../deliverablePostProcess';
import { deliverableToCsvRows } from '../exporters/csvExporter';
import { MESSY_IMPORT_STRESS_PROJECT } from '../../../scripts/hybridPipelineAudit.mjs';

let customDeliverables = {};

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => customDeliverables[id] || null),
}));

const makeCourseMap = (lessonCount = 6) => ({
  courseName: 'Applied Social Policy Studio',
  semester: 'Fall 2026',
  lessons: Array.from({ length: lessonCount }, (_, index) => ({
    title: `Lesson ${index + 1}: Policy Topic ${index + 1}`,
    sections: [
      {
        topicSection: `Policy Topic ${index + 1}; implementation context ${index + 1}`,
        learningObjectives: `Analyze policy evidence ${index + 1}; Evaluate implementation tradeoffs ${index + 1}`,
        learningGoals: `Connect policy design to client outcomes ${index + 1}`,
        weeklyAssessments: `Policy memo checkpoint ${index + 1}`,
        asyncActivities: `Read case packet ${index + 1}; annotate evidence`,
        syncActivities: `Small-group policy lab ${index + 1}; instructor debrief`,
        supportingResources: `Case packet ${index + 1}; data brief ${index + 1}`,
        evaluateDesign: `Score memo evidence and decision logic ${index + 1}`,
      },
    ],
  })),
});

describe('courseBlueprintCompiler', () => {
  beforeEach(() => {
    customDeliverables = {};
  });

  it('builds a reusable blueprint with lesson and assessment anchors', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(4));

    expect(blueprint.lessons).toHaveLength(4);
    expect(blueprint.assessments).toHaveLength(4);
    expect(blueprint.lessons[0]).toMatchObject({
      lessonNumber: 1,
      title: 'Lesson 1: Policy Topic 1',
    });
    expect(blueprint.assessments[0].relatedLessons[0]).toContain('Lesson 1');
  });

  it('filters selected features to the blueprint compiler set', () => {
    expect(getBlueprintCompiledFeatures(['courseMap', 'syllabus', 'lessonPlans', 'quizBank', 'studyGuides'])).toEqual([
      'syllabus',
      'lessonPlans',
      'quizBank',
      'studyGuides',
    ]);
    expect(getBlueprintCompiledFeatures(['syllabus'], { enabled: false })).toEqual([]);
  });

  it('compiles stable deliverables in existing app shapes', () => {
    const courseMap = makeCourseMap(6);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ]);

    expect(compiled.syllabus.syllabus.courseTitle).toBe(courseMap.courseName);
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(6);
    expect(compiled.lessonPlans.lessonPlans[0].outline).toHaveLength(6);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.studentHandout).toContain('success criteria');
    expect(compiled.slideDecks.decks).toHaveLength(6);
    expect(compiled.slideDecks.decks[0].slides).toHaveLength(12);
    expect(compiled.syllabus.syllabus.weeklySchedule).toHaveLength(6);
    expect(compiled.assignments.assignments).toHaveLength(6);
    expect(compiled.rubrics.rubrics).toHaveLength(6);
    expect(compiled.discussions.discussions).toHaveLength(6);
    expect(compiled.discussions.discussions[0].followUpProbes).toHaveLength(5);
    expect(compiled.quizBank.quizzes).toHaveLength(6);
    expect(compiled.quizBank.quizzes[0].questions).toHaveLength(6);
    expect(compiled.quizBank.bankIndex).toHaveLength(36);
    expect(compiled.studyGuides.studyGuides).toHaveLength(6);
    expect(compiled.courseFaq.faqs).toHaveLength(6);
    expect(compiled.courseFaq.faqs[0].qs).toHaveLength(5);
  });

  it('honors configured Course FAQ question targets for compiled output', () => {
    const courseMap = makeCourseMap(4);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 6 } },
    });

    expect(compiled.courseFaq.faqs).toHaveLength(4);
    expect(compiled.courseFaq.faqs.every((lesson) => lesson.qs.length === 6)).toBe(true);

    const validation = validateDeliverableGeneration('courseFaq', compiled.courseFaq, {
      expectedLessonCount: 4,
      config: { questionsPerLesson: 6 },
    });
    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
  });

  it('produces deliverables that pass existing generation validators', () => {
    const courseMap = makeCourseMap(5);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ]);

    for (const featureId of Object.keys(compiled)) {
      const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
        expectedLessonCount: 5,
        config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
      });
      expect(validation.valid, `${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
    }
  });

  it('estimates avoided chunk calls for compiled features', () => {
    const savedCalls = estimateBlueprintCompilerSavings(['syllabus', 'assignments', 'quizBank', 'courseFaq'], 14);

    expect(savedCalls).toBeGreaterThan(0);
    expect(savedCalls).toBeLessThan(25);
  });

  it('builds slide IR and sparse assessment fallbacks before compiling rich features', () => {
    const sparseMap = makeCourseMap(3);
    sparseMap.lessons[1].sections[0].weeklyAssessments = '';
    sparseMap.lessons[1].sections[0].evaluateDesign = '';

    const blueprint = buildCourseBlueprint(sparseMap);
    const ir = buildSlideDeckIntermediateRepresentation(blueprint);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks', 'quizBank', 'assignments']);

    expect(blueprint.lessons[1].assessmentSource).toBe('sparse-fallback');
    expect(blueprint.lessons[1].studentArtifact).toContain('Concept check');
    expect(ir.decks[1].slides.map((slide) => slide.type)).toContain('activity');
    expect(compiled.slideDecks.decks[1].slideDeckSequenceGuide.cumulativeAssessmentMap).toContain(
      blueprint.lessons[1].studentArtifact,
    );
    expect(compiled.quizBank.quizzes[1].questions.some((question) => question.bloomsLevel === 'Create')).toBe(true);
    expect(compiled.assignments.assignments[1].title).toContain('Concept check');
  });

  it('keeps compiled messy-import slide decks specific enough for classroom readiness', () => {
    const blueprint = buildCourseBlueprint(MESSY_IMPORT_STRESS_PROJECT.courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks']);

    const result = evaluateClassroomReadiness({
      courseMap: MESSY_IMPORT_STRESS_PROJECT.courseMap,
      selectedFeatures: ['slideDecks'],
      deliverables: {
        slideDecks: {
          status: 'done',
          data: compiled.slideDecks,
        },
      },
    });

    expect(result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate'))).toBe(false);
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.cumulativeAssessmentMap).toContain(
      'practice slides reinforce',
    );
    expect(compiled.slideDecks.decks[0].slides[0].notes).toContain('working session');
  });

  it('compiles predictable weekly reflection custom deliverables from the blueprint', () => {
    customDeliverables = {
      custom_weeklyReflection: {
        id: 'custom_weeklyReflection',
        name: 'Weekly Reflection',
        description: 'A per-week reflection and check-in for each lesson.',
        systemPrompt:
          'Create one Weekly Reflection item for each lesson/week with a reflection prompt and check-in guidance.',
        userPromptTemplate:
          'Generate a Weekly Reflection for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
    };

    const blueprint = buildCourseBlueprint(makeCourseMap(5), { scopeIndices: [1, 2, 4] });
    const compiled = compileBlueprintDeliverables(blueprint, ['custom_weeklyReflection']);
    const reflection = compiled.custom_weeklyReflection;

    expect(getBlueprintCompiledFeatures(['custom_weeklyReflection', 'custom_unknown'])).toEqual([
      'custom_weeklyReflection',
    ]);
    expect(reflection.deliverableName).toBe('Weekly Reflection');
    expect(reflection.weekly_reflection).toHaveLength(3);
    expect(reflection.weekly_reflection.map((item) => item.lessonTitle)).toEqual([
      'Lesson 2: Policy Topic 2',
      'Lesson 3: Policy Topic 3',
      'Lesson 5: Policy Topic 5',
    ]);
    expect(reflection.weekly_reflection.every((item) => item.promptTitle.includes('Weekly Reflection'))).toBe(true);

    const validation = validateDeliverableGeneration('custom_weeklyReflection', reflection, {
      expectedLessonCount: 3,
    });
    const csv = deliverableToCsvRows('custom_weeklyReflection', reflection);

    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
    expect(csv.headers).toContain('Prompt Title');
    expect(csv.rows).toHaveLength(3);
  });

  it('compiles predictable per-lesson reading response custom deliverables from the blueprint', () => {
    customDeliverables = {
      custom_readingResponse: {
        id: 'custom_readingResponse',
        name: 'Lesson Reading Response',
        description: 'A per-lesson reading response for each week in the course.',
        systemPrompt:
          'Create one Lesson Reading Response item for each lesson/week with a reading-based prompt and submission checklist.',
        userPromptTemplate:
          'Generate one Lesson Reading Response for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
      custom_readingReflection: {
        id: 'custom_readingReflection',
        name: 'Lesson Reading Reflection',
        description: 'A per-lesson reading reflection for each week in the course.',
        systemPrompt:
          'Create one Lesson Reading Reflection item for each lesson/week with a reading-based prompt and submission checklist.',
        userPromptTemplate:
          'Generate one Lesson Reading Reflection for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
    };

    const blueprint = buildCourseBlueprint(makeCourseMap(5), { scopeIndices: [0, 2, 3] });
    const compiled = compileBlueprintDeliverables(blueprint, ['custom_readingResponse']);
    const readingResponse = compiled.custom_readingResponse;

    expect(getBlueprintCompiledFeatures(['custom_readingResponse', 'custom_unknown'])).toEqual([
      'custom_readingResponse',
    ]);
    expect(getBlueprintCompiledFeatures(['custom_readingReflection'])).toEqual(['custom_readingReflection']);
    expect(readingResponse.deliverableName).toBe('Lesson Reading Response');
    expect(readingResponse.lesson_reading_response).toHaveLength(3);
    expect(readingResponse.lesson_reading_response.map((item) => item.lessonTitle)).toEqual([
      'Lesson 1: Policy Topic 1',
      'Lesson 3: Policy Topic 3',
      'Lesson 4: Policy Topic 4',
    ]);
    expect(
      readingResponse.lesson_reading_response.every((item) => item.promptTitle.includes('Lesson Reading Response')),
    ).toBe(true);

    const validation = validateDeliverableGeneration('custom_readingResponse', readingResponse, {
      expectedLessonCount: 3,
    });
    const csv = deliverableToCsvRows('custom_readingResponse', readingResponse);

    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
    expect(csv.headers).toContain('Prompt Title');
    expect(csv.rows).toHaveLength(3);
  });
});
