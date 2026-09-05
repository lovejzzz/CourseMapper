import { buildCourseContentIndex } from './courseContentIndex';

const STOP_WORDS = new Set([
  'and',
  'component',
  'components',
  'does',
  'final',
  'how',
  'lesson',
  'portfolio',
  'should',
  'show',
  'support',
  'the',
  'which',
]);

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lessonNumbersFromQuestion(question) {
  return [
    ...new Set(
      [...String(question || '').matchAll(/\blesson\s*(\d{1,3})\b/gi)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

export function isScionCourseHandoffQuestion(question) {
  return (
    lessonNumbersFromQuestion(question).length >= 2 &&
    /\b(?:connect|connection|handoff|lead|prepare|support|use)\w*\b/i.test(question)
  );
}

function splitEvidenceLines(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+|;\s+(?=[A-Z])/))
    .map((line) => cleanText(line.replace(/^[^:]{1,42}:\s*/, '').replace(/^(?:[-•*]|\d+[.)])\s*/, '')))
    .filter((line) => line.length >= 16);
}

function sourceLabel(entry, lessonNumber) {
  return `${entry?.anchor?.lessonTitle || `Lesson ${lessonNumber}`} · ${entry?.featureLabel || 'course materials'}`;
}

function preferredFeatureOrder(label) {
  return (
    {
      'Study Guides': 0,
      'Course FAQ': 1,
      'Lesson Plans': 2,
      'Slide Decks': 3,
      'Quiz & Exam Bank': 4,
      'Course Map': 5,
      Syllabus: 6,
    }[label] ?? 20
  );
}

function lineScore(line, tokens) {
  const text = cleanText(line);
  if (text.length < 24 || text.length > 520 || text.includes('?')) return null;
  if (
    /^(?:ask|have|invite|tell|prompt|require|remind|direct|instruct|seed|frame|open|close|group|circulate|debrief|pair)\b/i.test(
      text,
    ) ||
    /\[Note:\s*(?:ask|have|invite|tell|prompt|require|remind|direct|instruct)\b/i.test(text) ||
    /\]\s*\d+\s+minutes?\b/i.test(text) ||
    /\b(?:review notes|success criterion|estimated workload|course structure links|broader course objectives)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  const lower = text.toLowerCase();
  const matched = tokens.filter((token) => lower.includes(token));
  if (matched.length === 0) return null;
  const evidenceSignal = /\b(?:artifact|claim|data|decision|evidence|log|record|source|trace|verify)\w*\b/i.test(text);
  const actionSignal =
    /\b(?:analy[sz]e|apply|build|choose|compare|create|evaluate|explain|identify|interpret|revise)\w*\b/i.test(text);
  return { text, score: matched.length * 6 + (evidenceSignal ? 3 : 0) + (actionSignal ? 2 : 0) };
}

function strongestLessonFact(index, lessonNumber, tokens) {
  const candidates = [];
  for (const entry of index?.entries || []) {
    if (Number(entry?.anchor?.itemIndex) + 1 !== lessonNumber) continue;
    for (const line of splitEvidenceLines(entry.text)) {
      const scored = lineScore(line, tokens);
      if (scored) candidates.push({ ...scored, entry });
    }
  }
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      preferredFeatureOrder(left.entry.featureLabel) - preferredFeatureOrder(right.entry.featureLabel) ||
      left.text.length - right.text.length,
  );
  return candidates[0] || null;
}

function splitExplicitComponents(value) {
  return cleanText(value)
    .replace(/^(?:include|includes|must include|submit)\s+/i, '')
    .split(/\s*;\s*|\s*,\s*(?=[a-z0-9])|\s+\band\b\s+(?=[a-z0-9])/i)
    .map((item) =>
      cleanText(
        item
          .replace(/^(?:an?|the)\s+/i, '')
          .replace(/\s+(?:that|which)\s+.+$/i, '')
          .replace(/[.!?]+$/, ''),
      ),
    )
    .filter(
      (item) =>
        item.length >= 3 &&
        item.length <= 72 &&
        item.split(/\s+/).length <= 8 &&
        !/^(?:and|but|or)\b/i.test(item) &&
        !/\b(?:arranged|distinguish|easy to|label the|names? one|organized|should|must|are|were)\b/i.test(item) &&
        /\b(?:analysis|artifact|brief|chart|check|dataset|deck|essay|file|journal|ledger|log|map|memo|note|outline|plan|portfolio|presentation|prototype|record|reflection|report|response|set|trail|worksheet)s?\b$/i.test(
          item,
        ),
    );
}

function explicitPortfolioComponents(index) {
  const components = [];
  for (const entry of index?.entries || []) {
    const entryText = String(entry.text || '');
    if (['Assignment Briefs', 'Syllabus', 'Course Map'].includes(entry.featureLabel)) {
      for (const rawLine of entryText.split(/\n+/)) {
        const line = cleanText(rawLine);
        const labeled = line.match(
          /^(?:deliverables?|final (?:portfolio|project) components?|portfolio components?|required artifacts?):\s*(.+)$/i,
        );
        const sentence = line.match(/\b(?:final portfolio|final project|portfolio)\s+must include\s+(.+?)(?:[.!?]|$)/i);
        const value = labeled?.[1] || sentence?.[1];
        if (value) components.push(...splitExplicitComponents(value));
      }
    }
    for (const match of entryText.matchAll(
      /\b(?:source ledger|data-cleaning log|cleaning log|annotated chart set|annotated chart|uncertainty note|accessibility check|revision memo|evidence trail|source notes?)\b/gi,
    )) {
      components.push(cleanText(match[0]));
    }
  }
  return [...new Set(components.map((item) => item.toLowerCase()))].map((lower) =>
    components.find((item) => item.toLowerCase() === lower),
  );
}

function relevantComponents(components, tokens) {
  const distinct = components.filter((component, index, all) => {
    const normalized = component
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return !all.some((candidate, candidateIndex) => {
      if (candidateIndex === index) return false;
      const other = candidate
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      return other.length > normalized.length && other.includes(normalized);
    });
  });
  return distinct
    .map((component) => ({
      component,
      score:
        tokens.filter((token) => component.toLowerCase().includes(token)).length * 4 +
        (/\b(?:chart|clean\w* log|ledger|revision|source|uncertainty|visual)\b/i.test(component) ? 3 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.component.localeCompare(right.component))
    .slice(0, 6)
    .map(({ component }) => component);
}

export function buildScionCourseHandoffAnswer({ question, courseMap, deliverables } = {}) {
  const lessonNumbers = lessonNumbersFromQuestion(question);
  if (!isScionCourseHandoffQuestion(question)) return null;
  const tokens = [
    ...new Set(
      cleanText(question)
        .toLowerCase()
        .replace(/[^a-z0-9'\s-]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)),
    ),
  ];
  if (tokens.length === 0) return null;
  const index = buildCourseContentIndex({ courseMap, deliverables });
  const [fromLesson, toLesson] = lessonNumbers;
  const fromFact = strongestLessonFact(index, fromLesson, tokens);
  const toFact = strongestLessonFact(index, toLesson, tokens);
  if (!fromFact || !toFact) return null;

  const fromTitle = fromFact.entry?.anchor?.lessonTitle || `Lesson ${fromLesson}`;
  const toTitle = toFact.entry?.anchor?.lessonTitle || `Lesson ${toLesson}`;
  const components = relevantComponents(explicitPortfolioComponents(index), tokens);
  const componentText =
    components.length > 0
      ? `The package explicitly names these artifacts as the clearest places to preserve that handoff: ${components
          .map((component) => `**${component}**`)
          .join(', ')}.`
      : 'The compiled package does not explicitly name a final-portfolio component for this handoff, so I would not invent one.';

  return {
    text: `${fromTitle} establishes the evidence side: ${fromFact.text.replace(/[.!?]+$/, '')}. ${toTitle} carries that evidence into the next decision: ${toFact.text.replace(/[.!?]+$/, '')}. The connection is inspectable when the later decision can be traced back to the earlier evidence rather than presented as an unsupported choice.\n\n${componentText}`,
    kind: 'course-evidence',
    lessonNumber: fromLesson,
    lessonNumbers: [fromLesson, toLesson],
    sources: [sourceLabel(fromFact.entry, fromLesson), sourceLabel(toFact.entry, toLesson)],
  };
}
