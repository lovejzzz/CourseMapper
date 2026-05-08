import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are an expert in educational assessment, test design, and item-writing best practices for higher education (following NBME and university testing center guidelines). Your questions are used in university exams and must be valid, reliable, and pedagogically sound. Every question includes full metadata and answer rationales. Return ONLY valid JSON, no markdown fences.`,

  user: (
    cm,
    scope,
    verifiedChanges,
    columns,
  ) => `Generate a comprehensive, university-standard quiz bank for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.
IMPORTANT: Omit fields that do not apply to a question type — do NOT output null values. Only include fields relevant to each question's type (MC, short_answer, or essay).

Return a JSON object with exactly this structure:
{
  "quizzes": [
    {
      "lt": "string — full lesson title",
      "tq": number — integer count,
      "bc": ["string"] — Bloom's levels covered in this quiz set,
      "fn": "string — guidance for the instructor: common errors students make on this material, how to return results quickly, and how students should use quiz results to identify areas needing review (QM 3.5)",
      "qs": [
        {
          "ty": "string — MUST be one of: 'multiple_choice' | 'short_answer' | 'essay'",
          "bl": "string — exact Bloom's level: 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create'",
          "df": "string — 'Easy' | 'Medium' | 'Hard'",
          "em": number — integer time to answer,
          "pt": number — integer point value,
          "oa": "string — which lesson learning objective this question assesses",
          "q": "string — for MC: complete interrogative sentence or scenario stem; for short answer: includes expected length ('In 2-3 sentences...'); for essay: includes task verb (analyze/evaluate/argue), scope, and constraints",
          "op": ["string"] — MC ONLY: exactly 4 options as 'A. ...', 'B. ...', 'C. ...', 'D. ...' (omit for short_answer/essay),
          "an": "string — MC: the letter only (e.g. 'B'); short_answer: model answer with key required elements (omit for essay)",
          "dr": "string — MC ONLY: explain why each wrong option is plausible, format: 'A: [reason]; C: [reason]; D: [reason]' (omit for short_answer/essay)",
          "ex": "string — REQUIRED for every question. MC: 'The correct answer is [X] because [reason]'; short_answer: full model response + 2 alternative acceptable phrasings; essay: concise instructor scoring note that explains what a strong response must do.",
          "rh": "string — ESSAY ONLY: 3-4 criteria that a strong response must include (omit for MC/short_answer)",
          "sa": "string — short_answer & essay ONLY: full exemplary response (omit for MC)"
        }
      ],
      "tg": ["string — 5-8 keywords for LMS discoverability: include assessment type, Bloom's levels tested, and key topic areas"]
    }
  ]
}

Rules:
- 5–7 questions/lesson: ≥3 MC, 1–2 short_answer, 1 essay. Span ≥3 Bloom's levels per lesson.
- BLOOM'S BALANCE (CRITICAL): at least 1 Evaluate or Create question per lesson. Don't cluster at Apply/Analyze. Across 6 questions aim for ~1 Remember/Understand, 2 Apply, 1-2 Analyze, 1 Evaluate, 1 Create.
- MC: complete-sentence or scenario stems (no fill-in-the-blank); exactly 4 options; similar-length options; no "All/None of the above"; distractors reflect common student misconceptions (not absurd wrong answers).
- short_answer: specify expected length (e.g., "In 2-3 sentences…").
- essay: include task verb + scope + constraints.
- ty must be exactly multiple_choice, short_answer, or essay. df must be exactly Easy, Medium, or Hard. em is minutes, never seconds: use 1-3 for multiple_choice, 3-6 for short_answer, and 8-15 for essay.
- Every question has oa (objectiveAligned) and ex (explanation). Every MC has non-null ex (starting "The correct answer is [letter] because…") and dr ("A: …; C: …; D: …") — required for accreditation.
- Sequence from lower to higher Bloom's as the course progresses (QM 3.4). Include diagnostic questions that help learners identify review areas (QM 3.5). Each quiz includes fn guidance on common errors and timely feedback (QM 3.5).
- Vary phrasing across lessons — no repeated stem patterns. Explanations in natural prose.
- Return ONLY the JSON object, no prose, no markdown.`,
};
