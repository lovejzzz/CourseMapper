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

export function cleanText(value, fallback = '') {
  return String(value ?? fallback)
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
    .replace(/\b(Lesson\s+\d+\s+[^.;\n]{8,160}?\(\d{1,3}%\)):\s*\d+\.\s*\1(?=$|[\s,.;:])/gi, '$1')
    .replace(/\b([^.;\n]{8,160}?\(\d{1,3}%\)):\s*\d+\.\s*\1(?=$|[\s,.;:])/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function dedupeNumberedAssessmentEcho(value) {
  const text = removeNumberedAssessmentEchoes(value);
  const match = /^(.{8,140}?)\s*:\s*\d+\.\s*(.+)$/.exec(text);
  if (!match) return text;
  const lead = stripTerminalPunctuation(match[1]);
  const tail = stripTerminalPunctuation(match[2]);
  if (lead && tail && lead.toLowerCase() === tail.toLowerCase()) return lead;
  return text;
}
