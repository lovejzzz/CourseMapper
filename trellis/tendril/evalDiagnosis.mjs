// T-M1c eval — typed-answer diagnosis accuracy, leakage-safe (TENDRIL.md §10).
// Three measurements, reported together and saved to cache/diagnosis-eval.json:
//
//   1. LOO discrimination — held-out distractor texts on 2-family kernels;
//      the query AND its near-duplicates (>0.7 token overlap) leave the
//      index before scoring, so twins cannot inflate accuracy.
//   2. Paraphrase generalization — ds-tier writes student-style wrong
//      answers (never indexed; FROZEN in cache after first generation so
//      re-runs are $0 and the set is a stable ruler).
//   3. Null rejection — correct-option texts must NOT diagnose; a tutor
//      that fires correctives at right answers is worse than a quiz.
//
// Exit bar (TENDRIL.md T-M1c): ≥80% family accuracy. Below → Tendril-D.
//
//   node trellis/tendril/evalDiagnosis.mjs

import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tokenOverlapRatio } from '../judgment/text.mjs';
import { claimTokens } from '../knowledge/bankGapFill.mjs';
import { callModel } from '../providers.mjs';
import { createRunLedger } from '../telemetry.mjs';
import { cachedEmbed, makeEmbedder } from './embedder.mjs';
import { exemplarsFromBank, buildDiagnosisIndex, diagnose } from './diagnose.mjs';

const PARAPHRASE_CACHE = 'trellis/tendril/cache/paraphrase-eval.json';
const CORRECT_CACHE = 'trellis/tendril/cache/correct-paraphrase-eval.json';
const MAX_PARAPHRASE_KERNELS = 60;
const THRESHOLDS = [0.35, 0.45, 0.55];
const MARGINS = [0, 0.03, 0.05, 0.08];

// First bank item per (kernel × family) — the Tutor's item context — plus
// the kernel-wide correct surfaces (every item's correct option, every
// explanation) as candidate null exemplars.
// minCorrectLen — R4: the ≥8 default silently excluded bare-numeral
// correct options ("5") from every context, which is exactly the class
// the live Tutor false-fired on. The v1 FROZEN correct-answer set was
// generated under the strict rule, so v1 evaluation must resolve
// contexts with minCorrectLen=8 (same items as generation); the relaxed
// contexts serve the wrong-side and the additive v2 short-option set.
function itemContextFor(bank, { minCorrectLen = 1 } = {}) {
  const byKernel = new Map();
  const kernelNulls = new Map();
  for (const item of bank.items) {
    if (!item.familyKey) continue;
    if (!byKernel.has(item.kernelId)) byKernel.set(item.kernelId, new Map());
    if (!kernelNulls.has(item.kernelId)) kernelNulls.set(item.kernelId, { corrects: [], explanations: [] });
    const families = byKernel.get(item.kernelId);
    const nulls = kernelNulls.get(item.kernelId);
    const correctText = item.options?.[item.correctIndex];
    if (typeof correctText === 'string' && correctText.length >= minCorrectLen) {
      if (correctText.length >= 8) nulls.corrects.push(correctText);
      if (!families.has(item.familyKey)) {
        families.set(item.familyKey, {
          correctText,
          stem: item.stem,
          itemId: item.id,
          explanation: typeof item.explanation === 'string' ? item.explanation : null,
          distractors: (item.options ?? []).filter((_, i) => i !== item.correctIndex),
        });
      }
    }
    if (typeof item.explanation === 'string' && item.explanation.length >= 8) {
      nulls.explanations.push(item.explanation);
    }
  }
  return { byKernel, kernelNulls };
}

function twoFamilyKernels(byKernel) {
  return [...byKernel.entries()].filter(([, exemplars]) => new Set(exemplars.map((e) => e.family)).size === 2);
}

// --- 1. LOO discrimination ------------------------------------------------

async function evalLoo(bank, embedder) {
  const byKernel = exemplarsFromBank(bank);
  const vectors = await cachedEmbed(
    [...byKernel.values()].flat().map((e) => e.text),
    { name: 'diagnosis-exemplars', embedder },
  );
  let i = 0;
  for (const exemplars of byKernel.values()) for (const e of exemplars) e.vector = vectors[i++];

  // Two label regimes, reported side by side. "all" queries every held-out
  // distractor — but items carry three wrong options of which only some
  // EXPRESS the keyed family (the others are plausible fillers), so those
  // labels are noisy by construction. "catching" filters queries to
  // distractors sharing ≥half of the family's claim tokens — the standing
  // matcher's own notion of expressing the belief — for clean labels.
  const tally = { all: { correct: 0, total: 0 }, catching: { correct: 0, total: 0 } };
  const byDiscipline = {};
  for (const [kernelId, exemplars] of twoFamilyKernels(byKernel)) {
    const families = [...new Set(exemplars.map((e) => e.family))];
    for (const family of families) {
      const tokens = claimTokens(family);
      const queries = exemplars.filter((e) => e.family === family && e.source === 'distractor').slice(0, 2);
      for (const query of queries) {
        const reduced = exemplars.filter((e) => e !== query && tokenOverlapRatio(e.text, query.text) <= 0.7);
        const reducedFamilies = new Set(reduced.map((e) => e.family));
        if (reducedFamilies.size < 2) continue; // nothing left to discriminate against
        const index = { byKernel: new Map([[kernelId, reduced]]), embedder };
        const verdict = await diagnose(index, kernelId, query.text, { threshold: 0, queryVector: query.vector });
        const hit = verdict.family === family;
        const queryTokens = new Set(claimTokens(query.text));
        const catching = tokens.filter((t) => queryTokens.has(t)).length >= Math.ceil(tokens.length / 2);
        tally.all.total += 1;
        if (hit) tally.all.correct += 1;
        if (catching) {
          tally.catching.total += 1;
          if (hit) tally.catching.correct += 1;
        }
        const disc = kernelId.split('/')[0];
        byDiscipline[disc] = byDiscipline[disc] ?? { correct: 0, total: 0 };
        byDiscipline[disc].total += 1;
        if (hit) byDiscipline[disc].correct += 1;
      }
    }
  }
  return {
    all: { ...tally.all, accuracy: tally.all.correct / tally.all.total },
    catching: { ...tally.catching, accuracy: tally.catching.correct / Math.max(1, tally.catching.total) },
    byDiscipline,
  };
}

// --- 2. Paraphrase generalization ------------------------------------------

// Socket-level failures (ECONNRESET mid-response) throw past the provider's
// HTTP-status backoff; one local retry, then skip the batch, disclosed.
async function withNetworkRetry(fn, attempts = 2) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === attempts) {
        console.error(`batch skipped after ${attempts} attempts: ${String(error?.cause ?? error).slice(0, 120)}`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
  return null;
}

async function loadOrGenerateParaphrases(bank, ledger) {
  if (existsSync(PARAPHRASE_CACHE)) {
    return JSON.parse(await readFile(PARAPHRASE_CACHE, 'utf8'));
  }
  const byKernel = exemplarsFromBank(bank);
  const kernels = twoFamilyKernels(byKernel)
    .slice(0, MAX_PARAPHRASE_KERNELS)
    .map(([kernelId, exemplars]) => {
      const families = [...new Set(exemplars.map((e) => e.family))];
      return {
        kernelId,
        families: families.map((family) => ({
          family,
          sampleDistractor: exemplars.find((e) => e.family === family && e.source === 'distractor')?.text ?? null,
        })),
      };
    });
  const generated = [];
  const skipped = [];
  const BATCH = 10;
  for (let i = 0; i < kernels.length; i += BATCH) {
    const batch = kernels.slice(i, i + BATCH);
    const result = await withNetworkRetry(() => callModel({
      tier: 'ds',
      stage: 'paraphrase-eval',
      ledger,
      system:
        'You simulate students who hold specific misconceptions. For each misconception you receive, write exactly 2 short typed quiz answers (8-25 words) a real student holding that WRONG belief would type. Casual student language, occasional imprecision. Do NOT copy the misconception statement or the sample answer — express the same wrong belief in fresh words. Return JSON only.',
      user: JSON.stringify({
        instructions:
          'Return {"kernels":[{"kernelId":"...","families":[{"family":"<verbatim family key>","answers":["...","..."]}]}]} covering every kernel and family given.',
        kernels: batch,
      }),
      schema: {
        type: 'object',
        properties: {
          kernels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kernelId: { type: 'string' },
                families: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      family: { type: 'string' },
                      answers: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['family', 'answers'],
                  },
                },
              },
              required: ['kernelId', 'families'],
            },
          },
        },
        required: ['kernels'],
      },
      schemaName: 'paraphrases',
      validate: (out) => (Array.isArray(out?.kernels) && out.kernels.length > 0 ? [] : ['kernels array required']),
    }));
    if (result) generated.push(...result.result.kernels);
    else skipped.push(...batch.map((k) => k.kernelId));
  }
  const frozen = {
    stamp: 'FROZEN eval set — regenerating changes the ruler; delete only with a version note',
    skipped, // batches lost to persistent network failure, disclosed
    generated,
  };
  await mkdir('trellis/tendril/cache', { recursive: true });
  await writeFile(PARAPHRASE_CACHE, JSON.stringify(frozen, null, 1));
  return frozen;
}

async function evalParaphrases(bank, embedder, ledger) {
  const { generated } = await loadOrGenerateParaphrases(bank, ledger);
  const index = await buildDiagnosisIndex(bank, { embedder });
  const queries = [];
  for (const kernel of generated) {
    const known = new Set((index.byKernel.get(kernel.kernelId) ?? []).map((e) => e.family));
    for (const fam of kernel.families ?? []) {
      if (!known.has(fam.family)) continue; // model echoed a family key imperfectly — skip, disclosed via counts
      for (const answer of (fam.answers ?? []).slice(0, 2)) {
        if (typeof answer === 'string' && answer.length >= 8) {
          queries.push({ kernelId: kernel.kernelId, family: fam.family, answer });
        }
      }
    }
  }
  const vectors = await cachedEmbed(
    queries.map((q) => q.answer),
    { name: 'paraphrase-queries', embedder },
  );
  const perThreshold = {};
  for (const threshold of THRESHOLDS) {
    let correct = 0;
    let abstained = 0;
    for (let i = 0; i < queries.length; i += 1) {
      const verdict = await diagnose(index, queries[i].kernelId, queries[i].answer, {
        threshold,
        queryVector: vectors[i],
      });
      if (verdict.family === null) abstained += 1;
      else if (verdict.family === queries[i].family) correct += 1;
    }
    perThreshold[threshold] = {
      correct,
      abstained,
      total: queries.length,
      accuracy: correct / queries.length,
      accuracyWhenFired: correct / Math.max(1, queries.length - abstained),
    };
  }
  return { queries: queries.length, perThreshold };
}

// --- 2b. Correct-answer paraphrases (fair negatives for contrastive mode) ---

async function loadOrGenerateCorrectParaphrases(bank, ledger) {
  if (existsSync(CORRECT_CACHE)) {
    return JSON.parse(await readFile(CORRECT_CACHE, 'utf8'));
  }
  // Strict rule pins generation to the same items v1 evaluation resolves.
  const contexts = itemContextFor(bank, { minCorrectLen: 8 }).byKernel;
  const byKernel = exemplarsFromBank(bank);
  const targets = twoFamilyKernels(byKernel)
    .slice(0, MAX_PARAPHRASE_KERNELS)
    .flatMap(([kernelId]) => {
      const families = contexts.get(kernelId);
      if (!families) return [];
      const [family, ctx] = [...families.entries()][0];
      return [{ kernelId, family, stem: ctx.stem, correct: ctx.correctText }];
    });
  const generated = [];
  const skipped = [];
  const BATCH = 10;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const result = await withNetworkRetry(() =>
      callModel({
        tier: 'ds',
        stage: 'correct-paraphrase-eval',
        ledger,
        system:
          'You simulate students who UNDERSTAND a concept correctly. For each quiz question and its correct answer, write exactly 2 short typed answers (8-25 words) a student who genuinely gets it would type. Casual student language. Do NOT copy the correct answer text — express the same correct idea in fresh words. Return JSON only.',
        user: JSON.stringify({
          instructions:
            'Return {"kernels":[{"kernelId":"...","answers":["...","..."]}]} covering every kernel given.',
          kernels: batch,
        }),
        schema: {
          type: 'object',
          properties: {
            kernels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kernelId: { type: 'string' },
                  answers: { type: 'array', items: { type: 'string' } },
                },
                required: ['kernelId', 'answers'],
              },
            },
          },
          required: ['kernels'],
        },
        schemaName: 'correctParaphrases',
        validate: (out) => (Array.isArray(out?.kernels) && out.kernels.length > 0 ? [] : ['kernels array required']),
      }),
    );
    if (result) generated.push(...result.result.kernels);
    else skipped.push(...batch.map((t) => t.kernelId));
  }
  const frozen = {
    stamp: 'FROZEN eval set — regenerating changes the ruler; delete only with a version note',
    skipped,
    generated,
  };
  await mkdir('trellis/tendril/cache', { recursive: true });
  await writeFile(CORRECT_CACHE, JSON.stringify(frozen, null, 1));
  return frozen;
}

// --- 2b2. Short-option correct answers (v2, ADDITIVE frozen set) -------------
// The v1 set could not cover bare-numeral items (generation excluded them).
// v2 is self-contained: each entry pins its item surfaces at generation
// time, so evaluation never depends on context-resolution rules again.

const SHORT_CORRECT_CACHE = 'trellis/tendril/cache/correct-paraphrase-eval-v2-short.json';

async function loadOrGenerateShortCorrectParaphrases(bank, ledger) {
  if (existsSync(SHORT_CORRECT_CACHE)) {
    return JSON.parse(await readFile(SHORT_CORRECT_CACHE, 'utf8'));
  }
  const relaxed = itemContextFor(bank).byKernel;
  const targets = [];
  for (const [kernelId, families] of relaxed) {
    const [, ctx] = [...families.entries()][0];
    if (ctx.correctText.length < 25 && targets.length < 40) {
      targets.push({
        kernelId,
        stem: ctx.stem,
        correct: ctx.correctText,
        explanation: ctx.explanation,
        distractors: ctx.distractors,
      });
    }
  }
  const generated = [];
  const skipped = [];
  const BATCH = 10;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const result = await withNetworkRetry(() =>
      callModel({
        tier: 'ds',
        stage: 'short-correct-paraphrase-eval',
        ledger,
        system:
          'You simulate students who UNDERSTAND a concept correctly. For each quiz question, its short correct answer, and the explanation of why it is correct, write exactly 2 short typed answers (8-25 words) a student who genuinely gets it would type — they state the answer AND the correct reason in casual student words. Do NOT copy the explanation text. Return JSON only.',
        user: JSON.stringify({
          instructions: 'Return {"kernels":[{"kernelId":"...","answers":["...","..."]}]} covering every kernel given.',
          kernels: batch.map(({ kernelId, stem, correct, explanation }) => ({ kernelId, stem, correct, explanation })),
        }),
        schema: {
          type: 'object',
          properties: {
            kernels: {
              type: 'array',
              items: {
                type: 'object',
                properties: { kernelId: { type: 'string' }, answers: { type: 'array', items: { type: 'string' } } },
                required: ['kernelId', 'answers'],
              },
            },
          },
          required: ['kernels'],
        },
        schemaName: 'shortCorrectParaphrases',
        validate: (out) => (Array.isArray(out?.kernels) && out.kernels.length > 0 ? [] : ['kernels array required']),
      }),
    );
    if (result) {
      const byId = new Map(batch.map((t) => [t.kernelId, t]));
      for (const k of result.result.kernels) {
        const ctx = byId.get(k.kernelId);
        if (ctx) generated.push({ ...ctx, answers: (k.answers ?? []).slice(0, 2) });
      }
    } else skipped.push(...batch.map((t) => t.kernelId));
  }
  const frozen = {
    stamp: 'FROZEN v2 (short-option class) — self-contained item surfaces; additive to v1, never replaces it',
    skipped,
    generated,
  };
  await mkdir('trellis/tendril/cache', { recursive: true });
  await writeFile(SHORT_CORRECT_CACHE, JSON.stringify(frozen, null, 1));
  return frozen;
}

// --- 2c. Contrastive eval — the deployment configuration ---------------------
// Family paraphrases must fire their family; correct paraphrases must fire
// nothing. Both run with the item's correct answer as nullVectors.

async function evalContrastive(bank, embedder, ledger) {
  const index = await buildDiagnosisIndex(bank, { embedder });
  const { byKernel: contexts, kernelNulls } = itemContextFor(bank); // relaxed: wrong side + deployed
  const strictContexts = itemContextFor(bank, { minCorrectLen: 8 }).byKernel; // v1 correct-set resolution
  const { generated: wrongSet } = await loadOrGenerateParaphrases(bank, ledger);
  const { generated: correctSet } = await loadOrGenerateCorrectParaphrases(bank, ledger);
  const { generated: shortCorrectSet } = await loadOrGenerateShortCorrectParaphrases(bank, ledger);

  const wrongQueries = [];
  for (const kernel of wrongSet) {
    const known = contexts.get(kernel.kernelId);
    if (!known) continue;
    for (const fam of kernel.families ?? []) {
      const ctx = known.get(fam.family);
      if (!ctx) continue;
      for (const answer of (fam.answers ?? []).slice(0, 2)) {
        if (typeof answer === 'string' && answer.length >= 8) {
          wrongQueries.push({ kernelId: kernel.kernelId, family: fam.family, answer, correctText: ctx.correctText, ctx });
        }
      }
    }
  }
  const correctQueries = [];
  for (const kernel of correctSet) {
    const known = strictContexts.get(kernel.kernelId);
    if (!known) continue;
    const [, ctx] = [...known.entries()][0];
    for (const answer of (kernel.answers ?? []).slice(0, 2)) {
      if (typeof answer === 'string' && answer.length >= 8) {
        correctQueries.push({ kernelId: kernel.kernelId, answer, correctText: ctx.correctText, ctx });
      }
    }
  }

  // Three null-exemplar configurations, one embedding pass:
  //   item      — the answered item's correct option only
  //   corrects  — every correct option on the kernel's shelf
  //   +expl     — corrects plus item explanations (typed-answer register,
  //               at the risk that explanations restate the misconception)
  const nullTextsFor = (kernelId, correctText, mode) => {
    const nulls = kernelNulls.get(kernelId) ?? { corrects: [], explanations: [] };
    if (mode === 'item') return [correctText];
    if (mode === 'corrects') return [...new Set([correctText, ...nulls.corrects])];
    return [...new Set([correctText, ...nulls.corrects, ...nulls.explanations])];
  };
  const MODES = ['item', 'corrects', 'corrects+expl'];

  const allTexts = [
    ...wrongQueries.map((q) => q.answer),
    ...correctQueries.map((q) => q.answer),
    ...[...kernelNulls.values()].flatMap((n) => [...n.corrects, ...n.explanations]),
    ...wrongQueries.map((q) => q.correctText),
    ...correctQueries.map((q) => q.correctText),
    ...[...wrongQueries, ...correctQueries].flatMap((q) => q.ctx.distractors ?? []),
    ...[...wrongQueries, ...correctQueries].map((q) => q.ctx.explanation).filter(Boolean),
    ...wrongQueries.map((q) => q.family).filter(Boolean),
  ];
  const vectors = await cachedEmbed(allTexts, { name: 'contrastive-eval', embedder });
  const vecOf = new Map(allTexts.map((t, i) => [t, vectors[i]]));

  // Fourth formulation — 'item-options': grade the typed answer against the
  // answered ITEM's own surfaces (its distractors vs its correct option).
  // Register-matched by construction; the kernel-wide exemplars stay out.
  const itemOptionsEval = (queries, expectFire, mode = 'plain') => {
    const perMargin = {};
    for (const margin of MARGINS) {
      let fired = 0;
      let right = 0;
      for (const q of queries) {
        const ctx = q.ctx;
        // 'expl' adds the explanation always; 'deployed' adds it ONLY for
        // short correct options (<25 chars) and escalates their margin to
        // 0.05 — the Tutor's shipped rule (R4). 'deployed2*' additionally
        // puts the FAMILY STATEMENT on the wrong side for short items —
        // numeral items have numeral distractors, so without it neither
        // side of the contrast carries any semantics.
        const short = ctx.correctText.length < 25;
        const wrongTexts = [...ctx.distractors];
        if (mode.startsWith('deployed2') && short && q.family && vecOf.has(q.family)) wrongTexts.push(q.family);
        const wrongTop = Math.max(...wrongTexts.map((d) => (vecOf.has(d) ? Number(cosineOf(q.answer, d)) : -1)), -1);
        const useExpl = mode === 'expl' || (mode.startsWith('deployed') && short);
        const nullTop = Math.max(
          cosineOf(q.answer, ctx.correctText),
          useExpl && ctx.explanation ? cosineOf(q.answer, ctx.explanation) : -1,
        );
        const effMargin =
          (mode === 'deployed' || mode === 'deployed2') && short ? Math.max(margin, 0.05) : margin;
        const fires = wrongTop >= 0.35 && wrongTop > nullTop + effMargin;
        if (fires) {
          fired += 1;
          if (expectFire) right += 1; // the item has ONE family; firing names it
        }
      }
      perMargin[margin] = expectFire
        ? { total: queries.length, firedRight: right, familyAccuracy: right / queries.length }
        : { total: queries.length, falseFires: fired, falseFireRate: fired / Math.max(1, queries.length) };
    }
    return perMargin;
  };
  const cosineOf = (a, b) => {
    const va = vecOf.get(a);
    const vb = vecOf.get(b);
    if (!va || !vb) return -1;
    let dot = 0;
    for (let i = 0; i < va.length; i += 1) dot += va[i] * vb[i];
    return dot;
  };

  const byMode = {};
  for (const mode of MODES) {
    const perMargin = {};
    for (const margin of MARGINS) {
      let fired = 0;
      let correctFamily = 0;
      for (const q of wrongQueries) {
        const verdict = await diagnose(index, q.kernelId, q.answer, {
          threshold: 0.35,
          margin,
          queryVector: vecOf.get(q.answer),
          nullVectors: nullTextsFor(q.kernelId, q.correctText, mode).map((t) => vecOf.get(t)),
        });
        if (verdict.family !== null) {
          fired += 1;
          if (verdict.family === q.family) correctFamily += 1;
        }
      }
      let falseFires = 0;
      for (const q of correctQueries) {
        const verdict = await diagnose(index, q.kernelId, q.answer, {
          threshold: 0.35,
          margin,
          queryVector: vecOf.get(q.answer),
          nullVectors: nullTextsFor(q.kernelId, q.correctText, mode).map((t) => vecOf.get(t)),
        });
        if (verdict.family !== null) falseFires += 1;
      }
      perMargin[margin] = {
        wrong: {
          total: wrongQueries.length,
          firedRight: correctFamily,
          familyAccuracy: correctFamily / wrongQueries.length,
          accuracyWhenFired: correctFamily / Math.max(1, fired),
        },
        correct: {
          total: correctQueries.length,
          falseFires,
          falseFireRate: falseFires / Math.max(1, correctQueries.length),
        },
      };
    }
    byMode[mode] = perMargin;
  }
  const itemOptions = {};
  const itemOptionsExpl = {};
  for (const margin of MARGINS) {
    itemOptions[margin] = {
      wrong: itemOptionsEval(wrongQueries, true)[margin],
      correct: itemOptionsEval(correctQueries, false)[margin],
    };
    itemOptionsExpl[margin] = {
      wrong: itemOptionsEval(wrongQueries, true, 'expl')[margin],
      correct: itemOptionsEval(correctQueries, false, 'expl')[margin],
    };
  }
  byMode['item-options'] = itemOptions;
  byMode['item-options+expl'] = itemOptionsExpl;

  // DEPLOYED config (R4): margin 0 base (short-option escalation inside),
  // wrong side on relaxed contexts, v1 correct set, and the v2
  // short-option correct class measured separately.
  const familyOf = (entry) =>
    bank.items.find(
      (i) => i.kernelId === entry.kernelId && i.stem === entry.stem && i.options?.[i.correctIndex] === entry.correct,
    )?.familyKey ?? null;
  const shortCorrectQueries = shortCorrectSet.flatMap((entry) =>
    (entry.answers ?? [])
      .filter((a) => typeof a === 'string' && a.length >= 8)
      .map((answer) => ({
        kernelId: entry.kernelId,
        answer,
        correctText: entry.correct,
        family: familyOf(entry),
        ctx: { correctText: entry.correct, explanation: entry.explanation, distractors: entry.distractors },
      })),
  );
  const shortTexts = shortCorrectQueries
    .flatMap((q) => [q.answer, q.ctx.correctText, q.ctx.explanation ?? '', q.family ?? '', ...(q.ctx.distractors ?? [])])
    .filter(Boolean);
  const shortVecs = await cachedEmbed(shortTexts, { name: 'contrastive-eval', embedder });
  shortTexts.forEach((t, i) => vecOf.set(t, shortVecs[i]));
  const shortWrong = wrongQueries.filter((q) => q.ctx.correctText.length < 25);
  byMode['deployed'] = {
    0: {
      wrong: itemOptionsEval(wrongQueries, true, 'deployed')[0],
      correct: itemOptionsEval(correctQueries, false, 'deployed')[0],
    },
  };
  byMode['deployed-short-class'] = {
    0: {
      wrong: itemOptionsEval(shortWrong, true, 'deployed')[0],
      correct: itemOptionsEval(shortCorrectQueries, false, 'deployed')[0],
    },
  };
  byMode['item-options-short-class'] = {
    0: {
      wrong: itemOptionsEval(shortWrong, true, 'plain')[0],
      correct: itemOptionsEval(shortCorrectQueries, false, 'plain')[0],
    },
  };
  for (const [name, mode] of [
    ['deployed2', 'deployed2'],
    ['deployed2-m0', 'deployed2-m0'],
  ]) {
    byMode[name] = {
      0: {
        wrong: itemOptionsEval(wrongQueries, true, mode)[0],
        correct: itemOptionsEval(correctQueries, false, mode)[0],
      },
    };
    byMode[`${name}-short-class`] = {
      0: {
        wrong: itemOptionsEval(shortWrong, true, mode)[0],
        correct: itemOptionsEval(shortCorrectQueries, false, mode)[0],
      },
    };
  }

  // Conservative profile: fire only when BOTH the item-local grader and the
  // kernel-wide contrastive check (corrects+expl) agree. If their false
  // fires are imperfectly correlated this buys specificity; sensitivity
  // pays. Reported for the Tutor's default-profile decision.
  const andGate = {};
  for (const margin of MARGINS) {
    const fireBoth = (q, expectFamily) => {
      const wrongTop = Math.max(...(q.ctx.distractors ?? []).map((d) => cosineOf(q.answer, d)), -1);
      const itemFires = wrongTop >= 0.35 && wrongTop > cosineOf(q.answer, q.correctText) + margin;
      if (!itemFires) return false;
      return diagnoseSync(q, 'corrects+expl', margin, expectFamily);
    };
    const diagnoseSync = (q, mode, margin_, expectFamily) => {
      // synchronous re-check via precomputed vectors
      const exemplars = index.byKernel.get(q.kernelId) ?? [];
      const qv = vecOf.get(q.answer);
      if (!qv || exemplars.length === 0) return false;
      let best = null;
      let bestScore = -1;
      for (const e of exemplars) {
        let dot = 0;
        for (let i = 0; i < qv.length; i += 1) dot += qv[i] * e.vector[i];
        if (dot > bestScore) {
          bestScore = dot;
          best = e;
        }
      }
      const nullTop = Math.max(...nullTextsFor(q.kernelId, q.correctText, mode).map((t) => cosineOf(q.answer, t)));
      const fires = bestScore >= 0.35 && bestScore > nullTop + margin_;
      if (!fires) return false;
      return expectFamily === null ? true : best.family === expectFamily;
    };
    let firedRight = 0;
    for (const q of wrongQueries) if (fireBoth(q, q.family)) firedRight += 1;
    let falseFires = 0;
    for (const q of correctQueries) if (fireBoth(q, null)) falseFires += 1;
    andGate[margin] = {
      wrong: { total: wrongQueries.length, firedRight, familyAccuracy: firedRight / wrongQueries.length },
      correct: {
        total: correctQueries.length,
        falseFires,
        falseFireRate: falseFires / Math.max(1, correctQueries.length),
      },
    };
  }
  byMode['and-gate'] = andGate;
  return { wrongQueries: wrongQueries.length, correctQueries: correctQueries.length, byMode };
}

// --- 3. Null rejection ------------------------------------------------------

async function evalNullRejection(bank, embedder) {
  const index = await buildDiagnosisIndex(bank, { embedder });
  const negatives = [];
  for (const item of bank.items) {
    if (!item.familyKey || !index.byKernel.has(item.kernelId)) continue;
    const correctText = item.options?.[item.correctIndex];
    if (typeof correctText === 'string' && correctText.length >= 8) {
      negatives.push({ kernelId: item.kernelId, text: correctText });
    }
  }
  const sample = negatives.filter((_, i) => i % 3 === 0); // every 3rd — ~600 queries
  const vectors = await cachedEmbed(
    sample.map((n) => n.text),
    { name: 'null-rejection-queries', embedder },
  );
  const perThreshold = {};
  for (const threshold of THRESHOLDS) {
    let fired = 0;
    for (let i = 0; i < sample.length; i += 1) {
      const verdict = await diagnose(index, sample[i].kernelId, sample[i].text, {
        threshold,
        queryVector: vectors[i],
      });
      if (verdict.family !== null) fired += 1;
    }
    perThreshold[threshold] = { falseFires: fired, total: sample.length, falseFireRate: fired / sample.length };
  }
  return { negatives: sample.length, perThreshold };
}

// --- main -------------------------------------------------------------------

if (existsSync('trellis/bank/all-items.json') && !process.env.VITEST) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const embedder = makeEmbedder();
  const ledger = createRunLedger({ runId: 'tendril-diagnosis-eval', runDir: 'trellis/runs/tendril-diagnosis-eval' });
  const t0 = performance.now();
  const loo = await evalLoo(bank, embedder);
  const paraphrase = await evalParaphrases(bank, embedder, ledger);
  const nullRejection = await evalNullRejection(bank, embedder);
  const contrastive = await evalContrastive(bank, embedder, ledger);
  const report = {
    stamp: 'SIMULATED instruments — PROF-BENCH culture; Tendril T-M1c',
    seconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
    loo,
    paraphrase,
    nullRejectionAbsolute: nullRejection,
    contrastive,
  };
  await writeFile('trellis/tendril/cache/diagnosis-eval.json', JSON.stringify(report, null, 1));
  await ledger.flush(); // generation runs record their ds spend; frozen re-runs record $0
  console.log(JSON.stringify(report, null, 2));
}
