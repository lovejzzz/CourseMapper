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
      .replace(/^\s*(?:(?:lesson|week|module)\s*)?\d{1,2}\s*[:.)\-–—]\s*/i, '')
      .replace(/[.;:,]+$/g, ''),
    160,
  );
}

/**
 * Extract a user-authored, ordered one-topic-per-lesson contract. Admission is
 * deliberately narrow: a labelled header plus semicolon-delimited items, or
 * at least two numbered lines. Ordinary prose lists never become a schedule.
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
  }

  const numbered = text
    .split('\n')
    .map((line) => line.match(/^\s*(?:(?:lesson|week|module)\s*)?\d{1,2}\s*[:.)\-–—]\s*(.+)$/i)?.[1])
    .map(cleanSequenceItem)
    .filter(Boolean);
  if (numbered.length < 2 || (Number.isInteger(expectedCount) && numbered.length !== expectedCount)) return [];
  return numbered.slice(0, 52);
}
