#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { assessScionKeyTermContract } from '../src/lib/scionKeyTermContract.js';
import {
  SCION_KEY_TERM_RECOVERY_CAMPAIGNS,
  SCION_KEY_TERM_RECOVERY_FROZEN_CASES,
} from './lib/scionKeyTermRecovery.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import { materializeSourceCaptureCampaign, parseSourceAtomResponse } from './lib/scionSourceCapture.mjs';
import {
  assessScionTruthGate,
  decideScionTruthGatePreflight,
} from './lib/scionTruthGate.mjs';

const PRIOR_PREREG = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-prereg-v0.17.12.json';
const PRIOR_RESULT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v0.17.12.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v2-preflight-v0.17.13.json';
const FULL_SEED_PACKET = 'evaluation/scion-adapters/evidence/scion-truth-gate-full-holdout-packet-v0.17.13.json';
const FULL_REVIEW_BUNDLE = 'evaluation/scion-adapters/evidence/scion-truth-gate-full-holdout-review-bundle-v0.17.13.json';
const REQUIRED_DOMAINS = ['computer-science', 'geology', 'music-theory'];
const REQUIRED_PER_DOMAIN = 4;
const execFile = promisify(execFileCallback);

function domainFor(caseId) {
  if (caseId.includes(':cs/')) return 'computer-science';
  if (caseId.includes(':geo/')) return 'geology';
  if (caseId.includes(':music/')) return 'music-theory';
  return 'unknown';
}

async function main() {
  const prior = JSON.parse(await fs.readFile(PRIOR_PREREG, 'utf8'));
  const priorResult = JSON.parse(await fs.readFile(PRIOR_RESULT, 'utf8'));
  const priorPrompts = new Set(prior.cases.map((entry) => entry.caseId.replace(/:key-term-\d+$/, '')));
  const priorProjects = new Set(prior.cases.map((entry) => entry.caseId.split(':')[0]));
  const normalizedSourceHash = (value) =>
    scionLessonKernelSha256(String(value || '').toLowerCase().replace(/\s+/g, ' ').trim());
  const priorSourceContentHashes = new Set(
    priorResult.rows.flatMap((row) =>
      row.postRunReview.numberedSourceClaims.map((claim) => normalizedSourceHash(claim.text)),
    ),
  );
  const priorSourceClaims = priorResult.rows.flatMap((row) =>
    row.postRunReview.numberedSourceClaims.map((claim) => claim.text),
  );
  const developmentProjects = new Set(SCION_KEY_TERM_RECOVERY_FROZEN_CASES.map((caseId) => caseId.split(':')[0]));
  const candidates = [];
  for (const config of SCION_KEY_TERM_RECOVERY_CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ cwd: process.cwd(), manifestPath: config.manifest });
    for (const group of campaign.groups) {
      if (developmentProjects.has(group.id) || priorProjects.has(group.id)) continue;
      const file = path.posix.join(config.evidenceDir, `${group.id}-local.json`);
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      const rawByPrompt = new Map(value.scionSourceCapture.compilerRecovery.rawCalls.map((call) => [call.promptId, call]));
      for (const prompt of group.prompts) {
        if (priorPrompts.has(prompt.id)) continue;
        if (prompt.sourceClaims.some((claim) => priorSourceContentHashes.has(normalizedSourceHash(claim)))) continue;
        let terms = [];
        try {
          terms = (parseSourceAtomResponse(rawByPrompt.get(prompt.id)?.response)?.keyTerms || []).slice(0, 2);
        } catch {
          continue;
        }
        terms.forEach((term, index) => {
          const authorizedClaims = (term.sourceFactIndexes || [])
            .filter((sourceIndex) => Number.isInteger(sourceIndex) && prompt.sourceClaims[sourceIndex] !== undefined)
            .map((sourceIndex) => prompt.sourceClaims[sourceIndex]);
          const assessment = assessScionKeyTermContract(term, {
            definitionMin: 45,
            knownFacts: authorizedClaims,
            semanticProfile: 'source-strict-v6',
          });
          if (!assessment.eligible || authorizedClaims.length === 0) return;
          const caseId = `${prompt.id}:key-term-${index}`;
          candidates.push({
            caseId,
            domain: domainFor(caseId),
            promptId: prompt.id,
            inputSha256: scionLessonKernelSha256({ sourceClaims: prompt.sourceClaims, term }),
          });
        });
      }
    }
  }
  const availableByDomain = Object.fromEntries(
    REQUIRED_DOMAINS.map((domain) => [domain, candidates.filter((entry) => entry.domain === domain).length]),
  );
  const deficits = Object.fromEntries(
    REQUIRED_DOMAINS.map((domain) => [domain, Math.max(0, REQUIRED_PER_DOMAIN - availableByDomain[domain])]),
  );
  const readJsonIfPresent = async (file, fallback) => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return fallback;
      throw error;
    }
  };
  const fullSeedPacket = await readJsonIfPresent(FULL_SEED_PACKET, { seeds: [] });
  const fullReviewBundle = await readJsonIfPresent(FULL_REVIEW_BUNDLE, { receipts: [] });
  const fullSeedPacketCopy = structuredClone(fullSeedPacket);
  delete fullSeedPacketCopy.identity;
  const priorSourceExclusions = fullSeedPacket.priorSourceExclusions || {};
  const fullSeedPacketValid =
    fullSeedPacket.protocol === 'scion-truth-gate-full-holdout-packet-v1' &&
    fullSeedPacket.schemaVersion === 1 &&
    fullSeedPacket.status === 'frozen-before-independent-review' &&
    fullSeedPacket.productionEligible === false &&
    fullSeedPacket.trainingEligible === false &&
    fullSeedPacket.trustedReviewAuthorityFingerprints?.length === 1 &&
    ['sourceIds', 'sourceUrls', 'sourceEvidenceHashes', 'sourcePacketSha256s'].every((key) =>
      Array.isArray(priorSourceExclusions[key])) &&
    fullSeedPacket.identity?.algorithm === 'sha256-canonical-json' &&
    fullSeedPacket.identity?.sha256 === scionLessonKernelSha256(fullSeedPacketCopy);
  const fullReviewBundleCopy = structuredClone(fullReviewBundle);
  delete fullReviewBundleCopy.identity;
  let fullPacketGitBound = false;
  try {
    if (!/^[a-f0-9]{40}$/.test(fullReviewBundle.seedPacketGitCommit || '')) throw new Error('invalid commit');
    const { stdout } = await execFile('git', ['show', `${fullReviewBundle.seedPacketGitCommit}:${FULL_SEED_PACKET}`], {
      maxBuffer: 5_000_000,
    });
    fullPacketGitBound = JSON.parse(stdout).identity?.sha256 === fullSeedPacket.identity?.sha256;
  } catch {
    fullPacketGitBound = false;
  }
  const fullReviewBundleValid =
    fullReviewBundle.protocol === 'scion-truth-gate-full-holdout-review-bundle-v1' &&
    fullReviewBundle.schemaVersion === 1 &&
    fullReviewBundle.seedPacketSha256 === fullSeedPacket.identity?.sha256 &&
    fullPacketGitBound &&
    fullReviewBundle.identity?.algorithm === 'sha256-canonical-json' &&
    fullReviewBundle.identity?.sha256 === scionLessonKernelSha256(fullReviewBundleCopy);
  const receiptAssessment = assessScionTruthGate({
    seeds: fullSeedPacketValid ? fullSeedPacket.seeds || [] : [],
    receipts:
      fullSeedPacketValid && fullReviewBundleValid
        ? fullReviewBundle.receipts || []
        : [],
    reviewAuthorities:
      fullSeedPacketValid && fullReviewBundleValid
        ? fullReviewBundle.reviewAuthorities || []
        : [],
    trustedReviewAuthorityFingerprints: fullSeedPacketValid
      ? fullSeedPacket.trustedReviewAuthorityFingerprints || []
      : [],
    priorSourceContentHashes: [...priorSourceContentHashes],
    priorSourceClaims,
    priorSourceIds: priorSourceExclusions.sourceIds || [],
    priorSourceUrls: priorSourceExclusions.sourceUrls || [],
    priorSourceEvidenceHashes: priorSourceExclusions.sourceEvidenceHashes || [],
    priorSourcePacketSha256s: priorSourceExclusions.sourcePacketSha256s || [],
    excludedProjectIds: [...new Set([...developmentProjects, ...priorProjects])],
    excludedPromptIds: [...priorPrompts],
    requiredDomains: REQUIRED_DOMAINS,
    requiredCasesPerDomain: REQUIRED_PER_DOMAIN,
    minimumIndependentReceipts: 2,
    assessedAt: '2026-08-04T20:30:00.000Z',
    mode: 'full-holdout',
  });
  const decision = decideScionTruthGatePreflight({ discoveryDeficits: deficits, receiptAssessment });
  const preflight = {
    schemaVersion: 2,
    protocol: 'scion-roundtable-source-holdout-v2-preflight-v2',
    status: decision.status,
    exclusions: {
      developmentProjects: [...developmentProjects].sort(),
      priorHoldoutPromptIdsSha256: scionLessonKernelSha256([...priorPrompts].sort()),
      priorHoldoutProjectIdsSha256: scionLessonKernelSha256([...priorProjects].sort()),
      requirePromptLevelSourceDisjointness: true,
      requireProjectDisjointness: true,
      requireNormalizedSourceContentOverlapZero: true,
      priorSourceContentSetSha256: scionLessonKernelSha256([...priorSourceContentHashes].sort()),
    },
    gate: {
      sourceStrictProfile: 'source-strict-v6',
      onlyAuthorizedSourceFactIndexes: true,
      minimumIndependentSeedReviewReceipts: 2,
      reviewReceiptsAreExecutableAdmissionRequirements: true,
      requireReceiptSeedSourceAndInputHashBindings: true,
      requireDistinctReviewerAndSessionReferences: true,
      requireUnanimousFactualPedagogicalAndSourceVerdicts: true,
      requirePeerAndOutcomeBlindnessAttestations: true,
      requireIdentityValidFrozenSeedPacket: true,
      requireIdentityValidPacketBoundReviewBundle: true,
      fullSeedPacketValid,
      fullReviewBundleValid,
      fullPacketGitBound,
      requiredDomains: REQUIRED_DOMAINS,
      requiredCasesPerDomain: REQUIRED_PER_DOMAIN,
      freezeMembershipAndArmOrderBeforeInference: true,
      failClosedWhenCorpusIsInsufficient: true,
    },
    discovery: {
      claimBoundary: 'Discovery counts are planning evidence only and can never make preregistration ready.',
      availableByDomain,
      deficits,
      candidateCommitments: candidates.map((entry) => ({
        caseIdSha256: scionLessonKernelSha256(entry.caseId),
        domain: entry.domain,
        inputSha256: entry.inputSha256,
      })),
    },
    receiptAdmission: receiptAssessment,
    nextAction: receiptAssessment.seedAssessments.length === 0
      ? 'Prepare twelve new source-disjoint Truth Gate seeds, then obtain two bound independent reviews per seed.'
      : 'Resolve every Truth Gate quarantine; counts alone cannot unlock preregistration.',
    claimBoundary:
      'This preflight can become ready only through executable source, semantic, and independent-review admission. It performs no model inference and creates no model-quality claim.',
  };
  preflight.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(preflight) };
  await fs.writeFile(OUTPUT, `${JSON.stringify(preflight, null, 2)}\n`);
  console.log(JSON.stringify({
    status: preflight.status,
    discoveryAvailableByDomain: availableByDomain,
    discoveryDeficits: deficits,
    receiptAdmittedByDomain: receiptAssessment.availableByDomain,
    receiptGateValid: decision.receiptGateValid,
    nextAction: preflight.nextAction,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
