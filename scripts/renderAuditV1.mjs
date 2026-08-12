#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  capturePackageRenderAuditV1,
  captureRenderAuditV1,
  verifyPackageRenderAuditV1,
  verifyRenderAuditV1,
} from './lib/renderAuditV1.mjs';

function argsToObject(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      result._.push(value);
      continue;
    }
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

async function readJson(filePath, fallback = {}) {
  if (!filePath) return fallback;
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

function usage() {
  return [
    'Capture:',
    '  node scripts/renderAuditV1.mjs capture --root <dir> --source <file> --renders <dir> --kind docx|pptx',
    '    --inspection <json> --renderer-id <id> --renderer-version <version> --replay-command <command>',
    '    --replay-environment <description> --output <receipt.json> [--roles <json>] [--findings <json>]',
    'Verify:',
    '  node scripts/renderAuditV1.mjs verify --root <dir> --receipt <receipt.json>',
    'Bundle:',
    '  node scripts/renderAuditV1.mjs bundle --root <dir> --package <zip> --package-dir <dir> --receipts <dir> --output <receipt.json>',
    'Verify bundle:',
    '  node scripts/renderAuditV1.mjs verify-bundle --root <dir> --receipt <receipt.json>',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const args = argsToObject(argv);
  const command = args._[0];
  if (command === 'capture') {
    const required = [
      'source',
      'renders',
      'kind',
      'inspection',
      'renderer-id',
      'renderer-version',
      'replay-command',
      'replay-environment',
      'output',
    ];
    const missing = required.filter((key) => !args[key]);
    if (missing.length > 0) throw new Error(`Missing capture arguments: ${missing.join(', ')}`);
    const root = path.resolve(args.root || process.cwd());
    const receipt = await captureRenderAuditV1({
      root,
      sourcePath: args.source,
      renderDirectory: args.renders,
      kind: args.kind,
      roles: await readJson(args.roles),
      findings: await readJson(args.findings, []),
      inspection: await readJson(args.inspection),
      renderer: { id: args['renderer-id'], version: args['renderer-version'] },
      replay: { command: args['replay-command'], environment: args['replay-environment'] },
    });
    const output = path.resolve(args.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ output, status: receipt.status, receiptSha256: receipt.receiptSha256 })}\n`,
    );
    return receipt.status === 'passed' ? 0 : 1;
  }
  if (command === 'verify') {
    if (!args.receipt) throw new Error('Missing --receipt');
    const receipt = await readJson(args.receipt);
    const result = await verifyRenderAuditV1(receipt, { root: path.resolve(args.root || process.cwd()) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.passed ? 0 : 1;
  }
  if (command === 'bundle') {
    const required = ['package', 'package-dir', 'receipts', 'output'];
    const missing = required.filter((key) => !args[key]);
    if (missing.length > 0) throw new Error(`Missing bundle arguments: ${missing.join(', ')}`);
    const root = path.resolve(args.root || process.cwd());
    const receipt = await capturePackageRenderAuditV1({
      root,
      packagePath: args.package,
      packageDirectory: args['package-dir'],
      receiptDirectory: args.receipts,
    });
    const output = path.resolve(args.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ output, status: receipt.status, receiptSha256: receipt.receiptSha256 })}\n`,
    );
    return receipt.status === 'passed' ? 0 : 1;
  }
  if (command === 'verify-bundle') {
    if (!args.receipt) throw new Error('Missing --receipt');
    const receipt = await readJson(args.receipt);
    const result = await verifyPackageRenderAuditV1(receipt, { root: path.resolve(args.root || process.cwd()) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.passed ? 0 : 1;
  }
  process.stderr.write(`${usage()}\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
