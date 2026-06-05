import { DEFAULT_SEMESTER } from './blueprintQualityScenarioFactory.js';

export const SPARSE_SOURCE_BOUNDARY_SCENARIOS = [
  {
    name: 'missing sections import',
    expectedPath: 'review-or-block',
    courseMap: {
      courseName: 'Sparse Import Seminar',
      semester: DEFAULT_SEMESTER,
      learningOutcomes: 'Analyze source evidence and create a short decision memo from imported course-map rows.',
      lessons: [
        {
          title: 'Lesson 1: Imported Row Without Sections',
          sections: [],
        },
        {
          title: 'Lesson 2: Sparse Evidence Row',
          sections: [
            {
              topicSection: 'source evaluation; policy memo',
              learningObjectives: 'Analyze source credibility and create a decision note.',
              weeklyAssessments: 'Short decision memo with source evidence.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'weak source material',
    expectedPath: 'review-or-block',
    courseMap: {
      courseName: 'Weak Source Studio',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Use source-grounded evidence, feedback, and revision to move from vague topic notes to usable course artifacts.',
      lessons: [1, 2, 3].map((lessonNumber) => ({
        title: `Lesson ${lessonNumber}: Broad Topic ${lessonNumber}`,
        sections: [
          {
            topicSection: `Broad topic ${lessonNumber}`,
            learningObjectives: 'Understand the topic and discuss it.',
            weeklyAssessments: 'Weekly activity.',
          },
        ],
      })),
    },
  },
  {
    name: 'partial source evidence',
    expectedPath: 'compile-with-review',
    courseMap: {
      courseName: 'Partial Evidence Lab',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Analyze lab evidence, evaluate data limitations, and revise conclusions from peer and instructor feedback.',
      lessons: [1, 2, 3].map((lessonNumber) => ({
        title: `Lesson ${lessonNumber}: Lab Evidence ${lessonNumber}`,
        sections: [
          {
            topicSection: `lab evidence ${lessonNumber}; data table; measurement limitation`,
            learningObjectives: `Analyze data ${lessonNumber} and evaluate measurement limits.`,
            syncActivities: 'Lab practice with peer data check and instructor debrief.',
          },
        ],
      })),
    },
  },
];

export const MESSY_UPLOAD_QUALITY_SCENARIOS = [
  {
    name: 'copied syllabus table with tbd dates',
    courseMap: {
      courseName: 'Imported Urban Policy Seminar',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Analyze policy evidence, evaluate implementation tradeoffs, and revise memo recommendations from peer and instructor feedback.',
      lessons: [
        {
          title: 'Wk 1 / intro + city services -- dates TBD',
          sections: [
            {
              topicSection:
                'copied from syllabus table: city service problem framing; stakeholder evidence; local policy examples; dates TBD',
              learningGoals: 'Students connect course outcomes to inspectable policy evidence.',
              learningObjectives: 'Analyze a city service problem and identify stakeholder evidence for a memo.',
              weeklyAssessments:
                'Memo checkpoint 1 -- problem definition, evidence table, stakeholder map, and revision note.',
              asyncActivities: 'Read LMS case packet; note missing official reading details for instructor review.',
              syncActivities: 'Seminar evidence sort; peer memo critique; instructor debrief.',
              supportingResources: 'LMS case packet; stakeholder map; memo template; official readings in LMS.',
              evaluateDesign: 'Score source evidence, problem framing, stakeholder logic, and revision quality.',
            },
          ],
        },
        {
          title: 'Week 2: Options / tradeoffs / implementation',
          sections: [
            {
              topicSection:
                'option comparison; feasibility; equity; implementation constraints; grading weight not listed',
              learningObjectives: 'Evaluate two policy options and justify one implementation recommendation.',
              weeklyAssessments: 'Memo checkpoint 2 with option matrix, equity note, feasibility risk, and revision.',
              asyncActivities: 'Review source packet and mark one unsupported claim.',
              syncActivities: 'Policy lab with option comparison, equity critique, and memo revision.',
              supportingResources: 'Option matrix; equity checklist; local examples need instructor confirmation.',
              evaluateDesign: 'Score feasibility evidence, equity reasoning, and recommendation clarity.',
            },
          ],
        },
        {
          title: 'Final memo workshop',
          sections: [
            {
              topicSection: 'final synthesis; local examples; source permissions; publish after instructor review',
              learningObjectives:
                'Create a final policy memo that cites approved course evidence and names limitations.',
              weeklyAssessments: 'Final memo draft with source-use check, limitation paragraph, and revision plan.',
              asyncActivities: 'Revise draft from feedback; verify local citations in LMS.',
              syncActivities: 'Workshop with calibration against rubric criteria and source-use boundary check.',
              supportingResources: 'Rubric draft; local source list pending; revision checklist.',
              evaluateDesign: 'Assess source integrity, recommendation logic, and feedback uptake.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'old project reload with lms-only readings',
    courseMap: {
      courseName: 'Restored Data Methods Project',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Analyze dataset provenance, evaluate validation limits, and create notebook-based explanations for nontechnical stakeholders.',
      lessons: [1, 2, 3, 4].map((lessonNumber) => ({
        title: `Recovered lesson ${lessonNumber}: data methods fragment ${lessonNumber}`,
        sections: [
          {
            topicSection: `Recovered from old project JSON; dataset provenance ${lessonNumber}; notebook output ${lessonNumber}; reading link lives in LMS only`,
            learningObjectives: `Analyze dataset limitations ${lessonNumber} and explain one validation decision.`,
            weeklyAssessments: `Notebook checkpoint ${lessonNumber} with provenance note, validation metric, limitation, and feedback revision.`,
            asyncActivities: `Reopen old notebook output ${lessonNumber}; identify one missing source detail.`,
            syncActivities: `Lab recovery session ${lessonNumber}; compare notebook outputs and revise explanation.`,
            supportingResources: `Old project notebook; LMS-only reading; data dictionary; model-card template.`,
            evaluateDesign: `Score reproducibility, source boundary, validation reasoning, and revision.`,
          },
        ],
      })),
    },
  },
  {
    name: 'clinical practicum upload with policy placeholders',
    courseMap: {
      courseName: 'Clinical Skills Practicum Upload',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Use de-identified practice evidence, supervision feedback, and scope boundaries to revise clinical communication decisions.',
      lessons: [
        {
          title: 'Module A - intake scenario [local policy]',
          sections: [
            {
              topicSection:
                'de-identified intake scenario; active listening; risk cue recognition; local policy placeholder',
              learningObjectives:
                'Analyze de-identified client cues and create a communication note for supervision review.',
              weeklyAssessments:
                'Practice note with transcript excerpt, risk cue, supervision question, and revision plan.',
              asyncActivities: 'Review de-identified scenario packet and mark one scope boundary.',
              syncActivities: 'Role-play with observation coding, supervision debrief, and revision.',
              supportingResources:
                'De-identified scenario; observation checklist; institution policy to be supplied locally.',
              evaluateDesign: 'Score communication evidence, ethics boundary, supervision uptake, and revision.',
            },
          ],
        },
        {
          title: 'Module B - referral handoff',
          sections: [
            {
              topicSection: 'referral handoff; confidentiality; mandated reporting policy TBD; supervision feedback',
              learningObjectives:
                'Evaluate referral cues and revise a handoff statement within local policy boundaries.',
              weeklyAssessments:
                'Referral handoff note with confidentiality check, instructor-confirmation flag, and feedback revision.',
              asyncActivities: 'Read de-identified handoff case and note policy questions for instructor review.',
              syncActivities: 'Handoff simulation with observer feedback and policy-boundary debrief.',
              supportingResources: 'Referral template; de-identified case; local policy review required.',
              evaluateDesign: 'Assess referral reasoning, confidentiality boundary, communication, and review flag.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'multi-section spreadsheet paste with blank cells',
    courseMap: {
      courseName: 'Spreadsheet Paste Writing Workshop',
      semester: DEFAULT_SEMESTER,
      learningOutcomes:
        'Analyze draft evidence, evaluate reader feedback, and revise writing artifacts with source-aware reflection.',
      lessons: [
        {
          title: 'Lesson 1: Draft diagnosis',
          sections: [
            {
              topicSection: 'row 1 col B: audience and genre; draft excerpts; feedback patterns',
              learningObjectives: 'Analyze a draft excerpt and identify one reader-centered revision priority.',
              weeklyAssessments: 'Revision note with excerpt evidence, reader concern, and next edit.',
              asyncActivities: 'Annotate draft excerpt before workshop.',
              syncActivities: 'Workshop triads with feedback role cards and revision plan.',
              supportingResources: 'Draft excerpt packet; peer feedback form; revision checklist.',
              evaluateDesign: 'Score evidence specificity, audience reasoning, and revision action.',
            },
            {
              topicSection: '',
              learningObjectives: '',
              weeklyAssessments: 'Blank spreadsheet cells imported here; instructor should confirm if this was merged.',
            },
          ],
        },
        {
          title: 'Lesson 2: Evidence and structure',
          sections: [
            {
              topicSection: 'source integration; paragraph structure; quote sandwich; citation detail missing',
              learningObjectives: 'Evaluate source integration and revise one paragraph for evidence clarity.',
              weeklyAssessments:
                'Paragraph revision with source-use note, citation placeholder flagged for review, and peer feedback.',
              asyncActivities: 'Review source excerpt and mark one citation detail needing confirmation.',
              syncActivities: 'Paragraph clinic with evidence mapping and revision.',
              supportingResources: 'Source excerpt in LMS; paragraph model; citation guide.',
              evaluateDesign: 'Score source use, structure, citation boundary, and revision.',
            },
          ],
        },
      ],
    },
  },
];

export function makeMissingSourceBlueprint() {
  return {
    courseName: 'Boundary Refusal Course',
    totalLessons: 1,
    lessons: [
      {
        id: 'lesson-1',
        number: 1,
        title: 'Lesson 1: Unsupported Request',
        outcomes: [],
        keyConcepts: [],
      },
    ],
    assessments: [],
  };
}
