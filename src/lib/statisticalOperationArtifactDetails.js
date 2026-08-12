const STATISTICAL_OPERATION_ARTIFACT_DETAILS = Object.freeze({
  'design-and-audit-randomized-experiment': {
    outputFormat: 'randomized-experiment design sheet, assignment trace, validity audit, or design-revision memo',
    evidenceRequirement:
      'research question, experimental units, treatment conditions, response variable, replayable random-assignment trace, controlled conditions, validity threat, and bounded causal interpretation',
    qualityFocus:
      'unit-treatment alignment, reproducible random assignment, response measurement, control of alternative explanations, validity reasoning, and limits on generalization',
    reviewProtocol:
      'identify the experimental units, treatments, response, and controls; replay the assignment rule; inspect one threat to validity; and require a causal conclusion no broader than the design permits',
    commonFailure:
      'students call a comparison an experiment without naming units, treatments, response measurement, random assignment, controls, or the boundary on causal and population claims',
  },
  'summarize-and-interpret-distribution': {
    outputFormat: 'distribution summary, descriptive-statistics interpretation, outlier check, or comparison memo',
    evidenceRequirement:
      'question, variable and scale, supplied observations, center and spread calculations, distribution pattern, interpretation, and limitation',
    qualityFocus:
      'variable identification, calculation accuracy, resistant-summary choice, pattern interpretation, outlier reasoning, and conclusion limits',
    reviewProtocol:
      'check the variable and scale, recompute center and spread, compare the summaries with the observed pattern, inspect any outlier claim, and require a bounded interpretation',
    commonFailure:
      'students report a mean or median without showing the observations, spread, distribution pattern, or limit on the interpretation',
  },
  'construct-and-interpret-histogram': {
    outputFormat:
      'histogram construction, bin-count table, distribution-shape interpretation, or re-binning comparison',
    evidenceRequirement:
      'variable and scale, supplied observations, declared bin edges, bin counts, count-total check, shape interpretation, and bin-choice limitation',
    qualityFocus:
      'bin-rule clarity, count accuracy, total verification, display readability, shape interpretation, and sensitivity to bin choices',
    reviewProtocol:
      'check every observation against the declared bins, verify the total count, inspect the rendered histogram, compare one alternate binning, and require a bounded shape claim',
    commonFailure:
      'students present a histogram without declared bins, verified counts, an interpretation, or acknowledgment that bin choices affect appearance',
  },
  'standardize-and-interpret-normal-observation': {
    outputFormat:
      'z-score calculation trace, standardized-observation interpretation, normal-model check, or comparison note',
    evidenceRequirement:
      'stated mean, standard deviation, observation, subtraction and division trace, signed z-score, model-relative interpretation, and normal-model boundary',
    qualityFocus:
      'input identification, arithmetic accuracy, sign and scale interpretation, model fit, and limitation language',
    reviewProtocol:
      'verify the mean, standard deviation, and observation; recompute the signed z-score; check its model-relative interpretation; and require a normal-model boundary',
    commonFailure:
      'students report a z-score without showing the inputs, preserving its sign, interpreting its distance from the mean, or naming the model assumption',
  },
  'calculate-and-interpret-correlation': {
    outputFormat:
      'scatterplot annotation, correlation calculation trace, association interpretation, or sensitivity comparison',
    evidenceRequirement:
      'paired observations, scatterplot pattern, centered cross-products and square sums, correlation coefficient, linear-association interpretation, and causal boundary',
    qualityFocus:
      'pairing accuracy, calculation trace, direction and strength interpretation, unusual-point awareness, and noncausal language',
    reviewProtocol:
      'inspect the paired data and scatterplot, verify the centered sums and coefficient, compare the numerical and visual pattern, and require a noncausal boundary',
    commonFailure:
      'students report a correlation coefficient without inspecting the scatterplot, showing the calculation, or separating association from causation',
  },
  'fit-and-interpret-simple-linear-regression': {
    outputFormat:
      'least-squares calculation trace, fitted-line interpretation, residual check, or regression comparison memo',
    evidenceRequirement:
      'paired observations, means and centered sums, slope and intercept calculations, fitted values or residuals, in-range interpretation, and causal or extrapolation boundary',
    qualityFocus:
      'model setup, slope and intercept accuracy, fitted-value or residual checking, contextual interpretation, and extrapolation restraint',
    reviewProtocol:
      'verify the paired data, recompute slope and intercept, inspect fitted values or residuals, interpret the slope in range, and require causal and extrapolation limits',
    commonFailure:
      'students report a fitted line without showing the calculation, checking residual evidence, interpreting the slope, or limiting causal and extrapolation claims',
  },
  'calculate-and-interpret-two-way-table': {
    outputFormat: 'two-way-table analysis, conditional-proportion comparison, association memo, or revised-table check',
    evidenceRequirement:
      'two categorical variables, four joint-frequency cell counts, row or column totals, declared conditioning direction, conditional proportions, comparison, association interpretation, and causal boundary',
    qualityFocus:
      'table accuracy, denominator choice, conditional-proportion calculation, comparison clarity, and association-versus-causation discipline',
    reviewProtocol:
      'check all cells and totals, verify the conditioning denominator, recompute both proportions and their difference, and require a noncausal association conclusion',
    commonFailure:
      'students compare raw counts or incompatible percentages without naming the conditioning direction, verifying denominators, or limiting the conclusion to association',
  },
  'construct-and-audit-probability-sample': {
    outputFormat: 'sampling-frame audit, probability-sample trace, selection-probability note, or coverage-repair memo',
    evidenceRequirement:
      'target population, complete frame, recorded random selection rule, selected units, inclusion-probability check, coverage defect, and sampling limitation',
    qualityFocus:
      'population-frame alignment, reproducible selection, probability accuracy, coverage reasoning, and limits involving nonresponse or measurement',
    reviewProtocol:
      'compare the target population with the frame, replay the selection trace, verify inclusion probabilities, inspect undercoverage, and require one defensible repair',
    commonFailure:
      'students call a sample random without a complete frame, replayable selection trace, inclusion-probability check, or coverage limitation',
  },
  'calculate-and-interpret-confidence-interval': {
    outputFormat:
      'confidence-interval calculation, margin-of-error trace, confidence-interval interpretation, or assumption-check memo',
    evidenceRequirement:
      'sample context, sample estimate, sample size, standard-error calculation, critical value, margin of error, interval endpoints, repeated-sampling interpretation, and assumption boundary',
    qualityFocus:
      'input accuracy, standard-error and margin calculation, endpoint verification, repeated-sampling interpretation, assumption validity, and limitation language',
    reviewProtocol:
      'check the sample estimate and size, recompute standard error and margin of error, verify both endpoints, and require a repeated-sampling interpretation with assumptions and limitations',
    commonFailure:
      'students report interval endpoints without showing the calculation, checking assumptions, or using a defensible repeated-sampling interpretation',
  },
  'calculate-and-interpret-one-proportion-test': {
    outputFormat:
      'one-proportion hypothesis-test trace, p-value explanation, effect-size note, or inference decision brief',
    evidenceRequirement:
      'null and alternative claims, sample size and proportion, null standard error, test statistic, p-value, effect estimate, decision threshold, interpretation, and assumption boundary',
    qualityFocus:
      'hypothesis setup, arithmetic accuracy, p-value interpretation, effect-size visibility, assumption validity, and decision restraint',
    reviewProtocol:
      'check the hypotheses and sample inputs, recompute the null standard error and test statistic, verify the p-value and effect estimate, and require a bounded decision',
    commonFailure:
      'students report statistical significance without showing the test trace, interpreting the p-value, reporting the effect estimate, or checking assumptions',
  },
});

const STATISTICAL_OPERATION_INSTRUCTIONAL_INTENTS = Object.freeze({
  'design-and-audit-randomized-experiment': {
    objective:
      'Design and audit a randomized experiment by identifying experimental units, treatments, response measurement, controlled conditions, and a replayable assignment rule, then separating the supported causal claim from limits on generalization.',
    learnerAction:
      'Name the units, treatments, response, and controls; execute and record the random assignment; diagnose one validity threat; and state the causal and population boundaries.',
  },
  'summarize-and-interpret-distribution': {
    objective:
      'Summarize and interpret a supplied distribution by calculating center and spread, identifying its pattern and any outliers, and limiting the conclusion to the observed data.',
    learnerAction:
      'Calculate center and spread from the supplied observations, inspect the distribution pattern and outliers, then write a bounded interpretation.',
  },
  'construct-and-interpret-histogram': {
    objective:
      'Construct and interpret a histogram from supplied observations by declaring bin edges, verifying every count, describing the distribution shape, and testing how one alternate binning changes the display.',
    learnerAction:
      'Declare the bin edges, place and total every observation, render the histogram, compare one alternate binning, and justify a bounded shape claim.',
  },
  'standardize-and-interpret-normal-observation': {
    objective:
      'Standardize and interpret a supplied observation by showing the signed z-score calculation, relating its distance to the stated normal model, and naming the model boundary.',
    learnerAction:
      'Identify the mean, standard deviation, and observation; calculate the signed z-score; interpret its model-relative distance; and check the normal-model boundary.',
  },
  'calculate-and-interpret-correlation': {
    objective:
      'Calculate and interpret correlation for supplied paired observations by inspecting the scatterplot, showing the calculation trace, checking unusual points, and separating association from causation.',
    learnerAction:
      'Inspect the paired data and scatterplot, calculate the correlation coefficient, compare the numerical and visual evidence, and state a noncausal conclusion.',
  },
  'fit-and-interpret-simple-linear-regression': {
    objective:
      'Fit and interpret a simple linear regression for supplied paired observations by showing slope and intercept calculations, checking fitted values or residuals, and limiting causal or extrapolated claims.',
    learnerAction:
      'Calculate the fitted line, inspect fitted values or residuals, interpret the slope in range, and mark causal and extrapolation limits.',
  },
  'calculate-and-interpret-two-way-table': {
    objective:
      'Calculate and interpret a two-way table by verifying cells and totals, declaring the conditioning direction, comparing conditional proportions, and limiting the conclusion to association.',
    learnerAction:
      'Verify the table totals, choose and name the conditioning denominator, calculate both conditional proportions, compare them, and state a noncausal association conclusion.',
  },
  'construct-and-audit-probability-sample': {
    objective:
      'Construct and audit a probability sample by aligning the target population and frame, recording a replayable random selection rule, checking inclusion probabilities, and identifying coverage limits.',
    learnerAction:
      'Compare the population with the frame, execute and record the random selection, verify inclusion probabilities, inspect undercoverage, and recommend one defensible repair.',
  },
  'calculate-and-interpret-confidence-interval': {
    objective:
      'Calculate and interpret a confidence interval by showing the standard error, critical value, margin of error, and endpoints, then checking assumptions and using a repeated-sampling interpretation.',
    learnerAction:
      'Verify the sample inputs, calculate the standard error and margin of error, check both endpoints, and state a repeated-sampling interpretation with assumptions and limits.',
  },
  'calculate-and-interpret-one-proportion-test': {
    objective:
      'Calculate and interpret a one-proportion test by stating the hypotheses, showing the test statistic and p-value trace, reporting the effect estimate, and checking assumptions before making a bounded decision.',
    learnerAction:
      'State the hypotheses, verify the sample inputs, calculate the test statistic and p-value, report the effect estimate, and make a bounded decision against the declared threshold.',
  },
});

const DISTRIBUTION_INTENT_VARIANTS = Object.freeze({
  visual: {
    objective:
      "Interrogate a supplied distribution's visible pattern and possible outliers, then calculate an appropriate center and spread to justify an interpretation bounded by the observed data.",
    learnerAction:
      'Inspect the display and observations, mark the distribution pattern and possible outliers, calculate center and spread, then reconcile the visual and numerical evidence in a bounded interpretation.',
  },
  numerical: {
    objective:
      'Calculate and compare appropriate measures of center and spread for supplied observations, then connect those summaries to the distribution pattern, possible outliers, and a conclusion no broader than the data.',
    learnerAction:
      'Show the center and spread calculations, compare resistant and nonresistant summaries, check them against the observed pattern and outliers, and state a data-bounded conclusion.',
  },
});

function primaryStatisticalOutputFormat(details, lesson = {}) {
  const options = String(details?.outputFormat || '')
    .split(/,\s+|\s+or\s+/i)
    .map((value) => value.trim())
    .filter(Boolean);
  if (options.length === 0) return '';
  const identityTokens = new Set(
    [lesson?.studentArtifact, lesson?.assessment, lesson?.title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [],
  );
  const ranked = options
    .map((option, index) => ({
      option,
      index,
      overlap: (option.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => identityTokens.has(token)).length,
    }))
    .sort((left, right) => right.overlap - left.overlap || left.index - right.index);
  return ranked[0]?.option || options[0];
}

function distributionIntentForLesson(lesson = {}, fallback) {
  const identity = [
    lesson?.title,
    ...(Array.isArray(lesson?.sections)
      ? lesson.sections.flatMap((section) => [section?.topicSection, section?.learningGoals])
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  if (/\b(?:graph|plot|visual|picture|display|shape)\w*\b/i.test(identity)) {
    return DISTRIBUTION_INTENT_VARIANTS.visual;
  }
  if (/\b(?:number|numeric|summary|center|spread|descriptive)\w*\b/i.test(identity)) {
    return DISTRIBUTION_INTENT_VARIANTS.numerical;
  }
  return fallback;
}

export function createStatisticalArtifactDetailsForOperation({ operationEvidenceDemandForLesson }) {
  return function statisticalArtifactDetailsForOperation(lesson = {}, fallback = {}) {
    const operation = operationEvidenceDemandForLesson(lesson, { requireAction: false }).operation;
    const details = STATISTICAL_OPERATION_ARTIFACT_DETAILS[operation] || fallback;
    if (!details) return details;
    const primaryOutputFormat = details.primaryOutputFormat || primaryStatisticalOutputFormat(details, lesson);
    return { ...details, primaryOutputFormat };
  };
}

export function createStatisticalInstructionalIntentForOperation({ operationEvidenceDemandForLesson }) {
  return function statisticalInstructionalIntentForOperation(lesson = {}) {
    const demand = operationEvidenceDemandForLesson(lesson, { requireAction: false });
    const baseIntent = STATISTICAL_OPERATION_INSTRUCTIONAL_INTENTS[demand.operation];
    const intent =
      demand.operation === 'summarize-and-interpret-distribution'
        ? distributionIntentForLesson(lesson, baseIntent)
        : baseIntent;
    return intent
      ? {
          operation: demand.operation,
          objective: intent.objective,
          learnerAction: intent.learnerAction,
          primaryOutputFormat: primaryStatisticalOutputFormat(
            STATISTICAL_OPERATION_ARTIFACT_DETAILS[demand.operation],
            lesson,
          ),
          evidenceRequirement: STATISTICAL_OPERATION_ARTIFACT_DETAILS[demand.operation]?.evidenceRequirement || '',
        }
      : null;
  };
}
