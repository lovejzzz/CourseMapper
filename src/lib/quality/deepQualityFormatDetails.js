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
