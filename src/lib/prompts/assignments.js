import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are an expert instructional designer specializing in university assignment design (Understanding by Design, Constructive Alignment). Every assignment demonstrably traces back to specific learning outcomes through backward design: the assignment measures outcomes, and scaffolding milestones prepare students for the assessment. Your assignment briefs are complete, classroom-ready documents that instructors can distribute directly to students. Every assignment includes learning objective alignment, scaffolding milestones, submission specifications, and an academic integrity statement. Return ONLY valid JSON, no markdown fences.`,

  user: (
    cm,
    scope,
    verifiedChanges,
    columns,
  ) => `Generate university-standard, classroom-ready assignment briefs for this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.

Return a JSON object with exactly this structure:
{
  "courseAssignmentMap": [
    {
      "week": "number — week or first related lesson number",
      "artifact": "string — assignment artifact name",
      "expectedFile": "string — neutral file name students can recognize, e.g. 'week-03-sampling-critique.pdf'",
      "length": "string — concise length/scope",
      "nextPortfolioUse": "string — how this artifact feeds the next assignment or final portfolio"
    }
  ],
  "assignments": [
    {
      "t": "string — assignment name",
      "at": "string — e.g. 'Research Paper' | 'Reflective Essay' | 'Case Study Analysis' | 'Lab Report' | 'Group Project' | 'Oral Presentation' | 'Problem Set' | 'Portfolio'",
      "rl": ["string"] — lesson titles this assignment draws from,
      "dw": "string — e.g. 'Week 5, Friday 11:59 PM'",
      "et": "string — realistic total student time, e.g. '6–8 hours over 2 weeks'",
      "tp": number — integer,
      "pg": "string — e.g. '15%'",
      "bl": "string — primary cognitive level: 'Apply' | 'Analyze' | 'Evaluate' | 'Create'",
      "pc": "string — portfolio connection: how this assignment builds from prior work and feeds future work",
      "esf": "string — expected submission file name or package name",
      "hsc": ["string — 3-4 high-value success criteria specific to this assignment"],
      "ifp": "string — instructor feedback priority: what one or two criteria feedback should emphasize",
      "pb": {
        "exc": "string — excellent performance band with assignment-specific evidence",
        "prof": "string — proficient performance band with assignment-specific evidence",
        "rev": "string — revise performance band naming the missing method decision or evidence trace"
      },
      "ov": "string — 3-4 sentences: what students will do, WHY this assignment matters to their learning and to the field, and which course learning objectives it assesses",
      "ob": [
        "string — specific learning objectives this assignment assesses (verbatim from course objectives if possible)"
      ],
      "ins": [
        "string — numbered, imperative-voice steps: 'Choose a...', 'Write a...', 'Cite at least...'. Each step is a separate string. Be specific about scope, length, format."
      ],
      "fr": {
        "ln": "string — e.g. '1,500–2,000 words' or '10-minute presentation'",
        "fm": "string — e.g. 'Double-spaced, 12pt Times New Roman, 1-inch margins'",
        "cs": "string — e.g. 'APA 7th edition'",
        "sp": "string — e.g. 'Submit as a single PDF to Canvas > Assignments > [title]'",
        "lp": "string — explicit penalty: e.g. '10 points deducted per 24-hour period; no submissions accepted after 1 week'"
      },
      "dl": [
        "string — checklist of every item to submit, e.g. '[ ] Cover page with name and student ID', '[ ] 1,500-2,000 word essay', '[ ] Reference list (minimum 5 peer-reviewed sources)'"
      ],
      "sm": [
        {
          "ms": "string — milestone name, e.g. 'Topic Proposal'",
          "dd": "string — specific due date or week, e.g. 'Week 2, class time' | 'Monday Week 3, 5pm'",
          "de": "string — 1-2 sentences: what the student submits at this milestone (format + length + scope)",
          "fb": "string — feedback channel: 'Instructor written feedback within 5 days' | 'Peer review (2 reviewers)' | 'Self-assessment checklist' | 'Office-hours discussion'",
          "pt": "number — points this milestone contributes toward the assignment total (0 for formative-only)",
          "ul": ["string"] — optional: 1-3 bullet upload/submission checklist so the student can verify readiness before the deadline
        }
      ],
      "gc": "string — brief rubric summary tying point distribution to criteria (full rubric is generated separately)",
      "sr": [
        "string — specific support: writing center, library databases, office hours schedule, sample work description"
      ],
      "pt": "string — how students will receive feedback and track their progress on this assignment: interim feedback points, self-assessment checkpoints, peer review milestones, and expected turnaround time for instructor feedback (QM 3.5)",
      "ai": "string — assignment-specific guidance on how to uphold academic integrity for THIS assignment type: what is/is not permitted (collaboration, AI tools, reuse of prior work), reference to institution policy, and consequences for violation (QM 3.6)",
      "ud": "string — accessibility and UDL guidance specific to this assignment: alternate formats, scaffolded supports, and accommodation-friendly submission options that preserve criteria",
      "sar": [
        "string — student self-assessment criterion phrased as a checklist item tied to this exact assignment"
      ],
      "fl": "string — how feedback from this assignment should feed forward into the next assignment, exam, discussion, or project milestone",
      "tg": ["string — 5-8 keywords for LMS discoverability: include assignment type, skill area, Bloom's level, and related lesson topics"]
    }
  ]
}

REQUIREMENTS:
- Extract 4–7 assignments from the course map's assessments — spanning different types
- Include courseAssignmentMap once at the top level so students and instructors can see the full assignment sequence, expected file, scope, and next portfolio use.
- Every assignment must include portfolioConnection, expectedSubmissionFile, highValueSuccessCriteria, instructorFeedbackPriority, and performanceBands.
- Performance bands must be assignment-specific. Do not reuse generic phrases such as "evidence is specific" without naming the exact evidence, method move, or artifact requirement.
- Expected submission file names must be neutral and final, such as "week-04-instrument-revision-lab.pdf"; do not invent LMS folder names or bracketed placeholders.
- Each assignments[] item must be a complete brief for a specific graded deliverable. Do not output generic "Lesson X Assignment Brief" wrappers, bundled lesson summaries, or lesson-by-lesson task lists.
- Treat the assignments as one connected course portfolio. Reuse a coherent course domain, dataset family, client/project scenario, or explicitly linked set of cases unless the course map itself requires unrelated cases.
- If assignments use more than one scenario, make the shared research-methods throughline explicit in ov and fl so students understand why the cases belong in one course sequence.
- Do not rotate unrelated education, health, policy, community, and technology cases merely for variety; disconnected case tours lower course identity and classroom readiness.
- Output assignments in chronological order by the first lesson/week they relate to. A final project or oral presentation due late in the course must appear near its late-course lesson, not directly after Lesson 1.
- Each assignment must clearly connect to specific lessons and objectives. The "rl" array must contain full lesson titles from the course map, not objective codes such as "1a" or "2b".
- The "ob" array must include the actual objective wording or a concise objective paraphrase, not only labels such as "LO1" or "Objective 2".
- instructions must use numbered, imperative-voice steps (not paragraph prose)
- scaffoldingMilestones: ≥2 milestones for major assignments (≥15% of grade); each milestone must name the feedback channel (fb) and specify points (pt, can be 0 for formative). Include an ul (upload checklist) on the FINAL milestone.
- Keep field meanings stable in every chunk: readings/resources go only in sr, submission mechanics go only in fr, grading summary goes only in gc, and progress checkpoints go only in pt.
- Avoid institution-specific claims unless present in the course map or instructor profile. Do not invent LMS folder paths, office names, support links, tool licenses, or institutional policies.
- deliverables must be a checklist (students can tick off each item before submitting)
- academicIntegrityStatement must be specific to this assignment (not a generic paragraph)
- formatRequirements.latePolicy preserves a supplied late-work policy; if absent, ask learners to confirm the deadline with the instructor. Never invent a point deduction.
- accessibilityAndUDL, selfAssessmentRubric, and feedbackLoop are required. They must be specific to the assignment type and course topic, not repeated boilerplate across briefs.
- selfAssessmentRubric must contain 3-5 checklist items students can use before submission.
- GRADING CRITERIA: Each assignment's gradingCriteria field must include 3-5 concise criteria that summarize how the work will be judged. It may also include a final sentence such as "See Rubric for [Assignment Title] for full grading criteria and point breakdown," but never make the rubric reference the only grading guidance.
- Avoid repeating the same academicIntegrityStatement, accessibilityAndUDL, formatting, or support prose across every brief. Use concise shared-policy language only where necessary, then make each assignment-specific section unique to the task.
- For capstone or multi-part assignments, state how written, oral, visual, and reflection components split points or weight within the assignment.
- QM ALIGNMENT: Assignments must be sequenced and suited to the course level — earlier assignments should scaffold toward later, more complex ones (QM 3.4). Include opportunities for learners to track their progress via the progressTracking field: interim feedback points, self-assessment checkpoints, or peer review milestones (QM 3.5). The academicIntegrityStatement must provide specific guidance on how to uphold integrity for THIS assignment type (QM 3.6).
- COGNITIVE LOAD: Instructions must be imperative, concise, and scannable. No instruction step longer than 25 words. Each step describes one action only.
- HUMAN READABILITY: Each assignment should read as a unique document — vary the overview voice, instruction phrasing, and scaffolding descriptions. Avoid copy-paste language patterns across assignments.
- COURSE GRADE WEIGHT: Preserve only percentages explicitly assigned by the supplied course grading policy. When absent, write "Formative practice — no course-grade weight specified" in pg. Do not distribute or normalize a whole-course grade across generated tasks, lesson subsets or chunks. Rubric points describe performance within a task and are separate from the course grade.
- Return ONLY the JSON object, no prose, no markdown`,
};
