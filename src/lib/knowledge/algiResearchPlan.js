/**
 * Algi research planning — turn a course outline into a bounded, inspectable
 * research transaction before any provider receives a query.
 *
 * This is intentionally deterministic. Algi does not need a multi-gigabyte
 * model to decide that a biomedical lesson belongs in Europe PMC, that a
 * current-policy lesson needs fresh evidence, or that a broad lesson title
 * should be disambiguated by the course domain.
 */

import { sha256HexSync } from '../sha256Sync.js';

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
const LINGUISTICS =
  /\b(?:language structure|linguistics?|phonetics?|phonology|phoneme|morphology|morpheme|syntax|syntactic|semantics|pragmatics|prosody|suprasegmentals?|speech acts?|dialectal|typology|corpus linguistics)\b/i;
const VISUAL_HUMANITIES =
  /\b(?:art history|composition|color theory|colour theory|graphic design|image analysis|photograph\w*|perspective and framing|visual analysis|visual arts?|visual communication|visual evidence|visual hierarchy)\b/i;
const COMPUTING_CONTEXT =
  /\b(?:coding|computer\s+science|programming|python|software\s+development|software\s+engineering)\b/i;
const HUMANITIES =
  /\b(?:art history|ethics|history|humanities|language|literature|music|philosoph|religion|writing)\b/i;
const SOCIAL_SCIENCE =
  /\b(?:accessib(?:le|ility)|anthropolog|business|communication|design|education|inclusive design|law|management|marketing|policy|politic|psycholog|sociolog|user experience|ux|web standards?)\b/i;
const TIME_SENSITIVE =
  /\b(?:current|emerging|guideline|latest|law|policy|recent|regulation|standard|state of the art|technology|today|trend)\b/i;
const APPLICATION =
  /\b(?:application|case|decision|design|diagnos\w*|field|intervention|law|policy|practice|project|regulation|risk|standard|strategy)\b/i;
const SEARCH_WRAPPER =
  /^(?:analyzing|analysing|applying|application|applications|audit|audits|comparing|comparison|comparisons|construction|defining|definition|definitions|evaluating|evaluation|evaluations|examining|explaining|exploring|implementation|implications|integration|interpreting|introduction|investigating|justifying|mechanics|overview|planning|practice|practices|production|trade-off|trade-offs|understanding|using|verification)$/i;
const MAX_QUERY_VARIANTS_PER_LESSON = 4;

export function stripResearchCurricularLocator(value = '') {
  return String(value || '')
    .replace(/\s*\((?:ch(?:apter)?\.?\s*)?\d+(?:\.\d+)*(?:\s*[-–—]\s*\d+(?:\.\d+)*)?\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function catalogMorphologyTerms(value = '') {
  return tokens(value).map((term) => {
    if (/^context(?:ual|ually|ualism|ualist|ualized|ualization)$/.test(term)) return 'context';
    // Catalogs index canonical concept nouns more reliably than instructional
    // verbs. Preserve an authored noun such as “interpretation”; only convert
    // adjectival and verbal forms to that noun surface.
    if (/^interpret(?:ative|atively|ive|ively|ed|ing)$/.test(term)) return 'interpretation';
    return term;
  });
}

export function inferAlgiResearchDomain(courseName = '', lessons = []) {
  const text = [courseName, ...lessons.map((lesson) => clean(lesson?.title || lesson?.topic))].join(' ');
  if (BIOMEDICAL.test(text)) return 'biomedical';
  // “Language data” and “corpus data” are ordinary linguistics phrases. A
  // bare data token must not route a language-structure course through the
  // quantitative disambiguator, which appends “data analysis” to searches
  // for phonemes, prosody, and head movement.
  if (LINGUISTICS.test(text)) return 'linguistics';
  if (QUANTITATIVE.test(text)) return 'quantitative';
  if (VISUAL_HUMANITIES.test(text)) return 'visual-humanities';
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
  if (domain === 'linguistics') return ['wikipedia', 'doaj'];
  if (domain === 'visual-humanities') return ['wikipedia', 'doaj'];
  return ['doaj', 'wikipedia'];
}

function quoted(value = '') {
  return `"${clean(value).replace(/"/g, '')}"`;
}

function coarseDisambiguatorForProvider({ providerId, title, domainTerms, domain, computingContext = false }) {
  if (providerId !== 'wikipedia') {
    const titleTerms = new Set(tokens(title));
    return domainTerms.find((term) => !titleTerms.has(term)) || '';
  }
  const programmingTopic =
    /\b(?:algorithm\w*|automated tests?|branch\w*|code|conditional\w*|data types?|debugg\w*|deploy\w*|exceptions?|expressions?|files?|functions?|inputs?|loops?|modules?|outputs?|program\w*|python|scope|software tests?|testing|unit tests?)\b/i.test(
      title,
    );
  if (domain === 'quantitative') {
    if (computingContext && programmingTopic) return 'computer programming';
    return domainTerms.some((term) => /^statistic/.test(term)) ? 'statistics' : 'data analysis';
  }
  if (domain === 'linguistics') return 'linguistics';
  if (domain === 'biomedical') return 'biology';
  if (domain === 'visual-humanities') return 'visual arts';
  return '';
}

function queryForProvider({
  providerId,
  title,
  domainTerms,
  domain,
  computingContext = false,
  disambiguatorOverride = '',
}) {
  const researchTitle = stripResearchCurricularLocator(title);
  if (providerId === 'wikipedia') {
    // Encyclopedia search should look for the concepts an instructor named,
    // not the whole pedagogical wrapper as one exact page title. A compound
    // lesson phrase may have no canonical article, while an OR query over its
    // clauses can retrieve source pages for both sides and still leaves
    // relevance/admission to reject false friends.
    const clauses = clean(researchTitle)
      .split(/\s+(?:and|&)\s+|\s*[·|]\s*|[,;:]/i)
      .map((clause) =>
        tokens(clause)
          .filter((term) => !SEARCH_WRAPPER.test(term))
          .slice(0, 5),
      )
      .filter((terms) => terms.length > 0)
      .map((terms) => terms.join(' '));
    // The course wins over a collision-prone lesson word. "Gene expression"
    // and "cardiac function" are not programming topics merely because their
    // titles contain expression/function. A quantitative course must also
    // contain an explicit computing signal before lesson vocabulary can choose
    // computer-programming rather than broader data-analysis disambiguation.
    const coarseDisambiguator =
      disambiguatorOverride ||
      coarseDisambiguatorForProvider({ providerId, title: researchTitle, domainTerms, domain, computingContext });
    if (clauses.length > 1) {
      const concepts = `(${clauses.join(' OR ')})`;
      return [concepts, coarseDisambiguator].filter(Boolean).join(' ');
    }
    // A source catalog searches headword language, while an instructor often
    // writes an abstract adjectival label. For a three-or-more-token single
    // concept, make the primary query itself useful under a tight request
    // budget (“ethical contextual interpretation” → “ethical context
    // interpretation”). Exact provider passages still have to pass every downstream
    // relevance, domain, entailment, and lesson-intent gate.
    const catalogTerms = catalogMorphologyTerms(researchTitle);
    const authoredTerms = tokens(researchTitle);
    if (catalogTerms.length >= 3 && catalogTerms.some((term, index) => term !== authoredTerms[index])) {
      return [catalogTerms.join(' '), coarseDisambiguator].filter(Boolean).join(' ');
    }
    const titleTerms = new Set(tokens(researchTitle));
    const disambiguator = coarseDisambiguator || domainTerms.find((term) => !titleTerms.has(term)) || '';
    return [quoted(clauses[0] || researchTitle), disambiguator].filter(Boolean).join(' ');
  }
  // Scholarly indexes rarely contain an instructor's whole pedagogical label
  // verbatim. Searching "Cooling interventions, implementation trade-offs,
  // and evaluation" as one quoted phrase produced zero results even though
  // the index held papers on cooling interventions. Preserve explicit concept
  // sides, remove only instructional wrapper words, and let the downstream
  // relevance/entailment gates decide which returned records are admissible.
  const disambiguator =
    disambiguatorOverride ||
    coarseDisambiguatorForProvider({ providerId, title: researchTitle, domainTerms, domain, computingContext });
  const wrapperHeavy =
    /,\s*(?:implementation|practice|application|comparison|evaluation|trade-offs?)\b/i.test(researchTitle) ||
    /\b(?:implementation|practice|evaluation|planning|trade-offs?)\s*$/i.test(researchTitle);
  if (wrapperHeavy) {
    const clauses = clean(researchTitle)
      .split(/\s+(?:and|&)\s+|\s*[·|]\s*|[,;:]/i)
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
  return [quoted(researchTitle), disambiguator].filter(Boolean).join(' AND ');
}

/**
 * Keep the economical whole-lesson query for the breadth pass, then expose
 * one bounded query per explicit concept clause for revision. Search engines
 * rank an OR expression globally, so a popular result for the first clause
 * can otherwise consume every result slot and leave the second clause
 * unresearched. The variants are derived from the instructor's title and the
 * inferred course domain; no course or source title is memorized here.
 */
function queryVariantsForProvider({
  providerId,
  title,
  domainTerms,
  domain,
  computingContext = false,
  evidenceContext = '',
}) {
  const researchTitle = stripResearchCurricularLocator(title);
  const primary = queryForProvider({ providerId, title: researchTitle, domainTerms, domain, computingContext });
  const inheritedDisambiguator = coarseDisambiguatorForProvider({
    providerId,
    title: researchTitle,
    domainTerms,
    domain,
    computingContext,
  });
  const clauses = clean(researchTitle)
    .split(/\s+(?:and|&)\s+|\s*[·|]\s*|[,;:]/i)
    .map(clean)
    .filter((clause) => tokens(clause).length > 0)
    .slice(0, MAX_QUERY_VARIANTS_PER_LESSON - 1);
  const clauseQueries = clauses.map((clause) =>
    queryForProvider({
      providerId,
      title: clause,
      domainTerms,
      domain,
      computingContext,
      disambiguatorOverride: inheritedDisambiguator,
    }),
  );
  const unquotedWikipediaQueries =
    providerId === 'wikipedia'
      ? clauses.map((clause) => {
          const core = tokens(clause)
            .filter((term) => !SEARCH_WRAPPER.test(term))
            .slice(0, 5)
            .join(' ');
          return [core, inheritedDisambiguator].filter(Boolean).join(' ');
        })
      : [];
  // The lesson title is a curriculum label, not the whole evidence need.
  // Preserve one bounded query that carries the locally planned object and
  // operation (for example, visual attribution or categorical comparison).
  // The terms are derived uniformly from the lesson plan; no course/page
  // mapping is encoded here, and ordinary relevance/admission still decides
  // whether any returned source may be taught.
  const titleTokenSet = new Set(tokens(researchTitle));
  const evidenceTerms = unique(
    tokens(evidenceContext).filter(
      (term) =>
        !titleTokenSet.has(term) &&
        !SEARCH_WRAPPER.test(term) &&
        !/^(?:analysis|apply|choose|claim|claiming|compare|conclusion|course|decision|declare|detail|evidence|four|identify|interpret|learner|lesson|limitation|main|name|noncausal|observed|one|practice|restating|source|state|student|task|three|two|use|uses|using|verify|without)$/.test(
          term,
        ),
    ),
  ).slice(0, 6);
  const evidenceContextQuery =
    evidenceTerms.length > 0
      ? providerId === 'wikipedia'
        ? [quoted(researchTitle), evidenceTerms.join(' '), inheritedDisambiguator].filter(Boolean).join(' ')
        : [quoted(researchTitle), quoted(evidenceTerms.join(' ')), inheritedDisambiguator].filter(Boolean).join(' AND ')
      : '';
  // The frozen lesson plan often names a sharper evidence object than its
  // catalog-style lesson title. Give up to two of those explicit clauses an
  // independent provider query so a popular broad result cannot consume every
  // slot before the typology, specimen, denominator, or other planned object
  // is searched directly.
  const evidenceClauses = clean(evidenceContext)
    .split(/\s*[·|]\s*|[,;:]/i)
    .map(clean)
    .filter((clause) => {
      const clauseTerms = tokens(clause).filter((term) => !SEARCH_WRAPPER.test(term));
      return clauseTerms.length >= 2 && clauseTerms.some((term) => !titleTokenSet.has(term));
    })
    .slice(0, 2);
  const evidenceClauseQueries = evidenceClauses.map((clause) =>
    queryForProvider({
      providerId,
      title: clause,
      domainTerms,
      domain,
      computingContext,
      disambiguatorOverride: inheritedDisambiguator,
    }),
  );
  if (clauses.length < 2) {
    return unique([primary, ...evidenceClauseQueries, evidenceContextQuery, ...unquotedWikipediaQueries]).slice(
      0,
      MAX_QUERY_VARIANTS_PER_LESSON,
    );
  }
  return unique([
    primary,
    ...evidenceClauseQueries,
    evidenceContextQuery,
    ...clauseQueries,
    ...unquotedWikipediaQueries,
  ]).slice(0, MAX_QUERY_VARIANTS_PER_LESSON);
}

export function planAlgiCourseResearch({ courseName = '', lessons = [], now = Date.now() } = {}) {
  const normalizedLessons = (Array.isArray(lessons) ? lessons : [])
    .map((lesson, index) => ({
      lessonId: clean(lesson?.lessonId) || `lesson-${index + 1}`,
      instructionalInstanceId: clean(lesson?.instructionalInstanceId),
      planBodySha256: clean(lesson?.planBodySha256 || lesson?.instructionalInstance?.planBodySha256),
      title: clean(lesson?.title || lesson?.topic || lesson?.topicSection),
      evidenceContext: unique([
        ...(Array.isArray(lesson?.topics) ? lesson.topics : [lesson?.topics]),
        // The frozen evidence object and operation are often more specific
        // than a legacy objective (“apply the main concepts”). Put them before
        // that prose so a bounded query spends its six discriminating terms
        // on cells, denominators, contrasts, source types, or other inspectable
        // evidence rather than generic pedagogical verbs.
        ...(Array.isArray(lesson?.evidenceIntent) ? lesson.evidenceIntent : [lesson?.evidenceIntent]),
        ...(Array.isArray(lesson?.objectives) ? lesson.objectives : [lesson?.objectives]),
      ]).join(' · '),
    }))
    .filter((lesson) => lesson.title);
  const domain = inferAlgiResearchDomain(courseName, normalizedLessons);
  const researchContext = [courseName, ...normalizedLessons.map((lesson) => lesson.title)].join(' ');
  const computingContext = COMPUTING_CONTEXT.test(researchContext);
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
          computingContext,
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
          computingContext,
          evidenceContext: lesson.evidenceContext,
        }),
      ]),
    );
    const providerQueryReceipts = Object.fromEntries(
      providerOrder.map((providerId) => [
        providerId,
        (providerQueryVariants[providerId] || []).map((query) => ({
          query,
          queryId: sha256HexSync(
            JSON.stringify({
              protocol: 'scion-instance-query-v1',
              instructionalInstanceId: lesson.instructionalInstanceId,
              normalizedQuestion: clean(query),
              allowedCoverageNodes: titleTerms,
              retrievalPolicyVersion: 'scion-evidence-admission-v2',
            }),
          ),
        })),
      ]),
    );
    return {
      lessonId: lesson.lessonId,
      instructionalInstanceId: lesson.instructionalInstanceId,
      planBodySha256: lesson.planBodySha256,
      title: lesson.title,
      focusTerms: titleTerms,
      evidenceContext: lesson.evidenceContext,
      intent: applied ? 'concept-and-application' : 'concept-and-mechanism',
      timeSensitive,
      freshnessDays: timeSensitive ? 2 : 14,
      // Three independently admitted claims are the same minimum the Scion
      // evidence layer and lesson-kernel contract require. Asking research for
      // five before it may compose discarded lessons with three or four exact
      // source passages and then invited the model to fill the gap. Breadth is
      // still preferred (and confidence records source count), but one strong
      // open source can honestly support a compact draft lesson.
      minimumClaims: 3,
      // Keep the receipt honest about breadth: one evidence-rich source may
      // be usable, but it remains labeled usable-single-source rather than
      // being promoted to the plan's stronger multi-source "ready" state.
      minimumSources: 2,
      providerQueries,
      providerQueryVariants,
      providerQueryReceipts,
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
