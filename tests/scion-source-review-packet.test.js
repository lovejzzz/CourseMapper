import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildScionBlindReviewPacket } from '../scripts/scionBlindReviewPacket.mjs';
import { scionSourceKernelSha256, scionSourceTaskSha256 } from '../scripts/lib/scionSourceTaskIdentity.mjs';

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

function mcItem(question) {
  return JSON.stringify({
    q: question,
    op: ['The supported relationship', 'An unrelated preference', 'A contradictory claim', 'A missing observation'],
    ai: 0,
    ex: 'The first option follows the supplied claim; the other choices are unrelated, contradictory, or unsupported.',
  });
}

describe('source-only Scion review packets', () => {
  it('excludes exact source rows already judged in a prior hash-bound campaign', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scion-source-exclusion-test-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'candidates.jsonl');
    const prior = {
      kind: 'key-term',
      prompt: 'Write the previously judged source-grounded key term.',
      left: keyTerm('Prior evidence check'),
      right: keyTerm('Prior source comparison'),
      domain: 'computer-science',
      courseGroupId: 'prior-source-packet',
      lessonId: 'lesson-1',
      sourceContext: {
        sourcePacketSha256: 'a'.repeat(64),
        kernelId: 'test/prior',
        term: 'Prior evidence',
        claims: ['A prior campaign already judged this exact candidate row.'],
        attribution: ['Test fixture'],
        license: 'CC0-1.0',
      },
    };
    const fresh = {
      ...prior,
      prompt: 'Write the fresh source-grounded key term.',
      courseGroupId: 'fresh-source-packet',
      sourceContext: {
        ...prior.sourceContext,
        kernelId: 'test/fresh',
        term: 'Fresh evidence',
        claims: ['This candidate row has not appeared in the prior campaign.'],
      },
    };
    fs.writeFileSync(source, `${JSON.stringify(prior)}\n${JSON.stringify(fresh)}\n`);
    const manifest = path.join(root, 'exclusions.json');
    fs.writeFileSync(
      manifest,
      `${JSON.stringify({
        schemaVersion: 1,
        protocol: 'scion-source-row-exclusions-v1',
        sourceRowSha256: [crypto.createHash('sha256').update(JSON.stringify(prior)).digest('hex')],
      })}\n`,
    );

    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'packet'),
      limit: 1,
      requireSourceContext: true,
      exclusionManifest: manifest,
      generatedAt: '2026-07-16T18:00:00.000Z',
    });

    expect(packet.cases).toHaveLength(1);
    expect(packet.cases[0].prompt).toBe(fresh.prompt);
    expect(packet.meta.sourceRowExclusions).toMatchObject({
      protocol: 'scion-source-row-exclusions-v1',
      declaredCount: 1,
      matchedCount: 1,
      unmatchedCount: 0,
    });
  });

  it('excludes repeated source tasks even when the model-output row and course group are new', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scion-source-task-exclusion-test-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'candidates.jsonl');
    const priorTask = {
      kind: 'key-term',
      prompt: 'Write one source-grounded key term about repeated evidence.',
      left: keyTerm('First sample'),
      right: keyTerm('First reference'),
      domain: 'computer-science',
      courseGroupId: 'first-course-group',
      lessonId: 'lesson-1',
      sourceContext: {
        sourcePacketSha256: 'a'.repeat(64),
        kernelId: 'test/repeated-task',
        term: 'Repeated task',
        claims: ['The same source task can produce multiple model-output samples.'],
        attribution: ['Test fixture'],
        license: 'CC0-1.0',
      },
    };
    const repeatedTask = {
      ...priorTask,
      prompt: 'Write another model sample for the same source-grounded key-term task.',
      left: keyTerm('Second sample'),
      right: keyTerm('Second reference'),
      courseGroupId: 'second-course-group',
      sourceContext: { ...priorTask.sourceContext, sourcePacketSha256: 'b'.repeat(64) },
    };
    const novelTask = {
      ...priorTask,
      prompt: 'Write one model sample for a genuinely new source task.',
      left: keyTerm('Novel sample'),
      right: keyTerm('Novel reference'),
      courseGroupId: 'novel-course-group',
      sourceContext: {
        ...priorTask.sourceContext,
        sourcePacketSha256: 'c'.repeat(64),
        kernelId: 'test/novel-task',
        term: 'Novel task',
        claims: ['A novel source task introduces source claims that were not judged in the prior campaign.'],
      },
    };
    fs.writeFileSync(source, `${[priorTask, repeatedTask, novelTask].map((row) => JSON.stringify(row)).join('\n')}\n`);
    const manifest = path.join(root, 'task-exclusions.json');
    fs.writeFileSync(
      manifest,
      `${JSON.stringify({
        schemaVersion: 1,
        protocol: 'scion-source-task-exclusions-v1',
        sourceTaskSha256: [scionSourceTaskSha256(priorTask)],
      })}\n`,
    );

    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'packet'),
      limit: 1,
      requireSourceContext: true,
      taskExclusionManifest: manifest,
      generatedAt: '2026-07-16T18:10:00.000Z',
    });

    expect(packet.cases).toHaveLength(1);
    expect(packet.cases[0].prompt).toBe(novelTask.prompt);
    expect(packet.meta.sourceTaskExclusions).toMatchObject({
      protocol: 'scion-source-task-exclusions-v1',
      declaredCount: 1,
      matchedRows: 2,
      matchedTasks: 1,
      unmatchedCount: 0,
    });
  });

  it('can exclude an entire source kernel across different artifact kinds', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scion-source-kernel-exclusion-test-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'candidates.jsonl');
    const sourceContext = {
      sourcePacketSha256: 'a'.repeat(64),
      kernelId: 'test/shared-kernel',
      term: 'Shared kernel',
      claims: ['One semantic source kernel can support more than one artifact kind.'],
      attribution: ['Test fixture'],
      license: 'CC0-1.0',
    };
    const priorKeyTerm = {
      kind: 'key-term',
      prompt: 'Write a key term from the shared source kernel.',
      left: keyTerm('Shared concept'),
      right: keyTerm('Shared relationship'),
      domain: 'computer-science',
      courseGroupId: 'prior-key-term-group',
      sourceContext,
    };
    const newMcTask = {
      kind: 'mc-item',
      prompt: 'Write a multiple-choice item from the shared source kernel.',
      left: mcItem('Which statement is supported by the shared source kernel?'),
      right: mcItem('Which relationship does the shared source kernel describe?'),
      domain: 'computer-science',
      courseGroupId: 'new-mc-group',
      sourceContext: { ...sourceContext, sourcePacketSha256: 'b'.repeat(64) },
    };
    fs.writeFileSync(source, `${JSON.stringify(newMcTask)}\n`);
    expect(scionSourceTaskSha256(priorKeyTerm)).not.toBe(scionSourceTaskSha256(newMcTask));
    expect(scionSourceKernelSha256(priorKeyTerm)).toBe(scionSourceKernelSha256(newMcTask));

    const manifest = path.join(root, 'kernel-exclusions.json');
    fs.writeFileSync(
      manifest,
      `${JSON.stringify({
        schemaVersion: 1,
        protocol: 'scion-source-kernel-exclusions-v1',
        sourceKernelSha256: [scionSourceKernelSha256(priorKeyTerm)],
      })}\n`,
    );
    const packet = await buildScionBlindReviewPacket({
      sources: [source],
      outputDir: path.join(root, 'packet'),
      limit: 1,
      kernelExclusionManifest: manifest,
      generatedAt: '2026-07-16T18:20:00.000Z',
    });

    expect(packet.cases).toHaveLength(0);
    expect(packet.meta.sourceKernelExclusions).toMatchObject({
      protocol: 'scion-source-kernel-exclusions-v1',
      declaredCount: 1,
      matchedRows: 1,
      matchedKernels: 1,
      unmatchedCount: 0,
    });
  });

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
