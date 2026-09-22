// v0.20.07: the setup page lets a teacher set lesson count, minutes per lesson
// and quiz questions per lesson directly. The choice is written into the course
// description as one explicit line so every existing reader (lesson detection,
// session clock, quiz count, the model prompt itself) sees the same value.
export const COURSE_SHAPE_LINE_RE = /^Course shape \(set in setup\):[^\n]*$/im;

function lineValue(line, pattern) {
  const match = String(line || '').match(pattern);
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) ? value : null;
}

export function readCourseShapeLine(brief = '') {
  const line = String(brief || '').match(COURSE_SHAPE_LINE_RE)?.[0] || '';
  if (!line) return null;
  return {
    lessons: lineValue(line, /exactly (\d{1,2}) lessons?/i),
    minutes: lineValue(line, /(\d{2,3}) minutes per lesson/i),
    quizPerLesson: lineValue(line, /(\d{1,2}) quiz questions per lesson/i),
  };
}

export function writeCourseShapeLine(brief = '', shape = {}) {
  const parts = [];
  if (Number.isInteger(shape.lessons) && shape.lessons > 0)
    parts.push(`exactly ${shape.lessons} lesson${shape.lessons === 1 ? '' : 's'}`);
  if (Number.isInteger(shape.minutes) && shape.minutes > 0) parts.push(`${shape.minutes} minutes per lesson`);
  if (Number.isInteger(shape.quizPerLesson) && shape.quizPerLesson > 0)
    parts.push(`${shape.quizPerLesson} quiz questions per lesson`);
  const base = String(brief || '')
    .replace(COURSE_SHAPE_LINE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  if (parts.length === 0) return base;
  return `${base}${base ? '\n\n' : ''}Course shape (set in setup): ${parts.join('; ')}.`;
}
