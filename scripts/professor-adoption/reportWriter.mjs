import fs from 'node:fs/promises';
import path from 'node:path';

import { ADOPTION_DIMENSIONS } from './scorer.mjs';
import { sanitizeProfessorAdoptionManifest } from './sourceManifests.mjs';

function table(rows) {
  return rows.join('\n');
}

function safeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderActionRows(actions = []) {
  if (actions.length === 0) {
    return ['| none | none | complete | none | no-required-actions | No required autonomous actions. |'];
  }
  return actions.map(
    (action) =>
      `| ${action.priority} | ${action.type} | ${action.status} | ${safeCell(action.targetArea)} | ${action.id} | ${safeCell(
        action.acceptanceCriteria?.[0] || '',
      )} |`,
  );
}

function renderDimensionRows(results = []) {
  return ADOPTION_DIMENSIONS.map((dimension) => {
    const scores = results.map((result) => Number(result.dimensionScores?.[dimension.id])).filter(Number.isFinite);
    const average =
      scores.length > 0 ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : 0;
    return `| ${dimension.label} | ${dimension.weight} | ${average} |`;
  });
}

function renderCaseRows(results = []) {
  return results.map(
    (result) =>
      `| ${result.caseId} | ${safeCell(result.title)} | ${result.status} | ${result.score} | ${result.compiledFeatureCount} | ${result.findingCount} | ${result.p1FindingCount} | ${result.hardBlockerCount} |`,
  );
}

function renderFindingLines(results = []) {
  const findings = results.flatMap((result) =>
    (result.findings || []).map(
      (finding) =>
        `- ${finding.severity} ${result.caseId}/${finding.dimension}/${finding.failureClass}: ${finding.message} Acceptance: ${safeCell(
          finding.acceptanceCriteria?.[0] || '',
        )}`,
    ),
  );
  return findings.length > 0 ? findings : ['- No professor-adoption findings.'];
}

export function buildProfessorAdoptionLedger(payload = {}) {
  return (payload.results || []).flatMap((result) =>
    (result.findings || []).map((finding) => ({
      caseId: result.caseId,
      status: result.status,
      score: result.score,
      sourceUrl: result.sourceUrl,
      dimension: finding.dimension,
      severity: finding.severity,
      scoreImpact: finding.scoreImpact,
      artifact: finding.artifact,
      sourceExpectation: finding.sourceExpectation,
      observedOutput: finding.observedOutput,
      failureClass: finding.failureClass,
      suspectedOwner: finding.suspectedOwner,
      requiredRepairAction: finding.requiredRepairAction,
      acceptanceCriteria: finding.acceptanceCriteria,
      proofCommands: finding.proofCommands,
      evidence: finding.evidence,
    })),
  );
}

export function renderProfessorAdoptionMarkdown(payload = {}) {
  const decision = payload.autonomousDecision || {};
  const summary = payload.summary || {};
  return [
    '# CourseMapper Professor Adoption Benchmark',
    '',
    `Generated: ${payload.meta?.generatedAt || 'unknown'}`,
    `Profile: ${payload.meta?.profile || 'unknown'}`,
    `Rounds requested: ${payload.meta?.roundsRequested || payload.results?.length || 0}`,
    '',
    '## Summary',
    '',
    `Status: ${summary.status || 'unknown'}`,
    `Cases: ${summary.caseCount || 0}`,
    `Passed cases: ${summary.passedCaseCount || 0}`,
    `Repair-required cases: ${summary.repairRequiredCaseCount || 0}`,
    `Blocked cases: ${summary.blockedCaseCount || 0}`,
    `Average score: ${summary.averageScore || 0}`,
    `Minimum score: ${summary.minimumScore || 0}`,
    `Findings: ${summary.findingCount || 0}`,
    `P0 findings: ${summary.findingCounts?.P0 || 0}`,
    `P1 findings: ${summary.findingCounts?.P1 || 0}`,
    `P2 findings: ${summary.findingCounts?.P2 || 0}`,
    `P3 findings: ${summary.findingCounts?.P3 || 0}`,
    '',
    'Note: This benchmark uses public professor/course artifacts as adoption pressure. It does not claim professor approval, endorsement, or external validation.',
    '',
    '## Autonomous Decision',
    '',
    `Status: ${decision.status || 'unknown'}`,
    `Next action: ${decision.nextAction || 'unknown'}`,
    `Requires human interpretation: ${decision.requiresHumanInterpretation === false ? 'false' : 'true'}`,
    `Rationale: ${decision.rationale || 'No rationale recorded.'}`,
    '',
    table([
      '| Priority | Type | Status | Target Area | Action ID | Acceptance Criteria |',
      '| --- | --- | --- | --- | --- | --- |',
      ...renderActionRows(decision.actions?.required || []),
      ...renderActionRows(decision.actions?.tracked || []).filter((row) => !row.includes('no-required-actions')),
    ]),
    '',
    '## Case Matrix',
    '',
    table([
      '| Case | Title | Status | Score | Features | Findings | P1 | P0 |',
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...renderCaseRows(payload.results || []),
    ]),
    '',
    '## Dimension Averages',
    '',
    table([
      '| Dimension | Weight | Average retained points |',
      '| --- | ---: | ---: |',
      ...renderDimensionRows(payload.results || []),
    ]),
    '',
    '## Source Case Board',
    '',
    table([
      '| Case | Source | Public instructor/course authors | Primary work products |',
      '| --- | --- | --- | --- |',
      ...(payload.manifests || []).map(
        (manifest) =>
          `| ${manifest.id} | ${manifest.sourceUrl} | ${safeCell(
            manifest.publicInstructorNames?.join(', '),
          )} | ${safeCell(manifest.primaryStudentWorkProducts?.join(', '))} |`,
      ),
    ]),
    '',
    '## Findings',
    '',
    ...renderFindingLines(payload.results || []),
    '',
    '## Release Claim Boundary',
    '',
    '- Allowed: public-source professor-adoption benchmarked.',
    '- Forbidden: professor-approved, externally validated, or endorsed by the public course authors.',
    '',
  ].join('\n');
}

export async function writeProfessorAdoptionReport(payload, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const sourceManifestDir = path.join(outputDir, 'source-manifests');
  await fs.mkdir(sourceManifestDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  const ledgerPath = path.join(outputDir, 'latest-ledger.jsonl');
  const autonomousActionsPath = path.join(outputDir, 'latest-autonomous-actions.json');
  const ledger = buildProfessorAdoptionLedger(payload);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, `${renderProfessorAdoptionMarkdown(payload)}\n`);
  await fs.writeFile(
    ledgerPath,
    `${ledger.map((entry) => JSON.stringify(entry)).join('\n')}${ledger.length ? '\n' : ''}`,
  );
  await fs.writeFile(autonomousActionsPath, `${JSON.stringify(payload.autonomousDecision || {}, null, 2)}\n`);
  for (const manifest of payload.manifests || []) {
    await fs.writeFile(
      path.join(sourceManifestDir, `${manifest.id}.json`),
      `${JSON.stringify(sanitizeProfessorAdoptionManifest(manifest), null, 2)}\n`,
    );
  }
  return { jsonPath, markdownPath, ledgerPath, autonomousActionsPath, sourceManifestDir };
}
