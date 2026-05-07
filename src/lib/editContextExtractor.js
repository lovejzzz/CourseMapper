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

  return fieldParts
    .map((seg, i) => {
      if (typeof seg === 'number') {
        // Array index — attach to previous as [n] WITHOUT a space
        return `[${seg}]`;
      }
      // Camel-case to space-separated label
      const label = String(seg)
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toLowerCase())
        .trim();
      // If previous segment was a number, we need a space before the next property
      const prevIsNumber = i > 0 && typeof fieldParts[i - 1] === 'number';
      return i === 0 || prevIsNumber ? ` ${label}` : ` ${label}`;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/ \]/g, ']')
    .replace(/\[ /g, '[')
    .trim();
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
 * Find the first changed leaf field between two objects (max depth 3).
 * Returns a string like 'exemplary: "old" → "new"' or null if no diff found.
 */
function diffFirstLeaf(oldObj, newObj, depth = 0) {
  if (depth > 3 || !oldObj || !newObj) return null;
  if (typeof oldObj !== 'object' || typeof newObj !== 'object') return null;

  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    const ov = oldObj[key];
    const nv = newObj[key];
    if (ov === nv) continue;
    if (typeof ov !== 'object' && typeof nv !== 'object') {
      return `${key}: "${trunc(String(ov ?? ''), 40)}" → "${trunc(String(nv ?? ''), 40)}"`;
    }
    if (typeof ov === 'object' && typeof nv === 'object' && !Array.isArray(ov) && !Array.isArray(nv)) {
      const nested = diffFirstLeaf(ov, nv, depth + 1);
      if (nested) return `${key}.${nested}`;
    }
  }
  return null;
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

    const label = pathToLabel(path);

    // ── Array diffs ──
    if (Array.isArray(newVal) && Array.isArray(oldVal)) {
      const added = newVal.length - oldVal.length;
      if (added !== 0) {
        const full = `${label}: ${added > 0 ? 'added' : 'removed'} ${Math.abs(added)} item(s) (now ${newVal.length})`;
        return full.length <= 200 ? full : full.slice(0, 199) + '…';
      }
      // Same length — check reorder: same items, different order
      const oldJSON = oldVal.map((v) => JSON.stringify(v));
      const newJSON = newVal.map((v) => JSON.stringify(v));
      if (
        [...oldJSON].sort().join('\0') === [...newJSON].sort().join('\0') &&
        oldJSON.join('\0') !== newJSON.join('\0')
      ) {
        return `${label}: reordered ${newVal.length} items`;
      }
      // Same length, different content — find first changed item
      for (let i = 0; i < newVal.length; i++) {
        if (JSON.stringify(oldVal[i]) !== JSON.stringify(newVal[i])) {
          if (typeof oldVal[i] === 'object' && typeof newVal[i] === 'object') {
            const itemDiff = diffFirstLeaf(oldVal[i], newVal[i]);
            if (itemDiff) {
              const full = `${label}[${i}].${itemDiff}`;
              return full.length <= 200 ? full : full.slice(0, 199) + '…';
            }
          }
          return `${label}[${i}]: modified`;
        }
      }
      return `${label}: ${newVal.length} items modified`;
    }

    // ── Object diffs ──
    if (
      typeof newVal === 'object' &&
      newVal !== null &&
      typeof oldVal === 'object' &&
      oldVal !== null &&
      !Array.isArray(newVal) &&
      !Array.isArray(oldVal)
    ) {
      const leafDiff = diffFirstLeaf(oldVal, newVal);
      if (leafDiff) {
        const full = `${label}.${leafDiff}`;
        return full.length <= 200 ? full : full.slice(0, 199) + '…';
      }
      return `${label}: modified`;
    }

    // ── Primitive diffs (original logic) ──
    if (typeof newVal === 'object' || typeof oldVal === 'object') return null;

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
