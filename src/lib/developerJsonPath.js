export function parseJsonPath(path) {
  const source = String(path || '').trim();
  if (!source || source === 'root') return [];
  const segments = [];
  const pattern = /([^[.\]]+)|\[(\d+)\]/g;
  let match = pattern.exec(source);
  while (match) {
    if (match[1] !== undefined) segments.push(match[1]);
    else segments.push(Number(match[2]));
    match = pattern.exec(source);
  }
  return segments;
}

function stripSectionRoot(segments, sectionId) {
  const [first, ...rest] = segments;
  if (sectionId === 'courseMap' && first === 'courseMap') return rest;
  if (sectionId === 'deliverables' && first === 'deliverables') return rest;
  if (sectionId === 'raw') return segments;
  return segments;
}

function samePath(left, right) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function targetStringSegment(segments) {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (typeof segments[index] === 'string') return segments[index];
  }
  return '';
}

function collectKeyPaths(value, keyName, path = [], paths = []) {
  if (!value || typeof value !== 'object') return paths;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectKeyPaths(item, keyName, [...path, index], paths));
    return paths;
  }

  Object.keys(value).forEach((key) => {
    const childPath = [...path, key];
    if (key === keyName) paths.push(childPath);
    collectKeyPaths(value[key], keyName, childPath, paths);
  });
  return paths;
}

function findNthKeyOffset(text, keyName, occurrenceIndex) {
  if (!keyName) return -1;
  const escapedKey = JSON.stringify(keyName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedKey}\\s*:`, 'g');
  let match = pattern.exec(text);
  let index = 0;
  while (match) {
    if (index === occurrenceIndex) return match.index;
    index += 1;
    match = pattern.exec(text);
  }
  return -1;
}

export function offsetToLineColumn(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset || 0, String(text || '').length));
  const before = String(text || '').slice(0, safeOffset);
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

export function findJsonPathLocation(text, path, sectionId = 'raw') {
  const source = String(text || '');
  const parsed = JSON.parse(source);
  const segments = stripSectionRoot(parseJsonPath(path), sectionId);
  const keyName = targetStringSegment(segments);

  if (!keyName) {
    return {
      index: 0,
      endIndex: Math.min(source.length, 1),
      ...offsetToLineColumn(source, 0),
    };
  }

  const keyPaths = collectKeyPaths(parsed, keyName);
  const occurrenceIndex = Math.max(0, keyPaths.findIndex(candidate => samePath(candidate, segments)));
  let index = findNthKeyOffset(source, keyName, occurrenceIndex);

  if (index < 0) {
    const fallback = source.indexOf(JSON.stringify(keyName));
    index = fallback >= 0 ? fallback : 0;
  }

  const keyTokenLength = JSON.stringify(keyName).length;
  return {
    index,
    endIndex: Math.min(source.length, index + keyTokenLength),
    ...offsetToLineColumn(source, index),
  };
}
