const ARTIFACT_KIND_PATTERNS = [
  [/\bdiscussion\b.*\bquiz\b|\bquiz\b.*\bdiscussion\b/, 'discussion-and-quiz'],
  [/\bdiscussion post\b|\bdiscussion\b/, 'discussion post'],
  [/\bquiz(?:zes)?\b/, 'quiz'],
  [/\bcheck for understanding\b|\blow-stakes check\b|\bcheck-in\b|\bcheck\b/, 'check'],
  [/\bmemo\b/, 'memo'],
  [/\bpresentation\b/, 'presentation'],
  [/\bportfolio\b/, 'portfolio'],
  [/\bexam\b|\bmidterm\b|\bfinal test\b/, 'exam'],
  [/\bessay\b|\bpaper\b/, 'paper'],
  [/\bnotebook\b|\blab\b|\bworksheet\b/, 'lab work'],
  [/\brecording\b/, 'recording'],
  [/\bperformance\b|\brehearsal\b/, 'performance'],
  [/\breflection\b/, 'reflection'],
  [/\bproject\b/, 'project'],
  [/\baction plan\b|\bplan\b/, 'plan'],
  [/\bbrief\b/, 'brief'],
  [/\breport\b/, 'report'],
  [/\bmap\b/, 'mapping work'],
  [/\banalysis\b/, 'analysis'],
];

export function artifactKindOf(artifactTitle = '') {
  const text = String(artifactTitle).toLowerCase();
  for (const [pattern, kind] of ARTIFACT_KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'artifact';
}

// Abstract lesson-language is not a submission genre. Letting the trailing
// noun in a long compiler title become the compact artifact reference created
// labels such as "the Week 11 lenses" and "the Week 14 limitation" across an
// otherwise polished package. Fall back to a real assessment genre instead.
const HEAD_NOUN_BLOCKLIST_RE =
  /^(?:week|lesson|session|module|unit|part|day|artifact|task|item|work|claim|concept|evidence|example|focus|lens|lenses|limitation|material|materials|reading|readings|resource|resources)$/;

export function titleHeadNoun(label) {
  const match = String(label || '')
    .replace(/[\s\d.)#-]+$/g, '')
    .match(/[A-Za-z][A-Za-z'-]*$/);
  const head = match ? match[0].toLowerCase() : '';
  if (head.length < 3 || HEAD_NOUN_BLOCKLIST_RE.test(head)) return '';
  return head;
}

const GENERIC_ARTIFACT_REFERENCE_NOUNS = [
  'lesson assessment',
  'evidence task',
  'application task',
  'practice check',
  'synthesis task',
  'decision brief',
  'reflection task',
  'source-use task',
  'planning task',
  'checkpoint task',
  'revision task',
  'case task',
];

function genericArtifactReference(lessonNumber = 0) {
  if (lessonNumber <= 0) return 'the recurring assessment task';
  const index = (lessonNumber - 1) % GENERIC_ARTIFACT_REFERENCE_NOUNS.length;
  return `the ${GENERIC_ARTIFACT_REFERENCE_NOUNS[index]}`;
}

export function shortReferenceForKind(kind, lessonNumber = 0, artifactTitle = '') {
  const week = lessonNumber > 0 ? `Week ${lessonNumber}` : 'weekly';
  if (kind === 'discussion-and-quiz') return `the ${week} discussion and quiz`;
  if (!kind || kind === 'artifact') {
    const head = titleHeadNoun(artifactTitle);
    if (head) return `the ${week} ${head}`;
    return genericArtifactReference(lessonNumber);
  }
  return `the ${week} ${kind || 'artifact'}`;
}

export function shortArtifactReference(artifactTitle = '', lessonNumber = 0) {
  return shortReferenceForKind(artifactKindOf(artifactTitle), lessonNumber, artifactTitle);
}
