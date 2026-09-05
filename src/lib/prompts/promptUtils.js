export // Map from column keys to how they are extracted and labeled in the condensed payload.
const COLUMN_EXTRACTORS = {
  topicSection: { key: 'topics', extract: (sections) => sections.map((s) => s.topicSection || '').filter(Boolean) },
  learningObjectives: {
    key: 'objectives',
    extract: (sections) =>
      sections
        .map((s) => s.learningObjectives || '')
        .filter(Boolean)
        .join(' | '),
  },
  weeklyAssessments: {
    key: 'assessments',
    extract: (sections) =>
      sections
        .map((s) => s.weeklyAssessments || '')
        .filter(Boolean)
        .join('; '),
  },
  supportingResources: {
    key: 'resources',
    extract: (sections) =>
      sections
        .map((s) => s.supportingResources || '')
        .filter(Boolean)
        .join('; '),
  },
  learningGoals: {
    key: 'learningGoals',
    extract: (sections) =>
      sections
        .map((s) => s.learningGoals || '')
        .filter(Boolean)
        .join(' | '),
  },
  asyncActivities: {
    key: 'activities_async',
    extract: (sections) =>
      sections
        .map((s) => s.asyncActivities || '')
        .filter(Boolean)
        .join('; '),
  },
  syncActivities: {
    key: 'activities_sync',
    extract: (sections) =>
      sections
        .map((s) => s.syncActivities || '')
        .filter(Boolean)
        .join('; '),
  },
  technologyNeeded: {
    key: 'technology',
    extract: (sections) =>
      sections
        .map((s) => s.technologyNeeded || '')
        .filter(Boolean)
        .join('; '),
  },
  presentationFormat: {
    key: 'format',
    extract: (sections) =>
      sections
        .map((s) => s.presentationFormat || '')
        .filter(Boolean)
        .join('; '),
  },
  evaluateDesign: {
    key: 'evaluateDesign',
    extract: (sections) =>
      sections
        .map((s) => s.evaluateDesign || '')
        .filter(Boolean)
        .join('; '),
  },
};

export function condenseCourseMap(courseMap, scopeIndices = null, verifiedChanges = null, columns = null) {
  const allLessons = courseMap.lessons || [];

  // Determine which columns are enabled. If columns is provided, only include those that are enabled.
  const enabledKeys =
    columns && columns.length > 0 ? new Set(columns.filter((c) => c.enabled !== false).map((c) => c.key)) : null; // null = include all (backwards compat)

  // Determine which lessons to include and their original indices.
  let indexedLessons;
  if (scopeIndices && scopeIndices.length > 0) {
    const inRange = scopeIndices.filter((i) => i < allLessons.length);
    if (inRange.length > 0) {
      indexedLessons = inRange.map((i) => ({ lesson: allLessons[i], originalIndex: i }));
    } else {
      indexedLessons = allLessons.map((lesson, i) => ({
        lesson,
        originalIndex: scopeIndices[i] !== undefined ? scopeIndices[i] : i,
      }));
    }
  } else {
    indexedLessons = allLessons.map((lesson, i) => ({ lesson, originalIndex: i }));
  }

  const maxOrigIdx = indexedLessons.reduce((mx, il) => Math.max(mx, il.originalIndex), 0);
  const totalForDisplay = Math.max(allLessons.length, maxOrigIdx + 1);

  const acceptedChanges = (verifiedChanges || []).filter(
    (c) => typeof c === 'string' && !c.startsWith('__REJECTED__:'),
  );

  const payload = {
    courseName: courseMap.courseName,
    semester: courseMap.semester,
    totalLessonsInCourse: totalForDisplay,
    lessons: indexedLessons.map(({ lesson: l, originalIndex }) => {
      const sections = l.sections || [];
      const entry = {
        lessonNumber: originalIndex + 1,
        weekNumber: `Week ${originalIndex + 1}`,
        title: l.title,
      };

      // Extract only enabled columns (or all if no filter)
      // Skip empty values (empty strings, empty arrays) to minimize input tokens
      for (const [colKey, ext] of Object.entries(COLUMN_EXTRACTORS)) {
        if (enabledKeys && !enabledKeys.has(colKey)) continue;
        const val = ext.extract(sections);
        const isEmpty = val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) continue;
        // Group async/sync activities under an "activities" object for cleanliness
        if (colKey === 'asyncActivities') {
          if (!entry.activities) entry.activities = {};
          entry.activities.async = val;
        } else if (colKey === 'syncActivities') {
          if (!entry.activities) entry.activities = {};
          entry.activities.sync = val;
        } else {
          entry[ext.key] = val;
        }
      }

      // Also include any custom column keys (user-added columns not in the default set)
      if (enabledKeys) {
        for (const colKey of enabledKeys) {
          if (!COLUMN_EXTRACTORS[colKey]) {
            // Custom column — extract raw values from sections
            const vals = sections
              .map((s) => s[colKey] || '')
              .filter(Boolean)
              .join('; ');
            if (vals) entry[colKey] = vals;
          }
        }
      }

      return entry;
    }),
  };

  if (acceptedChanges.length > 0) {
    payload._verifiedByExamination = {
      note: "The following fields were fact-checked against the instructor's original uploaded syllabus and confirmed or corrected by the AI examiner. Treat these as authoritative.",
      verifiedItems: acceptedChanges,
    };
  }

  return JSON.stringify(payload);
}
