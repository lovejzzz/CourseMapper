// Lightweight, model-neutral key-term admission shared by the production
// parser, browser-local retry loop, and Scion preference gate. Passing this
// contract proves structural completeness only; factual correctness remains a
// separate benchmark/judge responsibility.

const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;

const NON_LATIN_SCRIPT_RE = /[^\u0000-\u024f\u1e00-\u1eff]/u;

function comparableScionKeyTermText(value) {
  return (
    cleanScionKeyTermText(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? ''
  );
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

export function assessScionKeyTermContract(term = {}, { lessonTitle = '', definitionMin = 45, maxLength = 380 } = {}) {
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
  const comparableDefinition = comparableScionKeyTermText(normalized.definition);
  const comparableCorrection = comparableScionKeyTermText(normalized.correction);
  const shorterCorrectionSurface =
    comparableDefinition && comparableCorrection
      ? comparableDefinition.length <= comparableCorrection.length
        ? comparableDefinition
        : comparableCorrection
      : '';
  const correctionReusesDefinition =
    shorterCorrectionSurface.length >= 36 &&
    (comparableDefinition.includes(comparableCorrection) || comparableCorrection.includes(comparableDefinition));
  if (correctionReusesDefinition) {
    issues.push('correction-repeats-definition');
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
