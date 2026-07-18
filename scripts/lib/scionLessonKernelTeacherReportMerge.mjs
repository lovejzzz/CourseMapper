import { SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL } from './scionLessonKernelTeacherRevision.mjs';
import { scionLessonKernelSha256, stableScionLessonKernelJson } from './scionLessonKernelCampaign.mjs';

export const SCION_LESSON_KERNEL_TEACHER_MERGE_PROTOCOL = 'scion-lesson-kernel-teacher-report-merge-v2';

function withoutIdentity(value = {}) {
  const next = structuredClone(value);
  delete next.identity;
  return next;
}

function admitted(call) {
  return call?.admission?.needsRetry === false;
}

export function validateScionLessonKernelTeacherSourceReport(report = {}) {
  const issues = [];
  if (report.protocol !== SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL) issues.push('protocol');
  if (!report.campaignIdentity?.sha256) issues.push('campaign-identity');
  if (!Array.isArray(report.calls)) issues.push('calls');
  if (!Array.isArray(report.batchReports)) issues.push('batch-reports');
  if (!report.reviser?.model || !report.reviser?.revision || !report.reviser?.runtime) issues.push('reviser');
  if (report.identity?.sha256 !== scionLessonKernelSha256(withoutIdentity(report))) issues.push('identity');

  const caseIds = new Set();
  const packets = new Set((report.batchReports || []).map((entry) => entry.packetSha256));
  for (const call of report.calls || []) {
    if (!call.caseId || caseIds.has(call.caseId)) issues.push(`case-id:${call.caseId || 'missing'}`);
    caseIds.add(call.caseId);
    if (call.arm !== 'teacher-revision') issues.push(`arm:${call.caseId || 'missing'}`);
    if (!call.artifact || call.artifactSha256 !== scionLessonKernelSha256(call.artifact)) {
      issues.push(`artifact:${call.caseId || 'missing'}`);
    }
    if (!packets.has(call.revisionEvidence?.packetSha256)) {
      issues.push(`packet:${call.caseId || 'missing'}`);
    }
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function mergeScionLessonKernelTeacherReports({
  sources = [],
  excludedQualifiedCases = [],
  exclusionEvidence = null,
} = {}) {
  if (!Array.isArray(sources) || sources.length < 1) throw new Error('At least one teacher report is required');
  const excludedQualified = new Set(excludedQualifiedCases);
  const campaignSha256 = sources[0]?.report?.campaignIdentity?.sha256;
  const reviser = sources[0]?.report?.reviser;
  const reviserIdentity = stableScionLessonKernelJson(reviser);
  const calls = [];
  const batchReports = [];
  const sourceReports = [];
  const seenAdmittedCases = new Set();
  let compilerRejected = 0;
  let directQualified = 0;

  for (const [index, source] of sources.entries()) {
    const report = source?.report || {};
    const validation = validateScionLessonKernelTeacherSourceReport(report);
    if (!validation.valid) {
      throw new Error(`Invalid teacher source report ${source?.path || index + 1}: ${validation.issues.join(', ')}`);
    }
    if (report.campaignIdentity.sha256 !== campaignSha256) {
      throw new Error(`Teacher source report campaign changed: ${source?.path || index + 1}`);
    }
    if (stableScionLessonKernelJson(report.reviser) !== reviserIdentity) {
      throw new Error(`Teacher source report reviser changed: ${source?.path || index + 1}`);
    }

    const admittedCalls = report.calls.filter(admitted);
    compilerRejected += report.calls.length - admittedCalls.length;
    const eligibleCalls = [];
    for (const call of admittedCalls) {
      if (seenAdmittedCases.has(call.caseId)) {
        throw new Error(`Duplicate compiler-admitted teacher case: ${call.caseId}`);
      }
      seenAdmittedCases.add(call.caseId);
      if (excludedQualified.has(call.caseId)) {
        directQualified += 1;
        continue;
      }
      eligibleCalls.push(call);
      calls.push(call);
    }
    const eligiblePackets = new Set(eligibleCalls.map((call) => call.revisionEvidence.packetSha256));
    const eligibleBatchReports = report.batchReports.filter((entry) => eligiblePackets.has(entry.packetSha256));
    batchReports.push(
      ...eligibleBatchReports.map((entry) => ({
        ...entry,
        sourceReportSha256: report.identity.sha256,
        sourceWorkbookSha256: report.workbookSha256,
      })),
    );
    sourceReports.push({
      index: index + 1,
      path: source?.path || null,
      reportSha256: report.identity.sha256,
      workbookSha256: report.workbookSha256,
      compilerAdmitted: admittedCalls.length,
      compilerRejected: report.calls.length - admittedCalls.length,
      mergedCandidates: eligibleCalls.length,
      excludedDirectQualified: admittedCalls.length - eligibleCalls.length,
      caseIds: eligibleCalls.map((call) => call.caseId),
    });
  }

  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL,
    campaignIdentity: sources[0].report.campaignIdentity,
    reviser,
    calls,
    batchReports,
    sourceReports,
    merge: {
      protocol: SCION_LESSON_KERNEL_TEACHER_MERGE_PROTOCOL,
      sourceReportCount: sourceReports.length,
      admissionPolicy: 'compiler-admitted-non-direct-qualified-only',
      exclusion: {
        qualifiedCases: excludedQualified.size,
        evidence: exclusionEvidence,
      },
    },
    summary: {
      cases: calls.length,
      compilerAdmitted: calls.length,
      compilerRejected: 0,
      excludedCompilerRejected: compilerRejected,
      excludedDirectQualified: directQualified,
      sourceReports: sourceReports.length,
    },
    claimBoundary:
      'This merge contains unique compiler-admitted source-constrained teacher revisions that do not already have direct-qualified evidence. Every artifact still requires fresh anonymous paired-order judgment and is not human evidence, adapter-win evidence, or training authorization.',
  };
  report.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(report)),
  };
  return report;
}

export function validateScionLessonKernelMergedTeacherReport(report = {}) {
  const validation = validateScionLessonKernelTeacherSourceReport(report);
  const issues = [...validation.issues];
  if (report.merge?.protocol !== SCION_LESSON_KERNEL_TEACHER_MERGE_PROTOCOL) issues.push('merge-protocol');
  if (report.merge?.admissionPolicy !== 'compiler-admitted-non-direct-qualified-only') {
    issues.push('admission-policy');
  }
  if ((report.calls || []).some((call) => !admitted(call))) issues.push('compiler-rejected-call');
  if (new Set((report.calls || []).map((call) => call.caseId)).size !== (report.calls || []).length) {
    issues.push('duplicate-case');
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
