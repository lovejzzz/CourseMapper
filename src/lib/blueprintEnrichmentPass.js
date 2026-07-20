import { cleanText, stripLessonPrefix } from './compilerText';
import { expandKeys } from './keyMaps';
import { lintItemAdmission } from './itemAdmissionLint';
import { projectKernelToSurfaces } from './kernelProjection';
import {
  assessTargetLanguagePresence,
  detectForeignLanguageTeachingContent,
  mandarinTargetLanguageRequirements,
} from './languageIdentityGuard';
import { lintDecisionScenario } from './scenarioContract';
import { isLessonTitleEchoSemanticSurface } from './lessonSemanticRelevance';
import {
  findScionExplanationKeyConflict,
  findScionCitedSourceKeyMismatch,
  findScionEquivalentComparisonOptionPair,
  findScionEquivalentEquationOptionPair,
  findScionMissingKeyExplanationSupport,
  findScionMultipleExplanationSupportedOptions,
  findScionMultipleSourceSupportedOptions,
  findScionNearDuplicateOptionPair,
  findScionSourceAnswerSupport,
  findScionUnsupportedScopeOption,
  normalizeScionOptionIdentity,
  repairScionMcItem,
} from './scionAnswerKeyAlignment';
import { assessScionKeyTermContract } from './scionKeyTermContract';
import { scionFactContractForLesson } from './scionEvidenceContract';

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

// ── v0.14.1 round-2 (fix 4): romanization for language courses ──────────────
// The live Mandarin study guides shipped hanzi key terms with no tone-marked
// pinyin. The compiler cannot invent romanization deterministically, but the
// kernel prompt CAN ask for it: language courses get an extra keyTerm field
// `rm` (optional everywhere else; lint stays tolerant when absent).

// CJK (hanzi/kana/hangul) plus the other major non-Latin scripts a world-
// language course is likely to teach in (Cyrillic, Hebrew, Arabic,
// Devanagari, Thai).
const NON_LATIN_SCRIPT_RE =
  /[\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0904-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

const LANGUAGE_COURSE_NAME_RE =
  /\bmandarin|\bchinese|\bjapanese|\bkorean|\bcantonese|\barabic|\bhebrew|\brussian|\bhindi|\bthai|\bvietnamese|world language|foreign language/i;

/**
 * True when the course teaches in (or about) a non-Latin script — the gate
 * for the romanization prompt instruction. Reads the course name plus the
 * leading lesson titles, so "Elementary Mandarin Chinese I" and a course
 * whose titles carry hanzi both qualify.
 */
export function courseUsesNonLatinScript(courseMap) {
  const text = [courseMap?.courseName, ...(courseMap?.lessons || []).slice(0, 8).map((lesson) => lesson?.title)]
    .filter(Boolean)
    .join(' ');
  return NON_LATIN_SCRIPT_RE.test(text) || LANGUAGE_COURSE_NAME_RE.test(text);
}

const ROMANIZATION_PROMPT_LINE =
  'Language-course key terms: every keyTerm whose tr contains non-Latin script (hanzi, kana, hangul, etc.) MUST include rm = its learner-facing romanization with tone or vowel marks (e.g. pinyin "nǐ hǎo") — a non-Latin term without rm is incomplete and will be rejected. Omit rm for Latin-script terms.';

/**
 * Sanitize a model-supplied romanization: plausible romanizations are short
 * Latin-script strings. Anything carrying the original script or absurd
 * length is dropped (the TERM is kept — a bad rm never costs the atom).
 */
function sanitizeRomanization(value) {
  const text = cleanText(value);
  if (!text || text.length > 80 || NON_LATIN_SCRIPT_RE.test(text)) return '';
  return text;
}

// ── v0.14.5 (F2): dialogue scripts for language courses ─────────────────────
// The kernel contract gains an optional per-lesson `dialogue` field, gated by
// the SAME language signal as rm (courseUsesNonLatinScript). It mirrors the
// rm contract end to end: language-gated prompt line, lint-tolerant parsing
// (a malformed dialogue never costs the lesson), optional everywhere else.
// COST DISCIPLINE: dialogue deliberately does NOT join the romanization
// recovery retry (listLessonRomanizationGaps stays keyTerms-only) — an absent
// dialogue is fine and never earns a second model call.

const DIALOGUE_PROMPT_LINE =
  'Language-course dialogue: for each lesson ALSO return dialogue = 4-6 short conversational turns that use this ' +
  'lesson\'s keyTerms vocabulary, shaped [{"speaker":"A"|"B","line":"one short sentence in the target script",' +
  '"rm":"its tone- or vowel-marked romanization"}]. Alternate speakers A and B and keep each line under 12 words. ' +
  'Omit dialogue when the lesson teaches no target-script vocabulary.';

// Admission requires the same visible evidence the learner-facing package
// needs. Keep this instruction next to the generic romanization contract so a
// compact model is never asked for Latin-only Pinyin and then rejected later
// for failing a requirement that appeared only in the parser.
const MANDARIN_TARGET_LANGUAGE_PROMPT_LINE =
  'Single-language Mandarin requirement: every broad Mandarin lesson must contain at least one visible Hanzi example paired with its tone-marked Pinyin (for example, 你好 with nǐ hǎo).';
const MANDARIN_PINYIN_ONLY_PROMPT_LINE =
  'Source-scoped Pinyin/tones requirement: include accurate, visible tone-marked Pinyin. Do not invent unsupported Hanzi merely to satisfy a generic Mandarin pattern.';

const DIALOGUE_TURN_CAP = 6;
const DIALOGUE_LINE_MAX_CHARS = 160;

/**
 * Sanitize a model-supplied dialogue: malformed turns are DROPPED (never the
 * lesson), the cap is 6 turns, speakers normalize to alternating A/B, and
 * each turn's rm passes the same sanitizer as keyTerm romanization. Fewer
 * than 2 usable turns → no dialogue at all (a one-line "dialogue" is noise).
 */
export function sanitizeDialogueTurns(value) {
  const turns = [];
  for (const raw of asArray(value)) {
    if (turns.length >= DIALOGUE_TURN_CAP) break;
    if (!raw || typeof raw !== 'object') continue;
    const line = cleanText(raw.line ?? raw.ln);
    if (!line || line.length > DIALOGUE_LINE_MAX_CHARS) continue;
    if (META_SURFACE_RE.test(line)) continue;
    const speakerRaw = cleanText(raw.speaker ?? raw.sp).toUpperCase();
    const speaker = speakerRaw === 'A' || speakerRaw === 'B' ? speakerRaw : turns.length % 2 === 0 ? 'A' : 'B';
    const romanization = sanitizeRomanization(raw.rm ?? raw.romanization);
    turns.push({ speaker, line, ...(romanization ? { rm: romanization } : {}) });
  }
  return turns.length >= 2 ? turns : [];
}

/**
 * Round-3 polish (romanization recovery): the terms in a parsed lesson
 * payload that still need romanization — non-Latin script with no usable
 * (sanitizeRomanization-non-empty) rm. Empty for Latin-script lessons, so
 * non-language courses never enter the recovery path.
 */
export function listLessonRomanizationGaps(payload) {
  const terms = Array.isArray(payload?.keyTerms) ? payload.keyTerms : [];
  return terms
    .filter((term) => NON_LATIN_SCRIPT_RE.test(cleanText(term?.term)) && !sanitizeRomanization(term?.romanization))
    .map((term) => cleanText(term.term))
    .filter(Boolean);
}

/**
 * Round-3 polish: merge a romanization-recovery retry into the lesson payload
 * the chunk loop already accepted. The ORIGINAL lesson wins everywhere — the
 * retry only contributes rm values for terms matched by term string, plus
 * whole new terms when the original parsed thin (< 3 keyTerms). A recovery
 * call can therefore never lose content that already passed the lints.
 */
export function mergeRomanizationRecovery(original, retry) {
  if (!original) return retry || null;
  const retryTerms = Array.isArray(retry?.keyTerms) ? retry.keyTerms : [];
  if (retryTerms.length === 0) return original;
  const retryRomanizations = new Map();
  for (const term of retryTerms) {
    const key = cleanText(term?.term).toLowerCase();
    const romanization = sanitizeRomanization(term?.romanization);
    if (key && romanization && !retryRomanizations.has(key)) retryRomanizations.set(key, romanization);
  }
  const originalTerms = Array.isArray(original.keyTerms) ? original.keyTerms : [];
  const keyTerms = originalTerms.map((term) => {
    if (sanitizeRomanization(term?.romanization)) return term;
    const recovered = retryRomanizations.get(cleanText(term?.term).toLowerCase());
    return recovered ? { ...term, romanization: recovered } : term;
  });
  if (originalTerms.length < 3) {
    const known = new Set(keyTerms.map((term) => cleanText(term?.term).toLowerCase()));
    for (const term of retryTerms) {
      const key = cleanText(term?.term).toLowerCase();
      if (!key || known.has(key)) continue;
      known.add(key);
      keyTerms.push(term);
    }
  }
  return { ...original, keyTerms };
}

function truncateText(value, limit = MAX_TEXT_CHARS) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
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
    'Do not use internal scaffolding phrases such as "field pattern", "Week N covering", "lesson evidence thread", or "genre-specific quality focus"; name the concrete concept or student task instead.',
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
  'Key-term fields must make distinct instructional moves: df is exactly one complete definition sentence; eg is a concrete application; mi is a genuinely false learner belief that never repeats a supplied fact; cx directly refutes mi without restating df or eg.',
  'Multiple-choice rules (Haladyna): the stem poses one complete, content-bearing problem; exactly 4 options; one defensibly correct answer;',
  'Except for the single Remember item, every multiple-choice stem must present concrete case evidence that students inspect before choosing; do not write disguised definition recall.',
  'distractors are plausible misconceptions of the SUBJECT, homogeneous with the key in length and grammar; never use "all of the above" or "none of the above".',
  'Grounding: rely only on the listed readings/topics; do not invent citations, URLs, page numbers, statistics, or named studies beyond them.',
  'Return strict JSON only — no markdown fences, no commentary.',
].join(' ');

const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;

const CUMULATIVE_REVIEW_RE =
  /\b(?:course|cumulative|comprehensive|midterm|final)\s+(?:review|synthesis|exam(?:ination)?|assessment|performance)\b|\b(?:review|synthesis)\s+(?:for\s+)?(?:the\s+)?(?:midterm|final|course)\b/i;

function cumulativeReviewAnchors(courseMap, lessonIndex) {
  const lesson = courseMap?.lessons?.[lessonIndex];
  const identity = [lesson?.title, ...(lesson?.sections || []).map((section) => section?.topicSection)]
    .filter(Boolean)
    .join(' ');
  if (!CUMULATIVE_REVIEW_RE.test(identity)) return [];

  const anchors = [];
  const seen = new Set();
  for (const prior of asArray(courseMap?.lessons).slice(0, lessonIndex)) {
    for (const raw of [prior?.title, ...asArray(prior?.sections).map((section) => section?.topicSection)]) {
      const anchor = cleanText(raw)
        .replace(/^lesson\s+\d+\s*[:.\-–—]\s*/i, '')
        .replace(/^\d+(?:\.\d+)*\s*[:.\-–—]\s*/, '')
        .trim();
      const key = anchor.toLowerCase();
      if (!anchor || anchor.length < 4 || seen.has(key) || CUMULATIVE_REVIEW_RE.test(anchor)) continue;
      seen.add(key);
      anchors.push(truncateText(anchor, 100));
      if (anchors.length >= 12) return anchors;
    }
  }
  return anchors;
}

function selectInstructorFactsForLesson(instructorProvidedFacts, lesson) {
  const facts = [
    ...new Set(
      asArray(instructorProvidedFacts)
        .map(cleanText)
        .filter((fact) => fact.length >= 12 && fact.length <= 400),
    ),
  ];
  if (facts.length < 3) return [];
  if (facts.length <= 5) return facts;
  const lessonTokens = new Set(
    [
      lesson?.title,
      ...asArray(lesson?.sections).flatMap((section) => [section?.learningObjectives, section?.topicSection]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g) || [],
  );
  return facts
    .map((fact, index) => ({
      fact,
      index,
      score: (fact.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((token) => lessonTokens.has(token)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 5)
    .sort((left, right) => left.index - right.index)
    .map(({ fact }) => fact);
}

function summarizeLessonsForContent(courseMap, lessonIndices, sourceBrief = '', instructorProvidedFacts = []) {
  const privateSourceBrief = truncateText(cleanText(sourceBrief), 900);
  return asArray(lessonIndices)
    .map((lessonIndex) => {
      const lesson = courseMap?.lessons?.[lessonIndex];
      if (!lesson) return null;
      const section = lesson.sections?.[0] || {};
      const reviewAnchors = cumulativeReviewAnchors(courseMap, lessonIndex);
      const sourceFacts = selectInstructorFactsForLesson(instructorProvidedFacts, lesson);
      return {
        lessonId: `lesson-${lessonIndex + 1}`,
        ...(sourceFacts.length >= 3 ? { sourceFactPolicy: 'numbered-source-ledger-v1', sourceFacts } : {}),
        title: truncateText(lesson.title || `Lesson ${lessonIndex + 1}`, 140),
        objectives: truncateText(String(section.learningObjectives || ''), 700),
        topics: truncateText(
          asArray(lesson.sections)
            .map((entry) => entry?.topicSection)
            .filter(Boolean)
            .join('; '),
          400,
        ),
        // The instructor's original brief is private generation context, not
        // an assigned reading. Carry it only inside this model-facing summary
        // so source facts survive the Course Map compression without leaking
        // into the visible Supporting resources cell.
        readings: truncateText(
          [
            String(section.supportingResources || ''),
            privateSourceBrief && `Instructor source brief: ${privateSourceBrief}`,
          ]
            .filter(Boolean)
            .join('\n'),
          1200,
        ),
        ...(reviewAnchors.length > 0 ? { reviewAnchors } : {}),
      };
    })
    .filter(Boolean);
}

export function buildQuizItemPlan(questionsPerLesson) {
  const count = Math.max(5, Math.min(7, Number(questionsPerLesson) || 6));
  return [
    { index: 0, type: 'multiple_choice', bloom: 'Remember', note: 'foundational fact or definition' },
    {
      index: 1,
      type: 'multiple_choice',
      bloom: 'Apply',
      note: 'apply the concept to a concrete scenario with named evidence',
    },
    {
      index: 2,
      type: 'multiple_choice',
      bloom: 'Analyze',
      note: 'diagnose a concrete case by comparing its evidence',
    },
    { index: 3, type: 'short_answer', bloom: 'Analyze', note: 'short written analysis with model answer' },
    {
      index: 4,
      type: 'multiple_choice',
      bloom: 'Evaluate',
      note: 'judge a claim or method using concrete case evidence',
    },
    { index: 5, type: 'essay', bloom: 'Create', note: 'synthesis task with sample answer and scoring guidance' },
  ].slice(0, count);
}

/**
 * A parsed payload can exist while most of its authored atoms were linted
 * out. Treat that as incomplete so native Pass B recovery repairs the lesson
 * instead of quietly shipping a two-question template under a green package.
 */
export function assessProjectedKernelCoverage(payload, { requiredMcCount = 4 } = {}) {
  const quizItems = asArray(payload?.quizItems);
  const quizItemCount = quizItems.length;
  const mcCount = quizItems.filter((item) => item?.type === 'multiple_choice').length;
  const factCount = asArray(payload?.kernel?.facts).length;
  const keyTermCount = asArray(payload?.keyTerms).length;
  const slideCount = asArray(payload?.slideContent).length;
  const discussionPositionCount = asArray(payload?.discussionPrompt?.positions).length;
  const assignmentParameterCount = asArray(payload?.assignmentCore?.parameters).length;
  const scenario = payload?.kernel?.scenario || {};
  const studyGuide = payload?.studyGuide || {};
  const issues = [];
  if (mcCount < requiredMcCount) issues.push(`mc-coverage:${mcCount}/${requiredMcCount}`);
  if (keyTermCount < 3) issues.push(`key-term-coverage:${keyTermCount}/3`);
  if (slideCount < 3) issues.push(`slide-coverage:${slideCount}/3`);
  if (discussionPositionCount !== 3) issues.push(`discussion-positions:${discussionPositionCount}/3`);
  if (assignmentParameterCount !== 4) issues.push(`assignment-parameters:${assignmentParameterCount}/4`);
  if (!cleanText(scenario.setup) || !cleanText(scenario.materials)) issues.push('scenario-coverage');
  if (!cleanText(studyGuide.summary) || !cleanText(studyGuide.reviewStrategy)) issues.push('study-guide-coverage');
  const passedChecks = 7 - issues.length;
  // `complete` measures the full requested surface contract. It is useful for
  // quality diagnostics, but it is deliberately stricter than the boundary
  // between a real lesson kernel and a structural template. A lesson with an
  // admitted semantic backbone, assessments, and every core teaching surface
  // is instructionally usable even when it has fewer optional MC or slide
  // variants than requested. Keeping these states separate prevents the
  // compiler from calling rich content "fallback" and repeatedly buying the
  // same model repair without weakening any atomic semantic lint.
  const usabilityIssues = [];
  if (factCount + keyTermCount < 4) usabilityIssues.push(`semantic-backbone:${factCount + keyTermCount}/4`);
  if (keyTermCount < 1) usabilityIssues.push(`key-term-core:${keyTermCount}/1`);
  if (quizItemCount < 2) usabilityIssues.push(`quiz-core:${quizItemCount}/2`);
  if (slideCount < 1) usabilityIssues.push(`slide-core:${slideCount}/1`);
  if (discussionPositionCount !== 3) usabilityIssues.push(`discussion-positions:${discussionPositionCount}/3`);
  if (assignmentParameterCount !== 4) usabilityIssues.push(`assignment-parameters:${assignmentParameterCount}/4`);
  if (!cleanText(scenario.setup) || !cleanText(scenario.materials)) usabilityIssues.push('scenario-coverage');
  if (!cleanText(studyGuide.summary) || !cleanText(studyGuide.reviewStrategy)) {
    usabilityIssues.push('study-guide-coverage');
  }
  return {
    complete: issues.length === 0,
    usable: usabilityIssues.length === 0,
    issues,
    usabilityIssues,
    score: passedChecks,
    factCount,
    quizItemCount,
    mcCount,
    keyTermCount,
    slideCount,
    discussionPositionCount,
    assignmentParameterCount,
  };
}

export function buildLessonContentEnrichmentPrompt(courseMap, lessonIndices, options = {}) {
  const questionsPerLesson = Math.max(5, Math.min(7, Number(options.questionsPerLesson) || 6));
  const keyTermsPerLesson = Math.max(3, Math.min(6, Number(options.keyTermsPerLesson) || 4));
  const lessons = summarizeLessonsForContent(
    courseMap,
    lessonIndices,
    options.sourceBrief,
    options.instructorProvidedFacts,
  );

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
            df: 'exactly one complete, precise definition sentence in subject language',
            eg: 'concrete domain example',
            mi: 'common student misunderstanding of this term',
            cx: 'a direct correction that refutes mi in different wording and does not repeat df',
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
          po: ['exactly 3 defensible positions: main, contrast, and conditional or synthesis'],
        },
        assignmentCore: {
          td: '2-3 sentences: the actual case/dataset/text students work on and what they produce',
          pa: ['exactly 4 distinct parameters: scope, format, required evidence/source, length or time'],
        },
        studyGuide: {
          sm: '2-3 sentence subject-matter summary of what this lesson teaches, written in disciplinary language (never meta-language about the course or its materials)',
          rs: 'one exam-review strategy that names the specific concepts, methods, or cases to rehearse',
        },
      },
    ],
  };

  const userPrompt = [
    `Course: ${truncateText(courseMap?.courseName || 'Untitled Course', 120)}`,
    `Write assessment content for ${lessons.length} lesson(s). For each lesson produce exactly ${itemPlan.length} quizItems following this plan:`,
    JSON.stringify(itemPlan),
    `…and ${keyTermsPerLesson} keyTerms drawn from the lesson topics/objectives, plus 3 slideContent entries, one discussionPrompt, and one assignmentCore per lesson.`,
    'Every discussionPrompt uses exactly three defensible positions: main, contrast, and a conditional or synthesis position. Every assignmentCore uses four distinct parameters: scope, format, required evidence/source, and length or time.',
    // v0.14.1 round-2 (fix 4): same romanization contract as the kernel path.
    ...(courseUsesNonLatinScript(courseMap) ? [ROMANIZATION_PROMPT_LINE] : []),
    'Question difficulty and cognitive level must match the plan. Use the objectives verbatim as the knowledge targets.',
    'Use the abbreviated JSON keys exactly as shown: q=question, op=options, ai=answerIndex, dr=distractorRationales, an=answer, ex=explanation, sg=scoringGuidance, tr=term, df=definition, eg=example, mi=misconception, cx=correction, ti=title, bu=bullets, no=notes, pr=prompt, tn=tension, po=positions, td=taskDescription, pa=parameters.',
    'Return JSON matching this shape:',
    JSON.stringify(schema),
    '',
    'Lessons:',
    JSON.stringify(lessons),
  ].join('\n');

  return {
    systemPrompt: LESSON_CONTENT_SYSTEM_PROMPT,
    userPrompt,
    courseName: truncateText(courseMap?.courseName || 'Untitled Course', 120),
    lessons,
    itemPlan,
    approxInputTokens: Math.ceil((LESSON_CONTENT_SYSTEM_PROMPT.length + userPrompt.length) / 4),
  };
}

export function lintEnrichedQuizItem(item, { groundingText = '', sourceClaims = [] } = {}) {
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
    if (
      new Set(options.map(normalizeScionOptionIdentity)).size !== options.length ||
      findScionNearDuplicateOptionPair(options)
    ) {
      issues.push('duplicate-options');
    }
    if (findScionEquivalentEquationOptionPair(options)) issues.push('equivalent-equation-options');
    if (findScionEquivalentComparisonOptionPair(options)) issues.push('equivalent-comparison-options');
    if (sourceClaims.length > 0 && findScionUnsupportedScopeOption(options, { sourceClaims })) {
      issues.push('unsupported-scope-option');
    }
    if (
      Number.isInteger(answerIndex) &&
      answerIndex >= 0 &&
      answerIndex < options.length &&
      normalizeScionOptionIdentity(item?.explanation) === normalizeScionOptionIdentity(options[answerIndex])
    ) {
      issues.push('explanation-repeats-answer');
    }
    const sourceSupport = findScionSourceAnswerSupport(item, { sourceClaims });
    if (findScionCitedSourceKeyMismatch(item, { sourceClaims })) issues.push('source-fact-key-mismatch');
    if (!sourceSupport && findScionExplanationKeyConflict(item)) issues.push('explanation-key-conflict');
    if (findScionMultipleExplanationSupportedOptions(item)) issues.push('explanation-supports-multiple-options');
    if (findScionMissingKeyExplanationSupport(item)) issues.push('explanation-omits-key-support');
    if (
      findScionMultipleSourceSupportedOptions(item, {
        sourceClaims,
        allowBroadSourceContext: true,
      })
    ) {
      issues.push('multiple-source-supported-options');
    }
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
  return [...new Set(issues)];
}

export function lintEnrichedKeyTerm(term, { lessonTitle = '', knownFacts = [] } = {}) {
  // `rm` remains optional and is sanitized at parse time. All substantive
  // fields share the same compact/full-key contract used by Scion admission.
  const result = assessScionKeyTermContract(term, {
    lessonTitle,
    knownFacts,
    definitionMin: 40,
    semanticProfile: 'strict-v6',
  });
  const labels = {
    'tr-length': 'term-missing',
    'df-length': 'definition-too-short',
    'eg-length': 'example-too-short',
    'mi-length': 'misconception-too-short',
    'cx-length': 'correction-too-short',
  };
  return result.issues.map((issue) => labels[issue] || issue);
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
    const languageContamination = detectForeignLanguageTeachingContent({
      courseIdentity: prompt?.courseName,
      text: JSON.stringify(entry),
    });
    if (languageContamination) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: 0,
        reason: 'foreign-language-contamination',
        atomIssueCount: 0,
        problems: [`foreign-language-contamination:${languageContamination.languageId}`],
      });
      continue;
    }
    const targetLanguagePresence = assessTargetLanguagePresence({
      courseIdentity: prompt?.courseName,
      sourceText: JSON.stringify((prompt?.lessons || []).find((lesson) => lesson.lessonId === lessonId) || {}),
      text: JSON.stringify(entry),
    });
    if (!targetLanguagePresence.complete) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: 0,
        reason: 'target-language-missing',
        atomIssueCount: 0,
        problems: targetLanguagePresence.missing.map(
          (missing) => `target-language-missing:${targetLanguagePresence.languageId}:${missing}`,
        ),
      });
      continue;
    }
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
      const romanization = sanitizeRomanization(term.rm || term.romanization);
      keyTerms.push({
        term: cleanText(term.term),
        definition: cleanText(term.definition),
        example: cleanText(term.example),
        misconception: cleanText(term.misconception),
        correction: cleanText(term.correction),
        // v0.14.1 round-2 (fix 4): optional romanization rides along so the
        // study guide renders "你好 (nǐ hǎo)".
        ...(romanization ? { romanization } : {}),
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
  'Abbreviated JSON keys: q=question, op=options, ai=answerIndex, fi=sourceFactIndexes, ex=explanation, tr=term, df=definition, eg=example, mi=misconception, cx=correction, pr=prompt, tn=tension, po=positions, td=taskDescription, pa=parameters, su=setup, ma=materials, wp=problem, ws=steps, wr=result, sm=summary, rs=reviewStrategy.';

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
            df: 'exactly one complete, precise definition sentence in subject language',
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
          su: '2-3 sentence concrete context plus an actionable decision/problem, evidence details, and a real tension or constraint',
          ma: 'the specific records, observations, data, design, or text students inspect to make the decision',
        },
        discussionPrompt: {
          pr: 'a genuinely debatable disciplinary question',
          tn: 'one sentence naming why reasonable positions disagree',
          po: ['exactly 3 defensible positions: main, contrast, and conditional or synthesis'],
        },
        assignmentCore: {
          td: '2-3 sentences: the actual case/dataset/text students work on and what they produce',
          pa: ['exactly 4 distinct parameters: scope, format, required evidence/source, length or time'],
        },
        studyGuide: {
          sm: '2-3 sentence subject-matter summary in disciplinary language',
          rs: 'one review strategy naming the specific concepts, methods, or cases to rehearse',
        },
        mc: [
          {
            q: 'content-bearing multiple-choice stem about the subject',
            op: ['exactly 4 options, homogeneous in length and grammar'],
            ai: 0,
            fi: ['1-2 zero-based indexes into this lesson facts array that directly support the keyed option'],
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
    discussionProtocol: {
      format: 'the named discussion format this discipline actually uses (e.g. "Case Decision Board", "Proof Clinic")',
      participationPattern: '4-6 comma-separated moves in the order students perform them, in disciplinary language',
      artifactUse: 'one sentence: what students inspect or produce during the exchange',
      reviewFocus: 'comma-separated qualities the instructor listens for, specific to this discipline',
    },
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
  const recoveryAttempt = Math.max(0, Number(options.recoveryAttempt) || 0);
  const lessons = summarizeLessonsForContent(
    courseMap,
    lessonIndices,
    options.sourceBrief,
    options.instructorProvidedFacts,
  );
  const mandarinRequirement = mandarinTargetLanguageRequirements({
    courseIdentity: courseMap?.courseName,
    sourceText: JSON.stringify(lessons),
  });

  const systemPrompt = [
    LESSON_CONTENT_SYSTEM_PROMPT,
    `For every lesson in the request, return one knowledge kernel: 5-8 facts, ${keyTermsPerLesson} keyTerms, one scenario, one discussionPrompt, one assignmentCore, one studyGuide block, and exactly ${mcCount} mc items.`,
    `The mc items follow this cognitive plan (matching list order): ${itemPlan
      .filter((slot) => slot.type === 'multiple_choice')
      .map((slot) => `${slot.bloom} (${slot.note})`)
      .join('; ')}.`,
    'Every mc item must include fi with 1-2 valid zero-based indexes into that lesson facts array. The cited facts must directly support exactly one option and the explanation must state that support.',
    'Scenario contract: setup gives a concrete context, an actionable decision or problem, inspectable evidence, and a real tension or constraint; materials names the specific evidence packet. Do not use generic labels such as "scenario evidence" or "course materials".',
    'Surface depth contract: discussionPrompt has exactly three defensible positions (main, contrast, conditional or synthesis); assignmentCore has exactly four distinct parameters (scope, format, required evidence/source, length or time).',
    KERNEL_KEY_LEGEND,
    // v0.14.1 round-2 (fix 4): language courses pair every non-Latin term
    // with its romanization (rm) so study guides can render "你好 (nǐ hǎo)".
    // v0.14.5 (F2): the same gate adds the optional dialogue field — 4-6
    // short turns using the lesson's vocabulary, rendered into lesson plans
    // and study guides. Both lines ride the SAME kernel call (no extra cost).
    ...(courseUsesNonLatinScript(courseMap)
      ? [
          ROMANIZATION_PROMPT_LINE,
          DIALOGUE_PROMPT_LINE,
          ...(mandarinRequirement.required
            ? [mandarinRequirement.pinyinOnly ? MANDARIN_PINYIN_ONLY_PROMPT_LINE : MANDARIN_TARGET_LANGUAGE_PROMPT_LINE]
            : []),
        ]
      : []),
    'Return JSON matching this shape:',
    // v0.15.186: the courseLevel schema moved to the USER prompt. Embedding
    // it here gave chunk #1 a different system prompt than chunks 2..N,
    // splitting the shared prefix that provider prompt caches key on —
    // live telemetry showed cachedInputTokens: 0 on every kernel call.
    JSON.stringify(buildKernelSchema()),
  ]
    .filter(Boolean)
    .join('\n');

  // Round-3 polish: the romanization-recovery retry names the exact terms
  // that came back without rm, per lesson — a focused ask converts far more
  // reliably than re-sending the generic instruction ("Return the same
  // lesson with rm added for: 请坐, 再说一遍").
  const romanizationFocus =
    options.romanizationFocus && typeof options.romanizationFocus === 'object' ? options.romanizationFocus : null;
  const romanizationFocusLines = romanizationFocus
    ? Object.entries(romanizationFocus)
        .filter(([, terms]) => Array.isArray(terms) && terms.length > 0)
        .map(
          ([lessonId, terms]) =>
            `- ${lessonId}: return the same lesson with rm (tone-marked romanization) added for: ${terms.join(', ')}`,
        )
    : [];

  const userPrompt = [
    `Course: ${truncateText(courseMap?.courseName || 'Untitled Course', 120)}`,
    'Lessons:',
    JSON.stringify(lessons),
    ...(includeCourseLevel
      ? [
          `Also include the courseLevel object once (not per lesson), grounded in the same source facts, matching this shape: ${JSON.stringify(KERNEL_COURSE_LEVEL_SCHEMA)}`,
        ]
      : []),
    ...(romanizationFocusLines.length > 0
      ? ['Romanization recovery — these lessons returned non-Latin keyTerms without rm:', ...romanizationFocusLines]
      : []),
    ...(recoveryAttempt > 0
      ? [
          `Recovery attempt ${recoveryAttempt}: the previous response for these exact lessons was incomplete or failed admission. Re-author every requested lesson in full; do not summarize, apologize, or return an error object.`,
        ]
      : []),
    // OpenAI's json_object response format requires the word "JSON" in an
    // INPUT message — the system prompt maps to `instructions`, which the
    // guard does not scan. Without this line every kernel call 400s
    // ("Response input messages must contain the word 'json'…").
    'Return ONLY valid JSON matching the kernel shape from the instructions.',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    courseName: truncateText(courseMap?.courseName || 'Untitled Course', 120),
    lessons,
    itemPlan,
    includeCourseLevel,
    approxInputTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
  };
}

export function selectEnrichmentRecoveryChunk(missingLessonIndices, attemptedLessonIndices, limit = 4) {
  const missing = asArray(missingLessonIndices).filter((index) => Number.isInteger(index) && index >= 0);
  const attempted = new Set(asArray(attemptedLessonIndices));
  const unattempted = missing.filter((index) => !attempted.has(index));
  return (unattempted.length > 0 ? unattempted : missing).slice(0, Math.max(1, Number(limit) || 1));
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
  const issues = lintDecisionScenario(scenario);
  if (META_SURFACE_RE.test(cleanText(scenario?.setup))) issues.push('meta-scenario');
  return [...new Set(issues)];
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
  // v0.15.187 dictionary retirement (slice 1): the kernel may author the
  // course's OWN discussion protocol; when complete, the compiler prefers it
  // over the 34-genre dictionary (which becomes the validation fallback).
  const protocolSource =
    courseLevel.discussionProtocol && typeof courseLevel.discussionProtocol === 'object'
      ? courseLevel.discussionProtocol
      : {};
  const discussionProtocol = Object.fromEntries(
    [
      ['format', 60],
      ['participationPattern', 260],
      ['artifactUse', 260],
      ['reviewFocus', 260],
    ]
      .map(([key, max]) => [key, truncateText(protocolSource[key], max)])
      .filter(([, value]) => value),
  );
  const protocolComplete =
    Boolean(discussionProtocol.format) &&
    Boolean(discussionProtocol.participationPattern) &&
    Boolean(discussionProtocol.artifactUse) &&
    Boolean(discussionProtocol.reviewFocus);
  const grounded = payload ? countVocabularySignals({ signatureTerms, lens }, sourceVocabulary(payload)) : 1;
  if (signatureTerms.length === 0 && Object.keys(lens).length === 0) return null;
  if (grounded === 0) return null;
  return {
    signatureTerms,
    lens: Object.keys(lens).length > 0 ? lens : null,
    styleNotes,
    ...(protocolComplete ? { discussionProtocol } : {}),
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
  const repairs = [];

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
    // Scion's language-specific grammar can guarantee one compact pair even
    // when the weak draft forgets to repeat it inside facts/key terms. Keep
    // the pair structured: facts form the immutable source ledger and mc fi
    // indexes must keep naming exactly those claims.
    let targetLanguagePair = null;
    if (entry?.targetLanguagePair && typeof entry.targetLanguagePair === 'object') {
      const hanzi = cleanText(entry.targetLanguagePair.hanzi);
      const pinyin = cleanText(entry.targetLanguagePair.pinyin);
      const english = cleanText(entry.targetLanguagePair.english);
      const pairEvidence = `${hanzi} (${pinyin}) means ${english}.`;
      const pairPresence = assessTargetLanguagePresence({
        courseIdentity: prompt?.courseName,
        sourceText: JSON.stringify(promptLesson || {}),
        text: pairEvidence,
      });
      if (pairPresence.complete) {
        targetLanguagePair = { hanzi, pinyin, english };
      }
    }
    const languageContamination = detectForeignLanguageTeachingContent({
      courseIdentity: prompt?.courseName,
      text: JSON.stringify(entry),
    });
    if (languageContamination) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: entryIndex,
        reason: 'foreign-language-contamination',
        atomIssueCount: 0,
        problems: [`foreign-language-contamination:${languageContamination.languageId}`],
      });
      continue;
    }
    const targetLanguagePresence = assessTargetLanguagePresence({
      courseIdentity: prompt?.courseName,
      sourceText: JSON.stringify(promptLesson || {}),
      text: JSON.stringify(entry),
    });
    if (!targetLanguagePresence.complete) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: entryIndex,
        reason: 'target-language-missing',
        atomIssueCount: 0,
        problems: targetLanguagePresence.missing.map(
          (missing) => `target-language-missing:${targetLanguagePresence.languageId}:${missing}`,
        ),
      });
      continue;
    }

    const facts = [];
    const sourceFactsByIndex = asArray(entry?.facts).map((fact, index) => {
      const problems = lintKernelFact(fact);
      if (problems.length > 0) {
        issues.push({ lessonId, surface: 'facts', index, problems });
        return null;
      }
      const admittedFact = cleanText(fact);
      facts.push(admittedFact);
      return admittedFact;
    });

    const keyTerms = [];
    asArray(entry?.keyTerms).forEach((term, index) => {
      if (isLessonTitleEchoSemanticSurface(term?.term, promptLesson || {})) {
        // Keep the lesson title as identity, but never promote a long title
        // into a glossary atom. Projecting it would multiply one model quirk
        // through quiz scenarios, answers, rubrics, FAQ copy, and tags.
        return;
      }
      const problems = lintEnrichedKeyTerm(term, {
        lessonTitle: promptLesson?.title || '',
        knownFacts: facts,
      });
      if (problems.length > 0) issues.push({ lessonId, surface: 'keyTerms', index, problems });
      else {
        const romanization = sanitizeRomanization(term.rm || term.romanization);
        keyTerms.push({
          term: cleanText(term.term),
          definition: cleanText(term.definition),
          example: cleanText(term.example),
          misconception: cleanText(term.misconception),
          // v0.13.3: the corrective statement — the payoff line that counters
          // the misconception (never a restated definition).
          correction: cleanText(term.correction),
          // v0.14.1 round-2 (fix 4): optional romanization for language
          // courses ("你好" → "nǐ hǎo").
          ...(romanization ? { romanization } : {}),
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
      // Scion's double-blind verifier deliberately quarantines an item by
      // replacing its seat with null when no independently verified repair is
      // earned. Treat that as one rejected atom. Dereferencing the null here
      // used to throw and discard the entire otherwise-rich lesson kernel.
      if (!item || typeof item !== 'object') {
        issues.push({ lessonId, surface: 'mc', index, problems: ['missing-item'] });
        return;
      }
      // Repair only evidence already present in the model output: retain a
      // complete sentence prefix before an unfinished tail, then realign only
      // a decisive, unique explanation/key contradiction. Both operations are
      // recorded at this canonical admission boundary before projection.
      const rawSourceFactIndexes = item?.sourceFactIndexes;
      const sourceFactIndexes = Array.isArray(rawSourceFactIndexes) ? [...new Set(rawSourceFactIndexes)] : [];
      const sourceFactIndexesValid =
        sourceFactIndexes.length > 0 &&
        sourceFactIndexes.length <= 2 &&
        sourceFactIndexes.length === rawSourceFactIndexes?.length &&
        sourceFactIndexes.every(
          (factIndex) =>
            Number.isInteger(factIndex) &&
            factIndex >= 0 &&
            factIndex < sourceFactsByIndex.length &&
            Boolean(sourceFactsByIndex[factIndex]),
        );
      const citedSourceClaims = sourceFactIndexesValid
        ? sourceFactIndexes.map((factIndex) => sourceFactsByIndex[factIndex])
        : [];
      const repaired = repairScionMcItem(item, { lessonId, itemIndex: index, sourceClaims: citedSourceClaims });
      const admittedItem = repaired.item;
      const problems = lintEnrichedQuizItem(
        { ...admittedItem, type: 'multiple_choice' },
        { groundingText, sourceClaims: citedSourceClaims },
      );
      if (rawSourceFactIndexes !== undefined && !sourceFactIndexesValid) problems.push('source-fact-index');
      if (problems.length > 0) issues.push({ lessonId, surface: 'mc', index, problems });
      else {
        repairs.push(...repaired.repairs);
        mc.push({
          question: cleanText(admittedItem.question),
          options: asArray(admittedItem.options).map(cleanText).filter(Boolean),
          answerIndex: Number(admittedItem.answerIndex) || 0,
          explanation: cleanText(admittedItem.explanation),
        });
      }
    });

    const factContract = scionFactContractForLesson(promptLesson || {}, { userPrompt: prompt?.userPrompt });
    const exactSourceLedgerFacts =
      factContract.mode === 'numbered-source-ledger-v1' &&
      facts.length === factContract.factCount &&
      facts.every((fact, index) => cleanText(fact) === cleanText(factContract.claims[index]));
    if (keyTerms.length === 0 && mc.length === 0 && !exactSourceLedgerFacts) {
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

    if (exactSourceLedgerFacts && keyTerms.length === 0 && mc.length === 0) {
      issues.push({
        lessonId,
        surface: 'lesson',
        index: entryIndex,
        reason: 'source-ledger-facts-only',
        atomIssueCount: issues.length - issueCountAtEntryStart,
        problems: ['source-ledger-facts-only'],
      });
    }

    const payload = projectKernelToSurfaces(
      { facts, keyTerms, scenario, discussionPrompt, assignmentCore, mc, workedExample },
      { itemPlan },
    );
    if (targetLanguagePair) payload.targetLanguagePair = targetLanguagePair;
    // v0.14.5 (F2): the optional language-course dialogue rides the payload
    // beside the projected surfaces. Malformed turns were dropped above the
    // lesson line (sanitizeDialogueTurns) — a bad dialogue never costs the
    // lesson, and an ABSENT dialogue is fine: it does not join the
    // romanization recovery retry (cost discipline).
    const dialogue = sanitizeDialogueTurns(entry?.dialogue);
    if (dialogue.length > 0) payload.dialogue = dialogue;
    // v0.15.187: the authored study-guide body (summary + review strategy)
    // rides beside the projected surfaces, dialogue-style: a bad block is
    // dropped with an issue row and never costs the lesson; an absent one
    // falls back to the template body downstream.
    if (entry?.studyGuide && typeof entry.studyGuide === 'object') {
      const summary = cleanText(entry.studyGuide.summary);
      const reviewStrategy = cleanText(entry.studyGuide.reviewStrategy);
      const problems = [];
      if (summary && (summary.length < 60 || summary.length > 600)) problems.push('summary-length');
      if (summary && META_SURFACE_RE.test(summary)) problems.push('meta-summary');
      if (reviewStrategy && (reviewStrategy.length < 30 || reviewStrategy.length > 400))
        problems.push('review-strategy-length');
      if (reviewStrategy && META_SURFACE_RE.test(reviewStrategy)) problems.push('meta-review-strategy');
      if (problems.length > 0) {
        issues.push({ lessonId, surface: 'studyGuide', index: 0, problems });
      } else if (summary || reviewStrategy) {
        payload.studyGuide = {
          ...(summary ? { summary } : {}),
          ...(reviewStrategy ? { reviewStrategy } : {}),
        };
      }
    }
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
  return { lessons, issues, repairs, courseLevel: parsed.courseLevel || null };
}
