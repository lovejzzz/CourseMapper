// THE SHOWDOWN: Gemma 4 E2B (local, $0) vs DeepSeek v4-flash vs GPT-5.4-mini
// as the researcher's item author. 8 frozen kernels (4 lexically-dense lit +
// 4 diverse), identical gapItemRejection + blind cross-family solver for all
// three. Reports accepted / authoring cost / wall-time per author. The solver
// seat (ds) runs for every author and is priced separately — it is the
// verification cost, not the authoring cost.
//   SHOWDOWN=run npx vite-node trellis/researcher/authorShowdownBench.mjs [e2bMode]
//   e2bMode: plain (default) | retry
import { readFile, writeFile } from 'node:fs/promises';
import { authorItemsE2B, authorItemsE2BRetry, authorItemsE2BMax, authorItemsPaid } from './shape.mjs';
import { corpusLog } from '../tendril/corpus.mjs';
import { claimTokens, gapItemRejection } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { stopS } from '../tendril/sModel.mjs';

const KERNELS = [
  // dense (the E2B-hard class)
  ['public/genome/lit-intro.json', 'lit/ghazal-form', 'dense'],
  ['public/genome/lit-intro.json', 'lit/scansion', 'dense'],
  ['public/genome/lit-intro.json', 'lit/rhyme-scheme-and-internal-rhyme', 'dense'],
  ['public/genome/lit-intro.json', 'lit/language-of-images', 'dense'],
  // diverse
  ['public/genome/cs-intro.json', 'cs/variables', 'diverse'],
  ['public/genome/geo-intro.json', 'geo/minerals', 'diverse'],
  ['public/genome/math-intro.json', 'math/system-of-linear-equations', 'diverse'],
  ['public/genome/psych-intro.json', 'psych/operant-conditioning', 'diverse'],
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

if (process.env.SHOWDOWN === 'run' && !process.env.VITEST) {
  const argvMode = [process.argv[2], process.argv[process.argv.length - 1]].find((a) => a === 'retry' || a === 'max');
  const e2bMode = argvMode ?? 'plain';
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const solverLedger = createRunLedger({ runId: 'showdown-solver', runDir: 'trellis/runs/showdown-solver' });
  const authors = {
    e2b: { author: null, ledger: null },
    ds: { ledger: createRunLedger({ runId: 'showdown-ds' }) },
    mini: { ledger: createRunLedger({ runId: 'showdown-mini' }) },
  };
  const out = {
    stamp: `SHOWDOWN — e2b(${e2bMode}) vs ds vs gpt-5.4-mini; same gates + blind solver`,
    e2bMode,
    byAuthor: {},
    perKernel: [],
  };
  for (const name of Object.keys(authors)) out.byAuthor[name] = { accepted: 0, authored: 0, ms: 0, rejections: {} };
  try {
    for (const [shardPath, id, klass] of KERNELS) {
      const kernel = await loadKernel(shardPath, id);
      if (!kernel) continue;
      const cells = kernel.misconceptions.slice(0, 2).map((m) => ({
        statement: m.text,
        corrective: m.corrective,
        mustIncludeTwoOf: claimTokens(m.text),
        explanationMustIncludeHalfOf: claimTokens(m.corrective),
      }));
      const shelf = bank.items.filter((b) => b.kernelId === kernel.id);
      const row = { kernel: id, klass };
      for (const name of ['e2b', 'ds', 'mini']) {
        const t0 = performance.now();
        let items = [];
        try {
          if (name === 'e2b') {
            items =
              e2bMode === 'max'
                ? await authorItemsE2BMax(kernel, kernel, cells, shelf)
                : e2bMode === 'retry'
                  ? await authorItemsE2BRetry(kernel, kernel, cells, shelf)
                  : await authorItemsE2B(kernel, kernel, cells);
          } else {
            items = await authorItemsPaid(kernel, kernel, cells, {
              ledger: authors[name].ledger,
              budgetUsd: 1.0,
              tier: name === 'mini' ? 'cheap' : 'ds',
            });
          }
        } catch (error) {
          row[`${name}Error`] = String(error.message).slice(0, 60);
        }
        const ms = performance.now() - t0;
        const agg = out.byAuthor[name];
        agg.ms += ms;
        agg.authored += items.length;
        let accepted = 0;
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
            agg.rejections[reason] = (agg.rejections[reason] ?? 0) + 1;
            if (name === 'e2b')
              await corpusLog({
                task: 'items',
                context: `showdown-${e2bMode}`,
                accepted: false,
                reason,
                source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
                target: JSON.stringify(item),
              });
            continue;
          }
          const verdict = await solveGate(item, { ledger: solverLedger, budgetUsd: 1.5 });
          if (!verdict.ok) {
            agg.rejections.solver = (agg.rejections.solver ?? 0) + 1;
            if (name === 'e2b')
              await corpusLog({
                task: 'items',
                context: `showdown-${e2bMode}`,
                accepted: false,
                reason: 'solver',
                source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
                target: JSON.stringify(item),
              });
            continue;
          }
          if (name === 'e2b')
            await corpusLog({
              task: 'items',
              context: `showdown-${e2bMode}`,
              accepted: true,
              source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
              target: JSON.stringify(item),
            });
          accepted += 1;
          // Full bodies feed the human blind packet (L10) — no re-authoring.
          (out.acceptedItems ??= []).push({ author: name, kernel: kernel.id, klass, item });
        }
        agg.accepted += accepted;
        row[name] = accepted;
      }
      out.perKernel.push(row);
      console.error(`  [${klass}] ${id}: e2b ${row.e2b} / ds ${row.ds} / mini ${row.mini}`);
    }
  } finally {
    stopS();
    await solverLedger.flush();
  }
  out.costs = {
    e2bAuthoringUsd: 0,
    dsAuthoringUsd: authors.ds.ledger.totals().usd,
    miniAuthoringUsd: authors.mini.ledger.totals().usd,
    solverSeatUsd: solverLedger.totals().usd,
  };
  for (const name of Object.keys(out.byAuthor))
    out.byAuthor[name].secPerKernel = Number((out.byAuthor[name].ms / KERNELS.length / 1000).toFixed(1));
  await writeFile('trellis/researcher/author-showdown.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ byAuthor: out.byAuthor, costs: out.costs }, null, 2));
}
