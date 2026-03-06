/**
 * cloudStorage.js — Firestore CRUD helpers for user data.
 *
 * Collections:
 *   users/{uid}                                  ← profile + settings
 *   users/{uid}/customDeliverables/{id}          ← custom deliverable defs
 *   users/{uid}/projects/{projectId}             ← project metadata + courseMap
 *   users/{uid}/projects/{projectId}/deliverables/{featureId}  ← deliverable data
 */

import { db } from './firebase';
import {
  doc, collection, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch,
} from 'firebase/firestore';

/* ═══════════════════════ helpers ═══════════════════════ */

function userDoc(uid) { return doc(db, 'users', uid); }
function projectsCol(uid) { return collection(db, 'users', uid, 'projects'); }
function projectDoc(uid, pid) { return doc(db, 'users', uid, 'projects', pid); }
function delivCol(uid, pid) { return collection(db, 'users', uid, 'projects', pid, 'deliverables'); }
function delivDoc(uid, pid, fid) { return doc(db, 'users', uid, 'projects', pid, 'deliverables', fid); }
function customDelCol(uid) { return collection(db, 'users', uid, 'customDeliverables'); }
function customDelDoc(uid, id) { return doc(db, 'users', uid, 'customDeliverables', id); }

/* ═══════════════════ Profile ═══════════════════ */

export async function loadProfile(uid) {
  if (!db) return null;
  const snap = await getDoc(userDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile(uid, profile) {
  if (!db) return;
  await setDoc(userDoc(uid), {
    ...profile,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* ═══════════════════ Custom Deliverables ═══════════════════ */

export async function loadCustomDeliverables(uid) {
  if (!db) return {};
  const snap = await getDocs(customDelCol(uid));
  const map = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
}

export async function saveCustomDeliverable(uid, id, def) {
  if (!db) return;
  await setDoc(customDelDoc(uid, id), {
    ...def,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomDeliverable(uid, id) {
  if (!db) return;
  await deleteDoc(customDelDoc(uid, id));
}

/* ═══════════════════ Projects ═══════════════════ */

export async function listProjects(uid) {
  if (!db) return [];
  const q = query(projectsCol(uid), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      courseName: data.courseName || 'Untitled',
      semester: data.semester || '',
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt || 0),
      createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt || 0),
    };
  });
}

export async function loadProject(uid, projectId) {
  if (!db) return null;
  const snap = await getDoc(projectDoc(uid, projectId));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function saveProject(uid, projectId, projectData) {
  if (!db) return;
  // Separate deliverables out — they go to a subcollection
  const { deliverables, ...meta } = projectData;
  await setDoc(projectDoc(uid, projectId), {
    ...meta,
    updatedAt: serverTimestamp(),
    createdAt: meta.createdAt || serverTimestamp(),
  }, { merge: true });

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
  dSnap.forEach(d => batch.delete(d.ref));
  batch.delete(projectDoc(uid, projectId));
  await batch.commit();
}

/* ═══════════════════ Project Deliverables ═══════════════════ */

export async function saveProjectDeliverables(uid, projectId, deliverables) {
  if (!db) return;
  const batch = writeBatch(db);
  for (const [featureId, data] of Object.entries(deliverables)) {
    batch.set(delivDoc(uid, projectId, featureId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function loadProjectDeliverables(uid, projectId) {
  if (!db) return {};
  const snap = await getDocs(delivCol(uid, projectId));
  const map = {};
  snap.forEach(d => { map[d.id] = d.data(); });
  return map;
}

/* ═══════════════════ Agent Preferences ═══════════════════ */

function agentPrefsDoc(uid) { return doc(db, 'users', uid, 'agentData', 'preferences'); }

export async function loadAgentPrefs(uid) {
  if (!db) return null;
  const snap = await getDoc(agentPrefsDoc(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveAgentPrefs(uid, prefs) {
  if (!db) return;
  await setDoc(agentPrefsDoc(uid), {
    ...prefs,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* ═══════════════════ Agent Memory ═══════════════════ */

function memoryCol(uid) { return collection(db, 'users', uid, 'agentData', 'memory', 'entries'); }
function memoryDoc(uid, id) { return doc(db, 'users', uid, 'agentData', 'memory', 'entries', id); }

export async function loadAgentMemories(uid) {
  if (!db) return [];
  const snap = await getDocs(memoryCol(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveAgentMemory(uid, entry) {
  if (!db) return;
  const id = entry.id || doc(collection(db, '_')).id;
  await setDoc(memoryDoc(uid, id), {
    ...entry,
    id,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function deleteAgentMemory(uid, id) {
  if (!db) return;
  await deleteDoc(memoryDoc(uid, id));
}

/* ═══════════════════ Generate unique project ID ═══════════════════ */

export function newProjectId() {
  if (!db) return crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return doc(collection(db, '_')).id;   // Firestore auto-ID
}
