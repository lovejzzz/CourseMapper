// Tendril-S distillation corpus (docs/TENDRIL.md §6, T-M2).
//
// HONESTY NOTE (supersedes the design doc's optimism): run ledgers record
// tokens and spend, NOT call payloads. The (source → accepted rewrite)
// pairs therefore have to be RECONSTRUCTED by aligning each authored
// surface back to its source asset/bank item; rejected attempts and their
// reasons are unrecoverable from history. Two consequences:
//   1. the corpus is accepted-pairs only (positive supervision);
//   2. corpusLog() below starts recording pairs LIVE with provenance, so
//      the next distillation round has the full gate-labeled stream.
//
// Alignment is Tendril-E's own job: nearest asset/bank source by cosine,
// confirmed by token overlap in [0.5, 0.98) — identical texts are no-ops
// (fallback or unskinned), not rewrites.

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tokenOverlapRatio } from '../judgment/text.mjs';
import { assetEmbedText, cachedEmbed, cosine, makeEmbedder, textHash } from './embedder.mjs';

const CORPUS_DIR = 'trellis/tendril/corpus';
const LIVE_LOG = join(CORPUS_DIR, 'live-pairs.jsonl');

// ── live logging (wired into skin/blend acceptance paths) ──────────────────
export async function corpusLog(entry) {
  try {
    await mkdir(CORPUS_DIR, { recursive: true });
    await appendFile(LIVE_LOG, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), ...entry })}\n`);
  } catch {
    // corpus logging must never break a run
  }
}

// ── reconstruction over run history ─────────────────────────────────────────

function authoredTexts(authored) {
  const texts = [];
  for (const [lessonId, art] of Object.entries(authored)) {
    for (const [i, seg] of (art.plan?.segments ?? []).entries()) {
      if (typeof seg.text === 'string' && seg.text.length >= 60) {
        texts.push({ lessonId, surface: `segment:${seg.mode}`, path: `plan.segments[${i}]`, text: seg.text });
      }
    }
    for (const [i, q] of (art.quizItems ?? []).entries()) {
      if (typeof q.explanation === 'string' && q.explanation.length >= 40) {
        texts.push({ lessonId, surface: 'quiz-explanation', path: `quizItems[${i}].explanation`, text: q.explanation });
      }
    }
  }
  return texts;
}

export async function reconstructCorpus({ runsDir = 'trellis/runs', outDir = CORPUS_DIR } = {}) {
  const embedder = makeEmbedder();

  // Source pool: every asset body + every bank explanation, embedded once
  // (asset vectors come straight from the T-M0 cache via cachedEmbed reuse).
  const store = JSON.parse(await readFile('trellis/bank/assets.json', 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const sources = [
    ...store.assets.map((a) => ({ kind: `asset:${a.move}`, id: a.id, text: assetEmbedText(a) })),
    ...store.assets
      .filter((a) => a.move === 'item' && typeof a.body?.explanation === 'string')
      .map((a) => ({ kind: 'asset:item-explanation', id: a.id, text: a.body.explanation })),
    ...bank.items.map((i) => ({ kind: 'bank:explanation', id: i.id, text: i.explanation })),
  ].filter((s) => typeof s.text === 'string' && s.text.length >= 40);
  const sourceVectors = await cachedEmbed(
    sources.map((s) => s.text),
    { name: 'corpus-sources', embedder },
  );
  sources.forEach((s, i) => {
    s.vector = sourceVectors[i];
  });

  const runs = (await readdir(runsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const pairs = [];
  const seen = new Set();
  const perRun = {};
  for (const runId of runs) {
    const authoredPath = join(runsDir, runId, 'authored.json');
    if (!existsSync(authoredPath)) continue;
    let authored;
    try {
      authored = JSON.parse(await readFile(authoredPath, 'utf8'));
    } catch {
      continue;
    }
    const texts = authoredTexts(authored);
    if (texts.length === 0) continue;
    const vectors = await cachedEmbed(
      texts.map((t) => t.text),
      { name: 'corpus-authored', embedder },
    );
    let found = 0;
    texts.forEach((t, ti) => {
      // nearest source by cosine, then the token-overlap confirmation band
      let best = null;
      let bestScore = -1;
      for (const s of sources) {
        const score = cosine(vectors[ti], s.vector);
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      if (!best || bestScore < 0.75) return;
      const overlap = tokenOverlapRatio(best.text, t.text);
      if (overlap < 0.5 || overlap >= 0.98) return;
      const key = textHash(best.text) + textHash(t.text);
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({
        runId,
        surface: t.surface,
        sourceKind: best.kind,
        sourceId: best.id,
        cosine: Number(bestScore.toFixed(3)),
        overlap: Number(overlap.toFixed(3)),
        source: best.text,
        target: t.text,
      });
      found += 1;
    });
    perRun[runId] = { surfaces: texts.length, pairs: found };
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'reconstructed-pairs.jsonl'), pairs.map((p) => JSON.stringify(p)).join('\n'));
  const bySurface = {};
  for (const p of pairs) bySurface[p.surface] = (bySurface[p.surface] ?? 0) + 1;
  const summary = {
    stamp: 'reconstructed accepted-pairs only — rejects unrecoverable from history (TENDRIL.md T-M2 honesty note)',
    totalPairs: pairs.length,
    bySurface,
    runsScanned: Object.keys(perRun).length,
    perRun,
  };
  await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
  return summary;
}

// CLI — plain-node only (argv[1] check; see embedder.mjs note).
if (process.argv[1]?.endsWith('tendril/corpus.mjs') && !process.env.VITEST) {
  const summary = await reconstructCorpus();
  console.log(JSON.stringify({ ...summary, perRun: undefined }, null, 2));
}
