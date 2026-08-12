#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { capturePackageRenderAuditV1, captureRenderAuditV1 } from './lib/renderAuditV1.mjs';

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

async function readJson(filePath, fallback = {}) {
  if (!filePath) return fallback;
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

export async function captureInspectedPackageRenderV1({
  root,
  indexPath,
  packagePath,
  packageDirectory,
  outputDirectory,
  reviewerId,
  reviewedAt,
  findingsByArtifact = {},
  rolesByArtifact = {},
  rendererVersion = 'soffice+pdftoppm',
  replayEnvironment = `${process.platform}-${process.arch}`,
} = {}) {
  if (!reviewerId || !reviewedAt) throw new Error('Reviewer identity and inspection time are required');
  const absoluteRoot = path.resolve(root || process.cwd());
  const index = await readJson(path.resolve(absoluteRoot, indexPath));
  if (index?.protocol !== 'coursemapper-package-render-index-v1') throw new Error('Unsupported render index');
  const receiptDirectory = path.resolve(absoluteRoot, outputDirectory, 'artifacts');
  await fs.mkdir(receiptDirectory, { recursive: true });

  const childReceipts = [];
  for (const artifact of index.artifacts || []) {
    const prefix = artifact.kind === 'pptx' ? 'slide' : 'page';
    const reviewedItemIds = Array.from({ length: artifact.itemCount }, (_, offset) => `${prefix}-${offset + 1}`);
    const receipt = await captureRenderAuditV1({
      root: absoluteRoot,
      sourcePath: artifact.sourcePath,
      renderDirectory: artifact.renderDirectory,
      kind: artifact.kind,
      roles: rolesByArtifact[artifact.id] || {},
      findings: findingsByArtifact[artifact.id] || [],
      inspection: {
        status: 'complete',
        reviewerId,
        reviewedAt,
        reviewedItemIds,
      },
      renderer: { id: index.renderer?.id || 'libreoffice-pdf-poppler', version: rendererVersion },
      replay: {
        command: index.replay?.command || 'node scripts/renderPackageV1.mjs',
        environment: index.replay?.environment || replayEnvironment,
      },
      capturedAt: reviewedAt,
    });
    const receiptPath = path.join(receiptDirectory, `${artifact.id}.json`);
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    childReceipts.push({ id: artifact.id, status: receipt.status, receiptPath });
  }

  const bundle = await capturePackageRenderAuditV1({
    root: absoluteRoot,
    packagePath,
    packageDirectory,
    receiptDirectory: path.relative(absoluteRoot, receiptDirectory),
    capturedAt: reviewedAt,
  });
  const bundlePath = path.resolve(absoluteRoot, outputDirectory, 'package-render-audit-v1.json');
  await fs.writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return { bundlePath, bundle, childReceipts };
}

async function main(argv = process.argv.slice(2)) {
  const args = argsToObject(argv);
  const required = ['index', 'package', 'package-dir', 'output-dir', 'reviewer-id', 'reviewed-at'];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0 || args['acknowledge-inspected'] !== true) {
    throw new Error(
      `Usage: captureInspectedPackageRenderV1 --root <dir> --index <json> --package <zip> --package-dir <dir> --output-dir <dir> --reviewer-id <id> --reviewed-at <ISO> --acknowledge-inspected [--findings <json>] [--roles <json>]`,
    );
  }
  const result = await captureInspectedPackageRenderV1({
    root: args.root || process.cwd(),
    indexPath: args.index,
    packagePath: args.package,
    packageDirectory: args['package-dir'],
    outputDirectory: args['output-dir'],
    reviewerId: args['reviewer-id'],
    reviewedAt: args['reviewed-at'],
    findingsByArtifact: await readJson(args.findings),
    rolesByArtifact: await readJson(args.roles),
  });
  process.stdout.write(
    `${JSON.stringify({ bundlePath: result.bundlePath, status: result.bundle.status, childReceipts: result.childReceipts.length })}\n`,
  );
  return result.bundle.status === 'passed' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .then((code) => (process.exitCode = code))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
