/** Exact integer arithmetic is a compiler responsibility. Rounding is explicit
 * and never re-labeled as an exact reverse check. No floating-point tolerance
 * is used to accept a supplied equality. */
export function solveTeachingProportion(numerator, denominator, percentPlaces = 2) {
  if (!/^\d{1,9}$/.test(String(numerator)) || !/^\d{1,9}$/.test(String(denominator))) return null;
  const n = BigInt(numerator),
    d = BigInt(denominator);
  if (d === 0n || n > d || !Number.isInteger(percentPlaces) || percentPlaces < 0 || percentPlaces > 6) return null;
  const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
  let reduced = d / gcd(n, d);
  for (const prime of [2n, 5n]) while (reduced % prime === 0n) reduced /= prime;
  const exact = reduced === 1n;
  const decimal = (value, divisor, places, round) => {
    const scale = 10n ** BigInt(places);
    const scaled = round ? (2n * value * scale + divisor) / (2n * divisor) : (value * scale) / divisor;
    const whole = scaled / scale;
    const fraction = (scaled % scale).toString().padStart(places, '0').replace(/0+$/, '');
    return `${whole}${fraction ? `.${fraction}` : ''}`;
  };
  let places = percentPlaces + 2;
  if (exact) {
    places = 0;
    let scale = 1n;
    while ((n * scale) % d !== 0n) {
      places += 1;
      scale *= 10n;
    }
  }
  const ratio = decimal(n, d, places, !exact);
  const percent = decimal(100n * n, d, exact ? Math.max(0, places - 2) : percentPlaces, !exact);
  return {
    numerator: n.toString(),
    denominator: d.toString(),
    decimal: ratio,
    percent,
    exact,
    percentPlaces,
    relation: exact ? '=' : '≈',
    reverseCheck: exact ? `${ratio} × ${d} = ${n}` : `(${n}/${d}) × ${d} = ${n}; ${ratio} × ${d} ≈ ${n}`,
  };
}

export function explicitSourceProportions(claims) {
  const matches = [];
  for (const claim of claims) {
    if (!/(?:\b(?:proportion|percentage|percent|fraction)\b|比例|百分比|百分率)/i.test(claim)) continue;
    for (const match of claim.matchAll(/(?<![\w.+\-/=])(\d{1,9})\s*\/\s*(\d{1,9})(?![\d/])/g)) {
      // Equations belong to the stricter source-equality verifier. Do not
      // reinterpret a false source equation as an unsolved fraction.
      if (/^\s*[=≈]/.test(claim.slice(match.index + match[0].length))) continue;
      const solution = solveTeachingProportion(match[1], match[2]);
      if (solution) matches.push({ ...solution, sourceClaim: claim });
    }
  }
  return matches;
}
