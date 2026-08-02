import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import crypto from 'node:crypto';

import { verifyReplayArtifact } from '../lib/v01710ReplayArtifactVerifier.mjs';

async function fixture() {
  const zip = new JSZip();
  zip.file('PACKAGE_READINESS.json', JSON.stringify({ contentReadiness: { status: 'review', score: 97, grade: 'A' } }));
  zip.file(
    'QUALITY_FINDINGS.json',
    JSON.stringify({ graderVersion: '1.15.3', findings: [{ severity: 'P2' }, { severity: 'P2' }] }),
  );
  zip.file('Lesson Plans/example.docx', 'fixture');
  const zipBytes = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
  const receipt = {
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
  return { receipt, zipBytes };
}

describe('v0.17.10 replay artifact verifier', () => {
  it('binds the physical ZIP and its embedded quality evidence to the replay receipt', async () => {
    const { receipt, zipBytes } = await fixture();
    await expect(
      verifyReplayArtifact({ receipt, zipBytes, reproducedZipBytes: [zipBytes, Buffer.from(zipBytes)] }),
    ).resolves.toMatchObject({ passed: true, freshReproduction: { passed: true } });
  });

  it('fails closed when the physical ZIP no longer matches the receipt', async () => {
    const { receipt, zipBytes } = await fixture();
    receipt.retainedPackage.sha256 = '0'.repeat(64);
    receipt.retainedPackage.reproducibility.secondSha256 = '0'.repeat(64);
    await expect(
      verifyReplayArtifact({ receipt, zipBytes, reproducedZipBytes: [zipBytes, Buffer.from(zipBytes)] }),
    ).rejects.toThrow('Retained package does not match replay receipt');
  });

  it('fails closed when the replay receipt lacks byte-reproduction proof', async () => {
    const { receipt, zipBytes } = await fixture();
    receipt.retainedPackage.reproducibility.passed = false;
    await expect(
      verifyReplayArtifact({ receipt, zipBytes, reproducedZipBytes: [zipBytes, Buffer.from(zipBytes)] }),
    ).rejects.toThrow('Replay receipt byte-reproduction attestation is internally inconsistent');
  });

  it('fails closed unless two fresh package generations are supplied', async () => {
    const { receipt, zipBytes } = await fixture();
    await expect(verifyReplayArtifact({ receipt, zipBytes, reproducedZipBytes: [zipBytes] })).rejects.toThrow(
      'requires two freshly generated package archives',
    );
  });

  it('fails closed when either fresh generation differs from the retained package', async () => {
    const { receipt, zipBytes } = await fixture();
    await expect(
      verifyReplayArtifact({
        receipt,
        zipBytes,
        reproducedZipBytes: [zipBytes, Buffer.concat([zipBytes, Buffer.from('changed')])],
      }),
    ).rejects.toThrow('Fresh replay 2 is not byte-identical');
  });
});
