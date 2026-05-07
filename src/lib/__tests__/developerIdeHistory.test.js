import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendDeveloperHistoryEntry,
  buildDeveloperHistoryEntry,
  canRestoreDeveloperHistorySnapshot,
  clearDeveloperHistory,
  loadDeveloperHistory,
  restoreDeveloperHistorySnapshot,
  searchDeveloperHistory,
} from '../developerIdeHistory';

class FakeStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
}

function snapshot(label) {
  return {
    courseMap: {
      lessons: [{ title: label, sections: [{ topic: label }] }],
    },
    selectedFeatures: ['courseMap'],
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new FakeStorage(),
    configurable: true,
  });
});

describe('developerIdeHistory', () => {
  it('builds compact restorable entries with path-level change summaries', () => {
    const entry = buildDeveloperHistoryEntry({
      beforeSnapshot: snapshot('Before'),
      afterSnapshot: snapshot('After'),
      dirtySections: new Set(['courseMap']),
      label: 'Before release cleanup',
      createdAt: 100,
    });

    expect(entry.label).toBe('Before release cleanup');
    expect(entry.dirtySections).toEqual(['courseMap']);
    expect(entry.beforeSnapshot).toBeUndefined();
    expect(entry.afterSnapshot).toBeUndefined();
    expect(entry.restorable).toBe(true);
    expect(entry.patches.length).toBeGreaterThan(0);
    expect(entry.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'courseMap.lessons[0].title' })]),
    );
  });

  it('restores compact history entries relative to the current snapshot', () => {
    const before = snapshot('Before');
    const after = snapshot('After');
    const entry = buildDeveloperHistoryEntry({
      beforeSnapshot: before,
      afterSnapshot: after,
      createdAt: 100,
    });

    expect(canRestoreDeveloperHistorySnapshot(entry, 'beforeSnapshot', after)).toBe(true);
    expect(restoreDeveloperHistorySnapshot(entry, 'beforeSnapshot', after).courseMap.lessons[0].title).toBe('Before');
    expect(restoreDeveloperHistorySnapshot(entry, 'afterSnapshot', before).courseMap.lessons[0].title).toBe('After');
  });

  it('does not persist full snapshots to localStorage', () => {
    appendDeveloperHistoryEntry(
      buildDeveloperHistoryEntry({
        beforeSnapshot: snapshot('Before'),
        afterSnapshot: snapshot('After'),
        createdAt: 1,
      }),
    );

    const raw = localStorage.getItem('coursemapper-developer-ide-history');
    expect(raw).not.toContain('beforeSnapshot');
    expect(raw).not.toContain('afterSnapshot');
    expect(raw).toContain('patches');
  });

  it('marks secret-bearing history as summary-only', () => {
    const entry = buildDeveloperHistoryEntry({
      beforeSnapshot: { ...snapshot('Before'), apiKey: 'sk-secret' },
      afterSnapshot: snapshot('After'),
      createdAt: 1,
    });

    expect(entry.restorable).toBe(false);
    expect(entry.secretBlocked).toBe(true);
    expect(entry.patches).toEqual([]);
  });

  it('keeps newest history entries up to the configured limit', () => {
    [1, 2, 3].forEach((createdAt) => {
      appendDeveloperHistoryEntry(
        buildDeveloperHistoryEntry({
          beforeSnapshot: snapshot(`Before ${createdAt}`),
          afterSnapshot: snapshot(`After ${createdAt}`),
          createdAt,
        }),
        2,
      );
    });

    const history = loadDeveloperHistory(5);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.createdAt)).toEqual([3, 2]);
  });

  it('can clear persisted history', () => {
    appendDeveloperHistoryEntry(
      buildDeveloperHistoryEntry({
        beforeSnapshot: snapshot('Before'),
        afterSnapshot: snapshot('After'),
        createdAt: 1,
      }),
    );

    expect(loadDeveloperHistory()).toHaveLength(1);
    expect(clearDeveloperHistory()).toEqual([]);
    expect(loadDeveloperHistory()).toEqual([]);
  });

  it('searches history by section, path, and safety metadata', () => {
    const entries = [
      {
        id: 'one',
        createdAt: 1,
        dirtySections: ['courseMap'],
        changes: [
          { type: 'changed', path: 'courseMap.lessons[0].title', beforeSummary: 'Before', afterSummary: 'After' },
        ],
        patches: [],
        restorable: true,
      },
      {
        id: 'two',
        createdAt: 2,
        dirtySections: ['config'],
        changes: [
          {
            type: 'added',
            path: 'deliverableConfig.quizBank.customUserPrompt',
            afterSummary: 'Prompt override',
          },
        ],
        patches: [],
        secretBlocked: true,
        restorable: false,
      },
    ];

    expect(
      searchDeveloperHistory([{ ...entries[0], label: 'Course map checkpoint' }, entries[1]], 'checkpoint'),
    ).toEqual([expect.objectContaining({ id: 'one' })]);
    expect(searchDeveloperHistory(entries, 'courseMap title')).toEqual([entries[0]]);
    expect(searchDeveloperHistory(entries, 'quizBank prompt')).toEqual([entries[1]]);
    expect(searchDeveloperHistory(entries, 'secret summary')).toEqual([entries[1]]);
    expect(searchDeveloperHistory(entries, 'missing')).toEqual([]);
  });
});
