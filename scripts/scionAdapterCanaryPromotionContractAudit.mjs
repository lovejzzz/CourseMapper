#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  auditScionAdapterFactualCanaryEvidence,
  auditScionAdapterProductionCanaryEvidence,
  SCION_ADAPTER_FACTUAL_CANONICAL_PATHS,
  SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY,
  SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL,
  SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS,
  SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY,
  SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL,
} from './lib/scionAdapterCanaryPromotion.mjs';
import { computeScionAdapterPackageIdentity } from './lib/scionBrowserDeviceMatrix.mjs';

const FACTUAL_TEMPLATE = 'evaluation/scion-adapters/factual-canary-promotion.template.json';
const PRODUCTION_TEMPLATE = 'evaluation/scion-adapters/production-canary-promotion.template.json';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function checkTemplate(root, templatePath, protocolVersion, claimBoundary, canonicalPaths) {
  const template = JSON.parse(await fs.readFile(path.join(root, templatePath), 'utf8'));
  const issues = [];
  if (template.protocolVersion !== protocolVersion) issues.push(`${templatePath}:protocol`);
  if (template.claimBoundary !== claimBoundary) issues.push(`${templatePath}:claim-boundary`);
  for (const [key, relativePath] of Object.entries(canonicalPaths)) {
    const digest = sha256(await fs.readFile(path.join(root, relativePath)));
    if (template.canonical?.[key]?.path !== relativePath || template.canonical?.[key]?.sha256 !== digest) {
      issues.push(`${templatePath}:canonical-${key}`);
    }
  }
  return { template, issues };
}

export async function runScionAdapterCanaryPromotionContractAudit({ root = process.cwd() } = {}) {
  const [factualTemplate, productionTemplate] = await Promise.all([
    checkTemplate(
      root,
      FACTUAL_TEMPLATE,
      SCION_ADAPTER_FACTUAL_PROMOTION_PROTOCOL,
      SCION_ADAPTER_FACTUAL_CLAIM_BOUNDARY,
      SCION_ADAPTER_FACTUAL_CANONICAL_PATHS,
    ),
    checkTemplate(
      root,
      PRODUCTION_TEMPLATE,
      SCION_ADAPTER_PRODUCTION_PROMOTION_PROTOCOL,
      SCION_ADAPTER_PRODUCTION_CLAIM_BOUNDARY,
      SCION_ADAPTER_PRODUCTION_CANONICAL_PATHS,
    ),
  ]);
  const adapterManifest = {
    schemaVersion: 2,
    adapter: { id: 'scion-contract-audit', scionVersion: '0.16.29', format: 'gguf-lora', scale: 1 },
    base: {
      modelId: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
      revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
    },
    training: { datasetManifestSha256: 'd'.repeat(64) },
    files: [{ path: 'adapter.gguf', bytes: 1024, sha256: 'e'.repeat(64) }],
    runtime: { supported: ['scion-wllama-webgpu-jspi-v1'] },
    promotion: { status: 'candidate', promotable: false, evidence: [] },
  };
  const packageIdentity = computeScionAdapterPackageIdentity(adapterManifest).sha256;
  const changedPromotionManifest = structuredClone(adapterManifest);
  changedPromotionManifest.promotion.evidence.push({
    type: 'factual-canaries',
    status: 'pass',
    path: 'evidence.json',
    sha256: 'f'.repeat(64),
  });
  const stableIdentity = computeScionAdapterPackageIdentity(changedPromotionManifest).sha256;
  const dummyEvidence = { type: 'pass', status: 'pass' };
  const [factualDummy, productionDummy] = await Promise.all([
    auditScionAdapterFactualCanaryEvidence({
      root,
      evidencePath: path.join(root, 'evaluation/scion-adapters/dummy-factual.json'),
      evidence: dummyEvidence,
      adapterManifest,
      adapterPackageIdentitySha256: packageIdentity,
    }),
    auditScionAdapterProductionCanaryEvidence({
      root,
      evidencePath: path.join(root, 'evaluation/scion-adapters/dummy-production.json'),
      evidence: dummyEvidence,
      adapterManifest,
      adapterPackageIdentitySha256: packageIdentity,
    }),
  ]);
  const issues = [...factualTemplate.issues, ...productionTemplate.issues];
  if (packageIdentity !== stableIdentity) issues.push('promotion-independent-package-identity-drifted');
  for (const [label, report] of [
    ['factual', factualDummy],
    ['production', productionDummy],
  ]) {
    if (report.status !== 'blocked' || report.promotionEligible !== false) {
      issues.push(`${label}:hash-only-dummy-not-rejected`);
    }
    for (const expected of ['evidence-schema-version', 'evidence-protocol-version']) {
      if (!report.issues.includes(expected)) issues.push(`${label}:missing-rejection:${expected}`);
    }
  }
  return {
    schemaVersion: 1,
    audit: 'scion-adapter-canary-promotion-contract-v1',
    status: issues.length === 0 ? 'pass' : 'fail',
    packageIdentity: {
      sha256: packageIdentity,
      remainsStableWhenPromotionEvidenceChanges: packageIdentity === stableIdentity,
    },
    templates: { factual: FACTUAL_TEMPLATE, production: PRODUCTION_TEMPLATE },
    adversarialHashOnlyDummy: { factual: factualDummy, production: productionDummy },
    issues,
  };
}

async function main() {
  const report = await runScionAdapterCanaryPromotionContractAudit();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
