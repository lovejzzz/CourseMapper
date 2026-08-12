import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import JSZip from 'jszip';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveVerifiedCoherentDraftRunEvidence,
  verifyAuthenticEvidenceIntegrity,
} from '../lib/verifiedCoherentDraftEvidenceV1.mjs';
import { capturePackageAccessibilityAuditV1 } from '../lib/accessibilityAuditV1.mjs';
import { capturePackageRenderAuditV1, captureRenderAuditV1 } from '../lib/renderAuditV1.mjs';
import { extractOfficeVisibleText } from '../../src/lib/exportRenderedTextAudit.js';

const policy = JSON.parse(
  await fs.readFile(path.resolve('evaluation/output-quality/verified-coherent-draft-v1.policy.json'), 'utf8'),
);
const qualityRubric = JSON.parse(
  await fs.readFile(path.resolve('evaluation/quality-benchmark/v1/rubric.json'), 'utf8'),
);
const roots = [];

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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function fixtureRun() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verified-draft-evidence-'));
  roots.push(root);
  const claim = 'The reviewed answer remains bounded to the supplied evidence.';
  const docx = new JSZip();
  docx.file(
    'word/document.xml',
    `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${claim}</w:t></w:r></w:p></w:body></w:document>`,
  );
  docx.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>Page footer</w:t></w:r></w:p></w:ftr>');
  const docxBytes = Buffer.from(await docx.generateAsync({ type: 'uint8array' }));
  const pptx = new JSZip();
  pptx.file(
    'ppt/slides/slide1.xml',
    '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title" descr="Slide title"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Lesson orientation</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
  );
  const pptxBytes = Buffer.from(await pptx.generateAsync({ type: 'uint8array' }));
  const xlsx = new JSZip();
  xlsx.file(
    'xl/workbook.xml',
    '<workbook><sheets><sheet name="Course Map" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  xlsx.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  xlsx.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetViews><sheetView><pane ySplit="1" state="frozen"/></sheetView></sheetViews><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Lesson</t></is></c><c r="B1" t="inlineStr"><is><t>Objective</t></is></c></row></sheetData></worksheet>',
  );
  const xlsxBytes = Buffer.from(await xlsx.generateAsync({ type: 'uint8array' }));
  const artifactSha256 = sha256(docxBytes);
  const packageZip = new JSZip();
  const familyPaths = {
    syllabus: 'Syllabus/Course Syllabus.docx',
    lessonPlans: 'Lesson Plans/Lesson 01.docx',
    slideDecks: 'Slide Decks/Lesson 01.pptx',
    assignments: 'Assignment Briefs/Lesson 01.docx',
    rubrics: 'Rubrics/Lesson 01.docx',
    discussions: 'Discussion Prompts/Lesson 01.docx',
    quizBank: 'Quiz & Exam Bank/Lesson 01.docx',
    studyGuides: 'Study Guides/Lesson 01.docx',
    courseFaq: 'Course FAQ/Lesson 01.docx',
  };
  for (const artifactPath of Object.values(familyPaths)) {
    packageZip.file(artifactPath, artifactPath.endsWith('.pptx') ? pptxBytes : docxBytes);
  }
  packageZip.file('Course Map/Course Map.xlsx', xlsxBytes);
  const snapshotBytes = Buffer.from(claim, 'utf8');
  const fixtureInstructionalInstanceId = '6'.repeat(64);
  const inventoryItems = policy.perRun.verifyAllClaimCategories.flatMap((category) =>
    [0, 1].map((ordinal) => ({
      id: `${category}-${ordinal + 1}`,
      category,
      lessonNumber: 1,
      instructionalInstanceId: fixtureInstructionalInstanceId,
      fieldPath: `fixture.${category}.${ordinal + 1}`,
      surface: claim,
      surfaceSha256: sha256(Buffer.from(claim)),
      origin: 'admitted-source-ledger',
      authority: 'verified-open-research',
      requiresSourcePassage: true,
      provenanceVerified: true,
      artifactVisibilityVerified: true,
      semanticEntailmentVerified: true,
      artifactPaths: [familyPaths.quizBank],
      sourceBindings: [
        {
          sourceLedgerId: 'fixture-source-1',
          sourceClaimId: 'fixture-source-claim-1',
          sourceLocator: 'fixture paragraph 1',
          sourcePassageSha256: sha256(snapshotBytes),
          sourceIdentityVerified: true,
          semanticEntailmentVerified: true,
          artifactVisibilityVerified: true,
          artifactPath: familyPaths.quizBank,
        },
      ],
      status: 'verified',
    })),
  );
  const renderedArtifacts = [];
  for (const artifactPath of Object.values(familyPaths)) {
    const bytes = artifactPath.endsWith('.pptx') ? pptxBytes : docxBytes;
    const format = path.extname(artifactPath).slice(1).toLowerCase();
    const visibleText = await extractOfficeVisibleText(bytes, format);
    renderedArtifacts.push({
      path: artifactPath,
      textSha256: sha256(Buffer.from(String(visibleText || ''), 'utf8')),
      textBytes: Buffer.byteLength(String(visibleText || ''), 'utf8'),
    });
  }
  renderedArtifacts.sort((left, right) => left.path.localeCompare(right.path));
  const semanticClaimInventory = {
    protocol: 'coursemapper-semantic-claim-inventory-v1',
    summary: {
      total: inventoryItems.length,
      verified: inventoryItems.length,
      reviewRequired: 0,
      sourceRequired: inventoryItems.length,
      sourceRequiredVerified: inventoryItems.length,
    },
    items: inventoryItems,
  };
  const planningPredecessor = {
    curriculumPlanSha256: '1'.repeat(64),
    evidenceNeedsSha256: '2'.repeat(64),
    evidenceSetSha256: '3'.repeat(64),
    groundedApprovalSha256: '4'.repeat(64),
    postEnrichmentReceiptSha256: '5'.repeat(64),
  };
  const requirementRoles = ['objective', 'modeled-example', 'learner-task', 'assessment-criterion', 'scoring-guidance'];
  const requirementCompletenessPayload = {
    protocol: 'coursemapper-instructional-requirement-completeness-v1',
    status: 'fulfilled',
    instanceCount: 1,
    requiredCount: requirementRoles.length,
    fulfilledRequiredCount: requirementRoles.length,
    syllabusCoverage: { status: 'complete', coveredLessonIds: ['lesson-1'], missingLessonIds: [] },
    instances: [
      {
        instructionalInstanceId: fixtureInstructionalInstanceId,
        lessonId: 'lesson-1',
        lessonNumber: 1,
        status: 'fulfilled',
        missingRequiredRoles: [],
        requirements: requirementRoles.map((role, index) => ({
          requirementId: String(index + 7)
            .repeat(64)
            .slice(0, 64),
          role,
          required: true,
          status: 'fulfilled',
          evidencePaths: [familyPaths.lessonPlans],
          evidenceSha256: 'e'.repeat(64),
        })),
      },
    ],
    blockers: [],
  };
  const instructionalRequirementCompleteness = {
    ...requirementCompletenessPayload,
    receiptSha256: sha256(Buffer.from(JSON.stringify(requirementCompletenessPayload), 'utf8')),
  };
  const admissionPayload = {
    protocol: 'coursemapper-post-draft-admission-v1',
    policy: 'all-visible-semantic-atoms-v1',
    status: 'admitted',
    promotionEligible: true,
    predecessor: planningPredecessor,
    draftSha256: sha256(Buffer.from(JSON.stringify(renderedArtifacts), 'utf8')),
    semanticClaimInventorySha256: sha256(Buffer.from(JSON.stringify(semanticClaimInventory), 'utf8')),
    instructionalRequirementCompleteness,
    renderedArtifactCount: renderedArtifacts.length,
    renderedArtifacts,
    plannedLessonCount: 1,
    sourceGroundedLessonCount: 1,
    semanticClaimCount: inventoryItems.length,
    verifiedSemanticClaimCount: inventoryItems.length,
    reviewRequiredSemanticClaimCount: 0,
    lessonAdmissions: [
      {
        lessonNumber: 1,
        instructionalInstanceId: fixtureInstructionalInstanceId,
        status: 'admitted',
        claimCount: inventoryItems.length,
        instanceBoundClaimCount: inventoryItems.length,
        missingRequiredRoles: [],
        verifiedClaimCount: inventoryItems.length,
        sourceRequiredClaimCount: inventoryItems.length,
        sourceRequiredVerifiedCount: inventoryItems.length,
      },
    ],
    blockers: [],
  };
  const postDraftAdmission = {
    ...admissionPayload,
    receiptSha256: sha256(Buffer.from(JSON.stringify(admissionPayload), 'utf8')),
  };
  const instructionalPlanLineage = {
    protocol: 'coursemapper-linked-instructional-plan-receipts-v3',
    status: 'admitted',
    prospectivePlanEvidence: true,
    draftIntegrityEligible: true,
    promotionEligible: true,
    ...planningPredecessor,
    draftSha256: postDraftAdmission.draftSha256,
    semanticClaimInventorySha256: postDraftAdmission.semanticClaimInventorySha256,
    admissionSha256: postDraftAdmission.receiptSha256,
  };
  const auditClaims = [
    claim,
    'A bounded claim states only what the inspected evidence supports.',
    'A limitation records where the inspected evidence stops supporting transfer.',
  ].map((text, index) => {
    const queryPayload = {
      protocol: 'scion-instance-query-v1',
      instructionalInstanceId: fixtureInstructionalInstanceId,
      normalizedQuestion: 'Fixture evidence lesson',
      allowedCoverageNodes: ['Fixture evidence'],
      retrievalPolicyVersion: 'scion-evidence-admission-v2',
    };
    const queryId = sha256(Buffer.from(JSON.stringify(canonicalize(queryPayload)), 'utf8'));
    const candidatePayload = {
      protocol: 'scion-instance-candidate-v1',
      queryId,
      sourceSnapshots: [sha256(snapshotBytes)],
      locators: [`fixture paragraph ${index + 1}`],
      passageSha256: sha256(Buffer.from(text, 'utf8')),
    };
    const candidateId = sha256(Buffer.from(JSON.stringify(canonicalize(candidatePayload)), 'utf8'));
    return {
      id: `claim-${candidateId.slice(0, 24)}`,
      text,
      sourceIds: ['fixture-source-1'],
      instructionalInstanceId: fixtureInstructionalInstanceId,
      queryId,
      candidateId,
      queryReceipt: { ...queryPayload, queryId },
      candidateReceipt: { ...candidatePayload, candidateId },
    };
  });
  const instructionalEvidenceAuditPayload = {
    protocol: 'coursemapper-instructional-evidence-audit-v1',
    sourceContractReceiptSha256: planningPredecessor.evidenceSetSha256,
    predecessor: {
      curriculumPlanSha256: planningPredecessor.curriculumPlanSha256,
      evidenceNeedsSha256: planningPredecessor.evidenceNeedsSha256,
    },
    lessonCount: 1,
    lessons: [
      {
        lessonId: 'lesson-1',
        instructionalInstanceId: fixtureInstructionalInstanceId,
        planBodySha256: '7'.repeat(64),
        authorityReceiptSha256: '8'.repeat(64),
        admissionPolicyVersion: 'scion-evidence-admission-v2',
        atomAdmission: {
          protocol: 'scion-evidence-atom-admission-v1',
          admittedAtomCount: auditClaims.length,
          rejectedAtomCount: 0,
          rejectedAtoms: [],
        },
        sources: [
          {
            id: 'fixture-source-1',
            title: 'Fixture evidence source',
            url: 'https://example.edu/fixture-evidence',
            sourceSnapshotSha256: sha256(snapshotBytes),
          },
        ],
        claims: auditClaims,
      },
    ],
  };
  const instructionalEvidenceAudit = {
    ...instructionalEvidenceAuditPayload,
    receiptSha256: sha256(Buffer.from(JSON.stringify(instructionalEvidenceAuditPayload), 'utf8')),
  };
  const packageManifestBytes = Buffer.from(
    JSON.stringify({
      quality: {
        score: 94,
        dimensions: { format: 100 },
        findingCounts: { p0: 0, p1: 0, p2: 0 },
      },
      sourceLedger: [
        {
          id: 'fixture-source-1',
          provider: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Evidence',
          license: 'CC BY-SA 4.0',
          supportReceipt: {
            status: 'passed',
            sourceIdentityVerified: true,
            semanticAdmissionVerified: true,
            artifactVisibilityVerified: true,
            semanticSupport: true,
            readinessEligible: true,
            sourceSnapshot: {
              protocol: 'retrieved-source-snapshot-sha256-v2',
              sourceId: 'fixture-source-1',
              contentVerified: true,
              normalizedSnapshotText: claim,
              retrievedSnapshotBytes: snapshotBytes.length,
              retrievedSnapshotSha256: sha256(snapshotBytes),
            },
            checks: [
              {
                claimId: 'fixture-source-claim-1',
                sourceId: 'fixture-source-1',
                locator: 'fixture paragraph 1',
                quote: claim,
                claim,
                quoteByteStart: 0,
                quoteByteEnd: snapshotBytes.length,
                quoteInSnapshot: true,
                entailed: true,
                sourceIdentityVerified: true,
                semanticAdmissionVerified: true,
                artifactVisibilityVerified: true,
                semanticSupport: true,
                retrievedSnapshotBytes: snapshotBytes.length,
                retrievedSnapshotSha256: sha256(snapshotBytes),
                sourcePassageSha256: sha256(snapshotBytes),
                claimSha256: sha256(snapshotBytes),
                renderedLocation: familyPaths.quizBank,
                renderedArtifactSha256: artifactSha256,
              },
            ],
          },
        },
      ],
      lessons: [{ lessonNumber: 1, title: 'Fixture lesson' }],
      assessmentCoherence: {
        protocol: 'rendered-assessment-coherence-v5',
        eligibleAssessments: 1,
        passedAssessments: 1,
        passedChecks: 6,
        totalChecks: 6,
        coherenceRatio: 1,
        instructionArtifactMapping: {
          objectiveCount: 1,
          fullyMappedObjectives: 1,
          passedMappings: 3,
          totalMappings: 3,
          coverage: 1,
        },
      },
      semanticClaimInventory,
      postDraftAdmission,
      instructionalPlanLineage,
      instructionalEvidenceAudit,
    }),
  );
  packageZip.file('PACKAGE_MANIFEST.json', packageManifestBytes);
  const packageManifestSha256 = sha256(packageManifestBytes);
  const packageBytes = Buffer.from(await packageZip.generateAsync({ type: 'uint8array' }));
  const packagePath = path.join(root, 'package.zip');
  await fs.writeFile(packagePath, packageBytes);
  const packageSha256 = sha256(packageBytes);

  const accessibilityAuditPath = path.join(root, 'accessibility-audit.json');
  await writeJson(
    accessibilityAuditPath,
    await capturePackageAccessibilityAuditV1({
      packageBytes,
      packagePath,
      capturedAt: '2026-08-05T00:00:00.000Z',
    }),
  );

  const records = inventoryItems.map((item) => ({
    id: `review-${item.id}`,
    inventoryId: item.id,
    category: item.category,
    claim,
    claimSha256: sha256(Buffer.from(claim)),
    visibleAnchor: claim,
    visibleAnchorSha256: sha256(Buffer.from(claim)),
    artifactPath: familyPaths.quizBank,
    artifactSha256,
    status: 'verified',
    decision: 'supported',
    reviewer: 'fixture-forward',
    rationale:
      'The reviewed answer remains bounded to the supplied evidence because the artifact statement and exact source passage express the same limited proposition without adding a broader causal or universal claim.',
    artifactObservation:
      'The unique visible artifact anchor states that the reviewed answer remains bounded to the supplied evidence.',
    sourceObservation:
      'The exact source snapshot states the same bounded-evidence proposition without a conflicting qualification.',
    contradictionCheck:
      'No negation, changed quantity, stronger scope, or incompatible qualification appears between source and artifact.',
    sourceLedgerId: 'fixture-source-1',
    sourceClaimId: 'fixture-source-claim-1',
    sourceLocator: 'fixture paragraph 1',
    sourcePassageSha256: sha256(snapshotBytes),
  }));
  const claimReviewPath = path.join(root, 'claim-review.json');
  await writeJson(claimReviewPath, {
    protocol: 'coursemapper-independent-claim-review-v2',
    packageSha256,
    review: {
      method: 'independent-claim-level-semantic-review-v2',
      evidenceClass: 'model-judge',
      reviewedAt: '2026-08-06T12:30:00.000Z',
      evaluator: {
        id: 'fixture-forward',
        model: 'fixture-claim-judge',
        modelRevision: 'fixture-claim-judge-1',
        promptSha256: 'c'.repeat(64),
        independent: true,
        conflictOfInterest: false,
      },
    },
    records,
    stratifiedFactualClaimIds: records.map((record) => record.id),
  });
  const claimReviewReceiptSha256 = sha256(await fs.readFile(claimReviewPath));
  const runId = 'fixture-run';
  const campaignId = 'fixture-campaign';
  const sourcePath = path.join(root, 'source.json');
  const sourceBytes = Buffer.from('source.json');
  await fs.writeFile(sourcePath, sourceBytes);
  const policyPath = path.resolve('evaluation/output-quality/verified-coherent-draft-v1.policy.json');
  const rubricPath = path.resolve('evaluation/quality-benchmark/v1/rubric.json');
  const policyBytes = await fs.readFile(policyPath);
  const rubricBytes = await fs.readFile(rubricPath);
  const sessionId = 'fixture-roundtable-session';
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyBytes = publicKey.export({ format: 'der', type: 'spki' });
  const bridgeFingerprintSha256 = sha256(publicKeyBytes);
  const reviewConfiguration = {
    projectPath: root,
    topic: 'Fixture review of exact package bytes.',
    attachments: [
      {
        name: 'package.zip',
        mediaType: 'application/zip',
        size: packageBytes.length,
        path: '.roundtable-attachments/1-package.zip',
        sha256: packageSha256,
        expandedPath: '.roundtable-attachments-expanded/1-package',
      },
    ],
    attachmentManifestId: 'sha256:' + 'b'.repeat(64),
    rounds: 6,
    codexModel: 'fixture-judge',
    claudeModel: 'fixture-claude',
    antigravityModel: 'fixture-antigravity',
    fableModel: 'fixture-fable',
    codexEffort: 'high',
    claudeEffort: 'high',
    antigravityEffort: 'high',
    fableEffort: 'high',
    fableFinalAudit: true,
    keepHistory: false,
    reviewDissent: false,
  };
  const reviewConfigurationSha256 = sha256(Buffer.from(JSON.stringify(reviewConfiguration), 'utf8'));
  const configurationPath = path.join(root, 'configuration.json');
  await writeJson(configurationPath, {
    schemaVersion: 1,
    protocol: 'roundtable-review-preregistration-v1',
    preregisteredAt: '2026-08-06T12:00:00.000Z',
    bridgeAttestation: {
      protocol: 'roundtable-message-attestation-v1',
      algorithm: 'Ed25519',
      publicKeySpkiBase64: publicKeyBytes.toString('base64'),
      publicKeyFingerprintSha256: bridgeFingerprintSha256,
    },
    participantAvailability: { codex: true, claude: true, antigravity: true, fable: true },
    reviewConfiguration,
    reviewConfigurationSha256,
  });
  const configurationBytes = await fs.readFile(configurationPath);
  const campaignPreregistrationPath = path.join(root, 'campaign-preregistration.json');
  await writeJson(campaignPreregistrationPath, {
    schemaVersion: 1,
    campaignId,
    frozenAt: '2026-08-06T10:00:00.000Z',
    policySha256: sha256(policyBytes),
    runs: [{ id: runId }],
  });
  const campaignPreregistrationBytes = await fs.readFile(campaignPreregistrationPath);
  const makeQualityReview = (order, index) => ({
    schemaVersion: 2,
    rubricVersion: qualityRubric.rubricVersion,
    caseId: campaignId,
    artifactId: runId,
    artifactType: 'package',
    sourceSha256: sha256(sourceBytes),
    artifactSha256: packageSha256,
    reviewedAt: `2026-08-06T13:00:0${index}.000Z`,
    evaluator: {
      id: `fixture-judge-${order}`,
      evidenceClass: 'model-judge',
      qualified: false,
      independent: true,
      conflictOfInterest: false,
      domainMatch: false,
      currentTeachingRole: '',
      model: `fixture-judge-${order}`,
      modelRevision: 'fixture-judge-1',
      promptSha256: 'd'.repeat(64),
    },
    ratings: Object.fromEntries(
      qualityRubric.dimensions.flatMap((dimension) =>
        dimension.criteria.map((criterion) => [
          criterion.id,
          {
            state: 'scored',
            score: 3,
            confidence: 'high',
            interpolationRationale: `The inspected evidence exceeds anchor 2 for ${criterion.id} but does not fully satisfy anchor 4.`,
            evidence: [
              {
                artifact: 'PACKAGE_MANIFEST.json',
                artifactSha256: packageManifestSha256,
                location: `${criterion.id} cross-family package sample`,
                observation: `The exact package bytes provide concrete anchored evidence for ${criterion.id}.`,
              },
            ],
          },
        ]),
      ),
    ),
    criticalFailures: [],
    overall: {
      wouldUse: true,
      editVerdict: 'minor-edits',
      estimatedEditMinutes: 30,
      notes: `${order} order fixture review.`,
    },
  });
  const qualityReviews = ['forward', 'reverse'].map(makeQualityReview);
  const signMessage = (message) => {
    const payload = {
      protocol: 'roundtable-message-attestation-v1',
      sessionId,
      messageId: message.id,
      author: message.author,
      role: message.role,
      body: message.body,
      at: message.at,
      round: message.round,
      model: message.model,
      effort: message.effort,
      stage: message.stage,
    };
    const material = Buffer.from(JSON.stringify(payload), 'utf8');
    return {
      ...message,
      bridgeAttestation: {
        protocol: 'roundtable-message-attestation-v1',
        algorithm: 'Ed25519',
        sessionId,
        publicKeySpkiBase64: publicKeyBytes.toString('base64'),
        publicKeyFingerprintSha256: bridgeFingerprintSha256,
        payloadSha256: sha256(material),
        signatureBase64: crypto.sign(null, material, privateKey).toString('base64'),
      },
    };
  };
  const messages = [];
  for (let round = 1; round <= 6; round += 1) {
    for (const role of ['codex', 'claude', 'antigravity']) {
      const isForwardReview = round === 1 && role === 'codex';
      const isReverseReview = round === 6 && role === 'antigravity';
      const review = isForwardReview ? qualityReviews[0] : isReverseReview ? qualityReviews[1] : null;
      const order = isForwardReview ? 'forward' : isReverseReview ? 'reverse' : '';
      messages.push(
        signMessage({
          id: review ? `fixture-message-${order}` : `fixture-message-${role}-${round}`,
          author: review ? `fixture-${order}` : `fixture-${role}`,
          role,
          body: review
            ? `${order} package review evidence${
                isForwardReview
                  ? `\n<claim-review-receipt-sha256>${claimReviewReceiptSha256}</claim-review-receipt-sha256>`
                  : ''
              }\n<quality-review-v2>${JSON.stringify(review)}</quality-review-v2>`
            : `${role} discussion evidence for round ${round}.`,
          at: `2026-08-07T00:${String(round).padStart(2, '0')}:0${role === 'codex' ? 0 : role === 'claude' ? 1 : 2}Z`,
          round,
          model:
            role === 'antigravity'
              ? reviewConfiguration.antigravityModel
              : role === 'claude'
                ? reviewConfiguration.claudeModel
                : reviewConfiguration.codexModel,
          effort: 'high',
          stage: round === 1 ? 'sealed' : 'cross-examination',
        }),
      );
    }
  }
  messages.push(
    signMessage({
      id: 'fixture-message-fable-final',
      author: 'Fable 5',
      role: 'fable',
      body: 'Final boss audit approves this fixture checkpoint.',
      at: '2026-08-07T00:06:03Z',
      round: 6,
      model: reviewConfiguration.fableModel,
      effort: 'high',
      stage: 'boss-audit',
    }),
  );
  const reviewMessages = {
    forward: messages.find((message) => message.id === 'fixture-message-forward'),
    reverse: messages.find((message) => message.id === 'fixture-message-reverse'),
  };
  const roundtableSessionPath = path.join(root, 'roundtable-session.json');
  await writeJson(roundtableSessionPath, {
    id: sessionId,
    createdAt: '2026-08-06T12:01:00.000Z',
    reviewConfigurationSha256,
    phase: 'complete',
    discussionTurns: 18,
    completedTurns: 19,
    totalTurns: 19,
    fableFinalAudit: true,
    antigravityModel: reviewConfiguration.antigravityModel,
    fableModel: reviewConfiguration.fableModel,
    outcome: {
      status: 'available',
      decision: 'PASS — fixture earns the checkpoint.',
      consensus: true,
      provisional: false,
    },
    messages,
  });
  const transcriptSha256 = sha256(Buffer.from(JSON.stringify(messages), 'utf8'));
  const benchmarkReviewPath = path.join(root, 'benchmark-review.json');
  const dimensions = Object.fromEntries(qualityRubric.dimensions.map((dimension) => [dimension.id, 75]));
  await writeJson(benchmarkReviewPath, {
    protocol: 'coursemapper-quality-benchmark-review-v1',
    packageSha256,
    rubricVersion: '1.0.0',
    rubricSha256: sha256(rubricBytes),
    bindings: {
      campaignId,
      campaignPreregistrationSha256: sha256(campaignPreregistrationBytes),
      policySha256: sha256(policyBytes),
      roundtablePreregistrationSha256: sha256(configurationBytes),
      reviewConfigurationSha256,
      bridgeFingerprintSha256,
    },
    evidenceTier: 'model-provisional',
    reportedScore: 75,
    coverage: 1,
    coveragePolicy: { protocol: 'nested-dimension-weighted-applicable-coverage-v1' },
    dimensions,
    dimensionReasons: Object.fromEntries(
      Object.entries(dimensions).map(([dimensionId, score]) => [
        dimensionId,
        {
          score,
          reason: `The fixture assigns ${score} because the bound package evidence supports the dimension while retaining a visible provisional-review boundary.`,
          evidence: [
            {
              artifact: 'PACKAGE_MANIFEST.json',
              artifactSha256: packageManifestSha256,
              observation: `The exact package bytes were reviewed for ${dimensionId}.`,
            },
          ],
        },
      ]),
    ),
    criticalFailures: [],
    reviews: ['forward', 'reverse'].map((order, index) => ({
      order,
      reviewer: `fixture-${order}`,
      sessionId,
      transcriptSha256,
      messageId: reviewMessages[order].id,
      qualityReview: qualityReviews[index],
    })),
  });
  const renderAuditPath = path.join(root, 'render-audit.json');
  const packageDirectory = path.join(root, 'package-extract');
  const receiptDirectory = path.join(root, 'render-receipts');
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.mkdir(receiptDirectory, { recursive: true });
  const officeArtifacts = [
    ...Object.entries(familyPaths).map(([id, artifactPath]) => ({
      id,
      artifactPath,
      bytes: artifactPath.endsWith('.pptx') ? pptxBytes : docxBytes,
    })),
    { id: 'course-map', artifactPath: 'Course Map/Course Map.xlsx', bytes: xlsxBytes },
  ];
  for (const [index, artifact] of officeArtifacts.entries()) {
    const sourcePath = path.join(packageDirectory, artifact.artifactPath);
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, artifact.bytes);
    const kind = path.extname(artifact.artifactPath).slice(1).toLowerCase();
    const renderDirectory = path.join(root, 'rendered', `${index + 1}-${artifact.id}`);
    await fs.mkdir(renderDirectory, { recursive: true });
    const itemId = kind === 'pptx' ? 'slide-1' : 'page-1';
    const rasterName = kind === 'pptx' ? 'slide-1.png' : 'page-1.png';
    await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } })
      .composite([
        {
          input: Buffer.from(
            '<svg width="800" height="1000"><rect x="80" y="100" width="640" height="700" fill="#111827"/></svg>',
          ),
        },
      ])
      .png()
      .toFile(path.join(renderDirectory, rasterName));
    const child = await captureRenderAuditV1({
      root,
      sourcePath,
      renderDirectory,
      kind,
      inspection: {
        status: 'complete',
        reviewerId: 'fixture-render-reviewer',
        reviewedAt: '2026-08-06T12:00:00.000Z',
        reviewedItemIds: [itemId],
      },
      renderer: { id: 'fixture-renderer', version: '1.0.0' },
      replay: { command: 'fixture-render', environment: 'fixture' },
      capturedAt: '2026-08-06T12:00:00.000Z',
    });
    await writeJson(path.join(receiptDirectory, `${index + 1}-${artifact.id}.json`), child);
  }
  await writeJson(
    renderAuditPath,
    await capturePackageRenderAuditV1({
      root,
      packagePath,
      packageDirectory,
      receiptDirectory,
      capturedAt: '2026-08-06T12:00:00.000Z',
    }),
  );
  const rebuiltProjectPath = path.join(root, 'rebuilt.coursemapper');
  await writeJson(rebuiltProjectPath, {
    courseMap: { courseName: 'Fixture course' },
    courseGraph: {
      sessions: [],
      instructionalPlanLineage: {
        protocol: 'coursemapper-linked-instructional-plan-receipts-v2',
        status: 'draft-authorized',
        promotionEligible: false,
        ...planningPredecessor,
      },
    },
    blueprint: { lessons: [] },
    deliverables: {},
    selectedFeatures: ['courseMap', ...policy.perRun.requiredArtifactFamilies],
    compilationReceipt: {
      protocol: 'coursemapper-saved-state-export-join-v1',
      packageSha256,
      sourceProjectSha256: sha256(sourceBytes),
    },
  });
  const rebuiltProject = JSON.parse(await fs.readFile(rebuiltProjectPath, 'utf8'));
  rebuiltProject.compilationReceipt.compilationStateSha256 = sha256(
    Buffer.from(
      JSON.stringify(
        canonicalize({
          blueprint: rebuiltProject.blueprint,
          courseGraph: rebuiltProject.courseGraph,
          courseMap: rebuiltProject.courseMap,
          deliverables: rebuiltProject.deliverables,
          selectedFeatures: rebuiltProject.selectedFeatures,
        }),
      ),
    ),
  );
  await writeJson(rebuiltProjectPath, rebuiltProject);
  for (const fileName of ['generator.txt']) {
    await fs.writeFile(path.join(root, fileName), fileName);
  }
  return {
    id: runId,
    disciplineClass: 'text-language',
    lessonScope: 1,
    inputCondition: 'prompt-only',
    evidenceInputs: {
      package: packagePath,
      source: sourcePath,
      configuration: configurationPath,
      generator: path.join(root, 'generator.txt'),
      policy: policyPath,
      campaignPreregistration: campaignPreregistrationPath,
      qualityBenchmarkRubric: rubricPath,
      renderAudit: renderAuditPath,
      renderAuditRoot: root,
      accessibilityAudit: accessibilityAuditPath,
      claimReview: claimReviewPath,
      benchmarkReview: benchmarkReviewPath,
      roundtableSession: roundtableSessionPath,
      rebuiltProject: rebuiltProjectPath,
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Verified Coherent Draft derived evidence', () => {
  it('recomputes authentic payload hashes and rejects altered or reflexive Office evidence', async () => {
    const canonicalForm = 'Au aa soli-a a=niu vei ira.';
    const rawExample = {
      id: 'fijian-fusion',
      language: 'Boumaa Fijian',
      form: canonicalForm,
      gloss: '1SG PST give-TR ART=coconut to 3PL',
      translation: 'I gave the coconut to them.',
      analysisFocus: 'Morphological identification of the cited formative.',
      sourceId: 'fixture-source',
      sourceLocator: 'example 1',
      communityContext: 'Do not generalize one clause to all Fijian morphology.',
      comparisonRelation: null,
    };
    const stablePayload = JSON.stringify(rawExample);
    const boundExample = {
      id: rawExample.id,
      language: rawExample.language,
      displayLabel: 'Boumaa Fijian fusion example',
      form: rawExample.form,
      gloss: rawExample.gloss,
      translation: rawExample.translation,
      analysisFocus: rawExample.analysisFocus,
      sourceId: rawExample.sourceId,
      sourceLocator: rawExample.sourceLocator,
      communityContext: rawExample.communityContext,
      payloadSha256: sha256(Buffer.from(stablePayload)),
    };
    const taskBinding = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      examples: [boundExample],
      payloadSha256: sha256(Buffer.from(JSON.stringify([boundExample]))),
    };
    const manifest = {
      authenticLanguageDataCoverage: {
        protocol: 'coursemapper-authentic-language-data-coverage-v1',
        lessons: [{ lessonNumber: 1, admitted: true, taskBinding }],
      },
    };
    const packageWithVisibleText = async (visibleText) => {
      const office = new JSZip();
      office.file(
        'word/document.xml',
        `<w:document><w:body><w:p><w:r><w:t>${visibleText}</w:t></w:r></w:p></w:body></w:document>`,
      );
      const officeBytes = Buffer.from(await office.generateAsync({ type: 'uint8array' }));
      const packageZip = new JSZip();
      packageZip.file('Quiz & Exam Bank/Lesson 01.docx', officeBytes);
      return packageZip;
    };

    const valid = await verifyAuthenticEvidenceIntegrity(
      await packageWithVisibleText(`Boumaa Fijian fusion example: “${canonicalForm}”`),
      manifest,
    );
    expect(valid).toMatchObject({ status: 'passed', checkedExampleCount: 1, checkedPresentationCount: 1 });

    const alteredForm = 'Au aa soli-a=niu vei ira.';
    const invalid = await verifyAuthenticEvidenceIntegrity(
      await packageWithVisibleText(
        `Comparison: Boumaa Fijian fusion example “${alteredForm}” versus Boumaa Fijian fusion example “${alteredForm}”. ` +
          `Boumaa Fijian fusion example: “${alteredForm}”`,
      ),
      manifest,
    );
    expect(invalid.status).toBe('failed');

    const punctuationDrift = await verifyAuthenticEvidenceIntegrity(
      await packageWithVisibleText('Boumaa Fijian fusion example: “Au aa soli-a a=niu vei ira”'),
      manifest,
    );
    expect(punctuationDrift).toMatchObject({ status: 'failed' });
    expect(punctuationDrift.issues).toEqual(
      expect.arrayContaining([expect.stringContaining('changed its source-bound form')]),
    );
    expect(invalid.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reflexive comparison'),
        expect.stringContaining('changed its source-bound form'),
        expect.stringContaining('no exact reader-visible form presentation'),
      ]),
    );
  });

  it('derives family, ZIP, claim-review, benchmark, and saved-state bindings from bytes', async () => {
    const derived = await deriveVerifiedCoherentDraftRunEvidence(await fixtureRun(), policy);
    expect(derived.promotionEvidence).toMatchObject({
      protocol: 'coursemapper-verified-coherent-draft-derived-evidence-v1',
      derivationIssues: [],
    });
    expect(derived.artifactFamilies).toHaveLength(9);
    expect(derived.artifactFamilies.every((family) => family.openable && family.fileCount === 1)).toBe(true);
    expect(derived.claimVerification.stratifiedFactualClaims).toEqual({ total: 10, verified: 10 });
    expect(derived.claimVerification.artifactFamilies).toMatchObject({
      quizBank: { total: 10, verified: 10 },
      syllabus: { total: 0, verified: 0 },
      discussions: { total: 0, verified: 0 },
    });
    expect(derived.sourceReplay).toMatchObject({ status: 'pass', verifiedSources: 1, verifiedClaims: 1 });
    expect(derived.hashBindings.map((binding) => binding.type)).toEqual(
      expect.arrayContaining([
        'zip',
        'rendered-outputs',
        'rebuilt-project',
        'accessibility-audit',
        'claim-verification',
        'quality-benchmark',
      ]),
    );
  });

  it('rejects a rehashed package audit when an evidence atom no longer reproduces its candidate receipt', async () => {
    const run = await fixtureRun();
    const packageZip = await JSZip.loadAsync(await fs.readFile(run.evidenceInputs.package));
    const manifest = JSON.parse(await packageZip.file('PACKAGE_MANIFEST.json').async('string'));
    manifest.instructionalEvidenceAudit.lessons[0].claims[0].text =
      'This replacement claim was never admitted by the hash-bound source candidate.';
    const auditPayload = { ...manifest.instructionalEvidenceAudit };
    delete auditPayload.receiptSha256;
    manifest.instructionalEvidenceAudit.receiptSha256 = sha256(Buffer.from(JSON.stringify(auditPayload), 'utf8'));
    packageZip.file('PACKAGE_MANIFEST.json', JSON.stringify(manifest));
    await fs.writeFile(run.evidenceInputs.package, Buffer.from(await packageZip.generateAsync({ type: 'uint8array' })));

    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain('lesson-1 has a non-replayable candidate receipt');
  });

  it('rejects a package when even one declared assessment or instruction family is unmapped', async () => {
    const run = await fixtureRun();
    const packageZip = await JSZip.loadAsync(await fs.readFile(run.evidenceInputs.package));
    const manifest = JSON.parse(await packageZip.file('PACKAGE_MANIFEST.json').async('string'));
    manifest.assessmentCoherence.eligibleAssessments = 8;
    manifest.assessmentCoherence.passedAssessments = 7;
    manifest.assessmentCoherence.instructionArtifactMapping = {
      passedMappings: 14,
      totalMappings: 42,
      coverage: 0.333,
    };
    packageZip.file('PACKAGE_MANIFEST.json', JSON.stringify(manifest));
    await fs.writeFile(run.evidenceInputs.package, Buffer.from(await packageZip.generateAsync({ type: 'uint8array' })));

    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toEqual(
      expect.arrayContaining([
        'package assessment coherence is incomplete',
        'instruction-artifact objective mapping coverage 0.333 is below the required 0.900',
      ]),
    );
  });

  it('fails closed when preregistered visual-analysis lessons omit the functional audit input', async () => {
    const run = await fixtureRun();
    run.disciplineClass = 'visual';
    run.visualAnalysisRequiredLessons = [1];
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.functionalVisuals).toMatchObject({
      passed: false,
      requiredLessons: 1,
      requiredLessonNumbers: [1],
    });
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'preregistered visual-analysis lessons lack a functional visual audit receipt',
    );
  });

  it('does not treat an unexplained zero-claim category as verified', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.claimReview, 'utf8'));
    receipt.records = receipt.records.filter((record) => record.category !== 'rationales');
    receipt.stratifiedFactualClaimIds = receipt.records.map((record) => record.id);
    await writeJson(run.evidenceInputs.claimReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining('rationales')]),
    );
    expect(derived.claimVerification.rationales.applicabilityStatus).toBe('unresolved');
  });

  it('rejects repeated review templates spanning distinct claims', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.claimReview, 'utf8'));
    receipt.records.slice(0, 4).forEach((record, index) => {
      record.claim = `Distinct reviewed proposition number ${index + 1} remains deliberately unsupported.`;
      record.claimSha256 = sha256(Buffer.from(record.claim));
    });
    await writeJson(run.evidenceInputs.claimReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining('repeated rationale template spanning distinct claims')]),
    );
  });

  it('requires a score-specific reason and hash-bound evidence for every benchmark dimension', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.benchmarkReview, 'utf8'));
    delete receipt.dimensionReasons['inclusion-accessibility'];
    await writeJson(run.evidenceInputs.benchmarkReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'benchmark dimension inclusion-accessibility lacks a score-specific evidence rationale',
    );
  });

  it('recomputes the artifact hash named by every benchmark dimension rationale', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.benchmarkReview, 'utf8'));
    receipt.dimensionReasons['professional-craft'].evidence[0].artifactSha256 = '0'.repeat(64);
    await writeJson(run.evidenceInputs.benchmarkReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'benchmark dimension professional-craft rationale does not bind an exact package artifact',
    );
  });

  it('rejects whole-package evidence when an exact internal entry is required', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.benchmarkReview, 'utf8'));
    receipt.reviews[0].qualityReview.ratings.IA1.evidence[0] = {
      artifact: 'package.zip',
      artifactSha256: run.packageSha256,
      location: 'claimed internal location',
      observation: 'A whole-ZIP hash cannot prove that the claimed internal artifact exists.',
    };
    await writeJson(run.evidenceInputs.benchmarkReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'forward IA1: evidence does not bind an exact package artifact (package.zip)',
    );
  });

  it('rejects a reported benchmark profile that does not reproduce from rubric-bound reviews', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.benchmarkReview, 'utf8'));
    receipt.coverage = 0.96;
    await writeJson(run.evidenceInputs.benchmarkReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);

    expect(derived.promotionEvidence.derivationIssues).toContain(
      'reported benchmark profile does not reproduce from the two rubric-bound reviews',
    );
  });

  it('rejects a consumer-shaped configuration mock instead of an authentic Roundtable preregistration', async () => {
    const run = await fixtureRun();
    const authentic = JSON.parse(await fs.readFile(run.evidenceInputs.configuration, 'utf8'));
    await writeJson(run.evidenceInputs.configuration, {
      review: { bridgeFingerprintSha256: authentic.bridgeAttestation.publicKeyFingerprintSha256 },
    });
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);

    expect(derived.promotionEvidence.derivationIssues).toEqual(
      expect.arrayContaining([
        'configuration is not an authentic Roundtable pre-room preregistration receipt',
        'Roundtable preregistration bridge attestation is missing or invalid',
        'Roundtable preregistration review configuration hash does not reproduce',
      ]),
    );
  });

  it('rejects a complete six-round transcript whose final consensus says FIX', async () => {
    const run = await fixtureRun();
    const session = JSON.parse(await fs.readFile(run.evidenceInputs.roundtableSession, 'utf8'));
    session.outcome.decision = 'FIX — the package does not earn the checkpoint.';
    await writeJson(run.evidenceInputs.roundtableSession, session);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'Roundtable final outcome does not positively and non-provisionally approve the checkpoint',
    );
  });

  it('rejects saved-state drift even when the receipt protocol label remains present', async () => {
    const run = await fixtureRun();
    const rebuilt = JSON.parse(await fs.readFile(run.evidenceInputs.rebuiltProject, 'utf8'));
    rebuilt.courseMap.courseName = 'Drifted after export';
    await writeJson(run.evidenceInputs.rebuiltProject, rebuilt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'rebuilt project compilation-state digest does not reproduce',
    );
  });

  it('rejects a rebuilt project whose source-project receipt names different bytes', async () => {
    const run = await fixtureRun();
    await fs.writeFile(run.evidenceInputs.source, 'changed source project bytes');
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toContain(
      'rebuilt project is not joined to the exact source project',
    );
  });

  it('rejects a generic substring even when it occurs inside a valid visible anchor', async () => {
    const run = await fixtureRun();
    const receipt = JSON.parse(await fs.readFile(run.evidenceInputs.claimReview, 'utf8'));
    receipt.records[0].claim = 'reviewed';
    receipt.records[0].claimSha256 = sha256(Buffer.from('reviewed'));
    await writeJson(run.evidenceInputs.claimReview, receipt);
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).toEqual(
      expect.arrayContaining([expect.stringContaining('incomplete or invalid claim-review record')]),
    );
  });

  it('accepts the immutable Roundtable capture envelope as well as a legacy bare session', async () => {
    const run = await fixtureRun();
    const session = JSON.parse(await fs.readFile(run.evidenceInputs.roundtableSession, 'utf8'));
    await writeJson(run.evidenceInputs.roundtableSession, {
      protocol: 'roundtable-session-capture-v1',
      capturedAt: '2026-08-06T00:00:00.000Z',
      session,
    });
    const derived = await deriveVerifiedCoherentDraftRunEvidence(run, policy);
    expect(derived.promotionEvidence.derivationIssues).not.toEqual(
      expect.arrayContaining([
        'Roundtable session evidence is malformed',
        'forward benchmark review is not bound to the supplied Roundtable transcript',
        'reverse benchmark review is not bound to the supplied Roundtable transcript',
      ]),
    );
  });
});
