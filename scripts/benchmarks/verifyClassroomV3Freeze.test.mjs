import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyFrozenCorpus } from './verifyClassroomV3Freeze.mjs';

async function fixture(action) {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'edutool-v3-freeze-'));
  const root = path.join(repository, 'benchmarks/classroom/v3');
  await fs.cp('benchmarks/classroom/v3', root, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
  for (const item of manifest.reviewEvidence) {
    const target = path.join(repository, item.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(item.path, target);
  }
  try {
    await action({ repository, root, manifest });
  } finally {
    await fs.rm(repository, { recursive: true, force: true });
  }
}

test('the complete frozen snapshot verifies without claiming a product run', async () => {
  const result = await verifyFrozenCorpus();
  assert.equal(result.frozen, true);
  assert.equal(result.cases, 60);
  assert.equal(result.productRuns, 0);
  assert.deepEqual(result.errors, []);
});

test('detects changed input and reference bytes even when JSON remains valid', async () =>
  fixture(async ({ root }) => {
    for (const folder of ['inputs', 'references'])
      await fs.appendFile(path.join(root, folder, 'quantity-dev-01.json'), '\n');
    const result = await verifyFrozenCorpus(root);
    assert.equal(result.frozen, false);
    assert(result.errors.some((message) => message.includes('inputSha256 changed')));
    assert(result.errors.some((message) => message.includes('referenceSha256 changed')));
  }));

test('does not accept a removed case or a duplicate manifest identity', async () =>
  fixture(async ({ root, manifest }) => {
    await fs.unlink(path.join(root, 'inputs/quantity-dev-01.json'));
    manifest.cases[1] = manifest.cases[0];
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    const result = await verifyFrozenCorpus(root);
    assert.equal(result.frozen, false);
    assert(result.errors.some((message) => message.includes('60 distinct')));
    assert(result.errors.some((message) => message.includes('missing input/reference')));
  }));

test('checks review evidence bytes and refuses an external evidence path', async () =>
  fixture(async ({ root, repository, manifest }) => {
    await fs.appendFile(path.join(repository, manifest.reviewEvidence[0].path), '\n');
    manifest.reviewEvidence[1].path = '../outside.json';
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    const result = await verifyFrozenCorpus(root);
    assert.equal(result.frozen, false);
    assert(result.errors.some((message) => message.includes('review evidence changed')));
    assert(result.errors.some((message) => message.includes('outside the repository')));
  }));
