#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

import { getCourseById } from './crucible/courses.mjs';
import { computeScionAdapterPackageIdentity } from './lib/scionBrowserDeviceMatrix.mjs';
import { summarizeScionCompilerBurden, parseScionConsoleEvents } from './lib/scionCompilerBurden.mjs';
import { captureModuleImplementationReceipt } from './lib/moduleImplementationReceipt.mjs';
import { sha256File } from './scionAdapterPackage.mjs';
import { SCION_GEMMA4_E2B_BASE, validateScionAdapterManifest } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RUN_ID = /^[a-z0-9][a-z0-9._:-]{2,95}$/;
const ARMS = new Set(['adapter', 'base-only']);

export const SCION_PAIRED_EVIDENCE_PRODUCER = 'scion-paired-evidence-v1';
export const SCION_PAIRED_COMPARISON_PROTOCOL = 1;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Value(value) {
  return crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : stableJson(value))
    .digest('hex');
}

function canonicalFixture(course) {
  return {
    courseId: course.id,
    title: course.title,
    lessonCount: course.lessonCount,
    prompt: course.prompt,
    files: [],
  };
}

function canonicalSourcePacket(course) {
  return { prompt: course.prompt, files: [] };
}

function clean(value) {
  return String(value ?? '').trim();
}

export function validateScionHeldoutBenchmark(manifest, { courseResolver = getCourseById } = {}) {
  const issues = [];
  if (![1, 2].includes(manifest?.schemaVersion)) issues.push('schema-version');
  if (manifest?.protocolVersion !== 'scion-adapter-course-pair-v1') issues.push('protocol-version');
  if (!clean(manifest?.id)) issues.push('benchmark-id');
  if (manifest?.selectionPolicy?.domainDisjointFromTraining !== true) issues.push('domain-disjoint-policy');
  if (manifest?.selectionPolicy?.courseGroupDisjointFromTraining !== true) issues.push('group-disjoint-policy');
  if (manifest?.selectionPolicy?.sameCompilerCommitRequired !== true) issues.push('compiler-commit-policy');
  if (manifest?.selectionPolicy?.sameCompilerConfigRequired !== true) issues.push('compiler-config-policy');
  if (manifest?.selectionPolicy?.sameGraderRequired !== true) issues.push('grader-policy');

  const expectedBaseHash = sha256Value(SCION_GEMMA4_E2B_BASE);
  if (clean(manifest?.base?.modelId).toLowerCase() !== SCION_GEMMA4_E2B_BASE.modelId.toLowerCase()) {
    issues.push('base-model');
  }
  if (manifest?.base?.revision !== SCION_GEMMA4_E2B_BASE.revision) issues.push('base-revision');
  if (manifest?.base?.contractSha256 !== expectedBaseHash) issues.push('base-contract-sha256');
  if (!clean(manifest?.grader?.id)) issues.push('grader-id');
  if (!clean(manifest?.grader?.path)) issues.push('grader-path');
  if (!SHA256.test(clean(manifest?.grader?.sha256))) issues.push('grader-sha256');
  if (manifest?.schemaVersion >= 2) {
    if (!SHA256.test(clean(manifest?.grader?.implementationSha256))) issues.push('grader-implementation-sha256');
    if (
      !Number.isSafeInteger(manifest?.grader?.implementationFileCount) ||
      manifest.grader.implementationFileCount < 2
    ) {
      issues.push('grader-implementation-file-count');
    }
  }

  const courses = Array.isArray(manifest?.courses) ? manifest.courses : [];
  const minimumDomains = Number(manifest?.minimumDomains) || 5;
  const minimumLessons = Number(manifest?.minimumLessonsPerCourse) || 12;
  if (courses.length < minimumDomains) issues.push('insufficient-courses');
  const courseIds = new Set();
  const domains = new Set();
  for (const entry of courses) {
    const courseId = clean(entry?.courseId);
    const domain = clean(entry?.domain).toLowerCase();
    if (!courseId) issues.push('course-id');
    else if (courseIds.has(courseId)) issues.push(`duplicate-course:${courseId}`);
    else courseIds.add(courseId);
    if (!domain) issues.push(`course-domain:${courseId || '?'}`);
    else if (domains.has(domain)) issues.push(`duplicate-domain:${domain}`);
    else domains.add(domain);
    const fixture = courseResolver(courseId);
    if (!fixture) {
      issues.push(`fixture-missing:${courseId || '?'}`);
      continue;
    }
    if (Number(entry.lessonCount) !== Number(fixture.lessonCount) || Number(entry.lessonCount) < minimumLessons) {
      issues.push(`lesson-count:${courseId}`);
    }
    if (entry.courseInputSha256 !== sha256Value(canonicalFixture(fixture))) {
      issues.push(`course-input-sha256:${courseId}`);
    }
    if (entry.sourcePacketSha256 !== sha256Value(canonicalSourcePacket(fixture))) {
      issues.push(`source-packet-sha256:${courseId}`);
    }
  }
  if (domains.size < minimumDomains) issues.push('insufficient-domains');
  return { valid: issues.length === 0, issues: [...new Set(issues)], courseIds: [...courseIds], domains: [...domains] };
}

export function assessHeldoutDatasetBoundary(benchmark, dataset) {
  const benchmarkDomains = new Set((benchmark?.courses || []).map((course) => clean(course.domain).toLowerCase()));
  const benchmarkGroups = new Set((benchmark?.courses || []).map((course) => clean(course.courseId).toLowerCase()));
  const datasetDomains = new Set((dataset?.domains || []).map((domain) => clean(domain).toLowerCase()));
  const benchmarkGroupHashes = new Map(
    [...benchmarkGroups].map((courseId) => {
      const course = (benchmark?.courses || []).find((entry) => clean(entry.courseId).toLowerCase() === courseId);
      return [sha256Value(`${clean(course?.domain).toLowerCase()}:${courseId}`), courseId];
    }),
  );
  const benchmarkCourseIdHashes = new Map([...benchmarkGroups].map((courseId) => [sha256Value(courseId), courseId]));
  const groupProofAvailable =
    dataset?.groupIdentity?.algorithm === 'sha256-domain-colon-course-id' &&
    Array.isArray(dataset?.groupIdentity?.hashes) &&
    dataset.groupIdentity.hashes.every((hash) => SHA256.test(clean(hash)));
  const courseIdProofAvailable =
    dataset?.groupIdentity?.courseIdAlgorithm === 'sha256-course-id' &&
    Array.isArray(dataset?.groupIdentity?.courseIdHashes) &&
    dataset.groupIdentity.courseIdHashes.every((hash) => SHA256.test(clean(hash)));
  const datasetGroupHashes = new Set(groupProofAvailable ? dataset.groupIdentity.hashes : []);
  const datasetCourseIdHashes = new Set(courseIdProofAvailable ? dataset.groupIdentity.courseIdHashes : []);
  const domainOverlap = [...benchmarkDomains].filter((domain) => datasetDomains.has(domain)).sort();
  const groupOverlap = [
    ...new Set([
      ...[...benchmarkGroupHashes.entries()]
        .filter(([hash]) => datasetGroupHashes.has(hash))
        .map(([, courseId]) => courseId),
      ...[...benchmarkCourseIdHashes.entries()]
        .filter(([hash]) => datasetCourseIdHashes.has(hash))
        .map(([, courseId]) => courseId),
    ]),
  ].sort();
  return {
    pass: groupProofAvailable && courseIdProofAvailable && domainOverlap.length === 0 && groupOverlap.length === 0,
    groupProofAvailable,
    courseIdProofAvailable,
    domainOverlap,
    groupOverlap,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function gitOutput(cwd, args) {
  const { stdout } = await execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 2_000_000 });
  return stdout.trim();
}

function untrackedCanAffectCompiler(filePath) {
  return (
    /^(src|scripts|tests|public|evaluation|release-contracts|trellis|runtime)\//.test(filePath) ||
    /^(index\.html|firebase\.json|package(?:-lock)?\.json|vite\.config\.|vitest\.config\.|eslint\.config\.|tailwind\.config\.|postcss\.config\.)/.test(
      filePath,
    )
  );
}

export async function captureCompilerProvenance(cwd) {
  const [commit, tree, statusResult] = await Promise.all([
    gitOutput(cwd, ['rev-parse', 'HEAD']),
    gitOutput(cwd, ['rev-parse', 'HEAD^{tree}']),
    execFile('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2_000_000,
    }),
  ]);
  const statusEntries = statusResult.stdout.split('\0').filter(Boolean);
  const trackedChanges = statusEntries.filter((entry) => !entry.startsWith('?? '));
  const affectingUntracked = statusEntries
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))
    .filter(untrackedCanAffectCompiler);
  return {
    commit,
    tree,
    dirty: trackedChanges.length > 0 || affectingUntracked.length > 0,
    trackedChanges,
    affectingUntracked,
  };
}

async function verifyBenchmarkFiles({ benchmarkPath, datasetPath, adapterManifestPath, allowSmoke = false }) {
  const [benchmark, dataset, adapterManifest] = await Promise.all([
    readJson(benchmarkPath),
    readJson(datasetPath),
    readJson(adapterManifestPath),
  ]);
  const benchmarkValidation = validateScionHeldoutBenchmark(benchmark);
  if (!benchmarkValidation.valid) {
    throw new Error(`Invalid held-out benchmark: ${benchmarkValidation.issues.join(', ')}`);
  }
  const graderPath = path.resolve(path.dirname(path.resolve(benchmarkPath)), '..', '..', benchmark.grader.path);
  const actualGraderSha256 = await sha256File(graderPath);
  if (actualGraderSha256 !== benchmark.grader.sha256) throw new Error('Held-out benchmark grader SHA-256 mismatch.');
  const graderRoot = path.resolve(path.dirname(path.resolve(benchmarkPath)), '..', '..');
  const graderImplementation = await captureModuleImplementationReceipt({
    root: graderRoot,
    entryPath: benchmark.grader.path,
  });
  const declaredImplementationSha256 = clean(benchmark.grader.implementationSha256);
  const declaredImplementationFileCount = Number(benchmark.grader.implementationFileCount) || null;
  const transitiveBound =
    SHA256.test(declaredImplementationSha256) &&
    declaredImplementationSha256 === graderImplementation.implementationSha256 &&
    declaredImplementationFileCount === graderImplementation.fileCount;
  if (declaredImplementationSha256 && !transitiveBound) {
    throw new Error('Held-out benchmark grader implementation receipt mismatch.');
  }
  const graderBinding = {
    status: transitiveBound ? 'transitively-bound' : 'legacy-entry-only',
    transitiveBound,
    entrySha256: actualGraderSha256,
    implementationSha256: graderImplementation.implementationSha256,
    implementationFileCount: graderImplementation.fileCount,
    declaredImplementationSha256: declaredImplementationSha256 || null,
    declaredImplementationFileCount,
    implementationFiles: graderImplementation.files,
  };
  const adapterValidation = validateScionAdapterManifest(adapterManifest);
  if (!adapterValidation.valid) throw new Error(`Invalid adapter manifest: ${adapterValidation.issues.join(', ')}`);
  const datasetSha256 = await sha256File(datasetPath);
  if (datasetSha256 !== adapterManifest.training.datasetManifestSha256) {
    throw new Error('Adapter and dataset manifest SHA-256 do not match.');
  }
  const heldoutBoundary = assessHeldoutDatasetBoundary(benchmark, dataset);
  if (!heldoutBoundary.pass) {
    throw new Error(
      `Held-out benchmark leaks into training data (domains: ${heldoutBoundary.domainOverlap.join(', ') || 'none'}; groups: ${heldoutBoundary.groupOverlap.join(', ') || 'none'}).`,
    );
  }
  if (
    !allowSmoke &&
    (dataset.status !== 'ready' || !['candidate', 'promoted'].includes(adapterManifest.promotion?.status))
  ) {
    throw new Error('A production paired run requires a ready dataset and candidate or promoted adapter.');
  }
  return {
    benchmark,
    dataset,
    adapterManifest,
    benchmarkSha256: await sha256File(benchmarkPath),
    datasetSha256,
    adapterManifestSha256: await sha256File(adapterManifestPath),
    adapterPackageIdentitySha256: computeScionAdapterPackageIdentity(adapterManifest).sha256,
    heldoutBoundary,
    graderBinding,
  };
}

function selectedBaseCourseIds(courses) {
  return courses.map((course) => clean(course.baseId || course.id).replace(/--.*$/, ''));
}

export async function prepareScionBenchmarkRun({
  benchmarkPath,
  datasetPath,
  adapterManifestPath,
  arm,
  pairRunId,
  courses,
  localModel,
  cwd,
  compilerOptions = {},
  allowSmoke = false,
} = {}) {
  if (!ARMS.has(arm)) throw new Error('--scion-arm must be adapter or base-only.');
  if (!RUN_ID.test(clean(pairRunId))) throw new Error('--scion-pair-run must be a stable 3-96 character ID.');
  if (!benchmarkPath || !datasetPath || !adapterManifestPath) {
    throw new Error('--scion-benchmark, --scion-dataset-manifest, and --scion-adapter-manifest are required together.');
  }
  const verified = await verifyBenchmarkFiles({ benchmarkPath, datasetPath, adapterManifestPath, allowSmoke });
  if (!allowSmoke && !verified.graderBinding.transitiveBound) {
    throw new Error(
      'Production paired runs require a transitive grader implementation receipt; the benchmark binds only its wrapper entry.',
    );
  }
  const expectedIds = verified.benchmark.courses.map((course) => course.courseId).sort();
  const selectedIds = selectedBaseCourseIds(courses).sort();
  if (stableJson(selectedIds) !== stableJson(expectedIds)) {
    throw new Error(`Paired run must use the frozen course set: ${expectedIds.join(', ')}.`);
  }
  const provenance = await captureCompilerProvenance(cwd);
  if (!COMMIT.test(provenance.commit) || provenance.dirty) {
    throw new Error(
      `Paired run requires a clean compiler commit; tracked changes: ${provenance.trackedChanges.join(', ') || 'none'}; affecting untracked: ${provenance.affectingUntracked.join(', ') || 'none'}.`,
    );
  }
  const sameBase =
    clean(localModel?.sourceModelId).toLowerCase() === clean(verified.adapterManifest.base.modelId).toLowerCase() &&
    clean(localModel?.sourceRevision) === clean(verified.adapterManifest.base.revision);
  if (!sameBase) throw new Error('Local runtime does not report the adapter manifest exact base model and revision.');
  if (arm === 'adapter') {
    if (
      localModel?.adapterActive !== true ||
      localModel?.adapterId !== verified.adapterManifest.adapter.id ||
      localModel?.adapterPackageIdentitySha256 !== verified.adapterPackageIdentitySha256
    ) {
      throw new Error('Adapter arm does not report the exact active adapter identity.');
    }
  } else if (
    localModel?.adapterActive === true ||
    localModel?.adapterId ||
    localModel?.adapterManifestSha256 ||
    localModel?.adapterPackageIdentitySha256
  ) {
    throw new Error('Base-only arm reports an active adapter.');
  }
  const compilerConfig = {
    producer: SCION_PAIRED_EVIDENCE_PRODUCER,
    benchmarkSha256: verified.benchmarkSha256,
    packageLockSha256: await sha256File(path.join(cwd, 'package-lock.json')),
    graderSha256: verified.benchmark.grader.sha256,
    graderImplementationSha256: verified.graderBinding.implementationSha256,
    options: compilerOptions,
  };
  const compilerConfigSha256 = sha256Value(compilerConfig);
  const byCourseId = {};
  for (const course of verified.benchmark.courses) {
    byCourseId[course.courseId] = {
      protocolVersion: SCION_PAIRED_COMPARISON_PROTOCOL,
      evidenceProducer: SCION_PAIRED_EVIDENCE_PRODUCER,
      pairId: `${pairRunId}:${course.domain}`,
      benchmarkManifestSha256: verified.benchmarkSha256,
      courseInputSha256: course.courseInputSha256,
      sourcePacketSha256: course.sourcePacketSha256,
      compilerCommit: provenance.commit,
      compilerTree: provenance.tree,
      compilerConfigSha256,
      graderVersion: verified.benchmark.grader.id,
      graderSha256: verified.benchmark.grader.sha256,
      graderImplementationSha256: verified.graderBinding.implementationSha256,
      baseContractSha256: verified.benchmark.base.contractSha256,
      compilerTreeDirty: false,
      variant: arm,
    };
  }
  return {
    ...verified,
    arm,
    pairRunId,
    provenance,
    compilerConfig,
    compilerConfigSha256,
    byCourseId,
  };
}

async function findCourseArtifacts(roundDir, benchmark) {
  const expected = new Map(benchmark.courses.map((course) => [course.courseId, course]));
  const found = new Map();
  for (const name of (await fs.readdir(roundDir)).sort()) {
    const courseDir = path.join(roundDir, name);
    let course;
    try {
      course = await readJson(path.join(courseDir, 'course.json'));
    } catch {
      continue;
    }
    const baseId = clean(course.baseId || course.id).replace(/--.*$/, '');
    if (!expected.has(baseId)) continue;
    if (found.has(baseId)) throw new Error(`Duplicate Crucible artifact for ${baseId}.`);
    found.set(baseId, { courseDir, course, benchmarkCourse: expected.get(baseId) });
  }
  const missing = [...expected.keys()].filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Round is missing frozen courses: ${missing.join(', ')}.`);
  return [...found.values()].sort((left, right) =>
    left.benchmarkCourse.courseId.localeCompare(right.benchmarkCourse.courseId),
  );
}

async function regularFileReceipt(filePath) {
  const stats = await fs.lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error(`Evidence artifact is not a regular file: ${filePath}`);
  return { path: filePath, bytes: stats.size, sha256: await sha256File(filePath) };
}

async function buildCourseEvidence({
  courseDir,
  course,
  benchmarkCourse,
  expectedArm,
  adapterManifest,
  adapterPackageIdentitySha256,
  graderImplementationSha256,
}) {
  const [report, digest, packageManifest, packageManifestText, project, consoleText, fileNames] = await Promise.all([
    readJson(path.join(courseDir, 'report.json')),
    readJson(path.join(courseDir, 'digest.json')),
    readJson(path.join(courseDir, 'extracted', 'PACKAGE_MANIFEST.json')),
    fs.readFile(path.join(courseDir, 'extracted', 'PACKAGE_MANIFEST.json'), 'utf8'),
    readJson(path.join(courseDir, 'project.json')),
    fs.readFile(path.join(courseDir, 'console.log'), 'utf8'),
    fs.readdir(courseDir),
  ]);
  const zipNames = fileNames.filter((file) => file.endsWith('.zip')).sort();
  if (zipNames.length !== 1) {
    throw new Error(`Expected exactly one ZIP for ${benchmarkCourse.courseId}; found ${zipNames.length}.`);
  }
  const [zipName] = zipNames;
  const receiptFiles = [
    'course.json',
    'project.json',
    'report.json',
    'digest.json',
    'console.log',
    path.join('extracted', 'PACKAGE_MANIFEST.json'),
    zipName,
  ];
  const receipts = await Promise.all(receiptFiles.map((file) => regularFileReceipt(path.join(courseDir, file))));
  const artifactReceiptSha256 = sha256Value(
    receipts.map((entry) => ({
      path: path.relative(courseDir, entry.path).replaceAll('\\', '/'),
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
  );
  const comparison = course.comparison || {};
  const frozenFixture = getCourseById(benchmarkCourse.courseId);
  if (
    !frozenFixture ||
    clean(course.baseId || course.id).replace(/--.*$/, '') !== benchmarkCourse.courseId ||
    Number(course.lessonCount) !== Number(benchmarkCourse.lessonCount) ||
    course.prompt !== frozenFixture.prompt ||
    project.promptText !== frozenFixture.prompt ||
    project.provider !== 'local' ||
    project.hasGenerated !== true ||
    course.provider !== 'local'
  ) {
    throw new Error(`Course ${benchmarkCourse.courseId} does not match the frozen generated input.`);
  }
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(courseDir, zipName)));
  const embeddedManifest = zip.file('PACKAGE_MANIFEST.json');
  if (!embeddedManifest || (await embeddedManifest.async('string')) !== packageManifestText) {
    throw new Error(`Course ${benchmarkCourse.courseId} ZIP manifest does not match its extracted manifest.`);
  }
  if (
    comparison.protocolVersion !== SCION_PAIRED_COMPARISON_PROTOCOL ||
    comparison.evidenceProducer !== SCION_PAIRED_EVIDENCE_PRODUCER ||
    comparison.variant !== expectedArm ||
    comparison.courseInputSha256 !== benchmarkCourse.courseInputSha256 ||
    comparison.sourcePacketSha256 !== benchmarkCourse.sourcePacketSha256
  ) {
    throw new Error(`Course ${benchmarkCourse.courseId} does not carry the frozen paired-run identity.`);
  }
  if (
    graderImplementationSha256 &&
    clean(comparison.graderImplementationSha256) !== clean(graderImplementationSha256)
  ) {
    throw new Error(`Course ${benchmarkCourse.courseId} does not carry the bound grader implementation identity.`);
  }
  const localModel = course.localModel || {};
  const isAdapter = expectedArm === 'adapter';
  if (
    clean(localModel.sourceModelId).toLowerCase() !== clean(adapterManifest.base.modelId).toLowerCase() ||
    clean(localModel.sourceRevision) !== clean(adapterManifest.base.revision)
  ) {
    throw new Error(`Course ${benchmarkCourse.courseId} used the wrong base weights.`);
  }
  if (
    isAdapter !== (localModel.adapterActive === true) ||
    (isAdapter &&
      (localModel.adapterId !== adapterManifest.adapter.id ||
        localModel.adapterPackageIdentitySha256 !== adapterPackageIdentitySha256)) ||
    (!isAdapter &&
      (localModel.adapterId || localModel.adapterManifestSha256 || localModel.adapterPackageIdentitySha256))
  ) {
    throw new Error(`Course ${benchmarkCourse.courseId} used the wrong adapter state.`);
  }
  const taskRows = Array.isArray(digest?.cost?.byTask) ? digest.cost.byTask : [];
  const task = (id) => taskRows.find((entry) => entry.task === id) || {};
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
  const quality = packageManifest?.quality || {};
  const zipReceipt = receipts.find((entry) => entry.path.endsWith(zipName));
  return {
    domain: benchmarkCourse.domain,
    courseId: benchmarkCourse.courseId,
    lessonCount: Number(course.lessonCount) || 0,
    packageGrade: Number(report?.normalized?.overall),
    packageLetterGrade: report?.normalized?.overallGrade || '',
    p0: Number(report?.normalized?.p0Count) || 0,
    p1: Number(report?.normalized?.p1Count) || 0,
    p2: Number(quality?.findingCounts?.p2) || 0,
    packageValid:
      report?.run?.status === 'passed' &&
      Number(report?.normalized?.overall) === Number(quality?.score) &&
      Number(zipReceipt?.bytes) > 10_000 &&
      packageManifest?.readiness?.status === 'ready',
    durationMs: Number(report?.run?.durationMs) || null,
    scionPassCalls: Number(task('scionPass').calls) || compilerBurden.scion.calls,
    compilerBurden,
    baseRevision: localModel.sourceRevision,
    adapterActive: localModel.adapterActive === true,
    adapterId: localModel.adapterId || null,
    adapterManifestSha256: localModel.adapterManifestSha256 || null,
    adapterPackageIdentitySha256: localModel.adapterPackageIdentitySha256 || null,
    adapterScale: isAdapter ? Number(localModel.adapterScale ?? adapterManifest.adapter?.scale ?? 1) : 0,
    evidenceProducer: SCION_PAIRED_EVIDENCE_PRODUCER,
    artifactReceiptSha256,
    artifactFiles: receipts.map((entry) => ({
      path: path.relative(courseDir, entry.path).replaceAll('\\', '/'),
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
    sourceArtifact: courseDir,
    comparison,
  };
}

function assertPairs(candidateCourses, baseCourses, benchmarkSha256) {
  const baseByDomain = new Map(baseCourses.map((course) => [course.domain, course]));
  for (const candidate of candidateCourses) {
    const base = baseByDomain.get(candidate.domain);
    if (!base) throw new Error(`Missing base course for ${candidate.domain}.`);
    const shared = [
      'pairId',
      'benchmarkManifestSha256',
      'courseInputSha256',
      'sourcePacketSha256',
      'compilerCommit',
      'compilerTree',
      'compilerConfigSha256',
      'graderVersion',
      'graderSha256',
      'graderImplementationSha256',
      'baseContractSha256',
    ];
    if (shared.some((field) => candidate.comparison?.[field] !== base.comparison?.[field])) {
      throw new Error(`Candidate/base comparison identity mismatch for ${candidate.domain}.`);
    }
    if (candidate.comparison?.benchmarkManifestSha256 !== benchmarkSha256) {
      throw new Error(`Benchmark manifest mismatch for ${candidate.domain}.`);
    }
  }
}

export async function produceScionPairedEvidence({
  benchmarkPath,
  datasetPath,
  adapterManifestPath,
  candidateRoundDir,
  baseRoundDir,
  outputDir = 'verification-output/scion-adapter-paired-evidence',
  allowSmoke = false,
} = {}) {
  const verified = await verifyBenchmarkFiles({ benchmarkPath, datasetPath, adapterManifestPath, allowSmoke });
  const [candidateArtifacts, baseArtifacts] = await Promise.all([
    findCourseArtifacts(candidateRoundDir, verified.benchmark),
    findCourseArtifacts(baseRoundDir, verified.benchmark),
  ]);
  const [candidateCourses, baseCourses] = await Promise.all([
    Promise.all(
      candidateArtifacts.map((artifact) =>
        buildCourseEvidence({
          ...artifact,
          expectedArm: 'adapter',
          adapterManifest: verified.adapterManifest,
          adapterPackageIdentitySha256: verified.adapterPackageIdentitySha256,
          graderImplementationSha256: verified.graderBinding.transitiveBound
            ? verified.graderBinding.implementationSha256
            : null,
        }),
      ),
    ),
    Promise.all(
      baseArtifacts.map((artifact) =>
        buildCourseEvidence({
          ...artifact,
          expectedArm: 'base-only',
          adapterManifest: verified.adapterManifest,
          adapterPackageIdentitySha256: verified.adapterPackageIdentitySha256,
          graderImplementationSha256: verified.graderBinding.transitiveBound
            ? verified.graderBinding.implementationSha256
            : null,
        }),
      ),
    ),
  ]);
  assertPairs(candidateCourses, baseCourses, verified.benchmarkSha256);
  const shared = {
    schemaVersion: 1,
    protocolVersion: verified.benchmark.protocolVersion,
    evidenceProducer: SCION_PAIRED_EVIDENCE_PRODUCER,
    benchmarkId: verified.benchmark.id,
    benchmarkManifestSha256: verified.benchmarkSha256,
    datasetManifestSha256: verified.datasetSha256,
    adapterManifestSha256: verified.adapterManifestSha256,
    adapterPackageIdentitySha256: verified.adapterPackageIdentitySha256,
    graderBinding: verified.graderBinding,
    observedAt: new Date().toISOString(),
  };
  const candidateEvidence = {
    ...shared,
    candidateId: verified.adapterManifest.adapter.id,
    servingModelId: verified.adapterManifest.base.modelId,
    variant: 'adapter',
    fullCourses: candidateCourses,
  };
  const baseEvidence = {
    ...shared,
    candidateId: `${verified.adapterManifest.adapter.id}-base-only`,
    servingModelId: verified.adapterManifest.base.modelId,
    variant: 'base-only',
    fullCourses: baseCourses,
  };
  const receipt = {
    ...shared,
    status: 'captured',
    promotionEligible: !allowSmoke && verified.graderBinding.transitiveBound,
    domains: verified.benchmark.courses.map((course) => course.domain),
    pairIds: candidateCourses.map((course) => course.comparison.pairId),
    candidateEvidenceCanonicalSha256: sha256Value(candidateEvidence),
    baseEvidenceCanonicalSha256: sha256Value(baseEvidence),
    heldoutBoundary: verified.heldoutBoundary,
  };
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'candidate.json'), `${JSON.stringify(candidateEvidence, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'base.json'), `${JSON.stringify(baseEvidence, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`),
  ]);
  return { candidateEvidence, baseEvidence, receipt };
}

function parseArgs(argv) {
  const args = { outputDir: 'verification-output/scion-adapter-paired-evidence', allowSmoke: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--benchmark') args.benchmarkPath = argv[++index];
    else if (arg === '--dataset-manifest') args.datasetPath = argv[++index];
    else if (arg === '--adapter-manifest') args.adapterManifestPath = argv[++index];
    else if (arg === '--candidate-round') args.candidateRoundDir = argv[++index];
    else if (arg === '--base-round') args.baseRoundDir = argv[++index];
    else if (arg === '--output') args.outputDir = argv[++index];
    else if (arg === '--allow-smoke') args.allowSmoke = true;
  }
  return args;
}

async function main() {
  const result = await produceScionPairedEvidence(parseArgs(process.argv.slice(2)));
  console.log(`Scion paired evidence: ${result.receipt.status}`);
  console.log(`Domains: ${result.receipt.domains.join(', ')}`);
  console.log(`Promotion eligible: ${result.receipt.promotionEligible}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
