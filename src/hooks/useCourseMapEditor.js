import { useCallback } from 'react';

/**
 * Encapsulates all course map editing operations:
 * cell edits, title edits, checkbox toggles, section CRUD, lesson CRUD.
 *
 * @param {function} onEdit - Optional callback(lessonIdx: number|null, key: string)
 *   Called after every edit so the cascade sync engine can accumulate changes.
 *   lessonIdx=null for structural changes (add/delete/move lesson, add/delete section).
 */
export default function useCourseMapEditor({ courseMap, setCourseMap, columns, setDownloadedFile, setUserEdits, pushVersion, onEdit }) {

  const handleCellEdit = useCallback((lessonIdx, sectionIdx, key, newValue) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const oldValue = updated.lessons[lessonIdx]?.sections?.[sectionIdx]?.[key] || '';
    if (oldValue === newValue) return;
    updated.lessons[lessonIdx].sections[sectionIdx][key] = newValue;
    setCourseMap(updated);
    setDownloadedFile('');
    setUserEdits(prev => [...prev, {
      lessonIdx, sectionIdx, key, oldValue, newValue,
      lessonTitle: updated.lessons[lessonIdx].title,
    }]);
    pushVersion(updated, `Edited ${key} in Lesson ${lessonIdx + 1}`);
    onEdit?.(lessonIdx, key);
  }, [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion, onEdit]);

  const handleTitleEdit = useCallback((lessonIdx, newTitle) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const oldTitle = updated.lessons[lessonIdx].title;
    if (oldTitle === newTitle) return;
    updated.lessons[lessonIdx].title = newTitle;
    setCourseMap(updated);
    setDownloadedFile('');
    setUserEdits(prev => [...prev, {
      lessonIdx, sectionIdx: -1, key: 'title',
      oldValue: oldTitle, newValue: newTitle, lessonTitle: newTitle,
    }]);
    pushVersion(updated, `Renamed Lesson ${lessonIdx + 1}`);
    onEdit?.(lessonIdx, 'title');
  }, [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion, onEdit]);

  const handleCheckToggle = useCallback((lessonIdx, sectionIdx) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const current = updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign;
    updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign = !(current === true || current === 'true');
    setCourseMap(updated);
    setDownloadedFile('');
    onEdit?.(lessonIdx, 'evaluateDesign');
  }, [courseMap, setCourseMap, setDownloadedFile, onEdit]);

  const handleAddSection = useCallback((lessonIdx, insertAt) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const emptySection = {};
    const colKeys = columns.map(c => c.key);
    for (const key of colKeys) emptySection[key] = '';
    updated.lessons[lessonIdx].sections.splice(insertAt, 0, emptySection);
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Added section in Lesson ${lessonIdx + 1}`);
    onEdit?.(lessonIdx, 'sections');
  }, [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion, onEdit]);

  const handleDeleteSection = useCallback((lessonIdx, sectionIdx) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    if (updated.lessons[lessonIdx].sections.length <= 1) return;
    updated.lessons[lessonIdx].sections.splice(sectionIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Deleted section in Lesson ${lessonIdx + 1}`);
    onEdit?.(lessonIdx, 'sections');
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit]);

  const handleAddLesson = useCallback(() => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const emptySection = {};
    const colKeys = columns.map(c => c.key);
    for (const key of colKeys) emptySection[key] = '';
    updated.lessons.push({
      title: `Lesson ${updated.lessons.length + 1}: New Lesson`,
      sections: [emptySection],
    });
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Added Lesson ${updated.lessons.length}`);
    onEdit?.(null, '_structural');
  }, [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion, onEdit]);

  const handleDeleteLesson = useCallback((lessonIdx) => {
    if (!courseMap || courseMap.lessons.length <= 1) return;
    const updated = structuredClone(courseMap);
    const title = updated.lessons[lessonIdx].title;
    updated.lessons.splice(lessonIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Deleted ${title}`);
    onEdit?.(null, '_structural');
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit]);

  const handleMoveLesson = useCallback((lessonIdx, direction) => {
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
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion, onEdit]);

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
