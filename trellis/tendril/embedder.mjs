// Tendril-E — the embedding brain (docs/TENDRIL.md §4, T-M0).
// A ~25MB MiniLM-class sentence embedder that runs in Node (build-time)
// and in the browser (runtime, WebGPU/wasm). This module is the Node
// side: embed the asset library once, cache to disk, serve cosine
// lookups to selection/dedupe/diagnosis. Ground rule T-2: Tendril reads
// compiled assets, never writes to the library.
//
// The pipeline is injectable (makeEmbedder({ embedFn })) so unit tests
// never download a model — the CI trap the trellis suite already
// enforces for provider calls applies to model weights too.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// FUNCTION-ROUTED EMBEDDERS (2026-07-05): round 4 (tendril-e2d) wins
// DIAGNOSIS outright (81.7%/19.2% at margin 0.035 — beats the deployed
// point on both axes) but its compression collapses the sibling/benign
// separation dedupe needs (benign max 0.956 vs block min 0.933 — no ε
// separates). So: the TUTOR ships e2d (frozen diagnosis ruler is its
// gate); this Node-side default stays e2c for dedupe/selection (its
// ε=0.94 adoption ruler stands). Same lesson as S's task routing: the
// better model is per-function, not global.
//
// tendril-e2c ADOPTED 2026-07-04: three stance fine-tune rounds (bank
// triplets → student-register corpus → hard-negative mining) met the
// pre-registered joint bar (familyAcc 80.4% ≥80 AND falseFire 20.0% ≤20
// at margin 0) AND kept the dedupe ruler clean at ε=0.94 (J7 ≤1, battery
// in band, cost in band). Base model remains available via
// TENDRIL_MODEL=Xenova/all-MiniLM-L6-v2. Model card: models/tendril-e2c.
export const TENDRIL_MODEL_ID = 'tendril-e2c';
export const TENDRIL_DIM = 384;
const CACHE_DIR = 'trellis/tendril/cache';
const MODELS_DIR = 'trellis/tendril/models';

// R1: TENDRIL_MODEL=<local-dir-name> (e.g. tendril-e2) swaps the embedder
// for A/B verdicts. Every disk cache name gains a model tag so candidate
// models can NEVER pollute the default model's caches.
const ACTIVE_MODEL = process.env.TENDRIL_MODEL || TENDRIL_MODEL_ID;
const MODEL_TAG = process.env.TENDRIL_MODEL ? `@${process.env.TENDRIL_MODEL.replace(/[^a-z0-9-]/gi, '_')}` : '';
const tagged = (name) => `${name}${MODEL_TAG}`;

let _pipeline = null;

async function loadPipeline() {
  if (_pipeline) return _pipeline;
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODELS_DIR; // project-local so the browser bundle reuses the same files
  env.localModelPath = MODELS_DIR; // local candidates (tendril-e2/…) resolve here
  env.allowLocalModels = true;
  _pipeline = await pipeline('feature-extraction', ACTIVE_MODEL, { dtype: 'q8' });
  return _pipeline;
}

// Real embedding path — mean-pooled, L2-normalized, so cosine is a dot.
async function realEmbed(texts) {
  const pipe = await loadPipeline();
  const out = await pipe(texts, { pooling: 'mean', normalize: true });
  const vectors = [];
  for (let i = 0; i < texts.length; i += 1) {
    vectors.push(Float32Array.from(out[i].data ?? out[i].ort_tensor?.cpuData ?? out[i]));
  }
  return vectors;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot; // vectors are normalized
}

export function textHash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

// The canonical embed text of an asset: what a human would read of it.
// Items embed stem + options + explanation (the surfaces echo lives in);
// prose moves embed their text body.
export function assetEmbedText(asset) {
  const b = asset.body ?? {};
  if (asset.move === 'item') {
    return [b.stem, ...(b.options ?? []), b.explanation].filter(Boolean).join('\n');
  }
  const text =
    b.text ?? b.markdown ?? b.prompt ?? b.task ?? b.a ?? (Array.isArray(b.slides) ? JSON.stringify(b.slides) : null);
  return text ?? JSON.stringify(b).slice(0, 500);
}

// makeEmbedder — the injectable core. embedFn(texts) -> Float32Array[].
export function makeEmbedder({ embedFn = realEmbed, batchSize = 64 } = {}) {
  return {
    async embed(texts) {
      const vectors = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        vectors.push(...(await embedFn(texts.slice(i, i + batchSize))));
      }
      return vectors;
    },
    async embedOne(text) {
      return (await embedFn([text]))[0];
    },
  };
}

// ---------------------------------------------------------------------------
// Asset-library embedding cache (T-M0). Incremental: only new/changed
// texts (by sha1) are re-embedded on rebuild. Layout:
//   cache/asset-embeddings.json  — { model, dim, entries: [{id, hash}] }
//   cache/asset-embeddings.bin   — Float32Array rows in entry order
// ---------------------------------------------------------------------------

export async function loadEmbeddingCache({ dir = CACHE_DIR, name = tagged('asset-embeddings') } = {}) {
  try {
    const meta = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'));
    if (meta.model && meta.model !== ACTIVE_MODEL) return null; // model switched → cold cache
    const buf = await readFile(join(dir, `${name}.bin`));
    const flat = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const byId = new Map();
    meta.entries.forEach((entry, i) => {
      byId.set(entry.id, { hash: entry.hash, vector: flat.subarray(i * meta.dim, (i + 1) * meta.dim) });
    });
    return { meta, byId };
  } catch {
    return null;
  }
}

export async function embedAssetLibrary(store, { dir = CACHE_DIR, name = tagged('asset-embeddings'), embedder = null } = {}) {
  const emb = embedder ?? makeEmbedder();
  const prior = await loadEmbeddingCache({ dir, name });
  const entries = [];
  const vectors = [];
  const toEmbed = [];
  const toEmbedIdx = [];
  for (const asset of store.assets) {
    const text = assetEmbedText(asset);
    const hash = textHash(text);
    const cached = prior?.byId.get(asset.id);
    entries.push({ id: asset.id, hash });
    if (cached && cached.hash === hash) {
      vectors.push(Float32Array.from(cached.vector));
    } else {
      vectors.push(null);
      toEmbed.push(text);
      toEmbedIdx.push(entries.length - 1);
    }
  }
  if (toEmbed.length > 0) {
    const fresh = await emb.embed(toEmbed);
    toEmbedIdx.forEach((idx, j) => {
      vectors[idx] = fresh[j];
    });
  }
  const dim = vectors[0]?.length ?? TENDRIL_DIM;
  const flat = new Float32Array(entries.length * dim);
  vectors.forEach((v, i) => flat.set(v, i * dim));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.json`), JSON.stringify({ model: ACTIVE_MODEL, dim, entries }, null, 1));
  await writeFile(join(dir, `${name}.bin`), Buffer.from(flat.buffer));
  return { total: entries.length, embedded: toEmbed.length, reused: entries.length - toEmbed.length, dim };
}

// Generic text-embedding cache keyed by sha1 — for exemplar/query sets
// that are not assets (diagnosis index, eval sets). Append-only file pair
// like the asset cache; identical texts dedupe naturally.
export async function cachedEmbed(texts, { dir = CACHE_DIR, name, embedder = null } = {}) {
  if (!name) throw new Error('cachedEmbed needs a cache name');
  name = tagged(name);
  const emb = embedder ?? makeEmbedder();
  // Hermetic under vitest: mock embedders must never append junk vectors
  // to the repo's real caches.
  if (process.env.VITEST) return emb.embed(texts);
  let meta = { model: ACTIVE_MODEL, dim: TENDRIL_DIM, hashes: [] };
  let flat = new Float32Array(0);
  try {
    const onDisk = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'));
    if (!onDisk.model || onDisk.model === ACTIVE_MODEL) {
      meta = onDisk;
      const buf = await readFile(join(dir, `${name}.bin`));
      flat = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    } // model switched → start cold, never mix vectors from two models
  } catch {
    /* cold cache */
  }
  if (!meta.model) meta.model = ACTIVE_MODEL;
  const pos = new Map(meta.hashes.map((h, i) => [h, i]));
  const missing = [...new Set(texts.map(textHash).filter((h) => !pos.has(h)))];
  if (missing.length > 0) {
    const byHash = new Map(texts.map((t) => [textHash(t), t]));
    const fresh = await emb.embed(missing.map((h) => byHash.get(h)));
    const grown = new Float32Array(flat.length + missing.length * meta.dim);
    grown.set(flat, 0);
    missing.forEach((h, j) => {
      pos.set(h, meta.hashes.length + j);
      grown.set(fresh[j], (meta.hashes.length + j) * meta.dim);
    });
    meta.hashes.push(...missing);
    flat = grown;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.json`), JSON.stringify(meta));
    await writeFile(join(dir, `${name}.bin`), Buffer.from(flat.buffer));
  }
  return texts.map((t) => flat.subarray(pos.get(textHash(t)) * meta.dim, (pos.get(textHash(t)) + 1) * meta.dim));
}

// CLI — plain-node only (`node trellis/tendril/embedder.mjs`). argv[1] is
// reliable under plain node; under vite-node (which strips script paths)
// this module is only ever IMPORTED, and the guard must not fire then —
// the content-guard pattern misfires here because this module's input
// (assets.json) always exists.
if (
  process.argv[1]?.endsWith('tendril/embedder.mjs') &&
  existsSync('trellis/bank/assets.json') &&
  !process.env.VITEST
) {
  const store = JSON.parse(await readFile('trellis/bank/assets.json', 'utf8'));
  const t0 = performance.now();
  const result = await embedAssetLibrary(store);
  console.log(JSON.stringify({ model: ACTIVE_MODEL, ...result, seconds: ((performance.now() - t0) / 1000).toFixed(1) }, null, 2));
}
