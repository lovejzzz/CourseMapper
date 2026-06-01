import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(async () => {}),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, ...segments) => ({ _kind: 'doc', _db: db, path: segments.join('/') })),
  collection: vi.fn((db, ...segments) => ({ _kind: 'col', _db: db, path: segments.join('/') })),
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  setDoc: firestoreMocks.setDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  query: vi.fn((...args) => ({ _kind: 'query', args })),
  orderBy: vi.fn((...args) => ({ _kind: 'orderBy', args })),
  serverTimestamp: vi.fn(() => '__SERVER_TIMESTAMP__'),
  writeBatch: vi.fn(() => ({
    set: firestoreMocks.batchSet,
    delete: firestoreMocks.batchDelete,
    commit: firestoreMocks.batchCommit,
  })),
}));

vi.mock('../firebase', () => ({ db: { _kind: 'fake-db' } }));

const firestore = await import('firebase/firestore');
const { saveAgentMemory, saveCustomTool, saveProject, saveProjectDeliverables } = await import('../cloudStorage');

const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
const ANTHROPIC_KEY = 'sk-ant-abcdefghijklmnopqrstuvwxyz1234567890';
const BEARER_TOKEN = 'Bearer abcdefghijklmnopqrstuvwxyz1234567890ABCDE';

function allWritesText() {
  return JSON.stringify({
    setDoc: firestore.setDoc.mock.calls,
    batchSet: firestoreMocks.batchSet.mock.calls,
  });
}

beforeEach(() => {
  for (const fn of Object.values(firestore)) {
    if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
  }
  for (const fn of Object.values(firestoreMocks)) {
    if (typeof fn === 'function' && fn.mockClear) fn.mockClear();
  }
});

describe('cloudStorage secret sanitation', () => {
  it('sanitizes project metadata and deliverable subcollection writes', async () => {
    await saveProject('user-1', 'project-1', {
      courseName: 'Secure Course',
      apiKey: OPENAI_KEY,
      promptNotes: `Connected with ${OPENAI_KEY}`,
      nested: {
        authorization: BEARER_TOKEN,
        visible: 'keep this field',
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          accessToken: ANTHROPIC_KEY,
          data: {
            notes: `Provider token: ${BEARER_TOKEN}`,
            visible: 'lesson text',
          },
        },
      },
    });

    const [, projectPayload] = firestore.setDoc.mock.calls[0];
    expect(projectPayload.courseName).toBe('Secure Course');
    expect(projectPayload).not.toHaveProperty('apiKey');
    expect(projectPayload.promptNotes).toBe('Connected with [redacted secret]');
    expect(projectPayload.nested).toEqual({ visible: 'keep this field' });

    const [, deliverablePayload] = firestoreMocks.batchSet.mock.calls[0];
    expect(deliverablePayload.status).toBe('done');
    expect(deliverablePayload).not.toHaveProperty('accessToken');
    expect(deliverablePayload.data.notes).toBe('Provider token: [redacted secret]');
    expect(deliverablePayload.data.visible).toBe('lesson text');
    expect(deliverablePayload.updatedAt).toBe('__SERVER_TIMESTAMP__');
    expect(allWritesText()).not.toContain('sk-proj-');
    expect(allWritesText()).not.toContain('sk-ant-');
    expect(allWritesText()).not.toContain(BEARER_TOKEN);
  });

  it('sanitizes direct deliverable saves when callers bypass saveProject', async () => {
    await saveProjectDeliverables('user-1', 'project-1', {
      slideDecks: {
        status: 'done',
        openaiKey: OPENAI_KEY,
        data: {
          speakerNotes: `Do not save ${OPENAI_KEY}`,
        },
      },
    });

    const [, payload] = firestoreMocks.batchSet.mock.calls[0];
    expect(payload).not.toHaveProperty('openaiKey');
    expect(payload.data.speakerNotes).toBe('Do not save [redacted secret]');
    expect(allWritesText()).not.toContain('sk-proj-');
  });

  it('sanitizes agent memory and custom tool cloud writes', async () => {
    await saveAgentMemory('user-1', {
      id: 'memory-1',
      text: `The user pasted ${OPENAI_KEY}`,
      refreshToken: ANTHROPIC_KEY,
    });
    await saveCustomTool('user-1', {
      name: 'audit_course',
      description: `Uses ${BEARER_TOKEN}`,
      args: {
        apiKey: OPENAI_KEY,
        safeArg: 'rubrics',
      },
    });

    const [, memoryPayload] = firestore.setDoc.mock.calls[0];
    expect(memoryPayload.id).toBe('memory-1');
    expect(memoryPayload.text).toBe('The user pasted [redacted secret]');
    expect(memoryPayload).not.toHaveProperty('refreshToken');

    const [, toolPayload] = firestore.setDoc.mock.calls[1];
    expect(toolPayload.description).toBe('Uses [redacted secret]');
    expect(toolPayload.args).toEqual({ safeArg: 'rubrics' });
    expect(allWritesText()).not.toContain('sk-proj-');
    expect(allWritesText()).not.toContain('sk-ant-');
    expect(allWritesText()).not.toContain(BEARER_TOKEN);
  });
});
