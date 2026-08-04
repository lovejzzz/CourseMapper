#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  SCION_ROUNDTABLE_TEACHING_PROTOCOL,
  buildScionRoundtableTeacherTopic,
  buildScionRoundtableStudentQuestion,
  quarantineScionRoundtableTeaching,
  validateScionRoundtableStudentQuestion,
  validateScionRoundtableTeachingCandidate,
} from './lib/scionRoundtableTeacher.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';

const DEFAULT_SOURCE = 'evaluation/scion-adapters/evidence/semantic-expansion-v0.16.62/capture/local.json';
const DEFAULT_OUTPUT = 'verification-output/scion-roundtable-teacher-pilot';

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

export function parseArgs(argv = []) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') args.source = argv[++index] || args.source;
    else if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--write') args.write = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown Scion Roundtable teacher audit option: ${token}`);
  }
  return args;
}

function candidateFor(question) {
  const correctionPolicy = question.evidence.finalIssueCodes.includes('correction-repeats-definition');
  const candidate = {
    schemaVersion: 1,
    protocol: SCION_ROUNDTABLE_TEACHING_PROTOCOL,
    status: 'candidate',
    evidenceStatus: 'diagnostic-only',
    trainingEligible: false,
    questionSha256: question.identity.sha256,
    teacherPanelRef: scionLessonKernelSha256({ type: 'roundtable-panel-receipt', fixture: true }),
    teacherAttestation: { participantCount: 2 },
    recommendedPolicy: {
      selectedActions: question.decision.alternatives.slice(0, 3),
      selectionRule: correctionPolicy
        ? 'Choose contrast-misconception-mechanism when a source-supported contrast is observable; otherwise add-observable-counterexample only when that counterexample is source-supported; quarantine in every other case.'
        : 'Prefer the least generative action that restores one-to-one cited support; escalate only when the same issue survives deterministic replay.',
      stopCondition: correctionPolicy
        ? 'Stop and quarantine when neither a supported contrast nor a source-supported counterexample is observable.'
        : 'Stop and drop the item when no single cited claim uniquely supports one option after the bounded repair sequence.',
      evidenceRequired: ['compiler issue-family delta', 'source-ledger violation delta', 'paired holdout preference'],
      forbiddenInferences: ['teacher agreement implies correctness', 'one course proves a course-neutral rule'],
    },
    attestations: {
      policyOnly: true,
      noExternalCourseFacts: true,
      noTrainingAuthorization: true,
    },
    claimBoundary: 'This is a structured teaching candidate, not an admitted production or training policy.',
  };
  candidate.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(candidate)),
  };
  return candidate;
}

function relevantFinalIssues(call = {}) {
  const issues = call.attempts?.at(-1)?.assessment?.issues || [];
  return issues.some((issue) =>
    /multiple-source-supported-options|source-answer-conflict|source-fact-key-mismatch|explanation-key-conflict|invalid-source-fact-index|correction-repeats-definition|missing-seat/.test(
      issue,
    ),
  );
}

export async function runScionRoundtableTeacherAudit({
  source = DEFAULT_SOURCE,
  output = DEFAULT_OUTPUT,
  write = false,
} = {}) {
  const report = JSON.parse(await fs.readFile(source, 'utf8'));
  const call = (report.calls || []).find(
    (entry) => entry.attempts?.at(-1)?.assessment?.needsRetry === true && relevantFinalIssues(entry),
  );
  if (!call) throw new Error('No exhausted teachable Scion case found in the source report');
  const built = buildScionRoundtableStudentQuestion({
    caseRecord: call,
    maxAttempts: Number(report.compiler?.policy?.maxAttempts),
    generatedAt: '2026-08-04T10:00:00.000Z',
  });
  if (!built.ask) throw new Error(`Scion did not ask: ${built.reason}`);
  const questionValidation = validateScionRoundtableStudentQuestion(built.question);
  if (!questionValidation.valid) throw new Error(`Invalid student question: ${questionValidation.issues.join(', ')}`);

  const candidate = candidateFor(built.question);
  const candidateValidation = validateScionRoundtableTeachingCandidate(candidate, built.question);
  if (!candidateValidation.valid)
    throw new Error(`Invalid teacher candidate: ${candidateValidation.issues.join(', ')}`);
  const learning = quarantineScionRoundtableTeaching({ candidate, question: built.question });
  const roundtableTopic = buildScionRoundtableTeacherTopic(built.question);

  const leaked = structuredClone(candidate);
  leaked.expectedAnswer = 'hidden';
  leaked.identity.sha256 = scionLessonKernelSha256(withoutIdentity(leaked));
  const leakageRejected = !validateScionRoundtableTeachingCandidate(leaked, built.question).valid;
  if (!leakageRejected) throw new Error('Teacher-candidate leakage was not rejected');
  if (learning.admission.productionEligible || learning.admission.trainingEligible) {
    throw new Error('Roundtable advice escaped quarantine without holdout proof');
  }

  if (write) {
    await fs.mkdir(output, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(output, 'student-question.json'), `${JSON.stringify(built.question, null, 2)}\n`),
      fs.writeFile(path.join(output, 'roundtable-topic.txt'), `${roundtableTopic}\n`),
      fs.writeFile(path.join(output, 'teacher-candidate.template.json'), `${JSON.stringify(candidate, null, 2)}\n`),
      fs.writeFile(path.join(output, 'quarantined-learning.fixture.json'), `${JSON.stringify(learning, null, 2)}\n`),
    ]);
  }
  return {
    question: built.question,
    candidate,
    learning,
    roundtableTopic,
    summary: {
      asked: true,
      questionValid: true,
      teacherCandidateValid: true,
      leakageRejected,
      remainsQuarantined: true,
      issueFamilies: built.question.evidence.finalIssueCodes,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionRoundtableTeacherAudit.mjs [--source report.json] [--output dir] [--write]');
    return;
  }
  const result = await runScionRoundtableTeacherAudit(args);
  console.log(JSON.stringify(result.summary, null, 2));
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
