#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { scionSourceKernelPayload, scionSourceKernelSha256 } from './lib/scionSourceTaskIdentity.mjs';

const OUTPUT = 'evaluation/scion-adapters/evidence/prior-judged-source-kernels-v0.16.47.json';
const WORKBOOKS = [
  'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41',
  'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.47',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readWorkbook(root, directory) {
  const names = (await fs.readdir(path.join(root, directory)))
    .filter((name) => /^chunk-\d+-review-a-b\.json$/.test(name))
    .sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const relativePath = path.posix.join(directory, name);
      const raw = await fs.readFile(path.join(root, relativePath));
      return { path: relativePath, bytes: raw.length, sha256: sha256(raw), reviews: JSON.parse(raw).reviews || [] };
    }),
  );
  return { directory, files, reviews: files.flatMap((file) => file.reviews) };
}

export async function buildScionSourceKernelExclusionsV01647({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const workbooks = await Promise.all(WORKBOOKS.map((directory) => readWorkbook(root, directory)));
  const reviews = workbooks.flatMap((workbook) => workbook.reviews);
  const identities = new Map();
  for (const review of reviews) {
    const identity = scionSourceKernelSha256(review);
    const payload = scionSourceKernelPayload(review);
    const existing = identities.get(identity);
    if (existing && JSON.stringify(existing.payload) !== JSON.stringify(payload)) {
      throw new Error(`Source-kernel hash collision: ${identity}`);
    }
    identities.set(identity, {
      domain: review.domain,
      kernelId: review.sourceContext?.kernelId,
      term: review.sourceContext?.term,
      payload,
      sourceContext: review.sourceContext,
    });
  }
  const sourceKernelSha256 = [...identities.keys()].sort();
  const byDomain = Object.fromEntries(
    [...new Set([...identities.values()].map((entry) => entry.domain))]
      .sort()
      .map((domain) => [domain, [...identities.values()].filter((entry) => entry.domain === domain).length]),
  );
  if (
    reviews.length !== 220 ||
    sourceKernelSha256.length !== 37 ||
    JSON.stringify(byDomain) !==
      JSON.stringify({
        'computer-science': 12,
        geology: 12,
        'music-theory': 7,
        'user-experience-design': 6,
      })
  ) {
    throw new Error(
      `Prior source-kernel inventory drifted: ${reviews.length} reviews / ${sourceKernelSha256.length} kernels`,
    );
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-source-kernel-exclusions-v1',
    release: 'v0.16.47',
    generatedAt: '2026-07-16T22:30:00.000Z',
    status: 'prior-judged-source-kernels-bound',
    sourceKernelSha256,
    sourceKernelCount: sourceKernelSha256.length,
    sourceKernelCountsByDomain: byDomain,
    reviewedCases: reviews.length,
    workbooks: workbooks.map((workbook) => ({
      directory: workbook.directory,
      cases: workbook.reviews.length,
      files: workbook.files.map(({ path: filePath, bytes, sha256: digest }) => ({
        path: filePath,
        bytes,
        sha256: digest,
      })),
    })),
    claimBoundary:
      'These hashes exclude semantic source kernels already exposed to the v0.16.41 or v0.16.47 A/B judge workbooks. They are not preference labels and do not prove that an unlisted kernel is high quality.',
  };
}

export async function runScionSourceKernelExclusionsV01647({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionSourceKernelExclusionsV01647({ cwd });
  const output = path.resolve(cwd, OUTPUT);
  if (write) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, canonical(report));
  } else {
    const tracked = await fs.readFile(output, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked prior source-kernel exclusions are stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown source-kernel exclusion option');
  const result = await runScionSourceKernelExclusionsV01647({ write: args.has('--write') });
  console.log(
    `Scion prior source kernels: ${result.report.sourceKernelCount} kernels / ${result.report.reviewedCases} judged cases.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
