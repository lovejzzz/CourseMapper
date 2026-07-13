import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

it('queues concurrent item requests until the shared local worker is ready', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-ready-fixture-'));
  const fixturePath = path.join(fixtureDir, 'immediate-server.mjs');
  await fs.writeFile(
    fixturePath,
    `import readline from 'node:readline';
let ready = false;
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify(
    ready
      ? { id: request.id, text: 'ok', constrained: 'schema' }
      : { id: request.id, error: 'request-before-ready' }
  ) + '\\n');
});
setTimeout(() => {
  ready = true;
  process.stdout.write(JSON.stringify({ ready: true, constrained: true }) + '\\n');
}, 100);
`,
  );

  const previousPython = process.env.TENDRIL_ITEMS_PYTHON;
  const previousScript = process.env.TENDRIL_ITEMS_SCRIPT;
  process.env.TENDRIL_ITEMS_PYTHON = process.execPath;
  process.env.TENDRIL_ITEMS_SCRIPT = fixturePath;
  const runtimeUrl = pathToFileURL(path.resolve('trellis/tendril/sModel.mjs'));
  runtimeUrl.searchParams.set('ready-test', String(Date.now()));
  const runtime = await import(/* @vite-ignore */ runtimeUrl.href);

  try {
    const request = (label) =>
      runtime.sGenerate(
        { task: 'items', system: 'test', user: label, maxTokens: 8, jsonMode: true },
        { timeoutMs: 2_000 },
      );
    await expect(Promise.all([request('first'), request('second')])).resolves.toEqual(['ok', 'ok']);
  } finally {
    runtime.stopS();
    if (previousPython === undefined) delete process.env.TENDRIL_ITEMS_PYTHON;
    else process.env.TENDRIL_ITEMS_PYTHON = previousPython;
    if (previousScript === undefined) delete process.env.TENDRIL_ITEMS_SCRIPT;
    else process.env.TENDRIL_ITEMS_SCRIPT = previousScript;
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});
