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

export async function verifyReplayArtifact({ receipt, zipBytes }) {
  const expected = receipt?.retainedPackage;
  if (!expected) throw new Error('Replay receipt does not bind a retained package.');

  const bytes = Buffer.from(zipBytes);
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

  return { passed: true, package: actual };
}
