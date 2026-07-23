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
