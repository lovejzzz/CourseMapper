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
const STORAGE_KEY = 'coursemapper-custom-tools';

// ── Local persistence (no-op outside the browser so Node tests still work) ─

function hasLocalStorage() {
  return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

function loadLocal() {
  if (!hasLocalStorage()) return {};
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocal(tools) {
  if (!hasLocalStorage()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch {
    /* localStorage full — silently ignore */
  }
}

/**
 * Create a session-scoped registry.
 * @param {Object} opts
 * @param {Object|Array} [opts.initial] — tools to preseed the registry with.
 *   Accepts the object-of-tools shape (`{name: def}`) or an array of tool
 *   definitions ({name, description, plan, params, createdAt}).
 * @param {boolean} [opts.hydrateFromLocalStorage=true] — if true and no
 *   `initial` is provided, load previously persisted tools on creation.
 * @param {Function} [opts.onCloudSync] — optional (tool, op) callback invoked
 *   on register/delete so the caller can fire cloud writes. `op` is 'save' or
 *   'delete'; `tool` is the full def for save, or `{name}` for delete.
 */
export function createCustomToolRegistry(opts = {}) {
  const hydrate = opts.hydrateFromLocalStorage !== false;
  let tools = {};
  if (opts.initial) {
    if (Array.isArray(opts.initial)) {
      for (const def of opts.initial) if (def?.name) tools[def.name] = def;
    } else if (typeof opts.initial === 'object') {
      tools = { ...opts.initial };
    }
  } else if (hydrate) {
    tools = loadLocal();
  }
  const onCloudSync = opts.onCloudSync || (() => {});

  return {
    list: () => Object.entries(tools).map(([name, def]) => ({ name, ...def })),
    has: (name) => Object.prototype.hasOwnProperty.call(tools, name),
    get: (name) => tools[name],
    clear: () => {
      const names = Object.keys(tools);
      for (const k of names) delete tools[k];
      saveLocal(tools);
      for (const name of names) onCloudSync({ name }, 'delete');
    },
    delete(name) {
      if (!tools[name]) return { ok: false, error: `No tool named "${name}"` };
      delete tools[name];
      saveLocal(tools);
      onCloudSync({ name }, 'delete');
      return { ok: true };
    },
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
      const toolDef = {
        name: def.name,
        description: def.description || '',
        params: def.params || {},
        plan: def.plan,
        createdAt: Date.now(),
      };
      tools[def.name] = toolDef;
      saveLocal(tools);
      onCloudSync(toolDef, 'save');
      return { ok: true };
    },
  };
}

/**
 * Merge cloud-stored custom tools with local on sign-in. Cloud wins on conflict
 * by `updatedAt` (Firestore timestamp beats the local millis integer on ties,
 * which is the safe direction — cloud is the source of truth across devices).
 */
export async function mergeCloudCustomTools(uid) {
  if (!uid) return;
  let cloudLoad, cloudSave;
  try {
    ({ loadCustomTools: cloudLoad, saveCustomTool: cloudSave } = await import('./cloudStorage'));
  } catch { return; }
  try {
    const cloudTools = await cloudLoad(uid);
    if (!cloudTools || cloudTools.length === 0) {
      // No cloud tools — push any local tools up so they survive this device dying.
      const local = loadLocal();
      for (const def of Object.values(local)) cloudSave(uid, def).catch(() => {});
      return;
    }
    const local = loadLocal();
    const merged = { ...local };
    for (const cm of cloudTools) {
      const localDef = merged[cm.name];
      if (!localDef) {
        merged[cm.name] = cm;
      } else {
        const cloudTime = cm.updatedAt?.toDate?.()?.getTime() ?? new Date(cm.updatedAt || 0).getTime();
        const localTime = localDef.updatedAt || localDef.createdAt || 0;
        if (cloudTime >= localTime) merged[cm.name] = { ...cm };
      }
    }
    saveLocal(merged);
    // Push any local-only tools up so this device's additions reach the cloud.
    for (const [name, def] of Object.entries(merged)) {
      if (!cloudTools.find(c => c.name === name)) cloudSave(uid, def).catch(() => {});
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[customAgentTools] cloud merge failed:', e?.message);
  }
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
