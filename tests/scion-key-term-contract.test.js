import { describe, expect, it } from 'vitest';

import { assessScionKeyTermContract } from '../src/lib/scionKeyTermContract.js';

const OPTIONS = {
  lessonTitle: 'Market power and welfare',
  definitionMin: 40,
  sourceTerm: 'Market power and welfare',
  semanticProfile: 'source-strict-v6',
};

describe('Scion key-term relational contrast', () => {
  it.each([
    {
      name: 'inverse quantity and price directions',
      term: {
        tr: 'deadweight loss',
        df: 'Deadweight loss is created when a monopoly produces less and charges more than a competitive market.',
        eg: 'A monopoly comparison records lower production, a higher charge, and lost surplus.',
        mi: 'Deadweight loss occurs when a monopoly produces more and charges less than a competitive market.',
        cx: 'The relevant comparison runs oppositely: monopoly quantity is lower and its charge is higher.',
      },
      facts: [
        'Because it produces less and charges more than a competitive market, a monopoly creates deadweight loss.',
      ],
      absent: 'misconception-repeats-definition',
    },
    {
      name: 'reversed interaction roles',
      term: {
        tr: 'like charges',
        df: 'Like charges are charges whose stated electric interaction is repulsion.',
        eg: 'Like charges repel, while unlike charges attract.',
        mi: 'Like charges attract while unlike charges repel.',
        cx: 'Repulsion belongs to like charges, and attraction belongs to unlike charges.',
      },
      facts: ['Like charges repel and unlike charges attract.'],
      absent: 'misconception-repeats-example',
    },
    {
      name: 'reversed containment roles',
      term: {
        tr: 'feedback loop',
        df: 'A feedback loop is a regulatory structure that includes a sensor, a control center, and an effector.',
        eg: 'A sensor, control center, and effector appear together in a regulatory loop.',
        mi: 'An effector is a feedback loop that includes a sensor and a control center.',
        cx: 'The effector is one member alongside the sensor and control center within the feedback loop.',
      },
      facts: ['A feedback loop includes a sensor, a control center, and an effector.'],
      absent: 'misconception-repeats-definition',
    },
    {
      name: 'different scale-degree assignments',
      term: {
        tr: 'tonic',
        df: 'The tonic is a chord function distinguished by being built on scale degree one.',
        eg: 'In a progression, the scale-degree-one chord receives the tonic label.',
        mi: 'A chord built on scale degree four has tonic function.',
        cx: 'Degree four supports a pre-dominant classification, while degree one supports tonic.',
      },
      facts: [
        'The tonic is built on scale degree one, while pre-dominants are built on degrees two, three, four, and six.',
      ],
      absent: 'misconception-repeats-definition',
    },
    {
      name: 'reversed indicator roles',
      term: {
        tr: 'field-line density',
        df: 'Field-line density is the field-line property that indicates relative field strength.',
        eg: 'Comparing density at two points provides a comparison of relative field strength.',
        mi: 'Relative field strength indicates field-line density.',
        cx: 'The relation runs from field-line density to comparative strength, not in reverse.',
      },
      facts: ['Field-line density indicates relative field strength.'],
      absent: 'misconception-repeats-definition',
    },
    {
      name: 'a correction that restores swapped set-point roles',
      term: {
        tr: 'set point',
        df: 'A set point is a physiological value associated with fluctuations of the normal range.',
        eg: 'A negative-feedback loop detects a deviation from a set point.',
        mi: 'A set point is the normal range that fluctuates around a physiological value.',
        cx: 'The normal range does the fluctuating around the physiological value called the set point.',
      },
      facts: ['A set point is the physiological value around which the normal range fluctuates.'],
      absent: 'correction-repeats-misconception',
    },
  ])('preserves a valid misconception for $name', ({ term, facts, absent }) => {
    const assessment = assessScionKeyTermContract(term, { ...OPTIONS, knownFacts: facts });
    expect(assessment.issues).not.toContain(absent);
  });

  it('still rejects an example that merely restates its definition', () => {
    const assessment = assessScionKeyTermContract(
      {
        tr: 'DC circuit',
        df: 'A DC circuit is a conducting path distinguished by steady current, sources, components, and conservation rules.',
        eg: 'A conducting path with steady current, sources, and components is a DC circuit.',
        mi: 'A DC circuit has component voltages and currents that oppose conservation rules.',
        cx: 'Its component voltages and currents obey conservation rules along the conducting path.',
      },
      {
        ...OPTIONS,
        knownFacts: [
          'A DC circuit is a conducting path with steady current, sources, and components whose voltages and currents obey conservation rules.',
        ],
      },
    );
    expect(assessment.issues).toContain('example-repeats-definition');
  });
});
