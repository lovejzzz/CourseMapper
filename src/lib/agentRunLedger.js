export const AGENT_RUN_LEDGER_PROTOCOL = 'coursemapper-agent-run-ledger-v1';
export const AGENT_RUN_CHECKPOINT_KEY = 'coursemapper-agent-run-checkpoint-v1';
export const AGENT_RUN_RECOVERY_HINT =
  '[SYSTEM] A previous run for this same request was interrupted. Re-inspect the current workspace before editing; do not assume an unfinished tool call either succeeded or failed.';

const MAX_LEDGER_EVENTS = 80;
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function fingerprint(value) {
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(canonicalize(value));
  } catch {
    text = String(value);
  }
  text = String(text ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function requestFingerprint(request) {
  return fingerprint(
    String(request || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase(),
  );
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function summarizeOutcome(result = {}) {
  if (!result || typeof result !== 'object') return { value: result };
  const details = Array.isArray(result.details)
    ? result.details.slice(0, 20).map((detail) => ({
        success: detail?.success !== false,
        action: detail?.action || detail?.patch || '',
        featureId: detail?.featureId || '',
        lessonIndex: Number.isInteger(detail?.lessonIndex) ? detail.lessonIndex : null,
        message: String(detail?.message || '').slice(0, 160),
      }))
    : [];
  return {
    error: String(result.error || '').slice(0, 240),
    applied: finiteCount(result.applied),
    started: finiteCount(result.started),
    pending: finiteCount(result.pending),
    failed: finiteCount(result.failed),
    totalItems: finiteCount(result.totalItems),
    errorCount: finiteCount(result.errorCount),
    warningCount: finiteCount(result.warningCount),
    blockerCount: finiteCount(result.blockerCount),
    details,
  };
}

function resultStatus(result = {}) {
  const outcome = summarizeOutcome(result);
  if (outcome.error) return 'failed';
  if (outcome.failed > 0) {
    return outcome.applied + outcome.started + outcome.pending > 0 ? 'partial' : 'failed';
  }
  return 'completed';
}

function mutationProgress(result = {}) {
  const outcome = summarizeOutcome(result);
  return outcome.applied + outcome.started + outcome.pending;
}

function appendEvents(ledger, events) {
  return [...(ledger.events || []), ...events].slice(-MAX_LEDGER_EVENTS);
}

function nextRevision(ledger) {
  return Math.max(0, Number(ledger?.revision || 0)) + 1;
}

export function createAgentRunLedger({
  runId,
  request = '',
  executionMode = 'apply',
  modelId = '',
  maxIterations = 20,
  recoveredFromRunId = null,
  now = Date.now(),
} = {}) {
  return {
    protocol: AGENT_RUN_LEDGER_PROTOCOL,
    version: 1,
    runId: String(runId || `agent-run-${now}`),
    requestFingerprint: requestFingerprint(request),
    executionMode: String(executionMode || 'apply'),
    modelId: String(modelId || ''),
    maxIterations: Math.max(1, Number(maxIterations) || 20),
    status: 'running',
    stopReason: '',
    revision: 1,
    progressRevision: 0,
    providerCallCount: 0,
    ...(recoveredFromRunId ? { recoveredFromRunId: String(recoveredFromRunId) } : {}),
    events: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function recordAgentProviderCall(ledger, { iteration = 0, now = Date.now() } = {}) {
  if (!ledger) return ledger;
  const providerCallCount = Math.max(Number(ledger.providerCallCount || 0), Number(iteration) + 1);
  return {
    ...ledger,
    revision: nextRevision(ledger),
    providerCallCount,
    updatedAt: now,
    events: appendEvents(ledger, [
      {
        type: 'turn.started',
        iteration: Number(iteration) + 1,
        status: 'in_progress',
        at: now,
      },
    ]),
  };
}

export function recordAgentToolBatch(
  ledger,
  { toolCalls = [], toolResults = [], iteration = 0, now = Date.now() } = {},
) {
  if (!ledger) return ledger;
  const priorToolEvents = (ledger.events || []).filter((event) => event.type === 'tool.completed');
  let progressRevision = Number(ledger.progressRevision || 0);

  const events = toolCalls.map((toolCall, index) => {
    const result = toolResults[index]?.result || {};
    const signature = fingerprint({ name: toolCall?.name || '', args: toolCall?.args || {} });
    // The fingerprint is kept only in memory. Persisted checkpoints retain
    // lifecycle metadata, never raw tool output.
    const outcomeFingerprint = fingerprint(result);
    const priorMatches = priorToolEvents.filter((event) => event.signature === signature);
    const previous = priorMatches[priorMatches.length - 1];
    const status = resultStatus(result);
    const outcomeChanged = !previous || previous.outcomeFingerprint !== outcomeFingerprint;
    const madeProgress = status !== 'failed' && (mutationProgress(result) > 0 || outcomeChanged);
    const noProgressRepeat = madeProgress ? 0 : previous ? Number(previous.noProgressRepeat || 0) + 1 : 0;
    if (madeProgress) progressRevision += 1;
    return {
      type: 'tool.completed',
      iteration: Number(iteration) + 1,
      tool: String(toolCall?.name || toolResults[index]?.toolName || 'unknown'),
      status,
      signature,
      outcomeFingerprint,
      madeProgress,
      noProgressRepeat,
      at: now,
    };
  });

  return {
    ...ledger,
    revision: nextRevision(ledger),
    progressRevision,
    updatedAt: now,
    events: appendEvents(ledger, events),
  };
}

export function findAgentNoProgressLoop(ledger, { threshold = 3 } = {}) {
  const minimum = Math.max(2, Number(threshold) || 3);
  const events = (ledger?.events || []).filter((event) => event.type === 'tool.completed');
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.madeProgress) continue;
    if (Number(event.noProgressRepeat || 0) >= minimum - 1) {
      return { tool: event.tool, signature: event.signature, repeats: minimum };
    }
  }
  return null;
}

export function finalizeAgentRunLedger(ledger, { status = 'completed', stopReason = '', now = Date.now() } = {}) {
  if (!ledger) return ledger;
  const terminalStatus = ['completed', 'failed', 'aborted', 'interrupted'].includes(status) ? status : 'failed';
  return {
    ...ledger,
    status: terminalStatus,
    stopReason: String(stopReason || ''),
    revision: nextRevision(ledger),
    updatedAt: now,
    endedAt: now,
    events: appendEvents(ledger, [
      {
        type: terminalStatus === 'failed' ? 'turn.failed' : 'turn.completed',
        status: terminalStatus,
        stopReason: String(stopReason || ''),
        at: now,
      },
    ]),
  };
}

export function toAgentRunCheckpoint(ledger) {
  if (!ledger || ledger.protocol !== AGENT_RUN_LEDGER_PROTOCOL) return null;
  return {
    protocol: ledger.protocol,
    version: ledger.version,
    runId: ledger.runId,
    requestFingerprint: ledger.requestFingerprint,
    executionMode: ledger.executionMode,
    modelId: ledger.modelId,
    maxIterations: ledger.maxIterations,
    status: ledger.status,
    stopReason: ledger.stopReason,
    revision: ledger.revision,
    progressRevision: ledger.progressRevision,
    providerCallCount: ledger.providerCallCount,
    ...(ledger.recoveredFromRunId ? { recoveredFromRunId: ledger.recoveredFromRunId } : {}),
    events: (ledger.events || []).slice(-MAX_LEDGER_EVENTS).map((event) => ({
      type: event.type,
      iteration: event.iteration,
      tool: event.tool,
      status: event.status,
      madeProgress: event.madeProgress,
      noProgressRepeat: event.noProgressRepeat,
      at: event.at,
      stopReason: event.stopReason,
    })),
    startedAt: ledger.startedAt,
    updatedAt: ledger.updatedAt,
    ...(ledger.endedAt ? { endedAt: ledger.endedAt } : {}),
  };
}

function defaultSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function saveAgentRunCheckpoint(ledger, storage = defaultSessionStorage()) {
  const checkpoint = toAgentRunCheckpoint(ledger);
  if (!storage || !checkpoint) return false;
  try {
    storage.setItem(AGENT_RUN_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    return true;
  } catch {
    return false;
  }
}

export function loadAgentRunCheckpoint(storage = defaultSessionStorage()) {
  if (!storage) return null;
  try {
    const checkpoint = JSON.parse(storage.getItem(AGENT_RUN_CHECKPOINT_KEY) || 'null');
    if (!checkpoint || checkpoint.protocol !== AGENT_RUN_LEDGER_PROTOCOL || !checkpoint.runId) return null;
    return checkpoint;
  } catch {
    return null;
  }
}

export function findRecoverableAgentRun(request, { storage = defaultSessionStorage(), now = Date.now() } = {}) {
  const checkpoint = loadAgentRunCheckpoint(storage);
  if (!checkpoint || checkpoint.status !== 'running') return null;
  if (checkpoint.requestFingerprint !== requestFingerprint(request)) return null;
  if (now - Number(checkpoint.updatedAt || 0) > RECOVERY_WINDOW_MS) return null;
  return checkpoint;
}
