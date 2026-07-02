/**
 * scripts/prof/student/psychometrics.mjs — item statistics over the cohort's
 * probability matrix (design §3f, zero tokens). Real test-development
 * numbers: difficulty, discrimination (point-biserial on expected scores),
 * misconception-catch accounting.
 */

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const meanA = mean(a);
  const meanB = mean(b);
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varA += (a[i] - meanA) ** 2;
    varB += (b[i] - meanB) ** 2;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

/**
 * pMatrix: rows = students, columns = items, values = P(correct).
 * Healthy item: difficulty in [0.2, 0.9] and discrimination ≥ 0.2 (classical
 * test-theory conventions).
 */
export function itemStatistics({ items, pMatrix }) {
  const studentTotals = pMatrix.map((row) => mean(row));
  return items.map((item, columnIndex) => {
    const columnP = pMatrix.map((row) => row[columnIndex]);
    const difficulty = mean(columnP);
    const discrimination = pearson(columnP, studentTotals);
    const degenerate =
      difficulty > 0.9
        ? 'giveaway'
        : difficulty < 0.2
          ? 'untaught-or-broken'
          : discrimination !== null && discrimination < 0.2
            ? 'non-discriminating'
            : null;
    return {
      itemId: item.itemId,
      lesson: item.lesson,
      conceptId: item.conceptId,
      conceptTerm: item.conceptTerm,
      kind: item.kind,
      misconceptionTargets: item.misconceptionTargets.size,
      difficulty: round3(difficulty),
      discrimination: discrimination === null ? null : round3(discrimination),
      degenerate,
    };
  });
}

export function summarizeItems(itemStats) {
  const mc = itemStats.filter((item) => item.discrimination !== null);
  const healthy = mc.filter((item) => !item.degenerate);
  return {
    items: itemStats.length,
    healthyFraction: mc.length > 0 ? round3(healthy.length / mc.length) : null,
    giveaways: itemStats.filter((item) => item.degenerate === 'giveaway').length,
    untaughtOrBroken: itemStats.filter((item) => item.degenerate === 'untaught-or-broken').length,
    nonDiscriminating: itemStats.filter((item) => item.degenerate === 'non-discriminating').length,
    misconceptionCatching: itemStats.filter((item) => item.misconceptionTargets > 0).length,
  };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
