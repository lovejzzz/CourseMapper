import { useCallback } from 'react';
import { getArrayKey } from '../lib/syncDependencies';
import { recordEditPattern } from '../lib/agentMemory';

/**
 * Immutable path-based update: produces O(depth) shallow clones instead of
 * O(n) structuredClone. Used for cell/title/toggle edits (frequent, hot-path).
 * CRUD operations (add/delete/move lesson) still use structuredClone since
 * the structural changes are complex and infrequent.
 */
function setAtPath(obj, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setAtPath(clone[head], rest, value);
  return clone;
}

/**
 * ── Change #4: Optimistic title string-replace ──
 * When a user renames a lesson title, instantly patch all "done" deliverables
 * by replacing exact matches of oldTitle → newTitle at the given lesson index.
 * Only replaces fields named "lessonTitle" or "title" (the two conventions used).
 */
function optimisticTitleReplace(data, featureId, lessonIdx, oldTitle, newTitle) {
  if (!data || typeof data !== 'object') return null;
  const arrKey = getArrayKey(featureId, data);
  if (!arrKey) return null;
  const arr = data[arrKey];
  if (!Array.isArray(arr) || lessonIdx >= arr.length) return null;

  const item = arr[lessonIdx];
  if (!item) return null;

  // Only replace if an exact match exists
  const hasLessonTitle = item.lessonTitle === oldTitle;
  const hasTitle = item.title === oldTitle;
  if (!hasLessonTitle && !hasTitle) return null;

  const patched = { ...item };
  if (hasLessonTitle) patched.lessonTitle = newTitle;
  if (hasTitle) patched.title = newTitle;

  const patchedArr = [...arr];
  patchedArr[lessonIdx] = patched;
  return { ...data, [arrKey]: patchedArr };
}

function isSyntheticEventLike(value) {
  return !!value && typeof value === 'object' && ('nativeEvent' in value || 'currentTarget' in value);
}

function buildEmptySection(columns = []) {
  const emptySection = {};
  for (const key of columns.map((column) => column.key).filter(Boolean)) emptySection[key] = '';
  return emptySection;
}

/**
 * Encapsulates all course map editing operations:
 * cell edits, title edits, checkbox toggles, section CRUD, lesson CRUD.
 *
 * @param {function} onEdit - Optional callback(lessonIdx: number|null, key: string)
 *   Called after every edit so the cascade sync engine can accumulate changes.
 *   lessonIdx=null for structural changes (add/delete/move lesson, add/delete section).
 * @param {object}   deliverables - Current deliverable state (for optimistic title preview)
 * @param {function} optimisticUpdate - Callback(featureId, patchedData) for instant title replacement
 */
export default function useCourseMapEditor({
  courseMap,
  setCourseMap,
  columns,
  setDownloadedFile,
  setUserEdits,
  pushVersion,
  onEdit,
  deliverables,
  optimisticUpdate,
}) {
  const handleCellEdit = useCallback(
    (lessonIdx, sectionIdx, key, newValue) => {
      if (!courseMap) return;
      const oldValue = courseMap.lessons[lessonIdx]?.sections?.[sectionIdx]?.[key] || '';
      if (oldValue === newValue) return;
      const updated = setAtPath(courseMap, ['lessons', lessonIdx, 'sections', sectionIdx, key], newValue);
      setCourseMap(updated);
      setDownloadedFile('');
      setUserEdits((prev) => [
        ...prev,
        {
          lessonIdx,
          sectionIdx,
          key,
          oldValue,
          newValue,
          lessonTitle: updated.lessons[lessonIdx].title,
        },
      ]);
      pushVersion(updated, `Edited ${key} in Lesson ${lessonIdx + 1}`);
      onEdit?.(lessonIdx, key);
      // Track edit pattern for agent learning (fire-and-forget)
      recordEditPattern({ featureId: 'courseMap', field: key, action: 'edited' });
    },
    [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion, onEdit],
  );

  const handleTitleEdit = useCallback(
    (lessonIdx, newTitle) => {
      if (!courseMap) return;
      const oldTitle = courseMap.lessons[lessonIdx].title;
      if (oldTitle === newTitle) return;
      const updated = setAtPath(courseMap, ['lessons', lessonIdx, 'title'], newTitle);
      setCourseMap(updated);
      setDownloadedFile('');
      setUserEdits((prev) => [
        ...prev,
        {
          lessonIdx,
          sectionIdx: -1,
          key: 'title',
          oldValue: oldTitle,
          newValue: newTitle,
          lessonTitle: newTitle,
        },
      ]);
      pushVersion(updated, `Renamed Lesson ${lessonIdx + 1}`);

      // ── Change #4: Optimistic title preview ──
      // Instantly patch all "done" deliverables with the new title so tabs
      // reflect the rename immediately (before AI sync completes).
      if (deliverables && optimisticUpdate) {
        for (const [featureId, entry] of Object.entries(deliverables)) {
          if (entry?.status !== 'done' || !entry.data) continue;
          const patched = optimisticTitleReplace(entry.data, featureId, lessonIdx, oldTitle, newTitle);
          if (patched) optimisticUpdate(featureId, patched);
        }
      }

      onEdit?.(lessonIdx, 'title');
    },
    [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion, onEdit, deliverables, optimisticUpdate],
  );

  const handleCheckToggle = useCallback(
    (lessonIdx, sectionIdx) => {
      if (!courseMap) return;
      const current = courseMap.lessons[lessonIdx].sections[sectionIdx].evaluateDesign;
      const newValue = !(current === true || current === 'true');
      const updated = setAtPath(courseMap, ['lessons', lessonIdx, 'sections', sectionIdx, 'evaluateDesign'], newValue);
      setCourseMap(updated);
      setDownloadedFile('');
      onEdit?.(lessonIdx, 'evaluateDesign');
    },
    [courseMap, setCourseMap, setDownloadedFile, onEdit],
  );

  const handleAddSection = useCallback(
    (lessonIdx, insertAt) => {
      if (!courseMap) return;
      const updated = structuredClone(courseMap);
      const emptySection = {};
      const colKeys = columns.map((c) => c.key);
      for (const key of colKeys) emptySection[key] = '';
      updated.lessons[lessonIdx].sections.splice(insertAt, 0, emptySection);
      setCourseMap(updated);
      setDownloadedFile('');
      pushVersion(updated, `Added section in Lesson ${lessonIdx + 1}`);
      onEdit?.(lessonIdx, 'sections');
    },
    [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion, onEdit],
  );

  const handleDeleteSection = useCallback(
    (lessonIdx, sectionIdx) => {
      if (!courseMap) return;
      const updated = structuredClone(courseMap);
      if (updated.lessons[lessonIdx].sections.length <= 1) return;
      updated.lessons[lessonIdx].sections.splice(sectionIdx, 1);
      setCourseMap(updated);
      setDownloadedFile('');
      pushVersion(updated, `Deleted section in Lesson ${lessonIdx + 1}`);
      onEdit?.(lessonIdx, 'sections');
    },
    [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit],
  );

  const handleAddLesson = useCallback(
    (payload = null) => {
      if (!courseMap) return;
      const updated = structuredClone(courseMap);
      const addPayload = payload && typeof payload === 'object' && !isSyntheticEventLike(payload) ? payload : {};
      const sourceLesson = addPayload.lesson && typeof addPayload.lesson === 'object' ? addPayload.lesson : {};
      const requestedIndex = Number.isInteger(addPayload.lessonIndex) ? addPayload.lessonIndex : updated.lessons.length;
      const insertIndex = Math.max(0, Math.min(requestedIndex, updated.lessons.length));
      const emptySection = buildEmptySection(columns);
      const sourceSections = Array.isArray(addPayload.sections)
        ? addPayload.sections
        : Array.isArray(sourceLesson.sections)
          ? sourceLesson.sections
          : [];
      const sections =
        sourceSections.length > 0
          ? sourceSections.map((section) => ({
              ...emptySection,
              ...(section && typeof section === 'object' ? section : {}),
            }))
          : [emptySection];
      const title = addPayload.title || sourceLesson.title || `Lesson ${insertIndex + 1}: New Lesson`;
      updated.lessons.splice(insertIndex, 0, {
        ...sourceLesson,
        title,
        sections,
      });
      setCourseMap(updated);
      setDownloadedFile('');
      pushVersion(updated, `Added ${title}`);
      onEdit?.(null, '_structural');
      return insertIndex;
    },
    [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion, onEdit],
  );

  const handleDeleteLesson = useCallback(
    (lessonIdx) => {
      if (!courseMap || courseMap.lessons.length <= 1) return;
      const updated = structuredClone(courseMap);
      const title = updated.lessons[lessonIdx].title;
      updated.lessons.splice(lessonIdx, 1);
      setCourseMap(updated);
      setDownloadedFile('');
      pushVersion(updated, `Deleted ${title}`);
      onEdit?.(null, '_structural');
    },
    [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit],
  );

  const handleMoveLesson = useCallback(
    (lessonIdx, direction) => {
      if (!courseMap) return;
      const newIdx = lessonIdx + direction;
      if (newIdx < 0 || newIdx >= courseMap.lessons.length) return;
      const updated = structuredClone(courseMap);
      const [moved] = updated.lessons.splice(lessonIdx, 1);
      updated.lessons.splice(newIdx, 0, moved);
      setCourseMap(updated);
      setDownloadedFile('');
      pushVersion(updated, `Moved ${moved.title} ${direction < 0 ? 'up' : 'down'}`);
      onEdit?.(null, '_structural');
    },
    [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit],
  );

  return {
    handleCellEdit,
    handleTitleEdit,
    handleCheckToggle,
    handleAddSection,
    handleDeleteSection,
    handleAddLesson,
    handleDeleteLesson,
    handleMoveLesson,
  };
}
