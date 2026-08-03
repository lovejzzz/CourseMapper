import { describe, expect, it } from 'vitest';

import {
  cleanText,
  humanizeQuizText,
  humanSourceCueLabel,
  isInternalSourceCue,
  repairMalformedClearPluralPossessives,
} from '../compilerText.js';
import { stableLessonContractObjective } from '../lessonAssessmentContract.js';

describe('stable lesson assessment contract', () => {
  it('derives a course-neutral objective from an unseen lesson identity', () => {
    expect(stableLessonContractObjective({ title: 'Week 7: Coastal Flood Adaptation' })).toBe(
      'Apply Coastal Flood Adaptation in one practical example and justify one evidence-based revision.',
    );
  });
});

describe('learner-facing possessives', () => {
  it('repairs a duplicated possessive marker on clearly plural title nouns', () => {
    expect(repairMalformedClearPluralPossessives("The Thousand and One Nights's narrative framing")).toBe(
      "The Thousand and One Nights' narrative framing",
    );
    expect(cleanText("  Seasons's   evidence  ")).toBe("Seasons' evidence");
  });

  it('preserves grammatical singular names ending in s', () => {
    expect(cleanText("Odysseus's account and James's notes")).toBe("Odysseus's account and James's notes");
    expect(cleanText('Odysseus’s account')).toBe('Odysseus’s account');
  });
});

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
