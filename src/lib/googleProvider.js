export const GOOGLE_ENDPOINT_FAMILIES = {
  GEMINI_API: 'gemini-api',
  VERTEX_EXPRESS: 'vertex-express',
};

export function isVertexKey(apiKey) {
  const key = String(apiKey || '').trim();
  return Boolean(key && !key.startsWith('AIza') && key.length > 39);
}

export function normalizeGoogleModelId(modelId = '') {
  return String(modelId || '')
    .replace(/^models\//, '')
    .replace(/^publishers\/google\/models\//, '');
}

export function getGoogleEndpointFamily(apiKey, modelId = '', preferredEndpointFamily = '') {
  if (preferredEndpointFamily === GOOGLE_ENDPOINT_FAMILIES.GEMINI_API) return GOOGLE_ENDPOINT_FAMILIES.GEMINI_API;
  if (preferredEndpointFamily === GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS)
    return GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS;
  if (String(modelId || '').startsWith('publishers/google/models/')) return GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS;
  return isVertexKey(apiKey) ? GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS : GOOGLE_ENDPOINT_FAMILIES.GEMINI_API;
}

export function getGoogleModelBaseUrl(apiKey, modelId, endpointFamily = '') {
  const id = normalizeGoogleModelId(modelId);
  const family = getGoogleEndpointFamily(apiKey, modelId, endpointFamily);
  return family === GOOGLE_ENDPOINT_FAMILIES.VERTEX_EXPRESS
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${id}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${id}`;
}
