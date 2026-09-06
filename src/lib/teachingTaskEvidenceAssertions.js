/** A conservative text admission check, not a general negation parser.
 * If the local clause makes a matched relationship negative or hypothetical,
 * leave it unsupported instead of silently strengthening the source. */
export function assertedClause(text, start) {
  const prefix = text
    .slice(0, start)
    .split(/[.!?;。；]/u)
    .at(-1);
  return !/\b(?:not|never|no|may|might|could|possibly|allegedly|if)\b|没有|不曾|并未|尚未/u.test(prefix.toLowerCase());
}
export function assertedRecord(claims, pattern) {
  return claims.some((text) => {
    const m = text.match(pattern);
    return m && assertedClause(text, m.index);
  });
}
