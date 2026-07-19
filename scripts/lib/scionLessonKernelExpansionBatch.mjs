import {
  SCION_LESSON_KERNEL_FAILURE_FAMILIES,
  scionLessonKernelSha256,
  validateScionLessonKernelCampaign,
} from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_EXPANSION_BATCH_PROTOCOL = 'scion-lesson-kernel-expansion-batch-v1';
export const SCION_LESSON_KERNEL_EXPANSION_BATCH_SCHEMA_VERSION = 1;

function countBy(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

function compareVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function selectionVector(candidate, state, campaignFamilyCounts) {
  const unseenFamilies = candidate.failureFamilies.filter((family) => !state.families.has(family));
  const familyRarity = candidate.failureFamilies.reduce(
    (total, family) => total + Math.round(10_000 / Math.max(1, campaignFamilyCounts[family] || 0)),
    0,
  );
  return [
    unseenFamilies.length,
    state.primaryFamilies.has(candidate.primaryFailureFamily) ? 0 : 1,
    state.courseGroups.has(candidate.courseGroupId) ? 0 : 1,
    state.sourceKernels.has(candidate.sourceContext.kernelId) ? 0 : 1,
    Math.round(10_000 / Math.max(1, campaignFamilyCounts[candidate.primaryFailureFamily] || 0)),
    familyRarity,
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
    primaryFailureFamilies: countBy(cases.map((entry) => entry.primaryFailureFamily)),
    failureFamilies: Object.fromEntries(
      SCION_LESSON_KERNEL_FAILURE_FAMILIES.map((family) => [
        family,
        cases.filter((entry) => entry.failureFamilies.includes(family)).length,
      ]),
    ),
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

export function buildScionLessonKernelExpansionBatch({
  campaign,
  campaignPath,
  campaignFileSha256,
  excludedCaseIds = [],
  exclusionSources = [],
  batchSize = 14,
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
  const eligible = campaign.cases.filter((entry) => !excluded.has(entry.caseId));
  const domains = [...new Set(eligible.map((entry) => entry.domain))].sort();
  if (batchSize < domains.length) throw new Error('batchSize must cover every eligible training domain');
  if (eligible.length < batchSize) throw new Error('Not enough eligible campaign cases for requested batch');

  const baseQuota = Math.floor(batchSize / domains.length);
  const extra = batchSize % domains.length;
  const domainQuotas = Object.fromEntries(
    domains.map((domain, index) => [domain, baseQuota + (index < extra ? 1 : 0)]),
  );
  const campaignFamilyCounts = campaign.summary.failureFamilies;
  const selected = [];
  const state = {
    families: new Set(),
    primaryFamilies: new Set(),
    courseGroups: new Set(),
    sourceKernels: new Set(),
  };

  for (let round = 0; round < Math.max(...Object.values(domainQuotas)); round += 1) {
    for (const domain of domains) {
      if (round >= domainQuotas[domain]) continue;
      const candidates = eligible.filter(
        (entry) => entry.domain === domain && !selected.some((selectedEntry) => selectedEntry.caseId === entry.caseId),
      );
      const chosen = chooseCandidate(candidates, state, campaignFamilyCounts);
      if (!chosen) throw new Error(`Unable to satisfy domain quota for ${domain}`);
      selected.push(chosen);
      chosen.failureFamilies.forEach((family) => state.families.add(family));
      state.primaryFamilies.add(chosen.primaryFailureFamily);
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
    primaryFailureFamily: entry.primaryFailureFamily,
    failureFamilies: entry.failureFamilies,
  }));
  const summary = summarize(selected);
  summary.allFailureFamiliesCovered = Object.values(summary.failureFamilies).every((count) => count > 0);

  const batch = {
    schemaVersion: SCION_LESSON_KERNEL_EXPANSION_BATCH_SCHEMA_VERSION,
    protocol: SCION_LESSON_KERNEL_EXPANSION_BATCH_PROTOCOL,
    generatedAt,
    status: 'capture-ready',
    campaign: {
      path: campaignPath,
      fileSha256: campaignFileSha256,
      identitySha256: campaign.identity.sha256,
      caseCount: campaign.cases.length,
    },
    selectionPolicy: {
      name: 'domain-balanced-defect-directed-greedy-v1',
      batchSize,
      domainQuotas,
      heldoutDomainFirewall: 'enforced',
      modelPromptUse: 'forbidden',
      priorities: [
        'uncovered-failure-family',
        'uncovered-primary-failure-family',
        'new-course-group',
        'new-source-kernel',
        'rare-primary-family',
        'rare-family-set',
        'source-claim-breadth',
        'case-id-stability',
      ],
      selectorImplementationSha256,
    },
    exclusions: {
      caseCount: excluded.size,
      caseIds: [...excluded].sort(),
      sources: [...exclusionSources].sort((left, right) => left.path.localeCompare(right.path)),
    },
    summary,
    cases,
    claimBoundary: {
      selectionOnly: true,
      preferenceWins: 0,
      trainingRows: 0,
      adapterEvidence: false,
      statement:
        'This manifest selects uncaptured training-domain cases. It does not claim model quality, a preference win, or adapter readiness.',
    },
  };
  batch.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(identityPayload(batch)),
  };
  return batch;
}

export function validateScionLessonKernelExpansionBatch(batch, campaign) {
  const issues = [];
  if (batch?.schemaVersion !== SCION_LESSON_KERNEL_EXPANSION_BATCH_SCHEMA_VERSION) {
    issues.push('schema-version');
  }
  if (batch?.protocol !== SCION_LESSON_KERNEL_EXPANSION_BATCH_PROTOCOL) issues.push('protocol');
  if (batch?.status !== 'capture-ready') issues.push('status');
  if (batch?.campaign?.identitySha256 !== campaign?.identity?.sha256) issues.push('campaign-identity');
  const campaignCases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const excluded = new Set(batch?.exclusions?.caseIds || []);
  const seen = new Set();
  for (const entry of batch?.cases || []) {
    const source = campaignCases.get(entry.caseId);
    if (!source || source.caseSha256 !== entry.caseSha256) issues.push(`case:${entry.caseId}`);
    if (excluded.has(entry.caseId)) issues.push(`excluded:${entry.caseId}`);
    if (seen.has(entry.caseId)) issues.push(`duplicate:${entry.caseId}`);
    seen.add(entry.caseId);
  }
  if ((batch?.cases || []).length !== batch?.selectionPolicy?.batchSize) issues.push('batch-size');
  if (!batch?.summary?.allFailureFamiliesCovered) issues.push('failure-family-coverage');
  if (batch?.claimBoundary?.preferenceWins !== 0 || batch?.claimBoundary?.trainingRows !== 0) {
    issues.push('claim-boundary');
  }
  if (batch?.identity?.sha256 !== scionLessonKernelSha256(identityPayload(batch))) issues.push('identity');
  return { valid: issues.length === 0, issues };
}
