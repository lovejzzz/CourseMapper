import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => {
  class Timestamp {
    constructor(seconds, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }

    toMillis() {
      return this.seconds * 1_000 + this.nanoseconds / 1_000_000;
    }

    toDate() {
      return new Date(this.toMillis());
    }
  }

  class GeoPoint {
    constructor(latitude, longitude) {
      this._lat = latitude;
      this._long = longitude;
    }

    get latitude() {
      return this._lat;
    }

    get longitude() {
      return this._long;
    }
  }

  class Bytes {
    constructor(base64) {
      this._byteString = base64;
    }

    toBase64() {
      return this._byteString;
    }
  }

  return {
    Bytes,
    GeoPoint,
    Timestamp,
    setDoc: vi.fn(async () => {}),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(async () => {}),
    batchSet: vi.fn(),
    batchDelete: vi.fn(),
    batchCommit: vi.fn(async () => {}),
  };
});

vi.mock('firebase/firestore', () => ({
  Bytes: firestoreMocks.Bytes,
  GeoPoint: firestoreMocks.GeoPoint,
  Timestamp: firestoreMocks.Timestamp,
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
const {
  listProjects,
  loadAgentMemories,
  loadCustomTools,
  loadProject,
  loadProjectDeliverables,
  saveAgentMemory,
  saveCustomTool,
  saveProject,
  saveProjectDeliverables,
} = await import('../cloudStorage');

const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
const ANTHROPIC_KEY = 'sk-ant-abcdefghijklmnopqrstuvwxyz1234567890';
const BEARER_TOKEN = 'Bearer abcdefghijklmnopqrstuvwxyz1234567890ABCDE';

function allWritesText() {
  return JSON.stringify({
    setDoc: firestore.setDoc.mock.calls,
    batchSet: firestoreMocks.batchSet.mock.calls,
  });
}

function makeTimestamp(iso) {
  const milliseconds = new Date(iso).getTime();
  const seconds = Math.floor(milliseconds / 1_000);
  return new firestore.Timestamp(seconds, (milliseconds - seconds * 1_000) * 1_000_000);
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

  it('chunks oversized deliverables so full-course cloud saves stay below Firestore document limits', async () => {
    await saveProjectDeliverables('user-1', 'project-1', {
      slideDecks: {
        status: 'done',
        data: {
          slides: [{ title: 'Large deck', speakerNotes: 'x'.repeat(760_000) }],
        },
      },
    });

    const [, manifestPayload] = firestoreMocks.batchSet.mock.calls[0];
    expect(manifestPayload.__chunked).toBe(true);
    expect(manifestPayload.encoding).toBe('json');
    expect(manifestPayload.chunkCount).toBeGreaterThan(1);

    const chunkPayloads = firestoreMocks.batchSet.mock.calls.slice(1).map(([, payload]) => payload);
    expect(chunkPayloads).toHaveLength(manifestPayload.chunkCount);
    expect(chunkPayloads.every((payload) => payload.__deliverableChunk === true)).toBe(true);
    expect(chunkPayloads.map((payload) => payload.text).join('')).toContain('Large deck');
  });

  it('saves compact blueprint projects without writing generated deliverable bodies', async () => {
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'slideDecks', ref: { path: 'users/user-1/projects/project-1/deliverables/slideDecks' } },
        {
          id: '__cm_chunk__slideDecks__0',
          ref: { path: 'users/user-1/projects/project-1/deliverables/__cm_chunk__slideDecks__0' },
        },
      ],
    });

    await saveProject('user-1', 'project-1', {
      courseName: 'Compact Course',
      cloudProjectFormat: 'coursemapper-blueprint-v1',
      deliverableSaveMode: 'recompile-on-open',
      deliverableFeatureIds: ['lessonPlans', 'slideDecks'],
      deliverableManifest: {
        slideDecks: { status: 'done' },
      },
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            slides: [{ speakerNotes: 'x'.repeat(760_000) }],
          },
        },
      },
    });

    const [, projectPayload] = firestore.setDoc.mock.calls[0];
    expect(projectPayload).toMatchObject({
      courseName: 'Compact Course',
      cloudProjectFormat: 'coursemapper-blueprint-v1',
      deliverableSaveMode: 'recompile-on-open',
      deliverableFeatureIds: ['lessonPlans', 'slideDecks'],
    });
    expect(projectPayload).not.toHaveProperty('deliverables');
    expect(firestoreMocks.batchSet).not.toHaveBeenCalled();
    expect(firestoreMocks.batchDelete).toHaveBeenCalledTimes(2);
  });

  it('restores chunked deliverables without exposing internal chunk documents', async () => {
    const deliverable = {
      status: 'done',
      data: {
        slides: [{ title: 'Restored deck', speakerNotes: `Never reload ${OPENAI_KEY}` }],
      },
    };
    const serialized = JSON.stringify(deliverable);
    const chunks = [serialized.slice(0, 60), serialized.slice(60)];
    firestore.getDocs.mockResolvedValueOnce({
      forEach: (cb) => {
        cb({
          id: 'slideDecks',
          data: () => ({
            __chunked: true,
            encoding: 'json',
            chunkCount: chunks.length,
            status: 'done',
          }),
        });
        chunks.forEach((text, index) => {
          cb({
            id: `__cm_chunk__slideDecks__${index}`,
            data: () => ({
              __deliverableChunk: true,
              featureId: 'slideDecks',
              index,
              text,
            }),
          });
        });
      },
    });

    const restored = await loadProjectDeliverables('user-1', 'project-1');

    expect(restored).not.toHaveProperty('__cm_chunk__slideDecks__0');
    expect(restored.slideDecks.status).toBe('done');
    expect(restored.slideDecks.data.slides[0].title).toBe('Restored deck');
    expect(restored.slideDecks.data.slides[0].speakerNotes).toBe('Never reload [redacted secret]');
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

  it('sanitizes legacy cloud project and deliverable reads', async () => {
    const updatedAt = makeTimestamp('2026-06-01T10:00:00Z');
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        courseName: `Legacy ${OPENAI_KEY}`,
        updatedAt,
        apiKey: OPENAI_KEY,
        nested: {
          accessToken: ANTHROPIC_KEY,
          visible: 'keep',
        },
      }),
    });
    firestore.getDocs.mockResolvedValueOnce({
      forEach: (cb) =>
        cb({
          id: 'lessonPlans',
          data: () => ({
            status: 'done',
            authorization: BEARER_TOKEN,
            data: {
              summary: `Never reload ${OPENAI_KEY}`,
            },
          }),
        }),
    });

    const project = await loadProject('user-1', 'project-1');
    const deliverables = await loadProjectDeliverables('user-1', 'project-1');

    expect(project.courseName).toBe('Legacy [redacted secret]');
    expect(project.updatedAt).toEqual(new Date('2026-06-01T10:00:00Z'));
    expect(project.updatedAt).not.toBe(updatedAt);
    expect(project).not.toHaveProperty('apiKey');
    expect(project.nested).toEqual({ visible: 'keep' });
    expect(deliverables.lessonPlans).not.toHaveProperty('authorization');
    expect(deliverables.lessonPlans.data.summary).toBe('Never reload [redacted secret]');
    expect(JSON.stringify({ project, deliverables })).not.toContain('sk-proj-');
    expect(JSON.stringify({ project, deliverables })).not.toContain('sk-ant-');
    expect(JSON.stringify({ project, deliverables })).not.toContain(BEARER_TOKEN);
  });

  it('sanitizes legacy agent reads while keeping document ids', async () => {
    firestore.getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'memory-1',
            data: () => ({
              text: `Old memory ${OPENAI_KEY}`,
              bearerToken: BEARER_TOKEN,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'audit_course',
            data: () => ({
              name: 'audit_course',
              description: `Old tool ${ANTHROPIC_KEY}`,
              params: {
                apiKey: OPENAI_KEY,
                safe: true,
              },
            }),
          },
        ],
      });

    const memories = await loadAgentMemories('user-1');
    const tools = await loadCustomTools('user-1');

    expect(memories).toEqual([{ id: 'memory-1', text: 'Old memory [redacted secret]' }]);
    expect(tools).toEqual([
      {
        name: 'audit_course',
        description: 'Old tool [redacted secret]',
        params: { safe: true },
      },
    ]);
    expect(JSON.stringify({ memories, tools })).not.toContain('sk-proj-');
    expect(JSON.stringify({ memories, tools })).not.toContain('sk-ant-');
    expect(JSON.stringify({ memories, tools })).not.toContain(BEARER_TOKEN);
  });

  it('preserves timestamp objects when sanitizing project list rows', async () => {
    const updatedAt = makeTimestamp('2026-06-01T10:00:00Z');
    const createdAt = makeTimestamp('2026-05-31T10:00:00Z');
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'project-1',
          data: () => ({
            courseName: `Legacy ${OPENAI_KEY}`,
            semester: `Fall ${ANTHROPIC_KEY}`,
            apiKey: OPENAI_KEY,
            updatedAt,
            createdAt,
          }),
        },
      ],
    });

    const projects = await listProjects('user-1');

    expect(projects).toEqual([
      {
        id: 'project-1',
        courseName: 'Legacy [redacted secret]',
        semester: 'Fall [redacted secret]',
        updatedAt: new Date('2026-06-01T10:00:00Z'),
        createdAt: new Date('2026-05-31T10:00:00Z'),
      },
    ]);
    expect(projects[0].updatedAt).not.toBe(updatedAt);
    expect(projects[0].createdAt).not.toBe(createdAt);
  });

  it.each([
    ['negative sub-millisecond', -1, 999_999_999],
    ['maximum boundary', 253_402_300_799, 999_999_999],
  ])('keeps cloud project load and list conversion consistent at the %s', async (_label, seconds, nanoseconds) => {
    const updatedAt = new firestore.Timestamp(seconds, nanoseconds);
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ courseName: 'Boundary course', updatedAt }),
    });
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'project-1',
          data: () => ({ courseName: 'Boundary course', updatedAt }),
        },
      ],
    });

    const loaded = await loadProject('user-1', 'project-1');
    const listed = await listProjects('user-1');
    const expectedMilliseconds = new Date(updatedAt.toMillis()).getTime();

    expect(loaded.updatedAt).toBeInstanceOf(Date);
    expect(loaded.updatedAt.getTime()).toBe(expectedMilliseconds);
    expect(listed[0].updatedAt.getTime()).toBe(expectedMilliseconds);
  });

  it('never invokes custom timestamp semantics after a rejected cloud snapshot', async () => {
    let reads = 0;
    const customTimestamp = Object.create({});
    Object.defineProperty(customTimestamp, 'toDate', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('custom timestamp getter executed');
      },
    });
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'project-1',
          data: () => ({ courseName: 'Rejected course', updatedAt: customTimestamp }),
        },
      ],
    });

    const projects = await listProjects('user-1');

    expect(reads).toBe(0);
    expect(projects).toEqual([
      {
        id: 'project-1',
        courseName: 'Untitled',
        semester: '',
        updatedAt: new Date(0),
        createdAt: new Date(0),
      },
    ]);
  });
});
