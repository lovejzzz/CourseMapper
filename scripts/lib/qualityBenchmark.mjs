import crypto from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/i;
const EVIDENCE_CLASS_ORDER = ['deterministic', 'model-judge', 'human-other', 'human-qualified'];
const RATING_STATES = new Set(['scored', 'not-applicable', 'not-evaluated', 'insufficient-evidence']);
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const OUTPUT_STATUSES = new Set(['success', 'provider-failure', 'validation-failure', 'timeout', 'cancelled']);
const SCORE_EVIDENCE_TIERS = new Set([
  'automated-signal',
  'model-provisional',
  'human-reviewed',
  'human-reviewed-disputed',
  'independently-validated',
]);
const EXPECTED_DIMENSION_IDS = new Set([
  'instructional-alignment',
  'accuracy-source-fidelity',
  'assessment-feedback',
  'teaching-learning-usability',
  'student-clarity-support',
  'inclusion-accessibility',
  'integrity-safety-rights',
  'professional-craft',
  'cross-artifact-coherence',
]);

export function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

export function median(values = []) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function quantile(values, probability) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const position = (rows.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return rows[lower];
  return rows[lower] + (rows[upper] - rows[lower]) * (position - lower);
}

function concreteText(value, minimum = 8) {
  return typeof value === 'string' && value.trim().length >= minimum && !/placeholder|replace me|\btbd\b/i.test(value);
}

function seededRandom(seed = 'coursemapper-quality-benchmark') {
  let state = Number.parseInt(crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function flattenRubric(rubric) {
  const criteria = [];
  for (const dimension of rubric?.dimensions || []) {
    const localWeight = (dimension.criteria || []).reduce((sum, criterion) => sum + Number(criterion.weight || 1), 0);
    for (const criterion of dimension.criteria || []) {
      criteria.push({
        ...criterion,
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        dimensionWeight: Number(dimension.weight),
        dimensionCritical: dimension.critical === true,
        normalizedWeight:
          localWeight > 0 ? Number(dimension.weight) * (Number(criterion.weight || 1) / localWeight) : 0,
      });
    }
  }
  return criteria;
}

export function validateRubric(rubric) {
  const issues = [];
  if (rubric?.rubricVersion !== '1.0.0') issues.push('rubricVersion must identify the implemented 1.0.0 construct');
  const dimensions = rubric?.dimensions || [];
  const dimensionIds = new Set();
  const criterionIds = new Set();
  const weightTotal = dimensions.reduce((sum, dimension) => sum + Number(dimension.weight || 0), 0);
  if (weightTotal !== 100) issues.push(`dimension weights must sum to 100 (observed ${weightTotal})`);
  if (
    dimensions.length !== EXPECTED_DIMENSION_IDS.size ||
    [...EXPECTED_DIMENSION_IDS].some((id) => !dimensions.some((dimension) => dimension.id === id))
  ) {
    issues.push('rubric must preserve all nine benchmark construct dimensions');
  }
  for (const dimension of dimensions) {
    if (!concreteText(dimension.id, 2) || dimensionIds.has(dimension.id))
      issues.push(`invalid or duplicate dimension id ${dimension.id || '<missing>'}`);
    dimensionIds.add(dimension.id);
    if (!Number.isFinite(Number(dimension.weight)) || Number(dimension.weight) <= 0)
      issues.push(`${dimension.id} weight must be positive`);
    if (!(dimension.criteria || []).length) issues.push(`${dimension.id} must contain criteria`);
    for (const criterion of dimension.criteria || []) {
      if (!concreteText(criterion.id, 2) || criterionIds.has(criterion.id))
        issues.push(`invalid or duplicate criterion id ${criterion.id || '<missing>'}`);
      criterionIds.add(criterion.id);
      if (!Number.isFinite(Number(criterion.weight)) || Number(criterion.weight) <= 0)
        issues.push(`${criterion.id} weight must be positive`);
      for (const anchor of ['0', '2', '4']) {
        if (!concreteText(criterion.anchors?.[anchor], 20))
          issues.push(`${criterion.id} requires a concrete anchor ${anchor}`);
      }
    }
  }
  const expectedDeliverables = new Set([
    'courseMap',
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
    'reading-response',
    'reflection-check-in',
    'feedback-form',
    'project-milestone-checklist',
    'lab-report',
    'case-brief',
    'policy-memo-checkpoint',
    'observation-checklist',
    'participation-self-assessment',
    'capstone-progress-report',
    'problem-set-worksheet',
    'package',
    'custom-declared',
  ]);
  const deliverableIds = new Set((rubric?.deliverableRubrics || []).map((row) => row.id));
  for (const id of expectedDeliverables)
    if (!deliverableIds.has(id)) issues.push(`missing specialized deliverable rubric ${id}`);
  for (const row of rubric?.deliverableRubrics || []) {
    for (const anchor of ['anchor0', 'anchor2', 'anchor4']) {
      if (!concreteText(row[anchor], 25)) issues.push(`${row.id} requires ${anchor}`);
    }
    if (!(row.requiredEvidence || []).length) issues.push(`${row.id} requires an evidence sample plan`);
  }
  const failureIds = new Set();
  for (const failure of rubric?.criticalFailures || []) {
    if (failureIds.has(failure.id)) issues.push(`duplicate critical failure ${failure.id}`);
    failureIds.add(failure.id);
    if (!Number.isFinite(Number(failure.scoreCap)) || failure.scoreCap < 0 || failure.scoreCap > 100) {
      issues.push(`${failure.id} has an invalid scoreCap`);
    }
  }
  const scoring = rubric?.scoring || {};
  if (!Number.isInteger(scoring.minimumQualifiedReviewers) || scoring.minimumQualifiedReviewers < 2)
    issues.push('minimumQualifiedReviewers must be at least 2');
  if (!Number.isInteger(scoring.minimumReliabilityUnits) || scoring.minimumReliabilityUnits < 12)
    issues.push('minimumReliabilityUnits must be at least 12');
  if (
    !Number.isFinite(scoring.minimumKrippendorffAlpha) ||
    scoring.minimumKrippendorffAlpha < 0.667 ||
    scoring.minimumKrippendorffAlpha > 1
  ) {
    issues.push('minimumKrippendorffAlpha must be between 0.667 and 1');
  }
  const coverageThresholds = [
    scoring.minimumCoverageForScore,
    scoring.minimumCoverageForPilotBand,
    scoring.minimumCoverageForValidatedBand,
  ];
  if (
    coverageThresholds.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
    !(coverageThresholds[0] < coverageThresholds[1] && coverageThresholds[1] < coverageThresholds[2])
  ) {
    issues.push('coverage thresholds must be increasing fractions between 0 and 1');
  }
  const configuredCaps = scoring.evidenceCaps || {};
  const maximumEvidenceCaps = {
    unscored: 0,
    'automated-signal': 69,
    'model-provisional': 79,
    'human-reviewed': 89,
    'human-reviewed-disputed': 89,
    'independently-validated': 100,
  };
  for (const [tier, maximum] of Object.entries(maximumEvidenceCaps)) {
    if (!Number.isFinite(configuredCaps[tier]) || configuredCaps[tier] > maximum || configuredCaps[tier] < 0)
      issues.push(`evidence cap ${tier} must be present and no greater than ${maximum}`);
  }
  return {
    valid: issues.length === 0,
    issues,
    weightTotal,
    criterionCount: criterionIds.size,
    deliverableCount: deliverableIds.size,
  };
}

function isQualifiedHuman(review) {
  const evaluator = review?.evaluator || {};
  return (
    evaluator.evidenceClass === 'human-qualified' &&
    evaluator.qualified === true &&
    evaluator.independent === true &&
    evaluator.conflictOfInterest === false &&
    evaluator.domainMatch === true &&
    concreteText(evaluator.currentTeachingRole, 4)
  );
}

function validateEvidence(evidence) {
  return (
    evidence &&
    typeof evidence === 'object' &&
    concreteText(evidence.artifact, 2) &&
    concreteText(evidence.location, 2) &&
    (concreteText(evidence.observation, 12) || concreteText(evidence.quote, 12))
  );
}

export function validateQualityReview(review, rubric, { benchmarkCase = null } = {}) {
  const issues = [];
  const criteria = flattenRubric(rubric);
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const failureIds = new Set((rubric?.criticalFailures || []).map((failure) => failure.id));
  if (review?.schemaVersion !== 2) issues.push('schemaVersion must be 2');
  if (review?.rubricVersion !== rubric?.rubricVersion) issues.push('rubricVersion does not match the active rubric');
  if (!concreteText(review?.caseId, 3)) issues.push('caseId is required');
  if (benchmarkCase?.id && review?.caseId !== benchmarkCase.id) issues.push('caseId does not match the benchmark case');
  if (!concreteText(review?.artifactId, 2)) issues.push('artifactId is required');
  const deliverableIds = new Set((rubric?.deliverableRubrics || []).map((row) => row.id));
  if (!deliverableIds.has(review?.artifactType))
    issues.push(`artifactType ${review?.artifactType || '<missing>'} has no specialized rubric`);
  if (!SHA256.test(String(review?.sourceSha256 || '')))
    issues.push('sourceSha256 must bind the inspected source packet');
  if (!SHA256.test(String(review?.artifactSha256 || '')))
    issues.push('artifactSha256 must bind the inspected artifact or package');
  if (benchmarkCase?.source?.sha256 && benchmarkCase.source.sha256 !== review?.sourceSha256)
    issues.push('sourceSha256 does not match the benchmark case');
  if (benchmarkCase?.artifactSha256 && benchmarkCase.artifactSha256 !== review?.artifactSha256)
    issues.push('artifactSha256 does not match the benchmark case');
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(String(review?.reviewedAt || '')) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(review?.reviewedAt || '')) ||
    !Number.isFinite(Date.parse(review?.reviewedAt))
  ) {
    issues.push('reviewedAt must be a valid ISO timestamp');
  }
  const evaluator = review?.evaluator || {};
  if (!concreteText(evaluator.id, 3)) issues.push('evaluator.id must be a concrete pseudonymous identifier');
  if (!EVIDENCE_CLASS_ORDER.includes(evaluator.evidenceClass)) issues.push('evaluator.evidenceClass is invalid');
  if (evaluator.evidenceClass === 'human-qualified' && !isQualifiedHuman(review)) {
    issues.push(
      'human-qualified evidence requires qualification, independence, no conflict, domain match, and a current teaching role',
    );
  }
  if (evaluator.evidenceClass === 'model-judge') {
    if (
      !concreteText(evaluator.model, 3) ||
      !concreteText(evaluator.modelRevision, 3) ||
      !SHA256.test(String(evaluator.promptSha256 || ''))
    ) {
      issues.push('model-judge evidence requires exact model, revision, and promptSha256 provenance');
    }
  }
  if (!review?.ratings || typeof review.ratings !== 'object' || Array.isArray(review.ratings)) {
    issues.push('ratings must be an object with an explicit state for every criterion');
  }
  const ratings = review?.ratings || {};
  for (const criterion of criteria) {
    const rating = ratings[criterion.id];
    if (!rating) {
      issues.push(`${criterion.id} rating is missing; use not-evaluated or insufficient-evidence explicitly`);
      continue;
    }
    if (!RATING_STATES.has(rating.state)) {
      issues.push(`${criterion.id} has an invalid rating state`);
      continue;
    }
    if (rating.state === 'scored') {
      const score = Number(rating.score);
      if (!Number.isInteger(score) || score < 0 || score > 4)
        issues.push(`${criterion.id} score must be an integer from 0 to 4`);
      if (!(rating.evidence || []).some(validateEvidence))
        issues.push(`${criterion.id} requires concrete artifact evidence`);
      if (![0, 2, 4].includes(score) && !concreteText(rating.interpolationRationale, 12)) {
        issues.push(`${criterion.id} score ${score} requires an interpolationRationale`);
      }
      if (!CONFIDENCE_LEVELS.has(rating.confidence))
        issues.push(`${criterion.id} requires low, medium, or high confidence`);
    } else if (!concreteText(rating.rationale, 12)) {
      issues.push(`${criterion.id} ${rating.state} requires a concrete rationale`);
    }
  }
  for (const ratingId of Object.keys(ratings))
    if (!criterionIds.has(ratingId)) issues.push(`unknown criterion rating ${ratingId}`);
  if (!Array.isArray(review?.criticalFailures)) issues.push('criticalFailures must be an explicit array');
  for (const failure of review?.criticalFailures || []) {
    if (!failureIds.has(failure.id)) issues.push(`unknown critical failure ${failure.id || '<missing>'}`);
    if (failure.criterionId && !criterionIds.has(failure.criterionId)) {
      issues.push(`${failure.id || 'critical failure'} references unknown criterion ${failure.criterionId}`);
    }
    if (!validateEvidence(failure.evidence))
      issues.push(`${failure.id || 'critical failure'} requires concrete evidence`);
  }
  if (!review?.overall || typeof review.overall !== 'object' || Array.isArray(review.overall)) {
    issues.push('overall must be an explicit review summary');
  }
  const editMinutes = Number(review?.overall?.estimatedEditMinutes);
  if (!Number.isFinite(editMinutes) || editMinutes < 0)
    issues.push('overall.estimatedEditMinutes must be a non-negative number');
  if (!['as-is', 'minor-edits', 'major-edits', 'cannot-use'].includes(review?.overall?.editVerdict)) {
    issues.push('overall.editVerdict is invalid');
  }
  if (typeof review?.overall?.wouldUse !== 'boolean') issues.push('overall.wouldUse must be explicit');
  return { valid: issues.length === 0, issues, qualifiedHuman: isQualifiedHuman(review) };
}

function ordinalDistance(left, right, categoryCounts) {
  if (left === right) return 0;
  const low = Math.min(left, right);
  const high = Math.max(left, right);
  let mass = 0;
  for (let category = low; category <= high; category += 1) mass += categoryCounts.get(category) || 0;
  mass -= ((categoryCounts.get(low) || 0) + (categoryCounts.get(high) || 0)) / 2;
  return mass ** 2;
}

export function krippendorffOrdinalAlpha(units = []) {
  const usable = units.map((ratings) => ratings.filter(Number.isFinite)).filter((ratings) => ratings.length >= 2);
  const allRatings = usable.flat();
  if (usable.length === 0 || allRatings.length < 2) return null;
  const counts = new Map();
  for (const rating of allRatings) counts.set(rating, (counts.get(rating) || 0) + 1);
  let observedSum = 0;
  let observedCount = 0;
  for (const ratings of usable) {
    for (let left = 0; left < ratings.length; left += 1) {
      for (let right = 0; right < ratings.length; right += 1) {
        if (left === right) continue;
        observedSum += ordinalDistance(ratings[left], ratings[right], counts) / (ratings.length - 1);
      }
    }
    observedCount += ratings.length;
  }
  let expectedSum = 0;
  for (let left = 0; left < allRatings.length; left += 1) {
    for (let right = 0; right < allRatings.length; right += 1) {
      if (left === right) continue;
      expectedSum += ordinalDistance(allRatings[left], allRatings[right], counts);
    }
  }
  const observed = observedCount ? observedSum / observedCount : 0;
  const expected = allRatings.length > 1 ? expectedSum / (allRatings.length * (allRatings.length - 1)) : 0;
  if (expected === 0) return observed === 0 ? 1 : null;
  return 1 - observed / expected;
}

function pairAgreement(units) {
  let pairs = 0;
  let exact = 0;
  let adjacent = 0;
  for (const ratings of units) {
    for (let left = 0; left < ratings.length; left += 1) {
      for (let right = left + 1; right < ratings.length; right += 1) {
        pairs += 1;
        if (ratings[left] === ratings[right]) exact += 1;
        if (Math.abs(ratings[left] - ratings[right]) <= 1) adjacent += 1;
      }
    }
  }
  return {
    pairCount: pairs,
    exactAgreement: pairs ? exact / pairs : null,
    adjacentAgreement: pairs ? adjacent / pairs : null,
  };
}

export function bootstrapOrdinalReliability(units, { samples = 1000, seed = 'quality-reliability-v1' } = {}) {
  const usable = units.filter((ratings) => ratings.filter(Number.isFinite).length >= 2);
  const point = krippendorffOrdinalAlpha(usable);
  const agreement = pairAgreement(usable);
  if (!usable.length || !Number.isFinite(point)) {
    return { alpha: point, interval95: [null, null], unitCount: usable.length, ...agreement };
  }
  const random = seededRandom(seed);
  const bootstrapped = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const resampled = Array.from({ length: usable.length }, () => usable[Math.floor(random() * usable.length)]);
    const alpha = krippendorffOrdinalAlpha(resampled);
    if (Number.isFinite(alpha)) bootstrapped.push(alpha);
  }
  return {
    alpha: round(point),
    interval95: [round(quantile(bootstrapped, 0.025)), round(quantile(bootstrapped, 0.975))],
    bootstrapSamples: bootstrapped.length,
    unitCount: usable.length,
    pairCount: agreement.pairCount,
    exactAgreement: round(agreement.exactAgreement),
    adjacentAgreement: round(agreement.adjacentAgreement),
  };
}

function scoreBand(score, rubric) {
  if (!Number.isFinite(score)) return { label: 'unscored', meaning: 'Insufficient valid evidence to report a score.' };
  const band = (rubric?.scoring?.scoreBands || []).find((row) => score >= row.minimum && score <= row.maximum);
  return band
    ? { label: band.label, meaning: band.meaning }
    : { label: 'unscored', meaning: 'No score band is configured.' };
}

function chosenEvidenceClass(validReviews) {
  for (const evidenceClass of [...EVIDENCE_CLASS_ORDER].reverse()) {
    const matches = validReviews.filter((row) => row.review.evaluator.evidenceClass === evidenceClass);
    if (matches.length) return evidenceClass;
  }
  return null;
}

export function aggregateQualityReviews(reviews, rubric, { benchmarkCase = null, bootstrapSamples = 1000 } = {}) {
  const criteria = flattenRubric(rubric);
  const reviewRows = (reviews || []).map((review) => ({
    review,
    validation: validateQualityReview(review, rubric, { benchmarkCase }),
  }));
  const individuallyValidRows = reviewRows.filter((row) => row.validation.valid);
  const aggregateIssues = [];
  const expectedIdentity = individuallyValidRows[0]?.review || null;
  const seenReviewerEvidence = new Set();
  const validRows = [];
  for (const row of individuallyValidRows) {
    const review = row.review;
    const identityMatches =
      !expectedIdentity ||
      (review.caseId === expectedIdentity.caseId &&
        review.artifactId === expectedIdentity.artifactId &&
        review.artifactType === expectedIdentity.artifactType &&
        review.sourceSha256 === expectedIdentity.sourceSha256 &&
        review.artifactSha256 === expectedIdentity.artifactSha256);
    if (!identityMatches) {
      aggregateIssues.push(
        `${review?.evaluator?.id || '<unknown>'}: review identity or source/artifact hashes do not match this scorecard`,
      );
      continue;
    }
    const reviewerEvidenceKey = `${review.evaluator.evidenceClass}\u0000${review.evaluator.id}`;
    if (seenReviewerEvidence.has(reviewerEvidenceKey)) {
      aggregateIssues.push(
        `${review.evaluator.id}: duplicate ${review.evaluator.evidenceClass} review for the same artifact`,
      );
      continue;
    }
    seenReviewerEvidence.add(reviewerEvidenceKey);
    validRows.push(row);
  }
  const evidenceClass = chosenEvidenceClass(validRows);
  const selectedRows = validRows.filter((row) => row.review.evaluator.evidenceClass === evidenceClass);
  const dimensions = [];
  let scoredWeight = 0;
  let applicableWeight = 0;
  let criticalScoredWeight = 0;
  let criticalApplicableWeight = 0;
  const ratingUnits = [];
  const criterionResults = [];

  for (const criterion of criteria) {
    const ratings = selectedRows.map((row) => row.review.ratings?.[criterion.id]).filter(Boolean);
    const numeric = ratings.filter((rating) => rating.state === 'scored').map((rating) => Number(rating.score));
    const allNotApplicable = ratings.length > 0 && ratings.every((rating) => rating.state === 'not-applicable');
    const applicabilityDisagreement = ratings.some((rating) => rating.state === 'not-applicable') && numeric.length > 0;
    if (!allNotApplicable) {
      applicableWeight += criterion.normalizedWeight;
      if (criterion.dimensionCritical) criticalApplicableWeight += criterion.normalizedWeight;
    }
    if (numeric.length) {
      scoredWeight += criterion.normalizedWeight;
      if (criterion.dimensionCritical) criticalScoredWeight += criterion.normalizedWeight;
    }
    if (numeric.length >= 2) ratingUnits.push(numeric);
    criterionResults.push({
      id: criterion.id,
      dimensionId: criterion.dimensionId,
      state: allNotApplicable ? 'not-applicable' : numeric.length ? 'scored' : ratings[0]?.state || 'not-evaluated',
      score: round(mean(numeric), 2),
      minimum: numeric.length ? Math.min(...numeric) : null,
      maximum: numeric.length ? Math.max(...numeric) : null,
      ratingCount: numeric.length,
      applicabilityDisagreement,
      normalizedWeight: round(criterion.normalizedWeight, 4),
    });
  }

  for (const dimension of rubric.dimensions || []) {
    const rows = criterionResults.filter(
      (criterion) => criterion.dimensionId === dimension.id && criterion.state !== 'not-applicable',
    );
    const scored = rows.filter((criterion) => Number.isFinite(criterion.score));
    const localScoredWeight = scored.reduce((sum, criterion) => sum + criterion.normalizedWeight, 0);
    const localApplicableWeight = rows.reduce((sum, criterion) => sum + criterion.normalizedWeight, 0);
    const score = localScoredWeight
      ? (scored.reduce((sum, criterion) => sum + criterion.score * criterion.normalizedWeight, 0) / localScoredWeight) *
        25
      : null;
    dimensions.push({
      id: dimension.id,
      name: dimension.name,
      critical: dimension.critical === true,
      weight: dimension.weight,
      score: round(score, 1),
      coverage: localApplicableWeight ? round(localScoredWeight / localApplicableWeight) : null,
      criteria: rows,
    });
  }

  const scorableDimensions = dimensions.filter((dimension) => Number.isFinite(dimension.score));
  const profileWeight = scorableDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const uncappedProfileScore = profileWeight
    ? scorableDimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / profileWeight
    : null;
  const coverage = applicableWeight ? scoredWeight / applicableWeight : 0;
  const criticalCoverage = criticalApplicableWeight ? criticalScoredWeight / criticalApplicableWeight : 0;
  const reliability = bootstrapOrdinalReliability(ratingUnits, {
    samples: bootstrapSamples,
    seed: `${benchmarkCase?.id || reviews?.[0]?.caseId || 'case'}:ordinal-alpha`,
  });
  const uniqueQualifiedReviewers = new Set(
    validRows.filter((row) => row.validation.qualifiedHuman).map((row) => row.review.evaluator.id),
  ).size;
  const minimumReviewers = rubric.scoring.minimumQualifiedReviewers;
  const minimumReliabilityUnits = rubric.scoring.minimumReliabilityUnits;
  const reliabilityPass =
    reliability.unitCount >= minimumReliabilityUnits &&
    Number.isFinite(reliability.alpha) &&
    reliability.alpha >= rubric.scoring.minimumKrippendorffAlpha;
  const perReviewerCoverage = selectedRows.map((row) => {
    let reviewApplicableWeight = 0;
    let reviewScoredWeight = 0;
    let reviewCriticalApplicableWeight = 0;
    let reviewCriticalScoredWeight = 0;
    for (const criterion of criteria) {
      const rating = row.review.ratings?.[criterion.id];
      if (rating?.state === 'not-applicable') continue;
      reviewApplicableWeight += criterion.normalizedWeight;
      if (criterion.dimensionCritical) reviewCriticalApplicableWeight += criterion.normalizedWeight;
      if (rating?.state === 'scored') {
        reviewScoredWeight += criterion.normalizedWeight;
        if (criterion.dimensionCritical) reviewCriticalScoredWeight += criterion.normalizedWeight;
      }
    }
    return {
      evaluatorId: row.review.evaluator.id,
      coverage: round(reviewApplicableWeight ? reviewScoredWeight / reviewApplicableWeight : 0),
      criticalCoverage: round(
        reviewCriticalApplicableWeight ? reviewCriticalScoredWeight / reviewCriticalApplicableWeight : 0,
      ),
    };
  });
  const applicabilityDisagreementCount = criterionResults.filter(
    (criterion) => criterion.applicabilityDisagreement,
  ).length;
  const independentCoveragePass =
    perReviewerCoverage.length >= minimumReviewers &&
    perReviewerCoverage.every(
      (row) =>
        row.coverage >= rubric.scoring.minimumCoverageForValidatedBand &&
        row.criticalCoverage >= rubric.scoring.minimumCoverageForValidatedBand,
    ) &&
    applicabilityDisagreementCount === 0;

  let validationTier = 'unscored';
  if (evidenceClass === 'deterministic') validationTier = 'automated-signal';
  if (evidenceClass === 'model-judge') validationTier = 'model-provisional';
  if (['human-other', 'human-qualified'].includes(evidenceClass)) validationTier = 'human-reviewed';
  if (evidenceClass === 'human-qualified' && uniqueQualifiedReviewers >= minimumReviewers) {
    validationTier = reliabilityPass && independentCoveragePass ? 'independently-validated' : 'human-reviewed-disputed';
  }

  const failurePolicy = new Map((rubric.criticalFailures || []).map((failure) => [failure.id, failure]));
  const failureRows = [];
  const seenFailures = new Set();
  const failureSourceRows = validRows.filter(
    (row) =>
      row.review.evaluator.evidenceClass === evidenceClass || row.review.evaluator.evidenceClass === 'deterministic',
  );
  for (const row of failureSourceRows) {
    for (const failure of row.review.criticalFailures || []) {
      const key = `${failure.id}:${failure.criterionId || ''}:${failure.evidence?.artifact || ''}:${failure.evidence?.location || ''}`;
      if (seenFailures.has(key)) continue;
      seenFailures.add(key);
      failureRows.push({
        ...failurePolicy.get(failure.id),
        ...failure,
        evaluatorId: row.review.evaluator.id,
        evidenceClass: row.review.evaluator.evidenceClass,
      });
    }
  }

  const caps = [];
  const configuredEvidenceCap = rubric.scoring.evidenceCaps?.[validationTier];
  if (Number.isFinite(configuredEvidenceCap))
    caps.push({ source: `evidence-tier:${validationTier}`, cap: configuredEvidenceCap });
  if (coverage < rubric.scoring.minimumCoverageForScore)
    caps.push({ source: 'evidence-coverage-below-score-floor', cap: 0 });
  else if (coverage < rubric.scoring.minimumCoverageForPilotBand)
    caps.push({ source: 'evidence-coverage-below-pilot', cap: 69 });
  else if (coverage < rubric.scoring.minimumCoverageForValidatedBand)
    caps.push({ source: 'evidence-coverage-below-validation', cap: 79 });
  if (criticalCoverage < rubric.scoring.minimumCoverageForValidatedBand)
    caps.push({ source: 'critical-dimension-evidence-gap', cap: 89 });
  for (const failure of failureRows)
    if (Number.isFinite(failure.scoreCap))
      caps.push({ source: `critical-failure:${failure.id}`, cap: failure.scoreCap });
  const scoreCap = caps.length ? Math.min(...caps.map((row) => row.cap)) : 100;
  const reportedScore =
    Number.isFinite(uncappedProfileScore) && scoreCap > 0 ? Math.min(uncappedProfileScore, scoreCap) : null;
  const allApplicablePerfect = criterionResults
    .filter((criterion) => criterion.state !== 'not-applicable')
    .every((criterion) => criterion.score === 4);
  const perfectScoreEligible =
    reportedScore === 100 &&
    allApplicablePerfect &&
    failureRows.length === 0 &&
    coverage >= 0.95 &&
    validationTier === 'independently-validated' &&
    benchmarkCase?.split === 'heldout' &&
    benchmarkCase?.source?.verified === true &&
    benchmarkCase?.exportVerified === true;
  const finalReportedScore = reportedScore === 100 && !perfectScoreEligible ? 99 : reportedScore;
  const band = scoreBand(finalReportedScore, rubric);
  const confidence =
    validationTier === 'independently-validated' && coverage >= 0.95 && reliability.interval95?.[0] >= 0.5
      ? 'high'
      : ['human-reviewed', 'human-reviewed-disputed'].includes(validationTier) && coverage >= 0.8
        ? 'medium'
        : 'low';

  return {
    schemaVersion: 1,
    rubricVersion: rubric.rubricVersion,
    caseId: benchmarkCase?.id || reviews?.[0]?.caseId || '',
    artifactId: reviews?.[0]?.artifactId || '',
    artifactType: reviews?.[0]?.artifactType || '',
    sourceSha256: reviews?.[0]?.sourceSha256 || '',
    artifactSha256: reviews?.[0]?.artifactSha256 || '',
    validation: {
      tier: validationTier,
      confidence,
      selectedEvidenceClass: evidenceClass,
      validReviewCount: validRows.length,
      selectedReviewCount: selectedRows.length,
      uniqueQualifiedReviewerCount: uniqueQualifiedReviewers,
      reliabilityPass,
      independentCoveragePass,
      applicabilityDisagreementCount,
      perReviewerCoverage,
      reliability,
    },
    scores: {
      uncappedProfileScore: round(uncappedProfileScore, 1),
      reportedScore: round(finalReportedScore, 1),
      scoreCap,
      band,
      coverage: round(coverage),
      criticalCoverage: round(criticalCoverage),
      perfectScoreEligible,
      caps,
    },
    dimensions,
    criticalFailures: failureRows,
    editBurden: {
      medianMinutes: round(median(selectedRows.map((row) => Number(row.review.overall?.estimatedEditMinutes))), 1),
      wouldUseRate: round(mean(selectedRows.map((row) => (row.review.overall?.wouldUse === true ? 1 : 0)))),
      verdicts: Object.fromEntries(
        ['as-is', 'minor-edits', 'major-edits', 'cannot-use'].map((verdict) => [
          verdict,
          selectedRows.filter((row) => row.review.overall?.editVerdict === verdict).length,
        ]),
      ),
    },
    reviewValidationIssues: [
      ...reviewRows.flatMap((row) =>
        row.validation.issues.map((issue) => `${row.review?.evaluator?.id || '<unknown>'}: ${issue}`),
      ),
      ...aggregateIssues,
    ],
  };
}

export function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return [null, null];
  const proportion = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = (proportion + z ** 2 / (2 * trials)) / denominator;
  const margin = (z * Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * trials)) / trials)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function bootstrapPaired(values, statistic, { samples = 5000, seed = 'paired-bootstrap-v1' } = {}) {
  if (!values.length) return { estimate: null, interval95: [null, null], samples: 0 };
  const random = seededRandom(seed);
  const estimates = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const resampled = Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]);
    estimates.push(statistic(resampled));
  }
  return {
    estimate: round(statistic(values), 3),
    interval95: [round(quantile(estimates, 0.025), 3), round(quantile(estimates, 0.975), 3)],
    samples: estimates.length,
  };
}

function outputOperationalSummary(trials, side) {
  const outputs = trials.map((trial) => trial.outputs?.[side]).filter(Boolean);
  const succeeded = outputs.filter((output) => output.status === 'success');
  const burdenFields = ['scionCalls', 'repairCalls', 'rejectedAtoms', 'recoveredAtoms'];
  return {
    attempts: outputs.length,
    successes: succeeded.length,
    failures: outputs.length - succeeded.length,
    successRate: round(outputs.length ? succeeded.length / outputs.length : null),
    meanLatencyMs: round(mean(outputs.map((output) => Number(output.latencyMs))), 1),
    medianLatencyMs: round(median(outputs.map((output) => Number(output.latencyMs))), 1),
    successConditionedMeanLatencyMs: round(mean(succeeded.map((output) => Number(output.latencyMs))), 1),
    meanCostUsd: round(mean(outputs.map((output) => Number(output.costUsd))), 5),
    totalCostUsd: round(
      outputs.reduce((sum, output) => sum + (Number(output.costUsd) || 0), 0),
      5,
    ),
    meanProviderCalls: round(mean(outputs.map((output) => Number(output.providerCalls))), 2),
    compilerBurden: Object.fromEntries(
      burdenFields.map((field) => [
        field,
        {
          mean: round(mean(succeeded.map((output) => Number(output.compilerBurden?.[field]))), 2),
          total: succeeded.reduce((sum, output) => sum + (Number(output.compilerBurden?.[field]) || 0), 0),
        },
      ]),
    ),
  };
}

function preferenceOutcome(preference, randomization) {
  if (preference.preference === 'tie') return 'tie';
  if (!['A', 'B'].includes(preference.preference)) return null;
  if (randomization?.candidateLabel === preference.preference) return 'candidate';
  if (randomization?.controlLabel === preference.preference) return 'control';
  return null;
}

export function analyzeModelComparison(comparison, { bootstrapSamples = 5000, verifiedScorecardSha256s = [] } = {}) {
  const issues = [];
  const verifiedScorecards = new Set(verifiedScorecardSha256s);
  if (comparison?.schemaVersion !== 1) issues.push('comparison schemaVersion must be 1');
  if (comparison?.protocolVersion !== '1.0.0') issues.push('comparison protocolVersion must be 1.0.0');
  if (!concreteText(comparison?.comparisonId, 4)) issues.push('comparisonId is required');
  const createdAt = Date.parse(comparison?.createdAt);
  const frozenAt = Date.parse(comparison?.preregistration?.frozenAt);
  if (!Number.isFinite(createdAt)) issues.push('createdAt must be a valid timestamp');
  if (!Number.isFinite(frozenAt)) issues.push('preregistration.frozenAt must be a valid timestamp');
  if (Number.isFinite(createdAt) && Number.isFinite(frozenAt) && frozenAt > createdAt)
    issues.push('preregistration must be frozen before the comparison record is created');
  for (const field of ['analysisPlanSha256', 'corpusManifestSha256']) {
    if (!SHA256.test(String(comparison?.preregistration?.[field] || '')))
      issues.push(`preregistration.${field} must be SHA-256`);
  }
  const minimumTrialsPerCase = Number(comparison?.preregistration?.minimumTrialsPerCase);
  if (!Number.isInteger(minimumTrialsPerCase) || minimumTrialsPerCase < 3)
    issues.push('preregistration.minimumTrialsPerCase must be at least 3');
  if (!concreteText(comparison?.preregistration?.stoppingRule, 20))
    issues.push('preregistration.stoppingRule is required');
  if (!concreteText(comparison?.preregistration?.exclusionPolicy, 20))
    issues.push('preregistration.exclusionPolicy is required');
  const declaredCaseIds = comparison?.preregistration?.caseIds || [];
  if (!Array.isArray(declaredCaseIds) || !declaredCaseIds.length) {
    issues.push('preregistration.caseIds must predeclare every comparison case');
  }
  const declaredCaseSet = new Set(declaredCaseIds);
  if (declaredCaseSet.size !== declaredCaseIds.length || declaredCaseIds.some((id) => !concreteText(id, 3))) {
    issues.push('preregistration.caseIds must contain unique concrete identifiers');
  }
  const requiredQualifiedPreferencesPerTrial = Number(
    comparison?.preregistration?.requiredQualifiedPreferencesPerTrial,
  );
  if (!Number.isInteger(requiredQualifiedPreferencesPerTrial) || requiredQualifiedPreferencesPerTrial < 2) {
    issues.push('preregistration.requiredQualifiedPreferencesPerTrial must be at least 2');
  }
  if (!concreteText(comparison?.environment?.compilerCommit, 7)) issues.push('environment.compilerCommit is required');
  if (comparison?.environment?.dirtyTree !== false)
    issues.push('comparison must be generated from a declared clean compiler tree');
  const modelRows = comparison?.models || [];
  const models = new Map();
  for (const model of modelRows) {
    if (!concreteText(model?.id, 2)) issues.push('every comparison model requires a concrete id');
    else if (models.has(model.id)) issues.push(`duplicate comparison model id ${model.id}`);
    else models.set(model.id, model);
    for (const field of ['provider', 'model', 'revision']) {
      if (!concreteText(model[field], 3)) issues.push(`model ${model.id} requires ${field}`);
    }
    if (!SHA256.test(String(model.promptSha256 || ''))) issues.push(`model ${model.id} promptSha256 must be SHA-256`);
    if (!SHA256.test(String(model.configurationSha256 || '')))
      issues.push(`model ${model.id} configurationSha256 must be SHA-256`);
    if (!model.parameters || typeof model.parameters !== 'object')
      issues.push(`model ${model.id} requires explicit parameters`);
    if (model.compilerCommit !== comparison?.environment?.compilerCommit)
      issues.push(`model ${model.id} compilerCommit must match the comparison environment`);
    if (!concreteText(model.graderVersion, 3)) issues.push(`model ${model.id} requires graderVersion`);
  }
  const candidateId = comparison?.candidateId;
  const controlId = comparison?.controlId;
  if (!concreteText(candidateId, 2) || !models.has(candidateId))
    issues.push('candidateId must identify a registered model');
  if (!concreteText(controlId, 2) || !models.has(controlId)) issues.push('controlId must identify a registered model');
  if (candidateId && candidateId === controlId) issues.push('candidateId and controlId must be different');
  const trials = comparison?.trials || [];
  const pairedDeltas = [];
  const pairedLatencyDeltas = [];
  const burdenDeltaFields = ['scionCalls', 'repairCalls', 'rejectedAtoms', 'recoveredAtoms'];
  const burdenDeltas = new Map(burdenDeltaFields.map((field) => [field, []]));
  const dimensionDeltas = new Map();
  const humanOutcomes = [];
  const advisoryModelOutcomes = [];
  const byDeliverable = new Map();
  const byCase = new Map();
  const trialIndexesByCase = new Map();
  const observedCaseBindings = new Map();
  const seenTrialKeys = new Set();
  const seenGenerationSeeds = new Set();
  const seenBlindingSeeds = new Set();
  const seenOutputPairs = new Set();
  const qualifiedReviewersByTrial = new Map();
  const scoreEvidenceTiers = new Set();
  for (const trial of trials) {
    const prefix = `${trial.caseId || '<case>'}/trial-${trial.trialIndex ?? '?'}`;
    if (!declaredCaseSet.has(trial.caseId)) issues.push(`${prefix} was not predeclared in preregistration.caseIds`);
    if (!Number.isInteger(trial.trialIndex) || trial.trialIndex < 1)
      issues.push(`${prefix} requires a positive integer trialIndex`);
    const trialKey = `${trial.caseId}\u0000${trial.trialIndex}`;
    if (seenTrialKeys.has(trialKey)) issues.push(`${prefix} duplicates a case/trial row`);
    seenTrialKeys.add(trialKey);
    if (!SHA256.test(String(trial.sourceSha256 || ''))) issues.push(`${prefix} requires sourceSha256`);
    if (!SHA256.test(String(trial.matchedInputSha256 || ''))) issues.push(`${prefix} requires matchedInputSha256`);
    if (!SHA256.test(String(trial.matchedSettingsSha256 || '')))
      issues.push(`${prefix} requires matchedSettingsSha256`);
    if (!concreteText(trial.seed, 3)) issues.push(`${prefix} requires a generation seed`);
    const generationSeedKey = `${trial.caseId}\u0000${trial.seed}`;
    if (seenGenerationSeeds.has(generationSeedKey)) issues.push(`${prefix} reuses a generation seed within the case`);
    seenGenerationSeeds.add(generationSeedKey);
    if (!['dev', 'calibration', 'heldout'].includes(trial.split))
      issues.push(`${prefix} requires a valid corpus split`);
    if (!concreteText(trial.deliverableType, 3)) issues.push(`${prefix} requires deliverableType`);
    const indexes = trialIndexesByCase.get(trial.caseId) || new Set();
    indexes.add(trial.trialIndex);
    trialIndexesByCase.set(trial.caseId, indexes);
    const binding = observedCaseBindings.get(trial.caseId);
    const nextBinding = {
      split: trial.split,
      sourceSha256: trial.sourceSha256,
      matchedInputSha256: trial.matchedInputSha256,
      matchedSettingsSha256: trial.matchedSettingsSha256,
    };
    if (binding && Object.keys(nextBinding).some((field) => binding[field] !== nextBinding[field])) {
      issues.push(`${prefix} changes a source, input, split, or non-model setting within the same case`);
    } else if (!binding) observedCaseBindings.set(trial.caseId, nextBinding);
    if (
      !['A', 'B'].includes(trial.randomization?.candidateLabel) ||
      !['A', 'B'].includes(trial.randomization?.controlLabel) ||
      trial.randomization?.candidateLabel === trial.randomization?.controlLabel
    ) {
      issues.push(`${prefix} requires a valid blinded A/B label mapping`);
    }
    if (!concreteText(trial.randomization?.seed, 4) || !concreteText(trial.randomization?.method, 8)) {
      issues.push(`${prefix} requires randomization seed and method`);
    }
    if (seenBlindingSeeds.has(trial.randomization?.seed)) issues.push(`${prefix} reuses a blinding seed`);
    seenBlindingSeeds.add(trial.randomization?.seed);
    for (const side of ['candidate', 'control']) {
      const output = trial.outputs?.[side];
      const expectedModelId = side === 'candidate' ? candidateId : controlId;
      if (!output || !models.has(output.modelId)) issues.push(`${prefix} ${side} output requires a registered modelId`);
      if (output?.modelId !== expectedModelId) issues.push(`${prefix} ${side} output modelId must equal ${side}Id`);
      if (!OUTPUT_STATUSES.has(output?.status)) {
        issues.push(`${prefix} ${side} output has an invalid status`);
      }
      if (output?.status === 'success' && !SHA256.test(String(output.outputSha256 || '')))
        issues.push(`${prefix} ${side} success requires outputSha256`);
      for (const field of ['latencyMs', 'costUsd']) {
        const value = Number(output?.[field]);
        if (!Number.isFinite(value) || value < 0) issues.push(`${prefix} ${side} requires non-negative ${field}`);
      }
      for (const field of ['providerCalls', 'retryCount']) {
        const value = Number(output?.[field]);
        if (!Number.isInteger(value) || value < 0)
          issues.push(`${prefix} ${side} requires non-negative integer ${field}`);
      }
      for (const field of burdenDeltaFields) {
        const value = Number(output?.compilerBurden?.[field]);
        if (!Number.isInteger(value) || value < 0)
          issues.push(`${prefix} ${side} compilerBurden requires non-negative integer ${field}`);
      }
      const score = output?.benchmarkScore;
      const dimensions = output?.dimensionScores || {};
      if (score !== null && score !== undefined) {
        if (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100)
          issues.push(`${prefix} ${side} benchmarkScore must be between 0 and 100`);
        const evidence = output?.scoreEvidence;
        const tierMatchesEvidenceClass =
          (evidence?.evidenceClass === 'deterministic' && evidence?.validationTier === 'automated-signal') ||
          (evidence?.evidenceClass === 'model-judge' && evidence?.validationTier === 'model-provisional') ||
          (evidence?.evidenceClass === 'human-other' && evidence?.validationTier === 'human-reviewed') ||
          (evidence?.evidenceClass === 'human-qualified' &&
            ['human-reviewed', 'human-reviewed-disputed', 'independently-validated'].includes(
              evidence?.validationTier,
            ));
        if (
          !evidence ||
          !SHA256.test(String(evidence.rubricSha256 || '')) ||
          !SHA256.test(String(evidence.scorecardSha256 || '')) ||
          !concreteText(evidence.scorecardPath, 3) ||
          evidence.rubricVersion !== '1.0.0' ||
          !EVIDENCE_CLASS_ORDER.includes(evidence.evidenceClass) ||
          !SCORE_EVIDENCE_TIERS.has(evidence.validationTier) ||
          !tierMatchesEvidenceClass ||
          !verifiedScorecards.has(evidence.scorecardSha256) ||
          evidence.sourceSha256 !== trial.sourceSha256 ||
          evidence.artifactSha256 !== output?.outputSha256
        ) {
          issues.push(
            `${prefix} ${side} benchmarkScore requires a byte-verified scorecard plus exact rubric, source, artifact, and evidence-tier provenance`,
          );
        } else {
          scoreEvidenceTiers.add(`${evidence.evidenceClass}:${evidence.validationTier}`);
        }
        for (const [dimensionId, value] of Object.entries(dimensions)) {
          if (
            !concreteText(dimensionId, 2) ||
            !Number.isFinite(Number(value)) ||
            Number(value) < 0 ||
            Number(value) > 100
          )
            issues.push(`${prefix} ${side} has an invalid dimension score ${dimensionId || '<missing>'}`);
        }
      } else if (Object.keys(dimensions).length) {
        issues.push(`${prefix} ${side} cannot report dimensionScores without a benchmarkScore`);
      }
    }
    const candidate = trial.outputs?.candidate;
    const control = trial.outputs?.control;
    if (candidate?.status === 'success' && control?.status === 'success') {
      const outputPairKey = `${candidate.outputSha256}\u0000${control.outputSha256}`;
      if (seenOutputPairs.has(outputPairKey)) issues.push(`${prefix} duplicates a candidate/control output pair`);
      seenOutputPairs.add(outputPairKey);
    }
    if (
      candidate?.status === 'success' &&
      control?.status === 'success' &&
      Number.isFinite(Number(candidate.benchmarkScore)) &&
      Number.isFinite(Number(control.benchmarkScore))
    ) {
      const candidateEvidence = candidate.scoreEvidence;
      const controlEvidence = control.scoreEvidence;
      const comparableEvidence =
        candidateEvidence &&
        controlEvidence &&
        candidateEvidence.rubricVersion === controlEvidence.rubricVersion &&
        candidateEvidence.rubricSha256 === controlEvidence.rubricSha256 &&
        candidateEvidence.evidenceClass === controlEvidence.evidenceClass &&
        candidateEvidence.validationTier === controlEvidence.validationTier;
      if (!comparableEvidence) {
        issues.push(`${prefix} candidate and control scores must use the same rubric and evidence tier`);
      } else {
        const delta = Number(candidate.benchmarkScore) - Number(control.benchmarkScore);
        pairedDeltas.push(delta);
        const caseRows = byCase.get(trial.caseId) || [];
        caseRows.push(delta);
        byCase.set(trial.caseId, caseRows);
        const deliverableRows = byDeliverable.get(trial.deliverableType) || [];
        deliverableRows.push(delta);
        byDeliverable.set(trial.deliverableType, deliverableRows);
        const dimensionIds = new Set([
          ...Object.keys(candidate.dimensionScores || {}),
          ...Object.keys(control.dimensionScores || {}),
        ]);
        for (const dimensionId of dimensionIds) {
          const candidateScore = Number(candidate.dimensionScores?.[dimensionId]);
          const controlScore = Number(control.dimensionScores?.[dimensionId]);
          if (!Number.isFinite(candidateScore) || !Number.isFinite(controlScore)) continue;
          const rows = dimensionDeltas.get(dimensionId) || [];
          rows.push(candidateScore - controlScore);
          dimensionDeltas.set(dimensionId, rows);
        }
      }
    }
    if (candidate?.status === 'success' && control?.status === 'success') {
      pairedLatencyDeltas.push(Number(candidate.latencyMs) - Number(control.latencyMs));
      for (const field of burdenDeltaFields) {
        burdenDeltas
          .get(field)
          .push(Number(candidate.compilerBurden?.[field]) - Number(control.compilerBurden?.[field]));
      }
    }
    const seenPreferenceReviewers = new Set();
    for (const preference of trial.preferences || []) {
      const outcome = preferenceOutcome(preference, trial.randomization);
      const validTimestamp = Number.isFinite(Date.parse(preference.reviewedAt));
      const rationale = concreteText(preference.rationale, 20);
      const blinded = preference.blinded === true;
      const reviewerId = preference.reviewerId;
      const preferenceKey = `${preference.evidenceClass}\u0000${reviewerId}`;
      const duplicatePreference = seenPreferenceReviewers.has(preferenceKey);
      seenPreferenceReviewers.add(preferenceKey);
      const artifactsBound =
        preference.candidateArtifactSha256 === candidate?.outputSha256 &&
        preference.controlArtifactSha256 === control?.outputSha256;
      const afterFreeze =
        validTimestamp && (!Number.isFinite(frozenAt) || Date.parse(preference.reviewedAt) >= frozenAt);
      if (
        !outcome ||
        !afterFreeze ||
        !rationale ||
        !blinded ||
        !concreteText(reviewerId, 3) ||
        !artifactsBound ||
        duplicatePreference
      ) {
        issues.push(`${prefix} has an invalid pairwise preference from ${preference.reviewerId || '<unknown>'}`);
        continue;
      }
      const qualifiedHuman =
        preference.evidenceClass === 'human-qualified' &&
        preference.qualified === true &&
        preference.independent === true &&
        preference.conflictOfInterest === false &&
        preference.domainMatch === true &&
        concreteText(preference.currentTeachingRole, 4);
      if (qualifiedHuman) {
        humanOutcomes.push({ outcome, caseId: trial.caseId, trialKey, reviewerId });
        const reviewers = qualifiedReviewersByTrial.get(trialKey) || new Set();
        reviewers.add(reviewerId);
        qualifiedReviewersByTrial.set(trialKey, reviewers);
      } else if (preference.evidenceClass === 'model-judge')
        advisoryModelOutcomes.push({
          outcome,
          caseId: trial.caseId,
          reviewerId: preference.reviewerId,
          order: preference.order,
        });
    }
  }
  if (Number.isInteger(minimumTrialsPerCase)) {
    for (const caseId of declaredCaseSet) {
      const count = trialIndexesByCase.get(caseId)?.size || 0;
      if (count < minimumTrialsPerCase)
        issues.push(`${caseId} has ${count} distinct trials; preregistration requires ${minimumTrialsPerCase}`);
    }
  }
  let qualifiedPreferenceCompleteTrials = 0;
  for (const trial of trials) {
    const trialKey = `${trial.caseId}\u0000${trial.trialIndex}`;
    const count = qualifiedReviewersByTrial.get(trialKey)?.size || 0;
    if (count >= requiredQualifiedPreferencesPerTrial) qualifiedPreferenceCompleteTrials += 1;
  }

  const humanCounts = { candidate: 0, control: 0, tie: 0 };
  for (const row of humanOutcomes) humanCounts[row.outcome] += 1;
  const effectiveWins = humanCounts.candidate + humanCounts.tie * 0.5;
  const effectiveWinRate = humanOutcomes.length ? effectiveWins / humanOutcomes.length : null;
  const winInterval = wilsonInterval(effectiveWins, humanOutcomes.length);
  const modelCounts = { candidate: 0, control: 0, tie: 0 };
  for (const row of advisoryModelOutcomes) modelCounts[row.outcome] += 1;
  const modelCases = new Map();
  for (const row of advisoryModelOutcomes) {
    const rows = modelCases.get(row.caseId) || [];
    rows.push(row);
    modelCases.set(row.caseId, rows);
  }
  const positionSensitiveCases = [...modelCases.entries()]
    .filter(([, rows]) => {
      const orders = new Set(rows.map((row) => row.order));
      const outcomes = new Set(rows.map((row) => row.outcome));
      return orders.size < 2 || outcomes.size > 1;
    })
    .map(([caseId]) => caseId);

  return {
    schemaVersion: 1,
    comparisonId: comparison?.comparisonId || '',
    candidateId: comparison?.candidateId || '',
    controlId: comparison?.controlId || '',
    status: issues.length
      ? 'invalid'
      : qualifiedPreferenceCompleteTrials === trials.length && trials.length > 0
        ? 'measured-for-declared-scope'
        : humanOutcomes.length
          ? 'partial-measurement'
          : 'awaiting-qualified-preferences',
    claimBoundary:
      'Effects apply only to the bound corpus, model revisions, prompts, settings, compiler, and trial protocol. Model-judge preferences are advisory and never counted as instructor evidence.',
    issues,
    trialCount: trials.length,
    declaredCaseCount: declaredCaseSet.size,
    splitCounts: trials.reduce((counts, trial) => ({ ...counts, [trial.split]: (counts[trial.split] || 0) + 1 }), {}),
    scoreEvidenceTiers: [...scoreEvidenceTiers].sort(),
    absoluteScoreEffect: {
      pairedTrialCount: pairedDeltas.length,
      candidateMinusControlMean: bootstrapPaired(pairedDeltas, (rows) => mean(rows), {
        samples: bootstrapSamples,
        seed: `${comparison?.comparisonId}:mean`,
      }),
      candidateMinusControlMedian: bootstrapPaired(pairedDeltas, (rows) => median(rows), {
        samples: bootstrapSamples,
        seed: `${comparison?.comparisonId}:median`,
      }),
      byDeliverable: Object.fromEntries(
        [...byDeliverable.entries()].map(([id, rows]) => [
          id,
          {
            count: rows.length,
            meanDelta: round(mean(rows), 2),
            medianDelta: round(median(rows), 2),
          },
        ]),
      ),
      byCase: Object.fromEntries(
        [...byCase.entries()].map(([id, rows]) => [
          id,
          {
            count: rows.length,
            meanDelta: round(mean(rows), 2),
            medianDelta: round(median(rows), 2),
            meanDeltaInterval95: bootstrapPaired(rows, (values) => mean(values), {
              samples: bootstrapSamples,
              seed: `${comparison?.comparisonId}:case:${id}`,
            }).interval95,
          },
        ]),
      ),
      byDimension: Object.fromEntries(
        [...dimensionDeltas.entries()].map(([id, rows]) => [
          id,
          {
            count: rows.length,
            meanDelta: round(mean(rows), 2),
            medianDelta: round(median(rows), 2),
          },
        ]),
      ),
    },
    qualifiedPairwisePreference: {
      count: humanOutcomes.length,
      requiredPerTrial: Number.isInteger(requiredQualifiedPreferencesPerTrial)
        ? requiredQualifiedPreferencesPerTrial
        : null,
      completeTrials: qualifiedPreferenceCompleteTrials,
      wins: humanCounts.candidate,
      losses: humanCounts.control,
      ties: humanCounts.tie,
      effectiveWinRate: round(effectiveWinRate),
      wilson95: winInterval.map((value) => round(value)),
      uniqueReviewers: new Set(humanOutcomes.map((row) => row.reviewerId)).size,
    },
    advisoryModelJudge: {
      count: advisoryModelOutcomes.length,
      wins: modelCounts.candidate,
      losses: modelCounts.control,
      ties: modelCounts.tie,
      positionSensitiveOrIncompleteCases: positionSensitiveCases,
      usableForPrimaryClaim: false,
    },
    operations: {
      candidate: outputOperationalSummary(trials, 'candidate'),
      control: outputOperationalSummary(trials, 'control'),
      candidateMinusControlLatencyMs: bootstrapPaired(pairedLatencyDeltas, (rows) => mean(rows), {
        samples: bootstrapSamples,
        seed: `${comparison?.comparisonId}:latency`,
      }),
      candidateMinusControlCompilerBurden: Object.fromEntries(
        burdenDeltaFields.map((field) => [
          field,
          bootstrapPaired(burdenDeltas.get(field), (rows) => mean(rows), {
            samples: bootstrapSamples,
            seed: `${comparison?.comparisonId}:burden:${field}`,
          }),
        ]),
      ),
    },
  };
}

function pearsonCorrelation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftScale = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0));
  const rightScale = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return leftScale && rightScale ? numerator / (leftScale * rightScale) : null;
}

function bootstrapMetricPairs(pairs, metric, { samples = 2000, seed = 'judge-calibration-v1' } = {}) {
  if (!pairs.length) return [null, null];
  const random = seededRandom(seed);
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const rows = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    const value = metric(rows);
    if (Number.isFinite(value)) values.push(value);
  }
  return [round(quantile(values, 0.025)), round(quantile(values, 0.975))];
}

export function calibrateModelJudge(
  reviews,
  rubric,
  {
    minimumCases = 4,
    minimumPairedCriteria = 52,
    maximumMeanAbsoluteError = 0.75,
    minimumWithinOneRate = 0.85,
    bootstrapSamples = 2000,
  } = {},
) {
  const validated = (reviews || []).map((review) => ({ review, validation: validateQualityReview(review, rubric) }));
  const humans = validated
    .filter((row) => row.validation.valid && row.validation.qualifiedHuman)
    .map((row) => row.review);
  const models = validated
    .filter((row) => row.validation.valid && row.review.evaluator.evidenceClass === 'model-judge')
    .map((row) => row.review);
  const judgeIdentities = new Map();
  for (const review of models) {
    const evaluator = review.evaluator;
    const key = `${evaluator.model}\u0000${evaluator.modelRevision}\u0000${evaluator.promptSha256}`;
    if (!judgeIdentities.has(key)) {
      judgeIdentities.set(key, {
        model: evaluator.model,
        modelRevision: evaluator.modelRevision,
        promptSha256: evaluator.promptSha256,
      });
    }
  }
  const selectedJudgeKey = judgeIdentities.keys().next().value || '';
  const criteria = flattenRubric(rubric);
  const criterionMap = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const units = new Map();
  for (const review of [...humans, ...models]) {
    const evaluator = review.evaluator;
    const judgeKey = `${evaluator.model}\u0000${evaluator.modelRevision}\u0000${evaluator.promptSha256}`;
    if (evaluator.evidenceClass === 'model-judge' && judgeKey !== selectedJudgeKey) continue;
    for (const [criterionId, rating] of Object.entries(review.ratings || {})) {
      if (rating.state !== 'scored' || !criterionMap.has(criterionId)) continue;
      const key = `${review.caseId}\u0000${review.artifactId}\u0000${review.artifactType}\u0000${review.sourceSha256}\u0000${review.artifactSha256}\u0000${criterionId}`;
      const unit = units.get(key) || {
        caseId: review.caseId,
        artifactId: review.artifactId,
        artifactType: review.artifactType,
        criterionId,
        dimensionId: criterionMap.get(criterionId).dimensionId,
        sourceSha256: review.sourceSha256,
        artifactSha256: review.artifactSha256,
        human: new Map(),
        model: new Map(),
      };
      unit[review.evaluator.evidenceClass === 'model-judge' ? 'model' : 'human'].set(
        review.evaluator.id,
        Number(rating.score),
      );
      units.set(key, unit);
    }
  }
  const pairs = [...units.values()]
    .filter((unit) => unit.human.size >= 2 && unit.model.size)
    .map((unit) => {
      const humanRatings = [...unit.human.values()];
      const modelRatings = [...unit.model.values()];
      return {
        ...unit,
        human: undefined,
        model: undefined,
        humanReviewerCount: unit.human.size,
        modelJudgmentCount: unit.model.size,
        humanScore: mean(humanRatings),
        modelScore: mean(modelRatings),
        error: mean(modelRatings) - mean(humanRatings),
      };
    });
  const caseCount = new Set(pairs.map((pair) => pair.caseId)).size;
  const artifactCount = new Set(pairs.map((pair) => `${pair.caseId}:${pair.artifactId}`)).size;
  const meanAbsoluteError = mean(pairs.map((pair) => Math.abs(pair.error)));
  const signedBias = mean(pairs.map((pair) => pair.error));
  const withinOneRate = mean(pairs.map((pair) => (Math.abs(pair.error) <= 1 ? 1 : 0)));
  const correlation = pearsonCorrelation(
    pairs.map((pair) => pair.humanScore),
    pairs.map((pair) => pair.modelScore),
  );
  const byDimension = Object.fromEntries(
    (rubric.dimensions || []).map((dimension) => {
      const rows = pairs.filter((pair) => pair.dimensionId === dimension.id);
      return [
        dimension.id,
        {
          pairedCriteria: rows.length,
          meanAbsoluteError: round(mean(rows.map((row) => Math.abs(row.error)))),
          signedBias: round(mean(rows.map((row) => row.error))),
          withinOneRate: round(mean(rows.map((row) => (Math.abs(row.error) <= 1 ? 1 : 0)))),
        },
      ];
    }),
  );

  const failureIds = (rubric.criticalFailures || []).map((failure) => failure.id);
  const artifactUnits = new Map();
  for (const review of [...humans, ...models]) {
    const evaluator = review.evaluator;
    const judgeKey = `${evaluator.model}\u0000${evaluator.modelRevision}\u0000${evaluator.promptSha256}`;
    if (evaluator.evidenceClass === 'model-judge' && judgeKey !== selectedJudgeKey) continue;
    const key = `${review.caseId}\u0000${review.artifactId}\u0000${review.sourceSha256}\u0000${review.artifactSha256}`;
    const unit = artifactUnits.get(key) || { human: new Set(), model: new Set() };
    for (const failure of review.criticalFailures || []) {
      unit[review.evaluator.evidenceClass === 'model-judge' ? 'model' : 'human'].add(failure.id);
    }
    artifactUnits.set(key, unit);
  }
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const unit of artifactUnits.values()) {
    for (const failureId of failureIds) {
      const human = unit.human.has(failureId);
      const model = unit.model.has(failureId);
      if (human && model) truePositive += 1;
      else if (!human && model) falsePositive += 1;
      else if (human && !model) falseNegative += 1;
    }
  }
  const criticalPrecision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : null;
  const criticalRecall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null;
  const representedDimensionCount = new Set(pairs.map((pair) => pair.dimensionId)).size;
  const enoughEvidence =
    judgeIdentities.size === 1 &&
    caseCount >= minimumCases &&
    pairs.length >= minimumPairedCriteria &&
    representedDimensionCount === (rubric.dimensions || []).length;
  const accuracyPass =
    enoughEvidence && meanAbsoluteError <= maximumMeanAbsoluteError && withinOneRate >= minimumWithinOneRate;
  return {
    schemaVersion: 1,
    status:
      judgeIdentities.size > 1
        ? 'mixed-model-judge-identities'
        : accuracyPass
          ? 'calibrated-for-observed-scope'
          : enoughEvidence
            ? 'calibration-failed'
            : 'insufficient-calibration-evidence',
    claimBoundary:
      'Calibration applies only to the exact judge model, revision, prompt, rubric, deliverable types, disciplines, modalities, and risk strata represented by these paired reviews.',
    evidence: {
      qualifiedHumanReviews: humans.length,
      modelJudgeReviews: models.length,
      judgeIdentityCount: judgeIdentities.size,
      judgeIdentity: judgeIdentities.size === 1 ? [...judgeIdentities.values()][0] : null,
      caseCount,
      artifactCount,
      pairedCriterionCount: pairs.length,
      representedDimensionCount,
    },
    criteria: {
      minimumCases,
      minimumPairedCriteria,
      maximumMeanAbsoluteError,
      minimumWithinOneRate,
    },
    agreement: {
      meanAbsoluteError: round(meanAbsoluteError),
      meanAbsoluteErrorInterval95: bootstrapMetricPairs(pairs, (rows) => mean(rows.map((row) => Math.abs(row.error))), {
        samples: bootstrapSamples,
        seed: 'judge-mae',
      }),
      signedBias: round(signedBias),
      signedBiasInterval95: bootstrapMetricPairs(pairs, (rows) => mean(rows.map((row) => row.error)), {
        samples: bootstrapSamples,
        seed: 'judge-bias',
      }),
      withinOneRate: round(withinOneRate),
      scoreCorrelation: round(correlation),
      byDimension,
    },
    criticalFailureDetection: {
      truePositive,
      falsePositive,
      falseNegative,
      precision: round(criticalPrecision),
      recall: round(criticalRecall),
    },
  };
}
