#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildScionKeyTermRecoveryCases } from './lib/scionKeyTermRecovery.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const REPORT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-experiment-v0.17.12.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-review-packet-v0.17.12.json';

async function main() {
  const report = JSON.parse(await fs.readFile(REPORT, 'utf8'));
  const reportIdentity = structuredClone(report);
  delete reportIdentity.identity;
  if (scionLessonKernelSha256(reportIdentity) !== report.identity?.sha256) {
    throw new Error('The source experiment report identity is invalid');
  }
  const caseById = new Map((await buildScionKeyTermRecoveryCases()).map((entry) => [entry.id, entry]));
  const cases = report.cases.map((row) => {
    const source = caseById.get(row.caseId);
    if (!source) throw new Error(`Missing frozen source case ${row.caseId}`);
    const inputSha256 = scionLessonKernelSha256({
      projectSha256: source.project.sha256,
      sourcePacketSha256: source.project.sourcePacketSha256,
      promptId: source.promptId,
      sourceClaims: source.sourceClaims,
      originalTerm: source.originalTerm,
    });
    if (inputSha256 !== row.inputSha256) throw new Error(`Source binding changed for ${row.caseId}`);
    return {
      caseId: row.caseId,
      domain: row.domain,
      inputSha256,
      numberedSourceClaims: source.sourceClaims.map((text, index) => ({ index, text })),
      authorizedSourceFactIndexes: [...new Set(source.originalTerm?.sourceFactIndexes || [])],
      authorizedSourceClaims: [...new Set(source.originalTerm?.sourceFactIndexes || [])]
        .filter((index) => Number.isInteger(index) && source.sourceClaims[index] !== undefined)
        .map((index) => ({ index, text: source.sourceClaims[index] })),
      originalTerm: source.originalTerm,
      matchedControl: {
        selectedOutput: row.matchedControl.assessment.term,
        eligible: row.matchedControl.assessment.eligible,
        issues: row.matchedControl.assessment.issues,
      },
      teacher: {
        selectedOutput: row.advised.assessment.term,
        eligible: row.advised.assessment.eligible,
        issues: row.advised.assessment.issues,
        originalVerifierIssuesRemoved: row.advised.originalVerifierIssuesRemoved,
      },
    };
  });
  const packet = {
    schemaVersion: 1,
    protocol: 'scion-roundtable-source-review-packet-v1',
    status: 'blinded-review-required',
    experimentSha256: report.identity.sha256,
    trainingEligible: false,
    productionEligible: false,
    cases,
    reviewQuestions: [
      'Is each selected cx directly supported by one or more numbered claims without adding an unsupported mechanism, cause, or generalization?',
      'Does each selected cx actually correct mi rather than merely paraphrase df?',
      'Did the teacher arm introduce any factual, source, or pedagogical regression relative to the matched control?',
    ],
    claimBoundary:
      'This packet reveals source claims only to an evaluation reviewer after generation. It is not available to policy selection beyond the already bound source ledger and is ineligible for training or production admission.',
  };
  packet.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(packet) };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(packet, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { cases: cases.length, experimentSha256: packet.experimentSha256, packetSha256: packet.identity.sha256 },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
