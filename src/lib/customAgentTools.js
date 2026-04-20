/**
 * customAgentTools.js — Session-scoped macro system for the agent.
 *
 * Lets the agent compose named workflows from existing AGENT_TOOLS at runtime
 * via create_tool(name, description, plan) and invoke them via run_tool(name, args).
 * Plans are declarative (no code eval): each step is {id, tool, args} where args
 * may reference {{args.X}} or {{steps.<id>.<path>}} placeholders.
 *
 * Shared by the React runtime (useToolInvoker) and the test harness, so one
 * implementation is exercised in both.
 */

const MAX_TOOLS = 12;
const MAX_STEPS = 8;
const MAX_NESTED_DEPTH = 2;
const NAME_RE = /^[a-z][a-z0-9_]{1,39}$/i;
const RESERVED_NAMES = new Set(['respond', 'create_tool', 'run_tool']);

export function createCustomToolRegistry() {
  const tools = {};
  return {
    list: () => Object.entries(tools).map(([name, def]) => ({ name, ...def })),
    has: (name) => Object.prototype.hasOwnProperty.call(tools, name),
    get: (name) => tools[name],
    clear: () => { for (const k of Object.keys(tools)) delete tools[k]; },
    register(def, { existingToolNames }) {
      if (!def?.name || typeof def.name !== 'string') return { ok: false, error: 'name required' };
      if (!NAME_RE.test(def.name)) {
        return { ok: false, error: 'name must start with a letter and be 2-40 chars of [a-zA-Z0-9_]' };
      }
      if (RESERVED_NAMES.has(def.name)) return { ok: false, error: `"${def.name}" is reserved` };
      if (existingToolNames?.has(def.name)) return { ok: false, error: `"${def.name}" collides with a built-in tool` };
      if (Object.keys(tools).length >= MAX_TOOLS && !tools[def.name]) {
        return { ok: false, error: `custom tool limit reached (${MAX_TOOLS}). Delete one first or reuse an existing macro.` };
      }
      if (!Array.isArray(def.plan) || def.plan.length === 0) {
        return { ok: false, error: 'plan must be a non-empty array' };
      }
      if (def.plan.length > MAX_STEPS) {
        return { ok: false, error: `plan exceeds max ${MAX_STEPS} steps` };
      }
      const seenIds = new Set();
      for (const step of def.plan) {
        if (!step || typeof step !== 'object') return { ok: false, error: 'each plan step must be an object' };
        if (!step.id || typeof step.id !== 'string') return { ok: false, error: 'each step needs a string "id"' };
        if (seenIds.has(step.id)) return { ok: false, error: `duplicate step id "${step.id}"` };
        seenIds.add(step.id);
        if (!step.tool || typeof step.tool !== 'string') return { ok: false, error: `step "${step.id}" needs a "tool" name` };
        if (!existingToolNames?.has(step.tool)) {
          return { ok: false, error: `step "${step.id}" references unknown tool "${step.tool}". Custom tools may only compose built-ins.` };
        }
      }
      tools[def.name] = {
        description: def.description || '',
        params: def.params || {},
        plan: def.plan,
        createdAt: Date.now(),
      };
      return { ok: true };
    },
  };
}

/** Walk a dotted path inside an object; undefined if any hop is missing. */
function getPath(obj, path) {
  if (obj == null) return undefined;
  let cur = obj;
  for (const p of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Substitute {{args.X}} and {{steps.Y.Z}} placeholders inside a (possibly nested)
 * JSON value. Pure string replace — no eval, no code execution.
 *
 * A "bare" placeholder like "{{args.items}}" preserves the referenced value's
 * type (object / array / number). Interpolated placeholders inside a longer
 * string produce strings (JSON-stringified for non-primitives).
 */
export function substitute(value, bindings) {
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (whole) {
      const resolved = getPath(bindings, whole[1].trim());
      return resolved === undefined ? value : resolved;
    }
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => {
      const v = getPath(bindings, path.trim());
      if (v === undefined) return '';
      return typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map(v => substitute(v, bindings));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substitute(v, bindings);
    return out;
  }
  return value;
}

/**
 * Execute a custom tool's plan. `invokeBuiltin(name, args)` is provided by the
 * caller — lets the harness and the React runtime share this logic while wiring
 * up different underlying tool-execution contexts.
 */
export async function runPlan({ def, runtimeArgs, invokeBuiltin, depth = 0 }) {
  if (depth > MAX_NESTED_DEPTH) return { error: 'Nested tool depth exceeded' };
  const bindings = { args: runtimeArgs || {}, steps: {} };
  const stepResults = [];
  for (const step of def.plan) {
    const resolvedArgs = substitute(step.args || {}, bindings);
    let result;
    try {
      result = await invokeBuiltin(step.tool, resolvedArgs);
    } catch (err) {
      result = { error: `builtin "${step.tool}" threw: ${err.message}` };
    }
    bindings.steps[step.id] = result;
    stepResults.push({ id: step.id, tool: step.tool, result });
    if (result && result.error) {
      return { error: `step "${step.id}" (${step.tool}) failed: ${result.error}`, stepResults };
    }
  }
  return { ok: true, steps: stepResults };
}

/** JSON Schemas used by the AGENT_TOOLS wrappers. */
export const CREATE_TOOL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Identifier: must start with a letter, 2-40 chars of [a-zA-Z0-9_].' },
    description: { type: 'string', description: 'Short description of what the macro does — so you (the agent) can decide when to use it later.' },
    params: { type: 'object', description: 'Optional {paramName: "type — description"} map documenting runtime args.' },
    plan: {
      type: 'array',
      description: 'Ordered steps composing built-in tools. Each: {id, tool, args}. args may reference {{args.X}} or {{steps.<id>.<path>}}.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique step id.' },
          tool: { type: 'string', description: 'Name of a built-in tool (not respond, create_tool, run_tool).' },
          args: { type: 'object', description: 'Args passed to the tool. May contain placeholder strings.' },
        },
        required: ['id', 'tool', 'args'],
      },
    },
  },
  required: ['name', 'description', 'plan'],
};

export const RUN_TOOL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Name of a previously registered custom tool.' },
    args: { type: 'object', description: 'Runtime args — substituted into {{args.X}} placeholders in the plan.' },
  },
  required: ['name'],
};
