import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function keyTerm(term) {
  return JSON.stringify({
    tr: term,
    df: 'A precise concept definition that explains a stable relationship without repeating the complete term.',
    eg: 'A learner applies the concept to a concrete classroom decision and explains the observed result.',
    mi: 'A learner may confuse the concept with a superficially similar but unsupported interpretation.',
    cx: 'Check the supplied evidence and distinguish the actual relationship from that unsupported interpretation.',
  });
}

describe('source-only Scion review packets', () => {
  it('fails closed instead of filling a training packet with contextless cases', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scion-source-packet-test-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'candidates.jsonl');
    const rows = [
      {
        schemaVersion: 3,
        kind: 'key-term',
        prompt: 'Write one source-grounded key term about evidence checking.',
        left: keyTerm('Evidence check'),
        right: keyTerm('Source comparison'),
        domain: 'computer-science',
        courseGroupId: 'source-packet-test',
        lessonId: 'lesson-1',
        sourceContext: {
          sourcePacketSha256: 'a'.repeat(64),
          kernelId: 'test/evidence',
          term: 'Evidence checking',
          claims: ['A supplied claim must support the instructional artifact being judged.'],
          attribution: ['Test fixture'],
          license: 'CC0-1.0',
        },
      },
      {
        schemaVersion: 3,
        kind: 'key-term',
        prompt: 'Write one contextless key term that must never fill the source packet.',
        left: keyTerm('Contextless draft'),
        right: keyTerm('Ungrounded draft'),
        domain: 'computer-science',
        courseGroupId: 'source-packet-test',
        lessonId: 'lesson-2',
      },
    ];
    fs.writeFileSync(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    await expect(
      buildScionBlindReviewPacket({
        sources: [source],
        outputDir: path.join(root, 'blocked'),
        limit: 2,
        requireSourceContext: true,
        generatedAt: '2026-07-16T10:05:00.000Z',
      }),
    ).rejects.toThrow('selected 1/2 admissible cases');

    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'ready'),
      limit: 1,
      requireSourceContext: true,
      generatedAt: '2026-07-16T10:05:00.000Z',
    });
    expect(packet.meta).toMatchObject({
      requestedCases: 1,
      selectedCases: 1,
      requireSourceContext: true,
      selectionEligibleCandidates: 1,
      excludedMissingSourceContext: 1,
      selectedSourceContextCases: 1,
    });
    expect(packet.cases[0].sourceContext).toBeTruthy();
  });
});
