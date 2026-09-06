/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import useBoundedAutosave from '../useBoundedAutosave.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  vi.useRealTimers();
});

it('persists the newest snapshot on time despite continuous review updates and does not keep saving an unchanged state', async () => {
  vi.useFakeTimers();
  const written = [];
  const pending = vi.fn();
  function Harness({ snapshot }) {
    useBoundedAutosave(() => written.push(snapshot), true, pending);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness snapshot={0} />));
  for (let i = 1; i <= 5; i++) {
    await act(async () => vi.advanceTimersByTime(500));
    await act(async () => root.render(<Harness snapshot={i} />));
  }
  expect(written).toEqual([]);
  await act(async () => vi.advanceTimersByTime(500));
  expect(written).toEqual([5]);
  await act(async () => vi.advanceTimersByTime(12000));
  expect(written).toEqual([5]);
});

it('cancels pending writes when a project closes and starts a fresh deadline for the next project', async () => {
  vi.useFakeTimers();
  const written = [];
  const pending = vi.fn();
  let cancel;
  function Harness({ enabled, name }) {
    cancel = useBoundedAutosave(() => written.push(name), enabled, pending);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness enabled name="old" />));
  await act(async () => vi.advanceTimersByTime(2000));
  await act(async () => cancel());
  await act(async () => root.render(<Harness enabled={false} name="old" />));
  await act(async () => vi.advanceTimersByTime(3000));
  expect(written).toEqual([]);
  await act(async () => root.render(<Harness enabled name="new" />));
  await act(async () => vi.advanceTimersByTime(3000));
  expect(written).toEqual(['new']);
});
