/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import useDeliverableUndo from '../useDeliverableUndo.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
});
async function setup(maxSize = 30) {
  let hook;
  function Harness() {
    hook = useDeliverableUndo(maxSize);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  let state = {
    assignments: { data: { text: 'A' }, status: 'done' },
    rubrics: { data: { answer: '40%' }, stale: false },
  };
  return {
    hook: () => hook,
    state: () => state,
    set: (fn) => {
      state = fn(state);
    },
  };
}

describe('deliverable edit history', () => {
  it('restores the edited value on redo, including repeated undo/redo and two different materials', async () => {
    const h = await setup();
    await act(async () => h.hook().snapshot('assignments', h.state().assignments.data));
    h.set((s) => ({ ...s, assignments: { ...s.assignments, data: { text: 'B' } } }));
    await act(async () => h.hook().snapshot('rubrics', h.state().rubrics.data));
    h.set((s) => ({ ...s, rubrics: { ...s.rubrics, data: { answer: '25%' } } }));
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
  it('swaps a linked package and its canonical source in one transaction', async () => {
    const h = await setup();
    let context = { denominator: 50 };
    const owner = {
      read: () => context,
      restore: (value) => {
        context = value;
      },
    };
    await act(async () =>
      h.hook().snapshotTransaction({ assignments: h.state().assignments, rubrics: h.state().rubrics }, context),
    );
    h.set((s) => ({
      ...s,
      assignments: { ...s.assignments, data: { text: '20/80' } },
      rubrics: { ...s.rubrics, data: { answer: '25%' }, stale: true },
    }));
    context = { denominator: 80 };
    await act(async () => h.hook().undo(h.set, owner));
    expect(context.denominator).toBe(50);
    expect(h.state().rubrics.stale).toBe(false);
    await act(async () => h.hook().redo(h.set, owner));
    expect(context.denominator).toBe(80);
    expect(h.state().assignments.data.text).toBe('20/80');
    expect(h.state().rubrics.stale).toBe(true);
  });
  it('discards the redo branch on a new edit and bounds history', async () => {
    const h = await setup(1);
    await act(async () => h.hook().snapshot('assignments', h.state().assignments.data));
    h.set((s) => ({ ...s, assignments: { data: { text: 'B' } } }));
    await act(async () => h.hook().snapshot('assignments', h.state().assignments.data));
    h.set((s) => ({ ...s, assignments: { data: { text: 'C' } } }));
    await act(async () => h.hook().undo(h.set));
    expect(h.state().assignments.data.text).toBe('B');
    expect(h.hook().canUndo).toBe(false);
    await act(async () => h.hook().snapshot('assignments', h.state().assignments.data));
    expect(h.hook().canRedo).toBe(false);
  });
});
