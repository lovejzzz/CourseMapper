/**
 * runDigest.js — v0.10.1: the per-run diagnostic digest.
 *
 * One structured, versioned report per package finish, designed to be the
 * primary instrument for auditing real runs: what ran, what was skipped and
 * WHY, what every model call cost (with honest pricing-accuracy labels),
 * which gates fired with their actual messages — not just counts.
 *
 * Emitted once per finish as a readable block plus one machine-parseable
 * `[CM][DIGEST] {json}` line. Replaces log archaeology across dozens of
 * repetitive cumulative-state blobs.
 */

import { buildGenerationCostReport, formatGenerationCostReport, formatUsd } from './apiUsageCost';
import { APP_VERSION } from './appVersion';

function pricingAccuracy(ledger = []) {
  if (ledger.length === 0) return 'no model calls';
  if (ledger.some((row) => row.pricingSource === 'family-estimate')) {
    return 'approximate — model priced from family rates (pricing table behind this model version)';
  }
  if (ledger.some((row) => row.estimated)) {
    return 'estimated — provider did not report token usage for some calls';
  }
  return 'tokens provider-reported; cost from published per-token rates';
}

/**
 * @param {object} args
 *  - budget: the api call budget (usageLedger, pipeline, counters, tokenUsage)
 *  - exportVerification: verifier result ({status, checked, failed, warningCount, checks})
 *  - finish: { finalStatus, blockers, warnings, repairsApplied, retryCallCount, finishRunId,
 *      assessmentReconciliationIssues }
 *  - generation: { provider, modelId, lessonCount, featureIds }
 */
export function buildRunDigest({ budget = {}, exportVerification = null, finish = {}, generation = {} } = {}) {
  const ledger = Array.isArray(budget.usageLedger) ? budget.usageLedger : [];
  const costReport = buildGenerationCostReport(budget);
  const quality = finish.quality || null;
  const qualityCounts = quality?.findingCounts || {};
  const qualityP0 = Number(qualityCounts.p0) || 0;
  const qualityP1 = Number(qualityCounts.p1) || 0;
  const qualityP2 = Number(qualityCounts.p2) || 0;
  const qualityFindings = Array.isArray(quality?.findings) ? quality.findings : [];
  const checks = Array.isArray(exportVerification?.checks) ? exportVerification.checks : [];
  const flaggedChecks = checks
    .filter((check) => check.status !== 'passed')
    .slice(0, 12)
    .map((check) => ({
      featureId: check.featureId,
      status: check.status,
      message: String(check.message || '').slice(0, 200),
    }));
  const models = [...new Set(ledger.map((row) => row.modelId).filter(Boolean))];

  // v0.12.1 content-risk gate: a package whose deliverables were compiled
  // deterministically with NO enrichment contribution (no model stage, no
  // genome-linked lessons) is a mail-merge package — the v0.12 audit shipped
  // four of these silently. Flag it at warning severity in the digest.
  const compiledFeatureCount = budget.compilerSavings?.compiledFeatureCount || 0;
  const enrichmentOutcome = budget.enrichmentOutcome || null;
  const compiledWithoutEnrichment =
    compiledFeatureCount > 0 &&
    (!enrichmentOutcome || (enrichmentOutcome.modelStage !== 'ran' && (enrichmentOutcome.enrichedLessons || 0) === 0));
  // v0.14.1 P2.2: the zero-enrichment gate generalizes to a coverage
  // fraction. The v0.14 audit shipped Geology at 12/14 ("ran" looked green)
  // — partial coverage now flags at warning with the lesson numbers.
  const requestedLessons = Number(enrichmentOutcome?.requestedLessons) || 0;
  const enrichedLessons = Number(enrichmentOutcome?.enrichedLessons) || 0;
  const missingLessons = Array.isArray(enrichmentOutcome?.missingLessons) ? enrichmentOutcome.missingLessons : [];
  const enrichmentCoverage = requestedLessons > 0 ? enrichedLessons / requestedLessons : null;
  const partialEnrichment =
    enrichmentOutcome?.modelStage === 'ran' && enrichmentCoverage !== null && enrichmentCoverage < 1;
  const coverageChecks = [];
  if (compiledWithoutEnrichment) {
    coverageChecks.push({
      featureId: 'content',
      status: 'warning',
      message: `${compiledFeatureCount} deliverable type(s) compiled without enrichment (mail-merge risk) — check enrichment setting and model capability profile`,
    });
  }
  if (partialEnrichment) {
    coverageChecks.push({
      featureId: 'content',
      status: finish.finalStatus === 'ready' ? 'info' : 'warning',
      message: `partial enrichment (${enrichedLessons}/${requestedLessons})${
        missingLessons.length > 0
          ? ` — lesson${missingLessons.length === 1 ? '' : 's'} ${missingLessons.join(', ')} fell back to template`
          : ''
      }`,
    });
  }
  // v0.14.1 P2.5: map↔deliverable reconciliation findings ride the flagged
  // checks so a phantom map assessment (Geology's midterm, Mandarin's oral
  // rubric) is visible in the run record, not only the readiness UI.
  const reconciliationChecks = (
    Array.isArray(finish.assessmentReconciliationIssues) ? finish.assessmentReconciliationIssues : []
  ).map((issue) => ({
    featureId: 'alignment',
    status: issue.severity === 'blocker' ? 'failed' : issue.severity === 'warning' ? 'warning' : 'info',
    message: String(issue.message || '').slice(0, 200),
  }));
  const qualityChecks = [];
  if (quality?.status === 'graded' && qualityP0 + qualityP1 + qualityP2 > 0) {
    const firstFinding = qualityFindings.find((finding) => finding?.severity === 'P0') || qualityFindings[0] || {};
    const findingText = String(firstFinding.detail || firstFinding.evidence || firstFinding.file || '').trim();
    qualityChecks.push({
      featureId: 'quality',
      status: qualityP0 > 0 ? 'failed' : 'warning',
      message:
        `quality grade ${quality.score}/100 (${quality.grade}) — ${qualityP0} P0, ${qualityP1} P1, ${qualityP2} P2` +
        (findingText ? `; ${findingText.slice(0, 140)}` : ''),
    });
  } else if (quality?.status && quality.status !== 'graded') {
    qualityChecks.push({
      featureId: 'quality',
      status: 'warning',
      message: `quality not graded${quality.reason ? ` — ${String(quality.reason).slice(0, 160)}` : ''}`,
    });
  }

  return {
    digestVersion: 1,
    appVersion: APP_VERSION,
    runId: budget.runId || '',
    finishRunId: finish.finishRunId || '',
    at: new Date().toISOString(),
    elapsedMs: budget.startedAt ? Date.now() - budget.startedAt : null,
    run: {
      provider: generation.provider || ledger[0]?.provider || '',
      models,
      lessonCount: generation.lessonCount ?? null,
      features: generation.featureIds || [],
      providerCalls: ledger.length,
    },
    pipeline: { ...(budget.pipeline || {}) },
    compilerSavings: budget.compilerSavings || null,
    cost: {
      totalUsd: budget.tokenUsage?.costUsd ?? null,
      totalDisplay: formatUsd(budget.tokenUsage?.costUsd ?? 0),
      inputTokens: budget.tokenUsage?.inputTokens || 0,
      outputTokens: budget.tokenUsage?.outputTokens || 0,
      reasoningOutputTokens: budget.tokenUsage?.reasoningOutputTokens || 0,
      cachedInputTokens: budget.tokenUsage?.cachedInputTokens || 0,
      accuracy: pricingAccuracy(ledger),
      byTask: costReport?.byTask || [],
    },
    gates: {
      finalStatus: finish.finalStatus || '',
      blockers: finish.blockers ?? 0,
      warnings: finish.warnings ?? 0,
      repairsApplied: finish.repairsApplied ?? 0,
      retryCallCount: finish.retryCallCount ?? 0,
      exportStatus: exportVerification?.status || '',
      exportChecked: exportVerification?.checked ?? 0,
      exportFailed: exportVerification?.failed ?? 0,
      exportWarnings: exportVerification?.warningCount ?? 0,
      qualityStatus: quality?.status || '',
      qualityScore: quality?.score ?? null,
      qualityGrade: quality?.grade || '',
      qualityP0,
      qualityP1,
      qualityP2,
      compiledWithoutEnrichment,
      enrichmentCoverage,
      flaggedChecks: [...qualityChecks, ...coverageChecks, ...reconciliationChecks, ...flaggedChecks],
    },
  };
}

function pipelineLines(pipeline = {}) {
  const labels = {
    courseMap: 'course map',
    examine: 'examine pass',
    genomeLinker: 'genome linker',
    enrichmentModelStage: 'enrichment (model)',
    planHealth: 'plan health',
    courseGraph: 'course graph',
    knowledgeBackbone: 'knowledge backbone',
    judgment: 'course judgment',
    // v0.14.7 WS-D4: the voice pass discloses itself in the digest pipeline
    // ("voice pass: voiced N surface(s), M fallback(s) (~$X)").
    voicePass: 'voice pass',
  };
  return Object.entries(pipeline).map(([stage, detail]) => `  ${labels[stage] || stage}: ${detail}`);
}

export function formatRunDigest(digest) {
  if (!digest) return '';
  const lines = [];
  lines.push(
    `RUN DIGEST v${digest.digestVersion} — CourseMapper ${digest.appVersion} — ${digest.runId}` +
      (digest.elapsedMs ? ` (${Math.round(digest.elapsedMs / 1000)}s)` : ''),
  );
  lines.push(
    `model: ${digest.run.provider}/${digest.run.models.join(',') || '(none)'} · lessons: ${digest.run.lessonCount ?? '?'} · provider calls: ${digest.run.providerCalls}`,
  );
  if (Object.keys(digest.pipeline).length > 0) {
    lines.push('pipeline:');
    lines.push(...pipelineLines(digest.pipeline));
  }
  if (digest.compilerSavings?.compiledFeatureCount) {
    lines.push(
      `  compiler: ${digest.compilerSavings.compiledFeatureCount} deliverables compiled, ~${digest.compilerSavings.savedProviderCalls} AI calls avoided`,
    );
  }
  lines.push(
    `cost: ${digest.cost.totalDisplay} (${digest.cost.inputTokens} in / ${digest.cost.outputTokens} out, ${digest.cost.reasoningOutputTokens} reasoning, ${digest.cost.cachedInputTokens} cached)`,
  );
  lines.push(`  accuracy: ${digest.cost.accuracy}`);
  for (const task of digest.cost.byTask) {
    lines.push(
      `  ${task.task}: ${task.calls} call${task.calls === 1 ? '' : 's'}, ${task.inputTokens} in / ${task.outputTokens} out (${task.reasoningOutputTokens} reasoning), ${task.costKnown ? formatUsd(task.costUsd) : 'cost unknown'}`,
    );
  }
  const qualityText = digest.gates.qualityStatus
    ? ` · quality ${
        digest.gates.qualityStatus === 'graded'
          ? `${digest.gates.qualityScore}/100 ${digest.gates.qualityGrade}`
          : digest.gates.qualityStatus
      }`
    : '';
  lines.push(
    `gates: ${digest.gates.finalStatus} · export ${digest.gates.exportStatus} (${digest.gates.exportChecked} files, ${digest.gates.exportFailed} failed, ${digest.gates.exportWarnings} warnings)${qualityText} · ${digest.gates.repairsApplied} repairs · ${digest.gates.retryCallCount} retry calls`,
  );
  for (const check of digest.gates.flaggedChecks) {
    lines.push(`  [${check.status}] ${check.featureId}: ${check.message}`);
  }
  return lines.join('\n');
}

export function emitRunDigest(digest) {
  if (!digest) return;
  console.info(`[CM][RUN DIGEST]\n${formatRunDigest(digest)}`);
  console.info(`[CM][DIGEST] ${JSON.stringify(digest)}`);
}
