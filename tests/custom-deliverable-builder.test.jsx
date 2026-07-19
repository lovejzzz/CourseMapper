/**
 * @vitest-environment happy-dom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/contexts/AIConfigContext', () => ({
  useAIConfig: () => ({ provider: 'scion-public', apiKey: '', modelId: 'scion-v0.16' }),
}));

import { CustomDeliverableBuilder } from '../src/screens/FeatureSelect.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mounted = [];

function renderBuilder(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(<CustomDeliverableBuilder isOpen onClose={() => {}} onSave={() => {}} {...props} />),
  );
  mounted.push({ root, container });
  return { container, root };
}

function button(container, label) {
  return [...container.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
});

describe('custom deliverable builder', () => {
  it('keeps forward navigation blocked until the required name is visible', () => {
    const { container, root } = renderBuilder();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]');
    const name = container.querySelector('#custom-deliverable-name');
    const next = button(container, 'Next');
    const settingsTab = button(container, '2. Prompt & Settings');

    expect(dialog?.getAttribute('aria-labelledby')).toBe('custom-deliverable-dialog-title');
    expect(dialog?.className).toContain('overflow-hidden');
    expect(dialog?.className).toContain('dark:bg-slate-950');
    expect(dialog?.querySelector('.overflow-y-auto')).toBeTruthy();
    expect(name?.labels?.[0]?.textContent).toContain('Name');
    expect(name?.getAttribute('aria-describedby')).toBe('custom-deliverable-name-hint');
    expect(next?.disabled).toBe(true);
    expect(settingsTab?.disabled).toBe(true);

    act(() => {
      const previousValue = name.value;
      name.value = 'Weekly Learning Journal';
      name._valueTracker?.setValue(previousValue);
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    expect(next?.disabled).toBe(false);
    expect(settingsTab?.disabled).toBe(false);

    act(() => next.click());
    expect(container.textContent).toContain('Default Tone');
    expect(container.textContent).not.toContain('Add a name to continue.');

    act(() => root.render(<CustomDeliverableBuilder isOpen={false} onClose={() => {}} onSave={() => {}} />));
    act(() => root.render(<CustomDeliverableBuilder isOpen onClose={() => {}} onSave={() => {}} />));
    expect(container.textContent).toContain('Add a name to continue.');
    expect(container.textContent).not.toContain('Default Tone');
    expect(container.querySelector('#custom-deliverable-name')?.value).toBe('');
  });

  it('closes explicitly from Escape or the backdrop without sacrificing the focus trap', () => {
    const onClose = vi.fn();
    const { container } = renderBuilder({ onClose });
    const dialog = container.querySelector('[role="dialog"]');
    const backdrop = dialog?.parentElement;

    act(() => dialog?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => backdrop?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
