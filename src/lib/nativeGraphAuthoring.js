/**
 * nativeGraphAuthoring.js — v0.14.5 WS-B: the V0.13 deferred contract,
 * flag-gated end to end.
 *
 * The model authors typed graph entities natively instead of spreadsheet
 * prose:
 *  - Pass A (useGeneration, ONE low-reasoning call): syllabus → typed
 *    skeleton ({ course, sessions, assessments, readings, resources } with
 *    ids) — parsed here with a degraded-plan guard (malformed → typed error
 *    → the caller falls back to the prose path LOUDLY, budget event
 *    'nativeAuthoringFellBack'; never silent).
 *  - Pass B (useDeliverables, parallel batched calls): outcomes + kernel
 *    content authored ONTO Pass A's session ids, riding the EXISTING kernel
 *    contract (blueprintEnrichmentPass prompt/linters/out-of-chunk guard).
 *    Genome-covered lessons keep the augment/displace rules: fully resolved
 *    lessons ride Pass B batches as CONTENT-SOURCED entries (goal/outcomes/
 *    activities only — the structural authorship the prose map call used to
 *    buy); their kernel content is never re-authored or displaced.
 *  - Assembly: skeleton + Pass B payloads → a canonical wire course map. The
 *    raw assembler still proves registry ids/kinds/weights and render↔derive
 *    stability, but the compile-stage resolver validates that map as CourseIR
 *    and projects the graph from CurriculumV1 before downstream compile.
 *
 * Session-id mapping: skeleton ids are 's1'…'sN' (order). Pass B wire ids
 * are the kernel contract's 'lesson-N' where N === the session's order, so
 * the existing parser, enrichment overlay keys, and the genome linker all
 * line up without translation tables.
 *
 * B4 — matchEntityIds: stable-id matching on re-derivation after edits.
 * Sessions match by (order, normalized title); assessments/readings by
 * (dueSession, normalized title); matched entities keep their old ids, new
 * entities keep fresh ones. Wired into the re-derive path for raw native graphs
 * and CurriculumV1-projected native graphs; the prose path keeps today's
 * behavior.
 */

import {
  assessProjectedKernelCoverage,
  buildLessonKernelPrompt,
  lintEnrichedAssignmentCore,
  lintEnrichedDiscussionPrompt,
  parseLessonKernelResponse,
} from './blueprintEnrichmentPass';
// Specific courseGraph modules (not the index) so this module never drags
// blueprintFromGraph→courseBlueprintCompiler into a chunk that lacks it.
import { classifyAssessmentKind, deriveCourseGraphFromCourseMap } from './courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from './courseGraph/renderCourseMap.js';
import { validateCourseGraph } from './courseGraph/schema.js';
import { attachEnrichmentToGraph } from './courseGraph/blueprintFromGraph.js';
import { buildCourseIRFromCourseMap, courseIRToCourseGraph, validateCourseIR } from './courseIR.js';
import { repairNativeFallbackWithCurriculumV1 } from './curriculumV1Repair.js';
import { dedupeNumberedAssessmentEcho } from './compilerText.js';
import { assessTargetLanguagePresence, detectForeignLanguageTeachingContent } from './languageIdentityGuard.js';
import { projectKernelToSurfaces } from './kernelProjection';
import { NATIVE_PASS_B_AUTHORING_ADDITION } from './prompts';
import { extractExplicitCoverageTopics, extractExplicitLessonSequence } from './explicitLessonSequence';
import { semanticIdentityTokens } from './lessonSemanticRelevance';
import { buildFactLedgerFeedback } from './factLedgerFeedback.js';
import { resolveScionCumulativeTargetLanguagePair } from './scionLanguageKnowledge.js';
export { AUTHORING_MODE_STORAGE_KEY, readAuthoringMode, saveAuthoringMode } from './authoringMode.js';

// ── Typed failure: the degraded-plan guard ──────────────────────────────────
// A malformed skeleton must fail LOUDLY and fall back to the prose path —
// the v0.12.1 lesson (a degraded plan silently disabling the content stack
// shipped four mail-merge packages).
export class NativeAuthoringError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'NativeAuthoringError';
    this.code = code;
  }
}

function cleanText(value, max = 300) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanTextAtBoundary(value, max = 300) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const sentenceEnd = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (sentenceEnd >= Math.floor(max * 0.55)) return slice.slice(0, sentenceEnd + 1).trim();
  const clauseEnd = Math.max(
    slice.lastIndexOf(';'),
    slice.lastIndexOf(','),
    slice.lastIndexOf('—'),
    slice.lastIndexOf('–'),
  );
  if (clauseEnd >= Math.floor(max * 0.55)) return slice.slice(0, clauseEnd).trim();
  const wordEnd = slice.lastIndexOf(' ');
  return (wordEnd >= Math.floor(max * 0.55) ? slice.slice(0, wordEnd) : text.slice(0, max)).trim();
}

function selectConceptAlignedFact(facts = [], concept = '') {
  const conceptTokens = new Set(semanticIdentityTokens(concept));
  if (conceptTokens.size === 0) return facts[0] || '';
  let best = facts[0] || '';
  let bestScore = -1;
  facts.forEach((fact, index) => {
    const factTokens = new Set(semanticIdentityTokens(fact));
    const overlap = [...conceptTokens].filter((token) => factTokens.has(token)).length;
    const coverage = overlap / conceptTokens.size;
    const score = overlap * 10 + coverage - index / 1000;
    if (score > bestScore) {
      best = fact;
      bestScore = score;
    }
  });
  return best;
}

function factsAlignedToLesson(facts = [], courseMapLesson = {}, concept = '') {
  const lessonCue = [
    concept,
    cleanText(courseMapLesson?.title, 180).replace(/^lesson\s+\d+\s*[:.-]\s*/i, ''),
    ...asArray(courseMapLesson?.sections).map((section) =>
      cleanText(section?.topicSection || section?.topic, 160).replace(/^\d+(?:\.\d+)*\s*[:.-]\s*/i, ''),
    ),
  ].join(' ');
  const lessonTokens = new Set(semanticIdentityTokens(lessonCue));
  if (lessonTokens.size === 0) return facts;
  const aligned = facts.filter((fact) => semanticIdentityTokens(fact).some((token) => lessonTokens.has(token)));
  // Two aligned statements can support a real comparison. Keep the original
  // ledger only when semantic tokenization cannot establish even that much.
  return aligned.length >= 2 ? aligned : facts;
}

export function isNativeContentSourcedKernel(payload, partialOverlay) {
  if (!payload) return false;
  const coverage = assessProjectedKernelCoverage(payload);
  // A usable partial genome composition already contains a real semantic
  // lesson, so Pass B should preserve it as content-sourced instead of
  // re-authoring it merely to reach optional MC/slide saturation. Thin
  // partials still go to the model; legacy fully linked genome payloads keep
  // their historical displacement behavior.
  return coverage.complete || coverage.usable || (!partialOverlay && payload.enrichmentSource === 'genome-linked');
}

export function selectNativeContentSources(lessonIndices, lessonContent = {}, partialOverlays = {}) {
  return asArray(lessonIndices)
    .map((lessonIndex) => `lesson-${lessonIndex + 1}`)
    .filter((lessonId) => isNativeContentSourcedKernel(lessonContent[lessonId], partialOverlays[lessonId]));
}

/**
 * Run the bounded native-kernel recovery loop.
 *
 * The projection callback intentionally runs inside the loop, immediately
 * after a provider response. Compact Scion may return only an immutable fact
 * ledger; those facts are not instructionally usable until the compiler has
 * projected its safe quiz/term/slide surfaces. Deciding progress before that
 * projection spent a second provider call on an already recovered lesson.
 */
export async function runNativeKernelRecovery({
  lessonIndices = [],
  lessonContent = {},
  lessonIdOf = (lessonIndex) => `lesson-${lessonIndex + 1}`,
  kernelIsUsable,
  listMissingAuthoredIndices = () => [],
  recoveryCallLimit = 0,
  hasProviderCallBudget = () => true,
  selectRecoveryChunk,
  chunkSize = 1,
  runRecoveryBatch,
  projectRecoveredSurfaces = () => {},
  onRecoveryError = () => {},
  onStalled = () => {},
}) {
  const allLessonIndices = asArray(lessonIndices);
  const listMissingKernelIndices = () =>
    allLessonIndices.filter((lessonIndex) => !kernelIsUsable(lessonContent[lessonIdOf(lessonIndex)]));
  let recoveryCalls = 0;
  const attemptedLessonIndices = [];

  while (
    recoveryCalls < recoveryCallLimit &&
    (listMissingKernelIndices().length > 0 || listMissingAuthoredIndices().length > 0) &&
    hasProviderCallBudget()
  ) {
    const beforeSignature = JSON.stringify({
      kernel: listMissingKernelIndices(),
      authored: listMissingAuthoredIndices(),
    });
    const recoveryCandidates = [...new Set([...listMissingKernelIndices(), ...listMissingAuthoredIndices()])].sort(
      (left, right) => left - right,
    );
    const retryChunk = selectRecoveryChunk(recoveryCandidates, attemptedLessonIndices, chunkSize);
    if (retryChunk.length === 0) break;
    attemptedLessonIndices.push(...retryChunk);
    recoveryCalls += 1;

    try {
      await runRecoveryBatch(retryChunk, recoveryCalls);
      projectRecoveredSurfaces(retryChunk);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      onRecoveryError(error);
    }

    const afterSignature = JSON.stringify({
      kernel: listMissingKernelIndices(),
      authored: listMissingAuthoredIndices(),
    });
    if (afterSignature === beforeSignature) {
      const terminal = recoveryCalls >= recoveryCallLimit || !hasProviderCallBudget();
      onStalled({ terminal, recoveryCalls });
      if (terminal) break;
    }
  }

  return {
    recoveryCalls,
    attemptedLessonIndices,
    missingKernelIndices: listMissingKernelIndices(),
    missingAuthoredIndices: listMissingAuthoredIndices(),
  };
}

export function pickNativeKernel(previous, candidate) {
  if (!previous) return candidate;
  // Thin genome overlays deliberately remain in `lessonContent` while the
  // model authors the missing semantic backbone. Comparing only the seven
  // optional-surface checks let a citation-rich but unusable partial outrank
  // a compact model kernel that becomes usable after deterministic surface
  // completion. Recovery then generated the same lesson again and discarded
  // it again. Rank the state users can actually receive: usability after the
  // compiler's evidence-preserving completion comes before saturation score.
  const rank = (payload) => {
    const completed = completeNativeKernelSurfaces(payload);
    const coverage = assessProjectedKernelCoverage(completed);
    return [
      coverage.usable ? 1 : 0,
      coverage.complete ? 1 : 0,
      coverage.score,
      Math.min(8, coverage.factCount + coverage.keyTermCount),
      Math.min(4, coverage.quizItemCount),
    ];
  };
  const previousRank = rank(previous);
  const candidateRank = rank(candidate);
  for (let index = 0; index < candidateRank.length; index += 1) {
    if (candidateRank[index] > previousRank[index]) return candidate;
    if (candidateRank[index] < previousRank[index]) return previous;
  }
  return candidate;
}

/**
 * A weak-model kernel may pass atomic admission while one optional authored
 * surface was dropped by its own linter. Complete those surfaces from the
 * admitted lesson facts and canonical map row, without another provider call.
 * The fallback is explicit in `surfaceFallbacks`; it never masquerades as
 * model-authored preference evidence.
 */
export function completeNativeKernelSurfaces(payload, courseMapLesson = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const sections = asArray(courseMapLesson?.sections);
  const title = cleanText(courseMapLesson?.title, 140).replace(/^lesson\s+\d+\s*[:.-]\s*/i, '');
  const lessonOrdinal = Math.max(
    1,
    Number(courseMapLesson?.lessonNumber) ||
      Number(cleanText(courseMapLesson?.title, 140).match(/^lesson\s+(\d+)/i)?.[1]) ||
      1,
  );
  const lessonVariant = (variants) => variants[(lessonOrdinal - 1) % variants.length];
  const topic = sections
    .map((section) => cleanText(section?.topicSection, 120).replace(/^\d+(?:\.\d+)*\s*[:.-]\s*/i, ''))
    .find(Boolean);
  const concept = cleanText(payload?.keyTerms?.[0]?.term || topic || title || 'the central concept', 80);
  const definition = cleanTextAtBoundary(payload?.keyTerms?.[0]?.definition, 260);
  const facts = asArray(payload?.kernel?.facts)
    .map((fact) => cleanTextAtBoundary(fact, 220))
    .filter(Boolean);
  const surfaceFacts = factsAlignedToLesson(facts, courseMapLesson, concept);
  const anchorFact =
    selectConceptAlignedFact(surfaceFacts, concept) ||
    definition ||
    `${concept} requires a claim grounded in inspectable details.`;
  const projectionFacts = anchorFact
    ? [anchorFact, ...surfaceFacts.filter((fact) => fact !== anchorFact)]
    : surfaceFacts;
  const anchorClause = anchorFact.replace(/[.!?]+$/, '');
  const scenario = payload?.kernel?.scenario || {};
  const materials =
    cleanTextAtBoundary(scenario?.materials, 180) || `${concept} examples and the named reading or activity`;
  const assessment = sections
    .flatMap((section) => {
      const value = section?.weeklyAssessments;
      return Array.isArray(value) ? value : value ? [value] : [];
    })
    .map((value) => cleanText(value, 140))
    .find(Boolean);
  const product = assessment || `${concept} analysis`;
  const fallbackFields = [];
  const keyTermFallbacks = [];
  const wordCount = (value) => cleanText(value, 1000).match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
  const substantiveTerm = (term) =>
    wordCount(term?.definition) >= 8 &&
    wordCount(term?.example) >= 5 &&
    wordCount(term?.misconception) >= 5 &&
    wordCount(term?.correction) >= 5;
  const keyTerms = asArray(payload.keyTerms).map((term) => ({ ...term }));
  const scenarioExample = cleanTextAtBoundary(scenario?.setup, 300);
  for (const term of keyTerms) {
    if (wordCount(term.example) >= 5 || wordCount(scenarioExample) < 5) continue;
    term.example = scenarioExample;
    keyTermFallbacks.push({ type: 'example', term: cleanText(term.term, 60), source: 'admitted-scenario' });
  }
  // If every adapter term was quarantined, preserve the admitted fact ledger
  // as a minimal terminology core instead of regenerating the entire lesson.
  // The compiler adds only instructional framing; definition and example
  // remain traceable to the accepted fact/scenario atoms.
  if (keyTerms.filter(substantiveTerm).length === 0 && facts.length >= 3) {
    const comparisonExample = `Compare the supplied claims: ${projectionFacts.slice(0, 2).join(' ')}`;
    const { misconception, correction } = buildFactLedgerFeedback({ lesson: courseMapLesson, concept });
    const fallbackTerm = {
      term: cleanText(concept, 60),
      definition: anchorFact,
      example: scenarioExample || cleanTextAtBoundary(comparisonExample, 300),
      // Put the lesson identity before the reusable reasoning frame. Besides
      // making the feedback more useful to a learner, this prevents one
      // generic eight-word sentence from being stamped across a cumulative
      // quiz bank when many lessons need fact-ledger terminology recovery.
      misconception,
      correction,
      source: 'fact-ledger-projection',
      tier: 1,
    };
    if (substantiveTerm(fallbackTerm)) {
      keyTerms.push(fallbackTerm);
      keyTermFallbacks.push({
        type: 'term',
        term: fallbackTerm.term,
        source: 'fact-ledger-projection',
      });
    }
  }
  const seenTerms = new Set(keyTerms.map((term) => cleanText(term?.term, 60).toLowerCase()).filter(Boolean));
  if (keyTerms.filter(substantiveTerm).length < 3) {
    for (const item of asArray(payload.quizItems)) {
      if (item?.type !== 'multiple_choice' || !Array.isArray(item.options)) continue;
      const answerIndex = Number(item.answerIndex);
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= item.options.length) continue;
      const term = cleanText(item.options[answerIndex], 80)
        .replace(/^(?:a|an|the)\s+/i, '')
        .replace(/[.!?]+$/, '');
      const termWords = wordCount(term);
      if (
        term.length < 3 ||
        term.length > 60 ||
        termWords < 1 ||
        termWords > 6 ||
        /^\d/.test(term) ||
        /\b(?:is|are|was|were|should|would|could|must|does|do|did|because|when|while)\b/i.test(term) ||
        seenTerms.has(term.toLowerCase())
      ) {
        continue;
      }
      const definition = cleanText(item.explanation, 380).split(/(?<=[.!?])\s+/)[0];
      const question = cleanText(item.question, 300);
      const correctOption = cleanText(item.options[answerIndex], 120);
      // A verified MC stem can be a sentence-completion prompt (for example,
      // "A close reading connects a detail to …"). The correct option is part
      // of that evidence atom. Saving the bare stem as a key-term example
      // creates a dangling clause later in the FAQ and study guide, so retain
      // the answer-bearing completion. Normal question stems get an explicit
      // answer sentence instead of being misrepresented as prose.
      const example = /(?:\b(?:to|from|with|for|of|by|through|against|into|as|than)|[:–—-])$/i.test(question)
        ? `${question} ${correctOption}`
        : /[?]$/.test(question)
          ? `For ${question.replace(/[?]+$/, '')}, the supported answer is ${correctOption}.`
          : question;
      if (wordCount(definition) < 8 || wordCount(example) < 5) continue;
      const wrongOption = cleanText(
        item.options.find((option, optionIndex) => optionIndex !== answerIndex && cleanText(option)),
        90,
      );
      const derived = {
        term,
        definition,
        example,
        misconception: `A common error is choosing ${wrongOption || 'a nearby distractor'} without checking the details named in the question.`,
        correction: `The admitted explanation supports ${term} after the named details are checked against every option.`,
        source: 'verified-quiz-projection',
        tier: 1,
        derivedFromQuizIndex: Number(item.index) || 0,
      };
      if (!substantiveTerm(derived)) continue;
      keyTerms.push(derived);
      seenTerms.add(term.toLowerCase());
      keyTermFallbacks.push({
        type: 'term',
        term,
        source: 'verified-quiz-projection',
        quizIndex: Number(item.index) || 0,
      });
      if (keyTerms.filter(substantiveTerm).length >= 3) break;
    }
  }
  let completed = {
    ...payload,
    keyTerms,
    ...(keyTermFallbacks.length > 0
      ? { keyTermFallbacks: [...(payload.keyTermFallbacks || []), ...keyTermFallbacks] }
      : {}),
  };

  // Facts are the immutable semantic backbone. When every adapter assessment
  // atom is quarantined, re-running the model is both expensive and unsafe:
  // the same weak draft often repeats the defect. Project the minimum usable
  // teaching core from the admitted facts and terminology instead. The two
  // assessment seats are constructed response, so the compiler never invents
  // distractors or a new correct answer.
  const existingQuizItems = asArray(completed.quizItems);
  const existingSlides = asArray(completed.slideContent);
  const existingScenario = completed?.kernel?.scenario;
  const needsFactProjection =
    facts.length >= 3 &&
    keyTerms.filter(substantiveTerm).length >= 1 &&
    (existingQuizItems.length < 2 ||
      existingSlides.length < 1 ||
      !existingScenario?.setup ||
      !existingScenario?.materials);
  if (needsFactProjection) {
    const factProjection = projectKernelToSurfaces(
      {
        facts: projectionFacts,
        keyTerms,
        scenario: existingScenario,
      },
      {
        itemPlan: [
          { index: 3, type: 'short_answer', bloom: 'Analyze' },
          { index: 5, type: 'essay', bloom: 'Create' },
        ],
      },
    );
    const quizItems = [...existingQuizItems];
    const occupiedQuizIndexes = new Set(quizItems.map((item) => Number(item?.index)));
    for (const item of asArray(factProjection.quizItems)) {
      if (quizItems.length >= 2) break;
      if (occupiedQuizIndexes.has(Number(item?.index))) continue;
      quizItems.push({ ...item, enrichmentSource: 'fact-ledger-projection' });
      occupiedQuizIndexes.add(Number(item?.index));
    }
    const projectedScenario = factProjection?.kernel?.scenario;
    const coreFallbacks = [];
    if (quizItems.length > existingQuizItems.length) coreFallbacks.push('quizItems');
    if (existingSlides.length < 1 && asArray(factProjection.slideContent).length > 0) {
      coreFallbacks.push('slideContent');
    }
    if (
      (!existingScenario?.setup || !existingScenario?.materials) &&
      projectedScenario?.setup &&
      projectedScenario?.materials
    ) {
      coreFallbacks.push('scenario');
    }
    completed = {
      ...completed,
      quizItems,
      ...(existingSlides.length < 1 && asArray(factProjection.slideContent).length > 0
        ? { slideContent: factProjection.slideContent }
        : {}),
      kernel: {
        ...(completed.kernel || {}),
        ...((!existingScenario?.setup || !existingScenario?.materials) && projectedScenario
          ? { scenario: projectedScenario }
          : {}),
      },
      ...(coreFallbacks.length > 0
        ? {
            coreFallbacks: [
              ...asArray(completed.coreFallbacks),
              ...coreFallbacks.map((field) => ({ field, source: 'fact-ledger-projection' })),
            ],
          }
        : {}),
    };
  }

  if (!completed.discussionPrompt) {
    const discussionPrompt = {
      prompt: `Which interpretation of ${concept} is best supported by ${materials}, and what detail could change that conclusion?`,
      tension: lessonVariant([
        `One reading gives the strongest observed ${concept} pattern priority; another treats the unresolved detail as decisive.`,
        `The debate is whether the available ${concept} evidence warrants a leading interpretation or only a provisional one.`,
        `One side emphasizes what the ${concept} evidence already supports, while the other emphasizes what remains unknown.`,
        `The central tension is how much confidence the present ${concept} evidence can bear before another detail is checked.`,
        `Readers must decide whether the clearest ${concept} pattern outweighs the uncertainty still present in the materials.`,
        `The competing views differ over whether the current ${concept} evidence is sufficient or should remain conditional.`,
      ]),
      positions: [
        `Use ${anchorClause} as the leading interpretation.`,
        lessonVariant([
          `Keep an alternative explanation open until the unresolved ${concept} detail is checked.`,
          `Treat the current reading as provisional because the missing ${concept} evidence could change it.`,
          `Give the competing interpretation priority until the uncertain ${concept} claim has stronger support.`,
          `Withhold a firm conclusion while the available ${concept} materials leave a plausible counter-reading.`,
          `Challenge the leading account by asking whether another ${concept} explanation fits the same evidence.`,
          `Retain the rival reading unless the decisive ${concept} detail rules it out.`,
        ]),
        lessonVariant([
          `State a conditional conclusion and identify the ${concept} finding that would require revision.`,
          `Name the present interpretation together with the missing ${concept} evidence that could overturn it.`,
          `Frame the claim around what is supported now and how a new ${concept} detail would change it.`,
          `Offer a bounded conclusion whose confidence depends on resolving the remaining ${concept} uncertainty.`,
          `Separate the defensible ${concept} claim from the unanswered question that limits it.`,
          `Use a qualified interpretation and specify which additional ${concept} observation would shift the judgment.`,
        ]),
      ],
    };
    if (lintEnrichedDiscussionPrompt(discussionPrompt).length === 0) {
      completed.discussionPrompt = discussionPrompt;
      fallbackFields.push('discussionPrompt');
    }
  }

  if (!completed.assignmentCore) {
    const assignmentCore = {
      taskDescription: lessonVariant([
        `Analyze ${materials} through ${concept}. Produce ${product} that states the best-supported conclusion, cites the decisive detail, and names one limit.`,
        `Use ${concept} to interpret ${materials}. In ${product}, defend the strongest conclusion, point to the evidence behind it, and qualify the claim.`,
        `Examine ${materials} with the ${concept} lens, then build ${product} around one supported interpretation, its key detail, and its boundary.`,
        `Test a ${concept} claim against ${materials}. Submit ${product} that explains the evidence, the resulting judgment, and what remains uncertain.`,
        `Compare the plausible readings of ${materials} through ${concept}. Make ${product} defend one, cite the deciding evidence, and state where it may not hold.`,
        `Develop ${product} from the ${concept} evidence in ${materials}: identify the strongest conclusion, justify it with a specific detail, and avoid overclaiming.`,
      ]),
      parameters: lessonVariant([
        [
          `Scope: use the named ${concept} case or example only.`,
          `Format: submit ${product} in the instructor-approved format.`,
          `Required Evidence/Source: cite at least one detail from ${materials}.`,
          'Length or Time: follow the local requirement confirmed by the instructor before release.',
        ],
        [
          `Scope: focus the response on ${concept} and the assigned materials.`,
          `Format: present ${product} in the locally approved submission form.`,
          `Evidence: quote or cite one specific point from ${materials}.`,
          'Length/Time: confirm the course-specific limit with the instructor before submission.',
        ],
        [
          `Boundary: keep the analysis within the supplied ${concept} example.`,
          `Submission format: organize the work as ${product} using the instructor's required medium.`,
          `Source use: identify the exact detail from ${materials} that warrants the conclusion.`,
          'Extent: use the local word, page, or time limit announced for this task.',
        ],
        [
          `Case limit: analyze only the named ${concept} situation and avoid unsupported extensions.`,
          `Deliverable: turn in ${product} through the format and channel confirmed for the course.`,
          `Required support: anchor the reasoning in a visible detail from ${materials}.`,
          'Length or duration: verify the applicable local constraint before finalizing the work.',
        ],
        [
          `Analytical scope: apply ${concept} to the provided case rather than inventing a new one.`,
          `Output: complete ${product} in the instructor-specified document, presentation, or recording form.`,
          `Evidence requirement: point to at least one inspectable detail in ${materials}.`,
          'Scale: follow the task-specific length or time guidance supplied in class.',
        ],
        [
          `Focus: keep every claim tied to the assigned ${concept} materials.`,
          `Product form: prepare ${product} in the approved course format.`,
          `Source trail: name the detail from ${materials} that supports the judgment.`,
          'Completion boundary: check the instructor-confirmed word, page, or time expectation before release.',
        ],
      ]),
    };
    if (lintEnrichedAssignmentCore(assignmentCore).length === 0) {
      completed.assignmentCore = assignmentCore;
      fallbackFields.push('assignmentCore');
    }
  }
  if (completed.assignmentCore && assessment && !completed.assignmentCore.canonicalAssessment) {
    completed.assignmentCore = {
      ...completed.assignmentCore,
      canonicalAssessment: assessment,
    };
  }

  if (!completed.studyGuide) {
    const summaryBase = [definition, anchorFact].filter(Boolean).join(' ');
    completed.studyGuide = {
      summary: cleanText(
        `${summaryBase} Connect ${concept} to ${materials} and keep the conclusion within the evidence boundary.`,
        600,
      ),
      reviewStrategy: `Rehearse ${concept} by explaining why ${anchorClause}. Then test the explanation against ${materials}.`,
    };
    fallbackFields.push('studyGuide');
  }

  return fallbackFields.length > 0
    ? {
        ...completed,
        surfaceFallbacks: [...new Set([...(payload.surfaceFallbacks || []), ...fallbackFields])],
      }
    : completed;
}

/** Complete admitted optional surfaces across a lesson-content overlay. */
export function completeNativeLessonSurfaces(lessonContent, courseMapLessons = [], lessonIndices = [], onComplete) {
  let completed = 0;
  for (const lessonIndex of lessonIndices) {
    const lessonId = `lesson-${lessonIndex + 1}`;
    const payload = lessonContent?.[lessonId];
    if (!payload) continue;
    const next = completeNativeKernelSurfaces(payload, courseMapLessons?.[lessonIndex]);
    completed += Math.max(0, (next?.surfaceFallbacks || []).length - (payload?.surfaceFallbacks || []).length);
    lessonContent[lessonId] = next;
  }
  const message = completed
    ? `Completed ${completed} missing authored surface${completed === 1 ? '' : 's'} from admitted lesson evidence`
    : '';
  if (message && typeof onComplete === 'function') onComplete(message, 'progress');
  return message;
}

// A cumulative assessment is not a new subject lesson. Asking a compact model
// to invent a fresh knowledge kernel for "Midterm 1" or "Final Exam" both
// wastes an inference call and encourages assessment logistics to masquerade
// as disciplinary content. Project these sessions from previously admitted
// lesson evidence instead. The projection copies facts and key-term atoms
// verbatim; the compiler adds only review instructions and provenance.
const CUMULATIVE_ASSESSMENT_TITLE_RE =
  /\b(?:midterm(?:\s+(?:exam|assessment|\d+))?|final\s+(?:exam|examination|assessment)|cumulative\s+(?:exam|examination|assessment|review)|comprehensive\s+(?:exam|examination|assessment|review)|exam\s+review|problem\s+sets?|course\s+synthesis|vocabulary\s+recall)\b/i;

export function isCumulativeAssessmentLesson(lesson = {}) {
  const title = typeof lesson === 'string' ? lesson : lesson?.title;
  const sectionTitles =
    typeof lesson === 'string'
      ? ''
      : asArray(lesson?.sections)
          .map((section) => section?.topicSection || section?.topic)
          .join(' ');
  return CUMULATIVE_ASSESSMENT_TITLE_RE.test(`${cleanText(title, 180)} ${cleanText(sectionTitles, 300)}`);
}

export function partitionCumulativeAssessmentLessons(courseMapLessons = [], lessonIndices = []) {
  const cumulativeAssessmentLessonIndices = [];
  const subjectLessonIndices = [];
  for (const lessonIndex of asArray(lessonIndices)) {
    if (isCumulativeAssessmentLesson(courseMapLessons?.[lessonIndex])) {
      cumulativeAssessmentLessonIndices.push(lessonIndex);
    } else {
      subjectLessonIndices.push(lessonIndex);
    }
  }
  return { subjectLessonIndices, cumulativeAssessmentLessonIndices };
}

function cumulativeSourceEntries(lessonContent, courseMapLessons, assessmentIndex) {
  const entries = [];
  for (let lessonIndex = 0; lessonIndex < assessmentIndex; lessonIndex += 1) {
    const lesson = courseMapLessons?.[lessonIndex];
    if (isCumulativeAssessmentLesson(lesson)) continue;
    const lessonId = `lesson-${lessonIndex + 1}`;
    const payload = lessonContent?.[lessonId];
    // Compact Scion freezes admitted facts before compiler-owned glossary,
    // assessment, and study-guide surfaces are projected. A cumulative
    // session runs at that boundary, so requiring the *finished* optional
    // surface contract here can discard every valid source lesson and send
    // the capstone back through model recovery. Admit only payloads with an
    // actual semantic atom; the cumulative draft still has to clear the
    // normal usability gate below before it can ship.
    const admittedFactCount = asArray(payload?.kernel?.facts).filter((fact) => cleanText(fact, 500)).length;
    const admittedTermCount = asArray(payload?.keyTerms).filter(
      (term) => cleanText(term?.term, 80) && cleanText(term?.definition, 500),
    ).length;
    if (!payload || (admittedFactCount === 0 && admittedTermCount === 0)) continue;
    entries.push({ lessonIndex, lessonId, lesson, payload });
  }
  return entries;
}

function projectedCumulativeFacts(entries, limit = 7) {
  const firstPass = entries.map((entry) => asArray(entry.payload?.kernel?.facts).find((fact) => cleanText(fact, 500)));
  const remaining = entries.flatMap((entry) => asArray(entry.payload?.kernel?.facts).slice(1));
  return uniqueStrings([...firstPass, ...remaining], limit).map((fact) => cleanTextAtBoundary(fact, 220));
}

function projectedCumulativeTerms(entries, limit = 5) {
  const candidates = entries.flatMap((entry) =>
    asArray(entry.payload?.keyTerms).map((term) => ({
      ...term,
      sourceLessonId: entry.lessonId,
      projectionSource: 'previously-admitted-lesson',
    })),
  );
  const seen = new Set();
  const terms = [];
  for (const term of candidates) {
    const name = cleanText(term?.term, 80);
    const definition = cleanText(term?.definition, 500);
    if (!name || !definition || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    terms.push(term);
    if (terms.length >= limit) break;
  }
  return terms;
}

/**
 * Fill assessment-only lesson kernels from earlier admitted subject lessons.
 * Returns only projections that satisfy the same instructional-usability gate
 * as model-authored kernels; otherwise the caller may still use its bounded
 * provider recovery path.
 */
export function projectCumulativeAssessmentKernels({
  lessonContent = {},
  courseMapLessons = [],
  lessonIndices = [],
  courseName = '',
  onComplete,
} = {}) {
  const projectedLessonIndices = [];
  const skippedLessonIndices = [];
  for (const lessonIndex of asArray(lessonIndices)) {
    const lesson = courseMapLessons?.[lessonIndex];
    if (!isCumulativeAssessmentLesson(lesson)) continue;
    const lessonId = `lesson-${lessonIndex + 1}`;
    if (assessProjectedKernelCoverage(lessonContent?.[lessonId]).usable) continue;

    const entries = cumulativeSourceEntries(lessonContent, courseMapLessons, lessonIndex);
    const facts = projectedCumulativeFacts(entries);
    const keyTerms = projectedCumulativeTerms(entries);
    if (facts.length < 3) {
      skippedLessonIndices.push(lessonIndex);
      continue;
    }

    const sourceLessonIds = entries.map((entry) => entry.lessonId);
    const coveredLessonNumbers = entries.map((entry) => entry.lessonIndex + 1);
    const coveredSpan =
      coveredLessonNumbers.length > 1
        ? `Lessons ${coveredLessonNumbers[0]}-${coveredLessonNumbers.at(-1)}`
        : `Lesson ${coveredLessonNumbers[0]}`;
    const assessmentTitle = cleanText(lesson?.title, 160).replace(/^lesson\s+\d+\s*[:.-]\s*/i, '');
    const termNames = keyTerms.map((term) => cleanText(term.term, 80)).filter(Boolean);
    // Cumulative-review lessons bypass the model-backed Scion pass that adds
    // the course's canonical target-language pair. Preserve the same language
    // contract at this compiler-owned boundary: prefer a lesson-specific
    // local pair, then reuse one already admitted in the reviewed lessons.
    // This is evidence projection, not new model-authored language content.
    const targetLanguagePair = resolveScionCumulativeTargetLanguagePair({ courseName, lesson, entries });
    const draft = {
      enrichmentSource: 'cumulative-review-projection',
      projectionKind: 'cumulative-assessment',
      sourceLessonIds,
      ...(targetLanguagePair ? { targetLanguagePair: { ...targetLanguagePair } } : {}),
      kernel: {
        facts,
        scenario: {
          setup: `Students prepare for ${assessmentTitle || 'the cumulative assessment'} by comparing claims already established across ${coveredSpan}.`,
          materials: `course notes, worked examples, and returned practice from ${coveredSpan}`,
        },
        provenance: {
          source: 'previously-admitted-lesson-kernels',
          sourceLessonIds,
          copiedFactsVerbatim: true,
        },
      },
      keyTerms,
      studyGuide: {
        summary: facts
          .slice(0, 4)
          .map((fact, index) => `${termNames[index] || `Review focus ${index + 1}`}: ${fact}`)
          .join(' '),
        reviewStrategy: `Use retrieval practice across ${coveredSpan}: explain each named term without notes, solve one prior example, then revisit only the evidence you could not reconstruct.`,
      },
    };
    const projected = completeNativeKernelSurfaces(draft, lesson);
    if (!assessProjectedKernelCoverage(projected).usable) {
      skippedLessonIndices.push(lessonIndex);
      continue;
    }
    lessonContent[lessonId] = projected;
    projectedLessonIndices.push(lessonIndex);
  }

  if (projectedLessonIndices.length > 0 && typeof onComplete === 'function') {
    onComplete(
      `Compiled ${projectedLessonIndices.length} cumulative assessment session${projectedLessonIndices.length === 1 ? '' : 's'} from previously admitted lesson evidence`,
      'progress',
    );
  }
  return { projectedLessonIndices, skippedLessonIndices };
}

export function prepareCumulativeAssessmentKernels(
  lessonContent,
  courseMapLessons,
  subjectLessonIndices,
  cumulativeAssessmentLessonIndices,
  contentSourcedSet,
  onComplete,
  chunkSize = 1,
  courseName = '',
) {
  completeNativeLessonSurfaces(lessonContent, courseMapLessons, subjectLessonIndices, onComplete);
  const result = projectCumulativeAssessmentKernels({
    lessonContent,
    courseMapLessons,
    lessonIndices: cumulativeAssessmentLessonIndices,
    courseName,
    onComplete,
  });
  result.projectedLessonIndices.forEach((index) => contentSourcedSet?.add(`lesson-${index + 1}`));
  const batches = [];
  for (let start = 0; start < result.skippedLessonIndices.length; start += chunkSize) {
    batches.push(result.skippedLessonIndices.slice(start, start + chunkSize));
  }
  return batches;
}

export async function resolveCumulativeAssessmentKernels(
  lessonContent,
  courseMapLessons,
  subjectLessonIndices,
  assessmentLessonIndices,
  contentSourcedSet,
  onComplete,
  chunkSize,
  limit,
  runBatch,
  batchOffset = 0,
  courseName = '',
) {
  const batches = prepareCumulativeAssessmentKernels(
    lessonContent,
    courseMapLessons,
    subjectLessonIndices,
    assessmentLessonIndices,
    contentSourcedSet,
    onComplete,
    chunkSize,
    courseName,
  );
  await Promise.all(batches.map((chunk, index) => limit(() => runBatch(chunk, batchOffset + index))));
}

const MODALITY_ONLY_SECTION_TITLES = new Set([
  'activity',
  'activities',
  'class activity',
  'class session',
  'discussion',
  'discussions',
  'guided practice',
  'in-class activity',
  'lab',
  'lab session',
  'labs',
  'laboratories',
  'laboratory',
  'laboratory session',
  'lecture',
  'lecture lab',
  'lecture/lab',
  'lectures',
  'practice',
  'practicum',
  'recitation',
  'recitations',
  'seminar',
  'seminars',
  'workshop',
  'workshops',
]);

function isModalityOnlySectionTitle(value) {
  const normalized = cleanText(value, 120)
    .toLowerCase()
    .replace(/^[\d\s.:-]+/, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[.:;,-]+$/g, '')
    .trim();
  return MODALITY_ONLY_SECTION_TITLES.has(normalized);
}

function cleanSectionTitles(value) {
  return asArray(value)
    .map((title) => cleanText(title, 120))
    .filter((title) => title && !isModalityOnlySectionTitle(title))
    .slice(0, 5);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values = [], limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = cleanText(value, 500);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function recoverExplicitLessonSequence(sourceText, expectedCount) {
  if (!Number.isInteger(expectedCount) || expectedCount < 2) return [];
  return extractExplicitLessonSequence(sourceText, { expectedCount });
}

const EXPLICIT_READING_LIST_HEADER_RE =
  /\b(?:required|assigned)\s+(?:readings?|texts?)(?:\s+as\s+named\s+on\s+the\s+syllabus)?\s*:\s*/i;
const EXPLICIT_READING_ENTRY_RE = /^(?:week|lesson|session)\s+(\d{1,2})\s+(?:reads?|assigns?|uses?)\s+(.+?)\s*[.!?]?$/i;

/**
 * Recover only instructor-explicit named readings from a compact source list.
 * The compiler requires both a labelled readings header and a due-session
 * marker on every semicolon-delimited entry, so ordinary topic prose can
 * never become a title by inference.
 */
export function recoverExplicitNamedReadings(sourceText, sessionCount) {
  if (!Number.isSafeInteger(sessionCount) || sessionCount < 1) return [];
  const source = String(sourceText || '');
  const header = EXPLICIT_READING_LIST_HEADER_RE.exec(source);
  if (!header) return [];
  const listBlock = source
    .slice(header.index + header[0].length)
    .split(/\n\s*\n/)[0]
    .trim();
  if (!listBlock) return [];
  const recovered = [];
  const dueSessions = new Set();
  for (const segment of listBlock.split(/\s*;\s*/)) {
    const match = EXPLICIT_READING_ENTRY_RE.exec(segment.trim());
    if (!match) return [];
    const dueSession = Number(match[1]);
    const title = cleanText(match[2], 240)
      .replace(/[.!?]+$/, '')
      .trim();
    if (
      !Number.isSafeInteger(dueSession) ||
      dueSession < 1 ||
      dueSession > sessionCount ||
      !title ||
      dueSessions.has(dueSession)
    ) {
      return [];
    }
    dueSessions.add(dueSession);
    recovered.push({ id: `r${recovered.length + 1}`, title, dueSession });
  }
  return recovered;
}

const LESSON_SEQUENCE_GENERIC_WORDS = new Set([
  'and',
  'course',
  'exam',
  'final',
  'for',
  'from',
  'introduction',
  'lesson',
  'midterm',
  'overview',
  'project',
  'review',
  'the',
  'with',
]);

function lessonSequenceTokens(value) {
  return (
    cleanText(value, 300)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/[a-z0-9]+/g)
      ?.map((token) => {
        if (/^(?:stellar|stars?)$/.test(token)) return 'star';
        if (/^(?:spectra|spectral|spectrum)$/.test(token)) return 'spectr';
        if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
        if (token.length > 5 && token.endsWith('es')) return token.slice(0, -2);
        if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
        return token;
      })
      .filter((token) => token.length >= 3 && !LESSON_SEQUENCE_GENERIC_WORDS.has(token)) || []
  );
}

function explicitLessonSequenceMisalignments(sessions, topics) {
  return topics.flatMap((topic, index) => {
    const expected = new Set(lessonSequenceTokens(topic));
    const actual = lessonSequenceTokens(sessions[index]?.title);
    const aligned = actual.some((token) => expected.has(token));
    return aligned ? [] : [index + 1];
  });
}

function hasExcessiveSessionTitleReuse(sessions = []) {
  const counts = new Map();
  for (const session of sessions) {
    const key = cleanText(session?.title, 160)
      .replace(/^lesson\s+\d+\s*[:.-]?\s*/i, '')
      .toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 3);
}

const ASSESSMENT_ONLY_SESSION_TITLE_RE =
  /^(?:final(?: assessment| exam(?:ination)?| test)?(?: review)?|midterm(?: exam(?:ination)?)?(?: \d+)?(?: review)?|quiz(?: \d+)?(?: review)?|problem sets?|assessment(?: \d+)?|comprehensive(?: course)?(?: evaluation| review)?|course (?:assessment|evaluation|review))$/i;
const GENERIC_SESSION_SECTION_RE =
  /^(?:application(?:s| of concepts?)?|comprehensive final(?: review)?|comprehensive review|final (?:review|synthesis)|overview|review|synthesis)$/i;

function normalizedSessionTitle(value) {
  return cleanText(value, 160)
    .replace(/^lesson\s+\d+\s*[:.-]?\s*/i, '')
    .toLowerCase();
}

function courseSubjectTitle(value) {
  return cleanText(value, 120)
    .replace(/^(?:an?\s+)?(?:introduction|intro)\s+to\s+/i, '')
    .replace(/\s+course$/i, '')
    .trim();
}

function compactBriefCourseName(value, sourceText) {
  const name = cleanText(value, 160);
  if (!isCompactCourseBrief(sourceText)) return name;
  return name.replace(/,\s+(?:an?\s+)?\d+\s*[-–—]?\s*(?:lesson|week|session|module)s?\b(?:\s+.*)?$/i, '').trim();
}

function isCompactCourseBrief(sourceText) {
  const source = String(sourceText || '').trim();
  if (!source || source.length > 1800) return false;
  return !/^\s*(?:lesson|week|session|module)\s+\d+\s*[:.)-]/im.test(source);
}

function distinctiveSectionTitles(session, usedTitles) {
  const original = normalizedSessionTitle(session?.title);
  const candidates = [];
  for (const value of asArray(session?.sectionTitles)) {
    const candidate = cleanText(value, 100)
      .replace(/^\d+(?:\.\d+)?\s*[:.-]\s*/, '')
      .replace(/^(?:advanced|review of)\s+/i, '')
      .replace(/\s+(?:overview|review)$/i, '')
      .trim();
    const key = normalizedSessionTitle(candidate);
    if (!candidate || key === original || usedTitles.has(key) || GENERIC_SESSION_SECTION_RE.test(candidate)) continue;
    if (!candidates.some((entry) => normalizedSessionTitle(entry) === key)) candidates.push(candidate);
    if (candidates.length >= 2) break;
  }
  return candidates;
}

function compactBriefLabTitle(sourceText) {
  const source = cleanText(sourceText, 1800);
  const match = source.match(
    /\b(?:an?|the)\s+((?:[a-z0-9][a-z0-9–—-]*\s+){0,4}(?:lab(?:oratory)?|studio|practicum|fieldwork))\b/i,
  );
  if (!match?.[1]) return '';
  return cleanText(match[1], 100)
    .replace(/\blaboratory\b/i, 'lab')
    .replace(/\s+/g, ' ')
    .trim();
}

function labInvestigationTitle(labTitle, subject = '') {
  let title = cleanText(labTitle, 100)
    .replace(/\b(?:laboratory|lab)\b/i, 'investigation')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^model[- ]organism investigation$/i.test(title) && subject && !/^course$/i.test(subject)) {
    title = `model-organism ${subject} investigation`;
  }
  return title.replace(/(?:^|[\s-])([a-z])/g, (match, letter) => match.replace(letter, letter.toUpperCase()));
}

function coverageDeepeningTitle(coverageTopics, ordinal, subject) {
  if (coverageTopics.length === 0) return `${subject}: evidence and application ${ordinal + 1}`;
  const topic = coverageTopics[(Math.floor(coverageTopics.length / 2) + ordinal) % coverageTopics.length];
  const focus = ['mechanisms and evidence', 'methods and applications', 'interpretation and limitations'][ordinal % 3];
  return `${topic}: ${focus}`;
}

function combineSessionTopics(first, second) {
  if (!/\sand\s/i.test(first)) return `${first} and ${second}`;
  return `${first.replace(/\sand\s(?=[^,]+$)/i, ', ')}, and ${second}`;
}

/**
 * Small models sometimes obey the requested session count by repeating early
 * titles even though their own section titles already describe distinct later
 * material. Preserve those authored subtopics and promote the first distinct
 * one into the session title. Compact briefs can also turn a named final into
 * a filler session; keep the assessment in its registry and name the teaching
 * session as a subject synthesis instead. No factual content is invented.
 */
export function repairNativeSkeletonSessionTitles(
  sessions = [],
  courseName = '',
  { compactBrief = false, coverageTopics = [], sourceText = '' } = {},
) {
  const seen = new Set();
  let repeatedTitleCount = 0;
  let assessmentTitleCount = 0;
  let fallbackOrdinal = 0;
  const subject = courseSubjectTitle(courseName) || 'Course';
  const originalTitleKeys = new Set(sessions.map((session) => normalizedSessionTitle(session?.title)).filter(Boolean));
  const promotableSubtopics = [];
  const promotableLimit = Math.min(sessions.length, Math.max(coverageTopics.length, 1));
  sessions.slice(0, promotableLimit).forEach((session, parentIndex) => {
    const parentKey = normalizedSessionTitle(session?.title);
    asArray(session?.sectionTitles).forEach((value) => {
      const title = cleanText(value, 100)
        .replace(/^\d+(?:\.\d+)?\s*[:.-]\s*/, '')
        .replace(/^(?:advanced|review of)\s+/i, '')
        .replace(/\s+(?:overview|review)$/i, '')
        .trim();
      const key = normalizedSessionTitle(title);
      if (
        !title ||
        !key ||
        key === parentKey ||
        originalTitleKeys.has(key) ||
        GENERIC_SESSION_SECTION_RE.test(title) ||
        ASSESSMENT_ONLY_SESSION_TITLE_RE.test(key) ||
        promotableSubtopics.some((entry) => entry.key === key)
      ) {
        return;
      }
      promotableSubtopics.push({ title, key, parentIndex });
    });
  });

  const namedLab = compactBrief ? compactBriefLabTitle(sourceText) : '';
  const namedLabKey = normalizedSessionTitle(namedLab);
  const sourceLabMissing = Boolean(
    namedLab &&
    !sessions.some((session) => {
      const title = normalizedSessionTitle(session?.title);
      return title === namedLabKey || (title.includes('lab') && namedLabKey.includes(title));
    }),
  );
  let sourceLabPromoted = false;
  const promotedByParent = new Map();

  const consumePromotableTitle = () => {
    while (promotableSubtopics.length > 0) {
      const candidate = promotableSubtopics.shift();
      if (seen.has(candidate.key)) continue;
      const promoted = promotedByParent.get(candidate.parentIndex) || new Set();
      promoted.add(candidate.key);
      promotedByParent.set(candidate.parentIndex, promoted);
      return candidate.title;
    }
    return '';
  };

  const repaired = sessions.map((session) => {
    const key = normalizedSessionTitle(session?.title);
    const repeated = Boolean(key && seen.has(key));
    const assessmentOnly = compactBrief && ASSESSMENT_ONLY_SESSION_TITLE_RE.test(key);
    let title = cleanText(session?.title, 160);
    let sectionTitles = session?.sectionTitles;
    if (repeated || assessmentOnly) {
      const distinctSections = distinctiveSectionTitles(session, seen);
      if (assessmentOnly && distinctSections.length >= 2) {
        title = combineSessionTopics(distinctSections[0], distinctSections[1]);
        sectionTitles = distinctSections;
      } else if (distinctSections.length > 0) {
        title = distinctSections[0];
      } else if (sourceLabMissing && !sourceLabPromoted) {
        title = labInvestigationTitle(namedLab, subject);
        sectionTitles = [title];
        sourceLabPromoted = true;
      } else {
        title = consumePromotableTitle();
        if (title) sectionTitles = [title];
      }
      if (!title || normalizedSessionTitle(title) === key) {
        title = coverageDeepeningTitle(coverageTopics, fallbackOrdinal, subject);
        sectionTitles = [title];
        fallbackOrdinal += 1;
      }
      if (repeated && normalizedSessionTitle(title) !== key) repeatedTitleCount += 1;
      if (assessmentOnly && normalizedSessionTitle(title) !== key) assessmentTitleCount += 1;
    }
    let nextKey = normalizedSessionTitle(title);
    if (seen.has(nextKey)) {
      title = consumePromotableTitle() || coverageDeepeningTitle(coverageTopics, fallbackOrdinal, subject);
      sectionTitles = [title];
      fallbackOrdinal += 1;
      nextKey = normalizedSessionTitle(title);
      if (repeated) repeatedTitleCount += 1;
    }
    seen.add(nextKey);
    return title === session?.title && sectionTitles === session?.sectionTitles
      ? session
      : { ...session, title, sectionTitles };
  });
  const finalSessions = repaired.map((session, sessionIndex) => {
    const promotedKeys = promotedByParent.get(sessionIndex);
    if (!promotedKeys?.size) return session;
    const remaining = asArray(session?.sectionTitles).filter(
      (value) => !promotedKeys.has(normalizedSessionTitle(value)),
    );
    return { ...session, sectionTitles: remaining.length > 0 ? remaining : [session.title] };
  });
  return { sessions: finalSessions, repeatedTitleCount, assessmentTitleCount };
}

/** Tolerant outer-object JSON extraction (code fences / surrounding prose). */
function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Recover a skeleton response that stopped after one or more complete items
 * in a top-level array (the observed local-model failure ends with
 * `"assessments":[{...},`). The recovery is deliberately narrow: it never
 * invents a partial object and only closes a root array after its last fully
 * closed object. Structural validation still runs in the normal parser.
 */
export function recoverTruncatedSkeletonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const source = raw.slice(start);
  const stack = [];
  let inString = false;
  let escaped = false;
  let activeTopLevelArray = false;
  let lastCompleteElementEnd = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      if (char === '[' && stack.length === 1 && stack[0] === '{') {
        activeTopLevelArray = true;
        lastCompleteElementEnd = -1;
      }
      stack.push(char);
      continue;
    }
    if (char !== '}' && char !== ']') continue;
    const expected = char === '}' ? '{' : '[';
    if (stack.at(-1) !== expected) return null;
    if (char === '}' && activeTopLevelArray && stack.length === 3 && stack[1] === '[') {
      lastCompleteElementEnd = index + 1;
    }
    stack.pop();
    if (char === ']' && activeTopLevelArray && stack.length === 1) activeTopLevelArray = false;
  }

  if (!activeTopLevelArray || stack[0] !== '{' || stack[1] !== '[' || lastCompleteElementEnd < 0) return null;
  try {
    const recovered = JSON.parse(`${source.slice(0, lastCompleteElementEnd)}]}`);
    return Array.isArray(recovered?.sessions) && recovered.sessions.length > 0 ? recovered : null;
  } catch {
    return null;
  }
}

const SKELETON_ASSESSMENT_KINDS = new Set(['graded-artifact', 'in-class', 'exam', 'oral']);

// Weak local models occasionally serialize two weighted list items into one
// assessment title, for example:
//   "midterm (20%) 2. weekly reading responses (10%)"
// Leaving that string fused is not cosmetic: the trailing "responses" noun
// makes the whole row look like a graded artifact, so the real midterm never
// receives an exam document. Split only a very narrow, high-confidence shape:
// sequential embedded list markers, an explicit percentage on every part,
// and an assessment-identity noun on every part. Ordinary titles such as
// "Project phase 2. Analysis" remain untouched.
const WEIGHTED_ASSESSMENT_IDENTITY_RE =
  /\b(?:assignments?|briefs?|case stud(?:y|ies)|discussions?|exams?|final|journals?|labs?|laborator(?:y|ies)|midterms?|oral|papers?|performances?|portfolios?|problem sets?|projects?|quiz(?:zes)?|reflections?|reports?|responses?|tests?|worksheets?)\b/i;
const EXPLICIT_ASSESSMENT_PERCENT_RE = /\(\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)/;

function splitFusedWeightedAssessmentTitle(value) {
  let text = cleanText(value, 500);
  const hasLeadingOne = /^1[.)]\s+/.test(text);
  if (hasLeadingOne) text = text.replace(/^1[.)]\s+/, '');
  const matches = [...text.matchAll(/\s+(\d{1,2})[.)]\s+/g)];
  if (matches.length === 0 || matches.some((match, index) => Number(match[1]) !== index + 2)) return [text];

  const parts = [];
  let cursor = 0;
  for (const match of matches) {
    parts.push(cleanText(text.slice(cursor, match.index), 240));
    cursor = match.index + match[0].length;
  }
  parts.push(cleanText(text.slice(cursor), 240));
  if (
    parts.length < 2 ||
    parts.some((part) => !EXPLICIT_ASSESSMENT_PERCENT_RE.test(part) || !WEIGHTED_ASSESSMENT_IDENTITY_RE.test(part))
  ) {
    return [hasLeadingOne ? `1. ${text}` : text];
  }
  return parts;
}

const SPLIT_ASSESSMENT_SOURCE_SIGNALS = [
  { title: /\bmidterm\b/i, source: /\bmidterm\b/i },
  { title: /\bfinal\s+(?:exam|examination|test)\b/i, source: /\bfinal\s+(?:exam|examination|test)\b/i },
  { title: /\bexam(?:ination)?s?\b/i, source: /\bexam(?:ination)?s?\b/i },
  { title: /\bquiz(?:zes)?\b/i, source: /\bquiz(?:zes)?\b/i },
  { title: /\blabs?\b|\blaborator(?:y|ies)\b/i, source: /\blabs?\b|\blaborator(?:y|ies)\b/i },
  { title: /\bresponses?\b/i, source: /\bresponses?\b/i },
  { title: /\bprojects?\b/i, source: /\bprojects?\b/i },
  { title: /\breflections?\b/i, source: /\breflections?\b/i },
  { title: /\b(?:papers?|essays?)\b/i, source: /\b(?:papers?|essays?)\b/i },
  { title: /\breports?\b/i, source: /\breports?\b/i },
  { title: /\bportfolios?\b/i, source: /\bportfolios?\b/i },
  { title: /\bpresentations?\b|\boral\b|\bperformances?\b/i, source: /\bpresentations?\b|\boral\b|\bperformances?\b/i },
  { title: /\bproblem sets?\b/i, source: /\bproblem sets?\b/i },
  {
    title: /\b(?:journals?|worksheets?|assignments?|briefs?)\b/i,
    source: /\b(?:journals?|worksheets?|assignments?|briefs?)\b/i,
  },
];

function sourceSupportsSplitAssessment(title, sourceText) {
  if (typeof sourceText !== 'string' || !sourceText.trim()) return true;
  const signals = SPLIT_ASSESSMENT_SOURCE_SIGNALS.filter((signal) => signal.title.test(title));
  return signals.length === 0 || signals.some((signal) => signal.source.test(sourceText));
}

function explicitAssessmentWeight(title, fallback) {
  const matched = cleanText(title, 240).match(EXPLICIT_ASSESSMENT_PERCENT_RE);
  const value = Number(matched?.[1]);
  if (Number.isFinite(value) && value > 0 && value <= 100) return Math.round(value);
  return Number.isFinite(fallback) && fallback > 0 && fallback <= 100 ? Math.round(fallback) : null;
}

function distributeWeightPercent(count) {
  const safeCount = Math.max(1, count);
  const base = Math.floor(100 / safeCount);
  let remainder = 100 - base * safeCount;
  return Array.from({ length: safeCount }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return value;
  });
}

function synthesizeSessionAssessments(sessions) {
  const weights = distributeWeightPercent(sessions.length);
  const stems = ['analysis', 'application', 'comparison', 'interpretation'];
  return sessions.map((session, index) => ({
    id: `a${index + 1}`,
    title: `${session.title} ${stems[index % stems.length]}`,
    kind: 'graded-artifact',
    dueSession: session.order,
    weightPct: weights[index],
  }));
}

export function recoverMissingSkeletonResources(skeleton) {
  if (
    skeleton?.sourceNamesResources !== true ||
    asArray(skeleton.resources).length + asArray(skeleton.readings).length > 0
  ) {
    return { skeleton, recoveredCount: 0 };
  }
  const recovered = asArray(skeleton.sessions).map((session, index) => ({
    id: `m${index + 1}`,
    title: `Course source materials for ${cleanText(session?.title, 140) || `Lesson ${index + 1}`}`,
    dueSession: Number.isInteger(session?.order) && session.order > 0 ? session.order : index + 1,
    recovered: true,
    reviewOnly: true,
  }));
  return {
    skeleton: {
      ...skeleton,
      resources: recovered,
    },
    recoveredCount: recovered.length,
  };
}

// ── v0.14.7 WS-B1: the brief-side resource signal ───────────────────────────
// The prose path's supportingResources handling speaks a concrete-materials
// vocabulary: the column contract names "readings, articles, videos, textbook
// chapters, and other materials" extracted from the syllabus (prompts.js
// DEFAULT_COLUMN_DEFS.supportingResources), and the lab-asset classifier keys
// on session-materials nouns — kits, manuals, handouts (requiredLabAssets.js).
// This regex is that same signal applied to the SOURCE text: deliberately
// conservative (bare topic words like "software" or "templates" stay out —
// a C++ brief must not trip it). A false positive only costs one run's
// native savings (the loud prose fallback); a false negative ships the
// "unresolved source placeholder" P1 class, 66 findings in the last
// side-by-side round.
const BRIEF_RESOURCE_CUE_RE =
  /\b(?:hand-?outs?|worksheets?|problem sets?|labs?|laboratory|kits?|data ?sets?|starter (?:code|notebooks?|files?)|course (?:packets?|readers?)|case packets?|textbooks?|lecture slides?|slide decks?|study guides?|(?:required|assigned) (?:readings?|texts?))\b/i;

/** True when the source brief/course text names supporting resources or
 *  materials the skeleton is expected to transcribe. */
export function briefNamesResources(sourceText) {
  return BRIEF_RESOURCE_CUE_RE.test(String(sourceText || ''));
}

// ── B1: Pass A parser ───────────────────────────────────────────────────────

/**
 * Parse the Pass A skeleton response. Defensive: ids defaulted from order,
 * orders normalized to 1..N, dueSession clamped into range, kinds outside
 * the registry's closed set dropped (the derive-time classifier decides).
 * Throws NativeAuthoringError on anything structurally unusable — the
 * caller turns that into the loud prose fallback.
 *
 * v0.14.7 WS-B1: `sourceText` (when provided) stamps the skeleton with the
 * brief-side resource signal (`sourceNamesResources`) so the compile-stage
 * lint in resolveNativeAssembly can compare what the brief names against
 * what Pass A transcribed — the seam itself never sees the brief.
 *
 * @returns {{ course: { name, term, goals: string[] },
 *   sessions: [{ id, order, title, sectionTitles: string[] }],
 *   assessments: [{ id, title, kind?, dueSession, weightPct? }],
 *   readings: [{ id, title, dueSession }],
 *   resources: [{ id, title, dueSession }],
 *   sourceNamesResources?: boolean }}
 */
export function parseNativeSkeletonResponse(text, { expectedLessons = null, sourceText = null } = {}) {
  const complete = extractJsonObject(text);
  const parsed = complete || recoverTruncatedSkeletonObject(text);
  const recoveredFromTruncation = !complete && Boolean(parsed);
  if (!parsed) throw new NativeAuthoringError('skeleton-unparseable', 'Pass A returned no parseable JSON object');
  if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    throw new NativeAuthoringError('skeleton-no-sessions', 'Pass A skeleton has no sessions array');
  }

  let sessions = parsed.sessions
    .map((entry, index) => ({
      order: Number.isInteger(entry?.order) && entry.order > 0 ? entry.order : index + 1,
      title: cleanText(entry?.title, 160),
      sectionTitles: cleanSectionTitles(entry?.sectionTitles),
      sourceIndex: index,
    }))
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex)
    .map((entry, index) => ({
      // Orders re-normalized to 1..N after the sort so duplicate/gapped
      // model orders cannot break the lesson-N ↔ sN mapping.
      id: `s${index + 1}`,
      order: index + 1,
      title: entry.title || `Lesson ${index + 1}`,
      sectionTitles: entry.sectionTitles,
    }));

  let compactSessionCountRecovery = 0;
  if (Number.isInteger(expectedLessons) && expectedLessons > 0 && sessions.length < expectedLessons) {
    const missingCount = expectedLessons - sessions.length;
    if (isCompactCourseBrief(sourceText) && missingCount <= 2) {
      const start = sessions.length;
      sessions = [
        ...sessions,
        ...Array.from({ length: missingCount }, (_, index) => ({
          id: `s${start + index + 1}`,
          order: start + index + 1,
          // This deliberate parser-only marker is consumed by the compact
          // title repair below. It can never reach the learner package.
          title: `Assessment ${start + index + 1}`,
          sectionTitles: [],
        })),
      ];
      compactSessionCountRecovery = missingCount;
    }
  }

  const titledSessions = sessions.filter((session) => !/^Lesson \d+$/.test(session.title)).length;
  if (titledSessions === 0) {
    throw new NativeAuthoringError('skeleton-untitled', 'Pass A skeleton has no titled sessions');
  }
  if (Number.isInteger(expectedLessons) && expectedLessons > 0 && sessions.length < expectedLessons) {
    throw new NativeAuthoringError(
      'skeleton-incomplete',
      `Pass A skeleton has ${sessions.length} of ${expectedLessons} expected sessions`,
    );
  }
  let sessionSequenceRecovery = null;
  const sourceLessonSequence = recoverExplicitLessonSequence(sourceText, sessions.length);
  const repeatedSessionTitles = hasExcessiveSessionTitleReuse(sessions);
  const misalignedOrders =
    sourceLessonSequence.length === sessions.length
      ? explicitLessonSequenceMisalignments(sessions, sourceLessonSequence)
      : [];
  if (sourceLessonSequence.length === sessions.length && (repeatedSessionTitles || misalignedOrders.length >= 2)) {
    const authoredTitles = sessions.map((session) => session.title);
    sessions = sessions.map((session, index) => ({
      ...session,
      title: sourceLessonSequence[index],
      sectionTitles: [sourceLessonSequence[index]],
    }));
    sessionSequenceRecovery = {
      kind: 'explicit-source-lesson-sequence',
      recoveredCount: sessions.length,
      reason: repeatedSessionTitles ? 'repeated-titles' : 'ordered-topic-misalignment',
      authoredTitles,
      misalignedOrders,
    };
  } else if (sourceLessonSequence.length === 0) {
    const titleRepair = repairNativeSkeletonSessionTitles(
      sessions,
      compactBriefCourseName(parsed?.course?.name, sourceText),
      {
        compactBrief: isCompactCourseBrief(sourceText),
        coverageTopics: extractExplicitCoverageTopics(sourceText),
        sourceText,
      },
    );
    if (titleRepair.repeatedTitleCount > 0 || titleRepair.assessmentTitleCount > 0) {
      const authoredTitles = sessions.map((session) => session.title);
      sessions = titleRepair.sessions;
      sessionSequenceRecovery = {
        kind: 'model-authored-distinct-subtopics',
        recoveredCount: titleRepair.repeatedTitleCount + titleRepair.assessmentTitleCount,
        reason: titleRepair.repeatedTitleCount > 0 ? 'repeated-titles' : 'assessment-filler-title',
        authoredTitles,
        misalignedOrders: [],
        ...(compactSessionCountRecovery > 0 ? { countRecovered: compactSessionCountRecovery } : {}),
      };
    }
  }

  const clampDue = (value) => {
    const due = Number(value);
    if (!Number.isFinite(due)) return 1;
    return Math.max(1, Math.min(sessions.length, Math.round(due)));
  };
  const resolveDueSession = (entry, title) => {
    if (Number.isFinite(Number(entry?.dueSession))) return clampDue(entry.dueSession);
    const itemTokens = new Set(lessonSequenceTokens(title));
    let bestOrder = 1;
    let bestOverlap = 0;
    sessions.forEach((session) => {
      const overlap = lessonSequenceTokens(session?.title).filter((token) => itemTokens.has(token)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestOrder = session.order;
      }
    });
    return bestOverlap > 0 ? bestOrder : 1;
  };

  const assessmentListRecovery = {
    fusedEntryCount: 0,
    recoveredItemCount: 0,
    unsupportedItemCount: 0,
  };
  const parsedAssessments = asArray(parsed.assessments)
    .flatMap((entry, index) => {
      // v0.15.187: Pass A transcribes assessments from numbered prose, so
      // titles arrive as "Title: 1. Title" echoes — dedupe at birth (the
      // registry title is the package-wide identity).
      const rawTitle = cleanText(entry?.title, 500);
      if (!rawTitle) return [];
      const titleParts = splitFusedWeightedAssessmentTitle(rawTitle);
      const wasFused = titleParts.length > 1;
      if (wasFused) assessmentListRecovery.fusedEntryCount += 1;
      const supportedParts = wasFused
        ? titleParts.filter((title) => {
            const supported = sourceSupportsSplitAssessment(title, sourceText);
            if (!supported) assessmentListRecovery.unsupportedItemCount += 1;
            return supported;
          })
        : titleParts;
      if (wasFused) assessmentListRecovery.recoveredItemCount += supportedParts.length;
      const entryWeight = Number(entry?.weightPct);
      const baseId = cleanText(entry?.id, 18) || `a${index + 1}`;
      return supportedParts.flatMap((part, partIndex) => {
        const title = dedupeNumberedAssessmentEcho(part);
        if (!title) return [];
        const weight = explicitAssessmentWeight(title, entryWeight);
        return [
          {
            id: wasFused ? `${baseId}.${partIndex + 1}` : baseId,
            title,
            ...(wasFused
              ? { kind: classifyAssessmentKind(title) }
              : SKELETON_ASSESSMENT_KINDS.has(entry?.kind)
                ? { kind: entry.kind }
                : {}),
            dueSession: clampDue(entry?.dueSession),
            ...(weight !== null ? { weightPct: weight } : {}),
          },
        ];
      });
    })
    .filter(Boolean);
  // A recovered response has an incomplete assessment registry by
  // construction. Use the compiler's complete deterministic cadence instead
  // of treating an arbitrary prefix as the whole grading plan.
  const assessments =
    !recoveredFromTruncation && parsedAssessments.length > 0
      ? parsedAssessments
      : synthesizeSessionAssessments(sessions);

  const parsedReadings = asArray(parsed.readings)
    .map((entry, index) => {
      const title = cleanText(entry?.title, 240);
      if (!title) return null;
      return { id: cleanText(entry?.id, 24) || `r${index + 1}`, title, dueSession: resolveDueSession(entry, title) };
    })
    .filter(Boolean);
  const recoveredReadings =
    parsedReadings.length === 0 ? recoverExplicitNamedReadings(sourceText, sessions.length) : [];
  const readings = parsedReadings.length > 0 ? parsedReadings : recoveredReadings;

  // v0.14.7 WS-B1: per-session supporting resources/materials — same shape
  // and discipline as readings (verbatim titles, clamped dueSession, ids
  // defaulted "m1"… from order).
  const resources = asArray(parsed.resources)
    .map((entry, index) => {
      const title = cleanText(entry?.title, 240);
      if (!title) return null;
      return { id: cleanText(entry?.id, 24) || `m${index + 1}`, title, dueSession: resolveDueSession(entry, title) };
    })
    .filter(Boolean);

  return {
    course: {
      name: compactBriefCourseName(parsed.course?.name, sourceText) || 'Untitled Course',
      term: cleanText(parsed.course?.term, 24) || 'TBD',
      goals: asArray(parsed.course?.goals)
        .map((goal) => cleanText(goal, 160))
        .filter(Boolean)
        .slice(0, 8),
    },
    sessions,
    assessments,
    readings,
    resources,
    ...(recoveredFromTruncation
      ? {
          responseRecovery: {
            kind: 'closed-complete-top-level-array-prefix',
            assessmentCadence: 'synthesized-per-session',
          },
        }
      : {}),
    ...(sessionSequenceRecovery ? { sessionSequenceRecovery } : {}),
    ...(recoveredReadings.length > 0
      ? {
          readingRecovery: {
            kind: 'explicit-source-reading-list',
            recoveredCount: recoveredReadings.length,
          },
        }
      : {}),
    ...(assessmentListRecovery.fusedEntryCount > 0 ? { assessmentListRecovery } : {}),
    // Only stamped when the caller supplied the brief text — absent means
    // "signal unknown" and the missing-resources lint stays un-armed (old
    // call sites and stashed skeletons keep today's behavior exactly).
    ...(typeof sourceText === 'string' && sourceText.length > 0
      ? { sourceNamesResources: briefNamesResources(sourceText) }
      : {}),
  };
}

// ── Skeleton → wire course map ──────────────────────────────────────────────

/** 'lesson-N' wire id for the skeleton session with order N. */
export function sessionLessonId(session) {
  return `lesson-${session.order}`;
}

/** Split items into `parts` contiguous slices, earlier slices larger. */
function distributeAcross(items, parts) {
  const list = asArray(items);
  const buckets = Array.from({ length: Math.max(1, parts) }, () => []);
  if (list.length === 0) return buckets;
  const per = Math.ceil(list.length / buckets.length);
  list.forEach((item, index) => {
    buckets[Math.min(buckets.length - 1, Math.floor(index / per))].push(item);
  });
  return buckets;
}

/**
 * Build the canonical wire course map from the skeleton plus (optional)
 * Pass B authorship keyed by 'lesson-N'. Section cells carry lean-style
 * atoms — deriveCourseGraphFromCourseMap consumes arrays directly, and the
 * graph render (expandLeanSectionField) produces the canonical prose cells.
 * Without Pass B payloads the map is the structural skeleton render
 * (titles, sections, assessments, readings) the linker and the workspace
 * preview run on while Pass B authors content.
 */
export function buildNativeWireMap(skeleton, passBBySession = {}) {
  const explicitWeightSuffix = (assessment) =>
    Number.isFinite(assessment.weightPct) && !/\d{1,3}\s*%/.test(assessment.title)
      ? `${assessment.title} (${assessment.weightPct}%)`
      : assessment.title;

  const lessons = skeleton.sessions.map((session) => {
    const authored = passBBySession[sessionLessonId(session)] || {};
    const sectionTitles = session.sectionTitles.length > 0 ? session.sectionTitles : [session.title];
    const outcomeSlices = distributeAcross(authored.outcomes, sectionTitles.length);
    const asyncSlices = distributeAcross(authored.asyncActivities, sectionTitles.length);
    const syncSlices = distributeAcross(authored.syncActivities, sectionTitles.length);
    const sessionAssessments = skeleton.assessments.filter((entry) => entry.dueSession === session.order);
    const sessionReadings = skeleton.readings.filter((entry) => entry.dueSession === session.order);
    // v0.14.7 WS-B1: transcribed supporting materials ride the first
    // section's supportingResources cell (same first-section convention as
    // assessments/readings). Recovery markers are diagnostic only: when Pass A
    // failed to transcribe the named materials, leaking invented resource
    // titles into every exported artifact is worse than leaving the compiler's
    // honest class-notes fallback in place.
    const sessionResources = asArray(skeleton.resources).filter(
      (entry) => entry.dueSession === session.order && entry.reviewOnly !== true,
    );

    const sections = sectionTitles.map((title, sectionIndex) => ({
      topicSection: `${session.order}.${sectionIndex + 1}: ${title}`,
      ...(sectionIndex === 0 && authored.goal ? { learningGoals: [authored.goal] } : {}),
      ...(outcomeSlices[sectionIndex].length > 0 ? { learningObjectives: outcomeSlices[sectionIndex] } : {}),
      // Assessments live on the first section — Pass B's outcomes weight the
      // first section heaviest (contiguous slices), so the derive-time
      // "section assessments assess section outcomes" assumption holds.
      ...(sectionIndex === 0 && sessionAssessments.length > 0
        ? { weeklyAssessments: sessionAssessments.map(explicitWeightSuffix) }
        : {}),
      ...(asyncSlices[sectionIndex].length > 0 ? { asyncActivities: asyncSlices[sectionIndex] } : {}),
      ...(syncSlices[sectionIndex].length > 0 ? { syncActivities: syncSlices[sectionIndex] } : {}),
      ...(sectionIndex === 0 && sessionReadings.length > 0
        ? { readings: sessionReadings.map((reading) => reading.title) }
        : {}),
      ...(sectionIndex === 0 && sessionResources.length > 0
        ? { supportingResources: sessionResources.map((resource) => resource.title) }
        : {}),
    }));

    return {
      title: /^lesson\s+\d+\s*[:.-]/i.test(session.title) ? session.title : `Lesson ${session.order}: ${session.title}`,
      sections,
    };
  });

  return {
    courseName: skeleton.course.name,
    semester: skeleton.course.term || 'TBD',
    ...(skeleton.course.goals.length > 0 ? { learningOutcomes: skeleton.course.goals } : {}),
    lessons,
  };
}

// ── Pass A → handoff to the deliverables stage ──────────────────────────────
// useGeneration owns the syllabus; useDeliverables owns Pass B. The skeleton
// crosses hooks through this explicit single-run stash (take = read & clear),
// keyed by course name so a stale skeleton can never attach to a different
// course. A native-flagged run that finds no stash falls back LOUDLY.
let stashedSkeleton = null;

export function stashNativeSkeleton(skeleton) {
  stashedSkeleton = skeleton || null;
}

export function takeNativeSkeleton(courseMap) {
  const skeleton = stashedSkeleton;
  stashedSkeleton = null;
  if (!skeleton) return null;
  if (
    cleanText(courseMap?.courseName).toLowerCase() !== cleanText(skeleton.course?.name).toLowerCase() ||
    (courseMap?.lessons || []).length !== skeleton.sessions.length
  ) {
    return null; // a different course map reached generation — never mis-merge
  }
  return skeleton;
}

// ── B2: Pass B prompt + parser ──────────────────────────────────────────────

/**
 * Pass B batch prompt: the EXISTING kernel contract (buildLessonKernelPrompt
 * — schema, item plan, romanization, cache-friendly system prefix) extended
 * with the native authoring addition (goal/outcomes/async/sync) and the
 * CONTENT-SOURCED list for genome-covered ride-along lessons.
 */
export function buildNativePassBPrompt(wireMap, lessonIndices, options = {}) {
  const base = buildLessonKernelPrompt(wireMap, lessonIndices, {
    questionsPerLesson: options.questionsPerLesson,
    includeCourseLevel: options.includeCourseLevel === true,
    sourceBrief: options.sourceBrief,
    instructorProvidedFacts: options.instructorProvidedFacts,
  });
  const contentSourced = asArray(options.contentSourcedLessonIds).filter(Boolean);
  const recoveryAttempt = Number(options.recoveryAttempt || 0);
  const expectedLessonIds = asArray(options.expectedLessonIds).filter(Boolean);
  const recoveryLessonIds =
    expectedLessonIds.length > 0 ? expectedLessonIds : base.lessons.map((lesson) => lesson.lessonId);
  const recoveryLines =
    recoveryAttempt > 0
      ? [
          `RECOVERY RETRY ${recoveryAttempt}: the previous Pass B response missed required lesson kernels.`,
          `Return only strict JSON for these lesson ids: ${recoveryLessonIds.join(', ')}.`,
          'For each listed lesson, include complete kernel atoms: 5-8 facts, at least 4 keyTerms with definitions/examples/misconceptions/corrections, one scenario, one discussionPrompt, one assignmentCore, 3 slideContent entries, and the exact requested mc item count.',
          'Also include native authoring fields for each listed lesson: goal, 2-4 outcomes, 1-2 async activities, and 1-2 sync activities.',
          'Do not summarize this request, apologize, or return a partial acknowledgement. Missing kernel atoms make the lesson fall back to template.',
        ]
      : [];
  const systemPrompt = [base.systemPrompt, NATIVE_PASS_B_AUTHORING_ADDITION].join('\n');
  const userPrompt = [
    base.userPrompt,
    ...(contentSourced.length > 0
      ? [`CONTENT-SOURCED lessons (goal/outcomes/async/sync ONLY): ${contentSourced.join(', ')}`]
      : []),
    ...recoveryLines,
  ].join('\n');
  return {
    ...base,
    systemPrompt,
    userPrompt,
    contentSourcedLessonIds: contentSourced,
    recoveryAttempt,
    approxInputTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
  };
}

function cleanAtomList(value, { maxItems, maxChars }) {
  return asArray(value)
    .map((atom) => cleanText(atom, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * Parse one Pass B batch. The kernel half REUSES parseLessonKernelResponse
 * verbatim (every keyTerm/mc lint, the out-of-chunk lessonId rejection of
 * the v0.14.1 guard); the authoring half parses goal/outcomes/async/sync
 * with the same out-of-chunk discipline. Kernel payloads returned for
 * CONTENT-SOURCED lessons are dropped — the genome is never displaced.
 *
 * @returns {{ kernels: object, authored: object, issues: Array, courseLevel: object|null }}
 */
export function parseNativePassBResponse(text, { prompt, expectedLessonIds, contentSourcedLessonIds = [] } = {}) {
  const expected = new Set(asArray(expectedLessonIds).filter(Boolean));
  const contentSourced = new Set(asArray(contentSourcedLessonIds).filter(Boolean));
  const issues = [];

  const kernelResult = parseLessonKernelResponse(text, { prompt, expectedLessonIds });
  const kernels = {};
  if (kernelResult) {
    for (const [lessonId, payload] of Object.entries(kernelResult.lessons)) {
      if (contentSourced.has(lessonId)) {
        issues.push({ lessonId, surface: 'lesson', problems: ['content-sourced-kernel-dropped'] });
        continue; // augment/displace: genome content is never displaced
      }
      kernels[lessonId] = payload;
    }
    // CONTENT-SOURCED lessons legitimately carry no kernel atoms — their
    // 'all-atoms-linted-out' rows are contract compliance, not defects.
    issues.push(
      ...kernelResult.issues.filter(
        (issue) => !(contentSourced.has(issue.lessonId) && issue.reason === 'all-atoms-linted-out'),
      ),
    );
  }

  const authored = {};
  const parsed = extractJsonObject(text);
  for (const entry of asArray(parsed?.lessons)) {
    const lessonId = cleanText(entry?.lessonId, 24);
    if (!lessonId) continue;
    if (expected.size > 0 && !expected.has(lessonId)) {
      issues.push({ lessonId, surface: 'authoring', problems: ['out-of-chunk-lesson-id'] });
      continue;
    }
    const languageContamination = detectForeignLanguageTeachingContent({
      courseIdentity: prompt?.courseName,
      text: JSON.stringify(entry),
    });
    if (languageContamination) {
      issues.push({
        lessonId,
        surface: 'authoring',
        reason: 'foreign-language-contamination',
        problems: [`foreign-language-contamination:${languageContamination.languageId}`],
      });
      continue;
    }
    const targetLanguagePresence = assessTargetLanguagePresence({
      courseIdentity: prompt?.courseName,
      text: JSON.stringify(entry),
    });
    if (!targetLanguagePresence.complete) {
      issues.push({
        lessonId,
        surface: 'authoring',
        reason: 'target-language-missing',
        problems: targetLanguagePresence.missing.map(
          (missing) => `target-language-missing:${targetLanguagePresence.languageId}:${missing}`,
        ),
      });
      continue;
    }
    const outcomes = cleanAtomList(entry?.outcomes ?? entry?.oc, { maxItems: 8, maxChars: 180 });
    const goal = cleanText(entry?.goal, 140);
    const asyncActivities = cleanAtomList(entry?.async ?? entry?.asyncActivities, { maxItems: 4, maxChars: 160 });
    const syncActivities = cleanAtomList(entry?.sync ?? entry?.syncActivities, { maxItems: 4, maxChars: 160 });
    if (outcomes.length === 0 && !goal && asyncActivities.length === 0 && syncActivities.length === 0) {
      issues.push({ lessonId, surface: 'authoring', problems: ['no-authoring-fields'] });
      continue;
    }
    authored[lessonId] = { goal, outcomes, asyncActivities, syncActivities };
  }

  return {
    kernels,
    authored,
    issues,
    repairs: kernelResult?.repairs || [],
    courseLevel: kernelResult?.courseLevel || null,
  };
}

// ── Assembly ────────────────────────────────────────────────────────────────

/**
 * skeleton + Pass B authorship → CourseGraph (EXISTING schema, by way of the
 * canonical wire map + deriveCourseGraphFromCourseMap, so registry ids,
 * kind classification, weight allocation, and the render↔derive round trip
 * are the prose path's own machinery). The graph is marked
 * authoredBy: 'native' for B4 id stability; the walk-test invariant
 * (validateCourseGraph) is enforced here — an invalid assembly throws the
 * typed error and the caller falls back loudly.
 *
 * @returns {{ graph, courseMap }} courseMap = renderCourseMapFromGraph(graph)
 */
export function assembleNativeCourseGraph({ skeleton, passBBySession = {} }) {
  if (!skeleton || !Array.isArray(skeleton.sessions) || skeleton.sessions.length === 0) {
    throw new NativeAuthoringError('assembly-no-skeleton', 'Native assembly called without a usable skeleton');
  }
  const wireMap = buildNativeWireMap(skeleton, passBBySession);
  const graph = deriveCourseGraphFromCourseMap(wireMap);
  graph.authoredBy = 'native';
  const validation = validateCourseGraph(graph);
  if (!validation.valid) {
    throw new NativeAuthoringError(
      'assembly-invalid-graph',
      `Native assembly produced an invalid graph: ${validation.issues
        .slice(0, 3)
        .map((issue) => issue.code)
        .join(', ')}`,
    );
  }
  return { graph, courseMap: renderCourseMapFromGraph(graph) };
}

function cellAtoms(value, { preserveString = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((atom) => cleanText(atom, 500).replace(/^\d+[.)]\s+/, '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    const text = cleanText(value, 1000);
    if (!text) return [];
    if (preserveString) return [text];
    return text
      .split(/;|\n/)
      .map((atom) => cleanText(atom, 500).replace(/^\d+[.)]\s+/, ''))
      .filter(Boolean);
  }
  return [];
}

function mergeCellAtoms(...values) {
  return uniqueStrings(
    values.flatMap((value) => cellAtoms(value)),
    10,
  );
}

function mergeNativeSourceSurfaces(projectedCourseMap, nativeCourseMap) {
  const projectedLessons = asArray(projectedCourseMap?.lessons);
  const nativeLessons = asArray(nativeCourseMap?.lessons);
  return {
    ...projectedCourseMap,
    lessons: projectedLessons.map((lesson, lessonIndex) => {
      const nativeLesson = nativeLessons[lessonIndex] || {};
      const nativeSections = asArray(nativeLesson.sections);
      return {
        ...lesson,
        sections: asArray(lesson.sections).map((section, sectionIndex) => {
          const nativeSection = nativeSections[sectionIndex] || {};
          const sectionRest = { ...section };
          delete sectionRest.supportingResources;
          delete sectionRest.readings;
          const readings = cellAtoms(nativeSection.readings, { preserveString: true });
          const supportingResources = mergeCellAtoms(nativeSection.supportingResources);
          return {
            ...sectionRest,
            ...(readings.length > 0 ? { readings } : {}),
            ...(supportingResources.length > 0 ? { supportingResources } : {}),
          };
        }),
      };
    }),
  };
}

function projectNativeCourseMapThroughCourseIR(courseMap) {
  const courseIR = buildCourseIRFromCourseMap(courseMap);
  const validation = validateCourseIR(courseIR);
  if (!validation.valid) {
    return {
      ok: false,
      code: 'curriculumv1-invalid-native-assembly',
      validation,
      courseIR: validation.ir,
      reason: `CurriculumV1 validation failed before compile: ${validation.issues
        .filter((issue) => issue.severity === 'blocker')
        .slice(0, 3)
        .map((issue) => issue.code)
        .join(', ')}`,
    };
  }

  const projection = courseIRToCourseGraph(validation.ir);
  const projectedCourseMap = mergeNativeSourceSurfaces(projection.courseMap, courseMap);
  const graph = attachEnrichmentToGraph(
    deriveCourseGraphFromCourseMap(projectedCourseMap),
    projection.enrichmentOverlay,
  );
  graph.authoredBy = 'courseir-v1';
  graph.courseIR = {
    ...(projection.graph.courseIR || {}),
    stats: validation.stats,
    nativeAssembly: {
      source: 'native-wire-map',
      projectedThrough: 'curriculumv1',
    },
  };

  const graphValidation = validateCourseGraph(graph);
  if (!graphValidation.valid) {
    return {
      ok: false,
      code: 'curriculumv1-graph-invalid-native-assembly',
      validation,
      graphValidation,
      courseIR: validation.ir,
      courseMap: projectedCourseMap,
      graph,
      reason: `CurriculumV1 graph validation failed before compile: ${graphValidation.issues
        .slice(0, 3)
        .map((issue) => issue.code)
        .join(', ')}`,
    };
  }

  return {
    ok: true,
    graph,
    courseMap: renderCourseMapFromGraph(graph),
    courseIR: validation.ir,
    courseIRValidation: validation,
    nativeCourseIR: {
      code: 'validated-native-courseir',
      source: 'curriculumv1',
      stats: validation.stats,
    },
  };
}

function repairDegenerateNativeGraphWithCourseIR({ courseMap, reason }) {
  const repair = repairNativeFallbackWithCurriculumV1({
    fallbackMap: courseMap,
    columns: [],
    lessonFilter: null,
  });
  if (!repair.ok) return null;
  return {
    ok: true,
    graph: repair.graph,
    courseMap: repair.courseMap,
    courseIR: repair.courseIR,
    courseIRValidation: repair.validation,
    nativeRepair: repair.graph.nativeRepair,
    repaired: true,
    repairReason: reason,
  };
}

// ── Degenerate-skeleton gate + the compile-stage fallback seam ──────────────
// v0.14.5 hotfix (round 2026-06-12T04-52 live-only failure): Pass A obeyed
// HARD TRACEABILITY and transcribed ONE named assessment for a 15-lesson
// course; assembly faithfully carried the degenerate registry into the
// graph, and the compiler's semantic contract then BLOCKED compilation
// (assessmentCoverage blockers) with a throw nothing caught — a silent
// ten-minute hang instead of a recoverable native repair. Two rules die here:
//  - a skeleton whose assembled registry carries fewer assessments than
//    sessions is NOT a usable assessment plan (the prose path authors 2-4
//    atoms per lesson; the contract gate requires per-lesson coverage);
//  - recoverable native failures between assembly and compile are repaired
//    through CurriculumV1 before any prose fallback is allowed.

/** True when an assembled native graph cannot satisfy the compiler's
 *  per-lesson assessment coverage contract (assessments < sessions). */
export function isDegenerateNativeGraph(graph) {
  const sessionCount = (graph?.sessions || []).length;
  const assessmentCount = (graph?.assessments || []).length;
  return sessionCount > 0 && assessmentCount < sessionCount;
}

/**
 * The compile-stage decision seam (pure, unit-testable): assemble the
 * skeleton + Pass B authorship and gate the result.
 *
 * @returns {{ ok: true, graph, courseMap }} healthy or CourseIR-repaired
 *   assembly, OR
 *   {{ ok: false, code, reason, fallbackMap }} — the caller MUST emit
 *   'nativeAuthoringFellBack' with `reason` and compile through the prose
 *   path only after CurriculumV1 repair cannot recover the graph.
 */
export function resolveNativeAssembly({ skeleton, passBBySession = {} }) {
  try {
    const resourceRecovery = recoverMissingSkeletonResources(skeleton);
    const workingSkeleton = resourceRecovery.skeleton;
    const { graph, courseMap } = assembleNativeCourseGraph({ skeleton: workingSkeleton, passBBySession });
    if (isDegenerateNativeGraph(graph)) {
      const assessmentCount = (graph.assessments || []).length;
      const reason = `degenerate-skeleton (${assessmentCount} assessment${assessmentCount === 1 ? '' : 's'} for ${graph.sessions.length} lessons)`;
      const repaired = repairDegenerateNativeGraphWithCourseIR({ courseMap, reason });
      if (repaired) return repaired;
      return {
        ok: false,
        code: 'degenerate-skeleton',
        reason,
        fallbackMap: courseMap,
      };
    }
    const sourceTruth = projectNativeCourseMapThroughCourseIR(courseMap);
    if (!sourceTruth.ok) {
      const repaired = repairDegenerateNativeGraphWithCourseIR({
        courseMap,
        reason: sourceTruth.code || 'curriculumv1-invalid-native-assembly',
      });
      if (repaired) return repaired;
      return {
        ok: false,
        code: sourceTruth.code || 'curriculumv1-invalid-native-assembly',
        reason: sourceTruth.reason || 'CurriculumV1 validation failed before compile.',
        fallbackMap: courseMap,
      };
    }
    return {
      ok: true,
      graph: sourceTruth.graph,
      courseMap: sourceTruth.courseMap,
      courseIR: sourceTruth.courseIR,
      courseIRValidation: sourceTruth.courseIRValidation,
      nativeCourseIR: sourceTruth.nativeCourseIR,
      ...(resourceRecovery.recoveredCount > 0
        ? { resourceRecovery: { code: 'missing-resources-recovered', recoveredCount: resourceRecovery.recoveredCount } }
        : {}),
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      ok: false,
      code: error instanceof NativeAuthoringError ? error.code : 'assembly-error',
      reason: error?.message || 'native assembly failed',
      fallbackMap: null,
    };
  }
}

// ── B4: stable-id matching on re-derivation ─────────────────────────────────

function normalizedTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^lesson\s+\d+\s*[:.-]\s*/, '')
    .replace(/\s+→\s+.*$/, '');
}

function buildIdRemap(oldEntities, newEntities, keyOf) {
  const remap = new Map();
  const oldByKey = new Map();
  for (const entity of oldEntities) {
    const key = keyOf(entity);
    if (key && !oldByKey.has(key)) oldByKey.set(key, entity);
  }
  const claimedOldIds = new Set();
  for (const entity of newEntities) {
    const match = oldByKey.get(keyOf(entity));
    if (match && !claimedOldIds.has(match.id) && match.id !== entity.id) {
      remap.set(entity.id, match.id);
      claimedOldIds.add(match.id);
    } else if (match && match.id === entity.id) {
      claimedOldIds.add(match.id);
    }
  }
  // Collision safety: a new entity whose UNMATCHED id equals an old id now
  // claimed by a different entity must move aside (fresh deterministic id).
  let freshOrdinal = 0;
  for (const entity of newEntities) {
    if (remap.has(entity.id)) continue;
    const claimedElsewhere = claimedOldIds.has(entity.id) && remap.size > 0 && [...remap.values()].includes(entity.id);
    if (claimedElsewhere) {
      freshOrdinal += 1;
      remap.set(entity.id, `${entity.id}-new${freshOrdinal}`);
    }
  }
  return remap;
}

function remapId(remap, id) {
  return remap.get(id) || id;
}

function normalizedResourceKey(resource = {}) {
  const text = cleanText(resource.url || resource.doi || resource.citation || resource.title);
  const url = text.match(/https?:\/\/[^\s),;\]]+/i)?.[0]?.replace(/[.,;:]+$/g, '');
  if (url) return url.toLowerCase();
  const doi = text.match(/(?:doi:\s*|doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[1];
  if (doi) return doi.toLowerCase();
  return cleanText(resource.citation || resource.title || resource.url || resource.doi)
    .toLowerCase()
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ');
}

const SOURCE_BACKED_RESOURCE_ORIGINS = new Set([
  'genome',
  'genome-prerequisite',
  'openalex',
  'openlibrary',
  'openstax',
  'source-finder',
]);

function isSourceBackedResource(resource = {}) {
  const origin = cleanText(resource.origin).toLowerCase();
  const provider = cleanText(resource.provider).toLowerCase();
  return SOURCE_BACKED_RESOURCE_ORIGINS.has(origin) || SOURCE_BACKED_RESOURCE_ORIGINS.has(provider);
}

function uniqueResourceId(preferredId, seenIds) {
  const base = cleanText(preferredId) || 'resource';
  if (!seenIds.has(base)) return base;
  let ordinal = 1;
  let candidate = `${base}-preserved`;
  while (seenIds.has(candidate)) {
    ordinal += 1;
    candidate = `${base}-preserved-${ordinal}`;
  }
  return candidate;
}

/**
 * Repair the resource-id collision briefly produced when a re-derived graph
 * preserved a source-backed resource's old id after that id had already been
 * assigned to a different syllabus resource. Existing project files must keep
 * their authored enrichment, so restore repairs this narrow structural defect
 * instead of rejecting the entire graph and deriving a content-thin fallback.
 */
export function repairCourseGraphResourceIds(inputGraph) {
  if (!inputGraph || typeof inputGraph !== 'object' || !Array.isArray(inputGraph.resources)) return inputGraph;

  const occupiedIds = new Set();
  for (const collection of ['concepts', 'outcomes', 'assessments', 'sessions', 'readings']) {
    for (const entity of inputGraph[collection] || []) {
      if (entity?.id) occupiedIds.add(entity.id);
    }
  }

  const assignmentsByOriginalId = new Map();
  let changed = false;
  const resources = inputGraph.resources.map((resource) => {
    const originalId = cleanText(resource?.id) || 'resource';
    const assignedId = uniqueResourceId(originalId, occupiedIds);
    occupiedIds.add(assignedId);
    if (assignedId !== resource?.id) changed = true;
    const assignment = { id: assignedId, sessionRefs: resource?.sessionRefs || [] };
    const assignments = assignmentsByOriginalId.get(originalId) || [];
    assignments.push(assignment);
    assignmentsByOriginalId.set(originalId, assignments);
    return assignedId === resource?.id ? resource : { ...resource, id: assignedId };
  });

  if (!changed) return inputGraph;
  const graph = { ...inputGraph, resources };
  graph.sessions = (inputGraph.sessions || []).map((session) => ({
    ...session,
    sections: (session.sections || []).map((section) => ({
      ...section,
      ...(Array.isArray(section.resourceRefs)
        ? {
            resourceRefs: [
              ...new Set(
                section.resourceRefs.flatMap((resourceId) => {
                  const assignments = assignmentsByOriginalId.get(String(resourceId)) || [];
                  if (assignments.length <= 1) return assignments[0]?.id || resourceId;
                  const sessionMatches = assignments.filter((assignment) =>
                    assignment.sessionRefs.some((ref) => sessionMatchesRef(session, ref)),
                  );
                  return (sessionMatches.length > 0 ? sessionMatches : assignments.slice(0, 1)).map(
                    (assignment) => assignment.id,
                  );
                }),
              ),
            ],
          }
        : {}),
    })),
  }));
  return graph;
}

export function restoreCourseGraphForProject(saved = {}) {
  const restoredGraph = repairCourseGraphResourceIds(saved.courseGraph);
  if (restoredGraph && validateCourseGraph(restoredGraph).valid) return restoredGraph;
  try {
    return saved?.courseMap?.lessons ? deriveCourseGraphFromCourseMap(saved.courseMap) : null;
  } catch {
    return null;
  }
}

function sessionMatchesRef(session = {}, ref) {
  const key = String(ref ?? '');
  return key && (key === String(session.id ?? '') || key === String(session.number ?? ''));
}

function linkResourceToSessions(graph, resourceId, sessionRefs = []) {
  if (!resourceId || !Array.isArray(sessionRefs) || sessionRefs.length === 0) return;
  for (const session of graph.sessions || []) {
    if (!sessionRefs.some((ref) => sessionMatchesRef(session, ref))) continue;
    const section = (session.sections || [])[0];
    if (!section) continue;
    if (!Array.isArray(section.resourceRefs)) section.resourceRefs = [];
    if (!section.resourceRefs.includes(resourceId)) section.resourceRefs.push(resourceId);
  }
}

function mergeRefs(...values) {
  const refs = [];
  const seen = new Set();
  for (const value of values.flat()) {
    if (value === undefined || value === null || value === '') continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(value);
  }
  return refs;
}

function preserveResourceMetadata(oldGraph, graph) {
  const oldResources = oldGraph?.resources || [];
  if (!oldResources.length || !Array.isArray(graph?.resources)) return new Map();

  const oldByKey = new Map();
  for (const resource of oldResources) {
    const key = normalizedResourceKey(resource);
    if (key && !oldByKey.has(key)) oldByKey.set(key, resource);
  }

  const resourceRemap = new Map();
  const seenIds = new Set();
  for (const collection of ['concepts', 'outcomes', 'assessments', 'sessions', 'readings']) {
    for (const entity of graph[collection] || []) {
      if (entity?.id) seenIds.add(entity.id);
    }
  }
  const matchedOldIds = new Set();
  const resourceRecords = graph.resources.map((resource) => ({
    resource,
    match: oldByKey.get(normalizedResourceKey(resource)) || null,
    originalId: resource.id,
    assignedId: null,
  }));

  // Matched resources claim their stable old ids first. An unrelated new
  // resource whose derived id collides is renamed below and its section refs
  // follow through resourceRemap.
  for (const record of resourceRecords.filter(({ match }) => match)) {
    record.assignedId = uniqueResourceId(record.match.id || record.originalId, seenIds);
    seenIds.add(record.assignedId);
    if (record.match.id) matchedOldIds.add(record.match.id);
  }
  for (const record of resourceRecords.filter(({ match }) => !match)) {
    record.assignedId = uniqueResourceId(record.originalId, seenIds);
    seenIds.add(record.assignedId);
  }

  graph.resources = resourceRecords.map(({ resource, match, originalId, assignedId }) => {
    if (originalId && assignedId !== originalId) resourceRemap.set(originalId, assignedId);
    if (!match) return assignedId === originalId ? resource : { ...resource, id: assignedId };
    return {
      ...resource,
      ...match,
      id: assignedId,
      sessionRefs: mergeRefs(match.sessionRefs || [], resource.sessionRefs || []),
    };
  });

  for (const resource of oldResources) {
    if (matchedOldIds.has(resource.id)) continue;
    const sessionRefs = resource.sessionRefs || [];
    const shouldPreserveUnmatched = sessionRefs.length === 0 || isSourceBackedResource(resource);
    if (!shouldPreserveUnmatched) continue;
    const preserved = JSON.parse(JSON.stringify(resource));
    preserved.id = uniqueResourceId(preserved.id, seenIds);
    graph.resources.push(preserved);
    seenIds.add(preserved.id);
    linkResourceToSessions(graph, preserved.id, sessionRefs);
  }

  if (resourceRemap.size > 0) {
    for (const session of graph.sessions || []) {
      for (const section of session.sections || []) {
        if (Array.isArray(section.resourceRefs)) {
          section.resourceRefs = section.resourceRefs.map((id) => remapId(resourceRemap, id));
        }
      }
    }
  }

  if (oldGraph.sourceFinderMiniShard && !graph.sourceFinderMiniShard) {
    graph.sourceFinderMiniShard = JSON.parse(JSON.stringify(oldGraph.sourceFinderMiniShard));
  }
  if (Array.isArray(oldGraph.readingListDecisions) && !Array.isArray(graph.readingListDecisions)) {
    graph.readingListDecisions = JSON.parse(JSON.stringify(oldGraph.readingListDecisions));
  }

  return resourceRemap;
}

export function preserveSourceProof(oldGraph, newGraph) {
  if (!oldGraph || !newGraph) return newGraph;
  const graph = JSON.parse(JSON.stringify(newGraph));
  preserveResourceMetadata(oldGraph, graph);
  return graph;
}

/**
 * matchEntityIds(oldGraph, newGraph) — pure. Returns a NEW graph (deep
 * clone of newGraph) whose session/assessment/reading ids are inherited
 * from oldGraph where the entities match:
 *  - sessions: (number, normalized title) → keep the old id (teaches/
 *    practicedIn edges and outcome sessionRefs follow);
 *  - assessments: (dueSession, normalized title) → keep the old id
 *    (assesses edges and section assessmentRefs follow);
 *  - readings: (dueSession, normalized title) → keep the old id
 *    (section readingRefs follow).
 * Unmatched (new) entities keep fresh ids. authoredBy is carried from the
 * old graph so re-derived native graphs stay marked.
 */
export function matchEntityIds(oldGraph, newGraph) {
  if (!oldGraph || !newGraph) return newGraph;
  const graph = JSON.parse(JSON.stringify(newGraph));

  const sessionRemap = buildIdRemap(
    oldGraph.sessions || [],
    graph.sessions || [],
    (session) => `${session.number}|${normalizedTitle(session.title)}`,
  );
  const assessmentRemap = buildIdRemap(
    oldGraph.assessments || [],
    graph.assessments || [],
    (assessment) => `${assessment.dueSession}|${normalizedTitle(assessment.title)}`,
  );
  const readingRemap = buildIdRemap(
    oldGraph.readings || [],
    graph.readings || [],
    (reading) => `${reading.dueSession}|${normalizedTitle(reading.title)}`,
  );

  if (sessionRemap.size > 0) {
    for (const session of graph.sessions || []) session.id = remapId(sessionRemap, session.id);
    for (const outcome of graph.outcomes || []) {
      if (outcome.sessionRef) outcome.sessionRef = remapId(sessionRemap, outcome.sessionRef);
    }
    for (const edge of graph.edges?.teaches || []) edge.from = remapId(sessionRemap, edge.from);
    for (const edge of graph.edges?.practicedIn || []) edge.to = remapId(sessionRemap, edge.to);
  }
  if (assessmentRemap.size > 0) {
    for (const assessment of graph.assessments || []) assessment.id = remapId(assessmentRemap, assessment.id);
    for (const edge of graph.edges?.assesses || []) edge.from = remapId(assessmentRemap, edge.from);
    for (const session of graph.sessions || []) {
      for (const section of session.sections || []) {
        if (Array.isArray(section.assessmentRefs)) {
          section.assessmentRefs = section.assessmentRefs.map((id) => remapId(assessmentRemap, id));
        }
      }
    }
  }
  if (readingRemap.size > 0) {
    for (const reading of graph.readings || []) reading.id = remapId(readingRemap, reading.id);
    for (const session of graph.sessions || []) {
      for (const section of session.sections || []) {
        if (Array.isArray(section.readingRefs)) {
          section.readingRefs = section.readingRefs.map((id) => remapId(readingRemap, id));
        }
      }
    }
  }

  preserveResourceMetadata(oldGraph, graph);

  if (oldGraph.authoredBy && !graph.authoredBy) graph.authoredBy = oldGraph.authoredBy;
  return graph;
}
