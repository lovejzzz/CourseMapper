/**
 * agentDigest.js — the TA's post-generation eyes (v0.9.2).
 *
 * After a package lands, build at most three grounded observations from
 * deterministic signals the workspace already computes: content-quality
 * findings, Bloom's distribution, and objective→assessment coverage.
 * Observations are quiet chips — each one carries why it matters and
 * follow-up prompts; nothing is ever auto-applied.
 */

import { auditDeliverableContentQuality } from './contentQualityChecks';
import { buildCourseContentIndex, searchCourseContent } from './courseContentIndex';
import { getArrayKey } from './syncDependencies';

const LOWER_BLOOMS = new Set(['remember', 'understand']);
const MAX_OBSERVATIONS = 3;

function firstArrayKeyItems(featureId, entry) {
  if (!entry?.data) return [];
  const arrKey = getArrayKey(featureId, entry.data);
  const arr = arrKey ? entry.data[arrKey] : null;
  return Array.isArray(arr) ? arr : [];
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
    if (hits.length === 0) uncovered.push({ lessonNumber: lessonIndex + 1, objectiveText });
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
