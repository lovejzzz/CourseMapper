#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assessScionKeyTermRecoveryOutput,
  buildScionKeyTermRecoveryCases,
  buildScionKeyTermRecoveryMessages,
  SCION_KEY_TERM_RECOVERY_LOCAL_MODEL,
} from './lib/scionKeyTermRecovery.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import {
  SCION_SOURCE_TEACHER_MAX_ATTEMPTS,
  assessSourceTeacherPedagogy,
  shouldContinueSourceTeacherDrafting,
  sourceTeacherTargetResolved,
  summarizeSourceTeacherRows,
  withholdRejectedCorrection,
} from './lib/scionRoundtableSourceExperiment.mjs';

const ENDPOINT = 'http://127.0.0.1:8799';
const OUTPUT = 'verification-output/scion-roundtable-source-experiment';
const REVIEW_OUTPUT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-experiment-v0.17.12.json';
const TEACHER_CANDIDATE_SHA256 = 'fcf63264347c3ccdc326a599f50c4ef0569ab766aa4d250ccb193b6d2d020a1c';
const TEACHER_PANEL_REF = '62f6875cb916997ffa7b546aa31b941638e64f43c1f95074d990aaab87b7c3f1';
const TEACHER_CANDIDATE_PATH = 'verification-output/scion-roundtable-teacher-pilot/teacher-candidate.template.json';
export const SCION_ROUNDTABLE_SOURCE_TEACHER_POLICY = [
  'Classify source evidence before generating and execute exactly one repair.',
  'Prefer a direct misconception contrast only when the bound source ledger supports the specific distinction.',
  'Otherwise use an observable counterexample only when the ledger explicitly supports it without adding a new mechanism or generalization.',
  'If provenance or realization is absent, quarantine rather than inventing support.',
  'This is a surgical repair: copy sourceFactIndexes, tr, df, eg, and mi exactly from the original keyTerm and change only cx.',
  'The replacement cx must directly refute mi in distinct language, must not repeat df or mi, and must preserve all source-ledger constraints.',
  'A realized correction must explicitly contrast the source-supported rule with the mistaken dimension in mi while paraphrasing that false dimension; a definition paraphrase or an answer that leaves the mistaken dimension unaddressed is not a repair.',
  'Do not quote mi verbatim. Use fresh wording for both sides of the contrast and make the consequence of the distinction observable.',
  'The learner must preserve the logical subject and polarity of mi while paraphrasing it; substituting a different common misconception is issue substitution.',
  'Use only claims authorized by the preserved sourceFactIndexes. If those claims cannot support a direct correction, quarantine instead of borrowing another supplied claim.',
  'Never show the learner the rejected cx while asking it to repair cx; expose the named verifier failure, the preserved fields, and the source ledger instead.',
].join(' ');

async function completeCase({
  model,
  entry,
  surgical = false,
  teacherPolicyAccess = false,
  attempt = 0,
  priorIssues = [],
}) {
  const messages = buildScionKeyTermRecoveryMessages(entry);
  const system = teacherPolicyAccess
    ? `${messages[0].content}\n\nDiagnostic Roundtable teacher policy: ${SCION_ROUNDTABLE_SOURCE_TEACHER_POLICY}`
    : messages[0].content;
  const preservedTerm = surgical ? withholdRejectedCorrection(entry.originalTerm) : null;
  const authorizedIndexes = surgical ? [...new Set(entry.originalTerm?.sourceFactIndexes || [])] : [];
  const authorizedClaims = surgical
    ? authorizedIndexes
        .filter((index) => Number.isInteger(index) && entry.sourceClaims[index] !== undefined)
        .map((index) => ({ index, text: entry.sourceClaims[index] }))
    : [];
  const user = surgical
    ? [
        `Claims authorized by preserved sourceFactIndexes: ${JSON.stringify(authorizedClaims)}`,
        `Preserved keyTerm fields (the rejected cx is intentionally withheld): ${JSON.stringify(preservedTerm)}`,
        `Named deterministic failure: ${JSON.stringify(entry.originalIssues)}`,
        ...(attempt > 0
          ? [
              `Bounded verifier feedback for candidate ${attempt}: ${JSON.stringify(priorIssues)}`,
              'The rejected candidate is intentionally withheld so it cannot contaminate the next draft.',
              ...(priorIssues.includes('correction-repeats-definition')
                ? [
                    'Do not reuse any three-word sequence from df. Center cx on a source-supported boundary, consequence, or mechanism that df omits.',
                  ]
                : []),
              ...(priorIssues.includes('correction-repeats-misconception')
                ? ['Do not reuse any three-word sequence from mi. State only the supported alternative.']
                : []),
              ...(priorIssues.includes('correction-lacks-explicit-contrast')
                ? ['Use an explicit contrast marker in cx, such as not, rather than, whereas, unlike, or instead.']
                : []),
              ...(priorIssues.includes('correction-reuses-misconception-structure')
                ? [
                    'Paraphrase the mistaken dimension more deeply; do not pad a copied misconception with extra definition text.',
                  ]
                : []),
            ]
          : []),
        'First identify the mistaken dimension in mi in fresh words, then identify the source-supported distinction that corrects it, then write cx.',
        'Keep those two checks short and course-neutral; they are an auditable learner scaffold, not hidden reasoning.',
        'Write cx so it explicitly connects the supported distinction to the mistaken dimension using source-supported distinct language.',
        'Do not merely define tr. In cx, do not quote mi or df; paraphrase the false dimension briefly and state the supported alternative.',
        'Use a different grammatical construction and vocabulary from both mi and df while preserving the source meaning.',
        'If the authorized claims are insufficient, return exactly {"quarantine":true,"reason":"insufficient-authorized-source"}.',
        'Otherwise return exactly {"mistakenDimension":"...","supportedDistinction":"...","cx":"..."}. Do not return or rewrite any keyTerm field other than cx.',
      ].join('\n\n')
    : messages[1].content;
  const requestMessages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const response = await fetch(`${ENDPOINT}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: requestMessages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`Scion source experiment failed: HTTP ${response.status}`);
  const payload = await response.json();
  const rawOutput = payload.choices?.[0]?.message?.content || '';
  let scoredOutput = rawOutput;
  let deterministicRepair = null;
  let boundedScaffold = null;
  let quarantine = null;
  if (surgical) {
    try {
      const parsed = JSON.parse(
        rawOutput
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim(),
      );
      const correction = String(parsed.cx || parsed.correction || '').trim();
      if (parsed.quarantine === true) {
        quarantine = { requested: true, reason: String(parsed.reason || 'unspecified').trim() };
      }
      boundedScaffold = {
        mistakenDimension: String(parsed.mistakenDimension || '').trim(),
        supportedDistinction: String(parsed.supportedDistinction || '').trim(),
      };
      if (correction) {
        scoredOutput = JSON.stringify({ keyTerm: { ...entry.originalTerm, cx: correction } });
        deterministicRepair = {
          type: 'surgical-correction-merge',
          preservedFields: ['sourceFactIndexes', 'tr', 'df', 'eg', 'mi'],
          changedField: 'cx',
        };
      }
    } catch {
      // The unchanged raw output remains auditable and will fail parsing.
    }
  }
  return {
    serverRequestReceipt: payload.scion_request_receipt,
    responseModel: payload.model,
    requestMessages,
    requestMessagesSha256: scionLessonKernelSha256(requestMessages),
    rawOutput,
    rawOutputSha256: scionLessonKernelSha256(rawOutput),
    scoredOutputSha256: scionLessonKernelSha256(scoredOutput),
    deterministicRepair,
    boundedScaffold,
    quarantine,
    authorizedSourceFactIndexes: authorizedIndexes,
    assessment: assessSourceTeacherPedagogy(assessScionKeyTermRecoveryOutput(entry, scoredOutput)),
  };
}

export async function completeScionSourceTeacherCase({
  model,
  entry,
  teacherPolicyAccess,
  maxAttempts = SCION_SOURCE_TEACHER_MAX_ATTEMPTS,
}) {
  const attempts = [];
  let priorIssues = entry.originalIssues;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = await completeCase({
      model,
      entry,
      surgical: true,
      teacherPolicyAccess,
      attempt,
      priorIssues,
    });
    attempts.push(candidate);
    if (!shouldContinueSourceTeacherDrafting(candidate.assessment)) break;
    priorIssues = candidate.assessment.issues;
  }
  const selected = attempts.find((candidate) => candidate.assessment.eligible) || attempts.at(-1);
  return {
    ...selected,
    selectedAttempt: attempts.indexOf(selected),
    attemptCount: attempts.length,
    attempts,
    originalVerifierIssuesRemoved: sourceTeacherTargetResolved(entry, selected.assessment),
    teacherPolicyAccess,
  };
}

async function loadTeacherPolicyOrigin() {
  const candidate = JSON.parse(await fs.readFile(TEACHER_CANDIDATE_PATH, 'utf8'));
  const identityInput = structuredClone(candidate);
  delete identityInput.identity;
  if (
    candidate.identity?.sha256 !== TEACHER_CANDIDATE_SHA256 ||
    scionLessonKernelSha256(identityInput) !== TEACHER_CANDIDATE_SHA256 ||
    candidate.teacherPanelRef !== TEACHER_PANEL_REF
  ) {
    throw new Error('The Roundtable teacher candidate identity is invalid');
  }
  return {
    path: TEACHER_CANDIDATE_PATH,
    candidate,
    panelAttestationStatus: 'opaque-reference-not-independently-authenticated',
  };
}

async function implementationBindings() {
  const files = [
    'scripts/scionRoundtableSourceExperiment.mjs',
    'scripts/lib/scionRoundtableSourceExperiment.mjs',
    'scripts/lib/scionKeyTermRecovery.mjs',
    'src/lib/scionKeyTermContract.js',
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex'),
      ]),
    ),
  );
}

function assertProviderEvidence({ endpointHealth, rows }) {
  if (endpointHealth.sourceModelId !== SCION_KEY_TERM_RECOVERY_LOCAL_MODEL.id) {
    throw new Error(`Unexpected Scion source model: ${endpointHealth.sourceModelId}`);
  }
  const calls = rows.flatMap((row) => [row.baseline, ...row.matchedControl.attempts, ...row.advised.attempts]);
  const receiptPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (calls.some((call) => call.responseModel !== endpointHealth.modelId)) {
    throw new Error('A source experiment response did not bind to the requested Scion model');
  }
  if (calls.some((call) => !receiptPattern.test(call.serverRequestReceipt || ''))) {
    throw new Error('A source experiment response is missing a server-issued UUID receipt');
  }
  if (new Set(calls.map((call) => call.serverRequestReceipt)).size !== calls.length) {
    throw new Error('A source experiment server request receipt was reused');
  }
  return {
    expectedModel: endpointHealth.modelId,
    expectedSourceModel: endpointHealth.sourceModelId,
    serverReceiptedCalls: calls.length,
    uniqueServerRequestReceipts: calls.length,
    claimBoundary:
      'UUID receipts prove per-response uniqueness within this local run; they are not signatures or independent authentication.',
  };
}

function domainFor(caseId) {
  if (caseId.includes(':cs/')) return 'computer-science';
  if (caseId.includes(':geo/')) return 'geology';
  if (caseId.includes(':music/')) return 'music-theory';
  if (caseId.includes(':ux/')) return 'user-experience-design';
  return 'unknown';
}

export async function runScionRoundtableSourceExperiment() {
  const endpointHealth = await fetch(`${ENDPOINT}/health`).then((response) => response.json());
  if (endpointHealth.modelReady !== true || endpointHealth.modelId !== 'scion-1') {
    throw new Error('The authenticated local Scion runtime is not ready');
  }
  const cases = (await buildScionKeyTermRecoveryCases()).filter(
    (entry) => entry.defectKind === 'correction-repeats-definition',
  );
  const rows = [];
  for (const [caseIndex, entry] of cases.entries()) {
    const baseline = await completeCase({ model: endpointHealth.modelId, entry });
    const matchedArmOrder = caseIndex % 2 === 0 ? ['matched-control', 'teacher'] : ['teacher', 'matched-control'];
    const matched = {};
    for (const arm of matchedArmOrder) {
      matched[arm] = await completeScionSourceTeacherCase({
        model: endpointHealth.modelId,
        entry,
        teacherPolicyAccess: arm === 'teacher',
      });
    }
    const matchedControl = matched['matched-control'];
    const advised = matched.teacher;
    rows.push({
      caseId: entry.id,
      domain: domainFor(entry.id),
      inputSha256: scionLessonKernelSha256({
        projectSha256: entry.project.sha256,
        sourcePacketSha256: entry.project.sourcePacketSha256,
        promptId: entry.promptId,
        sourceClaims: entry.sourceClaims,
        originalTerm: entry.originalTerm,
      }),
      matchedArmOrder,
      baseline,
      matchedControl,
      advised,
    });
  }
  const providerEvidence = assertProviderEvidence({ endpointHealth, rows });
  const summary = summarizeSourceTeacherRows(rows);
  const teacherPolicyOrigin = await loadTeacherPolicyOrigin();
  const report = {
    protocol: 'scion-roundtable-source-experiment-v1',
    status: 'development-diagnostic-source-bound-contract-only',
    model: {
      id: endpointHealth.modelId,
      sourceModelId: endpointHealth.sourceModelId,
      endpointReceiptSha256: scionLessonKernelSha256({
        modelId: endpointHealth.modelId,
        sourceModelId: endpointHealth.sourceModelId,
        modelLoadMs: endpointHealth.modelLoadMs,
      }),
    },
    teacherPolicySha256: scionLessonKernelSha256(SCION_ROUNDTABLE_SOURCE_TEACHER_POLICY),
    teacherPolicyOrigin,
    implementationBindings: await implementationBindings(),
    providerEvidence,
    cases: rows,
    summary,
    evaluationIntegrity: {
      precommitted: false,
      developmentSetReused: true,
      sourceDisjointHoldout: false,
      independentlyFactReviewed: false,
      legacyComparableProviderBudget: false,
      matchedComparableProviderCeiling: true,
      matchedEqualActualCalls: summary.matchedControlProviderCalls === summary.advisedProviderCalls,
      note: 'The teacher prompt was refined after observing this frozen set. The legacy baseline uses one full-atom call and is not a causal control. A separate matched control uses the same surgical projection, contamination withholding, verifier feedback, and three-call ceiling as the teacher arm, varying only access to the Roundtable policy; neither comparison is an unseen transfer estimate.',
    },
    promotion: {
      status: 'blocked',
      productionEligible: false,
      trainingEligible: false,
      issues: [
        'development-set-reused',
        'no-source-disjoint-precommitted-holdout',
        'legacy-arm-unequal-provider-call-budget',
        'matched-control-still-reuses-development-set',
        'no-independent-factual-review',
        'deterministic-contract-admission-is-not-factual-proof',
      ],
    },
    claimBoundary:
      'This development diagnostic reports both a one-call legacy full-atom baseline and a matched surgical control against the Roundtable-policy arm on twelve frozen source-bound correction defects across three represented domains. The matched arms share contamination withholding, preserved fields, verifier feedback, and a three-call ceiling; only policy access differs. Because the prompt was refined on this set, the result remains implementation evidence rather than unseen transfer proof, and it does not prove factual correctness, educational superiority, six-domain generality, or production/training eligibility.',
  };
  report.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(report) };
  await fs.mkdir(OUTPUT, { recursive: true });
  await fs.writeFile(path.join(OUTPUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.mkdir(path.dirname(REVIEW_OUTPUT), { recursive: true });
  await fs.writeFile(REVIEW_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScionRoundtableSourceExperiment().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
