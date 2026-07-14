import { describe, expect, it } from 'vitest';

import {
  findScionIncompleteExplanationTail,
  repairScionEnrichmentAnswerKeys,
  repairScionMcItem,
} from '../src/lib/scionAnswerKeyAlignment.js';

const TRUNCATED_CONFLICT = {
  q: 'How do teams translate stable user needs into actionable product work?',
  op: [
    'By modeling task flows before research',
    'By creating user stories that describe features',
    'By keeping needs separate from stories',
    'By focusing only on interface requests',
  ],
  ai: 3,
  ex: 'Creating user stories that describe features turns stable needs into actionable product work. Focusing only on interface requests is too narrow because',
};

describe('Scion MC contract recovery', () => {
  it('retains only complete model-authored sentences and then realigns a decisive key', () => {
    const repaired = repairScionMcItem(TRUNCATED_CONFLICT, { lessonId: 'lesson-2', itemIndex: 1 });
    expect(repaired.item).toMatchObject({
      ai: 1,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(repaired.repairs.map((entry) => entry.pass)).toEqual([
      'incompleteExplanationTail',
      'explanationKeyAlignment',
    ]);
    expect(repaired.repairs[0]).toMatchObject({
      trainingEligible: false,
      action: 'trimmed-incomplete-tail',
      recoveryEvidence: {
        verified: true,
        removedTail: 'Focusing only on interface requests is too narrow because',
      },
    });
    expect(repaired.repairs[1]).toMatchObject({
      trainingEligible: true,
      rejected: { answerIndex: 3 },
      chosen: { answerIndex: 1 },
    });
  });

  it('does not invent a boundary when the model returned no complete sentence', () => {
    const explanation = 'Creating user stories that describe features turns stable needs into actionable product work';
    expect(findScionIncompleteExplanationTail(explanation)).toBeNull();
    expect(repairScionMcItem({ ...TRUNCATED_CONFLICT, ex: explanation }, { realignAnswerKey: false }).repairs).toEqual(
      [],
    );
  });

  it('does not mistake a common abbreviation for a recoverable sentence boundary', () => {
    const explanation = 'The Dr. Smith example continues without a completed sentence';
    expect(findScionIncompleteExplanationTail(explanation)).toBeNull();
  });

  it('preserves complete explanations byte-for-byte', () => {
    const complete = {
      ...TRUNCATED_CONFLICT,
      ai: 1,
      ex: 'Creating user stories turns stable needs into product work.',
    };
    const repaired = repairScionMcItem(complete);
    expect(repaired.item).toBe(complete);
    expect(repaired.repairs).toEqual([]);
  });

  it('persists both repairs and their provenance when an enrichment graph is reopened', () => {
    const enrichment = {
      lessonContent: {
        'lesson-2': {
          quizItems: [{ ...TRUNCATED_CONFLICT, type: 'multiple_choice' }],
        },
      },
    };
    const result = repairScionEnrichmentAnswerKeys(enrichment);
    expect(result.enrichment.lessonContent['lesson-2'].quizItems[0]).toMatchObject({
      ai: 1,
      ex: 'Creating user stories that describe features turns stable needs into actionable product work.',
    });
    expect(result.enrichment.semanticRepairs.map((entry) => entry.pass)).toEqual([
      'incompleteExplanationTail',
      'explanationKeyAlignment',
    ]);
    expect(enrichment.lessonContent['lesson-2'].quizItems[0]).toEqual({
      ...TRUNCATED_CONFLICT,
      type: 'multiple_choice',
    });
  });
});
