function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function buildEncodedDefectConformanceLedger({
  scores,
  findings,
  texture,
  stats,
  dimensionWeights,
  graderVersion,
}) {
  const dimensionIds = Object.keys(dimensionWeights);
  const dimensions = {};
  for (const dimension of dimensionIds) {
    if (dimension === 'texture') {
      const earned = clampScore(scores.texture);
      dimensions.texture = {
        constructId: 'encodedDefectConformance.texture',
        status: 'evaluated-metric',
        weight: dimensionWeights.texture,
        points: { potential: 100, earned, lost: 100 - earned, unobserved: 0 },
        coverage: {
          mode: 'positive-and-negative-metric',
          positiveValidation: true,
          reason: 'Visible-unit texture is computed directly from masked package content.',
        },
        deductions: [
          {
            ruleId: 'DQC.TEXTURE.VISIBLE_UNIT_METRIC',
            ruleVersion: graderVersion,
            type: 'metric-result',
            predicate: { operator: 'texture-score', expected: 100, actual: earned },
            before: 100,
            after: earned,
            effectivePointsLost: 100 - earned,
            evidenceTier: 'deterministic-content-metric',
            reason: `Masked visible-unit texture measured ${earned}/100.`,
            action:
              earned >= 90
                ? 'Preserve the current variation and review the worst repeated units in the texture receipt.'
                : 'Replace repeated visible-unit phrasing with lesson-specific facts, decisions, evidence, and task conditions.',
            evidence: texture?.evidence || null,
          },
        ],
      };
      continue;
    }

    const dimensionFindings = findings
      .filter((finding) => finding.dimension === dimension)
      .slice()
      .sort((left, right) => `${left.ruleId}:${left.id}`.localeCompare(`${right.ruleId}:${right.id}`));
    let before = 100;
    const deductions = dimensionFindings.map((finding) => {
      const after = Math.max(0, before - (finding.pointsLost || 0));
      const row = {
        ruleId: finding.ruleId,
        ruleVersion: finding.ruleVersion,
        findingId: finding.id,
        type: 'encoded-defect-deduction',
        predicate: { operator: 'finding-present', expected: false, actual: true },
        before,
        after,
        nominalPointsLost: finding.pointsLost || 0,
        effectivePointsLost: before - after,
        severity: finding.severity,
        evidenceTier: finding.evidenceTier,
        reason: finding.reason,
        action: finding.action,
        evidence: { file: finding.file, quote: finding.evidence },
      };
      before = after;
      return row;
    });
    dimensions[dimension] = {
      constructId: `encodedDefectConformance.${dimension}`,
      status: 'negative-evidence-only',
      weight: dimensionWeights[dimension],
      points: { potential: 100, earned: scores[dimension], lost: 100 - scores[dimension], unobserved: 0 },
      coverage: {
        mode: 'negative-evidence-only',
        positiveValidation: false,
        encodedFindings: dimensionFindings.length,
        reason:
          'A score of 100 means no encoded defect fired in this dimension; it does not mean an expert positively validated the dimension.',
      },
      deductions,
    };
  }

  const totalWeight = Object.values(dimensionWeights).reduce((sum, weight) => sum + weight, 0);
  const weightedExact =
    dimensionIds.reduce(
      (sum, dimension) => sum + dimensions[dimension].points.earned * dimensionWeights[dimension],
      0,
    ) / totalWeight;
  const before = Math.round(weightedExact);
  const adjustments = [];
  if (stats.p0 > 0) {
    adjustments.push({
      ruleId: 'DQC.OVERALL.P0_CAP',
      ruleVersion: graderVersion,
      type: 'aggregate-gate',
      predicate: { operator: 'count-gte', evidence: 'P0 findings', expected: 1, actual: stats.p0 },
      transform: { operator: 'cap', maximum: 74 },
      before,
      after: Math.min(before, 74),
      delta: Math.min(before, 74) - before,
      reason: 'At least one blocking P0 finding caps encoded-defect conformance at 74.',
      action: 'Resolve every P0 finding and regrade before relying on the uncapped weighted result.',
      evidenceIds: findings.filter((finding) => finding.severity === 'P0').map((finding) => finding.id),
    });
  } else if (stats.p1 > 0) {
    adjustments.push({
      ruleId: 'DQC.OVERALL.P1_CAP',
      ruleVersion: graderVersion,
      type: 'aggregate-gate',
      predicate: { operator: 'count-gte', evidence: 'P1 findings', expected: 1, actual: stats.p1 },
      transform: { operator: 'cap', maximum: 89 },
      before,
      after: Math.min(before, 89),
      delta: Math.min(before, 89) - before,
      reason: 'At least one major P1 finding caps encoded-defect conformance at 89.',
      action: 'Resolve every P1 finding and regrade before relying on the uncapped weighted result.',
      evidenceIds: findings.filter((finding) => finding.severity === 'P1').map((finding) => finding.id),
    });
  }
  const score = adjustments.length > 0 ? adjustments[adjustments.length - 1].after : before;
  return {
    protocol: 'coursemapper-encoded-defect-conformance-ledger-v1',
    graderVersion,
    construct: 'encoded-package-defect-conformance',
    claimBoundary:
      'Except for the texture metric, dimension scores report absence or presence of encoded defects, not positive expert validation.',
    dimensions,
    overall: {
      totalWeight,
      weightedExact: Number(weightedExact.toFixed(6)),
      beforeAdjustments: before,
      adjustments,
      score,
    },
  };
}

export function recomputeEncodedDefectConformanceLedger(ledger) {
  const dimensions = ledger?.dimensions || {};
  const totalWeight = Object.values(dimensions).reduce((sum, row) => sum + Number(row?.weight || 0), 0);
  if (totalWeight <= 0) throw new Error('Conformance ledger has no positive dimension weight');
  let weighted = 0;
  for (const [dimension, row] of Object.entries(dimensions)) {
    const points = row?.points || {};
    if (points.earned + points.lost + points.unobserved !== points.potential) {
      throw new Error(`${dimension} point buckets do not equal its potential`);
    }
    if (row.status === 'negative-evidence-only') {
      const replayed = (row.deductions || []).reduce((prior, deduction) => {
        const expectedAfter = Math.max(0, prior - Number(deduction.nominalPointsLost || 0));
        if (deduction.before !== prior || deduction.after !== expectedAfter) {
          throw new Error(`${deduction.ruleId} deduction cannot be replayed`);
        }
        return expectedAfter;
      }, 100);
      if (replayed !== points.earned) throw new Error(`${dimension} deductions do not reproduce earned points`);
    }
    weighted += points.earned * Number(row.weight || 0);
  }
  let score = Math.round(weighted / totalWeight);
  for (const adjustment of ledger?.overall?.adjustments || []) {
    if (adjustment.before !== score || adjustment.transform?.operator !== 'cap') {
      throw new Error(`${adjustment.ruleId} aggregate gate cannot be replayed`);
    }
    const after = Math.min(score, Number(adjustment.transform.maximum));
    if (adjustment.after !== after || adjustment.delta !== after - score) {
      throw new Error(`${adjustment.ruleId} aggregate gate contains a forged result`);
    }
    score = after;
  }
  return score;
}
