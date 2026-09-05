import { describe, expect, it } from 'vitest';

import {
  createStatisticalArtifactDetailsForOperation,
  createStatisticalInstructionalIntentForOperation,
} from '../statisticalOperationArtifactDetails.js';

const distributionIntent = createStatisticalInstructionalIntentForOperation({
  operationEvidenceDemandForLesson: () => ({
    operation: 'summarize-and-interpret-distribution',
  }),
});

describe('statistical instructional intent variants', () => {
  it('gives visual and numerical distribution lessons distinct observable intents', () => {
    const visual = distributionIntent({
      title: 'Lesson 1: Picturing Distributions with Graphs',
      sections: [{ topicSection: 'Data visualization mechanics' }],
    });
    const numerical = distributionIntent({
      title: 'Lesson 2: Describing Distributions with Numbers',
      sections: [{ topicSection: 'Descriptive statistics calculations' }],
    });

    expect(visual.operation).toBe('summarize-and-interpret-distribution');
    expect(numerical.operation).toBe('summarize-and-interpret-distribution');
    expect(visual.objective).not.toBe(numerical.objective);
    expect(visual.objective).toMatch(/visible pattern.*calculate.*center and spread/i);
    expect(numerical.objective).toMatch(/calculate and compare.*center and spread/i);
  });

  it('selects one atomic learner product instead of exposing an internal artifact menu', () => {
    const detailsFor = createStatisticalArtifactDetailsForOperation({
      operationEvidenceDemandForLesson: () => ({ operation: 'summarize-and-interpret-distribution' }),
    });
    const details = detailsFor({ title: 'Describing distributions' });

    expect(details.primaryOutputFormat).toBe('distribution summary');
    expect(details.outputFormat).toContain('or comparison memo');
  });

  it('retains the general operation contract when no submode is declared', () => {
    const general = distributionIntent({ title: 'Lesson 3: Distribution Reasoning' });

    expect(general.objective).toMatch(/^Summarize and interpret a supplied distribution/i);
  });
});
