import { completeCourseMapGeneration } from './generationCompletionRuntime.js';

export async function runNativeSkeletonGenerationFlow(input = [], output = []) {
  const [
    skeletonSource,
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

  let nativeAuthoring = null;
  try {
    const [nativeAuthoringModule, nativeSkeletonPrompts] = await Promise.all([
      import('./nativeGraphAuthoring.js'),
      import('./nativeSkeletonPrompts.js'),
    ]);
    nativeAuthoring = nativeAuthoringModule;
    const skeletonUserPrompt = nativeSkeletonPrompts.buildNativeSkeletonUserPrompt(skeletonSource, {
      expectedLessons: detected?.expected || null,
      confidence: detected?.confidence || null,
    });
    if (fullTextRef) fullTextRef.current = '';
    recordApiCallEvent?.({
      type: 'nativeSkeletonCall',
      label: 'Native graph authoring — Pass A skeleton',
      detail: `${currentModelName} · typed skeleton (sessions, assessments, readings, resources)`,
    });
    const skeletonResult = await streamProvider(
      provider,
      apiKey,
      modelId,
      nativeSkeletonPrompts.NATIVE_SKELETON_SYSTEM_PROMPT,
      skeletonUserPrompt,
      {
        maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
        modelCapabilities,
        generationPlan,
        task: 'nativeSkeleton',
        onApiCallEvent: recordApiCallEvent,
        onChunk: (text, count) => {
          if (fullTextRef) fullTextRef.current = text;
          updateGenerationProgress?.(text, count);
        },
      },
    );
    const skeleton = nativeAuthoring.parseNativeSkeletonResponse(skeletonResult?.fullText || '', {
      expectedLessons: detected?.confidence === 'high' ? detected?.expected || null : null,
      sourceText: skeletonSource,
    });
    const nativeMap = nativeAuthoring.buildNativeWireMap(skeleton);
    nativeAuthoring.stashNativeSkeleton(skeleton);
    return completeCourseMapGeneration(
      [
        nativeMap,
        provider,
        apiKey,
        modelId,
        currentModelName,
        'Initial generation (native graph authoring)',
        `Pass A skeleton: ${skeleton.sessions.length} sessions, ${skeleton.assessments.length} assessments, ${skeleton.readings.length} named readings, ${(skeleton.resources || []).length} resources`,
        'success',
        detected?.expected || skeleton.sessions.length,
        skeleton.sessions.length,
        detected?.confidence || 'high',
        detected?.expected && skeleton.sessions.length < detected.expected ? 'incomplete' : 'complete',
        'native authoring — Pass B authors lesson content next',
        streamSaveKey,
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
        setOldCourseMap,
        setExamChanges,
        setPendingExamPatches,
        recordApiCallEvent,
        setStreamProgress,
        setProgressStep,
        setStatus,
        setUserEdits,
      ],
    );
  } catch (nativeErr) {
    if (nativeErr?.name === 'AbortError') throw nativeErr;
    const reason =
      nativeErr?.name === 'NativeAuthoringError' ||
      (nativeAuthoring?.NativeAuthoringError && nativeErr instanceof nativeAuthoring.NativeAuthoringError)
        ? `${nativeErr.code}: ${nativeErr.message}`
        : nativeErr?.message || 'unknown error';
    nativeAuthoring?.stashNativeSkeleton?.(null);
    recordApiCallEvent?.({
      type: 'nativeAuthoringFellBack',
      label: 'Native authoring fell back to prose',
      detail: reason,
    });
    addLog?.(
      currentModelName,
      `Native graph authoring failed (${reason}) — falling back to the prose course-map path`,
      'warning',
    );
    setIsStreaming?.(true);
    setStreamProgress?.(0);
    return null;
  }
}
