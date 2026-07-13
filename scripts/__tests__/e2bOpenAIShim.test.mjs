import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

let serverProcess = null;
let fixtureDir = null;

async function waitForHealth(url, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      const health = await response.json();
      if (predicate(health)) return health;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('local model shim health condition timed out');
}

afterEach(async () => {
  serverProcess?.kill();
  serverProcess = null;
  if (fixtureDir) await fs.rm(fixtureDir, { recursive: true, force: true });
  fixtureDir = null;
});

it('reports queued/completed model work and attributes inner calls to the HTTP envelope', async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-shim-metrics-'));
  const workerPath = path.join(fixtureDir, 'worker.mjs');
  const bodyLogPath = path.join(fixtureDir, 'body.jsonl');
  await fs.writeFile(
    workerPath,
    `import readline from 'node:readline';
process.stdout.write(JSON.stringify({ ready: true, constrained: true }) + '\\n');
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  setTimeout(() => process.stdout.write(JSON.stringify({ id: request.id, text: '{"ok":true}', constrained: 'object' }) + '\\n'), 120);
});
`,
  );

  const port = 23_000 + Math.floor(Math.random() * 2_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['scripts/crucible/e2bOpenAIShim.mjs', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TENDRIL_ITEMS_PYTHON: process.execPath,
      TENDRIL_ITEMS_SCRIPT: workerPath,
      SHIM_BODY_LOG: bodyLogPath,
      LOCAL_MODEL_ID: 'fake-scion',
      LOCAL_MODEL_NAME: 'Fake Scion',
      SCION_MODEL: 'test/fake-scion',
    },
  });

  await waitForHealth(baseUrl, (health) => health.modelReady === true);
  const generation = fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'fake-scion',
      messages: [
        { role: 'system', content: 'Return JSON.' },
        { role: 'user', content: 'One object.' },
      ],
    }),
  });

  const active = await waitForHealth(baseUrl, (health) => health.inFlightCalls === 1);
  expect(active).toMatchObject({ calls: 1, completedCalls: 0, failedModelCalls: 0, inFlightCalls: 1 });
  const response = await generation;
  await expect(response.json()).resolves.toMatchObject({ choices: [{ message: { content: '{"ok":true}' } }] });
  const complete = await waitForHealth(baseUrl, (health) => health.completedCalls === 1);
  expect(complete).toMatchObject({ calls: 1, completedCalls: 1, failedModelCalls: 0, inFlightCalls: 0 });

  const rows = (await fs.readFile(bodyLogPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(1);
  expect(rows[0].modelMetrics).toEqual({ modelCalls: 1, completedModelCalls: 1, failedModelCalls: 0 });
});
