import { Bytes, GeoPoint, Timestamp } from 'firebase/firestore';

const OMIT_FIRESTORE_VALUE = Symbol('omit-firestore-value');

function isPlainRecord(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactEnumerableDataKeys(value, expectedKeys) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  return (
    ownKeys.length === expectedKeys.length &&
    expectedKeys.every(
      (key) =>
        ownKeys.includes(key) &&
        descriptors[key]?.enumerable &&
        Object.prototype.hasOwnProperty.call(descriptors[key], 'value'),
    )
  );
}

function firestoreGraphHasOnlySupportedData(value, ancestors) {
  if (!value || typeof value !== 'object') return typeof value !== 'function' && typeof value !== 'symbol';
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Timestamp.prototype) {
      return hasExactEnumerableDataKeys(value, ['seconds', 'nanoseconds']);
    }
    if (prototype === GeoPoint.prototype) {
      return hasExactEnumerableDataKeys(value, ['_lat', '_long']);
    }
    if (prototype === Bytes.prototype) {
      return hasExactEnumerableDataKeys(value, ['_byteString']);
    }
    if (prototype === Date.prototype) {
      return (
        Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).length === 0 &&
        Number.isFinite(Date.prototype.getTime.call(value))
      );
    }

    const isArray = Array.isArray(value);
    if (!isArray && !isPlainRecord(value)) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (isArray) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0) return false;
      const ownKeys = Reflect.ownKeys(descriptors);
      if (ownKeys.length !== length + 1) return false;
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          !descriptor?.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          !firestoreGraphHasOnlySupportedData(descriptor.value, ancestors)
        ) {
          return false;
        }
      }
      return true;
    }

    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return false;
      const descriptor = descriptors[key];
      if (
        !descriptor?.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !firestoreGraphHasOnlySupportedData(descriptor.value, ancestors)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeFirestoreValue(value, ancestors) {
  if (!value || typeof value !== 'object') return value;

  try {
    // This helper is called only on values returned directly by Firestore's
    // DocumentSnapshot.data(). At that controlled SDK boundary, exact
    // prototype identity identifies an SDK-decoded Timestamp. Generic project
    // restore deliberately does not make the same provenance claim.
    if (Object.getPrototypeOf(value) === Timestamp.prototype) {
      const date = new Date(Timestamp.prototype.toMillis.call(value));
      return Number.isFinite(date.getTime()) ? date : OMIT_FIRESTORE_VALUE;
    }

    if (Object.getPrototypeOf(value) === GeoPoint.prototype) {
      const latitude = Object.getOwnPropertyDescriptor(GeoPoint.prototype, 'latitude')?.get?.call(value);
      const longitude = Object.getOwnPropertyDescriptor(GeoPoint.prototype, 'longitude')?.get?.call(value);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { __firestoreType: 'geo-point', latitude, longitude }
        : OMIT_FIRESTORE_VALUE;
    }

    if (Object.getPrototypeOf(value) === Bytes.prototype) {
      return { __firestoreType: 'bytes', base64: Bytes.prototype.toBase64.call(value) };
    }

    if (Object.getPrototypeOf(value) === Date.prototype) {
      const milliseconds = Date.prototype.getTime.call(value);
      return Number.isFinite(milliseconds) ? new Date(milliseconds) : OMIT_FIRESTORE_VALUE;
    }

    const isArray = Array.isArray(value);
    if (!isArray && !isPlainRecord(value)) return OMIT_FIRESTORE_VALUE;
    if (ancestors.has(value)) return OMIT_FIRESTORE_VALUE;

    ancestors.add(value);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (isArray) {
        const length = descriptors.length?.value;
        if (!Number.isSafeInteger(length) || length < 0) return OMIT_FIRESTORE_VALUE;
        const normalized = new Array(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
          const nested = normalizeFirestoreValue(descriptor.value, ancestors);
          if (nested !== OMIT_FIRESTORE_VALUE) normalized[index] = nested;
        }
        return normalized;
      }

      const normalized = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string') continue;
        const descriptor = descriptors[key];
        if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
        const nested = normalizeFirestoreValue(descriptor.value, ancestors);
        if (nested !== OMIT_FIRESTORE_VALUE) normalized[key] = nested;
      }
      return normalized;
    } finally {
      ancestors.delete(value);
    }
  } catch {
    return OMIT_FIRESTORE_VALUE;
  }
}

/**
 * Normalize SDK-owned scalar types immediately after DocumentSnapshot.data().
 * Supported records, arrays, Dates, and Timestamps are detached. Timestamp
 * conversion uses the installed Firebase SDK's own Date conversion semantics.
 */
export function normalizeFirestoreSnapshotData(value) {
  try {
    if (!firestoreGraphHasOnlySupportedData(value, new WeakSet())) return null;
    // The clone result is not used because it intentionally erases Firebase
    // scalar prototypes. Requiring the operation to succeed rejects Proxy
    // graphs and other non-cloneable values before normalized state is used.
    structuredClone(value);
    const normalized = normalizeFirestoreValue(value, new WeakSet());
    return normalized === OMIT_FIRESTORE_VALUE ? null : normalized;
  } catch {
    return null;
  }
}
