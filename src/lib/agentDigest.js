/**
 * agentDigest.js — the TA's post-generation eyes (v0.9.2).
 *
 * After a package lands, build at most three grounded observations from
 * deterministic signals the workspace already computes: content-quality
 * findings, Bloom's distribution, and objective→assessment coverage.
 * Observations are quiet chips — each one carries why it matters and
 * follow-up prompts; nothing is ever auto-applied.
 */

import { auditDeliverableContentQuality, auditSubstance } from './contentQualityChecks';
import { buildCourseContentIndex, searchCourseContent } from './courseContentIndex';
import { getArrayKey } from './syncDependencies';

const LOWER_BLOOMS = new Set(['remember', 'understand']);
const MAX_OBSERVATIONS = 3;
const OBJECTIVE_ECHO_STOP_WORDS = new Set([
  'an',
  'and',
  'able',
  'about',
  'after',
  'are',
  'as',
  'at',
  'before',
  'by',
  'course',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'lesson',
  'student',
  'students',
  'the',
  'their',
  'through',
  'to',
  'using',
  'via',
  'with',
]);

function objectiveEchoStem(value) {
  return (
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      // Preserve short names/acronyms (Li Bai, Du Fu, UX, AI). The previous
      // four-character floor reduced "Compare Li Bai and Du Fu" to the lone
      // generic verb "compare," so even an explicitly comparative assessment
      // triggered a false coverage warning.
      .filter((token) => token.length >= 2 && !OBJECTIVE_ECHO_STOP_WORDS.has(token))
      .map((token) =>
        token
          .replace(/ies$/, 'y')
          .replace(/(?:ing|ers?|ed|ly)$/, '')
          .replace(/s$/, ''),
      )
      .filter((token) => token.length >= 2)
  );
}

// Exact sentence search is intentionally the first signal, but objectives
// and assessments often express the same act with different morphology:
// "Count intervals inclusively" versus "inclusive letter-name counting."
// A lesson-local stem overlap prevents that harmless rewrite from becoming a
// false Agent warning while still requiring at least two substantive ideas.
function hasLessonAssessmentEcho(objectiveText, deliverables, assessedFeatures, lessonIndex) {
  const objectiveTokens = [...new Set(objectiveEchoStem(objectiveText))];
  if (objectiveTokens.length < 2) return false;
  const required = Math.max(2, Math.ceil(objectiveTokens.length * 0.6));
  return assessedFeatures.some((featureId) => {
    const items = firstArrayKeyItems(featureId, deliverables?.[featureId]);
    const lessonItem = items[lessonIndex];
    if (!lessonItem) return false;
    const assessmentTokens = new Set(objectiveEchoStem(JSON.stringify(lessonItem)));
    const overlap = objectiveTokens.filter((token) => assessmentTokens.has(token)).length;
    return overlap >= required;
  });
}

function firstArrayKeyItems(featureId, entry) {
  if (!entry?.data) return [];
  const arrKey = getArrayKey(featureId, entry.data);
  const arr = arrKey ? entry.data[arrKey] : null;
  return Array.isArray(arr) ? arr : [];
}

// CCR D2.1/D3.1: assessments should test the discipline, not the course's
// own process. Highest-priority observation because instructors judge
// credibility on exactly these surfaces.
function observeSubstance(deliverables, observations) {
  for (const featureId of ['quizBank', 'studyGuides']) {
    if (observations.length >= MAX_OBSERVATIONS) return;
    const entry = deliverables?.[featureId];
    if (entry?.status !== 'done') continue;
    const result = auditSubstance(featureId, entry.data);
    if (!result || result.metaShare < 0.5) continue;
    const surfaceLabel = featureId === 'quizBank' ? 'quiz questions and options' : 'key terms';
    observations.push({
      id: `substance-${featureId}`,
      observation: `${Math.round(result.metaShare * 100)}% of ${surfaceLabel} talk about the course process ("evidence moves", weekly artifacts) rather than the subject itself.`,
      whyItMatters:
        'Students can answer these without knowing the discipline — the gradebook would measure compliance, not learning.',
      anchor: { featureId, itemIndex: 0 },
      prompts: [
        {
          label: 'Show me',
          prompt: `Quote three ${surfaceLabel} from ${featureId} that test course process instead of subject knowledge, and contrast each with what a discipline-focused version would ask.`,
        },
        {
          label: 'Rewrite options',
          prompt: `Propose discipline-focused replacements for the most process-heavy ${surfaceLabel} in ${featureId}, as reviewable options.`,
        },
      ],
    });
  }
}

function observeContentQuality(deliverables, observations) {
  for (const [featureId, entry] of Object.entries(deliverables || {})) {
    if (entry?.status !== 'done' || observations.length >= MAX_OBSERVATIONS) continue;
    const { findings } = auditDeliverableContentQuality(featureId, entry.data);
    if (findings.length === 0) continue;
    const codes = [...new Set(findings.map((finding) => finding.code))];
    observations.push({
      id: `content-${featureId}`,
      observation: `${findings.length} content-quality finding(s) in ${featureId}: ${codes.join(', ')}.`,
      whyItMatters: 'These are the same checks export verification runs — instructors will see them as warnings.',
      anchor: { featureId, itemIndex: 0 },
      prompts: [
        {
          label: 'Explain',
          prompt: `Explain the content-quality findings in ${featureId} and what you would change. Quote the affected text.`,
        },
        {
          label: 'Propose fixes',
          prompt: `Propose fixes for the content-quality findings in ${featureId} as reviewable options.`,
        },
      ],
    });
  }
}

function observeBloomsDistribution(deliverables, observations) {
  if (observations.length >= MAX_OBSERVATIONS) return;
  const quizzes = firstArrayKeyItems('quizBank', deliverables?.quizBank);
  const flatLessons = [];
  quizzes.forEach((quiz, index) => {
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : Array.isArray(quiz?.qs) ? quiz.qs : [];
    if (questions.length === 0) return;
    const lower = questions.filter((question) =>
      LOWER_BLOOMS.has(String(question?.bloomsLevel || question?.bl || '').toLowerCase()),
    ).length;
    if (lower === questions.length) flatLessons.push(index + 1);
  });
  if (flatLessons.length === 0) return;
  observations.push({
    id: 'blooms-flat',
    observation: `Quiz${flatLessons.length > 1 ? 'zes' : ''} for lesson${flatLessons.length > 1 ? 's' : ''} ${flatLessons.join(', ')} sit${flatLessons.length > 1 ? '' : 's'} entirely at Remember/Understand level.`,
    whyItMatters: 'Students can pass these without ever applying the concepts the lesson objectives promise.',
    anchor: { featureId: 'quizBank', itemIndex: flatLessons[0] - 1 },
    prompts: [
      {
        label: 'Review with me',
        prompt: `Review the Lesson ${flatLessons[0]} quiz's cognitive levels. Quote the questions and suggest where to raise the Bloom's level.`,
      },
      {
        label: 'Propose harder items',
        prompt: `Propose 2 higher-Bloom's replacement questions for the Lesson ${flatLessons[0]} quiz as options.`,
      },
    ],
  });
}

function observeObjectiveCoverage(courseMap, deliverables, observations) {
  if (observations.length >= MAX_OBSERVATIONS) return;
  const assessedFeatures = ['quizBank', 'rubrics', 'assignments'].filter(
    (featureId) => deliverables?.[featureId]?.status === 'done',
  );
  if (assessedFeatures.length === 0) return;
  const index = buildCourseContentIndex({ courseMap, deliverables });
  const uncovered = [];
  (courseMap?.lessons || []).forEach((lesson, lessonIndex) => {
    const objectiveText = String(lesson?.sections?.[0]?.learningObjectives || '')
      .split(/\n|;/)[0]
      .trim();
    if (objectiveText.length < 12 || uncovered.length >= 2) return;
    const hits = searchCourseContent(index, objectiveText, { limit: 6 }).filter(
      (hit) => assessedFeatures.includes(hit.anchor.featureId) && hit.anchor.itemIndex === lessonIndex,
    );
    if (hits.length === 0 && !hasLessonAssessmentEcho(objectiveText, deliverables, assessedFeatures, lessonIndex)) {
      uncovered.push({ lessonNumber: lessonIndex + 1, objectiveText });
    }
  });
  if (uncovered.length === 0) return;
  const first = uncovered[0];
  observations.push({
    id: `coverage-l${first.lessonNumber}`,
    observation: `Lesson ${first.lessonNumber}'s first objective ("${first.objectiveText.slice(0, 70)}…") has no clear echo in its assessments.`,
    whyItMatters: 'An objective nothing assesses is a promise the gradebook never checks.',
    anchor: { featureId: 'quizBank', itemIndex: first.lessonNumber - 1 },
    prompts: [
      {
        label: 'Trace it',
        prompt: `Trace Lesson ${first.lessonNumber}'s first objective through the quiz, rubric, and assignment. Where does the chain break?`,
      },
      {
        label: 'Propose coverage',
        prompt: `Propose assessment items that would cover Lesson ${first.lessonNumber}'s first objective, as options.`,
      },
    ],
  });
}

/**
 * Build the digest: up to three observations, or null when the package looks
 * clean (silence is a feature — no chip spam after every generation).
 */
export function buildPostGenerationDigest({ courseMap, deliverables } = {}) {
  const observations = [];
  try {
    observeSubstance(deliverables, observations);
    observeContentQuality(deliverables, observations);
    observeBloomsDistribution(deliverables, observations);
    observeObjectiveCoverage(courseMap, deliverables, observations);
  } catch {
    // Digest is best-effort; a failed signal never blocks the workspace.
  }
  if (observations.length === 0) return null;
  return {
    builtAt: Date.now(),
    observations: observations.slice(0, MAX_OBSERVATIONS),
  };
}
