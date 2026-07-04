// Tendril-E semantic sibling dedupe (docs/TENDRIL.md §5.2, T-M1a).
// The LA J7 residual class: SIBLING texts — same idea, different asset —
// selected into different lessons. Id-level course dedup (v0.2.5) cannot
// see them; token-overlap dedup at harvest already missed them (≤0.6
// overlap). Embedding distance at SELECTION time is the honest fix.
//
// ε calibration (measured on e7e-composer-la, the frozen LA ruler): the
// J7 block-severity explanation pairs sit at cosine 0.883-0.945; the one
// warn pair at 0.833; legitimate same-concept explanations ≤0.85.
//
// ε = 0.92, not 0.87 — the ruler decided. 0.87 gave J7 0 but battery
// 0.545→0.447 (below band): siblings echo BECAUSE they re-confront the
// same high-value misconception across lessons, and the classroom sim
// rewards exactly that repetition. 0.92 excludes only flagrant prose
// twins: J7 0, battery 0.523 (in band), $0.0883 (≤$0.12), grade 97/A.
// Echo vs spaced-confrontation is a real tension; the durable fix is
// family DEPTH (more distinctly-worded items per family), not a lower ε.
//
// Scope: bank-item explanations (the measured defect class) + prose move
// assets (same mechanism, asset-cache vectors). Fresh model-authored fills
// are not tracked — they are new text, not library siblings.

import { cosine, cachedEmbed, loadEmbeddingCache, makeEmbedder } from './embedder.mjs';

export const SIBLING_EPSILON = 0.92;

export async function buildTendrilContext(bank, { epsilon = SIBLING_EPSILON, embedder = null } = {}) {
  const emb = embedder ?? makeEmbedder();
  const explanations = [...new Set((bank?.items ?? []).map((i) => i.explanation).filter((e) => typeof e === 'string' && e.length >= 8))];
  const vectors = await cachedEmbed(explanations, { name: 'explanation-embeddings', embedder: emb });
  const explanationVec = new Map(explanations.map((text, i) => [text, vectors[i]]));
  const assetCache = await loadEmbeddingCache();

  const usedExplanationVecs = [];
  const usedAssetVecs = [];
  const counters = { itemsExcluded: 0, assetsExcluded: 0 };

  const echoes = (vec, usedVecs) => vec != null && usedVecs.some((u) => cosine(vec, u) >= epsilon);

  return {
    epsilon,
    counters,
    // Quiz path — candidate bank item vs every explanation already shipped
    // in this course. Excluded candidates are counted; the shelf's family
    // round-robin then reaches the next sibling-free item.
    itemEchoes(item) {
      const hit = echoes(explanationVec.get(item.explanation) ?? null, usedExplanationVecs);
      if (hit) counters.itemsExcluded += 1;
      return hit;
    },
    noteItem(item) {
      const vec = explanationVec.get(item.explanation);
      if (vec) usedExplanationVecs.push(vec);
    },
    // Prose-move path — candidate asset vs every asset already used,
    // via the T-M0 asset-library cache (embeds stem+options+explanation
    // for items, body text for moves).
    assetEchoes(asset) {
      const hit = echoes(assetCache?.byId.get(asset.id)?.vector ?? null, usedAssetVecs);
      if (hit) counters.assetsExcluded += 1;
      return hit;
    },
    noteAsset(asset) {
      const vec = assetCache?.byId.get(asset.id)?.vector;
      if (vec) usedAssetVecs.push(vec);
    },
    // T-M1b — semantic relevance ranking. Returns a rank(asset) function
    // for the given lesson context text, or null when vectors are missing
    // (selection then falls back to the exposure draw untouched).
    async relevanceRanker(lessonText) {
      const [lessonVec] = await emb.embed([lessonText]);
      if (!lessonVec) return null;
      return (asset) => {
        const vec = assetCache?.byId.get(asset.id)?.vector;
        return vec ? cosine(lessonVec, vec) : -1;
      };
    },
  };
}
