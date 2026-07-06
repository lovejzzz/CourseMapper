// The standing per-kernel scoreboard: every showdown snapshot feeds one
// history file. This is (a) the evidence base behind author-registry.json,
// (b) the drift alarm — if the deployed author's rate on a kernel falls
// below its pooled mean by more than the calibrated noise floor (±1/run),
// the kernel is flagged for routing review. Deterministic, $0.
//   SCOREBOARD=run npx vite-node trellis/researcher/scoreboard.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';

const RUN_FILES_PREFIX = 'author-showdown';

if (process.env.SCOREBOARD === 'run' && !process.env.VITEST) {
  const dir = 'trellis/researcher';
  const files = (await readdir(dir)).filter((f) => f.startsWith(RUN_FILES_PREFIX) && f.endsWith('.json')).sort();
  const history = {}; // kernel -> { runs: [{file, e2b, ds, mini}] }
  for (const file of files) {
    const d = JSON.parse(await readFile(`${dir}/${file}`, 'utf8'));
    for (const row of d.perKernel ?? []) {
      (history[row.kernel] ??= { runs: [] }).runs.push({
        file,
        e2bMode: d.e2bMode ?? 'plain',
        e2b: row.e2b ?? null,
        ds: row.ds ?? null,
        mini: row.mini ?? null,
      });
    }
  }
  const NOISE = 1; // calibrated by the identical-prompt control (hard set)
  const board = {};
  const flags = [];
  for (const [kernel, h] of Object.entries(history)) {
    const xs = h.runs.map((r) => r.e2b).filter((x) => x != null);
    const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const latest = xs.at(-1);
    const drift = mean != null && latest != null && latest < mean - NOISE;
    board[kernel] = {
      runs: h.runs.length,
      e2bMean: mean != null ? Number(mean.toFixed(2)) : null,
      e2bLatest: latest ?? null,
      dsMean: (() => {
        const ys = h.runs.map((r) => r.ds).filter((x) => x != null);
        return ys.length ? Number((ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(2)) : null;
      })(),
      history: h.runs,
      drift,
    };
    if (drift) flags.push(kernel);
  }
  const out = {
    stamp:
      'per-kernel author scoreboard — registry evidence + drift alarm (noise ±1/run from the identical-prompt control)',
    files,
    driftFlags: flags,
    board,
  };
  await writeFile('trellis/researcher/scoreboard.json', JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      {
        kernels: Object.keys(board).length,
        runsSeen: files,
        driftFlags: flags,
        summary: Object.fromEntries(
          Object.entries(board).map(([k, v]) => [k, `e2b ${v.e2bMean} (latest ${v.e2bLatest}) ds ${v.dsMean}`]),
        ),
      },
      null,
      2,
    ),
  );
}
