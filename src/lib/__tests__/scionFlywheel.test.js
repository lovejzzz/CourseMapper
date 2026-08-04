import { describe, expect, it } from 'vitest';

import { assessScionFlywheelEvent } from '../scionFlywheel';
import {
  SCION_PREFERENCE_GATE_VERSION,
  deriveDeterministicContractEvidence,
} from '../scionPreferenceGate';

function goodItem(overrides = {}) {
  return {
    q: 'Which evidence most directly supports revising the prototype navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant says the colors look pleasant',
      'The designer prefers the original navigation',
      'A stakeholder requests a larger project logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    ...overrides,
  };
}

describe('Scion flywheel admission', () => {
  it('rejects producer-side same-model verification even when the boolean flags are true', () => {
    const assessment = assessScionFlywheelEvent({
      kind: 'mc-item',
      prompt: 'Repair the item.',
      chosen: goodItem(),
      rejected: goodItem({ op: ['Same', 'Same', 'Other', 'Another'] }),
      trainingEligible: true,
      preferenceEvidence: {
        kind: 'admission-and-key-repair',
        verified: true,
        chosenAnswers: [0, 0],
      },
    });
    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContain('semantic-evidence-requires-offline-source-bound-admission');
  });

  it('admits a compiler-derived non-semantic margin only when the validator receipt matches the pair', () => {
    const chosen = goodItem();
    const rejected = goodItem({ op: ['Same answer', 'Same answer', 'Other answer', 'Another answer'] });
    const preferenceEvidence = deriveDeterministicContractEvidence({ kind: 'mc-item', chosen, rejected });
    expect(preferenceEvidence).toMatchObject({
      kind: 'deterministic-contract-margin',
      validatorVersion: SCION_PREFERENCE_GATE_VERSION,
    });
    expect(
      assessScionFlywheelEvent({
        kind: 'mc-item',
        prompt: 'Repair the item.',
        chosen,
        rejected,
        trainingEligible: true,
        preferenceEvidence,
      }).eligible,
    ).toBe(true);
  });

  it('rejects incomplete rows before semantic admission', () => {
    expect(assessScionFlywheelEvent({ trainingEligible: true, preferenceEvidence: { verified: true } })).toEqual({
      eligible: false,
      issues: ['incomplete-preference-row', 'unsupported-pair-kind'],
    });
  });
});
