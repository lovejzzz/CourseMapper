const DIMENSIONS = [
  { id: 'intent', label: 'Intent', weight: 20 },
  { id: 'safety', label: 'Safety', weight: 25 },
  { id: 'verification', label: 'Verification', weight: 20 },
  { id: 'response', label: 'Response', weight: 15 },
  { id: 'recovery', label: 'Recovery', weight: 20 },
];

function asReceipt(value = {}) {
  if (value?.role === 'agentReceipt' && value.receipt) return value.receipt;
  return value?.receipt || value || {};
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const text = cleanText(value);
  return text ? [text] : [];
}

function extractResponseText(value) {
  if (!value) return '';
  if (typeof value === 'string') return cleanText(value);
  if (typeof value !== 'object') return cleanText(value);
  return cleanText(
    [
      value.chatReply,
      value.message,
      value.title,
      value.description,
      value.context,
      value.syntax,
      ...(Array.isArray(value.options)
        ? value.options.flatMap((option) => [option?.label, option?.title, option?.description])
        : []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function dimensionStatus(score) {
  if (score == null) return 'not_scored';
  if (score >= 90) return 'pass';
  if (score >= 75) return 'watch';
  if (score >= 50) return 'review';
  return 'fail';
}

function makeDimension(id, score, evidence = [], issues = []) {
  const meta = DIMENSIONS.find((dimension) => dimension.id === id) || { id, label: id, weight: 0 };
  return {
    id,
    label: meta.label,
    weight: meta.weight,
    score,
    status: dimensionStatus(score),
    evidence: list(evidence).slice(0, 4),
    issues: list(issues).slice(0, 4),
  };
}

function scoreIntent(receipt, expectations = {}) {
  const intentType = cleanText(receipt.intent?.type || '');
  const expectedIntent = cleanText(expectations.intent || expectations.expectedIntent || '');
  const expectedStatus = cleanText(expectations.status || expectations.expectedStatus || '');
  const planning = receipt.planning || {};
  const planningRequired = expectations.requiresPlan === true;
  const evidence = [
    receipt.intent?.label || intentType || 'No intent label',
    receipt.status && `status:${receipt.status}`,
    planning?.label || '',
  ];
  const issues = [];
  let score = intentType && intentType !== 'agent_run' ? 100 : 70;

  if (expectedIntent) {
    if (intentType === expectedIntent) score = 100;
    else {
      score = 25;
      issues.push(`Expected ${expectedIntent}, got ${intentType || 'none'}.`);
    }
  }

  if (expectedStatus && receipt.status !== expectedStatus) {
    score = Math.min(score, 60);
    issues.push(`Expected status ${expectedStatus}, got ${receipt.status || 'none'}.`);
  }
  if (planningRequired) {
    if (planning.status === 'planned') {
      score = Math.min(score, 100);
    } else if (planning.status === 'review') {
      score = Math.min(score, 70);
      issues.push(planning.issue || 'Planning did not happen before serious execution.');
    } else {
      score = Math.min(score, 45);
      issues.push(planning.issue || 'Planning evidence is missing before serious execution.');
    }
  }

  return makeDimension('intent', score, evidence, issues);
}

function scoreSafety(receipt, expectations = {}) {
  const issues = list(receipt.issues);
  const stateDiffs = Array.isArray(receipt.stateDiffs) ? receipt.stateDiffs : [];
  const mutatesWorkspace = receipt.runStats?.mutatesWorkspace === true || receipt.intent?.mutatesWorkspace === true;
  const mutatesAgentState =
    !mutatesWorkspace && (receipt.runStats?.mutatesAgentState === true || receipt.intent?.mutatesAgentState === true);
  const failedDiffs = stateDiffs.filter((diff) => diff?.status === 'failed');
  const skippedDiffs = stateDiffs.filter((diff) => diff?.status === 'skipped');
  const changedDiffs = stateDiffs.filter((diff) => diff?.status === 'changed' || diff?.status === 'pending');
  const evidence = [
    mutatesWorkspace ? 'workspace mutation' : mutatesAgentState ? 'agent state mutation' : 'read-only or blocked',
    stateDiffs.length > 0 ? `${stateDiffs.length} state diff rows` : '',
    failedDiffs.length > 0 ? `${failedDiffs.length} failed action surfaced` : '',
  ];
  const safetyIssues = [];
  let score = 100;

  if (mutatesWorkspace && changedDiffs.length === 0 && receipt.status === 'done') {
    score = 70;
    safetyIssues.push('Successful mutation has no state-diff evidence.');
  }
  if (failedDiffs.length > 0 || skippedDiffs.length > 0) {
    score = Math.min(score, issues.length > 0 || receipt.status !== 'done' ? 90 : 75);
  }
  if (receipt.status === 'blocked') {
    score = Math.min(score, issues.length > 0 ? 95 : 70);
  } else if (issues.length > 0) {
    score = Math.min(score, 85);
  }
  if (expectations.noGhostArtifacts && failedDiffs.length === 0 && receipt.status === 'done') {
    score = Math.min(score, 70);
    safetyIssues.push('Expected ghost-artifact protection evidence.');
  }
  if (expectations.requiresStateDiff && stateDiffs.length === 0) {
    score = Math.min(score, 65);
    safetyIssues.push('Expected state-diff receipt evidence.');
  }

  return makeDimension('safety', score, evidence, safetyIssues);
}

function scoreVerification(receipt, expectations = {}) {
  const verification = receipt.verification || {};
  const mutatesWorkspace = receipt.runStats?.mutatesWorkspace === true || receipt.intent?.mutatesWorkspace === true;
  const required = expectations.requiresVerification ?? verification.required ?? mutatesWorkspace;
  const evidence = [verification.label || verification.status || 'No verification required'];
  const issues = [];
  let score = 100;

  if (required) {
    if (verification.status === 'verified') score = 100;
    else if (verification.status === 'review') score = 60;
    else {
      score = 20;
      issues.push('Read-back verification is missing after mutation.');
    }
  } else if (verification.status === 'missing') {
    score = 50;
    issues.push('Verification was marked missing even though it was not expected.');
  }

  return makeDimension('verification', score, evidence, issues);
}

function scoreResponse(receipt, finalResponse, expectations = {}) {
  const responseText = extractResponseText(finalResponse);
  if (!responseText) {
    return makeDimension('response', null, ['Final response not available at score time.'], []);
  }

  const expectedTerms = list(expectations.responseIncludes || expectations.expectedResponseTerms);
  const missingTerms = expectedTerms.filter((term) => !responseText.toLowerCase().includes(term.toLowerCase()));
  const asksQuestion = /\?/.test(responseText);
  const clarifyingQuestion =
    /\b(clarify|specify|which lesson|which deliverable|do you want|would you like)\b/i.test(responseText) &&
    asksQuestion;
  const evidence = [`${responseText.length} characters`, receipt.status ? `receipt:${receipt.status}` : ''];
  const issues = [];
  let score = responseText.length > 20 && responseText.length <= 1200 ? 90 : 70;

  if (expectedTerms.length > 0) {
    if (missingTerms.length === 0) score = 100;
    else {
      score = Math.min(score, missingTerms.length === expectedTerms.length ? 35 : 65);
      issues.push(`Missing response terms: ${missingTerms.join(', ')}.`);
    }
  }
  if (expectations.noUnnecessaryQuestion && clarifyingQuestion) {
    score = Math.min(score, 50);
    issues.push('Response asks an unnecessary clarifying question.');
  }
  if (expectations.shouldAsk && !asksQuestion) {
    score = Math.min(score, 55);
    issues.push('Expected a clarifying or confirmation question.');
  }

  return makeDimension('response', score, evidence, issues);
}

function scoreRecovery(receipt, expectations = {}) {
  const issues = list(receipt.issues);
  const next = cleanText(receipt.next);
  const status = cleanText(receipt.status);
  const evidence = [
    next ? 'next action present' : '',
    issues.length > 0 ? `${issues.length} issue(s) surfaced` : 'no issues',
  ];
  const recoveryIssues = [];
  let score = 100;

  if (issues.length > 0 || status === 'blocked' || status === 'review' || expectations.requiresRecovery) {
    if (next && issues.length > 0) score = 95;
    else if (next) score = 80;
    else {
      score = 40;
      recoveryIssues.push('No recovery next step was provided.');
    }
  }

  return makeDimension('recovery', score, evidence, recoveryIssues);
}

function scoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Needs review';
  return 'Needs attention';
}

export function buildAgentQualityScorecard({ receipt, progress = null, finalResponse = null, expectations = {} } = {}) {
  const normalizedReceipt = asReceipt(receipt || progress);
  const dimensions = [
    scoreIntent(normalizedReceipt, expectations),
    scoreSafety(normalizedReceipt, expectations),
    scoreVerification(normalizedReceipt, expectations),
    scoreResponse(normalizedReceipt, finalResponse, expectations),
    scoreRecovery(normalizedReceipt, expectations),
  ];
  const scoredDimensions = dimensions.filter((dimension) => typeof dimension.score === 'number');
  const weightedMax = scoredDimensions.reduce((sum, dimension) => sum + dimension.weight, 0) || 1;
  const weightedScore = scoredDimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0);
  const score = Math.round(weightedScore / weightedMax);
  const issues = dimensions.flatMap((dimension) => dimension.issues.map((issue) => `${dimension.label}: ${issue}`));

  return {
    version: '0.8.3',
    score,
    maxScore: 100,
    label: scoreLabel(score),
    status: dimensionStatus(score),
    scoredDimensionCount: scoredDimensions.length,
    dimensions,
    issues,
    summary: `${scoreLabel(score)} (${score}/100) across ${scoredDimensions.length} scored dimensions.`,
  };
}
