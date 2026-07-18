const SETUP_RECOVERY_KEY = 'coursemapper:setup-recovery:v1';
const SETUP_RECOVERY_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_PROMPT_CHARS = 32_000;
const MAX_ATTACHMENT_NAMES = 12;

const RECOVERABLE_ACTIONS = new Set(['continue', 'quickStart']);

function storage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function normalizeAction(action) {
  const type = String(action?.type || '');
  return RECOVERABLE_ACTIONS.has(type) ? { type } : null;
}

export function stageSetupRecovery({ promptText = '', files = [], action = null } = {}) {
  const target = storage();
  const normalizedAction = normalizeAction(action);
  if (!target || !normalizedAction) return null;

  const attachmentNames = (Array.isArray(files) ? files : [])
    .map((file) => String(file?.name || '').trim())
    .filter(Boolean)
    .slice(0, MAX_ATTACHMENT_NAMES);
  const recovery = {
    version: 1,
    savedAt: Date.now(),
    promptText: String(promptText || '').slice(0, MAX_PROMPT_CHARS),
    action: normalizedAction,
    attachmentNames,
    hadAttachments: attachmentNames.length > 0,
  };

  try {
    target.setItem(SETUP_RECOVERY_KEY, JSON.stringify(recovery));
    return recovery;
  } catch {
    return null;
  }
}

export function readSetupRecovery({ now = Date.now(), maxAgeMs = SETUP_RECOVERY_MAX_AGE_MS } = {}) {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(SETUP_RECOVERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const action = normalizeAction(parsed?.action);
    const savedAt = Number(parsed?.savedAt);
    if (!action || !Number.isFinite(savedAt) || now - savedAt < 0 || now - savedAt > maxAgeMs) {
      target.removeItem(SETUP_RECOVERY_KEY);
      return null;
    }
    const attachmentNames = (Array.isArray(parsed?.attachmentNames) ? parsed.attachmentNames : [])
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .slice(0, MAX_ATTACHMENT_NAMES);
    return {
      version: 1,
      savedAt,
      promptText: String(parsed?.promptText || '').slice(0, MAX_PROMPT_CHARS),
      action,
      attachmentNames,
      hadAttachments: Boolean(parsed?.hadAttachments || attachmentNames.length > 0),
    };
  } catch {
    try {
      target.removeItem(SETUP_RECOVERY_KEY);
    } catch {}
    return null;
  }
}

export function clearSetupRecovery() {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(SETUP_RECOVERY_KEY);
  } catch {}
}

export { SETUP_RECOVERY_KEY, SETUP_RECOVERY_MAX_AGE_MS };
