#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_CODEX_JUDGE_POLICY_ID,
  SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
  SCION_CODEX_TRAINING_REQUIRED_ORDERS,
  SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
  SCION_CODEX_TRAINING_SCORE_DIMENSIONS,
} from '../src/lib/scionCodexTrainingEvidence.js';

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, 'evaluation', 'scion-adapters', 'codex-judge-policy-v1.json');
const REGISTRY_PATH = path.join(ROOT, 'evaluation', 'scion-model-candidates.json');
const TEMPLATE_PATH = path.join(ROOT, 'evaluation', 'quality-benchmark', 'v1', 'comparison.model-judge.template.json');
const TRAINING_SCHEMA_PATH = path.join(ROOT, 'evaluation', 'scion-adapters', 'codex-training-review.schema.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'verification-output', 'scion-codex-judge-policy');
const SHA256 = /^[a-f0-9]{64}$/;

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function addIssue(issues, condition, message) {
  if (!condition) issues.push(message);
}

export async function auditScionCodexJudgePolicy({ outputDir = DEFAULT_OUTPUT } = {}) {
  const [policy, registry, template, trainingSchema] = await Promise.all([
    readJson(POLICY_PATH),
    readJson(REGISTRY_PATH),
    readJson(TEMPLATE_PATH),
    readJson(TRAINING_SCHEMA_PATH),
  ]);
  const issues = [];
  addIssue(issues, policy.schemaVersion === 1, 'policy schemaVersion must be 1');
  addIssue(issues, policy.protocolVersion === 'honest-quality-benchmark-v1', 'protocol version drift');
  addIssue(issues, policy.evidenceClass === 'model-judge', 'evidence must remain model-judge');
  addIssue(
    issues,
    policy.primaryPreferenceEvidence === 'single-model-judge',
    'primary preference mode must remain single-model-judge',
  );
  addIssue(issues, policy.judge?.model === 'openai/codex', 'judge model must remain Codex');
  addIssue(issues, SHA256.test(String(policy.judge?.promptSha256 || '')), 'judge prompt hash is invalid');
  addIssue(issues, SHA256.test(String(policy.heldout?.manifestSha256 || '')), 'held-out manifest hash is invalid');
  const promptPath = path.resolve(ROOT, policy.judge?.promptPath || '');
  const heldoutPath = path.resolve(ROOT, policy.heldout?.manifestPath || '');
  const [promptBytes, heldoutBytes, heldout] = await Promise.all([
    fs.readFile(promptPath),
    fs.readFile(heldoutPath),
    readJson(heldoutPath),
  ]);
  addIssue(issues, digest(promptBytes) === policy.judge.promptSha256, 'judge prompt bytes do not match policy hash');
  addIssue(
    issues,
    digest(heldoutBytes) === policy.heldout.manifestSha256,
    'held-out manifest bytes do not match policy hash',
  );
  const heldoutCaseIds = (heldout.courses || []).map((course) => course.courseId);
  const heldoutDomains = (heldout.courses || []).map((course) => course.domain);
  addIssue(
    issues,
    JSON.stringify(heldoutCaseIds) === JSON.stringify(policy.heldout.caseIds),
    'held-out case identities drifted from judge policy',
  );
  addIssue(
    issues,
    JSON.stringify(heldoutDomains) === JSON.stringify(policy.heldout.domains),
    'held-out domains drifted from judge policy',
  );
  const comparison = policy.comparison || {};
  addIssue(issues, heldoutCaseIds.length === 5, 'judge policy must bind exactly five frozen held-out cases');
  addIssue(issues, comparison.minimumTrialsPerCase >= 10, 'minimumTrialsPerCase must be at least 10');
  addIssue(issues, comparison.requiredPassesPerTrial >= 2, 'requiredPassesPerTrial must be at least 2');
  addIssue(
    issues,
    JSON.stringify(comparison.requiredOrders) === JSON.stringify(['A/B', 'B/A']),
    'required orders must be A/B and B/A',
  );
  addIssue(
    issues,
    comparison.minimumStableTrialOutcomes === heldoutCaseIds.length * comparison.minimumTrialsPerCase,
    'stable-trial floor must cover every case and trial',
  );
  addIssue(
    issues,
    comparison.minimumRecordedJudgePasses === comparison.minimumStableTrialOutcomes * comparison.requiredPassesPerTrial,
    'judge-pass floor must cover both orders for every stable trial',
  );
  addIssue(issues, comparison.scoreBeforePreference === true, 'score-before-preference must remain required');
  addIssue(issues, comparison.requireHashBoundArtifacts === true, 'artifact hashes must remain required');
  addIssue(issues, comparison.requireHashBoundScorecards === true, 'scorecard hashes must remain required');
  addIssue(issues, comparison.retainPositionDisagreements === true, 'position disagreements must be retained');

  const training = policy.trainingPreferences || {};
  addIssue(issues, policy.id === SCION_CODEX_JUDGE_POLICY_ID, 'judge policy id drifted');
  addIssue(issues, training.protocol === SCION_CODEX_TRAINING_REVIEW_PROTOCOL, 'training protocol drifted');
  addIssue(issues, training.sourcePacketProtocol === 'scion-blind-atom-packet-v4', 'atom packet protocol drifted');
  addIssue(
    issues,
    training.primaryPreferenceEvidence === 'single-model-judge',
    'training preference mode must remain single-model-judge',
  );
  addIssue(
    issues,
    JSON.stringify(training.requiredOrders) === JSON.stringify(SCION_CODEX_TRAINING_REQUIRED_ORDERS),
    'training orders must be A/B and B/A',
  );
  addIssue(issues, training.requiredFreshSessions === 2, 'training must require two fresh Codex sessions');
  addIssue(issues, training.scoreBeforePreference === true, 'training score-before-preference must remain required');
  addIssue(issues, training.requireHashBoundArtifacts === true, 'training artifact hashes must remain required');
  addIssue(issues, training.requireHashBoundScorecards === true, 'training scorecard hashes must remain required');
  addIssue(issues, training.requireNeutralSourceContext === true, 'training source context must remain required');
  addIssue(
    issues,
    training.minimumWinnerScore === SCION_CODEX_TRAINING_MINIMUM_WINNER_SCORE,
    'training winner score floor drifted',
  );
  addIssue(
    issues,
    JSON.stringify(training.scoreDimensions) === JSON.stringify(SCION_CODEX_TRAINING_SCORE_DIMENSIONS),
    'training score dimensions drifted',
  );
  addIssue(issues, training.minimumResearchPairs >= 100, 'research pair floor must be at least 100');
  addIssue(issues, training.minimumResearchDomains >= 4, 'research domain floor must be at least four');
  addIssue(issues, training.minimumCandidatePairs >= 3000, 'candidate pair floor must be at least 3000');
  addIssue(issues, training.minimumCandidateDomains >= 5, 'candidate domain floor must be at least five');
  addIssue(
    issues,
    trainingSchema.properties?.protocol?.const === SCION_CODEX_TRAINING_REVIEW_PROTOCOL,
    'training review schema protocol drifted',
  );
  addIssue(
    issues,
    trainingSchema.properties?.judge?.properties?.promptSha256?.const === policy.judge.promptSha256,
    'training review schema prompt hash drifted',
  );

  const promotion = registry.promotionPolicy || {};
  addIssue(
    issues,
    promotion.qualityPreferenceMode === policy.primaryPreferenceEvidence,
    'model registry preference mode does not match judge policy',
  );
  addIssue(
    issues,
    promotion.minimumQualityComparisonCases === heldoutCaseIds.length,
    'model registry must require all five held-out cases',
  );
  addIssue(
    issues,
    promotion.minimumQualityTrialsPerCase === comparison.minimumTrialsPerCase,
    'model registry per-case trial floor does not match judge policy',
  );
  addIssue(
    issues,
    promotion.minimumStableModelJudgeTrials === comparison.minimumStableTrialOutcomes,
    'model registry stable-trial floor does not match judge policy',
  );
  addIssue(
    issues,
    promotion.minimumModelJudgePassesPerTrial === comparison.requiredPassesPerTrial,
    'model registry pass floor does not match judge policy',
  );
  addIssue(issues, promotion.requireBothModelJudgeOrders === true, 'model registry must require both orders');

  addIssue(
    issues,
    template.preregistration?.primaryPreferenceEvidence === policy.primaryPreferenceEvidence,
    'model-judge template preference mode drifted',
  );
  addIssue(
    issues,
    template.preregistration?.minimumTrialsPerCase === comparison.minimumTrialsPerCase,
    'model-judge template trial floor drifted',
  );
  addIssue(
    issues,
    template.preregistration?.modelJudge?.requiredPassesPerTrial === comparison.requiredPassesPerTrial,
    'model-judge template pass floor drifted',
  );
  addIssue(
    issues,
    JSON.stringify(template.preregistration?.modelJudge?.requiredOrders) === JSON.stringify(comparison.requiredOrders),
    'model-judge template order contract drifted',
  );

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? 'passed' : 'failed',
    policyId: policy.id,
    evidenceClass: policy.evidenceClass,
    claimBoundary: policy.claimBoundary,
    judge: {
      model: policy.judge.model,
      promptSha256: policy.judge.promptSha256,
      revisionPolicy: policy.judge.revisionPolicy,
    },
    heldout: {
      manifestSha256: policy.heldout.manifestSha256,
      caseCount: heldoutCaseIds.length,
      caseIds: heldoutCaseIds,
      domains: heldoutDomains,
    },
    comparison: {
      stableTrialFloor: comparison.minimumStableTrialOutcomes,
      recordedPassFloor: comparison.minimumRecordedJudgePasses,
      requiredOrders: comparison.requiredOrders,
    },
    trainingPreferences: {
      protocol: training.protocol,
      requiredOrders: training.requiredOrders,
      requiredFreshSessions: training.requiredFreshSessions,
      minimumWinnerScore: training.minimumWinnerScore,
      minimumResearchPairs: training.minimumResearchPairs,
      minimumCandidatePairs: training.minimumCandidatePairs,
      approvedOutputPath: training.approvedOutputPath,
    },
    issues,
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(
    path.join(outputDir, 'latest.md'),
    [
      '# Scion Codex judge policy audit',
      '',
      `Status: **${report.status}**`,
      '',
      `Judge: ${report.judge.model}`,
      `Prompt SHA-256: ${report.judge.promptSha256}`,
      `Frozen held-out cases: ${report.heldout.caseCount}`,
      `Stable trial floor: ${report.comparison.stableTrialFloor}`,
      `Recorded reversed-order pass floor: ${report.comparison.recordedPassFloor}`,
      `Training preference protocol: ${report.trainingPreferences.protocol}`,
      `Training research floor: ${report.trainingPreferences.minimumResearchPairs} stable pairs`,
      '',
      `> ${report.claimBoundary}`,
      '',
      ...(issues.length ? ['## Issues', '', ...issues.map((issue) => `- ${issue}`), ''] : []),
    ].join('\n'),
  );
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  auditScionCodexJudgePolicy()
    .then((report) => {
      console.log(`Scion Codex judge policy: ${report.status}`);
      console.log(`Cases: ${report.heldout.caseCount}; stable trials: ${report.comparison.stableTrialFloor}`);
      if (report.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
