import { assessPublicScionKernelResponse, shufflePublicScionKernelOptions } from '../../src/lib/publicScionProvider.js';
import {
  buildScionLessonKernelResponseSchema,
  scionLessonKernelSha256,
  stableScionLessonKernelJson,
} from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_TEACHER_PACKET_PROTOCOL = 'scion-lesson-kernel-teacher-revision-packet-v1';
export const SCION_LESSON_KERNEL_TEACHER_RESULT_PROTOCOL = 'scion-lesson-kernel-teacher-revision-result-v1';
export const SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL = 'scion-lesson-kernel-teacher-capture-v1';

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

function reportCalls(report = {}) {
  return new Map((report?.calls || []).map((call) => [call.caseId, call]));
}

export function buildScionLessonKernelTeacherRevisionPacket({
  batchId,
  campaign,
  aggregate,
  referenceReport,
  prompt,
  generatedAt,
} = {}) {
  const campaignCases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const reference = reportCalls(referenceReport);
  const cases = (aggregate?.results || [])
    .filter((result) => {
      if (!result.stable || result.stableWinner !== 'reference') return false;
      // A paired result records the compiler boundary that existed when the
      // judgment was sealed. Later semantic gates may correctly quarantine
      // that same frozen winner. Repair it when the current replay rejects it
      // even if the historical aggregate once labeled it training-eligible.
      const currentCall = reference.get(result.caseId);
      return !result.trainingEligible || currentCall?.admission?.needsRetry === true;
    })
    .map((result) => {
      const entry = campaignCases.get(result.caseId);
      const call = reference.get(result.caseId);
      if (!entry || !call?.artifact) return null;
      return {
        caseId: entry.caseId,
        caseSha256: entry.caseSha256,
        lessonInput: entry.lessonInput,
        sourceContext: entry.sourceContext,
        originalArtifact: call.artifact,
        originalArtifactSha256: call.artifactSha256,
        compilerAdmission: {
          needsRetry: call.admission?.needsRetry === true,
          issues: Array.isArray(call.admission?.issues) ? call.admission.issues : [],
        },
        diagnoses: (result.scoreQualification?.orders || []).map((order) => ({
          winnerScores: order.winnerScores,
          criticalDefects: order.winnerCriticalDefects,
          rationale: order.rationale,
          decisionSha256: order.decisionSha256,
        })),
      };
    })
    .filter(Boolean);
  const packet = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_PACKET_PROTOCOL,
    generatedAt,
    batchId,
    campaignIdentity: campaign?.identity,
    aggregateSha256: aggregate?.identity?.sha256,
    prompt,
    cases,
    claimBoundary:
      'These are source packets, diagnosed reference artifacts, and compiler outcomes only. No local artifact, provider route, organizer preference, or training authorization is included.',
  };
  packet.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(withoutIdentity(packet)) };
  return packet;
}

export function validateScionLessonKernelTeacherRevisionPacket(packet = {}) {
  const issues = [];
  if (packet.protocol !== SCION_LESSON_KERNEL_TEACHER_PACKET_PROTOCOL) issues.push('protocol');
  if (!Array.isArray(packet.cases) || packet.cases.length === 0) issues.push('cases');
  const seen = new Set();
  for (const entry of packet.cases || []) {
    if (!entry.caseId || seen.has(entry.caseId)) issues.push(`case-id:${entry.caseId || 'missing'}`);
    seen.add(entry.caseId);
    if (entry.originalArtifactSha256 !== scionLessonKernelSha256(entry.originalArtifact)) {
      issues.push(`artifact:${entry.caseId}`);
    }
    if (!Array.isArray(entry.sourceContext?.claims) || entry.sourceContext.claims.length === 0) {
      issues.push(`source:${entry.caseId}`);
    }
    if (!Array.isArray(entry.diagnoses) || entry.diagnoses.length !== 2) issues.push(`diagnoses:${entry.caseId}`);
  }
  if (packet.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(packet))) issues.push('identity');
  const serialized = stableScionLessonKernelJson(packet);
  for (const forbidden of ['localReport', 'localArtifact', 'provider', 'route', 'trainingEligible']) {
    if (new RegExp(`"${forbidden}"`, 'i').test(serialized)) issues.push(`forbidden-key:${forbidden}`);
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function buildScionLessonKernelTeacherRevisionSchema(packet = {}) {
  const revisionSchema = (entry = {}) => {
    const sourceClaims = Array.isArray(entry.sourceContext?.claims) ? entry.sourceContext.claims : [];
    const sourceLedger = entry.lessonInput?.sourceFactPolicy === 'numbered-source-ledger-v1';
    const lessonSchema = structuredClone(
      buildScionLessonKernelResponseSchema(entry.lessonInput?.lessonId || 'lesson', {
        factCount: sourceLedger ? sourceClaims.length : 5,
      }).properties.lessons.items,
    );
    lessonSchema.properties.lessonId = { type: 'string', const: entry.lessonInput?.lessonId || 'lesson' };
    if (sourceLedger) {
      lessonSchema.properties.facts = {
        type: 'array',
        prefixItems: sourceClaims.map((claim) => ({ type: 'string', const: claim })),
        // The Codex structured-output subset requires `items` to be a schema
        // object. `maxItems` still closes the tuple after the pinned claims.
        items: { type: 'string' },
        minItems: sourceClaims.length,
        maxItems: sourceClaims.length,
      };
    }
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        caseId: { type: 'string', const: entry.caseId },
        originalArtifactSha256: { type: 'string', const: entry.originalArtifactSha256 },
        lessonKernel: lessonSchema,
        changeSummary: { type: 'array', minItems: 1, items: { type: 'string', minLength: 12 } },
        addressedDiagnoses: { type: 'array', minItems: 1, items: { type: 'string', minLength: 12 } },
      },
      required: ['caseId', 'originalArtifactSha256', 'lessonKernel', 'changeSummary', 'addressedDiagnoses'],
    };
  };
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      schemaVersion: { type: 'integer', const: 1 },
      protocol: { type: 'string', const: SCION_LESSON_KERNEL_TEACHER_RESULT_PROTOCOL },
      packetSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      sessionId: { type: 'string', minLength: 8 },
      reviser: {
        type: 'object',
        additionalProperties: false,
        properties: {
          model: { type: 'string', minLength: 1 },
          revision: { type: 'string', minLength: 1 },
          runtime: { type: 'string', minLength: 1 },
        },
        required: ['model', 'revision', 'runtime'],
      },
      completedAt: { type: 'string', minLength: 10 },
      attestations: {
        type: 'object',
        additionalProperties: false,
        properties: {
          suppliedClaimsOnly: { type: 'boolean', const: true },
          noExternalFacts: { type: 'boolean', const: true },
          noTrainingAuthorization: { type: 'boolean', const: true },
        },
        required: ['suppliedClaimsOnly', 'noExternalFacts', 'noTrainingAuthorization'],
      },
      revisions: {
        type: 'array',
        minItems: packet.cases?.length || 1,
        maxItems: packet.cases?.length || 1,
        prefixItems: (packet.cases || []).map(revisionSchema),
        // Keep this compatible with structured-output validators that reject
        // boolean array schemas. The exact tuple is still pinned by
        // `prefixItems`, and result validation binds every case again.
        items: { anyOf: (packet.cases || []).map(revisionSchema) },
      },
    },
    required: [
      'schemaVersion',
      'protocol',
      'packetSha256',
      'sessionId',
      'reviser',
      'completedAt',
      'attestations',
      'revisions',
    ],
  };
  return schema;
}

export function validateScionLessonKernelTeacherRevisionResult(result = {}, packet = {}) {
  const issues = [];
  if (result.protocol !== SCION_LESSON_KERNEL_TEACHER_RESULT_PROTOCOL) issues.push('protocol');
  if (result.packetSha256 !== packet.identity?.sha256) issues.push('packet-sha256');
  if (!String(result.sessionId || '').trim()) issues.push('session-id');
  if (!String(result.reviser?.model || '').trim() || !String(result.reviser?.revision || '').trim())
    issues.push('reviser');
  for (const key of ['suppliedClaimsOnly', 'noExternalFacts', 'noTrainingAuthorization']) {
    if (result.attestations?.[key] !== true) issues.push(`attestation:${key}`);
  }
  const revisions = new Map((result.revisions || []).map((entry) => [entry.caseId, entry]));
  if (revisions.size !== packet.cases?.length) issues.push('revision-count');
  for (const entry of packet.cases || []) {
    const revision = revisions.get(entry.caseId);
    if (!revision) {
      issues.push(`missing-revision:${entry.caseId}`);
      continue;
    }
    if (revision.originalArtifactSha256 !== entry.originalArtifactSha256) issues.push(`original:${entry.caseId}`);
    if (revision.lessonKernel?.lessonId !== entry.lessonInput?.lessonId) issues.push(`lesson-id:${entry.caseId}`);
    if (!Array.isArray(revision.changeSummary) || revision.changeSummary.length === 0)
      issues.push(`changes:${entry.caseId}`);
    if (!Array.isArray(revision.addressedDiagnoses) || revision.addressedDiagnoses.length === 0) {
      issues.push(`diagnoses:${entry.caseId}`);
    }
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function compileScionLessonKernelTeacherRevisionResult({ result, packet, campaign } = {}) {
  const validation = validateScionLessonKernelTeacherRevisionResult(result, packet);
  if (!validation.valid) throw new Error(`Invalid teacher revision result: ${validation.issues.join(', ')}`);
  const cases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const revisions = new Map(result.revisions.map((entry) => [entry.caseId, entry]));
  const calls = packet.cases.map((packetCase) => {
    const entry = cases.get(packetCase.caseId);
    const revision = revisions.get(packetCase.caseId);
    if (!entry) throw new Error(`Teacher revision campaign case is missing: ${packetCase.caseId}`);
    const responseText = JSON.stringify({ lessons: [revision.lessonKernel] });
    const admission = assessPublicScionKernelResponse(responseText, entry.userPrompt, 'blueprintEnrichment');
    const shuffled = admission.needsRetry
      ? { text: responseText, repairs: [] }
      : shufflePublicScionKernelOptions(responseText);
    const artifact = JSON.parse(shuffled.text).lessons[0];
    return {
      caseId: entry.caseId,
      caseSha256: entry.caseSha256,
      arm: 'teacher-revision',
      model: result.reviser,
      sourceContextSha256: scionLessonKernelSha256(entry.sourceContext),
      originalArtifactSha256: packetCase.originalArtifactSha256,
      artifact,
      artifactSha256: scionLessonKernelSha256(artifact),
      admission,
      compilerRepairs: shuffled.repairs,
      revisionEvidence: {
        packetSha256: packet.identity.sha256,
        sessionId: result.sessionId,
        changeSummary: revision.changeSummary,
        addressedDiagnoses: revision.addressedDiagnoses,
      },
    };
  });
  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL,
    campaignIdentity: campaign.identity,
    packetSha256: packet.identity.sha256,
    resultSha256: scionLessonKernelSha256(result),
    reviser: result.reviser,
    calls,
    summary: {
      cases: calls.length,
      compilerAdmitted: calls.filter((call) => call.admission.needsRetry === false).length,
      compilerRejected: calls.filter((call) => call.admission.needsRetry === true).length,
    },
    claimBoundary:
      'These source-constrained model revisions cleared only deterministic compiler admission where stated. They are not judge preferences, human evidence, adapter wins, or training authorization.',
  };
  report.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(withoutIdentity(report)) };
  return report;
}
