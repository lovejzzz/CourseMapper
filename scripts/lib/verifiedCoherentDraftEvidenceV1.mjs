import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import JSZip from 'jszip';

import { extractOfficeVisibleText } from '../../src/lib/exportRenderedTextAudit.js';
import { verifyPackageAccessibilityAuditV1 } from './accessibilityAuditV1.mjs';
import { verifyFunctionalVisualAuditV1 } from './functionalVisualAuditV1.mjs';
import { aggregateQualityReviews, flattenRubric, validateQualityReview, validateRubric } from './qualityBenchmark.mjs';
import { verifyPackageRenderAuditV1 } from './renderAuditV1.mjs';
import { verifyPackageEvidenceZipBytes } from '../verifyPackageEvidence.mjs';

export const VERIFIED_COHERENT_DRAFT_EVIDENCE_PROTOCOL = 'coursemapper-verified-coherent-draft-derived-evidence-v1';
export const CLAIM_VERIFICATION_REVIEW_PROTOCOL = 'coursemapper-independent-claim-review-v2';
export const QUALITY_BENCHMARK_REVIEW_PROTOCOL = 'coursemapper-quality-benchmark-review-v1';

const HASH_RE = /^[a-f0-9]{64}$/;
const FAMILY_PREFIXES = Object.freeze({
  syllabus: 'Syllabus/',
  lessonPlans: 'Lesson Plans/',
  slideDecks: 'Slide Decks/',
  assignments: 'Assignment Briefs/',
  rubrics: 'Rubrics/',
  discussions: 'Discussion Prompts/',
  quizBank: 'Quiz & Exam Bank/',
  studyGuides: 'Study Guides/',
  courseFaq: 'Course FAQ/',
});

function familyIdForArtifactPath(value) {
  const artifactPath = String(value || '').replace(/\\/g, '/');
  return Object.entries(FAMILY_PREFIXES).find(([, prefix]) => artifactPath.startsWith(prefix))?.[0] || 'other';
}

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

function canonicalSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
}

async function fileBinding(type, filePath) {
  const bytes = await fs.readFile(path.resolve(filePath));
  return { type, path: path.resolve(filePath), bytes: bytes.length, sha256: sha256(bytes) };
}

async function renderEvidenceBundle(receipt, root = process.cwd()) {
  const childReceiptPaths = (Array.isArray(receipt?.artifacts) ? receipt.artifacts : [])
    .map((artifact) => String(artifact?.receiptFile?.path || ''))
    .filter(Boolean)
    .sort();
  const childReceipts = await Promise.all(
    childReceiptPaths.map(async (receiptPath) => ({
      path: receiptPath,
      receipt: await readJson(path.resolve(root, receiptPath)),
    })),
  );
  const rasterPaths = [
    ...new Set(
      childReceipts.flatMap(({ receipt: child }) =>
        (Array.isArray(child?.items) ? child.items : []).map((item) => String(item?.file?.path || '')).filter(Boolean),
      ),
    ),
  ].sort();
  const files = await Promise.all([
    ...childReceiptPaths.map((filePath) => fileBinding('render-child-receipt', path.resolve(root, filePath))),
    ...rasterPaths.map((filePath) => fileBinding('rendered-raster', path.resolve(root, filePath))),
  ]);
  return {
    protocol: 'coursemapper-render-evidence-bundle-v1',
    childReceiptCount: childReceiptPaths.length,
    renderedRasterCount: rasterPaths.length,
    files,
    sha256: canonicalSha256(files),
  };
}

async function artifactFamilies(zip, requiredFamilyIds) {
  const families = [];
  for (const id of requiredFamilyIds) {
    const prefix = FAMILY_PREFIXES[id];
    const files = [];
    for (const entryPath of Object.keys(zip.files).sort()) {
      const entry = zip.files[entryPath];
      if (!prefix || entry.dir || !entryPath.startsWith(prefix)) continue;
      const bytes = Buffer.from(await entry.async('uint8array'));
      files.push({ path: entryPath, bytes: bytes.length, sha256: sha256(bytes) });
    }
    families.push({
      id,
      openable: files.length > 0 && files.every((file) => /\.(?:docx|pptx)$/i.test(file.path)),
      fileCount: files.length,
      sha256: files.length > 0 ? canonicalSha256(files) : '',
      files,
    });
  }
  return families;
}

function verifyInstructionalEvidenceAudit(manifest, policy) {
  const issues = [];
  const audit = manifest?.instructionalEvidenceAudit;
  if (audit?.protocol !== policy?.perRun?.instructionalEvidenceAuditProtocol) {
    return { passed: false, lessonCount: 0, claimCount: 0, issues: ['missing instructional evidence audit'] };
  }
  const { receiptSha256, ...payload } = audit;
  if (
    !HASH_RE.test(String(receiptSha256 || '')) ||
    sha256(Buffer.from(JSON.stringify(payload), 'utf8')) !== receiptSha256
  ) {
    issues.push('instructional evidence audit receipt hash does not reproduce');
  }
  const lessons = Array.isArray(audit?.lessons) ? audit.lessons : [];
  const admittedByLesson = new Map(
    (manifest?.postDraftAdmission?.lessonAdmissions || []).map((lesson) => [
      `lesson-${Number(lesson?.lessonNumber) || 0}`,
      lesson,
    ]),
  );
  if (Number(audit?.lessonCount) !== lessons.length || lessons.length !== admittedByLesson.size) {
    issues.push('instructional evidence audit lesson count is incomplete');
  }
  let claimCount = 0;
  for (const lesson of lessons) {
    const lessonId = String(lesson?.lessonId || '');
    const instanceId = String(lesson?.instructionalInstanceId || '');
    const admittedLesson = admittedByLesson.get(lessonId);
    if (
      !HASH_RE.test(instanceId) ||
      admittedLesson?.instructionalInstanceId !== instanceId ||
      !HASH_RE.test(String(lesson?.planBodySha256 || '')) ||
      !HASH_RE.test(String(lesson?.authorityReceiptSha256 || ''))
    ) {
      issues.push(`${lessonId || 'unknown lesson'} has an invalid instructional authority binding`);
    }
    const sources = Array.isArray(lesson?.sources) ? lesson.sources : [];
    const sourceIds = new Set(sources.map((source) => String(source?.id || '')).filter(Boolean));
    if (sources.length === 0 || sources.some((source) => !HASH_RE.test(String(source?.sourceSnapshotSha256 || '')))) {
      issues.push(`${lessonId || 'unknown lesson'} has an incomplete source-snapshot binding`);
    }
    const claims = Array.isArray(lesson?.claims) ? lesson.claims : [];
    claimCount += claims.length;
    if (claims.length < 3) issues.push(`${lessonId || 'unknown lesson'} has fewer than three admitted evidence atoms`);
    if (
      lesson?.atomAdmission?.protocol !== policy?.perRun?.evidenceAtomAdmissionProtocol ||
      Number(lesson?.atomAdmission?.admittedAtomCount) !== claims.length
    ) {
      issues.push(`${lessonId || 'unknown lesson'} has an invalid atom-admission receipt`);
    }
    for (const claim of claims) {
      const queryReceipt = claim?.queryReceipt;
      const candidateReceipt = claim?.candidateReceipt;
      const { queryId: receiptQueryId, ...queryPayload } = queryReceipt || {};
      const { candidateId: receiptCandidateId, ...candidatePayload } = candidateReceipt || {};
      if (
        !HASH_RE.test(String(claim?.queryId || '')) ||
        claim?.queryId !== receiptQueryId ||
        canonicalSha256(queryPayload) !== claim?.queryId ||
        queryReceipt?.instructionalInstanceId !== instanceId
      ) {
        issues.push(`${lessonId || 'unknown lesson'} has a non-replayable query receipt`);
      }
      if (
        !HASH_RE.test(String(claim?.candidateId || '')) ||
        claim?.candidateId !== receiptCandidateId ||
        canonicalSha256(candidatePayload) !== claim?.candidateId ||
        candidateReceipt?.queryId !== claim?.queryId ||
        candidateReceipt?.passageSha256 !== sha256(Buffer.from(String(claim?.text || '').trim(), 'utf8'))
      ) {
        issues.push(`${lessonId || 'unknown lesson'} has a non-replayable candidate receipt`);
      }
      if (
        claim?.instructionalInstanceId !== instanceId ||
        !Array.isArray(claim?.sourceIds) ||
        claim.sourceIds.length === 0 ||
        claim.sourceIds.some((sourceId) => !sourceIds.has(String(sourceId)))
      ) {
        issues.push(`${lessonId || 'unknown lesson'} has an evidence atom outside its lesson/source boundary`);
      }
    }
  }
  return { passed: issues.length === 0, lessonCount: lessons.length, claimCount, issues: [...new Set(issues)] };
}

async function verifyPostDraftAdmission(zip, manifest, policy) {
  const issues = [];
  const instructionalEvidenceAudit = verifyInstructionalEvidenceAudit(manifest, policy);
  issues.push(...instructionalEvidenceAudit.issues);
  const admission = manifest?.postDraftAdmission;
  const lineage = manifest?.instructionalPlanLineage;
  const orderedLessonContract = manifest?.generationConstraints?.orderedLessonContract;
  if (orderedLessonContract?.mode === 'governing-source-ordered-subset') {
    if (
      !['complete', 'continuous-subset'].includes(orderedLessonContract?.coverageStatus) ||
      orderedLessonContract?.continuity?.status !== 'continuous'
    ) {
      issues.push('governing-source lesson sequence has incomplete scope or discontinuous coverage');
    }
  }
  if (admission?.protocol !== policy?.perRun?.postDraftAdmissionProtocol) {
    issues.push('package manifest has no supported post-draft admission receipt');
  }
  if (lineage?.protocol !== policy?.perRun?.instructionalPlanLineageProtocol) {
    issues.push('package manifest has no finalized instructional lineage');
  }
  if (!admission || !lineage) {
    return {
      protocol: admission?.protocol || '',
      passed: false,
      promotionEligible: false,
      receiptSha256: String(admission?.receiptSha256 || ''),
      sourceGroundedLessonCount: Number(admission?.sourceGroundedLessonCount) || 0,
      issues,
    };
  }
  const { receiptSha256, ...payload } = admission;
  if (
    !HASH_RE.test(String(receiptSha256 || '')) ||
    sha256(Buffer.from(JSON.stringify(payload), 'utf8')) !== receiptSha256
  ) {
    issues.push('post-draft admission receipt hash does not reproduce');
  }
  if (
    admission.semanticClaimInventorySha256 !==
    sha256(Buffer.from(JSON.stringify(manifest?.semanticClaimInventory || null), 'utf8'))
  ) {
    issues.push('post-draft admission does not bind the exact semantic inventory');
  }
  const receiptArtifacts = Array.isArray(admission?.renderedArtifacts) ? admission.renderedArtifacts : [];
  const receiptPaths = receiptArtifacts
    .map((artifact) => String(artifact?.path || ''))
    .filter(Boolean)
    .sort();
  const officePaths = Object.keys(zip.files)
    .filter((entryPath) => !zip.files[entryPath]?.dir && /\.(?:docx|pptx)$/i.test(entryPath))
    .sort();
  if (canonicalSha256(receiptPaths) !== canonicalSha256(officePaths)) {
    issues.push('post-draft admission does not enumerate every Office artifact');
  }
  const rebuiltArtifacts = [];
  for (const artifact of receiptArtifacts) {
    const artifactPath = String(artifact?.path || '');
    const entry = zip.file(artifactPath);
    if (!entry || !/\.(?:docx|pptx)$/i.test(artifactPath)) {
      issues.push(`${artifactPath || 'unknown artifact'} is absent from the package`);
      continue;
    }
    const bytes = Buffer.from(await entry.async('uint8array'));
    const format = path.extname(artifactPath).slice(1).toLowerCase();
    const visibleText = await extractOfficeVisibleText(bytes, format);
    rebuiltArtifacts.push({
      path: artifactPath,
      textSha256: sha256(Buffer.from(String(visibleText || ''), 'utf8')),
      textBytes: Buffer.byteLength(String(visibleText || ''), 'utf8'),
    });
  }
  rebuiltArtifacts.sort((left, right) => left.path.localeCompare(right.path));
  if (admission.draftSha256 !== sha256(Buffer.from(JSON.stringify(rebuiltArtifacts), 'utf8'))) {
    issues.push('post-draft admission draft hash does not reproduce from Office-visible text');
  }
  if (Number(admission.renderedArtifactCount) !== rebuiltArtifacts.length) {
    issues.push('post-draft admission rendered-artifact count is inconsistent');
  }
  const requirementCompleteness = admission?.instructionalRequirementCompleteness;
  if (requirementCompleteness?.protocol !== policy?.perRun?.instructionalRequirementCompletenessProtocol) {
    issues.push('post-draft admission has no instructional requirement-completeness receipt');
  } else {
    const { receiptSha256: completenessReceiptSha256, ...completenessPayload } = requirementCompleteness;
    if (
      !HASH_RE.test(String(completenessReceiptSha256 || '')) ||
      sha256(Buffer.from(JSON.stringify(completenessPayload), 'utf8')) !== completenessReceiptSha256
    ) {
      issues.push('instructional requirement-completeness receipt hash does not reproduce');
    }
    if (
      requirementCompleteness.status !== 'fulfilled' ||
      Number(requirementCompleteness.requiredCount) !== Number(requirementCompleteness.fulfilledRequiredCount) ||
      requirementCompleteness?.syllabusCoverage?.status !== 'complete' ||
      (requirementCompleteness?.syllabusCoverage?.missingLessonIds || []).length > 0 ||
      (requirementCompleteness.instances || []).some(
        (instance) =>
          instance?.status !== 'fulfilled' ||
          (instance?.missingRequiredRoles || []).length > 0 ||
          (instance?.requirements || []).some(
            (requirement) => requirement?.required === true && requirement?.status !== 'fulfilled',
          ),
      )
    ) {
      issues.push('one or more instructional instances failed required-role completeness');
    }
  }
  const plannedLessonCount = Array.isArray(manifest?.lessons) ? manifest.lessons.length : 0;
  if (
    admission.status !== 'admitted' ||
    admission.promotionEligible !== true ||
    Number(admission.plannedLessonCount) !== plannedLessonCount ||
    Number(admission.sourceGroundedLessonCount) !== plannedLessonCount ||
    Number(admission.reviewRequiredSemanticClaimCount) !== 0 ||
    (admission.blockers || []).length > 0 ||
    (admission.lessonAdmissions || []).length !== plannedLessonCount ||
    (admission.lessonAdmissions || []).some(
      (lesson) =>
        lesson?.status !== 'admitted' ||
        Number(lesson?.claimCount) < 1 ||
        !HASH_RE.test(String(lesson?.instructionalInstanceId || '')) ||
        Number(lesson?.instanceBoundClaimCount) !== Number(lesson?.claimCount) ||
        (lesson?.missingRequiredRoles || []).length > 0 ||
        Number(lesson?.verifiedClaimCount) !== Number(lesson?.claimCount) ||
        Number(lesson?.sourceRequiredVerifiedCount) !== Number(lesson?.sourceRequiredClaimCount),
    )
  ) {
    issues.push('one or more planned lessons failed post-draft atomic admission');
  }
  if (
    lineage.status !== 'admitted' ||
    lineage.prospectivePlanEvidence !== true ||
    lineage.draftIntegrityEligible !== true ||
    lineage.promotionEligible !== true ||
    lineage.draftSha256 !== admission.draftSha256 ||
    lineage.semanticClaimInventorySha256 !== admission.semanticClaimInventorySha256 ||
    lineage.admissionSha256 !== admission.receiptSha256
  ) {
    issues.push('final instructional lineage does not bind the post-draft receipt');
  }
  for (const [field, value] of Object.entries(admission.predecessor || {})) {
    if (!HASH_RE.test(String(value || ''))) issues.push(`post-draft predecessor ${field} is not hash-bound`);
  }
  return {
    protocol: admission.protocol,
    passed: issues.length === 0,
    promotionEligible: issues.length === 0,
    receiptSha256: String(admission.receiptSha256 || ''),
    draftSha256: String(admission.draftSha256 || ''),
    semanticClaimInventorySha256: String(admission.semanticClaimInventorySha256 || ''),
    sourceGroundedLessonCount: Number(admission.sourceGroundedLessonCount) || 0,
    plannedLessonCount: Number(admission.plannedLessonCount) || 0,
    renderedArtifactCount: rebuiltArtifacts.length,
    instructionalEvidenceAudit,
    issues,
  };
}

function normalizedEvidenceText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableAuthenticExamplePayload(example = {}) {
  return JSON.stringify({
    id: String(example.id || ''),
    language: String(example.language || ''),
    form: String(example.form || ''),
    gloss: String(example.gloss || ''),
    translation: String(example.translation || ''),
    analysisFocus: String(example.analysisFocus || ''),
    sourceId: String(example.sourceId || ''),
    sourceLocator: String(example.sourceLocator || ''),
    communityContext: String(example.communityContext || ''),
    comparisonRelation:
      example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1'
        ? {
            protocol: 'coursemapper-authentic-evidence-relation-v1',
            relationId: String(example.comparisonRelation.relationId || ''),
            kind: String(example.comparisonRelation.kind || ''),
            operandLabels: (example.comparisonRelation.operandLabels || []).map(String),
            sharedFeature: String(example.comparisonRelation.sharedFeature || ''),
            discriminatingFeature: String(example.comparisonRelation.discriminatingFeature || ''),
          }
        : null,
  });
}

function rebuiltAuthenticBoundExample(example = {}) {
  return {
    id: String(example.id || ''),
    language: String(example.language || ''),
    displayLabel: String(example.displayLabel || ''),
    form: String(example.form || ''),
    gloss: String(example.gloss || ''),
    translation: String(example.translation || ''),
    analysisFocus: String(example.analysisFocus || ''),
    sourceId: String(example.sourceId || ''),
    sourceLocator: String(example.sourceLocator || ''),
    communityContext: String(example.communityContext || ''),
    ...(example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1'
      ? {
          comparisonRelation: {
            protocol: 'coursemapper-authentic-evidence-relation-v1',
            relationId: String(example.comparisonRelation.relationId || ''),
            kind: String(example.comparisonRelation.kind || ''),
            operandLabels: (example.comparisonRelation.operandLabels || []).map(String),
            sharedFeature: String(example.comparisonRelation.sharedFeature || ''),
            discriminatingFeature: String(example.comparisonRelation.discriminatingFeature || ''),
          },
        }
      : {}),
    payloadSha256: sha256(Buffer.from(stableAuthenticExamplePayload(example), 'utf8')),
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function verifyAuthenticEvidenceIntegrity(zip, manifest = null) {
  const coverage = manifest?.authenticLanguageDataCoverage;
  if (coverage?.protocol !== 'coursemapper-authentic-language-data-coverage-v1') {
    return {
      protocol: 'coursemapper-authentic-evidence-office-integrity-v1',
      status: 'not-applicable',
      checkedExampleCount: 0,
      checkedPresentationCount: 0,
      issues: [],
    };
  }

  const issues = [];
  const examplesById = new Map();
  for (const lesson of Array.isArray(coverage?.lessons) ? coverage.lessons : []) {
    const task = lesson?.taskBinding;
    if (lesson?.admitted !== true || task?.protocol !== 'coursemapper-authentic-evidence-task-binding-v1') continue;
    const rebuiltExamples = (Array.isArray(task?.examples) ? task.examples : []).map(rebuiltAuthenticBoundExample);
    for (const [index, example] of rebuiltExamples.entries()) {
      const original = task.examples[index];
      if (original?.payloadSha256 !== example.payloadSha256) {
        issues.push(
          `lesson ${lesson.lessonNumber} authentic example ${example.id || index + 1} has a stale or invalid payload digest`,
        );
      }
      const key = String(example.id || `${lesson.lessonNumber}:${index + 1}`);
      if (!examplesById.has(key)) examplesById.set(key, { ...example, lessonNumber: lesson.lessonNumber });
    }
    if (task?.payloadSha256 !== sha256(Buffer.from(JSON.stringify(rebuiltExamples), 'utf8'))) {
      issues.push(`lesson ${lesson.lessonNumber} authentic task payload digest does not reproduce`);
    }
  }

  const presentationCounts = new Map([...examplesById.keys()].map((id) => [id, 0]));
  const officeEntries = Object.values(zip?.files || {}).filter(
    (entry) => !entry?.dir && /\.(?:docx|pptx)$/i.test(String(entry?.name || '')),
  );
  for (const entry of officeEntries) {
    const bytes = Buffer.from(await entry.async('uint8array'));
    const format = path.extname(entry.name).slice(1).toLowerCase();
    const visible = normalizedEvidenceText(await extractOfficeVisibleText(bytes, format));
    const reflexivePattern =
      /Comparison:\s+[^\u201c"\n]{0,240}[\u201c"]([^\u201d"\n]+)[\u201d"]\s+versus\s+[^\u201c"\n]{0,240}[\u201c"]([^\u201d"\n]+)[\u201d"]/giu;
    for (const match of visible.matchAll(reflexivePattern)) {
      if (normalizedEvidenceText(match[1]).toLowerCase() === normalizedEvidenceText(match[2]).toLowerCase()) {
        issues.push(`${entry.name}: reflexive comparison presents the same evidence form on both sides`);
      }
    }
    for (const [id, example] of examplesById) {
      const label = normalizedEvidenceText(example.displayLabel);
      if (!label) continue;
      const pattern = new RegExp(`${escapeRegExp(label)}\\s*:\\s*[“"]([^”"\\n]+)[”"]`, 'giu');
      for (const match of visible.matchAll(pattern)) {
        const observed = normalizedEvidenceText(match[1]);
        const expected = normalizedEvidenceText(example.form);
        if (observed !== expected) {
          issues.push(`${entry.name}: ${label} changed its source-bound form from “${expected}” to “${observed}”`);
        } else {
          presentationCounts.set(id, (presentationCounts.get(id) || 0) + 1);
        }
      }
    }
  }

  for (const [id, example] of examplesById) {
    if ((presentationCounts.get(id) || 0) === 0) {
      issues.push(
        `lesson ${example.lessonNumber} authentic example ${id} has no exact reader-visible form presentation in Office artifacts`,
      );
    }
  }
  return {
    protocol: 'coursemapper-authentic-evidence-office-integrity-v1',
    status: issues.length === 0 ? 'passed' : 'failed',
    checkedExampleCount: examplesById.size,
    checkedPresentationCount: [...presentationCounts.values()].reduce((sum, count) => sum + count, 0),
    issues,
  };
}

async function verifyClaimReview({ receipt, receiptBytes, zip, packageSha256, policy }) {
  const issues = [];
  if (receipt?.protocol !== CLAIM_VERIFICATION_REVIEW_PROTOCOL) issues.push('unsupported claim-review protocol');
  if (receipt?.packageSha256 !== packageSha256) issues.push('claim review is not bound to the package ZIP');
  const records = Array.isArray(receipt?.records) ? receipt.records : [];
  const review = receipt?.review || {};
  const evaluator = review?.evaluator || {};
  const independentReviewValid = Boolean(
    review?.method === 'independent-claim-level-semantic-review-v2' &&
    review?.evidenceClass === 'model-judge' &&
    /^\d{4}-\d{2}-\d{2}T/.test(String(review?.reviewedAt || '')) &&
    String(evaluator?.id || '').trim() &&
    String(evaluator?.model || '').trim() &&
    String(evaluator?.modelRevision || '').trim() &&
    HASH_RE.test(String(evaluator?.promptSha256 || '')) &&
    evaluator?.independent === true &&
    evaluator?.conflictOfInterest === false,
  );
  if (!independentReviewValid) {
    issues.push('claim review has no valid independent model-judge identity and method');
  }
  const normalizedRationalePrefix = (record) =>
    `${record?.rationale || ''} ${record?.artifactObservation || ''} ${record?.sourceObservation || ''}`
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 12)
      .join(' ');
  const rationaleGroups = new Map();
  for (const record of records) {
    const prefix = normalizedRationalePrefix(record);
    if (!prefix) continue;
    const group = rationaleGroups.get(prefix) || { recordIds: [], claimHashes: new Set() };
    group.recordIds.push(String(record?.id || ''));
    group.claimHashes.add(String(record?.claimSha256 || ''));
    rationaleGroups.set(prefix, group);
  }
  const templatedRecordIds = new Set(
    [...rationaleGroups.values()].filter((group) => group.claimHashes.size >= 4).flatMap((group) => group.recordIds),
  );
  if (templatedRecordIds.size > 0) {
    issues.push(
      `claim review contains ${templatedRecordIds.size} records with a repeated rationale template spanning distinct claims`,
    );
  }
  const manifestEntry = zip.file('PACKAGE_MANIFEST.json');
  const manifest = manifestEntry ? JSON.parse(await manifestEntry.async('string')) : null;
  const inventory = manifest?.semanticClaimInventory;
  const inventoryItems = Array.isArray(inventory?.items) ? inventory.items : [];
  const inventoryById = new Map(inventoryItems.map((item) => [item?.id, item]));
  const sourceLedgerById = new Map((manifest?.sourceLedger || []).map((row) => [String(row?.id || ''), row]));
  if (policy?.perRun?.requireCompleteSemanticClaimInventory) {
    if (inventory?.protocol !== 'coursemapper-semantic-claim-inventory-v1') {
      issues.push('package manifest has no supported semantic claim inventory');
    }
    if (inventoryItems.length === 0) issues.push('semantic claim inventory is empty');
    const recordInventoryIds = records.map((record) => String(record?.inventoryId || ''));
    if (new Set(recordInventoryIds).size !== recordInventoryIds.length) {
      issues.push('claim review contains duplicate semantic inventory records');
    }
    const missingIds = inventoryItems
      .map((item) => String(item?.id || ''))
      .filter((id) => id && !recordInventoryIds.includes(id));
    const extraIds = recordInventoryIds.filter((id) => id && !inventoryById.has(id));
    if (missingIds.length > 0) issues.push(`claim review omits ${missingIds.length} semantic inventory item(s)`);
    if (extraIds.length > 0) issues.push(`claim review cites ${extraIds.length} unknown semantic inventory item(s)`);
  }
  const verifiedByCategory = new Map();
  const validInventoryIds = new Set();
  const validRecordIds = new Set();
  const visibleTextByPath = new Map();
  const structuredFeatureFamilies = {
    courseMap: 'Course Map',
    lessonPlans: 'Lesson Plans',
    slideDecks: 'Slide Decks',
    assignments: 'Assignment Briefs',
    rubrics: 'Rubrics',
    discussions: 'Discussion Prompts',
    quizBank: 'Quiz & Exam Bank',
    studyGuides: 'Study Guides',
    courseFaq: 'Course FAQ',
  };
  for (const record of records) {
    const category = String(record?.category || '');
    const artifactPath = String(record?.artifactPath || '');
    const claim = String(record?.claim || '').trim();
    const visibleAnchor = String(record?.visibleAnchor || '').trim();
    const artifact = zip.file(artifactPath);
    const inventoryItem = inventoryById.get(String(record?.inventoryId || ''));
    const inventoryLessonNumber = Number(inventoryItem?.lessonNumber);
    const artifactLessonNumber = Number(artifactPath.match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]);
    const featureId = String(inventoryItem?.fieldPath || '').match(/^deliverables\.([A-Za-z0-9_-]+)/)?.[1] || '';
    const expectedFamily = structuredFeatureFamilies[featureId] || '';
    const artifactFamily = artifactPath.split('/')[0] || '';
    const lessonArtifactJoinValid = Boolean(
      !Number.isInteger(inventoryLessonNumber) ||
      inventoryLessonNumber <= 0 ||
      !Number.isInteger(artifactLessonNumber) ||
      artifactLessonNumber <= 0 ||
      inventoryLessonNumber === artifactLessonNumber,
    );
    const artifactRoleJoinValid = !expectedFamily || expectedFamily === artifactFamily;
    if (
      !policy?.perRun?.verifyAllClaimCategories?.includes(category) ||
      !record?.id ||
      !inventoryItem ||
      inventoryItem?.category !== category ||
      String(inventoryItem?.surface || '').trim() !== claim ||
      inventoryItem?.surfaceSha256 !== record?.claimSha256 ||
      !['verified', 'structurally-verified', 'review-required'].includes(inventoryItem?.status) ||
      inventoryItem?.provenanceVerified !== true ||
      inventoryItem?.artifactVisibilityVerified !== true ||
      !Array.isArray(inventoryItem?.artifactPaths) ||
      !inventoryItem.artifactPaths.includes(artifactPath) ||
      !artifact ||
      !claim ||
      sha256(Buffer.from(claim, 'utf8')) !== record?.claimSha256 ||
      !visibleAnchor ||
      sha256(Buffer.from(visibleAnchor, 'utf8')) !== record?.visibleAnchorSha256 ||
      record?.status !== 'verified' ||
      record?.decision !== 'supported' ||
      String(record?.reviewer || '') !== String(evaluator?.id || '') ||
      String(record?.rationale || '').trim().length < 80 ||
      String(record?.artifactObservation || '').trim().length < 40 ||
      String(record?.sourceObservation || '').trim().length < 40 ||
      String(record?.contradictionCheck || '').trim().length < 40 ||
      templatedRecordIds.has(String(record?.id || '')) ||
      !independentReviewValid ||
      !lessonArtifactJoinValid ||
      !artifactRoleJoinValid
    ) {
      issues.push(`${record?.id || 'unknown-claim'}: incomplete or invalid claim-review record`);
      continue;
    }
    if (inventoryItem?.requiresSourcePassage === true) {
      const sourceLedgerId = String(record?.sourceLedgerId || '');
      const sourceClaimId = String(record?.sourceClaimId || '');
      const sourcePassageSha256 = String(record?.sourcePassageSha256 || '');
      const sourceLocator = String(record?.sourceLocator || '');
      const inventoryBinding = (inventoryItem?.sourceBindings || []).find(
        (binding) =>
          String(binding?.sourceLedgerId || '') === sourceLedgerId &&
          String(binding?.sourceClaimId || '') === sourceClaimId &&
          String(binding?.sourcePassageSha256 || '') === sourcePassageSha256 &&
          String(binding?.sourceLocator || '') === sourceLocator,
      );
      const sourceRow = sourceLedgerById.get(sourceLedgerId);
      const sourceCheck = (sourceRow?.supportReceipt?.checks || []).find(
        (check) =>
          String(check?.claimId || '') === sourceClaimId &&
          String(check?.sourcePassageSha256 || '') === sourcePassageSha256 &&
          String(check?.locator || '') === sourceLocator,
      );
      if (
        !inventoryBinding ||
        !sourceCheck ||
        inventoryItem?.provenanceVerified !== true ||
        inventoryItem?.semanticEntailmentVerified !== true ||
        sourceCheck?.sourceIdentityVerified !== true ||
        sourceCheck?.entailed !== true ||
        sourceCheck?.semanticAdmissionVerified !== true ||
        sourceCheck?.semanticSupport !== true ||
        sourceRow?.supportReceipt?.sourceIdentityVerified !== true ||
        sourceRow?.supportReceipt?.semanticAdmissionVerified !== true ||
        sourceRow?.supportReceipt?.semanticSupport !== true
      ) {
        issues.push(`${record.id}: semantic inventory item is not joined to an authoritative entailing source passage`);
        continue;
      }
    }
    const artifactBytes = Buffer.from(await artifact.async('uint8array'));
    if (sha256(artifactBytes) !== record?.artifactSha256) {
      issues.push(`${record.id}: artifact digest mismatch`);
      continue;
    }
    let visibleText = visibleTextByPath.get(artifactPath);
    if (visibleText === undefined) {
      const format = path.extname(artifactPath).slice(1).toLowerCase();
      visibleText = await extractOfficeVisibleText(artifactBytes, format);
      visibleTextByPath.set(artifactPath, visibleText);
    }
    const normalizedVisible = visibleText.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    const normalizedClaim = claim.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    const normalizedAnchor = visibleAnchor.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
    const claimTokenCount = normalizedClaim.split(/\s+/).filter(Boolean).length;
    const anchorTokenCount = normalizedAnchor.split(/\s+/).filter(Boolean).length;
    const countBoundedOccurrences = (haystack, needle) => {
      let count = 0;
      let offset = 0;
      while (needle && offset <= haystack.length - needle.length) {
        const index = haystack.indexOf(needle, offset);
        if (index < 0) break;
        const before = haystack[index - 1] || '';
        const after = haystack[index + needle.length] || '';
        if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) count += 1;
        offset = index + Math.max(1, needle.length);
      }
      return count;
    };
    if (
      (category === 'numericalResults' ? anchorTokenCount < 6 : claimTokenCount < 4) ||
      anchorTokenCount < 4 ||
      countBoundedOccurrences(normalizedAnchor, normalizedClaim) !== 1 ||
      countBoundedOccurrences(normalizedVisible, normalizedAnchor) !== 1
    ) {
      issues.push(`${record.id}: reviewed claim lacks one unique, token-bounded visible anchor in the artifact`);
      continue;
    }
    const list = verifiedByCategory.get(category) || [];
    list.push(record);
    verifiedByCategory.set(category, list);
    validInventoryIds.add(String(record.inventoryId));
    validRecordIds.add(String(record.id));
  }

  const nonApplicable = new Map(
    (Array.isArray(receipt?.nonApplicableCategories) ? receipt.nonApplicableCategories : []).map((entry) => [
      entry?.category,
      entry,
    ]),
  );
  const claimVerification = {};
  for (const category of policy?.perRun?.verifyAllClaimCategories || []) {
    const categoryRecords = verifiedByCategory.get(category) || [];
    const exclusion = nonApplicable.get(category);
    if (categoryRecords.length > 0) {
      claimVerification[category] = {
        applicabilityStatus: 'applicable',
        total: categoryRecords.length,
        verified: categoryRecords.length,
      };
      continue;
    }
    if (
      exclusion?.status === 'not-applicable' &&
      String(exclusion?.reviewer || '').trim() &&
      String(exclusion?.rationale || '').trim()
    ) {
      claimVerification[category] = {
        applicabilityStatus: 'reviewed-not-applicable',
        total: 0,
        verified: 0,
        reviewer: exclusion.reviewer,
        rationale: exclusion.rationale,
      };
    } else {
      issues.push(`${category}: neither verified records nor a reviewed non-applicability decision`);
      claimVerification[category] = { applicabilityStatus: 'unresolved', total: 0, verified: 0 };
    }
  }
  const stratifiedIds = [...new Set(receipt?.stratifiedFactualClaimIds || [])];
  const verifiedStratified = stratifiedIds.filter((id) => validRecordIds.has(id));
  claimVerification.stratifiedFactualClaims = {
    total: stratifiedIds.length,
    verified: verifiedStratified.length,
  };
  claimVerification.artifactFamilies = Object.fromEntries(
    [...Object.keys(FAMILY_PREFIXES), 'other'].map((familyId) => {
      const familyItems = inventoryItems.filter((item) => {
        const artifactPath = String(item?.artifactPath || item?.artifactPaths?.[0] || '');
        return familyIdForArtifactPath(artifactPath) === familyId;
      });
      return [
        familyId,
        {
          total: familyItems.length,
          verified: familyItems.filter((item) => validInventoryIds.has(String(item?.id || ''))).length,
        },
      ];
    }),
  );
  return {
    issues,
    claimVerification,
    receiptSha256: sha256(receiptBytes),
  };
}

function benchmarkReviewPayloadFromMessage(message) {
  const body = String(message?.body || '');
  const match = body.match(/<quality-review-v2>([\s\S]*?)<\/quality-review-v2>/u);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function benchmarkEvidenceHash(zip, artifact) {
  const normalized = String(artifact || '').replace(/\\/g, '/');
  if (!normalized || normalized === 'package.zip') return '';
  const entry = zip.file(normalized);
  if (!entry || entry.dir) return '';
  return sha256(Buffer.from(await entry.async('uint8array')));
}

function benchmarkDimensionMap(report) {
  return Object.fromEntries((report?.dimensions || []).map((dimension) => [dimension.id, dimension.score]));
}

function comparableCriticalFailure(failure = {}) {
  return {
    id: String(failure.id || ''),
    criterionId: String(failure.criterionId || ''),
    scoreCap: Number.isFinite(Number(failure.scoreCap)) ? Number(failure.scoreCap) : null,
    evidence: {
      artifact: String(failure?.evidence?.artifact || ''),
      location: String(failure?.evidence?.location || ''),
      observation: String(failure?.evidence?.observation || failure?.evidence?.quote || ''),
    },
  };
}

async function verifyBenchmarkReview({
  receipt,
  receiptBytes,
  packageSha256,
  sourceSha256,
  zip,
  policy,
  policyBytes,
  rubric,
  rubricBytes,
  campaignPreregistration,
  campaignPreregistrationBytes,
  configurationReceipt,
  configurationBytes,
  runId,
  runGeneratedAt,
}) {
  const issues = [];
  if (receipt?.protocol !== QUALITY_BENCHMARK_REVIEW_PROTOCOL) issues.push('unsupported benchmark-review protocol');
  if (receipt?.packageSha256 !== packageSha256) issues.push('benchmark review is not bound to the package ZIP');
  const rubricValidation = validateRubric(rubric);
  if (!rubricValidation.valid) {
    issues.push(`Quality Benchmark rubric is invalid: ${rubricValidation.issues.join('; ')}`);
  }
  const rubricSha256 = sha256(rubricBytes);
  const policySha256 = sha256(policyBytes);
  const campaignPreregistrationSha256 = sha256(campaignPreregistrationBytes);
  const roundtablePreregistrationSha256 = sha256(configurationBytes);
  const expectedRubricSha256 = String(policy?.perRun?.qualityBenchmarkRubricSha256 || '');
  const bindings = receipt?.bindings || {};
  if (rubricSha256 !== expectedRubricSha256 || receipt?.rubricSha256 !== rubricSha256) {
    issues.push('benchmark review is not bound to the exact frozen Quality Benchmark rubric bytes');
  }
  if (receipt?.rubricVersion !== rubric?.rubricVersion) {
    issues.push('benchmark review rubricVersion does not match the frozen rubric');
  }
  if (
    campaignPreregistration?.campaignId !== bindings?.campaignId ||
    campaignPreregistrationSha256 !== bindings?.campaignPreregistrationSha256
  ) {
    issues.push('benchmark review is not bound to the exact campaign preregistration');
  }
  if (!(campaignPreregistration?.runs || []).some((run) => run?.id === runId)) {
    issues.push('campaign preregistration does not declare this exact run');
  }
  if (campaignPreregistration?.policySha256 !== policySha256 || bindings?.policySha256 !== policySha256) {
    issues.push('benchmark review is not bound to the exact checkpoint policy bytes');
  }
  if (
    bindings?.roundtablePreregistrationSha256 !== roundtablePreregistrationSha256 ||
    bindings?.reviewConfigurationSha256 !== configurationReceipt?.reviewConfigurationSha256 ||
    bindings?.bridgeFingerprintSha256 !== configurationReceipt?.bridgeAttestation?.publicKeyFingerprintSha256
  ) {
    issues.push('benchmark review does not join the exact Roundtable preregistration and bridge identity');
  }
  const attachedPackage = (configurationReceipt?.reviewConfiguration?.attachments || []).some(
    (attachment) => attachment?.sha256 === packageSha256,
  );
  if (!attachedPackage) {
    issues.push('Roundtable preregistration does not bind the exact package ZIP as a review attachment');
  }
  const campaignFrozenAt = Date.parse(String(campaignPreregistration?.frozenAt || ''));
  const generatedAt = Date.parse(String(runGeneratedAt || ''));
  const reviewPreregisteredAt = Date.parse(String(configurationReceipt?.preregisteredAt || ''));
  if (
    Number.isFinite(campaignFrozenAt) &&
    Number.isFinite(generatedAt) &&
    Number.isFinite(reviewPreregisteredAt) &&
    !(campaignFrozenAt < generatedAt && generatedAt < reviewPreregisteredAt)
  ) {
    issues.push('campaign freeze, package generation, and Roundtable preregistration are out of order');
  }
  const reviews = Array.isArray(receipt?.reviews) ? receipt.reviews : [];
  const requiredCriterionCount = Number(policy?.perRun?.requiredQualityBenchmarkCriterionCount || 0);
  const requiredCoverageProtocol = String(policy?.perRun?.qualityBenchmarkCoverageProtocol || '');
  if (receipt?.coveragePolicy?.protocol !== requiredCoverageProtocol) {
    issues.push('benchmark review does not use the frozen evidence-coverage protocol');
  }
  const rubricCriteria = flattenRubric(rubric);
  if (rubricCriteria.length !== requiredCriterionCount) {
    issues.push(`frozen rubric must contain exactly ${requiredCriterionCount} criteria`);
  }
  const orders = new Set(reviews.map((review) => review?.order));
  if (reviews.length !== 2 || orders.size !== 2) {
    issues.push('benchmark receipt must contain exactly one forward and one reverse review');
  }
  const qualityReviews = [];
  for (const order of ['forward', 'reverse']) {
    const review = reviews.find((candidate) => candidate?.order === order);
    const qualityReview = review?.qualityReview;
    if (
      !review ||
      !String(review?.reviewer || '').trim() ||
      !String(review?.sessionId || '').trim() ||
      !HASH_RE.test(String(review?.transcriptSha256 || '')) ||
      !String(review?.messageId || '').trim()
    ) {
      issues.push(`${order} benchmark review is missing reviewer/session/transcript binding`);
      continue;
    }
    const validation = validateQualityReview(qualityReview, rubric);
    for (const problem of validation.issues) issues.push(`${order} benchmark review: ${problem}`);
    if (
      qualityReview?.artifactSha256 !== packageSha256 ||
      qualityReview?.sourceSha256 !== sourceSha256 ||
      qualityReview?.artifactType !== 'package' ||
      qualityReview?.artifactId !== runId ||
      qualityReview?.caseId !== campaignPreregistration?.campaignId
    ) {
      issues.push(`${order} benchmark review identity is not bound to the exact run source and package`);
    }
    if (qualityReview?.evaluator?.evidenceClass !== 'model-judge') {
      issues.push(`${order} benchmark review is not model-provisional evidence`);
    }
    for (const criterion of rubricCriteria) {
      const rating = qualityReview?.ratings?.[criterion.id];
      for (const evidence of rating?.evidence || []) {
        const observedSha256 = await benchmarkEvidenceHash(zip, evidence?.artifact);
        if (!observedSha256 || evidence?.artifactSha256 !== observedSha256) {
          issues.push(
            `${order} ${criterion.id}: evidence does not bind an exact package artifact (${evidence?.artifact || '<missing>'})`,
          );
        }
      }
    }
    for (const failure of qualityReview?.criticalFailures || []) {
      const observedSha256 = await benchmarkEvidenceHash(zip, failure?.evidence?.artifact);
      if (!observedSha256 || failure?.evidence?.artifactSha256 !== observedSha256) {
        issues.push(`${order} critical failure ${failure?.id || '<missing>'} has no exact artifact binding`);
      }
    }
    qualityReviews.push(qualityReview);
  }
  const aggregate = aggregateQualityReviews(qualityReviews, rubric, {
    benchmarkCase: {
      id: campaignPreregistration?.campaignId,
      artifactSha256: packageSha256,
      source: { sha256: sourceSha256, verified: false },
      exportVerified: true,
    },
    modelJudgeMode: 'independent-multi-model',
  });
  for (const problem of aggregate.reviewValidationIssues || []) {
    issues.push(`benchmark aggregation: ${problem}`);
  }
  const computedDimensions = benchmarkDimensionMap(aggregate);
  if (aggregate.validation?.tier !== 'model-provisional') {
    issues.push('benchmark aggregation did not produce model-provisional evidence');
  }
  if (aggregate.validation?.validReviewCount !== 2 || aggregate.validation?.selectedReviewCount !== 2) {
    issues.push('benchmark aggregation did not retain both order-isolated reviews');
  }
  if (!aggregate.validation?.modelPanelPass) {
    issues.push('benchmark review does not contain two independent, distinct model judges');
  }
  if (
    receipt?.evidenceTier !== aggregate.validation?.tier ||
    Number(receipt?.reportedScore) !== Number(aggregate.scores?.reportedScore) ||
    Math.abs(Number(receipt?.coverage) - Number(aggregate.scores?.coverage)) > 0.0005 ||
    canonicalSha256(receipt?.dimensions || {}) !== canonicalSha256(computedDimensions) ||
    canonicalSha256((receipt?.criticalFailures || []).map(comparableCriticalFailure)) !==
      canonicalSha256((aggregate?.criticalFailures || []).map(comparableCriticalFailure))
  ) {
    issues.push('reported benchmark profile does not reproduce from the two rubric-bound reviews');
  }
  for (const dimensionId of policy?.perRun?.requiredDimensions || []) {
    const score = Number(computedDimensions?.[dimensionId]);
    const reason = receipt?.dimensionReasons?.[dimensionId];
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      issues.push(`required benchmark dimension ${dimensionId} is missing or invalid`);
      continue;
    }
    if (
      Number(reason?.score) !== score ||
      String(reason?.reason || '').trim().length < 40 ||
      !Array.isArray(reason?.evidence) ||
      reason.evidence.length === 0 ||
      reason.evidence.some(
        (entry) =>
          !String(entry?.artifact || '').trim() ||
          !HASH_RE.test(String(entry?.artifactSha256 || '')) ||
          !String(entry?.observation || '').trim(),
      )
    ) {
      issues.push(`benchmark dimension ${dimensionId} lacks a score-specific evidence rationale`);
      continue;
    }
    for (const entry of reason.evidence) {
      const observedSha256 = await benchmarkEvidenceHash(zip, entry.artifact);
      if (!observedSha256 || entry.artifactSha256 !== observedSha256) {
        issues.push(`benchmark dimension ${dimensionId} rationale does not bind an exact package artifact`);
      }
    }
  }
  return {
    issues,
    qualityBenchmark: {
      rubricVersion: receipt?.rubricVersion,
      rubricSha256,
      evidenceTier: aggregate.validation?.tier,
      reportedScore: aggregate.scores?.reportedScore,
      uncappedProfileScore: aggregate.scores?.uncappedProfileScore,
      coverage: aggregate.scores?.coverage,
      criticalCoverage: aggregate.scores?.criticalCoverage,
      coveragePolicy: aggregate.scores?.coveragePolicy || {},
      criterionRatings: (aggregate?.dimensions || []).flatMap((dimension) => dimension.criteria || []),
      dimensions: computedDimensions,
      dimensionReasons: receipt?.dimensionReasons || {},
      reviewOrders: [...orders],
      criticalFailures: aggregate?.criticalFailures || [],
      validation: aggregate?.validation || {},
      reviews,
      receiptSha256: sha256(receiptBytes),
    },
  };
}

function roundtableAttestationPayload(message, sessionId) {
  return {
    protocol: 'roundtable-message-attestation-v1',
    sessionId,
    messageId: message?.id,
    author: message?.author,
    role: message?.role,
    body: message?.body,
    at: message?.at,
    round: message?.round ?? null,
    model: message?.model ?? null,
    effort: message?.effort ?? null,
    stage: message?.stage ?? null,
  };
}

function verifyRoundtableMessage(message, sessionId, expectedFingerprint) {
  const attestation = message?.bridgeAttestation;
  if (
    attestation?.protocol !== 'roundtable-message-attestation-v1' ||
    attestation?.algorithm !== 'Ed25519' ||
    attestation?.sessionId !== sessionId ||
    attestation?.publicKeyFingerprintSha256 !== expectedFingerprint
  ) {
    return false;
  }
  const material = Buffer.from(JSON.stringify(roundtableAttestationPayload(message, sessionId)), 'utf8');
  const publicKeyBytes = Buffer.from(String(attestation?.publicKeySpkiBase64 || ''), 'base64');
  if (sha256(material) !== attestation?.payloadSha256 || sha256(publicKeyBytes) !== expectedFingerprint) return false;
  try {
    const publicKey = crypto.createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
    return crypto.verify(null, material, publicKey, Buffer.from(String(attestation?.signatureBase64 || ''), 'base64'));
  } catch {
    return false;
  }
}

function verifyRoundtablePreregistrationConfiguration(receipt, policy) {
  const issues = [];
  const attestation = receipt?.bridgeAttestation;
  const fingerprint = String(attestation?.publicKeyFingerprintSha256 || '');
  const publicKeyBytes = Buffer.from(String(attestation?.publicKeySpkiBase64 || ''), 'base64');
  if (receipt?.protocol !== 'roundtable-review-preregistration-v1') {
    issues.push('configuration is not an authentic Roundtable pre-room preregistration receipt');
  }
  if (
    attestation?.protocol !== 'roundtable-message-attestation-v1' ||
    attestation?.algorithm !== 'Ed25519' ||
    !HASH_RE.test(fingerprint) ||
    sha256(publicKeyBytes) !== fingerprint
  ) {
    issues.push('Roundtable preregistration bridge attestation is missing or invalid');
  }
  if (
    !receipt?.reviewConfiguration ||
    !HASH_RE.test(String(receipt?.reviewConfigurationSha256 || '')) ||
    sha256(Buffer.from(JSON.stringify(receipt?.reviewConfiguration || {}), 'utf8')) !==
      receipt?.reviewConfigurationSha256
  ) {
    issues.push('Roundtable preregistration review configuration hash does not reproduce');
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(receipt?.preregisteredAt || ''))) {
    issues.push('Roundtable preregistration timestamp is missing');
  }
  const expectedRounds = Number(policy?.perRun?.requiredRoundtableRounds || 0);
  if (
    Number(receipt?.reviewConfiguration?.rounds) !== expectedRounds ||
    !String(receipt?.reviewConfiguration?.antigravityModel || '').trim() ||
    !String(receipt?.reviewConfiguration?.fableModel || '').trim() ||
    receipt?.reviewConfiguration?.fableFinalAudit !== true ||
    receipt?.participantAvailability?.antigravity !== true ||
    receipt?.participantAvailability?.fable !== true
  ) {
    issues.push('Roundtable preregistration does not require six live rounds, Antigravity, and final-only Fable audit');
  }
  return { issues, fingerprint };
}

function verifyRoundtableBenchmarkEvidence(
  receipt,
  session,
  expectedFingerprint,
  configurationReceipt,
  policy,
  claimReviewReceipt,
  claimReviewReceiptSha256,
) {
  const issues = [];
  if (!session?.id || !Array.isArray(session?.messages)) issues.push('Roundtable session evidence is malformed');
  if (!HASH_RE.test(String(expectedFingerprint || '')))
    issues.push('preregistered Roundtable bridge fingerprint is missing');
  const messages = new Map((session?.messages || []).map((message) => [message?.id, message]));
  const transcriptSha256 = sha256(Buffer.from(JSON.stringify(session?.messages || []), 'utf8'));
  const expectedRounds = Number(policy?.perRun?.requiredRoundtableRounds || 0);
  const participantMessages = (session?.messages || []).filter((message) =>
    ['codex', 'claude', 'antigravity', 'fable'].includes(message?.role),
  );
  for (const message of participantMessages) {
    if (!verifyRoundtableMessage(message, session?.id, expectedFingerprint)) {
      issues.push(`Roundtable participant message ${message?.id || '<missing>'} has no valid bridge attestation`);
    }
  }
  const claimReviewer = String(claimReviewReceipt?.review?.evaluator?.id || '');
  const claimReviewTag = `<claim-review-receipt-sha256>${claimReviewReceiptSha256}</claim-review-receipt-sha256>`;
  const claimReviewMessage = participantMessages.find(
    (message) => message?.author === claimReviewer && String(message?.body || '').includes(claimReviewTag),
  );
  if (!claimReviewMessage || !verifyRoundtableMessage(claimReviewMessage, session?.id, expectedFingerprint)) {
    issues.push('independent claim-review receipt is not acknowledged by its reviewer in a signed Roundtable message');
  }
  for (let round = 1; round <= expectedRounds; round += 1) {
    for (const role of ['codex', 'claude', 'antigravity']) {
      if (!participantMessages.some((message) => message?.role === role && Number(message?.round) === round)) {
        issues.push(`Roundtable round ${round} is missing live ${role} participation`);
      }
    }
  }
  const fableMessages = participantMessages.filter((message) => message?.role === 'fable');
  if (
    fableMessages.length !== 1 ||
    Number(fableMessages[0]?.round) !== expectedRounds ||
    fableMessages[0]?.stage !== 'boss-audit'
  ) {
    issues.push('Fable must appear exactly once as the final-round boss audit');
  }
  const requiredDiscussionTurns = expectedRounds * 3;
  if (
    session?.phase !== 'complete' ||
    Number(session?.discussionTurns) !== requiredDiscussionTurns ||
    Number(session?.completedTurns) < requiredDiscussionTurns + 1 ||
    session?.fableFinalAudit !== true ||
    String(session?.antigravityModel || '') !==
      String(configurationReceipt?.reviewConfiguration?.antigravityModel || '') ||
    String(session?.fableModel || '') !== String(configurationReceipt?.reviewConfiguration?.fableModel || '')
  ) {
    issues.push('Roundtable session does not prove the preregistered six-round live-participant execution');
  }
  if (session?.reviewConfigurationSha256 !== configurationReceipt?.reviewConfigurationSha256) {
    issues.push('Roundtable session does not carry the preregistered review configuration fingerprint');
  }
  const reviewPreregisteredAt = Date.parse(String(configurationReceipt?.preregisteredAt || ''));
  const sessionCreatedAt = Date.parse(String(session?.createdAt || ''));
  if (
    !Number.isFinite(reviewPreregisteredAt) ||
    !Number.isFinite(sessionCreatedAt) ||
    sessionCreatedAt < reviewPreregisteredAt
  ) {
    issues.push('Roundtable session was not created after its review preregistration');
  }
  const decision = String(session?.outcome?.decision || '');
  if (
    session?.outcome?.status !== 'available' ||
    session?.outcome?.provisional !== false ||
    session?.outcome?.consensus !== true ||
    !/(pass|promote|earns?)/i.test(decision) ||
    /(\bfix\b|\bhold\b|\breject(?:ed)?\b|\bblock(?:ed)?\b|does not earn|no package earns)/i.test(decision)
  ) {
    issues.push('Roundtable final outcome does not positively and non-provisionally approve the checkpoint');
  }
  const usedMessageIds = new Set();
  for (const order of ['forward', 'reverse']) {
    const review = (receipt?.reviews || []).find((candidate) => candidate?.order === order);
    const messageId = String(review?.messageId || '');
    if (review?.sessionId !== session?.id || review?.transcriptSha256 !== transcriptSha256 || !messageId) {
      issues.push(`${order} benchmark review is not bound to the supplied Roundtable transcript`);
      continue;
    }
    if (usedMessageIds.has(messageId)) issues.push(`${order} benchmark review reuses message ${messageId}`);
    usedMessageIds.add(messageId);
    const message = messages.get(messageId);
    if (!message || !verifyRoundtableMessage(message, session.id, expectedFingerprint)) {
      issues.push(`${order} benchmark message ${messageId} has no valid bridge attestation`);
      continue;
    }
    if (message.author !== review?.reviewer) {
      issues.push(`${order} benchmark reviewer did not author its bound message evidence`);
    }
    const authoredReview = benchmarkReviewPayloadFromMessage(message);
    if (!authoredReview || canonicalSha256(authoredReview) !== canonicalSha256(review?.qualityReview || null)) {
      issues.push(`${order} benchmark ratings are not the exact structured review authored in the signed message`);
    }
  }
  return { issues, transcriptSha256 };
}

export async function deriveVerifiedCoherentDraftRunEvidence(run, policy) {
  const inputs = run?.evidenceInputs || {};
  // Render receipts intentionally store paths relative to the capture root so the
  // evidence can be moved as one bundle. Campaigns live at the repository root,
  // while tests and offline auditors may capture into a disposable directory.
  const renderAuditRoot = path.resolve(inputs.renderAuditRoot || process.cwd());
  const required = [
    'package',
    'source',
    'configuration',
    'generator',
    'policy',
    'campaignPreregistration',
    'qualityBenchmarkRubric',
    'renderAudit',
    'accessibilityAudit',
    'claimReview',
    'benchmarkReview',
    'roundtableSession',
  ];
  for (const key of required) {
    if (!inputs[key]) throw new Error(`${run?.id || 'run'}: missing evidence input ${key}`);
  }
  const packageBytes = await fs.readFile(path.resolve(inputs.package));
  const packageSha256 = sha256(packageBytes);
  const zip = await JSZip.loadAsync(packageBytes);
  const manifestEntry = zip.file('PACKAGE_MANIFEST.json');
  if (!manifestEntry) throw new Error(`${run.id}: PACKAGE_MANIFEST.json is missing`);
  const manifest = JSON.parse(await manifestEntry.async('string'));
  const families = await artifactFamilies(zip, policy?.perRun?.requiredArtifactFamilies || []);
  const renderedOutputsSha256 = canonicalSha256(families.flatMap((family) => family.files));

  const [source, configuration, generator] = await Promise.all(
    ['source', 'configuration', 'generator'].map((type) => fileBinding(type, inputs[type])),
  );
  const renderAuditBytes = await fs.readFile(path.resolve(inputs.renderAudit));
  const renderAuditReceipt = JSON.parse(renderAuditBytes.toString('utf8'));
  const renderAuditVerification = await verifyPackageRenderAuditV1(renderAuditReceipt, { root: renderAuditRoot });
  const boundRenderEvidence = await renderEvidenceBundle(renderAuditReceipt, renderAuditRoot);
  const accessibilityAuditBytes = await fs.readFile(path.resolve(inputs.accessibilityAudit));
  const accessibilityAuditReceipt = JSON.parse(accessibilityAuditBytes.toString('utf8'));
  const claimReviewBytes = await fs.readFile(path.resolve(inputs.claimReview));
  const claimReviewReceipt = JSON.parse(claimReviewBytes.toString('utf8'));
  const benchmarkReviewBytes = await fs.readFile(path.resolve(inputs.benchmarkReview));
  const benchmarkReviewReceipt = JSON.parse(benchmarkReviewBytes.toString('utf8'));
  const roundtableSessionBytes = await fs.readFile(path.resolve(inputs.roundtableSession));
  const roundtableSessionEnvelope = JSON.parse(roundtableSessionBytes.toString('utf8'));
  const roundtableSession =
    roundtableSessionEnvelope?.session && typeof roundtableSessionEnvelope.session === 'object'
      ? roundtableSessionEnvelope.session
      : roundtableSessionEnvelope;
  const configurationReceipt = await readJson(inputs.configuration);
  const configurationBytes = await fs.readFile(path.resolve(inputs.configuration));
  const policyBytes = await fs.readFile(path.resolve(inputs.policy));
  const campaignPreregistrationBytes = await fs.readFile(path.resolve(inputs.campaignPreregistration));
  const campaignPreregistration = JSON.parse(campaignPreregistrationBytes.toString('utf8'));
  const qualityBenchmarkRubricBytes = await fs.readFile(path.resolve(inputs.qualityBenchmarkRubric));
  const qualityBenchmarkRubric = JSON.parse(qualityBenchmarkRubricBytes.toString('utf8'));
  const roundtableConfiguration = verifyRoundtablePreregistrationConfiguration(configurationReceipt, policy);
  const claimReview = await verifyClaimReview({
    receipt: claimReviewReceipt,
    receiptBytes: claimReviewBytes,
    zip,
    packageSha256,
    policy,
  });
  const benchmarkReview = await verifyBenchmarkReview({
    receipt: benchmarkReviewReceipt,
    receiptBytes: benchmarkReviewBytes,
    packageSha256,
    sourceSha256: source.sha256,
    zip,
    policy,
    policyBytes,
    rubric: qualityBenchmarkRubric,
    rubricBytes: qualityBenchmarkRubricBytes,
    campaignPreregistration,
    campaignPreregistrationBytes,
    configurationReceipt,
    configurationBytes,
    runId: run.id,
    runGeneratedAt: run.generatedAt,
  });
  const roundtableBenchmark = verifyRoundtableBenchmarkEvidence(
    benchmarkReviewReceipt,
    roundtableSession,
    roundtableConfiguration.fingerprint,
    configurationReceipt,
    policy,
    claimReviewReceipt,
    claimReview.receiptSha256,
  );
  const sourceReplay = await verifyPackageEvidenceZipBytes(packageBytes);
  const accessibilityAudit = await verifyPackageAccessibilityAuditV1({
    packageBytes,
    receipt: accessibilityAuditReceipt,
  });
  const authenticEvidenceIntegrity = await verifyAuthenticEvidenceIntegrity(zip, manifest);
  const postDraftAdmission = await verifyPostDraftAdmission(zip, manifest, policy);

  const requiredVisualLessonNumbers = [
    ...new Set(
      (Array.isArray(run?.visualAnalysisRequiredLessons) ? run.visualAnalysisRequiredLessons : [])
        .map(Number)
        .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0),
    ),
  ].sort((left, right) => left - right);
  let functionalVisuals = {
    protocol: policy?.perRun?.functionalVisualAuditProtocol,
    passed: requiredVisualLessonNumbers.length === 0,
    receiptSha256: sha256(Buffer.from('not-applicable', 'utf8')),
    requiredLessons: requiredVisualLessonNumbers.length,
    requiredLessonNumbers: requiredVisualLessonNumbers,
    functionalLessons: 0,
  };
  const derivationIssues = [
    ...claimReview.issues,
    ...benchmarkReview.issues,
    ...roundtableConfiguration.issues,
    ...roundtableBenchmark.issues,
    ...renderAuditVerification.issues.map((issue) => `render audit: ${issue}`),
    ...accessibilityAudit.issues,
    ...authenticEvidenceIntegrity.issues,
    ...postDraftAdmission.issues,
    ...(sourceReplay.status === 'pass' ? [] : sourceReplay.failures.map((failure) => `source replay: ${failure}`)),
  ];
  const authenticLanguageDataCoverage = manifest?.authenticLanguageDataCoverage;
  const operationQualifiedEvidence = manifest?.operationQualifiedEvidence || null;
  const assessmentCoherence = manifest?.assessmentCoherence || null;
  if (policy?.perRun?.requireCompleteAssessmentCoherence === true) {
    if (
      !assessmentCoherence ||
      Number(assessmentCoherence?.eligibleAssessments) < 1 ||
      Number(assessmentCoherence?.passedAssessments) !== Number(assessmentCoherence?.eligibleAssessments)
    ) {
      derivationIssues.push('package assessment coherence is incomplete');
    }
  }
  const instructionMappingCoverage = Number(assessmentCoherence?.instructionArtifactMapping?.coverage);
  const minimumInstructionMappingCoverage = Number(policy?.perRun?.minimumInstructionArtifactMappingCoverage ?? 0);
  if (!Number.isFinite(instructionMappingCoverage) || instructionMappingCoverage < minimumInstructionMappingCoverage) {
    derivationIssues.push(
      `instruction-artifact objective mapping coverage ${
        Number.isFinite(instructionMappingCoverage) ? instructionMappingCoverage.toFixed(3) : 'missing'
      } is below the required ${minimumInstructionMappingCoverage.toFixed(3)}`,
    );
  }
  if (run?.disciplineClass === 'quantitative-procedural') {
    if (operationQualifiedEvidence?.protocol !== policy?.perRun?.operationQualifiedEvidenceProtocol) {
      derivationIssues.push('quantitative package lacks a supported operation-qualified evidence receipt');
    } else {
      if (
        operationQualifiedEvidence?.summary?.status !== 'passed' ||
        Number(operationQualifiedEvidence?.summary?.demandedLessonCount) < 1 ||
        Number(operationQualifiedEvidence?.summary?.completeLessonCount) !==
          Number(operationQualifiedEvidence?.summary?.demandedLessonCount) ||
        (operationQualifiedEvidence?.missingLessonNumbers || []).length > 0
      ) {
        derivationIssues.push('quantitative package has unresolved operation-qualified lesson evidence');
      }
      const requiredProjections = policy?.perRun?.requiredOperationProjectionFamilies || [];
      for (const item of operationQualifiedEvidence?.items || []) {
        if (item?.complete !== true)
          derivationIssues.push(`lesson ${item?.lessonNumber}: operation evidence is incomplete`);
        if (item?.hasExplicitStudentDemand !== true || !String(item?.studentTask || '').trim()) {
          derivationIssues.push(
            `lesson ${item?.lessonNumber}: operation evidence lacks an explicit student-facing demand`,
          );
        }
        for (const familyId of requiredProjections) {
          if (!item?.projections?.includes(familyId)) {
            derivationIssues.push(`lesson ${item?.lessonNumber}: operation evidence is missing ${familyId} projection`);
          }
        }
      }
    }
  }
  if (
    authenticLanguageDataCoverage?.protocol === 'coursemapper-authentic-language-data-coverage-v1' &&
    Number(authenticLanguageDataCoverage?.requiredLessonCount) > 0 &&
    Number(authenticLanguageDataCoverage?.coverage) < Number(policy?.perRun?.requiredAuthenticLanguageDataCoverage ?? 1)
  ) {
    derivationIssues.push(
      `authentic language-data coverage ${Number(authenticLanguageDataCoverage.coverage).toFixed(3)} is below the required ${Number(
        policy?.perRun?.requiredAuthenticLanguageDataCoverage ?? 1,
      ).toFixed(3)}`,
    );
  }
  if (inputs.functionalVisualAudit) {
    const bytes = await fs.readFile(path.resolve(inputs.functionalVisualAudit));
    const receipt = JSON.parse(bytes.toString('utf8'));
    const verification = await verifyFunctionalVisualAuditV1(receipt, { root: renderAuditRoot });
    functionalVisuals = {
      protocol: receipt?.protocol,
      passed: verification.passed === true,
      receiptSha256: String(receipt?.receiptSha256 || sha256(bytes)),
      fileSha256: sha256(bytes),
      requiredLessons: Number(
        receipt?.summary?.requiredLessonCount ??
          receipt?.summary?.requiredLessons ??
          receipt?.contract?.requiredLessonNumbers?.length,
      ),
      requiredLessonNumbers: (receipt?.contract?.requiredLessonNumbers || []).map(Number),
      functionalLessons: Number(
        receipt?.summary?.passedLessonCount ??
          receipt?.summary?.functionalLessons ??
          receipt?.lessons?.filter((lesson) => lesson?.status === 'passed').length,
      ),
    };
    for (const issue of verification.issues || []) derivationIssues.push(`functional visual audit: ${issue}`);
    if (receipt?.packageFile?.sha256 !== packageSha256)
      derivationIssues.push('functional visual receipt package mismatch');
    if (canonicalSha256(functionalVisuals.requiredLessonNumbers) !== canonicalSha256(requiredVisualLessonNumbers)) {
      derivationIssues.push('functional visual receipt does not match preregistered visual-analysis lessons');
    }
  } else if (requiredVisualLessonNumbers.length > 0) {
    derivationIssues.push('preregistered visual-analysis lessons lack a functional visual audit receipt');
  }

  const projectBinding = inputs.rebuiltProject ? await fileBinding('rebuilt-project', inputs.rebuiltProject) : null;
  if (projectBinding) {
    const rebuiltProject = await readJson(inputs.rebuiltProject);
    if (rebuiltProject?.compilationReceipt?.protocol !== 'coursemapper-saved-state-export-join-v1') {
      derivationIssues.push('rebuilt project lacks saved-state/export join receipt');
    }
    const compilationState = {
      courseMap: rebuiltProject?.courseMap,
      courseGraph: rebuiltProject?.courseGraph,
      blueprint: rebuiltProject?.blueprint,
      deliverables: rebuiltProject?.deliverables,
      selectedFeatures: rebuiltProject?.selectedFeatures,
    };
    if (canonicalSha256(compilationState) !== rebuiltProject?.compilationReceipt?.compilationStateSha256) {
      derivationIssues.push('rebuilt project compilation-state digest does not reproduce');
    }
    if (rebuiltProject?.compilationReceipt?.packageSha256 !== packageSha256) {
      derivationIssues.push('rebuilt project is not joined to the exact package ZIP');
    }
    if (rebuiltProject?.compilationReceipt?.sourceProjectSha256 !== source.sha256) {
      derivationIssues.push('rebuilt project is not joined to the exact source project');
    }
    const projectLineage = rebuiltProject?.courseGraph?.instructionalPlanLineage || {};
    for (const [field, value] of Object.entries(manifest?.postDraftAdmission?.predecessor || {})) {
      if ((projectLineage?.[field] ?? null) !== (value ?? null)) {
        derivationIssues.push(`rebuilt project instructional predecessor ${field} does not match the package`);
      }
    }
    for (const familyId of policy?.perRun?.requiredArtifactFamilies || []) {
      if (!rebuiltProject?.selectedFeatures?.includes(familyId)) {
        derivationIssues.push(`rebuilt project omits selected family ${familyId}`);
      }
    }
  }

  const derived = {
    ...run,
    promotionEvidence: {
      protocol: VERIFIED_COHERENT_DRAFT_EVIDENCE_PROTOCOL,
      derivedAt: new Date().toISOString(),
      packageSha256,
      derivationIssues,
      claimReviewReceiptSha256: claimReview.receiptSha256,
      benchmarkReviewReceiptSha256: benchmarkReview.qualityBenchmark.receiptSha256,
      sourceEvidenceBundleSha256: sourceReplay.evidenceBundleSha256,
      roundtableTranscriptSha256: roundtableBenchmark.transcriptSha256,
    },
    hashBindings: [
      source,
      configuration,
      generator,
      await fileBinding('policy', inputs.policy),
      await fileBinding('campaign-preregistration', inputs.campaignPreregistration),
      await fileBinding('quality-benchmark-rubric', inputs.qualityBenchmarkRubric),
      { type: 'zip', path: path.resolve(inputs.package), bytes: packageBytes.length, sha256: packageSha256 },
      { type: 'rendered-outputs', sha256: renderedOutputsSha256 },
      {
        type: 'render-audit',
        path: path.resolve(inputs.renderAudit),
        bytes: renderAuditBytes.length,
        sha256: sha256(renderAuditBytes),
      },
      { type: 'render-evidence-bundle', sha256: boundRenderEvidence.sha256 },
      ...(projectBinding ? [projectBinding] : []),
      { type: 'accessibility-audit', sha256: sha256(accessibilityAuditBytes) },
      ...(inputs.functionalVisualAudit
        ? [{ type: 'functional-visual-audit', sha256: functionalVisuals.fileSha256 }]
        : []),
      { type: 'claim-verification', sha256: claimReview.receiptSha256 },
      { type: 'post-draft-admission', sha256: postDraftAdmission.receiptSha256 },
      { type: 'quality-benchmark', sha256: benchmarkReview.qualityBenchmark.receiptSha256 },
      { type: 'roundtable-session', sha256: sha256(roundtableSessionBytes) },
    ],
    artifactFamilies: families,
    findings: manifest?.quality?.findingCounts || {},
    conformanceScore: Number(manifest?.quality?.score),
    formatScore: Number(
      typeof manifest?.quality?.dimensions?.format === 'object'
        ? manifest?.quality?.dimensions?.format?.score
        : manifest?.quality?.dimensions?.format,
    ),
    claimVerification: claimReview.claimVerification,
    postDraftAdmission,
    sourceReplay,
    authenticEvidenceIntegrity,
    assessmentCoherence,
    renderAudit: {
      protocol: renderAuditReceipt?.protocol,
      passed: renderAuditVerification.passed === true,
      receiptSha256: String(renderAuditReceipt?.receiptSha256 || ''),
      fileSha256: sha256(renderAuditBytes),
      evidenceBundleProtocol: boundRenderEvidence.protocol,
      evidenceBundleSha256: boundRenderEvidence.sha256,
      childReceiptCount: boundRenderEvidence.childReceiptCount,
      renderedRasterCount: boundRenderEvidence.renderedRasterCount,
    },
    accessibilityAudit: {
      protocol: accessibilityAuditReceipt?.protocol,
      passed: accessibilityAudit.status === 'passed',
      receiptSha256: accessibilityAudit.receiptSha256,
      fileSha256: sha256(accessibilityAuditBytes),
      summary: accessibilityAudit.fileSummary,
      evidenceType: 'structural-static',
      certification: false,
    },
    functionalVisuals,
    operationQualifiedEvidence,
    qualityBenchmark: benchmarkReview.qualityBenchmark,
  };
  derived.promotionEvidence.receiptSha256 = canonicalSha256({
    packageSha256,
    hashBindings: derived.hashBindings,
    artifactFamilies: families,
    claimVerification: derived.claimVerification,
    postDraftAdmission,
    sourceReplay,
    authenticEvidenceIntegrity,
    renderAudit: derived.renderAudit,
    accessibilityAudit: derived.accessibilityAudit,
    functionalVisuals,
    operationQualifiedEvidence,
    qualityBenchmark: derived.qualityBenchmark,
    derivationIssues,
  });
  return derived;
}

export async function deriveVerifiedCoherentDraftCampaignEvidence(campaign, policy) {
  return {
    ...campaign,
    runs: await Promise.all((campaign?.runs || []).map((run) => deriveVerifiedCoherentDraftRunEvidence(run, policy))),
  };
}
