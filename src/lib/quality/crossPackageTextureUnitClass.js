/**
 * Reader-visible prose registry for the cross-package texture audit.
 *
 * The compiled package contains many internal mirrors (sourceGrounding,
 * compiler receipts, alignment ledgers) that are not rendered as independent
 * prose. Counting every string in that graph inflates repetition with text a
 * professor never sees. This registry admits only known visible fields and
 * assigns every admitted unit one explicit class.
 */

export const CROSS_PACKAGE_UNIT_CLASS_VERSION = '1.0.0';

export const TEXTURE_UNIT_CLASS = Object.freeze({
  SCAFFOLDING: 'A',
  ALIGNMENT: 'B',
  TEACHING_PROSE: 'C',
});

const RULES = [
  {
    classId: TEXTURE_UNIT_CLASS.SCAFFOLDING,
    salience: 'low',
    owner: 'stable-scaffolding',
    patterns: [
      /\.academicIntegrity(?:Statement)?$/,
      /\.accessibilityAndUDL$/,
      /\.(?:attendance|communication|dataPrivacy|late|technology)Policy$/,
      /\.(?:accommodations|mentalHealth|supportServices|technicalSupport|titleIX)$/,
      /\.(?:duration|estimatedDuration|estimatedTime|workload|studentFacingEstimate)$/,
      /\.(?:expectedFile|expectedSubmissionFormat|formatRequirements\.[^.]+)$/,
      /\.(?:gradingWeightProvenance|weightProvenance)\.(?:rationale|reviewerAction)$/,
      /^syllabus\.syllabus\.courseRequirements\.#\.description$/,
      /^syllabus\.syllabus\.methodsStatement\.summary$/,
      /^courseFaq\.faqGuide\.purpose$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.ALIGNMENT,
    salience: 'medium',
    owner: 'intentional-alignment',
    patterns: [
      /\.(?:learningGoals|learningObjectives|learningOutcomes|objectives)\.#$/,
      /\.(?:assessmentCriteria|evaluationCriteria|gradingCriteria|highValueSuccessCriteria|successCriteria)\.#$/,
      /\.(?:objectiveAligned|criterion|criterionFocus|evidenceRequirement|evidenceStandard)$/,
      /\.(?:criterionWeightPlan|weightedGradingCriteria)\.#\.rationale$/,
      /\.objectiveEvidenceChecklist\.#\.feedback$/,
      /\.criterionObjectiveAlignment\.#\.rationale$/,
      /\.criteria\.#\.objectiveAlignmentEvidence\.rationale$/,
      /\.keyTerms\.#\.(?:definition|example|term)$/,
      /\.(?:lessonTitle|courseName|title)$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'lesson-plan-realization',
    patterns: [
      /^lessonPlans\.lessonPlans\.#\.studentFacingSummary\.(?:beforeClass|duringClass|afterClass)$/,
      /^lessonPlans\.lessonPlans\.#\.outline\.#\.(?:description|instructorNotes|instructorRole)$/,
      /^lessonPlans\.lessonPlans\.#\.warmUp\.(?:prompt|purpose|facilitation)$/,
      /^lessonPlans\.lessonPlans\.#\.formativeCheck\.(?:prompt|instructorAction)$/,
      /^lessonPlans\.lessonPlans\.#\.(?:calibrationCue|closingActivity\.(?:prompt|purpose|facilitation))$/,
      /^lessonPlans\.lessonPlans\.#\.classSessionPlan\.segments\.#\.purpose$/,
      /^lessonPlans\.lessonPlans\.#\.homework\.description$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'slide-realization',
    patterns: [
      /^slideDecks\.decks\.#\.slides\.#\.(?:notes|speakerNotes|body|content|description)$/,
      /^slideDecks\.decks\.#\.slides\.#\.bullets\.#$/,
      /^slideDecks\.decks\.#\.slides\.#\.visual\.description$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'assignment-realization',
    patterns: [
      /^assignments\.assignments\.#\.(?:overview|purpose|prompt|taskDescription|studentFacingPurpose)$/,
      /^assignments\.assignments\.#\.(?:instructions|deliverables)\.#$/,
      /^assignments\.assignments\.#\.(?:portfolioConnection|revisionCheck|feedbackLoop|instructorFeedbackPriority)$/,
      /^assignments\.assignments\.#\.scaffoldingMilestones\.#\.(?:description|feedback)$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'rubric-realization',
    patterns: [
      /^rubrics\.rubrics\.#\.(?:taskDirections|instructorFacilitationNote|calibrationProtocol|teacherNotes)$/,
      /^rubrics\.rubrics\.#\.anchorExamples\.#\.(?:description|feedback|sample)$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'discussion-realization',
    patterns: [
      /^discussions\.discussions\.#\.(?:context|prompt|prerequisitePrompt|anchorExamplePrompt|equityConsiderations)$/,
      /^discussions\.discussions\.#\.(?:followUpProbes|facilitationTips|responseStems|guidelines)\.#$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'high',
    owner: 'assessment-realization',
    patterns: [
      /^quizBank\.quizzes\.#\.questions\.#\.(?:question|q|stem|explanation|rationale|sampleAnswer|scoringGuidance|feedback)$/,
      /^quizBank\.quizzes\.#\.questions\.#\.answer$/,
      /^quizBank\.quizzes\.#\.formativeFeedbackNote$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'medium',
    owner: 'study-guide-realization',
    patterns: [
      /^studyGuides\.studyGuides\.#\.(?:summary|studentResources)$/,
      /^studyGuides\.studyGuides\.#\.(?:conceptConnections|commonMisconceptions|reviewQuestions|practiceActivities)\.#(?:\.[^.]+)?$/,
      /^studyGuides\.studyGuides\.#\.examPrep(?:\.[^.]+)*$/,
    ],
  },
  {
    classId: TEXTURE_UNIT_CLASS.TEACHING_PROSE,
    salience: 'medium',
    owner: 'faq-realization',
    patterns: [/^courseFaq\.faqs\.#\.qs\.#\.(?:q|an|question|answer)$/],
  },
];

const POSSIBLY_VISIBLE_FIELD =
  /\.(?:answer|an|body|bullets\.#|content|description|explanation|facilitation|feedback|guidance|instructorNotes|notes|prompt|purpose|q|question|rationale|sampleAnswer|speakerNotes|summary)$/;

export function classifyCrossPackageTexturePath(normalizedPath) {
  const path = String(normalizedPath || '');
  for (const rule of RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(path))) continue;
    return {
      classId: rule.classId,
      salience: rule.salience,
      owner: rule.owner,
      unitClassVersion: CROSS_PACKAGE_UNIT_CLASS_VERSION,
    };
  }
  if (POSSIBLY_VISIBLE_FIELD.test(path)) {
    return {
      classId: 'unclassified',
      salience: 'unknown',
      owner: 'unclassified-visible-field',
      unitClassVersion: CROSS_PACKAGE_UNIT_CLASS_VERSION,
    };
  }
  return null;
}

export function crossPackageTextureClassRules() {
  return RULES.map((rule) => ({
    classId: rule.classId,
    salience: rule.salience,
    owner: rule.owner,
    patterns: rule.patterns.map((pattern) => pattern.source),
  }));
}
