#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { validateScionAdapterManifest } from '../src/lib/scionAdapterManifest.js';
import { sha256File } from './scionAdapterPackage.mjs';
import { SCION_PAIRED_EVIDENCE_PRODUCER } from './scionAdapterPairedEvidence.mjs';
import { auditScionBrowserDeviceMatrix, computeScionAdapterPackageIdentity } from './lib/scionBrowserDeviceMatrix.mjs';
import {
  auditScionAdapterFactualCanaryEvidence,
  auditScionAdapterProductionCanaryEvidence,
} from './lib/scionAdapterCanaryPromotion.mjs';
import { auditScionAdapterSingleModelJudgeEvidence } from './lib/scionAdapterJudgePromotion.mjs';

const REQUIRED_EXTERNAL_EVIDENCE = [
  'factual-canaries',
  'single-model-judge',
  'browser-device-matrix',
  'production-canaries',
];

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function flattenCourses(evidence = []) {
  return evidence.flatMap((record) => (Array.isArray(record?.fullCourses) ? record.fullCourses : []));
}

function groupByDomain(courses) {
  const map = new Map();
  for (const course of courses) {
    const domain = String(course?.domain || course?.courseId || '')
      .trim()
      .toLowerCase();
    if (!domain) continue;
    const group = map.get(domain) || [];
    group.push(course);
    map.set(domain, group);
  }
  return map;
}

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const PAIR_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/;

function clean(value) {
  return String(value ?? '').trim();
}

function assessPairingContract({ candidateCourse, baseCourse, manifest }) {
  const candidate = candidateCourse?.comparison || {};
  const base = baseCourse?.comparison || {};
  const sharedFields = [
    'pairId',
    'benchmarkManifestSha256',
    'courseInputSha256',
    'sourcePacketSha256',
    'compilerCommit',
    'compilerTree',
    'compilerConfigSha256',
    'graderVersion',
    'graderSha256',
    'baseContractSha256',
  ];
  const sharedValuesMatch = sharedFields.every((field) => clean(candidate[field]) === clean(base[field]));
  const contractShapePass =
    candidate.protocolVersion === 1 &&
    base.protocolVersion === 1 &&
    PAIR_ID.test(clean(candidate.pairId)) &&
    SHA256.test(clean(candidate.benchmarkManifestSha256)) &&
    SHA256.test(clean(candidate.courseInputSha256)) &&
    SHA256.test(clean(candidate.sourcePacketSha256)) &&
    COMMIT.test(clean(candidate.compilerCommit)) &&
    COMMIT.test(clean(candidate.compilerTree)) &&
    SHA256.test(clean(candidate.compilerConfigSha256)) &&
    clean(candidate.graderVersion).length > 0 &&
    SHA256.test(clean(candidate.graderSha256)) &&
    SHA256.test(clean(candidate.baseContractSha256)) &&
    candidate.evidenceProducer === SCION_PAIRED_EVIDENCE_PRODUCER &&
    base.evidenceProducer === SCION_PAIRED_EVIDENCE_PRODUCER &&
    candidate.compilerTreeDirty === false &&
    base.compilerTreeDirty === false &&
    candidate.variant === 'adapter' &&
    base.variant === 'base-only';
  const courseIdentityPass =
    clean(candidateCourse?.domain).toLowerCase() === clean(baseCourse?.domain).toLowerCase() &&
    clean(candidateCourse?.courseId) !== '' &&
    clean(candidateCourse?.courseId) === clean(baseCourse?.courseId) &&
    Number.isSafeInteger(candidateCourse?.lessonCount) &&
    candidateCourse.lessonCount >= 12 &&
    candidateCourse.lessonCount === baseCourse?.lessonCount;
  const producerPass =
    candidateCourse?.evidenceProducer === SCION_PAIRED_EVIDENCE_PRODUCER &&
    baseCourse?.evidenceProducer === SCION_PAIRED_EVIDENCE_PRODUCER &&
    SHA256.test(clean(candidateCourse?.artifactReceiptSha256)) &&
    SHA256.test(clean(baseCourse?.artifactReceiptSha256));
  const baseIdentityPass =
    candidateCourse?.baseRevision === manifest?.base?.revision &&
    baseCourse?.baseRevision === manifest?.base?.revision &&
    baseCourse?.adapterActive === false &&
    baseCourse?.adapterId == null &&
    baseCourse?.adapterPackageIdentitySha256 == null;
  const expectedScale = Number.isFinite(Number(manifest?.adapter?.scale)) ? Number(manifest.adapter.scale) : 1;
  const scalePass = Number(candidateCourse?.adapterScale) === expectedScale && Number(baseCourse?.adapterScale) === 0;
  return {
    pass: contractShapePass && sharedValuesMatch && courseIdentityPass && producerPass && baseIdentityPass && scalePass,
    pairId: clean(candidate.pairId) || null,
    contractShapePass,
    sharedValuesMatch,
    courseIdentityPass,
    producerPass,
    baseIdentityPass,
    scalePass,
    compilerCommit: clean(candidate.compilerCommit) || null,
    baseContractSha256: clean(candidate.baseContractSha256) || null,
  };
}

function evidencePasses(manifest, type, verifiedExternalEvidence = {}) {
  return (manifest?.promotion?.evidence || []).some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      entry.type === type &&
      entry.status === 'pass' &&
      /^[a-f0-9]{64}$/.test(String(entry.sha256 || '')) &&
      verifiedExternalEvidence[type] === true,
  );
}

const BROWSER_DEVICE_PROTOCOL_PATH = path.resolve('evaluation/scion-adapters/browser-device-matrix-protocol-v1.json');

export async function verifyExternalEvidenceFiles(manifest, { adapterPackageIdentitySha256 } = {}) {
  const packageIdentitySha256 = adapterPackageIdentitySha256 || computeScionAdapterPackageIdentity(manifest).sha256;
  const details = {};
  for (const type of REQUIRED_EXTERNAL_EVIDENCE) {
    const entry = (manifest?.promotion?.evidence || []).find((candidate) => candidate?.type === type);
    const declaredPath = String(entry?.path || '').trim();
    if (!entry || entry.status !== 'pass' || !declaredPath || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      details[type] = { verified: false, reason: 'missing-or-invalid-attestation' };
      continue;
    }
    try {
      const absolutePath = path.resolve(declaredPath);
      const stats = await fs.lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('evidence must be a regular file');
      const actualSha256 = await sha256File(absolutePath);
      let semanticAudit = null;
      if (actualSha256 === entry.sha256 && type === 'browser-device-matrix') {
        const [evidence, protocol, protocolSha256] = await Promise.all([
          fs.readFile(absolutePath, 'utf8').then(JSON.parse),
          fs.readFile(BROWSER_DEVICE_PROTOCOL_PATH, 'utf8').then(JSON.parse),
          sha256File(BROWSER_DEVICE_PROTOCOL_PATH),
        ]);
        semanticAudit = await auditScionBrowserDeviceMatrix({
          protocol,
          protocolSha256,
          evidence,
          evidencePath: absolutePath,
          adapterManifest: manifest,
        });
      } else if (actualSha256 === entry.sha256 && type === 'single-model-judge') {
        const evidence = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
        semanticAudit = await auditScionAdapterSingleModelJudgeEvidence({
          root: process.cwd(),
          evidencePath: absolutePath,
          evidence,
          adapterManifest: manifest,
          adapterPackageIdentitySha256: packageIdentitySha256,
        });
      } else if (actualSha256 === entry.sha256 && type === 'factual-canaries') {
        const evidence = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
        semanticAudit = await auditScionAdapterFactualCanaryEvidence({
          root: process.cwd(),
          evidencePath: absolutePath,
          evidence,
          adapterManifest: manifest,
          adapterPackageIdentitySha256: packageIdentitySha256,
        });
      } else if (actualSha256 === entry.sha256 && type === 'production-canaries') {
        const evidence = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
        semanticAudit = await auditScionAdapterProductionCanaryEvidence({
          root: process.cwd(),
          evidencePath: absolutePath,
          evidence,
          adapterManifest: manifest,
          adapterPackageIdentitySha256: packageIdentitySha256,
        });
      }
      const semanticVerified = semanticAudit == null || semanticAudit.status === 'pass';
      details[type] = {
        verified: actualSha256 === entry.sha256 && semanticVerified,
        path: declaredPath,
        expectedSha256: entry.sha256,
        actualSha256,
        ...(semanticAudit ? { semanticAudit } : {}),
        ...(actualSha256 !== entry.sha256
          ? { reason: 'sha256-mismatch' }
          : semanticVerified
            ? {}
            : { reason: 'semantic-audit-failed' }),
      };
    } catch (error) {
      details[type] = { verified: false, path: declaredPath, reason: String(error?.message || error) };
    }
  }
  return details;
}

export function assessScionAdapterPromotion({
  manifest,
  adapterPackageIdentitySha256,
  candidateEvidence = [],
  baseEvidence = [],
  minimumDomains = 5,
  verifiedExternalEvidence = {},
} = {}) {
  const packageIdentitySha256 = adapterPackageIdentitySha256 || computeScionAdapterPackageIdentity(manifest).sha256;
  const manifestValidation = validateScionAdapterManifest(manifest);
  const candidate = groupByDomain(flattenCourses(candidateEvidence));
  const base = groupByDomain(flattenCourses(baseEvidence));
  const candidateDomains = [...candidate.keys()].sort();
  const baseDomains = [...base.keys()].sort();
  const domains = [...candidate.keys()].filter((domain) => base.has(domain)).sort();
  const unmatchedCandidateDomains = candidateDomains.filter((domain) => !base.has(domain));
  const unmatchedBaseDomains = baseDomains.filter((domain) => !candidate.has(domain));
  const courseChecks = domains.map((domain) => {
    const candidateCourses = candidate.get(domain) || [];
    const baseCourses = base.get(domain) || [];
    const uniqueEvidencePass = candidateCourses.length === 1 && baseCourses.length === 1;
    const candidateCourse = candidateCourses[0];
    const baseCourse = baseCourses[0];
    const candidateCalls = Number(candidateCourse?.scionPassCalls);
    const baseCalls = Number(baseCourse?.scionPassCalls);
    const candidateGrade = Number(candidateCourse?.packageGrade);
    const baseGrade = Number(baseCourse?.packageGrade);
    const candidateP2 = Number(candidateCourse?.p2);
    const baseP2 = Number(baseCourse?.p2);
    const adapterIdentityPass =
      candidateCourse?.adapterActive === true &&
      candidateCourse?.adapterId === manifest?.adapter?.id &&
      candidateCourse?.adapterPackageIdentitySha256 === packageIdentitySha256 &&
      candidateCourse?.baseRevision === manifest?.base?.revision;
    const pairing = assessPairingContract({ candidateCourse, baseCourse, manifest });
    const qualityPass =
      candidateCourse?.packageValid === true &&
      candidateGrade >= 99 &&
      Number(candidateCourse?.p0) === 0 &&
      Number(candidateCourse?.p1) === 0 &&
      Number.isFinite(candidateP2);
    const baseComparable =
      baseCourse?.packageValid === true &&
      Number.isFinite(baseGrade) &&
      Number(baseCourse?.p0) === 0 &&
      Number(baseCourse?.p1) === 0 &&
      Number.isFinite(baseP2);
    const qualityNonRegression = qualityPass && baseComparable && candidateGrade >= baseGrade && candidateP2 <= baseP2;
    const callCeilingPass =
      Number.isFinite(candidateCalls) && Number.isFinite(baseCalls) && candidateCalls <= Math.max(1, baseCalls * 1.05);
    return {
      domain,
      pass:
        uniqueEvidencePass &&
        adapterIdentityPass &&
        pairing.pass &&
        qualityPass &&
        baseComparable &&
        qualityNonRegression &&
        callCeilingPass,
      candidateEvidenceCount: candidateCourses.length,
      baseEvidenceCount: baseCourses.length,
      uniqueEvidencePass,
      adapterIdentityPass,
      pairingPass: pairing.pass,
      pairing,
      qualityPass,
      baseComparable,
      qualityNonRegression,
      candidateGrade,
      baseGrade,
      candidateP2,
      baseP2,
      callCeilingPass,
      candidateCalls,
      baseCalls,
      callRatio: baseCalls > 0 ? Number((candidateCalls / baseCalls).toFixed(3)) : null,
    };
  });
  const pairIds = courseChecks.map((entry) => entry.pairing.pairId).filter(Boolean);
  const uniquePairIds = new Set(pairIds).size === pairIds.length;
  const candidateMedian = median(courseChecks.map((entry) => entry.candidateCalls));
  const baseMedian = median(courseChecks.map((entry) => entry.baseCalls));
  const medianReduction =
    Number.isFinite(candidateMedian) && Number.isFinite(baseMedian) && baseMedian > 0
      ? 1 - candidateMedian / baseMedian
      : null;
  const externalEvidence = Object.fromEntries(
    REQUIRED_EXTERNAL_EVIDENCE.map((type) => [type, evidencePasses(manifest, type, verifiedExternalEvidence)]),
  );
  const gates = {
    manifest: manifestValidation.valid,
    dataset:
      manifest?.training?.datasetStatus === 'ready' &&
      Number(manifest?.training?.pairCount) >= 3000 &&
      Number(manifest?.training?.domainCount) >= 5,
    matchedDomains: domains.length >= minimumDomains,
    pairedEvidence:
      courseChecks.length >= minimumDomains &&
      courseChecks.every((entry) => entry.uniqueEvidencePass && entry.pairingPass) &&
      uniquePairIds &&
      unmatchedCandidateDomains.length === 0 &&
      unmatchedBaseDomains.length === 0,
    courseQuality: courseChecks.length >= minimumDomains && courseChecks.every((entry) => entry.pass),
    medianEfficiency: medianReduction !== null && medianReduction >= 0.2,
    ...Object.fromEntries(Object.entries(externalEvidence).map(([key, value]) => [`evidence:${key}`, value])),
  };
  const failedGates = Object.entries(gates)
    .filter(([, passed]) => !passed)
    .map(([gate]) => gate);
  return {
    status: failedGates.length === 0 ? 'pass' : 'blocked',
    promotable: failedGates.length === 0,
    adapterId: manifest?.adapter?.id || null,
    base: manifest?.base || null,
    domains,
    courseChecks,
    pairing: { pairIds, uniquePairIds, unmatchedCandidateDomains, unmatchedBaseDomains },
    efficiency: { candidateMedian, baseMedian, medianReduction },
    externalEvidence,
    gates,
    failedGates,
    manifestIssues: manifestValidation.issues,
  };
}

async function readJsonFiles(paths) {
  return Promise.all(paths.map((file) => fs.readFile(file, 'utf8').then(JSON.parse)));
}

function renderMarkdown(report) {
  const externalEvidenceRows = Object.entries(report.externalEvidenceVerification || {}).map(([type, result]) => {
    const semanticStatus = result.semanticAudit?.status || (result.verified ? 'hash-bound' : 'not-verified');
    const detail = result.semanticAudit?.issues?.join('; ') || result.reason || '';
    return `| ${type} | ${result.verified ? 'PASS' : 'FAIL'} | ${semanticStatus} | ${detail} |`;
  });
  return [
    '# Scion Adapter Promotion Audit',
    '',
    `Status: ${report.status}`,
    `Adapter: ${report.adapterId || 'unknown'}`,
    `Matched domains: ${report.domains.length}`,
    `Median call reduction: ${report.efficiency.medianReduction === null ? 'not measured' : `${(report.efficiency.medianReduction * 100).toFixed(1)}%`}`,
    '',
    '## Gates',
    '',
    ...Object.entries(report.gates).map(([gate, passed]) => `- ${passed ? 'PASS' : 'FAIL'} — ${gate}`),
    '',
    '## External evidence',
    '',
    '| Type | Verified | Semantic status | Detail |',
    '| --- | --- | --- | --- |',
    ...externalEvidenceRows,
    '',
    '| Domain | Pass | Pairing | Candidate calls | Base calls | Ratio |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...report.courseChecks.map(
      (entry) =>
        `| ${entry.domain} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.pairingPass ? 'PASS' : 'FAIL'} | ${entry.candidateCalls} | ${entry.baseCalls} | ${entry.callRatio ?? ''} |`,
    ),
    '',
  ].join('\n');
}

export async function runScionAdapterPromotionAudit({
  manifestPath,
  candidatePaths = [],
  basePaths = [],
  minimumDomains = 5,
  outputDir = 'verification-output/scion-adapter-promotion',
} = {}) {
  if (!manifestPath) throw new Error('manifestPath is required');
  if (candidatePaths.length === 0 || basePaths.length === 0)
    throw new Error('candidate and base evidence are required');
  const [manifest, candidateEvidence, baseEvidence] = await Promise.all([
    fs.readFile(manifestPath, 'utf8').then(JSON.parse),
    readJsonFiles(candidatePaths),
    readJsonFiles(basePaths),
  ]);
  const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(manifest).sha256;
  const externalEvidenceVerification = await verifyExternalEvidenceFiles(manifest, {
    adapterPackageIdentitySha256,
  });
  const report = assessScionAdapterPromotion({
    manifest,
    adapterPackageIdentitySha256,
    candidateEvidence,
    baseEvidence,
    minimumDomains,
    verifiedExternalEvidence: Object.fromEntries(
      Object.entries(externalEvidenceVerification).map(([type, result]) => [type, result.verified === true]),
    ),
  });
  report.externalEvidenceVerification = externalEvidenceVerification;
  report.generatedAt = new Date().toISOString();
  report.inputs = { manifestPath, candidatePaths, basePaths, minimumDomains };
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`),
  ]);
  return report;
}

function parseArgs(argv) {
  const args = {
    candidatePaths: [],
    basePaths: [],
    minimumDomains: 5,
    outputDir: 'verification-output/scion-adapter-promotion',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifestPath = argv[++index];
    else if (arg === '--candidate') args.candidatePaths.push(argv[++index]);
    else if (arg === '--base') args.basePaths.push(argv[++index]);
    else if (arg === '--minimum-domains') args.minimumDomains = Number(argv[++index]);
    else if (arg === '--output') args.outputDir = argv[++index];
  }
  return args;
}

async function main() {
  const report = await runScionAdapterPromotionAudit(parseArgs(process.argv.slice(2)));
  console.log(`Scion adapter promotion: ${report.status}`);
  console.log(`Failed gates: ${report.failedGates.join(', ') || 'none'}`);
  if (!report.promotable) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
