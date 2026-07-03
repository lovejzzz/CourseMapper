// Run ledger — docs/TRELLIS.md §14.6. Every provider call is recorded; the
// A/B harness refuses runs without ledgers. Unmeasured spend is a protocol
// violation (ground rule #5).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function createRunLedger({ runId, runDir = null }) {
  const entries = [];
  return {
    runId,
    record({ stage, model, tokensIn = 0, tokensOut = 0, cached = 0, usd = 0 }) {
      entries.push({ stage, model, tokensIn, tokensOut, cached, usd, at: new Date().toISOString() });
    },
    entries: () => [...entries],
    totals() {
      const byStage = {};
      let tokensIn = 0;
      let tokensOut = 0;
      let usd = 0;
      for (const e of entries) {
        tokensIn += e.tokensIn;
        tokensOut += e.tokensOut;
        usd += e.usd;
        byStage[e.stage] = byStage[e.stage] || { calls: 0, tokensIn: 0, tokensOut: 0, usd: 0 };
        byStage[e.stage].calls += 1;
        byStage[e.stage].tokensIn += e.tokensIn;
        byStage[e.stage].tokensOut += e.tokensOut;
        byStage[e.stage].usd += e.usd;
      }
      return { calls: entries.length, tokensIn, tokensOut, usd: Number(usd.toFixed(4)), byStage };
    },
    async flush() {
      if (!runDir) return null;
      await mkdir(runDir, { recursive: true });
      const path = join(runDir, 'ledger.json');
      await writeFile(path, JSON.stringify({ runId, totals: this.totals(), entries }, null, 2));
      return path;
    },
    costTable() {
      const { byStage, usd, tokensIn, tokensOut } = this.totals();
      const lines = ['| Stage | Calls | Tokens in | Tokens out | Cost |', '| --- | --- | --- | --- | --- |'];
      for (const [stage, t] of Object.entries(byStage)) {
        lines.push(`| ${stage} | ${t.calls} | ${t.tokensIn} | ${t.tokensOut} | $${t.usd.toFixed(4)} |`);
      }
      lines.push(`| **total** | ${this.totals().calls} | ${tokensIn} | ${tokensOut} | **$${usd.toFixed(4)}** |`);
      return lines.join('\n');
    },
  };
}
