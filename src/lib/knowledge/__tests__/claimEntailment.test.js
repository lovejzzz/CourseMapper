import { describe, expect, it } from 'vitest';
import {
  attachKernelEntailmentReceipt,
  evaluateClaimEntailment,
  evaluateKernelEntailment,
} from '../claimEntailment.js';

describe('claim-to-passage entailment admission', () => {
  it('accepts an exact source claim and a conservative compression', () => {
    expect(
      evaluateClaimEntailment({
        claim: 'Biofilms are communities of microorganisms attached to a surface.',
        passage: 'Biofilms are communities of microorganisms attached to a surface.',
      }),
    ).toMatchObject({ entailed: true, score: 1, reason: 'verbatim-support' });
    expect(
      evaluateClaimEntailment({
        claim: 'Biofilm communities attach microorganisms to surfaces.',
        passage: 'Biofilm communities are groups of microorganisms that attach to living or nonliving surfaces.',
        minimumScore: 0.7,
      }).entailed,
    ).toBe(true);
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
    });
  });
});
