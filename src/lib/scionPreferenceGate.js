import { lintItemAdmission } from './itemAdmissionLint.js';
import { analyzeDecisionScenario } from './scenarioContract.js';
import {
  findScionAffirmativeOptionConflict,
  findScionExplanationKeyConflict,
  findScionExplicitNegativeKeyConflict,
  findScionMissingKeyExplanationSupport,
  findScionMultipleSourceSupportedOptions,
  findScionNearDuplicateOptionPair,
  findScionSourceAnswerConflict,
  normalizeScionMcItem,
  normalizeScionOptionIdentity,
} from './scionAnswerKeyAlignment.js';
import { isAppliedQuizStem } from './quality/quizItemDepth.js';
import { validateScionTrainingPreferenceEvidence } from './scionCodexTrainingEvidence.js';
import { assessPublicScionKernelResponse } from './publicScionProvider.js';
import { assessScionKeyTermContract } from './scionKeyTermContract.js';

export { findScionExplanationKeyConflict } from './scionAnswerKeyAlignment.js';

const PROCESS_LEAK_RE =
  /\b(?:assessment criteria|activities include|key elements include|the lesson|this course|students will learn)\b/i;
const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;
const TERMINAL_PUNCT_RE = /[.!?][\])}"']?$/;
const TRUNCATED_OPTION_FRAGMENT_RE =
  /(?:-[a-z]{1,3}|\b(?:a|an|and|any|as|by|each|every|for|from|in|of|on|or|the|to|with|without))$/i;
const PLACEHOLDER_OPTION_RE = /^(?:index|option|choice|answer)\s*[:#=\-]?\s*(?:[0-9]+|[a-d])$/i;
const OPTION_LABEL_PREFIX_RE = /^(?:(?:option|choice|answer)\s*)?(?:[a-d]|[1-4])\s*[).:\-]\s*/i;
// Generated options sometimes retain a source/list label at the end (for
// example, "0 [1]"). Requiring whitespace before the bracket keeps real code
// such as scores[1] or map[key] out of this presentation-only check.
const OPTION_LABEL_SUFFIX_RE = /\s\[(?:[a-d]|[0-4])\]$/i;
const CLAIM_MARKER_RE = /(?:\(|\[)?\s*claims?\s*#?\s*\d+(?:\s*[,–-]\s*\d+)*\s*(?:\)|\])?/i;
// The compact browser-model prompt deliberately includes impossible-to-ship
// REPLACE instructions. Smaller models sometimes copy a template stem or
// option verbatim while still producing valid JSON; structure-only checks
// would otherwise admit that residue as lesson knowledge.
const TEMPLATE_RESIDUE_RE =
  /\b(?:two lesson concepts?|lesson concept to this concrete case|replace with (?:one complete distinction question|one concrete case question|a plausible subject-specific|a plausible case-specific)|plausible methodological claim or action|plausible case interpretation or action)\b/i;
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
export const SCION_PREFERENCE_GATE_VERSION = '1.0.3';
const LEGACY_SCION_PREFERENCE_GATE_VERSION = '1.0.2';

// These checks describe form, contract completeness, or answer-cue hygiene.
// They do not claim that either side is factually correct. A deterministic
// training pair is admitted only when the chosen side clears the whole gate
// and the rejected side fails exclusively inside this non-semantic set.
const DETERMINISTIC_CONTRACT_ISSUE_RE =
  /^(?:facts-count|fact-length|key-terms-count|mc-count|discussion-(?:prompt|tension|positions)|assignment-(?:task|parameters)|study-guide-(?:summary|strategy)|scenario:scenario-(?:missing-decision|missing-tension|missing-evidence-packet)|(?:key-term-\d+:)?(?:tr|df|eg|mi|cx)-length|(?:key-term-\d+:)?(?:term-is-lesson-title|circular-definition|meta-definition)|(?:mc-\d+:)?(?:stem-length|option-count|option-length|option-homogeneity|duplicate-options|placeholder-options|truncated-option|option-label-suffixes|explanation-length|explanation-repeats-answer|truncated-explanation|process-leakage|meta-surface|template-residue|generation-marker-residue|answer-position-residue|claim-marker-residue|repetitive-explanation|all-none-of-above|longest-option-cue|clang-association-cue))$/;
// Historical v0.16.40-v0.16.46 receipts were generated under v1.0.2.
// Keep their ruler reproducible only when an offline historical auditor opts
// in explicitly; live and current dataset admission always uses the safer set.
const LEGACY_DETERMINISTIC_CONTRACT_ISSUE_RE =
  /^(?:facts-count|fact-length|key-terms-count|mc-count|discussion-(?:prompt|tension|positions)|assignment-(?:task|parameters)|study-guide-(?:summary|strategy)|scenario:scenario-(?:missing-decision|missing-tension|missing-evidence-packet)|(?:key-term-\d+:)?(?:tr|df|eg|mi|cx)-length|(?:key-term-\d+:)?(?:term-is-lesson-title|circular-definition|meta-definition|correction-repeats-definition)|(?:mc-\d+:)?(?:stem-length|option-count|option-length|option-homogeneity|duplicate-options|placeholder-options|truncated-option|option-label-suffixes|explanation-length|explanation-repeats-answer|truncated-explanation|process-leakage|meta-surface|template-residue|generation-marker-residue|answer-position-residue|claim-marker-residue|repetitive-explanation|all-none-of-above|longest-option-cue|clang-association-cue))$/;

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
  return new Set(values.map(normalizeScionOptionIdentity)).size === values.length;
}

function legacyDisplayUnique(values) {
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
export function assessScionMcItem(
  item,
  {
    topicWords = [],
    sourceClaims = [],
    semanticAdmission = true,
    semanticProfile = 'legacy',
    allowFirstSentenceLexicalCue = semanticAdmission,
    rejectNegativeEvidence = semanticAdmission,
  } = {},
) {
  const normalized = normalizeScionMcItem(item);
  // source-strict extends the complete strict profile; it only adds
  // source-grounded key-term rules and must never silently downgrade MC
  // admission to legacy behavior.
  const judgeInformedSemanticAdmission =
    semanticProfile === 'strict-v3' ||
    semanticProfile === 'source-strict-v3' ||
    semanticProfile === 'strict-v4' ||
    semanticProfile === 'source-strict-v4' ||
    semanticProfile === 'strict-v5' ||
    semanticProfile === 'source-strict-v5' ||
    semanticProfile === 'strict-v6' ||
    semanticProfile === 'source-strict-v6';
  const strictSemanticAdmission =
    semanticAdmission &&
    (semanticProfile === 'strict' || semanticProfile === 'source-strict' || judgeInformedSemanticAdmission);
  const issues = [];
  if (!stringInBand(normalized.question, 25, 300)) issues.push('stem-length');
  if (normalized.options.length !== 4) issues.push('option-count');
  if (normalized.options.length === 4 && normalized.options.some((option) => !stringInBand(option, 5, 95))) {
    issues.push('option-length');
  }
  if (
    strictSemanticAdmission &&
    normalized.options.some((option) => TRUNCATED_OPTION_FRAGMENT_RE.test(clean(option)))
  ) {
    issues.push('truncated-option');
  }
  if (normalized.options.length === 4) {
    const optionLengths = normalized.options.map((option) => clean(option).length);
    if (Math.max(...optionLengths) > Math.min(...optionLengths) * 3 + 20) issues.push('option-homogeneity');
  }
  if (
    normalized.options.length === 4 &&
    (!(semanticAdmission ? unique(normalized.options) : legacyDisplayUnique(normalized.options)) ||
      (judgeInformedSemanticAdmission && findScionNearDuplicateOptionPair(normalized.options)))
  ) {
    issues.push('duplicate-options');
  }
  if (normalized.options.filter((option) => PLACEHOLDER_OPTION_RE.test(option)).length >= 2) {
    issues.push('placeholder-options');
  }
  if (
    strictSemanticAdmission &&
    normalized.options.filter((option) => OPTION_LABEL_PREFIX_RE.test(option)).length >= 2
  ) {
    issues.push('option-label-prefixes');
  }
  if (
    strictSemanticAdmission &&
    normalized.options.filter((option) => OPTION_LABEL_SUFFIX_RE.test(option)).length >= 2
  ) {
    issues.push('option-label-suffixes');
  }
  if (!Number.isInteger(normalized.answerIndex) || normalized.answerIndex < 0 || normalized.answerIndex > 3) {
    issues.push('answer-index');
  }
  if (!stringInBand(normalized.explanation, 20, 300)) issues.push('explanation-length');
  if (
    semanticAdmission &&
    Number.isInteger(normalized.answerIndex) &&
    normalized.answerIndex >= 0 &&
    normalized.answerIndex < normalized.options.length &&
    normalizeScionOptionIdentity(normalized.explanation) ===
      normalizeScionOptionIdentity(normalized.options[normalized.answerIndex])
  ) {
    issues.push('explanation-repeats-answer');
  }
  if (normalized.explanation && !TERMINAL_PUNCT_RE.test(normalized.explanation)) issues.push('truncated-explanation');
  if (strictSemanticAdmission && CLAIM_MARKER_RE.test(normalized.explanation)) issues.push('claim-marker-residue');
  const combinedSurface = [normalized.question, ...normalized.options, normalized.explanation].join(' ');
  if (judgeInformedSemanticAdmission && TEMPLATE_RESIDUE_RE.test(combinedSurface)) issues.push('template-residue');
  if (PROCESS_LEAK_RE.test(combinedSurface)) {
    issues.push('process-leakage');
  }
  if (META_SURFACE_RE.test(combinedSurface)) {
    issues.push('meta-surface');
  }
  if (/\b(?:all|none) of the above\b/i.test(normalized.options.join(' '))) issues.push('all-none-of-above');
  if (strictSemanticAdmission && findScionExplicitNegativeKeyConflict(normalized)) {
    issues.push('explanation-negates-key');
  } else if (judgeInformedSemanticAdmission && findScionMissingKeyExplanationSupport(normalized)) {
    issues.push('explanation-omits-key-support');
  } else if (
    semanticAdmission &&
    findScionSourceAnswerConflict(normalized, { sourceClaims, strict: strictSemanticAdmission })
  ) {
    issues.push('source-answer-conflict');
  } else if (
    strictSemanticAdmission &&
    findScionMultipleSourceSupportedOptions(normalized, {
      sourceClaims,
      allowBroadSourceContext: judgeInformedSemanticAdmission,
      matchingProfile:
        semanticProfile === 'strict-v3' ||
        semanticProfile === 'source-strict-v3' ||
        semanticProfile === 'strict-v4' ||
        semanticProfile === 'source-strict-v4' ||
        semanticProfile === 'strict-v5' ||
        semanticProfile === 'source-strict-v5' ||
        semanticProfile === 'strict' ||
        semanticProfile === 'source-strict'
          ? 'v0.16.58'
          : 'current',
    })
  ) {
    issues.push('multiple-source-supported-options');
  } else if (strictSemanticAdmission && findScionAffirmativeOptionConflict(normalized)) {
    issues.push('explanation-key-conflict');
  } else if (
    findScionExplanationKeyConflict(normalized, {
      allowAffirmativeLead: semanticAdmission,
      stripTerminalPunctuation: semanticAdmission,
      allowFirstSentenceLexicalCue,
      rejectNegativeEvidence,
      allowDirectionalRelationConflict: semanticProfile === 'strict-v6' || semanticProfile === 'source-strict-v6',
    })
  ) {
    issues.push('explanation-key-conflict');
  }
  if (topicWords.length > 0) {
    const combined = [normalized.question, ...normalized.options, normalized.explanation].join(' ').toLowerCase();
    if (!topicWords.some((word) => combined.includes(clean(word).toLowerCase()))) issues.push('off-topic');
  }
  // The answer-position and internal-source residue checks were added after
  // the frozen v0.16.40-v0.16.50 evidence campaigns. Keep them active for the
  // production lesson-kernel profile and direct compiler linting, but do not
  // silently reinterpret historical corpus receipts with newer rules.
  const usesCurrentProductionResidueProfile = semanticProfile === 'source-strict-v6';
  issues.push(
    ...lintItemAdmission(normalized).filter(
      (issue) =>
        usesCurrentProductionResidueProfile ||
        (issue !== 'answer-position-residue' && issue !== 'claim-marker-residue'),
    ),
  );
  const deduped = [...new Set(issues)];
  return {
    eligible: deduped.length === 0,
    issues: deduped,
    score: Math.max(0, 100 - deduped.length * 15),
    normalized,
  };
}

export function assessScionKeyTerm(
  term = {},
  { lessonTitle = '', knownFacts = [], sourceTerm = '', semanticProfile = 'legacy' } = {},
) {
  const result = assessScionKeyTermContract(term, {
    lessonTitle,
    knownFacts,
    sourceTerm,
    definitionMin: 45,
    semanticProfile,
  });
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
    for (const issue of assessScionKeyTerm(term, { knownFacts: facts, semanticProfile: 'strict' }).issues)
      issues.push(`key-term-${index}:${issue}`);
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
    for (const issue of assessScionMcItem(item, { semanticProfile: 'strict' }).issues) {
      issues.push(`mc-${index}:${issue}`);
    }
  });

  const deduped = [...new Set(issues)];
  return { eligible: deduped.length === 0, issues: deduped, score: Math.max(0, 100 - deduped.length * 5) };
}

/** Validate the compact production lesson-kernel contract served by Scion. */
export function assessScionLessonKernel(
  lesson = {},
  { sourceClaims = [], sourceTerm = '', semanticProfile = 'source-strict-v6', userPrompt = '' } = {},
) {
  if (clean(userPrompt)) {
    const result = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      userPrompt,
      'blueprintEnrichment',
    );
    const prefix = `${clean(lesson?.lessonId)}:`;
    const issues = (result.issues || []).map((issue) =>
      prefix && String(issue).startsWith(prefix) ? String(issue).slice(prefix.length) : String(issue),
    );
    return { eligible: !result.needsRetry, issues, score: Math.max(0, 100 - issues.length * 5) };
  }
  const issues = [];
  const facts = Array.isArray(lesson?.facts) ? lesson.facts : [];
  if (facts.length !== 5) issues.push('facts-count');
  facts.forEach((fact, index) => {
    const value = clean(fact);
    const words = value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
    if (value.length < 20 || words < 8 || words > 20) issues.push(`fact-${index}:fact-length`);
    if (!/[.!?][\])}"']?$/.test(value)) issues.push(`fact-${index}:truncated-fact`);
  });

  const keyTerms = Array.isArray(lesson?.keyTerms) ? lesson.keyTerms : [];
  if (keyTerms.length !== 3) issues.push('key-terms-count');
  keyTerms.forEach((term, index) => {
    for (const issue of assessScionKeyTerm(term, {
      lessonTitle: lesson?.lessonId || '',
      knownFacts: sourceClaims,
      sourceTerm,
      semanticProfile,
    }).issues) {
      issues.push(`key-term-${index}:${issue}`);
    }
  });

  const scenarioResult = analyzeDecisionScenario(lesson?.scenario || {});
  if (!scenarioResult.ready) issues.push(...scenarioResult.issues.map((issue) => `scenario:${issue}`));

  const mc = Array.isArray(lesson?.mc) ? lesson.mc : [];
  if (mc.length !== 2) issues.push('mc-count');
  mc.forEach((item, index) => {
    for (const issue of assessScionMcItem(item, { semanticProfile, sourceClaims }).issues) {
      issues.push(`mc-${index}:${issue}`);
    }
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

export function deriveDeterministicContractEvidence(
  { kind, chosen, rejected } = {},
  {
    semanticAdmission = true,
    allowFirstSentenceLexicalCue = semanticAdmission,
    legacyCorrectionRepeatMargin = false,
  } = {},
) {
  const deterministicIssuePattern = legacyCorrectionRepeatMargin
    ? LEGACY_DETERMINISTIC_CONTRACT_ISSUE_RE
    : DETERMINISTIC_CONTRACT_ISSUE_RE;
  let chosenResult;
  let rejectedResult;
  if (kind === 'mc-item') {
    chosenResult = assessScionMcItem(chosen, { semanticAdmission, allowFirstSentenceLexicalCue });
    rejectedResult = assessScionMcItem(rejected, { semanticAdmission, allowFirstSentenceLexicalCue });
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
    !rejectedIssues.every((issue) => deterministicIssuePattern.test(issue))
  ) {
    return null;
  }
  return {
    kind: 'deterministic-contract-margin',
    verified: true,
    validator: 'scion-preference-gate',
    validatorVersion: legacyCorrectionRepeatMargin
      ? LEGACY_SCION_PREFERENCE_GATE_VERSION
      : SCION_PREFERENCE_GATE_VERSION,
    rejectedIssues,
    scope: 'non-semantic-contract-only',
  };
}

/**
 * A preference pair is trainable only with pair-level evidence. Model identity
 * or an aggregate benchmark never proves that every response from that model
 * is the chosen response.
 */
export function assessScionPreferencePair(
  { kind, chosen, rejected, preferenceEvidence } = {},
  {
    semanticAdmission = true,
    semanticProfile = 'legacy',
    sourceClaims = [],
    sourceTerm = '',
    knownFacts = sourceClaims,
    userPrompt = '',
    allowFirstSentenceLexicalCue = semanticAdmission,
    legacyCorrectionRepeatMargin = false,
  } = {},
) {
  const deterministicIssuePattern = legacyCorrectionRepeatMargin
    ? LEGACY_DETERMINISTIC_CONTRACT_ISSUE_RE
    : DETERMINISTIC_CONTRACT_ISSUE_RE;
  const deterministicValidatorVersion = legacyCorrectionRepeatMargin
    ? LEGACY_SCION_PREFERENCE_GATE_VERSION
    : SCION_PREFERENCE_GATE_VERSION;
  let chosenResult;
  let rejectedResult;
  if (kind === 'mc-item') {
    chosenResult = assessScionMcItem(chosen, {
      semanticAdmission,
      semanticProfile,
      sourceClaims,
      allowFirstSentenceLexicalCue,
    });
    rejectedResult = assessScionMcItem(rejected, {
      semanticAdmission,
      semanticProfile,
      sourceClaims,
      allowFirstSentenceLexicalCue,
    });
  } else if (kind === 'key-term') {
    chosenResult = assessScionKeyTerm(chosen, { knownFacts, sourceTerm, semanticProfile });
    rejectedResult = assessScionKeyTerm(rejected, { knownFacts, sourceTerm, semanticProfile });
  } else if (kind === 'lesson') {
    chosenResult = assessScionKernelLesson(chosen);
    rejectedResult = assessScionKernelLesson(rejected);
  } else if (kind === 'lesson-kernel') {
    chosenResult = assessScionLessonKernel(chosen, { sourceClaims, sourceTerm, userPrompt });
    rejectedResult = assessScionLessonKernel(rejected, { sourceClaims, sourceTerm, userPrompt });
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
    preferenceEvidence?.validatorVersion === deterministicValidatorVersion &&
    preferenceEvidence?.scope === 'non-semantic-contract-only' &&
    chosenResult.eligible &&
    rejectedResult.eligible === false &&
    sortedIssues(rejectedResult.issues).every((issue) => deterministicIssuePattern.test(issue)) &&
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
    validateScionTrainingPreferenceEvidence(preferenceEvidence).valid;
  if (preferenceEvidence?.kind === 'single-model-judge-preference' && !singleModelJudgeMargin) {
    issues.push(...validateScionTrainingPreferenceEvidence(preferenceEvidence).issues);
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
