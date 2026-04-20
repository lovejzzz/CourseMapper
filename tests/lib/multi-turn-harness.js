/**
 * multi-turn-harness.js — reusable driver for multi-turn agent-loop tests.
 *
 * Mirrors the behavior of useToolInvoker.runAgentLoop but in a plain Node env:
 *   - takes an initial courseMap + deliverables fixture
 *   - calls Claude with the real system prompt + AGENT_TOOLS
 *   - executes tool calls against a mutable state (using the REAL agentActions executor)
 *   - feeds tool results back in, up to maxIterations
 *   - supports session-scoped custom tools (create_tool / run_tool) so the
 *     agent can synthesize ad-hoc macros when the built-in toolset isn't enough
 *   - terminates when respond() is called or loop-guard trips
 *   - returns a full trace + final state for assertions
 */

import { buildAgentSystemPromptParts } from '../../src/lib/agentPrompts.js';
import { buildNativeTools, applyAnthropicCache } from '../../src/lib/agentProviders.js';
import { AGENT_TOOLS } from '../../src/lib/agentTools.js';
import { executeAction } from '../../src/lib/agentActions.js';
import {
  createCustomToolRegistry, createSkillNudgeTracker, SKILL_NUDGE_HINT,
} from '../../src/lib/customAgentTools.js';

// ── Mutable fixture state + ctx wiring ──────────────────────────────────────

export function createFixture(initialCourseMap, initialDeliverables) {
  // Deep-clone so each test run starts fresh.
  const state = {
    courseMap: structuredClone(initialCourseMap),
    deliverables: structuredClone(initialDeliverables || {}),
  };

  // Editor shim — matches the signature of useCourseMapEditor. Mutates in place.
  const editor = {
    handleCellEdit(lessonIdx, sectionIdx, field, value) {
      const l = state.courseMap.lessons[lessonIdx];
      if (!l) return;
      if (!l.sections) l.sections = [];
      if (!l.sections[sectionIdx]) l.sections[sectionIdx] = {};
      l.sections[sectionIdx][field] = value;
    },
    handleTitleEdit(lessonIdx, newTitle) {
      if (state.courseMap.lessons[lessonIdx]) {
        state.courseMap.lessons[lessonIdx].title = newTitle;
      }
    },
    handleAddLesson() {
      state.courseMap.lessons = state.courseMap.lessons || [];
      state.courseMap.lessons.push({ title: 'New Lesson', sections: [{}] });
    },
    handleDeleteLesson(lessonIdx) {
      if (state.courseMap.lessons?.length > 1) {
        state.courseMap.lessons.splice(lessonIdx, 1);
      }
    },
  };

  // executeAction ctx — matches the shape used by the real app.
  const execCtx = {
    editor,
    get courseMap() { return state.courseMap; },
    get deliverables() { return state.deliverables; },
    optimisticUpdate(featureId, patchedData) {
      if (!state.deliverables[featureId]) state.deliverables[featureId] = { status: 'done' };
      state.deliverables[featureId].data = patchedData;
    },
    snapshot() {}, // undo is not exercised in the harness
    regenerateLesson: async (featureId, _courseMap, lessonIndex) => ({
      success: true,
      message: `[harness] regenerateLesson(${featureId}, lesson ${lessonIndex}) simulated`,
    }),
    skipSnapshot: false,
  };

  return { state, execCtx };
}

// ── Tool execution (built-in, plus create_tool / run_tool via shared ctx) ───

async function invokeTool(name, args, { execCtx, signal, toolCtx }) {
  const tool = AGENT_TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(args || {}, toolCtx, signal);
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` };
  }
}

/**
 * Build the toolCtx passed to every AGENT_TOOLS execute() — matches the shape
 * wired up in src/components/chat/useToolInvoker.js so production and harness
 * drive the exact same create_tool / run_tool paths.
 */
function buildToolCtx(execCtx, registry, { onStep } = {}) {
  const toolCtx = {
    courseMap: execCtx.courseMap,
    deliverables: execCtx.deliverables,
    executeAction: (action, opts) => executeAction(action, { ...execCtx, ...(opts || {}) }),
    snapshot: execCtx.snapshot,
    undoFn: null,
    uid: null,
    customTools: {
      registry,
      invokeBuiltin: async (builtinName, builtinArgs, innerSignal) => {
        const builtin = AGENT_TOOLS[builtinName];
        if (!builtin) return { error: `Unknown tool in plan: ${builtinName}` };
        try {
          return await builtin.execute(builtinArgs || {}, toolCtx, innerSignal);
        } catch (err) {
          return { error: `builtin "${builtinName}" threw: ${err.message}` };
        }
      },
      onStep,
    },
  };
  return toolCtx;
}

// ── Anthropic-native tool-calling loop ──────────────────────────────────────

export async function runMultiTurn({
  userMessage,
  courseMap,
  deliverables,
  apiKey,
  model = 'claude-sonnet-4-6',
  activeTab = 'quizBank',
  maxIterations = 20,
  temperature = 0.4,
  maxTokens = 4096,
  verbose = false,
}) {
  if (!apiKey) throw new Error('apiKey required');
  const { state, execCtx } = createFixture(courseMap, deliverables);
  const registry = createCustomToolRegistry({ hydrateFromLocalStorage: false });
  // Capture macro step events so tests can assert on streaming behavior.
  const macroSteps = [];
  const toolCtx = buildToolCtx(execCtx, registry, {
    onStep: (event) => { macroSteps.push(event); },
  });
  const trace = [];
  const loopMessages = [{ role: 'user', content: userMessage }];
  const signatures = []; // loop detection

  // Tool list is stable — AGENT_TOOLS already includes create_tool + run_tool.
  // Custom macros are invoked by name via run_tool; no dynamic registration on
  // the LLM side is needed.
  const nativeTools = buildNativeTools('anthropic', AGENT_TOOLS);

  let finalResponse = null;
  let loopBroken = null;
  // Shared skill-creation nudge tracker — same thresholds as useToolInvoker.js.
  const skillNudge = createSkillNudgeTracker();
  // Match useToolInvoker.js: build the system prompt ONCE and reuse it across
  // iterations. Rebuilding per-turn confused the agent post-edit — the state
  // block would show the new title and the model would decide the edit wasn't
  // needed. Tool results remain the source of truth for "what changed".
  // Using the parts-split form so Anthropic emits two cache breakpoints.
  const systemParts = buildAgentSystemPromptParts(state.courseMap, activeTab, state.deliverables);

  // Apply prompt caching once — system prompt + tools are static across the loop.
  const cached = applyAnthropicCache(systemParts, nativeTools);

  for (let iter = 0; iter < maxIterations; iter++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: cached.system,
        tools: cached.tools,
        messages: loopMessages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Anthropic ${res.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const json = await res.json();
    const blocks = json.content || [];
    const textBlocks = blocks.filter(b => b.type === 'text').map(b => b.text);
    const toolCalls = blocks
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, args: b.input || {} }));

    trace.push({
      iter,
      usage: json.usage,
      stop_reason: json.stop_reason,
      text: textBlocks.join(''),
      calls: toolCalls.map(c => ({ name: c.name, args: c.args })),
    });
    if (verbose) {
      console.log(`\n--- iter ${iter} (stop=${json.stop_reason}) ---`);
      if (textBlocks.length) console.log('TEXT:', textBlocks.join('').slice(0, 200));
      for (const c of toolCalls) console.log(`CALL ${c.name}:`, JSON.stringify(c.args).slice(0, 300));
    }

    // Terminate on respond()
    const respond = toolCalls.find(c => c.name === 'respond');
    if (respond) {
      finalResponse = respond.args;
      break;
    }
    if (toolCalls.length === 0) {
      finalResponse = { chatReply: textBlocks.join('') || '(empty response)' };
      break;
    }

    // Loop detection — same tool+args called 3 times in a row.
    for (const c of toolCalls) {
      const sig = c.name + ':' + JSON.stringify(c.args);
      signatures.push(sig);
      const count = signatures.filter(s => s === sig).length;
      if (count >= 3) {
        loopBroken = { tool: c.name, repeats: count };
      }
    }
    if (loopBroken) break;

    // Execute tools, append assistant tool-use block + matching tool_result blocks.
    const toolResults = [];
    for (const c of toolCalls) {
      const result = await invokeTool(c.name, c.args, { execCtx, toolCtx });
      toolResults.push({ id: c.id, name: c.name, result });
    }
    // Anthropic expects the assistant content block (with tool_use) and then a
    // user message containing tool_result blocks.
    loopMessages.push({
      role: 'assistant',
      content: blocks, // preserve the exact content blocks we got back
    });
    loopMessages.push({
      role: 'user',
      content: toolResults.map(r => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result).slice(0, 4000),
      })),
    });

    // Skill-creation nudge — fires at most once per turn after the agent has
    // chained enough workflow steps that a macro would probably help.
    const nudgeResults = toolResults.map(r => ({ name: r.name, result: r.result }));
    if (skillNudge.update(nudgeResults)) {
      loopMessages.push({ role: 'user', content: SKILL_NUDGE_HINT });
    }
  }

  return {
    finalResponse,
    trace,
    state,
    customTools: registry.list(),
    macroSteps,
    loopBroken,
    iterations: trace.length,
    skillNudgeFired: skillNudge.fired,
    skillWorkflowCalls: skillNudge.workflowCalls,
    skillMaxAppliedInOne: skillNudge.maxAppliedInOne,
  };
}
