import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import crypto from 'node:crypto';

import { verifyReplayArtifact } from '../lib/v01710ReplayArtifactVerifier.mjs';

async function fixture() {
  const inputProject = {
    protocol: 'coursemapper-output-quality-replay-fixture-v1',
    sourceProjectSha256: 'a'.repeat(64),
    courseMap: { courseName: 'Fixture' },
    deliverables: {},
    selectedFeatures: [],
  };
  const inputBytes = Buffer.from(JSON.stringify(inputProject));
  const retainedFixture = {
    protocol: 'coursemapper-output-quality-replay-fixture-v1',
    sourceProjectSha256: inputProject.sourceProjectSha256,
    courseMap: inputProject.courseMap,
    courseGraph: undefined,
    deliverables: inputProject.deliverables,
    selectedFeatures: inputProject.selectedFeatures,
    columns: undefined,
    slideTheme: undefined,
    deliverableConfig: undefined,
    promptText: undefined,
    lastRunDigest: undefined,
    apiCallBudgetReceipt: undefined,
  };
  const zip = new JSZip();
  zip.file('PACKAGE_READINESS.json', JSON.stringify({ contentReadiness: { status: 'review', score: 97, grade: 'A' } }));
  zip.file(
    'QUALITY_FINDINGS.json',
    JSON.stringify({ graderVersion: '1.15.3', findings: [{ severity: 'P2' }, { severity: 'P2' }] }),
  );
  zip.file('Lesson Plans/example.docx', 'fixture');
  const zipBytes = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
  const receipt = {
    inputSha256: crypto.createHash('sha256').update(inputBytes).digest('hex'),
    sourceProjectSha256: inputProject.sourceProjectSha256,
    retainedFixtureSha256: crypto.createHash('sha256').update(JSON.stringify(retainedFixture)).digest('hex'),
    retainedPackage: {
      sha256: crypto.createHash('sha256').update(zipBytes).digest('hex'),
      size: zipBytes.length,
      files: 3,
      quality: {
        status: 'graded',
        graderVersion: '1.15.3',
        score: 97,
        grade: 'A',
        findingCounts: { p0: 0, p1: 0, p2: 2 },
      },
      reproducibility: {
        passed: true,
        secondSha256: crypto.createHash('sha256').update(zipBytes).digest('hex'),
        secondSize: zipBytes.length,
      },
    },
  };
  return { receipt, zipBytes, inputBytes, inputProject };
}

function verifyOptions(value) {
  return {
    ...value,
    reproducedZipBytes: [value.zipBytes, Buffer.from(value.zipBytes)],
  };
}

describe('v0.17.10 replay artifact verifier', () => {
  it('binds the physical ZIP and its embedded quality evidence to the replay receipt', async () => {
    await expect(verifyReplayArtifact(verifyOptions(await fixture()))).resolves.toMatchObject({
      passed: true,
      freshReproduction: { passed: true },
    });
  });

  it('fails closed when the receipt is paired with different input bytes', async () => {
    const value = await fixture();
    value.inputBytes = Buffer.from('different input');
    await expect(verifyReplayArtifact(verifyOptions(value))).rejects.toThrow('does not match the exact input bytes');
  });

  it('fails closed when the canonical retained fixture identity changes', async () => {
    const value = await fixture();
    value.inputProject.courseMap.courseName = 'Different Fixture';
    await expect(verifyReplayArtifact(verifyOptions(value))).rejects.toThrow('canonical retained fixture');
  });

  it('fails closed when the physical ZIP no longer matches the receipt', async () => {
    const value = await fixture();
    value.receipt.retainedPackage.sha256 = '0'.repeat(64);
    value.receipt.retainedPackage.reproducibility.secondSha256 = '0'.repeat(64);
    await expect(verifyReplayArtifact(verifyOptions(value))).rejects.toThrow(
      'Retained package does not match replay receipt',
    );
  });

  it('fails closed when the replay receipt lacks byte-reproduction proof', async () => {
    const value = await fixture();
    value.receipt.retainedPackage.reproducibility.passed = false;
    await expect(verifyReplayArtifact(verifyOptions(value))).rejects.toThrow(
      'Replay receipt byte-reproduction attestation is internally inconsistent',
    );
  });

  it('fails closed unless two fresh package generations are supplied', async () => {
    const value = await fixture();
    await expect(verifyReplayArtifact({ ...value, reproducedZipBytes: [value.zipBytes] })).rejects.toThrow(
      'requires two freshly generated package archives',
    );
  });

  it('fails closed when either fresh generation differs from the retained package', async () => {
    const value = await fixture();
    await expect(
      verifyReplayArtifact({
        ...value,
        reproducedZipBytes: [value.zipBytes, Buffer.concat([value.zipBytes, Buffer.from('changed')])],
      }),
    ).rejects.toThrow('Fresh replay 2 is not byte-identical');
  });
});
