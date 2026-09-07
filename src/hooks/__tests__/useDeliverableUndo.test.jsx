/** @vitest-environment happy-dom */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import useDeliverableUndo from '../useDeliverableUndo.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});
async function setup(maxSize = 30) {
  let hook, state, set, context, setContext;
  function Harness() {
    [state, set] = useState({
      assignments: { data: { text: 'A' }, status: 'done' },
      rubrics: { data: { answer: '40%' }, stale: false },
    });
    [context, setContext] = useState({ courseMap: { count: 50 }, courseGraph: null });
    hook = useDeliverableUndo(maxSize, { deliverables: state, ...context });
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  return {
    hook: () => hook,
    state: () => state,
    set: (value) => set(value),
    owner: {
      read: () => context,
      restore: (value) => {
        context = value;
        setContext(value);
      },
    },
    async edit(id, data) {
      await act(async () => {
        hook.snapshot(id, state[id].data);
        set((s) => ({ ...s, [id]: { ...s[id], data } }));
      });
    },
  };
}

describe('deliverable edit history', () => {
  it('restores actual edited values on repeated undo/redo across two materials', async () => {
    const h = await setup();
    await h.edit('assignments', { text: 'B' });
    await h.edit('rubrics', { answer: '25%' });
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        h.hook().undo(h.set);
        h.hook().undo(h.set);
      });
      expect(h.state().assignments.data.text).toBe('A');
      expect(h.state().rubrics.data.answer).toBe('40%');
      await act(async () => {
        h.hook().redo(h.set);
        h.hook().redo(h.set);
      });
      expect(h.state().assignments.data.text).toBe('B');
      expect(h.state().rubrics.data.answer).toBe('25%');
    }
  });
  it('restores linked materials and course structure in one transaction after a file round trip', async () => {
    const h = await setup();
    await act(async () => {
      h.hook().snapshotTransaction(h.state(), h.owner.read());
      h.set((s) => ({
        ...s,
        assignments: { ...s.assignments, data: { text: '20/80' } },
        rubrics: { ...s.rubrics, data: { answer: '25%' }, stale: true },
      }));
      h.owner.restore({ courseMap: { count: 80 }, courseGraph: null });
    });
    const saved = JSON.parse(
      JSON.stringify({ editHistory: h.hook().history, deliverables: h.state(), ...h.owner.read() }),
    );
    await act(async () => h.hook().reset());
    expect(h.hook().canUndo).toBe(false);
    await act(async () => h.hook().restore(saved.editHistory, saved));
    await act(async () => h.hook().undo(h.set, h.owner));
    expect(h.owner.read().courseMap.count).toBe(50);
    expect(h.state().rubrics.stale).toBe(false);
    const savedUndone = JSON.parse(
      JSON.stringify({ editHistory: h.hook().history, deliverables: h.state(), ...h.owner.read() }),
    );
    await act(async () => h.hook().restore(savedUndone.editHistory, savedUndone));
    await act(async () => h.hook().redo(h.set, h.owner));
    expect(h.owner.read().courseMap.count).toBe(80);
    expect(h.state().assignments.data.text).toBe('20/80');
    expect(h.state().rubrics.stale).toBe(true);
  });
  it('discards redo on a substantive new edit and bounds history', async () => {
    const h = await setup(1);
    await h.edit('assignments', { text: 'B' });
    await h.edit('assignments', { text: 'C' });
    await act(async () => h.hook().undo(h.set));
    expect(h.state().assignments.data.text).toBe('B');
    expect(h.hook().canUndo).toBe(false);
    await h.edit('assignments', { text: 'D' });
    expect(h.hook().canRedo).toBe(false);
    await act(async () => h.hook().undo(h.set));
    expect(h.state().assignments.data.text).toBe('B');
  });
  it('does not let a no-op capture absorb an untracked later generation', async () => {
    const h = await setup();
    await act(async () => h.hook().snapshot('assignments', h.state().assignments.data));
    await act(async () => h.set((s) => ({ ...s, assignments: { data: { text: 'Regenerated' } } })));
    expect(h.hook().canUndo).toBe(false);
  });
  it('refuses to overwrite a newer untracked edit and leaves the cursor unchanged', async () => {
    const h = await setup();
    await h.edit('assignments', { text: 'B' });
    await act(async () => h.set((s) => ({ ...s, assignments: { data: { text: 'Untracked' } } })));
    await act(async () => h.hook().undo(h.set));
    expect(h.state().assignments.data.text).toBe('Untracked');
    expect(h.hook().history.cursor).toBe(1);
    expect(h.hook().message).toContain('changed after');
  });
  it('clears old history on legacy project restore and clears pending captures on reset', async () => {
    const h = await setup();
    await h.edit('assignments', { text: 'B' });
    await act(async () => h.hook().restore(undefined, { deliverables: {} }));
    expect(h.hook().canUndo).toBe(false);
    await act(async () => {
      h.hook().snapshot('assignments', h.state().assignments.data);
      h.hook().reset();
      h.set({ assignments: { data: { text: 'Different project' } } });
    });
    expect(h.hook().canUndo).toBe(false);
  });
  it('groups batched repairs and retains the earliest value of each field', async () => {
    const h = await setup();
    await act(async () => {
      h.hook().snapshot('assignments', { text: 'A' });
      h.hook().snapshot('assignments', { text: 'Intermediate' });
      h.hook().snapshot('rubrics', { answer: '40%' });
      h.set((s) => ({
        assignments: { ...s.assignments, data: { text: 'C' } },
        rubrics: { ...s.rubrics, data: { answer: '25%' } },
      }));
    });
    expect(h.hook().history.entries).toHaveLength(1);
    await act(async () => h.hook().undo(h.set));
    expect(h.state().assignments.data.text).toBe('A');
    expect(h.state().rubrics.data.answer).toBe('40%');
  });
});
