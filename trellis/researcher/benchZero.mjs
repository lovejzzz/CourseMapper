// Researcher-Zero bench — speed + accuracy vs the paid shaper, SAME
// sources, six fresh cross-discipline targets. Nothing is deposited;
// this is a sandbox measurement. The paid side spends cents (ledgered);
// the zero side must ledger $0.00 by construction.
//
//   RESEARCH_BENCH=run npx vite-node trellis/researcher/benchZero.mjs

import { writeFile } from 'node:fs/promises';
import { createRunLedger } from '../telemetry.mjs';
import { callModel } from '../providers.mjs';
import { gatherSources } from './sources.mjs';
import { shapeKernel, shapeSurfaces, anchorQuote } from './shape.mjs';
import { zeroShapeKernel, zeroShapeSurfaces } from './zeroShape.mjs';
import { makeEmbedder } from '../tendril/embedder.mjs';
import { stopS } from '../tendril/sModel.mjs';

const TARGETS = [
  { id: 'bench/epistemology', term: 'epistemology', discipline: 'philosophy', queries: ['Epistemology'] },
  { id: 'bench/operant-conditioning', term: 'operant conditioning', discipline: 'psych', queries: ['Operant conditioning'] },
  { id: 'bench/plate-tectonics', term: 'plate tectonics', discipline: 'geo', queries: ['Plate tectonics'] },
  { id: 'bench/supply-and-demand', term: 'supply and demand', discipline: 'econ', queries: ['Supply and demand'] },
  { id: 'bench/mitosis', term: 'mitosis', discipline: 'bio', queries: ['Mitosis'] },
  { id: 'bench/redshift', term: 'redshift', discipline: 'astro', queries: ['Redshift'] },
];

const SURFACE_COUNT = 9; // teach, worked, reteach, guide, discussion, activity, 2×faq, slides

async function judgePair(term, a, b, ledger) {
  // Blind A/B, cross-family seat: which teach-segment+facts would you
  // rather teach from? Sides are shuffled per target.
  const flip = Math.random() < 0.5;
  const first = flip ? b : a;
  const second = flip ? a : b;
  const { result } = await callModel({
    tier: 'ds',
    stage: 'bench-judge',
    ledger,
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
    schemaName: 'pair_verdict',
    validate: (o) => (o?.better ? [] : ['verdict required']),
    maxOutputTokens: 400,
    system:
      'You are a professor deciding which of two drafts to teach from. Score each 1-10 for teach-as-is quality (clarity, accuracy, teachability — penalize stitched/choppy prose AND vague filler equally). Return JSON only.',
    user: JSON.stringify({ topic: term, first, second }),
  });
  const zeroScore = flip ? result.scoreFirst : result.scoreSecond;
  const paidScore = flip ? result.scoreSecond : result.scoreFirst;
  const better = result.better === 'tie' ? 'tie' : (result.better === 'first') === flip ? 'zero' : 'paid';
  return { zeroScore, paidScore, better };
}

if (process.env.RESEARCH_BENCH === 'run' && !process.env.VITEST) {
  const ledger = createRunLedger({ runId: 'researcher-zero-bench', runDir: 'trellis/runs/researcher-zero-bench' });
  const embedder = makeEmbedder();
  const rows = [];
  const totals = { zeroMs: 0, paidMs: 0, zeroSurfaces: 0, paidSurfaces: 0, zeroFacts: 0, paidFactsKept: 0, paidFactsDropped: 0, wins: { zero: 0, paid: 0, tie: 0 }, zeroJudge: [], paidJudge: [] };
  try {
    for (const target of TARGETS) {
      const sources = await gatherSources(target.queries, { cap: 2 });
      if (sources.length === 0) {
        rows.push({ target: target.id, verdict: 'NO SOURCES' });
        continue;
      }
      // zero side ($0, local)
      const z0 = performance.now();
      const zKernel = await zeroShapeKernel(target, sources, { embedder });
      const zSurf = await zeroShapeSurfaces(target, sources, zKernel, { embedder });
      const zeroMs = performance.now() - z0;
      // verify RS-1 empirically even though it holds by construction
      const zeroAnchored = zKernel.facts.every((f) => anchorQuote(f.anchor.quote, sources));
      // paid side (ds)
      const p0 = performance.now();
      const pKernel = await shapeKernel(target, sources, { ledger, budgetUsd: 0.2 });
      const pSurf = await shapeSurfaces(target, sources, pKernel, { ledger, budgetUsd: 0.2 });
      const paidMs = performance.now() - p0;

      const zTeach = zSurf.assets.find((a) => a.move === 'teach-segment')?.body.text ?? '(none)';
      const pTeach = pSurf.assets.find((a) => a.move === 'teach-segment')?.body.text ?? '(none)';
      const judge = await judgePair(target.term, { teach: zTeach }, { teach: pTeach }, ledger);

      totals.zeroMs += zeroMs;
      totals.paidMs += paidMs;
      totals.zeroSurfaces += zSurf.assets.length;
      totals.paidSurfaces += pSurf.assets.length;
      totals.zeroFacts += zKernel.facts.length;
      totals.paidFactsKept += pKernel.facts.length;
      totals.paidFactsDropped += pKernel.droppedFacts;
      totals.wins[judge.better] += 1;
      totals.zeroJudge.push(judge.zeroScore);
      totals.paidJudge.push(judge.paidScore);
      rows.push({
        target: target.id,
        zero: { ms: Math.round(zeroMs), facts: zKernel.facts.length, misconceptionsMined: zKernel.misconceptions.length, surfaces: `${zSurf.assets.length}/${SURFACE_COUNT}`, anchored: zeroAnchored, skin: zSurf.skin, rejected: zSurf.rejected },
        paid: { ms: Math.round(paidMs), factsKept: pKernel.facts.length, factsDropped: pKernel.droppedFacts, surfaces: `${pSurf.assets.length}/${SURFACE_COUNT}`, rejected: pSurf.rejected },
        judge,
      });
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  const mean = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null);
  const summary = {
    stamp: 'SIMULATED — single cross-family judge seat, advisory; gates are the hard instrument',
    targets: rows.length,
    speed: { zeroSecPerKernel: (totals.zeroMs / rows.length / 1000).toFixed(1), paidSecPerKernel: (totals.paidMs / rows.length / 1000).toFixed(1) },
    surfaces: { zero: totals.zeroSurfaces, paid: totals.paidSurfaces, of: rows.length * SURFACE_COUNT },
    facts: { zero: totals.zeroFacts, paidKept: totals.paidFactsKept, paidDroppedUnanchored: totals.paidFactsDropped },
    judge: { zeroMean: mean(totals.zeroJudge), paidMean: mean(totals.paidJudge), wins: totals.wins },
    rows,
  };
  await writeFile('trellis/researcher/zero-bench.json', JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
}
