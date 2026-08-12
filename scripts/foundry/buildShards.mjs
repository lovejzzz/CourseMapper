#!/usr/bin/env node
/**
 * buildShards.mjs — CurriculumOS V1 foundry: build genome shards from curated
 * sources, gated by the real admission pipeline.
 *
 * For each source file under scripts/foundry/sources/*.json:
 *   1. run admitBatch (mechanical anchor check + schema + item lint),
 *   2. group admitted kernels by discipline into shards,
 *   3. write public/genome/<discipline>-<level>.json with a shipped inverted
 *      index, and a manifest with content hashes.
 *
 * Run with vite-node so it can import the shared admission modules:
 *   npx vite-node scripts/foundry/buildShards.mjs
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §6.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitBatch, findAliasCollisions } from '../../src/lib/genome/foundryAdmission.js';
import { buildConceptIndex } from '../../src/lib/genome/conceptResolver.js';
import { normalizeArchetype } from '../../src/lib/genome/archetypeSchema.js';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesDir = join(here, 'sources');
const outDir = join(here, '..', '..', 'public', 'genome');

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedSnapshotText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function snapshotReceipt(sourceId, text, kernels = []) {
  const snapshotText = normalizedSnapshotText(text);
  const snapshotBytes = Buffer.from(snapshotText, 'utf8');
  const claims = [];
  const seen = new Set();
  for (const kernel of kernels) {
    for (const entry of [kernel?.definition, ...(kernel?.facts || [])].filter(Boolean)) {
      const anchor = entry?.anchor;
      if (String(anchor?.src || '') !== sourceId) continue;
      const quote = normalizedSnapshotText(anchor?.quote);
      const locator = String(anchor?.loc || '').trim();
      const identity = `${locator}|${quote}`;
      if (!quote || seen.has(identity)) continue;
      const characterStart = snapshotText.indexOf(quote);
      if (characterStart < 0) continue;
      seen.add(identity);
      const quoteByteStart = Buffer.byteLength(snapshotText.slice(0, characterStart), 'utf8');
      const quoteBytes = Buffer.from(quote, 'utf8');
      claims.push({
        sourceId,
        locator,
        quote,
        retrievedSnapshotSha256: sha256(snapshotBytes),
        retrievedSnapshotBytes: snapshotBytes.length,
        quoteByteStart,
        quoteByteEnd: quoteByteStart + quoteBytes.length,
        quoteSha256: sha256(quoteBytes),
      });
    }
  }
  return {
    protocol: 'retrieved-source-snapshot-sha256-v2',
    sources: [
      {
        sourceId,
        normalizedSnapshotText: snapshotText,
        retrievedSnapshotSha256: sha256(snapshotBytes),
        retrievedSnapshotBytes: snapshotBytes.length,
      },
    ],
    claims,
  };
}

function serializeIndex(index) {
  // Ship the inverted index so the browser never recomputes it.
  return {
    postings: Object.fromEntries([...index.postings.entries()].map(([token, ids]) => [token, [...ids]])),
  };
}

function main() {
  if (!existsSync(sourcesDir)) {
    console.error(`No sources dir at ${sourcesDir}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const sourceFiles = readdirSync(sourcesDir).filter((name) => name.endsWith('.json'));
  const allAdmitted = [];
  const fullReport = [];
  const archetypes = [];
  // V0.14.1 4.8: collect per-reference display metadata (displayTitle + sourceUrl)
  // so genome citations render a human title instead of a raw shard key. Keyed by
  // the reference src (e.g. "writing-about-literature:reference"); merged across
  // sources and pinned into the manifest for the reading-list engine to prefer.
  const references = {};

  for (const file of sourceFiles) {
    const raw = JSON.parse(readFileSync(join(sourcesDir, file), 'utf8'));
    if (raw.references && typeof raw.references === 'object') {
      for (const [key, meta] of Object.entries(raw.references)) {
        if (!meta || typeof meta !== 'object') continue;
        references[key] = {
          displayTitle: String(meta.displayTitle || '').trim(),
          ...(meta.sourceUrl ? { sourceUrl: String(meta.sourceUrl).trim() } : {}),
          ...(meta.license ? { license: String(meta.license).trim() } : {}),
          ...(meta.attribution ? { attribution: String(meta.attribution).trim() } : {}),
        };
      }
    }
    // Archetype sources (Layer 2) carry `archetypes`, not concept `kernels`.
    if (Array.isArray(raw.archetypes)) {
      let admitted = 0;
      for (const candidate of raw.archetypes) {
        const { archetype, issues } = normalizeArchetype(candidate);
        if (archetype) {
          archetypes.push(archetype);
          admitted += 1;
        } else {
          fullReport.push({ file, id: candidate?.id || '(no id)', admitted: false, rejections: issues });
        }
      }
      console.log(`[foundry] ${file}: admitted ${admitted}/${raw.archetypes.length} archetypes`);
      continue;
    }
    const sources = raw.sourceSnapshots || {};
    const { admitted, report } = admitBatch(raw.kernels || [], { sources, requireAnchors: true });
    for (const [sourceId, snapshot] of Object.entries(sources)) {
      references[sourceId] = {
        ...(references[sourceId] || { displayTitle: sourceId }),
        sourceSnapshot: snapshotReceipt(sourceId, snapshot, admitted),
      };
    }
    allAdmitted.push(...admitted);
    fullReport.push(...report.map((entry) => ({ file, ...entry })));
    console.log(`[foundry] ${file}: admitted ${admitted.length}/${(raw.kernels || []).length}`);
  }

  // Admission may keep a kernel while dropping one or more lint-failing MC
  // items. That is useful for interactive contribution review, but a release
  // build must never report "admitted N/N" while silently shrinking a shipped
  // assessment bank. Fail before writing any shard when that happens.
  const droppedAssessmentItems = fullReport.filter(
    (entry) => entry.admitted && entry.rejections?.some((reason) => reason.startsWith('mc[')),
  );
  if (droppedAssessmentItems.length > 0) {
    console.error(`[foundry] ${droppedAssessmentItems.length} kernel(s) would lose assessment items:`);
    for (const entry of droppedAssessmentItems) {
      console.error(`  - ${entry.file} · ${entry.id}: ${entry.rejections.join('; ')}`);
    }
    process.exit(1);
  }

  // Group by discipline + level into shards.
  const shardGroups = new Map();
  for (const kernel of allAdmitted) {
    const key = `${kernel.discipline}-${kernel.level}`;
    if (!shardGroups.has(key)) shardGroups.set(key, []);
    shardGroups.get(key).push(kernel);
  }

  const shards = [];
  for (const [key, kernels] of shardGroups) {
    const discipline = kernels[0]?.discipline || key.replace(/-[^-]+$/, '');
    const index = buildConceptIndex(kernels);
    const shardBody = {
      id: key,
      discipline,
      level: key.slice(discipline.length + 1),
      conceptCount: kernels.length,
      kernels,
      index: serializeIndex(index),
    };
    const json = JSON.stringify(shardBody, null, 0);
    const path = `${key}.json`;
    writeFileSync(join(outDir, path), json);
    shards.push({
      id: key,
      discipline,
      level: shardBody.level,
      path,
      conceptCount: kernels.length,
      hash: hashContent(json),
    });
    console.log(`[foundry] wrote ${path}: ${kernels.length} concepts`);
  }

  // Archetype Layer (Layer 2): one global shard, manifest-pinned by hash.
  let archetypeManifest = null;
  if (archetypes.length > 0) {
    const archetypeBody = {
      id: 'archetypes',
      archetypeCount: archetypes.length,
      archetypes: archetypes.sort((a, b) => a.id.localeCompare(b.id)),
    };
    const json = JSON.stringify(archetypeBody, null, 0);
    writeFileSync(join(outDir, 'archetypes.json'), json);
    archetypeManifest = { path: 'archetypes.json', archetypeCount: archetypes.length, hash: hashContent(json) };
    console.log(`[foundry] wrote archetypes.json: ${archetypes.length} archetypes`);
  }

  const manifest = {
    version: new Date().toISOString().slice(0, 10),
    generator: 'curriculumos-foundry-v1',
    conceptCount: allAdmitted.length,
    shards: shards.sort((a, b) => a.id.localeCompare(b.id)),
    ...(archetypeManifest ? { archetypeShard: archetypeManifest } : {}),
    ...(Object.keys(references).length > 0 ? { references } : {}),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `[foundry] manifest: ${shards.length} shards, ${allAdmitted.length} concepts, ${archetypes.length} archetypes`,
  );

  const rejected = fullReport.filter((entry) => !entry.admitted);
  if (rejected.length > 0) {
    console.log(`[foundry] ${rejected.length} kernel(s) rejected:`);
    for (const entry of rejected) console.log(`  - ${entry.id}: ${entry.rejections.join('; ')}`);
  }

  // Cross-discipline alias-collision lint (warning-only): two kernels in
  // different disciplines whose surfaces share generic vocabulary cross-resolve
  // in a mixed-discipline course (refine-loop iter 15/16). Run across the whole
  // admitted set so it catches collisions that span shards.
  const collisions = findAliasCollisions(allAdmitted);
  if (collisions.length > 0) {
    console.log(`[foundry] ⚠ ${collisions.length} cross-discipline alias collision(s):`);
    for (const c of collisions) console.log(`  - "${c.surface}" of ${c.of} ⊆ ${c.containedIn}`);
  } else {
    console.log('[foundry] alias-collision lint: clean (no cross-discipline surface overlaps)');
  }
}

main();
