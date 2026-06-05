export const DEFAULT_SEMESTER = 'Fall 2026';

export const COMPILER_OWNED_STORAGE_FIELDS = [
  'compilerProofBundle',
  'assessmentArchitecture',
  'alignmentMatrix',
  'courseArc',
  'conceptDependencyGraph',
  'masteryEvidenceMap',
  'evidenceResponseMap',
  'objectiveEvidenceMap',
  'courseWorkload',
  'classroomHandoffPlan',
  'classroomDryRunPlan',
  'classroomEvidenceLoopPlan',
  'instructorFeedbackLoadPlan',
  'blueprintAssumptionLedger',
  'packageCoherenceMatrix',
  'blueprintReviewSurface',
  'compilerDecisionMatrix',
  'compilerPath',
  'semanticContract',
  'compilerContract',
];

export const SUPPORTED_CUSTOM_DELIVERABLES = {
  custom_feedbackForm: {
    id: 'custom_feedbackForm',
    name: 'Feedback Form',
    description: 'Per-lesson peer and instructor feedback form.',
    systemPrompt: 'Return one feedback form for each lesson.',
    userPromptTemplate: 'Generate one feedback form for each lesson. {{courseMap}}',
  },
  custom_projectMilestone: {
    id: 'custom_projectMilestone',
    name: 'Project Milestone Checklist',
    description: 'Per-lesson project milestone checklist.',
    systemPrompt: 'Return one project milestone checklist for each lesson.',
    userPromptTemplate: 'Generate one project milestone checklist for each lesson. {{courseMap}}',
  },
  custom_labReport: {
    id: 'custom_labReport',
    name: 'Lab Report',
    description: 'Per-lesson lab report shell.',
    systemPrompt: 'Return one lab report shell for each lesson.',
    userPromptTemplate: 'Generate one lab report shell for each lesson. {{courseMap}}',
  },
  custom_caseBrief: {
    id: 'custom_caseBrief',
    name: 'Case Brief',
    description: 'Per-lesson case brief shell.',
    systemPrompt: 'Return one case brief for each lesson.',
    userPromptTemplate: 'Generate one case brief for each lesson. {{courseMap}}',
  },
  custom_policyMemo: {
    id: 'custom_policyMemo',
    name: 'Policy Memo Checkpoint',
    description: 'Per-lesson policy memo checkpoint.',
    systemPrompt: 'Return one policy memo checkpoint for each lesson.',
    userPromptTemplate: 'Generate one policy memo checkpoint for each lesson. {{courseMap}}',
  },
  custom_observationChecklist: {
    id: 'custom_observationChecklist',
    name: 'Observation Checklist',
    description: 'Per-lesson observation checklist.',
    systemPrompt: 'Return one observation checklist for each lesson.',
    userPromptTemplate: 'Generate one observation checklist for each lesson. {{courseMap}}',
  },
  custom_selfAssessment: {
    id: 'custom_selfAssessment',
    name: 'Participation Self-Assessment',
    description: 'Per-lesson participation and self-assessment form.',
    systemPrompt: 'Return one participation self-assessment for each lesson.',
    userPromptTemplate: 'Generate one participation self-assessment for each lesson. {{courseMap}}',
  },
  custom_capstoneProgress: {
    id: 'custom_capstoneProgress',
    name: 'Capstone Progress Report',
    description: 'Per-lesson capstone progress report.',
    systemPrompt: 'Return one capstone progress report for each lesson.',
    userPromptTemplate: 'Generate one capstone progress report for each lesson. {{courseMap}}',
  },
  custom_problemSet: {
    id: 'custom_problemSet',
    name: 'Problem Set Worksheet',
    description: 'Per-lesson problem-set worksheet shell.',
    systemPrompt: 'Return one problem-set worksheet for each lesson.',
    userPromptTemplate: 'Generate one problem-set worksheet for each lesson. {{courseMap}}',
  },
};

export const UNKNOWN_CUSTOM_DELIVERABLES = {
  custom_wholeCourseFeedback: {
    id: 'custom_wholeCourseFeedback',
    name: 'Whole-Course Feedback Studio',
    description: 'A novel whole-course feedback system that is not safely per-lesson templated.',
    systemPrompt: 'Design a whole-course feedback system.',
    userPromptTemplate: 'Create a novel whole-course feedback system. {{courseMap}}',
  },
  custom_clinicalPolicyBinder: {
    id: 'custom_clinicalPolicyBinder',
    name: 'Clinical Policy Binder',
    description: 'A novel clinical policy binder requiring local institutional policy review.',
    systemPrompt: 'Create a clinical policy binder.',
    userPromptTemplate: 'Create a clinical policy binder. {{courseMap}}',
  },
};

export function makeCustomDeliverables(ids = []) {
  return Object.fromEntries(
    ids
      .map((id) => [id, SUPPORTED_CUSTOM_DELIVERABLES[id] || UNKNOWN_CUSTOM_DELIVERABLES[id]])
      .filter(([, def]) => def),
  );
}

export function topicAt(topics, index, theme) {
  if (topics?.[index]) return topics[index];
  return `${theme} applied practice ${index + 1}`;
}

export function makeScenarioCourseMap(definition) {
  const {
    courseName,
    lessonCount,
    theme,
    lens,
    artifact,
    evidence,
    asyncTask,
    syncTask,
    resource,
    evaluation,
    topics,
    caution = '',
  } = definition;

  const lessons = Array.from({ length: lessonCount }, (_, index) => {
    const lessonNumber = index + 1;
    const topic = topicAt(topics, index, theme);
    const cautionText = caution ? ` ${caution}` : '';
    return {
      title: `Lesson ${lessonNumber}: ${topic}`,
      sections: [
        {
          topicSection: `${topic}; ${lens}; ${evidence}; source-grounded practice ${lessonNumber}${cautionText}`,
          learningObjectives: `Analyze ${evidence} for ${topic}; evaluate tradeoffs in ${lens}; create or revise a ${artifact} with defensible evidence.`,
          learningGoals: `Students connect ${theme} concepts to an inspectable ${artifact} and explain how feedback improves the next decision.`,
          weeklyAssessments: `${artifact} ${lessonNumber}: evidence table, decision rationale, limitation note, feedback revision, and transfer reflection.`,
          asyncActivities: `${asyncTask}; annotate one source cue; draft a short evidence note for ${topic}.`,
          syncActivities: `${syncTask}; compare evidence; run a peer calibration check; revise the ${artifact}.`,
          technologyNeeded: `Shared workspace, accessible template, and source pack for ${topic}.`,
          presentationFormat: lessonCount === 1 ? 'single intensive workshop' : 'blended sequence with feedback loops',
          supportingResources: `${resource}; exemplar ${artifact}; accessibility checklist; local review note.`,
          evaluateDesign: `${evaluation}; score concept accuracy, evidence quality, reasoning, feedback uptake, and no-invention source boundaries.`,
        },
      ],
    };
  });

  return {
    courseName,
    semester: DEFAULT_SEMESTER,
    learningOutcomes: `Analyze ${theme} evidence; evaluate learner or stakeholder tradeoffs; create usable ${artifact} artifacts; revise work from feedback while respecting source and policy boundaries.`,
    lessons,
  };
}

export function scenario(definition) {
  const customDeliverables = makeCustomDeliverables(definition.customFeatureIds);
  return {
    ...definition,
    courseMap: makeScenarioCourseMap(definition),
    customDeliverables,
    storageRatioLimit: definition.lessonCount <= 1 ? 0.35 : definition.lessonCount <= 3 ? 0.25 : 0.18,
    exportFeatureIds:
      definition.exportFeatureIds || definition.featureIds.filter((id) => id !== 'slideDecks').slice(0, 3),
  };
}
