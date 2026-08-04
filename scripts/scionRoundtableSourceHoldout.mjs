#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { assessScionKeyTermContract } from '../src/lib/scionKeyTermContract.js';
import {
  SCION_KEY_TERM_RECOVERY_CAMPAIGNS,
  SCION_KEY_TERM_RECOVERY_FROZEN_CASES,
  SCION_KEY_TERM_RECOVERY_LOCAL_MODEL,
} from './lib/scionKeyTermRecovery.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import {
  materializeSourceCaptureCampaign,
  parseSourceAtomResponse,
  verifySourceCaptureProject,
} from './lib/scionSourceCapture.mjs';
import {
  completeScionSourceTeacherCase,
  SCION_ROUNDTABLE_SOURCE_TEACHER_POLICY,
} from './scionRoundtableSourceExperiment.mjs';

const ENDPOINT = 'http://127.0.0.1:8799';
const HOLDOUT_SEED = 'scion-roundtable-source-holdout-v0.17.12-sealed-before-inference';
const PUBLIC_PREREG = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-prereg-v0.17.12.json';
const PRIVATE_REGISTRY = 'verification-output/scion-roundtable-source-holdout/private-registry.json';
const REPORT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v0.17.12.json';
const DOMAINS = ['computer-science', 'geology', 'music-theory'];
const CASES_PER_DOMAIN = 4;

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identityFor(value) {
  return { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(value) };
}

function identityValid(value) {
  const copy = structuredClone(value);
  const identity = copy.identity;
  delete copy.identity;
  return identity?.sha256 === scionLessonKernelSha256(copy);
}

function domainFor(caseId) {
  if (caseId.includes(':cs/')) return 'computer-science';
  if (caseId.includes(':geo/')) return 'geology';
  if (caseId.includes(':music/')) return 'music-theory';
  return 'unknown';
}

function correctionOf(term = {}) {
  return String(term.cx || term.correction || '').trim();
}

function definitionOf(term = {}) {
  return String(term.df || term.definition || '').trim();
}

function validIndexes(term, count) {
  return (
    Array.isArray(term?.sourceFactIndexes) &&
    term.sourceFactIndexes.length > 0 &&
    term.sourceFactIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < count)
  );
}

async function buildHoldoutPool() {
  const developmentProjects = new Set(SCION_KEY_TERM_RECOVERY_FROZEN_CASES.map((caseId) => caseId.split(':')[0]));
  const rows = [];
  for (const config of SCION_KEY_TERM_RECOVERY_CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ cwd: process.cwd(), manifestPath: config.manifest });
    for (const group of campaign.groups) {
      if (developmentProjects.has(group.id)) continue;
      const projectFile = path.posix.join(config.evidenceDir, `${group.id}-local.json`);
      const bytes = await fs.readFile(projectFile);
      const value = JSON.parse(bytes.toString('utf8'));
      const verification = verifySourceCaptureProject(value, {
        campaign,
        group,
        arm: 'local',
        model: SCION_KEY_TERM_RECOVERY_LOCAL_MODEL,
        admissionMode: 'captured',
      });
      if (!verification.valid) throw new Error(`${projectFile} failed source-capture verification`);
      const rawByPrompt = new Map(value.scionSourceCapture.compilerRecovery.rawCalls.map((call) => [call.promptId, call]));
      for (const prompt of group.prompts) {
        let terms = [];
        try {
          terms = (parseSourceAtomResponse(rawByPrompt.get(prompt.id)?.response)?.keyTerms || []).slice(0, 2);
        } catch {
          continue;
        }
        terms.forEach((term, index) => {
          const contract = assessScionKeyTermContract(term, { definitionMin: 45 });
          if (!contract.eligible || !validIndexes(term, prompt.sourceClaims.length)) return;
          const referenceCorrection = correctionOf(term);
          const definition = definitionOf(term);
          if (!referenceCorrection || !definition || referenceCorrection.toLowerCase() === definition.toLowerCase()) return;
          const caseId = `${prompt.id}:key-term-${index}`;
          const originalTerm = { ...term, cx: definition };
          rows.push({
            id: caseId,
            domain: domainFor(caseId),
            campaign: { id: campaign.id, manifestSha256: campaign.manifestSha256 },
            project: {
              file: projectFile,
              sha256: sha256Bytes(bytes),
              sourcePacketSha256: value.scionSourceCapture.sourcePacketSha256,
            },
            promptId: prompt.id,
            kernelId: prompt.kernelId,
            lessonTitle: prompt.lessonTitle,
            defectKind: 'correction-repeats-definition',
            originalIssues: ['correction-repeats-definition'],
            originalTerm,
            excludedTerms: [],
            sourceClaims: prompt.sourceClaims,
            referenceCorrection,
          });
        });
      }
    }
  }
  return DOMAINS.flatMap((domain) =>
    rows
      .filter((entry) => entry.domain === domain)
      .sort((left, right) =>
        scionLessonKernelSha256(`${HOLDOUT_SEED}:${left.id}`).localeCompare(
          scionLessonKernelSha256(`${HOLDOUT_SEED}:${right.id}`),
        ),
      )
      .slice(0, CASES_PER_DOMAIN),
  );
}

function inputBinding(entry) {
  return {
    caseId: entry.id,
    domain: entry.domain,
    projectSha256: entry.project.sha256,
    sourcePacketSha256: entry.project.sourcePacketSha256,
    promptId: entry.promptId,
    sourceClaims: entry.sourceClaims,
    syntheticDefectTerm: entry.originalTerm,
  };
}

async function prepare() {
  for (const target of [PUBLIC_PREREG, PRIVATE_REGISTRY, REPORT]) {
    try {
      await fs.access(target);
      throw new Error(`${target} already exists; refusing to rewrite a precommitted holdout`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const cases = await buildHoldoutPool();
  if (cases.length !== DOMAINS.length * CASES_PER_DOMAIN) throw new Error('The holdout pool is too small');
  const privateCases = cases.map((entry) => {
    const nonce = randomBytes(32).toString('hex');
    return {
      caseId: entry.id,
      nonce,
      referenceCorrection: entry.referenceCorrection,
      commitment: scionLessonKernelSha256({ caseId: entry.id, nonce, referenceCorrection: entry.referenceCorrection }),
    };
  });
  const privateRegistry = {
    protocol: 'scion-roundtable-source-holdout-private-registry-v1',
    cases: privateCases,
  };
  privateRegistry.identity = identityFor(privateRegistry);
  const commitmentByCase = new Map(privateCases.map((entry) => [entry.caseId, entry.commitment]));
  const preregistration = {
    schemaVersion: 1,
    protocol: 'scion-roundtable-source-holdout-preregistration-v1',
    status: 'precommitted-before-model-inference',
    createdAt: new Date().toISOString(),
    seedSha256: scionLessonKernelSha256(HOLDOUT_SEED),
    teacherPolicySha256: scionLessonKernelSha256(SCION_ROUNDTABLE_SOURCE_TEACHER_POLICY),
    developmentProjectIdsExcludedSha256: scionLessonKernelSha256(
      [...new Set(SCION_KEY_TERM_RECOVERY_FROZEN_CASES.map((caseId) => caseId.split(':')[0]))].sort(),
    ),
    split: { cases: cases.length, domains: DOMAINS, casesPerDomain: CASES_PER_DOMAIN, sourceDisjointFromDevelopment: true },
    cases: cases.map((entry, index) => ({
      caseId: entry.id,
      domain: entry.domain,
      order: index % 2 === 0 ? ['matched-control', 'teacher'] : ['teacher', 'matched-control'],
      inputSha256: scionLessonKernelSha256(inputBinding(entry)),
      referenceCorrectionCommitment: commitmentByCase.get(entry.id),
    })),
    thresholds: {
      maximumAttemptsPerArm: 3,
      maximumTeacherPairedLosses: 0,
      minimumSafeRetentionAdmissionRate: 75,
      requiredIndependentFactualReviews: 2,
    },
    claimBoundary:
      'Membership, arm order, inputs, hidden reference corrections, and thresholds were frozen before either matched arm ran. The holdout is project/source-disjoint from the twelve development defects but covers three domains only.',
  };
  preregistration.identity = identityFor(preregistration);
  await fs.mkdir(path.dirname(PUBLIC_PREREG), { recursive: true });
  await fs.mkdir(path.dirname(PRIVATE_REGISTRY), { recursive: true });
  await fs.writeFile(PUBLIC_PREREG, `${JSON.stringify(preregistration, null, 2)}\n`);
  await fs.writeFile(PRIVATE_REGISTRY, `${JSON.stringify(privateRegistry, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'prepared', preregistrationSha256: preregistration.identity.sha256, cases: cases.length }, null, 2));
}

function paired(control, teacher) {
  return {
    gains: control.filter((entry, index) => !entry.assessment.eligible && teacher[index].assessment.eligible).length,
    losses: control.filter((entry, index) => entry.assessment.eligible && !teacher[index].assessment.eligible).length,
    tiesAdmitted: control.filter((entry, index) => entry.assessment.eligible && teacher[index].assessment.eligible).length,
    tiesRejected: control.filter((entry, index) => !entry.assessment.eligible && !teacher[index].assessment.eligible).length,
  };
}

async function run() {
  const preregistration = JSON.parse(await fs.readFile(PUBLIC_PREREG, 'utf8'));
  const privateRegistry = JSON.parse(await fs.readFile(PRIVATE_REGISTRY, 'utf8'));
  if (!identityValid(preregistration) || !identityValid(privateRegistry)) throw new Error('Holdout preregistration identity is invalid');
  const pool = new Map((await buildHoldoutPool()).map((entry) => [entry.id, entry]));
  const privateByCase = new Map(privateRegistry.cases.map((entry) => [entry.caseId, entry]));
  const cases = preregistration.cases.map((commitment) => {
    const entry = pool.get(commitment.caseId);
    const privateCase = privateByCase.get(commitment.caseId);
    if (!entry || scionLessonKernelSha256(inputBinding(entry)) !== commitment.inputSha256) {
      throw new Error(`Holdout input changed for ${commitment.caseId}`);
    }
    if (
      scionLessonKernelSha256({
        caseId: entry.id,
        nonce: privateCase?.nonce,
        referenceCorrection: entry.referenceCorrection,
      }) !== commitment.referenceCorrectionCommitment
    ) {
      throw new Error(`Holdout reference commitment changed for ${commitment.caseId}`);
    }
    return { entry, commitment };
  });
  const health = await fetch(`${ENDPOINT}/health`).then((response) => response.json());
  if (health.modelReady !== true || health.modelId !== 'scion-1' || health.sourceModelId !== SCION_KEY_TERM_RECOVERY_LOCAL_MODEL.id) {
    throw new Error('The authenticated local Scion runtime is not ready');
  }
  const rows = [];
  for (const { entry, commitment } of cases) {
    const arms = {};
    for (const arm of commitment.order) {
      arms[arm] = await completeScionSourceTeacherCase({
        model: health.modelId,
        entry,
        teacherPolicyAccess: arm === 'teacher',
      });
    }
    rows.push({
      caseId: entry.id,
      domain: entry.domain,
      inputSha256: commitment.inputSha256,
      matchedArmOrder: commitment.order,
      matchedControl: arms['matched-control'],
      teacher: arms.teacher,
      postRunReview: {
        numberedSourceClaims: entry.sourceClaims.map((text, index) => ({ index, text })),
        authorizedSourceFactIndexes: entry.originalTerm.sourceFactIndexes,
        syntheticDefectTerm: entry.originalTerm,
        committedReferenceCorrection: entry.referenceCorrection,
      },
    });
  }
  const calls = rows.flatMap((row) => [...row.matchedControl.attempts, ...row.teacher.attempts]);
  const receiptPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    calls.some((call) => call.responseModel !== health.modelId || !receiptPattern.test(call.serverRequestReceipt || '')) ||
    new Set(calls.map((call) => call.serverRequestReceipt)).size !== calls.length
  ) {
    throw new Error('Holdout provider receipt verification failed');
  }
  const control = rows.map((row) => row.matchedControl);
  const teacher = rows.map((row) => row.teacher);
  const pairedResult = paired(control, teacher);
  const safeAdmitted = rows.filter((row) => row.matchedControl.assessment.eligible || row.teacher.assessment.eligible).length;
  const summary = {
    cases: rows.length,
    domains: DOMAINS,
    matchedControlAdmitted: control.filter((entry) => entry.assessment.eligible).length,
    teacherAdmitted: teacher.filter((entry) => entry.assessment.eligible).length,
    matchedControlFirstAttemptAdmitted: control.filter((entry) => entry.attempts[0].assessment.eligible).length,
    teacherFirstAttemptAdmitted: teacher.filter((entry) => entry.attempts[0].assessment.eligible).length,
    matchedControlCalls: control.reduce((sum, entry) => sum + entry.attemptCount, 0),
    teacherCalls: teacher.reduce((sum, entry) => sum + entry.attemptCount, 0),
    paired: pairedResult,
    safeRetentionAdmitted: safeAdmitted,
    safeRetentionRate: Math.round((100 * safeAdmitted) / rows.length),
    byDomain: Object.fromEntries(
      DOMAINS.map((domain) => {
        const domainRows = rows.filter((row) => row.domain === domain);
        return [
          domain,
          {
            cases: domainRows.length,
            matchedControlAdmitted: domainRows.filter((row) => row.matchedControl.assessment.eligible).length,
            teacherAdmitted: domainRows.filter((row) => row.teacher.assessment.eligible).length,
            safeRetentionAdmitted: domainRows.filter(
              (row) => row.matchedControl.assessment.eligible || row.teacher.assessment.eligible,
            ).length,
          },
        ];
      }),
    ),
  };
  const report = {
    schemaVersion: 1,
    protocol: 'scion-roundtable-source-holdout-result-v1',
    status: 'precommitted-holdout-awaiting-independent-semantic-review',
    preregistrationSha256: preregistration.identity.sha256,
    model: { id: health.modelId, sourceModelId: health.sourceModelId },
    providerEvidence: {
      serverReceiptedCalls: calls.length,
      uniqueServerRequestReceipts: calls.length,
      claimBoundary: 'Local UUID receipts are unique execution receipts, not authenticated provider attestations.',
    },
    summary,
    rows,
    promotion: {
      status: 'blocked',
      productionEligible: false,
      trainingEligible: false,
      issues: [
        ...(pairedResult.losses > preregistration.thresholds.maximumTeacherPairedLosses ? ['teacher-paired-loss'] : []),
        ...(summary.safeRetentionRate < preregistration.thresholds.minimumSafeRetentionAdmissionRate
          ? ['safe-retention-below-preregistered-threshold']
          : []),
        'missing-independent-factual-and-pedagogical-review',
        'three-domain-holdout-does-not-prove-six-domain-generality',
        'runtime-sessions-not-independently-attested',
      ],
    },
    claimBoundary:
      'This is a precommitted project/source-disjoint three-domain holdout over synthetic correction defects created from previously admitted source-bound terms. Passing deterministic gates supports transfer of the repair interface only; factual and pedagogical correctness require independent review.',
  };
  report.identity = identityFor(report);
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, preregistrationSha256: report.preregistrationSha256, summary, blockers: report.promotion.issues }, null, 2));
}

const mode = process.argv[2];
if (mode === '--prepare') prepare().catch(fail);
else if (mode === '--run') run().catch(fail);
else fail(new Error('Usage: node scripts/scionRoundtableSourceHoldout.mjs --prepare|--run'));

function fail(error) {
  console.error(error);
  process.exitCode = 1;
}
