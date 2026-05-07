import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are an expert in educational assessment and analytic rubric design for higher education. Your rubrics follow best practices from Walvoord & Anderson and meet Quality Matters (QM) Higher Education Rubric standards. Rubrics must provide specific and descriptive criteria whose connection to the course grading policy is clearly explained (QM 3.3). Each criterion uses observable, behavioral language with concrete quantity/quality markers. Rubrics are distributed to students before the assignment and are aligned to course learning objectives. Return ONLY valid JSON, no markdown fences.`,

  user: (
    cm,
    scope,
    verifiedChanges,
    columns,
  ) => `Generate professional, university-standard analytic grading rubrics for the assessments in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.

Return a JSON object with exactly this structure:
{
  "rubrics": [
    {
      "t": "string — assignment/assessment name this rubric grades",
      "lt": "string — the lesson this rubric is associated with",
      "at": "string — e.g. 'Written Essay' | 'Research Paper' | 'Lab Report' | 'Oral Presentation' | 'Group Project' | 'Reflection' | 'Problem Set'",
      "tp": number — integer matching the assignment's gradebook weight,
      "bl": "string — highest Bloom's level assessed by this rubric",
      "gs": {
        "ex": "string — point range or percentage, e.g. '90–100%'",
        "pr": "string — e.g. '75–89%'",
        "dv": "string — e.g. '60–74%'",
        "bg": "string — e.g. 'Below 60%'"
      },
      "cr": [
        {
          "cn": "string — specific, measurable dimension being assessed",
          "oa": "string — which course learning objective this criterion maps to",
          "wt": number — percentage weight (all criteria must sum to 100),
          "pt": number — max points for this criterion (weight/100 × totalPoints),
          "ex": "string — observable, behavioral description with concrete quality/quantity markers. What mastery looks like ABOVE the minimum standard. MUST end with ' e.g., [concrete 1-sentence example of student work at this level].'",
          "pr": "string — meets the standard. Concrete descriptors. No vague words like 'good' or 'adequate'. MUST end with ' e.g., [concrete 1-sentence example of student work at this level].'",
          "dv": "string — partially meets standard. Describes what IS present, not just what is missing. MUST end with ' e.g., [concrete 1-sentence example of student work at this level].'",
          "bg": "string — does not yet meet standard. Still describes what the student has attempted, not purely negative. MUST end with ' e.g., [concrete 1-sentence example of student work at this level].'"
        }
      ],
      "gp": "string — how this rubric connects to the overall course grading policy: state the weight of this assessment in the final grade and which grading category it falls under (QM 3.3)",
      "tn": "string — instructions for calibrating scores, handling edge cases, giving feedback to students, and a note to distribute this rubric to students BEFORE the assignment (QM 3.3)",
      "tg": ["string — 5-8 keywords for LMS discoverability: include assessment type, skill area, and Bloom's levels"]
    }
  ]
}

REQUIREMENTS:
- Create one rubric per unique assessment type found in the course map
- 4–6 criteria per rubric
- Criterion weights must sum to exactly 100
- ALL cell descriptions must use third-person, present-tense observable language (e.g., "The student provides..." or declarative "Argument is supported by 4+ peer-reviewed sources")
- NO vague qualifiers: never use "good," "adequate," "somewhat," "fairly" alone — always qualify with a concrete indicator
- Exemplary cell describes mastery BEYOND minimum — what an exceptional response looks like
- Beginning cell describes what the student attempted, using constructive language
- gradingScale should reflect the institution's typical grading thresholds
- QM ALIGNMENT: Each rubric must include gradePolicyConnection explaining how it connects to the course grading policy and the weight of this assessment in the final grade (QM 3.3). teacherNotes must include a reminder to distribute the rubric to students BEFORE the assignment (QM 3.3). Include guidance for students on how to uphold academic integrity for this assessment type (QM 3.6).
- HUMAN READABILITY: Vary wording across rubric cells — do not use identical sentence patterns for every criterion level. Each cell should sound distinct and specific to that criterion.
- RUBRIC COUNT: Generate exactly ONE rubric per unique, explicitly named assessment found in the course map. Do not create rubrics for implicit activities (class participation, attendance) or assessments that are not clearly defined as graded assignments. Your rubric count should match the number of distinct graded assignments in the course.
- Return ONLY the JSON object, no prose, no markdown`,
};
