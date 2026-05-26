import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
} from '../courseBlueprintCompiler';
import { validateDeliverableGeneration } from '../deliverablePostProcess';

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
    expect(getBlueprintCompiledFeatures(['courseMap', 'syllabus', 'quizBank', 'studyGuides'])).toEqual([
      'syllabus',
      'studyGuides',
    ]);
    expect(getBlueprintCompiledFeatures(['syllabus'], { enabled: false })).toEqual([]);
  });

  it('compiles stable deliverables in existing app shapes', () => {
    const courseMap = makeCourseMap(6);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'rubrics',
      'assignments',
      'studyGuides',
      'courseFaq',
    ]);

    expect(compiled.syllabus.syllabus.courseTitle).toBe(courseMap.courseName);
    expect(compiled.syllabus.syllabus.weeklySchedule).toHaveLength(6);
    expect(compiled.assignments.assignments).toHaveLength(6);
    expect(compiled.rubrics.rubrics).toHaveLength(6);
    expect(compiled.studyGuides.studyGuides).toHaveLength(6);
    expect(compiled.courseFaq.faqs).toHaveLength(6);
    expect(compiled.courseFaq.faqs[0].qs).toHaveLength(5);
  });

  it('produces deliverables that pass existing generation validators', () => {
    const courseMap = makeCourseMap(5);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'rubrics',
      'assignments',
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
    expect(savedCalls).toBeLessThan(20);
  });
});
