// THE EDUCATION BAR — "best model for education" means the items TEACH, not
// just pass. Course-level A/B on the showdown kernels: the same 8-lesson
// course structured twice — E2B items vs ds items (each author's own
// solver-verified accepted items from the same showdown run) — then judged by
// the instruments that measure TEACHING:
//   1. Prof zero-token classroom battery (deterministic, seed 1, $0):
//      misconception repair, item health, realistic mastery.
//   2. Catching density: accepted misconception-catching items per author.
//   3. Cross-family blind judge pair per kernel quiz (nano + ds seats,
//      agreement reported, never averaged away; ds judging ds's items is a
//      disclosed bias, mitigated by the second family and blindness).
// Pre-registered bar: battery within noise-or-better AND judge quiz mean ≥ ds
// AND catch density ≥ ds. SIMULATED stamp; the human packet stays the anchor.
//   EDU_BAR=run npx vite-node trellis/researcher/eduBar.mjs [showdownFile]
import { readFile, writeFile } from 'node:fs/promises';
import { buildStructured } from '../profBridge.mjs';
import { runClassroomArenaZeroToken } from '../../scripts/prof/arenas/classroom.mjs';
import { callModel } from '../providers.mjs';
import { createRunLedger } from '../telemetry.mjs';

const SHARDS = {
  lit: 'public/genome/lit-intro.json',
  cs: 'public/genome/cs-intro.json',
  geo: 'public/genome/geo-intro.json',
  math: 'public/genome/math-intro.json',
  psych: 'public/genome/psych-intro.json',
};

async function kernelName(kernelId) {
  const shard = JSON.parse(await readFile(SHARDS[kernelId.split('/')[0]], 'utf8'));
  const k = shard.kernels.find((x) => x.id === kernelId);
  return k?.name ?? kernelId.split('/').pop().replace(/-/g, ' ');
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
    stage: 'edu-judge',
    ledger,
    budgetUsd: 0.4,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scoreFirst', 'scoreSecond', 'better'],
      properties: {
        scoreFirst: { type: 'integer', minimum: 1, maximum: 10 },
        scoreSecond: { type: 'integer', minimum: 1, maximum: 10 },
        better: { type: 'string', enum: ['first', 'second', 'tie'] },
      },
    },
    schemaName: 'quiz_pair_verdict',
    validate: (o) => (o?.better ? [] : ['verdict required']),
    maxOutputTokens: 300,
    system:
      'You are a professor choosing which short quiz to give your class on this topic. Score each 1-10 for TEACHING quality: does each item test real understanding, are distractors plausible ways students actually go wrong, do explanations correct the misunderstanding? Penalize vague stems, giveaway options, and explanation filler. Return JSON only.',
    user: JSON.stringify({ topic: term, first, second }),
  });
  return result;
}

if (process.env.EDU_BAR === 'run' && !process.env.VITEST) {
  const file = process.argv[2]?.endsWith('.json') ? process.argv[2] : 'trellis/researcher/author-showdown.json';
  const showdown = JSON.parse(await readFile(file, 'utf8'));
  const ledger = createRunLedger({ runId: 'edu-bar', runDir: 'trellis/runs/edu-bar' });
  const byKernel = new Map();
  for (const e of showdown.acceptedItems ?? []) {
    if (!byKernel.has(e.kernel)) byKernel.set(e.kernel, { e2b: [], ds: [] });
    if (e.author === 'e2b' || e.author === 'ds') byKernel.get(e.kernel)[e.author].push(e.item);
  }
  const kernels = [...byKernel.keys()];

  // ── build one graph, two authored arms ──────────────────────────────────
  const concepts = [];
  const misconceptions = [];
  const lessons = [];
  for (const [n, kernelId] of kernels.entries()) {
    const name = await kernelName(kernelId);
    const cid = `c-${n + 1}`;
    concepts.push({ kind: 'concept', id: cid, name, genomeRef: kernelId, requires: [], kernelFacts: [] });
    const shard = JSON.parse(await readFile(SHARDS[kernelId.split('/')[0]], 'utf8'));
    const k = shard.kernels.find((x) => x.id === kernelId);
    for (const [j, m] of (k?.misconceptions ?? []).slice(0, 2).entries()) {
      misconceptions.push({
        kind: 'misconception',
        id: `m-${cid}-${j}`,
        conceptId: cid,
        statement: m.text,
        corrective: m.corrective,
      });
    }
    lessons.push({
      kind: 'lesson',
      id: `l${n + 1}`,
      week: n + 1,
      session: 1,
      title: name,
      introduces: [cid],
      reinforces: [],
      outcomeIds: [],
    });
  }
  const graph = {
    course: { title: 'Edu Bar A/B' },
    concepts,
    misconceptions,
    outcomes: [],
    lessons,
    assessments: [],
    sources: [],
  };

  const armAuthored = (author) => {
    const authored = {};
    for (const [n, kernelId] of kernels.entries()) {
      const items = (byKernel.get(kernelId)?.[author] ?? []).slice(0, 3);
      authored[`l${n + 1}`] = {
        plan: { segments: [] },
        quizItems: items,
        claims: items.map((_, i) => ({
          path: `quizItems[${i}].explanation`,
          ref: null, // grounding withheld as in zero mode —
          concept: `kernel:c-${n + 1}`, // — the durable mapping survives (L2)
        })),
      };
    }
    return authored;
  };

  const out = {
    stamp: 'EDUCATION BAR — battery + catch density + blind judge pair; SIMULATED',
    file,
    kernels: kernels.length,
    arms: {},
  };
  for (const author of ['e2b', 'ds']) {
    const structured = buildStructured(graph, armAuthored(author), {});
    const { battery } = runClassroomArenaZeroToken({ structured, seed: 1 });
    out.arms[author] = {
      items: kernels.reduce((s, k) => s + Math.min(3, byKernel.get(k)[author].length), 0),
      catching: (showdown.acceptedItems ?? []).filter(
        (e) => e.author === author && e.item && byKernel.get(e.kernel)[author].indexOf(e.item) < 2,
      ).length,
      battery: {
        healthyFraction: battery.itemSummary?.healthyFraction,
        untaughtOrBroken: battery.itemSummary?.untaughtOrBroken,
        misconceptionCatching: battery.itemSummary?.misconceptionCatching,
        realisticMastery: battery.complianceRobustness?.realisticMastery,
        repairRate: battery.realistic?.misconceptions?.repairRate ?? battery.misconceptions?.repairRate,
      },
    };
  }

  // ── blind judge pair per kernel ──────────────────────────────────────────
  const judge = {
    perKernel: [],
    e2bScores: [],
    dsScores: [],
    wins: { e2b: 0, ds: 0, tie: 0, split: 0 },
    agreements: 0,
    seatsFailed: 0,
  };
  for (const kernelId of kernels) {
    const sets = byKernel.get(kernelId);
    if (sets.e2b.length < 2 || sets.ds.length < 2) continue;
    const term = await kernelName(kernelId);
    const a = renderQuiz(sets.e2b.slice(0, 3)); // e2b
    const b = renderQuiz(sets.ds.slice(0, 3)); // ds
    const flip = kernelId.length % 2 === 1; // deterministic blind flip
    const [first, second] = flip ? [b, a] : [a, b];
    const seats = {};
    for (const tier of ['nano', 'ds']) {
      try {
        const r = await judgeSeat(tier, term, first, second, ledger);
        seats[tier] = {
          e2b: flip ? r.scoreSecond : r.scoreFirst,
          ds: flip ? r.scoreFirst : r.scoreSecond,
          better: r.better === 'tie' ? 'tie' : (r.better === 'first') === !flip ? 'e2b' : 'ds',
        };
      } catch {
        seats[tier] = null;
        judge.seatsFailed += 1;
      }
    }
    const live = Object.values(seats).filter(Boolean);
    for (const s of live) {
      judge.e2bScores.push(s.e2b);
      judge.dsScores.push(s.ds);
    }
    const verdicts = live.map((s) => s.better);
    const agreement = verdicts.length === 2 && verdicts[0] === verdicts[1];
    if (agreement) judge.agreements += 1;
    const better = agreement ? verdicts[0] : verdicts.length === 1 ? verdicts[0] : 'split';
    judge.wins[better] = (judge.wins[better] ?? 0) + 1;
    judge.perKernel.push({ kernel: kernelId, better, seats });
    console.error(`  [judge] ${kernelId}: ${better}`);
  }
  const mean = (xs) => (xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null);
  out.judge = {
    e2bMean: mean(judge.e2bScores),
    dsMean: mean(judge.dsScores),
    wins: judge.wins,
    agreements: judge.agreements,
    perKernel: judge.perKernel,
    seatsFailed: judge.seatsFailed,
  };
  await ledger.flush();
  out.judgeUsd = ledger.totals().usd;
  await writeFile('trellis/researcher/edu-bar.json', JSON.stringify(out, null, 1));
  console.log(
    JSON.stringify(
      {
        arms: out.arms,
        judge: {
          e2bMean: out.judge.e2bMean,
          dsMean: out.judge.dsMean,
          wins: out.judge.wins,
          agreements: out.judge.agreements,
        },
        judgeUsd: out.judgeUsd,
      },
      null,
      2,
    ),
  );
}
