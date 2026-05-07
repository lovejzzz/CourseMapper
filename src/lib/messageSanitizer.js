const SECRET_FIELD_NAMES = new Set(['apikey', 'accesstoken', 'refreshtoken', 'idtoken', 'authorization']);

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[-_\s]/g, '');
}

export function stripMessageSecrets(value) {
  if (Array.isArray(value)) return value.map(stripMessageSecrets);

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nested]) => {
      if (SECRET_FIELD_NAMES.has(normalizeKey(key))) return acc;
      acc[key] = stripMessageSecrets(nested);
      return acc;
    }, {});
  }

  return value;
}

export function sanitizeMessagesForPersistence(messages) {
  if (!Array.isArray(messages)) return [];
  return stripMessageSecrets(messages);
}
