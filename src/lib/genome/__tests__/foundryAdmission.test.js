import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { admitBatch, admitKernel, quoteFoundInSource } from '../foundryAdmission.js';
import { TRUST_TIERS } from '../kernelSchema.js';

const SOURCE = {
  'openstax:test#1':
    'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price. Demand is elastic when the absolute value exceeds one.',
};

const GOOD = {
  id: 'econ/elasticity-test',
  term: 'Price elasticity of demand',
  level: 'intro',
  definition: {
    text: 'Price elasticity of demand is the percentage change in quantity demanded divided by the percentage change in price.',
    anchor: {
      src: 'openstax:test#1',
      loc: '1.1',
      quote: 'the percentage change in quantity demanded divided by the percentage change in price',
    },
    tier: 2,
  },
  facts: [
    {
      text: 'Demand is elastic when the absolute value exceeds one.',
      anchor: { src: 'openstax:test#1', loc: '1.1', quote: 'Demand is elastic when the absolute value exceeds one' },
      tier: 2,
    },
  ],
  mcBank: [
    {
      stem: 'A good whose quantity responds proportionally more than price is described as',
      options: ['elastic', 'inelastic', 'unit elastic', 'perfectly inelastic'],
      answerIndex: 0,
    },
  ],
};

describe('quoteFoundInSource (mechanical anchor check)', () => {
  it('matches verbatim quotes ignoring whitespace and smart quotes', () => {
    expect(quoteFoundInSource('percentage change in quantity demanded', SOURCE['openstax:test#1'])).toBe(true);
    expect(quoteFoundInSource('the   percentage  change in quantity demanded', SOURCE['openstax:test#1'])).toBe(true);
  });

  it('rejects quotes not present in the source and quotes too short to verify', () => {
    expect(quoteFoundInSource('demand always falls to zero', SOURCE['openstax:test#1'])).toBe(false);
    expect(quoteFoundInSource('short', SOURCE['openstax:test#1'])).toBe(false);
  });
});

describe('admitKernel', () => {
  it('admits a fully anchored, well-formed kernel at T2', () => {
    const result = admitKernel(GOOD, { sources: SOURCE });
    expect(result.admitted).toBe(true);
    expect(result.kernel.id).toBe('econ/elasticity-test');
    expect(result.tier).toBe(TRUST_TIERS.SOURCE_ANCHORED);
    expect(result.rejections).toEqual([]);
  });

  it('rejects a kernel whose definition claims an anchor that is not in the source', () => {
    const faked = {
      ...GOOD,
      definition: {
        ...GOOD.definition,
        quote: undefined,
        anchor: { ...GOOD.definition.anchor, quote: 'invented claim not present anywhere' },
      },
    };
    const result = admitKernel(faked, { sources: SOURCE, requireAnchors: true });
    expect(result.admitted).toBe(false);
    expect(result.rejections.some((r) => r.startsWith('anchor-failed'))).toBe(true);
  });

  it('demotes (not rejects) a failed anchor in lenient consensus mode', () => {
    const facts = [
      {
        text: 'A true statement with no source backing it in this run.',
        anchor: { src: 'openstax:test#1', loc: '1.1', quote: 'a statement that does not appear' },
        tier: 2,
      },
    ];
    const result = admitKernel({ ...GOOD, facts }, { sources: SOURCE, requireAnchors: false });
    expect(result.admitted).toBe(true);
    // the unverifiable fact's anchor was stripped (demoted), definition stayed T2
    expect(result.kernel.facts.every((fact) => !fact.anchor || fact.tier <= TRUST_TIERS.SOURCE_ANCHORED)).toBe(true);
  });

  it('drops MC items that carry a test-wiseness cue', () => {
    const cued = {
      ...GOOD,
      mcBank: [
        {
          stem: 'The elasticity measure that compares percentage change in quantity to percentage change in price is the elasticity that compares',
          options: [
            'the percentage change in quantity demanded to the percentage change in price using elasticity',
            'slope',
            'cost',
            'revenue',
          ],
          answerIndex: 0,
        },
      ],
    };
    const result = admitKernel(cued, { sources: SOURCE });
    // kernel still admits on its definition+facts, but the cued MC is dropped
    expect(result.admitted).toBe(true);
    expect(result.kernel.mcBank).toHaveLength(0);
    expect(result.rejections.some((r) => r.startsWith('mc['))).toBe(true);
  });
});

describe('genesis shard build output', () => {
  it('admits every curated genesis kernel through the real gate', () => {
    const genesis = JSON.parse(readFileSync(join(process.cwd(), 'scripts/foundry/sources/genesis.json'), 'utf8'));
    const { admitted, report } = admitBatch(genesis.kernels, {
      sources: genesis.sourceSnapshots,
      requireAnchors: true,
    });
    expect(admitted.length).toBe(genesis.kernels.length);
    const rejected = report.filter((entry) => !entry.admitted);
    expect(rejected).toEqual([]);
    // Every admitted genesis kernel is source-anchored.
    expect(admitted.every((kernel) => kernel.definition.anchor)).toBe(true);
  });

  it('ships a manifest and shards consistent with the sources', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/genome/manifest.json'), 'utf8'));
    expect(manifest.shards.length).toBeGreaterThanOrEqual(3);
    expect(manifest.conceptCount).toBeGreaterThanOrEqual(6);
    for (const shard of manifest.shards) {
      const body = JSON.parse(readFileSync(join(process.cwd(), 'public/genome', shard.path), 'utf8'));
      expect(body.kernels.length).toBe(shard.conceptCount);
    }
  });
});
