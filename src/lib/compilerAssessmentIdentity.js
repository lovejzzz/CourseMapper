/**
 * Collapse exact compiler-owned classroom directions into reusable artifact
 * identities. Course Map cells keep the complete instructional sentence;
 * compiled artifact labels keep only the noun phrase.
 *
 * This stays separate from compilerText.js so small compiler-copy chunks that
 * only need generic text primitives do not inherit this specialized matcher.
 */
export function compactCompilerOwnedAssessmentIdentity(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /\s+comparative close-reading:\s*compare two passages by the selected writers(?:,\s*synthesize one claim(?:,\s*and support it with(?:\s+quoted(?:\s+details)?)?)?)?\.?$/i,
      ' close-reading check',
    )
    .replace(
      /\s+comparison:\s*connect two passages, authors, or traditions(?:\s+through a defensible claim)?\.?$/i,
      ' comparison',
    )
    .replace(
      /\s+evidence memo:\s*explain how form, language, or context(?:\s+changes the reading)?\.?$/i,
      ' evidence memo',
    )
    .replace(
      /\s+interpretive response:\s*test one reading against a specific passage(?:\s+and one alternative)?\.?$/i,
      ' interpretive response',
    )
    .replace(/\s+application check:\s*choose evidence that supports one course decision\.?$/i, ' evidence check')
    .replace(
      /\s+transfer task:\s*explain one example, one source detail, and one limitation\.?$/i,
      ' evidence application',
    )
    .replace(/\s+exit note connecting the activity to one visible product\.?$/i, ' exit reflection')
    .replace(/\s+short response that names the claim, example, and next question\.?$/i, ' short analysis');
}
const EXPLICIT_CODE_LAB_IDENTITY_RE =
  /\b(?:programming|computational|python|jupyter)\s+(?:lab|assignment|exercise|project)\b/i;
const DOCUMENT_ARTIFACT_RE = /\b(?:memo|brief|report|essay|proposal|plan|reflection|presentation)\b/i;
const EXECUTABLE_ARTIFACT_RE =
  /\b(?:notebooks?|scripts?|source code|unit tests?|test suite|assertions?|debugging|refactor(?:ing)?)\b/i;
const CODE_LAB_SIGNAL_PATTERNS = [
  /\b(?:computational|programming|coding)\b/i,
  /\b(?:python|jupyter)\b/i,
  /\b(?:notebooks?|scripts?|source code)\b/i,
  /\b(?:repository|commits?|pull request|implementation|debugging|refactor)\b/i,
  /\b(?:unit tests?|test suite|assertions?|verification run)\b/i,
];

export function isCodeLabAssessmentIdentity(value, kind = '') {
  if (kind === 'exam' || kind === 'oral') return false;
  const identity = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (DOCUMENT_ARTIFACT_RE.test(identity) && !EXECUTABLE_ARTIFACT_RE.test(identity)) return false;
  if (EXPLICIT_CODE_LAB_IDENTITY_RE.test(identity)) return true;
  return CODE_LAB_SIGNAL_PATTERNS.filter((pattern) => pattern.test(identity)).length >= 2;
}
