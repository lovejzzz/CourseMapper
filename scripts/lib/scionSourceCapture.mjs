import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { repairScionMcItem } from '../../src/lib/scionAnswerKeyAlignment.js';
import { repairScionKeyTermContract } from '../../src/lib/scionKeyTermContract.js';
import { assessScionKeyTerm, assessScionMcItem } from '../../src/lib/scionPreferenceGate.js';
import {
  canonicalScionCourseInput,
  deriveScionCourseGroup,
  scionCourseInputSha256,
  SHA256_PATTERN,
} from './scionCourseGroup.mjs';

export const SOURCE_CAPTURE_PROTOCOL = 'scion-source-grounded-atom-capture-v1';
export const SOURCE_RECOVERY_PROTOCOL = 'scion-source-compiler-recovery-v1';
export const SOURCE_PARTIAL_RECOVERY_PROTOCOL = 'scion-source-compiler-partial-recovery-v1';
export const SOURCE_TARGETED_ASSESSMENT_CONTRACT = 'scion-source-targeted-assessment-v1';
export const SOURCE_PROMPT_POLICY_V1 = 'source-atom-authoring-v1';
export const SOURCE_PROMPT_POLICY_V2 = 'source-atom-authoring-v2';
export const SOURCE_PROMPT_POLICY_V3 = 'source-atom-authoring-v3';
export const SOURCE_PROMPT_POLICY_V4 = 'source-atom-authoring-v4';

export const SOURCE_ATOM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mcItems: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          q: { type: 'string', minLength: 25, maxLength: 300 },
          op: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string', minLength: 5, maxLength: 95 },
          },
          ai: { type: 'integer', minimum: 0, maximum: 3 },
          ex: { type: 'string', minLength: 20, maxLength: 300 },
          sourceFactIndexes: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'integer', minimum: 0, maximum: 20 },
          },
        },
        required: ['q', 'op', 'ai', 'ex', 'sourceFactIndexes'],
      },
    },
    keyTerms: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tr: { type: 'string', minLength: 3, maxLength: 60 },
          df: { type: 'string', minLength: 45, maxLength: 380 },
          eg: { type: 'string', minLength: 12, maxLength: 300 },
          mi: { type: 'string', minLength: 12, maxLength: 300 },
          cx: { type: 'string', minLength: 12, maxLength: 300 },
          sourceFactIndexes: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'integer', minimum: 0, maximum: 20 },
          },
        },
        required: ['tr', 'df', 'eg', 'mi', 'cx', 'sourceFactIndexes'],
      },
    },
  },
  required: ['mcItems', 'keyTerms'],
};

export const SOURCE_RECOVERY_SCHEMA = {
  ...SOURCE_ATOM_SCHEMA,
  properties: {
    ...SOURCE_ATOM_SCHEMA.properties,
    mcItems: { ...SOURCE_ATOM_SCHEMA.properties.mcItems, minItems: 1, maxItems: 1 },
    keyTerms: { ...SOURCE_ATOM_SCHEMA.properties.keyTerms, minItems: 1, maxItems: 1 },
  },
};

function boundedAtomCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(2, Math.trunc(numeric))) : 0;
}

export function sourceRecoveryTarget(call) {
  const counts = call?.assessment?.counts || {};
  return {
    mcItems: 2 - boundedAtomCount(counts.admittedMcItems),
    keyTerms: 2 - boundedAtomCount(counts.admittedKeyTerms),
  };
}

export function buildSourcePartialRecoverySchema(target = {}) {
  const mcItems = boundedAtomCount(target.mcItems);
  const keyTerms = boundedAtomCount(target.keyTerms);
  if (mcItems + keyTerms === 0) throw new Error('Partial recovery requires at least one missing atom');
  return {
    ...SOURCE_ATOM_SCHEMA,
    properties: {
      ...SOURCE_ATOM_SCHEMA.properties,
      mcItems: { ...SOURCE_ATOM_SCHEMA.properties.mcItems, minItems: mcItems, maxItems: mcItems },
      keyTerms: { ...SOURCE_ATOM_SCHEMA.properties.keyTerms, minItems: keyTerms, maxItems: keyTerms },
    },
  };
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sourceCaptureSha256(value) {
  const serialized = typeof value === 'string' ? value : canonicalJson(value);
  return crypto
    .createHash('sha256')
    .update(serialized === undefined ? 'undefined' : serialized)
    .digest('hex');
}

export function sourceCaptureCompletedAt(calls = []) {
  const timestamps = calls
    .map((call) => {
      const startedAt = Date.parse(String(call?.startedAt || ''));
      if (!Number.isFinite(startedAt)) return null;
      const durationMs = Math.max(0, Number(call?.durationMs || 0));
      return new Date(startedAt + durationMs).toISOString();
    })
    .filter(Boolean)
    .sort();
  return timestamps.at(-1) || null;
}

export function sourceTextIssues(value, { kind = 'fact' } = {}) {
  const text = normalize(value);
  const issues = [];
  const minimum = kind === 'definition' ? 40 : 20;
  if (text.length < minimum) issues.push(`${kind}-too-short`);
  if (text.length > 700) issues.push(`${kind}-too-long`);
  if (!/[.!?]$/.test(text)) issues.push(`${kind}-missing-terminal-punctuation`);
  if (/\.{3}|…/.test(text)) issues.push(`${kind}-ellipsis-fragment`);
  if (/^(?:see:|for information\b|the rules to\b|this scheme\b|the forms of music\b)/i.test(text)) {
    issues.push(`${kind}-contextless-fragment`);
  }
  if (/^["“][^"”]{0,25}$/u.test(text) || /(?:^|\s)(?:vol\.|pp?\.|isbn)\b/i.test(text)) {
    issues.push(`${kind}-bibliographic-fragment`);
  }
  return [...new Set(issues)];
}

function selectedFacts(kernel, selection = {}) {
  const facts = Array.isArray(kernel?.facts) ? kernel.facts : [];
  const indexes = selection.factIndexes == null ? facts.map((_, index) => index) : selection.factIndexes;
  if (!Array.isArray(indexes) || indexes.length < 2) {
    throw new Error(`${kernel?.id || 'unknown-kernel'} must select at least two source facts`);
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new Error(`${kernel?.id || 'unknown-kernel'} repeats a source fact index`);
  }
  return indexes.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= facts.length) {
      throw new Error(`${kernel?.id || 'unknown-kernel'} has invalid source fact index ${index}`);
    }
    return { index, text: normalize(facts[index]?.text), anchor: facts[index]?.anchor || null };
  });
}

function compactKernel(kernel, selection) {
  const facts = selectedFacts(kernel, selection);
  const definition = normalize(kernel?.definition?.text);
  const issues = [
    ...sourceTextIssues(definition, { kind: 'definition' }),
    ...facts.flatMap((fact) => sourceTextIssues(fact.text, { kind: `fact-${fact.index}` })),
    ...(!normalize(kernel?.license) ? ['missing-license'] : []),
    ...(!Array.isArray(kernel?.attribution) || kernel.attribution.length === 0 ? ['missing-attribution'] : []),
  ];
  return {
    kernel: {
      id: normalize(kernel?.id),
      term: normalize(kernel?.term),
      definition,
      definitionAnchor: kernel?.definition?.anchor || null,
      facts,
      license: normalize(kernel?.license),
      attribution: (kernel?.attribution || []).map(normalize).filter(Boolean),
    },
    issues: [...new Set(issues)],
  };
}

export function buildSourceAtomPrompt(group, kernel, { promptPolicy = SOURCE_PROMPT_POLICY_V1 } = {}) {
  if (
    ![SOURCE_PROMPT_POLICY_V1, SOURCE_PROMPT_POLICY_V2, SOURCE_PROMPT_POLICY_V3, SOURCE_PROMPT_POLICY_V4].includes(
      promptPolicy,
    )
  ) {
    throw new Error(`Unsupported source prompt policy: ${promptPolicy}`);
  }
  const factList = [kernel.definition, ...kernel.facts.map((fact) => fact.text)];
  const sourceContext = {
    kernelId: kernel.id,
    term: kernel.term,
    claims: factList.map((text, index) => ({ index, text })),
    attribution: kernel.attribution,
    license: kernel.license,
  };
  return {
    id: `${group.id}:${kernel.id}`,
    kernelId: kernel.id,
    lessonTitle: kernel.term,
    system:
      'You are Scion, a compact college-course atom author. Use only the supplied source claims for factual content. Return the exact JSON contract. Do not mention the prompt, source packet, model, or review process.',
    user: [
      `Course brief: ${group.courseBrief}`,
      ...(group.qualityFocus ? [`Quality stress focus: ${group.qualityFocus}`] : []),
      `Source packet SHA-256: ${group.sourcePacketSha256}`,
      `Source kernel: ${JSON.stringify(sourceContext)}`,
      promptPolicy === SOURCE_PROMPT_POLICY_V4
        ? 'Write exactly two applied multiple-choice items and two key terms. For each MC item, write an applied q and four parallel, cue-free op alternatives under 80 characters each. Do not put letter, number, or bracketed list labels at either end of an option, and finish every option as a complete phrase. Exactly one option may be true under the cited claims; ai is its zero-based index. Keep the four options similarly specific and similar in length. Write ex as two complete sentences under 180 characters total: first support the option at ai, then correct the strongest distractor without naming an option label. For each key term, choose a precise course concept. df must be concise and must not begin with tr or repeat tr in its first six words. eg, mi, and cx must each be one complete sentence: eg is concrete, mi is genuinely false rather than a supplied claim, and cx directly corrects mi in fresh wording without repeating df. Use only the supplied claims. Never expose claim numbers, sourceFactIndexes, field names, source metadata, or review language in learner-facing q, op, ex, tr, df, eg, mi, or cx text. sourceFactIndexes must cite only the numbered claims actually used and appear only in that JSON field.'
        : promptPolicy === SOURCE_PROMPT_POLICY_V3
          ? 'Write exactly two applied multiple-choice items and two key terms. MC contract: q asks the learner to apply or distinguish the supplied claims; op contains four parallel alternatives under 80 characters each; no option begins or ends with a letter, number, bracketed list label, conjunction, preposition, determiner, or cut-off word; exactly one option is true under the cited claims; ai is its zero-based index. Keep all options similarly specific and similar in length. ex is exactly two complete sentences under 180 characters total: sentence one directly supports the option at ai, and sentence two corrects the strongest distractor without using an option label. Key-term contract: tr names a precise course concept; df is 45-160 characters and neither begins with tr nor repeats tr in its first six words; eg is a complete concrete sentence with an actor or object, an action, and an observable result; mi is one complete, genuinely false claim; cx directly refutes mi in fresh wording without copying df or a source claim. Never expose claim numbers, sourceFactIndexes, field names, source metadata, or review language in learner-facing q, op, ex, tr, df, eg, mi, or cx text. Do not infer intention, internal state, causation, absence, or policy from one observation. sourceFactIndexes must cite only the numbered claims actually used and appear only in that JSON field.'
          : promptPolicy === SOURCE_PROMPT_POLICY_V2
            ? 'Write exactly two applied multiple-choice items and two key terms. Each MC item needs four parallel, cue-free options with no A-D or 1-4 prefixes, one correct zero-based ai, and an explanation that contrasts the correct choice with the most plausible misconception. The first explanation sentence must uniquely support the option at ai; no other option may also be true under the cited claims. Never mention claim numbers, sourceFactIndexes, or source metadata in learner-facing q, op, ex, tr, df, eg, mi, or cx text. Balance stem-word overlap across all four options: the correct option must not be the only option that repeats two or more content words from the stem, and it must not be conspicuously longer. Treat capitalization-only variants as duplicate options. Do not infer a person’s intention, internal state, causation, absence, or policy conclusion from one observation; when the evidence is insufficient, make the evidence-limited answer explicit. Each key term needs a concise definition, a complete-sentence concrete course example, a genuinely false misconception that does not restate a supplied claim, and a correction in fresh wording. A definition must never begin with the term itself or repeat the full term within its first six words. sourceFactIndexes must cite the numbered claims actually used, but those indexes belong only in the JSON field.'
            : 'Write exactly two applied multiple-choice items and two key terms. Each MC item needs four parallel, cue-free options, one correct index, and an explanation that contrasts the correct choice with the most plausible misconception. Balance stem-word overlap across all four options: the correct option must not be the only option that repeats two or more content words from the stem, and it must not be conspicuously longer. Treat capitalization-only variants as duplicate options. Do not infer a person’s intention, internal state, causation, absence, or policy conclusion from one observation; when the evidence is insufficient, make the evidence-limited answer explicit. Each key term needs a concise definition, a concrete course-relevant example, a genuine misconception, and a correction. A definition must never begin with the term itself or repeat the full term within its first six words. sourceFactIndexes must cite the numbered claims actually used.',
    ].join('\n\n'),
    sourceClaims: factList,
    ...(promptPolicy !== SOURCE_PROMPT_POLICY_V1 ? { promptPolicy } : {}),
  };
}

export function buildSourceRecoveryPrompt(prompt, rawCall, { target = null } = {}) {
  const issues = Array.isArray(rawCall?.assessment?.issues) ? rawCall.assessment.issues : ['unknown-rejection'];
  const strictRecoveryRule =
    prompt.promptPolicy === SOURCE_PROMPT_POLICY_V4
      ? ' Never expose claim numbers, option labels, or field names in learner-facing text. Keep options under 80 characters and finish every field as a complete phrase or sentence.'
      : prompt.promptPolicy === SOURCE_PROMPT_POLICY_V3
        ? ' Never expose claim numbers, option labels, or field names in learner-facing text. Keep every option under 80 characters and end it with a complete content phrase. Every key-term example must state a concrete actor or object, action, and observable result. mi must be a complete false claim; cx must directly refute it without copying df or a source claim.'
        : prompt.promptPolicy === SOURCE_PROMPT_POLICY_V2
          ? ' Never expose claim numbers or field names in learner-facing text. Every key-term example must be a complete concrete sentence, and mi must be false rather than a paraphrase of a source claim.'
          : '';
  if (target) {
    const mcItems = boundedAtomCount(target.mcItems);
    const keyTerms = boundedAtomCount(target.keyTerms);
    const sourceContextUser = prompt.user.replace(/\n\nWrite exactly two applied multiple-choice items[\s\S]*$/u, '');
    if (prompt.promptPolicy === SOURCE_PROMPT_POLICY_V4) {
      const relevantIssues = [...new Set(issues)]
        .filter(
          (issue) =>
            (mcItems > 0 && (issue.startsWith('mc-') || issue === 'mc-count' || issue === 'no-admitted-mc-items')) ||
            (keyTerms > 0 &&
              (issue.startsWith('key-term-') || issue === 'key-term-count' || issue === 'no-admitted-key-terms')),
        )
        .slice(0, 8);
      const rules = [];
      if (mcItems > 0) {
        rules.push(
          'MC rule: use four parallel options under 80 characters with no leading or trailing labels. Exactly one option is true. ai is zero-based. ex has two complete sentences: support ai, then correct one distractor.',
        );
      }
      if (keyTerms > 0) {
        rules.push(
          'Key-term rule: df must not start with tr. eg is one concrete sentence. mi is one false sentence. cx directly corrects mi without copying df.',
        );
      }
      return {
        ...prompt,
        system: `${prompt.system}\n\nThis is a compiler recovery attempt. Re-author only the requested missing seats from the source claims; do not patch or discuss the prior response.`,
        user: [
          sourceContextUser,
          `Rejected-seat reasons: ${(relevantIssues.length ? relevantIssues : ['unknown-rejection']).join(', ')}.`,
          `Write exactly ${mcItems} multiple-choice item${mcItems === 1 ? '' : 's'} and ${keyTerms} key term${keyTerms === 1 ? '' : 's'}. Return an empty array for a zero target.`,
          ...rules,
          'Use only supplied claims. Put valid sourceFactIndexes only in that JSON field. Do not expose source or field metadata to learners.',
        ].join('\n\n'),
      };
    }
    return {
      ...prompt,
      system: `${prompt.system}\n\nThis is a compiler recovery attempt. Re-author only the missing atom seats from the source claims; do not patch or discuss the prior response.`,
      user: [
        sourceContextUser,
        `The deterministic compiler rejected some or all prior atoms for: ${issues.join(', ')}.`,
        `Recovery target: write exactly ${mcItems} multiple-choice item${mcItems === 1 ? '' : 's'} and exactly ${keyTerms} key term${keyTerms === 1 ? '' : 's'}. Return an empty array for a zero target.`,
        `Recovery rules: MC options must be four parallel, cue-free alternatives without letter or number prefixes. ai is a zero-based index and must point to the exact option defended by ex. Every explanation must be two complete sentences under 180 characters total: sentence one supports the keyed option and sentence two corrects only the strongest misconception. Every key term needs a precise definition, concrete example, genuine misconception, and a cx that directly corrects mi with new wording without repeating df. Use only supplied claims and cite valid sourceFactIndexes.${strictRecoveryRule}`,
      ].join('\n\n'),
    };
  }
  return {
    ...prompt,
    system: `${prompt.system}\n\nThis is a compiler recovery attempt. Re-author the complete object from the source claims; do not patch or discuss the prior response.`,
    user: [
      prompt.user,
      `The deterministic compiler rejected the prior attempt for: ${issues.join(', ')}.`,
      `Recovery rules: write exactly ONE applied multiple-choice item and ONE key term, even though the original request asked for two of each. Do not prefix options with letters or numbers. ai is a zero-based index and must point to the exact option defended by ex. The explanation must be two complete sentences under 180 characters total: sentence one supports the keyed option and sentence two corrects only the strongest misconception. The key term cx must directly correct mi with new wording and must not repeat df. Use only supplied claims and cite valid sourceFactIndexes.${strictRecoveryRule}`,
    ].join('\n\n'),
  };
}

export function parseSourceAtomResponse(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value || '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('source atom response did not contain a JSON object');
    return JSON.parse(match[0]);
  }
}

function validFactIndexes(indexes, sourceClaimCount) {
  return (
    Array.isArray(indexes) &&
    indexes.length > 0 &&
    indexes.every((index) => Number.isInteger(index) && index >= 0 && index < sourceClaimCount)
  );
}

export function assessSourceAtomResponse(
  value,
  {
    sourceClaimCount,
    sourceClaims = [],
    sourceTerm = '',
    semanticAdmission = true,
    semanticProfile = 'legacy',
    allowFirstSentenceLexicalCue = semanticAdmission,
    expectedCounts = null,
  },
) {
  const response = parseSourceAtomResponse(value);
  const sourceBoundSemanticProfile =
    semanticProfile === 'source-strict' ||
    semanticProfile === 'source-strict-v3' ||
    semanticProfile === 'source-strict-v4' ||
    semanticProfile === 'source-strict-v5' ||
    semanticProfile === 'source-strict-v6';
  const mcItems = Array.isArray(response?.mcItems) ? response.mcItems : [];
  const keyTerms = Array.isArray(response?.keyTerms) ? response.keyTerms : [];
  const expectedMcItems = expectedCounts ? boundedAtomCount(expectedCounts.mcItems) : 2;
  const expectedKeyTerms = expectedCounts ? boundedAtomCount(expectedCounts.keyTerms) : 2;
  const mcCandidates = mcItems.slice(0, expectedMcItems);
  const keyTermCandidates = keyTerms.slice(0, expectedKeyTerms);
  const issues = [];
  if (mcItems.length !== expectedMcItems) issues.push('mc-count');
  if (keyTerms.length !== expectedKeyTerms) issues.push('key-term-count');
  const mcAssessments = mcCandidates.map((item, index) => {
    const citedSourceClaims = validFactIndexes(item?.sourceFactIndexes, sourceClaimCount)
      ? [...new Set(item.sourceFactIndexes)].map((factIndex) => sourceClaims[factIndex]).filter(Boolean)
      : [];
    const assessment = assessScionMcItem(item, {
      sourceClaims: citedSourceClaims,
      semanticAdmission,
      semanticProfile,
      allowFirstSentenceLexicalCue,
    });
    const itemIssues = [...assessment.issues];
    if (!validFactIndexes(item?.sourceFactIndexes, sourceClaimCount)) itemIssues.push('source-fact-index');
    issues.push(...itemIssues.map((issue) => `mc-${index}-${issue}`));
    return { eligible: itemIssues.length === 0, issues: itemIssues };
  });
  const keyTermAssessments = keyTermCandidates.map((term, index) => {
    const citedSourceClaims = validFactIndexes(term?.sourceFactIndexes, sourceClaimCount)
      ? [...new Set(term.sourceFactIndexes)].map((factIndex) => sourceClaims[factIndex]).filter(Boolean)
      : [];
    const assessment = assessScionKeyTerm(term, {
      knownFacts: sourceBoundSemanticProfile && citedSourceClaims.length > 0 ? citedSourceClaims : sourceClaims,
      sourceTerm,
      semanticProfile,
    });
    const itemIssues = [...assessment.issues];
    if (!validFactIndexes(term?.sourceFactIndexes, sourceClaimCount)) itemIssues.push('source-fact-index');
    issues.push(...itemIssues.map((issue) => `key-term-${index}-${issue}`));
    return { eligible: itemIssues.length === 0, issues: itemIssues };
  });
  const admittedResponse = {
    mcItems: mcCandidates.filter((_, index) => mcAssessments[index]?.eligible),
    keyTerms: keyTermCandidates.filter((_, index) => keyTermAssessments[index]?.eligible),
  };
  if (expectedMcItems > 0 && admittedResponse.mcItems.length === 0) issues.push('no-admitted-mc-items');
  if (expectedKeyTerms > 0 && admittedResponse.keyTerms.length === 0) issues.push('no-admitted-key-terms');
  return {
    eligible: admittedResponse.mcItems.length + admittedResponse.keyTerms.length > 0,
    issues: [...new Set(issues)],
    response,
    admittedResponse,
    counts: {
      generatedMcItems: mcItems.length,
      admittedMcItems: admittedResponse.mcItems.length,
      generatedKeyTerms: keyTerms.length,
      admittedKeyTerms: admittedResponse.keyTerms.length,
    },
  };
}

export function mergeSourceRecoveryCall({ rawCall, recoveryCall, prompt }) {
  const raw = rawCall?.admittedResponse || { mcItems: [], keyTerms: [] };
  const recovered = recoveryCall?.admittedResponse || { mcItems: [], keyTerms: [] };
  const response = {
    mcItems: [...(raw.mcItems || []), ...(recovered.mcItems || [])].slice(0, 2),
    keyTerms: [...(raw.keyTerms || []), ...(recovered.keyTerms || [])].slice(0, 2),
  };
  const assessment = assessSourceAtomResponse(response, {
    sourceClaimCount: prompt.sourceClaims.length,
    sourceClaims: prompt.sourceClaims,
    sourceTerm: prompt.sourceTerm || prompt.lessonTitle,
  });
  return {
    promptId: rawCall.promptId,
    kernelId: rawCall.kernelId,
    promptSha256: rawCall.promptSha256,
    generationPromptSha256: recoveryCall.generationPromptSha256,
    rawCallSha256: sourceCaptureSha256(rawCall),
    recoveryCallSha256: sourceCaptureSha256(recoveryCall),
    response,
    responseSha256: sourceCaptureSha256(response),
    admittedResponse: assessment.admittedResponse,
    admittedResponseSha256: sourceCaptureSha256(assessment.admittedResponse),
    assessment: { eligible: assessment.eligible, issues: assessment.issues, counts: assessment.counts },
    receipt: {
      provider: 'scion-compiler',
      action: 'merge-admitted-raw-and-recovery-atoms',
      recoveryProvider: recoveryCall?.receipt?.provider || null,
      recoveryConstrained: recoveryCall?.receipt?.constrained || null,
    },
    startedAt: recoveryCall.startedAt,
    durationMs: recoveryCall.durationMs,
  };
}

/**
 * Recompile retained source-capture bytes through the current conservative MC
 * repair passes without mutating the historical capture. The caller persists
 * the returned repair receipts beside a derived project so every changed byte
 * remains traceable to the exact raw atom and deterministic action.
 */
export function compileSourceAtomResponse(
  value,
  {
    sourceClaimCount,
    sourceClaims = [],
    sourceTerm = '',
    lessonId = '',
    semanticAdmission = true,
    semanticProfile = 'legacy',
    allowFirstSentenceLexicalCue = semanticAdmission,
  },
) {
  const response = parseSourceAtomResponse(value);
  const repairs = [];
  const compiledResponse = {
    ...response,
    mcItems: (Array.isArray(response?.mcItems) ? response.mcItems : []).map((item, itemIndex) => {
      const citedSourceClaims = validFactIndexes(item?.sourceFactIndexes, sourceClaimCount)
        ? [...new Set(item.sourceFactIndexes)].map((factIndex) => sourceClaims[factIndex]).filter(Boolean)
        : [];
      const compiled = repairScionMcItem(item, {
        lessonId,
        itemIndex,
        sourceClaims: citedSourceClaims,
        strictSourceAlignment: semanticProfile === 'strict',
        keyConflictOptions: { allowFirstSentenceLexicalCue },
      });
      repairs.push(...compiled.repairs.map((repair) => ({ ...repair, sourceFactIndexes: item.sourceFactIndexes })));
      return compiled.item;
    }),
    keyTerms: (Array.isArray(response?.keyTerms) ? response.keyTerms : []).map((term, termIndex) => {
      const compiled = repairScionKeyTermContract(term, {
        knownFacts: sourceClaims,
        sourceTerm,
        semanticProfile,
      });
      repairs.push(
        ...compiled.repairs.map((repair) => ({
          ...repair,
          termIndex,
          sourceFactIndexes: term.sourceFactIndexes,
        })),
      );
      return compiled.term;
    }),
  };
  const assessment = assessSourceAtomResponse(compiledResponse, {
    sourceClaimCount,
    sourceClaims,
    sourceTerm,
    semanticAdmission,
    semanticProfile,
    allowFirstSentenceLexicalCue,
  });
  return {
    ...assessment,
    rawResponse: response,
    compiledResponse,
    repairs,
    repairCounts: {
      total: repairs.length,
      incompleteExplanationTail: repairs.filter((repair) => repair.pass === 'incompleteExplanationTail').length,
      explanationKeyAlignment: repairs.filter((repair) => repair.pass === 'explanationKeyAlignment').length,
      sourceAnswerAlignment: repairs.filter((repair) => repair.pass === 'sourceAnswerAlignment').length,
      redundantDefinitionLead: repairs.filter((repair) => repair.pass === 'redundantDefinitionLead').length,
    },
  };
}

export function summarizeSourceCaptureBurden({ calls = [], expectedCalls = 0, expectedAtoms = 0 } = {}) {
  const generatedAtoms = calls.reduce(
    (sum, call) =>
      sum +
      Number(call?.assessment?.counts?.generatedMcItems || 0) +
      Number(call?.assessment?.counts?.generatedKeyTerms || 0),
    0,
  );
  const admittedAtoms = calls.reduce(
    (sum, call) =>
      sum +
      Number(call?.assessment?.counts?.admittedMcItems || 0) +
      Number(call?.assessment?.counts?.admittedKeyTerms || 0),
    0,
  );
  const discardedGeneratedAtoms = Math.max(0, generatedAtoms - admittedAtoms);
  const missingExpectedAtoms = Math.max(0, expectedAtoms - generatedAtoms);
  const burdenAtoms = discardedGeneratedAtoms + missingExpectedAtoms;
  const issueHistogram = {};
  for (const call of calls) {
    for (const issue of call?.assessment?.issues || []) issueHistogram[issue] = (issueHistogram[issue] || 0) + 1;
  }
  return {
    expectedCalls,
    capturedCalls: calls.length,
    eligibleCalls: calls.filter((call) => call?.assessment?.eligible).length,
    fullPassCalls: calls.filter((call) => call?.assessment?.eligible && (call?.assessment?.issues || []).length === 0)
      .length,
    partialCalls: calls.filter((call) => call?.assessment?.eligible && (call?.assessment?.issues || []).length > 0)
      .length,
    rejectedCalls: calls.filter((call) => !call?.assessment?.eligible).length,
    expectedAtoms,
    generatedAtoms,
    admittedAtoms,
    discardedGeneratedAtoms,
    missingExpectedAtoms,
    burdenAtoms,
    burdenRate: expectedAtoms > 0 ? Number((burdenAtoms / expectedAtoms).toFixed(6)) : null,
    admissionRate: expectedAtoms > 0 ? Number((admittedAtoms / expectedAtoms).toFixed(6)) : null,
    issueHistogram: Object.fromEntries(
      Object.entries(issueHistogram).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export async function materializeSourceCaptureCampaign({
  manifestPath = 'evaluation/scion-source-capture-campaign.json',
  cwd = process.cwd(),
  sourceSnapshots = {},
} = {}) {
  const absoluteManifest = path.resolve(cwd, manifestPath);
  const manifestRaw = await fs.readFile(absoluteManifest, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  if (manifest.protocol !== SOURCE_CAPTURE_PROTOCOL) {
    throw new Error(`Unsupported Scion source-capture protocol: ${manifest.protocol || 'missing'}`);
  }
  const promptPolicy = manifest.promptPolicy || SOURCE_PROMPT_POLICY_V1;
  if (
    ![SOURCE_PROMPT_POLICY_V1, SOURCE_PROMPT_POLICY_V2, SOURCE_PROMPT_POLICY_V3, SOURCE_PROMPT_POLICY_V4].includes(
      promptPolicy,
    )
  ) {
    throw new Error(`Unsupported source prompt policy: ${promptPolicy}`);
  }
  const groups = [];
  const groupIds = new Set();
  for (const entry of manifest.groups || []) {
    if (groupIds.has(entry.id)) throw new Error(`Duplicate Scion source-capture group: ${entry.id}`);
    groupIds.add(entry.id);
    const sourcePath = path.resolve(cwd, entry.sourceFile || '');
    const logicalSourceFile = path.relative(cwd, sourcePath);
    const snapshotPath = sourceSnapshots[logicalSourceFile] || sourceSnapshots[entry.sourceFile];
    const sourceArtifactPath = snapshotPath ? path.resolve(cwd, snapshotPath) : sourcePath;
    const sourceRaw = await fs.readFile(sourceArtifactPath, 'utf8');
    const source = JSON.parse(sourceRaw);
    const kernelMap = new Map((source.kernels || []).map((kernel) => [kernel.id, kernel]));
    const selected = (entry.kernels || []).map((selection) => {
      const sourceKernel = kernelMap.get(selection.id);
      if (!sourceKernel) throw new Error(`${entry.id} references missing kernel ${selection.id}`);
      return compactKernel(sourceKernel, selection);
    });
    const issues = selected.flatMap((row) => row.issues.map((issue) => `${row.kernel.id}:${issue}`));
    if (issues.length > 0) throw new Error(`${entry.id} source quality failed: ${issues.join(', ')}`);
    const sourcePacket = {
      schemaVersion: 1,
      sourceFile: logicalSourceFile,
      sourceArtifactSha256: sourceCaptureSha256(sourceRaw),
      kernels: selected.map((row) => row.kernel),
    };
    const sourcePacketSha256 = sourceCaptureSha256(sourcePacket);
    const courseBrief = normalize(entry.courseBrief);
    const qualityFocus = normalize(entry.qualityFocus);
    if (qualityFocus && (qualityFocus.length < 80 || qualityFocus.length > 700)) {
      throw new Error(`${entry.id} must declare an 80-700 character qualityFocus`);
    }
    const fileNames = [`source-packet-${sourcePacketSha256}.json`];
    const courseInput = canonicalScionCourseInput({ promptText: courseBrief, fileNames, sourcePacketSha256 });
    const courseInputSha256 = scionCourseInputSha256(courseInput);
    const courseGroup = deriveScionCourseGroup({
      domain: entry.domain,
      courseGroupId: entry.id,
      courseInputSha256,
    });
    const group = {
      id: courseGroup.id,
      title: normalize(entry.title),
      domain: normalize(entry.domain).toLowerCase(),
      courseBrief: courseInput.promptText,
      qualityFocus,
      fileNames: courseInput.fileNames,
      courseInputSha256,
      courseGroupSha256: courseGroup.sha256,
      courseGroupSource: courseGroup.source,
      sourcePacket,
      sourcePacketSha256,
    };
    groups.push({
      ...group,
      prompts: group.sourcePacket.kernels.map((kernel) => buildSourceAtomPrompt(group, kernel, { promptPolicy })),
    });
  }
  const domains = [...new Set(groups.map((group) => group.domain))].sort();
  const domainGroupCounts = Object.fromEntries(
    domains.map((domain) => [domain, groups.filter((group) => group.domain === domain).length]),
  );
  const balancedGroupCounts = new Set(Object.values(domainGroupCounts));
  const coveragePolicy = manifest.coveragePolicy || {
    protocol: 'scion-source-capture-four-domain-balance-v1',
    domains: 4,
  };
  const targetedGap = coveragePolicy.protocol === 'scion-source-capture-targeted-domain-gap-v1';
  const expectedDomains = targetedGap
    ? [...new Set((coveragePolicy.domains || []).map((domain) => normalize(domain).toLowerCase()))].sort()
    : [];
  const coverageValid = targetedGap
    ? expectedDomains.length >= 1 &&
      canonicalJson(domains) === canonicalJson(expectedDomains) &&
      balancedGroupCounts.size === 1 &&
      [...balancedGroupCounts][0] >= 1
    : coveragePolicy.protocol === 'scion-source-capture-four-domain-balance-v1' &&
      domains.length === 4 &&
      balancedGroupCounts.size === 1 &&
      [...balancedGroupCounts][0] >= 1;
  if (!coverageValid) {
    throw new Error(
      `Source capture violates ${coveragePolicy.protocol || 'missing-coverage-policy'}: ${JSON.stringify(domainGroupCounts)}`,
    );
  }
  const promptSetSha256 = sourceCaptureSha256(
    groups.flatMap((group) =>
      group.prompts.map((prompt) => ({ id: prompt.id, system: prompt.system, user: prompt.user })),
    ),
  );
  return {
    protocol: SOURCE_CAPTURE_PROTOCOL,
    manifestPath: path.relative(cwd, absoluteManifest),
    manifestSha256: sourceCaptureSha256(manifestRaw),
    promptSetSha256,
    groups,
    summary: {
      groups: groups.length,
      domains,
      domainGroupCounts,
      coveragePolicy,
      ...(manifest.promptPolicy ? { promptPolicy } : {}),
      prompts: groups.reduce((sum, group) => sum + group.prompts.length, 0),
      expectedCandidates: groups.reduce((sum, group) => sum + group.prompts.length * 4, 0),
      sourceQualityStatus: 'pass',
      claimBoundary: manifest.claimBoundary,
    },
  };
}

export function sourceGroupMinimumAdmittedPrompts(group) {
  return Math.min(2, Math.max(1, Number(group?.prompts?.length || 0)));
}

function compileSourceCaptureGraph(group, calls, arm = 'unknown') {
  const byPromptId = new Map(calls.map((call) => [call.promptId, call]));
  const sessions = [];
  const lessonContent = {};
  const admittedPromptIds = [];
  const rejectedPromptIds = [];
  for (const prompt of group.prompts) {
    const call = byPromptId.get(prompt.id);
    if (!call) throw new Error(`${group.id} is missing ${arm} call ${prompt.id}`);
    if (!call.assessment?.eligible) {
      rejectedPromptIds.push(prompt.id);
      continue;
    }
    admittedPromptIds.push(prompt.id);
    const lessonNumber = admittedPromptIds.length;
    const lessonId = `lesson-${lessonNumber}`;
    sessions.push({ number: lessonNumber, title: prompt.lessonTitle });
    const admitted = call.admittedResponse || call.response;
    lessonContent[lessonId] = {
      quizItems: admitted.mcItems.map((item) => ({ ...item, type: 'multiple_choice' })),
      keyTerms: admitted.keyTerms,
    };
  }
  const minimumAdmittedPrompts = sourceGroupMinimumAdmittedPrompts(group);
  if (admittedPromptIds.length < minimumAdmittedPrompts) {
    throw new Error(`${group.id} ${arm} needs at least ${minimumAdmittedPrompts} admitted source prompts`);
  }
  const graph = {
    schemaVersion: 1,
    title: group.title,
    sessions,
    enrichmentOverlay: { lessonContent },
  };
  return { graph, admittedPromptIds, rejectedPromptIds };
}

export function buildSourceCaptureProject({
  campaign,
  group,
  arm,
  model,
  calls,
  rawCalls = calls,
  recoveryCalls = [],
  recoveryProtocol = SOURCE_RECOVERY_PROTOCOL,
  generatedAt,
}) {
  const { graph, admittedPromptIds, rejectedPromptIds } = compileSourceCaptureGraph(group, calls, arm);
  const completedAt = generatedAt || sourceCaptureCompletedAt(calls);
  if (!completedAt) throw new Error(`${group.id} ${arm} is missing a stable capture completion time`);
  const modelSha256 = sourceCaptureSha256(model);
  return {
    formatVersion: 'scion-source-capture-project-v1',
    projectId: `scion-source-capture-${group.id}-${arm}`,
    provider: model.provider,
    modelId: model.id,
    modelName: model.name,
    promptText: group.courseBrief,
    fileNames: group.fileNames,
    sourcePacketSha256: group.sourcePacketSha256,
    lessonScope: { type: 'all' },
    hasGenerated: true,
    courseGraphJson: JSON.stringify(graph),
    savedAt: completedAt,
    scionSourceCapture: {
      protocol: SOURCE_CAPTURE_PROTOCOL,
      arm,
      campaignManifest: campaign.manifestPath,
      campaignManifestSha256: campaign.manifestSha256,
      promptSetSha256: campaign.promptSetSha256,
      courseInputSha256: group.courseInputSha256,
      courseGroupId: group.id,
      courseGroupSha256: group.courseGroupSha256,
      sourcePacket: group.sourcePacket,
      sourcePacketSha256: group.sourcePacketSha256,
      model,
      modelSha256,
      completedAt,
      admittedPromptIds,
      rejectedPromptIds,
      compilerRecovery: {
        protocol: recoveryProtocol,
        rawCalls,
        recoveryCalls,
        recoveredPromptIds: recoveryCalls
          .filter((call) => call?.assessment?.eligible)
          .map((call) => call.promptId)
          .sort(),
      },
      calls,
    },
  };
}

function verifyCapturedCall(call, prompt, generationPrompt = prompt, { admissionMode = 'current' } = {}) {
  const issues = [];
  if (call?.kernelId !== prompt.kernelId) issues.push(`kernel-id-mismatch:${call?.promptId || 'missing'}`);
  const basePromptSha256 = sourceCaptureSha256({ system: prompt.system, user: prompt.user });
  if (call?.promptSha256 !== basePromptSha256) issues.push(`prompt-digest-mismatch:${call?.promptId || 'missing'}`);
  const generationPromptSha256 = sourceCaptureSha256({
    system: generationPrompt.system,
    user: generationPrompt.user,
  });
  if ((call?.generationPromptSha256 || call?.promptSha256) !== generationPromptSha256) {
    issues.push(`generation-prompt-digest-mismatch:${call?.promptId || 'missing'}`);
  }
  if (!call?.response) {
    if (call?.assessment?.eligible) issues.push(`missing-eligible-response:${call?.promptId || 'missing'}`);
    if (
      canonicalJson(call?.assessment?.counts) !==
      canonicalJson({ generatedMcItems: 0, admittedMcItems: 0, generatedKeyTerms: 0, admittedKeyTerms: 0 })
    ) {
      issues.push(`missing-response-count-mismatch:${call?.promptId || 'missing'}`);
    }
    if (
      !(call?.assessment?.issues || []).some((issue) => ['model-call-failed', 'invalid-model-response'].includes(issue))
    ) {
      issues.push(`missing-response-rejection-reason:${call?.promptId || 'missing'}`);
    }
    return { issues, eligible: false };
  }
  if (call.responseSha256 !== sourceCaptureSha256(call.response)) {
    issues.push(`response-digest-mismatch:${call.promptId}`);
  }
  // Immutable capture packets retain the admission decision produced by the
  // historical gate. Later compiler research may intentionally tighten that
  // gate; `captured` mode verifies the retained response/admission bytes and
  // project topology without pretending the new implementation was the old
  // one. Callers must separately bind the whole project to a frozen receipt.
  if (admissionMode === 'captured') {
    if (call.admittedResponseSha256 !== sourceCaptureSha256(call.admittedResponse)) {
      issues.push(`admitted-response-digest-mismatch:${call.promptId}`);
    }
    if (!call.assessment || typeof call.assessment.eligible !== 'boolean') {
      issues.push(`missing-captured-assessment:${call.promptId}`);
    }
    return { issues, eligible: Boolean(call.assessment?.eligible) };
  }
  const assessment = assessSourceAtomResponse(call.response, {
    sourceClaimCount: prompt.sourceClaims.length,
    sourceClaims: prompt.sourceClaims,
    sourceTerm: prompt.sourceTerm || prompt.lessonTitle,
    ...(call.assessmentContract === SOURCE_TARGETED_ASSESSMENT_CONTRACT && call.recoveryTarget
      ? { expectedCounts: call.recoveryTarget }
      : {}),
  });
  if (Boolean(call.assessment?.eligible) !== assessment.eligible) {
    issues.push(`assessment-status-mismatch:${call.promptId}`);
  }
  if (
    canonicalJson(call.assessment) !==
    canonicalJson({ eligible: assessment.eligible, issues: assessment.issues, counts: assessment.counts })
  ) {
    issues.push(`assessment-content-mismatch:${call.promptId}`);
  }
  if (call.admittedResponseSha256 !== sourceCaptureSha256(assessment.admittedResponse)) {
    issues.push(`admitted-response-digest-mismatch:${call.promptId}`);
  }
  if (canonicalJson(call.admittedResponse) !== canonicalJson(assessment.admittedResponse)) {
    issues.push(`admitted-response-content-mismatch:${call.promptId}`);
  }
  return { issues, eligible: assessment.eligible };
}

export function verifySourceCaptureProject(
  project,
  { campaign, group, arm, model: expectedModel = null, admissionMode = 'current' },
) {
  const issues = [];
  if (!['current', 'captured'].includes(admissionMode)) issues.push('invalid-admission-verification-mode');
  const capture = project?.scionSourceCapture || {};
  const expectedProjectId = `scion-source-capture-${group.id}-${arm}`;
  const expectedFileNames = group.fileNames;
  if (project?.formatVersion !== 'scion-source-capture-project-v1') issues.push('format-version-mismatch');
  if (project?.projectId !== expectedProjectId) issues.push('project-id-mismatch');
  if (project?.promptText !== group.courseBrief) issues.push('course-brief-mismatch');
  if (canonicalJson(project?.fileNames) !== canonicalJson(expectedFileNames)) issues.push('source-file-list-mismatch');
  if (canonicalJson(project?.lessonScope) !== canonicalJson({ type: 'all' })) issues.push('lesson-scope-mismatch');
  if (project?.hasGenerated !== true) issues.push('generated-state-mismatch');
  if (capture.protocol !== SOURCE_CAPTURE_PROTOCOL) issues.push('protocol-mismatch');
  if (capture.arm !== arm) issues.push('arm-mismatch');
  if (capture.campaignManifest !== campaign.manifestPath) issues.push('campaign-path-mismatch');
  if (capture.campaignManifestSha256 !== campaign.manifestSha256) issues.push('campaign-digest-mismatch');
  if (capture.promptSetSha256 !== campaign.promptSetSha256) issues.push('prompt-set-digest-mismatch');
  if (capture.courseInputSha256 !== group.courseInputSha256) issues.push('course-input-digest-mismatch');
  if (capture.courseGroupId !== group.id) issues.push('course-group-id-mismatch');
  if (capture.courseGroupSha256 !== group.courseGroupSha256) issues.push('course-group-digest-mismatch');
  if (capture.sourcePacketSha256 !== group.sourcePacketSha256) issues.push('source-packet-digest-mismatch');
  if (sourceCaptureSha256(capture.sourcePacket) !== group.sourcePacketSha256)
    issues.push('source-packet-content-mismatch');
  if (project?.sourcePacketSha256 !== group.sourcePacketSha256) issues.push('project-source-packet-mismatch');
  if (!SHA256_PATTERN.test(String(capture.sourcePacketSha256 || ''))) issues.push('invalid-source-packet-digest');
  if (capture.modelSha256 !== sourceCaptureSha256(capture.model)) issues.push('model-digest-mismatch');
  if (expectedModel && canonicalJson(capture.model) !== canonicalJson(expectedModel))
    issues.push('model-identity-mismatch');
  if (project?.provider !== capture.model?.provider) issues.push('project-provider-mismatch');
  if (project?.modelId !== capture.model?.id) issues.push('project-model-id-mismatch');
  if (project?.modelName !== capture.model?.name) issues.push('project-model-name-mismatch');
  if (project?.savedAt !== capture.completedAt) issues.push('capture-time-mismatch');
  const stableCompletedAt = sourceCaptureCompletedAt(capture.calls || []);
  if (stableCompletedAt && capture.completedAt !== stableCompletedAt) issues.push('unstable-capture-time');
  const compilerRecovery = capture.compilerRecovery || {
    protocol: SOURCE_RECOVERY_PROTOCOL,
    rawCalls: capture.calls || [],
    recoveryCalls: [],
    recoveredPromptIds: [],
  };
  const partialRecovery = compilerRecovery.protocol === SOURCE_PARTIAL_RECOVERY_PROTOCOL;
  if (![SOURCE_RECOVERY_PROTOCOL, SOURCE_PARTIAL_RECOVERY_PROTOCOL].includes(compilerRecovery.protocol)) {
    issues.push('recovery-protocol-mismatch');
  }
  const rawCalls = compilerRecovery.rawCalls || [];
  const recoveryCalls = compilerRecovery.recoveryCalls || [];
  const effectiveCalls = capture.calls || [];
  const expectedCallIds = group.prompts.map((prompt) => prompt.id).sort();
  const inventory = (calls, label, expectedIds = null) => {
    const ids = calls.map((call) => call?.promptId);
    if (new Set(ids).size !== ids.length) issues.push(`duplicate-${label}-call-id`);
    if (expectedIds && canonicalJson([...ids].sort()) !== canonicalJson(expectedIds)) {
      issues.push(`${label}-call-inventory-mismatch`);
    }
  };
  inventory(rawCalls, 'raw', expectedCallIds);
  inventory(recoveryCalls, 'recovery');
  inventory(effectiveCalls, 'effective', expectedCallIds);
  const rawByPrompt = new Map(rawCalls.map((call) => [call.promptId, call]));
  const recoveryByPrompt = new Map(recoveryCalls.map((call) => [call.promptId, call]));
  const effectiveByPrompt = new Map(effectiveCalls.map((call) => [call.promptId, call]));
  for (const prompt of group.prompts) {
    const rawCall = rawByPrompt.get(prompt.id);
    if (!rawCall) continue;
    issues.push(
      ...verifyCapturedCall(rawCall, prompt, prompt, { admissionMode }).issues.map((issue) => `raw-${issue}`),
    );
    const recoveryCall = recoveryByPrompt.get(prompt.id);
    if (recoveryCall) {
      const target = partialRecovery ? sourceRecoveryTarget(rawCall) : null;
      if (!partialRecovery && rawCall.assessment?.eligible) issues.push(`recovery-for-eligible-call:${prompt.id}`);
      if (partialRecovery && target.mcItems + target.keyTerms === 0) {
        issues.push(`recovery-for-full-pass-call:${prompt.id}`);
      }
      if (recoveryCall.response) {
        const expectedMcItems = partialRecovery ? target.mcItems : 1;
        const expectedKeyTerms = partialRecovery ? target.keyTerms : 1;
        if (recoveryCall.response.mcItems?.length !== expectedMcItems) {
          issues.push(`recovery-mc-count-mismatch:${prompt.id}`);
        }
        if (recoveryCall.response.keyTerms?.length !== expectedKeyTerms) {
          issues.push(`recovery-key-term-count-mismatch:${prompt.id}`);
        }
      }
      if (recoveryCall.rawCallSha256 !== sourceCaptureSha256(rawCall)) {
        issues.push(`recovery-raw-call-digest-mismatch:${prompt.id}`);
      }
      if (partialRecovery && canonicalJson(recoveryCall.recoveryTarget) !== canonicalJson(target)) {
        issues.push(`recovery-target-mismatch:${prompt.id}`);
      }
      const recoveryPrompt = buildSourceRecoveryPrompt(prompt, rawCall, partialRecovery ? { target } : {});
      issues.push(
        ...verifyCapturedCall(recoveryCall, prompt, recoveryPrompt, { admissionMode }).issues.map(
          (issue) => `recovery-${issue}`,
        ),
      );
    }
    const expectedEffective = partialRecovery
      ? recoveryCall
        ? mergeSourceRecoveryCall({ rawCall, recoveryCall, prompt })
        : rawCall
      : rawCall.assessment?.eligible
        ? rawCall
        : recoveryCall || rawCall;
    if (canonicalJson(effectiveByPrompt.get(prompt.id)) !== canonicalJson(expectedEffective)) {
      issues.push(`effective-call-mismatch:${prompt.id}`);
    }
  }
  const expectedRecoveredPromptIds = recoveryCalls
    .filter((call) => call?.assessment?.eligible)
    .map((call) => call.promptId)
    .sort();
  if (canonicalJson(compilerRecovery.recoveredPromptIds) !== canonicalJson(expectedRecoveredPromptIds)) {
    issues.push('recovered-prompt-list-mismatch');
  }
  const expectedAdmittedPromptIds = [];
  const expectedRejectedPromptIds = [];
  for (const call of effectiveCalls) {
    const prompt = group.prompts.find((item) => item.id === call?.promptId);
    if (!prompt) {
      issues.push(`unknown-call:${call?.promptId || 'missing'}`);
      continue;
    }
    const rawCall = rawByPrompt.get(prompt.id);
    const recoveryPrompt =
      rawCall && recoveryByPrompt.has(prompt.id) && (partialRecovery || !rawCall.assessment?.eligible)
        ? buildSourceRecoveryPrompt(prompt, rawCall, partialRecovery ? { target: sourceRecoveryTarget(rawCall) } : {})
        : prompt;
    const verification = verifyCapturedCall(call, prompt, recoveryPrompt, { admissionMode });
    issues.push(...verification.issues);
    (verification.eligible ? expectedAdmittedPromptIds : expectedRejectedPromptIds).push(call.promptId);
  }
  if (effectiveCalls.length !== group.prompts.length) issues.push('call-count-mismatch');
  const inGroupOrder = (ids) => group.prompts.map((prompt) => prompt.id).filter((id) => ids.includes(id));
  if (canonicalJson(capture.admittedPromptIds) !== canonicalJson(inGroupOrder(expectedAdmittedPromptIds))) {
    issues.push('admitted-prompt-list-mismatch');
  }
  if (canonicalJson(capture.rejectedPromptIds) !== canonicalJson(inGroupOrder(expectedRejectedPromptIds))) {
    issues.push('rejected-prompt-list-mismatch');
  }
  if (expectedAdmittedPromptIds.length < sourceGroupMinimumAdmittedPrompts(group)) {
    issues.push('insufficient-admitted-prompts');
  }
  try {
    const graph = JSON.parse(project?.courseGraphJson || '{}');
    const expected = compileSourceCaptureGraph(group, capture.calls || [], arm).graph;
    if (canonicalJson(graph) !== canonicalJson(expected)) issues.push('project-graph-content-mismatch');
  } catch {
    issues.push('invalid-project-graph');
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}
