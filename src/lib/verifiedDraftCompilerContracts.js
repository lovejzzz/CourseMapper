import { sha256HexSync } from './sha256Sync.js';
import { sourceClaimDefinesTerm } from './sourceClaimRoles.js';
import { createResearchCitationAdmission } from './researchCitationAdmission.js';

export { sourceClaimDefinesTerm } from './sourceClaimRoles.js';

// Verified Coherent Draft v1 owns cross-artifact semantic admission,
// operation-qualified evidence, functional specimens, and publication safety.
// Dependencies are injected from the compiler facade so this layer remains
// deterministic, browser-safe, and independently cacheable.
import { createAuthenticDataStudyWorkedExample } from './authenticEvidenceStudyPractice.js';
import {
  authenticComparisonConstructedAnswers,
  compactAuthenticRecordedFeature,
} from './authenticEvidenceQualityUtils.js';
import { createStatisticalArtifactDetailsForOperation } from './statisticalOperationArtifactDetails.js';
import {
  createFunctionalVisualAssignmentInstructions,
  createFunctionalVisualStudyWorkedExample,
  createTypedVisualQuizFrames,
} from './verifiedDraftVisualQuizFrames.js';

export function identificationObservationInstruction(lesson = {}) {
  const lessonNumber = Math.max(1, Number(lesson?.lessonNumber || lesson?.number || 1));
  const variants = [
    'record the form and gloss first, mark the observable pattern, and only then state the bounded identification.',
    'separate transcription from inference: preserve the form-gloss pair, locate the pattern, and explain what it identifies.',
    'build an evidence-first note with the unchanged form, its gloss, the visible segment or order, and the resulting identification.',
    'show the identification trail: copied form, verified gloss, marked pattern, and an interpretation no broader than the record.',
    'annotate before explaining—retain the form and gloss, label the decisive feature, and connect it to the identification.',
    'make the observable evidence inspectable by pairing the form with its gloss, highlighting the pattern, and bounding the conclusion.',
  ];
  return `For Lesson ${lessonNumber}, ${variants[(lessonNumber - 1) % variants.length]}`;
}

export function createVerifiedDraftCompilerContracts(dependencies) {
  const {
    EXACT_SOURCE_LEDGER_PROVENANCE,
    LINEAR_ALGEBRA_AMBIGUOUS_WORKED_EXAMPLE_RE,
    LINEAR_ALGEBRA_CONTEXT_RE,
    LINEAR_ALGEBRA_STRONG_WORKED_EXAMPLE_RE,
    OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
    QUIZ_ANSWER_LETTERS,
    SOURCE_LEDGER_AUTHORITIES,
    TYPED_EVIDENCE_SPECIMEN_PROTOCOL,
    asArray,
    buildFunctionalVisualTaskContract,
    cleanText,
    clonePlain,
    conciseClause,
    correctLetterForQuestion,
    enforceDisciplineSafeEnrichment,
    escapeRegexLiteral,
    extractWorkedExamplePairs,
    functionalVisualConstructFamily,
    hasAuthoritativeSourceLedgerProvenance,
    hasExactSourceLedgerProvenance,
    humanSourceCueLabel,
    isDiscriminativeSurfaceMatch,
    isEvidencePacketLikeConcept,
    isLessonRelevantSemanticSurface,
    isLessonResearchSurfaceBound,
    isObjectiveLikeConcept,
    isOverlongConceptCandidate,
    isUnsafeCourseFaqPhrase,
    isUnsafeLessonConceptPhrase,
    isWeakConcept,
    labelQuizOption,
    lessonRequiresFunctionalVisual,
    lessonTeachingKeyTerms,
    lessonVariant,
    normalizeConceptCandidates,
    objectiveOverlapScore,
    operationEvidenceDemandForLesson,
    operationForText,
    primarySlideConcept,
    quizTags,
    safeLessonArtifact,
    safeLessonConcepts,
    safeLessonPrimaryConcept,
    semanticIdentityTokens,
    sourceLedgerAuthority,
    sourceIdentityScopeMismatch,
    stableLessonContractObjective,
    stripLessonPrefix,
    stripTerminalPunctuation,
    successCriteriaForLesson,
    unique,
    wordCount,
    wordsFromConcepts,
  } = dependencies;

  const authenticDataStudyWorkedExample = createAuthenticDataStudyWorkedExample({
    asArray,
    cleanText,
    clonePlain,
    stripLessonPrefix,
  });
  const statisticalArtifactDetailsForOperation = createStatisticalArtifactDetailsForOperation({
    operationEvidenceDemandForLesson,
  });

  function extendedLessonVariant(lesson, variants, secondCycleLead) {
    const extended = [
      ...variants,
      ...variants.map((variant) => {
        const sentence = cleanText(variant);
        const continuation = sentence ? `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : sentence;
        return `${secondCycleLead} ${continuation}`;
      }),
    ];
    return lessonVariant(lesson, extended);
  }

  function hasLearnerFacingSemanticAuthority(enrichment = null) {
    if (hasAuthoritativeSourceLedgerProvenance(enrichment)) return true;
    const explicitAuthority = cleanText(
      enrichment?.sourceFactAuthority ||
        enrichment?.conceptProvenance?.authority ||
        enrichment?.kernel?.provenance?.authority,
    );
    // Exact-copy integrity does not confer knowledge authority. Older saved
    // model projects can carry the compiler-owned exact-ledger marker while
    // omitting the later authority field; sourceLedgerAuthority deliberately
    // treats that omission as model-provisional. Fail closed here too. Plain
    // legacy compiler/instructor fixtures without an exact-ledger claim retain
    // their historical behavior.
    if (hasExactSourceLedgerProvenance(enrichment)) return false;
    // Model enrichment packets include fallback banks that are never part of a
    // hand-authored lesson fixture. A partially saved packet can lose its kernel
    // provenance (or keep an empty kernel) while retaining those model-only
    // fields. Treat that recognizable shape as provisional instead of reviving
    // it through the narrow no-metadata legacy compatibility path.
    if (
      ['keyTermFallbacks', 'coreFallbacks', 'surfaceFallbacks'].filter((field) => enrichment?.[field] != null).length >=
      2
    ) {
      return false;
    }
    return !explicitAuthority;
  }

  function hasAuthoritativeTeachingTerms(enrichment = null) {
    if (hasLearnerFacingSemanticAuthority(enrichment)) return true;
    const provenance = enrichment?.kernel?.provenance;
    return (
      enrichment?.conceptProvenance?.source === 'genome-linked' &&
      provenance?.source === EXACT_SOURCE_LEDGER_PROVENANCE &&
      provenance?.authority === SOURCE_LEDGER_AUTHORITIES.SHIPPED_SOURCE_LIBRARY &&
      provenance?.copiedFactsVerbatim === true
    );
  }

  function quarantineUnverifiedSemanticEnrichment(enrichment = null) {
    if (!enrichment || typeof enrichment !== 'object' || hasLearnerFacingSemanticAuthority(enrichment)) {
      return enrichment;
    }
    const quarantinedFields = [
      'facts',
      'sourceFacts',
      'quizItems',
      'keyTerms',
      'keyTermFallbacks',
      'slideContent',
      'coreFallbacks',
      'surfaceFallbacks',
      'discussionPrompt',
      'assignmentCore',
      'studyGuide',
      'workedExample',
      'mcWalkthrough',
      'dialogue',
      'reasoningScaffolds',
      'structuralConnections',
      'structuralBridges',
      'prerequisitePrimers',
      'targetLanguagePair',
    ].filter((field) => enrichment[field] != null);
    const next = { ...enrichment };
    for (const field of quarantinedFields) delete next[field];
    next.kernel = {
      ...(enrichment.kernel || {}),
      facts: [],
      scenario: null,
      provenance: {
        ...(enrichment.kernel?.provenance || {}),
        factCount: 0,
      },
    };
    next.semanticAdmissionReceipt = {
      ...(enrichment.semanticAdmissionReceipt || {}),
      authorityBoundary: 'compiler-semantic-authority-v1',
      status: 'quarantined-unverified-semantic-enrichment',
      quarantinedFields,
    };
    return next;
  }

  function exactSourceClaimCheckVerified(citation = {}, check = {}) {
    if (
      check?.sourceIdentityVerified === true &&
      check?.semanticAdmissionVerified === true &&
      check?.semanticSupport === true &&
      check?.quoteInSnapshot === true
    ) {
      return true;
    }
    const receipt = citation?.supportReceipt;
    const snapshot = receipt?.sourceSnapshot;
    const provider = cleanText(citation?.provider).toLowerCase();
    const sourceId = cleanText(check?.sourceId);
    const claim = cleanText(check?.claim);
    const quote = cleanText(check?.quote);
    const snapshotSha = cleanText(snapshot?.retrievedSnapshotSha256).toLowerCase();
    const checkSnapshotSha = cleanText(check?.retrievedSnapshotSha256).toLowerCase();
    const passageSha = cleanText(check?.sourcePassageSha256).toLowerCase();
    const byteStart = Number(check?.quoteByteStart);
    const byteEnd = Number(check?.quoteByteEnd);
    return (
      receipt?.status === 'passed' &&
      receipt?.method === 'exact-source-claim-v1' &&
      snapshot?.protocol === 'retrieved-source-snapshot-sha256-v2' &&
      /^[a-f0-9]{64}$/.test(snapshotSha) &&
      checkSnapshotSha === snapshotSha &&
      /^[a-f0-9]{64}$/.test(passageSha) &&
      Number(snapshot?.retrievedSnapshotBytes) > 0 &&
      Number.isInteger(byteStart) &&
      Number.isInteger(byteEnd) &&
      byteStart >= 0 &&
      byteEnd > byteStart &&
      provider.length > 0 &&
      sourceId.toLowerCase().startsWith(provider + ':') &&
      claim.length > 0 &&
      quote === claim &&
      check?.quoteInSnapshot === true &&
      check?.entailed === true &&
      check?.semanticSupport === true
    );
  }

  function enforceFieldLevelSourceAuthority(enrichment = null) {
    const hasFieldLevelChecks = (
      Array.isArray(enrichment?.conceptProvenance?.citations) ? enrichment.conceptProvenance.citations : []
    ).some((citation) => Array.isArray(citation?.supportReceipt?.checks) && citation.supportReceipt.checks.length > 0);
    if (
      !enrichment ||
      typeof enrichment !== 'object' ||
      !hasAuthoritativeSourceLedgerProvenance(enrichment) ||
      !(
        (enrichment?.conceptProvenance?.source === 'algi-researched' &&
          sourceLedgerAuthority(enrichment) === SOURCE_LEDGER_AUTHORITIES.VERIFIED_OPEN_RESEARCH) ||
        (enrichment?.conceptProvenance?.source === 'genome-linked' &&
          sourceLedgerAuthority(enrichment) === SOURCE_LEDGER_AUTHORITIES.SHIPPED_SOURCE_LIBRARY)
      ) ||
      !hasFieldLevelChecks
    ) {
      return enrichment;
    }
    const claims = unique(
      (Array.isArray(enrichment?.conceptProvenance?.citations) ? enrichment.conceptProvenance.citations : [])
        .flatMap((citation) =>
          (citation?.supportReceipt?.checks || [])
            .filter((check) => exactSourceClaimCheckVerified(citation, check))
            .map((check) => ({ citation, check })),
        )
        .map(({ check }) => check)
        .flatMap((check) => [check?.claim, check?.quote])
        .map(cleanText)
        .filter((claim) => wordCount(claim) >= 6 && wordCount(claim) <= 40),
      128,
    );
    const claimByKey = new Map(claims.map((claim) => [normalizedFactOwnershipKey(claim), claim]));
    const boundClaim = (value) => claimByKey.get(normalizedFactOwnershipKey(value)) || '';
    const openResearchLineage = enrichment?.conceptProvenance?.source === 'algi-researched';
    const exactFacts = unique(
      [
        ...(Array.isArray(enrichment?.kernel?.facts) ? enrichment.kernel.facts.map(boundClaim).filter(Boolean) : []),
        ...claims,
      ],
      5,
    );
    const sourceBoundTerms = Array.isArray(enrichment.keyTerms) ? enrichment.keyTerms : [];
    const quarantinedNonDefinitionalTerms = openResearchLineage
      ? sourceBoundTerms
          .filter((term) => {
            const definition = boundClaim(term?.definition || term?.df);
            return definition && !sourceClaimDefinesTerm({ term: term?.term || term?.tr, claim: definition });
          })
          .map((term) => cleanText(term?.term || term?.tr))
          .filter(Boolean)
      : [];
    const safeTerms = sourceBoundTerms
      .map((term) => {
        const definition = boundClaim(term?.definition || term?.df);
        // The language finalizer intentionally normalizes semicolon-separated
        // glossary prose into sentences. Keep those claims in the exact fact
        // ledger, but do not expose them as glossary definitions where that
        // punctuation rewrite would break byte-exact source binding.
        if (
          !cleanText(term?.term || term?.tr) ||
          !definition ||
          /;/.test(definition) ||
          (openResearchLineage && !sourceClaimDefinesTerm({ term: term?.term || term?.tr, claim: definition }))
        ) {
          return null;
        }
        const example = boundClaim(term?.example || term?.eg);
        const termWithoutExample = { ...term };
        delete termWithoutExample.example;
        delete termWithoutExample.eg;
        // Exact quote admission proves the sentence is supported; it does not
        // prove that a second encyclopedia sentence functions as an example.
        // Research payloads historically relabelled arbitrary neighbouring
        // claims as examples, while a missing example was even replaced by
        // the definition itself. Preserve the glossary definition and facts,
        // but require a separately structured case/worked-example boundary
        // before learner artifacts may call research prose an example.
        const retainExample =
          !openResearchLineage &&
          example &&
          normalizedFactOwnershipKey(example) !== normalizedFactOwnershipKey(definition);
        return {
          ...termWithoutExample,
          definition,
          ...(retainExample ? { example } : {}),
          misconception: '',
          correction: '',
        };
      })
      .filter(Boolean);
    const quarantinedFields = [
      'quizItems',
      'keyTermFallbacks',
      'slideContent',
      'coreFallbacks',
      'surfaceFallbacks',
      'discussionPrompt',
      'assignmentCore',
      'studyGuide',
      'workedExample',
      'mcWalkthrough',
      'dialogue',
      'reasoningScaffolds',
      'structuralConnections',
      'structuralBridges',
      'prerequisitePrimers',
    ].filter((field) => enrichment[field] != null);
    const next = { ...enrichment, keyTerms: safeTerms };
    for (const field of quarantinedFields) delete next[field];
    next.kernel = {
      ...(enrichment.kernel || {}),
      facts: exactFacts,
      scenario: null,
      provenance: {
        ...(enrichment.kernel?.provenance || {}),
        factCount: exactFacts.length,
      },
    };
    next.semanticAdmissionReceipt = {
      ...(enrichment.semanticAdmissionReceipt || {}),
      fieldAuthorityBoundary: 'exact-admitted-source-claim-v1',
      admittedClaimCount: claims.length,
      retainedFactCount: exactFacts.length,
      retainedTermCount: safeTerms.length,
      quarantinedNonDefinitionalTermCount: quarantinedNonDefinitionalTerms.length,
      quarantinedNonDefinitionalTerms,
      retainedExampleCount: safeTerms.filter((term) => cleanText(term?.example)).length,
      quarantinedUnboundFields: quarantinedFields,
      legacyExactClaimMigrationCount: (Array.isArray(enrichment?.conceptProvenance?.citations)
        ? enrichment.conceptProvenance.citations
        : []
      ).reduce(
        (count, citation) =>
          count +
          (citation?.supportReceipt?.checks || []).filter(
            (check) =>
              exactSourceClaimCheckVerified(citation, check) &&
              !(check?.sourceIdentityVerified === true && check?.semanticAdmissionVerified === true),
          ).length,
        0,
      ),
    };
    return next;
  }

  function authenticDataAssignmentInstructions(lesson = {}) {
    const task = lesson?.authenticDataTaskPlan;
    if (task?.protocol !== 'coursemapper-authentic-evidence-task-binding-v1') return [];
    const evidenceNames = (task.evidenceLabels || task.evidenceItemIds || []).join(' and ');
    const examples = asArray(task.examples);
    const evidenceDisplay = examples
      .map((example) => `“${cleanText(example.form)}” [${cleanText(example.gloss)}]`)
      .filter((value) => !/“” \[\]/.test(value))
      .join(' compared with ');
    const commonBoundary = extendedLessonVariant(
      lesson,
      [
        `Cite ${evidenceNames}; keep the conclusion inside the recorded source locators and community-context limits.`,
        `Use ${evidenceNames} as the evidence boundary, and do not generalize beyond their source locations or community contexts.`,
        `Attach each conclusion to ${evidenceNames}, then state the source-locator and community-context limit that still applies.`,
        `Ground the answer in ${evidenceNames}; distinguish what those records support from what their locations and contexts leave unresolved.`,
        `Trace the claim to ${evidenceNames} and preserve both the recorded locator and the community-specific limit.`,
      ],
      'On a second evidence pass,',
    );
    const instructionSets = {
      identification: [
        `Mark the exact segment, order, or form-gloss correspondence that answers this lesson's question in ${evidenceDisplay || evidenceNames}.`,
        identificationObservationInstruction(lesson),
        commonBoundary,
      ],
      comparison: [
        `Align the bound records for comparison: ${evidenceDisplay || evidenceNames}. Preserve their forms, glosses, translations, and language labels.`,
        `Name one observable similarity and one decisive difference, then explain which comparison the difference supports.`,
        `${commonBoundary} Add the next record needed to test whether the contrast transfers.`,
      ],
      generalization: [
        `Build a small evidence table from ${evidenceNames}: one row per language, with form, gloss, observable pattern, and source locator.`,
        `State the narrowest cross-linguistic pattern supported by every selected row; retain exceptions instead of averaging them away.`,
        `${commonBoundary} Name a counterexample that would weaken or overturn the generalization.`,
      ],
      'mechanism-explanation': [
        `Diagram the competing structural states shown by ${evidenceDisplay || evidenceNames}; label the position or ordering fact each record makes observable.`,
        `Explain the mechanism as a sequence of evidence-linked steps, then test the same account against the second language record.`,
        `${commonBoundary} Distinguish the cited analysis from a universal claim about either language.`,
      ],
      'dataset-audit': [
        `Create a replayable sampling and annotation ledger for ${evidenceNames}: inclusion rule, selected rows, annotation fields, and source locators.`,
        `Run an independent consistency check on forms, glosses, translations, and codes; record disagreements instead of silently normalizing them.`,
        `${commonBoundary} Report what the selected sample cannot represent.`,
      ],
      'proposal-defense': [
        `Frame one answerable question whose units of analysis are the named records in ${evidenceNames}.`,
        `Defend the sampling, annotation, and comparison procedure; show exactly how another analyst could replay it from the packet.`,
        `${commonBoundary} State the evidence that would force a revision of the proposal.`,
      ],
    };
    return [
      `Bound evidence task: ${task.prompt}`,
      ...(instructionSets[task.operation] || instructionSets.identification),
    ];
  }

  function normalizeCoursePrerequisites(value) {
    const entries = asArray(value)
      .map((entry) => (typeof entry === 'string' ? { text: entry } : entry))
      .map((entry) => ({
        text: cleanText(entry?.text),
        status: entry?.status === 'required' ? 'required' : 'expected',
        sourceStatus: cleanText(entry?.sourceStatus, 'source-explicit'),
      }))
      .filter((entry) => entry.text && /^source-(?:explicit|transcribed)$/.test(entry.sourceStatus));
    return entries.length > 0 ? entries.slice(0, 6) : null;
  }

  function normalizeCourseGradingPolicy(value) {
    if (!value || typeof value !== 'object') return null;
    const categories = asArray(value.categories)
      .map((entry, index) => ({
        id: cleanText(entry?.id, `G${index + 1}`),
        title: cleanText(entry?.title),
        weightPct: Number(entry?.weightPct),
        extraCredit: entry?.extraCredit === true,
        sourceStatus: cleanText(entry?.sourceStatus, 'source-explicit'),
      }))
      .filter(
        (entry) =>
          entry.title &&
          Number.isFinite(entry.weightPct) &&
          entry.weightPct > 0 &&
          entry.weightPct <= 100 &&
          /^source-(?:explicit|formula|table|transcribed)$/.test(entry.sourceStatus),
      );
    if (categories.length === 0) return null;
    const baseTotalPct = Number(
      categories
        .filter((entry) => !entry.extraCredit)
        .reduce((sum, entry) => sum + entry.weightPct, 0)
        .toFixed(3),
    );
    const extraCreditTotalPct = Number(
      categories
        .filter((entry) => entry.extraCredit)
        .reduce((sum, entry) => sum + entry.weightPct, 0)
        .toFixed(3),
    );
    if (baseTotalPct <= 0) return null;
    const gradeBands = asArray(value.gradeBands)
      .map((entry) => ({
        label: cleanText(entry?.label || entry?.grade),
        range: cleanText(entry?.range),
        ...(Number.isFinite(Number(entry?.minPct)) ? { minPct: Number(entry.minPct) } : {}),
        ...(Number.isFinite(Number(entry?.maxPct)) ? { maxPct: Number(entry.maxPct) } : {}),
        ...(Number.isFinite(Number(entry?.maxExclusivePct)) ? { maxExclusivePct: Number(entry.maxExclusivePct) } : {}),
        sourceStatus: cleanText(entry?.sourceStatus, 'source-explicit'),
      }))
      .filter(
        (entry) => entry.label && entry.range && /^source-(?:explicit|table|transcribed)$/.test(entry.sourceStatus),
      );
    return {
      version: 1,
      sourceStatus: 'source-explicit',
      categories,
      ...(gradeBands.length > 0 ? { gradeBands } : {}),
      baseTotalPct,
      extraCreditTotalPct,
      displayedTotalPct: Number((baseTotalPct + extraCreditTotalPct).toFixed(3)),
    };
  }

  function functionalVisualAssignmentInstructions(blueprint, lesson, assessment = {}) {
    return createFunctionalVisualAssignmentInstructions({
      blueprint,
      lesson,
      assessment,
      lessonRequiresFunctionalVisual,
      stripTerminalPunctuation,
      safeLessonArtifact,
      stripLessonPrefix,
      safeLessonPrimaryConcept,
      asArray,
      lessonVariant,
    });
  }

  function normalizedFactOwnershipKey(value) {
    return cleanText(value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function lessonFactOwnershipScore(lesson = {}, payload = {}, fact = '', factIndex = 0) {
    const factTokens = new Set(semanticIdentityTokens(fact));
    const lessonText = [
      lesson.title,
      ...(lesson.keyConcepts || []),
      ...(lesson.outcomes || []),
      ...(lesson.successCriteria || []),
      ...(lesson.sections || []).flatMap((section) => [
        section?.topicSection,
        section?.learningGoals,
        section?.learningObjectives,
      ]),
    ]
      .filter(Boolean)
      .join(' ');
    const lessonTokens = new Set(semanticIdentityTokens(lessonText));
    const termTokens = new Set(
      (Array.isArray(payload?.keyTerms) ? payload.keyTerms : []).flatMap((term) =>
        semanticIdentityTokens(term?.term || term?.tr || ''),
      ),
    );
    const overlap = [...factTokens].filter((token) => lessonTokens.has(token)).length;
    const termOverlap = [...factTokens].filter((token) => termTokens.has(token)).length;
    const relatedFactTokens = new Set(
      (Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : [])
        .filter((candidate) => normalizedFactOwnershipKey(candidate) !== normalizedFactOwnershipKey(fact))
        .flatMap((candidate) => semanticIdentityTokens(candidate)),
    );
    const relatedFactOverlap = [...factTokens].filter((token) => relatedFactTokens.has(token)).length;
    const keyTermDefinitionMatch = (Array.isArray(payload?.keyTerms) ? payload.keyTerms : []).some((term) =>
      normalizedFactOwnershipKey([term?.definition, term?.example].filter(Boolean).join(' ')).includes(
        normalizedFactOwnershipKey(fact),
      ),
    );
    return (
      (isLessonRelevantSemanticSurface(fact, lesson) ? 120 : 0) +
      overlap * 12 +
      termOverlap * 18 +
      relatedFactOverlap * 28 +
      (keyTermDefinitionMatch ? 60 : 0) +
      Math.max(0, 20 - factIndex * 4)
    );
  }

  function valueContainsOwnedFact(value, rejectedFactKeys = new Set()) {
    if (value == null || rejectedFactKeys.size === 0) return false;
    const haystack = normalizedFactOwnershipKey(typeof value === 'string' ? value : JSON.stringify(value));
    return [...rejectedFactKeys].some((factKey) => factKey.length >= 24 && haystack.includes(factKey));
  }

  function removeCrossLessonFactLeakage(payload = {}, rejectedFactKeys = new Set()) {
    if (!payload || rejectedFactKeys.size === 0) return payload;
    const facts = (Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : []).filter(
      (fact) => !rejectedFactKeys.has(normalizedFactOwnershipKey(fact)),
    );
    const filterSurface = (items) =>
      Array.isArray(items) ? items.filter((item) => !valueContainsOwnedFact(item, rejectedFactKeys)) : items;
    const next = {
      ...payload,
      keyTerms: filterSurface(payload.keyTerms),
      quizItems: filterSurface(payload.quizItems),
      slideContent: filterSurface(payload.slideContent),
      kernel: {
        ...(payload.kernel || {}),
        facts,
        ...(payload?.kernel?.provenance
          ? {
              provenance: {
                ...payload.kernel.provenance,
                factCount: facts.length,
              },
            }
          : {}),
        ...(valueContainsOwnedFact(payload?.kernel?.scenario, rejectedFactKeys) ? { scenario: null } : {}),
      },
      semanticAdmissionReceipt: {
        ...(payload.semanticAdmissionReceipt || {}),
        crossLessonFactOwnershipApplied: true,
        removedCrossLessonFacts: [...rejectedFactKeys],
      },
    };
    for (const field of ['discussionPrompt', 'assignmentCore', 'studyGuide', 'workedExample']) {
      if (valueContainsOwnedFact(payload[field], rejectedFactKeys)) next[field] = undefined;
    }
    return next;
  }

  function quarantineUnadmittedResearchClaims(lesson = {}, payload = null) {
    if (!payload || typeof payload !== 'object') return payload;
    const researchBacked =
      /(?:research|source-library|algi)/i.test(cleanText(payload?.enrichmentSource)) ||
      (Array.isArray(payload?.conceptProvenance?.citations) &&
        payload.conceptProvenance.citations.some((citation) =>
          /^(?:wikipedia|doaj|openalex|crossref|pubmed|eric)$/i.test(cleanText(citation?.provider)),
        ));
    if (!researchBacked) return payload;
    const facts = Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : [];
    const authority = payload?.evidenceAuthorityReceipt;
    const authorityFresh = (() => {
      if (
        authority?.protocol !== 'coursemapper-evidence-authority-v1' ||
        authority?.status !== 'admitted' ||
        !/^[a-f0-9]{64}$/i.test(cleanText(authority?.receiptSha256)) ||
        (payload?.lessonId && authority?.lessonId !== payload.lessonId)
      ) {
        return false;
      }
      const { receiptSha256, ...exactPayload } = authority;
      if (sha256HexSync(JSON.stringify(exactPayload)) !== receiptSha256) return false;
      const lessonIdentity = [
        lesson?.title,
        ...(lesson?.keyConcepts || []),
        ...(lesson?.outcomes || []),
        ...(lesson?.sections || []).flatMap((section) => [
          section?.topicSection,
          section?.learningGoals,
          section?.learningObjectives,
        ]),
      ]
        .map(cleanText)
        .filter(Boolean)
        .join(' · ');
      if (
        (authority?.sources || []).some(
          (source) =>
            sourceIdentityScopeMismatch({
              lessonIdentity,
              sourceIdentity: [
                source?.title,
                source?.topic,
                source?.url,
                ...(source?.supportReceipt?.checks || [])
                  .filter(
                    (check) =>
                      check?.quoteInSnapshot === true && check?.entailed === true && check?.semanticSupport === true,
                  )
                  .flatMap((check) => [check?.claim, check?.quote]),
              ]
                .map(cleanText)
                .filter(Boolean)
                .join(' · '),
            }).mismatch,
        )
      ) {
        return false;
      }
      const admittedClaims = new Set((authority?.claims || []).map((claim) => cleanText(claim?.text)).filter(Boolean));
      if (facts.length < 3 || facts.some((fact) => !admittedClaims.has(cleanText(fact)))) return false;
      if (authority?.authorityKind !== 'verified-open-research') return true;
      const verifiedClaims = new Set(
        (authority?.sources || [])
          .flatMap((source) => source?.supportReceipt?.checks || [])
          .filter(
            (check) =>
              check?.quoteInSnapshot === true &&
              check?.entailed === true &&
              check?.semanticSupport === true &&
              cleanText(check?.claim) === cleanText(check?.quote),
          )
          .map((check) => cleanText(check.claim)),
      );
      return facts.every((fact) => verifiedClaims.has(cleanText(fact)));
    })();
    // A fresh authority receipt is the already-audited transaction for this
    // exact lesson and exact claim set. Re-running the older title heuristic
    // here created a split-brain pipeline that erased valid first-language
    // evidence after admission. Current mismatch and byte-exact checks above
    // keep replay fail-closed while avoiding that second, weaker judgment.
    if (authorityFresh) return payload;
    const lessonTitleIdentity = normalizedFactOwnershipKey(stripLessonPrefix(lesson?.title || ''));
    const sourceFields = Array.isArray(lesson?.sourceEvidenceTrace?.sourceFields)
      ? lesson.sourceEvidenceTrace.sourceFields
      : [];
    const governedTopicSurfaces = sourceFields
      .filter((field) => field?.field === 'topic and concepts')
      .flatMap((field) => [field?.rawText, field?.compiledValue])
      .map(cleanText)
      .filter(Boolean);
    const governedOutcomeSurfaces = sourceFields
      .filter((field) => field?.field === 'learning objectives')
      .flatMap((field) => [field?.rawText, field?.compiledValue])
      .map(cleanText)
      .filter(Boolean);
    const specificConcepts = unique(
      governedTopicSurfaces.length > 0
        ? governedTopicSurfaces
        : (lesson?.keyConcepts || []).filter((concept) => normalizedFactOwnershipKey(concept) !== lessonTitleIdentity),
      8,
    );
    const focusedLesson = {
      ...lesson,
      // Research must answer the concrete taught section or concept, not merely
      // share the broad course/lesson frame. “Linguistic prescription” is valid
      // linguistics, but it is not evidence for a Phonetics: Speech Production
      // section. Section topics and named concepts are the governing boundary.
      title: specificConcepts.join(' · ') || lesson?.title || '',
      keyConcepts: specificConcepts,
      semanticIdentityTerms: specificConcepts,
      outcomes: governedOutcomeSurfaces.length > 0 ? governedOutcomeSurfaces : lesson?.outcomes || [],
      studentArtifact: '',
      assessmentLink: '',
      instructorNamedReadings: [],
      sections: (lesson?.sections || []).map((section) => ({
        topicSection: section?.topicSection,
        learningGoals: '',
        learningObjectives: '',
        readings: '',
      })),
    };
    const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
    const { citationClaimIsInstructionallyBound, citationIdentityForLessonTitle, citationIsLessonBound } =
      createResearchCitationAdmission({
        citations,
        cleanText,
        focusedLesson,
        isDiscriminativeSurfaceMatch,
        lesson,
        semanticIdentityTokens,
        stripLessonPrefix,
      });
    const lessonBoundCitations = citations.filter(citationIsLessonBound);
    const rejectedCitations = citations.filter((citation) => !citationIsLessonBound(citation));
    const rejectedCitationClaimKeys = new Set(
      rejectedCitations
        .flatMap((citation) => [
          citation?.evidence,
          ...(citation?.supportReceipt?.checks || []).flatMap((check) => [check?.claim, check?.quote]),
        ])
        .map(normalizedFactOwnershipKey)
        .filter(Boolean),
    );
    // An admitted claim is scoped to the lesson by the research question/topic
    // that produced it. The claim text itself need not repeat the lesson title
    // (definitions and mechanisms frequently do not), so retain exact supported
    // claims from a lesson-relevant scoped citation.
    const scopedSourceClaims = new Set(
      lessonBoundCitations
        .flatMap((citation) =>
          (citation?.supportReceipt?.checks || [])
            .filter(
              (check) =>
                check?.semanticSupport === true &&
                check?.quoteInSnapshot === true &&
                citationClaimIsInstructionallyBound(citation, check?.claim || check?.quote),
            )
            .flatMap((check) => [check?.claim, check?.quote]),
        )
        .map(normalizedFactOwnershipKey)
        .filter((claimKey) => claimKey.length >= 24),
    );
    // When research finds an exact article for the declared lesson topic, that
    // article is the learner-facing topical root. Related discovery results may
    // remain in the provenance ledger for an instructor to inspect, but they do
    // not silently widen the taught scope. This catches a general failure mode:
    // a narrow lesson such as "Normal Distribution" accumulated downstream
    // articles about multivariate families, specialist tests, and software
    // implementation details merely because those pages repeated the title
    // tokens. The rule is lexical and source-bound rather than course-specific.
    const exactTopicalRoot = (() => {
      const lessonTokens = [...new Set(semanticIdentityTokens(citationIdentityForLessonTitle(lesson?.title || '')))];
      if (lessonTokens.length === 0) return null;
      const candidates = (
        Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : []
      )
        .map((citation, index) => {
          const title = cleanText(citation?.displayTitle || citation?.title);
          const titleTokens = [...new Set(semanticIdentityTokens(title))];
          const shared = lessonTokens.filter((token) => titleTokens.includes(token)).length;
          const lessonCoverage = shared / lessonTokens.length;
          const titleCoverage = shared / Math.max(1, titleTokens.length);
          return { citation, index, title, titleTokens, lessonCoverage, titleCoverage };
        })
        .filter(
          (candidate) =>
            candidate.title &&
            candidate.lessonCoverage === 1 &&
            candidate.titleCoverage >= 0.8 &&
            candidate.titleTokens.length <= lessonTokens.length + 1,
        )
        .sort(
          (left, right) =>
            right.titleCoverage - left.titleCoverage ||
            left.titleTokens.length - right.titleTokens.length ||
            left.index - right.index,
        );
      return candidates[0] || null;
    })();
    const topicalRootClaims = exactTopicalRoot
      ? unique(
          [
            exactTopicalRoot.citation?.evidence,
            ...(Array.isArray(exactTopicalRoot.citation?.supportReceipt?.checks)
              ? exactTopicalRoot.citation.supportReceipt.checks.flatMap((check) => [check?.claim, check?.quote])
              : []),
          ]
            .map(normalizedFactOwnershipKey)
            .filter((value) => value.length >= 20),
          128,
        )
      : [];
    // An exact-title citation is only an enforceable topical root when its
    // retrieved evidence actually contributed claim-bound atoms. Extraction-
    // only citations can share the lesson title without supplying a claim
    // surface; treating an empty receipt as authoritative quarantines every
    // otherwise relevant research fact.
    const topicalRootAdmissionActive = Boolean(exactTopicalRoot && topicalRootClaims.length > 0);
    const isTopicalRootAtom = (value) => {
      if (!topicalRootAdmissionActive) return true;
      const normalized = normalizedFactOwnershipKey(value);
      if (!normalized) return false;
      if (scopedSourceClaims.has(normalized)) return true;
      return topicalRootClaims.some(
        (claim) => normalized === claim || (normalized.length >= 24 && claim.includes(normalized)),
      );
    };
    const malformedSourceText = (value) =>
      /\b[a-z]{2,}[A-Z][a-z]+\b/.test(cleanText(value)) ||
      /\uFFFD/.test(cleanText(value)) ||
      /\b[b-hj-z]\s+[a-z]{3,}\b/i.test(cleanText(value));
    const unresolvedSourceAnaphora = (value) =>
      /^(?:this|that|these|those)\b|\bthis allows\b|\bthe example above\b|\b(?:these|those|the former|the latter|said)\s+(?:two\s+)?(?:types?|methods?|results?|factors?|information|approaches?|languages?)\b/i.test(
        cleanText(value),
      );
    const vagueResearchFragment = (value) => {
      const text = cleanText(value);
      return (
        /^(?:non[- ]?cognitive|cognitive|social|other)\s+factors?\s+that\s+(?:have|play)\b.*\b(?:success|degree|outcome)\b/i.test(
          text,
        ) || /^(?:her|his|their|the)\s+(?:main\s+)?(?:claim|argument|finding)\b/i.test(text)
      );
    };
    const lowIntegrityResearchText = (value) =>
      malformedSourceText(value) || unresolvedSourceAnaphora(value) || vagueResearchFragment(value);
    const lessonBoundTermSurfaces = (Array.isArray(payload?.keyTerms) ? payload.keyTerms : [])
      .filter((term) =>
        [term?.term || term?.tr, term?.definition].some((surface) =>
          isLessonRelevantSemanticSurface(surface, focusedLesson),
        ),
      )
      .flatMap((term) => [term?.definition, term?.example, term?.correction])
      .map(cleanText)
      .filter(Boolean);
    // A source fact may express a population effect or mechanism without
    // repeating the broad lesson title. Preserve it when it has a multi-token
    // relation to a key term whose label is itself bound to this lesson. This
    // admits real explanatory support while still rejecting adjacency based on
    // one generic word.
    const isLessonBoundTermAtom = (value) =>
      lessonBoundTermSurfaces.some((surface) => objectiveOverlapScore(value, surface) >= 2);
    const rejectedFacts = new Set(
      facts
        .filter(
          (fact) =>
            lowIntegrityResearchText(fact) ||
            rejectedCitationClaimKeys.has(normalizedFactOwnershipKey(fact)) ||
            (!isLessonRelevantSemanticSurface(fact, focusedLesson) &&
              !isLessonBoundTermAtom(fact) &&
              !scopedSourceClaims.has(normalizedFactOwnershipKey(fact))) ||
            !isTopicalRootAtom(fact),
        )
        .map(normalizedFactOwnershipKey)
        .filter((factKey) => factKey.length >= 24),
    );
    const rejectedTerms = (Array.isArray(payload?.keyTerms) ? payload.keyTerms : []).filter((term) => {
      const label = cleanText(term?.term || term?.tr);
      const labelMatchesRoot = topicalRootAdmissionActive
        ? normalizedFactOwnershipKey(label) === normalizedFactOwnershipKey(exactTopicalRoot.title)
        : false;
      return (
        /^(?:little|her main claim|his main claim|their main claim)$/i.test(label) ||
        /\b(?:usually|generally|often|sometimes)$/i.test(label) ||
        lowIntegrityResearchText(term?.definition) ||
        lowIntegrityResearchText(term?.example) ||
        [term?.definition, term?.example].some((surface) =>
          rejectedCitationClaimKeys.has(normalizedFactOwnershipKey(surface)),
        ) ||
        (!labelMatchesRoot && !isLessonRelevantSemanticSurface(label, focusedLesson)) ||
        (topicalRootAdmissionActive &&
          !labelMatchesRoot &&
          !isTopicalRootAtom(term?.definition) &&
          !isTopicalRootAtom(term?.example))
      );
    });
    if (rejectedFacts.size === 0 && rejectedTerms.length === 0 && rejectedCitations.length === 0) return payload;
    const factSafe = removeCrossLessonFactLeakage(payload, rejectedFacts);
    const next = removeCrossLessonTermLeakage(factSafe, rejectedTerms);
    return {
      ...next,
      conceptProvenance: {
        ...(next.conceptProvenance || {}),
        // Preserve the complete discovery ledger for auditability. Only the
        // admitted subset may project into instruction, readings, or scored
        // work; quarantined sources remain visible here as provenance rather
        // than disappearing from the record.
        citations,
        admittedCitations: lessonBoundCitations,
      },
      semanticAdmissionReceipt: {
        ...(next.semanticAdmissionReceipt || {}),
        sourceIdentityPreserved: true,
        semanticAdmissionPolicy: 'lesson-topic-source-integrity-v4',
        ...(topicalRootAdmissionActive
          ? {
              exactTopicalRootPolicy: 'exact-lesson-title-source-root-v1',
              exactTopicalRootTitle: exactTopicalRoot.title,
            }
          : {}),
        quarantinedResearchClaims: [...rejectedFacts],
        quarantinedResearchTerms: rejectedTerms.map((term) => normalizedFactOwnershipKey(term?.term)).filter(Boolean),
        quarantinedResearchSources: rejectedCitations.map((citation) => ({
          title: cleanText(citation?.displayTitle || citation?.title || citation?.key),
          url: cleanText(citation?.sourceUrl || citation?.url),
        })),
      },
    };
  }

  function filterQuarantinedResearchReadings(lesson = {}, enrichment = null) {
    const rejected = enrichment?.semanticAdmissionReceipt?.quarantinedResearchSources || [];
    const identities = rejected
      .flatMap((source) => [source?.title, source?.url])
      .map((value) => cleanText(value).toLowerCase())
      .filter((value) => value.length >= 8);
    if (identities.length === 0) return lesson;
    const keep = (value) => {
      const normalized = cleanText(value).toLowerCase();
      return !identities.some((identity) => normalized.includes(identity));
    };
    const readings = (lesson.readings || []).filter(keep);
    const resources = (lesson.resources || []).filter(keep);
    return {
      ...lesson,
      readings,
      resources,
      compilerResearchAdmission: {
        source: 'lesson-focused-research-source-admission-v1',
        rejectedSourceCount: rejected.length,
        rejectedSources: rejected,
      },
    };
  }

  function contradictionTokens(value) {
    const stop = new Set([
      'about',
      'after',
      'against',
      'because',
      'before',
      'computed',
      'expression',
      'inside',
      'percent',
      'students',
      'that',
      'their',
      'they',
      'this',
      'true',
      'with',
    ]);
    return new Set(semanticIdentityTokens(value).filter((token) => !stop.has(token)));
  }

  function kernelClaimEchoesDocumentedMisconception(fact, term) {
    const factText = cleanText(fact);
    const misconception = cleanText(term?.misconception);
    const correction = cleanText(term?.correction);
    if (!factText || !misconception || !correction) return false;
    if (/\b(?:not|never|cannot|doesn['’]?t|isn['’]?t)\b/i.test(factText)) return false;
    if (!/\b(?:not|rather than|instead of|doesn['’]?t|isn['’]?t|do not)\b/i.test(correction)) return false;
    const factTokens = contradictionTokens(factText);
    const misconceptionTokens = contradictionTokens(misconception);
    // A documented misconception can state both the wrong belief and the
    // correct contrast: “the population becomes normal, rather than the
    // sampling distribution of the mean.” A true kernel fact that affirms the
    // right-hand alternative naturally shares most of the sentence's tokens;
    // counting that overlap as an echo quarantines the very evidence that
    // repairs the misconception. When the fact substantially matches the
    // explicit contrastive alternative, keep it. The wrong left-hand claim is
    // still rejected because it does not match that alternative.
    const contrastiveAlternative = misconception.match(/\b(?:rather than|instead of)\b\s+(.+)$/i)?.[1];
    if (contrastiveAlternative) {
      const alternativeTokens = contradictionTokens(contrastiveAlternative);
      const alternativeOverlap = [...alternativeTokens].filter((token) => factTokens.has(token)).length;
      if (alternativeOverlap >= 2 && alternativeOverlap / Math.max(1, alternativeTokens.size) >= 0.6) return false;
    }
    const overlap = [...factTokens].filter((token) => misconceptionTokens.has(token)).length;
    return overlap >= 4 && overlap / Math.max(1, Math.min(factTokens.size, misconceptionTokens.size)) >= 0.35;
  }

  function quarantineContradictoryKernelClaims(payload = null) {
    if (!payload || typeof payload !== 'object') return payload;
    const terms = Array.isArray(payload?.keyTerms) ? payload.keyTerms : [];
    const rejectedFacts = new Set(
      (Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : [])
        .filter((fact) => terms.some((term) => kernelClaimEchoesDocumentedMisconception(fact, term)))
        .map(normalizedFactOwnershipKey)
        .filter((factKey) => factKey.length >= 24),
    );
    if (rejectedFacts.size === 0) return payload;
    const next = removeCrossLessonFactLeakage(payload, rejectedFacts);
    return {
      ...next,
      semanticAdmissionReceipt: {
        ...(next.semanticAdmissionReceipt || {}),
        crossFieldContradictionPolicy: 'definition-misconception-correction-v1',
        quarantinedContradictoryClaims: [...rejectedFacts],
      },
    };
  }

  function lessonTermOwnershipScore(lesson = {}, term = {}) {
    const identity = [term?.term, term?.definition, term?.example].filter(Boolean).join(' ');
    const identityTokens = new Set(semanticIdentityTokens(identity));
    const governedTopicSurfaces = (lesson?.sourceEvidenceTrace?.sourceFields || [])
      .filter((field) => ['lesson identity', 'topic and concepts'].includes(field?.field))
      .flatMap((field) => [field?.rawText, field?.compiledValue])
      .map(cleanText)
      .filter(Boolean);
    const lessonIdentity = [
      lesson.title,
      ...governedTopicSurfaces,
      ...(lesson.sections || []).flatMap((section) => [section?.topicSection]),
    ]
      .filter(Boolean)
      .join(' ');
    const lessonTokens = new Set(semanticIdentityTokens(lessonIdentity));
    const overlap = [...identityTokens].filter((token) => lessonTokens.has(token)).length;
    const governedLesson = {
      ...lesson,
      title: lessonIdentity,
      semanticIdentityTerms: governedTopicSurfaces,
      keyConcepts: [],
      outcomes: [],
      studentArtifact: '',
      assessmentLink: '',
      sections: (lesson.sections || []).map((section) => ({ topicSection: section?.topicSection })),
    };
    return (isLessonRelevantSemanticSurface(identity, governedLesson) ? 120 : 0) + overlap * 18;
  }

  function removeCrossLessonTermLeakage(payload = {}, rejectedTerms = []) {
    if (!payload || rejectedTerms.length === 0) return payload;
    const rejectedNames = new Set(rejectedTerms.map((term) => normalizedFactOwnershipKey(term?.term)).filter(Boolean));
    const retainedNames = (Array.isArray(payload.keyTerms) ? payload.keyTerms : [])
      .map((term) => normalizedFactOwnershipKey(term?.term))
      .filter((name) => name && !rejectedNames.has(name));
    const rejectedAtoms = new Set(
      rejectedTerms
        .flatMap((term) => [term?.definition, term?.example, term?.misconception, term?.correction])
        .map(normalizedFactOwnershipKey)
        .filter((value) => value.length >= 24),
    );
    const containsRejectedAtom = (value) => valueContainsOwnedFact(value, rejectedAtoms);
    const containsRejectedTerm = (value) => {
      const normalized = normalizedFactOwnershipKey(typeof value === 'string' ? value : JSON.stringify(value));
      return [...rejectedNames].some((rejectedName) => {
        if (rejectedName.length < 4 || !normalized.includes(rejectedName)) return false;
        return !retainedNames.some(
          (retainedName) => retainedName.includes(rejectedName) && normalized.includes(retainedName),
        );
      });
    };
    const containsRejectedContent = (value) => containsRejectedAtom(value) || containsRejectedTerm(value);
    const filterSurface = (items) =>
      Array.isArray(items) ? items.filter((item) => !containsRejectedContent(item)) : items;
    const next = {
      ...payload,
      keyTerms: (Array.isArray(payload.keyTerms) ? payload.keyTerms : []).filter(
        (term) => !rejectedNames.has(normalizedFactOwnershipKey(term?.term)),
      ),
      quizItems: filterSurface(payload.quizItems),
      slideContent: filterSurface(payload.slideContent),
      kernel: {
        ...(payload.kernel || {}),
        facts: filterSurface(payload?.kernel?.facts),
        ...(containsRejectedContent(payload?.kernel?.scenario) ? { scenario: null } : {}),
      },
      semanticAdmissionReceipt: {
        ...(payload.semanticAdmissionReceipt || {}),
        crossLessonTermOwnershipApplied: true,
        removedCrossLessonTerms: [...rejectedNames],
      },
    };
    for (const field of ['discussionPrompt', 'assignmentCore', 'studyGuide', 'workedExample']) {
      if (containsRejectedContent(payload[field])) next[field] = undefined;
    }
    return next;
  }

  function semanticAdmissionRejectedTermNames(lesson = {}) {
    const receipt = lesson?.enrichment?.semanticAdmissionReceipt || {};
    const genomeAdmission = lesson?.enrichment?.semanticAdmission || {};
    const provenanceAdmission = lesson?.enrichment?.conceptProvenance?.semanticAdmission || {};
    const authoritativeEnrichment = hasAuthoritativeSourceLedgerProvenance(lesson?.enrichment);
    const groundedTokens = new Set(
      authoritativeEnrichment
        ? [
            ...(lesson?.enrichment?.keyTerms || []).flatMap((term) => [term?.term, term?.definition]),
            ...(lesson?.enrichment?.kernel?.facts || []),
            ...(lesson?.enrichment?.conceptProvenance?.citations || []).flatMap((citation) => [
              citation?.topic,
              citation?.displayTitle,
            ]),
          ].flatMap((value) => semanticIdentityTokens(value))
        : [],
    );
    // Native source-kernel backfill uses explicit sentence frames. A stale
    // Pass-B concept can survive in those frames even after the exact source
    // ledger for the lesson has changed (for example, "Apply X in one practical
    // example …"). Extract only those framed concept slots and require them to
    // share a semantic token with the admitted ledger. This is a general
    // compiler admission rule, not a course-name list.
    const framedConceptCandidates = authoritativeEnrichment
      ? [
          ...(lesson?.outcomes || []).flatMap((outcome) => {
            const match = cleanText(outcome).match(/^Apply\s+(.+?)\s+in\s+one\s+practical\s+example\b/i);
            return match?.[1] ? [match[1]] : [];
          }),
          ...String(lesson?.activityPattern || '')
            .split(/[.;\n]+/)
            .flatMap((activity) => {
              const match = cleanText(activity).match(/\bevidence\s+about\s+(.+?)(?:\s+and\b|\s+before\b|$)/i);
              return match?.[1] ? [match[1]] : [];
            }),
        ]
      : [];
    const ungroundedFramedTerms = framedConceptCandidates.filter((candidate) => {
      const candidateTokens = semanticIdentityTokens(candidate);
      return candidateTokens.length > 0 && !candidateTokens.some((token) => groundedTokens.has(token));
    });
    const researchBacked =
      /(?:research|source-library|algi)/i.test(cleanText(lesson?.enrichment?.enrichmentSource)) ||
      (lesson?.enrichment?.conceptProvenance?.citations || []).some((citation) =>
        /^(?:wikipedia|doaj|openalex|crossref|pubmed|eric)$/i.test(cleanText(citation?.provider)),
      );
    const identityUnboundResearchTerms = researchBacked
      ? [
          ...(lesson?.enrichment?.keyTerms || []).map((term) => term?.term || term?.tr),
          ...(lesson?.enrichment?.conceptProvenance?.citations || []).map(
            (citation) => citation?.displayTitle || citation?.title,
          ),
        ]
          .map(cleanText)
          .filter((surface) => surface && !isLessonResearchSurfaceBound(surface, lesson))
      : [];
    return unique(
      [
        ...(Array.isArray(lesson?.compilerSemanticAdmission?.rejectedTerms)
          ? lesson.compilerSemanticAdmission.rejectedTerms
          : []),
        ...(Array.isArray(receipt.removedCrossLessonTerms) ? receipt.removedCrossLessonTerms : []),
        ...(Array.isArray(receipt.quarantinedResearchTerms) ? receipt.quarantinedResearchTerms : []),
        ...(Array.isArray(genomeAdmission.rejectedTerms) ? genomeAdmission.rejectedTerms : []),
        ...(Array.isArray(provenanceAdmission.rejectedTerms) ? provenanceAdmission.rejectedTerms : []),
        ...ungroundedFramedTerms,
        ...identityUnboundResearchTerms,
      ]
        .map(normalizedFactOwnershipKey)
        .filter(Boolean),
      24,
    );
  }

  function textContainsRejectedLessonTerm(value, rejectedNames = []) {
    if (value == null || rejectedNames.length === 0) return false;
    const normalized = normalizedFactOwnershipKey(typeof value === 'string' ? value : JSON.stringify(value));
    return rejectedNames.some((name) => name.length >= 4 && normalized.includes(name));
  }

  function reconcileLessonFieldsWithSemanticAdmission(lesson = {}) {
    const rejectedNames = semanticAdmissionRejectedTermNames(lesson);
    if (rejectedNames.length === 0) return lesson;
    const explicitRejectedSourceLocators = [
      ...(lesson?.compilerSemanticAdmission?.rejectedSourceLocators || []),
      ...(lesson?.enrichment?.semanticAdmission?.rejectedSourceLocators || []),
      ...(lesson?.enrichment?.conceptProvenance?.semanticAdmission?.rejectedSourceLocators || []),
    ];
    const rejectedSourceLocators = unique(
      [
        ...explicitRejectedSourceLocators,
        ...(lesson?.enrichment?.conceptProvenance?.citations || [])
          .filter((citation) =>
            textContainsRejectedLessonTerm(
              [
                ...(citation?.conceptLinks || []).flatMap((link) => [link?.id, link?.label]),
                citation?.topic,
                citation?.evidence,
              ],
              rejectedNames,
            ),
          )
          .flatMap((citation) => [
            citation?.id,
            citation?.displayTitle,
            citation?.title,
            /^(?:https?:\/\/|doi:|urn:)/i.test(cleanText(citation?.sourceUrl)) ? citation.sourceUrl : '',
          ]),
      ]
        .map(cleanText)
        // A malformed legacy citation can put its numeric tier in sourceUrl.
        // Never treat a one-character value such as "2" as a source locator:
        // filtering on it would erase every learner line that happens to
        // contain that digit. Short chapter locators such as "7.1" remain valid.
        .filter((locator) => locator.length >= 3),
      24,
    );

    const admittedTerms = (Array.isArray(lesson?.enrichment?.keyTerms) ? lesson.enrichment.keyTerms : [])
      .map((term) => cleanText(term?.term || term?.tr))
      .filter((term) => term && !textContainsRejectedLessonTerm(term, rejectedNames));
    const retainedConcepts = (Array.isArray(lesson.keyConcepts) ? lesson.keyConcepts : []).filter(
      (concept) => !textContainsRejectedLessonTerm(concept, rejectedNames),
    );
    const keyConcepts = unique([...retainedConcepts, ...admittedTerms], 8);
    const lessonTitleIdentity = normalizedFactOwnershipKey(stripLessonPrefix(lesson.title || ''));
    const specificConcept = keyConcepts.find((concept) => normalizedFactOwnershipKey(concept) !== lessonTitleIdentity);
    const primaryConcept =
      specificConcept || keyConcepts[0] || stripLessonPrefix(lesson.title || '') || 'the lesson focus';
    const retainedOutcomes = (Array.isArray(lesson.outcomes) ? lesson.outcomes : []).filter(
      (outcome) => !textContainsRejectedLessonTerm(outcome, rejectedNames),
    );
    const readings = (Array.isArray(lesson.readings) ? lesson.readings : []).filter(
      (reading) => !textContainsRejectedLessonTerm(reading, rejectedNames),
    );
    const sourceEvidenceBrief = lesson?.sourceEvidenceBrief
      ? {
          ...lesson.sourceEvidenceBrief,
          claims: (lesson.sourceEvidenceBrief.claims || []).filter(
            (claim) => !textContainsRejectedLessonTerm(claim, rejectedNames),
          ),
          sources: (lesson.sourceEvidenceBrief.sources || []).filter(
            (source) => !textContainsRejectedLessonTerm(source, rejectedNames),
          ),
        }
      : lesson?.sourceEvidenceBrief;
    const sourceAnchors = (Array.isArray(lesson.sourceAnchors) ? lesson.sourceAnchors : []).filter(
      (anchor) => !textContainsRejectedLessonTerm(anchor?.anchor, rejectedNames),
    );
    const operationConcept =
      keyConcepts.find(
        (concept) => normalizedFactOwnershipKey(concept) !== lessonTitleIdentity && operationForText(concept),
      ) ||
      specificConcept ||
      primaryConcept;
    // Preserve the admitted plan's actual objective count. Padding a sound
    // one-objective plan with generic objectives created a split brain:
    // exports taught one intent while the package manifest graded another.
    const targetOutcomeCount = Math.max(1, Math.min(5, Array.isArray(lesson.outcomes) ? lesson.outcomes.length : 1));
    const outcomes = unique(
      [
        ...retainedOutcomes,
        `Apply ${operationConcept} in one practical example from ${stripLessonPrefix(
          lesson.title || '',
        )} and justify one revision.`,
        `Explain ${primaryConcept} using the available course evidence.`,
      ],
      targetOutcomeCount,
    );

    return {
      ...lesson,
      keyConcepts,
      outcomes,
      readings,
      sourceEvidenceBrief,
      sourceAnchors,
      successCriteria: successCriteriaForLesson(lesson.title || '', keyConcepts),
      activityPattern: textContainsRejectedLessonTerm(lesson.activityPattern, rejectedNames)
        ? undefined
        : lesson.activityPattern,
      prerequisitePlan: null,
      pacing: null,
      learningTransferPlan: null,
      teachingIntent: null,
      conceptDependencyPlan: null,
      practiceProgressionPlan: null,
      masteryEvidencePlan: null,
      evidenceResponsePlan: null,
      objectiveEvidencePlan: null,
      evidencePlan: null,
      sourceUsePlan: null,
      misconceptionMap: null,
      modelContrast: null,
      readinessSupport: null,
      instructionalRationale: null,
      accessibilityPlan: null,
      feedbackCycle: null,
      throughlineCase: null,
      compilerSemanticAdmission: {
        source: 'cross-lesson-semantic-admission-v1',
        rejectedTerms: rejectedNames,
        rejectedSourceLocators,
        rebuiltDerivedLessonFields: true,
      },
    };
  }

  function semanticAdmissionFilteredLines(value, rejectedTerms = [], rejectedSourceLocators = []) {
    const rejectedLocators = rejectedSourceLocators.map(cleanText).filter(Boolean);
    const isRejected = (line) => {
      const text = cleanText(line);
      const normalized = text.toLowerCase();
      return (
        textContainsRejectedLessonTerm(text, rejectedTerms) ||
        rejectedLocators.some((locator) => normalized.includes(locator.toLowerCase()))
      );
    };
    if (Array.isArray(value)) {
      return value.filter((line) => !isRejected(line));
    }
    const lines = String(value || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !isRejected(line));
    return lines.join('\n');
  }

  function reconcileCourseMapWithBlueprintSemanticAdmission(courseMap = null, blueprint = null) {
    if (!Array.isArray(courseMap?.lessons) || !Array.isArray(blueprint?.lessons)) return courseMap;
    const repairs = [];
    const lessons = courseMap.lessons.map((sourceLesson, index) => {
      const admittedLesson =
        blueprint.lessons.find(
          (lesson) => Number(lesson?.lessonNumber) === Number(sourceLesson?.lessonNumber || index + 1),
        ) || blueprint.lessons[index];
      const admission = admittedLesson?.compilerSemanticAdmission;
      if (admission?.rebuiltDerivedLessonFields !== true) return sourceLesson;

      const rejectedTerms = admission.rejectedTerms || [];
      const rejectedSourceLocators = admission.rejectedSourceLocators || [];
      const focus = stripLessonPrefix(admittedLesson.title || sourceLesson?.title || `Lesson ${index + 1}`);
      const focusIdentity = normalizedFactOwnershipKey(focus);
      const primaryConcept =
        (admittedLesson.keyConcepts || []).find(
          (concept) =>
            normalizedFactOwnershipKey(concept) !== focusIdentity &&
            !textContainsRejectedLessonTerm(concept, rejectedTerms),
        ) || focus;
      const authoritativeIntent = (blueprint?.instructionalIntentGraph?.lessonIntents || []).find(
        (intent) => Number(intent?.lessonNumber) === Number(admittedLesson?.lessonNumber || index + 1),
      );
      // Semantic admission may rebuild lesson fields after the plan has been
      // approved. Never let those post-plan repair outcomes overwrite the
      // hash-bound target objectives in the instructor-facing Course Map.
      const objectives = unique(authoritativeIntent?.targetObjectives || admittedLesson.outcomes || [], 8).join('\n');
      const sections = (Array.isArray(sourceLesson?.sections) ? sourceLesson.sections : []).map((section) => {
        const learningGoals = semanticAdmissionFilteredLines(
          section?.learningGoals,
          rejectedTerms,
          rejectedSourceLocators,
        );
        const asyncActivities = semanticAdmissionFilteredLines(
          section?.asyncActivities,
          rejectedTerms,
          rejectedSourceLocators,
        );
        const syncActivities = semanticAdmissionFilteredLines(
          section?.syncActivities,
          rejectedTerms,
          rejectedSourceLocators,
        );
        const evaluateDesign = semanticAdmissionFilteredLines(
          section?.evaluateDesign,
          rejectedTerms,
          rejectedSourceLocators,
        );
        const weeklyAssessments = semanticAdmissionFilteredLines(
          section?.weeklyAssessments,
          rejectedTerms,
          rejectedSourceLocators,
        );
        return {
          ...section,
          learningGoals:
            learningGoals ||
            `Use the admitted course evidence for ${primaryConcept} to make and justify one bounded ${focus} decision.`,
          learningObjectives: objectives,
          weeklyAssessments:
            weeklyAssessments ||
            `${admittedLesson.studentArtifact || `${focus} evidence artifact`} → Assignment Briefs / Lesson ${index + 1}`,
          asyncActivities:
            asyncActivities ||
            `Annotate one admitted source detail about ${primaryConcept}, state the conclusion it supports, and name one limitation.`,
          syncActivities:
            syncActivities ||
            `Work through one bounded ${focus} case, compare two interpretations against the admitted evidence, and document one justified revision.`,
          supportingResources: semanticAdmissionFilteredLines(
            section?.supportingResources,
            rejectedTerms,
            rejectedSourceLocators,
          ),
          evaluateDesign:
            evaluateDesign ||
            `Confirm ${/^(?:the|a|an)\b/i.test(focus) ? '' : 'the '}${focus} activity and assessment use the same admitted evidence, operation, boundary, and revision trail.`,
        };
      });
      repairs.push({
        lessonNumber: Number(admittedLesson.lessonNumber || index + 1),
        rejectedTerms,
        rejectedSourceLocators,
      });
      return { ...sourceLesson, sections };
    });
    if (repairs.length === 0) return courseMap;
    return {
      ...courseMap,
      lessons,
      compilerSemanticAdmissionReceipt: {
        protocol: 'coursemapper-course-map-semantic-admission-v1',
        repairedLessonCount: repairs.length,
        repairs,
      },
    };
  }

  function applyCrossLessonFactOwnershipToLessons(lessons = []) {
    const lessonContent = Object.fromEntries(
      lessons
        .filter((lesson) => lesson?.enrichment)
        .map((lesson, index) => [lesson.id || `lesson-${lesson.lessonNumber || index + 1}`, lesson.enrichment]),
    );
    const safe =
      Object.keys(lessonContent).length >= 2
        ? disciplineSafeBlueprintEnrichment({ lessonContent }, lessons)?.lessonContent || lessonContent
        : lessonContent;
    return lessons.map((lesson, index) => {
      const key = lesson.id || `lesson-${lesson.lessonNumber || index + 1}`;
      const enrichment = safe[key];
      const enrichedLesson = enrichment && enrichment !== lesson.enrichment ? { ...lesson, enrichment } : lesson;
      return reconcileLessonFieldsWithSemanticAdmission(enrichedLesson);
    });
  }

  function disciplineSafeBlueprintEnrichment(enrichment = null, lessons = []) {
    if (!enrichment || typeof enrichment !== 'object') return enrichment;
    const lessonContent = enrichment.lessonContent;
    if (!lessonContent || typeof lessonContent !== 'object') return enrichment;

    let changed = false;
    const initiallySafeLessonContent = Object.fromEntries(
      Object.entries(lessonContent).map(([key, payload]) => {
        const numberMatch = String(key).match(/^lesson-(\d+)$/);
        const lessonNumber = numberMatch ? Number(numberMatch[1]) : null;
        const lesson =
          lessons.find((candidate) => candidate.id === key || candidate.lessonNumber === lessonNumber) || null;
        if (!lesson) return [key, payload];
        const safePayload = enforceDisciplineSafeEnrichment(lesson, payload);
        if (safePayload !== payload) changed = true;
        return [key, safePayload];
      }),
    );
    const factOwners = new Map();
    for (const [key, payload] of Object.entries(initiallySafeLessonContent)) {
      const numberMatch = String(key).match(/^lesson-(\d+)$/);
      const lessonNumber = numberMatch ? Number(numberMatch[1]) : null;
      const lesson = lessons.find((candidate) => candidate.id === key || candidate.lessonNumber === lessonNumber);
      if (!lesson || payload?.projectionKind === 'cumulative-assessment') continue;
      (Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : []).forEach((fact, factIndex) => {
        const factKey = normalizedFactOwnershipKey(fact);
        if (factKey.length < 24) return;
        const candidates = factOwners.get(factKey) || [];
        candidates.push({ key, lesson, payload, fact, factIndex });
        factOwners.set(factKey, candidates);
      });
    }
    const rejectedByLesson = new Map();
    for (const [factKey, candidates] of factOwners) {
      // One supporting fact may legitimately bridge two adjacent lessons. The
      // defect begins when the same sentence is sprayed across three or more
      // lesson kernels, where it stops behaving like a prerequisite bridge and
      // starts displacing lesson-owned evidence.
      if (candidates.length < 3) continue;
      const ranked = [...candidates].sort((left, right) => {
        const scoreDelta =
          lessonFactOwnershipScore(right.lesson, right.payload, right.fact, right.factIndex) -
          lessonFactOwnershipScore(left.lesson, left.payload, left.fact, left.factIndex);
        if (scoreDelta !== 0) return scoreDelta;
        return left.lesson.lessonNumber - right.lesson.lessonNumber;
      });
      const firstScore = lessonFactOwnershipScore(
        ranked[0].lesson,
        ranked[0].payload,
        ranked[0].fact,
        ranked[0].factIndex,
      );
      const secondScore = lessonFactOwnershipScore(
        ranked[1].lesson,
        ranked[1].payload,
        ranked[1].fact,
        ranked[1].factIndex,
      );
      const adjacentBridge =
        Math.abs(ranked[0].lesson.lessonNumber - ranked[1].lesson.lessonNumber) <= 1 &&
        secondScore >= 120 &&
        firstScore - secondScore <= 40;
      const retainedOwnerCount = firstScore < 120 ? 0 : adjacentBridge ? 2 : 1;
      for (const rejected of ranked.slice(retainedOwnerCount)) {
        const rejectedFacts = rejectedByLesson.get(rejected.key) || new Set();
        rejectedFacts.add(factKey);
        rejectedByLesson.set(rejected.key, rejectedFacts);
      }
    }
    const factSafeLessonContent = Object.fromEntries(
      Object.entries(initiallySafeLessonContent).map(([key, payload]) => {
        const rejectedFacts = rejectedByLesson.get(key);
        if (!rejectedFacts?.size) return [key, payload];
        changed = true;
        return [key, removeCrossLessonFactLeakage(payload, rejectedFacts)];
      }),
    );
    const termOwners = new Map();
    for (const [key, payload] of Object.entries(factSafeLessonContent)) {
      const numberMatch = String(key).match(/^lesson-(\d+)$/);
      const lessonNumber = numberMatch ? Number(numberMatch[1]) : null;
      const lesson = lessons.find((candidate) => candidate.id === key || candidate.lessonNumber === lessonNumber);
      if (!lesson || payload?.projectionKind === 'cumulative-assessment') continue;
      for (const term of Array.isArray(payload?.keyTerms) ? payload.keyTerms : []) {
        const termKey = normalizedFactOwnershipKey(term?.term);
        if (termKey.length < 4) continue;
        const candidates = termOwners.get(termKey) || [];
        candidates.push({ key, lesson, term });
        termOwners.set(termKey, candidates);
      }
    }
    const rejectedTermsByLesson = new Map();
    for (const candidates of termOwners.values()) {
      if (candidates.length < 2) continue;
      const ranked = [...candidates].sort((left, right) => {
        const scoreDelta =
          lessonTermOwnershipScore(right.lesson, right.term) - lessonTermOwnershipScore(left.lesson, left.term);
        if (scoreDelta !== 0) return scoreDelta;
        return left.lesson.lessonNumber - right.lesson.lessonNumber;
      });
      const firstScore = lessonTermOwnershipScore(ranked[0].lesson, ranked[0].term);
      const secondScore = lessonTermOwnershipScore(ranked[1].lesson, ranked[1].term);
      const adjacentBridge =
        Math.abs(ranked[0].lesson.lessonNumber - ranked[1].lesson.lessonNumber) <= 1 &&
        firstScore >= 120 &&
        secondScore >= 120 &&
        firstScore - secondScore <= 36;
      const retainedOwnerCount = firstScore < 120 ? 0 : adjacentBridge ? 2 : 1;
      for (const rejected of ranked.slice(retainedOwnerCount)) {
        const terms = rejectedTermsByLesson.get(rejected.key) || [];
        terms.push(rejected.term);
        rejectedTermsByLesson.set(rejected.key, terms);
      }
    }
    const safeLessonContent = Object.fromEntries(
      Object.entries(factSafeLessonContent).map(([key, payload]) => {
        const rejectedTerms = rejectedTermsByLesson.get(key);
        if (!rejectedTerms?.length) return [key, payload];
        changed = true;
        return [key, removeCrossLessonTermLeakage(payload, rejectedTerms)];
      }),
    );
    return changed ? { ...enrichment, lessonContent: safeLessonContent } : enrichment;
  }

  function studyGuideTermsForLesson(lesson = {}) {
    const terms = safeLessonConcepts(lesson, { limit: 8 });
    const titleWords = new Set(
      stripLessonPrefix(lesson.title || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    );
    const withoutTitleFragments = terms.filter(
      (term) => !(wordCount(term) === 1 && titleWords.has(cleanText(term).toLowerCase())),
    );
    if (withoutTitleFragments.length >= 4) return withoutTitleFragments;
    if (terms.length >= 3) return terms;
    return unique(
      [...terms, ...wordsFromConcepts([lesson.outcomes?.join(' '), lesson.successCriteria?.join(' ')], 8)],
      8,
    );
  }

  function functionalVisualStudyWorkedExample(blueprint = {}, lesson = {}, studyArtifact = '') {
    return createFunctionalVisualStudyWorkedExample({
      blueprint,
      lesson,
      studyArtifact,
      lessonRequiresFunctionalVisual,
      safeLessonPrimaryConcept,
      safeLessonConcepts,
      asArray,
      typedEvidenceSpecimenProfile,
      lessonVariant,
    });
  }

  function objectiveAlignedToTestedConcept(lesson = {}, concept = '', fallback = '') {
    const conceptTokens = new Set(semanticIdentityTokens(concept));
    const outcomes = Array.isArray(lesson.outcomes) ? lesson.outcomes.map(cleanText).filter(Boolean) : [];
    if (conceptTokens.size === 0 || outcomes.length === 0) return cleanText(fallback || outcomes[0]);
    const ranked = outcomes
      .map((outcome, index) => {
        const tokens = new Set(semanticIdentityTokens(outcome));
        const overlap = [...conceptTokens].filter((token) => tokens.has(token)).length;
        const exactPhrase = normalizedFactOwnershipKey(outcome).includes(normalizedFactOwnershipKey(concept));
        return { outcome, index, score: overlap * 10 + (exactPhrase ? 50 : 0) };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index);
    return ranked[0]?.score > 0 ? ranked[0].outcome : cleanText(fallback || outcomes[0]);
  }

  function quizConceptAlignedToPlan(lesson = {}, plan = {}, fallback = '') {
    const teachingTerms = lessonTeachingKeyTerms(lesson)
      .map((term) => cleanText(term?.term))
      .filter(
        (value) =>
          value &&
          !isWeakConcept(value) &&
          !isObjectiveLikeConcept(value) &&
          !isOverlongConceptCandidate(value) &&
          !isEvidencePacketLikeConcept(value) &&
          !isUnsafeLessonConceptPhrase(value),
      );
    // The general concept normalizer intentionally prefers a longer composite
    // over a contained term. Quiz alignment needs the opposite information too:
    // “p-value” must remain selectable beside “confidence intervals and
    // p-values” when the objective tests only the former.
    const candidates = unique(
      [
        ...normalizeConceptCandidates(lesson?.keyConcepts || [], {
          title: lesson?.title,
          limit: 12,
        }),
        ...teachingTerms,
      ],
      12,
    );
    if (candidates.length === 0) return cleanText(fallback);
    const objective = cleanText(plan?.objective);
    const sourceSignal = cleanText(plan?.sourceSignal);
    const signal = `${objective} ${sourceSignal}`;
    const objectiveKey = normalizedFactOwnershipKey(objective);
    const sourceSignalKey = normalizedFactOwnershipKey(sourceSignal);
    const ranked = candidates
      .map((candidate, index) => {
        const candidateKey = normalizedFactOwnershipKey(candidate);
        const sourceExactPhrase = candidateKey.length > 0 && sourceSignalKey.includes(candidateKey);
        const objectiveExactPhrase = candidateKey.length > 0 && objectiveKey.includes(candidateKey);
        return {
          candidate,
          index,
          // The plan has already selected the objective that best matches its
          // source signal. Prefer an exact concept in that objective, then the
          // raw signal; this prevents a generated broad title cue from
          // displacing the admitted disciplinary term the objective tests.
          score:
            objectiveOverlapScore(signal, candidate) + (sourceExactPhrase ? 200 : 0) + (objectiveExactPhrase ? 250 : 0),
        };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index);
    return ranked[0]?.score > 0 ? ranked[0].candidate : cleanText(fallback || candidates[0]);
  }

  function applyAuthenticDataTaskQuizBinding(atoms = [], lesson = {}, { machineScored = false } = {}) {
    const task = lesson?.authenticDataTaskPlan;
    const examples = Array.isArray(task?.examples) ? task.examples : [];
    if (
      task?.protocol !== 'coursemapper-authentic-evidence-task-binding-v1' ||
      !task?.truthProof?.promptDisplaysBoundPayload ||
      !task?.truthProof?.answerKeyOperatesOnBoundPayload ||
      !task?.truthProof?.rubricScoresDeclaredOperation ||
      examples.length === 0 ||
      atoms.length === 0
    ) {
      return atoms;
    }
    const displayLabel = (example, index) =>
      String(example?.displayLabel || '').trim() ||
      `${String(example?.language || 'Language').trim() || 'Language'} example${examples.length > 1 ? ` ${index + 1}` : ''} at ${String(example?.sourceLocator || 'the recorded source location')}`;
    const evidenceRenderers = [
      (example, index) =>
        `${displayLabel(example, index)}: “${example.form}” [${example.gloss}] — ${stripTerminalPunctuation(example.translation)}`,
      (example, index) =>
        `${displayLabel(example, index)} — form “${example.form}”; gloss [${example.gloss}] for this record; translation “${stripTerminalPunctuation(example.translation)}”`,
      (example, index) =>
        `Form “${example.form}” from ${displayLabel(example, index)}; recorded as [${example.gloss}] at ${example.sourceLocator} and translated “${stripTerminalPunctuation(example.translation)}”`,
      (example, index) =>
        `${displayLabel(example, index)} records [${example.gloss}] for “${example.form}”; the source translates it as “${stripTerminalPunctuation(example.translation)}”`,
    ];
    const renderEvidenceLabel = (variant = 0) =>
      stripTerminalPunctuation(
        examples
          .map((example, index) => evidenceRenderers[variant % evidenceRenderers.length](example, index))
          .join('. '),
      );
    const renderEvidenceSubset = (indices, variant = 0) =>
      stripTerminalPunctuation(
        indices
          .map((exampleIndex) =>
            evidenceRenderers[variant % evidenceRenderers.length](examples[exampleIndex], exampleIndex),
          )
          .join('. '),
      );
    if (task.operation === 'proposal-defense' && examples.length >= 2) {
      const lessonFocus = stripLessonPrefix(lesson.title);
      const lastIndex = examples.length - 1;
      const middleIndex = Math.min(1, lastIndex);
      const allIndices = examples.map((_, index) => index);
      const rows = [
        {
          indices: [0],
          prompt: 'Which research question can this record answer?',
          answer: `Ask a bounded question about ${examples[0].analysisFocus} and keep the claim within ${displayLabel(examples[0], 0)}.`,
          scoring: 'Names the analytic target, the cited record, and the limit on transfer.',
        },
        {
          indices: [middleIndex],
          prompt:
            'Choose the course method. Cite one evidence detail, explain what it preserves, and state a limitation.',
          answer: `Preserve “${examples[middleIndex].form},” its gloss “${examples[middleIndex].gloss},” the source locator, and an explicit annotation rule for the pattern being tested.`,
          scoring: 'Specifies the unit, exact record, notation or annotation rule, and source locator.',
        },
        {
          indices: [lastIndex],
          prompt:
            'Identify the course principle. Cite one evidence detail, explain its verification check, and name a limitation or next piece of evidence.',
          answer: `Have a second analyst apply the declared segmentation or annotation rule to “${examples[lastIndex].form},” compare the result, and resolve any disagreement before drawing the claim.`,
          scoring: 'Proposes an executable reliability check tied to the displayed form.',
        },
        {
          indices: [...new Set([0, middleIndex])],
          prompt:
            'Select the course framework. Cite one evidence detail per record, explain their relationship, and state the boundary.',
          answer: `State a shared analytic unit, document how each form is annotated, compare only the recorded features, and avoid treating the two examples as a representative language sample.`,
          scoring: 'Defines a common comparison unit, preserves both records, and limits the sampling claim.',
        },
        {
          indices: [...new Set([middleIndex, lastIndex])],
          prompt:
            'Identify the course principle. Cite the challenging evidence detail, explain the revision, and state a limitation or additional evidence need.',
          answer: `Predeclare the pattern the proposal expects, treat either displayed form as a potential challenge to that pattern, and revise or narrow the analysis when the annotation does not fit.`,
          scoring: 'Names the expected pattern, the disconfirming evidence, and the resulting revision rule.',
        },
        {
          indices: allIndices,
          prompt: 'Write a defensible methods plan for this comparison set.',
          answer: `Name the bounded question, list the included records and source locators, define the annotation procedure, add a reliability check, state the planned comparison, and preserve one limitation on the final claim.`,
          scoring: 'Covers question, inclusion, annotation, reliability, comparison, traceability, and limitation.',
        },
        {
          indices: [0],
          prompt: 'Where must the conclusion stop, and what evidence is needed for transfer?',
          answer: `${examples[0].communityContext} Add a contrasting record selected by the same inclusion and annotation rules before extending the conclusion.`,
          scoring: 'Uses the supplied community boundary and requests a method-matched contrasting record.',
        },
        {
          indices: allIndices,
          prompt: 'Defend each design decision with evidence and name the condition that forces revision.',
          answer: task.answerKey,
          scoring: 'Integrates the records into a replayable proposal and states a concrete revision trigger.',
        },
      ];
      return atoms.map((atom, index) => {
        const row = rows[index % rows.length];
        const type = machineScored || index === 0 ? 'multiple_choice' : index >= 5 ? 'essay' : 'short_answer';
        const evidenceLabel = renderEvidenceSubset(row.indices, index);
        const base = {
          ...atom,
          type,
          bloomsLevel: index < 2 ? 'Analyze' : index < 5 ? 'Apply' : 'Evaluate',
          difficulty: index < 2 ? 'Medium' : 'Hard',
          estimatedMinutes: type === 'essay' ? 15 : type === 'short_answer' ? 7 : 3,
          points: type === 'essay' ? Math.max(8, Number(atom?.points) || 0) : Math.max(4, Number(atom?.points) || 0),
          objectiveAligned: task.objective,
          question: `${lessonFocus} evidence: ${evidenceLabel}. ${row.prompt}`,
          intendedUse: `${type === 'multiple_choice' ? 'Machine-scored' : 'Instructor-scored'} proposal-design reasoning on source-bound authentic evidence.`,
          enrichmentSource: 'fingerprinted-authentic-evidence',
          sourceReviewRequired: false,
          authenticEvidenceBinding: clonePlain(task.truthProof),
          tags: quizTags(
            lesson,
            type,
            index < 2 ? 'Analyze' : index < 5 ? 'Apply' : 'Evaluate',
            'authentic-data proposal',
          ),
        };
        if (type === 'multiple_choice') {
          const correctLetter = correctLetterForQuestion(lesson, index);
          const distractors = [
            'Use the translation as the analysis and omit the form, gloss, and source locator.',
            'Treat the displayed record as representative of every variety without adding a comparison sample.',
            'Choose the conclusion first, then retain only records that support it and skip the reliability check.',
          ];
          let distractorIndex = 0;
          return {
            ...base,
            options: QUIZ_ANSWER_LETTERS.map((letter) =>
              labelQuizOption(letter, letter === correctLetter ? row.answer : distractors[distractorIndex++]),
            ),
            answer: correctLetter,
            sampleAnswer: undefined,
            explanation: `Proposal evidence: ${row.answer}`,
            scoringGuidance: undefined,
            rubricHints: undefined,
          };
        }
        return {
          ...base,
          options: undefined,
          answer: row.answer,
          sampleAnswer: row.answer,
          explanation: `This item tests a distinct proposal decision using only the displayed record set.`,
          scoringGuidance: row.scoring,
          ...(type === 'essay' ? { rubricHints: [...task.assessmentCriteria] } : {}),
        };
      });
    }
    const firstExample = examples[0];
    const comparisonRelation = task?.comparisonRelation;
    const relationEvidenceIds = new Set(
      Array.isArray(comparisonRelation?.evidenceItemIds) ? comparisonRelation.evidenceItemIds.map(String) : [],
    );
    const relationOperandLabels = Array.isArray(comparisonRelation?.operandLabels)
      ? comparisonRelation.operandLabels.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    // Comparison is admitted only from a typed relation that names every
    // evidence record and at least two operands. Different ids/forms alone do
    // not prove that the records instantiate a disciplinary contrast.
    const comparisonEligible = Boolean(
      ['comparison', 'mechanism-explanation'].includes(task?.operation) &&
      comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1' &&
      String(comparisonRelation?.relationId || '').trim() &&
      relationOperandLabels.length >= 2 &&
      String(comparisonRelation?.sharedFeature || '').trim() &&
      String(comparisonRelation?.discriminatingFeature || '').trim() &&
      relationEvidenceIds.size >= 1 &&
      [...relationEvidenceIds].every((id) => examples.some((example) => String(example?.id || '') === id)),
    );
    const secondExample = comparisonEligible && examples.length > 1 ? examples[1] : null;
    const firstLabel = displayLabel(firstExample, 0);
    const evidenceLabels = examples.map(displayLabel);
    const evidenceNames = evidenceLabels.join(' and ');
    const lessonFocus = stripLessonPrefix(lesson.title);
    const evidenceBoundary = (value, fallback) => stripTerminalPunctuation(cleanText(value, fallback));
    const firstRecordedFeature = compactAuthenticRecordedFeature(firstExample, 'the first recorded pattern');
    const secondRecordedFeature = compactAuthenticRecordedFeature(secondExample, 'the second recorded pattern');
    const secondLabel = secondExample ? displayLabel(secondExample, 1) : 'the second record';
    const relationFrame = comparisonEligible
      ? `Comparison operands: ${relationOperandLabels.join(' · ')}. Shared feature: ${comparisonRelation.sharedFeature} Discriminating feature: ${comparisonRelation.discriminatingFeature}`
      : '';
    const boundaryFrame = comparisonEligible
      ? `The conclusion stays within ${evidenceNames} and the recorded boundary: ${evidenceBoundary(firstExample.communityContext || secondExample?.communityContext, 'do not extend the pattern beyond the cited records')}.`
      : `The conclusion stays within ${firstLabel} and the recorded boundary: ${evidenceBoundary(firstExample.communityContext, 'do not extend the pattern beyond the cited record')}.`;
    const correctFrames = {
      identify: comparisonEligible ? relationFrame : `Identification: ${firstLabel}: ${firstExample.analysisFocus}`,
      compare: comparisonEligible
        ? relationFrame
        : `Identification: ${firstLabel} “${firstExample.form}”; its form and gloss support identification.`,
      bounded: comparisonEligible
        ? `${relationFrame} ${boundaryFrame}`
        : `Evidence detail: ${firstLabel} “${firstExample.form}” carries the recorded gloss “${firstExample.gloss}.” ${boundaryFrame}`,
      boundary: boundaryFrame,
    };
    const distractors = comparisonEligible
      ? [
          `${relationOperandLabels.join(' · ')} share ${comparisonRelation.sharedFeature}, so the recorded difference “${comparisonRelation.discriminatingFeature}” can be ignored.`,
          `${relationOperandLabels.join(' · ')} differ because ${comparisonRelation.sharedFeature}; the recorded discriminating feature is the shared property.`,
          `${relationOperandLabels.join(' · ')} establish ${comparisonRelation.discriminatingFeature} for every form beyond the cited records.`,
        ]
      : [
          `${firstLabel} “${firstExample.form}” should be identified from the translation “${firstExample.translation}” even if the recorded gloss is discarded.`,
          `${firstLabel} “${firstExample.form}” can be analyzed by treating its gloss “${firstExample.gloss}” as a free translation, without checking the form-to-gloss alignment.`,
          `${firstLabel} “${firstExample.form}” proves the same pattern for every record beyond ${firstExample.sourceLocator}.`,
        ];
    // One authentic-record recognition item is enough for an instructor-
    // scored quiz. Reusing the same three counterclaims four times teaches
    // students the option pattern and creates package-wide boilerplate. The
    // remaining tasks require students to perform the evidence operation.
    const mcSlots = new Set(machineScored ? atoms.map((_, index) => index) : [0]);
    const methodPromptVariants = [
      (evidenceLabel) =>
        `Bound evidence: ${evidenceLabel}. Name the method, cite its deciding detail, connect it to ${task.operation}, and state the limit.`,
      (evidenceLabel) =>
        `Using ${evidenceLabel}, choose the principle for ${task.operation}; cite the decisive detail and bound the claim.`,
      (evidenceLabel) =>
        `Choose the method for ${task.operation} in ${evidenceLabel}; trace it to an observable detail and mark where evidence stops.`,
      (evidenceLabel) =>
        `For ${evidenceLabel}, select a defensible ${task.operation} lens; connect it to one visible feature and reject an overreach.`,
    ];
    const methodPrompt =
      methodPromptVariants[(Math.max(1, Number(lesson?.lessonNumber) || 1) - 1) % methodPromptVariants.length];
    const promptFrames = [
      {
        intent: comparisonEligible ? 'compare' : 'identify',
        question: (evidenceLabel) =>
          `Evidence case: ${evidenceLabel}. Which response about ${lessonFocus} identifies the observable pattern without extending beyond these records?`,
      },
      {
        intent: comparisonEligible ? 'compare' : 'identify',
        question: methodPrompt,
      },
      {
        intent: 'bounded',
        question: (evidenceLabel) =>
          `For ${lessonFocus}, identify a method or principle. Cite one evidence detail from ${evidenceLabel}, apply it to ${task.operation}, and state the boundary.`,
      },
      {
        intent: 'bounded',
        question: (evidenceLabel) =>
          `A peer gives a generic ${lessonFocus} account of ${task.operation}. For ${lessonFocus}, select the rule or lens that corrects it, cite the decisive evidence detail in ${evidenceLabel}, and explain what remains unproven.`,
      },
      {
        intent: 'bounded',
        question: (evidenceLabel) =>
          `Evidence case: ${evidenceLabel}. Identify a course concept or principle. Cite one evidence detail, explain the strongest ${lessonFocus} claim, and state a limitation.`,
      },
      {
        intent: 'bounded',
        question: (evidenceLabel) =>
          `Evaluate ${evidenceLabel} through ${task.operation} for ${lessonFocus}; connect each ${lessonFocus} conclusion to an exact record and reject one overclaim.`,
      },
      {
        intent: 'boundary',
        question: (evidenceLabel) =>
          `Evidence boundary for ${lessonFocus}: ${evidenceLabel}. Which conclusion about ${lessonFocus} remains inside the recorded community context and source locator?`,
      },
      {
        intent: 'bounded',
        question: (evidenceLabel) =>
          `Revise an overgeneralized ${lessonFocus} ${task.operation} claim by using ${evidenceLabel}; preserve the supported ${lessonFocus} pattern and state the missing evidence needed for transfer.`,
      },
    ];
    return atoms.map((atom, index) => {
      const prompt = promptFrames[index % promptFrames.length];
      const type = mcSlots.has(index) ? 'multiple_choice' : index >= 5 ? 'essay' : 'short_answer';
      const bloomsLevel = index < 2 ? 'Analyze' : index < 5 ? 'Apply' : 'Evaluate';
      const base = {
        ...atom,
        type,
        bloomsLevel,
        difficulty: index < 2 ? 'Medium' : index < 5 ? 'Medium' : 'Hard',
        estimatedMinutes: type === 'essay' ? 15 : type === 'short_answer' ? 7 : 3,
        points: type === 'essay' ? Math.max(8, Number(atom?.points) || 0) : Math.max(4, Number(atom?.points) || 0),
        objectiveAligned: task.objective,
        // Each item remains self-contained, but rotates an equivalent rendering
        // of the same bound payload. This avoids teaching students a memorized
        // sentence pattern and prevents legitimate source evidence from becoming
        // package-wide boilerplate when a quiz is embedded in several handouts.
        question: prompt.question(renderEvidenceLabel(index)),
        intendedUse: `${type === 'multiple_choice' ? 'Machine-scored' : 'Instructor-scored'} ${task.operation} on source-bound authentic evidence.`,
        enrichmentSource: 'fingerprinted-authentic-evidence',
        sourceReviewRequired: false,
        authenticEvidenceBinding: clonePlain(task.truthProof),
        distractorDiscrimination: {
          protocol: 'coursemapper-distractor-discrimination-v1',
          status: comparisonEligible ? 'typed-relation-counterclaims' : 'record-specific-counterclaims',
          authoredDistractorCount: 3,
          fallback: null,
        },
        tags: quizTags(lesson, type, bloomsLevel, 'authentic-data analysis'),
      };
      if (type === 'multiple_choice') {
        const answer = correctLetterForQuestion(lesson, index);
        const correct = correctFrames[prompt.intent] || correctFrames.identify;
        let distractorIndex = 0;
        return {
          ...base,
          options: QUIZ_ANSWER_LETTERS.map((letter) =>
            labelQuizOption(letter, letter === answer ? correct : distractors[distractorIndex++]),
          ),
          answer,
          sampleAnswer: undefined,
          explanation: `Evidence basis: ${correct}`,
          scoringGuidance: undefined,
          rubricHints: undefined,
        };
      }
      const constructedAnswers = comparisonEligible
        ? authenticComparisonConstructedAnswers(
            firstLabel,
            secondLabel,
            firstRecordedFeature,
            secondRecordedFeature,
            evidenceNames,
          )
        : [
            '',
            correctFrames.identify,
            correctFrames.bounded,
            `Apply ${firstExample.analysisFocus} Use ${firstLabel} as the evidence and do not generalize to an unobserved form.`,
            `The recorded analysis focus is ${firstExample.analysisFocus} Keep the conclusion to ${firstLabel}.`,
            task.answerKey,
            `Boundary: keep the conclusion to ${firstLabel}; another record is needed before transfer.`,
            `Revision: ${firstLabel}; identification kept, overclaim removed, transfer evidence requested.`,
          ];
      const answer = constructedAnswers[index] || task.answerKey;
      const sampleFrames = [
        `Evidence: “${firstExample.form}” [${firstExample.gloss}]. Identify the pattern; stop at this record.`,
        `Use the recorded gloss “${firstExample.gloss}” to analyze “${firstExample.form}”; leave unseen forms unclassified.`,
        `For ${firstLabel}, connect the form to the analysis focus and exclude a language-wide conclusion.`,
        `Cite “${firstExample.form},” perform ${task.operation}, and request another record before transfer.`,
        `Treat ${firstLabel} as the observation; justify the inference and reject one overclaim.`,
        `Read “${firstExample.form}” with its gloss, apply the stated lens, and preserve the record boundary.`,
        `Ground the response in ${firstLabel}; distinguish the supported pattern from an unobserved extension.`,
        `Use ${firstLabel} to complete ${task.operation}; name the additional evidence needed next.`,
      ];
      const scoringTails = [
        'identify the record; name the limit.',
        'select the method; cite the decisive form.',
        'connect evidence to claim; bound transfer.',
        'apply the lens; reject one overreach.',
        'preserve form–gloss alignment; state scope.',
        'execute the operation; request missing evidence.',
        'justify the inference; separate observation from rule.',
        'use the payload accurately; stop at its boundary.',
      ];
      // Prompt, constructed answer, sample, and scoring tail are authored as
      // one cognitive-operation row. Lesson-number rotation broke that row and
      // could pair a revision prompt with an identification sample. Variation
      // belongs inside the row, not across incompatible operations.
      const slot = index % sampleFrames.length;
      return {
        ...base,
        options: undefined,
        answer,
        sampleAnswer: sampleFrames[slot],
        explanation: `Intent ${prompt.intent}; record ${firstLabel}; no unshown evidence.`,
        scoringGuidance: `Score ${firstLabel}: ${scoringTails[slot]}`,
        ...(type === 'essay' ? { rubricHints: [...task.assessmentCriteria] } : {}),
      };
    });
  }

  function applyFunctionalVisualTaskQuizBinding(
    atoms = [],
    lesson = {},
    blueprint = {},
    { machineScored = false } = {},
  ) {
    if (!lessonRequiresFunctionalVisual(blueprint?.briefQualityContract, lesson?.lessonNumber) || atoms.length === 0) {
      return atoms;
    }

    const concept = safeLessonPrimaryConcept(lesson);
    const secondary = safeLessonConcepts(lesson, { limit: 3 })[1] || 'supporting evidence';
    const profile = typedEvidenceSpecimenProfile(concept, secondary);
    const lessonNumber = Number(lesson?.lessonNumber);
    const bindingSuffix = String(lessonNumber).padStart(2, '0');
    const sourceId = `CM-SRC-L${bindingSuffix}`;
    const productId = `CM-PROD-L${bindingSuffix}`;
    const sourceDisplay = `Lesson ${lessonNumber} evidence specimen`;
    const productDisplay = `Lesson ${lessonNumber} application artifact`;
    const sourceLabel = `course-created ${concept} specimen`;
    const { correctFrames, distractorSets, promptFrames, responseInstructionFrames, scoringGuidance } =
      createTypedVisualQuizFrames({
        concept,
        sourceId: sourceDisplay,
        productId: productDisplay,
        sourceLabel,
        profile,
        lesson,
        lessonVariant,
      });
    const mcSlots = new Set(machineScored ? atoms.map((_, index) => index) : [0, 1, 4, 6]);

    return atoms.map((atom, index) => {
      const lessonOffset = Math.max(0, Number(lesson?.lessonNumber || lesson?.number || 1) - 1);
      const type = mcSlots.has(index) ? 'multiple_choice' : index >= 5 ? 'essay' : 'short_answer';
      const bloomsLevel = index < 2 ? 'Analyze' : index < 5 ? 'Apply' : 'Evaluate';
      const correct = correctFrames[(index + lessonOffset) % correctFrames.length];
      const base = {
        ...atom,
        type,
        bloomsLevel,
        difficulty: index < 2 ? 'Medium' : index < 5 ? 'Medium' : 'Hard',
        estimatedMinutes: type === 'essay' ? 15 : type === 'short_answer' ? 7 : 3,
        points: type === 'essay' ? Math.max(8, Number(atom?.points) || 0) : Math.max(4, Number(atom?.points) || 0),
        question: promptFrames[(index + lessonOffset) % promptFrames.length],
        intendedUse:
          type === 'multiple_choice'
            ? `Machine-scored ${concept} decision using the ${profile.specimenKind} evidence in the ${sourceDisplay}.`
            : `Instructor-scored ${concept} reasoning that names a typed entity and relation from the ${sourceDisplay}.`,
        enrichmentSource: 'brief-functional-visual-contract-v1',
        projectionKind: 'typed-functional-visual-evidence',
        sourceReviewRequired: false,
        functionalVisualEvidenceBinding: {
          protocol: TYPED_EVIDENCE_SPECIMEN_PROTOCOL,
          sourceId,
          sourceLabel,
          resolution: 'native-evidence-specimen',
          productId,
          specimenKind: profile.specimenKind,
          entityIds: profile.entities.map((entity) => entity.id),
          relationIds: profile.relations.map((relation) => relation.id),
          expectedObservation: profile.expectedObservation,
        },
        tags: quizTags(lesson, type, bloomsLevel, 'typed functional-visual evidence'),
      };
      if (type === 'multiple_choice') {
        const answer = correctLetterForQuestion(lesson, index);
        const distractors = distractorSets[(index + lessonOffset) % distractorSets.length];
        let distractorIndex = 0;
        return {
          ...base,
          options: QUIZ_ANSWER_LETTERS.map((letter) =>
            labelQuizOption(letter, letter === answer ? correct : distractors[distractorIndex++ % distractors.length]),
          ),
          answer,
          sampleAnswer: undefined,
          explanation: `Evidence basis: ${correct}`,
          scoringGuidance: undefined,
          rubricHints: undefined,
        };
      }
      const responseInstruction = responseInstructionFrames[(index + lessonOffset) % responseInstructionFrames.length];
      const answer = `${correct} ${responseInstruction}`;
      return {
        ...base,
        options: undefined,
        answer,
        sampleAnswer: answer,
        explanation: `Evidence basis: ${correct}`,
        scoringGuidance,
        ...(type === 'essay' ? { rubricHints: [scoringGuidance] } : {}),
      };
    });
  }

  function numericArrayFromWorkedExample(example = {}, labelPattern) {
    const matcher = labelPattern instanceof RegExp ? labelPattern : new RegExp(String(labelPattern), 'i');
    for (const raw of asArray(example.inputs)) {
      const input = cleanText(raw);
      if (!matcher.test(input)) continue;
      const bracket = input.match(/\[([^\]]+)\]/);
      if (!bracket) continue;
      const values = bracket[1]
        .split(',')
        .map((value) => Number(value.trim()))
        .filter(Number.isFinite);
      if (values.length >= 2) return values;
    }
    return [];
  }

  function scalarFromWorkedExample(example = {}, labelPattern) {
    const matcher = labelPattern instanceof RegExp ? labelPattern : new RegExp(String(labelPattern), 'i');
    for (const raw of [...asArray(example.inputs), example.result]) {
      const input = cleanText(raw);
      if (!matcher.test(input)) continue;
      const value = Number(input.match(/(?:=|:)\s*([-+]?\d+(?:\.\d+)?)/)?.[1]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function workedExampleVisualDescriptor(example = {}) {
    const operation = cleanText(example.operation);
    if (!operation) {
      const pairs = extractWorkedExamplePairs(example);
      return pairs.length >= 2 ? { kind: 'bar', pairs } : null;
    }

    if (operation === 'summarize-and-interpret-distribution') {
      const values = numericArrayFromWorkedExample(example, /observations/i);
      return values.length >= 3 ? { kind: 'dotplot', values } : null;
    }
    if (operation === 'construct-and-interpret-histogram') {
      const edges = numericArrayFromWorkedExample(example, /bin edges/i);
      const counts =
        cleanText(example.result)
          .match(/\[([^\]]+)\]/)?.[1]
          ?.split(',')
          .map((value) => Number(value.trim()))
          .filter(Number.isFinite) || [];
      if (edges.length === counts.length + 1 && counts.length >= 2) {
        return {
          kind: 'histogram',
          pairs: counts.map((value, index) => ({ label: `${edges[index]}–${edges[index + 1]}`, value })),
        };
      }
      return null;
    }
    if (['fit-and-interpret-simple-linear-regression', 'calculate-and-interpret-correlation'].includes(operation)) {
      const xs = numericArrayFromWorkedExample(example, /^x\s*=/i);
      const ys = numericArrayFromWorkedExample(example, /^y\s*=/i);
      if (xs.length >= 2 && xs.length === ys.length) {
        return {
          kind: 'scatter',
          points: xs.map((x, index) => ({ x, y: ys[index] })),
          showFit: operation === 'fit-and-interpret-simple-linear-regression',
        };
      }
      return null;
    }
    if (operation === 'calculate-and-interpret-two-way-table') {
      const rows = asArray(example.inputs)
        .map((input) => cleanText(input).match(/^(Group\s+[^:]+):\s*yes\s*=\s*(\d+),\s*no\s*=\s*(\d+)/i))
        .filter(Boolean)
        .map((match) => [match[1], Number(match[2]), Number(match[3])]);
      return rows.length >= 2 ? { kind: 'contingency-table', columns: ['Group', 'Yes', 'No'], rows } : null;
    }
    if (operation === 'standardize-and-interpret-normal-observation') {
      const mean = scalarFromWorkedExample(example, /^mean\s*=/i);
      const standardDeviation = scalarFromWorkedExample(example, /^standard deviation\s*=/i);
      const observation = scalarFromWorkedExample(example, /^observation\s+x\s*=/i);
      return [mean, standardDeviation, observation].every(Number.isFinite)
        ? {
            kind: 'number-line',
            markers: [
              { label: 'mean', value: mean },
              { label: 'observation', value: observation },
            ],
            domain: [mean - 2 * standardDeviation, mean + 2 * standardDeviation],
          }
        : null;
    }
    if (operation === 'calculate-and-interpret-confidence-interval') {
      const interval = cleanText(example.result).match(/\[\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\]/);
      const center = scalarFromWorkedExample(example, /sample proportion|p-hat/i);
      return interval && Number.isFinite(center)
        ? {
            kind: 'interval',
            low: Number(interval[1]),
            center,
            high: Number(interval[2]),
            labels: ['lower', 'estimate', 'upper'],
          }
        : null;
    }
    if (operation === 'construct-and-audit-probability-sample') {
      const frame = numericArrayFromWorkedExample(example, /target population IDs|sampling frame/i);
      const selected =
        cleanText(example.result)
          .match(/Selected sample\s*=\s*\[([^\]]+)\]/i)?.[1]
          ?.split(',')
          .map((value) => Number(value.trim()))
          .filter(Number.isFinite) || [];
      return frame.length >= 4 && selected.length >= 1 ? { kind: 'sampling-frame', frame, selected } : null;
    }

    const pairs = extractWorkedExamplePairs(example);
    return pairs.length >= 2 ? { kind: 'bar', pairs } : null;
  }

  function compilerVerifiedOperationExample({
    operation,
    problem,
    inputs,
    steps,
    result,
    interpretation,
    boundary,
    transferTask,
  }) {
    return {
      protocol: OPERATION_QUALIFIED_EVIDENCE_PROTOCOL,
      authority: 'compiler-verified-calculation',
      operation,
      problem,
      inputs,
      steps,
      result,
      interpretation,
      boundary,
      transferTask,
      verification: {
        method: 'deterministic-arithmetic-fixture',
        checked: true,
        claimBoundary:
          'The numbers are an explicitly synthetic practice specimen. They demonstrate the named calculation and interpretation routine, not an empirical claim about a real population.',
      },
    };
  }

  function deterministicWorkedExampleForLesson(lesson = {}) {
    const text = [
      lesson.title,
      lesson.studentArtifact,
      ...(lesson.keyConcepts || []),
      ...(lesson.outcomes || []),
      ...(lesson.objectives || []),
      lesson.learningObjectives,
      ...(lesson.sections || []).flatMap((section) => [
        section?.topicSection,
        section?.learningGoals,
        section?.learningObjectives,
        section?.objectives,
      ]),
      lesson.activityPattern,
    ]
      .join(' ')
      .toLowerCase();
    const actionDemand = operationEvidenceDemandForLesson(lesson);
    const operationDemand = actionDemand.demanded
      ? actionDemand
      : operationEvidenceDemandForLesson(lesson, { requireAction: false });
    // Operation-qualified statistics specimens are compiler-owned synthetic
    // data, not claims about a real population. Each one exposes inputs,
    // executable steps, an output, an interpretation, and a boundary so an
    // Apply/Calculate objective cannot be satisfied by vocabulary alone.
    if (operationDemand.operation) {
      if (operationDemand.operation === 'design-and-audit-randomized-experiment') {
        return compilerVerifiedOperationExample({
          operation: 'design-and-audit-randomized-experiment',
          problem:
            'Design a synthetic randomized experiment comparing 6-hour and 12-hour daily light treatments for 24 seedlings over 14 days.',
          inputs: [
            'experimental units = seedlings 01 through 24',
            'treatments = 6 hours of light and 12 hours of light per day',
            'response = height change in centimeters from day 0 to day 14',
            'recorded shuffled IDs = [07, 19, 02, 14, 23, 05, 11, 17, 01, 21, 09, 16, 04, 22, 08, 13, 24, 06, 18, 03, 20, 10, 15, 12]',
          ],
          steps: [
            'Assign the first 12 shuffled IDs to the 6-hour treatment and the remaining 12 IDs to the 12-hour treatment.',
            'Hold container size, soil amount, watering schedule, and measurement timing constant for both groups.',
            'Measure each seedling at day 0 and day 14, then compute height change as day-14 height minus day-0 height.',
            'Compare treatment-group height changes and record attrition, protocol departures, or measurement problems before interpreting the contrast.',
          ],
          result:
            'The design contains 24 experimental units, two randomly assigned light treatments, a predeclared response, four controlled conditions, and a replayable assignment trace.',
          interpretation:
            'If the protocol is followed and differential attrition is absent, a difference in group response can support a causal claim about these light treatments for these experimental units.',
          boundary:
            'Random assignment supports causal comparison inside this synthetic experiment; it does not make the 24 seedlings a probability sample or justify generalization to every plant, setting, or light schedule.',
          transferTask:
            'Revise the design to block seedlings by initial height before random assignment, then explain what the block can reduce and what it cannot fix.',
        });
      }
      if (operationDemand.operation === 'summarize-and-interpret-distribution') {
        const lessonSeed = Math.max(1, Number(lesson?.lessonNumber) || 1);
        const fixtures = [
          {
            observations: '2, 3, 3, 4, 4, 4, 5, and 9',
            inputs: ['sorted observations = [2, 3, 3, 4, 4, 4, 5, 9]', 'n = 8'],
            steps: [
              'Mean: (2 + 3 + 3 + 4 + 4 + 4 + 5 + 9) / 8 = 4.25.',
              'Median: (4 + 4) / 2 = 4.',
              'IQR: using the median-of-halves convention, Q3 - Q1 = 4.5 - 3 = 1.5.',
              'Check the upper outlier fence: 4.5 + 1.5 x 1.5 = 6.75; the value 9 is beyond it.',
            ],
            result: 'Mean = 4.25, median = 4, IQR = 1.5, and 9 is flagged by the 1.5 x IQR rule.',
            interpretation:
              'The high value 9 pulls the mean above the median, so the median and IQR give a more resistant summary of this synthetic distribution.',
            transferTask:
              'Replace 9 with 6, recompute the mean, median, and IQR, and explain which summary changes most.',
          },
          {
            observations: '1, 2, 2, 3, 3, 4, 4, and 11',
            inputs: ['sorted observations = [1, 2, 2, 3, 3, 4, 4, 11]', 'n = 8'],
            steps: [
              'Mean: (1 + 2 + 2 + 3 + 3 + 4 + 4 + 11) / 8 = 3.75.',
              'Median: (3 + 3) / 2 = 3.',
              'IQR: using the median-of-halves convention, Q3 - Q1 = 4 - 2 = 2.',
              'Check the upper outlier fence: 4 + 1.5 x 2 = 7; the value 11 is beyond it.',
            ],
            result: 'Mean = 3.75, median = 3, IQR = 2, and 11 is flagged by the 1.5 x IQR rule.',
            interpretation:
              'The high value 11 raises the mean above the median, while the median and IQR retain the center and middle-half spread of the remaining observations.',
            transferTask:
              'Replace 11 with 5, recompute the summaries, and explain why the mean changes more than the median.',
          },
          {
            observations: '5, 6, 6, 7, 7, 8, 9, and 14',
            inputs: ['sorted observations = [5, 6, 6, 7, 7, 8, 9, 14]', 'n = 8'],
            steps: [
              'Mean: (5 + 6 + 6 + 7 + 7 + 8 + 9 + 14) / 8 = 7.75.',
              'Median: (7 + 7) / 2 = 7.',
              'IQR: using the median-of-halves convention, Q3 - Q1 = 8.5 - 6 = 2.5.',
              'Check the upper outlier fence: 8.5 + 1.5 x 2.5 = 12.25; the value 14 is beyond it.',
            ],
            result: 'Mean = 7.75, median = 7, IQR = 2.5, and 14 is flagged by the 1.5 x IQR rule.',
            interpretation:
              'The value 14 makes the distribution right-skewed enough that the mean exceeds the median; the resistant summaries remain tied to the ordered middle values.',
            transferTask: 'Replace 14 with 10, recompute all three summaries, and compare the outlier-fence decision.',
          },
        ];
        const fixture = fixtures[lessonSeed % fixtures.length];
        return compilerVerifiedOperationExample({
          operation: 'summarize-and-interpret-distribution',
          problem: `Summarize the center and spread of the synthetic observations ${fixture.observations}.`,
          inputs: fixture.inputs,
          steps: fixture.steps,
          result: fixture.result,
          interpretation: fixture.interpretation,
          boundary:
            'This trace uses the median-of-halves quartile convention. Accept a different supported software convention only when the learner names it, applies it consistently, shows the recomputed quartiles and fence, and keeps an outlier flag as a prompt for investigation rather than proof of error.',
          transferTask: fixture.transferTask,
        });
      }
      if (operationDemand.operation === 'construct-and-interpret-histogram') {
        return compilerVerifiedOperationExample({
          operation: 'construct-and-interpret-histogram',
          problem:
            'For the synthetic observations 2, 3, 3, 4, 4, 4, 5, and 6, construct a histogram using bins [2, 4), [4, 6), and [6, 8).',
          inputs: ['observations = [2, 3, 3, 4, 4, 4, 5, 6]', 'bin edges = [2, 4, 6, 8]'],
          steps: [
            'Place 2, 3, and 3 in [2, 4), giving a count of 3.',
            'Place 4, 4, 4, and 5 in [4, 6), giving a count of 4.',
            'Place 6 in [6, 8), giving a count of 1.',
            'Check the total: 3 + 4 + 1 = 8 observations.',
          ],
          result: 'Histogram bin counts are [3, 4, 1].',
          interpretation:
            'For these chosen bins, most synthetic observations fall from 4 up to 6, with one observation in the highest bin.',
          boundary:
            'Histogram appearance depends on the bin edges; this small synthetic display does not establish a population shape.',
          transferTask:
            'Re-bin the same observations with edges [2, 3, 5, 7], report the new counts, and explain which visual conclusion changes.',
        });
      }
      if (operationDemand.operation === 'fit-and-interpret-simple-linear-regression') {
        return compilerVerifiedOperationExample({
          operation: 'fit-and-interpret-simple-linear-regression',
          problem: 'For the synthetic pairs (x, y) = (1, 2), (2, 4), and (3, 5), fit the least-squares line.',
          inputs: ['x = [1, 2, 3]', 'y = [2, 4, 5]'],
          steps: [
            'Compute the means: x-bar = 2 and y-bar = 11/3.',
            'Compute Sxy = 3 and Sxx = 2.',
            'Calculate the slope b1 = Sxy/Sxx = 1.5 and intercept b0 = y-bar - b1(x-bar) = 2/3.',
            'Check the fitted values 2.17, 3.67, and 5.17 against the three observed values.',
          ],
          result: 'Fitted line: predicted y = 0.67 + 1.50x.',
          interpretation:
            'Within this synthetic three-point example, the fitted outcome increases by 1.50 units for each one-unit increase in x.',
          boundary:
            'The line describes association in this tiny synthetic dataset; it does not establish causation or justify extrapolation.',
          transferTask:
            'Repeat the same trace for (x, y) = (1, 3), (2, 3), and (3, 6), then compare the new slope and residual pattern.',
        });
      }
      if (operationDemand.operation === 'calculate-and-interpret-correlation') {
        return compilerVerifiedOperationExample({
          operation: 'calculate-and-interpret-correlation',
          problem:
            'For the synthetic pairs (x, y) = (1, 1), (2, 3), and (3, 2), calculate and interpret Pearson correlation r.',
          inputs: ['x = [1, 2, 3]', 'y = [1, 3, 2]', 'x-bar = 2', 'y-bar = 2'],
          steps: [
            'Compute the centered cross-products: (-1)(-1) + (0)(1) + (1)(0) = 1.',
            'Compute the centered square sums: Sxx = 1 + 0 + 1 = 2 and Syy = 1 + 1 + 0 = 2.',
            'Calculate r = 1 / sqrt(2 x 2) = 0.50.',
            'Check the scatterplot pattern for direction, form, and unusual points before interpreting the coefficient.',
          ],
          result: 'Pearson correlation r = 0.50.',
          interpretation:
            'These three synthetic pairs have a moderate positive linear association: larger x values tend to occur with larger y values.',
          boundary:
            'Correlation summarizes linear association; this tiny synthetic dataset does not establish causation or rule out a nonlinear pattern.',
          transferTask:
            'Replace the final point with (3, 5), recompute r, and explain how that one change affects the scatterplot and coefficient.',
        });
      }
      if (operationDemand.operation === 'calculate-and-interpret-two-way-table') {
        return compilerVerifiedOperationExample({
          operation: 'calculate-and-interpret-two-way-table',
          problem:
            'Interpret a synthetic two-way table: Group A has 18 yes and 12 no responses; Group B has 12 yes and 18 no responses.',
          inputs: ['Group A: yes = 18, no = 12', 'Group B: yes = 12, no = 18', 'row total for each group = 30'],
          steps: [
            'Calculate the conditional yes proportion for Group A: 18 / 30 = 0.60.',
            'Calculate the conditional yes proportion for Group B: 12 / 30 = 0.40.',
            'Compare the conditional proportions: 0.60 - 0.40 = 0.20, or 20 percentage points.',
            'Check the four cell counts and both row totals before interpreting the association.',
          ],
          result: 'Conditional yes proportions are 0.60 for Group A and 0.40 for Group B; difference = 0.20.',
          interpretation:
            'In this synthetic table, a yes response is 20 percentage points more common in Group A than in Group B.',
          boundary:
            'A difference in conditional proportions shows association in this table; it does not by itself identify a causal effect.',
          transferTask:
            'Add six no responses to Group A, recompute both conditional yes proportions, and explain how the comparison changes.',
        });
      }
      if (operationDemand.operation === 'calculate-and-interpret-confidence-interval') {
        return compilerVerifiedOperationExample({
          operation: 'calculate-and-interpret-confidence-interval',
          problem:
            'In a synthetic random sample of 100 responses, 58 are coded yes. Build an approximate 95% interval for the population proportion.',
          inputs: ['n = 100', 'yes = 58', 'sample proportion p-hat = 0.58', 'critical value = 1.96'],
          steps: [
            'Estimate the standard error: sqrt(0.58 x 0.42 / 100) = 0.049.',
            'Calculate the margin of error: 1.96 x 0.049 = 0.096.',
            'Compute the endpoints: 0.58 - 0.096 = 0.484 and 0.58 + 0.096 = 0.676.',
            'Check that the random-sample and large-count assumptions are reasonable before reporting the interval.',
          ],
          result: 'Approximate 95% confidence interval: [0.484, 0.676].',
          interpretation:
            'The interval is an estimate produced by a repeated-sampling procedure; it is not a 95% probability statement about this one fixed interval.',
          boundary:
            'The calculation is a synthetic classroom example and depends on the sampling and approximation assumptions.',
          transferTask:
            'Recalculate the interval when 64 of 100 synthetic responses are coded yes, and explain how the center and width change.',
        });
      }
      if (operationDemand.operation === 'standardize-and-interpret-normal-observation') {
        return compilerVerifiedOperationExample({
          operation: 'standardize-and-interpret-normal-observation',
          problem:
            'In a synthetic normal model with mean 50 and standard deviation 10, standardize the observation 65.',
          inputs: ['mean = 50', 'standard deviation = 10', 'observation x = 65'],
          steps: [
            'Compute the displacement from the mean: 65 - 50 = 15.',
            'Divide by the standard deviation: z = 15 / 10 = 1.5.',
            'Check the sign and scale: the positive value places the observation above the mean.',
          ],
          result: 'The observation has z = 1.5.',
          interpretation: 'Within this synthetic normal model, 65 is 1.5 standard deviations above the mean.',
          boundary:
            'A z-score locates an observation within the stated model; it does not prove the population is normal.',
          transferTask:
            'Repeat the standardization for x = 35, then compare the signs and distances of the two z-scores.',
        });
      }
      if (operationDemand.operation === 'construct-and-audit-probability-sample') {
        return compilerVerifiedOperationExample({
          operation: 'construct-and-audit-probability-sample',
          problem: 'Construct and audit a probability sample from a synthetic frame of 12 units labeled 01 through 12.',
          inputs: [
            'target population IDs = [01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12]',
            'complete sampling frame = the same 12 IDs',
            'pre-recorded random draw without replacement = [08, 02, 11, 05]',
          ],
          steps: [
            'Compare the target-population IDs with the frame and confirm that all 12 units appear exactly once.',
            'Apply the pre-recorded random draw without replacement and sort the selected IDs: [02, 05, 08, 11].',
            'Check that the four selected IDs are unique and each belongs to the declared frame.',
            'Record the selection probability for every framed unit as 4/12 = 1/3 under this simple-random-sample design.',
          ],
          result: 'Selected sample = [02, 05, 08, 11]; frame coverage = 12/12; per-unit selection probability = 1/3.',
          interpretation:
            'The recorded procedure gives every framed unit the same selection probability and leaves an inspectable selection trace.',
          boundary:
            'Equal selection within a complete synthetic frame does not eliminate nonresponse, measurement error, or undercoverage outside that frame.',
          transferTask:
            'Audit a second frame that omits ID 12: identify the coverage defect, explain whose selection probability becomes zero, and propose one repair before drawing a sample.',
        });
      }
      if (operationDemand.operation !== 'calculate-and-interpret-one-proportion-test') return null;
      const lessonNumber = Number(lesson?.lessonNumber);
      const lessonBoundaryPrefix = Number.isInteger(lessonNumber) ? `Lesson ${lessonNumber}: ` : '';
      return compilerVerifiedOperationExample({
        operation: 'calculate-and-interpret-one-proportion-test',
        problem:
          'A synthetic sample has n = 100 and 58 successes. Test the null proportion p0 = 0.50 with a two-sided z test.',
        inputs: ['n = 100', 'successes = 58', 'p-hat = 0.58', 'null proportion p0 = 0.50'],
        steps: [
          'Compute the null standard error: sqrt(0.50 x 0.50 / 100) = 0.05.',
          'Calculate z = (0.58 - 0.50) / 0.05 = 1.60.',
          'Use the standard normal distribution to obtain the two-sided p-value, approximately 0.110.',
          'Compare the p-value with the predeclared decision threshold and report the effect estimate p-hat - p0 = 0.08.',
        ],
        result: 'z = 1.60; two-sided p-value is approximately 0.110; observed difference is 0.08.',
        interpretation:
          'At a 0.05 threshold, this synthetic result does not provide enough evidence to reject p = 0.50.',
        boundary: `${lessonBoundaryPrefix}p-values condition on H0; they do not measure practical importance.`,
        transferTask:
          'Repeat the trace for 62 successes out of 100, then compare the z statistic, p-value, and effect estimate.',
      });
    }
    // Words such as "vector", "projection", "dimension", and "basis" are
    // heavily overloaded across astronomy, design, geography, information
    // literacy, and the social sciences. A lone "Earth's Rotation Vector" or
    // "synthesis matrix" must never summon an algebra worksheet. Admit the
    // fallback only for an unmistakable linear-algebra identity, or when an
    // ambiguous term has explicit mathematical context.
    if (
      !LINEAR_ALGEBRA_STRONG_WORKED_EXAMPLE_RE.test(text) &&
      !(LINEAR_ALGEBRA_AMBIGUOUS_WORKED_EXAMPLE_RE.test(text) && LINEAR_ALGEBRA_CONTEXT_RE.test(text))
    ) {
      return null;
    }

    if (/\beigen|eigenvalue|eigenvector/.test(text)) {
      return {
        problem: 'Find the eigenvalues of A = [[2, 0], [0, 3]].',
        steps: ['Set det(A - lambda I) = (2 - lambda)(3 - lambda) = 0.', 'lambda1 = 2.', 'lambda2 = 3.'],
        result: 'Eigenvalues: 2 and 3.',
      };
    }
    if (/\bbasis|dimension|span|linear independence|rank/.test(text)) {
      return {
        problem: 'Decide the dimension of span{(1, 0, 0), (0, 1, 0)} in R3.',
        steps: ['Pivot count: p = 2.', 'Free variables: f = 1.', 'Dimension: d = 2.'],
        result: 'The span is a 2-dimensional plane in R3.',
      };
    }
    if (/\bdeterminant/.test(text)) {
      return {
        problem: 'Compute det([[3, 2], [4, 5]]).',
        steps: ['Diagonal product: a = 15.', 'Off-diagonal product: b = 8.', 'Determinant: d = 7.'],
        result: 'The determinant is 7.',
      };
    }
    if (/\borthogonal|projection|least squares/.test(text)) {
      return {
        problem: 'Project v = (2, 1) onto u = (3, 0).',
        steps: ['Dot product: p = 6.', 'Norm squared: n = 9.', 'Coefficient: c = 0.67.'],
        result: 'The projection is approximately (2, 0).',
      };
    }
    if (/\bsvd|singular value/.test(text)) {
      return {
        problem: 'Interpret a 2 x 2 matrix with singular values 5 and 2.',
        steps: ['Largest stretch: sigma1 = 5.', 'Second stretch: sigma2 = 2.', 'Condition ratio: k = 2.5.'],
        result: 'The matrix stretches one orthogonal direction 2.5 times more than the other.',
      };
    }
    if (/\bmatrix|matrices/.test(text)) {
      return {
        problem: 'Identify the shape of A = [[1, 2, 3], [4, 5, 6]].',
        steps: ['Rows: r = 2.', 'Columns: c = 3.', 'Entries: n = 6.'],
        result: 'A is a 2 by 3 matrix with 6 entries.',
      };
    }
    return {
      problem: 'Solve the system x + y = 3 and x - y = 1.',
      steps: ['Add the equations: 2x = 4.', 'Solve: x = 2.', 'Substitute: y = 1.'],
      result: 'The solution is (2, 1).',
    };
  }

  function operationQualifiedWorkedExampleForLesson(lesson = {}) {
    const demand = operationEvidenceDemandForLesson(lesson);
    const inferred = operationEvidenceDemandForLesson(lesson, { requireAction: false });
    const authored = lesson?.enrichment?.workedExample;
    const authoredIsComplete =
      authored &&
      cleanText(authored.problem) &&
      Array.isArray(authored.steps) &&
      authored.steps.filter((step) => cleanText(step)).length >= 2 &&
      cleanText(authored.result);
    const authoredMatchesDemand =
      !demand.demanded ||
      (authored?.protocol === OPERATION_QUALIFIED_EVIDENCE_PROTOCOL && authored?.operation === demand.operation);
    const example =
      (authoredIsComplete && authoredMatchesDemand ? authored : deterministicWorkedExampleForLesson(lesson)) || null;
    if (!example || example?.protocol !== OPERATION_QUALIFIED_EVIDENCE_PROTOCOL) return example;
    const governingOperation = demand.operation || inferred.operation;
    if (!governingOperation || example.operation !== governingOperation) return null;
    const operationLabel = governingOperation.replace(/-/g, ' ');
    const governingLocator =
      (lesson.sourceEvidenceTrace?.sourceFields || []).find((field) => field?.field === 'topic and concepts')
        ?.rawText ||
      (lesson.sourceAnchors || []).find((anchor) => anchor?.field === 'topics')?.anchor ||
      lesson.title;
    return {
      ...example,
      studentTask: `Required operation: ${operationLabel.charAt(0).toUpperCase()}${operationLabel.slice(1)}.`,
      truthProof: example.verification || null,
      curriculumAdmission: {
        protocol: 'coursemapper-compiled-operation-curriculum-admission-v1',
        status: 'admitted',
        operation: example.operation,
        lessonNumber: lesson.lessonNumber,
        governingCurriculumNode: lesson.id || `lesson-${lesson.lessonNumber}`,
        governingSourceLocator: cleanText(governingLocator),
        prerequisiteEvidence:
          lesson.prerequisitePlan?.prerequisiteEvidence ||
          lesson.prerequisitePlan?.diagnosticCheck ||
          'No additional compiler-introduced prerequisite was declared for this bounded synthetic operation.',
        permittedLessonBoundary: stripLessonPrefix(lesson.title || ''),
        demandSource: demand.demanded ? demand.source : inferred.source,
        demandSurface: cleanText(demand.matchedSurface || inferred.matchedSurface),
      },
    };
  }

  function typedEvidenceSpecimenProfileForKind(specimenKind) {
    const entity = (id, label, role, shape, x, y, w, h, tone = 'primary') => ({
      id,
      label,
      role,
      shape,
      geometry: { x, y, w, h },
      tone,
    });
    const relation = (id, type, from, to, visibleStatement) => ({ id, type, from, to, visibleStatement });

    if (specimenKind === 'frame-perspective-comparison') {
      return {
        specimenKind: 'frame-perspective-comparison',
        specimenIR: {
          protocol: 'coursemapper-disciplinary-specimen-ir-v1',
          discipline: 'visual-analysis',
          objectType: 'matched architectural-viewpoint study',
          observableOperation: 'compare crop, convergence, subject scale, and retained setting evidence',
          domainObjectIds: ['horizon-wide', 'vanishing-point', 'subject-wide', 'subject-tight', 'foreground-wide'],
          contrastState:
            'the subject identity stays fixed while viewpoint and crop change the visible spatial evidence',
          counterexampleQuestion:
            'Would the interpretation survive if the convergence guides or surrounding setting were removed?',
        },
        entities: [
          entity('frame-wide', 'Street · wide', 'comparison-frame', 'frame', 3, 8, 44, 76, 'secondary'),
          entity('frame-tight', 'Street · tight', 'comparison-frame', 'frame', 54, 15, 41, 62, 'primary'),
          entity('horizon-wide', 'HORIZON', 'architectural-horizon', 'rect', 7, 35, 36, 3, 'muted'),
          entity('foreground-wide', 'ROAD', 'foreground-plane', 'rect', 7, 65, 36, 12, 'secondary'),
          entity('vanishing-point', 'VP', 'convergence-anchor', 'ellipse', 41, 31, 7, 12, 'accent'),
          entity('subject-wide', 'PERSON', 'shared-subject-instance', 'rect', 18, 45, 14, 20, 'primary'),
          entity('subject-tight', 'PERSON', 'shared-subject-instance', 'rect', 64, 35, 14, 20, 'primary'),
        ],
        relations: [
          relation(
            'wide-converges',
            'converges-on',
            'frame-wide',
            'vanishing-point',
            'Wide-frame guides converge on V.',
          ),
          relation(
            'tight-reframes',
            'reframes',
            'frame-tight',
            'subject-tight',
            'The tight frame changes what surrounds S.',
          ),
          relation(
            'same-subject',
            'same-subject',
            'subject-wide',
            'subject-tight',
            'The same S subject appears in both frames.',
          ),
        ],
        expectedObservation:
          'The matched street views preserve the PERSON subject while the wide view exposes a horizon, road plane, and convergence toward VP; the tight crop removes setting evidence and therefore narrows which spatial claims the viewer can inspect.',
      };
    }
    if (specimenKind === 'context-boundary-comparison') {
      return {
        specimenKind: 'context-boundary-comparison',
        specimenIR: {
          protocol: 'coursemapper-disciplinary-specimen-ir-v1',
          discipline: 'visual-analysis',
          objectType: 'matched editorial-event scene',
          observableOperation: 'hold the depicted event constant while comparing caption and provenance conditions',
          domainObjectIds: ['speaker-a', 'lectern-a', 'audience-a', 'speaker-b', 'lectern-b', 'audience-b'],
          contrastState:
            'the same speaker-at-lectern scene appears with withheld versus supplied source, date, and purpose',
          counterexampleQuestion:
            'Which interpretation becomes indefensible when the caption and provenance record are withheld?',
        },
        entities: [
          entity('image-a', 'EVENT A', 'image-without-context', 'rect', 4, 8, 42, 54, 'secondary'),
          entity('image-b', 'EVENT B', 'same-image-with-context', 'rect', 54, 8, 42, 54, 'primary'),
          entity('image-token-a', 'SAME EVENT', 'shared-event-identity', 'label', 11, 12, 27, 8, 'muted'),
          entity('image-token-b', 'SAME EVENT', 'shared-event-identity', 'label', 61, 12, 27, 8, 'muted'),
          entity('speaker-a', 'SPEAKER', 'depicted-person', 'ellipse', 17, 23, 16, 15, 'accent'),
          entity('speaker-b', 'SPEAKER', 'depicted-person', 'ellipse', 67, 23, 16, 15, 'accent'),
          entity('lectern-a', 'LECTERN', 'event-object', 'rect', 17, 39, 16, 14, 'primary'),
          entity('lectern-b', 'LECTERN', 'event-object', 'rect', 67, 39, 16, 14, 'primary'),
          entity('audience-a', 'AUDIENCE', 'event-context', 'rect', 7, 52, 35, 7, 'secondary'),
          entity('audience-b', 'AUDIENCE', 'event-context', 'rect', 57, 52, 35, 7, 'secondary'),
          entity('context-card', 'SOURCE · DATE · PURPOSE', 'context-record', 'label', 54, 68, 44, 18, 'accent'),
          entity('missing-card', 'CONTEXT WITHHELD', 'missing-context-record', 'label', 2, 68, 44, 18, 'muted'),
        ],
        relations: [
          relation(
            'same-subject',
            'same-subject',
            'image-token-a',
            'image-token-b',
            'The same speaker, lectern, and audience event appears in A and B.',
          ),
          relation('same-speaker', 'same-subject', 'speaker-a', 'speaker-b', 'The depicted speaker is held constant.'),
          relation('same-lectern', 'same-object', 'lectern-a', 'lectern-b', 'The lectern is held constant.'),
          relation(
            'context-changes-boundary',
            'changes-claim-boundary',
            'context-card',
            'image-b',
            'B exposes context that A withholds.',
          ),
        ],
        expectedObservation:
          'The speaker-at-lectern event is visibly held constant while source, date, and purpose metadata change; the scene alone shows a public address but cannot establish who is speaking, when it occurred, or why it was recorded.',
      };
    }
    if (specimenKind === 'contrast-encoding-comparison') {
      return {
        specimenKind: 'contrast-encoding-comparison',
        entities: [
          entity('field-high', 'HIGH', 'high-contrast-field', 'rect', 4, 10, 42, 76, 'primary'),
          entity('mark-high', 'A', 'high-contrast-mark', 'ellipse', 17, 32, 16, 27, 'accent'),
          entity('field-low', 'LOW', 'low-contrast-field', 'rect', 54, 10, 42, 76, 'muted'),
          entity('mark-low', 'A', 'low-contrast-mark', 'ellipse', 67, 32, 16, 27, 'accent'),
        ],
        relations: [
          relation(
            'high-separation',
            'tonal-separation',
            'mark-high',
            'field-high',
            'A separates strongly from the HIGH field.',
          ),
          relation(
            'low-separation',
            'tonal-separation',
            'mark-low',
            'field-low',
            'A separates weakly from the LOW field.',
          ),
        ],
        expectedObservation:
          'The identical A mark is easier to distinguish in the high-separation field than in the low-separation field; the comparison remains legible without relying on hue names.',
      };
    }
    if (specimenKind === 'hierarchy-ranking') {
      return {
        specimenKind: 'hierarchy-ranking',
        entities: [
          entity('rank-1', '1 · PRIMARY', 'first-attention', 'rect', 6, 10, 70, 23, 'primary'),
          entity('rank-2', '2 · SECONDARY', 'second-attention', 'rect', 6, 42, 52, 17, 'secondary'),
          entity('rank-3', '3 · TERTIARY', 'third-attention', 'rect', 6, 68, 34, 12, 'accent'),
          entity('attention-anchor', 'EYE', 'attention-anchor', 'ellipse', 81, 12, 14, 24, 'accent'),
        ],
        relations: [
          relation('rank-order-1-2', 'precedes', 'rank-1', 'rank-2', 'PRIMARY precedes SECONDARY.'),
          relation('rank-order-2-3', 'precedes', 'rank-2', 'rank-3', 'SECONDARY precedes TERTIARY.'),
        ],
        expectedObservation:
          'Scale, weight, and placement establish a visible 1–2–3 attention order; the claim can be tested by naming which element attracts attention first and why.',
      };
    }
    if (specimenKind === 'spatial-composition') {
      return {
        specimenKind: 'spatial-composition',
        entities: [
          // These IDs are the public visual-task contract selectors. The
          // exporter may draw a house, tree, and sun as composite native
          // shapes, but the measurable semantic boxes must retain the same
          // IDs used by predicates and counterexamples.
          entity('primary-mass', 'HOUSE', 'concrete-subject', 'rect', 10, 53, 31, 28, 'primary'),
          entity('secondary-mass', 'TREE', 'counterweight-subject', 'rect', 48, 38, 18, 44, 'secondary'),
          entity('focal-anchor', 'SUN', 'focal-point', 'ellipse', 78, 10, 13, 22, 'accent'),
          entity('thirds-frame', 'THIRDS', 'alignment-frame', 'frame', 2, 5, 96, 84, 'muted'),
        ],
        relations: [
          relation(
            'eye-path',
            'directs-attention-to',
            'primary-mass',
            'focal-anchor',
            'The roof line directs attention from the house toward the sun.',
          ),
          relation(
            'counter-balance',
            'counterbalances',
            'secondary-mass',
            'primary-mass',
            'The tree counterbalances the house across the lower thirds.',
          ),
        ],
        expectedObservation:
          'The house sits near the lower-left thirds intersection, the sun sits near the upper-right intersection, and the tree supplies a smaller counterweight along the horizon.',
      };
    }
    return {
      specimenKind: 'evidence-relationship',
      entities: [
        entity('evidence-a', 'EVIDENCE A', 'primary-evidence', 'rect', 5, 18, 38, 24, 'primary'),
        entity('evidence-b', 'EVIDENCE B', 'comparison-evidence', 'rect', 5, 58, 28, 16, 'secondary'),
        entity('claim-anchor', 'CLAIM', 'claim', 'ellipse', 70, 27, 22, 36, 'accent'),
      ],
      relations: [
        relation('a-supports-claim', 'supports', 'evidence-a', 'claim-anchor', 'Evidence A supports the claim.'),
        relation(
          'b-qualifies-claim',
          'qualifies',
          'evidence-b',
          'claim-anchor',
          'Evidence B narrows the claim boundary.',
        ),
      ],
      expectedObservation:
        'The larger evidence block supplies the primary support while the smaller comparison block qualifies the claim; both are needed before interpretation.',
    };
  }

  function typedEvidenceSpecimenProfile(concept, secondary) {
    return typedEvidenceSpecimenProfileForKind(functionalVisualConstructFamily(concept, secondary));
  }

  function buildTypedEvidenceSpecimenContract({
    lesson,
    concept,
    secondary,
    artifact,
    successCriterion,
    productActions,
    provenance,
    rightsMode,
    rightsAssetClass = 'original-native-owner-controlled',
    rightsAttribution = '',
  }) {
    const lessonNumber = Number(lesson?.lessonNumber);
    const bindingSuffix = String(lessonNumber).padStart(2, '0');
    const declaredObjectives = unique([
      ...asArray(lesson?.learningObjectives),
      ...asArray(lesson?.objectives),
      // Normalized blueprint lessons publish their canonical learning
      // objectives as `outcomes`. Keep the visual task contract bound to the
      // same objective surface exported into the package manifest instead of
      // silently falling back to a synthesized objective.
      ...asArray(lesson?.outcomes),
    ]);
    const lessonObjectives =
      declaredObjectives.length > 0 ? declaredObjectives : [stableLessonContractObjective(lesson)];
    const taskContract = buildFunctionalVisualTaskContract({
      lessonNumber,
      lessonTitle: lesson?.title,
      objectives: lessonObjectives,
      concept,
      secondary,
      productActions: unique(['analyze', ...productActions]),
      learnerArtifact: artifact,
      successCriterion,
    });
    const profile = typedEvidenceSpecimenProfileForKind(taskContract.constructFamily);
    return {
      protocol: TYPED_EVIDENCE_SPECIMEN_PROTOCOL,
      lessonNumber,
      conceptBinding: stripTerminalPunctuation(cleanText(concept)) || safeLessonPrimaryConcept(lesson),
      specimenKind: profile.specimenKind,
      specimenIR: {
        ...(profile.specimenIR || {
          protocol: 'coursemapper-disciplinary-specimen-ir-v1',
          discipline: 'visual-analysis',
          objectType: profile.specimenKind,
          observableOperation: 'inspect named domain objects and test the declared relationship',
          domainObjectIds: profile.entities.map((item) => item.id),
          contrastState: profile.expectedObservation,
          counterexampleQuestion: 'Which declared relationship would fail under the counterexample state?',
        }),
        lessonObjective: lessonObjectives[0],
        learnerArtifact: artifact,
        scoredCriterion: successCriterion,
      },
      taskContract,
      taskContractSha256: taskContract.contractSha256,
      entities: profile.entities,
      relations: profile.relations,
      expectedObservation: {
        id: `expected-l${lessonNumber}`,
        claim: profile.expectedObservation,
        evidenceIds: unique([...profile.entities.map((item) => item.id), ...profile.relations.map((item) => item.id)]),
      },
      learnerProduct: {
        id: `CM-PROD-L${bindingSuffix}`,
        actions: unique(['analyze', ...productActions]),
        artifact,
        criterion: successCriterion,
      },
      answerRubricBinding: {
        expectedObservationId: `expected-l${lessonNumber}`,
        scoringUse: lessonVariant(lesson, [
          `Credit the ${profile.specimenKind} response when it locates ${profile.entities[0]?.label || 'a named entity'} and uses the declared ${profile.relations[0]?.type || 'evidence'} relation to support a bounded interpretation.`,
          `In the ${profile.specimenKind}, require the learner to trace the ${profile.relations[0]?.type || 'evidence'} relation from ${profile.entities[0]?.label || 'one named entity'} before drawing the conclusion.`,
          `Score the ${profile.specimenKind} observation by checking that ${profile.entities[0]?.label || 'a named entity'} is identified, the ${profile.relations[0]?.type || 'evidence'} relation is applied, and inference follows evidence.`,
          `For the ${profile.specimenKind}, reject an interpretation that omits ${profile.entities[0]?.label || 'the named entity'} or bypasses the declared ${profile.relations[0]?.type || 'evidence'} relation.`,
          `The ${profile.specimenKind} earns evidence credit only when the response connects ${profile.entities[0]?.label || 'a named entity'} through the ${profile.relations[0]?.type || 'evidence'} relation and respects the stated boundary.`,
        ]),
      },
      sourceBinding: {
        id: `CM-SRC-L${bindingSuffix}`,
        label: `${rightsAssetClass === 'public-domain' ? 'Public-domain ' : 'Original '}course-created ${stripTerminalPunctuation(cleanText(concept)) || 'visual evidence'} specimen`,
        resolution: 'native-evidence-specimen',
        verificationRule:
          'Inspect the typed entities, declared relations, expected observation, and rights binding embedded in this package before interpretation.',
      },
      rightsBinding: {
        mode: rightsMode,
        assetRightsClass: rightsAssetClass,
        disclosure: provenance,
        ...(rightsAttribution ? { attribution: rightsAttribution } : {}),
      },
    };
  }

  function applyBriefFunctionalVisualSlide(slides, blueprint, lesson, context = {}) {
    const contract = blueprint?.briefQualityContract;
    if (!Array.isArray(slides) || !lessonRequiresFunctionalVisual(contract, lesson?.lessonNumber)) return;
    const concept = stripTerminalPunctuation(cleanText(context.concept)) || safeLessonPrimaryConcept(lesson);
    const secondary = stripTerminalPunctuation(cleanText(context.secondary)) || 'supporting evidence';
    const artifact = stripTerminalPunctuation(cleanText(context.artifact)) || safeLessonArtifact(lesson);
    const successCriterion =
      stripTerminalPunctuation(cleanText(context.successCriterion)) || 'evidence-backed reasoning';
    const productActions = asArray(contract?.functionalVisual?.productActions);
    const productMove =
      productActions.includes('annotate') && productActions.includes('compare')
        ? 'annotate one visible feature or compare two visual paths'
        : productActions.includes('compare')
          ? 'compare two paths'
          : 'annotate one relationship';
    const strictOpenNative =
      contract?.rightsBoundary?.mode === 'open-or-public-domain' &&
      contract?.rightsBoundary?.originalNativeAllowed === false;
    const rightsAttribution = strictOpenNative
      ? 'CourseMapper-generated native vector, CC0 1.0 Universal public-domain dedication.'
      : '';
    const lessonProvenance = strictOpenNative
      ? lessonVariant(lesson, [
          `Original course-created ${concept} vector dedicated to the public domain under CC0 1.0 Universal for ${artifact}; no external image asset is included. Credit: CourseMapper.`,
          `${artifact} uses an original course-created ${concept} diagram released under the CC0 1.0 Universal public-domain dedication, not an outside image. Credit: CourseMapper.`,
          `This ${concept} evidence is an original course-created vector dedicated to the public domain under CC0 1.0 Universal for ${artifact}. Credit: CourseMapper.`,
          `Public-domain visual for ${artifact}: the original course-created ${concept} diagram is supplied under CC0 1.0 Universal and contains no external image file.`,
          `The ${concept} specimen is an original course-created asset dedicated to the public domain under CC0 1.0 Universal for ${artifact}. Credit: CourseMapper.`,
        ])
      : lessonVariant(lesson, [
          `Original course-created ${concept} vector; no external image asset for ${artifact}. The course owner sets downstream reuse terms.`,
          `${artifact} uses an original course-created ${concept} diagram rather than an outside image; reuse remains under the course owner's control.`,
          `This ${concept} evidence is a course-created vector made for ${artifact}. No third-party image asset or external reuse permission is represented.`,
          `Original-native visual for ${artifact}: the ${concept} diagram contains no external image file, and the course owner determines later reuse.`,
          `The ${concept} specimen is an original course-created asset for ${artifact}; downstream licensing is a separate course-owner decision.`,
        ]);
    const typedSpecimen = buildTypedEvidenceSpecimenContract({
      lesson,
      concept,
      secondary,
      artifact,
      successCriterion,
      productActions,
      provenance: lessonProvenance,
      rightsMode: contract?.rightsBoundary?.mode || 'attributed-or-original-native',
      rightsAssetClass: strictOpenNative ? 'public-domain' : 'original-native-owner-controlled',
      rightsAttribution,
    });
    const sourceDisplay = `Lesson ${Number(lesson.lessonNumber)} evidence specimen`;
    const productDisplay = `Lesson ${Number(lesson.lessonNumber)} application artifact`;
    const visibleProvenance = lessonProvenance;
    const visibleTaskSummary = strictOpenNative
      ? lessonVariant(lesson, [
          `Visual provenance for ${concept}: course-created public-domain vector under CC0 1.0 Universal with no external image asset for ${artifact}. Analyze the specimen by ${productMove.replace(/visible feature/g, `${concept} feature`).replace(/visual paths/g, `${concept} paths`)}; verify the observation against the ${sourceDisplay}.`,
          `The ${sourceDisplay} is a course-created ${concept} vector dedicated under CC0 1.0 Universal, not an external image. Locate and trace the encoded relation, then decide which bounded observation can inform ${artifact}.`,
          `Use the CC0 course-created ${concept} specimen as inspectable evidence for ${artifact}. Inventory the entities, explain the declared relation, and reject any conclusion the encoding cannot support.`,
          `The ${concept} visual is a public-domain course-created diagram with no third-party image asset. Compare its encoded view or condition, qualify the inference, and defend one decision in ${artifact}.`,
          `Publication boundary: the ${sourceDisplay} is a CC0 1.0 Universal course-created ${concept} vector. Audit its entity-relation path, state the evidence limit, and carry only the warranted claim into ${artifact}.`,
        ])
      : lessonVariant(lesson, [
          `Visual provenance for ${concept}: original course-created vector with no external image asset for ${artifact}. Analyze the specimen by ${productMove.replace(/visible feature/g, `${concept} feature`).replace(/visual paths/g, `${concept} paths`)}; verify the observation against the ${sourceDisplay} before using it in the artifact.`,
          `The ${sourceDisplay} is an original native ${concept} vector, not an external image. Locate and trace the encoded relation, then decide which bounded observation can inform ${artifact}.`,
          `Use the course-created ${concept} specimen as inspectable evidence for ${artifact}. Inventory the entities, explain the declared relation, and reject any conclusion the encoding cannot support.`,
          `The ${concept} visual is an original native diagram with no third-party image asset. Compare its encoded view or condition, qualify the inference, and defend one decision in ${artifact}.`,
          `Publication boundary: the ${sourceDisplay} is a course-created ${concept} vector. Audit its entity-relation path, state the evidence limit, and carry only the warranted claim into ${artifact}.`,
        ]);
    const authoredBullets = [
      visibleTaskSummary,
      `Study the ${concept} native specimen, then ${productMove.replace(/visible feature/g, `${concept} feature`).replace(/visual paths/g, `${concept} paths`)}; mark the exact ${concept} feature that supports the observation.`,
      `For ${concept}, separate observation from interpretation: describe what the ${concept} specimen shows before explaining how it changes ${artifact}.`,
      `Test the interpretation against the ${sourceDisplay}; record one supported decision and one limit using this criterion: ${successCriterion}.`,
      `Rights boundary for ${concept}: ${visibleProvenance}`,
    ];
    const observationPrompt = lessonVariant(
      lesson,
      [
        [
          `ANALYZE · Identify the strongest ${concept} feature before interpreting it.`,
          `ACTION · ${productMove.replace(/visible feature/g, `${concept} feature`).replace(/visual paths/g, `${concept} paths`)} and name the evidence.`,
          `TEST · Use the typed entities and relations in the ${sourceDisplay}.`,
          `PRODUCT · Carry the supported observation into the ${productDisplay}: ${artifact}.`,
        ],
        [
          `ANALYZE · Locate the named ${concept} entity in the ${sourceDisplay}.`,
          `TRACE · Follow its declared relation before forming an interpretation.`,
          `CHALLENGE · Identify one claim the visible evidence cannot support.`,
          `TRANSFER · Apply the bounded result to the ${productDisplay}: ${artifact}.`,
        ],
        [
          `ANALYZE · Inventory the observable ${concept} entities and their relations.`,
          `CONNECT · Explain which relation warrants the proposed conclusion.`,
          `VERIFY · Check the reasoning against the ${sourceDisplay}.`,
          `REVISE · Use the result to improve the ${productDisplay}: ${artifact}.`,
        ],
        [
          `ANALYZE · Frame the ${concept} view or condition encoded in the ${sourceDisplay}.`,
          `COMPARE · ${productMove.replace(/visible feature/g, `${concept} feature`).replace(/visual paths/g, `${concept} paths`)}.`,
          `QUALIFY · State what a different view could change.`,
          `DECIDE · Defend one choice in the ${productDisplay}: ${artifact}.`,
        ],
        [
          `ANALYZE · Audit the visible ${concept} record against contextual interpretation.`,
          `WARRANT · Name the entity-relation path supporting the conclusion.`,
          `BOUND · Stop where the ${sourceDisplay} stops supplying evidence.`,
          `PUBLISH · Carry only the warranted claim into the ${productDisplay}: ${artifact}.`,
        ],
      ].map((lines) => lines.join('\n')),
    ).concat(`\nSUCCESS · ${stripTerminalPunctuation(successCriterion)}.\nRIGHTS · ${visibleProvenance}`);
    // Bind authored learner-facing language separately from the geometry
    // contract. Exporters may reflow it, but may not replace it with a generic
    // template: post-export auditing verifies these hashes and visible PPTX
    // text together.
    typedSpecimen.visibleTask = {
      protocol: 'coursemapper-visible-functional-task-v1',
      cardText: observationPrompt,
      cardTextSha256: sha256HexSync(observationPrompt),
      authoredSummary: visibleTaskSummary,
      authoredSummarySha256: sha256HexSync(visibleTaskSummary),
      authoredBullets,
      authoredBulletsSha256: sha256HexSync(JSON.stringify(authoredBullets)),
      provenanceLabel: 'VISUAL PROVENANCE · ORIGINAL NATIVE · NO EXTERNAL IMAGE ASSET',
      conceptBinding: typedSpecimen.conceptBinding,
      processAction: 'analyze',
      productActions: [...typedSpecimen.learnerProduct.actions],
      sourceBindingId: typedSpecimen.sourceBinding.id,
      learnerProductId: typedSpecimen.learnerProduct.id,
      artifact: typedSpecimen.learnerProduct.artifact,
      successCriterion: typedSpecimen.learnerProduct.criterion,
      rightsDisclosure: typedSpecimen.rightsBinding.disclosure,
    };
    const specimenDescription = `For ${concept}, inspect ${typedSpecimen.entities
      .slice(0, 3)
      .map((entity) => entity.label)
      .join(
        ', ',
      )} and the declared ${typedSpecimen.relations[0]?.type || 'evidence'} relation before interpreting it for ${artifact}.`;
    const functionalSlide = {
      type: 'keyTerm',
      title: `Visual evidence lab: analyze the ${concept} specimen`,
      bullets: authoredBullets,
      minutes: 10,
      bloom: 'Analyze',
      objective: context.objective || null,
      activity: 'Visual annotation and comparison',
      enrichmentSource: 'brief-functional-visual-contract-v1',
      visual: {
        kind: 'evidence specimen',
        specimenSeed: `${lesson.lessonNumber}:${lesson.title}:${concept}:${secondary}`,
        specimenLabel: conciseClause(concept, 'Visual evidence', 42, { ellipsis: true }),
        evidenceLabel: conciseClause(secondary, 'Supporting detail', 46, { ellipsis: true }),
        observationPrompt,
        description: specimenDescription,
        altText: specimenDescription,
        visualPlan: {
          slidePurpose: `Provide a concrete, inspectable visual object for the lesson's required analysis task.`,
          evidenceSource: typedSpecimen.sourceBinding.label,
          artifactConnection: artifact,
          studentAction: `Students analyze this exact specimen, ${productMove}, then connect the evidence to ${artifact}.`,
          accessibilityCheck:
            'Grid, focal shape, unequal bars, alignment anchors, and direction are named in alt text; the task does not rely on color alone.',
        },
        functionalVisualContract: {
          protocol: 'coursemapper-functional-visual-task-v1',
          lessonNumber: Number(lesson.lessonNumber),
          required: true,
          visualObject: 'native-evidence-specimen',
          visibleTaskReference: 'native specimen',
          processAction: 'analyze',
          productActions,
          assessmentArtifact: artifact,
          evidenceSource: typedSpecimen.sourceBinding.label,
          provenance: lessonProvenance,
          rightsMode: contract?.rightsBoundary?.mode || 'attributed-or-original-native',
        },
        typedSpecimen,
      },
    };
    const activityIndex = slides.findIndex((slide) => slide?.type === 'activity');
    slides.splice(activityIndex >= 0 ? activityIndex : Math.max(1, slides.length - 2), 0, functionalSlide);
  }

  function deduplicateSlideEvidenceTableVisual({ visual, seenEvidenceRowKeys, lesson, slideTitle = '' }) {
    if (!Array.isArray(visual?.rows) || visual.rows.length === 0) return visual;
    const rowsKey = JSON.stringify(visual.rows);
    if (!seenEvidenceRowKeys.has(rowsKey)) {
      seenEvidenceRowKeys.add(rowsKey);
      return visual;
    }
    const { rows: _repeatedRows, ...visualSansRows } = visual;
    return {
      ...visualSansRows,
      kind: 'evidence self-check',
      description: lessonVariant(lesson, [
        `Recall ${primarySlideConcept(lesson)}; verify one claim.`,
        `Rebuild ${primarySlideConcept(lesson)}; correct one link.`,
        `Retrieve ${primarySlideConcept(lesson)}; bound one inference.`,
        `Recover ${primarySlideConcept(lesson)}; revise one warrant.`,
      ]),
      altText: `Evidence self-check for "${slideTitle}."`,
    };
  }

  function safeCourseFaqReadingLabel(value, lesson = {}, fallback = '') {
    const sourceValue =
      value && typeof value === 'object' && !Array.isArray(value)
        ? value.displayTitle ||
          value.title ||
          value.citation ||
          value.attribution ||
          value.source ||
          value.evidence ||
          ''
        : value;
    const focus = stripLessonPrefix(lesson?.title || '');
    let label = stripTerminalPunctuation(cleanText(sourceValue));
    if (!label) return fallback;
    // The formal source register owns URLs, licences, and provider metadata.
    // A learner FAQ needs only the recognizable reading title; carrying the
    // complete citation here both obscures the answer and can create an orphaned
    // export page. Strip metadata before humanSourceCueLabel sees the value so a
    // trailing URL does not cause the otherwise useful title to be rejected.
    label = label
      .replace(/\s+[—–-]\s+https?:\/\/\S+.*$/i, '')
      .replace(/\s+\((?:open|licensed|licen[cs]e|cc\s*(?:by|0)|source metadata)\b.*$/i, '');
    if (focus) {
      label = label.replace(new RegExp(`^${escapeRegexLiteral(focus)}\\s+[—–-]\\s+`, 'i'), '');
    }
    label = humanSourceCueLabel(label, label);
    if (!label || isUnsafeCourseFaqPhrase(label)) return fallback;
    const words = label.split(/\s+/).filter(Boolean);
    return stripTerminalPunctuation((words.length > 12 ? words.slice(0, 12) : words).join(' ')) || fallback;
  }

  function safeCourseFaqReadingLabels(lesson, limit = 3) {
    return unique(
      (lesson?.readings || []).map((reading) => safeCourseFaqReadingLabel(reading, lesson)).filter(Boolean),
      limit,
    );
  }

  return {
    applyAuthenticDataTaskQuizBinding,
    applyBriefFunctionalVisualSlide,
    applyCrossLessonFactOwnershipToLessons,
    applyFunctionalVisualTaskQuizBinding,
    authenticDataAssignmentInstructions,
    authenticDataStudyWorkedExample,
    buildTypedEvidenceSpecimenContract,
    compilerVerifiedOperationExample,
    contradictionTokens,
    deduplicateSlideEvidenceTableVisual,
    deterministicWorkedExampleForLesson,
    disciplineSafeBlueprintEnrichment,
    enforceFieldLevelSourceAuthority,
    exactSourceClaimCheckVerified,
    extendedLessonVariant,
    filterQuarantinedResearchReadings,
    functionalVisualAssignmentInstructions,
    functionalVisualStudyWorkedExample,
    hasAuthoritativeTeachingTerms,
    hasLearnerFacingSemanticAuthority,
    kernelClaimEchoesDocumentedMisconception,
    lessonFactOwnershipScore,
    lessonTermOwnershipScore,
    normalizeCourseGradingPolicy,
    normalizeCoursePrerequisites,
    normalizedFactOwnershipKey,
    numericArrayFromWorkedExample,
    objectiveAlignedToTestedConcept,
    operationQualifiedWorkedExampleForLesson,
    quarantineContradictoryKernelClaims,
    quarantineUnadmittedResearchClaims,
    quarantineUnverifiedSemanticEnrichment,
    quizConceptAlignedToPlan,
    reconcileCourseMapWithBlueprintSemanticAdmission,
    reconcileLessonFieldsWithSemanticAdmission,
    removeCrossLessonFactLeakage,
    removeCrossLessonTermLeakage,
    safeCourseFaqReadingLabel,
    safeCourseFaqReadingLabels,
    scalarFromWorkedExample,
    semanticAdmissionFilteredLines,
    semanticAdmissionRejectedTermNames,
    statisticalArtifactDetailsForOperation,
    studyGuideTermsForLesson,
    textContainsRejectedLessonTerm,
    typedEvidenceSpecimenProfile,
    typedEvidenceSpecimenProfileForKind,
    valueContainsOwnedFact,
    workedExampleVisualDescriptor,
  };
}
