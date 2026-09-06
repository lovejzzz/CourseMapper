import { getArrayKey } from './syncDependencies';
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  isBlueprintCompiledFeature,
  quarantineUnadmittedResearchClaims,
} from './courseBlueprintCompiler';
import { attachEnrichmentToGraph, buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from './courseGraph';
import { applyLessonDepthToConfigMap } from './lessonDepth';
import { sanitizeGenomeEnrichmentForLesson, sanitizeLessonTitleEchoEnrichment } from './lessonSemanticRelevance';
import { assessScionKeyTermContract } from './scionKeyTermContract';
import { extractInstructorProvidedFacts, resolveRequestedClassSessionMinutes } from './sourceBriefConstraints';

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLessonMatch(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCourseLessonTitle(courseMap, lessonIndex) {
  const lesson = courseMap?.lessons?.[lessonIndex] || {};
  return cleanText(
    lesson.title || lesson.lessonTitle || lesson.topicSection || lesson.topic || `Lesson ${lessonIndex + 1}`,
  );
}

function persistedTermAssessment(term, lesson, payload) {
  return assessScionKeyTermContract(term, {
    lessonTitle: cleanText(lesson?.title || lesson?.lessonTitle || lesson?.topicSection),
    knownFacts: Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : [],
    definitionMin: 40,
    semanticProfile: 'strict-v6',
  });
}

function researchAdmissionLesson(lesson = {}) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const keyConcepts = sections
    .flatMap((section) => [section?.topicSection, section?.topic])
    .map(cleanText)
    .filter(Boolean);
  const outcomes = sections
    .flatMap((section) => [section?.learningObjectives, section?.learningGoals])
    .flatMap((value) => String(value || '').split(/\n+/))
    .map(cleanText)
    .filter(Boolean);
  return {
    ...lesson,
    keyConcepts: Array.isArray(lesson?.keyConcepts) && lesson.keyConcepts.length > 0 ? lesson.keyConcepts : keyConcepts,
    outcomes: Array.isArray(lesson?.outcomes) && lesson.outcomes.length > 0 ? lesson.outcomes : outcomes,
  };
}

function payloadReferencesAnyTerm(value, rejectedTerms) {
  const text = JSON.stringify(value || '').toLowerCase();
  return rejectedTerms.some((term) => term && text.includes(term));
}

function hasReplayableExactLedger(payload) {
  const factCount = Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts.filter(Boolean).length : 0;
  const provenance = payload?.kernel?.provenance;
  const authority = String(payload?.sourceFactAuthority || provenance?.authority || '');
  return (
    factCount >= 3 &&
    provenance?.source === 'compiler-owned-exact-source-ledger' &&
    provenance?.copiedFactsVerbatim === true &&
    Number(provenance?.factCount) === factCount &&
    ['verified-open-research', 'instructor-supplied', 'shipped-source-library', 'admitted-evidence-authority'].includes(
      authority,
    )
  );
}

export function revalidatePersistedLessonContent(lessonContent = {}, courseMap = {}) {
  const receipt = {
    policy: 'strict-v6',
    lessonsChecked: 0,
    rejectedKeyTerms: 0,
    removedQuizItems: 0,
    removedSlides: 0,
    removedFacts: 0,
    removedWalkthroughs: 0,
    removedScenarios: 0,
    rejectedGenomeTerms: 0,
    semanticAtomResets: 0,
    droppedLessonIds: [],
  };
  const sanitized = {};

  for (const [lessonId, payload] of Object.entries(lessonContent || {})) {
    if (!payload || typeof payload !== 'object') continue;
    const lessonNumber = Number(String(lessonId).match(/^lesson-(\d+)$/)?.[1]);
    const lesson = Number.isFinite(lessonNumber) ? courseMap?.lessons?.[lessonNumber - 1] : null;
    receipt.lessonsChecked += 1;
    if (!lesson) {
      receipt.droppedLessonIds.push(lessonId);
      continue;
    }

    const titleResult = sanitizeLessonTitleEchoEnrichment(lesson, payload);
    const semanticResult = sanitizeGenomeEnrichmentForLesson(lesson, titleResult.enrichment);
    const semanticPayload = semanticResult.enrichment || payload;
    // Saved research does not retain authority merely because an older build
    // admitted it. Replay applies the same current curricular-role and exact
    // claim admission used by fresh compilation before any atom is reused.
    const persistedResearch =
      semanticPayload?.enrichmentSource === 'algi-researched' ||
      semanticPayload?.conceptProvenance?.source === 'algi-researched';
    const candidatePayload = persistedResearch
      ? quarantineUnadmittedResearchClaims(researchAdmissionLesson(lesson), semanticPayload)
      : semanticPayload;
    receipt.rejectedKeyTerms += titleResult.receipt.rejectedTitleTerms.length;
    receipt.removedQuizItems += titleResult.receipt.removedQuizItems;
    receipt.removedSlides += titleResult.receipt.removedSlides;
    if (titleResult.receipt.removedScenario) receipt.removedScenarios += 1;
    receipt.rejectedGenomeTerms += semanticResult.receipt.rejectedGenomeTerms.length;
    receipt.removedQuizItems += semanticResult.receipt.removedQuizItems;
    receipt.removedSlides += semanticResult.receipt.removedSlides;
    receipt.removedFacts += semanticResult.receipt.removedFacts;
    if (persistedResearch) {
      receipt.removedFacts += Math.max(
        0,
        (Array.isArray(semanticPayload?.kernel?.facts) ? semanticPayload.kernel.facts.length : 0) -
          (Array.isArray(candidatePayload?.kernel?.facts) ? candidatePayload.kernel.facts.length : 0),
      );
    }
    if (semanticResult.receipt.resetAuthoredAtoms) receipt.semanticAtomResets += 1;

    const rejectedTerms = [];
    const keyTerms = (Array.isArray(candidatePayload.keyTerms) ? candidatePayload.keyTerms : []).filter((term) => {
      const assessment = persistedTermAssessment(term, lesson, candidatePayload);
      if (assessment.eligible) return true;
      const termName = cleanText(term?.term || term?.tr).toLowerCase();
      if (termName) rejectedTerms.push(termName);
      receipt.rejectedKeyTerms += 1;
      return false;
    });
    if (rejectedTerms.length === 0) {
      if (
        keyTerms.length === 0 &&
        !(candidatePayload.quizItems || []).length &&
        !hasReplayableExactLedger(candidatePayload)
      ) {
        receipt.droppedLessonIds.push(lessonId);
      } else {
        sanitized[lessonId] = candidatePayload;
      }
      continue;
    }

    const originalQuizItems = Array.isArray(candidatePayload.quizItems) ? candidatePayload.quizItems : [];
    const quizItems = originalQuizItems.filter((item) => !payloadReferencesAnyTerm(item, rejectedTerms));
    receipt.removedQuizItems += originalQuizItems.length - quizItems.length;

    const originalSlides = Array.isArray(candidatePayload.slideContent) ? candidatePayload.slideContent : [];
    const slideContent = originalSlides.filter((slide) => !payloadReferencesAnyTerm(slide, rejectedTerms));
    receipt.removedSlides += originalSlides.length - slideContent.length;

    const nextPayload = { ...candidatePayload, keyTerms, quizItems };
    if (originalSlides.length > 0) nextPayload.slideContent = slideContent;
    if (candidatePayload.mcWalkthrough && payloadReferencesAnyTerm(candidatePayload.mcWalkthrough, rejectedTerms)) {
      delete nextPayload.mcWalkthrough;
      receipt.removedWalkthroughs += 1;
    }

    if (keyTerms.length === 0 && quizItems.length === 0 && !hasReplayableExactLedger(nextPayload)) {
      receipt.droppedLessonIds.push(lessonId);
      continue;
    }
    sanitized[lessonId] = nextPayload;
  }

  return { lessonContent: sanitized, receipt };
}

/**
 * Reuse an accepted project overlay for a full compiler run only when every
 * requested lesson still survives today's admission policy. Partial or stale
 * overlays return null so the caller can refresh knowledge normally.
 */
export function restoreCompleteEnrichmentOverlay(enrichmentOverlay, courseMap = {}, scopeIndices = null) {
  if (!enrichmentOverlay || typeof enrichmentOverlay !== 'object') return null;
  const sourceLessonContent = enrichmentOverlay.lessonContent;
  if (!sourceLessonContent || typeof sourceLessonContent !== 'object') return null;

  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const requestedIndices = Array.isArray(scopeIndices)
    ? scopeIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < lessons.length)
    : lessons.map((_, index) => index);
  if (requestedIndices.length === 0) return null;

  const { lessonContent, receipt } = revalidatePersistedLessonContent(sourceLessonContent, courseMap);
  const missingLessons = requestedIndices
    .filter((index) => !lessonContent[`lesson-${index + 1}`])
    .map((index) => index + 1);
  if (missingLessons.length > 0) return null;

  return {
    enrichment: {
      ...enrichmentOverlay,
      lessonContent,
      coverage: {
        ...(enrichmentOverlay.coverage || {}),
        requestedLessons: requestedIndices.length,
        enrichedLessons: requestedIndices.length,
        missingLessons: [],
      },
      stageDecisions: {
        ...(enrichmentOverlay.stageDecisions || {}),
        modelStage: 'restored',
      },
    },
    receipt,
    enrichedLessonIds: requestedIndices.map((index) => `lesson-${index + 1}`),
  };
}

/**
 * v0.14.7 WS-G5: identity before content. Compiled items carry numeric
 * lesson identity (lessonNumber/lessonIndex) and registry ids ("A7.2" →
 * session 7); those are checked FIRST. The title-text regex survives only
 * as a last resort for legacy data, and callers can tell which tier
 * matched via getItemLessonIdentity().tier ('id' | 'text' | 'none').
 */
function getItemLessonIdentity(item) {
  const idNumbers = [];
  for (const value of [item?.lessonNumber, item?.week, item?.weekNumber]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) idNumbers.push(n);
  }
  if (item?.lessonIndex != null) {
    const n = Number(item.lessonIndex) + 1;
    if (Number.isFinite(n) && n > 0) idNumbers.push(n);
  }
  // Registry ids: "A7.2" / "R8.1" → session number is the integer part.
  for (const value of [item?.assessmentId, item?.registryId, item?.readingId]) {
    const match = String(value ?? '').match(/^[A-Z](\d{1,2})\./);
    if (match) idNumbers.push(Number(match[1]));
  }
  if (idNumbers.length > 0) return { tier: 'id', numbers: [...new Set(idNumbers)] };

  const textNumbers = [];
  for (const value of [item?.lesson, item?.module, item?.title, item?.lessonTitle, item?.topic, item?.name]) {
    const text = String(value ?? '');
    const match = text.match(/\b(?:lesson|week|module)?\s*(\d{1,2})\b/i);
    if (match) textNumbers.push(Number(match[1]));
  }
  const numbers = [...new Set(textNumbers.filter((n) => Number.isFinite(n) && n > 0))];
  return { tier: numbers.length > 0 ? 'text' : 'none', numbers };
}

function getItemLessonNumbers(item) {
  return getItemLessonIdentity(item).numbers;
}

function collectLessonIdentityText(item) {
  return [
    item?.lessonTitle,
    item?.title,
    item?.topic,
    item?.name,
    item?.assessment,
    item?.assignmentTitle,
    item?.rubricTitle,
    item?.deckTitle,
    item?.studyGuideTitle,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');
}

function itemMatchesLesson(item, lessonNumber, normalizedLessonTitle, { onTextTierMatch } = {}) {
  const identity = getItemLessonIdentity(item);
  // Tier 1 — numeric/registry identity: authoritative in both directions.
  if (identity.tier === 'id') return identity.numbers.includes(lessonNumber);
  // Tier 2 — legacy text matching, loud when it decides anything.
  const textMatched =
    identity.numbers.includes(lessonNumber) ||
    (Boolean(normalizedLessonTitle) &&
      normalizeLessonMatch(collectLessonIdentityText(item)).includes(normalizedLessonTitle));
  if (textMatched && typeof onTextTierMatch === 'function') onTextTierMatch(item);
  return textMatched;
}

export function buildCompiledLessonPatchData(featureId, compiledData, courseMap, lessonIndex, options = {}) {
  if (!compiledData) return null;
  const compiledKey = getArrayKey(featureId, compiledData);
  if (!compiledKey) return compiledData;
  const compiledItems = compiledData?.[compiledKey] || [];
  const lessonNumber = lessonIndex + 1;
  const normalizedLessonTitle = normalizeLessonMatch(getCourseLessonTitle(courseMap, lessonIndex));
  const lessonItems = compiledItems.filter((item) =>
    itemMatchesLesson(item, lessonNumber, normalizedLessonTitle, { onTextTierMatch: options.onTextTierMatch }),
  );
  const patchItems =
    lessonItems.length > 0 ? lessonItems : compiledItems[lessonIndex] ? [compiledItems[lessonIndex]] : [];
  return patchItems.length > 0 ? { ...compiledData, [compiledKey]: patchItems } : null;
}

/**
 * v0.14.7 WS-G1: the sync compile keeps its subject matter.
 *
 * The original implementation compiled the bare prose blueprint — never
 * merging the enrichment kernels — so every compiler-synced lesson silently
 * regressed from subject-matter-grounded content to the mail-merge tier
 * (audit §2.9, the exact defect class v0.12.1/v0.14.1 were fought over).
 * Kernels now come from two tiers: the stored graph enrichment overlay
 * (this session's generation) and the fingerprint-keyed lesson kernel cache
 * (survives reloads; an edited lesson's changed fingerprint MISSES, which is
 * the correct invalidation — the caller may then refresh that one kernel).
 *
 * Returns { data, lessonEnriched, enrichedLessonCount, enrichedLessonIds } — `data` is the
 * per-lesson patch; `lessonEnriched` says whether THIS lesson compiled with
 * its kernel (the G1 honesty gate reads it; a false is loud, never silent).
 */
export function compileBlueprintLessonPatch({
  featureId,
  courseMap,
  lessonIndex,
  config,
  instructorPreferences,
  sourceBrief = '',
  sessionMinutes = null,
  enrichmentOverlay = null,
  kernelCache = null,
  onTextTierMatch = null,
}) {
  if (!isBlueprintCompiledFeature(featureId)) return null;

  const restoredLessonContent = { ...(enrichmentOverlay?.lessonContent || {}) };
  if (kernelCache) {
    (courseMap?.lessons || []).forEach((lesson, idx) => {
      const lessonId = `lesson-${idx + 1}`;
      if (restoredLessonContent[lessonId]) return;
      const cached = typeof kernelCache.get === 'function' ? kernelCache.get(lesson) : null;
      if (cached) restoredLessonContent[lessonId] = cached;
    });
  }
  const { lessonContent, receipt: admissionRevalidation } = revalidatePersistedLessonContent(
    restoredLessonContent,
    courseMap,
  );
  const enrichedLessonIds = Object.keys(lessonContent).sort();
  const enrichedLessonCount = enrichedLessonIds.length;
  const lessonEnriched = Boolean(lessonContent[`lesson-${lessonIndex + 1}`]);

  const requestedMinutes = resolveRequestedClassSessionMinutes({
    sourceBrief,
    explicitSessionLength: sessionMinutes,
    defaultSessionLength: featureId === 'lessonPlans' ? config?.sessionLength : null,
  });
  const compilerOptions = {
    instructorPreferences,
    sourceBrief,
    instructorProvidedFacts: extractInstructorProvidedFacts(sourceBrief),
    ...(requestedMinutes ? { sessionMinutes: requestedMinutes } : {}),
  };
  let blueprint;
  if (enrichedLessonCount > 0) {
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    attachEnrichmentToGraph(graph, {
      ...(enrichmentOverlay && typeof enrichmentOverlay === 'object' ? enrichmentOverlay : {}),
      lessonContent,
    });
    blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, compilerOptions));
  } else {
    blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap, compilerOptions));
  }
  // v0.15.3 D1: per-lesson recompiles carry the depth flag too — same
  // injection as full generation, sync radius, and compact restore.
  const compiled = compileBlueprintDeliverables(blueprint, [featureId], {
    configMap: applyLessonDepthToConfigMap({ [featureId]: config || {} }),
  });
  const data = buildCompiledLessonPatchData(featureId, compiled?.[featureId], courseMap, lessonIndex, {
    onTextTierMatch,
  });
  if (!data) return null;
  return { data, lessonEnriched, enrichedLessonCount, enrichedLessonIds, admissionRevalidation };
}
