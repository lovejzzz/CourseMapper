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

  it('counts explicit measurements as an inspectable evidence packet', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A student is labeling two written intervals from a harmony worksheet before class starts. The student must decide which label fits each written interval.',
      materials:
        'the interval marked three scale steps with four semitones, the interval marked three scale steps with three semitones',
    });

    expect(result.ready).toBe(true);
    expect(result.checks).toMatchObject({ evidencePacket: true, materials: true });
    expect(result.evidenceKinds).toContain('data');
  });

  it('recognizes two named notations as an inspectable evidence packet', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A progression displays two chord notations: the first is built on scale degree one, and the second is built on scale degree four. Decide which notation has tonic function and which has pre-dominant function, with each label constrained by its displayed scale degree.',
      materials:
        'Inspect the scale-degree-one chord notation and the scale-degree-four chord notation; compare both displayed scale degrees with the selected tonic and pre-dominant labels.',
    });

    expect(result.ready).toBe(true);
    expect(result.checks).toMatchObject({ evidencePacket: true, materials: true });
    expect(result.evidenceKinds).toContain('design');
    expect(result.materialSegmentCount).toBeGreaterThanOrEqual(2);
  });

  it('recognizes naming a supported classification under a time constraint as a decision', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A student compares three annotated passages with altered upper scale degrees. The instructor wants the variant named before rehearsal starts.',
      materials: 'the marked scale degrees, written pitch labels, and the annotated cadence passage',
    });

    expect(result.ready).toBe(true);
    expect(result.checks.decision).toBe(true);
  });

  it('accepts a decision and constraint in concrete materials when setup carries the context', () => {
    const result = analyzeDecisionScenario({
      setup:
        'A composer revises two short minor passages for engraving. One passage marks a raised seventh and the other marks a raised sixth and seventh.',
      materials:
        'the marked pitch in Passage A, the two marked pitches in Passage B, and the labeling note that asks for a variant name before engraving proceeds',
    });

    expect(result.ready).toBe(true);
    expect(result.checks).toMatchObject({ decision: true, tension: true, evidencePacket: true });
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

  it('removes classroom narrator language from learner-facing misconception scenarios', () => {
    const scenario = deriveDecisionScenario({
      facts: ['Earth is closest to the Sun in January, during Northern Hemisphere winter.'],
      keyTerms: [
        {
          term: 'Seasons and axial tilt',
          definition: 'Axial tilt changes sun angle and day length.',
          example: 'Australia has summer in December and winter in June, opposite to the Northern Hemisphere.',
          misconception: "Students think seasons are caused mainly by Earth's changing distance from the Sun.",
          correction: 'Seasons come from changing sun angle and day length.',
        },
      ],
    });

    expect(scenario.setup).toMatch(/Seasons are caused mainly by Earth's changing distance/i);
    expect(scenario.setup).not.toMatch(/\bStudents think\b/i);
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('does not repeat the term example as the related source claim', () => {
    const repeated =
      'The graphical depiction of quantum circuit elements uses a variant of the Penrose graphical notation.';
    const independent =
      'A quantum circuit is an ordered sequence of quantum gates, measurements, and initialization steps.';
    const scenario = deriveDecisionScenario({
      facts: [repeated, independent],
      keyTerms: [
        {
          term: 'Quantum circuit',
          definition: 'A quantum circuit is a computational routine made from coherent quantum operations.',
          example: repeated,
          misconception: 'Quantum circuits and classical circuits are interchangeable descriptions.',
          correction: 'Quantum circuits use quantum operations and measurement rather than classical Boolean signals.',
        },
      ],
    });

    expect((scenario.setup.match(/graphical depiction of quantum circuit elements/gi) || []).length).toBe(1);
    expect(scenario.setup).toContain(independent);
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('does not repeat a source fact already contained inside the case example', () => {
    const fact = 'People can better understand the form and how to complete it.';
    const scenario = deriveDecisionScenario({
      facts: [fact],
      keyTerms: [
        {
          term: 'Accessible forms',
          definition: 'Accessible forms provide labels, instructions, validation, and clear feedback.',
          example: `${fact} Clear layout, instructions, and feedback also make recovery easier.`,
          misconception: 'Any related interface can be labeled an accessible form without checking its behavior.',
          correction: 'The form must provide the source-backed access features.',
        },
      ],
    });

    expect((scenario.setup.match(/better understand the form and how to complete it/gi) || []).length).toBe(1);
    expect(scenario.setup).not.toContain('The record also states');
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('uses peer contrasts once in the quiz and turns the scenario into a claim-boundary case', () => {
    const misconception = 'Biofilm and microbial mat are interchangeable descriptions of the same concept.';
    const scenario = deriveDecisionScenario({
      facts: [
        'A microbial mat records community structure across layers that receive different oxygen conditions.',
        'A biofilm matrix changes transport and exposure for attached microbial cells.',
      ],
      keyTerms: [
        {
          term: 'Biofilm',
          definition: 'A biofilm is a community of microorganisms whose cells adhere to a surface.',
          example: 'A stream sample contains an attached microbial layer on a submerged stone.',
          misconception,
          correction: 'Biofilm and microbial mat have related but distinct source definitions.',
        },
      ],
    });

    expect(scenario.setup).not.toContain(misconception);
    expect(scenario.setup).toMatch(/bounded|documented scope|supplied evidence/i);
    expect(scenario.materials).toMatch(/Biofilm|source record|supporting records|recorded evidence/i);
    expect(scenario.materials).not.toBe(
      'the source record, two competing interpretations, and the documented evidence boundary',
    );
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('uses a data evidence packet instead of passage or claim-card boilerplate for data-story kernels', () => {
    const scenario = deriveDecisionScenario({
      facts: [
        'The public-transit dataset records scheduled and observed arrival times.',
        'The cleaning log documents how missing arrival values were handled.',
        'The uncertainty note limits the claim to the observed service window.',
      ],
      keyTerms: [
        {
          term: 'Handling missing values',
          definition: 'A documented cleaning decision preserves the evidence boundary of a data story.',
          example: 'A data journalist compares a chart before and after excluding records with missing arrival times.',
          misconception: 'Removing every missing record always produces the most honest chart.',
          correction: 'The source ledger and cleaning log must justify how missing records affect the claim.',
          source: 'fact-ledger-projection',
        },
      ],
    });

    expect(scenario.setup).toMatch(/Claim A:|Claim B:/);
    expect(scenario.materials).toMatch(/data records|transformation log|claim under review/i);
    expect(scenario.materials).not.toMatch(/claim cards|cited passage/i);
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('treats relational algebra as database evidence instead of a math answer-check frame', () => {
    const scenario = deriveDecisionScenario({
      facts: [
        'Relational algebra selection filters tuples based on specified conditions within a relation.',
        'Projection chooses named attributes from the result relation.',
        'A query plan records the operations used to retrieve database rows.',
      ],
      keyTerms: [
        {
          term: 'Relational Algebra Operations',
          definition:
            'Relational algebra operations include selection, projection, union, set difference, and Cartesian product.',
          example: 'A database query selects active accounts and projects only the account identifier.',
          misconception: 'Every SQL query has only one valid relational algebra expression.',
          correction: 'Equivalent expressions can produce the same result while using different execution plans.',
          source: 'fact-ledger-projection',
        },
      ],
    });

    expect(scenario.materials).toMatch(/database claims|schema or query artifact|constraint evidence/i);
    expect(scenario.materials).not.toMatch(/recorded quantities|answer check/i);
    expect(analyzeDecisionScenario(scenario).ready).toBe(true);
  });

  it('uses interview, context, and consent evidence for oral-history scenarios', () => {
    const scenario = deriveDecisionScenario({
      facts: [
        'The interview recording preserves the narrator’s words and vocal delivery.',
        'The transcript makes the interview searchable while retaining links to the recording.',
        'The consent record documents the agreed access and reuse boundary.',
      ],
      keyTerms: [
        {
          term: 'Oral-history transcription',
          definition: 'Oral-history transcription creates a written record linked to a recorded interview.',
          example: 'A local-history team checks a transcript against the recording before depositing both files.',
          misconception: 'A transcript can replace the recording and narrator-context record in every use.',
          correction: 'Interpretation should retain the recording, context, and consent boundary.',
        },
      ],
    });

    expect(scenario.materials).toMatch(/interview or transcript record|narrator context|consent status/i);
    expect(scenario.materials).not.toMatch(/map|timeline|recorded quantities|answer check/i);
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

  it('binds compact generic evidence packets to the lesson concept instead of repeating one package-wide phrase', () => {
    const makeKernel = (term) => ({
      facts: [
        `${term} claim one is supported by the first supplied record.`,
        `${term} claim two is supported by the second supplied record.`,
        `The ${term} evidence boundary limits both claims.`,
      ],
      keyTerms: [
        {
          term,
          source: 'fact-ledger-projection',
          definition: `${term} is interpreted from bounded source evidence.`,
          example: `A learner compares two records about ${term}.`,
          misconception: `Every ${term} claim is equally supported.`,
          correction: `Check each ${term} claim against its record.`,
        },
      ],
    });

    const composition = deriveDecisionScenario(makeKernel('composition'));
    const attribution = deriveDecisionScenario(makeKernel('source attribution'));
    expect(composition.materials).toContain('composition');
    expect(attribution.materials).toContain('source attribution');
    expect(composition.materials).not.toBe(attribution.materials);
    expect(composition.materials).not.toContain('the source records behind Claim A and Claim B and');
  });
});
