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

// Finished-looking prose can still defer essential assignment logistics to a
// value that was never configured. Keep this separate from the repairable
// placeholder family above: these phrases need an instructor decision, not a
// deterministic text substitution.
export const INSTRUCTOR_CONFIGURATION_DEFERRAL_PATTERNS = [
  /\b(?:submission )?format (?:listed|specified|named) (?:for|in)\b/i,
  /\bmedium listed for (?:the|this) task\b/i,
  /\bformat and channel listed for (?:the|this) task\b/i,
  /\b(?:document, presentation, or recording form|product form) listed for (?:the|this) task\b/i,
  /\b(?:word, page, or time|length or time|length or duration|task-specific length or time) (?:limit|requirement|expectation|guidance|constraint)?\s*(?:listed|specified|provided)\b/i,
  /\b(?:course|local) citation (?:format|style|convention|rule|expectations?)\b/i,
  /\b(?:instructor|local) length (?:guidance|requirement|target)\b/i,
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

function findPatternMatches(value, patterns, { limit = 3 } = {}) {
  const haystack = stringifyForScan(value);
  const matches = [];
  const seen = new Set();

  for (const pattern of patterns) {
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

export function findPublishabilityPlaceholder(value) {
  return findPublishabilityPlaceholders(value, { limit: 1 })[0] || null;
}

export function findPublishabilityPlaceholders(value, { limit = 3 } = {}) {
  return findPatternMatches(value, PUBLISHABILITY_PLACEHOLDER_PATTERNS, { limit });
}

export function findInstructorConfigurationDeferrals(value, { limit = 3 } = {}) {
  return findPatternMatches(value, INSTRUCTOR_CONFIGURATION_DEFERRAL_PATTERNS, { limit });
}
