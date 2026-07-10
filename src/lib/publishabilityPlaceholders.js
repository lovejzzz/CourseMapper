export const PUBLISHABILITY_PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bto be determined\b/i,
  /explanation needed/i,
  /distractor rationale needed/i,
  /lorem ipsum/i,
  /model response required/i,
  /\b(?:this|generic|sample|unresolved) placeholder (?:text|content)\b/i,
  /\breplace (?:this )?placeholder\b/i,
  /\[(?:verify|tbd)[^\]]*\]/i,
  /\[(?:instructor|office)[^\]]*\]/i,
  /\[suggested - verify before adoption\]/i,
  /\[no edition\]/i,
  /\[semester year\]/i,
  /\[institutional [^\]]+\]/i,
  /\[(?:remember|understand|apply|analyze|evaluate|create)(?:[^\]]*)\]/i,
  /Week or Module \[Topic\]/i,
  /Learning Objective:\s*Describe what students will need/i,
  /Provide supporting resources for the content\s*&\s*instruction/i,
  /Ask yourself:\s*Is everything in this row aligned and coherent\?/i,
];

function globalize(pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function stringifyForScan(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function findPublishabilityPlaceholder(value) {
  return findPublishabilityPlaceholders(value, { limit: 1 })[0] || null;
}

export function findPublishabilityPlaceholders(value, { limit = 3 } = {}) {
  const haystack = stringifyForScan(value);
  const matches = [];
  const seen = new Set();

  for (const pattern of PUBLISHABILITY_PLACEHOLDER_PATTERNS) {
    for (const match of haystack.matchAll(globalize(pattern))) {
      const found = match[0];
      const key = found.toLowerCase();
      if (!found || seen.has(key)) continue;
      seen.add(key);
      matches.push(found);
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}
