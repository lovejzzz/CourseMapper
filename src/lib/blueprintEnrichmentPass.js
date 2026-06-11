import { expandKeys } from './keyMaps';
import { lintItemAdmission } from './itemAdmissionLint';
import { projectKernelToSurfaces } from './kernelProjection';

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

// ════════════════════════════════════════════════════════════════════════════
// Per-lesson content enrichment (v0.9.1 — CCR D2.1/D2.2/D3.1)
//
// The course-level pass above supplies vocabulary and teaching moves; this
// stage writes the actual disciplinary content for assessment surfaces:
// quiz items and study-guide key terms. The compiler keeps every frame
// (counts, Bloom's ladder, points, ids, rotation, tags, trust records) and
// overlays only the knowledge a deterministic program cannot produce.
// ════════════════════════════════════════════════════════════════════════════

const LESSON_CONTENT_SYSTEM_PROMPT = [
  'You are a university subject-matter expert and assessment writer.',
  'Write disciplinary content — facts, mechanisms, examples, misconceptions of the SUBJECT — never descriptions of the course process.',
  'Never mention: artifacts, evidence moves, success criteria, rubrics, submissions, "the lesson", "this course", or weekly checks.',
  'Multiple-choice rules (Haladyna): the stem poses one complete, content-bearing problem; exactly 4 options; one defensibly correct answer;',
  'distractors are plausible misconceptions of the SUBJECT, homogeneous with the key in length and grammar; never use "all of the above" or "none of the above".',
  'Grounding: rely only on the listed readings/topics; do not invent citations, URLs, page numbers, statistics, or named studies beyond them.',
  'Return strict JSON only — no markdown fences, no commentary.',
].join(' ');

const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;

function summarizeLessonsForContent(courseMap, lessonIndices) {
  return asArray(lessonIndices)
    .map((lessonIndex) => {
      const lesson = courseMap?.lessons?.[lessonIndex];
      if (!lesson) return null;
      const section = lesson.sections?.[0] || {};
      return {
        lessonId: `lesson-${lessonIndex + 1}`,
        title: truncateText(lesson.title || `Lesson ${lessonIndex + 1}`, 140),
        objectives: truncateText(String(section.learningObjectives || ''), 700),
        topics: truncateText(
          asArray(lesson.sections)
            .map((entry) => entry?.topicSection)
            .filter(Boolean)
            .join('; '),
          400,
        ),
        readings: truncateText(String(section.supportingResources || ''), 600),
      };
    })
    .filter(Boolean);
}

export function buildQuizItemPlan(questionsPerLesson) {
  const count = Math.max(5, Math.min(7, Number(questionsPerLesson) || 6));
  return [
    { index: 0, type: 'multiple_choice', bloom: 'Remember', note: 'foundational fact or definition' },
    { index: 1, type: 'multiple_choice', bloom: 'Apply', note: 'apply the concept to a concrete scenario' },
    { index: 2, type: 'multiple_choice', bloom: 'Analyze', note: 'compare/diagnose using the concept' },
    { index: 3, type: 'short_answer', bloom: 'Analyze', note: 'short written analysis with model answer' },
    { index: 4, type: 'multiple_choice', bloom: 'Evaluate', note: 'judge a claim or method' },
    { index: 5, type: 'essay', bloom: 'Create', note: 'synthesis task with sample answer and scoring guidance' },
  ].slice(0, count);
}

export function buildLessonContentEnrichmentPrompt(courseMap, lessonIndices, options = {}) {
  const questionsPerLesson = Math.max(5, Math.min(7, Number(options.questionsPerLesson) || 6));
  const keyTermsPerLesson = Math.max(3, Math.min(6, Number(options.keyTermsPerLesson) || 4));
  const lessons = summarizeLessonsForContent(courseMap, lessonIndices);

  const itemPlan = buildQuizItemPlan(questionsPerLesson);

  // v0.9.11 P2: short keys in the output contract (expanded by expandKeys on
  // parse) — key names repeat per item per lesson, so this trims ~15-20% of
  // output tokens without touching the content the model writes.
  const schema = {
    lessons: [
      {
        lessonId: 'lesson-1',
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice|short_answer|essay',
            q: 'content-bearing stem about the subject',
            op: ['A', 'B', 'C', 'D — multiple_choice only; omit otherwise'],
            ai: 0,
            dr: ['misconception behind each wrong option — multiple_choice only'],
            an: 'model answer — short_answer/essay only',
            ex: 'why the key is correct, in subject terms',
            sg: 'short_answer/essay only',
          },
        ],
        keyTerms: [
          {
            tr: 'real disciplinary term',
            df: 'correct 1-2 sentence definition in subject language',
            eg: 'concrete domain example',
            mi: 'common student misunderstanding of this term',
          },
        ],
        slideContent: [
          {
            ti: 'assertion-style claim about the subject (a sentence that is true)',
            bu: ['2-4 evidence-bearing bullets: facts, numbers, examples — each under 16 words'],
            no: '2-4 sentence speaker explanation of the claim in subject terms',
          },
        ],
        discussionPrompt: {
          pr: 'a genuinely debatable disciplinary question',
          tn: 'one sentence naming why reasonable positions disagree',
          po: ['2-3 defensible positions, one short sentence each'],
        },
        assignmentCore: {
          td: '2-3 sentences: the actual case/dataset/text students work on and what they produce',
          pa: ['2-4 concrete parameters: length, data source, format, constraints'],
        },
      },
    ],
  };

  const userPrompt = [
    `Course: ${truncateText(courseMap?.courseName || 'Untitled Course', 120)}`,
    `Write assessment content for ${lessons.length} lesson(s). For each lesson produce exactly ${itemPlan.length} quizItems following this plan:`,
    JSON.stringify(itemPlan),
    `…and ${keyTermsPerLesson} keyTerms drawn from the lesson topics/objectives, plus 3 slideContent entries, one discussionPrompt, and one assignmentCore per lesson.`,
    'Question difficulty and cognitive level must match the plan. Use the objectives verbatim as the knowledge targets.',
    'Use the abbreviated JSON keys exactly as shown: q=question, op=options, ai=answerIndex, dr=distractorRationales, an=answer, ex=explanation, sg=scoringGuidance, tr=term, df=definition, eg=example, mi=misconception, ti=title, bu=bullets, no=notes, pr=prompt, tn=tension, po=positions, td=taskDescription, pa=parameters.',
    'Return JSON matching this shape:',
    JSON.stringify(schema),
    '',
    'Lessons:',
    JSON.stringify(lessons),
  ].join('\n');

  return {
    systemPrompt: LESSON_CONTENT_SYSTEM_PROMPT,
    userPrompt,
    lessons,
    itemPlan,
    approxInputTokens: Math.ceil((LESSON_CONTENT_SYSTEM_PROMPT.length + userPrompt.length) / 4),
  };
}

export function lintEnrichedQuizItem(item, { groundingText = '' } = {}) {
  const issues = [];
  const question = cleanText(item?.question);
  if (question.length < 20) issues.push('stem-too-short');
  if (META_SURFACE_RE.test(question)) issues.push('meta-stem');
  const type = item?.type || 'multiple_choice';
  if (type === 'multiple_choice') {
    const options = asArray(item?.options).map(cleanText).filter(Boolean);
    if (options.length !== 4) issues.push('option-count');
    if (options.some((option) => /\b(all|none) of the above\b/i.test(option))) issues.push('all-none-of-above');
    if (options.some((option) => META_SURFACE_RE.test(option))) issues.push('meta-option');
    const answerIndex = Number(item?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
      issues.push('answer-index');
    }
    const lengths = options.map((option) => option.length);
    if (lengths.length === 4 && Math.max(...lengths) > Math.min(...lengths) * 3 + 20) issues.push('option-homogeneity');
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length)
      issues.push('duplicate-options');
    // CurriculumOS V1 Phase A: test-wiseness battery shared with the foundry
    // admission gate — cues that reveal the key without knowing the content.
    issues.push(...lintItemAdmission({ ...item, options }));
  } else if (cleanText(item?.answer).length < 30) {
    issues.push('model-answer-too-short');
  }
  // Grounding: reject invented citation-like artifacts not present in source.
  const itemText = JSON.stringify(item || {});
  if (/https?:\/\//i.test(itemText) && !/https?:\/\//i.test(groundingText)) issues.push('ungrounded-url');
  if (/\bp\.\s*\d+|\bpp\.\s*\d+/i.test(itemText) && !/\bp\.\s*\d+|\bpp\.\s*\d+/i.test(groundingText)) {
    issues.push('ungrounded-page-citation');
  }
  return issues;
}

export function lintEnrichedKeyTerm(term, { lessonTitle = '' } = {}) {
  const issues = [];
  const name = cleanText(term?.term);
  const definition = cleanText(term?.definition);
  if (name.length < 3) issues.push('term-missing');
  if (definition.length < 40) issues.push('definition-too-short');
  if (META_SURFACE_RE.test(definition) || META_SURFACE_RE.test(cleanText(term?.example)))
    issues.push('meta-definition');
  const titleTopic = cleanText(lessonTitle)
    .replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '')
    .toLowerCase();
  if (name.toLowerCase() === titleTopic) issues.push('term-is-lesson-title');
  const definitionLead = words(definition).slice(0, 6).join(' ').toLowerCase();
  if (name.length > 6 && definitionLead.includes(name.toLowerCase())) issues.push('circular-definition');
  return issues;
}

export function lintEnrichedSlideContent(slide) {
  const issues = [];
  if (cleanText(slide?.title).length < 12) issues.push('title-too-short');
  const bullets = asArray(slide?.bullets).map(cleanText).filter(Boolean);
  if (bullets.length < 2 || bullets.length > 4) issues.push('bullet-count');
  if (bullets.some((bullet) => words(bullet).length > 18)) issues.push('bullet-too-long');
  if ([slide?.title, ...bullets].some((text) => META_SURFACE_RE.test(cleanText(text)))) issues.push('meta-slide');
  return issues;
}

export function lintEnrichedDiscussionPrompt(prompt) {
  const issues = [];
  if (cleanText(prompt?.prompt).length < 25) issues.push('prompt-too-short');
  if (!/\?/.test(cleanText(prompt?.prompt))) issues.push('prompt-not-a-question');
  if (META_SURFACE_RE.test(cleanText(prompt?.prompt))) issues.push('meta-prompt');
  if (asArray(prompt?.positions).map(cleanText).filter(Boolean).length < 2) issues.push('positions-missing');
  return issues;
}

export function lintEnrichedAssignmentCore(core) {
  const issues = [];
  if (cleanText(core?.taskDescription).length < 60) issues.push('task-too-short');
  if (META_SURFACE_RE.test(cleanText(core?.taskDescription))) issues.push('meta-task');
  if (asArray(core?.parameters).map(cleanText).filter(Boolean).length < 2) issues.push('parameters-missing');
  return issues;
}

/**
 * Parse + validate a lesson-content enrichment response. Invalid items are
 * dropped individually (the compiler falls back per item); a lesson with no
 * valid surfaces is omitted. Returns { lessons: { [lessonId]: payload },
 * issues: [{lessonId, surface, index, problems}] } or null when unusable.
 */
export function parseLessonContentEnrichmentResponse(text, { prompt } = {}) {
  // Expand the P2 short-key contract before validation; full-key responses
  // (older models, retries on the legacy contract) pass through unchanged.
  const parsed = expandKeys('enrichment', parseJsonObject(text));
  if (!parsed || !Array.isArray(parsed.lessons)) return null;
  const groundingText = JSON.stringify(prompt?.lessons || []);
  const lessons = {};
  const issues = [];
  for (const entry of parsed.lessons) {
    const lessonId = cleanText(entry?.lessonId);
    if (!lessonId) continue;
    const promptLesson = (prompt?.lessons || []).find((lesson) => lesson.lessonId === lessonId);
    const quizItems = [];
    asArray(entry?.quizItems).forEach((item, index) => {
      const problems = lintEnrichedQuizItem(item, { groundingText });
      if (problems.length > 0) {
        issues.push({ lessonId, surface: 'quizItems', index, problems });
        return;
      }
      quizItems.push({
        index: Number.isInteger(item.index) ? item.index : index,
        type: item.type || 'multiple_choice',
        question: cleanText(item.question),
        options: asArray(item.options).map(cleanText).filter(Boolean),
        answerIndex: Number(item.answerIndex) || 0,
        distractorRationales: asArray(item.distractorRationales).map(cleanText).filter(Boolean),
        answer: cleanText(item.answer),
        explanation: cleanText(item.explanation),
        scoringGuidance: cleanText(item.scoringGuidance),
      });
    });
    const keyTerms = [];
    asArray(entry?.keyTerms).forEach((term, index) => {
      const problems = lintEnrichedKeyTerm(term, { lessonTitle: promptLesson?.title || '' });
      if (problems.length > 0) {
        issues.push({ lessonId, surface: 'keyTerms', index, problems });
        return;
      }
      keyTerms.push({
        term: cleanText(term.term),
        definition: cleanText(term.definition),
        example: cleanText(term.example),
        misconception: cleanText(term.misconception),
      });
    });
    const slideContent = [];
    asArray(entry?.slideContent).forEach((slide, index) => {
      const problems = lintEnrichedSlideContent(slide);
      if (problems.length > 0) {
        issues.push({ lessonId, surface: 'slideContent', index, problems });
        return;
      }
      slideContent.push({
        title: cleanText(slide.title),
        bullets: asArray(slide.bullets).map(cleanText).filter(Boolean),
        notes: cleanText(slide.notes),
      });
    });
    let discussionPrompt = null;
    if (entry?.discussionPrompt) {
      const problems = lintEnrichedDiscussionPrompt(entry.discussionPrompt);
      if (problems.length > 0) issues.push({ lessonId, surface: 'discussionPrompt', index: 0, problems });
      else {
        discussionPrompt = {
          prompt: cleanText(entry.discussionPrompt.prompt),
          tension: cleanText(entry.discussionPrompt.tension),
          positions: asArray(entry.discussionPrompt.positions).map(cleanText).filter(Boolean),
        };
      }
    }
    let assignmentCore = null;
    if (entry?.assignmentCore) {
      const problems = lintEnrichedAssignmentCore(entry.assignmentCore);
      if (problems.length > 0) issues.push({ lessonId, surface: 'assignmentCore', index: 0, problems });
      else {
        assignmentCore = {
          taskDescription: cleanText(entry.assignmentCore.taskDescription),
          parameters: asArray(entry.assignmentCore.parameters).map(cleanText).filter(Boolean),
        };
      }
    }
    if (quizItems.length > 0 || keyTerms.length > 0 || slideContent.length > 0 || discussionPrompt || assignmentCore) {
      lessons[lessonId] = {
        quizItems,
        keyTerms,
        ...(slideContent.length > 0 ? { slideContent } : {}),
        ...(discussionPrompt ? { discussionPrompt } : {}),
        ...(assignmentCore ? { assignmentCore } : {}),
      };
    }
  }
  if (Object.keys(lessons).length === 0) return null;
  return { lessons, issues };
}

// ════════════════════════════════════════════════════════════════════════════
// Knowledge kernel (v0.9.11 P4)
//
// One model payload per lesson holds the knowledge atoms; the deterministic
// projection (kernelProjection.js) turns them into the same surface payload
// the v0.9.1 overlays consume. The model writes each piece of disciplinary
// knowledge exactly once: misconceptions feed distractor rationales AND the
// study guide; facts feed slides AND quiz explanations; the scenario feeds
// short-answer and essay frames.
// ════════════════════════════════════════════════════════════════════════════

const KERNEL_KEY_LEGEND =
  'Abbreviated JSON keys: q=question, op=options, ai=answerIndex, ex=explanation, tr=term, df=definition, eg=example, mi=misconception, cx=correction, pr=prompt, tn=tension, po=positions, td=taskDescription, pa=parameters, su=setup, ma=materials, wp=problem, ws=steps, wr=result.';

function buildKernelSchema() {
  return {
    lessons: [
      {
        lessonId: 'lesson-1',
        facts: [
          '5-8 one-sentence content-bearing claims about the subject (each under 20 words, specific enough to anchor a slide title or quiz explanation)',
        ],
        keyTerms: [
          {
            tr: 'real disciplinary term',
            df: 'correct 1-2 sentence definition in subject language',
            eg: 'concrete domain example',
            mi: 'common student misunderstanding of this term',
            cx: 'the accurate corrective statement that directly counters the misconception (NOT a restated definition)',
          },
        ],
        workedExample: {
          wp: 'OPTIONAL, only for quantitative lessons: one concrete numeric problem statement',
          ws: ['2-4 short solution steps with the actual numbers'],
          wr: 'the numeric result with units',
        },
        scenario: {
          su: '2-3 sentence concrete case/dataset/text setup students can analyze',
          ma: 'the specific materials, data, or text students examine',
        },
        discussionPrompt: {
          pr: 'a genuinely debatable disciplinary question',
          tn: 'one sentence naming why reasonable positions disagree',
          po: ['2-3 defensible positions, one short sentence each'],
        },
        assignmentCore: {
          td: '2-3 sentences: the actual case/dataset/text students work on and what they produce',
          pa: ['2-4 concrete parameters: length, data source, format, constraints'],
        },
        mc: [
          {
            q: 'content-bearing multiple-choice stem about the subject',
            op: ['exactly 4 options, homogeneous in length and grammar'],
            ai: 0,
            ex: 'why the key is correct, in subject terms',
          },
        ],
      },
    ],
  };
}

const KERNEL_COURSE_LEVEL_SCHEMA = {
  courseLevel: {
    signatureTerms: ['4-10 discipline-specific terms that should recur across compiled materials'],
    lens: {
      domain: 'short course domain',
      evidenceNoun: 'specific evidence noun',
      decisionNoun: 'specific decision noun',
      learnerRole: 'student role in this course',
      exampleNoun: 'specific scenario/example noun',
    },
    styleNotes: ['1-4 short style rules for this course'],
  },
};

/**
 * Kernel prompt: everything static (system role, legend, schema, item plan)
 * lives in the system prompt so chunked calls share an identical prefix —
 * Anthropic gets an explicit cache_control hit and OpenAI's automatic prefix
 * cache can engage. The user prompt carries only the course line and the
 * lesson summaries for this chunk.
 */
export function buildLessonKernelPrompt(courseMap, lessonIndices, options = {}) {
  const itemPlan = buildQuizItemPlan(options.questionsPerLesson);
  const keyTermsPerLesson = Math.max(3, Math.min(6, Number(options.keyTermsPerLesson) || 4));
  const mcCount = itemPlan.filter((slot) => slot.type === 'multiple_choice').length;
  const includeCourseLevel = options.includeCourseLevel === true;
  const lessons = summarizeLessonsForContent(courseMap, lessonIndices);

  const systemPrompt = [
    LESSON_CONTENT_SYSTEM_PROMPT,
    `For every lesson in the request, return one knowledge kernel: 5-8 facts, ${keyTermsPerLesson} keyTerms, one scenario, one discussionPrompt, one assignmentCore, and exactly ${mcCount} mc items.`,
    `The mc items follow this cognitive plan (matching list order): ${itemPlan
      .filter((slot) => slot.type === 'multiple_choice')
      .map((slot) => `${slot.bloom} (${slot.note})`)
      .join('; ')}.`,
    KERNEL_KEY_LEGEND,
    'Return JSON matching this shape:',
    JSON.stringify({
      ...buildKernelSchema(),
      ...(includeCourseLevel ? KERNEL_COURSE_LEVEL_SCHEMA : {}),
    }),
    includeCourseLevel
      ? 'Also include the courseLevel object once (not per lesson), grounded in the same source facts.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [
    `Course: ${truncateText(courseMap?.courseName || 'Untitled Course', 120)}`,
    'Lessons:',
    JSON.stringify(lessons),
    // OpenAI's json_object response format requires the word "JSON" in an
    // INPUT message — the system prompt maps to `instructions`, which the
    // guard does not scan. Without this line every kernel call 400s
    // ("Response input messages must contain the word 'json'…").
    'Return ONLY valid JSON matching the kernel shape from the instructions.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    lessons,
    itemPlan,
    includeCourseLevel,
    approxInputTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
  };
}

export function lintKernelFact(fact) {
  const issues = [];
  const text = cleanText(fact);
  if (text.length < 20) issues.push('fact-too-short');
  if (text.split(/\s+/).length > 24) issues.push('fact-too-long');
  if (META_SURFACE_RE.test(text)) issues.push('meta-fact');
  return issues;
}

export function lintKernelScenario(scenario) {
  const issues = [];
  if (cleanText(scenario?.setup).length < 40) issues.push('scenario-too-short');
  if (META_SURFACE_RE.test(cleanText(scenario?.setup))) issues.push('meta-scenario');
  return issues;
}

/** Course-level block absorbed into kernel chunk #1 (replaces the standalone call). */
export function normalizeAbsorbedCourseLevel(courseLevel, payload) {
  if (!courseLevel || typeof courseLevel !== 'object') return null;
  const signatureTerms = asArray(courseLevel.signatureTerms)
    .map((term) => truncateText(term, 60))
    .filter(Boolean)
    .slice(0, 10);
  const lensSource = courseLevel.lens && typeof courseLevel.lens === 'object' ? courseLevel.lens : {};
  const lens = Object.fromEntries(
    ['domain', 'evidenceNoun', 'decisionNoun', 'learnerRole', 'exampleNoun']
      .map((key) => [key, truncateText(lensSource[key], 80)])
      .filter(([, value]) => value),
  );
  const styleNotes = asArray(courseLevel.styleNotes)
    .map((note) => truncateText(note, 160))
    .filter(Boolean)
    .slice(0, 4);
  const grounded = payload ? countVocabularySignals({ signatureTerms, lens }, sourceVocabulary(payload)) : 1;
  if (signatureTerms.length === 0 && Object.keys(lens).length === 0) return null;
  if (grounded === 0) return null;
  return {
    signatureTerms,
    lens: Object.keys(lens).length > 0 ? lens : null,
    styleNotes,
    quality: { source: 'kernel-chunk-1', sourceGroundingSignalCount: grounded },
  };
}

/**
 * Parse + validate a kernel response, then project each lesson's kernel into
 * the surface payload the existing overlays consume. Invalid atoms are
 * dropped individually; a lesson needs at least valid keyTerms or mc items to
 * be kept. Returns { lessons, issues, courseLevel } or null when unusable.
 *
 * v0.14.1 P2.1: dropped LESSONS get an explicit issue row too (surface
 * 'lesson' with a `reason`) — the v0.14 audit shipped final-exam-week quizzes
 * with zero geology because whole-lesson drops were silent. Entries whose
 * lessonId is outside the requested chunk (`expectedLessonIds`, defaulting to
 * the prompt's lesson list) are rejected instead of overwriting another
 * chunk's lesson via the caller's Object.assign merge.
 */
export function parseLessonKernelResponse(text, { prompt, expectedLessonIds } = {}) {
  const parsed = expandKeys('enrichment', parseJsonObject(text));
  if (!parsed || !Array.isArray(parsed.lessons)) return null;
  const groundingText = JSON.stringify(prompt?.lessons || []);
  const itemPlan = Array.isArray(prompt?.itemPlan) ? prompt.itemPlan : buildQuizItemPlan(6);
  const chunkLessonIds = new Set(
    (Array.isArray(expectedLessonIds) && expectedLessonIds.length > 0
      ? expectedLessonIds
      : (prompt?.lessons || []).map((lesson) => lesson?.lessonId)
    ).filter(Boolean),
  );
  const lessons = {};
  const issues = [];

  for (const [entryIndex, entry] of parsed.lessons.entries()) {
    const lessonId = cleanText(entry?.lessonId);
    if (!lessonId) {
      issues.push({
        lessonId: 'unknown-entry',
        surface: 'lesson',
        index: entryIndex,
        reason: 'no-lesson-id',
        atomIssueCount: 0,
        problems: ['no-lesson-id'],
      });
      continue;
    }
    // A model that renumbers lessons inside the chunk could overwrite another
    // chunk's already-parsed lesson — reject anything outside the request.
    if (chunkLessonIds.size > 0 && !chunkLessonIds.has(lessonId)) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: entryIndex,
        reason: 'out-of-chunk-lesson-id',
        atomIssueCount: 0,
        problems: ['out-of-chunk-lesson-id'],
      });
      continue;
    }
    const issueCountAtEntryStart = issues.length;
    const promptLesson = (prompt?.lessons || []).find((lesson) => lesson.lessonId === lessonId);

    const facts = [];
    asArray(entry?.facts).forEach((fact, index) => {
      const problems = lintKernelFact(fact);
      if (problems.length > 0) issues.push({ lessonId, surface: 'facts', index, problems });
      else facts.push(cleanText(fact));
    });

    const keyTerms = [];
    asArray(entry?.keyTerms).forEach((term, index) => {
      const problems = lintEnrichedKeyTerm(term, { lessonTitle: promptLesson?.title || '' });
      if (problems.length > 0) issues.push({ lessonId, surface: 'keyTerms', index, problems });
      else {
        keyTerms.push({
          term: cleanText(term.term),
          definition: cleanText(term.definition),
          example: cleanText(term.example),
          misconception: cleanText(term.misconception),
          // v0.13.3: the corrective statement — the payoff line that counters
          // the misconception (never a restated definition).
          correction: cleanText(term.correction),
        });
      }
    });

    // v0.13.3: optional quantitative worked example for the lesson.
    let workedExample = null;
    if (entry?.workedExample) {
      const problem = cleanText(entry.workedExample.problem);
      const steps = asArray(entry.workedExample.steps).map(cleanText).filter(Boolean);
      const result = cleanText(entry.workedExample.result);
      if (problem.length >= 15 && steps.length >= 2 && result) {
        workedExample = { problem, steps, result };
      } else if (problem || steps.length > 0) {
        issues.push({ lessonId, surface: 'workedExample', index: 0, problems: ['incomplete-worked-example'] });
      }
    }

    let scenario = null;
    if (entry?.scenario) {
      const problems = lintKernelScenario(entry.scenario);
      if (problems.length > 0) issues.push({ lessonId, surface: 'scenario', index: 0, problems });
      else scenario = { setup: cleanText(entry.scenario.setup), materials: cleanText(entry.scenario.materials) };
    }

    let discussionPrompt = null;
    if (entry?.discussionPrompt) {
      const problems = lintEnrichedDiscussionPrompt(entry.discussionPrompt);
      if (problems.length > 0) issues.push({ lessonId, surface: 'discussionPrompt', index: 0, problems });
      else {
        discussionPrompt = {
          prompt: cleanText(entry.discussionPrompt.prompt),
          tension: cleanText(entry.discussionPrompt.tension),
          positions: asArray(entry.discussionPrompt.positions).map(cleanText).filter(Boolean),
        };
      }
    }

    let assignmentCore = null;
    if (entry?.assignmentCore) {
      const problems = lintEnrichedAssignmentCore(entry.assignmentCore);
      if (problems.length > 0) issues.push({ lessonId, surface: 'assignmentCore', index: 0, problems });
      else {
        assignmentCore = {
          taskDescription: cleanText(entry.assignmentCore.taskDescription),
          parameters: asArray(entry.assignmentCore.parameters).map(cleanText).filter(Boolean),
        };
      }
    }

    const mc = [];
    asArray(entry?.mc).forEach((item, index) => {
      const problems = lintEnrichedQuizItem({ ...item, type: 'multiple_choice' }, { groundingText });
      if (problems.length > 0) issues.push({ lessonId, surface: 'mc', index, problems });
      else {
        mc.push({
          question: cleanText(item.question),
          options: asArray(item.options).map(cleanText).filter(Boolean),
          answerIndex: Number(item.answerIndex) || 0,
          explanation: cleanText(item.explanation),
        });
      }
    });

    if (keyTerms.length === 0 && mc.length === 0) {
      // The whole lesson falls back to template — say so with a row of its
      // own, not just the per-atom rows above (which only count atoms).
      issues.push({
        lessonId,
        surface: 'lesson',
        index: entryIndex,
        reason: 'all-atoms-linted-out',
        atomIssueCount: issues.length - issueCountAtEntryStart,
        problems: ['all-atoms-linted-out'],
      });
      continue;
    }

    const payload = projectKernelToSurfaces(
      { facts, keyTerms, scenario, discussionPrompt, assignmentCore, mc, workedExample },
      { itemPlan },
    );
    // Projected slides must pass the same surface lint the direct contract does.
    if (Array.isArray(payload.slideContent)) {
      const slideContent = payload.slideContent.filter((slide, index) => {
        const problems = lintEnrichedSlideContent(slide);
        if (problems.length > 0) {
          issues.push({ lessonId, surface: 'slideContent', index, problems });
          return false;
        }
        return true;
      });
      if (slideContent.length > 0) payload.slideContent = slideContent;
      else delete payload.slideContent;
    }
    lessons[lessonId] = payload;
  }

  if (Object.keys(lessons).length === 0) return null;
  return { lessons, issues, courseLevel: parsed.courseLevel || null };
}
