// HARD SET — new courses, harder ground, per-course prompts. Nine kernels no
// bench has ever touched: notation-dense linear algebra, non-Latin pragmatics
// (Korean politeness/particles), proper-noun-dense Reconstruction history,
// one abstract lit kernel. Two arms through the SAME adaptive harness, gates
// and blind solver:
//   generic    — the deployed v1 prompt
//   discipline — v1 with its one GENRE sentence swapped per course family
//                (same rule budget; the L5 lesson bans adding rules)
// Pre-registered refine rule: a discipline prompt is adopted ONLY for the
// disciplines where it wins its own discipline outright; ties keep v1.
//   HARD_SET=run npx vite-node trellis/researcher/hardSetBench.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { authorItemsE2BMax, disciplinePrompt } from './shape.mjs';
import { claimTokens, gapItemRejection } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { stopS, sGenerate } from '../tendril/sModel.mjs';
import { corpusLog } from '../tendril/corpus.mjs';

const HARD = [
  ['public/genome/math-intro.json', 'math/eigenvalues-eigenvectors', 'math'],
  ['public/genome/math-intro.json', 'math/matrix-inverse', 'math'],
  ['public/genome/math-intro.json', 'math/determinant', 'math'],
  ['public/genome/lang-intro.json', 'lang/honorifics-and-politeness-levels', 'lang'],
  ['public/genome/lang-intro.json', 'lang/particles-and-sentence-basics', 'lang'],
  ['public/genome/history-intro.json', 'history/reconstruction-acts-1867-military-districts', 'history'],
  ['public/genome/history-intro.json', 'history/thirteenth-amendment-abolition', 'history'],
  ['public/genome/history-intro.json', 'history/fifteenth-amendment-suffrage-loopholes', 'history'],
  ['public/genome/lit-intro.json', 'lit/negative-capability-reading', 'default'],
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

async function scoreArm(items, kernel, cells, shelf, ledger, armName) {
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
      await corpusLog({
        task: 'items',
        context: `hard-set-${armName}`,
        accepted: false,
        reason,
        source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
        target: JSON.stringify(item),
      });
      continue;
    }
    const verdict = await solveGate(item, { ledger, budgetUsd: 0.8 });
    if (!verdict.ok) {
      rej.solver = (rej.solver ?? 0) + 1;
      await corpusLog({
        task: 'items',
        context: `hard-set-${armName}`,
        accepted: false,
        reason: 'solver',
        source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
        target: JSON.stringify(item),
      });
      continue;
    }
    accepted += 1;
    await corpusLog({
      task: 'items',
      context: `hard-set-${armName}`,
      accepted: true,
      source: JSON.stringify({ kernel: kernel.id, cell: cell.statement }),
      target: JSON.stringify(item),
    });
  }
  return { accepted, rej };
}

if (process.env.HARD_SET === 'run' && !process.env.VITEST) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId: 'hard-set', runDir: 'trellis/runs/hard-set' });
  const out = {
    stamp: 'HARD SET — unseen kernels, generic vs discipline-genre prompts, adaptive harness both arms',
    byDiscipline: {},
    perKernel: [],
  };
  try {
    for (const [shardPath, id, disc] of HARD) {
      const kernel = await loadKernel(shardPath, id);
      if (!kernel) {
        out.perKernel.push({ kernel: id, skipped: 'not ready' });
        continue;
      }
      const cells = kernel.misconceptions.slice(0, 2).map((m) => ({
        statement: m.text,
        corrective: m.corrective,
        mustIncludeTwoOf: claimTokens(m.text),
        explanationMustIncludeHalfOf: claimTokens(m.corrective),
      }));
      const shelf = bank.items.filter((b) => b.kernelId === kernel.id);
      const generic = await scoreArm(
        await authorItemsE2BMax(kernel, kernel, cells, shelf),
        kernel,
        cells,
        shelf,
        ledger,
        'generic',
      );
      const tuned = await scoreArm(
        await authorItemsE2BMax(kernel, kernel, cells, shelf, { system: disciplinePrompt(disc) }),
        kernel,
        cells,
        shelf,
        ledger,
        'tuned',
      );
      const d = (out.byDiscipline[disc] ??= { kernels: 0, generic: 0, tuned: 0 });
      d.kernels += 1;
      d.generic += generic.accepted;
      d.tuned += tuned.accepted;
      out.perKernel.push({
        kernel: id,
        disc,
        generic: generic.accepted,
        tuned: tuned.accepted,
        genericRej: generic.rej,
        tunedRej: tuned.rej,
      });
      console.error(`  [${disc}] ${id}: generic ${generic.accepted} / tuned ${tuned.accepted}`);
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  out.adopt = Object.fromEntries(
    Object.entries(out.byDiscipline).map(([disc, d]) => [
      disc,
      d.tuned > d.generic ? 'ADOPT discipline prompt' : 'keep v1',
    ]),
  );
  out.solverUsd = ledger.totals().usd;
  await writeFile('trellis/researcher/hard-set.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ byDiscipline: out.byDiscipline, adopt: out.adopt, solverUsd: out.solverUsd }, null, 2));
}
