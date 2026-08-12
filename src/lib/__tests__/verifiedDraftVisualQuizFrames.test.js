import { describe, expect, it } from 'vitest';
import { createTypedVisualQuizFrames } from '../verifiedDraftVisualQuizFrames.js';

describe('typed visual quiz frames', () => {
  it('uses human labels in learner prose and keeps machine identifiers out of the answer surface', () => {
    const frames = createTypedVisualQuizFrames({
      concept: 'context and interpretation',
      sourceId: 'CM-SRC-L01',
      productId: 'CM-PROD-L01',
      sourceLabel: 'context comparison',
      lesson: { lessonNumber: 1 },
      lessonVariant: (_lesson, choices) => choices[0],
      profile: {
        specimenKind: 'context comparison',
        expectedObservation: 'Context changes the warranted claim boundary.',
        entities: [
          { id: 'image-a', label: 'image with context' },
          { id: 'image-b', label: 'image without context' },
        ],
        relations: [
          {
            id: 'same-subject',
            label: 'matched subject comparison',
            type: 'same-subject',
            from: 'image-a',
            to: 'image-b',
            visibleStatement: 'The two views use the same subject with different context.',
          },
        ],
      },
    });

    const learnerCopy = JSON.stringify(frames);
    expect(learnerCopy).toContain('image with context');
    expect(learnerCopy).toContain('matched subject comparison');
    expect(learnerCopy).not.toMatch(/\bimage-a\b|\bsame-subject\b|\bimage-an\b/);
  });
});
