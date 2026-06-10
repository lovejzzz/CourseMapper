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
import { admitBatch } from '../../src/lib/genome/foundryAdmission.js';
import { buildConceptIndex } from '../../src/lib/genome/conceptResolver.js';

const here = dirname(fileURLToPath(import.meta.url));
const sourcesDir = join(here, 'sources');
const outDir = join(here, '..', '..', 'public', 'genome');

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
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

  for (const file of sourceFiles) {
    const raw = JSON.parse(readFileSync(join(sourcesDir, file), 'utf8'));
    const sources = raw.sourceSnapshots || {};
    const { admitted, report } = admitBatch(raw.kernels || [], { sources, requireAnchors: true });
    allAdmitted.push(...admitted);
    fullReport.push(...report.map((entry) => ({ file, ...entry })));
    console.log(`[foundry] ${file}: admitted ${admitted.length}/${(raw.kernels || []).length}`);
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
    const [discipline] = key.split('-');
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

  const manifest = {
    version: new Date().toISOString().slice(0, 10),
    generator: 'curriculumos-foundry-v1',
    conceptCount: allAdmitted.length,
    shards: shards.sort((a, b) => a.id.localeCompare(b.id)),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[foundry] manifest: ${shards.length} shards, ${allAdmitted.length} concepts total`);

  const rejected = fullReport.filter((entry) => !entry.admitted);
  if (rejected.length > 0) {
    console.log(`[foundry] ${rejected.length} kernel(s) rejected:`);
    for (const entry of rejected) console.log(`  - ${entry.id}: ${entry.rejections.join('; ')}`);
  }
}

main();
