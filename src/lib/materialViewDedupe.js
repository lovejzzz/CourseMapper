// v0.20.07: display-layer de-duplication shared by the material views. These
// helpers never change saved data or exports; they decide what a view shows
// once, so the same sentence does not appear in two adjacent sections.
export function normalizeViewText(value) {
  return String(value ?? '')
    .replace(/^(?:source record|record|source)\s*\d*\s*[:.-]\s*/i, '')
    .replace(/^(?:exit ticket|locator)\s*:\s*/i, '')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Materials that do not simply restate a source claim, with original indexes
// preserved so edits still write to the right saved item.
export function materialsBeyondSources(materials = [], claims = []) {
  const seen = new Set((Array.isArray(claims) ? claims : []).map(normalizeViewText).filter(Boolean));
  return (Array.isArray(materials) ? materials : [])
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => {
      const text = normalizeViewText(typeof value === 'string' ? value : value?.title || value?.text || '');
      return !text || !seen.has(text);
    });
}

export function isSameViewText(a, b) {
  const left = normalizeViewText(a);
  return Boolean(left) && left === normalizeViewText(b);
}

// The single value every item shares, or '' when items differ. Used to show a
// repeated per-item line (for example a learning objective) once per group.
export function sharedViewValue(items = [], read = (item) => item) {
  const values = (Array.isArray(items) ? items : []).map((item) => String(read(item) ?? '').trim());
  if (values.length < 2 || !values[0]) return '';
  return values.every((value) => value === values[0]) ? values[0] : '';
}
