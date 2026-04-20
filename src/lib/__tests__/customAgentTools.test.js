/**
 * customAgentTools.test.js — registry behavior + persistence + plan runner.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCustomToolRegistry, substitute, runPlan,
  exportCustomTool, parseExportedTool,
  CREATE_TOOL_JSON_SCHEMA, RUN_TOOL_JSON_SCHEMA,
} from '../customAgentTools';

// Minimal localStorage polyfill so the registry's save/load path is exercised.
class FakeStorage {
  constructor() { this.store = {}; }
  getItem(k) { return k in this.store ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

beforeEach(() => {
  globalThis.localStorage = new FakeStorage();
});

const BUILTINS = new Set(['read_deliverable', 'validate_course', 'edit_deliverables']);

const VALID_PLAN = [
  { id: 's1', tool: 'read_deliverable', args: { featureId: '{{args.featureId}}' } },
  { id: 's2', tool: 'validate_course', args: {} },
];

describe('createCustomToolRegistry', () => {
  it('registers a valid tool and persists to localStorage', () => {
    const reg = createCustomToolRegistry();
    const res = reg.register(
      { name: 'audit_bloom', description: 'd', plan: VALID_PLAN },
      { existingToolNames: BUILTINS }
    );
    expect(res.ok).toBe(true);
    expect(reg.has('audit_bloom')).toBe(true);
    const stored = JSON.parse(globalThis.localStorage.getItem('coursemapper-custom-tools'));
    expect(stored.audit_bloom).toBeDefined();
    expect(stored.audit_bloom.plan).toEqual(VALID_PLAN);
  });

  it('hydrates from localStorage by default on creation', () => {
    globalThis.localStorage.setItem('coursemapper-custom-tools', JSON.stringify({
      foo: { name: 'foo', description: 'd', plan: VALID_PLAN, createdAt: 1 },
    }));
    const reg = createCustomToolRegistry();
    expect(reg.has('foo')).toBe(true);
    expect(reg.list()).toHaveLength(1);
  });

  it('accepts an explicit initial array and skips localStorage', () => {
    globalThis.localStorage.setItem('coursemapper-custom-tools', JSON.stringify({
      old: { name: 'old', description: 'd', plan: VALID_PLAN, createdAt: 1 },
    }));
    const reg = createCustomToolRegistry({ initial: [{ name: 'new', description: 'd', plan: VALID_PLAN, createdAt: 2 }] });
    expect(reg.has('old')).toBe(false);
    expect(reg.has('new')).toBe(true);
  });

  it('skips localStorage when hydrateFromLocalStorage is false', () => {
    globalThis.localStorage.setItem('coursemapper-custom-tools', JSON.stringify({
      foo: { name: 'foo', description: 'd', plan: VALID_PLAN, createdAt: 1 },
    }));
    const reg = createCustomToolRegistry({ hydrateFromLocalStorage: false });
    expect(reg.list()).toEqual([]);
  });

  it('fires onCloudSync("save") after register and ("delete") after delete', () => {
    const cloudSync = vi.fn();
    const reg = createCustomToolRegistry({ onCloudSync: cloudSync });
    reg.register({ name: 'xyz', description: 'd', plan: VALID_PLAN }, { existingToolNames: BUILTINS });
    expect(cloudSync).toHaveBeenCalledWith(expect.objectContaining({ name: 'xyz' }), 'save');

    cloudSync.mockClear();
    reg.delete('xyz');
    expect(cloudSync).toHaveBeenCalledWith({ name: 'xyz' }, 'delete');
    expect(reg.has('xyz')).toBe(false);
  });

  it('rejects reserved names', () => {
    const reg = createCustomToolRegistry();
    for (const name of ['respond', 'create_tool', 'run_tool']) {
      const res = reg.register({ name, description: 'd', plan: VALID_PLAN }, { existingToolNames: BUILTINS });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/reserved/i);
    }
  });

  it('rejects names that collide with built-ins', () => {
    const reg = createCustomToolRegistry();
    const res = reg.register(
      { name: 'read_deliverable', description: 'd', plan: VALID_PLAN },
      { existingToolNames: BUILTINS }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/built-in/i);
  });

  it('rejects plans referencing unknown tools', () => {
    const reg = createCustomToolRegistry();
    const res = reg.register(
      { name: 'bad', description: 'd', plan: [{ id: 's1', tool: 'nonexistent', args: {} }] },
      { existingToolNames: BUILTINS }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown tool/i);
  });

  it('rejects duplicate step ids inside a plan', () => {
    const reg = createCustomToolRegistry();
    const res = reg.register(
      { name: 'dup', description: 'd', plan: [
        { id: 'a', tool: 'read_deliverable', args: {} },
        { id: 'a', tool: 'validate_course', args: {} },
      ]},
      { existingToolNames: BUILTINS }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/duplicate step id/i);
  });

  it('enforces the 8-step plan cap', () => {
    const bigPlan = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, tool: 'validate_course', args: {} }));
    const reg = createCustomToolRegistry();
    const res = reg.register(
      { name: 'big', description: 'd', plan: bigPlan },
      { existingToolNames: BUILTINS }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/max 8/);
  });

  it('enforces the 12-tool session cap', () => {
    const reg = createCustomToolRegistry();
    for (let i = 0; i < 12; i++) {
      reg.register({ name: `t${i}`, description: 'd', plan: VALID_PLAN }, { existingToolNames: BUILTINS });
    }
    const res = reg.register({ name: 'overflow', description: 'd', plan: VALID_PLAN }, { existingToolNames: BUILTINS });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/limit reached/i);
  });
});

describe('substitute()', () => {
  it('returns the raw value for a bare {{args.X}} placeholder', () => {
    const obj = { items: [1, 2, 3] };
    expect(substitute('{{args.items}}', { args: obj })).toEqual([1, 2, 3]);
  });

  it('interpolates placeholders inside a larger string', () => {
    expect(substitute('Hello, {{args.name}}!', { args: { name: 'world' } })).toBe('Hello, world!');
  });

  it('returns the original string when the path is missing', () => {
    expect(substitute('{{args.missing}}', { args: {} })).toBe('{{args.missing}}');
  });

  it('recurses into objects and arrays', () => {
    const out = substitute({ a: '{{args.x}}', b: [{ c: '{{args.y}}' }] }, { args: { x: 1, y: 2 } });
    expect(out).toEqual({ a: 1, b: [{ c: 2 }] });
  });

  it('walks dotted step paths', () => {
    const result = substitute('{{steps.s1.data.count}}', { steps: { s1: { data: { count: 42 } } } });
    expect(result).toBe(42);
  });
});

describe('runPlan()', () => {
  it('invokes builtins in order and threads step outputs into subsequent args', async () => {
    const calls = [];
    const invokeBuiltin = async (name, args) => {
      calls.push({ name, args });
      if (name === 'read_deliverable') return { items: [1, 2, 3] };
      if (name === 'edit_deliverables') return { applied: args.actions?.length || 0 };
      return { ok: true };
    };
    const def = {
      plan: [
        { id: 'r', tool: 'read_deliverable', args: { featureId: '{{args.featureId}}' } },
        { id: 'e', tool: 'edit_deliverables', args: { actions: '{{steps.r.items}}' } },
      ],
    };
    const res = await runPlan({ def, runtimeArgs: { featureId: 'quizBank' }, invokeBuiltin });
    expect(res.ok).toBe(true);
    expect(calls[0].args).toEqual({ featureId: 'quizBank' });
    expect(calls[1].args).toEqual({ actions: [1, 2, 3] });
    expect(res.steps).toHaveLength(2);
  });

  it('short-circuits and reports which step failed', async () => {
    const invokeBuiltin = async (name) => name === 'validate_course' ? { error: 'boom' } : {};
    const def = { plan: [{ id: 'v', tool: 'validate_course', args: {} }] };
    const res = await runPlan({ def, runtimeArgs: {}, invokeBuiltin });
    expect(res.error).toMatch(/step "v" \(validate_course\) failed: boom/);
  });

  it('guards against excessive nested depth', async () => {
    const def = { plan: [] };
    const res = await runPlan({ def, runtimeArgs: {}, invokeBuiltin: async () => ({}), depth: 3 });
    expect(res.error).toMatch(/Nested tool depth exceeded/);
  });

  it('fires onStep with running + done events for each successful step', async () => {
    const events = [];
    const invokeBuiltin = async (name) => ({ ran: name });
    const def = { plan: [
      { id: 'a', tool: 'read_deliverable', args: {} },
      { id: 'b', tool: 'validate_course', args: {} },
    ]};
    await runPlan({ def, runtimeArgs: {}, invokeBuiltin, onStep: (e) => events.push(e) });
    // 2 steps * (running + done) = 4 events in order
    expect(events.map(e => `${e.index}:${e.status}`)).toEqual(['0:running', '0:done', '1:running', '1:done']);
    expect(events[3].total).toBe(2);
  });

  it('fires onStep with an error event when a step fails', async () => {
    const events = [];
    const invokeBuiltin = async () => ({ error: 'nope' });
    const def = { plan: [{ id: 'v', tool: 'validate_course', args: {} }] };
    await runPlan({ def, runtimeArgs: {}, invokeBuiltin, onStep: (e) => events.push(e) });
    expect(events.map(e => e.status)).toEqual(['running', 'error']);
    expect(events[1].error).toBe('nope');
  });

  it('never aborts the plan when onStep throws', async () => {
    const invokeBuiltin = async () => ({ ok: true });
    const def = { plan: [{ id: 'a', tool: 'validate_course', args: {} }] };
    const res = await runPlan({
      def, runtimeArgs: {}, invokeBuiltin,
      onStep: () => { throw new Error('boom'); },
    });
    expect(res.ok).toBe(true);
  });
});

describe('export / import round-trip', () => {
  it('serializes a tool into a versioned JSON payload', () => {
    const tool = { name: 'audit', description: 'd', params: { featureId: 'string' }, plan: VALID_PLAN, createdAt: 12345 };
    const json = exportCustomTool(tool);
    const parsed = JSON.parse(json);
    expect(parsed.kind).toBe('coursemapper-macro');
    expect(parsed.version).toBe(1);
    expect(parsed.tool.name).toBe('audit');
    expect(parsed.tool.plan).toEqual(VALID_PLAN);
    // createdAt should NOT be carried over — import sets a fresh one.
    expect(parsed.tool.createdAt).toBeUndefined();
  });

  it('throws when exporting a bad tool', () => {
    expect(() => exportCustomTool(null)).toThrow();
    expect(() => exportCustomTool({})).toThrow();
  });

  it('parseExportedTool accepts a valid payload and strips extras', () => {
    const tool = { name: 'audit', description: 'd', params: {}, plan: VALID_PLAN };
    const json = exportCustomTool(tool);
    const parsed = parseExportedTool(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.def.name).toBe('audit');
    expect(parsed.def.plan).toEqual(VALID_PLAN);
  });

  it('parseExportedTool rejects malformed JSON', () => {
    expect(parseExportedTool('not json').ok).toBe(false);
    expect(parseExportedTool('{}').ok).toBe(false);
    expect(parseExportedTool('{"kind":"wrong"}').ok).toBe(false);
    expect(parseExportedTool(JSON.stringify({ kind: 'coursemapper-macro', version: 99 })).ok).toBe(false);
    expect(parseExportedTool(JSON.stringify({ kind: 'coursemapper-macro', version: 1 })).ok).toBe(false);
  });

  it('round-trips through registry.register', () => {
    const tool = { name: 'round_trip', description: 'd', params: {}, plan: VALID_PLAN };
    const json = exportCustomTool(tool);
    const reg = createCustomToolRegistry();
    const parsed = parseExportedTool(json);
    expect(parsed.ok).toBe(true);
    const res = reg.register(parsed.def, { existingToolNames: BUILTINS });
    expect(res.ok).toBe(true);
    expect(reg.get('round_trip').plan).toEqual(VALID_PLAN);
  });
});

describe('JSON schemas', () => {
  it('exposes valid CREATE_TOOL / RUN_TOOL schemas for native tool-calling', () => {
    expect(CREATE_TOOL_JSON_SCHEMA.required).toEqual(['name', 'description', 'plan']);
    expect(RUN_TOOL_JSON_SCHEMA.required).toEqual(['name']);
  });
});
