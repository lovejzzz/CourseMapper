// POLISH LEVER — the one measured quality gap (judge 6.9 vs ds 7.9 on the
// Education Bar) is explanation POLISH, not correctness (battery parity).
// E2B rewrites its own accepted explanations once, greedy; a deterministic
// gate keeps content honest: ≥half the original claimTokens preserved, length
// band 0.6–1.6×, terminal punctuation, no fences — gate failure keeps the
// original (polish is cosmetic by construction). Then the SAME blind
// two-family judge protocol scores raw-vs-ds and polished-vs-ds pairs.
// Pre-registered bar: polished judge gap ≤ raw gap − 0.5, zero content-gate
// losses (structural: fallback).
//   POLISH_BENCH=run npx vite-node trellis/researcher/polishBench.mjs [showdownFile]
import { readFile, writeFile } from 'node:fs/promises';
import { sGenerate, stopS } from '../tendril/sModel.mjs';
import { claimTokens } from '../knowledge/bankGapFill.mjs';
import { TERMINAL_PUNCT_RE, weightedLength } from '../voice/contracts.mjs';
import { callModel } from '../providers.mjs';
import { createRunLedger } from '../telemetry.mjs';

const SHARDS = {
  lit: 'public/genome/lit-intro.json',
  cs: 'public/genome/cs-intro.json',
  geo: 'public/genome/geo-intro.json',
  math: 'public/genome/math-intro.json',
  psych: 'public/genome/psych-intro.json',
};

export function polishGate(original, polished) {
  const out = String(polished ?? '').trim();
  if (!out) return 'empty';
  const len = weightedLength(out);
  const orig = weightedLength(original);
  if (len < orig * 0.6 || len > orig * 1.6) return 'length-band';
  if (!TERMINAL_PUNCT_RE.test(out)) return 'terminal-punct';
  if (out.includes('```')) return 'code-fence';
  const tokens = claimTokens(original);
  const lower = out.toLowerCase();
  const kept = tokens.filter((t) => lower.includes(t)).length;
  if (kept < Math.ceil(tokens.length / 2)) return 'claim-loss';
  return null;
}

async function polishExplanation(item, term) {
  const system =
    'You polish ONE quiz explanation for a university course. Rewrite it as 2-3 crisp sentences a professor would be proud of: concrete, direct, no filler ("this shows that", "it is important to note"), keep every technical claim and key term. Return ONLY the rewritten explanation text.';
  const user = JSON.stringify({
    topic: term,
    stem: item.stem,
    correctOption: item.options[item.correctIndex],
    explanation: item.explanation,
  });
  try {
    const text = String(await sGenerate({ system, user, task: 'items', maxTokens: 220 })).trim();
    return polishGate(item.explanation, text) === null ? text : null;
  } catch {
    return null;
  }
}

function renderQuiz(items) {
  const letters = ['A', 'B', 'C', 'D'];
  return items
    .map(
      (item, n) =>
        `Q${n + 1}. ${item.stem}\n${item.options.map((o, i) => `   ${letters[i]}. ${o}`).join('\n')}\n   Answer: ${letters[item.correctIndex] ?? '?'}\n   Explanation: ${item.explanation}`,
    )
    .join('\n\n');
}

async function judgeSeat(tier, term, first, second, ledger) {
  const { result } = await callModel({
    tier,
    stage: 'polish-judge',
    ledger,
    budgetUsd: 0.4,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scoreFirst', 'scoreSecond'],
      properties: {
        scoreFirst: { type: 'integer', minimum: 1, maximum: 10 },
        scoreSecond: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    schemaName: 'quiz_pair_scores',
    validate: (o) => (o?.scoreFirst ? [] : ['scores required']),
    maxOutputTokens: 200,
    system:
      'You are a professor choosing which short quiz to give your class on this topic. Score each 1-10 for TEACHING quality: real understanding tested, plausible distractors, explanations that correct the misunderstanding crisply. Penalize vague stems, giveaways, and filler. Return JSON only.',
    user: JSON.stringify({ topic: term, first, second }),
  });
  return result;
}

async function kernelName(kernelId) {
  const file = SHARDS[kernelId.split('/')[0]];
  if (!file) return kernelId.split('/').pop().replace(/-/g, ' ');
  const shard = JSON.parse(await readFile(file, 'utf8'));
  const k = shard.kernels.find((x) => x.id === kernelId);
  return k?.term ?? k?.name ?? kernelId.split('/').pop().replace(/-/g, ' ');
}

if (process.env.POLISH_BENCH === 'run' && !process.env.VITEST) {
  const file = process.argv[2]?.endsWith('.json')
    ? process.argv[2]
    : 'trellis/researcher/author-showdown-run5selfsolve.json';
  const showdown = JSON.parse(await readFile(file, 'utf8'));
  const ledger = createRunLedger({ runId: 'polish-bench', runDir: 'trellis/runs/polish-bench' });
  const byKernel = new Map();
  for (const e of showdown.acceptedItems ?? []) {
    if (!byKernel.has(e.kernel)) byKernel.set(e.kernel, { e2b: [], ds: [] });
    if (e.author === 'e2b' || e.author === 'ds') byKernel.get(e.kernel)[e.author].push(e.item);
  }
  const out = {
    stamp: 'POLISH BENCH — raw-e2b vs ds AND polished-e2b vs ds, same blind judge protocol',
    file,
    polished: 0,
    kept: 0,
    perKernel: [],
  };
  const means = { rawE2b: [], rawDs: [], polE2b: [], polDs: [] };
  try {
    for (const [kernelId, sets] of byKernel) {
      if (sets.e2b.length < 2 || sets.ds.length < 2) continue;
      const term = await kernelName(kernelId);
      const polishedItems = [];
      for (const item of sets.e2b.slice(0, 3)) {
        const polished = await polishExplanation(item, term);
        out.polished += 1;
        if (polished) {
          out.kept += 1;
          polishedItems.push({ ...item, explanation: polished });
        } else polishedItems.push(item); // gate failure → original (cosmetic by construction)
      }
      const dsQuiz = renderQuiz(sets.ds.slice(0, 3));
      const flip = kernelId.length % 2 === 1;
      for (const [arm, quiz] of [
        ['raw', renderQuiz(sets.e2b.slice(0, 3))],
        ['pol', renderQuiz(polishedItems)],
      ]) {
        const [first, second] = flip ? [dsQuiz, quiz] : [quiz, dsQuiz];
        for (const tier of ['nano', 'ds']) {
          try {
            const r = await judgeSeat(tier, term, first, second, ledger);
            const e2bScore = flip ? r.scoreSecond : r.scoreFirst;
            const dsScore = flip ? r.scoreFirst : r.scoreSecond;
            means[`${arm}E2b`].push(e2bScore);
            means[`${arm}Ds`].push(dsScore);
          } catch {
            /* failed seat visible via counts */
          }
        }
      }
      out.perKernel.push({ kernel: kernelId });
      console.error(`  [polish] ${kernelId} judged`);
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  const mean = (xs) => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null);
  const rawGap = mean(means.rawDs) - mean(means.rawE2b);
  const polGap = mean(means.polDs) - mean(means.polE2b);
  out.verdict = {
    rawE2b: mean(means.rawE2b),
    rawDs: mean(means.rawDs),
    rawGap: Number(rawGap.toFixed(2)),
    polishedE2b: mean(means.polE2b),
    polishedDs: mean(means.polDs),
    polishedGap: Number(polGap.toFixed(2)),
    keptRate: `${out.kept}/${out.polished}`,
    ship: polGap <= rawGap - 0.5 ? 'POLISH SHIPS — gap narrowed ≥0.5' : 'POLISH NOT PROVEN — bar unmet',
    judgeUsd: ledger.totals().usd,
  };
  await writeFile('trellis/researcher/polish-bench.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.verdict, null, 2));
}
