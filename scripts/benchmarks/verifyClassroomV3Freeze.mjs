import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectCorpus } from './inspectClassroomV3.mjs';

export async function verifyFrozenCorpus(root = 'benchmarks/classroom/v3') {
  const bytes = await fs.readFile(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(bytes);
  const inventory = await inspectCorpus(root);
  const errors = [...inventory.errors, ...inventory.missing];
  if (
    manifest.protocol !== 'edutool-classroom-v3-protocol-1' ||
    manifest.version !== 1 ||
    manifest.status !== 'frozen' ||
    !/^[a-f0-9]{40}$/.test(manifest.baselineCommit) ||
    !Number.isFinite(Date.parse(manifest.frozenAt)) ||
    manifest.authorKind !== 'implementer-constructed' ||
    manifest.reviewerKind !== 'implementer' ||
    manifest.independentReview !== false
  )
    errors.push('Invalid freeze identity or provenance.');
  const entries = Array.isArray(manifest.cases) ? manifest.cases : [];
  if (entries.length !== 60 || new Set(entries.map((entry) => entry.id)).size !== 60)
    errors.push('Frozen manifest must contain 60 distinct base cases.');
  const keys = ['family', 'split', 'language', 'scope', 'sourceFamily', 'inputSha256', 'referenceSha256'];
  for (const entry of inventory.cases) {
    const frozen = entries.find((item) => item.id === entry.id);
    if (!frozen) errors.push(`${entry.id}: missing from frozen manifest.`);
    else for (const key of keys) if (frozen[key] !== entry[key]) errors.push(`${entry.id}: frozen ${key} changed.`);
  }
  for (const entry of entries)
    if (!inventory.cases.some((item) => item.id === entry.id)) errors.push(`${entry.id}: frozen case is absent.`);
  for (const evidence of manifest.reviewEvidence || []) {
    // Evidence references stay within this corpus's repository root.
    const repository = path.resolve(root, '../../..');
    const target = path.resolve(repository, evidence.path || '');
    if (!target.startsWith(repository + path.sep)) {
      errors.push('Review evidence is outside the repository.');
      continue;
    }
    try {
      const digest = createHash('sha256')
        .update(await fs.readFile(target))
        .digest('hex');
      if (digest !== evidence.sha256) errors.push(`${evidence.path}: review evidence changed.`);
    } catch {
      errors.push(`${evidence.path}: review evidence missing.`);
    }
  }
  if (!Array.isArray(manifest.reviewEvidence) || manifest.reviewEvidence.length < 2)
    errors.push('Freeze requires content/family and arithmetic review evidence.');
  return {
    status: errors.length ? 'invalid' : 'verified-frozen-corpus',
    frozen: !errors.length,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    cases: inventory.cases.length,
    productRuns: 0,
    errors,
    limitation:
      'Verifies the corpus snapshot and author review evidence, not model quality or independent classroom acceptance.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await verifyFrozenCorpus(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
