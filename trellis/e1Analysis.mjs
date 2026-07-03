#!/usr/bin/env node
// E1 — the matched-course paired protocol (docs/TRELLIS.md §17).
//   npx vite-node trellis/e1Analysis.mjs <crucibleRoundDir> <course:trellisRunDir> [...]
// Pairs each course's crucible result (side B, current pipeline: deep grade +
// advisory judge from the round) with the Trellis run (side A: grade.json +
// advisory-judge.json + ledger). Emits paired deltas, mean, and a t-based 95%
// CI. Bar (spec §17): Trellis judge mean ≥ current mean AND the CI on the
// judge delta excludes a regression larger than 0.5.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const T95 = { 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306 }; // df = n-1

async function crucibleCourseResult(roundDir, courseId) {
  const courseDir = join(roundDir, courseId);
  const report = JSON.parse(await readFile(join(courseDir, 'report.json'), 'utf8'));
  const md = await readFile(join(courseDir, 'report.md'), 'utf8').catch(() => '');
  const judgeMatch = /\*\*Overall: (\d+)\/10\*\*/.exec(md);
  const overall =
    report?.normalized?.overall?.score ??
    report?.raw?.overall?.score ??
    report?.overall?.score ??
    null;
  return { grader: overall, judge: judgeMatch ? Number(judgeMatch[1]) : null };
}

async function trellisResult(runDir) {
  const grade = JSON.parse(await readFile(join(runDir, 'grade.json'), 'utf8'));
  const judge = JSON.parse(await readFile(join(runDir, 'advisory-judge.json'), 'utf8'));
  const ledger = JSON.parse(await readFile(join(runDir, 'ledger.json'), 'utf8'));
  return { grader: grade.overall.score, judge: judge.judge?.overall ?? null, usd: ledger.totals.usd };
}

function stats(deltas) {
  const n = deltas.length;
  const mean = deltas.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const t = T95[n - 1] ?? 2.447;
  const half = (t * sd) / Math.sqrt(n);
  return { n, mean: +mean.toFixed(2), sd: +sd.toFixed(2), ci: [+(mean - half).toFixed(2), +(mean + half).toFixed(2)] };
}

const [roundDir, ...pairs] = process.argv.slice(2);
const rows = [];
for (const pair of pairs) {
  const [courseId, runDir] = pair.split('=');
  const current = await crucibleCourseResult(roundDir, courseId);
  const trellis = await trellisResult(runDir);
  rows.push({ courseId, current, trellis });
}

const judgeRows = rows.filter((r) => r.current.judge !== null && r.trellis.judge !== null);
const judgeDeltas = judgeRows.map((r) => r.trellis.judge - r.current.judge);
const graderDeltas = rows.map((r) => r.trellis.grader - r.current.grader);
const judgeStats = judgeDeltas.length >= 3 ? stats(judgeDeltas) : null;
const graderStats = stats(graderDeltas);

const verdict =
  judgeStats && judgeStats.mean >= 0 && judgeStats.ci[0] > -0.5
    ? judgeStats.ci[0] > 0
      ? 'GREEN — Trellis mean above current and the CI excludes zero (better, not just non-regressing)'
      : 'GREEN — non-regression bar met (CI excludes a >0.5 regression)'
    : 'NOT MET';

const lines = [
  '# E1 — matched-course paired comparison (single-seat advisory judge, one round)',
  '',
  `Round (current pipeline): ${roundDir}`,
  '',
  '| Course | Current grader | Trellis grader | Current judge | Trellis judge | Judge Δ | Trellis $ |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${r.courseId} | ${r.current.grader} | ${r.trellis.grader} | ${r.current.judge ?? '—'} | ${r.trellis.judge ?? '—'} | ${
        r.current.judge !== null && r.trellis.judge !== null ? (r.trellis.judge - r.current.judge > 0 ? '+' : '') + (r.trellis.judge - r.current.judge) : '—'
      } | $${r.trellis.usd?.toFixed(3) ?? '—'} |`,
  ),
  '',
  judgeStats
    ? `**Judge paired delta:** mean ${judgeStats.mean >= 0 ? '+' : ''}${judgeStats.mean}, sd ${judgeStats.sd}, 95% CI [${judgeStats.ci[0]}, ${judgeStats.ci[1]}], n=${judgeStats.n}`
    : '**Judge paired delta:** insufficient judge pairs',
  `**Grader paired delta:** mean ${graderStats.mean >= 0 ? '+' : ''}${graderStats.mean}, 95% CI [${graderStats.ci[0]}, ${graderStats.ci[1]}], n=${graderStats.n}`,
  '',
  `**E1 verdict vs the §17 bar:** ${verdict}`,
  '',
  '_Caveats: one judge seat (gpt-5.4-mini), one fresh round per side, advisory scale — NOT the anchored teach-as-is scale; SIMULATED per the constitution. Costs at canonical rates._',
];

console.log(lines.join('\n'));
await writeFile('verification-output/trellis/E1_REPORT.md', lines.join('\n'));
await writeFile(
  'verification-output/trellis/E1_REPORT.json',
  JSON.stringify({ roundDir, rows, judgeStats, graderStats, verdict }, null, 2),
);
