import { normalizeLessonTitleIdentity } from './lessonTitleIdentity';

export function buildCourseMapContinuationPrompt(
  workingMap,
  expectedCount,
  syllabusText = '',
  colDefs = [],
  rejectedTopics = [],
) {
  const actual = workingMap.lessons.length;
  const existingTitles = workingMap.lessons.map((lesson, index) => `${index + 1}. ${lesson.title}`).join('\n');
  const sampleFields = colDefs.map((key) => `"${key}": "..."`).join(', ');
  const continuationSyllabus =
    syllabusText.length > 20000
      ? syllabusText.slice(Math.max(0, Math.floor(syllabusText.length / 2) - 2000))
      : syllabusText;
  return `This Course Map has ${actual} of ${expectedCount} lessons.

Existing lessons:
${existingTitles}

Generate ONLY Lessons ${actual + 1}-${expectedCount}.

RULES:
- Return one JSON object whose "lessons" array contains only the new lessons.
- New topics must differ from every existing and new topic; renamed duplicates are forbidden.
- Compare without lesson numbers and with acronyms expanded (CPI = Consumer Price Index).
- Split broad topics by an explicit progression such as measurement, causes, policy application, or synthesis, with different objectives.
- Each lesson needs "title" and "sections".
- Each section is an object with these keys: ${colDefs.join(', ')}.
- Use 2-5 sections per lesson. Leave no field empty.
${
  rejectedTopics.length > 0
    ? `- A previous continuation was rejected for repeating these topics: ${rejectedTopics.join('; ')}. Do not return them again.`
    : ''
}

FORMAT:
{"lessons": [{"title": "Lesson ${actual + 1}: Title Here", "sections": [{${sampleFields}}]}]}

LATER SYLLABUS CONTENT:
${continuationSyllabus}`;
}

function rebaseContinuationLesson(lesson, lessonNumber) {
  const rawTitle = String(lesson?.title || '').trim();
  const topic = rawTitle.replace(/^(?:lesson|week|module)\s*\d+\s*[:.\-–—]?\s*/i, '').trim();
  if (!topic) return null;
  const sections = Array.isArray(lesson?.sections)
    ? lesson.sections.map((section) => {
        if (!section || typeof section !== 'object') return section;
        const topicSection = String(section.topicSection || '').replace(
          /^\s*\d+\.(\d+)\s*[:.\-–—]?\s*/,
          `${lessonNumber}.$1: `,
        );
        return topicSection && topicSection !== section.topicSection ? { ...section, topicSection } : section;
      })
    : lesson?.sections;
  return {
    ...lesson,
    title: `Lesson ${lessonNumber}: ${topic}`,
    ...(sections ? { sections } : {}),
  };
}

export function admitCourseMapContinuationLessons(existingLessons = [], candidateLessons = []) {
  const seen = new Set(existingLessons.map((lesson) => normalizeLessonTitleIdentity(lesson?.title)).filter(Boolean));
  const lessons = [];
  const rejectedTopics = [];
  for (const candidate of candidateLessons) {
    const rebased = rebaseContinuationLesson(candidate, existingLessons.length + lessons.length + 1);
    const identity = normalizeLessonTitleIdentity(rebased?.title);
    if (!rebased || !identity || seen.has(identity)) {
      const title = String(candidate?.title || '').trim();
      if (title) rejectedTopics.push(title);
      continue;
    }
    seen.add(identity);
    lessons.push(rebased);
  }
  return { lessons, rejectedTopics: [...new Set(rejectedTopics)] };
}
