const FIELD_LABELS = {
  title: 'lesson title',
  learningObjectives: 'learning objectives',
  learningGoals: 'learning goals',
  weeklyAssessments: 'weekly assessments',
  topicSection: 'topic/section',
  asyncActivities: 'async activities',
  syncActivities: 'class activities',
  supportingResources: 'supporting resources',
  technologyNeeded: 'technology needed',
  presentationFormat: 'presentation format',
};

export const CANONICAL_PATCH_FIELDS = Object.keys(FIELD_LABELS);

const FIELD_TOKEN_MAP = [
  {
    field: 'learningObjectives',
    tokens: ['learningobjectives', 'objectives', 'objective', 'outcomes', 'outcome', 'lo'],
  },
  {
    field: 'learningGoals',
    tokens: ['learninggoals', 'goals', 'goal', 'competencies', 'competency'],
  },
  {
    field: 'weeklyAssessments',
    tokens: [
      'weeklyassessments',
      'assessment',
      'assessments',
      'quiz',
      'quizzes',
      'questions',
      'question',
      'rubric',
      'rubrics',
      'criteria',
      'criterion',
      'difficulty',
      'evidence',
      'evidencecriteria',
      'focus',
      'assignment',
      'assignmenttitle',
      'assignments',
      'directions',
      'instructions',
      'requirements',
      'submission',
      'task',
      'taskdirections',
      'tasks',
      'quizfocus',
      'quizplan',
      'rubrictitle',
      'bloomscoverage',
      'bloom',
    ],
  },
  {
    field: 'supportingResources',
    tokens: ['supportingresources', 'resources', 'resource', 'materials', 'material', 'readings', 'reading'],
  },
  {
    field: 'technologyNeeded',
    tokens: ['technologyneeded', 'technology', 'tech', 'tools', 'tool', 'software', 'platform'],
  },
  {
    field: 'asyncActivities',
    tokens: ['asyncactivities', 'asynchronous', 'async', 'homework', 'prep', 'prework', 'practice'],
  },
  {
    field: 'syncActivities',
    tokens: [
      'syncactivities',
      'activities',
      'activity',
      'warmup',
      'sessionoutline',
      'procedure',
      'discussion',
      'discussions',
      'exercise',
      'exercises',
    ],
  },
  {
    field: 'presentationFormat',
    tokens: ['presentationformat', 'deliveryformat', 'format'],
  },
  {
    field: 'topicSection',
    tokens: [
      'topicsection',
      'topic',
      'section',
      'summary',
      'concepts',
      'concept',
      'keyconcepts',
      'keyconcept',
      'keyterms',
      'terms',
      'term',
      'bullets',
      'bullet',
      'content',
    ],
  },
];

const LESSON_TITLE_FEATURES = new Set(['lessonPlans', 'studyGuides']);

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, maxLength = 1400) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function getAtPath(obj, path = []) {
  let cur = obj;
  for (const part of path) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function cloneCourseMap(courseMap) {
  if (typeof structuredClone === 'function') return structuredClone(courseMap);
  return JSON.parse(JSON.stringify(courseMap));
}

function normalizeToken(value) {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function pathTokens(path = []) {
  return path
    .filter((part) => typeof part === 'string')
    .map(normalizeToken)
    .filter(Boolean);
}

function summarizeObject(value) {
  if (!value || typeof value !== 'object') return '';
  const preferred = [
    value.title,
    value.lessonTitle,
    value.objective,
    value.prompt,
    value.question,
    value.criterion,
    value.description,
    value.summary,
    value.notes,
    value.text,
  ].find((candidate) => cleanText(candidate));
  if (preferred) return cleanText(preferred);
  const pairs = Object.entries(value)
    .filter(([, item]) => item != null && typeof item !== 'object')
    .slice(0, 6)
    .map(([key, item]) => `${key}: ${cleanText(item)}`)
    .filter(Boolean);
  return pairs.join('; ');
}

function valueToCourseMapText(value) {
  if (Array.isArray(value)) {
    return truncate(
      value
        .map((item, index) => {
          if (typeof item === 'string' || typeof item === 'number') return cleanText(item);
          const summary = summarizeObject(item);
          return summary ? `${index + 1}. ${summary}` : '';
        })
        .filter(Boolean)
        .join('\n'),
    );
  }
  if (value && typeof value === 'object') return truncate(summarizeObject(value) || JSON.stringify(value));
  return truncate(value);
}

function sanitizeEditPath(path = []) {
  return (Array.isArray(path) ? path : [])
    .filter((part) => typeof part === 'string' || typeof part === 'number')
    .map((part) => (typeof part === 'number' ? part : String(part)));
}

export function isKnownPresentationOnlyEdit(featureId, editPath = []) {
  const tokens = pathTokens(editPath);
  const leafToken = tokens[tokens.length - 1] || '';
  return featureId === 'slideDecks' && leafToken === 'title';
}

function normalizeCanonicalField(value) {
  const raw = String(value || '').trim();
  if (FIELD_LABELS[raw]) return raw;
  const token = normalizeToken(raw);
  if (FIELD_LABELS[token]) return token;
  const mapped = FIELD_TOKEN_MAP.find(({ tokens }) => tokens.includes(token));
  return mapped?.field || null;
}

function normalizeLessonTitleValue(value, lessonIndex) {
  const text = valueToCourseMapText(value);
  return cleanText(
    text.replace(new RegExp(`^(?:lesson|week|module|unit|session)\\s*${lessonIndex + 1}\\s*[:.\\-]?\\s*`, 'i'), ''),
  );
}

export function getCanonicalPatchFieldLabel(field) {
  return FIELD_LABELS[field] || field || 'course map field';
}

export function inferCourseMapFieldFromArtifactPath(featureId, editPath = []) {
  const tokens = pathTokens(editPath);
  const leafToken = tokens[tokens.length - 1] || '';
  const nonRootTokens = tokens.slice(1);

  if (leafToken === 'lessontitle' || (leafToken === 'title' && LESSON_TITLE_FEATURES.has(featureId))) return 'title';
  for (const { field, tokens: candidates } of FIELD_TOKEN_MAP) {
    if (nonRootTokens.some((token) => candidates.includes(token))) return field;
  }
  return null;
}

export function projectArtifactEditToCourseMapPatch({
  featureId,
  lessonIndex,
  editPath,
  oldData,
  newData,
  courseMap,
  editContext = null,
}) {
  if (!featureId || !Array.isArray(editPath) || !Number.isInteger(lessonIndex) || lessonIndex < 0) return null;
  const field = inferCourseMapFieldFromArtifactPath(featureId, editPath);
  if (!field) return null;

  const oldArtifactValue = getAtPath(oldData, editPath);
  const newArtifactValue = getAtPath(newData, editPath);
  if (JSON.stringify(oldArtifactValue) === JSON.stringify(newArtifactValue)) return null;

  const sectionIndex = 0;
  const currentLesson = courseMap?.lessons?.[lessonIndex] || {};
  const currentValue =
    field === 'title' ? currentLesson.title : (currentLesson.sections?.[sectionIndex]?.[field] ?? '');
  const value =
    field === 'title'
      ? normalizeLessonTitleValue(newArtifactValue, lessonIndex)
      : valueToCourseMapText(newArtifactValue);
  if (!value || cleanText(value) === cleanText(currentValue)) return null;

  const label = getCanonicalPatchFieldLabel(field);
  return {
    id: `artifact-blueprint:${featureId}:${lessonIndex}:${field}:${cleanText(value).slice(0, 80)}`,
    source: 'artifact',
    sourceFeatureId: featureId,
    lessonIndex,
    sectionIndex,
    field,
    label,
    oldValue: currentValue,
    value,
    editContext: typeof editContext === 'string' ? editContext : null,
    confidence: 'user-approved',
  };
}

export function createCanonicalPatchRequest({
  featureId,
  lessonIndex,
  editPath,
  oldData,
  newData,
  courseMap,
  editContext = null,
}) {
  if (!featureId || !Array.isArray(editPath) || !Number.isInteger(lessonIndex) || lessonIndex < 0) return null;
  if (isKnownPresentationOnlyEdit(featureId, editPath)) return null;

  const oldArtifactValue = getAtPath(oldData, editPath);
  const newArtifactValue = getAtPath(newData, editPath);
  if (JSON.stringify(oldArtifactValue) === JSON.stringify(newArtifactValue)) return null;

  const proposedValue = valueToCourseMapText(newArtifactValue);
  if (!proposedValue) return null;

  const sectionIndex = 0;
  const currentLesson = courseMap?.lessons?.[lessonIndex] || {};
  const currentSection = currentLesson.sections?.[sectionIndex] || {};
  const currentFields = Object.fromEntries(
    CANONICAL_PATCH_FIELDS.map((field) => [
      field,
      field === 'title' ? currentLesson.title || '' : (currentSection[field] ?? ''),
    ]),
  );
  const pathLabel = sanitizeEditPath(editPath).join('.');
  const contextText = getEditRequestContext(editContext, pathLabel, proposedValue);

  return {
    id: `artifact-blueprint-request:${featureId}:${lessonIndex}:${normalizeToken(pathLabel)}:${cleanText(proposedValue).slice(0, 80)}`,
    source: 'artifact',
    sourceFeatureId: featureId,
    lessonIndex,
    sectionIndex,
    editPath: sanitizeEditPath(editPath),
    label: 'course-design edit',
    previousArtifactValue: valueToCourseMapText(oldArtifactValue),
    artifactValue: proposedValue,
    editContext: contextText,
    allowedFields: CANONICAL_PATCH_FIELDS,
    currentLessonTitle: currentLesson.title || `Lesson ${lessonIndex + 1}`,
    currentFields,
    confidence: 'needs-model-mapping',
  };
}

function getEditRequestContext(editContext, pathLabel, proposedValue) {
  const explicit =
    typeof editContext === 'string' ? editContext : editContext?.summary || editContext?.editContext || '';
  return truncate(explicit || `Edited ${pathLabel}: ${proposedValue}`, 500);
}

export function normalizeCanonicalPatchFromModel(rawPatch, request, courseMap) {
  const raw = rawPatch?.patch || rawPatch || {};
  if (!request || raw.sync === false || raw.apply === false) return null;
  const field = normalizeCanonicalField(raw.field || raw.courseMapField || raw.targetField);
  if (!field) return null;

  const lessonIndex = Number.isInteger(raw.lessonIndex) ? raw.lessonIndex : request.lessonIndex;
  if (!Number.isInteger(lessonIndex) || lessonIndex < 0) return null;
  const sectionIndex = Number.isInteger(raw.sectionIndex) ? raw.sectionIndex : (request.sectionIndex ?? 0);
  const rawValue =
    raw.value ?? raw.newValue ?? raw.courseMapValue ?? raw.replacement ?? raw.text ?? request.artifactValue;
  const value = field === 'title' ? normalizeLessonTitleValue(rawValue, lessonIndex) : valueToCourseMapText(rawValue);
  if (!value) return null;

  const lesson = courseMap?.lessons?.[lessonIndex] || {};
  const currentValue = field === 'title' ? lesson.title || '' : (lesson.sections?.[sectionIndex]?.[field] ?? '');
  if (cleanText(currentValue) === cleanText(value)) return null;

  const label = getCanonicalPatchFieldLabel(field);
  return {
    id: `model-blueprint:${request.sourceFeatureId || request.featureId || 'artifact'}:${lessonIndex}:${field}:${cleanText(value).slice(0, 80)}`,
    source: 'artifact-model-fallback',
    sourceFeatureId: request.sourceFeatureId || request.featureId || '',
    lessonIndex,
    sectionIndex,
    field,
    label,
    oldValue: currentValue,
    value,
    editContext: request.editContext || null,
    confidence: 'model-resolved',
  };
}

export function dedupeCanonicalPatches(patches = []) {
  const seen = new Set();
  const result = [];
  for (const patch of Array.isArray(patches) ? patches : []) {
    if (!patch || !Number.isInteger(patch.lessonIndex) || !patch.field) continue;
    const key = `${patch.lessonIndex}:${patch.sectionIndex ?? 0}:${patch.field}:${cleanText(patch.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(patch);
  }
  return result;
}

export function applyCanonicalPatchesToCourseMap(courseMap, patches = []) {
  const safePatches = dedupeCanonicalPatches(patches);
  if (!courseMap || safePatches.length === 0) {
    return { courseMap, changed: false, applied: [], userEdits: [] };
  }

  const next = cloneCourseMap(courseMap);
  const applied = [];
  for (const patch of safePatches) {
    const lesson = next.lessons?.[patch.lessonIndex];
    if (!lesson) continue;

    if (patch.field === 'title') {
      const newTitle = normalizeLessonTitleValue(patch.value, patch.lessonIndex);
      if (!newTitle || cleanText(lesson.title) === cleanText(newTitle)) continue;
      const oldValue = lesson.title || '';
      lesson.title = newTitle;
      applied.push({ ...patch, oldValue, value: newTitle });
      continue;
    }

    const sectionIndex = Number.isInteger(patch.sectionIndex) ? patch.sectionIndex : 0;
    if (!Array.isArray(lesson.sections)) lesson.sections = [{}];
    if (!lesson.sections[sectionIndex]) lesson.sections[sectionIndex] = {};
    const oldValue = lesson.sections[sectionIndex][patch.field] ?? '';
    const newValue = valueToCourseMapText(patch.value);
    if (!newValue || cleanText(oldValue) === cleanText(newValue)) continue;
    lesson.sections[sectionIndex][patch.field] = newValue;
    applied.push({ ...patch, sectionIndex, oldValue, value: newValue });
  }

  return {
    courseMap: applied.length > 0 ? next : courseMap,
    changed: applied.length > 0,
    applied,
    userEdits: applied.map((patch) => ({
      lessonIdx: patch.lessonIndex,
      sectionIdx: patch.field === 'title' ? -1 : (patch.sectionIndex ?? 0),
      key: patch.field,
      oldValue: patch.oldValue ?? '',
      newValue: patch.value,
      lessonTitle: next.lessons?.[patch.lessonIndex]?.title || `Lesson ${patch.lessonIndex + 1}`,
      source: 'artifact-blueprint-sync',
      sourceFeatureId: patch.sourceFeatureId,
    })),
  };
}
