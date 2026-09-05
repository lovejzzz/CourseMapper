export const BLUEPRINT_REALIZATION_TRACE = Symbol.for('coursemapper.blueprintRealizationTrace');

let activeTrace = null;
let activeSlotCache = null;
let activeCourseKey = '';

function cleanRealizationText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRealizationRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function realizationTraceStrings(value, output = [], seen = new WeakSet()) {
  if (output.length >= 256 || value == null) return output;
  if (typeof value === 'string') {
    const text = cleanRealizationText(value);
    if (text.length >= 3 && text.length <= 600) output.push(text);
    return output;
  }
  if (typeof value !== 'object' || seen.has(value)) return output;
  seen.add(value);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    realizationTraceStrings(entry, output, seen);
    if (output.length >= 256) break;
  }
  return output;
}

function stableRealizationHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function lessonVariantPoolHash(poolDefinition) {
  return `fnv1a32:${stableRealizationHash(JSON.stringify(poolDefinition))}`;
}

export function stableRealizationIndex(value, size) {
  if (size <= 1) return 0;
  return Number.parseInt(stableRealizationHash(value), 36) % size;
}

function normalizeRealizationFrame(value, slots) {
  let normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-');
  for (const slot of slots) {
    normalized = normalized.replace(new RegExp(escapeRealizationRegex(slot), 'gi'), ' § ');
  }
  return normalized
    .replace(/\d+(?:[.,:/-]\d+)*/g, ' # ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function realizationSlotsForLesson(lesson) {
  let lessonSlots = activeSlotCache?.get(lesson);
  if (!lessonSlots) {
    lessonSlots = [...new Set(realizationTraceStrings(lesson))].sort(
      (left, right) => right.length - left.length || left.localeCompare(right),
    );
    activeSlotCache?.set(lesson, lessonSlots);
  }
  return lessonSlots;
}

function consumedRealizationSlots(lesson, selected) {
  return realizationSlotsForLesson(lesson)
    .filter((value) => value.length >= 3 && selected.toLowerCase().includes(value.toLowerCase()))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .slice(0, 16);
}

export function recordLessonVariantTrace(event) {
  const { lesson, variants, selected, index, ownerId } = event;
  const poolSize = event.poolSize ?? variants.length;
  const poolHash = event.poolHash || lessonVariantPoolHash(variants);
  if (!activeTrace || typeof selected !== 'string') return;
  const lessonSlots = realizationSlotsForLesson(lesson);
  const slots = consumedRealizationSlots(lesson, selected);
  const frame = variants.map((variant) => normalizeRealizationFrame(variant, lessonSlots)).join('\u241e');
  activeTrace.push({
    ownerId: ownerId || null,
    poolId: ownerId || `pool-${stableRealizationHash(frame)}`,
    lessonNumber: Number(lesson?.lessonNumber || 1),
    poolSize,
    poolHash,
    index,
    selectedText: selected,
    consumedSlots: slots,
  });
}

function realizationWordCount(value) {
  return String(value || '').match(/\p{Script=Han}|[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function normalizedRealizationPath(path = []) {
  return path.map((part) => (typeof part === 'number' ? '#' : String(part))).join('.');
}

export function recordCompiledFeatureRealizationTrace(featureId, compiled, blueprint = {}) {
  if (!activeTrace || !compiled || typeof compiled !== 'object') return;
  const lessonsByNumber = new Map(
    (Array.isArray(blueprint.lessons) ? blueprint.lessons : []).map((lesson, index) => [
      Number(lesson?.lessonNumber || index + 1),
      lesson,
    ]),
  );
  const fallbackLessons = new Map();

  function lessonForNumber(lessonNumber) {
    const normalizedNumber = Number(lessonNumber || 1);
    if (lessonsByNumber.has(normalizedNumber)) return lessonsByNumber.get(normalizedNumber);
    if (!fallbackLessons.has(normalizedNumber)) {
      fallbackLessons.set(normalizedNumber, { ...blueprint, lessonNumber: normalizedNumber });
    }
    return fallbackLessons.get(normalizedNumber);
  }

  function walk(value, path = [], lessonNumber = null, seen = new WeakSet()) {
    if (typeof value === 'string') {
      if (realizationWordCount(value) < 8) return;
      const lesson = lessonForNumber(lessonNumber);
      const ownerId = `compiled:${featureId}:${normalizedRealizationPath(path)}`;
      activeTrace.push({
        ownerId,
        poolId: ownerId,
        lessonNumber: Number(lesson?.lessonNumber || 1),
        poolSize: 1,
        poolHash: lessonVariantPoolHash([value]),
        index: 0,
        selectedText: value,
        consumedSlots: consumedRealizationSlots(lesson, value),
      });
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const nextLessonNumber = Number(value.lessonNumber || value.weekNumber || 0) || lessonNumber;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, [...path, index], nextLessonNumber, seen));
      return;
    }
    Object.entries(value).forEach(([key, entry]) => walk(entry, [...path, key], nextLessonNumber, seen));
  }

  walk(compiled);
}

export function selectLessonVariant(lesson = {}, variants = [], ownerId = '') {
  if (!variants.length) return '';
  const index = (Math.max(1, Number(lesson.lessonNumber || 1)) - 1) % variants.length;
  const selected = variants[index];
  recordLessonVariantTrace({ lesson, variants, selected, index, ownerId });
  return selected;
}

function contextualVariantIndex(lesson = {}, ownerId = '', channel = '', size = 1) {
  if (size <= 1) return 0;
  const key = [
    activeCourseKey,
    ownerId,
    channel,
    lesson.lessonNumber,
    lesson.title,
    lesson.studentArtifact,
    lesson.artifactGenre?.id || lesson.artifactGenre?.outputFormat,
    lesson.modalityCue,
  ]
    .map(cleanRealizationText)
    .join('|');
  return stableRealizationIndex(key, size);
}

export function selectContextualLessonVariant(lesson = {}, variants = [], ownerId = '') {
  if (!variants.length) return '';
  const index = contextualVariantIndex(lesson, ownerId, 'whole-sentence', variants.length);
  const selected = variants[index];
  recordLessonVariantTrace({ lesson, variants, selected, index, ownerId });
  return selected;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(Number(left) || 0);
  let b = Math.abs(Number(right) || 0);
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function compositionStep(leadCount, tailCount) {
  const combinationCount = leadCount * tailCount;
  let step = tailCount + 1;
  while (step < combinationCount && greatestCommonDivisor(step, combinationCount) !== 1) {
    step += 1;
  }
  return step < combinationCount ? step : 1;
}

export function selectComposedLessonVariant(lesson = {}, ownerId, leads = [], tails = [], separator = '; ') {
  if (!leads.length || !tails.length) {
    return selectLessonVariant(lesson, [...leads, ...tails], ownerId);
  }
  const combinationCount = leads.length * tails.length;
  const courseKey =
    cleanRealizationText(activeCourseKey) ||
    cleanRealizationText(lesson.learnerContextProfile?.domain) ||
    cleanRealizationText(lesson.courseModalityProfile?.environment) ||
    'course-without-shared-key';
  const courseOffset = stableRealizationIndex(`${courseKey}|${ownerId}|composition`, combinationCount);
  const ordinal = Math.max(0, Number(lesson.lessonNumber || 1) - 1);
  const compositionIndex = (courseOffset + ordinal * compositionStep(leads.length, tails.length)) % combinationCount;
  const leadIndex = Math.floor(compositionIndex / tails.length);
  const tailIndex = compositionIndex % tails.length;
  const lead = cleanRealizationText(leads[leadIndex]).replace(/[.!?]+$/g, '');
  const selected = `${lead}${separator}${cleanRealizationText(tails[tailIndex])}`;
  recordLessonVariantTrace({
    lesson,
    variants: [...leads, ...tails],
    selected,
    index: leadIndex * tails.length + tailIndex,
    ownerId,
    poolSize: leads.length * tails.length,
    poolHash: lessonVariantPoolHash({ kind: 'composed', leads, separator, tails }),
  });
  return selected;
}

export function beginBlueprintRealizationTrace(enabled, courseKey = '') {
  const state = {
    previousTrace: activeTrace,
    previousSlotCache: activeSlotCache,
    previousCourseKey: activeCourseKey,
    trace: enabled ? [] : null,
  };
  activeCourseKey = cleanRealizationText(courseKey);
  if (state.trace) {
    activeTrace = state.trace;
    activeSlotCache = new WeakMap();
  }
  return state;
}

export function restoreBlueprintRealizationTrace(state) {
  activeTrace = state.previousTrace;
  activeSlotCache = state.previousSlotCache;
  activeCourseKey = state.previousCourseKey;
}
