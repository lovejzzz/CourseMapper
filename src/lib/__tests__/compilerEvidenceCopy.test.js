import { describe, expect, it } from 'vitest';
import { sourceBoundStudyWorkedExample } from '../sourceBoundStudyWorkedExample';

describe('sourceBoundStudyWorkedExample', () => {
  const evidenceBrief = {
    enrichmentSource: 'lesson-content-enrichment',
    claims: [
      'The first source limits its finding to the observed setting.',
      'The second source reports a related pattern under a different condition.',
    ],
    sources: [{ title: 'Source A' }, { title: 'Source B' }],
  };

  it('turns two admitted claims into a bounded, traceable reasoning rehearsal', () => {
    const result = sourceBoundStudyWorkedExample({
      sourceEvidenceBrief: evidenceBrief,
      primaryConcept: 'language variation',
      studyArtifact: 'variation evidence memo',
    });

    expect(result).toMatchObject({
      protocol: 'coursemapper-source-claim-comparison-study-practice-v1',
      verification: {
        checked: true,
        claimCount: 2,
        sourceCount: 2,
        evidenceSource: 'lesson-content-enrichment',
      },
      steps: expect.arrayContaining([expect.stringMatching(/reinforcing, qualifying, or conflicting/i)]),
    });
    expect(result.steps[0]).toContain('For language variation');
    expect(result.steps[3]).toContain('For variation evidence memo');
    expect(result.problem).toContain(evidenceBrief.claims[0]);
    expect(result.problem).toContain(evidenceBrief.claims[1]);
    expect(result.problem).toContain('Source A and Source B');
    expect(result.result).toContain('language variation');
    expect(result.boundary).toMatch(/do not establish causation, universal scope, or transfer/i);
    expect(result.transferTask).toContain('variation evidence memo');
  });

  it('does not manufacture a worked example from only one admitted claim', () => {
    expect(
      sourceBoundStudyWorkedExample({
        sourceEvidenceBrief: { ...evidenceBrief, claims: evidenceBrief.claims.slice(0, 1) },
        primaryConcept: 'language variation',
        studyArtifact: 'variation evidence memo',
      }),
    ).toBeNull();
  });
});
