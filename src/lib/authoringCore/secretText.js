const SECRET_VALUE_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
];

export function redactSecretText(value) {
  return SECRET_VALUE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[redacted secret]'),
    String(value || ''),
  );
}
