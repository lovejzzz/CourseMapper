/**
 * Apply an array of JSON patches to a course map.
 * Each patch: { lessonIndex, sectionIndex?, field, value, action? }
 */
export default function applyPatches(baseMap, patches) {
  const updated = structuredClone(baseMap);

  // Sort: process removeLesson in descending index order first so that
  // earlier splices don't shift the indices of later patches.
  const sorted = [...patches].sort((a, b) => {
    if (a.action === 'removeLesson' && b.action === 'removeLesson')
      return (b.lessonIndex ?? 0) - (a.lessonIndex ?? 0);
    if (a.action === 'removeLesson') return -1;
    if (b.action === 'removeLesson') return 1;
    return 0;
  });

  for (const patch of sorted) {
    const { lessonIndex, sectionIndex, field, value, action } = patch;

    // Lesson-level patch (e.g. title)
    if (field === 'title' && updated.lessons[lessonIndex]) {
      updated.lessons[lessonIndex].title = value;
      continue;
    }

    // Add a new lesson
    if (action === 'addLesson' && patch.lesson) {
      const idx = lessonIndex != null ? lessonIndex : updated.lessons.length;
      updated.lessons.splice(idx, 0, patch.lesson);
      continue;
    }

    // Remove a lesson
    if (action === 'removeLesson' && lessonIndex != null) {
      updated.lessons.splice(lessonIndex, 1);
      continue;
    }

    // Section-level field patch
    if (
      lessonIndex != null && sectionIndex != null && field &&
      updated.lessons[lessonIndex]?.sections?.[sectionIndex]
    ) {
      updated.lessons[lessonIndex].sections[sectionIndex][field] = value;
      continue;
    }

    // Add a new section to a lesson
    if (action === 'addSection' && lessonIndex != null && patch.section && updated.lessons[lessonIndex]) {
      if (!updated.lessons[lessonIndex].sections) updated.lessons[lessonIndex].sections = [];
      const idx = sectionIndex != null ? sectionIndex : updated.lessons[lessonIndex].sections.length;
      updated.lessons[lessonIndex].sections.splice(idx, 0, patch.section);
      continue;
    }

    // Course-level fields
    if (field === 'courseName') { updated.courseName = value; continue; }
    if (field === 'semester') { updated.semester = value; continue; }
  }
  return updated;
}
