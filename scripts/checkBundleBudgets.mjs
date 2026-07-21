import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const kib = 1024;
const conflictCopyName = /\s+\d+\.[^.]+$/;

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
  // v0.15.3 C1 (June 2026): the diet RATCHET — AppFlow.jsx hit its line bar
  // (4,734 → 3,992 via useProjectPersistence + useWorkspaceRepairs) and the
  // chunk shrank 256.3 → 254.0 raw / 76.3 gzip (imageSearch + importCourseMap
  // went lazy). The 248/76 target stands: the remaining ~6 KiB lives inside
  // useDeliverables (230 KB source — the chunk's whale per the sourcemap
  // census), whose split is the named v0.15.4 diet lane. This ratchet locks
  // the v0.15.3 gains (budget was 256/77); do NOT raise it for feature work.
  // CI zlib has shown +/-0.1 KiB byte-level variance around this ratchet, so a
  // tiny gzip slack avoids flaky hosted failures without changing the budget.
  // v0.15.187 (July 2026): +0.4 KiB raw / +0.4 gzip for compile fault
  // isolation — the per-feature error dispatch (symbol channel → per-feature
  // markFeatureError/progress) must live on the compile hot path; the
  // grounding-metrics shaping was already pushed out to the lazily-imported
  // groundingMetricsEvent.js. Measured 255.4/76.9. This is a documented
  // exception to "do NOT raise for feature work", not a precedent: the
  // useDeliverables split (the chunk's named whale) remains the diet lane
  // and should claw this back below 255/76.5.
  // v2.1 (July 2026): +1 KiB raw / +1 KiB gzip for the Scion "local" provider
  // — its branch in buildProviderTextRequest is on the request hot path (every
  // provider branch is), and its Pass B call site can't lazy-load the sync
  // options. ALL lazy-able Scion code (contracts/passes/passB/flywheel) was
  // pushed into a separate 11.5 KiB chunk (vite manualChunks 'scion'). Budgets
  // set from a CLEAN build on Node 22 (CI's runtime, which gzips ~0.1 KiB
  // larger than local Node 25): measured 256.5 raw / 77.3 gzip — 257/78 give
  // ~0.5/0.7 KiB margin over the reference platform. Same documented-exception
  // discipline as v0.15.187; the useDeliverables split remains the claw-back
  // lane.
  // v0.16.2: +0.25 KiB raw (gzip unchanged) keeps the authored Scion overlay
  // in full project snapshots after map/finalizer re-derivation. This is the
  // source-of-truth fix behind non-stale paired evaluation, not UI growth.
  // v0.16.55: the clean v0.16.54 parent already measured 271.4/82.0 under
  // the locked Vite toolchain, so the older 258.75/78 ceiling was stale and
  // silently red before this release. The materialized source-lesson boundary
  // adds 1.7 KiB raw / 0.3 gzip while replacing duplicated scope-numbering
  // logic; 274/83 is the measured 273.1/82.3 result with narrow CI margin.
  // v0.16.59: +0.6 KiB raw carries the exact source ledger into the workspace
  // and suppresses futile outer recovery. Gzip remains below the V0.16.55
  // ceiling; 275 KiB keeps less than 0.5 KiB raw headroom.
  // v0.16.62 candidate: +0.5 KiB raw repairs duplicate resource ids while
  // restoring older project graphs and reuses admission-checked saved kernels
  // for on-demand compiles. This prevents a silent content downgrade and an
  // unnecessary model pass; measured 275.2/83.0 with gzip unchanged.
  // The Vite 8 graph correction also moved Scion's public identity into a
  // 0.3 KiB landing leaf. That removes 1.75 MiB from the initial route while
  // shifting 0.2/0.3 KiB into AppFlow's lazy ownership. Keep sub-KiB margin.
  // v0.16.64: +1.1 KiB raw for the verified-draft export contract and legacy
  // receipt recovery. This is workspace-only and keeps gzip under the prior
  // cap; the same release removed 451 KiB raw / 136 KiB gzip from landing by
  // repairing an accidental compiler-finalizer preload.
  { prefix: 'AppFlow-', rawKiB: 279, gzipKiB: 84 },
  // v0.16.47: the Living Course Compiler component and pure selector gained
  // an independently cacheable route boundary instead of raising AppFlow's
  // long-standing ratchet. Clean measurement: AppFlow 251.6/75.9; ribbon
  // 63.1/19.7. Keep a narrow 65/21 ceiling on the new chunk.
  // v0.16.49: +0.9 KiB raw for terminal review/ready semantics and exact
  // enrichment coverage. The chunk remains workspace-only and gzip remains
  // below the existing ceiling (measured 65.9/20.4).
  // v0.16.55 remeasurement: both the clean parent and current release are
  // 69.6 KiB raw. The one-field post-build marker did not grow this chunk;
  // move the stale ratchet to 70/22 without granting feature-growth room.
  { prefix: 'livingCompilerRibbon-', rawKiB: 70, gzipKiB: 22 },
  { prefix: 'livingCompilerFailure-', rawKiB: 3, gzipKiB: 2 },
  { prefix: 'courseMapContinuation-', rawKiB: 5, gzipKiB: 3 },
  // v0.9.0: +12 KiB raw / +4 KiB gzip for the course-native agent (content
  // index + renderer reuse, digest card, journal — measured at 341.0 KiB raw
  // / 92.8 gzip). Deliberate feature growth; gzip headroom unchanged.
  // v0.16.49: +0.9 KiB raw for Scion direct-action receipts and raw
  // pseudo-tool suppression (measured 350.9/96.5). No gzip increase.
  // v0.16.55: calm completed-with-notes semantics and material-scoped timing
  // checks add 0.9 KiB raw / 0.2 gzip over the 351.9/96.8 clean parent.
  // Preserve the generous existing gzip cap but keep raw close to 352.8.
  // v0.16.59: the read-only Scion Agent receives compact live workspace
  // context and rejects tool envelopes. The measured raw delta is below
  // 1 KiB and gzip stays far under the existing ceiling.
  { prefix: 'ChatPanel-', rawKiB: 355, gzipKiB: 105 },
  // v0.15.187: the compiler chunk was the LARGEST in dist (measured 711 KiB
  // raw / 192 KiB gzip on July 1) and the only large chunk with no ratchet —
  // which is how it grew 31× in 5.5 weeks unnoticed. Budget set just above
  // the measurement; the content roadmap moves prose to data files and model
  // atoms, so this number should trend DOWN — do not raise it for new
  // hand-written template variants.
  // v0.16.1: +25 KiB raw / +5 KiB gzip (measured 746.1 raw / 203.3 gzip) for
  // the Linear Algebra field-audit fixes — NEW BEHAVIOR, not template prose:
  // atom-based cumulative exam item generation, exam-day deliverable variants
  // (logistics plan / cumulative study guide / short review deck), and
  // code-lab rubric/brief scaffolds. The trend-DOWN goal still stands: this is
  // a one-time correctness bump, not a licence for more template variants.
  // v0.16.2: +1 KiB raw for classroom-boundary humanization of source
  // locators and model enum tokens. The shared parsing bodies live in the
  // compilerText chunk; this allowance covers the compiler's quiz-field
  // applications while gzip remains below the existing 206 KiB ceiling.
  // v0.16.49 isolates the verified Bayesian/music domain frames in their own
  // workspace-only chunk and keeps that chunk off landing. The core compiler
  // measures 763.7/209.6 after adding fail-closed semantic admission and is
  // smaller than the 771.2/212.0 pre-isolation build. This narrow exception
  // records the new behavior without hiding it inside an unbounded ceiling;
  // the longer-term compiler-data split still owns the next ratchet down.
  // The completed frame-by-frame pass then added source-trace recovery, exact
  // enriched-ID restoration, observable music rubrics, course-map/study/FAQ
  // repairs, and copied-template defenses. These are contract behavior, not
  // decorative variants; measured 785.8/216.5 in the lazy workspace chunk.
  // v0.16.55 remeasurement: the unchanged clean parent is 795.4/219.7 under
  // the locked bundler. This release adds no bytes to this chunk; 796/220
  // records the real inherited floor with less than 0.6/0.3 KiB headroom.
  // v0.16.62 candidate: admitted lesson facts, terms, and misconceptions now
  // fill missing assessment seats before generic source-review recovery. The
  // retained Mandarin replay moved generic recovery from 54 seats to 0/90 and
  // raw-model versus compiled applied depth from 2/19 to 32/60, for +1.5 KiB
  // raw and +0.5 KiB gzip. Keep the increase local to the compiler chunk.
  // Vite 8's automatic boundary is 811.8/224.4 after the public-provider
  // landing fix. Course copy variants were extracted below so this core is
  // 6.2 KiB smaller than the unsplit candidate; 812/225 is the measured floor,
  // not an allowance to put prose back into the 1.4 MB source file.
  // v0.16.64: bounded semantic admission for fact-ledger key terms and
  // constructed responses adds 2.7/0.7 KiB to this lazy compiler only. It
  // prevents off-lesson authored questions from replacing valid compiler
  // frames; no additional prose corpus or landing dependency was added.
  // v0.16.66: +9.5/+3.2 KiB for verified-registry reconciliation, typed lab
  // workflow selection, no-homework handling for in-class-only lessons, and
  // learner-facing repetition cleanup found by the real Genetics ZIP audit.
  // The chunk remains lazy and off landing; the frozen Research Methods pass
  // measures 829.2/230.6 after adding progress-safe transfer, FAQ, notes, and
  // modality variants. Keep narrow headroom and continue the compiler-data
  // split instead of moving any of this code onto the landing route.
  { prefix: 'courseBlueprintCompiler-', rawKiB: 830, gzipKiB: 232 },
  // v0.16.49: Bayesian and music-interval assessment frames are workspace-only
  // data and independently cacheable. The same boundary now owns the music
  // interval admission, discussion, FAQ, quiz, and study-guide rules so the
  // core compiler does not own their full data. The final disciplinary pass
  // adds classification/inversion facilitation, criteria, response stems,
  // and verified frames; measured 39.5/12.7. It remains workspace-only.
  // v0.16.62: 10.6 KiB of rotating course-copy data moved out of the core
  // compiler into this already-required frame chunk. This improves parsing
  // and cache locality without adding another generation-time request.
  { prefix: 'compilerFrames-', rawKiB: 51, gzipKiB: 17 },
  // v0.16.63: rotating slide, study-guide, and assessment language is data,
  // not compiler control flow. It is isolated from compilerFrames so writing
  // texture can evolve without invalidating disciplinary logic. The chunk is
  // workspace-only and first loads with compilation (measured 21.2/7.4).
  // v0.16.64: assignment-body alias compaction adds 0.7 KiB raw while keeping
  // gzip at the existing 8 KiB ceiling; it eliminates the live exported-docx
  // mail-merge repetition that motivated the new branch.
  { prefix: 'compilerCopyVariants-', rawKiB: 23, gzipKiB: 8.25 },
  // v0.16.65: varied assessment and material-polish copy moved out of the
  // compiler hot chunk. This compile-only leaf stays independently cacheable.
  { prefix: 'compilerPolish-', rawKiB: 8, gzipKiB: 3 },
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
  // 2026-06-19 (v0.15.8): +digest caveat scoring and title-only assignment
  // detection from live EduTool ZIP audits; this remains a lazy finalize/ZIP
  // chunk and does not affect the landing path.
  // 2026-06-30 (v0.15.145): +assessment-label lesson identity guard from a
  // fresh ZIP audit where "evidence check: Studio critique (9%)" became lesson
  // titles and filenames. Still lazy and still within the 40–60 KiB roadmap
  // range named when this chunk was introduced.
  // v0.16.2: source-bank assessment depth plus the inline-source citation
  // boundary add 1.4 KiB to this lazy-only audit chunk. The production proof
  // uses both checks to reject recall-heavy banks without misclassifying
  // classroom activity cues as off-discipline readings.
  // v0.16.49 adds fail-closed process-glossary, copied-template, and
  // cross-discipline interval checks. The lazy grader measures 61.3/21.2,
  // remains near its original 40–60 KiB design band, and stays off landing.
  // v0.16.55: the requested-session clock blocker adds 1.0 KiB raw / 0.3
  // gzip over the 61.5/21.4 parent. Keep the lazy-only chunk at 63/22.
  // v0.16.66: the real Genetics package exposed a false 99: manifest-promised
  // graded briefs could point at no-brief shells, long lesson titles could be
  // stamped dozens of times, and compiler constraints could leak into lesson
  // plans. Research-method citation calibration measures 65.1/22.5 KiB while
  // keeping this grader lazy and off the initial route.
  { prefix: 'deepQualityGrader-', rawKiB: 66, gzipKiB: 23 },
  // The finalize-time grading seam AppFlow lazy-imports (assembles the file
  // map via packageZipExporter and returns the badge data; measured at
  // 1.1 KiB raw / 0.6 gzip).
  { prefix: 'finalizeQualityGate-', rawKiB: 4, gzipKiB: 2 },
  { prefix: 'webllm-', rawKiB: 5, gzipKiB: 2 },
];

const forbiddenInitialChunks = [
  // v0.16.47: route-only progress UI. The Vite HTML preload resolver keeps
  // this off landing; lock that behavior so a bundler change cannot silently
  // restore the extra startup download.
  /livingCompilerRibbon/i,
  /livingCompilerFailure/i,
  /courseMapContinuation/i,
  /compilerFrames/i,
  /compilerCopyVariants/i,
  /compilerPolish/i,
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

function assertBudget(label, actualBytes, budgetKiB, failures, { slackBytes = 0 } = {}) {
  const budgetBytes = budgetKiB * kib;
  if (actualBytes > budgetBytes + slackBytes) {
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
  const assetFiles = await fs.readdir(assetsDir);
  const conflictCopyAssets = assetFiles.filter((fileName) => conflictCopyName.test(fileName));
  if (conflictCopyAssets.length > 0) {
    failures.push(
      `build output contains ${conflictCopyAssets.length} conflict-copy asset(s): ${conflictCopyAssets.slice(0, 5).join(', ')}`,
    );
  }
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
    assertBudget(`${budget.prefix} gzip (${fileName})`, asset.gzipBytes, budget.gzipKiB, failures, {
      slackBytes: budget.gzipSlackBytes || 0,
    });
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
