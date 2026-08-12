#!/usr/bin/env node

import fs from 'node:fs/promises';

import { captureFunctionalVisualAuditV1, verifyFunctionalVisualAuditV1 } from './lib/functionalVisualAuditV1.mjs';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const command = process.argv[2] || '';
const root = arg('root', process.cwd());
const receiptPath = arg('receipt');

if (command === 'capture') {
  const receipt = await captureFunctionalVisualAuditV1({
    root,
    packagePath: arg('package'),
    packageDirectory: arg('package-dir'),
    packageRenderReceiptPath: arg('render-receipt'),
    inspectionPath: arg('inspection'),
  });
  if (receiptPath) await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = receipt.status === 'passed' ? 0 : 1;
} else if (command === 'verify') {
  if (!receiptPath) throw new Error('--receipt is required');
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  const result = await verifyFunctionalVisualAuditV1(receipt, { root });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.passed ? 0 : 1;
} else {
  process.stderr.write(
    'Usage: functionalVisualAuditV1.mjs capture|verify --root <root> --package <zip> --package-dir <dir> --render-receipt <json> --inspection <json> --receipt <json>\n',
  );
  process.exitCode = 2;
}
