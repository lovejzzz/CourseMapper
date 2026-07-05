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
import { readFile, writeFile } from 'node:fs/promises';
import { callModel } from '../providers.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { gapItemRejection, gapfillId } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { cachedEmbed, cosine, makeEmbedder } from './embedder.mjs';

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
  const { twins } = await findTwinCells(bank, { embedder });
  const ledger = createRunLedger({ runId: 'tendril-twin-depth', runDir: 'trellis/runs/tendril-twin-depth' });
  let authored = 0;
  const rejections = {};
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
          system:
            'You author ONE multiple-choice item per entry. Each entry has a misconception family that already has items — but they all use the SAME scenario. Your item must confront the SAME wrong belief through a DIFFERENT scenario/context than the existing stems (given). 4 distinct options; the belief-bearing distractor keeps the misconception’s key terms; explanation 2-3 sentences that confronts the wrong belief with the corrective idea in fresh wording (a lexical gate checks key terms; a similarity gate rejects explanations that mirror the existing ones). Return {items:[{index,...}]}.',
          user: JSON.stringify(
            batch.map((cell, index) => ({
              index,
              kernelId: cell.kernelId,
              family: cell.family,
              existingStems: cell.items.map((it) => it.stem).slice(0, 3),
              existingExplanations: cell.items.map((it) => it.explanation).slice(0, 2),
            })),
            null,
            1,
          ),
        }));
      } catch (error) {
        rejections['batch-failed'] = (rejections['batch-failed'] ?? 0) + batch.length;
        continue;
      }
      for (const item of result.items ?? []) {
        const cell = batch[item.index];
        if (!cell) continue;
        const shelf = bank.items.filter((b) => b.kernelId === cell.kernelId);
        const gateCell = { kernelId: cell.kernelId, family: cell.family, statement: cell.family, term: cell.family };
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
          rejections[`solver:${verdict.reason ?? 'reject'}`] = (rejections[`solver:${verdict.reason ?? 'reject'}`] ?? 0) + 1;
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
  return { twinCells: twins.length, authored, rejections, bankItems: bank.items.length };
}

// CLI — explicit env opt-in (spend-capable; the bankGapFill lesson).
if (process.env.TWIN_DEPTH === 'run' && existsSync('trellis/bank/all-items.json') && !process.env.VITEST) {
  console.log(JSON.stringify(await twinDepthPass(), null, 2));
}
