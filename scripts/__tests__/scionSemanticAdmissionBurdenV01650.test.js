import { describe, expect, it } from 'vitest';

import { runScionSemanticAdmissionBurdenV01650 } from '../scionSemanticAdmissionBurdenV01650.mjs';

describe('Scion semantic-admission burden evidence', () => {
  it('stays byte-bound to the tracked retained replay and its upstream receipt', async () => {
    const result = await runScionSemanticAdmissionBurdenV01650({ cwd: process.cwd() });

    expect(result.report.protocol).toBe('scion-semantic-admission-v4-burden-replay-v2');
    expect(result.report.evidence.retainedLocalReplay.sourceCompilerReceipt).toMatchObject({
      release: 'v0.16.47',
      projectCount: 12,
    });
    expect(result.report.retainedLocalReplay.deltas.additionalBurdenAtoms).toBe(2);
  });
});
