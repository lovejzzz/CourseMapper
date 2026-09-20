/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { CustomDeliverableBuilder } from '../FeatureSelect';
vi.mock('focus-trap-react', () => ({ default: ({ children }) => children }));
vi.mock('../../contexts/AIConfigContext', () => ({ useAIConfig: () => ({}) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../contexts/CourseContext', () => ({ useCourse: () => ({}) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
it('keeps the edited definition open after a failed save and permits retry', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  const onSave = vi.fn().mockRejectedValueOnce(new Error('Browser storage is full'));
  try {
    await act(async () =>
      root.render(
        <CustomDeliverableBuilder
          isOpen
          onClose={onClose}
          onSave={onSave}
          editDef={{ id: 'custom_test', name: 'Retain this edit', description: 'Retain description' }}
        />,
      ),
    );
    const click = async (label) =>
      act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click());
    await click('Next');
    await click('Save Changes');
    expect(container.querySelector('[role="alert"]').textContent).toBe('Browser storage is full');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await click('Save Changes');
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0]).toMatchObject({ name: 'Retain this edit', description: 'Retain description' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('waits for cloud confirmation and disables duplicate submissions while saving', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let rejectSave;
  const onSave = vi.fn(
    () =>
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
  );
  try {
    await act(async () =>
      root.render(
        <CustomDeliverableBuilder
          isOpen
          onClose={() => {}}
          onSave={onSave}
          editDef={{ id: 'custom_pending', name: 'Pending definition' }}
        />,
      ),
    );
    const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    await act(async () => button('Next').click());
    await act(async () => button('Save Changes').click());
    expect(button('Saving…').disabled).toBe(true);
    await act(async () => button('Saving…').click());
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('Cloud unavailable')));
    expect(container.querySelector('[role="alert"]').textContent).toBe('Cloud unavailable');
    expect(button('Save Changes').disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('invalidates pending follow-up actions when a saving editor is closed', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let finish;
  const onClose = vi.fn();
  const onSave = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  try {
    await act(async () =>
      root.render(
        <CustomDeliverableBuilder
          isOpen
          onClose={onClose}
          onSave={onSave}
          editDef={{ id: 'custom_cancel', name: 'Save without generating' }}
        />,
      ),
    );
    const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    await act(async () => button('Next').click());
    await act(async () => button('Save Changes').click());
    expect(container.querySelector('fieldset').disabled).toBe(true);
    const { isCurrent } = onSave.mock.calls[0][1];
    expect(isCurrent()).toBe(true);
    await act(async () => button('Close (save continues)').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(isCurrent()).toBe(false);
    await act(async () => finish());
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
