import { lintItemAdmission } from '../itemAdmissionLint.js';
import {
  isAppliedQuizStem,
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
} from './quizItemDepth.js';
import { analyzeDecisionScenario, isConcreteScenarioMaterials } from '../scenarioContract.js';
import { findScionExplanationKeyConflict } from '../scionAnswerKeyAlignment.js';

const RATIONALE_CONTRAST_RE =
  /\b(?:whereas|while|but|rather than|instead|unlike|other options?|closest distractor|fails?|does not|do not)\b/i;
const BOUNDED_ANSWER_RE =
  /\b(?:limit(?:ation)?|boundary|trade-?off|alternative|additional evidence|do(?:es)? not prove|not (?:a broader|an unrestricted)|cannot establish|case-specific|competing interpretation)\b/i;

const TRACE_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'analysis',
  'analyze',
  'apply',
  'artifact',
  'assessment',
  'before',
  'between',
  'case',
  'class',
  'course',
  'decision',
  'evidence',
  'example',
  'explain',
  'identify',
  'lesson',
  'material',
  'project',
  'question',
  'response',
  'source',
  'student',
  'students',
  'support',
  'task',
  'their',
  'these',
  'those',
  'through',
  'using',
  'which',
  'while',
  'with',
  'work',
]);

function text(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value) {
  return text(value).match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
}

function ratio(count, total) {
  return { count, total, share: total > 0 ? count / total : 0 };
}

function traceTokens(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g)
      ?.map((token) => token.replace(/['’].*$/, ''))
      .filter((token) => token.length >= 4 && !TRACE_STOPWORDS.has(token)) || [],
  );
}

function traceOverlap(left, right) {
  const leftTokens = traceTokens(left);
  const rightTokens = traceTokens(right);
  return [...leftTokens].filter((token) => rightTokens.has(token)).sort();
}

function objectText(value) {
  if (Array.isArray(value)) return value.map(objectText).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(objectText).filter(Boolean).join(' ');
  return typeof value === 'string' || typeof value === 'number' ? text(value) : '';
}

export function parseSavedCourseGraph(project) {
  const raw = project?.courseGraphJson ?? project?.courseGraph ?? project;
  if (typeof raw === 'string') return JSON.parse(raw);
  if (raw && typeof raw === 'object') return raw;
  throw new Error('Expected a saved project with courseGraphJson or a CourseGraph object.');
}

export function isDecisionReadyScenario(scenario = {}) {
  return analyzeDecisionScenario(scenario).ready;
}

export { isConcreteScenarioMaterials };

function lessonRows(graph) {
  const lessonContent = graph?.enrichmentOverlay?.lessonContent || {};
  const sessionLessonIds = (Array.isArray(graph?.sessions) ? graph.sessions : [])
    .map((session, index) => {
      const number = Number(session?.number);
      return `lesson-${Number.isInteger(number) && number > 0 ? number : index + 1}`;
    })
    .filter(Boolean);
  const lessonIds = [...new Set([...sessionLessonIds, ...Object.keys(lessonContent)])];
  return lessonIds.map((lessonId) => {
    const content = lessonContent[lessonId] || {};
    const items = Array.isArray(content?.quizItems) ? content.quizItems : [];
    return {
      lessonId,
      scenario: content?.kernel?.scenario || {},
      multipleChoice: items.filter((item) => item?.type === 'multiple_choice'),
      shortAnswers: items.filter((item) => item?.type === 'short_answer'),
    };
  });
}

const DIFFERENCE_FLOORS = Object.freeze({
  appliedMultipleChoice: 0.55,
  supportedMultipleChoice: 1,
  contrastiveRationales: 0.9,
  explanationAlignedMultipleChoice: 1,
  scenarioCoverage: 1,
  decisionReadyScenarios: 0.9,
  concreteScenarioMaterials: 0.9,
  cueFreeShortAnswers: 1,
  claimEvidenceBoundaryShortAnswers: 1,
  boundedModelAnswers: 0.8,
});

function lessonMetric(count, total) {
  return { count, total, share: total > 0 ? count / total : 0 };
}

function analyzeLessonRow(lesson) {
  const multipleChoice = lesson?.multipleChoice || [];
  const shortAnswers = lesson?.shortAnswers || [];
  const scenario = lesson?.scenario || {};
  const scenarioPresent = Boolean(text(scenario?.setup || scenario?.su));
  return {
    appliedMultipleChoice: lessonMetric(
      multipleChoice.filter((item) => isAppliedQuizStem(item.question)).length,
      multipleChoice.length,
    ),
    supportedMultipleChoice: lessonMetric(
      multipleChoice.filter((item) => !lintItemAdmission(item).some((issue) => issue.startsWith('unsupported-')))
        .length,
      multipleChoice.length,
    ),
    contrastiveRationales: lessonMetric(
      multipleChoice.filter((item) => RATIONALE_CONTRAST_RE.test(text(item.explanation))).length,
      multipleChoice.length,
    ),
    explanationAlignedMultipleChoice: lessonMetric(
      multipleChoice.filter((item) => !findScionExplanationKeyConflict(item)).length,
      multipleChoice.length,
    ),
    scenarioCoverage: lessonMetric(scenarioPresent ? 1 : 0, 1),
    decisionReadyScenarios: lessonMetric(isDecisionReadyScenario(scenario) ? 1 : 0, 1),
    concreteScenarioMaterials: lessonMetric(
      isConcreteScenarioMaterials(scenario?.materials || scenario?.ma) ? 1 : 0,
      1,
    ),
    cueFreeShortAnswers: lessonMetric(
      shortAnswers.filter((item) => !isConceptCuedCompilerShortAnswer(item.question)).length,
      shortAnswers.length,
    ),
    claimEvidenceBoundaryShortAnswers: lessonMetric(
      shortAnswers.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question)).length,
      shortAnswers.length,
    ),
    boundedModelAnswers: lessonMetric(
      shortAnswers.filter((item) => BOUNDED_ANSWER_RE.test(text(item.answer))).length,
      shortAnswers.length,
    ),
  };
}

function classifyDifference(candidate, reference, floor) {
  if (candidate.total === 0 && reference.total === 0) return 'uncertain';
  const candidatePass = candidate.share >= floor && candidate.total > 0;
  const referencePass = reference.share >= floor && reference.total > 0;
  if (candidatePass && referencePass) return 'parity';
  if (referencePass && !candidatePass) return 'learn';
  if (candidatePass && !referencePass) return 'preserve';
  if (!candidatePass && !referencePass) return 'repair';
  return 'uncertain';
}

/**
 * Build a diagnostic-only, lesson-level difference ledger. These records name
 * where to learn or preserve behavior, but never become preference data until
 * a separate pair-level verifier or blinded reviewer supplies evidence.
 */
export function buildScionDifferenceLab(candidateProject, referenceProject) {
  const candidateRows = new Map(
    lessonRows(parseSavedCourseGraph(candidateProject)).map((lesson) => [lesson.lessonId, lesson]),
  );
  const referenceRows = new Map(
    lessonRows(parseSavedCourseGraph(referenceProject)).map((lesson) => [lesson.lessonId, lesson]),
  );
  const lessonIds = [...new Set([...candidateRows.keys(), ...referenceRows.keys()])].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const records = [];
  for (const lessonId of lessonIds) {
    const candidateMetrics = analyzeLessonRow(candidateRows.get(lessonId));
    const referenceMetrics = analyzeLessonRow(referenceRows.get(lessonId));
    for (const dimension of COMPARISON_DIMENSIONS) {
      const candidate = candidateMetrics[dimension.key];
      const reference = referenceMetrics[dimension.key];
      const floor = DIFFERENCE_FLOORS[dimension.key] ?? 0.5;
      const outcome = classifyDifference(candidate, reference, floor);
      records.push({
        id: `${lessonId}:${dimension.key}`,
        lessonId,
        dimension: dimension.key,
        label: dimension.label,
        outcome,
        floor,
        candidate,
        reference,
        recommendation: dimension.lesson,
        trainingEligible: false,
        evidenceStatus: 'diagnostic-only',
      });
    }
  }
  const outcomes = Object.fromEntries(
    ['learn', 'preserve', 'repair', 'parity', 'uncertain'].map((outcome) => [
      outcome,
      records.filter((record) => record.outcome === outcome).length,
    ]),
  );
  return {
    lessons: lessonIds.length,
    records,
    outcomes,
    trainingBoundary:
      'Difference records are diagnostic-only. Promotion to a training pair requires verified pair-level evidence and corpus admission.',
  };
}

function metric(count, total) {
  const value = ratio(count, total);
  return { ...value, percent: Number((value.share * 100).toFixed(1)) };
}

export function analyzeQuizProject(project, { label = 'project' } = {}) {
  const graph = parseSavedCourseGraph(project);
  const lessons = lessonRows(graph);
  const multipleChoice = lessons.flatMap((lesson) => lesson.multipleChoice);
  const shortAnswers = lessons.flatMap((lesson) => lesson.shortAnswers);
  const scenarios = lessons.map((lesson) => lesson.scenario);
  const presentScenarios = scenarios.filter((scenario) => text(scenario?.setup || scenario?.su));

  const applied = multipleChoice.filter((item) => isAppliedQuizStem(item.question));
  const unsupported = multipleChoice.filter((item) =>
    lintItemAdmission(item).some((issue) => issue.startsWith('unsupported-')),
  );
  const contrastiveRationales = multipleChoice.filter((item) => RATIONALE_CONTRAST_RE.test(text(item.explanation)));
  const explanationAligned = multipleChoice.filter((item) => !findScionExplanationKeyConflict(item));
  const decisionReady = scenarios.filter(isDecisionReadyScenario);
  const concreteMaterials = scenarios.filter((scenario) =>
    isConcreteScenarioMaterials(scenario?.materials || scenario?.ma),
  );
  const derivedScenarios = scenarios.filter((scenario) => scenario?.source === 'derived-kernel-fallback');
  const cueFree = shortAnswers.filter((item) => !isConceptCuedCompilerShortAnswer(item.question));
  const claimEvidenceBoundary = shortAnswers.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question));
  const boundedAnswers = shortAnswers.filter((item) => BOUNDED_ANSWER_RE.test(text(item.answer)));
  const weakScenario = scenarios.find((scenario) => !isDecisionReadyScenario(scenario));

  return {
    label,
    totals: { lessons: lessons.length, multipleChoice: multipleChoice.length, shortAnswers: shortAnswers.length },
    metrics: {
      appliedMultipleChoice: metric(applied.length, multipleChoice.length),
      supportedMultipleChoice: metric(multipleChoice.length - unsupported.length, multipleChoice.length),
      contrastiveRationales: metric(contrastiveRationales.length, multipleChoice.length),
      explanationAlignedMultipleChoice: metric(explanationAligned.length, multipleChoice.length),
      scenarioCoverage: metric(presentScenarios.length, lessons.length),
      decisionReadyScenarios: metric(decisionReady.length, lessons.length),
      concreteScenarioMaterials: metric(concreteMaterials.length, lessons.length),
      derivedScenarioFallbacks: metric(derivedScenarios.length, lessons.length),
      cueFreeShortAnswers: metric(cueFree.length, shortAnswers.length),
      claimEvidenceBoundaryShortAnswers: metric(claimEvidenceBoundary.length, shortAnswers.length),
      boundedModelAnswers: metric(boundedAnswers.length, shortAnswers.length),
      averageScenarioWords: {
        value:
          presentScenarios.length > 0
            ? Number(
                (
                  presentScenarios.reduce((sum, scenario) => sum + words(scenario.setup || scenario.su), 0) /
                  presentScenarios.length
                ).toFixed(1),
              )
            : 0,
      },
    },
    examples: {
      decisionReadyScenario: text(decisionReady[0]?.setup || decisionReady[0]?.su),
      weakScenario: text(weakScenario?.setup),
      weakScenarioIssues: weakScenario ? analyzeDecisionScenario(weakScenario).issues : [],
      conceptCuedShortAnswer: text(
        shortAnswers.find((item) => isConceptCuedCompilerShortAnswer(item.question))?.question,
      ),
      claimEvidenceBoundaryShortAnswer: text(
        shortAnswers.find((item) => isClaimEvidenceBoundaryShortAnswer(item.question))?.question,
      ),
    },
  };
}

export const QUIZ_CONTRAST_RELEASE_BARS = Object.freeze({
  minimumLessons: 12,
  appliedMultipleChoice: 0.55,
  supportedMultipleChoice: 1,
  contrastiveRationales: 0.9,
  explanationAlignedMultipleChoice: 1,
  scenarioCoverage: 1,
  decisionReadyScenarios: 0.9,
  concreteScenarioMaterials: 0.9,
  cueFreeShortAnswers: 1,
  claimEvidenceBoundaryShortAnswers: 1,
});

const SURFACE_COMPARISON_DIMENSIONS = [
  {
    key: 'substantiveKeyTerms',
    label: 'substantive key-term set',
    lesson: 'Keep at least three terms with a real definition, example, misconception, and correction.',
  },
  {
    key: 'authenticAssignmentCore',
    label: 'authentic assignment core',
    lesson: 'Author a concrete task, student product, and at least two explicit constraints for every lesson.',
  },
  {
    key: 'assignmentConstraintDepth',
    label: 'assignment constraint depth',
    lesson: 'Specify scope, format, evidence, and length or time as distinct assignment parameters.',
  },
  {
    key: 'discussionTension',
    label: 'discussion tension and positions',
    lesson: 'Frame a genuine tension and at least two defensible positions rather than a one-sided prompt.',
  },
  {
    key: 'integrativeThirdPosition',
    label: 'integrative third discussion position',
    lesson:
      'Add a defensible synthesis or conditional third position when the issue supports more than a binary choice.',
  },
  {
    key: 'authoredStudyStrategy',
    label: 'authored study strategy',
    lesson:
      'Author a lesson-specific study summary and review strategy instead of relying entirely on compiler fallback.',
  },
];

const CROSS_ARTIFACT_COMPARISON_DIMENSIONS = [
  {
    key: 'objectiveQuizTrace',
    label: 'objective to quiz trace',
    lesson: 'Make at least one domain-specific objective idea inspectable in the lesson quiz evidence.',
  },
  {
    key: 'assessmentAssignmentTrace',
    label: 'official assessment to assignment trace',
    lesson: 'Keep the authored assignment visibly connected to the assessment named in the canonical course graph.',
  },
  {
    key: 'assignmentQuizTrace',
    label: 'assignment to quiz trace',
    lesson: 'Carry domain-specific task language from the assignment into at least one assessment item.',
  },
  {
    key: 'discussionQuizTrace',
    label: 'discussion to quiz trace',
    lesson: 'Carry the lesson discussion tension into assessed reasoning rather than leaving it isolated.',
  },
  {
    key: 'studyQuizTrace',
    label: 'study guide to quiz trace',
    lesson: 'Make the study guide rehearse domain-specific knowledge that the quiz actually checks.',
  },
  {
    key: 'scenarioAssessmentTrace',
    label: 'scenario to assessment trace',
    lesson: 'Reuse inspectable scenario details in the assignment or quiz so the case is not decorative.',
  },
  {
    key: 'primaryTermPropagation',
    label: 'primary term propagation',
    lesson: 'Propagate the primary domain term across at least three authored surfaces in the same lesson.',
  },
];

function crossArtifactLessonRows(graph) {
  const content = graph?.enrichmentOverlay?.lessonContent || {};
  const sessions = Array.isArray(graph?.sessions) ? graph.sessions : [];
  const assessments = Array.isArray(graph?.assessments) ? graph.assessments : [];
  const outcomes = Array.isArray(graph?.outcomes) ? graph.outcomes : [];
  const sessionRows = sessions.map((session, index) => {
    const number = Number(session?.number);
    const lessonNumber = Number.isInteger(number) && number > 0 ? number : index + 1;
    return { lessonId: `lesson-${lessonNumber}`, lessonNumber, session };
  });
  const lessonIds = [...new Set([...sessionRows.map((row) => row.lessonId), ...Object.keys(content)])].sort(
    (left, right) => left.localeCompare(right, undefined, { numeric: true }),
  );
  return lessonIds.map((lessonId, index) => {
    const sessionRow = sessionRows.find((row) => row.lessonId === lessonId);
    const lessonNumber = sessionRow?.lessonNumber || Number(lessonId.match(/\d+/)?.[0]) || index + 1;
    const session = sessionRow?.session || {};
    const assessmentRefs = new Set(
      (session.sections || []).flatMap((section) =>
        Array.isArray(section?.assessmentRefs) ? section.assessmentRefs : [],
      ),
    );
    const objectiveRefs = new Set(
      (session.sections || []).flatMap((section) =>
        Array.isArray(section?.objectiveRefs) ? section.objectiveRefs : [],
      ),
    );
    return {
      lessonId,
      lessonNumber,
      session,
      content: content[lessonId] || {},
      assessments: assessments.filter(
        (assessment) => Number(assessment?.dueSession) === lessonNumber || assessmentRefs.has(assessment?.id),
      ),
      outcomes: outcomes.filter((outcome) => outcome?.sessionRef === session?.id || objectiveRefs.has(outcome?.id)),
    };
  });
}

function traceMetric(source, target, minimumSharedTokens = 1) {
  const sourceText = objectText(source);
  const targetText = objectText(target);
  const sharedTokens = traceOverlap(sourceText, targetText);
  const sourceAvailable = words(sourceText) >= 2;
  const targetAvailable = words(targetText) >= 2;
  const passed = sourceAvailable && targetAvailable && sharedTokens.length >= minimumSharedTokens;
  return {
    ...lessonMetric(passed ? 1 : 0, 1),
    sourceAvailable,
    targetAvailable,
    sharedTokens,
    minimumSharedTokens,
  };
}

function crossArtifactSurfaceText(content = {}) {
  const quizItems = Array.isArray(content.quizItems) ? content.quizItems : [];
  const slides = Array.isArray(content.slideContent) ? content.slideContent : [];
  return {
    assignment: objectText(content.assignmentCore),
    discussion: objectText(content.discussionPrompt),
    study: objectText(content.studyGuide),
    quiz: objectText(
      quizItems.map((item) => ({
        question: item?.question,
        options: item?.options,
        answer: item?.answer,
        explanation: item?.explanation,
      })),
    ),
    scenario: objectText(content?.kernel?.scenario),
    slides: objectText(slides),
  };
}

function analyzeCrossArtifactLesson(row = {}) {
  const content = row.content || {};
  const surfaces = crossArtifactSurfaceText(content);
  const objectiveText = objectText(row.outcomes);
  const assessmentText = objectText(row.assessments);
  const primaryTerm = text(content?.keyTerms?.[0]?.term);
  const primaryTermTokens = traceTokens(primaryTerm);
  const propagatedSurfaces = Object.entries(surfaces)
    .filter(([, value]) => words(value) >= 2)
    .filter(([, value]) => [...primaryTermTokens].some((token) => traceTokens(value).has(token)))
    .map(([surface]) => surface);
  const primaryTermPassed = primaryTermTokens.size > 0 && propagatedSurfaces.length >= 3;
  return {
    objectiveQuizTrace: traceMetric(objectiveText, surfaces.quiz),
    assessmentAssignmentTrace: traceMetric(assessmentText, surfaces.assignment),
    assignmentQuizTrace: traceMetric(surfaces.assignment, surfaces.quiz, 2),
    discussionQuizTrace: traceMetric(surfaces.discussion, surfaces.quiz, 2),
    studyQuizTrace: traceMetric(surfaces.study, surfaces.quiz, 2),
    scenarioAssessmentTrace: traceMetric(surfaces.scenario, `${surfaces.assignment} ${surfaces.quiz}`, 2),
    primaryTermPropagation: {
      ...lessonMetric(primaryTermPassed ? 1 : 0, 1),
      sourceAvailable: primaryTermTokens.size > 0,
      targetAvailable: Object.values(surfaces).filter((value) => words(value) >= 2).length >= 3,
      primaryTerm,
      propagatedSurfaces,
      minimumSurfaces: 3,
    },
  };
}

export function buildScionCrossArtifactDifferenceLab(candidateProject, referenceProject) {
  const candidateRows = new Map(
    crossArtifactLessonRows(parseSavedCourseGraph(candidateProject)).map((row) => [row.lessonId, row]),
  );
  const referenceRows = new Map(
    crossArtifactLessonRows(parseSavedCourseGraph(referenceProject)).map((row) => [row.lessonId, row]),
  );
  const lessonIds = [...new Set([...candidateRows.keys(), ...referenceRows.keys()])].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const records = [];
  for (const lessonId of lessonIds) {
    const candidateMetrics = analyzeCrossArtifactLesson(candidateRows.get(lessonId));
    const referenceMetrics = analyzeCrossArtifactLesson(referenceRows.get(lessonId));
    for (const dimension of CROSS_ARTIFACT_COMPARISON_DIMENSIONS) {
      const candidate = candidateMetrics[dimension.key];
      const reference = referenceMetrics[dimension.key];
      records.push({
        id: `${lessonId}:cross-artifact:${dimension.key}`,
        lessonId,
        dimension: dimension.key,
        label: dimension.label,
        outcome: classifyDifference(candidate, reference, 1),
        floor: 1,
        candidate,
        reference,
        recommendation: dimension.lesson,
        trainingEligible: false,
        evidenceStatus: 'diagnostic-only',
      });
    }
  }
  return {
    lessons: lessonIds.length,
    records,
    outcomes: Object.fromEntries(
      ['learn', 'preserve', 'repair', 'parity', 'uncertain'].map((outcome) => [
        outcome,
        records.filter((record) => record.outcome === outcome).length,
      ]),
    ),
    denominatorPolicy:
      'Every lesson contributes one seat per trace. Missing required surfaces count as failures and never disappear from the denominator.',
    trainingBoundary:
      'Cross-artifact traces are lexical, deterministic diagnostics. They identify alignment gaps but are not human preference or semantic correctness proof.',
  };
}

function surfaceLessonRows(graph) {
  const content = graph?.enrichmentOverlay?.lessonContent || {};
  const sessionIds = (graph?.sessions || []).map((session, index) => {
    const number = Number(session?.number);
    return `lesson-${Number.isInteger(number) && number > 0 ? number : index + 1}`;
  });
  return [...new Set([...sessionIds, ...Object.keys(content)])].map((lessonId) => ({
    lessonId,
    content: content[lessonId] || {},
  }));
}

function analyzeSurfaceLesson(row = {}) {
  const content = row.content || {};
  const terms = Array.isArray(content.keyTerms) ? content.keyTerms : [];
  const assignment = content.assignmentCore || {};
  const parameters = Array.isArray(assignment.parameters) ? assignment.parameters.filter(text) : [];
  const discussion = content.discussionPrompt || {};
  const positions = Array.isArray(discussion.positions) ? discussion.positions.filter(text) : [];
  const studyGuide = content.studyGuide || {};
  const substantiveTermCount = terms.filter(
    (term) =>
      words(term?.definition) >= 8 &&
      words(term?.example) >= 5 &&
      words(term?.misconception) >= 5 &&
      words(term?.correction) >= 5,
  ).length;
  const substantiveTerms = substantiveTermCount >= 3;
  return {
    substantiveKeyTerms: lessonMetric(substantiveTerms ? 1 : 0, 1),
    authenticAssignmentCore: lessonMetric(words(assignment.taskDescription) >= 12 && parameters.length >= 2 ? 1 : 0, 1),
    assignmentConstraintDepth: lessonMetric(parameters.length >= 4 ? 1 : 0, 1),
    discussionTension: lessonMetric(
      words(discussion.prompt) >= 8 && words(discussion.tension) >= 6 && positions.length >= 2 ? 1 : 0,
      1,
    ),
    integrativeThirdPosition: lessonMetric(positions.length >= 3 ? 1 : 0, 1),
    authoredStudyStrategy: lessonMetric(
      words(studyGuide.summary) >= 12 &&
        (Array.isArray(studyGuide.reviewStrategies)
          ? studyGuide.reviewStrategies.filter(text).length >= 2
          : words(studyGuide.reviewStrategy) >= 8)
        ? 1
        : 0,
      1,
    ),
  };
}

export function buildScionSurfaceDifferenceLab(candidateProject, referenceProject) {
  const candidateRows = new Map(
    surfaceLessonRows(parseSavedCourseGraph(candidateProject)).map((row) => [row.lessonId, row]),
  );
  const referenceRows = new Map(
    surfaceLessonRows(parseSavedCourseGraph(referenceProject)).map((row) => [row.lessonId, row]),
  );
  const lessonIds = [...new Set([...candidateRows.keys(), ...referenceRows.keys()])].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  const records = [];
  for (const lessonId of lessonIds) {
    const candidateMetrics = analyzeSurfaceLesson(candidateRows.get(lessonId));
    const referenceMetrics = analyzeSurfaceLesson(referenceRows.get(lessonId));
    for (const dimension of SURFACE_COMPARISON_DIMENSIONS) {
      const candidate = candidateMetrics[dimension.key];
      const reference = referenceMetrics[dimension.key];
      records.push({
        id: `${lessonId}:surface:${dimension.key}`,
        lessonId,
        dimension: dimension.key,
        label: dimension.label,
        outcome: classifyDifference(candidate, reference, 1),
        floor: 1,
        candidate,
        reference,
        recommendation: dimension.lesson,
        trainingEligible: false,
        evidenceStatus: 'diagnostic-only',
      });
    }
  }
  return {
    lessons: lessonIds.length,
    records,
    outcomes: Object.fromEntries(
      ['learn', 'preserve', 'repair', 'parity', 'uncertain'].map((outcome) => [
        outcome,
        records.filter((record) => record.outcome === outcome).length,
      ]),
    ),
    trainingBoundary:
      'Surface differences are diagnostic-only. A model label, parameter count, or authored-field presence is not preference proof.',
  };
}

export function evaluateQuizReleaseBars(profile, bars = QUIZ_CONTRAST_RELEASE_BARS) {
  const checks = [
    {
      key: 'minimumLessons',
      label: 'lesson denominator',
      actual: profile?.totals?.lessons || 0,
      required: bars.minimumLessons,
      passed: (profile?.totals?.lessons || 0) >= bars.minimumLessons,
      display: `${profile?.totals?.lessons || 0}/${bars.minimumLessons} lessons`,
    },
    ...Object.entries(bars)
      .filter(([key]) => key !== 'minimumLessons')
      .map(([key, required]) => {
        const actual = profile?.metrics?.[key]?.share || 0;
        return {
          key,
          label: COMPARISON_DIMENSIONS.find((dimension) => dimension.key === key)?.label || key,
          actual,
          required,
          passed: actual >= required,
          display: `${(actual * 100).toFixed(1)}% / >= ${(required * 100).toFixed(1)}%`,
        };
      }),
  ];
  return {
    status: checks.every((check) => check.passed) ? 'passed' : 'failed',
    checks,
    failures: checks.filter((check) => !check.passed),
  };
}

const COMPARISON_DIMENSIONS = [
  {
    key: 'appliedMultipleChoice',
    label: 'applied MC reasoning',
    lesson: 'Require students to reason from an inspectable case instead of recalling terminology.',
  },
  {
    key: 'supportedMultipleChoice',
    label: 'supported MC inference',
    lesson:
      'Supply enough evidence for one uniquely defensible answer and reject unsupported motive or causal inference.',
  },
  {
    key: 'contrastiveRationales',
    label: 'contrastive rationales',
    lesson: 'Explain why the key wins and why the nearest plausible distractor fails.',
  },
  {
    key: 'explanationAlignedMultipleChoice',
    label: 'explanation-key alignment',
    lesson: 'Keep the declared answer index consistent with the option explicitly supported by the explanation.',
  },
  {
    key: 'scenarioCoverage',
    label: 'scenario coverage',
    lesson: 'Keep one accepted or grounded scenario for every lesson; missing scenarios count against the score.',
  },
  {
    key: 'decisionReadyScenarios',
    label: 'decision-ready scenarios',
    lesson: 'Give a concrete evidence packet with a real constraint, tension, or decision to resolve.',
  },
  {
    key: 'concreteScenarioMaterials',
    label: 'inspectable scenario materials',
    lesson: 'Name the specific notes, data, text, design, or recording students can inspect.',
  },
  {
    key: 'cueFreeShortAnswers',
    label: 'cue-free short answers',
    lesson: 'Ask students to select the relevant concept or method instead of naming it in the prompt.',
  },
  {
    key: 'claimEvidenceBoundaryShortAnswers',
    label: 'claim-evidence-boundary short answers',
    lesson: 'Require a bounded conclusion, case evidence, and a limitation or next evidence need.',
  },
  {
    key: 'boundedModelAnswers',
    label: 'bounded model answers',
    lesson: 'Model what the evidence supports and explicitly state what it cannot establish.',
  },
];

export function compareQuizProjects(candidateProject, referenceProject, options = {}) {
  const candidate = analyzeQuizProject(candidateProject, { label: options.candidateLabel || 'candidate' });
  const reference = analyzeQuizProject(referenceProject, { label: options.referenceLabel || 'reference' });
  for (const [role, profile] of [
    ['candidate', candidate],
    ['reference', reference],
  ]) {
    const totals = profile?.totals || {};
    if (!totals.lessons || !totals.multipleChoice || !totals.shortAnswers) {
      throw new Error(
        `Cannot compare ${role}: saved artifact is missing authored lesson, multiple-choice, or short-answer evidence. ` +
          'Recapture the source-of-truth CourseGraph instead of scoring an empty denominator.',
      );
    }
  }
  const learn = [];
  const preserve = [];
  const shared = [];

  for (const dimension of COMPARISON_DIMENSIONS) {
    const candidateMetric = candidate.metrics[dimension.key];
    const referenceMetric = reference.metrics[dimension.key];
    const delta = referenceMetric.share - candidateMetric.share;
    if (delta >= 0.1) {
      learn.push({
        key: dimension.key,
        label: dimension.label,
        gapPoints: Number((delta * 100).toFixed(1)),
        recommendation: dimension.lesson,
      });
    } else if (delta <= -0.1) {
      preserve.push({
        key: dimension.key,
        label: dimension.label,
        advantagePoints: Number((-delta * 100).toFixed(1)),
      });
    }
    if (candidateMetric.share < 0.5 && referenceMetric.share < 0.5) {
      shared.push({ key: dimension.key, label: dimension.label, recommendation: dimension.lesson });
    }
  }

  return {
    candidate,
    reference,
    differenceLab: buildScionDifferenceLab(candidateProject, referenceProject),
    surfaceDifferenceLab: buildScionSurfaceDifferenceLab(candidateProject, referenceProject),
    crossArtifactDifferenceLab: buildScionCrossArtifactDifferenceLab(candidateProject, referenceProject),
    releaseBars: evaluateQuizReleaseBars(candidate),
    learning: { learn, preserve, shared },
    claimBoundary:
      'This paired diagnostic identifies authoring patterns worth testing. One course pair is directional evidence, not proof of general model superiority.',
  };
}

export const quizContrastDimensions = COMPARISON_DIMENSIONS;
export const surfaceContrastDimensions = SURFACE_COMPARISON_DIMENSIONS;
export const crossArtifactContrastDimensions = CROSS_ARTIFACT_COMPARISON_DIMENSIONS;

export function aggregateOrderReversedJudgments(readings = []) {
  const valid = readings.filter(
    (reading) =>
      reading?.order?.A &&
      reading?.order?.B &&
      Number.isFinite(Number(reading?.result?.aScore)) &&
      Number.isFinite(Number(reading?.result?.bScore)),
  );
  const scores = new Map();
  const normalizedPreferences = [];
  const positionPreferences = [];
  for (const reading of valid) {
    const aLabel = reading.order.A;
    const bLabel = reading.order.B;
    const aScore = Number(reading.result.aScore);
    const bScore = Number(reading.result.bScore);
    scores.set(aLabel, [...(scores.get(aLabel) || []), aScore]);
    scores.set(bLabel, [...(scores.get(bLabel) || []), bScore]);
    const preferredPosition = reading.result.preferred;
    positionPreferences.push(preferredPosition);
    normalizedPreferences.push(preferredPosition === 'A' ? aLabel : preferredPosition === 'B' ? bLabel : 'tie');
  }
  const scoresByLabel = Object.fromEntries(
    [...scores.entries()].map(([label, values]) => [
      label,
      {
        readings: values,
        mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
        swing: Math.max(...values) - Math.min(...values),
      },
    ]),
  );
  const substantivePreferences = [...new Set(normalizedPreferences.filter((value) => value !== 'tie'))];
  const maxScoreSwing = Math.max(0, ...Object.values(scoresByLabel).map((row) => row.swing));
  const positionBias =
    positionPreferences.length >= 2 &&
    new Set(positionPreferences.filter((value) => value !== 'tie')).size === 1 &&
    substantivePreferences.length > 1;
  const conclusive = valid.length >= 2 && substantivePreferences.length <= 1 && maxScoreSwing <= 2 && !positionBias;
  return {
    status: conclusive ? 'conclusive' : 'inconclusive',
    preferred: conclusive ? substantivePreferences[0] || 'tie' : 'inconclusive',
    scoresByLabel,
    normalizedPreferences,
    positionPreferences,
    maxScoreSwing,
    positionBias,
    reason: conclusive
      ? 'Order-reversed readings agree within the score-stability threshold.'
      : 'Order-reversed readings disagree, show position bias, or exceed the score-stability threshold.',
  };
}
