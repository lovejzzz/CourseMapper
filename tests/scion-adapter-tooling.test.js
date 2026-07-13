import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionAdapterDataset } from '../scripts/scionAdapterDataset.mjs';
import { buildScionAdapterManifest, verifyScionAdapterPackage } from '../scripts/scionAdapterPackage.mjs';
import { assessScionAdapterPromotion } from '../scripts/scionAdapterPromotionAudit.mjs';
import { SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function goodMc(overrides = {}) {
  return {
    q: 'Which evidence most directly supports revising the prototype navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant says the colors look pleasant',
      'The designer prefers the original navigation',
      'A stakeholder requests a larger project logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    ...overrides,
  };
}

function approvedRow() {
  return {
    kind: 'mc-item',
    prompt: 'Write one evidence-grounded multiple-choice item.',
    chosen: goodMc(),
    rejected: goodMc({ q: 'Which observation suggests changing the prototype navigation?' }),
    context: { domain: 'user experience design', courseId: 'ux-101' },
    preferenceEvidence: {
      kind: 'blind-instructor-preference',
      verified: true,
      preferred: 'chosen',
      unanimous: true,
      reviewerIds: ['instructor-a', 'instructor-b'],
      reviewerRoles: ['working-instructor', 'working-instructor'],
      reviewHashes: ['review-a', 'review-b'],
    },
  };
}

describe('Scion adapter tooling', () => {
  it('builds a leakage-safe smoke dataset while quarantining duplicate pairs', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    await fs.writeFile(source, `${JSON.stringify(row)}\n${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      minimumPairs: 3000,
      minimumDomains: 5,
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({
      status: 'smoke-only',
      promotable: false,
      counts: { loaded: 2, total: 1, quarantined: 1, domains: 1, groups: 1 },
      leakage: { groupOverlapCount: 0 },
    });
    expect(result.manifest.quarantine[0].issues).toContain('duplicate-pair');
  });

  it('quarantines rows that cannot be grouped by a known course and domain', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-identity-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    delete row.context;
    await fs.writeFile(source, `${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({ status: 'blocked', counts: { loaded: 1, total: 0, quarantined: 1 } });
    expect(result.manifest.quarantine[0].issues).toEqual(
      expect.arrayContaining(['missing-domain', 'missing-course-group']),
    );
  });

  it('hash-binds an adapter to its exact base and dataset, then detects mutation', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-package-'));
    const adapterDir = path.join(root, 'adapter');
    const datasetDir = path.join(root, 'dataset');
    await fs.mkdir(adapterDir, { recursive: true });
    await fs.mkdir(datasetDir, { recursive: true });
    await fs.writeFile(path.join(adapterDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.writeFile(path.join(adapterDir, 'adapters.safetensors'), Buffer.from('adapter-weights'));
    const datasetManifest = path.join(datasetDir, 'dataset-manifest.json');
    await fs.writeFile(datasetManifest, '{"status":"smoke-only","counts":{"total":1,"domains":1}}\n');

    const built = await buildScionAdapterManifest({
      adapterDir,
      adapterId: 'scion-g4e2b-smoke',
      scionVersion: '0.16.6',
      datasetManifest,
      status: 'smoke',
    });
    await expect(verifyScionAdapterPackage({ manifestPath: built.outputPath })).resolves.toMatchObject({
      status: 'pass',
      valid: true,
      adapterId: 'scion-g4e2b-smoke',
    });

    await fs.appendFile(path.join(adapterDir, 'adapters.safetensors'), '-tampered');
    const tampered = await verifyScionAdapterPackage({ manifestPath: built.outputPath });
    expect(tampered.valid).toBe(false);
    expect(tampered.issues).toEqual(
      expect.arrayContaining(['adapters.safetensors:bytes-mismatch', 'adapters.safetensors:sha256-mismatch']),
    );
  });

  it('promotes only exact adapter evidence with five clean domains and a real call reduction', () => {
    const manifestSha256 = 'c'.repeat(64);
    const manifest = {
      schemaVersion: 1,
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.6', format: 'mlx-lora-safetensors' },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      training: {
        method: 'orpo-lora',
        datasetManifestSha256: 'd'.repeat(64),
        datasetStatus: 'ready',
        pairCount: 3200,
        domainCount: 5,
      },
      files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: 'e'.repeat(64) }],
      runtime: { supported: ['mlx-vlm'] },
      promotion: {
        status: 'candidate',
        promotable: false,
        evidence: ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map(
          (type) => ({ type, status: 'pass', sha256: 'f'.repeat(64) }),
        ),
      },
    };
    const domains = ['ethics', 'music', 'ux', 'geology', 'literature'];
    const candidateEvidence = [
      {
        fullCourses: domains.map((domain) => ({
          domain,
          packageValid: true,
          packageGrade: 99,
          p0: 0,
          p1: 0,
          scionPassCalls: 75,
          adapterActive: true,
          adapterId: manifest.adapter.id,
          adapterManifestSha256: manifestSha256,
          baseRevision: manifest.base.revision,
        })),
      },
    ];
    const baseEvidence = [
      {
        fullCourses: domains.map((domain) => ({
          domain,
          packageValid: true,
          packageGrade: 99,
          p0: 0,
          p1: 0,
          scionPassCalls: 100,
        })),
      },
    ];

    const report = assessScionAdapterPromotion({
      manifest,
      manifestSha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(report).toMatchObject({ status: 'pass', promotable: true, efficiency: { medianReduction: 0.25 } });

    candidateEvidence[0].fullCourses[0].adapterManifestSha256 = '0'.repeat(64);
    const mismatched = assessScionAdapterPromotion({
      manifest,
      manifestSha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(mismatched).toMatchObject({ status: 'blocked', promotable: false });
    expect(mismatched.failedGates).toContain('courseQuality');
  });
});
