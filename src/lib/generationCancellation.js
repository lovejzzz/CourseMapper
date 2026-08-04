export function beginGenerationEpoch(epochRef) {
  return Number(epochRef?.current) || 0;
}

export function cancelGenerationEpoch(epochRef) {
  epochRef.current = (Number(epochRef?.current) || 0) + 1;
  return epochRef.current;
}

export function isGenerationEpochCancelled(epochRef, generationEpoch) {
  return epochRef.current !== generationEpoch;
}

export function captureFeatureGenerationEpoch(featureEpochRef, featureId) {
  return Number(featureEpochRef?.current?.get(featureId)) || 0;
}

export function cancelFeatureGenerationEpoch(featureEpochRef, featureId) {
  const nextEpoch = captureFeatureGenerationEpoch(featureEpochRef, featureId) + 1;
  featureEpochRef.current.set(featureId, nextEpoch);
  return nextEpoch;
}

export function isFeatureGenerationEpochCancelled(featureEpochRef, featureId, featureEpoch) {
  return captureFeatureGenerationEpoch(featureEpochRef, featureId) !== featureEpoch;
}

export function createGenerationAbortController(
  epochRef,
  generationEpoch,
  AbortControllerClass = globalThis.AbortController,
) {
  if (isGenerationEpochCancelled(epochRef, generationEpoch)) return null;
  return new AbortControllerClass();
}

export function cancelGenerationFeatureActivity(operationRef, featureId) {
  for (const [operationId, featureIds] of operationRef.current) {
    featureIds.delete(featureId);
    if (featureIds.size === 0) operationRef.current.delete(operationId);
  }
}

export function readGenerationActivity(operationRef) {
  const features = new Set();
  for (const featureIds of operationRef.current.values()) {
    for (const featureId of featureIds) features.add(featureId);
  }
  return features;
}
