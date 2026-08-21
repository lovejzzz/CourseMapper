const ARTIFACT_HEAD =
  '(?:memo|matrix|portfolio|brief|model|plan|report|proposal|presentation|essay|paper|instrument|dashboard|map|protocol|reflection|case study|project)';

const LOW_SIGNAL_TOKENS = new Set([
  'analysis',
  'applied',
  'assessment',
  'course',
  'evaluation',
  'final',
  'lesson',
  'program',
  'required',
  'student',
  'week',
]);

function cleanText(value = '') {
  return String(value || '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceCase(value = '') {
  const text = cleanText(value).replace(/^(?:a|an|the)\s+/i, '');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

function terms(value = '') {
  return (
    cleanText(value)
      .toLowerCase()
      .match(/[a-z][a-z-]{2,}/g) || []
  )
    .map((token) => (token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token))
    .filter((token) => !LOW_SIGNAL_TOKENS.has(token));
}

function unique(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = cleanText(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitComponents(value = '') {
  return unique(
    cleanText(value)
      .replace(/\b(?:and|plus)\b/gi, ',')
      .split(',')
      .map((item) =>
        sentenceCase(
          item.replace(/\b(?:are|is)\s+required\b.*$/i, '').replace(/\b(?:with|including|containing)\b.*$/i, ''),
        ),
      )
      .filter((item) => item && item.length <= 80),
  ).slice(0, 8);
}

function lessonIdentity(lesson = {}) {
  return cleanText(
    [
      lesson?.title,
      ...(Array.isArray(lesson?.sections)
        ? lesson.sections.flatMap((section) => [
            section?.topicSection,
            section?.learningGoals,
            section?.learningObjectives,
          ])
        : []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function explicitWeekBefore(sourceBrief, index) {
  const clauseStart = Math.max(
    sourceBrief.lastIndexOf('.', index),
    sourceBrief.lastIndexOf(';', index),
    sourceBrief.lastIndexOf('\n', index),
  );
  const prefix = sourceBrief.slice(clauseStart + 1, index);
  const matches = [...prefix.matchAll(/\b(?:week|lesson|module)\s*(\d{1,2})\b/gi)];
  return matches.length > 0 ? Number(matches.at(-1)[1]) : null;
}

function explicitWeekTopics(sourceBrief = '', lessonCount = 0) {
  return [...cleanText(sourceBrief).matchAll(/\b(?:week|lesson|module)\s*(\d{1,2})\s*:\s*([^.;]+)/gi)]
    .map((match) => ({ lessonNumber: Number(match[1]), identity: cleanText(match[2]) }))
    .filter((entry) => entry.lessonNumber >= 1 && entry.lessonNumber <= lessonCount && entry.identity);
}

function rankedLessonMatches(candidate, identities, occupied) {
  const candidateTerms = new Set(terms(candidate.title));
  return identities
    .map(({ lessonNumber, identity }) => {
      const identityTerms = new Set(terms(identity));
      const overlap = [...candidateTerms].filter((token) => identityTerms.has(token)).length;
      return { lessonNumber, overlap };
    })
    .filter((entry) => entry.overlap > 0 && !occupied.has(entry.lessonNumber))
    .sort((left, right) => right.overlap - left.overlap || left.lessonNumber - right.lessonNumber);
}

function chooseLessonNumber(candidate, lessons, occupied, weekTopics = []) {
  if (candidate.explicitLessonNumber >= 1 && candidate.explicitLessonNumber <= lessons.length) {
    return candidate.explicitLessonNumber;
  }
  const authoredMatch = rankedLessonMatches(candidate, weekTopics, occupied)[0];
  if (authoredMatch) return authoredMatch.lessonNumber;
  const draftIdentities = lessons.map((lesson, index) => ({
    lessonNumber: index + 1,
    identity: lessonIdentity(lesson),
  }));
  return rankedLessonMatches(candidate, draftIdentities, occupied)[0]?.lessonNumber || null;
}

function formatAssessmentTitle(assessment = {}) {
  const title = sentenceCase(assessment.title);
  const components = unique(assessment.requiredComponents || []);
  if (components.length === 0) return title;
  const componentList = components
    .map((component, index) => {
      if (index === components.length - 1 && components.length > 1) return `and ${component.toLowerCase()}`;
      return component.toLowerCase();
    })
    .join(components.length > 2 ? ', ' : ' ');
  return `${title} - required components: ${componentList}`;
}

/**
 * Recover explicitly requested assessment artifacts from a source brief.
 * This is intentionally narrow: only named artifact nouns are admitted, the
 * final/capstone container owns its component list, and non-final artifacts
 * must share a content term with a lesson (or carry an explicit week number).
 */
export function extractSourceBriefAssessmentContract(sourceBrief = '', lessons = []) {
  const text = cleanText(sourceBrief);
  if (!text || !Array.isArray(lessons) || lessons.length === 0) return null;

  const candidates = [];
  const weekTopics = explicitWeekTopics(text, lessons.length);
  const consumedRanges = [];
  const finalPattern = new RegExp(
    `\\b(?:a|the)\\s+(?:final|capstone|culminating)\\s+([a-z][a-z -]{0,70}?\\b${ARTIFACT_HEAD})\\s+(?:with|including|containing|comprising)\\s+([^.;]+)`,
    'i',
  );
  const finalMatch = text.match(finalPattern);
  if (finalMatch) {
    const title = sentenceCase(`Final ${finalMatch[1]}`);
    const requiredComponents = splitComponents(finalMatch[2]);
    candidates.push({
      title,
      requiredComponents,
      lessonNumber: lessons.length,
      matchReason: 'final-assessment-container',
      sourceClause: cleanText(finalMatch[0]),
    });
    consumedRanges.push([finalMatch.index, finalMatch.index + finalMatch[0].length]);
  }

  const artifactPattern = new RegExp(`\\b(?:a|an)\\s+((?:[a-z][a-z-]*\\s+){0,3}${ARTIFACT_HEAD})\\b`, 'gi');
  for (const match of text.matchAll(artifactPattern)) {
    const start = Number(match.index || 0);
    if (consumedRanges.some(([from, to]) => start >= from && start < to)) continue;
    const title = sentenceCase(match[1]);
    if (!title || /^(?:course|lesson|assessment)\s+(?:map|plan)$/i.test(title)) continue;
    candidates.push({
      title,
      requiredComponents: [],
      explicitLessonNumber: explicitWeekBefore(text, start),
      matchReason: 'named-artifact',
      sourceClause: cleanText(match[0]),
    });
  }

  const occupied = new Set(
    candidates.filter((candidate) => candidate.lessonNumber).map((candidate) => candidate.lessonNumber),
  );
  for (const candidate of candidates) {
    if (candidate.lessonNumber) continue;
    const lessonNumber = chooseLessonNumber(candidate, lessons, occupied, weekTopics);
    if (!lessonNumber) continue;
    candidate.lessonNumber = lessonNumber;
    occupied.add(lessonNumber);
  }

  const assessments = candidates
    .filter((candidate) => Number.isInteger(candidate.lessonNumber))
    .sort((left, right) => left.lessonNumber - right.lessonNumber)
    .map((candidate) => ({
      ...candidate,
      displayTitle: formatAssessmentTitle(candidate),
    }));
  if (assessments.length === 0) return null;
  return {
    protocol: 'coursemapper-source-brief-assessment-contract-v1',
    assessments,
    coveredLessonNumbers: assessments.map((assessment) => assessment.lessonNumber),
    claimBoundary:
      'This contract preserves explicitly named assessment artifacts and component requirements; it does not invent grading weights, due dates, or institutional policy.',
  };
}

export function assessmentContractForLesson(contract, lessonNumber) {
  if (contract?.protocol !== 'coursemapper-source-brief-assessment-contract-v1') return null;
  return contract.assessments?.find((assessment) => assessment.lessonNumber === Number(lessonNumber)) || null;
}

export function requiredAssessmentComponents(value = '') {
  const text = cleanText(value);
  const match = text.match(/\brequired components?\s*:\s*(.+)$/i);
  return match ? splitComponents(match[1]) : [];
}
