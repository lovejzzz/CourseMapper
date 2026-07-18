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
  const bodyLogPath = path.join(fixtureDir, 'nested', 'autopsy', 'body.jsonl');
  await fs.writeFile(
    workerPath,
    `import readline from 'node:readline';
process.stdout.write(JSON.stringify({ ready: true, constrained: true }) + '\\n');
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  setTimeout(() => process.stdout.write(JSON.stringify({ id: request.id, text: '{"ok":true}', constrained: 'object', adapterMode: request.adapterMode, nativeAdapterActive: request.adapterMode === 'adapter', adapterScale: request.adapterMode === 'adapter' ? 1 : 0 }) + '\\n'), 120);
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

  const ready = await waitForHealth(baseUrl, (health) => health.modelReady === true);
  expect(ready).toMatchObject({
    bodyLogEnabled: true,
    bodyLogPath,
    bodyLogError: '',
    adapterActive: false,
    adapterScale: null,
  });
  const models = await fetch(`${baseUrl}/v1/models`).then((response) => response.json());
  expect(models.data[0]).toMatchObject({
    source_model: 'test/fake-scion',
    source_revision: null,
    adapter_active: false,
    adapter_id: null,
    adapter_scale: null,
  });
  const generation = fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Scion-Task-Family': 'lesson-kernel' },
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
  await expect(response.json()).resolves.toMatchObject({
    choices: [{ message: { content: '{"ok":true}' } }],
    scion_adapter_route: {
      protocol: 'scion-adapter-runtime-route-v1',
      mode: 'base-only',
      taskFamily: 'lesson-kernel',
      nativeAdapterActive: false,
      modelCalls: 1,
    },
  });
  const complete = await waitForHealth(baseUrl, (health) => health.completedCalls === 1);
  expect(complete).toMatchObject({ calls: 1, completedCalls: 1, failedModelCalls: 0, inFlightCalls: 0 });

  const rows = (await fs.readFile(bodyLogPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(1);
  expect(rows[0].modelMetrics).toEqual({ modelCalls: 1, completedModelCalls: 1, failedModelCalls: 0 });
});

it('routes declared-schema knowledge kernels through the strict per-lesson generator', async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-shim-kernel-route-'));
  const workerPath = path.join(fixtureDir, 'worker.mjs');
  const bodyLogPath = path.join(fixtureDir, 'kernel.jsonl');
  const schemaLogPath = path.join(fixtureDir, 'schemas.jsonl');
  await fs.writeFile(
    workerPath,
    `import fs from 'node:fs';
import readline from 'node:readline';
process.stdout.write(JSON.stringify({ ready: true, constrained: true }) + '\\n');
function value(schema = {}) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'object') return Object.fromEntries((schema.required || []).map((key) => [key, value(schema.properties?.[key])]));
  if (schema.type === 'array') return Array.from({ length: Math.max(0, Number(schema.minItems) || 0) }, () => value(schema.items));
  if (schema.type === 'integer') return Number(schema.minimum) || 0;
  if (schema.type === 'number') return Number(schema.minimum) || 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'string') return 'x'.repeat(Math.max(1, Number(schema.minLength) || 1));
  return null;
}
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  fs.appendFileSync(process.env.SCHEMA_LOG, JSON.stringify(request.schema || null) + '\\n');
  process.stdout.write(JSON.stringify({ id: request.id, text: JSON.stringify(value(request.schema || { type: 'object', properties: {}, required: [] })), constrained: 'object', adapterMode: request.adapterMode, nativeAdapterActive: request.adapterMode === 'adapter', adapterScale: request.adapterMode === 'adapter' ? 1 : 0 }) + '\\n');
});
`,
  );

  const port = 27_000 + Math.floor(Math.random() * 2_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['scripts/crucible/e2bOpenAIShim.mjs', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TENDRIL_ITEMS_PYTHON: process.execPath,
      TENDRIL_ITEMS_SCRIPT: workerPath,
      SHIM_BODY_LOG: bodyLogPath,
      SCHEMA_LOG: schemaLogPath,
      LOCAL_MODEL_ID: 'fake-scion',
      LOCAL_MODEL_NAME: 'Fake Scion',
      SCION_MODEL: 'test/fake-scion',
    },
  });
  await waitForHealth(baseUrl, (health) => health.modelReady === true);

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Scion-Task-Family': 'lesson-kernel' },
    body: JSON.stringify({
      model: 'fake-scion',
      messages: [
        {
          role: 'system',
          content:
            'For every lesson in the request, return one knowledge kernel: 5-8 facts, 4 keyTerms, and exactly 1 mc items.',
        },
        {
          role: 'user',
          content: 'Course: Testing Basics\\nLessons:\\n[{"lessonId":"lesson-1","title":"Lesson 1: Testing"}]',
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'kernel_lesson_batch',
          strict: true,
          schema: { type: 'object', properties: { lessons: { type: 'array' } }, required: ['lessons'] },
        },
      },
    }),
  });
  const payload = await response.json();
  const generated = JSON.parse(payload.choices[0].message.content);
  expect(generated.lessons[0]).toMatchObject({ lessonId: 'lesson-1' });
  expect(generated.lessons[0]).toHaveProperty('facts');
  expect(generated.lessons[0]).toHaveProperty('scenario');
  expect(generated.lessons[0]).toHaveProperty('mc');
  expect(payload.scion_adapter_route).toMatchObject({
    mode: 'base-only',
    taskFamily: 'lesson-kernel',
    nativeAdapterActive: false,
  });

  const rows = (await fs.readFile(bodyLogPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(1);
  expect(rows[0].modelMetrics.modelCalls).toBeGreaterThan(1);

  const schemas = (await fs.readFile(schemaLogPath, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const stringSchemas = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'string') stringSchemas.push(node);
    Object.values(node).forEach(visit);
  };
  schemas.forEach(visit);
  expect(stringSchemas.some((schema) => schema.pattern)).toBe(true);
  expect(stringSchemas.every((schema) => !(schema.pattern && ('minLength' in schema || 'maxLength' in schema)))).toBe(
    true,
  );
});

it('refuses a bare adapter folder without an integrity manifest', async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-shim-bare-adapter-'));
  const adapterDir = path.join(fixtureDir, 'adapter');
  await fs.mkdir(adapterDir, { recursive: true });
  const port = 25_000 + Math.floor(Math.random() * 2_000);
  const baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['scripts/crucible/e2bOpenAIShim.mjs', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SCION_ADAPTERS: adapterDir,
      SCION_ADAPTER_MANIFEST: '',
      LOCAL_MODEL_ID: 'fake-scion',
      LOCAL_MODEL_NAME: 'Fake Scion',
      SCION_MODEL: 'test/fake-scion',
    },
  });

  const failed = await waitForHealth(baseUrl, (health) => health.modelState === 'failed');
  expect(failed).toMatchObject({
    modelReady: false,
    adapterState: 'failed',
    adapterActive: false,
  });
  expect(failed.modelLoadError).toContain('bare SCION_ADAPTERS/G4_ADAPTERS path is not trusted');
});
