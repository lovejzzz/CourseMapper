// Recompute a run ledger's costs from its exact recorded tokens using the
// canonical pricing table (src/lib/apiUsageCost.js). Historical ledger files
// stay untouched; this prints corrected totals for reporting.
import { readFile } from 'node:fs/promises';
import { estimateUsageCost } from '../src/lib/apiUsageCost.js';

const path = process.argv[2];
const data = JSON.parse(await readFile(path, 'utf8'));
let usd = 0;
const byStage = {};
for (const e of data.entries) {
  const est = estimateUsageCost({
    provider: 'openai',
    modelId: e.model,
    usage: {
      prompt_tokens: e.tokensIn,
      completion_tokens: e.tokensOut,
      prompt_tokens_details: { cached_tokens: e.cached || 0 },
    },
  });
  const cost = est?.costUsd ?? 0;
  usd += cost;
  byStage[e.stage] = (byStage[e.stage] || 0) + cost;
}
console.log(path);
console.log('  corrected total: $' + usd.toFixed(4), '| recorded (wrong rates): $' + data.totals.usd);
for (const [stage, cost] of Object.entries(byStage)) console.log(`  ${stage}: $${cost.toFixed(4)}`);
