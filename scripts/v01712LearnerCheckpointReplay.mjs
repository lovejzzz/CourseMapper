import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from '../src/lib/courseBlueprintCompiler.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { applyLessonDepthToConfigMap } from '../src/lib/lessonDepth.js';
import { runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function qualitySummary(result) {
  const quality = result?.quality || {};
  return {
    status: quality.status,
    score: quality.score,
    grade: quality.grade,
    findingCounts: quality.findingCounts,
    findings: (result?.qualityResult?.findings || []).map(({ severity, file, detail, evidence }) => ({
      severity,
      file,
      detail,
      evidence,
    })),
  };
}

const inputArgument = argument('--input');
const zipArgument = argument('--zip');
const receiptArgument = argument('--output');
const reproductionZipArgument = argument('--reproduction-zip');
if (!inputArgument || !zipArgument || !receiptArgument) {
  throw new Error(
    'Usage: npx vite-node scripts/v01712LearnerCheckpointReplay.mjs --input <project.coursemapper> --zip <package.zip> --output <receipt.json>',
  );
}

const inputPath = path.resolve(inputArgument);
const zipPath = path.resolve(zipArgument);
const receiptPath = path.resolve(receiptArgument);
const inputBytes = fs.readFileSync(inputPath);
const project = JSON.parse(inputBytes.toString('utf8'));
if (!project?.courseMap?.lessons?.length || !project?.courseGraph?.sessions?.length) {
  throw new Error('The learner-checkpoint replay requires a saved Course Map and CourseGraph.');
}

const featureIds = getBlueprintCompiledFeatures(
  (project.selectedFeatures || []).filter((featureId) => featureId !== 'courseMap'),
);
const sessionMinutes = Number(project?.generationConstraints?.sessionMinutes) || undefined;
const blueprint = compactBlueprintForStorage(
  buildBlueprintFromGraph(project.courseGraph, {
    sessionMinutes,
    sourceBrief: project.promptText,
    compilerPath: {
      mode: 'learner-checkpoint-replay',
      reason: 'Recompiled from the retained CourseGraph to prove the learner-facing checkpoint.',
    },
  }),
);
const configMap = applyLessonDepthToConfigMap(
  Object.fromEntries(featureIds.map((featureId) => [featureId, project.deliverableConfig?.[featureId] || {}])),
);
const compiled = compileBlueprintDeliverables(blueprint, featureIds, { configMap });
const compileErrors = compiled[Symbol.for('coursemapper.blueprintCompileErrors')] || [];
if (compileErrors.length > 0) {
  throw new Error(`Compilation failed: ${JSON.stringify(compileErrors)}`);
}
const deliverables = Object.fromEntries(
  featureIds.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
);
const finalized = runDeterministicPackageFinalizer({
  courseMap: project.courseMap,
  courseGraph: project.courseGraph,
  sourceBrief: project.promptText,
  deliverables,
  selectedFeatures: project.selectedFeatures,
  columns: project.columns,
  deliverableConfig: project.deliverableConfig,
  includeClassroomReadiness: false,
  includePedagogicalValidation: false,
  retryWarnings: false,
});

const generatedAt = project.lastRunDigest?.at || '2000-01-01T00:00:00.000Z';
const packageOptions = {
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
  generatedAt,
};
const first = await buildCourseMaterialsZip(packageOptions);
const second = await buildCourseMaterialsZip(packageOptions);
const firstBytes = Buffer.from(await first.blob.arrayBuffer());
const secondBytes = Buffer.from(await second.blob.arrayBuffer());
fs.mkdirSync(path.dirname(zipPath), { recursive: true });
fs.writeFileSync(zipPath, firstBytes);
if (reproductionZipArgument) {
  const reproductionZipPath = path.resolve(reproductionZipArgument);
  fs.mkdirSync(path.dirname(reproductionZipPath), { recursive: true });
  fs.writeFileSync(reproductionZipPath, secondBytes);
}

const assignmentProof = (finalized.deliverables?.assignments?.data?.assignments || []).map((assignment) => ({
  lessonNumber: assignment.lessonNumber,
  title: assignment.title,
  genre: assignment.artifactGenre?.genre || assignment.genre || null,
  parameters: assignment.parameters || [],
  instructions: assignment.instructions || [],
  hasEvidencePacket: Boolean(assignment.sourceEvidenceBrief),
  hasAnchorSamples: Boolean(assignment.anchorExampleGuidance),
}));
const receipt = {
  protocol: 'coursemapper-v01712-learner-checkpoint-replay-v1',
  source: {
    file: path.basename(inputPath),
    sha256: sha256(inputBytes),
  },
  compile: {
    featureIds,
    lessonCount: blueprint.lessons.length,
    errors: compileErrors,
    finalizerChanged: finalized.changed,
    repairsApplied: finalized.repairsApplied,
  },
  assignmentProof,
  package: {
    file: path.basename(zipPath),
    sha256: sha256(firstBytes),
    size: firstBytes.length,
    fileCount: first.files.length,
    generatedAt,
    reproducible: firstBytes.equals(secondBytes),
    reproductionSha256: sha256(secondBytes),
  },
  quality: qualitySummary(first),
};
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (!receipt.package.reproducible || receipt.quality.findingCounts?.p0 > 0 || receipt.quality.findingCounts?.p1 > 0) {
  process.exitCode = 1;
}
