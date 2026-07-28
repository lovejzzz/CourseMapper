import { extractCourseName, planSessionTopics } from './algiComposer.js';
import { composeAlgiLessonKernels } from './algiKernelComposer.js';
import { extractExplicitLessonSequence } from './explicitLessonSequence.js';
import { planAlgiCourseResearch, summarizeAlgiResearchPlan } from './knowledge/algiResearchPlan.js';

const MIN_SESSIONS = 1;
const MAX_SESSIONS = 20;
const DEFAULT_SESSIONS = 8;
const COURSE_TOPIC_ACRONYMS = new Map(
  ['ai', 'api', 'css', 'dc', 'gis', 'html', 'lms', 'sql', 'ui', 'ux', 'wcag'].map((value) => [
    value,
    value.toUpperCase(),
  ]),
);

export function formatCoverageTopicLabel(value = '') {
  return String(value || '').replace(
    /\b[A-Za-z]{2,5}\b/g,
    (word) => COURSE_TOPIC_ACRONYMS.get(word.toLowerCase()) || word,
  );
}

function clampSessions(value) {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(MIN_SESSIONS, Math.min(MAX_SESSIONS, Math.round(count)));
}

/**
 * Predict the lesson count that the setup flow will ask Algi to map.
 *
 * An explicit "12-week" or "exactly 5 lessons" statement governs; otherwise
 * the authored sequence length is the strongest signal. This is deliberately a
 * local parse, not a model guess and not a network lookup.
 */
export function estimateAlgiSessionCount(source = '') {
  const text = String(source || '');
  const stated =
    /\b(?:exactly|around|about)\s+(\d{1,2})\s+(?:weeks?|lessons?|sessions?|modules?|units?)\b/i.exec(text)?.[1] ||
    /\b(\d{1,2})[-\s](?:week|lesson|session|module|unit)\b/i.exec(text)?.[1];
  const statedCount = clampSessions(stated);
  if (statedCount) return statedCount;
  const explicit = extractExplicitLessonSequence(text);
  return clampSessions(explicit.length) || DEFAULT_SESSIONS;
}

/**
 * Local, read-only preflight for the exact teaching-genome route Algi will run.
 *
 * No provider is supplied, so this function cannot make a request. The result
 * distinguishes private coverage from lessons that need admitted external
 * evidence instead of implying that an uncovered lesson is safe to generate.
 */
export async function forecastAlgiCoverage({ source = '', researchEnabled = false, sessionCount = null } = {}) {
  const normalizedSource = String(source || '').trim();
  if (normalizedSource.length < 3) {
    return {
      status: 'idle',
      route: 'awaiting-source',
      courseName: '',
      requested: 0,
      privateCovered: 0,
      externalNeeded: 0,
      lessons: [],
    };
  }
  const requested = clampSessions(sessionCount) || estimateAlgiSessionCount(normalizedSource);
  const topics = planSessionTopics(normalizedSource, requested);
  const courseName = extractCourseName(normalizedSource);
  const lessons = topics.map((title, index) => ({
    lessonId: `lesson-${index + 1}`,
    title,
    topics: [title],
    objectives: [],
  }));
  const composed = await composeAlgiLessonKernels({
    structuredPrompt: { courseTitle: courseName, lessons },
    courseContext: courseName,
    researchProvider: null,
  });
  const uncovered = new Set(composed.uncovered || []);
  const lessonForecast = lessons.map((lesson) => {
    const needsEvidence = uncovered.has(lesson.lessonId);
    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      status: needsEvidence ? (researchEnabled ? 'research-planned' : 'source-gap') : 'private-ready',
      route: needsEvidence ? (researchEnabled ? 'open-source-research' : 'unsupported-private') : 'shipped-genome',
    };
  });
  const privateCovered = lessonForecast.filter((lesson) => lesson.status === 'private-ready').length;
  const externalNeeded = lessonForecast.length - privateCovered;
  const researchPlan = planAlgiCourseResearch({
    courseName,
    lessons: lessonForecast
      .filter((lesson) => lesson.status !== 'private-ready')
      .map((lesson) => ({ lessonId: lesson.lessonId, title: lesson.title })),
  });
  return {
    status: 'ready',
    route: externalNeeded === 0 ? 'private-ready' : researchEnabled ? 'research-assisted' : 'private-coverage-gaps',
    courseName,
    requested: lessonForecast.length,
    privateCovered,
    externalNeeded,
    lessons: lessonForecast,
    researchPlan: summarizeAlgiResearchPlan(researchPlan),
  };
}
