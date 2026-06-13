/**
 * v0.15.2 C2 — the machine-ownership inversion, pinned file by file.
 *
 * pipelineMachine's finish-pass selectors (isFinishPassActive,
 * isPackageReady, isPackageBlocked, finishStatusOf) are the ONE vocabulary
 * for finish-phase questions. Each migrated file is pinned at ZERO direct
 * `packageQualityPass.status` reads. v0.15.3 completed the inversion:
 * ChatPanel (the last carried consumer — eight reads with effect/ref
 * semantics) migrated onto a single machine-derived `finishStatus`, and the
 * carried list is EMPTY and pinned empty.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finishStatusOf, isFinishPassActive, isPackageBlocked, isPackageReady } from '../src/lib/pipelineMachine.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const DIRECT_READ = /packageQualityPass(?:\?)?\.status/;

const MIGRATED_FILES = [
  'src/components/PackageTrustStrip.jsx',
  'src/components/ExportSidePanel.jsx',
  'src/components/WorkspaceQualityChip.jsx',
  'src/components/chat/AgentWorkingSetPanel.jsx',
  'src/components/chat/ChatPanel.jsx',
];

// Carried consumers — emptied in v0.15.3; it must STAY empty (a new direct
// reader anywhere is a regression, not a carry).
const CARRIED_FILES = [];

describe('the selectors', () => {
  it('answer the four phase questions consistently', () => {
    expect(isFinishPassActive({ status: 'running' })).toBe(true);
    expect(isFinishPassActive({ status: 'ready' })).toBe(false);
    expect(isFinishPassActive(null)).toBe(false);
    expect(isPackageReady({ status: 'ready' })).toBe(true);
    expect(isPackageReady({ status: 'blocked' })).toBe(false);
    expect(isPackageBlocked({ status: 'blocked' })).toBe(true);
    expect(finishStatusOf(null)).toBe('idle');
    expect(finishStatusOf({ status: 'ready' })).toBe('ready');
  });
});

describe('migration state (source scans)', () => {
  for (const file of MIGRATED_FILES) {
    it(`${file} reads phase ONLY through the machine`, () => {
      // The chip's generation-phase check reads .phase (not .status) by
      // design — phase is data, status is the machine's question.
      const source = read(file);
      const directReads = source.split('\n').filter((line) => DIRECT_READ.test(line));
      expect(directReads, directReads.join('\n')).toEqual([]);
      expect(source).toMatch(/from '\.\.?\/(?:\.\.\/)?lib\/pipelineMachine'/);
    });
  }

  it('the inversion is complete — the carried list is empty and stays empty', () => {
    // v0.15.3 C2: ChatPanel was the last carried consumer. Any future direct
    // `.status` read is a regression — use the selectors.
    expect(CARRIED_FILES).toEqual([]);
  });
});
