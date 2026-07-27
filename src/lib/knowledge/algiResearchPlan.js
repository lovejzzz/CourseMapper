/**
 * Algi research planning — turn a course outline into a bounded, inspectable
 * research transaction before any provider receives a query.
 *
 * This is intentionally deterministic. Algi does not need a multi-gigabyte
 * model to decide that a biomedical lesson belongs in Europe PMC, that a
 * current-policy lesson needs fresh evidence, or that a broad lesson title
 * should be disambiguated by the course domain.
 */

export const ALGI_RESEARCH_PLAN_PROTOCOL = 'algi-course-research-plan-v1';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'course',
  'for',
  'from',
  'in',
  'introduction',
  'lesson',
  'module',
  'of',
  'on',
  'or',
  'overview',
  'principles',
  'the',
  'to',
  'unit',
  'week',
  'with',
]);

const BIOMEDICAL =
  /\b(?:anatom\w*|biofilm\w*|biolog\w*|biomed\w*|clinical|disease\w*|epidemi\w*|health|immun\w*|medical|medicine|microbi\w*|nurs\w*|pathogen\w*|physiol\w*|public health|toxicolog\w*|virolog\w*)\b/i;
const QUANTITATIVE =
  /\b(?:algorithm|calculus|computer science|data|econom|engineering|mathemat|physics|probability|programming|quantitative|statistics)\b/i;
const HUMANITIES =
  /\b(?:art history|ethics|history|humanities|language|literature|music|philosoph|religion|writing)\b/i;
const SOCIAL_SCIENCE =
  /\b(?:anthropolog|business|communication|design|education|law|management|marketing|policy|politic|psycholog|sociolog|user experience|ux)\b/i;
const TIME_SENSITIVE =
  /\b(?:current|emerging|guideline|latest|law|policy|recent|regulation|standard|state of the art|technology|today|trend)\b/i;
const APPLICATION =
  /\b(?:application|case|decision|design|diagnos\w*|field|intervention|law|policy|practice|project|regulation|risk|standard|strategy)\b/i;

function clean(value = '') {
  return String(value || '')
    .replace(/^lesson\s+\d+\s*[:.–—-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function inferAlgiResearchDomain(courseName = '', lessons = []) {
  const text = [courseName, ...lessons.map((lesson) => clean(lesson?.title || lesson?.topic))].join(' ');
  if (BIOMEDICAL.test(text)) return 'biomedical';
  if (QUANTITATIVE.test(text)) return 'quantitative';
  if (HUMANITIES.test(text)) return 'humanities';
  if (SOCIAL_SCIENCE.test(text)) return 'social-science';
  return 'general';
}

export function providerOrderForAlgiDomain(domain = 'general') {
  if (domain === 'biomedical') return ['europe-pmc', 'doaj', 'wikipedia'];
  return ['doaj', 'wikipedia'];
}

function quoted(value = '') {
  return `"${clean(value).replace(/"/g, '')}"`;
}

function queryForProvider({ providerId, title, domainTerms }) {
  const titleTerms = new Set(tokens(title));
  const disambiguator = domainTerms.find((term) => !titleTerms.has(term)) || '';
  if (providerId === 'wikipedia') return clean(title);
  // One bounded query per lesson/provider. Relevance, admission, and
  // claim-to-passage checks—not query fluency—decide what survives.
  return [quoted(title), disambiguator].filter(Boolean).join(' AND ');
}

export function planAlgiCourseResearch({ courseName = '', lessons = [], now = Date.now() } = {}) {
  const normalizedLessons = (Array.isArray(lessons) ? lessons : [])
    .map((lesson, index) => ({
      lessonId: clean(lesson?.lessonId) || `lesson-${index + 1}`,
      title: clean(lesson?.title || lesson?.topic || lesson?.topicSection),
    }))
    .filter((lesson) => lesson.title);
  const domain = inferAlgiResearchDomain(courseName, normalizedLessons);
  const providerOrder = providerOrderForAlgiDomain(domain);
  const courseTerms = tokens(courseName);
  const fallbackDomainTerms = tokens(normalizedLessons.map((lesson) => lesson.title).join(' '));
  const domainTerms = unique([...courseTerms, ...fallbackDomainTerms]).slice(0, 5);

  const lessonPlans = normalizedLessons.map((lesson) => {
    const titleTerms = unique(tokens(lesson.title));
    const timeSensitive = TIME_SENSITIVE.test(`${courseName} ${lesson.title}`);
    const applied = APPLICATION.test(lesson.title);
    const providerQueries = Object.fromEntries(
      providerOrder.map((providerId) => [
        providerId,
        queryForProvider({
          providerId,
          title: lesson.title,
          domainTerms,
        }),
      ]),
    );
    return {
      lessonId: lesson.lessonId,
      title: lesson.title,
      focusTerms: titleTerms,
      intent: applied ? 'concept-and-application' : 'concept-and-mechanism',
      timeSensitive,
      freshnessDays: timeSensitive ? 2 : 14,
      minimumClaims: 5,
      minimumSources: 2,
      providerQueries,
      providerOrder,
    };
  });

  return {
    protocol: ALGI_RESEARCH_PLAN_PROTOCOL,
    createdAt: new Date(now).toISOString(),
    courseName: clean(courseName),
    domain,
    providerOrder,
    privacy: 'course title and uncovered lesson topics only',
    maximumProviderPasses: providerOrder.length,
    lessons: lessonPlans,
  };
}

export function researchPlanByTopic(plan = {}) {
  return new Map((Array.isArray(plan?.lessons) ? plan.lessons : []).map((lesson) => [clean(lesson.title), lesson]));
}

export function providerQueryForLesson(plan = {}, topic = '', providerId = '') {
  const lesson = researchPlanByTopic(plan).get(clean(topic));
  return clean(lesson?.providerQueries?.[providerId]) || clean(topic);
}

export function providerSupportsLesson(plan = {}, topic = '', providerId = '') {
  const lesson = researchPlanByTopic(plan).get(clean(topic));
  return Boolean(lesson?.providerOrder?.includes(providerId));
}

export function summarizeAlgiResearchPlan(plan = {}) {
  const lessons = Array.isArray(plan?.lessons) ? plan.lessons : [];
  return {
    protocol: plan?.protocol || ALGI_RESEARCH_PLAN_PROTOCOL,
    courseName: clean(plan?.courseName),
    domain: clean(plan?.domain) || 'general',
    lessonCount: lessons.length,
    timeSensitiveLessons: lessons.filter((lesson) => lesson?.timeSensitive).length,
    providerOrder: Array.isArray(plan?.providerOrder) ? [...plan.providerOrder] : [],
    queryCount: lessons.reduce(
      (total, lesson) => total + Object.values(lesson?.providerQueries || {}).filter(Boolean).length,
      0,
    ),
  };
}
