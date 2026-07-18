import { assessPublicScionKernelResponse } from '../../src/lib/publicScionProvider.js';
import { scionLessonKernelSha256 } from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_ADMISSION_REPLAY_PROTOCOL =
  'scion-lesson-kernel-admission-replay-v1';

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identitySha256;
  return copy;
}

export function replayScionLessonKernelAdmissionReport({ campaign, capture, compiler, generatedAt } = {}) {
  if (capture?.campaignIdentity?.sha256 !== campaign?.identity?.sha256) {
    throw new Error('Admission replay capture does not match the campaign identity');
  }
  const campaignCases = new Map((campaign?.cases || []).map((entry) => [entry.caseId, entry]));
  const calls = (capture?.calls || []).map((call) => {
    const entry = campaignCases.get(call.caseId);
    if (!entry) throw new Error(`Admission replay campaign case is missing: ${call.caseId}`);
    if (call.artifactSha256 !== scionLessonKernelSha256(call.artifact)) {
      throw new Error(`Admission replay artifact identity changed: ${call.caseId}`);
    }
    const admission = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [call.artifact] }),
      entry.userPrompt,
      'blueprintEnrichment',
    );
    return {
      caseId: call.caseId,
      caseSha256: call.caseSha256,
      messagesSha256: call.messagesSha256,
      sourceContextSha256: call.sourceContextSha256,
      arm: call.arm,
      model: call.model,
      artifact: call.artifact,
      artifactSha256: call.artifactSha256,
      admission,
      compilerRepairs: Array.isArray(call.compilerRepairs) ? call.compilerRepairs : [],
      upstreamAdmission: call.admission,
      upstreamCaptureCallSha256: scionLessonKernelSha256(call),
    };
  });
  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_ADMISSION_REPLAY_PROTOCOL,
    campaignIdentity: campaign.identity,
    upstreamCapture: {
      protocol: capture.protocol,
      identitySha256: capture.identitySha256,
      compilerIdentitySha256: capture.compiler?.identitySha256,
    },
    arm: capture.arm,
    model: capture.model,
    compiler,
    generatedAt,
    calls,
    summary: {
      cases: calls.length,
      upstreamAdmitted: calls.filter((call) => call.upstreamAdmission?.needsRetry === false).length,
      replayAdmitted: calls.filter((call) => call.admission.needsRetry === false).length,
      replayRejected: calls.filter((call) => call.admission.needsRetry === true).length,
      addedIssueCases: calls.filter((call) => {
        const prior = new Set(call.upstreamAdmission?.issues || []);
        return (call.admission.issues || []).some((issue) => !prior.has(issue));
      }).length,
      removedIssueCases: calls.filter((call) => {
        const next = new Set(call.admission.issues || []);
        return (call.upstreamAdmission?.issues || []).some((issue) => !next.has(issue));
      }).length,
    },
    claimBoundary:
      'This report replays frozen artifacts through a newer deterministic compiler only. It contains no new model generation, judgment, human evidence, adapter win, or production activation claim.',
  };
  report.identitySha256 = scionLessonKernelSha256(withoutIdentity(report));
  return report;
}

export function validateScionLessonKernelAdmissionReplay(report = {}) {
  const issues = [];
  if (report.protocol !== SCION_LESSON_KERNEL_ADMISSION_REPLAY_PROTOCOL) issues.push('protocol');
  if (!Array.isArray(report.calls) || report.calls.length === 0) issues.push('calls');
  if (report.compiler?.policy?.keyTermSemanticProfile !== 'source-strict-v6') issues.push('semantic-profile');
  for (const call of report.calls || []) {
    if (call.artifactSha256 !== scionLessonKernelSha256(call.artifact)) issues.push(`artifact:${call.caseId}`);
    if (!call.upstreamCaptureCallSha256) issues.push(`upstream:${call.caseId}`);
  }
  if (report.identitySha256 !== scionLessonKernelSha256(withoutIdentity(report))) issues.push('identity');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
