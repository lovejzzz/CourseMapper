export function authenticEvidenceRecordSurfaces(example = {}) {
  const fields = ['displayLabel', 'form', 'gloss', 'translation', 'sourceLocator'].map((key) =>
    String(example?.[key] || '').trim(),
  );
  if (!fields.every(Boolean)) return [];
  const [label, form, gloss, translation, locator] = fields;
  const base = `${label}: “${form}” | gloss: ${gloss} | translation: ${translation}`;
  const profile = Object.values(example?.articulatoryProfile || {})
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('; ');
  const source = `${base} | source: ${locator}`;
  return profile ? [source, `${base} | articulatory evidence: ${profile} | source: ${locator}`] : [source];
}

export function verifiedAuthenticEvidenceIdentitySurfaces(manifest = {}) {
  return [
    ...new Set(
      (Array.isArray(manifest?.authenticLanguageDataCoverage?.lessons)
        ? manifest.authenticLanguageDataCoverage.lessons
        : []
      )
        .map((lesson) => lesson?.taskBinding)
        .filter(
          (task) =>
            /^[a-f0-9]{64}$/i.test(String(task?.payloadSha256)) &&
            /^[a-f0-9]{64}$/i.test(String(task?.taskContractSha256)) &&
            task?.truthProof?.taskContractSha256 === task?.taskContractSha256 &&
            task?.truthProof?.promptDisplaysBoundPayload === true &&
            task?.truthProof?.answerKeyOperatesOnBoundPayload === true &&
            task?.truthProof?.rubricScoresDeclaredOperation === true,
        )
        .flatMap((task) => [
          task?.successCriterion,
          ...(Array.isArray(task?.assessmentCriteria) ? task.assessmentCriteria : []),
          ...(Array.isArray(task?.examples) ? task.examples : [])
            .filter((example) => /^[a-f0-9]{64}$/i.test(String(example?.payloadSha256)))
            .flatMap((example) => [
              ...authenticEvidenceRecordSurfaces(example),
              example?.displayLabel,
              example?.form,
              example?.gloss,
              example?.translation,
              example?.sourceLocator,
              example?.analysisFocus,
              example?.communityContext,
              ...(example?.articulatoryProfile && typeof example.articulatoryProfile === 'object'
                ? [
                    ...Object.values(example.articulatoryProfile),
                    `Articulatory evidence: ${Object.values(example.articulatoryProfile)
                      .map((value) => String(value || '').trim())
                      .filter(Boolean)
                      .join('; ')}`,
                  ]
                : []),
            ]),
        ])
        .map((value) => String(value || '')),
    ),
  ];
}

export function compactAuthenticRecordedFeature(example, fallback) {
  const focus = String(example?.analysisFocus || fallback || '')
    .replace(/\s+/g, ' ')
    .trim();
  const order = focus.match(/\billustrates\s+([A-Z]{2,6})\s+order/i)?.[1];
  return order
    ? `${order.toUpperCase()} order`
    : focus
        .split(':')
        .at(-1)
        .replace(/[.!?]+$/, '');
}

export function authenticComparisonConstructedAnswers(
  firstLabel,
  secondLabel,
  firstFeature,
  secondFeature,
  evidenceNames,
) {
  const relation = `${firstLabel} shows ${firstFeature}; ${secondLabel} shows ${secondFeature}`;
  return [
    '',
    `Compare recorded order: ${relation}.`,
    `${firstFeature} contrasts with ${secondFeature} only in ${evidenceNames}; generalization needs another sample.`,
    `Apply ${relation} only to the cited records.`,
    `Bounded claim: cited clauses contrast ${firstFeature}/${secondFeature}, not all usage.`,
    `${relation}; reject claims about unobserved clauses.`,
    `Stop at ${evidenceNames}; extend only with another record.`,
    `Revise to ${firstFeature} versus ${secondFeature}; remove the universal claim and request a new sample.`,
  ];
}
