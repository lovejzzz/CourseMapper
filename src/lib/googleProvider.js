export function isVertexKey(apiKey) {
  return Boolean(apiKey && !String(apiKey).startsWith('AIza') && String(apiKey).length > 39);
}

export function normalizeGoogleModelId(modelId = '') {
  return String(modelId || '')
    .replace(/^models\//, '')
    .replace(/^publishers\/google\/models\//, '');
}

export function getGoogleModelBaseUrl(apiKey, modelId) {
  const id = normalizeGoogleModelId(modelId);
  return isVertexKey(apiKey)
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${id}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${id}`;
}
