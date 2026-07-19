import {
  SCION_LESSON_KERNEL_FAILURE_FAMILIES,
  scionLessonKernelSha256,
  validateScionLessonKernelCampaign,
} from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_PROTOCOL = 'scion-lesson-kernel-expansion-batch-v2';
export const SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_SCHEMA_VERSION = 2;

function countBy(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

function countFailureFamilies(cases) {
  return Object.fromEntries(
    SCION_LESSON_KERNEL_FAILURE_FAMILIES.map((family) => [
      family,
      cases.filter((entry) => entry.failureFamilies.includes(family)).length,
    ]),
  );
}

function compareVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function inverseCountWeight(count) {
  return Math.round(10_000 / (1 + Math.max(0, count || 0)));
}

function selectionVector(candidate, state, campaignFamilyCounts) {
  const batchUnseenFamilies = candidate.failureFamilies.filter((family) => !state.batchFamilies.has(family));
  const cumulativeFamilyDeficit = candidate.failureFamilies.reduce(
    (total, family) => total + inverseCountWeight(state.familyCounts[family]),
    0,
  );
  const campaignFamilyRarity = candidate.failureFamilies.reduce(
    (total, family) => total + inverseCountWeight(campaignFamilyCounts[family]),
    0,
  );
  return [
    batchUnseenFamilies.length,
    state.batchPrimaryFamilies.has(candidate.primaryFailureFamily) ? 0 : 1,
    state.courseGroups.has(candidate.courseGroupId) ? 0 : 1,
    state.sourceKernels.has(candidate.sourceContext.kernelId) ? 0 : 1,
    inverseCountWeight(state.primaryFamilyCounts[candidate.primaryFailureFamily]),
    cumulativeFamilyDeficit,
    inverseCountWeight(campaignFamilyCounts[candidate.primaryFailureFamily]),
    campaignFamilyRarity,
    candidate.sourceContext.claims.length,
  ];
}

function chooseCandidate(candidates, state, campaignFamilyCounts) {
  return [...candidates].sort((left, right) => {
    const vectorOrder = compareVectors(
      selectionVector(left, state, campaignFamilyCounts),
      selectionVector(right, state, campaignFamilyCounts),
    );
    return vectorOrder || left.caseId.localeCompare(right.caseId);
  })[0];
}

function summarize(cases) {
  return {
    cases: cases.length,
    domains: countBy(cases.map((entry) => entry.domain)),
    courseGroups: new Set(cases.map((entry) => entry.courseGroupId)).size,
    sourceKernels: new Set(cases.map((entry) => entry.sourceContext.kernelId)).size,
    licenses: countBy(cases.map((entry) => entry.license)),
    primaryFailureFamilies: countBy(cases.map((entry) => entry.primaryFailureFamily)),
    failureFamilies: countFailureFamilies(cases),
  };
}

function identityPayload(batch) {
  return {
    schemaVersion: batch.schemaVersion,
    protocol: batch.protocol,
    generatedAt: batch.generatedAt,
    status: batch.status,
    campaign: batch.campaign,
    selectionPolicy: batch.selectionPolicy,
    exclusions: batch.exclusions,
    summary: batch.summary,
    cases: batch.cases,
    claimBoundary: batch.claimBoundary,
  };
}

function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

export function buildScionLessonKernelExpansionBatchV2({
  campaign,
  campaignPath,
  campaignFileSha256,
  excludedCaseIds = [],
  exclusionSources = [],
  batchSize = 28,
  generatedAt,
  selectorImplementationSha256,
}) {
  const campaignValidation = validateScionLessonKernelCampaign(campaign);
  if (!campaignValidation.valid) {
    throw new Error(`Invalid lesson-kernel campaign: ${campaignValidation.issues.join(', ')}`);
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be a positive integer');
  if (!generatedAt) throw new Error('generatedAt is required');

  const heldoutDomains = new Set(campaign.heldoutBenchmark?.domains || []);
  const heldoutGroups = new Set(campaign.heldoutBenchmark?.courseGroups || []);
  const forbidden = campaign.cases.filter(
    (entry) => heldoutDomains.has(entry.domain) || heldoutGroups.has(entry.courseGroupId),
  );
  if (forbidden.length > 0) throw new Error('Campaign violates the held-out domain firewall');

  const excluded = new Set(excludedCaseIds);
  const priorCases = campaign.cases.filter((entry) => excluded.has(entry.caseId));
  const eligible = campaign.cases.filter((entry) => !excluded.has(entry.caseId));
  const domains = [...new Set(eligible.map((entry) => entry.domain))].sort();
  if (batchSize < domains.length) throw new Error('batchSize must cover every eligible training domain');
  if (eligible.length < batchSize) throw new Error('Not enough eligible campaign cases for requested batch');

  const baseQuota = Math.floor(batchSize / domains.length);
  const extra = batchSize % domains.length;
  const domainQuotas = Object.fromEntries(
    domains.map((domain, index) => [domain, baseQuota + (index < extra ? 1 : 0)]),
  );
  const state = {
    batchFamilies: new Set(),
    batchPrimaryFamilies: new Set(),
    courseGroups: new Set(priorCases.map((entry) => entry.courseGroupId)),
    sourceKernels: new Set(priorCases.map((entry) => entry.sourceContext.kernelId)),
    familyCounts: countFailureFamilies(priorCases),
    primaryFamilyCounts: countBy(priorCases.map((entry) => entry.primaryFailureFamily)),
  };
  const historicalCourseGroups = new Set(state.courseGroups);
  const historicalSourceKernels = new Set(state.sourceKernels);
  const campaignFamilyCounts = campaign.summary.failureFamilies;
  const selected = [];

  for (let round = 0; round < Math.max(...Object.values(domainQuotas)); round += 1) {
    for (const domain of domains) {
      if (round >= domainQuotas[domain]) continue;
      const candidates = eligible.filter(
        (entry) => entry.domain === domain && !selected.some((selectedEntry) => selectedEntry.caseId === entry.caseId),
      );
      const chosen = chooseCandidate(candidates, state, campaignFamilyCounts);
      if (!chosen) throw new Error(`Unable to satisfy domain quota for ${domain}`);
      selected.push(chosen);
      chosen.failureFamilies.forEach((family) => {
        state.batchFamilies.add(family);
        increment(state.familyCounts, family);
      });
      state.batchPrimaryFamilies.add(chosen.primaryFailureFamily);
      increment(state.primaryFamilyCounts, chosen.primaryFailureFamily);
      state.courseGroups.add(chosen.courseGroupId);
      state.sourceKernels.add(chosen.sourceContext.kernelId);
    }
  }

  const cases = selected.map((entry, index) => ({
    ordinal: index + 1,
    caseId: entry.caseId,
    caseSha256: entry.caseSha256,
    domain: entry.domain,
    courseGroupId: entry.courseGroupId,
    sourceKernelId: entry.sourceContext.kernelId,
    sourceClaimCount: entry.sourceContext.claims.length,
    license: entry.license,
    primaryFailureFamily: entry.primaryFailureFamily,
    failureFamilies: entry.failureFamilies,
  }));
  const batchSummary = summarize(selected);
  batchSummary.allFailureFamiliesCovered = Object.values(batchSummary.failureFamilies).every((count) => count > 0);
  batchSummary.newCourseGroups = new Set(
    selected.filter((entry) => !historicalCourseGroups.has(entry.courseGroupId)).map((entry) => entry.courseGroupId),
  ).size;
  batchSummary.newSourceKernels = new Set(
    selected
      .filter((entry) => !historicalSourceKernels.has(entry.sourceContext.kernelId))
      .map((entry) => entry.sourceContext.kernelId),
  ).size;
  const cumulativeCases = [...priorCases, ...selected];
  const cumulativeSummary = summarize(cumulativeCases);

  const batch = {
    schemaVersion: SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_SCHEMA_VERSION,
    protocol: SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_PROTOCOL,
    generatedAt,
    status: 'capture-ready',
    campaign: {
      path: campaignPath,
      fileSha256: campaignFileSha256,
      identitySha256: campaign.identity.sha256,
      caseCount: campaign.cases.length,
    },
    selectionPolicy: {
      name: 'cumulative-diversity-defect-directed-greedy-v2',
      batchSize,
      domainQuotas,
      heldoutDomainFirewall: 'enforced',
      priorCapturedCasesSeedDiversity: true,
      modelPromptUse: 'forbidden',
      priorities: [
        'batch-failure-family-coverage',
        'batch-primary-family-coverage',
        'new-course-group-across-campaign',
        'new-source-kernel-across-campaign',
        'cumulative-primary-family-deficit',
        'cumulative-family-deficit',
        'campaign-primary-family-rarity',
        'campaign-family-set-rarity',
        'source-claim-breadth',
        'case-id-stability',
      ],
      selectorImplementationSha256,
    },
    exclusions: {
      suppliedCaseCount: excluded.size,
      campaignCaseCount: priorCases.length,
      caseIds: [...excluded].sort(),
      sources: [...exclusionSources].sort((left, right) => left.path.localeCompare(right.path)),
    },
    summary: {
      batch: batchSummary,
      cumulativeSelectedCampaignSurface: cumulativeSummary,
    },
    cases,
    claimBoundary: {
      selectionOnly: true,
      preferenceWins: 0,
      trainingRows: 0,
      adapterEvidence: false,
      statement:
        'This manifest selects unseen training-domain cases from cumulative defect and diversity deficits. It does not claim model quality, a preference win, or adapter readiness.',
    },
  };
  batch.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(identityPayload(batch)),
  };
  return batch;
}

export function validateScionLessonKernelExpansionBatchV2(batch, campaign) {
  const issues = [];
  if (batch?.schemaVersion !== SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_SCHEMA_VERSION) {
    issues.push('schema-version');
  }
  if (batch?.protocol !== SCION_LESSON_KERNEL_EXPANSION_BATCH_V2_PROTOCOL) issues.push('protocol');
  if (batch?.status !== 'capture-ready') issues.push('status');
  if (batch?.campaign?.identitySha256 !== campaign?.identity?.sha256) issues.push('campaign-identity');
  if (batch?.selectionPolicy?.heldoutDomainFirewall !== 'enforced') issues.push('heldout-firewall');
  if (batch?.selectionPolicy?.priorCapturedCasesSeedDiversity !== true) issues.push('cumulative-diversity');
  const campaignCases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const excluded = new Set(batch?.exclusions?.caseIds || []);
  const heldoutDomains = new Set(campaign?.heldoutBenchmark?.domains || []);
  const heldoutGroups = new Set(campaign?.heldoutBenchmark?.courseGroups || []);
  const seen = new Set();
  const observedDomains = [];
  for (const entry of batch?.cases || []) {
    const source = campaignCases.get(entry.caseId);
    if (
      !source ||
      source.caseSha256 !== entry.caseSha256 ||
      source.sourceContext.kernelId !== entry.sourceKernelId ||
      source.license !== entry.license
    ) {
      issues.push(`case:${entry.caseId}`);
    }
    if (excluded.has(entry.caseId)) issues.push(`excluded:${entry.caseId}`);
    if (heldoutDomains.has(entry.domain) || heldoutGroups.has(entry.courseGroupId)) {
      issues.push(`heldout:${entry.caseId}`);
    }
    if (seen.has(entry.caseId)) issues.push(`duplicate:${entry.caseId}`);
    seen.add(entry.caseId);
    observedDomains.push(entry.domain);
  }
  if ((batch?.cases || []).length !== batch?.selectionPolicy?.batchSize) issues.push('batch-size');
  if (JSON.stringify(countBy(observedDomains)) !== JSON.stringify(batch?.selectionPolicy?.domainQuotas || {})) {
    issues.push('domain-quotas');
  }
  if (!batch?.summary?.batch?.allFailureFamiliesCovered) issues.push('failure-family-coverage');
  if (batch?.summary?.batch?.newSourceKernels < 1) issues.push('source-kernel-diversity');
  if (batch?.claimBoundary?.preferenceWins !== 0 || batch?.claimBoundary?.trainingRows !== 0) {
    issues.push('claim-boundary');
  }
  if (batch?.identity?.sha256 !== scionLessonKernelSha256(identityPayload(batch))) issues.push('identity');
  return { valid: issues.length === 0, issues };
}
