// Level-7 bench: does feedback-directed resample (test-time compute) lift
// E2B's dense-kernel item acceptance without regressing diverse? Paired arms
// in ONE run: plain = authorItemsE2B, retry = authorItemsE2BRetry. Identical
// gapItemRejection + blind solver on both. Pre-registered bar: dense retry
// accepted ≥ plain + 3, diverse retry ≥ plain. The L5 negative (more rules
// made dense WORSE) is the prior — this tests a different mechanism.
//   RETRY_BENCH=run npx vite-node trellis/researcher/itemRetryBench.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { authorItemsE2B, authorItemsE2BRetry } from './shape.mjs';
import { claimTokens, gapItemRejection } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { stopS } from '../tendril/sModel.mjs';

const DENSE = [
  ['public/genome/lit-intro.json', 'lit/ghazal-form'],
  ['public/genome/lit-intro.json', 'lit/scansion'],
  ['public/genome/lit-intro.json', 'lit/metrical-feet-and-line-length'],
  ['public/genome/lit-intro.json', 'lit/rhyme-scheme-and-internal-rhyme'],
  ['public/genome/lit-intro.json', 'lit/language-of-images'],
  ['public/genome/lit-intro.json', 'lit/sensory-understanding'],
];
const DIVERSE = [
  ['public/genome/cs-intro.json', 'cs/variables'],
  ['public/genome/geo-intro.json', 'geo/minerals'],
  ['public/genome/math-intro.json', 'math/system-of-linear-equations'],
  ['public/genome/psych-intro.json', 'psych/operant-conditioning'],
];

async function loadKernel(shardPath, id) {
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  const k = shard.kernels.find((x) => x.id === id);
  if (!k || (k.misconceptions ?? []).length < 2) return null;
  return {
    id,
    term: k.name ?? id.split('/').pop().replace(/-/g, ' '),
    definition: k.definition,
    facts: k.facts,
    misconceptions: k.misconceptions,
  };
}

async function scoreArm(items, kernel, cells, shelf, ledger) {
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

if (process.env.RETRY_BENCH === 'run' && !process.env.VITEST) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId: 'item-retry-bench', runDir: 'trellis/runs/item-retry-bench' });
  const out = { stamp: 'L7 retry bench — plain vs feedback-resample, dense+diverse, same gates+solver', sets: {} };
  try {
    for (const [setName, defs] of [
      ['dense', DENSE],
      ['diverse', DIVERSE],
    ]) {
      const set = { kernels: 0, plain: 0, retry: 0, perKernel: [] };
      for (const [shardPath, id] of defs) {
        const kernel = await loadKernel(shardPath, id);
        if (!kernel) continue;
        set.kernels += 1;
        const cells = kernel.misconceptions.slice(0, 2).map((m) => ({
          statement: m.text,
          corrective: m.corrective,
          mustIncludeTwoOf: claimTokens(m.text),
          explanationMustIncludeHalfOf: claimTokens(m.corrective),
        }));
        const shelf = bank.items.filter((b) => b.kernelId === kernel.id);
        const plainItems = await authorItemsE2B(kernel, kernel, cells);
        const plain = await scoreArm(plainItems, kernel, cells, shelf, ledger);
        const retryItems = await authorItemsE2BRetry(kernel, kernel, cells, shelf);
        const retry = await scoreArm(retryItems, kernel, cells, shelf, ledger);
        set.plain += plain.accepted;
        set.retry += retry.accepted;
        set.perKernel.push({
          kernel: kernel.id,
          plain: plain.accepted,
          retry: retry.accepted,
          plainRej: plain.rej,
          retryRej: retry.rej,
        });
        console.error(`  [${setName}] ${kernel.id}: plain ${plain.accepted} / retry ${retry.accepted}`);
      }
      out.sets[setName] = set;
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  const d = out.sets.dense;
  const v = out.sets.diverse;
  out.verdict = {
    denseLift: d.retry - d.plain,
    diverseDelta: v.retry - v.plain,
    ship:
      d.retry - d.plain >= 3 && v.retry >= v.plain
        ? 'RETRY SHIPS — dense lifted ≥3, diverse held'
        : 'RETRY NOT PROVEN — bar unmet',
    ledgerUsd: ledger.totals().usd,
  };
  await writeFile('trellis/researcher/item-retry-bench.json', JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      { dense: { plain: d.plain, retry: d.retry }, diverse: { plain: v.plain, retry: v.retry }, verdict: out.verdict },
      null,
      2,
    ),
  );
}
