#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_MANIFEST = path.join(ROOT, 'evaluation', 'independent-benchmark', 'manifest.json');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'independent-benchmark');
const INSTRUCTOR_ROLES = new Set(['external-instructor', 'faculty', 'lecturer']);
const USABLE_VERDICTS = new Set(['as-is', 'minor-edits']);
const REVIEW_VERDICTS = new Set([...USABLE_VERDICTS, 'major-edits', 'cannot-use']);
const PLACEHOLDER_PATTERN = /replace|placeholder|yyyy|pseudonymous|tbd/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function average(values) {
  const rows = values.filter(Number.isFinite);
  return rows.length > 0 ? rows.reduce((sum, value) => sum + value, 0) / rows.length : 0;
}

function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (rows.length === 0) return 0;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 === 0 ? (rows[middle - 1] + rows[middle]) / 2 : rows[middle];
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function concreteText(value, minLength = 8) {
  const text = String(value || '').trim();
  return text.length >= minLength && !PLACEHOLDER_PATTERN.test(text);
}

export function evaluateInstructorReview(review, benchmarkCase, policy) {
  const findings = [];
  if (!review || typeof review !== 'object') findings.push('review is missing');
  if (!concreteText(review?.reviewerId, 3)) findings.push('reviewerId must be a concrete pseudonymous identifier');
  if (!INSTRUCTOR_ROLES.has(review?.reviewerRole)) findings.push('reviewerRole must identify a working instructor');
  if (review?.independent !== true) findings.push('review must be independent');
  if (review?.conflictOfInterest !== false) findings.push('conflictOfInterest must be explicitly false');
  if (
    !/^\d{4}-\d{2}-\d{2}/.test(String(review?.reviewedAt || '')) ||
    !Number.isFinite(Date.parse(review?.reviewedAt))
  ) {
    findings.push('reviewedAt must be a valid ISO date');
  }
  if (review?.caseId !== benchmarkCase.id) findings.push('caseId does not match the benchmark case');
  if (!concreteText(review?.reviewedPackageVersion, 3)) {
    findings.push('reviewedPackageVersion is required');
  } else if (benchmarkCase.package?.appVersion && review.reviewedPackageVersion !== benchmarkCase.package.appVersion) {
    findings.push('reviewedPackageVersion does not match the benchmark package version');
  }
  if (!REVIEW_VERDICTS.has(review?.minimalEditVerdict)) {
    findings.push('minimalEditVerdict must be as-is, minor-edits, major-edits, or cannot-use');
  }
  if (typeof review?.wouldTeach !== 'boolean') findings.push('wouldTeach must be explicitly true or false');
  if (['minor-edits', 'major-edits'].includes(review?.minimalEditVerdict)) {
    const hasConcreteRequiredEdit = (review?.requiredEdits || []).some(
      (edit) =>
        concreteText(edit?.artifact, 2) &&
        concreteText(edit?.location, 2) &&
        concreteText(edit?.change, 8) &&
        concreteText(edit?.reason, 8),
    );
    if (!hasConcreteRequiredEdit) findings.push('edit verdicts require at least one concrete required edit');
  }
  if (review?.minimalEditVerdict === 'cannot-use' && !concreteText(review?.notes, 20)) {
    findings.push('cannot-use verdicts require concrete notes');
  }
  const expectedPackageSha256 = benchmarkCase.package?.observedSha256 || benchmarkCase.package?.sha256 || '';
  if (!SHA256_PATTERN.test(String(review?.packageSha256 || ''))) {
    findings.push('packageSha256 must identify the reviewed package');
  } else if (expectedPackageSha256 && expectedPackageSha256 !== review.packageSha256) {
    findings.push('packageSha256 does not match the reviewed benchmark package');
  }
  const expectedSourceSha256 = benchmarkCase.source?.observedSha256 || benchmarkCase.source?.sha256 || '';
  if (!SHA256_PATTERN.test(String(review?.sourceSha256 || ''))) {
    findings.push('sourceSha256 must identify the reviewed source syllabus');
  } else if (expectedSourceSha256 && review.sourceSha256 !== expectedSourceSha256) {
    findings.push('sourceSha256 does not match the benchmark source');
  }

  const scores = {};
  for (const dimension of policy.dimensions) {
    const row = review?.dimensionScores?.[dimension];
    const score = Number(row?.score);
    scores[dimension] = score;
    if (!Number.isFinite(score) || score < 1 || score > 5) findings.push(`${dimension} score must be between 1 and 5`);
    if (!concreteText(row?.evidence, 20)) findings.push(`${dimension} requires concrete evidence`);
  }

  const estimatedEditMinutes = Number(review?.estimatedEditMinutes);
  if (!Number.isFinite(estimatedEditMinutes) || estimatedEditMinutes < 0) {
    findings.push('estimatedEditMinutes must be a non-negative number');
  }
  const editMinutesPerLesson =
    Number.isFinite(estimatedEditMinutes) && benchmarkCase.scope > 0
      ? estimatedEditMinutes / benchmarkCase.scope
      : Infinity;
  const meanScore = average(Object.values(scores));
  const minimumScore = Math.min(...Object.values(scores).filter(Number.isFinite));
  const usable =
    findings.length === 0 &&
    review.wouldTeach === true &&
    USABLE_VERDICTS.has(review.minimalEditVerdict) &&
    editMinutesPerLesson <= policy.maximumMedianEditMinutesPerLesson &&
    meanScore >= 4 &&
    minimumScore >= 3;

  return {
    reviewerId: review?.reviewerId || '',
    valid: findings.length === 0,
    usable,
    findings,
    meanScore: Number(meanScore.toFixed(2)),
    minimumScore: Number.isFinite(minimumScore) ? minimumScore : 0,
    editMinutesPerLesson: Number.isFinite(editMinutesPerLesson) ? Number(editMinutesPerLesson.toFixed(2)) : null,
    scores,
  };
}

export function evaluateBenchmarkCase(benchmarkCase, reviews, policy) {
  const evaluatedReviews = reviews.map((review) => evaluateInstructorReview(review, benchmarkCase, policy));
  const validReviews = evaluatedReviews.filter((review) => review.valid);
  const uniqueReviewers = new Set(validReviews.map((review) => review.reviewerId));
  const dimensionSpreads = Object.fromEntries(
    policy.dimensions.map((dimension) => {
      const scores = validReviews.map((review) => review.scores[dimension]).filter(Number.isFinite);
      return [dimension, scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : null];
    }),
  );
  const maxDimensionSpread = Math.max(0, ...Object.values(dimensionSpreads).filter(Number.isFinite));
  const packageReady =
    benchmarkCase.package?.available === true &&
    SHA256_PATTERN.test(String(benchmarkCase.package?.observedSha256 || '')) &&
    benchmarkCase.package?.hashMatches !== false;
  const sourceReady =
    benchmarkCase.source?.available === true &&
    SHA256_PATTERN.test(String(benchmarkCase.source?.observedSha256 || '')) &&
    benchmarkCase.source?.hashMatches !== false;
  const complete = packageReady && sourceReady && validReviews.length >= 2 && uniqueReviewers.size >= 2;
  const agreementPass = complete && maxDimensionSpread <= policy.maximumDimensionSpread;
  const usable = complete && agreementPass && validReviews.every((review) => review.usable);
  const editMinutes = validReviews.map((review) => review.editMinutesPerLesson).filter(Number.isFinite);

  return {
    caseId: benchmarkCase.id,
    title: benchmarkCase.title,
    scope: benchmarkCase.scope,
    modality: benchmarkCase.modality,
    intakeStatus: benchmarkCase.status,
    packageReady,
    sourceReady,
    reviewCount: reviews.length,
    validReviewCount: validReviews.length,
    uniqueReviewerCount: uniqueReviewers.size,
    complete,
    agreementPass,
    usable,
    maxDimensionSpread: Number(maxDimensionSpread.toFixed(2)),
    dimensionSpreads,
    medianEditMinutesPerLesson: Number(median(editMinutes).toFixed(2)),
    reviewFindings: evaluatedReviews.flatMap((review) =>
      review.findings.map((finding) => `${review.reviewerId}: ${finding}`),
    ),
  };
}

async function loadReviews(benchmarkCase, manifestDir) {
  const reviews = [];
  for (const reviewFile of benchmarkCase.reviewFiles || []) {
    const absolutePath = path.resolve(manifestDir, reviewFile);
    if (!(await fileExists(absolutePath))) continue;
    const parsed = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    reviews.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return reviews;
}

async function hydrateCase(benchmarkCase, manifestDir) {
  const packagePath = benchmarkCase.package?.path ? path.resolve(ROOT, benchmarkCase.package.path) : '';
  const packageAvailable = packagePath ? await fileExists(packagePath) : false;
  const observedPackageSha256 = packageAvailable ? await sha256File(packagePath) : '';
  const sourcePath = benchmarkCase.source?.path ? path.resolve(ROOT, benchmarkCase.source.path) : '';
  const sourceAvailable = sourcePath ? await fileExists(sourcePath) : false;
  const observedSourceSha256 = sourceAvailable ? await sha256File(sourcePath) : '';
  return {
    ...benchmarkCase,
    source: {
      ...benchmarkCase.source,
      available: sourceAvailable,
      observedSha256: observedSourceSha256,
      hashMatches:
        !benchmarkCase.source?.sha256 || !observedSourceSha256
          ? null
          : benchmarkCase.source.sha256 === observedSourceSha256,
    },
    package: {
      ...benchmarkCase.package,
      available: packageAvailable,
      observedSha256: observedPackageSha256,
      hashMatches:
        !benchmarkCase.package?.sha256 || !observedPackageSha256
          ? null
          : benchmarkCase.package.sha256 === observedPackageSha256,
    },
    reviews: await loadReviews(benchmarkCase, manifestDir),
  };
}

export function buildIndependentBenchmarkSummary(caseResults, policy) {
  const completed = caseResults.filter((row) => row.complete);
  const usable = completed.filter((row) => row.usable);
  const modalities = [...new Set(completed.map((row) => row.modality))];
  const scopes = [...new Set(completed.map((row) => row.scope))].sort((a, b) => a - b);
  const missingScopes = policy.requiredScopes.filter((scope) => !scopes.includes(scope));
  const usableRate = completed.length > 0 ? usable.length / completed.length : 0;
  const medianEditMinutesPerLesson = median(completed.map((row) => row.medianEditMinutesPerLesson));
  const evidenceComplete =
    completed.length >= policy.minimumCompletedCases &&
    modalities.length >= policy.minimumModalities &&
    missingScopes.length === 0;
  const qualityPass =
    usableRate >= policy.minimumUsableRate && medianEditMinutesPerLesson <= policy.maximumMedianEditMinutesPerLesson;
  return {
    status: evidenceComplete ? (qualityPass ? 'pass' : 'fail') : 'unverified',
    targetCases: policy.targetCases,
    rosterCases: caseResults.length,
    completedCases: completed.length,
    usableCases: usable.length,
    usableRate: Number(usableRate.toFixed(3)),
    modalities,
    scopes,
    missingScopes,
    medianEditMinutesPerLesson: Number(medianEditMinutesPerLesson.toFixed(2)),
    evidenceComplete,
    qualityPass,
    primaryMetric: 'usable by an instructor with no more than minor edits',
    claimBoundary:
      'No independent classroom-quality claim is allowed until at least two independent instructor reviews complete each required case.',
  };
}

function renderMarkdown(report) {
  const rows = report.cases.map(
    (row) =>
      `| ${row.caseId} | ${row.scope} | ${row.modality} | ${row.intakeStatus} | ${row.sourceReady ? 'yes' : 'no'} | ${row.packageReady ? 'yes' : 'no'} | ${row.validReviewCount}/2 | ${row.complete ? 'yes' : 'no'} | ${row.agreementPass ? 'yes' : 'no'} | ${row.usable ? 'yes' : 'no'} | ${row.medianEditMinutesPerLesson} |`,
  );
  return [
    '# Independent Instructor Benchmark',
    '',
    `Generated: ${report.meta.generatedAt}`,
    `Mode: ${report.meta.mode}`,
    `Status: ${report.summary.status}`,
    '',
    `Primary metric: ${report.summary.primaryMetric}`,
    `Completed cases: ${report.summary.completedCases}/${report.summary.targetCases}`,
    `Usable cases: ${report.summary.usableCases}`,
    `Usable rate: ${(report.summary.usableRate * 100).toFixed(1)}%`,
    `Median edit minutes per lesson: ${report.summary.medianEditMinutesPerLesson}`,
    `Modalities: ${report.summary.modalities.join(', ') || 'none'}`,
    `Scopes: ${report.summary.scopes.join(', ') || 'none'}`,
    '',
    `> ${report.summary.claimBoundary}`,
    '',
    '| Case | Scope | Modality | Intake | Source | Package | Valid Reviews | Complete | Agreement | Usable | Median Edit Min/Lesson |',
    '| --- | ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |',
    ...rows,
    '',
    'Review forms are written to `verification-output/independent-benchmark/review-forms/`. Do not fill them with simulated or model-generated reviewer evidence.',
    '',
  ].join('\n');
}

async function writeReviewForms(cases, policy, outputDir) {
  const formsDir = path.join(outputDir, 'review-forms');
  await fs.mkdir(formsDir, { recursive: true });
  for (const benchmarkCase of cases) {
    const form = {
      schemaVersion: 1,
      rubricVersion: policy.rubricVersion,
      caseId: benchmarkCase.id,
      reviewerId: 'PSEUDONYMOUS_REVIEWER_ID',
      reviewerRole: 'external-instructor',
      independent: true,
      conflictOfInterest: false,
      reviewedAt: 'YYYY-MM-DD',
      reviewedPackageVersion: benchmarkCase.package?.appVersion || '',
      sourceSha256: benchmarkCase.source?.observedSha256 || benchmarkCase.source?.sha256 || '',
      packageSha256: benchmarkCase.package?.observedSha256 || benchmarkCase.package?.sha256 || '',
      wouldTeach: false,
      minimalEditVerdict: 'major-edits',
      estimatedEditMinutes: 0,
      dimensionScores: Object.fromEntries(
        policy.dimensions.map((dimension) => [dimension, { score: 0, evidence: '' }]),
      ),
      requiredEdits: [{ artifact: '', location: '', change: '', reason: '' }],
      notes: '',
    };
    const formPath = path.join(formsDir, `${benchmarkCase.id}.review.template.json`);
    const serialized = `${JSON.stringify(form, null, 2)}\n`;
    const existing = await fs.readFile(formPath, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return '';
      throw error;
    });
    if (existing !== serialized) await fs.writeFile(formPath, serialized);
  }
}

export async function runIndependentBenchmarkAudit({
  manifestPath = DEFAULT_MANIFEST,
  outputDir = DEFAULT_OUTPUT_DIR,
  mode = 'advisory',
} = {}) {
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
  const policy = manifest;
  const hydratedCases = [];
  for (const benchmarkCase of manifest.cases || []) {
    hydratedCases.push(await hydrateCase(benchmarkCase, path.dirname(absoluteManifest)));
  }
  const cases = hydratedCases.map((benchmarkCase) =>
    evaluateBenchmarkCase(benchmarkCase, benchmarkCase.reviews, policy),
  );
  const report = {
    meta: { generatedAt: new Date().toISOString(), mode, rubricVersion: manifest.rubricVersion },
    summary: buildIndependentBenchmarkSummary(cases, policy),
    cases,
    intake: hydratedCases.map((benchmarkCase) => ({
      caseId: benchmarkCase.id,
      status: benchmarkCase.status,
      sourceAvailable: benchmarkCase.source.available,
      sourceHashMatches: benchmarkCase.source.hashMatches,
      packageAvailable: benchmarkCase.package.available,
      packageHashMatches: benchmarkCase.package.hashMatches,
      reviewFiles: benchmarkCase.reviewFiles || [],
    })),
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
  await writeReviewForms(hydratedCases, policy, outputDir);
  return report;
}

function parseArgs(argv) {
  const args = { manifestPath: DEFAULT_MANIFEST, outputDir: DEFAULT_OUTPUT_DIR, mode: 'advisory' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifestPath = path.resolve(argv[++index] || args.manifestPath);
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--mode') args.mode = argv[++index] || args.mode;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  if (!['advisory', 'strict'].includes(args.mode)) throw new Error('Expected --mode advisory|strict');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/independentBenchmarkAudit.mjs [--mode advisory|strict] [--manifest FILE]');
    return;
  }
  const report = await runIndependentBenchmarkAudit(args);
  console.log(`Independent instructor benchmark: ${report.summary.status}`);
  console.log(`Completed cases: ${report.summary.completedCases}/${report.summary.targetCases}`);
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (args.mode === 'strict' && report.summary.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
