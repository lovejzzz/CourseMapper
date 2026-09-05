/**
 * cloudStorage.js — Firestore CRUD helpers for user data.
 *
 * Collections:
 *   users/{uid}                                  ← profile + settings
 *   users/{uid}/customDeliverables/{id}          ← custom deliverable defs
 *   users/{uid}/developerTemplates/{id}          ← reusable developer template defs
 *   users/{uid}/projects/{projectId}             ← project metadata + courseMap
 *   users/{uid}/projects/{projectId}/deliverables/{featureId}  ← deliverable data
 */

import { db } from './firebase';
import { normalizeFirestoreSnapshotData } from './firestoreSnapshotBoundary.js';
import { setOwnEnumerableData } from './ownEnumerableData.js';
import { sanitizeProjectSnapshot } from './projectSnapshotSanitizer';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

/* ═══════════════════════ helpers ═══════════════════════ */

function userDoc(uid) {
  return doc(db, 'users', uid);
}
function projectsCol(uid) {
  return collection(db, 'users', uid, 'projects');
}
function projectDoc(uid, pid) {
  return doc(db, 'users', uid, 'projects', pid);
}
function delivCol(uid, pid) {
  return collection(db, 'users', uid, 'projects', pid, 'deliverables');
}
function delivDoc(uid, pid, fid) {
  return doc(db, 'users', uid, 'projects', pid, 'deliverables', fid);
}
const DELIVERABLE_CHUNK_PREFIX = '__cm_chunk__';
const MAX_DELIVERABLE_DOC_BYTES = 700_000;

function delivChunkDoc(uid, pid, fid, index) {
  return doc(db, 'users', uid, 'projects', pid, 'deliverables', `${DELIVERABLE_CHUNK_PREFIX}${fid}__${index}`);
}
function customDelCol(uid) {
  return collection(db, 'users', uid, 'customDeliverables');
}
function customDelDoc(uid, id) {
  return doc(db, 'users', uid, 'customDeliverables', id);
}
function developerTemplateCol(uid) {
  return collection(db, 'users', uid, 'developerTemplates');
}
function developerTemplateDoc(uid, id) {
  return doc(db, 'users', uid, 'developerTemplates', id);
}

function sanitizeCloudPayload(value) {
  return sanitizeProjectSnapshot(value || {});
}

function sanitizeCloudSnapshotData(value) {
  return sanitizeCloudPayload(normalizeFirestoreSnapshotData(value) || {});
}

function readNormalizedCloudDate(value) {
  try {
    if (Object.getPrototypeOf(value) !== Date.prototype) return new Date(0);
    const milliseconds = Date.prototype.getTime.call(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : new Date(0);
  } catch {
    return new Date(0);
  }
}

function getByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

function splitStringByBytes(value, maxBytes = MAX_DELIVERABLE_DOC_BYTES) {
  if (getByteLength(value) <= maxBytes) return [value];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maxBytes);
    while (end > start && getByteLength(value.slice(start, end)) > maxBytes) {
      end = start + Math.max(1, Math.floor((end - start) * 0.8));
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

async function commitBatchOperations(operations) {
  const maxBatchWrites = 450;
  for (let i = 0; i < operations.length; i += maxBatchWrites) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(i, i + maxBatchWrites)) {
      if (operation.type === 'delete') batch.delete(operation.ref);
      else batch.set(operation.ref, operation.payload);
    }
    await batch.commit();
  }
}

async function clearProjectDeliverables(uid, projectId) {
  const snap = await getDocs(delivCol(uid, projectId));
  const operations = getSnapshotDocs(snap).map((d) => ({
    type: 'delete',
    ref: d.ref || delivDoc(uid, projectId, d.id),
  }));
  if (operations.length > 0) await commitBatchOperations(operations);
}

function getSnapshotDocs(snap) {
  const docs = [];
  if (snap?.forEach) {
    snap.forEach((d) => docs.push(d));
    return docs;
  }
  return Array.isArray(snap?.docs) ? snap.docs : [];
}

function getChunkDocFeatureId(id, data) {
  if (data?.featureId) return data.featureId;
  if (!String(id || '').startsWith(DELIVERABLE_CHUNK_PREFIX)) return null;
  const rest = String(id).slice(DELIVERABLE_CHUNK_PREFIX.length);
  const markerIndex = rest.lastIndexOf('__');
  return markerIndex > 0 ? rest.slice(0, markerIndex) : null;
}

/* ═══════════════════ Profile ═══════════════════ */

export async function loadProfile(uid) {
  if (!db) return null;
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? sanitizeCloudSnapshotData(snap.data()) : null;
}

export async function saveProfile(uid, profile) {
  if (!db) return;
  const safeProfile = sanitizeCloudPayload(profile);
  await setDoc(
    userDoc(uid),
    {
      ...safeProfile,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/* ═══════════════════ Custom Deliverables ═══════════════════ */

export async function loadCustomDeliverables(uid) {
  if (!db) return {};
  const snap = await getDocs(customDelCol(uid));
  const map = {};
  snap.forEach((d) => {
    setOwnEnumerableData(map, d.id, sanitizeCloudSnapshotData(d.data()));
  });
  return map;
}

export async function saveCustomDeliverable(uid, id, def) {
  if (!db) return;
  const safeDef = sanitizeCloudPayload(def);
  await setDoc(customDelDoc(uid, id), {
    ...safeDef,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomDeliverable(uid, id) {
  if (!db) return;
  await deleteDoc(customDelDoc(uid, id));
}

/* ═══════════════════ Developer Templates ═══════════════════ */

export async function loadDeveloperTemplates(uid) {
  if (!db) return {};
  const snap = await getDocs(developerTemplateCol(uid));
  const map = {};
  snap.forEach((d) => {
    setOwnEnumerableData(map, d.id, sanitizeCloudSnapshotData(d.data()));
  });
  return map;
}

export async function saveDeveloperTemplate(uid, id, template) {
  if (!db) return;
  const safeTemplate = sanitizeCloudPayload(template);
  await setDoc(developerTemplateDoc(uid, id), {
    ...safeTemplate,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDeveloperTemplate(uid, id) {
  if (!db) return;
  await deleteDoc(developerTemplateDoc(uid, id));
}

/* ═══════════════════ Projects ═══════════════════ */

export async function listProjects(uid) {
  if (!db) return [];
  const q = query(projectsCol(uid), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = sanitizeCloudSnapshotData(d.data());
    return {
      id: d.id,
      courseName: data.courseName || 'Untitled',
      semester: data.semester || '',
      updatedAt: readNormalizedCloudDate(data.updatedAt),
      createdAt: readNormalizedCloudDate(data.createdAt),
    };
  });
}

export async function loadProject(uid, projectId) {
  if (!db) return null;
  const snap = await getDoc(projectDoc(uid, projectId));
  if (!snap.exists()) return null;
  return sanitizeCloudSnapshotData(snap.data());
}

export async function saveProject(uid, projectId, projectData) {
  if (!db) return;
  const safeProjectData = sanitizeCloudPayload(projectData);
  // Separate deliverables out — they go to a subcollection
  const { deliverables, ...meta } = safeProjectData;
  await setDoc(
    projectDoc(uid, projectId),
    {
      ...meta,
      updatedAt: serverTimestamp(),
      createdAt: meta.createdAt || serverTimestamp(),
    },
    { merge: true },
  );

  if (meta.deliverableSaveMode === 'recompile-on-open') {
    await clearProjectDeliverables(uid, projectId);
    return;
  }

  // Save deliverables to subcollection
  if (deliverables && typeof deliverables === 'object') {
    await saveProjectDeliverables(uid, projectId, deliverables);
  }
}

export async function deleteProject(uid, projectId) {
  if (!db) return;
  // Delete deliverables subcollection first
  const dSnap = await getDocs(delivCol(uid, projectId));
  const batch = writeBatch(db);
  dSnap.forEach((d) => batch.delete(d.ref));
  batch.delete(projectDoc(uid, projectId));
  await batch.commit();
}

/* ═══════════════════ Project Deliverables ═══════════════════ */

export async function saveProjectDeliverables(uid, projectId, deliverables) {
  if (!db) return;
  const safeDeliverables = sanitizeCloudPayload(deliverables);
  const operations = [];
  for (const [featureId, data] of Object.entries(safeDeliverables)) {
    const serialized = JSON.stringify(data);
    const chunks = splitStringByBytes(serialized);
    if (chunks.length <= 1) {
      operations.push({
        type: 'set',
        ref: delivDoc(uid, projectId, featureId),
        payload: {
          ...data,
          updatedAt: serverTimestamp(),
        },
      });
      continue;
    }

    operations.push({
      type: 'set',
      ref: delivDoc(uid, projectId, featureId),
      payload: {
        __chunked: true,
        encoding: 'json',
        chunkCount: chunks.length,
        status: data?.status || 'done',
        updatedAt: serverTimestamp(),
      },
    });
    chunks.forEach((chunk, index) => {
      operations.push({
        type: 'set',
        ref: delivChunkDoc(uid, projectId, featureId, index),
        payload: {
          __deliverableChunk: true,
          featureId,
          index,
          text: chunk,
          updatedAt: serverTimestamp(),
        },
      });
    });
  }
  await commitBatchOperations(operations);
}

export async function loadProjectDeliverables(uid, projectId) {
  if (!db) return {};
  const snap = await getDocs(delivCol(uid, projectId));
  const map = {};
  const chunkedManifests = new Map();
  const chunkParts = new Map();

  for (const d of getSnapshotDocs(snap)) {
    const data = sanitizeCloudSnapshotData(d.data());
    if (data?.__deliverableChunk || String(d.id || '').startsWith(DELIVERABLE_CHUNK_PREFIX)) {
      const featureId = getChunkDocFeatureId(d.id, data);
      const index = Number.isInteger(data?.index) ? data.index : null;
      if (featureId && index !== null && typeof data?.text === 'string') {
        if (!chunkParts.has(featureId)) chunkParts.set(featureId, []);
        chunkParts.get(featureId)[index] = data.text;
      }
      continue;
    }

    if (data?.__chunked) {
      chunkedManifests.set(d.id, data);
      continue;
    }

    setOwnEnumerableData(map, d.id, data);
  }

  for (const [featureId, manifest] of chunkedManifests.entries()) {
    const expectedCount = Number(manifest.chunkCount) || 0;
    const parts = chunkParts.get(featureId) || [];
    const hasAllChunks =
      expectedCount > 0 &&
      Array.from({ length: expectedCount }, (_, index) => parts[index]).every((part) => typeof part === 'string');
    if (!hasAllChunks) {
      setOwnEnumerableData(map, featureId, {
        status: 'error',
        error: 'Saved deliverable chunks are incomplete. Regenerate this deliverable before exporting.',
      });
      continue;
    }
    try {
      setOwnEnumerableData(map, featureId, sanitizeCloudPayload(JSON.parse(parts.slice(0, expectedCount).join(''))));
    } catch {
      setOwnEnumerableData(map, featureId, {
        status: 'error',
        error: 'Saved deliverable chunks could not be restored. Regenerate this deliverable before exporting.',
      });
    }
  }
  return map;
}

/* ═══════════════════ Agent Preferences ═══════════════════ */

function agentPrefsDoc(uid) {
  return doc(db, 'users', uid, 'agentData', 'preferences');
}

export async function loadAgentPrefs(uid) {
  if (!db) return null;
  const snap = await getDoc(agentPrefsDoc(uid));
  return snap.exists() ? sanitizeCloudSnapshotData(snap.data()) : null;
}

export async function saveAgentPrefs(uid, prefs) {
  if (!db) return;
  const safePrefs = sanitizeCloudPayload(prefs);
  await setDoc(
    agentPrefsDoc(uid),
    {
      ...safePrefs,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/* ═══════════════════ Agent Memory ═══════════════════ */

function memoryCol(uid) {
  return collection(db, 'users', uid, 'agentData', 'memory', 'entries');
}
function memoryDoc(uid, id) {
  return doc(db, 'users', uid, 'agentData', 'memory', 'entries', id);
}

export async function loadAgentMemories(uid) {
  if (!db) return [];
  const snap = await getDocs(memoryCol(uid));
  return snap.docs.map((d) => ({ id: d.id, ...sanitizeCloudSnapshotData(d.data()) }));
}

export async function saveAgentMemory(uid, entry) {
  if (!db) return;
  const safeEntry = sanitizeCloudPayload(entry);
  const id = safeEntry.id || doc(collection(db, '_')).id;
  await setDoc(memoryDoc(uid, id), {
    ...safeEntry,
    id,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteAgentMemory(uid, id) {
  if (!db) return;
  await deleteDoc(memoryDoc(uid, id));
}

/* ═══════════════════ Agent Custom Tools (Macros) ═══════════════════ */

function customToolsCol(uid) {
  return collection(db, 'users', uid, 'agentData', 'customTools', 'entries');
}
function customToolDoc(uid, name) {
  return doc(db, 'users', uid, 'agentData', 'customTools', 'entries', name);
}

export async function loadCustomTools(uid) {
  if (!db) return [];
  const snap = await getDocs(customToolsCol(uid));
  return snap.docs.map((d) => ({ name: d.id, ...sanitizeCloudSnapshotData(d.data()) }));
}

export async function saveCustomTool(uid, tool) {
  if (!db) return;
  const safeTool = sanitizeCloudPayload(tool);
  // Use the tool name as the doc id so re-registering overwrites cleanly.
  await setDoc(customToolDoc(uid, safeTool.name), {
    ...safeTool,
    updatedAt: serverTimestamp(),
  });
  return safeTool.name;
}

export async function deleteCustomTool(uid, name) {
  if (!db) return;
  await deleteDoc(customToolDoc(uid, name));
}

/* ═══════════════════ Generate unique project ID ═══════════════════ */

export function newProjectId() {
  if (!db) return crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return doc(collection(db, '_')).id; // Firestore auto-ID
}
