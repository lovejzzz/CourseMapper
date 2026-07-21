function clean(value, max = 100) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function lessonIdentityOf(lesson = {}, concept = '') {
  const title = clean(lesson?.title, 100).replace(/^lesson\s+\d+\s*[:.-]\s*/i, '');
  return title || clean(concept, 80) || 'this lesson';
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceStringDeep(value, pattern, replacement) {
  if (typeof value === 'string') return value.replace(pattern, replacement);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const repaired = replaceStringDeep(entry, pattern, replacement);
      if (repaired !== entry) changed = true;
      return repaired;
    });
    return changed ? next : value;
  }
  if (!value || typeof value !== 'object') return value;
  let changed = false;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const repaired = replaceStringDeep(entry, pattern, replacement);
    if (repaired !== entry) changed = true;
    next[key] = repaired;
  }
  return changed ? next : value;
}

export function buildFactLedgerFeedback({ lesson = {}, concept = '' } = {}) {
  const lessonIdentity = lessonIdentityOf(lesson, concept);
  const lessonNumber = Math.max(
    1,
    Number(lesson?.lessonNumber) || Number(clean(lesson?.title).match(/^lesson\s+(\d+)/i)?.[1]) || 1,
  );
  const misconceptions = [
    `For ${lessonIdentity}, one claim is treated as conclusive before the others are compared.`,
    `A weak reading of ${lessonIdentity} accepts the opening claim without testing the remaining evidence.`,
    `In ${lessonIdentity}, the first observation is mistaken for a complete explanation.`,
    `An incomplete ${lessonIdentity} response quotes one claim and ignores the evidence boundary.`,
    `The common ${lessonIdentity} error is deciding from one detail before checking the full packet.`,
    `A rushed ${lessonIdentity} conclusion treats an initial clue as if it resolved every question.`,
  ];
  const corrections = [
    `Compare every ${lessonIdentity} claim, state the warranted conclusion, and name one unresolved question.`,
    `Test the ${lessonIdentity} claims against one another before explaining what the evidence does not establish.`,
    `Use all ${lessonIdentity} observations to support a bounded conclusion and identify the remaining uncertainty.`,
    `Rebuild the ${lessonIdentity} response from the complete packet, then separate support from limitation.`,
    `Check each ${lessonIdentity} detail before choosing a conclusion and recording the strongest counterpoint.`,
    `For ${lessonIdentity}, connect the claims, limit the inference, and preserve the open question.`,
  ];
  const index = (lessonNumber - 1) % misconceptions.length;
  return { misconception: misconceptions[index], correction: corrections[index] };
}

export function normalizeFactLedgerFeedback(lesson = {}, enrichment = null) {
  if (!enrichment || typeof enrichment !== 'object' || !Array.isArray(enrichment.keyTerms)) return enrichment;
  let normalized = enrichment;
  for (const term of enrichment.keyTerms) {
    if (term?.source !== 'fact-ledger-projection') continue;
    const concept = clean(term?.term, 80);
    if (!concept) continue;
    const legacyMaterials = `${concept} examples and the named reading or activity`;
    normalized = replaceStringDeep(
      normalized,
      new RegExp(escapePattern(legacyMaterials), 'gi'),
      `examples and source material for ${lessonIdentityOf(lesson, concept)}`,
    );
  }
  let changed = false;
  const keyTerms = normalized.keyTerms.map((term) => {
    if (term?.source !== 'fact-ledger-projection') return term;
    const feedback = buildFactLedgerFeedback({ lesson, concept: term?.term });
    if (term.misconception === feedback.misconception && term.correction === feedback.correction) return term;
    changed = true;
    return { ...term, ...feedback };
  });
  return changed ? { ...normalized, keyTerms } : normalized;
}
