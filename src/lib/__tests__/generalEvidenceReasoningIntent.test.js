import { describe, expect, it } from 'vitest';
import { buildGeneralEvidenceReasoningIntent } from '../generalEvidenceReasoningIntent';

describe('buildGeneralEvidenceReasoningIntent', () => {
  it.each([0, 1, 2])('treats sentence-shaped assessment titles as inline labels (variant %s)', (variationKey) => {
    const intent = buildGeneralEvidenceReasoningIntent({
      focusConcept: 'Language Change.',
      artifact: 'Sound Change Mechanisms application check.',
      variationKey,
    });

    expect(intent.objective).not.toMatch(/\.\.|\.\:|:\./);
    expect(intent.evidenceRequirement).not.toMatch(/\.\.|\.\:|:\./);
    expect(intent.objective).toContain('Sound Change Mechanisms application check');
  });
});
