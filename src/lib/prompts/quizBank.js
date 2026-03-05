import { condenseCourseMap } from './promptUtils.js';

export default {
    system: `You are an expert in educational assessment, test design, and item-writing best practices for higher education (following NBME and university testing center guidelines). Your questions are used in university exams and must be valid, reliable, and pedagogically sound. Every question includes full metadata and answer rationales. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate a comprehensive, university-standard quiz bank for each lesson in this course:

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
          "ex": "string — MC: 'The correct answer is [X] because [reason]'; short_answer: full model response + 2 alternative acceptable phrasings (omit for essay)",
          "rh": "string — ESSAY ONLY: 3-4 criteria that a strong response must include (omit for MC/short_answer)",
          "sa": "string — short_answer & essay ONLY: full exemplary response (omit for MC)"
        }
      ],
      "tg": ["string — 5-8 keywords for LMS discoverability: include assessment type, Bloom's levels tested, and key topic areas"]
    }
  ]
}

- 5–7 questions per lesson: at least 3 multiple choice, 1–2 short answer, 1 essay
- Questions must span at least 3 different Bloom's levels per lesson
- BLOOM'S BALANCE (CRITICAL): Every lesson MUST include at least 1 question at Evaluate or Create level. Do not cluster all questions at Apply/Analyze. Distribute levels so that across 6 questions you have roughly: 1 Remember/Understand, 2 Apply, 1-2 Analyze, 1 Evaluate, and 1 Create.
- MC stems must be complete sentences or scenarios — NO fill-in-the-blank fragments
- MC has exactly 4 options (A–D); avoid "All of the above" and "None of the above"
- All 4 MC options must be similar in length (avoid "longest option is correct" cueing)
- Distractors MUST represent common student misconceptions (not absurd wrong answers)
- Short answer questions must specify expected length (e.g., "In 2-3 sentences")
- Essay prompts must include: task verb + scope + constraints
- All questions must have objectiveAligned field populated
- MANDATORY FIELDS (STRICTLY ENFORCED): Every MC question MUST have a non-null "explanation" field starting with "The correct answer is [letter] because...". Every MC question MUST have a non-null "distractorRationale" field explaining why each wrong option is plausible, formatted as "A: [reason]; C: [reason]; D: [reason]". Do NOT omit these fields for any question — they are required for accreditation.
- QM ALIGNMENT: Include a variety of question types across the course that are sequenced from lower to higher Bloom's levels as the course progresses (QM 3.4). Questions should help students track their learning progress — include diagnostic questions that help learners identify areas needing review (QM 3.5). Each quiz must include a formativeFeedbackNote for the instructor on common errors and how to provide timely feedback (QM 3.5).
- HUMAN READABILITY: Vary question phrasing across lessons — do not use the same stem patterns repeatedly. Questions should feel hand-crafted, not template-generated. Each explanation should be written in clear, natural prose.
- Return ONLY the JSON object, no prose, no markdown`,
  }
