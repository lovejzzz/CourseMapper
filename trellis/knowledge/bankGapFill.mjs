// Bank gap-fill authoring — roadmap v0.1.5 item 1.
// J13 located the bottleneck: 44 of 72 kernels hold items for at most one
// misconception family while the genome documents two or more. Spread
// selection cannot select what harvests never captured, and waiting for
// organic harvest growth leaves late shelves thin for months. This pass
// authors ONE reason-bearing item per uncovered (kernel × family) cell,
// directly into the bank — accepted only through the SAME gate stack the
// harvest applies (bench-matcher catch, corrective confrontation,
// aesthetic gates, option distinctness) plus dedupe against the existing
// shelf. Provenance `gapfill`, stamped and disclosed: a benchmark-grade
// asset grows deliberately, not only as exhaust.
//
//   npx vite-node trellis/knowledge/bankGapFill.mjs   (fills + saves)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { callModel } from '../providers.mjs';
import { distractorCatches } from '../judgment/checks/j11Catch.mjs';
import { confrontsCorrective } from '../judgment/checks/j3bPairing.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';
import { familyKeyOf, loadBank } from './itemBank.mjs';

const BATCH = 8;

export async function findGapCells({ genomeDir = 'public/genome' } = {}) {
  const bank = await loadBank('all');
  if (!bank) throw new Error('no bank — build it before gap-filling');
  const covered = new Set(bank.items.filter((i) => i.familyKey).map((i) => `${i.kernelId}::${i.familyKey}`));
  const cells = [];
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
        if (!text || !corrective) continue; // no corrective → cannot gate pairing → skip honestly
        const family = familyKeyOf(text);
        if (!family || covered.has(`${kernel.id}::${family}`)) continue;
        cells.push({
          kernelId: kernel.id,
          term: kernel.term,
          definition: kernel.definition?.text ?? '',
          facts: (kernel.facts ?? []).map((f) => f.text).slice(0, 4),
          statement: text,
          corrective,
          family,
        });
      }
    }
  }
  return { bank, cells };
}

const ITEMS_SCHEMA = {
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

// The full harvest gate stack, applied to a candidate gap-fill item.
export function gapItemPasses(cell, item, shelf) {
  if (typeof item?.stem !== 'string' || item.stem.length < 20) return false;
  if (!/[.!?:;]["'”’)\]]*\s*$/u.test(item.stem.trim())) return false;
  if (!Array.isArray(item.options) || item.options.length !== 4) return false;
  if (new Set(item.options.map((o) => String(o).trim().toLowerCase())).size !== 4) return false;
  if (item.options.some((o) => String(o).length > 110 || /^students?\s/i.test(String(o).trim()))) return false;
  if (typeof item.explanation !== 'string' || item.explanation.length < 30 || item.explanation.length > 500)
    return false;
  if ([item.stem, ...item.options, item.explanation].join(' ').includes('```')) return false;
  const caught = item.options.some(
    (option, oi) => oi !== item.correctIndex && distractorCatches(option, cell.statement),
  );
  if (!caught) return false;
  if (!confrontsCorrective(item.explanation, cell.corrective)) return false;
  // Dedupe WITHIN the family only (v0.1.5 refit): the first fill rejected
  // every cs cell because any new stem about a deep-shelf concept
  // resembles its 50-100 siblings — but cross-family similarity about one
  // concept is legitimate; the dupe that matters is same-family.
  const sameFamily = shelf.filter((other) => other.familyKey === cell.family);
  if (sameFamily.some((other) => tokenOverlapRatio(other.stem, item.stem) > 0.6)) return false;
  if (shelf.some((other) => other.stem.trim().toLowerCase() === item.stem.trim().toLowerCase())) return false;
  return true;
}

export async function gapFillBank({ ledger = null, budgetUsd = null, tier = 'cheap', outDir = 'trellis/bank' } = {}) {
  const { bank, cells } = await findGapCells();
  if (cells.length === 0) return { cells: 0, filled: 0 };

  let filled = 0;
  for (let i = 0; i < cells.length; i += BATCH) {
    const batch = cells.slice(i, i + BATCH);
    try {
      const { result } = await callModel({
        tier,
        stage: 'bankGapFill',
        ledger,
        budgetUsd,
        schema: ITEMS_SCHEMA,
        schemaName: 'gap_items',
        validate: (parsed) => (Array.isArray(parsed?.items) ? [] : ['items must be an array']),
        maxOutputTokens: 4000,
        system:
          'You author ONE multiple-choice quiz item per numbered entry, for an undergraduate course item bank. Each entry documents a WRONG BELIEF students hold and its CORRECTIVE. ' +
          'Requirements per item: an application-level stem grounded in the kernel facts (a concrete case, ending with terminal punctuation); 4 distinct options; one wrong option states the documented wrong belief as a plausible answer WITH its wrong reasoning, reusing the belief’s own key terms (a lexical gate checks them); the explanation confronts the corrective, keeping at least half its key terms (gated), in 2-3 sentences under 60 words; no code fences, options under 15 words. ' +
          'Return {items:[{index, stem, options, correctIndex, explanation, bloom, difficulty}]} covering every entry.',
        user: JSON.stringify(
          batch.map((cell, index) => ({
            index,
            concept: cell.term,
            definition: cell.definition,
            facts: cell.facts,
            wrongBelief: cell.statement,
            corrective: cell.corrective,
          })),
          null,
          1,
        ),
      });
      for (const item of result.items ?? []) {
        const cell = batch[item.index];
        if (!cell) continue;
        const shelf = bank.items.filter((b) => b.kernelId === cell.kernelId);
        if (!gapItemPasses(cell, item, shelf)) continue;
        bank.items.push({
          id: `gapfill:${cell.kernelId}:${cell.family.slice(0, 24).replace(/\s+/g, '-')}`,
          kernelId: cell.kernelId,
          conceptName: cell.term,
          stem: item.stem,
          options: item.options,
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          bloom: item.bloom,
          difficulty: item.difficulty,
          catches: true,
          confronts: true,
          familyKey: cell.family,
          provenance: { origin: 'gapfill', model: tier, grade: null, date: '2026-07-04' },
        });
        filled += 1;
      }
    } catch {
      // A failed batch leaves its cells uncovered — future passes retry.
    }
  }

  const byKernel = new Map();
  for (const item of bank.items) byKernel.set(item.kernelId, (byKernel.get(item.kernelId) ?? 0) + 1);
  bank.kernels = byKernel.size;
  const origins = { harvest: 0, gapfill: 0 };
  for (const item of bank.items) origins[item.provenance?.origin === 'gapfill' ? 'gapfill' : 'harvest'] += 1;
  bank.origins = origins;
  await writeFile(join(outDir, 'all-items.json'), JSON.stringify(bank, null, 1));
  return { cells: cells.length, filled, origins };
}

// CLI — content-guarded (vite-node strips the script path from argv).
import { existsSync } from 'node:fs';
if (existsSync('trellis/bank/all-items.json') && process.argv.length <= 3 && !process.env.VITEST) {
  const { createRunLedger } = await import('../telemetry.mjs');
  const ledger = createRunLedger({ runId: 'bank-gapfill', runDir: 'trellis/runs/bank-gapfill' });
  try {
    const out = await gapFillBank({ ledger, budgetUsd: 0.5 });
    console.log(JSON.stringify(out, null, 2));
  } finally {
    const { mkdir } = await import('node:fs/promises');
    await mkdir('trellis/runs/bank-gapfill', { recursive: true });
    await ledger.flush();
  }
}
