function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EXPLICIT_MUSIC_RE =
  /\b(?:music(?:al)?(?:\s+theory)?|aural\s+skills?|ear\s+training|harmony|melody|notation|pitch|semitones?)\b/i;
const STRONG_MUSIC_INTERVAL_RE =
  /\b(?:compound\s+intervals?|written\s+and\s+heard\s+intervals?|intervals?\s+(?:and\s+)?inversion|interval\s+quality|letter[-\s]?name\s+counting|sum\s+to\s+nine)\b/i;
const MUSIC_INTERVAL_IDENTITY_PATTERNS = [
  /\b(?:written|heard|aural|melodic|harmonic|simple|compound)\s+intervals?\b/i,
  /\binterval\s+(?:classification|quality|inversion)\b/i,
  /\binvert(?:ed|ing)?\s+intervals?\b/i,
  /\b(?:major|minor|perfect|augmented|diminished)\s+(?:second|third|fourth|fifth|sixth|seventh|octave)\b/i,
  /\bletter[-\s]?name\s+counting\b/i,
  /\bsum\s+to\s+nine\b/i,
];

const MUSIC_INTERVAL_SOURCE_ANCHOR_RE =
  /\b(?:music\s+theory|musical\s+intervals?|intervals?\s+in\s+music|interval\s*\(music\)|pitch(?:es)?|semitones?|octaves?|ear\s+training|aural\s+skills?|staff\s+notation|harmon(?:y|ic)|melod(?:y|ic)|tonal|chords?|scales?)\b/i;

const MUSIC_INTERVAL_FALSE_FRIEND_RE =
  /\b(?:post[-\s]?mortem|time\s+since\s+death|forensic|autolysis|biochemistry|pathology|confidence\s+intervals?|prediction\s+intervals?|training\s+intervals?|time\s+intervals?|temporal\s+intervals?|interval\s+arithmetic|interval\s+scheduling|uniform\s+interval|metronomes?|beats?\s+per\s+minute|bpm)\b/i;

export function isMusicIntervalCourseText(value) {
  const text = cleanText(value);
  if (!text) return false;
  if (EXPLICIT_MUSIC_RE.test(text) && /\bintervals?\b/i.test(text)) return true;
  if (STRONG_MUSIC_INTERVAL_RE.test(text)) return true;
  return MUSIC_INTERVAL_IDENTITY_PATTERNS.filter((pattern) => pattern.test(text)).length >= 2;
}

export function isMusicIntervalWeakSource(sourceText, courseText, conceptText = '') {
  const course = cleanText(`${courseText} ${conceptText}`);
  if (!isMusicIntervalCourseText(course)) return false;
  const source = cleanText(sourceText);
  if (!source) return true;
  if (MUSIC_INTERVAL_FALSE_FRIEND_RE.test(source)) return true;
  return !MUSIC_INTERVAL_SOURCE_ANCHOR_RE.test(source);
}
