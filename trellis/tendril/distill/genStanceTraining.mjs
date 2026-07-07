// S1 (TENDRIL_ROADMAP_V0.1.2) — student-register TRAINING corpus for the
// E2 round-2 stance fine-tune. Kernels are DISJOINT from the frozen eval:
// every kernelId in cache/paraphrase-eval.json (and the v2 short set) is
// excluded before generation, so no training text can shadow a ruler
// query. This is trainable exhaust, not a ruler — cached to avoid
// respend, regenerable without a version note.
//
//   STANCE_TRAIN=run npx vite-node trellis/tendril/distill/genStanceTraining.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { callModel } from '../../providers.mjs';
import { createRunLedger } from '../../telemetry.mjs';

// STANCE_ROUND=2 writes a second, persona-varied corpus file — round 3's
// "3x corpus" is additive files, never regeneration of an existing one.
const ROUND = Number(process.env.STANCE_ROUND ?? '1');
const OUT =
  ROUND === 1
    ? 'trellis/tendril/distill/stance-training.json'
    : `trellis/tendril/distill/stance-training-${ROUND}.json`;
const BATCH = 10;
const PERSONAS = {
  2: 'Vary the student voice across answers: one hasty and clipped, one verbose and hedging, one non-native-speaker phrasing with small grammar slips. ',
  3: 'Vary the student voice across answers: one overconfident and assertive, one uncertain with hedges like "i think maybe", one that mixes in a half-remembered related concept. ',
};
const PERSONA = PERSONAS[ROUND] ?? '';

async function evalKernelIds() {
  const ids = new Set();
  for (const path of [
    'trellis/tendril/cache/paraphrase-eval.json',
    'trellis/tendril/cache/correct-paraphrase-eval.json',
    'trellis/tendril/cache/correct-paraphrase-eval-v2-short.json',
  ]) {
    try {
      const data = JSON.parse(await readFile(path, 'utf8'));
      for (const entry of data.generated ?? []) ids.add(entry.kernelId);
    } catch {
      /* absent file = nothing to exclude */
    }
  }
  return ids;
}

export async function generateStanceTraining() {
  if (existsSync(OUT)) return JSON.parse(await readFile(OUT, 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const excluded = await evalKernelIds();
  const cells = new Map();
  for (const item of bank.items) {
    if (!item.familyKey || excluded.has(item.kernelId)) continue;
    const key = `${item.kernelId}::${item.familyKey}`;
    if (!cells.has(key)) {
      cells.set(key, {
        kernelId: item.kernelId,
        family: item.familyKey,
        sampleDistractor: item.options.filter((_, i) => i !== item.correctIndex).find((o) => o.length >= 12) ?? null,
        correct: item.options[item.correctIndex],
        explanation: item.explanation,
        stem: item.stem,
      });
    }
  }
  const targets = [...cells.values()];
  const ledger = createRunLedger({
    runId: `tendril-stance-training-r${ROUND}`,
    runDir: `trellis/runs/tendril-stance-training-r${ROUND}`,
  });
  const generated = [];
  const skipped = [];
  try {
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      try {
        const { result } = await callModel({
          tier: 'ds',
          stage: 'stance-training',
          ledger,
          system:
            'For each entry you receive a misconception family, a quiz stem, its correct answer, and explanation. Write exactly 3 short typed answers (8-25 words) a student HOLDING the wrong belief would type, and exactly 3 short typed answers a student who UNDERSTANDS would type (answer + correct reason). ' +
            PERSONA +
            'Casual student language, fresh words — never copy the given texts. Return JSON only.',
          user: JSON.stringify({
            instructions:
              'Return {"entries":[{"kernelId":"...","family":"<verbatim>","wrong":["...","...","..."],"right":["...","...","..."]}]} covering every entry.',
            entries: batch.map(({ kernelId, family, sampleDistractor, correct, explanation, stem }) => ({
              kernelId,
              family,
              stem,
              sampleWrongOption: sampleDistractor,
              correct,
              explanation,
            })),
          }),
          schema: {
            type: 'object',
            properties: {
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kernelId: { type: 'string' },
                    family: { type: 'string' },
                    wrong: { type: 'array', items: { type: 'string' } },
                    right: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['kernelId', 'family', 'wrong', 'right'],
                },
              },
            },
            required: ['entries'],
          },
          schemaName: 'stanceTraining',
          validate: (out) => (Array.isArray(out?.entries) && out.entries.length > 0 ? [] : ['entries required']),
        });
        generated.push(...result.entries);
      } catch {
        skipped.push(...batch.map((t) => `${t.kernelId}::${t.family.slice(0, 20)}`));
      }
    }
  } finally {
    await ledger.flush();
  }
  const corpus = {
    stamp: 'TRAINING corpus (student register) — eval-disjoint kernels; regenerable, NOT a ruler',
    excludedEvalKernels: excluded.size,
    skipped,
    generated,
  };
  await writeFile(OUT, JSON.stringify(corpus, null, 1));
  return corpus;
}

if (process.env.STANCE_TRAIN === 'run' && !process.env.VITEST) {
  const corpus = await generateStanceTraining();
  console.log(
    JSON.stringify(
      {
        entries: corpus.generated.length,
        excludedEvalKernels: corpus.excludedEvalKernels,
        skipped: corpus.skipped.length,
      },
      null,
      2,
    ),
  );
}
