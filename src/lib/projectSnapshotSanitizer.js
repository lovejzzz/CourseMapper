const SECRET_FIELD_NAMES = new Set([
  'apikey',
  'xapikey',
  'accesskey',
  'secretkey',
  'clientsecret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'bearertoken',
  'openaikey',
  'anthropickey',
  'openrouterkey',
  'deepseekkey',
]);

const SECRET_VALUE_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
];

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[-_\s.]/g, '');
}

function isSecretFieldName(key) {
  return SECRET_FIELD_NAMES.has(normalizeKey(key));
}

function redactSecretText(value) {
  return SECRET_VALUE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[redacted secret]'),
    String(value || ''),
  );
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sanitizeProjectSnapshot(value) {
  if (Array.isArray(value)) return value.map(sanitizeProjectSnapshot);

  if (value && typeof value === 'object') {
    if (!isPlainObject(value)) return value;
    return Object.entries(value).reduce((acc, [key, nested]) => {
      if (isSecretFieldName(key)) return acc;
      acc[key] = sanitizeProjectSnapshot(nested);
      return acc;
    }, {});
  }

  if (typeof value === 'string') return redactSecretText(value);
  return value;
}
