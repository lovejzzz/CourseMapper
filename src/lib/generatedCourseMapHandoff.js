function text(value) {
  return String(value || '').trim();
}

function authoredFieldCount(courseMap) {
  return (courseMap?.lessons || []).reduce(
    (count, lesson) =>
      count +
      (lesson?.sections || []).reduce(
        (sectionCount, section) =>
          sectionCount +
          ['learningGoals', 'learningObjectives', 'asyncActivities', 'syncActivities'].filter((key) => {
            const value = section?.[key];
            return Array.isArray(value) ? value.some((item) => text(item)) : Boolean(text(value));
          }).length,
        0,
      ),
    0,
  );
}

/**
 * Select the map automatic finalization should inspect after generation.
 *
 * Native generation starts from a deliberately thin Pass-A map. The
 * deliverables stage later publishes the graph-rendered, source-grounded map
 * synchronously through onCourseMapRepair. React state may not have rendered
 * that update before automatic finalization begins, so the explicit Pass-A
 * argument must not win over a newer authored map for the same course.
 */
export function selectGeneratedCourseMapForFinalizer(generatedCourseMap, latestRenderedCourseMap) {
  if (!generatedCourseMap?.lessons?.length) return latestRenderedCourseMap || generatedCourseMap;
  if (!latestRenderedCourseMap?.lessons?.length) return generatedCourseMap;
  if (text(latestRenderedCourseMap.courseName) !== text(generatedCourseMap.courseName)) return generatedCourseMap;
  if (latestRenderedCourseMap.lessons.length !== generatedCourseMap.lessons.length) return generatedCourseMap;

  return authoredFieldCount(latestRenderedCourseMap) >= authoredFieldCount(generatedCourseMap)
    ? latestRenderedCourseMap
    : generatedCourseMap;
}
