const LOCAL_RUNTIME_FAILURE_RE =
  /(?:received abort signal from llama\.cpp|cannot find waiting task with callbackid|null function|runtimeerror:\s*unreachable|scion_wllama_runtime_unstable|scion_wllama_recovery_required)/i;

export function isLocalScionRuntimeFailure(error) {
  return LOCAL_RUNTIME_FAILURE_RE.test(String(error?.code || error?.message || error || ''));
}

export function getScionReviewFailureMessage(error) {
  if (isLocalScionRuntimeFailure(error)) {
    return 'Scion stopped early. Your course is safe—retry when Scion is ready.';
  }
  return 'Something interrupted the review. Your course is safe—retry when you are ready.';
}

export function getScionAgentFailureMessage(error) {
  if (isLocalScionRuntimeFailure(error)) {
    return 'Scion paused before it could answer. Your work is safe—please retry in a moment.';
  }
  return 'I couldn’t finish that request. Your work is safe—please try again.';
}
