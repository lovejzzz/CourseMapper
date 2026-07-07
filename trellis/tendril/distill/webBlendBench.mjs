// ONNX S2 through transformers.js — THE BROWSER RUNTIME, running in Node
// (identical engine the web uses; a pass here is a browser-viability
// proof modulo download UX). Bench: the 60 blend held-outs vs mlx S2's
// 83.3% reference.
//
//   node trellis/tendril/distill/webBlendBench.mjs
// on the 60 blend held-outs — if q8 ONNX holds near mlx's 83.3%, the
// browser path is proven with the identical runtime the web uses.
process.chdir('/Users/tianxing/Documents/NYU/NYUsliver/CourseMapper');
import { readFile, writeFile } from 'node:fs/promises';
import { pipeline, env } from '@huggingface/transformers';
env.localModelPath = 'trellis/tendril/models';
env.allowLocalModels = true;
const BLEND_SYSTEM =
  "You polish quiz explanations. The text contains corrective sentences that were pasted in mechanically, so it reads as two voices. Rewrite it as ONE natural explanation (2-3 sentences) that makes every corrective's content its own point — keep the key technical terms (a lexical gate checks this), never paste a corrective as a standalone sentence. Return only the rewritten explanation text.";
const gen = await pipeline('text-generation', 'tendril-s2-web', { dtype: process.env.WEB_DTYPE ?? 'q8' });
const tests = (await readFile('trellis/tendril/distill/test-heldout.jsonl', 'utf8'))
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .filter((t) => t.task === 'blend')
  .slice(0, 60);
const out = [];
const t0 = performance.now();
for (const [i, t] of tests.entries()) {
  const messages = [
    { role: 'system', content: BLEND_SYSTEM },
    { role: 'user', content: JSON.stringify({ text: t.source }) },
  ];
  let result = await gen(messages, { max_new_tokens: 400, do_sample: false });
  let text = result[0].generated_text.at(-1).content.trim();
  // deployment parity: serve_s retries identity no-ops once with sampling
  const noop = text === t.source.trim() || text.includes(t.source.trim()) || t.source.trim().includes(text);
  if (noop) {
    result = await gen(messages, { max_new_tokens: 400, do_sample: true, temperature: 0.7 });
    text = result[0].generated_text.at(-1).content.trim();
  }
  out.push({ task: 'blend', mode: null, source: t.source, output: text });
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/60`);
}
console.log('sec/sample:', ((performance.now() - t0) / 1000 / tests.length).toFixed(2));
await writeFile(
  `trellis/tendril/distill/outputs/s2-web${process.env.WEB_DTYPE === 'fp32' ? '-fp32' : ''}.jsonl`,
  out.map((o) => JSON.stringify(o)).join('\n'),
);
console.log('wrote s2-web.jsonl');
