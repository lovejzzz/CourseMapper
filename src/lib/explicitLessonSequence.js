function cleanText(value, max = 300) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const COUNT_WORD =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d{1,2})';

const COUNT_WORD_VALUES = new Map(
  [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ].map((word, index) => [word, index + 1]),
);

const DECLARED_COURSE_COUNT_RE = new RegExp(
  `\\b(${COUNT_WORD})[\\s-]+(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|sessions?|modules?|weeks?)\\b`,
  'i',
);

const LABELED_SEQUENCE_HEADER_RE = new RegExp(
  `\\b(?:` +
    `lessons?\\s+(?:cover|include)|` +
    `(?:use|follow|preserve)\\s+(?:(?:this|the)\\s+)?(?:exact\\s+)?(?:lesson|session|module)\\s+sequence|` +
    `(?:use|follow|preserve)\\s+(?:exactly\\s+)?(?:(?:these|the)\\s+)?(?:${COUNT_WORD}\\s+)?(?:lessons?|sessions?|modules?)\\s+in\\s+(?:this\\s+)?order|` +
    `(?:build|create|generate|make)\\s+(?:exactly\\s+)?(?:${COUNT_WORD}[\\s-]+)?(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|sessions?|modules?)|` +
    `(?:with|use|cover|include)\\s+(?:(?:this|these|the)\\s+)?(?:exact\\s+)?(?:${COUNT_WORD}[\\s-]+)?(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|focus(?:es)?|topics?|modules?)(?:\\s+sequence)?|` +
    `(?:distinct\\s+)?(?:weekly\\s+)?(?:lessons?|focus(?:es)?|topics?|modules?)` +
    `)\\s*:\\s*`,
  'i',
);

const EXACT_COUNTED_SEQUENCE_HEADER_RE = new RegExp(
  `\\b(?:exactly\\s+)?(${COUNT_WORD})\\s+(?:distinct\\s+)?(?:lessons?|sessions?|modules?)\\s*:\\s*`,
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

function exactCountedCommaSequence(text, expectedCount) {
  const header = EXACT_COUNTED_SEQUENCE_HEADER_RE.exec(String(text || ''));
  if (!header) return [];
  const countWords = [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ];
  const declaredCount = /^\d+$/.test(header[1]) ? Number(header[1]) : countWords.indexOf(header[1].toLowerCase()) + 1;
  if (!(declaredCount >= 2 && declaredCount <= 52)) return [];
  if (Number.isInteger(expectedCount) && declaredCount !== expectedCount) return [];
  const listStart = header.index + header[0].length;
  const listBlock = String(text)
    .slice(listStart)
    .split(/\n\s*\n|[.!?](?:\s|$)/)[0];
  // Semicolons are the stronger item boundary, especially when one lesson
  // title contains its own commas ("accessible forms, testing, and
  // remediation"). Let the labelled-sequence parser below handle that form;
  // comma splitting here collapsed the first two numbered lessons together
  // and then mistook the third lesson's internal commas for new lessons.
  if (listBlock.includes(';')) return [];
  const hasOxfordBoundary = /\s*,\s*and\s+/i.test(listBlock);
  const withoutOxfordBoundary = listBlock.replace(/\s*,\s*and\s+/gi, ', ');
  // Once an Oxford-comma boundary has already separated the final item, a
  // later "and" belongs to that item's title ("testing and remediation").
  // Treating it as another delimiter silently turns an exact N-item contract
  // into N+1 items and makes the whole sequence fall back to "Session N
  // topic". The second replacement is only for non-Oxford "A, B and C".
  const normalized = hasOxfordBoundary
    ? withoutOxfordBoundary
    : withoutOxfordBoundary.replace(/\s+and\s+([^,]+)$/i, ', $1');
  if (!normalized.includes(',')) return [];
  const items = normalized
    .split(/\s*,\s*/)
    .map(cleanSequenceItem)
    .filter((item) => item.length >= 3 && item.length <= 120);
  return items.length === declaredCount ? items : [];
}

/**
 * Extract a user-authored, ordered one-topic-per-lesson contract. Admission is
 * deliberately narrow: a labelled header plus semicolon-delimited or inline
 * numbered items, an exact counted colon list, or at least two numbered lines.
 * Ordinary prose lists never become a schedule.
 */
export function extractExplicitLessonSequence(source = '', { expectedCount = null } = {}) {
  const text = String(source || '');
  const exactCounted = exactCountedCommaSequence(text, expectedCount);
  if (exactCounted.length > 0) return exactCounted;
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

function declaredCourseCount(source = '') {
  const token = DECLARED_COURSE_COUNT_RE.exec(String(source || ''))?.[1]?.toLowerCase();
  if (!token) return null;
  const parsed = /^\d+$/.test(token) ? Number(token) : COUNT_WORD_VALUES.get(token);
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 52 ? parsed : null;
}

function compactCoverageTopics(source = '') {
  const text = String(source || '');
  const patterns = [
    /\bin\s+order,\s+(?:the\s+)?(?:lessons?|sessions?|modules?)\s+(?:teach|cover|address|examine)\s+([^.!?\n]{8,500})[.!?](?:\s|$)/i,
    /\b(?:students?|learners?)\s+(?:will\s+)?(?:learn|study|examine|investigate|practice)\s+([^.!?\n]{8,500})[.!?](?:\s|$)/i,
    /\b(?:course|class|seminar|studio|workshop)\b[^.!?\n]{0,80}?\b(?:focused\s+on|on|about|covering|including)\s+([^.!?\n]{8,500})[.!?](?:\s|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;
    const topics = extractExplicitCoverageTopics(`Cover ${match[1]}.`);
    if (topics.length >= 3) return topics;
  }
  return [];
}

/**
 * Recover a named course arc written as “progress from A and B through C, D,
 * and E.”  This is not treated as an exact one-topic-per-lesson schedule: it
 * is ordered coverage that a planner may deepen when the requested lesson
 * count is larger. Requiring both the from/through frame and a list of at
 * least three bounded nouns keeps ordinary prose from becoming a curriculum.
 */
export function extractNamedProgressionTopics(source = '') {
  const text = String(source || '');
  const match =
    /\b(?:progress|proceed|move|advance|develop|build)\s+from\s+([^.!?\n]{3,180}?)\s+through\s+([^.!?\n]{3,600})[.!?](?:\s|$)/i.exec(
      text,
    );
  if (!match) return [];

  const rightBlock = match[2].replace(/\s*,\s*and\s+/gi, ', ');
  const right = rightBlock
    .split(/\s*,\s*/)
    .map(cleanSequenceItem)
    .filter((topic) => topic.length >= 3 && topic.length <= 120);
  if (right.length < 2) return [];

  const leftBlock = match[1].trim();
  const left = /\s+and\s+/i.test(leftBlock)
    ? leftBlock
        .split(/\s+and\s+/i)
        .map(cleanSequenceItem)
        .filter((topic) => topic.length >= 3 && topic.length <= 120)
    : [cleanSequenceItem(leftBlock)].filter(Boolean);
  const topics = [...left, ...right];
  return topics.length >= 3 ? [...new Set(topics.map((topic) => topic.toLowerCase()))].slice(0, 52) : [];
}

/**
 * Return the source-authored one-topic-per-lesson contract together with its
 * provenance. A natural-language coverage list is admitted only when the same
 * source declares a course count and the list has exactly that many bounded
 * topics. This keeps a nine-topic list in a ten-session syllabus as coverage,
 * while making an exact five-topic/five-lesson brief replayable and auditable.
 */
export function extractOrderedLessonContract(source = '', { expectedCount = null } = {}) {
  const explicit = extractExplicitLessonSequence(source, { expectedCount });
  if (explicit.length >= 2) {
    return {
      mode: 'explicit-lesson-sequence',
      declaredCount: explicit.length,
      topics: explicit,
    };
  }

  const declaredCount = declaredCourseCount(source);
  if (!declaredCount || (Number.isInteger(expectedCount) && declaredCount !== expectedCount)) return null;
  const coverage = [...extractExplicitCoverageTopics(source), ...compactCoverageTopics(source)];
  const topics = [...new Set(coverage.map((topic) => cleanSequenceItem(topic)).filter(Boolean))];
  if (topics.length !== declaredCount) return null;
  return {
    mode: 'count-matched-coverage-list',
    declaredCount,
    topics,
  };
}

const COVERAGE_LIST_HEADER_RE =
  /\b(?:cover|covers|covering|include|includes|including)\s+([^.!?\n]{8,800})[.!?](?:\s|$)/i;

function isPerLessonOutputRequirement(text, match) {
  const prefix = String(text || '').slice(Math.max(0, Number(match?.index || 0) - 120), Number(match?.index || 0));
  return /\b(?:each|every)\s+(?:lesson|session|module|week)\b[^.!?\n]{0,80}\b(?:must|should|will|needs?\s+to|is\s+to)\s*$/i.test(
    prefix,
  );
}

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
  // “Each lesson must include a worked procedure, calculation record, …”
  // declares what every lesson must produce; those nouns are not curriculum
  // topics. Keeping this boundary here protects both zero-model composition
  // and model prompts because they share this coverage extractor.
  if (isPerLessonOutputRequirement(text, match)) return [];
  const block = match[1].replace(/\s*,\s*and\s+/gi, ', ');
  if (!block.includes(',')) return [];
  const topics = block
    .split(/\s*,\s*/)
    .map(cleanSequenceItem)
    .filter((topic) => topic.length >= 3 && topic.length <= 120)
    .filter((topic) => !/^(?:assessments?|assignments?|activities|materials?|rubrics?|readings?)\b/i.test(topic));
  return topics.length >= 3 ? [...new Set(topics.map((topic) => topic.toLowerCase()))].slice(0, 24) : [];
}
