import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiCostPlan } from '../apiCostControl';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
} from '../courseBlueprintCompiler';
import { validateDeliverableGeneration } from '../deliverablePostProcess';
import { scoreHeuristic } from '../deliverableQualityScorer';

let customDeliverables = {};

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => customDeliverables[id] || null),
}));

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
  beforeEach(() => {
    customDeliverables = {};
  });

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

  it('removes planned provider calls for compiled weekly reflection customs while leaving unknown customs on the model path', () => {
    customDeliverables = {
      custom_weeklyReflection: {
        id: 'custom_weeklyReflection',
        name: 'Weekly Reflection',
        description: 'Per-week reflection and check-in prompts for each lesson.',
        systemPrompt: 'Return one Weekly Reflection item for each lesson/week.',
        userPromptTemplate: 'Generate one reflection for each lesson/week. {{courseMap}}',
      },
      custom_unknown: {
        id: 'custom_unknown',
        name: 'Studio Artifact Pack',
        description: 'Flexible materials for studio facilitation.',
        systemPrompt: 'Generate custom studio materials.',
        userPromptTemplate: 'Create the custom deliverable for the course. {{courseMap}}',
      },
    };

    const featureIds = ['custom_weeklyReflection', 'custom_unknown'];
    const compiledFeatureIds = getBlueprintCompiledFeatures(featureIds);
    const modelFeatureIds = featureIds.filter((featureId) => !compiledFeatureIds.includes(featureId));
    const baselinePlan = buildApiCostPlan({
      featureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });
    const hybridPlan = buildApiCostPlan({
      featureIds: modelFeatureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });

    expect(compiledFeatureIds).toEqual(['custom_weeklyReflection']);
    expect(modelFeatureIds).toEqual(['custom_unknown']);
    expect(estimateBlueprintCompilerSavings(compiledFeatureIds, 8)).toBeGreaterThan(0);
    expect(baselinePlan.deliverableChunkCalls - hybridPlan.deliverableChunkCalls).toBe(
      estimateBlueprintCompilerSavings(compiledFeatureIds, 8),
    );
  });

  it('removes planned provider calls for compiled reading response customs while leaving unknown customs on the model path', () => {
    customDeliverables = {
      custom_readingResponse: {
        id: 'custom_readingResponse',
        name: 'Lesson Reading Response',
        description: 'Per-week reading response prompts for each lesson.',
        systemPrompt: 'Return one Lesson Reading Response item for each lesson/week.',
        userPromptTemplate: 'Generate one Lesson Reading Response for each lesson/week. {{courseMap}}',
      },
      custom_unknown: {
        id: 'custom_unknown',
        name: 'Studio Artifact Pack',
        description: 'Flexible materials for studio facilitation.',
        systemPrompt: 'Generate custom studio materials.',
        userPromptTemplate: 'Create the custom deliverable for the course. {{courseMap}}',
      },
    };

    const featureIds = ['custom_readingResponse', 'custom_unknown'];
    const compiledFeatureIds = getBlueprintCompiledFeatures(featureIds);
    const modelFeatureIds = featureIds.filter((featureId) => !compiledFeatureIds.includes(featureId));
    const baselinePlan = buildApiCostPlan({
      featureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });
    const hybridPlan = buildApiCostPlan({
      featureIds: modelFeatureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });

    expect(compiledFeatureIds).toEqual(['custom_readingResponse']);
    expect(modelFeatureIds).toEqual(['custom_unknown']);
    expect(estimateBlueprintCompilerSavings(compiledFeatureIds, 8)).toBeGreaterThan(0);
    expect(baselinePlan.deliverableChunkCalls - hybridPlan.deliverableChunkCalls).toBe(
      estimateBlueprintCompilerSavings(compiledFeatureIds, 8),
    );
  });

  it('removes planned provider calls for supported structured custom families while preserving model fallback for unknown customs', () => {
    customDeliverables = {
      custom_feedbackForm: {
        id: 'custom_feedbackForm',
        name: 'Feedback Form',
        description: 'Per-week peer feedback form for each lesson.',
        systemPrompt: 'Return one feedback form for each lesson/week.',
        userPromptTemplate: 'Generate one feedback form for each lesson/week. {{courseMap}}',
      },
      custom_labReport: {
        id: 'custom_labReport',
        name: 'Lab Report',
        description: 'Per-week lab report shell for each lesson.',
        systemPrompt: 'Return one lab report for each lesson/week.',
        userPromptTemplate: 'Generate one lab report for each lesson/week. {{courseMap}}',
      },
      custom_policyMemo: {
        id: 'custom_policyMemo',
        name: 'Policy Memo Checkpoint',
        description: 'Per-week policy memo checkpoint for each lesson.',
        systemPrompt: 'Return one policy memo checkpoint for each lesson/week.',
        userPromptTemplate: 'Generate one policy memo checkpoint for each lesson/week. {{courseMap}}',
      },
      custom_unknown: {
        id: 'custom_unknown',
        name: 'Studio Artifact Pack',
        description: 'Flexible materials for studio facilitation.',
        systemPrompt: 'Generate custom studio materials.',
        userPromptTemplate: 'Create the custom deliverable for the course. {{courseMap}}',
      },
      custom_wholeCourseFeedback: {
        id: 'custom_wholeCourseFeedback',
        name: 'Feedback Form',
        description: 'Whole-course feedback form.',
        systemPrompt: 'Return one whole-course feedback form.',
        userPromptTemplate: 'Generate a single feedback form for the full course. {{courseMap}}',
      },
    };

    const featureIds = [
      'custom_feedbackForm',
      'custom_labReport',
      'custom_policyMemo',
      'custom_unknown',
      'custom_wholeCourseFeedback',
    ];
    const compiledFeatureIds = getBlueprintCompiledFeatures(featureIds);
    const modelFeatureIds = featureIds.filter((featureId) => !compiledFeatureIds.includes(featureId));
    const baselinePlan = buildApiCostPlan({
      featureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });
    const hybridPlan = buildApiCostPlan({
      featureIds: modelFeatureIds,
      lessonCount: 8,
      includeRepairRetryReserve: false,
    });

    expect(compiledFeatureIds).toEqual(['custom_feedbackForm', 'custom_labReport', 'custom_policyMemo']);
    expect(modelFeatureIds).toEqual(['custom_unknown', 'custom_wholeCourseFeedback']);
    expect(estimateBlueprintCompilerSavings(compiledFeatureIds, 8)).toBeGreaterThan(0);
    expect(baselinePlan.deliverableChunkCalls - hybridPlan.deliverableChunkCalls).toBe(
      estimateBlueprintCompilerSavings(compiledFeatureIds, 8),
    );
  });
});
