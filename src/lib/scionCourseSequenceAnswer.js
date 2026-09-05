const COURSE_SEQUENCE_INTENT =
  /\b(?:course|weekly|week-by-week|lesson-by-lesson)\s+(?:arc|outline|overview|progression|schedule|sequence)\b|\b(?:outline|summarize)\b.{0,80}\b(?:weeks?|lessons?|course)\b/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAssignedReadings(value) {
  const readings = Array.isArray(value) ? value : String(value || '').split(/\s*;\s*/);
  return [
    ...new Set(
      readings
        .map((reading) => cleanText(typeof reading === 'string' ? reading : reading?.title || reading?.name))
        .filter(Boolean),
    ),
  ];
}

function lessonReadingsFromCourseMap(lesson = {}) {
  return [
    ...new Set(
      (Array.isArray(lesson.sections) ? lesson.sections : [])
        .flatMap((section) => splitAssignedReadings(section?.readings || section?.assignedReadings))
        .filter(Boolean),
    ),
  ];
}

function firstConcreteSkill(lesson = {}) {
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  const candidates = sections.flatMap((section) => [
    section?.learningObjectives,
    section?.syncActivities,
    section?.asyncActivities,
  ]);
  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const value of values) {
      const text = cleanText(value)
        .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '')
        .split(/(?<=[.!?])\s+/)[0]
        .trim();
      if (text.length >= 12) return /[.!?]$/.test(text) ? text : `${text}.`;
    }
  }
  return '';
}

function readingIdentity(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildScionCourseSequenceAnswer({ question, courseMap, deliverables } = {}) {
  if (!COURSE_SEQUENCE_INTENT.test(cleanText(question))) return null;
  const syllabus = deliverables?.syllabus?.data?.syllabus || deliverables?.syllabus?.data || {};
  const schedule = Array.isArray(syllabus.weeklySchedule) ? syllabus.weeklySchedule : [];
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const requiredTextTitles = splitAssignedReadings(syllabus.requiredTexts);
  const requiredTextIdentities = new Set(requiredTextTitles.map(readingIdentity).filter(Boolean));
  const keepRegisteredReadings = (readings) => {
    const candidates = splitAssignedReadings(readings);
    if (requiredTextIdentities.size === 0) return candidates;
    return candidates.filter((reading) => requiredTextIdentities.has(readingIdentity(reading)));
  };
  const rowCount = Math.max(schedule.length, lessons.length);
  if (rowCount < 2) return null;

  const includeReadings = /\b(?:assigned|reading|readings|text|texts|work|works)\b/i.test(question);
  const includeSkills = /\b(?:skill|skills|practice|practise|can do|perform|demonstrate)\b/i.test(question);
  const lines = [];
  for (let index = 0; index < rowCount; index += 1) {
    const scheduleRow = schedule[index] || {};
    const lesson = lessons[index] || {};
    const week = cleanText(scheduleRow.week || scheduleRow.dates) || `Week ${index + 1}`;
    const topic =
      cleanText(scheduleRow.topic) ||
      cleanText(lesson.title).replace(/^\s*(?:lesson|week)\s*\d+\s*[:.)-]?\s*/i, '') ||
      `Lesson ${index + 1}`;
    const scheduledReadings = keepRegisteredReadings(scheduleRow.readings || scheduleRow.assignedReadings);
    const mapReadings = keepRegisteredReadings(lessonReadingsFromCourseMap(lesson));
    const readings = [...new Set(scheduledReadings.length > 0 ? scheduledReadings : mapReadings)];
    const readingText =
      readings.length > 0
        ? `Assigned reading${readings.length === 1 ? '' : 's'}: ${readings.join('; ')}.`
        : 'The compiled syllabus does not name a reading for this week.';
    const skill = firstConcreteSkill(lesson);
    const skillText = includeSkills
      ? skill
        ? `Concrete skill: ${skill}`
        : 'The compiled Course Map does not name a concrete skill for this lesson.'
      : '';
    lines.push(
      `- **${week}: ${topic}.**${skillText ? ` ${skillText}` : ''}${
        includeReadings || readings.length > 0 ? ` ${readingText}` : ''
      }`,
    );
  }

  return {
    text: `${lines.join('\n')}\n\nCourse evidence: Syllabus weekly schedule and Course Map.`,
    kind: 'course-evidence',
    sources: ['Syllabus', 'Course Map'],
  };
}
