import { describe, expect, it } from 'vitest';

import { buildScionNovelBreadthEvidence } from '../scripts/scionNovelBreadthEvidenceAudit.mjs';

describe('Scion novel breadth evidence', () => {
  it('separates attempted kernels from reviewable pairs and binds honest compiler burden', async () => {
    const report = await buildScionNovelBreadthEvidence();

    expect(report).toMatchObject({
      status: 'novel-breadth-packet-awaiting-paired-judgment',
      combinedCapture: {
        prompts: 42,
        expectedAtomsPerArm: 168,
        localRawAdmitted: 71,
        localCompiledAdmitted: 95,
        referenceRawAdmitted: 142,
        referenceCompiledAdmitted: 165,
        compiledReferenceLead: 70,
      },
      candidatePool: {
        rows: 94,
        attemptedSourceKernels: 42,
        reviewableSourceKernels: 36,
        reviewableSourceTasks: 60,
        courseGroups: 5,
        priorJudgedKernelOverlap: 0,
        licenses: {
          'CC-BY-4.0': 69,
          'CC-BY-SA-4.0': 11,
          'U.S. Government Work': 14,
        },
      },
      packet: {
        selectedCases: 94,
        coverageStatus: 'needs-more-course-groups',
        judgmentStatus: 'not-yet-measured',
      },
      licenseBoundary: { productionCompatibleRows: 83, shareAlikeResearchRows: 11 },
    });
    expect(Object.values(report.assertions)).toEqual(Array(Object.keys(report.assertions).length).fill(true));
  });
});
