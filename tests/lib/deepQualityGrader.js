/**
 * v0.14.3 WS-A A1: the grader moved to src/lib/quality/deepQualityGrader.js
 * (app-loadable, FileProvider-based, no node builtins). This shim keeps the
 * Crucible driver (scripts/crucible.mjs lazy-imports this exact path) and
 * existing test imports stable: it re-exports everything and wires the Node
 * fs FileProvider into the legacy grade({ extractedDir, … }) signature.
 */
import { grade as gradeCore } from '../../src/lib/quality/deepQualityGrader.js';
import { createFsFileProvider } from '../../src/lib/quality/fsFileProvider.node.js';

export * from '../../src/lib/quality/deepQualityGrader.js';
export { createFsFileProvider };

export async function grade({ extractedDir = null, fileProvider = null, ...rest } = {}) {
  const provider = fileProvider || (extractedDir ? createFsFileProvider(extractedDir) : null);
  return gradeCore({ ...rest, fileProvider: provider });
}
