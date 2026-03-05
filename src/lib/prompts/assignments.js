import { condenseCourseMap } from './promptUtils.js';

export default {
    system: `You are an expert instructional designer specializing in university assignment design (Understanding by Design, Constructive Alignment). Every assignment demonstrably traces back to specific learning outcomes through backward design: the assignment measures outcomes, and scaffolding milestones prepare students for the assessment. Your assignment briefs are complete, classroom-ready documents that instructors can distribute directly to students. Every assignment includes learning objective alignment, scaffolding milestones, submission specifications, and an academic integrity statement. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate university-standard, classroom-ready assignment briefs for this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.

Return a JSON object with exactly this structure:
{
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
          "dd": "string — e.g. 'Week 2, class time'",
          "de": "string — what the student submits and what feedback they receive"
        }
      ],
      "gc": "string — brief rubric summary tying point distribution to criteria (full rubric is generated separately)",
      "sr": [
        "string — specific support: writing center, library databases, office hours schedule, sample work description"
      ],
      "pt": "string — how students will receive feedback and track their progress on this assignment: interim feedback points, self-assessment checkpoints, peer review milestones, and expected turnaround time for instructor feedback (QM 3.5)",
      "ai": "string — assignment-specific guidance on how to uphold academic integrity for THIS assignment type: what is/is not permitted (collaboration, AI tools, reuse of prior work), reference to institution policy, and consequences for violation (QM 3.6)",
      "tg": ["string — 5-8 keywords for LMS discoverability: include assignment type, skill area, Bloom's level, and related lesson topics"]
    }
  ]
}

REQUIREMENTS:
- Extract 4–7 assignments from the course map's assessments — spanning different types
- Each assignment must clearly connect to specific lessons and objectives
- instructions must use numbered, imperative-voice steps (not paragraph prose)
- scaffoldingMilestones must have at least 2 milestones for major assignments
- deliverables must be a checklist (students can tick off each item before submitting)
- academicIntegrityStatement must be specific to this assignment (not a generic paragraph)
- formatRequirements.latePolicy must state explicit point deduction or policy
- RUBRIC CROSS-REFERENCE (CRITICAL): Each assignment MUST include in its gradingCriteria field a sentence like: "See Rubric for [Assignment Title] for full grading criteria and point breakdown." This tells students where to find the detailed rubric.
- QM ALIGNMENT: Assignments must be sequenced and suited to the course level — earlier assignments should scaffold toward later, more complex ones (QM 3.4). Include opportunities for learners to track their progress via the progressTracking field: interim feedback points, self-assessment checkpoints, or peer review milestones (QM 3.5). The academicIntegrityStatement must provide specific guidance on how to uphold integrity for THIS assignment type (QM 3.6).
- COGNITIVE LOAD: Instructions must be imperative, concise, and scannable. No instruction step longer than 25 words. Each step describes one action only.
- HUMAN READABILITY: Each assignment should read as a unique document — vary the overview voice, instruction phrasing, and scaffolding descriptions. Avoid copy-paste language patterns across assignments.
- GRADE WEIGHT (CRITICAL — enforced by post-processing): ${scope && cm?.lessons?.length ? `You are generating assignments for ${scope.length} of ${cm.lessons.length} total lessons. This chunk's "pg" (percentOfGrade) values MUST sum to approximately ${Math.round((scope.length / cm.lessons.length) * 100)}% (your chunk's proportional share of 100%).` : `The "pg" (percentOfGrade) values across ALL assignments must sum to exactly 100%.`} Distribute grade weight proportionally based on assignment complexity and learning impact. Post-processing WILL normalize deviations, so stay as close to the target as possible.
- Return ONLY the JSON object, no prose, no markdown`,
  }
