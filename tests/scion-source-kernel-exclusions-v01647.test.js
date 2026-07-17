import { describe, expect, it } from 'vitest';

import { buildScionSourceKernelExclusionsV01647 } from '../scripts/scionSourceKernelExclusionsV01647.mjs';

describe('Scion v0.16.47 prior source-kernel exclusions', () => {
  it('binds both prior judge workbooks into one deduplicated semantic-kernel inventory', async () => {
    const report = await buildScionSourceKernelExclusionsV01647();
    expect(report).toMatchObject({
      status: 'prior-judged-source-kernels-bound',
      sourceKernelCount: 37,
      reviewedCases: 220,
      sourceKernelCountsByDomain: {
        'computer-science': 12,
        geology: 12,
        'music-theory': 7,
        'user-experience-design': 6,
      },
    });
    expect(new Set(report.sourceKernelSha256).size).toBe(37);
  });
});
