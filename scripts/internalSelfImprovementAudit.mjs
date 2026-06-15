#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  PIPELINE_FEATURES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './hybridPipelineAudit.mjs';
import { buildCompactPackageTrustReceipt } from '../src/lib/packageFinalizerSummary.js';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'internal-self-improvement');

const FEATURE_LABELS = {
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
};

export const DEFAULT_SELF_IMPROVEMENT_FIXTURES = [
  {
    id: 'sparse-official-dates-and-assessments',
    title: 'Sparse official dates and assessments',
    focus: 'Missing official dates, incomplete assessment details, and local confirmation boundaries',
    expectedReviewSignals: [
      {
        id: 'official-dates',
        label: 'Official dates need local confirmation',
        pattern: /official (?:date|calendar)|confirm(?:ed|ation)?[^.]{0,80}date|date[^.]{0,80}confirm/i,
      },
      {
        id: 'assessment-confirmation',
        label: 'Assessment weights or grading choices need local confirmation',
        pattern:
          /assessment weight|grading decision|confirm(?:ed|ation)?[^.]{0,80}assessment|assessment[^.]{0,80}confirm/i,
      },
    ],
    courseMap: {
      courseName: 'Community Health Practicum Planning',
      semester: 'TBD',
      lessons: [
        {
          title: 'Lesson 1: Community Intake',
          sections: [
            {
              topics: 'Community intake goals and stakeholder context',
              objectives: 'Identify the information needed before a practicum plan can be approved.',
              activities: 'Stakeholder map and intake role-play',
              assessment: '',
            },
          ],
        },
        {
          title: 'Lesson 2: Evidence Sources',
          sections: [
            {
              topics: 'Local reports, interview notes, and incomplete agency records',
              objectives: 'Evaluate which sources are strong enough to support planning decisions.',
              activities: 'Source-quality sort with missing-record flags',
              assessment: 'Evidence memo draft',
            },
          ],
        },
        {
          title: 'Lesson 3: Program Logic',
          sections: [
            {
              topics: 'Inputs, activities, outputs, outcomes',
              objectives: 'Build a draft logic model from partial source evidence.',
              activities: 'Logic-model studio with peer critique',
              assessment: '',
            },
          ],
        },
        {
          title: 'Lesson 4: Feasibility Review',
          sections: [
            {
              topics: 'Staffing, timeline, risk, and adoption constraints',
              objectives: 'Revise a plan when a constraint invalidates the first draft.',
              activities: 'Constraint scenario and revision round',
              assessment: 'Feasibility note',
            },
          ],
        },
        {
          title: 'Lesson 5: Handoff and Local Approval',
          sections: [
            {
              topics: 'Instructor approval, partner confirmation, and publish boundary',
              objectives: 'Prepare a handoff that names what still needs local approval.',
              activities: 'Final handoff checklist',
              assessment: 'Draft practicum plan',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'contradictory-clinical-schedule',
    title: 'Contradictory clinical schedule',
    focus: 'Duplicate clinical weeks, safety-sensitive assumptions, and source-conflict review actions',
    expectedReviewSignals: [
      {
        id: 'source-conflict',
        label: 'Source conflicts are visible before publication',
        pattern: /source conflict|conflicting source|duplicate|contradict/i,
      },
      {
        id: 'safety-review',
        label: 'Clinical or safety-sensitive assumptions require review',
        pattern: /safety|clinical|scope of practice|local review|confirm/i,
      },
    ],
    courseMap: {
      courseName: 'Clinical Communication Simulation',
      semester: 'Spring pilot',
      lessons: [
        {
          title: 'Week 1: Patient Intake',
          sections: [
            {
              topics: 'Patient greeting, confidentiality, symptom intake',
              objectives: 'Collect a patient concern using safe communication routines.',
              activities: 'Simulated intake with observer checklist',
              assessment: 'Role-play note',
            },
          ],
        },
        {
          title: 'Week 2: Medication Communication',
          sections: [
            {
              topics: 'Medication reconciliation and plain-language explanation',
              objectives: 'Explain medication instructions and identify risk cues.',
              activities: 'Medication-card simulation',
              assessment: 'Medication explanation check',
            },
          ],
        },
        {
          title: 'Week 2: Discharge Communication',
          sections: [
            {
              topics: 'Discharge instructions, teach-back, warning signs',
              objectives: 'Use teach-back to confirm patient understanding.',
              activities: 'Discharge simulation',
              assessment: 'Discharge script',
            },
          ],
        },
        {
          title: 'Week 4: Interpreter Protocol',
          sections: [
            {
              topics: 'Interpreter use, cultural humility, handoff limits',
              objectives: 'Choose communication moves that stay within role and protocol.',
              activities: 'Interpreter scenario triads',
              assessment: 'Protocol reflection',
            },
          ],
        },
        {
          title: 'Week 5: Final Simulation',
          sections: [
            {
              topics: 'Integrated patient scenario',
              objectives: 'Complete a safe simulated communication sequence.',
              activities: 'Final simulation with debrief',
              assessment: 'Final simulation performance',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'linear-algebra-sparse-secondary-sections',
    title: 'Linear algebra with sparse secondary sections',
    focus: 'Math-domain specificity, assessment continuity, and sparse source material without invented citations',
    expectedReviewSignals: [
      {
        id: 'linear-algebra-domain-fit',
        label: 'Linear algebra concepts stay visible in generated student materials',
        pattern: /matrix|vector|basis|dimension|eigen/i,
      },
      {
        id: 'problem-set-continuity',
        label: 'Problem-set or proof-work expectations stay visible',
        pattern: /problem set|worked example|proof|calculation|solution/i,
      },
    ],
    courseMap: {
      courseName: 'Linear Algebra',
      semester: 'Fall schedule to confirm',
      lessons: [
        {
          title: 'Lesson 1: Systems and Row Reduction',
          sections: [
            {
              topics: 'Linear systems, augmented matrices, row operations',
              objectives: 'Use row reduction to decide whether a system has no, one, or infinitely many solutions.',
              activities: 'Worked example comparison and error diagnosis',
              assessment: 'Problem set checkpoint',
            },
          ],
        },
        {
          title: 'Lesson 2: Vector Spaces and Subspaces',
          sections: [
            {
              topics: 'Vector spaces, subspaces, span, closure',
              objectives: 'Test whether a set is a subspace and explain the failed axiom when it is not.',
              activities: 'Subspace sorting studio',
              assessment: 'Short proof exercise',
            },
          ],
        },
        {
          title: 'Lesson 3: Basis and Dimension',
          sections: [
            {
              topics: 'Linear independence, bases, coordinates, dimension',
              objectives: 'Choose a basis and justify why it spans without redundancy.',
              activities: 'Basis construction drill',
              assessment: 'Basis proof and computation set',
            },
          ],
        },
        {
          title: 'Lesson 4: Linear Transformations',
          sections: [
            {
              topics: 'Matrix transformations, kernel, image, rank-nullity',
              objectives: 'Connect a transformation rule to its matrix, kernel, and image.',
              activities: 'Transformation mapping lab',
              assessment: 'Rank-nullity explanation',
            },
          ],
        },
        {
          title: 'Lesson 5: Eigenvalues and Diagonalization',
          sections: [
            {
              topics: 'Eigenvalues, eigenvectors, diagonalization conditions',
              objectives: 'Determine whether a matrix can be diagonalized and explain the evidence.',
              activities: 'Eigenvector case comparison',
              assessment: 'Cumulative problem set',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'mandarin-no-formal-readings',
    title: 'Mandarin course with no formal readings',
    focus: 'Language-learning specificity when the source material is practice-oriented rather than reading-heavy',
    expectedReviewSignals: [
      {
        id: 'language-domain-fit',
        label: 'Mandarin language practice remains visible',
        pattern: /Mandarin|pinyin|tone|pronunciation|dialogue|hanzi/i,
      },
      {
        id: 'practice-assessment-fit',
        label: 'Speaking or listening practice expectations stay visible',
        pattern: /speaking|listening|pronunciation|dialogue|oral|conversation/i,
      },
    ],
    courseMap: {
      courseName: 'Beginning Mandarin Conversation',
      semester: 'Local calendar pending',
      lessons: [
        {
          title: 'Lesson 1: Pinyin and Tones',
          sections: [
            {
              topics: 'Initials, finals, four tones, neutral tone',
              objectives: 'Pronounce pinyin syllables with accurate tone contour.',
              activities: 'Tone pair drills and listening discrimination',
              assessment: 'Pronunciation recording',
            },
          ],
        },
        {
          title: 'Lesson 2: Greetings and Names',
          sections: [
            {
              topics: 'Greetings, names, polite forms, classroom expressions',
              objectives: 'Hold a short greeting exchange with accurate tone targets.',
              activities: 'Partner dialogue rehearsal',
              assessment: 'Two-turn dialogue check',
            },
          ],
        },
        {
          title: 'Lesson 3: Numbers and Time',
          sections: [
            {
              topics: 'Numbers, dates, days of the week, class schedule',
              objectives: 'Ask and answer basic questions about time and schedule.',
              activities: 'Schedule information-gap activity',
              assessment: 'Listening and speaking mini-check',
            },
          ],
        },
        {
          title: 'Lesson 4: Family and People',
          sections: [
            {
              topics: 'Family terms, measure words, describing people',
              objectives: 'Introduce family members using simple sentence patterns.',
              activities: 'Photo-free family tree role-play',
              assessment: 'Oral description',
            },
          ],
        },
        {
          title: 'Lesson 5: Food Ordering',
          sections: [
            {
              topics: 'Common foods, preferences, ordering, polite requests',
              objectives: 'Order food in a short scripted exchange.',
              activities: 'Restaurant dialogue practice',
              assessment: 'Final conversation performance',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'data-science-computational-lab-assets',
    title: 'Data science computational lab assets',
    focus: 'Computational lab materials, dataset provenance, and protection against wet-lab asset drift',
    expectedReviewSignals: [
      {
        id: 'computational-domain-fit',
        label: 'Computational data science artifacts stay visible',
        pattern: /dataset|notebook|model|validation|Python|feature/i,
      },
      {
        id: 'model-validation-fit',
        label: 'Model evaluation and limitation language stays visible',
        pattern: /validation|metric|bias|limitation|train|test/i,
      },
    ],
    forbiddenCompiledSignals: [
      {
        id: 'wet-lab-asset-drift',
        label: 'Computational lab should not request wet-lab materials',
        pattern: /\b(?:hand lens|specimen|petri dish|pipette|goggles|wet lab|field notebook)\b/i,
      },
    ],
    courseMap: {
      courseName: 'Applied Data Science Lab',
      semester: 'Summer pilot',
      lessons: [
        {
          title: 'Lesson 1: Dataset Intake',
          sections: [
            {
              topics: 'Dataset schema, missing values, provenance, data dictionary',
              objectives: 'Audit a dataset before using it for analysis.',
              activities: 'Notebook-based data profile',
              assessment: 'Dataset intake memo',
            },
          ],
        },
        {
          title: 'Lesson 2: Cleaning and Feature Preparation',
          sections: [
            {
              topics: 'Cleaning rules, feature encoding, leakage checks',
              objectives: 'Prepare features without leaking outcome information.',
              activities: 'Python cleaning notebook',
              assessment: 'Feature preparation checkpoint',
            },
          ],
        },
        {
          title: 'Lesson 3: Baseline Modeling',
          sections: [
            {
              topics: 'Train-test split, baseline model, evaluation metric',
              objectives: 'Fit and interpret a baseline model with an appropriate validation metric.',
              activities: 'Model comparison notebook',
              assessment: 'Baseline model note',
            },
          ],
        },
        {
          title: 'Lesson 4: Error Analysis',
          sections: [
            {
              topics: 'Residuals, subgroup performance, bias and limitation review',
              objectives: 'Use error analysis to decide whether a model is ready for use.',
              activities: 'Error slice investigation',
              assessment: 'Error analysis brief',
            },
          ],
        },
        {
          title: 'Lesson 5: Reproducible Handoff',
          sections: [
            {
              topics: 'Notebook reproducibility, README, model card, stakeholder caveats',
              objectives: 'Prepare a reproducible handoff that names model limitations.',
              activities: 'Final notebook review',
              assessment: 'Model handoff package',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'writing-humanities-revision-seminar',
    title: 'Writing and humanities revision seminar',
    focus: 'Humanities-specific argument, textual evidence, revision, and peer review rather than generic deliverables',
    expectedReviewSignals: [
      {
        id: 'humanities-domain-fit',
        label: 'Humanities argument and textual evidence remain visible',
        pattern: /thesis|argument|textual evidence|close reading|passage/i,
      },
      {
        id: 'writing-revision-fit',
        label: 'Drafting, peer review, and revision expectations stay visible',
        pattern: /draft|revision|peer review|audience|style/i,
      },
    ],
    courseMap: {
      courseName: 'Humanities Writing and Revision Workshop',
      semester: 'Fall writing seminar',
      lessons: [
        {
          title: 'Lesson 1: Claims and Close Reading',
          sections: [
            {
              topics: 'Thesis claims, close reading, passage selection',
              objectives: 'Develop a debatable thesis from textual evidence.',
              activities: 'Passage annotation and claim workshop',
              assessment: 'Close-reading paragraph',
            },
          ],
        },
        {
          title: 'Lesson 2: Evidence and Interpretation',
          sections: [
            {
              topics: 'Textual evidence, quotation framing, interpretive warrants',
              objectives: 'Explain how selected evidence supports an argument.',
              activities: 'Evidence ladder peer review',
              assessment: 'Evidence analysis draft',
            },
          ],
        },
        {
          title: 'Lesson 3: Structure and Counterargument',
          sections: [
            {
              topics: 'Essay structure, counterargument, transitions',
              objectives: 'Revise an argument so each section advances the thesis.',
              activities: 'Reverse outline studio',
              assessment: 'Revision memo',
            },
          ],
        },
        {
          title: 'Lesson 4: Style, Audience, and Voice',
          sections: [
            {
              topics: 'Sentence style, audience expectations, academic voice',
              objectives: 'Edit prose for clarity, rhythm, and audience fit.',
              activities: 'Sentence-level revision lab',
              assessment: 'Style revision portfolio',
            },
          ],
        },
        {
          title: 'Lesson 5: Final Portfolio Reflection',
          sections: [
            {
              topics: 'Portfolio curation, reflective argument, revision evidence',
              objectives: 'Use revision evidence to explain growth as a writer.',
              activities: 'Portfolio conference and reflection draft',
              assessment: 'Final writing portfolio',
            },
          ],
        },
      ],
    },
  },
];

const STUDENT_FACING_REPAIR_RULES = [
  {
    id: 'generic-source-cue',
    label: 'Generic source cue is still visible',
    pattern: /Class notes and assigned materials for this lesson/i,
    repairPath: 'Prefer lesson-topic source cues when no real lesson-specific resource is available.',
  },
  {
    id: 'generic-short-answer-frame',
    label: 'Short-answer sample answer still says "For this lesson"',
    pattern: /For this lesson,\s+I would use/i,
    repairPath: 'Name the lesson focus in generated quiz sample answers.',
  },
  {
    id: 'generic-multiple-choice-frame',
    label: 'Multiple-choice stem still says "from this lesson"',
    pattern: /from this lesson\?/i,
    repairPath: 'Name the lesson focus in generated quiz stems.',
  },
  {
    id: 'copied-placeholder-language',
    label: 'Copied placeholder language is visible in student-facing output',
    pattern: /\b(?:lorem ipsum|\[insert [^\]]+\]|copy\/paste prior week|todo placeholder)\b/i,
    repairPath:
      'Strip copied placeholders from generated student-facing deliverables or convert them into local-review notes.',
  },
];

const QUALITY_SCORE_CATEGORIES = [
  'specificity',
  'sourceGrounding',
  'assessmentFit',
  'workloadRealism',
  'sequencing',
  'studentUsability',
  'instructorTrust',
  'artifactPolish',
];

const EDUCATIONAL_STANDARD_FRAMEWORKS = [
  {
    id: 'quality-matters-higher-ed',
    label: 'Quality Matters Higher Ed Course Design Rubric',
    sourceUrl: 'https://www.qualitymatters.org/qa-resources/rubric-standards/higher-ed-rubric',
    appliedAs:
      'Course overview, measurable objectives, assessment, instructional materials, learning activities, technology, support, accessibility, and alignment must work together.',
  },
  {
    id: 'suny-oscqr',
    label: 'SUNY OSCQR Online Course Quality Review Rubric',
    sourceUrl: 'https://oscqr.suny.edu/',
    appliedAs:
      'Course information, technology/tools, design/layout, content/activities, interaction, and assessment/feedback must be inspectable in the output.',
  },
  {
    id: 'cast-udl-3',
    label: 'CAST UDL Guidelines 3.0',
    sourceUrl: 'https://udlguidelines.cast.org/',
    appliedAs:
      'Learner agency requires evidence of engagement, representation, and action/expression options, not just one generic activity path.',
  },
];

const HARDER_JUDGE_DIMENSIONS = [
  'domainFit',
  'pedagogy',
  'clarity',
  'assessmentQuality',
  'sourceGrounding',
  'classroomUsefulness',
  'learnerAgencyAccessibility',
  'packageIntegrity',
];

const FEATURE_STRUCTURE_RULES = {
  syllabus: {
    perLesson: false,
    minChars: 1400,
    itemCount: (data) => (data?.syllabus ? 1 : data ? 1 : 0),
    requiredEvidence: [
      {
        id: 'course-overview-description',
        label: 'course overview or description',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['syllabus.courseDescription', 'courseDescription', 'description', 'overview'],
        patterns: [/course description|course overview|overview|description/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'grading-feedback-plan',
        label: 'grading, assessment, or feedback plan',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['syllabus.assessmentPlan', 'assessmentPlan', 'gradingPolicy', 'feedbackPolicy'],
        patterns: [/assessment|grading|feedback/i],
        dimension: 'assessmentQuality',
      },
      {
        id: 'instructor-support-contact',
        label: 'instructor contact or learner support',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['syllabus.officeHours', 'officeHours', 'contact', 'support', 'learnerSupport'],
        patterns: /office|contact|support/i,
        dimension: 'classroomUsefulness',
      },
    ],
  },
  lessonPlans: {
    perLesson: true,
    minChars: 1800,
    itemCount: (data) => arrayCount(data?.lessonPlans),
    requiredEvidence: [
      {
        id: 'measurable-objectives',
        label: 'lesson objectives',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['lessonPlans[].objectives', 'lessonPlans[].learningObjectives'],
        patterns: [/objective|learning objective/i],
        dimension: 'pedagogy',
      },
      {
        id: 'learning-activities',
        label: 'learning activities or practice',
        standards: ['quality-matters-higher-ed', 'suny-oscqr', 'cast-udl-3'],
        paths: ['lessonPlans[].activities', 'lessonPlans[].practice'],
        patterns: [/activity|practice|studio|lab/i],
        dimension: 'pedagogy',
      },
      {
        id: 'formative-check-feedback',
        label: 'assessment check or feedback routine',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['lessonPlans[].assessment', 'lessonPlans[].feedback'],
        patterns: [/assessment|check|feedback/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
  slideDecks: {
    perLesson: true,
    minChars: 1200,
    itemCount: (data) => arrayCount(data?.decks || data?.slideDecks),
    requiredEvidence: [
      {
        id: 'slide-and-speaker-support',
        label: 'slide sequence with speaker support',
        standards: ['suny-oscqr'],
        paths: ['decks[].slides[].notes', 'slideDecks[].slides[].notes'],
        patterns: [/slide|speaker|notes?/i],
        dimension: 'clarity',
      },
      {
        id: 'slide-objective-practice',
        label: 'objective and practice path',
        standards: ['quality-matters-higher-ed', 'cast-udl-3'],
        paths: ['decks[].slides[].bullets', 'slideDecks[].slides[].bullets'],
        patterns: [/objective|warm[- ]?up|practice/i],
        dimension: 'pedagogy',
      },
      {
        id: 'slide-checkpoint',
        label: 'debrief or exit check',
        standards: ['suny-oscqr'],
        patterns: [/debrief|exit|check/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
  assignments: {
    perLesson: true,
    minChars: 1500,
    itemCount: (data) => arrayCount(data?.assignments || data?.courseAssignmentMap),
    requiredEvidence: [
      {
        id: 'assignment-deliverable',
        label: 'student deliverable or artifact',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['assignments[].deliverable', 'courseAssignmentMap[].deliverable'],
        patterns: [/deliverable|submission|artifact/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'assignment-criteria',
        label: 'transparent assignment criteria',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['assignments[].criteria', 'courseAssignmentMap[].criteria'],
        patterns: [/criteria|criterion|rubric/i],
        dimension: 'assessmentQuality',
      },
      {
        id: 'assignment-feedback-revision',
        label: 'feedback or revision path',
        standards: ['suny-oscqr', 'cast-udl-3'],
        patterns: [/feedback|revision|evidence/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
  rubrics: {
    perLesson: true,
    minChars: 1500,
    itemCount: (data) => arrayCount(data?.rubrics),
    requiredEvidence: [
      {
        id: 'rubric-criteria',
        label: 'rubric criteria',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['rubrics[].criteria'],
        patterns: [/criterion|criteria/i],
        dimension: 'assessmentQuality',
      },
      {
        id: 'rubric-performance-levels',
        label: 'performance levels or points',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        patterns: [/performance|level|points/i],
        dimension: 'assessmentQuality',
      },
      {
        id: 'rubric-feedback-revision',
        label: 'feedback or revision evidence',
        standards: ['suny-oscqr'],
        patterns: [/feedback|revision|evidence/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
  discussions: {
    perLesson: true,
    minChars: 1500,
    itemCount: (data) => arrayCount(data?.discussions || data?.prompts),
    requiredEvidence: [
      {
        id: 'discussion-prompt',
        label: 'discussion prompt',
        standards: ['suny-oscqr'],
        paths: ['discussions[].prompt', 'prompts[].prompt'],
        patterns: [/prompt|question|discussion/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'peer-interaction',
        label: 'learner-to-learner interaction',
        standards: ['suny-oscqr', 'cast-udl-3'],
        paths: ['discussions[].peerResponse', 'prompts[].peerResponse'],
        patterns: [/peer|respond|reply/i],
        dimension: 'learnerAgencyAccessibility',
      },
      {
        id: 'evidence-based-discussion',
        label: 'evidence or source use',
        standards: ['quality-matters-higher-ed'],
        patterns: [/evidence|source|example/i],
        dimension: 'sourceGrounding',
      },
    ],
  },
  quizBank: {
    perLesson: true,
    minChars: 1500,
    itemCount: (data) => arrayCount(data?.quizzes || data?.bankIndex),
    requiredEvidence: [
      {
        id: 'quiz-question-answer',
        label: 'question and answer material',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        paths: ['quizzes[].questions'],
        patterns: [/question|answer|choice/i],
        dimension: 'assessmentQuality',
      },
      {
        id: 'quiz-item-variety',
        label: 'assessment item variety',
        standards: ['suny-oscqr', 'cast-udl-3'],
        patterns: [/short[_ -]?answer|essay|multiple/i],
        dimension: 'learnerAgencyAccessibility',
      },
      {
        id: 'quiz-scoring-feedback',
        label: 'scoring rationale or feedback',
        standards: ['suny-oscqr'],
        paths: ['quizzes[].questions[].rationale', 'quizzes[].questions[].scoring'],
        patterns: [/scoring|rationale|feedback/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
  studyGuides: {
    perLesson: true,
    minChars: 1500,
    itemCount: (data) => arrayCount(data?.studyGuides || data?.guides),
    requiredEvidence: [
      {
        id: 'study-summary-review',
        label: 'review or preparation summary',
        standards: ['suny-oscqr'],
        paths: ['studyGuides[].summary', 'guides[].summary'],
        patterns: [/summary|review|prepare/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'study-practice-check',
        label: 'practice or self-check',
        standards: ['cast-udl-3'],
        paths: ['studyGuides[].practice', 'guides[].practice'],
        patterns: [/practice|check|question/i],
        dimension: 'learnerAgencyAccessibility',
      },
      {
        id: 'study-strong-work-evidence',
        label: 'strong-work examples or evidence',
        standards: ['quality-matters-higher-ed'],
        patterns: [/strong work|evidence|example/i],
        dimension: 'sourceGrounding',
      },
    ],
  },
  courseFaq: {
    perLesson: true,
    minChars: 1200,
    itemCount: (data) => arrayCount(data?.faqs || data?.questions),
    requiredEvidence: [
      {
        id: 'faq-question-answer',
        label: 'question and answer support',
        standards: ['suny-oscqr'],
        paths: ['faqs[].qs[].question', 'faqs[].qs[].answer', 'questions[].answer'],
        patterns: [/question|answer|faq/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'faq-learner-support',
        label: 'review, support, or clarification',
        standards: ['quality-matters-higher-ed', 'suny-oscqr'],
        patterns: [/review|support|clarif/i],
        dimension: 'classroomUsefulness',
      },
      {
        id: 'faq-assessment-context',
        label: 'assessment, assignment, or lesson context',
        standards: ['quality-matters-higher-ed'],
        patterns: [/assessment|assignment|lesson/i],
        dimension: 'assessmentQuality',
      },
    ],
  },
};

const EDUCATIONAL_STANDARDS_ALIGNMENT_RULES = [
  {
    id: 'qm-critical-alignment',
    label: 'QM-style critical alignment across objectives, assessment, materials, and activities',
    standards: ['quality-matters-higher-ed'],
    featureIds: ['lessonPlans', 'assignments', 'rubrics', 'quizBank'],
    requiredPatterns: [
      /objective|competenc/i,
      /assessment|criteria|criterion|rubric|grading|scoring/i,
      /activity|practice|material|source|example/i,
    ],
    dimension: 'pedagogy',
    repairPath:
      'Make objectives, assessments, materials, and learning activities visibly point at the same student performance.',
  },
  {
    id: 'oscqr-assessment-feedback',
    label: 'OSCQR-style assessment and feedback transparency',
    standards: ['suny-oscqr'],
    featureIds: ['syllabus', 'assignments', 'rubrics', 'quizBank', 'lessonPlans'],
    requiredPatterns: [/grading|criteria|criterion|scoring|points|rationale/i, /feedback|formative|revision|check/i],
    dimension: 'assessmentQuality',
    repairPath:
      'Add transparent grading criteria plus a feedback or formative-check path before the deliverable is release-ready.',
  },
  {
    id: 'oscqr-interaction-presence',
    label: 'OSCQR-style interaction and instructor presence',
    standards: ['suny-oscqr'],
    featureIds: ['discussions', 'lessonPlans', 'courseFaq'],
    requiredPatterns: [/peer|collaborat|community|respond|reply|discussion/i, /instructor|feedback|office|support/i],
    dimension: 'classroomUsefulness',
    repairPath: 'Show how learners interact with peers and how instructor feedback, presence, or support is available.',
  },
  {
    id: 'udl-multiple-means',
    label: 'UDL multiple means of engagement, representation, and action/expression',
    standards: ['cast-udl-3'],
    featureIds: ['lessonPlans', 'slideDecks', 'assignments', 'studyGuides', 'discussions'],
    requiredPatterns: [
      /engagement|choice|autonomy|relevance|authentic|collaborat|belonging/i,
      /representation|media|example|vocabulary|notation|pattern|model/i,
      /action|expression|artifact|performance|practice|compose|construction/i,
    ],
    dimension: 'learnerAgencyAccessibility',
    repairPath:
      'Include options for engagement, representation, and action/expression so students have more than one path into and through the work.',
  },
  {
    id: 'oscqr-usability-accessibility',
    label: 'OSCQR/UDL accessibility and usability evidence',
    standards: ['suny-oscqr', 'cast-udl-3'],
    featureIds: ['syllabus', 'slideDecks', 'studyGuides', 'courseFaq'],
    requiredPatterns: [/accessib|usable|support|navigation|clear instruction|technology|modality/i],
    dimension: 'learnerAgencyAccessibility',
    repairPath:
      'Make usability, accessibility, support, modality, or technology expectations explicit in student-facing materials.',
  },
];

const SHALLOW_OUTPUT_RULES = [
  {
    id: 'generic-course-evidence',
    label: 'Generic "course evidence" language is overused',
    pattern: /\bcourse evidence\b/i,
    maxCount: 20,
    dimension: 'domainFit',
    repairPath:
      'Replace generic "course evidence" phrasing with the actual source, method, theorem, text, dataset, case, or practice artifact.',
  },
  {
    id: 'generic-professional-decision',
    label: 'Generic professional-decision frame is overused',
    pattern: /\binstructional or professional decision\b/i,
    maxCount: 8,
    dimension: 'domainFit',
    repairPath:
      'Name the real decision type for the course domain instead of using a generic professional-decision frame.',
  },
  {
    id: 'generic-class-notes-course',
    label: 'Generic class-notes source cue is visible',
    pattern: /Class notes and assigned materials for this course/i,
    maxCount: 0,
    dimension: 'sourceGrounding',
    repairPath:
      'Use source-specific cues or explicit local-review language instead of generic class-notes placeholders.',
  },
  {
    id: 'generic-submission-format',
    label: 'Generic submission format is overused',
    pattern: /Document, presentation, or course-site submission as assigned/i,
    maxCount: 2,
    dimension: 'classroomUsefulness',
    repairPath:
      'Name the expected submission format for each assignment or mark it as an instructor-confirmation item.',
  },
  {
    id: 'generic-course-appropriate-length',
    label: 'Generic length guidance is overused',
    pattern: /Course-appropriate length with enough evidence/i,
    maxCount: 2,
    dimension: 'clarity',
    repairPath:
      'Give concrete length, format, or scope guidance when the source supports it; otherwise add a local-review cue.',
  },
  {
    id: 'generic-core-concepts',
    label: 'Generic course-description frame is visible',
    pattern: /build from core concepts to applied decisions/i,
    maxCount: 0,
    dimension: 'pedagogy',
    repairPath: 'Make the syllabus description name the course-specific intellectual progression.',
  },
];

const DOMAIN_QUALITY_RULES = [
  {
    id: 'math',
    label: 'math/proof course',
    detect: /\b(?:linear algebra|matrix|matrices|vector|eigen|basis|proof|calculation|theorem)\b/i,
    required: [/matrix|vector|basis|eigen|proof|calculation/i, /worked example|problem set|solution|derive|compute/i],
    weakGeneric:
      /\binstructional or professional decision\b|\bprofessional communication and format fit\b|\bgeneric course artifact\b/i,
  },
  {
    id: 'language',
    label: 'world-language course',
    detect: /\b(?:Mandarin|Spanish|French|pinyin|tone|pronunciation|dialogue|conversation|speaking|listening)\b/i,
    required: [
      /speaking|listening|pronunciation|dialogue|conversation|oral|tone|pinyin/i,
      /practice|recording|exchange|rehearsal/i,
    ],
    weakGeneric: /\bempirical evidence\b|\bprofessional decision\b/i,
  },
  {
    id: 'clinical',
    label: 'clinical/safety-sensitive course',
    detect: /\b(?:clinical|patient|simulation|scope of practice|safety|medication|discharge|health equity)\b/i,
    required: [
      /safety|scope of practice|local review|protocol|patient|clinical/i,
      /simulation|scenario|teach-back|debrief/i,
    ],
    weakGeneric: /\bno local review boundary\b|\bgeneric course artifact\b/i,
  },
  {
    id: 'data-science',
    label: 'data-science/lab course',
    detect: /\b(?:dataset|notebook|Python|model|validation|train|test|feature|metric|bias)\b/i,
    required: [/dataset|notebook|Python|model|validation|metric|train|test/i, /provenance|limitation|bias|reproducib/i],
    weakGeneric: /\bwet lab\b|\bpetri dish\b|\bspecimen\b/i,
  },
  {
    id: 'writing-humanities',
    label: 'writing/humanities course',
    detect: /\b(?:writing|humanities|literature|argument|thesis|textual evidence|close reading|portfolio)\b/i,
    required: [
      /thesis|argument|textual evidence|close reading|revision|draft|peer review/i,
      /passage|claim|interpret|style|audience/i,
    ],
    weakGeneric: /\bclinical simulation\b|\bwet lab\b|\bmultiple choice 2 pts 2 min\b/i,
  },
  {
    id: 'mixed-modality',
    label: 'mixed-modality course',
    detect: /\b(?:asynchronous|synchronous|mixed modality|hybrid|live studio|online)\b/i,
    required: [/asynchronous|synchronous|live|online|handoff|prep/i, /feedback|checkpoint|debrief|review/i],
    weakGeneric: /\bweekly seminar, applied practice, discussion, and feedback checkpoint\b/i,
  },
];

const ADVERSARIAL_MUTATIONS = [
  {
    id: 'base-repeat',
    label: 'Base fixture replay',
    expectedCriticSignal: 'regression guard',
    apply: () => {},
  },
  {
    id: 'placeholder-calendar',
    label: 'Placeholder official calendar',
    expectedCriticSignal: 'accepted input risk',
    apply: (courseMap, roundIndex) => {
      courseMap.semester = roundIndex % 2 === 0 ? 'TBD' : 'Local calendar pending';
    },
  },
  {
    id: 'assessment-gap',
    label: 'Missing assessment slot',
    expectedCriticSignal: 'accepted input risk',
    apply: (courseMap, roundIndex) => {
      const lessons = courseMap.lessons || [];
      const lesson = lessons[roundIndex % Math.max(1, lessons.length)];
      const section = lesson?.sections?.[0];
      if (section && Object.prototype.hasOwnProperty.call(section, 'assessment')) section.assessment = '';
    },
  },
  {
    id: 'duplicate-schedule-label',
    label: 'Duplicate schedule label',
    expectedCriticSignal: 'accepted input risk',
    apply: (courseMap) => {
      const lessons = courseMap.lessons || [];
      if (lessons.length >= 3) {
        const firstLabel = String(lessons[1].title || 'Week 2').match(/\b(?:Week|Lesson|Module|Session)\s+\d+\b/i)?.[0];
        const label = firstLabel || 'Week 2';
        lessons[2].title = `${label}: ${String(lessons[2].title || 'Synthesis').replace(/^(?:Week|Lesson|Module|Session)\s+\d+\s*:\s*/i, '')}`;
      }
    },
  },
  {
    id: 'thin-objectives',
    label: 'Thin objective wording',
    expectedCriticSignal: 'quality score pressure',
    apply: (courseMap, roundIndex) => {
      const lessons = courseMap.lessons || [];
      const lesson = lessons[(roundIndex + 1) % Math.max(1, lessons.length)];
      const section = lesson?.sections?.[0];
      if (section) section.objectives = 'Understand the topic.';
    },
  },
  {
    id: 'multi-section-no-readings',
    label: 'Multi-section input with no formal readings',
    expectedCriticSignal: 'source-boundary guard',
    apply: (courseMap, roundIndex) => {
      const lessons = courseMap.lessons || [];
      const lesson = lessons[(roundIndex + 2) % Math.max(1, lessons.length)];
      if (!lesson) return;
      lesson.readings = [];
      lesson.resources = [];
      lesson.sections = [
        ...(lesson.sections || []),
        {
          topics: `${lesson.title || courseMap.courseName} applied practice`,
          objectives: 'Apply the lesson idea to a new artifact without adding invented sources.',
          activities: 'Evidence-transfer practice',
          assessment: 'Applied check',
        },
      ];
    },
  },
  {
    id: 'mixed-modality-handoff',
    label: 'Mixed modality handoff pressure',
    expectedCriticSignal: 'workload and instructor-trust guard',
    apply: (courseMap, roundIndex) => {
      const lessons = courseMap.lessons || [];
      const lesson = lessons[(roundIndex + 3) % Math.max(1, lessons.length)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.activities = `${section.activities || 'Practice activity'}; asynchronous prep plus live studio handoff`;
        section.assessment = section.assessment || 'Local instructor review checkpoint';
      }
    },
  },
  {
    id: 'large-course-map',
    label: 'Large course map expansion',
    expectedCriticSignal: 'large-map scalability guard',
    apply: (courseMap, roundIndex) => {
      const lessons = Array.isArray(courseMap.lessons) && courseMap.lessons.length > 0 ? courseMap.lessons : [];
      const targetLessonCount = 20 + (roundIndex % 3);
      courseMap.lessons = Array.from({ length: targetLessonCount }, (_, index) => {
        const base = cloneCourseMap(
          lessons[index % Math.max(1, lessons.length)] || {
            title: `Lesson ${index + 1}: Imported Topic`,
            sections: [
              {
                topics: 'Imported topic cluster',
                objectives: 'Connect the imported topic to a course outcome.',
                activities: 'Applied synthesis activity',
                assessment: 'Checkpoint',
              },
            ],
          },
        );
        const topic = String(base.title || `Topic ${index + 1}`).replace(
          /^(?:Week|Lesson|Module|Session)\s+\d+\s*:\s*/i,
          '',
        );
        base.title = `Lesson ${index + 1}: ${topic}`;
        const section = base.sections?.[0];
        if (section) section.assessment = section.assessment || `Checkpoint ${index + 1}`;
        return base;
      });
    },
  },
  {
    id: 'malformed-import-fragments',
    label: 'Malformed import fragments',
    expectedCriticSignal: 'malformed import local-review guard',
    apply: (courseMap, roundIndex) => {
      courseMap.importNotes = `Legacy import row ${roundIndex}: unknown column ???; raw import fragment retained for local review.`;
      const lesson = courseMap.lessons?.[roundIndex % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (lesson) lesson.title = `${lesson.title || 'Imported lesson'} -- raw row ???`;
      if (section) {
        section.topics = `${section.topics || 'Imported topic'}; unknown column text needs cleanup`;
        section.activities = `${section.activities || 'Practice activity'}; imported cell has mismatched delimiter ||`;
      }
    },
  },
  {
    id: 'contradictory-rubrics',
    label: 'Contradictory rubric weights',
    expectedCriticSignal: 'rubric contradiction local-review guard',
    apply: (courseMap, roundIndex) => {
      const lesson = courseMap.lessons?.[(roundIndex + 1) % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.assessment = `${section.assessment || 'Final deliverable'}; rubric conflict: assignment says final essay 40 percent, quiz says same outcome is 10 percent.`;
        section.rubric =
          'Contradictory rubric: criteria weights total 130 percent and conflict with the assessment description.';
      }
    },
  },
  {
    id: 'missing-objectives',
    label: 'Missing objectives',
    expectedCriticSignal: 'missing objective local-review guard',
    apply: (courseMap, roundIndex) => {
      const lessons = courseMap.lessons || [];
      for (const offset of [0, 2]) {
        const lesson = lessons[(roundIndex + offset) % Math.max(1, lessons.length)];
        const section = lesson?.sections?.[0];
        if (section) section.objectives = '';
      }
    },
  },
  {
    id: 'overloaded-lessons',
    label: 'Overloaded lesson workload',
    expectedCriticSignal: 'workload plausibility guard',
    apply: (courseMap, roundIndex) => {
      const lesson = courseMap.lessons?.[(roundIndex + 2) % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.activities = `${section.activities || 'Practice activity'}; overloaded lesson asks for six-hour live studio, 400 pages, 12 deliverables, and 900 minutes of student work.`;
        section.assessment = section.assessment || 'Overloaded synthesis package';
      }
    },
  },
  {
    id: 'multilingual-mixed-course',
    label: 'Multilingual mixed-language course',
    expectedCriticSignal: 'multilingual handoff guard',
    apply: (courseMap, roundIndex) => {
      const lesson = courseMap.lessons?.[(roundIndex + 3) % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.topics = `${section.topics || 'Course topic'}; Spanish/Mandarin/French mixed-language examples with English instructions.`;
        section.activities = `${section.activities || 'Practice activity'}; students compare multilingual terms and translation boundaries.`;
      }
    },
  },
  {
    id: 'bad-date-structures',
    label: 'Bad date structures',
    expectedCriticSignal: 'date-structure local-review guard',
    apply: (courseMap) => {
      courseMap.semester = 'Fall 2026: starts 2026-09-31; final due 2026-08-01 before first class';
      const lesson = courseMap.lessons?.[0];
      if (lesson) lesson.title = `${lesson.title || 'Lesson 1'} (meets 2026-02-30)`;
    },
  },
  {
    id: 'copied-placeholder-language',
    label: 'Copied placeholder language',
    expectedCriticSignal: 'placeholder leakage guard',
    apply: (courseMap, roundIndex) => {
      const lesson = courseMap.lessons?.[(roundIndex + 4) % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.topics = `${section.topics || 'Course topic'}; Lorem ipsum [INSERT READING] copy/paste prior week.`;
        section.activities = `${section.activities || 'Practice activity'}; TODO placeholder should not ship.`;
      }
    },
  },
  {
    id: 'export-package-integrity',
    label: 'Export package integrity',
    expectedCriticSignal: 'export filename and package guard',
    apply: (courseMap, roundIndex) => {
      courseMap.courseName = `${courseMap.courseName || 'Course'} / Export: Package? Integrity * Test`;
      const lesson = courseMap.lessons?.[(roundIndex + 1) % Math.max(1, courseMap.lessons?.length || 1)];
      if (lesson) lesson.title = `${lesson.title || 'Lesson'} / file:name? archive*check`;
    },
  },
  {
    id: 'deliverable-specific-weak-spots',
    label: 'Deliverable-specific weak spots',
    expectedCriticSignal: 'deliverable-specific quality guard',
    apply: (courseMap, roundIndex) => {
      const lesson = courseMap.lessons?.[(roundIndex + 2) % Math.max(1, courseMap.lessons?.length || 1)];
      const section = lesson?.sections?.[0];
      if (section) {
        section.assessment = `${section.assessment || 'Assessment'}; weak deliverables: quiz choices all use answer A, rubric repeats the same criterion, discussion prompt copied from quiz.`;
        section.activities = `${section.activities || 'Practice activity'}; slide deck needs one evidence-backed example, not generic bullets.`;
      }
    },
  },
];

const AUTONOMOUS_ENGINE_POLICY = {
  fullAutonomyRoundFloor: 100,
  scaleConfidenceRoundFloor: 500,
  mutationFamilyFloor: ADVERSARIAL_MUTATIONS.length,
  qualityFloor: 90,
  blindSpotQualityFloor: 82,
  concerningDelta: -5,
  trendRegressionTolerance: -2,
};

function makeFinding(severity, check, message, detail = {}) {
  return { severity, check, message, ...detail };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countMatches(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return Array.from(text.matchAll(new RegExp(pattern.source, flags))).length;
}

function firstSnippet(text, pattern, radius = 90) {
  const match = pattern.exec(text);
  if (!match) return '';
  pattern.lastIndex = 0;
  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function summarizeFindings(findings) {
  const blockers = findings.filter((finding) => finding.severity === 'blocker').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const improvements = findings.filter((finding) => finding.severity === 'improvement').length;
  const acceptedRisks = findings.filter((finding) => finding.severity === 'risk').length;
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    blockers,
    warnings,
    improvements,
    acceptedRisks,
  };
}

function findDuplicateLessonLabels(courseMap) {
  const seen = new Map();
  const duplicates = [];
  for (const [index, lesson] of (courseMap?.lessons || []).entries()) {
    const normalized = String(lesson?.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const scheduleLabel = normalized.match(/\b(?:week|lesson|module|session)\s+\d+\b/)?.[0];
    if (!scheduleLabel) continue;
    if (seen.has(scheduleLabel)) duplicates.push({ label: scheduleLabel, firstIndex: seen.get(scheduleLabel), index });
    else seen.set(scheduleLabel, index);
  }
  return duplicates;
}

function hasVisibleAssessmentValue(value) {
  return collectStrings(value).some((text) => String(text || '').trim().length > 0);
}

function lessonHasAssessmentEvidence(lesson) {
  const sections = Array.isArray(lesson?.sections) && lesson.sections.length > 0 ? lesson.sections : [lesson];
  return sections.some((section) => {
    if (section && typeof section === 'object') {
      const assessmentEntry = Object.entries(section).find(([key]) => /assessment|quiz|exam|rubric|grading/i.test(key));
      if (assessmentEntry) return hasVisibleAssessmentValue(assessmentEntry[1]);
    }
    return collectStrings(section).some((value) =>
      /\b(?:assessment|quiz|exam|rubric|problem set|proof exercise|recording|dialogue check|oral description|performance|memo|brief|checkpoint|package)\b/i.test(
        value,
      ),
    );
  });
}

function cloneCourseMap(courseMap) {
  return JSON.parse(JSON.stringify(courseMap || {}));
}

function roundId(value) {
  return String(value).padStart(3, '0');
}

export function generateSelfImprovementFixtures({
  fixtures = DEFAULT_SELF_IMPROVEMENT_FIXTURES,
  rounds = fixtures.length,
} = {}) {
  const selected = Array.isArray(fixtures) && fixtures.length > 0 ? fixtures : DEFAULT_SELF_IMPROVEMENT_FIXTURES;
  const targetRounds = Math.max(1, Number(rounds) || selected.length);
  return Array.from({ length: targetRounds }, (_, index) => {
    const base = selected[index % selected.length];
    const isAnchorRound = index < selected.length;
    const mutation = isAnchorRound
      ? ADVERSARIAL_MUTATIONS[0]
      : ADVERSARIAL_MUTATIONS[((index - selected.length) % (ADVERSARIAL_MUTATIONS.length - 1)) + 1];
    const courseMap = cloneCourseMap(base.courseMap);
    mutation.apply(courseMap, index + 1);
    return {
      ...base,
      id: isAnchorRound ? base.id : `${base.id}--round-${roundId(index + 1)}--${mutation.id}`,
      title: isAnchorRound ? base.title : `${base.title} (${mutation.label})`,
      focus: isAnchorRound ? base.focus : `${base.focus}; generated mutation: ${mutation.label}`,
      sourceFixtureId: base.sourceFixtureId || base.id,
      mutation: {
        id: mutation.id,
        label: mutation.label,
        expectedCriticSignal: mutation.expectedCriticSignal,
      },
      roundNumber: index + 1,
      generated: !isAnchorRound,
      courseMap,
    };
  });
}

function patternMatches(pattern, text) {
  if (!pattern) return false;
  if (typeof pattern === 'string') return String(text || '').includes(pattern);
  const flags = pattern.flags.replace(/g/g, '');
  return new RegExp(pattern.source, flags).test(text);
}

function patternLabel(pattern) {
  return pattern?.source ? `/${pattern.source}/` : String(pattern || '');
}

function patternArray(patterns) {
  if (!patterns) return [];
  return Array.isArray(patterns) ? patterns : [patterns];
}

function valuesAtStructuredPath(value, path) {
  if (!path) return [];
  const tokens = String(path).split('.');
  return tokens.reduce(
    (items, rawToken) => {
      const arrayToken = rawToken.endsWith('[]');
      const token = arrayToken ? rawToken.slice(0, -2) : rawToken;
      return items.flatMap((item) => {
        if (item === null || item === undefined) return [];
        if (Array.isArray(item)) return item.flatMap((child) => valuesAtStructuredPath(child, rawToken));
        if (typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(item, token)) return [];
        const next = item[token];
        if (arrayToken) return Array.isArray(next) ? next : next === undefined || next === null ? [] : [next];
        return [next];
      });
    },
    [value],
  );
}

function hasInspectableStructuredValue(value) {
  return collectStrings(value).some((text) => String(text || '').trim().length > 0);
}

function evidenceRequirementMatches(requirement = {}, data, text) {
  const pathMatched = (requirement.paths || []).some((path) =>
    valuesAtStructuredPath(data, path).some((value) => hasInspectableStructuredValue(value)),
  );
  if (pathMatched) return true;
  return patternArray(requirement.patterns).some((pattern) => patternMatches(pattern, text));
}

function evidenceRequirementLabel(requirement = {}) {
  if (requirement.label) return requirement.label;
  const pathLabel =
    Array.isArray(requirement.paths) && requirement.paths.length > 0 ? requirement.paths.join(' or ') : '';
  const patternLabelText = patternArray(requirement.patterns).map(patternLabel).join(' or ');
  return [pathLabel, patternLabelText].filter(Boolean).join(' or ') || requirement.id || 'required evidence';
}

function clampScore(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

function roundScoreDelta(score) {
  if (!Number.isFinite(score)) return 0;
  return Math.round(score * 10) / 10;
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function uniqueWordRatio(text) {
  const words = String(text || '')
    .toLowerCase()
    .match(/\b[a-z][a-z0-9-]{2,}\b/g);
  if (!words || words.length === 0) return 1;
  return new Set(words).size / words.length;
}

function severityCount(findings, severity) {
  return findings.filter((finding) => finding.severity === severity).length;
}

function checkCount(findings, check) {
  return findings.filter((finding) => finding.check === check).length;
}

function scoreSelfImprovementFixture({ fixture, compiledFeatures = [], compiledText = '', findings = [] }) {
  const courseMap = fixture.courseMap || {};
  const lessons = Array.isArray(courseMap.lessons) ? courseMap.lessons : [];
  const lessonCount = lessons.length || 1;
  const expectedSignals = fixture.expectedReviewSignals || [];
  const matchedExpectedSignals = expectedSignals.filter((signal) =>
    patternMatches(signal.pattern, compiledText),
  ).length;
  const expectedSignalScore =
    expectedSignals.length > 0 ? (matchedExpectedSignals / expectedSignals.length) * 100 : 100;
  const missingAssessmentCount = lessons.filter((lesson) => !lessonHasAssessmentEvidence(lesson)).length;
  const duplicateScheduleCount = findDuplicateLessonLabels(courseMap).length;
  const genericStudentFacingCount = STUDENT_FACING_REPAIR_RULES.reduce(
    (sum, rule) => sum + countMatches(compiledText, rule.pattern),
    0,
  );
  const forbiddenSignalCount = (fixture.forbiddenCompiledSignals || []).reduce(
    (sum, signal) => sum + countMatches(compiledText, signal.pattern),
    0,
  );
  const blockerCount = severityCount(findings, 'blocker');
  const warningCount = severityCount(findings, 'warning');
  const improvementCount = severityCount(findings, 'improvement');
  const timingBlockers = findings.filter(
    (finding) => finding.check === 'timing-workload' && finding.severity === 'blocker',
  ).length;
  const timingWarnings = findings.filter(
    (finding) => finding.check === 'timing-workload' && finding.severity === 'warning',
  ).length;
  const timingImprovements = findings.filter(
    (finding) => finding.check === 'timing-workload' && finding.severity === 'improvement',
  ).length;
  const validatorOrPublishabilityIssues =
    checkCount(findings, 'validator') +
    checkCount(findings, 'publishability') +
    checkCount(findings, 'compiled-feature');
  const featureCoverageScore =
    PIPELINE_FEATURES.length > 0 ? (compiledFeatures.length / PIPELINE_FEATURES.length) * 100 : 100;

  const scores = {
    specificity: clampScore(
      95 - genericStudentFacingCount * 15 - (expectedSignals.length - matchedExpectedSignals) * 18,
    ),
    sourceGrounding: clampScore(80 + expectedSignalScore * 0.2 - genericStudentFacingCount * 10 - blockerCount * 15),
    assessmentFit: clampScore(100 - (missingAssessmentCount / lessonCount) * 70),
    workloadRealism: clampScore(100 - timingBlockers * 30 - timingWarnings * 12 - timingImprovements * 5),
    sequencing: clampScore(100 - duplicateScheduleCount * 18 - (lessonCount < 3 ? 20 : 0)),
    studentUsability: clampScore(100 - validatorOrPublishabilityIssues * 25 - genericStudentFacingCount * 12),
    instructorTrust: clampScore(88 + expectedSignalScore * 0.12 - blockerCount * 20 - warningCount * 8),
    artifactPolish: clampScore(100 - genericStudentFacingCount * 14 - forbiddenSignalCount * 30 - improvementCount * 2),
  };
  const severityPenalty = blockerCount * 10 + warningCount * 4 + improvementCount * 2;
  const overall = clampScore(average(QUALITY_SCORE_CATEGORIES.map((category) => scores[category])) - severityPenalty);

  return {
    overall,
    categories: scores,
    rubricVersion: 1,
    evidence: {
      expectedSignals: expectedSignals.length,
      matchedExpectedSignals,
      missingAssessmentCount,
      duplicateScheduleCount,
      genericStudentFacingCount,
      forbiddenSignalCount,
      featureCoverageScore: clampScore(featureCoverageScore),
    },
  };
}

function buildCriticReview({ findings = [], qualityScores, expertQualityReview = null }) {
  const repairFindings = findings.filter((finding) => finding.severity !== 'risk');
  const acceptedInputRisks = findings.filter((finding) => finding.severity === 'risk');
  const expertBlindSpotRisk =
    repairFindings.length === 0 &&
    expertQualityReview &&
    (expertQualityReview.overall < 8.5 || expertQualityReview.lowDimensionCount > 0);
  const blindSpotRisk = repairFindings.length === 0 && (qualityScores.overall < 82 || expertBlindSpotRisk);
  let verdict = 'clean';
  if (repairFindings.length > 0) verdict = 'actionable-repair-candidates';
  else if (blindSpotRisk) verdict = 'critic-blind-spot-watch';
  else if (acceptedInputRisks.length > 0) verdict = 'clean-output-with-input-risks';
  return {
    verdict,
    realFindingCount: repairFindings.length,
    acceptedInputRiskCount: acceptedInputRisks.length,
    falsePositiveWatchCount: 0,
    blindSpotRisk,
    scoreFloor: qualityScores.overall,
    expertScoreFloor: expertQualityReview?.overall ?? null,
    nextAction:
      verdict === 'actionable-repair-candidates'
        ? 'Repair the highest-severity finding or add a narrower regression check.'
        : verdict === 'critic-blind-spot-watch'
          ? 'Improve the critic or compiler so low expert-quality rounds produce actionable findings.'
          : acceptedInputRisks.length > 0
            ? 'Treat input risks as local-review boundaries unless they leak into compiled deliverables.'
            : 'No repair candidate for this round.',
  };
}

function patchAreaForResult(result, repairFindings) {
  if (repairFindings[0]?.owner) return repairFindings[0].owner;
  if (repairFindings[0]?.check) return repairFindings[0].check;
  if (result.acceptedRisks > 0) return 'input-local-review-boundary';
  return 'none';
}

function buildRoundLedgerEntry(result, baselineScores = new Map()) {
  const repairFindings = result.findings.filter((finding) => finding.severity !== 'risk');
  const baselineQualityScore = baselineScores.get(result.sourceFixtureId) ?? result.qualityScore;
  return {
    round: result.roundNumber,
    fixtureId: result.fixtureId,
    sourceFixtureId: result.sourceFixtureId,
    mutationId: result.mutation?.id || 'base-repeat',
    mutationLabel: result.mutation?.label || 'Base fixture replay',
    expectedCriticSignal: result.mutation?.expectedCriticSignal || 'regression guard',
    status: result.status,
    qualityScore: result.qualityScore,
    expertQualityScore: result.expertQualityReview?.overall ?? null,
    expertQualityVerdict: result.expertQualityReview?.verdict || 'unknown',
    activeDomains: result.expertQualityReview?.activeDomains || [],
    baselineQualityScore,
    qualityDeltaFromSource: roundScoreDelta(result.qualityScore - baselineQualityScore),
    criticVerdict: result.criticReview.verdict,
    patchArea: patchAreaForResult(result, repairFindings),
    repairCandidateCount: repairFindings.length,
    acceptedInputRiskCount: result.acceptedRisks,
    topRepairCandidate:
      repairFindings[0] && `${repairFindings[0].check}/${repairFindings[0].severity}: ${repairFindings[0].message}`,
  };
}

function priorityRank(priority) {
  return priority === 'P0' ? 0 : priority === 'P1' ? 1 : priority === 'P2' ? 2 : 3;
}

function findingPriority(finding) {
  if (finding.severity === 'blocker') return 'P0';
  if (finding.severity === 'warning') return 'P1';
  if (finding.severity === 'improvement') return 'P2';
  return 'P3';
}

function actionTargetFiles(finding = {}) {
  if (finding.check === 'student-facing-specificity') {
    return ['src/lib/courseBlueprintCompiler.js', 'scripts/internalSelfImprovementAudit.mjs'];
  }
  if (finding.check === 'timing-workload') {
    return ['src/lib/courseBlueprintCompiler.js', 'scripts/internalSelfImprovementAudit.mjs'];
  }
  if (finding.check === 'review-boundary' || finding.check === 'discipline-fit') {
    return ['src/lib/courseBlueprintCompiler.js', 'scripts/internalSelfImprovementAudit.mjs'];
  }
  if (
    finding.check === 'expert-quality-rubric' ||
    finding.check === 'real-deliverable-quality' ||
    finding.check === 'domain-specific-quality'
  ) {
    return ['src/lib/courseBlueprintCompiler.js', 'scripts/internalSelfImprovementAudit.mjs'];
  }
  if (finding.check === 'export-package-quality') {
    return [
      'src/lib/packageZipExporter.js',
      'src/lib/packageExportVerifier.js',
      'scripts/internalSelfImprovementAudit.mjs',
    ];
  }
  if (finding.check === 'validator' || finding.check === 'publishability' || finding.check === 'compiled-feature') {
    return ['src/lib/courseBlueprintCompiler.js'];
  }
  return ['scripts/internalSelfImprovementAudit.mjs'];
}

function actionCommands() {
  return [
    'npm run audit:self:100',
    'npm run audit:self:500',
    'npx vitest run scripts/__tests__/internalSelfImprovementAudit.test.js',
    'npm run audit:pipeline',
  ];
}

function buildRepairActions(results = []) {
  const grouped = new Map();
  for (const result of results) {
    for (const finding of result.findings || []) {
      if (finding.severity === 'risk') continue;
      const key = `${finding.check}:${finding.owner || finding.category || 'core'}`;
      const current = grouped.get(key) || {
        id: `repair-${key
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()}`,
        type: 'repair-code',
        status: 'required',
        priority: findingPriority(finding),
        targetArea: finding.owner || finding.check,
        targetFiles: actionTargetFiles(finding),
        affectedRounds: [],
        evidence: [],
        acceptanceCriteria: [],
        commands: actionCommands(),
      };
      if (priorityRank(findingPriority(finding)) < priorityRank(current.priority))
        current.priority = findingPriority(finding);
      current.affectedRounds.push(result.roundNumber);
      current.evidence.push({
        fixtureId: result.fixtureId,
        check: finding.check,
        severity: finding.severity,
        message: finding.message,
        repairPath: finding.repairPath || null,
      });
      if (finding.repairPath && !current.acceptanceCriteria.includes(finding.repairPath)) {
        current.acceptanceCriteria.push(finding.repairPath);
      }
      grouped.set(key, current);
    }
  }
  return Array.from(grouped.values()).map((action) => ({
    ...action,
    affectedRounds: Array.from(new Set(action.affectedRounds)).sort((a, b) => a - b),
    targetFiles: Array.from(new Set(action.targetFiles)),
    acceptanceCriteria:
      action.acceptanceCriteria.length > 0
        ? action.acceptanceCriteria
        : ['The cited finding no longer appears in the 100-round self-improvement audit.'],
  }));
}

function buildCriticActions({ results = [], roundLedger = [] }) {
  const actions = [];
  const blindSpotRounds = results.filter((result) => result.criticReview?.blindSpotRisk);
  if (blindSpotRounds.length > 0) {
    actions.push({
      id: 'improve-critic-low-score-blind-spots',
      type: 'improve-critic',
      status: 'required',
      priority: 'P1',
      targetArea: 'critic',
      targetFiles: [
        'scripts/internalSelfImprovementAudit.mjs',
        'scripts/__tests__/internalSelfImprovementAudit.test.js',
      ],
      affectedRounds: blindSpotRounds.map((result) => result.roundNumber),
      evidence: blindSpotRounds.map((result) => ({
        fixtureId: result.fixtureId,
        qualityScore: result.qualityScore,
        criticVerdict: result.criticReview.verdict,
      })),
      acceptanceCriteria: [
        'Low-scoring rounds either produce an actionable repair candidate or improve above the blind-spot floor.',
      ],
      commands: actionCommands(),
    });
  }

  const concerningDeltas = roundLedger.filter(
    (entry) =>
      entry.qualityDeltaFromSource <= AUTONOMOUS_ENGINE_POLICY.concerningDelta && entry.repairCandidateCount === 0,
  );
  if (concerningDeltas.length > 0) {
    actions.push({
      id: 'improve-critic-score-delta-without-repair',
      type: 'improve-critic',
      status: 'required',
      priority: 'P2',
      targetArea: 'critic',
      targetFiles: [
        'scripts/internalSelfImprovementAudit.mjs',
        'scripts/__tests__/internalSelfImprovementAudit.test.js',
      ],
      affectedRounds: concerningDeltas.map((entry) => entry.round),
      evidence: concerningDeltas.map((entry) => ({
        fixtureId: entry.fixtureId,
        mutationId: entry.mutationId,
        qualityDeltaFromSource: entry.qualityDeltaFromSource,
        qualityScore: entry.qualityScore,
      })),
      acceptanceCriteria: [
        'Large score drops without repair candidates are explained as accepted input risks or converted into critic findings.',
      ],
      commands: actionCommands(),
    });
  }

  return actions;
}

function buildCoverageActions({ summary = {}, roundLedger = [] }) {
  const mutationCount = new Set(roundLedger.map((entry) => entry.mutationId)).size;
  const actions = [];
  if ((summary.roundCount || 0) < AUTONOMOUS_ENGINE_POLICY.fullAutonomyRoundFloor) {
    actions.push({
      id: 'expand-run-to-100-rounds',
      type: 'expand-run',
      status: 'required',
      priority: 'P1',
      targetArea: 'coverage',
      targetFiles: ['package.json', 'scripts/internalSelfImprovementAudit.mjs'],
      affectedRounds: [],
      evidence: [
        {
          roundCount: summary.roundCount || 0,
          requiredRoundCount: AUTONOMOUS_ENGINE_POLICY.fullAutonomyRoundFloor,
        },
      ],
      acceptanceCriteria: ['Run `npm run audit:self:100` and produce a 100-line `latest-ledger.jsonl`.'],
      commands: ['npm run audit:self:100'],
    });
  } else if ((summary.roundCount || 0) < AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor) {
    actions.push({
      id: 'run-larger-loop-to-500-rounds',
      type: 'expand-run',
      status: 'required',
      priority: 'P2',
      targetArea: 'coverage',
      targetFiles: ['package.json', 'scripts/internalSelfImprovementAudit.mjs'],
      affectedRounds: [],
      evidence: [
        {
          roundCount: summary.roundCount || 0,
          requiredRoundCount: AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor,
        },
      ],
      acceptanceCriteria: ['Run `npm run audit:self:500` and produce a 500-line `latest-ledger.jsonl`.'],
      commands: ['npm run audit:self:500'],
    });
  }
  if (mutationCount < AUTONOMOUS_ENGINE_POLICY.mutationFamilyFloor) {
    actions.push({
      id: 'expand-mutation-library',
      type: 'expand-mutations',
      status: 'required',
      priority: 'P2',
      targetArea: 'mutation-library',
      targetFiles: [
        'scripts/internalSelfImprovementAudit.mjs',
        'scripts/__tests__/internalSelfImprovementAudit.test.js',
      ],
      affectedRounds: [],
      evidence: [
        {
          mutationFamilyCount: mutationCount,
          requiredMutationFamilyCount: AUTONOMOUS_ENGINE_POLICY.mutationFamilyFloor,
        },
      ],
      acceptanceCriteria: [
        'The 100-round ledger includes enough distinct mutation families to cover the policy floor.',
      ],
      commands: actionCommands(),
    });
  }
  return actions;
}

function buildInputBoundaryActions(summary = {}) {
  if ((summary.acceptedRisks || 0) === 0) return [];
  return [
    {
      id: 'track-input-local-review-boundaries',
      type: 'track-input-boundaries',
      status: 'tracked',
      priority: 'P3',
      targetArea: 'input-local-review-boundary',
      targetFiles: [],
      affectedRounds: [],
      evidence: [{ acceptedRisks: summary.acceptedRisks }],
      acceptanceCriteria: [
        'Accepted input risks remain visible as local-review boundaries and do not become compiled-output repair candidates.',
      ],
      commands: ['npm run audit:self:100'],
    },
  ];
}

function buildHarderJudgeActions(summary = {}) {
  const actions = [];
  if ((summary.packageInspectionFailedSampleCount || 0) > 0) {
    actions.push({
      id: 'repair-export-package-integrity',
      type: 'repair-code',
      status: 'required',
      priority: 'P0',
      targetArea: 'export-package-quality',
      targetFiles: [
        'src/lib/packageZipExporter.js',
        'src/lib/packageExportVerifier.js',
        'scripts/internalSelfImprovementAudit.mjs',
      ],
      affectedRounds: [],
      evidence: [
        {
          packageInspectionStatus: summary.packageInspectionStatus,
          failedSampleCount: summary.packageInspectionFailedSampleCount,
        },
      ],
      acceptanceCriteria: ['Sampled full-package assembly has zero failed package-integrity samples.'],
      commands: ['npm run audit:self:100', 'npm run audit:self:500'],
    });
  } else if ((summary.packageInspectionWarningSampleCount || 0) > 0) {
    actions.push({
      id: 'repair-export-package-warnings',
      type: 'repair-code',
      status: 'required',
      priority: 'P1',
      targetArea: 'export-package-quality',
      targetFiles: [
        'src/lib/packageZipExporter.js',
        'src/lib/packageExportVerifier.js',
        'scripts/internalSelfImprovementAudit.mjs',
      ],
      affectedRounds: [],
      evidence: [
        {
          packageInspectionStatus: summary.packageInspectionStatus,
          warningSampleCount: summary.packageInspectionWarningSampleCount,
        },
      ],
      acceptanceCriteria: ['Sampled full-package assembly has zero warning package-integrity samples.'],
      commands: ['npm run audit:self:100', 'npm run audit:self:500'],
    });
  }
  return actions;
}

function requiredActionIds(payload = {}) {
  return (payload.autonomousDecision?.actions?.required || []).map((action) => action.id).sort();
}

function mutationFamilyIds(payload = {}) {
  return Array.from(new Set((payload.roundLedger || []).map((entry) => entry.mutationId).filter(Boolean))).sort();
}

function numericDelta(current, previous) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber)) return null;
  return roundScoreDelta(currentNumber - previousNumber);
}

function buildTrendRecommendation({
  currentPayload = {},
  newRequiredActionIds = [],
  deltas = {},
  mutationCoverage = {},
}) {
  const decision = currentPayload.autonomousDecision || {};
  const requiredActions = decision.actions?.required || [];
  const requiredTypes = new Set(requiredActions.map((action) => action.type));
  const roundCount = currentPayload.summary?.roundCount || 0;

  if (requiredTypes.has('repair-code')) {
    return {
      nextAction: 'repair-code',
      rationale: 'The latest run has compiled-output repair actions.',
    };
  }
  if (requiredTypes.has('improve-critic')) {
    return {
      nextAction: 'improve-critic',
      rationale: 'The latest run has low-score or score-delta cases the critic must explain.',
    };
  }
  if (
    requiredTypes.has('expand-mutations') ||
    mutationCoverage.currentCount < AUTONOMOUS_ENGINE_POLICY.mutationFamilyFloor
  ) {
    return {
      nextAction: 'expand-mutations',
      rationale: 'The mutation coverage remains below the autonomous policy floor.',
    };
  }
  if (requiredTypes.has('expand-run') || roundCount < AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor) {
    return {
      nextAction: 'keep-running',
      rationale: 'The engine has not yet completed the larger confidence run.',
    };
  }
  if (newRequiredActionIds.length > 0) {
    return {
      nextAction: 'repair-code',
      rationale: 'The latest run introduced new required autonomous actions.',
    };
  }
  if (deltas.minQualityScoreDelta !== null && deltas.minQualityScoreDelta <= AUTONOMOUS_ENGINE_POLICY.concerningDelta) {
    return {
      nextAction: 'improve-critic',
      rationale: 'The score floor regressed enough to require critic or scorer review.',
    };
  }
  return {
    nextAction: 'stop',
    rationale: 'The latest larger run has no new required actions and no concerning quality regression.',
  };
}

export function buildRunTrend({ previousPayload = null, currentPayload = {} } = {}) {
  const currentSummary = currentPayload.summary || {};
  const currentMutationIds = mutationFamilyIds(currentPayload);
  const currentRequiredActionIds = requiredActionIds(currentPayload);
  if (!previousPayload) {
    return {
      hasPrevious: false,
      previousGeneratedAt: null,
      currentGeneratedAt: currentPayload.meta?.generatedAt || null,
      deltas: null,
      categoryDeltas: {},
      expertDimensionDeltas: {},
      actions: {
        previousRequiredActionIds: [],
        currentRequiredActionIds,
        newRequiredActionIds: currentRequiredActionIds,
        resolvedRequiredActionIds: [],
        persistingRequiredActionIds: [],
      },
      mutationCoverage: {
        previousCount: 0,
        currentCount: currentMutationIds.length,
        countDelta: currentMutationIds.length,
        newMutationFamilies: currentMutationIds,
        retiredMutationFamilies: [],
      },
      recommendation: {
        nextAction:
          currentSummary.roundCount < AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor ? 'keep-running' : 'stop',
        rationale:
          'No previous run was available, so this run becomes the trend baseline for the next autonomous comparison.',
      },
    };
  }

  const previousSummary = previousPayload.summary || {};
  const previousRequiredActionIds = requiredActionIds(previousPayload);
  const previousMutationIds = mutationFamilyIds(previousPayload);
  const previousActionSet = new Set(previousRequiredActionIds);
  const currentActionSet = new Set(currentRequiredActionIds);
  const previousMutationSet = new Set(previousMutationIds);
  const currentMutationSet = new Set(currentMutationIds);
  const newRequiredActionIds = currentRequiredActionIds.filter((id) => !previousActionSet.has(id));
  const resolvedRequiredActionIds = previousRequiredActionIds.filter((id) => !currentActionSet.has(id));
  const persistingRequiredActionIds = currentRequiredActionIds.filter((id) => previousActionSet.has(id));
  const deltas = {
    roundCountDelta: numericDelta(currentSummary.roundCount, previousSummary.roundCount),
    generatedRoundCountDelta: numericDelta(currentSummary.generatedRoundCount, previousSummary.generatedRoundCount),
    averageQualityScoreDelta: numericDelta(currentSummary.averageQualityScore, previousSummary.averageQualityScore),
    minQualityScoreDelta: numericDelta(currentSummary.minQualityScore, previousSummary.minQualityScore),
    averageExpertQualityScoreDelta: numericDelta(
      currentSummary.averageExpertQualityScore,
      previousSummary.averageExpertQualityScore,
    ),
    minExpertQualityScoreDelta: numericDelta(
      currentSummary.minExpertQualityScore,
      previousSummary.minExpertQualityScore,
    ),
    repairCandidateCountDelta: numericDelta(currentSummary.repairCandidateCount, previousSummary.repairCandidateCount),
    requiredActionCountDelta: numericDelta(currentRequiredActionIds.length, previousRequiredActionIds.length),
    mutationFamilyCountDelta: numericDelta(currentMutationIds.length, previousMutationIds.length),
  };
  const categoryDeltas = Object.fromEntries(
    QUALITY_SCORE_CATEGORIES.map((category) => [
      category,
      numericDelta(currentSummary.categoryAverages?.[category], previousSummary.categoryAverages?.[category]),
    ]),
  );
  const expertDimensionDeltas = Object.fromEntries(
    HARDER_JUDGE_DIMENSIONS.map((dimension) => [
      dimension,
      numericDelta(
        currentSummary.expertDimensionAverages?.[dimension],
        previousSummary.expertDimensionAverages?.[dimension],
      ),
    ]),
  );
  const mutationCoverage = {
    previousCount: previousMutationIds.length,
    currentCount: currentMutationIds.length,
    countDelta: currentMutationIds.length - previousMutationIds.length,
    newMutationFamilies: currentMutationIds.filter((id) => !previousMutationSet.has(id)),
    retiredMutationFamilies: previousMutationIds.filter((id) => !currentMutationSet.has(id)),
  };

  return {
    hasPrevious: true,
    previousGeneratedAt: previousPayload.meta?.generatedAt || null,
    currentGeneratedAt: currentPayload.meta?.generatedAt || null,
    deltas,
    categoryDeltas,
    expertDimensionDeltas,
    actions: {
      previousRequiredActionIds,
      currentRequiredActionIds,
      newRequiredActionIds,
      resolvedRequiredActionIds,
      persistingRequiredActionIds,
    },
    mutationCoverage,
    recommendation: buildTrendRecommendation({
      currentPayload,
      newRequiredActionIds,
      deltas,
      mutationCoverage,
    }),
  };
}

function buildStoppingRule({ summary = {}, requiredActions = [], trend = null, mutationFamilyCount = 0 } = {}) {
  const roundCount = summary.roundCount || 0;
  const minQualityScore = Number(summary.minQualityScore || 0);
  const minExpertQualityScore = Number(summary.minExpertQualityScore || 0);
  const repairCandidateCount = summary.repairCandidateCount || 0;
  const newRequiredActionIds = trend?.actions?.newRequiredActionIds || [];
  const minQualityDelta = trend?.deltas?.minQualityScoreDelta;
  const minExpertQualityDelta = trend?.deltas?.minExpertQualityScoreDelta;
  const averageQualityDelta = trend?.deltas?.averageQualityScoreDelta;

  if (requiredActions.length > 0) {
    const firstAction = requiredActions[0];
    return {
      stopRecommended: false,
      nextAction:
        firstAction.type === 'expand-mutations'
          ? 'expand-mutations'
          : firstAction.type === 'expand-run'
            ? 'keep-running'
            : firstAction.type,
      reason: `Required autonomous action remains: ${firstAction.id}.`,
    };
  }
  if (roundCount < AUTONOMOUS_ENGINE_POLICY.fullAutonomyRoundFloor) {
    return {
      stopRecommended: false,
      nextAction: 'keep-running',
      reason: `Run at least ${AUTONOMOUS_ENGINE_POLICY.fullAutonomyRoundFloor} rounds before trusting the loop.`,
    };
  }
  if (roundCount < AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor) {
    return {
      stopRecommended: false,
      nextAction: 'keep-running',
      reason: `Run ${AUTONOMOUS_ENGINE_POLICY.scaleConfidenceRoundFloor} rounds before declaring scaled stability.`,
    };
  }
  if (mutationFamilyCount < AUTONOMOUS_ENGINE_POLICY.mutationFamilyFloor) {
    return {
      stopRecommended: false,
      nextAction: 'expand-mutations',
      reason: 'Mutation coverage is below the autonomous policy floor.',
    };
  }
  if (repairCandidateCount > 0) {
    return {
      stopRecommended: false,
      nextAction: 'repair-code',
      reason: 'Repair candidates remain in the latest run.',
    };
  }
  if (minQualityScore < AUTONOMOUS_ENGINE_POLICY.qualityFloor) {
    return {
      stopRecommended: false,
      nextAction: 'improve-critic',
      reason: 'The score floor is below the autonomous quality policy.',
    };
  }
  if (minExpertQualityScore < 8.5) {
    return {
      stopRecommended: false,
      nextAction: repairCandidateCount > 0 ? 'repair-code' : 'improve-critic',
      reason: 'The expert-style quality floor is below the harder judge policy.',
    };
  }
  if (!trend?.hasPrevious) {
    return {
      stopRecommended: false,
      nextAction: 'keep-running',
      reason: 'A previous run is required before the engine can make a trend-backed stop decision.',
    };
  }
  if (newRequiredActionIds.length > 0) {
    return {
      stopRecommended: false,
      nextAction: trend.recommendation?.nextAction || 'repair-code',
      reason: `New required actions appeared: ${newRequiredActionIds.join(', ')}.`,
    };
  }
  if (minQualityDelta !== null && minQualityDelta <= AUTONOMOUS_ENGINE_POLICY.concerningDelta) {
    return {
      stopRecommended: false,
      nextAction: 'improve-critic',
      reason: 'The score floor regressed beyond the concerning-delta threshold.',
    };
  }
  if (minExpertQualityDelta !== null && minExpertQualityDelta < AUTONOMOUS_ENGINE_POLICY.trendRegressionTolerance) {
    return {
      stopRecommended: false,
      nextAction: 'improve-critic',
      reason: 'The expert-style score floor regressed beyond the trend tolerance.',
    };
  }
  if (averageQualityDelta !== null && averageQualityDelta < AUTONOMOUS_ENGINE_POLICY.trendRegressionTolerance) {
    return {
      stopRecommended: false,
      nextAction: 'improve-critic',
      reason: 'Average quality regressed beyond the trend tolerance.',
    };
  }
  return {
    stopRecommended: true,
    nextAction: 'stop',
    reason: 'The larger run met score, mutation, action, and trend-stability gates.',
  };
}

export function buildAutonomousQualityDecision({ summary = {}, results = [], roundLedger = [], trend = null } = {}) {
  const repairActions = buildRepairActions(results);
  const criticActions = buildCriticActions({ results, roundLedger });
  const coverageActions = buildCoverageActions({ summary, roundLedger });
  const harderJudgeActions = buildHarderJudgeActions(summary);
  const inputBoundaryActions = buildInputBoundaryActions(summary);
  const requiredActions = [...repairActions, ...criticActions, ...harderJudgeActions, ...coverageActions].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id),
  );
  const trackedActions = inputBoundaryActions;
  const minQualityScore = Number(summary.minQualityScore || 0);
  const mutationFamilyCount = new Set(roundLedger.map((entry) => entry.mutationId)).size;
  const stoppingRule = buildStoppingRule({ summary, requiredActions, trend, mutationFamilyCount });
  let status = 'quality-green';
  let nextAction = stoppingRule.nextAction;
  let rationale = stoppingRule.reason;

  if (repairActions.length > 0) {
    status = 'repair-required';
    nextAction = 'repair-code';
    rationale =
      'The critic found compiled-output repair candidates that should be fixed before treating the run as green.';
  } else if (criticActions.length > 0) {
    status = 'critic-improvement-required';
    nextAction = 'improve-critic';
    rationale = 'The scorer found weak or degraded rounds that the critic did not convert into actionable findings.';
  } else if (harderJudgeActions.length > 0) {
    status = 'repair-required';
    nextAction = 'repair-code';
    rationale = 'The harder judge found package-level quality issues in sampled full-package assembly.';
  } else if (coverageActions.length > 0) {
    status = 'coverage-expansion-required';
    nextAction = coverageActions[0]?.type === 'expand-mutations' ? 'expand-mutations' : 'keep-running';
    rationale = 'The run does not yet meet the autonomous coverage policy.';
  } else if (minQualityScore < AUTONOMOUS_ENGINE_POLICY.qualityFloor) {
    status = 'quality-watch';
    nextAction = 'improve-critic';
    rationale = 'The run is passing, but the score floor is below the autonomous quality policy.';
  }

  return {
    version: 1,
    status,
    nextAction,
    rationale,
    requiresHumanInterpretation: false,
    policy: AUTONOMOUS_ENGINE_POLICY,
    gate: {
      passed:
        status === 'quality-green' &&
        stoppingRule.stopRecommended &&
        (summary.blockers || 0) === 0 &&
        (summary.warnings || 0) === 0 &&
        (summary.repairCandidateCount || 0) === 0 &&
        !['failed', 'warnings'].includes(summary.packageInspectionStatus),
      roundCount: summary.roundCount || 0,
      mutationFamilyCount,
      minQualityScore,
      averageQualityScore: summary.averageQualityScore || 0,
      minExpertQualityScore: summary.minExpertQualityScore || 0,
      averageExpertQualityScore: summary.averageExpertQualityScore || 0,
      repairCandidateCount: summary.repairCandidateCount || 0,
      criticBlindSpotWatchCount: summary.criticBlindSpotWatchCount || 0,
      packageInspectionStatus: summary.packageInspectionStatus || 'unknown',
    },
    stoppingRule,
    trend: trend
      ? {
          hasPrevious: trend.hasPrevious,
          recommendation: trend.recommendation,
          deltas: trend.deltas,
          expertDimensionDeltas: trend.expertDimensionDeltas,
          newRequiredActionIds: trend.actions?.newRequiredActionIds || [],
          resolvedRequiredActionIds: trend.actions?.resolvedRequiredActionIds || [],
          mutationCoverage: trend.mutationCoverage,
        }
      : {
          hasPrevious: false,
          recommendation: {
            nextAction,
            rationale: 'No trend object was attached to this decision.',
          },
        },
    actions: {
      required: requiredActions,
      tracked: trackedActions,
    },
    executorHints: {
      command:
        nextAction === 'stop'
          ? 'npm run audit:self:100'
          : requiredActions[0]?.commands?.[0] || 'npm run audit:self:100',
      verificationCommands: Array.from(
        new Set(requiredActions.flatMap((action) => action.commands || []).concat('npm run audit:self:100')),
      ),
    },
  };
}

function auditInputRisks(fixture) {
  const findings = [];
  const courseMap = fixture.courseMap || {};
  const inputText = collectStrings(courseMap).join(' ');
  if (!courseMap.semester || /\b(?:tbd|unknown|placeholder)\b/i.test(courseMap.semester)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course has missing or placeholder official dates.', {
        path: 'courseMap.semester',
      }),
    );
  }

  const missingAssessmentLessons = (courseMap.lessons || [])
    .map((lesson, index) => ({
      index,
      title: lesson.title || `Lesson ${index + 1}`,
      hasAssessment: lessonHasAssessmentEvidence(lesson),
    }))
    .filter((row) => !row.hasAssessment);
  if (missingAssessmentLessons.length > 0) {
    findings.push(
      makeFinding(
        'risk',
        'input-risk',
        `${missingAssessmentLessons.length} lesson(s) lack visible assessment evidence.`,
        {
          lessons: missingAssessmentLessons.map((row) => row.title),
        },
      ),
    );
  }

  const duplicateLabels = findDuplicateLessonLabels(courseMap);
  if (duplicateLabels.length > 0) {
    findings.push(
      makeFinding(
        'risk',
        'input-risk',
        `Duplicate schedule labels need source-conflict review: ${duplicateLabels.map((row) => row.label).join(', ')}.`,
        {
          duplicateLabels,
        },
      ),
    );
  }

  if (
    /\b\d{4}-\d{2}-(?:00|3[2-9]|[4-9]\d)\b|\b2026-09-31\b|\b2026-02-30\b|final[^.]{0,60}before first class/i.test(
      inputText,
    )
  ) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains impossible or contradictory date structures.', {
        path: 'courseMap',
      }),
    );
  }

  if (/\b(?:legacy import|raw import|unknown column|\?\?\?|mismatched delimiter)\b/i.test(inputText)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains malformed import fragments that need local cleanup.', {
        path: 'courseMap.importNotes',
      }),
    );
  }

  if (/\b(?:rubric conflict|contradictory rubric|weights total 130|assessment description)\b/i.test(inputText)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains contradictory rubric or grading-weight evidence.', {
        path: 'courseMap.lessons.sections.rubric',
      }),
    );
  }

  if (/\b(?:six-hour|400 pages|12 deliverables|900 minutes|overloaded lesson)\b/i.test(inputText)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains overloaded lesson workload claims.', {
        path: 'courseMap.lessons.sections.activities',
      }),
    );
  }

  if (/\b(?:Spanish\/Mandarin\/French|mixed-language|translation boundaries)\b/i.test(inputText)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains multilingual mixed-language handoff requirements.', {
        path: 'courseMap.lessons.sections',
      }),
    );
  }

  if (/\b(?:lorem ipsum|\[insert [^\]]+\]|copy\/paste prior week|todo placeholder)\b/i.test(inputText)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains copied placeholder language in the source map.', {
        path: 'courseMap.lessons.sections',
      }),
    );
  }

  if (
    collectStrings([courseMap.courseName, ...(courseMap.lessons || []).map((lesson) => lesson.title)]).some((text) =>
      /[/:*?"<>|]/.test(text),
    )
  ) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course or lesson titles contain export-unsafe filename characters.', {
        path: 'courseMap.courseName/courseMap.lessons.title',
      }),
    );
  }

  const missingObjectiveLessons = (courseMap.lessons || [])
    .map((lesson, index) => ({
      index,
      title: lesson.title || `Lesson ${index + 1}`,
      missingObjectives: (Array.isArray(lesson.sections) ? lesson.sections : [lesson]).some(
        (section) =>
          section &&
          typeof section === 'object' &&
          Object.prototype.hasOwnProperty.call(section, 'objectives') &&
          String(section.objectives || '').trim().length === 0,
      ),
    }))
    .filter((row) => row.missingObjectives);
  if (missingObjectiveLessons.length > 0) {
    findings.push(
      makeFinding('risk', 'input-risk', `${missingObjectiveLessons.length} lesson(s) lack visible objectives.`, {
        lessons: missingObjectiveLessons.map((row) => row.title),
      }),
    );
  }

  if (
    /\b(?:quiz choices all use answer A|rubric repeats the same criterion|discussion prompt copied)\b/i.test(inputText)
  ) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course contains deliverable-specific weak spots that need review.', {
        path: 'courseMap.lessons.sections.assessment',
      }),
    );
  }

  return findings;
}

function compileFixture({ fixture, runtime, features }) {
  const courseMap = fixture.courseMap;
  const blueprint = runtime.buildCourseBlueprint(courseMap, {});
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(features || PIPELINE_FEATURES);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, { configMap: {} });
  return { blueprint, compiledFeatures, compiled };
}

function numericValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function lessonWorkloadMinutes(lesson = {}) {
  const workload = lesson.workloadEstimate || {};
  const direct = numericValue(
    workload.totalStudentMinutes,
    workload.totalMinutes,
    workload.studentMinutes,
    workload.totalWorkloadMinutes,
  );
  if (direct !== null) return direct;
  const parts = [
    workload.beforeClassMinutes,
    workload.inClassMinutes,
    workload.afterClassMinutes,
    workload.outOfClassMinutes,
  ]
    .map(Number)
    .filter(Number.isFinite);
  return parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null;
}

function lessonLiveMinutes(lesson = {}) {
  const session = lesson.classSessionPlan || {};
  const workload = lesson.workloadEstimate || {};
  return numericValue(
    session.plannedMinutes,
    session.totalMinutes,
    session.liveMinutes,
    workload.inClassMinutes,
    workload.plannedClassMinutes,
  );
}

function auditTimingWorkloadPlausibility(blueprint = {}) {
  const findings = [];
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];

  for (const lesson of lessons) {
    const lessonNumber = lesson.lessonNumber || lesson.weekNumber || null;
    const title = lesson.title || lesson.lessonTitle || `Lesson ${lessonNumber || '?'}`;
    const artifact = lesson.studentArtifact || lesson.assessmentArtifact || 'lesson artifact';
    const totalMinutes = lessonWorkloadMinutes(lesson);
    const liveMinutes = lessonLiveMinutes(lesson);
    const feasibilityStatus = String(lesson.classSessionPlan?.feasibilityStatus || '').toLowerCase();
    const detail = {
      lessonNumber,
      lessonTitle: title,
      artifact,
      invariant: 'Lesson timing must be plausible for the stated modality and workload.',
      repairPath: 'Adjust the lesson workload, split the lesson, or mark the schedule for local instructor review.',
    };

    if (totalMinutes === null || liveMinutes === null) {
      findings.push(
        makeFinding(
          'improvement',
          'timing-workload',
          `${title} is missing explicit workload or live-session timing evidence for ${artifact}.`,
          detail,
        ),
      );
      continue;
    }

    if (
      totalMinutes > 720 ||
      liveMinutes > 240 ||
      /\b(?:impossible|infeasible|overloaded|unworkable)\b/i.test(feasibilityStatus)
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'timing-workload',
          `${title} has implausible timing for ${artifact}: ${totalMinutes} total minutes and ${liveMinutes} live minutes.`,
          detail,
        ),
      );
    } else if (totalMinutes > 540 || liveMinutes > 180 || /\b(?:review|tight|heavy)\b/i.test(feasibilityStatus)) {
      findings.push(
        makeFinding(
          'warning',
          'timing-workload',
          `${title} has heavy timing for ${artifact}: ${totalMinutes} total minutes and ${liveMinutes} live minutes.`,
          detail,
        ),
      );
    }
  }

  return findings;
}

function auditSyntheticFacultyReview({ fixture, compiledText }) {
  const findings = [];

  for (const rule of STUDENT_FACING_REPAIR_RULES) {
    const count = countMatches(compiledText, rule.pattern);
    if (count === 0) continue;
    findings.push(
      makeFinding(
        'improvement',
        'student-facing-specificity',
        `${rule.label}: ${count} occurrence(s) found in compiled deliverables.`,
        {
          ruleId: rule.id,
          reviewerRole: 'synthetic faculty editor',
          category: 'specificity',
          owner: 'compiler',
          evidence: firstSnippet(compiledText, rule.pattern),
          repairPath: rule.repairPath,
        },
      ),
    );
  }

  for (const signal of fixture.forbiddenCompiledSignals || []) {
    const count = countMatches(compiledText, signal.pattern);
    if (count === 0) continue;
    findings.push(
      makeFinding(
        signal.severity || 'blocker',
        'discipline-fit',
        `Forbidden compiled signal: ${signal.label} (${count} occurrence(s)).`,
        {
          signalId: signal.id,
          reviewerRole: 'synthetic discipline reviewer',
          category: 'domain-fit',
          owner: 'compiler',
          evidence: firstSnippet(compiledText, signal.pattern),
          repairPath: signal.repairPath || 'Remove or replace discipline-inappropriate assets before release.',
        },
      ),
    );
  }

  return findings;
}

function inferCourseDomains(courseMap = {}) {
  const inputText = collectStrings(courseMap).join(' ');
  return DOMAIN_QUALITY_RULES.filter((rule) => rule.detect.test(inputText)).map((rule) => rule.id);
}

function featureCompletenessFinding(featureId, message, detail = {}) {
  return makeFinding('improvement', 'real-deliverable-quality', message, {
    featureId,
    reviewerRole: 'harder quality judge',
    category: detail.dimension || 'completeness',
    owner: 'compiler',
    repairPath:
      detail.repairPath ||
      'Improve the compiled deliverable so a real instructor can use it without filling in missing structure by hand.',
    ...detail,
  });
}

function auditRealDeliverableInspection({ fixture, compiledFeatures = [], compiled = {} }) {
  const findings = [];
  const courseMap = fixture.courseMap || {};
  const expectedLessonCount = Math.max(1, Array.isArray(courseMap.lessons) ? courseMap.lessons.length : 0);

  for (const featureId of compiledFeatures) {
    const rule = FEATURE_STRUCTURE_RULES[featureId];
    if (!rule) continue;
    const data = compiled?.[featureId];
    const text = collectStrings(data).join(' ');
    const charCount = text.trim().length;
    const itemCount = rule.itemCount(data);

    if (!data || charCount === 0) {
      findings.push(
        featureCompletenessFinding(featureId, `${FEATURE_LABELS[featureId] || featureId} has no inspectable text.`, {
          dimension: 'packageIntegrity',
        }),
      );
      continue;
    }

    if (charCount < rule.minChars) {
      findings.push(
        featureCompletenessFinding(
          featureId,
          `${FEATURE_LABELS[featureId] || featureId} is thin for real deliverable review (${charCount} characters).`,
          {
            charCount,
            expectedMinimum: rule.minChars,
            dimension: 'classroomUsefulness',
          },
        ),
      );
    }

    if (rule.perLesson && itemCount < expectedLessonCount) {
      findings.push(
        featureCompletenessFinding(
          featureId,
          `${FEATURE_LABELS[featureId] || featureId} covers ${itemCount}/${expectedLessonCount} expected lesson artifact(s).`,
          {
            itemCount,
            expectedLessonCount,
            dimension: 'packageIntegrity',
          },
        ),
      );
    }

    for (const requirement of rule.requiredEvidence || []) {
      if (evidenceRequirementMatches(requirement, data, text)) continue;
      findings.push(
        featureCompletenessFinding(
          featureId,
          `${FEATURE_LABELS[featureId] || featureId} is missing standards-backed evidence: ${evidenceRequirementLabel(
            requirement,
          )}.`,
          {
            dimension: requirement.dimension || 'classroomUsefulness',
            standardIds: requirement.standards || [],
            ruleId: requirement.id,
          },
        ),
      );
    }

    const ratio = uniqueWordRatio(text);
    if (charCount > 1200 && ratio < 0.03) {
      findings.push(
        featureCompletenessFinding(
          featureId,
          `${FEATURE_LABELS[featureId] || featureId} has low vocabulary variety for a generated deliverable.`,
          {
            uniqueWordRatio: roundScoreDelta(ratio),
            dimension: 'clarity',
            repairPath:
              'Reduce repetitive templated phrasing and add course-specific language where the source supports it.',
          },
        ),
      );
    }
  }

  return findings;
}

function auditShallowGenericOutput({ compiledText }) {
  const findings = [];
  for (const rule of SHALLOW_OUTPUT_RULES) {
    const count = countMatches(compiledText, rule.pattern);
    if (count <= rule.maxCount) continue;
    findings.push(
      makeFinding(
        'improvement',
        'expert-quality-rubric',
        `${rule.label}: ${count} occurrence(s), policy allows ${rule.maxCount}.`,
        {
          ruleId: rule.id,
          reviewerRole: 'expert-style output reviewer',
          category: rule.dimension,
          owner: 'compiler',
          evidence: firstSnippet(compiledText, rule.pattern),
          repairPath: rule.repairPath,
        },
      ),
    );
  }
  return findings;
}

function auditNearDuplicatePhrases({ compiledText }) {
  const words = String(compiledText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const counts = new Map();
  const phraseLength = 7;
  for (let index = 0; index <= words.length - phraseLength; index += 1) {
    const phrase = words.slice(index, index + phraseLength).join(' ');
    if (/\b(?:lesson|course|students?|evidence|assessment|rubric|question)\b/i.test(phrase)) {
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }
  const repeated = Array.from(counts.entries())
    .filter(([, count]) => count >= 50)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return repeated.map(([phrase, count]) =>
    makeFinding(
      'improvement',
      'expert-quality-rubric',
      `Near-duplicate phrase is repeated ${count} times across generated deliverables: "${phrase}".`,
      {
        ruleId: 'near-duplicate-generated-phrase',
        reviewerRole: 'expert-style output reviewer',
        category: 'clarity',
        owner: 'compiler',
        evidence: phrase,
        repairPath:
          'Reduce repeated templated phrases across deliverables; vary the instructional move or compress repeated source labels.',
      },
    ),
  );
}

function auditDomainSpecificQuality({ fixture, compiledText }) {
  const findings = [];
  const courseMap = fixture.courseMap || {};
  const inputText = collectStrings(courseMap).join(' ');

  for (const rule of DOMAIN_QUALITY_RULES) {
    if (!rule.detect.test(inputText)) continue;
    const matchedRequired = (rule.required || []).filter((pattern) => patternMatches(pattern, compiledText));
    if (matchedRequired.length < (rule.required || []).length) {
      findings.push(
        makeFinding(
          'improvement',
          'domain-specific-quality',
          `${rule.label} output is missing ${rule.required.length - matchedRequired.length} required domain signal(s).`,
          {
            domainId: rule.id,
            reviewerRole: 'domain-specific quality judge',
            category: 'domainFit',
            owner: 'compiler',
            repairPath:
              'Strengthen the generated materials with domain-specific moves, artifacts, vocabulary, and assessment expectations.',
          },
        ),
      );
    }
    if (rule.weakGeneric && patternMatches(rule.weakGeneric, compiledText)) {
      findings.push(
        makeFinding(
          'improvement',
          'domain-specific-quality',
          `${rule.label} output contains generic or cross-domain language that weakens course fit.`,
          {
            domainId: rule.id,
            reviewerRole: 'domain-specific quality judge',
            category: 'domainFit',
            owner: 'compiler',
            evidence: firstSnippet(compiledText, rule.weakGeneric),
            repairPath:
              'Replace cross-domain boilerplate with discipline-appropriate examples and student work products.',
          },
        ),
      );
    }
  }

  return findings;
}

function auditEducationalStandardsAlignment({ compiledFeatures = [], compiledText = '' }) {
  const findings = [];
  const featureSet = new Set(compiledFeatures);

  for (const rule of EDUCATIONAL_STANDARDS_ALIGNMENT_RULES) {
    const applies =
      !Array.isArray(rule.featureIds) ||
      rule.featureIds.length === 0 ||
      rule.featureIds.some((featureId) => featureSet.has(featureId));
    if (!applies) continue;

    const missingPatterns = patternArray(rule.requiredPatterns).filter(
      (pattern) => !patternMatches(pattern, compiledText),
    );
    if (missingPatterns.length === 0) continue;

    findings.push(
      makeFinding(
        'improvement',
        'educational-standards-alignment',
        `${rule.label} is missing ${missingPatterns.length} required signal(s).`,
        {
          ruleId: rule.id,
          standardIds: rule.standards || [],
          reviewerRole: 'standards-backed course design reviewer',
          category: rule.dimension || 'pedagogy',
          owner: 'compiler',
          evidence: missingPatterns.map(patternLabel).join(', '),
          repairPath: rule.repairPath,
        },
      ),
    );
  }

  return findings;
}

function buildExpertQualityReview({ findings = [], compiledText = '', compiledFeatures = [], fixture }) {
  const activeDomains = inferCourseDomains(fixture?.courseMap || {});
  const repairFindings = findings.filter((finding) => finding.severity !== 'risk');
  const countByCategory = (category) => repairFindings.filter((finding) => finding.category === category).length;
  const countByCheck = (check) => repairFindings.filter((finding) => finding.check === check).length;
  const expectedFeatureCount = Math.max(1, compiledFeatures.length);
  const featureCoverageScore =
    expectedFeatureCount > 0 ? Math.min(10, (compiledFeatures.length / expectedFeatureCount) * 10) : 10;
  const shallowCount = countByCheck('expert-quality-rubric');
  const domainCount = countByCheck('domain-specific-quality');
  const deliverableCount = countByCheck('real-deliverable-quality');
  const packageCount = countByCheck('export-package-quality');
  const sourceRiskCount = findings.filter((finding) => finding.severity === 'risk').length;
  const textVolume = String(compiledText || '').trim().length;

  const dimensions = {
    domainFit: {
      score: clampScore(10 - domainCount * 1.5 - shallowCount * 0.8),
      evidence:
        activeDomains.length > 0
          ? `Detected domains: ${activeDomains.join(', ')}. Domain findings: ${domainCount}.`
          : `No specialized domain detected. Shallow-generic findings: ${shallowCount}.`,
    },
    pedagogy: {
      score: clampScore(10 - countByCategory('pedagogy') * 1.4 - deliverableCount * 0.25),
      evidence: `Pedagogy-sensitive findings: ${countByCategory('pedagogy')}; deliverable structure findings: ${deliverableCount}.`,
    },
    clarity: {
      score: clampScore(10 - countByCategory('clarity') * 1.2 - (uniqueWordRatio(compiledText) < 0.2 ? 1 : 0)),
      evidence: `Vocabulary variety ${roundScoreDelta(uniqueWordRatio(compiledText))}; clarity findings: ${countByCategory(
        'clarity',
      )}.`,
    },
    assessmentQuality: {
      score: clampScore(10 - countByCategory('assessmentQuality') * 1.4 - countByCheck('review-boundary') * 0.3),
      evidence: `Assessment-fit findings: ${countByCategory('assessmentQuality')}; review-boundary findings: ${countByCheck(
        'review-boundary',
      )}.`,
    },
    sourceGrounding: {
      score: clampScore(10 - countByCategory('sourceGrounding') * 1.3 - Math.min(2, sourceRiskCount * 0.05)),
      evidence: `Source-grounding findings: ${countByCategory('sourceGrounding')}; accepted input risks: ${sourceRiskCount}.`,
    },
    classroomUsefulness: {
      score: clampScore(10 - countByCategory('classroomUsefulness') * 1.1 - (textVolume < 8000 ? 1 : 0)),
      evidence: `Inspectable text volume: ${textVolume}; classroom-usefulness findings: ${countByCategory(
        'classroomUsefulness',
      )}.`,
    },
    learnerAgencyAccessibility: {
      score: clampScore(10 - countByCategory('learnerAgencyAccessibility') * 2.2),
      evidence: `UDL/accessibility findings: ${countByCategory(
        'learnerAgencyAccessibility',
      )}; standards-alignment findings: ${countByCheck('educational-standards-alignment')}.`,
    },
    packageIntegrity: {
      score: clampScore(featureCoverageScore - countByCategory('packageIntegrity') * 1.5 - packageCount * 1.5),
      evidence: `Compiled features: ${compiledFeatures.length}/${expectedFeatureCount}; package findings: ${packageCount}.`,
    },
  };
  const rows = HARDER_JUDGE_DIMENSIONS.map((id) => ({
    id,
    label: id.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
    score: dimensions[id].score,
    maxScore: 10,
    verdict: dimensions[id].score >= 8.5 ? 'strong' : dimensions[id].score >= 7 ? 'watch' : 'weak',
    evidence: dimensions[id].evidence,
  }));
  const overall = clampScore(average(rows.map((row) => row.score)));
  return {
    version: 1,
    overall,
    verdict: overall >= 8.5 && rows.every((row) => row.score >= 7.5) ? 'strong' : 'needs-repair',
    activeDomains,
    dimensions: rows,
    lowDimensionCount: rows.filter((row) => row.score < 7.5).length,
    repairFindingCount: repairFindings.length,
  };
}

function buildSelfImprovementReceipt({ blueprint = {}, compiledFeatures = [], findings = [] }) {
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const reviewRequiredLessons =
    numericValue(blueprint.compilerDecisionMatrix?.reviewRequiredCount) ??
    lessons.filter((lesson) => lesson.compilerDecision?.reviewRequired || lesson.sourceRisk?.reviewRequired).length;
  const deterministicRepairs =
    numericValue(
      blueprint.compilerPath?.adaptiveSafety?.locallyRepairedLessonCount,
      blueprint.compilerPath?.adaptiveRepairPlan?.deterministicRepairCount,
      blueprint.compilerDecisionMatrix?.localRepairCount,
    ) ?? 0;
  const sourceGroundedLessons =
    numericValue(blueprint.qualitySignals?.sourceGroundedLessonCount) ??
    lessons.filter((lesson) => lesson.confidence?.level === 'high').length;
  const inferredAssumptions =
    numericValue(blueprint.blueprintAssumptionLedger?.reviewRequiredCount) ??
    (Array.isArray(blueprint.blueprintAssumptionLedger?.rows)
      ? blueprint.blueprintAssumptionLedger.rows.filter((row) => row.reviewRequired).length
      : null);
  const localConfirmationChecklist =
    blueprint.classroomHandoffPlan?.requiredLocalConfirmations ||
    blueprint.blueprintReviewSurface?.localConfirmationSummary?.localConfirmationRows?.map(
      (row) => row.localConfirmationCue,
    ) ||
    [];
  const studentFacingCleanlinessStatus = findings.some((finding) =>
    /publishability|student-facing|internal-language/i.test(finding.check),
  )
    ? 'blocked'
    : 'clean';

  return buildCompactPackageTrustReceipt({
    lessonCount: lessons.length,
    compilerSummary: { compiledFeatureCount: compiledFeatures.length },
    selectedFeatureCount: compiledFeatures.length,
    modelGeneratedDeliverableCount: 0,
    deterministicRepairCount: deterministicRepairs,
    reviewRequiredCount: reviewRequiredLessons,
    sourceGroundedLessonCount: sourceGroundedLessons,
    inferredAssumptionCount: inferredAssumptions,
    exportVerification: { formatsVerified: ['audit:self validators'] },
    studentFacingCleanlinessStatus,
    localConfirmationChecklist,
    liveProviderCallCount: 0,
    budgetStatus: '0 live provider calls',
  });
}

function auditCompiledPackage({ fixture, runtime, blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const courseMap = fixture.courseMap;
  const expectedLessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  const compiledText = collectStrings(compiled).join(' ');

  for (const signal of fixture.expectedReviewSignals || []) {
    if (!signal.pattern.test(compiledText)) {
      findings.push(
        makeFinding('blocker', 'review-boundary', `Missing review signal: ${signal.label}.`, { signalId: signal.id }),
      );
    }
  }

  for (const featureId of compiledFeatures) {
    const data = compiled?.[featureId];
    if (!data) {
      findings.push(
        makeFinding('blocker', 'compiled-feature', `Missing compiled feature: ${featureId}.`, { featureId }),
      );
      continue;
    }
    const validation =
      typeof runtime.validateDeliverableGeneration === 'function'
        ? runtime.validateDeliverableGeneration(featureId, data, {
            expectedLessonCount,
            config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
          })
        : { valid: true, blockers: [] };
    for (const message of validation.blockers || []) {
      findings.push(
        makeFinding('blocker', 'validator', `${FEATURE_LABELS[featureId] || featureId} failed validation: ${message}`, {
          featureId,
        }),
      );
    }
    const placeholders =
      typeof runtime.findPublishabilityPlaceholders === 'function'
        ? runtime.findPublishabilityPlaceholders(collectStrings(data).join(' '), { limit: 3 })
        : [];
    if (placeholders.length > 0) {
      findings.push(
        makeFinding(
          'blocker',
          'publishability',
          `${FEATURE_LABELS[featureId] || featureId} contains publishability placeholder: ${placeholders[0]}.`,
          { featureId },
        ),
      );
    }
  }

  findings.push(...auditTimingWorkloadPlausibility(blueprint));
  findings.push(...auditSyntheticFacultyReview({ fixture, compiledText }));
  findings.push(...auditRealDeliverableInspection({ fixture, compiledFeatures, compiled }));
  findings.push(...auditShallowGenericOutput({ compiledText }));
  findings.push(...auditNearDuplicatePhrases({ compiledText }));
  findings.push(...auditDomainSpecificQuality({ fixture, compiledText }));
  findings.push(...auditEducationalStandardsAlignment({ compiledFeatures, compiledText }));

  return findings;
}

export function auditSelfImprovementFixture({ fixture, runtime, features = PIPELINE_FEATURES }) {
  const inputRiskFindings = auditInputRisks(fixture);
  try {
    const { blueprint, compiledFeatures, compiled } = compileFixture({ fixture, runtime, features });
    const packageFindings = auditCompiledPackage({ fixture, runtime, blueprint, compiledFeatures, compiled });
    const findings = [...inputRiskFindings, ...packageFindings];
    const compiledText = collectStrings(compiled).join(' ');
    const expertQualityReview = buildExpertQualityReview({
      findings,
      compiledText,
      compiledFeatures,
      fixture,
    });
    const qualityScores = scoreSelfImprovementFixture({ fixture, compiledFeatures, compiledText, findings });
    const criticReview = buildCriticReview({ findings, qualityScores, expertQualityReview });
    return {
      roundNumber: fixture.roundNumber || null,
      fixtureId: fixture.id,
      sourceFixtureId: fixture.sourceFixtureId || fixture.id,
      title: fixture.title,
      focus: fixture.focus,
      generated: Boolean(fixture.generated),
      mutation: fixture.mutation || ADVERSARIAL_MUTATIONS[0],
      scope: fixture.courseMap?.lessons?.length || 0,
      compiledFeatures,
      compactReceipt: buildSelfImprovementReceipt({ blueprint, compiledFeatures, findings }),
      qualityScore: qualityScores.overall,
      qualityScores,
      expertQualityReview,
      criticReview,
      inputRiskCount: inputRiskFindings.length,
      expectedReviewSignalCount: fixture.expectedReviewSignals?.length || 0,
      ...summarizeFindings(findings),
      findings,
    };
  } catch (error) {
    const findings = [
      ...inputRiskFindings,
      makeFinding('blocker', 'compiler', `Compiler failed: ${error?.message || String(error)}`),
    ];
    const qualityScores = scoreSelfImprovementFixture({
      fixture,
      compiledFeatures: [],
      compiledText: '',
      findings,
    });
    const expertQualityReview = buildExpertQualityReview({
      findings,
      compiledText: '',
      compiledFeatures: [],
      fixture,
    });
    const criticReview = buildCriticReview({ findings, qualityScores, expertQualityReview });
    return {
      roundNumber: fixture.roundNumber || null,
      fixtureId: fixture.id,
      sourceFixtureId: fixture.sourceFixtureId || fixture.id,
      title: fixture.title,
      focus: fixture.focus,
      generated: Boolean(fixture.generated),
      mutation: fixture.mutation || ADVERSARIAL_MUTATIONS[0],
      scope: fixture.courseMap?.lessons?.length || 0,
      compiledFeatures: [],
      compactReceipt: buildSelfImprovementReceipt({ findings }),
      qualityScore: qualityScores.overall,
      qualityScores,
      expertQualityReview,
      criticReview,
      inputRiskCount: inputRiskFindings.length,
      expectedReviewSignalCount: fixture.expectedReviewSignals?.length || 0,
      ...summarizeFindings(findings),
      findings,
    };
  }
}

function summarizeResults(results) {
  const blockers = results.reduce((sum, result) => sum + result.blockers, 0);
  const warnings = results.reduce((sum, result) => sum + result.warnings, 0);
  const improvements = results.reduce((sum, result) => sum + (result.improvements || 0), 0);
  const qualityScores = results.map((result) => result.qualityScore).filter(Number.isFinite);
  const expertQualityScores = results.map((result) => result.expertQualityReview?.overall).filter(Number.isFinite);
  const categoryAverages = Object.fromEntries(
    QUALITY_SCORE_CATEGORIES.map((category) => [
      category,
      clampScore(
        average(results.map((result) => result.qualityScores?.categories?.[category]).filter(Number.isFinite)),
      ),
    ]),
  );
  const expertDimensionAverages = Object.fromEntries(
    HARDER_JUDGE_DIMENSIONS.map((dimension) => [
      dimension,
      clampScore(
        average(
          results
            .map((result) => result.expertQualityReview?.dimensions?.find((row) => row.id === dimension)?.score)
            .filter(Number.isFinite),
        ),
      ),
    ]),
  );
  const domainCoverage = results.reduce((counts, result) => {
    for (const domain of result.expertQualityReview?.activeDomains || []) {
      counts[domain] = (counts[domain] || 0) + 1;
    }
    return counts;
  }, {});
  const criticVerdicts = results.reduce((counts, result) => {
    const verdict = result.criticReview?.verdict || 'unknown';
    counts[verdict] = (counts[verdict] || 0) + 1;
    return counts;
  }, {});
  const standardFindingCounts = results.reduce((counts, result) => {
    for (const finding of result.findings || []) {
      for (const standardId of finding.standardIds || []) {
        counts[standardId] = (counts[standardId] || 0) + 1;
      }
    }
    return counts;
  }, {});
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    fixtureCount: results.length,
    roundCount: results.length,
    generatedRoundCount: results.filter((result) => result.generated).length,
    blockers,
    warnings,
    inputRiskCount: results.reduce((sum, result) => sum + result.inputRiskCount, 0),
    expectedReviewSignalCount: results.reduce((sum, result) => sum + result.expectedReviewSignalCount, 0),
    improvements,
    repairCandidateCount: blockers + warnings + improvements,
    acceptedRisks: results.reduce((sum, result) => sum + (result.acceptedRisks || 0), 0),
    receiptCount: results.filter((result) => result.compactReceipt?.fields?.length > 0).length,
    averageQualityScore: clampScore(average(qualityScores)),
    minQualityScore: clampScore(Math.min(...qualityScores)),
    averageExpertQualityScore: clampScore(average(expertQualityScores)),
    minExpertQualityScore: clampScore(Math.min(...expertQualityScores)),
    lowExpertQualityRoundCount: results.filter((result) => (result.expertQualityReview?.overall ?? 10) < 8.5).length,
    expertDimensionAverages,
    domainCoverage,
    lowQualityRoundCount: results.filter((result) => result.qualityScore < 82).length,
    criticVerdicts,
    criticBlindSpotWatchCount: results.filter((result) => result.criticReview?.blindSpotRisk).length,
    standardsFindingCount: Object.values(standardFindingCounts).reduce((sum, count) => sum + count, 0),
    standardFindingCounts,
    categoryAverages,
  };
}

async function findDigestFiles(dir, out = [], { limit = 40, depth = 0 } = {}) {
  if (out.length >= limit || depth > 6) return out;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= limit) break;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await findDigestFiles(fullPath, out, { limit, depth: depth + 1 });
    else if (entry.isFile() && entry.name === 'digest.json') out.push(fullPath);
  }
  return out;
}

export async function discoverPriorArtifactQualitySignals({ root = ROOT, limit = 12 } = {}) {
  const crucibleDir = path.join(root, 'verification-output', 'crucible');
  const digestFiles = await findDigestFiles(crucibleDir, [], { limit: 80 });
  const signals = [];
  for (const digestPath of digestFiles) {
    if (signals.length >= limit) break;
    try {
      const digest = JSON.parse(await fs.readFile(digestPath, 'utf8'));
      const flaggedChecks = Array.isArray(digest.gates?.flaggedChecks) ? digest.gates.flaggedChecks : [];
      for (const check of flaggedChecks) {
        if (signals.length >= limit) break;
        const message = String(check?.message || '');
        if (!message) continue;
        if (!/\b(?:repeats|placeholder|failed|warning|internal|empty|missing)\b/i.test(message)) continue;
        signals.push({
          source: path.relative(root, digestPath),
          runId: digest.runId || null,
          courseTitle: digest.run?.courseTitle || digest.pipeline?.courseTitle || null,
          featureId: check.featureId || 'package',
          status: check.status || 'warning',
          message,
        });
      }
    } catch {
      // Ignore stale or partial local artifacts; the current generated run is authoritative.
    }
  }
  return signals;
}

function selectPackageInspectionIndexes(results = [], limit = 12) {
  const selected = new Set();
  results.forEach((result, index) => {
    if (!result.generated) selected.add(index);
  });
  const targetedMutations = new Set([
    'large-course-map',
    'export-package-integrity',
    'deliverable-specific-weak-spots',
    'copied-placeholder-language',
    'bad-date-structures',
  ]);
  results.forEach((result, index) => {
    if (selected.size >= limit) return;
    if (targetedMutations.has(result.mutation?.id)) selected.add(index);
  });
  if (results.length > 0) selected.add(results.length - 1);
  return Array.from(selected)
    .sort((a, b) => a - b)
    .slice(0, limit);
}

function summarizePackageInspection(samples = []) {
  const failedSamples = samples.filter((sample) => sample.status === 'failed');
  const warningSamples = samples.filter((sample) => sample.status === 'warnings');
  const skippedSamples = samples.filter((sample) => sample.status === 'skipped');
  return {
    status:
      failedSamples.length > 0
        ? 'failed'
        : warningSamples.length > 0
          ? 'warnings'
          : skippedSamples.length === samples.length && samples.length > 0
            ? 'skipped'
            : 'passed',
    sampleCount: samples.length,
    failedSampleCount: failedSamples.length,
    warningSampleCount: warningSamples.length,
    skippedSampleCount: skippedSamples.length,
  };
}

async function inspectExportPackageSamples({ fixtures = [], results = [], runtime, features = PIPELINE_FEATURES }) {
  const indexes = selectPackageInspectionIndexes(results);
  if (!runtime?.server?.ssrLoadModule) {
    const samples = indexes.map((index) => ({
      round: results[index]?.roundNumber || index + 1,
      fixtureId: results[index]?.fixtureId || fixtures[index]?.id,
      mutationId: results[index]?.mutation?.id || 'base-repeat',
      status: 'skipped',
      message: 'Runtime does not expose Vite SSR module loading for package assembly.',
    }));
    return { ...summarizePackageInspection(samples), samples };
  }

  const { buildCourseMaterialsZip } = await runtime.server.ssrLoadModule('/src/lib/packageZipExporter.js');
  const samples = [];
  for (const index of indexes) {
    const fixture = fixtures[index];
    const result = results[index];
    if (!fixture || !result) continue;
    try {
      const { blueprint, compiledFeatures, compiled } = compileFixture({ fixture, runtime, features });
      const deliverables = Object.fromEntries(
        compiledFeatures.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]),
      );
      const packageResult = await buildCourseMaterialsZip({
        deliverables,
        courseMap: fixture.courseMap,
        courseName: fixture.courseMap?.courseName || fixture.title,
        featureIds: ['courseMap', ...compiledFeatures],
        courseGraph: blueprint.courseGraph || blueprint.graph || null,
        quality: false,
        assembleOnly: true,
      });
      const requestedFeatureIds = new Set(
        (packageResult.manifest?.requestedFeatures || []).map((entry) => entry.featureId).filter(Boolean),
      );
      const files = packageResult.files || [];
      const missingFeatureIds = ['courseMap', ...compiledFeatures].filter(
        (featureId) =>
          !requestedFeatureIds.has(featureId) &&
          !files.some(
            (file) => file.featureId === featureId || file.featureId === featureId.replace(/^custom_/, 'custom'),
          ),
      );
      const duplicatePaths = Array.from(
        files
          .map((file) => file.path)
          .reduce((counts, filePath) => counts.set(filePath, (counts.get(filePath) || 0) + 1), new Map())
          .entries(),
      )
        .filter(([, count]) => count > 1)
        .map(([filePath]) => filePath);
      const unsafeFilenameChars = '<>:"|?*';
      const unsafePaths = files
        .map((file) => file.path)
        .filter((filePath) =>
          Array.from(path.basename(filePath || '')).some(
            (character) => unsafeFilenameChars.includes(character) || character.charCodeAt(0) < 32,
          ),
        );
      const status =
        missingFeatureIds.length > 0 || duplicatePaths.length > 0 || unsafePaths.length > 0 ? 'failed' : 'passed';
      samples.push({
        round: result.roundNumber,
        fixtureId: result.fixtureId,
        mutationId: result.mutation?.id || 'base-repeat',
        status,
        fileName: packageResult.fileName,
        fileCount: files.length,
        manifestFileCount: packageResult.manifest?.files?.length || 0,
        requestedFeatureCount: requestedFeatureIds.size,
        missingFeatureIds,
        duplicatePaths,
        unsafePaths,
      });
    } catch (error) {
      samples.push({
        round: result.roundNumber,
        fixtureId: result.fixtureId,
        mutationId: result.mutation?.id || 'base-repeat',
        status: 'failed',
        message: error?.message || String(error),
      });
    }
  }
  return { ...summarizePackageInspection(samples), samples };
}

function summarizeHarderJudge({ messyArtifactSignals = [], packageInspection = null } = {}) {
  return {
    version: 1,
    gapAudit: [
      'Previous loop inspected flat compiled text but did not validate every deliverable family as a real artifact.',
      'Previous loop had a score but no expert-style explanation for domain fit, pedagogy, clarity, assessment quality, source grounding, classroom usefulness, or package integrity.',
      'Previous loop did not inspect sampled full-package assembly or learn from prior real export warnings.',
    ],
    realDeliverableInspection: {
      inspectedFeatures: PIPELINE_FEATURES,
      dimensions: HARDER_JUDGE_DIMENSIONS,
      standardsFrameworks: EDUCATIONAL_STANDARD_FRAMEWORKS,
    },
    educationalStandards: EDUCATIONAL_STANDARD_FRAMEWORKS,
    messyArtifactSignals,
    packageInspection: packageInspection || {
      status: 'not-run',
      sampleCount: 0,
      failedSampleCount: 0,
      warningSampleCount: 0,
      skippedSampleCount: 0,
      samples: [],
    },
  };
}

export async function buildInternalSelfImprovementAudit(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const rawFixtures =
    Array.isArray(options.fixtures) && options.fixtures.length > 0
      ? options.fixtures
      : DEFAULT_SELF_IMPROVEMENT_FIXTURES;
  const fixtures = rawFixtures.map((fixture, index) => ({
    ...fixture,
    roundNumber: fixture.roundNumber || index + 1,
    sourceFixtureId: fixture.sourceFixtureId || fixture.id,
    mutation: fixture.mutation || ADVERSARIAL_MUTATIONS[0],
  }));
  const results = fixtures.map((fixture) =>
    auditSelfImprovementFixture({ fixture, runtime, features: options.features || PIPELINE_FEATURES }),
  );
  const baselineScores = new Map();
  for (const result of results) {
    if (result.mutation?.id === 'base-repeat' && !baselineScores.has(result.sourceFixtureId)) {
      baselineScores.set(result.sourceFixtureId, result.qualityScore);
    }
  }
  for (const result of results) {
    if (!baselineScores.has(result.sourceFixtureId)) baselineScores.set(result.sourceFixtureId, result.qualityScore);
  }
  const roundLedger = results.map((result) => buildRoundLedgerEntry(result, baselineScores));
  const packageInspection =
    options.packageInspection ||
    (await inspectExportPackageSamples({
      fixtures,
      results,
      runtime,
      features: options.features || PIPELINE_FEATURES,
    }));
  const messyArtifactSignals =
    options.messyArtifactSignals ||
    (runtime?.server ? await discoverPriorArtifactQualitySignals({ root: options.root || ROOT, limit: 12 }) : []);
  const harderJudge = summarizeHarderJudge({ messyArtifactSignals, packageInspection });
  const summary = {
    ...summarizeResults(results),
    packageInspectionStatus: packageInspection.status,
    packageInspectionSampleCount: packageInspection.sampleCount,
    packageInspectionFailedSampleCount: packageInspection.failedSampleCount,
    packageInspectionWarningSampleCount: packageInspection.warningSampleCount,
    priorMessyArtifactSignalCount: messyArtifactSignals.length,
  };
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      roundsRequested: options.roundsRequested || fixtures.length,
      loopVersion: 2,
      note: 'Internal self-improvement fixtures are adversarial regression checks with deterministic fixture expansion, a quality scoring rubric, a round ledger, and critic-of-critic metadata. They do not claim external expert certification.',
    },
    summary,
    harderJudge,
    roundLedger,
    results,
  };
  return attachRunTrend(payload, options.previousPayload || null);
}

export function attachRunTrend(payload, previousPayload = null) {
  const baselineDecision = buildAutonomousQualityDecision({
    summary: payload.summary,
    results: payload.results,
    roundLedger: payload.roundLedger,
    trend: null,
  });
  const baselinePayload = {
    ...payload,
    autonomousDecision: baselineDecision,
  };
  const trend = buildRunTrend({ previousPayload, currentPayload: baselinePayload });
  const autonomousDecision = buildAutonomousQualityDecision({
    summary: payload.summary,
    results: payload.results,
    roundLedger: payload.roundLedger,
    trend,
  });
  const finalPayload = {
    ...payload,
    trend,
    autonomousDecision,
  };
  finalPayload.trend = buildRunTrend({ previousPayload, currentPayload: finalPayload });
  finalPayload.autonomousDecision = buildAutonomousQualityDecision({
    summary: finalPayload.summary,
    results: finalPayload.results,
    roundLedger: finalPayload.roundLedger,
    trend: finalPayload.trend,
  });
  return finalPayload;
}

function markdownTable(rows) {
  return rows.join('\n');
}

export function renderInternalSelfImprovementMarkdown(payload) {
  const matrixRows = payload.results.map(
    (result) =>
      `| ${result.roundNumber || ''} | ${result.fixtureId} | ${result.sourceFixtureId || result.fixtureId} | ${result.mutation?.id || 'base-repeat'} | ${result.scope} | ${result.status} | ${result.qualityScore} | ${result.expertQualityReview?.overall ?? 'n/a'} | ${result.criticReview?.verdict || 'unknown'} | ${result.compiledFeatures.length} | ${result.inputRiskCount} | ${result.expectedReviewSignalCount} | ${result.blockers} | ${result.warnings} | ${result.improvements || 0} |`,
  );
  const qualityRows = Object.entries(payload.summary.categoryAverages || {}).map(
    ([category, score]) => `| ${category} | ${score} |`,
  );
  const expertRows = Object.entries(payload.summary.expertDimensionAverages || {}).map(
    ([dimension, score]) => `| ${dimension} | ${score} |`,
  );
  const domainRows = Object.entries(payload.summary.domainCoverage || {}).map(
    ([domain, count]) => `| ${domain} | ${count} |`,
  );
  const receiptRows = payload.results.flatMap((result) =>
    (result.compactReceipt?.fields || []).map(
      (field) => `| ${result.fixtureId} | ${field.label} | ${String(field.value).replace(/\|/g, '/')} |`,
    ),
  );
  const findingLine = (result, finding) => {
    const suffix = finding.repairPath ? ` Repair path: ${finding.repairPath}` : '';
    return `- ${result.fixtureId}/${finding.check}/${finding.severity}: ${finding.message}${suffix}`;
  };
  const findings = payload.results.flatMap((result) =>
    result.findings.filter((finding) => finding.severity !== 'risk').map((finding) => findingLine(result, finding)),
  );
  const repairCandidates = payload.results.flatMap((result) =>
    result.findings
      .filter((finding) => finding.severity !== 'risk')
      .map(
        (finding) =>
          `- ${result.fixtureId}/${finding.check}/${finding.severity}: ${finding.repairPath || finding.message}`,
      ),
  );
  const acceptedRisks = payload.results.flatMap((result) =>
    result.findings.filter((finding) => finding.severity === 'risk').map((finding) => findingLine(result, finding)),
  );
  const lowestQualityLedgerRows = (payload.roundLedger || [])
    .slice()
    .sort((a, b) => a.qualityScore - b.qualityScore || a.round - b.round)
    .slice(0, 25)
    .map(
      (entry) =>
        `| ${entry.round} | ${entry.fixtureId} | ${entry.mutationId} | ${entry.status} | ${entry.qualityScore} | ${entry.expertQualityScore ?? 'n/a'} | ${entry.qualityDeltaFromSource} | ${entry.criticVerdict} | ${entry.patchArea} | ${entry.repairCandidateCount} | ${entry.acceptedInputRiskCount} |`,
    );
  const criticRows = Object.entries(payload.summary.criticVerdicts || {}).map(
    ([verdict, count]) => `| ${verdict} | ${count} |`,
  );
  const autonomousDecision = payload.autonomousDecision || {};
  const harderJudge = payload.harderJudge || {};
  const trend = payload.trend || {};
  const trendDeltas = trend.deltas || {};
  const trendActions = trend.actions || {};
  const trendMutationCoverage = trend.mutationCoverage || {};
  const stoppingRule = autonomousDecision.stoppingRule || {};
  const listValue = (values) => (Array.isArray(values) && values.length > 0 ? values.join(', ') : 'none');
  const deltaValue = (value) => (value === null || value === undefined ? 'n/a' : String(value));
  const trendCategoryRows = Object.entries(trend.categoryDeltas || {}).map(
    ([category, delta]) => `| ${category} | ${deltaValue(delta)} |`,
  );
  const trendExpertRows = Object.entries(trend.expertDimensionDeltas || {}).map(
    ([dimension, delta]) => `| ${dimension} | ${deltaValue(delta)} |`,
  );
  const packageInspection = harderJudge.packageInspection || {};
  const packageRows = (packageInspection.samples || []).map(
    (sample) =>
      `| ${sample.round || ''} | ${sample.fixtureId || ''} | ${sample.mutationId || ''} | ${sample.status || 'unknown'} | ${sample.fileCount ?? 'n/a'} | ${sample.manifestFileCount ?? 'n/a'} | ${String(
        sample.message || sample.missingFeatureIds?.join(', ') || sample.duplicatePaths?.join(', ') || 'ok',
      ).replace(/\|/g, '/')} |`,
  );
  const messySignalRows = (harderJudge.messyArtifactSignals || []).map(
    (signal) =>
      `| ${signal.source} | ${signal.featureId} | ${signal.status} | ${String(signal.message).replace(/\|/g, '/')} |`,
  );
  const standardRows = (harderJudge.educationalStandards || []).map(
    (standard) =>
      `| ${standard.id} | ${standard.label} | ${standard.sourceUrl} | ${String(standard.appliedAs).replace(/\|/g, '/')} | ${
        payload.summary.standardFindingCounts?.[standard.id] || 0
      } |`,
  );
  const gapRows = (harderJudge.gapAudit || []).map((gap) => `- ${gap}`);
  const requiredActionRows = (autonomousDecision.actions?.required || []).map(
    (action) =>
      `| ${action.priority} | ${action.type} | ${action.status} | ${action.targetArea} | ${action.id} | ${String(
        action.acceptanceCriteria?.[0] || '',
      ).replace(/\|/g, '/')} |`,
  );
  const trackedActionRows = (autonomousDecision.actions?.tracked || []).map(
    (action) =>
      `| ${action.priority} | ${action.type} | ${action.status} | ${action.targetArea} | ${action.id} | ${String(
        action.acceptanceCriteria?.[0] || '',
      ).replace(/\|/g, '/')} |`,
  );

  return `${[
    '# CourseMapper Internal Self-Improvement Audit',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    '',
    '## Summary',
    '',
    `Status: ${payload.summary.status}`,
    `Rounds completed: ${payload.summary.roundCount || payload.summary.fixtureCount}`,
    `Fixtures: ${payload.summary.fixtureCount}`,
    `Generated rounds: ${payload.summary.generatedRoundCount || 0}`,
    `Average quality score: ${payload.summary.averageQualityScore}`,
    `Minimum quality score: ${payload.summary.minQualityScore}`,
    `Average expert quality score: ${payload.summary.averageExpertQualityScore}`,
    `Minimum expert quality score: ${payload.summary.minExpertQualityScore}`,
    `Low-quality watch rounds: ${payload.summary.lowQualityRoundCount || 0}`,
    `Low expert-quality rounds: ${payload.summary.lowExpertQualityRoundCount || 0}`,
    `Critic blind-spot watch rounds: ${payload.summary.criticBlindSpotWatchCount || 0}`,
    `Input risks surfaced: ${payload.summary.inputRiskCount}`,
    `Expected review signals checked: ${payload.summary.expectedReviewSignalCount}`,
    `Improvement candidates: ${payload.summary.improvements}`,
    `Repair candidates: ${payload.summary.repairCandidateCount || 0}`,
    `Accepted risks: ${payload.summary.acceptedRisks}`,
    `Compact receipts: ${payload.summary.receiptCount}`,
    `Package inspection: ${payload.summary.packageInspectionStatus || 'unknown'} (${payload.summary.packageInspectionSampleCount || 0} sample(s))`,
    `Prior messy artifact signals loaded: ${payload.summary.priorMessyArtifactSignalCount || 0}`,
    `Standards-backed findings: ${payload.summary.standardsFindingCount || 0}`,
    `Blockers: ${payload.summary.blockers}`,
    `Warnings: ${payload.summary.warnings}`,
    '',
    `Note: ${payload.meta.note}`,
    '',
    '## Autonomous Decision',
    '',
    `Status: ${autonomousDecision.status || 'unknown'}`,
    `Next action: ${autonomousDecision.nextAction || 'unknown'}`,
    `Requires human interpretation: ${autonomousDecision.requiresHumanInterpretation === false ? 'false' : 'true'}`,
    `Rationale: ${autonomousDecision.rationale || 'No autonomous rationale available.'}`,
    '',
    markdownTable([
      '| Priority | Type | Status | Target Area | Action ID | Acceptance Criteria |',
      '| --- | --- | --- | --- | --- | --- |',
      ...(requiredActionRows.length > 0
        ? requiredActionRows
        : ['| none | none | complete | none | no-required-actions | No required autonomous actions. |']),
      ...trackedActionRows,
    ]),
    '',
    '## Run Trend',
    '',
    `Previous run available: ${trend.hasPrevious ? 'true' : 'false'}`,
    `Previous generated: ${trend.previousGeneratedAt || 'none'}`,
    `Current generated: ${trend.currentGeneratedAt || payload.meta.generatedAt}`,
    `Trend recommendation: ${trend.recommendation?.nextAction || 'unknown'}`,
    `Trend rationale: ${trend.recommendation?.rationale || 'No trend rationale available.'}`,
    `Round count delta: ${deltaValue(trendDeltas.roundCountDelta)}`,
    `Generated round delta: ${deltaValue(trendDeltas.generatedRoundCountDelta)}`,
    `Average quality delta: ${deltaValue(trendDeltas.averageQualityScoreDelta)}`,
    `Minimum quality delta: ${deltaValue(trendDeltas.minQualityScoreDelta)}`,
    `Average expert quality delta: ${deltaValue(trendDeltas.averageExpertQualityScoreDelta)}`,
    `Minimum expert quality delta: ${deltaValue(trendDeltas.minExpertQualityScoreDelta)}`,
    `Repair candidate delta: ${deltaValue(trendDeltas.repairCandidateCountDelta)}`,
    `Required action delta: ${deltaValue(trendDeltas.requiredActionCountDelta)}`,
    `Mutation family delta: ${deltaValue(trendDeltas.mutationFamilyCountDelta)}`,
    `New required actions: ${listValue(trendActions.newRequiredActionIds)}`,
    `Resolved required actions: ${listValue(trendActions.resolvedRequiredActionIds)}`,
    `Persisting required actions: ${listValue(trendActions.persistingRequiredActionIds)}`,
    `Mutation coverage: ${trendMutationCoverage.currentCount || 0} family/families (${deltaValue(
      trendMutationCoverage.countDelta,
    )} delta)`,
    `New mutation families: ${listValue(trendMutationCoverage.newMutationFamilies)}`,
    '',
    markdownTable([
      '| Category | Delta |',
      '| --- | ---: |',
      ...(trendCategoryRows.length > 0 ? trendCategoryRows : ['| none | n/a |']),
    ]),
    '',
    markdownTable([
      '| Expert Dimension | Delta |',
      '| --- | ---: |',
      ...(trendExpertRows.length > 0 ? trendExpertRows : ['| none | n/a |']),
    ]),
    '',
    '## Stopping Rule',
    '',
    `Stop recommended: ${stoppingRule.stopRecommended ? 'true' : 'false'}`,
    `Stopping next action: ${stoppingRule.nextAction || 'unknown'}`,
    `Stopping reason: ${stoppingRule.reason || 'No stopping-rule reason available.'}`,
    '',
    '## Quality Summary',
    '',
    markdownTable(['| Category | Average Score |', '| --- | ---: |', ...qualityRows]),
    '',
    '## Expert Quality Summary',
    '',
    markdownTable([
      '| Dimension | Average Score |',
      '| --- | ---: |',
      ...(expertRows.length > 0 ? expertRows : ['| none | 0 |']),
    ]),
    '',
    markdownTable([
      '| Domain | Rounds |',
      '| --- | ---: |',
      ...(domainRows.length > 0 ? domainRows : ['| none | 0 |']),
    ]),
    '',
    '## Harder Judge Evidence',
    '',
    ...(gapRows.length > 0 ? gapRows : ['- No harder-judge gap audit recorded.']),
    '',
    '## Educational Standards Used',
    '',
    markdownTable([
      '| Standard ID | Framework | Source | How the judge applies it | Findings |',
      '| --- | --- | --- | --- | ---: |',
      ...(standardRows.length > 0 ? standardRows : ['| none | none | none | none | 0 |']),
    ]),
    '',
    `Package inspection status: ${packageInspection.status || 'unknown'}`,
    `Package samples: ${packageInspection.sampleCount || 0}`,
    `Package failed samples: ${packageInspection.failedSampleCount || 0}`,
    `Package warning samples: ${packageInspection.warningSampleCount || 0}`,
    '',
    markdownTable([
      '| Round | Fixture | Mutation | Status | Files | Manifest Files | Evidence |',
      '| ---: | --- | --- | --- | ---: | ---: | --- |',
      ...(packageRows.length > 0 ? packageRows : ['| none | none | none | none | 0 | 0 | none |']),
    ]),
    '',
    'Prior real-artifact warning signals used by the harder judge:',
    '',
    markdownTable([
      '| Source | Feature | Status | Message |',
      '| --- | --- | --- | --- |',
      ...(messySignalRows.length > 0 ? messySignalRows : ['| none | none | none | none |']),
    ]),
    '',
    '## Critic-of-Critic Summary',
    '',
    markdownTable([
      '| Verdict | Rounds |',
      '| --- | ---: |',
      ...(criticRows.length > 0 ? criticRows : ['| none | 0 |']),
    ]),
    '',
    '## Fixture Matrix',
    '',
    markdownTable([
      '| Round | Fixture | Source Fixture | Mutation | Scope | Status | Quality | Expert Quality | Critic Verdict | Compiled Features | Input Risks | Review Signals | Blockers | Warnings | Improvements |',
      '| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...matrixRows,
    ]),
    '',
    '## Compact Receipt Matrix',
    '',
    markdownTable([
      '| Fixture | Field | Value |',
      '| --- | --- | --- |',
      ...(receiptRows.length > 0 ? receiptRows : ['| none | none | none |']),
    ]),
    '',
    '## Findings',
    '',
    ...(findings.length > 0 ? findings : ['- No internal self-improvement findings.']),
    '',
    '## Repair Candidates',
    '',
    ...(repairCandidates.length > 0 ? repairCandidates : ['- No repair candidates remain.']),
    '',
    '## Round Ledger',
    '',
    'Lowest-quality rounds are shown here. The full ledger is written to `latest-ledger.jsonl`.',
    '',
    markdownTable([
      '| Round | Fixture | Mutation | Status | Quality | Expert | Delta | Critic Verdict | Patch Area | Repairs | Accepted Risks |',
      '| ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |',
      ...(lowestQualityLedgerRows.length > 0
        ? lowestQualityLedgerRows
        : ['| none | none | none | none | 0 | 0 | 0 | none | none | 0 | 0 |']),
    ]),
    '',
    '## Accepted Risks',
    '',
    ...(acceptedRisks.length > 0 ? acceptedRisks : ['- No accepted input risks.']),
    '',
  ].join('\n')}`;
}

export async function writeInternalSelfImprovementAudit(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  const ledgerPath = path.join(outputDir, 'latest-ledger.jsonl');
  const autonomousActionsPath = path.join(outputDir, 'latest-autonomous-actions.json');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderInternalSelfImprovementMarkdown(payload));
  await fs.writeFile(ledgerPath, `${(payload.roundLedger || []).map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  await fs.writeFile(autonomousActionsPath, `${JSON.stringify(payload.autonomousDecision || {}, null, 2)}\n`);
  return { jsonPath, markdownPath, ledgerPath, autonomousActionsPath };
}

export async function readPreviousInternalSelfImprovementAudit(outputDir = DEFAULT_OUTPUT_DIR) {
  try {
    const raw = await fs.readFile(path.join(outputDir, 'latest.json'), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT_DIR, fixtureIds: [], rounds: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
    else if (arg === '--rounds') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--rounds must be a positive integer');
      args.rounds = value;
    } else if (arg === '--fixture' || arg === '--fixtures') {
      args.fixtureIds.push(
        ...String(argv[++i] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }
  return args;
}

function selectFixtures(fixtureIds, { rounds = null } = {}) {
  const selected =
    !Array.isArray(fixtureIds) || fixtureIds.length === 0
      ? DEFAULT_SELF_IMPROVEMENT_FIXTURES
      : (() => {
          const available = new Map(DEFAULT_SELF_IMPROVEMENT_FIXTURES.map((fixture) => [fixture.id, fixture]));
          const missing = fixtureIds.filter((fixtureId) => !available.has(fixtureId));
          if (missing.length > 0) throw new Error(`Unknown self-improvement fixture id(s): ${missing.join(', ')}`);
          return fixtureIds.map((fixtureId) => available.get(fixtureId));
        })();
  return generateSelfImprovementFixtures({ fixtures: selected, rounds: rounds || selected.length });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const fixtures = selectFixtures(args.fixtureIds, { rounds: args.rounds });
    const previousPayload = await readPreviousInternalSelfImprovementAudit(args.outputDir);
    const payload = await buildInternalSelfImprovementAudit({
      fixtures,
      roundsRequested: args.rounds || fixtures.length,
      previousPayload,
    });
    const paths = await writeInternalSelfImprovementAudit(payload, args.outputDir);
    console.log(`Internal self-improvement audit: ${payload.summary.status}`);
    console.log(`Rounds: ${payload.summary.roundCount || payload.summary.fixtureCount}`);
    console.log(`Decision: ${payload.autonomousDecision?.status || 'unknown'}`);
    console.log(`Next action: ${payload.autonomousDecision?.nextAction || 'unknown'}`);
    console.log(`Stop recommended: ${payload.autonomousDecision?.stoppingRule?.stopRecommended ? 'true' : 'false'}`);
    console.log(`Report: ${paths.markdownPath}`);
    console.log(`Ledger: ${paths.ledgerPath}`);
    console.log(`Autonomous actions: ${paths.autonomousActionsPath}`);
    if (payload.summary.status !== 'pass') process.exitCode = 1;
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
