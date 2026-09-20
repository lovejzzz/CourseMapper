import { assert, bytes, hash, LIMITS } from './primitives.js';

// Cursors identify a view of authorized data, never grant access to it. Every
// caller reconstructs and authorizes that view before accepting the cursor.
export async function pageView(binding, cursor, length) {
  const revision = await hash(binding);
  let offset = 0;
  if (cursor) {
    const match = /^([a-f0-9]{64})\.(0|[1-9][0-9]*)$/.exec(cursor);
    assert(match && match[1] === revision, 'INVALID_CURSOR', 'This view changed. Restart from its first page.');
    offset = Number(match[2]);
    assert(Number.isSafeInteger(offset) && offset <= length, 'INVALID_CURSOR', 'Invalid page position.');
  }
  return { revision, offset, cursorAt: (end) => (end < length ? `${revision}.${end}` : null) };
}

export async function itemPage(items, binding, cursor, maxItems) {
  const view = await pageView(binding, cursor, items.length);
  const page = [];
  let end = view.offset;
  while (end < items.length && page.length < maxItems) {
    if (bytes([...page, items[end]]) > LIMITS.pageBytes - 1024) break;
    page.push(items[end++]);
  }
  assert(page.length || end === items.length, 'PAYLOAD_TOO_LARGE', 'One item exceeds the page limit.');
  return { items: page, cursor: view.cursorAt(end), snapshotRevision: view.revision };
}

export async function textPage(text, binding, cursor) {
  const view = await pageView(binding, cursor, text.length);
  assert(
    !view.offset || !/[\uDC00-\uDFFF]/.test(text[view.offset]),
    'INVALID_CURSOR',
    'Cursor splits a Unicode character.',
  );
  let end = Math.min(text.length, view.offset + 3000);
  while (
    bytes(text.slice(view.offset, end)) > LIMITS.pageBytes - 1024 ||
    bytes(JSON.stringify(text.slice(view.offset, end))) > LIMITS.pageBytes - 1024
  )
    end--;
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return { text: text.slice(view.offset, end), cursor: view.cursorAt(end), snapshotRevision: view.revision };
}
