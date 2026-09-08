// Profile reversible history separately from rendering, inference and compiler.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import {
  createEditTransaction,
  applyEditTransaction,
  appendEditTransaction,
  emptyEditHistory,
  serializeEditHistory,
  restoreEditHistory,
} from '../../src/lib/deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore } from '../../src/lib/projectSnapshotSanitizer.js';
const [beforePath, afterPath, output] = process.argv.slice(2);
assert(beforePath && afterPath && output, 'Provide before/after project files and a new output directory.');
const beforeBytes = await fs.readFile(beforePath);
const afterBytes = await fs.readFile(afterPath);
const beforeProject = JSON.parse(beforeBytes),
  afterProject = JSON.parse(afterBytes);
const workspace = (project) => ({
  courseMap: project.courseMap,
  courseGraph: project.courseGraph,
  deliverables: project.deliverables,
});
const before = workspace(beforeProject),
  after = workspace(afterProject);
await fs.mkdir(output, { recursive: false });
const runs = [];
for (let iteration = 1; iteration <= 3; iteration++) {
  await setImmediate();
  const row = { iteration };
  const measure = (name, operation) => {
    const started = performance.now();
    const result = operation();
    row[name] = performance.now() - started;
    return result;
  };
  measure('restoreProjectMs', () => prepareProjectSnapshotForRestore(afterProject));
  const transaction = measure('createTransactionMs', () => createEditTransaction(before, after));
  assert(transaction, 'The files contain no reversible change.');
  const history = measure('appendMs', () => appendEditTransaction(emptyEditHistory(), transaction).history);
  const saved = measure('serializeMs', () => serializeEditHistory(history));
  const restored = measure('restoreHistoryMs', () => restoreEditHistory(saved, after));
  assert.equal(restored.status, 'ready', restored.message);
  const undone = measure('undoMs', () => applyEditTransaction(after, transaction, 'undo'));
  assert.equal(undone.status, 'applied', undone.message);
  assert.deepEqual(undone.workspace, before);
  const redone = applyEditTransaction(before, transaction, 'redo');
  assert.equal(redone.status, 'applied', redone.message);
  assert.deepEqual(redone.workspace, after);
  runs.push({ ...row, changes: transaction.changes.length, guards: transaction.guards.length });
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  recordedAt: new Date().toISOString(),
  scope: 'three serial core measurements, not browser latency',
  beforeSha256: digest(beforeBytes),
  afterSha256: digest(afterBytes),
  concurrency: 1,
  runs,
};
await fs.writeFile(path.join(output, 'timing.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
