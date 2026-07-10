import { lintItemAdmission } from '../itemAdmissionLint.js';
import {
  isAppliedQuizStem,
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
} from './quizItemDepth.js';

const DECISION_CONSTRAINT_RE =
  /\b(?:but|however|while|whereas|although|must decide|trade-?off|constraint|conflict|cannot|fails?|difficult|confus(?:e|ed|ing|ion)|hesitat(?:e|es|ed|ing|ion)|delay(?:s|ed)?|unsure|disagree|complaint|problem)\b/i;
const RATIONALE_CONTRAST_RE =
  /\b(?:whereas|while|but|rather than|instead|unlike|other options?|closest distractor|fails?|does not|do not)\b/i;
const BOUNDED_ANSWER_RE =
  /\b(?:limit(?:ation)?|boundary|trade-?off|alternative|additional evidence|does not prove|not a broader|cannot establish|competing interpretation)\b/i;
const GENERIC_MATERIALS_RE =
  /^(?:the\s+)?(?:scenario|case|lesson|course|source)?\s*(?:evidence|materials?|example|data|text|artifact)s?\.?$/i;

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

export function parseSavedCourseGraph(project) {
  const raw = project?.courseGraphJson ?? project;
  if (typeof raw === 'string') return JSON.parse(raw);
  if (raw && typeof raw === 'object') return raw;
  throw new Error('Expected a saved project with courseGraphJson or a CourseGraph object.');
}

export function isDecisionReadyScenario(scenario = {}) {
  const setup = text(scenario.setup || scenario.su);
  const materials = text(scenario.materials || scenario.ma);
  const evidenceShape = /\d|["“”]|[,;:]|\b(?:observ|record|report|result|quote|note|show|find|data)\w*\b/i.test(setup);
  return (
    words(setup) >= 20 && DECISION_CONSTRAINT_RE.test(setup) && evidenceShape && isConcreteScenarioMaterials(materials)
  );
}

export function isConcreteScenarioMaterials(value) {
  const materialText = text(value);
  return words(materialText) >= 4 && !GENERIC_MATERIALS_RE.test(materialText);
}

function lessonRows(graph) {
  const lessonContent = graph?.enrichmentOverlay?.lessonContent || {};
  return Object.entries(lessonContent).map(([lessonId, content]) => {
    const items = Array.isArray(content?.quizItems) ? content.quizItems : [];
    return {
      lessonId,
      scenario: content?.kernel?.scenario || {},
      multipleChoice: items.filter((item) => item?.type === 'multiple_choice'),
      shortAnswers: items.filter((item) => item?.type === 'short_answer'),
    };
  });
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
  const scenarios = lessons
    .map((lesson) => lesson.scenario)
    .filter((scenario) => text(scenario?.setup || scenario?.su));

  const applied = multipleChoice.filter((item) => isAppliedQuizStem(item.question));
  const unsupported = multipleChoice.filter((item) =>
    lintItemAdmission(item).some((issue) => issue.startsWith('unsupported-')),
  );
  const contrastiveRationales = multipleChoice.filter((item) => RATIONALE_CONTRAST_RE.test(text(item.explanation)));
  const decisionReady = scenarios.filter(isDecisionReadyScenario);
  const concreteMaterials = scenarios.filter((scenario) =>
    isConcreteScenarioMaterials(scenario.materials || scenario.ma),
  );
  const cueFree = shortAnswers.filter((item) => !isConceptCuedCompilerShortAnswer(item.question));
  const claimEvidenceBoundary = shortAnswers.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question));
  const boundedAnswers = shortAnswers.filter((item) => BOUNDED_ANSWER_RE.test(text(item.answer)));

  return {
    label,
    totals: { lessons: lessons.length, multipleChoice: multipleChoice.length, shortAnswers: shortAnswers.length },
    metrics: {
      appliedMultipleChoice: metric(applied.length, multipleChoice.length),
      supportedMultipleChoice: metric(multipleChoice.length - unsupported.length, multipleChoice.length),
      contrastiveRationales: metric(contrastiveRationales.length, multipleChoice.length),
      decisionReadyScenarios: metric(decisionReady.length, scenarios.length),
      concreteScenarioMaterials: metric(concreteMaterials.length, scenarios.length),
      cueFreeShortAnswers: metric(cueFree.length, shortAnswers.length),
      claimEvidenceBoundaryShortAnswers: metric(claimEvidenceBoundary.length, shortAnswers.length),
      boundedModelAnswers: metric(boundedAnswers.length, shortAnswers.length),
      averageScenarioWords: {
        value:
          scenarios.length > 0
            ? Number(
                (
                  scenarios.reduce((sum, scenario) => sum + words(scenario.setup || scenario.su), 0) / scenarios.length
                ).toFixed(1),
              )
            : 0,
      },
    },
    examples: {
      decisionReadyScenario: text(decisionReady[0]?.setup || decisionReady[0]?.su),
      weakScenario: text(scenarios.find((scenario) => !isDecisionReadyScenario(scenario))?.setup),
      conceptCuedShortAnswer: text(
        shortAnswers.find((item) => isConceptCuedCompilerShortAnswer(item.question))?.question,
      ),
      claimEvidenceBoundaryShortAnswer: text(
        shortAnswers.find((item) => isClaimEvidenceBoundaryShortAnswer(item.question))?.question,
      ),
    },
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
    learning: { learn, preserve, shared },
    claimBoundary:
      'This paired diagnostic identifies authoring patterns worth testing. One course pair is directional evidence, not proof of general model superiority.',
  };
}

export const quizContrastDimensions = COMPARISON_DIMENSIONS;

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
