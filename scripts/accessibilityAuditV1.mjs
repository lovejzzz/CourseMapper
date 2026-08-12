#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { capturePackageAccessibilityAuditV1 } from './lib/accessibilityAuditV1.mjs';

function argsToObject(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const args = argsToObject(argv);
  if (!args.package || !args.output) {
    throw new Error('Usage: accessibilityAuditV1 --package <package.zip> --output <receipt.json>');
  }
  const packagePath = path.resolve(args.package);
  const outputPath = path.resolve(args.output);
  const packageBytes = await fs.readFile(packagePath);
  const receipt = await capturePackageAccessibilityAuditV1({ packageBytes, packagePath });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputPath, status: receipt.status, summary: receipt.summary })}\n`);
  return receipt.status === 'passed' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
