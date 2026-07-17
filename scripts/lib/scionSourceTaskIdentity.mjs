import crypto from 'node:crypto';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function inferKind(value) {
  const explicit = normalize(value?.kind).toLowerCase();
  if (['mc-item', 'key-term'].includes(explicit)) return explicit;
  const artifact = value?.presentation?.[0]?.artifact || value?.artifact || value?.chosen || value?.left;
  if (artifact && typeof artifact === 'object' && !Array.isArray(artifact)) {
    if ('q' in artifact || 'op' in artifact || 'question' in artifact || 'options' in artifact) return 'mc-item';
    if ('tr' in artifact || 'df' in artifact || 'term' in artifact || 'definition' in artifact) return 'key-term';
  }
  return '';
}

export function scionSourceKernelPayload(value = {}) {
  const sourceContext = value.sourceContext || {};
  return canonicalize({
    domain: normalize(value.domain || value?.context?.domain).toLowerCase(),
    kernelId: normalize(sourceContext.kernelId).toLowerCase(),
    term: normalize(sourceContext.term),
    claims: Array.isArray(sourceContext.claims) ? sourceContext.claims.map(normalize) : [],
    attribution: Array.isArray(sourceContext.attribution) ? sourceContext.attribution.map(normalize) : [],
    license: normalize(sourceContext.license),
  });
}

export function scionSourceKernelSha256(value = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(scionSourceKernelPayload(value)))
    .digest('hex');
}

export function scionSourceTaskPayload(value = {}) {
  return canonicalize({
    ...scionSourceKernelPayload(value),
    kind: inferKind(value),
  });
}

export function scionSourceTaskSha256(value = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(scionSourceTaskPayload(value)))
    .digest('hex');
}
