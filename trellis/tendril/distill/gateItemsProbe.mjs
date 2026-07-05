// Gate the E2B item probe: parse JSON arrays from raw generations, run
// gapItemRejection (catch/confront/aesthetics/dedupe) + the blind solver.
//   PROBE=run npx vite-node trellis/tendril/distill/gateItemsProbe.mjs
import { readFile } from 'node:fs/promises';
import { gapItemRejection } from '../../knowledge/bankGapFill.mjs';
import { solveGate } from '../../composer/solver.mjs';
import { createRunLedger } from '../../telemetry.mjs';

if (process.env.PROBE === 'run' && !process.env.VITEST) {
  const probes = JSON.parse(await readFile(process.env.PROBE_FILE ?? 'trellis/tendril/distill/outputs/g4-item-probe.json', 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId: 'g4-item-probe', runDir: 'trellis/runs/g4-item-probe' });
  const summary = { parsed: 0, unparseable: 0, gatePassed: 0, solverPassed: 0, rejections: {} };
  try {
    for (const probe of probes) {
      let items;
      try {
        const match = probe.raw.match(/\[[\s\S]*\]/);
        items = JSON.parse(match[0]);
      } catch {
        summary.unparseable += 1;
        continue;
      }
      const shelf = bank.items.filter((b) => b.kernelId === probe.kernelId);
      for (const [i, item] of items.slice(0, 3).entries()) {
        summary.parsed += 1;
        const cell = { kernelId: probe.kernelId, family: probe.misconception, statement: probe.misconception, corrective: probe.corrective, term: probe.kernelId };
        const reason = i === 0 ? gapItemRejection(cell, item, shelf) : gapItemRejection({ ...cell, statement: null }, item, shelf);
        if (reason) {
          summary.rejections[reason] = (summary.rejections[reason] ?? 0) + 1;
          continue;
        }
        summary.gatePassed += 1;
        const verdict = await solveGate(item, { ledger, budgetUsd: 0.05 });
        if (verdict.ok) summary.solverPassed += 1;
        else summary.rejections.solver = (summary.rejections.solver ?? 0) + 1;
      }
    }
  } finally {
    await ledger.flush();
  }
  console.log(JSON.stringify(summary, null, 2));
}
