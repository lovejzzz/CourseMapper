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

export function recordLessonVariantTrace({ lesson, variants, selected, index, ownerId, poolSize = variants.length }) {
  if (!activeTrace || typeof selected !== 'string') return;
  let lessonSlots = activeSlotCache?.get(lesson);
  if (!lessonSlots) {
    lessonSlots = [...new Set(realizationTraceStrings(lesson))].sort(
      (left, right) => right.length - left.length || left.localeCompare(right),
    );
    activeSlotCache?.set(lesson, lessonSlots);
  }
  const slots = lessonSlots
    .filter((value) => value.length >= 3 && selected.toLowerCase().includes(value.toLowerCase()))
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .slice(0, 16);
  const frame = variants.map((variant) => normalizeRealizationFrame(variant, lessonSlots)).join('\u241e');
  activeTrace.push({
    ownerId: ownerId || null,
    poolId: ownerId || `pool-${stableRealizationHash(frame)}`,
    lessonNumber: Number(lesson?.lessonNumber || 1),
    poolSize,
    index,
    selectedText: selected,
    consumedSlots: slots,
  });
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

export function selectComposedLessonVariant(lesson = {}, ownerId, leads = [], tails = []) {
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
  const selected = `${lead}; ${cleanRealizationText(tails[tailIndex])}`;
  recordLessonVariantTrace({
    lesson,
    variants: [...leads, ...tails],
    selected,
    index: leadIndex * tails.length + tailIndex,
    ownerId,
    poolSize: leads.length * tails.length,
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
