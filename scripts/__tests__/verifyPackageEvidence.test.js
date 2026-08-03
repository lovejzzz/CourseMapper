import crypto from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { verifyPackageEvidenceZipBytes } from '../verifyPackageEvidence.mjs';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function docxBytes(text) {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

function courseContractBytes() {
  return Buffer.from(
    JSON.stringify({
      lessons: [
        {
          lessonNumber: 1,
          title: 'Lesson 1: Evidence',
          objectives: ['Explain evidence using the available course evidence.'],
          assessmentId: 'A1.1',
          assessmentTitle: 'Evidence explanation',
          assessmentRequired: true,
        },
      ],
    }),
  );
}

async function packageBytes({
  snapshotText = 'prefix Exact open-source claim. suffix',
  claim = 'Exact open-source claim.',
  artifactText = claim,
  withAssessment = false,
  taskText = 'A1.1 Evidence explanation. Explain evidence using the available course evidence. Student evidence submission requirements: submit a written reflection.',
  rubricText = 'A1.1 Evidence explanation. Criteria: evidence analysis 50%. Excellent, Proficient, Developing, Beginning.',
} = {}) {
  const quote = 'Exact open-source claim.';
  const sourceId = 'source-1';
  const artifactPath = 'Lesson Plans/Lesson 01 - Evidence.docx';
  const start = Buffer.from(snapshotText, 'utf8').indexOf(Buffer.from(quote, 'utf8'));
  const zip = new JSZip();
  const artifactBytes = await docxBytes(artifactText);
  zip.file(artifactPath, artifactBytes);
  const taskPath = 'Assignment Briefs/Lesson 01 - Task.docx';
  const rubricPath = 'Rubrics/Lesson 01 - Rubric.docx';
  const taskBytes = await docxBytes(taskText);
  const rubricBytes = await docxBytes(rubricText);
  if (withAssessment) {
    zip.file(taskPath, taskBytes);
    zip.file(rubricPath, rubricBytes);
  }
  const assessmentChecks = [
    'task-identity-visible',
    'lesson-objective-visible-in-task',
    'student-evidence-visible',
    'matching-rubric-identity-visible',
    'observable-rubric-criteria-visible',
  ].map((id) => ({ id, passed: true }));
  const manifest = {
    quality: {
      graderVersion: '1.15.9',
      readiness: { score: 87, ledger: { protocol: 'test-ledger-v1', rules: [] } },
    },
    lessons: withAssessment
      ? [
          {
            lessonNumber: 1,
            title: 'Lesson 1: Evidence',
            objectives: ['Explain evidence using the available course evidence.'],
          },
        ]
      : [],
    assessmentCoherence: withAssessment
      ? {
          assessments: [
            {
              lesson: 1,
              assessmentId: 'A1.1',
              title: 'Evidence explanation',
              totalChecks: 5,
              passedChecks: 5,
              passed: true,
              checks: assessmentChecks,
              taskArtifact: { path: taskPath, sha256: sha256(taskBytes) },
              rubricArtifact: { path: rubricPath, sha256: sha256(rubricBytes) },
            },
          ],
        }
      : { assessments: [] },
    sourceLedger: [
      {
        id: sourceId,
        provider: 'wikipedia',
        url: 'https://en.wikipedia.org/wiki/Evidence',
        license: 'CC BY-SA 4.0',
        provenanceMismatch: false,
        supportReceipt: {
          status: 'passed',
          semanticSupport: true,
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
              locator: 'Evidence',
              quote,
              claim,
              quoteInSnapshot: true,
              entailed: true,
              semanticSupport: true,
              retrievedSnapshotSha256: sha256('prefix Exact open-source claim. suffix'),
              retrievedSnapshotBytes: Buffer.byteLength(snapshotText),
              quoteByteStart: start,
              quoteByteEnd: start + Buffer.byteLength(quote),
              sourcePassageSha256: sha256(quote),
              claimSha256: sha256(claim),
              renderedLocation: artifactPath,
              renderedArtifactSha256: sha256(artifactBytes),
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

  it('fails closed when snapshot bytes or visible artifact claims are changed and re-signed', async () => {
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ snapshotText: 'Prefix Exact open-source claim. suffix' })),
    ).resolves.toMatchObject({
      status: 'fail',
      verifiedClaims: 0,
    });
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ artifactText: 'Unrelated but correctly hashed artifact.' })),
    ).resolves.toMatchObject({
      status: 'fail',
      verifiedClaims: 0,
    });
  });

  it('rejects a self-consistently re-signed claim that is not the quoted source passage', async () => {
    await expect(
      verifyPackageEvidenceZipBytes(
        await packageBytes({ claim: 'Fabricated claim.', artifactText: 'Fabricated claim.' }),
      ),
    ).resolves.toMatchObject({ status: 'fail', verifiedClaims: 0 });
  });

  it('rejects a self-consistent source row that fails provider, URL, or license admission', async () => {
    const bytes = await packageBytes();
    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    manifest.sourceLedger[0].provider = 'evil-provider';
    manifest.sourceLedger[0].url = 'not-a-url';
    manifest.sourceLedger[0].license = 'All rights reserved';
    zip.file('PACKAGE_MANIFEST.json', JSON.stringify(manifest));
    await expect(verifyPackageEvidenceZipBytes(await zip.generateAsync({ type: 'uint8array' }))).resolves.toMatchObject(
      { status: 'fail', verifiedSources: 0, verifiedClaims: 0 },
    );
  });

  it('replays assessment obligations from visible Office text against an immutable external contract', async () => {
    const contract = courseContractBytes();
    const expectedCourseContractSha256 = sha256(contract);
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ withAssessment: true }), {
        courseContractBytes: contract,
        expectedCourseContractSha256,
      }),
    ).resolves.toMatchObject({ status: 'pass', verifiedAssessmentObligations: 1 });
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes(), { courseContractBytes: contract }),
    ).resolves.toMatchObject({ status: 'fail', verifiedAssessmentObligations: 0 });
  });

  it('rejects re-signed assessment rows whose declared checks are not visible in the Office bytes', async () => {
    const contract = courseContractBytes();
    await expect(
      verifyPackageEvidenceZipBytes(
        await packageBytes({
          withAssessment: true,
          taskText: 'A1.1 Evidence explanation.',
          rubricText: 'A1.1 Evidence explanation.',
        }),
        { courseContractBytes: contract, expectedCourseContractSha256: sha256(contract) },
      ),
    ).resolves.toMatchObject({ status: 'fail', verifiedAssessmentObligations: 0 });
  });

  it('rejects the right contract bytes when the caller supplies the wrong immutable root', async () => {
    const contract = courseContractBytes();
    await expect(
      verifyPackageEvidenceZipBytes(await packageBytes({ withAssessment: true }), {
        courseContractBytes: contract,
        expectedCourseContractSha256: '0'.repeat(64),
      }),
    ).resolves.toMatchObject({ status: 'fail' });
  });

  it('binds ZIP, bundle, counts, score ledger, score, grader, and course contract as one release graph', async () => {
    const contract = courseContractBytes();
    const packageZip = await packageBytes({ withAssessment: true });
    const replay = await verifyPackageEvidenceZipBytes(packageZip, {
      courseContractBytes: contract,
      expectedCourseContractSha256: sha256(contract),
    });
    const attestation = {
      protocol: 'coursemapper-release-evidence-attestation-v1',
      packageSha256: replay.packageSha256,
      courseContractSha256: replay.courseContractSha256,
      evidenceBundleSha256: replay.evidenceBundleSha256,
      scoreLedgerSha256: replay.scoreLedgerSha256,
      verifiedSources: replay.verifiedSources,
      verifiedClaims: replay.verifiedClaims,
      verifiedArtifacts: replay.verifiedArtifacts,
      verifiedAssessmentObligations: replay.verifiedAssessmentObligations,
      readinessScore: replay.readinessScore,
      graderVersion: replay.graderVersion,
    };
    await expect(
      verifyPackageEvidenceZipBytes(packageZip, {
        courseContractBytes: contract,
        releaseAttestationBytes: Buffer.from(JSON.stringify(attestation)),
      }),
    ).resolves.toMatchObject({ status: 'pass' });

    const zip = await JSZip.loadAsync(packageZip);
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const added = structuredClone(manifest.sourceLedger[0]);
    added.id = 'source-2';
    added.supportReceipt.sourceSnapshot.sourceId = 'source-2';
    added.supportReceipt.checks[0].sourceId = 'source-2';
    added.supportReceipt.checks[0].claimId = 'claim-2';
    manifest.sourceLedger.push(added);
    zip.file('PACKAGE_MANIFEST.json', JSON.stringify(manifest));
    const expandedZip = await zip.generateAsync({ type: 'uint8array' });
    const resignedAttestation = { ...attestation, packageSha256: sha256(expandedZip) };
    await expect(
      verifyPackageEvidenceZipBytes(expandedZip, {
        courseContractBytes: contract,
        releaseAttestationBytes: Buffer.from(JSON.stringify(resignedAttestation)),
      }),
    ).resolves.toMatchObject({ status: 'fail', verifiedSources: 2, verifiedClaims: 2 });
  });
});
