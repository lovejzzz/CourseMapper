// T-M3 gate-acceptance bench: the exit-bar instrument (TENDRIL.md §11).
// Every candidate output passes the DEPLOYMENT gates — the same checks the
// skin/blend paths enforce in production — plus non-identity (a rewrite
// that changes nothing is a no-op, not an acceptance) and, for blends, a
// claim-token preservation stand-in for the corrective gate (correctives
// aren't recoverable for reconstructed test pairs; disclosed).
//
//   node trellis/tendril/distill/gateBench.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TERMINAL_PUNCT_RE, weightedLength } from '../../voice/contracts.mjs';
import { tokenOverlapRatio } from '../../judgment/text.mjs';
import { claimTokens } from '../../knowledge/bankGapFill.mjs';

export function gateOutput({ task, mode, source, output }) {
  const text = String(output ?? '').trim();
  if (text.length === 0) return 'empty';
  const len = weightedLength(text);
  const orig = weightedLength(source);
  if (len < orig * 0.6 || len > orig * 1.4) return 'length-band';
  if (!TERMINAL_PUNCT_RE.test(text)) return 'terminal-punct';
  if (text.includes('```')) return 'code-fence';
  if (task === 'skin' && (mode === 'reteach' || mode === 'worked-example')) {
    if (!/example|walk|work(ed|ing)? through|demo|trace/i.test(text)) return 'mode-example';
  }
  if (tokenOverlapRatio(source, text) >= 0.98) return 'identity-noop';
  if (task === 'blend') {
    const tokens = claimTokens(source);
    const outLower = text.toLowerCase();
    const kept = tokens.filter((t) => outLower.includes(t)).length;
    if (kept < Math.ceil(tokens.length / 2)) return 'claim-loss';
  }
  return null; // accepted
}

async function benchFile(path) {
  const rows = (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const byTask = {};
  for (const row of rows) {
    const reason = gateOutput(row);
    const bucket = (byTask[row.task] = byTask[row.task] ?? { total: 0, accepted: 0, reasons: {} });
    bucket.total += 1;
    if (reason === null) bucket.accepted += 1;
    else bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
  }
  const overall = Object.values(byTask).reduce(
    (acc, b) => ({ total: acc.total + b.total, accepted: acc.accepted + b.accepted }),
    { total: 0, accepted: 0 },
  );
  return {
    overall: { ...overall, rate: Number((overall.accepted / Math.max(1, overall.total)).toFixed(3)) },
    byTask: Object.fromEntries(
      Object.entries(byTask).map(([task, b]) => [
        task,
        { ...b, rate: Number((b.accepted / b.total).toFixed(3)) },
      ]),
    ),
  };
}

// Content guard (vite-node strips argv paths): run when at least one
// candidate output file exists — those exist only in this workflow.
if (existsSync('trellis/tendril/distill/outputs') && !process.env.VITEST) {
  const report = { stamp: 'SIMULATED instruments — deployment gates + non-identity + claim-preservation stand-in' };
  for (const [name, path] of [
    ['tendril-s3', 'trellis/tendril/distill/outputs/tendril-s3.jsonl'],
    ['tendril-s3b', 'trellis/tendril/distill/outputs/tendril-s3b.jsonl'],
    ['gemma4-e2b-ft', 'trellis/tendril/distill/outputs/gemma4-e2b-ft.jsonl'],
    ['gemma4-e2b-zs', 'trellis/tendril/distill/outputs/gemma4-e2b-zs.jsonl'],
    ['s2-web', 'trellis/tendril/distill/outputs/s2-web.jsonl'],
    ['qwen-skin', 'trellis/tendril/distill/outputs/qwen-skin.jsonl'],
    ['qwen-blend', 'trellis/tendril/distill/outputs/qwen-blend.jsonl'],
    ['smol-skin', 'trellis/tendril/distill/outputs/smol-skin.jsonl'],
    ['smol-blend', 'trellis/tendril/distill/outputs/smol-blend.jsonl'],
    ['tendril-s', 'trellis/tendril/distill/outputs/tendril-s.jsonl'],
    ['smollm-base', 'trellis/tendril/distill/outputs/smollm-base.jsonl'],
    ['nano', 'trellis/tendril/distill/outputs/nano.jsonl'],
  ]) {
    if (existsSync(path)) report[name] = await benchFile(path);
  }
  await writeFile('trellis/tendril/distill/gate-bench.json', JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 2));
}
