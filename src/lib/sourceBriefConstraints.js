const MIN_SESSION_MINUTES = 20;
const MAX_SESSION_MINUTES = 240;

function normalizeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES) return null;
  return minutes;
}

/**
 * Parse the compact values used by the generation UI (for example `50 min`
 * and `2 hr`) without treating unrelated numbers as a class duration.
 */
export function parseClassSessionMinutes(value) {
  const numeric = normalizeMinutes(value);
  if (numeric) return numeric;
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const minuteMatch = text.match(/^(\d{2,3})\s*(?:min|mins|minute|minutes)$/i);
  if (minuteMatch) return normalizeMinutes(minuteMatch[1]);
  const hourMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/i);
  if (!hourMatch) return null;
  return normalizeMinutes(Number(hourMatch[1]) * 60);
}

/**
 * Read only explicit class-session durations from the instructor's brief.
 * The patterns stay deliberately narrow so a phrase such as "four main
 * tones" or "15 lessons" can never silently become the class length.
 */
export function detectRequestedClassSessionMinutes(sourceBrief = '') {
  const text = String(sourceBrief || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const patterns = [
    /\b(\d{2,3})\s*[-–—]?\s*minute\s+(?:lesson|class|session|workshop)\b/i,
    /\b(?:lesson|class|session|workshop)\s+(?:lasting|runs?\s+for|of)\s+(\d{2,3})\s+minutes?\b/i,
    /\b(?:lesson|class|session|workshop)\s+(?:is|should be|must be)\s+(\d{2,3})\s+minutes?\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const minutes = normalizeMinutes(match?.[1]);
    if (minutes) return minutes;
  }
  return null;
}

/**
 * Resolve the classroom clock in user-intent order. A value explicitly
 * chosen in Configure generation wins; otherwise an explicit brief wins over
 * the visible model default. Keeping this policy in one helper prevents the
 * UI, compiler, finalizer, and package grader from using different clocks.
 */
export function resolveRequestedClassSessionMinutes({
  sourceBrief = '',
  explicitSessionLength = null,
  defaultSessionLength = null,
} = {}) {
  return (
    parseClassSessionMinutes(explicitSessionLength) ??
    detectRequestedClassSessionMinutes(sourceBrief) ??
    parseClassSessionMinutes(defaultSessionLength)
  );
}

/**
 * Detect the instructor's explicit evidence boundary. When this is true,
 * CurriculumOS and public-source retrieval must not append outside facts or
 * readings; the supplied brief and files are the complete evidence packet.
 */
export function requiresInstructorSourcesOnly(sourceBrief = '') {
  const text = String(sourceBrief || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return false;
  return (
    /\buse only (?:these|the following|the) instructor[- ]provided facts?\b/i.test(text) ||
    /\buse only (?:these|the following) (?:facts?|sources?|materials?|details?)\b/i.test(text) ||
    /\bdo not (?:add|introduce|use|consult) (?:any )?(?:outside|external|additional) (?:facts?|sources?|materials?|information)\b/i.test(
      text,
    ) ||
    /\bno (?:outside|external|additional) (?:facts?|sources?|materials?|information)\b/i.test(text)
  );
}

const INSTRUCTION_SENTENCE_RE =
  /^(?:learners?|students?|instructors?)\s+(?:must|should|will|need)|^(?:build|create|design|include|produce|generate|write|make|keep|avoid|do not)\b/i;

/**
 * Recover only the facts the instructor explicitly labels as provided facts.
 * This is intentionally not a general summarizer: it preserves complete
 * source sentences verbatim, stops when task directions begin, and is used
 * only under the explicit source-only boundary.
 */
export function extractInstructorProvidedFacts(sourceBrief = '') {
  if (!requiresInstructorSourcesOnly(sourceBrief)) return [];
  const text = String(sourceBrief || '')
    .replace(/\s+/g, ' ')
    .trim();
  const marker = text.match(/\b(?:instructor[- ]provided|following|these) facts?\s*:\s*/i);
  if (!marker?.[0]) return [];
  const tail = text.slice((marker.index || 0) + marker[0].length);
  const sentences = tail.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const facts = [];
  for (const sentence of sentences) {
    const fact = sentence.trim();
    if (!fact || INSTRUCTION_SENTENCE_RE.test(fact)) break;
    if (fact.length < 12 || fact.length > 260) continue;
    facts.push(fact);
    if (facts.length >= 8) break;
  }
  return facts;
}

export function analyzeSourceBriefConstraints(sourceBrief = '') {
  return {
    sessionMinutes: detectRequestedClassSessionMinutes(sourceBrief),
    instructorSourcesOnly: requiresInstructorSourcesOnly(sourceBrief),
    instructorProvidedFacts: extractInstructorProvidedFacts(sourceBrief),
  };
}
