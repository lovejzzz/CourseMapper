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
  { id: 'bench/photosynthesis', term: 'photosynthesis', discipline: 'bio', queries: ['Photosynthesis'] },
  { id: 'bench/cognitive-dissonance', term: 'cognitive dissonance', discipline: 'psych', queries: ['Cognitive dissonance'] },
  { id: 'bench/opportunity-cost', term: 'opportunity cost', discipline: 'econ', queries: ['Opportunity cost'] },
  { id: 'bench/natural-selection', term: 'natural selection', discipline: 'bio', queries: ['Natural selection'] },
  { id: 'bench/french-revolution', term: 'the French Revolution', discipline: 'history', queries: ['French Revolution'] },
  { id: 'bench/electromagnetic-induction', term: 'electromagnetic induction', discipline: 'physics', queries: ['Electromagnetic induction'] },
];

const SURFACE_COUNT = 9; // teach, worked, reteach, guide, discussion, activity, 2×faq, slides

// Two seats, two model FAMILIES (openai nano + deepseek flash), blind,
// per-target shuffle. Trust = agreement is reported, never averaged away.
async function judgeSeat(tier, term, first, second, ledger) {
  const { result } = await callModel({
    tier,
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
  return result;
}

async function judgePair(term, a, b, ledger) {
  const flip = Math.random() < 0.5;
  const first = flip ? b : a;
  const second = flip ? a : b;
  const seats = {};
  for (const tier of ['nano', 'ds']) {
    try {
      const result = await judgeSeat(tier, term, first, second, ledger);
      seats[tier] = {
        zeroScore: flip ? result.scoreFirst : result.scoreSecond,
        paidScore: flip ? result.scoreSecond : result.scoreFirst,
        better: result.better === 'tie' ? 'tie' : (result.better === 'first') === flip ? 'zero' : 'paid',
      };
    } catch {
      seats[tier] = null; // failed seat stays visible, never silently dropped
    }
  }
  const verdicts = Object.values(seats).filter(Boolean).map((s) => s.better);
  const agreement = verdicts.length === 2 && verdicts[0] === verdicts[1];
  const better = agreement ? verdicts[0] : verdicts.length === 1 ? verdicts[0] : 'split';
  const mean = (k) => {
    const xs = Object.values(seats).filter(Boolean).map((s) => s[k]);
    return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null;
  };
  return { zeroScore: mean('zeroScore'), paidScore: mean('paidScore'), better, agreement, seats };
}

if (process.env.RESEARCH_BENCH === 'run' && !process.env.VITEST) {
  const ledger = createRunLedger({ runId: 'researcher-zero-bench', runDir: 'trellis/runs/researcher-zero-bench' });
  const embedder = makeEmbedder();
  const rows = [];
  const totals = { zeroMs: 0, paidMs: 0, zeroSurfaces: 0, paidSurfaces: 0, zeroFacts: 0, paidFactsKept: 0, paidFactsDropped: 0, wins: { zero: 0, paid: 0, tie: 0, split: 0 }, agreements: 0, zeroJudge: [], paidJudge: [], corroborated: 0, litMisconceptions: 0 };
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
      totals.wins[judge.better] = (totals.wins[judge.better] ?? 0) + 1;
      if (judge.agreement) totals.agreements += 1;
      totals.corroborated += zKernel.facts.filter((f) => f.verifiedBy >= 1).length;
      totals.litMisconceptions += zKernel.misconceptions.filter((m) => m.documentedIn).length;
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
    stamp: 'SIMULATED — two judge seats across model families (openai+deepseek), blind, per-target shuffle; agreement reported, never averaged away; gates are the hard instrument',
    targets: rows.length,
    speed: { zeroSecPerKernel: (totals.zeroMs / rows.length / 1000).toFixed(1), paidSecPerKernel: (totals.paidMs / rows.length / 1000).toFixed(1) },
    surfaces: { zero: totals.zeroSurfaces, paid: totals.paidSurfaces, of: rows.length * SURFACE_COUNT },
    facts: { zero: totals.zeroFacts, paidKept: totals.paidFactsKept, paidDroppedUnanchored: totals.paidFactsDropped },
    judge: { zeroMean: mean(totals.zeroJudge), paidMean: mean(totals.paidJudge), wins: totals.wins, seatAgreement: `${totals.agreements}/${rows.length}` },
    truth: { corroboratedFacts: totals.corroborated, ofFacts: totals.zeroFacts, literatureMisconceptions: totals.litMisconceptions },
    rows,
  };
  await writeFile('trellis/researcher/zero-bench.json', JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
}
