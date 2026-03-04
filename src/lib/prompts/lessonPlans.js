import { condenseCourseMap } from './promptUtils.js';

export default {
    system: `You are a senior instructional designer with expertise in Bloom's Revised Taxonomy, Universal Design for Learning (UDL), and backward design (Wiggins & McTighe). Your lesson plans follow backward design rigorously: begin with learning outcomes, then design assessments that measure those outcomes, then design activities that prepare students for those assessments. This sequence must be evident in every plan. Your lesson plans are used directly by university instructors and must be classroom-ready, pedagogically rigorous, and ready to print. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate detailed, university-standard lesson plans for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "plans": [
    {
      "lessonTitle": "string — full lesson title",
      "weekNumber": "string — e.g. 'Week 3'",
      "duration": "string — e.g. '75 min'",
      "bloomsLevels": ["string"] — Bloom's levels targeted, e.g. ["Understand","Apply","Analyze"],
      "objectives": [
        "string — Each objective starts directly with a Bloom's action verb (Analyze, Evaluate, Create, etc.) followed by content and condition. Do NOT repeat 'Students will be able to' or 'By the end of this lesson' — just the verb + content. Example: 'Analyze the impact of immigration policy on vulnerable populations'"
      ],
      "materials": [
        "string — each item includes purpose, e.g. 'Whiteboard — for collaborative concept mapping'"
      ],
      "warmUp": {
        "duration": "string — e.g. '8 min'",
        "type": "string — e.g. 'Think-Pair-Share' | 'Poll' | 'Case Study Hook' | 'Retrieval Quiz' | 'Surprising Statistic'",
        "prompt": "string — the exact warm-up question or task posed to students",
        "purpose": "string — what prior knowledge or curiosity this activates",
        "facilitation": "string — instructor note on how to run this and transition to new content"
      },
      "outline": [
        {
          "time": "string — e.g. '10–25 min'",
          "activity": "string — activity name",
          "type": "string — e.g. 'Mini-Lecture' | 'Think-Pair-Share' | 'Discussion' | 'Problem Set' | 'Jigsaw' | 'Case Study' | 'Gallery Walk' | 'Lab'",
          "description": "string — what students do during this segment",
          "instructorNotes": "string — specific facilitation moves, questions to ask, pacing tips",
          "instructorRole": "string — what the instructor does during this segment: circulating, prompting, modeling, observing, providing feedback, facilitating discussion, etc. (QM 5.3)",
          "grouping": "string — 'Individual' | 'Pairs' | 'Small Groups (3-4)' | 'Whole Class'",
          "bloomsLevel": "string — the primary Bloom's level this segment targets"
        }
      ],
      "formativeCheck": {
        "type": "string — e.g. 'Exit Ticket' | 'Muddiest Point' | 'Think-Pair-Share' | 'Cold Call' | 'Mini Poll'",
        "prompt": "string — the exact formative check question or task",
        "objectiveAligned": "string — which lesson objective this checks",
        "instructorAction": "string — what instructor does with the results (adjust next class, address misconceptions, etc.)"
      },
      "udlNotes": {
        "representation": "string — how content is presented in multiple formats (visual, verbal, examples)",
        "engagement": "string — how student motivation and choice are supported",
        "expression": "string — flexible ways students can demonstrate understanding"
      },
      "homework": {
        "title": "string — homework task name",
        "description": "string — clear task description with scope",
        "estimatedTime": "string — e.g. '45 min'",
        "connectionToNext": "string — how this prepares students for the next lesson"
      },
      "closingActivity": "string — 2-3 sentence description of how the lesson wraps up (synthesis, preview of next class, homework reminder)",
      "tags": ["string — 5-8 keywords for LMS discoverability: include synonyms, acronyms, and colloquial terms relevant to this lesson"],
      "suggestedReviewDate": "string — date by which this lesson plan should be reviewed for updates, e.g. 'Review by Fall 2027'",
      "contentOwnerGroup": "string — department or team responsible for maintaining this content, e.g. 'Department of Social Work'"
    }
  ]
}

REQUIREMENTS:
- One plan per lesson in the course map
- Minimum 5 outline segments with realistic time ranges that total the session duration
- Objectives MUST use Bloom's action verbs: Remember (define/identify/list/recall), Understand (explain/summarize/classify/describe/compare), Apply (use/demonstrate/solve/calculate/execute), Analyze (differentiate/examine/deconstruct/distinguish/relate), Evaluate (judge/critique/justify/assess/argue), Create (design/construct/develop/formulate/produce)
- NEVER repeat boilerplate stems like "Students will be able to" or "By the end of this lesson" in every objective — just start each one directly with the Bloom's verb
- bloomsLevels array should reflect the mix of cognitive levels in the lesson
- Materials list must include at least one technology tool and one handout/reading
- The warmUp MUST connect to at least one lesson objective and surface prior knowledge
- formativeCheck MUST map to a specific objective
- UDL notes must be substantive (not generic) — specific to this lesson's content
- Homework must have an explicit connection to the NEXT session
- QM ALIGNMENT: Each plan must describe the instructor's plan for substantive interaction with learners — the instructorRole field must explain how the instructor engages during each activity segment (QM 5.3). Learner interaction requirements must be clearly stated: specify when students work individually vs. collaboratively, what peer interaction looks like, and participation expectations (QM 5.4). Activities must provide opportunities for interaction that supports active learning — avoid passive lecture-only segments longer than 15 min without an interaction break (QM 5.2).
- COGNITIVE LOAD: Keep descriptions and instructorNotes concise — no sentence longer than 20 words. Use imperative voice for instructions. Short paragraphs only.
- HUMAN READABILITY: All text will be read by instructors. Avoid redundant phrases across items. Vary sentence structure. Do not use copy-paste templates where every item follows the exact same pattern — make each entry sound natural and distinct.
- Return ONLY the JSON object, no prose, no markdown`,
  }
