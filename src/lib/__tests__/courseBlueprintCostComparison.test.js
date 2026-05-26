import { describe, expect, it } from 'vitest';
import { buildApiCostPlan } from '../apiCostControl';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
} from '../courseBlueprintCompiler';
import { validateDeliverableGeneration } from '../deliverablePostProcess';
import { scoreHeuristic } from '../deliverableQualityScorer';

const ALL_DELIVERABLE_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'assignments',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

function makeRealisticCourseMap(lessonCount = 14) {
  return {
    courseName: 'Data-Driven Public Service Studio',
    semester: 'Fall 2026',
    learningOutcomes:
      'Analyze civic data sources; evaluate policy tradeoffs; create evidence-based service improvement proposals; communicate findings to stakeholders.',
    lessons: Array.from({ length: lessonCount }, (_, index) => {
      const week = index + 1;
      return {
        title: `Week ${week}: Public Service Analytics Sprint ${week}`,
        sections: [
          {
            topicSection: `Civic analytics case ${week}: data quality, stakeholder needs, ethical constraints, and implementation risk`,
            learningObjectives: `Analyze dataset limitations for case ${week}; evaluate service equity tradeoffs; create a decision memo with evidence and recommendations`,
            learningGoals: `Students connect measurable objectives, learner-centered analysis, and stakeholder communication for public service improvement.`,
            weeklyAssessments: `Portfolio memo ${week}: evidence table, risk assessment, policy recommendation, and reflection on support needs`,
            asyncActivities: `Review case packet ${week}; clean a small dataset; complete an accessible template; draft evidence notes`,
            syncActivities: `Collaborative lab ${week}; peer critique; instructor calibration against rubric criteria; debrief on support resources`,
            supportingResources: `Case packet ${week}; data dictionary; example memo; office-hours guide; accessibility checklist`,
            evaluateDesign: `Score memo against rubric criteria for evidence quality, objective alignment, actionability, and ethical reasoning`,
          },
        ],
      };
    }),
  };
}

function averageQuality(score) {
  return (score.bloomsAlignment + score.specificity + score.actionability + score.qmAlignment) / 4;
}

describe('blueprint compiler cost comparison sample', () => {
  it('cuts provider calls on a realistic package while preserving validator-backed quality', () => {
    const courseMap = makeRealisticCourseMap();
    const lessonCount = courseMap.lessons.length;
    const compiledFeatureIds = getBlueprintCompiledFeatures(ALL_DELIVERABLE_FEATURES);
    const modelFeatureIds = ALL_DELIVERABLE_FEATURES.filter((featureId) => !compiledFeatureIds.includes(featureId));

    const baselinePlan = buildApiCostPlan({
      featureIds: ALL_DELIVERABLE_FEATURES,
      lessonCount,
      includeRepairRetryReserve: false,
    });
    const hybridPlan = buildApiCostPlan({
      featureIds: modelFeatureIds,
      lessonCount,
      includeRepairRetryReserve: false,
    });
    const savedCalls = estimateBlueprintCompilerSavings(compiledFeatureIds, lessonCount);

    expect(compiledFeatureIds).toEqual([
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
    expect(modelFeatureIds).toEqual([]);
    expect(baselinePlan.deliverableChunkCalls - hybridPlan.deliverableChunkCalls).toBe(savedCalls);
    expect(savedCalls).toBeGreaterThanOrEqual(20);
    expect(hybridPlan.deliverableChunkCalls).toBe(0);

    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, compiledFeatureIds, {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });

    expect(compiled.slideDecks.decks).toHaveLength(lessonCount);
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(lessonCount);
    expect(compiled.quizBank.quizzes).toHaveLength(lessonCount);

    for (const featureId of compiledFeatureIds) {
      const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
        expectedLessonCount: lessonCount,
        config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
      });
      const quality = scoreHeuristic(featureId, compiled[featureId]);

      expect(validation.valid, `${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
      expect(averageQuality(quality), featureId).toBeGreaterThanOrEqual(6);
    }
  });
});
