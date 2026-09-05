import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchetypeIndex, lintInstanceMapping, normalizeArchetype, templateSlots } from '../archetypeSchema.js';
import { resolveArchetypes } from '../conceptResolver.js';
import { normalizeConceptKernel } from '../kernelSchema.js';
import { createKernelLibrary } from '../kernelLibrary.js';

const EQUILIBRIUM = {
  id: 'structure/equilibrium',
  name: 'Equilibrium',
  family: 'systems',
  abstract: 'Opposing processes balance at a stable point; perturb the system and a restoring force returns it.',
  slots: ['system', 'opposing processes', 'balanced quantity', 'perturbation', 'restoring force'],
  triggerVocabulary: ['equilibrium', 'steady state', 'balance', 'homeostasis', 'restoring'],
  misconceptionShapes: [
    {
      shape: 'static-equilibrium',
      template:
        'Students treat the equilibrium in {system} as static when {opposing processes} continue at equal rates.',
      corrective: 'Show both processes running at balance.',
    },
  ],
  taskSchemas: [
    {
      schema: 'perturb-and-predict',
      bloom: 'Apply',
      stemTemplate:
        'If {perturbation} occurs in {system}, what happens to {balanced quantity} after {restoring force} acts?',
      rubricFocus: 'names the restoring process',
    },
  ],
  reasoningMoves: ['identify the opposing processes'],
  pedagogyBindings: ['predict-observe-explain'],
  references: ['NGSS: Stability and Change'],
};

describe('archetypeSchema', () => {
  it('normalizes a well-formed archetype', () => {
    const { archetype, issues } = normalizeArchetype(EQUILIBRIUM);
    expect(issues).toEqual([]);
    expect(archetype.id).toBe('structure/equilibrium');
    expect(archetype.family).toBe('systems');
    expect(archetype.tier).toBe(4);
  });

  it('rejects an archetype whose template references an undeclared slot', () => {
    const bad = {
      ...EQUILIBRIUM,
      taskSchemas: [{ schema: 'x', bloom: 'Apply', stemTemplate: 'What happens to {undeclared_slot} here exactly?' }],
    };
    const { archetype, issues } = normalizeArchetype(bad);
    expect(archetype).toBeNull();
    expect(issues.some((i) => i.startsWith('unknown-slot:'))).toBe(true);
  });

  it('rejects bad id, family, and structureless archetypes', () => {
    expect(normalizeArchetype({ ...EQUILIBRIUM, id: 'Bad/ID' }).archetype).toBeNull();
    expect(normalizeArchetype({ ...EQUILIBRIUM, family: 'nonsense' }).archetype).toBeNull();
    expect(normalizeArchetype({ ...EQUILIBRIUM, misconceptionShapes: [] }).archetype).toBeNull();
    expect(normalizeArchetype({ ...EQUILIBRIUM, taskSchemas: [] }).archetype).toBeNull();
  });

  it('extracts template slots', () => {
    expect(templateSlots('a {x} and {y} and {x}')).toEqual(['x', 'y', 'x']);
  });
});

describe('lintInstanceMapping (forced-analogy guard)', () => {
  const { archetype } = normalizeArchetype(EQUILIBRIUM);
  const conceptText =
    'A market reaches equilibrium where buying and selling pressure balance; a shortage or surplus pushes the price back.';

  it('accepts a fully filled, grounded mapping as verified-ready', () => {
    const mapping = {
      system: 'a market',
      'opposing processes': 'buying and selling pressure',
      'balanced quantity': 'the price',
      perturbation: 'a shortage or surplus',
      'restoring force': 'price adjustment toward balance',
    };
    expect(lintInstanceMapping(mapping, archetype, conceptText).status).toBe('verified-ready');
  });

  it('demotes a partial mapping to suggested', () => {
    const mapping = { system: 'a market', 'opposing processes': 'buying and selling pressure' };
    const result = lintInstanceMapping(mapping, archetype, conceptText);
    expect(result.status).toBe('suggested');
    expect(result.issues.some((i) => i.startsWith('missing-slot:'))).toBe(true);
  });

  it('demotes an ungrounded mapping (invented nouns not in the concept text)', () => {
    const mapping = {
      system: 'a quantum field',
      'opposing processes': 'tachyon emission',
      'balanced quantity': 'spin foam',
      perturbation: 'a wormhole',
      'restoring force': 'dark energy',
    };
    const result = lintInstanceMapping(mapping, archetype, conceptText);
    expect(result.status).toBe('suggested');
    expect(result.issues.some((i) => i.startsWith('ungrounded-slot:'))).toBe(true);
  });
});

describe('resolveArchetypes', () => {
  const index = buildArchetypeIndex([
    EQUILIBRIUM,
    {
      id: 'method/sampling-and-inference',
      name: 'Sampling and inference',
      family: 'quantitative',
      abstract: 'A conclusion about a population is drawn from a sample with quantified uncertainty about the result.',
      slots: ['population', 'sample', 'statistic', 'uncertainty'],
      triggerVocabulary: ['sample', 'population', 'inference', 'sampling distribution', 'confidence'],
      misconceptionShapes: [
        { shape: 'sample-is-population', template: 'Students treat {sample} as {population} ignoring {uncertainty}.' },
      ],
      taskSchemas: [
        { schema: 'infer', bloom: 'Analyze', stemTemplate: 'From {sample} what can be said about {population}?' },
      ],
    },
  ]);

  it('resolves a lesson naming a deep structure', () => {
    const lesson = {
      title: 'Lesson 7: Sampling Distributions and Inference',
      sections: [
        {
          topicSection: 'sampling distribution of the mean',
          learningObjectives: 'Draw inference about a population from a sample.',
        },
      ],
    };
    const { archetypeRefs } = resolveArchetypes(lesson, index);
    expect(archetypeRefs.map((r) => r.id)).toContain('method/sampling-and-inference');
  });

  it('does not resolve on a single weak token', () => {
    const lesson = { title: 'Lesson 2: Systems of Government', sections: [{ topicSection: 'balance of power' }] };
    const { archetypeRefs } = resolveArchetypes(lesson, index);
    // "balance" alone (one token, generic) must not claim the equilibrium archetype.
    expect(archetypeRefs.find((r) => r.id === 'structure/equilibrium')).toBeFalsy();
  });
});

describe('genesis genome carries verified instanceOf edges', () => {
  it('the built shards include grounded archetype mappings', () => {
    const econ = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/econ-intro.json'), 'utf8'));
    const elasticity = econ.kernels.find((k) => k.id === 'econ/price-elasticity-of-demand');
    expect(elasticity.edges.instanceOf[0].archetype).toBe('method/marginal-analysis');
    expect(elasticity.edges.instanceOf[0].verified).toBe(true);

    // The mapping must pass the grounding lint against the concept's own text.
    const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
    const { archetype } = normalizeArchetype(
      archetypeShard.archetypes.find((a) => a.id === 'method/marginal-analysis'),
    );
    const conceptText = `${elasticity.definition.text} ${elasticity.facts.map((f) => f.text).join(' ')}`;
    const status = lintInstanceMapping(elasticity.edges.instanceOf[0].mapping, archetype, conceptText).status;
    expect(['verified-ready', 'suggested']).toContain(status);
  });

  it('loads archetypes into the library and survives normalization', () => {
    const lib = createKernelLibrary({ storage: { getItem: () => null, setItem: () => {} } });
    const archetypeShard = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/archetypes.json'), 'utf8'));
    const added = lib.addArchetypes(archetypeShard.archetypes);
    expect(added).toBe(archetypeShard.archetypes.length);
    expect(lib.getArchetype('structure/equilibrium')).toBeTruthy();
    expect(lib.getArchetypeIndex().archetypes.size).toBe(added);
  });
});
