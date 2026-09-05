import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
const manifest = JSON.parse(await fs.readFile('dist/.vite/manifest.json', 'utf8'));
const visited = new Set();
const files = new Set(['index.html', 'fonts/caveat-title.ttf']);
function visit(id) {
  if (visited.has(id)) return;
  visited.add(id);
  const item = manifest[id];
  assert(item, `Missing build dependency: ${id}`);
  files.add(item.file);
  for (const css of item.css ?? []) files.add(css);
  for (const dependency of item.imports ?? []) visit(dependency);
}
visit('index.html');
visit('src/studio/Studio.tsx');
let raw = 0,
  gzip = 0;
for (const file of files) {
  const bytes = await fs.readFile(`dist/${file}`);
  raw += bytes.length;
  gzip += gzipSync(bytes).length;
}
// Includes React, the full authoring engine, schemas, page HTML and CSS.
// Optional model, PDF extraction and document export are excluded until used.
assert(raw <= 330 * 1024, `Studio first load exceeds 330 KiB: ${raw}`);
assert(gzip <= 110 * 1024, `Studio first load exceeds 110 KiB gzip: ${gzip}`);
const report = JSON.parse(await fs.readFile('dist/build-report.json', 'utf8'));
assert(!report.productionModules.some((id) => /LegacyApplication|courseCompiler|firebase/i.test(id)));
for (const retired of ['scion', 'genome']) await assert.rejects(fs.access(`dist/${retired}`));
const release = JSON.parse(await fs.readFile('dist/release.json', 'utf8'));
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
assert.equal(release.version, pkg.version);
console.log(
  JSON.stringify(
    {
      firstLoadRawKiB: +(raw / 1024).toFixed(2),
      firstLoadGzipKiB: +(gzip / 1024).toFixed(2),
      productionSourceModules: report.productionModules.length,
      release,
    },
    null,
    2,
  ),
);
