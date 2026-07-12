import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildFactualCanaries, scoreFactualCanaries } from '../scripts/scionFactualCanaryAudit.mjs';

function loadPacket() {
  const manifest = JSON.parse(fs.readFileSync('evaluation/scion-factual-canaries.json', 'utf8'));
  const shards = Object.fromEntries(
    [...new Set(manifest.domains.map((domain) => domain.shard))].map((shardPath) => [
      shardPath,
      JSON.parse(fs.readFileSync(shardPath, 'utf8')),
    ]),
  );
  return buildFactualCanaries(manifest, shards);
}

describe('Scion factual canaries', () => {
  it('freezes five source-anchored questions in each of five domains', () => {
    const packet = loadPacket();
    expect(packet.cases).toHaveLength(25);
    expect(packet.domainCounts).toEqual({
      'computer-science': 5,
      geology: 5,
      'world-literature': 5,
      'research-methods': 5,
      'music-theory': 5,
    });
    expect(
      packet.cases.every(
        (entry) =>
          entry.options.length === 4 &&
          entry.answerIndex >= 0 &&
          entry.answerIndex <= 3 &&
          entry.support.fact &&
          entry.support.source &&
          entry.support.quote &&
          entry.support.context.length >= 2,
      ),
    ).toBe(true);
    expect(new Set(packet.cases.map((entry) => entry.answerIndex)).size).toBe(4);
    expect(packet.recordedRuns).toHaveLength(3);
    expect(
      packet.recordedRuns.map((run) => scoreFactualCanaries(packet, run.answers, { label: run.id, mode: run.mode })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'gpt-5.4-mini-cold', mode: 'cold', correct: 25 }),
        expect.objectContaining({ label: 'scion-1-cold', mode: 'cold', correct: 23 }),
        expect.objectContaining({ label: 'scion-1-source-grounded', mode: 'source-grounded', correct: 25 }),
      ]),
    );
  });

  it('requires exact correctness overall and inside every domain', () => {
    const packet = loadPacket();
    const perfect = scoreFactualCanaries(
      packet,
      packet.cases.map((entry) => entry.answerIndex),
      { label: 'golden' },
    );
    expect(perfect).toMatchObject({ status: 'passed', correct: 25, total: 25, validShape: true });

    const oneWrong = packet.cases.map((entry) => entry.answerIndex);
    oneWrong[0] = (oneWrong[0] + 1) % 4;
    const failed = scoreFactualCanaries(packet, oneWrong, { label: 'one-wrong' });
    expect(failed).toMatchObject({ status: 'failed', correct: 24, total: 25 });
    expect(failed.byDomain['computer-science'].share).toBe(0.8);
  });

  it('rejects missing or malformed answer vectors instead of scoring partial output', () => {
    const packet = loadPacket();
    expect(scoreFactualCanaries(packet, [0, 1], { label: 'partial' })).toMatchObject({
      status: 'failed',
      validShape: false,
    });
  });
});
