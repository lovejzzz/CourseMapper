import { describe, expect, it } from 'vitest';
import {
  attachKernelEntailmentReceipt,
  evaluateClaimEntailment,
  evaluateKernelEntailment,
  isStandaloneSourceClaim,
} from '../claimEntailment.js';

describe('claim-to-passage entailment admission', () => {
  it('rejects byte-exact source fragments that retain an unresolved antecedent', () => {
    expect(
      isStandaloneSourceClaim(
        'Combining one secondary color and a primary color in the same manner produces a tertiary color.',
      ),
    ).toBe(false);
    expect(
      isStandaloneSourceClaim(
        'A tertiary color is produced by mixing full saturation of one primary color with half saturation of another primary color.',
      ),
    ).toBe(true);
    expect(isStandaloneSourceClaim('This allows a larger sample to be compared.')).toBe(false);
    expect(isStandaloneSourceClaim('The example above is the simplest kind of contingency table.')).toBe(false);
    expect(isStandaloneSourceClaim('These results distinguish the two methods.')).toBe(false);
    expect(
      isStandaloneSourceClaim(
        'The most common of these is the Pearson correlation coefficient, which measures linear association.',
      ),
    ).toBe(false);
    expect(
      isStandaloneSourceClaim(
        'In addition, Narrative visualization uses visual elements to communicate data through a structured story.',
      ),
    ).toBe(false);
    expect(
      isStandaloneSourceClaim('A contingency table displays joint frequencies for two categorical variables.'),
    ).toBe(true);
  });

  it('accepts an exact source claim and a conservative compression', () => {
    expect(
      evaluateClaimEntailment({
        claim: 'Biofilms are communities of microorganisms attached to a surface.',
        passage: 'Biofilms are communities of microorganisms attached to a surface.',
      }),
    ).toMatchObject({
      entailed: true,
      semanticSupport: false,
      score: 1,
      reason: 'verbatim-support',
      construct: 'lexical-extraction-integrity',
    });
    expect(
      evaluateClaimEntailment({
        claim: 'Biofilm communities attach microorganisms to surfaces.',
        passage: 'Biofilm communities are groups of microorganisms that attach to living or nonliving surfaces.',
        minimumScore: 0.7,
      }).entailed,
    ).toBe(true);
  });

  it('does not misrepresent lexical overlap as semantic support', () => {
    const roleSwap = evaluateClaimEntailment({
      claim: 'The student evaluates the teacher during the observation.',
      passage: 'The teacher evaluates the student during the observation.',
    });
    expect(roleSwap).toMatchObject({
      entailed: true,
      semanticSupport: false,
      reason: 'lexical-support',
      construct: 'lexical-extraction-integrity',
    });
  });

  it('rejects polarity changes and unsupported numbers', () => {
    expect(
      evaluateClaimEntailment({
        claim: 'The process does not require oxygen.',
        passage: 'The process requires oxygen for cellular respiration.',
      }).reason,
    ).toBe('negation-mismatch');
    expect(
      evaluateClaimEntailment({
        claim: 'The trial included 240 participants.',
        passage: 'The trial included 24 participants.',
      }).reason,
    ).toBe('number-mismatch');
  });

  it('rejects a kernel whose quote is absent from the captured snapshot', () => {
    const sourceId = 'doaj:example';
    const quote = 'The study reports that biofilm removal improved after the intervention.';
    const kernel = {
      definition: { text: quote, anchor: { src: sourceId, loc: 'Abstract', quote } },
      facts: [],
      provenance: { origin: 'algi-research' },
    };
    expect(evaluateKernelEntailment(kernel, { [sourceId]: 'A different captured passage.' }).status).toBe('rejected');
    expect(attachKernelEntailmentReceipt(kernel, { [sourceId]: quote }).kernel.provenance.entailment).toMatchObject({
      status: 'passed',
      checkedClaims: 1,
      minimumScore: 1,
      semanticSupport: false,
      readinessEligible: false,
    });
  });
});
