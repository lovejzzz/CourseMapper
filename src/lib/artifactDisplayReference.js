const ARTIFACT_KIND =
  /\b(?:evidence brief|policy brief|case brief|design brief|research brief|project brief|analysis memo|policy memo|case memo|reflection memo|lab report|test report|analysis report|research report|progress report|care plan|lesson plan|teaching plan|study guide|problem set|code lab|research log|analysis log|field note|discussion post|presentation|portfolio|prototype|worksheet|quiz|exam)\b/i;
const IDENTITY_KEYS = new Set(['assessmentBlock', 'lessonTitle', 'registryId', 'assessmentId']);

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutTerminalPunctuation(value) {
  return clean(value)
    .replace(/[.!?;:,]+$/u, '')
    .trim();
}

function wordCount(value) {
  return clean(value).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Registry titles remain verbatim in identity fields. Teaching prose uses a
// stable product noun when a rubric-like title is too long to read.
export function compactLongArtifactTitle(value) {
  const artifact = withoutTerminalPunctuation(value);
  if (wordCount(artifact) < 8 && artifact.length <= 80) return artifact;
  const match = artifact.match(ARTIFACT_KIND);
  return match ? match[0].toLowerCase() : artifact;
}

export function compactLongArtifactMentionsInValue(value, canonicalValue, replacement, key = '') {
  if (IDENTITY_KEYS.has(key)) return value;
  if (typeof value === 'string') {
    const canonical = withoutTerminalPunctuation(canonicalValue);
    if (!canonical || canonical === replacement) return value;
    const kindMatch = canonical.match(ARTIFACT_KIND);
    const longTail = kindMatch ? canonical.slice(kindMatch.index) : '';
    let text = value.replace(new RegExp(escapeRegExp(canonical), 'gi'), replacement);
    if (wordCount(longTail) >= 8) text = text.replace(new RegExp(escapeRegExp(longTail), 'gi'), replacement);
    return text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => compactLongArtifactMentionsInValue(item, canonicalValue, replacement, key));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      compactLongArtifactMentionsInValue(child, canonicalValue, replacement, childKey),
    ]),
  );
}
