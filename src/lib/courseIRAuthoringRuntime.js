import {
  COURSE_IR_SYSTEM_PROMPT,
  assessCourseIRDirectAuthoring,
  buildCourseIRPromptPayload,
  courseIRToCourseGraph,
  courseIRToCourseMap,
  parseCourseIRResponse,
  planCourseIRGeneration,
  stashCourseIR,
  takeCourseIR,
  validateCourseIR,
} from './courseIR';

export async function tryAuthorDirectCourseIR({
  expectedLessonCount,
  sourceText,
  provider,
  apiKey,
  modelId,
  maxOutputTokens,
  modelCapabilities,
  generationPlan,
  currentModelName,
  streamProvider,
  recordApiCallEvent,
  updateGenerationProgress,
  fullTextRef,
} = {}) {
  if (!expectedLessonCount || !streamProvider) return { ok: false, skipped: true };
  // Scion (V2.1 D2): CourseIR direct authoring has never once passed the
  // acceptance gate on the house model (nor on paid mini) — on Scion the
  // call costs 60-90s of deterministic fallback, so the time-planner skips
  // straight to the skeleton path. Disclosed as a pipeline decision.
  if (provider === 'local') {
    recordApiCallEvent?.({
      type: 'pipelineDecision',
      stage: 'courseIRAuthoring',
      label: 'CourseIR direct authoring plan',
      detail:
        'skipped: Scion time-planner (direct authoring never passes acceptance; skeleton path is the measured optimum)',
    });
    return { ok: false, skipped: true };
  }
  const courseIRPlan = planCourseIRGeneration({
    courseMap: { courseName: '', lessons: [] },
    sourceText,
    modelId,
    maxOutputTokens,
    generationPlan,
    modelCapabilities,
    expectedLessons: expectedLessonCount,
  });
  recordApiCallEvent?.({
    type: 'pipelineDecision',
    stage: 'courseIRAuthoring',
    label: 'CourseIR direct authoring plan',
    detail: `${courseIRPlan.strategy} · ${courseIRPlan.plannedCalls} planned call${
      courseIRPlan.plannedCalls === 1 ? '' : 's'
    } · ${courseIRPlan.lessonCount} expected lessons`,
  });
  if (courseIRPlan.strategy !== 'whole-course-ir') return { ok: false, skipped: true, courseIRPlan };

  const payload = buildCourseIRPromptPayload({
    courseMap: { courseName: '', lessons: [] },
    sourceText,
    expectedLessons: expectedLessonCount,
  });
  if (fullTextRef) fullTextRef.current = '';
  recordApiCallEvent?.({
    type: 'courseIRCall',
    label: 'CourseIR direct authoring',
    detail: `${currentModelName} · whole-course CurriculumV1 object`,
  });
  const result = await streamProvider(provider, apiKey, modelId, COURSE_IR_SYSTEM_PROMPT, JSON.stringify(payload), {
    maxOutputTokens: courseIRPlan.outputLimit || generationPlan?.courseMapOutputTokens || maxOutputTokens,
    modelCapabilities,
    generationPlan,
    task: 'courseIR',
    onApiCallEvent: recordApiCallEvent,
    onChunk: (text, count) => {
      if (fullTextRef) fullTextRef.current = text;
      updateGenerationProgress?.(text, count);
    },
  });
  const parsedIR = parseCourseIRResponse(result?.fullText || '', { expectedLessons: expectedLessonCount });
  if (!parsedIR.acceptance.accepted) {
    return {
      ok: false,
      skipped: false,
      courseIRPlan,
      fallbackReason: `CourseIR failed direct-authoring acceptance: ${parsedIR.acceptance.reason}`,
      parsedIR,
    };
  }
  stashCourseIR(parsedIR.ir);
  return {
    ok: true,
    courseIRPlan,
    courseMap: courseIRToCourseMap(parsedIR.ir),
    courseIR: parsedIR.ir,
    validation: parsedIR.validation,
    repair: parsedIR.repair,
  };
}

export function applyDirectCourseIRGenerationResult({
  direct,
  provider,
  apiKey,
  modelId,
  workingModelRef,
  setCourseMap,
  courseMapRef,
  setIsStreaming,
  setStreamDetail,
  stoppedTextRef,
  stoppedPromptRef,
  pushVersion,
  addLog,
  currentModelName,
  setCompletenessInfo,
  expectedLessonCount,
  detected,
  setOldCourseMap,
  setExamChanges,
  setPendingExamPatches,
  recordApiCallEvent,
  setStreamProgress,
  setProgressStep,
  setStatus,
  setUserEdits,
  streamSaveKey,
  clearNativeSkeleton,
} = {}) {
  const courseMap = direct.courseMap;
  clearNativeSkeleton?.();
  if (workingModelRef) workingModelRef.current = { provider, apiKey, modelId };
  setCourseMap?.(courseMap);
  if (courseMapRef) courseMapRef.current = courseMap;
  setIsStreaming?.(false);
  setStreamDetail?.('');
  if (stoppedTextRef) stoppedTextRef.current = '';
  if (stoppedPromptRef) stoppedPromptRef.current = null;
  pushVersion?.(courseMap, 'Initial generation (CourseIR direct authoring)');
  addLog?.(
    currentModelName,
    `CourseIR authoring accepted: ${direct.validation.stats.lessons} lessons, ${direct.validation.stats.concepts} concepts, ${direct.validation.stats.assessments} assessments`,
    'success',
  );
  setCompletenessInfo?.({
    expected: expectedLessonCount,
    actual: direct.validation.stats.lessons,
    confidence: detected?.confidence || 'high',
    status: expectedLessonCount && direct.validation.stats.lessons < expectedLessonCount ? 'incomplete' : 'complete',
  });
  setOldCourseMap?.(null);
  setExamChanges?.([]);
  setPendingExamPatches?.(null);
  recordApiCallEvent?.({
    type: 'skippedExamine',
    label: 'Skipped course-map review',
    detail: 'CourseIR authoring — validation and compiler projection are the review gate',
  });
  setStreamProgress?.(100);
  setProgressStep?.('done');
  setStatus?.('done');
  setUserEdits?.([]);
  try {
    localStorage.removeItem(streamSaveKey);
  } catch {
    /* storage unavailable */
  }
  return courseMap;
}

export async function runDirectCourseIRGenerationFlow(input = [], output = []) {
  const [
    expectedLessonCount,
    sourceText,
    provider,
    apiKey,
    modelId,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    currentModelName,
    streamProvider,
    recordApiCallEvent,
    updateGenerationProgress,
    fullTextRef,
  ] = input;
  const [
    workingModelRef,
    setCourseMap,
    courseMapRef,
    setIsStreaming,
    setStreamDetail,
    stoppedTextRef,
    stoppedPromptRef,
    pushVersion,
    addLog,
    setCompletenessInfo,
    detected,
    setOldCourseMap,
    setExamChanges,
    setPendingExamPatches,
    setStreamProgress,
    setProgressStep,
    setStatus,
    setUserEdits,
    streamSaveKey,
    clearNativeSkeleton,
  ] = output;

  try {
    const direct = await tryAuthorDirectCourseIR({
      expectedLessonCount,
      sourceText,
      provider,
      apiKey,
      modelId,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      currentModelName,
      streamProvider,
      recordApiCallEvent,
      updateGenerationProgress,
      fullTextRef,
    });
    if (direct.fallbackReason) throw new Error(direct.fallbackReason);
    if (!direct.ok) return null;
    return applyDirectCourseIRGenerationResult({
      direct,
      provider,
      apiKey,
      modelId,
      workingModelRef,
      setCourseMap,
      courseMapRef,
      setIsStreaming,
      setStreamDetail,
      stoppedTextRef,
      stoppedPromptRef,
      pushVersion,
      addLog,
      currentModelName,
      setCompletenessInfo,
      expectedLessonCount,
      detected,
      setOldCourseMap,
      setExamChanges,
      setPendingExamPatches,
      recordApiCallEvent,
      setStreamProgress,
      setProgressStep,
      setStatus,
      setUserEdits,
      streamSaveKey,
      clearNativeSkeleton,
    });
  } catch (courseIRErr) {
    if (courseIRErr?.name === 'AbortError') throw courseIRErr;
    recordApiCallEvent?.({
      type: 'courseIRAuthoringFellBack',
      label: 'CourseIR direct authoring fell back',
      detail: courseIRErr?.message || 'CourseIR authoring unavailable',
    });
    addLog?.(
      currentModelName,
      `CourseIR direct authoring failed (${courseIRErr?.message || 'unavailable'}) — trying native graph authoring`,
      'warning',
    );
    setIsStreaming?.(true);
    setStreamProgress?.(0);
    return null;
  }
}

export async function runNativeAuthoring(input = [], output = []) {
  const [
    sourceText,
    provider,
    apiKey,
    modelId,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    currentModelName,
    streamProvider,
    recordApiCallEvent,
    updateGenerationProgress,
    fullTextRef,
    detected,
    streamSaveKey,
  ] = input;
  const expectedLessonCount = Number.isInteger(detected?.expected) && detected.expected > 0 ? detected.expected : null;
  const [
    workingModelRef,
    setCourseMap,
    courseMapRef,
    setIsStreaming,
    setStreamDetail,
    stoppedTextRef,
    stoppedPromptRef,
    pushVersion,
    addLog,
    setCompletenessInfo,
    setOldCourseMap,
    setExamChanges,
    setPendingExamPatches,
    setStreamProgress,
    setProgressStep,
    setStatus,
    setUserEdits,
  ] = output;

  // Anonymous Scion only implements the compact course-map contract. Sending
  // the native CourseIR/skeleton contracts through its prompt wrapper returns
  // lesson JSON, guarantees a schema rejection, and wastes a provider call.
  if (provider === 'public') {
    recordApiCallEvent?.({
      type: 'pipelineDecision',
      stage: 'courseIRAuthoring',
      label: 'Native authoring plan',
      detail: 'skipped: Scion Draft uses the compact course-map contract; native skeleton authoring is unavailable',
    });
    return null;
  }

  if (expectedLessonCount) {
    const courseIRMap = await runDirectCourseIRGenerationFlow(
      [
        expectedLessonCount,
        sourceText,
        provider,
        apiKey,
        modelId,
        maxOutputTokens,
        modelCapabilities,
        generationPlan,
        currentModelName,
        streamProvider,
        recordApiCallEvent,
        updateGenerationProgress,
        fullTextRef,
      ],
      [
        workingModelRef,
        setCourseMap,
        courseMapRef,
        setIsStreaming,
        setStreamDetail,
        stoppedTextRef,
        stoppedPromptRef,
        pushVersion,
        addLog,
        setCompletenessInfo,
        detected,
        setOldCourseMap,
        setExamChanges,
        setPendingExamPatches,
        setStreamProgress,
        setProgressStep,
        setStatus,
        setUserEdits,
        streamSaveKey,
        () => import('./nativeGraphAuthoring.js').then(({ stashNativeSkeleton }) => stashNativeSkeleton(null)),
      ],
    );
    if (courseIRMap) return courseIRMap;
  }

  const { runNativeSkeletonGenerationFlow } = await import('./nativeSkeletonGenerationRuntime.js');
  return runNativeSkeletonGenerationFlow(
    [
      sourceText,
      provider,
      apiKey,
      modelId,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      currentModelName,
      streamProvider,
      recordApiCallEvent,
      updateGenerationProgress,
      fullTextRef,
      detected,
      streamSaveKey,
    ],
    output,
  );
}

export function takeDirectCourseIRCompileState(courseMap, reporters = []) {
  const [recordGenerationApiCallEvent, appendLog] = reporters;
  const directCourseIR = takeCourseIR(courseMap);
  if (!directCourseIR) return { courseIR: null, state: null, blueprintEnrichment: null, rejectedReason: '' };
  const validation = validateCourseIR(directCourseIR);
  const acceptance = assessCourseIRDirectAuthoring(validation);
  if (!acceptance.accepted) {
    recordGenerationApiCallEvent?.({
      type: 'courseIRAuthoringFellBack',
      label: 'CourseIR direct authoring fell back',
      detail: acceptance.reason,
    });
    appendLog?.(`CourseIR direct authoring rejected (${acceptance.reason}) — compiling through fallback path`, 'warn');
    return {
      courseIR: directCourseIR,
      state: null,
      blueprintEnrichment: null,
      rejectedReason: acceptance.reason,
    };
  }
  const projection = courseIRToCourseGraph(validation.ir);
  projection.graph.courseIR = {
    ...(projection.graph.courseIR || {}),
    stats: validation.stats,
    directAuthoring: {
      source: 'provider-courseir',
      projectedThrough: 'curriculumv1',
      accepted: true,
    },
  };
  return {
    courseIR: directCourseIR,
    state: { ...projection, validation, acceptance },
    blueprintEnrichment: {
      ...projection.enrichmentOverlay,
      coverage: {
        requestedLessons: validation.stats.lessons,
        enrichedLessons: validation.stats.lessons,
        missingLessons: [],
      },
      stageDecisions: {
        genomeLinker: 'skipped: CourseIR already carries concept/prerequisite links',
        modelStage: 'skipped: direct CourseIR compiler projection',
      },
      quality: {
        ...(projection.enrichmentOverlay?.quality || {}),
        source: 'courseir-v1',
      },
    },
    rejectedReason: '',
  };
}
