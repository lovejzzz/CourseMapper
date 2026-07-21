/**
 * Conservative lesson↔knowledge relevance checks shared by genome resolution,
 * persisted-project revalidation, and the final compiler boundary.
 *
 * A partial match on generic descriptor words (for example, matching
 * "Ballad (poetic form)" to a lesson that only says "Poetic Forms") is not
 * enough to import a specific knowledge kernel. Exact surface matches remain
 * eligible; partial matches must include at least one distinguishing token.
 */

const RAW_GENERIC_DESCRIPTOR_TOKENS = [
  'analysis',
  'approach',
  'argument',
  'assessment',
  'concept',
  'context',
  'course',
  'close',
  'data',
  'decision',
  'design',
  'evidence',
  'example',
  'form',
  'framework',
  'historical',
  'introduction',
  'interpretation',
  'language',
  'lesson',
  'literary',
  'literature',
  'method',
  'model',
  'narrative',
  'practice',
  'principle',
  'process',
  'poetic',
  'reading',
  'source',
  'species',
  'strategy',
  'structure',
  'system',
  'technique',
  'theory',
  'topic',
  'writing',
];

const IDENTITY_STOP_WORDS = new Set([
  'about',
  'after',
  'against',
  'along',
  'among',
  'and',
  'apply',
  'before',
  'between',
  'from',
  'into',
  'that',
  'their',
  'these',
  'this',
  'through',
  'using',
  'with',
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularToken(token) {
  if (/ies$/.test(token) && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:ing|ed|es)$/.test(token) && token.length > 5) return token.replace(/(?:ing|ed|es)$/, '');
  if (/s$/.test(token) && token.length > 4) return token.slice(0, -1);
  return token;
}

// Keep generic descriptors in the same normalized form as surfaces. Without
// this, "reading" becomes "read" during matching and is accidentally treated
// as distinctive even though it is only an academic activity label.
const GENERIC_DESCRIPTOR_TOKENS = new Set(RAW_GENERIC_DESCRIPTOR_TOKENS.map(singularToken));

export function semanticIdentityTokens(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IDENTITY_STOP_WORDS.has(token))
    .map(singularToken)
    .filter((token) => token.length >= 3);
}

export function isDiscriminativeSurfaceMatch(
  surfaceTokens = [],
  matchedTokens = [],
  { exactGenericMatch = true } = {},
) {
  const uniqueSurface = [...new Set(surfaceTokens)].filter(Boolean);
  const matched = new Set(matchedTokens);
  if (uniqueSurface.length === 0 || matched.size === 0) return false;
  const hasDistinguishingMatch = uniqueSurface.some(
    (token) => !GENERIC_DESCRIPTOR_TOKENS.has(token) && matched.has(token),
  );
  if (uniqueSurface.every((token) => matched.has(token))) return hasDistinguishingMatch || exactGenericMatch;
  return hasDistinguishingMatch;
}

function lessonSemanticTokenSet(lesson = {}) {
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  const values = [
    cleanText(lesson.title).replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, ''),
    ...(lesson.semanticIdentityTerms || []),
    ...(lesson.keyConcepts || []),
    ...(lesson.outcomes || []),
    ...(lesson.instructorNamedReadings || []),
    lesson.studentArtifact,
    lesson.assessmentLink,
    ...sections.flatMap((section) => [
      section?.topicSection,
      section?.learningGoals,
      section?.learningObjectives,
      section?.readings,
    ]),
  ];
  return new Set(values.flatMap(semanticIdentityTokens));
}

export function isLessonRelevantSemanticSurface(surface, lesson = {}) {
  const surfaceTokens = [...new Set(semanticIdentityTokens(surface))];
  const lessonTokens = lessonSemanticTokenSet(lesson);
  const matched = surfaceTokens.filter((token) => lessonTokens.has(token));
  return isDiscriminativeSurfaceMatch(surfaceTokens, matched);
}

function normalizedTermName(value) {
  return cleanText(value).toLowerCase();
}

function lessonTitleSurfaceWords(value) {
  return cleanText(value)
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !['and', 'for', 'from', 'lesson', 'selected', 'the', 'using', 'with'].includes(word));
}

/**
 * A complete, long lesson title is useful identity but not a reusable
 * disciplinary term. Small browser models occasionally return the title as
 * keyTerms[0]; kernel projection then repeats it through quiz scenarios,
 * answers, scoring guidance, tags, and FAQ copy. Preserve short legitimate
 * title concepts ("Close Reading") and reject only four-word title echoes or
 * title-contained fragments.
 */
export function isLessonTitleEchoSemanticSurface(value, lesson = {}) {
  const concept = cleanText(value)
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .replace(/[.!?]+$/, '')
    .toLowerCase();
  const title = cleanText(lesson?.title || lesson?.lessonTitle || lesson?.topicSection)
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .replace(/[.!?]+$/, '')
    .toLowerCase();
  if (!concept || !title) return false;
  const conceptWords = lessonTitleSurfaceWords(concept);
  const titleWords = new Set(lessonTitleSurfaceWords(title));
  if (concept === title) return conceptWords.length >= 4;
  const titleCoverage = conceptWords.length / Math.max(1, titleWords.size);
  // A legitimate disciplinary clause can sit inside a longer lesson title:
  // "The six classes of nutrients" within "…and the difference between
  // macronutrients and micronutrients" is useful vocabulary, not a title
  // echo. Reject only a fragment that covers most of the title, as the
  // observed "Tang Poetry using Li Bai" pseudo-term does.
  return conceptWords.length >= 4 && titleCoverage >= 0.6 && conceptWords.every((word) => titleWords.has(word));
}

function phraseOccurrenceCount(value, phrase) {
  const text = cleanText(value).toLowerCase();
  const target = cleanText(phrase).toLowerCase();
  if (!text || !target) return 0;
  return text.split(target).length - 1;
}

/**
 * Revalidates model-authored and cached payloads for the title-as-concept
 * failure. Raw multiple-choice atoms remain valuable, but compiler-projected
 * short-answer/essay atoms and a derived scenario depend on the rejected
 * pseudo-term and must be rebuilt by safe downstream fallbacks.
 */
export function sanitizeLessonTitleEchoEnrichment(lesson = {}, enrichment = null) {
  const emptyReceipt = {
    changed: false,
    rejectedTitleTerms: [],
    removedQuizItems: 0,
    removedSlides: 0,
    removedScenario: false,
  };
  if (!enrichment || typeof enrichment !== 'object') return { enrichment, receipt: emptyReceipt };

  const sourceTerms = Array.isArray(enrichment.keyTerms) ? enrichment.keyTerms : [];
  const rejectedTitleTerms = sourceTerms
    .map((term) => cleanText(term?.term || term?.tr))
    .filter((term) => term && isLessonTitleEchoSemanticSurface(term, lesson));
  if (rejectedTitleTerms.length === 0) return { enrichment, receipt: emptyReceipt };

  const rejected = new Set(rejectedTitleTerms.map(normalizedTermName));
  const keyTerms = sourceTerms.filter((term) => !rejected.has(normalizedTermName(term?.term || term?.tr)));
  const quizItems = (Array.isArray(enrichment.quizItems) ? enrichment.quizItems : [])
    .filter((item) => cleanText(item?.type).toLowerCase() === 'multiple_choice')
    .map((item) => ({
      ...item,
      ...(Array.isArray(item?.distractorRationales)
        ? {
            distractorRationales: item.distractorRationales.filter(
              (value) => !rejectedTitleTerms.some((term) => phraseOccurrenceCount(value, term) > 0),
            ),
          }
        : {}),
    }));
  const slideContent = (Array.isArray(enrichment.slideContent) ? enrichment.slideContent : []).filter(
    (slide) =>
      !rejectedTitleTerms.some(
        (term) =>
          normalizedTermName(slide?.title) === normalizedTermName(term) ||
          phraseOccurrenceCount(JSON.stringify(slide), term) >= 2,
      ),
  );
  const scenario = enrichment.kernel?.scenario;
  const removeScenario =
    cleanText(scenario?.source).toLowerCase() === 'derived-kernel-fallback' ||
    rejectedTitleTerms.some((term) => phraseOccurrenceCount(JSON.stringify(scenario || {}), term) >= 2);

  return {
    enrichment: {
      ...enrichment,
      enrichmentSource: cleanText(enrichment.enrichmentSource) || 'lesson-title-admission-repaired',
      keyTerms,
      quizItems,
      slideContent,
      kernel: {
        ...(enrichment.kernel || {}),
        ...(removeScenario ? { scenario: null } : {}),
      },
      semanticAdmissionReceipt: {
        ...(enrichment.semanticAdmissionReceipt || {}),
        titleEchoRepairApplied: true,
        rejectedTitleTerms,
      },
    },
    receipt: {
      changed: true,
      rejectedTitleTerms,
      removedQuizItems: Math.max(0, (enrichment.quizItems || []).length - quizItems.length),
      removedSlides: Math.max(0, (enrichment.slideContent || []).length - slideContent.length),
      removedScenario: removeScenario,
    },
  };
}

function isGenomeBacked(enrichment = {}) {
  const source = cleanText(enrichment?.conceptProvenance?.source || enrichment?.enrichmentSource).toLowerCase();
  return source.includes('genome');
}

function citationMatchesRejectedSource(citation, rejectedSources) {
  if (rejectedSources.size === 0) return false;
  const text =
    typeof citation === 'string'
      ? citation
      : [citation?.key, citation?.displayTitle, citation?.sourceUrl].filter(Boolean).join(' ');
  const normalized = normalizedTermName(text);
  return [...rejectedSources].some((source) => source && (normalized.includes(source) || source.includes(normalized)));
}

/**
 * Revalidate the terms supplied by a genome-linked payload against the lesson
 * that will actually consume them. When even one genome term is rejected, all
 * unattributed authored atoms are reset: old payloads do not carry atom-level
 * concept lineage, so retaining a quiz, slide, or fact would risk preserving
 * the rejected concept indirectly. Accepted key-term definitions remain as
 * source-grounded material and deterministic compiler fallbacks rebuild the
 * missing teaching surfaces without inventing subject matter.
 */
export function sanitizeGenomeEnrichmentForLesson(lesson = {}, enrichment = null) {
  const emptyReceipt = {
    changed: false,
    rejectedGenomeTerms: [],
    rejectedConceptIds: [],
    removedQuizItems: 0,
    removedSlides: 0,
    removedFacts: 0,
    resetAuthoredAtoms: false,
  };
  if (!enrichment || typeof enrichment !== 'object' || !isGenomeBacked(enrichment)) {
    return { enrichment, receipt: emptyReceipt };
  }

  const competencies = Array.isArray(enrichment.conceptProvenance?.competencies)
    ? enrichment.conceptProvenance.competencies
    : [];
  if (competencies.length === 0) return { enrichment, receipt: emptyReceipt };

  const rejectedCompetencyIndexes = new Set();
  const rejectedGenomeTerms = [];
  competencies.forEach((competency, index) => {
    const term = cleanText(competency?.term);
    const identitySurfaces = [term, ...(Array.isArray(competency?.aliases) ? competency.aliases : [])]
      .map(cleanText)
      .filter(Boolean);
    if (
      identitySurfaces.length === 0 ||
      identitySurfaces.some((surface) => isLessonRelevantSemanticSurface(surface, lesson))
    ) {
      return;
    }
    rejectedCompetencyIndexes.add(index);
    rejectedGenomeTerms.push(term);
  });
  if (rejectedGenomeTerms.length === 0) return { enrichment, receipt: emptyReceipt };

  const rejectedNames = new Set(rejectedGenomeTerms.map(normalizedTermName));
  const sourceTerms = Array.isArray(enrichment.keyTerms) ? enrichment.keyTerms : [];
  const rejectedSources = new Set(
    sourceTerms
      .filter((term) => rejectedNames.has(normalizedTermName(term?.term || term?.tr)))
      .map((term) => normalizedTermName(term?.source))
      .filter(Boolean),
  );
  const keyTerms = sourceTerms.filter((term) => !rejectedNames.has(normalizedTermName(term?.term || term?.tr)));
  const quizItems = Array.isArray(enrichment.quizItems) ? enrichment.quizItems : [];
  const slideContent = Array.isArray(enrichment.slideContent) ? enrichment.slideContent : [];
  const facts = Array.isArray(enrichment.kernel?.facts) ? enrichment.kernel.facts : [];
  const conceptIds = Array.isArray(enrichment.conceptProvenance?.conceptIds)
    ? enrichment.conceptProvenance.conceptIds
    : [];
  const acceptedCompetencies = competencies.filter((_, index) => !rejectedCompetencyIndexes.has(index));
  const acceptedConceptIds =
    conceptIds.length === competencies.length
      ? conceptIds.filter((_, index) => !rejectedCompetencyIndexes.has(index))
      : conceptIds;
  const rejectedConceptIds =
    conceptIds.length === competencies.length
      ? conceptIds.filter((_, index) => rejectedCompetencyIndexes.has(index))
      : [];
  const citations = Array.isArray(enrichment.conceptProvenance?.citations)
    ? enrichment.conceptProvenance.citations.filter(
        (citation) => !citationMatchesRejectedSource(citation, rejectedSources),
      )
    : enrichment.conceptProvenance?.citations;

  const sanitized = {
    ...enrichment,
    enrichmentSource: 'genome-semantic-admission-repaired',
    keyTerms,
    quizItems: [],
    slideContent: [],
    kernel: {
      ...(enrichment.kernel || {}),
      facts: [],
      scenario: null,
    },
    conceptProvenance: {
      ...(enrichment.conceptProvenance || {}),
      conceptIds: acceptedConceptIds,
      competencies: acceptedCompetencies,
      citations,
      fullyAnchored: false,
      archetypeMisconceptionCount: 0,
      semanticAdmission: {
        policy: 'lesson-discriminative-genome-v1',
        rejectedTerms: rejectedGenomeTerms,
        conservativeAtomReset: true,
      },
    },
    semanticAdmission: {
      policy: 'lesson-discriminative-genome-v1',
      rejectedTerms: rejectedGenomeTerms,
      conservativeAtomReset: true,
    },
  };
  for (const field of [
    'assignmentCore',
    'discussionPrompt',
    'mcWalkthrough',
    'reasoningScaffolds',
    'studyGuide',
    'structuralBridges',
    'structuralConnections',
    'workedExample',
  ]) {
    delete sanitized[field];
  }

  return {
    enrichment: sanitized,
    receipt: {
      changed: true,
      rejectedGenomeTerms,
      rejectedConceptIds,
      removedQuizItems: quizItems.length,
      removedSlides: slideContent.length,
      removedFacts: facts.length,
      resetAuthoredAtoms: true,
    },
  };
}
