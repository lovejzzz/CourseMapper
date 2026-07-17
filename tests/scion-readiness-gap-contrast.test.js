import { describe, expect, it } from 'vitest';

import { buildScionReadinessGapContrastV01647 } from '../scripts/scionReadinessGapContrastV01647.mjs';

describe('Scion readiness-gap contrast', () => {
  it('binds the exact local and reference captures for five focused kernels', async () => {
    const report = await buildScionReadinessGapContrastV01647();

    expect(report).toMatchObject({
      protocol: 'scion-contrast-matrix-v1',
      release: 'v0.16.47',
      promptPolicy: 'source-atom-authoring-v2',
      evidence: {
        courseGroupsByDomain: { economics: 1, 'music-theory': 1 },
        sourceKernels: 5,
      },
    });
    expect(report.pairs).toHaveLength(2);
    expect(report.evidence.artifacts).toHaveLength(4);
    expect(report.pairs.map((pair) => pair.domain).sort()).toEqual(['economics', 'music-theory']);
  });
});
