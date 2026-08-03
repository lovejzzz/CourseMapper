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
  /\b(?:accessib(?:le|ility)|anthropolog|business|communication|design|education|inclusive design|law|management|marketing|policy|politic|psycholog|sociolog|user experience|ux|web standards?)\b/i;
const TIME_SENSITIVE =
  /\b(?:current|emerging|guideline|latest|law|policy|recent|regulation|standard|state of the art|technology|today|trend)\b/i;
const APPLICATION =
  /\b(?:application|case|decision|design|diagnos\w*|field|intervention|law|policy|practice|project|regulation|risk|standard|strategy)\b/i;
const SEARCH_WRAPPER =
  /^(?:application|applications|comparison|comparisons|evaluation|evaluations|evidence|implementation|implications|introduction|overview|planning|practice|practices|trade-off|trade-offs)$/i;
const MAX_QUERY_VARIANTS_PER_LESSON = 4;

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
  // Foundational quantitative lessons need canonical concept/mechanism
  // coverage before a narrowly related research abstract. A scholarly-first
  // route repeatedly returned domain-adjacent papers for basic programming,
  // statistics, and data-method lessons; those metadata rows then displaced
  // the reference source that actually defined the taught concept. Wikipedia
  // remains subject to the same relevance, exact-passage, license, and
  // admission gates, so this changes retrieval order rather than trust.
  if (domain === 'quantitative') return ['wikipedia', 'doaj'];
  return ['doaj', 'wikipedia'];
}

function quoted(value = '') {
  return `"${clean(value).replace(/"/g, '')}"`;
}

function coarseDisambiguatorForProvider({ providerId, title, domainTerms, domain }) {
  if (providerId !== 'wikipedia') {
    const titleTerms = new Set(tokens(title));
    return domainTerms.find((term) => !titleTerms.has(term)) || '';
  }
  const programmingTopic =
    /\b(?:algorithm\w*|automated tests?|branch\w*|code|conditional\w*|data types?|debugg\w*|deploy\w*|exceptions?|expressions?|files?|functions?|inputs?|loops?|modules?|outputs?|program\w*|python|scope|software tests?|testing|unit tests?)\b/i.test(
      title,
    );
  if (domain === 'quantitative') return programmingTopic ? 'computer programming' : 'data analysis';
  if (domain === 'biomedical') return 'biology';
  return '';
}

function queryForProvider({ providerId, title, domainTerms, domain, disambiguatorOverride = '' }) {
  if (providerId === 'wikipedia') {
    // Encyclopedia search should look for the concepts an instructor named,
    // not the whole pedagogical wrapper as one exact page title. A query such
    // as "Functions and automated tests" applied has no canonical article,
    // while "functions" OR "automated tests" can retrieve source pages for
    // both sides and still leaves relevance/admission to reject false friends.
    const clauses = clean(title)
      .split(/\s+(?:and|&)\s+|[,;:]/i)
      .map((clause) =>
        tokens(clause)
          .filter((term) => !SEARCH_WRAPPER.test(term))
          .slice(0, 5),
      )
      .filter((terms) => terms.length > 0)
      .map((terms) => terms.join(' '));
    // The course wins over a collision-prone lesson word. "Gene expression"
    // and "cardiac function" are not programming topics merely because their
    // titles contain expression/function. Only a course already classified as
    // quantitative may use the title vocabulary to choose between computing
    // and broader data-analysis disambiguation.
    const coarseDisambiguator =
      disambiguatorOverride || coarseDisambiguatorForProvider({ providerId, title, domainTerms, domain });
    if (clauses.length > 1) {
      const concepts = `(${clauses.join(' OR ')})`;
      return [concepts, coarseDisambiguator].filter(Boolean).join(' ');
    }
    const titleTerms = new Set(tokens(title));
    const disambiguator = coarseDisambiguator || domainTerms.find((term) => !titleTerms.has(term)) || '';
    return [quoted(clauses[0] || title), disambiguator].filter(Boolean).join(' ');
  }
  // Scholarly indexes rarely contain an instructor's whole pedagogical label
  // verbatim. Searching "Cooling interventions, implementation trade-offs,
  // and evaluation" as one quoted phrase produced zero results even though
  // the index held papers on cooling interventions. Preserve explicit concept
  // sides, remove only instructional wrapper words, and let the downstream
  // relevance/entailment gates decide which returned records are admissible.
  const disambiguator =
    disambiguatorOverride || coarseDisambiguatorForProvider({ providerId, title, domainTerms, domain });
  const wrapperHeavy =
    /,\s*(?:implementation|practice|application|comparison|evaluation|trade-offs?)\b/i.test(title) ||
    /\b(?:implementation|practice|evaluation|planning|trade-offs?)\s*$/i.test(title);
  if (wrapperHeavy) {
    const clauses = clean(title)
      .split(/\s+(?:and|&)\s+|[,;:]/i)
      .map((clause) =>
        tokens(clause)
          .filter((term) => !SEARCH_WRAPPER.test(term))
          .slice(0, 4),
      )
      .filter((terms) => terms.length > 0)
      .map((terms) => quoted(terms.join(' ')));
    if (clauses.length > 0) {
      const conceptQuery = clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
      return [conceptQuery, disambiguator].filter(Boolean).join(' AND ');
    }
  }
  return [quoted(title), disambiguator].filter(Boolean).join(' AND ');
}

/**
 * Keep the economical whole-lesson query for the breadth pass, then expose
 * one bounded query per explicit concept clause for revision. Search engines
 * rank an OR expression globally, so a popular result for the first clause
 * can otherwise consume every result slot and leave the second clause
 * unresearched. The variants are derived from the instructor's title and the
 * inferred course domain; no course or source title is memorized here.
 */
function queryVariantsForProvider({ providerId, title, domainTerms, domain }) {
  const primary = queryForProvider({ providerId, title, domainTerms, domain });
  const inheritedDisambiguator = coarseDisambiguatorForProvider({ providerId, title, domainTerms, domain });
  const clauses = clean(title)
    .split(/\s+(?:and|&)\s+|[,;:]/i)
    .map(clean)
    .filter((clause) => tokens(clause).length > 0)
    .slice(0, MAX_QUERY_VARIANTS_PER_LESSON - 1);
  if (clauses.length < 2) return [primary];
  return unique([
    primary,
    ...clauses.map((clause) =>
      queryForProvider({
        providerId,
        title: clause,
        domainTerms,
        domain,
        disambiguatorOverride: inheritedDisambiguator,
      }),
    ),
  ]).slice(0, MAX_QUERY_VARIANTS_PER_LESSON);
}

export function planAlgiCourseResearch({ courseName = '', lessons = [], now = Date.now() } = {}) {
  const normalizedLessons = (Array.isArray(lessons) ? lessons : [])
    .map((lesson, index) => ({
      lessonId: clean(lesson?.lessonId) || `lesson-${index + 1}`,
      title: clean(lesson?.title || lesson?.topic || lesson?.topicSection),
    }))
    .filter((lesson) => lesson.title);
  const domain = inferAlgiResearchDomain(courseName, normalizedLessons);
  const researchContext = [courseName, ...normalizedLessons.map((lesson) => lesson.title)].join(' ');
  // Standards-oriented accessibility lessons need the canonical concept and
  // conformance vocabulary before a broad empirical paper. A DOAJ-first pass
  // could satisfy the compact schema with a merely related article and stop
  // the cascade before WCAG/HTML sources were checked.
  const canonicalAccessibilityFirst =
    /\b(?:accessib(?:le|ility)|wcag|semantic html|web standards?|screen readers?)\b/i.test(researchContext);
  const providerOrder = canonicalAccessibilityFirst
    ? ['w3c-wai', 'wikipedia', 'doaj']
    : providerOrderForAlgiDomain(domain);
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
          domain,
        }),
      ]),
    );
    const providerQueryVariants = Object.fromEntries(
      providerOrder.map((providerId) => [
        providerId,
        queryVariantsForProvider({
          providerId,
          title: lesson.title,
          domainTerms,
          domain,
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
      providerQueryVariants,
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

export function providerQueryVariantsForLesson(plan = {}, topic = '', providerId = '') {
  const lesson = researchPlanByTopic(plan).get(clean(topic));
  const variants = Array.isArray(lesson?.providerQueryVariants?.[providerId])
    ? lesson.providerQueryVariants[providerId].map(clean).filter(Boolean)
    : [];
  return variants.length > 0 ? unique(variants) : [providerQueryForLesson(plan, topic, providerId)];
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
