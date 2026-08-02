import { isCourseAwareWeakSource } from './knowledge/sourceLedger.js';

const SHINGLE_WORDS = 8;
const LEARNER_SOURCE_RECORD_COLLECTION_RE = /^(?:sources|requiredTexts|readings|resources|entries)$/i;
const DISTINCTIVE_MARKER_STOPWORDS = new Set([
  'analysis',
  'article',
  'best',
  'course',
  'data',
  'evidence',
  'framework',
  'lesson',
  'method',
  'model',
  'open',
  'pipeline',
  'python',
  'research',
  'review',
  'source',
  'study',
  'system',
  'tool',
  'tools',
  'visualization',
]);

function compactText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuarantinedEvidenceText(value) {
  return compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addShingles(value, phrases) {
  const words = normalizeQuarantinedEvidenceText(value).split(' ').filter(Boolean);
  if (words.length < SHINGLE_WORDS) return;
  for (let index = 0; index + SHINGLE_WORDS <= words.length; index += 1) {
    phrases.add(words.slice(index, index + SHINGLE_WORDS).join(' '));
  }
}

function courseScopeWords(courseMap, courseGraph) {
  const values = [
    courseMap?.courseName,
    courseMap?.title,
    courseGraph?.course?.name,
    courseGraph?.course?.title,
    ...(courseMap?.lessons || []).flatMap((lesson) => [lesson?.title, lesson?.topic, lesson?.objectives]),
  ];
  return new Set(normalizeQuarantinedEvidenceText(values.flat(Infinity).filter(Boolean).join(' ')).split(' '));
}

function distinctiveCitationMarkers(citation, scopeWords) {
  const title = compactText(citation?.displayTitle || citation?.title || citation?.citation || '');
  const evidence = compactText(citation?.evidence || citation?.abstract || citation?.snippet || '');
  const candidateWords = `${title} ${evidence}`.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
  return candidateWords.filter((word) => {
    const normalized = word.toLowerCase();
    if (scopeWords.has(normalized) || DISTINCTIVE_MARKER_STOPWORDS.has(normalized)) return false;
    return /^[A-Z0-9]{3,}$/.test(word) || /[a-z][A-Z]|[A-Z][a-z]+[A-Z]/.test(word);
  });
}

export function buildReviewOnlySourceEvidenceQuarantine(sources = [], { courseScope = '' } = {}) {
  const phrases = new Set();
  const markers = new Set();
  const sourceIdentityExactValues = new Set();
  const scopeWords = new Set(normalizeQuarantinedEvidenceText(courseScope).split(' ').filter(Boolean));
  const rejectedSources = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const title = compactText(source?.displayTitle || source?.title || source?.citation || '');
    const evidence = compactText(source?.evidence || source?.abstract || source?.snippet || '');
    addShingles(title, phrases);
    addShingles(evidence, phrases);
    for (const identity of [source?.url, source?.sourceUrl, source?.doi]) {
      const normalized = normalizeQuarantinedEvidenceText(identity);
      if (normalized) sourceIdentityExactValues.add(normalized);
    }
    distinctiveCitationMarkers(source, scopeWords).forEach((marker) => markers.add(marker.toLowerCase()));
    rejectedSources.push({ lessonId: source?.scope || '', title, evidence });
  }
  if (phrases.size === 0 && markers.size === 0 && sourceIdentityExactValues.size === 0) return null;
  return {
    protocol: 'review-only-source-evidence-quarantine-v1',
    rejectedLessonScopes: new Set(),
    phrases,
    markers,
    sourceIdentityExactValues,
    rejectedSources,
  };
}

function lessonTitleFor(courseMap, courseGraph, lessonId) {
  const number = Math.max(0, Number(String(lessonId).match(/(\d+)$/)?.[1]) || 0);
  return compactText(
    courseMap?.lessons?.[number - 1]?.title ||
      courseMap?.lessons?.[number - 1]?.topic ||
      courseGraph?.sessions?.[number - 1]?.title ||
      `Lesson ${number}`,
  );
}

/**
 * Build a deterministic learner-content quarantine from coarse-grained Scion
 * evidence. A citation that fails course-aware relevance remains in the
 * source ledger for honest review, but its overlay cannot be projected into
 * learner deliverables. Because legacy overlays do not bind each generated
 * sentence to one citation, one rejected citation makes that lesson overlay
 * non-separable and therefore fail-closed.
 */
export function collectRejectedLearnerSourceEvidence({ courseMap = null, courseGraph = null } = {}) {
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent;
  if (!lessonContent || typeof lessonContent !== 'object') return null;

  const phrases = new Set();
  const markers = new Set();
  const rejectedLessonScopes = new Set();
  const rejectedSources = [];
  const sourceIdentityExactValues = new Set();
  const overlayTermsByLesson = new Map();
  const overlayExactValuesByLesson = new Map();
  const sourceAssertionExactValuesByLesson = new Map();
  const scopeWords = courseScopeWords(courseMap, courseGraph);

  for (const [lessonId, payload] of Object.entries(lessonContent)) {
    const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
    if (citations.length === 0) continue;
    const lessonTitle = lessonTitleFor(courseMap, courseGraph, lessonId);
    const evaluated = citations.map((citation) => ({
      citation,
      weak: isCourseAwareWeakSource(
        {
          ...citation,
          title: citation?.displayTitle || citation?.title,
          conceptLinks: [
            { id: lessonId, label: lessonTitle },
            ...(Array.isArray(citation?.conceptLinks) ? citation.conceptLinks : []),
          ],
        },
        courseGraph,
      ),
    }));
    const rejected = evaluated.filter((entry) => entry.weak);
    if (rejected.length === 0) continue;

    rejectedLessonScopes.add(lessonId);
    rejected.forEach(({ citation }) => {
      const title = compactText(citation?.displayTitle || citation?.title || citation?.citation || '');
      const evidence = compactText(citation?.evidence || citation?.abstract || citation?.snippet || '');
      addShingles(title, phrases);
      addShingles(evidence, phrases);
      for (const identity of [citation?.sourceUrl, citation?.url, citation?.doi]) {
        const normalized = normalizeQuarantinedEvidenceText(identity);
        if (normalized) sourceIdentityExactValues.add(normalized);
      }
      distinctiveCitationMarkers(citation, scopeWords).forEach((marker) => markers.add(marker.toLowerCase()));
      rejectedSources.push({ lessonId, title, evidence });
    });

    // Citation shingles capture source-owned facts. A small exact-value set
    // catches the research shell that wrapped those facts, but only inside the
    // owning study guide. Do not harvest arbitrary overlay prose (for example
    // “compare two interpretations”): deleting shared compiler scaffolding
    // would collapse healthy question diversity.
    const exactValues = new Set(
      [
        payload?.studyGuide?.summary,
        payload?.studyGuide?.reviewStrategy,
        payload?.kernel?.scenario?.setup,
        payload?.kernel?.scenario?.materials,
        payload?.discussionPrompt?.prompt,
        payload?.discussionPrompt?.tension,
        ...(Array.isArray(payload?.discussionPrompt?.positions) ? payload.discussionPrompt.positions : []),
      ]
        .map(normalizeQuarantinedEvidenceText)
        .filter((value) => value.split(' ').length >= 4),
    );
    overlayExactValuesByLesson.set(lessonId, exactValues);
    const assertionValues = [];
    const collectAssertions = (values) => {
      for (const value of Array.isArray(values) ? values : []) {
        if (typeof value === 'string') assertionValues.push(value);
      }
    };
    collectAssertions(payload?.kernel?.facts);
    for (const term of Array.isArray(payload?.keyTerms) ? payload.keyTerms : []) {
      collectAssertions([term?.definition, term?.example]);
    }
    for (const slide of Array.isArray(payload?.slideContent) ? payload.slideContent : []) {
      collectAssertions(slide?.bullets);
      collectAssertions([slide?.notes]);
    }
    sourceAssertionExactValuesByLesson.set(
      lessonId,
      new Set(assertionValues.map(normalizeQuarantinedEvidenceText).filter((value) => value.split(' ').length >= 4)),
    );

    const lessonTerms = new Set();
    for (const entry of Array.isArray(payload?.keyTerms) ? payload.keyTerms : []) {
      const term = normalizeQuarantinedEvidenceText(entry?.term || '');
      const termWords = term.split(' ').filter(Boolean);
      if (
        termWords.length > 0 &&
        !termWords.some((word) => scopeWords.has(word)) &&
        termWords.some((word) => !DISTINCTIVE_MARKER_STOPWORDS.has(word))
      ) {
        lessonTerms.add(term);
      }
    }
    overlayTermsByLesson.set(lessonId, lessonTerms);
  }

  if (rejectedLessonScopes.size === 0) return null;
  return {
    protocol: 'course-aware-source-evidence-quarantine-v1',
    rejectedLessonScopes,
    phrases,
    markers,
    rejectedSources,
    sourceIdentityExactValues,
    overlayTermsByLesson,
    overlayExactValuesByLesson,
    sourceAssertionExactValuesByLesson,
  };
}

export function containsRejectedLearnerSourceEvidence(
  value,
  quarantine,
  lessonScope = '',
  { includeOverlayShell = true } = {},
) {
  if (!quarantine || typeof value !== 'string') return false;
  const normalized = normalizeQuarantinedEvidenceText(value);
  if (!normalized) return false;
  for (const phrase of quarantine.phrases || []) {
    if (normalized.includes(phrase)) return true;
  }
  const words = new Set(normalized.split(' '));
  for (const marker of quarantine.markers || []) {
    if (words.has(marker)) return true;
  }
  for (const identity of quarantine.sourceIdentityExactValues || []) {
    if (identity && normalized.includes(identity)) return true;
  }
  if (lessonScope) {
    for (const exactValue of quarantine.sourceAssertionExactValuesByLesson?.get(lessonScope) || []) {
      if (normalized.includes(exactValue)) return true;
    }
    if (includeOverlayShell) {
      for (const exactValue of quarantine.overlayExactValuesByLesson?.get(lessonScope) || []) {
        if (normalized.includes(exactValue)) return true;
      }
    }
    for (const term of quarantine.overlayTermsByLesson?.get(lessonScope) || []) {
      if (term && normalized.includes(term)) return true;
    }
  }
  return false;
}

function removeRejectedFragments(value, quarantine, lessonScope = '') {
  const fragments = String(value).match(/[^.!?;]+[.!?;]?/g) || [String(value)];
  return fragments
    .filter((fragment) => !containsRejectedLearnerSourceEvidence(fragment, quarantine, lessonScope))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** Remove rejected research only from learner-authoritative data. The source
 * graph is intentionally not passed here, so its audit trail remains exact. */
export function quarantineRejectedLearnerContent(node, quarantine) {
  if (!quarantine) return { data: node, changed: false, repairedStrings: 0 };
  let repairedStrings = 0;

  const containsRejectedInNode = (value, lessonScope = '') => {
    if (typeof value === 'string') return containsRejectedLearnerSourceEvidence(value, quarantine, lessonScope);
    if (Array.isArray(value)) return value.some((entry) => containsRejectedInNode(entry, lessonScope));
    if (!value || typeof value !== 'object') return false;
    return Object.values(value).some((entry) => containsRejectedInNode(entry, lessonScope));
  };

  const visit = (value, lessonScope = '', parentKey = '') => {
    if (typeof value === 'string') {
      if (!containsRejectedLearnerSourceEvidence(value, quarantine, lessonScope)) return value;
      repairedStrings += 1;
      return removeRejectedFragments(value, quarantine, lessonScope);
    }
    if (Array.isArray(value)) {
      let changed = false;
      const next = value.flatMap((entry) => {
        if (LEARNER_SOURCE_RECORD_COLLECTION_RE.test(parentKey) && containsRejectedInNode(entry, lessonScope)) {
          repairedStrings += 1;
          changed = true;
          return [];
        }
        const repaired = visit(entry, lessonScope, parentKey);
        if (repaired !== entry) changed = true;
        if (typeof repaired === 'string' && !repaired.trim()) return [];
        return [repaired];
      });
      return changed || next.length !== value.length ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    let changed = false;
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      let repaired;
      if (key === 'lessons' && Array.isArray(entry)) {
        let lessonChanged = false;
        const lessons = entry.map((lesson, index) => {
          const nextLesson = visit(lesson, `lesson-${index + 1}`, 'lessons');
          if (nextLesson !== lesson) lessonChanged = true;
          return nextLesson;
        });
        repaired = lessonChanged ? lessons : entry;
      } else {
        const explicitNumber = Number(value?.lessonNumber);
        const explicitScope =
          String(value?.lessonId || '').trim() ||
          (Number.isInteger(explicitNumber) && explicitNumber > 0 ? `lesson-${explicitNumber}` : lessonScope);
        repaired = visit(entry, explicitScope, key);
      }
      if (repaired !== entry) changed = true;
      next[key] = repaired;
    }
    return changed ? next : value;
  };

  const data = visit(node);
  return { data, changed: data !== node, repairedStrings };
}
