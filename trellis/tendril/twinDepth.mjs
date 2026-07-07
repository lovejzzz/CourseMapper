// R3 — family twin-depth pass (TENDRIL_ROADMAP_V0.1.1).
// Cells (kernel × family) holding ≥2 items whose explanations are mutual
// near-twins (any pair ≥0.92) give the sibling-dedupe selector no
// distinct alternative: excluding the twin leaves the family unheard in
// that lesson, and the classroom loses a confrontation. This pass
// authors ONE deliberately different item per twin cell through the full
// gate stack: gapItemRejection (catch, confrontation, aesthetics, shelf
// dedupe) + a Tendril distinctness gate (embedding cosine <0.92 vs every
// existing explanation in the cell) + the cross-family solver gate.
//
//   npx vite-node trellis/tendril/twinDepth.mjs        (author + save)

import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { callModel } from '../providers.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { claimTokens, gapItemRejection, gapfillId } from '../knowledge/bankGapFill.mjs';
import { familyKeyOf } from '../knowledge/itemBank.mjs';
import { solveGate } from '../composer/solver.mjs';
import { cachedEmbed, cosine, makeEmbedder } from './embedder.mjs';

// Genome misconceptions by (kernelId, familyKey) — the corrective source.
// The confrontation gate is checked against the DOCUMENTED corrective; a
// twin cell whose family has no genome corrective is skipped, counted.
async function genomeFamilies({ genomeDir = 'public/genome' } = {}) {
  const map = new Map();
  for (const name of (await readdir(genomeDir)).filter((n) => n.endsWith('.json'))) {
    let shard;
    try {
      shard = JSON.parse(await readFile(join(genomeDir, name), 'utf8'));
    } catch {
      continue;
    }
    for (const kernel of shard.kernels ?? []) {
      for (const m of kernel.misconceptions ?? []) {
        const text = typeof m === 'string' ? m : (m.text ?? '');
        const corrective = typeof m === 'object' ? (m.corrective ?? m.correction ?? '') : '';
        if (!text || !corrective) continue;
        map.set(`${kernel.id}::${familyKeyOf(text)}`, { statement: text, corrective, term: kernel.term });
      }
    }
  }
  return map;
}

const TWIN_EPSILON = 0.92;
const BATCH = 8;

export async function findTwinCells(bank, { embedder = null } = {}) {
  const emb = embedder ?? makeEmbedder();
  const cells = new Map();
  for (const item of bank.items) {
    if (!item.familyKey || typeof item.explanation !== 'string' || item.explanation.length < 8) continue;
    const key = `${item.kernelId}||${item.familyKey}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(item);
  }
  const multi = [...cells.entries()].filter(([, items]) => items.length >= 2);
  const texts = [...new Set(multi.flatMap(([, items]) => items.map((i) => i.explanation)))];
  const vecs = await cachedEmbed(texts, { name: 'explanation-embeddings', embedder: emb });
  const vecOf = new Map(texts.map((t, i) => [t, vecs[i]]));
  const twins = [];
  for (const [key, items] of multi) {
    let maxPair = 0;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        maxPair = Math.max(maxPair, cosine(vecOf.get(items[i].explanation), vecOf.get(items[j].explanation)));
      }
    }
    if (maxPair >= TWIN_EPSILON) {
      const [kernelId, family] = key.split('||');
      twins.push({ kernelId, family, items, maxPair: Number(maxPair.toFixed(3)) });
    }
  }
  return { twins, vecOf, embedder: emb };
}

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'stem', 'options', 'correctIndex', 'explanation', 'bloom', 'difficulty'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          stem: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
          bloom: { type: 'string', enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] },
          difficulty: { type: 'string', enum: ['recall', 'apply', 'transfer'] },
        },
      },
    },
  },
};

export async function twinDepthPass({ budgetUsd = 0.5 } = {}) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const embedder = makeEmbedder();
  const { twins: allTwins } = await findTwinCells(bank, { embedder });
  const genome = await genomeFamilies();
  const twins = [];
  let noCorrective = 0;
  for (const cell of allTwins) {
    const g = genome.get(`${cell.kernelId}::${cell.family}`);
    if (g) twins.push({ ...cell, genome: g });
    else noCorrective += 1;
  }
  const ledger = createRunLedger({ runId: 'tendril-twin-depth', runDir: 'trellis/runs/tendril-twin-depth' });
  let authored = 0;
  const rejections = noCorrective > 0 ? { 'no-genome-corrective': noCorrective } : {};
  try {
    for (let i = 0; i < twins.length; i += BATCH) {
      const batch = twins.slice(i, i + BATCH);
      let result;
      try {
        ({ result } = await callModel({
          tier: 'ds',
          stage: 'twin-depth',
          ledger,
          budgetUsd,
          schema: ITEM_SCHEMA,
          schemaName: 'twin_depth_items',
          validate: (out) => (Array.isArray(out?.items) ? [] : ['items array required']),
          maxOutputTokens: 6000,
          // The gap-fill lesson verbatim: hand the model the gate's OWN
          // tokens — the first pass omitted them and 21/25 died no-catch/
          // no-confront.
          system:
            'You author ONE multiple-choice item per entry, confronting a documented wrong belief through a DIFFERENT scenario than the existing stems (given). Requirements: application-level stem ending with terminal punctuation; 4 distinct options under 15 words; one wrong option states the wrong belief WITH its wrong reasoning and MUST contain at least TWO of the mustIncludeTwoOf words verbatim (the lexical gate counts exactly those words); the explanation confronts the corrective and MUST contain at least HALF of the explanationMustIncludeHalfOf words verbatim, 2-4 sentences under 80 words, in FRESH wording (a similarity gate rejects explanations mirroring the existing ones); no code fences. Return {items:[{index,...}]}.',
          user: JSON.stringify(
            batch.map((cell, index) => ({
              index,
              kernelId: cell.kernelId,
              term: cell.genome.term,
              wrongBelief: cell.genome.statement,
              corrective: cell.genome.corrective,
              mustIncludeTwoOf: claimTokens(cell.genome.statement),
              explanationMustIncludeHalfOf: claimTokens(cell.genome.corrective),
              existingStems: cell.items.map((it) => it.stem).slice(0, 3),
              existingExplanations: cell.items.map((it) => it.explanation).slice(0, 2),
            })),
            null,
            1,
          ),
        }));
      } catch {
        rejections['batch-failed'] = (rejections['batch-failed'] ?? 0) + batch.length;
        continue;
      }
      for (const item of result.items ?? []) {
        const cell = batch[item.index];
        if (!cell) continue;
        const shelf = bank.items.filter((b) => b.kernelId === cell.kernelId);
        const gateCell = {
          kernelId: cell.kernelId,
          family: cell.family,
          statement: cell.genome.statement,
          corrective: cell.genome.corrective,
          term: cell.genome.term,
        };
        const reason = gapItemRejection(gateCell, item, shelf);
        if (reason) {
          rejections[reason] = (rejections[reason] ?? 0) + 1;
          continue;
        }
        // Tendril distinctness gate: the new explanation must NOT be
        // another twin of the cell it is meant to diversify.
        const [newVec] = await cachedEmbed([item.explanation], { name: 'explanation-embeddings', embedder });
        const cellVecs = await cachedEmbed(
          cell.items.map((it) => it.explanation),
          { name: 'explanation-embeddings', embedder },
        );
        if (cellVecs.some((v) => cosine(newVec, v) >= TWIN_EPSILON)) {
          rejections['still-twin'] = (rejections['still-twin'] ?? 0) + 1;
          continue;
        }
        const verdict = await solveGate(item, { ledger, budgetUsd });
        if (!verdict.ok) {
          rejections[`solver:${verdict.reason ?? 'reject'}`] =
            (rejections[`solver:${verdict.reason ?? 'reject'}`] ?? 0) + 1;
          continue;
        }
        bank.items.push({
          id: gapfillId(cell.kernelId, cell.family, item.stem),
          kernelId: cell.kernelId,
          conceptName: cell.items[0].conceptName,
          stem: item.stem,
          options: item.options,
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          bloom: item.bloom,
          difficulty: item.difficulty,
          catches: true,
          confronts: true,
          familyKey: cell.family,
          provenance: { origin: 'twin-depth', model: 'ds', grade: null, date: '2026-07-04' },
        });
        authored += 1;
      }
    }
    if (authored > 0) await writeFile('trellis/bank/all-items.json', JSON.stringify(bank, null, 1));
  } finally {
    await ledger.flush();
  }
  return {
    twinCells: allTwins.length,
    withCorrective: twins.length,
    authored,
    rejections,
    bankItems: bank.items.length,
  };
}

// CLI — explicit env opt-in (spend-capable; the bankGapFill lesson).
if (process.env.TWIN_DEPTH === 'run' && existsSync('trellis/bank/all-items.json') && !process.env.VITEST) {
  console.log(JSON.stringify(await twinDepthPass(), null, 2));
}
