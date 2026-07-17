import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveItemsRuntime } from '../trellis/tendril/sModel.mjs';

const execFileAsync = promisify(execFile);

describe('Tendril local-model startup', () => {
  it('prefers an explicit runtime and otherwise resolves a repository fallback', () => {
    expect(
      resolveItemsRuntime({ cwd: '/workspace', home: '/missing-home', env: { TENDRIL_ITEMS_PYTHON: '/mlx/python' } }),
    ).toEqual({ python: '/mlx/python', script: '/workspace/trellis/tendril/distill/serve_g4.py' });
    expect(resolveItemsRuntime({ cwd: '/workspace', home: '/missing-home', env: {} })).toEqual({
      python: '/workspace/trellis/tendril/.venv-g4/bin/python',
      script: '/workspace/trellis/tendril/distill/serve_g4.py',
    });
  });

  it('releases its startup timer immediately when the configured executable cannot spawn', async () => {
    const started = Date.now();
    const script = [
      "import('./trellis/tendril/sModel.mjs')",
      '  .then(({ startItems }) => startItems({ timeoutMs: 60_000 }))',
      '  .then(() => { process.exitCode = 2; })',
      '  .catch(() => { process.exitCode = 0; });',
    ].join('\n');

    await expect(
      execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TENDRIL_ITEMS_PYTHON: '/definitely/missing/scion-python',
        },
        timeout: 5_000,
      }),
    ).resolves.toMatchObject({ stderr: '', stdout: '' });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('returns the serving constraint tier only when metadata is requested', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tendril-runtime-receipt-'));
    const serverPath = path.join(root, 'server.mjs');
    await fs.writeFile(
      serverPath,
      [
        "import readline from 'node:readline';",
        'console.log(JSON.stringify({ ready: true }));',
        "readline.createInterface({ input: process.stdin }).on('line', (line) => {",
        '  const request = JSON.parse(line);',
        "  console.log(JSON.stringify({ id: request.id, text: '{}', constrained: 'schema' }));",
        '});',
      ].join('\n'),
    );
    const moduleUrl = pathToFileURL(path.resolve('trellis/tendril/sModel.mjs')).href;
    const script = [
      `const model = await import(${JSON.stringify(moduleUrl)});`,
      "const plain = await model.sGenerate({ system: 's', user: 'u', task: 'items' });",
      "const detailed = await model.sGenerate({ system: 's', user: 'u', task: 'items' }, { includeMetadata: true });",
      'console.log(JSON.stringify({ plain, detailed }));',
      'model.stopS();',
    ].join('\n');
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TENDRIL_ITEMS_PYTHON: process.execPath,
        TENDRIL_ITEMS_SCRIPT: serverPath,
      },
      timeout: 5_000,
    });
    expect(JSON.parse(stdout.trim())).toEqual({ plain: '{}', detailed: { text: '{}', constrained: 'schema' } });
    await fs.rm(root, { recursive: true, force: true });
  });
});
