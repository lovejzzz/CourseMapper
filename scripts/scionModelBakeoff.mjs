#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  loadFactualCanaryPacket,
  queryFactualCanaryEndpoint,
  scoreFactualCanaries,
} from './scionFactualCanaryAudit.mjs';
import { parseScionConsoleEvents, summarizeScionCompilerBurden } from './lib/scionCompilerBurden.mjs';
import { analyzeModelComparison } from './lib/qualityBenchmark.mjs';
import { verifyComparisonScorecards } from './qualityModelComparison.mjs';

const DEFAULT_REGISTRY = 'evaluation/scion-model-candidates.json';
const DEFAULT_MANIFEST = 'evaluation/scion-factual-canaries.json';
const DEFAULT_EVIDENCE = 'evaluation/scion-model-evidence';
const DEFAULT_OUTPUT = 'verification-output/scion-model-bakeoff';
const AVAILABILITY = new Set(['ready', 'ready-after-download', 'adapter-needed']);
const RUNTIMES = new Set(['mlx-vlm', 'mlx-lm']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function wilsonLowerBound(successes, total, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0 || successes < 0 || successes > total) {
    return 0;
  }
  const share = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = share + (z * z) / (2 * total);
  const margin = z * Math.sqrt((share * (1 - share)) / total + (z * z) / (4 * total * total));
  return (centre - margin) / denominator;
}

export function validateScionModelRegistry(registry) {
  const issues = [];
  if (registry?.schemaVersion !== 1) issues.push('unsupported-registry-schema');
  if (!String(registry?.protocolVersion || '').trim()) issues.push('missing-protocol-version');
  if (!Array.isArray(registry?.candidates) || registry.candidates.length < 2) issues.push('insufficient-candidates');
  const ids = new Set();
  for (const candidate of registry?.candidates || []) {
    if (!String(candidate?.id || '').trim()) issues.push('candidate-missing-id');
    else if (ids.has(candidate.id)) issues.push(`duplicate-candidate:${candidate.id}`);
    else ids.add(candidate.id);
    if (!String(candidate?.servingModelId || '').trim()) issues.push(`candidate-missing-model:${candidate?.id || '?'}`);
    if (!String(candidate?.browserModelId || '').trim())
      issues.push(`candidate-missing-browser-model:${candidate?.id || '?'}`);
    if (!RUNTIMES.has(candidate?.runtime)) issues.push(`candidate-invalid-runtime:${candidate?.id || '?'}`);
    if (!AVAILABILITY.has(candidate?.availability))
      issues.push(`candidate-invalid-availability:${candidate?.id || '?'}`);
    if (!Array.isArray(candidate?.sources) || candidate.sources.length === 0) {
      issues.push(`candidate-missing-sources:${candidate?.id || '?'}`);
    }
  }
  if (!ids.has(registry?.controlCandidateId)) issues.push('control-candidate-not-found');
  const controls = (registry?.candidates || []).filter((candidate) => candidate.role === 'control');
  if (controls.length !== 1 || controls[0]?.id !== registry?.controlCandidateId)
    issues.push('invalid-control-candidate');
  const screening = registry?.screeningPolicy || {};
  for (const key of [
    'requiredColdRuns',
    'requiredGroundedRuns',
    'requiredCasesPerRun',
    'minimumColdCorrect',
    'minimumGroundedCorrect',
  ]) {
    if (!Number.isInteger(screening[key]) || screening[key] < 1) issues.push(`invalid-screening-policy:${key}`);
  }
  const promotion = registry?.promotionPolicy || {};
  if (!Number.isInteger(promotion.minimumMatchedControlCourses) || promotion.minimumMatchedControlCourses < 1) {
    issues.push('invalid-promotion-policy:minimumMatchedControlCourses');
  }
  if (
    !Number.isFinite(promotion.maximumScionCallAmplificationVsControl) ||
    promotion.maximumScionCallAmplificationVsControl < 1
  ) {
    issues.push('invalid-promotion-policy:maximumScionCallAmplificationVsControl');
  }
  if (promotion.requireHonestQualityBenchmark !== true)
    issues.push('invalid-promotion-policy:requireHonestQualityBenchmark');
  if (!['qualified-human', 'single-model-judge'].includes(promotion.qualityPreferenceMode))
    issues.push('invalid-promotion-policy:qualityPreferenceMode');
  if (
    promotion.qualityPreferenceMode === 'single-model-judge' &&
    (!Number.isInteger(promotion.minimumStableModelJudgeTrials) || promotion.minimumStableModelJudgeTrials < 3)
  ) {
    issues.push('invalid-promotion-policy:minimumStableModelJudgeTrials');
  }
  if (
    promotion.qualityPreferenceMode === 'single-model-judge' &&
    (!Number.isInteger(promotion.minimumModelJudgePassesPerTrial) || promotion.minimumModelJudgePassesPerTrial < 2)
  ) {
    issues.push('invalid-promotion-policy:minimumModelJudgePassesPerTrial');
  }
  if (promotion.qualityPreferenceMode === 'single-model-judge' && promotion.requireBothModelJudgeOrders !== true) {
    issues.push('invalid-promotion-policy:requireBothModelJudgeOrders');
  }
  if (!Number.isInteger(promotion.minimumQualityComparisonCases) || promotion.minimumQualityComparisonCases < 5)
    issues.push('invalid-promotion-policy:minimumQualityComparisonCases');
  if (!Number.isInteger(promotion.minimumQualityTrialsPerCase) || promotion.minimumQualityTrialsPerCase < 3)
    issues.push('invalid-promotion-policy:minimumQualityTrialsPerCase');
  if (!Number.isFinite(promotion.minimumQualityDeltaLowerBound) || promotion.minimumQualityDeltaLowerBound < 0)
    issues.push('invalid-promotion-policy:minimumQualityDeltaLowerBound');
  if (
    !Number.isFinite(promotion.maximumCompilerBurdenDeltaUpperBound) ||
    promotion.maximumCompilerBurdenDeltaUpperBound > 0
  ) {
    issues.push('invalid-promotion-policy:maximumCompilerBurdenDeltaUpperBound');
  }
  return issues;
}

function evidenceIdentityIssues(candidate, evidence, registry) {
  const issues = [];
  if (evidence?.schemaVersion !== 1) issues.push('unsupported-evidence-schema');
  if (evidence?.protocolVersion !== registry.protocolVersion) issues.push('protocol-mismatch');
  if (evidence?.candidateId !== candidate.id) issues.push('candidate-id-mismatch');
  if (evidence?.servingModelId !== candidate.servingModelId) issues.push('serving-model-id-mismatch');
  if (Array.isArray(evidence?.runs) && !/^[a-f0-9]{64}$/.test(String(evidence?.canaryPacketSha256 || ''))) {
    issues.push('missing-canary-fingerprint');
  }
  if (
    !Array.isArray(evidence?.runs) &&
    !Array.isArray(evidence?.fullCourses) &&
    !Array.isArray(evidence?.browserRuns) &&
    !Array.isArray(evidence?.blindComparisons) &&
    !Array.isArray(evidence?.qualityComparisons)
  ) {
    issues.push('missing-evidence-payload');
  }
  return issues;
}

function promotionEvidence(evidenceRows) {
  const fullCourses = [];
  const artifactIndex = new Map();
  for (const evidence of evidenceRows) {
    for (const course of Array.isArray(evidence.fullCourses) ? evidence.fullCourses : []) {
      const artifact = String(course?.sourceArtifact || '').trim();
      if (!artifact) {
        fullCourses.push(course);
        continue;
      }
      if (artifactIndex.has(artifact)) fullCourses[artifactIndex.get(artifact)] = course;
      else {
        artifactIndex.set(artifact, fullCourses.length);
        fullCourses.push(course);
      }
    }
  }
  return {
    fullCourses,
    browserRuns: evidenceRows.flatMap((row) => (Array.isArray(row.browserRuns) ? row.browserRuns : [])),
    blindComparisons: evidenceRows.flatMap((row) => (Array.isArray(row.blindComparisons) ? row.blindComparisons : [])),
    qualityComparisons: evidenceRows.flatMap((row) =>
      (Array.isArray(row.qualityComparisons) ? row.qualityComparisons : []).map((comparison, index) => ({
        comparison,
        verification: row.__qualityComparisonVerifications?.[index] || {
          verifiedScorecardSha256s: [],
          issues: ['quality comparison scorecards were not independently byte-verified'],
        },
      })),
    ),
  };
}

export function evaluateScionModelCandidate(candidate, evidenceRows, registry, controlEvaluation = null) {
  const screening = registry.screeningPolicy;
  const promotion = registry.promotionPolicy;
  const identityIssues = evidenceRows.flatMap((evidence, index) =>
    evidenceIdentityIssues(candidate, evidence, registry).map((issue) => `evidence-${index + 1}:${issue}`),
  );
  const sessions = evidenceRows.map((evidence) => {
    const runs = (Array.isArray(evidence.runs) ? evidence.runs : []).map((run) => ({
      ...run,
      canaryPacketSha256: evidence.canaryPacketSha256,
    }));
    const coldRuns = runs.filter((run) => run.mode === 'cold');
    const groundedRuns = runs.filter((run) => run.mode === 'source-grounded');
    const issues = [];
    if (coldRuns.length < screening.requiredColdRuns) issues.push('insufficient-cold-runs');
    if (groundedRuns.length < screening.requiredGroundedRuns) issues.push('insufficient-grounded-runs');
    if (runs.some((run) => run.error)) issues.push('factual-run-error');
    if (
      screening.requireSingleManifest &&
      new Set(runs.map((run) => run.canaryPacketSha256).filter(Boolean)).size > 1
    ) {
      issues.push('mixed-canary-fingerprints');
    }
    const invalidRuns = runs.filter((run) => {
      const report = run.report || {};
      return (
        report.total !== screening.requiredCasesPerRun ||
        (screening.requireValidShape && report.validShape !== true) ||
        (run.mode === 'cold' && report.correct < screening.minimumColdCorrect) ||
        (run.mode === 'source-grounded' && report.correct < screening.minimumGroundedCorrect)
      );
    });
    if (invalidRuns.length > 0) issues.push('factual-floor-not-met');
    return { runs, coldRuns, groundedRuns, issues };
  });
  const passingSession = [...sessions].reverse().find((session) => session.issues.length === 0);
  const selectedSession = passingSession || sessions.at(-1) || { runs: [], coldRuns: [], groundedRuns: [], issues: [] };
  const { runs, coldRuns, groundedRuns } = selectedSession;
  const screeningIssues = [...identityIssues];
  if (!passingSession) {
    if (sessions.length === 0) screeningIssues.push('insufficient-cold-runs', 'insufficient-grounded-runs');
    else screeningIssues.push(...new Set(sessions.flatMap((session) => session.issues)));
  }
  const screeningStatus = screeningIssues.length === 0 ? 'passed' : 'failed';

  const aggregated = promotionEvidence(evidenceRows);
  const promotionIssues = [];
  if (screeningStatus !== 'passed') promotionIssues.push('factual-screening-not-passed');
  const validCourses = aggregated.fullCourses.filter(
    (course) =>
      course?.packageValid === true &&
      course.lessonCount >= promotion.minimumLessonsPerCourse &&
      course.packageGrade >= promotion.minimumPackageGrade &&
      course.p0 <= promotion.maximumP0 &&
      course.p1 <= promotion.maximumP1,
  );
  if (validCourses.length < promotion.minimumFullCourses) promotionIssues.push('insufficient-passing-full-courses');
  if (new Set(validCourses.map((course) => course.domain).filter(Boolean)).size < promotion.minimumDomains) {
    promotionIssues.push('insufficient-full-course-domain-coverage');
  }
  const controlCourses = controlEvaluation?.promotionEvidence?.validFullCourseDetails || [];
  const matchedControlComparisons = [];
  if (
    promotion.requireControlComparison &&
    candidate.id !== registry.controlCandidateId &&
    controlEvaluation?.screeningStatus !== 'passed'
  ) {
    promotionIssues.push('missing-qualified-control-comparison');
  }
  if (promotion.requireControlComparison && candidate.id !== registry.controlCandidateId) {
    for (const course of validCourses) {
      const controlCourse = controlCourses.find((entry) => entry.domain === course.domain);
      if (!controlCourse) continue;
      const candidateCalls = Number(course.scionPassCalls) || 0;
      const controlCalls = Number(controlCourse.scionPassCalls) || 0;
      matchedControlComparisons.push({
        domain: course.domain,
        candidateCalls,
        controlCalls,
        callAmplification: controlCalls > 0 ? candidateCalls / controlCalls : null,
      });
    }
    if (matchedControlComparisons.length < (promotion.minimumMatchedControlCourses || 1)) {
      promotionIssues.push('insufficient-matched-control-full-courses');
    }
    if (
      matchedControlComparisons.some(
        (comparison) =>
          comparison.callAmplification === null ||
          comparison.callAmplification > promotion.maximumScionCallAmplificationVsControl,
      )
    ) {
      promotionIssues.push('compiler-call-amplification-exceeds-control');
    }
  }
  const browserClasses = new Set(
    aggregated.browserRuns
      .filter((run) => run?.completed === true && run?.withinBudget === true)
      .map((run) => run.deviceClass),
  );
  for (const deviceClass of promotion.requiredBrowserDeviceClasses || []) {
    if (!browserClasses.has(deviceClass)) promotionIssues.push(`missing-browser-device:${deviceClass}`);
  }
  const qualityComparisonReports = aggregated.qualityComparisons.map(({ comparison, verification }) => {
    const report = analyzeModelComparison(comparison, {
      bootstrapSamples: 1000,
      verifiedScorecardSha256s: verification.verifiedScorecardSha256s,
    });
    report.issues = [...verification.issues, ...report.issues];
    if (verification.issues.length) report.status = 'invalid';
    return report;
  });
  const qualifyingQualityComparison = qualityComparisonReports.find((report) => {
    const caseRows = Object.values(report.absoluteScoreEffect?.byCase || {});
    const burdenUpper = report.operations?.candidateMinusControlCompilerBurden?.scionCalls?.interval95?.[1];
    const singleModelJudge = report.singleModelJudgePreference || {};
    const qualifiedHumanPreference = report.qualifiedPairwisePreference || {};
    const preferenceGatePasses =
      promotion.qualityPreferenceMode === 'single-model-judge'
        ? report.status === 'model-judged-for-declared-scope' &&
          report.primaryPreferenceEvidence === 'single-model-judge' &&
          report.scoreEvidenceTiers.length === 1 &&
          report.scoreEvidenceTiers[0] === 'model-judge:model-provisional' &&
          singleModelJudge.usableForPrimaryClaim === true &&
          singleModelJudge.stableTrialCount >= promotion.minimumStableModelJudgeTrials &&
          singleModelJudge.completeCases >= promotion.minimumQualityComparisonCases &&
          report.minimumTrialsPerCase >= promotion.minimumQualityTrialsPerCase &&
          singleModelJudge.requiredPassesPerTrial >= promotion.minimumModelJudgePassesPerTrial &&
          (!promotion.requireBothModelJudgeOrders ||
            (singleModelJudge.requiredOrders?.includes('A/B') && singleModelJudge.requiredOrders?.includes('B/A'))) &&
          singleModelJudge.judgeIdentityCount === 1 &&
          singleModelJudge.positionSensitiveOrIncompleteTrials?.length === 0 &&
          Number.isFinite(singleModelJudge.wilson95?.[0]) &&
          singleModelJudge.wilson95[0] > promotion.minimumWilsonWinLowerBound
        : report.status === 'measured-for-declared-scope' &&
          report.primaryPreferenceEvidence === 'qualified-human' &&
          report.scoreEvidenceTiers.length === 1 &&
          report.scoreEvidenceTiers[0] === 'human-qualified:independently-validated' &&
          qualifiedHumanPreference.completeTrials >= promotion.minimumBlindCases &&
          qualifiedHumanPreference.requiredPerTrial >= promotion.minimumIndependentReviewsPerCase &&
          Number.isFinite(qualifiedHumanPreference.wilson95?.[0]) &&
          qualifiedHumanPreference.wilson95[0] > promotion.minimumWilsonWinLowerBound;
    return (
      preferenceGatePasses &&
      report.candidateId === candidate.id &&
      report.controlId === registry.controlCandidateId &&
      report.declaredCaseCount >= promotion.minimumQualityComparisonCases &&
      Number(report.splitCounts?.heldout || 0) === report.trialCount &&
      caseRows.length >= promotion.minimumQualityComparisonCases &&
      caseRows.every(
        (row) =>
          row.count >= promotion.minimumQualityTrialsPerCase &&
          Number.isFinite(row.meanDeltaInterval95?.[0]) &&
          row.meanDeltaInterval95[0] > promotion.minimumQualityDeltaLowerBound,
      ) &&
      Number.isFinite(burdenUpper) &&
      burdenUpper < promotion.maximumCompilerBurdenDeltaUpperBound
    );
  });
  if (!qualifyingQualityComparison) promotionIssues.push('missing-honest-quality-benchmark-win');

  return {
    candidateId: candidate.id,
    label: candidate.label,
    servingModelId: candidate.servingModelId,
    role: candidate.role,
    availability: candidate.availability,
    evidenceFiles: evidenceRows.length,
    factualRuns: {
      cold: coldRuns.length,
      grounded: groundedRuns.length,
      coldScores: coldRuns.map((run) => run.report?.correct).filter(Number.isInteger),
      groundedScores: groundedRuns.map((run) => run.report?.correct).filter(Number.isInteger),
      medianDurationMs: median(runs.map((run) => Number(run.durationMs))),
      retainedFailedSessions: sessions.filter((session) => session.issues.length > 0).length,
    },
    screeningStatus,
    screeningIssues: [...new Set(screeningIssues)],
    promotionStatus: promotionIssues.length === 0 ? 'passed' : 'not-ready',
    promotionIssues: [...new Set(promotionIssues)],
    promotionEvidence: {
      validFullCourses: validCourses.length,
      fullCourseDomains: [...new Set(validCourses.map((course) => course.domain).filter(Boolean))].sort(),
      validFullCourseDetails: validCourses.map((course) => ({
        domain: course.domain,
        scionPassCalls: Number(course.scionPassCalls) || 0,
        callsPerLesson:
          Number(course.lessonCount) > 0
            ? Number(((Number(course.scionPassCalls) || 0) / Number(course.lessonCount)).toFixed(2))
            : null,
        rejectedQualityActions: Number(course?.compilerBurden?.scion?.byAction?.rejected) || 0,
        sourceArtifact: course.sourceArtifact || '',
      })),
      matchedControlComparisons,
      browserDeviceClasses: [...browserClasses].sort(),
      legacyBlindComparisonCount: aggregated.blindComparisons.length,
      qualityComparisonReports,
      qualifyingQualityComparison: qualifyingQualityComparison || null,
    },
  };
}

export function buildScionModelBakeoffReport(registry, evidenceByCandidate = {}) {
  const evaluations = [];
  const control = registry.candidates.find((candidate) => candidate.id === registry.controlCandidateId);
  const controlEvaluation = evaluateScionModelCandidate(control, evidenceByCandidate[control.id] || [], registry);
  evaluations.push(controlEvaluation);
  for (const candidate of registry.candidates.filter((entry) => entry.id !== control.id)) {
    evaluations.push(
      evaluateScionModelCandidate(candidate, evidenceByCandidate[candidate.id] || [], registry, controlEvaluation),
    );
  }
  const promoted = evaluations.filter((entry) => entry.promotionStatus === 'passed');
  return {
    schemaVersion: 1,
    protocolVersion: registry.protocolVersion,
    generatedAt: new Date().toISOString(),
    controlCandidateId: registry.controlCandidateId,
    claimBoundary: registry.claimBoundary,
    status: promoted.length > 0 ? 'promotion-candidate-found' : 'no-model-promoted',
    promotedCandidateIds: promoted.map((entry) => entry.candidateId),
    evaluations,
  };
}

function renderMarkdown(report) {
  const rows = report.evaluations.map(
    (entry) =>
      `| ${entry.label} | ${entry.factualRuns.coldScores.join(', ') || '—'} | ${entry.factualRuns.groundedScores.join(', ') || '—'} | ${entry.screeningStatus} | ${entry.promotionStatus} |`,
  );
  return [
    '# Scion model bake-off',
    '',
    `Status: ${report.status}`,
    '',
    `> ${report.claimBoundary}`,
    '',
    '| Candidate | Cold factual runs | Grounded factual runs | Screening | Promotion |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...report.evaluations.flatMap((entry) => [
      `## ${entry.label}`,
      '',
      `- Screening: ${entry.screeningStatus}${entry.screeningIssues.length ? ` — ${entry.screeningIssues.join(', ')}` : ''}`,
      `- Promotion: ${entry.promotionStatus}${entry.promotionIssues.length ? ` — ${entry.promotionIssues.join(', ')}` : ''}`,
      `- Evidence files: ${entry.evidenceFiles}`,
      ...(entry.promotionEvidence.validFullCourseDetails || []).map(
        (course) =>
          `- ${course.domain}: ${course.scionPassCalls} Scion calls (${course.callsPerLesson ?? '—'}/lesson), ${course.rejectedQualityActions} rejected quality actions`,
      ),
      '',
    ]),
  ].join('\n');
}

async function readEvidence(evidenceDir, registry) {
  const byCandidate = Object.fromEntries(registry.candidates.map((candidate) => [candidate.id, []]));
  for (const candidate of registry.candidates) {
    const candidateDir = path.join(evidenceDir, candidate.id);
    let files = [];
    try {
      files = (await fs.readdir(candidateDir)).filter((file) => file.endsWith('.json')).sort();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    for (const file of files) {
      const evidencePath = path.join(candidateDir, file);
      const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
      if (Array.isArray(evidence.qualityComparisons)) {
        evidence.__qualityComparisonVerifications = [];
        for (const comparison of evidence.qualityComparisons) {
          evidence.__qualityComparisonVerifications.push(
            await verifyComparisonScorecards(comparison, { baseDir: path.dirname(evidencePath) }),
          );
        }
      }
      byCandidate[candidate.id].push(evidence);
    }
  }
  return byCandidate;
}

async function runLiveFactualScreening({
  candidate,
  registry,
  endpoint,
  model,
  manifestPath,
  runs,
  batchSize,
  apiKey,
}) {
  if (model !== candidate.servingModelId) {
    throw new Error(
      `Refusing incomparable run: candidate ${candidate.id} requires exact model ${candidate.servingModelId}, received ${model}.`,
    );
  }
  const packet = await loadFactualCanaryPacket(manifestPath);
  const packetHash = sha256(JSON.stringify(packet));
  const factualRuns = [];
  for (let ordinal = 1; ordinal <= runs; ordinal += 1) {
    for (const grounded of [false, true]) {
      const mode = grounded ? 'source-grounded' : 'cold';
      const started = performance.now();
      try {
        const response = await queryFactualCanaryEndpoint(packet, {
          endpoint,
          model,
          apiKey,
          batchSize,
          grounded,
        });
        factualRuns.push({
          id: `${mode}-${ordinal}`,
          mode,
          durationMs: Math.round(performance.now() - started),
          report: scoreFactualCanaries(packet, response.answers, { label: candidate.id, mode }),
          rawAnswers: response.rawAnswers,
        });
      } catch (error) {
        factualRuns.push({
          id: `${mode}-${ordinal}`,
          mode,
          durationMs: Math.round(performance.now() - started),
          error: String(error?.message || error),
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    protocolVersion: registry.protocolVersion,
    candidateId: candidate.id,
    servingModelId: model,
    canaryPacketSha256: packetHash,
    observedAt: new Date().toISOString(),
    endpointClass: /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(endpoint) ? 'local' : 'remote',
    runs: factualRuns,
  };
}

export async function importCrucibleFullCourseEvidence({ roundDir, candidate, registry }) {
  const names = await fs.readdir(roundDir);
  const portableRoundDir = path.posix.join('verification-output/crucible', path.basename(roundDir));
  const fullCourses = [];
  for (const name of names.sort()) {
    const courseDir = path.join(roundDir, name);
    let course;
    try {
      course = JSON.parse(await fs.readFile(path.join(courseDir, 'course.json'), 'utf8'));
    } catch {
      continue;
    }
    if (course?.provider !== 'local') throw new Error(`${name} is not a real Local-provider run.`);
    if (course?.localModel?.sourceModelId !== candidate.servingModelId) {
      throw new Error(
        `${name} source weights do not match ${candidate.id}: expected ${candidate.servingModelId}, received ${course?.localModel?.sourceModelId || 'missing'}.`,
      );
    }
    const [report, digest, manifest, zipStat, consoleText] = await Promise.all([
      fs.readFile(path.join(courseDir, 'report.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(courseDir, 'digest.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(courseDir, 'extracted', 'PACKAGE_MANIFEST.json'), 'utf8').then(JSON.parse),
      fs
        .readdir(courseDir)
        .then((files) => files.find((file) => file.endsWith('.zip')))
        .then((file) => (file ? fs.stat(path.join(courseDir, file)) : null)),
      fs.readFile(path.join(courseDir, 'console.log'), 'utf8').catch(() => ''),
    ]);
    const taskRows = Array.isArray(digest?.cost?.byTask) ? digest.cost.byTask : [];
    const task = (id) => taskRows.find((entry) => entry.task === id) || {};
    const quality = manifest?.quality || {};
    const compilerBurden = summarizeScionCompilerBurden(parseScionConsoleEvents(consoleText), {
      lessonCount: Number(course.lessonCount) || 0,
    });
    if (!compilerBurden.scion.calls) {
      compilerBurden.scion.calls = Number(task('scionPass').calls) || 0;
      compilerBurden.scion.callsPerLesson = Number(course.lessonCount)
        ? Number((compilerBurden.scion.calls / Number(course.lessonCount)).toFixed(2))
        : null;
      compilerBurden.scion.unattributedCalls = compilerBurden.scion.calls;
    }
    fullCourses.push({
      domain: String(course.baseId || course.id || name).replace(/--.*$/, ''),
      courseId: course.baseId || course.id || name,
      lessonCount: Number(course.lessonCount) || 0,
      packageGrade: Number(report?.normalized?.overall),
      packageLetterGrade: report?.normalized?.overallGrade || '',
      p0: Number(report?.normalized?.p0Count) || 0,
      p1: Number(report?.normalized?.p1Count) || 0,
      p2: Number(quality?.findingCounts?.p2) || 0,
      packageValid:
        report?.run?.status === 'passed' &&
        Number(report?.normalized?.overall) === Number(quality?.score) &&
        zipStat?.size > 10_000 &&
        manifest?.readiness?.status === 'ready',
      durationMs: Number(report?.run?.durationMs) || null,
      extractedFiles: Array.isArray(manifest?.files) ? manifest.files.length + 2 : null,
      scionPassCalls: Number(task('scionPass').calls) || 0,
      blueprintEnrichmentCalls: Number(task('blueprintEnrichment').calls) || 0,
      totalInputTokens: Number(digest?.cost?.inputTokens) || 0,
      totalOutputTokens: Number(digest?.cost?.outputTokens) || 0,
      readinessBlockers: Number(manifest?.readiness?.blockers) || 0,
      readinessWarnings: Number(manifest?.readiness?.warnings) || 0,
      compilerBurden,
      baseRevision: course?.localModel?.sourceRevision || null,
      adapterActive: course?.localModel?.adapterActive === true,
      adapterId: course?.localModel?.adapterId || null,
      adapterManifestSha256: course?.localModel?.adapterManifestSha256 || null,
      sourceArtifact: path.posix.join(portableRoundDir, name),
    });
  }
  if (fullCourses.length === 0) throw new Error(`No Crucible course artifacts found in ${roundDir}.`);
  return {
    schemaVersion: 1,
    protocolVersion: registry.protocolVersion,
    candidateId: candidate.id,
    servingModelId: candidate.servingModelId,
    evidenceType: 'crucible-full-course',
    observedAt: new Date().toISOString(),
    roundDir: portableRoundDir,
    fullCourses,
  };
}

function parseArgs(argv) {
  const args = {
    registryPath: DEFAULT_REGISTRY,
    manifestPath: DEFAULT_MANIFEST,
    outputDir: DEFAULT_OUTPUT,
    evidenceDir: '',
    candidateId: '',
    endpoint: '',
    model: '',
    runs: 2,
    batchSize: 1,
    apiKeyEnv: 'OPENAI_API_KEY',
    list: false,
    requireScreening: false,
    importCrucible: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--registry') args.registryPath = argv[++index] || args.registryPath;
    else if (arg === '--manifest') args.manifestPath = argv[++index] || args.manifestPath;
    else if (arg === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--evidence-dir') args.evidenceDir = argv[++index] || '';
    else if (arg === '--candidate') args.candidateId = argv[++index] || '';
    else if (arg === '--endpoint') args.endpoint = argv[++index] || '';
    else if (arg === '--model') args.model = argv[++index] || '';
    else if (arg === '--runs') args.runs = Math.max(1, Number(argv[++index]) || args.runs);
    else if (arg === '--batch-size') args.batchSize = Math.max(1, Number(argv[++index]) || args.batchSize);
    else if (arg === '--api-key-env') args.apiKeyEnv = argv[++index] || args.apiKeyEnv;
    else if (arg === '--list') args.list = true;
    else if (arg === '--require-screening') args.requireScreening = true;
    else if (arg === '--import-crucible') args.importCrucible = argv[++index] || '';
  }
  args.evidenceDir ||= DEFAULT_EVIDENCE;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(await fs.readFile(args.registryPath, 'utf8'));
  const registryIssues = validateScionModelRegistry(registry);
  if (registryIssues.length > 0) throw new Error(`Invalid Scion model registry: ${registryIssues.join(', ')}`);
  if (args.list) {
    for (const candidate of registry.candidates) {
      console.log(`${candidate.id}\t${candidate.availability}\t${candidate.servingModelId}`);
    }
    return;
  }
  let liveEvidence = null;
  if (args.endpoint && args.importCrucible) throw new Error('Use either --endpoint or --import-crucible, not both.');
  if (args.endpoint) {
    const candidate = registry.candidates.find((entry) => entry.id === args.candidateId);
    if (!candidate) throw new Error('A registered --candidate is required for a live bake-off run.');
    liveEvidence = await runLiveFactualScreening({
      candidate,
      registry,
      endpoint: args.endpoint,
      model: args.model || candidate.servingModelId,
      manifestPath: args.manifestPath,
      runs: args.runs,
      batchSize: args.batchSize,
      apiKey: process.env[args.apiKeyEnv] || '',
    });
    const candidateDir = path.join(args.evidenceDir, candidate.id);
    await fs.mkdir(candidateDir, { recursive: true });
    const stamp = liveEvidence.observedAt.replace(/[:.]/g, '-');
    await fs.writeFile(path.join(candidateDir, `${stamp}.json`), `${JSON.stringify(liveEvidence, null, 2)}\n`);
  }
  if (args.importCrucible) {
    const candidate = registry.candidates.find((entry) => entry.id === args.candidateId);
    if (!candidate) throw new Error('A registered --candidate is required for --import-crucible.');
    const imported = await importCrucibleFullCourseEvidence({
      roundDir: path.resolve(args.importCrucible),
      candidate,
      registry,
    });
    const candidateDir = path.join(args.evidenceDir, candidate.id);
    await fs.mkdir(candidateDir, { recursive: true });
    const stamp = imported.observedAt.replace(/[:.]/g, '-');
    await fs.writeFile(path.join(candidateDir, `${stamp}-full-course.json`), `${JSON.stringify(imported, null, 2)}\n`);
  }
  const evidenceByCandidate = await readEvidence(args.evidenceDir, registry);
  const report = buildScionModelBakeoffReport(registry, evidenceByCandidate);
  await fs.mkdir(args.outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(args.outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(args.outputDir, 'latest.md'), `${renderMarkdown(report)}\n`),
  ]);
  console.log(`Scion model bake-off: ${report.status}`);
  for (const evaluation of report.evaluations) {
    console.log(
      `${evaluation.candidateId}: screening=${evaluation.screeningStatus}, promotion=${evaluation.promotionStatus}`,
    );
  }
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (args.requireScreening && liveEvidence) {
    const evaluation = report.evaluations.find((entry) => entry.candidateId === liveEvidence.candidateId);
    if (evaluation?.screeningStatus !== 'passed') process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
