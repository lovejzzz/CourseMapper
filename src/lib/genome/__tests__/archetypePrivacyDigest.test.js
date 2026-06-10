import { describe, expect, it } from 'vitest';
import { stripForContribution } from '../contributionStrip.js';
import { buildRunDigest, formatRunDigest } from '../../runDigest.js';
import { applyApiCallBudgetEvent, createApiCallBudget } from '../../apiCallBudget.js';

describe('Layer 2 privacy: structural connections never leave the browser', () => {
  it('contributionStrip drops structuralConnections and any cross-lesson reference', () => {
    // A genome-linked payload shaped like what the linker produces, including a
    // structural bridge that references another lesson by number.
    const payload = {
      keyTerms: [
        {
          term: 'p-value',
          definition: 'A p-value is the probability of data at least as extreme assuming the null is true.',
          example: 'p = 0.03 means such data occur 3% of the time under the null.',
          misconception: 'Students read the p-value as the probability the null is true.',
        },
      ],
      facts: [{ text: 'A small p-value indicates the observed data would be unlikely under the null.' }],
      structuralConnections: [
        'p-value shares the deep structure of Sampling distribution (Sampling and inference, Lesson 1).',
      ],
    };
    const { kernel } = stripForContribution(payload, { courseName: 'My Stats Course', discipline: 'stats' });
    const serialized = JSON.stringify(kernel);
    // Generic knowledge survives; the cross-lesson structural reference does not.
    expect(serialized).toContain('p-value');
    expect(serialized).not.toContain('structuralConnections');
    expect(serialized).not.toContain('Lesson 1');
    expect(serialized).not.toContain('shares the deep structure');
  });
});

describe('Layer 2 visibility: the run digest surfaces genome + bridge activity', () => {
  it('shows the genome linker line including concept and bridge counts', () => {
    let budget = createApiCallBudget({ runId: 'run-arch' });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'genomeLink',
      label: 'CurriculumOS linker',
      detail: '2 genome + 0 cached of 8 lessons (3 concepts, 5 citations, 1 bridges)',
    });
    budget = applyApiCallBudgetEvent(budget, {
      type: 'apiUsage',
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      task: 'course-map',
      usage: { inputTokens: 1200, outputTokens: 8000, estimated: false },
      costUsd: 0.04,
    });
    const digest = buildRunDigest({ budget });
    expect(digest.pipeline.genomeLinker).toContain('bridges');
    const text = formatRunDigest(digest);
    expect(text).toContain('genome linker');
    expect(text).toContain('bridges');
  });
});
