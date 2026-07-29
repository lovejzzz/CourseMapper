import { completeCourseMapGeneration } from './generationCompletionRuntime.js';
import { repairGeneratedCourseTitle } from './promptAwarePreview.js';
import { isNonFallbackScionRuntimeError } from './scionRuntimeErrors.js';

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
    // Scion (V2.1 D1): the skeleton's real contract ships as json_schema —
    // session count pinned (the 25-session hallucination class), assessments
    // required, concise titles directed.
    let skeletonSystemPrompt = nativeSkeletonPrompts.NATIVE_SKELETON_SYSTEM_PROMPT;
    let skeletonSchema = null;
    if ((provider === 'local' || provider === 'public') && detected?.expected) {
      const contracts = await import('./scionContracts.js');
      skeletonSchema = contracts.skeletonSchemaProfile({ sessionCount: detected.expected });
      skeletonSystemPrompt += contracts.SCION_SKELETON_DIRECTIVE;
    }
    const skeletonResult = await streamProvider(provider, apiKey, modelId, skeletonSystemPrompt, skeletonUserPrompt, {
      maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
      modelCapabilities,
      generationPlan,
      ...(skeletonSchema ? { schema: skeletonSchema } : {}),
      task: 'nativeSkeleton',
      onApiCallEvent: recordApiCallEvent,
      onChunk: (text, count) => {
        if (fullTextRef) fullTextRef.current = text;
        updateGenerationProgress?.(text, count);
      },
    });
    const skeleton = nativeAuthoring.parseNativeSkeletonResponse(skeletonResult?.fullText || '', {
      expectedLessons: detected?.confidence === 'high' ? detected?.expected || null : null,
      sourceText: skeletonSource,
    });
    if (skeleton?.course) {
      skeleton.course.name = repairGeneratedCourseTitle(skeleton.course.name, skeletonSource);
    }
    if (skeletonResult?.adaptiveRoute === 'scion-explicit-sequence-compiler') {
      const { attachScionCompilerRoute } = await import('./scionCompilerRoute.js');
      const route =
        (Array.isArray(skeletonResult.adapterRoutes) &&
          skeletonResult.adapterRoutes.find((entry) => entry?.exactLessonSequence === true)) ||
        null;
      attachScionCompilerRoute(skeleton, route);
      recordApiCallEvent?.({
        type: 'pipelineDecision',
        stage: 'courseIRAuthoring',
        label: 'Scion structure compiler',
        detail: `${skeleton.sessions.length} instructor-listed lessons projected into the typed skeleton · zero model download · zero model inference`,
      });
    }
    if (skeleton.responseRecovery) {
      recordApiCallEvent?.({
        type: 'nativeSkeletonRecovered',
        label: 'Recovered truncated native skeleton',
        detail: `${skeleton.sessions.length} complete sessions retained · deterministic per-session assessment cadence synthesized`,
      });
      addLog?.(
        currentModelName,
        `Recovered a truncated native skeleton after ${skeleton.sessions.length} complete sessions; rebuilt the assessment cadence deterministically`,
        'warning',
      );
    }
    if (skeleton.sessionSequenceRecovery) {
      recordApiCallEvent?.({
        type: 'nativeSkeletonRecovered',
        label: 'Recovered repeated native skeleton sessions',
        detail: `${skeleton.sessionSequenceRecovery.recoveredCount} instructor-listed session topics restored in source order`,
      });
      addLog?.(
        currentModelName,
        `Restored ${skeleton.sessionSequenceRecovery.recoveredCount} distinct session topics from the instructor's explicit lesson sequence`,
        'warning',
      );
    }
    if (skeleton.readingRecovery) {
      recordApiCallEvent?.({
        type: 'nativeSkeletonRecovered',
        label: 'Recovered instructor-named readings',
        detail: `${skeleton.readingRecovery.recoveredCount} explicitly listed reading titles restored with their due sessions`,
      });
      addLog?.(
        currentModelName,
        `Restored ${skeleton.readingRecovery.recoveredCount} instructor-named readings from the explicit source list`,
        'warning',
      );
    }
    if (skeleton.readingTopicRecovery) {
      recordApiCallEvent?.({
        type: 'nativeSkeletonRecovered',
        label: 'Aligned lesson topics to assigned readings',
        detail: `${skeleton.readingTopicRecovery.recoveredCount} lesson topic sets now begin at the instructor-named primary text boundary`,
      });
      addLog?.(
        currentModelName,
        `Aligned ${skeleton.readingTopicRecovery.recoveredCount} lesson topic sets to their instructor-assigned readings`,
        'success',
      );
    }
    if (skeleton.assessmentCadenceRecovery) {
      recordApiCallEvent?.({
        type: 'nativeSkeletonRecovered',
        label: 'Preserved instructor assessment plan',
        detail: `${skeleton.assessmentCadenceRecovery.cadenceCount} recurring assessment streams · ${skeleton.assessmentCadenceRecovery.oneOffCount} source-named milestones · ${skeleton.assessmentCadenceRecovery.droppedUnsupportedItemCount} unsupported model entries removed`,
      });
      addLog?.(
        currentModelName,
        `Preserved the instructor's assessment plan across all ${skeleton.sessions.length} lessons`,
        'success',
      );
    }
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
    if (provider === 'public' && isNonFallbackScionRuntimeError(nativeErr)) {
      nativeAuthoring?.stashNativeSkeleton?.(null);
      throw nativeErr;
    }
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
