import { describe, expect, it } from 'vitest';
import {
  buildSlideDeckIntermediateRepresentation,
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
} from '../courseBlueprintCompiler';
import { evaluateClassroomReadiness } from '../classroomReadiness';
import { validateDeliverableGeneration } from '../deliverablePostProcess';
import { MESSY_IMPORT_STRESS_PROJECT } from '../../../scripts/hybridPipelineAudit.mjs';

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
});
