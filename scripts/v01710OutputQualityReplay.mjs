import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { renderedDeliverableContentRoot } from '../src/lib/renderedDeliverableRoot.js';
import { gradePackageAtFinalize } from '../src/lib/quality/finalizeQualityGate.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readProject(filePath) {
  const bytes = fs.readFileSync(filePath);
  const json = filePath.endsWith('.gz') ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  return { bytes, project: JSON.parse(json) };
}

function retainedFixture(project, sourceProjectSha256) {
  return {
    protocol: 'coursemapper-output-quality-replay-fixture-v1',
    sourceProjectSha256,
    courseMap: project.courseMap,
    courseGraph: project.courseGraph,
    deliverables: project.deliverables,
    selectedFeatures: project.selectedFeatures,
    columns: project.columns,
    slideTheme: project.slideTheme,
    deliverableConfig: project.deliverableConfig,
    promptText: project.promptText,
    lastRunDigest: project.lastRunDigest,
    apiCallBudgetReceipt: project.apiCallBudgetReceipt,
  };
}

function countText(node, needle) {
  if (typeof node === 'string') return node.split(needle).length - 1;
  if (Array.isArray(node)) return node.reduce((sum, item) => sum + countText(item, needle), 0);
  if (node && typeof node === 'object') {
    return Object.values(node).reduce((sum, item) => sum + countText(item, needle), 0);
  }
  return 0;
}

function renderedTextCount(deliverables, needle) {
  return Object.entries(deliverables || {}).reduce((sum, [featureId, entry]) => {
    if (entry?.status !== 'done') return sum;
    return sum + countText(renderedDeliverableContentRoot(featureId, entry.data), needle);
  }, 0);
}

function qualitySummary(quality) {
  return {
    status: quality.status,
    ...(quality.reason ? { reason: quality.reason } : {}),
    ...(quality.graderVersion ? { graderVersion: quality.graderVersion } : {}),
    score: quality.score,
    grade: quality.grade,
    findingCounts: quality.findingCounts,
    repetitionFindings: (quality.findings || [])
      .filter((finding) => /instructional phrase repeats/i.test(finding.detail || ''))
      .map(({ severity, file, detail, evidence }) => ({ severity, file, detail, evidence })),
  };
}

function canonicalPackageSnapshot(result) {
  return JSON.stringify({
    courseMap: result.courseMap,
    deliverables: result.deliverables,
  });
}

const inputPath = path.resolve(argument('--input'));
if (!argument('--input') || !fs.existsSync(inputPath)) {
  throw new Error(
    'Usage: npx vite-node scripts/v01710OutputQualityReplay.mjs --input <project.coursemapper|fixture.json.gz> [--retain <fixture.json.gz>] [--zip <package.zip>] [--output <receipt.json>]',
  );
}

const { bytes: inputBytes, project } = readProject(inputPath);
const inputSha256 = sha256(inputBytes);
const sourceProjectSha256 =
  project?.protocol === 'coursemapper-output-quality-replay-fixture-v1' ? project.sourceProjectSha256 : inputSha256;
const fixture = retainedFixture(project, sourceProjectSha256);
const fixtureJson = JSON.stringify(fixture);
const retainPath = argument('--retain');
if (retainPath) {
  const resolvedRetainPath = path.resolve(retainPath);
  fs.mkdirSync(path.dirname(resolvedRetainPath), { recursive: true });
  fs.writeFileSync(resolvedRetainPath, zlib.gzipSync(fixtureJson, { level: 9 }));
}

const needle = 'Cite the specific definition or fact that supports the';
const finalized = runDeterministicPackageFinalizer({
  courseMap: project.courseMap,
  courseGraph: project.courseGraph,
  sourceBrief: project.promptText,
  deliverables: project.deliverables,
  selectedFeatures: project.selectedFeatures,
  columns: project.columns,
  deliverableConfig: project.deliverableConfig,
  includeClassroomReadiness: false,
  includePedagogicalValidation: false,
  retryWarnings: false,
});
const replayOptions = {
  courseMap: finalized.courseMap,
  courseGraph: project.courseGraph,
  sourceBrief: project.promptText,
  deliverables: finalized.deliverables,
  selectedFeatures: project.selectedFeatures,
  columns: project.columns,
  deliverableConfig: project.deliverableConfig,
  includeClassroomReadiness: false,
  includePedagogicalValidation: false,
  retryWarnings: false,
};
const replayed = runDeterministicPackageFinalizer(replayOptions);
const finalizedSnapshot = canonicalPackageSnapshot(finalized);
const replayedSnapshot = canonicalPackageSnapshot(replayed);
const idempotent = finalizedSnapshot === replayedSnapshot && replayed.changed === false;
const gradeOptions = {
  featureIds: project.selectedFeatures,
  columns: project.columns,
  slideTheme: project.slideTheme,
  courseGraph: project.courseGraph,
  pipelineState: project.lastRunDigest?.pipeline,
  budget: project.apiCallBudgetReceipt,
  digest: project.lastRunDigest,
  coursePrompt: project.promptText,
  timeoutMs: 120000,
};
const beforeQuality = await gradePackageAtFinalize({
  ...gradeOptions,
  courseMap: project.courseMap,
  deliverables: project.deliverables,
});
const afterQuality = await gradePackageAtFinalize({
  ...gradeOptions,
  courseMap: finalized.courseMap,
  deliverables: finalized.deliverables,
});
const zipOutput = argument('--zip');
let retainedPackage = null;
if (zipOutput) {
  const replayPackageGeneratedAt = project.lastRunDigest?.at || '2000-01-01T00:00:00.000Z';
  const buildReplayPackage = () =>
    buildCourseMaterialsZip({
      deliverables: finalized.deliverables,
      courseMap: finalized.courseMap,
      columns: project.columns,
      courseName: finalized.courseMap?.courseName,
      slideTheme: project.slideTheme,
      featureIds: project.selectedFeatures,
      pipelineState: project.lastRunDigest?.pipeline,
      courseGraph: project.courseGraph,
      quality: {
        budget: project.apiCallBudgetReceipt,
        digest: project.lastRunDigest,
        coursePrompt: project.promptText,
        timeoutMs: 120000,
      },
      generatedAt: replayPackageGeneratedAt,
    });
  const packageResult = await buildReplayPackage();
  const zipBytes = Buffer.from(await packageResult.blob.arrayBuffer());
  const reproductionResult = await buildReplayPackage();
  const reproductionBytes = Buffer.from(await reproductionResult.blob.arrayBuffer());
  const packageSha256 = sha256(zipBytes);
  const reproductionSha256 = sha256(reproductionBytes);
  const reproducible = zipBytes.equals(reproductionBytes);
  const resolvedZipOutput = path.resolve(zipOutput);
  fs.mkdirSync(path.dirname(resolvedZipOutput), { recursive: true });
  fs.writeFileSync(resolvedZipOutput, zipBytes);
  retainedPackage = {
    file: path.basename(resolvedZipOutput),
    sha256: packageSha256,
    size: zipBytes.length,
    files: packageResult.files.length,
    generatedAt: replayPackageGeneratedAt,
    quality: qualitySummary({
      ...packageResult.quality,
      findings: packageResult.qualityResult?.findings || [],
    }),
    reproducibility: {
      passed: reproducible,
      secondSha256: reproductionSha256,
      secondSize: reproductionBytes.length,
    },
  };
  if (!reproducible) process.exitCode = 1;
}

const receipt = {
  protocol: 'coursemapper-output-quality-replay-receipt-v1',
  inputFile: path.basename(inputPath),
  inputSha256,
  sourceProjectSha256,
  retainedFixtureSha256: sha256(fixtureJson),
  beforeLegacyCorrectionCount: renderedTextCount(project.deliverables, needle),
  afterLegacyCorrectionCount: renderedTextCount(finalized.deliverables, needle),
  beforeQuality: qualitySummary(beforeQuality),
  afterQuality: qualitySummary(afterQuality),
  ...(retainedPackage ? { retainedPackage } : {}),
  changed: finalized.changed,
  repairsApplied: finalized.repairsApplied,
  repairMessages: (finalized.repairs || [])
    .map((entry) => entry.message)
    .filter((message) => /content-quality/.test(message)),
  idempotence: {
    passed: idempotent,
    firstSnapshotSha256: sha256(finalizedSnapshot),
    secondSnapshotSha256: sha256(replayedSnapshot),
    secondChanged: replayed.changed,
    secondRepairMessages: (replayed.repairs || []).map((entry) => entry.message),
  },
};

if (!idempotent) {
  process.exitCode = 1;
}

const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;
const outputPath = argument('--output');
if (outputPath) {
  const resolvedOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, receiptJson);
}
process.stdout.write(receiptJson);
