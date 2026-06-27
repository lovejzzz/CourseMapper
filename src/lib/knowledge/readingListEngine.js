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
import { isLicenseAmbiguous } from './sourceLedger.js';
// V0.14.1 round-2: the same discipline inference the genome linker uses maps
// the course onto an OpenAlex field/domain allowlist (no import cycle —
// libraryShardLoader imports nothing from knowledge/).
import { inferCourseDisciplines } from '../genome/libraryShardLoader.js';
// v0.14.3 round-2 FIX-1: the famous-offender blacklist + matcher + shared yield
// rule are single-sourced in the quality library so the engine REJECTS a known
// offender at ATTACH time (defense-in-depth caught it at grading, but the
// engine still attached it — e.g. the stats cancer-statistics paper that passes
// the Medicine/Health-Science topic field and the "statistics" token gate).
// Plain ESM, no node builtins — safe to import here.
import { matchesKnownOffender, blacklistYieldsToTopicalOverlap } from '../quality/artifactDefectPatterns.js';

function cleanText(value) {
  return (
    String(value ?? '')
      // V0.14.1 D1: strip HTML tags so markup never reaches a citation/syllabus.
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
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
// v0.14.3 (license-repetition product fix): a fully-linked course (e.g. astro
// 14/14) emits one genome citation per section, and EVERY one rendered the full
// "(open textbook, CC BY 4.0 — https://openstax.org/books/…)" license string —
// so a 14–17-citation Sources & Licenses section repeated the 8-word shingle
// "open textbook cc by 4 0 https openstax" 14–17× and tripped the export
// repeated-phrase gate (limit 12). The license + source-base are stated INLINE
// on the first citation of each license group and the rest abbreviate to
// "<title> (open textbook)" — the §-section in the title still uniquely names
// the source, and the per-group license note (Required Texts) carries the
// license/url once. `abbreviateLicense` requests the short form.
function resolveGenomeCitation(entry, { abbreviateLicense = false } = {}) {
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

  // The license-group key: the license + the source base (book URL sans the
  // §-section suffix), so all citations of one open textbook collapse to one
  // inline license statement. Empty when there's no resolvable textbook URL.
  const licenseGroupKey = (url, license) =>
    url ? `${cleanText(license).toLowerCase()}|${url.replace(/[#§].*$/, '')}` : '';

  if (displayTitle) {
    const { url, license } = openTextbookUrl(rawLabel || displayTitle);
    const href = sourceUrl || url;
    const tail = abbreviateLicense ? ' (open textbook)' : ` (open textbook, ${license}${href ? ` — ${href}` : ''})`;
    return {
      dedupeKey: (rawLabel || displayTitle).toLowerCase(),
      citation: `${displayTitle}${tail}`,
      url: href,
      license,
      attribution: displayTitle,
      licenseGroupKey: licenseGroupKey(href, license),
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
      licenseGroupKey: '',
    };
  }

  const { url, license, attribution } = openTextbookUrl(rawLabel);
  const tail = abbreviateLicense ? ' (open textbook)' : ` (open textbook, ${license}${url ? ` — ${url}` : ''})`;
  return {
    dedupeKey: rawLabel.toLowerCase(),
    citation: `${rawLabel}${tail}`,
    url,
    license,
    attribution,
    licenseGroupKey: licenseGroupKey(url, license),
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
  // v0.14.3 license-repetition fix: course-level set of license groups already
  // rendered with their full inline license. The first citation of each open
  // textbook states the license + URL; the rest abbreviate to "(open textbook)"
  // so the Sources & Licenses section doesn't repeat the license boilerplate
  // once per section (the export repeated-phrase gate). Seeded from already-
  // attached genome resources so a re-entrant pass reproduces the same
  // abbreviation decisions and stays idempotent (a previously-abbreviated
  // citation must NOT re-resolve to its full form on the second pass): the
  // dedupeKey is the abbreviation-invariant identity, recorded on each
  // resource, and re-seeds both the dedup set and the license-group set.
  const seenLicenseGroups = new Set();
  for (const resource of graph.resources || []) {
    if (resource?.origin !== 'genome') continue;
    if (resource.dedupeKey) seen.add(String(resource.dedupeKey).toLowerCase());
    if (resource.licenseGroupKey) seenLicenseGroups.add(resource.licenseGroupKey);
  }
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
      resolved.push({ citation, entry });
    }
    for (const { citation: resolvedCitation, entry } of resolved.slice(0, 2)) {
      // Dedup on the stable dedupeKey (unaffected by the license tail) before
      // touching the license group, so a skipped duplicate never consumes the
      // group's full-license "slot".
      const { dedupeKey } = resolvedCitation;
      if (seen.has(dedupeKey)) continue;
      // Abbreviate the license tail once a license group has appeared, but
      // re-resolve only when needed so the first occurrence keeps its full form.
      let final = resolvedCitation;
      const groupKey = resolvedCitation.licenseGroupKey;
      if (groupKey && seenLicenseGroups.has(groupKey)) {
        final = resolveGenomeCitation(entry, { abbreviateLicense: true }) || resolvedCitation;
      }
      const { citation, url, license, attribution } = final;
      if (seen.has(citation.toLowerCase())) continue;
      seen.add(citation.toLowerCase());
      seen.add(dedupeKey);
      if (groupKey) seenLicenseGroups.add(groupKey);
      attachResource(graph, session, {
        id: nextId(),
        citation,
        kind: 'textbook section',
        sessionRefs: [],
        origin: 'genome',
        url,
        license,
        attribution,
        // Stable identity for idempotent re-entry (abbreviation-invariant).
        dedupeKey,
        licenseGroupKey: groupKey || '',
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
      // Round-3 polish: genome definitions often open with the term itself
      // ("Close reading interprets a literary work…"), so the "term: " label
      // built the "X: X" echo chain the v0.12.1 gate flags ("Prerequisite
      // primer — Close reading: Close reading interprets…"). When the
      // definition already leads with the term, the definition alone carries
      // both label and content.
      const term = cleanText(primer.prerequisiteTerm);
      const definitionLeadsWithTerm =
        term.length > 0 &&
        definition.toLowerCase().startsWith(term.toLowerCase()) &&
        !/\w/.test(definition.charAt(term.length));
      const citation = `Prerequisite primer — ${definitionLeadsWithTerm ? definition : `${term}: ${definition}`}${
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

// ── V0.14.1 round-2: discipline topic gate ──────────────────────────────────
// The Round-1 Crucible live run showed the token gate leaks on GENERIC tokens:
// World Lit attached "Knowledge translation of research findings"
// (implementation science) on the word "translation", a disability-internet
// study on "solitude", and a cardiovascular-diabetes review on "literature
// review". Layer A: OpenAlex works now carry primary_topic field/domain — a
// candidate whose primary topic sits OUTSIDE the course's allowed
// fields/domains is rejected REGARDLESS of token overlap. Layer B: when topic
// data is absent, the token gate hardens (≥2 distinct hits, at least one
// non-generic).

// Course discipline (inferCourseDisciplines keys) → allowed OpenAlex
// primary_topic FIELD and/or DOMAIN display names. Fields and domains are
// checked SEPARATELY (a Psychology-field paper carries domain "Social
// Sciences" — matching domains against field entries would re-open the lit
// leak). A candidate passes when its field matches an allowed field OR its
// domain matches an allowed domain (case-insensitive). Disciplines without
// an entry get no topic filter (token gate only). Note the OpenAlex field
// "Social Sciences" is the linguistics/sociology field, distinct from the
// "Social Sciences" DOMAIN that spans psychology, economics, business…
export const OPENALEX_DISCIPLINE_TOPIC_ALLOWLIST = {
  lit: { fields: ['Arts and Humanities', 'Social Sciences'] },
  lang: { fields: ['Arts and Humanities', 'Social Sciences'] },
  history: { fields: ['Arts and Humanities', 'Social Sciences'] },
  cs: { fields: ['Computer Science', 'Mathematics', 'Engineering', 'Decision Sciences'] },
  geo: { fields: ['Earth and Planetary Sciences', 'Environmental Science'] },
  astro: { fields: ['Physics and Astronomy', 'Earth and Planetary Sciences'] },
  chem: {
    fields: ['Chemistry', 'Chemical Engineering', 'Materials Science', 'Biochemistry, Genetics and Molecular Biology'],
  },
  bio: {
    domains: ['Life Sciences'],
    fields: [
      'Agricultural and Biological Sciences',
      'Biochemistry, Genetics and Molecular Biology',
      'Immunology and Microbiology',
      'Neuroscience',
      'Environmental Science',
    ],
  },
  nursing: { domains: ['Health Sciences', 'Life Sciences'] },
  nutrition: { domains: ['Health Sciences', 'Life Sciences'], fields: ['Agricultural and Biological Sciences'] },
  // v0.14.3 (FP-3): clinical psychology legitimately cites medical/health
  // literature (clinical trials, neuropsychiatry), so Medicine/Health Sciences
  // are on-discipline here as for nursing/nutrition.
  psych: { domains: ['Health Sciences'], fields: ['Psychology', 'Neuroscience', 'Social Sciences', 'Medicine'] },
  econ: {
    fields: [
      'Economics, Econometrics and Finance',
      'Business, Management and Accounting',
      'Social Sciences',
      'Decision Sciences',
    ],
  },
  'project-management': {
    fields: ['Business, Management and Accounting', 'Decision Sciences', 'Engineering', 'Social Sciences'],
  },
  // v0.14.3 (FP-3): biostatistics / epidemiology cite the medical studies they
  // analyze (STROBE, observational-study reporting), so Medicine/Health
  // Sciences are on-discipline for an intro-stats course.
  stats: { domains: ['Health Sciences'], fields: ['Mathematics', 'Decision Sciences', 'Medicine'] },
};

// Tokens too generic to carry a topical match on their own — every Round-1
// leak rode one of these (translation, solitude, narrative, literature…).
// Stored de-pluralized to mirror significantTokens' normalization.
const GENERIC_OVERLAP_TOKENS = new Set(
  [
    'translation',
    'solitude',
    'narrative',
    'knowledge',
    'synthesis',
    'evaluation',
    'analysis',
    'structure',
    'language',
    'reading',
    'writing',
    'world',
    'global',
    'modern',
    'story',
    'stories',
    'storytelling',
    'literature',
    'literary',
    'culture',
    'cultural',
    'history',
    'historical',
    'theory',
    'research',
    'practice',
    'learning',
    'teaching',
    'education',
    'student',
    'development',
    'review',
    'systematic',
    'evidence',
    'question',
    'introduction',
    'approach',
    'method',
    'model',
    'system',
    'context',
    'community',
    'identity',
    'power',
    'change',
    'communication',
    'information',
    'text',
    'media',
    'social',
    'human',
    'people',
    'study',
    'findings',
  ].map((token) => (token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token)),
);

/**
 * The OpenAlex topic profile allowed for this course — { fields: Set,
 * domains: Set } — or null when the course's inferred disciplines carry no
 * mapping (→ token gate only). Multiple inferred disciplines union.
 */
export function allowedTopicNamesForCourse(graph) {
  const disciplines = inferCourseDisciplines({
    courseName: cleanText(graph?.course?.name),
    lessons: (graph?.sessions || []).map((session) => ({ title: cleanText(session?.title) })),
  });
  const fields = new Set();
  const domains = new Set();
  let mapped = false;
  for (const discipline of disciplines) {
    const entry = OPENALEX_DISCIPLINE_TOPIC_ALLOWLIST[discipline];
    if (!entry) continue;
    mapped = true;
    for (const name of entry.fields || []) fields.add(name.toLowerCase());
    for (const name of entry.domains || []) domains.add(name.toLowerCase());
  }
  return mapped ? { fields, domains } : null;
}

/**
 * 'on-discipline' | 'off-discipline' | 'no-topic-data' | 'unfiltered'.
 * Checks the work's primary topic (falling back to its first listed topic):
 * its field against the allowed FIELDS, its domain against the allowed
 * DOMAINS — never crosswise. 'unfiltered' = the course has no topic mapping,
 * so only the token gate applies; 'no-topic-data' = the WORK carries no
 * classification, so the hardened token gate applies.
 */
export function topicGateVerdict(work, allowedTopics) {
  if (!allowedTopics) return 'unfiltered';
  const topic = work?.primaryTopic || (Array.isArray(work?.topics) ? work.topics[0] : null);
  const field = cleanText(topic?.field).toLowerCase();
  const domain = cleanText(topic?.domain).toLowerCase();
  if (!field && !domain) return 'no-topic-data';
  return (field && allowedTopics.fields.has(field)) || (domain && allowedTopics.domains.has(domain))
    ? 'on-discipline'
    : 'off-discipline';
}

const PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE =
  /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|project\s+risk|project\s+controls|project\s+scheduling|earned\s+value|agile|scrum|kanban|project\s+governance|project\s+life\s+cycle|resource\s+planning|procurement\s+management|deliverable\s+acceptance|portfolio\s+management|construction\s+project|software\s+project)\b/i;

const PROJECT_MANAGEMENT_FALSE_FRIEND_RE =
  /\b(?:audit\s+quality|auditor\s+independence|audit\s+firm|financial\s+reporting|financial\s+statements?|earnings\s+management|external\s+audit|internal\s+audit|accounting\s+audit)\b/i;

function isProjectManagementGraph(graph) {
  const disciplines = inferCourseDisciplines({
    courseName: cleanText(graph?.course?.name),
    lessons: (graph?.sessions || []).map((session) => ({ title: cleanText(session?.title) })),
  });
  return disciplines.includes('project-management');
}

function workSearchText(work) {
  return cleanText(
    `${work?.title || ''} ${work?.abstract || ''} ${work?.primaryTopic?.name || ''} ${
      work?.primaryTopic?.field || ''
    } ${work?.primaryTopic?.domain || ''} ${(work?.topics || []).map((topic) => topic?.name || '').join(' ')}`,
  );
}

function passesProjectManagementFalseFriendGate(work, graph) {
  if (!isProjectManagementGraph(graph)) return true;
  const text = workSearchText(work);
  if (PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE.test(text)) return true;
  return !PROJECT_MANAGEMENT_FALSE_FRIEND_RE.test(text);
}

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

/**
 * The discipline's own NAME tokens for the offender yield rule — the inferred
 * discipline keys plus the course-title discipline anchor — so a famous
 * offender sharing only the field label (a stats paper sharing "statistics",
 * a nursing paper sharing "nursing") with the lesson does NOT yield. Matches
 * significantTokens' normalization so set membership lines up.
 */
function disciplineNameTokensForCourse(graph, anchor) {
  const disciplines = inferCourseDisciplines({
    courseName: cleanText(graph?.course?.name),
    lessons: (graph?.sessions || []).map((session) => ({ title: cleanText(session?.title) })),
  });
  const tokens = new Set();
  for (const discipline of disciplines) {
    for (const token of significantTokens(discipline)) tokens.add(token);
  }
  for (const token of significantTokens(anchor)) tokens.add(token);
  // The bare-discipline statistics/nursing family the field label inflects to.
  for (const root of ['statistic', 'nursing', 'nutrition', 'psychology', 'geology', 'economic']) {
    if (tokens.has(root) || cleanText(graph?.course?.name).toLowerCase().includes(root.slice(0, 6))) tokens.add(root);
  }
  return tokens;
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
  // V0.14.1 round-2: hits on tokens OUTSIDE the generic-overlap list — the
  // hardened no-topic-data gate requires at least one ("translation" alone
  // can no longer attach an implementation-science paper to a lit lesson).
  let specificHits = 0;
  for (const token of allTokens) {
    if (!contentTokens.has(token)) continue;
    hits += 1;
    if (!GENERIC_OVERLAP_TOKENS.has(token)) specificHits += 1;
  }
  let strongConceptHit = false;
  for (const token of strongConceptTokens) if (contentTokens.has(token)) strongConceptHit = true;
  const phraseHit = phrases.some((phrase) => phrase && contentNorm.includes(phrase));

  return { hits, specificHits, phraseHit, strongConceptHit, pass: phraseHit || hits >= 2 || strongConceptHit };
}

function formatScholarlyCitation(work) {
  const authors = work.authors || 'OpenAlex';
  const year = work.year ? ` (${work.year})` : '';
  return `${authors}${year}. ${work.title}. Open-access via ${work.url} (${work.license})`;
}

function hasExplicitReuseLicense(work) {
  return !isLicenseAmbiguous(work?.license);
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
  // v0.14.5 (A4): the provenance principle — what the instructor already
  // said outranks what we can retrieve. Sessions whose registry slot is
  // non-empty (graph.readings entries due that lesson) are SKIPPED entirely:
  // OpenAlex never attaches alongside an instructor-named reading, and the
  // skip is recorded in the decision vocabulary ('slot filled by instructor
  // reading'). Genome citations are tier 2 and still attach elsewhere
  // (attachGenomeResources) — only the retrieved tier demotes here.
  const instructorReadingsByLesson = new Map();
  for (const reading of Array.isArray(graph.readings) ? graph.readings : []) {
    if (!reading || !cleanText(reading.title) || !Number.isInteger(reading.dueSession)) continue;
    if (!instructorReadingsByLesson.has(reading.dueSession)) instructorReadingsByLesson.set(reading.dueSession, []);
    instructorReadingsByLesson.get(reading.dueSession).push(reading);
  }
  const allSessions = [...(graph.sessions || [])]
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .slice(0, maxSessions);
  if (!Array.isArray(graph.readingListDecisions)) graph.readingListDecisions = [];
  const sessions = [];
  for (const session of allSessions) {
    const slotReadings = instructorReadingsByLesson.get(session.number) || [];
    if (slotReadings.length === 0) {
      sessions.push(session);
      continue;
    }
    graph.readingListDecisions.push({
      type: 'slot-filled-by-instructor-reading',
      lesson: session.number ?? null,
      sessionId: session.id ?? null,
      instructorReadings: slotReadings.slice(0, 4).map((reading) => reading.title),
      message: `slot filled by instructor reading (L${session.number ?? '?'}: "${slotReadings[0].title}")`,
    });
  }
  const seen = existingCitations(graph);
  const nextId = nextResourceIdFactory(graph);
  const anchor = courseDisciplineAnchor(graph);
  // v0.14.3 round-2 FIX-1: discipline-name tokens dropped from the offender
  // yield rule (so an offender sharing only the field label never yields).
  const offenderDisciplineTokens = disciplineNameTokensForCourse(graph, anchor);
  // V0.14.1 round-2: the course's OpenAlex field/domain allowlist (null when
  // the inferred disciplines carry no mapping → token gate only).
  const allowedTopicNames = allowedTopicNamesForCourse(graph);
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

    // V0.14.1 2.6 + round-2: layered relevance gate. Layer A rejects any
    // candidate whose OpenAlex primary topic field/domain falls outside the
    // course's discipline allowlist — REGARDLESS of token overlap (the
    // diabetes review is Health Sciences → out for a lit course). Layer B:
    // on-discipline (or unfiltered) candidates pass the existing token gate;
    // candidates with NO topic data face the hardened gate (phrase match, or
    // ≥2 distinct hits with at least one non-generic token). Keep the best
    // passing one (tie-break by citation count); if none passes, attach
    // NOTHING and record why — no more MNIST-for-geology attachments.
    const terms = relevanceTermsForSession(graph, session, anchor);
    let rejectedOffDiscipline = 0;
    const rejectedKnownOffenders = [];
    const scored = candidates.map((work) => {
      // v0.14.3 round-2 FIX-1: a famous off-discipline offender (cancer
      // statistics, MNIST, …) is REJECTED at attach time REGARDLESS of the
      // topic-field allowlist and the token gate, UNLESS its title shares
      // strong topical overlap with the lesson concept per the SAME shared
      // yield rule the grader uses (generic words + the discipline's own name
      // are ignored — a sampling lesson's only tie to cancer-statistics is
      // the generic "statistics", so it never yields).
      if (!passesProjectManagementFalseFriendGate(work, graph)) {
        rejectedOffDiscipline += 1;
        return { work, score: scoreReadingRelevance(work, terms), pass: false };
      }
      const offender = matchesKnownOffender(work?.title);
      if (
        offender &&
        !blacklistYieldsToTopicalOverlap(new Set(significantTokens(work?.title)), terms.conceptTokens, {
          disciplineNameTokens: offenderDisciplineTokens,
        })
      ) {
        rejectedKnownOffenders.push(cleanText(work?.title));
        return { work, score: scoreReadingRelevance(work, terms), pass: false };
      }
      const verdict = topicGateVerdict(work, allowedTopicNames);
      if (verdict === 'off-discipline') rejectedOffDiscipline += 1;
      const score = scoreReadingRelevance(work, terms);
      const pass =
        verdict === 'off-discipline'
          ? false
          : verdict === 'no-topic-data'
            ? score.phraseHit || (score.hits >= 2 && score.specificHits >= 1)
            : score.pass;
      return { work, score, pass };
    });
    const passing = scored
      .filter((entry) => entry.pass)
      .sort(
        (a, b) =>
          Number(hasExplicitReuseLicense(b.work)) - Number(hasExplicitReuseLicense(a.work)) ||
          b.score.hits - a.score.hits ||
          Number(b.score.phraseHit) - Number(a.score.phraseHit) ||
          (b.work.citedBy || 0) - (a.work.citedBy || 0),
      );
    if (passing.length === 0) {
      // v0.14.3 round-2 FIX-1: when a known offender was rejected and nothing
      // relevant remains, name it ("rejected known-offender: <title>"). The
      // contract is unchanged — one decision per lesson, only when nothing
      // attaches; a successful attach still records zero decisions.
      decisions.push({
        type: 'no-relevant-reading',
        lesson: session.number ?? null,
        sessionId: session.id ?? null,
        rejected: candidates.length,
        ...(rejectedOffDiscipline > 0 ? { rejectedOffDiscipline } : {}),
        ...(rejectedKnownOffenders.length > 0
          ? {
              rejectedKnownOffender: rejectedKnownOffenders.length,
              knownOffenders: rejectedKnownOffenders,
              knownOffenderMessage: rejectedKnownOffenders
                .map((title) => `rejected known-offender: ${title}`)
                .join('; '),
            }
          : {}),
        candidates: candidates.slice(0, 4).map((work) => work.title),
        message: `no relevant open reading found for L${session.number ?? '?'} (rejected ${candidates.length} famous-but-off-topic)`,
      });
      continue;
    }
    const licensedPassing = passing.filter((entry) => hasExplicitReuseLicense(entry.work));
    if (licensedPassing.length === 0) {
      decisions.push({
        type: 'no-reusable-license-reading',
        lesson: session.number ?? null,
        sessionId: session.id ?? null,
        rejected: candidates.length,
        candidates: candidates.slice(0, 4).map((work) => work.title),
        licenses: candidates.slice(0, 4).map((work) => cleanText(work.license || 'missing')),
        message: `no reusable-license open reading found for L${session.number ?? '?'} (rejected ${candidates.length} metadata-only candidate${
          candidates.length === 1 ? '' : 's'
        })`,
      });
      continue;
    }
    const work = licensedPassing[0].work;
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

  // v0.14.5 (A4): when the registry names a 'book', the OpenLibrary lookup
  // ENRICHES the registry entry (isbn/url/publisher onto the entity) and
  // NEVER replaces its title — the instructor's verbatim title stays even
  // when OpenLibrary metadata disagrees. The generic course-level book
  // resource is skipped in that case (the registry book IS the required
  // text; a retrieved sibling would displace upward).
  const registryBook = (Array.isArray(graph.readings) ? graph.readings : []).find(
    (reading) => reading?.kind === 'book' && cleanText(reading.title),
  );
  if (registryBook) {
    try {
      const books = await fetchBooks(cleanText(registryBook.title), { limit: 1, signal });
      const book = (books || [])[0];
      if (book) {
        if (book.isbn && !registryBook.isbn) registryBook.isbn = cleanText(book.isbn);
        if (book.url && !registryBook.url) registryBook.url = cleanText(book.url);
        if (book.publisher && !registryBook.publisher) registryBook.publisher = cleanText(book.publisher);
        // registryBook.title is intentionally untouched — verbatim forever.
      }
    } catch {
      /* enrichment is optional */
    }
    return attached;
  }

  // Course-level OpenLibrary metadata is intentionally not promoted into a
  // trusted graph resource. It identifies books, but it does not prove reuse
  // rights for the material. Instructor-named registry books are still enriched
  // above without creating a separate trusted bibliography row.
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
    ['genome', 'genome-prerequisite', 'openalex', 'openlibrary', 'source-finder'].includes(resource.origin),
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
