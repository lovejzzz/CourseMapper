#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { materializeSourceCaptureCampaign, sourceCaptureSha256 } from './lib/scionSourceCapture.mjs';
import { scionSourceKernelSha256, scionSourceTaskSha256 } from './lib/scionSourceTaskIdentity.mjs';
import { verifySourceCaptureArtifacts } from './scionSourceCapture.mjs';

const CAMPAIGN = 'evaluation/scion-source-capture-preference-expansion-v0.16.47.json';
const PROJECTS = 'evaluation/scion-source-capture-preference-expansion-evidence';
const CANDIDATES = 'evaluation/scion-review-candidates.jsonl';
const EXCLUSIONS = 'evaluation/scion-adapters/evidence/prior-judged-source-rows-v0.16.47.json';
const PRIOR_JUDGE_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';
const PACKET_RECEIPT = 'evaluation/scion-adapters/evidence/source-review-packet-v0.16.47.json';
const HOLDOUT = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
const PRIOR_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41';
const CURRENT_WORKBOOK = 'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.47';
const IMPLEMENTATION = [
  'scripts/lib/scionSourceCapture.mjs',
  'scripts/lib/scionSourceTaskIdentity.mjs',
  'scripts/scionSourceCapture.mjs',
  'scripts/scionCodexTrainingPreferences.mjs',
  'scripts/scionAdapterDataset.mjs',
  'scripts/scionAdapterTrainingRun.mjs',
  'scripts/scionSourceBoundPreferenceMigration.mjs',
  'scripts/scionPreferenceExpansionJudgeCampaign.mjs',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'trellis/tendril/sModel.mjs',
];
export const SCION_PREFERENCE_EXPANSION_EVIDENCE_RECEIPT =
  'evaluation/scion-adapters/evidence/preference-expansion-evidence-v0.16.47.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

function histogram(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

async function readWorkbookReviews(root, workbook) {
  const directory = path.join(root, workbook);
  const names = (await fs.readdir(directory)).filter((name) => /^chunk-\d+-review-a-b\.json$/.test(name)).sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const raw = await fs.readFile(path.join(directory, name));
      return { path: path.join(workbook, name), bytes: raw.length, sha256: sha256(raw), value: JSON.parse(raw) };
    }),
  );
  return { files, reviews: files.flatMap((file) => file.value.reviews || []) };
}

export async function buildScionPreferenceExpansionEvidence({
  cwd = process.cwd(),
  generatedAt = '2026-07-16T21:00:00.000Z',
} = {}) {
  const root = path.resolve(cwd);
  const [campaign, packet, exclusions, priorJudgeCampaign, holdout, candidateRaw, priorWorkbook, currentWorkbook] =
    await Promise.all([
      materializeSourceCaptureCampaign({ manifestPath: CAMPAIGN, cwd: root }),
      readJson(root, PACKET_RECEIPT),
      readJson(root, EXCLUSIONS),
      readJson(root, PRIOR_JUDGE_CAMPAIGN),
      readJson(root, HOLDOUT),
      fs.readFile(path.join(root, CANDIDATES), 'utf8'),
      readWorkbookReviews(root, PRIOR_WORKBOOK),
      readWorkbookReviews(root, CURRENT_WORKBOOK),
    ]);
  const artifacts = await verifySourceCaptureArtifacts({
    campaign,
    outputDir: path.join(root, PROJECTS),
  });
  const projects = await Promise.all(
    artifacts.results.map(async (result) => ({
      ...result,
      project: await readJson(root, result.path),
    })),
  );
  const armEvidence = Object.fromEntries(
    ['local', 'reference'].map((arm) => {
      const armProjects = projects.filter((entry) => entry.arm === arm);
      const models = [
        ...new Map(
          armProjects.map(({ project }) => {
            const model = project.scionSourceCapture.model;
            return [JSON.stringify(model), model];
          }),
        ).values(),
      ];
      const rawCalls = armProjects.flatMap(
        ({ project }) =>
          project.scionSourceCapture.compilerRecovery?.rawCalls || project.scionSourceCapture.calls || [],
      );
      return [
        arm,
        {
          model: models.length === 1 ? models[0] : null,
          modelIdentityCount: models.length,
          rawCallCount: rawCalls.length,
          constraintHistogram: histogram(rawCalls.map((call) => call.receipt?.constrained || 'unknown')),
          adapterActiveHistogram: histogram(rawCalls.map((call) => String(call.receipt?.adapterActive === true))),
        },
      ];
    }),
  );
  const candidateRows = candidateRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const sourceRows = candidateRows.filter((row) => row.sourceContext);
  const excludedHashes = new Set(exclusions.sourceRowSha256);
  const freshSourceRows = sourceRows.filter((row) => !excludedHashes.has(sha256(JSON.stringify(row))));
  const freshDomainCounts = Object.fromEntries(
    [...new Set(freshSourceRows.map((row) => row.domain))]
      .sort()
      .map((domain) => [domain, freshSourceRows.filter((row) => row.domain === domain).length]),
  );
  const holdoutDomains = new Set((holdout.courses || []).map((course) => course.domain));
  const candidateSha256 = sha256(candidateRaw);
  const artifactRows = artifacts.results
    .map(({ path: projectPath, sha256: projectSha256 }) => ({ path: projectPath, sha256: projectSha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const artifactSetSha256 = sourceCaptureSha256(artifactRows);
  const implementation = await Promise.all(
    IMPLEMENTATION.map(async (implementationPath) => {
      const raw = await fs.readFile(path.join(root, implementationPath));
      return { path: implementationPath, bytes: raw.length, sha256: sha256(raw) };
    }),
  );
  const local = artifacts.burden.local;
  const reference = artifacts.burden.reference;
  const priorTaskIds = new Set(priorWorkbook.reviews.map(scionSourceTaskSha256));
  const currentTaskIds = new Set(currentWorkbook.reviews.map(scionSourceTaskSha256));
  const repeatedTaskCases = currentWorkbook.reviews.filter((review) => priorTaskIds.has(scionSourceTaskSha256(review)));
  const novelTaskCases = currentWorkbook.reviews.filter((review) => !priorTaskIds.has(scionSourceTaskSha256(review)));
  const priorKernelIds = new Set(priorWorkbook.reviews.map(scionSourceKernelSha256));
  const currentKernelIds = new Set(currentWorkbook.reviews.map(scionSourceKernelSha256));
  const repeatedKernelCases = currentWorkbook.reviews.filter((review) =>
    priorKernelIds.has(scionSourceKernelSha256(review)),
  );
  const novelKernelCases = currentWorkbook.reviews.filter(
    (review) => !priorKernelIds.has(scionSourceKernelSha256(review)),
  );
  const taskDiversity = {
    protocol: 'scion-source-task-diversity-v2',
    priorWorkbook: PRIOR_WORKBOOK,
    currentWorkbook: CURRENT_WORKBOOK,
    priorCases: priorWorkbook.reviews.length,
    currentCases: currentWorkbook.reviews.length,
    priorUniqueSourceTasks: priorTaskIds.size,
    currentUniqueSourceTasks: currentTaskIds.size,
    repeatedSourceTaskCases: repeatedTaskCases.length,
    novelSourceTaskCases: novelTaskCases.length,
    overlappingUniqueSourceTasks: [...currentTaskIds].filter((taskId) => priorTaskIds.has(taskId)).length,
    priorUniqueSourceKernels: priorKernelIds.size,
    currentUniqueSourceKernels: currentKernelIds.size,
    repeatedSourceKernelCases: repeatedKernelCases.length,
    novelSourceKernelCases: novelKernelCases.length,
    overlappingUniqueSourceKernels: [...currentKernelIds].filter((kernelId) => priorKernelIds.has(kernelId)).length,
    repeatedCasesByDomain: Object.fromEntries(
      [...new Set(repeatedTaskCases.map((review) => review.domain))]
        .sort()
        .map((domain) => [domain, repeatedTaskCases.filter((review) => review.domain === domain).length]),
    ),
    workbookFiles: {
      prior: priorWorkbook.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })),
      current: currentWorkbook.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })),
    },
    interpretation:
      'A source task is one artifact kind applied to one semantic source kernel. A source kernel is the underlying concept and claims, independent of artifact kind. The packet contains new exact model-output pairs, but most cases reuse previously judged kernels. Replicates estimate output-distribution stability; they do not count as new conceptual coverage.',
  };
  const assertions = {
    completeCapture: artifacts.status === 'pass' && artifacts.validProjects === 16 && artifacts.projects === 16,
    exactRawCalls: armEvidence.local.rawCallCount === 48 && armEvidence.reference.rawCallCount === 48,
    exactPinnedLocalBase:
      armEvidence.local.modelIdentityCount === 1 &&
      armEvidence.local.model?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      armEvidence.local.model?.revision === '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce' &&
      armEvidence.local.adapterActiveHistogram.false === 48,
    actualConstraintRecorded: armEvidence.local.constraintHistogram.schema === 48,
    partialRecoveryImprovesBothArms:
      local.compiled.admittedAtoms > local.raw.admittedAtoms &&
      reference.compiled.admittedAtoms > reference.raw.admittedAtoms,
    modelGapNotHidden: artifacts.comparison.ready === true && artifacts.comparison.compiledLocalBurdenDeltaAtoms > 0,
    currentCandidateLedgerBound: packet.sourceFiles?.[0]?.sha256 === candidateSha256,
    priorRowsExcluded:
      packet.sourceRowExclusions?.declaredCount === 100 &&
      packet.sourceRowExclusions?.matchedCount === sourceRows.length - freshSourceRows.length,
    exclusionCampaignBound:
      exclusions.priorCampaign?.path === PRIOR_JUDGE_CAMPAIGN &&
      exclusions.priorCampaign?.packetId === priorJudgeCampaign.packet?.packetId &&
      exclusions.priorCampaign?.packetDigest === priorJudgeCampaign.packet?.packetDigest &&
      exclusions.priorCampaign?.stablePreferences === priorJudgeCampaign.stablePreferences &&
      exclusions.priorCampaign?.completedPerCasePasses === priorJudgeCampaign.completedPerCasePasses,
    balancedFreshPacket:
      packet.selectedCases === 120 &&
      packet.selectedSourceContextCases === 120 &&
      Object.values(packet.domainCounts || {}).every((count) => count === 30),
    holdoutDisjoint: packet.domains.every((domain) => !holdoutDomains.has(domain)),
    taskDiversityMeasured:
      taskDiversity.currentCases === packet.selectedCases &&
      taskDiversity.repeatedSourceTaskCases + taskDiversity.novelSourceTaskCases === packet.selectedCases &&
      taskDiversity.repeatedSourceKernelCases + taskDiversity.novelSourceKernelCases === packet.selectedCases,
  };
  const failures = Object.entries(assertions)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (failures.length > 0) throw new Error(`Preference expansion evidence failed: ${failures.join(', ')}`);

  return {
    schemaVersion: 1,
    protocol: 'scion-preference-expansion-evidence-v1',
    release: 'v0.16.47',
    generatedAt,
    status: 'capture-and-replicate-packet-ready',
    campaign: {
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      groups: campaign.summary.groups,
      prompts: campaign.summary.prompts,
      expectedAtomsPerArm: campaign.summary.expectedCandidates,
      domains: campaign.summary.domains,
    },
    models: armEvidence,
    capture: {
      implementation,
      artifactSetSha256,
      artifacts: artifactRows,
      burden: artifacts.burden,
      comparison: artifacts.comparison,
      recoveryDelta: {
        localAdmittedAtoms: local.compiled.admittedAtoms - local.raw.admittedAtoms,
        localAdmissionRatePoints: Number(((local.compiled.admissionRate - local.raw.admissionRate) * 100).toFixed(4)),
        referenceAdmittedAtoms: reference.compiled.admittedAtoms - reference.raw.admittedAtoms,
        referenceAdmissionRatePoints: Number(
          ((reference.compiled.admissionRate - reference.raw.admissionRate) * 100).toFixed(4),
        ),
      },
    },
    candidatePool: {
      path: CANDIDATES,
      sha256: candidateSha256,
      rows: candidateRows.length,
      sourceGroundedRows: sourceRows.length,
      priorExactRowsStillEligible: sourceRows.length - freshSourceRows.length,
      freshSourceGroundedRows: freshSourceRows.length,
      freshDomainCounts,
    },
    taskDiversity,
    freshPacket: {
      receiptPath: PACKET_RECEIPT,
      receiptSha256: sha256(await fs.readFile(path.join(root, PACKET_RECEIPT), 'utf8')),
      packetId: packet.packetId,
      packetDigest: packet.packetDigest,
      organizerDigest: packet.organizerDigest,
      selectedCases: packet.selectedCases,
      domainCounts: packet.domainCounts,
      kindCounts: packet.kindCounts,
      courseGroupCount: packet.courseGroupCount,
      sourceRowExclusions: packet.sourceRowExclusions,
      heldOutBenchmark: packet.heldOutBenchmark,
      judgmentStatus: 'not-yet-measured',
    },
    assertions,
    claimBoundary:
      'This receipt proves real model capture, deterministic partial recovery, exact model and artifact lineage, and a new exact-row anonymous packet. Most cases are source-task replicates rather than new conceptual coverage. It proves no judge preference, approved training row, trained adapter, or Scion quality win.',
  };
}

function parseArgs(argv) {
  const args = { write: false, generatedAt: '2026-07-16T21:00:00.000Z' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else throw new Error(`Unknown preference expansion evidence option: ${argv[index]}`);
  }
  return args;
}

export async function runScionPreferenceExpansionEvidenceAudit({
  cwd = process.cwd(),
  write = false,
  generatedAt,
} = {}) {
  const report = await buildScionPreferenceExpansionEvidence({ cwd, generatedAt });
  const receiptPath = path.resolve(cwd, SCION_PREFERENCE_EXPANSION_EVIDENCE_RECEIPT);
  if (write) {
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, canonical(report));
  } else {
    const tracked = await fs.readFile(receiptPath, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked Scion preference expansion evidence is stale.');
  }
  return { report, wrote: write };
}

async function main() {
  const result = await runScionPreferenceExpansionEvidenceAudit(parseArgs(process.argv.slice(2)));
  const delta = result.report.capture.recoveryDelta;
  console.log(
    `Scion preference evidence ${result.report.status}: 120 exact-row-new cases (${result.report.taskDiversity.novelSourceTaskCases} novel source tasks); local recovery +${delta.localAdmittedAtoms} atoms; compiled gap ${result.report.capture.comparison.compiledLocalBurdenDeltaAtoms} atoms.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${SCION_PREFERENCE_EXPANSION_EVIDENCE_RECEIPT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
