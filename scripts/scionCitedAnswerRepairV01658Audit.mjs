#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessPublicScionKernelResponse, repairPublicScionJson } from '../src/lib/publicScionProvider.js';

const RELEASE = 'v0.16.58';
const GENERATED_AT = '2026-07-19T12:25:00.000Z';
const CAMPAIGN = 'evaluation/scion-adapters/lesson-kernel-campaign-v0.16.56.json';
const LOCAL_REPLAY = 'evaluation/scion-adapters/evidence/lesson-kernel-expansion-v0.16.57/local-admission-replay.json';
const REFERENCE_REPLAY =
  'evaluation/scion-adapters/evidence/lesson-kernel-expansion-v0.16.57/reference-admission-replay.json';
const RECEIPT = 'evaluation/scion-adapters/evidence/cited-answer-repair-v0.16.58.json';
const IMPLEMENTATION = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionLocalProvider.js',
];
const EXPECTED_LOCAL_REPAIRS = Object.freeze([
  ['scion-kernel-4df3ce51c565d84bb8930764', 1, 0, 1],
  ['scion-kernel-57b7148eae73e0ce43d21a78', 1, 0, 1],
  ['scion-kernel-b279df5c81b1997d1067aa07', 0, 0, 1],
  ['scion-kernel-e0d838f04c63f6ab675e76f9', 0, 0, 1],
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function issueCount(calls = []) {
  return calls.reduce((total, call) => total + (call.admission?.issues?.length || 0), 0);
}

function issueFamilyCount(calls = [], suffix = '') {
  return calls.reduce(
    (total, call) => total + (call.admission?.issues || []).filter((issue) => String(issue).endsWith(suffix)).length,
    0,
  );
}

function answerNeutralArtifact(value) {
  const copy = structuredClone(value);
  for (const item of Array.isArray(copy?.mc) ? copy.mc : []) {
    if (Object.prototype.hasOwnProperty.call(item, 'ai')) item.ai = '$ANSWER_INDEX';
    if (Object.prototype.hasOwnProperty.call(item, 'answerIndex')) item.answerIndex = '$ANSWER_INDEX';
  }
  return copy;
}

function summarizeArm({ replay, campaignById, arm }) {
  const calls = [];
  for (const before of replay.calls || []) {
    const campaignCase = campaignById.get(before.caseId);
    if (!campaignCase || campaignCase.caseSha256 !== before.caseSha256) {
      throw new Error(`Missing or mismatched campaign lineage for ${before.caseId}`);
    }
    const beforeText = JSON.stringify({ lessons: [before.artifact] });
    const currentBeforeAdmission = assessPublicScionKernelResponse(
      beforeText,
      campaignCase.userPrompt,
      'blueprintEnrichment',
      { applyCompilerRepairs: false, admissionProfile: 'v0.16.58' },
    );
    const repaired = repairPublicScionJson(beforeText, {
      userPrompt: campaignCase.userPrompt,
    });
    const afterArtifact = JSON.parse(repaired.text).lessons?.[0];
    const afterAdmission = assessPublicScionKernelResponse(
      repaired.text,
      campaignCase.userPrompt,
      'blueprintEnrichment',
      { admissionProfile: 'v0.16.58' },
    );
    const answerRepairs = repaired.repairs.filter((entry) => entry.pass === 'sourceAnswerAlignment');
    const historicalBeforeIssues = before.admission?.issues || [];
    const beforeIssues = currentBeforeAdmission.issues || [];
    const afterIssues = afterAdmission.issues || [];
    const introducedIssues = afterIssues.filter((issue) => !beforeIssues.includes(issue));
    const resolvedIssues = beforeIssues.filter((issue) => !afterIssues.includes(issue));
    const newlyDetectedBaselineIssues = beforeIssues.filter((issue) => !historicalBeforeIssues.includes(issue));
    const mutations = answerRepairs.map((entry) => {
      const beforeItem = before.artifact.mc?.[entry.item];
      const afterItem = afterArtifact?.mc?.[entry.item];
      const citedIndexes = beforeItem?.fi ?? beforeItem?.sourceFactIndexes ?? [];
      const citedFacts = Array.isArray(citedIndexes)
        ? citedIndexes.map((index) => before.artifact.facts?.[index]).filter(Boolean)
        : [];
      return {
        item: entry.item,
        declaredIndex: entry.preferenceEvidence?.declaredIndex,
        supportedIndex: entry.preferenceEvidence?.supportedIndex,
        sourceAlignmentProfile: entry.preferenceEvidence?.sourceAlignmentProfile,
        citedFactSha256: citedFacts.map((fact) => sha256(fact)),
        sourceContextSha256: before.sourceContextSha256,
        onlyAnswerIndexChanged:
          JSON.stringify({ ...beforeItem, ai: '$ANSWER_INDEX', answerIndex: '$ANSWER_INDEX' }) ===
          JSON.stringify({ ...afterItem, ai: '$ANSWER_INDEX', answerIndex: '$ANSWER_INDEX' }),
        trainingEligible: entry.trainingEligible,
      };
    });
    calls.push({
      caseId: before.caseId,
      caseSha256: before.caseSha256,
      domain: campaignCase.domain,
      artifactBeforeSha256: sha256(canonical(before.artifact)),
      artifactAfterSha256: sha256(canonical(afterArtifact)),
      sourcePromptSha256: sha256(campaignCase.userPrompt),
      admission: {
        historicalBeforeIssues,
        beforeIssues,
        afterIssues,
        introducedIssues,
        resolvedIssues,
        newlyDetectedBaselineIssues,
      },
      repairs: mutations,
      onlyAnswerIndexesChanged:
        JSON.stringify(answerNeutralArtifact(before.artifact)) === JSON.stringify(answerNeutralArtifact(afterArtifact)),
    });
  }
  return {
    arm,
    calls,
    summary: {
      cases: calls.length,
      admittedHistoricalBefore: replay.calls.filter((call) => !call.admission?.needsRetry).length,
      admittedBefore: calls.filter((call) => call.admission.beforeIssues.length === 0).length,
      admittedAfter: calls.filter((call) => call.admission.afterIssues.length === 0).length,
      issueInstancesHistoricalBefore: issueCount(replay.calls),
      issueInstancesBefore: calls.reduce((total, call) => total + call.admission.beforeIssues.length, 0),
      issueInstancesAfter: calls.reduce((total, call) => total + call.admission.afterIssues.length, 0),
      answerFeedbackConflictsHistoricalBefore: issueFamilyCount(replay.calls, ':explanation-key-conflict'),
      answerFeedbackConflictsBefore: calls.reduce(
        (total, call) =>
          total + call.admission.beforeIssues.filter((issue) => issue.endsWith(':explanation-key-conflict')).length,
        0,
      ),
      answerFeedbackConflictsAfter: calls.reduce(
        (total, call) =>
          total + call.admission.afterIssues.filter((issue) => issue.endsWith(':explanation-key-conflict')).length,
        0,
      ),
      answerIndexesRepaired: calls.reduce((total, call) => total + call.repairs.length, 0),
      introducedIssues: calls.reduce((total, call) => total + call.admission.introducedIssues.length, 0),
      newlyDetectedBaselineIssues: calls.reduce(
        (total, call) => total + call.admission.newlyDetectedBaselineIssues.length,
        0,
      ),
      nonAnswerMutations: calls.filter((call) => !call.onlyAnswerIndexesChanged).length,
      trainingRowsCreated: calls.reduce(
        (total, call) => total + call.repairs.filter((repair) => repair.trainingEligible).length,
        0,
      ),
    },
  };
}

export async function buildScionCitedAnswerRepairV01658Audit({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const [campaignRaw, localRaw, referenceRaw, implementation] = await Promise.all([
    fs.readFile(path.join(root, CAMPAIGN), 'utf8'),
    fs.readFile(path.join(root, LOCAL_REPLAY), 'utf8'),
    fs.readFile(path.join(root, REFERENCE_REPLAY), 'utf8'),
    Promise.all(
      IMPLEMENTATION.map(async (file) => {
        const raw = await fs.readFile(path.join(root, file));
        return { path: file, bytes: raw.length, sha256: sha256(raw) };
      }),
    ),
  ]);
  const campaign = JSON.parse(campaignRaw);
  const localReplay = JSON.parse(localRaw);
  const referenceReplay = JSON.parse(referenceRaw);
  const campaignById = new Map(campaign.cases.map((entry) => [entry.caseId, entry]));
  const local = summarizeArm({ replay: localReplay, campaignById, arm: 'local-base' });
  const reference = summarizeArm({ replay: referenceReplay, campaignById, arm: 'paid-reference' });
  const observedRepairs = local.calls.flatMap((call) =>
    call.repairs.map((repair) => [call.caseId, repair.item, repair.declaredIndex, repair.supportedIndex]),
  );
  const assertions = {
    exactExpansionCases: local.summary.cases === 14 && reference.summary.cases === 14,
    exactRepairSet: JSON.stringify(observedRepairs) === JSON.stringify(EXPECTED_LOCAL_REPAIRS),
    fourConflictsSafelyRemoved:
      local.summary.answerFeedbackConflictsBefore === 8 &&
      local.summary.answerFeedbackConflictsAfter === 4 &&
      local.summary.answerIndexesRepaired === 4,
    exactIssueDelta: local.summary.issueInstancesBefore === 77 && local.summary.issueInstancesAfter === 73,
    strongerOptionDetectorReplayed:
      local.summary.issueInstancesHistoricalBefore === 70 &&
      local.summary.issueInstancesBefore === 77 &&
      local.summary.newlyDetectedBaselineIssues === 8 &&
      reference.summary.issueInstancesHistoricalBefore === 0 &&
      reference.summary.issueInstancesBefore === 6 &&
      reference.summary.newlyDetectedBaselineIssues === 6,
    noNewAdmissionIssue: local.summary.introducedIssues === 0 && reference.summary.introducedIssues === 0,
    noNonAnswerMutation: local.summary.nonAnswerMutations === 0 && reference.summary.nonAnswerMutations === 0,
    everyRepairSourceLineageBound: local.calls
      .flatMap((call) => call.repairs)
      .every(
        (repair) =>
          repair.sourceAlignmentProfile === 'strict-cited-source' &&
          repair.citedFactSha256.length === 1 &&
          repair.onlyAnswerIndexChanged,
      ),
    referenceUntouched:
      reference.summary.issueInstancesBefore === 6 &&
      reference.summary.issueInstancesAfter === 6 &&
      reference.summary.answerIndexesRepaired === 0 &&
      reference.summary.admittedBefore === 8 &&
      reference.summary.admittedAfter === 8 &&
      reference.calls.every((call) => call.artifactBeforeSha256 === call.artifactAfterSha256),
    noSyntheticTrainingRows: local.summary.trainingRowsCreated === 0 && reference.summary.trainingRowsCreated === 0,
    admissionCountHonest: local.summary.admittedBefore === 1 && local.summary.admittedAfter === 1,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Scion cited-answer repair audit failed: ${failures.join(', ')}; observed=${JSON.stringify({
        local: local.summary,
        reference: reference.summary,
        observedRepairs,
      })}`,
    );
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-source-lineage-cited-answer-repair-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'four-source-bound-answer-conflicts-safely-repaired',
    evidence: {
      campaign: { path: CAMPAIGN, bytes: Buffer.byteLength(campaignRaw), sha256: sha256(campaignRaw) },
      localReplay: { path: LOCAL_REPLAY, bytes: Buffer.byteLength(localRaw), sha256: sha256(localRaw) },
      referenceReplay: {
        path: REFERENCE_REPLAY,
        bytes: Buffer.byteLength(referenceRaw),
        sha256: sha256(referenceRaw),
      },
      implementation,
    },
    local,
    reference,
    burden: {
      additionalModelCalls: 0,
      additionalDownloads: 0,
      changedFields: 4,
      algorithm: 'bounded lexical comparison over one cited fact, four answer options, and supplied lesson source',
      wallClockDelta: 'not claimed by this deterministic replay',
    },
    assertions,
    interpretation:
      'The production compiler repairs four previously retained answer-feedback conflicts by moving only the declared answer index. Every move is jointly bound to the item citation and the supplied lesson source. Under the current role-aware detector, local issue instances fall from 77 to 73. The current checks reveal 8 historical local defects and 6 paid-reference defects that the frozen v0.16.57 profile did not count, while one former issue is now correctly absent; every reference artifact remains byte-identical.',
    claimBoundary:
      'This is retrospective deterministic repair evidence on 14 frozen expansion artifacts. It proves four conservative index corrections, no repair-introduced admission issues, no reference mutation, and no added model calls. The additional option findings are detector expansion, not generation regression. It does not make the remaining 13 rejected local kernels publishable, create training preferences, prove unseen precision, measure wall-clock speed, activate an adapter, or establish paid-reference parity.',
  };
}

export async function runScionCitedAnswerRepairV01658Audit({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionCitedAnswerRepairV01658Audit({ cwd });
  const output = path.resolve(cwd, RECEIPT);
  const serialized = canonical(report);
  if (write) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, serialized);
  } else if ((await fs.readFile(output, 'utf8')) !== serialized) {
    throw new Error('Tracked v0.16.58 cited-answer repair receipt is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown v0.16.58 cited-answer option');
  const result = await runScionCitedAnswerRepairV01658Audit({ write: args.has('--write') });
  console.log(
    `Scion cited-answer repair: ${result.report.local.summary.answerIndexesRepaired} keys corrected; ` +
      `${result.report.local.summary.issueInstancesBefore} -> ${result.report.local.summary.issueInstancesAfter} local issues; ` +
      `${result.report.reference.summary.answerIndexesRepaired} reference mutations.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
