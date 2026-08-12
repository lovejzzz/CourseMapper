const GENERIC_TITLE_TOKENS = new Set([
  'analysis',
  'analysi',
  'and',
  'applied',
  'course',
  'foundations',
  'foundation',
  'introduction',
  'introductory',
  'for',
  'in',
  'lesson',
  'of',
  'practice',
  'the',
  'to',
  'with',
]);

function normalizedTokens(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const normalized = token
        .replace(/ies$/u, 'y')
        .replace(/(?<!s)ses$/u, 's')
        .replace(/(?<!s)s$/u, '');
      if (/^numeric(?:al|ally)?$/u.test(normalized)) return 'number';
      return normalized;
    });
}

function lessonLabel(lesson = {}, index = 0) {
  return String(lesson?.title || `Lesson ${index + 1}`)
    .replace(/^\s*lesson\s+\d+\s*[:.–—-]\s*/i, '')
    .trim();
}

function targetTokens(label = '') {
  const tokens = normalizedTokens(label).filter((token) => !GENERIC_TITLE_TOKENS.has(token));
  return tokens.length > 0 ? [...new Set(tokens)] : [...new Set(normalizedTokens(label))];
}

function orderedWindow(sourceTokens, wanted, startAt = 0) {
  if (wanted.length === 0) return null;
  const minimum = Math.max(1, Math.ceil(wanted.length * 0.75));
  const windowSize = Math.max(8, wanted.length * 3);
  for (let index = Math.max(0, startAt); index < sourceTokens.length; index += 1) {
    if (sourceTokens[index] !== wanted[0]) continue;
    const window = new Set(sourceTokens.slice(index, index + windowSize));
    const matched = wanted.filter((token) => window.has(token));
    if (matched.length < minimum) continue;
    return {
      tokenStart: index,
      tokenEnd: Math.min(sourceTokens.length, index + windowSize),
      targetTokens: wanted,
      matchedTokens: matched,
      coverage: Number((matched.length / wanted.length).toFixed(3)),
    };
  }
  return null;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function orderedSequenceContinuity(matches = []) {
  const gaps = matches.slice(1).map((match, index) => ({
    fromLessonNumber: matches[index].lessonNumber,
    toLessonNumber: match.lessonNumber,
    tokenGap: match.tokenStart - matches[index].tokenStart,
  }));
  const typicalGap = median(gaps.map((gap) => gap.tokenGap));
  // A later topic can still be an ordered subset while silently skipping a
  // large block of the governing curriculum. Compare every transition with
  // the course's own spacing rather than assuming chapter numbers or a
  // discipline-specific calendar format.
  const maximumContinuousGap = Math.max(45, Math.ceil(typicalGap * 3));
  const discontinuities = gaps.filter((gap) => gap.tokenGap > maximumContinuousGap);
  return {
    protocol: 'coursemapper-governing-source-sequence-continuity-v1',
    status: discontinuities.length === 0 ? 'continuous' : 'discontinuous',
    typicalTokenGap: typicalGap,
    maximumContinuousGap,
    gaps,
    discontinuities,
    claimBoundary:
      'Continuity detects unusually large omissions relative to this source sequence; it does not infer the instructional merit of individual topics.',
  };
}

function orderedSequenceBoundaryCoverage(matches = [], sourceTokenCount = 0) {
  if (matches.length === 0 || sourceTokenCount <= 0) {
    return {
      protocol: 'coursemapper-governing-source-boundary-coverage-v1',
      status: 'incomplete',
      prefixTokenCount: sourceTokenCount,
      suffixTokenCount: sourceTokenCount,
      maximumUnrepresentedBoundaryTokens: 45,
    };
  }
  const prefixTokenCount = Math.max(0, Number(matches[0]?.tokenStart) || 0);
  const suffixTokenCount = Math.max(0, sourceTokenCount - (Number(matches.at(-1)?.tokenEnd) || 0));
  const typicalSpan = median(matches.map((match) => Math.max(1, match.tokenEnd - match.tokenStart)));
  const maximumUnrepresentedBoundaryTokens = Math.max(45, Math.ceil(typicalSpan * 3));
  return {
    protocol: 'coursemapper-governing-source-boundary-coverage-v2',
    // An ordered subset deliberately does not claim to cover the entire PDF.
    // Raw document boundaries include office hours, grading policy, support
    // text, and later curriculum outside the requested lesson scope. Treating
    // those tokens as missing instruction made a valid first-eight-lessons
    // plan fail because it did not teach the syllabus preamble or remainder.
    // Interior sequence continuity remains the fail-closed omission check.
    status: 'not-applicable-to-ordered-subset',
    prefixTokenCount,
    suffixTokenCount,
    maximumUnrepresentedBoundaryTokens,
    claimBoundary:
      'Document-edge token counts are diagnostic only for an ordered subset. They cannot distinguish administrative prose or intentionally excluded later curriculum from missing requested instruction; interior continuity is the omission gate.',
  };
}

/**
 * Verify that a generated lesson sequence remains an ordered subset of its
 * governing source. This is curriculum-identity evidence, not permission to
 * treat policy or calendar prose as factual teaching evidence.
 */
export function buildGoverningSourceCourseContract(sourceText = '', lessons = []) {
  const sourceTokens = normalizedTokens(sourceText);
  const sourceLessons = Array.isArray(lessons) ? lessons : [];
  if (sourceTokens.length === 0 || sourceLessons.length < 2) return null;

  const matches = [];
  let cursor = 0;
  for (const [index, lesson] of sourceLessons.entries()) {
    const topic = lessonLabel(lesson, index);
    const wanted = targetTokens(topic);
    const match = orderedWindow(sourceTokens, wanted, cursor);
    if (!match) return null;
    matches.push({ lessonNumber: index + 1, topic, ...match });
    cursor = match.tokenStart + 1;
  }

  const continuity = orderedSequenceContinuity(matches);
  const boundaryCoverage = orderedSequenceBoundaryCoverage(matches, sourceTokens.length);
  return {
    protocol: 'coursemapper-governing-source-course-contract-v1',
    mode: 'governing-source-ordered-subset',
    topics: matches.map((match) => match.topic),
    matches,
    continuity,
    boundaryCoverage,
    coverageStatus: continuity.status === 'continuous' ? 'continuous-subset' : 'incomplete',
    sourceTokenCount: sourceTokens.length,
    claimBoundary:
      'This proves ordered curriculum identity against the attached governing source; it does not make the source a factual textbook or validate generated lesson claims.',
  };
}
