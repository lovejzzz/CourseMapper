import { diffDeveloperSnapshots, formatDeveloperDiffItem } from './developerIdeDiagnostics.js';
import { getDeveloperSecretFindings } from './developerSecretDiagnostics.js';

const STORAGE_KEY = 'coursemapper-developer-ide-history';
const DEFAULT_HISTORY_LIMIT = 8;
const MAX_PATCHES = 120;
const MAX_PATCH_BYTES = 180_000;
const MAX_LABEL_LENGTH = 80;

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function makeHistoryId(createdAt) {
  return `devhist_${createdAt}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function hashSnapshot(value) {
  let text = '';
  try {
    text = JSON.stringify(value ?? {});
  } catch {
    text = '';
  }
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function patchSize(patches) {
  try {
    return JSON.stringify(patches).length;
  } catch {
    return MAX_PATCH_BYTES + 1;
  }
}

function makePatch(path, before, after) {
  return {
    path,
    hasBefore: before !== undefined,
    hasAfter: after !== undefined,
    ...(before !== undefined ? { before: cloneJson(before) } : {}),
    ...(after !== undefined ? { after: cloneJson(after) } : {}),
  };
}

function pushPatch(patches, state, patch) {
  if (patches.length >= MAX_PATCHES) {
    state.truncated = true;
    return;
  }
  patches.push(patch);
  if (patchSize(patches) > MAX_PATCH_BYTES) {
    patches.pop();
    state.truncated = true;
  }
}

function walkPatch(before, after, path, patches, state, depth = 8) {
  if (state.truncated || valuesEqual(before, after)) return;

  if (depth <= 0 || before === undefined || after === undefined) {
    pushPatch(patches, state, makePatch(path, before, after));
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    keys.forEach((key) => walkPatch(before[key], after[key], [...path, key], patches, state, depth - 1));
    return;
  }

  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    before.forEach((item, index) => walkPatch(item, after[index], [...path, index], patches, state, depth - 1));
    return;
  }

  pushPatch(patches, state, makePatch(path, before, after));
}

function buildSnapshotPatches(beforeSnapshot, afterSnapshot) {
  const secretCount =
    getDeveloperSecretFindings(beforeSnapshot).length + getDeveloperSecretFindings(afterSnapshot).length;
  if (secretCount > 0) {
    return {
      patches: [],
      truncated: true,
      secretBlocked: true,
    };
  }

  const patches = [];
  const state = { truncated: false };
  walkPatch(beforeSnapshot, afterSnapshot, [], patches, state);
  return {
    patches,
    truncated: state.truncated,
    secretBlocked: false,
  };
}

function getAtPath(root, path) {
  return path.reduce((node, segment) => (node == null ? undefined : node[segment]), root);
}

function setAtPath(root, path, patch, direction) {
  const shouldSet = direction === 'forward' ? patch.hasAfter : patch.hasBefore;
  const value = direction === 'forward' ? patch.after : patch.before;

  if (path.length === 0) return shouldSet ? cloneJson(value) : {};

  let target = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextSegment = path[index + 1];
    if (target[segment] == null || typeof target[segment] !== 'object') {
      target[segment] = typeof nextSegment === 'number' ? [] : {};
    }
    target = target[segment];
  }

  const last = path[path.length - 1];
  if (shouldSet) target[last] = cloneJson(value);
  else if (Array.isArray(target) && typeof last === 'number') target.splice(last, 1);
  else delete target[last];
  return root;
}

function applyPatches(currentSnapshot, patches, direction) {
  let next = cloneJson(currentSnapshot);
  patches.forEach((patch) => {
    next = setAtPath(next, patch.path || [], patch, direction);
  });
  return next;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const hasLegacySnapshots = entry.beforeSnapshot && entry.afterSnapshot;
  const hasPatches = Array.isArray(entry.patches);
  if (!hasLegacySnapshots && !hasPatches) return null;
  const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
  return {
    id: entry.id || makeHistoryId(entry.createdAt || Date.now()),
    label,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    dirtySections: Array.isArray(entry.dirtySections) ? entry.dirtySections.filter(Boolean) : [],
    changes: Array.isArray(entry.changes) ? entry.changes : [],
    beforeHash: entry.beforeHash || (entry.beforeSnapshot ? hashSnapshot(entry.beforeSnapshot) : ''),
    afterHash: entry.afterHash || (entry.afterSnapshot ? hashSnapshot(entry.afterSnapshot) : ''),
    patches: hasPatches ? entry.patches : [],
    patchTruncated: Boolean(entry.patchTruncated),
    secretBlocked: Boolean(entry.secretBlocked),
    restorable: entry.restorable !== undefined ? Boolean(entry.restorable) : hasLegacySnapshots,
    ...(hasLegacySnapshots
      ? {
          beforeSnapshot: entry.beforeSnapshot,
          afterSnapshot: entry.afterSnapshot,
        }
      : {}),
  };
}

function readEntries() {
  try {
    const parsed = safeParse(localStorage.getItem(STORAGE_KEY), []);
    return Array.isArray(parsed) ? parsed.map(normalizeEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  try {
    const compactEntries = entries.map(({ beforeSnapshot, afterSnapshot, ...entry }) => entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactEntries));
  } catch {
    // History is a convenience safety net; quota failures should not block a save.
  }
}

export function buildDeveloperHistoryEntry({
  beforeSnapshot,
  afterSnapshot,
  dirtySections = [],
  label = '',
  createdAt = Date.now(),
}) {
  const patchResult = buildSnapshotPatches(beforeSnapshot, afterSnapshot);
  return {
    id: makeHistoryId(createdAt),
    label: String(label || '')
      .trim()
      .slice(0, MAX_LABEL_LENGTH),
    createdAt,
    dirtySections: Array.from(dirtySections).filter(Boolean),
    changes: diffDeveloperSnapshots(beforeSnapshot, afterSnapshot, { limit: 12 }),
    beforeHash: hashSnapshot(beforeSnapshot),
    afterHash: hashSnapshot(afterSnapshot),
    patches: patchResult.patches,
    patchTruncated: patchResult.truncated,
    secretBlocked: patchResult.secretBlocked,
    restorable: !patchResult.truncated,
  };
}

export function loadDeveloperHistory(limit = DEFAULT_HISTORY_LIMIT) {
  return readEntries()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function buildHistorySearchText(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  return [
    entry?.id,
    entry?.label,
    entry?.createdAt,
    ...(Array.isArray(entry?.dirtySections) ? entry.dirtySections : []),
    entry?.restorable === false ? 'summary only restore unavailable' : 'restorable',
    entry?.secretBlocked ? 'secret safe secret blocked' : '',
    entry?.patchTruncated ? 'patch too large truncated' : '',
    ...changes.flatMap((change) => [
      change?.type,
      change?.path,
      change?.beforeSummary,
      change?.afterSummary,
      formatDeveloperDiffItem(change || {}),
    ]),
  ]
    .filter((part) => part !== undefined && part !== null)
    .join(' ')
    .toLowerCase();
}

export function searchDeveloperHistory(entries = [], query = '') {
  const terms = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = buildHistorySearchText(entry);
    return terms.every((term) => haystack.includes(term));
  });
}

export function appendDeveloperHistoryEntry(entry, limit = DEFAULT_HISTORY_LIMIT) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return loadDeveloperHistory(limit);
  const entries = [normalized, ...readEntries().filter((item) => item.id !== normalized.id)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  writeEntries(entries);
  return entries;
}

export function clearDeveloperHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked localStorage.
  }
  return [];
}

export function canRestoreDeveloperHistorySnapshot(entry, snapshotKey, currentSnapshot) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return false;
  if (normalized[snapshotKey]) return true;
  if (!normalized.restorable) return false;

  const currentHash = hashSnapshot(currentSnapshot);
  if (snapshotKey === 'beforeSnapshot') {
    return currentHash === normalized.beforeHash || currentHash === normalized.afterHash;
  }
  if (snapshotKey === 'afterSnapshot') {
    return currentHash === normalized.beforeHash || currentHash === normalized.afterHash;
  }
  return false;
}

export function restoreDeveloperHistorySnapshot(entry, snapshotKey, currentSnapshot) {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new Error('History entry is invalid.');
  if (normalized[snapshotKey]) return cloneJson(normalized[snapshotKey]);
  if (!normalized.restorable) {
    throw new Error(
      normalized.secretBlocked
        ? 'History restore is unavailable because this save touched secret-bearing data.'
        : 'History restore is unavailable because the saved patch was too large.',
    );
  }

  const currentHash = hashSnapshot(currentSnapshot);
  if (snapshotKey === 'beforeSnapshot') {
    if (currentHash === normalized.beforeHash) return cloneJson(currentSnapshot);
    if (currentHash === normalized.afterHash) return applyPatches(currentSnapshot, normalized.patches, 'reverse');
  }

  if (snapshotKey === 'afterSnapshot') {
    if (currentHash === normalized.afterHash) return cloneJson(currentSnapshot);
    if (currentHash === normalized.beforeHash) return applyPatches(currentSnapshot, normalized.patches, 'forward');
  }

  throw new Error('History restore needs the current workspace to match either side of that saved patch.');
}

export const __developerIdeHistoryInternals = {
  hashSnapshot,
  getAtPath,
};
