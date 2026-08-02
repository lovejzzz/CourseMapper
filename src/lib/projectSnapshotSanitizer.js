import { detectRequestedClassSessionMinutes, parseClassSessionMinutes } from './sourceBriefConstraints';
import { renderedDeliverableCollection } from './renderedDeliverableRoot.js';
import { selectPersistablePackageEvidence } from './packageQualityPersistence.js';

const SECRET_FIELD_NAMES = new Set([
  'apikey',
  'xapikey',
  'accesskey',
  'secretkey',
  'clientsecret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'bearertoken',
  'openaikey',
  'anthropickey',
  'openrouterkey',
  'deepseekkey',
]);

const SECRET_VALUE_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
];

function normalizeKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[-_\s.]/g, '');
}

function isSecretFieldName(key) {
  return SECRET_FIELD_NAMES.has(normalizeKey(key));
}

function redactSecretText(value) {
  return SECRET_VALUE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[redacted secret]'),
    String(value || ''),
  );
}

const OMIT_SNAPSHOT_VALUE = Symbol('omit-snapshot-value');

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeProjectSnapshotValue(value, ancestors) {
  if (typeof value === 'string') return redactSecretText(value);
  if (!value || typeof value !== 'object') return value;
  try {
    if (!isPlainObject(value) && !Array.isArray(value)) return value;
  } catch {
    return OMIT_SNAPSHOT_VALUE;
  }
  if (ancestors.has(value)) return OMIT_SNAPSHOT_VALUE;

  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0) return OMIT_SNAPSHOT_VALUE;
      const sanitized = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          continue;
        }
        const nested = sanitizeProjectSnapshotValue(descriptor.value, ancestors);
        if (nested !== OMIT_SNAPSHOT_VALUE) sanitized[index] = nested;
      }
      return sanitized;
    }

    const sanitized = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string' || isSecretFieldName(key)) continue;
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        continue;
      }
      const nested = sanitizeProjectSnapshotValue(descriptor.value, ancestors);
      if (nested !== OMIT_SNAPSHOT_VALUE) sanitized[key] = nested;
    }
    return sanitized;
  } catch {
    return OMIT_SNAPSHOT_VALUE;
  } finally {
    ancestors.delete(value);
  }
}

function readFirestoreTimestampParts(value, descriptors = null) {
  try {
    const ownDescriptors = descriptors || Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(ownDescriptors);
    if (
      ownKeys.length !== 2 ||
      !ownKeys.includes('seconds') ||
      !ownKeys.includes('nanoseconds') ||
      !ownDescriptors.seconds?.enumerable ||
      !ownDescriptors.nanoseconds?.enumerable ||
      !Object.prototype.hasOwnProperty.call(ownDescriptors.seconds, 'value') ||
      !Object.prototype.hasOwnProperty.call(ownDescriptors.nanoseconds, 'value')
    ) {
      return null;
    }
    const seconds = ownDescriptors.seconds.value;
    const nanoseconds = ownDescriptors.nanoseconds.value;
    if (
      !Number.isSafeInteger(seconds) ||
      !Number.isInteger(nanoseconds) ||
      nanoseconds < 0 ||
      nanoseconds >= 1_000_000_000
    ) {
      return null;
    }
    const date = new Date(seconds * 1_000 + Math.floor(nanoseconds / 1_000_000));
    return Number.isFinite(date.getTime()) ? { date, nanoseconds, seconds } : null;
  } catch {
    return null;
  }
}

function snapshotGraphContainsOnlyDataDescriptors(value, ancestors) {
  if (!value || typeof value !== 'object') return typeof value !== 'function' && typeof value !== 'symbol';
  if (ancestors.has(value)) return false;

  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (readFirestoreTimestampParts(value, descriptors)) return true;

    const prototype = Object.getPrototypeOf(value);
    if (prototype === Date.prototype) {
      return Reflect.ownKeys(descriptors).length === 0 && Number.isFinite(Date.prototype.getTime.call(value));
    }
    const isArray = Array.isArray(value);
    if (!isArray && prototype !== Object.prototype && prototype !== null) return false;

    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return false;
      const descriptor = descriptors[key];
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      if (isArray && key === 'length') continue;
      if (!descriptor.enumerable) return false;
      if (!snapshotGraphContainsOnlyDataDescriptors(descriptor.value, ancestors)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeAdmittedFirestoreTimestamps(source, cloned, ancestors) {
  if (!source || typeof source !== 'object') return cloned;
  const timestampParts = readFirestoreTimestampParts(source);
  if (timestampParts) {
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) return timestampParts.date;
  }
  if (ancestors.has(source)) return cloned;

  ancestors.add(source);
  try {
    const sourceDescriptors = Object.getOwnPropertyDescriptors(source);
    const cloneDescriptors = Object.getOwnPropertyDescriptors(cloned);
    for (const key of Reflect.ownKeys(sourceDescriptors)) {
      if (typeof key !== 'string') continue;
      const sourceDescriptor = sourceDescriptors[key];
      const cloneDescriptor = cloneDescriptors[key];
      if (
        !sourceDescriptor?.enumerable ||
        !cloneDescriptor ||
        !Object.prototype.hasOwnProperty.call(sourceDescriptor, 'value') ||
        !Object.prototype.hasOwnProperty.call(cloneDescriptor, 'value')
      ) {
        continue;
      }
      const normalized = normalizeAdmittedFirestoreTimestamps(sourceDescriptor.value, cloneDescriptor.value, ancestors);
      if (normalized !== cloneDescriptor.value) {
        Object.defineProperty(cloned, key, {
          ...cloneDescriptor,
          value: normalized,
        });
      }
    }
    return cloned;
  } finally {
    ancestors.delete(source);
  }
}

/**
 * Project restore is a trust boundary, not merely a redaction pass. Inspect
 * descriptors before cloning so getters never execute, then require the
 * platform clone to succeed. The clone rejects Proxy objects (including
 * transparent and trap-mutating roots) and gives every downstream migration a
 * detached, ordinary data graph.
 */
function admitProjectSnapshotRoot(snapshot) {
  try {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !isPlainObject(snapshot)) {
      return null;
    }
    if (!snapshotGraphContainsOnlyDataDescriptors(snapshot, new WeakSet())) return null;
    const cloned = structuredClone(snapshot);
    if (!cloned || typeof cloned !== 'object' || Array.isArray(cloned) || !isPlainObject(cloned)) return null;
    return normalizeAdmittedFirestoreTimestamps(snapshot, cloned, new WeakSet());
  } catch {
    return null;
  }
}

export function restoreAuthoredOverlayForSnapshot(courseGraph, authoredOverlay) {
  if (!courseGraph || typeof courseGraph !== 'object') return courseGraph;
  if (courseGraph.enrichmentOverlay || !authoredOverlay || typeof authoredOverlay !== 'object') return courseGraph;
  return { ...courseGraph, enrichmentOverlay: authoredOverlay };
}

export function sanitizeProjectSnapshot(value) {
  const sanitized = sanitizeProjectSnapshotValue(value, new WeakSet());
  return sanitized === OMIT_SNAPSHOT_VALUE ? null : sanitized;
}

function migrateRestoredDeliverables(snapshot) {
  if (!snapshot.deliverables || typeof snapshot.deliverables !== 'object') return snapshot;

  for (const entry of Object.values(snapshot.deliverables)) {
    if (entry?.stale && !entry?.staleConfidence) {
      entry.staleConfidence = {
        level: 'high',
        maxWeight: 1.0,
        dominantField: null,
      };
    }
  }
  return snapshot;
}

function formatSessionLength(minutes) {
  if (minutes === 120) return '2 hr';
  if (minutes === 180) return '3 hr';
  return `${minutes} min`;
}

function getSavedLessonPlans(snapshot) {
  const data = snapshot?.deliverables?.lessonPlans?.data;
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return renderedDeliverableCollection('lessonPlans', data);
}

/**
 * Legacy exact autosaves did not carry the generation clock separately.
 * Recover it only when every saved plan agrees; a partial or inconsistent
 * package must not be blessed by migration.
 */
export function inferSavedLessonPlanSessionMinutes(snapshot) {
  const plans = getSavedLessonPlans(snapshot);
  if (plans.length === 0) return null;
  const minutesByPlan = plans.map((plan) => {
    const candidates = [
      parseClassSessionMinutes(plan?.classSessionPlan?.sessionMinutes),
      parseClassSessionMinutes(plan?.outlineTiming?.sessionMinutes),
      parseClassSessionMinutes(plan?.duration || plan?.dur),
    ].filter(Boolean);
    if (candidates.length === 0 || new Set(candidates).size !== 1) return null;
    return candidates[0];
  });
  if (minutesByPlan.some((minutes) => !minutes) || new Set(minutesByPlan).size !== 1) return null;
  return minutesByPlan[0];
}

/**
 * Restore the classroom clock before compact recompilation or finalization.
 * Explicit configuration and an explicit instructor brief remain
 * authoritative. The saved generation receipt is next; only legacy snapshots
 * with no receipt may infer a clock from a complete, internally consistent
 * set of lesson plans.
 */
export function restoreProjectGenerationConstraints(snapshot) {
  const explicitMinutes = parseClassSessionMinutes(snapshot?.deliverableConfig?.lessonPlans?.sessionLength);
  const briefMinutes = detectRequestedClassSessionMinutes(snapshot?.promptText);
  const persistedMinutes = parseClassSessionMinutes(snapshot?.generationConstraints?.sessionMinutes);
  const inferredMinutes =
    explicitMinutes || briefMinutes || persistedMinutes ? null : inferSavedLessonPlanSessionMinutes(snapshot);
  const sessionMinutes = explicitMinutes || briefMinutes || persistedMinutes || inferredMinutes;
  if (!sessionMinutes) return snapshot;

  const source = explicitMinutes
    ? 'deliverable-config'
    : briefMinutes
      ? 'course-brief'
      : persistedMinutes
        ? snapshot?.generationConstraints?.sessionMinutesSource || 'saved-generation'
        : 'legacy-exact-package';
  snapshot.generationConstraints = {
    ...(snapshot.generationConstraints || {}),
    sessionMinutes,
    sessionMinutesSource: source,
  };
  if (!explicitMinutes) {
    snapshot.deliverableConfig = {
      ...(snapshot.deliverableConfig || {}),
      lessonPlans: {
        ...(snapshot.deliverableConfig?.lessonPlans || {}),
        sessionLength: formatSessionLength(sessionMinutes),
      },
    };
  }
  return snapshot;
}

export function prepareProjectSnapshotForRestore(snapshot) {
  const sourceSnapshot = admitProjectSnapshotRoot(snapshot || {});
  if (!sourceSnapshot) return { formatVersion: 1 };

  try {
    const descriptors = Object.getOwnPropertyDescriptors(sourceSnapshot);
    const packageDescriptor = descriptors.packageQualityPass;
    const digestDescriptor = descriptors.lastRunDigest;
    if (packageDescriptor || digestDescriptor) {
      const selected = selectPersistablePackageEvidence({
        packageQualityPass: packageDescriptor?.value,
        lastRunDigest: digestDescriptor?.value,
      });
      if (selected.packageQualityPass) {
        descriptors.packageQualityPass = {
          value: selected.packageQualityPass,
          enumerable: true,
          writable: true,
          configurable: true,
        };
      } else {
        delete descriptors.packageQualityPass;
      }
      if (selected.lastRunDigest) {
        descriptors.lastRunDigest = {
          value: selected.lastRunDigest,
          enumerable: true,
          writable: true,
          configurable: true,
        };
      } else {
        delete descriptors.lastRunDigest;
      }
    }
    const restored = sanitizeProjectSnapshot(Object.create(Object.getPrototypeOf(sourceSnapshot), descriptors));
    if (!restored || typeof restored !== 'object' || Array.isArray(restored)) return { formatVersion: 1 };
    if (!restored.formatVersion) restored.formatVersion = 1;
    // v0.13.1: cloud snapshots carry the course graph as a JSON string
    // (Firestore rejects nested arrays anywhere in a document, and the graph's
    // enrichment overlay can embed model-shaped payloads we don't control).
    if (!restored.courseGraph && typeof restored.courseGraphJson === 'string' && restored.courseGraphJson) {
      try {
        restored.courseGraph = JSON.parse(restored.courseGraphJson);
      } catch {
        /* fall back to deriving the graph from the course map on restore */
      }
    }
    delete restored.courseGraphJson;
    return restoreProjectGenerationConstraints(migrateRestoredDeliverables(restored));
  } catch {
    return { formatVersion: 1 };
  }
}
