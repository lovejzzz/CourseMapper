const DEFAULT_FACT_COUNT = 5;
const MIN_LEDGER_FACTS = 3;
const MAX_LEDGER_FACTS = 5;

function clean(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function validLedgerClaim(claim) {
  return claim.length >= 20 && /[.!?]$/.test(claim);
}

/**
 * Recover a deliberately numbered source ledger from a lesson topic field.
 * Ordinary course topics keep the five-fact authoring contract. A curated
 * source packet can instead provide Claim 0..N so the compiler can freeze the
 * exact knowledge claims and ask the model to author pedagogy around them.
 */
export function extractScionNumberedSourceClaims(lesson = {}) {
  const directClaims = (Array.isArray(lesson?.sourceFacts) ? lesson.sourceFacts : []).map(clean).filter(Boolean);
  if (
    directClaims.length >= MIN_LEDGER_FACTS &&
    directClaims.length <= MAX_LEDGER_FACTS &&
    directClaims.every(validLedgerClaim)
  ) {
    return directClaims;
  }
  const topics = clean(lesson?.topics);
  const markers = [...topics.matchAll(/\bClaim\s+(\d+)\s*:\s*/gi)];
  if (markers.length < MIN_LEDGER_FACTS || markers.length > MAX_LEDGER_FACTS) return [];
  const indexes = markers.map((match) => Number(match[1]));
  if (indexes.some((value, index) => value !== index)) return [];
  const claims = markers.map((match, index) =>
    clean(topics.slice(match.index + match[0].length, markers[index + 1]?.index ?? topics.length)),
  );
  if (claims.some((claim) => !validLedgerClaim(claim))) return [];
  return claims;
}

export function scionFactContractForLesson(lesson = {}, { userPrompt = '' } = {}) {
  // Frozen pre-ledger prompts explicitly demanded five generated facts. Keep
  // their historical replay contract stable even after the production prompt
  // moves to evidence-density-aware ledgers.
  if (/\bWrite 5 facts per lesson\b/i.test(String(userPrompt || ''))) {
    return { mode: 'authored-five-v1', factCount: DEFAULT_FACT_COUNT, claims: [] };
  }
  const ledgerRequested =
    clean(lesson?.sourceFactPolicy) === 'numbered-source-ledger-v1' ||
    /\bSOURCE FACT LEDGER\b/i.test(String(userPrompt || ''));
  if (!ledgerRequested) return { mode: 'authored-five-v1', factCount: DEFAULT_FACT_COUNT, claims: [] };
  const claims = extractScionNumberedSourceClaims(lesson);
  if (claims.length >= MIN_LEDGER_FACTS) {
    return { mode: 'numbered-source-ledger-v1', factCount: claims.length, claims };
  }
  return { mode: 'authored-five-v1', factCount: DEFAULT_FACT_COUNT, claims: [] };
}

export function scionFactCountForPrompt(prompt = {}, expectedLessonIds = []) {
  const expected = new Set(expectedLessonIds.filter(Boolean));
  const lessons = (Array.isArray(prompt?.lessons) ? prompt.lessons : []).filter(
    (lesson) => expected.size === 0 || expected.has(lesson?.lessonId),
  );
  const counts = [
    ...new Set(
      lessons.map((lesson) => scionFactContractForLesson(lesson, { userPrompt: prompt?.userPrompt }).factCount),
    ),
  ];
  return counts.length === 1 ? counts[0] : DEFAULT_FACT_COUNT;
}

export function scionPromptUsesSourceLedger(prompt = {}, expectedLessonIds = []) {
  const expected = new Set(expectedLessonIds.filter(Boolean));
  const lessons = (Array.isArray(prompt?.lessons) ? prompt.lessons : []).filter(
    (lesson) => expected.size === 0 || expected.has(lesson?.lessonId),
  );
  return (
    lessons.length > 0 &&
    lessons.every(
      (lesson) =>
        scionFactContractForLesson(lesson, { userPrompt: prompt?.userPrompt }).mode === 'numbered-source-ledger-v1',
    )
  );
}
