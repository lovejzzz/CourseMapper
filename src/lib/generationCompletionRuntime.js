export function completeCourseMapGeneration(input = [], output = []) {
  const [
    courseMap,
    provider,
    apiKey,
    modelId,
    currentModelName,
    versionLabel,
    logMessage,
    logType,
    expected,
    actual,
    confidence,
    completenessStatus,
    skippedExamineDetail,
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
    recordApiCallEvent,
    setStreamProgress,
    setProgressStep,
    setStatus,
    setUserEdits,
  ] = output;

  if (workingModelRef) workingModelRef.current = { provider, apiKey, modelId };
  setCourseMap?.(courseMap);
  if (courseMapRef) courseMapRef.current = courseMap;
  setIsStreaming?.(false);
  setStreamDetail?.('');
  if (stoppedTextRef) stoppedTextRef.current = '';
  if (stoppedPromptRef) stoppedPromptRef.current = null;
  pushVersion?.(courseMap, versionLabel);
  addLog?.(currentModelName, logMessage, logType);
  setCompletenessInfo?.({ expected, actual, confidence, status: completenessStatus });
  setOldCourseMap?.(null);
  setExamChanges?.([]);
  setPendingExamPatches?.(null);
  recordApiCallEvent?.({
    type: 'skippedExamine',
    label: 'Skipped course-map review',
    detail: skippedExamineDetail,
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
