#!/usr/bin/env node
/**
 * validateSource.mjs — validate ONE foundry source file through the real
 * admission pipeline (schema + mechanical quote gate + item lint) WITHOUT
 * writing shards. Lets shard authors iterate safely while other work runs.
 *
 *   npx vite-node scripts/foundry/validateSource.mjs sources/<file>.json
 */
import { readFileSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitBatch } from '../../src/lib/genome/foundryAdmission.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg) {
  console.error('usage: npx vite-node scripts/foundry/validateSource.mjs sources/<file>.json');
  process.exit(1);
}
const path = isAbsolute(arg) ? arg : join(here, arg);
const raw = JSON.parse(readFileSync(path, 'utf8'));
const { admitted, report, aliasCollisions } = admitBatch(raw.kernels || [], {
  sources: raw.sourceSnapshots || {},
  requireAnchors: true,
});

let failures = 0;
for (const entry of report) {
  if (!entry.admitted) failures += 1;
  console.log(
    `${entry.admitted ? 'ADMITTED (with notes)' : 'REJECTED'} ${entry.id} — ${JSON.stringify(entry.rejections)}`,
  );
}
if ((aliasCollisions || []).length > 0) {
  failures += aliasCollisions.length;
  console.log('ALIAS COLLISIONS:', JSON.stringify(aliasCollisions));
}
console.log(`\n${admitted.length}/${(raw.kernels || []).length} admitted, ${failures} blocking issue(s)`);
process.exit(failures > 0 ? 1 : 0);
