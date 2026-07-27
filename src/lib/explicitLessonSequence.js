function cleanText(value, max = 300) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const COUNT_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d{1,2})';

const LABELED_SEQUENCE_HEADER_RE = new RegExp(
  `\\b(?:` +
    `lessons?\\s+(?:cover|include)|` +
    `(?:use|follow|preserve)\\s+(?:(?:this|the)\\s+)?(?:exact\\s+)?(?:lesson|session|module)\\s+sequence|` +
    `(?:build|create|generate|make)\\s+(?:exactly\\s+)?(?:${COUNT_WORD}\\s+)?(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|sessions?|modules?)|` +
    `(?:with|use|cover|include)\\s+(?:(?:these|the)\\s+)?(?:${COUNT_WORD}\\s+)?(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|focus(?:es)?|topics?|modules?)|` +
    `(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|focus(?:es)?|topics?|modules?)` +
    `)\\s*:\\s*`,
  'i',
);

function cleanSequenceItem(value) {
  return cleanText(
    String(value || '')
      .replace(/^and\s+/i, '')
      .replace(/^(?:an?|the)\s+/i, '')
      .replace(/^\s*(?:(?:lesson|week|session|module)\s*)?\d{1,2}\s*[:.)\-–—]\s*/i, '')
      .replace(/[.;:,]+$/g, ''),
    160,
  );
}

function inlineNumberedSequenceItems(block = '') {
  const text = String(block || '');
  const markerPattern = /(?:^|,\s*|\s+and\s+)(?:(?:lesson|week|session|module)\s*)?(\d{1,2})\s*[:.)\-–—]\s*/gi;
  const markers = [...text.matchAll(markerPattern)];
  if (markers.length < 2) return [];
  const ordinals = markers.map((marker) => Number(marker[1]));
  if (!ordinals.every((ordinal, index) => ordinal === index + 1)) return [];
  return markers
    .map((marker, index) => {
      const start = Number(marker.index) + marker[0].length;
      const end = index + 1 < markers.length ? Number(markers[index + 1].index) : text.length;
      return cleanSequenceItem(text.slice(start, end));
    })
    .filter(Boolean);
}

/**
 * Extract a user-authored, ordered one-topic-per-lesson contract. Admission is
 * deliberately narrow: a labelled header plus semicolon-delimited or inline
 * numbered items, or at least two numbered lines. Ordinary prose lists never
 * become a schedule.
 */
export function extractExplicitLessonSequence(source = '', { expectedCount = null } = {}) {
  const text = String(source || '');
  const header = LABELED_SEQUENCE_HEADER_RE.exec(text);
  if (header) {
    const listStart = header.index + header[0].length;
    const listBlock = text.slice(listStart).split(/\n\s*\n|[.!?](?:\s|$)/)[0];
    if (listBlock.includes(';')) {
      const items = listBlock
        .split(/\s*;\s*/)
        .map(cleanSequenceItem)
        .filter(Boolean);
      if (items.length >= 2 && (!Number.isInteger(expectedCount) || items.length === expectedCount)) {
        return items.slice(0, 52);
      }
    }
    const inlineNumbered = inlineNumberedSequenceItems(listBlock);
    if (inlineNumbered.length >= 2 && (!Number.isInteger(expectedCount) || inlineNumbered.length === expectedCount)) {
      return inlineNumbered.slice(0, 52);
    }
  }

  const numbered = text
    .split('\n')
    .map((line) => line.match(/^\s*(?:(?:lesson|week|session|module)\s*)?\d{1,2}\s*[:.)\-–—]\s*(.+)$/i)?.[1])
    .map(cleanSequenceItem)
    .filter(Boolean);
  if (numbered.length < 2 || (Number.isInteger(expectedCount) && numbered.length !== expectedCount)) return [];
  return numbered.slice(0, 52);
}

const COVERAGE_LIST_HEADER_RE =
  /\b(?:cover|covers|covering|include|includes|including)\s+([^.!?\n]{8,800})[.!?](?:\s|$)/i;

/**
 * Extract a source-authored coverage list without pretending it is an ordered
 * one-topic-per-session schedule. This deliberately accepts comma lists such
 * as "Cover atmospheric chemistry, water quality, ... and environmental
 * justice." only when at least three bounded topic phrases are present.
 *
 * The distinction from `extractExplicitLessonSequence` is important: nine
 * required topics may legitimately live inside a ten-session course. The
 * course-map continuation controller uses this list only to name topics that
 * the current map has not covered; it never assigns the list to lesson slots
 * wholesale.
 */
export function extractExplicitCoverageTopics(source = '') {
  const text = String(source || '');
  const match = COVERAGE_LIST_HEADER_RE.exec(text);
  if (!match?.[1]) return [];
  const block = match[1].replace(/\s*,\s*and\s+/gi, ', ');
  if (!block.includes(',')) return [];
  const topics = block
    .split(/\s*,\s*/)
    .map(cleanSequenceItem)
    .filter((topic) => topic.length >= 3 && topic.length <= 120)
    .filter((topic) => !/^(?:assessments?|assignments?|activities|materials?|rubrics?|readings?)\b/i.test(topic));
  return topics.length >= 3 ? [...new Set(topics.map((topic) => topic.toLowerCase()))].slice(0, 24) : [];
}
