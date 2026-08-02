/**
 * cloudStorage.customTools.test.js — mock-based tests that prove our Firestore
 * wrappers hit the right doc paths with the right payload shape. We don't
 * exercise a real Firestore (that would require a live project + credentials),
 * but we do exercise the adapter code — a typo in a collection path or the
 * `updatedAt: serverTimestamp()` wiring would surface here instead of only in
 * user bug reports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the Firebase SDK. Each mocked fn returns an inspectable shape so we can
// assert what cloudStorage passes through.
vi.mock('firebase/firestore', () => {
  class Timestamp {
    constructor(seconds, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }

    toMillis() {
      return this.seconds * 1_000 + this.nanoseconds / 1_000_000;
    }
  }

  return {
    Timestamp,
    doc: vi.fn((db, ...segments) => ({ _kind: 'doc', _db: db, path: segments.join('/') })),
    collection: vi.fn((db, ...segments) => ({ _kind: 'col', _db: db, path: segments.join('/') })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    query: vi.fn((...args) => ({ _kind: 'query', args })),
    orderBy: vi.fn((...args) => ({ _kind: 'orderBy', args })),
    serverTimestamp: vi.fn(() => '__SERVER_TIMESTAMP__'),
    writeBatch: vi.fn(),
  };
});

vi.mock('../firebase', () => ({ db: { _kind: 'fake-db' } }));

// Import AFTER mocks so the module picks them up.
const firestore = await import('firebase/firestore');
const { loadCustomTools, saveCustomTool, deleteCustomTool } = await import('../cloudStorage');

beforeEach(() => {
  for (const fn of Object.values(firestore)) {
    if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
  }
});

describe('saveCustomTool', () => {
  it('writes to users/{uid}/agentData/customTools/entries/{name}', async () => {
    await saveCustomTool('user-42', {
      name: 'audit_bloom',
      description: 'd',
      plan: [{ id: 's1', tool: 'validate_course', args: {} }],
    });
    expect(firestore.doc).toHaveBeenCalledWith(
      { _kind: 'fake-db' },
      'users',
      'user-42',
      'agentData',
      'customTools',
      'entries',
      'audit_bloom',
    );
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload] = firestore.setDoc.mock.calls[0];
    expect(docRef.path).toBe('users/user-42/agentData/customTools/entries/audit_bloom');
    // Payload: tool fields + a serverTimestamp for updatedAt
    expect(payload.name).toBe('audit_bloom');
    expect(payload.description).toBe('d');
    expect(payload.plan).toEqual([{ id: 's1', tool: 'validate_course', args: {} }]);
    expect(payload.updatedAt).toBe('__SERVER_TIMESTAMP__');
  });

  it('returns the tool name so callers can track the doc id', async () => {
    const id = await saveCustomTool('uid1', { name: 'foo', plan: [] });
    expect(id).toBe('foo');
  });

  it('is a no-op when db is falsy', async () => {
    // Re-import with db unset. Easiest: temporarily stub the module.
    vi.doMock('../firebase', () => ({ db: null }));
    vi.resetModules();
    const mod = await import('../cloudStorage');
    await mod.saveCustomTool('uid', { name: 'x' });
    expect(firestore.setDoc).not.toHaveBeenCalled();
    // Restore for the rest of the suite.
    vi.doMock('../firebase', () => ({ db: { _kind: 'fake-db' } }));
    vi.resetModules();
  });
});

describe('loadCustomTools', () => {
  it('reads users/{uid}/agentData/customTools/entries and flattens doc.id into .name', async () => {
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'tool_a', data: () => ({ description: 'A', plan: [{ id: 's1', tool: 'validate_course' }] }) },
        { id: 'tool_b', data: () => ({ description: 'B', plan: [] }) },
      ],
    });
    const { loadCustomTools: load } = await import('../cloudStorage');
    const result = await load('user-42');
    expect(firestore.collection).toHaveBeenCalledWith(
      { _kind: 'fake-db' },
      'users',
      'user-42',
      'agentData',
      'customTools',
      'entries',
    );
    expect(result).toEqual([
      { name: 'tool_a', description: 'A', plan: [{ id: 's1', tool: 'validate_course' }] },
      { name: 'tool_b', description: 'B', plan: [] },
    ]);
  });

  it('returns [] when db is falsy', async () => {
    vi.doMock('../firebase', () => ({ db: null }));
    vi.resetModules();
    const mod = await import('../cloudStorage');
    const out = await mod.loadCustomTools('uid');
    expect(out).toEqual([]);
    vi.doMock('../firebase', () => ({ db: { _kind: 'fake-db' } }));
    vi.resetModules();
  });
});

describe('deleteCustomTool', () => {
  it('deletes users/{uid}/agentData/customTools/entries/{name}', async () => {
    const { deleteCustomTool: del } = await import('../cloudStorage');
    await del('user-42', 'audit_bloom');
    expect(firestore.doc).toHaveBeenCalledWith(
      { _kind: 'fake-db' },
      'users',
      'user-42',
      'agentData',
      'customTools',
      'entries',
      'audit_bloom',
    );
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    const [docRef] = firestore.deleteDoc.mock.calls[0];
    expect(docRef.path).toBe('users/user-42/agentData/customTools/entries/audit_bloom');
  });

  it('is a no-op when db is falsy', async () => {
    vi.doMock('../firebase', () => ({ db: null }));
    vi.resetModules();
    const mod = await import('../cloudStorage');
    await mod.deleteCustomTool('uid', 'foo');
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
    vi.doMock('../firebase', () => ({ db: { _kind: 'fake-db' } }));
    vi.resetModules();
  });
});

describe('path alignment with agentMemory pattern', () => {
  it('uses the same users/{uid}/agentData collection prefix as memories', async () => {
    // Both memory and customTools docs should sit under the same agentData
    // subtree so Firestore rules and export tooling treat them uniformly.
    const { saveCustomTool: save } = await import('../cloudStorage');
    await save('u1', { name: 'n' });
    const path = firestore.doc.mock.calls[0].slice(1).join('/');
    expect(path.startsWith('users/u1/agentData/')).toBe(true);
  });
});
