import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { materializeSourceCaptureCampaign } from './scionSourceCapture.mjs';
import { buildPublicScionMessages } from '../../src/lib/publicScionProvider.js';

export const SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL = 'scion-lesson-kernel-preference-campaign-v1';
export const SCION_LESSON_KERNEL_CAPTURE_PROTOCOL = 'scion-lesson-kernel-capture-v1';
export const SCION_LESSON_KERNEL_CAMPAIGN_SCHEMA_VERSION = 1;

export const SCION_LESSON_KERNEL_FAILURE_FAMILIES = Object.freeze([
  'answer-key-correctness',
  'answer-feedback-consistency',
  'choice-discriminability',
  'source-fidelity',
  'source-coverage',
  'key-term-precision',
  'misconception-validity',
  'feedback-instructionality',
  'scenario-evidence-sufficiency',
]);

export const SCION_LESSON_KERNEL_PRODUCTION_LICENSES = Object.freeze([
  'CC-BY-4.0',
  'Open Government Licence v3.0',
  'U.S. Government Work',
  'W3C Document License and U.S. Government Work',
]);

export const SCION_LESSON_KERNEL_SOURCE_MANIFESTS = Object.freeze([
  'evaluation/scion-source-capture-campaign.json',
  'evaluation/scion-source-capture-expansion-v0.16.17.json',
  'evaluation/scion-source-capture-preference-expansion-v0.16.47.json',
  'evaluation/scion-source-capture-novel-kernels-v0.16.47.json',
  'evaluation/scion-source-capture-course-group-breadth-v0.16.47.json',
  'evaluation/scion-source-capture-readiness-gap-v0.16.47.json',
  'evaluation/scion-source-capture-domain-breadth-v0.16.47.json',
  'evaluation/scion-source-capture-production-license-breadth-v0.16.54.json',
]);

function schemaString(minLength, maxLength) {
  return { type: 'string', minLength, maxLength };
}

export function buildScionLessonKernelResponseSchema(lessonId) {
  const keyTerm = {
    type: 'object',
    additionalProperties: false,
    properties: {
      tr: schemaString(3, 60),
      df: schemaString(40, 380),
      eg: schemaString(12, 300),
      mi: schemaString(12, 300),
      cx: schemaString(12, 300),
    },
    required: ['tr', 'df', 'eg', 'mi', 'cx'],
  };
  const mcItem = {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: schemaString(20, 300),
      op: { type: 'array', minItems: 4, maxItems: 4, items: schemaString(5, 180) },
      ai: { type: 'integer', enum: [0] },
      fi: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: { type: 'integer', minimum: 0, maximum: 4 },
      },
      ex: schemaString(20, 400),
    },
    required: ['q', 'op', 'ai', 'fi', 'ex'],
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      lessons: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            lessonId: { type: 'string', enum: [lessonId] },
            facts: { type: 'array', minItems: 5, maxItems: 5, items: schemaString(20, 260) },
            keyTerms: { type: 'array', minItems: 3, maxItems: 3, items: keyTerm },
            scenario: {
              type: 'object',
              additionalProperties: false,
              properties: { su: schemaString(45, 600), ma: schemaString(10, 360) },
              required: ['su', 'ma'],
            },
            mc: { type: 'array', minItems: 2, maxItems: 2, items: mcItem },
          },
          required: ['lessonId', 'facts', 'keyTerms', 'scenario', 'mc'],
        },
      },
    },
    required: ['lessons'],
  };
}

const FAMILY_RULES = Object.freeze([
  ['answer-key-correctness', /answer[- ]key|selected option|keyed (?:answer|mechanism)|correct option/i],
  ['answer-feedback-consistency', /answer[- ]feedback|explanation.*(?:selected|keyed|contradict)|feedback.*key/i],
  ['choice-discriminability', /ambiguous|overlap|near[- ]neighbor|mutually exclusive|closest distractor|parallel/i],
  ['source-fidelity', /source fidelity|unsupported|warranted|causal|inside the supplied evidence|source-inconsistent/i],
  ['source-coverage', /source omission|source coverage|coverage|important.*source|missing.*source/i],
  ['key-term-precision', /key term|terminology|conceptual boundar|generic term|precise term/i],
  ['misconception-validity', /misconception|genuinely false|false learner belief/i],
  ['feedback-instructionality', /feedback|explanation|teach|merely repeat|generic feedback|circular/i],
  ['scenario-evidence-sufficiency', /scenario|observation|evidence packet|inspectable|insufficient evidence|decision/i],
]);

export function canonicalizeScionLessonKernelValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeScionLessonKernelValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeScionLessonKernelValue(value[key])]),
  );
}

export function stableScionLessonKernelJson(value) {
  return JSON.stringify(canonicalizeScionLessonKernelValue(value));
}

export function scionLessonKernelSha256(value) {
  return crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : stableScionLessonKernelJson(value))
    .digest('hex');
}

function clean(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceClaims(kernel) {
  return [clean(kernel?.definition), ...(kernel?.facts || []).map((fact) => clean(fact?.text))].filter(Boolean);
}

function sourceAnchors(kernel) {
  return [kernel?.definitionAnchor, ...(kernel?.facts || []).map((fact) => fact?.anchor)]
    .filter(Boolean)
    .map((anchor) => ({ src: clean(anchor.src), loc: clean(anchor.loc), quote: clean(anchor.quote) }));
}

export function classifyScionLessonKernelFailureFamilies(qualityFocus = '', caseSeed = '') {
  const focus = clean(qualityFocus);
  const matched = FAMILY_RULES.filter(([, pattern]) => pattern.test(focus)).map(([family]) => family);
  if (matched.length > 0) return [...new Set(matched)].sort();
  const offset = Number.parseInt(scionLessonKernelSha256(`${focus}:${caseSeed}`).slice(0, 8), 16);
  return [SCION_LESSON_KERNEL_FAILURE_FAMILIES[offset % SCION_LESSON_KERNEL_FAILURE_FAMILIES.length]];
}

function buildLessonInput({ kernel, lessonNumber, qualityFocus, includeQualityFocusInObjectives }) {
  const claims = sourceClaims(kernel);
  const sourceSummary = claims.map((claim, index) => `Claim ${index}: ${claim}`).join(' ');
  return {
    lessonId: `lesson-${lessonNumber}`,
    title: clean(kernel.term),
    // Failure-family / quality-focus text is evaluator metadata, not source
    // material. Putting it here teaches both arms the very concepts the judge
    // is meant to test and can turn a negative constraint into a false fact.
    objectives: includeQualityFocusInObjectives
      ? `Use supplied claims to make a defensible distinction. Quality focus: ${clean(qualityFocus)}`
      : 'Use only the supplied claims to make a defensible distinction without adding outside facts.',
    topics: sourceSummary,
    readings: (kernel.attribution || []).map(clean).filter(Boolean).join('; '),
  };
}

function buildUserPrompt({ group, lessonInput }) {
  return `Course: ${clean(group.title)}\nLessons:\n${JSON.stringify([lessonInput])}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`;
}

function manifestReceipt(manifestPath, bytes) {
  return { path: manifestPath, bytes: Buffer.byteLength(bytes), sha256: scionLessonKernelSha256(bytes) };
}

function caseIdentityPayload(entry) {
  return {
    protocol: SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL,
    sourceManifestSha256: entry.sourceManifestSha256,
    courseGroupId: entry.courseGroupId,
    domain: entry.domain,
    kernelId: entry.sourceContext.kernelId,
    lessonInput: entry.lessonInput,
    failureFamilies: entry.failureFamilies,
    sourceContext: entry.sourceContext,
    messages: entry.messages,
  };
}

function summarizeCases(cases, excluded) {
  const countBy = (field) =>
    Object.fromEntries(
      [...new Set(cases.map((entry) => entry[field]))]
        .sort()
        .map((value) => [value, cases.filter((entry) => entry[field] === value).length]),
    );
  const failureFamilyCounts = Object.fromEntries(
    SCION_LESSON_KERNEL_FAILURE_FAMILIES.map((family) => [
      family,
      cases.filter((entry) => entry.failureFamilies.includes(family)).length,
    ]),
  );
  const licenseCounts = countBy('license');
  const sourceKernelIds = new Set(cases.map((entry) => entry.sourceContext.kernelId));
  return {
    cases: cases.length,
    courseGroups: new Set(cases.map((entry) => entry.courseGroupId)).size,
    sourceKernels: sourceKernelIds.size,
    domains: countBy('domain'),
    licenses: licenseCounts,
    failureFamilies: failureFamilyCounts,
    excludedCases: excluded.length,
    excludedLicenses: Object.fromEntries(
      [...new Set(excluded.map((entry) => entry.license))]
        .sort()
        .map((license) => [license, excluded.filter((entry) => entry.license === license).length]),
    ),
  };
}

export async function buildScionLessonKernelCampaign({
  sourceManifests = SCION_LESSON_KERNEL_SOURCE_MANIFESTS,
  generatedAt = '2026-07-18T07:30:00.000Z',
  heldoutBenchmarkPath = 'evaluation/scion-adapters/held-out-course-benchmark-v5.json',
  includeQualityFocusInObjectives = false,
} = {}) {
  const allowedLicenses = new Set(SCION_LESSON_KERNEL_PRODUCTION_LICENSES);
  const heldoutBytes = await fs.readFile(heldoutBenchmarkPath, 'utf8');
  const heldout = JSON.parse(heldoutBytes);
  const heldoutDomains = new Set((heldout.courses || []).map((entry) => clean(entry.domain).toLowerCase()));
  const heldoutCourseGroups = new Set((heldout.courses || []).map((entry) => clean(entry.courseId).toLowerCase()));
  const receipts = [];
  const candidates = [];

  for (const manifestPath of sourceManifests) {
    const bytes = await fs.readFile(manifestPath, 'utf8');
    const receipt = manifestReceipt(manifestPath, bytes);
    receipts.push(receipt);
    const campaign = await materializeSourceCaptureCampaign({ manifestPath });
    for (const group of campaign.groups) {
      if (heldoutDomains.has(clean(group.domain).toLowerCase())) {
        throw new Error(`Training-domain overlap with frozen holdout: ${group.domain}`);
      }
      if (heldoutCourseGroups.has(clean(group.id).toLowerCase())) {
        throw new Error(`Training course-group overlap with frozen holdout: ${group.id}`);
      }
      for (let index = 0; index < group.sourcePacket.kernels.length; index += 1) {
        const kernel = group.sourcePacket.kernels[index];
        const qualityFocus = clean(group.qualityFocus || group.courseBrief);
        const failureFamilies = classifyScionLessonKernelFailureFamilies(qualityFocus, `${group.id}:${kernel.id}`);
        const lessonInput = buildLessonInput({
          kernel,
          lessonNumber: index + 1,
          qualityFocus,
          includeQualityFocusInObjectives,
        });
        const userPrompt = buildUserPrompt({ group, lessonInput });
        const messages = buildPublicScionMessages('', userPrompt, { task: 'blueprintEnrichment' });
        const sourceContext = {
          sourcePacketSha256: scionLessonKernelSha256(group.sourcePacket),
          kernelId: clean(kernel.id),
          term: clean(kernel.term),
          claims: sourceClaims(kernel),
          anchors: sourceAnchors(kernel),
          attribution: (kernel.attribution || []).map(clean).filter(Boolean),
          license: clean(kernel.license),
        };
        const candidate = {
          sourceManifest: manifestPath,
          sourceManifestSha256: receipt.sha256,
          courseGroupId: clean(group.id),
          courseGroupSha256: scionLessonKernelSha256(`${clean(group.domain).toLowerCase()}:${clean(group.id)}`),
          domain: clean(group.domain).toLowerCase(),
          courseTitle: clean(group.title),
          courseBrief: clean(group.courseBrief),
          qualityFocus,
          failureFamilies,
          primaryFailureFamily:
            failureFamilies[
              Number.parseInt(scionLessonKernelSha256(`${group.id}:${kernel.id}`).slice(0, 8), 16) %
                failureFamilies.length
            ],
          lessonInput,
          sourceContext,
          license: clean(kernel.license),
          userPrompt,
          messages,
          messagesSha256: scionLessonKernelSha256(messages),
        };
        candidate.caseId = `scion-kernel-${scionLessonKernelSha256(caseIdentityPayload(candidate)).slice(0, 24)}`;
        candidate.caseSha256 = scionLessonKernelSha256(caseIdentityPayload(candidate));
        candidates.push(candidate);
      }
    }
  }

  const unique = new Map();
  for (const candidate of candidates) unique.set(candidate.caseId, candidate);
  if (unique.size !== candidates.length) throw new Error('Lesson-kernel campaign case identity collision');
  const included = [...unique.values()]
    .filter((entry) => allowedLicenses.has(entry.license))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const excluded = [...unique.values()]
    .filter((entry) => !allowedLicenses.has(entry.license))
    .map((entry) => ({ caseId: entry.caseId, license: entry.license, reason: 'production-license-policy' }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const summary = summarizeCases(included, excluded);
  const minimums = {
    cases: 120,
    domains: 7,
    courseGroups: 20,
    sourceKernels: 50,
    failureFamilies: Object.fromEntries(SCION_LESSON_KERNEL_FAILURE_FAMILIES.map((family) => [family, 8])),
  };
  const issues = [];
  if (summary.cases < minimums.cases) issues.push(`cases:${summary.cases}/${minimums.cases}`);
  if (Object.keys(summary.domains).length < minimums.domains) {
    issues.push(`domains:${Object.keys(summary.domains).length}/${minimums.domains}`);
  }
  if (summary.courseGroups < minimums.courseGroups) {
    issues.push(`course-groups:${summary.courseGroups}/${minimums.courseGroups}`);
  }
  if (summary.sourceKernels < minimums.sourceKernels) {
    issues.push(`source-kernels:${summary.sourceKernels}/${minimums.sourceKernels}`);
  }
  for (const [family, minimum] of Object.entries(minimums.failureFamilies)) {
    if ((summary.failureFamilies[family] || 0) < minimum) {
      issues.push(`failure-family:${family}:${summary.failureFamilies[family] || 0}/${minimum}`);
    }
  }

  const identityPayload = {
    protocol: SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL,
    promptPolicy: {
      protocol: 'scion-lesson-kernel-prompt-policy-v2',
      productionPromptBuilder: 'buildPublicScionMessages',
      evaluatorMetadata: includeQualityFocusInObjectives ? 'included-legacy' : 'excluded',
      freshRebuildRequired: !includeQualityFocusInObjectives,
    },
    sourceManifests: receipts,
    heldoutBenchmark: {
      path: heldoutBenchmarkPath,
      bytes: Buffer.byteLength(heldoutBytes),
      sha256: scionLessonKernelSha256(heldoutBytes),
      id: heldout.id,
      domains: [...heldoutDomains].sort(),
      courseGroups: [...heldoutCourseGroups].sort(),
    },
    licensePolicy: {
      protocol: 'scion-adapter-production-license-policy-v1',
      allowed: SCION_LESSON_KERNEL_PRODUCTION_LICENSES,
      excluded: ['CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0'],
    },
    minimums,
    summary,
    cases: included,
    exclusions: excluded,
  };
  return {
    schemaVersion: SCION_LESSON_KERNEL_CAMPAIGN_SCHEMA_VERSION,
    protocol: SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL,
    generatedAt,
    status: issues.length === 0 ? 'capture-ready' : 'insufficient-coverage',
    identity: {
      algorithm: 'sha256-canonical-json',
      sha256: scionLessonKernelSha256(identityPayload),
    },
    ...identityPayload,
    issues,
    claimBoundary:
      'This manifest freezes production-prompt lesson-kernel inputs and source lineage only. It contains no model output, preference, adapter weight, held-out result, human evidence, or production activation claim.',
  };
}

export function validateScionLessonKernelCampaign(campaign) {
  const issues = [];
  if (campaign?.schemaVersion !== SCION_LESSON_KERNEL_CAMPAIGN_SCHEMA_VERSION) issues.push('schema-version');
  if (campaign?.protocol !== SCION_LESSON_KERNEL_CAMPAIGN_PROTOCOL) issues.push('protocol');
  if (campaign?.status !== 'capture-ready') issues.push('status');
  if (!Array.isArray(campaign?.cases) || campaign.cases.length < Number(campaign?.minimums?.cases || Infinity)) {
    issues.push('case-count');
  }
  const caseIds = new Set();
  for (const entry of campaign?.cases || []) {
    if (caseIds.has(entry.caseId)) issues.push(`duplicate-case:${entry.caseId}`);
    caseIds.add(entry.caseId);
    if (!SCION_LESSON_KERNEL_PRODUCTION_LICENSES.includes(entry.license)) issues.push(`license:${entry.caseId}`);
    if (entry.messagesSha256 !== scionLessonKernelSha256(entry.messages)) issues.push(`messages:${entry.caseId}`);
    if (entry.caseSha256 !== scionLessonKernelSha256(caseIdentityPayload(entry))) issues.push(`case:${entry.caseId}`);
    if (!Array.isArray(entry.failureFamilies) || entry.failureFamilies.length === 0) {
      issues.push(`failure-family:${entry.caseId}`);
    }
    if (!entry.failureFamilies.includes(entry.primaryFailureFamily))
      issues.push(`primary-failure-family:${entry.caseId}`);
    if (entry.messages?.[1]?.content?.includes('Write exactly 2 mc items') !== true) {
      issues.push(`production-prompt:${entry.caseId}`);
    }
  }
  const identityPayload = {
    protocol: campaign?.protocol,
    ...(campaign?.promptPolicy ? { promptPolicy: campaign.promptPolicy } : {}),
    sourceManifests: campaign?.sourceManifests,
    heldoutBenchmark: campaign?.heldoutBenchmark,
    licensePolicy: campaign?.licensePolicy,
    minimums: campaign?.minimums,
    summary: campaign?.summary,
    cases: campaign?.cases,
    exclusions: campaign?.exclusions,
  };
  if (campaign?.identity?.sha256 !== scionLessonKernelSha256(identityPayload)) issues.push('identity');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
