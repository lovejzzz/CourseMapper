/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import UserMenu from '../UserMenu';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  current: {
    user: null,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

describe('UserMenu signed-out developer controls', () => {
  let container;
  let root;

  beforeEach(() => {
    authState.current = {
      user: null,
      loading: false,
      error: null,
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  function renderMenu(props) {
    act(() => {
      root.render(<UserMenu {...props} />);
    });
  }

  function click(element) {
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  it('exposes a Developer Mode toggle when signed out', () => {
    const onDeveloperModeChange = vi.fn();

    renderMenu({ developerMode: false, onDeveloperModeChange });

    const advancedButton = container.querySelector('[data-testid="signed-out-advanced-menu"]');
    expect(advancedButton).not.toBeNull();
    expect(advancedButton.getAttribute('aria-expanded')).toBe('false');

    click(advancedButton);

    const switchButton = container.querySelector('[data-testid="signed-out-developer-mode-switch"]');
    expect(switchButton).not.toBeNull();
    expect(switchButton.getAttribute('aria-checked')).toBe('false');

    click(switchButton);

    expect(onDeveloperModeChange).toHaveBeenCalledWith(true);
  });

  it('opens the Developer IDE from the signed-out advanced menu when already enabled', () => {
    const onOpenDeveloperPanel = vi.fn();

    renderMenu({
      developerMode: true,
      onDeveloperModeChange: vi.fn(),
      onOpenDeveloperPanel,
    });

    click(container.querySelector('[data-testid="signed-out-advanced-menu"]'));

    const openButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Open Developer IDE'),
    );
    expect(openButton).toBeTruthy();

    click(openButton);

    expect(onOpenDeveloperPanel).toHaveBeenCalledTimes(1);
  });

  it('locks the signed-out Developer IDE action when generation is running', () => {
    const onOpenDeveloperPanel = vi.fn();

    renderMenu({
      developerMode: true,
      onDeveloperModeChange: vi.fn(),
      onOpenDeveloperPanel,
      developerIdeDisabled: true,
      developerIdeDisabledReason: 'Deliverables are still generating.',
    });

    click(container.querySelector('[data-testid="signed-out-advanced-menu"]'));

    const openButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Open Developer IDE'),
    );
    expect(openButton.disabled).toBe(true);
    expect(openButton.getAttribute('title')).toBe('Deliverables are still generating.');

    click(openButton);

    expect(onOpenDeveloperPanel).not.toHaveBeenCalled();
  });
});
