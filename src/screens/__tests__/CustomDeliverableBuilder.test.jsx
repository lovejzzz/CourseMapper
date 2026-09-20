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
  const onSave = vi.fn().mockImplementationOnce(() => {
    throw new Error('Browser storage is full');
  });
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
