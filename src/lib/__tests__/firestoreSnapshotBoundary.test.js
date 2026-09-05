import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase/app';
import { Bytes, GeoPoint, Timestamp, doc, getFirestore } from 'firebase/firestore';
import { normalizeFirestoreSnapshotData } from '../firestoreSnapshotBoundary.js';

let firebaseApp;

beforeAll(() => {
  firebaseApp = initializeApp({ projectId: 'firestore-boundary-test' }, 'firestore-boundary-test');
});

afterAll(async () => {
  await deleteApp(firebaseApp);
});

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

  it('normalizes supported GeoPoint and Bytes scalars to detached plain records', () => {
    const geoPoint = new GeoPoint(40.7128, -74.006);
    const bytes = Bytes.fromUint8Array(new Uint8Array([1, 2, 3]));

    const normalized = normalizeFirestoreSnapshotData({ geoPoint, bytes });

    expect(normalized).toEqual({
      geoPoint: {
        __firestoreType: 'geo-point',
        latitude: 40.7128,
        longitude: -74.006,
      },
      bytes: {
        __firestoreType: 'bytes',
        base64: bytes.toBase64(),
      },
    });
    expect(Object.getPrototypeOf(normalized.geoPoint)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(normalized.bytes)).toBe(Object.prototype);

    geoPoint._lat = 0;
    expect(normalized.geoPoint.latitude).toBe(40.7128);
  });

  it('rejects DocumentReference and unknown scalar classes instead of preserving live prototypes', () => {
    const reference = doc(getFirestore(firebaseApp), 'courses/course-1');

    expect(normalizeFirestoreSnapshotData({ reference })).toBeNull();
    expect(normalizeFirestoreSnapshotData({ unknown: new (class UnknownScalar {})() })).toBeNull();
  });

  it('rejects transparent and revoked proxy graphs', () => {
    const transparent = new Proxy({ kept: 'synthetic' }, {});
    const revoked = Proxy.revocable({ kept: 'synthetic' }, {});
    revoked.revoke();

    expect(normalizeFirestoreSnapshotData(transparent)).toBeNull();
    expect(normalizeFirestoreSnapshotData(revoked.proxy)).toBeNull();
  });

  it('rejects cycles and nested unsupported values', () => {
    const cyclic = { kept: 'synthetic' };
    cyclic.self = cyclic;

    expect(normalizeFirestoreSnapshotData(cyclic)).toBeNull();
    expect(normalizeFirestoreSnapshotData({ nested: [{ unsupported: new (class UnknownScalar {})() }] })).toBeNull();
  });

  it('rejects accessors without executing them', () => {
    let reads = 0;
    const source = { kept: 'safe' };
    Object.defineProperty(source, 'computed', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('getter executed');
      },
    });

    expect(normalizeFirestoreSnapshotData(source)).toBeNull();
    expect(reads).toBe(0);
  });

  it('rejects custom state on supported SDK scalars', () => {
    const timestamp = new Timestamp(1, 2);
    timestamp.custom = true;

    expect(normalizeFirestoreSnapshotData({ timestamp })).toBeNull();
  });

  it.each([
    ['seconds below the minimum', -62_135_596_801, 0],
    ['seconds above the maximum', 253_402_300_800, 0],
    ['fractional seconds', 1.5, 0],
    ['negative nanoseconds', 1, -1],
    ['overflowing nanoseconds', 1, 1_000_000_000],
    ['fractional nanoseconds', 1, 0.5],
  ])('rejects forged Timestamp state with %s', (_label, seconds, nanoseconds) => {
    const timestamp = Object.create(Timestamp.prototype);
    Object.defineProperties(timestamp, {
      seconds: { value: seconds, enumerable: true },
      nanoseconds: { value: nanoseconds, enumerable: true },
    });

    expect(normalizeFirestoreSnapshotData({ timestamp })).toBeNull();
  });

  it.each([
    ['latitude above the maximum', 90.000_001, 0],
    ['latitude below the minimum', -90.000_001, 0],
    ['longitude above the maximum', 0, 180.000_001],
    ['longitude below the minimum', 0, -180.000_001],
    ['non-finite latitude', Number.NaN, 0],
  ])('rejects forged GeoPoint state with %s', (_label, latitude, longitude) => {
    const geoPoint = Object.create(GeoPoint.prototype);
    Object.defineProperties(geoPoint, {
      _lat: { value: latitude, enumerable: true },
      _long: { value: longitude, enumerable: true },
    });

    expect(normalizeFirestoreSnapshotData({ geoPoint })).toBeNull();
  });

  it('rejects forged Bytes internals without invoking source methods', () => {
    let methodCalls = 0;
    const hostileByteString = Object.create({
      toBase64() {
        methodCalls += 1;
        return 'forged';
      },
    });
    hostileByteString.binaryString = '\u0001\u0002\u0003';
    const bytes = Object.create(Bytes.prototype);
    Object.defineProperty(bytes, '_byteString', {
      value: hostileByteString,
      enumerable: true,
    });

    expect(normalizeFirestoreSnapshotData({ bytes })).toBeNull();
    expect(methodCalls).toBe(0);
  });

  it('rejects non-Firestore primitive types', () => {
    expect(normalizeFirestoreSnapshotData({ value: 1n })).toBeNull();
    expect(normalizeFirestoreSnapshotData({ value: Symbol('unsupported') })).toBeNull();
    expect(normalizeFirestoreSnapshotData({ value: () => 'unsupported' })).toBeNull();
  });

  it('preserves hostile nested record keys as own data without changing prototypes', () => {
    const source = JSON.parse(
      '{"__proto__":{"marker":"prototype-value"},"constructor":{"marker":"constructor-value"},"prototype":{"marker":"prototype-property-value"}}',
    );

    const normalized = normalizeFirestoreSnapshotData({ nested: source });

    expect(Object.getPrototypeOf(normalized.nested)).toBe(Object.prototype);
    expect(Object.keys(normalized.nested)).toEqual(['__proto__', 'constructor', 'prototype']);
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(Object.getOwnPropertyDescriptor(normalized.nested, key)).toMatchObject({
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    expect(normalized.nested.__proto__).toEqual({ marker: 'prototype-value' });
    expect(normalized.nested.constructor).toEqual({ marker: 'constructor-value' });
    expect(normalized.nested.prototype).toEqual({ marker: 'prototype-property-value' });
  });
});
