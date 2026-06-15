const SOURCE_AUDIT_OUTPUT_DIR = 'verification-output/professor-adoption-sources';

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value = '') {
  return cleanText(
    String(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function normalize(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value = '') {
  const stop = new Set([
    'and',
    'the',
    'for',
    'with',
    'course',
    'public',
    'source',
    'benchmark',
    'introduction',
    'intro',
    'mit',
    'yale',
    'uc',
    'berkeley',
    'harvard',
    'fall',
    'spring',
    'summer',
    'january',
    'iap',
    'prof',
    'dr',
  ]);
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function sourceHost(sourceUrl = '') {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sourceKind(sourceUrl = '') {
  const host = sourceHost(sourceUrl);
  if (host === 'ocw.mit.edu') return 'mit-ocw';
  if (host === 'oyc.yale.edu') return 'yale-oyc';
  if (host === 'cs50.harvard.edu') return 'harvard-cs50';
  if (host === 'data8.org') return 'berkeley-data8';
  if (host === 'cs61a.org') return 'berkeley-cs61a';
  return host || 'unknown';
}

function dataJsonUrl(sourceUrl = '') {
  return `${String(sourceUrl).replace(/\/+$/, '')}/data.json`;
}

function jsonTextFromValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(jsonTextFromValue).join(' ');
  if (typeof value === 'object') return Object.values(value).map(jsonTextFromValue).join(' ');
  return '';
}

function matchTerm(sourceText, term) {
  const source = normalize(sourceText);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  if (source.includes(normalizedTerm)) return true;
  const termTokens = tokens(term);
  if (termTokens.length === 0) return false;
  const matched = termTokens.filter((token) => source.includes(token));
  const required = termTokens.length <= 2 ? 1 : Math.max(2, Math.ceil(termTokens.length * 0.55));
  return matched.length >= required;
}

function matchName(sourceText, name) {
  const normalizedName = normalize(name);
  if (!normalizedName) return false;
  const source = normalize(sourceText);
  if (/\bcourse staff\b|\bstaff\b/i.test(name)) return source.includes('staff') || source.includes('course team');
  if (source.includes(normalizedName)) return true;
  const nameTokens = tokens(name);
  const lastName = nameTokens[nameTokens.length - 1];
  return Boolean(lastName && source.includes(lastName));
}

function matchMany(sourceText, values = []) {
  return values.map((value) => ({ value, matched: matchTerm(sourceText, value) }));
}

function minimumMatches(kind, count) {
  if (count <= 0) return 0;
  if (kind === 'sourceArtifacts') return Math.min(3, Math.max(1, Math.ceil(count * 0.25)));
  if (kind === 'primaryStudentWorkProducts') return Math.min(2, Math.max(1, Math.ceil(count * 0.2)));
  if (kind === 'assessmentArchitecture') return 1;
  if (kind === 'mustPreserveSignals') return Math.min(3, Math.max(1, Math.ceil(count * 0.25)));
  return 1;
}

function sourceFinding({
  manifest,
  severity = 'P2',
  scoreImpact = 4,
  sourceExpectation,
  observedOutput,
  failureClass,
  actionId,
  message,
  evidence = '',
  hardBlocker = false,
}) {
  return {
    caseId: manifest.id,
    sourceUrl: manifest.sourceUrl,
    dimension: 'sourceFidelity',
    severity: hardBlocker ? 'P0' : severity,
    scoreImpact,
    artifact: 'source manifest',
    sourceExpectation,
    observedOutput,
    failureClass,
    suspectedOwner: 'scripts/professor-adoption/sourceManifests.mjs',
    requiredRepairAction: actionId,
    acceptanceCriteria: [sourceExpectation],
    proofCommands: [`npm run audit:professor-adoption:sources -- --case ${manifest.id}`],
    message,
    evidence,
    hardBlocker,
  };
}

async function fetchSourceText(manifest, { fetchText }) {
  const kind = sourceKind(manifest.sourceUrl);
  if (kind === 'mit-ocw') {
    const checkedUrls = [dataJsonUrl(manifest.sourceUrl), manifest.sourceUrl];
    const [body, html] = await Promise.all(checkedUrls.map((url) => fetchText(url)));
    const data = JSON.parse(body);
    return {
      kind,
      checkedUrl: checkedUrls.join(' + '),
      checkedUrls,
      title: data.course_title || data.title || '',
      text: `${jsonTextFromValue(data)} ${stripHtml(html)}`,
    };
  }
  const urls = [manifest.sourceUrl, ...(manifest.sourceEvidenceUrls || [])];
  const bodies = await Promise.all(urls.map((url) => fetchText(url)));
  return {
    kind,
    checkedUrl: urls.join(' + '),
    checkedUrls: urls,
    title: '',
    text: bodies.map((body) => stripHtml(body)).join(' '),
  };
}

function scoreMatchedGroup({ manifest, sourceText, values, kind, label }) {
  const matches = matchMany(sourceText, values || []);
  const matched = matches.filter((entry) => entry.matched);
  const required = minimumMatches(kind, matches.length);
  if (matched.length >= required) return { matches, findings: [] };
  return {
    matches,
    findings: [
      sourceFinding({
        manifest,
        severity: kind === 'sourceArtifacts' ? 'P1' : 'P2',
        scoreImpact: kind === 'sourceArtifacts' ? 7 : 4,
        sourceExpectation: `${manifest.id} source page visibly supports at least ${required} ${label}.`,
        observedOutput: `${matched.length}/${matches.length} matched: ${matched.map((entry) => entry.value).join(', ') || 'none'}`,
        failureClass: 'source-provenance-gap',
        actionId: `repair-${kind}-source-provenance`,
        message: `${manifest.id} does not have enough visible source support for ${label}.`,
        evidence: matches
          .filter((entry) => !entry.matched)
          .slice(0, 5)
          .map((entry) => entry.value)
          .join('; '),
      }),
    ],
  };
}

export async function verifyProfessorAdoptionSource(manifest, { fetchText = defaultFetchText } = {}) {
  let source;
  try {
    source = await fetchSourceText(manifest, { fetchText });
  } catch (error) {
    const message = error?.message || String(error);
    const findings = [
      sourceFinding({
        manifest,
        hardBlocker: true,
        scoreImpact: 20,
        sourceExpectation: `${manifest.id} source URL is reachable and parseable.`,
        observedOutput: message,
        failureClass: 'source-access-failed',
        actionId: 'repair-source-access-or-source-url',
        message: `${manifest.id} source verification could not read ${manifest.sourceUrl}.`,
        evidence: message,
      }),
    ];
    return buildSourceResult({ manifest, source: null, findings, verification: { reachable: false, error: message } });
  }

  const titleMatched = matchTerm(source.text, manifest.title) || matchTerm(source.text, source.title);
  const instructorMatches = (manifest.publicInstructorNames || []).map((name) => ({
    value: name,
    matched: matchName(source.text, name),
  }));
  const groupResults = [
    scoreMatchedGroup({
      manifest,
      sourceText: source.text,
      values: manifest.sourceArtifacts,
      kind: 'sourceArtifacts',
      label: 'source artifacts',
    }),
    scoreMatchedGroup({
      manifest,
      sourceText: source.text,
      values: manifest.primaryStudentWorkProducts,
      kind: 'primaryStudentWorkProducts',
      label: 'student work products',
    }),
    scoreMatchedGroup({
      manifest,
      sourceText: source.text,
      values: manifest.assessmentArchitecture,
      kind: 'assessmentArchitecture',
      label: 'assessment architecture items',
    }),
    scoreMatchedGroup({
      manifest,
      sourceText: source.text,
      values: manifest.mustPreserveSignals,
      kind: 'mustPreserveSignals',
      label: 'course-specific content signals',
    }),
  ];

  const findings = groupResults.flatMap((result) => result.findings);
  if (!titleMatched) {
    findings.push(
      sourceFinding({
        manifest,
        severity: 'P1',
        scoreImpact: 8,
        sourceExpectation: `${manifest.id} source page title matches the manifest title.`,
        observedOutput: `Manifest title: ${manifest.title}; source title: ${source.title || 'not extracted'}`,
        failureClass: 'source-title-mismatch',
        actionId: 'repair-source-title-provenance',
        message: `${manifest.id} title is not visibly supported by the source page.`,
        evidence: source.title || manifest.title,
      }),
    );
  }
  const missingInstructors = instructorMatches.filter((entry) => !entry.matched);
  if (missingInstructors.length > 0) {
    findings.push(
      sourceFinding({
        manifest,
        severity: 'P1',
        scoreImpact: 8,
        sourceExpectation: `${manifest.id} source page visibly names every public instructor/course author in the manifest.`,
        observedOutput: `Missing: ${missingInstructors.map((entry) => entry.value).join(', ')}`,
        failureClass: 'source-instructor-mismatch',
        actionId: 'repair-source-instructor-provenance',
        message: `${manifest.id} has instructor names not visibly supported by the source page.`,
        evidence: missingInstructors.map((entry) => entry.value).join('; '),
      }),
    );
  }

  return buildSourceResult({
    manifest,
    source,
    findings,
    verification: {
      reachable: true,
      titleMatched,
      instructorMatches,
      sourceArtifacts: groupResults[0].matches,
      primaryStudentWorkProducts: groupResults[1].matches,
      assessmentArchitecture: groupResults[2].matches,
      mustPreserveSignals: groupResults[3].matches,
    },
  });
}

function buildSourceResult({ manifest, source, findings, verification }) {
  const score = Math.max(0, 100 - findings.reduce((sum, finding) => sum + (finding.scoreImpact || 0), 0));
  const hardBlockerCount = findings.filter((finding) => finding.hardBlocker || finding.severity === 'P0').length;
  const p1FindingCount = findings.filter((finding) => finding.severity === 'P1').length;
  const p2FindingCount = findings.filter((finding) => finding.severity === 'P2').length;
  const status = hardBlockerCount > 0 ? 'blocked' : p1FindingCount + p2FindingCount > 0 ? 'repair-required' : 'pass';
  return {
    caseId: manifest.id,
    title: manifest.title,
    sourceUrl: manifest.sourceUrl,
    publicInstructorNames: manifest.publicInstructorNames,
    disciplineFamily: manifest.disciplineFamily,
    modality: manifest.modality,
    sourceKind: source?.kind || sourceKind(manifest.sourceUrl),
    checkedUrl: source?.checkedUrl || manifest.sourceUrl,
    status,
    score,
    findingCount: findings.length,
    hardBlockerCount,
    p1FindingCount,
    p2FindingCount,
    findings,
    verification,
  };
}

export function summarizeProfessorSourceResults(results = []) {
  const scores = results.map((result) => result.score).filter(Number.isFinite);
  const findingCounts = results.reduce(
    (counts, result) => {
      for (const finding of result.findings || []) {
        counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      }
      return counts;
    },
    { P0: 0, P1: 0, P2: 0, P3: 0 },
  );
  return {
    status: results.some((result) => result.status === 'blocked')
      ? 'blocked'
      : results.some((result) => result.status === 'repair-required')
        ? 'repair-required'
        : 'pass',
    caseCount: results.length,
    passedCaseCount: results.filter((result) => result.status === 'pass').length,
    blockedCaseCount: results.filter((result) => result.status === 'blocked').length,
    repairRequiredCaseCount: results.filter((result) => result.status === 'repair-required').length,
    averageScore: scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1))
      : 0,
    minimumScore: scores.length ? Math.min(...scores) : 0,
    findingCounts,
    findingCount: Object.values(findingCounts).reduce((sum, count) => sum + count, 0),
  };
}

export async function defaultFetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'CourseMapper professor-adoption source verifier',
      accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
  return response.text();
}

export { SOURCE_AUDIT_OUTPUT_DIR };
