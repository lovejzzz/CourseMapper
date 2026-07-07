// E2 round-3 hard-negative mining (TENDRIL roadmap v0.1.2 §S1 next round).
// Run the DEPLOYED item-local geometry over the TRAINING corpus with the
// current candidate model and mine its mistakes:
//   - a RIGHT answer that fires (false-fire in training space) yields
//     {anchor: rightText, positive: correctOption, negative: attractor}
//     — pull the answer toward correct, push it off the wrong text that
//     attracted it;
//   - a WRONG answer that fails to fire (miss) yields
//     {anchor: wrongText, positive: itsFamilyStatement, negative: correct}.
// Training texts only — the frozen eval files are never touched.
//
//   TENDRIL_MODEL=tendril-e2b node trellis/tendril/distill/mineHardNegatives.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { cosine, makeEmbedder } from '../embedder.mjs';

const OUT = 'trellis/tendril/distill/hard-triplets.jsonl';

async function loadCorpus() {
  const entries = [];
  for (const path of [
    'trellis/tendril/distill/stance-training.json',
    'trellis/tendril/distill/stance-training-2.json',
  ]) {
    if (!existsSync(path)) continue;
    const data = JSON.parse(await readFile(path, 'utf8'));
    entries.push(...(data.generated ?? []));
  }
  return entries;
}

const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
const cellItem = new Map();
for (const item of bank.items) {
  if (!item.familyKey) continue;
  const key = `${item.kernelId}::${item.familyKey}`;
  if (!cellItem.has(key)) cellItem.set(key, item);
}

const entries = await loadCorpus();
const emb = makeEmbedder();
const texts = new Set();
const contexts = [];
for (const entry of entries) {
  const item = cellItem.get(`${entry.kernelId}::${entry.family}`);
  if (!item) continue;
  const correct = item.options[item.correctIndex];
  const distractors = item.options.filter((_, i) => i !== item.correctIndex);
  contexts.push({ entry, correct, distractors });
  [entry.family, correct, ...distractors, ...(entry.wrong ?? []), ...(entry.right ?? [])].forEach((t) => {
    if (typeof t === 'string' && t.length >= 2) texts.add(t);
  });
}
const list = [...texts];
const vectors = await emb.embed(list);
const vecOf = new Map(list.map((t, i) => [t, vectors[i]]));
const cos = (a, b) => (vecOf.has(a) && vecOf.has(b) ? cosine(vecOf.get(a), vecOf.get(b)) : -1);

const triplets = [];
let falseFires = 0;
let misses = 0;
for (const { entry, correct, distractors } of contexts) {
  for (const r of entry.right ?? []) {
    if (typeof r !== 'string' || r.length < 8) continue;
    let attractor = null;
    let wrongTop = -1;
    for (const d of distractors) {
      const score = cos(r, d);
      if (score > wrongTop) {
        wrongTop = score;
        attractor = d;
      }
    }
    if (wrongTop >= 0.35 && wrongTop > cos(r, correct)) {
      falseFires += 1;
      triplets.push({ anchor: r, positive: correct, negative: attractor });
    }
  }
  for (const w of entry.wrong ?? []) {
    if (typeof w !== 'string' || w.length < 8) continue;
    const wrongTop = Math.max(...distractors.map((d) => cos(w, d)), -1);
    if (!(wrongTop >= 0.35 && wrongTop > cos(w, correct))) {
      misses += 1;
      triplets.push({ anchor: w, positive: entry.family, negative: correct });
    }
  }
}
await writeFile(OUT, triplets.map((t) => JSON.stringify(t)).join('\n'));
console.log(
  JSON.stringify(
    {
      model: process.env.TENDRIL_MODEL ?? 'default',
      contexts: contexts.length,
      falseFires,
      misses,
      hardTriplets: triplets.length,
    },
    null,
    2,
  ),
);
