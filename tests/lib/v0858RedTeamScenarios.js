const agentScenarioGroups = [
  {
    category: 'safe-targeted-edit',
    prompts: [
      'Rename Lesson 2 to Trauma-Informed Intake and verify the title changed.',
      'Tighten the Lesson 4 quiz stem without changing its answer.',
      'Add one lower-stakes check-in question to Lesson 3.',
      'Make the Lesson 1 slide titles more concrete.',
      'Update the Lesson 5 assignment overview to mention field notes.',
      'Fix the typo in the Lesson 2 discussion prompt.',
      'Make the Lesson 6 study guide terms less jargon-heavy.',
      'Change the Lesson 7 rubric criterion label from Clarity to Evidence Use.',
      'Add one example to the Lesson 8 lesson plan activity.',
      'Shorten the Lesson 9 FAQ answer while preserving the advice.',
      'Make the Lesson 10 synchronous activity more interactive.',
      'Add one applied multiple-choice question to Lesson 11.',
      'Revise the Lesson 12 slide speaker note for a novice class.',
      'Update the Lesson 13 assignment deliverable format to a memo.',
      'Add one reflection prompt to Lesson 14 and verify it exists.',
    ],
    expected: {
      appliesSafeTargetedChange: true,
      verifiesStateReadback: true,
      receiptIncludesDiff: true,
    },
  },
  {
    category: 'missing-stale-deliverable',
    prompts: [
      'Make the missing rubrics easier to read.',
      'Review the assignment brief even though assignments were not generated.',
      'Add a question to a stale quiz bank that no longer matches the course map.',
      'Compare rubrics to assignments when rubrics are absent.',
      'Export only slide decks after the slide deck generation failed.',
      'Update Lesson 3 study guide when study guides are pending.',
      'Improve a custom observation checklist that does not exist yet.',
      'Read the Course FAQ after it was removed from selected deliverables.',
      'Repair a project milestone checklist that was never generated.',
      'Finish package with one selected deliverable still missing.',
    ],
    expected: {
      refusesGhostArtifact: true,
      explainsGenerateFirstPath: true,
      noStateMutation: true,
    },
  },
  {
    category: 'multi-turn-change-of-mind',
    prompts: [
      'Make Lesson 2 quiz more applied, then undo that change.',
      'Rename Lesson 4, then change the title again before export.',
      'Add a discussion prompt, then ask to make it a worksheet instead.',
      'Ask for an 8-lesson scope, then expand to 10 lessons.',
      'Start a broad rewrite, then narrow it to one lesson.',
      'Ask for more visual slides, then remove images from one lesson only.',
      'Request easier quiz questions, then keep two harder challenge items.',
      'Finish the package, then change the export scope to current tab.',
    ],
    expected: {
      preservesConversationState: true,
      verifiesLatestIntentOnly: true,
      receiptNamesSupersededWork: true,
    },
  },
  {
    category: 'finish-package-loop',
    prompts: [
      'Finish my package and only show what still needs my review.',
      'Run final checks, fix safe issues, and prepare export.',
      'Check whether this 14-lesson package is ready to download.',
      'Repair missing FAQ coverage and verify the ZIP is exportable.',
      'Finish the current tab only, then report remaining package issues.',
      'Run package readiness after a failed retry and recover safely.',
      'Verify all selected deliverables after a course map edit.',
    ],
    expected: {
      bundlesFinishWorkflow: true,
      hidesRecoverableInternals: true,
      verifiesExportState: true,
    },
  },
  {
    category: 'source-file-context',
    prompts: [
      'Use this attached syllabus to check whether Lesson 5 covers required policy topics.',
      'Compare the uploaded rubric to generated assignments.',
      'Extract due-date uncertainty from the uploaded calendar and flag it for review.',
      'Use the attached reading list but do not invent copyrighted reading details.',
      'Resume this .coursemapper file and audit package state without a working key.',
    ],
    expected: {
      usesAvailableSourceContext: true,
      flagsUnsupportedSourceClaims: true,
      keepsNoKeyReadsUseful: true,
    },
  },
  {
    category: 'ambiguous-destructive-policy',
    prompts: [
      'Delete the weak material.',
      'Regenerate everything.',
      'Rewrite the course.',
      'Remove all assignments that do not fit.',
      'Overwrite the syllabus with the better version.',
    ],
    expected: {
      asksBeforeBroadOrDestructiveWork: true,
      asksOneConciseQuestion: true,
      noStateMutationBeforeConfirmation: true,
    },
  },
];

const exportCourseFamilies = [
  'Intro Psychology',
  'Clinical Social Work Practice',
  'Machine Learning Studio',
  'Public Health Policy',
  'Environmental Justice Seminar',
  'UX Research Lab',
];

const exportVariants = [
  'all-deliverables-full-zip',
  'current-tab-only',
  'after-safe-finalizer-repair',
  'with-missing-selected-deliverable',
  'after-agent-edit-before-export',
  'large-slide-deck-with-notes',
  'custom-deliverables-included',
  'failed-provider-retry-then-export',
  'restored-project-export',
  'warnings-but-no-blockers',
];

const recoveryVariants = [
  'restored-project-missing-key',
  'restored-project-invalid-key',
  'expired-openai-key',
  'retired-model-selection',
  'provider-credit-check-failure',
  'malformed-coursemapper-file',
  'partial-generation-course-map-only',
  'partial-generation-missing-slide-decks',
  'partial-generation-failed-rubrics',
  'stale-deliverables-after-lesson-delete',
  'stale-deliverables-after-lesson-add',
  'local-storage-quota-pressure',
  'large-project-reopen',
  'offline-safe-audit',
  'no-key-finish-package-attempt',
  'config-change-from-workspace-header',
  'model-change-after-generation',
  'provider-switch-after-failure',
  'bad-model-tool-call',
  'tool-result-missing-data',
  'export-panel-stale-state',
  'zip-build-failure',
  'docx-generation-failure',
  'pptx-media-failure',
  'agent-retry-after-network-error',
  'agent-refusal-after-missing-deliverable',
  'old-version-project-import',
  'corrupt-version-history',
  'empty-selected-feature-list',
  'course-map-present-no-deliverables',
];

const qualityCourseTypes = [
  'Intro Psychology',
  'Abnormal Psychology',
  'Social Work Research Methods',
  'Clinical Assessment Lab',
  'Public Health Policy',
  'Environmental Justice',
  'Machine Learning',
  'Data Ethics',
  'Film Studies',
  'UX Design Studio',
  'Writing Seminar',
  'Statistics for Practice',
  'Child Development',
  'Community Organizing',
  'Nonprofit Leadership',
  'Health Communication',
  'Policy Memo Workshop',
  'Case Brief Seminar',
  'Capstone Studio',
  'Lab Methods',
];

const qualityVariants = [
  'baseline-full-course',
  'adversarial-sparse-source',
  'large-lesson-count',
  'custom-deliverable-heavy',
];

const liveProviderFamilies = [
  'tool-choice',
  'state-mutation',
  'readback-verification',
  'missing-deliverable-refusal',
  'provider-failure-recovery',
  'multi-turn-context',
  'finish-package-loop',
  'model-reconfiguration',
];

const liveProviderVariants = ['openai-fast', 'openai-large', 'stream-interrupt', 'tool-error', 'retry-success'];

function makeScenario(id, lane, fields) {
  return { id, lane, ...fields };
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const V0858_MINIMUMS = {
  agentClosedLoop: 50,
  exportTorture: 60,
  recovery: 30,
  quality: 80,
  liveProvider: 40,
};

export const V0858_REQUIRED_AGENT_CATEGORIES = agentScenarioGroups.map((group) => group.category);

export const AGENT_CLOSED_LOOP_SCENARIOS = agentScenarioGroups.flatMap((group) =>
  group.prompts.map((prompt, index) =>
    makeScenario(`agent-${group.category}-${String(index + 1).padStart(2, '0')}`, 'agentClosedLoop', {
      category: group.category,
      prompt,
      expected: {
        plansBeforeBroadWork: group.category !== 'safe-targeted-edit',
        readsBeforeLessonJudgment: /review|check|compare|audit|finish|ready|aligned|easier to read/i.test(prompt),
        ...group.expected,
      },
    }),
  ),
);

export const EXPORT_TORTURE_SCENARIOS = exportCourseFamilies.flatMap((course, courseIndex) =>
  exportVariants.map((variant, variantIndex) =>
    makeScenario(`export-${slug(course)}-${variant}`, 'exportTorture', {
      course,
      lessonScope: [5, 8, 14][(courseIndex + variantIndex) % 3],
      variant,
      expected: {
        blocksBrokenZip: /missing|failed|failure/.test(variant),
        verifiesFileCount: true,
        auditsOfficeFiles: true,
        checksPanelStateAfterAgentEdit: variant === 'after-agent-edit-before-export',
      },
    }),
  ),
);

export const RECOVERY_SCENARIOS = recoveryVariants.map((variant, index) =>
  makeScenario(`recovery-${variant}`, 'recovery', {
    variant,
    projectState: index < 5 ? 'key-or-provider-failure' : index < 15 ? 'broken-project-state' : 'runtime-recovery',
    expected: {
      keepsWorkspaceOpen: true,
      offersInPlaceRecovery: /key|model|provider|config/.test(variant),
      preservesSafeLocalCommands: /no-key|offline|missing-key|course-map-present/.test(variant),
      preventsGhostArtifacts: /missing|failed|no-deliverables/.test(variant),
    },
  }),
);

export const QUALITY_RED_TEAM_SCENARIOS = qualityCourseTypes.flatMap((course) =>
  qualityVariants.map((variant) =>
    makeScenario(`quality-${slug(course)}-${variant}`, 'quality', {
      course,
      variant,
      expected: {
        checksPedagogicalAlignment: true,
        checksReadability: true,
        checksLessonCoverage: true,
        checksNoPlaceholderText: true,
        requiresHumanReviewForUnsupportedFacts:
          variant === 'adversarial-sparse-source' || /Policy|Clinical|Lab|Case/.test(course),
      },
    }),
  ),
);

export const LIVE_PROVIDER_SCENARIOS = liveProviderFamilies.flatMap((family) =>
  liveProviderVariants.map((variant) =>
    makeScenario(`live-${family}-${variant}`, 'liveProvider', {
      family,
      variant,
      expected: {
        usesNativeTools: true,
        verifiesFinalUserValue: ['state-mutation', 'readback-verification', 'finish-package-loop'].includes(family),
        recoversOrExplainsFailure: /failure|error|interrupt/.test(family) || /interrupt|error/.test(variant),
        doesNotLeakKeyMaterial: true,
      },
    }),
  ),
);

export const V0858_RED_TEAM_SCENARIOS = [
  ...AGENT_CLOSED_LOOP_SCENARIOS,
  ...EXPORT_TORTURE_SCENARIOS,
  ...RECOVERY_SCENARIOS,
  ...QUALITY_RED_TEAM_SCENARIOS,
  ...LIVE_PROVIDER_SCENARIOS,
];

export function summarizeV0858ScenarioInventory() {
  const byLane = V0858_RED_TEAM_SCENARIOS.reduce((acc, scenario) => {
    acc[scenario.lane] = (acc[scenario.lane] || 0) + 1;
    return acc;
  }, {});
  const byAgentCategory = AGENT_CLOSED_LOOP_SCENARIOS.reduce((acc, scenario) => {
    acc[scenario.category] = (acc[scenario.category] || 0) + 1;
    return acc;
  }, {});

  return {
    total: V0858_RED_TEAM_SCENARIOS.length,
    byLane,
    byAgentCategory,
    minimums: V0858_MINIMUMS,
  };
}

export function validateV0858ScenarioInventory() {
  const summary = summarizeV0858ScenarioInventory();
  const errors = [];
  const ids = new Set();

  for (const scenario of V0858_RED_TEAM_SCENARIOS) {
    if (!scenario.id) errors.push('Scenario is missing an id.');
    if (ids.has(scenario.id)) errors.push(`Duplicate scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    if (!scenario.lane) errors.push(`${scenario.id} is missing a lane.`);
    if (!scenario.expected || Object.keys(scenario.expected).length === 0) {
      errors.push(`${scenario.id} is missing explicit expected behavior.`);
    }
  }

  for (const [lane, min] of Object.entries(V0858_MINIMUMS)) {
    if ((summary.byLane[lane] || 0) < min) {
      errors.push(`${lane} has ${summary.byLane[lane] || 0} scenarios; expected at least ${min}.`);
    }
  }

  for (const category of V0858_REQUIRED_AGENT_CATEGORIES) {
    if (!summary.byAgentCategory[category]) {
      errors.push(`Missing v0.8.58 agent category: ${category}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary,
  };
}
