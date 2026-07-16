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
const MISCONCEPTION_CONTRAST_RE =
  /\b(?:not|never|always|only|all|none|every|must|cannot|can't|exactly|identical|equally|entirely|solely)\b/i;
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

function misconceptionRestatesKnownFact(misconception, knownFacts) {
  const candidate = cleanScionKeyTermText(misconception).replace(MISCONCEPTION_CUE_RE, '');
  if (candidate.length < 24 || MISCONCEPTION_CONTRAST_RE.test(candidate)) return false;
  const candidateTokens = comparableScionKeyTermTokens(candidate);
  return knownFacts.some((fact) => {
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
    return intersection >= 3 && containment >= 0.75 && intersection / Math.max(1, union) >= 0.35;
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
  { lessonTitle = '', definitionMin = 45, maxLength = 380, knownFacts = [] } = {},
) {
  const normalized = normalizeScionKeyTerm(term);
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
