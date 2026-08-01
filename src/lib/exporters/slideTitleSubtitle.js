const INSTRUCTIONAL_CLAUSE_VERB_RE =
  /\b(?:analy[sz]e|apply|assess|build|choose|compare|connect|create|demonstrate|describe|design|develop|distinguish|evaluate|examine|explain|explore|frame|identify|interpret|investigate|map|practice|prepare|present|reflect|review|show|strengthen|support|test|trace|understand|use|write|is|are|has|have|helps?|shapes?|supports?|uses?)\b/i;

export function isSubstantiveSlideSubtitle(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const asciiOnly = !/[^\x00-\x7F]/.test(text);
  if (!asciiOnly) return /[\p{L}\p{N}]{2}/u.test(text);
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length < 2) return false;
  // Omit only a positive, English-shaped concept dump. Title-slide bullets
  // are authored content, so punctuationless clauses and non-English text
  // must not disappear merely because they do not match an English verb list.
  const commaSegments = text
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const weakEnglishConceptDump =
    asciiOnly &&
    commaSegments.length >= 3 &&
    !INSTRUCTIONAL_CLAUSE_VERB_RE.test(text) &&
    commaSegments.every((segment) => {
      const segmentWords = segment.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
      return segmentWords.length > 0 && segmentWords.length <= 6;
    });
  return !weakEnglishConceptDump;
}
