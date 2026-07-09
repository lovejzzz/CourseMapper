import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { normalizeFlywheelRow, writeScionLedger } from '../lib/scionLedger.mjs';

describe('scionLedger', () => {
  it('normalizes flywheel rows into formal train/eval ledger rows', () => {
    const row = normalizeFlywheelRow(
      {
        pass: 'mcVerify',
        lessonId: 'lesson-1',
        item: 2,
        action: 'regenerated',
        chosen: { q: 'better item' },
        rejected: { q: 'bad item' },
        context: { course: 'Music Theory Fundamentals', chunk: ['lesson-1'] },
        at: '2026-07-08T12:00:00.000Z',
      },
      { index: 4 },
    );

    expect(row).toMatchObject({
      ledgerVersion: 1,
      source: 'app-flywheel',
      sourceIndex: 4,
      kind: 'preference-pair',
      pass: 'mcVerify',
      action: 'regenerated',
      lessonId: 'lesson-1',
      item: 2,
      context: { course: 'Music Theory Fundamentals', chunk: ['lesson-1'] },
    });
    expect(['train', 'eval']).toContain(row.split);
    expect(row.chosen).toEqual({ q: 'better item' });
    expect(row.rejected).toEqual({ q: 'bad item' });
  });

  it('writes explicit metadata-only ledgers without payload storage', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-ledger-'));
    try {
      const inputPath = path.join(tempRoot, 'app-flywheel.jsonl');
      const outputPath = path.join(tempRoot, 'ledger.jsonl');
      await fs.writeFile(
        inputPath,
        `${JSON.stringify({ pass: 'polish', action: 'accepted', chosen: 'after', rejected: 'before' })}\n`,
      );

      const result = await writeScionLedger({ inputPath, outputPath, includePayload: false });
      const rows = (await fs.readFile(outputPath, 'utf8')).trim().split('\n').map(JSON.parse);

      expect(result.summary.total).toBe(1);
      expect(rows[0].kind).toBe('preference-pair');
      expect(rows[0].chosen).toBeUndefined();
      expect(rows[0].rejected).toBeUndefined();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
