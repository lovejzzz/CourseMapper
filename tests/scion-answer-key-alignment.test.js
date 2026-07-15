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

  it('realigns a short answer when the explanation explicitly names the correct option text', () => {
    const repaired = repairScionMcItem({
      q: 'Which process transports sediment away from its source?',
      op: ['Mechanical weathering', 'Chemical weathering', 'Erosion', 'Deposition'],
      ai: 0,
      ex: 'Erosion is the correct choice because water, wind, gravity, or ice moves sediment away.',
    });
    expect(repaired.item.ai).toBe(2);
    expect(repaired.repairs[0]).toMatchObject({
      pass: 'explanationKeyAlignment',
      preferenceEvidence: {
        supportMethod: 'explicit-explanation-cue',
        declaredIndex: 0,
        supportedIndex: 2,
      },
    });
  });

  it('realigns from an explicit option label even when option wording has little lexical overlap', () => {
    const repaired = repairScionMcItem({
      q: 'What results when directed stress aligns mineral crystals?',
      op: ['Crystalline structure', 'Foliation', 'Melting', 'Erosion'],
      ai: 3,
      ex: 'Option B is correct because directed stress produces planar foliation.',
    });
    expect(repaired.item.ai).toBe(1);
    expect(repaired.repairs[0].preferenceEvidence).toMatchObject({
      supportMethod: 'explicit-explanation-cue',
      supportedIndex: 1,
    });
  });

  it('can replay the pre-explicit-cue historical contract without rewriting old receipts', () => {
    const item = {
      q: 'What results when directed stress aligns mineral crystals?',
      op: ['Crystalline structure', 'Foliation', 'Melting', 'Erosion'],
      ai: 3,
      ex: 'Option B is correct because directed stress produces planar foliation.',
    };
    expect(repairScionMcItem(item, { keyConflictOptions: { allowExplicitCues: false } })).toEqual({
      item,
      repairs: [],
    });
  });

  it('realigns when the exact displayed option is explicitly marked correct', () => {
    const repaired = repairScionMcItem({
      q: 'Which cooling scenario usually creates fine-grained igneous rock?',
      op: [
        'Slow cooling deep within the crust.',
        'Rapid cooling at or near the surface.',
        'Slow cooling at the surface.',
        'Rapid cooling deep within the crust.',
      ],
      ai: 3,
      ex: 'Rapid cooling at or near the surface. (Correct) This produces crystals too small to grow large.',
    });
    expect(repaired.item.ai).toBe(1);
    expect(repaired.repairs[0].preferenceEvidence.supportMethod).toBe('explicit-explanation-cue');
  });

  it('does not repair from an explicit cue that already supports the declared key', () => {
    const item = {
      q: 'Which layer lies below the crust and above the core?',
      op: ['Mantle', 'Crust', 'Inner core', 'Outer core'],
      ai: 0,
      ex: 'The correct choice is Mantle because it lies between the crust and the core.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it('does not treat a later misconception as affirmative answer support', () => {
    const item = {
      q: 'Which boundary creates new lithosphere as plates move apart?',
      op: ['Convergent boundary', 'Transform boundary', 'Divergent boundary', 'Subduction zone'],
      ai: 2,
      ex: 'Divergent boundary is the correct choice because the plates separate. Misconception: Transform boundary is correct whenever plates move.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });

  it('refuses to guess when the affirmative explanation marks two options correct', () => {
    const item = {
      q: 'Which structure should the program use for a two-way branch?',
      op: ['if-else', 'for loop', 'while loop', 'function'],
      ai: 3,
      ex: 'Option A is correct. The correct choice is B.',
    };
    expect(repairScionMcItem(item)).toEqual({ item, repairs: [] });
  });
});
