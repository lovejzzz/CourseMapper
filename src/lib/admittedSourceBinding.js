function clean(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferredProvider(source = {}, authorityKind = '') {
  const explicit = clean(source.provider).toLowerCase();
  if (explicit) return explicit;
  const url = clean(source.url).toLowerCase();
  if (url.includes('wals.info/')) return 'wals';
  if (url.includes('wikipedia.org/')) return 'wikipedia';
  if (url.includes('openstax.org/')) return 'openstax';
  if (url.includes('doaj.org/')) return 'doaj';
  if (url.includes('openalex.org/')) return 'openalex';
  if (url.includes('crossref.org/') || url.includes('doi.org/')) return 'crossref';
  if (/shipped-source-library/i.test(authorityKind)) return 'genome';
  return '';
}

function originForAuthority(authorityKind = '', fallback = 'prospective-evidence-binding') {
  if (/curated-authentic-language-evidence/i.test(authorityKind)) return 'authentic-language-data';
  if (/verified-open-research/i.test(authorityKind)) return 'algi-research';
  if (/shipped-source-library/i.test(authorityKind)) return 'genome';
  return fallback;
}

function sourceLine(source = {}) {
  const title = clean(source.title || source.id || 'Assigned source');
  const details = [clean(source.license), clean(source.url)].filter(Boolean).join(' — ');
  return details ? `${title} (${details})` : title;
}

function sourceResourceId(prefix, lessonNumber, sourceIndex) {
  return `${prefix}-${lessonNumber}-${sourceIndex + 1}`;
}

function canonicalSourceIdentity(source = {}) {
  const url = clean(source.url).toLowerCase().replace(/\/$/, '');
  if (url) return `url:${url}`;
  return `title:${clean(source.title).toLowerCase()}|license:${clean(source.license).toLowerCase()}`;
}

function dedupeSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    const identity = canonicalSourceIdentity(source);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function identityTokens(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !/^(?:evidence|introduct|language|lesson|source|visual|week)$/.test(token))
    .map((token) => token.replace(/(?:ation|ments?|ing|ed|es|s)$/i, ''))
    .filter(Boolean);
}

function sourceMatchesLessonIdentity(source = {}, lesson = {}) {
  const lessonTokens = new Set(
    identityTokens(
      [
        lesson?.title,
        ...(Array.isArray(lesson?.sections) ? lesson.sections.map((section) => section?.topicSection) : []),
      ].join(' '),
    ),
  );
  return identityTokens(source?.title).some((token) => lessonTokens.has(token));
}

/**
 * Project the exact sources that earned Stage-2 authority back onto the
 * learner-visible map and the CourseGraph resource edges. Planning receipts
 * alone are not enough: exporters and dependency checks consume these
 * surfaces, so leaving compiler scaffolds attached would make a verified
 * claim look review-only (or teach the scaffold as if it were a source).
 */
export function bindAdmittedSourcesToTeachingSurfaces(
  courseMap,
  courseGraph,
  governingSourceContract,
  { idPrefix = 'evidence-source', origin = 'prospective-evidence-binding' } = {},
) {
  const reboundMap = structuredClone(courseMap || {});
  const reboundGraph = structuredClone(courseGraph || {});
  const resources = Array.isArray(reboundGraph.resources) ? reboundGraph.resources : [];
  const sessions = Array.isArray(reboundGraph.sessions) ? reboundGraph.sessions : [];
  const addedResources = [];
  const supersededResourceRefs = new Set();

  (Array.isArray(reboundMap.lessons) ? reboundMap.lessons : []).forEach((lesson, lessonIndex) => {
    const lessonNumber = lessonIndex + 1;
    const authority = governingSourceContract?.byLessonId?.[`lesson-${lessonNumber}`];
    const teachingSourceIds = new Set(
      (Array.isArray(authority?.claims) ? authority.claims : [])
        .filter((claim) => claim?.claimRole !== 'source-passage')
        .flatMap((claim) => (Array.isArray(claim?.sourceIds) ? claim.sourceIds : []))
        .map(clean)
        .filter(Boolean),
    );
    const allAdmittedSources = Array.isArray(authority?.sources) ? authority.sources : [];
    const teachingSources =
      teachingSourceIds.size > 0
        ? allAdmittedSources.filter((source) => teachingSourceIds.has(clean(source?.id)))
        : allAdmittedSources;
    const identityMatchedSources = teachingSources.filter((source) => sourceMatchesLessonIdentity(source, lesson));
    const projectedSources = identityMatchedSources.length > 0 ? identityMatchedSources : teachingSources;
    const admittedSources = dedupeSources(
      projectedSources.filter((source) => clean(source?.title) && /^https:\/\//i.test(clean(source?.url))),
    );
    if (authority?.status !== 'admitted' || admittedSources.length === 0) return;

    const sourceLines = admittedSources.map(sourceLine).join('\n');
    lesson.sections = (Array.isArray(lesson.sections) ? lesson.sections : []).map((section) => ({
      ...section,
      supportingResources: sourceLines,
    }));

    const session = sessions.find((entry, index) => Number(entry?.number) === lessonNumber || index === lessonIndex);
    if (!session) return;
    for (const section of Array.isArray(session.sections) ? session.sections : []) {
      for (const resourceRef of Array.isArray(section?.resourceRefs) ? section.resourceRefs : []) {
        if (clean(resourceRef)) supersededResourceRefs.add(clean(resourceRef));
      }
    }
    const sourceRefs = admittedSources.map((source, sourceIndex) => {
      const resourceId = sourceResourceId(idPrefix, lessonNumber, sourceIndex);
      const authorityKind = clean(source.authorityKind || authority.authorityKind);
      addedResources.push({
        id: resourceId,
        title: clean(source.title),
        citation: sourceLine(source),
        kind: clean(source.kind) || 'verified open resource',
        sessionRefs: [session.id || lessonNumber, lessonNumber],
        origin: originForAuthority(authorityKind, origin),
        provider: inferredProvider(source, authorityKind),
        url: clean(source.url),
        license: clean(source.license),
        attribution: clean(source.attribution),
        sourceWorkId: clean(source.id),
        ...(source.supportReceipt ? { supportReceipt: structuredClone(source.supportReceipt) } : {}),
        authorityKind: authorityKind || 'verified-open-research',
        governingSourceReceiptSha256: clean(authority.receiptSha256),
      });
      return resourceId;
    });
    session.sections = (Array.isArray(session.sections) ? session.sections : []).map((section) => ({
      ...section,
      // Replace authoring scaffolds and aggregate packet labels. The exact
      // admitted URLs are the only source edges allowed to reach teaching.
      resourceRefs: [...sourceRefs],
    }));
  });

  const addedIds = new Set(addedResources.map((resource) => resource.id));
  const retainedResourceRefs = new Set(
    sessions.flatMap((session) =>
      (Array.isArray(session?.sections) ? session.sections : []).flatMap((section) =>
        Array.isArray(section?.resourceRefs) ? section.resourceRefs.map(clean).filter(Boolean) : [],
      ),
    ),
  );
  reboundGraph.resources = [
    ...resources.filter(
      (resource) =>
        !addedIds.has(resource?.id) &&
        (!supersededResourceRefs.has(clean(resource?.id)) || retainedResourceRefs.has(clean(resource?.id))),
    ),
    ...addedResources,
  ];
  reboundGraph.sessions = sessions;
  return { courseMap: reboundMap, courseGraph: reboundGraph };
}
