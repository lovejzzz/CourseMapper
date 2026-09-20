/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { accountStorageKey, setAccountStorageUser } from '../../lib/accountStorage';

const authMock = vi.hoisted(() => ({ signIn: vi.fn(), subscribe: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ auth: {}, googleProvider: {}, hasConfig: true }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: authMock.subscribe,
  signInWithPopup: authMock.signIn,
  signOut: vi.fn(),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, context;
function Consumer() {
  context = useAuth();
  return <span>{context.user?.uid}</span>;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  setAccountStorageUser(null);
  vi.clearAllMocks();
});

it('adopts a fresh same-account user after sign-in even without an auth-state notification', async () => {
  const oldUser = { uid: 'test-account', getIdToken: vi.fn(async () => 'old-session') };
  const freshUser = { uid: 'test-account', getIdToken: vi.fn(async () => 'fresh-session') };
  authMock.subscribe.mockImplementation((_auth, callback) => {
    callback(oldUser);
    return () => {};
  });
  authMock.signIn.mockResolvedValue({ user: freshUser });
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    ),
  );
  await vi.waitFor(() => expect(context.user).toBe(oldUser));
  await act(async () => context.signInWithGoogle());
  expect(context.user).toBe(freshUser);
  expect(await context.user.getIdToken(true)).toBe('fresh-session');
  expect(accountStorageKey('profile')).toBe('profile:account:test-account');
});
