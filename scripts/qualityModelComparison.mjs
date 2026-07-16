#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

import { aggregateQualityReviews, analyzeModelComparison } from './lib/qualityBenchmark.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, 'verification-output', 'quality-model-comparison');

async function resolveBoundFile(baseDir, declaredPath, label = 'bound file') {
  const normalized = String(declaredPath || '')
    .trim()
    .replaceAll('\\', '/');
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${label} path must be a safe relative path`);
  }
  const [realBase, absolute] = await Promise.all([
    fs.realpath(path.resolve(baseDir)),
    Promise.resolve(path.resolve(baseDir, normalized)),
  ]);
  const stats = await fs.lstat(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  const realScorecard = await fs.realpath(absolute);
  const relative = path.relative(realBase, realScorecard);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes its comparison directory`);
  }
  return absolute;
}

function expectedPresentedLabel(trial, side, order) {
  const initial = side === 'candidate' ? trial?.randomization?.candidateLabel : trial?.randomization?.controlLabel;
  if (!['A', 'B'].includes(initial)) return null;
  return order === 'B/A' ? (initial === 'A' ? 'B' : 'A') : initial;
}

function scorecardDimensionMap(scorecard) {
  return Object.fromEntries((scorecard?.dimensions || []).map((dimension) => [dimension.id, Number(dimension.score)]));
}

function benchmarkCaseForTrial(trial) {
  return {
    id: trial.caseId,
    split: trial.split,
    source: { sha256: trial.sourceSha256, verified: true },
    exportVerified: true,
  };
}

async function readBoundJson(baseDir, declaredPath, expectedSha256, label) {
  const absolute = await resolveBoundFile(baseDir, declaredPath, label);
  const bytes = await fs.readFile(absolute);
  const observedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (observedSha256 !== expectedSha256) throw new Error(`${label} hash mismatch`);
  return { absolute, observedSha256, value: JSON.parse(bytes.toString('utf8')) };
}

async function verifyRecomputableModelJudgeScore({
  trial,
  side,
  output,
  scorecard,
  baseDir,
  rubric,
  verifiedScorecardSha256s,
}) {
  if (!rubric) throw new Error('canonical rubric is required for recomputable model-judge evidence');
  const evidence = output.scoreEvidence;
  const aggregationBootstrapSamples = Number(evidence.aggregationBootstrapSamples);
  if (!Number.isInteger(aggregationBootstrapSamples) || aggregationBootstrapSamples < 100) {
    throw new Error('aggregationBootstrapSamples must be an integer of at least 100');
  }
  const bundle = await readBoundJson(baseDir, evidence.reviewBundlePath, evidence.reviewBundleSha256, 'review bundle');
  if (!Array.isArray(bundle.value) || bundle.value.length !== 2) {
    throw new Error('review bundle must contain exactly two order-specific reviews');
  }
  const passes = Array.isArray(evidence.passScorecards) ? evidence.passScorecards : [];
  if (passes.length !== 2 || new Set(passes.map((row) => row?.order)).size !== 2) {
    throw new Error('passScorecards must contain exactly one A/B and one B/A scorecard');
  }
  const expectedOrders = new Set(['A/B', 'B/A']);
  const usedReviewIndexes = new Set();
  for (const pass of passes) {
    if (!expectedOrders.has(pass?.order)) throw new Error('passScorecards order must be A/B or B/A');
    if (!Number.isInteger(pass?.reviewIndex) || pass.reviewIndex < 0 || pass.reviewIndex >= bundle.value.length) {
      throw new Error('passScorecards reviewIndex must select one bound review');
    }
    if (usedReviewIndexes.has(pass.reviewIndex)) throw new Error('passScorecards cannot reuse one review');
    usedReviewIndexes.add(pass.reviewIndex);
    const review = bundle.value[pass.reviewIndex];
    const expectedLabel = expectedPresentedLabel(trial, side, pass.order);
    if (
      pass.presentedLabel !== expectedLabel ||
      pass.sessionId !== pass.reviewerId ||
      review?.evaluator?.id !== pass.sessionId ||
      review?.reviewedAt !== pass.scoredAt ||
      !Number.isFinite(Date.parse(pass.scoredAt)) ||
      review?.evaluator?.model !== evidence.model ||
      review?.evaluator?.modelRevision !== evidence.modelRevision ||
      review?.evaluator?.promptSha256 !== evidence.promptSha256 ||
      review?.caseId !== trial.caseId ||
      review?.artifactType !== 'package' ||
      review?.sourceSha256 !== trial.sourceSha256 ||
      review?.artifactSha256 !== output.outputSha256
    ) {
      throw new Error(`${pass.order} review identity, side, source, artifact, or judge provenance mismatch`);
    }
    const boundPassScorecard = await readBoundJson(
      baseDir,
      pass.scorecardPath,
      pass.scorecardSha256,
      `${pass.order} scorecard`,
    );
    const recomputed = aggregateQualityReviews([review], rubric, {
      benchmarkCase: benchmarkCaseForTrial(trial),
      bootstrapSamples: aggregationBootstrapSamples,
    });
    if (!isDeepStrictEqual(boundPassScorecard.value, recomputed)) {
      throw new Error(`${pass.order} scorecard cannot be reproduced from its bound review`);
    }
    const recomputedDimensions = scorecardDimensionMap(recomputed);
    if (
      Number(pass.reportedScore) !== Number(recomputed.scores?.reportedScore) ||
      !isDeepStrictEqual(pass.dimensionScores, recomputedDimensions)
    ) {
      throw new Error(`${pass.order} declared score does not match its recomputed scorecard`);
    }
    verifiedScorecardSha256s.add(boundPassScorecard.observedSha256);
  }
  const recomputedAggregate = aggregateQualityReviews(bundle.value, rubric, {
    benchmarkCase: benchmarkCaseForTrial(trial),
    bootstrapSamples: aggregationBootstrapSamples,
  });
  if (!isDeepStrictEqual(scorecard, recomputedAggregate)) {
    throw new Error('aggregate scorecard cannot be reproduced from both bound order-specific reviews');
  }
}

export async function verifyComparisonScorecards(
  comparison,
  { baseDir = ROOT, rubric = null, requireRecomputableModelJudgeEvidence = false } = {},
) {
  const verifiedScorecardSha256s = new Set();
  const issues = [];
  for (const trial of comparison?.trials || []) {
    for (const side of ['candidate', 'control']) {
      const output = trial.outputs?.[side];
      if (!Number.isFinite(Number(output?.benchmarkScore))) continue;
      const evidence = output?.scoreEvidence;
      const prefix = `${trial.caseId || '<case>'}/trial-${trial.trialIndex ?? '?'}/${side}`;
      try {
        const absolute = await resolveBoundFile(baseDir, evidence?.scorecardPath, 'scorecard');
        const bytes = await fs.readFile(absolute);
        const observedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        if (observedSha256 !== evidence?.scorecardSha256) {
          issues.push(`${prefix} scorecard hash mismatch`);
          continue;
        }
        const scorecard = JSON.parse(bytes.toString('utf8'));
        const dimensionScores = Object.fromEntries(
          (scorecard.dimensions || []).map((dimension) => [dimension.id, Number(dimension.score)]),
        );
        const modelJudgeIdentityMatches =
          evidence.evidenceClass !== 'model-judge' ||
          (scorecard.validation?.modelJudgeIdentity?.model === evidence.model &&
            scorecard.validation?.modelJudgeIdentity?.modelRevision === evidence.modelRevision &&
            scorecard.validation?.modelJudgeIdentity?.promptSha256 === evidence.promptSha256);
        const dimensionsMatch = Object.entries(output.dimensionScores || {}).every(
          ([id, score]) => Number(score) === dimensionScores[id],
        );
        const identityMatches =
          scorecard.rubricVersion === evidence.rubricVersion &&
          scorecard.caseId === trial.caseId &&
          scorecard.sourceSha256 === evidence.sourceSha256 &&
          scorecard.artifactSha256 === evidence.artifactSha256 &&
          scorecard.artifactSha256 === output.outputSha256 &&
          scorecard.validation?.selectedEvidenceClass === evidence.evidenceClass &&
          scorecard.validation?.tier === evidence.validationTier &&
          Number(scorecard.scores?.reportedScore) === Number(output.benchmarkScore) &&
          modelJudgeIdentityMatches &&
          dimensionsMatch &&
          (scorecard.reviewValidationIssues || []).length === 0;
        if (!identityMatches) {
          issues.push(
            `${prefix} scorecard content does not match the declared score, dimensions, artifact, or evidence tier`,
          );
          continue;
        }
        if (requireRecomputableModelJudgeEvidence && evidence.evidenceClass === 'model-judge') {
          await verifyRecomputableModelJudgeScore({
            trial,
            side,
            output,
            scorecard,
            baseDir,
            rubric,
            verifiedScorecardSha256s,
          });
        }
        verifiedScorecardSha256s.add(observedSha256);
      } catch (error) {
        issues.push(`${prefix} scorecard cannot be verified: ${error.message}`);
      }
    }
  }
  return { verifiedScorecardSha256s: [...verifiedScorecardSha256s], issues };
}

function renderMarkdown(report) {
  const mean = report.absoluteScoreEffect.candidateMinusControlMean;
  const med = report.absoluteScoreEffect.candidateMinusControlMedian;
  const preference = report.qualifiedPairwisePreference;
  const modelPreference = report.singleModelJudgePreference;
  const operationRows = ['candidate', 'control'].map((side) => {
    const row = report.operations[side];
    return `| ${side} | ${row.successes}/${row.attempts} | ${row.meanLatencyMs ?? '—'} | ${row.totalCostUsd ?? '—'} | ${row.meanProviderCalls ?? '—'} |`;
  });
  return [
    '# CourseMapper Controlled Model Comparison',
    '',
    `Comparison: ${report.comparisonId}`,
    `Status: **${report.status}**`,
    `Trials: ${report.trialCount}`,
    `Declared cases: ${report.declaredCaseCount}`,
    `Score evidence tiers: ${report.scoreEvidenceTiers.join(', ') || 'none'}`,
    '',
    `> ${report.claimBoundary}`,
    '',
    '## Matched absolute-score effect',
    '',
    `Candidate − control mean: ${mean.estimate ?? '—'} (paired bootstrap 95% interval ${mean.interval95[0] ?? '—'} to ${mean.interval95[1] ?? '—'}; n=${report.absoluteScoreEffect.pairedTrialCount})`,
    `Candidate − control median: ${med.estimate ?? '—'} (paired bootstrap 95% interval ${med.interval95[0] ?? '—'} to ${med.interval95[1] ?? '—'})`,
    '',
    '## Blinded qualified-instructor preference',
    '',
    `Wins / losses / ties: ${preference.wins} / ${preference.losses} / ${preference.ties}`,
    `Effective win rate (tie = 0.5): ${preference.effectiveWinRate ?? '—'}`,
    `Wilson 95% interval: ${preference.wilson95[0] ?? '—'} to ${preference.wilson95[1] ?? '—'}`,
    `Unique qualified reviewers: ${preference.uniqueReviewers}`,
    `Fully reviewed trials: ${preference.completeTrials}/${report.trialCount} (minimum ${preference.requiredPerTrial ?? '—'} qualified reviewers each)`,
    '',
    '## Blinded single-model-judge preference',
    '',
    `Mode: ${report.primaryPreferenceEvidence === 'single-model-judge' ? 'primary for declared scope' : 'advisory only'}`,
    `Stable trial wins / losses / ties: ${modelPreference.wins} / ${modelPreference.losses} / ${modelPreference.ties}`,
    `Stable trials: ${modelPreference.stableTrialCount}/${report.trialCount}; consistency rate: ${modelPreference.consistencyRate ?? '—'}`,
    `Complete cases: ${modelPreference.completeCases}/${report.declaredCaseCount}`,
    `Effective win rate (tie = 0.5): ${modelPreference.effectiveWinRate ?? '—'}`,
    `Wilson 95% interval over stable trial outcomes: ${modelPreference.wilson95[0] ?? '—'} to ${modelPreference.wilson95[1] ?? '—'}`,
    `Judge: ${modelPreference.judgeIdentity ? `${modelPreference.judgeIdentity.model} @ ${modelPreference.judgeIdentity.modelRevision}; prompt ${modelPreference.judgeIdentity.promptSha256}` : 'not uniquely bound'}`,
    `Isolated judge sessions: ${modelPreference.judgeSessionCount}; A/B ${modelPreference.sessionsByOrder?.['A/B']?.join(', ') || 'none'}; B/A ${modelPreference.sessionsByOrder?.['B/A']?.join(', ') || 'none'}`,
    `Passes: ${modelPreference.passCount}; required per trial: ${modelPreference.requiredPassesPerTrial}; required orders: ${modelPreference.requiredOrders.join(', ')}`,
    `Position-sensitive or incomplete trials: ${modelPreference.positionSensitiveOrIncompleteTrials.map((row) => `${row.caseId}/trial-${row.trialIndex} (${row.reason})`).join(', ') || 'none'}`,
    `Usable for declared single-model primary claim: ${modelPreference.usableForPrimaryClaim ? 'yes' : 'no'}`,
    `Order-specific score coverage: ${report.scoreOrderEffect.trialCount}/${report.trialCount} trials`,
    `Mean absolute score shift after reversal: candidate ${report.scoreOrderEffect.candidateMeanAbsoluteShift ?? '—'}; control ${report.scoreOrderEffect.controlMeanAbsoluteShift ?? '—'}`,
    `Mean candidate−control delta shift after reversal: ${report.scoreOrderEffect.candidateMinusControlMeanDeltaShift ?? '—'}; maximum absolute shift ${report.scoreOrderEffect.maximumAbsoluteDeltaShift ?? '—'}`,
    '',
    '## Operations',
    '',
    '| Side | Successful trials | Mean attempt latency ms | Total attempt cost USD | Mean provider calls |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...operationRows,
    '',
    '## Matched speed and compiler burden',
    '',
    `Candidate − control mean latency ms: ${report.operations.candidateMinusControlLatencyMs.estimate ?? '—'} (paired bootstrap 95% interval ${report.operations.candidateMinusControlLatencyMs.interval95[0] ?? '—'} to ${report.operations.candidateMinusControlLatencyMs.interval95[1] ?? '—'})`,
    ...Object.entries(report.operations.candidateMinusControlCompilerBurden).map(
      ([field, row]) =>
        `Candidate − control ${field}: ${row.estimate ?? '—'} (paired bootstrap 95% interval ${row.interval95[0] ?? '—'} to ${row.interval95[1] ?? '—'})`,
    ),
    '',
    '## Advisory model judge',
    '',
    `Judgments: ${report.advisoryModelJudge.count}; usable for primary claim: no`,
    `Position-sensitive or incomplete cases: ${report.advisoryModelJudge.positionSensitiveOrIncompleteCases.join(', ') || 'none recorded'}`,
    '',
    ...(report.issues.length
      ? ['## Invalid or missing evidence', '', ...report.issues.map((issue) => `- ${issue}`), '']
      : []),
  ].join('\n');
}

export async function runQualityModelComparison({
  inputPath,
  outputDir = DEFAULT_OUTPUT,
  bootstrapSamples = 5000,
} = {}) {
  if (!inputPath) throw new Error('--input is required');
  const comparison = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'));
  const singleModelJudge = comparison?.preregistration?.primaryPreferenceEvidence === 'single-model-judge';
  const rubric = singleModelJudge
    ? JSON.parse(await fs.readFile(path.join(ROOT, 'evaluation', 'quality-benchmark', 'v1', 'rubric.json'), 'utf8'))
    : null;
  const verification = await verifyComparisonScorecards(comparison, {
    baseDir: path.dirname(path.resolve(inputPath)),
    rubric,
    requireRecomputableModelJudgeEvidence: singleModelJudge,
  });
  const report = analyzeModelComparison(comparison, {
    bootstrapSamples,
    verifiedScorecardSha256s: verification.verifiedScorecardSha256s,
  });
  report.issues = [...verification.issues, ...report.issues];
  if (verification.issues.length) report.status = 'invalid';
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
  return report;
}

function parseArgs(argv) {
  const args = { inputPath: '', outputDir: DEFAULT_OUTPUT, bootstrapSamples: 5000 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') args.inputPath = path.resolve(argv[++index] || '');
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--bootstrap-samples') args.bootstrapSamples = Number(argv[++index] || args.bootstrapSamples);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.bootstrapSamples) || args.bootstrapSamples < 100)
    throw new Error('--bootstrap-samples must be an integer of at least 100');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/qualityModelComparison.mjs --input comparison.json [--bootstrap-samples 5000]');
    return;
  }
  const report = await runQualityModelComparison(args);
  console.log(`Model comparison: ${report.status}`);
  console.log(
    `Trials: ${report.trialCount}; qualified preferences: ${report.qualifiedPairwisePreference.count}; model-judge passes: ${report.singleModelJudgePreference.passCount}`,
  );
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (!['measured-for-declared-scope', 'model-judged-for-declared-scope'].includes(report.status)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
