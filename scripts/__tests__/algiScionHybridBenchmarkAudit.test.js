import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { auditAlgiScionHybridBenchmark } from '../algiScionHybridBenchmarkAudit.mjs';

const temporaryRoots = [];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function makeBenchmarkFixture({ sparse = false, truthyArtifacts = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edutool-hybrid-evidence-'));
  temporaryRoots.push(root);
  const manifestRelativePath = 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json';
  const manifestPath = path.join(root, manifestRelativePath);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const manifestBytes = fs.readFileSync(manifestRelativePath);
  fs.writeFileSync(manifestPath, manifestBytes);
  const manifest = JSON.parse(manifestBytes);

  const cases = manifest.courses.map((course, courseIndex) => {
    const arms = {};
    for (const armId of ['algi', 'scion', 'hybrid']) {
      const artifacts = {};
      for (const artifactName of manifest.executionContract.requiredArtifactsPerArm) {
        if (truthyArtifacts) {
          artifacts[artifactName] = true;
          continue;
        }
        const relativePath = `artifacts/${course.id}/${armId}/${artifactName}.txt`;
        const absolutePath = path.join(root, relativePath);
        const artifactBytes = Buffer.from(`${course.id}:${armId}:${artifactName}`);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, artifactBytes);
        artifacts[artifactName] = {
          path: relativePath,
          sha256: sha256(artifactBytes),
          bytes: artifactBytes.byteLength,
        };
      }
      arms[armId] = {
        artifacts,
        ...(!sparse
          ? {
              metrics: {
                coverage: armId === 'hybrid' ? 1 : 0.9,
                p0: 0,
                p1: 0,
                unsupportedClaims: 0,
                blockers: 0,
                modelCalls: armId === 'algi' ? 0 : 1,
                quality: armId === 'hybrid' ? 92 : 88,
                durationMs: armId === 'hybrid' ? 1100 : 1000,
              },
            }
          : {}),
      };
    }
    return { id: course.id, arms, blindWinner: courseIndex < 3 ? 'hybrid' : 'tie' };
  });

  const evidence = {
    benchmarkId: manifest.id,
    manifestSha256: sha256(manifestBytes),
    compilerCommit: '4e162600',
    judge: {
      identity: 'independent-judge-001',
      blinded: true,
      attestation: 'I evaluated randomized anonymous artifacts without arm labels.',
      randomizedOrders: manifest.courses.map((course, index) => ({
        caseId: course.id,
        armOrder: index % 2 === 0 ? ['scion', 'hybrid', 'algi'] : ['hybrid', 'algi', 'scion'],
      })),
    },
    cases,
  };
  const evidenceRelativePath = 'evidence.json';
  fs.writeFileSync(path.join(root, evidenceRelativePath), `${JSON.stringify(evidence, null, 2)}\n`);
  return { root, manifestRelativePath, evidenceRelativePath, evidence };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Algi → Scion frozen promotion benchmark', () => {
  it('validates the frozen cross-domain contract without pretending it is a result', async () => {
    const report = await auditAlgiScionHybridBenchmark();
    expect(report).toMatchObject({
      status: 'ready',
      promotionEligible: false,
      cases: 5,
      domains: 5,
      blockers: ['paired-evidence-not-recorded'],
    });
    expect(report.claimBoundary).toContain('not a result');
  });

  it('makes missing paired evidence fail the normal release command', () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deepGate = fs.readFileSync('scripts/deepProofQualityGate.mjs', 'utf8');
    expect(packageJson.scripts['audit:algi:hybrid']).toContain('--strict');
    expect(deepGate).toContain("label: 'Grounded authoring benchmark evidence'");
    expect(deepGate).toContain("args: ['run', 'audit:algi:hybrid']");
  });

  it('accepts complete finite metrics, blinded judging, and hash-bound artifacts', async () => {
    const fixture = makeBenchmarkFixture();
    const report = await auditAlgiScionHybridBenchmark({
      root: fixture.root,
      manifestPath: fixture.manifestRelativePath,
      evidencePath: fixture.evidenceRelativePath,
    });

    expect(report.status).toBe('pass');
    expect(report.promotionEligible).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it('fails closed for sparse forged metrics and truthy artifact placeholders', async () => {
    const fixture = makeBenchmarkFixture({ sparse: true, truthyArtifacts: true });
    const report = await auditAlgiScionHybridBenchmark({
      root: fixture.root,
      manifestPath: fixture.manifestRelativePath,
      evidencePath: fixture.evidenceRelativePath,
    });

    expect(report.status).toBe('fail');
    expect(report.promotionEligible).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid-artifact:package-zip:record-shape'),
        expect.stringContaining('missing-finite-metric:coverage'),
      ]),
    );
  });

  it('rejects tampered bytes and incomplete judge attestation', async () => {
    const fixture = makeBenchmarkFixture();
    fixture.evidence.judge.attestation = '';
    const firstCase = fixture.evidence.cases[0];
    const record = firstCase.arms.hybrid.artifacts['package-zip'];
    fs.appendFileSync(path.join(fixture.root, record.path), 'tampered');
    fs.writeFileSync(
      path.join(fixture.root, fixture.evidenceRelativePath),
      `${JSON.stringify(fixture.evidence, null, 2)}\n`,
    );

    const report = await auditAlgiScionHybridBenchmark({
      root: fixture.root,
      manifestPath: fixture.manifestRelativePath,
      evidencePath: fixture.evidenceRelativePath,
    });

    expect(report.blockers).toEqual(
      expect.arrayContaining([
        'evidence-judge-attestation',
        expect.stringContaining('invalid-artifact:package-zip:artifact-bytes+artifact-sha256'),
      ]),
    );
  });
});
