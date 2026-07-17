#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SOURCE_TARGETED_ASSESSMENT_CONTRACT,
  assessSourceAtomResponse,
  materializeSourceCaptureCampaign,
  sourceCaptureSha256,
  verifySourceCaptureProject,
} from './lib/scionSourceCapture.mjs';

const RELEASE = 'v0.16.47';
const GENERATED_AT = '2026-07-17T01:45:00.000Z';
const CAMPAIGNS = [
  {
    id: 'accepted-v2-baseline',
    manifest: 'evaluation/scion-source-capture-course-group-breadth-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-course-group-breadth-evidence',
  },
  {
    id: 'candidate-v3',
    manifest: 'evaluation/scion-source-capture-authoring-v3-v0.16.47.json',
    projects: 'evaluation/scion-source-capture-authoring-v3-evidence',
  },
];
const IMPLEMENTATION = [
  'scripts/lib/scionSourceCapture.mjs',
  'scripts/scionSourceCapture.mjs',
  'src/lib/scionPreferenceGate.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
];
export const SCION_AUTHORING_V3_LOCAL_EXPERIMENT_RECEIPT =
  'evaluation/scion-adapters/evidence/authoring-v3-local-experiment-v0.16.47.json';

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

function kernelClaims(kernel) {
  return [kernel.definition, ...(kernel.facts || []).map((fact) => fact.text)];
}

function summarizeStrictCalls(projects, phase) {
  const evaluated = [];
  for (const project of projects) {
    const capture = project.value.scionSourceCapture;
    const kernels = new Map(capture.sourcePacket.kernels.map((kernel) => [kernel.id, kernel]));
    const calls = phase === 'raw' ? capture.compilerRecovery?.rawCalls || capture.calls || [] : capture.calls || [];
    for (const call of calls) {
      const kernel = kernels.get(call.kernelId);
      if (!kernel) throw new Error(`Missing kernel ${call.kernelId} in ${project.path}`);
      if (!call.response) {
        evaluated.push({ atoms: 0, issues: call.assessment?.issues || ['missing-response'], missingResponse: true });
        continue;
      }
      const claims = kernelClaims(kernel);
      const assessment = assessSourceAtomResponse(call.response, {
        sourceClaimCount: claims.length,
        sourceClaims: claims,
        semanticProfile: 'strict',
      });
      evaluated.push({
        atoms: assessment.counts.admittedMcItems + assessment.counts.admittedKeyTerms,
        issues: assessment.issues,
        missingResponse: false,
      });
    }
  }
  const admittedAtoms = evaluated.reduce((sum, entry) => sum + entry.atoms, 0);
  return {
    calls: evaluated.length,
    expectedAtoms: evaluated.length * 4,
    admittedAtoms,
    admissionRate: evaluated.length ? Number((admittedAtoms / (evaluated.length * 4)).toFixed(6)) : 0,
    missingResponses: evaluated.filter((entry) => entry.missingResponse).length,
    issueHistogram: histogram(evaluated.flatMap((entry) => entry.issues)),
  };
}

function summarizeTargetedRecovery(projects) {
  const calls = projects.flatMap((project) => project.value.scionSourceCapture.compilerRecovery?.recoveryCalls || []);
  const targeted = calls.filter((call) => call.assessmentContract === SOURCE_TARGETED_ASSESSMENT_CONTRACT);
  const countNoise = targeted.flatMap((call) =>
    (call.assessment?.issues || []).filter((issue) => issue === 'mc-count' || issue === 'key-term-count'),
  );
  return {
    calls: calls.length,
    targetedAssessmentCalls: targeted.length,
    targetBoundCalls: targeted.filter(
      (call) => Number.isInteger(call.recoveryTarget?.mcItems) && Number.isInteger(call.recoveryTarget?.keyTerms),
    ).length,
    admittedAtoms: targeted.reduce(
      (sum, call) =>
        sum +
        Number(call.assessment?.counts?.admittedMcItems || 0) +
        Number(call.assessment?.counts?.admittedKeyTerms || 0),
      0,
    ),
    countContractNoise: countNoise.length,
    issueHistogram: histogram(targeted.flatMap((call) => call.assessment?.issues || [])),
  };
}

async function bindLocalCampaign(root, specification) {
  const campaign = await materializeSourceCaptureCampaign({ cwd: root, manifestPath: specification.manifest });
  const projects = [];
  for (const group of campaign.groups) {
    const projectPath = path.join(root, specification.projects, `${group.id}-local.json`);
    const raw = await fs.readFile(projectPath);
    const value = JSON.parse(raw);
    const model = value.scionSourceCapture?.model;
    const verification = verifySourceCaptureProject(value, {
      campaign,
      group,
      arm: 'local',
      model,
      admissionMode: 'captured',
    });
    if (!verification.valid) {
      throw new Error(`${specification.id} ${group.id} invalid: ${verification.issues.join(', ')}`);
    }
    projects.push({
      groupId: group.id,
      path: path.relative(root, projectPath),
      raw,
      value,
    });
  }
  const kernelPayloads = campaign.groups.flatMap((group) =>
    group.sourcePacket.kernels.map((kernel) => ({
      groupId: group.id,
      kernelId: kernel.id,
      sha256: sourceCaptureSha256(kernel),
    })),
  );
  const models = [
    ...new Map(
      projects.map((project) => {
        const model = project.value.scionSourceCapture.model;
        return [JSON.stringify(model), model];
      }),
    ).values(),
  ];
  return {
    id: specification.id,
    promptPolicy: campaign.summary.promptPolicy,
    campaign: {
      path: campaign.manifestPath,
      sha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      groups: campaign.summary.groups,
      prompts: campaign.summary.prompts,
      domainGroupCounts: campaign.summary.domainGroupCounts,
    },
    model: models.length === 1 ? models[0] : null,
    groupIds: campaign.groups.map((group) => group.id),
    courseInputSha256: campaign.groups.map((group) => ({ groupId: group.id, sha256: group.courseInputSha256 })),
    kernelPayloads,
    kernelSetSha256: sourceCaptureSha256(kernelPayloads),
    artifacts: projects.map((project) => ({
      path: project.path,
      bytes: project.raw.length,
      sha256: sha256(project.raw),
    })),
    strictReplay: {
      raw: summarizeStrictCalls(projects, 'raw'),
      effective: summarizeStrictCalls(projects, 'effective'),
    },
    targetedRecovery: summarizeTargetedRecovery(projects),
  };
}

export async function buildScionAuthoringV3LocalExperiment({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const [campaigns, implementation] = await Promise.all([
    Promise.all(CAMPAIGNS.map((campaign) => bindLocalCampaign(root, campaign))),
    Promise.all(
      IMPLEMENTATION.map(async (file) => {
        const raw = await fs.readFile(path.join(root, file));
        return { path: file, bytes: raw.length, sha256: sha256(raw) };
      }),
    ),
  ]);
  const [v2, v3] = campaigns;
  const delta = {
    rawAdmittedAtoms: v3.strictReplay.raw.admittedAtoms - v2.strictReplay.raw.admittedAtoms,
    effectiveAdmittedAtoms: v3.strictReplay.effective.admittedAtoms - v2.strictReplay.effective.admittedAtoms,
    malformedResponses: v3.strictReplay.raw.missingResponses - v2.strictReplay.raw.missingResponses,
  };
  const assertions = {
    exactControlledSurface:
      v2.campaign.groups === 6 &&
      v3.campaign.groups === 6 &&
      v2.campaign.prompts === 34 &&
      v3.campaign.prompts === 34 &&
      JSON.stringify(v2.groupIds) === JSON.stringify(v3.groupIds) &&
      JSON.stringify(v2.courseInputSha256) === JSON.stringify(v3.courseInputSha256) &&
      v2.kernelSetSha256 === v3.kernelSetSha256,
    exactBaseIdentity:
      v2.model?.id === 'google/gemma-4-E2B-it-qat-q4_0-unquantized' &&
      v3.model?.id === v2.model?.id &&
      v3.model?.revision === v2.model?.revision &&
      v3.model?.decoding === 'greedy-json-schema',
    exactV2Baseline: v2.strictReplay.raw.admittedAtoms === 77 && v2.strictReplay.effective.admittedAtoms === 91,
    targetAwareRecovery:
      v3.targetedRecovery.calls === 34 &&
      v3.targetedRecovery.targetedAssessmentCalls === 34 &&
      v3.targetedRecovery.targetBoundCalls === 34 &&
      v3.targetedRecovery.countContractNoise === 0,
    malformedOutputRegression: delta.malformedResponses > 0,
    candidateRejected: delta.rawAdmittedAtoms < 0 && delta.effectiveAdmittedAtoms < 0,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Authoring v3 local experiment failed: ${failures.join(', ')}; observed=${JSON.stringify({ campaigns, delta })}`,
    );
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-authoring-v3-local-controlled-experiment-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'candidate-rejected-regression',
    campaigns,
    implementation,
    delta,
    assertions,
    decision: {
      promoted: false,
      activeAuthoringPolicy: 'source-atom-authoring-v2',
      rejectedPolicy: 'source-atom-authoring-v3',
      nextExperiment:
        'Keep the proven v2 main prompt, isolate only the short-option and trailing-label guardrails, and simplify type-specific recovery instructions before another controlled local replay.',
    },
    interpretation:
      'The all-at-once v3 instruction bundle overloaded the pinned local base: it reduced strict raw and recovery-effective admission and increased malformed output. The target-aware recovery assessment itself worked as intended with no false count-contract issues, but it could not compensate for the weaker authored atoms.',
    claimBoundary:
      'This is one deterministic local replay on the same base, kernels, and course groups. It is useful negative pipeline evidence, not a model, adapter, reference-model, human, classroom, held-out, speed, or production-quality result.',
  };
}

export async function runScionAuthoringV3LocalExperiment({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionAuthoringV3LocalExperiment({ cwd });
  const output = path.resolve(cwd, SCION_AUTHORING_V3_LOCAL_EXPERIMENT_RECEIPT);
  if (write) await fs.writeFile(output, canonical(report));
  else if ((await fs.readFile(output, 'utf8')) !== canonical(report)) {
    throw new Error('Tracked authoring v3 local experiment is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown authoring v3 experiment option');
  const { report, wrote } = await runScionAuthoringV3LocalExperiment({ write: args.has('--write') });
  console.log(
    `Scion authoring v3: ${report.status}; raw ${report.delta.rawAdmittedAtoms}, effective ${report.delta.effectiveAdmittedAtoms}, malformed ${report.delta.malformedResponses}.`,
  );
  console.log(`${wrote ? 'Wrote' : 'Verified'}: ${SCION_AUTHORING_V3_LOCAL_EXPERIMENT_RECEIPT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
