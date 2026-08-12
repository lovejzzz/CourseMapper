import { describe, expect, it } from 'vitest';

import {
  collapseMechanicalContentWordEchoes,
  findLearnerFacingCompilerLeak,
  findMechanicalContentWordEcho,
} from '../mechanicalTextSeams.js';

describe('mechanical text seams', () => {
  it('detects high-signal compiler leaks that must never reach a learner', () => {
    for (const [text, code] of [
      ['Defend your the visual focus interpretation.', 'determiner-collision'],
      ['What missing the evidence focus context would delay publication?', 'missing-context-fragment'],
      ['Review CM-SRC-L05 before class.', 'internal-source-id'],
      ['Inspect the CourseMapper-native specimen.', 'internal-brand-provenance'],
      ['Finish the calculation. Or comparison memo.', 'artifact-menu-fragment'],
    ]) {
      expect(findLearnerFacingCompilerLeak(text)).toMatchObject({ code });
    }
    expect(findLearnerFacingCompilerLeak('Compare the evidence, then revise the memo.')).toBeNull();
  });

  it('admits only a complete paired functional-visual evidence locator surface', () => {
    const complete = [
      'VISUAL EVIDENCE LAB',
      'ANALYZE · inspect the specimen.',
      'PRODUCT · carry evidence into CM-PROD-L05.',
      'RIGHTS · Original course-created vector under CC0.',
      'VISUAL PROVENANCE · ORIGINAL NATIVE · NO EXTERNAL IMAGE ASSET',
      'VERIFY CM-SRC-L05 · APPLY TO CM-PROD-L05',
    ].join(' ');
    expect(findLearnerFacingCompilerLeak(complete)).toBeNull();
    expect(findLearnerFacingCompilerLeak(complete.replace('CM-PROD-L05', 'CM-PROD-L04'))).toMatchObject({
      code: 'internal-source-id',
    });
    expect(findLearnerFacingCompilerLeak(complete.replace('RIGHTS · ', ''))).toMatchObject({
      code: 'internal-source-id',
    });
  });
  it('preserves legitimate comparative intensification in an exact source claim', () => {
    const claim = 'Samples are taken in stages using smaller and smaller sampling units at each stage.';
    expect(findMechanicalContentWordEcho(claim)).toBeNull();
    expect(collapseMechanicalContentWordEchoes(claim)).toBe(claim);
  });

  it('still collapses a generated content-word echo', () => {
    expect(collapseMechanicalContentWordEchoes('Review allusion and allusion in the passage.')).toBe(
      'Review allusion in the passage.',
    );
  });
});
