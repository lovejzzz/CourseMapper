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
  'activity',
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
  'definition',
  'design',
  'distribution',
  'evidence',
  'example',
  'execution',
  'form',
  'framework',
  'graph',
  'historical',
  'hierarchy',
  'introduction',
  'interpretation',
  'language',
  'lesson',
  'literary',
  'literature',
  'method',
  'model',
  'narrative',
  'number',
  'numeric',
  'practice',
  'principle',
  'process',
  'processing',
  'poetic',
  'reading',
  'semantic',
  'semantics',
  'sampling',
  'source',
  'species',
  'strategy',
  'statistic',
  'student',
  'study',
  'structure',
  'summary',
  'system',
  'table',
  'tables',
  'technique',
  'theory',
  'topic',
  'two',
  'visual',
  'way',
  'writing',
];

const IDENTITY_STOP_WORDS = new Set([
  'are',
  'about',
  'after',
  'against',
  'along',
  'among',
  'and',
  'apply',
  'before',
  'between',
  'can',
  'for',
  'from',
  'has',
  'have',
  'into',
  'its',
  'not',
  'that',
  'the',
  'their',
  'these',
  'this',
  'through',
  'using',
  'was',
  'were',
  'will',
  'with',
]);

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reject a high-confidence source identity from a neighboring discipline even
 * when its body text repeats an overloaded lesson word. This is deliberately
 * narrow: a computing source is excluded from human-language analysis, while
 * computational linguistics, NLP, language-model, and programming-language
 * lessons remain eligible.
 */
export function sourceIdentityScopeMismatch({ lessonIdentity, sourceIdentity, sourceContent } = {}) {
  const lesson = cleanText(lessonIdentity).toLowerCase();
  const source = cleanText(sourceIdentity).toLowerCase();
  const content = cleanText(sourceContent).toLowerCase();
  const sourceSemanticSurface = `${source} ${content}`.trim();
  const computingSource =
    /\b(?:computer science|computer programming|imperative programming|procedural programming|programming languages?|software programming|software development|source code|coding)\b/i.test(
      source,
    );
  const computingLesson =
    /\b(?:computational linguistics|natural language processing|language models?|large language models?|programming languages?|computer|software|coding)\b/i.test(
      lesson,
    );
  const humanLanguageLesson =
    /\b(?:language|linguistics?|phonetics?|phonology|morphology|morphemes?|syntax|semantics?|pragmatics?|dialects?|speech|utterances?|grammar)\b/i.test(
      lesson,
    ) && !computingLesson;
  const computerVisionSource =
    /\b(?:computer vision|image segmentation|semantic segmentation|visual domain prompts?|remote sensing data|autonomous driving)\b/i.test(
      source,
    );
  const computerVisionLesson =
    /\b(?:computer vision|image segmentation|semantic segmentation|remote sensing|visual recognition|autonomous driving)\b/i.test(
      lesson,
    );
  const humanLanguageComputerVisionMismatch = humanLanguageLesson && computerVisionSource && !computerVisionLesson;
  const biologicalGeneticsSource =
    /\b(?:dna|genetics?|genetic mutation|genetics glossary|genome research|genomic|heredity|national human genome research institute)\b/i.test(
      source,
    );
  const biologicalGeneticsLesson =
    /\b(?:biology|biological|dna|genetics?|genetic mutation|genomics?|heredity|molecular evolution)\b/i.test(lesson);
  const humanLanguageGeneticsMismatch = humanLanguageLesson && biologicalGeneticsSource && !biologicalGeneticsLesson;
  // Historical reconstruction and synchronic/typological comparison both use
  // words such as "comparative", "language", and "structure". Those shared
  // roots are not enough to make a historical-relatedness source teach a
  // lesson whose frozen object is cross-linguistic structural variation.
  const historicalLanguageSource =
    /\b(?:diachronic|historical linguistics?|historical relatedness|language famil(?:y|ies)|proto-language|reconstruct(?:ed|ion)?|sound change)\b/i.test(
      source,
    );
  const historicalLanguageLesson =
    /\b(?:diachronic|historical linguistics?|historical relatedness|language famil(?:y|ies)|proto-language|reconstruct(?:ed|ion)?|sound change)\b/i.test(
      lesson,
    );
  const typologicalLanguageLesson =
    /\b(?:cross-linguistic|grammatical structures?|linguistic typology|structural (?:similarit|difference|variation)|typological)\b/i.test(
      lesson,
    );
  const historicalTypologyMismatch =
    humanLanguageLesson && typologicalLanguageLesson && historicalLanguageSource && !historicalLanguageLesson;
  // Exact-title matches are not sufficient when an overloaded term denotes a
  // different entity kind in the passage itself. For example, "word
  // formation" can name a geological unit as well as a linguistic process.
  // Inspect the admitted passage, not only provider metadata, so title-level
  // false friends cannot cross the lesson boundary.
  const geologySource =
    /\b(?:geologic(?:al)?|geology|rock formations?|strata|stratigraph(?:y|ic)|sedimentary|fossils?|permian|cretaceous|jurassic)\b/i.test(
      sourceSemanticSurface,
    );
  const geologyLesson =
    /\b(?:geologic(?:al)?|geology|earth science|rocks?|strata|stratigraph(?:y|ic)|sediment(?:ary|ology)?|paleontolog(?:y|ical)|fossils?)\b/i.test(
      lesson,
    );
  const humanLanguageGeologyMismatch = humanLanguageLesson && geologySource && !geologyLesson;
  return {
    mismatch:
      (computingSource && humanLanguageLesson) ||
      humanLanguageComputerVisionMismatch ||
      humanLanguageGeneticsMismatch ||
      historicalTypologyMismatch ||
      humanLanguageGeologyMismatch,
    reason:
      computingSource && humanLanguageLesson
        ? 'human-language-computing-source-identity'
        : humanLanguageComputerVisionMismatch
          ? 'human-language-computer-vision-source-identity'
          : humanLanguageGeneticsMismatch
            ? 'human-language-genetics-source-identity'
            : historicalTypologyMismatch
              ? 'typological-language-historical-reconstruction-source-identity'
              : humanLanguageGeologyMismatch
                ? 'human-language-geology-source-meaning'
                : '',
  };
}

function declaredSourceIdentitySurface(row) {
  if (typeof row === 'string') return row;
  if (!row || typeof row !== 'object') return '';
  return [row.title, row.displayTitle, row.term, row.topic, row.source, row.citation, row.url, row.sourceUrl]
    .map(cleanText)
    .filter(Boolean)
    .join(' · ');
}

export function quarantineSourceIdentityMismatchedEnrichment(lesson = {}, enrichment = null) {
  if (!enrichment || typeof enrichment !== 'object') return enrichment;
  const lessonIdentity = [
    lesson.title,
    ...(lesson.keyConcepts || []),
    ...(lesson.outcomes || []),
    ...(lesson.readings || []),
    lesson.studentArtifact,
  ]
    .filter(Boolean)
    .join(' ');
  const identityRows = [
    ...(Array.isArray(enrichment?.conceptProvenance?.citations) ? enrichment.conceptProvenance.citations : []),
    ...(Array.isArray(enrichment?.evidenceAuthorityReceipt?.sources)
      ? enrichment.evidenceAuthorityReceipt.sources
      : []),
    ...(Array.isArray(enrichment?.keyTerms) ? enrichment.keyTerms : []),
  ];
  const mismatches = identityRows.filter(
    (row) =>
      sourceIdentityScopeMismatch({
        lessonIdentity,
        // Only declared identity fields determine disciplinary ownership.
        // Support receipts, definitions, and audit notes can mention rejected
        // neighboring sources while documenting why they were excluded. If
        // those verification bytes are treated as the identity itself, an
        // already admitted exact ledger is quarantined only during replay.
        sourceIdentity: declaredSourceIdentitySurface(row),
      }).mismatch,
  );
  if (mismatches.length === 0) return enrichment;

  const next = { ...enrichment };
  for (const field of [
    'assignmentCore',
    'discussionPrompt',
    'keyTermFallbacks',
    'keyTerms',
    'mcWalkthrough',
    'quizItems',
    'reasoningScaffolds',
    'slideContent',
    'structuralBridges',
    'structuralConnections',
    'studyGuide',
    'workedExample',
  ])
    delete next[field];
  delete next.evidenceAuthorityReceipt;
  delete next.sourceFactAuthority;
  next.kernel = {
    ...(enrichment.kernel || {}),
    facts: [],
    scenario: null,
    provenance: {
      ...(enrichment.kernel?.provenance || {}),
      authority: 'quarantined-source-identity-mismatch',
      copiedFactsVerbatim: false,
      factCount: 0,
    },
  };
  next.conceptProvenance = {
    ...(enrichment.conceptProvenance || {}),
    authority: 'quarantined-source-identity-mismatch',
    citations: [],
  };
  next.semanticAdmissionReceipt = {
    ...(enrichment.semanticAdmissionReceipt || {}),
    status: 'quarantined-source-identity-mismatch',
    mismatchCount: mismatches.length,
    claimBoundary:
      'A source whose declared identity conflicts with the lesson discipline cannot authorize learner-facing teaching content.',
  };
  return next;
}

export function conceptIdentityForComparison(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\(\s*(?:(?:section|chapter|unit)\s+)?\d+(?:\.\d+)+\s*\)/gi, ' ')
    .replace(/^(?:(?:section|chapter|unit)\s+)?\d+(?:\.\d+)+(?:\s*[:.\-–—]\s*|\s+)/i, '')
    .replace(/\s+(?:(?:section|chapter|unit)\s+)?\d+(?:\.\d+)+$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isObjectiveScaffoldLikeConcept(value) {
  const text = cleanText(value);
  return (
    /\busing\s+(?:the\s+)?(?:available\s+)?(?:course\s+|source\s+)?evidence\b/i.test(text) ||
    /\bin\s+(?:one|a)\s+(?:practical\s+)?(?:task|example|case)\b/i.test(text) ||
    /\bto\s+(?:a|the)\s+course\s+(?:task|example|case)\b/i.test(text) ||
    /\band\s+(?:justify|document|record)\s+(?:one|a)\s+(?:revision|change|limit)\b/i.test(text)
  );
}

function singularToken(token) {
  if (/ies$/.test(token) && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(?:ing|ed|es)$/.test(token) && token.length > 5) return token.replace(/(?:ing|ed|es)$/, '');
  if (/s$/.test(token) && token.length > 4) return token.slice(0, -1);
  return token;
}

function semanticTokenFamily(token) {
  const normalized = singularToken(token);
  // Course identities and source titles frequently express the same bounded
  // construct with a nominal, verbal, or adjectival form. Canonicalizing a
  // small set of general academic families lets “describing ... with numbers”
  // recognize “summary statistics” while still requiring a distinguishing
  // match; a named distribution cannot enter on “distribution” alone.
  if (/^(?:describ|descript|summar)/.test(normalized)) return 'summary';
  if (/^clean/.test(normalized)) return 'clean';
  if (/^defin/.test(normalized)) return 'definition';
  if (/^ethic/.test(normalized)) return 'ethic';
  if (/^linguist/.test(normalized)) return 'language';
  if (/^(?:number|numer|quantitat|statistic)/.test(normalized)) return 'quantitative';
  return normalized;
}

// Keep generic descriptors in the same normalized form as surfaces. Without
// this, "reading" becomes "read" during matching and is accidentally treated
// as distinctive even though it is only an academic activity label.
const GENERIC_DESCRIPTOR_TOKENS = new Set(RAW_GENERIC_DESCRIPTOR_TOKENS.map(semanticTokenFamily));

export function semanticIdentityTokens(value) {
  return (
    cleanText(value)
      .toLowerCase()
      // Preserve bounded disciplinary synonymy before token-level matching.
      // Course and source vocabularies often name the same statistical object
      // as a "two-way table", "contingency table", or "cross-tabulation".
      // Treating each word independently leaves the first label with only
      // generic tokens and incorrectly rejects the canonical source term. This
      // phrase family is intentionally narrow: it admits the same data object,
      // not arbitrary pages that merely mention tables or analysis.
      .replace(/\b(?:two[\s-]*way|contingency)\s+tables?\b/g, 'crosstab')
      .replace(/\bcross[\s-]*tabulations?\b/g, 'crosstab')
      // Preserve the bounded descriptive-statistics identity while keeping
      // generic verbs such as "describe" and "summarize" non-distinguishing.
      // This admits a canonical summary-statistics source but does not admit
      // an unrelated probability-distribution page merely because its prose
      // says that a function "describes" outcomes.
      .replace(/\bsummary statistics?\b/g, 'descriptivesummary')
      .replace(
        /\bdescrib(?:e|es|ed|ing)?\s+distributions?\s+(?:with|using)\s+(?:numbers?|numeric\w*)\b/g,
        'descriptivesummary',
      )
      .replace(/-/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !IDENTITY_STOP_WORDS.has(token))
      .map(semanticTokenFamily)
      .filter((token) => token.length >= 3)
  );
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
  const isCompilerEvidenceTemplate = (value) => {
    const text = cleanText(value);
    return (
      /^use source evidence about .+ to justify one decision in /i.test(text) ||
      /^explain .+ using the available course evidence/i.test(text) ||
      /^apply .+ in one practical example from .+ and justify one revision/i.test(text)
    );
  };
  const authoredIdentityValues = (values) =>
    values
      .flatMap((value) => cleanText(value).split(/\n+/))
      .map(cleanText)
      .filter((value) => value && !isCompilerEvidenceTemplate(value));
  const values = [
    cleanText(lesson.title).replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, ''),
    ...authoredIdentityValues(lesson.semanticIdentityTerms || []),
    ...(lesson.keyConcepts || []),
    ...authoredIdentityValues(lesson.outcomes || []),
    ...(lesson.instructorNamedReadings || []),
    lesson.studentArtifact,
    lesson.assessmentLink,
    ...sections.flatMap((section) => [
      section?.topicSection,
      ...authoredIdentityValues([section?.learningGoals, section?.learningObjectives]),
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

/**
 * A stricter boundary for retrieved research. Model-authored objectives and
 * key concepts are downstream of retrieval and therefore cannot be used to
 * prove that the retrieval was relevant in the first place. Only the stable
 * lesson identity (title plus source topic/section fields) may admit a
 * research title or term.
 */
export function lessonResearchIdentityTokens(lesson = {}) {
  const sourceTopicFields = (lesson?.sourceEvidenceTrace?.sourceFields || [])
    .filter((field) => field?.field === 'topic and concepts')
    .flatMap((field) => [field?.rawText, field?.compiledValue]);
  const identityValues = [
    cleanText(lesson?.title).replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, ''),
    ...sourceTopicFields,
    ...(lesson?.sections || []).map((section) => section?.topicSection),
  ]
    .map(cleanText)
    .filter(Boolean);
  return [...new Set(identityValues.flatMap(semanticIdentityTokens))];
}

export function isLessonResearchSurfaceBound(
  surface,
  lesson = {},
  { rejectSurfaceSpecialization = false, authorizedSpecializationSurfaces = [] } = {},
) {
  // Parenthetical suffixes on reference titles normally disambiguate a work
  // rather than introduce a taught specialization (for example, "Sampling
  // (statistics)"). Evaluate the stable title separately from that metadata.
  const stableSurface = cleanText(surface).replace(/\s*\([^)]{1,80}\)\s*$/, '');
  const surfaceTokens = [...new Set(semanticIdentityTokens(stableSurface))];
  const identityTokens = new Set(lessonResearchIdentityTokens(lesson));
  const matched = surfaceTokens.filter((token) => identityTokens.has(token));
  if (!isDiscriminativeSurfaceMatch(surfaceTokens, matched)) return false;
  if (rejectSurfaceSpecialization) {
    const authorizedTokens = new Set(
      (Array.isArray(authorizedSpecializationSurfaces)
        ? authorizedSpecializationSurfaces
        : [authorizedSpecializationSurfaces]
      ).flatMap(semanticIdentityTokens),
    );
    const unsupportedSpecializations = surfaceTokens.filter(
      (token) => !identityTokens.has(token) && !GENERIC_DESCRIPTOR_TOKENS.has(token) && !authorizedTokens.has(token),
    );
    if (unsupportedSpecializations.length > 0) return false;
  }
  const titleTokens = new Set(
    semanticIdentityTokens(cleanText(lesson?.title).replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')),
  );
  const topicTokens = [
    ...(lesson?.sourceEvidenceTrace?.sourceFields || [])
      .filter((field) => field?.field === 'topic and concepts')
      .flatMap((field) => [field?.rawText, field?.compiledValue]),
    ...(lesson?.sections || []).map((section) => section?.topicSection),
  ].flatMap(semanticIdentityTokens);
  const topicSpecialization = [...new Set(topicTokens)].filter(
    (token) => !titleTokens.has(token) && !GENERIC_DESCRIPTOR_TOKENS.has(token),
  );
  // A section can intentionally narrow a broad lesson title. Retrieval must
  // name that narrowing token instead of using the broad title as an escape
  // hatch (for example, lexical semantics inside semantic interpretation).
  return topicSpecialization.length === 0 || topicSpecialization.some((token) => surfaceTokens.includes(token));
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
  const shippedExactLedger =
    cleanText(enrichment?.conceptProvenance?.source) === 'genome-linked' &&
    cleanText(enrichment?.kernel?.provenance?.source) === 'compiler-owned-exact-source-ledger' &&
    cleanText(enrichment?.kernel?.provenance?.authority) === 'shipped-source-library' &&
    enrichment?.kernel?.provenance?.copiedFactsVerbatim === true &&
    Number(enrichment?.kernel?.provenance?.factCount) === (enrichment?.kernel?.facts || []).length;
  const isSourceAnchoredTerm = (term) =>
    shippedExactLedger ||
    (Number(term?.tier) >= 2 &&
      Boolean(cleanText(term?.source)) &&
      !/fact-ledger-projection|model-authored/i.test(cleanText(term?.source)));
  const rejectedTitleTerms = sourceTerms
    .filter((term) => !isSourceAnchoredTerm(term))
    .map((term) => cleanText(term?.term || term?.tr))
    .filter((termName) => termName && isLessonTitleEchoSemanticSurface(termName, lesson));
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

  const conceptIds = Array.isArray(enrichment.conceptProvenance?.conceptIds)
    ? enrichment.conceptProvenance.conceptIds
    : [];
  const sourceCitations = Array.isArray(enrichment.conceptProvenance?.citations)
    ? enrichment.conceptProvenance.citations
    : [];
  const conceptLabels = new Map(
    sourceCitations.flatMap((citation) =>
      (Array.isArray(citation?.conceptLinks) ? citation.conceptLinks : [])
        .map((link) => [cleanText(link?.id), cleanText(link?.label)])
        .filter(([id, label]) => id && label),
    ),
  );
  const explicitCompetencies = Array.isArray(enrichment.conceptProvenance?.competencies)
    ? enrichment.conceptProvenance.competencies
    : [];
  // Saved projects from before atom-level admission retained concept ids and
  // citation links but not competency objects. Reconstruct only the identity
  // surface needed for relevance; no facts or trust are inferred here.
  const competencies =
    explicitCompetencies.length > 0
      ? explicitCompetencies
      : conceptIds.map((id) => ({
          term: conceptLabels.get(cleanText(id)) || cleanText(id).split('/').pop().replace(/-/g, ' '),
          aliases: [],
          reconstructedIdentityOnly: true,
        }));
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
  const acceptedCompetencies = competencies.filter((_, index) => !rejectedCompetencyIndexes.has(index));
  const acceptedConceptIds =
    conceptIds.length === competencies.length
      ? conceptIds.filter((_, index) => !rejectedCompetencyIndexes.has(index))
      : conceptIds;
  const rejectedConceptIds =
    conceptIds.length === competencies.length
      ? conceptIds.filter((_, index) => rejectedCompetencyIndexes.has(index))
      : [];
  const rejectedConceptIdSet = new Set(rejectedConceptIds);
  const rejectedSourceCitations = sourceCitations.filter((citation) => {
    if (citationMatchesRejectedSource(citation, rejectedSources)) return true;
    const links = Array.isArray(citation?.conceptLinks) ? citation.conceptLinks : [];
    return links.length > 0 && links.every((link) => rejectedConceptIdSet.has(cleanText(link?.id)));
  });
  const rejectedSourceLocators = [
    ...new Set(
      rejectedSourceCitations
        .flatMap((citation) => [
          citation?.id,
          citation?.displayTitle,
          citation?.title,
          citation?.sourceUrl,
          ...(Array.isArray(citation?.supportReceipt?.checks)
            ? citation.supportReceipt.checks.map((check) => check?.locator)
            : []),
        ])
        .map(cleanText)
        .filter((value) => value.length >= 3),
    ),
  ];
  const citations = sourceCitations
    .filter((citation) => !citationMatchesRejectedSource(citation, rejectedSources))
    .map((citation) => {
      if (!citation || typeof citation !== 'object') return citation;
      const links = Array.isArray(citation.conceptLinks) ? citation.conceptLinks : [];
      const conceptLinks = links.filter((link) => !rejectedConceptIdSet.has(cleanText(link?.id)));
      return conceptLinks.length === links.length ? citation : { ...citation, conceptLinks };
    })
    .filter(
      (citation) =>
        !citation ||
        typeof citation !== 'object' ||
        !Array.isArray(citation.conceptLinks) ||
        citation.conceptLinks.length > 0,
    );
  const exactLedger =
    cleanText(enrichment?.kernel?.provenance?.source) === 'compiler-owned-exact-source-ledger' &&
    enrichment?.kernel?.provenance?.copiedFactsVerbatim === true;
  const acceptedExactClaims = new Set(
    citations.flatMap((citation) =>
      (Array.isArray(citation?.supportReceipt?.checks) ? citation.supportReceipt.checks : [])
        .map((check) => normalizedTermName(check?.claim))
        .filter(Boolean),
    ),
  );
  const retainedFacts = exactLedger ? facts.filter((fact) => acceptedExactClaims.has(normalizedTermName(fact))) : [];

  const sanitized = {
    ...enrichment,
    enrichmentSource: 'genome-semantic-admission-repaired',
    keyTerms,
    quizItems: [],
    slideContent: [],
    kernel: {
      ...(enrichment.kernel || {}),
      facts: retainedFacts,
      provenance: exactLedger
        ? {
            ...(enrichment.kernel?.provenance || {}),
            factCount: retainedFacts.length,
          }
        : enrichment.kernel?.provenance,
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
        rejectedSourceLocators,
        conservativeAtomReset: true,
      },
    },
    semanticAdmission: {
      policy: 'lesson-discriminative-genome-v1',
      rejectedTerms: rejectedGenomeTerms,
      rejectedSourceLocators,
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
      removedFacts: Math.max(0, facts.length - retainedFacts.length),
      resetAuthoredAtoms: true,
    },
  };
}
