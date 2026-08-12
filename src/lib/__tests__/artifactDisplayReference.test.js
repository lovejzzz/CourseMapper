import { describe, expect, it } from 'vitest';
import { compactLongArtifactMentionsInValue, compactLongArtifactTitle } from '../artifactDisplayReference.js';

describe('artifact display references', () => {
  it('compacts a long operation title to its stable product noun in teaching prose', () => {
    const title =
      'The Normal Distribution: z-score calculation trace, standardized-observation interpretation, normal-model check, or comparison note';
    const replacement = compactLongArtifactTitle(title);

    expect(replacement).toBe('comparison note');
    expect(
      compactLongArtifactMentionsInValue(
        { description: `Connect the evidence to ${title}.`, registryId: title },
        title,
        replacement,
      ),
    ).toEqual({
      description: 'Connect the evidence to comparison note.',
      registryId: title,
    });
  });

  it('repairs a format-profile echo introduced only by long-title compaction', () => {
    const title =
      'Week 7 data sampling-frame audit probability-sample trace selection-probability note or coverage-repair memo';
    const replacement = compactLongArtifactTitle(title);
    const value = {
      expectedFormat: `Format profile for ${title}: ${title}`,
    };

    expect(compactLongArtifactMentionsInValue(value, title, replacement)).toEqual({
      expectedFormat: `Format profile for ${replacement}: evidence, decision logic, limitation, and revision trace`,
    });
  });

  it('repairs an echo that emerges across two independent compaction passes', () => {
    const first = 'Week 7 population evidence collection sampling record and defensible coverage-repair memo';
    const second = 'Week 7 response evidence collection sampling record and defensible coverage-repair memo';
    const intermediate = compactLongArtifactMentionsInValue(
      { expectedFormat: `Format profile for ${first}: ${second}` },
      first,
      'Week 7 memo',
    );

    expect(compactLongArtifactMentionsInValue(intermediate, second, 'Week 7 memo')).toEqual({
      expectedFormat: 'Format profile for Week 7 memo: evidence, decision logic, limitation, and revision trace',
    });
  });

  it('uses the bounded final product phrase when a long title has no registered artifact-kind word', () => {
    expect(
      compactLongArtifactTitle(
        'Scatterplots & Correlation: scatterplot annotation, correlation calculation trace, association interpretation, or sensitivity comparison',
      ),
    ).toBe('sensitivity comparison');
  });
});
