import { buildCourseContentIndex } from './courseContentIndex';

const EDIT_INTENT =
  /\b(?:add|apply|change|create|delete|edit|fix|generate|improve|insert|make|move|remove|rename|replace|rewrite|sync|update)\b/i;
const QUESTION_INTENT =
  /(?:\?|\b(?:can|could|define|describe|does|explain|how|is|should|summarize|tell|what|when|where|which|who|why)\b)/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lessonNumberFromQuestion(question) {
  const match = String(question || '').match(/\blesson\s*(\d{1,3})\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isReadOnlyCourseQuestion(question) {
  const text = cleanText(question);
  if (!text || text.startsWith('[AUTO-REVIEW]')) return false;
  return QUESTION_INTENT.test(text) && !EDIT_INTENT.test(text);
}

function splitEvidenceLines(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+|;\s+(?=[A-Z])/))
    .map((line) => cleanText(line.replace(/^[^:]{1,42}:\s*/, '').replace(/^(?:[-•*]|\d+[.)])\s*/, '')))
    .filter((line) => line.length >= 16);
}

function comparisonPairFromLine(line) {
  const match = cleanText(line).match(
    /\b(?:pair|pairs|compare|compares|contrast|contrasts)\s+([a-z][a-z0-9 %()/'-]{1,44}?)\s+(?:and|with|against)\s+([a-z][a-z0-9 %()/'-]{1,44}?)(?=\s+(?:with|before|after|because|while|when|to|for|then)\b|[.,;:]|$)/i,
  );
  if (!match) return null;
  const first = cleanText(match[1]);
  const second = cleanText(match[2]);
  if (first.split(' ').length > 6 || second.split(' ').length > 6) return null;
  return { first, second, evidence: cleanText(line) };
}

function findComparisonEvidence(entries) {
  for (const entry of entries) {
    for (const line of splitEvidenceLines(entry.text)) {
      const pair = comparisonPairFromLine(line);
      if (pair) return { ...pair, entry };
    }
  }
  return null;
}

function findInterpretationEvidence(entries, pair) {
  const firstTokens = pair.first
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3);
  const secondTokens = pair.second
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3);
  const candidates = [];
  for (const entry of entries) {
    for (const line of splitEvidenceLines(entry.text)) {
      const lower = line.toLowerCase();
      const pairHits = [firstTokens, secondTokens].filter((tokens) =>
        tokens.some((token) => lower.includes(token)),
      ).length;
      const interpretationHits = [
        /\b(?:account|affect|change|condition|context|interpret|saturation)\w*\b/i,
        /\b(?:mislead|rather than|not interchangeable|one convenient measurement)\b/i,
      ].filter((pattern) => pattern.test(line)).length;
      if (pairHits === 0 || interpretationHits === 0 || line === pair.evidence) continue;
      candidates.push({ line, score: pairHits * 3 + interpretationHits, entry });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.line.length - b.line.length);
  return candidates[0] || null;
}

function sourceLabel(entry, lessonNumber) {
  const lesson = entry?.anchor?.lessonTitle || `Lesson ${lessonNumber}`;
  const feature = entry?.featureLabel || 'course materials';
  return `${lesson} · ${feature}`;
}

function buildComparisonAnswer(question, entries, lessonNumber) {
  if (!/\b(?:two|pair|compare|comparison|contrast)\b/i.test(question)) return null;
  const pair = findComparisonEvidence(entries);
  if (!pair) return null;
  const interpretation = findInterpretationEvidence(entries, pair);
  const firstLower = pair.first.toLowerCase();
  const secondLower = pair.second.toLowerCase();

  let explanation =
    'The package uses this pair to support a decision with complementary evidence instead of treating one convenient measurement as a complete judgment.';
  if (
    (firstLower.includes('dissolved oxygen') && secondLower.includes('temperature')) ||
    (secondLower.includes('dissolved oxygen') && firstLower.includes('temperature'))
  ) {
    explanation =
      'Temperature changes how a dissolved-oxygen result should be interpreted, so the reading should be evaluated in physical context instead of treated as stand-alone proof of impairment.';
  }

  const context = interpretation ? ` The course also notes: ${interpretation.line.replace(/[.!?]+$/, '')}.` : '';
  const sources = [sourceLabel(pair.entry, lessonNumber)];
  if (interpretation?.entry && interpretation.entry !== pair.entry) {
    sources.push(sourceLabel(interpretation.entry, lessonNumber));
  }

  return {
    text: `Lesson ${lessonNumber} points students to **${pair.first}** and **${pair.second}**. ${explanation}${context}\n\nCourse evidence: ${[...new Set(sources)].join('; ')}.`,
    kind: 'course-evidence',
    lessonNumber,
    sources: [...new Set(sources)],
  };
}

/**
 * Answer narrow, read-only questions directly from the compiled package.
 *
 * This is deliberately conservative. It only returns an answer when the
 * question names a lesson and the package contains an explicit comparison
 * pair. Everything else falls through to the full Agent.
 */
export function buildScionCourseAnswer({ question, courseMap, deliverables } = {}) {
  if (!isReadOnlyCourseQuestion(question)) return null;
  const lessonNumber = lessonNumberFromQuestion(question);
  if (!lessonNumber) return null;

  const index = buildCourseContentIndex({ courseMap, deliverables });
  const entries = (index.entries || []).filter((entry) => entry?.anchor?.itemIndex === lessonNumber - 1);
  if (entries.length === 0) return null;

  return buildComparisonAnswer(question, entries, lessonNumber);
}

export const __private__ = {
  comparisonPairFromLine,
  isReadOnlyCourseQuestion,
  lessonNumberFromQuestion,
};
