import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveIndexedDb } = vi.hoisted(() => ({ saveIndexedDb: vi.fn() }));

vi.mock('../projectIndexedDbAutosave', () => ({
  saveProjectIndexedDbAutosave: saveIndexedDb,
}));

import { persistOversizedProjectSnapshot } from '../projectExactAutosave';

function storageStub({ rejectCompact = false } = {}) {
  const values = new Map();
  let compactRejected = false;
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem(key, value) {
      if (rejectCompact && !compactRejected && String(value).includes('"deliverableSaveMode":"recompile-on-open"')) {
        compactRejected = true;
        throw new Error('localStorage quota exceeded');
      }
      values.set(key, value);
    },
  };
}

const fullSnapshot = {
  formatVersion: 2,
  courseMap: {
    courseName: 'World Literature Survey',
    lessons: [{ title: 'Lesson 1' }],
  },
  packageQualityPass: {
    status: 'ready',
    blockers: 0,
    warnings: 0,
    quality: { overall: 99, grade: 'A' },
  },
  deliverables: {
    lessonPlans: { status: 'done', data: { lessons: [{ title: 'Lesson 1' }] } },
  },
};

const compactSnapshot = {
  courseMap: fullSnapshot.courseMap,
  deliverableSaveMode: 'recompile-on-open',
  deliverables: {},
};

const compactPayload = JSON.stringify(compactSnapshot);

describe('persistOversizedProjectSnapshot', () => {
  beforeEach(() => {
    saveIndexedDb.mockReset();
  });

  it('stores the exact graded package in IndexedDB and leaves a tiny resume marker', async () => {
    const storage = storageStub();
    saveIndexedDb.mockResolvedValue();

    const mode = await persistOversizedProjectSnapshot({
      fullSnapshot,
      compactSnapshot,
      compactPayload,
      storage,
    });

    expect(mode).toBe('indexeddb');
    expect(saveIndexedDb).toHaveBeenCalledWith(JSON.stringify(fullSnapshot));
    const marker = JSON.parse(storage.getItem('coursemapper-project'));
    expect(marker.indexedDbAutosave).toBe(true);
    expect(marker.lessonCount).toBe(1);
    expect(storage.getItem('coursemapper-project')).not.toContain('lessonPlans');
  });

  it('uses the compact recompile payload only when IndexedDB is unavailable', async () => {
    const storage = storageStub();
    saveIndexedDb.mockRejectedValue(new Error('IndexedDB unavailable'));

    const mode = await persistOversizedProjectSnapshot({
      fullSnapshot,
      compactSnapshot,
      compactPayload,
      storage,
    });

    expect(mode).toBe('compact');
    expect(JSON.parse(storage.getItem('coursemapper-project')).deliverableSaveMode).toBe('recompile-on-open');
  });

  it('preserves the course map when both exact and compact saves are unavailable', async () => {
    const storage = storageStub({ rejectCompact: true });
    saveIndexedDb.mockRejectedValue(new Error('IndexedDB unavailable'));

    const mode = await persistOversizedProjectSnapshot({
      fullSnapshot,
      compactSnapshot,
      compactPayload,
      storage,
    });

    expect(mode).toBe('course-map-recovery');
    const recovered = JSON.parse(storage.getItem('coursemapper-project'));
    expect(recovered.courseMap.courseName).toBe('World Literature Survey');
    expect(recovered.localSaveMode).toBe('course-map-recovery-autosave');
  });
});
