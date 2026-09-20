/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import EmailSignInButton from '../EmailSignInButton';
const mock = vi.hoisted(() => ({
  user: { uid: 'reviewer', email: 'reviewer@example.test' },
  signInWithEmail: vi.fn(),
  reauthenticateWithEmail: vi.fn(),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => mock }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.clearAllMocks();
});
async function open(reauthenticate = false) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<EmailSignInButton reauthenticate={reauthenticate} />));
  await act(async () => container.querySelector('button').click());
  return container.querySelector('form');
}
it('submits email credentials once and clears the password after rejection', async () => {
  const form = await open();
  form.elements.email.value = 'reviewer@example.test';
  form.elements.password.value = 'test-secret';
  mock.signInWithEmail.mockResolvedValue(false);
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(mock.signInWithEmail).toHaveBeenCalledWith('reviewer@example.test', 'test-secret');
  expect(form.elements.password.value).toBe('');
  expect(form.elements.email.value).toBe('reviewer@example.test');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Sign-in failed');
});
it('uses current-account reauthentication and closes on success', async () => {
  const form = await open(true);
  expect(form.elements.email.readOnly).toBe(true);
  expect(form.elements.email.value).toBe('reviewer@example.test');
  form.elements.password.value = 'test-secret';
  mock.reauthenticateWithEmail.mockResolvedValue(true);
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(mock.reauthenticateWithEmail).toHaveBeenCalledWith('test-secret');
  expect(mock.signInWithEmail).not.toHaveBeenCalled();
  expect(container.querySelector('dialog')).toBeNull();
});
it('removes credentials when cancelled', async () => {
  const form = await open();
  form.elements.password.value = 'test-secret';
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click());
  expect(container.querySelector('dialog')).toBeNull();
  await act(async () => container.querySelector('button').click());
  expect(container.querySelector('input[name="password"]').value).toBe('');
});
