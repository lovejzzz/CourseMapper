// v0.20.08: pipeline vocabulary must never reach a teacher or a student.
//
// The benchmark already rejects these words in its fixtures (v0.20.07), but a
// live generation still printed "admitted evidence" 35–96 times per package,
// because the words come from compiler templates the fixtures do not reach.
// This is the runtime guard: every compiled material passes through
// sanitizeLearnerFacingData before it is shown or exported.

const JARGON_RE =
  /\b(?:admitted (?:evidence|source ledger|sources?)|evidence ledger|source ledger|revision trail|ledger statement|fact-(?:subject|ledger)-projection|model-provisional|source-ledger-facts-only|Records? [A-D](?:[-–][A-D])?\b|course-created practice case)\b/i;

// Ordered: longer phrases first so "admitted source ledger" is not half-replaced.
const REPLACEMENTS = [
  [/\bthe admitted source ledger\b/gi, 'the supplied sources'],
  [/\ban admitted source ledger\b/gi, 'the supplied sources'],
  [/\badmitted source ledger\b/gi, 'supplied sources'],
  [/\bdecisive ledger statement\b/gi, 'decisive statement'],
  [/\bledger statement\b/gi, 'source statement'],
  [/\badmitted evidence\b/gi, 'evidence'],
  [/\badmitted sources\b/gi, 'supplied sources'],
  [/\badmitted source\b/gi, 'supplied source'],
  [/\bevidence ledger\b/gi, 'evidence notes'],
  [/\bsource ledger\b/gi, 'source notes'],
  [/\brevision trail\b/gi, 'revision notes'],
  [/\bthe instructor-provided fact list\b/gi, 'the facts provided'],
  [/\binstructor-provided fact list\b/gi, 'facts provided'],
];

// Keys that hold identifiers, protocols or provenance for the app itself.
const SKIP_KEYS = new Set([
  'id',
  'protocol',
  'source',
  'sourceKind',
  'enrichmentSource',
  'url',
  'href',
  'license',
  'bloomSource',
  'role',
  'tags',
  'instructionalIntentReceiptSha256',
  'compilerDecision',
  'sourceEvidenceTrace',
]);

export function hasLearnerFacingJargon(text) {
  return JARGON_RE.test(String(text || ''));
}

function matchCase(replacement, original) {
  return /^[A-Z]/.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

export function sanitizeLearnerFacingText(text) {
  if (typeof text !== 'string' || !/ledger|admitted|revision trail|fact list/i.test(text)) return text;
  return REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, (match) => matchCase(replacement, match)),
    text,
  );
}

/** Deep copy-on-write: returns the same object when nothing changed. */
export function sanitizeLearnerFacingData(value, key = '') {
  if (SKIP_KEYS.has(key)) return value;
  if (typeof value === 'string') return sanitizeLearnerFacingText(value);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const cleaned = sanitizeLearnerFacingData(entry);
      if (cleaned !== entry) changed = true;
      return cleaned;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const [entryKey, entry] of Object.entries(value)) {
      const cleaned = sanitizeLearnerFacingData(entry, entryKey);
      if (cleaned !== entry) changed = true;
      next[entryKey] = cleaned;
    }
    return changed ? next : value;
  }
  return value;
}
