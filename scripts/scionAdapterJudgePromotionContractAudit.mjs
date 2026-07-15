#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  auditScionAdapterSingleModelJudgeEvidence,
  SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY,
  SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL,
} from './lib/scionAdapterJudgePromotion.mjs';
import { computeScionAdapterPackageIdentity } from './lib/scionBrowserDeviceMatrix.mjs';

const TEMPLATE_PATH = 'evaluation/scion-adapters/single-model-judge-promotion.template.json';
const CANONICAL_PATHS = {
  qualityManifest: 'evaluation/quality-benchmark/v1/manifest.json',
  rubric: 'evaluation/quality-benchmark/v1/rubric.json',
  judgePrompt: 'evaluation/quality-benchmark/v1/single-model-judge-prompt-v1.md',
  heldOutCourseBenchmark: 'evaluation/scion-adapters/held-out-course-benchmark-v1.json',
};

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function runScionAdapterJudgePromotionContractAudit({ root = process.cwd() } = {}) {
  const template = JSON.parse(await fs.readFile(path.join(root, TEMPLATE_PATH), 'utf8'));
  const issues = [];
  if (template.protocolVersion !== SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL) issues.push('template-protocol-mismatch');
  if (template.claimBoundary !== SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY) issues.push('template-claim-boundary-mismatch');
  if (!String(template.adapter?.packageIdentitySha256 || '').includes('PROMOTION_INDEPENDENT')) {
    issues.push('template-package-identity-missing');
  }
  if (template.adapter?.manifestSha256 != null) issues.push('template-circular-manifest-identity-present');
  const canonical = {};
  for (const [key, relativePath] of Object.entries(CANONICAL_PATHS)) {
    const bytes = await fs.readFile(path.join(root, relativePath));
    const digest = sha256(bytes);
    canonical[key] = { path: relativePath, sha256: digest };
    if (template.benchmark?.[key]?.path !== relativePath || template.benchmark?.[key]?.sha256 !== digest) {
      issues.push(`template-${key}-binding-mismatch`);
    }
  }
  const heldOut = JSON.parse(await fs.readFile(path.join(root, CANONICAL_PATHS.heldOutCourseBenchmark), 'utf8'));
  const dummyManifest = {
    schemaVersion: 2,
    adapter: { id: 'scion-contract-audit', scionVersion: '0.16.30', format: 'mlx-lora-safetensors', scale: 1 },
    base: { modelId: heldOut.base.modelId, revision: heldOut.base.revision },
    training: {},
    files: [],
    runtime: {},
  };
  const dummyAudit = await auditScionAdapterSingleModelJudgeEvidence({
    root,
    evidencePath: path.join(root, 'evaluation/scion-adapters/dummy-single-model-judge.json'),
    evidence: { type: 'single-model-judge', status: 'pass' },
    adapterManifest: dummyManifest,
    adapterPackageIdentitySha256: computeScionAdapterPackageIdentity(dummyManifest).sha256,
    bootstrapSamples: 100,
  });
  if (dummyAudit.status !== 'blocked' || dummyAudit.promotionEligible !== false) {
    issues.push('hash-only-dummy-was-not-rejected');
  }
  for (const expected of ['evidence-schema-version', 'evidence-protocol-version', 'required-comparison-set-mismatch']) {
    if (!dummyAudit.issues.includes(expected)) issues.push(`dummy-missing-expected-rejection:${expected}`);
  }
  return {
    schemaVersion: 1,
    audit: 'scion-adapter-judge-promotion-contract-v1',
    status: issues.length === 0 ? 'pass' : 'fail',
    protocolVersion: SCION_ADAPTER_JUDGE_PROMOTION_PROTOCOL,
    claimBoundary: SCION_ADAPTER_JUDGE_CLAIM_BOUNDARY,
    templatePath: TEMPLATE_PATH,
    canonical,
    adversarialHashOnlyDummy: {
      status: dummyAudit.status,
      promotionEligible: dummyAudit.promotionEligible,
      issues: dummyAudit.issues,
    },
    issues,
  };
}

async function main() {
  const report = await runScionAdapterJudgePromotionContractAudit();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
