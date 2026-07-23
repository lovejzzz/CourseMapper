/**
 * Stateless text primitives shared by the course compiler and its orbit.
 *
 * v0.15.187 — first pure move of the compiler decomposition: these bodies are
 * verbatim from courseBlueprintCompiler.js (gated on golden-equivalence and
 * quality-matrix byte-equality), and they replace the identical clones that
 * blueprintEnrichmentPass.js and instructorPreferenceProfile.js maintained
 * separately. Deliberately-DIFFERENT variants stay where they are:
 * packageFinalizer's stripLessonPrefixText (wider prefix set, en/em dashes)
 * and deliverablePostProcess/contentQualityRepair's raw-string versions are
 * calibrated to their own surfaces — do not "unify" them without re-running
 * the byte-sensitive harnesses.
 *
 * Everything here must stay dependency-free and side-effect-free.
 */

export function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

// A compact model can attach a second singular possessive marker to an
// obviously plural classroom/title noun ("Seasons's", "Nights's"). Keep the
// repair deliberately lexical: singular names that end in s ("Odysseus's",
// "James's") are grammatical and must not be rewritten by a suffix guess.
export const MALFORMED_CLEAR_PLURAL_POSSESSIVE_PATTERN =
  /\b(?:seasons|nights|methods|strategies|systems|stories|years|weeks|lessons|responses|checks|works|texts|readings|materials|facts|concepts|terms)(?:'|’)s\b/i;

export function repairMalformedClearPluralPossessives(value) {
  return String(value ?? '').replace(new RegExp(MALFORMED_CLEAR_PLURAL_POSSESSIVE_PATTERN.source, 'gi'), (match) =>
    match.slice(0, -1),
  );
}

export function cleanText(value, fallback = '') {
  return repairMalformedClearPluralPossessives(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '');
}

const OBJECTIVE_STEM_RE = /^students?\s+will\s+be\s+able\s+to:?$/i;

export function stripListPrefix(value) {
  return cleanText(value)
    .replace(/^\s*(?:[-*•]|\(?\d+(?:\.\d+)*[a-z]?[.):]?\)?|\(?[a-z][.)]\)?)\s*/i, '')
    .replace(/^\s*[:–—-]\s*/, '');
}

export function normalizeObjectiveText(value) {
  const stripped = stripListPrefix(value);
  const withoutStem = stripped.replace(/^students?\s+will\s+(?:be\s+able\s+to:?\s*)?/i, '').trim();
  if (withoutStem !== stripped.trim() && withoutStem) {
    return withoutStem.charAt(0).toUpperCase() + withoutStem.slice(1);
  }
  return withoutStem;
}

export function isObjectiveStemOnly(value) {
  return OBJECTIVE_STEM_RE.test(cleanText(value));
}

export function wordCount(value) {
  return (cleanText(value).match(/[A-Za-z0-9]+/g) || []).length;
}

export function splitList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitList);
  }
  // Split on newlines, semicolons, pipes, and bullets — but never on a
  // semicolon inside parentheses, so citations like
  // "Duke University Press (copyrighted text; library access)" stay whole.
  const text = String(value || '');
  const items = [];
  let current = '';
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === '\n' || char === '|' || char === '•' || (char === ';' && depth === 0)) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => stripListPrefix(item).trim()).filter(Boolean);
}

export function unique(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values.map((item) => cleanText(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

export function sentenceCase(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function stripTerminalPunctuation(value) {
  return cleanText(value).replace(/[.!?]+$/g, '');
}

// Source labels and model enums cross several classroom-facing boundaries.
// Keep their normalization in this dependency-free text leaf so the compiler
// can reuse one rule without inflating its already budgeted lazy chunk.
const CITATION_AUTHOR_SIGNAL_RE = /\b(?:contributors?|et\s+al)\b/i;
const NAME_PARTICLE_RE = /(?:^|\s)(?:van|von|de|da|der|den|del|di|la|le|el|bin|ibn|mac|mc|st)(?:\s|$)/i;
const CLASSROOM_SOURCE_LABELS = {
  digitalgov: 'Digital.gov',
  govuk: 'GOV.UK',
  w3c: 'W3C',
};

const INTERNAL_SOURCE_CUE_PATTERNS = [
  /^(?:fact[- ]ledger|verified[- ]quiz|language[- ]pair)[- ]projection$/i,
  /^(?:model|compiler)[- ]authored$/i,
  /^existing course map fields$/i,
];

export function isInternalSourceCue(value) {
  const text = stripTerminalPunctuation(cleanText(value));
  return Boolean(text && INTERNAL_SOURCE_CUE_PATTERNS.some((pattern) => pattern.test(text)));
}

function looksLikePersonNameCue(value) {
  const text = cleanText(value);
  if (!text || /[\d:/@]/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((word) => /^[A-Z][\w'’.-]*$/.test(word))) return false;
  return NAME_PARTICLE_RE.test(text) || words.some((word) => /^[A-Z]\.$/.test(word));
}

function isCitationShapedSourceCue(text) {
  if (/https?:|www\./i.test(text)) return true;
  if (CITATION_AUTHOR_SIGNAL_RE.test(text)) return true;
  return text.split(/\.\s+/).length >= 3 && /:\s*\S/.test(text);
}

export function humanSourceCueLabel(value, fallback) {
  // Knowledge kernels may carry a citation as a structured ledger row.
  // Classroom prose needs the human label, never JavaScript's default
  // "[object Object]" coercion.
  const sourceValue =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value.displayTitle ||
        value.title ||
        value.citation ||
        value.attribution ||
        value.source ||
        value.evidence ||
        value.locator ||
        value.sourceUrl ||
        value.url ||
        ''
      : value;
  const text = stripTerminalPunctuation(cleanText(sourceValue));
  if (!text) return fallback;
  if (isInternalSourceCue(text)) return fallback;
  if (looksLikePersonNameCue(text)) return fallback;
  if (!isCitationShapedSourceCue(text)) return text;
  const segments = text
    .split(/\.\s+/)
    .map((segment) =>
      stripTerminalPunctuation(cleanText(segment))
        .replace(/:\s*https?.*$/i, '')
        .trim(),
    )
    .filter(
      (segment) =>
        segment &&
        !/https?:|www\./i.test(segment) &&
        !/^(?:available|retrieved|accessed)\b/i.test(segment) &&
        !CITATION_AUTHOR_SIGNAL_RE.test(segment) &&
        !looksLikePersonNameCue(segment),
    );
  const title = segments.find((segment) => wordCount(segment) >= 2);
  return title || fallback;
}

function humanizeMachineTokens(value) {
  return cleanText(value).replace(/\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g, (token) => token.replace(/_/g, ' '));
}

export function humanizeClassroomSourceCue(value, fallback = 'the assigned course materials') {
  const withoutLocator = humanizeMachineTokens(
    humanSourceCueLabel(value, fallback)
      .replace(/\s*§\s*[A-Za-z0-9_-]+/g, '')
      .replace(/\s*\((?:open textbook|open license)(?:\s*,[^)]*)?\)/gi, ''),
  );
  const match = withoutLocator.match(/^(digitalgov|govuk|w3c)\s*:\s*(.+)$/i);
  if (!match) return withoutLocator || fallback;
  const publisher = CLASSROOM_SOURCE_LABELS[match[1].toLowerCase()];
  const title = match[2]
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');
  return title ? `${publisher}: ${title}` : publisher;
}

export function humanizeQuizText(value) {
  const sourceSafe = cleanText(value).replace(
    /\b(digitalgov|govuk|w3c)\s*:\s*([^§(]+?)(?=\s*§|\s*\((?:open textbook|open license)|$)/gi,
    (match) => humanizeClassroomSourceCue(match, match),
  );
  return humanizeMachineTokens(
    sourceSafe
      .replace(/\s*§\s*[A-Za-z0-9_-]+/g, '')
      .replace(/\s*\((?:open textbook|open license)(?:\s*,[^)]*)?\)/gi, '')
      // Weak local models occasionally close a prose question with a lone
      // math delimiter ("...supported?$"). A dollar after sentence
      // punctuation cannot be a useful closing inline-math token, so remove
      // it without touching legitimate prompts such as "Evaluate $x$".
      .replace(/([.!?])\s*\$$/, '$1'),
  );
}

export function escapeRegexLiteral(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "Title: 1. Title" echoes are minted when a model transcribes a numbered
// cell rendering back into an assessment title ("Autograded quiz: 1.
// Autograded quiz"). v0.15.187 (live crucible catch): the echo must be
// stripped where the registry row is BORN — the compiler deduped its own
// anchors while the graph/manifest kept the echoed title, so the grader
// searched artifacts for a string no document ever renders (exam-content P0).
export function removeNumberedAssessmentEchoes(value) {
  return cleanText(value)
    .replace(/\b(Lesson\s+\d+\s+[^.;\n]{3,160}?\(\d{1,3}%\)):\s*\d+\.\s*\1(?=$|[\s,.;:])/gi, '$1')
    .replace(/\b([^.;\n]{3,160}?\(\d{1,3}%\)):\s*\d+\.\s*\1(?=$|[\s,.;:])/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function dedupeNumberedAssessmentEcho(value) {
  const text = removeNumberedAssessmentEchoes(value);
  // Short, legitimate identities such as "Quiz", "Exam", and "Midterm"
  // can be echoed by the same weak-model list transcription. Requiring an
  // eight-character lead let "midterm: 1. midterm" escape into every
  // learner-facing artifact even though longer titles were repaired.
  const match = /^(.{3,140}?)\s*:\s*\d+\.\s*(.+)$/.exec(text);
  if (match) {
    const lead = stripTerminalPunctuation(match[1]);
    const tail = stripTerminalPunctuation(match[2]);
    if (lead && tail && lead.toLowerCase() === tail.toLowerCase()) return lead;
  }

  // A weak model can echo a complete, already-colonized title without the
  // list number: "X: prompt.: X: prompt.". Test every colon seam rather
  // than only the first one, because the title itself may legitimately
  // contain a colon. Equal normalized halves collapse to one identity;
  // ordinary "Label: prompt" titles stay untouched.
  for (let index = text.indexOf(':'); index >= 0; index = text.indexOf(':', index + 1)) {
    const leadText = cleanText(text.slice(0, index));
    const lead = stripTerminalPunctuation(leadText);
    const tail = stripTerminalPunctuation(text.slice(index + 1));
    if (lead && tail && lead.toLowerCase() === tail.toLowerCase()) return leadText;
  }
  return text;
}
