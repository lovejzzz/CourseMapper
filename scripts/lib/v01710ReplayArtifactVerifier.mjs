import crypto from 'node:crypto';

import JSZip from 'jszip';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function severityCounts(findings) {
  const counts = { p0: 0, p1: 0, p2: 0 };
  for (const finding of findings) {
    const key = String(finding?.severity || '').toLowerCase();
    if (Object.hasOwn(counts, key)) counts[key] += 1;
  }
  return counts;
}

export async function verifyReplayArtifact({ receipt, zipBytes, reproducedZipBytes = [] }) {
  const expected = receipt?.retainedPackage;
  if (!expected) throw new Error('Replay receipt does not bind a retained package.');
  if (
    expected.reproducibility?.passed !== true ||
    expected.reproducibility?.secondSha256 !== expected.sha256 ||
    expected.reproducibility?.secondSize !== expected.size
  ) {
    throw new Error('Replay receipt byte-reproduction attestation is internally inconsistent.');
  }

  const bytes = Buffer.from(zipBytes);
  const freshReplays = reproducedZipBytes.map((value) => Buffer.from(value));
  if (freshReplays.length < 2) {
    throw new Error('Replay verification requires two freshly generated package archives.');
  }
  for (const [index, replayBytes] of freshReplays.entries()) {
    if (!bytes.equals(replayBytes)) {
      throw new Error(`Fresh replay ${index + 1} is not byte-identical to the retained package.`);
    }
  }
  const zip = await JSZip.loadAsync(bytes);
  const regularFiles = Object.values(zip.files).filter((entry) => !entry.dir).length;
  const readinessEntry = zip.file('PACKAGE_READINESS.json');
  const findingsEntry = zip.file('QUALITY_FINDINGS.json');
  if (!readinessEntry || !findingsEntry) {
    throw new Error('Retained package is missing PACKAGE_READINESS.json or QUALITY_FINDINGS.json.');
  }

  const readiness = JSON.parse(await readinessEntry.async('string'));
  const findingsDocument = JSON.parse(await findingsEntry.async('string'));
  const findings = Array.isArray(findingsDocument.findings) ? findingsDocument.findings : [];
  const actual = {
    sha256: sha256(bytes),
    size: bytes.length,
    files: regularFiles,
    quality: {
      status: readiness?.contentReadiness?.score == null ? 'not-graded' : 'graded',
      graderVersion: findingsDocument.graderVersion,
      score: readiness?.contentReadiness?.score,
      grade: readiness?.contentReadiness?.grade,
      findingCounts: severityCounts(findings),
    },
  };
  const expectedComparable = {
    sha256: expected.sha256,
    size: expected.size,
    files: expected.files,
    quality: {
      status: expected.quality?.status,
      graderVersion: expected.quality?.graderVersion,
      score: expected.quality?.score,
      grade: expected.quality?.grade,
      findingCounts: expected.quality?.findingCounts,
    },
  };
  if (JSON.stringify(actual) !== JSON.stringify(expectedComparable)) {
    throw new Error(
      `Retained package does not match replay receipt. Expected ${JSON.stringify(expectedComparable)}; received ${JSON.stringify(actual)}.`,
    );
  }

  return {
    passed: true,
    package: actual,
    freshReproduction: {
      passed: true,
      runs: freshReplays.map((replayBytes) => ({ sha256: sha256(replayBytes), size: replayBytes.length })),
    },
  };
}
