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
const SOURCE_SEMANTIC_STOP_WORDS = new Set(
  'a an and are as at be been being by can could each for from had has have in into is it its may means of on one only or should that the their these they this those through to used using when where which while with would'.split(
    ' ',
  ),
);
const SOURCE_SEMANTIC_ALIASES = new Map([
  ['conditions', 'condition'],
  ['dictionaries', 'dictionary'],
  ['degrees', 'degree'],
  ['functions', 'function'],
  ['goals', 'goal'],
  ['interactions', 'interact'],
  ['interaction', 'interact'],
  ['interactive', 'interact'],
  ['interacts', 'interact'],
  ['labels', 'label'],
  ['labeled', 'label'],
  ['lines', 'line'],
  ['models', 'model'],
  ['notes', 'note'],
  ['objectives', 'objective'],
  ['parts', 'condition'],
  ['prototypes', 'prototype'],
  ['represented', 'represent'],
  ['representation', 'represent'],
  ['represents', 'represent'],
  ['researchers', 'researcher'],
  ['returns', 'return'],
  ['scales', 'scale'],
  ['spaces', 'space'],
  ['tasks', 'task'],
  ['users', 'user'],
]);
const SOURCE_CLAIM_COPULA_RE = /\b(?:is|are|means|refers\s+to)\s+(?:defined\s+by\s+)?/i;
const TECHNICAL_IDENTIFIER_RE = /[A-Za-z_]\w*\(\)/g;
const SOURCE_IMPLICIT_CUE_RE = /\b(?:implicit(?:ly)?|automat(?:ic|ically))\b/i;
const EXPLICIT_CUE_RE = /\bexplicit(?:ly)?\b/i;
const DIRECT_CONTRAST_RE = /\b(?:instead|not|rather|unlike)\b/i;
const DEFINING_IDENTITY_RE = /\b(?:labels?|names?|terms?)\b/i;

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

function sourceSemanticToken(value) {
  const normalized = String(value || '').toLowerCase();
  return (
    SOURCE_SEMANTIC_ALIASES.get(normalized) ||
    SOURCE_SEMANTIC_ALIASES.get(sourceTermToken(normalized)) ||
    sourceTermToken(normalized)
  );
}

function sourceSemanticTokens(value) {
  return (
    cleanScionKeyTermText(value)
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.map(sourceSemanticToken)
      .filter((token) => token.length > 2 && !SOURCE_SEMANTIC_STOP_WORDS.has(token)) ?? []
  );
}

function sourceSemanticTokenSet(value) {
  return new Set(sourceSemanticTokens(value));
}

function sourceSemanticMatch(value, fact) {
  const candidate = sourceSemanticTokenSet(value);
  const source = sourceSemanticTokenSet(fact);
  const overlap = [...candidate].filter((token) => source.has(token)).length;
  return {
    overlap,
    jaccard: overlap / Math.max(1, new Set([...candidate, ...source]).size),
  };
}

function includesSemanticSequence(value, sequence) {
  const tokens = sourceSemanticTokens(value);
  return (
    sequence.length > 0 &&
    tokens.some((_, index) => sequence.every((token, offset) => tokens[index + offset] === token))
  );
}

function termPhraseAppearsInFact(term, fact) {
  return includesSemanticSequence(fact, sourceSemanticTokens(term));
}

function technicalIdentifiers(value) {
  return [
    ...new Set((cleanScionKeyTermText(value).match(TECHNICAL_IDENTIFIER_RE) || []).map((entry) => entry.toLowerCase())),
  ];
}

function correctionMissesSourceConfusion(_term, misconception, correction, knownFacts) {
  // A correction may validly replace a false predicate with the source-backed
  // definition of the term. Do not reject that normal teaching pattern merely
  // because the misconception and correction align to different source claims.
  // The bounded failure we can prove is narrower: the model turns a qualified
  // source rule ("major ... even when not every") into an absolute requirement,
  // then answers with an unrelated true fact instead of repairing that scope.
  const assertsTotalRequirement =
    /\b(?:must|always|only)\b[^.;]{0,100}\b(?:all|every)\b|\b(?:all|every)\b[^.;]{0,100}\b(?:must|always|required)\b/i.test(
      misconception,
    );
  if (!assertsTotalRequirement) return false;

  const qualifiedClaim = knownFacts.find(
    (fact) =>
      /\b(?:major|selected|some)\b/i.test(fact) &&
      /\b(?:not|without)\b[^.;]{0,80}\b(?:all|every)\b|\b(?:all|every)\b[^.;]{0,80}\bnot\b/i.test(fact),
  );
  if (!qualifiedClaim) return false;

  const repairTokens = sourceSemanticTokenSet(qualifiedClaim);
  const correctionTokens = sourceSemanticTokenSet(correction);
  const repairsScopeDirectly =
    /\b(?:major|selected|some)\b|\b(?:not|without)\b[^.;]{0,80}\b(?:all|every)\b|\b(?:need|require)\w*\b[^.;]{0,40}\bnot\b/i.test(
      correction,
    );
  const sharedScopeTokens = [...repairTokens].filter(
    (token) => correctionTokens.has(token) && /^(?:major|select|some|every|all|function)$/.test(token),
  );
  return !repairsScopeDirectly && sharedScopeTokens.length === 0;
}

function booleanTruthSignatures(value) {
  return cleanScionKeyTermText(value)
    .split(/\s*;\s*/)
    .flatMap((clause) => {
      const signatures = [];
      if (/\band\b[^.;]{0,100}\bboth\b[^.;]{0,80}\btrue\b/i.test(clause)) signatures.push('and-both-true');
      if (/\bor\b[^.;]{0,100}\beither\b[^.;]{0,80}\btrue\b/i.test(clause)) signatures.push('or-either-true');
      if (/\bnot\b[^.;]{0,100}\binvert\w*\b/i.test(clause)) signatures.push('not-inverts');
      return signatures.map((signature) => ({ signature, negative: NEGATION_RE.test(clause) }));
    });
}

function misconceptionRepeatsBooleanTruthCondition(misconception, knownFacts) {
  const misconceptionSignatures = booleanTruthSignatures(misconception);
  if (misconceptionSignatures.length === 0) return false;
  const sourceSignatures = knownFacts.flatMap(booleanTruthSignatures);
  return misconceptionSignatures.some((candidate) =>
    sourceSignatures.some(
      (source) => source.signature === candidate.signature && source.negative === candidate.negative,
    ),
  );
}

function correctionBorrowsUnrelatedSourcePredicate(term, correction, knownFacts) {
  const cleanCorrection = cleanScionKeyTermText(correction);
  // This rule is intentionally limited to compact definition-like answers.
  // Longer corrections can resolve the misconception first and then add a
  // second, true source fact; that is useful teaching, not concept drift.
  if (cleanCorrection.length > 90) return false;

  const termTokens = sourceSemanticTokens(term);
  const termFacts = knownFacts.filter((fact) => {
    const factTokens = sourceSemanticTokenSet(fact);
    return termTokens.length > 0 && termTokens.every((token) => factTokens.has(token));
  });
  if (termFacts.length === 0) return false;

  const bestTermFactMatch = Math.max(
    ...termFacts.map((fact) => {
      const match = sourceSemanticMatch(cleanCorrection, fact);
      return match.overlap >= 3 ? match.jaccard : 0;
    }),
  );
  if (bestTermFactMatch >= 0.24) return false;

  const correctionTokens = sourceSemanticTokenSet(correction);
  if (correctionTokens.size === 0) return false;
  return knownFacts.some((fact) => {
    const copula = cleanScionKeyTermText(fact).match(SOURCE_CLAIM_COPULA_RE);
    if (!copula || termPhraseAppearsInFact(term, fact)) return false;
    const predicate = cleanScionKeyTermText(fact).slice((copula.index || 0) + copula[0].length);
    const predicateTokens = sourceSemanticTokenSet(predicate);
    const overlap = [...correctionTokens].filter((token) => predicateTokens.has(token)).length;
    return overlap >= 4 && overlap / correctionTokens.size >= 0.75;
  });
}

function correctionOmitsTechnicalReference(term, misconception, correction) {
  const termIds = new Set(technicalIdentifiers(term));
  const correctionIds = new Set(technicalIdentifiers(correction));
  return technicalIdentifiers(misconception).some(
    (identifier) => !termIds.has(identifier) && !correctionIds.has(identifier),
  );
}

function exampleConflictsWithSourceBackedTiming(example, correction, knownFacts) {
  const source = knownFacts.join(' ');
  const dayBefore = /\b(?:the\s+)?day\s+before\b/i;
  const dayOf = /\b(?:on\s+)?the\s+day\s+of\b/i;
  if (!dayBefore.test(source)) return false;
  return (dayOf.test(example) && dayBefore.test(correction)) || (dayBefore.test(example) && dayOf.test(correction));
}

function correctionOmitsImplicitContrast(misconception, correction, knownFacts) {
  return (
    SOURCE_IMPLICIT_CUE_RE.test(knownFacts.join(' ')) &&
    SOURCE_IMPLICIT_CUE_RE.test(misconception) &&
    EXPLICIT_CUE_RE.test(correction) &&
    !SOURCE_IMPLICIT_CUE_RE.test(correction) &&
    !DIRECT_CONTRAST_RE.test(correction)
  );
}

function exampleConfusesResearchLearningRole(term, definition, example, knownFacts) {
  const source = knownFacts.join(' ');
  return (
    /\b(?:team|researchers?)\b[^.]{0,80}\b(?:want|wants|learn|learning)\b/i.test(source) &&
    /\blearning objectives?\b/i.test(`${term} ${definition}`) &&
    /\b(?:users?|participants?)\s+should\s+be\s+able\s+to\b/i.test(example)
  );
}

function definitionOmitsInteractiveFunction(term, definition, knownFacts) {
  return (
    /\blooks?\s+and\s+works?\b/i.test(knownFacts.join(' ')) &&
    /\bvisual\b/i.test(definition) &&
    !/\b(?:behavio\w*|function\w*|interact\w*|works?)\b/i.test(definition) &&
    !/\b(?:interact\w*|prototyp\w*)\b/i.test(term)
  );
}

function correctionDropsDefiningIdentity(term, definition, correction, knownFacts) {
  return (
    DEFINING_IDENTITY_RE.test(definition) &&
    !DEFINING_IDENTITY_RE.test(correction) &&
    !/\b(?:means|refers)\b/i.test(correction) &&
    knownFacts.some((fact) => termPhraseAppearsInFact(term, fact) && DEFINING_IDENTITY_RE.test(fact))
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
  const judgeInformedSemanticAdmission =
    semanticProfile === 'strict-v3' ||
    semanticProfile === 'source-strict-v3' ||
    semanticProfile === 'strict-v4' ||
    semanticProfile === 'source-strict-v4';
  const judgeInformedSemanticAdmissionV4 = semanticProfile === 'strict-v4' || semanticProfile === 'source-strict-v4';
  const sourceGroundedSemanticAdmission =
    semanticProfile === 'source-strict' ||
    semanticProfile === 'source-strict-v3' ||
    semanticProfile === 'source-strict-v4';
  const strictSemanticAdmission =
    semanticProfile === 'strict' ||
    semanticProfile === 'strict-v3' ||
    semanticProfile === 'strict-v4' ||
    sourceGroundedSemanticAdmission;
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
  const cleanKnownFacts = (Array.isArray(knownFacts) ? knownFacts : []).map(cleanScionKeyTermText).filter(Boolean);
  if (judgeInformedSemanticAdmissionV4 && cleanKnownFacts.length > 0) {
    if (misconceptionRepeatsBooleanTruthCondition(normalized.misconception, cleanKnownFacts)) {
      issues.push('misconception-repeats-known-fact');
    }
    if (
      correctionMissesSourceConfusion(normalized.term, normalized.misconception, normalized.correction, cleanKnownFacts)
    ) {
      issues.push('correction-source-claim-drift');
    }
    if (correctionBorrowsUnrelatedSourcePredicate(normalized.term, normalized.correction, cleanKnownFacts)) {
      issues.push('correction-borrows-unrelated-source-predicate');
    }
    if (correctionOmitsTechnicalReference(normalized.term, normalized.misconception, normalized.correction)) {
      issues.push('correction-omits-technical-reference');
    }
    if (exampleConflictsWithSourceBackedTiming(normalized.example, normalized.correction, cleanKnownFacts)) {
      issues.push('example-correction-timing-conflict');
    }
    if (correctionOmitsImplicitContrast(normalized.misconception, normalized.correction, cleanKnownFacts)) {
      issues.push('correction-omits-implicit-contrast');
    }
    if (
      exampleConfusesResearchLearningRole(normalized.term, normalized.definition, normalized.example, cleanKnownFacts)
    ) {
      issues.push('example-confuses-research-learning-role');
    }
    if (definitionOmitsInteractiveFunction(normalized.term, normalized.definition, cleanKnownFacts)) {
      issues.push('definition-omits-interactive-function');
    }
    if (
      correctionDropsDefiningIdentity(normalized.term, normalized.definition, normalized.correction, cleanKnownFacts)
    ) {
      issues.push('correction-drops-defining-identity');
    }
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
    !(
      NON_LATIN_SCRIPT_RE.test(normalized.example) &&
      (normalized.example.match(/[^\u0000-\u024f\u1e00-\u1eff\s\p{P}\p{S}]/gu) || []).length >= 4
    ) &&
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
