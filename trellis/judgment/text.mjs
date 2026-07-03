// Shared pure text helpers for judgment checks.

const STOPWORDS = new Set(
  'the a an and or of to in on for with from by at as is are this that these those it its be was were will would can could should has have had not no if then than when where which who whom whose what why how'.split(
    ' ',
  ),
);

export function contentTokens(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

export function tokenOverlapRatio(needleText, haystackText) {
  const needle = new Set(contentTokens(needleText));
  if (needle.size === 0) return 0;
  const haystack = new Set(contentTokens(haystackText));
  let hit = 0;
  for (const token of needle) if (haystack.has(token)) hit += 1;
  return hit / needle.size;
}

export function shingles(text, size = 5) {
  const tokens = contentTokens(text);
  const result = new Set();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    result.add(tokens.slice(i, i + size).join(' '));
  }
  return result;
}

export function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}
