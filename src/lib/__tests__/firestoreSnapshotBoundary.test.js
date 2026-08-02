import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { normalizeFirestoreSnapshotData } from '../firestoreSnapshotBoundary.js';

describe('normalizeFirestoreSnapshotData', () => {
  it('normalizes actual root and nested SDK timestamps to detached Dates', () => {
    const rootTimestamp = Timestamp.fromDate(new Date('2026-06-01T10:00:00.123Z'));
    const nestedTimestamp = Timestamp.fromDate(new Date('2026-06-02T11:30:00.456Z'));

    const normalized = normalizeFirestoreSnapshotData({
      updatedAt: rootTimestamp,
      nested: [{ updatedAt: nestedTimestamp }],
      plainTimeParts: { seconds: 123, nanoseconds: 456 },
    });

    expect(normalized.updatedAt).toEqual(new Date('2026-06-01T10:00:00.123Z'));
    expect(normalized.updatedAt).not.toBe(rootTimestamp);
    expect(normalized.nested[0].updatedAt).toEqual(new Date('2026-06-02T11:30:00.456Z'));
    expect(normalized.plainTimeParts).toEqual({ seconds: 123, nanoseconds: 456 });
    expect(normalized.plainTimeParts).not.toBeInstanceOf(Date);
  });

  it.each([
    ['negative sub-millisecond', new Timestamp(-1, 999_999_999)],
    ['maximum boundary', new Timestamp(253_402_300_799, 999_999_999)],
  ])('matches the installed Firebase conversion for %s values', (_label, timestamp) => {
    const normalized = normalizeFirestoreSnapshotData({ updatedAt: timestamp });

    expect(normalized.updatedAt).toBeInstanceOf(Date);
    expect(normalized.updatedAt.getTime()).toBe(timestamp.toDate().getTime());
  });

  it('detaches ordinary records, arrays, and native Dates', () => {
    const sourceDate = new Date('2026-06-01T10:00:00.123Z');
    const source = { nested: [{ value: 'kept' }], sourceDate };

    const normalized = normalizeFirestoreSnapshotData(source);

    expect(normalized).toEqual(source);
    expect(normalized).not.toBe(source);
    expect(normalized.nested).not.toBe(source.nested);
    expect(normalized.nested[0]).not.toBe(source.nested[0]);
    expect(normalized.sourceDate).not.toBe(sourceDate);
  });

  it('drops accessors without executing them', () => {
    let reads = 0;
    const source = { kept: 'safe' };
    Object.defineProperty(source, 'computed', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('getter executed');
      },
    });

    expect(normalizeFirestoreSnapshotData(source)).toEqual({ kept: 'safe' });
    expect(reads).toBe(0);
  });
});
