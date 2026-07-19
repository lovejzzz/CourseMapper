#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import {
  assessSourceAtomResponse,
  materializeSourceCaptureCampaign,
  sourceCaptureSha256,
} from './lib/scionSourceCapture.mjs';
import { verifySourceCaptureArtifacts } from './scionSourceCapture.mjs';

const CAMPAIGNS = [
  {
    id: 'authoring-v1-single-group',
    manifest: 'evaluation/scion-source-capture-domain-breadth-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-domain-breadth-evidence',
    promptPolicy: 'source-atom-authoring-v1',
    groups: 3,
  },
  {
    id: 'authoring-v2-two-groups',
    manifest: 'evaluation/scion-source-capture-course-group-breadth-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-course-group-breadth-evidence',
    promptPolicy: 'source-atom-authoring-v2',
    groups: 6,
  },
];
const V1_CANDIDATES = 'evaluation/scion-review-candidates-novel-breadth-v0.16.47.jsonl';
const V2_CANDIDATES = 'evaluation/scion-review-candidates-course-group-breadth-v0.16.47.jsonl';
const DOMAINS = ['anatomy', 'economics', 'physics'];
export const SCION_AUTHORING_V2_COMPARISON_RECEIPT =
  'evaluation/scion-adapters/evidence/authoring-v2-comparison-v0.16.47.json';

function hash(value) {
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

function sourceClaims(kernel) {
  return [kernel.definition, ...(kernel.facts || []).map((fact) => fact.text)];
}

function assessCall(call, claims) {
  if (!call?.response) {
    return {
      atoms: 0,
      issues: call?.assessment?.issues || ['missing-response'],
    };
  }
  const assessment = assessSourceAtomResponse(call.response, {
    sourceClaimCount: claims.length,
    sourceClaims: claims,
    semanticProfile: 'strict',
  });
  return {
    atoms: assessment.counts.admittedMcItems + assessment.counts.admittedKeyTerms,
    issues: assessment.issues,
  };
}

function summarizeCalls(projects, arm, phase) {
  const evaluated = [];
  for (const project of projects.filter((entry) => entry.arm === arm)) {
    const capture = project.value.scionSourceCapture;
    const kernels = new Map(capture.sourcePacket.kernels.map((kernel) => [kernel.id, kernel]));
    const calls = phase === 'raw' ? capture.compilerRecovery?.rawCalls || capture.calls || [] : capture.calls || [];
    for (const call of calls) {
      const kernel = kernels.get(call.kernelId);
      if (!kernel) throw new Error(`Missing source kernel for ${call.promptId}`);
      evaluated.push({ call, result: assessCall(call, sourceClaims(kernel)) });
    }
  }
  return {
    calls: evaluated.length,
    expectedAtoms: evaluated.length * 4,
    admittedAtoms: evaluated.reduce((sum, entry) => sum + entry.result.atoms, 0),
    admissionRate:
      evaluated.length > 0
        ? Number((evaluated.reduce((sum, entry) => sum + entry.result.atoms, 0) / (evaluated.length * 4)).toFixed(6))
        : 0,
    issueHistogram: histogram(evaluated.flatMap((entry) => entry.result.issues)),
  };
}

function assessCandidate(row, side) {
  const artifact = JSON.parse(row[side]);
  return row.kind === 'mc-item'
    ? assessScionMcItem(artifact, { sourceClaims: row.sourceContext.claims, semanticProfile: 'strict' })
    : assessScionKeyTerm(artifact, { knownFacts: row.sourceContext.claims, semanticProfile: 'strict' });
}

function summarizeCandidates(rows) {
  const evaluated = rows.map((row) => ({
    row,
    local: assessCandidate(row, 'left'),
    reference: assessCandidate(row, 'right'),
  }));
  return {
    rows: rows.length,
    localEligible: evaluated.filter((entry) => entry.local.eligible).length,
    referenceEligible: evaluated.filter((entry) => entry.reference.eligible).length,
    bothEligible: evaluated.filter((entry) => entry.local.eligible && entry.reference.eligible).length,
    referenceOnly: evaluated.filter((entry) => !entry.local.eligible && entry.reference.eligible).length,
    localOnly: evaluated.filter((entry) => entry.local.eligible && !entry.reference.eligible).length,
    neither: evaluated.filter((entry) => !entry.local.eligible && !entry.reference.eligible).length,
    localEligibilityRate: rows.length
      ? Number((evaluated.filter((entry) => entry.local.eligible).length / rows.length).toFixed(6))
      : 0,
    referenceEligibilityRate: rows.length
      ? Number((evaluated.filter((entry) => entry.reference.eligible).length / rows.length).toFixed(6))
      : 0,
  };
}

async function loadJsonl(root, file) {
  const raw = await fs.readFile(path.join(root, file), 'utf8');
  return {
    raw,
    rows: raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(JSON.parse),
  };
}

async function bindCampaign(root, specification) {
  const campaign = await materializeSourceCaptureCampaign({ manifestPath: specification.manifest, cwd: root });
  const verification = await verifySourceCaptureArtifacts({
    campaign,
    outputDir: path.join(root, specification.projects),
  });
  if (verification.status !== 'pass') throw new Error(`${specification.id} capture is incomplete`);
  const projects = await Promise.all(
    verification.results.map(async (result) => {
      const raw = await fs.readFile(path.join(root, result.path));
      return { ...result, raw, value: JSON.parse(raw) };
    }),
  );
  const kernelPayloads = new Map();
  for (const group of campaign.groups) {
    for (const kernel of group.sourcePacket.kernels) {
      const payload = {
        id: kernel.id,
        term: kernel.term,
        definition: kernel.definition,
        facts: kernel.facts,
        license: kernel.license,
        attribution: kernel.attribution,
      };
      const digest = sourceCaptureSha256(payload);
      const prior = kernelPayloads.get(kernel.id);
      if (prior && prior !== digest) throw new Error(`Source kernel drift inside ${specification.id}: ${kernel.id}`);
      kernelPayloads.set(kernel.id, digest);
    }
  }
  const models = Object.fromEntries(
    ['local', 'reference'].map((arm) => {
      const identities = [
        ...new Map(
          projects
            .filter((entry) => entry.arm === arm)
            .map((entry) => {
              const model = entry.value.scionSourceCapture.model;
              return [JSON.stringify(model), model];
            }),
        ).values(),
      ];
      return [arm, identities.length === 1 ? identities[0] : null];
    }),
  );
  return {
    id: specification.id,
    promptPolicy: campaign.summary.promptPolicy || specification.promptPolicy,
    campaign: {
      path: campaign.manifestPath,
      sha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      groups: campaign.summary.groups,
      domainGroupCounts: campaign.summary.domainGroupCounts,
      prompts: campaign.summary.prompts,
      expectedAtomsPerArm: campaign.summary.expectedCandidates,
    },
    models,
    kernelPayloads,
    kernelSetSha256: sourceCaptureSha256(
      [...kernelPayloads.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    artifacts: projects
      .map((entry) => ({ path: entry.path, bytes: entry.raw.length, sha256: hash(entry.raw) }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    strictReplay: {
      local: { raw: summarizeCalls(projects, 'local', 'raw'), compiled: summarizeCalls(projects, 'local', 'compiled') },
      reference: {
        raw: summarizeCalls(projects, 'reference', 'raw'),
        compiled: summarizeCalls(projects, 'reference', 'compiled'),
      },
    },
  };
}

export async function buildScionAuthoringV2ComparisonAudit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const [campaigns, v1Candidates, v2Candidates] = await Promise.all([
    Promise.all(CAMPAIGNS.map((campaign) => bindCampaign(root, campaign))),
    loadJsonl(root, V1_CANDIDATES),
    loadJsonl(root, V2_CANDIDATES),
  ]);
  const [v1, v2] = campaigns;
  const v1Rows = v1Candidates.rows.filter((row) => DOMAINS.includes(row.domain));
  const v2Rows = v2Candidates.rows;
  const candidates = {
    v1: { ...summarizeCandidates(v1Rows), path: V1_CANDIDATES, sha256: hash(v1Candidates.raw) },
    v2: { ...summarizeCandidates(v2Rows), path: V2_CANDIDATES, sha256: hash(v2Candidates.raw) },
  };
  const deltas = {
    localStrictRawAtoms: v2.strictReplay.local.raw.admittedAtoms - v1.strictReplay.local.raw.admittedAtoms,
    localStrictCompiledAtoms:
      v2.strictReplay.local.compiled.admittedAtoms - v1.strictReplay.local.compiled.admittedAtoms,
    referenceStrictRawAtoms: v2.strictReplay.reference.raw.admittedAtoms - v1.strictReplay.reference.raw.admittedAtoms,
    referenceStrictCompiledAtoms:
      v2.strictReplay.reference.compiled.admittedAtoms - v1.strictReplay.reference.compiled.admittedAtoms,
    compiledLocalGapV1: v1.strictReplay.reference.compiled.admittedAtoms - v1.strictReplay.local.compiled.admittedAtoms,
    compiledLocalGapV2: v2.strictReplay.reference.compiled.admittedAtoms - v2.strictReplay.local.compiled.admittedAtoms,
    compiledGapNarrowing:
      v1.strictReplay.reference.compiled.admittedAtoms -
      v1.strictReplay.local.compiled.admittedAtoms -
      (v2.strictReplay.reference.compiled.admittedAtoms - v2.strictReplay.local.compiled.admittedAtoms),
    localCandidateEligibilityRate: Number(
      (candidates.v2.localEligibilityRate - candidates.v1.localEligibilityRate).toFixed(6),
    ),
  };
  const combinedGroups = Object.fromEntries(
    DOMAINS.map((domain) => [
      domain,
      (v1.campaign.domainGroupCounts[domain] || 0) + (v2.campaign.domainGroupCounts[domain] || 0),
    ]),
  );
  const assertions = {
    exactSourceKernelReplay:
      v1.kernelPayloads.size === 34 && v2.kernelPayloads.size === 34 && v1.kernelSetSha256 === v2.kernelSetSha256,
    exactCampaignShape:
      v1.campaign.groups === 3 &&
      v2.campaign.groups === 6 &&
      v1.campaign.prompts === 34 &&
      v2.campaign.prompts === 34 &&
      Object.values(combinedGroups).every((count) => count === 3),
    exactModelIdentity:
      v1.models.local?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      v2.models.local?.id === v1.models.local?.id &&
      v2.models.local?.revision === v1.models.local?.revision &&
      v1.models.reference?.id === 'gpt-5.4-mini' &&
      v2.models.reference?.id === v1.models.reference?.id,
    exactStrictReplay:
      v1.strictReplay.local.raw.admittedAtoms === 38 &&
      v1.strictReplay.local.compiled.admittedAtoms === 54 &&
      v1.strictReplay.reference.raw.admittedAtoms === 114 &&
      v1.strictReplay.reference.compiled.admittedAtoms === 131 &&
      v2.strictReplay.local.raw.admittedAtoms === 77 &&
      v2.strictReplay.local.compiled.admittedAtoms === 91 &&
      v2.strictReplay.reference.raw.admittedAtoms === 113 &&
      v2.strictReplay.reference.compiled.admittedAtoms === 124,
    localStrictAdmissionImproved: deltas.localStrictRawAtoms === 39 && deltas.localStrictCompiledAtoms === 37,
    strictCompiledGapNarrowed:
      deltas.compiledLocalGapV1 === 77 && deltas.compiledLocalGapV2 === 33 && deltas.compiledGapNarrowing === 44,
    candidateSurfaceImproved:
      candidates.v1.rows === 69 &&
      candidates.v1.localEligible === 54 &&
      candidates.v2.rows === 91 &&
      candidates.v2.localEligible === 88 &&
      candidates.v2.referenceEligible === 86 &&
      candidates.v2.localEligibilityRate > candidates.v1.localEligibilityRate,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Authoring v2 comparison failed: ${failures.join(', ')}; observed=${JSON.stringify({
        strictReplay: campaigns.map((campaign) => ({ id: campaign.id, strictReplay: campaign.strictReplay })),
        candidates,
        deltas,
      })}`,
    );
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-authoring-v2-controlled-kernel-replay-v1',
    release: 'v0.16.47',
    generatedAt: '2026-07-16T23:45:00.000Z',
    status: 'strict-compiler-gap-materially-narrowed',
    campaigns: campaigns.map(({ id, promptPolicy, campaign, models, kernelSetSha256, artifacts, strictReplay }) => ({
      id,
      promptPolicy,
      campaign,
      models,
      kernelSetSha256,
      artifacts,
      strictReplay,
    })),
    semanticKernelControl: {
      kernelsPerCampaign: v1.kernelPayloads.size,
      kernelSetSha256: v1.kernelSetSha256,
      exactPayloadMatch: true,
      combinedCourseGroupsByDomain: combinedGroups,
    },
    candidateSurfaces: candidates,
    deltas,
    assertions,
    interpretation:
      'On the same 34 semantic source kernels and exact model identities, the joint v2 pipeline change increased strict local raw admission by 39 atoms and strict compiled admission by 37 atoms, while narrowing the strict compiled reference lead from 77 to 33 atoms under the current role-aware admission gate. The reviewable local candidate eligibility rate also rose materially.',
    claimBoundary:
      'This replay controls semantic source-kernel payloads but jointly changes authoring instructions, course context, group partitioning, and newly sampled model output. It therefore demonstrates a pipeline revision gain, not an isolated causal prompt effect. It contains no blind preference outcome and proves no adapter, instructor, classroom, held-out, or production win.',
  };
}

export async function runScionAuthoringV2ComparisonAudit({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionAuthoringV2ComparisonAudit({ cwd });
  const output = path.resolve(cwd, SCION_AUTHORING_V2_COMPARISON_RECEIPT);
  if (write) {
    await fs.writeFile(output, canonical(report));
  } else {
    const tracked = await fs.readFile(output, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked authoring v2 comparison is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown authoring v2 comparison option');
  const result = await runScionAuthoringV2ComparisonAudit({ write: args.has('--write') });
  console.log(
    `Scion authoring v2: local strict compiled +${result.report.deltas.localStrictCompiledAtoms} atoms; reference lead narrowed ${result.report.deltas.compiledLocalGapV1} -> ${result.report.deltas.compiledLocalGapV2}.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${SCION_AUTHORING_V2_COMPARISON_RECEIPT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
