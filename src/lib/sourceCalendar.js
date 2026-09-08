const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const leap = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const days = (year, month) =>
  month === 2 ? (year === null || leap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;

function parts(text) {
  if (typeof text !== 'string') return null;
  text = text.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = text.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日$/);
  if (match) return { year: match[1] ? Number(match[1]) : null, month: Number(match[2]), day: Number(match[3]) };
  match = text.match(/^(\d{1,2}) ([A-Za-z]+)(?: (\d{4}))?$/);
  if (!match) return null;
  const month = months.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) + 1;
  return month ? { year: match[3] ? Number(match[3]) : null, month, day: Number(match[1]) } : null;
}

export const isExplicitCalendarDate = (text) => parts(text) !== null;

/** Proleptic Gregorian dates; no timezone, inferred year or historical calendar conversion. */
export function parseSourceCalendarDate(text) {
  const date = parts(text);
  if (
    !date ||
    (date.year !== null && (date.year < 1 || date.year > 9999)) ||
    date.month < 1 ||
    date.month > 12 ||
    date.day < 1 ||
    date.day > days(date.year, date.month)
  )
    return null;
  return date;
}

/** Conditional on a reviewed relative-day phrase referring to this record's date.
 * An unknown year stays unknown, including leap-day ambiguity and year rollover.
 */
export function inferRelativeSourceDay(recordDate, relativeDay) {
  const date = parseSourceCalendarDate(recordDate);
  const offsets = { yesterday: -1, today: 0, tomorrow: 1, 昨天: -1, 当天: 0, 明天: 1 };
  if (!date || !Object.hasOwn(offsets, relativeDay)) return { status: 'unsupported', candidates: [] };
  const offset = offsets[relativeDay];
  const years = date.year === null ? [2000, 2001] : [date.year];
  const candidates = [];
  for (const baseYear of years) {
    if (date.day > days(baseYear, date.month)) continue;
    let year = baseYear,
      month = date.month,
      day = date.day + offset;
    if (day < 1) {
      month--;
      if (month < 1) {
        month = 12;
        year--;
      }
      day = days(year, month);
    }
    if (day > days(year, month)) {
      day = 1;
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
    if (year < 1 || year > 9999) return { status: 'unsupported', candidates: [] };
    const candidate = { year: date.year === null ? null : year, month, day, yearOffset: year - baseYear };
    if (!candidates.some((item) => JSON.stringify(item) === JSON.stringify(candidate))) candidates.push(candidate);
  }
  return {
    status: candidates.length === 1 ? 'determinate' : 'ambiguous',
    candidates,
    calendar: 'proleptic-gregorian',
    attributionRequired: true,
    yearKnown: date.year !== null,
  };
}
