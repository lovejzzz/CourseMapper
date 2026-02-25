/**
 * deliverableQualityScorer.js
 *
 * Feature 6.3 — Deliverable Quality Scores
 *
 * After each deliverable is generated, evaluate it on 3 dimensions (0-10 each):
 *   - Bloom's Alignment: do activities/assessments match lesson Bloom's level targets?
 *   - Specificity: are items concrete and actionable vs. vague?
 *   - Actionability: can instructors immediately use these without modification?
 *
 * Returns { bloomsAlignment, specificity, actionability, tips }
 *
 * Uses a lightweight heuristic scoring approach to avoid an extra AI call,
 * falling back to an AI scoring call when a stream provider is available.
 */

export const QUALITY_SCORER_SYSTEM_PROMPT = `You are an expert instructional designer evaluating course deliverables. Score the provided deliverable on three dimensions, each 0-10. Return ONLY valid JSON with no explanation or markdown:
{
  "bloomsAlignment": number,
  "specificity": number,
  "actionability": number,
  "tips": ["tip1", "tip2", "tip3"]
}
Scoring rubric:
- bloomsAlignment (0-10): Do the activities/assessments target appropriate Bloom's cognitive levels? 10 = well-distributed, aligned to objectives. 0 = all at recall level with no higher-order.
- specificity (0-10): Are items concrete with clear parameters? 10 = measurable, time-bound, precise. 0 = vague, generic, cookie-cutter.
- actionability (0-10): Can an instructor use this without modification? 10 = ready-to-use. 0 = needs major rework.
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
        const plans = data.lessonPlans || [];
        const plan = plans[0]?.tiers?.standard || plans[0] || {};
        sample = `LESSON PLAN SAMPLE:\nObjectives: ${(plan.learningObjectives || []).slice(0, 3).join('; ')}\nActivities: ${(plan.activities || []).slice(0, 3).join('; ')}\nAssessment: ${plan.assessment || ''}`;
        break;
      }
      case 'rubrics': {
        const rubrics = data.rubrics || [];
        const rub = rubrics[0] || {};
        sample = `RUBRIC SAMPLE:\nTitle: ${rub.title || ''}\nCriteria: ${(rub.criteria || []).slice(0, 4).map(c => `${c.name} (${c.weight}%)`).join(', ')}`;
        break;
      }
      case 'quizBank': {
        const quizzes = data.quizzes || data.quizBank || [];
        const lesson = quizzes[0] || {};
        const qs = (lesson.tiers?.standard || lesson.questions || []).slice(0, 3);
        sample = `QUIZ SAMPLE:\n${qs.map(q => `Q: ${q.question?.slice(0, 80) || ''}`).join('\n')}`;
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
  const tips = [];

  try {
    const dataStr = JSON.stringify(data);
    const charCount = dataStr.length;

    // More content = more specific
    if (charCount > 5000) specificity = 8;
    else if (charCount > 2000) specificity = 6;
    else { specificity = 4; tips.push('Add more detail to each item for better specificity.'); }

    // Check for Bloom's keywords
    const bloomsKeywords = /analyze|evaluate|create|synthesize|apply|demonstrate|design|critique|assess/gi;
    const bloomsCount = (dataStr.match(bloomsKeywords) || []).length;
    if (bloomsCount >= 10) bloomsAlignment = 8;
    else if (bloomsCount >= 5) bloomsAlignment = 6;
    else { bloomsAlignment = 4; tips.push('Add higher-order Bloom\'s activities (Analyze, Evaluate, Create).'); }

    // Check for actionable markers
    const actionable = /rubric|criteria|points|minutes|words|pages|step|example|template/gi;
    const actionCount = (dataStr.match(actionable) || []).length;
    if (actionCount >= 10) actionability = 8;
    else if (actionCount >= 5) actionability = 6;
    else { actionability = 4; tips.push('Add specific time estimates, word counts, or point values.'); }

    if (tips.length === 0) tips.push('Looks good! Consider peer review for final polish.');
  } catch { /* noop */ }

  return { bloomsAlignment, specificity, actionability, tips: tips.slice(0, 3) };
}

/**
 * Compute average score from quality result.
 */
export function computeAvgScore(quality) {
  if (!quality) return null;
  const { bloomsAlignment = 0, specificity = 0, actionability = 0 } = quality;
  return Math.round((bloomsAlignment + specificity + actionability) / 3 * 10) / 10;
}

/**
 * Get color class for a score.
 */
export function scoreColor(avg) {
  if (avg >= 8) return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (avg >= 6) return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
  return { bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' };
}
