import fs from 'node:fs/promises';
import path from 'node:path';

function safeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function table(rows) {
  return rows.join('\n');
}

function renderCaseRows(results = []) {
  return results.map(
    (result) =>
      `| ${result.caseId} | ${result.sourceKind} | ${result.status} | ${result.score} | ${result.findingCount} | ${result.checkedUrl} |`,
  );
}

function renderFindingLines(results = []) {
  const findings = results.flatMap((result) =>
    (result.findings || []).map(
      (finding) =>
        `- ${finding.severity} ${result.caseId}/${finding.failureClass}: ${finding.message} Acceptance: ${safeCell(
          finding.acceptanceCriteria?.[0] || '',
        )}`,
    ),
  );
  return findings.length > 0 ? findings : ['- No source-provenance findings.'];
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

export function buildProfessorSourceLedger(payload = {}) {
  return (payload.results || []).flatMap((result) =>
    (result.findings || []).map((finding) => ({
      caseId: result.caseId,
      status: result.status,
      score: result.score,
      sourceUrl: result.sourceUrl,
      checkedUrl: result.checkedUrl,
      sourceKind: result.sourceKind,
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

export function renderProfessorSourceMarkdown(payload = {}) {
  const summary = payload.summary || {};
  const decision = payload.autonomousDecision || {};
  return [
    '# CourseMapper Professor Adoption Source Provenance Audit',
    '',
    `Generated: ${payload.meta?.generatedAt || 'unknown'}`,
    `Profile: ${payload.meta?.profile || 'unknown'}`,
    `Cases: ${summary.caseCount || 0}`,
    '',
    '## Summary',
    '',
    `Status: ${summary.status || 'unknown'}`,
    `Passed cases: ${summary.passedCaseCount || 0}`,
    `Repair-required cases: ${summary.repairRequiredCaseCount || 0}`,
    `Blocked cases: ${summary.blockedCaseCount || 0}`,
    `Average score: ${summary.averageScore || 0}`,
    `Minimum score: ${summary.minimumScore || 0}`,
    `Findings: ${summary.findingCount || 0}`,
    `P0 findings: ${summary.findingCounts?.P0 || 0}`,
    `P1 findings: ${summary.findingCounts?.P1 || 0}`,
    `P2 findings: ${summary.findingCounts?.P2 || 0}`,
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
      '| Case | Source kind | Status | Score | Findings | Checked URL |',
      '| --- | --- | --- | ---: | ---: | --- |',
      ...renderCaseRows(payload.results || []),
    ]),
    '',
    '## Findings',
    '',
    ...renderFindingLines(payload.results || []),
    '',
    '## Claim Boundary',
    '',
    '- This audit verifies public source support for manifest claims.',
    '- It does not claim professor approval, instructor endorsement, or external validation.',
    '',
  ].join('\n');
}

export async function writeProfessorSourceReport(payload, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  const ledgerPath = path.join(outputDir, 'latest-ledger.jsonl');
  const autonomousActionsPath = path.join(outputDir, 'latest-autonomous-actions.json');
  const ledger = buildProfessorSourceLedger(payload);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, `${renderProfessorSourceMarkdown(payload)}\n`);
  await fs.writeFile(
    ledgerPath,
    `${ledger.map((entry) => JSON.stringify(entry)).join('\n')}${ledger.length ? '\n' : ''}`,
  );
  await fs.writeFile(autonomousActionsPath, `${JSON.stringify(payload.autonomousDecision || {}, null, 2)}\n`);
  return { jsonPath, markdownPath, ledgerPath, autonomousActionsPath };
}
