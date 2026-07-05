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

describe('twin-depth cell finder (R3)', () => {
  it('flags cells whose explanations are near-twins and spares distinct ones', async () => {
    const { findTwinCells } = await import('../tendril/twinDepth.mjs');
    const mk = (id, kernelId, familyKey, explanation) => ({ id, kernelId, familyKey, explanation });
    const bank = {
      items: [
        mk('a', 'k1', 'students think twins', 'twin explanation one'),
        mk('b', 'k1', 'students think twins', 'twin explanation two'),
        mk('c', 'k2', 'students think distinct', 'about apples entirely'),
        mk('d', 'k2', 'students think distinct', 'about oranges instead'),
      ],
    };
    const vectors = {
      'twin explanation one': unit([1, 0, 0]),
      'twin explanation two': unit([1, 0.05, 0]), // cosine ≈ 0.999
      'about apples entirely': unit([0, 1, 0]),
      'about oranges instead': unit([0, 0, 1]), // cosine 0
    };
    const embedder = makeEmbedder({ embedFn: async (texts) => texts.map((t) => vectors[t]) });
    const { twins } = await findTwinCells(bank, { embedder });
    expect(twins.map((t) => t.kernelId)).toEqual(['k1']);
    expect(twins[0].maxPair).toBeGreaterThanOrEqual(0.92);
  });
});

describe('zero-API mode (v0.1.4)', () => {
  it('assembleExamsFromBank draws windowed, deduped, rotated bank items', async () => {
    const { assembleExamsFromBank } = await import('../composer/zeroApi.mjs');
    const graph = {
      course: { weeks: 2 },
      lessons: [
        { id: 'l1', week: 1, introduces: ['c1'], reinforces: [] },
        { id: 'l2', week: 2, introduces: ['c2'], reinforces: [] },
      ],
      concepts: [
        { id: 'c1', genomeRef: 'k1' },
        { id: 'c2', genomeRef: 'k2' },
      ],
      assessments: [{ id: 'a9', kindOf: 'exam', registryKey: 'Final Exam', anchor: { lessonId: 'l2' } }],
    };
    const mk = (id, kernelId, stem) => ({
      id, kernelId, stem,
      options: ['w1', 'right', 'w2', 'w3'], correctIndex: 1,
      explanation: 'because reasons', bloom: 'apply', difficulty: 'apply',
      catches: true, confronts: true,
    });
    const bank = { items: [mk('i1', 'k1', 'stem about vectors and spans'), mk('i2', 'k2', 'stem about matrices instead')] };
    const exams = assembleExamsFromBank(graph, bank, { perExam: 12 });
    expect(exams.a9).toHaveLength(2);
    expect(exams.a9[0].options[exams.a9[0].correctIndex]).toBe('right'); // rotation preserves the key
    expect(exams.a9.map((i) => i.conceptId).sort()).toEqual(['c1', 'c2']);
  });

  it('zeroEntailment withholds every checkable citation (JUDGED class)', async () => {
    const { zeroEntailment } = await import('../composer/zeroApi.mjs');
    const graph = {
      lessons: [{ id: 'l1' }],
      concepts: [{ id: 'c1', kernelFacts: ['a fact about vectors'] }],
    };
    const authored = {
      l1: {
        quizItems: [{ explanation: 'text' }],
        claims: [{ path: 'quizItems[0].explanation', ref: 'kernel:c1' }],
      },
    };
    const out = zeroEntailment(graph, authored);
    expect(out).toEqual({ checked: 1, downgraded: 1 });
    expect(authored.l1.claims[0].ref).toBeNull();
  });

  it('zeroCourseWide assembles syllabus surfaces from graph facts only', async () => {
    const { zeroCourseWide } = await import('../composer/zeroApi.mjs');
    const cw = zeroCourseWide({
      course: { title: 'Linear Algebra', level: 'intermediate', subject: 'math', weeks: 14 },
      outcomes: [{ text: 'solve systems' }],
      assessments: [{ registryKey: 'Final Exam' }],
      sources: [{ title: 'Lay', author: 'D. Lay' }],
      lessons: [],
    });
    expect(cw.courseDescription).toContain('Linear Algebra');
    expect(cw.courseDescription).toContain('solve systems');
    expect(cw.materials[0]).toContain('Lay');
    expect(cw.logisticsFaq.length).toBeGreaterThanOrEqual(3);
  });
});

describe('researcher-zero ($0 shaper)', () => {
  it('zeroShapeKernel extracts anchored facts with an injected embedder', async () => {
    const { zeroShapeKernel } = await import('../researcher/zeroShape.mjs');
    const sources = [
      {
        title: 'T', url: 'https://x/T', license: 'CC-BY-SA-4.0', attribution: 'test',
        text: 'Widgets are devices that convert motion into light through a coupling process. The coupling efficiency depends on the ambient temperature of the room. For example, a cold widget produces dim light in winter conditions. Contrary to popular belief, widgets do not store energy between uses at all.',
      },
    ];
    const embedder = makeEmbedder({ embedFn: async (texts) => texts.map((t, i) => unit([1, (t.length % 7) / 10, i % 2])) });
    const kernel = await zeroShapeKernel({ id: 'bench/widgets', term: 'widgets' }, sources, { embedder });
    expect(kernel.ok).toBe(true);
    for (const fact of kernel.facts) {
      expect(sources[0].text).toContain(fact.anchor.quote); // extractive: quote IS the source
    }
    expect(kernel.misconceptions.length).toBeGreaterThanOrEqual(1); // 'Contrary to popular belief' mined
    expect(kernel.exampleSentences.length).toBeGreaterThanOrEqual(1);
  });

  it('splitSentences keeps real sentences and drops fragments', async () => {
    const { splitSentences } = await import('../researcher/zeroShape.mjs');
    const out = splitSentences('Short. This is a genuinely long sentence that should absolutely survive the splitter filter. == Heading == Another proper sentence follows here with enough length to pass the gate.');
    expect(out.length).toBe(2);
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

describe('E2B item-array extraction (A1)', () => {
  it('recovers objects from E2B doubled-brace defect and ```json fences', async () => {
    const { parseItemArray } = await import('../researcher/shape.mjs');
    // E2B habitually emits an extra closing brace after each object; a whole-
    // array JSON.parse throws on this, so per-object balanced slicing is used.
    const raw = [
      '```json',
      '[',
      '  { "stem": "a?", "options": ["w","x","y","z"], "correctIndex": 2, "explanation": "e.", "bloom":"apply","difficulty":"apply"',
      '    }',
      '  },',
      '  { "stem": "b?", "options": ["w","x","y","z"], "correctIndex": 1, "explanation": "e.", "bloom":"apply","difficulty":"apply"',
      '    }',
      '  }',
      ']',
      '```',
    ].join('\n');
    const items = parseItemArray(raw);
    expect(items.map((i) => i.stem)).toEqual(['a?', 'b?']);
  });

  it('returns [] on non-JSON and parses clean arrays; a brace inside a string is not a delimiter', async () => {
    const { parseItemArray } = await import('../researcher/shape.mjs');
    expect(parseItemArray('the model refused to answer')).toEqual([]);
    expect(parseItemArray('[{"a":1},{"a":2}]')).toHaveLength(2);
    expect(parseItemArray('[{"stem":"use a } brace","options":["a"]}]')[0].stem).toBe('use a } brace');
  });

  it('zeroShapeItems refuses to author when misconceptions are too thin (no model call)', async () => {
    const { zeroShapeItems } = await import('../researcher/zeroShape.mjs');
    const res = await zeroShapeItems(
      { id: 'x/y', term: 'thing' },
      { definition: 'A thing.', facts: [{ text: 'It exists.' }], misconceptions: [{ text: 'only one', corrective: 'c' }] },
    );
    expect(res.accepted).toEqual([]);
    expect(res.rejections['thin-misconceptions']).toBe(1);
    expect(res.solverUsed).toBe(false);
  });
});
