export const SCION_CODEX_TRAINING_REVIEW_PROTOCOL = 'scion-codex-training-review-v2';
export const SCION_CODEX_JUDGE_POLICY_ID = 'scion-codex-judge-policy-v1';
export const SCION_CODEX_JUDGE_MODEL = 'openai/codex';
export const SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH =
  'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md';
export const SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256 =
  '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7';
export const SCION_CODEX_TRAINING_SCORE_DIMENSIONS = Object.freeze([
  'factualCorrectness',
  'sourceFidelity',
  'teachability',
  'coherence',
  'taskQuality',
]);
export const SCION_CODEX_TRAINING_REQUIRED_ORDERS = Object.freeze(['A/B', 'B/A']);
export const SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE = 4;

const SHA256_RE = /^[a-f0-9]{64}$/;
const PLACEHOLDER_RE = /^(?:unknown|unset|placeholder|tbd|todo|replace|n\/a)$/i;

function clean(value) {
  return String(value ?? '').trim();
}

function exactSet(values, expected) {
  if (!Array.isArray(values) || values.length !== expected.length) return false;
  return new Set(values).size === expected.length && expected.every((value) => values.includes(value));
}

function validIdentity(value) {
  const normalized = clean(value);
  return normalized.length >= 3 && !PLACEHOLDER_RE.test(normalized);
}

function validScoreRecord(scores, minimum = 1) {
  return SCION_CODEX_TRAINING_SCORE_DIMENSIONS.every(
    (dimension) => Number.isInteger(scores?.[dimension]) && scores[dimension] >= minimum && scores[dimension] <= 5,
  );
}

export function validateScionCodexTrainingPreferenceEvidence(evidence) {
  const issues = [];
  if (evidence?.kind !== 'single-model-judge-preference') issues.push('invalid-model-judge-evidence-kind');
  if (evidence?.protocol !== SCION_CODEX_TRAINING_REVIEW_PROTOCOL) issues.push('invalid-model-judge-protocol');
  if (evidence?.benchmarkProtocol !== 'honest-quality-benchmark-v1') {
    issues.push('invalid-model-judge-benchmark-protocol');
  }
  if (evidence?.policyId !== SCION_CODEX_JUDGE_POLICY_ID) issues.push('invalid-model-judge-policy');
  if (evidence?.verified !== true) issues.push('unverified-model-judge-preference');
  if (evidence?.preferred !== 'chosen') issues.push('model-judge-preferred-side');
  if (evidence?.primaryPreferenceEvidence !== 'single-model-judge') {
    issues.push('model-judge-primary-evidence-class');
  }
  if (evidence?.stable !== true) issues.push('model-judge-position-disagreement');
  if (evidence?.scoredBeforePreference !== true) issues.push('model-judge-scoring-order');
  if (evidence?.humanEvidence !== false) issues.push('model-judge-human-claim');
  if (evidence?.independentEvidence !== false) issues.push('model-judge-independent-claim');
  if (evidence?.judge?.model !== SCION_CODEX_JUDGE_MODEL) issues.push('model-judge-model');
  if (!validIdentity(evidence?.judge?.revision)) issues.push('model-judge-revision');
  if (!validIdentity(evidence?.judge?.runtime)) issues.push('model-judge-runtime');
  if (!Array.isArray(evidence?.judge?.sessionIds) || new Set(evidence.judge.sessionIds).size !== 2) {
    issues.push('model-judge-fresh-session-count');
  } else if (!evidence.judge.sessionIds.every(validIdentity)) {
    issues.push('model-judge-session-id');
  }
  if (evidence?.judge?.promptPath !== SCION_CODEX_TRAINING_JUDGE_PROMPT_PATH) {
    issues.push('model-judge-prompt-path');
  }
  if (evidence?.judge?.promptSha256 !== SCION_CODEX_TRAINING_JUDGE_PROMPT_SHA256) {
    issues.push('model-judge-prompt-sha256');
  }
  if (!exactSet(evidence?.orders, SCION_CODEX_TRAINING_REQUIRED_ORDERS)) {
    issues.push('model-judge-required-orders');
  }
  if (
    !Array.isArray(evidence?.passHashes) ||
    evidence.passHashes.length !== 2 ||
    new Set(evidence.passHashes).size !== 2 ||
    !evidence.passHashes.every((value) => SHA256_RE.test(clean(value)))
  ) {
    issues.push('model-judge-pass-hashes');
  }
  if (
    !Array.isArray(evidence?.scorecardHashes) ||
    evidence.scorecardHashes.length !== 4 ||
    new Set(evidence.scorecardHashes).size !== 4 ||
    !evidence.scorecardHashes.every((value) => SHA256_RE.test(clean(value)))
  ) {
    issues.push('model-judge-scorecard-hashes');
  }
  for (const field of [
    'caseDigest',
    'courseGroupSha256',
    'reviewPacketDigest',
    'sourceRowSha256',
    'sourceContextSha256',
    'trainingPairSha256',
    'chosenArtifactSha256',
    'rejectedArtifactSha256',
  ]) {
    if (!SHA256_RE.test(clean(evidence?.[field]))) issues.push(`model-judge-${field}`);
  }
  if (!validScoreRecord(evidence?.winnerMinimumScores, SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE)) {
    issues.push('model-judge-winner-score-floor');
  }
  if (!Number.isFinite(evidence?.minimumScoreMargin) || evidence.minimumScoreMargin <= 0) {
    issues.push('model-judge-score-margin');
  }
  if (!Array.isArray(evidence?.decisionDefects) || evidence.decisionDefects.length < 2) {
    issues.push('model-judge-concrete-defects');
  } else if (evidence.decisionDefects.some((value) => clean(value).length < 10)) {
    issues.push('model-judge-defect-detail');
  }
  if (!clean(evidence?.claimBoundary).includes('single-model')) issues.push('model-judge-claim-boundary');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
