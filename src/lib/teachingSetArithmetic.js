import { solveTeachingProportion } from './teachingTaskArithmetic.js';

/** Exact bounds plus constructive witnesses; no independence assumption. */
export function solveTeachingUnionBounds(total, first, second) {
  if (!solveTeachingProportion(first, total) || !solveTeachingProportion(second, total)) return null;
  const n = BigInt(total),
    a = BigInt(first),
    b = BigInt(second);
  const overlapMin = a + b > n ? a + b - n : 0n;
  const overlapMax = a < b ? a : b;
  const witness = (both) => ({
    firstOnly: String(a - both),
    secondOnly: String(b - both),
    both: String(both),
    neither: String(n - a - b + both),
    union: String(a + b - both),
  });
  const minimum = witness(overlapMax),
    maximum = witness(overlapMin);
  return {
    total: String(n),
    first: String(a),
    second: String(b),
    overlapMinimum: String(overlapMin),
    overlapMaximum: String(overlapMax),
    minimum,
    maximum,
    lower: solveTeachingProportion(minimum.union, total),
    upper: solveTeachingProportion(maximum.union, total),
    exactUnion: minimum.union === maximum.union,
    exactOverlap: overlapMin === overlapMax,
  };
}
