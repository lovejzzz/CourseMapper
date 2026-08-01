// Keep the second token case-sensitive: uppercase "A" is a label/grade, not
// an article. The fixed phrase "a priori" is likewise not a collision.
export const ADJACENT_ARTICLE_COLLISION_RE = /\b(?:[Aa]|[Aa]n|[Tt]he)\s+(?:a(?!\s+priori\b)|an|the|An|The)\b/;

/**
 * Detect two determiners occupying the same noun-phrase slot without treating
 * the capital letter A or the fixed phrase "a priori" as an article.
 */
export function hasAdjacentArticleCollision(value) {
  return ADJACENT_ARTICLE_COLLISION_RE.test(String(value || ''));
}
