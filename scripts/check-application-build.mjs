import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(await fs.readFile('dist/.vite/manifest.json', 'utf8'));
const visited = new Set();
const files = new Set();
function visit(id) {
  if (visited.has(id)) return;
  visited.add(id);
  const item = manifest[id];
  assert(item, `Missing production dependency ${id}`);
  files.add(item.file);
  for (const dependency of item.imports ?? []) visit(dependency);
}
visit('index.html');
const initial = await Promise.all([...files].map((file) => fs.readFile(`dist/${file}`)));
const raw = initial.reduce((sum, bytes) => sum + bytes.length, 0);
const gzip = initial.reduce((sum, bytes) => sum + gzipSync(bytes).length, 0);
// Retain the original application's initial JS limits, rather than applying
// budgets measured against the smaller, rejected replacement interface.
assert(raw <= 610 * 1024, `Initial JS exceeds the v0.18.7 610 KiB budget: ${raw}`);
assert(gzip <= 190 * 1024, `Initial JS exceeds the v0.18.7 190 KiB gzip budget: ${gzip}`);
const report = JSON.parse(await fs.readFile('dist/build-report.json', 'utf8'));
assert(report.productionModules.includes('src/screens/Landing.jsx'));
assert(report.productionModules.includes('src/AppFlow.jsx'));
assert(!report.productionModules.some((id) => id.startsWith('src/studio/')));
const release = JSON.parse(await fs.readFile('dist/release.json', 'utf8'));
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
assert.equal(release.version, pkg.version);
assert.equal(release.interfaceBaseline, '0.18.7');
// The deployed CSP allows same-origin font fetches, not fetch(data:...).
// Vite must emit the small PDF symbol subset instead of inlining its URL.
const assets = await fs.readdir('dist/assets');
assert(
  assets.some((file) => /^NotoSansSC-Symbols-.*\.otf$/.test(file)),
  'PDF symbols must be a same-origin asset',
);
console.log(JSON.stringify({ initialJsRawKiB: raw / 1024, initialJsGzipKiB: gzip / 1024, release }, null, 2));
