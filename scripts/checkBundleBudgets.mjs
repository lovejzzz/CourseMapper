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
  // v0.8.6: +8 KiB raw / +2 KiB gzip for PackageTrustStrip and lean course-map
  // atoms (deliberate feature growth, measured at 219.2 KiB raw / 66.3 gzip).
  // v0.9.11: +5 KiB raw for the generation cost report.
  // v0.10.1: +3 KiB raw for the run-digest wiring + slimmed trace branch
  // (the digest builder/formatter are lazy-imported, not in this chunk).
  // v0.14.2: +6 KiB raw / +2 KiB gzip for the Crucible-loop hardening —
  // lesson-regen merge safety (exam-preserving, stub-rejecting), romanization
  // recovery in the enrichment retry loop, and the deliverable focus router
  // (measured at 236.5 KiB raw / 71.7 gzip). Deliberate feature growth.
  // v0.14.4 WS-B: +8 KiB raw / +3 KiB gzip for the build ribbon — the
  // buildRibbonModel selector + BuildRibbon/TabReadyTick render (one status
  // spine replacing the tab counter, rainbow dots, and in-panel narration;
  // measured at 245.5 KiB raw / 74.6 gzip). Deliberate feature growth.
  // v0.14.9 B1/C2 (June 2026): +4 KiB raw — AppFlow became the review
  // queue's single owner and gained the voice A/B hook. v0.15: +1 KiB gzip —
  // the sync-race fixes and the contribute-kernels action. BOTH allowances
  // die in the v0.15.1 C1 diet (AppFlow < 4,000 lines, chunk ≤ 248/76).
  { prefix: 'AppFlow-', rawKiB: 252, gzipKiB: 77 },
  // v0.9.0: +12 KiB raw / +4 KiB gzip for the course-native agent (content
  // index + renderer reuse, digest card, journal — measured at 341.0 KiB raw
  // / 92.8 gzip). Deliberate feature growth; gzip headroom unchanged.
  { prefix: 'ChatPanel-', rawKiB: 350, gzipKiB: 105 },
  { prefix: 'DeliverableView-', rawKiB: 170, gzipKiB: 35 },
  { prefix: 'DeveloperModePanel-', rawKiB: 130, gzipKiB: 35 },
  // v0.9.1: +3 KiB raw for the pre-export checklist (localization gaps +
  // compiler-flagged local reviews, measured at 38.0 KiB raw / 10.x gzip).
  // v0.14.3 WS-A: +5.1 KiB raw / +1.3 KiB gzip for the quality badge chip +
  // report modal (measured at 36.8 KiB raw / 10.3 gzip).
  // v0.14.4 WS-C: +10.7 KiB raw / +2.7 KiB gzip for the unified review queue
  // — the reviewQueueModel classifier + ReviewQueue step-through drawer live
  // in THIS chunk (not AppFlow's) so the queue loads with the export panel
  // that hosts it (measured at 47.5 KiB raw / 13.0 gzip). Deliberate feature
  // growth; the checklist banner UI it replaces was already here.
  { prefix: 'ExportSidePanel-', rawKiB: 52, gzipKiB: 15 },
  // v0.14.3 WS-A A4: the deep quality grader + defect patterns — the
  // package-grades-itself chunk, lazy-loaded only when finalize-grading or a
  // ZIP download runs (measured at 38.6 KiB raw / 13.9 KiB gzip; the roadmap
  // expected 40–60 KiB raw). Never preloaded on landing — also listed in
  // forbiddenInitialChunks below.
  // 2026-06-12 (v0.14.7 WS-D1): +texture dimension (textureMetric.js) —
  // measured 49.4 raw / 17.7 gzip; raw budget raised 48 → 54, gzip held.
  { prefix: 'deepQualityGrader-', rawKiB: 54, gzipKiB: 18 },
  // The finalize-time grading seam AppFlow lazy-imports (assembles the file
  // map via packageZipExporter and returns the badge data; measured at
  // 1.1 KiB raw / 0.6 gzip).
  { prefix: 'finalizeQualityGate-', rawKiB: 4, gzipKiB: 2 },
  { prefix: 'webllm-', rawKiB: 5, gzipKiB: 2 },
];

const forbiddenInitialChunks = [
  /webllm/i,
  /deepQualityGrader/i,
  /finalizeQualityGate/i,
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
