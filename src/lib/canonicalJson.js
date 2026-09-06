/** Stable JSON data encoding. Object insertion order is not a content edit;
 * array order and all serializable values remain significant. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${Array.from(value, (item) => canonicalJson(item) ?? 'null').join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export const sameJsonData = (left, right) => canonicalJson(left) === canonicalJson(right);
