import { describe, expect, it } from 'vitest';
import {
  analyzeDecisionScenario,
  deriveDecisionScenario,
  isConcreteScenarioMaterials,
  resolveDecisionScenario,
} from '../scenarioContract.js';

const TERM = {
  term: 'Task flow',
  definition: 'The ordered sequence of actions a user takes to complete a goal.',
  example: 'A checkout flow asks users to re-enter an address after a payment error.',
  misconception: 'Task flows are useful only when every user follows one linear path.',
  correction: 'Task flows can represent branches, recovery paths, and alternate decisions.',
};

const KERNEL = {
  facts: [
    'Recovery paths determine whether users can complete a task after an error.',
    'Branch points make alternative user decisions visible in a task flow.',
  ],
  keyTerms: [TERM],
};

describe('evidence-to-decision scenario contract', () => {
  it('accepts evidence split correctly between setup and materials', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A checkout team must decide whether to preserve a short flow or add a recovery step after repeated payment errors. The two approaches create a speed-versus-recovery tradeoff.',
      materials: 'task-completion logs, payment-error records, and two checkout-flow prototypes',
    });
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual({
      context: true,
      decision: true,
      evidencePacket: true,
      tension: true,
      materials: true,
    });
  });

  it.each([
    ['missing', null, 'scenario-missing'],
    [
      'generic materials',
      {
        setup:
          'A checkout team must decide between two recovery patterns after users encounter repeated payment errors in the current flow.',
        materials: 'scenario evidence',
      },
      'scenario-materials-not-concrete',
    ],
    [
      'no decision or actionable problem',
      {
        setup:
          'A checkout team reviews a payment screen and documents the sequence of fields presented to customers during a normal transaction.',
        materials: 'screen recording, task-flow diagram, and field inventory',
      },
      'scenario-missing-decision',
    ],
    [
      'decision without evidence packet',
      {
        setup:
          'A checkout team must decide which of two interface approaches should be selected for the next design iteration and implementation cycle.',
        materials: 'the interface prototype',
      },
      'scenario-missing-evidence-packet',
    ],
  ])('explains the %s failure', (_label, scenario, issue) => {
    expect(analyzeDecisionScenario(scenario).issues).toContain(issue);
  });

  it('does not mistake generic labels for inspectable materials', () => {
    expect(isConcreteScenarioMaterials('the scenario evidence')).toBe(false);
    expect(isConcreteScenarioMaterials('interview transcript, task logs, and checkout prototype')).toBe(true);
  });

  it.each([
    'The specific notation, recording, data, records, design, or passage students inspect.',
    'REPLACE with two named, inspectable source details students compare.',
    'Inspectable source detail one is the online form, and source detail two is the desk visit.',
  ])('rejects copied scenario scaffolding instead of counting its nouns as evidence: %s', (materials) => {
    const result = analyzeDecisionScenario({
      setup:
        'A checkout team must decide whether to preserve a short flow or add a recovery step after repeated payment errors. The choice trades speed against successful recovery.',
      materials,
    });

    expect(result.ready).toBe(false);
    expect(result.templateResidue).toBe(true);
    expect(result.issues).toContain('scenario-template-residue');
  });

  it('does not reject authored materials that use similar subject vocabulary', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A research team must decide which checkout revision should proceed after users misread the payment recovery step. The choice trades a shorter flow against clearer recovery.',
      materials: 'the screen recording, error records, and revised checkout design students inspect',
    });

    expect(result.ready).toBe(true);
    expect(result.templateResidue).toBe(false);
  });

  it('derives a grounded zero-call fallback only from admitted kernel atoms', () => {
    const scenario = deriveDecisionScenario(KERNEL);
    expect(scenario.source).toBe('derived-kernel-fallback');
    expect(scenario.setup).toContain(TERM.example);
    expect(scenario.setup).toContain(TERM.misconception);
    expect(scenario.setup).toContain(KERNEL.facts[0]);
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('preserves an authored scenario and uses fallback for a weak or missing one', () => {
    const authored = {
      setup:
        'A checkout team must choose between a shorter form and a recoverable form after testing exposes repeated payment errors. The choice trades speed against successful recovery.',
      materials: 'task logs, error records, and two form prototypes',
    };
    expect(resolveDecisionScenario({ ...KERNEL, scenario: authored })).toEqual({ ...authored, source: 'authored' });
    expect(resolveDecisionScenario(KERNEL).source).toBe('derived-kernel-fallback');
  });
});
