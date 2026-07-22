import { assessCourseIRDirectAuthoring, courseIRToCourseGraph, takeCourseIR, validateCourseIR } from './courseIR';

export async function tryAuthorDirectCourseIR({ expectedLessonCount, streamProvider, recordApiCallEvent } = {}) {
  if (!expectedLessonCount || !streamProvider) return { ok: false, skipped: true };
  // The whole-course CourseIR experiment has never passed its own acceptance
  // gate on Scion, paid mini, or the pinned GPT-5.6-Sol reference. The Sol
  // run spent 139 seconds and $0.35 producing 48k discarded characters before
  // the exact same native skeleton path ran. Skip that measured dead branch
  // for every provider: compiler architecture must not penalize a paid model.
  const courseIRPlan = {
    strategy: 'native-skeleton-measured',
    plannedCalls: 0,
    lessonCount: expectedLessonCount,
  };
  recordApiCallEvent?.({
    type: 'pipelineDecision',
    stage: 'courseIRAuthoring',
    label: 'CourseIR direct authoring plan',
    detail: 'skipped: measured native skeleton path (whole-course CourseIR acceptance remains unproven)',
  });
  return { ok: false, skipped: true, courseIRPlan };
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

  // Public Scion now supports the same small typed skeleton as the local
  // harness. Skip the larger whole-CourseIR experiment and go straight to
  // that measured one-call structure boundary.
  if (provider === 'public') {
    recordApiCallEvent?.({
      type: 'pipelineDecision',
      stage: 'courseIRAuthoring',
      label: 'Native authoring plan',
      detail: 'public Scion · one typed skeleton call before lesson-kernel authoring',
    });
  }

  if (provider !== 'public' && expectedLessonCount) {
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
