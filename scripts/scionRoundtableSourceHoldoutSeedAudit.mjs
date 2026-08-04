#!/usr/bin/env node
import fs from 'node:fs/promises';

import { assessScionKeyTermContract } from '../src/lib/scionKeyTermContract.js';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import { selectScionSourceRetentionCandidate } from './lib/scionSourceRetentionSelector.mjs';

const INPUT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v0.17.12.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-seed-audit-v0.17.12.json';

function sourceStrict(term, claims) {
  const assessment = assessScionKeyTermContract(term, {
    definitionMin: 45,
    knownFacts: claims,
    semanticProfile: 'source-strict-v6',
  });
  return { eligible: assessment.eligible, issues: assessment.issues };
}

async function main() {
  const holdout = JSON.parse(await fs.readFile(INPUT, 'utf8'));
  const holdoutCopy = structuredClone(holdout);
  delete holdoutCopy.identity;
  if (scionLessonKernelSha256(holdoutCopy) !== holdout.identity?.sha256) throw new Error('Holdout identity is invalid');
  const rows = holdout.rows.map((row) => {
    const allowed = new Set(row.postRunReview.authorizedSourceFactIndexes || []);
    const claims = row.postRunReview.numberedSourceClaims
      .filter((claim) => allowed.has(claim.index))
      .map((claim) => claim.text);
    const referenceTerm = {
      ...row.postRunReview.syntheticDefectTerm,
      cx: row.postRunReview.committedReferenceCorrection,
    };
    const selector = selectScionSourceRetentionCandidate({
      control: row.matchedControl.assessment.term,
      teacher: row.teacher.assessment.term,
      authorizedClaims: claims,
    });
    return {
      caseId: row.caseId,
      domain: row.domain,
      reference: sourceStrict(referenceTerm, claims),
      matchedControl: sourceStrict(row.matchedControl.assessment.term, claims),
      teacher: sourceStrict(row.teacher.assessment.term, claims),
      emittedSelection: selector,
    };
  });
  const invalidReferenceSeeds = rows.filter((row) => !row.reference.eligible).length;
  const audit = {
    schemaVersion: 1,
    protocol: 'scion-roundtable-source-holdout-seed-audit-v1',
    status: invalidReferenceSeeds ? 'blocked-invalid-reference-seed' : 'seed-admissible',
    holdoutSha256: holdout.identity.sha256,
    summary: {
      cases: rows.length,
      sourceStrictReferenceSeeds: rows.length - invalidReferenceSeeds,
      invalidReferenceSeeds,
      sourceStrictMatchedControlOutputs: rows.filter((row) => row.matchedControl.eligible).length,
      sourceStrictTeacherOutputs: rows.filter((row) => row.teacher.eligible).length,
      strictSelectorEmittedOutputs: rows.filter((row) => row.emittedSelection.status === 'selected').length,
      strictSelectorControlRetentions: rows.filter((row) => row.emittedSelection.selectedArm === 'matched-control')
        .length,
      strictSelectorTeacherRescues: rows.filter((row) => row.emittedSelection.selectedArm === 'teacher-rescue').length,
      strictSelectorQuarantines: rows.filter((row) => row.emittedSelection.selectedArm === 'quarantine').length,
    },
    rows,
    promotion: {
      status: 'blocked',
      issues: invalidReferenceSeeds
        ? [
            'holdout-reference-seed-not-source-strict',
            'holdout-must-be-rebuilt-from-semantically-admitted-atoms',
            'selector-result-is-post-hoc-diagnostic-only',
          ]
        : [],
    },
    claimBoundary:
      'This deterministic source-strict audit is a conservative semantic screen, not independent factual review. Any invalid reference seed voids the holdout as promotion evidence even when model outputs look plausible.',
  };
  audit.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(audit) };
  await fs.writeFile(OUTPUT, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(
    JSON.stringify({ status: audit.status, summary: audit.summary, blockers: audit.promotion.issues }, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
