/**
 * useToolInvoker.js — Agent tool execution: agentic loop, parallel tool calling,
 * retry logic, loop detection, and progress card management.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 */

import { buildAgentSystemPromptParts } from '../../lib/agentPrompts';
import { generateCourseHealthReport } from '../../lib/pedagogicalValidator';
import { AGENT_TOOLS, TOOL_LABELS, summarizeToolResult, classifyRequestComplexity } from '../../lib/agentTools';
import { estimateTokens, getModelLimit } from '../../lib/tokenEstimator';
import { buildNativeTools, formatAssistantToolCalls, batchToolResults } from '../../lib/agentProviders';
import { fetchAgentResponseNative, buildAgentChatHistory } from './useStreamProcessor';
import { getMemories, MEMORY_CATEGORIES } from '../../lib/agentMemory';
import { createSkillNudgeTracker, SKILL_NUDGE_HINT } from '../../lib/customAgentTools';
import {
  AGENT_EXECUTION_MODES,
  applyAgentExecutionModePrompt,
  filterAgentToolsForExecutionMode,
  isAgentToolBlockedInDryRun,
} from '../../lib/agentExecutionMode';
import { classifyFinalizePackageStepStatus, normalizePackageSummary } from '../../lib/packageFinalizerSummary';
import { isLandingAgentContextText } from '../../lib/landingAgentContext';
import { isAgentSourceContextText } from '../../lib/agentSourceContext';
import { resolveLabel } from './constants';
import { extractEditContext } from '../../lib/editContextExtractor';
import {
  createCanonicalPatchRequest,
  projectArtifactEditToCourseMapPatch,
} from '../../lib/artifactBlueprintProjection';

/**
 * Execute the multi-step agentic loop with native tool calling.
 *
 * This is a plain async function (not a hook) called from useChatRouter.
 * All React state is passed in via the `ctx` parameter so this module
 * stays free of React imports.
 *
 * @param {string} fullMessage  - The user (or synthetic) message to send
 * @param {Object} opts
 * @param {boolean}  opts.silent - If true, suppress user-facing messages
 * @param {boolean}  opts.dryRun - If true, expose only read-only tools and block stale mutating calls
 * @param {Object}  ctx         - Shared context from useChatRouter
 */

function addFeatureTarget(featureId, targets) {
  const raw = String(featureId || '').trim();
  if (!raw || raw === 'all') return;
  targets.add(resolveLabel(raw));
}

function collectFeatureTargets(value, targets) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFeatureTargets(item, targets));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'featureId' || key === 'targetFeatureId') {
      addFeatureTarget(nested, targets);
      continue;
    }
    if (key === 'featureIds' && Array.isArray(nested)) {
      nested.forEach((featureId) => addFeatureTarget(featureId, targets));
      continue;
    }
    collectFeatureTargets(nested, targets);
  }
}

function deriveToolTargets(toolCall, activeTab) {
  const targets = new Set();
  switch (toolCall.name) {
    case 'inspect_workspace':
    case 'plan_workspace_next_step':
      targets.add('Workspace');
      break;
    case 'validate_course':
    case 'finalize_package':
    case 'verify_package_exports':
    case 'review_package_readiness':
    case 'repair_package_readiness':
      targets.add('Package');
      break;
    case 'read_lesson':
    case 'edit_course_map':
    case 'check_grammar':
      targets.add('Course Map');
      break;
    case 'search_research':
      targets.add('Research');
      break;
    case 'create_tool':
    case 'run_tool':
      targets.add('Agent tools');
      break;
    default:
      collectFeatureTargets(toolCall.args || {}, targets);
      if (targets.size === 0 && activeTab) addFeatureTarget(activeTab, targets);
  }
  return [...targets].slice(0, 4);
}

const RECEIPT_ACTION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'save_preference',
  'remember',
  'forget',
  'undo_last',
  'create_tool',
  'run_tool',
]);

const RECEIPT_INTENT_TOOLS = {
  finish_package: new Set(['finalize_package']),
  package_repair: new Set(['repair_package_readiness', 'retry_package_weak_spots']),
  content_edit: new Set(['edit_course_map', 'edit_deliverables', 'generate_slide_images', 'undo_last']),
  package_audit: new Set(['validate_course', 'verify_package_exports', 'review_package_readiness']),
  workspace_plan: new Set(['plan_workspace_next_step']),
  workspace_inspection: new Set(['inspect_workspace', 'read_lesson', 'read_deliverable', 'compare_deliverables']),
  agent_tooling: new Set(['create_tool', 'run_tool']),
  agent_memory: new Set(['save_preference', 'remember', 'forget', 'recall']),
  research: new Set(['search_research']),
};

const RECEIPT_INTENT_LABELS = {
  finish_package: 'Package finish',
  package_repair: 'Package repair',
  content_edit: 'Content update',
  package_audit: 'Quality audit',
  workspace_plan: 'Workspace plan',
  workspace_inspection: 'Workspace inspection',
  agent_tooling: 'Agent tooling',
  agent_memory: 'Agent memory',
  research: 'Research',
  agent_run: 'Agent run',
};

function uniqueList(values = [], max = Infinity) {
  const unique = [];
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (text && !unique.includes(text)) unique.push(text);
  });
  if (unique.length <= max) return unique;
  return [...unique.slice(0, max), `+${unique.length - max} more`];
}

function cloneForProjection(data) {
  if (data == null) return {};
  try {
    if (typeof structuredClone === 'function') return structuredClone(data);
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return {};
  }
}

function normalizeProjectionPath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== 'string') return null;
  return path
    .split('.')
    .filter((part) => part !== '')
    .map((part) => {
      const numeric = Number(part);
      return Number.isInteger(numeric) && String(numeric) === part ? numeric : part;
    });
}

function setProjectionValueAtPath(obj, path, value) {
  const root = cloneForProjection(obj);
  if (!Array.isArray(path) || path.length === 0) return root;
  let current = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
  return root;
}

export function projectAgentDeliverableActionToCanonicalPatch(action, { courseMap, deliverables } = {}) {
  if (!action || action.type !== 'editItem' || !action.featureId) return null;
  const editPath = normalizeProjectionPath(action.path);
  if (!editPath || editPath.length < 2) return null;
  const lessonIndex = Number.isInteger(action.lessonIndex)
    ? action.lessonIndex
    : Number.isInteger(editPath[1])
      ? editPath[1]
      : null;
  if (!Number.isInteger(lessonIndex)) return null;

  const entry = deliverables?.[action.featureId] || null;
  const oldData = entry?.data || entry || {};
  const newData = setProjectionValueAtPath(oldData, editPath, action.value);
  const editContext = extractEditContext(oldData, newData, editPath);
  const patch = projectArtifactEditToCourseMapPatch({
    featureId: action.featureId,
    lessonIndex,
    editPath,
    oldData,
    newData,
    courseMap,
    editContext,
  });
  if (patch) return { patch, editContext };
  const patchRequest = createCanonicalPatchRequest({
    featureId: action.featureId,
    lessonIndex,
    editPath,
    oldData,
    newData,
    courseMap,
    editContext,
  });
  return patchRequest ? { patchRequest, canonicalPatchRequests: [patchRequest], editContext } : null;
}

function formatReceiptStep(step) {
  const label = String(step?.label || TOOL_LABELS[step?.tool] || step?.tool || 'Agent tool').trim();
  const summary = String(step?.summary || '').trim();
  if (!summary || summary === label) return label;
  return `${label}: ${summary}`;
}

function buildToolManifest(steps) {
  return steps.slice(0, 12).map((step) => {
    const startedAt = Number(step?.startedAt || 0);
    const endedAt = Number(step?.endedAt || 0);
    return {
      tool: String(step?.tool || 'unknown_tool'),
      label: String(step?.label || TOOL_LABELS[step?.tool] || step?.tool || 'Agent tool'),
      status: String(step?.status || 'done'),
      summary: String(step?.summary || '').trim(),
      targets: uniqueList(step?.targets || [], 3),
      ...(startedAt && endedAt && endedAt >= startedAt ? { durationMs: endedAt - startedAt } : {}),
    };
  });
}

function receiptIntentPriority(intentType) {
  return [
    'finish_package',
    'package_repair',
    'content_edit',
    'package_audit',
    'workspace_plan',
    'workspace_inspection',
    'agent_tooling',
    'agent_memory',
    'research',
  ].indexOf(intentType);
}

export function deriveModelAgentReceiptIntent(steps = [], { issueCount = 0 } = {}) {
  const toolNames = uniqueList(steps.map((step) => step?.tool));
  if (toolNames.length === 0) {
    return {
      type: 'agent_run',
      label: RECEIPT_INTENT_LABELS.agent_run,
      toolNames: [],
      toolCount: 0,
      issueCount,
      mutatesWorkspace: false,
      readOnly: true,
    };
  }

  const matchedTypes = [];
  for (const [intentType, tools] of Object.entries(RECEIPT_INTENT_TOOLS)) {
    if (toolNames.some((toolName) => tools.has(toolName))) matchedTypes.push(intentType);
  }
  matchedTypes.sort((a, b) => receiptIntentPriority(a) - receiptIntentPriority(b));

  const type = matchedTypes[0] || 'agent_run';
  const mutatesWorkspace = steps.some((step) => RECEIPT_ACTION_TOOLS.has(step?.tool));
  return {
    type,
    label: RECEIPT_INTENT_LABELS[type] || RECEIPT_INTENT_LABELS.agent_run,
    toolNames,
    toolCount: steps.length,
    issueCount,
    mutatesWorkspace,
    readOnly: !mutatesWorkspace,
  };
}

function buildReceiptTitle(status, intent) {
  const label = intent?.label || RECEIPT_INTENT_LABELS.agent_run;
  if (status === 'blocked') return `${label} needs attention`;
  if (status === 'review') return `${label} needs review`;
  if (intent?.type === 'workspace_plan') return 'Workspace plan ready';
  if (intent?.type === 'package_audit') return 'Quality audit complete';
  if (intent?.type === 'finish_package') return 'Package finish receipt';
  return `${label} receipt`;
}

function buildReceiptNext(status, intent, actionSteps) {
  if (status === 'blocked') {
    if (intent?.type === 'finish_package' || intent?.type === 'package_repair') {
      return 'Review the package issue, then retry the smallest safe finish action.';
    }
    return 'Open the issue details or run a smaller recovery action before continuing.';
  }
  if (status === 'review') return 'Review the partial result before applying more changes.';

  switch (intent?.type) {
    case 'workspace_plan':
      return 'Choose a plan action, or run a quality audit before changing content.';
    case 'package_audit':
      return 'Use the findings to decide whether to fix, finish, or download.';
    case 'finish_package':
      return 'Review the package summary, then download or audit quality before sharing.';
    case 'content_edit':
    case 'package_repair':
      return 'Audit quality or plan the next downstream update from the changed workspace.';
    case 'agent_tooling':
      return 'Use the saved macro when this workflow repeats.';
    case 'agent_memory':
      return 'Future Agent turns can use the updated preference context.';
    default:
      return actionSteps.length > 0
        ? 'Continue from the updated workspace.'
        : 'Use these findings to choose the next change.';
  }
}

export function buildModelAgentReceiptFromProgress(progress, { runId = null, dryRun = false, activeTab = null } = {}) {
  const steps = Array.isArray(progress?.steps) ? progress.steps.filter(Boolean) : [];
  if (steps.length === 0) return null;

  const issueSteps = steps.filter((step) => step.status === 'error' || step.status === 'partial');
  const hasError = issueSteps.some((step) => step.status === 'error') || progress?.status === 'error';
  const status = hasError ? 'blocked' : issueSteps.length > 0 ? 'review' : 'done';
  const actionSteps = steps.filter((step) => RECEIPT_ACTION_TOOLS.has(step.tool));
  const checkSteps = steps.filter((step) => !RECEIPT_ACTION_TOOLS.has(step.tool));
  const targets = uniqueList(
    steps.flatMap((step) => step.targets || []),
    4,
  );
  const fallbackTarget = progress?.runMeta?.target || resolveLabel(activeTab || 'courseMap');
  const mode = progress?.runMeta?.mode || (dryRun ? 'Review only' : 'Auto-fix');
  const providerCallCount = Number(progress?.runMeta?.providerCallCount || 0);
  const maxProviderCallCount = Number(progress?.runMeta?.maxProviderCallCount || progress?.runMeta?.maxIterations || 0);
  const stopReason = String(progress?.runMeta?.stopReason || '').trim();
  const intent = deriveModelAgentReceiptIntent(steps, { issueCount: issueSteps.length });
  const startedAt = Number(progress?.startedAt || 0);
  const endedAt = Number(progress?.endedAt || 0);
  const runStats = {
    toolCount: steps.length,
    actionCount: actionSteps.length,
    checkCount: checkSteps.length,
    issueCount: issueSteps.length,
    readOnly: intent.readOnly,
    mutatesWorkspace: intent.mutatesWorkspace,
    ...(providerCallCount > 0 ? { providerCallCount } : {}),
    ...(maxProviderCallCount > 0 ? { maxProviderCallCount } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(startedAt && endedAt && endedAt >= startedAt ? { durationMs: endedAt - startedAt } : {}),
  };

  return {
    role: 'agentReceipt',
    runId,
    receipt: {
      title: buildReceiptTitle(status, intent),
      status,
      badge: status === 'blocked' ? 'Blocked' : status === 'review' ? 'Review' : 'Complete',
      mode,
      target: targets.length > 0 ? targets.join(', ') : fallbackTarget,
      intent,
      runStats,
      ...(stopReason ? { stopReason } : {}),
      toolManifest: buildToolManifest(steps),
      changed: actionSteps.length > 0 ? uniqueList(actionSteps.map(formatReceiptStep), 4) : ['No workspace edits'],
      checked: checkSteps.length > 0 ? uniqueList(checkSteps.map(formatReceiptStep), 4) : ['Tool result status'],
      issues: uniqueList(issueSteps.map(formatReceiptStep), 4),
      next: buildReceiptNext(status, intent, actionSteps),
    },
  };
}

export async function runAgentLoop(fullMessage, { silent = false, dryRun = false } = {}, ctx) {
  const {
    messages,
    setMessages,
    setStreaming,
    abortRef,
    apiKey,
    provider,
    modelId,
    courseMap,
    activeTab,
    slideTheme,
    selectedFeatures,
    columns,
    deliverableConfig,
    lessonFilter,
    delivRef,
    executeActionRef,
    optimisticUpdateRef,
    snapshotRef,
    undoFnRef,
    notifyEditRef,
    uid,
    customToolRegistryRef,
    maybeRunValidation,
    handleAgentFinalResponse,
  } = ctx;
  const executionMode = dryRun ? AGENT_EXECUTION_MODES.DRY_RUN : AGENT_EXECUTION_MODES.APPLY;
  const runId = `agent-run-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Helper: update the progress card
  const updateProgress = (updater) => {
    setMessages((prev) => {
      const updated = [...prev];
      const idx = updated.findLastIndex((m) => m.role === 'agentProgress');
      if (idx >= 0) {
        const current = updated[idx];
        const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        const normalized = {
          ...next,
          startedAt: next.startedAt || current.startedAt || Date.now(),
        };
        if (
          current.status === 'running' &&
          normalized.status &&
          normalized.status !== 'running' &&
          !normalized.endedAt
        ) {
          normalized.endedAt = Date.now();
        }
        updated[idx] = normalized;
      }
      return updated;
    });
  };

  // Helper: update a specific step by index
  const updateStepAt = (stepIndex, updates) => {
    updateProgress((card) => {
      const steps = [...card.steps];
      if (stepIndex >= 0 && stepIndex < steps.length) {
        const current = steps[stepIndex];
        const next = { ...current, ...updates };
        if (current.status === 'running' && next.status && next.status !== 'running' && !next.endedAt) {
          next.endedAt = Date.now();
        }
        steps[stepIndex] = next;
      }
      return { ...card, steps };
    });
  };

  const completeProgressWithReceipt = ({ status = 'complete', stopReason = '' } = {}) => {
    if (silent) return;
    setMessages((prev) => {
      const updated = [...prev];
      const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
      if (progressIdx < 0) return prev;
      const current = updated[progressIdx];
      const completed = {
        ...current,
        status: status === 'error' || current.status === 'error' ? 'error' : 'complete',
        startedAt: current.startedAt || Date.now(),
        endedAt: current.endedAt || Date.now(),
        runMeta: {
          ...(current.runMeta || {}),
          ...(stopReason ? { stopReason } : {}),
        },
      };
      updated[progressIdx] = completed;
      const receipt = buildModelAgentReceiptFromProgress(completed, {
        runId,
        dryRun: executionMode === AGENT_EXECUTION_MODES.DRY_RUN,
        activeTab,
      });
      if (!receipt) return updated;
      return [...updated.filter((message) => !(message.role === 'agentReceipt' && message.runId === runId)), receipt];
    });
  };

  try {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Load user preferences
    let userPrefs = null;
    try {
      userPrefs = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || 'null');
    } catch {
      /* ignore */
    }

    // Build context
    const chatHistory = buildAgentChatHistory(messages);
    const healthReport = courseMap && delivRef.current ? generateCourseHealthReport(courseMap, delivRef.current) : null;
    const healthSummary =
      healthReport && (healthReport.errorCount > 0 || healthReport.warningCount > 0) ? healthReport.summary : null;
    // For Anthropic we pass the parts object so the provider builder can emit
    // two cache breakpoints (static prefix + dynamic tail). Other providers
    // receive the joined string — applyAnthropicCache / buildAgentRequest
    // handle both shapes. Token estimation uses the joined text since models
    // consume the concatenation regardless.
    const systemParts = applyAgentExecutionModePrompt(
      buildAgentSystemPromptParts(courseMap, activeTab, delivRef.current, healthSummary, userPrefs),
      executionMode,
    );
    const systemPrompt =
      provider === 'anthropic' ? systemParts : [systemParts.staticPart, systemParts.dynamicPart].join('\n\n');
    const systemPromptForTokens = (systemParts.staticPart || '') + (systemParts.dynamicPart || '');

    // ── Context window awareness: smart trim if approaching limit ──
    const systemPromptTk = estimateTokens(systemPromptForTokens);
    const OUTPUT_RESERVE_TK = 4096;
    const chatContent = chatHistory.map((m) => m.content).join('') + fullMessage;
    const chatTk = estimateTokens(chatContent);
    const modelLimit = getModelLimit(modelId);
    const availableForChat = modelLimit - systemPromptTk - OUTPUT_RESERVE_TK;

    if (chatTk > availableForChat * 0.8) {
      const excess = chatTk - Math.floor(availableForChat * 0.75);
      const charsToTrim = excess * 4;
      // Score messages: user messages and recent messages are more valuable
      const scored = chatHistory.map((m, i) => ({
        ...m,
        _idx: i,
        _keep:
          (m.role === 'user' ? 3 : 1) +
          (i >= chatHistory.length - 4 ? 5 : 0) +
          (m.role === 'user' && isLandingAgentContextText(m.content) ? 25 : 0) +
          (m.role === 'user' && isAgentSourceContextText(m.content) ? 18 : 0),
      }));
      scored.sort((a, b) => a._keep - b._keep);
      let trimmed = 0;
      const toRemove = new Set();
      while (trimmed < charsToTrim && scored.length > 2) {
        const removed = scored.shift();
        trimmed += (removed.content || '').length;
        toRemove.add(removed._idx);
      }
      // Remove from chatHistory in reverse order to preserve indices
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (toRemove.has(i)) chatHistory.splice(i, 1);
      }
    }

    // ── Complexity-aware planning hint ──
    const complexity = classifyRequestComplexity(fullMessage, delivRef.current);
    let effectiveMessage = fullMessage;
    if (complexity === 'complex') {
      effectiveMessage =
        fullMessage +
        '\n\n[SYSTEM HINT: This is a complex request. Plan your approach: identify which deliverables and lessons to read/edit, then execute efficiently. Use parallel tool calls where possible.]';
    }

    // Build native tools for provider
    const availableAgentTools = filterAgentToolsForExecutionMode(AGENT_TOOLS, executionMode);
    const nativeTools = buildNativeTools(provider, availableAgentTools);

    // Loop messages (internal to this turn — separate from chat history)
    const loopMessages = [...chatHistory, { role: 'user', content: effectiveMessage }];

    // ── Auto-recall: on first conversation turn, surface memories as context ──
    const isFirstTurn = chatHistory.filter((m) => m.role === 'user').length === 0;
    if (isFirstTurn) {
      try {
        const memories = getMemories();
        if (memories.length > 0) {
          const topMemories = memories
            .slice(0, 5)
            .map((m) => `[${MEMORY_CATEGORIES[m.category] || m.category}] ${m.content}`)
            .join('\n');
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM — recalled from past sessions, use to inform your responses:\n${topMemories}\n]`,
          });
        }
      } catch {
        /* non-critical — skip if memory read fails */
      }
    }

    // God-mode: allow deeper reasoning chains so the agent can plan → read →
    // edit → validate → fix → verify in a single turn without punting to the user.
    const MAX_ITERATIONS = 20;
    let usedTools = false;
    let terminalResponseHandled = false;

    // ── Adaptive temperature: deterministic for simple edits, creative for complex tasks ──
    const agentTemperature = complexity === 'simple' ? 0.2 : complexity === 'complex' ? 0.5 : 0.4;

    // ── Loop detection: track tool call signatures to prevent infinite loops ──
    const toolCallLog = [];
    function detectLoop(toolCalls) {
      for (const tc of toolCalls) {
        const sig = tc.name + ':' + JSON.stringify(tc.args || {});
        toolCallLog.push(sig);
        const count = toolCallLog.filter((s) => s === sig).length;
        if (count >= 3) return tc.name;
      }
      return null;
    }

    // ── Skill-creation nudge (Hermes-style agent-initiated macros) ─────────
    // When this turn has chained several successful workflow tool calls,
    // nudge the agent toward create_tool. Fires at most once per
    // runAgentLoop call. Thresholds live in customAgentTools.js so runtime
    // and the test harness can't drift.
    const skillNudge = createSkillNudgeTracker();

    // ── Thinking text callback for streaming progress ──
    const onThinkingText = (text) => {
      updateProgress((card) => ({ ...card, thinkingText: text }));
    };

    // ── AGENTIC LOOP (native tool calling) ───────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      updateProgress((card) => ({
        ...card,
        runMeta: {
          ...(card.runMeta || {}),
          providerCallCount: iteration + 1,
          maxProviderCallCount: MAX_ITERATIONS,
        },
      }));
      if (typeof ctx.onApiCallEvent === 'function') {
        ctx.onApiCallEvent({
          type: 'agentLoopCall',
          label: 'Agent loop provider call',
          detail: `${iteration + 1}/${MAX_ITERATIONS}`,
        });
      }
      const { toolCalls, textContent, stopReason, assistantMessage } = await fetchAgentResponseNative(
        loopMessages,
        systemPrompt,
        controller.signal,
        apiKey,
        provider,
        modelId,
        nativeTools,
        { temperature: agentTemperature, onThinkingText },
      );

      // ── RESPOND TOOL (final answer) ──────────────────────────────────
      if (toolCalls) {
        const respondCall = toolCalls.find((tc) => tc.name === 'respond');
        if (respondCall) {
          if (silent) {
            setMessages((prev) => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          } else if (usedTools) {
            completeProgressWithReceipt({ stopReason: 'respond' });
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          }
          handleAgentFinalResponse(respondCall.args);
          terminalResponseHandled = true;
          break;
        }
      }

      // ── NO TOOL CALLS: text-only fallback ───────────────────────────
      if (!toolCalls) {
        const fallbackText =
          textContent || "I wasn't able to complete that request. Could you try asking about one specific aspect?";
        if (silent) {
          setMessages((prev) => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
            if (progressIdx >= 0) updated.splice(progressIdx, 1);
            return updated;
          });
        } else if (usedTools) {
          completeProgressWithReceipt({ stopReason: 'text_fallback' });
          setMessages((prev) => [...prev, { role: 'assistant', text: fallbackText }]);
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
            if (progressIdx >= 0) updated[progressIdx] = { role: 'assistant', text: fallbackText };
            return updated;
          });
        }
        terminalResponseHandled = true;
        break;
      }

      // ── TOOL CALLS (parallel execution) ─────────────────────────────
      const nonRespondCalls = toolCalls.filter((tc) => tc.name !== 'respond');
      if (nonRespondCalls.length > 0) {
        const loopedTool = detectLoop(nonRespondCalls);
        if (loopedTool) {
          completeProgressWithReceipt({ status: 'error', stopReason: 'loop_detected' });
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: `I noticed I was repeating the same operation (${loopedTool}) without making progress. Could you rephrase your request or be more specific?`,
            },
          ]);
          terminalResponseHandled = true;
          break;
        }

        usedTools = true;

        let stepStartIndex = 0;
        const newSteps = nonRespondCalls.map((tc) => ({
          tool: tc.name,
          label: TOOL_LABELS[tc.name] || tc.name,
          targets: deriveToolTargets(tc, activeTab),
          thought: '',
          status: 'running',
          summary: '',
          startedAt: Date.now(),
        }));

        updateProgress((card) => {
          stepStartIndex = card.steps.length;
          return { ...card, steps: [...card.steps, ...newSteps] };
        });

        // Execute all tools in parallel (with 30s per-tool timeout)
        const TOOL_TIMEOUT = 30000;
        const toolResults = await Promise.all(
          nonRespondCalls.map(async (tc, i) => {
            const stepIdx = stepStartIndex + i;
            if (!AGENT_TOOLS[tc.name]) {
              updateStepAt(stepIdx, { status: 'error', summary: `Unknown tool: ${tc.name}` });
              return {
                toolCallId: tc.id,
                toolName: tc.name,
                result: { error: `Unknown tool: ${tc.name}. Available: ${Object.keys(AGENT_TOOLS).join(', ')}` },
              };
            }

            if (executionMode === AGENT_EXECUTION_MODES.DRY_RUN && isAgentToolBlockedInDryRun(tc.name)) {
              const message = `Suggest-only mode blocked editing tool: ${tc.name}`;
              updateStepAt(stepIdx, { status: 'error', summary: message });
              return {
                toolCallId: tc.id,
                toolName: tc.name,
                result: {
                  error: `${message}. Use read-only tools and respond with analysis or user-approved proposals instead.`,
                },
              };
            }

            try {
              const toolCtx = {
                courseMap,
                activeTab,
                deliverables: delivRef.current,
                selectedFeatures,
                columns,
                deliverableConfig,
                lessonFilter,
                executeAction: executeActionRef.current,
                projectDeliverableActionToCanonicalPatch: (action) =>
                  projectAgentDeliverableActionToCanonicalPatch(action, {
                    courseMap,
                    deliverables: delivRef.current,
                  }),
                optimisticUpdate: optimisticUpdateRef?.current || null,
                setCurrentDeliverables: (nextDeliverables) => {
                  if (nextDeliverables) delivRef.current = nextDeliverables;
                },
                apiKey,
                provider,
                modelId,
                slideTheme,
                snapshot: snapshotRef.current,
                undoFn: undoFnRef?.current || null,
                uid,
                dryRun: executionMode === AGENT_EXECUTION_MODES.DRY_RUN,
                // customTools is wired here (not at ctx build time) so
                // invokeBuiltin can close over the same toolCtx — otherwise a
                // custom macro would run its builtins without edit access.
                customTools: customToolRegistryRef
                  ? {
                      registry: customToolRegistryRef.current,
                      invokeBuiltin: async (builtinName, builtinArgs, innerSignal) => {
                        const builtin = AGENT_TOOLS[builtinName];
                        if (!builtin) return { error: `Unknown tool in plan: ${builtinName}` };
                        try {
                          return await builtin.execute(builtinArgs || {}, toolCtx, innerSignal || controller.signal);
                        } catch (err) {
                          return { error: `builtin "${builtinName}" threw: ${err.message}` };
                        }
                      },
                      // Stream plan progress into the agentProgress card so users see
                      // the macro working (otherwise run_tool looks opaque until done).
                      onStep: (event) => {
                        if (tc.name !== 'run_tool') return;
                        const label =
                          event.status === 'error'
                            ? `Step ${event.index + 1}/${event.total}: ${event.tool} ✗`
                            : event.status === 'done'
                              ? `Step ${event.index + 1}/${event.total}: ${event.tool} ✓`
                              : `Step ${event.index + 1}/${event.total}: ${event.tool}…`;
                        updateStepAt(stepIdx, { summary: label });
                      },
                    }
                  : null,
              };

              async function execWithRetry(attempt = 0) {
                const toolPromise = AGENT_TOOLS[tc.name].execute(tc.args || {}, toolCtx, controller.signal);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Tool ${tc.name} timed out after ${TOOL_TIMEOUT / 1000}s`)),
                    TOOL_TIMEOUT,
                  ),
                );
                try {
                  return await Promise.race([toolPromise, timeoutPromise]);
                } catch (err) {
                  const isTransient =
                    err.message?.includes('timed out') ||
                    err.message?.includes('fetch') ||
                    err.message?.includes('network') ||
                    err.message?.includes('Failed to fetch');
                  if (isTransient && attempt < 1) {
                    updateStepAt(stepIdx, { summary: 'Retrying...' });
                    return execWithRetry(attempt + 1);
                  }
                  throw err;
                }
              }

              const result = await execWithRetry();
              const summary = summarizeToolResult(tc.name, result);
              // Classify the step outcome honestly — previously every non-throwing
              // result painted the step green, which lied when the tool returned
              // {applied:N, failed:M>0}. Now:
              //   'done'    — tool ran cleanly
              //   'partial' — some patches applied, some didn't (mixed outcome)
              //   'error'   — result.error set OR all patches failed
              let stepStatus = 'done';
              if (result && typeof result === 'object') {
                if (result.error) {
                  stepStatus = 'error';
                } else if (tc.name === 'finalize_package') {
                  stepStatus = classifyFinalizePackageStepStatus(result);
                } else if (
                  tc.name === 'edit_course_map' ||
                  tc.name === 'edit_deliverables' ||
                  tc.name === 'generate_slide_images' ||
                  tc.name === 'repair_package_readiness' ||
                  tc.name === 'retry_package_weak_spots'
                ) {
                  const appliedN = result.applied || result.started || 0;
                  const failedN = result.failed || 0;
                  if (failedN > 0) stepStatus = appliedN > 0 ? 'partial' : 'error';
                }
              }
              updateStepAt(stepIdx, { status: stepStatus, summary });

              if (tc.name === 'finalize_package') {
                const packageSummary = normalizePackageSummary(result);
                setMessages((prev) => {
                  const withoutCurrentRunSummary = prev.filter(
                    (message) => !(message.role === 'packageSummary' && message.runId === runId),
                  );
                  return [
                    ...withoutCurrentRunSummary,
                    {
                      role: 'packageSummary',
                      runId,
                      summary: packageSummary,
                    },
                  ];
                });
              }

              if (tc.name === 'plan_workspace_next_step' && result && !result.error) {
                setMessages((prev) => {
                  const withoutCurrentRunPlan = prev.filter(
                    (message) => !(message.role === 'workspacePlan' && message.runId === runId),
                  );
                  return [
                    ...withoutCurrentRunPlan,
                    {
                      role: 'workspacePlan',
                      runId,
                      plan: result,
                    },
                  ];
                });
              }

              // If edit tool -> add changeSummary + trigger sync cascade
              if (
                tc.name === 'edit_course_map' ||
                tc.name === 'edit_deliverables' ||
                tc.name === 'generate_slide_images' ||
                tc.name === 'retry_package_weak_spots'
              ) {
                const changes = [];
                const editedFeatures = new Set();
                const canonicalSyncEdits = [];
                const failedItems = []; // carry full per-item failure info to the UI
                // The agent's original tool args hold the exact patches/actions —
                // we need them so a "Retry failed" button can reconstruct the
                // requests, not the trimmed `details[]` which loses field values.
                const originalInputs =
                  tc.name === 'edit_course_map'
                    ? tc.args?.patches || []
                    : tc.name === 'edit_deliverables'
                      ? tc.args?.actions || []
                      : (result.details || []).map((detail) => ({ ...detail, toolArgs: tc.args || {} }));
                for (let detailIdx = 0; detailIdx < (result.details || []).length; detailIdx++) {
                  const detail = result.details[detailIdx];
                  if (detail.success) {
                    const featureId = detail.featureId || 'courseMap';
                    const actionType = detail.pending
                      ? 'regenerating'
                      : detail.action === 'generateImage'
                        ? 'generated'
                        : detail.action === 'addItem'
                          ? 'added'
                          : detail.action === 'removeItem'
                            ? 'removed'
                            : 'edited';
                    const key = `${actionType}:${featureId}`;
                    const existing = changes.find((c) => `${c.type}:${c.featureId}` === key);
                    if (existing) existing.count++;
                    else changes.push({ type: actionType, featureId, count: 1 });
                    if (featureId !== 'courseMap' && !detail.pending) {
                      editedFeatures.add(`${featureId}:${detail.lessonIndex ?? 0}`);
                    }
                    if (detail.canonicalPatches?.length > 0) {
                      canonicalSyncEdits.push({
                        featureId,
                        lessonIndex: detail.lessonIndex ?? 0,
                        editContext: detail.editContext || detail.message || null,
                        canonicalPatches: detail.canonicalPatches,
                      });
                    } else if (detail.canonicalPatchRequests?.length > 0) {
                      canonicalSyncEdits.push({
                        featureId,
                        lessonIndex: detail.lessonIndex ?? 0,
                        editContext: detail.editContext || detail.message || null,
                        canonicalPatchRequests: detail.canonicalPatchRequests,
                      });
                    }
                  } else {
                    failedItems.push({
                      index: detailIdx,
                      action: detail.action || detail.patch || 'edit',
                      featureId: detail.featureId || (tc.name === 'edit_course_map' ? 'courseMap' : undefined),
                      lessonIndex: detail.lessonIndex,
                      message: detail.message || 'Unknown failure',
                      originalInput: originalInputs[detailIdx] || null,
                    });
                  }
                }
                // Fire a summary card when ANY outcome landed — successes, failures,
                // or both. Pure no-op results (empty patches array) still skip.
                if (changes.length > 0 || failedItems.length > 0) {
                  const pendingCount =
                    result.pending ||
                    changes.filter((c) => c.type === 'regenerating').reduce((sum, c) => sum + c.count, 0);
                  const message =
                    failedItems.length === 0
                      ? pendingCount > 0 && (result.applied || result.started || 0) === 0
                        ? `${pendingCount} regeneration${pendingCount !== 1 ? 's' : ''} started.`
                        : `${result.applied || result.started || 0} change${(result.applied || result.started || 0) !== 1 ? 's' : ''} applied${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}.`
                      : (result.applied || result.started || 0) > 0
                        ? `${result.applied || result.started || 0} applied${pendingCount > 0 ? ` · ${pendingCount} pending` : ''} · ${failedItems.length} failed`
                        : `${failedItems.length} change${failedItems.length !== 1 ? 's' : ''} failed`;
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: 'changeSummary',
                      summary: {
                        changes,
                        applied: result.applied || result.started || 0,
                        pending: pendingCount,
                        failed: failedItems.length,
                        failedItems,
                        toolName: tc.name,
                        message,
                      },
                      status: 'pending', // tracks keep/retry/undo decisions on failures
                    },
                  ]);
                }

                if (notifyEditRef.current && canonicalSyncEdits.length > 0) {
                  for (const edit of canonicalSyncEdits) {
                    notifyEditRef.current(edit.lessonIndex, '_deliverableEdit', edit.featureId, edit.editContext, {
                      canonicalPatches: edit.canonicalPatches,
                      canonicalPatchRequests: edit.canonicalPatchRequests,
                    });
                  }
                }

                if (notifyEditRef.current && editedFeatures.size > 0) {
                  for (const entry of editedFeatures) {
                    const [fid, lidx] = entry.split(':');
                    const lessonIndex = lidx !== 'undefined' ? parseInt(lidx, 10) : null;
                    notifyEditRef.current(lessonIndex, '_deliverableEdit', fid);
                  }
                }

                maybeRunValidation();
              }

              return { toolCallId: tc.id, toolName: tc.name, result };
            } catch (toolErr) {
              if (toolErr.name === 'AbortError') throw toolErr;
              updateStepAt(stepIdx, { status: 'error', summary: toolErr.message });
              return { toolCallId: tc.id, toolName: tc.name, result: { error: toolErr.message } };
            }
          }),
        );

        // Add assistant tool-call turn + all tool results to loop messages
        loopMessages.push(formatAssistantToolCalls(provider, nonRespondCalls, assistantMessage));
        const resultMessages = batchToolResults(provider, toolResults);
        loopMessages.push(...resultMessages);

        // ── Self-correction: inject recovery hints for failed tool calls ──
        const failedResults = toolResults.filter((r) => r.result?.error);
        if (failedResults.length > 0) {
          const hints = failedResults
            .map(
              (r) =>
                `Tool "${r.toolName}" failed: ${r.result.error}. Try a different approach or correct the arguments.`,
            )
            .join(' ');
          loopMessages.push({ role: 'user', content: `[SYSTEM] ${hints}` });
        }

        // ── Skill-creation nudge: propose saving a repeatable workflow ────
        // Borrowed from Hermes Agent's "skills from experience" pattern. When
        // the turn has chained enough workflow steps to look like a recurring
        // pattern, hint the agent to consider create_tool. The agent is free
        // to ignore it and just respond() — the nudge is advisory, not
        // mandatory, and fires only once per turn.
        // The tracker expects the {name, result} shape produced by our tool
        // invoker; map from the internal (toolCallId, toolName, result) form.
        const nudgeResults = toolResults.map((r) => ({ name: r.toolName, result: r.result }));
        if (skillNudge.update(nudgeResults)) {
          loopMessages.push({ role: 'user', content: SKILL_NUDGE_HINT });
        }

        // ── Post-edit validation: check for new issues after edits ──
        const editResults = toolResults.filter(
          (r) => (r.toolName === 'edit_course_map' || r.toolName === 'edit_deliverables') && r.result?.applied > 0,
        );
        if (editResults.length > 0 && iteration < MAX_ITERATIONS - 2) {
          try {
            const postReport = generateCourseHealthReport(courseMap, delivRef.current);
            if (postReport && postReport.errorCount > 0) {
              const newErrors = postReport.findings
                .filter((f) => f.severity === 'error')
                .slice(0, 3)
                .map((f) => f.message)
                .join('; ');
              loopMessages.push({
                role: 'user',
                content: `[SYSTEM] Post-edit validation found ${postReport.errorCount} error(s): ${newErrors}. Consider fixing these in your next tool call if possible, or mention them in your response.`,
              });
            }
          } catch {
            /* validation is non-critical — don't block the loop */
          }
        }

        continue;
      }
    }

    // Post-loop cleanup
    if (terminalResponseHandled) {
      // The terminal branch already removed or completed the progress card and
      // appended any needed receipt before the final assistant response.
    } else if (silent) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else if (!usedTools) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      completeProgressWithReceipt({ stopReason: 'max_iterations' });
    }
    if (!silent && !terminalResponseHandled) {
      const FINAL_ROLES = new Set([
        'assistant',
        'proposal',
        'changeSummary',
        'packageSummary',
        'workspacePlan',
        'diagram',
        'chart',
        'imageSearch',
        'research',
      ]);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (FINAL_ROLES.has(lastMsg?.role)) return prev;
        return [
          ...prev,
          {
            role: 'assistant',
            text: "I've completed several steps but couldn't fully finish. Could you try a more specific request?",
          },
        ];
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (silent) {
        setMessages((prev) => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        updateProgress({ status: 'complete' });
      }
      return;
    }
    const isNoKey = err.message === 'NO_API_KEY';
    const isNoModel = err.message === 'NO_MODEL_SELECTED';
    console.error('[CM Agent] Error:', err.message, err);
    if (silent) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      const detail = !isNoKey && !isNoModel && err.message ? ` (${err.message})` : '';
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        const errMsg = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the agent, please configure your AI provider and API key first.'
            : isNoModel
              ? 'No AI model selected. Please select a model on the landing page first.'
              : `Sorry, I couldn't process that request.${detail}`,
        };
        if (progressIdx >= 0) updated[progressIdx] = errMsg;
        else updated.push(errMsg);
        return updated;
      });
    }
  } finally {
    setStreaming(false);
  }
}
