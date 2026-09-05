import {
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MIN_RETRIES,
  applyPublicScionCourseMapTopicPlan,
  assessPublicScionKernelResponse,
  buildPublicScionExactSourceLedgerResponse,
  buildPublicScionMessages,
  buildPublicScionRetryFeedback,
  extractPublicScionKernelLessons,
  mergePublicScionKernelAttempts,
  publicScionAdmissionRisk,
  publicScionCompilerFactCoreUsable,
  publicScionFactContractIssues,
  publicScionRetryDelay,
  repairPublicScionJson,
  shufflePublicScionKernelOptions,
  stripPublicScionInvalidFactAtoms,
} from './publicScionProvider';
import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
  scionAdapterTaskFamilyForProviderTask,
} from './scionAdapterTaskScope';
import { scionFactContractForLesson } from './scionEvidenceContract';
import { explicitCourseLanguageIds } from './languageIdentityGuard';
import { SCION_BROWSER_MAX_NEW_TOKENS } from './scionBrowserConstants';
import { assessScionStructuredResponse, assessScionClassroomResponse } from './scionStructuredResponse';

export const SCION_LOCAL_MAX_GENERATION_RETRIES = PUBLIC_SCION_MIN_RETRIES;

function localError(code, message, { retryable = false, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const stop = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

async function defaultRuntimeLoader() {
  return import('./scionBrowserWllama');
}

function completionTemperature(attempt, requested) {
  const initial = Number.isFinite(Number(requested)) ? Math.max(0, Number(requested)) : 0;
  return Math.min(1.5, initial + Math.max(0, attempt) * 0.15);
}

function summarizeKernelShape(text, userPrompt) {
  try {
    const parsed = JSON.parse(text);
    const byId = new Map(
      (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    return extractPublicScionKernelLessons(userPrompt)
      .filter((lesson) => lesson?.lessonId)
      .map((row) => {
        const lesson = byId.get(row.lessonId) || {};
        return {
          lessonId: row.lessonId,
          facts: Array.isArray(lesson.facts) ? lesson.facts.length : 0,
          keyTerms: Array.isArray(lesson.keyTerms) ? lesson.keyTerms.length : 0,
          mc: Array.isArray(lesson.mc) ? lesson.mc.length : 0,
          hasScenario: Boolean(lesson.scenario),
          hasDiscussion: Boolean(lesson.discussionPrompt),
          hasAssignment: Boolean(lesson.assignmentCore),
          hasStudyGuide: Boolean(lesson.studyGuide),
        };
      });
  } catch {
    return [];
  }
}

function canDeferKernelAdmission(text, userPrompt, task, assessment = {}) {
  if (task !== 'blueprintEnrichment') return false;
  if (
    (assessment.issues || []).some((issue) =>
      ['invalid-json', 'empty-response', ':missing-lesson', 'classroom-contract:'].some((marker) =>
        String(issue).includes(marker),
      ),
    )
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(text);
    const byId = new Map(
      (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const expected = extractPublicScionKernelLessons(userPrompt).filter((lesson) => lesson?.lessonId);
    return (
      expected.length > 0 &&
      expected.every((row) => {
        const lesson = byId.get(row.lessonId);
        const factContract = scionFactContractForLesson(row, { userPrompt });
        const minimumFacts = factContract.mode === 'numbered-source-ledger-v1' ? factContract.factCount : 4;
        return (
          lesson &&
          Array.isArray(lesson.facts) &&
          lesson.facts.length >= minimumFacts &&
          ((Array.isArray(lesson.keyTerms) && lesson.keyTerms.length >= 1) ||
            (Array.isArray(lesson.mc) && lesson.mc.length >= 2))
        );
      })
    );
  } catch {
    return false;
  }
}

/**
 * Run the compact Scion authoring and admission contract.
 *
 * The default transport runs the pinned GGUF on device. The explicitly opted-in
 * hosted provider injects its own transport; both share the same output gates.
 */
export async function runScionLocalCompletion({
  systemPrompt = '',
  userPrompt = '',
  task = 'generation',
  promptProtocol = null,
  classroomAuthoring = false,
  completionTokenCeiling = PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  schema = null,
  maxOutputTokens = PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  maxRetries = SCION_LOCAL_MAX_GENERATION_RETRIES,
  temperature,
  signal,
  onProgress,
  onToken,
  onAttemptStart,
  onRetry,
  onAdapterRoute,
  runtimeLoader = defaultRuntimeLoader,
  sleep = defaultSleep,
} = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string') {
    throw localError('SCION_PROMPT_TYPE', 'Scion requires text prompts, not a prompt-builder object.');
  }
  const taskFamily = scionAdapterTaskFamilyForProviderTask(task, { promptProtocol });
  const factLedgerOnly =
    taskFamily === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS &&
    promptProtocol === SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL;
  const targetLanguageKernel = explicitCourseLanguageIds(`${systemPrompt}\n${userPrompt}`).length > 0;
  const expectedKernelLessons = extractPublicScionKernelLessons(userPrompt).filter((lesson) => lesson?.lessonId);
  if (task === 'blueprintEnrichment' && expectedKernelLessons.length === 0) {
    throw localError('SCION_PROMPT_EMPTY_LESSONS', 'Scion needs at least one identified lesson before generation.');
  }
  const exactSourceLedger =
    expectedKernelLessons.length > 0 &&
    expectedKernelLessons.every(
      (lesson) => scionFactContractForLesson(lesson, { userPrompt }).mode === 'numbered-source-ledger-v1',
    );
  const messages = buildPublicScionMessages(systemPrompt, userPrompt, {
    schema,
    task,
    factLedgerOnly,
    classroomAuthoring,
  });
  const exactLedgerText = factLedgerOnly ? buildPublicScionExactSourceLedgerResponse(userPrompt) : '';
  if (exactLedgerText) {
    const assessment = assessPublicScionKernelResponse(exactLedgerText, userPrompt, task, {
      exactSourceProjection: true,
    });
    const route = {
      protocol: 'scion-compiler-exact-source-route-v1',
      mode: 'base-only',
      taskFamily,
      reason: 'compiler-owned-exact-source-ledger',
      adapterId: null,
      nativeAdapterActive: false,
      factLedgerOnly: true,
      exactSourceLedger: true,
      modelCalls: 0,
    };
    if (typeof onAdapterRoute === 'function') onAdapterRoute(route);
    return {
      fullText: exactLedgerText,
      rawText: exactLedgerText,
      repairs: [
        {
          pass: 'compilerOwnedExactSourceLedger',
          action: 'projected-exact-source-ledger',
          lessonIds: expectedKernelLessons.map((lesson) => lesson.lessonId),
          trainingEligible: false,
        },
      ],
      messages,
      attempt: 0,
      retryCount: 0,
      maxRetries: 0,
      tokenCount: 0,
      finishReason: 'stop',
      inputTokens: 0,
      outputTokens: 0,
      modelRequests: 0,
      contractIncomplete: assessment.needsRetry,
      admissionIssues: assessment.issues || [],
      kernelShape: summarizeKernelShape(exactLedgerText, userPrompt),
    };
  }

  const runtimeApi = await runtimeLoader();
  if (
    typeof runtimeApi?.loadScionBrowserWllama !== 'function' ||
    typeof runtimeApi?.completeScionBrowserWllama !== 'function'
  ) {
    throw localError('SCION_LOCAL_RUNTIME_API', 'The packaged Scion browser runtime is unavailable.');
  }

  await runtimeApi.loadScionBrowserWllama({ onProgress, signal });
  if (typeof runtimeApi.prepareScionBrowserWllamaTaskRoute === 'function') {
    await runtimeApi.prepareScionBrowserWllamaTaskRoute({ taskFamily, promptProtocol });
  }
  const requestedOutputLimit = Math.max(
    1,
    Math.min(
      Math.min(
        SCION_BROWSER_MAX_NEW_TOKENS,
        Math.max(1, Number(completionTokenCeiling) || PUBLIC_SCION_MAX_COMPLETION_TOKENS),
      ),
      Math.floor(Number(maxOutputTokens) || PUBLIC_SCION_MAX_COMPLETION_TOKENS),
    ),
  );
  let outputLimit = factLedgerOnly ? Math.min(800, requestedOutputLimit) : requestedOutputLimit;
  const retryLimit = Math.max(0, Math.min(SCION_LOCAL_MAX_GENERATION_RETRIES, Math.floor(Number(maxRetries) || 0)));

  let retryAssessment = null;
  const observedRetryIssues = new Set();
  let retainedIncompleteText = null;
  let bestIncomplete = null;
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const attemptTemperature = completionTemperature(attempt, temperature);
    const attemptMessages = retryAssessment?.needsRetry
      ? messages.map((message, index) =>
          index === messages.length - 1
            ? {
                ...message,
                content: `${message.content}\n\n${buildPublicScionRetryFeedback(retryAssessment, { task, factLedgerOnly })}`,
              }
            : message,
        )
      : messages;
    if (typeof onAttemptStart === 'function') {
      onAttemptStart({
        attempt: attempt + 1,
        maxAttempts: retryLimit + 1,
        temperature: attemptTemperature,
        messages: attemptMessages,
      });
    }
    let tokenCount = 0;
    let attemptRoute = null;
    let completion = { finishReason: 'unknown' };
    const rawText = await runtimeApi.completeScionBrowserWllama(attemptMessages, {
      maxNewTokens: outputLimit,
      temperature: attemptTemperature,
      topK: attemptTemperature > 0 ? 64 : 1,
      topP: attemptTemperature > 0 ? 0.95 : 1,
      seed: 7 + attempt,
      signal,
      taskFamily,
      promptProtocol,
      onCompletion: (receipt) => {
        completion = receipt;
        usage.inputTokens += Number(receipt.inputTokens) || 0;
        usage.outputTokens += Number(receipt.outputTokens) || 0;
      },
      onAdapterRoute: (route) => {
        attemptRoute = { ...route, factLedgerOnly };
        if (typeof onAdapterRoute === 'function') onAdapterRoute(attemptRoute);
      },
      onToken: (currentText) => {
        tokenCount += 1;
        if (typeof onToken === 'function') onToken(currentText, tokenCount, attempt + 1);
      },
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const completionMetadata = { ...usage, finishReason: completion.finishReason, modelRequests: attempt + 1 };
    if (completion.finishReason === 'length') {
      const error = localError(
        'SCION_OUTPUT_LIMIT',
        'Scion reached its output limit before finishing. No partial material was accepted. Reduce the lesson batch and retry.',
      );
      error.outputTokens = completion.outputTokens;
      // A larger bounded budget can finish the same contract. Repeating an
      // identical token limit or repairing the cut-off JSON cannot do that.
      if (attempt < retryLimit && outputLimit < SCION_BROWSER_MAX_NEW_TOKENS) {
        outputLimit = Math.min(SCION_BROWSER_MAX_NEW_TOKENS, Math.ceil(outputLimit * 1.75));
        onRetry?.(attempt + 1, retryLimit, 0, error);
        continue;
      }
      throw error;
    }
    const repaired = repairPublicScionJson(rawText, { userPrompt });
    const plannedCourseMap =
      task === 'course-map'
        ? applyPublicScionCourseMapTopicPlan(repaired.text, userPrompt)
        : { text: repaired.text, repairs: [] };
    const baseRepairs = [...repaired.repairs, ...plannedCourseMap.repairs];
    const merged = retainedIncompleteText
      ? mergePublicScionKernelAttempts(retainedIncompleteText, plannedCourseMap.text, userPrompt)
      : { text: plannedCourseMap.text, repairs: [] };
    const fullText = merged.text;
    const empty = !fullText.trim();
    const kernelAssessment = empty
      ? { needsRetry: true, issues: ['empty-response'] }
      : assessPublicScionKernelResponse(fullText, userPrompt, task);
    // Kernel contracts have their own per-atom admission. Short repair and
    // structure tasks previously bypassed all shape validation, even when
    // they returned an array instead of the requested object or an invalid key.
    const structuredAssessment = ['scionPass', 'nativeSkeleton'].includes(task)
      ? assessScionStructuredResponse(rawText, schema)
      : { needsRetry: false, issues: [] };
    const classroomAssessment =
      classroomAuthoring && task === 'blueprintEnrichment'
        ? assessScionClassroomResponse(fullText)
        : { needsRetry: false, issues: [] };
    const assessment = {
      needsRetry: kernelAssessment.needsRetry || structuredAssessment.needsRetry || classroomAssessment.needsRetry,
      issues: [...kernelAssessment.issues, ...structuredAssessment.issues, ...classroomAssessment.issues],
    };
    const retryIssues = factLedgerOnly ? publicScionFactContractIssues(assessment) : assessment.issues || [];
    const retryGate = { needsRetry: empty || retryIssues.length > 0, issues: retryIssues };
    const compilerFactCoreUsable =
      factLedgerOnly &&
      !empty &&
      publicScionCompilerFactCoreUsable(fullText, assessment, {
        minimumFacts: targetLanguageKernel ? 2 : 3,
        exactFactCountRequired: exactSourceLedger,
      });
    const incomplete = !empty && retryGate.needsRetry && !compilerFactCoreUsable;
    // When an exact source-grounded adapter is available, the synthesis arm
    // only needs one structurally usable fact draft. A valid fact ledger exits
    // above without another call; an invalid ledger gets one issue-informed
    // retry so an exact duplicate cannot consume one of the two course-level
    // recovery seats and strand a whole lesson. Explicit recovery retains its
    // two-retry ceiling for a stubborn malformed ledger.
    const effectiveRetryLimit = factLedgerOnly ? Math.min(1, retryLimit) : retryLimit;
    if (!empty && !incomplete) {
      const admittedText = compilerFactCoreUsable ? stripPublicScionInvalidFactAtoms(fullText, assessment) : fullText;
      const shuffled = shufflePublicScionKernelOptions(admittedText);
      return {
        fullText: shuffled.text,
        rawText,
        repairs: [...baseRepairs, ...merged.repairs, ...shuffled.repairs],
        messages: attemptMessages,
        attempt: attempt + 1,
        retryCount: attempt,
        maxRetries: effectiveRetryLimit,
        tokenCount,
        ...completionMetadata,
        ...(assessment.needsRetry ? { contractIncomplete: true, admissionIssues: assessment.issues || [] } : {}),
      };
    }

    const failure = empty
      ? localError('SCION_LOCAL_EMPTY', 'Scion produced an empty response.', { retryable: true })
      : localError(
          'SCION_LOCAL_INCOMPLETE',
          'Scion produced an incomplete response that did not meet the requested contract.',
          {
            retryable: true,
          },
        );
    failure.admissionIssues = assessment.issues || [];
    failure.kernelShape = summarizeKernelShape(fullText, userPrompt);
    const deferable = canDeferKernelAdmission(fullText, userPrompt, task, assessment);
    if (incomplete && deferable) {
      const candidate = {
        fullText,
        rawText,
        repairs: [...baseRepairs, ...merged.repairs],
        messages: attemptMessages,
        assessment,
        kernelShape: failure.kernelShape,
        attempt: attempt + 1,
        tokenCount,
        completionMetadata,
      };
      if (!bestIncomplete || publicScionAdmissionRisk(retryGate).score < bestIncomplete.risk.score) {
        bestIncomplete = { ...candidate, risk: publicScionAdmissionRisk(retryGate) };
      }
    }
    // The browser transport owns syntax and envelope integrity. The canonical
    // compiler owns per-atom semantic admission. After one real corrective
    // retry, forward a structurally usable kernel with its unresolved issue
    // receipt instead of regenerating the whole lesson repeatedly; the parser
    // can then keep safe facts/items and reject only the defective atoms.
    const deferAfterAttempt =
      publicScionAdmissionRisk(retryGate).highRiskIssues > 0 ? effectiveRetryLimit : Math.min(1, effectiveRetryLimit);
    if (attempt >= deferAfterAttempt && deferable) {
      const selected = bestIncomplete || {
        fullText,
        rawText,
        repairs: [...baseRepairs, ...merged.repairs],
        messages: attemptMessages,
        assessment,
        kernelShape: failure.kernelShape,
        attempt: attempt + 1,
        tokenCount,
      };
      return {
        fullText: selected.fullText,
        rawText: selected.rawText,
        repairs: selected.repairs,
        messages: selected.messages,
        attempt: attempt + 1,
        selectedAttempt: selected.attempt,
        retryCount: attempt,
        maxRetries: effectiveRetryLimit,
        tokenCount: selected.tokenCount,
        ...completionMetadata,
        contractIncomplete: true,
        admissionIssues: selected.assessment.issues || [],
        kernelShape: selected.kernelShape,
      };
    }
    if (attempt >= effectiveRetryLimit) throw failure;
    for (const issue of retryGate.issues || []) observedRetryIssues.add(issue);
    retryAssessment = { needsRetry: true, issues: [...observedRetryIssues] };
    retainedIncompleteText = fullText;
    const retryNumber = attempt + 1;
    const delay = publicScionRetryDelay(retryNumber);
    if (typeof onRetry === 'function') onRetry(retryNumber, effectiveRetryLimit, delay, failure);
    await sleep(delay, signal);
  }

  throw localError('SCION_LOCAL_RETRY_EXHAUSTED', 'Scion local generation exhausted its retry budget.');
}
