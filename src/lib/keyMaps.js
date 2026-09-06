/**
 * keyMaps.js — Bidirectional key maps for JSON output minification.
 *
 * AI prompts request abbreviated keys (e.g., "lt" instead of "lessonTitle")
 * to reduce output token consumption by ~15-20%.  After streaming/parsing,
 * expandKeys() recursively restores full key names so the rest of the app
 * (merge, dedup, UI, export) continues to work unchanged.
 *
 * Rules:
 *  - Wrapper keys (e.g., "plans", "decks", "quizzes") are NOT minified —
 *    getArrayKey() in syncDependencies.js depends on them.
 *  - Each deliverable has its own flat short→full map.
 *  - A short key always maps to the same full key within a deliverable,
 *    regardless of nesting depth (flat replacement is safe because there
 *    are no within-deliverable short-key collisions).
 *  - Syllabus is excluded (single object, no array repetition → negligible savings).
 */

import { isInternalDeliverableMetadataKey } from './internalDeliverableMetadata.js';

// ── Per-feature short→full key maps ────────────────────────────────────────────

const lessonPlans = {
  lt: 'lessonTitle',
  wk: 'weekNumber',
  dur: 'duration',
  bls: 'bloomsLevels',
  ob: 'objectives',
  mt: 'materials',
  wu: 'warmUp',
  ol: 'outline',
  fc: 'formativeCheck',
  un: 'udlNotes',
  hw: 'homework',
  ca: 'closingActivity',
  tg: 'tags',
  rts: 'readyToTeachSupport',
  sfs: 'studentFacingSummary',
  pk: 'prerequisiteKnowledge',
  cms: 'commonMisconceptions',
  wsc: 'weeklySubmissionCriteria',
  lcr: 'localCaseReplacementNote',
  acs: 'assessmentCriteria',
  al: 'artifactLength',
  cc: 'calibrationCue',
  rd: 'suggestedReviewDate',
  cg: 'contentOwnerGroup',
  // nested: warmUp
  ty: 'type',
  pr: 'prompt',
  pu: 'purpose',
  fa: 'facilitation',
  // nested: outline
  tm: 'time',
  ac: 'activity',
  de: 'description',
  in: 'instructorNotes',
  ir: 'instructorRole',
  gr: 'grouping',
  bl: 'bloomsLevel',
  // nested: formativeCheck
  oa: 'objectiveAligned',
  ia: 'instructorAction',
  // nested: udlNotes
  rp: 'representation',
  eg: 'engagement',
  ex: 'expression',
  // nested: homework
  t: 'title',
  et: 'estimatedTime',
  cn: 'connectionToNext',
};

const slideDecks = {
  lt: 'lessonTitle',
  ts: 'totalSlides',
  lo: 'learningObjectives',
  sl: 'slides',
  tg: 'tags',
  sg: 'slideDeckSequenceGuide',
  vi: 'visual',
  // nested: slides[]
  t: 'title',
  ty: 'type',
  bu: 'bullets',
  no: 'notes',
  at: 'activityType',
  ti: 'timer',
  bl: 'bloomsLevel',
  ol: 'objectiveLink',
};

const rubrics = {
  t: 'title',
  lt: 'lessonTitle',
  gw: 'gradedWork',
  at: 'assessmentType',
  tp: 'totalPoints',
  bl: 'bloomsLevel',
  gs: 'gradingScale',
  cr: 'criteria',
  gp: 'gradePolicyConnection',
  tn: 'teacherNotes',
  tg: 'tags',
  td: 'taskDirections',
  ifn: 'instructorFacilitationNote',
  udl: 'accessibilityAndUDL',
  ax: 'anchorExamples',
  // nested: gradingScale + criteria levels
  ex: 'exemplary',
  pr: 'proficient',
  dv: 'developing',
  bg: 'beginning',
  // nested: criteria[]
  cn: 'criterion',
  oa: 'objectiveAligned',
  wt: 'weight',
  pt: 'points',
};

const quizBank = {
  lt: 'lessonTitle',
  tq: 'totalQuestions',
  bc: 'bloomsCoverage',
  fn: 'formativeFeedbackNote',
  qs: 'questions',
  tg: 'tags',
  // nested: questions[]
  ty: 'type',
  bl: 'bloomsLevel',
  df: 'difficulty',
  em: 'estimatedMinutes',
  pt: 'points',
  oa: 'objectiveAligned',
  q: 'question',
  op: 'options',
  an: 'answer',
  dr: 'distractorRationale',
  ex: 'explanation',
  rh: 'rubricHints',
  sa: 'sampleAnswer',
  iu: 'intendedUse',
  sg: 'scoringGuidance',
};

const assignments = {
  t: 'title',
  at: 'assignmentType',
  rl: 'relatedLessons',
  dw: 'dueWeek',
  et: 'estimatedTime',
  tp: 'totalPoints',
  pg: 'percentOfGrade',
  bl: 'bloomsLevel',
  ov: 'overview',
  ob: 'objectives',
  ins: 'instructions',
  fr: 'formatRequirements',
  dl: 'deliverables',
  sm: 'scaffoldingMilestones',
  gc: 'gradingCriteria',
  sr: 'supportResources',
  pt: 'progressTracking',
  ai: 'academicIntegrityStatement',
  ud: 'accessibilityAndUDL',
  sar: 'selfAssessmentRubric',
  fl: 'feedbackLoop',
  pc: 'portfolioConnection',
  esf: 'expectedSubmissionFile',
  hsc: 'highValueSuccessCriteria',
  ifp: 'instructorFeedbackPriority',
  pb: 'performanceBands',
  exc: 'excellent',
  prof: 'proficient',
  rev: 'revise',
  tg: 'tags',
  // nested: formatRequirements
  ln: 'length',
  fm: 'format',
  cs: 'citationStyle',
  sp: 'submissionPlatform',
  lp: 'latePolicy',
  // nested: scaffoldingMilestones[]
  ms: 'milestone',
  dd: 'dueDate',
  de: 'description',
  fb: 'feedbackChannel',
  ul: 'uploadChecklist',
};

const discussions = {
  lt: 'lessonTitle',
  bl: 'bloomsLevel',
  fm: 'format',
  ed: 'estimatedDuration',
  cx: 'context',
  pr: 'prompt',
  er: 'evidenceRequirement',
  fp: 'followUpProbes',
  ft: 'facilitationTips',
  af: 'sourceArtifacts',
  rs: 'responseStarters',
  ec: 'evaluationCriteria',
  eq: 'equityConsiderations',
  gl: 'guidelines',
  tg: 'tags',
  // nested: facilitationTips
  op: 'opening',
  is: 'ifStalls',
  id: 'ifDominates',
  cl: 'closure',
  // nested: sourceArtifacts
  at: 'title',
  lo: 'locator',
  ut: 'use',
};

const studyGuides = {
  lt: 'lessonTitle',
  es: 'examScope',
  su: 'summary',
  kt: 'keyTerms',
  cc: 'conceptConnections',
  cm: 'commonMisconceptions',
  rq: 'reviewQuestions',
  pa: 'practiceActivities',
  ep: 'examPrep',
  sr: 'supportResources',
  tg: 'tags',
  // nested: keyTerms[]
  tm: 'term',
  df: 'definition',
  ex: 'example',
  // nested: commonMisconceptions[]
  mc: 'misconception',
  co: 'correction',
  // nested: reviewQuestions[]
  q: 'question',
  bl: 'bloomsLevel',
  ht: 'hint',
  // nested: examPrep
  kk: 'keyTopicsToKnow',
  tl: 'timeManagement',
  ce: 'commonErrors',
  rv: 'reviewStrategy',
};

const courseFaq = {
  lt: 'lessonTitle',
  qs: 'questions',
  tg: 'tags',
  // nested: questions[]
  q: 'question',
  an: 'answer',
  ca: 'category',
  rc: 'relatedConcepts',
  df: 'difficulty',
  sa: 'studentAction',
  in: 'instructorNote',
  ac: 'assessmentConnection',
  ud: 'accessibilitySupport',
  ce: 'concreteExample',
};

// v0.9.11 P2: lesson-content enrichment contract (blueprintEnrichmentPass).
// Wrapper keys (lessons, quizItems, keyTerms, slideContent, discussionPrompt,
// assignmentCore) plus lessonId/index/type stay full — the parser reads them
// and they repeat at most once per lesson.
const enrichment = {
  q: 'question',
  op: 'options',
  ai: 'answerIndex',
  fi: 'sourceFactIndexes',
  dr: 'distractorRationales',
  an: 'answer',
  ex: 'explanation',
  sg: 'scoringGuidance',
  tr: 'term',
  df: 'definition',
  eg: 'example',
  mi: 'misconception',
  ti: 'title',
  bu: 'bullets',
  no: 'notes',
  pr: 'prompt',
  tn: 'tension',
  po: 'positions',
  td: 'taskDescription',
  pa: 'parameters',
  // kernel contract (v0.9.11 P4): scenario block
  su: 'setup',
  ma: 'materials',
  // v0.15.187: authored study-guide body (kernel studyGuide block)
  sm: 'summary',
  rs: 'reviewStrategy',
  // v0.13.3: misconception corrections + quantitative worked examples
  cx: 'correction',
  wp: 'problem',
  ws: 'steps',
  wr: 'result',
  // v0.16.77: compact experiential-activity blueprint. `activityBlueprints`
  // and `lessonId` remain full wrapper keys; these nested atoms are expanded
  // once at the same admission boundary as the lesson kernel.
  ty: 'activityType',
  sc: 'scenario',
  ro: 'roles',
  nm: 'name',
  go: 'goal',
  co: 'constraint',
  pi: 'privateInformation',
  ev: 'evidence',
  up: 'updates',
  in: 'information',
  rd: 'requiredDecision',
  ar: 'artifact',
  rq: 'requirements',
  tm: 'timing',
  ph: 'phase',
  mn: 'minutes',
  db: 'debriefPrompts',
  sb: 'safetyBoundary',
};

export const KEY_MAPS = {
  lessonPlans,
  slideDecks,
  rubrics,
  quizBank,
  assignments,
  discussions,
  studyGuides,
  courseFaq,
  enrichment,
  // syllabus intentionally excluded — single object, no array repetition
};

// ── Recursive key expansion ────────────────────────────────────────────────────

function _expand(node, map) {
  if (Array.isArray(node)) return node.map((item) => _expand(item, map));
  if (node !== null && typeof node === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (isInternalDeliverableMetadataKey(key)) {
        result[key] = structuredClone(value);
        continue;
      }
      const expandedKey = map[key] || key;
      result[expandedKey] = _expand(value, map);
    }
    return result;
  }
  return node; // primitives pass through
}

function _expandSlideDecks(node, inVisual = false) {
  if (Array.isArray(node)) return node.map((item) => _expandSlideDecks(item, inVisual));
  if (node !== null && typeof node === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (isInternalDeliverableMetadataKey(key)) {
        result[key] = structuredClone(value);
        continue;
      }
      const expandedKey = inVisual
        ? { k: 'kind', d: 'description', at: 'altText' }[key] || key
        : slideDecks[key] || key;
      result[expandedKey] = _expandSlideDecks(value, !inVisual && expandedKey === 'visual');
    }
    return result;
  }
  return node;
}

const ASSIGNMENT_FORMAT_MAP = {
  ln: 'length',
  fm: 'format',
  cs: 'citationStyle',
  sp: 'submissionPlatform',
  lp: 'latePolicy',
};

const ASSIGNMENT_MILESTONE_MAP = {
  ms: 'milestone',
  dd: 'dueDate',
  de: 'description',
  fb: 'feedbackChannel',
  pt: 'points',
  ul: 'uploadChecklist',
};

function _expandAssignments(node, context = 'root') {
  if (Array.isArray(node)) {
    const childContext = context === 'scaffoldingMilestones' ? 'milestone' : context;
    return node.map((item) => _expandAssignments(item, childContext));
  }
  if (node !== null && typeof node === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (isInternalDeliverableMetadataKey(key)) {
        result[key] = structuredClone(value);
        continue;
      }
      const contextMap =
        context === 'formatRequirements'
          ? ASSIGNMENT_FORMAT_MAP
          : context === 'milestone'
            ? ASSIGNMENT_MILESTONE_MAP
            : assignments;
      const expandedKey = contextMap[key] || assignments[key] || key;
      const childContext =
        expandedKey === 'formatRequirements'
          ? 'formatRequirements'
          : expandedKey === 'scaffoldingMilestones'
            ? 'scaffoldingMilestones'
            : 'root';
      result[expandedKey] = _expandAssignments(value, childContext);
    }
    return result;
  }
  return node;
}

/**
 * Recursively expand minified keys in a parsed AI response.
 * Safe for mixed responses (full keys pass through unchanged).
 *
 * @param {string} featureId — deliverable type
 * @param {object|null} data — parsed JSON response
 * @returns {object|null} — data with all short keys expanded to full names
 */
export function expandKeys(featureId, data) {
  if (!data) return data;
  if (featureId === 'slideDecks') return _expandSlideDecks(data);
  if (featureId === 'assignments') return _expandAssignments(data);
  const map = KEY_MAPS[featureId];
  if (!map) return data; // no map → pass through (e.g., syllabus)
  return _expand(data, map);
}
