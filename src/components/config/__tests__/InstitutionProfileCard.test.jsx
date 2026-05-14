/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstitutionProfileCard from '../InstitutionProfileCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('InstitutionProfileCard', () => {
  let container;
  let root;
  let originalLocalStorage;
  let storage;

  beforeEach(() => {
    vi.useFakeTimers();
    originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key) => storage.get(key) || null),
        setItem: vi.fn((key, value) => storage.set(key, String(value))),
        removeItem: vi.fn((key) => storage.delete(key)),
        clear: vi.fn(() => storage.clear()),
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else delete globalThis.localStorage;
    vi.useRealTimers();
  });

  it('autosaves reusable institution defaults into the professor profile', () => {
    act(() => {
      root.render(<InstitutionProfileCard />);
    });

    const toggle = container.querySelector('button[aria-controls="institution-profile-settings"]');
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    const institution = container.querySelector('input[placeholder="NYU Silver School of Social Work"]');
    const aiPolicy = container.querySelector('textarea[placeholder^="How students may"]');

    act(() => {
      Simulate.change(institution, { target: { value: 'NYU Silver' } });
      Simulate.change(aiPolicy, {
        target: { value: 'Students may use AI for brainstorming but must cite substantial assistance.' },
      });
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    const stored = JSON.parse(globalThis.localStorage.getItem('coursemapper-professorProfile'));
    expect(stored.institution).toBe('NYU Silver');
    expect(stored.aiPolicy).toContain('cite substantial assistance');
    expect(container.textContent).toContain('Saved');
  });
});
