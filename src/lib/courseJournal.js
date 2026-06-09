/**
 * courseJournal.js — per-course decision journal (v0.9.2).
 *
 * The TA's memory of the working relationship on THIS course: design
 * decisions and their rationale, plus open threads the instructor deferred
 * ("revisit rubric weights"). Agent-written, user-visible (chat command),
 * included in the dynamic prompt so every conversation starts knowing the
 * story so far. Global taste lives in agentMemory; this is course-scoped.
 */

const STORAGE_KEY = 'coursemapper-course-journal';
const MAX_ENTRIES_PER_COURSE = 60;

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAll(journals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(journals));
  } catch {
    /* storage full or unavailable — journal is best-effort */
  }
}

function courseKey(courseName) {
  return String(courseName || 'untitled')
    .trim()
    .toLowerCase();
}

export function getJournal(courseName) {
  const all = loadAll();
  return Array.isArray(all[courseKey(courseName)]) ? all[courseKey(courseName)] : [];
}

/**
 * Append an entry: { kind: 'decision'|'thread', text, rationale?, status? }.
 * Threads start 'open' and can be closed by resolveThread.
 */
export function addJournalEntry(courseName, entry) {
  if (!entry?.text) return null;
  const all = loadAll();
  const key = courseKey(courseName);
  const journal = Array.isArray(all[key]) ? all[key] : [];
  const record = {
    id: `j-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    kind: entry.kind === 'thread' ? 'thread' : 'decision',
    text: String(entry.text).slice(0, 300),
    rationale: entry.rationale ? String(entry.rationale).slice(0, 300) : '',
    status: entry.kind === 'thread' ? 'open' : 'recorded',
    createdAt: Date.now(),
  };
  journal.push(record);
  all[key] = journal.slice(-MAX_ENTRIES_PER_COURSE);
  saveAll(all);
  return record;
}

export function resolveThread(courseName, idOrText) {
  const all = loadAll();
  const key = courseKey(courseName);
  const journal = Array.isArray(all[key]) ? all[key] : [];
  const target = journal.find(
    (entry) =>
      entry.kind === 'thread' &&
      entry.status === 'open' &&
      (entry.id === idOrText || entry.text.toLowerCase().includes(String(idOrText || '').toLowerCase())),
  );
  if (!target) return false;
  target.status = 'closed';
  target.closedAt = Date.now();
  saveAll(all);
  return true;
}

/** Compact prompt block: recent decisions + all open threads. */
export function buildJournalContext(courseName, { maxDecisions = 4 } = {}) {
  const journal = getJournal(courseName);
  if (journal.length === 0) return '';
  const openThreads = journal.filter((entry) => entry.kind === 'thread' && entry.status === 'open');
  const decisions = journal.filter((entry) => entry.kind === 'decision').slice(-maxDecisions);
  const lines = [];
  for (const decision of decisions) {
    lines.push(`  decided: ${decision.text}${decision.rationale ? ` — because ${decision.rationale}` : ''}`);
  }
  for (const thread of openThreads.slice(-4)) {
    lines.push(`  open thread: ${thread.text}`);
  }
  return lines.length > 0 ? lines.join('\n') : '';
}
