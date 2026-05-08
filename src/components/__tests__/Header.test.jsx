/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Header from '../Header.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../DarkModeToggle', () => ({
  default: () => null,
}));

describe('Header developer IDE action', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderHeader(props) {
    act(() => {
      root.render(<Header {...props} />);
    });
  }

  it('greys out the IDE button while generation is running', () => {
    const onOpenDeveloperPanel = vi.fn();

    renderHeader({
      developerMode: true,
      onOpenDeveloperPanel,
      developerIdeDisabled: true,
      developerIdeDisabledReason: 'Deliverables are still generating.',
    });

    const button = [...container.querySelectorAll('button')].find((node) => node.textContent.includes('IDE'));

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Deliverables are still generating.');

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onOpenDeveloperPanel).not.toHaveBeenCalled();
  });
});
