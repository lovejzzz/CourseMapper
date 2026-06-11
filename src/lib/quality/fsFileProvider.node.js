/**
 * fsFileProvider.node.js — the NODE FileProvider for the deep quality grader
 * (v0.14.3 A1). Reads an unzipped package directory tree, the Crucible /
 * release-gate path.
 *
 * CRITICAL BROWSER CONSTRAINT: this is the only quality module that imports
 * node builtins. It must be imported ONLY by node-side callers — the
 * tests/lib/deepQualityGrader.js shim (which scripts/crucible.mjs lazy-loads)
 * and node test specs — NEVER by anything reachable from the browser entry
 * (src/lib/quality/deepQualityGrader.js consumes the provider interface
 * without importing this module).
 */

import fs from 'node:fs';
import path from 'node:path';

function walkFiles(dir) {
  const out = [];
  const recurse = (current, rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) recurse(abs, relPath);
      else out.push({ abs, relPath });
    }
  };
  recurse(dir, '');
  return out;
}

export function createFsFileProvider(extractedDir) {
  const resolve = (relPath) => path.join(extractedDir, String(relPath).split('/').join(path.sep));
  return {
    list: () => walkFiles(extractedDir).map((entry) => entry.relPath),
    readBinary: (relPath) => fs.readFileSync(resolve(relPath)),
    readText: (relPath) => fs.readFileSync(resolve(relPath), 'utf8'),
  };
}
