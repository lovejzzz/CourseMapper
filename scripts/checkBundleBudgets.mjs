import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const kib = 1024;

const budgets = {
  entryRawKiB: 260,
  entryGzipKiB: 80,
  initialRawKiB: 610,
  initialGzipKiB: 190,
};

const lazyChunkBudgets = [
  { prefix: 'AppFlow-', rawKiB: 210, gzipKiB: 66 },
  { prefix: 'ChatPanel-', rawKiB: 330, gzipKiB: 105 },
  { prefix: 'DeliverableView-', rawKiB: 170, gzipKiB: 35 },
  { prefix: 'DeveloperModePanel-', rawKiB: 130, gzipKiB: 35 },
  { prefix: 'ExportSidePanel-', rawKiB: 35, gzipKiB: 12 },
  { prefix: 'webllm-', rawKiB: 5, gzipKiB: 2 },
];

const forbiddenInitialChunks = [
  /webllm/i,
  /citation-js/i,
  /exceljs/i,
  /jspdf/i,
  /pptx/i,
  /html2canvas/i,
  /mammoth/i,
  /pdfjs/i,
  /docxGenerator/i,
  /googleDrive/i,
  /xlsxGenerator/i,
  /deliverableExporters/i,
  /pptxExporter/i,
];

const forbiddenRuntimeDependencies = [
  '@mlc-ai/web-llm',
  '@citation-js/core',
  '@citation-js/plugin-bibtex',
  'exceljs',
  'html2canvas',
  'jspdf',
  'jspdf-autotable',
  'katex',
  'mermaid',
];

function toKiB(bytes) {
  return bytes / kib;
}

function formatKiB(bytes) {
  return `${toKiB(bytes).toFixed(1)} KiB`;
}

async function readAsset(fileName) {
  const buffer = await fs.readFile(path.join(assetsDir, fileName));
  return {
    fileName,
    rawBytes: buffer.byteLength,
    gzipBytes: gzipSync(buffer).byteLength,
  };
}

function assertBudget(label, actualBytes, budgetKiB, failures) {
  const budgetBytes = budgetKiB * kib;
  if (actualBytes > budgetBytes) {
    failures.push(`${label}: ${formatKiB(actualBytes)} exceeds ${budgetKiB} KiB`);
  }
}

function parseInitialJsFiles(html) {
  const files = new Set();
  const assetPattern = /(?:src|href)="\/assets\/([^"]+\.js)"/g;
  let match = assetPattern.exec(html);
  while (match) {
    files.add(match[1]);
    match = assetPattern.exec(html);
  }
  return Array.from(files);
}

async function findChunkByPrefix(prefix) {
  const files = await fs.readdir(assetsDir);
  return files.find((file) => file.startsWith(prefix) && file.endsWith('.js'));
}

async function main() {
  const failures = [];
  const packageJson = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  for (const dependency of forbiddenRuntimeDependencies) {
    if (packageJson.dependencies?.[dependency]) {
      failures.push(`Forbidden heavy runtime dependency is installed: ${dependency}`);
    }
  }

  const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const initialFiles = parseInitialJsFiles(indexHtml);
  if (initialFiles.length === 0) failures.push('No initial JS files found in dist/index.html.');

  const initialAssets = await Promise.all(initialFiles.map(readAsset));
  const entryAsset = initialAssets.find((asset) => asset.fileName.startsWith('index-'));
  if (!entryAsset) {
    failures.push('Could not find index entry chunk in dist/index.html.');
  } else {
    assertBudget(`Landing entry raw (${entryAsset.fileName})`, entryAsset.rawBytes, budgets.entryRawKiB, failures);
    assertBudget(`Landing entry gzip (${entryAsset.fileName})`, entryAsset.gzipBytes, budgets.entryGzipKiB, failures);
  }

  const initialRawBytes = initialAssets.reduce((sum, asset) => sum + asset.rawBytes, 0);
  const initialGzipBytes = initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  assertBudget('Initial landing JS raw', initialRawBytes, budgets.initialRawKiB, failures);
  assertBudget('Initial landing JS gzip', initialGzipBytes, budgets.initialGzipKiB, failures);

  for (const asset of initialAssets) {
    const forbidden = forbiddenInitialChunks.find((pattern) => pattern.test(asset.fileName));
    if (forbidden) {
      failures.push(`Export/provider-heavy chunk is preloaded on landing: ${asset.fileName}`);
    }
  }

  const lazyResults = [];
  for (const budget of lazyChunkBudgets) {
    const fileName = await findChunkByPrefix(budget.prefix);
    if (!fileName) {
      failures.push(`Could not find lazy chunk with prefix ${budget.prefix}`);
      continue;
    }
    const asset = await readAsset(fileName);
    lazyResults.push(asset);
    assertBudget(`${budget.prefix} raw (${fileName})`, asset.rawBytes, budget.rawKiB, failures);
    assertBudget(`${budget.prefix} gzip (${fileName})`, asset.gzipBytes, budget.gzipKiB, failures);
  }

  console.log(`Initial landing JS: ${formatKiB(initialRawBytes)} raw, ${formatKiB(initialGzipBytes)} gzip`);
  console.log(`Initial files: ${initialAssets.map((asset) => asset.fileName).join(', ')}`);
  if (lazyResults.length > 0) {
    console.log(
      `Lazy chunks checked: ${lazyResults
        .map((asset) => `${asset.fileName} (${formatKiB(asset.rawBytes)} raw, ${formatKiB(asset.gzipBytes)} gzip)`)
        .join('; ')}`,
    );
  }

  if (failures.length > 0) {
    console.error('\nBundle budget check failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
