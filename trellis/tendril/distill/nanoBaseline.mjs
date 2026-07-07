// Nano baseline for the T-M3 gate bench: the SAME held-out sample, the
// SAME single-entry deployment prompts, judged by the SAME gates. This is
// the number Tendril-S is measured against (reference band 85-95%).
//   npx vite-node trellis/tendril/distill/nanoBaseline.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { callModel } from '../../providers.mjs';
import { createRunLedger } from '../../telemetry.mjs';

const N_PER_TASK = 60;
const SKIN_SYSTEM =
  "You are the course's own instructor unifying a lesson plan assembled from proven parts. Rewrite the segment MINIMALLY so it reads as one instructor: fix week/lesson references, add one-clause transitions where segments collide, unify register. NEVER change technical content, examples, numbers, or code; never add new claims; keep the rewrite within ±40% of the original length. Return only the rewritten segment text.";
const BLEND_SYSTEM =
  "You polish quiz explanations. The text contains corrective sentences that were pasted in mechanically, so it reads as two voices. Rewrite it as ONE natural explanation (2-3 sentences) that makes every corrective's content its own point — keep the key technical terms (a lexical gate checks this), never paste a corrective as a standalone sentence. Return only the rewritten explanation text.";

const tests = (await readFile('trellis/tendril/distill/test-heldout.jsonl', 'utf8'))
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const sample = [];
const counts = { skin: 0, blend: 0 };
for (const t of tests) {
  if (counts[t.task] < N_PER_TASK) {
    counts[t.task] += 1;
    sample.push(t);
  }
}

const ledger = createRunLedger({ runId: 'tendril-nano-baseline', runDir: 'trellis/runs/tendril-nano-baseline' });
const outputs = [];
for (const [i, t] of sample.entries()) {
  try {
    const { result } = await callModel({
      tier: 'nano',
      stage: 'baseline',
      ledger,
      system: t.task === 'skin' ? SKIN_SYSTEM : BLEND_SYSTEM,
      user: JSON.stringify(t.mode ? { mode: t.mode, text: t.source } : { text: t.source }),
      maxOutputTokens: 700,
    });
    outputs.push({ task: t.task, mode: t.mode, source: t.source, output: String(result).trim() });
  } catch (error) {
    outputs.push({
      task: t.task,
      mode: t.mode,
      source: t.source,
      output: '',
      error: String(error.message).slice(0, 80),
    });
  }
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${sample.length}`);
}
await mkdir('trellis/tendril/distill/outputs', { recursive: true });
await writeFile('trellis/tendril/distill/outputs/nano.jsonl', outputs.map((o) => JSON.stringify(o)).join('\n'));
await ledger.flush();
console.log('wrote nano.jsonl;', ledger.costTable?.() ?? '');
