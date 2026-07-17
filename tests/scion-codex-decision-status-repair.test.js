import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizeScionCodexDecisionStatuses } from '../scripts/scionCodexDecisionStatusRepair.mjs';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function scoredDecision() {
  return {
    templateSha256: 'a'.repeat(64),
    judge: { revision: 'gpt-5.6-luna@max', runtime: 'codex-cli-0.144.2' },
    decisions: [
      {
        pairId: 'anonymous-pair-1',
        scorecards: [
          {
            evaluationStatus: 'complete',
            scores: {
              factualCorrectness: 5,
              sourceFidelity: 5,
              teachability: 4,
              coherence: 4,
              taskQuality: 4,
            },
            evidence: ['Concrete source-bound evidence.'],
            defects: [],
          },
          {
            evaluationStatus: 'complete',
            scores: {
              factualCorrectness: 4,
              sourceFidelity: 4,
              teachability: 3,
              coherence: 4,
              taskQuality: 3,
            },
            evidence: ['Concrete comparison evidence.'],
            defects: ['A concrete instructional defect.'],
          },
        ],
        preference: {
          decision: 'winner',
          winnerPosition: 1,
          rationale: 'The first anonymous artifact is more useful.',
        },
      },
    ],
  };
}

describe('Scion Codex decision status repair', () => {
  it('changes only complete to scored when all five numeric scores already exist', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-status-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    const receiptOutput = path.join(root, 'receipt.json');
    await fs.mkdir(decisionsDir);
    const before = scoredDecision();
    const decisionFile = path.join(decisionsDir, 'chunk-01-decisions-a-b.json');
    await fs.writeFile(decisionFile, `${JSON.stringify(before, null, 2)}\n`);

    const result = await normalizeScionCodexDecisionStatuses({
      decisionsDir,
      receiptOutput,
      generatedAt: '2026-07-16T12:40:00.000Z',
    });
    expect(result.receipt).toMatchObject({
      scorecardsVisited: 2,
      repairsApplied: 2,
      repair: {
        from: 'complete',
        to: 'scored',
        scoreValuesChanged: false,
        preferencesChanged: false,
      },
    });
    const after = JSON.parse(await fs.readFile(decisionFile, 'utf8'));
    expect(after.decisions[0].scorecards.map((card) => card.evaluationStatus)).toEqual(['scored', 'scored']);
    after.decisions[0].scorecards.forEach((card) => {
      card.evaluationStatus = 'complete';
    });
    expect(after).toEqual(before);
    expect(JSON.stringify(result.receipt)).not.toContain('winnerPosition');
  });

  it('fails closed when a scorecard does not contain five valid numeric scores', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-status-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    await fs.mkdir(decisionsDir);
    const invalid = scoredDecision();
    invalid.decisions[0].scorecards[0].scores.taskQuality = null;
    await fs.writeFile(path.join(decisionsDir, 'chunk-01-decisions-a-b.json'), `${JSON.stringify(invalid, null, 2)}\n`);
    await expect(
      normalizeScionCodexDecisionStatuses({
        decisionsDir,
        receiptOutput: path.join(root, 'receipt.json'),
        generatedAt: '2026-07-16T12:40:00.000Z',
      }),
    ).rejects.toThrow('without five complete numeric scores');
  });

  it('records an already-canonical scored file without rewriting judgments', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-status-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    await fs.mkdir(decisionsDir);
    const before = scoredDecision();
    before.decisions[0].scorecards.forEach((card) => {
      card.evaluationStatus = 'scored';
    });
    const decisionFile = path.join(decisionsDir, 'chunk-01-decisions-a-b.json');
    const beforeRaw = `${JSON.stringify(before, null, 2)}\n`;
    await fs.writeFile(decisionFile, beforeRaw);

    const { receipt } = await normalizeScionCodexDecisionStatuses({
      decisionsDir,
      receiptOutput: path.join(root, 'receipt.json'),
      generatedAt: '2026-07-16T12:40:00.000Z',
    });

    expect(receipt).toMatchObject({ scorecardsVisited: 2, repairsApplied: 0 });
    expect(await fs.readFile(decisionFile, 'utf8')).toBe(beforeRaw);
  });
});
