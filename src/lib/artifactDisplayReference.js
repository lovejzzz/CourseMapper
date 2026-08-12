const ARTIFACT_KIND =
  /\b(?:evidence brief|policy brief|case brief|design brief|research brief|project brief|(?:[a-z][a-z-]*\s+){0,2}memo|(?:calculation|interpretation|comparison|revision|analysis) note|lab report|test report|analysis report|research report|progress report|care plan|lesson plan|teaching plan|study guide|problem set|code lab|research log|analysis log|field note|discussion post|presentation|portfolio|prototype|worksheet|quiz|exam)\b/i;
const IDENTITY_KEYS = new Set([
  'artifact',
  'assessmentBlock',
  'assessmentId',
  'assessmentTitle',
  'canonicalGradedWork',
  'gradedWork',
  'gw',
  'lessonTitle',
  'lt',
  'registryId',
  'studentArtifact',
  't',
  'title',
]);

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
  if (match) return match[0].toLowerCase();
  const tail = artifact
    .split(/\s*(?:[,;:]|\bor\b)\s*/i)
    .map(clean)
    .filter(Boolean)
    .at(-1);
  if (
    tail &&
    wordCount(tail) <= 4 &&
    /\b(?:analysis|audit|brief|check|comparison|explanation|project|response|sheet|summary|trace)$/i.test(tail)
  ) {
    return tail.toLowerCase();
  }
  return artifact;
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
    // Long-title compaction runs after the compiled-language finalizer. Two
    // distinct long surfaces can therefore collapse into the same compact
    // label and create a new reader-visible echo at the last possible stage:
    // "Format profile for Week 7 memo: Week 7 memo". Repair that generated
    // format scaffold here, where the echo is introduced, while preserving
    // the compact artifact identity and the surrounding requirement.
    const compact = escapeRegExp(clean(replacement));
    text = text.replace(
      new RegExp(`\\bFormat profile for (${compact}):\\s*\\1(?=[.!?;:,]?\\s|[.!?;:,]?$)`, 'gi'),
      'Format profile for $1: evidence, decision logic, limitation, and revision trace',
    );
    // A value may be compacted by more than one canonical-title pass. The
    // left and right surfaces can become identical only after the later
    // pass, so also catch any exact generated format-profile echo independent
    // of which title transformation created it.
    text = text.replace(
      /\bFormat profile for ([^:.!?\n]{3,100}):\s*\1(?=[.!?;:,]?\s|[.!?;:,]?$)/gi,
      'Format profile for $1: evidence, decision logic, limitation, and revision trace',
    );
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
