const small = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const chinese = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const tokens = new Set([...small, ...tens, 'hundred', 'thousand', 'million', 'billion', 'minus', 'negative']);
const numeral = /[零〇一二两兩三四五六七八九十百千万萬亿億]/;
const numberStart = `(?:\\d|[零〇一二两兩三四五六七八九十百千万萬亿億]|(?:${[...small, ...tens].join('|')})\\b)`;
const rangeAfter = new RegExp(`^\\s*(?:to\\b|through\\b|至|到|~|–|—)\\s*${numberStart}`, 'i');
const rangeBefore = new RegExp(
  `(?:\\d+|[零〇一二两兩三四五六七八九十百千万萬亿億]+|\\b(?:${[...small, ...tens, 'hundred', 'thousand', 'million'].join('|')}))\\s*(?:to|through|至|到|~|–|—)\\s*$`,
  'i',
);

/** Exact integer notation, not extraction from prose. Word forms deliberately
 * cover 0–99; larger written numbers require a reviewed numeric source. */
export function parseSourceCount(text) {
  if (typeof text !== 'string') return null;
  if (/^\d{1,9}$/.test(text)) return Number(text);
  const lower = text.toLowerCase();
  if (small.includes(lower)) return small.indexOf(lower);
  const parts = lower.split(/[ -]/);
  if (
    tens.includes(parts[0]) &&
    (parts.length === 1 || (parts.length === 2 && small.indexOf(parts[1]) > 0 && small.indexOf(parts[1]) < 10))
  )
    return (tens.indexOf(parts[0]) + 2) * 10 + (parts.length === 2 ? small.indexOf(parts[1]) : 0);
  if (Object.hasOwn(chinese, text)) return chinese[text];
  const match = text.match(/^([一二两兩三四五六七八九]?)十([一二三四五六七八九]?)$/);
  return match ? (match[1] ? chinese[match[1]] : 1) * 10 + (match[2] ? chinese[match[2]] : 0) : null;
}

export function countSpanCutsNumber(source, start, end) {
  const before = source.slice(0, start),
    after = source.slice(end);
  if (numeral.test(before.slice(-1)) || numeral.test(after.slice(0, 1))) return true;
  if (
    /(?:\bnot|不是|并非|不等于|百分之|千分之)\s*$/i.test(before) ||
    /^\s*(?:%|percent\b|percentage\b|per cent\b)/i.test(after)
  )
    return true;
  if (
    /(?:\bminus|\bnegative|\babout|\bapproximately|\bat least|\bat most|\bmore than|\bless than|负|負|第|至少|至多|大约|約|约)\s*$/i.test(
      before,
    )
  )
    return true;
  if (rangeAfter.test(after) || rangeBefore.test(before)) return true;
  const previous = before.match(/([a-z]+)[ -]+$/i)?.[1]?.toLowerCase();
  const next = after.match(/^[ -]+([a-z]+)/i)?.[1]?.toLowerCase();
  const beforeAnd = before.match(/([a-z]+)\s+and\s+$/i)?.[1]?.toLowerCase();
  return tokens.has(previous) || tokens.has(next) || tokens.has(beforeAnd);
}
