import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { jsonrepair } from 'jsonrepair';

import {
  assessScionKeyTermContract,
  mergeScionKeyTermContractAttempts,
  normalizeScionKeyTerm,
} from '../../src/lib/scionKeyTermContract.js';
import {
  materializeSourceCaptureCampaign,
  parseSourceAtomResponse,
  verifySourceCaptureProject,
} from './scionSourceCapture.mjs';

export const SCION_KEY_TERM_RECOVERY_PROTOCOL = 'scion-browser-key-term-recovery-v1';
export const SCION_KEY_TERM_RECOVERY_RELEASE = 'v0.16.27';
export const SCION_KEY_TERM_RECOVERY_BASELINE = Object.freeze({
  file: 'evaluation/scion-adapters/evidence/compiler-cross-arm-replay-v0.16.26.json',
  sha256: '8a87530df8fd0350e13fab002e32c45c7d12f93c6ffb023ad86edf58491c73ab',
});
export const SCION_KEY_TERM_RECOVERY_EXPECTED = Object.freeze({
  cases: 14,
  correctionRepeatsDefinition: 12,
  invalidSourceFactIndex: 1,
  missingExpectedSeat: 1,
});

export const SCION_KEY_TERM_RECOVERY_CAMPAIGNS = Object.freeze([
  {
    id: 'primary',
    manifest: 'evaluation/scion-source-capture-campaign.json',
    evidenceDir: 'evaluation/scion-source-capture-evidence',
  },
  {
    id: 'expansion',
    manifest: 'evaluation/scion-source-capture-expansion-v0.16.17.json',
    evidenceDir: 'evaluation/scion-source-capture-expansion-evidence',
  },
]);

// Case identity is frozen from the v0.16.26 cross-arm receipt. Membership must
// not expand merely because a later admission gate becomes stricter; otherwise
// an audit of fourteen known deficits silently turns into a different test.
export const SCION_KEY_TERM_RECOVERY_FROZEN_CASES = Object.freeze([
  'python-data-structures-lab:cs/functions:key-term-0',
  'python-data-structures-lab:cs/functions:key-term-1',
  'python-data-structures-lab:cs/lists:key-term-0',
  'igneous-volcanic-processes:geo/silicate-structures:missing-key-term-1',
  'igneous-volcanic-processes:geo/igneous-rocks:key-term-1',
  'harmony-form-analysis:music/harmony-and-progressions:key-term-0',
  'harmony-form-analysis:music/harmony-and-progressions:key-term-1',
  'ux-research-synthesis-studio:ux/journey-mapping:key-term-0',
  'ux-research-synthesis-studio:ux/journey-mapping:key-term-1',
  'ux-prototyping-accessibility-lab:ux/accessibility-usability-evaluation:key-term-0',
  'ux-prototyping-accessibility-lab:ux/accessibility-usability-evaluation:key-term-1',
  'python-program-architecture-studio:cs/for-loops:key-term-1',
  'ux-evidence-to-prototype-capstone:ux/interactive-prototyping:key-term-0',
  'ux-evidence-to-prototype-capstone:ux/interactive-prototyping:key-term-1',
]);

export const SCION_KEY_TERM_RECOVERY_LOCAL_MODEL = Object.freeze({
  provider: 'local',
  id: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
  name: 'Scion base (Gemma 4 E2B)',
  revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
  route: 'mlx-vlm-base-only',
  decoding: 'greedy-json-schema',
  maxOutputTokens: 2200,
});

export function scionRecoverySha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalScionRecoveryJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validSourceIndexes(term, sourceClaimCount) {
  return (
    Array.isArray(term?.sourceFactIndexes) &&
    term.sourceFactIndexes.length > 0 &&
    term.sourceFactIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < sourceClaimCount)
  );
}

function assessSourceTerm(term, sourceClaimCount) {
  const contract = assessScionKeyTermContract(term, { definitionMin: 45 });
  const issues = [...contract.issues];
  if (!validSourceIndexes(term, sourceClaimCount)) issues.push('source-fact-index');
  return { eligible: issues.length === 0, issues: [...new Set(issues)], normalized: contract.normalized };
}

function responseTerms(call) {
  if (!call?.response) return [];
  return (parseSourceAtomResponse(call.response)?.keyTerms || []).slice(0, 2);
}

function caseBinding({
  id,
  campaign,
  project,
  projectSha256,
  prompt,
  defectKind,
  originalIssues,
  originalTerm,
  excludedTerms,
}) {
  return {
    id,
    campaign: {
      id: campaign.id,
      manifest: campaign.manifestPath,
      manifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
    },
    project: {
      file: project.file,
      sha256: projectSha256,
      sourcePacketSha256: project.value.scionSourceCapture.sourcePacketSha256,
    },
    promptId: prompt.id,
    kernelId: prompt.kernelId,
    lessonTitle: prompt.lessonTitle,
    defectKind,
    originalIssues,
    originalTerm,
    excludedTerms,
    sourceClaims: prompt.sourceClaims,
  };
}

export async function buildScionKeyTermRecoveryCases({ cwd = process.cwd() } = {}) {
  const baselineBytes = await fs.readFile(path.join(cwd, SCION_KEY_TERM_RECOVERY_BASELINE.file));
  if (scionRecoverySha256(baselineBytes) !== SCION_KEY_TERM_RECOVERY_BASELINE.sha256) {
    throw new Error('The frozen v0.16.26 compiler-lift receipt changed.');
  }
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  const frozenProjectBindings = new Map();
  for (const campaign of baseline.campaigns || []) {
    for (const evidence of campaign?.arms?.local?.evidence || []) frozenProjectBindings.set(evidence.file, evidence);
  }
  const frozenIds = new Set(SCION_KEY_TERM_RECOVERY_FROZEN_CASES);
  const cases = [];
  for (const config of SCION_KEY_TERM_RECOVERY_CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ cwd, manifestPath: config.manifest });
    for (const group of campaign.groups) {
      const projectFile = path.posix.join(config.evidenceDir, `${group.id}-local.json`);
      const bytes = await fs.readFile(path.join(cwd, projectFile));
      const frozenProject = frozenProjectBindings.get(projectFile);
      if (
        !frozenProject ||
        frozenProject.bytes !== bytes.length ||
        frozenProject.sha256 !== scionRecoverySha256(bytes)
      ) {
        throw new Error(`${projectFile} no longer matches the frozen v0.16.26 receipt.`);
      }
      const value = JSON.parse(bytes.toString('utf8'));
      const verification = verifySourceCaptureProject(value, {
        campaign,
        group,
        arm: 'local',
        model: SCION_KEY_TERM_RECOVERY_LOCAL_MODEL,
        admissionMode: 'captured',
      });
      if (!verification.valid) {
        throw new Error(
          `${projectFile} failed immutable source-capture verification: ${verification.issues.join(', ')}`,
        );
      }
      const project = { file: projectFile, value };
      const projectSha256 = scionRecoverySha256(bytes);
      const recovery = value.scionSourceCapture.compilerRecovery;
      const rawByPrompt = new Map(recovery.rawCalls.map((call) => [call.promptId, call]));
      const recoveryByPrompt = new Map(recovery.recoveryCalls.map((call) => [call.promptId, call]));
      const recoveredPromptIds = new Set(recovery.recoveredPromptIds);

      for (const prompt of group.prompts) {
        const rawTerms = responseTerms(rawByPrompt.get(prompt.id));
        rawTerms.forEach((term, index) => {
          const id = `${prompt.id}:key-term-${index}`;
          if (!frozenIds.has(id)) return;
          const normalized = normalizeScionKeyTerm(term);
          const correctionRepeat = normalized.definition.toLowerCase() === normalized.correction.toLowerCase();
          const sourceIndexDefect = !validSourceIndexes(term, prompt.sourceClaims.length);
          const defectKind = sourceIndexDefect
            ? 'invalid-source-fact-index'
            : correctionRepeat
              ? 'correction-repeats-definition'
              : null;
          if (!defectKind) throw new Error(`${id} no longer reproduces its frozen v0.16.26 defect.`);
          cases.push(
            caseBinding({
              id,
              campaign,
              project,
              projectSha256,
              prompt,
              defectKind,
              originalIssues:
                defectKind === 'invalid-source-fact-index' ? ['source-fact-index'] : ['correction-repeats-definition'],
              originalTerm: term,
              excludedTerms: [],
            }),
          );
        });
        const missingId = `${prompt.id}:missing-key-term-1`;
        if (frozenIds.has(missingId)) {
          const recoveredTerms = recoveredPromptIds.has(prompt.id)
            ? responseTerms(recoveryByPrompt.get(prompt.id))
            : [];
          const historicallyAdmittedTerms = [...rawTerms, ...recoveredTerms];
          if (historicallyAdmittedTerms.length !== 1) {
            throw new Error(`${missingId} no longer reproduces its frozen missing seat.`);
          }
          cases.push(
            caseBinding({
              id: missingId,
              campaign,
              project,
              projectSha256,
              prompt,
              defectKind: 'missing-expected-seat',
              originalIssues: ['missing-expected-seat'],
              originalTerm: null,
              excludedTerms: historicallyAdmittedTerms.map((term) => normalizeScionKeyTerm(term).term).filter(Boolean),
            }),
          );
        }
      }
    }
  }
  const casesById = new Map(cases.map((entry) => [entry.id, entry]));
  const orderedCases = SCION_KEY_TERM_RECOVERY_FROZEN_CASES.map((id) => {
    const entry = casesById.get(id);
    if (!entry) throw new Error(`The frozen v0.16.26 recovery case is missing: ${id}`);
    return entry;
  });
  const histogram = {
    correctionRepeatsDefinition: orderedCases.filter((entry) => entry.defectKind === 'correction-repeats-definition')
      .length,
    invalidSourceFactIndex: orderedCases.filter((entry) => entry.defectKind === 'invalid-source-fact-index').length,
    missingExpectedSeat: orderedCases.filter((entry) => entry.defectKind === 'missing-expected-seat').length,
  };
  if (
    orderedCases.length !== SCION_KEY_TERM_RECOVERY_EXPECTED.cases ||
    canonicalScionRecoveryJson(histogram) !==
      canonicalScionRecoveryJson({
        correctionRepeatsDefinition: SCION_KEY_TERM_RECOVERY_EXPECTED.correctionRepeatsDefinition,
        invalidSourceFactIndex: SCION_KEY_TERM_RECOVERY_EXPECTED.invalidSourceFactIndex,
        missingExpectedSeat: SCION_KEY_TERM_RECOVERY_EXPECTED.missingExpectedSeat,
      })
  ) {
    throw new Error(`The frozen v0.16.26 deficit accounting changed: ${canonicalScionRecoveryJson(histogram)}`);
  }
  return orderedCases;
}

function frozenFieldsForCase(entry) {
  if (!entry.originalTerm) return [];
  // Production recovery re-authors a complete atom, so source-grounded
  // improvements to df/eg/mi/cx are allowed. Preserve term identity to prove
  // that the failed seat itself—not a different concept—was recovered.
  return ['term'];
}

export function parseScionKeyTermRecoveryOutput(output) {
  const raw = String(output || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!raw) throw new Error('empty-output');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(jsonrepair(raw.match(/\{[\s\S]*\}/)?.[0] || raw));
  }
  if (parsed?.keyTerm && typeof parsed.keyTerm === 'object') return parsed.keyTerm;
  if (Array.isArray(parsed?.keyTerms) && parsed.keyTerms[0]) return parsed.keyTerms[0];
  if (parsed?.tr || parsed?.term) return parsed;
  throw new Error('missing-key-term-object');
}

export function assessScionKeyTermRecoveryOutput(entry, output) {
  let term = null;
  try {
    term = parseScionKeyTermRecoveryOutput(output);
  } catch (error) {
    return { eligible: false, issues: [`parse:${error.message}`], term: null };
  }
  const rawAssessment = assessSourceTerm(term, entry.sourceClaims.length);
  const merged = entry.originalTerm
    ? mergeScionKeyTermContractAttempts(entry.originalTerm, term, { definitionMin: 45 })
    : { term, assessment: rawAssessment, repairs: [] };
  term = merged.term;
  const assessment = assessSourceTerm(term, entry.sourceClaims.length);
  const issues = [...assessment.issues];
  const normalized = assessment.normalized;
  if (entry.excludedTerms.some((value) => value.toLowerCase() === normalized.term.toLowerCase())) {
    issues.push('duplicates-existing-term');
  }
  if (entry.originalTerm) {
    const original = normalizeScionKeyTerm(entry.originalTerm);
    for (const field of frozenFieldsForCase(entry)) {
      if (normalized[field] !== original[field]) issues.push(`changed-frozen-field:${field}`);
    }
  }
  return {
    eligible: issues.length === 0,
    issues: [...new Set(issues)],
    term,
    rawIssues: rawAssessment.issues,
    compilerRepairs: merged.repairs,
  };
}

export function buildScionKeyTermRecoveryMessages(entry, { attempt = 0, priorIssues = [] } = {}) {
  const source = entry.sourceClaims.map((text, index) => ({ index, text }));
  const task = entry.originalTerm
    ? entry.defectKind === 'correction-repeats-definition'
      ? [
          `Original keyTerm: ${JSON.stringify(entry.originalTerm)}`,
          `tr MUST remain exactly ${JSON.stringify(normalizeScionKeyTerm(entry.originalTerm).term)}. Re-author the complete atom from the source claims and replace cx with a direct refutation of mi in different wording. cx must not repeat df.`,
        ]
      : [
          `Original keyTerm: ${JSON.stringify(entry.originalTerm)}`,
          `tr MUST remain exactly ${JSON.stringify(normalizeScionKeyTerm(entry.originalTerm).term)}. Re-author the complete atom and replace sourceFactIndexes with one or more valid zero-based indexes from 0 through ${entry.sourceClaims.length - 1}.`,
        ]
    : [
        `Existing term names that cannot be repeated: ${JSON.stringify(entry.excludedTerms)}`,
        'Write one new source-grounded keyTerm. It must name a distinct concept supported by the numbered claims.',
      ];
  const retry =
    attempt > 0
      ? [
          `LOCAL ADMISSION RETRY ${attempt}: the previous output failed for ${priorIssues.join(', ') || 'unknown-contract-defect'}.`,
          'Return the complete corrected object now. Do not apologize or discuss the failure.',
          ...(priorIssues.some((issue) => issue === 'tr-length' || issue === 'changed-frozen-field:term') &&
          entry.originalTerm
            ? [`Required exact tr value: ${JSON.stringify(normalizeScionKeyTerm(entry.originalTerm).term)}.`]
            : []),
          ...(priorIssues.includes('source-fact-index')
            ? [
                'sourceFactIndexes is REQUIRED. Put it first in keyTerm and use [0], which is a valid supplied claim index.',
              ]
            : []),
          ...(priorIssues.includes('correction-repeats-definition')
            ? ['Begin cx with "The misconception fails because" and explain the contrast; do not copy df.']
            : []),
          ...(priorIssues.includes('circular-definition')
            ? [
                `df MUST begin exactly with "A process in which" and MUST NOT contain ${JSON.stringify(entry.originalTerm ? normalizeScionKeyTerm(entry.originalTerm).term : entry.lessonTitle)} within its first six words.`,
              ]
            : []),
        ]
      : [];
  return [
    {
      role: 'system',
      content:
        'You are CourseMapper Scion, a compact university subject-matter writer running locally. Use only the supplied claims. Return valid JSON immediately with no Markdown or commentary.',
    },
    {
      role: 'user',
      content: [
        `Lesson: ${entry.lessonTitle}`,
        `Numbered source claims: ${JSON.stringify(source)}`,
        ...task,
        'Return exactly {"keyTerm":{"sourceFactIndexes":[0],"tr":"...","df":"...","eg":"...","mi":"...","cx":"..."}}. sourceFactIndexes is required and comes first.',
        'Contract: df is 45-380 characters; eg, mi, and cx are each 12-300 characters; cx directly refutes mi and never repeats df; sourceFactIndexes cites only supplied claim indexes.',
        ...retry,
      ].join('\n\n'),
    },
  ];
}

export function recoveryCaseInputBinding(entry) {
  return {
    id: entry.id,
    campaign: entry.campaign,
    project: entry.project,
    promptId: entry.promptId,
    kernelId: entry.kernelId,
    lessonTitle: entry.lessonTitle,
    defectKind: entry.defectKind,
    originalIssues: entry.originalIssues,
    originalTerm: entry.originalTerm,
    excludedTerms: entry.excludedTerms,
    sourceClaims: entry.sourceClaims,
  };
}
