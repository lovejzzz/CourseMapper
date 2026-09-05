const COURSE_TITLE_METADATA_PATTERN =
  /\b(\d+\s*[- ]?\s*(week|weeks|lesson|lessons|module|modules)|undergraduate|graduate|introductory|advanced|course|class|seminar|workshop|online|hybrid|asynchronous|synchronous)\b/i;

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function patchCurrentValue(patch, courseMap) {
  if (!patch || !courseMap) return undefined;
  if (patch.field === 'courseName') return courseMap.courseName;
  if (patch.field === 'semester') return courseMap.semester;
  if (patch.field === 'title') return courseMap.lessons?.[patch.lessonIndex]?.title;
  if (patch.sectionIndex != null && patch.field) {
    return courseMap.lessons?.[patch.lessonIndex]?.sections?.[patch.sectionIndex]?.[patch.field];
  }
  return undefined;
}

export function isMetadataOnlyCourseNamePatch(patch, courseMap) {
  if (patch?.field !== 'courseName') return false;
  const current = normalizeTitle(courseMap?.courseName);
  const next = normalizeTitle(patch.value);
  if (!current || !next || current === next) return false;

  const nextContainsCurrent = next.includes(current);
  const addedMetadata = COURSE_TITLE_METADATA_PATTERN.test(String(patch.value || ''));
  return nextContainsCurrent && addedMetadata;
}

export function filterExaminePatches(patches, courseMap, scopeIndices = null) {
  if (!Array.isArray(patches)) return [];
  const scopeSet = Array.isArray(scopeIndices) && scopeIndices.length > 0 ? new Set(scopeIndices) : null;
  const maxScopeIdx = scopeSet ? Math.max(...scopeIndices) : null;

  return patches.filter((patch) => {
    if (!patch || typeof patch !== 'object') return false;

    if (scopeSet && patch.action === 'addLesson') {
      const targetIdx = patch.lessonIndex ?? (courseMap?.lessons?.length || 0);
      if (targetIdx > maxScopeIdx || !scopeSet.has(targetIdx)) return false;
    }

    if (isMetadataOnlyCourseNamePatch(patch, courseMap)) return false;

    if (patch.field && Object.prototype.hasOwnProperty.call(patch, 'value')) {
      const currentValue = patchCurrentValue(patch, courseMap);
      if (currentValue != null && String(currentValue).trim() === String(patch.value ?? '').trim()) return false;
    }

    return true;
  });
}
