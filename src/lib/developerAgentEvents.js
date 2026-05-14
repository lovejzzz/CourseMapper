const MAX_SUMMARY_LENGTH = 180;

function redactText(value) {
  return String(value || '')
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{12,}/g, '[redacted key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]')
    .replace(/\b(access|refresh|id)[-_ ]?token\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}/gi, '$1 token=[redacted]');
}

function summarizeText(value, fallback = '') {
  const text = redactText(value || fallback)
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  return `${text.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
}

function eventLevel(status, fallback = 'info') {
  if (status === 'error' || status === 'failed') return 'error';
  if (status === 'partial' || status === 'partialFail') return 'warning';
  if (status === 'done' || status === 'complete' || status === 'success') return 'success';
  if (status === 'running' || status === 'pending' || status === 'syncing') return 'info';
  return fallback;
}

function formatFeatureList(items = []) {
  return items
    .map((item) => item?.featureId || item?.id || item)
    .filter(Boolean)
    .join(', ');
}

function addEvent(events, event) {
  events.push({
    id: `agent-event-${events.length}`,
    level: 'info',
    type: 'event',
    title: 'Agent event',
    summary: '',
    ...event,
  });
}

function addAgentProgressEvents(events, message, index) {
  const steps = Array.isArray(message.steps) ? message.steps : [];
  addEvent(events, {
    type: 'agentRun',
    level: eventLevel(message.status),
    title: message.status === 'running' ? 'Agent run in progress' : 'Agent run complete',
    summary: `${steps.length} tool step${steps.length === 1 ? '' : 's'}${message.thinkingText ? ` - ${summarizeText(message.thinkingText)}` : ''}`,
    status: message.status || 'running',
    sourceIndex: index,
  });

  steps.forEach((step, stepIndex) => {
    addEvent(events, {
      type: 'tool',
      level: eventLevel(step.status, 'success'),
      title: step.label || step.tool || 'Tool step',
      summary: summarizeText(step.summary || step.thought || step.tool || 'Tool step finished.'),
      status: step.status || 'done',
      tool: step.tool || '',
      sourceIndex: index,
      stepIndex,
    });
  });
}

function addChangeSummaryEvent(events, message, index) {
  const summary = message.summary || {};
  const failed = Number(summary.failed || 0) + (Array.isArray(summary.failedItems) ? summary.failedItems.length : 0);
  const applied = Number(summary.applied || 0) || (Array.isArray(summary.changes) ? summary.changes.length : 0);
  const level = failed > 0 ? (applied > 0 ? 'warning' : 'error') : 'success';
  const changedFeatures = Array.isArray(summary.changes) ? formatFeatureList(summary.changes) : '';
  addEvent(events, {
    type: 'changeSummary',
    level,
    title: failed > 0 ? 'Agent changes need review' : 'Agent changes applied',
    summary: summarizeText(
      `${applied} applied${failed ? `, ${failed} failed` : ''}${changedFeatures ? ` - ${changedFeatures}` : ''}`,
      summary.message,
    ),
    status: message.status || '',
    sourceIndex: index,
  });
}

function addPackageSummaryEvent(events, message, index) {
  const summary = message.summary || {};
  const level =
    summary.tone === 'blocked' || summary.confidence === 'Needs attention'
      ? 'error'
      : summary.tone === 'assumptions' || summary.confidence === 'Good with assumptions'
        ? 'warning'
        : 'success';
  addEvent(events, {
    type: 'packageSummary',
    level,
    title: 'Package readiness',
    summary: summarizeText(
      `${summary.confidence || 'Unknown'} - ${summary.repairsApplied || 0} safe repair(s), ${summary.blockerCount || 0} blocker(s), ${summary.warningCount || 0} warning(s)`,
      summary.nextAction,
    ),
    status: summary.confidence || '',
    sourceIndex: index,
  });
}

function addProposalEvent(events, message, index) {
  const proposal = message.proposal || {};
  const options = Array.isArray(proposal.options) ? proposal.options.length : 0;
  addEvent(events, {
    type: 'proposal',
    level: eventLevel(message.status),
    title: 'Agent proposal',
    summary: summarizeText(
      `${proposal.title || proposal.question || 'Proposal'}${options ? ` - ${options} options` : ''}`,
    ),
    status: message.status || '',
    sourceIndex: index,
  });
}

function addDiffReviewEvent(events, message, index) {
  const diff = message.diff || {};
  addEvent(events, {
    type: 'diffReview',
    level: eventLevel(message.status),
    title: 'Diff review',
    summary: summarizeText(
      diff.summary || diff.title || `${Array.isArray(diff.changes) ? diff.changes.length : 0} changes`,
    ),
    status: message.status || '',
    sourceIndex: index,
  });
}

function addSyncSuggestionEvent(events, message, index) {
  addEvent(events, {
    type: 'syncSuggestion',
    level: eventLevel(message.status),
    title: 'Sync suggestion',
    summary: summarizeText(
      formatFeatureList(message.plan) || message.changedFieldsSummary || 'Dependency sync suggestion',
    ),
    status: message.status || 'pending',
    sourceIndex: index,
  });
}

function addValidationEvent(events, message, index) {
  const findings = message.report?.findings || message.report?.issues || [];
  addEvent(events, {
    type: 'validation',
    level: findings.some((finding) => finding?.severity === 'error' || finding?.level === 'error') ? 'error' : 'info',
    title: 'Validation report',
    summary: `${findings.length} finding${findings.length === 1 ? '' : 's'}`,
    status: message.status || '',
    sourceIndex: index,
  });
}

export function buildDeveloperAgentEvents(snapshot = {}) {
  const messages = Array.isArray(snapshot.chatHistory) ? snapshot.chatHistory : [];
  const events = [];

  messages.forEach((message, index) => {
    if (!message || typeof message !== 'object') return;

    if (message.role === 'user') {
      addEvent(events, {
        type: 'user',
        title: 'User request',
        summary: summarizeText(message.text || message.content),
        sourceIndex: index,
      });
      return;
    }

    if (message.role === 'assistant') {
      addEvent(events, {
        type: 'assistant',
        title: 'Assistant response',
        summary: summarizeText(message.text || message.content),
        sourceIndex: index,
      });
      return;
    }

    if (message.role === 'agentProgress') {
      addAgentProgressEvents(events, message, index);
      return;
    }

    if (message.role === 'changeSummary') {
      addChangeSummaryEvent(events, message, index);
      return;
    }

    if (message.role === 'packageSummary') {
      addPackageSummaryEvent(events, message, index);
      return;
    }

    if (message.role === 'proposal') {
      addProposalEvent(events, message, index);
      return;
    }

    if (message.role === 'diffReview') {
      addDiffReviewEvent(events, message, index);
      return;
    }

    if (message.role === 'syncSuggestion') {
      addSyncSuggestionEvent(events, message, index);
      return;
    }

    if (message.role === 'validation') {
      addValidationEvent(events, message, index);
      return;
    }

    if (message.role === 'error') {
      addEvent(events, {
        type: 'error',
        level: 'error',
        title: 'Agent error',
        summary: summarizeText(message.text || message.content || message.message),
        sourceIndex: index,
      });
    }
  });

  const counts = events.reduce(
    (acc, event) => {
      acc.total += 1;
      acc[event.level] = (acc[event.level] || 0) + 1;
      if (event.type === 'tool') acc.tools += 1;
      return acc;
    },
    { total: 0, tools: 0, success: 0, warning: 0, error: 0, info: 0 },
  );

  return { events, counts };
}
