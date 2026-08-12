// Keep the second token case-sensitive: uppercase "A" is a label/grade, not
// an article. The fixed phrase "a priori" is likewise not a collision.
// Hyphenated morphemes and equals-bound clitics are linguistic data, not
// English determiner slots (for example Boumaa Fijian `soli-a a=niu`).
export const ADJACENT_ARTICLE_COLLISION_RE =
  /(?<![-=])\b(?:[Aa]|[Aa]n|[Tt]he)\s+(?:a(?!\.(?:m|d)\b|\s+(?:priori|posteriori)\b)|an|the|An|The)\b(?![-=])/;

/**
 * Detect two determiners occupying the same noun-phrase slot without treating
 * the capital letter A or the fixed phrase "a priori" as an article.
 */
export function hasAdjacentArticleCollision(value) {
  return ADJACENT_ARTICLE_COLLISION_RE.test(String(value || ''));
}
