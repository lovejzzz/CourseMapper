import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function verifyPackageEvidenceZipBytes(zipBytes, { courseContractBytes = null } = {}) {
  const zip = await JSZip.loadAsync(zipBytes);
  const manifestEntry = zip.file('PACKAGE_MANIFEST.json');
  if (!manifestEntry) throw new Error('PACKAGE_MANIFEST.json is missing');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  const rows = Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
  const failures = [];
  let verifiedSources = 0;
  let verifiedClaims = 0;
  const artifactDigests = new Map();
  const evidenceBundle = [];

  for (const row of rows) {
    const receipt = row?.supportReceipt;
    if (receipt?.readinessEligible !== true) continue;
    const snapshot = receipt?.sourceSnapshot;
    const text = cleanText(snapshot?.normalizedSnapshotText);
    const bytes = Buffer.from(text, 'utf8');
    const sourceId = String(row?.id || 'unknown-source');
    if (
      snapshot?.protocol !== 'retrieved-source-snapshot-sha256-v2' ||
      snapshot?.sourceId !== row?.id ||
      bytes.length !== Number(snapshot?.retrievedSnapshotBytes) ||
      sha256(bytes) !== snapshot?.retrievedSnapshotSha256
    ) {
      failures.push(`${sourceId}: snapshot bytes do not reproduce the declared receipt`);
      continue;
    }
    evidenceBundle.push({ sourceId, snapshot, checks: receipt.checks || [] });
    let sourceClaims = 0;
    for (const check of Array.isArray(receipt?.checks) ? receipt.checks : []) {
      const start = Number(check?.quoteByteStart);
      const end = Number(check?.quoteByteEnd);
      const quote = cleanText(check?.quote);
      const claim = cleanText(check?.claim);
      const artifactPath = String(check?.renderedLocation || '');
      const artifact = zip.file(artifactPath);
      if (
        check?.sourceId !== row?.id ||
        check?.retrievedSnapshotSha256 !== snapshot.retrievedSnapshotSha256 ||
        Number(check?.retrievedSnapshotBytes) !== bytes.length ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > bytes.length ||
        cleanText(bytes.subarray(start, end).toString('utf8')) !== quote ||
        sha256(Buffer.from(quote, 'utf8')) !== check?.sourcePassageSha256 ||
        sha256(Buffer.from(claim, 'utf8')) !== check?.claimSha256 ||
        !artifact
      ) {
        failures.push(`${sourceId}: ${check?.claimId || 'claim'} cannot be replayed`);
        continue;
      }
      let artifactDigest = artifactDigests.get(artifactPath);
      if (!artifactDigest) {
        artifactDigest = sha256(Buffer.from(await artifact.async('uint8array')));
        artifactDigests.set(artifactPath, artifactDigest);
      }
      if (artifactDigest !== check?.renderedArtifactSha256) {
        failures.push(`${sourceId}: ${check?.claimId || 'claim'} artifact digest mismatch`);
        continue;
      }
      sourceClaims += 1;
      verifiedClaims += 1;
    }
    if (sourceClaims > 0) verifiedSources += 1;
  }

  let courseContractSha256 = null;
  let verifiedAssessmentObligations = 0;
  if (courseContractBytes) {
    const contractBuffer = Buffer.from(courseContractBytes);
    courseContractSha256 = sha256(contractBuffer);
    const contract = JSON.parse(contractBuffer.toString('utf8'));
    const manifestLessons = new Map(
      (Array.isArray(manifest?.lessons) ? manifest.lessons : []).map((lesson) => [
        Number(lesson?.lessonNumber),
        lesson,
      ]),
    );
    const assessmentRows = new Map(
      (Array.isArray(manifest?.assessmentCoherence?.assessments) ? manifest.assessmentCoherence.assessments : []).map(
        (row) => [Number(row?.lesson), row],
      ),
    );
    for (const expected of Array.isArray(contract?.lessons) ? contract.lessons : []) {
      const lessonNumber = Number(expected?.lessonNumber);
      const manifestLesson = manifestLessons.get(lessonNumber);
      if (!manifestLesson || cleanText(manifestLesson.title) !== cleanText(expected?.title)) {
        failures.push(`course contract lesson ${lessonNumber} is missing or changed`);
        continue;
      }
      if (expected?.assessmentRequired !== true) continue;
      const row = assessmentRows.get(lessonNumber);
      const paths = [row?.taskArtifact, row?.rubricArtifact];
      if (!row || Number(row?.totalChecks) !== 5 || paths.some((entry) => !entry?.path || !entry?.sha256)) {
        failures.push(`course contract assessment ${lessonNumber} is missing its five-check artifact chain`);
        continue;
      }
      let validArtifacts = true;
      for (const entry of paths) {
        const artifact = zip.file(entry.path);
        if (!artifact) {
          validArtifacts = false;
          break;
        }
        let digest = artifactDigests.get(entry.path);
        if (!digest) {
          digest = sha256(Buffer.from(await artifact.async('uint8array')));
          artifactDigests.set(entry.path, digest);
        }
        if (digest !== entry.sha256) validArtifacts = false;
      }
      if (!validArtifacts) {
        failures.push(`course contract assessment ${lessonNumber} artifact digest mismatch`);
        continue;
      }
      verifiedAssessmentObligations += 1;
    }
  }

  if (verifiedSources === 0 || verifiedClaims === 0) failures.push('no replayable claim-bound source evidence found');
  return {
    protocol: 'coursemapper-package-evidence-replay-v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    verifiedSources,
    verifiedClaims,
    verifiedArtifacts: artifactDigests.size,
    evidenceBundleSha256: sha256(Buffer.from(JSON.stringify(evidenceBundle), 'utf8')),
    ...(courseContractSha256 ? { courseContractSha256, verifiedAssessmentObligations } : {}),
    failures,
  };
}

async function main() {
  const zipPath = process.argv[2];
  const contractPath = process.argv[3];
  if (!zipPath)
    throw new Error('Usage: npm run audit:package-evidence -- /path/to/package.zip [/path/to/course-contract.json]');
  const result = await verifyPackageEvidenceZipBytes(await fs.readFile(path.resolve(zipPath)), {
    courseContractBytes: contractPath ? await fs.readFile(path.resolve(contractPath)) : null,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
