const DEFAULT_MAX_LESSONS = 12;
const MAX_TEXT_CHARS = 320;
const SOURCE_WORD_LIMIT = 80;
const REQUIRED_TEACHING_MOVE_KEYS = ['openingMove', 'practiceMove', 'feedbackMove', 'assessmentMove', 'reviewMove'];

const GENERIC_ENRICHMENT_WORDS = new Set([
  'activity',
  'activities',
  'assignment',
  'class',
  'classroom',
  'concept',
  'concepts',
  'course',
  'decision',
  'evidence',
  'example',
  'feedback',
  'lesson',
  'learning',
  'material',
  'materials',
  'module',
  'objective',
  'objectives',
  'practice',
  'professional',
  'student',
  'students',
  'support',
  'teacher',
  'topic',
  'topics',
  'work',
]);

const SOURCE_STOP_WORDS = new Set([
  'able',
  'about',
  'after',
  'also',
  'and',
  'before',
  'between',
  'class',
  'course',
  'from',
  'into',
  'lesson',
  'module',
  'should',
  'student',
  'students',
  'their',
  'these',
  'they',
  'this',
  'through',
  'using',
  'with',
  'within',
]);

const ENRICHMENT_PUBLISHABILITY_RISK_RE =
  /\b(?:tbd|to be determined|instructor name|office hours|room number|isbn|bookstore|campus office|official due date|university policy|institutional policy|support phone|library availability)\b/i;

export const BLUEPRINT_ENRICHMENT_SYSTEM_PROMPT = [
  'You enrich a course blueprint before deterministic compilation.',
  'Return only compact valid JSON. Do not write markdown.',
  'Do not generate lesson plans, quizzes, slides, policies, dates, or full deliverables.',
  'Do not invent official readings, institutional facts, due dates, or instructor details.',
  'Prefer course-specific nouns and classroom-usable phrasing over generic education boilerplate.',
  'Every returned term or phrase must be traceable to the supplied course-map summary.',
].join(' ');

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, limit = MAX_TEXT_CHARS) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '');
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    const text = cleanText(value);
    if (text) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function words(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3);
}

function sourceVocabulary(payload) {
  const seen = new Set();
  const result = [];
  for (const word of words(collectStrings(payload).join(' '))) {
    if (SOURCE_STOP_WORDS.has(word) || GENERIC_ENRICHMENT_WORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    result.push(word);
    if (result.length >= SOURCE_WORD_LIMIT) break;
  }
  return result;
}

function countSourceGroundingSignals(enrichment, payload) {
  const vocabulary = sourceVocabulary(payload);
  if (vocabulary.length === 0) return 0;
  const text = collectStrings(enrichment).join(' ').toLowerCase();
  return vocabulary.filter((word) => text.includes(word)).length;
}

function countVocabularySignals(value, vocabulary = []) {
  if (!vocabulary.length) return 0;
  const text = collectStrings(value).join(' ').toLowerCase();
  return vocabulary.filter((word) => text.includes(word)).length;
}

function countLensGroundingSignals(enrichment, payload) {
  const vocabulary = sourceVocabulary(payload);
  if (!vocabulary.length) return 0;
  return countVocabularySignals(enrichment?.lens || {}, vocabulary);
}

function sourceVocabularyByLesson(payload) {
  return new Map(
    asArray(payload?.lessons).map((lesson) => [cleanText(lesson?.id).toLowerCase(), sourceVocabulary(lesson)]),
  );
}

function findUngroundedLessonPhrases(enrichment, payload) {
  const lessonPhrases = enrichment?.lessonPhrases || {};
  const lessonVocabulary = sourceVocabularyByLesson(payload);
  if (!lessonVocabulary.size || Object.keys(lessonPhrases).length === 0) return [];

  return Object.entries(lessonPhrases)
    .map(([lessonId, phrase]) => {
      const key = cleanText(lessonId).toLowerCase();
      const vocabulary = lessonVocabulary.get(key) || [];
      if (!vocabulary.length) return null;
      return countVocabularySignals(phrase, vocabulary) > 0 ? null : key;
    })
    .filter(Boolean);
}

function lessonPhraseCoverage(enrichment, payload) {
  const expectedLessonIds = asArray(payload?.lessons)
    .map((lesson) => cleanText(lesson?.id).toLowerCase())
    .filter(Boolean);
  const expected = new Set(expectedLessonIds);
  const phraseIds = Object.keys(enrichment?.lessonPhrases || {})
    .map((key) => cleanText(key).toLowerCase())
    .filter(Boolean);
  const inScopeLessonPhraseIds = phraseIds.filter((id) => expected.has(id));

  return {
    expectedLessonPhraseCount: expectedLessonIds.length,
    lessonPhraseCount: phraseIds.length,
    inScopeLessonPhraseCount: inScopeLessonPhraseIds.length,
    lessonPhraseCoverageRatio:
      expectedLessonIds.length > 0 ? Number((inScopeLessonPhraseIds.length / expectedLessonIds.length).toFixed(2)) : 1,
    missingLessonPhrases: expectedLessonIds.filter((id) => !phraseIds.includes(id)),
    outOfScopeLessonPhrases: phraseIds.filter((id) => !expected.has(id)),
  };
}

function countSpecificEnrichmentWords(enrichment) {
  const enrichmentWords = words(collectStrings(enrichment).join(' '));
  return new Set(enrichmentWords.filter((word) => !GENERIC_ENRICHMENT_WORDS.has(word))).size;
}

function genericLessonPhraseCount(lessonPhrases = {}) {
  return Object.values(lessonPhrases).filter((phrase) => {
    const specificWordCount = countSpecificEnrichmentWords(phrase);
    return specificWordCount < 2;
  }).length;
}

function extractSectionText(lesson, keys) {
  return asArray(lesson?.sections)
    .flatMap((section) => keys.map((key) => section?.[key]))
    .filter(Boolean)
    .map((value) => truncateText(value, 180))
    .join('; ');
}

function selectedLessons(courseMap, scopeIndices = null, maxLessons = DEFAULT_MAX_LESSONS) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const entries =
    Array.isArray(scopeIndices) && scopeIndices.length > 0
      ? scopeIndices.map((originalIndex, position) => ({
          lesson: lessons[originalIndex] || lessons[position],
          originalIndex: Number.isInteger(originalIndex) ? originalIndex : position,
        }))
      : lessons.map((lesson, originalIndex) => ({ lesson, originalIndex }));

  return entries
    .filter(({ lesson }) => lesson)
    .slice(0, maxLessons)
    .map(({ lesson, originalIndex }) => ({
      id: `lesson-${originalIndex + 1}`,
      title: truncateText(stripLessonPrefix(lesson?.title) || `Lesson ${originalIndex + 1}`, 120),
      goals: truncateText(extractSectionText(lesson, ['learningGoals']), 220),
      topics: truncateText(extractSectionText(lesson, ['topicSection']), 220),
      objectives: truncateText(extractSectionText(lesson, ['learningObjectives']), 260),
      assessments: truncateText(extractSectionText(lesson, ['weeklyAssessments', 'evaluateDesign']), 260),
      activities: truncateText(extractSectionText(lesson, ['syncActivities', 'asyncActivities']), 260),
      resources: truncateText(extractSectionText(lesson, ['supportingResources']), 180),
    }));
}

export function buildBlueprintEnrichmentPayload(courseMap, options = {}) {
  return {
    courseName: truncateText(courseMap?.courseName || 'Untitled Course', 120),
    semester: truncateText(courseMap?.semester || '', 80),
    learningOutcomes: truncateText(courseMap?.learningOutcomes || courseMap?.outcomes || '', 360),
    lessons: selectedLessons(courseMap, options.scopeIndices, options.maxLessons || DEFAULT_MAX_LESSONS),
  };
}

export function buildBlueprintEnrichmentPrompt(courseMap, options = {}) {
  const payload = buildBlueprintEnrichmentPayload(courseMap, options);
  const schema = {
    signatureTerms: ['4-10 discipline-specific terms that should recur across compiled materials'],
    lens: {
      domain: 'short course domain',
      evidenceNoun: 'specific evidence noun',
      decisionNoun: 'specific decision noun',
      learnerRole: 'student role in this course',
      exampleNoun: 'specific scenario/example noun',
    },
    lessonPhrases: {
      'lesson-1': {
        context: '3-8 word concrete lesson context',
        evidenceMove: 'short evidence-use phrase',
        decisionMove: 'short decision/action phrase',
      },
    },
    teachingMoves: {
      openingMove: 'short source-grounded class opening move',
      practiceMove: 'short reusable practice routine',
      feedbackMove: 'short instructor feedback routine',
      assessmentMove: 'short assessment-use routine',
      reviewMove: 'short local review or handoff routine',
    },
    styleNotes: ['1-4 short style rules for this course'],
  };

  const userPrompt = [
    'Build one compact enrichment object for the deterministic CourseMapper compiler.',
    'Use only the source course-map facts below. Keep each phrase short enough to reuse inside compiled materials.',
    'Avoid generic phrases like "course evidence" unless the source summary gives a more specific discipline term.',
    'Include exactly one lessonPhrases entry for every lesson id in the source summary; do not omit lessons or invent lesson ids.',
    'Include all five teachingMoves keys, grounded in the same course-map facts, so the compiler can reuse teaching decisions across artifacts.',
    'Return JSON matching this shape:',
    JSON.stringify(schema),
    '',
    'Course map summary:',
    JSON.stringify(payload),
  ].join('\n');

  return {
    systemPrompt: BLUEPRINT_ENRICHMENT_SYSTEM_PROMPT,
    userPrompt,
    payload,
    approxInputTokens: Math.ceil((BLUEPRINT_ENRICHMENT_SYSTEM_PROMPT.length + userPrompt.length) / 4),
  };
}

function normalizeEnrichmentMode(value) {
  if (value === true || value === 'true' || value === 'required' || value === 'on') return 'required';
  if (value === 'adaptive' || value === 'auto') return 'adaptive';
  return 'disabled';
}

function countGroundedLessonSummaries(payload) {
  return asArray(payload?.lessons).filter((lesson) => {
    const text = [
      lesson.goals,
      lesson.topics,
      lesson.objectives,
      lesson.assessments,
      lesson.activities,
      lesson.resources,
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(' ');
    return text.length >= 120 && words(text).filter((word) => !SOURCE_STOP_WORDS.has(word)).length >= 8;
  }).length;
}

export function chooseBlueprintEnrichmentPath(courseMap, options = {}) {
  const requestedMode = normalizeEnrichmentMode(options.mode);
  const compiledFeatureCount = asArray(options.compiledFeatureIds).length;
  const payload = buildBlueprintEnrichmentPayload(courseMap, {
    scopeIndices: options.scopeIndices,
    maxLessons: options.maxLessons || DEFAULT_MAX_LESSONS,
  });
  const lessonCount = payload.lessons.length;
  const sourceVocabularyCount = sourceVocabulary(payload).length;
  const groundedLessonCount = countGroundedLessonSummaries(payload);
  const remainingProviderCalls =
    options.remainingProviderCalls === undefined || options.remainingProviderCalls === null
      ? Number.POSITIVE_INFINITY
      : Number(options.remainingProviderCalls);
  const details = {
    requestedMode,
    compiledFeatureCount,
    lessonCount,
    sourceVocabularyCount,
    groundedLessonCount,
    remainingProviderCalls: Number.isFinite(remainingProviderCalls) ? remainingProviderCalls : null,
  };
  const deterministic = (reason) => ({
    mode: 'deterministic',
    shouldRunEnrichment: false,
    reason,
    details,
  });
  const enriched = (reason) => ({
    mode: 'enriched',
    shouldRunEnrichment: true,
    reason,
    details,
  });

  if (requestedMode === 'disabled') return deterministic('blueprint enrichment disabled');
  if (options.costMode === 'finalizerRetry') return deterministic('finalizer retry uses deterministic compile');
  if (compiledFeatureCount === 0) return deterministic('no blueprint-compiled deliverables selected');
  if (!options.modelAvailable) return deterministic('no enrichment-capable model is connected');
  if (!Number.isFinite(remainingProviderCalls) ? false : remainingProviderCalls < 1) {
    return deterministic('provider call cap leaves no room for enrichment');
  }
  if (requestedMode === 'required') return enriched('blueprint enrichment explicitly requested');

  const minCompiledFeatures = Number(options.minCompiledFeatures || 3);
  const minLessons = Number(options.minLessons || 3);
  const minSourceVocabulary = Number(options.minSourceVocabulary || 10);
  const minGroundedLessons = Math.min(lessonCount, Number(options.minGroundedLessons || 3));
  if (compiledFeatureCount < minCompiledFeatures) {
    return deterministic('too few compiled deliverables to justify one enrichment call');
  }
  if (lessonCount < minLessons) {
    return deterministic('too few lessons to justify one enrichment call');
  }
  if (sourceVocabularyCount < minSourceVocabulary || groundedLessonCount < minGroundedLessons) {
    return deterministic('course map does not yet have enough source signal for safe enrichment');
  }
  return enriched('adaptive enrichment selected for source-grounded compiled package');
}

function parseJsonObject(text) {
  const raw = cleanText(text);
  if (!raw) return null;
  const stripped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function uniqueStrings(values, limit, maxChars = 80) {
  const seen = new Set();
  const result = [];
  for (const value of asArray(values)) {
    const text = truncateText(value, maxChars);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeLens(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    ['domain', 'evidenceNoun', 'decisionNoun', 'learnerRole', 'exampleNoun']
      .map((key) => [key, truncateText(value[key], 70)])
      .filter(([, text]) => text),
  );
}

function normalizeLessonPhrase(value) {
  if (!value || typeof value !== 'object') return null;
  const phrase = {
    context: truncateText(value.context, 90),
    evidenceMove: truncateText(value.evidenceMove, 140),
    decisionMove: truncateText(value.decisionMove, 140),
  };
  if (!phrase.context && !phrase.evidenceMove && !phrase.decisionMove) return null;
  return phrase;
}

function normalizeLessonPhrases(value) {
  if (!value) return {};
  const entries = Array.isArray(value)
    ? value.map((item, index) => [item?.id || `lesson-${index + 1}`, item])
    : Object.entries(value);
  const result = {};
  for (const [key, phraseValue] of entries) {
    const lessonKey = cleanText(key).toLowerCase();
    if (!/^lesson-\d+$/.test(lessonKey)) continue;
    const phrase = normalizeLessonPhrase(phraseValue);
    if (phrase) result[lessonKey] = phrase;
  }
  return result;
}

function normalizeTeachingMoves(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    REQUIRED_TEACHING_MOVE_KEYS.map((key) => [key, truncateText(value[key], 160)]).filter(([, text]) => text),
  );
}

function genericTeachingMoveCount(teachingMoves = {}) {
  return Object.values(teachingMoves).filter((move) => countSpecificEnrichmentWords(move) < 2).length;
}

export function evaluateBlueprintEnrichmentQuality(enrichment, options = {}) {
  if (!enrichment || typeof enrichment !== 'object') {
    return {
      status: 'rejected',
      reasons: ['Enrichment response was empty or not an object.'],
      sourceGroundingSignalCount: 0,
      lensGroundingSignalCount: 0,
      specificWordCount: 0,
      ungroundedLessonPhraseCount: 0,
      ungroundedLessonPhrases: [],
      expectedLessonPhraseCount: 0,
      lessonPhraseCount: 0,
      inScopeLessonPhraseCount: 0,
      lessonPhraseCoverageRatio: 0,
      missingLessonPhrases: [],
      outOfScopeLessonPhrases: [],
      missingLensKeys: [],
      teachingMoveGroundingSignalCount: 0,
      genericTeachingMoveCount: 0,
      missingTeachingMoveKeys: REQUIRED_TEACHING_MOVE_KEYS,
    };
  }

  const allText = collectStrings(enrichment).join(' ');
  const sourceGroundingSignalCount = options.payload ? countSourceGroundingSignals(enrichment, options.payload) : 0;
  const lensGroundingSignalCount = options.payload ? countLensGroundingSignals(enrichment, options.payload) : 0;
  const specificWordCount = countSpecificEnrichmentWords(enrichment);
  const genericPhraseCount = genericLessonPhraseCount(enrichment.lessonPhrases);
  const ungroundedLessonPhrases = options.payload ? findUngroundedLessonPhrases(enrichment, options.payload) : [];
  const coverage = options.payload
    ? lessonPhraseCoverage(enrichment, options.payload)
    : {
        expectedLessonPhraseCount: 0,
        lessonPhraseCount: Object.keys(enrichment.lessonPhrases || {}).length,
        inScopeLessonPhraseCount: Object.keys(enrichment.lessonPhrases || {}).length,
        lessonPhraseCoverageRatio: 1,
        missingLessonPhrases: [],
        outOfScopeLessonPhrases: [],
      };
  const requiredLensKeys = ['domain', 'evidenceNoun', 'decisionNoun', 'learnerRole', 'exampleNoun'];
  const missingLensKeys = requiredLensKeys.filter((key) => !cleanText(enrichment.lens?.[key]));
  const teachingMoves = enrichment.teachingMoves || {};
  const missingTeachingMoveKeys = REQUIRED_TEACHING_MOVE_KEYS.filter((key) => !cleanText(teachingMoves[key]));
  const teachingMoveGroundingSignalCount = options.payload
    ? countVocabularySignals(teachingMoves, sourceVocabulary(options.payload))
    : 0;
  const genericTeachingMoves = genericTeachingMoveCount(teachingMoves);
  const reasons = [];

  if (ENRICHMENT_PUBLISHABILITY_RISK_RE.test(allText)) {
    reasons.push('Enrichment contains publishability-risk details or placeholders.');
  }
  if (missingLensKeys.length > 0) {
    reasons.push(`Enrichment lens is missing required course-decode fields: ${missingLensKeys.join(', ')}.`);
  }
  if (specificWordCount < 3) {
    reasons.push('Enrichment is too generic to improve compiled materials.');
  }
  if (Object.keys(enrichment.lessonPhrases || {}).length > 0 && genericPhraseCount > 2) {
    reasons.push('Too many lesson phrase sets are generic.');
  }
  if (options.payload && sourceVocabulary(options.payload).length > 0 && sourceGroundingSignalCount < 2) {
    reasons.push('Enrichment is not grounded enough in the source course map.');
  }
  if (options.payload && Object.keys(enrichment.lens || {}).length > 0 && lensGroundingSignalCount < 2) {
    reasons.push('Enrichment lens is not grounded enough in the source course map.');
  }
  if (ungroundedLessonPhrases.length > 0) {
    reasons.push('Lesson enrichment phrases must be grounded in their own lesson source signals.');
  }
  if (coverage.missingLessonPhrases.length > 0) {
    reasons.push('Lesson enrichment phrases must cover every lesson in the source payload.');
  }
  if (coverage.outOfScopeLessonPhrases.length > 0) {
    reasons.push('Lesson enrichment phrases include lesson ids outside the source payload.');
  }
  if (missingTeachingMoveKeys.length > 0) {
    reasons.push(
      `Enrichment teaching moves are missing required compiler-decode fields: ${missingTeachingMoveKeys.join(', ')}.`,
    );
  }
  if (Object.keys(teachingMoves).length > 0 && genericTeachingMoves > 1) {
    reasons.push('Too many enrichment teaching moves are generic.');
  }
  if (options.payload && Object.keys(teachingMoves).length > 0 && teachingMoveGroundingSignalCount < 2) {
    reasons.push('Enrichment teaching moves are not grounded enough in the source course map.');
  }

  return {
    status: reasons.length > 0 ? 'rejected' : 'accepted',
    reasons,
    sourceGroundingSignalCount,
    lensGroundingSignalCount,
    specificWordCount,
    genericPhraseCount,
    ungroundedLessonPhraseCount: ungroundedLessonPhrases.length,
    ungroundedLessonPhrases,
    ...coverage,
    missingLensKeys,
    teachingMoveGroundingSignalCount,
    genericTeachingMoveCount: genericTeachingMoves,
    missingTeachingMoveKeys,
  };
}

export function normalizeBlueprintEnrichmentResponse(value, options = {}) {
  const raw = typeof value === 'string' ? parseJsonObject(value) : value;
  if (!raw || typeof raw !== 'object') return null;

  const signatureTerms = uniqueStrings(raw.signatureTerms, 12, 70);
  const lens = normalizeLens(raw.lens);
  const lessonPhrases = normalizeLessonPhrases(raw.lessonPhrases);
  const teachingMoves = normalizeTeachingMoves(raw.teachingMoves);
  const styleNotes = uniqueStrings(raw.styleNotes, 6, 140);
  const hasUsefulContent =
    signatureTerms.length > 0 ||
    Object.keys(lens).length > 0 ||
    Object.keys(lessonPhrases).length > 0 ||
    Object.keys(teachingMoves).length > 0;
  if (!hasUsefulContent) return null;
  const enrichment = {
    source: 'model-blueprint-enrichment',
    signatureTerms,
    lens,
    lessonPhrases,
    teachingMoves,
    styleNotes,
  };
  const quality = evaluateBlueprintEnrichmentQuality(enrichment, options);
  if (quality.status !== 'accepted') return null;

  return {
    ...enrichment,
    quality,
  };
}

export function parseBlueprintEnrichmentResponse(text, options = {}) {
  return normalizeBlueprintEnrichmentResponse(text, options);
}
