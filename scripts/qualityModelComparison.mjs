#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { analyzeModelComparison } from './lib/qualityBenchmark.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, 'verification-output', 'quality-model-comparison');

async function resolveBoundScorecard(baseDir, declaredPath) {
  const normalized = String(declaredPath || '')
    .trim()
    .replaceAll('\\', '/');
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('scorecardPath must be a safe relative path');
  }
  const [realBase, absolute] = await Promise.all([
    fs.realpath(path.resolve(baseDir)),
    Promise.resolve(path.resolve(baseDir, normalized)),
  ]);
  const stats = await fs.lstat(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('scorecard must be a regular non-symlink file');
  const realScorecard = await fs.realpath(absolute);
  const relative = path.relative(realBase, realScorecard);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('scorecardPath escapes its comparison directory');
  }
  return absolute;
}

export async function verifyComparisonScorecards(comparison, { baseDir = ROOT } = {}) {
  const verifiedScorecardSha256s = new Set();
  const issues = [];
  for (const trial of comparison?.trials || []) {
    for (const side of ['candidate', 'control']) {
      const output = trial.outputs?.[side];
      if (!Number.isFinite(Number(output?.benchmarkScore))) continue;
      const evidence = output?.scoreEvidence;
      const prefix = `${trial.caseId || '<case>'}/trial-${trial.trialIndex ?? '?'}/${side}`;
      try {
        const absolute = await resolveBoundScorecard(baseDir, evidence?.scorecardPath);
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
    `Passes: ${modelPreference.passCount}; required per trial: ${modelPreference.requiredPassesPerTrial}; required orders: ${modelPreference.requiredOrders.join(', ')}`,
    `Position-sensitive or incomplete trials: ${modelPreference.positionSensitiveOrIncompleteTrials.map((row) => `${row.caseId}/trial-${row.trialIndex} (${row.reason})`).join(', ') || 'none'}`,
    `Usable for declared single-model primary claim: ${modelPreference.usableForPrimaryClaim ? 'yes' : 'no'}`,
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
  const verification = await verifyComparisonScorecards(comparison, {
    baseDir: path.dirname(path.resolve(inputPath)),
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
