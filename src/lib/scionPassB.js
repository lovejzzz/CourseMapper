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
import { scionFactCountForPrompt, scionPromptUsesSourceLedger } from './scionEvidenceContract';
import { applyScionKernelPasses } from './scionPasses';
import { postFlywheelEvents } from './scionFlywheel';
import { assessPublicScionKernelResponse, repairPublicScionJson } from './publicScionProvider';
import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
} from './scionAdapterTaskScope';

const FACT_CONTRACT_ISSUE = /:(?:facts-count|duplicate-facts|fact-\d+:)/;

export function shouldRunScionGroundedAdapterStage(routes = []) {
  return routes.some(
    (route) =>
      route?.taskFamily === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS &&
      route?.routeMode === 'base-only' &&
      route?.routeReason === 'task-family-out-of-scope' &&
      Boolean(route?.adapterId),
  );
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
  if ((assessment.issues || []).some((issue) => FACT_CONTRACT_ISSUE.test(issue))) return null;
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
      if (!Array.isArray(facts) || facts.length < 3 || facts.length > 5) return null;
      return {
        ...lesson,
        sourceFactPolicy: 'numbered-source-ledger-v1',
        sourceFacts: [...facts],
      };
    });
  if (lessons.length !== expectedLessonIds.length || lessons.some((lesson) => !lesson)) return null;
  const course = String(prompt.courseName || '').trim() || 'Untitled Course';
  const userPrompt = `Course: ${course}\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`;
  return { ...prompt, lessons, userPrompt };
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
    if (shouldRunScionGroundedAdapterStage(runtimeRoutes)) {
      const groundedPrompt = buildScionGroundedRefinementPrompt({ rawText, prompt, expectedLessonIds });
      if (groundedPrompt) {
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
          const stagedAssessment = assessPublicScionKernelResponse(
            staged?.fullText || '',
            groundedPrompt.userPrompt,
            'blueprintEnrichment',
          );
          if (stagedUsedAdapter && !stagedAssessment.needsRetry) {
            workingText = staged.fullText;
            workingPrompt = groundedPrompt;
            recordEvent({
              type: 'pipelineDecision',
              label: 'Scion staged adapter refinement',
              detail: 'admitted · base synthesized facts, adapter authored the grounded teaching kernel',
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
