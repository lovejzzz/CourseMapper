import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeModelComparison } from './qualityBenchmark.mjs';
import { computeScionAdapterPackageIdentity } from './scionBrowserDeviceMatrix.mjs';
import { verifyComparisonScorecards } from '../qualityModelComparison.mjs';
import { sha256File } from '../scionAdapterPackage.mjs';

export const SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL = 'scion-adapter-single-model-judge-promotion-v1';
export const SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY =
  'This is one provenance-bound model judge repeated in both presentation orders. It is not human, instructor, independent, classroom, or multi-judge evidence.';

const SHA256 = /^[a-f0-9]{64}$/;
const QUALITY_MANIFEST_PATH = 'evaluation/quality-benchmark/v1/manifest.json';
const QUALITY_RUBRIC_PATH = 'evaluation/quality-benchmark/v1/rubric.json';
const QUALITY_JUDGE_PROMPT_PATH = 'evaluation/quality-benchmark/v1/single-model-judge-prompt-v1.md';
const HELD_OUT_BENCHMARK_PATH = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
const REQUIRED_DIMENSIONS = Object.freeze([
  'instructional-alignment',
  'accuracy-source-fidelity',
  'assessment-feedback',
  'teaching-learning-usability',
  'student-clarity-support',
  'inclusion-accessibility',
  'integrity-safety-rights',
  'professional-craft',
  'cross-artifact-coherence',
]);
const REQUIRED_COMPARISONS = Object.freeze(['adapter-vs-base', 'adapter-vs-paid-reference']);

function clean(value) {
  return String(value ?? '').trim();
}

function sameMembers(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function strictPositiveInterval(interval, threshold = 0) {
  return Array.isArray(interval) && Number.isFinite(interval[0]) && interval[0] > threshold;
}

function strictNegativeInterval(interval, threshold = 0) {
  return Array.isArray(interval) && Number.isFinite(interval[1]) && interval[1] < threshold;
}

function wilsonLowerBound(successes, total, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0 || successes < 0 || successes > total) {
    return 0;
  }
  const share = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = share + (z * z) / (2 * total);
  const margin = z * Math.sqrt((share * (1 - share)) / total + (z * z) / (4 * total * total));
  return (centre - margin) / denominator;
}

async function resolveRegularFile(root, relativePath) {
  const declared = clean(relativePath).replaceAll('\\', '/');
  if (
    !declared ||
    path.isAbsolute(declared) ||
    declared.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe-relative-path:${declared || '<missing>'}`);
  }
  const [realRoot, absolute] = await Promise.all([fs.realpath(root), Promise.resolve(path.resolve(root, declared))]);
  const stats = await fs.lstat(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`not-regular-file:${declared}`);
  const realFile = await fs.realpath(absolute);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path-escapes-root:${declared}`);
  }
  return absolute;
}

async function loadCanonical(root) {
  const paths = {
    qualityManifest: QUALITY_MANIFEST_PATH,
    rubric: QUALITY_RUBRIC_PATH,
    judgePrompt: QUALITY_JUDGE_PROMPT_PATH,
    heldOutCourseBenchmark: HELD_OUT_BENCHMARK_PATH,
  };
  const absolute = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([key, relativePath]) => [key, await resolveRegularFile(root, relativePath)]),
    ),
  );
  const [qualityManifest, rubric, heldOutCourseBenchmark, hashes] = await Promise.all([
    fs.readFile(absolute.qualityManifest, 'utf8').then(JSON.parse),
    fs.readFile(absolute.rubric, 'utf8').then(JSON.parse),
    fs.readFile(absolute.heldOutCourseBenchmark, 'utf8').then(JSON.parse),
    Promise.all(Object.values(absolute).map((filePath) => sha256File(filePath))),
  ]);
  return {
    paths,
    absolute,
    hashes: Object.fromEntries(Object.keys(absolute).map((key, index) => [key, hashes[index]])),
    qualityManifest,
    rubric,
    heldOutCourseBenchmark,
  };
}

function modelById(comparison, id) {
  return (comparison?.models || []).find((model) => model?.id === id);
}

function adapterModelIdentityPass(model, evidence, adapterManifest, adapterPackageIdentitySha256) {
  return (
    model?.id === evidence?.adapter?.id &&
    model?.provider === 'local-browser' &&
    model?.model === adapterManifest?.base?.modelId &&
    model?.revision === adapterManifest?.base?.revision &&
    model?.parameters?.adapterActive === true &&
    model?.parameters?.adapterId === adapterManifest?.adapter?.id &&
    model?.parameters?.adapterPackageIdentitySha256 === adapterPackageIdentitySha256 &&
    Number(model?.parameters?.adapterScale) === Number(adapterManifest?.adapter?.scale ?? 1)
  );
}

function controlModelIdentityPass(role, model, evidence, adapterManifest) {
  if (role === 'adapter-vs-base') {
    return (
      model?.id === evidence?.base?.id &&
      model?.provider === 'local-browser' &&
      model?.model === adapterManifest?.base?.modelId &&
      model?.revision === adapterManifest?.base?.revision &&
      model?.parameters?.adapterActive === false
    );
  }
  const reference = evidence?.paidReference;
  return (
    model?.id === reference?.id &&
    model?.provider === reference?.provider &&
    model?.model === reference?.model &&
    model?.revision === reference?.modelRevision &&
    model?.parameters?.route === reference?.route &&
    model?.parameters?.reasoningEffort === reference?.reasoningEffort &&
    clean(reference?.modelRevision).length >= 8 &&
    reference?.modelRevision !== reference?.model
  );
}

function comparisonBindingIssues({
  comparison,
  role,
  evidence,
  adapterManifest,
  adapterPackageIdentitySha256,
  canonical,
}) {
  const issues = [];
  const expectedCourses = canonical.heldOutCourseBenchmark.courses || [];
  const expectedCaseIds = expectedCourses.map((course) => course.courseId);
  const courseById = new Map(expectedCourses.map((course) => [course.courseId, course]));
  const candidateModel = modelById(comparison, comparison?.candidateId);
  const controlModel = modelById(comparison, comparison?.controlId);
  if (!adapterModelIdentityPass(candidateModel, evidence, adapterManifest, adapterPackageIdentitySha256)) {
    issues.push(`${role}:adapter-model-identity-mismatch`);
  }
  if (!controlModelIdentityPass(role, controlModel, evidence, adapterManifest)) {
    issues.push(`${role}:control-model-identity-mismatch`);
  }
  if (!sameMembers(comparison?.preregistration?.caseIds || [], expectedCaseIds)) {
    issues.push(`${role}:held-out-case-set-mismatch`);
  }
  if (comparison?.preregistration?.minimumTrialsPerCase !== 10) issues.push(`${role}:minimum-trials-must-be-10`);
  if (comparison?.preregistration?.corpusManifestSha256 !== canonical.hashes.heldOutCourseBenchmark) {
    issues.push(`${role}:held-out-manifest-sha256-mismatch`);
  }
  if (comparison?.preregistration?.analysisPlanSha256 !== canonical.hashes.qualityManifest) {
    issues.push(`${role}:analysis-plan-sha256-mismatch`);
  }
  if (
    comparison?.preregistration?.modelJudge?.promptSha256 !== canonical.hashes.judgePrompt ||
    comparison?.preregistration?.modelJudge?.requiredPassesPerTrial !== 2 ||
    !sameMembers(comparison?.preregistration?.modelJudge?.requiredOrders || [], ['A/B', 'B/A'])
  ) {
    issues.push(`${role}:judge-protocol-mismatch`);
  }
  if (comparison?.trials?.length !== expectedCaseIds.length * 10) issues.push(`${role}:trial-count-must-be-50`);
  for (const caseId of expectedCaseIds) {
    const course = courseById.get(caseId);
    const trials = (comparison?.trials || []).filter((trial) => trial?.caseId === caseId);
    if (trials.length !== 10) issues.push(`${role}:${caseId}:trial-count-must-be-10`);
    const candidateLabels = trials.map((trial) => trial?.randomization?.candidateLabel);
    if (
      candidateLabels.filter((label) => label === 'A').length !== 5 ||
      candidateLabels.filter((label) => label === 'B').length !== 5
    ) {
      issues.push(`${role}:${caseId}:candidate-side-not-balanced`);
    }
    for (const trial of trials) {
      const prefix = `${role}:${caseId}:trial-${trial?.trialIndex ?? '?'}`;
      if (trial?.split !== 'heldout') issues.push(`${prefix}:not-heldout`);
      if (trial?.sourceSha256 !== course.sourcePacketSha256) issues.push(`${prefix}:source-sha256-mismatch`);
      if (trial?.matchedInputSha256 !== course.courseInputSha256) issues.push(`${prefix}:course-input-sha256-mismatch`);
      for (const side of ['candidate', 'control']) {
        const dimensions = Object.keys(trial?.outputs?.[side]?.dimensionScores || {});
        if (!sameMembers(dimensions, REQUIRED_DIMENSIONS)) issues.push(`${prefix}:${side}:dimension-set-mismatch`);
        if (trial?.outputs?.[side]?.scoreEvidence?.rubricSha256 !== canonical.hashes.rubric) {
          issues.push(`${prefix}:${side}:rubric-sha256-mismatch`);
        }
      }
      const preferences = trial?.preferences || [];
      if (
        preferences.length !== 2 ||
        !sameMembers(
          preferences.map((preference) => preference?.order),
          ['A/B', 'B/A'],
        )
      ) {
        issues.push(`${prefix}:requires-exact-reversed-order-pair`);
      }
    }
  }
  return issues;
}

function reportThresholdIssues(report, role) {
  const issues = [];
  if (report?.status !== 'model-judged-for-declared-scope' || report?.issues?.length) {
    issues.push(`${role}:comparison-analysis-invalid`);
  }
  const judge = report?.singleModelJudgePreference || {};
  if (
    judge.stableTrialCount !== 50 ||
    judge.completeCases !== 5 ||
    judge.consistencyRate !== 1 ||
    judge.judgeIdentityCount !== 1 ||
    judge.positionSensitiveOrIncompleteTrials?.length
  ) {
    issues.push(`${role}:single-judge-completeness-failed`);
  }
  if (!(Number(judge.wilson95?.[0]) > 0.5)) issues.push(`${role}:global-preference-wilson-lower-not-above-half`);
  for (const [caseId, row] of Object.entries(judge.byCase || {})) {
    const effectiveWins = Number(row.wins || 0) + Number(row.ties || 0) * 0.5;
    const total = Number(row.stableTrials || 0);
    if (!(wilsonLowerBound(effectiveWins, total) > 0.5))
      issues.push(`${role}:${caseId}:preference-wilson-lower-not-above-half`);
  }
  if (!strictPositiveInterval(report?.absoluteScoreEffect?.candidateMinusControlMean?.interval95)) {
    issues.push(`${role}:global-score-delta-lower-not-positive`);
  }
  for (const [caseId, row] of Object.entries(report?.absoluteScoreEffect?.byCase || {})) {
    if (!strictPositiveInterval(row.meanDeltaInterval95))
      issues.push(`${role}:${caseId}:score-delta-lower-not-positive`);
  }
  if (role === 'adapter-vs-base') {
    const calls = report?.operations?.candidateMinusControlCompilerBurden?.scionCalls;
    if (!strictNegativeInterval(calls?.interval95)) issues.push(`${role}:scion-call-delta-upper-not-negative`);
  }
  return issues;
}

function crossComparisonIssues(rows) {
  const issues = [];
  const base = rows.find((row) => row.role === 'adapter-vs-base')?.comparison;
  const paid = rows.find((row) => row.role === 'adapter-vs-paid-reference')?.comparison;
  if (!base || !paid) return ['missing-required-comparison-for-cross-check'];
  if (base.environment?.compilerCommit !== paid.environment?.compilerCommit)
    issues.push('comparison-compiler-commit-mismatch');
  if (JSON.stringify(base.preregistration?.modelJudge) !== JSON.stringify(paid.preregistration?.modelJudge)) {
    issues.push('comparison-judge-identity-mismatch');
  }
  const baseTrials = new Map((base.trials || []).map((trial) => [`${trial.caseId}\0${trial.trialIndex}`, trial]));
  const paidTrials = new Map((paid.trials || []).map((trial) => [`${trial.caseId}\0${trial.trialIndex}`, trial]));
  if (!sameMembers(baseTrials.keys(), paidTrials.keys())) return [...issues, 'comparison-trial-key-set-mismatch'];
  for (const [key, baseTrial] of baseTrials) {
    const paidTrial = paidTrials.get(key);
    for (const field of ['sourceSha256', 'matchedInputSha256', 'matchedSettingsSha256', 'seed']) {
      if (baseTrial?.[field] !== paidTrial?.[field])
        issues.push(`${key.replace('\0', ':')}:cross-comparison-${field}-mismatch`);
    }
    const baseCandidate = baseTrial?.outputs?.candidate;
    const paidCandidate = paidTrial?.outputs?.candidate;
    for (const field of ['outputSha256', 'benchmarkScore']) {
      if (baseCandidate?.[field] !== paidCandidate?.[field]) {
        issues.push(`${key.replace('\0', ':')}:candidate-${field}-not-reused`);
      }
    }
    if (baseCandidate?.scoreEvidence?.scorecardSha256 !== paidCandidate?.scoreEvidence?.scorecardSha256) {
      issues.push(`${key.replace('\0', ':')}:candidate-scorecard-not-reused`);
    }
    if (JSON.stringify(baseCandidate?.dimensionScores) !== JSON.stringify(paidCandidate?.dimensionScores)) {
      issues.push(`${key.replace('\0', ':')}:candidate-dimension-scores-not-reused`);
    }
  }
  return issues;
}

export async function auditScionAdapterSingleModelJudgeEvidence({
  root = process.cwd(),
  evidencePath,
  evidence,
  adapterManifest,
  adapterPackageIdentitySha256,
  bootstrapSamples = 1000,
} = {}) {
  const issues = [];
  if (evidence?.schemaVersion !== 1) issues.push('evidence-schema-version');
  if (evidence?.protocolVersion !== SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL) issues.push('evidence-protocol-version');
  if (evidence?.benchmarkProtocol !== 'honest-quality-benchmark-v1') issues.push('benchmark-protocol');
  if (evidence?.claimBoundary !== SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY) issues.push('claim-boundary');
  const computedPackageIdentity = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  if (!SHA256.test(clean(adapterPackageIdentitySha256))) issues.push('adapter-package-identity-sha256-missing');
  if (clean(adapterPackageIdentitySha256) !== computedPackageIdentity) {
    issues.push('adapter-package-identity-sha256-mismatch');
  }
  const canonical = await loadCanonical(path.resolve(root));
  if (
    canonical.qualityManifest?.benchmarkVersion !== '1.0.0' ||
    canonical.qualityManifest?.rubricVersion !== '1.0.0' ||
    canonical.qualityManifest?.rubricPath !== canonical.paths.rubric ||
    canonical.qualityManifest?.rubricSha256 !== canonical.hashes.rubric
  ) {
    issues.push('canonical-quality-manifest-rubric-contract-invalid');
  }
  if (
    canonical.qualityManifest?.singleModelJudgePolicy?.promptPath !== canonical.paths.judgePrompt ||
    canonical.qualityManifest?.singleModelJudgePolicy?.promptSha256 !== canonical.hashes.judgePrompt
  ) {
    issues.push('canonical-quality-manifest-judge-contract-invalid');
  }
  if (
    !sameMembers(
      (canonical.rubric?.dimensions || []).map((dimension) => dimension?.id),
      REQUIRED_DIMENSIONS,
    )
  ) {
    issues.push('canonical-rubric-dimension-set-invalid');
  }
  if (
    canonical.heldOutCourseBenchmark?.protocolVersion !== 'scion-adapter-course-pair-v1' ||
    canonical.heldOutCourseBenchmark?.courses?.length !== 5 ||
    canonical.heldOutCourseBenchmark?.base?.modelId !== adapterManifest?.base?.modelId ||
    canonical.heldOutCourseBenchmark?.base?.revision !== adapterManifest?.base?.revision
  ) {
    issues.push('canonical-held-out-course-contract-invalid');
  }
  for (const [key, relativePath] of Object.entries(canonical.paths)) {
    const binding = evidence?.benchmark?.[key];
    if (binding?.path !== relativePath || binding?.sha256 !== canonical.hashes[key]) {
      issues.push(`canonical-${key}-binding-mismatch`);
    }
  }
  if (
    evidence?.adapter?.id !== adapterManifest?.adapter?.id ||
    evidence?.adapter?.packageIdentitySha256 !== adapterPackageIdentitySha256 ||
    evidence?.adapter?.baseRevision !== adapterManifest?.base?.revision ||
    Number(evidence?.adapter?.scale) !== Number(adapterManifest?.adapter?.scale ?? 1)
  ) {
    issues.push('adapter-binding-mismatch');
  }
  if (
    evidence?.base?.id !== 'scion-base-only' ||
    evidence?.base?.model !== adapterManifest?.base?.modelId ||
    evidence?.base?.revision !== adapterManifest?.base?.revision
  ) {
    issues.push('base-binding-mismatch');
  }
  if (
    evidence?.paidReference?.provider !== 'openai' ||
    evidence?.paidReference?.model !== 'gpt-5.4-mini' ||
    evidence?.paidReference?.route !== 'responses-api' ||
    evidence?.paidReference?.reasoningEffort !== 'low' ||
    evidence?.paidReference?.modelRevision === evidence?.paidReference?.model ||
    clean(evidence?.paidReference?.modelRevision).length < 8
  ) {
    issues.push('paid-reference-binding-mismatch');
  }
  const declaredComparisons = Array.isArray(evidence?.comparisons) ? evidence.comparisons : [];
  if (
    !sameMembers(
      declaredComparisons.map((row) => row?.role),
      REQUIRED_COMPARISONS,
    )
  ) {
    issues.push('required-comparison-set-mismatch');
  }
  const evidenceDirectory = evidencePath ? path.dirname(path.resolve(evidencePath)) : path.resolve(root);
  const rows = [];
  for (const role of REQUIRED_COMPARISONS) {
    const binding = declaredComparisons.find((row) => row?.role === role);
    if (!binding) continue;
    try {
      const absolute = await resolveRegularFile(evidenceDirectory, binding.path);
      const actualSha256 = await sha256File(absolute);
      if (!SHA256.test(clean(binding.sha256)) || actualSha256 !== binding.sha256) {
        issues.push(`${role}:comparison-sha256-mismatch`);
        continue;
      }
      const comparison = JSON.parse(await fs.readFile(absolute, 'utf8'));
      const scorecards = await verifyComparisonScorecards(comparison, { baseDir: path.dirname(absolute) });
      const report = analyzeModelComparison(comparison, {
        bootstrapSamples,
        verifiedScorecardSha256s: scorecards.verifiedScorecardSha256s,
      });
      issues.push(...scorecards.issues.map((issue) => `${role}:scorecard:${issue}`));
      issues.push(
        ...comparisonBindingIssues({
          comparison,
          role,
          evidence,
          adapterManifest,
          adapterPackageIdentitySha256,
          canonical,
        }),
      );
      issues.push(...reportThresholdIssues(report, role));
      rows.push({ role, path: binding.path, sha256: actualSha256, comparison, report });
    } catch (error) {
      issues.push(`${role}:comparison-unavailable:${clean(error?.message || error)}`);
    }
  }
  issues.push(...crossComparisonIssues(rows));
  const uniqueIssues = [...new Set(issues)];
  return {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL,
    status: uniqueIssues.length === 0 ? 'pass' : 'blocked',
    promotionEligible: uniqueIssues.length === 0,
    claimBoundary: SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY,
    adapterId: adapterManifest?.adapter?.id || null,
    adapterPackageIdentitySha256: adapterPackageIdentitySha256 || null,
    expectedCases: canonical.heldOutCourseBenchmark.courses.map((course) => ({
      courseId: course.courseId,
      domain: course.domain,
    })),
    comparisons: rows.map((row) => ({ role: row.role, path: row.path, sha256: row.sha256, report: row.report })),
    issues: uniqueIssues,
  };
}
