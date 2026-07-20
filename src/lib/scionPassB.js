// src/lib/scionPassB.js — the Scion Pass B orchestration (V2.1 Workstream D),
// lazy-loaded so the local-provider-only wiring stays out of the main AppFlow
// chunk (the bundle budget ratchets down; feature work code-splits).
//
// Two entry points the compiler calls only for Scion (the public browser
// provider and the local OpenAI-compatible development provider):
//   scionKernelSchemaProfile — the declared json_schema contract for the call
//   runScionPasses           — the D3 quality passes + D4 flywheel on the raw
//                              batch JSON, returning the processed text
import { compactLessonKernelSchemaProfile, scionPassesEnabled } from './scionContracts';
import {
  scionFactContractForLesson,
  scionFactCountForPrompt,
  scionPromptUsesSourceLedger,
} from './scionEvidenceContract';
import { applyScionKernelPasses } from './scionPasses';
import { postFlywheelEvents } from './scionFlywheel';
import { assessProjectedKernelCoverage } from './blueprintEnrichmentPass';
import { completeNativeKernelSurfaces, parseNativePassBResponse } from './nativeGraphAuthoring';
import {
  assessPublicScionKernelResponse,
  mergePublicScionKernelAttempts,
  publicScionAdmissionRisk,
  publicScionFactContractIssues,
  repairPublicScionJson,
} from './publicScionProvider';
import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
} from './scionAdapterTaskScope';

const UNSAFE_ADAPTER_STAGE_ISSUE = /(?:^|:)(?:invalid-json|missing-lesson|facts-count|duplicate-facts|fact-\d+:)/;
const GROUNDED_ADAPTER_OBJECTIVE =
  'Use only the supplied claims to make a defensible distinction without adding outside facts.';

function projectedDraftQuality(text, prompt) {
  const expectedLessonIds = (Array.isArray(prompt?.lessons) ? prompt.lessons : [])
    .map((lesson) => lesson?.lessonId)
    .filter(Boolean);
  if (!text || expectedLessonIds.length === 0) {
    return { usable: false, complete: false, usableCount: 0, completeCount: 0, score: 0 };
  }
  try {
    const parsed = parseNativePassBResponse(text, { prompt, expectedLessonIds });
    const coverage = expectedLessonIds.map((lessonId) => {
      const payload = parsed.kernels[lessonId];
      if (!payload) return null;
      const lesson = prompt.lessons.find((entry) => entry?.lessonId === lessonId) || {};
      const completed = completeNativeKernelSurfaces(payload, {
        title: lesson.title,
        sections: [
          {
            topicSection: lesson.topics,
            learningObjectives: lesson.objectives,
          },
        ],
      });
      return assessProjectedKernelCoverage(completed);
    });
    const usableCount = coverage.filter((entry) => entry?.usable).length;
    const completeCount = coverage.filter((entry) => entry?.complete).length;
    return {
      usable: usableCount === expectedLessonIds.length,
      complete: completeCount === expectedLessonIds.length,
      usableCount,
      completeCount,
      score: coverage.reduce((total, entry) => total + (Number(entry?.score) || 0), 0),
    };
  } catch {
    return { usable: false, complete: false, usableCount: 0, completeCount: 0, score: 0 };
  }
}

function compareProjectedDraftQuality(left, right) {
  const leftRank = [left.usable ? 1 : 0, left.complete ? 1 : 0, left.usableCount, left.completeCount, left.score];
  const rightRank = [right.usable ? 1 : 0, right.complete ? 1 : 0, right.usableCount, right.completeCount, right.score];
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return leftRank[index] - rightRank[index];
  }
  return 0;
}

export function shouldRunScionGroundedAdapterStage(routes = []) {
  return routes.some(
    (route) =>
      route?.taskFamily === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS &&
      route?.routeMode === 'base-only' &&
      route?.routeReason === 'grounded-stage-available' &&
      Boolean(route?.adapterId),
  );
}

function buildGroundedAdapterLesson(lesson, facts) {
  if (!Array.isArray(facts) || facts.length < 3 || facts.length > 5 || facts.some((fact) => typeof fact !== 'string')) {
    return null;
  }
  // Match the exact lesson serialization learned by every admitted training
  // row: ordered Claim N topics, a task objective, and no parallel sourceFacts
  // field. The semantic contract re-parses the encoding before it can reach
  // the adapter, so a reserved marker or whitespace mutation fails closed.
  const adapterLesson = {
    lessonId: lesson.lessonId,
    sourceFactPolicy: 'numbered-source-ledger-v1',
    title: String(lesson.title || ''),
    objectives: GROUNDED_ADAPTER_OBJECTIVE,
    topics: facts.map((fact, index) => `Claim ${index}: ${fact}`).join(' '),
    readings: String(lesson.readings || ''),
  };
  const contract = scionFactContractForLesson(adapterLesson);
  return contract.mode === 'numbered-source-ledger-v1' && JSON.stringify(contract.claims) === JSON.stringify(facts)
    ? adapterLesson
    : null;
}

export function buildScionGroundedRefinementPrompt({ rawText, prompt, expectedLessonIds = [] } = {}) {
  if (!prompt?.userPrompt || !Array.isArray(prompt?.lessons) || expectedLessonIds.length === 0) return null;
  const repaired = repairPublicScionJson(rawText, { userPrompt: prompt.userPrompt });
  let parsed;
  try {
    parsed = JSON.parse(repaired.text);
  } catch {
    return null;
  }
  const assessment = assessPublicScionKernelResponse(repaired.text, prompt.userPrompt, 'blueprintEnrichment');
  if (publicScionFactContractIssues(assessment).length > 0) return null;
  const returned = new Map(
    (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
      .filter((lesson) => lesson?.lessonId)
      .map((lesson) => [lesson.lessonId, lesson]),
  );
  const expected = new Set(expectedLessonIds);
  const lessons = prompt.lessons
    .filter((lesson) => expected.has(lesson?.lessonId))
    .map((lesson) => {
      const facts = returned.get(lesson.lessonId)?.facts;
      return buildGroundedAdapterLesson(lesson, facts);
    });
  if (lessons.length !== expectedLessonIds.length || lessons.some((lesson) => !lesson)) return null;
  const course = String(prompt.courseName || '').trim() || 'Untitled Course';
  const userPrompt = `Course: ${course}\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`;
  return { ...prompt, lessons, userPrompt };
}

/**
 * Keep a staged adapter draft only when the deterministic production gate
 * proves that it is strictly safer than the base draft against the same
 * frozen fact ledger. A near-miss can then use the compiler's existing
 * per-atom repair/quarantine passes instead of discarding every good atom.
 * Identity or fact-ledger failures always fail closed, regardless of score.
 */
export function selectScionGroundedAdapterDraft({ baseText, adapterText, groundedPrompt } = {}) {
  if (!groundedPrompt?.userPrompt || typeof baseText !== 'string' || typeof adapterText !== 'string') return null;
  const assess = (text) => assessPublicScionKernelResponse(text, groundedPrompt.userPrompt, 'blueprintEnrichment');
  const baseAssessment = assess(baseText);
  const baseRisk = publicScionAdmissionRisk(baseAssessment);
  const baseCompilerQuality = projectedDraftQuality(baseText, groundedPrompt);
  const merged = mergePublicScionKernelAttempts(baseText, adapterText, groundedPrompt.userPrompt);
  const candidates = [
    { text: adapterText, source: 'adapter', repairs: [], assessment: assess(adapterText) },
    ...(merged?.text && merged.text !== adapterText
      ? [
          {
            text: merged.text,
            source: 'cross-attempt-merge',
            repairs: merged.repairs || [],
            assessment: assess(merged.text),
          },
        ]
      : []),
  ]
    .filter(
      (candidate) =>
        !(candidate.assessment.issues || []).some((issue) => UNSAFE_ADAPTER_STAGE_ISSUE.test(String(issue))),
    )
    .map((candidate) => ({
      ...candidate,
      risk: publicScionAdmissionRisk(candidate.assessment),
      compilerQuality: projectedDraftQuality(candidate.text, groundedPrompt),
    }))
    // Public issue counts are useful, but they are not the user-facing
    // boundary. A staged adapter once reduced the numeric risk by one while
    // turning a World Literature base kernel that compiled into a usable
    // lesson into a kernel with no admitted terminology core. Never trade a
    // compiler-usable draft for an unusable near-miss.
    .filter((candidate) => compareProjectedDraftQuality(candidate.compilerQuality, baseCompilerQuality) >= 0)
    .sort(
      (left, right) =>
        compareProjectedDraftQuality(right.compilerQuality, left.compilerQuality) ||
        left.risk.score - right.risk.score ||
        left.risk.issueCount - right.risk.issueCount,
    );
  const selected = candidates[0];
  const compilerImprovement = selected
    ? compareProjectedDraftQuality(selected.compilerQuality, baseCompilerQuality)
    : 0;
  if (!selected || (compilerImprovement <= 0 && selected.risk.score >= baseRisk.score)) return null;
  return {
    ...selected,
    baseAssessment,
    baseRisk,
    baseCompilerQuality,
    riskReduction: baseRisk.score - selected.risk.score,
  };
}

/**
 * The D1/D2 request options for the main Pass B call: the declared
 * json_schema contract + greedy-default temperature (recovery retries sample).
 */
export function scionCallOpts({ prompt, expectedLessonIds, recoveryAttempt }) {
  const factCount = scionFactCountForPrompt(prompt, expectedLessonIds);
  const sourceLedger = scionPromptUsesSourceLedger(prompt, expectedLessonIds);
  return {
    schema: compactLessonKernelSchemaProfile({ expectedLessonIds, factCount }),
    promptProtocol: sourceLedger ? SCION_LESSON_KERNEL_PROMPT_PROTOCOL : SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
    temperature: recoveryAttempt > 0 ? 0.7 : 0,
    // Seven fresh cross-domain captures produced zero admitted base-model
    // source-ledger kernels. Repeating the same strict request did not add a
    // usable atom, but made a three-lesson browser build take 441 seconds.
    // Keep one honest model attempt; the compiler then preserves only admitted
    // atoms and exposes review notes instead of spending a futile retry storm.
    ...(sourceLedger ? { maxRetries: 0 } : {}),
  };
}

/**
 * Apply the D3 passes to a raw Pass B batch and bank D4 flywheel pairs.
 * Self-guarding: returns rawText unchanged if passes are disabled or anything
 * throws — the compiler calls this without its own try/catch.
 * @returns {Promise<string>} the processed batch JSON
 */
export async function runScionPasses({
  rawText,
  streamProvider,
  provider,
  apiKey,
  modelId,
  modelCapabilities,
  generationPlan,
  signal,
  recordEvent,
  prompt,
  expectedLessonIds,
  contentSourcedLessonIds,
  courseName,
  runtimeRoutes = [],
}) {
  if (!scionPassesEnabled()) return rawText;
  try {
    return await applyPasses();
  } catch {
    return rawText; // passes are best-effort — the draft ships
  }
  async function applyPasses() {
    let workingText = rawText;
    let workingPrompt = prompt;
    let workingUsesGroundedAdapter = false;
    let groundedAdapterWasProven = false;
    let groundedAdapterWasBlocked = false;
    if (shouldRunScionGroundedAdapterStage(runtimeRoutes)) {
      const groundedPrompt = buildScionGroundedRefinementPrompt({ rawText, prompt, expectedLessonIds });
      if (!groundedPrompt) {
        // The grounded adapter cannot safely run without a valid, immutable
        // fact ledger. Skip that adapter stage, but keep one bounded seat for
        // the fact-preserving compiler passes below. Language identity in
        // particular is orthogonal to a duplicated fact: returning here left
        // an otherwise usable Mandarin lesson without a visible Hanzi/Pinyin
        // pair and made the exported package fail its domain contract.
        groundedAdapterWasBlocked = true;
        recordEvent({
          type: 'pipelineDecision',
          label: 'Scion staged adapter refinement',
          detail: 'not attempted · base fact ledger failed the immutable contract · deterministic fallback',
          stage: 'scionAdapterStage',
          featureId: 'blueprintEnrichment',
          task: 'blueprintEnrichment',
        });
      }
      if (!groundedAdapterWasBlocked && groundedPrompt) {
        recordEvent({
          type: 'blueprintEnrichmentCall',
          label: 'Scion source-grounded adapter stage',
          detail: `Lessons ${expectedLessonIds.join(', ')} · facts frozen before adapter refinement`,
          featureId: 'blueprintEnrichment',
          task: 'blueprintEnrichment',
        });
        try {
          const staged = await streamProvider(
            provider,
            apiKey,
            modelId,
            groundedPrompt.systemPrompt,
            groundedPrompt.userPrompt,
            {
              modelCapabilities,
              generationPlan,
              featureId: 'blueprintEnrichment',
              task: 'blueprintEnrichment',
              ...scionCallOpts({ prompt: groundedPrompt, expectedLessonIds, recoveryAttempt: 0 }),
              maxOutputTokens: 2400,
              allowProviderFallback: false,
              onApiCallEvent: recordEvent,
              signal,
            },
          );
          const stagedUsedAdapter = (staged?.adapterRoutes || []).some(
            (route) =>
              route?.taskFamily === SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL &&
              route?.routeMode === 'adapter' &&
              route?.nativeAdapterActive === true,
          );
          groundedAdapterWasProven = stagedUsedAdapter;
          const stagedAssessment = assessPublicScionKernelResponse(
            staged?.fullText || '',
            groundedPrompt.userPrompt,
            'blueprintEnrichment',
          );
          const selectedDraft = stagedUsedAdapter
            ? selectScionGroundedAdapterDraft({
                baseText: rawText,
                adapterText: staged?.fullText || '',
                groundedPrompt,
              })
            : null;
          if (stagedUsedAdapter && (!stagedAssessment.needsRetry || selectedDraft)) {
            workingText = selectedDraft?.text || staged.fullText;
            workingPrompt = groundedPrompt;
            workingUsesGroundedAdapter = true;
            const effectiveAssessment = selectedDraft?.assessment || stagedAssessment;
            recordEvent({
              type: 'pipelineDecision',
              label: 'Scion staged adapter refinement',
              detail: effectiveAssessment.needsRetry
                ? `retained for compiler repair · ${selectedDraft.source} · deterministic admission risk ${selectedDraft.baseRisk.score}→${selectedDraft.risk.score} · ${(effectiveAssessment.issues || []).slice(0, 3).join(', ')}`
                : selectedDraft?.source === 'cross-attempt-merge'
                  ? `admitted after deterministic merge · admission risk ${selectedDraft.baseRisk.score}→0`
                  : 'admitted · base synthesized facts, adapter authored the grounded teaching kernel',
              stage: 'scionAdapterStage',
              featureId: 'blueprintEnrichment',
              task: 'blueprintEnrichment',
            });
          } else {
            recordEvent({
              type: 'pipelineDecision',
              label: 'Scion staged adapter refinement',
              detail: stagedUsedAdapter
                ? `rejected · ${(stagedAssessment.issues || []).slice(0, 4).join(', ') || 'contract incomplete'}`
                : 'rejected · source-grounded adapter route was not proven',
              stage: 'scionAdapterStage',
              featureId: 'blueprintEnrichment',
              task: 'blueprintEnrichment',
            });
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          recordEvent({
            type: 'pipelineDecision',
            label: 'Scion staged adapter refinement',
            detail: `rejected · ${String(error?.message || 'adapter stage failed').slice(0, 180)}`,
            stage: 'scionAdapterStage',
            featureId: 'blueprintEnrichment',
            task: 'blueprintEnrichment',
          });
        }
      }
    }
    const generateJson = async ({ system, user, schemaProfile, maxOutputTokens, temperature }) => {
      recordEvent({
        type: 'pipelineDecision',
        label: 'Scion pass call',
        detail: schemaProfile?.name || 'unknown',
        chunkLabel: expectedLessonIds.join(','),
        featureId: 'blueprintEnrichment',
        task: 'scionPass',
      });
      const passResult = await streamProvider(provider, apiKey, modelId, system, user, {
        modelCapabilities,
        generationPlan,
        featureId: 'blueprintEnrichment',
        task: 'scionPass',
        schema: schemaProfile,
        ...(temperature ? { temperature } : {}),
        maxOutputTokens: maxOutputTokens || 2000,
        allowProviderFallback: false,
        onApiCallEvent: recordEvent,
        signal,
      });
      return passResult?.fullText || '';
    };
    const passOutcome = await applyScionKernelPasses(workingText, {
      promptLessons: workingPrompt.lessons,
      generateJson,
      contentSourcedLessonIds,
      expectedMcCount: 2,
      minimumKeyTermCount: 3,
      courseName,
      // The browser-local base cannot independently verify its own answer.
      // Deterministic source admission may reject or repair a faulty seat;
      // same-model cold solves must never destroy an otherwise admitted item.
      verifyDraftMcWithSameModel: false,
      // One repair at a time keeps the 2B model focused. A repair ships only
      // when deterministic cited-source alignment confirms its key; the same
      // model never certifies itself or creates adapter evidence.
      verifyRepairMcWithSameModel: false,
      maxAdmissionRepairsPerCall: 1,
      // Once the aligned adapter route has been proven and evaluated, give
      // whichever draft won deterministic selection one high-value repair
      // seat, then trust admission/quarantine/fallback. This also bounds the
      // safer base fallback when the adapter loses: a live Mandarin canary
      // showed five subsequent repair calls and all five were rejected.
      ...(workingUsesGroundedAdapter || groundedAdapterWasProven || groundedAdapterWasBlocked
        ? {
            maxCallsPerLesson: 1,
            skipImprovementOnlyPasses: true,
          }
        : {}),
    });
    if (passOutcome.events.length > 0) {
      recordEvent({
        type: 'pipelineDecision',
        label: 'Scion quality passes',
        detail: passOutcome.events
          .map(
            (event) =>
              `${event.pass}:${event.lessonId}${event.action ? ` ${event.action}` : ''}${event.reason ? ` [${event.reason}]` : ''}`,
          )
          .join(' · '),
        chunkLabel: expectedLessonIds.join(','),
        featureId: 'blueprintEnrichment',
        task: 'scionPass',
      });
      postFlywheelEvents(passOutcome.events, { course: courseName, chunk: expectedLessonIds });
    }
    return passOutcome.text;
  }
}
