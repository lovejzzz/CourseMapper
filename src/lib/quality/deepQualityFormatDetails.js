export const ENRICHED_DECK_TITLE_PATTERNS = [
  /^Worked example: /i,
  /^Common pitfalls in /i,
  /^How Experts Think/i,
  /:\s*core model$/i,
  /^What the evidence shows about\b/i,
  /^Test\b.+\bwith a concrete case$/i,
];

export const PACKAGE_TEMPLATE_PHRASES = [
  { label: '"Lesson N application check"', pattern: /\bLesson\s+\d+\s+application check\b/gi, threshold: 3 },
  { label: '"Week N covering"', pattern: /\bWeek\s+\d+\s+covering\b/gi, threshold: 6 },
  {
    label: '"Instructor notes and selected readings"',
    pattern: /\bInstructor notes and selected readings\b/gi,
    threshold: 4,
  },
  {
    label: '"Course LMS and standard document tools"',
    pattern: /\bCourse LMS and standard document tools\b/gi,
    threshold: 4,
  },
  {
    label: '"Build a working understanding"',
    pattern: /\bBuild a working understanding of\b/gi,
    threshold: 4,
  },
  { label: '"Short formative check covering"', pattern: /\bShort formative check covering\b/gi, threshold: 4 },
  { label: '"named reading or activity"', pattern: /\bnamed reading or activity\b/gi, threshold: 1 },
  { label: '"the tool used"', pattern: /\bthe tool used\b/gi, threshold: 1 },
  {
    label: '"instructor-provided resource"',
    pattern: /\binstructor-provided resource\b/gi,
    threshold: 12,
  },
  {
    label: '"instructor-provided materials"',
    pattern: /\binstructor-provided materials\b/gi,
    threshold: 1,
  },
  {
    label: '"instructor-selected reading"',
    pattern: /\binstructor-selected\b[^.\n]{0,80}\breading\b/gi,
    threshold: 1,
  },
  {
    label: '"specific source packet"',
    pattern: /\bspecific source packet\b/gi,
    threshold: 1,
  },
];

export const CLIPPED_SLIDE_INSTRUCTION_RE =
  /(?:\bPrerequisite concept:\s*\d+\.|(?:\bapplying|\busing|\bcomparing|\btesting)\s+(?:theoretical|conceptual|empirical|historical|quantitative|qualitative)\.)$/i;

// Keep the grader's line-boundary and truncated-clause mechanics in this
// format-only leaf. Operator enumerations and quoted tokens are complete;
// connective tails and verbs dangling after auxiliaries are real cuts.
const FUNCTION_WORD_TAIL = new Set([
  'and',
  'or',
  'but',
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'at',
  'as',
  'into',
  'that',
  'which',
  'who',
  'when',
  'while',
  'through',
  'over',
  'under',
  'between',
  'about',
  'against',
  'before',
  'after',
  'than',
  'then',
  'because',
  'should',
  'must',
  'can',
  'will',
  'may',
  'is',
  'are',
  'was',
  'were',
  'be',
]);
const BARE_VERB_TAIL = new Set([
  'run',
  'point',
  'asks',
  'move',
  'show',
  'name',
  'list',
  'use',
  'apply',
  'explain',
  'compare',
  'identify',
  'plan',
]);
const TAIL_AUXILIARIES = new Set(['should', 'must', 'can', 'will', 'may', 'to', 'would', 'could', 'might', 'shall']);
const TRAILING_OPERATOR_ENUM = /\b(?:and|or)(?:\s*[/&]\s*|\s+)(?:and|or)\s*$/i;
const QUOTED_OPERATOR_TAIL = /['`][^'`]{1,12}['`]\s*$/;

export function endsMidClause(line) {
  const text = String(line);
  if (TRAILING_OPERATOR_ENUM.test(text) || QUOTED_OPERATOR_TAIL.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const last = words[words.length - 1] || '';
  const prev = words[words.length - 2] || '';
  if (FUNCTION_WORD_TAIL.has(last)) return true;
  if (!BARE_VERB_TAIL.has(last)) return false;
  return TAIL_AUXILIARIES.has(prev) || /:\s+[a-z]+\s*$/.test(text);
}

export function formatScanUnits(file) {
  const units = [];
  const push = (raw) => {
    const value = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (value) units.push(value);
  };
  if (file.kind === 'xlsx') {
    for (const cell of file.cellTexts || []) for (const sub of String(cell).split('\n')) push(sub);
  } else {
    for (const paragraph of file.paragraphs || []) push(paragraph);
  }
  return units;
}
