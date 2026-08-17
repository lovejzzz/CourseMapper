export const AGENT_ACTION_ENVELOPE_PROTOCOL = 'coursemapper-agent-action-envelope-v1';

const READ_ONLY_ACTIONS = new Set(['inspect', 'audit', 'answer', 'explain']);
let actionSequence = 0;

function cleanText(value, max = 240) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function actionTarget(action = {}) {
  const featureId = cleanText(action.featureId || 'courseMap', 80);
  const lesson = Number.isInteger(action.lessonIndex) ? `lesson:${action.lessonIndex + 1}` : null;
  const field = cleanText(action.field || (Array.isArray(action.path) ? action.path.join('.') : action.path), 160);
  return unique([featureId, lesson, field]).join('/');
}

function nextActionId(now) {
  actionSequence += 1;
  return `agent-action-${now}-${actionSequence}`;
}

export function createAgentActionEnvelope({
  actions,
  previews = [],
  title = '',
  planReceiptSha256 = null,
  sourceReceipts = [],
  undoSnapshotId = null,
  now = Date.now(),
  actionId = null,
} = {}) {
  const actionList = (Array.isArray(actions) ? actions : [actions]).filter(
    (action) => action && typeof action === 'object',
  );
  if (actionList.length === 0) throw new Error('An Agent action envelope requires at least one action.');
  const readOnly = actionList.every((action) => READ_ONLY_ACTIONS.has(action.type));
  return {
    protocol: AGENT_ACTION_ENVELOPE_PROTOCOL,
    version: 1,
    actionId: actionId || nextActionId(now),
    title: cleanText(title || 'Workspace change'),
    actionKind: actionList.length > 1 ? 'changeset' : cleanText(actionList[0].type, 80),
    safetyMode: readOnly ? 'read-only' : 'needs-approval',
    status: readOnly ? 'ready' : 'preview',
    targets: unique(actionList.map(actionTarget)),
    affectedDeliverables: unique(actionList.map((action) => cleanText(action.featureId || 'courseMap', 80))),
    actions: structuredClone(actionList),
    previews: structuredClone(previews),
    lineage: {
      planReceiptSha256: cleanText(planReceiptSha256, 64) || null,
      sourceReceipts: unique(sourceReceipts.map((receipt) => cleanText(receipt, 128))),
    },
    execution: { status: 'pending', message: null, appliedCount: 0 },
    verification: {
      status: 'prevalidated',
      checks: ['schema-and-target-prevalidation'],
      semanticPackageCheck: 'recommended-after-apply',
    },
    undo: { available: !readOnly, snapshotId: cleanText(undoSnapshotId, 160) || null },
    createdAt: new Date(now).toISOString(),
  };
}

export function resolveAgentActionEnvelope(envelope, { status, message = '', appliedCount = 0 } = {}) {
  if (envelope?.protocol !== AGENT_ACTION_ENVELOPE_PROTOCOL) {
    throw new Error('Unrecognized Agent action envelope.');
  }
  if (!['applied', 'failed', 'rejected'].includes(status)) {
    throw new Error('Agent action envelope resolution must be applied, failed, or rejected.');
  }
  const applied = status === 'applied';
  return {
    ...envelope,
    status,
    execution: {
      status: applied ? 'confirmed' : status,
      message: cleanText(message, 520) || null,
      appliedCount: Math.max(0, Number(appliedCount) || 0),
    },
    verification: applied
      ? {
          status: 'execution-confirmed',
          checks: unique([...(envelope.verification?.checks || []), 'executor-postcondition']),
          semanticPackageCheck: 'recommended',
        }
      : envelope.verification,
    resolvedAt: new Date().toISOString(),
  };
}
