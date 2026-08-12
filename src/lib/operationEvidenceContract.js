export const OPERATION_QUALIFIED_EVIDENCE_PROTOCOL = 'coursemapper-operation-qualified-evidence-v1';
export const OPERATION_QUALIFIED_EVIDENCE_RECEIPT_PROTOCOL = 'coursemapper-operation-qualified-evidence-receipt-v1';

export const OPERATION_EVIDENCE_REQUIRED_PROJECTIONS = Object.freeze([
  'assignments',
  'lessonPlans',
  'slideDecks',
  'studyGuides',
]);

const OPERATION_ACTION_RE =
  /\b(?:apply|audit|calculate|compute|construct|design|estimate|fit|interpret|randomize|test)\b/i;
const COMPILER_GENERIC_OPERATION_OBJECTIVE_RE =
  /^(?:apply\s+.+?\s+in\s+one\s+practical\s+example\s+from\s+.+?\s+and\s+justify\s+one\s+revision|test\s+.+?\s+in\s+an?\s+observable\s+.+?\s+case\s+and\s+defend\s+one\s+evidence-based\s+change)\.?$/i;

const OPERATION_DEFINITIONS = Object.freeze([
  {
    operation: 'design-and-audit-randomized-experiment',
    pattern:
      /\b(?:producing data\s*:\s*experiments?|randomi[sz]ed experiments?|experimental designs?|experimental units?|treatment groups?|control groups?|random assignment|blocking designs?)\b/i,
  },
  {
    operation: 'calculate-and-interpret-one-proportion-test',
    pattern: /\b(?:one[- ]proportion (?:z[- ]?)?tests?|proportion tests?|null proportions?)\b/i,
  },
  {
    operation: 'calculate-and-interpret-confidence-interval',
    pattern: /\b(?:confidence intervals?|interval estimates?|margins? of error)\b/i,
  },
  {
    operation: 'fit-and-interpret-simple-linear-regression',
    pattern: /\b(?:regression|linear models?|least squares|slopes?)\b/i,
  },
  {
    operation: 'calculate-and-interpret-correlation',
    pattern: /\b(?:scatterplots?|scatter plots?|correlations?|correlation coefficients?|pearson(?:'s)? r)\b/i,
  },
  {
    operation: 'calculate-and-interpret-two-way-table',
    pattern:
      /\b(?:two[- ]way tables?|contingency tables?|cross[- ]tabulations?|conditional proportions?|row proportions?|column proportions?)\b/i,
  },
  {
    operation: 'construct-and-interpret-histogram',
    pattern: /\b(?:histograms?|binning|frequency distributions?)\b/i,
  },
  {
    operation: 'standardize-and-interpret-normal-observation',
    pattern: /\b(?:normal distributions?|z[- ]?scores?|standardiz(?:e|es|ed|ing|ation))\b/i,
  },
  {
    operation: 'construct-and-audit-probability-sample',
    pattern:
      /\b(?:producing data\s*:\s*sampling|sampling (?:plans?|frames?|methods?|techniques?)|sample selection|probability samples?|random samples?|cluster sampling|systematic sampling|stratified sampling)\b/i,
  },
  {
    operation: 'summarize-and-interpret-distribution',
    pattern:
      /\b(?:(?:apply|calculate|compute|construct|estimate|fit|interpret|test) (?:a |the )?distributions?|pictur(?:e|es|ed|ing) distributions?|describ(?:e|es|ed|ing) distributions?|summari[sz](?:e|es|ed|ing)(?: and interpret)? (?:a |the )?distributions?|data distributions?|frequency distributions?|descriptive statistics|centers? and spread|arithmetic means?|sample means?|population means?|medians?|quartiles?|interquartile ranges?|iqr)\b/i,
  },
]);

const UNSUPPORTED_OPERATION_FAMILY_RE =
  /\b(?:two[- ]sample|paired[- ]sample|paired t|independent[- ]sample|chi[- ]?square|analysis of variance|anova|logistic regression|multiple regression|poisson regression)\b/i;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenText(value) {
  if (Array.isArray(value)) return value.flatMap(flattenText);
  const text = cleanText(value);
  return text ? [text] : [];
}

function flattenObjectiveText(value) {
  if (Array.isArray(value)) return value.flatMap(flattenObjectiveText);
  return String(value ?? '')
    .split(/\r?\n+|(?<=[.!?])\s+(?=[A-Z])/u)
    .map(cleanText)
    .filter(Boolean);
}

function objectiveSurfaces(lesson = {}) {
  const sourceObjectiveText = Array.isArray(lesson?.sourceEvidenceTrace?.sourceFields)
    ? lesson.sourceEvidenceTrace.sourceFields
        .filter((field) => field?.field === 'learning objectives')
        .flatMap((field) => flattenObjectiveText(field?.rawText))
    : [];
  return [
    ...sourceObjectiveText,
    ...flattenObjectiveText(lesson.objectives),
    ...flattenObjectiveText(lesson.outcomes),
    ...flattenObjectiveText(lesson.learningObjectives),
    ...(Array.isArray(lesson.sections)
      ? lesson.sections.flatMap((section) => [
          ...flattenObjectiveText(section?.learningObjectives),
          ...flattenObjectiveText(section?.objectives),
        ])
      : []),
  ];
}

function coreIdentitySurfaces(lesson = {}) {
  return [
    ...flattenText(lesson.title),
    ...(Array.isArray(lesson.sections) ? lesson.sections.flatMap((section) => flattenText(section?.topicSection)) : []),
    ...flattenText(lesson.studentArtifact),
    ...flattenText(lesson.keyConcepts),
  ];
}

function supportingIdentitySurfaces(lesson = {}) {
  return [
    ...flattenText(lesson.activityPattern),
    ...(Array.isArray(lesson.sections)
      ? lesson.sections.flatMap((section) => flattenText(section?.learningGoals))
      : []),
    ...(Array.isArray(lesson?.enrichment?.keyTerms)
      ? lesson.enrichment.keyTerms.flatMap((term) => flattenText(term?.term))
      : []),
  ];
}

export function operationForText(value) {
  const text = cleanText(value);
  return OPERATION_DEFINITIONS.find((definition) => definition.pattern.test(text))?.operation || '';
}

/**
 * Resolve one governing quantitative operation from the final lesson contract.
 * Action-bearing objectives win; identity is only a fallback when the caller
 * wants a useful worked example for a quantitative lesson that has no explicit
 * Apply/Calculate demand. This keeps promotion demand and generation on the
 * same deterministic, course-agnostic boundary.
 */
export function operationEvidenceDemandForLesson(lesson = {}, { requireAction = true } = {}) {
  const objectives = objectiveSurfaces(lesson);
  const coreIdentity = coreIdentitySurfaces(lesson);
  const supportingIdentity = supportingIdentitySurfaces(lesson);
  const completeIdentity = [...coreIdentity, ...supportingIdentity, ...objectives].join(' ');
  // A verified specimen for one statistical family must never impersonate a
  // neighboring family merely because both mention p-values, intervals, or a
  // contingency table. Unsupported methods stay source-authored and receive
  // no synthetic calculation until CourseMapper has an exact implementation.
  if (UNSUPPORTED_OPERATION_FAMILY_RE.test(completeIdentity)) {
    return { demanded: false, operation: '', matchedSurface: '', source: 'unsupported-operation-family' };
  }
  // Stable curriculum identity wins over generated activity prose. Otherwise
  // a secondary term repeated in an activity (for example, “p-value” inside a
  // sampling lesson) can replace the lesson's governing operation merely
  // because its regex appears earlier in the definition table.
  // Preserve curriculum authority order instead of concatenating every
  // identity surface and letting the definition-table regex order decide.
  // A lesson title such as "Picturing Distributions" governs a generated
  // Histogram key term, while an explicit source topic such as "Histogram
  // Construction" governs a generic "Visualizing Data" title.
  const specificIdentityOperation =
    coreIdentity.map(operationForText).find(Boolean) || supportingIdentity.map(operationForText).find(Boolean) || '';

  // An observable operation outranks a passive display mention regardless of
  // whether the caller also permits identity-only inference. Previously the
  // requireAction:false planning path accepted the first "Explain confidence
  // interval" sentence and never reached a later "Apply p-value" objective.
  const actionObjectives = objectives.filter((surface) => OPERATION_ACTION_RE.test(surface));
  const candidateObjectives = actionObjectives.length > 0 ? actionObjectives : requireAction ? [] : objectives;
  for (const surface of candidateObjectives) {
    let operation = operationForText(surface);
    // A generic “distribution” objective should inherit a more specific
    // histogram/normal identity when the lesson declares one.
    if (
      operation === 'summarize-and-interpret-distribution' &&
      ['construct-and-interpret-histogram', 'standardize-and-interpret-normal-observation'].includes(
        specificIdentityOperation,
      )
    ) {
      operation = specificIdentityOperation;
    }
    // The generic Apply-X template is compiler connective tissue, not an
    // instructor-authored declaration that a secondary concept should replace
    // the lesson's governing quantitative operation. When the lesson identity
    // names a different operation, keep the worked specimen inside that
    // curriculum node. Explicit objectives such as “Calculate and interpret a
    // p-value” continue to win because they do not match this template.
    if (
      operation &&
      specificIdentityOperation &&
      operation !== specificIdentityOperation &&
      COMPILER_GENERIC_OPERATION_OBJECTIVE_RE.test(surface)
    ) {
      operation = specificIdentityOperation;
    }
    if (operation) {
      return {
        demanded: true,
        operation,
        matchedSurface: surface,
        source: 'objective',
      };
    }
  }

  if (actionObjectives.length > 0) {
    return { demanded: false, operation: '', matchedSurface: '', source: 'unsupported-action-objective' };
  }

  if (!requireAction && specificIdentityOperation) {
    return {
      demanded: false,
      operation: specificIdentityOperation,
      matchedSurface: [...coreIdentity, ...supportingIdentity].join(' '),
      source: 'lesson-identity',
    };
  }

  return { demanded: false, operation: '', matchedSurface: '', source: 'none' };
}

export function operationEvidenceLessonNumber(value, fallback = null) {
  const direct = Number(
    value?.lessonNumber || value?.curriculumAdmission?.lessonNumber || value?.lesson || value?.week || fallback,
  );
  if (Number.isInteger(direct) && direct > 0) return direct;
  const identity = [value?.lessonTitle, value?.title, value?.id].filter(Boolean).join(' ');
  const match = identity.match(/\blesson\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function scopeEnrichmentToOperationDemand(enrichment, demand = {}) {
  if (
    demand.operation !== 'fit-and-interpret-simple-linear-regression' ||
    !/\b(?:simple linear regression|least[- ]squares?|slope and intercept|fitted values?|residuals?)\b/i.test(
      demand.matchedSurface || '',
    )
  ) {
    return enrichment;
  }
  const permitted =
    /\b(?:simple linear regression|linear regression|least[- ]squares?|fitted (?:line|values?)|slope|intercept|residuals?|extrapolat\w*|range of values)\b/i;
  const outsideOperation =
    /\b(?:binomial|censored|generalized linear|logistic|multiple(?: linear)?|nonparametric|poisson|robust|semiparametric) regression\b/i;
  const isPermitted = (value) => {
    const surface = typeof value === 'string' ? value : JSON.stringify(value);
    return permitted.test(surface) && !outsideOperation.test(surface);
  };
  const terms = Array.isArray(enrichment?.keyTerms) ? enrichment.keyTerms : [];
  const rejectedTerms = terms
    .map((term) => cleanText(term?.term || term?.tr))
    .filter((term) => term && !isPermitted(term));
  const citations = Array.isArray(enrichment?.conceptProvenance?.citations)
    ? enrichment.conceptProvenance.citations
    : [];
  const rejectedCitations = citations.filter(
    (citation) =>
      ![
        [citation?.displayTitle, citation?.title, citation?.topic, citation?.evidence].filter(Boolean).join(' '),
        ...(citation?.supportReceipt?.checks || []).flatMap((check) => [check?.claim, check?.quote]),
      ].some(isPermitted),
  );
  const filter = (items) => (Array.isArray(items) ? items.filter(isPermitted) : items);
  const distinct = (values) => [...new Set(values.filter(Boolean))].slice(0, 24);
  const next = {
    ...enrichment,
    keyTerms: terms.filter((term) => isPermitted(cleanText(term?.term || term?.tr))),
    quizItems: filter(enrichment?.quizItems),
    slideContent: filter(enrichment?.slideContent),
    kernel: { ...(enrichment?.kernel || {}), facts: filter(enrichment?.kernel?.facts) },
    conceptProvenance: {
      ...(enrichment?.conceptProvenance || {}),
      citations: citations.filter((citation) => !rejectedCitations.includes(citation)),
      semanticAdmission: {
        ...(enrichment?.conceptProvenance?.semanticAdmission || {}),
        rejectedTerms: distinct([
          ...(enrichment?.conceptProvenance?.semanticAdmission?.rejectedTerms || []),
          ...rejectedTerms,
        ]),
        rejectedSourceLocators: distinct(
          [
            ...(enrichment?.conceptProvenance?.semanticAdmission?.rejectedSourceLocators || []),
            ...rejectedCitations.flatMap((citation) => [
              citation?.id,
              citation?.displayTitle,
              citation?.title,
              citation?.sourceUrl,
            ]),
          ]
            .map(cleanText)
            .filter((value) => value.length >= 3),
        ),
      },
    },
    semanticAdmissionReceipt: {
      ...(enrichment?.semanticAdmissionReceipt || {}),
      operationScopeBoundary: 'simple-linear-regression-v1',
      governingOperation: demand.operation,
      rejectedOperationTermCount: rejectedTerms.length,
    },
  };
  for (const field of ['discussionPrompt', 'assignmentCore', 'studyGuide', 'workedExample']) {
    if (next[field] != null && !isPermitted(next[field])) delete next[field];
  }
  return next;
}
