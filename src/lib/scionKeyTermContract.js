// Lightweight, model-neutral key-term admission shared by the production
// parser, browser-local retry loop, and Scion preference gate. Passing this
// contract proves structural completeness only; factual correctness remains a
// separate benchmark/judge responsibility.

const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;

const NON_LATIN_SCRIPT_RE = /[^\u0000-\u024f\u1e00-\u1eff]/u;

const EMBEDDED_FIELD_LABEL_RE = /\b(?:definition|example|misconception|correction)\s*:/i;
const CLAIM_MARKER_RESIDUE_RE =
  /(?:[.!?]\s*\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]|\(?\s*claims?\s*#?\s*\d+(?:\s*[,–-]\s*\d+)*\s*\)?[.!?]?)\s*$/i;
const MISCONCEPTION_CUE_RE =
  /^(?:believing|thinking|assuming|the idea|the belief|students? (?:believe|think|assume))\s+(?:that\s+)?/i;
const NEGATION_RE = /\b(?:not|never|none|cannot|can't|no)\b/i;
const MISCONCEPTION_CONTRAST_RE =
  /\b(?:not|never|always|only|all|none|every|must|cannot|can't|exactly|identical|equally|entirely|solely)\b/i;
const PLACEHOLDER_EXAMPLE_RE =
  /\b(?:lorem ipsum|tbd|todo|insert .{0,40} here|as (?:a|an) [^,.;]{1,30},? i want x so that y)\b/i;
const PRECISE_SOURCE_HEDGE_RE = /\b(?:about|approximately|roughly)\b/i;
const SOURCE_TERM_STOP_WORDS = new Set(
  'a an and are as at be by for from in into is it its of on or the to with'.split(' '),
);
const REPETITION_STOP_WORDS = new Set(
  'a an and are as at be because been being both but by can could did do does each for from had has have if in into is it its may more most must of on one or other should so than that the their then there these they this those through to true two under when where which while with would your'.split(
    ' ',
  ),
);

function comparableScionKeyTermText(value) {
  return (
    cleanScionKeyTermText(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? ''
  );
}

function comparableScionKeyTermTokens(value) {
  return new Set(
    comparableScionKeyTermText(value)
      .split(' ')
      .filter((token) => token && (token.length > 2 || /^\d+$/.test(token)) && !REPETITION_STOP_WORDS.has(token)),
  );
}

function repeatsScionKeyTermField(left, right) {
  const comparableLeft = comparableScionKeyTermText(left);
  const comparableRight = comparableScionKeyTermText(right);
  const shorterLength = Math.min(comparableLeft.length, comparableRight.length);
  if (shorterLength < 28) return false;
  if (comparableLeft.includes(comparableRight) || comparableRight.includes(comparableLeft)) return true;

  const leftTokens = comparableScionKeyTermTokens(left);
  const rightTokens = comparableScionKeyTermTokens(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const containment = intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return containment >= 0.84 && intersection / Math.max(1, union) >= 0.66;
}

function misconceptionRestatesKnownFact(misconception, knownFacts, { strict = false, compact = false } = {}) {
  const candidate = cleanScionKeyTermText(misconception).replace(MISCONCEPTION_CUE_RE, '');
  if (candidate.length < 24) return false;
  if (!strict && MISCONCEPTION_CONTRAST_RE.test(candidate)) return false;
  const candidateTokens = comparableScionKeyTermTokens(candidate);
  return knownFacts.some((fact) => {
    // A real polarity reversal is a plausible misconception even when most
    // vocabulary comes from the source. Mere absolutist wording ("always" or
    // "only") is not an exemption when the source states the same rule.
    if (strict && NEGATION_RE.test(candidate) !== NEGATION_RE.test(fact)) return false;
    if (strict && /\b(?:must\b[^.]{0,80}\bevery|always)\b/i.test(candidate) && /\bnot\s+every\b/i.test(fact)) {
      return false;
    }
    const factTokens = comparableScionKeyTermTokens(fact);
    const intersection = [...candidateTokens].filter((token) => factTokens.has(token)).length;
    const containment = intersection / Math.max(1, Math.min(candidateTokens.size, factTokens.size));
    const union = new Set([...candidateTokens, ...factTokens]).size;
    // A source fact and a purported misconception can share vocabulary for a
    // legitimate contrast. Reject only a substantial affirmative restatement:
    // at least three content tokens, strong shorter-side containment, and a
    // meaningful whole-sentence overlap. Explicit contrast language remains
    // admissible above, so "must include every detail" is not confused with a
    // source claim that a prototype works without every production detail.
    const wholeSentenceOverlap = intersection / Math.max(1, union);
    // Compact factual statements naturally have lower Jaccard overlap with a
    // longer explanatory source sentence. When a purported misconception has
    // at most five content tokens, three source tokens covering at least 75%
    // of it are still an affirmative restatement. This catches claims such as
    // "a triad consists of three notes" without rejecting a polarity reversal
    // or a longer, genuinely contrasting misconception.
    const compactFactRestatement = compact && candidateTokens.size <= 5 && wholeSentenceOverlap >= 0.25;
    return intersection >= 3 && containment >= 0.75 && (wholeSentenceOverlap >= 0.35 || compactFactRestatement);
  });
}

function repeatsOwnClause(value) {
  const clauses = cleanScionKeyTermText(value)
    .split(/\b(?:because|whereas|while|but)\b/i)
    .map((entry) => comparableScionKeyTermText(entry))
    .filter((entry) => entry.length >= 18);
  if (clauses.length < 2) return false;
  return clauses.some((left, leftIndex) =>
    clauses.some((right, rightIndex) => {
      if (leftIndex >= rightIndex) return false;
      const shorter = Math.min(left.length, right.length);
      return shorter >= 18 && (left.includes(right) || right.includes(left));
    }),
  );
}

function sourceTermToken(value) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[a-z0-9]+$/.test(normalized)) return normalized;
  if (/[^aeiou]ies$/.test(normalized)) return `${normalized.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes)$/.test(normalized)) return normalized.slice(0, -2);
  if (normalized.length > 3 && /s$/.test(normalized) && !/(?:ss|us|is)$/.test(normalized)) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function sourceTermTokens(value) {
  return (
    cleanScionKeyTermText(value)
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => !SOURCE_TERM_STOP_WORDS.has(token))
      .map(sourceTermToken)
      .filter((token) => token.length > 1) ?? []
  );
}

function termIsSourceAnchored(term, sourceTerm, knownFacts) {
  const candidateTokens = sourceTermTokens(term);
  if (candidateTokens.length === 0) return true;
  // Word segmentation and inflection rules below are deliberately limited to
  // Latin-script source packets. Do not turn incomplete multilingual tooling
  // into false rejection of an otherwise valid local-model response.
  if (/[^\u0000-\u024f\u1e00-\u1eff]/u.test(term)) return true;
  const sources = [sourceTerm, ...(Array.isArray(knownFacts) ? knownFacts : [])]
    .map(cleanScionKeyTermText)
    .filter(Boolean);
  if (sources.length === 0) return true;
  return sources.some((source) => {
    const sourceTokens = new Set(sourceTermTokens(source));
    return candidateTokens.every((token) => sourceTokens.has(token));
  });
}

function correctionUsesCircularTerm(term, correction) {
  const normalizedTerm = comparableScionKeyTermText(term);
  if (normalizedTerm.length < 8 || normalizedTerm.split(' ').length < 2) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(
    `^(?:a|an|the)?\\s*${escaped}\\s+(?:is|are|means|creates?|builds?|describes?)\\s+(?:a|an|the)?\\s*${escaped}\\b`,
    'i',
  ).test(comparableScionKeyTermText(correction));
}

function dropsPreciseSourceHedge(value, knownFacts) {
  const candidateTokens = sourceTermTokens(value);
  if (candidateTokens.length < 2 || PRECISE_SOURCE_HEDGE_RE.test(value)) return false;
  const candidateSet = new Set(candidateTokens);
  return (Array.isArray(knownFacts) ? knownFacts : []).some((fact) => {
    const normalized = cleanScionKeyTermText(fact);
    const match = normalized.match(/\b(?:about|approximately|roughly)\s+([^.!?;:]{1,80})/i);
    if (!match) return false;
    const qualifiedTokens = sourceTermTokens(match[1]).slice(0, 4);
    return qualifiedTokens.length >= 2 && qualifiedTokens.every((token) => candidateSet.has(token));
  });
}

export function cleanScionKeyTermText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeScionKeyTerm(term = {}) {
  return {
    term: cleanScionKeyTermText(term?.tr ?? term?.term),
    definition: cleanScionKeyTermText(term?.df ?? term?.definition),
    example: cleanScionKeyTermText(term?.eg ?? term?.example),
    misconception: cleanScionKeyTermText(term?.mi ?? term?.misconception),
    correction: cleanScionKeyTermText(term?.cx ?? term?.correction),
  };
}

export function assessScionKeyTermContract(
  term = {},
  {
    lessonTitle = '',
    definitionMin = 45,
    maxLength = 380,
    knownFacts = [],
    sourceTerm = '',
    semanticProfile = 'legacy',
  } = {},
) {
  const normalized = normalizeScionKeyTerm(term);
  const judgeInformedSemanticAdmission = semanticProfile === 'strict-v3' || semanticProfile === 'source-strict-v3';
  const sourceGroundedSemanticAdmission = semanticProfile === 'source-strict' || semanticProfile === 'source-strict-v3';
  const strictSemanticAdmission =
    semanticProfile === 'strict' || semanticProfile === 'strict-v3' || sourceGroundedSemanticAdmission;
  const issues = [];
  const minTermLength = NON_LATIN_SCRIPT_RE.test(normalized.term) ? 1 : 3;
  const meaningfulMin = (value, latinMinimum) => (NON_LATIN_SCRIPT_RE.test(value) ? 4 : latinMinimum);
  for (const [field, value, min, max] of [
    ['tr', normalized.term, minTermLength, 60],
    ['df', normalized.definition, meaningfulMin(normalized.definition, definitionMin), maxLength],
    ['eg', normalized.example, meaningfulMin(normalized.example, 12), 300],
    ['mi', normalized.misconception, meaningfulMin(normalized.misconception, 12), 300],
    ['cx', normalized.correction, meaningfulMin(normalized.correction, 12), 300],
  ]) {
    if (value.length < min || value.length > max) issues.push(`${field}-length`);
  }
  const normalizedLessonTitle = cleanScionKeyTermText(lessonTitle)
    .replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '')
    .toLowerCase();
  if (normalized.term && normalizedLessonTitle && normalized.term.toLowerCase() === normalizedLessonTitle) {
    issues.push('term-is-lesson-title');
  }
  const definitionLead = normalized.definition.split(/\s+/).slice(0, 6).join(' ').toLowerCase();
  if (normalized.term.length > 6 && definitionLead.includes(normalized.term.toLowerCase())) {
    issues.push('circular-definition');
  }
  if (META_SURFACE_RE.test(`${normalized.definition} ${normalized.example}`)) issues.push('meta-definition');
  const instructionalFields = [
    normalized.definition,
    normalized.example,
    normalized.misconception,
    normalized.correction,
  ];
  if (EMBEDDED_FIELD_LABEL_RE.test(instructionalFields.join(' '))) issues.push('embedded-field-label');
  if (instructionalFields.some((value) => CLAIM_MARKER_RESIDUE_RE.test(value))) issues.push('claim-marker-residue');
  if (sourceGroundedSemanticAdmission && !termIsSourceAnchored(normalized.term, sourceTerm, knownFacts)) {
    issues.push('term-not-source-anchored');
  }
  if (sourceGroundedSemanticAdmission && PLACEHOLDER_EXAMPLE_RE.test(normalized.example)) {
    issues.push('example-placeholder');
  }
  if (sourceGroundedSemanticAdmission && correctionUsesCircularTerm(normalized.term, normalized.correction)) {
    issues.push('correction-circular-term');
  }
  if (
    sourceGroundedSemanticAdmission &&
    [normalized.definition, normalized.example, normalized.correction].some((value) =>
      dropsPreciseSourceHedge(value, knownFacts),
    )
  ) {
    issues.push('source-precision-overstatement');
  }
  for (const [field, value] of [
    ['df', normalized.definition],
    ['eg', normalized.example],
    ['mi', normalized.misconception],
    ['cx', normalized.correction],
  ]) {
    if (strictSemanticAdmission && repeatsOwnClause(value)) issues.push(`${field}-repeats-itself`);
  }
  if (
    strictSemanticAdmission &&
    knownFacts.length > 0 &&
    (normalized.example.length < 24 || normalized.example.split(/\s+/).length < 4)
  ) {
    issues.push('example-underdeveloped');
  }
  for (const [left, right, issue] of [
    [normalized.definition, normalized.example, 'example-repeats-definition'],
    [normalized.definition, normalized.misconception, 'misconception-repeats-definition'],
    [normalized.definition, normalized.correction, 'correction-repeats-definition'],
    [normalized.example, normalized.misconception, 'misconception-repeats-example'],
    [normalized.example, normalized.correction, 'correction-repeats-example'],
    [normalized.misconception, normalized.correction, 'correction-repeats-misconception'],
  ]) {
    if (repeatsScionKeyTermField(left, right)) issues.push(issue);
  }
  if (
    misconceptionRestatesKnownFact(
      normalized.misconception,
      (Array.isArray(knownFacts) ? knownFacts : []).map(cleanScionKeyTermText).filter(Boolean),
      { strict: strictSemanticAdmission, compact: judgeInformedSemanticAdmission },
    )
  ) {
    issues.push('misconception-repeats-known-fact');
  }
  return {
    eligible: issues.length === 0,
    issues: [...new Set(issues)],
    score: Math.max(0, 100 - new Set(issues).size * 15),
    normalized,
  };
}

const KEY_TERM_FIELD_KEYS = Object.freeze({
  term: ['tr', 'term'],
  definition: ['df', 'definition'],
  example: ['eg', 'example'],
  misconception: ['mi', 'misconception'],
  correction: ['cx', 'correction'],
});

function setScionKeyTermField(term, field, value) {
  const [compactKey, fullKey] = KEY_TERM_FIELD_KEYS[field];
  const next = { ...term };
  if (Object.prototype.hasOwnProperty.call(next, compactKey) || !Object.prototype.hasOwnProperty.call(next, fullKey)) {
    next[compactKey] = value;
  } else {
    next[fullKey] = value;
  }
  return next;
}

function escapeScionKeyTermRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove only a redundant leading term/copula when the untouched remainder is
 * already a glossary-style noun phrase ("a", "an", or "the" ...). This is a
 * byte-conservative semantic repair: it deletes model-authored redundancy but
 * never substitutes, paraphrases, or invents factual content.
 */
export function repairScionKeyTermContract(
  term = {},
  {
    lessonTitle = '',
    definitionMin = 45,
    maxLength = 380,
    knownFacts = [],
    sourceTerm = '',
    semanticProfile = 'legacy',
  } = {},
) {
  const assessmentOptions = { lessonTitle, definitionMin, maxLength, knownFacts, sourceTerm, semanticProfile };
  const before = assessScionKeyTermContract(term, assessmentOptions);
  if (!before.issues.includes('circular-definition') || !before.normalized.term) {
    return { term, assessment: before, repairs: [] };
  }

  const escapedTerm = escapeScionKeyTermRegExp(before.normalized.term);
  const redundantLead = new RegExp(
    `^(?:the\\s+)?${escapedTerm}\\s+(?:is|are|means|refers\\s+to|describes|occurs\\s+at|measures)\\s+`,
    'i',
  );
  if (!redundantLead.test(before.normalized.definition)) {
    return { term, assessment: before, repairs: [] };
  }

  const remainder = before.normalized.definition.replace(redundantLead, '').trim();
  if (!/^(?:a|an|the)\b/i.test(remainder)) {
    return { term, assessment: before, repairs: [] };
  }
  const definition = remainder.charAt(0).toUpperCase() + remainder.slice(1);
  const candidate = setScionKeyTermField(term, 'definition', definition);
  const after = assessScionKeyTermContract(candidate, assessmentOptions);
  const introducedIssues = after.issues.filter((issue) => !before.issues.includes(issue));
  if (introducedIssues.length > 0 || after.issues.length >= before.issues.length) {
    return { term, assessment: before, repairs: [] };
  }

  return {
    term: candidate,
    assessment: after,
    repairs: [
      {
        pass: 'redundantDefinitionLead',
        action: 'removed-leading-term-copula',
        field: 'definition',
        before: before.normalized.definition,
        after: definition,
        issueCountBefore: before.issues.length,
        issueCountAfter: after.issues.length,
        proof: 'deletion-only-noun-phrase-remainder',
      },
    ],
  };
}

/**
 * Retain an earlier model-authored field only when it strictly reduces the
 * deterministic contract issue count of a later attempt. This prevents retry
 * oscillation (for example, fixing cx while turning tr into a sentence) without
 * inventing content or declaring either version factually correct.
 */
export function mergeScionKeyTermContractAttempts(previous, current, { lessonTitle = '', definitionMin = 40 } = {}) {
  if (!previous || !current) {
    const assessment = assessScionKeyTermContract(current || {}, { lessonTitle, definitionMin });
    return { term: current, assessment, repairs: [] };
  }
  const previousNormalized = normalizeScionKeyTerm(previous);
  let term = { ...current };
  let assessment = assessScionKeyTermContract(term, { lessonTitle, definitionMin });
  const repairs = [];
  for (const field of Object.keys(KEY_TERM_FIELD_KEYS)) {
    const retainedValue = previousNormalized[field];
    if (!retainedValue) continue;
    const candidate = setScionKeyTermField(term, field, retainedValue);
    const candidateAssessment = assessScionKeyTermContract(candidate, { lessonTitle, definitionMin });
    if (candidateAssessment.issues.length >= assessment.issues.length) continue;
    repairs.push({
      field,
      before: normalizeScionKeyTerm(term)[field],
      after: retainedValue,
      issueCountBefore: assessment.issues.length,
      issueCountAfter: candidateAssessment.issues.length,
    });
    term = candidate;
    assessment = candidateAssessment;
  }
  return { term, assessment, repairs };
}
