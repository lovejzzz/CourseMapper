/**
 * knowledge/readingListEngine.js — v0.13.5 P2: real readings in every lesson.
 *
 * Retires the "Instructor-provided course materials" placeholder class by
 * attaching Resource entities to the Course Graph from two sources:
 *
 *  1. DETERMINISTIC (no network): every genome-linked lesson cites its
 *     anchor sections (the OpenStax/OER § the kernel quotes were admitted
 *     from). These come straight from conceptProvenance — zero cost,
 *     always available, always first in the list.
 *  2. RUNTIME (optional, cached, keyless): one open-access peer-reviewed
 *     reading per lesson from OpenAlex, plus course-level book metadata
 *     from Open Library. Failures degrade to nothing — the compiled
 *     course never blocks on the network.
 *
 * Resources land as graph entities ({ id, citation, kind, sessionRefs,
 * origin, url, license, attribution }) with section resourceRefs, so the
 * course-map render, the blueprint compiler (approvedSources, lesson-plan
 * materials, study guides), and the syllabus appendix all pick them up
 * through the existing supportingResources path — one write, every surface.
 */

import { searchScholarlyReadings, searchBookMetadata } from './providers.js';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Known open publishers: map the citation labels composeLessonFromConcepts
 * produces (e.g. "OpenStax astronomy 2e §2.1") to a canonical book URL and
 * license. OpenStax titles resolve generically by slug; non-OpenStax OER
 * books are registered explicitly.
 */
const OER_BOOK_REGISTRY = [
  {
    match: /human nutrition/i,
    url: 'https://pressbooks.oer.hawaii.edu/humannutrition2/',
    license: 'CC BY 4.0',
    attribution: "University of Hawai'i at Mānoa Food Science and Human Nutrition Program",
  },
];

/**
 * Genome anchor srcs use short book slugs; some OpenStax catalog slugs carry
 * a "principles-" prefix the shards omit. Verified against openstax.org by
 * scripts/knowledgeAudit.mjs — extend BOTH places together.
 */
export const OPENSTAX_SLUG_ALIASES = {
  'microeconomics-3e': 'principles-microeconomics-3e',
  'macroeconomics-2e': 'principles-macroeconomics-2e',
  statistics: 'introductory-statistics-2e',
};

export function openStaxBookUrl(slug) {
  return `https://openstax.org/books/${OPENSTAX_SLUG_ALIASES[slug] || slug}`;
}

function openTextbookUrl(label) {
  const registered = OER_BOOK_REGISTRY.find((entry) => entry.match.test(label));
  if (registered) return { url: registered.url, license: registered.license, attribution: registered.attribution };
  const openstax = label.match(/^OpenStax\s+(.+?)(?:\s+§.*)?$/i);
  if (openstax) {
    const slug = openstax[1].toLowerCase().trim().replace(/\s+/g, '-');
    return { url: openStaxBookUrl(slug), license: 'CC BY 4.0', attribution: `OpenStax, Rice University` };
  }
  return { url: '', license: 'open license (see source)', attribution: label };
}

function sessionsByNumber(graph) {
  const map = new Map();
  for (const session of graph?.sessions || []) {
    if (Number.isInteger(session?.number)) map.set(session.number, session);
  }
  return map;
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
      id = `kr${counter}`;
    } while (taken.has(id));
    taken.add(id);
    return id;
  };
}

function attachResource(graph, session, resource) {
  graph.resources.push(resource);
  const section = (session?.sections || [])[0];
  if (section) {
    if (!Array.isArray(section.resourceRefs)) section.resourceRefs = [];
    section.resourceRefs.push(resource.id);
    if (session?.id) resource.sessionRefs = [session.id];
  }
}

/**
 * Deterministic pass: genome anchor sections → Resource entities.
 * Reads conceptProvenance from the enrichment overlay's per-lesson payloads
 * (the same payloads the compiler consumes). Idempotent: citations already
 * present on the graph are not re-added. Returns the count attached.
 */
export function attachGenomeResources(graph) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.resources)) return 0;
  const lessonContent = graph.enrichmentOverlay?.lessonContent;
  if (!lessonContent || typeof lessonContent !== 'object') return 0;

  const byNumber = sessionsByNumber(graph);
  const seen = existingCitations(graph);
  const nextId = nextResourceIdFactory(graph);
  let attached = 0;

  for (const [key, payload] of Object.entries(lessonContent)) {
    const numberMatch = String(key).match(/^lesson-(\d+)$/);
    const session = numberMatch ? byNumber.get(Number(numberMatch[1])) : null;
    if (!session || !payload || typeof payload !== 'object') continue;
    const labels = [
      ...(payload.conceptProvenance?.citations || []),
      ...(payload.keyTerms || []).map((term) => term?.source),
    ]
      .map(cleanText)
      .filter(Boolean);
    for (const label of [...new Set(labels)].slice(0, 2)) {
      const { url, license, attribution } = openTextbookUrl(label);
      const citation = `${label} (open textbook, ${license}${url ? ` — ${url}` : ''})`;
      if (seen.has(citation.toLowerCase()) || seen.has(label.toLowerCase())) continue;
      seen.add(citation.toLowerCase());
      attachResource(graph, session, {
        id: nextId(),
        citation,
        kind: 'textbook section',
        sessionRefs: [],
        origin: 'genome',
        url,
        license,
        attribution,
      });
      attached += 1;
    }

    // V0.14 P1: cited prerequisite primers — the genome filling a gap the
    // course assumes but never teaches. One resource per primer, marked so
    // the lesson plan and appendix render it as a "needed background" item.
    for (const primer of payload.prerequisitePrimers || []) {
      const { url, license, attribution } = openTextbookUrl(cleanText(primer.source));
      const definition = cleanText(primer.definition);
      const citation = `Prerequisite primer — ${cleanText(primer.prerequisiteTerm)}: ${definition}${
        primer.source ? ` (${cleanText(primer.source)})` : ''
      }`;
      if (seen.has(citation.toLowerCase())) continue;
      seen.add(citation.toLowerCase());
      attachResource(graph, session, {
        id: nextId(),
        citation,
        kind: 'prerequisite primer',
        sessionRefs: [],
        origin: 'genome-prerequisite',
        url,
        license,
        attribution,
      });
      attached += 1;
    }
  }
  return attached;
}

function readingQueryForSession(graph, session) {
  const teaches = (graph.edges?.teaches || []).filter((edge) => edge?.from === session.id);
  const conceptsById = new Map((graph.concepts || []).map((concept) => [concept.id, concept]));
  const terms = teaches
    .map((edge) => conceptsById.get(edge.to))
    .map((concept) => cleanText(concept?.term || concept?.title || concept?.name))
    .filter(Boolean);
  return terms[0] || cleanText(session.title).replace(/^Lesson \d+:?\s*/i, '');
}

function formatScholarlyCitation(work) {
  const authors = work.authors || 'OpenAlex';
  const year = work.year ? ` (${work.year})` : '';
  return `${authors}${year}. ${work.title}. Open-access via ${work.url} (${work.license})`;
}

/**
 * Runtime pass: one open-access peer-reviewed reading per session (OpenAlex)
 * and course-level book metadata (Open Library). All fetches run through the
 * cached, degrading provider layer; this never throws. Returns the count
 * attached.
 */
export async function attachOpenReadings(graph, { providers = {}, signal, maxSessions = 24 } = {}) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.resources)) return 0;
  const fetchReadings = providers.searchScholarlyReadings || searchScholarlyReadings;
  const fetchBooks = providers.searchBookMetadata || searchBookMetadata;
  const sessions = [...(graph.sessions || [])].sort((a, b) => (a.number || 0) - (b.number || 0)).slice(0, maxSessions);
  const seen = existingCitations(graph);
  const nextId = nextResourceIdFactory(graph);
  let attached = 0;

  const lessonResults = await Promise.allSettled(
    sessions.map(async (session) => {
      const query = readingQueryForSession(graph, session);
      if (!query) return { session, works: [] };
      const works = await fetchReadings(query, { limit: 1, signal });
      return { session, works };
    }),
  );
  for (const settled of lessonResults) {
    if (settled.status !== 'fulfilled') continue;
    const { session, works } = settled.value;
    const work = (works || [])[0];
    if (!work?.title || !work?.url) continue;
    const citation = formatScholarlyCitation(work);
    if (seen.has(citation.toLowerCase())) continue;
    seen.add(citation.toLowerCase());
    attachResource(graph, session, {
      id: nextId(),
      citation,
      kind: 'peer-reviewed reading',
      sessionRefs: [],
      origin: 'openalex',
      url: work.url,
      license: work.license || 'open access',
      attribution: work.attribution || 'OpenAlex (CC0 metadata)',
    });
    attached += 1;
  }

  // Course-level book metadata for the syllabus Required Texts / appendix —
  // a graph-level resource (no section ref; the trust surface renders it).
  try {
    const books = await fetchBooks(cleanText(graph.course?.name), { limit: 1, signal });
    const book = (books || [])[0];
    if (book?.title) {
      const citation = `${book.authors || 'Various'}${book.year ? ` (${book.year})` : ''}. ${book.title}.${
        book.publisher ? ` ${book.publisher}.` : ''
      }${book.isbn ? ` ISBN ${book.isbn}.` : ''} ${book.url}`;
      if (!seen.has(citation.toLowerCase())) {
        graph.resources.push({
          id: nextId(),
          citation,
          kind: 'book',
          sessionRefs: [],
          origin: 'openlibrary',
          url: book.url,
          license: book.license || 'Open Library public metadata',
          attribution: book.attribution || 'Open Library, Internet Archive',
        });
        attached += 1;
      }
    }
  } catch {
    /* book metadata is optional */
  }
  return attached;
}

/** Coverage summary for the trust surface (digest, manifest, trust strip). */
export function knowledgeCoverage(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const sessions = graph.sessions || [];
  const resources = graph.resources || [];
  const lessonContent = graph.enrichmentOverlay?.lessonContent || {};
  const sessionIdsWithResources = new Set(
    resources.flatMap((resource) => (Array.isArray(resource.sessionRefs) ? resource.sessionRefs : [])),
  );
  const genomeLessons = Object.values(lessonContent).filter(
    (payload) => payload?.conceptProvenance?.source === 'genome-linked',
  ).length;
  const citedResources = resources.filter((resource) =>
    ['genome', 'genome-prerequisite', 'openalex', 'openlibrary'].includes(resource.origin),
  );
  return {
    sessions: sessions.length,
    genomeLinkedLessons: genomeLessons,
    sessionsWithResources: sessionIdsWithResources.size,
    openResources: citedResources.length,
    resourcesByOrigin: citedResources.reduce((counts, resource) => {
      counts[resource.origin] = (counts[resource.origin] || 0) + 1;
      return counts;
    }, {}),
  };
}
