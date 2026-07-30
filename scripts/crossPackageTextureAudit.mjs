#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  buildCrossPackageTextureResult,
  collectCrossPackageInputSlots,
  compareCrossPackageTextureResults,
  extractCrossPackageTextureUnits,
} from '../src/lib/quality/crossPackageTexture.js';
import { APP_VERSION } from '../src/lib/appVersion.js';
import {
  PIPELINE_FEATURES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './hybridPipelineAudit.mjs';
import {
  CROSS_PACKAGE_THIN_BRIEF_PANEL_VERSION,
  CROSS_PACKAGE_THIN_BRIEFS,
  buildThinBriefCourseMap,
} from './panels/crossPackageThinBriefs.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'cross-package-texture');
const GOLD_PANEL_IDS = [
  'gold-biology-lab-8',
  'gold-business-strategy-case-8',
  'gold-community-health-8',
  'gold-online-writing-workshop-8',
  'gold-quantitative-problem-set-8',
  'gold-interaction-design-studio-8',
  'gold-clinical-judgment-8',
  'gold-information-literacy-8',
  'gold-teacher-preparation-8',
  'gold-programming-lab-8',
];

function parseArgs(argv) {
  const options = {
    profile: 'thin',
    output: DEFAULT_OUTPUT_DIR,
    writeBaseline: false,
    verifyBaseline: false,
    progress: false,
    snapshot: '',
    compareBaseline: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write-baseline') options.writeBaseline = true;
    else if (arg === '--verify-baseline') options.verifyBaseline = true;
    else if (arg === '--progress') options.progress = true;
    else if (arg === '--compare-baseline') options.compareBaseline = true;
    else if (arg.startsWith('--snapshot=')) options.snapshot = arg.slice('--snapshot='.length);
    else if (arg === '--snapshot') options.snapshot = argv[++index];
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length);
    else if (arg === '--profile') options.profile = argv[++index];
    else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice('--output='.length));
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown cross-package texture argument: ${arg}`);
  }
  if (!['thin', 'gold'].includes(options.profile)) {
    throw new Error(`Unknown cross-package texture profile: ${options.profile}`);
  }
  if (options.snapshot && !/^[a-z0-9][a-z0-9-]*$/i.test(options.snapshot)) {
    throw new Error(`Invalid cross-package texture snapshot name: ${options.snapshot}`);
  }
  return options;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fileHash(relativePath) {
  return sha256(await fs.readFile(path.join(ROOT, relativePath)));
}

async function implementationFingerprint() {
  const files = [
    'src/lib/courseBlueprintCompiler.js',
    'src/lib/courseCompilerLensProfiles.js',
    'src/lib/courseCompilerRealization.js',
    'src/lib/courseCompilerTextureCopy.js',
    'src/lib/quality/crossPackageTexture.js',
    'src/lib/quality/crossPackageTextureUnitClass.js',
    'scripts/crossPackageTextureAudit.mjs',
    'scripts/panels/crossPackageThinBriefs.mjs',
  ];
  const entries = [];
  for (const file of files) entries.push([file, await fileHash(file)]);
  return sha256(stableJson(entries));
}

function scopeGoldCourseMap(sample) {
  return {
    ...sample.project.courseMap,
    lessons: sample.project.courseMap.lessons.slice(0, sample.scope),
  };
}

async function panelEntries(profile) {
  if (profile === 'thin') {
    return CROSS_PACKAGE_THIN_BRIEFS.map((brief) => ({
      id: brief.id,
      courseMap: buildThinBriefCourseMap(brief),
      enrichment: {},
    }));
  }
  const { DEFAULT_GOLD_SAMPLES } = await import('./goldSampleQualityAudit.mjs');
  const samplesById = new Map(DEFAULT_GOLD_SAMPLES.map((sample) => [sample.id, sample]));
  return GOLD_PANEL_IDS.map((id) => {
    const sample = samplesById.get(id);
    if (!sample) throw new Error(`Gold texture panel sample is unavailable: ${id}`);
    return {
      id,
      courseMap: scopeGoldCourseMap(sample),
      enrichment: sample.enrichment || {},
    };
  });
}

function trimCanonicalResult(result) {
  return {
    ...result,
    views: Object.fromEntries(
      Object.entries(result.views).map(([maskView, comparisons]) => [
        maskView,
        Object.fromEntries(
          Object.entries(comparisons).map(([comparisonView, summary]) => [
            comparisonView,
            {
              ...summary,
              clusters: summary.clusters.map((cluster, index) => ({
                id: `${maskView}-${comparisonView}-${String(index + 1).padStart(4, '0')}`,
                ...cluster,
              })),
            },
          ]),
        ),
      ]),
    ),
  };
}

function markdownSummary(canonical, envelope) {
  const inputPathFree = canonical.result.views.inputMask.pathFree;
  const inputSamePosition = canonical.result.views.inputMask.samePosition;
  const consumedPathFree = canonical.result.views.consumedSlot.pathFree;
  const rawPathFree = canonical.result.views.raw.pathFree;
  const pairLocalCount = (view) => Number(view.supportDistribution?.[2] || 0);
  const provenanceCoverage =
    canonical.result.teachingUnitCount > 0
      ? canonical.result.provenance.compilerFrame / canonical.result.teachingUnitCount
      : 0;
  const lines = [
    '# Cross-Package Texture Audit',
    '',
    `- Profile: **${canonical.panel.id}**`,
    `- Packages: **${canonical.result.packageCount}**`,
    `- App version: **${canonical.appVersion}**`,
    `- Canonical SHA-256: \`${envelope.canonicalSha256}\``,
    `- Runtime: **${envelope.runtimeMs} ms**`,
    ...(envelope.ratchet ? [`- Pre-repair ratchet: **${envelope.ratchet.passed ? 'PASS' : 'FAIL'}**`] : []),
    '',
    '## Headline teaching-prose measures',
    '',
    '| View | Comparable frame units | Clusters K≥2 | K=2 clusters | Support burden | Reader exposure | Cross-package excess |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| Raw / path-free | ${rawPathFree.eligibleUnitCount} | ${rawPathFree.clusterCount} | ${pairLocalCount(rawPathFree)} | ${(rawPathFree.metrics.supportBurdenRate * 100).toFixed(2)}% | ${(rawPathFree.metrics.readerExposureRate * 100).toFixed(2)}% | ${(rawPathFree.metrics.crossPackageExcessRate * 100).toFixed(2)}% |`,
    `| Input-mask / path-free | ${inputPathFree.eligibleUnitCount} | ${inputPathFree.clusterCount} | ${pairLocalCount(inputPathFree)} | ${(inputPathFree.metrics.supportBurdenRate * 100).toFixed(2)}% | ${(inputPathFree.metrics.readerExposureRate * 100).toFixed(2)}% | ${(inputPathFree.metrics.crossPackageExcessRate * 100).toFixed(2)}% |`,
    `| Input-mask / same-position | ${inputSamePosition.eligibleUnitCount} | ${inputSamePosition.clusterCount} | ${pairLocalCount(inputSamePosition)} | ${(inputSamePosition.metrics.supportBurdenRate * 100).toFixed(2)}% | ${(inputSamePosition.metrics.readerExposureRate * 100).toFixed(2)}% | ${(inputSamePosition.metrics.crossPackageExcessRate * 100).toFixed(2)}% |`,
    `| Consumed-slot / path-free | ${consumedPathFree.eligibleUnitCount} | ${consumedPathFree.clusterCount} | ${pairLocalCount(consumedPathFree)} | ${(consumedPathFree.metrics.supportBurdenRate * 100).toFixed(2)}% | ${(consumedPathFree.metrics.readerExposureRate * 100).toFixed(2)}% | ${(consumedPathFree.metrics.crossPackageExcessRate * 100).toFixed(2)}% |`,
    '',
    '## Support distribution',
    '',
    '```json',
    JSON.stringify(inputPathFree.supportDistribution, null, 2),
    '```',
    '',
    '## Classification and provenance',
    '',
    `- Visible units: ${canonical.result.eligibleUnitCount}`,
    `- Teaching-prose units: ${canonical.result.teachingUnitCount}`,
    `- Unclassified visible paths: ${canonical.result.unclassifiedPaths.length}`,
    `- Compiler-frame matched units: ${canonical.result.provenance.compilerFrame}`,
    `- Unknown-provenance teaching units: ${canonical.result.provenance.unknown}`,
    `- Compiler-frame provenance coverage: ${(provenanceCoverage * 100).toFixed(2)}%`,
    `- Input-mask → consumed-slot reader-exposure divergence: ${((consumedPathFree.metrics.readerExposureRate - inputPathFree.metrics.readerExposureRate) * 100).toFixed(2)} percentage points`,
    `- Mask semantics: ${canonical.result.versions?.mask || 'legacy'}; placeholder-only source slots are excluded because they contain no comparable compiler frame.`,
    ...(envelope.ratchet
      ? [
          '',
          '## No-regression ratchet',
          '',
          `- Aggregate pre-repair comparison: ${envelope.ratchet.measures.every((measure) => measure.passed) ? 'PASS' : 'FAIL'}`,
          `- K=2 ceiling from post-repair reference: ${envelope.ratchet.pairLocal.current}/${envelope.ratchet.pairLocal.reference} (${envelope.ratchet.pairLocal.passed ? 'PASS' : 'FAIL'})`,
          `- Existing clusters with support or occurrence growth: ${envelope.ratchet.existingClusterGrowth.count}`,
          `- New universal high-salience clusters: ${envelope.ratchet.newUniversalHighSalience.count}`,
          `- Causal provenance coverage floor: ${(envelope.ratchet.provenanceCoverage.current * 100).toFixed(2)}% / ${(envelope.ratchet.provenanceCoverage.threshold * 100).toFixed(0)}% (${envelope.ratchet.provenanceCoverage.passed ? 'PASS' : 'FAIL'})`,
        ]
      : []),
    '',
    '> This report characterizes deterministic compiler output. It is not instructor validation or a real Scion production rate.',
    '',
  ];
  return lines.join('\n');
}

async function verifyBaseline(output, profile) {
  const baselinePath = path.join(output, `baseline-v1-${profile}.json.gz`);
  const payload = await readCompressedCanonical(baselinePath);
  if (payload?.schema !== 'coursemapper.cross-package-texture.canonical.v1') {
    throw new Error(`Invalid cross-package baseline schema: ${baselinePath}`);
  }
  if (payload?.panel?.id !== profile) {
    throw new Error(`Cross-package baseline profile mismatch: expected ${profile}, received ${payload?.panel?.id}`);
  }
  if (payload?.result?.unclassifiedPaths?.length) {
    throw new Error(
      `Cross-package baseline contains unclassified visible paths: ${payload.result.unclassifiedPaths.length}`,
    );
  }
  process.stdout.write(
    `[audit:texture:cross-package] baseline verified profile=${profile} sha256=${sha256(stableJson(payload))}\n`,
  );
}

async function readCompressedCanonical(filePath) {
  return JSON.parse(gunzipSync(await fs.readFile(filePath)).toString('utf8'));
}

export async function buildCrossPackageTextureAudit(options = {}) {
  const profile = options.profile || 'thin';
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const entries = await panelEntries(profile);
  const packages = [];
  const inputHashes = {};
  for (const [index, entry] of entries.entries()) {
    onProgress?.({ type: 'package:start', index: index + 1, total: entries.length, packageId: entry.id });
    const blueprint = runtime.buildCourseBlueprint(entry.courseMap, { enrichment: entry.enrichment });
    // The audit opts into the non-enumerable receipt on its one compile.
    // Product output and normal compile latency remain unchanged.
    const compiled = runtime.compileBlueprintDeliverables(blueprint, PIPELINE_FEATURES, {
      configMap: {},
      traceRealization: true,
    });
    const input = { courseMap: entry.courseMap, enrichment: entry.enrichment };
    inputHashes[entry.id] = sha256(stableJson(input));
    const extracted = extractCrossPackageTextureUnits(compiled, {
      packageId: entry.id,
      inputSlots: collectCrossPackageInputSlots(entry.courseMap, entry.enrichment),
    });
    packages.push({
      packageId: entry.id,
      units: extracted.units,
      unclassifiedPaths: extracted.unclassifiedPaths,
    });
    onProgress?.({ type: 'package:done', index: index + 1, total: entries.length, packageId: entry.id });
  }
  const result = trimCanonicalResult(buildCrossPackageTextureResult(packages));
  return {
    schema: 'coursemapper.cross-package-texture.canonical.v1',
    auditVersion: result.auditVersion,
    appVersion: APP_VERSION,
    implementationFingerprint: await implementationFingerprint(),
    panel: {
      id: profile,
      version: profile === 'thin' ? CROSS_PACKAGE_THIN_BRIEF_PANEL_VERSION : 'gold-v1',
      packageIds: entries.map((entry) => entry.id),
      inputHashes,
    },
    result,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verifyBaseline) {
    await verifyBaseline(options.output, options.profile);
    return;
  }
  const startedAt = Date.now();
  try {
    const canonical = await buildCrossPackageTextureAudit({
      profile: options.profile,
      onProgress: options.progress
        ? (event) =>
            process.stdout.write(
              `[audit:texture:cross-package] ${event.index}/${event.total} ${event.type.endsWith('start') ? 'start' : 'done'} ${event.packageId}\n`,
            )
        : null,
    });
    const canonicalText = stableJson(canonical);
    const ratchet = options.compareBaseline
      ? compareCrossPackageTextureResults(
          canonical.result,
          (await readCompressedCanonical(path.join(options.output, `baseline-v1-${options.profile}.json.gz`))).result,
          (
            await readCompressedCanonical(
              path.join(options.output, `snapshot-post-repair-v8-${options.profile}.json.gz`),
            )
          ).result,
        )
      : null;
    const envelope = {
      schema: 'coursemapper.cross-package-texture.run.v1',
      generatedAt: new Date().toISOString(),
      runtimeMs: Date.now() - startedAt,
      node: process.version,
      canonicalSha256: sha256(canonicalText),
      canonicalFile: `latest-${options.profile}.json`,
      ratchet,
    };
    await fs.mkdir(options.output, { recursive: true });
    await fs.writeFile(path.join(options.output, `latest-${options.profile}.json`), canonicalText);
    await fs.writeFile(path.join(options.output, `latest-${options.profile}.run.json`), stableJson(envelope));
    await fs.writeFile(path.join(options.output, `latest-${options.profile}.md`), markdownSummary(canonical, envelope));
    if (options.writeBaseline) {
      await fs.writeFile(
        path.join(options.output, `baseline-v1-${options.profile}.json.gz`),
        gzipSync(canonicalText, { level: 9, mtime: 0 }),
        { flag: 'wx' },
      );
      await fs.writeFile(
        path.join(options.output, `baseline-v1-${options.profile}.md`),
        markdownSummary(canonical, envelope),
        { flag: 'wx' },
      );
    }
    if (options.snapshot) {
      await fs.writeFile(
        path.join(options.output, `snapshot-${options.snapshot}-${options.profile}.json.gz`),
        gzipSync(canonicalText, { level: 9, mtime: 0 }),
        { flag: 'wx' },
      );
      await fs.writeFile(
        path.join(options.output, `snapshot-${options.snapshot}-${options.profile}.md`),
        markdownSummary(canonical, envelope),
        { flag: 'wx' },
      );
    }
    const headline = canonical.result.views.inputMask.pathFree;
    process.stdout.write(
      `[audit:texture:cross-package] complete profile=${options.profile} packages=${canonical.result.packageCount} clusters=${headline.clusterCount} supportBurden=${(headline.metrics.supportBurdenRate * 100).toFixed(2)}% exposure=${(headline.metrics.readerExposureRate * 100).toFixed(2)}% excess=${(headline.metrics.crossPackageExcessRate * 100).toFixed(2)}% unclassified=${canonical.result.unclassifiedPaths.length}${ratchet ? ` ratchet=${ratchet.passed ? 'pass' : 'fail'}` : ''} sha256=${envelope.canonicalSha256}\n`,
    );
    if (ratchet && !ratchet.passed) {
      throw new Error(`Cross-package texture ratchet failed for profile ${options.profile}.`);
    }
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
