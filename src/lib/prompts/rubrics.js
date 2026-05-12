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
      "td": "string — student-facing task directions summary: what students submit, required evidence, and what success looks like before the table",
      "ifn": "string — instructor-facing facilitation note: how to introduce the rubric, calibrate scoring, handle borderline submissions, and return actionable feedback",
      "udl": "string — accessibility and UDL guidance specific to this assessment type, including acceptable format accommodations without lowering criteria",
      "ax": [
        "string — anchor example tied to one criterion: describe concrete evidence of exemplary/proficient/developing work without writing a full sample paper"
      ],
      "tg": ["string — 5-8 keywords for LMS discoverability: include assessment type, skill area, and Bloom's levels"]
    }
  ]
}

REQUIREMENTS:
- Create one rubric for every lesson in the requested scope that contains a clearly graded assessment. If a lesson has multiple explicitly named graded assessments, create one rubric for each distinct assessment.
- The "lt" value must include the exact lesson number/title from the course map, such as "Lesson 8: Data Analysis Workshop". Never omit late-course lessons just because an earlier assessment type already appeared.
- 4–6 criteria per rubric
- Criterion weights must sum to exactly 100
- ALL cell descriptions must use third-person, present-tense observable language (e.g., "The student provides..." or declarative "Argument is supported by 4+ peer-reviewed sources")
- NO vague qualifiers: never use "good," "adequate," "somewhat," "fairly" alone — always qualify with a concrete indicator
- Exemplary cell describes mastery BEYOND minimum — what an exceptional response looks like
- Beginning cell describes what the student attempted, using constructive language
- gradingScale should reflect the institution's typical grading thresholds
- QM ALIGNMENT: Each rubric must include gradePolicyConnection explaining how it connects to the course grading policy and the weight of this assessment in the final grade (QM 3.3). teacherNotes must include a reminder to distribute the rubric to students BEFORE the assignment (QM 3.3). Include guidance for students on how to uphold academic integrity for this assessment type (QM 3.6).
- READY-TO-USE SUPPORT: Include taskDirections, instructorFacilitationNote, accessibilityAndUDL, and 2-4 anchorExamples. These must be specific to the assessment, not generic policy text.
- ASSESSMENT AUTHENTICITY: Use assessment titles and task contexts from weeklyAssessments. Do not impose a repeated portfolio, grant, client, or community-service label across every rubric unless the course map explicitly names that portfolio. If a course-wide project exists, name it once in gradingPolicyConnection and keep each rubric focused on the specific method, data type, evidence, or decision from that lesson.
- METHOD-SPECIFIC CRITERIA: Each rubric must include criteria that name the exact methodological work students perform in that lesson, such as construct wording, sampling frame, recruitment risk, survey item validity, codebook evidence, test-selection assumptions, integration logic, consent clarity, or evidence-quality judgment. Avoid reusable criteria that could fit any lesson.
- HUMAN READABILITY: Vary wording across rubric cells — do not use identical sentence patterns for every criterion level. Each cell should sound distinct and specific to that criterion.
- RUBRIC COUNT: For the requested scope, cover every explicit graded assessment in weeklyAssessments. Do not create rubrics for ungraded implicit activities (attendance, optional participation, informal checks), but do create coverage for quizzes, exams, papers, projects, presentations, reports, portfolios, and graded reflections/problem sets when they appear in a lesson.
- Return ONLY the JSON object, no prose, no markdown`,
};
