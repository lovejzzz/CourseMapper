import { lintItemAdmission } from './itemAdmissionLint.js';
import { analyzeDecisionScenario } from './scenarioContract.js';
import { findScionExplanationKeyConflict, normalizeScionMcItem } from './scionAnswerKeyAlignment.js';
import { isAppliedQuizStem } from './quality/quizItemDepth.js';
import { validateScionCodexTrainingPreferenceEvidence } from './scionCodexTrainingEvidence.js';
import { assessScionKeyTermContract } from './scionKeyTermContract.js';

export { findScionExplanationKeyConflict } from './scionAnswerKeyAlignment.js';

const PROCESS_LEAK_RE =
  /\b(?:assessment criteria|activities include|key elements include|the lesson|this course|students will learn)\b/i;
const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;
const TERMINAL_PUNCT_RE = /[.!?][\])}"']?$/;
const PLACEHOLDER_OPTION_RE = /^(?:index|option|choice|answer)\s*[:#=\-]?\s*(?:[0-9]+|[a-d])$/i;
const NON_DISTINCTIVE_GROUNDING = new Set([
  'and',
  'claim',
  'evidence',
  'excerpt',
  'lines',
  'materials',
  'notes',
  'provided',
  'scenario',
  'staff',
  'the',
]);
const TRAINABLE_PREFERENCE_EVIDENCE_KINDS = new Set([
  'deterministic-contract-margin',
  'double-blind-key-repair',
  'admission-and-key-repair',
  'applied-depth-and-key-repair',
  'blind-instructor-preference',
  'single-model-judge-preference',
]);
export const SCION_PREFERENCE_GATE_VERSION = '1.0.0';

// These checks describe form, contract completeness, or answer-cue hygiene.
// They do not claim that either side is factually correct. A deterministic
// training pair is admitted only when the chosen side clears the whole gate
// and the rejected side fails exclusively inside this non-semantic set.
const DETERMINISTIC_CONTRACT_ISSUE_RE =
  /^(?:facts-count|fact-length|key-terms-count|mc-count|discussion-(?:prompt|tension|positions)|assignment-(?:task|parameters)|study-guide-(?:summary|strategy)|scenario:scenario-(?:missing-decision|missing-tension|missing-evidence-packet)|(?:key-term-\d+:)?(?:tr|df|eg|mi|cx)-length|(?:key-term-\d+:)?(?:term-is-lesson-title|circular-definition|meta-definition|correction-repeats-definition)|(?:mc-\d+:)?(?:stem-length|option-count|option-length|option-homogeneity|duplicate-options|placeholder-options|explanation-length|truncated-explanation|process-leakage|meta-surface|all-none-of-above|longest-option-cue|clang-association-cue))$/;

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stringInBand(value, min, max) {
  const normalized = clean(value);
  return normalized.length >= min && normalized.length <= max;
}

function unique(values) {
  return new Set(values.map((value) => clean(value).toLowerCase())).size === values.length;
}

function containsGroundingToken(value, token) {
  const normalized = clean(token).toLowerCase();
  if (!/^[a-z][a-z0-9]{2,}$/.test(normalized)) return false;
  if (NON_DISTINCTIVE_GROUNDING.has(normalized)) return false;
  return new RegExp(`\\b${normalized}\\b`, 'i').test(String(value || ''));
}

/**
 * Conservative, deterministic admission gate for preference data and repaired
 * Scion quiz items. Passing means the item is safe enough to consider after a
 * separate answer-key verification; it is not a claim of semantic correctness.
 */
export function assessScionMcItem(item, { topicWords = [] } = {}) {
  const normalized = normalizeScionMcItem(item);
  const issues = [];
  if (!stringInBand(normalized.question, 25, 300)) issues.push('stem-length');
  if (normalized.options.length !== 4) issues.push('option-count');
  if (normalized.options.length === 4 && normalized.options.some((option) => !stringInBand(option, 5, 95))) {
    issues.push('option-length');
  }
  if (normalized.options.length === 4) {
    const optionLengths = normalized.options.map((option) => clean(option).length);
    if (Math.max(...optionLengths) > Math.min(...optionLengths) * 3 + 20) issues.push('option-homogeneity');
  }
  if (normalized.options.length === 4 && !unique(normalized.options)) issues.push('duplicate-options');
  if (normalized.options.filter((option) => PLACEHOLDER_OPTION_RE.test(option)).length >= 2) {
    issues.push('placeholder-options');
  }
  if (!Number.isInteger(normalized.answerIndex) || normalized.answerIndex < 0 || normalized.answerIndex > 3) {
    issues.push('answer-index');
  }
  if (!stringInBand(normalized.explanation, 20, 300)) issues.push('explanation-length');
  if (normalized.explanation && !TERMINAL_PUNCT_RE.test(normalized.explanation)) issues.push('truncated-explanation');
  if (PROCESS_LEAK_RE.test([normalized.question, ...normalized.options, normalized.explanation].join(' '))) {
    issues.push('process-leakage');
  }
  if (META_SURFACE_RE.test([normalized.question, ...normalized.options, normalized.explanation].join(' '))) {
    issues.push('meta-surface');
  }
  if (/\b(?:all|none) of the above\b/i.test(normalized.options.join(' '))) issues.push('all-none-of-above');
  if (findScionExplanationKeyConflict(normalized)) issues.push('explanation-key-conflict');
  if (topicWords.length > 0) {
    const combined = [normalized.question, ...normalized.options, normalized.explanation].join(' ').toLowerCase();
    if (!topicWords.some((word) => combined.includes(clean(word).toLowerCase()))) issues.push('off-topic');
  }
  issues.push(...lintItemAdmission(normalized));
  const deduped = [...new Set(issues)];
  return {
    eligible: deduped.length === 0,
    issues: deduped,
    score: Math.max(0, 100 - deduped.length * 15),
    normalized,
  };
}

export function assessScionKeyTerm(term = {}, { lessonTitle = '' } = {}) {
  const result = assessScionKeyTermContract(term, { lessonTitle, definitionMin: 45 });
  return { eligible: result.eligible, issues: result.issues, score: result.score };
}

/** Validate the full compact kernel contract used by the Scion training seat. */
export function assessScionKernelLesson(lesson = {}) {
  const issues = [];
  const facts = Array.isArray(lesson?.facts) ? lesson.facts : [];
  if (facts.length < 5 || facts.length > 8) issues.push('facts-count');
  if (facts.some((fact) => !stringInBand(fact, 25, 140))) issues.push('fact-length');

  const keyTerms = Array.isArray(lesson?.keyTerms) ? lesson.keyTerms : [];
  if (keyTerms.length < 3 || keyTerms.length > 6) issues.push('key-terms-count');
  keyTerms.forEach((term, index) => {
    for (const issue of assessScionKeyTerm(term).issues) issues.push(`key-term-${index}:${issue}`);
  });

  const scenario = lesson?.scenario || {};
  const scenarioResult = analyzeDecisionScenario({ setup: scenario.su, materials: scenario.ma });
  if (!scenarioResult.ready) issues.push(...scenarioResult.issues.map((issue) => `scenario:${issue}`));

  const discussion = lesson?.discussionPrompt || {};
  if (!stringInBand(discussion.pr, 20, 300)) issues.push('discussion-prompt');
  if (!stringInBand(discussion.tn, 12, 300)) issues.push('discussion-tension');
  if (!Array.isArray(discussion.po) || discussion.po.length < 2 || discussion.po.length > 3) {
    issues.push('discussion-positions');
  }

  const assignment = lesson?.assignmentCore || {};
  if (!stringInBand(assignment.td, 45, 500)) issues.push('assignment-task');
  if (!Array.isArray(assignment.pa) || assignment.pa.length < 2 || assignment.pa.length > 4) {
    issues.push('assignment-parameters');
  }

  const studyGuide = lesson?.studyGuide || {};
  if (!stringInBand(studyGuide.sm, 70, 550)) issues.push('study-guide-summary');
  if (!stringInBand(studyGuide.rs, 35, 380)) issues.push('study-guide-strategy');

  const mc = Array.isArray(lesson?.mc) ? lesson.mc : [];
  if (mc.length !== 4) issues.push('mc-count');
  mc.forEach((item, index) => {
    for (const issue of assessScionMcItem(item).issues) issues.push(`mc-${index}:${issue}`);
  });

  const deduped = [...new Set(issues)];
  return { eligible: deduped.length === 0, issues: deduped, score: Math.max(0, 100 - deduped.length * 5) };
}

function sortedIssues(issues = []) {
  return [...new Set(issues.map((issue) => clean(issue)).filter(Boolean))].sort();
}

function sameIssues(left = [], right = []) {
  const a = sortedIssues(left);
  const b = sortedIssues(right);
  return a.length === b.length && a.every((issue, index) => issue === b[index]);
}

export function deriveDeterministicContractEvidence({ kind, chosen, rejected } = {}) {
  let chosenResult;
  let rejectedResult;
  if (kind === 'mc-item') {
    chosenResult = assessScionMcItem(chosen);
    rejectedResult = assessScionMcItem(rejected);
  } else if (kind === 'key-term') {
    chosenResult = assessScionKeyTerm(chosen);
    rejectedResult = assessScionKeyTerm(rejected);
  } else if (kind === 'lesson') {
    chosenResult = assessScionKernelLesson(chosen);
    rejectedResult = assessScionKernelLesson(rejected);
  } else {
    return null;
  }
  const rejectedIssues = sortedIssues(rejectedResult.issues);
  if (
    !chosenResult.eligible ||
    rejectedResult.eligible ||
    rejectedIssues.length === 0 ||
    !rejectedIssues.every((issue) => DETERMINISTIC_CONTRACT_ISSUE_RE.test(issue))
  ) {
    return null;
  }
  return {
    kind: 'deterministic-contract-margin',
    verified: true,
    validator: 'scion-preference-gate',
    validatorVersion: SCION_PREFERENCE_GATE_VERSION,
    rejectedIssues,
    scope: 'non-semantic-contract-only',
  };
}

/**
 * A preference pair is trainable only with pair-level evidence. Model identity
 * or an aggregate benchmark never proves that every response from that model
 * is the chosen response.
 */
export function assessScionPreferencePair({ kind, chosen, rejected, preferenceEvidence } = {}) {
  let chosenResult;
  let rejectedResult;
  if (kind === 'mc-item') {
    chosenResult = assessScionMcItem(chosen);
    rejectedResult = assessScionMcItem(rejected);
  } else if (kind === 'key-term') {
    chosenResult = assessScionKeyTerm(chosen);
    rejectedResult = assessScionKeyTerm(rejected);
  } else if (kind === 'lesson') {
    chosenResult = assessScionKernelLesson(chosen);
    rejectedResult = assessScionKernelLesson(rejected);
  } else {
    return { eligible: false, issues: ['unsupported-pair-kind'] };
  }

  const issues = [];
  if (!chosenResult.eligible) issues.push(...chosenResult.issues.map((issue) => `chosen:${issue}`));
  if (!preferenceEvidence?.kind) issues.push('missing-pair-level-evidence');
  else if (!TRAINABLE_PREFERENCE_EVIDENCE_KINDS.has(preferenceEvidence.kind)) {
    issues.push('unsupported-preference-evidence-kind');
  }
  if (preferenceEvidence?.verified !== true) issues.push('unverified-preference-evidence');
  const deterministicContractMargin =
    preferenceEvidence?.kind === 'deterministic-contract-margin' &&
    preferenceEvidence?.verified === true &&
    preferenceEvidence?.validator === 'scion-preference-gate' &&
    preferenceEvidence?.validatorVersion === SCION_PREFERENCE_GATE_VERSION &&
    preferenceEvidence?.scope === 'non-semantic-contract-only' &&
    chosenResult.eligible &&
    rejectedResult.eligible === false &&
    sortedIssues(rejectedResult.issues).every((issue) => DETERMINISTIC_CONTRACT_ISSUE_RE.test(issue)) &&
    sameIssues(preferenceEvidence?.rejectedIssues, rejectedResult.issues);
  if (preferenceEvidence?.kind === 'deterministic-contract-margin' && !deterministicContractMargin) {
    issues.push('invalid-deterministic-contract-evidence');
  }
  if (
    ['double-blind-key-repair', 'admission-and-key-repair'].includes(preferenceEvidence?.kind) &&
    new Set(Array.isArray(preferenceEvidence?.verifierIds) ? preferenceEvidence.verifierIds.filter(Boolean) : []).size <
      2
  ) {
    issues.push('missing-independent-verifier-diversity');
  }
  if (preferenceEvidence?.kind === 'applied-depth-and-key-repair' && preferenceEvidence?.reviewStatus !== 'approved') {
    issues.push('missing-review-approval');
  }
  const blindInstructorMargin =
    preferenceEvidence?.kind === 'blind-instructor-preference' &&
    preferenceEvidence?.preferred === 'chosen' &&
    preferenceEvidence?.unanimous === true &&
    new Set(Array.isArray(preferenceEvidence?.reviewerIds) ? preferenceEvidence.reviewerIds.filter(Boolean) : [])
      .size >= 2 &&
    new Set(Array.isArray(preferenceEvidence?.reviewHashes) ? preferenceEvidence.reviewHashes.filter(Boolean) : [])
      .size >= 2 &&
    Array.isArray(preferenceEvidence?.reviewerRoles) &&
    preferenceEvidence.reviewerRoles.length >= 2 &&
    preferenceEvidence.reviewerRoles.every((role) => role === 'working-instructor');
  if (preferenceEvidence?.kind === 'blind-instructor-preference' && !blindInstructorMargin) {
    issues.push('invalid-blind-instructor-evidence');
  }
  const singleModelJudgeMargin =
    preferenceEvidence?.kind === 'single-model-judge-preference' &&
    validateScionCodexTrainingPreferenceEvidence(preferenceEvidence).valid;
  if (preferenceEvidence?.kind === 'single-model-judge-preference' && !singleModelJudgeMargin) {
    issues.push(...validateScionCodexTrainingPreferenceEvidence(preferenceEvidence).issues);
  }
  if (
    preferenceEvidence?.kind === 'admission-and-key-repair' &&
    Object.prototype.hasOwnProperty.call(preferenceEvidence, 'declaredAnswer')
  ) {
    issues.push('post-hoc-key-realignment-not-trainable');
  }
  const appliedDepthMargin =
    kind === 'mc-item' &&
    preferenceEvidence?.kind === 'applied-depth-and-key-repair' &&
    preferenceEvidence?.rejectedApplied === false &&
    preferenceEvidence?.chosenApplied === true &&
    Array.isArray(preferenceEvidence?.chosenAnswers) &&
    preferenceEvidence.chosenAnswers.length === 2 &&
    preferenceEvidence.chosenAnswers.every((answer) => answer === Number(chosen?.ai ?? chosen?.answerIndex)) &&
    Array.isArray(preferenceEvidence?.groundingTokens) &&
    preferenceEvidence.groundingTokens.length >= 2 &&
    preferenceEvidence.groundingTokens.every((token) => containsGroundingToken(chosen?.q || chosen?.question, token)) &&
    preferenceEvidence.groundingTokens.some(
      (token) => !containsGroundingToken(rejected?.q || rejected?.question, token),
    ) &&
    !isAppliedQuizStem(rejected?.q || rejected?.question) &&
    isAppliedQuizStem(chosen?.q || chosen?.question);
  if (
    rejectedResult.eligible &&
    chosenResult.score <= rejectedResult.score &&
    !appliedDepthMargin &&
    !blindInstructorMargin &&
    !singleModelJudgeMargin &&
    !deterministicContractMargin
  ) {
    issues.push('no-deterministic-quality-margin');
  }
  return {
    eligible: issues.length === 0,
    issues,
    chosen: chosenResult,
    rejected: rejectedResult,
  };
}
