import { createResponseReview } from './teachingResponseReview.js';

/** A deliberately narrow anonymous CSV contract. Reject extra columns instead
 * of silently retaining names or losing a teacher's data. Quoted newlines and
 * doubled quotes follow CSV rules; response text is preserved verbatim. */
export function parseResponseCsv(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 1048576)
    throw new Error('Use a CSV file no larger than 1 MB.');
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    value = '',
    quoted = false,
    closed = false;
  const finishRow = () => {
    row.push(value);
    if (row.length !== 1) throw new Error('Use one column named response (or 作答), with no names or other columns.');
    rows.push(row[0]);
    row = [];
    value = '';
    closed = false;
    if (rows.length > 51) throw new Error('Import at most 50 responses at a time.');
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else value += char;
      continue;
    }
    if (char === ',') {
      row.push(value);
      value = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"' && !value.length && !closed) quoted = true;
    else if (char === '"' || closed) throw new Error('Malformed CSV quoting.');
    else value += char;
  }
  if (quoted) throw new Error('An opening CSV quote was not closed.');
  if (value.length || row.length || closed) finishRow();
  if (!['response', '作答'].includes(rows.shift()?.trim().toLowerCase()))
    throw new Error('The first row must be response (or 作答).');
  if (!rows.length || rows.some((response) => !response.trim() || response.length > 20000))
    throw new Error('Include 1–50 nonempty responses, each at most 20,000 characters.');
  return rows;
}

export function prepareResponseCsv(source, text) {
  const responses = parseResponseCsv(text);
  const now = new Date().toISOString();
  return responses.map((response) => createResponseReview(source, response, { now }));
}
