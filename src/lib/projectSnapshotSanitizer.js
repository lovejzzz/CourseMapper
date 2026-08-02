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

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function restoreAuthoredOverlayForSnapshot(courseGraph, authoredOverlay) {
  if (!courseGraph || typeof courseGraph !== 'object') return courseGraph;
  if (courseGraph.enrichmentOverlay || !authoredOverlay || typeof authoredOverlay !== 'object') return courseGraph;
  return { ...courseGraph, enrichmentOverlay: authoredOverlay };
}

export function sanitizeProjectSnapshot(value) {
  if (Array.isArray(value)) return value.map(sanitizeProjectSnapshot);

  if (value && typeof value === 'object') {
    if (!isPlainObject(value)) return value;
    return Object.entries(value).reduce((acc, [key, nested]) => {
      if (isSecretFieldName(key)) return acc;
      acc[key] = sanitizeProjectSnapshot(nested);
      return acc;
    }, {});
  }

  if (typeof value === 'string') return redactSecretText(value);
  return value;
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
  let sourceSnapshot = snapshot || {};
  let snapshotWithAdmittedPackageEvidence = sourceSnapshot;
  try {
    if (sourceSnapshot && typeof sourceSnapshot === 'object' && !Array.isArray(sourceSnapshot)) {
      const descriptors = Object.getOwnPropertyDescriptors(sourceSnapshot);
      const packageDescriptor = descriptors.packageQualityPass;
      const digestDescriptor = descriptors.lastRunDigest;
      if (packageDescriptor || digestDescriptor) {
        const packageQualityPass =
          packageDescriptor && Object.prototype.hasOwnProperty.call(packageDescriptor, 'value')
            ? packageDescriptor.value
            : null;
        const lastRunDigest =
          digestDescriptor && Object.prototype.hasOwnProperty.call(digestDescriptor, 'value')
            ? digestDescriptor.value
            : null;
        const selected = selectPersistablePackageEvidence({ packageQualityPass, lastRunDigest });
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
        snapshotWithAdmittedPackageEvidence = Object.create(Object.getPrototypeOf(sourceSnapshot), descriptors);
      }
    }
  } catch {
    sourceSnapshot = {};
    snapshotWithAdmittedPackageEvidence = sourceSnapshot;
  }
  const restored = sanitizeProjectSnapshot(snapshotWithAdmittedPackageEvidence);
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
}
