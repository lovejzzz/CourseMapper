/**
 * editContextExtractor.js
 *
 * Pure synchronous utility: given old data, new data, and the edit path,
 * produce a short human-readable string describing what the instructor changed.
 *
 * Used to build an edit-aware constraint in the AI prompt so the AI knows
 * exactly what to update rather than regenerating from scratch.
 *
 * Examples:
 *   'homework: "3 homeworks" → "4 homeworks"'
 *   'objectives[2]: "Students will understand..." → "Students will analyze..."'
 *   'lessonTitle: "Introduction" → "Advanced Introduction"'
 */

/**
 * Walk a path into a nested object/array and return the leaf value.
 * Returns undefined if the path is invalid.
 */
function getAtPath(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Convert a path segment into a human-readable field label.
 * e.g. ['lessonPlans', 0, 'objectives', 2] → 'objectives[2]'
 *      ['studyGuides', 1, 'summary']       → 'summary'
 *      ['assignments', 0, 'description']   → 'description'
 */
function pathToLabel(path) {
  // path[0] = array key (lessonPlans, studyGuides, etc.) — skip it
  // path[1] = lesson index — skip it
  // path[2+] = field path inside the lesson
  const fieldParts = path.slice(2);
  if (fieldParts.length === 0) return 'lesson';

  return fieldParts.map((seg, i) => {
    if (typeof seg === 'number') {
      // Array index — attach to previous as [n]
      return `[${seg}]`;
    }
    // Camel-case to space-separated label
    const label = String(seg).replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toLowerCase()).trim();
    return i === 0 ? label : ` ${label}`;
  }).join('').replace(/\s+/g, ' ').trim();
}

/**
 * Truncate a string to maxLen chars, appending '…' if cut.
 */
function trunc(str, maxLen = 80) {
  if (!str) return '';
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

/**
 * Extract a human-readable edit context string from old → new data.
 *
 * @param {any}      oldData  — The deliverable data BEFORE the edit
 * @param {any}      newData  — The deliverable data AFTER the edit
 * @param {Array}    path     — Edit path e.g. ['lessonPlans', 0, 'homework']
 * @returns {string|null}     — e.g. 'homework: "3 homeworks" → "4 homeworks"'
 *                              Returns null if the change can't be meaningfully described
 */
export function extractEditContext(oldData, newData, path) {
  if (!path || path.length < 2) return null;
  if (!oldData || !newData) return null;

  try {
    const oldVal = getAtPath(oldData, path);
    const newVal = getAtPath(newData, path);

    // Nothing changed (debounce fired without actual change)
    if (oldVal === newVal) return null;

    // Only handle primitive leaf values — objects/arrays are too complex to diff usefully
    if (typeof newVal === 'object' || Array.isArray(newVal)) return null;
    if (typeof oldVal === 'object' || Array.isArray(oldVal)) return null;

    const label = pathToLabel(path);
    const oldStr = oldVal != null ? trunc(String(oldVal)) : '(empty)';
    const newStr = newVal != null ? trunc(String(newVal)) : '(empty)';

    if (oldStr === newStr) return null;

    // Full context string — truncated to ~200 chars total
    const full = `${label}: "${oldStr}" → "${newStr}"`;
    return full.length <= 200 ? full : full.slice(0, 199) + '…';
  } catch {
    return null;
  }
}
