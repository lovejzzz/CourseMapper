const TRUSTED_PROVIDERS = new Set([
  'courseir',
  'genome',
  'genome-prerequisite',
  'openalex',
  'openlibrary',
  'openstax',
  'eric',
  'instructor',
  'instructor-provided',
  'source-finder',
]);

const ACADEMIC_PROVIDERS = new Set(['openalex', 'eric', 'crossref']);
const OER_PROVIDERS = new Set(['openstax', 'genome', 'genome-prerequisite']);
const METADATA_ONLY_PROVIDERS = new Set(['openlibrary']);
const LICENSED_BACKGROUND_PROVIDERS = new Set(['wikipedia']);
const REVIEW_ONLY_PROVIDERS = new Set(['courseir', 'instructor', 'instructor-provided', 'openlibrary']);
const TRUST_ELIGIBLE_PROVIDERS = new Set([
  ...TRUSTED_PROVIDERS,
  ...ACADEMIC_PROVIDERS,
  ...OER_PROVIDERS,
  ...LICENSED_BACKGROUND_PROVIDERS,
]);
const GENERIC_RESOURCE_PROVIDERS = new Set(['', 'course-resource', 'course-map', 'resource', 'syllabus']);
const AMBIGUOUS_LICENSE_RE =
  /^(?:|unknown|open access|open license|(?:[\w.-]+\s+)*public metadata|instructor review required|review required|varies|mixed|metadata only)$/i;
const SOURCE_SIGNAL_RE =
  /\b(?:openstax|openalex|open library|openlibrary|eric|doi|creative commons|cc\s+by|open access|textbook|chapter|article|journal|book|reader|press|publication|volume|vol\.|edition|ed\.|et al\.?|isbn|issn)\b|https?:\/\//i;
const NON_SOURCE_RESOURCE_RE =
  /^(?:course\s*map|syllabus|lesson\s*plans?|slide\s*decks?|assignment\s*briefs?|rubrics?|discussion\s*prompts?|quiz\s*(?:and|&)\s*exam\s*bank|study\s*guides?|course\s*faq)$/i;
const PLACEHOLDER_RESOURCE_RE =
  /\b(?:course materials students need|worked examples,\s*readings,\s*or activity sheets|instructor-approved readings,\s*examples,\s*or lab materials|assigned materials|class notes and assigned materials|lms access|shared files|discipline-specific tools|required for this lesson|document,\s*slide,\s*lab,\s*or analysis tool|local examples need instructor confirmation|local source list pending)\b/i;
const USER_EXPERIENCE_COURSE_RE =
  /\b(?:user\s+experience|ux\b|human[-\s]?centered\s+design|interaction\s+design|interface\s+design|usability|design\s+studio)\b/i;
const USER_EXPERIENCE_SOURCE_ANCHOR_RE =
  /\b(?:user[-\s]+experience|ux\b|human[-\s]?centered\s+design|human[-\s]?computer\s+interaction|human[-\s]?ai\s+interaction|hci\b|hai\b|user\s+interfaces?|interface\s+design|usability|design\s+research|user\s+research|personas?\b(?!\s*5)|journey\s+maps?|customer\s+journey|information\s+architecture|wirefram|prototype|interaction\s+design|accessibility|inclusive\s+design|design\s+handoff|design\s+studio|co[-\s]?design|service\s+design|material\s+experience|design\s+patterns?|screen\s+flows?|navigation|portfolio\s+case\s+study|critique\s+session|a\/b\s+test(?:ing)?)\b/i;
const USER_EXPERIENCE_FALSE_FRIEND_RE =
  /(?:\bstudio\s+ghibli\b|\bspiritual\s+practice\b|\bstrategic\s+planning\b|\bchuck\s+swindoll\b|\bpre[-\s]?service\s+teachers?\b|\bteacher\s+education\b|\bprototype\s+\(video\s+game\)|\bprototype\s+\(star\s+trek:\s*voyager\)|\bstar\s+trek:\s*voyager\b|\bscience\s+fiction\s+television\s+series\b|\baction[-\s]?adventure\s+video\s+game\b|\bradical\s+entertainment\b|\bactivision\b|\bplaystation\b|\bxbox\b|\bone\s+prototype\s+three\s+prototype\s+five\s+prototype\s+seven\s+prototype\b|\bprototype[-\s]?based\s+programming\b|\bprototype[-\s]?oriented\s+programming\b|\bprototypal\s+inheritance\b|\bclassless\s+programming\b|\bobject[-\s]?oriented\s+programming\b|\bmercator\s+projection\b|\bmap\s+projection\b|\bcylindrical\s+map\s+projection\b|\brhumb\s+lines?\b|\bmechatronics\b|\bmachine\s+design\b|\bmanufacturing\b|\bpositive\s+feedback\b|\bnegative\s+feedback\b|\bclimate\s+change\s+feedbacks?\b|\bpersona\s+\d+(?:\s+(?:golden|revival))?\b|\bpersona\s+\(series\)|\brevelations:\s*persona\b|\bmegami\s+tensei\b|\batlus\b|\bp[-\s]?studio\b|\brole[-\s]?playing\s+video\s+game\b|\btim\s+minchin\b|\bpublic\s+persona\b|\bcelebrity\b|\bnetwork\s+of\s+enterprises?\b|\bbrief\s+interviews\s+with\s+hideous\s+men\b|\bsketches\s+of\s+spain\b|\bmiles\s+davis\b|\bstudio\s+album\b|\bjazz\s+musician\b|\bconcierto\s+de\s+aranjuez\b|\ble\s+po[eè]me\b|\bpo[eè]me\b|\bpoetry\b|\bcritique\s+of\s+pure\s+reason\b|\bimmanuel\s+kant\b|\bmetaphysics\b|\baircraft\s+design\s+process\b|\bprocess\s+design\s+and\s+process\s+control\b|\bifac\s+workshop\b|\bshoe\s+production\s+facilities\b|\bblocplan\b|\bsystematic\s+layout\s+planning\b|\blayout\s+of\s+shoe\s+production\b|\blayout\s+editor\s+configuration\b|\bmetaverse\s+beyond\s+the\s+hype\b|\bpatterns\s+2\.0\b|\blead[-\s]?user\s+theory\b|\bcommercially\s+attractive\s+user\s+innovations\b|\bweb\s+gis\s+in\s+practice\b|\bmicrosoft\s+kinect\b|\bintralogistics\s+processes\b|\bgreen\s+studio\s+handbook\b|\benvironmental\s+strategies\s+for\s+schematic\s+design\b|\bnational\s+design\s+studio\b|\ble\s+mans\s+prototype\b|\bin\s+living\s+color\s+sketches\b|\bsketch\s+comedy\b|\bcomedy\s+sketch(?:es)?\b|\btelevision\s+sketch(?:es)?\b|\barchitectural\s+education\b|\bcollaborative\s+learning\s+in\s+architectur(?:e|al)\b)/i;
const USER_EXPERIENCE_TOPIC_ANCHORS = [
  {
    concept: /\b(?:design\s+process|critique\s+sessions?|design\s+journals?|studio\s+workflow)\b/i,
    source:
      /\b(?:material\s+driven\s+design|design\s+process|design\s+studio|critique|design\s+journals?|studio\s+workflow|service\s+design|co[-\s]?design)\b/i,
  },
  {
    concept: /\b(?:interviews?|observations?|synthesis)\b/i,
    source:
      /\b(?:user\s+research|user\s+interviews?|research\s+interviews?|qualitative\s+interviews?|contextual\s+inquiry|observational\s+research|affinity\s+mapping|thematic\s+synthesis)\b/i,
  },
  {
    concept: /\b(?:personas?|journey\s+maps?|design\s+questions?)\b/i,
    source:
      /\b(?:personas?\b(?!\s*(?:series|5))|journey\s+maps?|customer\s+journey|user\s+needs?|design\s+questions?)\b/i,
  },
  {
    concept: /\b(?:information\s+architecture|sketches|low[-\s]?fidelity\s+layouts?)\b/i,
    source: /\b(?:information\s+architecture|wirefram|low[-\s]?fidelity|sketch(?:es|ing)?|sitemap|content\s+model)\b/i,
  },
  {
    concept: /\b(?:navigation|components?|screen\s+flow)\b/i,
    source:
      /\b(?:navigation|screen\s+flow|user\s+interface|interaction\s+design|mobile\s+screens?|interface\s+adaptation|design\s+patterns?)\b/i,
  },
  {
    concept: /\b(?:clickable\s+prototypes?|tool\s+workflows?|iteration)\b/i,
    source:
      /\b(?:clickable\s+prototypes?|functional\s+prototypes?|prototyp|tool\s+workflow|iteration|usability\s+testing)\b/i,
  },
  {
    concept: /\b(?:test\s+plans?|task\s+scenarios?|findings)\b/i,
    source:
      /\b(?:usability\s+test(?:ing)?|a\/b\s+test(?:ing)?|split\s+test(?:ing)?|test\s+plans?|task\s+scenarios?|research\s+findings?)\b/i,
  },
  {
    concept: /\b(?:inclusive\s+design|evaluation|remediation|accessibility)\b/i,
    source: /\b(?:inclusive\s+design|accessibility|evaluation|remediation|transformative\s+services?)\b/i,
  },
  {
    concept: /\b(?:process\s+narrative|visuals|case\s+study\s+structure|studio\s+work|refinement|review)\b/i,
    source:
      /\b(?:design\s+studio|studio\s+practice|portfolio\s+case\s+stud(?:y|ies)|case\s+study\s+structure|critique|visuals?|refinement|review)\b/i,
  },
];
const SOURCE_FINDER_TRUSTED_ROWS_PER_TOPIC = 2;

function cleanText(value, maxLength = 500) {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength
    ? text
        .slice(0, maxLength)
        .replace(/\s+\S*$/, '')
        .trim()
    : text;
}

function cleanUrl(value) {
  const text = cleanText(value, 600);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return '';
}

function extractUrl(value) {
  const text = cleanText(value, 1000);
  const match = text.match(/https?:\/\/[^\s),;\]]+/i);
  return match ? match[0].replace(/[.,;:]+$/g, '') : '';
}

function extractLicenseUrl(value) {
  const text = cleanText(value, 1000);
  const matches = [...text.matchAll(/https?:\/\/[^\s),;\]]+/gi)]
    .map((match) => match[0].replace(/[.,;:]+$/g, ''))
    .filter(Boolean);
  return (
    matches.find(
      (url) =>
        !/doi\.org\//i.test(url) &&
        /\b(?:license|licence|terms|rights|copyright|creative-commons|creativecommons|tdm)\b/i.test(url),
    ) || ''
  );
}

function extractDoi(value) {
  const text = cleanText(value, 1000);
  const match = text.match(/(?:doi:\s*|doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  return match ? match[1] : '';
}

function normalizeLicense(value, { preserveUnknown = false } = {}) {
  const text = cleanText(value, 1000);
  const cc = text.match(/\bCC[-_\s]+BY(?:[-_\s]+(?:NC|ND|SA))*(?:[-_\s]+\d(?:\.\d)?)?\b/i);
  if (cc) {
    const raw = cc[0]
      .replace(/_/g, '-')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const flags = [...raw.matchAll(/\b(?:NC|ND|SA)\b/g)].map((match) => match[0]);
    const version = raw.match(/\b\d(?:\.\d)?\b/)?.[0] || '';
    return `CC BY${flags.length ? `-${flags.join('-')}` : ''}${version ? ` ${version}` : ''}`;
  }
  if (/\bpublic domain\b/i.test(text)) return 'public domain';
  if (/\bopen access\b/i.test(text)) return 'open access';
  return preserveUnknown ? cleanText(value, 180) : '';
}

function extractLicense(value) {
  const normalized = normalizeLicense(value);
  if (normalized && !isLicenseAmbiguous(normalized)) return normalized;
  return extractLicenseUrl(value) || normalized;
}

function normalizeDoi(value) {
  const text = cleanText(value, 220)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  return text || '';
}

function normalizeAuthors(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanText(entry, 140))
      .filter(Boolean)
      .slice(0, 8);
  }
  const text = cleanText(value, 320);
  if (!text) return [];
  return text
    .split(/\s+(?:et al\.?)$/i)[0]
    .split(/\s*;\s*|\s+\|\s+|\s+and\s+|,\s+(?=[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s|$))/)
    .map((entry) => cleanText(entry, 140))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeConceptLinks(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const links = [];
  for (const item of items) {
    const isObject = item && typeof item === 'object';
    const id = cleanText(isObject ? item.id || item.conceptId || '' : item, 120);
    const label = cleanText(isObject ? item.label || item.term || item.title || '' : '', 160);
    const key = `${id}|${label}`.toLowerCase();
    if ((!id && !label) || seen.has(key)) continue;
    seen.add(key);
    links.push({ ...(id ? { id } : {}), ...(label ? { label } : {}) });
    if (links.length >= 16) break;
  }
  return links;
}

function sourceStatus(entry) {
  const status = cleanText(entry?.status || entry?.sourceStatus, 80);
  return status || 'source-provided';
}

function sourceProvider(entry, fallback = 'courseir') {
  const direct = cleanText(entry?.provider || entry?.origin || entry?.sourceProvider || '', 80).toLowerCase();
  const sourceText = [entry?.url, entry?.sourceUrl, entry?.title, entry?.citation, entry?.evidence, entry?.scope]
    .filter(Boolean)
    .join(' ');
  const inferred = inferProviderFromText(sourceText);
  if (!direct || ['course-resource', 'course-map', 'resource', 'syllabus'].includes(direct)) {
    return inferred || direct || fallback;
  }
  return direct;
}

function sourceType(entry) {
  return cleanText(entry?.sourceType || entry?.kind || entry?.type || 'source', 120);
}

function sourceId(entry, fallbackId, index) {
  return cleanText(entry?.id || entry?.sourceId || entry?.sourceRef || fallbackId || `SL${index + 1}`, 120);
}

export function isLicenseAmbiguous(license) {
  return AMBIGUOUS_LICENSE_RE.test(cleanText(license, 180).toLowerCase());
}

export function isSourceAccessible(source) {
  return Boolean(cleanUrl(source?.url) || normalizeDoi(source?.doi));
}

export function providerTrustLevel(provider) {
  const key = cleanText(provider, 80).toLowerCase();
  if (ACADEMIC_PROVIDERS.has(key)) return 'academic-metadata';
  if (OER_PROVIDERS.has(key)) return 'open-educational-resource';
  if (LICENSED_BACKGROUND_PROVIDERS.has(key)) return 'licensed-background-source';
  if (METADATA_ONLY_PROVIDERS.has(key)) return 'bibliographic-metadata';
  if (TRUSTED_PROVIDERS.has(key)) return 'trusted-metadata';
  return 'review-required';
}

function inferProviderFromText(value) {
  const text = cleanText(value, 1000).toLowerCase();
  if (!text) return '';
  if (text.includes('openstax.org') || /\bopenstax\b/.test(text)) return 'openstax';
  if (text.includes('openalex.org') || /\bopenalex\b/.test(text)) return 'openalex';
  if (text.includes('openlibrary.org') || /\bopen library\b/.test(text)) return 'openlibrary';
  if (text.includes('eric.ed.gov') || /\beric\b/.test(text)) return 'eric';
  if (text.includes('wikipedia.org') || /\bwikipedia\b/.test(text)) return 'wikipedia';
  if (text.includes('crossref.org') || /\bcrossref\b/.test(text)) return 'crossref';
  if (text.includes('dl.acm.org/doi') || extractDoi(text)) return 'crossref';
  return '';
}

function isGenericResourceProvider(provider) {
  return GENERIC_RESOURCE_PROVIDERS.has(cleanText(provider, 80).toLowerCase());
}

function isSourceLikeResource(resource = {}, provider = '') {
  if (!isGenericResourceProvider(provider)) return true;
  const text = [resource.url, resource.sourceUrl, resource.doi, resource.title, resource.citation, resource.evidence]
    .filter(Boolean)
    .join(' ');
  const cleaned = cleanText(text, 1000);
  if (!cleaned) return false;
  if (NON_SOURCE_RESOURCE_RE.test(cleaned)) return false;
  if (PLACEHOLDER_RESOURCE_RE.test(cleaned)) return false;
  return SOURCE_SIGNAL_RE.test(cleaned);
}

export function sourceCitationLabel(source = {}) {
  const title = cleanText(source.title || source.citation || source.evidence || source.id, 220);
  const authors = normalizeAuthors(source.authors).slice(0, 3).join(', ');
  const year = cleanText(source.year, 20);
  const ref = cleanText(source.doi ? `doi:${normalizeDoi(source.doi)}` : source.url, 240);
  const lead = [authors, year ? `(${year})` : ''].filter(Boolean).join(' ');
  return [lead, title, ref].filter(Boolean).join(lead && title ? '. ' : ' — ');
}

export function normalizeTrustedSource(entry = {}, { fallbackId = '', checkedAt = '', conceptLinks = [] } = {}) {
  const provider = sourceProvider(entry);
  const sourceText = [entry.url, entry.sourceUrl, entry.doi, entry.citation, entry.evidence, entry.title]
    .filter(Boolean)
    .join(' ');
  const doi = normalizeDoi(entry.doi || extractDoi(sourceText));
  const extractedUrl = cleanUrl(entry.url || entry.sourceUrl) || extractUrl(sourceText);
  const url =
    doi && /^https?:\/\/(?:dx\.)?doi\.org\//i.test(extractedUrl || '')
      ? `https://doi.org/${doi}`
      : extractedUrl || (doi ? `https://doi.org/${doi}` : '');
  const title = cleanText(entry.title || entry.displayTitle || entry.citation || entry.evidence || entry.scope, 260);
  const explicitLicense = cleanText(entry.license || entry.rights || entry.licenseUrl, 180);
  const license = explicitLicense
    ? normalizeLicense(explicitLicense, { preserveUnknown: true })
    : extractLicense(sourceText);
  const source = {
    id: sourceId(entry, fallbackId, 0),
    title,
    authors: normalizeAuthors(entry.authors || entry.author || entry.creators),
    url,
    doi,
    license,
    provider,
    sourceType: sourceType(entry),
    scope: cleanText(entry.scope || entry.path || 'course', 140),
    status: sourceStatus(entry),
    origin: cleanText(entry.origin || entry.sourceOrigin || '', 80),
    evidence: cleanText(entry.evidence || entry.note || entry.snippet || entry.abstract || '', 360),
    conceptLinks: normalizeConceptLinks([...(conceptLinks || []), ...(entry.conceptLinks || [])]),
    checkedAt: cleanText(entry.checkedAt || checkedAt, 80),
    accessStatus: isSourceAccessible({ url, doi }) ? 'reference-present' : 'no-url-or-doi',
    trustLevel: providerTrustLevel(provider),
  };
  source.citation = sourceCitationLabel(source);
  source.licenseAmbiguous = isLicenseAmbiguous(source.license);
  return source;
}

export function isTrustedSourceLedgerRow(row = {}) {
  const provider = cleanText(row?.provider, 80).toLowerCase();
  if (!TRUST_ELIGIBLE_PROVIDERS.has(provider) || REVIEW_ONLY_PROVIDERS.has(provider)) return false;
  return isSourceAccessible(row) && !isLicenseAmbiguous(row?.license);
}

export function isConceptLinkedSourceLedgerRow(row = {}) {
  return normalizeConceptLinks(row?.conceptLinks || []).length > 0;
}

export function isTrustedConceptLinkedSourceLedgerRow(row = {}) {
  return isTrustedSourceLedgerRow(row) && isConceptLinkedSourceLedgerRow(row);
}

export function summarizeSourceLedgerRows(rows = []) {
  const ledgerRows = Array.isArray(rows) ? rows : [];
  return {
    sourceCount: ledgerRows.length,
    trustedCount: ledgerRows.filter(isTrustedSourceLedgerRow).length,
    conceptLinkedCount: ledgerRows.filter(isConceptLinkedSourceLedgerRow).length,
    trustedConceptLinkedCount: ledgerRows.filter(isTrustedConceptLinkedSourceLedgerRow).length,
    accessibleCount: ledgerRows.filter(isSourceAccessible).length,
    licenseAmbiguousCount: ledgerRows.filter((row) => row.licenseAmbiguous).length,
    providers: [...new Set(ledgerRows.map((row) => row.provider).filter(Boolean))].sort(),
  };
}

export function sourceLedgerFromOpenAlex(result = {}, options = {}) {
  return normalizeTrustedSource(
    {
      ...result,
      provider: 'openalex',
      sourceType: result.kind || 'scholarly work',
      status: 'source-provided',
      license: result.license || 'open access',
    },
    options,
  );
}

export function sourceLedgerFromOpenLibrary(result = {}, options = {}) {
  return normalizeTrustedSource(
    {
      ...result,
      provider: 'openlibrary',
      sourceType: result.kind || 'book metadata',
      status: 'source-provided',
      license: result.license || 'Open Library public metadata',
    },
    options,
  );
}

export function sourceLedgerFromOpenStax(anchor = {}, options = {}) {
  return normalizeTrustedSource(
    {
      ...anchor,
      provider: anchor.provider || 'openstax',
      sourceType: anchor.kind || 'open textbook',
      status: 'source-provided',
      license: anchor.license || 'CC BY-NC-SA 4.0',
      attribution: anchor.attribution || 'OpenStax, Rice University',
    },
    options,
  );
}

function conceptLinkForRef(conceptRef, section, conceptsById) {
  const conceptId =
    typeof conceptRef === 'string' ? conceptRef : cleanText(conceptRef?.id || conceptRef?.conceptId || '', 120);
  const conceptLabel =
    typeof conceptRef === 'string'
      ? ''
      : cleanText(conceptRef?.label || conceptRef?.term || conceptRef?.title || '', 160);
  const concept = conceptsById.get(conceptId);
  return { id: conceptId, label: concept?.term || conceptLabel || section?.topic || '' };
}

function conceptLinksForResource(graph, resourceId) {
  const sessions = graph?.sessions || [];
  const conceptsById = new Map((graph?.concepts || []).map((concept) => [concept.id, concept]));
  const resource = (graph?.resources || []).find((item) => item?.id === resourceId);
  const links = [];
  for (const session of sessions) {
    const linksBeforeSession = links.length;
    const fallbackSectionLabels = [];
    const sessionMatches = resource?.sessionRefs?.some((ref) => ref === session.id || ref === session.number);
    let linkedToSession = Boolean(sessionMatches);
    for (const section of session.sections || []) {
      const sectionMatches = (section.resourceRefs || []).includes(resourceId);
      linkedToSession = linkedToSession || sectionMatches;
      if (!sessionMatches && !sectionMatches) continue;
      if (
        sectionMatches &&
        (!Array.isArray(section.conceptRefs) || section.conceptRefs.length === 0) &&
        section.topic
      ) {
        fallbackSectionLabels.push(section.topic);
      }
      for (const conceptRef of section.conceptRefs || []) {
        links.push(conceptLinkForRef(conceptRef, section, conceptsById));
      }
    }
    if (linkedToSession) {
      for (const edge of graph?.edges?.teaches || []) {
        if (edge?.from !== session.id && edge?.from !== session.number) continue;
        const concept = conceptsById.get(edge.to);
        links.push({ id: edge.to, label: concept?.term || '' });
      }
    }
    if (linkedToSession && links.length === linksBeforeSession) {
      for (const label of fallbackSectionLabels) links.push({ label });
    }
  }
  return normalizeConceptLinks(links);
}

function conceptLinksForSourceFinderTopic(graph, topic = {}) {
  const sessions = graph?.sessions || [];
  const conceptsById = new Map((graph?.concepts || []).map((concept) => [concept.id, concept]));
  const session = sessions.find(
    (entry) =>
      (topic.sessionId && entry.id === topic.sessionId) ||
      (Number.isInteger(topic.lessonNumber) && entry.number === topic.lessonNumber),
  );
  if (!session) return normalizeConceptLinks(topic.topic ? [{ label: topic.topic }] : []);
  const links = [];
  for (const section of session.sections || []) {
    for (const conceptRef of section.conceptRefs || []) {
      const link = conceptLinkForRef(conceptRef, section, conceptsById);
      links.push({ ...link, label: link.label || topic.topic || '' });
    }
  }
  for (const edge of graph?.edges?.teaches || []) {
    if (edge?.from !== session.id && edge?.from !== session.number) continue;
    const concept = conceptsById.get(edge.to);
    links.push({ id: edge.to, label: concept?.term || topic.topic || '' });
  }
  if (links.length === 0 && topic.topic) links.push({ label: topic.topic });
  return normalizeConceptLinks(links);
}

function sourceIdentityKeys(source = {}) {
  const strongKeys = [
    source.doi ? `doi:${source.doi}` : '',
    source.url ? `url:${source.url}` : '',
    source.id ? `id:${source.id}` : '',
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (strongKeys.length > 0) return strongKeys;
  return source.title ? [`title:${source.title}`.toLowerCase()] : [];
}

function courseText(courseGraph = {}) {
  return [
    courseGraph?.course?.name,
    courseGraph?.course?.title,
    courseGraph?.courseName,
    courseGraph?.title,
    ...(courseGraph?.sessions || []).map((session) => session?.title || ''),
  ]
    .filter(Boolean)
    .join(' ');
}

function sourceSearchText(source = {}) {
  return [source?.title, source?.citation, source?.evidence, source?.abstract, source?.snippet, source?.sourceType]
    .filter(Boolean)
    .join(' ');
}

function sourceConceptText(source = {}) {
  return (Array.isArray(source?.conceptLinks) ? source.conceptLinks : [])
    .map((link) => (typeof link === 'string' ? link : link?.label || link?.id || ''))
    .filter(Boolean)
    .join(' ');
}

function hasUserExperienceTopicAnchor(source = {}) {
  const conceptText = sourceConceptText(source);
  const text = sourceSearchText(source);
  return USER_EXPERIENCE_TOPIC_ANCHORS.some(({ concept, source: sourcePattern }) => {
    return concept.test(conceptText) && sourcePattern.test(text);
  });
}

export function isUserExperienceWeakSource(source, courseGraph) {
  if (!USER_EXPERIENCE_COURSE_RE.test(courseText(courseGraph))) return false;
  const text = sourceSearchText(source);
  if (USER_EXPERIENCE_FALSE_FRIEND_RE.test(text)) return true;
  return !USER_EXPERIENCE_SOURCE_ANCHOR_RE.test(text) && !hasUserExperienceTopicAnchor(source);
}

function isSourceFinderCandidate(source = {}) {
  return (
    cleanText(source?.origin || source?.sourceOrigin, 80).toLowerCase() === 'source-finder' ||
    /^sf(?:-|\d)/i.test(cleanText(source?.id, 80))
  );
}

function isGeneratedSyllabusSource(source = {}) {
  const origin = cleanText(source?.origin || source?.sourceOrigin, 80).toLowerCase();
  return origin === 'syllabus' || /^syllabus-src-/i.test(cleanText(source?.id, 120));
}

function requiresSourceReview(source = {}) {
  return !isTrustedConceptLinkedSourceLedgerRow(source);
}

function appendCourseAwareSource(rows, reviewRows, source, courseGraph) {
  if (
    isSourceFinderCandidate(source) &&
    (requiresSourceReview(source) || isUserExperienceWeakSource(source, courseGraph))
  ) {
    return;
  }
  if (isGeneratedSyllabusSource(source) && isUserExperienceWeakSource(source, courseGraph)) {
    return;
  }
  if (requiresSourceReview(source)) {
    appendUnique(reviewRows, source);
    return;
  }
  if (isTrustedConceptLinkedSourceLedgerRow(source) && isUserExperienceWeakSource(source, courseGraph)) {
    appendUnique(reviewRows, source);
    return;
  }
  appendUnique(rows, source);
}

function appendUnique(rows, source) {
  if (!source?.id && !source?.title) return;
  const keys = sourceIdentityKeys(source);
  if (rows.some((entry) => sourceIdentityKeys(entry).some((key) => keys.includes(key)))) {
    return;
  }
  rows.push(source);
}

function isCourseIRReviewOnlySource(source = {}) {
  if (cleanText(source.provider, 80).toLowerCase() !== 'courseir') return false;
  if (isSourceAccessible(source)) return false;
  const status = cleanText(source.status, 80).toLowerCase();
  const text = [source.title, source.evidence, source.scope].map((value) => cleanText(value, 240)).join(' ');
  return (
    source.licenseAmbiguous ||
    status === 'assumption' ||
    status === 'model-authored' ||
    /\b(?:existing course map fields|no source ledger|instructor source review|repaired package requires review)\b/i.test(
      text,
    )
  );
}

function sourceFinderLedgerCandidateScore(source = {}) {
  const provider = cleanText(source.provider || source.origin || '', 80).toLowerCase();
  let score = 0;
  if (isSourceAccessible(source)) score += 30;
  if (source?.doi) score += 8;
  if (!isLicenseAmbiguous(source?.license)) score += 30;
  if (TRUST_ELIGIBLE_PROVIDERS.has(provider) && !REVIEW_ONLY_PROVIDERS.has(provider)) score += 30;
  if (ACADEMIC_PROVIDERS.has(provider)) score += 12;
  if (OER_PROVIDERS.has(provider)) score += 10;
  if (LICENSED_BACKGROUND_PROVIDERS.has(provider)) score += 8;
  if (METADATA_ONLY_PROVIDERS.has(provider) || REVIEW_ONLY_PROVIDERS.has(provider)) score -= 20;
  return score;
}

function rankedSourceFinderTopicSources(topic = {}) {
  return (Array.isArray(topic.sources) ? topic.sources : [])
    .filter((source) => source && typeof source === 'object')
    .map((source, index) => ({ source, index, score: sourceFinderLedgerCandidateScore(source) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function normalizeSourceFinderTopicSource(courseGraph, topic, source, topicIndex, sourceIndex, checkedAt) {
  return normalizeTrustedSource(
    {
      ...source,
      id: source.sourceRefId || source.id || `sf-${topicIndex + 1}-${sourceIndex + 1}`,
      origin: 'source-finder',
      provider: source.provider || 'source-finder',
      sourceType: source.kind || 'source-finder source',
      status: 'source-provided',
      scope: topic.sessionId || topic.lessonNumber ? `lesson-${topic.lessonNumber || topic.sessionId}` : 'course',
      evidence: source.snippet || source.abstract || source.evidence || topic.topic,
    },
    {
      fallbackId: `sf-${topicIndex + 1}-${sourceIndex + 1}`,
      checkedAt,
      conceptLinks: conceptLinksForSourceFinderTopic(courseGraph, topic),
    },
  );
}

function sourceFinderTopicLedgerSources(courseGraph, topic, topicIndex, checkedAt) {
  const candidates = rankedSourceFinderTopicSources(topic).map(({ source }, sourceIndex) =>
    normalizeSourceFinderTopicSource(courseGraph, topic, source, topicIndex, sourceIndex, checkedAt),
  );
  const trustedConceptLinked = candidates.filter(
    (source) => isTrustedConceptLinkedSourceLedgerRow(source) && !isUserExperienceWeakSource(source, courseGraph),
  );
  if (trustedConceptLinked.length > 0) {
    return {
      rows: trustedConceptLinked.slice(0, SOURCE_FINDER_TRUSTED_ROWS_PER_TOPIC),
      reviewRows: [],
    };
  }
  return {
    rows: [],
    reviewRows: [],
  };
}

export function buildSourceLedgerFromCourseGraph(courseGraph, { checkedAt = '' } = {}) {
  if (!courseGraph || typeof courseGraph !== 'object') return null;
  const rows = [];
  const reviewRows = [];
  const courseIRRows = Array.isArray(courseGraph.courseIR?.sourceLedger) ? courseGraph.courseIR.sourceLedger : [];
  courseIRRows.forEach((entry, index) => {
    const normalized = normalizeTrustedSource(
      {
        provider: entry.provider || 'courseir',
        sourceType: entry.sourceType || 'courseir-ledger-row',
        ...entry,
      },
      { fallbackId: `SL${index + 1}`, checkedAt },
    );
    if (isCourseIRReviewOnlySource(normalized)) appendUnique(reviewRows, normalized);
    else appendCourseAwareSource(rows, reviewRows, normalized, courseGraph);
  });

  for (const resource of courseGraph.resources || []) {
    if (!resource || typeof resource !== 'object') continue;
    const provider = resource.provider || resource.origin || 'course-resource';
    if (!isSourceLikeResource(resource, provider)) continue;
    appendCourseAwareSource(
      rows,
      reviewRows,
      normalizeTrustedSource(
        {
          ...resource,
          id: resource.sourceRefId || resource.id,
          title: resource.title || resource.citation,
          provider,
          sourceType: resource.kind || 'course resource',
          status: 'source-provided',
        },
        { fallbackId: resource.id, checkedAt, conceptLinks: conceptLinksForResource(courseGraph, resource.id) },
      ),
      courseGraph,
    );
  }

  for (const reading of courseGraph.readings || []) {
    if (!reading || typeof reading !== 'object') continue;
    appendCourseAwareSource(
      rows,
      reviewRows,
      normalizeTrustedSource(
        {
          ...reading,
          provider: reading.instructorProvided ? 'instructor-provided' : 'instructor',
          sourceType: reading.kind || 'reading',
          status: 'source-provided',
          license: reading.license || 'instructor review required',
          evidence: reading.sourceText || reading.title,
        },
        { fallbackId: reading.id, checkedAt },
      ),
      courseGraph,
    );
  }

  for (const [topicIndex, topic] of (courseGraph.sourceFinderMiniShard?.topics || []).entries()) {
    if (!topic || typeof topic !== 'object') continue;
    const topicSources = sourceFinderTopicLedgerSources(courseGraph, topic, topicIndex, checkedAt);
    for (const source of topicSources.rows || []) {
      appendUnique(rows, source);
    }
    for (const source of topicSources.reviewRows || []) {
      appendUnique(reviewRows, source);
    }
  }

  if (rows.length === 0 && reviewRows.length === 0) return null;
  return {
    rows,
    ...(reviewRows.length > 0 ? { reviewRows } : {}),
    summary: {
      ...summarizeSourceLedgerRows(rows),
      ...(reviewRows.length > 0 ? { reviewRequiredCount: reviewRows.length } : {}),
    },
  };
}

export function buildSourceReportMarkdown({
  courseName = 'Course',
  sourceLedger = null,
  sourceRefCoverage = null,
} = {}) {
  const rows = sourceLedger?.rows || [];
  const reviewRows = sourceLedger?.reviewRows || [];
  if (rows.length === 0 && reviewRows.length === 0 && !sourceRefCoverage) return '';
  const lines = [`# Source Report — ${cleanText(courseName, 180) || 'Course'}`, ''];
  lines.push('## Research Policy');
  lines.push(
    'CourseMapper compiles teaching materials from source ledger rows and atom sourceRefs. Missing URLs, DOI values, or licenses are marked for instructor review rather than invented during compilation.',
  );
  lines.push('');
  if (rows.length > 0) {
    lines.push('## Source Ledger');
    for (const row of rows) {
      lines.push(`- ${row.id}: ${row.citation || row.title}`);
      const details = [
        row.provider ? `provider=${row.provider}` : '',
        row.license ? `license=${row.license}` : 'license=missing',
        row.url ? `url=${row.url}` : row.doi ? `doi=${row.doi}` : 'access=missing-url-or-doi',
        row.checkedAt ? `checkedAt=${row.checkedAt}` : '',
        row.licenseAmbiguous ? 'licenseReview=required' : '',
      ].filter(Boolean);
      if (details.length > 0) lines.push(`  - ${details.join('; ')}`);
      if (row.conceptLinks?.length > 0) {
        lines.push(`  - concepts=${row.conceptLinks.map((link) => link.label || link.id).join(', ')}`);
      }
    }
    lines.push('');
  }
  if (reviewRows.length > 0) {
    lines.push('## Source Review Notes');
    for (const row of reviewRows) {
      lines.push(`- ${row.id}: ${row.title || row.evidence || 'CourseIR source row requires review'}`);
      const details = [
        row.provider ? `provider=${row.provider}` : '',
        row.status ? `status=${row.status}` : '',
        row.license ? `license=${row.license}` : 'license=missing',
        row.url ? `url=${row.url}` : row.doi ? `doi=${row.doi}` : 'access=missing-url-or-doi',
        row.checkedAt ? `checkedAt=${row.checkedAt}` : '',
        'trustedBibliography=false',
      ].filter(Boolean);
      if (details.length > 0) lines.push(`  - ${details.join('; ')}`);
      if (row.evidence && row.evidence !== row.title) lines.push(`  - evidence=${row.evidence}`);
    }
    lines.push('');
  }
  if (sourceRefCoverage) {
    lines.push('## SourceRef Coverage');
    for (const [category, coverage] of Object.entries(sourceRefCoverage.categories || {})) {
      lines.push(
        `- ${category}: ${coverage.withRefs}/${coverage.total} with sourceRefs${
          coverage.danglingRefs ? `; danglingRefs=${coverage.danglingRefs}` : ''
        }`,
      );
      if (coverage.missingIds?.length > 0) lines.push(`  - missing=${coverage.missingIds.join(', ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}
