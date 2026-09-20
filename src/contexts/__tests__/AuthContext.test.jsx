/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';
import { accountStorageKey, setAccountStorageUser } from '../../lib/accountStorage';

const authMock = vi.hoisted(() => ({
  signIn: vi.fn(),
  emailSignIn: vi.fn(),
  reauthenticate: vi.fn(),
  credential: vi.fn(),
  auth: {},
  subscribe: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({ auth: authMock.auth, googleProvider: {}, hasConfig: true }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: authMock.subscribe,
  signInWithPopup: authMock.signIn,
  signInWithEmailAndPassword: authMock.emailSignIn,
  reauthenticateWithCredential: authMock.reauthenticate,
  EmailAuthProvider: { credential: authMock.credential },
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

async function mountWithUser(user) {
  authMock.auth.currentUser = user;
  authMock.subscribe.mockImplementation((_auth, callback) => {
    callback(user);
    return () => {};
  });
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    ),
  );
  await vi.waitFor(() => expect(context.loading).toBe(false));
}
it('signs into the Firebase account with email and scopes local storage to that UID', async () => {
  await mountWithUser(null);
  const user = { uid: 'reviewer' };
  authMock.emailSignIn.mockResolvedValue({ user });
  let success;
  await act(async () => {
    success = await context.signInWithEmail(' reviewer@example.test ', 'test-secret');
  });
  expect(success).toBe(true);
  expect(authMock.emailSignIn).toHaveBeenCalledWith(authMock.auth, 'reviewer@example.test', 'test-secret');
  expect(context.user).toBe(user);
  expect(accountStorageKey('profile')).toBe('profile:account:reviewer');
});
it('does not replace the account or expose provider details after a rejected password', async () => {
  const user = { uid: 'existing' };
  await mountWithUser(user);
  authMock.emailSignIn.mockRejectedValue(new Error('provider detail test-secret'));
  let success;
  await act(async () => {
    success = await context.signInWithEmail('reviewer@example.test', 'test-secret');
  });
  expect(success).toBe(false);
  expect(context.user).toBe(user);
  expect(context.error.message).not.toContain('test-secret');
});
it('reauthenticates the current account without signing into another account', async () => {
  const user = { uid: 'reviewer', email: 'reviewer@example.test' };
  await mountWithUser(user);
  const fresh = { ...user, fresh: true };
  authMock.credential.mockReturnValue({ providerId: 'password' });
  authMock.reauthenticate.mockResolvedValue({ user: fresh });
  await act(async () => expect(await context.reauthenticateWithEmail('test-secret')).toBe(true));
  expect(authMock.credential).toHaveBeenCalledWith(user.email, 'test-secret');
  expect(authMock.reauthenticate).toHaveBeenCalledWith(user, { providerId: 'password' });
  expect(authMock.emailSignIn).not.toHaveBeenCalled();
  expect(context.user).toBe(fresh);
});
it('refuses reauthentication if the active Firebase account changed', async () => {
  const user = { uid: 'reviewer', email: 'reviewer@example.test' };
  await mountWithUser(user);
  authMock.auth.currentUser = { uid: 'other', email: 'other@example.test' };
  await act(async () => expect(await context.reauthenticateWithEmail('test-secret')).toBe(false));
  expect(authMock.reauthenticate).not.toHaveBeenCalled();
  expect(context.user).toBe(user);
});
