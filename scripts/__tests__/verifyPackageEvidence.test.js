import crypto from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { verifyPackageEvidenceZipBytes } from '../verifyPackageEvidence.mjs';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function packageBytes({
  snapshotText = 'prefix Exact open-source claim. suffix',
  artifactText = 'Exact open-source claim.',
  withAssessment = false,
} = {}) {
  const quote = 'Exact open-source claim.';
  const sourceId = 'source-1';
  const artifactPath = 'Lesson Plans/Lesson 01 - Evidence.docx';
  const start = Buffer.from(snapshotText, 'utf8').indexOf(Buffer.from(quote, 'utf8'));
  const zip = new JSZip();
  zip.file(artifactPath, artifactText);
  const taskPath = 'Assignment Briefs/Lesson 01 - Task.docx';
  const rubricPath = 'Rubrics/Lesson 01 - Rubric.docx';
  if (withAssessment) {
    zip.file(taskPath, 'Task bytes');
    zip.file(rubricPath, 'Rubric bytes');
  }
  const manifest = {
    lessons: withAssessment ? [{ lessonNumber: 1, title: 'Lesson 1: Evidence' }] : [],
    assessmentCoherence: withAssessment
      ? {
          assessments: [
            {
              lesson: 1,
              totalChecks: 5,
              taskArtifact: { path: taskPath, sha256: sha256('Task bytes') },
              rubricArtifact: { path: rubricPath, sha256: sha256('Rubric bytes') },
            },
          ],
        }
      : { assessments: [] },
    sourceLedger: [
      {
        id: sourceId,
        supportReceipt: {
          readinessEligible: true,
          sourceSnapshot: {
            protocol: 'retrieved-source-snapshot-sha256-v2',
            sourceId,
            retrievedSnapshotSha256: sha256('prefix Exact open-source claim. suffix'),
            retrievedSnapshotBytes: Buffer.byteLength(snapshotText),
            normalizedSnapshotText: snapshotText,
            contentVerified: true,
          },
          checks: [
            {
              claimId: 'claim-1',
              sourceId,
              quote,
              claim: quote,
              retrievedSnapshotSha256: sha256('prefix Exact open-source claim. suffix'),
              retrievedSnapshotBytes: Buffer.byteLength(snapshotText),
              quoteByteStart: start,
              quoteByteEnd: start + Buffer.byteLength(quote),
              sourcePassageSha256: sha256(quote),
              claimSha256: sha256(quote),
              renderedLocation: artifactPath,
              renderedArtifactSha256: sha256('Exact open-source claim.'),
            },
          ],
        },
      },
    ],
  };
  zip.file('PACKAGE_MANIFEST.json', JSON.stringify(manifest));
  return zip.generateAsync({ type: 'uint8array' });
}

describe('independent package evidence replay', () => {
  it('replays snapshot, quote, claim, and Office artifact digests', async () => {
    await expect(verifyPackageEvidenceZipBytes(await packageBytes())).resolves.toMatchObject({
      status: 'pass',
      verifiedSources: 1,
      verifiedClaims: 1,
      verifiedArtifacts: 1,
      failures: [],
    });
  });

  it('fails closed when snapshot or artifact bytes are changed', async () => {
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ snapshotText: 'Prefix Exact open-source claim. suffix' })),
    ).resolves.toMatchObject({
      status: 'fail',
      verifiedClaims: 0,
    });
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ artifactText: 'Changed artifact.' })),
    ).resolves.toMatchObject({
      status: 'fail',
      verifiedClaims: 0,
    });
  });

  it('binds assessment obligations to an external pre-generation course contract', async () => {
    const contract = Buffer.from(
      JSON.stringify({ lessons: [{ lessonNumber: 1, title: 'Lesson 1: Evidence', assessmentRequired: true }] }),
    );
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ withAssessment: true }), { courseContractBytes: contract }),
    ).resolves.toMatchObject({ status: 'pass', verifiedAssessmentObligations: 1 });
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes(), { courseContractBytes: contract }),
    ).resolves.toMatchObject({ status: 'fail', verifiedAssessmentObligations: 0 });
  });
});
