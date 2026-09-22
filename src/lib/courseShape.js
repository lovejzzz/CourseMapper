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

const ZH_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// Chinese numerals up to 99 (一, 十二, 二十, 四十五) or plain digits.
export function parseZhCount(token) {
  const text = String(token || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (!/^[零一二两三四五六七八九十]+$/.test(text)) return null;
  if (!text.includes('十')) return text.length === 1 ? (ZH_DIGITS[text] ?? null) : null;
  const [tens, ones] = text.split('十');
  const tensValue = tens ? ZH_DIGITS[tens] : 1;
  const onesValue = ones ? ZH_DIGITS[ones] : 0;
  return tensValue == null || onesValue == null ? null : tensValue * 10 + onesValue;
}

const ZH_COUNT = '(\\d{1,3}|[零一二两三四五六七八九十]{1,3})';

function zhValue(text, pattern) {
  const match = text.match(pattern);
  return match ? parseZhCount(match[1]) : null;
}

// A Chinese brief states the same shape in its own words: "1节课，45分钟，
// 每节4道题的测验" or "共八课时，每课时40分钟". Only explicit statements count;
// "每节" (per lesson) is never read as a lesson count.
export function readChineseCourseShape(brief = '') {
  const text = String(brief || '').replace(/\s+/g, '');
  if (!/[\u4e00-\u9fff]/.test(text)) return null;
  const lessons = zhValue(text, new RegExp(`(?<![每第])(?:共|一共|总共)?${ZH_COUNT}(?:节课|课时|次课|讲|个单元|周课)`));
  const minutes = zhValue(text, new RegExp(`${ZH_COUNT}分钟`));
  const quizPerLesson =
    zhValue(
      text,
      new RegExp(`每(?:节|节课|课时|课|次课)(?:的?测验)?(?:包含|含|有)?${ZH_COUNT}道(?:题|小题|测验题|选择题|测试题)`),
    ) ?? zhValue(text, new RegExp(`${ZH_COUNT}道题的?(?:测验|小测|测试)`));
  const shape = {
    lessons: lessons >= 1 && lessons <= 52 ? lessons : null,
    minutes: minutes >= 10 && minutes <= 240 ? minutes : null,
    quizPerLesson: quizPerLesson >= 1 && quizPerLesson <= 20 ? quizPerLesson : null,
  };
  return shape.lessons || shape.minutes || shape.quizPerLesson ? shape : null;
}

export function readCourseShapeLine(brief = '') {
  const line = String(brief || '').match(COURSE_SHAPE_LINE_RE)?.[0] || '';
  if (!line) return readChineseCourseShape(brief);
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
