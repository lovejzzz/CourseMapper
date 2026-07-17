#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { materializeSourceCaptureCampaign, sourceCaptureSha256 } from './lib/scionSourceCapture.mjs';
import { scionSourceKernelSha256, scionSourceTaskSha256 } from './lib/scionSourceTaskIdentity.mjs';
import { verifySourceCaptureArtifacts } from './scionSourceCapture.mjs';

const CAPTURES = [
  {
    id: 'targeted-novel-kernels',
    manifest: 'evaluation/scion-source-capture-novel-kernels-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-novel-kernels-evidence',
    sourceSnapshots: {
      'public/genome/music-scion-v01647.json': {
        path: 'evaluation/scion-adapters/source-snapshots/music-scion-v01647-novel.json',
        sha256: '4cf8d6da04816910caefe3b24f219a73bb65f9e15c8e1e7841874c5fb2948d4b',
      },
    },
    expected: {
      groups: 2,
      prompts: 8,
      atoms: 32,
      localRaw: 22,
      localCompiled: 26,
      referenceRaw: 28,
      referenceCompiled: 30,
    },
  },
  {
    id: 'domain-breadth',
    manifest: 'evaluation/scion-source-capture-domain-breadth-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-domain-breadth-evidence',
    expected: {
      groups: 3,
      prompts: 34,
      atoms: 136,
      localRaw: 49,
      localCompiled: 69,
      referenceRaw: 114,
      referenceCompiled: 135,
    },
  },
];
const CANDIDATES = 'evaluation/scion-review-candidates-novel-breadth-v0.16.47.jsonl';
const PACKET = 'evaluation/scion-adapters/evidence/source-review-packet-novel-breadth-v0.16.47.json';
const EXCLUSIONS = 'evaluation/scion-adapters/evidence/prior-judged-source-kernels-v0.16.47.json';
const HOLDOUT = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
export const SCION_NOVEL_BREADTH_EVIDENCE_RECEIPT =
  'evaluation/scion-adapters/evidence/novel-breadth-evidence-v0.16.47.json';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function histogram(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

function sameCounts(left = {}, right = {}) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every((key) => left[key] === right[key]);
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

async function bindCapture(root, specification) {
  const sourceSnapshots = await Promise.all(
    Object.entries(specification.sourceSnapshots || {}).map(async ([logicalPath, snapshot]) => {
      const raw = await fs.readFile(path.join(root, snapshot.path), 'utf8');
      const observedSha256 = sha256(raw);
      if (observedSha256 !== snapshot.sha256) {
        throw new Error(`Frozen source snapshot drifted: ${snapshot.path}`);
      }
      return {
        logicalPath,
        path: snapshot.path,
        bytes: Buffer.byteLength(raw),
        sha256: observedSha256,
      };
    }),
  );
  const campaign = await materializeSourceCaptureCampaign({
    manifestPath: specification.manifest,
    cwd: root,
    sourceSnapshots: Object.fromEntries(sourceSnapshots.map((entry) => [entry.logicalPath, entry.path])),
  });
  const artifacts = await verifySourceCaptureArtifacts({
    campaign,
    outputDir: path.join(root, specification.projects),
  });
  const projects = await Promise.all(
    artifacts.results.map(async (result) => ({
      ...result,
      project: await readJson(root, result.path),
    })),
  );
  const models = Object.fromEntries(
    ['local', 'reference'].map((arm) => {
      const identities = [
        ...new Map(
          projects
            .filter((entry) => entry.arm === arm)
            .map(({ project }) => {
              const model = project.scionSourceCapture.model;
              return [JSON.stringify(model), model];
            }),
        ).values(),
      ];
      const rawCalls = projects
        .filter((entry) => entry.arm === arm)
        .flatMap(
          ({ project }) =>
            project.scionSourceCapture.compilerRecovery?.rawCalls || project.scionSourceCapture.calls || [],
        );
      return [
        arm,
        {
          identity: identities.length === 1 ? identities[0] : null,
          identityCount: identities.length,
          rawCalls: rawCalls.length,
          adapterActive: histogram(rawCalls.map((call) => String(call.receipt?.adapterActive === true))),
          constrained: histogram(rawCalls.map((call) => call.receipt?.constrained || 'unknown')),
        },
      ];
    }),
  );
  const expected = specification.expected;
  const assertions = {
    complete:
      artifacts.status === 'pass' &&
      artifacts.projects === expected.groups * 2 &&
      artifacts.validProjects === expected.groups * 2,
    exactCampaign:
      campaign.summary.groups === expected.groups &&
      campaign.summary.prompts === expected.prompts &&
      campaign.summary.expectedCandidates === expected.atoms,
    exactMeasuredBurden:
      artifacts.burden.local.raw.admittedAtoms === expected.localRaw &&
      artifacts.burden.local.compiled.admittedAtoms === expected.localCompiled &&
      artifacts.burden.reference.raw.admittedAtoms === expected.referenceRaw &&
      artifacts.burden.reference.compiled.admittedAtoms === expected.referenceCompiled,
    recoveryDoesNotReduceAdmission:
      artifacts.burden.local.compiled.admittedAtoms >= artifacts.burden.local.raw.admittedAtoms &&
      artifacts.burden.reference.compiled.admittedAtoms >= artifacts.burden.reference.raw.admittedAtoms,
    exactPinnedLocalBase:
      models.local.identityCount === 1 &&
      models.local.identity?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      models.local.identity?.revision === '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce' &&
      models.local.adapterActive.false === expected.prompts,
    exactReference:
      models.reference.identityCount === 1 &&
      models.reference.identity?.id === 'gpt-5.4-mini' &&
      models.reference.adapterActive.false === expected.prompts,
  };
  return {
    id: specification.id,
    campaign: {
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      groups: campaign.summary.groups,
      prompts: campaign.summary.prompts,
      expectedAtomsPerArm: campaign.summary.expectedCandidates,
      domains: campaign.summary.domains,
      sourceSnapshots,
    },
    models,
    artifacts: {
      path: specification.projects,
      setSha256: sourceCaptureSha256(
        artifacts.results
          .map(({ path: projectPath, sha256: digest }) => ({ path: projectPath, sha256: digest }))
          .sort((left, right) => left.path.localeCompare(right.path)),
      ),
      projects: artifacts.results.map(({ path: projectPath, sha256: digest }) => ({
        path: projectPath,
        sha256: digest,
      })),
      burden: artifacts.burden,
      comparison: artifacts.comparison,
    },
    assertions,
  };
}

export async function buildScionNovelBreadthEvidence({
  cwd = process.cwd(),
  generatedAt = '2026-07-16T23:00:00.000Z',
} = {}) {
  const root = path.resolve(cwd);
  const [captures, candidateRaw, packet, exclusions, holdout] = await Promise.all([
    Promise.all(CAPTURES.map((specification) => bindCapture(root, specification))),
    fs.readFile(path.join(root, CANDIDATES), 'utf8'),
    readJson(root, PACKET),
    readJson(root, EXCLUSIONS),
    readJson(root, HOLDOUT),
  ]);
  const rows = candidateRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const kernels = new Set(rows.map(scionSourceKernelSha256));
  const tasks = new Set(rows.map(scionSourceTaskSha256));
  const groups = new Set(rows.map((row) => row.courseGroupId));
  const licenses = histogram(rows.map((row) => row.sourceContext?.license || 'missing'));
  const domainCounts = histogram(rows.map((row) => row.domain));
  const kindCounts = histogram(rows.map((row) => row.kind));
  const priorKernels = new Set(exclusions.sourceKernelSha256 || []);
  const overlap = [...kernels].filter((identity) => priorKernels.has(identity));
  const holdoutDomains = new Set((holdout.courses || []).map((course) => course.domain));
  const attemptedKernels = captures.reduce((sum, capture) => sum + capture.campaign.prompts, 0);
  const combined = {
    prompts: attemptedKernels,
    expectedAtomsPerArm: captures.reduce((sum, capture) => sum + capture.campaign.expectedAtomsPerArm, 0),
    localRawAdmitted: captures.reduce((sum, capture) => sum + capture.artifacts.burden.local.raw.admittedAtoms, 0),
    localCompiledAdmitted: captures.reduce(
      (sum, capture) => sum + capture.artifacts.burden.local.compiled.admittedAtoms,
      0,
    ),
    referenceRawAdmitted: captures.reduce(
      (sum, capture) => sum + capture.artifacts.burden.reference.raw.admittedAtoms,
      0,
    ),
    referenceCompiledAdmitted: captures.reduce(
      (sum, capture) => sum + capture.artifacts.burden.reference.compiled.admittedAtoms,
      0,
    ),
  };
  combined.compiledReferenceLead = combined.referenceCompiledAdmitted - combined.localCompiledAdmitted;
  const assertions = {
    capturesValid: captures.every((capture) => Object.values(capture.assertions).every(Boolean)),
    exactCombinedCapture:
      combined.prompts === 42 &&
      combined.expectedAtomsPerArm === 168 &&
      combined.localRawAdmitted === 71 &&
      combined.localCompiledAdmitted === 95 &&
      combined.referenceRawAdmitted === 142 &&
      combined.referenceCompiledAdmitted === 165 &&
      combined.compiledReferenceLead === 70,
    candidateLedgerBound: packet.sourceFiles?.[0]?.sha256 === sha256(candidateRaw),
    exactCandidateCapacity: rows.length === 94 && kernels.size === 36 && tasks.size === 60 && groups.size === 5,
    allSourceGrounded: rows.every((row) => row.sourceContext?.kernelId && row.sourceContext?.claims?.length >= 2),
    priorKernelDisjoint:
      overlap.length === 0 &&
      packet.sourceKernelExclusions?.declaredCount === exclusions.sourceKernelCount &&
      packet.sourceKernelExclusions?.matchedKernels === 0,
    holdoutDisjoint: [...new Set(rows.map((row) => row.domain))].every((domain) => !holdoutDomains.has(domain)),
    packetBound:
      packet.selectedCases === rows.length &&
      packet.selectedSourceContextCases === rows.length &&
      sameCounts(packet.domainCounts, domainCounts) &&
      sameCounts(packet.kindCounts, kindCounts),
    incompleteCourseGroupCoverageDeclared:
      packet.courseGroupCount === 5 &&
      packet.targetCourseGroupsPerDomain === 3 &&
      packet.coverageStatus === 'needs-more-course-groups',
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) throw new Error(`Novel breadth evidence failed: ${failures.join(', ')}`);

  return {
    schemaVersion: 1,
    protocol: 'scion-novel-breadth-evidence-v1',
    release: 'v0.16.47',
    generatedAt,
    status: 'novel-breadth-packet-awaiting-paired-judgment',
    captures,
    combinedCapture: combined,
    candidatePool: {
      path: CANDIDATES,
      sha256: sha256(candidateRaw),
      rows: rows.length,
      attemptedSourceKernels: attemptedKernels,
      reviewableSourceKernels: kernels.size,
      reviewableSourceTasks: tasks.size,
      courseGroups: groups.size,
      domains: domainCounts,
      kinds: kindCounts,
      licenses,
      priorJudgedKernelOverlap: overlap.length,
      interpretation:
        'The capture campaigns attempted 42 new semantic source kernels. Only 36 produced at least one matched candidate/reference artifact pair, so reviewable coverage is 36 kernels rather than 42.',
    },
    packet: {
      receiptPath: PACKET,
      receiptSha256: sha256(await fs.readFile(path.join(root, PACKET))),
      packetId: packet.packetId,
      packetDigest: packet.packetDigest,
      organizerDigest: packet.organizerDigest,
      selectedCases: packet.selectedCases,
      domainCounts: packet.domainCounts,
      kindCounts: packet.kindCounts,
      sourceKernelExclusions: packet.sourceKernelExclusions,
      heldOutBenchmark: packet.heldOutBenchmark,
      courseGroupCount: packet.courseGroupCount,
      targetCourseGroupsPerDomain: packet.targetCourseGroupsPerDomain,
      coverageStatus: packet.coverageStatus,
      judgmentStatus: 'not-yet-measured',
    },
    licenseBoundary: {
      productionCompatibleRows: (licenses['CC-BY-4.0'] || 0) + (licenses['U.S. Government Work'] || 0),
      shareAlikeResearchRows: licenses['CC-BY-SA-4.0'] || 0,
      interpretation:
        'CC-BY-SA music rows may be evaluated in the isolated research lane, but are not silently treated as production-compatible adapter data.',
    },
    assertions,
    claimBoundary:
      'This receipt proves real, hash-bound capture on new source kernels and a holdout-disjoint 94-case blind packet. It exposes the large base-model compiler burden and incomplete course-group coverage. It proves no judge preference, adapter authorization, adapter win, or production promotion.',
  };
}

export async function runScionNovelBreadthEvidenceAudit({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionNovelBreadthEvidence({ cwd });
  const output = path.resolve(cwd, SCION_NOVEL_BREADTH_EVIDENCE_RECEIPT);
  if (write) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, canonical(report));
  } else {
    const tracked = await fs.readFile(output, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked Scion novel breadth evidence is stale.');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown novel breadth evidence option');
  const result = await runScionNovelBreadthEvidenceAudit({ write: args.has('--write') });
  const capture = result.report.combinedCapture;
  console.log(
    `Scion novel breadth: ${result.report.candidatePool.rows} cases / ${result.report.candidatePool.reviewableSourceKernels} reviewable new kernels; compiled admission ${capture.localCompiledAdmitted}/${capture.expectedAtomsPerArm} local vs ${capture.referenceCompiledAdmitted}/${capture.expectedAtomsPerArm} reference.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${SCION_NOVEL_BREADTH_EVIDENCE_RECEIPT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
