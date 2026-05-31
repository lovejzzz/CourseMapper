const FEATURE_LABELS = {
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
  courseMap: 'Course Map',
};

const POSITIVE_ACTION_RE =
  /\b(?:accept|accepted|approve|approved|edit|edits|edited|change|changed|prefer|preferred)\b/i;
const NEGATIVE_ACTION_RE = /\b(?:reject|rejected|decline|declined|undo|remove|removed|avoid|dislike)\b/i;

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function unique(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values.map((item) => cleanText(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeFeatureId(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (FEATURE_LABELS[text]) return text;
  const lower = text.toLowerCase();
  const match = Object.keys(FEATURE_LABELS).find((featureId) => featureId.toLowerCase() === lower);
  return match || text;
}

function normalizeField(value) {
  return cleanText(value)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function signalWeight(pattern = {}) {
  const count = Number(pattern.count ?? pattern.accessCount ?? pattern.repetitions ?? 1);
  const importance = Number(pattern.importance ?? 2);
  return Math.max(1, count || 1) + Math.max(0, importance - 2);
}

function normalizePattern(pattern = {}) {
  const meta = pattern.meta && typeof pattern.meta === 'object' ? pattern.meta : {};
  const featureId = normalizeFeatureId(pattern.featureId ?? meta.featureId ?? pattern.feature);
  const field = normalizeField(pattern.field ?? meta.field ?? pattern.path ?? meta.path);
  const action = cleanText(pattern.action ?? meta.action ?? pattern.kind ?? 'edited').toLowerCase();
  const content = cleanText(pattern.content ?? pattern.summary ?? pattern.note);
  const weight = signalWeight(pattern);
  const direction = NEGATIVE_ACTION_RE.test(action || content)
    ? 'negative'
    : POSITIVE_ACTION_RE.test(action || content)
      ? 'positive'
      : 'neutral';

  if (!featureId && !field && !content) return null;
  return {
    featureId: featureId || 'general',
    field,
    action,
    content,
    weight,
    direction,
  };
}

function addFeatureSignal(featureSignals, pattern) {
  const current = featureSignals[pattern.featureId] || {
    featureId: pattern.featureId,
    label: FEATURE_LABELS[pattern.featureId] || pattern.featureId,
    count: 0,
    weight: 0,
    positive: 0,
    negative: 0,
    fields: [],
    actions: [],
  };
  current.count += 1;
  current.weight += pattern.weight;
  if (pattern.direction === 'negative') current.negative += 1;
  else current.positive += 1;
  current.fields = unique([...current.fields, pattern.field].filter(Boolean), 8);
  current.actions = unique([...current.actions, pattern.action].filter(Boolean), 8);
  featureSignals[pattern.featureId] = current;
}

function fieldText(pattern) {
  return `${pattern.featureId} ${pattern.field} ${pattern.action} ${pattern.content}`.toLowerCase();
}

function applyPreferenceRules(pattern, buckets) {
  const text = fieldText(pattern);
  const isNegative = pattern.direction === 'negative';

  if (/\brubrics?\b|criterion|criteria|scor|feedback|teacher/i.test(text)) {
    buckets.rubricEmphasis.push(
      isNegative ? 'avoid vague rubric feedback patterns' : 'criterion-specific evidence feedback',
    );
    buckets.feedbackStyle.push(isNegative ? 'avoid generic praise-only feedback' : 'criterion-specific');
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid rubric language that cannot point to observable evidence.'
        : 'Make rubric feedback point to the exact criterion and evidence move.',
    );
  }

  if (/\bslide|speaker|notes|bullet|deck|visual\b/i.test(text)) {
    buckets.slideStyle.push(isNegative ? 'avoid repetitive slide boilerplate' : 'concise course-specific notes');
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid repeated slide-note scaffolds that sound templated.'
        : 'Keep slide bullets compact and speaker notes tied to the lesson artifact.',
    );
  }

  if (/\bquiz|exam|question|difficulty|blooms?|answer|rationale\b/i.test(text)) {
    buckets.quizDifficulty.push(
      isNegative ? 'avoid low-context recall-only item sets' : 'applied analysis with clear rationales',
    );
    buckets.assessmentRigor.push(
      isNegative ? 'avoid assessment items without rationale or evidence use' : 'evidence-based applied checks',
    );
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid quiz items that can be answered by vocabulary recall alone.'
        : 'Favor quiz items that test evidence use, application, and decision logic.',
    );
  }

  if (/\blessonplans?\b|outline|duration|timing|pacing|warm[-\s]?up|activity/i.test(text)) {
    buckets.lessonPacing.push(isNegative ? 'avoid lecture-heavy pacing' : 'practice-heavy pacing');
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid long instructor-talk blocks without a student artifact checkpoint.'
        : 'Give lesson plans visible practice windows, calibration cues, and feedback checkpoints.',
    );
  }

  if (/\bassignment|brief|instructions?|deliverable|milestone|submission\b/i.test(text)) {
    buckets.assignmentStyle.push(
      isNegative ? 'avoid underspecified assignment handoffs' : 'scaffolded applied performance',
    );
    buckets.assessmentRigor.push(
      isNegative ? 'avoid unscaffolded final-only assessment' : 'scaffolded evidence-to-artifact assessment',
    );
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid assignment prompts that leave success criteria implicit.'
        : 'Make assignments show the artifact, evidence source, success criteria, and feedback loop.',
    );
  }

  if (/\bdiscussion|prompt|reply|peer|facilitation\b/i.test(text)) {
    buckets.discussionStyle.push(isNegative ? 'avoid unsupported opinion exchange' : 'evidence-based peer response');
    buckets.styleDirectives.push(
      isNegative
        ? 'Avoid discussions that ask for opinion without evidence or peer-response criteria.'
        : 'Keep discussions anchored in evidence, peer response, and one revision or limitation move.',
    );
  }

  if (/\bcoursemap\b|title|topic|lesson title|edittitle/i.test(text)) {
    buckets.namingPolicy.push(
      isNegative ? 'review generated lesson labels before reuse' : 'preserve instructor-edited lesson labels',
    );
    buckets.styleDirectives.push(
      isNegative
        ? 'Treat generated titles as reviewable labels, not authoritative course language.'
        : 'Use instructor-edited titles as authoritative language across compiled materials.',
    );
  }
}

function confidenceFor(signalCount, reinforcedSignalCount) {
  if (signalCount <= 0) return 'none';
  if (signalCount >= 8 || reinforcedSignalCount >= 3) return 'high';
  if (signalCount >= 3 || reinforcedSignalCount >= 1) return 'medium';
  return 'low';
}

export function normalizeInstructorPreferenceProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const signalCount = Number(profile.signalCount || 0);
  if (!signalCount) return null;

  const normalized = {
    source: cleanText(profile.source, 'instructor-edit-patterns'),
    confidence: cleanText(profile.confidence, confidenceFor(signalCount, profile.reinforcedSignalCount || 0)),
    signalCount,
    reinforcedSignalCount: Number(profile.reinforcedSignalCount || 0),
    featureSignals: Object.fromEntries(
      Object.entries(profile.featureSignals || {}).map(([featureId, signal]) => [
        featureId,
        {
          ...signal,
          fields: unique(asArray(signal.fields), 8),
          actions: unique(asArray(signal.actions), 8),
        },
      ]),
    ),
    styleDirectives: unique(asArray(profile.styleDirectives), 8),
    rubricEmphasis: unique(asArray(profile.rubricEmphasis), 5),
    feedbackStyle: cleanText(profile.feedbackStyle),
    quizDifficulty: cleanText(profile.quizDifficulty),
    lessonPacing: cleanText(profile.lessonPacing),
    slideStyle: cleanText(profile.slideStyle),
    assignmentStyle: cleanText(profile.assignmentStyle),
    discussionStyle: cleanText(profile.discussionStyle),
    namingPolicy: cleanText(profile.namingPolicy),
    assessmentRigor: cleanText(profile.assessmentRigor),
    avoidanceNotes: unique(asArray(profile.avoidanceNotes), 6),
    reviewNotes: unique(asArray(profile.reviewNotes), 6),
  };

  return normalized;
}

export function buildInstructorPreferenceProfile(editPatterns = [], options = {}) {
  const normalizedPatterns = asArray(editPatterns).map(normalizePattern).filter(Boolean);
  const minSignalCount = Number(options.minSignalCount ?? 1);
  if (normalizedPatterns.length < minSignalCount) return null;

  const featureSignals = {};
  const buckets = {
    styleDirectives: [],
    rubricEmphasis: [],
    feedbackStyle: [],
    quizDifficulty: [],
    lessonPacing: [],
    slideStyle: [],
    assignmentStyle: [],
    discussionStyle: [],
    namingPolicy: [],
    assessmentRigor: [],
    avoidanceNotes: [],
    reviewNotes: [],
  };

  for (const pattern of normalizedPatterns) {
    addFeatureSignal(featureSignals, pattern);
    applyPreferenceRules(pattern, buckets);
    if (pattern.direction === 'negative') {
      const label = FEATURE_LABELS[pattern.featureId] || pattern.featureId;
      buckets.avoidanceNotes.push(`Review ${label} before repeating a rejected ${pattern.field || 'content'} pattern.`);
    }
  }

  const reinforcedSignalCount = Object.values(featureSignals).filter((signal) => signal.weight >= 5).length;
  const topFeatureSignals = Object.fromEntries(
    Object.entries(featureSignals)
      .sort(([, a], [, b]) => b.weight - a.weight)
      .slice(0, 8),
  );
  const strongestFeature = Object.values(topFeatureSignals).sort((a, b) => b.weight - a.weight)[0];
  const confidence = confidenceFor(normalizedPatterns.length, reinforcedSignalCount);

  const profile = {
    source: options.source || 'instructor-edit-patterns',
    confidence,
    signalCount: normalizedPatterns.length,
    reinforcedSignalCount,
    featureSignals: topFeatureSignals,
    styleDirectives: unique(buckets.styleDirectives, 8),
    rubricEmphasis: unique(buckets.rubricEmphasis, 5),
    feedbackStyle: unique(buckets.feedbackStyle, 1)[0] || '',
    quizDifficulty: unique(buckets.quizDifficulty, 1)[0] || '',
    lessonPacing: unique(buckets.lessonPacing, 1)[0] || '',
    slideStyle: unique(buckets.slideStyle, 1)[0] || '',
    assignmentStyle: unique(buckets.assignmentStyle, 1)[0] || '',
    discussionStyle: unique(buckets.discussionStyle, 1)[0] || '',
    namingPolicy: unique(buckets.namingPolicy, 1)[0] || '',
    assessmentRigor: unique(buckets.assessmentRigor, 1)[0] || '',
    avoidanceNotes: unique(buckets.avoidanceNotes, 6),
    reviewNotes: unique(
      [
        strongestFeature
          ? `Strongest learned signal: ${strongestFeature.label} (${strongestFeature.count} pattern${strongestFeature.count === 1 ? '' : 's'}).`
          : '',
        confidence === 'low'
          ? 'Apply lightly until more instructor edit history is available.'
          : 'Apply consistently across compiler outputs while preserving source-grounded course facts.',
      ],
      6,
    ),
  };

  return normalizeInstructorPreferenceProfile(profile);
}

export function buildInstructorPreferenceProfileFromMemories(memories = [], options = {}) {
  const patterns = asArray(memories).filter((memory) => memory?.category === 'feedback' || memory?.meta?.featureId);
  return buildInstructorPreferenceProfile(patterns, options);
}

export function summarizeInstructorPreferenceProfile(profile) {
  const normalized = normalizeInstructorPreferenceProfile(profile);
  if (!normalized) return '';
  return unique(
    [
      normalized.namingPolicy,
      normalized.feedbackStyle ? `${normalized.feedbackStyle} feedback` : '',
      normalized.quizDifficulty ? `${normalized.quizDifficulty} quiz items` : '',
      normalized.lessonPacing,
      normalized.slideStyle ? `${normalized.slideStyle} slides` : '',
      normalized.assignmentStyle,
      normalized.discussionStyle,
      normalized.assessmentRigor,
    ],
    5,
  ).join('; ');
}

export function describeInstructorPreferenceForFeature(profile, featureId) {
  const normalized = normalizeInstructorPreferenceProfile(profile);
  if (!normalized) return '';
  switch (featureId) {
    case 'syllabus':
      return summarizeInstructorPreferenceProfile(normalized);
    case 'lessonPlans':
      return unique([normalized.lessonPacing, normalized.feedbackStyle, normalized.namingPolicy], 3).join('; ');
    case 'slideDecks':
      return unique([normalized.slideStyle, normalized.namingPolicy], 3).join('; ');
    case 'rubrics':
      return unique([normalized.feedbackStyle, ...normalized.rubricEmphasis], 3).join('; ');
    case 'assignments':
      return unique([normalized.assignmentStyle, normalized.assessmentRigor, normalized.feedbackStyle], 3).join('; ');
    case 'discussions':
      return unique([normalized.discussionStyle, normalized.feedbackStyle], 3).join('; ');
    case 'quizBank':
      return unique([normalized.quizDifficulty, normalized.assessmentRigor, normalized.feedbackStyle], 3).join('; ');
    default:
      return summarizeInstructorPreferenceProfile(normalized);
  }
}
