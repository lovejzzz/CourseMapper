import { expect, it } from 'vitest';
import { inferRelativeSourceDay, parseSourceCalendarDate } from '../sourceCalendar.js';

it('derives a day of month without inventing a missing year or proving an event occurred', () => {
  const result = inferRelativeSourceDay('18 August', 'yesterday');
  expect(result).toMatchObject({ status: 'determinate', yearKnown: false, attributionRequired: true });
  expect(result.candidates).toEqual([{ year: null, month: 8, day: 17, yearOffset: 0 }]);
  expect(inferRelativeSourceDay('9月1日', '昨天').candidates).toEqual([
    { year: null, month: 8, day: 31, yearOffset: 0 },
  ]);
});

it('retains leap-year ambiguity rather than choosing an arbitrary reference year', () => {
  expect(inferRelativeSourceDay('1 March', 'yesterday')).toMatchObject({
    status: 'ambiguous',
    candidates: [
      { year: null, month: 2, day: 29, yearOffset: 0 },
      { year: null, month: 2, day: 28, yearOffset: 0 },
    ],
  });
  expect(inferRelativeSourceDay('28 February', 'tomorrow').candidates).toHaveLength(2);
  expect(inferRelativeSourceDay('29 February', 'tomorrow').candidates).toEqual([
    { year: null, month: 3, day: 1, yearOffset: 0 },
  ]);
});

it('checks month lengths, Gregorian century rules and explicit calendar bounds', () => {
  for (const date of [
    '31 April',
    '30 February',
    '2025-02-29',
    '1900-02-29',
    '2100年2月29日',
    '0000-01-01',
    '2024-13-01',
    '2024-01-00',
  ])
    expect(parseSourceCalendarDate(date)).toBeNull();
  expect(parseSourceCalendarDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
  expect(parseSourceCalendarDate(' 31 April ')).toBeNull();
  expect(inferRelativeSourceDay('1900-03-01', 'yesterday').candidates[0].day).toBe(28);
  expect(inferRelativeSourceDay('2000-03-01', 'yesterday').candidates[0].day).toBe(29);
  expect(inferRelativeSourceDay('0001-01-01', 'yesterday').status).toBe('unsupported');
});

it('preserves known and unknown year rollover and refuses unbound relative wording', () => {
  expect(inferRelativeSourceDay('2024-01-01', 'yesterday').candidates).toEqual([
    { year: 2023, month: 12, day: 31, yearOffset: -1 },
  ]);
  expect(inferRelativeSourceDay('31 December', 'tomorrow').candidates).toEqual([
    { year: null, month: 1, day: 1, yearOffset: 1 },
  ]);
  for (const value of ['yesterday morning', 'last week', 'probably yesterday', '__proto__'])
    expect(inferRelativeSourceDay('18 August', value).status).toBe('unsupported');
});
