import { describe, expect, it } from 'vitest';
import {
  appendEditTransaction,
  applyEditTransaction,
  createEditTransaction,
  emptyEditHistory,
  restoreEditHistory,
  serializeEditHistory,
} from '../deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore, sanitizeProjectSnapshot } from '../projectSnapshotSanitizer.js';
import { buildHistoryPrunedAutosaveSnapshot } from '../projectAutosave.js';

const state = (data) => ({
  deliverables: { assignments: { status: 'done', data } },
  courseMap: { lessons: [] },
  courseGraph: null,
});
const applied = (current, entry, direction) => {
  const result = applyEditTransaction(current, entry, direction);
  expect(result.status, result.message).toBe('applied');
  return result.workspace;
};

describe('persisted reversible edit transactions', () => {
  it('retains only changed fields while preserving unrelated later teacher notes', () => {
    const before = state({ text: 'Before', longReading: 'Reading '.repeat(20000), teacherNote: 'Original' });
    const after = structuredClone(before);
    after.deliverables.assignments.data.text = 'After';
    const entry = createEditTransaction(before, after);
    expect(JSON.stringify(entry).length).toBeLessThan(1000);
    after.deliverables.assignments.data.teacherNote = 'Later note';
    const undone = applied(after, entry, 'undo');
    expect(undone.deliverables.assignments.data).toEqual({
      ...before.deliverables.assignments.data,
      teacherNote: 'Later note',
    });
    expect(after.deliverables.assignments.data.text).toBe('After');
    expect(applied(undone, entry, 'redo')).toEqual(after);
  });
  it('restores deletion, insertion, false, zero, empty string and whole resized arrays exactly', () => {
    const before = state({ removed: 'Keep in undo', enabled: true, number: 1, text: 'A', rows: [1, 2] });
    const after = state({ added: 'new', enabled: false, number: 0, text: '', rows: [2] });
    const entry = createEditTransaction(before, after);
    expect(applied(after, entry, 'undo')).toEqual(before);
    expect(applied(before, entry, 'redo')).toEqual(after);
  });
  it('rejects same-length list reordering and applies none of a linked transaction', () => {
    const before = state({
      rows: [
        { id: 'a', answer: 1 },
        { id: 'b', answer: 2 },
      ],
    });
    const after = structuredClone(before);
    after.deliverables.assignments.data.rows[0].answer = 3;
    after.courseMap.title = 'Changed';
    const entry = createEditTransaction(before, after);
    after.deliverables.assignments.data.rows.reverse();
    const preserved = structuredClone(after);
    expect(applyEditTransaction(after, entry, 'undo').status).toBe('needs-review');
    expect(after).toEqual(preserved);
  });
  it('retains teacher conflicts and stale evidence across JSON and pruned exact autosave', () => {
    const before = state({ text: 'A' });
    before.deliverables.assignments.staleEdits = { field: 'source' };
    before.deliverables.assignments.staleConfidence = null;
    const after = structuredClone(before);
    after.deliverables.assignments.data = {
      text: 'B',
      taskSyncConflicts: [{ before: 'A', current: 'Teacher', incoming: 'B' }],
    };
    after.deliverables.assignments.stale = true;
    after.deliverables.assignments.staleConfidence = { level: 'high', maxWeight: 1, dominantField: null };
    delete after.deliverables.assignments.staleEdits;
    const entry = createEditTransaction(before, after);
    const history = appendEditTransaction(emptyEditHistory(), entry).history;
    const snapshot = prepareProjectSnapshotForRestore(
      JSON.parse(
        JSON.stringify(buildHistoryPrunedAutosaveSnapshot({ ...after, editHistory: serializeEditHistory(history) })),
      ),
    );
    const restored = restoreEditHistory(snapshot.editHistory, snapshot);
    expect(restored.status).toBe('ready');
    const undone = applied(snapshot, restored.history.entries[0], 'undo');
    expect(undone.deliverables).toEqual(before.deliverables);
    expect(applied(undone, entry, 'redo').deliverables).toEqual(after.deliverables);
  });
  it('restores both sides of a saved cursor and rejects a corrupt earlier or later step', () => {
    const a = state({ value: 0 }),
      b = state({ value: 1 }),
      c = state({ value: 2 });
    const first = createEditTransaction(a, b),
      second = createEditTransaction(b, c);
    const history = { version: 1, entries: [first, second], cursor: 1 };
    expect(restoreEditHistory(serializeEditHistory(history), b).status).toBe('ready');
    for (const index of [0, 1]) {
      const bad = structuredClone(history);
      bad.entries[index].changes[0][index === 0 ? 'after' : 'before'].value = 99;
      expect(restoreEditHistory(serializeEditHistory(bad), b).status).toBe('needs-review');
    }
  });
  it('ignores an invalid checksum, oversized history and unsupported versions without changing current data', () => {
    const before = state({ text: 'A' }),
      after = state({ text: 'B' });
    const saved = serializeEditHistory(
      appendEditTransaction(emptyEditHistory(), createEditTransaction(before, after)).history,
    );
    const preserved = structuredClone(after);
    const invalid = [
      { ...saved, revision: 'invalid' },
      { ...saved, version: 99 },
      { ...saved, padding: 'x'.repeat(8 * 1024 * 1024) },
    ];
    for (const entry of invalid) {
      const result = restoreEditHistory(entry, after);
      expect(result.status).toBe('needs-review');
      expect(result.history.entries).toEqual([]);
      expect(after).toEqual(preserved);
    }
  });
  it('refuses prototype paths, ancestor overlaps and an inconsistent teaching structure', () => {
    const before = state({ text: 'A' }),
      after = state({ text: 'B' });
    const entry = createEditTransaction(before, after);
    const evil = structuredClone(entry);
    evil.changes[0].path = ['deliverables', 'assignments', '__proto__', 'polluted'];
    expect(applyEditTransaction(after, evil, 'undo').status).toBe('needs-review');
    const overlap = structuredClone(entry);
    overlap.changes.push({
      path: ['deliverables', 'assignments', 'data'],
      before: { present: false },
      after: { present: true, value: after.deliverables.assignments.data },
    });
    expect(applyEditTransaction(after, overlap, 'undo').status).toBe('needs-review');
    before.courseMap.teachingProgram = { invalid: true };
    const invalidProgram = createEditTransaction(before, after);
    expect(applyEditTransaction(after, invalidProgram, 'undo').status).toBe('needs-review');
    expect({}.polluted).toBeUndefined();
  });
  it('does not save secrets disguised as reversible path/value pairs', () => {
    const before = state({ text: 'A', apiKey: 'private-before' }),
      after = state({ text: 'B', apiKey: 'private-after' });
    const entry = createEditTransaction(before, after);
    const saved = sanitizeProjectSnapshot(
      serializeEditHistory(appendEditTransaction(emptyEditHistory(), entry).history),
    );
    expect(JSON.stringify(saved)).not.toContain('private-');
    expect(JSON.stringify(saved)).not.toContain('apiKey');
    expect(restoreEditHistory(saved, after).status).toBe('ready');
  });
  it('bounds the entire serialized journal including its envelope and resets on an oversized single edit', () => {
    const a = state({ text: 'A' }),
      b = state({ text: 'B' }),
      c = state({ text: 'C' });
    const first = createEditTransaction(a, b),
      second = createEditTransaction(b, c);
    const one = appendEditTransaction(emptyEditHistory(), first).history;
    const size = new TextEncoder().encode(JSON.stringify(serializeEditHistory(one))).length;
    const result = appendEditTransaction(one, second, 30, size);
    expect(result.history.entries).toHaveLength(1);
    expect(result.history.entries[0].id).toBe(second.id);
    const oversized = appendEditTransaction(one, second, 30, size - 1);
    expect(oversized.history).toEqual(emptyEditHistory());
    expect(oversized.message).toContain('size limit');
    expect(() => appendEditTransaction(one, second, 0)).toThrow('positive');
  });
  it('treats a removed optional undefined field consistently with JSON persistence', () => {
    const before = state({ text: 'A', note: undefined }),
      after = state({ text: 'A', note: 'B' });
    const entry = createEditTransaction(before, after);
    expect(applied(before, entry, 'redo')).toEqual(after);
    expect(applied(after, entry, 'undo').deliverables.assignments.data).toEqual({ text: 'A' });
  });
});
