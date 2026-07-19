import { describe, expect, it } from 'vitest';

import { buildScionAuthoringV2ComparisonAudit } from '../scripts/scionAuthoringV2ComparisonAudit.mjs';

describe('Scion authoring v2 comparison', () => {
  it('replays the same kernels through the strict gate and reports the remaining gap honestly', async () => {
    const report = await buildScionAuthoringV2ComparisonAudit();

    expect(report).toMatchObject({
      status: 'strict-compiler-gap-materially-narrowed',
      semanticKernelControl: {
        kernelsPerCampaign: 34,
        exactPayloadMatch: true,
        combinedCourseGroupsByDomain: { anatomy: 3, economics: 3, physics: 3 },
      },
      candidateSurfaces: {
        v1: { rows: 69, localEligible: 54 },
        v2: { rows: 91, localEligible: 88, referenceEligible: 86 },
      },
      deltas: {
        localStrictRawAtoms: 39,
        localStrictCompiledAtoms: 37,
        compiledLocalGapV1: 77,
        compiledLocalGapV2: 33,
        compiledGapNarrowing: 44,
      },
    });
    expect(Object.values(report.assertions)).toEqual(Array(Object.keys(report.assertions).length).fill(true));
  });
});
