/**
 * deliverableQualityScorer.js
 *
 * Feature 6.3 — Deliverable Quality Scores
 *
 * After each deliverable is generated, inspect four inexpensive content signals.
 * These are keyword/structure proxies, not a quality score, validation study, or
 * Quality Matters review. The legacy `qmAlignment` field name is retained only
 * so saved projects and downstream fixtures remain readable.
 *
 * Returns { bloomsAlignment, specificity, actionability, qmAlignment, tips }
 *
 * Uses a lightweight heuristic scoring approach to avoid an extra AI call,
 * falling back to an AI scoring call when a stream provider is available.
 */

import { renderedDeliverableCollection } from './renderedDeliverableRoot.js';

export const QUALITY_SCORER_SYSTEM_PROMPT = `You are an instructional-design diagnostic assistant inspecting a small sample of a course deliverable. Report provisional content signals on four dimensions, each 0-10. Do not claim that this is a full quality, factual-accuracy, accessibility, teachability, or Quality Matters review. Return ONLY valid JSON with no explanation or markdown:
{
  "bloomsAlignment": number,
  "specificity": number,
  "actionability": number,
  "qmAlignment": number,
  "tips": ["tip1", "tip2", "tip3"]
}
Scoring rubric:
- bloomsAlignment (0-10): Do the activities/assessments target appropriate Bloom's cognitive levels? 10 = well-distributed, aligned to objectives. 0 = all at recall level with no higher-order.
- specificity (0-10): Are items concrete with clear parameters? 10 = measurable, time-bound, precise. 0 = vague, generic, cookie-cutter.
- actionability (0-10): Can an instructor use this without modification? 10 = ready-to-use. 0 = needs major rework.
- qmAlignment (legacy field name, 0-10): Are course-design markers visible in this sample, such as objective links, varied learning methods, interaction, and learner-support language? This is not a Quality Matters judgment and must not be labeled as one.
Provide 3 brief, actionable improvement tips (max 15 words each).`;

/**
 * Build a condensed snapshot of a deliverable for scoring.
 * Keeps the prompt small (under ~800 chars).
 */
export function buildQualityScorePrompt(featureId, data) {
  const MAX_CHARS = 800;
  let sample = '';

  try {
    // Extract a representative sample from the deliverable data
    switch (featureId) {
      case 'lessonPlans': {
        const plans = renderedDeliverableCollection('lessonPlans', data);
        const plan = plans[0]?.tiers?.standard || plans[0] || {};
        sample = `LESSON PLAN SAMPLE:\nObjectives: ${(plan.learningObjectives || []).slice(0, 3).join('; ')}\nActivities: ${(plan.activities || []).slice(0, 3).join('; ')}\nAssessment: ${plan.assessment || ''}`;
        break;
      }
      case 'rubrics': {
        const rubrics = data.rubrics || [];
        const rub = rubrics[0] || {};
        sample = `RUBRIC SAMPLE:\nTitle: ${rub.title || ''}\nCriteria: ${(rub.criteria || [])
          .slice(0, 4)
          .map((c) => `${c.name} (${c.weight}%)`)
          .join(', ')}`;
        break;
      }
      case 'quizBank': {
        const quizzes = renderedDeliverableCollection('quizBank', data);
        const lesson = quizzes[0] || {};
        const qs = (lesson.tiers?.standard || lesson.questions || []).slice(0, 3);
        sample = `QUIZ SAMPLE:\n${qs.map((q) => `Q: ${q.question?.slice(0, 80) || ''}`).join('\n')}`;
        break;
      }
      case 'assignments': {
        const asgns = data.assignments || [];
        const asgn = (asgns[0]?.tiers?.standard || asgns[0]?.assignments || [asgns[0]])[0] || {};
        sample = `ASSIGNMENT SAMPLE:\nTitle: ${asgn.title || ''}\nDescription: ${(asgn.description || '').slice(0, 150)}\nCriteria: ${(asgn.gradingCriteria || []).slice(0, 3).join('; ')}`;
        break;
      }
      case 'discussions': {
        const discs = data.discussions || [];
        const disc = (discs[0]?.tiers?.standard || discs[0]?.prompts || [discs[0]])[0] || {};
        sample = `DISCUSSION SAMPLE:\nPrompt: ${(disc.prompt || disc.question || '').slice(0, 150)}`;
        break;
      }
      default: {
        // Generic: just stringify the first ~400 chars
        sample = JSON.stringify(data).slice(0, 400);
      }
    }
  } catch {
    sample = JSON.stringify(data).slice(0, 400);
  }

  return `Evaluate this ${featureId} deliverable:\n\n${sample.slice(0, MAX_CHARS)}`;
}

/**
 * Heuristic fallback scorer — estimates quality without an AI call.
 * Returns a rough score based on content structure inspection.
 *
 * @param {string} featureId
 * @param {object} data
 * @returns {{ bloomsAlignment: number, specificity: number, actionability: number, tips: string[] }}
 */
export function scoreHeuristic(featureId, data) {
  let bloomsAlignment = 6;
  let specificity = 5;
  let actionability = 6;
  let qmAlignment = 5;
  const tips = [];

  try {
    const dataStr = JSON.stringify(data);
    const lowerDataStr = dataStr.toLowerCase();
    const charCount = dataStr.length;
    const countMatches = (regex) => (dataStr.match(regex) || []).length;
    const hasAll = (terms) => terms.every((term) => lowerDataStr.includes(term));
    const hasAny = (terms) => terms.some((term) => lowerDataStr.includes(term));

    // More content = more specific
    if (charCount > 5000) specificity = 8;
    else if (charCount > 2000) specificity = 6;
    else {
      specificity = 4;
      tips.push('Add more detail to each item for better specificity.');
    }

    // Check for Bloom's keywords
    const bloomsKeywords = /analyze|evaluate|create|synthesize|apply|demonstrate|design|critique|assess/gi;
    const bloomsCount = countMatches(bloomsKeywords);
    if (bloomsCount >= 10) bloomsAlignment = 8;
    else if (bloomsCount >= 5) bloomsAlignment = 6;
    else {
      bloomsAlignment = 4;
      tips.push("Add higher-order Bloom's activities (Analyze, Evaluate, Create).");
    }

    // Check for actionable markers
    const actionable = /rubric|criteria|points|minutes|words|pages|step|example|template/gi;
    const actionCount = countMatches(actionable);
    if (actionCount >= 10) actionability = 8;
    else if (actionCount >= 5) actionability = 6;
    else {
      actionability = 4;
      tips.push('Add specific time estimates, word counts, or point values.');
    }

    // Course-design marker check. The qmAlignment identifier is legacy storage compatibility;
    // keyword presence cannot establish Quality Matters conformance or accessibility.
    const alignmentMarkers = /objective|aligned|measurable|learner.centered|learning outcome/gi;
    const varietyMarkers = /variety|multiple|diverse|different types/gi;
    const supportMarkers = /support|help|office hours|tutoring|accommodat|accessib/gi;
    const interactionMarkers = /interact|collaborat|discuss|peer|group|active learning/gi;
    const alignCount = countMatches(alignmentMarkers);
    const varietyCount = countMatches(varietyMarkers);
    const supportCount = countMatches(supportMarkers);
    const interactionCount = countMatches(interactionMarkers);
    const qmTotal = alignCount + varietyCount + supportCount + interactionCount;
    if (qmTotal >= 15) qmAlignment = 8;
    else if (qmTotal >= 8) qmAlignment = 6;
    else {
      qmAlignment = 4;
      tips.push('Strengthen objective alignment, learner support, and interaction.');
    }

    const progressionMarkers = countMatches(
      /retrieval|retrieve|spaced practice|transfer|metacognitive|cumulative|practice|revision|feedback/gi,
    );
    const evidenceMarkers = countMatches(
      /evidence|source|criterion|criteria|success criteria|artifact|assessment|rubric|calibration|bias check|target construct/gi,
    );
    const readinessMarkers = countMatches(
      /minutes|step|checklist|example|template|review|revise|share|score|feedback|support|extension|diagnostic/gi,
    );
    const trustMarkers = countMatches(
      /accessib|accommodation|participation|learner context|source integrity|do not invent|local review|publish boundary|human review/gi,
    );
    const hasAQualityTrace = hasAll(['evidence', 'feedback', 'revision', 'transfer']) && hasAny(['rubric', 'criteria']);
    const hasTrustTrace =
      hasAny(['source integrity', 'do not invent', 'local review']) &&
      hasAny(['accessibility', 'accommodation', 'participation']);

    if (bloomsAlignment >= 8 && bloomsCount >= 16 && progressionMarkers >= 8) {
      bloomsAlignment = 9;
    }
    if (specificity >= 8 && charCount > 9000 && evidenceMarkers >= 16 && hasAQualityTrace) {
      specificity = 9;
    }
    if (actionability >= 8 && actionCount >= 16 && readinessMarkers >= 18 && hasAQualityTrace) {
      actionability = 9;
    }
    if (qmAlignment >= 8 && qmTotal >= 18 && trustMarkers >= 8 && hasTrustTrace) {
      qmAlignment = 9;
    }

    if (tips.length === 0) tips.push('Looks good! Consider peer review for final polish.');
  } catch {
    /* noop */
  }

  return {
    bloomsAlignment,
    specificity,
    actionability,
    qmAlignment,
    tips: tips.slice(0, 3),
    evidenceClass: 'deterministic',
    validationTier: 'automated-signal',
    construct: 'surface-content-signals',
    claimBoundary:
      'Keyword and structure proxies only; not factual, source, accessibility, teachability, or rubric validation.',
  };
}

/**
 * Compute average score from quality result.
 */
export function computeAvgScore(quality) {
  if (!quality) return null;
  const { bloomsAlignment = 0, specificity = 0, actionability = 0, qmAlignment = 0 } = quality;
  // Include qmAlignment when present (backward compat: old scores without it still work)
  const hasQm = quality.qmAlignment !== undefined;
  const sum = bloomsAlignment + specificity + actionability + (hasQm ? qmAlignment : 0);
  const count = hasQm ? 4 : 3;
  return Math.round((sum / count) * 10) / 10;
}

/**
 * Get color class for a score.
 */
export function scoreColor(avg) {
  if (avg >= 8) return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (avg >= 6) return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
  return { bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' };
}

export function signalBand(score) {
  if (score >= 8) return { label: 'strong signals', shortLabel: 'Strong' };
  if (score >= 6) return { label: 'mixed signals', shortLabel: 'Mixed' };
  return { label: 'weak signals', shortLabel: 'Weak' };
}
