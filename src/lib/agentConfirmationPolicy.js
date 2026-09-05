const FEATURE_NAMES = {
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
};

const PER_LESSON_FEATURES = new Set([
  'courseFaq',
  'discussions',
  'lessonPlans',
  'quizBank',
  'rubrics',
  'slideDecks',
  'studyGuides',
]);

const CONFIRMATION_PATTERNS = [
  /\bi confirm\b/i,
  /\bconfirmed\b/i,
  /\bgo ahead\b/i,
  /\bproceed\b/i,
  /\bapply (it|them|those|the changes)\b/i,
  /\bmake the changes\b/i,
  /\bdo it\b/i,
  /\byes[,.\s]+(delete|remove|regenerate|overwrite|replace|proceed|apply|do it)\b/i,
  /\bok(?:ay)?[,.\s]+(delete|remove|regenerate|overwrite|replace|proceed|apply|do it)\b/i,
];

const BROAD_REWRITE_PATTERNS = [
  /\brewrite (all|everything|the whole|the entire)\b/i,
  /\bredo (all|everything|the whole|the entire)\b/i,
  /\boverhaul\b/i,
  /\brebuild\b/i,
  /\bstart over\b/i,
  /\bfrom scratch\b/i,
  /\breplace all\b/i,
  /\bwipe\b/i,
  /\bwhole course\b/i,
  /\bentire course\b/i,
  /\ball deliverables\b/i,
  /\bevery deliverable\b/i,
];

export const AGENT_CONFIRMATION_OUTCOMES = {
  ALLOW: 'allow',
  ASK: 'ask',
  REFUSE: 'refuse',
};

export const CONFIRMATION_GUARDED_TOOLS = new Set(['edit_course_map', 'edit_deliverables', 'generate_slide_images']);

function featureName(featureId) {
  if (!featureId) return 'the target deliverable';
  return FEATURE_NAMES[featureId] || featureId;
}

function hasAnyPattern(text, patterns) {
  const value = String(text || '');
  return patterns.some((pattern) => pattern.test(value));
}

export function hasExplicitAgentMutationConfirmation(userMessage) {
  return hasAnyPattern(userMessage, CONFIRMATION_PATTERNS);
}

export function isBroadRewriteRequest(userMessage) {
  return hasAnyPattern(userMessage, BROAD_REWRITE_PATTERNS);
}

function allowDecision(reason = 'Safe targeted mutation.') {
  return {
    outcome: AGENT_CONFIRMATION_OUTCOMES.ALLOW,
    allowed: true,
    requiresConfirmation: false,
    reason,
    message: reason,
    issues: [],
  };
}

function askDecision(reason, issues = []) {
  return {
    outcome: AGENT_CONFIRMATION_OUTCOMES.ASK,
    allowed: false,
    requiresConfirmation: true,
    reason,
    message: `${reason} Please confirm before I apply it.`,
    issues,
  };
}

function refuseDecision(reason, issues = []) {
  return {
    outcome: AGENT_CONFIRMATION_OUTCOMES.REFUSE,
    allowed: false,
    requiresConfirmation: false,
    refused: true,
    reason,
    message: reason,
    issues,
  };
}

function isGeneratedDeliverable(entry) {
  if (!entry) return false;
  if (entry.status && entry.status !== 'done') return false;
  return Boolean(entry.data || (!entry.status && typeof entry === 'object'));
}

function normalizePath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path === 'string') return path.split('.').filter(Boolean);
  return [];
}

function getCourseMapLessonIndexes(patches) {
  return new Set(
    (patches || []).map((patch) => patch?.lessonIndex).filter((lessonIndex) => Number.isInteger(lessonIndex)),
  );
}

function isCourseMapPatchAmbiguous(patch = {}) {
  if (!patch || typeof patch !== 'object') return 'Patch must be an object.';
  if (patch.action === 'addLesson') return null;
  if (!Number.isInteger(patch.lessonIndex)) return 'Course-map edit is missing lessonIndex.';
  if (patch.action === 'removeLesson') return null;
  if (!patch.field) return 'Course-map edit is missing field.';
  if (patch.value === undefined && patch.field !== 'title') return 'Course-map edit is missing value.';
  if (patch.field === 'title' && patch.value === undefined) return 'Lesson rename is missing the new title.';
  return null;
}

function evaluateCourseMapConfirmation(args = {}, ctx = {}) {
  const patches = Array.isArray(args.patches) ? args.patches : [];
  if (patches.length === 0) return allowDecision('No course-map mutation requested.');

  const ambiguous = patches.map(isCourseMapPatchAmbiguous).filter(Boolean);
  if (ambiguous.length > 0) {
    return askDecision('The course-map target is ambiguous.', ambiguous);
  }

  const destructive = patches.filter((patch) => patch?.action === 'removeLesson');
  if (destructive.length > 0 && !hasExplicitAgentMutationConfirmation(ctx.userMessage)) {
    return askDecision('Deleting lessons is destructive.', ['removeLesson requires confirmation.']);
  }

  const affectedLessons = getCourseMapLessonIndexes(patches);
  const broadByArgs = patches.length > 10 || affectedLessons.size > 6;
  if (
    (broadByArgs || isBroadRewriteRequest(ctx.userMessage)) &&
    !hasExplicitAgentMutationConfirmation(ctx.userMessage)
  ) {
    return askDecision('This looks like a broad course-map rewrite.', [
      `${patches.length} course-map patch${patches.length === 1 ? '' : 'es'} requested.`,
    ]);
  }

  return allowDecision();
}

function isDeliverableActionAmbiguous(action = {}) {
  if (!action || typeof action !== 'object') return 'Action must be an object.';
  if (!action.type) return 'Deliverable action is missing type.';
  if (!action.featureId) return 'Deliverable action is missing featureId.';

  if (action.type === 'editItem') {
    const path = normalizePath(action.path);
    if (path.length === 0) return `${featureName(action.featureId)} edit is missing path.`;
    if (action.value === undefined) return `${featureName(action.featureId)} edit is missing value.`;
  }

  if (action.type === 'removeItem' && !Number.isInteger(action.itemIndex)) {
    return `${featureName(action.featureId)} removal is missing itemIndex.`;
  }

  if (action.type === 'regenerateLesson' && !Number.isInteger(action.lessonIndex)) {
    return `${featureName(action.featureId)} regeneration is missing lessonIndex.`;
  }

  if (action.type === 'addItem') {
    if (!action.item || typeof action.item !== 'object')
      return `${featureName(action.featureId)} addition is missing item.`;
    if (PER_LESSON_FEATURES.has(action.featureId) && !Number.isInteger(action.lessonIndex)) {
      return `${featureName(action.featureId)} addition needs a lessonIndex.`;
    }
  }

  return null;
}

function getDeliverableLessonIndexes(actions) {
  return new Set(
    (actions || []).map((action) => action?.lessonIndex).filter((lessonIndex) => Number.isInteger(lessonIndex)),
  );
}

function isRootOverwriteAction(action = {}) {
  if (action.type !== 'editItem') return false;
  const path = normalizePath(action.path);
  return path.length <= 1;
}

function evaluateDeliverableConfirmation(args = {}, ctx = {}) {
  const actions = Array.isArray(args.actions) ? args.actions : [];
  if (actions.length === 0) return allowDecision('No deliverable mutation requested.');

  const missingOrUnavailable = [];
  for (const action of actions) {
    const featureId = action?.featureId;
    if (!featureId) continue;
    const entry = ctx.deliverables?.[featureId];
    if (!isGeneratedDeliverable(entry)) {
      missingOrUnavailable.push(
        `${featureName(featureId)} is not generated and ready, so I will not create a ghost artifact.`,
      );
    }
  }
  if (missingOrUnavailable.length > 0) {
    return refuseDecision(missingOrUnavailable[0], missingOrUnavailable);
  }

  const ambiguous = actions.map(isDeliverableActionAmbiguous).filter(Boolean);
  if (ambiguous.length > 0) {
    return askDecision('The deliverable target is ambiguous.', ambiguous);
  }

  const destructive = actions.filter((action) => action?.type === 'removeItem');
  const regenerations = actions.filter((action) => action?.type === 'regenerateLesson');
  const overwrites = actions.filter(isRootOverwriteAction);
  if (
    (destructive.length > 0 || regenerations.length > 0 || overwrites.length > 0) &&
    !hasExplicitAgentMutationConfirmation(ctx.userMessage)
  ) {
    const issues = [
      ...(destructive.length > 0 ? ['removeItem requires confirmation.'] : []),
      ...(regenerations.length > 0 ? ['regenerateLesson requires confirmation.'] : []),
      ...(overwrites.length > 0 ? ['Root-level overwrite requires confirmation.'] : []),
    ];
    return askDecision('This deliverable change can remove, regenerate, or overwrite existing content.', issues);
  }

  const affectedLessons = getDeliverableLessonIndexes(actions);
  const broadByArgs = actions.length > 10 || affectedLessons.size > 6;
  if (
    (broadByArgs || isBroadRewriteRequest(ctx.userMessage)) &&
    !hasExplicitAgentMutationConfirmation(ctx.userMessage)
  ) {
    return askDecision('This looks like a broad deliverable rewrite.', [
      `${actions.length} deliverable action${actions.length === 1 ? '' : 's'} requested.`,
    ]);
  }

  return allowDecision();
}

function evaluateSlideImageConfirmation(args = {}, ctx = {}) {
  if (args.force === true && !hasExplicitAgentMutationConfirmation(ctx.userMessage)) {
    return askDecision('Forcing slide image generation can overwrite existing images.', [
      'force:true requires confirmation.',
    ]);
  }
  return allowDecision();
}

export function evaluateAgentMutationConfirmation(toolName, args = {}, ctx = {}) {
  if (!CONFIRMATION_GUARDED_TOOLS.has(toolName)) {
    return allowDecision('Tool does not require confirmation-policy gating.');
  }
  if (toolName === 'edit_course_map') return evaluateCourseMapConfirmation(args, ctx);
  if (toolName === 'edit_deliverables') return evaluateDeliverableConfirmation(args, ctx);
  if (toolName === 'generate_slide_images') return evaluateSlideImageConfirmation(args, ctx);
  return allowDecision();
}

export function buildConfirmationPolicyToolResult(decision) {
  if (!decision || decision.allowed) return null;
  return {
    error: decision.message || decision.reason || 'This action needs confirmation before I can apply it.',
    requiresConfirmation: decision.requiresConfirmation === true,
    refused: decision.refused === true,
    confirmationPolicy: {
      outcome: decision.outcome,
      reason: decision.reason,
      issues: decision.issues || [],
    },
  };
}
