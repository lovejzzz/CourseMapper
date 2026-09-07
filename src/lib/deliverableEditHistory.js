import { canonicalJson, sameJsonData } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';
import { sanitizeProjectSnapshot } from './projectSnapshotSanitizer.js';
import { validateTeachingProgram } from './teachingProgram.js';

export const EDIT_HISTORY_VERSION = 1;
export const EDIT_HISTORY_MAX_BYTES = 8 * 1024 * 1024;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (value) => sha256HexSync(canonicalJson(value));
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const safeJson = (value) => JSON.parse(JSON.stringify(sanitizeProjectSnapshot(value)));
const own = (value, key) => value != null && Object.hasOwn(value, key);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const problem = (message) => ({ status: 'needs-review', message });

function at(root, path) {
  let value = root;
  for (const key of path) {
    if (!own(value, key)) return { present: false };
    value = value[key];
  }
  return value === undefined ? { present: false } : { present: true, value };
}

function validPath(path) {
  return (
    Array.isArray(path) &&
    path.length > 0 &&
    path.length <= 64 &&
    (['courseMap', 'courseGraph'].includes(path[0]) ||
      (path[0] === 'deliverables' && path.length >= 3 && typeof path[1] === 'string')) &&
    path.every(
      (key) =>
        (typeof key === 'string' && key.length > 0 && !forbidden.has(key)) || (Number.isSafeInteger(key) && key >= 0),
    )
  );
}

function envelope(value) {
  return object(value) && typeof value.present === 'boolean' && (!value.present || own(value, 'value'));
}

/** Diff data, not stringified documents. Whole arrays are retained only when
 * their structure changes; traversed arrays get exact-revision guards so an
 * index can never silently address a different row after a reorder. */
export function createEditTransaction(before, after) {
  const changes = [],
    guards = [];
  function visit(left, right, path) {
    if (sameJsonData(left, right)) return;
    const a = left.value,
      b = right.value;
    if (left.present && right.present && object(a) && object(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        visit(
          own(a, key) ? { present: true, value: a[key] } : { present: false },
          own(b, key) ? { present: true, value: b[key] } : { present: false },
          [...path, key],
        );
      return;
    }
    if (left.present && right.present && Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      guards.push({ path, before: hash(a), after: hash(b) });
      a.forEach((value, index) =>
        visit({ present: true, value }, { present: true, value: b[index] }, [...path, index]),
      );
      return;
    }
    changes.push({ path, before: left, after: right });
  }
  visit({ present: true, value: safeJson(before) }, { present: true, value: safeJson(after) }, []);
  if (!changes.length) return null;
  const transaction = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), changes, guards };
  if (!validTransaction(transaction)) throw new Error('This edit contains unsupported history fields.');
  return transaction;
}

function validTransaction(entry) {
  if (
    !object(entry) ||
    typeof entry.id !== 'string' ||
    typeof entry.createdAt !== 'string' ||
    !Array.isArray(entry.changes) ||
    !entry.changes.length ||
    !Array.isArray(entry.guards)
  )
    return false;
  const paths = new Set();
  for (const change of entry.changes) {
    if (!validPath(change?.path) || !envelope(change.before) || !envelope(change.after)) return false;
    const key = JSON.stringify(change.path);
    if (paths.has(key)) return false;
    paths.add(key);
  }
  for (const change of entry.changes)
    for (let i = 1; i < change.path.length; i++) if (paths.has(JSON.stringify(change.path.slice(0, i)))) return false;
  return entry.guards.every(
    (guard) => validPath(guard?.path) && /^[a-f0-9]{64}$/.test(guard.before) && /^[a-f0-9]{64}$/.test(guard.after),
  );
}

function replace(root, path, target) {
  const [key, ...rest] = path;
  if (
    (!object(root) && !Array.isArray(root)) ||
    (Array.isArray(root) && (!Number.isInteger(key) || key >= root.length))
  )
    throw new Error('An edited item is no longer at its saved location.');
  const result = Array.isArray(root) ? [...root] : { ...root };
  if (rest.length) {
    if (!own(root, key)) throw new Error('An edited item was removed.');
    result[key] = replace(root[key], rest, target);
  } else if (target.present) result[key] = structuredClone(target.value);
  else {
    if (Array.isArray(root)) throw new Error('A saved edit cannot leave an empty array position.');
    delete result[key];
  }
  return result;
}

function validPrograms(state) {
  const map = state.courseMap?.teachingProgram,
    graph = state.courseGraph?.teachingProgram;
  return (
    (!map || validateTeachingProgram(map).valid) &&
    (!graph || validateTeachingProgram(graph).valid) &&
    (!map || !graph || map.revision === graph.revision)
  );
}

export function applyEditTransaction(workspace, entry, direction) {
  if (!['undo', 'redo'].includes(direction) || !validTransaction(entry))
    return problem('The saved edit is not valid. The current course has been preserved.');
  const from = direction === 'undo' ? 'after' : 'before',
    to = direction === 'undo' ? 'before' : 'after';
  // Check the whole transaction first. No partial write is visible on failure.
  for (const guard of entry.guards) {
    const current = at(workspace, guard.path);
    if (!current.present || hash(current.value) !== guard[from])
      return problem('A related list changed after this edit. Its current contents were preserved.');
  }
  for (const change of entry.changes)
    if (!sameJsonData(at(workspace, change.path), change[from]))
      return problem('A related field changed after this edit. Its current contents were preserved.');
  try {
    let next = workspace;
    for (const change of entry.changes) next = replace(next, change.path, change[to]);
    if (!validPrograms(next))
      return problem(
        'This saved edit would restore an inconsistent teaching structure. The current course has been preserved.',
      );
    return { status: 'applied', workspace: next };
  } catch (error) {
    return problem(error.message);
  }
}

export const emptyEditHistory = () => ({ version: EDIT_HISTORY_VERSION, cursor: 0, entries: [] });

export function appendEditTransaction(history, entry, maxSize = 30, maxBytes = EDIT_HISTORY_MAX_BYTES) {
  if (!entry) return { history };
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) throw new Error('History needs a positive entry limit.');
  const sizeOf = (entries) =>
    bytes({ version: EDIT_HISTORY_VERSION, entries, cursor: entries.length, revision: '0'.repeat(64) });
  if (sizeOf([entry]) > maxBytes)
    return {
      history: emptyEditHistory(),
      message:
        'This edit exceeds the saved history size limit. The current materials are preserved; earlier undo history was cleared.',
    };
  const entries = [...history.entries.slice(0, history.cursor), entry];
  while (entries.length > maxSize || sizeOf(entries) > maxBytes) entries.shift();
  return { history: { version: EDIT_HISTORY_VERSION, entries, cursor: entries.length } };
}

export function serializeEditHistory(history) {
  const body = structuredClone(history);
  return { ...body, revision: hash(body) };
}

/** Treat stored history as an optional recovery aid. A damaged history must
 * not stop a sound current project from opening or write historical values. */
export function restoreEditHistory(saved, workspace, maxSize = 30) {
  if (saved == null) return { status: 'ready', history: emptyEditHistory() };
  try {
    if (bytes(saved) > EDIT_HISTORY_MAX_BYTES) throw new Error('The saved edit history exceeds its size limit.');
    const { revision, ...body } = saved;
    if (
      body.version !== EDIT_HISTORY_VERSION ||
      !Array.isArray(body.entries) ||
      body.entries.length > maxSize ||
      !Number.isInteger(body.cursor) ||
      body.cursor < 0 ||
      body.cursor > body.entries.length ||
      !body.entries.every(validTransaction) ||
      new Set(body.entries.map((entry) => entry.id)).size !== body.entries.length ||
      revision !== hash(body)
    )
      throw new Error('The saved edit history is incomplete or unsupported.');
    for (const direction of ['undo', 'redo']) {
      let current = workspace;
      const entries =
        direction === 'undo' ? body.entries.slice(0, body.cursor).reverse() : body.entries.slice(body.cursor);
      for (const entry of entries) {
        const result = applyEditTransaction(current, entry, direction);
        if (result.status !== 'applied') throw new Error(result.message);
        current = result.workspace;
      }
    }
    return { status: 'ready', history: structuredClone(body) };
  } catch (error) {
    return {
      ...problem(`${error.message} The current project is available; this history cannot be used.`),
      history: emptyEditHistory(),
    };
  }
}

/** Capture only explicitly edited fields. Sanitization happens before diffing
 * so a secret field cannot survive disguised as a patch path/value pair. */
export function editTransactionStates(features, context, workspace) {
  const afterFeatures = {};
  for (const [id, fields] of Object.entries(features))
    afterFeatures[id] = Object.fromEntries(
      Object.keys(fields).map((key) => [key, workspace.deliverables?.[id]?.[key]]),
    );
  return {
    before: { deliverables: features, ...(context || {}) },
    after: {
      deliverables: afterFeatures,
      ...(context ? { courseMap: workspace.courseMap, courseGraph: workspace.courseGraph } : {}),
    },
  };
}
