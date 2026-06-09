/**
 * courseContentIndex.js — the agent's reading copy of the course.
 *
 * Renders every deliverable item (and the course map) to deterministic,
 * labeled plain text — the same flattening the CSV exports use, so the text
 * tracks what instructors actually receive — and provides lexical search
 * with stable anchors. No provider calls, no async, cheap enough to rebuild
 * on demand after edits.
 *
 * Anchors are { featureId, itemIndex, lessonTitle } and remain stable for
 * navigation and follow-up tool calls.
 */

import { deliverableToCsvRows } from './exporters/csvExporter';
import { resolveFeatureLabel } from './exporters/exporterUtils';

const MAX_RENDERED_CHARS = 8000;

function cleanCell(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Render one deliverable item (usually one lesson's artifact) as labeled
 * plain text. Returns '' when the item does not exist.
 */
export function renderDeliverableItemText(featureId, data, itemIndex) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  const row = rows?.[itemIndex];
  if (!row) return '';
  const lines = [];
  for (let column = 0; column < headers.length; column += 1) {
    const value = cleanCell(row[column]);
    if (!value) continue;
    lines.push(`${headers[column]}: ${value}`);
  }
  return lines.join('\n');
}

/** Render every item of a deliverable. Returns [{ itemIndex, title, text }]. */
export function renderDeliverableTexts(featureId, data) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const titleColumn = headers.findIndex((header) => /lesson|title|week/i.test(header));
  return rows.map((row, itemIndex) => {
    const lines = [];
    for (let column = 0; column < headers.length; column += 1) {
      const value = cleanCell(row[column]);
      if (!value) continue;
      lines.push(`${headers[column]}: ${value}`);
    }
    return {
      itemIndex,
      title: titleColumn >= 0 ? cleanCell(row[titleColumn]) : `Item ${itemIndex + 1}`,
      text: lines.join('\n'),
    };
  });
}

function renderCourseMapTexts(courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  return lessons.map((lesson, itemIndex) => {
    const lines = [`Lesson: ${cleanCell(lesson?.title) || `Lesson ${itemIndex + 1}`}`];
    const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
    sections.forEach((section, sectionIndex) => {
      for (const [field, value] of Object.entries(section || {})) {
        const text = cleanCell(value);
        if (!text) continue;
        lines.push(`Section ${sectionIndex + 1} ${field}: ${text}`);
      }
    });
    return { itemIndex, title: cleanCell(lesson?.title) || `Lesson ${itemIndex + 1}`, text: lines.join('\n') };
  });
}

/**
 * Build the full content index: one entry per deliverable item plus one per
 * course-map lesson. Only deliverables with status "done" are indexed.
 */
export function buildCourseContentIndex({ courseMap, deliverables } = {}) {
  const entries = [];
  for (const item of renderCourseMapTexts(courseMap)) {
    entries.push({
      anchor: { featureId: 'courseMap', itemIndex: item.itemIndex, lessonTitle: item.title },
      featureLabel: 'Course Map',
      text: item.text,
    });
  }
  for (const [featureId, entry] of Object.entries(deliverables || {})) {
    if (featureId === 'courseMap' || entry?.status !== 'done' || !entry?.data) continue;
    let items = [];
    try {
      items = renderDeliverableTexts(featureId, entry.data);
    } catch {
      continue; // unknown custom shapes simply stay unindexed
    }
    for (const item of items) {
      entries.push({
        anchor: { featureId, itemIndex: item.itemIndex, lessonTitle: item.title },
        featureLabel: resolveFeatureLabel(featureId),
        text: item.text,
      });
    }
  }
  return { entries, builtAt: Date.now() };
}

// ── Lexical search ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'are',
  'was',
  'were',
  'will',
  'have',
  'has',
  'had',
  'not',
  'but',
  'about',
  'where',
  'when',
  'what',
  'which',
  'how',
  'who',
  'does',
  'els',
  'los',
  'las',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function buildSnippet(text, queryTokens, radius = 140) {
  const lower = text.toLowerCase();
  let best = -1;
  for (const token of queryTokens) {
    const position = lower.indexOf(token);
    if (position !== -1 && (best === -1 || position < best)) best = position;
  }
  if (best === -1) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, best - radius);
  const end = Math.min(text.length, best + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Search the index. Returns up to `limit` hits sorted by score:
 * [{ anchor, featureLabel, snippet, score, matchedTerms }]
 */
export function searchCourseContent(index, query, { limit = 8 } = {}) {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];
  const phrase = String(query || '')
    .toLowerCase()
    .trim();
  const hits = [];
  for (const entry of index?.entries || []) {
    const lower = entry.text.toLowerCase();
    let score = 0;
    const matchedTerms = [];
    for (const token of queryTokens) {
      let from = 0;
      let count = 0;
      while (count < 8) {
        const at = lower.indexOf(token, from);
        if (at === -1) break;
        count += 1;
        from = at + token.length;
      }
      if (count > 0) {
        matchedTerms.push(token);
        score += 1 + Math.min(count - 1, 3) * 0.25;
      }
    }
    if (matchedTerms.length === 0) continue;
    // All terms present beats high frequency of one term.
    score += (matchedTerms.length / queryTokens.length) * 2;
    if (phrase.length >= 6 && lower.includes(phrase)) score += 3;
    hits.push({
      anchor: entry.anchor,
      featureLabel: entry.featureLabel,
      snippet: buildSnippet(entry.text, queryTokens),
      score: Math.round(score * 100) / 100,
      matchedTerms,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Cap rendered text honestly: truncate at a line boundary with a count note. */
export function capRenderedText(text, maxChars = MAX_RENDERED_CHARS) {
  if (text.length <= maxChars) return { text, truncated: false };
  const slice = text.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf('\n');
  const kept = lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak) : slice;
  return {
    text: `${kept}\n… [${text.length - kept.length} more characters — call again with a narrower target]`,
    truncated: true,
  };
}
