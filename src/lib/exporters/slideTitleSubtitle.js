const INSTRUCTIONAL_CLAUSE_VERB_RE =
  /\b(?:analy[sz]e|apply|assess|build|choose|compare|connect|create|demonstrate|describe|design|develop|distinguish|evaluate|examine|explain|explore|frame|identify|interpret|investigate|map|practice|prepare|present|reflect|review|show|strengthen|support|test|trace|understand|use|write|is|are|has|have|helps?|shapes?|supports?|uses?)\b/i;

function normalizedTitleAnchor(value) {
  return String(value || '')
    .replace(/^(?:lesson|week)\s*\d+\s*[:.\-–—]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isSubstantiveSlideSubtitle(value, { title = '' } = {}) {
  const text = String(value || '').trim();
  if (!text) return false;
  const asciiOnly = !/[^\x00-\x7F]/.test(text);
  if (!asciiOnly) return /[\p{L}\p{N}]{2}/u.test(text);
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  if (words.length < 2) return false;
  // Omit only a positive legacy concept dump anchored by a repeated title.
  // Ambiguous authored text, including ASCII-only non-English text, stays.
  const commaSegments = text
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const weakEnglishConceptDump =
    asciiOnly &&
    normalizedTitleAnchor(commaSegments[0]) === normalizedTitleAnchor(title) &&
    Boolean(normalizedTitleAnchor(title)) &&
    commaSegments.length >= 3 &&
    !INSTRUCTIONAL_CLAUSE_VERB_RE.test(text) &&
    commaSegments.every((segment) => {
      const segmentWords = segment.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
      return segmentWords.length > 0 && segmentWords.length <= 6;
    });
  return !weakEnglishConceptDump;
}
