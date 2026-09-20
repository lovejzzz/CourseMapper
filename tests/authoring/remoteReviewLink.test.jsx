/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ user: null, api: vi.fn() }));
vi.mock('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('../../src/lib/authoring/remoteRecovery.js', () => ({
  callAccountApi: (...args) => mock.api(...args),
  readRemoteApplication: vi.fn(),
  recoverRemoteApplication: vi.fn(),
}));
vi.mock('../../src/components/authoring/RequirementsEditor', () => ({ default: () => null }));
vi.mock('../../src/components/authoring/SourceEditor', () => ({ default: () => null }));
vi.mock('../../src/components/authoring/GrantEditor', () => ({ default: () => null }));
let root, container, Remote;
const record = {
  id: 'request-1',
  request: { title: 'Poetry review' },
  expiresAt: Date.now() + 1000000,
  drafts: { 'draft-1': { id: 'draft-1', plan: { title: 'Poetry draft' }, state: 'awaiting_review' } },
};
const render = async () => act(async () => root.render(<Remote workspace={{ current: null }} onApply={vi.fn()} />));
beforeEach(async () => {
  vi.stubEnv('VITE_AUTHORING_EXCHANGE_URL', 'https://exchange.example.test');
  vi.resetModules();
  Remote = (await import('../../src/components/authoring/RemoteAuthoringSection.jsx')).default;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, '', '/?authoring=1&remote=1&request=request-1&draft=draft-1');
  mock.user = null;
  mock.api.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/');
});
it('waits for sign-in then selects the linked request and draft without applying', async () => {
  await render();
  expect(mock.api).not.toHaveBeenCalled();
  mock.api.mockResolvedValue(record);
  mock.user = { uid: 'reviewer' };
  await render();
  expect(mock.api).toHaveBeenCalledTimes(1);
  expect(mock.api.mock.calls[0][0]).toMatchObject({ path: 'read', body: { requestId: 'request-1' } });
  expect(container.querySelector('[aria-label="Remote requests"]').value).toBe('request-1');
  expect(container.querySelector('[aria-label="Remote drafts"]').value).toBe('draft-1');
  expect(container.textContent).toContain('Review against current course');
  expect(container.textContent).not.toContain('Apply reviewed remote draft');
});
it('does not show a late result after switching accounts', async () => {
  let complete;
  mock.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  mock.user = { uid: 'first' };
  await render();
  mock.api.mockRejectedValue(new Error('Request unavailable for this account.'));
  mock.user = { uid: 'second' };
  await render();
  await act(async () => complete(record));
  expect(container.textContent).not.toContain('Poetry review');
  expect(container.textContent).toContain('Request unavailable for this account.');
});
it('reports a missing draft without choosing another one or applying', async () => {
  mock.api.mockResolvedValue({ ...record, drafts: {} });
  mock.user = { uid: 'reviewer' };
  await render();
  expect(container.textContent).toContain('This draft is unavailable');
  expect(container.querySelector('[aria-label="Remote drafts"]').value).toBe('');
  expect(container.textContent).not.toContain('Apply reviewed remote draft');
});
