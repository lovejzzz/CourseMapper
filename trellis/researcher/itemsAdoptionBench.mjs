// A1 (plan v0.2): E2B vs ds as the researcher's item author, on FROZEN
// kernels — the author is the only variable. Same kernels, same misconceptions,
// same gapItemRejection + blind solver seat. Bar: E2B accepted ≥ ds accepted,
// with the solver (paid, cross-family) confirming both.
//   ITEMS_BENCH=run npx vite-node trellis/researcher/itemsAdoptionBench.mjs [N]
import { readFile, writeFile } from 'node:fs/promises';
import { shapeItems } from './shape.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { stopS } from '../tendril/sModel.mjs';

if (process.env.ITEMS_BENCH === 'run' && !process.env.VITEST) {
  const N = Number(process.argv[2] ?? process.argv[process.argv.length - 1]) || 8;
  const shard = JSON.parse(await readFile('public/genome/lit-intro.json', 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ready = shard.kernels
    .filter((k) => (k.misconceptions ?? []).length >= 2 && (k.facts ?? []).length >= 3)
    .slice(0, N);

  const ledger = createRunLedger({ runId: 'items-adoption', runDir: 'trellis/runs/items-adoption' });
  const authors = ['ds', 'e2b'];
  const out = {
    stamp: 'A1 items adoption — FROZEN kernels, author is the only variable',
    kernels: ready.length,
    byAuthor: {},
    perKernel: [],
  };
  try {
    for (const author of authors) {
      out.byAuthor[author] = { authored: 0, accepted: 0, solverConfirmed: 0, rejections: {} };
    }
    for (const k of ready) {
      const target = { id: k.id, term: k.name ?? k.id.split('/').pop().replace(/-/g, ' ') };
      const kernel = {
        definition: k.definition,
        facts: k.facts,
        misconceptions: (k.misconceptions ?? []).map((m) => ({ text: m.text, corrective: m.corrective })),
      };
      const shelf = bank.items.filter((b) => b.kernelId === k.id);
      const row = { kernel: k.id };
      for (const author of authors) {
        // A transient DeepSeek ECONNRESET must not lose the whole run — count
        // the kernel as a network miss for that author and keep going.
        let res;
        try {
          res = await shapeItems(target, kernel, shelf, { ledger, budgetUsd: 0.8, author });
        } catch (error) {
          const agg = out.byAuthor[author];
          agg.rejections['network-error'] = (agg.rejections['network-error'] ?? 0) + 1;
          row[author] = { accepted: 0, rejections: { 'network-error': 1 }, note: String(error.message).slice(0, 60) };
          continue;
        }
        const agg = out.byAuthor[author];
        agg.accepted += res.accepted.length;
        agg.solverConfirmed += res.accepted.length; // accepted implies solver-ok in shapeItems
        for (const [r, n] of Object.entries(res.rejections)) agg.rejections[r] = (agg.rejections[r] ?? 0) + n;
        const authoredThisCell = res.accepted.length + Object.values(res.rejections).reduce((a, b) => a + b, 0);
        agg.authored += authoredThisCell;
        row[author] = { accepted: res.accepted.length, rejections: res.rejections };
      }
      out.perKernel.push(row);
      console.error(`  ${k.id}: ds ${row.ds.accepted} / e2b ${row.e2b.accepted}`);
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  const ds = out.byAuthor.ds,
    e2b = out.byAuthor.e2b;
  out.verdict = {
    countParity: e2b.accepted >= ds.accepted ? 'MET — E2B ≥ ds' : `UNMET — E2B ${e2b.accepted} < ds ${ds.accepted}`,
    dsAccepted: ds.accepted,
    e2bAccepted: e2b.accepted,
    ledgerUsd: ledger.totals().usd,
  };
  await writeFile('trellis/researcher/items-adoption.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ byAuthor: out.byAuthor, verdict: out.verdict }, null, 2));
}
