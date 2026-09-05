/**
 * agentMemory.js — Persistent agent learning system.
 *
 * The agent accumulates memories about the user across sessions:
 * - Teaching preferences (pedagogy style, assessment preferences, etc.)
 * - Course design patterns (common structures, workflows)
 * - User feedback patterns (what they accept/reject/edit)
 * - Institutional context (accreditation, program outcomes)
 *
 * Storage: localStorage (immediate) + Firestore (persistent, synced on sign-in).
 * Each memory has: id, category, content, importance (1-5), createdAt, accessCount.
 */

import {
  loadAgentMemories as cloudLoad,
  saveAgentMemory as cloudSave,
  deleteAgentMemory as cloudDelete,
} from './cloudStorage';

const STORAGE_KEY = 'coursemapper-agent-memory';
const MAX_LOCAL_MEMORIES = 100;

// ── Categories ────────────────────────────────────────────────────────────────

export const MEMORY_CATEGORIES = {
  voice_style: "Instructor's Writing Voice",
  teaching_style: 'Teaching Style & Preferences',
  assessment: 'Assessment Preferences',
  course_design: 'Course Design Patterns',
  feedback: 'User Feedback & Edit Patterns',
  institutional: 'Institutional Context',
  general: 'General Preferences',
};

// ── Local storage helpers ─────────────────────────────────────────────────────

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocal(memories) {
  try {
    // Keep most important + most recent, capped
    const sorted = [...memories].sort((a, b) => {
      const scoreA = (a.importance || 3) * 2 + (a.accessCount || 0);
      const scoreB = (b.importance || 3) * 2 + (b.accessCount || 0);
      return scoreB - scoreA;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.slice(0, MAX_LOCAL_MEMORIES)));
  } catch {
    // localStorage full — silently ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get all memories, sorted by importance then recency. */
export function getMemories() {
  return loadLocal().sort((a, b) => {
    const imp = (b.importance || 3) - (a.importance || 3);
    if (imp !== 0) return imp;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/** Get memories by category. */
export function getMemoriesByCategory(category) {
  return getMemories().filter((m) => m.category === category);
}

/** Search memories by keyword (fuzzy multi-token match with relevance scoring). */
export function searchMemories(query) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return getMemories();

  return getMemories()
    .map((m) => {
      const text = `${m.content || ''} ${m.category || ''}`.toLowerCase();
      // Score: count matching tokens + bonus for exact substring match
      let score = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
      if (text.includes(query.toLowerCase())) score += 2; // exact phrase bonus
      return { ...m, _score: score };
    })
    .filter((m) => m._score > 0)
    .sort((a, b) => b._score - a._score || (b.importance || 3) - (a.importance || 3));
}

/**
 * Add a new memory. Returns the memory object with generated id.
 * @param {object} opts — { category, content, importance?, uid? }
 */
export function addMemory({ category, content, importance = 3, uid = null }) {
  const memories = loadLocal();

  // Deduplicate: if a very similar memory exists, update it instead
  const existing = memories.find((m) => m.category === category && m.content === content);
  if (existing) {
    existing.accessCount = (existing.accessCount || 0) + 1;
    existing.importance = Math.max(existing.importance || 3, importance);
    existing.updatedAt = Date.now();
    saveLocal(memories);
    // Fire-and-forget cloud sync
    if (uid) cloudSave(uid, existing).catch(() => {});
    return existing;
  }

  const memory = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    category: category || 'general',
    content,
    importance,
    accessCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  memories.push(memory);
  saveLocal(memories);

  // Fire-and-forget cloud sync
  if (uid) cloudSave(uid, memory).catch(() => {});

  return memory;
}

/** Update an existing memory's content or importance. */
export function updateMemory(id, updates, uid = null) {
  const memories = loadLocal();
  const mem = memories.find((m) => m.id === id);
  if (!mem) return null;

  if (updates.content !== undefined) mem.content = updates.content;
  if (updates.importance !== undefined) mem.importance = updates.importance;
  if (updates.category !== undefined) mem.category = updates.category;
  mem.updatedAt = Date.now();

  saveLocal(memories);
  if (uid) cloudSave(uid, mem).catch(() => {});
  return mem;
}

/** Delete a memory. */
export function deleteMemory(id, uid = null) {
  const memories = loadLocal();
  const filtered = memories.filter((m) => m.id !== id);
  saveLocal(filtered);
  if (uid) cloudDelete(uid, id).catch(() => {});
  return true;
}

/** Mark a memory as accessed (bumps accessCount for relevance scoring). */
export function touchMemory(id) {
  const memories = loadLocal();
  const mem = memories.find((m) => m.id === id);
  if (mem) {
    mem.accessCount = (mem.accessCount || 0) + 1;
    saveLocal(memories);
  }
}

/**
 * Record a user edit pattern — called when user edits AI-generated content.
 * Automatically aggregates into a feedback memory.
 */
export function recordEditPattern({ featureId, field, action, uid = null, path = null, lessonIndex = null }) {
  const category = 'feedback';
  const fieldLabel = field || (Array.isArray(path) ? path.join('.') : path);
  const content = `User frequently ${action} ${fieldLabel ? `the "${fieldLabel}" field` : 'content'} in ${featureId}.`;

  // Check for existing pattern memory
  const memories = loadLocal();
  const existing = memories.find(
    (m) =>
      m.category === category &&
      m.meta?.featureId === featureId &&
      m.meta?.field === fieldLabel &&
      m.meta?.action === action,
  );

  if (existing) {
    existing.accessCount = (existing.accessCount || 0) + 1;
    // Boost importance as pattern is reinforced
    if (existing.accessCount >= 5) existing.importance = 4;
    if (existing.accessCount >= 10) existing.importance = 5;
    existing.updatedAt = Date.now();
    saveLocal(memories);
    if (uid) cloudSave(uid, existing).catch(() => {});
    return existing;
  }

  const memory = {
    id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    category,
    content,
    importance: 2, // starts low, grows with repetition
    accessCount: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { featureId, field: fieldLabel, action, path, lessonIndex },
  };
  memories.push(memory);
  saveLocal(memories);
  if (uid) cloudSave(uid, memory).catch(() => {});
  return memory;
}

/**
 * Build a concise memory summary for injection into the agent system prompt.
 * Returns a string with the most important memories, capped at ~1500 chars.
 */
export function buildMemoryContext() {
  const memories = getMemories();
  if (memories.length === 0) return '';

  const lines = [];
  let charCount = 0;
  const MAX_CHARS = 1500;

  for (const m of memories) {
    const cat = MEMORY_CATEGORIES[m.category] || m.category;
    const line = `- [${cat}] ${m.content}`;
    if (charCount + line.length > MAX_CHARS) break;
    lines.push(line);
    charCount += line.length + 1;
  }

  return lines.join('\n');
}

/**
 * Merge cloud memories with local on sign-in. Cloud wins on conflict (by id).
 */
export async function mergeCloudMemories(uid) {
  if (!uid) return;
  try {
    const cloudMemories = await cloudLoad(uid);
    if (!cloudMemories || cloudMemories.length === 0) return;

    const local = loadLocal();
    const localMap = new Map(local.map((m) => [m.id, m]));

    // Merge: cloud wins on same id (by updatedAt), add new cloud entries
    for (const cm of cloudMemories) {
      const localMem = localMap.get(cm.id);
      if (!localMem) {
        localMap.set(cm.id, cm);
      } else {
        // Cloud wins if newer
        const cloudTime = cm.updatedAt?.toDate?.() || new Date(cm.updatedAt || 0);
        const localTime = localMem.updatedAt || 0;
        if (cloudTime.getTime() > localTime) {
          localMap.set(cm.id, { ...cm, updatedAt: cloudTime.getTime() });
        }
      }
    }

    saveLocal(Array.from(localMap.values()));

    // Push any local-only memories to cloud
    for (const [id, mem] of localMap) {
      if (!cloudMemories.find((cm) => cm.id === id)) {
        cloudSave(uid, mem).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[AgentMemory] cloud merge failed:', e);
  }
}

/**
 * Merge cloud agent preferences with local. Cloud wins on conflict.
 */
export async function mergeCloudAgentPrefs(uid) {
  if (!uid) return;
  try {
    const { loadAgentPrefs, saveAgentPrefs } = await import('./cloudStorage');
    const cloudPrefs = await loadAgentPrefs(uid);
    if (!cloudPrefs) return;

    const local = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || '{}');
    // Cloud wins, then local fills gaps
    const merged = { ...local, ...cloudPrefs };
    delete merged.updatedAt; // remove Firestore metadata
    localStorage.setItem('coursemapper-agent-prefs', JSON.stringify(merged));

    // Push merged back to cloud
    saveAgentPrefs(uid, merged).catch(() => {});
  } catch (e) {
    console.warn('[AgentMemory] prefs merge failed:', e);
  }
}
