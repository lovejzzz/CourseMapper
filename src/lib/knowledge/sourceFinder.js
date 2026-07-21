/**
 * knowledge/sourceFinder.js — low-cost, real-knowledge retrieval.
 *
 * This is a temporary course mini-shard builder, not a new paid enrichment
 * step. It asks keyless public metadata providers for small source packets,
 * caches by course+topic+ISO week, keeps only top snippets/citations, and
 * attaches the best sources to the Course Graph as Resource entities.
 */

import {
  isoWeekStamp,
  oerCommonsSearchLink,
  searchBookMetadata,
  searchCrossrefWorks,
  searchEducationResearch,
  searchInternetArchiveTexts,
  searchLibraryOfCongress,
  searchScholarlyReadings,
  searchWikipediaPages,
} from './providers.js';
import { isCourseAwareWeakSource, isLicenseAmbiguous } from './sourceLedger.js';
import { isMusicIntervalWeakSource } from './musicSourceRelevance.js';
import { detectForeignLanguageTeachingContent } from '../languageIdentityGuard.js';

export const SOURCE_FINDER_ORIGIN = 'source-finder';

// v3 invalidates v2 mini-shards after the discipline-anchor hardening below.
// Cached sources are already ranked/filtered, so reusing a v2 shard would
// keep known homonym failures (for example "Staff (military)" in music
// theory) even after the live filter became stricter.
// v6 invalidates v5 mini-shards after weak lesson labels and same-token
// course/topic overlap were tightened. Reusing the old cache could otherwise
// keep a "Focus group" page attached to Tang poetry for the rest of the week.
// v7 invalidates biographies that matched only through a person's career
// summary (for example, Richard Lindzen for an atmospheric-layers lesson).
// v8 also carries the lesson title into retrieval and tightens single-token
// domain matches exposed by the K-12 Earth Science field run.
// v9 adds a literature-domain anchor after a live World Literature run
// accepted a Phonics page merely because its snippet repeated the generic
// query words "reading" and "method". Cached v8 mini-shards have already
// passed ranking, so they must not survive the stricter boundary.
// v10 adds a Business Ethics boundary after the stranger proof admitted
// "Fair game (Scientology)" for a fair-employment lesson. Cached v9 results
// must be re-screened because the homonym had already passed topical ranking.
const SOURCE_FINDER_VERSION = 'source-finder-v10';
const CACHE_PREFIX = 'cm-source-finder:';
const SNIPPET_LIMIT = 320;
const DEFAULT_MAX_TOPICS = 8;
const DEFAULT_LIMIT_PER_TOPIC = 3;

const PROVIDER_PRIORITY = {
  openalex: 100,
  crossref: 90,
  eric: 84,
  wikipedia: 72,
  loc: 68,
  internetarchive: 62,
  openlibrary: 56,
  oercommons: 40,
};

const PROVIDER_LABELS = {
  openalex: 'OpenAlex',
  crossref: 'Crossref',
  eric: 'ERIC',
  wikipedia: 'Wikipedia',
  loc: 'Library of Congress',
  internetarchive: 'Internet Archive',
  openlibrary: 'Open Library',
  oercommons: 'OER Commons',
};

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSnippet(value, limit = SNIPPET_LIMIT) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  const trimmed = text.slice(0, Math.max(0, limit - 3)).replace(/\s+\S*$/, '');
  return `${trimmed}...`;
}

function stableHash(value) {
  const text = cleanText(value).toLowerCase();
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function storageOrNull(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function cacheKey({ courseName, query, week }) {
  return `${CACHE_PREFIX}${SOURCE_FINDER_VERSION}:${week}:${stableHash(`${courseName}::${query}`)}`;
}

function cacheGet(key, storage) {
  const target = storageOrNull(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheSet(key, value, storage) {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort cache */
  }
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^lesson\s*\d+\s*[:.-]\s*/i, '');
}

function stripSectionPrefix(value) {
  return cleanText(value).replace(/^\d+(?:\.\d+)*\s*[:.)-]\s*/, '');
}

function isWeakSourceTopic(value) {
  const candidate = stripSectionPrefix(stripLessonPrefix(value));
  if (!candidate) return true;
  return /^(?:focus|overview|foundation|foundations|basic|basics|introduction|practice|review|scope|topic|lesson|week)$/i.test(
    candidate,
  );
}

function termsFromText(value) {
  return cleanText(value)
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g);
}

const LOW_SIGNAL_QUERY_TERMS = new Set([
  'able',
  'analyze',
  'apply',
  'basic',
  'compare',
  'construct',
  'course',
  'deconstruct',
  'define',
  'describe',
  'evaluate',
  'examine',
  'explain',
  'focus',
  'foundations',
  'ideas',
  'identify',
  'introduction',
  'interpret',
  'key',
  'lesson',
  'main',
  'overview',
  'scope',
  'students',
  'synthesize',
  'understand',
  'using',
  'will',
]);

const TOPICAL_MISMATCH_GATES = [
  {
    applies: /\b(?:rock types?|rock cycle|rock formation)\b/i,
    reject: /\b(?:rock art|cave art|parietal art|tactile maps?)\b/i,
    unlessTopic: /\b(?:art|archaeolog|map|cartograph)\b/i,
  },
  {
    applies: /\bfunctions?\b/i,
    reject: /\b(?:special functions?|mathematical physics|bessel|legendre|hypergeometric)\b/i,
    unlessSource: /\b(?:domain|codomain|mapping|bijection|injection|surjection|composition|sets?)\b/i,
  },
  {
    applies: /\btrees?\b/i,
    reject:
      /\b(?:decision trees?|random(?:ized)? trees?|random forests?|machine learning|classification|regression)\b/i,
    unlessTopic: /\b(?:machine learning|data science|classification|regression|random forest|decision tree)\b/i,
  },
  {
    applies: /\brecurrence(?:\s+relations?)?\b/i,
    reject: /\b(?:brownian|stochastic|riemannian|manifold|non-?explosion|diffusion process)\b/i,
    unlessTopic: /\b(?:probability|stochastic|brownian|diffusion|random process)\b/i,
  },
  {
    applies: /\b(?:logic|proofs?)\b/i,
    reject: /\b(?:neutrosophic|paraconsistent|many-valued|fuzzy logic)\b/i,
    unlessTopic: /\b(?:neutrosophic|paraconsistent|many-valued|fuzzy)\b/i,
  },
  {
    applies: /\bsets?\b/i,
    reject: /\b(?:efficient sets?|multi-?objective|pareto|optimization)\b/i,
    unlessTopic: /\b(?:optimization|operations research|pareto|multi-?objective)\b/i,
  },
  {
    applies: /\bgraph(?:\s+theory|s)?\b/i,
    reject: /\b(?:spectral graph|graph wavelets?|signal processing|fourier)\b/i,
    unlessTopic: /\b(?:spectral|laplacian|signal processing|fourier)\b/i,
  },
];

const DISCIPLINE_ANCHOR_GATES = [
  {
    applies: /\b(?:music theory|musical|notation|pitch|clefs?|rhythm|meter|melody|harmony|chords?|scales?)\b/i,
    source:
      /\b(?:music|musical|notation|pitch|clefs?|rhythm|meter|melody|harmony|chords?|scales?|intervals?|staff notation|sheet music)\b/i,
  },
  {
    applies:
      /\b(?:project\s+management|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|stakeholder\s+analysis|project\s+scheduling|project\s+life\s+cycle)\b/i,
    source:
      /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|stakeholder\s+analysis|project\s+scheduling|project\s+life\s+cycle|agile|scrum|kanban|operations\s+management|supply\s+chain\s+management|portfolio\s+management|construction\s+project|software\s+project)\b/i,
    unlessTopic: /\b(?:healthcare|clinical|medical|public\s+health|hospital|nursing|patient)\b/i,
  },
  {
    applies: /\b(?:genetics?|genes?|genom(?:e|es|ic|ics)|dna|crispr|inheritance|heredity|traits?|ancestry)\b/i,
    source:
      /\b(?:genetics?|genes?|genom(?:e|es|ic|ics)|dna|crispr|cas9|inheritance|heredity|traits?|ancestry|alleles?|chromosomes?|heritability)\b/i,
  },
  {
    // "reading", "method", "strategy", and "text" also describe literacy
    // instruction. A World/Comparative Literature source therefore needs a
    // genuinely literary identity rather than two generic query-token hits.
    applies: /\b(?:world\s+literature|comparative\s+literature|literary|literature|poetry|drama|novel)\b/i,
    source:
      /\b(?:literature|literatures|literary|poetry|poems?|epics?|drama(?:tic)?|novels?|fiction|narrative|story|stories|authors?|writers?|genre|close\s+reading|interpret(?:ation|ive)|comparative\s+literature)\b/i,
  },
  {
    // Business-ethics lessons contain collision-prone words such as "fair",
    // "rights", "interest", and "responsibility". Require the candidate to
    // identify an actual organizational, workplace, consumer, governance, or
    // moral-analysis context. This keeps Dodd-Frank/consumer protection while
    // rejecting the live "Fair game (Scientology)" false friend.
    applies:
      /\b(?:business\s+ethics|corporate\s+ethics|corporate\s+social\s+responsibility|stakeholder\s+theory|whistleblowing|conflicts?\s+of\s+interest|fair\s+employment|workplace\s+rights|consumer\s+protection|product\s+safety|environmental\s+responsibility|marketing\s+ethics)\b/i,
    source:
      /\b(?:business|corporat(?:e|ion)|ethic(?:al|s)?|moral(?:ity)?|utilitarian(?:ism)?|deontolog(?:y|ical)|virtue\s+ethics|stakeholders?|whistleblow(?:ing|er)|conflicts?\s+of\s+interest|employment|workplace|labor|civil\s+rights|discrimination|harassment|consumer\s+protection|consumer\s+rights|product\s+safety|dodd[–—-]frank|financial\s+reform|fiduciary|governance|compliance|sustainab(?:ility|le)|environmental\s+responsibility|marketing\s+ethics|advertising\s+ethics)\b/i,
  },
];

function topicContext(topic) {
  return cleanText(`${topic?.courseName || ''} ${topic?.topic || ''} ${topic?.query || ''}`).toLowerCase();
}

function sourceContext(source) {
  return cleanText(
    `${source?.title || ''} ${source?.snippet || source?.abstract || source?.description || ''} ${source?.primaryTopic?.name || ''} ${
      source?.primaryTopic?.field || ''
    } ${source?.primaryTopic?.domain || ''} ${(source?.topics || []).map((topic) => topic?.name || '').join(' ')}`,
  ).toLowerCase();
}

// A biography can be relevant to a course without being a useful source for
// the topic the lesson actually teaches. Wikipedia search sometimes returns a
// scientist's page because the opening career summary repeats several query
// terms. Keep biographies when the lesson explicitly names that person, but
// reject an otherwise unrequested person page before snippet overlap can make
// it look like a topical overview.
function isUnrequestedBiography(source, topic) {
  if (cleanText(source?.provider).toLowerCase() !== 'wikipedia') return false;
  const snippetHead = cleanText(source?.snippet || source?.abstract || source?.description).slice(0, 220);
  if (!/\((?:born|died)\b|\b(?:born|died)\s+(?:in\s+)?(?:1[5-9]|20)\d{2}\b/i.test(snippetHead)) return false;

  const titleTerms = stemmedTermSet(source?.title || '');
  const requestedTerms = new Set(meaningfulQueryTerms(topic).map(stemTerm));
  return ![...titleTerms].some((term) => requestedTerms.has(term));
}

// Light stemming so "determinants" (topic) matches "determinant" (source
// title) — the token gate is a Set intersection, not a substring match.
function stemTerm(term) {
  if (/^iterat(?:e|es|ed|ing|ion|ions|ive|ives)$/.test(term)) return 'iterat';
  if (/^literar(?:y|ies|ature|atures)$/.test(term)) return 'literar';
  if (/^epistemolog(?:y|ical|ist|ists)$/.test(term)) return 'knowledge';
  if (/^theis(?:m|t|ts|tic)$/.test(term)) return 'god';
  if (/^atmospher(?:e|es|ic|ics)$/.test(term)) return 'atmospher';
  if (/^geolog(?:y|ic|ical|ist|ists)$/.test(term)) return 'geolog';
  if (/^volcan(?:o|oes|ic|ism|ologist|ologists)$/.test(term)) return 'volcan';
  return term.length > 4 && term.endsWith('s') ? term.slice(0, -1) : term;
}

// v0.16.1: a single-topic-hit source must also touch the course's SUBJECT to
// clear the homonym trap. The subject is the course-title tokens plus a small
// discipline lexicon, so a genuinely in-discipline page ("Modular
// programming" for a CS course, whose abstract says "software"/"code" but not
// "python") survives while an off-domain homonym ("Independent politician"
// for linear algebra) does not. Keyed by a signal regex on the course name.
const COURSE_SUBJECT_LEXICON = [
  {
    signal: /\b(?:computer science|python|programming|coding|software|algorithm)\b/i,
    terms: ['program', 'programming', 'software', 'code', 'coding', 'algorithm', 'comput', 'function', 'data'],
  },
  {
    signal: /\b(?:linear algebra|algebra|calculus|geometry|mathematic|matrix|matrices|vector)\b/i,
    terms: [
      'matrix',
      'matrices',
      'vector',
      'linear',
      'algebra',
      'theorem',
      'equation',
      'mathematic',
      'scalar',
      'eigen',
    ],
  },
  {
    signal: /\b(?:user experience|ux|interaction design|design studio|usability)\b/i,
    terms: ['design', 'usability', 'prototype', 'prototyping', 'interface', 'wireframe', 'critique'],
  },
  {
    signal: /\b(?:world literature|comparative literature|literary|literature|poetry|drama|novel)\b/i,
    terms: ['literar', 'poetry', 'poem', 'narrative', 'epic', 'drama', 'novel', 'text', 'reading', 'interpretation'],
  },
  {
    signal: /\b(?:physics|mechanics|electromagnet|thermodynamic)\b/i,
    terms: ['physic', 'force', 'energy', 'motion', 'quantum', 'field', 'particle'],
  },
  {
    signal: /\b(?:chemistry|chemical|biochem|organic chem)\b/i,
    terms: ['chemical', 'chemistry', 'molecul', 'reaction', 'compound', 'atom'],
  },
  {
    signal: /\b(?:earth science|geology|geological|rock cycle|plate tectonic)\b/i,
    terms: [
      'earth',
      'geolog',
      'mineral',
      'igneous',
      'sedimentary',
      'metamorphic',
      'rock',
      'crust',
      'mantle',
      'core',
      'tectonic',
      'seismic',
      'volcan',
      'atmospher',
      'weather',
      'climate',
      'hydrolog',
      'erosion',
    ],
  },
];

function matchingCourseLexiconTerms(courseName) {
  const terms = [];
  for (const entry of COURSE_SUBJECT_LEXICON) {
    if (entry.signal.test(courseName || '')) terms.push(...entry.terms.map(stemTerm));
  }
  return new Set(terms);
}

function courseSubjectTerms(courseName) {
  const terms = [...stemmedTermSet(courseName)].filter((term) => !LOW_SIGNAL_QUERY_TERMS.has(term));
  terms.push(...matchingCourseLexiconTerms(courseName));
  return new Set(terms);
}

function stemmedTermSet(text) {
  return new Set((termsFromText(text) || []).map(stemTerm));
}

function meaningfulQueryTerms(topic) {
  return (termsFromText(`${topic?.topic || ''} ${topic?.query || ''}`) || []).filter(
    (term) => !LOW_SIGNAL_QUERY_TERMS.has(term),
  );
}

function sourcePassesDisciplineAnchor(source, topic) {
  const topicText = topicContext(topic);
  const sourceText = sourceContext(source);
  if (isMusicIntervalWeakSource(sourceText, topicText, topic?.query || topic?.topic || '')) return false;
  if (
    detectForeignLanguageTeachingContent({
      courseIdentity: topic?.courseName || '',
      text: sourceText,
    })
  ) {
    return false;
  }
  for (const gate of DISCIPLINE_ANCHOR_GATES) {
    if (gate.applies.test(topicText) && gate.unlessTopic?.test(topicText)) continue;
    if (gate.applies.test(topicText) && !gate.source.test(sourceText)) return false;
  }
  return true;
}

function sourcePassesTopicalFit(source, topic) {
  const topicText = topicContext(topic);
  const sourceText = sourceContext(source);
  if (!sourceText) return false;

  if (!sourcePassesDisciplineAnchor(source, topic)) return false;
  if (isUnrequestedBiography(source, topic)) return false;

  for (const gate of TOPICAL_MISMATCH_GATES) {
    const rescuedByTopic = gate.unlessTopic?.test(topicText) || false;
    const rescuedBySource = gate.unlessSource?.test(sourceText) || false;
    if (gate.applies.test(topicText) && gate.reject.test(sourceText) && !rescuedByTopic && !rescuedBySource) {
      return false;
    }
  }

  // v0.16.1: the token-overlap gate now applies to EVERY provider — the old
  // openalex|crossref|eric allowlist exempted exactly the fallback providers
  // (Wikipedia, LoC, Internet Archive, Open Library) that shipped
  // "Independent politician" for linear independence. And one shared token is
  // no longer enough ("Lewis acids and bases" shares "bases"; the lme4 paper
  // shares "linear"): a source needs either two distinct topic-term hits, or
  // one topic-term hit plus a course-subject term (e.g. "linear"/"algebra")
  // when the topic itself is a single word like "Midterm".
  const haystack = stemmedTermSet(sourceText);
  const topicTerms = [...new Set(meaningfulQueryTerms(topic).map(stemTerm))];
  const courseIdentityTerms = new Set(
    [...stemmedTermSet(topic?.courseName || '')].filter((term) => !LOW_SIGNAL_QUERY_TERMS.has(term)),
  );
  const discriminativeTopicTerms = topicTerms.filter((term) => !courseIdentityTerms.has(term));
  const sourceTitleTerms = stemmedTermSet(source?.title || '');
  const sourceNamesCourse =
    courseIdentityTerms.size >= 2 && [...courseIdentityTerms].every((term) => sourceTitleTerms.has(term));

  // A course-overview lesson may have no discriminative topic beyond the
  // course identity itself. Accept the exact named subject page, but do not
  // let one reused course word stand in for a topic match ("Erotic
  // literature" is not evidence for "World Literature Scope").
  if (sourceNamesCourse && discriminativeTopicTerms.length <= 1) return true;
  const topicHits = discriminativeTopicTerms.filter((term) => haystack.has(term)).length;
  if (topicHits === 0) return false;
  const sourceTitleTopicHits = [...sourceTitleTerms].filter((term) => discriminativeTopicTerms.includes(term));
  // Snippets are supporting evidence, not the identity of a source. Earth
  // Science search is especially collision-prone ("Earth shelter", "Rock
  // art", coal "pore structure"), so require its candidate title to carry a
  // lesson term. Other disciplines retain their established semantic/domain
  // gates until an equivalent field proof justifies tightening them.
  if (/\b(?:earth science|geology|geological)\b/i.test(topic?.courseName || '') && sourceTitleTopicHits.length === 0) {
    return false;
  }
  // Two distinct topic-term hits clear the gate outright. A single hit — the
  // homonym trap ("bases", "independent", "matrix", "determinant", "midterm")
  // — must ALSO share a course-subject term, so an off-domain page that only
  // collides on the concept headword is rejected.
  if (topicHits < 2 && discriminativeTopicTerms.length >= 1) {
    const matchedTopicTerms = new Set(discriminativeTopicTerms.filter((term) => haystack.has(term)));
    const titleTopicHits = [...sourceTitleTerms].filter((term) => matchedTopicTerms.has(term));
    const titleExtras = [...sourceTitleTerms].filter(
      (term) => !matchedTopicTerms.has(term) && !LOW_SIGNAL_QUERY_TERMS.has(term),
    );
    // A direct one-word overview such as "Water" is useful for "Water
    // movement" without a second anchor. Once the title adds another concept
    // ("Rock art"), that extra meaning needs independent discipline support.
    if (!(titleTopicHits.length >= 1 && titleExtras.length === 0)) {
      const domainTerms = new Set(
        [...matchingCourseLexiconTerms(topic?.courseName || '')].filter((term) => !courseIdentityTerms.has(term)),
      );
      const courseTerms = domainTerms.size > 0 ? domainTerms : courseSubjectTerms(topic?.courseName || '');
      const hasIndependentCourseAnchor = [...courseTerms].some(
        (term) => !matchedTopicTerms.has(term) && haystack.has(term),
      );
      if (courseTerms.size > 0 && !hasIndependentCourseAnchor) return false;
    }
  }

  return true;
}

function sourceTopicsFromGraph(graph, { maxTopics = DEFAULT_MAX_TOPICS } = {}) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.sessions)) return [];
  const courseName = cleanText(graph.course?.name || graph.courseName || '');
  const conceptsById = new Map((graph.concepts || []).map((concept) => [concept.id, concept]));
  const taughtBySession = new Map();
  for (const edge of graph.edges?.teaches || []) {
    if (!edge?.from || !edge?.to) continue;
    if (!taughtBySession.has(edge.from)) taughtBySession.set(edge.from, []);
    const concept = conceptsById.get(edge.to);
    if (concept?.term) taughtBySession.get(edge.from).push(cleanText(concept.term));
  }
  return [...graph.sessions]
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .slice(0, maxTopics)
    .map((session, index) => {
      const section = (session.sections || [])[0] || {};
      const sectionTopic = stripSectionPrefix(section.topic);
      const lessonTitle = stripLessonPrefix(session.title);
      const topic =
        (isWeakSourceTopic(sectionTopic) ? lessonTitle : sectionTopic) || lessonTitle || `Lesson ${index + 1}`;
      const conceptTerms = (taughtBySession.get(session.id) || [])
        .filter((term) => !isWeakSourceTopic(term))
        .slice(0, 3);
      const queryParts = [topic, lessonTitle, ...conceptTerms].filter(Boolean);
      const query = cleanText(
        queryParts
          .filter((part, partIndex) => {
            const normalized = cleanText(part).toLowerCase();
            return queryParts.findIndex((candidate) => cleanText(candidate).toLowerCase() === normalized) === partIndex;
          })
          .join(' '),
      );
      return {
        courseName,
        lessonNumber: Number.isInteger(session.number) ? session.number : index + 1,
        sessionId: session.id || '',
        topic,
        query: query || topic,
      };
    })
    .filter((topic) => topic.query);
}

function sourceTopicsFromCourseMap(courseMap, { maxTopics = DEFAULT_MAX_TOPICS } = {}) {
  const courseName = cleanText(courseMap?.courseName || courseMap?.title || '');
  return (courseMap?.lessons || [])
    .slice(0, maxTopics)
    .map((lesson, index) => {
      const section = (lesson.sections || [])[0] || {};
      const sectionTopic = stripSectionPrefix(section.topicSection || section.topic);
      const lessonTitle = stripLessonPrefix(lesson.title);
      const topic = (isWeakSourceTopic(sectionTopic) ? lessonTitle : sectionTopic) || lessonTitle;
      const objective = cleanText(section.learningObjectives).slice(0, 120);
      const query = cleanText([topic, objective].join(' '));
      return {
        courseName,
        lessonNumber: index + 1,
        sessionId: '',
        topic: topic || `Lesson ${index + 1}`,
        query: query || topic || lesson.title,
      };
    })
    .filter((topic) => topic.query);
}

export function sourceTopicsFromCourse(input, options = {}) {
  return Array.isArray(input?.sessions)
    ? sourceTopicsFromGraph(input, options)
    : sourceTopicsFromCourseMap(input, options);
}

function providerPlan(courseName, topic) {
  const text = `${courseName} ${topic.topic} ${topic.query}`.toLowerCase();
  const isEducation = /\b(education|teaching|learning|classroom|pedagogy|assessment|psychology)\b/.test(text);
  const isHistory = /\b(history|civilization|ancient|medieval|modern|war|empire|colonial|revolution|archive)\b/.test(
    text,
  );
  const isTextbookish = /\b(literature|writing|textbook|reading|philosophy|theory)\b/.test(text);
  if (isEducation) return { primary: ['openalex', 'eric', 'crossref'], secondary: ['wikipedia', 'openlibrary'] };
  if (isHistory) return { primary: ['loc', 'internetarchive', 'wikipedia'], secondary: ['crossref', 'openalex'] };
  if (isTextbookish) return { primary: ['openalex', 'crossref', 'openlibrary'], secondary: ['wikipedia'] };
  return { primary: ['openalex', 'crossref', 'wikipedia'], secondary: ['openlibrary', 'loc', 'internetarchive'] };
}

function providerFunctions(overrides = {}) {
  return {
    openalex: overrides.openalex || overrides.searchScholarlyReadings || searchScholarlyReadings,
    crossref: overrides.crossref || overrides.searchCrossrefWorks || searchCrossrefWorks,
    eric: overrides.eric || overrides.searchEducationResearch || searchEducationResearch,
    wikipedia: overrides.wikipedia || overrides.searchWikipediaPages || searchWikipediaPages,
    loc: overrides.loc || overrides.searchLibraryOfCongress || searchLibraryOfCongress,
    internetarchive: overrides.internetarchive || overrides.searchInternetArchiveTexts || searchInternetArchiveTexts,
    openlibrary: overrides.openlibrary || overrides.searchBookMetadata || searchBookMetadata,
    ...overrides,
  };
}

// v0.16.1: fold the course name into the query for EVERY provider. The
// Linear Algebra field run proved what an unanchored fallback does: Wikipedia
// searched bare "Independent sets Linear independence" and shipped
// "Independent politician"; "Bases Dimension Coordinates" shipped "Lewis
// acids and bases" and "List of Pakistan Air Force bases"; "Midterm" shipped
// "2025 Philippine general election". Only OpenAlex was anchored before.
function anchoredQuery(query, courseName) {
  const q = cleanText(query);
  const anchor = cleanText(courseName);
  if (!anchor) return q;
  if (q.toLowerCase().includes(anchor.toLowerCase())) return q;
  return cleanText(`${q} ${anchor}`);
}

async function callProvider(providerName, fn, topic, { courseName, signal } = {}) {
  if (typeof fn !== 'function') return [];
  const query = anchoredQuery(topic.query, courseName);
  const limit = providerName === 'openalex' || providerName === 'crossref' ? 3 : 2;
  try {
    if (providerName === 'openalex') return await fn(topic.query, { limit, signal, anchor: courseName });
    if (providerName === 'openlibrary') return await fn(`${courseName} ${topic.topic}`, { limit: 1, signal });
    return await fn(query, { limit, signal });
  } catch {
    return [];
  }
}

function normalizeSource(raw, topic) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.title);
  const url = cleanText(raw.url);
  if (!title || !url) return null;
  return {
    provider: cleanText(raw.provider || 'unknown'),
    kind: cleanText(raw.kind || 'source'),
    title,
    authors: cleanText(raw.authors),
    year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : null,
    url,
    doi: cleanText(raw.doi),
    license: cleanText(raw.license || 'public metadata; source rights may vary'),
    attribution: cleanText(raw.attribution || PROVIDER_LABELS[raw.provider] || raw.provider || 'Open source metadata'),
    snippet: compactSnippet(raw.snippet || raw.abstract || raw.description || raw.summary),
    primaryTopic: raw.primaryTopic || null,
    topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 3) : [],
    query: topic.query,
  };
}

function scoreSource(source, topic) {
  const queryTerms = new Set(termsFromText(`${topic.topic} ${topic.query}`) || []);
  const haystack = new Set(termsFromText(`${source.title} ${source.snippet}`) || []);
  let hits = 0;
  for (const term of queryTerms) if (haystack.has(term)) hits += 1;
  const providerScore = PROVIDER_PRIORITY[source.provider] || 30;
  const licenseScore = isLicenseAmbiguous(source.license) ? -28 : 28;
  // For K-12 foundations, a licensed encyclopedia overview is usually a
  // better student-facing starting point than a narrowly scoped research
  // article with the same keywords. The relevance gate still runs first, so
  // this preference cannot rescue an off-topic Wikipedia result.
  const foundationalBackgroundScore =
    /\b(?:middle school|elementary school|grades?\s*[1-9](?:\s*[-–]\s*1?[0-2])?|k\s*[-–]\s*12)\b/i.test(
      topic?.courseName || '',
    ) && source.provider === 'wikipedia'
      ? 36
      : 0;
  return (
    providerScore +
    licenseScore +
    foundationalBackgroundScore +
    hits * 8 +
    (source.snippet ? 3 : 0) +
    (source.year ? 1 : 0)
  );
}

function dedupeAndRankSources(rawSources, topic, limit) {
  const byKey = new Map();
  const courseContext = {
    course: { name: topic.courseName || '' },
    courseName: topic.courseName || '',
    sessions: [{ title: `Lesson ${topic.lessonNumber || ''}: ${topic.topic || topic.query || ''}` }],
  };
  for (const raw of rawSources) {
    const source = normalizeSource(raw, topic);
    if (!source) continue;
    if (!sourcePassesTopicalFit(source, topic)) continue;
    if (isCourseAwareWeakSource(sourceFinderCandidateForReview(source, topic), courseContext)) continue;
    const key = source.url.toLowerCase() || source.title.toLowerCase();
    const scored = { ...source, score: scoreSource(source, topic) };
    const existing = byKey.get(key);
    if (!existing || scored.score > existing.score) byKey.set(key, scored);
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        Number(!isLicenseAmbiguous(b.license)) - Number(!isLicenseAmbiguous(a.license)) ||
        b.score - a.score ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit)
    .map(({ score, ...source }) => source);
}

async function retrieveTopicSources(topic, options = {}) {
  const { courseName, providers, limitPerTopic = DEFAULT_LIMIT_PER_TOPIC, signal, minUsefulSources = 2 } = options;
  const fns = providerFunctions(providers);
  const plan = providerPlan(courseName, topic);
  const rawSources = [];

  let rateLimited = false;
  const primary = await Promise.allSettled(
    plan.primary.map(async (name) => callProvider(name, fns[name], topic, { courseName, signal })),
  );
  for (const settled of primary) {
    if (settled.status !== 'fulfilled') continue;
    if (settled.value?.rateLimited) rateLimited = true;
    rawSources.push(...(settled.value || []));
  }

  let sources = dedupeAndRankSources(rawSources, topic, limitPerTopic);
  if (sources.length < minUsefulSources || !sources.some((source) => !isLicenseAmbiguous(source.license))) {
    const secondary = await Promise.allSettled(
      plan.secondary.map(async (name) => callProvider(name, fns[name], topic, { courseName, signal })),
    );
    for (const settled of secondary) {
      if (settled.status !== 'fulfilled') continue;
      if (settled.value?.rateLimited) rateLimited = true;
      rawSources.push(...(settled.value || []));
    }
    sources = dedupeAndRankSources(rawSources, topic, limitPerTopic);
  }

  const oerSearch = oerCommonsSearchLink(topic.query);
  return {
    sources,
    searchLinks: oerSearch ? [oerSearch] : [],
    providerPlan: plan,
    // v0.16.1: a topic retrieved while a provider was rate-limiting is a
    // DEGRADED result — findCourseSources must not cache it for the ISO week
    // (the Linear Algebra run served 429-degraded junk as cacheHit:true on
    // every re-run for a week).
    degraded: rateLimited,
  };
}

export async function findCourseSources(input, options = {}) {
  const {
    maxTopics = DEFAULT_MAX_TOPICS,
    limitPerTopic = DEFAULT_LIMIT_PER_TOPIC,
    storage,
    signal,
    providers,
    date = new Date(),
    minUsefulSources = 2,
    topicConcurrency = 2,
    onProgress,
    timeoutMs = 12_000,
  } = options;
  const topics = sourceTopicsFromCourse(input, { maxTopics });
  const courseName = cleanText(topics[0]?.courseName || input?.course?.name || input?.courseName || 'Untitled Course');
  const week = isoWeekStamp(date);
  const results = new Array(topics.length);
  let nextTopicIndex = 0;
  let completedTopics = 0;
  const workerCount = Math.max(1, Math.min(topics.length || 1, Number(topicConcurrency) || 1));
  const deadlineController = new AbortController();
  const lookupSignal = deadlineController.signal;
  let timedOut = false;
  let stopped = false;
  let releaseStop;
  const stopPromise = new Promise((resolve) => {
    releaseStop = resolve;
  });
  const stop = (reason) => {
    if (stopped) return;
    stopped = true;
    timedOut = reason === 'timeout';
    deadlineController.abort(reason);
    releaseStop();
  };
  const onExternalAbort = () => stop('aborted');
  if (signal?.aborted) onExternalAbort();
  else signal?.addEventListener?.('abort', onExternalAbort, { once: true });
  const timeout =
    Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? setTimeout(() => stop('timeout'), Number(timeoutMs))
      : null;

  async function retrieveNextTopic() {
    while (!lookupSignal.aborted && nextTopicIndex < topics.length) {
      const index = nextTopicIndex;
      nextTopicIndex += 1;
      const topic = topics[index];
      const key = cacheKey({ courseName, query: topic.query, week });
      const cached = cacheGet(key, storage);
      if (cached?.sources) {
        results[index] = { ...topic, ...cached, cacheHit: true };
        completedTopics += 1;
        try {
          onProgress?.({ completed: completedTopics, total: topics.length, lesson: topic.lessonNumber, cached: true });
        } catch {
          /* progress narration is best-effort */
        }
        continue;
      }
      const retrieved = await retrieveTopicSources(topic, {
        courseName,
        providers,
        limitPerTopic,
        signal: lookupSignal,
        minUsefulSources,
      });
      if (lookupSignal.aborted) break;
      const cachedValue = {
        sources: retrieved.sources,
        searchLinks: retrieved.searchLinks,
        providerPlan: retrieved.providerPlan,
      };
      if (!retrieved.degraded) cacheSet(key, cachedValue, storage);
      results[index] = { ...topic, ...cachedValue, cacheHit: false, degraded: Boolean(retrieved.degraded) };
      completedTopics += 1;
      try {
        onProgress?.({ completed: completedTopics, total: topics.length, lesson: topic.lessonNumber, cached: false });
      } catch {
        /* progress narration is best-effort */
      }
    }
  }

  const workers = Promise.all(Array.from({ length: workerCount }, () => retrieveNextTopic()));
  // Source retrieval is additive. A provider that ignores AbortSignal must
  // not hold a fully authored course hostage, so the global deadline races
  // the workers as well as aborting normal fetches. Late workers only retain
  // local data; the returned mini-shard is already isolated from them.
  await Promise.race([workers, stopPromise]);
  workers.catch(() => {});
  if (timeout) clearTimeout(timeout);
  signal?.removeEventListener?.('abort', onExternalAbort);

  const settledTopics = topics.map((topic, index) =>
    results[index]
      ? results[index]
      : {
          ...topic,
          sources: [],
          searchLinks: [],
          providerPlan: providerPlan(courseName, topic),
          cacheHit: false,
          degraded: true,
          timedOut,
        },
  );

  return {
    id: `${SOURCE_FINDER_VERSION}:${stableHash(`${courseName}:${week}`)}`,
    version: SOURCE_FINDER_VERSION,
    origin: SOURCE_FINDER_ORIGIN,
    temporary: true,
    courseName,
    cacheWeek: week,
    topics: settledTopics,
    stats: {
      topics: settledTopics.length,
      topicsWithSources: settledTopics.filter((topic) => (topic.sources || []).length > 0).length,
      sources: settledTopics.reduce((count, topic) => count + (topic.sources || []).length, 0),
      cacheHits: settledTopics.filter((topic) => topic.cacheHit).length,
      timedOut,
      completedTopics,
    },
  };
}

function existingCitations(graph) {
  return new Set(
    (graph?.resources || []).map((resource) => cleanText(resource?.citation).toLowerCase()).filter(Boolean),
  );
}

function nextResourceIdFactory(graph) {
  const taken = new Set();
  for (const collection of ['concepts', 'outcomes', 'assessments', 'sessions', 'resources']) {
    for (const entity of graph?.[collection] || []) if (entity?.id) taken.add(entity.id);
  }
  let counter = 0;
  return () => {
    let id;
    do {
      counter += 1;
      id = `sf${counter}`;
    } while (taken.has(id));
    taken.add(id);
    return id;
  };
}

function sourceCitation(source) {
  const authors = cleanText(source.authors || source.attribution || PROVIDER_LABELS[source.provider] || 'Open source');
  const year = source.year ? ` (${source.year})` : '';
  const provider = PROVIDER_LABELS[source.provider] || cleanText(source.attribution) || source.provider;
  const license = cleanText(source.license);
  const licenseTail = license ? ` (${license})` : '';
  return `${authors}${year}. ${source.title}. ${provider}: ${source.url}${licenseTail}`;
}

function sourceFinderCourseContext(graph, miniShard) {
  return {
    course: { name: miniShard?.courseName || graph?.course?.name || graph?.courseName || graph?.title || '' },
    courseName: miniShard?.courseName || graph?.course?.name || graph?.courseName || graph?.title || '',
    sessions: graph?.sessions || [],
  };
}

function sourceFinderCandidateForReview(source = {}, topic = {}) {
  return {
    ...source,
    id: source.sourceRefId || source.id || '',
    origin: SOURCE_FINDER_ORIGIN,
    sourceType: source.kind || 'source-finder source',
    evidence: source.snippet || source.abstract || source.evidence || topic.topic,
    conceptLinks: topic.topic ? [{ label: topic.topic }] : [],
  };
}

function attachableTopicSources(graph, miniShard, topic) {
  const courseContext = sourceFinderCourseContext(graph, miniShard);
  const topicWithCourse = {
    ...topic,
    courseName: miniShard?.courseName || topic?.courseName || courseContext.courseName || '',
  };
  return (topic.sources || []).filter(
    (source) =>
      (source?.url || source?.doi) &&
      !isLicenseAmbiguous(source?.license) &&
      // Cached shards already passed query-level ranking. Re-run the durable
      // discipline boundary here so an old cache cannot restore a known
      // cross-domain false friend, while preserving valid adjacent concepts
      // such as A/B testing attached to a UX test-planning lesson.
      sourcePassesDisciplineAnchor(source, topicWithCourse) &&
      !detectForeignLanguageTeachingContent({
        courseIdentity: miniShard?.courseName || topic?.courseName || '',
        text: sourceContext(source),
      }) &&
      !isCourseAwareWeakSource(sourceFinderCandidateForReview(source, topic), courseContext),
  );
}

export function attachSourceFinderResources(graph, miniShard, { maxSourcesPerTopic = 1 } = {}) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.resources)) return 0;
  if (!miniShard || !Array.isArray(miniShard.topics)) return 0;
  const sessionsById = new Map((graph.sessions || []).map((session) => [session.id, session]));
  const sessionsByNumber = new Map((graph.sessions || []).map((session) => [session.number, session]));
  const seen = existingCitations(graph);
  const nextId = nextResourceIdFactory(graph);
  let attached = 0;

  graph.sourceFinderMiniShard = miniShard;

  for (const topic of miniShard.topics) {
    const session = sessionsById.get(topic.sessionId) || sessionsByNumber.get(topic.lessonNumber);
    if (!session) continue;
    const section = (session.sections || [])[0];
    if (!section) continue;
    for (const source of attachableTopicSources(graph, miniShard, topic).slice(0, maxSourcesPerTopic)) {
      const citation = sourceCitation(source);
      if (!citation || seen.has(citation.toLowerCase())) continue;
      const resource = {
        id: nextId(),
        citation,
        kind: source.kind || 'source',
        sessionRefs: session.id ? [session.id] : [],
        origin: SOURCE_FINDER_ORIGIN,
        provider: source.provider,
        title: source.title,
        authors: source.authors,
        year: source.year,
        url: source.url,
        doi: source.doi,
        license: source.license,
        attribution: source.attribution,
        snippet: source.snippet,
        primaryTopic: source.primaryTopic,
        topics: source.topics,
        sourceFinderTopic: topic.topic,
      };
      graph.resources.push(resource);
      if (!Array.isArray(section.resourceRefs)) section.resourceRefs = [];
      if (!section.resourceRefs.includes(resource.id)) section.resourceRefs.push(resource.id);
      seen.add(citation.toLowerCase());
      attached += 1;
    }
  }
  return attached;
}

export function shouldRunSourceFinder(coverage, { minGenomeCoverage = 0.5 } = {}) {
  if (!coverage || !Number.isFinite(coverage.sessions) || coverage.sessions <= 0) return false;
  if ((coverage.resourcesByOrigin || {})[SOURCE_FINDER_ORIGIN] > 0) return false;
  const genomeRatio = coverage.genomeLinkedLessons / coverage.sessions;
  if (genomeRatio < minGenomeCoverage) return true;
  return coverage.openResources < Math.max(1, Math.ceil(coverage.sessions * 0.5));
}
