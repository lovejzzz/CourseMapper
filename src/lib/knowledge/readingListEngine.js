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
    // V0.14.1 D1: strip HTML tags so markup never reaches a citation/syllabus.
    .replace(/<[^>]+>/g, ' ')
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
  // V0.14.1 4.8: drop the "(see source)" placeholder — the appendix already
  // names the origin; an unregistered open source is just "open license".
  return { url: '', license: 'open license', attribution: label };
}

/**
 * V0.14.1 4.8: humanize a raw genome shard key into a readable citation title.
 * Shard reference keys look like "writing about literature:reference §1" — the
 * key is an internal identifier, never a title. Strip the ":reference §N"
 * suffix and title-case the remainder.
 *   "writing about literature:reference §1" → "Writing About Literature (open textbook)"
 */
function titleCaseWords(text) {
  return cleanText(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isShardKeyLabel(label) {
  // OpenStax / OER book labels ("OpenStax astronomy 2e §2.1") carry no colon;
  // shard reference keys do ("…:reference §N", "…:something §N").
  if (/:reference\b/i.test(label)) return true;
  return /\S:\S/.test(label) && /§/.test(label) && !/:\/\//.test(label);
}

function humanizeShardKey(label) {
  const base = cleanText(label)
    .replace(/:reference\b.*$/i, '')
    .replace(/:[\w-]+\s*§.*$/i, '')
    .replace(/\s*§\s*\d.*$/, '')
    .trim();
  return `${titleCaseWords(base || label)} (open textbook)`;
}

/**
 * V0.14.1 4.8: resolve a genome citation entry to a rendered citation.
 * Accepts either a plain string label (current shard data) or an object
 * carrying `{ displayTitle, sourceUrl, key }` (foundry manifest, added later).
 * Display metadata is always PREFERRED when present; otherwise a shard-key
 * label is humanized and a book label is rendered as-is. Never repeats the
 * raw key inside one citation and never emits the "(see source)" placeholder.
 */
function resolveGenomeCitation(entry) {
  let rawLabel = '';
  let displayTitle = '';
  let sourceUrl = '';
  if (entry && typeof entry === 'object') {
    rawLabel = cleanText(entry.key || entry.text || entry.label || entry.source || '');
    displayTitle = cleanText(entry.displayTitle || '');
    sourceUrl = cleanText(entry.sourceUrl || '');
  } else {
    rawLabel = cleanText(entry);
  }
  if (!rawLabel && !displayTitle) return null;

  if (displayTitle) {
    const { url, license } = openTextbookUrl(rawLabel || displayTitle);
    const href = sourceUrl || url;
    return {
      dedupeKey: (rawLabel || displayTitle).toLowerCase(),
      citation: `${displayTitle} (open textbook, ${license}${href ? ` — ${href}` : ''})`,
      url: href,
      license,
      attribution: displayTitle,
    };
  }

  if (isShardKeyLabel(rawLabel)) {
    const humanized = humanizeShardKey(rawLabel);
    return {
      dedupeKey: rawLabel.toLowerCase(),
      citation: `${humanized}, open license`,
      url: '',
      license: 'open license',
      attribution: humanized,
    };
  }

  const { url, license, attribution } = openTextbookUrl(rawLabel);
  return {
    dedupeKey: rawLabel.toLowerCase(),
    citation: `${rawLabel} (open textbook, ${license}${url ? ` — ${url}` : ''})`,
    url,
    license,
    attribution,
  };
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
    // V0.14.1 4.8: resolve each provenance entry through resolveGenomeCitation
    // so raw shard keys ("writing about literature:reference §1") render as
    // readable titles and displayTitle metadata is preferred when present.
    const rawEntries = [
      ...(payload.conceptProvenance?.citations || []),
      ...(payload.keyTerms || []).map((term) => term?.source),
    ].filter((entry) => (entry && typeof entry === 'object') || cleanText(entry));
    const resolved = [];
    const localKeys = new Set();
    for (const entry of rawEntries) {
      const citation = resolveGenomeCitation(entry);
      if (!citation || localKeys.has(citation.dedupeKey)) continue;
      localKeys.add(citation.dedupeKey);
      resolved.push(citation);
    }
    for (const { citation, dedupeKey, url, license, attribution } of resolved.slice(0, 2)) {
      if (seen.has(citation.toLowerCase()) || seen.has(dedupeKey)) continue;
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
      const rawSource = cleanText(primer.source);
      const { url, license, attribution } = openTextbookUrl(rawSource);
      const definition = cleanText(primer.definition);
      // V0.14.1 4.8: never render a raw shard key as the source in-line.
      const sourceLabel = rawSource ? (isShardKeyLabel(rawSource) ? humanizeShardKey(rawSource) : rawSource) : '';
      const citation = `Prerequisite primer — ${cleanText(primer.prerequisiteTerm)}: ${definition}${
        sourceLabel ? ` (${sourceLabel})` : ''
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

// ── V0.14.1 citation relevance (item 2.6) ──────────────────────────────────
// The audit's single most credibility-damaging defect: the most-cited paper in
// ALL of science was attached as a weekly reading for a bare term (MNIST for
// geologic time, cancer-stats for world literature). Two layers fix it: a
// DISCIPLINE ANCHOR threaded into the search, and a local topical-relevance
// gate over the already-fetched title+abstract.

// Generic course-title words that carry no discipline signal — dropped from
// the anchor so "Introduction to Astronomy" → "Astronomy".
const ANCHOR_NOISE = new Set([
  'introduction',
  'intro',
  'introductory',
  'foundations',
  'foundation',
  'fundamentals',
  'fundamental',
  'principles',
  'basics',
  'essentials',
  'survey',
  'overview',
  'topics',
  'studies',
  'study',
  'course',
  'general',
  'applied',
  'advanced',
  'and',
  'of',
  'to',
  'the',
  'a',
  'an',
  'for',
  'in',
  'i',
  'ii',
  'iii',
]);

// Stopwords for relevance tokenization — generic words that should not count
// as a topical hit.
const RELEVANCE_STOPWORDS = new Set([
  ...ANCHOR_NOISE,
  'lesson',
  'week',
  'unit',
  'module',
  'using',
  'about',
  'with',
  'from',
  'into',
  'over',
  'this',
  'that',
  'these',
  'those',
  'your',
  'their',
  'how',
  'why',
  'what',
  'when',
  'where',
  'are',
  'its',
  'between',
]);

/** Lowercase, glue apostrophes, punctuation → space; returns a normalized string. */
function normalizeForMatch(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/['`’‘]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Significant tokens (≥4 chars, non-stopword), lightly de-pluralized. */
function significantTokens(text) {
  return normalizeForMatch(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))
    .filter((token) => token.length >= 4 && !RELEVANCE_STOPWORDS.has(token));
}

/**
 * The discipline anchor for a course: course-title tokens with generic words
 * stripped. Falls back to nothing when the course name is generic/absent — the
 * gate still works off concept + session-title terms.
 */
function courseDisciplineAnchor(graph) {
  const name = cleanText(graph?.course?.name);
  if (!name) return '';
  const tokens = normalizeForMatch(name)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !ANCHOR_NOISE.has(token));
  return tokens.join(' ');
}

function conceptTermsForSession(graph, session) {
  const teaches = (graph.edges?.teaches || []).filter((edge) => edge?.from === session.id);
  const conceptsById = new Map((graph.concepts || []).map((concept) => [concept.id, concept]));
  return teaches
    .map((edge) => conceptsById.get(edge.to))
    .map((concept) => cleanText(concept?.term || concept?.title || concept?.name))
    .filter(Boolean);
}

function readingQueryForSession(graph, session) {
  // Arg1 to the provider stays the bare concept term (the discipline anchor is
  // applied at the provider boundary so the OpenAlex `search=` string carries
  // it without coupling the query to the gate's term set).
  const terms = conceptTermsForSession(graph, session);
  return terms[0] || cleanText(session.title).replace(/^Lesson \d+:?\s*/i, '');
}

/**
 * Assemble the term set used by the relevance gate: concept terms (the strong
 * topical signal), the session title (sans "Lesson N:"), and the course
 * discipline anchor. Multi-word terms also become phrases for substring match.
 */
function relevanceTermsForSession(graph, session, anchor) {
  const conceptTerms = conceptTermsForSession(graph, session);
  const sessionTitle = cleanText(session.title).replace(/^Lesson \d+:?\s*/i, '');
  const conceptTokens = new Set();
  const allTokens = new Set();
  const phrases = [];
  const strongConceptTokens = new Set();

  for (const term of conceptTerms) {
    const tokens = significantTokens(term);
    for (const token of tokens) {
      conceptTokens.add(token);
      allTokens.add(token);
      if (token.length >= 6) strongConceptTokens.add(token);
    }
    const phrase = normalizeForMatch(term);
    if (phrase.includes(' ')) phrases.push(phrase);
  }
  for (const token of significantTokens(sessionTitle)) allTokens.add(token);
  const titlePhrase = normalizeForMatch(sessionTitle);
  if (titlePhrase.includes(' ')) phrases.push(titlePhrase);
  for (const token of significantTokens(anchor)) allTokens.add(token);

  return { conceptTokens, allTokens, strongConceptTokens, phrases };
}

/**
 * Score a candidate work's topical relevance against the lesson's term set.
 * Returns { hits, phraseHit, strongConceptHit, pass }.
 *
 * Threshold (calibrated against the audit fixtures): a work passes when it
 *   (a) contains a multi-word concept/title PHRASE, OR
 *   (b) hits ≥2 DISTINCT query tokens, OR
 *   (c) hits ≥1 STRONG (≥6-char) concept token — the topical handle for
 *       legitimately single-word lessons ("Carbohydrates", "Inflammation").
 * The audit's off-topic papers (MNIST, global-cancer-statistics,
 * QUANTUM-ESPRESSO, hypertension guidelines) share ZERO concept tokens with
 * their mis-assigned lessons, so they fail all three clauses; Horton 1945
 * ("…STREAMS AND THEIR DRAINAGE BASINS…") hits stream/drainage/basin and the
 * "drainage basin" phrase, so it passes.
 */
export function scoreReadingRelevance(work, terms) {
  const { allTokens = new Set(), strongConceptTokens = new Set(), phrases = [] } = terms || {};
  const contentNorm = normalizeForMatch(`${work?.title || ''} ${work?.abstract || ''}`);
  const contentTokens = new Set(significantTokens(contentNorm));

  let hits = 0;
  for (const token of allTokens) if (contentTokens.has(token)) hits += 1;
  let strongConceptHit = false;
  for (const token of strongConceptTokens) if (contentTokens.has(token)) strongConceptHit = true;
  const phraseHit = phrases.some((phrase) => phrase && contentNorm.includes(phrase));

  return { hits, phraseHit, strongConceptHit, pass: phraseHit || hits >= 2 || strongConceptHit };
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
  const anchor = courseDisciplineAnchor(graph);
  // V0.14.1 2.6: decisions the gate makes are recorded on the graph so the
  // trust surface / telemetry can log them (the return shape stays a count,
  // which existing callers depend on).
  if (!Array.isArray(graph.readingListDecisions)) graph.readingListDecisions = [];
  const decisions = graph.readingListDecisions;
  let attached = 0;

  const lessonResults = await Promise.allSettled(
    sessions.map(async (session) => {
      const query = readingQueryForSession(graph, session);
      if (!query) return { session, works: [] };
      // V0.14.1 B: request several candidates (per relevance ranking) and
      // anchor the search to the course discipline, so the gate has on-topic
      // options to choose from.
      const works = await fetchReadings(query, { limit: 6, signal, anchor });
      return { session, works };
    }),
  );
  for (const settled of lessonResults) {
    if (settled.status !== 'fulfilled') continue;
    const { session, works } = settled.value;
    const candidates = (works || []).filter((work) => work?.title && work?.url);
    if (candidates.length === 0) continue;

    // V0.14.1 2.6: topical-relevance gate. Score every candidate; keep the
    // best passing one (tie-break by citation count); if none passes, attach
    // NOTHING and record why — no more MNIST-for-geology attachments.
    const terms = relevanceTermsForSession(graph, session, anchor);
    const scored = candidates
      .map((work) => ({ work, score: scoreReadingRelevance(work, terms) }))
      .filter((entry) => entry.score.pass)
      .sort(
        (a, b) =>
          b.score.hits - a.score.hits ||
          Number(b.score.phraseHit) - Number(a.score.phraseHit) ||
          (b.work.citedBy || 0) - (a.work.citedBy || 0),
      );
    if (scored.length === 0) {
      decisions.push({
        type: 'no-relevant-reading',
        lesson: session.number ?? null,
        sessionId: session.id ?? null,
        rejected: candidates.length,
        candidates: candidates.slice(0, 4).map((work) => work.title),
        message: `no relevant open reading found for L${session.number ?? '?'} (rejected ${candidates.length} famous-but-off-topic)`,
      });
      continue;
    }
    const work = scored[0].work;
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
