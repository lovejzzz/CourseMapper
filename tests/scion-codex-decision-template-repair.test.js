import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizeScionCodexDecisionTemplateHashes } from '../scripts/scionCodexDecisionTemplateRepair.mjs';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function document(templateSha256, pairId = 'anonymous-pair-1') {
  return {
    schemaVersion: 1,
    protocol: 'scion-codex-training-decisions-v1',
    templateSha256,
    order: 'A/B',
    decisions: [
      {
        pairId,
        scorecards: [{ position: 1, scores: { factualCorrectness: 4 } }],
        preference: { decision: 'winner', winnerPosition: 1, rationale: 'A concrete rationale.' },
      },
    ],
  };
}

describe('Scion Codex decision template repair', () => {
  it('changes only the top-level hash using the same-chunk canonical template', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-template-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    const templateDir = path.join(root, 'workbook');
    await Promise.all([fs.mkdir(decisionsDir), fs.mkdir(templateDir)]);
    const name = 'chunk-01-decisions-a-b.json';
    const before = document('a'.repeat(64));
    const template = document('b'.repeat(64));
    template.decisions[0].scorecards = [];
    template.decisions[0].preference = { decision: null, winnerPosition: null, rationale: null };
    await Promise.all([
      fs.writeFile(path.join(decisionsDir, name), `${JSON.stringify(before, null, 2)}\n`),
      fs.writeFile(path.join(templateDir, name), `${JSON.stringify(template, null, 2)}\n`),
    ]);

    const { receipt } = await normalizeScionCodexDecisionTemplateHashes({
      decisionsDir,
      templateDir,
      receiptOutput: path.join(root, 'receipt.json'),
      generatedAt: '2026-07-17T01:01:00.000Z',
    });
    const after = JSON.parse(await fs.readFile(path.join(decisionsDir, name), 'utf8'));
    expect(after).toEqual({ ...before, templateSha256: 'b'.repeat(64) });
    expect(receipt).toMatchObject({
      templatesVisited: 1,
      decisionsVisited: 1,
      repairsApplied: 1,
      repair: { field: 'templateSha256', judgmentFieldsChanged: false, preferencesChanged: false },
    });
    expect(JSON.stringify(receipt)).not.toContain('winnerPosition');
  });

  it('fails closed when completed and template pair order differ', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-template-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    const templateDir = path.join(root, 'workbook');
    await Promise.all([fs.mkdir(decisionsDir), fs.mkdir(templateDir)]);
    const name = 'chunk-01-decisions-a-b.json';
    await Promise.all([
      fs.writeFile(path.join(decisionsDir, name), JSON.stringify(document('a'.repeat(64), 'pair-a'))),
      fs.writeFile(path.join(templateDir, name), JSON.stringify(document('b'.repeat(64), 'pair-b'))),
    ]);
    await expect(
      normalizeScionCodexDecisionTemplateHashes({
        decisionsDir,
        templateDir,
        receiptOutput: path.join(root, 'receipt.json'),
        generatedAt: '2026-07-17T01:01:00.000Z',
      }),
    ).rejects.toThrow('does not match its canonical workbook template');
  });
});
