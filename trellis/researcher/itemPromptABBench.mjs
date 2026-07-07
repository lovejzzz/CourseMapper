// L5: E2B item-prompt A/B. v1 (original) vs v2 (concrete-stem hardened), on a
// DENSE set (lexically-entangled lit-poetry, where A1 saw E2B trail) and a
// DIVERSE set (varied disciplines, where A1 saw E2B win). v2 must lift dense
// WITHOUT regressing diverse — else it doesn't ship. Same gate stack + blind
// solver as production shapeItems; author is E2B, $0.
//   PROMPT_AB=run npx vite-node trellis/researcher/itemPromptABBench.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { authorItemsE2B } from './shape.mjs';
import { claimTokens, gapItemRejection } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { stopS } from '../tendril/sModel.mjs';

const DENSE = {
  shard: 'public/genome/lit-intro.json',
  ids: [
    'lit/ghazal-form',
    'lit/scansion',
    'lit/metrical-feet-and-line-length',
    'lit/rhyme-scheme-and-internal-rhyme',
    'lit/language-of-images',
    'lit/sensory-understanding',
  ],
};
const DIVERSE = [
  ['public/genome/cs-intro.json', 'cs/variables'],
  ['public/genome/geo-intro.json', 'geo/minerals'],
  ['public/genome/history-intro.json', 'history/ten-percent-plan'],
  ['public/genome/math-intro.json', 'math/system-of-linear-equations'],
  ['public/genome/lang-intro.json', 'lang/food-and-ordering-at-restaurants'],
  ['public/genome/psych-intro.json', 'psych/operant-conditioning'],
];

async function loadKernel(shardPath, id) {
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  const k = shard.kernels.find((x) => x.id === id);
  if (!k || (k.misconceptions ?? []).length < 2 || (k.facts ?? []).length < 3) return null;
  return {
    id,
    term: k.name ?? id.split('/').pop().replace(/-/g, ' '),
    definition: k.definition,
    facts: k.facts,
    misconceptions: k.misconceptions,
  };
}

async function scoreKernel(kernel, variant, bank, ledger) {
  const target = { id: kernel.id, term: kernel.term };
  const cells = kernel.misconceptions.slice(0, 2).map((m) => ({
    statement: m.text,
    corrective: m.corrective,
    mustIncludeTwoOf: claimTokens(m.text),
    explanationMustIncludeHalfOf: claimTokens(m.corrective),
  }));
  const shelf = bank.items.filter((b) => b.kernelId === kernel.id);
  const items = await authorItemsE2B(
    target,
    { definition: kernel.definition, facts: kernel.facts.map((f) => f.text), misconceptions: kernel.misconceptions },
    cells,
    { variant },
  );
  let accepted = 0;
  const rej = {};
  for (const [i, item] of items.entries()) {
    const cell = cells[Math.min(i, cells.length - 1)];
    const gateCell = {
      kernelId: kernel.id,
      family: cell.statement,
      statement: cell.statement,
      corrective: cell.corrective,
      term: kernel.term,
    };
    const reason = i < 2 ? gapItemRejection(gateCell, item, shelf) : null;
    if (reason) {
      rej[reason] = (rej[reason] ?? 0) + 1;
      continue;
    }
    const verdict = await solveGate(item, { ledger, budgetUsd: 0.6 });
    if (!verdict.ok) {
      rej.solver = (rej.solver ?? 0) + 1;
      continue;
    }
    accepted += 1;
  }
  return { accepted, rej };
}

if (process.env.PROMPT_AB === 'run' && !process.env.VITEST) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId: 'item-prompt-ab', runDir: 'trellis/runs/item-prompt-ab' });
  const denseKernels = (await Promise.all(DENSE.ids.map((id) => loadKernel(DENSE.shard, id)))).filter(Boolean);
  const diverseKernels = (await Promise.all(DIVERSE.map(([s, id]) => loadKernel(s, id)))).filter(Boolean);
  const out = { stamp: 'L5 item-prompt A/B — v1 vs v2, dense vs diverse, same gates+solver', sets: {} };
  try {
    for (const [setName, kernels] of [
      ['dense', denseKernels],
      ['diverse', diverseKernels],
    ]) {
      const set = { kernels: kernels.length, v1: 0, v2: 0, perKernel: [] };
      for (const kernel of kernels) {
        const v1 = await scoreKernel(kernel, 'v1', bank, ledger);
        const v2 = await scoreKernel(kernel, 'v2', bank, ledger);
        set.v1 += v1.accepted;
        set.v2 += v2.accepted;
        set.perKernel.push({ kernel: kernel.id, v1: v1.accepted, v2: v2.accepted, v1rej: v1.rej, v2rej: v2.rej });
        console.error(`  [${setName}] ${kernel.id}: v1 ${v1.accepted} / v2 ${v2.accepted}`);
      }
      out.sets[setName] = set;
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  const d = out.sets.dense,
    v = out.sets.diverse;
  out.verdict = {
    denseLift: d.v2 - d.v1,
    diverseDelta: v.v2 - v.v1,
    ship:
      d.v2 > d.v1 && v.v2 >= v.v1
        ? 'v2 SHIPS — lifts dense, holds diverse'
        : d.v2 >= d.v1 && v.v2 >= v.v1
          ? 'v2 neutral-or-better everywhere — weak ship'
          : 'v2 REJECTED — regressed somewhere',
    ledgerUsd: ledger.totals().usd,
  };
  await writeFile('trellis/researcher/item-prompt-ab.json', JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      { sets: { dense: { v1: d.v1, v2: d.v2 }, diverse: { v1: v.v1, v2: v.v2 } }, verdict: out.verdict },
      null,
      2,
    ),
  );
}
