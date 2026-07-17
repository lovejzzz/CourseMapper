#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { materializeSourceCaptureCampaign } from './lib/scionSourceCapture.mjs';

const CAMPAIGN = 'evaluation/scion-source-capture-readiness-gap-v0.16.47.json';
const PROJECTS = 'evaluation/scion-source-capture-readiness-gap-evidence';
export const SCION_READINESS_GAP_CONTRAST = 'evaluation/scion-contrast-matrix-readiness-gap-v0.16.47.json';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function pairId(group) {
  return `${group.id}-authoring-v2-vs-gpt54mini`;
}

export async function buildScionReadinessGapContrastV01647({ cwd = process.cwd() } = {}) {
  const root = path.resolve(cwd);
  const campaign = await materializeSourceCaptureCampaign({ manifestPath: CAMPAIGN, cwd: root });
  const pairs = [];
  const artifacts = [];
  for (const group of campaign.groups) {
    const paths = Object.fromEntries(['local', 'reference'].map((arm) => [arm, `${PROJECTS}/${group.id}-${arm}.json`]));
    const [candidateRaw, referenceRaw] = await Promise.all([
      fs.readFile(path.join(root, paths.local)),
      fs.readFile(path.join(root, paths.reference)),
    ]);
    const candidate = JSON.parse(candidateRaw);
    const reference = JSON.parse(referenceRaw);
    const captures = [candidate.scionSourceCapture, reference.scionSourceCapture];
    if (
      captures.some(
        (capture) =>
          capture?.campaignManifestSha256 !== campaign.manifestSha256 ||
          capture?.promptSetSha256 !== campaign.promptSetSha256 ||
          capture?.courseGroupId !== group.id ||
          capture?.sourcePacketSha256 !== group.sourcePacketSha256,
      )
    ) {
      throw new Error(`Readiness-gap project lineage mismatch: ${group.id}`);
    }
    if (
      candidate.scionSourceCapture.model?.id !== 'google/gemma-4-E2B-it-qat-q4_0-unquantized' ||
      candidate.scionSourceCapture.model?.revision !== '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce' ||
      reference.scionSourceCapture.model?.id !== 'gpt-5.4-mini'
    ) {
      throw new Error(`Readiness-gap model identity mismatch: ${group.id}`);
    }
    artifacts.push(
      { path: paths.local, bytes: candidateRaw.length, sha256: hash(candidateRaw) },
      { path: paths.reference, bytes: referenceRaw.length, sha256: hash(referenceRaw) },
    );
    pairs.push({
      id: pairId(group),
      domain: group.domain,
      courseGroupId: group.id,
      candidateRoute: 'local-scion-base-source-compiler-recovery-authoring-v2-v0.16.47',
      candidateModel: 'Scion base + compiler recovery (Gemma 4 E2B)',
      referenceModel: 'GPT-5.4-mini',
      artifactStatus: 'source-grounded-raw-and-recovered-atom-capture',
      evaluationUse: 'blind-review-and-controlled-breadth-only',
      sourcePacketSha256: group.sourcePacketSha256,
      candidate: paths.local,
      reference: paths.reference,
    });
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-contrast-matrix-v1',
    release: 'v0.16.47',
    promptPolicy: campaign.summary.promptPolicy,
    pairs,
    evidence: {
      campaign: {
        path: campaign.manifestPath,
        sha256: campaign.manifestSha256,
        promptSetSha256: campaign.promptSetSha256,
      },
      artifacts,
      courseGroupsByDomain: campaign.summary.domainGroupCounts,
      sourceKernels: campaign.summary.prompts,
    },
    claimBoundary:
      'These two neutral source-grounded capture pairs cover four previously unrepresented economics kernels and one newly curated music-theory kernel under the accepted v2 authoring policy. They supply no preference label, adapter authorization, or quality win.',
  };
}

export async function runScionReadinessGapContrastV01647({ cwd = process.cwd(), write = false } = {}) {
  const report = await buildScionReadinessGapContrastV01647({ cwd });
  const output = path.resolve(cwd, SCION_READINESS_GAP_CONTRAST);
  if (write) {
    await fs.writeFile(output, canonical(report));
  } else {
    const tracked = await fs.readFile(output, 'utf8');
    if (tracked !== canonical(report)) throw new Error('Tracked readiness-gap contrast is stale');
  }
  return { report, output, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error('Unknown course-group contrast option');
  const result = await runScionReadinessGapContrastV01647({ write: args.has('--write') });
  console.log(
    `Scion readiness-gap contrast: ${result.report.pairs.length} pairs / ${result.report.evidence.sourceKernels} source kernels.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${SCION_READINESS_GAP_CONTRAST}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
