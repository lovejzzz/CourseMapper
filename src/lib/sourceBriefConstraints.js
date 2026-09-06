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
    /\b(\d{2,3})\s*[-–—]?\s*minute\s+(?:(?!minutes?\b)[\p{L}-]+\s+){0,4}(?:lesson|class|session|workshop)\b/iu,
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
 * source wording, stops when task directions begin, and normalizes list
 * punctuation. Providing facts and prohibiting outside research are separate
 * choices: the former must not require the latter's special wording.
 */
export function extractInstructorProvidedFacts(sourceBrief = '') {
  const text = String(sourceBrief || '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const marker =
    text.match(/\b(?:source|instructor[- ]provided|provided|following|these) facts?\s*:\s*/i) ||
    text.match(/\buse only (?:these |the )?(?:supplied|provided) facts?[.:]\s*/i);
  if (!marker?.[0]) return [];
  let tail = text.slice((marker.index || 0) + marker[0].length);
  const numberedStart = tail.search(/^\s*1[.)]\s+/m);
  const numbered = numberedStart >= 0;
  if (numbered) tail = tail.slice(numberedStart);
  // Sentence segmentation preserves decimals (0.80), initials and other
  // internal periods. Explicit bullets and semicolons also delimit facts.
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  // A numbered source record can contain linked clauses (group conditions,
  // measured outcome, causal limit). Do not sever those relationships at a
  // semicolon or mistake the list number for a sentence.
  const sentences = numbered
    ? tail.split(/\n+/)
    : tail.split(/\n+|;\s+/).flatMap((line) => [...segmenter.segment(line)].map((s) => s.segment));
  const facts = [];
  for (const sentence of sentences) {
    let fact = sentence
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!fact) continue;
    if (INSTRUCTION_SENTENCE_RE.test(fact) || /^(?:learning objectives?|assessment|task|instructions?)\s*:/i.test(fact))
      break;
    if (fact.length < 12 || fact.length > 400) continue;
    if (!/[.!?]$/.test(fact)) fact += '.';
    // A short continuation such as "16 completed it" needs its preceding
    // subject. Keep the source clauses together, without inventing a referent.
    if (fact.length < 20 && facts.length > 0 && facts.at(-1).length + fact.length < 398) {
      facts[facts.length - 1] = `${facts.at(-1).replace(/[.!?]$/, '')}; ${fact}`;
      continue;
    }
    facts.push(fact);
    if (facts.length >= 8) break;
  }
  return facts;
}

/** A single-session brief can explicitly name its objective after a label
 * or the introductory lesson colon. Never distribute that objective across
 * an inferred multi-session sequence. */
export function extractSingleLessonObjectives(sourceBrief = '') {
  const text = String(sourceBrief || '')
    .replace(/\s+/g, ' ')
    .trim();
  const labeled = text.match(/\b(?:learning objectives?|learning outcomes?)\s*:\s*/i);
  const firstSentence = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)][0]?.segment || '';
  const intro = firstSentence.match(/\b(?:lesson|class|session|workshop)\b[^:]*:\s*/i);
  const marker = labeled || intro;
  if (!marker) return [];
  const tail = (labeled ? text : firstSentence).slice(marker.index + marker[0].length);
  const objective = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(tail)][0]?.segment.trim() || '';
  if (
    !/^(?:calculate|compute|compare|distinguish|explain|identify|analy[sz]e|evaluate|design|solve|interpret|demonstrate|apply|use|describe|write|create|measure|summarize)\b/i.test(
      objective,
    )
  )
    return [];
  return objective.length >= 20 && objective.length <= 300 ? [objective] : [];
}

export function analyzeSourceBriefConstraints(sourceBrief = '') {
  return {
    sessionMinutes: detectRequestedClassSessionMinutes(sourceBrief),
    instructorSourcesOnly: requiresInstructorSourcesOnly(sourceBrief),
    instructorProvidedFacts: extractInstructorProvidedFacts(sourceBrief),
  };
}
