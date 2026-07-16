#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { buildScionBlindReviewPacket } from './scionBlindReviewPacket.mjs';

const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/source-review-packet-v0.16.40.json';

function parseArgs(argv) {
  const args = { receipt: DEFAULT_RECEIPT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--receipt') args.receipt = argv[++index] || args.receipt;
    else throw new Error(`Unknown source review packet audit option: ${argv[index]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedRaw = await fs.readFile(args.receipt, 'utf8');
  const expected = JSON.parse(expectedRaw);
  if (expected.requireSourceContext !== true) throw new Error('Tracked source review packet is not source-only');
  if (expected.selectedCases !== expected.requestedCases) {
    throw new Error(`Tracked source review packet is incomplete: ${expected.selectedCases}/${expected.requestedCases}`);
  }
  if (expected.selectedSourceContextCases !== expected.selectedCases) {
    throw new Error('Tracked source review packet contains a case without neutral source context');
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-source-review-packet-'));
  try {
    const receiptOutput = path.join(temporary, 'receipt.json');
    const rebuilt = await buildScionBlindReviewPacket({
      outputDir: path.join(temporary, 'packet'),
      limit: expected.requestedCases,
      perDomainLimit: expected.perDomainLimit || 0,
      heldOutBenchmark: expected.heldOutBenchmark.path,
      receiptOutput,
      requireSourceContext: true,
      generatedAt: expected.generatedAt,
      semanticAdmission: false,
    });
    const observedRaw = await fs.readFile(receiptOutput, 'utf8');
    if (observedRaw !== expectedRaw) throw new Error('Tracked source review packet receipt is stale');
    if (rebuilt.meta.selectedCases !== expected.selectedCases) throw new Error('Rebuilt source packet count mismatch');
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  console.log(
    `Scion source review packet verified: ${expected.selectedCases}/${expected.requestedCases} source-grounded cases across ${expected.domains.length} domains / ${expected.courseGroupCount} course groups.`,
  );
  console.log(`Evidence: ${args.receipt}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
