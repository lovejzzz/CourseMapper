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
    `${lessonIdentity} goes off track when one quoted detail substitutes for comparison across the packet.`,
    `A partial ${lessonIdentity} answer names evidence but never tests whether the claims actually connect.`,
    `For ${lessonIdentity}, the tempting error is turning a supported observation into an unlimited conclusion.`,
    `An untested ${lessonIdentity} response treats agreement between two phrases as proof of the broader account.`,
    `The weak ${lessonIdentity} move is to report both claims without deciding what their relationship warrants.`,
    `${lessonIdentity} remains incomplete when the response ignores the detail that could qualify its conclusion.`,
  ];
  const corrections = [
    `Compare every ${lessonIdentity} claim, state the warranted conclusion, and name one unresolved question.`,
    `Test the ${lessonIdentity} claims against one another before explaining what the evidence does not establish.`,
    `Use all ${lessonIdentity} observations to support a bounded conclusion and identify the remaining uncertainty.`,
    `Rebuild the ${lessonIdentity} response from the complete packet, then separate support from limitation.`,
    `Check each ${lessonIdentity} detail before choosing a conclusion and recording the strongest counterpoint.`,
    `For ${lessonIdentity}, connect the claims, limit the inference, and preserve the open question.`,
    `In ${lessonIdentity}, compare the quoted details, justify the relationship, and stop where their support ends.`,
    `Trace each ${lessonIdentity} claim to its evidence, then name the conclusion and the condition that could revise it.`,
    `Separate observation from inference in ${lessonIdentity}; retain only the conclusion both claims can warrant.`,
    `Use the full ${lessonIdentity} packet to test agreement, tension, and the unresolved limit before deciding.`,
    `For ${lessonIdentity}, explain how the claims connect, cite the decisive wording, and reject the unsupported extension.`,
    `Recheck ${lessonIdentity} against every supplied detail and turn the remaining uncertainty into one bounded question.`,
  ];
  const index = (lessonNumber - 1) % misconceptions.length;
  return { misconception: misconceptions[index], correction: corrections[index] };
}

export function normalizeFactLedgerFeedback(lesson = {}, enrichment = null) {
  if (!enrichment || typeof enrichment !== 'object' || !Array.isArray(enrichment.keyTerms)) return enrichment;
  let normalized = enrichment;
  const compilerProjectionSources = new Set(['fact-ledger-projection', 'fact-subject-projection']);
  const lessonIdentity = lessonIdentityOf(lesson, enrichment.keyTerms[0]?.term);
  const lessonNumber = Math.max(
    1,
    Number(lesson?.lessonNumber) || Number(clean(lesson?.title).match(/^lesson\s+(\d+)/i)?.[1]) || 1,
  );
  const materialVariants = [
    `the two ${lessonIdentity} claim records and their evidence boundary`,
    `the paired ${lessonIdentity} claim cards and their comparison limit`,
    `the ${lessonIdentity} evidence cards and their competing readings`,
    `two supplied ${lessonIdentity} claims and the limiting source note`,
    `the paired ${lessonIdentity} records and their unresolved evidence limit`,
    `the documented ${lessonIdentity} claims and the condition bounding them`,
    `two ${lessonIdentity} claims and the note separating support from overreach`,
    `the ${lessonIdentity} comparison packet and its stated limitation`,
    `two source-backed ${lessonIdentity} statements and their evidence boundary`,
    `the paired ${lessonIdentity} claims and the open question they leave`,
    `the ${lessonIdentity} claim set and the point where its support ends`,
    `two competing ${lessonIdentity} accounts and their source boundary`,
  ];
  normalized = replaceStringDeep(
    normalized,
    /the source records behind Claim A and Claim B and the documented evidence boundary/gi,
    materialVariants[(lessonNumber - 1) % materialVariants.length],
  );
  for (const term of enrichment.keyTerms) {
    if (!compilerProjectionSources.has(term?.source)) continue;
    const concept = clean(term?.term, 80);
    if (!concept) continue;
    const legacyMaterials = `${concept} examples and the named reading or activity`;
    normalized = replaceStringDeep(
      normalized,
      new RegExp(escapePattern(legacyMaterials), 'gi'),
      `examples and source material for ${lessonIdentityOf(lesson, concept)}`,
    );
  }
  const lessonFeedback = buildFactLedgerFeedback({ lesson, concept: enrichment.keyTerms[0]?.term });
  for (const legacyPrompt of [
    'Support the comparison with both cards and avoid claiming more than they establish.',
    'Cite both cards, then keep the synthesis within the evidence provided.',
    'Use both cards in the answer and keep the conclusion bounded.',
  ]) {
    normalized = replaceStringDeep(
      normalized,
      new RegExp(escapePattern(legacyPrompt), 'gi'),
      lessonFeedback.correction,
    );
  }
  let changed = false;
  const keyTerms = normalized.keyTerms.map((term) => {
    if (!compilerProjectionSources.has(term?.source)) return term;
    const feedback = buildFactLedgerFeedback({ lesson, concept: term?.term });
    if (term.misconception === feedback.misconception && term.correction === feedback.correction) return term;
    changed = true;
    return { ...term, ...feedback };
  });
  return changed ? { ...normalized, keyTerms } : normalized;
}
