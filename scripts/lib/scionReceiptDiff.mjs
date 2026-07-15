function collectReceiptMismatchPaths(actual, expected, location = '$', mismatches = [], limit = 24) {
  if (mismatches.length >= limit) return mismatches;
  if (Object.is(actual, expected)) return mismatches;

  const actualArray = Array.isArray(actual);
  const expectedArray = Array.isArray(expected);
  if (actualArray || expectedArray) {
    if (!actualArray || !expectedArray || actual.length !== expected.length) {
      mismatches.push(`${location}.length`);
      return mismatches;
    }
    for (let index = 0; index < actual.length && mismatches.length < limit; index += 1) {
      collectReceiptMismatchPaths(actual[index], expected[index], `${location}[${index}]`, mismatches, limit);
    }
    return mismatches;
  }

  const actualObject = actual !== null && typeof actual === 'object';
  const expectedObject = expected !== null && typeof expected === 'object';
  if (actualObject || expectedObject) {
    if (!actualObject || !expectedObject) {
      mismatches.push(location);
      return mismatches;
    }
    const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
    for (const key of keys) {
      if (mismatches.length >= limit) break;
      if (!Object.hasOwn(actual, key) || !Object.hasOwn(expected, key)) mismatches.push(`${location}.${key}`);
      else collectReceiptMismatchPaths(actual[key], expected[key], `${location}.${key}`, mismatches, limit);
    }
    return mismatches;
  }

  mismatches.push(location);
  return mismatches;
}

export function appendScionReceiptMismatchIssues(
  issues,
  actual,
  expected,
  { prefix = 'tracked-receipt-mismatch' } = {},
) {
  if (!expected || JSON.stringify(actual) === JSON.stringify(expected)) return;
  issues.push(prefix);
  for (const mismatch of collectReceiptMismatchPaths(actual, expected)) issues.push(`${prefix}:${mismatch}`);
}
