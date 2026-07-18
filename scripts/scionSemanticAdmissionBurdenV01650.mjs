#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import * as prettier from 'prettier';

import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import {
  compileSourceAtomResponse,
  materializeSourceCaptureCampaign,
  summarizeSourceCaptureBurden,
} from './lib/scionSourceCapture.mjs';

const RELEASE = 'v0.16.50';
const GENERATED_AT = '2026-07-18T00:35:00.000Z';
const CANDIDATES = 'evaluation/scion-review-candidates-course-group-breadth-v0.16.47.jsonl';
const RECEIPT = 'evaluation/scion-adapters/evidence/semantic-admission-burden-v0.16.50.json';
const RETAINED_REPLAY_DIR = 'evaluation/scion-source-compiler-replay-v0.16.47';
const CAMPAIGNS = [
  'evaluation/scion-source-capture-campaign.json',
  'evaluation/scion-source-capture-expansion-v0.16.17.json',
];
const IMPLEMENTATION = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/scionKeyTermContract.js',
  'scripts/lib/scionSourceCapture.mjs',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function formattedReceipt(value, output) {
  const options = (await prettier.resolveConfig(output)) || {};
  return prettier.format(JSON.stringify(value), { ...options, filepath: output });
}

function histogram(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((entry) => entry === value).length]),
  );
}

function assessCandidate(row, side, semanticProfile) {
  const artifact = JSON.parse(row[side]);
  return row.kind === 'mc-item'
    ? assessScionMcItem(artifact, { sourceClaims: row.sourceContext.claims, semanticProfile })
    : assessScionKeyTerm(artifact, {
        knownFacts: row.sourceContext.claims,
        sourceTerm: row.sourceContext.term,
        semanticProfile,
      });
}

function summarizeCandidateSurface(rows, side) {
  const assessed = rows.map((row) => ({
    row,
    previous: assessCandidate(row, side, 'source-strict-v3'),
    current: assessCandidate(row, side, 'source-strict-v4'),
  }));
  const newlyRejected = assessed.filter((entry) => entry.previous.eligible && !entry.current.eligible);
  const newlyAdmitted = assessed.filter((entry) => !entry.previous.eligible && entry.current.eligible);
  return {
    rows: rows.length,
    previousEligible: assessed.filter((entry) => entry.previous.eligible).length,
    currentEligible: assessed.filter((entry) => entry.current.eligible).length,
    additionalRetrySeats: newlyRejected.length,
    removedRetrySeats: newlyAdmitted.length,
    additionalRetrySeatsByDomain: histogram(newlyRejected.map((entry) => entry.row.domain)),
    additionalRetrySeatsByKind: histogram(newlyRejected.map((entry) => entry.row.kind)),
  };
}

function positiveIssueDelta(previous = {}, current = {}) {
  return Object.fromEntries(
    [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .sort()
      .map((issue) => [issue, Number(current[issue] || 0) - Number(previous[issue] || 0)])
      .filter(([, delta]) => delta > 0),
  );
}

async function retainedReplay(root) {
  const previousCalls = [];
  const currentCalls = [];
  const projects = [];
  const admissionChangedAtoms = [];
  let expectedCalls = 0;
  let expectedAtoms = 0;

  for (const manifestPath of CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ cwd: root, manifestPath });
    expectedCalls += campaign.summary.prompts;
    expectedAtoms += campaign.summary.expectedCandidates;
    for (const group of campaign.groups) {
      const projectPath = path.join(RETAINED_REPLAY_DIR, `${group.id}-local.json`);
      const raw = await fs.readFile(path.join(root, projectPath));
      const project = JSON.parse(raw.toString('utf8'));
      const promptById = new Map(group.prompts.map((prompt) => [prompt.id, prompt]));
      projects.push({
        path: projectPath,
        bytes: raw.length,
        sha256: sha256(raw),
        courseGroupId: group.id,
        domain: group.domain,
      });
      for (const call of project.scionSourceCapture?.calls || []) {
        const prompt = promptById.get(call.promptId);
        if (!prompt) throw new Error(`${projectPath} contains an unknown prompt: ${call.promptId}`);
        const options = {
          sourceClaimCount: prompt.sourceClaims.length,
          sourceClaims: prompt.sourceClaims,
          sourceTerm: prompt.sourceTerm || prompt.lessonTitle,
          lessonId: prompt.id,
        };
        const previous = compileSourceAtomResponse(call.response, {
          ...options,
          semanticProfile: 'source-strict-v3',
        });
        const current = compileSourceAtomResponse(call.response, {
          ...options,
          semanticProfile: 'source-strict-v4',
        });
        for (const [collection, issuePrefix, kind] of [
          ['mcItems', 'mc', 'mc-item'],
          ['keyTerms', 'key-term', 'key-term'],
        ]) {
          const previousAdmitted = new Set(
            (previous.admittedResponse?.[collection] || []).map((atom) => sha256(JSON.stringify(atom))),
          );
          const currentAdmitted = new Set(
            (current.admittedResponse?.[collection] || []).map((atom) => sha256(JSON.stringify(atom))),
          );
          for (const [atomIndex, atom] of (previous.compiledResponse?.[collection] || []).entries()) {
            const artifactSha256 = sha256(JSON.stringify(atom));
            if (!previousAdmitted.has(artifactSha256) || currentAdmitted.has(artifactSha256)) continue;
            admissionChangedAtoms.push({
              projectPath,
              promptId: call.promptId,
              domain: group.domain,
              kind,
              atomIndex,
              artifactSha256,
              artifactLabel: kind === 'key-term' ? atom.tr : atom.q,
              newIssues: current.issues.filter((issue) => issue.startsWith(`${issuePrefix}-${atomIndex}-`)),
            });
          }
        }
        previousCalls.push({ assessment: previous });
        currentCalls.push({ assessment: current });
      }
    }
  }

  const previous = summarizeSourceCaptureBurden({ calls: previousCalls, expectedCalls, expectedAtoms });
  const current = summarizeSourceCaptureBurden({ calls: currentCalls, expectedCalls, expectedAtoms });
  return {
    projects,
    admissionChangedAtoms,
    previous,
    current,
    deltas: {
      additionalBurdenAtoms: current.burdenAtoms - previous.burdenAtoms,
      admittedAtoms: current.admittedAtoms - previous.admittedAtoms,
      eligibleCalls: current.eligibleCalls - previous.eligibleCalls,
      newIssueIncidence: positiveIssueDelta(previous.issueHistogram, current.issueHistogram),
    },
  };
}

export async function buildScionSemanticAdmissionBurdenV01650({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const candidateRaw = await fs.readFile(path.join(root, CANDIDATES), 'utf8');
  const candidateRows = candidateRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(JSON.parse);
  const [retained, implementation] = await Promise.all([
    retainedReplay(root),
    Promise.all(
      IMPLEMENTATION.map(async (file) => {
        const raw = await fs.readFile(path.join(root, file));
        return { path: file, bytes: raw.length, sha256: sha256(raw) };
      }),
    ),
  ]);
  const candidate = summarizeCandidateSurface(candidateRows, 'left');
  const reference = summarizeCandidateSurface(candidateRows, 'right');
  const assertions = {
    exactFrozenCandidateSurface: candidateRows.length === 91,
    frozenCandidateEligibilityUnchanged:
      candidate.previousEligible === 80 &&
      candidate.currentEligible === 80 &&
      reference.previousEligible === 83 &&
      reference.currentEligible === 83,
    noAdditionalCandidateRetrySeats:
      candidate.additionalRetrySeats === 0 &&
      candidate.removedRetrySeats === 0 &&
      reference.additionalRetrySeats === 0 &&
      reference.removedRetrySeats === 0,
    exactRetainedReplay:
      retained.projects.length === 12 &&
      retained.previous.expectedCalls === 48 &&
      retained.previous.capturedCalls === 48 &&
      retained.previous.expectedAtoms === 192,
    boundedRetainedSemanticBurden:
      retained.previous.admittedAtoms === 49 &&
      retained.current.admittedAtoms === 47 &&
      retained.previous.burdenAtoms === 143 &&
      retained.current.burdenAtoms === 145 &&
      retained.deltas.additionalBurdenAtoms === 2 &&
      retained.deltas.eligibleCalls === -1,
    changedAtomsAreExactReviewedFailures:
      retained.admissionChangedAtoms.length === 2 &&
      retained.admissionChangedAtoms.some(
        (entry) =>
          entry.artifactLabel === 'readlines()' &&
          entry.newIssues.includes('key-term-1-correction-omits-technical-reference'),
      ) &&
      retained.admissionChangedAtoms.some(
        (entry) =>
          entry.artifactLabel === 'Scale degree' &&
          entry.newIssues.includes('key-term-0-correction-drops-defining-identity'),
      ),
    judgeInformedRulesObserved:
      retained.deltas.newIssueIncidence['key-term-1-correction-omits-technical-reference'] === 2 &&
      retained.deltas.newIssueIncidence['key-term-0-correction-drops-defining-identity'] === 1,
  };
  const failures = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Scion semantic-admission burden audit failed: ${failures.join(', ')}; observed=${JSON.stringify({ candidate, reference, retained: retained.deltas })}`,
    );
  }

  return {
    schemaVersion: 1,
    protocol: 'scion-semantic-admission-v4-burden-replay-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'bounded-reviewed-semantic-retry-burden',
    evidence: {
      candidateSurface: {
        path: CANDIDATES,
        bytes: Buffer.byteLength(candidateRaw),
        sha256: sha256(candidateRaw),
        rows: candidateRows.length,
      },
      retainedLocalReplay: {
        directory: RETAINED_REPLAY_DIR,
        campaigns: CAMPAIGNS,
        projects: retained.projects,
      },
      implementation,
    },
    candidate,
    reference,
    retainedLocalReplay: {
      previousProfile: 'source-strict-v3',
      currentProfile: 'source-strict-v4',
      previous: retained.previous,
      current: retained.current,
      deltas: retained.deltas,
      admissionChangedAtoms: retained.admissionChangedAtoms,
    },
    assertions,
    interpretation:
      'Across both arms of 91 frozen cross-arm candidate pairs, source-strict-v4 changes no eligibility decision. Across 192 retained local response seats, it retries two additional atoms (1.041667%): a readlines() correction that leaves its false claim about read() unresolved and a scale-degree correction that replaces the defining numerical-label identity with a different scale concept. One of 48 retained calls consequently moves from partial admission to rejection.',
    claimBoundary:
      'This is deterministic replay of retained response bytes. It measures admission overlap, not fresh model retry success, browser latency, unseen-output precision, blind preference, classroom outcomes, paid-reference quality, or adapter quality. No response text is mutated and no model call is made.',
  };
}

export async function runScionSemanticAdmissionBurdenV01650({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionSemanticAdmissionBurdenV01650({ cwd });
  const output = path.resolve(cwd, RECEIPT);
  const receipt = await formattedReceipt(report, output);
  if (write) await fs.writeFile(output, receipt);
  else if ((await fs.readFile(output, 'utf8')) !== receipt) {
    throw new Error('Tracked semantic-admission burden receipt is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown semantic-admission burden option');
  const result = await runScionSemanticAdmissionBurdenV01650({ write: args.has('--write') });
  console.log(
    `Scion semantic-admission burden: +${result.report.retainedLocalReplay.deltas.additionalBurdenAtoms} burden atoms across 192 retained local seats; +${result.report.candidate.additionalRetrySeats}/+${result.report.reference.additionalRetrySeats} retry seats across 91 frozen pairs.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
