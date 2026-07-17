import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeScionCodexDecisionTokens } from '../scripts/scionCodexDecisionTokenRepair.mjs';

function decision(position) {
  return {
    pairId: `pair-${position}`,
    scorecards: [1, 2].map((scorecardPosition) => ({
      position: scorecardPosition,
      evaluationStatus: 'scored',
      scores: {
        factualCorrectness: 4,
        sourceFidelity: 4,
        teachability: 4,
        coherence: 4,
        taskQuality: 4,
      },
      evidence: ['A complete concrete evidence statement.'],
      defects: ['concrete-defect'],
    })),
    preference: {
      scoredBeforePreference: true,
      decision: position === 1 ? 'first-artifact' : 'second-artifact',
      winnerPosition: position,
      rationale: 'A complete rationale that preserves the original judgment.',
      decisionDefects: ['concrete-decision-defect'],
    },
  };
}

describe('Scion Codex decision-token normalization', () => {
  it('maps positional labels to winner without changing winnerPosition or scores', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-token-repair-test-'));
    const decisionsDir = path.join(root, 'decisions');
    const receiptOutput = path.join(root, 'receipt.json');
    await fs.mkdir(decisionsDir);
    const file = path.join(decisionsDir, 'chunk-01-decisions-a-b.json');
    await fs.writeFile(file, `${JSON.stringify({ decisions: [decision(1), decision(2)] }, null, 2)}\n`);

    const { receipt } = await normalizeScionCodexDecisionTokens({
      decisionsDir,
      receiptOutput,
      generatedAt: '2026-07-16T22:20:00.000Z',
    });
    const normalized = JSON.parse(await fs.readFile(file, 'utf8'));

    expect(normalized.decisions.map((row) => row.preference)).toMatchObject([
      { decision: 'winner', winnerPosition: 1 },
      { decision: 'winner', winnerPosition: 2 },
    ]);
    expect(receipt).toMatchObject({
      decisionsVisited: 2,
      repairsApplied: 2,
      repair: { scoreValuesChanged: false, winnerPositionsChanged: false },
    });
  });
});
