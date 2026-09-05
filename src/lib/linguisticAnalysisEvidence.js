export function hasLinguisticAnalysisEvidence(text = '') {
  const hasDomain =
    /\b(linguistics|language structure|phonetics|phonology|morphology|syntax|semantics|pragmatics|sociolinguistics|historical linguistics|language variation|language acquisition)\b/.test(
      text,
    );
  const hasPractice =
    /\b(minimal[-\s]pairs?|phonetic transcription|ipa|feature matrix|morpheme|morphological paradigm|constituency|syntax tree|parse tree|interlinear gloss|form[-\s]?gloss[-\s]?translation|language[-\s]data|corpus evidence|grammaticality judgment|dialect comparison|sound change|linguistic analysis)\b/.test(
      text,
    );
  return hasDomain && hasPractice;
}
