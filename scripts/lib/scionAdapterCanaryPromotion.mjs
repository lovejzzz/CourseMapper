import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import { buildProductionCanarySummary, evaluateCanaryRun } from '../productionCanaryAudit.mjs';
import { loadFactualCanaryPacket, scoreFactualCanaries } from '../scionFactualCanaryAudit.mjs';
import { sha256File } from '../scionAdapterPackage.mjs';
import { computeScionAdapterPackageIdentity } from './scionBrowserDeviceMatrix.mjs';

export const SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL = 'scion-adapter-factual-canary-promotion-v1';
export const SCION_ADAPTER_FACTUAL_RUN_PROTOCOL = 'scion-adapter-factual-canary-run-v1';
export const SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL = 'scion-adapter-production-canary-promotion-v1';
export const SCION_ADAPTER_RUNTIME_RECEIPT_PROTOCOL = 'scion-adapter-runtime-receipt-v1';
export const SCION_ADAPTER_FACTUAL_STOPPING_RULE =
  'Run exactly two cold and two source-grounded trials before inspecting any result.';
export const SCION_ADAPTER_PRODUCTION_STOPPING_RULE =
  'Retain exactly three predeclared live browser runs across at least two domains; every run must pass.';
export const SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY =
  'This evidence proves exact-answer factual screening for one exact browser adapter on the frozen source-anchored packet. It does not prove full-course quality, paid-model parity, or classroom validity.';
export const SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY =
  'This evidence proves recent retained live-browser packages for one exact adapter across the declared production-canary scope. It does not prove general model superiority, paid-model parity, or classroom validity.';

export const SCION_ADAPTER_FACTUAL_CANONICAL_PATHS = Object.freeze({
  canaryManifest: 'evaluation/scion-factual-canaries.json',
  modelRegistry: 'evaluation/scion-model-candidates.json',
});

export const SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS = Object.freeze({
  policy: 'evaluation/scion-adapters/production-canary-promotion-policy-v1.json',
  auditImplementation: 'scripts/productionCanaryAudit.mjs',
});

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RUN_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/;
const REQUIRED_MODES = Object.freeze(['cold', 'source-grounded']);

function clean(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values)];
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function validIso(value) {
  return ISO_DATE.test(clean(value)) && Number.isFinite(Date.parse(value));
}

function safeRelativePath(value) {
  const normalized = clean(value).replaceAll('\\', '/');
  return (
    Boolean(normalized) &&
    !path.isAbsolute(normalized) &&
    !/^[a-z]:\//i.test(normalized) &&
    normalized.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

async function resolveRegularFile(root, relativePath) {
  const declared = clean(relativePath).replaceAll('\\', '/');
  if (!safeRelativePath(declared)) throw new Error(`unsafe-relative-path:${declared || '<missing>'}`);
  const [realRoot, absolutePath] = await Promise.all([
    fs.realpath(root),
    Promise.resolve(path.resolve(root, declared)),
  ]);
  const stats = await fs.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`not-regular-file:${declared}`);
  const realFile = await fs.realpath(absolutePath);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`path-escapes-root:${declared}`);
  }
  return absolutePath;
}

async function loadCanonicalBindings(root, paths) {
  const rows = {};
  for (const [key, relativePath] of Object.entries(paths)) {
    const absolutePath = await resolveRegularFile(root, relativePath);
    rows[key] = { path: relativePath, absolutePath, sha256: await sha256File(absolutePath) };
  }
  return rows;
}

function canonicalBindingIssues(evidence, canonical) {
  const issues = [];
  for (const [key, row] of Object.entries(canonical)) {
    const binding = evidence?.canonical?.[key];
    if (binding?.path !== row.path || binding?.sha256 !== row.sha256) {
      issues.push(`canonical-${key}-binding-mismatch`);
    }
  }
  return issues;
}

function adapterBindingIssues(evidence, adapterManifest, adapterPackageIdentitySha256) {
  const expectedScale = Number(adapterManifest?.adapter?.scale ?? 1);
  const issues = [];
  if (
    evidence?.adapter?.id !== adapterManifest?.adapter?.id ||
    evidence?.adapter?.packageIdentitySha256 !== adapterPackageIdentitySha256 ||
    evidence?.adapter?.baseModelId !== adapterManifest?.base?.modelId ||
    evidence?.adapter?.baseRevision !== adapterManifest?.base?.revision ||
    Number(evidence?.adapter?.scale) !== expectedScale
  ) {
    issues.push('adapter-binding-mismatch');
  }
  return issues;
}

function runtimeIdentityIssues(runtime, adapterManifest, adapterPackageIdentitySha256, prefix = 'runtime') {
  const issues = [];
  const expectedScale = Number(adapterManifest?.adapter?.scale ?? 1);
  if (runtime?.providerFamily !== 'public-scion') issues.push(`${prefix}:provider-family`);
  if (runtime?.runtimeId !== 'scion-wllama-webgpu-jspi-v1') issues.push(`${prefix}:runtime-id`);
  if (runtime?.modelId !== adapterManifest?.base?.modelId) issues.push(`${prefix}:base-model-id`);
  if (runtime?.baseRevision !== adapterManifest?.base?.revision) issues.push(`${prefix}:base-revision`);
  if (runtime?.adapterActive !== true || runtime?.nativeAdapterActive !== true) {
    issues.push(`${prefix}:adapter-not-active`);
  }
  if (runtime?.adapterId !== adapterManifest?.adapter?.id) issues.push(`${prefix}:adapter-id`);
  if (runtime?.adapterPackageIdentitySha256 !== adapterPackageIdentitySha256) {
    issues.push(`${prefix}:adapter-package-identity`);
  }
  if (Number(runtime?.adapterScale) !== expectedScale) issues.push(`${prefix}:adapter-scale`);
  if (runtime?.manifestVerified !== true || runtime?.packageIdentityVerified !== true) {
    issues.push(`${prefix}:identity-not-verified`);
  }
  if (
    runtime?.nativeMetadata?.generalType !== 'adapter' ||
    runtime?.nativeMetadata?.adapterType !== 'lora' ||
    runtime?.nativeMetadata?.architecture !== 'gemma4'
  ) {
    issues.push(`${prefix}:native-metadata`);
  }
  return issues;
}

function normalizeOption(value) {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function factualPolicyIssues(registry, packet) {
  const policy = registry?.screeningPolicy || {};
  const issues = [];
  if (policy.requiredColdRuns !== 2) issues.push('canonical-policy:required-cold-runs');
  if (policy.requiredGroundedRuns !== 2) issues.push('canonical-policy:required-grounded-runs');
  if (policy.requiredCasesPerRun !== 25 || packet?.cases?.length !== 25) {
    issues.push('canonical-policy:required-case-count');
  }
  if (policy.minimumColdCorrect < 23) issues.push('canonical-policy:cold-floor-too-low');
  if (policy.minimumGroundedCorrect !== 25) issues.push('canonical-policy:grounded-floor');
  if (policy.requireValidShape !== true || policy.requireSingleManifest !== true) {
    issues.push('canonical-policy:fail-closed-flags');
  }
  if (
    Object.keys(packet?.domainCounts || {}).length !== 5 ||
    Object.values(packet?.domainCounts || {}).some((n) => n !== 5)
  ) {
    issues.push('canonical-packet:domain-coverage');
  }
  return issues;
}

function factualRunIssues({ run, binding, packet, packetSha256, policy, adapterManifest, packageIdentity }) {
  const prefix = `run:${clean(binding?.id) || '?'}`;
  const issues = [];
  if (run?.schemaVersion !== 1 || run?.protocolVersion !== SCION_ADAPTER_FACTUAL_RUN_PROTOCOL) {
    issues.push(`${prefix}:protocol`);
  }
  if (!RUN_ID.test(clean(run?.runId)) || run?.runId !== binding?.id) issues.push(`${prefix}:run-id`);
  if (!REQUIRED_MODES.includes(run?.mode) || run?.mode !== binding?.mode) issues.push(`${prefix}:mode`);
  if (!validIso(run?.observedAt)) issues.push(`${prefix}:observed-at`);
  if (run?.canaryPacketSha256 !== packetSha256) issues.push(`${prefix}:packet-sha256`);
  if (run?.request?.caseCount !== policy.requiredCasesPerRun || run?.request?.batchSize !== 1) {
    issues.push(`${prefix}:request-shape`);
  }
  if (
    run?.request?.totalRequests !== policy.requiredCasesPerRun ||
    run?.request?.successfulRequests !== policy.requiredCasesPerRun
  ) {
    issues.push(`${prefix}:request-completeness`);
  }
  issues.push(...runtimeIdentityIssues(run?.runtime, adapterManifest, packageIdentity, `${prefix}:runtime`));
  const answers = run?.response?.answers;
  const rawAnswers = run?.response?.rawAnswers;
  if (!Array.isArray(rawAnswers) || rawAnswers.length !== packet.cases.length) {
    issues.push(`${prefix}:raw-answer-shape`);
  } else if (
    rawAnswers.some((answer, index) => {
      const normalized = normalizeOption(answer);
      const optionIndex = packet.cases[index].options.findIndex((option) => normalizeOption(option) === normalized);
      return optionIndex !== Number(answers?.[index]);
    })
  ) {
    issues.push(`${prefix}:raw-answer-index-mismatch`);
  }
  const report = scoreFactualCanaries(packet, answers, { label: run?.runId || 'candidate', mode: run?.mode });
  const requiredCorrect = run?.mode === 'cold' ? policy.minimumColdCorrect : policy.minimumGroundedCorrect;
  if (!report.validShape) issues.push(`${prefix}:answer-shape`);
  if (report.correct < requiredCorrect) issues.push(`${prefix}:factual-floor`);
  if (run?.mode === 'source-grounded' && Object.values(report.byDomain).some((row) => row.share !== 1)) {
    issues.push(`${prefix}:grounded-domain-floor`);
  }
  return { issues, report };
}

export async function auditScionAdapterFactualCanaryEvidence({
  root = process.cwd(),
  evidencePath,
  evidence,
  adapterManifest,
  adapterPackageIdentitySha256,
} = {}) {
  const issues = [];
  const computedIdentity = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  if (!SHA256.test(clean(adapterPackageIdentitySha256))) issues.push('adapter-package-identity-sha256-missing');
  if (clean(adapterPackageIdentitySha256) !== computedIdentity) {
    issues.push('adapter-package-identity-sha256-mismatch');
  }
  if (evidence?.schemaVersion !== 1) issues.push('evidence-schema-version');
  if (evidence?.protocolVersion !== SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL) issues.push('evidence-protocol-version');
  if (evidence?.claimBoundary !== SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY) issues.push('claim-boundary');
  if (
    evidence?.campaign?.status !== 'complete' ||
    evidence?.campaign?.stoppingRule !== SCION_ADAPTER_FACTUAL_STOPPING_RULE ||
    !validIso(evidence?.campaign?.startedAt) ||
    !validIso(evidence?.campaign?.completedAt) ||
    Date.parse(evidence?.campaign?.startedAt) > Date.parse(evidence?.campaign?.completedAt)
  ) {
    issues.push('campaign-contract');
  }
  issues.push(...adapterBindingIssues(evidence, adapterManifest, adapterPackageIdentitySha256));
  const canonical = await loadCanonicalBindings(path.resolve(root), SCION_ADAPTER_FACTUAL_CANONICAL_PATHS);
  issues.push(...canonicalBindingIssues(evidence, canonical));
  const [packet, registry] = await Promise.all([
    loadFactualCanaryPacket(canonical.canaryManifest.absolutePath),
    fs.readFile(canonical.modelRegistry.absolutePath, 'utf8').then(JSON.parse),
  ]);
  const packetSha256 = sha256Text(JSON.stringify(packet));
  issues.push(...factualPolicyIssues(registry, packet));
  if (evidence?.canaryPacketSha256 !== packetSha256) issues.push('canary-packet-sha256-mismatch');
  const policy = registry.screeningPolicy || {};
  const bindings = Array.isArray(evidence?.runs) ? evidence.runs : [];
  if (bindings.length !== policy.requiredColdRuns + policy.requiredGroundedRuns) issues.push('exact-run-count');
  if (new Set(bindings.map((row) => clean(row?.id))).size !== bindings.length) issues.push('duplicate-run-id');
  if (new Set(bindings.map((row) => clean(row?.sha256))).size !== bindings.length)
    issues.push('duplicate-run-artifact');
  for (const mode of REQUIRED_MODES) {
    const expected = mode === 'cold' ? policy.requiredColdRuns : policy.requiredGroundedRuns;
    if (bindings.filter((row) => row?.mode === mode).length !== expected) issues.push(`mode-count:${mode}`);
  }
  const evidenceDirectory = path.dirname(path.resolve(evidencePath || root));
  const runs = [];
  for (const binding of bindings) {
    try {
      const absolutePath = await resolveRegularFile(evidenceDirectory, binding?.path);
      const actualSha256 = await sha256File(absolutePath);
      if (!SHA256.test(clean(binding?.sha256)) || actualSha256 !== binding.sha256) {
        issues.push(`run:${clean(binding?.id) || '?'}:sha256-mismatch`);
        continue;
      }
      const run = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
      const result = factualRunIssues({
        run,
        binding,
        packet,
        packetSha256,
        policy,
        adapterManifest,
        packageIdentity: adapterPackageIdentitySha256,
      });
      issues.push(...result.issues);
      if (
        validIso(run?.observedAt) &&
        (Date.parse(run.observedAt) < Date.parse(evidence?.campaign?.startedAt) ||
          Date.parse(run.observedAt) > Date.parse(evidence?.campaign?.completedAt))
      ) {
        issues.push(`run:${clean(binding?.id) || '?'}:outside-campaign-window`);
      }
      runs.push({
        id: binding.id,
        mode: binding.mode,
        path: binding.path,
        sha256: actualSha256,
        report: result.report,
      });
    } catch (error) {
      issues.push(`run:${clean(binding?.id) || '?'}:unavailable:${clean(error?.message || error)}`);
    }
  }
  const uniqueIssues = unique(issues);
  return {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL,
    status: uniqueIssues.length === 0 ? 'pass' : 'blocked',
    promotionEligible: uniqueIssues.length === 0,
    claimBoundary: SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY,
    adapterId: adapterManifest?.adapter?.id || null,
    adapterPackageIdentitySha256: adapterPackageIdentitySha256 || null,
    canaryPacketSha256: packetSha256,
    runs,
    issues: uniqueIssues,
  };
}

async function verifyProductionArtifacts(run, evidenceDirectory) {
  const rows = [];
  for (const key of ['zip', 'trace', 'consoleLog', 'runtimeReceipt']) {
    const binding = run?.evidence?.artifacts?.[key] || {};
    try {
      const absolutePath = await resolveRegularFile(evidenceDirectory, binding.path);
      const actualSha256 = await sha256File(absolutePath);
      rows.push({ key, path: binding.path, absolutePath, expectedSha256: binding.sha256, actualSha256 });
    } catch (error) {
      rows.push({
        key,
        path: binding.path || '',
        expectedSha256: binding.sha256 || '',
        error: clean(error?.message || error),
      });
    }
  }
  return {
    rows,
    allMatch: rows.every((row) => SHA256.test(clean(row.expectedSha256)) && row.actualSha256 === row.expectedSha256),
  };
}

async function inspectProductionPackage(zipPath) {
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const manifestFile = zip.file('PACKAGE_MANIFEST.json');
  if (!manifestFile) throw new Error('package-manifest-missing');
  const manifest = JSON.parse(await manifestFile.async('string'));
  return { fileCount: files.length, manifest };
}

function productionRunIdentityIssues({ run, receipt, trace, adapterManifest, packageIdentity, policy, now }) {
  const prefix = `run:${clean(run?.runId) || '?'}`;
  const issues = [];
  if (run?.app?.version !== adapterManifest?.adapter?.scionVersion) issues.push(`${prefix}:app-version`);
  if (!COMMIT.test(clean(run?.app?.commit)) || run?.app?.dirtyTree !== false)
    issues.push(`${prefix}:compiler-identity`);
  if (Number(run?.course?.lessonCount) < Number(policy.minimumLessonsPerCourse)) issues.push(`${prefix}:lesson-count`);
  if (Number(run?.quality?.p2) > Number(policy.maximumP2Findings)) issues.push(`${prefix}:p2-threshold`);
  if (Date.parse(run?.generatedAt) > now.getTime()) issues.push(`${prefix}:future-run`);
  if (
    !validIso(run?.evidence?.visualQa?.reviewedAt) ||
    run?.evidence?.visualQa?.reviewerClass !== 'codex' ||
    Date.parse(run.evidence.visualQa.reviewedAt) < Date.parse(run?.generatedAt) ||
    Date.parse(run.evidence.visualQa.reviewedAt) > now.getTime()
  ) {
    issues.push(`${prefix}:visual-qa-provenance`);
  }
  issues.push(...runtimeIdentityIssues(run?.runtime, adapterManifest, packageIdentity, `${prefix}:runtime`));
  if (receipt?.schemaVersion !== 1 || receipt?.protocolVersion !== SCION_ADAPTER_RUNTIME_RECEIPT_PROTOCOL) {
    issues.push(`${prefix}:runtime-receipt-protocol`);
  }
  if (receipt?.runId !== run?.runId || !validIso(receipt?.capturedAt)) issues.push(`${prefix}:runtime-receipt-run`);
  issues.push(
    ...runtimeIdentityIssues(receipt?.runtime, adapterManifest, packageIdentity, `${prefix}:receipt-runtime`),
  );
  if (
    receipt?.artifacts?.packageSha256 !== run?.package?.sha256 ||
    receipt?.artifacts?.traceSha256 !== run?.evidence?.traceSha256 ||
    receipt?.artifacts?.consoleLogSha256 !== run?.evidence?.consoleLogSha256
  ) {
    issues.push(`${prefix}:runtime-receipt-artifact-binding`);
  }
  if (
    trace?.runId !== run?.traceRunId ||
    trace?.appVersion !== run?.app?.version ||
    trace?.gates?.finalStatus !== 'ready' ||
    trace?.gates?.exportStatus !== 'passed' ||
    Number(trace?.gates?.qualityScore) !== Number(run?.quality?.score) ||
    Number(trace?.gates?.qualityP0) !== Number(run?.quality?.p0) ||
    Number(trace?.gates?.qualityP1) !== Number(run?.quality?.p1) ||
    Number(trace?.gates?.qualityP2) !== Number(run?.quality?.p2)
  ) {
    issues.push(`${prefix}:trace-semantic-binding`);
  }
  return issues;
}

export async function auditScionAdapterProductionCanaryEvidence({
  root = process.cwd(),
  evidencePath,
  evidence,
  adapterManifest,
  adapterPackageIdentitySha256,
  now = new Date(),
} = {}) {
  const issues = [];
  const computedIdentity = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  if (!SHA256.test(clean(adapterPackageIdentitySha256))) issues.push('adapter-package-identity-sha256-missing');
  if (clean(adapterPackageIdentitySha256) !== computedIdentity) {
    issues.push('adapter-package-identity-sha256-mismatch');
  }
  if (evidence?.schemaVersion !== 1) issues.push('evidence-schema-version');
  if (evidence?.protocolVersion !== SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL) {
    issues.push('evidence-protocol-version');
  }
  if (evidence?.claimBoundary !== SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY) issues.push('claim-boundary');
  if (
    evidence?.campaign?.status !== 'complete' ||
    evidence?.campaign?.stoppingRule !== SCION_ADAPTER_PRODUCTION_STOPPING_RULE ||
    !validIso(evidence?.campaign?.startedAt) ||
    !validIso(evidence?.campaign?.completedAt) ||
    Date.parse(evidence?.campaign?.startedAt) > Date.parse(evidence?.campaign?.completedAt)
  ) {
    issues.push('campaign-contract');
  }
  issues.push(...adapterBindingIssues(evidence, adapterManifest, adapterPackageIdentitySha256));
  const canonical = await loadCanonicalBindings(path.resolve(root), SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS);
  issues.push(...canonicalBindingIssues(evidence, canonical));
  const policy = JSON.parse(await fs.readFile(canonical.policy.absolutePath, 'utf8'));
  if (
    policy?.schemaVersion !== 1 ||
    policy?.protocolVersion !== SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL ||
    policy?.minimumCompletedRuns !== 3 ||
    policy?.minimumDomains < 2 ||
    policy?.minimumQualityScore < 99 ||
    policy?.maximumP0Findings !== 0 ||
    policy?.maximumP1Findings !== 0 ||
    policy?.maximumP2Findings !== 0 ||
    policy?.minimumLessonsPerCourse < 12 ||
    !policy?.requiredProviderFamilies?.includes('public-scion')
  ) {
    issues.push('canonical-policy-contract');
  }
  const bindings = Array.isArray(evidence?.runs) ? evidence.runs : [];
  if (bindings.length !== policy.minimumCompletedRuns) issues.push('exact-run-count');
  if (new Set(bindings.map((row) => clean(row?.id))).size !== bindings.length) issues.push('duplicate-run-id');
  if (new Set(bindings.map((row) => clean(row?.sha256))).size !== bindings.length)
    issues.push('duplicate-run-artifact');
  const evidenceDirectory = path.dirname(path.resolve(evidencePath || root));
  const runs = [];
  for (const binding of bindings) {
    try {
      const runPath = await resolveRegularFile(evidenceDirectory, binding?.path);
      const actualSha256 = await sha256File(runPath);
      if (!SHA256.test(clean(binding?.sha256)) || actualSha256 !== binding.sha256) {
        issues.push(`run:${clean(binding?.id) || '?'}:sha256-mismatch`);
        continue;
      }
      const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
      if (!RUN_ID.test(clean(run?.runId)) || run?.runId !== binding?.id)
        issues.push(`run:${binding?.id || '?'}:run-id`);
      if (
        validIso(run?.generatedAt) &&
        (Date.parse(run.generatedAt) < Date.parse(evidence?.campaign?.startedAt) ||
          Date.parse(run.generatedAt) > Date.parse(evidence?.campaign?.completedAt))
      ) {
        issues.push(`run:${binding?.id || '?'}:outside-campaign-window`);
      }
      const artifactAudit = await verifyProductionArtifacts(run, evidenceDirectory);
      if (!artifactAudit.allMatch) issues.push(`run:${binding?.id || '?'}:artifact-integrity`);
      const artifactByKey = Object.fromEntries(artifactAudit.rows.map((row) => [row.key, row]));
      if (
        artifactByKey.zip?.actualSha256 !== run?.package?.sha256 ||
        artifactByKey.trace?.actualSha256 !== run?.evidence?.traceSha256 ||
        artifactByKey.consoleLog?.actualSha256 !== run?.evidence?.consoleLogSha256 ||
        artifactByKey.runtimeReceipt?.actualSha256 !== run?.evidence?.runtimeReceiptSha256
      ) {
        issues.push(`run:${binding?.id || '?'}:artifact-cross-binding`);
      }
      let receipt = null;
      let trace = null;
      let packageInspection = null;
      try {
        receipt = JSON.parse(await fs.readFile(artifactByKey.runtimeReceipt.absolutePath, 'utf8'));
        trace = JSON.parse(await fs.readFile(artifactByKey.trace.absolutePath, 'utf8'));
        packageInspection = await inspectProductionPackage(artifactByKey.zip.absolutePath);
      } catch {
        issues.push(`run:${binding?.id || '?'}:semantic-artifact-unreadable`);
      }
      if (
        packageInspection?.fileCount !== Number(run?.package?.fileCount) ||
        packageInspection?.manifest?.appVersion !== run?.app?.version ||
        packageInspection?.manifest?.readiness?.status !== 'ready' ||
        Number(packageInspection?.manifest?.readiness?.blockers) !== 0 ||
        Number(packageInspection?.manifest?.quality?.score) !== Number(run?.quality?.score) ||
        Number(packageInspection?.manifest?.quality?.findingCounts?.p0) !== Number(run?.quality?.p0) ||
        Number(packageInspection?.manifest?.quality?.findingCounts?.p1) !== Number(run?.quality?.p1) ||
        Number(packageInspection?.manifest?.quality?.findingCounts?.p2) !== Number(run?.quality?.p2)
      ) {
        issues.push(`run:${binding?.id || '?'}:package-semantic-binding`);
      }
      issues.push(
        ...productionRunIdentityIssues({
          run,
          receipt,
          trace,
          adapterManifest,
          packageIdentity: adapterPackageIdentitySha256,
          policy,
          now,
        }),
      );
      run.evidence = { ...run.evidence, artifactValidation: { allMatch: artifactAudit.allMatch } };
      const result = evaluateCanaryRun(run, policy, now);
      if (!result.releasePass) issues.push(`run:${binding?.id || '?'}:release-gates`);
      runs.push({ ...result, path: binding.path, sha256: actualSha256, artifactAudit });
    } catch (error) {
      issues.push(`run:${clean(binding?.id) || '?'}:unavailable:${clean(error?.message || error)}`);
    }
  }
  const summary = buildProductionCanarySummary(runs, policy);
  if (summary.status !== 'pass') issues.push('production-summary-not-pass');
  const uniqueIssues = unique(issues);
  return {
    schemaVersion: 1,
    protocolVersion: SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL,
    status: uniqueIssues.length === 0 ? 'pass' : 'blocked',
    promotionEligible: uniqueIssues.length === 0,
    claimBoundary: SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY,
    adapterId: adapterManifest?.adapter?.id || null,
    adapterPackageIdentitySha256: adapterPackageIdentitySha256 || null,
    summary,
    runs,
    issues: uniqueIssues,
  };
}
