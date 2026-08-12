import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { preregisterVerifiedCoherentDraftCampaign } from '../preregisterVerifiedCoherentDraftCampaign.mjs';

const execFileAsync = promisify(execFile);
const roots = [];

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-preregister-'));
  roots.push(root);
  await execFileAsync('git', ['init', '-q'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
  await fs.mkdir(path.join(root, 'evaluation'), { recursive: true });
  await fs.writeFile(path.join(root, 'evaluation/policy.json'), '{}\n');
  await fs.writeFile(path.join(root, 'evaluation/rubric.json'), '{}\n');
  await fs.writeFile(path.join(root, 'source.pdf'), 'source bytes');
  const runs = [5, 8, 14].map((lessonScope, index) => ({
    id: `run-${index + 1}`,
    lessonScope,
    inputCondition: index === 1 ? 'external-pdf-fresh-generation' : 'prompt-only-fresh-generation',
    prompt: `Fresh prompt ${index + 1}`,
    ...(index === 1 ? { source: { path: 'source.pdf' } } : {}),
    outputSlots: { package: `audit/run-${index + 1}/package.zip` },
  }));
  const plan = {
    protocol: 'coursemapper-verified-coherent-draft-campaign-plan-v1',
    campaignId: 'fresh-v1',
    candidateVersion: '0.0.0',
    policyPath: 'evaluation/policy.json',
    qualityBenchmarkPath: 'evaluation/rubric.json',
    runs,
  };
  await fs.writeFile(path.join(root, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return { root, plan };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('preregisterVerifiedCoherentDraftCampaign', () => {
  it('freezes prompts and sources before fresh projects exist and writes exact-byte evidence', async () => {
    const { root, plan } = await fixture();
    await fs.appendFile(path.join(root, 'evaluation/policy.json'), '{"candidate":true}\n');
    const receipt = await preregisterVerifiedCoherentDraftCampaign({
      repoRoot: root,
      planPath: 'plan.json',
      outputPath: 'evidence/preregistration.json',
      generatorManifestPath: 'evidence/generator.sha256',
      frozenAt: '2026-08-11T01:00:00.000Z',
    });

    expect(receipt.runs).toHaveLength(3);
    expect(receipt.runs.every((run) => run.sourceProject === undefined)).toBe(true);
    expect(receipt.runs[0].source).toMatchObject({
      kind: 'inline-prompt',
      sha256: hash(Buffer.from(plan.runs[0].prompt)),
    });
    expect(receipt.runs[1].source).toMatchObject({ path: 'source.pdf', sha256: hash(Buffer.from('source bytes')) });
    expect(receipt.candidatePatch).toMatchObject({
      protocol: 'git-diff-binary-head-v1',
      sha256: receipt.candidatePatchSha256,
    });
    expect(receipt.candidatePatch.bytes).toBeGreaterThan(0);
    expect(receipt.candidatePatchSha256).not.toBe(receipt.generatorState.sha256);
    const outputBytes = await fs.readFile(path.join(root, 'evidence/preregistration.json'));
    expect(JSON.parse(outputBytes).campaignId).toBe('fresh-v1');
    expect(hash(outputBytes)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a saved source project in a fresh-generation run', async () => {
    const { root, plan } = await fixture();
    await fs.writeFile(path.join(root, 'saved.coursemapper'), '{}\n');
    plan.runs[0].sourceProject = { path: 'saved.coursemapper' };
    await fs.writeFile(path.join(root, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

    await expect(
      preregisterVerifiedCoherentDraftCampaign({
        repoRoot: root,
        planPath: 'plan.json',
        outputPath: 'evidence/preregistration.json',
        generatorManifestPath: 'evidence/generator.sha256',
      }),
    ).rejects.toThrow(/fresh-generation run cannot preregister/i);
  });
});
