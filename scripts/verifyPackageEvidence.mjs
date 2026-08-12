import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

import { isLicenseAmbiguous, isSourceAccessible, isTrustedSourceLedgerRow } from '../src/lib/knowledge/sourceLedger.js';
import { objectiveTaskMapping } from '../src/lib/quality/assessmentCoherence.js';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exactSnapshotText(value) {
  const text = String(value ?? '');
  // Snapshot hashes and byte offsets describe the bytes that travel in the
  // package. Never compatibility-normalize or collapse whitespace here: NFKC
  // changes valid linguistic evidence such as superscript aspiration.
  return text.length <= 500000 ? text : '';
}

function normalized(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function visibleXmlText(xml) {
  return decodeXmlEntities(String(xml ?? '').replace(/<[^>]+>/g, ' '))
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractOfficeVisibleText(artifactBytes, artifactPath) {
  const office = await JSZip.loadAsync(artifactBytes);
  const extension = path.extname(String(artifactPath || '')).toLowerCase();
  const parts = [];
  const names = Object.keys(office.files).sort();
  for (const name of names) {
    const visiblePart =
      extension === '.docx'
        ? /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)
        : extension === '.pptx'
          ? /^ppt\/(?:slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name)
          : false;
    if (!visiblePart) continue;
    parts.push(visibleXmlText(await office.file(name).async('string')));
  }
  if (parts.length === 0) throw new Error(`${artifactPath}: no independently readable Office text parts`);
  return cleanText(parts.join(' '));
}

function textContains(haystack, needle) {
  const expected = normalized(needle);
  return Boolean(expected) && normalized(haystack).includes(expected);
}

function assessmentIdentityVisible(expected, text) {
  const id = cleanText(expected?.assessmentId);
  if (id) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text)) return true;
  }
  return textContains(text, expected?.assessmentTitle);
}

function visibleStudentEvidence(text) {
  const value = cleanText(text);
  return (
    /\b(?:deliverables?|student evidence|evidence|submission requirements?)\b/i.test(value) &&
    /\b(?:submit|turn in|prepare|produce|create|provide|record|write|present|attach|final file|revision trace|reflection)\b/i.test(
      value,
    )
  );
}

function visibleRubricCriteria(text) {
  const value = cleanText(text);
  const levels = ['excellent', 'proficient', 'developing', 'beginning'].filter((level) =>
    new RegExp(`\\b${level}\\b`, 'i').test(value),
  ).length;
  return (
    levels >= 2 &&
    /\b(?:criterion|criteria|evidence|reasoning|analysis|revision|decision|demonstrate)\b/i.test(value) &&
    /\b\d{1,3}\s*%/.test(value)
  );
}

const ASSESSMENT_CHECK_IDS = [
  'task-identity-visible',
  'lesson-objective-visible-in-task',
  'student-evidence-visible',
  'matching-rubric-identity-visible',
  'observable-rubric-criteria-visible',
  'manifest-objective-visible-in-instruction',
];

function sourceAdmissionFailure(row, receipt) {
  // The package verifier must share the generator's trust policy rather than
  // maintain a second provider allowlist. The duplicated list previously
  // rejected WALS and MIT OCW rows that the source ledger had already admitted.
  if (!isSourceAccessible(row)) return 'source has no accessible URL or DOI';
  if (isLicenseAmbiguous(row?.license)) return 'source license is ambiguous or restricted';
  if (row?.provenanceMismatch === true) return 'source declares a provenance mismatch';
  if (!isTrustedSourceLedgerRow(row)) return 'provider is not independently trust-eligible';
  if (receipt?.status !== 'passed' || receipt?.semanticSupport !== true || receipt?.readinessEligible !== true) {
    return 'source receipt did not pass semantic-support admission';
  }
  return '';
}

export async function verifyPackageEvidenceZipBytes(
  zipBytes,
  {
    courseContractBytes = null,
    expectedCourseContractSha256 = null,
    releaseAttestationBytes = null,
    expectedReleaseAttestationSha256 = null,
  } = {},
) {
  const packageBuffer = Buffer.from(zipBytes);
  const packageSha256 = sha256(packageBuffer);
  const zip = await JSZip.loadAsync(packageBuffer);
  const manifestEntry = zip.file('PACKAGE_MANIFEST.json');
  if (!manifestEntry) throw new Error('PACKAGE_MANIFEST.json is missing');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  const rows = Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
  const failures = [];
  let verifiedSources = 0;
  let verifiedClaims = 0;
  const artifactDigests = new Map();
  const artifactVisibleText = new Map();
  const evidenceBundle = [];
  let releaseAttestation = null;
  let releaseAttestationSha256 = null;
  if (releaseAttestationBytes) {
    const attestationBuffer = Buffer.from(releaseAttestationBytes);
    releaseAttestationSha256 = sha256(attestationBuffer);
    releaseAttestation = JSON.parse(attestationBuffer.toString('utf8'));
    if (!expectedReleaseAttestationSha256 || releaseAttestationSha256 !== expectedReleaseAttestationSha256) {
      failures.push('release attestation does not match the caller-supplied immutable root');
    }
    if (releaseAttestation?.protocol !== 'coursemapper-release-evidence-attestation-v1') {
      failures.push('release attestation protocol is missing or unsupported');
    }
    const attestedContractSha256 = cleanText(releaseAttestation?.courseContractSha256);
    if (expectedCourseContractSha256 && cleanText(expectedCourseContractSha256) !== attestedContractSha256) {
      failures.push('release attestation conflicts with the caller-supplied course-contract root');
    } else if (!expectedCourseContractSha256) {
      expectedCourseContractSha256 = attestedContractSha256;
    }
  }

  for (const row of rows) {
    const receipt = row?.supportReceipt;
    if (receipt?.readinessEligible !== true) continue;
    const admissionFailure = sourceAdmissionFailure(row, receipt);
    if (admissionFailure) {
      failures.push(`${String(row?.id || 'unknown-source')}: ${admissionFailure}`);
      continue;
    }
    const snapshot = receipt?.sourceSnapshot;
    const text = exactSnapshotText(snapshot?.normalizedSnapshotText);
    const bytes = Buffer.from(text, 'utf8');
    const sourceId = String(row?.id || 'unknown-source');
    // Binding-specific ledger rows retain the immutable source-work identity
    // in sourceWorkId. Snapshot and claim receipts are signed against that
    // work identity while row.id remains the occurrence key.
    const sourceIdentityId = String(row?.sourceWorkId || row?.id || 'unknown-source');
    if (
      snapshot?.protocol !== 'retrieved-source-snapshot-sha256-v2' ||
      snapshot?.sourceId !== sourceIdentityId ||
      snapshot?.contentVerified !== true ||
      bytes.length !== Number(snapshot?.retrievedSnapshotBytes) ||
      sha256(bytes) !== snapshot?.retrievedSnapshotSha256
    ) {
      failures.push(`${sourceId}: snapshot bytes do not reproduce the declared receipt`);
      continue;
    }
    evidenceBundle.push({ sourceId, sourceIdentityId, snapshot, checks: receipt.checks || [] });
    let sourceClaims = 0;
    for (const check of Array.isArray(receipt?.checks) ? receipt.checks : []) {
      const start = Number(check?.quoteByteStart);
      const end = Number(check?.quoteByteEnd);
      const exactQuote = String(check?.quote ?? '');
      const exactClaim = String(check?.claim ?? '');
      const quote = cleanText(exactQuote);
      const claim = cleanText(exactClaim);
      const artifactPath = String(check?.renderedLocation || '');
      const artifact = zip.file(artifactPath);
      if (
        check?.sourceId !== sourceIdentityId ||
        !cleanText(check?.locator) ||
        check?.quoteInSnapshot !== true ||
        check?.entailed !== true ||
        check?.semanticSupport !== true ||
        check?.retrievedSnapshotSha256 !== snapshot.retrievedSnapshotSha256 ||
        Number(check?.retrievedSnapshotBytes) !== bytes.length ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > bytes.length ||
        bytes.subarray(start, end).toString('utf8') !== exactQuote ||
        sha256(Buffer.from(exactQuote, 'utf8')) !== check?.sourcePassageSha256 ||
        sha256(Buffer.from(exactClaim, 'utf8')) !== check?.claimSha256 ||
        !artifact
      ) {
        failures.push(`${sourceId}: ${check?.claimId || 'claim'} cannot be replayed`);
        continue;
      }
      const artifactBytes = Buffer.from(await artifact.async('uint8array'));
      let artifactDigest = artifactDigests.get(artifactPath);
      if (!artifactDigest) {
        artifactDigest = sha256(artifactBytes);
        artifactDigests.set(artifactPath, artifactDigest);
      }
      if (artifactDigest !== check?.renderedArtifactSha256) {
        failures.push(`${sourceId}: ${check?.claimId || 'claim'} artifact digest mismatch`);
        continue;
      }
      let visibleText = artifactVisibleText.get(artifactPath);
      try {
        if (visibleText === undefined) {
          visibleText = await extractOfficeVisibleText(artifactBytes, artifactPath);
          artifactVisibleText.set(artifactPath, visibleText);
        }
      } catch (error) {
        failures.push(`${sourceId}: ${check?.claimId || 'claim'} ${error.message}`);
        continue;
      }
      const exactClaimIdentity = normalized(claim) === normalized(quote);
      const curatedParaphraseAdmission =
        check?.semanticAdmission?.admitted === true &&
        check?.semanticAdmission?.policy === 'shipped-source-curated-anchor-v1' &&
        receipt?.sourceIdentityVerified === true &&
        receipt?.semanticAdmissionVerified === true &&
        receipt?.artifactVisibilityVerified === true &&
        snapshot?.sourceIdentityVerified === true &&
        snapshot?.semanticAdmissionVerified === true &&
        check?.sourceIdentityVerified === true &&
        check?.semanticAdmissionVerified === true &&
        check?.artifactVisibilityVerified === true;
      if ((!exactClaimIdentity && !curatedParaphraseAdmission) || !textContains(visibleText, claim)) {
        failures.push(
          `${sourceId}: ${check?.claimId || 'claim'} claim is neither the quoted text nor an explicitly admitted curated paraphrase visible in its artifact`,
        );
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
    if (!expectedCourseContractSha256 || courseContractSha256 !== expectedCourseContractSha256) {
      failures.push('course contract does not match the caller-supplied immutable root');
    }
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
      const instructionArtifacts = Array.isArray(row?.instructionArtifacts) ? row.instructionArtifacts : [];
      const paths = [row?.taskArtifact, row?.rubricArtifact, ...instructionArtifacts];
      const declaredCheckIds = Array.isArray(row?.checks) ? row.checks.map((entry) => entry?.id) : [];
      if (
        !row ||
        cleanText(row?.assessmentId) !== cleanText(expected?.assessmentId) ||
        cleanText(row?.title) !== cleanText(expected?.assessmentTitle) ||
        Number(row?.totalChecks) !== ASSESSMENT_CHECK_IDS.length ||
        Number(row?.passedChecks) !== ASSESSMENT_CHECK_IDS.length ||
        row?.passed !== true ||
        JSON.stringify(declaredCheckIds) !== JSON.stringify(ASSESSMENT_CHECK_IDS) ||
        row.checks.some((entry) => entry?.passed !== true) ||
        instructionArtifacts.length === 0 ||
        paths.some((entry) => !entry?.path || !entry?.sha256)
      ) {
        failures.push(`course contract assessment ${lessonNumber} is missing its six-check artifact chain`);
        continue;
      }
      let validArtifacts = true;
      const texts = [];
      for (const entry of paths) {
        const artifact = zip.file(entry.path);
        if (!artifact) {
          validArtifacts = false;
          break;
        }
        const artifactBytes = Buffer.from(await artifact.async('uint8array'));
        let digest = artifactDigests.get(entry.path);
        if (!digest) {
          digest = sha256(artifactBytes);
          artifactDigests.set(entry.path, digest);
        }
        if (digest !== entry.sha256) validArtifacts = false;
        try {
          let text = artifactVisibleText.get(entry.path);
          if (text === undefined) {
            text = await extractOfficeVisibleText(artifactBytes, entry.path);
            artifactVisibleText.set(entry.path, text);
          }
          texts.push(text);
        } catch {
          validArtifacts = false;
        }
      }
      if (!validArtifacts) {
        failures.push(`course contract assessment ${lessonNumber} artifact digest mismatch`);
        continue;
      }
      const [taskText, rubricText, ...instructionTexts] = texts;
      const objectives = (Array.isArray(expected?.objectives) ? expected.objectives : [])
        .map(cleanText)
        .filter(Boolean);
      const replayedChecks = [
        assessmentIdentityVisible(expected, taskText),
        objectives.length > 0 && objectives.every((objective) => objectiveTaskMapping(objective, taskText).passed),
        visibleStudentEvidence(taskText),
        assessmentIdentityVisible(expected, rubricText),
        visibleRubricCriteria(rubricText),
        objectives.length > 0 &&
          objectives.every((objective) =>
            instructionTexts.some((text) => objectiveTaskMapping(objective, text).passed),
          ),
      ];
      if (replayedChecks.some((passed) => !passed)) {
        failures.push(`course contract assessment ${lessonNumber} fails independent visible-text replay`);
        continue;
      }
      verifiedAssessmentObligations += 1;
    }
  }

  if (verifiedSources === 0 || verifiedClaims === 0) failures.push('no replayable claim-bound source evidence found');
  const evidenceBundleSha256 = sha256(Buffer.from(JSON.stringify(evidenceBundle), 'utf8'));
  const scoreLedger = manifest?.quality?.readiness?.ledger;
  const scoreLedgerSha256 = scoreLedger ? sha256(Buffer.from(canonicalJson(scoreLedger), 'utf8')) : null;
  const readinessScore = Number(manifest?.quality?.readiness?.score);
  const graderVersion = cleanText(manifest?.quality?.graderVersion);
  if (releaseAttestation) {
    const expected = [
      ['package SHA-256', packageSha256, releaseAttestation.packageSha256],
      ['course-contract SHA-256', courseContractSha256, releaseAttestation.courseContractSha256],
      ['evidence-bundle SHA-256', evidenceBundleSha256, releaseAttestation.evidenceBundleSha256],
      ['score-ledger SHA-256', scoreLedgerSha256, releaseAttestation.scoreLedgerSha256],
      ['verified source count', verifiedSources, releaseAttestation.verifiedSources],
      ['verified claim count', verifiedClaims, releaseAttestation.verifiedClaims],
      ['verified artifact count', artifactDigests.size, releaseAttestation.verifiedArtifacts],
      [
        'verified assessment obligation count',
        verifiedAssessmentObligations,
        releaseAttestation.verifiedAssessmentObligations,
      ],
      ['readiness score', readinessScore, releaseAttestation.readinessScore],
      ['grader version', graderVersion, releaseAttestation.graderVersion],
    ];
    for (const [label, actual, declared] of expected) {
      if (actual === null || actual === undefined || String(actual) !== String(declared ?? '')) {
        failures.push(`${label} does not match the release attestation`);
      }
    }
  }
  return {
    protocol: 'coursemapper-package-evidence-replay-v2',
    status: failures.length === 0 ? 'pass' : 'fail',
    packageSha256,
    verifiedSources,
    verifiedClaims,
    verifiedArtifacts: artifactDigests.size,
    evidenceBundleSha256,
    scoreLedgerSha256,
    readinessScore,
    graderVersion,
    ...(courseContractSha256 ? { courseContractSha256, verifiedAssessmentObligations } : {}),
    ...(releaseAttestationSha256 ? { releaseAttestationSha256 } : {}),
    failures,
  };
}

async function main() {
  const zipPath = process.argv[2];
  const contractPath = process.argv[3];
  const attestationPath = process.argv[4];
  const expectedReleaseAttestationSha256 = process.argv[5];
  const expectedCourseContractSha256 = process.argv[6];
  if (
    !zipPath ||
    !contractPath ||
    !attestationPath ||
    !expectedReleaseAttestationSha256 ||
    !expectedCourseContractSha256
  )
    throw new Error(
      'Usage: npm run audit:package-evidence -- /path/to/package.zip /path/to/course-contract.json /path/to/release-attestation.json expected-attestation-sha256 expected-contract-sha256',
    );
  const result = await verifyPackageEvidenceZipBytes(await fs.readFile(path.resolve(zipPath)), {
    courseContractBytes: await fs.readFile(path.resolve(contractPath)),
    releaseAttestationBytes: await fs.readFile(path.resolve(attestationPath)),
    expectedReleaseAttestationSha256,
    expectedCourseContractSha256,
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
