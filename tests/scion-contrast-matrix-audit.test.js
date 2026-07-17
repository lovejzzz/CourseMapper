import { describe, expect, it } from 'vitest';

import { partitionScionContrastPairs } from '../scripts/scionContrastMatrixAudit.mjs';

describe('Scion contrast matrix evidence boundaries', () => {
  it('routes only full-course pairs into the full-course scorer', () => {
    const fullCourse = { id: 'full-course' };
    const blind = { id: 'blind', evaluationUse: 'blind-review-only' };
    const training = { id: 'training', evaluationUse: 'single-model-judge-training-candidate-only' };

    expect(partitionScionContrastPairs([fullCourse, blind, training])).toEqual({
      fullCoursePairs: [fullCourse],
      nonFullCoursePairs: [blind, training],
      reviewOnlyPairs: [blind],
      evaluationUseCounts: {
        'blind-review-only': 1,
        'single-model-judge-training-candidate-only': 1,
      },
    });
  });
});
