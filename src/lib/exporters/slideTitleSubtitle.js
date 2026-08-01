const INSTRUCTIONAL_CLAUSE_VERB_RE =
  /\b(?:analy[sz]e|apply|assess|build|choose|compare|connect|create|demonstrate|describe|design|develop|distinguish|evaluate|examine|explain|explore|frame|identify|interpret|investigate|map|practice|prepare|present|reflect|review|show|strengthen|support|test|trace|understand|use|write|is|are|has|have|helps?|shapes?|supports?|uses?)\b/i;

export function isSubstantiveSlideSubtitle(value) {
  const text = String(value || '').trim();
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
  return words.length >= 4 && /[.!?]$/.test(text) && INSTRUCTIONAL_CLAUSE_VERB_RE.test(text);
}
