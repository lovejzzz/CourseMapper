#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MANIFEST = 'evaluation/model-comparison/gpt54mini-scion-algi-v1.json';
const DEFAULT_OUTPUT = 'evaluation/model-comparison/gpt54mini-scion-algi-v1.evidence.json';
const DIMENSIONS = ['factualAndSourceGrounding', 'languageQuality', 'instructionalUsability', 'promptFidelity'];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    algiRound: '',
    scionRound: '',
    compilerCommit: '',
    gptReason: '',
    gptAttemptArtifact: '',
    scionColdBytes: 0,
    blindPacket: '',
    blindResult: '',
    blindKey: '',
    output: DEFAULT_OUTPUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === '--manifest') options.manifest = value || options.manifest;
    else if (argv[index] === '--algi-round') options.algiRound = value || '';
    else if (argv[index] === '--scion-round') options.scionRound = value || '';
    else if (argv[index] === '--compiler-commit') options.compilerCommit = value || '';
    else if (argv[index] === '--gpt-reason') options.gptReason = value || '';
    else if (argv[index] === '--gpt-attempt-artifact') options.gptAttemptArtifact = value || '';
    else if (argv[index] === '--scion-cold-bytes') options.scionColdBytes = Number(value || 0);
    else if (argv[index] === '--blind-packet') options.blindPacket = value || '';
    else if (argv[index] === '--blind-result') options.blindResult = value || '';
    else if (argv[index] === '--blind-key') options.blindKey = value || '';
    else if (argv[index] === '--output') options.output = value || options.output;
  }
  return options;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function mean(values = []) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizedPath(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative.startsWith('..') ? filePath : relative;
}

async function artifactDescriptor(root, filePath) {
  const bytes = await fs.readFile(filePath);
  return { path: normalizedPath(root, filePath), sha256: sha256(bytes) };
}

async function firstPackageZip(directory) {
  const entries = await fs.readdir(directory);
  const match = entries.filter((entry) => entry.endsWith('-package.zip')).sort()[0];
  if (!match) throw new Error(`No package ZIP in ${directory}`);
  return path.join(directory, match);
}

function parseTimestamp(line = '') {
  const timestamp = Date.parse(String(line).slice(0, 24));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function timingFromConsole(consoleText = '') {
  const lines = String(consoleText).split(/\r?\n/);
  const loadStart = lines.find((line) => line.includes('"type":"localModelProgress"') && line.includes('"progress":0'));
  const routeReady = lines.find((line) => line.includes('"type":"scionAdapterRoute"'));
  const start = parseTimestamp(loadStart);
  const ready = parseTimestamp(routeReady);
  return {
    modelLoadMs: start !== null && ready !== null && ready >= start ? ready - start : 0,
    sourceRequests: Number([...String(consoleText).matchAll(/"sourceRequests":(\d+)/g)].at(-1)?.[1] || 0),
  };
}

function encodedUnsupportedClaimCount(report = {}) {
  const findings = report.normalized?.findings || report.normalized?.raw?.findings || [];
  return findings.filter((finding) =>
    /unsupported|unverified factual|source.*(?:missing|cannot|does not support)/i.test(
      `${finding.dimension || ''} ${finding.detail || ''} ${finding.evidence || ''}`,
    ),
  ).length;
}

async function completedArm({ root, roundRoot, courseId, armId, scionColdBytes }) {
  const directory = path.resolve(root, roundRoot, `${courseId}--public`);
  const consolePath = path.join(directory, 'console.log');
  const digestPath = path.join(directory, 'digest.json');
  const reportPath = path.join(directory, 'report.json');
  const qualityPath = path.join(directory, 'extracted', 'QUALITY_REPORT.md');
  const zipPath = await firstPackageZip(directory);
  const [consoleText, digest, report] = await Promise.all([
    fs.readFile(consolePath, 'utf8'),
    fs.readFile(digestPath, 'utf8').then(JSON.parse),
    fs.readFile(reportPath, 'utf8').then(JSON.parse),
  ]);
  const timing = timingFromConsole(consoleText);
  const readiness = report.normalized?.raw?.readiness || {};
  const evidence = readiness.components?.evidenceGrounding?.evidence || {};
  const artifacts = {
    consoleLog: await artifactDescriptor(root, consolePath),
    runDigest: await artifactDescriptor(root, digestPath),
    qualityReport: await artifactDescriptor(root, qualityPath),
    packageZip: await artifactDescriptor(root, zipPath),
  };
  return {
    status: 'completed',
    metrics: {
      readiness: Number(digest.gates?.automatedReadinessScore || 0),
      exported: digest.gates?.exportStatus === 'passed' ? 1 : 0,
      evidenceCoverage: Number(evidence.groundingRatio || 0),
      blockers: Number(digest.gates?.blockers || 0),
      p0: Number(digest.gates?.qualityP0 || 0),
      p1: Number(digest.gates?.qualityP1 || 0),
      unsupportedClaims: encodedUnsupportedClaimCount(report),
      durationMs: Number(report.run?.durationMs || 0),
      modelLoadMs: timing.modelLoadMs,
      mandatoryModelBytes: armId === 'scion' ? Number(scionColdBytes || 0) : 0,
      costUsd: Number(digest.cost?.totalUsd || 0),
      providerCalls: Number(digest.run?.providerCalls || 0),
      sourceRequests: armId === 'algi' ? timing.sourceRequests : 0,
      repairCount: Number(digest.gates?.repairsApplied || 0),
      retryCount: Number(digest.gates?.retryCallCount || 0),
    },
    artifacts,
  };
}

function decodeBlindReview({ judge, key }) {
  const keyCases = new Map((key.cases || []).map((entry) => [entry.id, entry]));
  const routeRows = { scion: [], algi: [] };
  const cases = [];
  for (const result of judge.cases || []) {
    const mapping = keyCases.get(result.id);
    if (!mapping) throw new Error(`Blind key missing ${result.id}`);
    const decoded = {};
    for (const label of ['candidateA', 'candidateB']) {
      const route = mapping[label];
      if (!routeRows[route]) throw new Error(`Invalid blind route for ${result.id}:${label}`);
      const scores = result[label];
      if (!scores || DIMENSIONS.some((dimension) => !Number.isFinite(Number(scores[dimension])))) {
        throw new Error(`Blind result missing scores for ${result.id}:${label}`);
      }
      const normalized = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, Number(scores[dimension])]));
      normalized.mean = round(mean(DIMENSIONS.map((dimension) => normalized[dimension])));
      decoded[route] = normalized;
      routeRows[route].push(normalized);
    }
    const preferredRoute = result.preferred === 'tie' ? 'tie' : mapping[`candidate${result.preferred}`] || 'invalid';
    cases.push({
      id: result.id,
      scores: decoded,
      preferredRoute,
      reason: result.reason,
      criticalDefects: result.criticalDefects || [],
    });
  }
  const summaries = Object.fromEntries(
    Object.entries(routeRows).map(([route, rows]) => [
      route,
      {
        cases: rows.length,
        preferredCases: cases.filter((entry) => entry.preferredRoute === route).length,
        meanScore: round(mean(rows.flatMap((row) => DIMENSIONS.map((dimension) => row[dimension])))),
        dimensions: Object.fromEntries(
          DIMENSIONS.map((dimension) => [dimension, round(mean(rows.map((row) => row[dimension])))]),
        ),
      },
    ]),
  );
  return {
    protocol: judge.protocol,
    evidenceClass: 'model-assisted-blind-review',
    validationBoundary: 'Not expert, instructor, human-preference, accessibility, or classroom validation.',
    judgeModelInvocation: 'gpt-5.6-sol',
    judgeSelfReportedModel: judge.judgeModel || '',
    summaries,
    cases,
    overallNotes: judge.overallNotes || '',
  };
}

export async function buildThreeRouteComparisonEvidence({
  root = process.cwd(),
  manifestPath = DEFAULT_MANIFEST,
  algiRound,
  scionRound,
  compilerCommit,
  gptReason,
  gptAttemptArtifact = '',
  scionColdBytes = 0,
  blindPacket = '',
  blindResult = '',
  blindKey = '',
} = {}) {
  if (!algiRound || !scionRound) throw new Error('Algi and Scion round paths are required');
  if (!/^[a-f0-9]{7,40}$/.test(String(compilerCommit || ''))) {
    throw new Error('A real compiler commit is required');
  }
  if (!String(gptReason || '').trim()) throw new Error('GPT infrastructure reason is required');
  const manifestBytes = await fs.readFile(path.resolve(root, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  const gptAttempt = gptAttemptArtifact ? await artifactDescriptor(root, path.resolve(root, gptAttemptArtifact)) : null;
  const cases = [];
  for (const course of manifest.courses || []) {
    cases.push({
      id: course.id,
      arms: {
        gpt54Mini: {
          status: 'infrastructure-unavailable',
          reason: gptReason,
          ...(gptAttempt ? { attemptArtifact: gptAttempt } : {}),
        },
        scion: await completedArm({
          root,
          roundRoot: scionRound,
          courseId: course.id,
          armId: 'scion',
          scionColdBytes,
        }),
        algi: await completedArm({
          root,
          roundRoot: algiRound,
          courseId: course.id,
          armId: 'algi',
          scionColdBytes,
        }),
      },
    });
  }
  let blindReview = null;
  if (blindPacket && blindResult && blindKey) {
    const [packetBytes, resultBytes, keyBytes] = await Promise.all([
      fs.readFile(path.resolve(root, blindPacket)),
      fs.readFile(path.resolve(root, blindResult)),
      fs.readFile(path.resolve(root, blindKey)),
    ]);
    blindReview = {
      artifacts: {
        packet: { path: normalizedPath(root, path.resolve(root, blindPacket)), sha256: sha256(packetBytes) },
        result: { path: normalizedPath(root, path.resolve(root, blindResult)), sha256: sha256(resultBytes) },
        key: { path: normalizedPath(root, path.resolve(root, blindKey)), sha256: sha256(keyBytes) },
      },
      ...decodeBlindReview({
        judge: JSON.parse(resultBytes),
        key: JSON.parse(keyBytes),
      }),
    };
  }
  return {
    schemaVersion: 1,
    benchmarkId: manifest.id,
    manifestSha256: sha256(manifestBytes),
    compilerCommit,
    generatedAt: new Date().toISOString(),
    claimBoundary:
      'GPT-5.4 mini is unmeasured because the configured API account rejected the request before generation. Scion versus Algi automation is route evidence; the blind review is model-assisted, not expert or classroom validation.',
    cases,
    ...(blindReview ? { blindReview } : {}),
  };
}

async function main() {
  const options = parseArgs();
  const evidence = await buildThreeRouteComparisonEvidence(options);
  const outputPath = path.resolve(options.output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: outputPath, cases: evidence.cases.length })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
