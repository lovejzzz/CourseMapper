import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { preflightSourceCaptureArm } from '../scripts/scionSourceCapture.mjs';
import { sourceGroupMinimumAdmittedPrompts } from '../scripts/lib/scionSourceCapture.mjs';

const ENV_KEYS = [
  'COURSEMAPPER_API_ENV',
  'COURSEMAPPER_OPENAI_API_KEY',
  'HF_HUB_CACHE',
  'OPENAI_API_KEY',
  'TENDRIL_ITEMS_PYTHON',
  'TENDRIL_ITEMS_SCRIPT',
];
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnvironment[key] == null) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

describe('Scion source-capture runtime preflight', () => {
  it('can complete a deliberately focused one-prompt source group', () => {
    expect(sourceGroupMinimumAdmittedPrompts({ prompts: [{}] })).toBe(1);
    expect(sourceGroupMinimumAdmittedPrompts({ prompts: [{}, {}] })).toBe(2);
    expect(sourceGroupMinimumAdmittedPrompts({ prompts: [{}, {}, {}] })).toBe(2);
  });

  it('fails once, before capture, when the configured local runtime is absent', async () => {
    process.env.TENDRIL_ITEMS_PYTHON = '/definitely/missing/scion-python';
    await expect(
      preflightSourceCaptureArm({
        arm: 'local',
        model: { id: 'google/example', revision: 'revision' },
      }),
    ).rejects.toThrow('Set TENDRIL_ITEMS_PYTHON');
  });

  it('accepts an explicit executable, serving script, and exact cached revision', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-capture-preflight-'));
    const pythonPath = path.join(root, 'python');
    const scriptPath = path.join(root, 'serve_g4.py');
    const cacheRoot = path.join(root, 'cache');
    const snapshotPath = path.join(cacheRoot, 'models--google--example', 'snapshots', 'revision');
    await fs.mkdir(snapshotPath, { recursive: true });
    await fs.writeFile(pythonPath, '#!/bin/sh\nexit 0\n');
    await fs.chmod(pythonPath, 0o755);
    await fs.writeFile(scriptPath, '# test fixture\n');
    await fs.writeFile(path.join(snapshotPath, 'config.json'), '{}\n');
    await fs.writeFile(path.join(snapshotPath, 'model-00001-of-00002.safetensors'), 'fixture');
    process.env.TENDRIL_ITEMS_PYTHON = pythonPath;
    process.env.TENDRIL_ITEMS_SCRIPT = scriptPath;
    process.env.HF_HUB_CACHE = cacheRoot;

    await expect(
      preflightSourceCaptureArm({
        arm: 'local',
        model: { id: 'google/example', revision: 'revision' },
      }),
    ).resolves.toMatchObject({ arm: 'local', pythonPath, scriptPath, snapshotPath });
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts a reference credential during preflight without making a model call', async () => {
    process.env.COURSEMAPPER_OPENAI_API_KEY = 'test-only-reference-key';
    await expect(preflightSourceCaptureArm({ arm: 'reference', model: { id: 'gpt-test' } })).resolves.toMatchObject({
      arm: 'reference',
      provider: 'openai',
      credentialSource: 'environment',
    });
  });
});
