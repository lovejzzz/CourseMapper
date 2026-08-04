#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  assessScionClassroomPromotion,
  buildScionClassroomAttempt,
  scoreScionClassroomAttempt,
} from './lib/scionClassroom.mjs';
import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import { runScionClassroomAudit } from './scionClassroomAudit.mjs';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8799';
const DEFAULT_OUTPUT = 'verification-output/scion-classroom-model-run';

function parseJsonObject(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(clean);
}

async function discoverModel(endpoint) {
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(endpointUrl.hostname)) {
    throw new Error('Scion classroom inference requires an authenticated loopback endpoint');
  }
  const healthResponse = await fetch(`${endpoint.replace(/\/$/, '')}/health`);
  if (!healthResponse.ok) throw new Error(`Scion health discovery failed: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (
    health.modelReady !== true ||
    health.modelId !== 'scion-1' ||
    !String(health.sourceModelId || '').includes('gemma-4-E2B')
  ) {
    throw new Error('Loopback endpoint did not prove the expected ready Scion E2B runtime');
  }
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/models`);
  if (!response.ok) throw new Error(`Scion model discovery failed: HTTP ${response.status}`);
  const payload = await response.json();
  const model = payload.data?.[0];
  if (!model?.id) throw new Error('Scion model discovery returned no model');
  if (model.id !== health.modelId || model.source_model !== health.sourceModelId || model.ready !== true) {
    throw new Error('Scion model discovery did not match the health receipt');
  }
  return {
    id: model.id,
    ref: scionLessonKernelSha256({
      id: model.id,
      sourceModel: model.source_model || null,
      sourceRevision: model.source_revision || null,
      adapter: model.adapter || null,
    }),
    endpointReceiptSha256: scionLessonKernelSha256({
      modelId: health.modelId,
      sourceModelId: health.sourceModelId,
      baseRevision: health.baseRevision,
      adapterManifestSha256: health.adapterManifestSha256,
      adapterPackageIdentitySha256: health.adapterPackageIdentitySha256,
      modelLoadMs: health.modelLoadMs,
    }),
  };
}

function modelPrompt({ packet, policy }) {
  const system = [
    'You are Scion taking a blinded course-neutral repair-policy exam.',
    'Return one JSON object with one "answers" array. Each answer must copy a caseId, choose a decision, and copy the exact observable signal key names that justify it.',
    'The required property name is evidenceUsed. Never rename it to signals, evidence, or reasons.',
    'For every case, choose exactly one allowed action or "quarantine".',
    'Use only observable signal names present in that case. Never invent course facts or infer hidden labels.',
    'Answer every case exactly once.',
  ];
  if (policy) {
    system.push(
      `Apply this diagnostic policy exactly: ${JSON.stringify({
        selectedActions: policy.selectedActions,
        selectionRule: policy.selectionRule,
        stopCondition: policy.stopCondition,
      })}`,
    );
  } else {
    system.push('No teacher policy is available in this baseline session. Reason only from the bounded actions and signals.');
  }
  return {
    system: system.join('\n'),
    user: JSON.stringify({ phase: packet.phase, cases: packet.cases }),
  };
}

async function invokeScion({ endpoint, model, packet, policy, timeoutMs = 1_200_000 }) {
  const prompt = modelPrompt({ packet, policy });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Scion inference failed: HTTP ${response.status} ${await response.text()}`);
    const payload = await response.json();
    if (payload.model !== model.id || !payload.scion_request_receipt) {
      throw new Error('Scion response omitted its server-issued model/request receipt');
    }
    const rawText = payload.choices?.[0]?.message?.content || '';
    const responseReceipt = {
      serverRequestReceipt: payload.scion_request_receipt,
      responseModel: payload.model,
      sourceModel: payload.scion_source_model || null,
      rawResponseSha256: scionLessonKernelSha256(rawText),
      parseStatus: 'valid-json-answers',
    };
    try {
      const parsed = parseJsonObject(rawText);
      if (!Array.isArray(parsed.answers)) throw new Error('missing-answers-array');
      return { answers: parsed.answers, responseReceipt };
    } catch (error) {
      return {
        answers: [],
        responseReceipt: {
          ...responseReceipt,
          parseStatus: 'malformed-or-nonconforming',
          parseError: String(error?.message || error).slice(0, 300),
        },
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeScionPhase({ endpoint, model, packet, policy, batchSize = 1 }) {
  const answers = [];
  let providerCalls = 0;
  const responseRepairs = [];
  const responseReceipts = [];
  for (let index = 0; index < packet.cases.length; index += batchSize) {
    const batchPacket = { ...packet, cases: packet.cases.slice(index, index + batchSize) };
    const expectedIds = new Set(batchPacket.cases.map((entry) => entry.caseId));
    let best = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inference = await invokeScion({ endpoint, model, packet: batchPacket, policy });
      const rawCandidate = inference.answers;
      providerCalls += 1;
      responseReceipts.push(inference.responseReceipt);
      const candidate = rawCandidate.map((entry) => {
        if (!Array.isArray(entry?.evidenceUsed) && Array.isArray(entry?.signals)) {
          responseRepairs.push({
            type: 'rename-signals-to-evidenceUsed',
            caseId: entry.caseId || null,
            batchStart: index,
            providerCall: providerCalls,
          });
          const normalized = { ...entry, evidenceUsed: entry.signals };
          delete normalized.signals;
          return normalized;
        }
        return entry;
      });
      const counts = new Map();
      const valid = candidate.filter((entry) => {
        counts.set(entry?.caseId, (counts.get(entry?.caseId) || 0) + 1);
        return expectedIds.has(entry?.caseId) && typeof entry?.decision === 'string' && Array.isArray(entry?.evidenceUsed);
      });
      if (valid.length > best.length) best = valid;
      if (
        valid.length === expectedIds.size &&
        counts.size === expectedIds.size &&
        [...counts.values()].every((count) => count === 1)
      ) {
        best = valid;
        break;
      }
    }
    answers.push(...best);
  }
  return { answers, providerCalls, responseRepairs, responseReceipts };
}

function derivedRegressionLedger(phases = []) {
  const ledger = { critical: 0, source: 0, export: 0, leakage: 0 };
  for (const { packet, attempt, result } of phases.filter((phase) => phase.name !== 'baseline')) {
    const answerByCase = new Map(attempt.answers.map((answer) => [answer.caseId, answer]));
    for (const examCase of packet.cases) {
      const decision = answerByCase.get(examCase.caseId)?.decision;
      if (decision !== 'quarantine' && examCase.signals.introducesSourceViolation === true) ledger.source += 1;
      if (decision !== 'quarantine' && examCase.signals.introducesExportRegression === true) ledger.export += 1;
    }
    ledger.leakage += result.issues.filter((issue) => issue.startsWith('leakage:')).length;
  }
  return ledger;
}

export async function runScionClassroomModelExperiment({
  endpoint = DEFAULT_ENDPOINT,
  output = DEFAULT_OUTPUT,
  write = false,
} = {}) {
  const fixture = await runScionClassroomAudit();
  const model = await discoverModel(endpoint);
  const phases = [
    { name: 'baseline', packet: fixture.baselinePacket, key: fixture.baselineAnswerKey, policyAccess: 'none', policy: null },
    {
      name: 'immediate',
      packet: fixture.packet,
      key: fixture.answerKey,
      policyAccess: 'diagnostic-card',
      policy: fixture.policyCard.policy,
    },
    {
      name: 'delayed',
      packet: fixture.sealedPacket,
      key: fixture.sealedAnswerKey,
      policyAccess: 'diagnostic-card',
      policy: fixture.policyCard.policy,
    },
  ];
  for (const phase of phases) {
    const inference = await invokeScionPhase({ endpoint, model, packet: phase.packet, policy: phase.policy });
    phase.attempt = buildScionClassroomAttempt({
      packet: phase.packet,
      actor: 'scion-model',
      policyAccess: phase.policyAccess,
      modelRef: model.ref,
      sessionRef: scionLessonKernelSha256({
        endpointReceiptSha256: model.endpointReceiptSha256,
        phase: phase.name,
        serverRequestReceipts: inference.responseReceipts.map((receipt) => receipt.serverRequestReceipt),
      }),
      providerCalls: inference.providerCalls,
      responseRepairs: inference.responseRepairs,
      responseReceipts: inference.responseReceipts,
      answers: inference.answers,
    });
    phase.result = scoreScionClassroomAttempt({ packet: phase.packet, answerKey: phase.key, attempt: phase.attempt });
  }
  const regression = derivedRegressionLedger(phases);
  const promotion = assessScionClassroomPromotion({
    preregistration: fixture.preregistration,
    baseline: phases[0].result,
    immediate: phases[1].result,
    delayed: phases[2].result,
    artifacts: {
      baseline: { packet: phases[0].packet, answerKey: phases[0].key, attempt: phases[0].attempt },
      immediate: { packet: phases[1].packet, answerKey: phases[1].key, attempt: phases[1].attempt },
      delayed: { packet: phases[2].packet, answerKey: phases[2].key, attempt: phases[2].attempt },
    },
    reviewReceipts: [],
    sessionAttestations: [],
    regression,
  });
  const report = {
    protocol: 'scion-classroom-model-experiment-v1',
    status: 'diagnostic-awaiting-independent-review',
    model,
    preregistrationSha256: fixture.preregistration.identity.sha256,
    policyCardSha256: fixture.policyCard.identity.sha256,
    sessionEvidence: {
      distinctPhaseReceipts: true,
      independentRuntimeSessions: false,
      independentlyAttested: false,
      note:
        'The three phase references bind distinct server request receipts on one local runtime; phase labels and UUIDs do not prove independent runtime sessions.',
    },
    phaseResults: Object.fromEntries(phases.map((phase) => [phase.name, phase.result])),
    regression,
    promotion,
    claimBoundary:
      'These are three real Scion phase executions on one local runtime over fixture-assigned policy-interface signals, not independently attested sessions or source-derived cross-domain proof. Promotion remains blocked until verifier-derived signal receipts, independent runtime attestations, independent review, and every preregistered gate pass.',
  };
  report.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(report) };
  if (write) {
    await fs.mkdir(output, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(output, 'model-experiment.json'), `${JSON.stringify(report, null, 2)}\n`),
      ...phases.map((phase) =>
        fs.writeFile(path.join(output, `${phase.name}-attempt.json`), `${JSON.stringify(phase.attempt, null, 2)}\n`),
      ),
    ]);
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let endpoint = DEFAULT_ENDPOINT;
  let output = DEFAULT_OUTPUT;
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--endpoint') endpoint = args[++index] || endpoint;
    else if (args[index] === '--output') output = args[++index] || output;
    else if (args[index] === '--write') write = true;
    else throw new Error('Usage: node scripts/scionClassroomModelRunner.mjs [--endpoint URL] [--output DIR] [--write]');
  }
  const report = await runScionClassroomModelExperiment({ endpoint, output, write });
  console.log(
    JSON.stringify(
      {
        status: report.status,
        baseline: report.phaseResults.baseline.score,
        immediate: report.phaseResults.immediate.score,
        delayed: report.phaseResults.delayed.score,
        promotion: report.promotion.status,
        blockers: report.promotion.issues,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
