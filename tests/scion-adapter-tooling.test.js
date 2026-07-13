import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { buildScionAdapterDataset } from '../scripts/scionAdapterDataset.mjs';
import { buildScionAdapterManifest, verifyScionAdapterPackage } from '../scripts/scionAdapterPackage.mjs';
import { assessScionAdapterPromotion } from '../scripts/scionAdapterPromotionAudit.mjs';
import { SCION_ADAPTER_MANIFEST_SCHEMA_VERSION, SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);

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

  it('curates a legacy structural pair with exact validator evidence and an explicit course-domain registry', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-derived-'));
    const source = path.join(root, 'source.jsonl');
    const domainMapPath = path.join(root, 'domain-map.json');
    await fs.writeFile(
      source,
      `${JSON.stringify({
        kind: 'mc-item',
        prompt: 'Write one evidence-grounded multiple-choice item.',
        chosen: goodMc(),
        rejected: goodMc({ op: ['A', 'A', 'B', 'C'] }),
        courseId: 'ux-101',
      })}\n`,
    );
    await fs.writeFile(
      domainMapPath,
      `${JSON.stringify({ schemaVersion: 1, courses: { 'ux-101': 'user-experience-design' } })}\n`,
    );

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      domainMapPath,
      allowSmoke: true,
    });
    const curated = await fs.readFile(path.join(root, 'dataset', 'test.jsonl'), 'utf8');

    expect(result.manifest).toMatchObject({
      schemaVersion: 2,
      status: 'smoke-only',
      counts: { total: 1, domains: 1, groups: 1 },
      domainMap: { entries: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(JSON.parse(curated)).toMatchObject({
      context: { domain: 'user-experience-design', courseId: 'ux-101', domainSource: 'registry' },
      preferenceEvidence: {
        kind: 'deterministic-contract-margin',
        scope: 'non-semantic-contract-only',
      },
    });
  });

  it('pins training and local evaluation defaults to the browser-compatible QAT parent', async () => {
    const [launcher, server, shim] = await Promise.all([
      fs.readFile('trellis/tendril/distill/run_orpo_g4.sh', 'utf8'),
      fs.readFile('trellis/tendril/distill/serve_g4.py', 'utf8'),
      fs.readFile('scripts/crucible/e2bOpenAIShim.mjs', 'utf8'),
    ]);
    for (const source of [launcher, server, shim]) {
      expect(source).toContain(SCION_GEMMA4_E2B_BASE.modelId);
    }
    expect(launcher).toContain(SCION_GEMMA4_E2B_BASE.revision);
    expect(launcher).not.toContain('BASE_MODEL=google/gemma-4-E2B-it\n');
  });

  it('keeps the MLX-to-PEFT bridge narrow enough to self-test without Apple ML dependencies', async () => {
    const { stdout } = await execFile('python3', [
      'trellis/tendril/distill/convert_mlx_lora_to_peft.py',
      '--self-test',
    ]);
    expect(JSON.parse(stdout)).toEqual({ status: 'pass', test: 'scion-mlx-lora-name-contract' });
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
      schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
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
