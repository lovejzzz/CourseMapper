const ALIGNMENT_STOP_WORDS = new Set(['and', 'are', 'because', 'for', 'from', 'that', 'the', 'this', 'with', 'while']);
const FIRST_SENTENCE_ALIGNMENT_STOP_WORDS = new Set([
  ...ALIGNMENT_STOP_WORDS,
  'also',
  'into',
  'its',
  'not',
  'only',
  'than',
  'their',
  'then',
  'through',
  'using',
  'was',
  'were',
]);
const TERMINAL_PUNCT_RE = /[.!?][\])}"']?$/;
const SENTENCE_BOUNDARY_RE = /[.!?][\])}"']?(?=\s+[A-Z0-9"'“‘]|$)/g;
const ABBREVIATION_BOUNDARY_RE = /(?:\b(?:e\.g|i\.e|u\.s|vs|dr|mr|mrs|ms|prof|fig|no)|\b[A-Z])\.$/i;
const EXPLANATION_CONTRAST_RE =
  /\b(?:misconception|common misconception|likely misconception|plausible misconception|tempting misconception|by contrast|in contrast|whereas|while|rather than|unlike)\b/i;
const EXPLANATION_NEGATIVE_EVIDENCE_RE = /\b(?:distractor|incorrect|misconception|not|wrong)\b/i;
const SOURCE_ALIGNMENT_NEGATIVE_STEM_RE = /\b(?:except|false|incorrect|least|never|not)\b/i;
const SOURCE_ALIGNMENT_STOP_WORDS = new Set([
  'and',
  'are',
  'because',
  'can',
  'did',
  'does',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'may',
  'should',
  'that',
  'the',
  'their',
  'then',
  'this',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'will',
  'with',
]);

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function alignmentTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((token) => {
        if (/^(?:ask|asks|asked|asking|question|questions)$/.test(token)) return 'question';
        return token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
      })
      .filter((token) => token.length >= 3 && !ALIGNMENT_STOP_WORDS.has(token)),
  );
}

function morphologicalAlignmentTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((token) => {
        let next = token;
        if (next.length > 6 && next.endsWith('ing')) next = next.slice(0, -3);
        else if (next.length > 5 && next.endsWith('ed')) next = next.slice(0, -2);
        if (next.length > 4 && next.endsWith('s') && !next.endsWith('ss')) next = next.slice(0, -1);
        return next;
      })
      .filter((token) => token.length >= 3 && !FIRST_SENTENCE_ALIGNMENT_STOP_WORDS.has(token)),
  );
}

function sourceAlignmentTokens(value) {
  return new Set(
    clean(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((token) => {
        let next = token;
        if (next.length > 3 && next.endsWith('ies')) next = `${next.slice(0, -3)}y`;
        else if (next.length > 5 && next.endsWith('ing')) next = next.slice(0, -3);
        else if (next.length > 4 && next.endsWith('ed')) next = next.slice(0, -2);
        else if (next.length > 3 && next.endsWith('s') && !/(?:ss|ous|ius|is|us|ias)$/.test(next)) {
          next = next.slice(0, -1);
        }
        return next;
      })
      .filter((token) => token.length >= 3 && !SOURCE_ALIGNMENT_STOP_WORDS.has(token)),
  );
}

function tokenOverlap(left, right) {
  return [...left].filter((token) => right.has(token)).length;
}

function sourceClaimText(value) {
  if (value && typeof value === 'object') return clean(value.text ?? value.claim ?? value.value);
  return clean(value);
}

/**
 * Find a uniquely source-supported answer when the declared key points elsewhere.
 *
 * This is intentionally lexical and fail-closed. The question must identify no
 * more than two equally relevant supplied claims, a single alternative option
 * must receive strong/contained support from those claims, and the declared
 * option must receive almost none. Negative stems are excluded because source
 * support would reverse their intended answer semantics.
 */
export function findScionSourceAnswerSupport(item = {}, { sourceClaims = [] } = {}) {
  const normalized = normalizeScionMcItem(item);
  const claims = (Array.isArray(sourceClaims) ? sourceClaims : []).map(sourceClaimText).filter(Boolean);
  if (
    claims.length === 0 ||
    normalized.options.length !== 4 ||
    !Number.isInteger(normalized.answerIndex) ||
    normalized.answerIndex < 0 ||
    normalized.answerIndex > 3 ||
    !normalized.question ||
    SOURCE_ALIGNMENT_NEGATIVE_STEM_RE.test(normalized.question)
  ) {
    return null;
  }

  const questionTokens = sourceAlignmentTokens(normalized.question);
  const claimScores = claims.map((claim, index) => {
    const tokens = sourceAlignmentTokens(claim);
    return { index, score: tokenOverlap(questionTokens, tokens), tokens };
  });
  const bestClaimScore = Math.max(0, ...claimScores.map(({ score }) => score));
  const relevantClaims = claimScores.filter(({ score }) => score === bestClaimScore);
  if (bestClaimScore < 3 || relevantClaims.length === 0 || relevantClaims.length > 2) return null;

  const relevantTokens = new Set(relevantClaims.flatMap(({ tokens }) => [...tokens]));
  const optionTokens = normalized.options.map(sourceAlignmentTokens);
  const scores = optionTokens.map((tokens) => tokenOverlap(tokens, relevantTokens));
  const containment = optionTokens.map((tokens, index) =>
    tokens.size > 0 ? Number((scores[index] / tokens.size).toFixed(6)) : 0,
  );
  const bestScore = Math.max(...scores);
  const bestIndices = scores.map((score, index) => (score === bestScore ? index : -1)).filter((index) => index >= 0);
  const currentScore = scores[normalized.answerIndex] || 0;
  const competingContainedOptions = scores
    .map((score, index) => ({ score, index, containment: containment[index] }))
    .filter(
      ({ score, index, containment: optionContainment }) =>
        !bestIndices.includes(index) && score >= 2 && optionContainment >= 0.6,
    );
  if (
    bestScore < 3 ||
    bestIndices.length !== 1 ||
    competingContainedOptions.length > 0 ||
    containment[bestIndices[0]] < 0.6 ||
    (bestIndices[0] !== normalized.answerIndex && (currentScore > 1 || bestScore < currentScore + 2))
  ) {
    return null;
  }

  return {
    declaredIndex: normalized.answerIndex,
    supportedIndex: bestIndices[0],
    scores,
    containment,
    supportMethod: 'source-question-option-alignment',
    relevantSourceClaimIndexes: relevantClaims.map(({ index }) => index),
    questionClaimScore: bestClaimScore,
  };
}

export function findScionSourceAnswerConflict(item = {}, { sourceClaims = [] } = {}) {
  const support = findScionSourceAnswerSupport(item, { sourceClaims });
  return support && support.supportedIndex !== support.declaredIndex ? support : null;
}

function findFirstSentenceLexicalCue(normalized) {
  const firstSentence =
    clean(normalized.explanation)
      .match(/^.*?[.!?](?=\s|$)/)?.[0]
      ?.trim() || clean(normalized.explanation);
  if (!firstSentence) return null;
  // A literal option label outranks lexical overlap, while a generic
  // "correct choice" supplies no option identity. Negative/distractor prose
  // is likewise not affirmative evidence and must never move the key.
  if (
    /\b(?:(?:option|choice|answer)\s*[A-D1-4]|(?:correct|best)\s+(?:choice|answer|option))\b/i.test(firstSentence) ||
    /\b(?:incorrect|wrong|misconception|distractor|premature|not)\b/i.test(firstSentence)
  ) {
    return null;
  }
  const explanationTokens = morphologicalAlignmentTokens(firstSentence);
  const scores = normalized.options.map((option) => {
    const optionTokens = morphologicalAlignmentTokens(option);
    return [...optionTokens].filter((token) => explanationTokens.has(token)).length;
  });
  const bestScore = Math.max(...scores);
  const bestIndices = scores.map((score, index) => (score === bestScore ? index : -1)).filter((index) => index >= 0);
  const currentScore = scores[normalized.answerIndex] || 0;
  if (
    bestScore >= 2 &&
    bestIndices.length === 1 &&
    bestIndices[0] !== normalized.answerIndex &&
    bestScore >= currentScore + 1
  ) {
    return {
      declaredIndex: normalized.answerIndex,
      supportedIndex: bestIndices[0],
      scores,
      supportMethod: 'first-sentence-lexical-margin',
      explicitCues: [],
      evidenceSentence: firstSentence,
    };
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripOptionLabel(value, { stripTerminalPunctuation = true } = {}) {
  const unlabeled = clean(value).replace(/^(?:(?:option|choice|answer)\s*)?(?:[a-d]|[1-4])\s*[).:\-]\s*/i, '');
  return (stripTerminalPunctuation ? unlabeled.replace(/[.!?;:,]+$/g, '') : unlabeled).trim();
}

/** Canonical identity for detecting answer choices that differ only cosmetically. */
export function normalizeScionOptionIdentity(value) {
  const surface = stripOptionLabel(value);
  // Brackets and braces carry meaning in code and mathematics: [1, 2] is a
  // Python list while (1, 2) is a tuple. Preserve their delimiter signature
  // so natural-language cleanup cannot collapse distinct executable forms.
  const structuralDelimiters = (surface.match(/[\[\]{}()]/g) || []).join('');
  const words = surface
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:a|an|the)\s+/, '');
  return `${structuralDelimiters}|${words}`;
}

function optionLabelIndex(value) {
  const normalized = clean(value).toUpperCase();
  if (/^[A-D]$/.test(normalized)) return normalized.charCodeAt(0) - 65;
  if (/^[1-4]$/.test(normalized)) return Number(normalized) - 1;
  return null;
}

/**
 * Read only explicit affirmative answer declarations from the explanation.
 *
 * This is intentionally narrower than semantic inference. It accepts an
 * option label ("Option B is correct") or the exact displayed option text in
 * a correctness construction, and stops before misconception/contrast prose.
 * A conflicting or multi-option cue blocks lexical repair instead of guessing.
 */
function findExplicitExplanationAnswerCue(
  normalized,
  { allowAffirmativeLead = true, stripTerminalPunctuation = true } = {},
) {
  const affirmative = clean(normalized.explanation).split(EXPLANATION_CONTRAST_RE)[0];
  if (!affirmative) return { status: 'none' };
  const normalizeOption = (value) => stripOptionLabel(value, { stripTerminalPunctuation });
  const cues = [];
  const addCue = (supportedIndex, type, surface) => {
    if (Number.isInteger(supportedIndex) && supportedIndex >= 0 && supportedIndex < normalized.options.length) {
      cues.push({ supportedIndex, type, surface: clean(surface) });
    }
  };
  const addPhraseCue = (phrase, type, surface) => {
    const normalizedPhrase = normalizeOption(phrase)
      .replace(/^(?:that\s+)?(?:the\s+)?/i, '')
      .trim();
    if (normalizedPhrase.length < 3) return;
    const phraseComparable = normalizedPhrase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const optionComparables = normalized.options.map((option) =>
      normalizeOption(option)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    );
    const direct = optionComparables
      .map((option, index) =>
        option &&
        phraseComparable &&
        (option === phraseComparable || option.includes(phraseComparable) || phraseComparable.includes(option))
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    if (direct.length === 1) {
      addCue(direct[0], type, surface);
      return;
    }
    const phraseTokens = alignmentTokens(normalizedPhrase);
    const scores = normalized.options.map((option) => {
      const optionTokens = alignmentTokens(normalizeOption(option));
      return [...optionTokens].filter((token) => phraseTokens.has(token)).length;
    });
    const best = Math.max(...scores);
    const bestIndices = scores.map((score, index) => (score === best ? index : -1)).filter((index) => index >= 0);
    const nextBest = Math.max(0, ...scores.filter((_, index) => !bestIndices.includes(index)));
    if (best >= 3 && bestIndices.length === 1 && best >= nextBest + 2) {
      addCue(bestIndices[0], type, surface);
    }
  };

  for (const pattern of [
    /\b(?:option|choice|answer)\s*([A-D1-4])\s+(?:is|was)\s+(?:the\s+)?correct\b/gi,
    /\b(?:the\s+)?correct\s+(?:option|choice|answer)\s+(?:is|was|:)\s*(?:option\s*)?([A-D1-4])\b/gi,
  ]) {
    for (const match of affirmative.matchAll(pattern)) {
      addCue(optionLabelIndex(match[1]), 'explicit-option-label', match[0]);
    }
  }

  const namedAnswer = affirmative.match(
    /\b(?:the\s+)?correct\s+(?:option|choice|answer)\s*(?:is|was|:|,)\s*(.+?)(?=\s*(?:[.;]|\bbecause\b|\bwhich\b|\bsince\b|$))/i,
  );
  if (namedAnswer) addPhraseCue(namedAnswer[1], 'explicit-named-answer', namedAnswer[0]);

  for (const correction of clean(normalized.explanation).matchAll(
    /\bCorrect(?:ion)?\s*:\s*(.+?)(?=\s*(?:[.;]|\bbecause\b|\bwhich\b|\bsince\b|$))/gi,
  )) {
    addPhraseCue(correction[1], 'explicit-correction-label', correction[0]);
  }

  normalized.options.forEach((rawOption, index) => {
    const option = normalizeOption(rawOption);
    if (option.length < 3) return;
    const escaped = escapeRegExp(option);
    const patterns = [
      new RegExp(
        `(?:^|[.!?]\\s+)(?:the\\s+)?${escaped}\\s+(?:is|are)\\s+(?:the\\s+)?correct(?:\\s+(?:choice|answer|option|result))?\\b`,
        'i',
      ),
      new RegExp(
        `\\b(?:the\\s+)?correct\\s+(?:choice|answer|option)\\s*(?:is|:|,)\\s*(?:the\\s+)?${escaped}(?=\\s*(?:[,.;]|\\bbecause\\b|\\bwhich\\b|\\bfor\\b|$))`,
        'i',
      ),
      new RegExp(`(?:^|[.!?]\\s+)(?:the\\s+)?${escaped}\\s*[.!?]?\\s*\\(correct\\)`, 'i'),
      new RegExp(`(?:^|[.!?]\\s+)(?:the\\s+)?${escaped}\\s+(?:fits|matches)\\s+because\\b`, 'i'),
    ];
    const match = patterns.map((pattern) => affirmative.match(pattern)).find(Boolean);
    if (match) {
      addCue(index, 'explicit-option-text', match[0]);
      return;
    }

    // Some small-model answers start the affirmative explanation with the
    // exact option as its grammatical subject ("Harmony is the concept..."),
    // but omit the literal words "correct answer". This remains an explicit
    // cue: it must start the affirmative lead, match one displayed option
    // exactly, and avoid negative/distractor predicates. We deliberately do
    // not infer support from a paraphrase here.
    if (!allowAffirmativeLead) return;
    const affirmativeLead = new RegExp(
      `^\\s*(?:the\\s+)?${escaped}\\s+(?:is|are|means|refers\\s+to|describes|represents|provides|creates|returns|assigns|identifies|shows|serves)\\b(?!\\s+(?:(?:the|a|an)\\s+)?(?:incorrect|wrong|misconception|distractor|tempting|incomplete|not)\\b)`,
      'i',
    ).exec(clean(normalized.explanation));
    if (affirmativeLead) addCue(index, 'explicit-affirmative-lead', affirmativeLead[0]);
  });

  const supported = [...new Set(cues.map((cue) => cue.supportedIndex))];
  if (supported.length === 0) return { status: 'none' };
  if (supported.length !== 1) return { status: 'ambiguous', cues };
  return {
    status: 'supported',
    supportedIndex: supported[0],
    cues: cues.filter((cue) => cue.supportedIndex === supported[0]),
  };
}

export function normalizeScionMcItem(item = {}) {
  return {
    question: clean(item.q ?? item.question),
    options: Array.isArray(item.op ?? item.options) ? (item.op ?? item.options).map(clean) : [],
    answerIndex: Number(item.ai ?? item.answerIndex),
    explanation: clean(item.ex ?? item.explanation),
  };
}

/**
 * Recover only the complete prefix of an explanation that ends mid-sentence.
 *
 * This is deliberately narrower than adding punctuation. At least one real
 * sentence boundary must already exist, the retained prefix must still clear
 * the explanation-length floor, and common abbreviations are not accepted as
 * boundaries. The unfinished suffix remains in the repair receipt so the
 * compiler never hides what the model actually returned.
 */
export function findScionIncompleteExplanationTail(value = '') {
  const explanation = clean(value);
  if (!explanation || TERMINAL_PUNCT_RE.test(explanation)) return null;

  let boundary = null;
  for (const match of explanation.matchAll(SENTENCE_BOUNDARY_RE)) {
    const end = Number(match.index) + match[0].length;
    const prefix = explanation.slice(0, end).trim();
    if (ABBREVIATION_BOUNDARY_RE.test(prefix)) continue;
    boundary = { end, prefix };
  }
  if (!boundary || boundary.prefix.length < 20) return null;

  const removedTail = explanation.slice(boundary.end).trim();
  if (!removedTail) return null;
  return {
    explanation,
    completePrefix: boundary.prefix,
    removedTail,
    retainedCharacters: boundary.prefix.length,
    removedCharacters: removedTail.length,
  };
}

export function buildScionExplanationTailRepair({ item, lessonId = '', itemIndex = 0, tail } = {}) {
  const rejected = normalizeScionMcItem(item);
  const detected = tail || findScionIncompleteExplanationTail(rejected.explanation);
  if (!detected) return null;
  return {
    kind: 'mc-item',
    pass: 'incompleteExplanationTail',
    lessonId,
    item: itemIndex,
    action: 'trimmed-incomplete-tail',
    prompt: 'Retain only complete model-authored sentences before an unfinished explanation tail.',
    rejected,
    chosen: { ...rejected, explanation: detected.completePrefix },
    trainingEligible: false,
    recoveryEvidence: {
      kind: 'existing-sentence-boundary',
      verified: true,
      retainedCharacters: detected.retainedCharacters,
      removedCharacters: detected.removedCharacters,
      removedTail: detected.removedTail,
    },
  };
}

/** Find a conservative lexical contradiction between the declared key and explanation. */
export function findScionExplanationKeyConflict(
  item = {},
  {
    minimumBestScore = 3,
    minimumMargin = 3,
    allowExplicitCues = true,
    allowAffirmativeLead = true,
    stripTerminalPunctuation = true,
    allowFirstSentenceLexicalCue = true,
    rejectNegativeEvidence = true,
  } = {},
) {
  const normalized = normalizeScionMcItem(item);
  if (
    normalized.options.length !== 4 ||
    !Number.isInteger(normalized.answerIndex) ||
    normalized.answerIndex < 0 ||
    normalized.answerIndex > 3 ||
    !normalized.explanation
  ) {
    return null;
  }
  if (allowExplicitCues) {
    const explicitCue = findExplicitExplanationAnswerCue(normalized, {
      allowAffirmativeLead,
      stripTerminalPunctuation,
    });
    if (explicitCue.status === 'ambiguous') return null;
    if (explicitCue.status === 'supported') {
      if (explicitCue.supportedIndex === normalized.answerIndex) return null;
      return {
        declaredIndex: normalized.answerIndex,
        supportedIndex: explicitCue.supportedIndex,
        scores: normalized.options.map(() => 0),
        supportMethod: 'explicit-explanation-cue',
        explicitCues: explicitCue.cues,
      };
    }
  }
  // Scion explanations deliberately contrast the nearest distractor after
  // explaining the key. Score only the affirmative lead; otherwise a quoted
  // distractor in "By contrast, X does not..." looks lexically supported.
  const affirmativeLead = normalized.explanation.split(EXPLANATION_CONTRAST_RE)[0];
  // A mixed segment that explicitly marks something wrong is not a safe
  // lexical voting pool. If its first sentence is independently affirmative,
  // that narrower cue may still qualify; otherwise refuse the repair.
  if (rejectNegativeEvidence && EXPLANATION_NEGATIVE_EVIDENCE_RE.test(affirmativeLead)) {
    return allowFirstSentenceLexicalCue ? findFirstSentenceLexicalCue(normalized) : null;
  }
  const explanationTokens = alignmentTokens(affirmativeLead);
  const scores = normalized.options.map((option) => {
    const optionTokens = alignmentTokens(option);
    return [...optionTokens].filter((token) => explanationTokens.has(token)).length;
  });
  const bestScore = Math.max(...scores);
  const bestIndices = scores.map((score, index) => (score === bestScore ? index : -1)).filter((index) => index >= 0);
  const currentScore = scores[normalized.answerIndex] || 0;
  if (
    bestScore >= minimumBestScore &&
    bestIndices.length === 1 &&
    bestIndices[0] !== normalized.answerIndex &&
    bestScore >= currentScore + minimumMargin
  ) {
    return {
      declaredIndex: normalized.answerIndex,
      supportedIndex: bestIndices[0],
      scores,
      supportMethod: 'lexical-margin',
      explicitCues: [],
    };
  }
  if (allowFirstSentenceLexicalCue) return findFirstSentenceLexicalCue(normalized);
  return null;
}

export function buildScionAnswerKeyRepair({ item, lessonId = '', itemIndex = 0, conflict } = {}) {
  const detected = conflict === undefined ? findScionExplanationKeyConflict(item) : conflict;
  if (!detected) return null;
  const rejected = normalizeScionMcItem(item);
  const chosen = { ...rejected, answerIndex: detected.supportedIndex };
  return {
    kind: 'mc-item',
    pass: 'explanationKeyAlignment',
    lessonId,
    item: itemIndex,
    action: 'realigned',
    prompt: 'Choose the answer index supported by the affirmative explanation for this multiple-choice item.',
    rejected,
    chosen,
    trainingEligible: true,
    preferenceEvidence: {
      kind: 'deterministic-explanation-key-conflict',
      verified: true,
      declaredIndex: detected.declaredIndex,
      supportedIndex: detected.supportedIndex,
      scores: detected.scores,
      supportMethod: detected.supportMethod || 'lexical-margin',
      explicitCues: detected.explicitCues || [],
      ...(detected.evidenceSentence ? { evidenceSentence: detected.evidenceSentence } : {}),
      minimumBestScore: detected.supportMethod === 'first-sentence-lexical-margin' ? 2 : 3,
      minimumMargin: detected.supportMethod === 'first-sentence-lexical-margin' ? 1 : 3,
    },
  };
}

export function buildScionSourceAnswerKeyRepair({ item, lessonId = '', itemIndex = 0, conflict } = {}) {
  if (!conflict) return null;
  const rejected = normalizeScionMcItem(item);
  return {
    kind: 'mc-item',
    pass: 'sourceAnswerAlignment',
    lessonId,
    item: itemIndex,
    action: 'realigned',
    prompt: 'Choose the answer index uniquely supported by the source claim most relevant to the question.',
    rejected,
    chosen: { ...rejected, answerIndex: conflict.supportedIndex },
    trainingEligible: true,
    preferenceEvidence: {
      kind: 'deterministic-source-answer-conflict',
      verified: true,
      declaredIndex: conflict.declaredIndex,
      supportedIndex: conflict.supportedIndex,
      scores: conflict.scores,
      containment: conflict.containment,
      supportMethod: conflict.supportMethod,
      relevantSourceClaimIndexes: conflict.relevantSourceClaimIndexes,
      questionClaimScore: conflict.questionClaimScore,
      minimumQuestionClaimScore: 3,
      minimumOptionScore: 3,
      minimumOptionContainment: 0.6,
      maximumDeclaredOptionScore: 1,
      minimumMargin: 2,
    },
  };
}

function replaceExplanation(item, value) {
  const next = { ...item };
  if (Object.prototype.hasOwnProperty.call(next, 'ex')) next.ex = value;
  if (Object.prototype.hasOwnProperty.call(next, 'explanation')) next.explanation = value;
  if (!Object.prototype.hasOwnProperty.call(next, 'ex') && !Object.prototype.hasOwnProperty.call(next, 'explanation')) {
    next.explanation = value;
  }
  return next;
}

function replaceAnswerIndex(item, value) {
  const next = { ...item };
  if (Object.prototype.hasOwnProperty.call(next, 'ai')) next.ai = value;
  if (Object.prototype.hasOwnProperty.call(next, 'answerIndex')) next.answerIndex = value;
  if (!Object.prototype.hasOwnProperty.call(next, 'ai') && !Object.prototype.hasOwnProperty.call(next, 'answerIndex')) {
    next.answerIndex = value;
  }
  return next;
}

/** Apply the two conservative MC repairs in a fixed, provenance-preserving order. */
export function repairScionMcItem(
  item = {},
  {
    lessonId = '',
    itemIndex = 0,
    recoverIncompleteExplanation = true,
    realignAnswerKey = true,
    sourceClaims = [],
    keyConflictOptions,
  } = {},
) {
  let next = item;
  const repairs = [];

  if (recoverIncompleteExplanation) {
    const tailRepair = buildScionExplanationTailRepair({ item: next, lessonId, itemIndex });
    if (tailRepair) {
      next = replaceExplanation(next, tailRepair.chosen.explanation);
      repairs.push(tailRepair);
    }
  }

  if (realignAnswerKey) {
    const sourceSupport = findScionSourceAnswerSupport(next, { sourceClaims });
    const sourceConflict =
      sourceSupport && sourceSupport.supportedIndex !== sourceSupport.declaredIndex ? sourceSupport : null;
    const sourceRepair = buildScionSourceAnswerKeyRepair({ item: next, lessonId, itemIndex, conflict: sourceConflict });
    if (sourceRepair) {
      next = replaceAnswerIndex(next, sourceRepair.chosen.answerIndex);
      repairs.push(sourceRepair);
    } else if (!sourceSupport) {
      const conflict = findScionExplanationKeyConflict(next, keyConflictOptions);
      const keyRepair = buildScionAnswerKeyRepair({ item: next, lessonId, itemIndex, conflict });
      if (keyRepair) {
        next = replaceAnswerIndex(next, keyRepair.chosen.answerIndex);
        repairs.push(keyRepair);
      }
    }
  }

  return { item: next, repairs };
}

/** Re-check the persisted graph source so later normalization cannot resurrect a contradicted key. */
export function repairScionEnrichmentAnswerKeys(enrichment = {}) {
  const lessonContent =
    enrichment?.lessonContent && typeof enrichment.lessonContent === 'object' ? enrichment.lessonContent : null;
  if (!lessonContent) return { enrichment, repairs: [] };

  let nextLessonContent = lessonContent;
  const repairs = [];
  for (const [lessonId, payload] of Object.entries(lessonContent)) {
    const quizItems = Array.isArray(payload?.quizItems) ? payload.quizItems : null;
    if (!quizItems) continue;
    let nextQuizItems = quizItems;
    quizItems.forEach((item, itemIndex) => {
      if ((item?.type || 'multiple_choice') !== 'multiple_choice') return;
      const repaired = repairScionMcItem(item, { lessonId, itemIndex });
      if (repaired.repairs.length === 0) return;
      if (nextQuizItems === quizItems) nextQuizItems = [...quizItems];
      nextQuizItems[itemIndex] = repaired.item;
      repairs.push(...repaired.repairs);
    });
    if (nextQuizItems !== quizItems) {
      if (nextLessonContent === lessonContent) nextLessonContent = { ...lessonContent };
      nextLessonContent[lessonId] = { ...payload, quizItems: nextQuizItems };
    }
  }

  if (repairs.length === 0) return { enrichment, repairs };
  const existingRepairs = Array.isArray(enrichment.semanticRepairs) ? enrichment.semanticRepairs : [];
  return {
    enrichment: {
      ...enrichment,
      lessonContent: nextLessonContent,
      semanticRepairs: [...existingRepairs, ...repairs],
    },
    repairs,
  };
}
