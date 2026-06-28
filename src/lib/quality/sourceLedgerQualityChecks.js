function rows(manifest) {
  return Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
}

function reviewRows(manifest) {
  return Array.isArray(manifest?.sourceReviewRows) ? manifest.sourceReviewRows : [];
}

function hasRef(row) {
  return /^https?:\/\//i.test(String(row?.url || '')) || /\S/.test(String(row?.doi || ''));
}

const TRUST_ELIGIBLE_PROVIDERS = new Set([
  'genome',
  'genome-prerequisite',
  'openalex',
  'openstax',
  'eric',
  'source-finder',
  'crossref',
  'wikipedia',
]);

const REVIEW_ONLY_PROVIDERS = new Set(['courseir', 'instructor', 'instructor-provided', 'openlibrary']);

const PROJECT_MANAGEMENT_COURSE_RE =
  /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|stakeholder\s+analysis|project\s+scheduling|project\s+life\s+cycle)\b/i;
const PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE =
  /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|project\s+risk|project\s+controls|project\s+scheduling|earned\s+value|agile|scrum|kanban|project\s+governance|project\s+life\s+cycle|resource\s+planning|procurement\s+management|deliverable\s+acceptance|portfolio\s+management|construction\s+project|software\s+project)\b/i;
const PROJECT_MANAGEMENT_FALSE_FRIEND_RE =
  /\b(?:audit\s+quality|auditor\s+independence|audit\s+firm|financial\s+reporting|financial\s+statements?|earnings\s+management|external\s+audit|internal\s+audit|accounting\s+audit)\b/i;
const USER_EXPERIENCE_COURSE_RE =
  /\b(?:user\s+experience|ux\b|human[-\s]?centered\s+design|interaction\s+design|interface\s+design|usability|design\s+studio)\b/i;
const USER_EXPERIENCE_SOURCE_ANCHOR_RE =
  /\b(?:user[-\s]+experience|ux\b|human[-\s]?centered\s+design|human[-\s]?computer\s+interaction|human[-\s]?ai\s+interaction|hci\b|hai\b|user\s+interfaces?|interface\s+design|usability|design\s+research|user\s+research|personas?\b(?!\s*5)|journey\s+maps?|customer\s+journey|information\s+architecture|wirefram|prototype|interaction\s+design|accessibility|inclusive\s+design|design\s+handoff|design\s+studio|co[-\s]?design|service\s+design|material\s+experience|design\s+patterns?|screen\s+flows?|navigation|portfolio\s+case\s+study|critique\s+session|a\/b\s+test(?:ing)?)\b/i;
const USER_EXPERIENCE_FALSE_FRIEND_RE =
  /(?:\bstudio\s+ghibli\b|\bspiritual\s+practice\b|\bstrategic\s+planning\b|\bchuck\s+swindoll\b|\bpre[-\s]?service\s+teachers?\b|\bteacher\s+education\b|\bprototype\s+\(video\s+game\)|\baction[-\s]?adventure\s+video\s+game\b|\bradical\s+entertainment\b|\bactivision\b|\bplaystation\b|\bxbox\b|\bprototype[-\s]?based\s+programming\b|\bprototype[-\s]?oriented\s+programming\b|\bprototypal\s+inheritance\b|\bclassless\s+programming\b|\bobject[-\s]?oriented\s+programming\b|\bmercator\s+projection\b|\bmap\s+projection\b|\bcylindrical\s+map\s+projection\b|\brhumb\s+lines?\b|\bmechatronics\b|\bmachine\s+design\b|\bmanufacturing\b|\bpositive\s+feedback\b|\bnegative\s+feedback\b|\bclimate\s+change\s+feedbacks?\b|\bpersona\s+\d+(?:\s+(?:golden|revival))?\b|\bpersona\s+\(series\)|\brevelations:\s*persona\b|\bmegami\s+tensei\b|\batlus\b|\bp[-\s]?studio\b|\brole[-\s]?playing\s+video\s+game\b|\bbrief\s+interviews\s+with\s+hideous\s+men\b|\baircraft\s+design\s+process\b|\bprocess\s+design\s+and\s+process\s+control\b|\bifac\s+workshop\b|\bshoe\s+production\s+facilities\b|\bblocplan\b|\bsystematic\s+layout\s+planning\b|\blayout\s+of\s+shoe\s+production\b|\blayout\s+editor\s+configuration\b|\bmetaverse\s+beyond\s+the\s+hype\b|\bpatterns\s+2\.0\b|\blead[-\s]?user\s+theory\b|\bcommercially\s+attractive\s+user\s+innovations\b|\bweb\s+gis\s+in\s+practice\b|\bmicrosoft\s+kinect\b|\bintralogistics\s+processes\b|\bgreen\s+studio\s+handbook\b|\benvironmental\s+strategies\s+for\s+schematic\s+design\b|\bnational\s+design\s+studio\b|\ble\s+mans\s+prototype\b|\bin\s+living\s+color\s+sketches\b|\bsketch\s+comedy\b|\bcomedy\s+sketch(?:es)?\b|\btelevision\s+sketch(?:es)?\b|\barchitectural\s+education\b|\bcollaborative\s+learning\s+in\s+architectur(?:e|al)\b)/i;
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

function ambiguousLicense(row) {
  const license = String(row?.license || '')
    .trim()
    .toLowerCase();
  return (
    row?.licenseAmbiguous === true ||
    !license ||
    /^(open access|open license|unknown|(?:[\w.-]+\s+)*public metadata|metadata only|instructor review required|review required|varies|mixed)$/.test(
      license,
    )
  );
}

function isTrustedBibliographyRow(row) {
  const provider = String(row?.provider || '').toLowerCase();
  return (
    TRUST_ELIGIBLE_PROVIDERS.has(provider) &&
    !REVIEW_ONLY_PROVIDERS.has(provider) &&
    hasRef(row) &&
    !ambiguousLicense(row)
  );
}

function hasConceptLinks(row) {
  return (
    Array.isArray(row?.conceptLinks) && row.conceptLinks.some((link) => String(link?.id || link?.label || link).trim())
  );
}

function isTrustedConceptLinkedBibliographyRow(row) {
  return isTrustedBibliographyRow(row) && hasConceptLinks(row);
}

function isProjectManagementManifest(manifest) {
  const courseText = [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    manifest?.pipeline?.knowledgeBackbone,
    manifest?.pipeline?.courseGraph,
  ]
    .filter(Boolean)
    .join(' ');
  return PROJECT_MANAGEMENT_COURSE_RE.test(courseText);
}

function isUserExperienceManifest(manifest) {
  const courseText = [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    manifest?.pipeline?.knowledgeBackbone,
    manifest?.pipeline?.courseGraph,
  ]
    .filter(Boolean)
    .join(' ');
  return USER_EXPERIENCE_COURSE_RE.test(courseText);
}

function rowSearchText(row) {
  return [row?.title, row?.citation, row?.evidence, row?.sourceType, row?.scope].filter(Boolean).join(' ');
}

function rowConceptText(row) {
  return (Array.isArray(row?.conceptLinks) ? row.conceptLinks : [])
    .map((link) => (typeof link === 'string' ? link : link?.label || link?.id || ''))
    .filter(Boolean)
    .join(' ');
}

function isProjectManagementFalseFriendSource(row, manifest) {
  if (!isProjectManagementManifest(manifest)) return false;
  const text = rowSearchText(row);
  if (!PROJECT_MANAGEMENT_FALSE_FRIEND_RE.test(text)) return false;
  return !PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE.test(text);
}

function hasUserExperienceTopicAnchor(row) {
  const conceptText = rowConceptText(row);
  const text = rowSearchText(row);
  return USER_EXPERIENCE_TOPIC_ANCHORS.some(({ concept, source }) => concept.test(conceptText) && source.test(text));
}

function isUserExperienceWeakSource(row, manifest) {
  if (!isUserExperienceManifest(manifest)) return false;
  const text = rowSearchText(row);
  if (USER_EXPERIENCE_FALSE_FRIEND_RE.test(text)) return true;
  return !USER_EXPERIENCE_SOURCE_ANCHOR_RE.test(text) && !hasUserExperienceTopicAnchor(row);
}

function sourceCoverageTotal(coverage) {
  if (!coverage || typeof coverage !== 'object') return 0;
  const explicit = Number(coverage?.totals?.total);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Object.values(coverage?.categories || {}).reduce((sum, proof) => sum + (Number(proof?.total) || 0), 0);
}

function sourceCoverageLedgerRows(coverage) {
  const explicit = Number(coverage?.sourceLedgerRows);
  return Number.isFinite(explicit) && explicit >= 0 ? explicit : null;
}

function parseReportedOpenResourceCount(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return null;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ');
  const match = text.match(/\b(\d+)\s+open resources?\b/i);
  return match ? Number(match[1]) : null;
}

export function hasSourceLedgerProof(manifest) {
  return Boolean(
    rows(manifest).length ||
    reviewRows(manifest).length ||
    manifest?.courseIR?.sourceRefCoverage ||
    manifest?.sourceReport?.sourceRefCoverage,
  );
}

export function expectsSourceLedgerProof(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return false;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ')
    .toLowerCase();
  return /\b(?:genome|openalex|openlibrary|openstax|source-finder|source ledger|sourceref|source ref|knowledgebackbone|citation|limited knowledge check|native authoring|courseir)\b/.test(
    text,
  );
}

export function shouldCheckSourceLedger(manifest) {
  return hasSourceLedgerProof(manifest) || expectsSourceLedgerProof(manifest);
}

export function checkSourceLedger(findings, { files, manifest }) {
  const ledger = rows(manifest);
  const review = reviewRows(manifest);
  const coverage = manifest?.courseIR?.sourceRefCoverage || manifest?.sourceReport?.sourceRefCoverage || null;
  const reportPath = manifest?.sourceReport?.path || 'SOURCE_REPORT.md';
  const reportedOpenResources = parseReportedOpenResourceCount(manifest);
  const exportedSourceRows = ledger.length + review.length;
  const coverageTotal = sourceCoverageTotal(coverage);
  const coverageLedgerRows = sourceCoverageLedgerRows(coverage);
  const trustedBibliographyRows = ledger.filter(isTrustedBibliographyRow);
  const trustedConceptLinkedBibliographyRows = ledger.filter(isTrustedConceptLinkedBibliographyRow);

  if (ledger.length === 0 && review.length === 0 && !coverage) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: 'source-backed pipeline did not export sourceLedger, sourceRef coverage, or SOURCE_REPORT.md proof',
      evidence: JSON.stringify(manifest?.pipeline || {}).slice(0, 200),
    });
    return;
  }

  if (!files.some((file) => file.path === reportPath)) {
    findings.add({
      severity: 'P1',
      dimension: 'structure',
      file: reportPath,
      detail: 'source ledger proof is present but the package does not include the declared source report',
      evidence: reportPath,
    });
  }

  const ids = new Set();
  for (const row of ledger) {
    const id = String(row?.id || '').trim();
    if (!id || ids.has(id)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: 'source ledger row has a missing or duplicate id',
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (id) ids.add(id);
    if (!String(row?.title || row?.evidence || '').trim()) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no title or evidence`,
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (!hasRef(row) && !['courseir', 'instructor', 'instructor-provided'].includes(row?.provider)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no accessible URL or DOI`,
        evidence: row?.title || row?.evidence || JSON.stringify(row).slice(0, 120),
      });
    }
    if (ambiguousLicense(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has ambiguous or missing license`,
        evidence: row?.license || row?.title || row?.evidence || id,
      });
    }
    if (coverageTotal >= 12 && isTrustedBibliographyRow(row) && !hasConceptLinks(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is trusted metadata but is not concept-linked`,
        evidence: row?.title || row?.evidence || id,
      });
    }
    if (isTrustedConceptLinkedBibliographyRow(row) && isProjectManagementFalseFriendSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for Project Management`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
    if (isTrustedConceptLinkedBibliographyRow(row) && isUserExperienceWeakSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for User Experience Design Studio`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
  }

  for (const row of review) {
    const id = String(row?.id || '').trim();
    findings.add({
      severity: 'P2',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail: `source review row ${id || '(missing id)'} is not trusted bibliography proof`,
      evidence: row?.title || row?.evidence || JSON.stringify(row).slice(0, 120),
    });
  }

  if (Number.isFinite(reportedOpenResources) && reportedOpenResources > exportedSourceRows) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: `pipeline reported ${reportedOpenResources} open resource(s) but the package exported ${exportedSourceRows} source proof row(s)`,
      evidence: JSON.stringify(manifest?.pipeline || {}).slice(0, 200),
    });
  }

  if (coverageTotal >= 12 && trustedConceptLinkedBibliographyRows.length <= 1) {
    findings.add({
      severity: 'P1',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail: `sourceRef coverage is too thin: ${coverageTotal} atom(s) rely on ${trustedConceptLinkedBibliographyRows.length} trusted concept-linked source row(s)`,
      evidence: JSON.stringify({
        sourceLedgerRows: ledger.length,
        trustedSourceLedgerRows: trustedBibliographyRows.length,
        trustedConceptLinkedSourceLedgerRows: trustedConceptLinkedBibliographyRows.length,
        coverageTotal,
        providers: ledger.map((row) => row.provider).filter(Boolean),
      }).slice(0, 200),
    });
  }

  if (
    coverageTotal >= 12 &&
    trustedConceptLinkedBibliographyRows.length > 1 &&
    Number.isFinite(coverageLedgerRows) &&
    coverageLedgerRows <= 1 &&
    review.length > 0
  ) {
    findings.add({
      severity: 'P1',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail: `sourceRef coverage is not wired to trusted concept-linked source ledger rows: ${coverageTotal} atom(s) report coverage through ${coverageLedgerRows} CourseIR source row(s) while ${trustedConceptLinkedBibliographyRows.length} trusted concept-linked exported source row(s) exist`,
      evidence: JSON.stringify({
        sourceLedgerRows: ledger.length,
        trustedSourceLedgerRows: trustedBibliographyRows.length,
        trustedConceptLinkedSourceLedgerRows: trustedConceptLinkedBibliographyRows.length,
        courseIrSourceLedgerRows: coverageLedgerRows,
        sourceReviewRows: review.length,
        coverageTotal,
      }).slice(0, 200),
    });
  }

  for (const [category, proof] of Object.entries(coverage?.categories || {})) {
    const total = Number(proof?.total) || 0;
    const withRefs = Number(proof?.withRefs) || 0;
    const danglingRefs = Number(proof?.danglingRefs) || 0;
    if (total > 0 && withRefs < total) {
      findings.add({
        severity: category === 'factualClaims' ? 'P1' : 'P2',
        dimension: category === 'factualClaims' ? 'honesty' : 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} sourceRef coverage is incomplete (${withRefs}/${total})`,
        evidence: (proof?.missingIds || []).join(', ') || `${withRefs}/${total}`,
      });
    }
    if (danglingRefs > 0) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} contains ${danglingRefs} sourceRef(s) that do not resolve to the source ledger`,
        evidence: JSON.stringify(proof).slice(0, 160),
      });
    }
  }
}
