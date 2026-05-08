/**
 * validateCourseMap.js
 *
 * Post-generation structural validator for course maps.
 * Ensures every lesson has a title, a sections array, and all required column keys.
 * Auto-fixes trivial issues (missing titles, missing keys) and returns warnings.
 *
 * @param {object} courseMap - The parsed course map object
 * @param {Array}  columns  - Array of column objects with .key property
 * @returns {{ valid: boolean, warnings: string[] }}
 */

function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function inferPresentationFormat(section = {}) {
  const text = [
    section.presentationFormat,
    section.syncActivities,
    section.asyncActivities,
    section.topicSection,
    section.supportingResources,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(simulation|lab|workshop|studio|practice)\b/.test(text)) return 'Simulation workshop';
  if (/\b(case|debate|discussion|seminar|socratic)\b/.test(text)) return 'Case discussion';
  if (/\b(video|lecture|recorded|watch)\b/.test(text)) return 'Video lecture + guided notes';
  if (/\b(presentation|present|critique|peer review)\b/.test(text)) return 'Presentation + peer critique';
  if (/\b(read|article|chapter|text)\b/.test(text)) return 'Reading + guided discussion';
  return 'Interactive seminar';
}

export function validateCourseMap(courseMap, columns) {
  const warnings = [];
  const colKeys = columns && columns.length > 0 ? columns.map((c) => c.key) : [];

  if (!courseMap || !courseMap.lessons || !Array.isArray(courseMap.lessons) || courseMap.lessons.length === 0) {
    return { valid: false, warnings: ['No lessons found in generated course map'] };
  }

  // Ensure course-level fields
  if (!courseMap.courseName) {
    courseMap.courseName = 'Untitled Course';
    warnings.push('Missing courseName (set to "Untitled Course")');
  }
  if (!courseMap.semester) {
    courseMap.semester = 'TBD';
    warnings.push('Missing semester (set to "TBD")');
  }

  for (let i = 0; i < courseMap.lessons.length; i++) {
    const lesson = courseMap.lessons[i];

    // Ensure lesson is an object
    if (!lesson || typeof lesson !== 'object') {
      courseMap.lessons[i] = {
        title: `Lesson ${i + 1}: Untitled`,
        sections: [Object.fromEntries(colKeys.map((k) => [k, '']))],
      };
      warnings.push(`Lesson ${i + 1}: was not an object (replaced with empty lesson)`);
      continue;
    }

    // Ensure title
    if (!lesson.title || typeof lesson.title !== 'string' || lesson.title.trim() === '') {
      lesson.title = `Lesson ${i + 1}: Untitled`;
      warnings.push(`Lesson ${i + 1}: missing title (auto-filled)`);
    }

    // Ensure sections array
    if (!Array.isArray(lesson.sections) || lesson.sections.length === 0) {
      // Check if lesson has flat keys (AI sometimes outputs flat instead of nested)
      const hasFlat = colKeys.some((k) => k in lesson);
      if (hasFlat) {
        // Convert flat lesson to sections format
        const section = {};
        for (const key of colKeys) {
          section[key] = lesson[key] || '';
          delete lesson[key]; // Clean up flat keys
        }
        lesson.sections = [section];
        warnings.push(`Lesson ${i + 1}: converted flat keys to sections format`);
      } else {
        lesson.sections = [Object.fromEntries(colKeys.map((k) => [k, '']))];
        warnings.push(`Lesson ${i + 1}: missing sections (added empty section)`);
      }
    }

    // Ensure all column keys in each section
    for (let j = 0; j < lesson.sections.length; j++) {
      const section = lesson.sections[j];
      if (!section || typeof section !== 'object') {
        lesson.sections[j] = Object.fromEntries(colKeys.map((k) => [k, '']));
        warnings.push(`Lesson ${i + 1}, Section ${j + 1}: was not an object (replaced with empty section)`);
        continue;
      }
      for (const key of colKeys) {
        if (!(key in section)) {
          section[key] = key === 'presentationFormat' ? inferPresentationFormat(section) : '';
          warnings.push(
            `Lesson ${i + 1}, Section ${j + 1}: missing '${key}' (${key === 'presentationFormat' ? 'auto-filled' : 'set to empty'})`,
          );
        } else if (key === 'presentationFormat' && isBlank(section[key])) {
          section[key] = inferPresentationFormat(section);
          warnings.push(`Lesson ${i + 1}, Section ${j + 1}: blank presentationFormat (auto-filled)`);
        }
      }
    }
  }

  return { valid: true, warnings };
}
