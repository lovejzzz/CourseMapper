import { extractExplicitLessonSequence } from '../explicitLessonSequence.js';

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const GENERIC_TOPIC_WORDS = new Set([
  'and',
  'course',
  'exam',
  'final',
  'for',
  'from',
  'introduction',
  'lesson',
  'midterm',
  'overview',
  'project',
  'review',
  'the',
  'with',
]);

function topicTokens(value) {
  return (
    clean(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/[a-z0-9]+/g)
      ?.map((token) => {
        if (/^(?:stellar|stars?)$/.test(token)) return 'star';
        if (/^(?:spectra|spectral|spectrum)$/.test(token)) return 'spectr';
        if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
        if (token.length > 5 && token.endsWith('es')) return token.slice(0, -2);
        if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
        return token;
      })
      .filter((token) => token.length >= 3 && !GENERIC_TOPIC_WORDS.has(token)) || []
  );
}

function topicAligned(title, expectedTopic) {
  const expected = new Set(topicTokens(expectedTopic));
  return topicTokens(title).some((token) => expected.has(token));
}

/**
 * An explicit, ordered "Lessons cover:" brief is source truth. Three or more
 * lessons carrying the same exact cover title means the plan collapsed even
 * if every exported file is internally consistent. This caught a real
 * 14-topic Nutrition run that omitted fiber and vitamins, then emitted three
 * "Final project" lessons while the old grader still awarded B/89.
 */
export function checkExplicitLessonSequenceReuse(findings, byLesson, course = {}) {
  const source = `${course?.prompt || ''} ${course?.description || ''} ${course?.sourceText || ''}`;
  const topics = extractExplicitLessonSequence(source);
  if (topics.length < 2 || !(byLesson instanceof Map)) return;

  const byTitle = new Map();
  for (const [lessonNumber, entries] of byLesson) {
    for (const entry of entries || []) {
      const key = titleKey(entry?.title);
      if (!key) continue;
      if (!byTitle.has(key)) byTitle.set(key, { title: clean(entry.title), lessons: new Set(), paths: [] });
      const group = byTitle.get(key);
      group.lessons.add(Number(lessonNumber));
      group.paths.push(entry.path);
    }
  }

  let repeatedSequence = false;
  for (const group of byTitle.values()) {
    const lessons = [...group.lessons].filter(Number.isFinite).sort((left, right) => left - right);
    if (lessons.length < 3) continue;
    findings.add({
      severity: 'P0',
      dimension: 'consistency',
      file: group.paths[0] || 'lesson sequence',
      detail: `Explicit source lesson sequence collapsed into repeated "${group.title}" sessions`,
      evidence: `Lessons ${lessons.join(', ')} share the same title although the source lists an ordered topic sequence`,
    });
    repeatedSequence = true;
  }
  if (repeatedSequence) return;

  const lessonNumbers = [...byLesson.keys()]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (topics.length !== lessonNumbers.length || lessonNumbers.some((number, index) => number !== index + 1)) return;

  const mismatches = lessonNumbers.flatMap((lessonNumber, index) => {
    const actualTitle = clean(byLesson.get(lessonNumber)?.[0]?.title);
    if (topicAligned(actualTitle, topics[index])) return [];
    return [{ lessonNumber, expected: topics[index], actual: actualTitle || '(missing title)' }];
  });
  // Two independent lexical misses are enough to prove that an explicit
  // one-topic-per-lesson sequence shifted or dropped content. One stays
  // advisory-silent because a concise synonym may share no surface token.
  if (mismatches.length < 2) return;
  findings.add({
    severity: 'P0',
    dimension: 'consistency',
    file: 'lesson sequence',
    detail: `Explicit source lesson sequence omits or shifts ${mismatches.length} ordered topic(s)`,
    evidence: mismatches
      .slice(0, 5)
      .map(({ lessonNumber, expected, actual }) => `L${lessonNumber} expected "${expected}" but found "${actual}"`)
      .join(' | '),
  });
}
