import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectCorpus } from './inspectClassroomV3.mjs';

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'edutool-v3-inspect-'));
  await fs.mkdir(path.join(root, 'inputs'));
  await fs.mkdir(path.join(root, 'references'));
  const id = 'source-dev-01';
  const input = JSON.parse(await fs.readFile('benchmarks/classroom/v3/inputs/source-dev-01.json'));
  const reference = JSON.parse(await fs.readFile('benchmarks/classroom/v3/references/source-dev-01.json'));
  async function write(name, value, folder) {
    await fs.writeFile(path.join(root, folder, `${name}.json`), JSON.stringify(value));
  }
  await write(id, input, 'inputs');
  await write(id, reference, 'references');
  try {
    await fn({ root, input, reference, write });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
test('a valid authored case is incomplete, never a model or release pass', async () =>
  fixture(async ({ root }) => {
    const r = await inspectCorpus(root);
    assert.deepEqual(r.errors, []);
    assert.equal(r.status, 'incomplete');
    assert.equal(r.productRuns, 0);
    assert.equal(r.frozen, false);
    assert(r.missing.some((x) => x.includes('60 base cases')));
  }));
test('rejects evaluator fields inserted in the product input', async () =>
  fixture(async ({ root, input, write }) => {
    await write('source-dev-01', { ...input, referenceAnswer: 'secret answer' }, 'inputs');
    assert((await inspectCorpus(root)).errors.some((x) => x.includes('product input contract')));
  }));
test('does not count renamed copies or cross-split family reuse as independent', async () =>
  fixture(async ({ root, input, reference, write }) => {
    await write('source-res-01', input, 'inputs');
    await write('source-res-01', { ...reference, id: 'source-res-01', split: 'reserved' }, 'references');
    const r = await inspectCorpus(root);
    assert(r.errors.some((x) => x.includes('source family')));
    assert(r.errors.some((x) => x.includes('duplicate source prose')));
  }));
test('reports an orphan reference and missing contrast evidence', async () =>
  fixture(async ({ root, reference, write }) => {
    await write('orphan', reference, 'references');
    await write(
      'source-dev-01',
      { ...reference, contrastResponses: reference.contrastResponses.slice(0, 2) },
      'references',
    );
    const r = await inspectCorpus(root);
    assert(r.errors.some((x) => x.includes('missing input/reference')));
    assert(r.missing.some((x) => x.includes('four contrast')));
  }));

test('malformed records report errors rather than terminating the inventory', async () =>
  fixture(async ({ root, input, write }) => {
    await write('source-dev-01', { ...input, sources: [null] }, 'inputs');
    assert((await inspectCorpus(root)).errors.some((x) => x.includes('invalid source record')));
    await write('source-dev-01', { ...input, sources: {} }, 'inputs');
    assert((await inspectCorpus(root)).errors.some((x) => x.includes('product input contract')));
  }));
