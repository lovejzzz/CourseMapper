export const ADOPTION_DIMENSIONS = [
  { id: 'sourceFidelity', label: 'Source fidelity', weight: 20 },
  { id: 'disciplineFit', label: 'Discipline fit', weight: 20 },
  { id: 'deliverableAuthenticity', label: 'Deliverable authenticity', weight: 15 },
  { id: 'instructorWorkload', label: 'Instructor workload and editability', weight: 15 },
  { id: 'studentClarity', label: 'Student learning clarity', weight: 10 },
  { id: 'courseOperations', label: 'Course operations', weight: 10 },
  { id: 'accessibilityLearnerAgency', label: 'Accessibility and learner agency', weight: 5 },
  { id: 'packageCraft', label: 'Package craft', weight: 5 },
];

const FEATURE_LABELS = {
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignments',
  rubrics: 'Rubrics',
  discussions: 'Discussions',
  quizBank: 'Quiz Bank',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
};

const FEATURE_EXPECTATIONS = {
  syllabus: [/assessment/i, /support|office hours|communication|policy|accessibility/i],
  lessonPlans: [/objective|outcome/i, /activity|practice|discussion|workshop/i, /assessment|exit|check/i],
  assignments: [/submit|submission|deliverable/i, /criterion|criteria|rubric|evidence/i],
  rubrics: [/criteria|criterion/i, /weight|points|scor|calibration|feedback/i],
  discussions: [/prompt|discussion|respond|peer/i],
  quizBank: [/question|answer|rationale|scoring/i],
  studyGuides: [/summary|practice|key term|review/i],
  courseFaq: [/support|review|submit|question|answer/i],
};

const REQUIRED_RELEASE_BOUNDARY_PATTERNS = [
  {
    id: 'professor-approval-claim',
    pattern: /\b(?:professors?|instructors?)\s+approved\b/i,
    label: 'professor approval claim',
  },
  {
    id: 'author-endorsement-claim',
    pattern: /\b(?:endorsed|approved)\s+by\s+(?:the\s+)?(?:public\s+)?(?:course\s+)?authors?\b/i,
    label: 'public course author endorsement claim',
  },
  {
    id: 'external-validation-complete',
    pattern: /\bexternal validation complete\b/i,
    label: 'external validation complete claim',
  },
];

const PROFESSOR_FACING_SKIP_KEYS = new Set([
  'accessibilityPlan',
  'anchorExampleSet',
  'assessmentArchitecture',
  'assessmentBlueprint',
  'assessmentValidity',
  'bloomsCoverage',
  'blueprintGrounding',
  'blueprintQualityReceipt',
  'classroomDryRun',
  'classroomDryRunPlan',
  'classroomEvidenceLoop',
  'classroomEvidenceLoopPlan',
  'classroomHandoffPlan',
  'compilerDecision',
  'compilerDecisionMatrix',
  'conceptDependencyGraph',
  'conceptDependencyPlan',
  'courseModalityProfile',
  'criterionEvidenceMap',
  'criterionObjectiveAlignment',
  'criterionWeightCue',
  'criterionWeightGuidance',
  'criterionWeightPlan',
  'difficultyProfile',
  'evidenceBase',
  'evidencePlan',
  'evidenceResponseMap',
  'evidenceResponsePlan',
  'feedbackCycle',
  'gradingWeightProvenance',
  'instructionalMoveGuide',
  'instructionalRationale',
  'learnerContextCue',
  'learnerContextProfile',
  'learningTransferPlan',
  'masteryEvidenceMap',
  'masteryEvidencePlan',
  'modalityCue',
  'modalityDecode',
  'objectiveEvidenceChecklist',
  'objectiveEvidenceMap',
  'practiceProgressionPlan',
  'prerequisiteCheck',
  'prerequisitePlan',
  'sourceConflictReport',
  'sourceEvidenceTrace',
  'sourceGrounding',
  'sourceRiskRegister',
  'sourceUsePlan',
  'tags',
  'teachingIntent',
  'workloadBalance',
  'workloadEstimate',
]);

function shouldSkipProfessorFacingKey(key) {
  if (PROFESSOR_FACING_SKIP_KEYS.has(key)) return true;
  return /(?:Contract|Diagnostics|Grounding|Provenance|Receipt|Telemetry|Trace)$/i.test(key);
}

export function collectStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

export function collectProfessorFacingStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectProfessorFacingStrings(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (shouldSkipProfessorFacingKey(key)) continue;
      collectProfessorFacingStrings(item, out);
    }
  }
  return out;
}

function uniqueTextSegments(segments = []) {
  const seen = new Set();
  const unique = [];
  for (const segment of segments) {
    const normalized = String(segment || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function compilePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  return new RegExp(String(pattern), 'i');
}

function patternMatches(pattern, text) {
  return compilePattern(pattern).test(text);
}

function countMatches(pattern, text) {
  const source = pattern instanceof RegExp ? pattern.source : String(pattern);
  const flags = pattern instanceof RegExp ? pattern.flags : 'i';
  const regex = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
  return Array.from(String(text || '').matchAll(regex)).length;
}

function firstSnippet(pattern, text, radius = 90) {
  const regex = compilePattern(pattern);
  const match = regex.exec(String(text || ''));
  if (!match) return '';
  const start = Math.max(0, match.index - radius);
  const end = Math.min(String(text).length, match.index + match[0].length + radius);
  return String(text).slice(start, end).replace(/\s+/g, ' ').trim();
}

function scoreFloor(value) {
  return Math.max(0, Number(value || 0));
}

function severityRank(severity) {
  return severity === 'P0' ? 0 : severity === 'P1' ? 1 : severity === 'P2' ? 2 : 3;
}

function findingPriorityFromBlocker({ hardBlocker, severity }) {
  if (hardBlocker) return 'P0';
  return severity || 'P2';
}

function makeFinding({
  caseId,
  sourceUrl,
  dimension,
  severity = 'P2',
  scoreImpact = 3,
  artifact = 'compiled package',
  sourceExpectation = '',
  observedOutput = '',
  failureClass = 'professor-adoption-gap',
  targetArea = 'compiler',
  actionId = '',
  message = '',
  acceptanceCriteria = [],
  proofCommands = [],
  evidence = '',
  hardBlocker = false,
}) {
  return {
    caseId,
    sourceUrl,
    dimension,
    severity: findingPriorityFromBlocker({ hardBlocker, severity }),
    scoreImpact,
    artifact,
    sourceExpectation,
    observedOutput,
    failureClass,
    suspectedOwner: targetArea === 'compiler' ? 'src/lib/courseBlueprintCompiler.js' : targetArea,
    requiredRepairAction: actionId || `repair-${dimension.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    acceptanceCriteria,
    proofCommands,
    message,
    evidence,
    hardBlocker,
  };
}

function scoreSignalGroups({ manifest, compiledText }) {
  const findings = [];
  for (const group of manifest.requiredSignalGroups || []) {
    const matchedPatterns = (group.patterns || []).filter((pattern) => patternMatches(pattern, compiledText));
    if (matchedPatterns.length > 0) continue;
    findings.push(
      makeFinding({
        caseId: manifest.id,
        sourceUrl: manifest.sourceUrl,
        dimension: group.dimension || 'disciplineFit',
        severity: group.severity || 'P2',
        scoreImpact: group.scoreImpact || 4,
        sourceExpectation: group.sourceExpectation || group.label,
        observedOutput: `No pattern matched: ${(group.patterns || []).join(', ')}`,
        failureClass: group.dimension === 'courseOperations' ? 'course-operations-gap' : 'discipline-fit-gap',
        targetArea: group.targetArea || 'compiler',
        actionId: group.actionId,
        message: `${manifest.id} is missing ${group.label}.`,
        acceptanceCriteria: group.acceptanceCriteria || [`Compiled output includes ${group.label}.`],
        proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
      }),
    );
  }
  return findings;
}

function scoreForbiddenSignals({ manifest, compiledText }) {
  const findings = [];
  for (const rule of manifest.forbiddenSignals || []) {
    const matches = (rule.patterns || []).filter((pattern) => patternMatches(pattern, compiledText));
    if (matches.length === 0) continue;
    findings.push(
      makeFinding({
        caseId: manifest.id,
        sourceUrl: manifest.sourceUrl,
        dimension: rule.dimension || 'disciplineFit',
        severity: rule.severity || 'P1',
        scoreImpact: rule.scoreImpact || 8,
        sourceExpectation: `Avoid ${rule.label}.`,
        observedOutput: firstSnippet(matches[0], compiledText),
        failureClass: 'wrong-deliverable-genre',
        targetArea: 'compiler',
        actionId: `repair-${rule.id}`,
        message: `${manifest.id} contains forbidden signal: ${rule.label}.`,
        acceptanceCriteria: [`Compiled output no longer contains ${rule.label}.`],
        proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
        evidence: firstSnippet(matches[0], compiledText),
      }),
    );
  }
  return findings;
}

function scoreGenericPhrases({ manifest, compiledText }) {
  const findings = [];
  const specificCount = (manifest.mustPreserveSignals || []).reduce(
    (sum, signal) =>
      sum + countMatches(new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), compiledText),
    0,
  );
  for (const rule of manifest.genericPhraseRejects || []) {
    const count = (rule.patterns || []).reduce((sum, pattern) => sum + countMatches(pattern, compiledText), 0);
    const maxCount = Number.isFinite(Number(rule.maxCount)) ? Number(rule.maxCount) : 0;
    if (count <= maxCount) continue;
    const severity = rule.hardBlocker ? 'P0' : specificCount > 0 ? 'P2' : 'P1';
    findings.push(
      makeFinding({
        caseId: manifest.id,
        sourceUrl: manifest.sourceUrl,
        dimension: rule.dimension || 'disciplineFit',
        severity,
        hardBlocker: Boolean(rule.hardBlocker),
        scoreImpact: rule.scoreImpact || 4,
        sourceExpectation: `Use source-specific artifacts instead of ${rule.label}.`,
        observedOutput: `${count} occurrence(s), max ${maxCount}.`,
        failureClass: rule.hardBlocker ? 'unsupported-approval-claim' : 'generic-template-leak',
        targetArea: rule.hardBlocker ? 'scripts/auditReleaseHistory.mjs' : 'compiler',
        actionId: `repair-${rule.id}`,
        message: `${manifest.id} contains too much ${rule.label}.`,
        acceptanceCriteria: [`No more than ${maxCount} occurrence(s) of ${rule.label} in compiled benchmark output.`],
        proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
        evidence: (rule.patterns || []).map((pattern) => firstSnippet(pattern, compiledText)).find(Boolean) || '',
      }),
    );
  }
  return findings;
}

function scoreFeatureAuthenticity({ manifest, compiled = {}, compiledFeatures = [] }) {
  const findings = [];
  for (const featureId of compiledFeatures) {
    const data = compiled[featureId];
    const text = collectProfessorFacingStrings(data).join(' ');
    if (!text.trim()) {
      findings.push(
        makeFinding({
          caseId: manifest.id,
          sourceUrl: manifest.sourceUrl,
          dimension: 'deliverableAuthenticity',
          severity: 'P1',
          scoreImpact: 8,
          artifact: featureId,
          sourceExpectation: `${FEATURE_LABELS[featureId] || featureId} has inspectable professor-facing content.`,
          observedOutput: 'No inspectable text.',
          failureClass: 'missing-deliverable',
          targetArea: 'compiler',
          actionId: `repair-missing-${featureId}`,
          message: `${manifest.id} has empty ${featureId}.`,
          acceptanceCriteria: [`${featureId} contains inspectable student/instructor-facing content.`],
          proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
        }),
      );
      continue;
    }
    const expectations = FEATURE_EXPECTATIONS[featureId] || [];
    const missing = expectations.filter((pattern) => !pattern.test(text));
    if (missing.length > 0) {
      findings.push(
        makeFinding({
          caseId: manifest.id,
          sourceUrl: manifest.sourceUrl,
          dimension: 'deliverableAuthenticity',
          severity: 'P3',
          scoreImpact: 1,
          artifact: featureId,
          sourceExpectation: `${FEATURE_LABELS[featureId] || featureId} has expected artifact structure.`,
          observedOutput: `Missing structural cue(s): ${missing.map((pattern) => pattern.source).join(', ')}`,
          failureClass: 'artifact-structure-gap',
          targetArea: 'compiler',
          actionId: `repair-${featureId}-structure`,
          message: `${manifest.id} ${featureId} is missing expected structure cues.`,
          acceptanceCriteria: [`${featureId} includes expected structure cues for professor adoption.`],
          proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
        }),
      );
    }
  }
  return findings;
}

function scoreRepetition({ manifest, compiledText = '', compiledSegments = null }) {
  const segments = Array.isArray(compiledSegments) ? compiledSegments : [compiledText];
  const counts = new Map();
  const phraseLength = 8;
  for (const segment of segments) {
    const words = String(segment || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
    for (let index = 0; index <= words.length - phraseLength; index += 1) {
      const phrase = words.slice(index, index + phraseLength).join(' ');
      if (!/\b(?:course|lesson|students|evidence|assessment|artifact|rubric|feedback)\b/.test(phrase)) continue;
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  const [phrase, count] =
    Array.from(counts.entries())
      .filter(([, value]) => value >= 35)
      .sort((a, b) => b[1] - a[1])[0] || [];
  if (!phrase) return [];
  return [
    makeFinding({
      caseId: manifest.id,
      sourceUrl: manifest.sourceUrl,
      dimension: 'packageCraft',
      severity: 'P2',
      scoreImpact: 3,
      sourceExpectation: 'Repeated template phrases should not dominate professor-facing artifacts.',
      observedOutput: `${count} repeats of "${phrase}".`,
      failureClass: 'generic-template-leak',
      targetArea: 'compiler',
      actionId: 'repair-repetitive-template-phrasing',
      message: `${manifest.id} contains repeated templated phrasing.`,
      acceptanceCriteria: ['Repeated eight-word template phrases stay below 35 occurrences per benchmark case.'],
      proofCommands: [`npm run audit:professor-adoption:smoke -- --case ${manifest.id}`],
      evidence: phrase,
    }),
  ];
}

function scoreReleaseBoundary(text = '') {
  return REQUIRED_RELEASE_BOUNDARY_PATTERNS.flatMap((rule) =>
    rule.pattern.test(text)
      ? [
          makeFinding({
            caseId: 'release-claim-boundary',
            sourceUrl: 'local release surfaces',
            dimension: 'sourceFidelity',
            severity: 'P0',
            scoreImpact: 20,
            hardBlocker: true,
            sourceExpectation: 'Public benchmark evidence must not be described as professor approval.',
            observedOutput: firstSnippet(rule.pattern, text),
            failureClass: 'unsupported-approval-claim',
            targetArea: 'scripts/auditReleaseHistory.mjs',
            actionId: `repair-${rule.id}`,
            message: `Release text contains unsupported ${rule.label}.`,
            acceptanceCriteria: [
              'Release surfaces distinguish public-source benchmark evidence from professor approval.',
            ],
            proofCommands: ['npm run audit:release-history'],
            evidence: firstSnippet(rule.pattern, text),
          }),
        ]
      : [],
  );
}

export function scoreProfessorAdoptionCase({ manifest, compiled = {}, compiledFeatures = [] }) {
  const compiledText = collectStrings(compiled).join(' ');
  const professorFacingSegments = collectProfessorFacingStrings(compiled);
  const professorFacingText = professorFacingSegments.join(' ');
  const professorFacingDistinctSegments = uniqueTextSegments(professorFacingSegments);
  const professorFacingDistinctText = professorFacingDistinctSegments.join(' ');
  const findings = [
    ...scoreSignalGroups({ manifest, compiledText: professorFacingText }),
    ...scoreForbiddenSignals({ manifest, compiledText: professorFacingText }),
    ...scoreGenericPhrases({ manifest, compiledText: professorFacingText }),
    ...scoreFeatureAuthenticity({ manifest, compiled, compiledFeatures }),
    ...scoreRepetition({ manifest, compiledSegments: professorFacingDistinctSegments }),
    ...scoreReleaseBoundary(compiledText),
  ];
  const dimensionScores = Object.fromEntries(ADOPTION_DIMENSIONS.map((dimension) => [dimension.id, dimension.weight]));
  for (const finding of findings) {
    const dimension = finding.dimension || 'disciplineFit';
    dimensionScores[dimension] = scoreFloor((dimensionScores[dimension] ?? 0) - (finding.scoreImpact || 0));
  }
  const score = ADOPTION_DIMENSIONS.reduce((sum, dimension) => sum + scoreFloor(dimensionScores[dimension.id]), 0);
  const hardBlockers = findings.filter((finding) => finding.hardBlocker || finding.severity === 'P0');
  const p1Findings = findings.filter((finding) => finding.severity === 'P1');
  const p2Findings = findings.filter((finding) => finding.severity === 'P2');
  const status =
    hardBlockers.length > 0
      ? 'blocked'
      : score >= 85 && p1Findings.length === 0 && p2Findings.length === 0
        ? 'pass'
        : 'repair-required';
  return {
    caseId: manifest.id,
    title: manifest.title,
    sourceUrl: manifest.sourceUrl,
    publicInstructorNames: manifest.publicInstructorNames,
    disciplineFamily: manifest.disciplineFamily,
    modality: manifest.modality,
    status,
    score,
    dimensionScores,
    findingCount: findings.length,
    hardBlockerCount: hardBlockers.length,
    p1FindingCount: p1Findings.length,
    compiledFeatureCount: compiledFeatures.length,
    compiledFeatures,
    compiledTextLength: compiledText.length,
    professorFacingTextLength: professorFacingText.length,
    professorFacingDistinctTextLength: professorFacingDistinctText.length,
    findings: findings.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.scoreImpact - a.scoreImpact,
    ),
  };
}

export function summarizeProfessorAdoptionResults(results = []) {
  const scores = results.map((result) => result.score).filter(Number.isFinite);
  const findingCounts = results.reduce(
    (counts, result) => {
      for (const finding of result.findings || []) {
        counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      }
      return counts;
    },
    { P0: 0, P1: 0, P2: 0, P3: 0 },
  );
  return {
    status: results.some((result) => result.status === 'blocked')
      ? 'blocked'
      : results.some((result) => result.status === 'repair-required')
        ? 'repair-required'
        : 'pass',
    caseCount: results.length,
    passedCaseCount: results.filter((result) => result.status === 'pass').length,
    blockedCaseCount: results.filter((result) => result.status === 'blocked').length,
    repairRequiredCaseCount: results.filter((result) => result.status === 'repair-required').length,
    averageScore: scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1))
      : 0,
    minimumScore: scores.length ? Math.min(...scores) : 0,
    findingCounts,
    findingCount: Object.values(findingCounts).reduce((sum, count) => sum + count, 0),
  };
}
