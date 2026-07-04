// Tendril regression tests (docs/TENDRIL.md) — mock embeddings only:
// the CI trap for provider calls applies to model weights too, so no
// test here may download or load the real model.

import { describe, expect, it } from 'vitest';
import { assetEmbedText, cosine, makeEmbedder, textHash } from '../tendril/embedder.mjs';
import { diagnose, diagnoseAgainstItem, DIAGNOSIS_PROFILES, exemplarsFromBank } from '../tendril/diagnose.mjs';
import { selectAsset } from '../composer/assets.mjs';
import { selectBankItems } from '../knowledge/itemBank.mjs';
import { gateOutput } from '../tendril/distill/gateBench.mjs';

const unit = (values) => {
  const norm = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(values.map((x) => x / norm));
};

describe('embedder core', () => {
  it('cosine of normalized vectors is the dot product', () => {
    expect(cosine(unit([1, 0]), unit([1, 0]))).toBeCloseTo(1);
    expect(cosine(unit([1, 0]), unit([0, 1]))).toBeCloseTo(0);
  });

  it('makeEmbedder batches through the injected embedFn', async () => {
    const calls = [];
    const emb = makeEmbedder({
      embedFn: async (texts) => {
        calls.push(texts.length);
        return texts.map(() => unit([1, 2, 3]));
      },
      batchSize: 2,
    });
    const out = await emb.embed(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    expect(calls).toEqual([2, 1]);
  });

  it('textHash is stable and content-sensitive', () => {
    expect(textHash('abc')).toBe(textHash('abc'));
    expect(textHash('abc')).not.toBe(textHash('abd'));
  });

  it('assetEmbedText covers items and prose moves', () => {
    expect(
      assetEmbedText({ move: 'item', body: { stem: 'S?', options: ['a', 'b'], correctIndex: 0, explanation: 'E.' } }),
    ).toBe('S?\na\nb\nE.');
    expect(assetEmbedText({ move: 'teach-segment', body: { text: 'T.' } })).toBe('T.');
  });
});

describe('typed-answer diagnosis', () => {
  it('exemplarsFromBank scopes families to kernels and dedupes texts', () => {
    const bank = {
      items: [
        {
          id: 'i1',
          kernelId: 'cs/x',
          familyKey: 'students think fam-a things',
          options: ['wrong one', 'right', 'wrong one'],
          correctIndex: 1,
        },
      ],
    };
    const byKernel = exemplarsFromBank(bank);
    const texts = byKernel.get('cs/x').map((e) => e.text);
    expect(texts).toContain('students think fam-a things');
    expect(texts.filter((t) => t === 'wrong one')).toHaveLength(1);
  });

  it('contrastive diagnose fires only past the null score + margin', async () => {
    const index = {
      byKernel: new Map([['k', [{ family: 'fam', text: 'wrong belief', vector: unit([1, 0]) }]]]),
      embedder: null,
    };
    const near = await diagnose(index, 'k', 'q', {
      queryVector: unit([1, 0.2]),
      nullVectors: [unit([0, 1])],
      margin: 0.05,
    });
    expect(near.family).toBe('fam');
    const nullWins = await diagnose(index, 'k', 'q', {
      queryVector: unit([1, 0.2]),
      nullVectors: [unit([1, 0.2])],
      margin: 0.05,
    });
    expect(nullWins.family).toBeNull();
  });

  it('diagnoseAgainstItem implements the measured standard profile', () => {
    const vectors = new Map([
      ['right answer', unit([0, 1])],
      ['tempting wrong', unit([1, 0])],
    ]);
    const item = { options: ['tempting wrong', 'right answer'], correctIndex: 1, familyKey: 'fam' };
    const wrongish = diagnoseAgainstItem(item, unit([1, 0.1]), (t) => vectors.get(t), DIAGNOSIS_PROFILES.standard);
    expect(wrongish.family).toBe('fam');
    const rightish = diagnoseAgainstItem(item, unit([0.1, 1]), (t) => vectors.get(t), DIAGNOSIS_PROFILES.standard);
    expect(rightish.family).toBeNull();
  });
});

describe('selection hooks', () => {
  const store = {
    assets: [
      { id: 'a1', kernelId: 'k', move: 'teach-segment', evidence: { fromGrade: 99 }, exposure: { uses: 5 } },
      { id: 'a2', kernelId: 'k', move: 'teach-segment', evidence: { fromGrade: 98 }, exposure: { uses: 0 } },
    ],
  };

  it('selectAsset excludeIf removes semantic siblings from the pool', () => {
    const chosen = selectAsset(store, 'k', 'teach-segment', { excludeIf: (a) => a.id === 'a2' });
    expect(chosen.id).toBe('a1');
  });

  it('selectAsset rank overrides the exposure draw only when provided', () => {
    const byExposure = selectAsset(store, 'k', 'teach-segment', {});
    expect(byExposure.id).toBe('a2'); // lowest uses
    const byRank = selectAsset(store, 'k', 'teach-segment', { rank: (a) => (a.id === 'a1' ? 1 : 0) });
    expect(byRank.id).toBe('a1');
  });

  it('selectBankItems excludeItem skips echoing items and takes the next', () => {
    const slice = { lesson: { introduces: ['c1'] }, concepts: [{ id: 'c1', genomeRef: 'k' }] };
    const mk = (id, stem) => ({
      id,
      kernelId: 'k',
      stem,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
      explanation: `${id} explains`,
      bloom: 'apply',
      difficulty: 'apply',
      catches: true,
      confronts: true,
      familyKey: null,
      provenance: { grade: 99 },
    });
    const bank = { items: [mk('i1', 'first stem about loops'), mk('i2', 'second stem about types entirely')] };
    const picked = selectBankItems(slice, bank, { maxBanked: 1, excludeItem: (i) => i.id === 'i1' });
    expect(picked).toHaveLength(1);
    expect(picked[0].__bank.id).toBe('i2');
  });
});

describe('T-M3 gate bench gates', () => {
  const base = { task: 'skin', mode: 'teach', source: 'A long enough source segment that ends with a period and says plenty of things about the topic at hand.' };

  it('accepts a genuine rewrite', () => {
    expect(
      gateOutput({ ...base, output: 'A long enough REWRITTEN segment that ends with a period and says plenty of fresh things about the topic here.' }),
    ).toBeNull();
  });

  it('rejects identity no-ops, length violations, fences, and unterminated text', () => {
    expect(gateOutput({ ...base, output: base.source })).toBe('identity-noop');
    expect(gateOutput({ ...base, output: 'Too short.' })).toBe('length-band');
    expect(gateOutput({ ...base, output: `${base.source.slice(0, -1)} plus \`\`\`code\`\`\`.` })).toBe('code-fence');
    expect(gateOutput({ ...base, output: base.source.replace(/\.$/, '').replace('source', 'altered') })).toBe(
      'terminal-punct',
    );
  });

  it('demands example language for worked-example modes', () => {
    const src = 'Worked example: we trace the loop and walk through each iteration of the sum as the demo requires today.';
    const noExample = 'This text is long enough and terminal but mentions nothing of the required lexical markers at all, sadly.';
    expect(gateOutput({ task: 'skin', mode: 'worked-example', source: src, output: noExample })).toBe('mode-example');
  });
});
