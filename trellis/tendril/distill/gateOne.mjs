// tiny CLI: gate one outputs file (vite-node; content-guarded by argv file)
import { readFile } from 'node:fs/promises';
import { gateOutput } from './gateBench.mjs';
const file = process.argv[2] ?? process.env.GATE_FILE;
if (file && !process.env.VITEST) {
  const rows = (await readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  let acc = 0;
  const reasons = {};
  for (const r of rows) {
    const why = gateOutput(r);
    if (why === null) acc += 1;
    else reasons[why] = (reasons[why] ?? 0) + 1;
  }
  console.log(JSON.stringify({ file, rate: Number((acc / rows.length).toFixed(3)), reasons }));
}
