const SECRET_KEY_NAMES = new Set([
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
  { label: 'OpenAI API key', pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'OpenRouter API key', pattern: /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Generic API key', pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: 'Bearer token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i },
];

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[-_\s.]/g, '');
}

function isSensitiveKey(key) {
  return SECRET_KEY_NAMES.has(normalizeKey(key));
}

function pathForChild(path, key) {
  if (typeof key === 'number') return `${path || 'root'}[${key}]`;
  return path ? `${path}.${key}` : key;
}

function summarizeSecretKind(value) {
  const text = String(value || '');
  const match = SECRET_VALUE_PATTERNS.find(item => item.pattern.test(text));
  return match?.label || 'secret-like value';
}

function addFinding(findings, path, message, kind) {
  findings.push({
    level: 'error',
    path: path || 'root',
    message,
    kind,
  });
}

export function getDeveloperSecretFindings(value, basePath = '') {
  const findings = [];
  const seen = new Set();

  function visit(node, path, key = '') {
    const keyIsSensitive = isSensitiveKey(key);
    const findingKey = `${path}:${key}`;

    if (keyIsSensitive && node !== undefined && node !== null && String(node).trim() !== '') {
      if (!seen.has(findingKey)) {
        seen.add(findingKey);
        addFinding(
          findings,
          path,
          `Sensitive field "${key}" should not be stored in Developer Mode snapshots, templates, or history.`,
          'sensitive-field',
        );
      }
    }

    if (typeof node === 'string') {
      const secretKind = summarizeSecretKind(node);
      if (secretKind !== 'secret-like value') {
        addFinding(findings, path, `${secretKind} detected. Remove it before applying or saving developer state.`, 'secret-value');
      }
      return;
    }

    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, pathForChild(path, index), index));
      return;
    }

    Object.entries(node).forEach(([childKey, childValue]) => {
      visit(childValue, pathForChild(path, childKey), childKey);
    });
  }

  visit(value, basePath);
  return findings;
}

export function assertNoDeveloperSecrets(value, label = 'Developer data') {
  const finding = getDeveloperSecretFindings(value)[0];
  if (finding) {
    throw new Error(`${label} contains a secret at ${finding.path}: ${finding.message}`);
  }
}
