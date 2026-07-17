#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { materializeSourceCaptureCampaign } from './lib/scionSourceCapture.mjs';

const CURRENT_PACKET_RECEIPT = 'evaluation/scion-adapters/evidence/source-review-packet-v0.16.40.json';
const CURRENT_JUDGE_RECEIPT = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';
const HELD_OUT_BENCHMARK = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
const PRIOR_CAMPAIGNS = [
  'evaluation/scion-source-capture-campaign.json',
  'evaluation/scion-source-capture-expansion-v0.16.17.json',
];
export const SCION_PREFERENCE_EXPANSION_CAMPAIGN = 'evaluation/scion-source-capture-preference-expansion-v0.16.47.json';
export const SCION_PREFERENCE_EXPANSION_PLAN_RECEIPT =
  'evaluation/scion-adapters/evidence/preference-expansion-plan-v0.16.47.json';

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

function wilsonLowerBound(successes, trials, z = 1.96) {
  if (!Number.isInteger(successes) || !Number.isInteger(trials) || trials <= 0 || successes < 0 || successes > trials) {
    throw new Error(`Invalid Wilson interval inputs: ${successes}/${trials}`);
  }
  const proportion = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = proportion + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((proportion * (1 - proportion)) / trials + (z * z) / (4 * trials * trials));
  return Number(((center - margin) / denominator).toFixed(6));
}

export async function buildScionPreferenceExpansionPlan({
  cwd = process.cwd(),
  generatedAt = '2026-07-16T19:30:00.000Z',
} = {}) {
  const root = path.resolve(cwd);
  const [currentPacket, currentJudge, holdout, campaign, ...priorCampaigns] = await Promise.all([
    readJson(root, CURRENT_PACKET_RECEIPT),
    readJson(root, CURRENT_JUDGE_RECEIPT),
    readJson(root, HELD_OUT_BENCHMARK),
    materializeSourceCaptureCampaign({ manifestPath: SCION_PREFERENCE_EXPANSION_CAMPAIGN, cwd: root }),
    ...PRIOR_CAMPAIGNS.map((manifestPath) => materializeSourceCaptureCampaign({ manifestPath, cwd: root })),
  ]);

  const holdoutDomains = new Set((holdout.courses || []).map((course) => course.domain));
  const holdoutCourseIds = new Set((holdout.courses || []).map((course) => course.courseId));
  const holdoutCourseInputHashes = new Set((holdout.courses || []).map((course) => course.courseInputSha256));
  const priorGroups = priorCampaigns.flatMap((prior) => prior.groups);
  const priorGroupHashes = new Set(priorGroups.map((group) => group.courseGroupSha256));
  const qualityFocuses = campaign.groups.map((group) => group.qualityFocus);
  const overlap = {
    domains: campaign.summary.domains.filter((domain) => holdoutDomains.has(domain)),
    courseIds: campaign.groups.map((group) => group.id).filter((id) => holdoutCourseIds.has(id)),
    courseInputHashes: campaign.groups
      .map((group) => group.courseInputSha256)
      .filter((digest) => holdoutCourseInputHashes.has(digest)),
    priorCourseGroups: campaign.groups
      .map((group) => group.courseGroupSha256)
      .filter((digest) => priorGroupHashes.has(digest)),
  };

  const availableSourceCandidates = Number(currentPacket.availableSourceContextCandidates);
  const selectedCases = Number(currentPacket.selectedCases);
  const currentStablePreferences = Number(currentJudge.stablePreferences);
  const minimumResearchPreferences = Number(currentJudge.minimumResearchPreferences);
  const requiredAdditionalPreferences = minimumResearchPreferences - currentStablePreferences;
  const priorExpectedCandidates = priorCampaigns.reduce(
    (sum, priorCampaign) => sum + priorCampaign.summary.expectedCandidates,
    0,
  );
  const sourceCandidateYield = availableSourceCandidates / priorExpectedCandidates;
  const stablePreferenceLowerBound = wilsonLowerBound(currentStablePreferences, selectedCases);
  const unreviewedCurrentCandidates = availableSourceCandidates - selectedCases;
  const projectedNewSourceCandidates = Math.floor(campaign.summary.expectedCandidates * sourceCandidateYield);
  const projectedReviewableCandidates = unreviewedCurrentCandidates + projectedNewSourceCandidates;
  const projectedStablePreferences = Math.floor(projectedReviewableCandidates * stablePreferenceLowerBound);
  const projectedPreferenceHeadroom = projectedStablePreferences - requiredAdditionalPreferences;

  const assertions = {
    balancedCampaign:
      campaign.summary.groups === 8 &&
      campaign.summary.prompts === 48 &&
      campaign.summary.expectedCandidates === 192 &&
      Object.values(campaign.summary.domainGroupCounts).every((count) => count === 2),
    failureTaxonomyTargeted:
      qualityFocuses.length === campaign.summary.groups &&
      new Set(qualityFocuses).size === qualityFocuses.length &&
      qualityFocuses.every((focus) => focus.length >= 80) &&
      campaign.groups.every((group) => group.prompts.every((prompt) => prompt.user.includes(group.qualityFocus))),
    holdoutDisjoint: Object.values(overlap).every((entries) => entries.length === 0),
    capacityAtObservedLowerBound: projectedPreferenceHeadroom >= 0,
  };
  const failedAssertions = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedAssertions.length > 0) {
    throw new Error(`Preference expansion plan failed: ${failedAssertions.join(', ')}`);
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-preference-expansion-plan-v1',
    release: 'v0.16.47',
    generatedAt,
    status: 'capture-capacity-ready',
    campaign: {
      manifestPath: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      groups: campaign.summary.groups,
      prompts: campaign.summary.prompts,
      expectedNeutralCandidates: campaign.summary.expectedCandidates,
      domains: campaign.summary.domains,
      domainGroupCounts: campaign.summary.domainGroupCounts,
      failureFocuses: campaign.groups.map((group) => ({
        groupId: group.id,
        domain: group.domain,
        qualityFocus: group.qualityFocus,
      })),
    },
    currentEvidence: {
      availableSourceCandidates,
      selectedCases,
      unreviewedCurrentCandidates,
      stablePreferences: currentStablePreferences,
      minimumResearchPreferences,
      requiredAdditionalPreferences,
      priorExpectedCandidates,
      sourceCandidateYield: Number(sourceCandidateYield.toFixed(6)),
      stablePreferenceWilsonLower95: stablePreferenceLowerBound,
    },
    conservativeCapacityProjection: {
      projectedNewSourceCandidates,
      projectedReviewableCandidates,
      projectedStablePreferencesAtWilsonLower95: projectedStablePreferences,
      projectedPreferenceHeadroom,
      interpretation:
        'Capacity planning only: the projection combines the observed source-candidate yield with the 95% Wilson lower bound from the first 100-case judgment. Actual capture, admission, and two clean-room orders may produce fewer or different preferences.',
    },
    holdoutBoundary: {
      benchmarkPath: HELD_OUT_BENCHMARK,
      heldOutDomains: [...holdoutDomains].sort(),
      overlap,
      status: 'pass',
    },
    assertions,
    claimBoundary:
      'This receipt proves only that a balanced, failure-targeted, holdout-disjoint capture plan has enough conservative projected capacity to pursue the 54-row preference shortfall. It contains zero new model calls, comparisons, judgments, preferences, training rows, or adapter weights.',
  };
}

function parseArgs(argv) {
  const args = { write: false, generatedAt: '2026-07-16T19:30:00.000Z' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else throw new Error(`Unknown preference expansion plan option: ${argv[index]}`);
  }
  return args;
}

export async function runScionPreferenceExpansionPlanAudit({ cwd = process.cwd(), write = false, generatedAt } = {}) {
  const report = await buildScionPreferenceExpansionPlan({ cwd, generatedAt });
  const receiptPath = path.resolve(cwd, SCION_PREFERENCE_EXPANSION_PLAN_RECEIPT);
  if (write) {
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, canonical(report));
  } else {
    const tracked = await fs.readFile(receiptPath, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked Scion preference expansion plan is stale.');
  }
  return { report, wrote: write };
}

async function main() {
  const result = await runScionPreferenceExpansionPlanAudit(parseArgs(process.argv.slice(2)));
  const projection = result.report.conservativeCapacityProjection;
  console.log(
    `Scion preference expansion plan ${result.report.status}: ${result.report.campaign.expectedNeutralCandidates} expected neutral candidates; conservative projection ${projection.projectedStablePreferencesAtWilsonLower95}/${result.report.currentEvidence.requiredAdditionalPreferences} required stable preferences.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${SCION_PREFERENCE_EXPANSION_PLAN_RECEIPT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
