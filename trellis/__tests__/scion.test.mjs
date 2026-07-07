// Scion-in-Composer-ZERO — the graft's gate stack, seat routing, and
// disclosure counters. Every test is token-free: the house model is
// replaced by injected functions, and corpus logging is mocked so test
// pairs never enter the training stream.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../tendril/corpus.mjs', () => ({ corpusLog: vi.fn(async () => {}) }));

import { guideRewriteRejection, scionFillItems, scionSeats, scionSkinSystem, scionPolishGuide } from '../composer/scion.mjs';
import { resolveRoute } from '../tendril/sModel.mjs';
import { skinLesson } from '../composer/compose.mjs';

describe('scionSeats', () => {
  it('parses the comma flag, trims, lowercases, and is empty when unset', () => {
    expect([...scionSeats('skin,polish,fill')]).toEqual(['skin', 'polish', 'fill']);
    expect([...scionSeats(' Skin , FILL ')]).toEqual(['skin', 'fill']);
    expect(scionSeats(undefined).size).toBe(0);
    expect(scionSeats('').size).toBe(0);
  });
});

describe('route resolution', () => {
  it('scion is an alias of the g4 items route — one shared server process', () => {
    expect(resolveRoute('scion')).toBe('items');
    expect(resolveRoute('items')).toBe('items');
    expect(resolveRoute('skin')).toBe('skin');
    expect(resolveRoute('unknown-task')).toBe('skin');
  });
});

describe('guideRewriteRejection', () => {
  const original = '## Week 2 Guide\n\n- **term**: a definition that says something concrete about the topic at hand.\n- another line of study guidance for the week.\n';
  it('accepts an in-band rewrite that keeps structure', () => {
    const rewrite = original.replace('says something concrete', 'states something specific');
    expect(guideRewriteRejection(original, rewrite)).toBeNull();
  });
  it('rejects empty and out-of-band lengths', () => {
    expect(guideRewriteRejection(original, '')).toBe('empty');
    expect(guideRewriteRejection(original, 'Too short.')).toBe('length-band');
    expect(guideRewriteRejection(original, original + original + original)).toBe('length-band');
  });
  it('rejects heading and fence structure changes', () => {
    expect(guideRewriteRejection(original, original.replace('## Week 2 Guide', 'Week 2 Guide'))).toBe(
      'heading-structure',
    );
    const fenced = original + '```python\nx = 1\n```\n';
    expect(guideRewriteRejection(fenced, fenced.replace(/```/g, ''))).toBe('fence-structure');
  });
});

describe('scionPolishGuide', () => {
  const guide =
    '## Week 3 Study Guide\n\n- **interval**: the distance between two pitches, counted in steps of the scale.\n- Review the worked example from class and re-derive each labeled interval yourself.\n';
  it('accepts a gate-passing rewrite and mutates the composed lesson', async () => {
    const composed = { studyGuideSection: guide };
    const sGen = vi.fn(async () => guide.replace('Review the worked example', 'Revisit the worked example'));
    const out = await scionPolishGuide(composed, { sGen });
    expect(out).toMatchObject({ attempted: 1, accepted: 1 });
    expect(composed.studyGuideSection).toContain('Revisit the worked example');
    expect(sGen.mock.calls[0][0].task).toBe('scion');
  });
  it('keeps the source form when the rewrite fails a gate', async () => {
    const composed = { studyGuideSection: guide };
    const out = await scionPolishGuide(composed, { sGen: async () => 'Tiny.' });
    expect(out).toMatchObject({ attempted: 1, accepted: 0, reason: 'length-band' });
    expect(composed.studyGuideSection).toBe(guide);
  });
  it('keeps the source form when generation throws, and skips non-guides', async () => {
    const composed = { studyGuideSection: guide };
    const out = await scionPolishGuide(composed, {
      sGen: async () => {
        throw new Error('server down');
      },
    });
    expect(out).toMatchObject({ attempted: 1, accepted: 0 });
    expect(composed.studyGuideSection).toBe(guide);
    expect(await scionPolishGuide({ studyGuideSection: null }, { sGen: vi.fn() })).toMatchObject({ attempted: 0 });
  });
});

describe('scionFillItems', () => {
  const graph = {
    concepts: [{ id: 'c1', name: 'Intervals', genomeRef: 'music/intervals', kernelFacts: ['A fact.'] }],
    misconceptions: [
      { conceptId: 'c1', statement: 'Interval quality depends only on letter distance between note names.', corrective: 'Quality depends on the exact semitone count, not letters alone.' },
      { conceptId: 'c1', statement: 'A fifth is always perfect regardless of accidentals in the key.', corrective: 'Accidentals change the semitone count and can make a fifth diminished.' },
    ],
  };
  const anchor = { conceptId: 'c1', conceptName: 'Intervals', kernelId: 'music/intervals' };
  const mkItem = (stem, correctIndex = 1) => ({
    stem,
    options: ['a wrong option', 'the right option', 'another wrong one', 'a fourth option'],
    correctIndex,
    explanation: 'Because the semitone count decides the quality of the interval in every case.',
  });

  it('ships only items the model blind-solves to its own key, and counts rejections', async () => {
    const author = async () => [mkItem('Which interval spans C to G sharp in this melody?'), mkItem('What quality is the fifth from B to F in the bass line?'), mkItem('How many semitones separate E and A flat here?')];
    const solve = vi
      .fn()
      .mockResolvedValueOnce(1) // agrees
      .mockResolvedValueOnce(3) // disagrees — dropped
      .mockResolvedValueOnce(null); // inconclusive — dropped (strict)
    const out = await scionFillItems(graph, anchor, { items: [] }, 6, { author, solve });
    expect(out.items).toHaveLength(1);
    expect(out.selfRejected).toBe(2);
    expect(out.attempted).toBe(3);
    expect(out.items[0].bloom).toBe('apply');
  });

  it('drops stem echoes of already-shipped items before spending a solve call', async () => {
    const shipped = 'Which interval spans C to G sharp in this melody?';
    const author = async () => [mkItem(shipped)];
    const solve = vi.fn(async () => 1);
    const out = await scionFillItems(graph, anchor, { items: [] }, 6, {
      author,
      solve,
      existingStems: [shipped],
    });
    expect(out.items).toHaveLength(0);
    expect(solve).not.toHaveBeenCalled();
  });

  it('caps at need and skips concepts with no misconceptions', async () => {
    const author = async () => [mkItem('Stem one about intervals and quality?'), mkItem('Stem two about semitone counting rules?')];
    const out = await scionFillItems(graph, anchor, { items: [] }, 1, { author, solve: async () => 1 });
    expect(out.items).toHaveLength(1);
    const bare = await scionFillItems({ ...graph, misconceptions: [] }, anchor, { items: [] }, 6, {
      author,
      solve: async () => 1,
    });
    expect(bare).toMatchObject({ items: [], skipped: 'no-misconceptions' });
  });
});

describe('persistExposure — the frozen-ruler regression', () => {
  // --freeze-exposure was born unconsumed (eec5635 threaded the flag but
  // never gated the store write) — this pins the fix forever.
  it('never writes the store on a measurement run', async () => {
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn(async () => {}) }));
    const { persistExposure } = await import('../pipeline.mjs');
    expect(await persistExposure({ assets: [] }, true)).toBe(false);
    const fs = await import('node:fs/promises');
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(await persistExposure({ assets: [] }, false)).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith('trellis/bank/assets.json', expect.any(String));
    vi.doUnmock('node:fs/promises');
  });
});

describe('skinLesson — the scion skin seat', () => {
  const graph = {
    course: { title: 'Music Theory Fundamentals', level: 'intro', subject: 'music' },
    lessons: [{ week: 1, title: 'Pitch and Notation' }],
  };
  const segment = () => ({
    minutes: 10,
    mode: 'teach',
    text: 'Orientation: pitch names the highness or lowness of a sound, and staff notation writes it down so any musician can reproduce it exactly.',
  });

  it('routes to the scion task with a context-bearing prompt, same gates', async () => {
    const composed = { plan: { segments: [segment()] } };
    const rewritten =
      'This week we start with pitch: it names the highness or lowness of a sound, and staff notation writes it down so any musician can reproduce it exactly.';
    const sGenerate = vi.fn(async () => rewritten);
    const out = await skinLesson(graph, 1, composed, { sGenerate, scionSkin: true });
    expect(out).toMatchObject({ skinned: 1, of: 1 });
    expect(composed.plan.segments[0].text).toBe(rewritten);
    const call = sGenerate.mock.calls[0][0];
    expect(call.task).toBe('scion');
    expect(call.system).toContain('Music Theory Fundamentals');
    expect(call.system).toContain('Week 1');
  });

  it('keeps the source form when the scion rewrite breaks a gate', async () => {
    const composed = { plan: { segments: [segment()] } };
    const original = composed.plan.segments[0].text;
    const sGenerate = vi.fn(async () => 'Too short to pass.');
    const out = await skinLesson(graph, 1, composed, { sGenerate, scionSkin: true });
    expect(out).toMatchObject({ skinned: 0, of: 1 });
    expect(composed.plan.segments[0].text).toBe(original);
  });

  it('scionSkinSystem carries the mode-example nudge for gated modes', () => {
    const system = scionSkinSystem(graph, graph.lessons[0]);
    expect(system).toContain('walks through an example');
    expect(system).toContain('±40%');
  });
});
