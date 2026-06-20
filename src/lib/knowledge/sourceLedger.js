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

const ACADEMIC_PROVIDERS = new Set(['openalex', 'eric']);
const OER_PROVIDERS = new Set(['openstax', 'genome', 'genome-prerequisite']);
const METADATA_ONLY_PROVIDERS = new Set(['openlibrary']);
const AMBIGUOUS_LICENSE_RE =
  /^(?:|unknown|open access|open license|public metadata|open library public metadata|crossref public metadata|instructor review required|review required|varies|mixed|metadata only)$/i;

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
    const id = cleanText(item?.id || item?.conceptId || item, 120);
    const label = cleanText(item?.label || item?.term || item?.title || '', 160);
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
  return cleanText(entry?.provider || entry?.origin || entry?.sourceProvider || fallback, 80).toLowerCase();
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
  if (METADATA_ONLY_PROVIDERS.has(key)) return 'bibliographic-metadata';
  if (TRUSTED_PROVIDERS.has(key)) return 'trusted-metadata';
  return 'review-required';
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
  const doi = normalizeDoi(entry.doi);
  const url = cleanUrl(entry.url || entry.sourceUrl || (doi ? `https://doi.org/${doi}` : ''));
  const title = cleanText(entry.title || entry.displayTitle || entry.citation || entry.evidence || entry.scope, 260);
  const license = cleanText(entry.license || entry.rights || entry.licenseUrl || '', 180);
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

function conceptLinksForResource(graph, resourceId) {
  const sessions = graph?.sessions || [];
  const conceptsById = new Map((graph?.concepts || []).map((concept) => [concept.id, concept]));
  const links = [];
  for (const session of sessions) {
    const sessionMatches = (graph?.resources || [])
      .find((resource) => resource?.id === resourceId)
      ?.sessionRefs?.some((ref) => ref === session.id || ref === session.number);
    for (const section of session.sections || []) {
      const sectionMatches = (section.resourceRefs || []).includes(resourceId);
      if (!sessionMatches && !sectionMatches) continue;
      for (const conceptId of section.conceptRefs || []) {
        const concept = conceptsById.get(conceptId);
        links.push({ id: conceptId, label: concept?.term || section.topic || '' });
      }
    }
  }
  return normalizeConceptLinks(links);
}

function appendUnique(rows, source) {
  if (!source?.id && !source?.title) return;
  const key = `${source.id || ''}|${source.doi || ''}|${source.url || ''}|${source.title || ''}`.toLowerCase();
  if (
    rows.some(
      (entry) => `${entry.id || ''}|${entry.doi || ''}|${entry.url || ''}|${entry.title || ''}`.toLowerCase() === key,
    )
  ) {
    return;
  }
  rows.push(source);
}

export function buildSourceLedgerFromCourseGraph(courseGraph, { checkedAt = '' } = {}) {
  if (!courseGraph || typeof courseGraph !== 'object') return null;
  const rows = [];
  const courseIRRows = Array.isArray(courseGraph.courseIR?.sourceLedger) ? courseGraph.courseIR.sourceLedger : [];
  courseIRRows.forEach((entry, index) =>
    appendUnique(
      rows,
      normalizeTrustedSource(
        {
          provider: entry.provider || 'courseir',
          sourceType: entry.sourceType || 'courseir-ledger-row',
          ...entry,
        },
        { fallbackId: `SL${index + 1}`, checkedAt },
      ),
    ),
  );

  for (const resource of courseGraph.resources || []) {
    if (!resource || typeof resource !== 'object') continue;
    const provider = resource.provider || resource.origin || 'course-resource';
    appendUnique(
      rows,
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
    );
  }

  for (const reading of courseGraph.readings || []) {
    if (!reading || typeof reading !== 'object') continue;
    appendUnique(
      rows,
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
    );
  }

  if (rows.length === 0) return null;
  return {
    rows,
    summary: {
      sourceCount: rows.length,
      trustedCount: rows.filter((row) => TRUSTED_PROVIDERS.has(row.provider)).length,
      accessibleCount: rows.filter(isSourceAccessible).length,
      licenseAmbiguousCount: rows.filter((row) => row.licenseAmbiguous).length,
      providers: [...new Set(rows.map((row) => row.provider).filter(Boolean))].sort(),
    },
  };
}

export function buildSourceReportMarkdown({
  courseName = 'Course',
  sourceLedger = null,
  sourceRefCoverage = null,
} = {}) {
  const rows = sourceLedger?.rows || [];
  if (rows.length === 0 && !sourceRefCoverage) return '';
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
