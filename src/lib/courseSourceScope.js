// Course-level disambiguators must survive short, overloaded lesson titles.
// A source may still be irrelevant after passing this necessary scope check.
export function requiredCourseSourceScope(courseName = '') {
  const title = String(courseName).trim();
  const reading = title.match(/^close reading of\s+(.+)$/i);
  if (reading) return { kind: 'named-reading', label: reading[1].trim() };
  if (/\bindustrial revolution\b/i.test(title)) return { kind: 'historical-period', label: 'Industrial Revolution' };
  const language = title.match(/\b(Spanish|French|German|Italian|Portuguese|Japanese|Korean|Mandarin|Arabic)\b/i);
  if (language && /\b(?:beginners?|introductions?|language|conversation|grammar|pronunciation)\b/i.test(title))
    return { kind: 'target-language', label: language[1] };
  return null;
}
export function sourceMatchesCourseScope(courseName, sourceText) {
  const scope = requiredCourseSourceScope(courseName);
  if (!scope) return true;
  const text = String(sourceText || '')
    .normalize('NFKC')
    .toLowerCase();
  if (scope.kind === 'historical-period')
    return /\bindustrial(?:ization|isation| revolution)|\bfactor(?:y|ies)|\btextile|\bmill\b|\bchild labo[u]?r|\bsteam engine/.test(
      text,
    );
  const aliases = {
    spanish: ['spanish', 'español'],
    french: ['french', 'français'],
    german: ['german', 'deutsch'],
    italian: ['italian', 'italiano'],
    portuguese: ['portuguese', 'português'],
    japanese: ['japanese', '日本語'],
    korean: ['korean', '한국어'],
    mandarin: ['mandarin', 'chinese', '普通话', '中文'],
    arabic: ['arabic', 'العربية'],
  };
  if (scope.kind === 'target-language') return (aliases[scope.label.toLowerCase()] || []).some((s) => text.includes(s));
  const words = scope.label.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.length > 0 && words.every((word) => text.includes(word));
}
