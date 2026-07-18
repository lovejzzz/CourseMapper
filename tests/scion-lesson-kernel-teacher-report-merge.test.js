import { describe, expect, it } from 'vitest';

import { scionLessonKernelSha256 } from '../scripts/lib/scionLessonKernelCampaign.mjs';
import {
  mergeScionLessonKernelTeacherReports,
  validateScionLessonKernelMergedTeacherReport,
} from '../scripts/lib/scionLessonKernelTeacherReportMerge.mjs';
import { SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL } from '../scripts/lib/scionLessonKernelTeacherRevision.mjs';

function sourceReport({ caseId, packet, admitted = true, workbook = '2', reportSeed = 'source' }) {
  const artifact = { id: `lesson-${caseId}`, keyTerms: [], scenario: {}, mc: [] };
  const report = {
    schemaVersion: 1,
    protocol: SCION_LESSON_KERNEL_TEACHER_REPORT_PROTOCOL,
    campaignIdentity: { algorithm: 'sha256-canonical-json', sha256: '1'.repeat(64) },
    workbookSha256: workbook.repeat(64),
    reviser: { model: 'gpt-5.6-sol', revision: 'codex-cli 0.144.5', runtime: 'isolated' },
    calls: [
      {
        caseId,
        arm: 'teacher-revision',
        artifact,
        artifactSha256: scionLessonKernelSha256(artifact),
        admission: { needsRetry: !admitted },
        revisionEvidence: { packetSha256: packet.repeat(64), sessionId: `session-${caseId}` },
      },
    ],
    batchReports: [
      {
        packetSha256: packet.repeat(64),
        resultSha256: scionLessonKernelSha256(`${reportSeed}-result`),
        reportSha256: scionLessonKernelSha256(`${reportSeed}-compiled`),
      },
    ],
    summary: { cases: 1, compilerAdmitted: admitted ? 1 : 0, compilerRejected: admitted ? 0 : 1 },
    claimBoundary: 'fixture',
  };
  report.identity = {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256({ ...report, identity: undefined }),
  };
  return report;
}

describe('Scion lesson-kernel teacher report merge', () => {
  it('keeps unique admitted calls and binds their original report and workbook lineage', () => {
    const first = sourceReport({ caseId: 'case-a', packet: '3', workbook: '4', reportSeed: 'first' });
    const rejected = sourceReport({ caseId: 'case-b', packet: '5', admitted: false, workbook: '6' });
    const second = sourceReport({ caseId: 'case-c', packet: '7', workbook: '8', reportSeed: 'second' });
    const merged = mergeScionLessonKernelTeacherReports({
      sources: [
        { path: 'v1.json', report: first },
        { path: 'rejected.json', report: rejected },
        { path: 'v2.json', report: second },
      ],
    });

    expect(merged.calls.map((call) => call.caseId)).toEqual(['case-a', 'case-c']);
    expect(merged.summary).toEqual({
      cases: 2,
      compilerAdmitted: 2,
      compilerRejected: 0,
      excludedCompilerRejected: 1,
      sourceReports: 3,
    });
    expect(merged.batchReports[0]).toMatchObject({
      sourceReportSha256: first.identity.sha256,
      sourceWorkbookSha256: first.workbookSha256,
    });
    expect(validateScionLessonKernelMergedTeacherReport(merged)).toEqual({ valid: true, issues: [] });
  });

  it('fails closed when two admitted reports reuse a case', () => {
    const first = sourceReport({ caseId: 'case-a', packet: '3' });
    const duplicate = sourceReport({ caseId: 'case-a', packet: '4', reportSeed: 'duplicate' });
    expect(() =>
      mergeScionLessonKernelTeacherReports({
        sources: [
          { path: 'v1.json', report: first },
          { path: 'v2.json', report: duplicate },
        ],
      }),
    ).toThrow('Duplicate compiler-admitted teacher case: case-a');
  });
});
