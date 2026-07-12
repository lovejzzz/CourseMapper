const ALIGNMENT_STOP_WORDS = new Set(['and', 'are', 'because', 'for', 'from', 'that', 'the', 'this', 'with', 'while']);

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

export function normalizeScionMcItem(item = {}) {
  return {
    question: clean(item.q ?? item.question),
    options: Array.isArray(item.op ?? item.options) ? (item.op ?? item.options).map(clean) : [],
    answerIndex: Number(item.ai ?? item.answerIndex),
    explanation: clean(item.ex ?? item.explanation),
  };
}

/** Find a conservative lexical contradiction between the declared key and explanation. */
export function findScionExplanationKeyConflict(item = {}, { minimumBestScore = 3, minimumMargin = 3 } = {}) {
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
  // Scion explanations deliberately contrast the nearest distractor after
  // explaining the key. Score only the affirmative lead; otherwise a quoted
  // distractor in "By contrast, X does not..." looks lexically supported.
  const affirmativeLead = normalized.explanation.split(
    /\b(?:by contrast|in contrast|whereas|while|rather than|unlike)\b/i,
  )[0];
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
    return { declaredIndex: normalized.answerIndex, supportedIndex: bestIndices[0], scores };
  }
  return null;
}

export function buildScionAnswerKeyRepair({ item, lessonId = '', itemIndex = 0, conflict } = {}) {
  const detected = conflict || findScionExplanationKeyConflict(item);
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
      minimumBestScore: 3,
      minimumMargin: 3,
    },
  };
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
      const repair = buildScionAnswerKeyRepair({ item, lessonId, itemIndex });
      if (!repair) return;
      if (nextQuizItems === quizItems) nextQuizItems = [...quizItems];
      nextQuizItems[itemIndex] = { ...item, answerIndex: repair.chosen.answerIndex };
      repairs.push(repair);
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
