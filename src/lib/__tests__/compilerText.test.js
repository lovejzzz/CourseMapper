import { describe, expect, it } from 'vitest';

import { humanizeQuizText, humanSourceCueLabel, isInternalSourceCue } from '../compilerText.js';

describe('humanizeQuizText', () => {
  it('removes a dangling math delimiter after sentence punctuation', () => {
    expect(humanizeQuizText('Which distinction is supported?$')).toBe('Which distinction is supported?');
  });

  it('preserves balanced inline math at the end of a prompt', () => {
    expect(humanizeQuizText('Evaluate $x$')).toBe('Evaluate $x$');
  });
});

describe('classroom source cues', () => {
  it('rejects internal projection and course-map placeholder labels', () => {
    for (const value of ['fact-ledger-projection', 'verified-quiz-projection', 'Existing course map fields.']) {
      expect(isInternalSourceCue(value)).toBe(true);
      expect(humanSourceCueLabel(value, 'the assigned course materials')).toBe('the assigned course materials');
    }
  });

  it('preserves a human-facing source title', () => {
    expect(humanSourceCueLabel('OpenStax Biology 2e', 'fallback')).toBe('OpenStax Biology 2e');
  });
});
