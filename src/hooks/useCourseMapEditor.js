import { useCallback } from 'react';

/**
 * Encapsulates all course map editing operations:
 * cell edits, title edits, checkbox toggles, section CRUD, lesson CRUD.
 */
export default function useCourseMapEditor({ courseMap, setCourseMap, columns, setDownloadedFile, setUserEdits, pushVersion }) {

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
  }, [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion]);

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
  }, [courseMap, setCourseMap, setDownloadedFile, setUserEdits, pushVersion]);

  const handleCheckToggle = useCallback((lessonIdx, sectionIdx) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    const current = updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign;
    updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign = !(current === true || current === 'true');
    setCourseMap(updated);
    setDownloadedFile('');
  }, [courseMap, setCourseMap, setDownloadedFile]);

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
  }, [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion]);

  const handleDeleteSection = useCallback((lessonIdx, sectionIdx) => {
    if (!courseMap) return;
    const updated = structuredClone(courseMap);
    if (updated.lessons[lessonIdx].sections.length <= 1) return;
    updated.lessons[lessonIdx].sections.splice(sectionIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Deleted section in Lesson ${lessonIdx + 1}`);
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion]);

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
  }, [courseMap, setCourseMap, columns, setDownloadedFile, pushVersion]);

  const handleDeleteLesson = useCallback((lessonIdx) => {
    if (!courseMap || courseMap.lessons.length <= 1) return;
    const updated = structuredClone(courseMap);
    const title = updated.lessons[lessonIdx].title;
    updated.lessons.splice(lessonIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    pushVersion(updated, `Deleted ${title}`);
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion]);

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
  }, [courseMap, setCourseMap, setDownloadedFile, pushVersion]);

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
