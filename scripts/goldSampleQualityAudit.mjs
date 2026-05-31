#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_AUDIT_PROJECTS,
  MESSY_IMPORT_STRESS_PROJECT,
  PIPELINE_FEATURES,
  SPARSE_ASSESSMENT_STRESS_PROJECT,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './hybridPipelineAudit.mjs';

export { closeHybridPipelineAuditRuntime, loadHybridPipelineAuditRuntime };

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'gold-sample-quality-audit');
const GOLD_QUALITY_FLOOR = 9;
const CLASSROOM_EXCELLENCE_FLOOR = 9;
const REQUIRED_GOLD_SCOPE_COVERAGE = [5, 8, 14];
const MIN_GOLD_MODALITIES_PER_REQUIRED_SCOPE = 3;
const REQUIRED_TEACHING_MOVE_KEYS = ['openingMove', 'practiceMove', 'feedbackMove', 'assessmentMove', 'reviewMove'];

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

const PER_LESSON_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const RESEARCH_METHODS_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'empirical research question',
    'sampling frame',
    'measurement validity',
    'ethical recruitment',
    'descriptive statistics',
    'evidence-quality brief',
    'method limitation',
  ],
  lens: {
    domain: 'applied social research methods',
    evidenceNoun: 'empirical evidence',
    decisionNoun: 'method decision',
    learnerRole: 'student researcher',
    exampleNoun: 'study-design scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'research questions, variables, feasibility',
      evidenceMove: 'use empirical evidence to test whether the question is researchable',
      decisionMove: 'choose a defensible method decision for the research question',
    },
    'lesson-2': {
      context: 'literature synthesis and gap statements',
      evidenceMove: 'use empirical evidence to locate the study gap',
      decisionMove: 'choose the conceptual-frame decision the literature supports',
    },
    'lesson-3': {
      context: 'sampling frames and recruitment risk',
      evidenceMove: 'use empirical evidence to diagnose sampling bias',
      decisionMove: 'choose a recruitment decision that protects participants',
    },
    'lesson-4': {
      context: 'survey and interview measurement',
      evidenceMove: 'use empirical evidence to test item validity',
      decisionMove: 'choose a measurement decision that reduces error',
    },
    'lesson-5': {
      context: 'observation notes and reflexivity',
      evidenceMove: 'use empirical evidence to separate behavior from interpretation',
      decisionMove: 'choose a field-note decision that preserves credibility',
    },
    'lesson-6': {
      context: 'data cleaning and documentation',
      evidenceMove: 'use empirical evidence to justify each cleaning rule',
      decisionMove: 'choose a documentation decision another researcher can audit',
    },
    'lesson-7': {
      context: 'descriptive statistics and limitations',
      evidenceMove: 'use empirical evidence to summarize a pattern accurately',
      decisionMove: 'choose an interpretation decision that avoids overclaiming',
    },
    'lesson-8': {
      context: 'test selection and assumptions',
      evidenceMove: 'use empirical evidence to match variables to a test',
      decisionMove: 'choose an inference decision that fits the research question',
    },
  },
  styleNotes: [
    'Name the research artifact before giving general advice.',
    'Tie feedback to evidence quality, method fit, and limitations.',
    'Prefer study-design scenarios over generic classroom examples.',
  ],
};

const RESEARCH_METHODS_EXTRA_GOLD_LESSON_PHRASES = {
  'lesson-9': {
    context: 'qualitative coding and theme evidence',
    evidenceMove: 'use empirical evidence to connect codes, excerpts, and themes',
    decisionMove: 'choose a coding decision that preserves qualitative credibility',
  },
  'lesson-10': {
    context: 'mixed methods integration displays',
    evidenceMove: 'use empirical evidence to connect quantitative and qualitative strands',
    decisionMove: 'choose an integration decision that fits the research question',
  },
  'lesson-11': {
    context: 'consent language and participant protection',
    evidenceMove: 'use empirical evidence to identify ethical risk in consent language',
    decisionMove: 'choose an ethics decision that protects participant autonomy',
  },
  'lesson-12': {
    context: 'program evidence and policy recommendations',
    evidenceMove: 'use empirical evidence to judge indicator strength and logic-model fit',
    decisionMove: 'choose a program decision that avoids overclaiming',
  },
  'lesson-13': {
    context: 'practitioner findings and limitation language',
    evidenceMove: 'use empirical evidence to translate findings for a practitioner audience',
    decisionMove: 'choose a communication decision that keeps limitations visible',
  },
  'lesson-14': {
    context: 'evidence portfolio and reflective synthesis',
    evidenceMove: 'use empirical evidence to connect revised artifacts into a portfolio',
    decisionMove: 'choose a synthesis decision that shows growth in evidence reasoning',
  },
};

const RESEARCH_METHODS_ARTIFACT_GENRES = [
  'memo-brief',
  'literature-synthesis',
  'analysis-log',
  'analysis-log',
  'analysis-log',
  'analysis-log',
  'memo-brief',
  'checkpoint-response',
  'memo-brief',
  'memo-brief',
  'applied-artifact',
  'memo-brief',
  'memo-brief',
  'competency-evidence',
];

function scopedGoldEnrichment(enrichment, scope, extraLessonPhrases = {}) {
  const lessonPhrases = {
    ...(enrichment.lessonPhrases || {}),
    ...extraLessonPhrases,
  };
  return {
    ...enrichment,
    lessonPhrases: Object.fromEntries(
      Object.entries(lessonPhrases).filter(([lessonId]) => {
        const match = /^lesson-(\d+)$/i.exec(lessonId);
        return match && Number(match[1]) <= scope;
      }),
    ),
  };
}

function researchMethodsGoldExpectations(scope) {
  return {
    minQuality: GOLD_QUALITY_FLOOR,
    courseModality: 'applied-lab',
    artifactGenres: RESEARCH_METHODS_ARTIFACT_GENRES.slice(0, scope),
    packageMustMatch: [
      /empirical research question/i,
      /sampling frame/i,
      /measurement validity/i,
      /empirical evidence/i,
      /method decision/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    features: {
      syllabus: {
        mustMatchAny: [
          [/research/i, /sampling/i],
          [/survey/i, /interview/i, /descriptive statistics/i],
        ],
      },
      lessonPlans: {
        mustMatch: [/empirical evidence/i, /method decision/i],
      },
      slideDecks: {
        mustMatch: [/empirical evidence/i, /method decision/i],
        mustMatchAny: [[/study-design scenario/i, /research question/i]],
      },
      assignments: {
        mustMatch: [/empirical evidence/i, /applied social research/i],
      },
      rubrics: {
        mustMatch: [/empirical evidence/i],
      },
      discussions: {
        mustMatch: [/empirical evidence/i, /method decision/i],
      },
      quizBank: {
        mustMatch: [/empirical evidence/i, /method decision/i],
      },
      studyGuides: {
        mustMatch: [/empirical evidence/i, /method decision/i],
      },
      courseFaq: {
        mustMatch: [/empirical evidence/i],
      },
    },
  };
}

const AI_COURSE_DESIGN_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'prompt audit',
    'privacy risk',
    'accessibility check',
    'feedback loop',
    'rubric calibration',
    'human-in-the-loop review',
    'AI disclosure',
  ],
  lens: {
    domain: 'AI-supported course design',
    evidenceNoun: 'design evidence',
    decisionNoun: 'instructional design decision',
    learnerRole: 'course designer',
    exampleNoun: 'AI teaching workflow',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'learning-goal alignment and AI use boundaries',
      evidenceMove: 'use design evidence to justify where AI support belongs',
      decisionMove: 'choose an instructional design decision that preserves instructor judgment',
    },
    'lesson-2': {
      context: 'prompt patterns and activity design',
      evidenceMove: 'use design evidence from prompt tests to revise the activity',
      decisionMove: 'choose a prompt-audit decision that improves learner support',
    },
    'lesson-3': {
      context: 'assessment design and AI feedback loops',
      evidenceMove: 'use design evidence to separate feedback quality from automation convenience',
      decisionMove: 'choose a feedback-loop decision that keeps grading accountable',
    },
    'lesson-4': {
      context: 'rubric calibration and bias review',
      evidenceMove: 'use design evidence to test whether rubric language is fair and observable',
      decisionMove: 'choose a rubric-calibration decision that reduces bias risk',
    },
    'lesson-5': {
      context: 'accessible AI-supported materials',
      evidenceMove: 'use design evidence to verify accessibility checks before release',
      decisionMove: 'choose an accessibility decision that supports varied learners',
    },
    'lesson-6': {
      context: 'student data privacy and tool selection',
      evidenceMove: 'use design evidence to identify privacy risk before adoption',
      decisionMove: 'choose a tool-selection decision that protects student data',
    },
    'lesson-7': {
      context: 'AI tutoring workflows and escalation',
      evidenceMove: 'use design evidence to decide when tutoring should escalate to a human',
      decisionMove: 'choose a human-in-the-loop review decision for learner safety',
    },
    'lesson-8': {
      context: 'evaluating AI outputs for accuracy',
      evidenceMove: 'use design evidence to compare AI output against course criteria',
      decisionMove: 'choose an AI disclosure decision that is transparent to students',
    },
  },
  styleNotes: [
    'Name the instructional artifact before offering AI advice.',
    'Tie feedback to alignment, accessibility, privacy, disclosure, and instructor accountability.',
    'Prefer AI teaching workflow examples over generic technology examples.',
  ],
};

const AI_COURSE_DESIGN_EXTRA_GOLD_LESSON_PHRASES = {
  'lesson-9': {
    context: 'human-in-the-loop review design',
    evidenceMove: 'use design evidence to decide which AI outputs require instructor review',
    decisionMove: 'choose a review workflow decision that keeps accountability visible',
  },
  'lesson-10': {
    context: 'multimodal content and captioning',
    evidenceMove: 'use design evidence to check captions, transcripts, and modality access',
    decisionMove: 'choose a multimodal design decision that supports accessibility',
  },
  'lesson-11': {
    context: 'academic integrity and AI disclosure',
    evidenceMove: 'use design evidence to compare disclosure language against course expectations',
    decisionMove: 'choose an integrity decision that makes AI boundaries transparent',
  },
  'lesson-12': {
    context: 'course analytics and intervention planning',
    evidenceMove: 'use design evidence to interpret learner-progress signals responsibly',
    decisionMove: 'choose an intervention decision that supports students without over-surveillance',
  },
  'lesson-13': {
    context: 'faculty workflow automation',
    evidenceMove: 'use design evidence to test whether automation saves time without losing quality',
    decisionMove: 'choose a workflow decision that preserves instructor oversight',
  },
  'lesson-14': {
    context: 'capstone AI course redesign portfolio',
    evidenceMove: 'use design evidence to connect revised AI-supported artifacts into a portfolio',
    decisionMove: 'choose a redesign decision that proves alignment, accessibility, privacy, and disclosure',
  },
};

function aiCourseDesignGoldExpectations(scope) {
  return {
    minQuality: GOLD_QUALITY_FLOOR,
    courseModality: 'studio-lab',
    artifactGenres: Array(scope).fill('design-prototype'),
    packageMustMatch: [
      /prompt audit/i,
      /privacy risk|privacy/i,
      /accessibility check|accessibility/i,
      /design evidence/i,
      /instructional design decision/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    features: {
      syllabus: {
        mustMatchAny: [
          [/AI-supported course design/i, /prompt/i],
          [/privacy/i, /accessibility/i, /rubric calibration/i],
        ],
      },
      lessonPlans: {
        mustMatch: [/design evidence/i, /instructional design decision/i],
      },
      slideDecks: {
        mustMatch: [/design evidence/i, /instructional design decision/i],
        mustMatchAny: [[/AI teaching workflow/i, /prompt audit/i]],
      },
      assignments: {
        mustMatch: [/design evidence/i, /AI-supported course design/i],
      },
      rubrics: {
        mustMatch: [/design evidence/i],
      },
      discussions: {
        mustMatch: [/design evidence/i, /instructional design decision/i],
      },
      quizBank: {
        mustMatch: [/design evidence/i, /instructional design decision/i],
      },
      studyGuides: {
        mustMatch: [/design evidence/i, /instructional design decision/i],
      },
      courseFaq: {
        mustMatch: [/design evidence/i],
      },
    },
  };
}

const COMMUNITY_HEALTH_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'stakeholder evidence',
    'health equity',
    'logic model',
    'outcome indicator',
    'referral workflow',
    'implementation barrier',
    'advocacy brief',
  ],
  lens: {
    domain: 'community health evaluation',
    evidenceNoun: 'implementation evidence',
    decisionNoun: 'program decision',
    learnerRole: 'evaluation practitioner',
    exampleNoun: 'community implementation case',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'community needs assessment and equity framing',
      evidenceMove: 'use implementation evidence to define the community need',
      decisionMove: 'choose a program decision that centers health equity',
    },
    'lesson-2': {
      context: 'stakeholder mapping and engagement risk',
      evidenceMove: 'use stakeholder evidence to identify whose perspective is missing',
      decisionMove: 'choose an engagement decision that improves trust',
    },
    'lesson-3': {
      context: 'health equity data sources',
      evidenceMove: 'use implementation evidence to compare equity indicators',
      decisionMove: 'choose a data-source decision that avoids masking disparities',
    },
    'lesson-4': {
      context: 'logic model design and program theory',
      evidenceMove: 'use implementation evidence to test the logic model links',
      decisionMove: 'choose a program decision that aligns activities and outcomes',
    },
    'lesson-5': {
      context: 'screening and referral workflows',
      evidenceMove: 'use implementation evidence to trace the referral workflow',
      decisionMove: 'choose a workflow decision that reduces access barriers',
    },
    'lesson-6': {
      context: 'culturally responsive communication',
      evidenceMove: 'use stakeholder evidence to revise communication choices',
      decisionMove: 'choose a communication decision that protects dignity',
    },
    'lesson-7': {
      context: 'implementation barriers and facilitators',
      evidenceMove: 'use implementation evidence to rank barriers by impact',
      decisionMove: 'choose an adaptation decision that fits local constraints',
    },
    'lesson-8': {
      context: 'outcome indicator selection',
      evidenceMove: 'use implementation evidence to match outcome indicators to program aims',
      decisionMove: 'choose an indicator decision that supports responsible recommendations',
    },
  },
  styleNotes: [
    'Name the community health artifact before general evaluation advice.',
    'Tie feedback to equity, stakeholder evidence, implementation fit, and outcomes.',
    'Prefer community implementation cases over generic public-health examples.',
  ],
};

const COMMUNITY_HEALTH_EXTRA_GOLD_LESSON_PHRASES = {
  'lesson-9': {
    context: 'qualitative participant feedback',
    evidenceMove: 'use implementation evidence to connect participant feedback to program adaptation',
    decisionMove: 'choose a feedback-use decision that preserves participant voice',
  },
  'lesson-10': {
    context: 'mixed evidence for program adaptation',
    evidenceMove: 'use implementation evidence to compare outcome data and stakeholder feedback',
    decisionMove: 'choose an adaptation decision that fits mixed evidence',
  },
  'lesson-11': {
    context: 'ethics in community health evaluation',
    evidenceMove: 'use implementation evidence to identify equity and consent risks',
    decisionMove: 'choose an ethics decision that protects community trust',
  },
  'lesson-12': {
    context: 'policy evidence and advocacy briefs',
    evidenceMove: 'use implementation evidence to judge whether policy claims are supported',
    decisionMove: 'choose an advocacy decision that avoids overclaiming',
  },
  'lesson-13': {
    context: 'practitioner-facing findings',
    evidenceMove: 'use implementation evidence to translate findings for community partners',
    decisionMove: 'choose a communication decision that keeps limitations and equity visible',
  },
  'lesson-14': {
    context: 'community health evaluation portfolio',
    evidenceMove: 'use implementation evidence to connect revised evaluation artifacts into a portfolio',
    decisionMove: 'choose a portfolio decision that proves stakeholder, equity, and outcome reasoning',
  },
};

function communityHealthGoldExpectations(scope) {
  return {
    minQuality: GOLD_QUALITY_FLOOR,
    courseModality: 'field-applied',
    artifactGenres: Array(scope).fill('memo-brief'),
    packageMustMatch: [
      /health equity/i,
      /stakeholder evidence|stakeholder/i,
      /logic model/i,
      /implementation evidence/i,
      /program decision/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    features: {
      syllabus: {
        mustMatchAny: [
          [/community health evaluation/i, /health equity/i],
          [/logic model/i, /outcome indicator/i, /stakeholder/i],
        ],
      },
      lessonPlans: {
        mustMatch: [/implementation evidence/i, /program decision/i],
      },
      slideDecks: {
        mustMatch: [/implementation evidence/i, /program decision/i],
        mustMatchAny: [[/community implementation case/i, /logic model/i]],
      },
      assignments: {
        mustMatch: [/implementation evidence/i, /community health evaluation/i],
      },
      rubrics: {
        mustMatch: [/implementation evidence/i],
      },
      discussions: {
        mustMatch: [/implementation evidence/i, /program decision/i],
      },
      quizBank: {
        mustMatch: [/implementation evidence/i, /program decision/i],
      },
      studyGuides: {
        mustMatch: [/implementation evidence/i, /program decision/i],
      },
      courseFaq: {
        mustMatch: [/implementation evidence/i],
      },
    },
  };
}

const INTERACTION_DESIGN_STUDIO_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'prototype evidence',
    'studio critique',
    'usability test',
    'accessibility audit',
    'design system',
    'interaction flow',
    'portfolio rationale',
  ],
  lens: {
    domain: 'interaction design studio',
    evidenceNoun: 'prototype evidence',
    decisionNoun: 'design decision',
    learnerRole: 'studio designer',
    exampleNoun: 'studio critique case',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'design brief and user problem framing',
      evidenceMove: 'use prototype evidence to define the user problem',
      decisionMove: 'choose a design decision that fits the brief and user need',
    },
    'lesson-2': {
      context: 'research synthesis and journey mapping',
      evidenceMove: 'use prototype evidence to connect observations to journey pain points',
      decisionMove: 'choose a design decision that prioritizes the user workflow',
    },
    'lesson-3': {
      context: 'low-fidelity wireframes and interaction flows',
      evidenceMove: 'use prototype evidence to compare alternate interaction flows',
      decisionMove: 'choose a design decision that reduces friction',
    },
    'lesson-4': {
      context: 'studio critique and revision planning',
      evidenceMove: 'use studio critique evidence to identify the strongest revision',
      decisionMove: 'choose a design decision that responds to critique without losing intent',
    },
    'lesson-5': {
      context: 'visual hierarchy and design systems',
      evidenceMove: 'use prototype evidence to test hierarchy, spacing, and component consistency',
      decisionMove: 'choose a design-system decision that improves scanability',
    },
    'lesson-6': {
      context: 'usability testing and task success',
      evidenceMove: 'use usability test evidence to diagnose task failure',
      decisionMove: 'choose a design decision that improves completion and confidence',
    },
    'lesson-7': {
      context: 'accessibility audit and inclusive interaction',
      evidenceMove: 'use accessibility audit evidence to revise interaction details',
      decisionMove: 'choose an accessibility decision that supports equivalent use',
    },
    'lesson-8': {
      context: 'portfolio rationale and final presentation',
      evidenceMove: 'use prototype evidence to explain the design evolution',
      decisionMove: 'choose a portfolio decision that makes process and impact visible',
    },
  },
  styleNotes: [
    'Name the design artifact before giving studio guidance.',
    'Tie feedback to critique evidence, user needs, accessibility, and prototype revisions.',
    'Prefer studio critique cases over generic project examples.',
  ],
};

const SPANISH_HEALTHCARE_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'clinical Spanish',
    'patient interview',
    'role-play evidence',
    'symptom description',
    'cultural humility',
    'interpreter protocol',
    'discharge instructions',
  ],
  lens: {
    domain: 'Spanish for healthcare communication',
    evidenceNoun: 'role-play evidence',
    decisionNoun: 'clinical communication decision',
    learnerRole: 'healthcare communicator',
    exampleNoun: 'patient-care scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'clinical greetings and consent language',
      evidenceMove: 'use role-play evidence to verify respectful introductions',
      decisionMove: 'choose a clinical communication decision that protects patient dignity',
    },
    'lesson-2': {
      context: 'intake questions and patient history',
      evidenceMove: 'use role-play evidence to check accurate intake questions',
      decisionMove: 'choose a clinical communication decision that clarifies patient history',
    },
    'lesson-3': {
      context: 'symptom description and pain scale',
      evidenceMove: 'use role-play evidence to interpret symptom description accurately',
      decisionMove: 'choose a clinical communication decision that confirms pain severity',
    },
    'lesson-4': {
      context: 'medications and dosage instructions',
      evidenceMove: 'use role-play evidence to test medication instruction clarity',
      decisionMove: 'choose a clinical communication decision that reduces dosage confusion',
    },
    'lesson-5': {
      context: 'cultural humility and interpreter protocol',
      evidenceMove: 'use role-play evidence to identify cultural or interpreter support needs',
      decisionMove: 'choose a clinical communication decision that respects patient context',
    },
    'lesson-6': {
      context: 'triage urgency and safety instructions',
      evidenceMove: 'use role-play evidence to check urgent symptom escalation',
      decisionMove: 'choose a clinical communication decision that protects patient safety',
    },
    'lesson-7': {
      context: 'discharge instructions and follow-up',
      evidenceMove: 'use role-play evidence to verify patient understanding of next steps',
      decisionMove: 'choose a clinical communication decision that supports follow-up care',
    },
    'lesson-8': {
      context: 'final patient interview simulation',
      evidenceMove: 'use role-play evidence to evaluate complete patient interview performance',
      decisionMove: 'choose a clinical communication decision that integrates empathy and accuracy',
    },
  },
  styleNotes: [
    'Name the patient-care scenario before general language guidance.',
    'Tie feedback to vocabulary accuracy, patient safety, cultural humility, and interpreter protocol.',
    'Prefer simulated patient communication over generic language-practice examples.',
  ],
};

const CLINICAL_JUDGMENT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'clinical judgment',
    'patient-assessment evidence',
    'clinical care decision',
    'nursing diagnosis',
    'care plan',
    'SBAR handoff',
    'patient safety',
    'monitoring plan',
  ],
  lens: {
    domain: 'clinical judgment and care planning',
    evidenceNoun: 'patient-assessment evidence',
    decisionNoun: 'clinical care decision',
    learnerRole: 'clinical decision maker',
    exampleNoun: 'patient-care case',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'patient assessment and cue recognition',
      evidenceMove: 'use patient-assessment evidence to identify the most relevant clinical cues',
      decisionMove: 'choose a clinical care decision that protects patient safety',
    },
    'lesson-2': {
      context: 'nursing diagnosis and priority setting',
      evidenceMove: 'use patient-assessment evidence to support the priority nursing diagnosis',
      decisionMove: 'choose a clinical care decision that matches the highest patient risk',
    },
    'lesson-3': {
      context: 'medication safety and contraindication review',
      evidenceMove: 'use patient-assessment evidence to verify medication-safety risks',
      decisionMove: 'choose a clinical care decision that reduces medication harm',
    },
    'lesson-4': {
      context: 'intervention rationale and ADPIE care planning',
      evidenceMove: 'use patient-assessment evidence to justify the intervention rationale',
      decisionMove: 'choose a clinical care decision that fits the care-plan goal',
    },
    'lesson-5': {
      context: 'deteriorating patient escalation',
      evidenceMove: 'use patient-assessment evidence to recognize deterioration and escalation cues',
      decisionMove: 'choose a clinical care decision that escalates at the right moment',
    },
    'lesson-6': {
      context: 'monitoring plan and patient safety reassessment',
      evidenceMove: 'use patient-assessment evidence to test whether monitoring is sufficient',
      decisionMove: 'choose a clinical care decision that updates the safety plan',
    },
    'lesson-7': {
      context: 'SBAR handoff and interdisciplinary communication',
      evidenceMove: 'use patient-assessment evidence to make the SBAR handoff clinically useful',
      decisionMove: 'choose a clinical care decision that another clinician can act on',
    },
    'lesson-8': {
      context: 'integrated clinical judgment map and care-plan debrief',
      evidenceMove: 'use patient-assessment evidence to defend the complete care plan',
      decisionMove: 'choose a clinical care decision that integrates diagnosis, intervention, monitoring, and handoff',
    },
  },
  styleNotes: [
    'Name the patient-care case before giving general care-planning advice.',
    'Tie feedback to assessment data, cue recognition, prioritization, patient safety, monitoring, and SBAR handoff clarity.',
    'Prefer nursing care-plan decisions over generic healthcare role-play examples.',
  ],
};

const CLINICAL_PLACEMENT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'clinical placement',
    'supervised clinical evidence',
    'clinical placement decision',
    'preceptor feedback',
    'deidentified patient-care evidence',
    'competency log',
    'scope of practice',
    'patient safety',
  ],
  lens: {
    domain: 'clinical placement practice',
    evidenceNoun: 'supervised clinical evidence',
    decisionNoun: 'clinical placement decision',
    learnerRole: 'clinical placement practitioner',
    exampleNoun: 'patient-care placement scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'clinical site orientation and confidentiality',
      evidenceMove: 'use supervised clinical evidence to confirm site readiness and confidentiality',
      decisionMove: 'choose a clinical placement decision that respects scope of practice',
    },
    'lesson-2': {
      context: 'deidentified patient encounter logs',
      evidenceMove: 'use supervised clinical evidence to connect patient-care observations to safety actions',
      decisionMove: 'choose a clinical placement decision that protects patient safety',
    },
    'lesson-3': {
      context: 'preceptor feedback and next-shift planning',
      evidenceMove: 'use supervised clinical evidence to interpret preceptor feedback',
      decisionMove: 'choose a clinical placement decision that improves the next shift',
    },
    'lesson-4': {
      context: 'skills checklist and competency logging',
      evidenceMove: 'use supervised clinical evidence to support competency-log claims',
      decisionMove: 'choose a clinical placement decision that fits the competency target',
    },
    'lesson-5': {
      context: 'handoff boundaries and patient-safety communication',
      evidenceMove: 'use supervised clinical evidence to test handoff clarity and boundary awareness',
      decisionMove: 'choose a clinical placement decision that another clinician can act on',
    },
    'lesson-6': {
      context: 'site evaluation and scope-of-practice reflection',
      evidenceMove: 'use supervised clinical evidence to separate site facts from assumptions',
      decisionMove: 'choose a clinical placement decision that stays within scope',
    },
    'lesson-7': {
      context: 'competency remediation and supervision questions',
      evidenceMove: 'use supervised clinical evidence to identify the next supervision question',
      decisionMove: 'choose a clinical placement decision that supports competency growth',
    },
    'lesson-8': {
      context: 'clinical placement portfolio and transfer plan',
      evidenceMove: 'use supervised clinical evidence to defend the final placement portfolio',
      decisionMove:
        'choose a clinical placement decision that transfers patient safety, preceptor feedback, and competency evidence to the next placement',
    },
  },
  styleNotes: [
    'Name the clinical placement artifact before giving general practice advice.',
    'Tie feedback to deidentified patient-care evidence, preceptor feedback, confidentiality, scope of practice, competency progression, and patient safety.',
    'Prefer supervised placement evidence over simulated role-play or generic field reflection examples.',
  ],
};

const BEGINNING_SPANISH_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'target-language',
    'interpersonal dialogue',
    'interpretive listening',
    'presentational speaking',
    'pronunciation focus',
    'grammar accuracy',
    'cultural comparison',
    'proficiency task',
  ],
  lens: {
    domain: 'communicative Spanish language learning',
    evidenceNoun: 'language-use evidence',
    decisionNoun: 'communication choice',
    learnerRole: 'language learner',
    exampleNoun: 'communicative scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'greetings, introductions, and courtesy register',
      evidenceMove: 'use language-use evidence to check whether the greeting is comprehensible and respectful',
      decisionMove: 'choose a communication choice that fits the relationship and formality level',
    },
    'lesson-2': {
      context: 'classroom requests and clarification strategies',
      evidenceMove: 'use language-use evidence to show how the request keeps communication moving',
      decisionMove: 'choose a communication choice that repairs misunderstanding in Spanish',
    },
    'lesson-3': {
      context: 'family descriptions and adjective agreement',
      evidenceMove: 'use language-use evidence to connect adjective agreement to meaning',
      decisionMove: 'choose a communication choice that makes the description accurate and understandable',
    },
    'lesson-4': {
      context: 'daily routines and present-tense verbs',
      evidenceMove: 'use language-use evidence to make the routine sequence clear',
      decisionMove: 'choose a communication choice that matches person, number, and meaning',
    },
    'lesson-5': {
      context: 'food ordering, preferences, and service encounters',
      evidenceMove: 'use language-use evidence to test whether preferences and quantities are clear',
      decisionMove: 'choose a communication choice that works in a real service exchange',
    },
    'lesson-6': {
      context: 'directions, community places, and route descriptions',
      evidenceMove: 'use language-use evidence to verify that directions can be followed',
      decisionMove: 'choose a communication choice that clarifies location, sequence, and politeness',
    },
    'lesson-7': {
      context: 'past experiences and narration',
      evidenceMove: 'use language-use evidence to distinguish completed actions from background details',
      decisionMove: 'choose a communication choice that makes the story understandable to a listener',
    },
    'lesson-8': {
      context: 'final integrated interpersonal and presentational task',
      evidenceMove: 'use language-use evidence to integrate listening, speaking, grammar, and culture',
      decisionMove: 'choose a communication choice that improves final proficiency performance',
    },
  },
  styleNotes: [
    'Name the communicative task before giving grammar advice.',
    'Tie feedback to comprehensibility, accuracy, pronunciation, cultural fit, and revised target-language use.',
    'Prefer realistic language-use scenarios over isolated grammar drills.',
  ],
};

const FIELD_PLACEMENT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'field placement',
    'site evidence',
    'stakeholder interview',
    'supervision note',
    'implementation constraint',
    'community asset map',
    'case handoff',
    'professional boundary',
  ],
  lens: {
    domain: 'field placement practice',
    evidenceNoun: 'field evidence',
    decisionNoun: 'placement decision',
    learnerRole: 'field practitioner',
    exampleNoun: 'site-based practice scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'field placement roles and site expectations',
      evidenceMove: 'use field evidence to separate site facts from assumptions',
      decisionMove: 'choose a placement decision that fits the site role and learning contract',
    },
    'lesson-2': {
      context: 'stakeholder interviews and community context',
      evidenceMove: 'use stakeholder interview evidence to identify whose perspective is represented',
      decisionMove: 'choose a placement decision that improves stakeholder fit',
    },
    'lesson-3': {
      context: 'community asset mapping and service gaps',
      evidenceMove: 'use field evidence to connect assets, gaps, and local constraints',
      decisionMove: 'choose a placement decision that builds on community strengths',
    },
    'lesson-4': {
      context: 'supervision notes and professional reflection',
      evidenceMove: 'use supervision note evidence to name a practice pattern that needs adjustment',
      decisionMove: 'choose a placement decision that responds to supervisor feedback',
    },
    'lesson-5': {
      context: 'implementation constraints and referral pathways',
      evidenceMove: 'use field evidence to test whether a referral or service pathway is feasible',
      decisionMove: 'choose a placement decision that accounts for implementation constraints',
    },
    'lesson-6': {
      context: 'professional boundaries and ethical site practice',
      evidenceMove: 'use field evidence to distinguish boundary risk from ordinary support',
      decisionMove: 'choose a placement decision that protects clients, site partners, and students',
    },
    'lesson-7': {
      context: 'case handoff and continuity planning',
      evidenceMove: 'use field evidence to decide what must travel into the handoff',
      decisionMove: 'choose a placement decision that supports continuity without overclaiming',
    },
    'lesson-8': {
      context: 'final field integration and professional growth',
      evidenceMove: 'use field evidence to show growth across site work, supervision, and stakeholder feedback',
      decisionMove: 'choose a placement decision that translates learning into the next field setting',
    },
  },
  styleNotes: [
    'Name the site-based artifact before giving general practice advice.',
    'Tie feedback to stakeholder evidence, supervision, boundaries, and implementation constraints.',
    'Prefer site-based practice scenarios over generic reflection prompts.',
  ],
};

const BIOLOGY_LAB_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'lab safety',
    'aseptic technique',
    'experimental variable',
    'lab notebook',
    'raw observation',
    'data table',
    'protocol deviation',
    'conclusion limit',
  ],
  lens: {
    domain: 'biology laboratory methods',
    evidenceNoun: 'lab evidence',
    decisionNoun: 'experimental decision',
    learnerRole: 'laboratory student',
    exampleNoun: 'wet-lab scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'lab safety, PPE, and observation records',
      evidenceMove: 'use lab evidence to verify safety, PPE, and raw observation quality',
      decisionMove: 'choose an experimental decision that protects safety and data integrity',
    },
    'lesson-2': {
      context: 'measurement, pipetting, and uncertainty',
      evidenceMove: 'use lab evidence to compare precision, accuracy, and measurement uncertainty',
      decisionMove: 'choose an experimental decision that improves measurement reliability',
    },
    'lesson-3': {
      context: 'experimental variables and control groups',
      evidenceMove: 'use lab evidence to distinguish independent, dependent, and controlled variables',
      decisionMove: 'choose an experimental decision that strengthens the control design',
    },
    'lesson-4': {
      context: 'lab notebook documentation and raw observation',
      evidenceMove: 'use lab evidence to preserve raw observations before interpretation',
      decisionMove: 'choose an experimental decision that makes the notebook audit-ready',
    },
    'lesson-5': {
      context: 'serial dilution, calculations, and data tables',
      evidenceMove: 'use lab evidence to check dilution math and table structure',
      decisionMove: 'choose an experimental decision that reduces calculation or recording error',
    },
    'lesson-6': {
      context: 'microscopy, specimen evidence, and plate counts',
      evidenceMove: 'use lab evidence to compare specimen observations and count reliability',
      decisionMove: 'choose an experimental decision that improves observation consistency',
    },
    'lesson-7': {
      context: 'enzyme assay data and conclusion limits',
      evidenceMove: 'use lab evidence to interpret assay patterns without overclaiming',
      decisionMove: 'choose an experimental decision that respects the data limitation',
    },
    'lesson-8': {
      context: 'contamination troubleshooting and protocol revision',
      evidenceMove: 'use lab evidence to diagnose contamination or protocol deviation',
      decisionMove: 'choose an experimental decision that repairs the protocol for the next run',
    },
  },
  styleNotes: [
    'Name the lab artifact before giving general science advice.',
    'Tie feedback to safety, protocol accuracy, raw observations, data integrity, and conclusion limits.',
    'Prefer wet-lab scenarios over generic analysis examples.',
  ],
};

const MULTI_SECTION_SEMINAR_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'close reading',
    'historical context',
    'translation choice',
    'genre convention',
    'comparative passage',
    'critical lens',
    'seminar evidence',
    'interpretive claim',
  ],
  lens: {
    domain: 'comparative literature seminar',
    evidenceNoun: 'literary evidence',
    decisionNoun: 'interpretive decision',
    learnerRole: 'seminar reader',
    exampleNoun: 'comparative text case',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'close reading and historical context',
      evidenceMove: 'use literary evidence from passage details and historical context',
      decisionMove: 'choose an interpretive decision that keeps text and context connected',
    },
    'lesson-2': {
      context: 'narrative voice and translation choice',
      evidenceMove: 'use literary evidence to compare narrative voice and translation choice',
      decisionMove: 'choose an interpretive decision that explains what the translation changes',
    },
    'lesson-3': {
      context: 'genre convention and social setting',
      evidenceMove: 'use literary evidence to connect genre convention with social setting',
      decisionMove: 'choose an interpretive decision that avoids flattening genre difference',
    },
    'lesson-4': {
      context: 'poetic form and performance context',
      evidenceMove: 'use literary evidence to connect form, sound, and performance context',
      decisionMove: 'choose an interpretive decision that makes form visible',
    },
    'lesson-5': {
      context: 'critical lens and archive note',
      evidenceMove: 'use literary evidence to test a critical lens against archive context',
      decisionMove: 'choose an interpretive decision that names the lens limit',
    },
    'lesson-6': {
      context: 'adaptation evidence and medium shift',
      evidenceMove: 'use literary evidence to compare adaptation changes across media',
      decisionMove: 'choose an interpretive decision that explains what the medium changes',
    },
    'lesson-7': {
      context: 'comparative passage and scholarly conversation',
      evidenceMove: 'use literary evidence to place two passages in scholarly conversation',
      decisionMove: 'choose an interpretive decision that makes the comparison arguable',
    },
    'lesson-8': {
      context: 'final interpretive portfolio and revision',
      evidenceMove: 'use literary evidence to revise the final interpretive portfolio',
      decisionMove: 'choose an interpretive decision that synthesizes text, context, and feedback',
    },
  },
  styleNotes: [
    'Name the passage, context section, and interpretive claim before general seminar advice.',
    'Tie feedback to close reading, historical context, translation choices, and revision of claims.',
    'Prefer comparative text cases over generic discussion examples.',
  ],
};

const ONLINE_WRITING_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'asynchronous discussion',
    'LMS checkpoint',
    'peer annotation',
    'revision memo',
    'source integration',
    'online feedback loop',
    'accessibility check',
    'version history',
  ],
  lens: {
    domain: 'online academic writing workshop',
    evidenceNoun: 'online writing evidence',
    decisionNoun: 'revision decision',
    learnerRole: 'online writing student',
    exampleNoun: 'asynchronous draft case',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'online orientation and participation plan',
      evidenceMove: 'use online writing evidence to make participation visible before the first draft',
      decisionMove: 'choose a revision decision that fits the course-site workflow',
    },
    'lesson-2': {
      context: 'discussion-board claims and reply moves',
      evidenceMove: 'use online writing evidence from posts and replies to test claim clarity',
      decisionMove: 'choose a revision decision that turns a reply into a stronger claim',
    },
    'lesson-3': {
      context: 'source summary and attribution',
      evidenceMove: 'use online writing evidence to distinguish summary, paraphrase, and source signal',
      decisionMove: 'choose a revision decision that improves attribution without overquoting',
    },
    'lesson-4': {
      context: 'thesis control and paragraph evidence',
      evidenceMove: 'use online writing evidence to check whether paragraphs support the thesis',
      decisionMove: 'choose a revision decision that makes paragraph evidence accountable',
    },
    'lesson-5': {
      context: 'peer annotation and revision plan',
      evidenceMove: 'use online writing evidence from annotations to prioritize revision',
      decisionMove: 'choose a revision decision that responds to a specific peer note',
    },
    'lesson-6': {
      context: 'multimodal explanation and accessibility check',
      evidenceMove: 'use online writing evidence to verify accessibility and audience fit',
      decisionMove: 'choose a revision decision that preserves meaning across formats',
    },
    'lesson-7': {
      context: 'feedback integration and version history',
      evidenceMove: 'use online writing evidence to compare draft versions and feedback changes',
      decisionMove: 'choose a revision decision that documents what changed and why',
    },
    'lesson-8': {
      context: 'final revision memo and transfer reflection',
      evidenceMove: 'use online writing evidence to synthesize draft growth and transfer goals',
      decisionMove: 'choose a revision decision that carries into future online writing work',
    },
  },
  styleNotes: [
    'Name the LMS checkpoint or online draft artifact before giving general writing advice.',
    'Tie feedback to asynchronous discussion, peer annotation, source integrity, and revision evidence.',
    'Prefer asynchronous draft cases over generic classroom workshop examples.',
  ],
};

const QUANTITATIVE_PROBLEM_SET_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'worked solution',
    'equation setup',
    'solution check',
    'graph annotation',
    'error analysis',
    'representation choice',
    'proof rationale',
    'optimization model',
  ],
  lens: {
    domain: 'college algebra problem solving',
    evidenceNoun: 'worked-solution evidence',
    decisionNoun: 'solution strategy decision',
    learnerRole: 'quantitative problem solver',
    exampleNoun: 'worked algebra example',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'linear equations and solution checks',
      evidenceMove: 'use worked-solution evidence to verify each equation step',
      decisionMove: 'choose a solution strategy decision that makes the answer check visible',
    },
    'lesson-2': {
      context: 'function graphs and representation choice',
      evidenceMove: 'use worked-solution evidence to connect equation, table, and graph',
      decisionMove: 'choose a solution strategy decision that explains the representation choice',
    },
    'lesson-3': {
      context: 'systems of equations and substitution',
      evidenceMove: 'use worked-solution evidence to compare substitution and elimination paths',
      decisionMove: 'choose a solution strategy decision that minimizes algebra errors',
    },
    'lesson-4': {
      context: 'quadratic factoring and zero-product reasoning',
      evidenceMove: 'use worked-solution evidence to connect factor form to roots',
      decisionMove: 'choose a solution strategy decision that checks roots against the original equation',
    },
    'lesson-5': {
      context: 'exponential rules and model interpretation',
      evidenceMove: 'use worked-solution evidence to justify exponent-rule choices',
      decisionMove: 'choose a solution strategy decision that keeps units and growth meaning visible',
    },
    'lesson-6': {
      context: 'logarithms and inverse reasoning',
      evidenceMove: 'use worked-solution evidence to show inverse steps and domain checks',
      decisionMove: 'choose a solution strategy decision that avoids invalid logarithm moves',
    },
    'lesson-7': {
      context: 'optimization model and constraint testing',
      evidenceMove: 'use worked-solution evidence to define variables, constraints, and objective',
      decisionMove: 'choose a solution strategy decision that verifies the optimum against constraints',
    },
    'lesson-8': {
      context: 'proof rationale and final error analysis',
      evidenceMove: 'use worked-solution evidence to diagnose errors and justify the corrected proof',
      decisionMove: 'choose a solution strategy decision that transfers to a new problem type',
    },
  },
  styleNotes: [
    'Name the worked problem or representation before giving general math advice.',
    'Tie feedback to setup, step logic, answer verification, graph/equation fit, and error analysis.',
    'Prefer worked algebra examples over generic classroom examples.',
  ],
};

const STATISTICS_INFERENCE_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'statistical inference',
    'confidence interval',
    'hypothesis test',
    'p-value explanation',
    'assumption check',
    'effect size',
    'uncertainty interpretation',
    'inference decision',
  ],
  lens: {
    domain: 'statistical inference',
    evidenceNoun: 'statistical evidence',
    decisionNoun: 'inference decision',
    learnerRole: 'statistical analyst',
    exampleNoun: 'inference scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'statistical questions, variables, and samples',
      evidenceMove: 'use statistical evidence to connect the question, variable, and sample',
      decisionMove: 'choose an inference decision that matches the population claim',
    },
    'lesson-2': {
      context: 'sampling distributions and standard error',
      evidenceMove: 'use statistical evidence to explain standard error and sampling variability',
      decisionMove: 'choose an inference decision that keeps uncertainty visible',
    },
    'lesson-3': {
      context: 'confidence intervals and margin of error',
      evidenceMove: 'use statistical evidence to interpret the confidence interval in context',
      decisionMove: 'choose an inference decision that names interval uncertainty and limitations',
    },
    'lesson-4': {
      context: 'hypothesis tests and p-values',
      evidenceMove: 'use statistical evidence to trace the null hypothesis, test statistic, and p-value',
      decisionMove: 'choose an inference decision that avoids overclaiming significance',
    },
    'lesson-5': {
      context: 'two-sample comparisons and effect size',
      evidenceMove: 'use statistical evidence to compare groups with effect size and uncertainty',
      decisionMove: 'choose an inference decision that separates significance from practical importance',
    },
    'lesson-6': {
      context: 'chi-square tests and association',
      evidenceMove: 'use statistical evidence to connect expected counts, association, and assumptions',
      decisionMove: 'choose an inference decision that respects categorical-data limits',
    },
    'lesson-7': {
      context: 'regression inference and assumption checks',
      evidenceMove: 'use statistical evidence to interpret slope, uncertainty, and residual assumptions',
      decisionMove: 'choose an inference decision that names model fit and prediction limits',
    },
    'lesson-8': {
      context: 'final statistical inference report',
      evidenceMove: 'use statistical evidence to synthesize question, assumptions, output, and limitations',
      decisionMove: 'choose an inference decision that is ready for audience review',
    },
  },
  styleNotes: [
    'Name the question, variable or parameter, sample, and assumption before interpreting output.',
    'Tie feedback to interval/test accuracy, uncertainty language, effect size, assumptions, limitations, and inference decisions.',
    'Prefer inference scenarios over generic data or formula examples.',
  ],
};

const ACCOUNTING_FINANCE_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'financial evidence',
    'journal entry',
    'statement effect',
    'ratio analysis',
    'cash-flow interpretation',
    'budget variance',
    'valuation assumption',
    'financial decision',
  ],
  lens: {
    domain: 'accounting and finance analysis',
    evidenceNoun: 'financial evidence',
    decisionNoun: 'financial decision',
    learnerRole: 'financial analyst',
    exampleNoun: 'financial statement scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'transactions, accounts, and journal entries',
      evidenceMove: 'use financial evidence to connect source documents, debits, credits, and accounts',
      decisionMove: 'choose a financial decision that preserves the statement effect',
    },
    'lesson-2': {
      context: 'adjusting entries and trial balance',
      evidenceMove: 'use financial evidence to test accrual adjustments and trial-balance checks',
      decisionMove: 'choose a financial decision that corrects the ledger before reporting',
    },
    'lesson-3': {
      context: 'financial statements and statement linkage',
      evidenceMove: 'use financial evidence to trace balance sheet, income statement, and cash-flow links',
      decisionMove: 'choose a financial decision that keeps statement effects visible',
    },
    'lesson-4': {
      context: 'ratio analysis and liquidity',
      evidenceMove: 'use financial evidence to calculate ratios and interpret working-capital risk',
      decisionMove: 'choose a financial decision that separates ratio math from decision usefulness',
    },
    'lesson-5': {
      context: 'cash-flow forecast and working capital',
      evidenceMove: 'use financial evidence to connect cash inflows, outflows, and working-capital assumptions',
      decisionMove: 'choose a financial decision that names cash-flow risk',
    },
    'lesson-6': {
      context: 'budget variance and contribution margin',
      evidenceMove: 'use financial evidence to explain variance drivers and contribution-margin changes',
      decisionMove: 'choose a financial decision that distinguishes price, volume, and cost effects',
    },
    'lesson-7': {
      context: 'valuation model and NPV assumptions',
      evidenceMove: 'use financial evidence to test discounted cash-flow assumptions and valuation sensitivity',
      decisionMove: 'choose a financial decision that names assumption risk',
    },
    'lesson-8': {
      context: 'final financial analysis handoff',
      evidenceMove: 'use financial evidence to synthesize statements, ratios, cash flow, controls, and assumptions',
      decisionMove: 'choose a financial decision that is ready for management review',
    },
  },
  styleNotes: [
    'Name the source document, account, statement line, and assumption before giving financial advice.',
    'Tie feedback to account classification, statement linkage, calculation accuracy, control checks, assumptions, and decision usefulness.',
    'Prefer financial statement scenarios over generic business cases or arithmetic worksheets.',
  ],
};

const POLICY_ANALYSIS_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'policy evidence',
    'policy memo',
    'stakeholder analysis',
    'equity analysis',
    'feasibility constraint',
    'implementation risk',
    'policy option',
    'policy decision',
  ],
  lens: {
    domain: 'public policy analysis',
    evidenceNoun: 'policy evidence',
    decisionNoun: 'policy decision',
    learnerRole: 'policy analyst',
    exampleNoun: 'policy memo scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'problem definition and policy authority',
      evidenceMove: 'use policy evidence to connect the public problem, authority, and affected population',
      decisionMove: 'choose a policy decision that names the decision maker and evidence limit',
    },
    'lesson-2': {
      context: 'evidence sources and causal logic',
      evidenceMove: 'use policy evidence to test source credibility and causal assumptions',
      decisionMove: 'choose a policy decision that separates evidence strength from advocacy',
    },
    'lesson-3': {
      context: 'stakeholder mapping and equity analysis',
      evidenceMove: 'use policy evidence to map stakeholder effects and equity consequences',
      decisionMove: 'choose a policy decision that makes distributional tradeoffs explicit',
    },
    'lesson-4': {
      context: 'policy options and cost-benefit tradeoffs',
      evidenceMove: 'use policy evidence to compare options, costs, benefits, and constraints',
      decisionMove: 'choose a policy decision that balances public value and feasibility',
    },
    'lesson-5': {
      context: 'implementation design and administrative burden',
      evidenceMove: 'use policy evidence to identify implementation steps and burden risks',
      decisionMove: 'choose a policy decision that names what must happen for delivery',
    },
    'lesson-6': {
      context: 'regulatory and governance analysis',
      evidenceMove: 'use policy evidence to test authority, accountability, and compliance risks',
      decisionMove: 'choose a policy decision that respects governance constraints',
    },
    'lesson-7': {
      context: 'program evaluation and impact assessment',
      evidenceMove: 'use policy evidence to connect outcomes, indicators, and evaluation limits',
      decisionMove: 'choose a policy decision that names impact evidence and uncertainty',
    },
    'lesson-8': {
      context: 'final policy memo handoff',
      evidenceMove: 'use policy evidence to synthesize problem, options, equity, feasibility, and implementation',
      decisionMove: 'choose a policy decision that is ready for public-sector review',
    },
  },
  styleNotes: [
    'Name the public problem, decision authority, affected population, and evidence source before recommending action.',
    'Tie feedback to stakeholder representation, equity reasoning, feasibility, implementation risk, and decision usefulness.',
    'Prefer policy memo scenarios over generic business cases or civic reflection.',
  ],
};

const ECONOMICS_ANALYSIS_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'economic evidence',
    'supply and demand',
    'market equilibrium',
    'elasticity',
    'consumer surplus',
    'deadweight loss',
    'tax incidence',
    'economic decision',
  ],
  lens: {
    domain: 'economics analysis',
    evidenceNoun: 'economic evidence',
    decisionNoun: 'economic decision',
    learnerRole: 'economic analyst',
    exampleNoun: 'market analysis scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'scarcity, opportunity cost, and marginal thinking',
      evidenceMove: 'use economic evidence to connect scarcity, opportunity cost, and marginal benefit',
      decisionMove: 'choose an economic decision that names the tradeoff and assumption',
    },
    'lesson-2': {
      context: 'supply, demand, and market equilibrium',
      evidenceMove: 'use economic evidence to trace a supply-demand shift and equilibrium effect',
      decisionMove: 'choose an economic decision that follows the comparative statics',
    },
    'lesson-3': {
      context: 'elasticity and revenue effects',
      evidenceMove: 'use economic evidence to estimate elasticity and predict revenue or burden changes',
      decisionMove: 'choose an economic decision that respects responsiveness to price',
    },
    'lesson-4': {
      context: 'consumer surplus, producer surplus, and price controls',
      evidenceMove: 'use economic evidence to compare surplus, shortage, and deadweight loss',
      decisionMove: 'choose an economic decision that names the welfare effect',
    },
    'lesson-5': {
      context: 'tax incidence and distributional burden',
      evidenceMove: 'use economic evidence to connect elasticity, tax burden, and surplus loss',
      decisionMove: 'choose an economic decision that separates legal liability from economic incidence',
    },
    'lesson-6': {
      context: 'externalities and market failure',
      evidenceMove: 'use economic evidence to identify external costs, benefits, and incentive design',
      decisionMove: 'choose an economic decision that addresses the market failure without overclaiming',
    },
    'lesson-7': {
      context: 'market structure and pricing power',
      evidenceMove: 'use economic evidence to compare competition, monopoly power, marginal cost, and pricing',
      decisionMove: 'choose an economic decision that names the market-structure assumption',
    },
    'lesson-8': {
      context: 'final economic analysis handoff',
      evidenceMove: 'use economic evidence to synthesize market context, assumptions, incentives, welfare, and limits',
      decisionMove: 'choose an economic decision that is ready for applied review',
    },
  },
  styleNotes: [
    'Name the market, actors, assumptions, model, and economic effect before recommending action.',
    'Tie feedback to model fit, comparative statics, elasticity, welfare, distributional effects, assumptions, and decision usefulness.',
    'Prefer economic analysis briefs over generic policy reflection, business cases, or arithmetic worksheets.',
  ],
};

const ETHICS_ARGUMENT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'moral argument evidence',
    'normative framework',
    'argument map',
    'thought experiment',
    'objection',
    'reply',
    'stakeholder harm',
    'moral decision',
  ],
  lens: {
    domain: 'ethics argumentation',
    evidenceNoun: 'moral argument evidence',
    decisionNoun: 'moral decision',
    learnerRole: 'ethical reasoner',
    exampleNoun: 'ethical dilemma scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'moral arguments and normative frameworks',
      evidenceMove: 'use moral argument evidence to connect claim, reasons, principle, and decision limit',
      decisionMove: 'choose a moral decision that states the framework and strongest reason',
    },
    'lesson-2': {
      context: 'utilitarianism and consequences',
      evidenceMove: 'use moral argument evidence to weigh consequences, stakeholders, and aggregate harm',
      decisionMove: 'choose a moral decision that names the utilitarian tradeoff',
    },
    'lesson-3': {
      context: 'deontology, rights, and duties',
      evidenceMove: 'use moral argument evidence to compare rights, duties, and constraints on action',
      decisionMove: 'choose a moral decision that explains which duty governs the case',
    },
    'lesson-4': {
      context: 'virtue ethics and care ethics',
      evidenceMove: 'use moral argument evidence to connect character, relationships, care, and practical wisdom',
      decisionMove: 'choose a moral decision that preserves the relevant virtue or care obligation',
    },
    'lesson-5': {
      context: 'justice, fairness, and distribution',
      evidenceMove: 'use moral argument evidence to compare fairness, burden, benefit, and procedural justice',
      decisionMove: 'choose a moral decision that names the justice principle and unresolved tension',
    },
    'lesson-6': {
      context: 'thought experiments and counterexamples',
      evidenceMove: 'use moral argument evidence to test the principle against a thought experiment or counterexample',
      decisionMove: 'choose a moral decision that survives the strongest case pressure',
    },
    'lesson-7': {
      context: 'applied ethics case analysis',
      evidenceMove: 'use moral argument evidence to apply framework, stakeholder harm, objection, and reply to a case',
      decisionMove: 'choose a moral decision that is defensible for the applied dilemma',
    },
    'lesson-8': {
      context: 'final ethical argument handoff',
      evidenceMove: 'use moral argument evidence to synthesize claim, framework, objection, reply, and judgment limit',
      decisionMove: 'choose a moral decision that is ready for ethical review',
    },
  },
  styleNotes: [
    'Name the moral issue, affected parties, framework, claim, reasons, objection, and reply before judging the case.',
    'Tie feedback to framework fit, reason support, objection strength, reply quality, stakeholder sensitivity, and judgment limits.',
    'Prefer ethical argument briefs over generic reflection, legal doctrine, policy analysis, or personal opinion prompts.',
  ],
};

const PROOF_SEMINAR_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'proof evidence',
    'theorem proof',
    'definition use',
    'quantifier precision',
    'counterexample test',
    'proof strategy',
    'logical implication',
    'proof revision',
  ],
  lens: {
    domain: 'proof-based mathematics seminar',
    evidenceNoun: 'proof evidence',
    decisionNoun: 'proof-strategy decision',
    learnerRole: 'mathematical proof writer',
    exampleNoun: 'theorem proof scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'definitions, quantifiers, and direct proof',
      evidenceMove: 'use proof evidence to connect definitions, hypotheses, and justified implications',
      decisionMove: 'choose a proof-strategy decision that makes the theorem statement testable',
    },
    'lesson-2': {
      context: 'contrapositive and contradiction proof',
      evidenceMove: 'use proof evidence to compare direct, contrapositive, and contradiction paths',
      decisionMove: 'choose a proof-strategy decision that fits the claim structure',
    },
    'lesson-3': {
      context: 'mathematical induction and recursive structure',
      evidenceMove: 'use proof evidence to connect base case, induction hypothesis, and induction step',
      decisionMove: 'choose a proof-strategy decision that protects the induction logic',
    },
    'lesson-4': {
      context: 'epsilon-delta limits and quantifier order',
      evidenceMove: 'use proof evidence to track quantifier order and epsilon-delta dependencies',
      decisionMove: 'choose a proof-strategy decision that keeps dependencies explicit',
    },
    'lesson-5': {
      context: 'counterexamples and missing hypotheses',
      evidenceMove: 'use proof evidence to test theorem conditions with counterexamples',
      decisionMove: 'choose a proof-strategy decision that names the missing hypothesis',
    },
    'lesson-6': {
      context: 'lemma chains and theorem structure',
      evidenceMove: 'use proof evidence to connect lemmas, definitions, and theorem conclusion',
      decisionMove: 'choose a proof-strategy decision that makes the lemma chain coherent',
    },
    'lesson-7': {
      context: 'proof critique and notation clarity',
      evidenceMove: 'use proof evidence to diagnose gaps, notation ambiguity, and unsupported implications',
      decisionMove: 'choose a proof-strategy decision that improves validity and readability',
    },
    'lesson-8': {
      context: 'final proof portfolio and transfer theorem',
      evidenceMove: 'use proof evidence to synthesize definitions, proof strategies, counterexamples, and revisions',
      decisionMove: 'choose a proof-strategy decision that transfers to a new theorem proof',
    },
  },
  styleNotes: [
    'Name the theorem, definition, hypothesis, and proof step before giving general math feedback.',
    'Tie feedback to definition use, quantifier precision, logical validity, counterexample pressure, notation clarity, and proof revision.',
    'Prefer theorem proof scenarios over generic calculation or answer-check examples.',
  ],
};

const LECTURE_EXAM_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'retrieval practice',
    'concept check',
    'practice quiz',
    'misconception repair',
    'exam blueprint',
    'confidence rating',
    'corrected explanation',
    'exam-style transfer',
  ],
  lens: {
    domain: 'introductory psychology lecture',
    evidenceNoun: 'concept-check evidence',
    decisionNoun: 'exam-readiness decision',
    learnerRole: 'conceptual learner',
    exampleNoun: 'lecture concept example',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'scientific thinking and psychology claims',
      evidenceMove: 'use concept-check evidence to distinguish theory, hypothesis, and opinion',
      decisionMove: 'choose an exam-readiness decision that repairs the reasoning misconception',
    },
    'lesson-2': {
      context: 'neurons and neural communication',
      evidenceMove: 'use concept-check evidence to explain signaling instead of memorizing labels',
      decisionMove: 'choose an exam-readiness decision that links vocabulary to causal reasoning',
    },
    'lesson-3': {
      context: 'sensation, perception, and attention',
      evidenceMove: 'use concept-check evidence to separate sensory input from perceptual interpretation',
      decisionMove: 'choose an exam-readiness decision that corrects the perception misconception',
    },
    'lesson-4': {
      context: 'learning and conditioning',
      evidenceMove: 'use concept-check evidence to classify conditioning examples accurately',
      decisionMove: 'choose an exam-readiness decision that handles a new conditioning scenario',
    },
    'lesson-5': {
      context: 'memory encoding and retrieval',
      evidenceMove: 'use concept-check evidence to connect encoding, storage, and retrieval',
      decisionMove: 'choose an exam-readiness decision that improves retrieval practice',
    },
    'lesson-6': {
      context: 'development across the lifespan',
      evidenceMove: 'use concept-check evidence to compare developmental claims and limits',
      decisionMove: 'choose an exam-readiness decision that avoids stage-label overgeneralization',
    },
    'lesson-7': {
      context: 'social cognition and bias',
      evidenceMove: 'use concept-check evidence to diagnose attribution and bias errors',
      decisionMove: 'choose an exam-readiness decision that transfers the bias concept to a new case',
    },
    'lesson-8': {
      context: 'disorders, treatment, and final exam integration',
      evidenceMove: 'use concept-check evidence to separate symptom recognition from treatment reasoning',
      decisionMove: 'choose an exam-readiness decision that integrates concepts for the final exam',
    },
  },
  styleNotes: [
    'Name the exam concept, misconception, and corrected explanation before giving general study advice.',
    'Tie feedback to retrieval strength, confidence calibration, misconception repair, and exam-style transfer.',
    'Prefer lecture concept examples over generic classroom examples.',
  ],
};

const CAPSTONE_PROJECT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'project charter',
    'sponsor constraint',
    'milestone evidence',
    'decision log',
    'feasibility risk',
    'portfolio defense',
    'final showcase',
    'implementation roadmap',
  ],
  lens: {
    domain: 'capstone project integration',
    evidenceNoun: 'project evidence',
    decisionNoun: 'capstone decision',
    learnerRole: 'capstone project lead',
    exampleNoun: 'client project scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'project charter and sponsor need',
      evidenceMove: 'use project evidence to connect sponsor need, scope, and success criteria',
      decisionMove: 'choose a capstone decision that keeps the project feasible and evidence-grounded',
    },
    'lesson-2': {
      context: 'stakeholder discovery and constraints',
      evidenceMove: 'use project evidence to separate stakeholder needs from assumptions',
      decisionMove: 'choose a capstone decision that responds to the highest-priority constraint',
    },
    'lesson-3': {
      context: 'research synthesis and opportunity framing',
      evidenceMove: 'use project evidence to synthesize research into a focused opportunity',
      decisionMove: 'choose a capstone decision that narrows the project without losing sponsor value',
    },
    'lesson-4': {
      context: 'concept options and decision matrix',
      evidenceMove: 'use project evidence to compare concepts against sponsor criteria',
      decisionMove: 'choose a capstone decision that justifies the selected concept and tradeoff',
    },
    'lesson-5': {
      context: 'implementation roadmap and feasibility risk',
      evidenceMove: 'use project evidence to test resource, timeline, and implementation risk',
      decisionMove: 'choose a capstone decision that names the next milestone and mitigation',
    },
    'lesson-6': {
      context: 'prototype or pilot evidence and iteration',
      evidenceMove: 'use project evidence to revise the project based on pilot feedback',
      decisionMove: 'choose a capstone decision that improves feasibility before final delivery',
    },
    'lesson-7': {
      context: 'portfolio defense and impact claim',
      evidenceMove: 'use project evidence to defend impact, limitations, and implementation readiness',
      decisionMove: 'choose a capstone decision that makes the portfolio defense credible',
    },
    'lesson-8': {
      context: 'final showcase and handoff plan',
      evidenceMove: 'use project evidence to connect final deliverables to sponsor handoff needs',
      decisionMove: 'choose a capstone decision that supports adoption after the showcase',
    },
  },
  styleNotes: [
    'Name the project milestone before giving general capstone advice.',
    'Tie feedback to sponsor constraints, milestone evidence, feasibility risk, and defense readiness.',
    'Prefer client project scenarios over generic project examples.',
  ],
};

const COMPETENCY_ASSESSMENT_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'competency evidence',
    'program standard',
    'benchmark descriptor',
    'proficiency decision',
    'calibration note',
    'remediation plan',
    'reassessment task',
    'evidence portfolio',
  ],
  lens: {
    domain: 'competency-based assessment',
    evidenceNoun: 'competency evidence',
    decisionNoun: 'proficiency decision',
    learnerRole: 'competency candidate',
    exampleNoun: 'standards-aligned performance task',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'program standard and performance evidence',
      evidenceMove: 'use competency evidence to connect observable performance to the program standard',
      decisionMove: 'choose a proficiency decision that names the benchmark descriptor',
    },
    'lesson-2': {
      context: 'evidence portfolio and sufficiency',
      evidenceMove: 'use competency evidence to decide whether the portfolio is sufficient',
      decisionMove: 'choose a proficiency decision that separates complete evidence from strong evidence',
    },
    'lesson-3': {
      context: 'calibration notes and assessor agreement',
      evidenceMove: 'use competency evidence to compare assessor judgments against the benchmark',
      decisionMove: 'choose a proficiency decision that can be defended across assessors',
    },
    'lesson-4': {
      context: 'feedback precision and remediation planning',
      evidenceMove: 'use competency evidence to locate the specific proficiency gap',
      decisionMove: 'choose a remediation decision that targets the missing benchmark evidence',
    },
    'lesson-5': {
      context: 'reassessment task and mastery evidence',
      evidenceMove: 'use competency evidence to design a reassessment opportunity',
      decisionMove: 'choose a proficiency decision that names what new evidence will prove readiness',
    },
    'lesson-6': {
      context: 'equitable evidence options and accommodations',
      evidenceMove: 'use competency evidence to preserve the standard while allowing equivalent demonstrations',
      decisionMove: 'choose a proficiency decision that protects accessibility and evidence integrity',
    },
    'lesson-7': {
      context: 'summative competency portfolio review',
      evidenceMove: 'use competency evidence to synthesize multiple benchmarks into one readiness judgment',
      decisionMove: 'choose a proficiency decision that names strengths, gaps, and next evidence',
    },
    'lesson-8': {
      context: 'accreditation-ready evidence defense',
      evidenceMove: 'use competency evidence to defend source-to-standard alignment',
      decisionMove: 'choose a proficiency decision that can withstand accreditation review',
    },
  },
  styleNotes: [
    'Name the competency and benchmark before giving general feedback.',
    'Tie feedback to observable evidence, assessor calibration, remediation, and reassessment.',
    'Prefer standards-aligned performance tasks over generic classroom examples.',
  ],
};

const PERFORMING_ARTS_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'performance evidence',
    'rehearsal note',
    'director note',
    'ensemble cue',
    'monologue beat',
    'blocking choice',
    'run-through',
    'critique uptake',
  ],
  lens: {
    domain: 'performing arts rehearsal',
    evidenceNoun: 'performance evidence',
    decisionNoun: 'rehearsal decision',
    learnerRole: 'performing artist',
    exampleNoun: 'rehearsal scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'voice, body, readiness, and breath support',
      evidenceMove: 'use performance evidence to show how breath, alignment, and focus change readiness',
      decisionMove: 'choose a rehearsal decision that prepares the body and voice safely',
    },
    'lesson-2': {
      context: 'monologue beats and given circumstances',
      evidenceMove: 'use performance evidence to connect script beats to observable choices',
      decisionMove: 'choose a rehearsal decision that clarifies objective and intention',
    },
    'lesson-3': {
      context: 'partner listening and ensemble cues',
      evidenceMove: 'use performance evidence to show how listening changes timing and response',
      decisionMove: 'choose a rehearsal decision that improves ensemble awareness',
    },
    'lesson-4': {
      context: 'blocking, staging, and stage picture',
      evidenceMove: 'use performance evidence to test whether movement supports meaning',
      decisionMove: 'choose a rehearsal decision that makes the stage picture clearer',
    },
    'lesson-5': {
      context: 'voice, text, and emotional arc',
      evidenceMove: 'use performance evidence to connect vocal choice to emotional progression',
      decisionMove: 'choose a rehearsal decision that keeps emotion playable rather than generalized',
    },
    'lesson-6': {
      context: 'audition preparation and feedback notes',
      evidenceMove: 'use performance evidence to compare first run and revised audition cut',
      decisionMove: 'choose a rehearsal decision that responds to director notes without flattening intent',
    },
    'lesson-7': {
      context: 'ensemble run-through and pacing',
      evidenceMove: 'use performance evidence to diagnose timing, cue pickup, and scene flow',
      decisionMove: 'choose a rehearsal decision that strengthens the ensemble run',
    },
    'lesson-8': {
      context: 'final performance portfolio and reflection',
      evidenceMove: 'use performance evidence to connect recording, rehearsal journal, and critique uptake',
      decisionMove: 'choose a rehearsal decision that supports the next performance context',
    },
  },
  styleNotes: [
    'Name the performance artifact before giving general artistic feedback.',
    'Tie feedback to technique, intention, ensemble awareness, critique uptake, and revised performance evidence.',
    'Prefer rehearsal scenarios over generic performance reflection prompts.',
  ],
};

const PROGRAMMING_LAB_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'code evidence',
    'unit test',
    'debugging trace',
    'repository commit',
    'pull request',
    'code review',
    'edge-case check',
    'refactor note',
  ],
  lens: {
    domain: 'software programming lab',
    evidenceNoun: 'code evidence',
    decisionNoun: 'implementation decision',
    learnerRole: 'software developer',
    exampleNoun: 'code review scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'repository setup and first test run',
      evidenceMove: 'use code evidence to show the environment, starter code, and test harness are working',
      decisionMove: 'choose an implementation decision that makes setup and test evidence inspectable',
    },
    'lesson-2': {
      context: 'functions, inputs, and edge cases',
      evidenceMove: 'use code evidence to connect function behavior to automated tests and edge-case checks',
      decisionMove: 'choose an implementation decision that handles the named edge case cleanly',
    },
    'lesson-3': {
      context: 'debugging trace and failure diagnosis',
      evidenceMove: 'use code evidence to compare failing output, hypothesis, fix, and passing test',
      decisionMove: 'choose an implementation decision that addresses the root cause rather than the symptom',
    },
    'lesson-4': {
      context: 'data structures and module design',
      evidenceMove: 'use code evidence to justify the data structure or module boundary',
      decisionMove: 'choose an implementation decision that improves clarity, performance, or maintainability',
    },
    'lesson-5': {
      context: 'API behavior and error handling',
      evidenceMove: 'use code evidence to test normal paths, error paths, and user-facing messages',
      decisionMove: 'choose an implementation decision that makes failure behavior predictable',
    },
    'lesson-6': {
      context: 'refactoring and readability',
      evidenceMove: 'use code evidence to compare before-and-after readability, duplication, and tests',
      decisionMove: 'choose an implementation decision that improves the code without changing behavior',
    },
    'lesson-7': {
      context: 'feature sprint and pull request review',
      evidenceMove: 'use code evidence to connect issue requirements, tests, implementation, and review notes',
      decisionMove: 'choose an implementation decision that is ready for pull-request review',
    },
    'lesson-8': {
      context: 'final repository portfolio and handoff',
      evidenceMove: 'use code evidence to synthesize commits, tests, documentation, and known risks',
      decisionMove: 'choose an implementation decision that supports maintainable handoff',
    },
  },
  styleNotes: [
    'Name the code artifact, test result, and repository evidence before giving general feedback.',
    'Tie feedback to correctness, readability, test coverage, debugging trace, edge-case handling, and commit clarity.',
    'Prefer code review scenarios over generic technology reflection prompts.',
  ],
};

const DATA_SCIENCE_LAB_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'data-model evidence',
    'dataset provenance',
    'data-cleaning log',
    'analytics notebook',
    'validation metric',
    'bias audit',
    'fairness check',
    'data story',
  ],
  lens: {
    domain: 'data science analytics lab',
    evidenceNoun: 'data-model evidence',
    decisionNoun: 'analytic decision',
    learnerRole: 'data analyst',
    exampleNoun: 'analytics notebook scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'dataset provenance and cleaning',
      evidenceMove: 'use data-model evidence to show dataset source, missingness, and cleaning decisions',
      decisionMove: 'choose an analytic decision that keeps data quality limits visible',
    },
    'lesson-2': {
      context: 'exploratory visualization and data story',
      evidenceMove: 'use data-model evidence to connect chart choice, pattern, and interpretation boundary',
      decisionMove: 'choose an analytic decision that avoids overclaiming from exploratory visuals',
    },
    'lesson-3': {
      context: 'feature engineering and transformation',
      evidenceMove: 'use data-model evidence to justify transformation choices and feature meaning',
      decisionMove: 'choose an analytic decision that preserves interpretability and reproducibility',
    },
    'lesson-4': {
      context: 'model validation and metrics',
      evidenceMove: 'use data-model evidence to compare validation metrics and model limitations',
      decisionMove: 'choose an analytic decision that fits the decision context rather than only the best score',
    },
    'lesson-5': {
      context: 'classification errors and confusion matrix',
      evidenceMove: 'use data-model evidence to diagnose false positives, false negatives, and threshold effects',
      decisionMove: 'choose an analytic decision that names the cost of classification errors',
    },
    'lesson-6': {
      context: 'bias audit and fairness check',
      evidenceMove: 'use data-model evidence to compare subgroup performance and fairness risks',
      decisionMove: 'choose an analytic decision that protects transparency and local review',
    },
    'lesson-7': {
      context: 'dashboard communication and stakeholder interpretation',
      evidenceMove: 'use data-model evidence to connect dashboard choices to stakeholder questions',
      decisionMove: 'choose an analytic decision that makes the insight actionable without hiding uncertainty',
    },
    'lesson-8': {
      context: 'final analytics notebook and data story handoff',
      evidenceMove: 'use data-model evidence to synthesize provenance, cleaning, validation, bias, and interpretation',
      decisionMove: 'choose an analytic decision that supports maintainable data-story handoff',
    },
  },
  styleNotes: [
    'Name the dataset, notebook output, validation evidence, and limitation before giving general analytics feedback.',
    'Tie feedback to data provenance, cleaning, reproducibility, visualization or model fit, interpretation, bias, and decision usefulness.',
    'Prefer analytics notebook scenarios over generic coding or chart-description prompts.',
  ],
};

const ENGINEERING_DESIGN_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'engineering test evidence',
    'design requirement',
    'constraint',
    'prototype test',
    'test fixture',
    'failure analysis',
    'safety factor',
    'design verification',
  ],
  lens: {
    domain: 'engineering design test lab',
    evidenceNoun: 'engineering test evidence',
    decisionNoun: 'design-verification decision',
    learnerRole: 'engineering designer',
    exampleNoun: 'prototype test scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'requirements, constraints, and verification criteria',
      evidenceMove:
        'use engineering test evidence to connect requirements, constraints, and measurable verification criteria',
      decisionMove: 'choose a design-verification decision that makes the requirement testable',
    },
    'lesson-2': {
      context: 'CAD prototype and bench-test plan',
      evidenceMove: 'use engineering test evidence to connect CAD choices, test fixture, and measurement plan',
      decisionMove: 'choose a design-verification decision that prepares the prototype for valid testing',
    },
    'lesson-3': {
      context: 'materials, tolerance, and safety factor',
      evidenceMove: 'use engineering test evidence to compare material limits, tolerance stack-up, and safety margin',
      decisionMove: 'choose a design-verification decision that protects safety and manufacturability',
    },
    'lesson-4': {
      context: 'load test and measurement evidence',
      evidenceMove: 'use engineering test evidence to compare measured performance against the requirement',
      decisionMove: 'choose a design-verification decision that responds to the test result rather than preference',
    },
    'lesson-5': {
      context: 'failure analysis and root cause',
      evidenceMove: 'use engineering test evidence to diagnose failure mode, measurement limit, and likely cause',
      decisionMove: 'choose a design-verification decision that addresses the root cause before retesting',
    },
    'lesson-6': {
      context: 'tradeoff matrix and redesign iteration',
      evidenceMove: 'use engineering test evidence to compare redesign options against constraints and risk',
      decisionMove: 'choose a design-verification decision that justifies the next iteration',
    },
    'lesson-7': {
      context: 'verification report and unresolved risk',
      evidenceMove: 'use engineering test evidence to defend verified requirements and remaining risks',
      decisionMove: 'choose a design-verification decision that is transparent enough for handoff',
    },
    'lesson-8': {
      context: 'final design review and engineering handoff',
      evidenceMove:
        'use engineering test evidence to synthesize requirements, tests, redesign, safety, and verification',
      decisionMove: 'choose a design-verification decision that supports the final engineering handoff',
    },
  },
  styleNotes: [
    'Name the requirement, prototype or model, test setup, and measurement evidence before giving general design feedback.',
    'Tie feedback to requirement fit, test validity, measurement quality, failure analysis, safety, tradeoffs, and verification readiness.',
    'Prefer prototype test scenarios over generic ideation or portfolio critique prompts.',
  ],
};

const CREATIVE_WRITING_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'craft evidence',
    'workshop critique',
    'revision portfolio',
    'artist statement',
    'manuscript draft',
    'audience effect',
    'process journal',
    'line-level revision',
  ],
  lens: {
    domain: 'creative arts workshop',
    evidenceNoun: 'craft evidence',
    decisionNoun: 'revision decision',
    learnerRole: 'creative practitioner',
    exampleNoun: 'workshop draft',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'image, voice, and draft evidence',
      evidenceMove: 'use craft evidence to name the image or voice choice visible in the draft',
      decisionMove: 'choose a revision decision that makes the next draft more intentional',
    },
    'lesson-2': {
      context: 'scene, character, and audience effect',
      evidenceMove: 'use craft evidence to explain how scene choices shape audience effect',
      decisionMove: 'choose a revision decision that clarifies character desire and reader impact',
    },
    'lesson-3': {
      context: 'dialogue, point of view, and subtext',
      evidenceMove: 'use craft evidence to compare dialogue, point of view, and unstated tension',
      decisionMove: 'choose a revision decision that makes subtext visible without overexplaining it',
    },
    'lesson-4': {
      context: 'structure, pacing, and sequence',
      evidenceMove: 'use craft evidence to trace how sequence and pacing guide reader attention',
      decisionMove: 'choose a revision decision that improves movement across the draft',
    },
    'lesson-5': {
      context: 'workshop critique and response letter',
      evidenceMove: 'use workshop critique evidence to identify the most useful revision priority',
      decisionMove: 'choose a revision decision that responds to critique while protecting artistic intent',
    },
    'lesson-6': {
      context: 'line-level revision and style',
      evidenceMove: 'use craft evidence to connect line-level choices to rhythm, tone, and audience effect',
      decisionMove: 'choose a revision decision that strengthens style without flattening voice',
    },
    'lesson-7': {
      context: 'artist statement and revision portfolio curation',
      evidenceMove: 'use process journal evidence to explain how craft choices evolved across drafts',
      decisionMove: 'choose a revision decision that makes the portfolio coherent for readers',
    },
    'lesson-8': {
      context: 'final reading, showcase, and portfolio reflection',
      evidenceMove: 'use craft evidence to connect final creative work, artist statement, and audience response',
      decisionMove: 'choose a revision decision that supports the final reading and future writing practice',
    },
  },
  styleNotes: [
    'Name the draft or creative artifact before general feedback.',
    'Tie feedback to craft choices, audience effect, critique evidence, and visible revision.',
    'Prefer workshop drafts over generic writing examples.',
  ],
};

const BUSINESS_CASE_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'case evidence',
    'decision criteria',
    'stakeholder tradeoff',
    'strategic recommendation',
    'implementation risk',
    'exhibit analysis',
    'competitive advantage',
    'executive memo',
  ],
  lens: {
    domain: 'business strategy case method',
    evidenceNoun: 'case evidence',
    decisionNoun: 'strategic recommendation',
    learnerRole: 'case analyst',
    exampleNoun: 'business case scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'market entry and decision criteria',
      evidenceMove: 'use case evidence to separate market facts from assumptions',
      decisionMove: 'choose a strategic recommendation that fits explicit decision criteria',
    },
    'lesson-2': {
      context: 'competitive advantage and operating tradeoffs',
      evidenceMove: 'use exhibit analysis to compare competitive advantage claims',
      decisionMove: 'choose a strategic recommendation that names the operating tradeoff',
    },
    'lesson-3': {
      context: 'customer segmentation and value proposition',
      evidenceMove: 'use case evidence to connect segment needs to the value proposition',
      decisionMove: 'choose a strategic recommendation that prioritizes the strongest customer segment',
    },
    'lesson-4': {
      context: 'pricing, margin, and financial tradeoff',
      evidenceMove: 'use exhibit analysis to test pricing and margin assumptions',
      decisionMove: 'choose a strategic recommendation that explains the financial tradeoff',
    },
    'lesson-5': {
      context: 'go-to-market channel choice',
      evidenceMove: 'use case evidence to compare channel reach, cost, and partner risk',
      decisionMove: 'choose a strategic recommendation that fits go-to-market constraints',
    },
    'lesson-6': {
      context: 'stakeholder tradeoff and organizational alignment',
      evidenceMove: 'use stakeholder tradeoff evidence to identify who gains, who loses, and why',
      decisionMove: 'choose a strategic recommendation that can survive stakeholder pushback',
    },
    'lesson-7': {
      context: 'implementation risk and contingency planning',
      evidenceMove: 'use case evidence to rank implementation risks by impact and uncertainty',
      decisionMove: 'choose a strategic recommendation with a credible mitigation plan',
    },
    'lesson-8': {
      context: 'final executive recommendation memo',
      evidenceMove: 'use case evidence to defend the final recommendation against alternatives',
      decisionMove: 'choose a strategic recommendation that integrates criteria, tradeoffs, and risk',
    },
  },
  styleNotes: [
    'Name the case decision before giving general business advice.',
    'Tie feedback to case evidence, exhibits, stakeholder tradeoffs, decision criteria, and implementation risk.',
    'Prefer business case scenarios over generic management examples.',
  ],
};

const CONSTITUTIONAL_LAW_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'doctrinal evidence',
    'case brief',
    'holding and rationale',
    'rule statement',
    'issue spotting',
    'IRAC memo',
    'precedent comparison',
    'hypothetical application',
  ],
  lens: {
    domain: 'legal doctrine and case analysis',
    evidenceNoun: 'doctrinal evidence',
    decisionNoun: 'legal conclusion',
    learnerRole: 'legal analyst',
    exampleNoun: 'case hypothetical',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'judicial review and case briefing',
      evidenceMove: 'use doctrinal evidence to separate material facts, holding, and rationale',
      decisionMove: 'choose a legal conclusion that follows from the rule statement',
    },
    'lesson-2': {
      context: 'standing and justiciability',
      evidenceMove: 'use doctrinal evidence to test injury, causation, and redressability',
      decisionMove: 'choose a legal conclusion that explains the jurisdictional limit',
    },
    'lesson-3': {
      context: 'federalism and commerce power',
      evidenceMove: 'use precedent comparison to distinguish commerce-clause facts',
      decisionMove: 'choose a legal conclusion that respects the doctrinal boundary',
    },
    'lesson-4': {
      context: 'separation of powers and executive authority',
      evidenceMove: 'use doctrinal evidence to identify the source and limit of authority',
      decisionMove: 'choose a legal conclusion that accounts for institutional role',
    },
    'lesson-5': {
      context: 'equal protection and scrutiny standards',
      evidenceMove: 'use doctrinal evidence to match facts to the proper scrutiny standard',
      decisionMove: 'choose a legal conclusion that applies precedent to the new fact pattern',
    },
    'lesson-6': {
      context: 'substantive due process and liberty interests',
      evidenceMove: 'use holding and rationale evidence to define the protected interest',
      decisionMove: 'choose a legal conclusion that names the doctrinal limit',
    },
    'lesson-7': {
      context: 'free speech doctrine and forum analysis',
      evidenceMove: 'use doctrinal evidence to classify the forum and government interest',
      decisionMove: 'choose a legal conclusion that applies the speech standard',
    },
    'lesson-8': {
      context: 'final constitutional issue-spotting memo',
      evidenceMove: 'use doctrinal evidence to synthesize rules, counterarguments, and precedent limits',
      decisionMove: 'choose a legal conclusion that handles the strongest counterargument',
    },
  },
  styleNotes: [
    'Name the legal issue before giving general doctrine advice.',
    'Tie feedback to material facts, holding, rationale, rule statement, precedent comparison, and application.',
    'Prefer case hypotheticals over generic civic examples.',
  ],
};

const INFORMATION_LITERACY_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'source evidence',
    'database search',
    'search strategy',
    'source credibility',
    'citation trail',
    'annotated bibliography',
    'synthesis matrix',
    'source-use decision',
  ],
  lens: {
    domain: 'information literacy and source research',
    evidenceNoun: 'source evidence',
    decisionNoun: 'source-use decision',
    learnerRole: 'academic researcher',
    exampleNoun: 'database search scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'research question and information need',
      evidenceMove: 'use source evidence to narrow the information need and research question',
      decisionMove: 'choose a source-use decision that defines what evidence is needed',
    },
    'lesson-2': {
      context: 'keyword search and controlled vocabulary',
      evidenceMove: 'use source evidence to compare keyword, subject heading, and database results',
      decisionMove: 'choose a search strategy decision that improves relevance and recall',
    },
    'lesson-3': {
      context: 'database filters and scholarly source retrieval',
      evidenceMove: 'use source evidence to justify database, filter, and peer-reviewed source choices',
      decisionMove: 'choose a source-use decision that keeps source scope visible',
    },
    'lesson-4': {
      context: 'source credibility and authority',
      evidenceMove: 'use source evidence to evaluate authority, method, currency, and bias',
      decisionMove: 'choose a source-use decision that protects credibility',
    },
    'lesson-5': {
      context: 'citation trail and source network',
      evidenceMove: 'use source evidence to follow references, citations, and related-source links',
      decisionMove: 'choose a citation-trail decision that broadens or narrows the source set',
    },
    'lesson-6': {
      context: 'annotated bibliography and attribution',
      evidenceMove: 'use source evidence to connect annotation, citation, summary, and attribution choice',
      decisionMove: 'choose a source-use decision that makes attribution accurate and useful',
    },
    'lesson-7': {
      context: 'synthesis matrix and gap analysis',
      evidenceMove: 'use source evidence to compare claims, methods, limitations, and gaps across sources',
      decisionMove: 'choose a synthesis decision that avoids source-by-source summary',
    },
    'lesson-8': {
      context: 'research log and source-use plan',
      evidenceMove:
        'use source evidence to synthesize search strategy, credibility, citation trail, and synthesis matrix',
      decisionMove: 'choose a source-use decision that supports the final research artifact',
    },
  },
  styleNotes: [
    'Name the search artifact, source, or citation trail before giving general research advice.',
    'Tie feedback to search strategy, source credibility, relevance, synthesis, attribution, and source-use judgment.',
    'Prefer database search scenarios over generic research-methods examples.',
  ],
};

const TEACHER_PREPARATION_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'classroom evidence',
    'lesson plan',
    'microteaching',
    'student work analysis',
    'formative assessment',
    'differentiation',
    'reteach decision',
    'instructional decision',
  ],
  lens: {
    domain: 'teacher preparation and instructional practice',
    evidenceNoun: 'classroom evidence',
    decisionNoun: 'instructional decision',
    learnerRole: 'teacher candidate',
    exampleNoun: 'microteaching lesson scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'learning targets and standards alignment',
      evidenceMove: 'use classroom evidence to align the learning target, task, and formative assessment',
      decisionMove: 'choose an instructional decision that preserves standards alignment',
    },
    'lesson-2': {
      context: 'lesson modeling and questioning',
      evidenceMove: 'use classroom evidence to model the teaching move and question sequence',
      decisionMove: 'choose an instructional decision that makes student thinking visible',
    },
    'lesson-3': {
      context: 'microteaching rehearsal',
      evidenceMove: 'use classroom evidence from peer observation and teaching rehearsal',
      decisionMove: 'choose an instructional decision that improves the next teaching attempt',
    },
    'lesson-4': {
      context: 'student work and misconception analysis',
      evidenceMove: 'use classroom evidence from student responses, errors, and partial understanding',
      decisionMove: 'choose an instructional decision that targets the misconception',
    },
    'lesson-5': {
      context: 'differentiation and accessibility',
      evidenceMove: 'use classroom evidence to match scaffolds, access supports, and extension options',
      decisionMove: 'choose an instructional decision that supports learner variability',
    },
    'lesson-6': {
      context: 'formative assessment and feedback',
      evidenceMove: 'use classroom evidence from exit tickets, checks for understanding, and feedback notes',
      decisionMove: 'choose an instructional decision that improves feedback and reteaching',
    },
    'lesson-7': {
      context: 'classroom routines and management',
      evidenceMove: 'use classroom evidence to plan routines, transitions, participation, and behavior supports',
      decisionMove: 'choose an instructional decision that keeps learning time usable',
    },
    'lesson-8': {
      context: 'final lesson-plan portfolio',
      evidenceMove: 'use classroom evidence to synthesize targets, standards, student work, and revisions',
      decisionMove: 'choose an instructional decision that makes the final teaching plan classroom-ready',
    },
  },
  styleNotes: [
    'Name the learning target, student evidence, and instructional move before general pedagogy advice.',
    'Tie feedback to standards alignment, formative assessment, differentiation, classroom feasibility, and reteach decisions.',
    'Prefer microteaching lesson scenarios over generic education essays.',
  ],
};

const COUNSELING_PRACTICE_GOLD_ENRICHMENT = {
  source: 'curated-gold-sample-enrichment',
  signatureTerms: [
    'client-interaction evidence',
    'active listening',
    'process recording',
    'case conceptualization',
    'risk assessment',
    'safety plan',
    'referral rationale',
    'helping response decision',
  ],
  lens: {
    domain: 'counseling and helping-skills practice',
    evidenceNoun: 'client-interaction evidence',
    decisionNoun: 'helping response decision',
    learnerRole: 'helping professional',
    exampleNoun: 'client-conversation scenario',
  },
  lessonPhrases: {
    'lesson-1': {
      context: 'client intake and rapport',
      evidenceMove: 'use client-interaction evidence to identify the stated concern and helping goal',
      decisionMove: 'choose a helping response decision that builds rapport without overstepping boundaries',
    },
    'lesson-2': {
      context: 'active listening and open questions',
      evidenceMove: 'use client-interaction evidence from questions, reflections, and client responses',
      decisionMove: 'choose a helping response decision that keeps the client goal visible',
    },
    'lesson-3': {
      context: 'reflective listening and empathy',
      evidenceMove: 'use client-interaction evidence to code empathy, reflection, and summary quality',
      decisionMove: 'choose a helping response decision that deepens understanding before advice',
    },
    'lesson-4': {
      context: 'case conceptualization',
      evidenceMove: 'use client-interaction evidence to connect presenting concern, strengths, context, and needs',
      decisionMove: 'choose a helping response decision that fits the case formulation',
    },
    'lesson-5': {
      context: 'risk assessment and safety planning',
      evidenceMove: 'use client-interaction evidence to identify risk cues, protective factors, and safety needs',
      decisionMove: 'choose a helping response decision that protects safety and ethics',
    },
    'lesson-6': {
      context: 'ethics boundaries and mandated reporting',
      evidenceMove: 'use client-interaction evidence to identify confidentiality, boundary, and reporting limits',
      decisionMove: 'choose a helping response decision that preserves ethical practice',
    },
    'lesson-7': {
      context: 'referral and service planning',
      evidenceMove: 'use client-interaction evidence to compare referral fit, service options, and client goals',
      decisionMove: 'choose a helping response decision that justifies referral or follow-up',
    },
    'lesson-8': {
      context: 'supervision and revised helping plan',
      evidenceMove:
        'use client-interaction evidence to synthesize process recording, risk review, referral, and supervision feedback',
      decisionMove: 'choose a helping response decision that is ready for supervised practice',
    },
  },
  styleNotes: [
    'Name the client cue, exact helping response, and ethics or risk evidence before general reflection.',
    'Tie feedback to active listening, client goals, boundaries, safety, referral reasoning, and supervision uptake.',
    'Prefer client-conversation scenarios over generic social-work reflection prompts.',
  ],
};

function makeGoldCourseMap({ courseName, semester = 'Fall 2026', learningOutcomes, lessons }) {
  return {
    courseName,
    semester,
    learningOutcomes,
    lessons: lessons.map((lesson, index) => ({
      title: `Week ${index + 1}: ${lesson.title}`,
      sections: [
        {
          learningGoals: lesson.goals,
          topicSection: lesson.topics,
          learningObjectives: lesson.objectives,
          weeklyAssessments: lesson.assessment,
          asyncActivities: lesson.async,
          syncActivities: lesson.sync,
          technologyNeeded:
            lesson.technology || 'Course LMS, shared workspace, and discipline-specific practice tools.',
          presentationFormat: lesson.format || 'Short demo, studio critique, applied lab, and revision debrief.',
          supportingResources: lesson.resources,
          evaluateDesign: lesson.evaluation,
        },
      ],
    })),
  };
}

const INTERACTION_DESIGN_STUDIO_GOLD_PROJECT = {
  id: 'gold-interaction-design-studio-project',
  label: 'Interaction Design Studio gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Interaction Design Studio',
    learningOutcomes:
      'Frame user problems, prototype interaction flows, test usability, improve accessibility, and defend design decisions with evidence.',
    lessons: [
      {
        title: 'Design Briefs and User Problem Framing',
        goals: 'Students translate a broad design opportunity into a focused user problem and studio brief.',
        topics: 'Design brief, user problem, stakeholder constraints, success metrics, studio norms',
        objectives: 'Analyze a design opportunity and write a focused problem statement with measurable criteria.',
        assessment: 'Design brief checkpoint with user problem, constraints, success metrics, and critique questions.',
        async: 'Review studio brief examples and annotate user-problem statements.',
        sync: 'Studio framing lab with peer critique on problem scope and user need.',
        resources: 'Design brief examples; problem framing checklist; critique protocol',
        evaluation: 'Score user need clarity, constraint fit, measurable success criteria, and critique readiness.',
      },
      {
        title: 'Research Synthesis and Journey Mapping',
        goals: 'Students synthesize user observations into journey maps and design opportunities.',
        topics: 'User research notes, affinity mapping, journey map, pain points, opportunity statements',
        objectives: 'Synthesize research evidence into a journey map that identifies prioritized interaction problems.',
        assessment: 'Journey map board with evidence tags, pain points, and opportunity statements.',
        async: 'Annotate interview notes and complete affinity mapping preparation.',
        sync: 'Journey mapping studio with evidence clustering and design opportunity critique.',
        resources: 'Affinity map template; journey map examples; user observation notes',
        evaluation: 'Assess evidence traceability, pain-point specificity, and opportunity prioritization.',
      },
      {
        title: 'Wireframes and Interaction Flows',
        goals: 'Students compare low-fidelity concepts and select an interaction flow for prototyping.',
        topics: 'Wireframes, task flow, information architecture, sketching alternatives, flow friction',
        objectives: 'Evaluate alternate wireframes against a task flow and select a testable interaction direction.',
        assessment: 'Wireframe critique packet with three alternatives, task-flow rationale, and revision target.',
        async: 'Sketch low-fidelity alternatives and annotate flow decisions.',
        sync: 'Wireframe charrette comparing interaction flow, hierarchy, and task friction.',
        resources: 'Wireframe kit; task-flow examples; information architecture checklist',
        evaluation: 'Score alternative breadth, task-flow fit, and rationale for the selected direction.',
      },
      {
        title: 'Studio Critique and Revision Planning',
        goals: 'Students use critique evidence to plan focused revisions without losing design intent.',
        topics: 'Critique protocol, design intent, revision priority, critique evidence, tradeoff notes',
        objectives: 'Interpret studio critique and prioritize revisions that improve the interaction concept.',
        assessment: 'Revision plan with critique evidence, accepted/rejected feedback, and next prototype decision.',
        async: 'Prepare critique prompts and document design intent before class.',
        sync: 'Structured critique session with evidence capture and revision triage.',
        resources: 'Critique protocol; revision log template; design intent examples',
        evaluation: 'Assess critique listening, evidence use, revision priority, and tradeoff explanation.',
      },
      {
        title: 'Visual Hierarchy and Design Systems',
        goals: 'Students refine prototype screens using hierarchy, spacing, and component consistency.',
        topics: 'Visual hierarchy, component library, spacing, typography, design system rules',
        objectives: 'Apply design-system rules to improve clarity, consistency, and scanability in a prototype.',
        assessment: 'Design-system checkpoint with component set, hierarchy rationale, and before/after screens.',
        async: 'Audit prototype screens for spacing, typography, and component consistency.',
        sync: 'Design-system lab revising components and hierarchy from critique evidence.',
        resources: 'Component library examples; hierarchy checklist; spacing and typography guide',
        evaluation: 'Score hierarchy clarity, component consistency, and rationale tied to user task success.',
      },
      {
        title: 'Usability Testing and Task Success',
        goals: 'Students run a small usability test and use task evidence to revise the prototype.',
        topics: 'Usability test script, task success, think-aloud evidence, severity ratings, test notes',
        objectives: 'Analyze usability test evidence and recommend prototype revisions based on task performance.',
        assessment: 'Usability test report with task findings, severity ratings, clips/notes, and revision decisions.',
        async: 'Draft a usability test script and pilot one task with a peer.',
        sync: 'Usability testing lab with observation roles, note synthesis, and revision decision critique.',
        resources: 'Usability test script template; severity scale; task success rubric',
        evaluation: 'Assess test-task clarity, evidence quality, severity logic, and revision priority.',
      },
      {
        title: 'Accessibility Audit and Inclusive Interaction',
        goals: 'Students audit prototypes for accessibility barriers and revise interaction details.',
        topics: 'Accessibility audit, contrast, keyboard navigation, alt text, inclusive interaction patterns',
        objectives:
          'Evaluate a prototype against accessibility criteria and revise interaction details for equivalent use.',
        assessment: 'Accessibility audit memo with barriers, evidence screenshots, and inclusive revision plan.',
        async: 'Run contrast and keyboard checks; annotate barriers in the prototype.',
        sync: 'Accessibility audit studio with barrier triage and inclusive interaction revision.',
        resources: 'Accessibility checklist; contrast tool guide; inclusive interaction examples',
        evaluation: 'Score audit evidence, barrier priority, equivalent-use reasoning, and revision specificity.',
      },
      {
        title: 'Portfolio Rationale and Final Presentation',
        goals: 'Students explain prototype evolution and defend design decisions for a portfolio audience.',
        topics: 'Portfolio narrative, final prototype, design rationale, process evidence, presentation critique',
        objectives:
          'Create a portfolio-ready rationale that connects research, critique, testing, and accessibility revisions.',
        assessment: 'Final portfolio presentation with prototype demo, evidence trail, and design rationale.',
        async: 'Draft portfolio narrative and collect prototype evidence from prior checkpoints.',
        sync: 'Final presentation studio with demo rehearsal, critique, and portfolio polish.',
        resources: 'Portfolio case study examples; final presentation rubric; evidence trail checklist',
        evaluation:
          'Assess process clarity, prototype evidence, design decision rationale, and presentation readiness.',
      },
    ],
  }),
};

const SPANISH_HEALTHCARE_GOLD_PROJECT = {
  id: 'gold-spanish-healthcare-project',
  label: 'Spanish for Healthcare Professionals gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Spanish for Healthcare Professionals',
    learningOutcomes:
      'Conduct respectful clinical Spanish interactions, gather patient-history information, explain basic care instructions, work appropriately with interpreters, and demonstrate safe patient communication in simulation.',
    lessons: [
      {
        title: 'Clinical Greetings, Roles, and Consent Language',
        goals:
          'Students open a clinical encounter in Spanish with respectful greetings, role clarity, and consent language.',
        topics: 'Clinical greetings, professional roles, usted forms, consent phrases, patient dignity',
        objectives: 'Perform a respectful introduction and ask permission before beginning a basic patient exchange.',
        assessment: 'Opening-encounter role-play with greeting, role statement, consent question, and reflection note.',
        async: 'Practice pronunciation for greetings and annotate examples of respectful clinical openings.',
        sync: 'Paired opening-encounter simulation with peer feedback on tone, accuracy, and consent language.',
        resources: 'Clinical greeting phrase bank; usted-form reference; patient dignity checklist',
        evaluation: 'Assess vocabulary accuracy, respectful tone, consent clarity, and self-correction.',
      },
      {
        title: 'Intake Questions and Patient History',
        goals: 'Students ask basic intake questions and clarify patient-history details in Spanish.',
        topics: 'Intake forms, patient history, allergies, medications, past conditions, clarifying questions',
        objectives: 'Ask sequenced intake questions and confirm patient-history information using plain Spanish.',
        assessment:
          'Patient-history interview script with allergies, medications, conditions, and clarification checks.',
        async: 'Study intake vocabulary and prepare five patient-history questions for a role-play.',
        sync: 'Patient-history role-play with partner rotation and instructor feedback on sequencing.',
        resources: 'Intake vocabulary list; patient-history prompt cards; clarification phrase bank',
        evaluation: 'Score question sequencing, patient-history accuracy, pronunciation, and clarification strategy.',
      },
      {
        title: 'Symptoms, Body Systems, and Pain Description',
        goals: 'Students gather symptom descriptions and pain information without overstepping clinical scope.',
        topics: 'Body systems, symptom vocabulary, pain scale, onset, duration, location, severity',
        objectives: 'Elicit symptom description, pain severity, and timing details in a patient-care scenario.',
        assessment: 'Symptom-description role-play with body location, pain scale, onset, and duration notes.',
        async: 'Match symptom vocabulary to body systems and record pronunciation practice.',
        sync: 'Symptom interview lab with pain-scale prompts and peer observation checklist.',
        resources: 'Body-system vocabulary map; pain-scale phrase sheet; symptom interview checklist',
        evaluation: 'Assess symptom vocabulary, pain-scale clarity, listening accuracy, and safety escalation cue.',
      },
      {
        title: 'Medications, Dosage, and Care Instructions',
        goals: 'Students explain basic medication and care instructions using clear, safe Spanish.',
        topics: 'Medication names, dosage frequency, side effects, instructions, teach-back',
        objectives: 'Communicate basic dosage and care instructions and check patient understanding.',
        assessment: 'Medication-instruction role-play with dosage explanation, safety warning, and teach-back.',
        async: 'Review medication-frequency phrases and identify ambiguous instruction examples.',
        sync: 'Care-instruction simulation using teach-back and correction of unclear dosage language.',
        resources: 'Dosage phrase bank; teach-back checklist; common medication-instruction examples',
        evaluation: 'Score dosage clarity, patient-safety language, teach-back use, and correction accuracy.',
      },
      {
        title: 'Cultural Humility and Interpreter Protocol',
        goals: 'Students communicate with cultural humility and identify when interpreter support is needed.',
        topics: 'Cultural humility, interpreter protocol, health beliefs, family roles, respectful clarification',
        objectives:
          'Use respectful clarification and interpreter protocol in a culturally responsive patient exchange.',
        assessment: 'Interpreter-support scenario with cultural humility reflection and communication decision note.',
        async: 'Read interpreter-use scenarios and annotate respectful clarification phrases.',
        sync: 'Triad simulation with patient, clinician, and interpreter roles plus debrief on communication choices.',
        resources: 'Interpreter protocol guide; cultural humility checklist; respectful clarification examples',
        evaluation:
          'Assess interpreter protocol, respectful language, cultural context awareness, and debrief quality.',
      },
      {
        title: 'Urgent Symptoms, Triage, and Safety Instructions',
        goals: 'Students recognize urgent symptom language and communicate safety instructions clearly.',
        topics: 'Urgent symptoms, triage phrases, red flags, emergency instructions, safety confirmation',
        objectives: 'Identify urgent symptom cues and communicate immediate safety instructions in Spanish.',
        assessment: 'Triage communication role-play with urgent symptom recognition and safety instruction check.',
        async: 'Practice urgent-symptom vocabulary and classify scenarios by urgency.',
        sync: 'Triage role-play stations with escalation language and safety confirmation prompts.',
        resources: 'Urgent symptom list; triage phrase cards; safety instruction checklist',
        evaluation: 'Score urgency recognition, instruction clarity, escalation language, and patient confirmation.',
      },
      {
        title: 'Discharge Instructions and Follow-Up Care',
        goals: 'Students explain discharge instructions and verify follow-up understanding in Spanish.',
        topics: 'Discharge instructions, follow-up appointments, warning signs, home care, teach-back',
        objectives: 'Explain follow-up steps and warning signs while checking patient understanding.',
        assessment: 'Discharge-instruction simulation with warning signs, appointment details, and teach-back.',
        async: 'Translate discharge phrases into plain Spanish and identify patient confusion risks.',
        sync: 'Follow-up care simulation with teach-back, correction, and peer feedback on clarity.',
        resources: 'Discharge instruction phrase bank; follow-up checklist; warning-sign examples',
        evaluation: 'Assess clarity, warning-sign accuracy, follow-up sequencing, and patient-understanding check.',
      },
      {
        title: 'Final Patient Interview Simulation',
        goals: 'Students integrate clinical Spanish, empathy, safety, and accuracy in a complete simulated encounter.',
        topics: 'Complete patient interview, empathy, intake, symptoms, instructions, interpreter decision',
        objectives:
          'Conduct a complete simulated patient interview that balances communication accuracy and patient dignity.',
        assessment: 'Final patient interview simulation with rubric-scored performance and self-reflection.',
        async: 'Prepare final interview plan and review vocabulary gaps from earlier role-plays.',
        sync: 'Final simulated patient encounter with observation rubric, debrief, and revision target.',
        resources: 'Final simulation rubric; patient scenario cards; self-reflection prompt',
        evaluation:
          'Assess interview flow, clinical Spanish accuracy, empathy, safety language, and reflection on next steps.',
      },
    ],
  }),
};

const CLINICAL_JUDGMENT_GOLD_PROJECT = {
  id: 'gold-clinical-judgment-project',
  label: 'Nursing Clinical Judgment and Care Planning gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Nursing Clinical Judgment and Care Planning',
    learningOutcomes:
      'Use patient-assessment evidence, clinical cues, nursing diagnosis, patient safety reasoning, intervention rationale, monitoring plans, and SBAR handoffs to make defensible clinical care decisions.',
    lessons: [
      {
        title: 'Patient Assessment and Cue Recognition',
        goals:
          'Students separate relevant patient-assessment evidence from background information in a patient-care case.',
        topics: 'Patient assessment data, vital signs, clinical cues, baseline safety risk, EHR review',
        objectives: 'Identify relevant patient cues and explain how they shape the initial clinical care decision.',
        assessment:
          'Clinical cue map with patient-assessment evidence, safety concern, priority question, and SBAR-ready summary.',
        async: 'Review EHR chart excerpts and mark assessment data that may signal patient risk.',
        sync: 'Patient case assessment lab with cue sorting, priority talk-through, and instructor debrief.',
        resources: 'Patient chart excerpt; cue-recognition checklist; SBAR summary template',
        evaluation: 'Score cue relevance, assessment evidence accuracy, safety concern, and SBAR summary clarity.',
      },
      {
        title: 'Nursing Diagnosis and Priority Setting',
        goals: 'Students connect assessment cues to a priority nursing diagnosis and defend the priority order.',
        topics: 'Nursing diagnosis, priority setting, risk assessment, patient safety, care-plan goal',
        objectives: 'Rank nursing priorities and justify the top diagnosis from patient-assessment evidence.',
        assessment:
          'Priority care-plan note with nursing diagnosis, evidence rationale, patient-safety risk, and feedback question.',
        async: 'Compare sample nursing diagnoses and annotate which patient cues support or weaken each option.',
        sync: 'Priority-ranking conference with safety challenge, diagnosis comparison, and debrief revision.',
        resources: 'Nursing diagnosis guide; priority-setting framework; risk-assessment examples',
        evaluation: 'Score diagnosis fit, prioritization logic, safety rationale, and use of patient evidence.',
      },
      {
        title: 'Medication Safety and Contraindication Review',
        goals:
          'Students use patient data to identify medication-safety risks and explain safe administration decisions.',
        topics: 'Medication administration, contraindications, allergies, labs, dosage safety, monitoring cue',
        objectives:
          'Evaluate a medication order and choose a safe clinical care decision using assessment data and constraints.',
        assessment:
          'Medication-safety rationale with contraindication check, patient-assessment evidence, monitoring plan, and escalation cue.',
        async: 'Annotate medication orders, allergies, and lab values for possible safety risks.',
        sync: 'Medication safety simulation with order review, intervention comparison, and SBAR update.',
        resources: 'Medication administration checklist; lab value reference; medication-safety case cards',
        evaluation:
          'Score safety-risk recognition, contraindication reasoning, monitoring clarity, and escalation logic.',
      },
      {
        title: 'Intervention Rationale and ADPIE Care Planning',
        goals:
          'Students connect assessment, diagnosis, planning, intervention, and evaluation into a coherent care plan.',
        topics: 'ADPIE cycle, intervention rationale, care-plan goal, patient teaching, evaluation cue',
        objectives: 'Build a care plan that links the intervention rationale to patient-assessment evidence.',
        assessment:
          'ADPIE care plan with priority diagnosis, intervention rationale, patient teaching, and evaluation evidence.',
        async: 'Draft intervention options and mark which patient cues support each option.',
        sync: 'Care-plan build lab with rationale defense, peer safety check, and instructor calibration.',
        resources: 'ADPIE planning guide; intervention rationale examples; care-plan rubric',
        evaluation: 'Score care-plan coherence, intervention fit, patient teaching, and evaluation evidence.',
      },
      {
        title: 'Deteriorating Patient Escalation',
        goals:
          'Students recognize deterioration and choose when to escalate care based on patient-assessment evidence.',
        topics: 'Deterioration cues, trending vital signs, rapid response, escalation threshold, safety priority',
        objectives: 'Defend an escalation decision for a deteriorating patient using clinical judgment evidence.',
        assessment:
          'Escalation care-plan revision with trend analysis, urgent intervention priority, monitoring cue, and SBAR handoff.',
        async: 'Review changing vital signs, charting notes, and risk alerts for a deteriorating patient.',
        sync: 'Deterioration simulation with priority huddle, escalation decision, and clinical debrief.',
        resources: 'Deterioration case; rapid-response criteria; monitoring trend worksheet',
        evaluation: 'Score deterioration recognition, escalation timing, safety priority, and handoff usefulness.',
      },
      {
        title: 'Monitoring Plan and Safety Reassessment',
        goals: 'Students decide what to monitor after an intervention and how reassessment changes the care plan.',
        topics: 'Monitoring plan, reassessment data, patient safety, intervention response, documentation',
        objectives: 'Create a monitoring plan that identifies evidence for improvement, risk, and next action.',
        assessment:
          'Monitoring-plan update with reassessment data, safety threshold, documentation note, and revised clinical care decision.',
        async: 'Inspect post-intervention assessment notes and identify missing monitoring evidence.',
        sync: 'Monitoring plan workshop with reassessment scenarios, documentation check, and safety debrief.',
        resources: 'Monitoring checklist; reassessment note samples; documentation standard',
        evaluation: 'Score monitoring specificity, reassessment use, documentation accuracy, and decision update.',
      },
      {
        title: 'SBAR Handoff and Interdisciplinary Communication',
        goals: 'Students communicate patient priorities clearly enough for another clinician to act.',
        topics: 'SBAR handoff, interdisciplinary communication, concise patient data, recommendation clarity',
        objectives: 'Produce an SBAR handoff that communicates the care-plan priority and recommended next action.',
        assessment:
          'SBAR handoff script with patient-assessment evidence, priority diagnosis, safety concern, and recommendation.',
        async: 'Revise a weak SBAR sample by adding missing assessment data and recommendation details.',
        sync: 'SBAR handoff rounds with peer receiving role, clarification questions, and handoff revision.',
        resources: 'SBAR exemplar; handoff observation checklist; interdisciplinary communication guide',
        evaluation:
          'Score situation clarity, background evidence, assessment logic, recommendation, and handoff actionability.',
      },
      {
        title: 'Integrated Clinical Judgment Map and Debrief',
        goals: 'Students synthesize assessment, diagnosis, intervention, monitoring, and handoff decisions.',
        topics: 'Clinical judgment map, integrated care plan, patient-safety debrief, transfer to practice',
        objectives: 'Defend a complete clinical judgment map and care plan from patient-assessment evidence.',
        assessment:
          'Final clinical judgment map and care plan with nursing diagnosis, interventions, monitoring, SBAR handoff, and debrief revision.',
        async: 'Prepare a final care-plan draft from EHR notes, lab values, patient assessment, and previous feedback.',
        sync: 'Integrated care-plan conference with safety challenge, peer debrief, and transfer planning.',
        resources: 'Clinical judgment map template; final care-plan rubric; debrief prompt',
        evaluation:
          'Score integrated patient-assessment evidence, clinical care decision quality, safety rationale, monitoring, and SBAR clarity.',
      },
    ],
  }),
};

const CLINICAL_PLACEMENT_GOLD_PROJECT = {
  id: 'gold-clinical-placement-project',
  label: 'Nursing Clinical Placement Practicum gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Nursing Clinical Placement Practicum',
    learningOutcomes:
      'Use supervised clinical evidence, deidentified patient-care observations, preceptor feedback, confidentiality rules, scope-of-practice boundaries, competency logs, and patient-safety handoffs to make defensible clinical placement decisions.',
    lessons: [
      {
        title: 'Clinical Site Orientation and Confidentiality',
        goals:
          'Students prepare for supervised clinical placement by confirming site expectations, confidentiality, and scope limits.',
        topics: 'Clinical placement orientation, clinical site expectations, HIPAA, confidentiality, scope of practice',
        objectives:
          'Explain site expectations, confidentiality rules, and scope boundaries before supervised patient-care work.',
        assessment:
          'Clinical placement readiness checklist with site expectation, confidentiality check, scope-of-practice note, and patient-safety question.',
        async: 'Review the placement handbook, HIPAA guidance, and site-supervisor expectations.',
        sync: 'Clinical placement conference with site-readiness scenarios, confidentiality screen, and boundary debrief.',
        resources: 'Placement handbook; HIPAA guide; clinical site orientation checklist',
        evaluation: 'Score site readiness, confidentiality accuracy, scope awareness, and patient-safety reasoning.',
      },
      {
        title: 'Deidentified Patient Encounter Logs',
        goals:
          'Students document patient-care observations without exposing protected information or unsupported assumptions.',
        topics: 'Patient encounter log, deidentified patient-care evidence, observation notes, patient safety',
        objectives: 'Write a deidentified patient encounter log that ties observation evidence to a safe next action.',
        assessment:
          'Patient encounter log with deidentified site evidence, patient-safety cue, scope boundary, and follow-up question.',
        async: 'Annotate sample encounter logs for deidentification, safety cues, and unsupported claims.',
        sync: 'Encounter-log review conference with confidentiality check, patient-safety challenge, and revision.',
        resources: 'Encounter log template; deidentification checklist; patient-safety cue examples',
        evaluation:
          'Score deidentification, observation specificity, safety reasoning, and scope-of-practice boundaries.',
      },
      {
        title: 'Preceptor Feedback and Next-Shift Action',
        goals: 'Students use preceptor feedback to choose a focused, safe improvement for the next placement shift.',
        topics: 'Preceptor feedback, site supervisor observation, next-shift action, supervised practice evidence',
        objectives: 'Interpret preceptor feedback and choose a clinical placement decision for the next shift.',
        assessment:
          'Preceptor-feedback response with supervised clinical evidence, next-shift action, safety rationale, and supervision question.',
        async: 'Compare sample preceptor comments and identify feedback that requires action or clarification.',
        sync: 'Preceptor-feedback review conference with safety boundary challenge and action-plan calibration.',
        resources: 'Preceptor feedback form; next-shift planning template; supervision question bank',
        evaluation:
          'Score feedback interpretation, safety action, supervision question, and evidence-grounded revision.',
      },
      {
        title: 'Skills Checklist and Competency Logging',
        goals: 'Students connect skills-checklist evidence to accurate competency-log claims.',
        topics: 'Skills checklist, competency log, competency target, site supervisor observation, remediation cue',
        objectives: 'Calibrate a competency-log entry against observed skills evidence and supervisor feedback.',
        assessment:
          'Competency log update with skills checklist evidence, preceptor observation, competency target, and remediation plan.',
        async: 'Review competency-log examples and identify unsupported or overclaimed entries.',
        sync: 'Competency calibration conference with skills evidence, supervisor observation, and remediation planning.',
        resources: 'Skills checklist; competency log template; site supervisor observation sample',
        evaluation: 'Score competency evidence, calibration accuracy, scope awareness, and remediation specificity.',
      },
      {
        title: 'Clinical Handoff Boundaries',
        goals:
          'Students communicate clinical information clearly while preserving confidentiality and role boundaries.',
        topics: 'Clinical handoff, patient-safety transfer, confidentiality, handoff boundary, recommendation clarity',
        objectives: 'Create a deidentified handoff note that supports patient safety and stays within student scope.',
        assessment:
          'Deidentified clinical handoff note with patient-safety cue, scope boundary, preceptor follow-up, and recommendation.',
        async: 'Revise a weak handoff sample by removing identifiers and adding safety-relevant evidence.',
        sync: 'Handoff boundary rounds with receiver questions, preceptor follow-up, and revision debrief.',
        resources: 'Handoff checklist; deidentified SBAR sample; scope-of-practice guide',
        evaluation:
          'Score handoff clarity, confidentiality, patient-safety relevance, and scope-appropriate recommendation.',
      },
      {
        title: 'Site Evaluation and Professional Boundaries',
        goals:
          'Students distinguish site evidence from assumptions when evaluating professional boundaries and site expectations.',
        topics: 'Site evaluation, professional boundaries, site evidence, role limits, supervision escalation',
        objectives: 'Evaluate a site-boundary scenario and choose a placement decision grounded in evidence.',
        assessment:
          'Site evaluation note with site evidence, boundary risk, scope-of-practice decision, and supervision escalation cue.',
        async: 'Read professional-boundary scenarios and tag evidence, assumption, and escalation needs.',
        sync: 'Boundary case conference with site-evidence sorting, role-limit challenge, and supervisor question.',
        resources: 'Site evaluation form; professional-boundary scenarios; supervision escalation protocol',
        evaluation: 'Score evidence/assumption distinction, boundary reasoning, escalation cue, and role clarity.',
      },
      {
        title: 'Competency Remediation and Supervision Questions',
        goals: 'Students use supervised clinical evidence to plan remediation and ask precise supervision questions.',
        topics: 'Competency remediation, supervision question, preceptor feedback, evidence gap, reassessment plan',
        objectives: 'Plan a competency remediation step and supervision question from placement evidence.',
        assessment:
          'Competency remediation plan with evidence gap, preceptor feedback, supervision question, and reassessment target.',
        async: 'Identify evidence gaps in sample competency records and draft supervision questions.',
        sync: 'Remediation planning conference with peer calibration, preceptor feedback trace, and reassessment plan.',
        resources: 'Remediation planning template; supervision-question examples; competency benchmark descriptors',
        evaluation:
          'Score evidence-gap diagnosis, supervision question quality, remediation fit, and reassessment clarity.',
      },
      {
        title: 'Clinical Placement Portfolio and Transfer Plan',
        goals:
          'Students synthesize supervised clinical evidence into a placement portfolio and transfer plan for future practice.',
        topics:
          'Clinical placement portfolio, site evaluation, patient-safety transfer, competency growth, preceptor evidence',
        objectives:
          'Defend a clinical placement portfolio that integrates deidentified evidence, preceptor feedback, competency growth, and safety transfer.',
        assessment:
          'Final clinical placement evidence portfolio with deidentified encounter log, competency log, preceptor feedback, handoff note, and transfer plan.',
        async:
          'Collect placement artifacts and tag evidence for confidentiality, safety, competency, and feedback uptake.',
        sync: 'Final placement portfolio conference with safety-boundary review, competency defense, and transfer debrief.',
        resources: 'Clinical placement portfolio rubric; site evaluation guide; transfer-plan prompt',
        evaluation:
          'Score supervised clinical evidence, confidentiality, preceptor-feedback uptake, competency growth, handoff clarity, and transfer plan.',
      },
    ],
  }),
};

const BEGINNING_SPANISH_GOLD_PROJECT = {
  id: 'gold-beginning-spanish-project',
  label: 'Beginning Spanish communicative language gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Beginning Spanish Communicative Practice',
    learningOutcomes:
      'Use target-language vocabulary, pronunciation, grammar, interpretive listening, interpersonal dialogue, presentational speaking, and cultural comparison to complete novice-level proficiency tasks.',
    lessons: [
      {
        title: 'Greetings, Introductions, and Courtesy Register',
        goals: 'Students introduce themselves and choose respectful greetings based on audience and formality.',
        topics: 'Spanish greetings, introductions, courtesy phrases, pronunciation, formal and informal register',
        objectives: 'Perform a short target-language greeting dialogue and interpret basic courtesy cues in context.',
        assessment:
          'Interpersonal dialogue recording with target-language utterances, pronunciation focus, courtesy choice, and revised script.',
        async: 'Listen to model greetings and mark vocabulary, pronunciation, and formality cues.',
        sync: 'Paired conversation rehearsal with feedback recasts and revised target-language exchange.',
        resources: 'Greeting audio; pronunciation guide; courtesy register notes; dialogue model',
        evaluation:
          'Score comprehensibility, vocabulary accuracy, pronunciation, register choice, and revision after feedback.',
      },
      {
        title: 'Classroom Requests and Clarification Strategies',
        goals:
          'Students ask for help, request repetition, and repair misunderstandings during classroom communication.',
        topics: 'Classroom vocabulary, clarification phrases, question formation, listening comprehension',
        objectives:
          'Use Spanish clarification strategies to keep an interpersonal exchange moving when meaning breaks down.',
        assessment:
          'Clarification-role dialogue with request phrase, comprehension check, repair move, and feedback revision.',
        async: 'Match classroom requests to model audio and identify one phrase that repairs misunderstanding.',
        sync: 'Information-gap practice using clarification phrases and instructor recasts.',
        resources: 'Clarification phrase bank; classroom object visuals; listening sample',
        evaluation: 'Score phrase choice, listening response, repair strategy, pronunciation, and revised utterance.',
      },
      {
        title: 'Family Descriptions and Adjective Agreement',
        goals: 'Students describe family members with accurate vocabulary, adjective agreement, and clear meaning.',
        topics: 'Family vocabulary, adjective agreement, ser, personality traits, cultural comparison',
        objectives: 'Describe family members using accurate adjectives and interpret a short listening sample.',
        assessment:
          'Presentational speaking script with family vocabulary, adjective agreement evidence, cultural comparison, and feedback revision.',
        async: 'Complete listening comprehension notes and annotate adjective agreement in a model description.',
        sync: 'Small-group speaking lab with language pattern noticing, recasts, and revised description.',
        resources: 'Family vocabulary list; adjective agreement chart; listening sample',
        evaluation: 'Score meaning, grammar accuracy, comprehensibility, cultural comparison, and revision quality.',
      },
      {
        title: 'Daily Routines and Present-Tense Verbs',
        goals: 'Students explain daily routines with sequenced present-tense verbs and time expressions.',
        topics: 'Daily routines, present tense, reflexive verbs, time expressions, sequence words',
        objectives: 'Narrate a simple routine using accurate present-tense forms and sequence markers.',
        assessment:
          'Routine narration audio with verb-form evidence, sequence cues, pronunciation note, and revised transcript.',
        async: 'Review routine video input and identify verbs, time expressions, and sequence markers.',
        sync: 'Partner rehearsal with verb-form feedback and revised target-language narration.',
        resources: 'Routine video; present-tense chart; narration planning template',
        evaluation: 'Score verb accuracy, sequence clarity, comprehensibility, pronunciation, and revision uptake.',
      },
      {
        title: 'Food Ordering, Preferences, and Service Encounters',
        goals: 'Students order food, state preferences, and respond politely in a realistic service exchange.',
        topics: 'Food vocabulary, preferences, quantities, polite requests, restaurant dialogue',
        objectives: 'Conduct a short food-ordering dialogue with clear preferences and quantities.',
        assessment:
          'Restaurant dialogue performance with preference statement, quantity clarity, politeness choice, and revised script.',
        async: 'Listen to menu-ordering examples and mark preference phrases and quantity words.',
        sync: 'Restaurant role-play stations with focused recasts and peer comprehensibility checks.',
        resources: 'Menu vocabulary; service-dialogue audio; politeness checklist',
        evaluation: 'Score comprehensibility, vocabulary range, quantity accuracy, cultural politeness, and revision.',
      },
      {
        title: 'Directions, Community Places, and Route Descriptions',
        goals: 'Students ask for and give directions using community-place vocabulary and sequence language.',
        topics: 'Community places, directions, commands, prepositions, route sequence, politeness',
        objectives: 'Give understandable directions and interpret a route description from a listening sample.',
        assessment:
          'Route-description task with map directions, listening comprehension evidence, politeness choice, and correction.',
        async: 'Label a map from audio directions and identify one confusing route phrase.',
        sync: 'Map-based information-gap task with paired direction giving and revised route explanation.',
        resources: 'Community map; directions audio; preposition guide; route checklist',
        evaluation:
          'Score location accuracy, sequence clarity, listening comprehension, politeness, and correction quality.',
      },
      {
        title: 'Past Experiences and Short Narration',
        goals: 'Students narrate a completed experience while distinguishing key actions from background details.',
        topics: 'Past-tense narration, completed actions, background details, story sequence, listener clarity',
        objectives: 'Tell a short past-experience story and revise it for clearer sequencing and accuracy.',
        assessment:
          'Past-experience narration recording with completed-action evidence, sequence markers, listener question, and revision.',
        async: 'Listen to a short narration and mark completed actions, sequence phrases, and unclear moments.',
        sync: 'Story-circle rehearsal with peer listener questions and instructor recasts.',
        resources: 'Narration model; sequence phrase bank; listener-question checklist',
        evaluation: 'Score story comprehensibility, verb choice, sequence clarity, listener response, and revision.',
      },
      {
        title: 'Final Integrated Proficiency Performance',
        goals:
          'Students integrate interpretive listening, interpersonal exchange, presentational speaking, and cultural comparison.',
        topics:
          'Integrated proficiency task, listening comprehension, interpersonal exchange, presentation, reflection',
        objectives:
          'Complete a novice-level integrated Spanish performance and explain one feedback-based language revision.',
        assessment:
          'Final proficiency portfolio with listening response, interpersonal dialogue, presentational script, cultural comparison, and revised target-language sample.',
        async: 'Review earlier recordings and select one recurring language choice to improve.',
        sync: 'Final proficiency performance with peer audience, feedback recast, and revision reflection.',
        resources: 'Final proficiency rubric; portfolio checklist; cultural comparison prompt',
        evaluation:
          'Assess comprehensibility, language accuracy, communicative function, cultural fit, and revision evidence.',
      },
    ],
  }),
};

const FIELD_PLACEMENT_GOLD_PROJECT = {
  id: 'gold-field-placement-project',
  label: 'Human Services Field Placement Seminar gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Human Services Field Placement Seminar',
    learningOutcomes:
      'Use site evidence, stakeholder perspectives, supervision feedback, ethical boundaries, and implementation constraints to make grounded placement decisions and prepare classroom-ready field artifacts.',
    lessons: [
      {
        title: 'Placement Roles, Site Expectations, and Learning Contracts',
        goals: 'Students clarify field placement roles, site expectations, and learning-contract evidence.',
        topics: 'Field placement roles, site expectations, learning contract, site evidence, professional conduct',
        objectives:
          'Distinguish site facts from assumptions and draft a learning contract aligned to placement expectations.',
        assessment:
          'Field placement learning contract with site evidence, role boundaries, stakeholder questions, and review target.',
        async: 'Read the placement handbook and annotate site expectations that require local confirmation.',
        sync: 'Site-expectation case roundtable with role sorting, evidence check, and learning-contract revision.',
        resources: 'Placement handbook; learning-contract template; site evidence checklist',
        evaluation: 'Score role clarity, site-evidence grounding, boundary awareness, and revision readiness.',
      },
      {
        title: 'Stakeholder Interviews and Community Context',
        goals: 'Students plan stakeholder interviews that gather useful context without overpromising support.',
        topics: 'Stakeholder interview, community context, consent, listening stance, represented perspectives',
        objectives:
          'Prepare stakeholder interview questions that elicit community context and respect site constraints.',
        assessment:
          'Stakeholder interview guide with field evidence targets, consent language, perspective map, and follow-up plan.',
        async: 'Compare sample stakeholder questions and flag leading or unsupported assumptions.',
        sync: 'Interview-question clinic with peer testing, represented-perspective check, and revision debrief.',
        resources: 'Stakeholder interview examples; consent phrase sheet; perspective-map template',
        evaluation: 'Assess question neutrality, stakeholder fit, consent clarity, and evidence-use plan.',
      },
      {
        title: 'Community Asset Mapping and Service Gaps',
        goals: 'Students connect community assets, service gaps, and local constraints to placement decisions.',
        topics: 'Community asset map, service gap, local constraint, referral landscape, equity lens',
        objectives:
          'Build a community asset map that identifies strengths, service gaps, and feasible placement actions.',
        assessment:
          'Community asset map with field evidence, service-gap notes, equity question, and feasible placement action.',
        async: 'Review community-resource listings and classify assets, access barriers, and local constraints.',
        sync: 'Asset-map workshop using site evidence cards, peer challenge, and feasibility revision.',
        resources: 'Asset-map template; resource-list review guide; equity question bank',
        evaluation: 'Score local grounding, asset-gap logic, equity reasoning, and feasibility of the action.',
      },
      {
        title: 'Supervision Notes and Feedback Use',
        goals: 'Students turn supervision feedback into specific professional practice adjustments.',
        topics: 'Supervision note, feedback pattern, professional growth, reflective evidence, action commitment',
        objectives: 'Analyze supervision feedback and choose a focused placement practice adjustment.',
        assessment:
          'Placement supervision note with field evidence, feedback pattern, practice adjustment, and next-check plan.',
        async: 'Annotate a de-identified supervision note for evidence, assumption, and next-action language.',
        sync: 'Supervision debrief workshop with evidence sorting, action commitment, and peer calibration.',
        resources: 'Supervision-note model; feedback-use checklist; action-commitment template',
        evaluation: 'Assess evidence specificity, feedback interpretation, action focus, and next-check clarity.',
      },
      {
        title: 'Implementation Constraints and Referral Pathways',
        goals: 'Students evaluate referral pathways and implementation constraints before recommending action.',
        topics: 'Implementation constraint, referral pathway, access barrier, feasibility check, site protocol',
        objectives: 'Trace a referral pathway and identify constraints that should change a placement recommendation.',
        assessment:
          'Implementation pathway field record with field evidence, access barrier, feasibility check, and placement decision.',
        async: 'Map one site referral pathway and identify missing information that requires confirmation.',
        sync: 'Referral pathway clinic with constraint ranking, feasibility debate, and decision revision.',
        resources: 'Referral pathway worksheet; implementation constraint list; site protocol examples',
        evaluation: 'Score pathway accuracy, constraint analysis, feasibility reasoning, and local-review cue.',
      },
      {
        title: 'Professional Boundaries and Ethical Site Practice',
        goals: 'Students distinguish supportive practice from boundary risk in field placement situations.',
        topics: 'Professional boundary, ethical practice, role limit, confidentiality, site escalation',
        objectives: 'Apply ethical boundary reasoning to a site-based scenario and choose an escalation path.',
        assessment:
          'Professional boundary field scenario with role limit, field evidence, escalation cue, and placement decision.',
        async: 'Review boundary scenarios and label evidence, assumptions, and required escalation steps.',
        sync: 'Boundary decision roundtable with site-role checks, ethics reasoning, and response rehearsal.',
        resources: 'Boundary scenario cards; ethics checklist; escalation pathway guide',
        evaluation: 'Assess role-limit clarity, evidence use, escalation judgment, and protection of stakeholders.',
      },
      {
        title: 'Case Handoff and Continuity Planning',
        goals: 'Students prepare case handoff artifacts that preserve continuity without unsupported claims.',
        topics: 'Case handoff, continuity plan, stakeholder need, source limit, transition risk',
        objectives:
          'Create a concise case handoff that separates confirmed field evidence from inference and next steps.',
        assessment:
          'Field case handoff plan with confirmed evidence, evidence limits, continuity risks, and stakeholder next step.',
        async: 'Mark a sample handoff for unsupported claims, missing context, and continuity risks.',
        sync: 'Handoff rehearsal with evidence verification, peer challenge, and revision for continuity.',
        resources: 'Handoff template; source-limit checklist; continuity-risk examples',
        evaluation: 'Score evidence accuracy, source-limit language, continuity planning, and stakeholder fit.',
      },
      {
        title: 'Final Field Integration and Professional Growth',
        goals: 'Students synthesize field placement evidence into a professional growth and transfer plan.',
        topics: 'Field integration, professional growth, transfer plan, supervision evidence, stakeholder feedback',
        objectives:
          'Synthesize field evidence, supervision feedback, and stakeholder perspective into a transfer-ready plan.',
        assessment:
          'Final field integration dossier with site evidence, supervision feedback, stakeholder insight, and transfer plan.',
        async: 'Collect field artifacts and tag the evidence that best shows growth across the placement.',
        sync: 'Field integration conference with evidence triage, transfer-plan critique, and final revision target.',
        resources: 'Field integration checklist; transfer-plan guide; evidence-tagging worksheet',
        evaluation: 'Assess evidence range, growth logic, stakeholder awareness, and transfer readiness.',
      },
    ],
  }),
};

const BIOLOGY_LAB_GOLD_PROJECT = {
  id: 'gold-biology-lab-project',
  label: 'Biology Laboratory Methods gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Biology Laboratory Methods',
    learningOutcomes:
      'Apply lab safety, aseptic technique, variable control, notebook documentation, data-table construction, microscopy observation, assay interpretation, and protocol troubleshooting to produce defensible lab evidence.',
    lessons: [
      {
        title: 'Lab Safety, PPE, and Observation Quality',
        goals: 'Students connect safety routines to reliable observation and defensible lab records.',
        topics: 'Lab safety, PPE, hazard labels, observation records, data integrity, cleanup protocol',
        objectives: 'Evaluate a lab setup for safety risks and record raw observations without premature inference.',
        assessment: 'Lab safety observation log with PPE check, hazard note, raw observation, and correction decision.',
        async: 'Review the lab safety contract and annotate two examples of unsafe observation practice.',
        sync: 'Safety walkthrough and observation-record clinic using mock bench stations and correction decisions.',
        resources: 'Lab safety contract; PPE checklist; observation-record examples',
        evaluation:
          'Score safety reasoning, raw observation quality, correction accuracy, and data-integrity language.',
      },
      {
        title: 'Measurement, Pipetting, and Uncertainty',
        goals: 'Students practice precise measurement and connect uncertainty to data interpretation.',
        topics: 'Pipetting, measurement precision, accuracy, uncertainty, replicate data, instrument reading',
        objectives: 'Analyze replicate measurements and explain how uncertainty affects a lab conclusion.',
        assessment: 'Pipetting accuracy data log with replicate table, uncertainty note, and measurement decision.',
        async: 'Watch pipetting demo clips and identify measurement behaviors that increase uncertainty.',
        sync: 'Pipetting practice lab with replicate measurement checks and peer verification of data tables.',
        resources: 'Pipette guide; uncertainty worksheet; replicate data table template',
        evaluation: 'Assess technique accuracy, replicate recording, uncertainty explanation, and correction plan.',
      },
      {
        title: 'Experimental Variables and Control Groups',
        goals: 'Students design controlled experiments that make variable logic inspectable.',
        topics: 'Independent variable, dependent variable, controlled variable, control group, hypothesis',
        objectives: 'Distinguish experimental variables and justify control choices for a simple biology experiment.',
        assessment:
          'Experimental variable-control plan with hypothesis, control group, variable table, and design decision.',
        async: 'Compare two sample experiment plans and flag uncontrolled variables.',
        sync: 'Variable-control design lab with group critique and revision of control logic.',
        resources: 'Variable table template; control group examples; hypothesis checklist',
        evaluation: 'Score variable identification, control fit, hypothesis clarity, and revision reasoning.',
      },
      {
        title: 'Lab Notebook Documentation and Raw Observation',
        goals: 'Students maintain lab notebook entries that preserve raw evidence for later interpretation.',
        topics: 'Lab notebook, timestamps, protocol steps, raw observation, correction notes, audit trail',
        objectives: 'Create a notebook entry that separates protocol, observation, correction, and interpretation.',
        assessment:
          'Lab notebook observation entry with timestamp, protocol step, raw observation, and interpretation boundary.',
        async: 'Annotate sample notebook pages for missing timestamps, vague observations, and unsupported claims.',
        sync: 'Notebook audit workshop with observation rewriting and protocol-step verification.',
        resources: 'Notebook model pages; audit-trail checklist; raw observation examples',
        evaluation:
          'Assess timestamp completeness, observation specificity, protocol trace, and interpretation limits.',
      },
      {
        title: 'Serial Dilution and Data Tables',
        goals: 'Students calculate dilution steps and build data tables that prevent recording errors.',
        topics: 'Serial dilution, concentration, calculation check, data table structure, unit consistency',
        objectives: 'Calculate serial dilutions and organize data tables with units, labels, and error checks.',
        assessment:
          'Serial dilution calculation log with concentration steps, unit check, data table, and error-correction note.',
        async: 'Complete a dilution calculation warm-up and mark unit errors in a sample table.',
        sync: 'Dilution station lab with calculation peer check and table revision before interpretation.',
        resources: 'Dilution calculation sheet; data-table checklist; unit conversion reference',
        evaluation: 'Score calculation accuracy, unit consistency, data-table clarity, and error-correction logic.',
      },
      {
        title: 'Microscopy, Specimens, and Count Reliability',
        goals: 'Students use microscopy observations and plate counts as inspectable evidence.',
        topics: 'Microscopy, specimen prep, field of view, plate count, observation reliability, count variance',
        objectives: 'Compare specimen observations and plate counts to judge reliability before drawing a conclusion.',
        assessment:
          'Microscopy observation and plate-count log with specimen notes, count table, and reliability decision.',
        async: 'Review microscopy image sets and identify observation details that affect count reliability.',
        sync: 'Microscopy and plate-count lab with paired observation checks and reliability debrief.',
        resources: 'Microscopy guide; plate-count worksheet; observation reliability rubric',
        evaluation: 'Assess specimen description, count accuracy, reliability reasoning, and limitation language.',
      },
      {
        title: 'Enzyme Assay Data and Conclusion Limits',
        goals: 'Students interpret assay data while naming limits of the experimental evidence.',
        topics: 'Enzyme assay, reaction rate, data pattern, graph interpretation, conclusion limit, error source',
        objectives: 'Analyze enzyme assay data and write a conclusion that fits the evidence and its limits.',
        assessment:
          'Enzyme assay data analysis log with graph interpretation, error source, and conclusion-limit statement.',
        async: 'Graph a small assay dataset and identify one claim the data cannot support.',
        sync: 'Assay interpretation clinic comparing graphs, error sources, and conclusion limits.',
        resources: 'Assay dataset; graphing checklist; conclusion-limit examples',
        evaluation: 'Score graph interpretation, evidence fit, error-source reasoning, and conclusion restraint.',
      },
      {
        title: 'Contamination Troubleshooting and Protocol Revision',
        goals: 'Students diagnose contamination evidence and revise protocols for a safer next run.',
        topics: 'Contamination, aseptic technique, protocol deviation, troubleshooting, revision plan',
        objectives: 'Use contamination evidence to identify a likely protocol deviation and revise the next run.',
        assessment:
          'Contamination troubleshooting log with aseptic-technique evidence, protocol deviation, and revision decision.',
        async: 'Review contamination case notes and identify possible protocol deviations.',
        sync: 'Troubleshooting roundtable with evidence sorting, protocol revision, and next-run safety check.',
        resources: 'Aseptic technique guide; contamination case notes; protocol revision template',
        evaluation: 'Assess evidence diagnosis, protocol revision specificity, safety reasoning, and next-run plan.',
      },
    ],
  }),
};

const MULTI_SECTION_SEMINAR_GOLD_PROJECT = {
  id: 'gold-multi-section-seminar-project',
  label: 'Multi-section comparative literature seminar gold fixture',
  courseMap: {
    courseName: 'Comparative Literature Seminar',
    semester: 'Fall 2026',
    learningOutcomes:
      'Develop close-reading claims, connect passages to historical context, compare translation choices, use critical lenses carefully, and revise interpretive arguments across multi-section seminar meetings.',
    lessons: [
      {
        title: 'Week 1: Reading Passages with Context',
        sections: [
          {
            topicSection: 'Close reading, image patterns, interpretive claim, passage evidence',
            learningObjectives: 'Analyze a short passage and build an interpretive claim from textual evidence.',
            learningGoals: 'Students distinguish observation from interpretation in close reading.',
            weeklyAssessments: 'Close-reading memo with passage evidence, interpretive claim, and revision note.',
            asyncActivities: 'Annotate a short passage for diction, imagery, and repeated motifs.',
            syncActivities: 'Seminar passage workshop with claim testing and peer evidence challenge.',
            supportingResources: 'Close-reading guide; annotation model; interpretive claim checklist',
            evaluateDesign: 'Score passage specificity, claim focus, evidence fit, and revision use.',
          },
          {
            topicSection: 'Historical context, publication setting, author note, cultural reference',
            learningObjectives: 'Use historical context without replacing textual interpretation.',
            learningGoals: 'Students connect context to a passage claim without overgeneralizing.',
            weeklyAssessments: 'Context annotation with publication setting, cultural reference, and source limit.',
            asyncActivities: 'Read a context note and mark what it can and cannot prove about the passage.',
            syncActivities: 'Context mini-workshop comparing passage evidence with historical-context claims.',
            supportingResources: 'Context note; historical timeline excerpt; source-limit prompt',
            evaluateDesign: 'Score context accuracy, source-limit language, and connection to the passage claim.',
          },
        ],
      },
      {
        title: 'Week 2: Narrative Voice and Translation Choice',
        sections: [
          {
            topicSection: 'Narrative voice, focalization, narrator reliability, tone shift',
            learningObjectives: 'Evaluate how narrative voice shapes reader judgment in a selected passage.',
            learningGoals: 'Students explain how voice affects interpretation before making a claim.',
            weeklyAssessments: 'Narrative voice memo with focalization evidence and reliability question.',
            asyncActivities: 'Annotate narrator cues and mark a tone shift in the assigned passage.',
            syncActivities: 'Voice-mapping seminar with paired evidence defense and claim revision.',
            supportingResources: 'Narrative voice glossary; focalization examples; tone-shift worksheet',
            evaluateDesign: 'Score voice evidence, reliability reasoning, and revised claim clarity.',
          },
          {
            topicSection: 'Translation choice, word-level comparison, translator note, interpretive consequence',
            learningObjectives: 'Compare translation choices and explain how wording changes interpretation.',
            learningGoals: 'Students use translation evidence as an interpretive constraint.',
            weeklyAssessments: 'Translation comparison note with word choice, translator note, and consequence claim.',
            asyncActivities: 'Compare two translations of a short excerpt and flag one consequential word choice.',
            syncActivities: 'Translation-choice clinic with side-by-side evidence and interpretation debate.',
            supportingResources: 'Parallel translation excerpt; translator note; comparison table',
            evaluateDesign: 'Score comparison precision, translator-note use, and consequence reasoning.',
          },
        ],
      },
      {
        title: 'Week 3: Genre Convention and Social Setting',
        sections: [
          {
            topicSection: 'Genre convention, narrative expectation, form cue, reader contract',
            learningObjectives: 'Identify genre conventions and evaluate how they shape interpretive expectations.',
            learningGoals: 'Students avoid treating genre as a label detached from textual evidence.',
            weeklyAssessments: 'Genre convention memo with form cue, reader expectation, and exception note.',
            asyncActivities: 'Mark genre cues in two excerpts and identify one convention that is disrupted.',
            syncActivities: 'Genre comparison seminar with convention mapping and exception debate.',
            supportingResources: 'Genre convention chart; excerpt packet; reader-contract prompt',
            evaluateDesign: 'Score convention evidence, exception logic, and reader-expectation explanation.',
          },
          {
            topicSection: 'Social setting, class marker, family structure, institutional context',
            learningObjectives: 'Connect social setting details to a focused interpretive claim.',
            learningGoals: 'Students use setting as evidence, not background summary.',
            weeklyAssessments: 'Social-setting annotation with class marker, institution cue, and claim revision.',
            asyncActivities: 'Annotate setting details and sort them by social relation or institution.',
            syncActivities: 'Setting-evidence workshop with claim narrowing and peer challenge.',
            supportingResources: 'Setting detail checklist; social context note; claim revision model',
            evaluateDesign: 'Score setting specificity, evidence sorting, and claim narrowing.',
          },
        ],
      },
      {
        title: 'Week 4: Poetic Form and Performance Context',
        sections: [
          {
            topicSection: 'Poetic form, line break, sound pattern, rhythm, image sequence',
            learningObjectives: 'Analyze how poetic form contributes to meaning in a short poem.',
            learningGoals: 'Students make form visible before moving to thematic interpretation.',
            weeklyAssessments: 'Poetic form memo with line-break evidence, sound pattern, and meaning claim.',
            asyncActivities: 'Annotate line breaks and sound repetitions in the assigned poem.',
            syncActivities: 'Form reading seminar with aloud reading, sound-map comparison, and claim revision.',
            supportingResources: 'Poetic form glossary; sound-map example; line-break prompt',
            evaluateDesign: 'Score form evidence, sound-pattern accuracy, and claim connection.',
          },
          {
            topicSection: 'Performance context, oral tradition, audience relation, circulation history',
            learningObjectives: 'Evaluate how performance context changes interpretation of poetic form.',
            learningGoals: 'Students connect audience and circulation evidence to form analysis.',
            weeklyAssessments: 'Performance-context annotation with audience cue, circulation note, and source limit.',
            asyncActivities: 'Listen to a performance excerpt and compare it with the printed version.',
            syncActivities:
              'Performance-context workshop comparing oral delivery, audience relation, and text evidence.',
            supportingResources: 'Performance excerpt; circulation note; audience relation checklist',
            evaluateDesign: 'Score performance evidence, source-limit language, and form-context integration.',
          },
        ],
      },
      {
        title: 'Week 5: Critical Lens and Archive Note',
        sections: [
          {
            topicSection: 'Critical lens, theoretical keyword, interpretive frame, lens limitation',
            learningObjectives: 'Apply a critical lens while naming what the lens clarifies and obscures.',
            learningGoals: 'Students use theory as a tool rather than a substitute for passage evidence.',
            weeklyAssessments: 'Critical lens memo with keyword definition, passage evidence, and lens limit.',
            asyncActivities: 'Annotate one theoretical keyword and connect it to a passage detail.',
            syncActivities: 'Lens application seminar with evidence test, limitation naming, and claim repair.',
            supportingResources: 'Critical lens excerpt; keyword guide; lens limitation model',
            evaluateDesign: 'Score keyword accuracy, passage fit, and limitation language.',
          },
          {
            topicSection: 'Archive note, material context, paratext, edition choice, catalog clue',
            learningObjectives: 'Use archive or paratext evidence to refine, not replace, interpretation.',
            learningGoals: 'Students separate material evidence from unsupported historical claims.',
            weeklyAssessments: 'Archive note with paratext evidence, edition choice, and interpretation boundary.',
            asyncActivities: 'Review an edition note and identify one catalog clue that changes the reading question.',
            syncActivities: 'Archive-note workshop comparing material clues with passage evidence.',
            supportingResources: 'Edition note; catalog excerpt; paratext checklist',
            evaluateDesign: 'Score archive evidence, edition-choice reasoning, and interpretation boundary.',
          },
        ],
      },
      {
        title: 'Week 6: Adaptation Evidence and Medium Shift',
        sections: [
          {
            topicSection: 'Adaptation evidence, scene selection, medium shift, omitted detail',
            learningObjectives: 'Compare an adaptation choice with source-text evidence.',
            learningGoals: 'Students explain adaptation as an interpretive act.',
            weeklyAssessments: 'Adaptation comparison memo with source passage, scene choice, and medium-shift claim.',
            asyncActivities: 'Watch a short adaptation scene and annotate one omitted or transformed detail.',
            syncActivities: 'Adaptation seminar with source-scene comparison and medium-shift debate.',
            supportingResources: 'Source passage; adaptation clip; medium-shift comparison table',
            evaluateDesign: 'Score source-scene evidence, omitted-detail reasoning, and medium-specific claim.',
          },
          {
            topicSection: 'Reception context, audience expectation, review excerpt, cultural circulation',
            learningObjectives: 'Use reception context to explain how an adaptation circulates meaning.',
            learningGoals: 'Students connect audience evidence to adaptation interpretation.',
            weeklyAssessments: 'Reception annotation with audience expectation, review excerpt, and circulation claim.',
            asyncActivities: 'Read one review excerpt and mark what audience expectation it reveals.',
            syncActivities: 'Reception-context workshop comparing review evidence and adaptation decisions.',
            supportingResources: 'Review excerpt; reception context note; audience expectation checklist',
            evaluateDesign: 'Score reception evidence, audience reasoning, and adaptation connection.',
          },
        ],
      },
      {
        title: 'Week 7: Comparative Passage and Scholarly Conversation',
        sections: [
          {
            topicSection: 'Comparative passage, shared motif, contrast point, synthesis claim',
            learningObjectives:
              'Compare two passages and build a synthesis claim from shared and contrasting evidence.',
            learningGoals: 'Students make comparison arguable rather than parallel summary.',
            weeklyAssessments: 'Comparative passage memo with motif evidence, contrast point, and synthesis claim.',
            asyncActivities: 'Annotate two passages for shared motifs and one consequential difference.',
            syncActivities: 'Comparative seminar with evidence pairing, contrast testing, and claim revision.',
            supportingResources: 'Comparative passage packet; motif map; synthesis claim guide',
            evaluateDesign: 'Score evidence pairing, contrast logic, and synthesis claim focus.',
          },
          {
            topicSection: 'Scholarly conversation, source claim, disagreement, citation boundary',
            learningObjectives: 'Position an interpretive claim inside a scholarly conversation.',
            learningGoals: 'Students cite scholarship as conversation, not authority replacement.',
            weeklyAssessments: 'Scholarly conversation note with source claim, disagreement, and citation boundary.',
            asyncActivities: 'Read two short scholarly excerpts and identify a point of agreement or disagreement.',
            syncActivities: 'Scholarship workshop with source-claim mapping and citation-boundary revision.',
            supportingResources: 'Scholarly excerpt packet; citation boundary checklist; source-claim map',
            evaluateDesign: 'Score source-claim accuracy, disagreement logic, and citation integrity.',
          },
        ],
      },
      {
        title: 'Week 8: Final Interpretive Portfolio and Revision',
        sections: [
          {
            topicSection: 'Final interpretive portfolio, claim sequence, evidence trail, revision target',
            learningObjectives: 'Revise a portfolio of interpretive claims using evidence and feedback.',
            learningGoals: 'Students synthesize close reading, comparison, context, and revision.',
            weeklyAssessments: 'Final interpretive portfolio with revised claims, evidence trail, and reflection note.',
            asyncActivities: 'Select portfolio artifacts and tag the evidence that best supports each revised claim.',
            syncActivities: 'Portfolio conference with evidence triage, peer critique, and final revision target.',
            supportingResources: 'Portfolio checklist; revision tracker; evidence trail template',
            evaluateDesign: 'Score claim sequence, evidence trail, revision quality, and reflective transfer.',
          },
          {
            topicSection: 'Public-facing rationale, audience adaptation, presentation excerpt, source integrity',
            learningObjectives: 'Explain an interpretive argument to an audience while preserving source integrity.',
            learningGoals: 'Students adapt explanation without oversimplifying the evidence.',
            weeklyAssessments:
              'Public-facing rationale with audience adaptation, presentation excerpt, and source-integrity check.',
            asyncActivities: 'Draft a short presentation excerpt and mark where source evidence must remain visible.',
            syncActivities:
              'Final rationale rehearsal with audience questions, source-integrity check, and revision plan.',
            supportingResources: 'Rationale model; audience adaptation checklist; source-integrity prompt',
            evaluateDesign: 'Score audience fit, source integrity, presentation clarity, and revision plan.',
          },
        ],
      },
    ],
  },
};

const ONLINE_WRITING_GOLD_PROJECT = {
  id: 'gold-online-writing-workshop-project',
  label: 'Online academic writing workshop gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Online Academic Writing Workshop',
    learningOutcomes:
      'Use asynchronous discussion, source integration, peer annotation, online feedback, accessibility checks, and version history to revise evidence-based academic writing.',
    lessons: [
      {
        title: 'Online Orientation and Participation Plan',
        goals: 'Students understand how the online workshop makes reading, posting, feedback, and revision visible.',
        topics: 'Online orientation, course-site workflow, participation plan, response timing, revision target',
        objectives: 'Create an online participation plan that links discussion evidence to a first revision target.',
        assessment: 'LMS orientation memo with participation plan, evidence cue, and first revision target.',
        async: 'Complete the course-site walkthrough and post a short evidence-use commitment.',
        sync: 'Optional live welcome or recorded Q&A with workflow clarification and support triage.',
        resources: 'Course-site walkthrough; LMS checklist; participation-plan model',
        evaluation: 'Score workflow accuracy, participation timing, evidence cue, and revision target clarity.',
      },
      {
        title: 'Discussion Board Claims and Reply Moves',
        goals: 'Students turn asynchronous posts and replies into clearer academic claims.',
        topics: 'Discussion-board claim, reply move, evidence cue, audience response, revision priority',
        objectives: 'Analyze a discussion-board exchange and revise one claim using reply evidence.',
        assessment: 'Claim-revision memo with original post, peer reply evidence, and revised claim.',
        async: 'Post a claim, reply to two peers with evidence questions, and tag the strongest reply cue.',
        sync: 'Optional online claim clinic using sample posts and reply-move comparison.',
        resources: 'Discussion-board rubric; reply-stem bank; claim revision example',
        evaluation: 'Score claim focus, reply evidence use, audience awareness, and revision specificity.',
      },
      {
        title: 'Source Summary and Attribution',
        goals: 'Students distinguish accurate source summary from unsupported paraphrase or overquotation.',
        topics: 'Source summary, attribution phrase, paraphrase boundary, quote choice, source signal',
        objectives: 'Revise a source summary so attribution and evidence boundaries are clear.',
        assessment: 'Source-integration brief with summary, attribution cue, quote choice, and source limit.',
        async: 'Annotate one source paragraph and draft a course-site summary with attribution marks.',
        sync: 'Optional source-use walkthrough comparing summary, paraphrase, and quote decisions.',
        resources: 'Attribution guide; source summary model; quote-choice checklist',
        evaluation: 'Score attribution accuracy, source-boundary language, quote choice, and source-limit note.',
      },
      {
        title: 'Thesis Control and Paragraph Evidence',
        goals: 'Students connect paragraph evidence to a controlling thesis in a shared online draft.',
        topics: 'Thesis control, paragraph claim, evidence placement, reasoning link, draft comment',
        objectives: 'Evaluate whether paragraph evidence supports the thesis and revise one reasoning link.',
        assessment: 'Paragraph evidence memo with thesis check, paragraph claim, and reasoning-link revision.',
        async: 'Upload a paragraph draft and leave margin comments naming evidence and reasoning links.',
        sync: 'Optional virtual paragraph lab with before/after reasoning-link examples.',
        resources: 'Paragraph evidence checklist; thesis-control model; margin-comment guide',
        evaluation: 'Score thesis fit, evidence placement, reasoning explanation, and revision clarity.',
      },
      {
        title: 'Peer Annotation and Revision Plan',
        goals: 'Students use peer annotations to choose a focused, evidence-based revision plan.',
        topics: 'Peer annotation, revision priority, comment pattern, evidence gap, response note',
        objectives: 'Synthesize peer annotations into a revision plan with justified priorities.',
        assessment: 'Revision-plan memo with annotation pattern, priority decision, and response note.',
        async: 'Annotate two peer drafts and categorize comments as claim, evidence, structure, or style.',
        sync: 'Optional online peer-review debrief comparing high-value and low-value annotations.',
        resources: 'Peer annotation guide; revision-plan template; comment-category chart',
        evaluation: 'Score annotation specificity, priority logic, evidence gap diagnosis, and response quality.',
      },
      {
        title: 'Multimodal Explanation and Accessibility Check',
        goals: 'Students adapt written evidence for an online audience without weakening source integrity.',
        topics: 'Multimodal explanation, accessibility check, alt text, audience adaptation, source integrity',
        objectives: 'Create an accessible explanation that preserves the evidence and audience purpose.',
        assessment: 'Accessible explanation brief with alt-text note, audience adaptation, and source-integrity check.',
        async: 'Convert one paragraph into a brief multimodal explanation and complete an accessibility checklist.',
        sync: 'Optional accessibility walkthrough with sample alt text and audience adaptation discussion.',
        resources: 'Accessibility checklist; alt-text model; audience adaptation guide',
        evaluation: 'Score accessibility choices, audience fit, evidence preservation, and source-integrity note.',
      },
      {
        title: 'Feedback Integration and Version History',
        goals: 'Students show how instructor and peer feedback changed a draft across versions.',
        topics: 'Online feedback loop, version history, revision rationale, instructor note, change evidence',
        objectives: 'Compare draft versions and explain which feedback changed the writing and why.',
        assessment: 'Version-history memo with feedback quote, change evidence, and revision rationale.',
        async: 'Review feedback in the LMS, compare draft versions, and mark one sentence-level change.',
        sync: 'Optional revision conference using version history and feedback-priority notes.',
        resources: 'Version-history guide; feedback-priority checklist; revision rationale model',
        evaluation: 'Score feedback selection, change evidence, rationale quality, and next-revision target.',
      },
      {
        title: 'Final Revision Memo and Transfer Reflection',
        goals: 'Students synthesize online writing evidence and set a transfer goal for future writing.',
        topics: 'Final revision memo, transfer reflection, evidence trail, source integration, future goal',
        objectives: 'Synthesize draft evidence and feedback into a final revision memo with transfer goals.',
        assessment: 'Final revision memo with evidence trail, source-integration note, and transfer reflection.',
        async: 'Submit the final draft, revision memo, and transfer reflection through the course site.',
        sync: 'Optional closing forum where students share one transferable revision strategy.',
        resources: 'Revision memo checklist; final evidence-trail template; transfer reflection prompt',
        evaluation: 'Score evidence trail, source integration, revision explanation, and transfer goal specificity.',
      },
    ],
  }),
};

const QUANTITATIVE_PROBLEM_SET_GOLD_PROJECT = {
  id: 'gold-quantitative-problem-set-project',
  label: 'College algebra problem-solving gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'College Algebra Problem Solving',
    learningOutcomes:
      'Set up equations, graph functions, compare solution strategies, verify answers, diagnose algebra errors, and explain worked-solution reasoning.',
    lessons: [
      {
        title: 'Linear Equations and Solution Checks',
        goals: 'Students solve linear equations while showing setup, inverse operations, and answer checks.',
        topics: 'Linear equation setup, inverse operations, solution check, common algebra error',
        objectives: 'Solve linear equations and verify each answer by substitution.',
        assessment: 'Worked problem set with equation setup, step trace, solution check, and error note.',
        async: 'Complete practice problems and annotate one incorrect worked solution.',
        sync: 'Problem-solving clinic with setup comparison, step trace, and corrected solution.',
        resources: 'Equation-solving guide; worked-example set; solution-check checklist',
        evaluation: 'Score setup accuracy, step reasoning, answer verification, and error diagnosis.',
      },
      {
        title: 'Function Graphs and Representation Choice',
        goals: 'Students connect equations, tables, graphs, and verbal meaning when interpreting functions.',
        topics: 'Function notation, graphing, slope, intercept, representation choice',
        objectives: 'Graph linear functions and explain how representation changes interpretation.',
        assessment: 'Graphing problem set with equation, graph annotation, representation choice, and check.',
        async: 'Graph two functions and identify one representation error.',
        sync: 'Graph clinic comparing tables, equations, and annotated coordinate-plane evidence.',
        resources: 'Graphing checklist; function notation guide; representation-choice examples',
        evaluation: 'Score graph accuracy, representation alignment, explanation quality, and answer check.',
      },
      {
        title: 'Systems of Equations and Strategy Selection',
        goals: 'Students compare substitution, elimination, and graphing strategies for systems.',
        topics: 'System of equations, substitution, elimination, intersection point, strategy choice',
        objectives: 'Choose and justify an efficient strategy for solving a system of equations.',
        assessment: 'Systems problem set with chosen strategy, step trace, intersection check, and error analysis.',
        async: 'Solve one system two ways and note where the methods agree or diverge.',
        sync: 'Strategy-selection clinic comparing substitution, elimination, and graph checks.',
        resources: 'Systems strategy chart; intersection-check guide; worked examples',
        evaluation: 'Score strategy fit, algebra accuracy, intersection verification, and explanation clarity.',
      },
      {
        title: 'Quadratic Factoring and Root Checks',
        goals: 'Students use factoring and zero-product reasoning to solve quadratics and check roots.',
        topics: 'Quadratic expression, factoring, zero-product property, root check, graph intercept',
        objectives: 'Factor quadratics and verify roots against the original equation and graph.',
        assessment: 'Quadratic problem set with factor form, root calculation, graph annotation, and check.',
        async: 'Practice factoring problems and identify one invalid root from a flawed solution.',
        sync: 'Root-check clinic with factor comparison, graph intercept evidence, and corrected step.',
        resources: 'Factoring guide; graph intercept examples; root-check checklist',
        evaluation: 'Score factor accuracy, root logic, graph connection, and correction quality.',
      },
      {
        title: 'Exponential Rules and Growth Models',
        goals: 'Students apply exponent rules while explaining units, growth factors, and model meaning.',
        topics: 'Exponent rules, growth factor, repeated multiplication, model parameter, units',
        objectives: 'Simplify exponential expressions and interpret growth-model parameters.',
        assessment: 'Exponential model problem set with rule justification, parameter meaning, and unit check.',
        async: 'Simplify expressions and annotate one growth-model parameter in context.',
        sync: 'Growth-model clinic comparing rule choices, unit checks, and interpretation errors.',
        resources: 'Exponent-rule chart; growth model examples; unit-check prompt',
        evaluation: 'Score rule choice, parameter interpretation, unit consistency, and error diagnosis.',
      },
      {
        title: 'Logarithms and Inverse Reasoning',
        goals: 'Students solve logarithmic equations by making inverse reasoning and domain checks visible.',
        topics: 'Logarithm, inverse operation, domain restriction, extraneous solution, equation check',
        objectives: 'Solve logarithmic equations and reject invalid or extraneous solutions.',
        assessment: 'Logarithm problem set with inverse steps, domain check, solution verification, and error note.',
        async: 'Rewrite logarithmic statements and flag one invalid domain move.',
        sync: 'Inverse-reasoning clinic with domain comparison and checked solutions.',
        resources: 'Logarithm guide; domain checklist; inverse-operation examples',
        evaluation: 'Score inverse reasoning, domain accuracy, verification, and correction quality.',
      },
      {
        title: 'Optimization Models and Constraint Testing',
        goals: 'Students define variables, constraints, and objectives before testing an optimum.',
        topics: 'Optimization model, variable definition, constraint, objective function, feasible solution',
        objectives: 'Build a simple optimization model and verify the proposed optimum against constraints.',
        assessment: 'Optimization problem set with variable definitions, constraints, objective, and optimum check.',
        async: 'Draft variables and constraints for a scenario and identify one missing constraint.',
        sync: 'Optimization clinic comparing model setup, constraint tests, and answer verification.',
        resources: 'Optimization setup guide; constraint checklist; model examples',
        evaluation: 'Score variable definitions, constraint fit, objective logic, and optimum verification.',
      },
      {
        title: 'Proof Rationale and Final Error Analysis',
        goals: 'Students explain why a solution method works and transfer error analysis to a new problem.',
        topics: 'Proof rationale, error analysis, transfer problem, justification, solution strategy',
        objectives: 'Write a proof rationale and use error analysis to correct a new worked solution.',
        assessment: 'Final worked solution portfolio with proof rationale, corrected error, and transfer problem.',
        async: 'Review prior problem sets and select one error pattern to correct in a new problem.',
        sync: 'Final problem-solving conference with proof explanation, error diagnosis, and transfer check.',
        resources: 'Proof rationale model; error-analysis checklist; final portfolio template',
        evaluation: 'Score proof reasoning, correction accuracy, transfer strategy, and verification evidence.',
      },
    ],
  }),
};

const STATISTICS_INFERENCE_GOLD_PROJECT = {
  id: 'gold-statistics-inference-project',
  label: 'Statistical inference gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Introduction to Statistical Inference',
    learningOutcomes:
      'Use confidence intervals, hypothesis tests, p-values, assumption checks, effect size, and limitation language to make defensible statistical inference decisions from sample evidence.',
    lessons: [
      {
        title: 'Statistical Questions, Variables, and Samples',
        goals: 'Students frame statistical questions by naming variables, parameters, populations, and sample context.',
        topics: 'Statistical question, variable, parameter, population, sample, inference claim',
        objectives: 'Distinguish descriptive claims from statistical inference claims using sample context.',
        assessment:
          'Inference question memo with research question, variable or parameter, sample context, population claim, assumption note, and limitation.',
        async: 'Annotate three claims and identify which require inference from a sample.',
        sync: 'Question-framing clinic with variable identification, sample critique, and revised inference claim.',
        resources: 'Question-framing guide; variable table; sample-context examples',
        evaluation: 'Score question fit, variable clarity, sample context, inference claim, and limitation language.',
      },
      {
        title: 'Sampling Distributions and Standard Error',
        goals: 'Students explain sampling variability and standard error before using inferential procedures.',
        topics: 'Sampling distribution, standard error, estimator, variability, sample size, uncertainty',
        objectives: 'Interpret standard error as sampling variability for an estimator.',
        assessment:
          'Standard error explanation with estimator, sample size, sampling distribution sketch, uncertainty interpretation, and limitation note.',
        async: 'Compare two sampling distribution sketches and predict which has lower standard error.',
        sync: 'Sampling variability demonstration with simulation output, standard-error comparison, and uncertainty explanation.',
        resources: 'Sampling distribution simulator; standard-error checklist; uncertainty sentence frames',
        evaluation:
          'Score estimator identification, standard-error interpretation, uncertainty language, and limitation note.',
      },
      {
        title: 'Confidence Intervals and Margin of Error',
        goals: 'Students construct and interpret confidence intervals without overclaiming certainty.',
        topics: 'Confidence interval, margin of error, confidence level, standard error, interval estimate',
        objectives: 'Construct a confidence interval and interpret it in context with uncertainty and limitations.',
        assessment:
          'Confidence interval interpretation report with research question, sample context, standard error, margin of error, interval estimate, practical interpretation, and limitation note.',
        async: 'Annotate a confidence interval example and flag one incorrect certainty claim.',
        sync: 'Interval interpretation clinic with guided calculation, assumption check, uncertainty language, and revision.',
        resources: 'Confidence interval guide; margin-of-error examples; interpretation checklist',
        evaluation:
          'Score calculation accuracy, contextual interpretation, uncertainty language, and limitation quality.',
      },
      {
        title: 'Hypothesis Tests and P-values',
        goals: 'Students connect null and alternative hypotheses to test statistics, p-values, and evidence strength.',
        topics:
          'Null hypothesis, alternative hypothesis, test statistic, p-value, significance level, assumption check',
        objectives: 'Run a hypothesis test and explain the p-value as evidence under the null hypothesis.',
        assessment:
          'Hypothesis test write-up with null and alternative hypotheses, assumption check, test statistic, p-value explanation, significance decision, and limitation note.',
        async: 'Compare two p-value explanations and identify one statistical-significance overclaim.',
        sync: 'P-value interpretation clinic with output trace, assumption challenge, and revised inference decision.',
        resources: 'Hypothesis-test checklist; p-value explanation examples; assumption guide',
        evaluation:
          'Score hypothesis clarity, test statistic accuracy, p-value interpretation, assumption check, and limitation.',
      },
      {
        title: 'Two-Sample Comparisons and Effect Size',
        goals: 'Students compare groups using uncertainty, effect size, and practical interpretation.',
        topics: 'Two-sample test, difference in means, confidence interval, effect size, practical significance',
        objectives: 'Compare two groups and separate statistical significance from practical importance.',
        assessment:
          'Two-sample inference report with group comparison, confidence interval or test statistic, p-value, effect size, practical interpretation, and limitation note.',
        async: 'Review two group-comparison outputs and mark the effect size and uncertainty cues.',
        sync: 'Comparison clinic with interval interpretation, p-value trace, effect-size challenge, and revised conclusion.',
        resources: 'Two-sample test guide; effect-size table; practical-significance examples',
        evaluation:
          'Score comparison setup, output accuracy, effect-size reasoning, practical interpretation, and limitations.',
      },
      {
        title: 'Chi-Square Tests and Association',
        goals: 'Students use categorical data to evaluate association while checking expected counts and assumptions.',
        topics: 'Chi-square test, categorical variables, expected counts, association, independence, assumption check',
        objectives:
          'Interpret a chi-square test using expected counts, p-value, association language, and limitations.',
        assessment:
          'Chi-square inference memo with contingency table, expected-count check, test statistic, p-value explanation, association conclusion, and limitation note.',
        async: 'Inspect a contingency table and identify one expected-count or independence concern.',
        sync: 'Categorical-data clinic with expected-count check, chi-square output trace, and association-language revision.',
        resources: 'Chi-square guide; contingency-table template; expected-count checklist',
        evaluation:
          'Score table setup, expected-count check, p-value interpretation, association claim, and limitation note.',
      },
      {
        title: 'Regression Inference and Assumption Checks',
        goals: 'Students interpret regression coefficients with uncertainty, assumptions, and model limits.',
        topics:
          'Regression inference, slope estimate, confidence interval, residual plot, assumption check, prediction limit',
        objectives: 'Interpret a regression slope and evaluate assumptions before making an inference decision.',
        assessment:
          'Regression inference memo with research question, slope estimate, confidence interval or p-value, residual assumption check, interpretation, and prediction limitation.',
        async: 'Review a residual plot and note one assumption or prediction limitation.',
        sync: 'Regression inference clinic with output trace, residual check, slope interpretation, and limitation revision.',
        resources: 'Regression output guide; residual-plot checklist; slope interpretation examples',
        evaluation:
          'Score output interpretation, assumption check, uncertainty language, model-fit judgment, and prediction limits.',
      },
      {
        title: 'Final Statistical Inference Report and Handoff',
        goals:
          'Students synthesize question, sample, assumptions, output, uncertainty, and limitations for an audience.',
        topics:
          'Final inference report, assumption review, uncertainty synthesis, audience explanation, limitation handoff',
        objectives: 'Prepare a final inference report that supports a defensible audience-facing conclusion.',
        assessment:
          'Final statistical inference report with question, sample context, selected test or interval, assumptions, p-value or confidence interval, effect size where relevant, inference decision, and limitation handoff.',
        async: 'Revise one prior inference write-up to improve assumption, uncertainty, and limitation language.',
        sync: 'Final inference handoff with peer review of output trace, effect size, limitation language, and audience conclusion.',
        resources: 'Final report checklist; audience explanation template; inference-review rubric',
        evaluation:
          'Score source fit, assumption review, output accuracy, uncertainty interpretation, effect size, and decision usefulness.',
      },
    ],
  }),
};

const ACCOUNTING_FINANCE_GOLD_PROJECT = {
  id: 'gold-accounting-finance-project',
  label: 'Accounting and finance analysis gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Financial Accounting and Statement Analysis',
    learningOutcomes:
      'Prepare journal entries, connect transactions to financial statements, calculate ratios, analyze cash-flow effects, review controls, evaluate budgets and valuation assumptions, and make defensible financial decisions.',
    lessons: [
      {
        title: 'Transactions, Accounts, and Journal Entries',
        goals: 'Students connect source documents, account classification, debits, credits, and statement effects.',
        topics: 'Source document, journal entry, debit, credit, chart of accounts, ledger, statement effect',
        objectives: 'Record transactions as journal entries and explain the financial statement effect.',
        assessment:
          'Journal-entry worksheet with source document, debit and credit account classification, ledger posting, statement effect, and control note.',
        async: 'Classify sample transactions by account and identify the source document for each entry.',
        sync: 'Financial analysis clinic with source document check, account classification, statement-effect review, and corrected entry.',
        resources: 'Chart of accounts; journal-entry guide; source-document examples',
        evaluation:
          'Score source fit, debit/credit accuracy, account classification, statement linkage, and control note.',
      },
      {
        title: 'Adjusting Entries and Trial Balance Review',
        goals: 'Students use accrual logic to adjust accounts and verify the trial balance before reporting.',
        topics: 'Adjusting entry, accrual, deferral, ledger, trial balance, closing process, control check',
        objectives: 'Prepare adjusting entries and explain how they correct the trial balance.',
        assessment:
          'Adjusting-entry review with accrual or deferral source, account classification, trial balance effect, corrected ledger, and control explanation.',
        async: 'Review a trial balance and flag one account that needs an adjusting entry.',
        sync: 'Adjustment clinic with ledger trace, trial-balance check, peer classification challenge, and corrected entry.',
        resources: 'Accrual/deferral guide; trial-balance checklist; adjusting-entry examples',
        evaluation: 'Score adjustment logic, ledger accuracy, trial-balance effect, and control explanation.',
      },
      {
        title: 'Financial Statements and Statement Linkage',
        goals: 'Students trace how income statement, balance sheet, and cash-flow statement signals connect.',
        topics: 'Income statement, balance sheet, cash-flow statement, retained earnings, statement linkage',
        objectives: 'Explain how transactions and adjustments flow through the core financial statements.',
        assessment:
          'Statement linkage memo with income statement line, balance sheet effect, cash-flow classification, source evidence, and limitation note.',
        async: 'Map one transaction across income statement, balance sheet, and cash-flow statement lines.',
        sync: 'Statement linkage workshop with line-item trace, cash-flow classification, and corrected explanation.',
        resources: 'Statement linkage map; cash-flow classification guide; financial-statement template',
        evaluation: 'Score statement trace, line-item accuracy, cash-flow classification, and limitation language.',
      },
      {
        title: 'Ratio Analysis and Liquidity Decisions',
        goals: 'Students calculate liquidity and leverage ratios while connecting them to statement evidence.',
        topics: 'Ratio analysis, current ratio, debt-to-equity, gross margin, working capital, decision usefulness',
        objectives: 'Calculate and interpret ratios using balance sheet and income statement source lines.',
        assessment:
          'Ratio analysis memo with statement source lines, current ratio, debt-to-equity, gross margin, interpretation, assumption check, and financial decision.',
        async: 'Calculate two ratios and annotate the source line for each numerator and denominator.',
        sync: 'Ratio clinic with statement-line trace, assumption challenge, peer interpretation, and revised decision.',
        resources: 'Ratio formula sheet; statement-line examples; decision-usefulness checklist',
        evaluation:
          'Score ratio accuracy, source-line trace, assumption check, interpretation, and decision usefulness.',
      },
      {
        title: 'Cash-Flow Forecast and Working Capital',
        goals: 'Students forecast cash flows and explain working-capital assumptions before recommending action.',
        topics: 'Cash-flow forecast, working capital, collections, payments, operating cash flow, assumption risk',
        objectives: 'Build a cash-flow forecast and interpret the working-capital risk.',
        assessment:
          'Cash-flow forecast with source assumptions, inflow/outflow schedule, working-capital effect, risk note, and financial decision.',
        async: 'Review a cash receipts schedule and identify one risky collection assumption.',
        sync: 'Cash-flow clinic with assumption check, inflow/outflow trace, working-capital interpretation, and revised forecast.',
        resources: 'Cash-flow forecast template; working-capital examples; assumption checklist',
        evaluation: 'Score forecast logic, source assumptions, working-capital interpretation, and risk note.',
      },
      {
        title: 'Budget Variance and Contribution Margin',
        goals: 'Students separate price, volume, cost, and mix effects when interpreting budget variances.',
        topics: 'Budget variance, contribution margin, cost-volume-profit, break-even, price variance, volume variance',
        objectives: 'Analyze budget variance drivers and recommend a financially defensible response.',
        assessment:
          'Budget variance report with flexible budget, price/volume variance, contribution margin, break-even effect, source calculation, and decision note.',
        async: 'Compare actual and budgeted results and tag whether the variance is price, volume, or cost driven.',
        sync: 'Variance clinic with calculation trace, contribution-margin check, root-cause challenge, and revised action.',
        resources: 'Flexible budget template; variance formula sheet; contribution-margin examples',
        evaluation: 'Score variance classification, calculation accuracy, margin interpretation, and decision note.',
      },
      {
        title: 'Valuation Models and Assumption Sensitivity',
        goals: 'Students test valuation conclusions against discounted cash-flow assumptions and sensitivity checks.',
        topics: 'Valuation model, net present value, discounted cash flow, discount rate, terminal value, sensitivity',
        objectives: 'Build a valuation model and evaluate how assumptions change the financial decision.',
        assessment:
          'Valuation model memo with cash-flow projection, discount-rate assumption, NPV calculation, sensitivity table, decision recommendation, and limitation note.',
        async: 'Change one valuation assumption and record how the NPV result changes.',
        sync: 'Valuation clinic with model trace, assumption sensitivity challenge, and revised recommendation.',
        resources: 'DCF model template; NPV guide; sensitivity table example',
        evaluation:
          'Score model trace, assumption support, NPV accuracy, sensitivity reasoning, and limitation quality.',
      },
      {
        title: 'Final Financial Analysis Handoff',
        goals: 'Students synthesize entries, statements, ratios, cash flow, controls, assumptions, and decisions.',
        topics:
          'Final financial analysis, source evidence, statement effect, ratio interpretation, control review, decision handoff',
        objectives: 'Prepare a final financial analysis package that supports a management-facing decision.',
        assessment:
          'Final financial analysis report with source evidence, statement linkage, ratio analysis, cash-flow interpretation, control or assumption review, financial decision, and limitation handoff.',
        async:
          'Revise one prior financial memo to strengthen source evidence, statement linkage, and assumption language.',
        sync: 'Final financial analysis handoff with peer review of statement effects, controls, assumptions, and decision usefulness.',
        resources: 'Final report checklist; management memo template; control-review guide',
        evaluation:
          'Score source evidence, statement linkage, calculation trace, control/assumption review, and handoff usefulness.',
      },
    ],
  }),
};

const POLICY_ANALYSIS_GOLD_PROJECT = {
  id: 'gold-policy-analysis-project',
  label: 'Public policy analysis gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Public Policy Analysis and Implementation',
    learningOutcomes:
      'Frame public problems, evaluate evidence, compare policy options, analyze stakeholders and equity, test feasibility, plan implementation, assess impact, and write defensible policy memos.',
    lessons: [
      {
        title: 'Problem Definition and Policy Authority',
        goals: 'Students define a public problem and identify who has authority to act.',
        topics: 'Public problem, policy authority, affected population, agenda setting, administrative burden',
        objectives: 'Write a problem statement that names the affected population, decision maker, and evidence need.',
        assessment:
          'Policy memo with public problem definition, affected population, policy authority, source evidence, administrative burden note, and policy decision.',
        async: 'Compare two problem statements and annotate authority, affected population, and evidence limits.',
        sync: 'Problem-definition clinic with authority map, stakeholder cue, evidence trace, and revised policy decision.',
        resources: 'Problem-definition guide; public authority map; policy memo examples',
        evaluation:
          'Score problem framing, authority fit, source credibility, stakeholder representation, and decision usefulness.',
      },
      {
        title: 'Evidence Sources and Causal Logic',
        goals: 'Students evaluate whether policy evidence supports a causal claim or only a correlation.',
        topics:
          'Evidence source, causal claim, administrative data, research finding, source credibility, evidence limit',
        objectives: 'Use credible evidence to support or limit a policy claim.',
        assessment:
          'Evidence appraisal brief with source credibility, causal logic, evidence limit, affected population, and policy implication.',
        async: 'Annotate one research or administrative source for claim strength and missing evidence.',
        sync: 'Evidence clinic with source credibility check, causal-logic challenge, and revised policy implication.',
        resources: 'Evidence appraisal checklist; causal logic examples; source credibility guide',
        evaluation: 'Score source credibility, causal reasoning, evidence limitation, and policy implication.',
      },
      {
        title: 'Stakeholder Mapping and Equity Analysis',
        goals: 'Students map who benefits, who bears costs, and whose evidence is missing.',
        topics: 'Stakeholder analysis, equity analysis, distributional impact, affected community, representation',
        objectives: 'Analyze stakeholder interests and equity effects before ranking policy options.',
        assessment:
          'Stakeholder and equity analysis with affected groups, benefits, burdens, representation gap, equity risk, and revision note.',
        async: 'Build a stakeholder map and mark one group whose evidence is missing.',
        sync: 'Stakeholder/equity clinic with representation check, burden analysis, and revised option ranking.',
        resources: 'Stakeholder map template; equity impact checklist; representation gap examples',
        evaluation:
          'Score stakeholder coverage, equity reasoning, burden analysis, representation gap, and revision quality.',
      },
      {
        title: 'Policy Options and Cost-Benefit Tradeoffs',
        goals: 'Students compare policy options using evidence, public value, costs, and feasibility.',
        topics: 'Policy option, cost-benefit analysis, public value, tradeoff, feasibility constraint',
        objectives: 'Compare at least two policy options and justify a recommendation with tradeoff evidence.',
        assessment:
          'Policy option matrix with option comparison, cost-benefit note, public value claim, feasibility constraint, and recommendation rationale.',
        async: 'Rank two options and identify one cost, benefit, and feasibility constraint for each.',
        sync: 'Option clinic with cost-benefit challenge, public-value defense, and revised recommendation.',
        resources: 'Option matrix template; cost-benefit examples; feasibility checklist',
        evaluation: 'Score option comparison, cost-benefit logic, feasibility analysis, and recommendation rationale.',
      },
      {
        title: 'Implementation Design and Administrative Burden',
        goals: 'Students translate a policy recommendation into realistic implementation steps.',
        topics: 'Implementation plan, administrative burden, service delivery, compliance, timeline, risk mitigation',
        objectives: 'Design implementation steps and identify burdens or risks that could undermine the policy.',
        assessment:
          'Implementation plan with delivery steps, responsible actor, administrative burden, feasibility risk, mitigation, and policy decision.',
        async: 'Review a program rollout and flag one administrative burden or delivery risk.',
        sync: 'Implementation clinic with delivery-step trace, burden challenge, mitigation review, and revised plan.',
        resources: 'Implementation plan template; administrative burden guide; risk mitigation examples',
        evaluation:
          'Score implementation specificity, burden analysis, feasibility risk, mitigation, and decision usefulness.',
      },
      {
        title: 'Regulatory and Governance Analysis',
        goals: 'Students test policy options against authority, accountability, and governance constraints.',
        topics: 'Regulatory analysis, governance, accountability, compliance, statutory authority, enforcement',
        objectives: 'Evaluate whether a policy option fits the legal, administrative, and governance setting.',
        assessment:
          'Regulatory analysis note with authority check, governance constraint, compliance risk, accountability cue, and recommendation revision.',
        async: 'Identify the authority and enforcement mechanism for one policy proposal.',
        sync: 'Governance clinic with authority check, accountability challenge, compliance-risk review, and revised option.',
        resources: 'Authority checklist; governance map; compliance-risk examples',
        evaluation: 'Score authority fit, governance reasoning, compliance risk, accountability, and revision quality.',
      },
      {
        title: 'Program Evaluation and Impact Assessment',
        goals: 'Students plan how to judge whether a policy worked and for whom.',
        topics:
          'Program evaluation, impact assessment, outcome indicator, implementation fidelity, unintended consequence',
        objectives:
          'Design an evaluation plan that connects outcomes, indicators, evidence limits, and equity effects.',
        assessment:
          'Impact assessment brief with outcome indicators, comparison logic, implementation fidelity check, equity effect, and policy decision.',
        async: 'Match outcomes to indicators and flag one possible unintended consequence.',
        sync: 'Impact clinic with indicator review, fidelity check, equity challenge, and revised evidence plan.',
        resources: 'Evaluation design template; indicator bank; impact assessment examples',
        evaluation:
          'Score outcome-indicator fit, evidence logic, implementation fidelity, equity impact, and uncertainty language.',
      },
      {
        title: 'Final Policy Memo Handoff',
        goals: 'Students synthesize problem, options, equity, feasibility, implementation, and impact evidence.',
        topics: 'Final policy memo, option comparison, stakeholder evidence, equity, feasibility, implementation risk',
        objectives: 'Prepare a final policy memo that supports a defensible public-sector recommendation.',
        assessment:
          'Final policy memo with problem definition, policy evidence, option comparison, stakeholder and equity analysis, feasibility review, implementation risk, policy decision, and limitation handoff.',
        async:
          'Revise one prior memo section to strengthen evidence limits, equity reasoning, and implementation realism.',
        sync: 'Final policy memo handoff with peer review of problem framing, option tradeoffs, equity, feasibility, and implementation risk.',
        resources: 'Final policy memo checklist; decision-maker briefing template; implementation review guide',
        evaluation:
          'Score problem framing, policy evidence, option comparison, equity/feasibility reasoning, implementation risk, and handoff usefulness.',
      },
    ],
  }),
};

const ECONOMICS_ANALYSIS_GOLD_PROJECT = {
  id: 'gold-economics-analysis-project',
  label: 'Economics analysis gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Principles of Microeconomics and Market Analysis',
    learningOutcomes:
      'Use opportunity cost, marginal reasoning, supply and demand, market equilibrium, elasticity, surplus, tax incidence, externalities, market structure, and assumption limits to make defensible economic decisions.',
    lessons: [
      {
        title: 'Scarcity, Opportunity Cost, and Marginal Thinking',
        goals: 'Students use opportunity cost and marginal benefit/cost evidence before making a choice.',
        topics: 'Scarcity, opportunity cost, marginal benefit, marginal cost, incentive, tradeoff',
        objectives: 'Analyze a choice by naming the opportunity cost, marginal benefit, marginal cost, and assumption.',
        assessment:
          'Economic analysis brief with opportunity cost, marginal benefit, marginal cost, incentive tradeoff, assumption note, and economic decision.',
        async: 'Compare two resource-allocation choices and mark the opportunity cost of each.',
        sync: 'Economic model clinic with tradeoff identification, marginal analysis, assumption challenge, and revised decision.',
        resources: 'Opportunity-cost guide; marginal reasoning examples; economic decision template',
        evaluation: 'Score opportunity-cost fit, marginal reasoning, assumption clarity, and decision usefulness.',
      },
      {
        title: 'Supply, Demand, and Market Equilibrium',
        goals: 'Students trace how a supply or demand shock changes equilibrium price and quantity.',
        topics: 'Supply and demand, market equilibrium, comparative statics, price signal, shortage, surplus',
        objectives: 'Draw a supply-demand model and explain the equilibrium effect of a market shock.',
        assessment:
          'Supply-demand analysis with market definition, shifted curve, market equilibrium change, comparative statics explanation, assumption note, and economic decision.',
        async: 'Annotate one supply-demand diagram and identify whether supply or demand shifts.',
        sync: 'Market-equilibrium clinic with diagram trace, comparative-statics challenge, and revised explanation.',
        resources: 'Supply-demand diagram guide; market-shock examples; comparative-statics checklist',
        evaluation: 'Score market definition, diagram accuracy, equilibrium reasoning, and assumption language.',
      },
      {
        title: 'Elasticity and Revenue Effects',
        goals: 'Students estimate elasticity and use it to explain revenue, burden, or response changes.',
        topics: 'Elasticity, price responsiveness, total revenue, percentage change, demand curve',
        objectives: 'Interpret elasticity and predict how price changes affect quantity and revenue.',
        assessment:
          'Elasticity memo with elasticity estimate, demand responsiveness, revenue effect, assumption limit, and economic decision.',
        async: 'Compare elastic and inelastic demand examples and predict the revenue effect.',
        sync: 'Elasticity clinic with calculation trace, response comparison, peer challenge, and revised decision.',
        resources: 'Elasticity formula sheet; response examples; revenue-effect checklist',
        evaluation: 'Score elasticity calculation, interpretation, revenue logic, and limitation language.',
      },
      {
        title: 'Consumer Surplus, Producer Surplus, and Price Controls',
        goals: 'Students use surplus and deadweight loss to explain welfare effects.',
        topics: 'Consumer surplus, producer surplus, price ceiling, price floor, shortage, deadweight loss',
        objectives: 'Evaluate a price control by explaining surplus changes, shortage or surplus, and deadweight loss.',
        assessment:
          'Welfare analysis with consumer surplus, producer surplus, price-control effect, shortage or surplus, deadweight loss, and economic decision.',
        async: 'Mark consumer surplus and producer surplus on a price-control diagram.',
        sync: 'Welfare analysis clinic with surplus diagram, deadweight-loss challenge, and revised decision.',
        resources: 'Surplus diagram model; price-control examples; welfare checklist',
        evaluation:
          'Score surplus identification, price-control reasoning, deadweight-loss interpretation, and decision fit.',
      },
      {
        title: 'Tax Incidence and Distributional Burden',
        goals: 'Students distinguish legal tax liability from economic incidence and burden.',
        topics: 'Tax incidence, elasticity, tax wedge, burden, consumer surplus, producer surplus',
        objectives: 'Analyze who bears a tax burden using elasticity, surplus changes, and incidence evidence.',
        assessment:
          'Tax incidence note with elasticity comparison, tax wedge, burden distribution, surplus effect, deadweight loss, and economic decision.',
        async: 'Predict tax burden in two markets with different elasticities.',
        sync: 'Incidence clinic with elasticity comparison, burden trace, welfare-effect review, and revised recommendation.',
        resources: 'Tax-incidence guide; burden examples; elasticity comparison worksheet',
        evaluation: 'Score incidence logic, elasticity use, surplus interpretation, and assumption clarity.',
      },
      {
        title: 'Externalities and Market Failure',
        goals: 'Students explain when private incentives diverge from social costs or benefits.',
        topics: 'Externality, market failure, social cost, social benefit, incentive design, corrective tax',
        objectives: 'Diagnose a market failure and evaluate an incentive-based response.',
        assessment:
          'Market failure analysis with external cost or benefit, private incentive, social-cost gap, corrective option, limitation, and economic decision.',
        async: 'Classify examples as positive externality, negative externality, or no externality.',
        sync: 'Externality clinic with incentive map, social-cost challenge, corrective-option review, and revised decision.',
        resources: 'Externality examples; social-cost diagram; incentive-design checklist',
        evaluation: 'Score externality diagnosis, incentive reasoning, corrective option, and limitation language.',
      },
      {
        title: 'Market Structure and Pricing Power',
        goals: 'Students compare competitive and monopolistic behavior using marginal reasoning.',
        topics: 'Perfect competition, monopoly, marginal revenue, marginal cost, pricing power, efficiency',
        objectives: 'Compare market-structure assumptions and explain pricing or output decisions.',
        assessment:
          'Market-structure memo with competition assumption, marginal revenue, marginal cost, pricing power, welfare effect, and economic decision.',
        async: 'Compare competitive and monopoly diagrams and flag the pricing-power assumption.',
        sync: 'Market-structure clinic with marginal-revenue trace, welfare comparison, and revised analysis.',
        resources: 'Market-structure guide; monopoly diagram; pricing-power checklist',
        evaluation: 'Score market-structure fit, marginal reasoning, welfare effect, and decision usefulness.',
      },
      {
        title: 'Final Economic Analysis Handoff',
        goals: 'Students synthesize market context, assumptions, model evidence, welfare, and decision limits.',
        topics: 'Final economic analysis, market context, model evidence, incentives, welfare, assumption limit',
        objectives: 'Prepare a final economic analysis package that supports an applied decision.',
        assessment:
          'Final economic analysis brief with market context, model evidence, elasticity or surplus trace, incentive and welfare interpretation, assumption limit, economic decision, and review handoff.',
        async:
          'Revise one prior economic brief to strengthen model evidence, assumption language, and welfare interpretation.',
        sync: 'Final economic analysis handoff with peer review of model fit, incentives, welfare effects, and decision limits.',
        resources: 'Final analysis checklist; economic brief template; model-review guide',
        evaluation:
          'Score market definition, economic evidence, model accuracy, welfare or incentive reasoning, limitation language, and handoff usefulness.',
      },
    ],
  }),
};

const ETHICS_ARGUMENT_GOLD_PROJECT = {
  id: 'gold-ethics-argument-project',
  label: 'Ethics argumentation gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Applied Ethics and Moral Reasoning',
    learningOutcomes:
      'Use normative frameworks, moral argument maps, thought experiments, objections, replies, stakeholder harms, rights, justice, care, virtue, and case evidence to make defensible moral decisions.',
    lessons: [
      {
        title: 'Moral Arguments and Normative Frameworks',
        goals: 'Students distinguish personal opinion from a claim supported by reasons, principles, and limits.',
        topics: 'Ethics, moral argument, normative framework, claim, reason, principle, stakeholder harm',
        objectives:
          'Build a moral argument map with a claim, reasons, framework, affected parties, and decision limit.',
        assessment:
          'Ethical argument brief with moral issue, affected parties, normative framework, claim, reasons, objection, reply, and moral decision.',
        async: 'Annotate two short moral arguments and mark the claim, reason, principle, and missing objection.',
        sync: 'Ethical argument seminar with dilemma framing, framework comparison, argument-map share, objection and reply, and revised moral judgment.',
        resources: 'Argument-map guide; normative framework overview; dilemma analysis template',
        evaluation:
          'Score claim clarity, framework fit, reason support, objection strength, reply quality, and judgment limit.',
      },
      {
        title: 'Utilitarianism and Consequences',
        goals: 'Students evaluate consequences, stakeholders, and aggregate harm without ignoring minority burden.',
        topics: 'Utilitarianism, consequences, stakeholder harm, aggregate benefit, utility, tradeoff',
        objectives: 'Apply utilitarian reasoning to a dilemma and name the evidence limit.',
        assessment:
          'Utilitarian argument memo with consequence map, stakeholder harm, aggregate benefit, objection, reply, and moral decision.',
        async: 'Compare two consequence maps and identify whose harm is minimized or ignored.',
        sync: 'Utilitarianism clinic with stakeholder consequence mapping, objection challenge, and revised judgment.',
        resources: 'Utilitarianism guide; consequence-map template; stakeholder harm examples',
        evaluation:
          'Score consequence trace, stakeholder coverage, objection quality, reply strength, and decision limit.',
      },
      {
        title: 'Deontology, Rights, and Duties',
        goals: 'Students compare duties, rights, and constraints on action before judging a case.',
        topics: 'Deontology, rights, duty, respect, autonomy, universal principle, moral constraint',
        objectives: 'Use rights and duties to evaluate whether an action is morally permitted.',
        assessment:
          'Rights and duties brief with deontological principle, right at stake, duty conflict, case evidence, objection, reply, and moral decision.',
        async: 'Identify the duty and right at stake in two short case dilemmas.',
        sync: 'Rights-and-duties seminar with principle test, objection/reply practice, and revised moral judgment.',
        resources: 'Deontology guide; rights checklist; duty-conflict examples',
        evaluation: 'Score principle accuracy, rights analysis, duty conflict, objection reply, and judgment quality.',
      },
      {
        title: 'Virtue Ethics and Care Ethics',
        goals: 'Students reason from character, relationship, care, and practical wisdom without losing case evidence.',
        topics: 'Virtue ethics, care ethics, character, relationship, practical wisdom, dependency, responsibility',
        objectives: 'Compare virtue and care arguments for a relational dilemma.',
        assessment:
          'Virtue and care analysis with character evidence, care obligation, relationship context, objection, reply, and moral decision.',
        async: 'Annotate a case for virtues, care responsibilities, and relationship context.',
        sync: 'Virtue/care seminar with case variation, practical-wisdom challenge, and revised judgment.',
        resources: 'Virtue ethics guide; care ethics guide; relational dilemma example',
        evaluation:
          'Score virtue fit, care obligation, relationship evidence, objection quality, and judgment revision.',
      },
      {
        title: 'Justice, Fairness, and Distribution',
        goals:
          'Students analyze fairness, burden, benefit, and process when moral decisions affect groups differently.',
        topics: 'Justice, fairness, distribution, rights, burden, benefit, procedural justice, equity',
        objectives: 'Evaluate a moral dilemma using a justice principle and distributional evidence.',
        assessment:
          'Justice analysis with fairness principle, benefit and burden map, procedural concern, objection, reply, and moral decision.',
        async: 'Map who receives benefits and who bears burdens in a contested decision.',
        sync: 'Justice seminar with distribution map, fairness-principle challenge, objection/reply, and revised decision.',
        resources: 'Justice framework overview; distribution map; fairness checklist',
        evaluation:
          'Score justice principle, distribution evidence, procedural reasoning, objection reply, and judgment limit.',
      },
      {
        title: 'Thought Experiments and Counterexamples',
        goals: 'Students test moral principles against case variations and counterexamples.',
        topics: 'Thought experiment, counterexample, trolley problem, principle testing, case variation, objection',
        objectives: 'Use a thought experiment to test whether a moral principle is too broad or too narrow.',
        assessment:
          'Thought-experiment response with principle statement, case variation, counterexample, objection, reply, and revised moral judgment.',
        async: 'Write one case variation that pressures a moral principle.',
        sync: 'Thought-experiment clinic with counterexample testing, objection sorting, and revised principle.',
        resources: 'Thought-experiment examples; counterexample checklist; principle-revision guide',
        evaluation:
          'Score principle clarity, counterexample strength, reply quality, case application, and judgment revision.',
      },
      {
        title: 'Applied Ethics Case Analysis',
        goals: 'Students apply frameworks to technology, health, professional, or environmental ethics dilemmas.',
        topics:
          'Applied ethics, case dilemma, professional responsibility, technology ethics, bioethics, stakeholder harm',
        objectives: 'Apply at least two frameworks to an applied ethics case and justify a moral decision.',
        assessment:
          'Applied ethics case judgment with case facts, stakeholder harm, framework comparison, objection, reply, action limit, and moral decision.',
        async: 'Read an applied ethics case and identify two possible frameworks for analysis.',
        sync: 'Case-application seminar with stakeholder harm review, framework comparison, objection/reply, and revised judgment.',
        resources: 'Applied ethics case packet; stakeholder checklist; framework comparison table',
        evaluation:
          'Score case evidence, framework comparison, stakeholder sensitivity, objection reply, and action limit.',
      },
      {
        title: 'Final Ethical Argument Handoff',
        goals: 'Students synthesize framework, argument map, objections, replies, and judgment limits.',
        topics: 'Final ethical argument, normative framework, argument map, objection, reply, moral decision, limit',
        objectives: 'Prepare a final ethical argument that can withstand a serious objection and case variation.',
        assessment:
          'Final ethical argument portfolio with moral issue, normative framework, argument map, strongest objection, reply, case application, moral decision, and judgment limit.',
        async: 'Revise one prior ethical argument to strengthen objection, reply, and judgment-limit language.',
        sync: 'Final ethical argument handoff with peer review of framework fit, objection strength, reply quality, and decision limit.',
        resources: 'Final argument checklist; portfolio template; ethical review guide',
        evaluation:
          'Score moral issue framing, framework fit, argument evidence, objection/reply, stakeholder sensitivity, and handoff usefulness.',
      },
    ],
  }),
};

const PROOF_SEMINAR_GOLD_PROJECT = {
  id: 'gold-proof-seminar-project',
  label: 'Real analysis proof seminar gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Real Analysis Proof Seminar',
    learningOutcomes:
      'Write theorem proofs using definitions, hypotheses, quantifier precision, proof strategy, logical implications, counterexample tests, notation clarity, and revision after proof critique.',
    lessons: [
      {
        title: 'Definitions, Quantifiers, and Direct Proof',
        goals: 'Students parse definitions, hypotheses, and conclusions before writing a direct proof.',
        topics: 'Definition use, quantifier precision, theorem statement, hypothesis, direct proof strategy',
        objectives: 'Construct a direct proof with explicit definitions and justified implications.',
        assessment:
          'Direct theorem proof write-up with definitions, hypotheses, quantifier precision, logical step justification, and revision note.',
        async: 'Annotate a theorem statement and identify definitions, hypotheses, and conclusion.',
        sync: 'Proof clinic with definition unpacking, proof-strategy comparison, guided proof construction, and peer critique.',
        resources: 'Definition list; theorem annotation guide; proof critique checklist',
        evaluation:
          'Score definition use, quantifier precision, logical validity, notation clarity, and revision quality.',
      },
      {
        title: 'Contrapositive and Contradiction Proof',
        goals: 'Students choose proof strategy based on claim structure rather than habit.',
        topics: 'Contrapositive, contradiction proof, implication, negation, proof strategy decision',
        objectives: 'Compare direct, contrapositive, and contradiction strategies for a theorem.',
        assessment:
          'Proof strategy memo with theorem statement, chosen strategy, negation check, justified steps, and revision rationale.',
        async: 'Classify theorem statements by likely direct, contrapositive, or contradiction strategy.',
        sync: 'Strategy comparison workshop with proof outlines, peer challenge, and revised proof plan.',
        resources: 'Proof strategy chart; negation guide; contradiction proof model',
        evaluation: 'Assess strategy fit, negation accuracy, implication logic, and revision rationale.',
      },
      {
        title: 'Induction and Recursive Structure',
        goals: 'Students make induction hypotheses and induction steps explicit.',
        topics: 'Mathematical induction, base case, induction hypothesis, induction step, recursive structure',
        objectives: 'Write an induction proof with a valid base case and induction step.',
        assessment:
          'Induction proof portfolio entry with base case, induction hypothesis, induction step, theorem conclusion, and gap revision.',
        async: 'Annotate a flawed induction proof and identify the missing hypothesis use.',
        sync: 'Induction clinic with base-case comparison, hypothesis-use check, and revised induction step.',
        resources: 'Induction proof checklist; flawed proof sample; recursive pattern guide',
        evaluation: 'Score base case, hypothesis use, induction-step logic, and revision quality.',
      },
      {
        title: 'Epsilon-Delta Limits and Quantifier Order',
        goals: 'Students track dependencies between epsilon, delta, and quantifiers.',
        topics: 'Epsilon-delta proof, limit definition, quantifier order, dependency, notation precision',
        objectives: 'Write an epsilon-delta proof that preserves quantifier order and dependencies.',
        assessment:
          'Epsilon-delta proof revision with definition map, quantifier order, delta choice, logical implications, and notation note.',
        async: 'Map the quantifiers in a limit definition and predict where the delta choice enters.',
        sync: 'Epsilon-delta workshop with dependency tracing, notation critique, and revised proof step.',
        resources: 'Limit definition map; epsilon-delta example; quantifier checklist',
        evaluation: 'Assess definition use, dependency logic, notation clarity, and revised proof validity.',
      },
      {
        title: 'Counterexamples and Missing Hypotheses',
        goals: 'Students use counterexamples to test theorem conditions and avoid overclaiming.',
        topics: 'Counterexample analysis, missing hypothesis, boundary case, theorem condition, conjecture revision',
        objectives: 'Construct a counterexample that shows why a theorem condition matters.',
        assessment:
          'Counterexample analysis with conjecture, missing hypothesis, boundary case, failed proof step, and theorem revision.',
        async: 'Search for a boundary case that violates a proposed theorem statement.',
        sync: 'Counterexample lab with hypothesis testing, failed-proof diagnosis, and revised conjecture.',
        resources: 'Counterexample bank; hypothesis checklist; conjecture revision guide',
        evaluation: 'Score counterexample validity, hypothesis diagnosis, boundary reasoning, and revision clarity.',
      },
      {
        title: 'Lemma Chains and Theorem Structure',
        goals: 'Students organize supporting lemmas into a coherent theorem proof.',
        topics: 'Lemma proof, theorem structure, dependency chain, definition map, proof outline',
        objectives: 'Build a lemma chain that supports a larger theorem proof.',
        assessment:
          'Lemma chain proof outline with definitions, dependency map, lemma justifications, theorem conclusion, and revision note.',
        async: 'Identify which prior results are needed for a theorem and order them as lemmas.',
        sync: 'Lemma-chain workshop with dependency map critique and theorem proof revision.',
        resources: 'Lemma map template; dependency checklist; theorem proof model',
        evaluation: 'Assess dependency coherence, lemma relevance, proof structure, and revision rationale.',
      },
      {
        title: 'Proof Critique and Notation Clarity',
        goals: 'Students improve proof validity and readability through critique.',
        topics: 'Proof critique, notation ambiguity, unsupported implication, peer review, proof revision',
        objectives: 'Critique a proof for logical gaps, notation ambiguity, and unsupported steps.',
        assessment:
          'Proof critique memo with gap diagnosis, notation revision, unsupported implication correction, and revised proof step.',
        async: 'Review a proof draft and tag one ambiguous notation choice and one unsupported implication.',
        sync: 'Peer proof critique with gap triage, notation repair, and revised proof presentation.',
        resources: 'Proof critique protocol; notation style guide; revision checklist',
        evaluation: 'Score gap diagnosis, notation clarity, correction validity, and critique usefulness.',
      },
      {
        title: 'Final Proof Portfolio and Transfer Theorem',
        goals: 'Students synthesize proof strategies and transfer them to a new theorem.',
        topics: 'Final proof portfolio, transfer theorem, strategy reflection, counterexample check, revision evidence',
        objectives: 'Prepare a proof portfolio that explains strategy choices and applies them to a new theorem.',
        assessment:
          'Final proof portfolio with theorem proofs, proof-strategy reflection, counterexample test, revision evidence, and transfer theorem proof.',
        async: 'Select revised proof artifacts and draft a strategy reflection for each.',
        sync: 'Final proof conference with portfolio defense, transfer theorem challenge, and revision handoff.',
        resources: 'Proof portfolio rubric; transfer theorem prompt; final revision checklist',
        evaluation:
          'Assess proof validity, strategy transfer, counterexample use, revision evidence, and portfolio coherence.',
      },
    ],
  }),
};

const LECTURE_EXAM_GOLD_PROJECT = {
  id: 'gold-lecture-exam-project',
  label: 'Introductory psychology lecture-exam gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Introduction to Psychology Lecture',
    learningOutcomes:
      'Explain foundational psychology concepts, diagnose misconceptions, use retrieval practice, calibrate confidence, and prepare for midterm and final exam questions.',
    lessons: [
      {
        title: 'Scientific Thinking and Psychology Claims',
        goals:
          'Students distinguish theory, hypothesis, operational definition, and opinion before the first exam unit.',
        topics: 'Scientific reasoning, theory, hypothesis, operational definition, replication, exam blueprint',
        objectives: 'Explain how psychologists test claims and distinguish theories from opinions.',
        assessment:
          'Concept check quiz with retrieval question, confidence rating, misconception diagnosis, and corrected explanation.',
        async: 'Read lecture notes and complete a practice quiz on theory, hypothesis, and replication.',
        sync: 'Lecture concept check with clicker questions, wrong-answer sort, and exam-style transfer item.',
        resources: 'Lecture notes; exam blueprint; misconception list; practice quiz',
        evaluation: 'Score concept accuracy, corrected explanation, confidence calibration, and transfer readiness.',
      },
      {
        title: 'Neurons and Neural Communication',
        goals: 'Students connect neuron vocabulary to causal signaling explanations instead of memorizing labels only.',
        topics: 'Neuron structure, action potential, neurotransmitter, synapse, neural pathway',
        objectives: 'Describe neural communication and predict how a neurotransmitter change affects signaling.',
        assessment:
          'Exam blueprint worksheet with labeled neuron diagram, practice item, misconception repair, and study-guide update.',
        async: 'Review lecture diagrams and complete a retrieval log for neuron terms.',
        sync: 'Worked lecture example with concept-check polling and corrected explanation rehearsal.',
        resources: 'Neuron diagram; practice item bank; study guide template; exam blueprint',
        evaluation: 'Score diagram accuracy, reasoning explanation, misconception repair, and study-guide quality.',
      },
      {
        title: 'Sensation, Perception, and Attention',
        goals: 'Students separate sensory input from perceptual interpretation and attention limits.',
        topics: 'Sensation, perception, attention, threshold, selective attention, illusion',
        objectives: 'Explain how perception organizes sensory information and why attention changes interpretation.',
        assessment:
          'Concept-check worksheet with illusion example, perception explanation, confidence rating, and corrected misconception.',
        async: 'Annotate lecture examples of thresholds and attention limits before class.',
        sync: 'Clicker sequence comparing sensory input, perception claim, and corrected explanation.',
        resources: 'Perception demo notes; attention examples; misconception repair guide',
        evaluation: 'Score concept distinction, evidence use, confidence calibration, and correction quality.',
      },
      {
        title: 'Learning and Conditioning',
        goals: 'Students classify conditioning scenarios and explain why examples fit the correct learning concept.',
        topics: 'Classical conditioning, operant conditioning, reinforcement, punishment, extinction',
        objectives: 'Classify learning examples and justify the cue, behavior, consequence, or association.',
        assessment:
          'Practice quiz with conditioning scenario sort, reasoning explanation, misconception repair, and transfer item.',
        async: 'Complete scenario flashcards and flag one confusing conditioning example.',
        sync: 'Wrong-answer sort with scenario comparison, corrective model, and exam-style transfer.',
        resources: 'Conditioning scenario bank; reinforcement chart; practice quiz',
        evaluation: 'Score classification accuracy, explanation quality, misconception repair, and transfer readiness.',
      },
      {
        title: 'Memory Encoding and Retrieval',
        goals: 'Students connect encoding, storage, and retrieval to effective study decisions for the midterm.',
        topics: 'Encoding, storage, retrieval, working memory, long-term memory, retrieval practice',
        objectives: 'Explain how retrieval practice improves memory and choose an effective study strategy.',
        assessment:
          'Retrieval practice log with practice item, confidence rating, corrected explanation, and study-plan update.',
        async: 'Try two retrieval strategies and record confidence before checking answers.',
        sync: 'Lecture checkpoint comparing rereading, retrieval, spacing, and corrected study decisions.',
        resources: 'Memory model diagram; retrieval log; study strategy comparison table',
        evaluation:
          'Score memory concept accuracy, retrieval evidence, confidence calibration, and study-plan quality.',
      },
      {
        title: 'Development Across the Lifespan',
        goals: 'Students compare developmental claims without overgeneralizing stage labels.',
        topics: 'Developmental stages, attachment, adolescence, adulthood, nature-nurture, cohort effect',
        objectives: 'Compare developmental explanations and identify limits of stage-based claims.',
        assessment:
          'Exam-style short response with developmental concept, evidence limit, misconception repair, and corrected claim.',
        async: 'Review lecture notes and answer a practice quiz on developmental stage claims.',
        sync: 'Concept-check polling with stage-label misconception repair and transfer example.',
        resources: 'Development chart; cohort-effect example; short-response rubric',
        evaluation: 'Score concept accuracy, limit language, corrected claim, and exam-readiness explanation.',
      },
      {
        title: 'Social Cognition and Bias',
        goals: 'Students diagnose attribution and bias errors and apply the concept to new cases.',
        topics: 'Attribution, confirmation bias, stereotype, conformity, group influence, social cognition',
        objectives: 'Identify attribution and bias patterns in a scenario and explain a corrected interpretation.',
        assessment:
          'Concept check quiz with bias scenario, wrong-answer diagnosis, corrected explanation, and transfer item.',
        async: 'Read scenario examples and predict which bias is most likely before checking notes.',
        sync: 'Exam readiness clinic with wrong-answer sort, confidence check, and new-case transfer.',
        resources: 'Bias scenario bank; attribution chart; exam blueprint',
        evaluation: 'Score bias identification, reasoning evidence, misconception repair, and transfer performance.',
      },
      {
        title: 'Disorders, Treatment, and Final Exam Integration',
        goals: 'Students integrate symptom recognition, treatment reasoning, ethics, and final exam review.',
        topics: 'Psychological disorder, symptom pattern, treatment option, ethics, final exam synthesis',
        objectives: 'Distinguish symptom recognition from treatment reasoning and integrate concepts across units.',
        assessment:
          'Final exam blueprint response with symptom concept, treatment reasoning, corrected misconception, and synthesis item.',
        async: 'Complete final review retrieval set and mark confidence for each unit.',
        sync: 'Final exam integration clinic with concept map, misconception repair, and transfer synthesis prompt.',
        resources: 'Final exam blueprint; disorder concept map; treatment reasoning examples',
        evaluation:
          'Score integration accuracy, ethical reasoning, misconception repair, and final-exam transfer readiness.',
      },
    ],
  }),
};

const CAPSTONE_PROJECT_GOLD_PROJECT = {
  id: 'gold-capstone-project-project',
  label: 'Product innovation capstone gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Product Innovation Capstone',
    learningOutcomes:
      'Integrate sponsor constraints, research evidence, concept selection, implementation planning, risk management, portfolio defense, and final showcase handoff into a defensible capstone project.',
    lessons: [
      {
        title: 'Project Charter and Sponsor Need',
        goals: 'Students define a capstone project charter that connects sponsor needs to success criteria.',
        topics: 'Project charter, sponsor need, stakeholder constraint, success criteria, scope boundary',
        objectives: 'Frame a feasible capstone project around sponsor evidence and measurable success criteria.',
        assessment:
          'Project charter with sponsor need, stakeholder constraint, success criteria, risk note, and revision commitment.',
        async: 'Review sponsor notes and identify one constraint that changes project scope.',
        sync: 'Milestone design review with sponsor-need comparison, project evidence check, and risk triage.',
        resources: 'Project charter template; sponsor brief; milestone evidence checklist',
        evaluation: 'Score sponsor fit, project scope, evidence use, risk clarity, and revision commitment.',
      },
      {
        title: 'Stakeholder Discovery and Constraint Mapping',
        goals: 'Students separate stakeholder needs from assumptions before narrowing the capstone scope.',
        topics: 'Stakeholder interview, constraint map, assumption check, sponsor priority, project risk',
        objectives: 'Map stakeholder constraints and identify the assumption most likely to weaken the project.',
        assessment:
          'Stakeholder constraint brief with interview evidence, assumption check, sponsor priority, and risk update.',
        async: 'Review stakeholder notes and tag needs, assumptions, constraints, and missing evidence.',
        sync: 'Constraint-mapping review with evidence sorting, assumption challenge, and revision decision.',
        resources: 'Stakeholder interview protocol; constraint map; assumption-check guide',
        evaluation: 'Score stakeholder evidence, constraint clarity, assumption testing, and project risk logic.',
      },
      {
        title: 'Research Synthesis and Opportunity Framing',
        goals: 'Students synthesize research into a focused opportunity statement for the capstone project.',
        topics: 'Research synthesis, opportunity frame, evidence gap, sponsor value, scope decision',
        objectives: 'Use research evidence to narrow the opportunity and explain sponsor value.',
        assessment:
          'Opportunity framing milestone brief with research synthesis, sponsor value claim, evidence gap, and scope decision.',
        async: 'Build an evidence table and identify the strongest opportunity signal.',
        sync: 'Research synthesis review with evidence comparison, gap challenge, and scope decision.',
        resources: 'Evidence table template; opportunity statement model; scope decision checklist',
        evaluation: 'Score synthesis quality, opportunity focus, sponsor value, and evidence-gap logic.',
      },
      {
        title: 'Concept Options and Decision Matrix',
        goals: 'Students compare project concepts using explicit sponsor criteria and tradeoff evidence.',
        topics: 'Concept option, decision matrix, sponsor criteria, tradeoff evidence, selected direction',
        objectives: 'Select a capstone concept and justify the tradeoff using evidence and criteria.',
        assessment:
          'Concept decision matrix with alternatives, sponsor criteria, tradeoff evidence, selected direction, and revision note.',
        async: 'Draft three concept options and score each against sponsor criteria.',
        sync: 'Concept selection review with matrix comparison, tradeoff defense, and next-milestone commitment.',
        resources: 'Decision matrix; concept sketch guide; tradeoff evidence examples',
        evaluation: 'Score criteria fit, comparison quality, selected direction, and tradeoff transparency.',
      },
      {
        title: 'Implementation Roadmap and Feasibility Risk',
        goals: 'Students turn the selected concept into a feasible implementation roadmap.',
        topics: 'Implementation roadmap, resource constraint, timeline, feasibility risk, mitigation plan',
        objectives: 'Plan implementation milestones and explain how the team will reduce the highest risk.',
        assessment:
          'Implementation roadmap milestone with timeline, resource constraint, feasibility risk, mitigation, and sponsor check.',
        async: 'Draft milestone tasks and flag resource, time, or adoption risks.',
        sync: 'Implementation roadmap review with feasibility critique, risk prioritization, and mitigation revision.',
        resources: 'Roadmap template; feasibility-risk checklist; mitigation planning guide',
        evaluation: 'Score timeline coherence, resource realism, risk prioritization, and mitigation strength.',
      },
      {
        title: 'Pilot Evidence and Iteration Plan',
        goals: 'Students use pilot evidence to revise the capstone deliverable before final defense.',
        topics: 'Pilot evidence, user feedback, iteration plan, decision log, project revision',
        objectives: 'Analyze pilot feedback and choose the revision that best improves feasibility and value.',
        assessment:
          'Pilot iteration milestone with feedback evidence, decision log, revised deliverable, and next-test plan.',
        async: 'Collect pilot notes and mark one pattern that changes the project direction.',
        sync: 'Iteration review with feedback evidence, decision-log defense, and revised milestone plan.',
        resources: 'Pilot feedback form; decision-log template; iteration plan model',
        evaluation: 'Score feedback interpretation, decision rationale, revision specificity, and next-test readiness.',
      },
      {
        title: 'Portfolio Defense and Impact Claim',
        goals: 'Students defend the capstone project using evidence, limitations, and implementation readiness.',
        topics: 'Portfolio defense, impact claim, limitation, implementation readiness, evidence trail',
        objectives: 'Build a portfolio defense that explains project impact and credible limitations.',
        assessment:
          'Portfolio defense draft with impact claim, evidence trail, limitation, implementation readiness, and response notes.',
        async: 'Assemble portfolio evidence and write one limitation that affects the impact claim.',
        sync: 'Defense rehearsal with evidence challenge, limitation review, and response revision.',
        resources: 'Portfolio defense rubric; impact claim guide; evidence trail checklist',
        evaluation: 'Score impact claim, evidence trail, limitation honesty, and defense response quality.',
      },
      {
        title: 'Final Showcase and Handoff Plan',
        goals: 'Students present a final capstone showcase and prepare a usable handoff for the sponsor.',
        topics: 'Final showcase, sponsor handoff, adoption plan, project limitation, next owner',
        objectives: 'Deliver a final showcase that connects the project to sponsor adoption and next steps.',
        assessment:
          'Final showcase package with sponsor handoff plan, adoption recommendation, project limitation, and next-owner notes.',
        async: 'Finalize showcase materials and prepare a sponsor handoff checklist.',
        sync: 'Final showcase with sponsor-facing presentation, handoff review, and adoption recommendation.',
        resources: 'Showcase checklist; handoff-plan template; adoption recommendation guide',
        evaluation: 'Score presentation clarity, handoff usefulness, adoption logic, and limitation transparency.',
      },
    ],
  }),
};

const COMPETENCY_ASSESSMENT_GOLD_PROJECT = {
  id: 'gold-competency-assessment-project',
  label: 'Teacher education competency assessment gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Teacher Education Competency Assessment',
    learningOutcomes:
      'Collect standards-aligned competency evidence, map evidence to program standards, calibrate proficiency decisions, plan remediation, and prepare accreditation-ready evidence portfolios.',
    lessons: [
      {
        title: 'Program Standards and Observable Evidence',
        goals: 'Students connect a target competency to observable performance evidence and benchmark descriptors.',
        topics: 'Program standard, target competency, observable performance evidence, benchmark descriptor',
        objectives: 'Map a performance task to the program standard and identify evidence of proficiency.',
        assessment:
          'Competency evidence portfolio entry with performance task evidence, benchmark descriptor, assessor note, and proficiency decision.',
        async: 'Review the program standard and annotate one performance sample for evidence.',
        sync: 'Competency calibration panel with benchmark comparison, assessor-note review, and proficiency decision.',
        resources: 'Program standard; competency checklist; benchmark descriptor guide',
        evaluation: 'Score standards alignment, evidence sufficiency, benchmark fit, and proficiency decision clarity.',
      },
      {
        title: 'Evidence Portfolio Sufficiency',
        goals: 'Students distinguish complete evidence from sufficient evidence for a competency decision.',
        topics: 'Evidence portfolio, sufficiency threshold, artifact selection, benchmark evidence, readiness gap',
        objectives: 'Evaluate whether an evidence portfolio meets the sufficiency threshold for proficiency.',
        assessment:
          'Evidence portfolio audit with selected artifacts, sufficiency rationale, benchmark evidence, and readiness gap.',
        async: 'Sort evidence artifacts into complete, partial, and missing benchmark categories.',
        sync: 'Portfolio sufficiency review with evidence comparison, benchmark challenge, and next-evidence plan.',
        resources: 'Portfolio audit template; sufficiency threshold guide; benchmark evidence examples',
        evaluation: 'Score evidence selection, sufficiency rationale, benchmark coverage, and gap identification.',
      },
      {
        title: 'Assessor Calibration and Agreement',
        goals: 'Students compare assessor judgments and identify what evidence resolves scoring disagreement.',
        topics: 'Calibration note, assessor agreement, scoring drift, benchmark descriptor, evidence rationale',
        objectives: 'Calibrate a proficiency judgment by comparing evidence against benchmark descriptors.',
        assessment:
          'Calibration note with two assessor ratings, benchmark comparison, evidence rationale, and proficiency decision.',
        async: 'Score a sample performance with the rubric and mark where assessor ratings may diverge.',
        sync: 'Calibration panel with rating comparison, evidence citation, and consensus decision.',
        resources: 'Calibration protocol; benchmark descriptor set; assessor-note examples',
        evaluation: 'Score calibration accuracy, evidence citation, disagreement resolution, and consensus rationale.',
      },
      {
        title: 'Feedback Precision and Remediation Planning',
        goals: 'Students write feedback that names the proficiency gap and plans targeted remediation.',
        topics: 'Feedback precision, proficiency gap, remediation plan, benchmark target, reassessment evidence',
        objectives: 'Design a remediation plan that targets the missing benchmark evidence.',
        assessment:
          'Remediation plan with proficiency gap evidence, feedback target, reassessment task, and calibration note.',
        async: 'Compare two feedback notes and identify which one names the benchmark gap clearly.',
        sync: 'Remediation planning clinic with gap diagnosis, target feedback, and reassessment commitment.',
        resources: 'Remediation planning template; feedback precision checklist; reassessment guide',
        evaluation: 'Score feedback precision, remediation fit, reassessment alignment, and benchmark clarity.',
      },
      {
        title: 'Reassessment Task and Mastery Evidence',
        goals: 'Students design a reassessment opportunity that can prove the missing competency evidence.',
        topics: 'Reassessment task, mastery evidence, proficiency threshold, evidence opportunity, readiness proof',
        objectives: 'Create a reassessment task that directly elicits the missing evidence for proficiency.',
        assessment:
          'Reassessment task brief with target competency, mastery evidence, proficiency threshold, and readiness proof.',
        async: 'Draft a reassessment prompt and identify what new evidence it should produce.',
        sync: 'Reassessment design review with benchmark trace, evidence check, and readiness-proof critique.',
        resources: 'Reassessment task model; mastery evidence checklist; proficiency threshold guide',
        evaluation: 'Score target alignment, mastery evidence quality, threshold clarity, and readiness proof.',
      },
      {
        title: 'Equitable Evidence Options and Accommodations',
        goals: 'Students preserve the competency standard while allowing equivalent evidence options.',
        topics: 'Equitable evidence option, accommodation, accessibility, standard integrity, evidence equivalence',
        objectives: 'Revise a competency task so accommodations preserve the evidence standard.',
        assessment:
          'Equitable evidence plan with accommodation option, standard integrity check, equivalent evidence, and review note.',
        async: 'Review accommodation scenarios and mark which evidence standard must remain visible.',
        sync: 'Accessibility calibration review with equivalent evidence comparison and standard-integrity check.',
        resources: 'Accommodation scenario set; equivalent evidence guide; accessibility review checklist',
        evaluation: 'Score accessibility support, evidence equivalence, standard integrity, and review clarity.',
      },
      {
        title: 'Summative Competency Portfolio Review',
        goals: 'Students synthesize multiple benchmark artifacts into one defensible readiness judgment.',
        topics: 'Summative portfolio, readiness judgment, benchmark synthesis, evidence gap, next evidence',
        objectives: 'Synthesize portfolio evidence into a readiness judgment with strengths and gaps.',
        assessment:
          'Summative competency portfolio with benchmark synthesis, readiness judgment, evidence gaps, and next-evidence plan.',
        async: 'Assemble portfolio evidence and tag each artifact to a benchmark descriptor.',
        sync: 'Summative portfolio panel with benchmark synthesis, gap check, and readiness judgment.',
        resources: 'Portfolio synthesis template; readiness judgment rubric; next-evidence planner',
        evaluation: 'Score benchmark synthesis, readiness rationale, evidence-gap honesty, and next-evidence plan.',
      },
      {
        title: 'Accreditation-Ready Evidence Defense',
        goals:
          'Students defend source-to-standard alignment and explain how the portfolio supports accreditation review.',
        topics:
          'Accreditation evidence, source-to-standard alignment, proficiency defense, audit trail, review readiness',
        objectives: 'Defend the competency evidence trail against accreditation-style review questions.',
        assessment:
          'Accreditation-ready evidence defense with source-to-standard alignment, proficiency decision, audit trail, and review response.',
        async: 'Prepare an evidence defense and flag one source-to-standard alignment risk.',
        sync: 'Evidence defense panel with audit-trail questions, alignment challenge, and final proficiency decision.',
        resources: 'Accreditation evidence guide; audit-trail checklist; defense question bank',
        evaluation: 'Score alignment defense, audit-trail clarity, proficiency rationale, and review readiness.',
      },
    ],
  }),
};

const PERFORMING_ARTS_GOLD_PROJECT = {
  id: 'gold-performing-arts-project',
  label: 'Acting studio performance practice gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Acting Studio and Performance Practice',
    learningOutcomes:
      'Use rehearsal notes, vocal and movement technique, ensemble cues, scene analysis, critique uptake, and performance recordings to revise observable performance choices.',
    lessons: [
      {
        title: 'Voice, Body, and Neutral Readiness',
        goals: 'Students prepare the body and voice for safe, focused rehearsal and performance work.',
        topics: 'Vocal warm-up, physical readiness, neutral stance, breath support, rehearsal note',
        objectives: 'Perform a warm-up sequence and explain how breath, alignment, and focus change readiness.',
        assessment:
          'Warm-up performance recording with vocal evidence, movement readiness note, critique uptake, and revised run-through.',
        async: 'Review warm-up demonstrations and annotate one technique cue before class.',
        sync: 'Studio rehearsal with breath support modeling, peer observation notes, and revised warm-up run.',
        resources: 'Vocal warm-up guide; movement safety notes; rehearsal journal template',
        evaluation: 'Score technique accuracy, readiness evidence, critique uptake, and revised performance choice.',
      },
      {
        title: 'Monologue Beats and Given Circumstances',
        goals: 'Students connect script evidence to observable monologue choices.',
        topics: 'Monologue, beats, objective, given circumstances, director note, performance critique',
        objectives: 'Break a monologue into beats and revise one performance choice from director notes.',
        assessment:
          'Monologue run-through with beat map, director note, revised performance choice, and reflection cue.',
        async: 'Annotate the monologue for beats, objective shifts, and given circumstances.',
        sync: 'Scene-study rehearsal with director notes, peer critique, and second run-through.',
        resources: 'Monologue text; beat-map model; director-note checklist',
        evaluation: 'Assess beat clarity, performance evidence, note uptake, and revised interpretive choice.',
      },
      {
        title: 'Partner Scene Listening and Ensemble Cues',
        goals: 'Students make performance choices responsive to partner timing and ensemble cues.',
        topics: 'Partner scene, listening cue, blocking, ensemble timing, stage picture',
        objectives: 'Use partner listening and blocking choices to improve ensemble scene timing.',
        assessment:
          'Partner scene recording with blocking note, ensemble cue evidence, critique uptake, and revised run.',
        async: 'Watch a model scene and identify listening cues that change timing.',
        sync: 'Partner rehearsal with blocking adjustments, ensemble cue checks, and performance run.',
        resources: 'Scene excerpt; blocking map; ensemble timing checklist',
        evaluation: 'Score listening response, blocking clarity, ensemble awareness, and revised performance evidence.',
      },
      {
        title: 'Blocking, Staging, and Stage Picture',
        goals: 'Students use movement and staging choices to make relationships and focus visible.',
        topics: 'Blocking, staging, stage picture, focus, movement pathway, rehearsal note',
        objectives: 'Revise blocking so movement and stage picture support the scene objective.',
        assessment:
          'Blocking rehearsal journal with stage picture sketch, movement cue, director note, and revised run-through.',
        async: 'Sketch the initial blocking and identify one unclear focus point.',
        sync: 'Blocking lab with movement-pathway rehearsal, peer sightline feedback, and revised staging.',
        resources: 'Stage picture examples; blocking notation guide; rehearsal-journal model',
        evaluation: 'Score movement clarity, focus, staging evidence, and revision from notes.',
      },
      {
        title: 'Voice, Text, and Emotional Arc',
        goals: 'Students connect vocal choices to text evidence and playable emotional progression.',
        topics: 'Vocal choice, text evidence, emotional arc, emphasis, tempo, playable action',
        objectives: 'Use text evidence to revise vocal emphasis and emotional arc in performance.',
        assessment:
          'Voice-and-text performance recording with emphasis choices, text evidence, critique note, and revised take.',
        async: 'Mark emphasis and tempo choices in the script before rehearsal.',
        sync: 'Voice rehearsal with text evidence checks, director notes, and revised performance take.',
        resources: 'Text-marking guide; vocal emphasis examples; performance recording checklist',
        evaluation: 'Score vocal clarity, text evidence, emotional progression, and revised performance choice.',
      },
      {
        title: 'Audition Preparation and Feedback Notes',
        goals: 'Students prepare an audition cut and use feedback without losing artistic intention.',
        topics: 'Audition cut, slate, director note, technique drill, performance critique, revision target',
        objectives: 'Revise an audition cut based on director notes and technique evidence.',
        assessment:
          'Audition run-through with slate, director note, technique correction, revised take, and next rehearsal cue.',
        async: 'Select an audition cut and identify the technique problem to rehearse.',
        sync: 'Audition lab with first run, director note, targeted technique drill, and revised run-through.',
        resources: 'Audition rubric; slate examples; director-note form',
        evaluation: 'Score preparation, technique correction, note uptake, and revised audition readiness.',
      },
      {
        title: 'Ensemble Run-Through and Pacing',
        goals: 'Students diagnose cue pickup, pacing, and ensemble support in a longer run-through.',
        topics: 'Ensemble cue, pacing, run-through, transition, performance recording, critique uptake',
        objectives: 'Use run-through evidence to revise pacing and ensemble cue pickup.',
        assessment:
          'Ensemble run-through recording with cue notes, pacing diagnosis, critique uptake, and revised scene plan.',
        async: 'Review the previous recording and mark one cue pickup or pacing problem.',
        sync: 'Ensemble rehearsal with timed run-through, cue repair, and revised performance plan.',
        resources: 'Cue pickup checklist; pacing annotation guide; ensemble critique protocol',
        evaluation: 'Score ensemble awareness, pacing diagnosis, cue repair, and revision plan.',
      },
      {
        title: 'Final Performance Portfolio and Reflection',
        goals:
          'Students integrate rehearsal evidence, critique notes, recording, and reflection into a final portfolio.',
        topics: 'Final performance, run-through, rehearsal journal, audition note, next rehearsal cue',
        objectives: 'Perform a revised scene or monologue and justify the final rehearsal decision with evidence.',
        assessment:
          'Final performance portfolio with recording, rehearsal journal, critique-response note, and next rehearsal cue.',
        async: 'Review rehearsal journal entries and select one recurring performance note.',
        sync: 'Final studio run-through with audience response, director note, and reflection debrief.',
        resources: 'Final performance rubric; rehearsal journal guide; audition reflection prompt',
        evaluation:
          'Assess technique, artistic intention, performance presence, critique uptake, and next rehearsal plan.',
      },
    ],
  }),
};

const PROGRAMMING_LAB_GOLD_PROJECT = {
  id: 'gold-programming-lab-project',
  label: 'Software engineering code lab gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Software Engineering Code Lab',
    learningOutcomes:
      'Use source code, repository commits, unit tests, debugging traces, edge-case checks, code review notes, refactor evidence, and documentation to justify implementation decisions.',
    lessons: [
      {
        title: 'Repository Setup and First Tests',
        goals: 'Students connect development environment setup to inspectable code and test evidence.',
        topics: 'Git repository, starter code, command line, unit test, failing test, commit note',
        objectives: 'Run the starter test suite and explain what a failing test reveals about the code.',
        assessment:
          'Repository commit with setup check, failing unit test, implementation note, and corrected test run.',
        async: 'Install the toolchain, clone the repository, and record one setup issue or test result.',
        sync: 'Live coding lab with test harness setup, pair debugging, and first repository commit review.',
        resources: 'Repository README; unit test guide; commit message checklist',
        evaluation: 'Score setup reliability, test evidence, debugging note, and implementation rationale.',
      },
      {
        title: 'Functions, Inputs, and Edge Cases',
        goals: 'Students use tests and peer review to improve function-level implementation decisions.',
        topics: 'Function implementation, input validation, edge case, automated test, code review',
        objectives: 'Implement a function and revise it after edge-case tests and code review.',
        assessment:
          'Function implementation pull request with passing tests, edge-case check, code review note, and refactor commit.',
        async: 'Read the function specification and predict two edge cases before coding.',
        sync: 'Pair programming with live test runs, debugging trace capture, peer code review, and refactor handoff.',
        resources: 'Function specification; edge-case checklist; code review rubric',
        evaluation: 'Assess correctness, test coverage, readability, edge-case reasoning, and refactor quality.',
      },
      {
        title: 'Debugging Trace and Failure Diagnosis',
        goals: 'Students diagnose failing behavior before changing code.',
        topics: 'Debugging trace, failing output, breakpoint, hypothesis, root cause, passing test',
        objectives: 'Use a debugging trace to identify a root cause and verify the fix with tests.',
        assessment:
          'Debugging log with failing output, hypothesis, code fix, passing test result, and root-cause note.',
        async: 'Review a failing test transcript and write one debugging hypothesis.',
        sync: 'Debugging lab with trace inspection, breakpoint walkthrough, fix comparison, and passing test check.',
        resources: 'Debugging trace template; failing-test sample; root-cause checklist',
        evaluation: 'Score diagnosis quality, trace evidence, code fix fit, and verification with tests.',
      },
      {
        title: 'Data Structures and Module Design',
        goals: 'Students justify data structure and module boundaries with code evidence.',
        topics: 'Data structure choice, module design, interface, complexity, readability, test coverage',
        objectives: 'Choose a data structure and module boundary that improve behavior and maintainability.',
        assessment:
          'Module design commit with data structure rationale, test coverage evidence, code review note, and implementation decision.',
        async: 'Compare two data structure options and predict the code impact of each.',
        sync: 'Module design lab with interface sketching, code review, test coverage check, and refactor planning.',
        resources: 'Data structure decision guide; module interface examples; coverage report sample',
        evaluation: 'Assess data structure fit, module clarity, test coverage, and maintainability rationale.',
      },
      {
        title: 'API Behavior and Error Handling',
        goals: 'Students make normal-path and error-path behavior predictable.',
        topics: 'API function, error handling, exception path, integration test, user-facing message',
        objectives: 'Implement API behavior with tests for normal inputs, error cases, and messages.',
        assessment:
          'API implementation commit with integration test, error-path test, message check, and debugging trace.',
        async: 'Read the API contract and list one normal path and one error path to test.',
        sync: 'API coding lab with test-first planning, implementation, error-path debugging, and review.',
        resources: 'API contract; integration test guide; error-message checklist',
        evaluation: 'Score API correctness, error handling, test coverage, message clarity, and review response.',
      },
      {
        title: 'Refactoring for Readability and Tests',
        goals: 'Students improve code clarity without changing tested behavior.',
        topics: 'Refactor, readability, duplication, behavior-preserving change, regression test, commit diff',
        objectives: 'Refactor duplicate or unclear code while preserving test behavior.',
        assessment:
          'Refactor commit with before-and-after code diff, regression test result, code review note, and refactor rationale.',
        async: 'Annotate one confusing code block and propose a behavior-preserving refactor.',
        sync: 'Refactoring lab with readability review, regression test run, peer review, and commit note.',
        resources: 'Refactor checklist; readability examples; regression test guide',
        evaluation: 'Score readability improvement, behavior preservation, test evidence, and refactor explanation.',
      },
      {
        title: 'Feature Sprint and Pull Request Review',
        goals: 'Students connect issue requirements, implementation, tests, and review notes.',
        topics: 'Feature issue, pull request, acceptance criteria, test suite, code review, implementation risk',
        objectives: 'Build a small feature and prepare it for pull-request review with test evidence.',
        assessment:
          'Feature pull request with issue link, implementation diff, test suite result, code review response, and risk note.',
        async: 'Break the feature issue into implementation tasks and test expectations.',
        sync: 'Feature sprint with pair implementation, test suite run, pull-request walkthrough, and review response.',
        resources: 'Feature issue template; pull-request checklist; test suite report sample',
        evaluation: 'Assess requirement fit, implementation quality, test evidence, review response, and risk clarity.',
      },
      {
        title: 'Final Repository Portfolio and Handoff',
        goals: 'Students synthesize code, tests, documentation, and known risks into a maintainable handoff.',
        topics: 'Repository portfolio, README, commit history, test report, documentation, handoff risk',
        objectives: 'Prepare a repository handoff that explains implementation decisions and remaining risks.',
        assessment:
          'Final repository portfolio with README update, commit history evidence, test report, code review summary, and handoff risk note.',
        async: 'Review commit history and draft a README section explaining setup, tests, and known limitations.',
        sync: 'Final code review clinic with repository walkthrough, test report check, documentation review, and handoff debrief.',
        resources: 'README model; final test report checklist; repository handoff rubric',
        evaluation: 'Assess code evidence, test completeness, documentation clarity, review uptake, and risk handoff.',
      },
    ],
  }),
};

const DATA_SCIENCE_LAB_GOLD_PROJECT = {
  id: 'gold-data-science-lab-project',
  label: 'Data science analytics lab gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Data Science Analytics Lab',
    learningOutcomes:
      'Use dataset provenance, data cleaning, reproducible notebooks, exploratory visualization, feature engineering, model validation, bias audits, dashboards, and data stories to justify analytic decisions.',
    lessons: [
      {
        title: 'Dataset Provenance and Cleaning',
        goals: 'Students connect data quality to defensible analytics evidence.',
        topics: 'Dataset provenance, CSV import, missingness, data cleaning, reproducible notebook',
        objectives: 'Inspect dataset provenance and clean missing values before making a claim.',
        assessment:
          'Analytics notebook with dataset provenance, data-cleaning log, missingness check, and revised analytic question.',
        async: 'Review the data dictionary and mark two variables with quality concerns.',
        sync: 'Notebook lab with CSV import, data cleaning, missingness audit, peer check, and revised question.',
        resources: 'Dataset dictionary; cleaning checklist; reproducible notebook template',
        evaluation: 'Score provenance evidence, cleaning rationale, missingness handling, and analytic question fit.',
      },
      {
        title: 'Exploratory Visualization and Data Story',
        goals: 'Students use exploratory visualization to make bounded analytic claims.',
        topics: 'Exploratory data analysis, visualization, dashboard, trend comparison, data story',
        objectives: 'Create a visualization and explain what the data can and cannot support.',
        assessment:
          'Data visualization notebook with chart choice, dashboard screenshot, interpretation, and limitation note.',
        async: 'Sketch two chart options and predict which comparison each can support.',
        sync: 'Visualization critique with notebook output review, dashboard comparison, and revised interpretation.',
        resources: 'Visualization guide; dashboard example; data story checklist',
        evaluation: 'Assess chart fit, interpretation accuracy, limitation language, and data-story clarity.',
      },
      {
        title: 'Feature Engineering and Transformation',
        goals: 'Students make transformation choices reproducible and interpretable.',
        topics: 'Feature engineering, transformation, dataframe, reproducibility, variable meaning',
        objectives: 'Transform dataset fields and explain how the feature changes interpretation.',
        assessment:
          'Feature engineering notebook with transformation code, before-after data table, reproducibility note, and analytic decision.',
        async: 'Compare raw and transformed variables and flag one interpretation risk.',
        sync: 'Feature lab with transformation walkthrough, peer reproducibility check, and revised variable rationale.',
        resources: 'Feature engineering guide; transformation examples; reproducibility checklist',
        evaluation: 'Score transformation fit, reproducibility, variable interpretation, and decision rationale.',
      },
      {
        title: 'Model Validation and Metrics',
        goals: 'Students connect model evidence to an analytic decision without overclaiming.',
        topics: 'Predictive model, train-test split, validation metric, confusion matrix, feature evidence',
        objectives: 'Validate a simple predictive model and interpret one metric correctly.',
        assessment:
          'Model evaluation notebook with train-test split, validation metric, confusion matrix, and analytic decision.',
        async: 'Read the model specification and identify one metric that matches the decision context.',
        sync: 'Model validation lab with metric comparison, confusion-matrix interpretation, peer challenge, and revised claim.',
        resources: 'Validation metric guide; confusion matrix example; model evaluation checklist',
        evaluation: 'Score validation design, metric interpretation, model limitation, and decision fit.',
      },
      {
        title: 'Classification Errors and Threshold Decisions',
        goals: 'Students explain how thresholds and error types affect analytic decisions.',
        topics: 'Classification threshold, false positive, false negative, precision, recall, decision cost',
        objectives: 'Adjust a threshold and explain the tradeoff between classification errors.',
        assessment:
          'Classification notebook with threshold comparison, precision-recall evidence, error-cost note, and revised recommendation.',
        async: 'Review a confusion matrix and predict which error type matters more for the scenario.',
        sync: 'Threshold lab with metric comparison, stakeholder scenario check, and recommendation revision.',
        resources: 'Precision-recall guide; threshold worksheet; classification scenario notes',
        evaluation: 'Assess metric interpretation, error-cost reasoning, threshold choice, and recommendation fit.',
      },
      {
        title: 'Bias Audit and Fairness Check',
        goals: 'Students make subgroup performance and fairness risks visible before recommendation.',
        topics: 'Bias audit, fairness check, subgroup comparison, validation metric, model card',
        objectives: 'Audit an analytics result for bias risk and revise the recommendation.',
        assessment:
          'Bias audit notebook with subgroup metric comparison, fairness check, model card note, and revised analytic decision.',
        async: 'Review subgroup output and write one fairness or bias risk question.',
        sync: 'Bias audit clinic with subgroup comparison, model-card note, peer challenge, and revised decision.',
        resources: 'Bias audit checklist; model card template; subgroup metric example',
        evaluation: 'Assess fairness reasoning, subgroup evidence, limitation transparency, and decision revision.',
      },
      {
        title: 'Dashboard Communication and Stakeholder Interpretation',
        goals: 'Students make analytics useful to stakeholders without hiding uncertainty.',
        topics: 'Analytics dashboard, stakeholder question, filter choice, uncertainty, interpretation note',
        objectives: 'Design a dashboard view that answers a stakeholder question with transparent uncertainty.',
        assessment:
          'Dashboard data story with stakeholder question, visualization choices, uncertainty note, and interpretation boundary.',
        async: 'Review two dashboard examples and identify one hidden assumption in each.',
        sync: 'Dashboard critique with stakeholder walkthrough, uncertainty challenge, and revised data story.',
        resources: 'Dashboard checklist; stakeholder prompt; uncertainty communication guide',
        evaluation:
          'Score stakeholder fit, visualization clarity, uncertainty language, and interpretation usefulness.',
      },
      {
        title: 'Final Analytics Notebook and Data Story Handoff',
        goals: 'Students synthesize provenance, cleaning, validation, bias, and interpretation into a final handoff.',
        topics: 'Final analytics notebook, data story, validation evidence, bias audit, handoff risk',
        objectives: 'Prepare an analytics handoff that justifies the recommendation and its limits.',
        assessment:
          'Final analytics notebook and data story with provenance, cleaning log, validation evidence, bias audit, and handoff risk note.',
        async: 'Review prior notebook checkpoints and draft a data-story summary with one known limitation.',
        sync: 'Final analytics review clinic with notebook walkthrough, validation check, bias review, and handoff debrief.',
        resources: 'Final analytics rubric; notebook handoff checklist; data story model',
        evaluation: 'Assess data-model evidence, interpretation accuracy, bias transparency, and handoff readiness.',
      },
    ],
  }),
};

const ENGINEERING_DESIGN_GOLD_PROJECT = {
  id: 'gold-engineering-design-project',
  label: 'Engineering design build test lab gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Engineering Design Build Test Lab',
    learningOutcomes:
      'Use requirements, constraints, CAD or schematic models, prototype fabrication, test fixtures, measurement evidence, failure analysis, safety factors, redesign rationale, tradeoff matrices, and verification reports to justify engineering design decisions.',
    lessons: [
      {
        title: 'Requirements, Constraints, and Verification Criteria',
        goals: 'Students connect constraints and requirements to testable engineering decisions.',
        topics:
          'Engineering design requirements, stakeholder constraints, tolerance, safety factor, verification criterion',
        objectives: 'Translate a design problem into measurable requirements and verification criteria.',
        assessment:
          'Requirements matrix with constraints, tolerance targets, safety factor note, test criterion, and design-verification decision.',
        async: 'Review the design brief and identify one requirement, one constraint, and one safety risk.',
        sync: 'Engineering design review with requirement sorting, constraint tradeoff, and verification criterion check.',
        resources: 'Design brief; requirements matrix template; safety factor guide',
        evaluation:
          'Score requirement clarity, constraint reasoning, safety consideration, and verification criterion fit.',
      },
      {
        title: 'CAD Prototype and Bench Test Plan',
        goals: 'Students prepare a testable prototype instead of a display-only design.',
        topics: 'CAD model, prototype fabrication, bench test, test fixture, measurement plan',
        objectives: 'Create a prototype test plan that measures whether the CAD design meets requirements.',
        assessment:
          'CAD prototype test report with model decision, test fixture, measurement plan, tolerance check, and redesign risk.',
        async: 'Annotate a CAD model and predict which dimension or tolerance needs testing.',
        sync: 'Prototype planning lab with CAD walkthrough, bench-test setup, peer review, and measurement checklist.',
        resources: 'CAD model example; bench-test plan template; measurement checklist',
        evaluation: 'Assess model decision, test setup validity, measurement plan, and tolerance reasoning.',
      },
      {
        title: 'Materials, Tolerance, and Safety Factor',
        goals: 'Students choose materials and tolerances with safety and fabrication constraints visible.',
        topics: 'Material property, tolerance stack-up, fabrication constraint, safety factor, requirement fit',
        objectives: 'Justify a material and tolerance choice using requirement and safety evidence.',
        assessment:
          'Materials tradeoff matrix with tolerance check, safety factor calculation, fabrication constraint, and design decision.',
        async: 'Compare two material options and identify one tolerance or fabrication risk.',
        sync: 'Materials review with safety-factor calculation, tolerance critique, and tradeoff matrix revision.',
        resources: 'Material property table; tolerance checklist; safety factor example',
        evaluation: 'Score material fit, tolerance reasoning, safety margin, and tradeoff evidence.',
      },
      {
        title: 'Load Test and Measurement Evidence',
        goals: 'Students collect measurement evidence that can verify or reject a design claim.',
        topics: 'Load test, stress test, measurement evidence, test data, requirement threshold',
        objectives: 'Run a load test and compare the result against the requirement threshold.',
        assessment:
          'Load test report with test fixture, measurement data, requirement comparison, uncertainty note, and design-verification decision.',
        async: 'Review the test procedure and flag one measurement error risk.',
        sync: 'Load-test lab with fixture setup, data collection, uncertainty check, and requirement comparison.',
        resources: 'Load-test procedure; measurement data sheet; uncertainty checklist',
        evaluation: 'Assess test setup, data quality, requirement comparison, and measurement limitation.',
      },
      {
        title: 'Failure Analysis and Root Cause',
        goals: 'Students diagnose failure before proposing a redesign.',
        topics: 'Failure analysis, failure mode, root cause, fracture or deformation evidence, redesign hypothesis',
        objectives: 'Use failure evidence to identify a root cause and plan a retest.',
        assessment:
          'Failure analysis memo with test data, failure mode, root-cause hypothesis, measurement limitation, and retest plan.',
        async: 'Review a failed prototype image and write one failure-mode hypothesis.',
        sync: 'Failure-analysis clinic with evidence sorting, root-cause challenge, redesign hypothesis, and retest plan.',
        resources: 'Failure mode checklist; failed-test evidence packet; retest plan template',
        evaluation: 'Score failure evidence, root-cause reasoning, measurement limitation, and retest plan fit.',
      },
      {
        title: 'Tradeoff Matrix and Redesign Iteration',
        goals: 'Students compare redesign options against constraints, risk, and test evidence.',
        topics: 'Tradeoff matrix, redesign iteration, constraint ranking, risk mitigation, prototype revision',
        objectives: 'Choose a redesign and justify it with test evidence and constraint tradeoffs.',
        assessment:
          'Redesign log with tradeoff matrix, prototype revision, risk mitigation, constraint rationale, and verification plan.',
        async: 'Draft two redesign options and rank them against requirements and risks.',
        sync: 'Redesign review with tradeoff critique, prototype revision planning, and verification update.',
        resources: 'Tradeoff matrix template; redesign log; risk mitigation checklist',
        evaluation: 'Assess tradeoff logic, risk mitigation, redesign fit, and verification plan clarity.',
      },
      {
        title: 'Verification Report and Unresolved Risk',
        goals: 'Students distinguish verified requirements from unresolved engineering risks.',
        topics: 'Design verification, verification report, unresolved risk, test evidence, engineering handoff',
        objectives: 'Write a verification report that names what passed, what failed, and what remains risky.',
        assessment:
          'Verification report with passed requirements, failed or partial tests, safety margin, unresolved risk, and handoff note.',
        async: 'Review test results and classify each requirement as verified, partial, failed, or not tested.',
        sync: 'Verification report workshop with evidence trace, safety margin challenge, and risk handoff revision.',
        resources: 'Verification report rubric; requirement traceability table; handoff note model',
        evaluation: 'Score verification trace, risk transparency, safety language, and handoff usefulness.',
      },
      {
        title: 'Final Engineering Design Review and Handoff',
        goals:
          'Students synthesize requirement evidence, testing, redesign, safety, and verification into a final review.',
        topics: 'Final design review, prototype demonstration, verification evidence, safety factor, handoff risk',
        objectives: 'Defend the final engineering design using test evidence and unresolved risk notes.',
        assessment:
          'Final engineering design review package with prototype evidence, test report, tradeoff matrix, safety factor, verification memo, and handoff risk.',
        async: 'Prepare a final design review summary that connects each claim to test evidence.',
        sync: 'Final engineering design review with prototype demonstration, verification challenge, and handoff debrief.',
        resources: 'Final design review rubric; prototype demo checklist; engineering handoff checklist',
        evaluation:
          'Assess requirement verification, technical reasoning, redesign evidence, safety, and handoff readiness.',
      },
    ],
  }),
};

const CREATIVE_WRITING_GOLD_PROJECT = {
  id: 'gold-creative-writing-project',
  label: 'Creative writing workshop gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Creative Writing Workshop',
    learningOutcomes:
      'Draft creative work, apply craft vocabulary, participate in workshop critique, make visible revision decisions, curate a revision portfolio, write an artist statement, and present work in a final reading or showcase.',
    lessons: [
      {
        title: 'Image, Voice, and Draft Evidence',
        goals: 'Students identify concrete image and voice choices in an early creative draft.',
        topics: 'Image, voice, sensory detail, craft evidence, manuscript draft',
        objectives: 'Annotate a short draft to explain how image and voice choices create audience effect.',
        assessment:
          'Creative draft portfolio entry with poem draft, craft annotation, workshop critique note, and revision decision.',
        async: 'Draft one short image-driven piece and annotate two craft choices that affect the reader.',
        sync: 'Workshop draft circle with close reading, craft evidence naming, critique note, and revision commitment.',
        resources: 'Image and voice craft guide; sample annotated poem draft; workshop critique protocol',
        evaluation: 'Score draft specificity, craft annotation, critique evidence, and revision decision clarity.',
      },
      {
        title: 'Scene, Character, and Audience Effect',
        goals: 'Students shape a scene around character desire and intended reader response.',
        topics: 'Scene draft, character desire, audience effect, conflict, revision plan',
        objectives: 'Revise a scene so character action and audience effect are visible in the draft.',
        assessment:
          'Scene draft portfolio entry with character desire, audience-effect note, critique evidence, and revision plan.',
        async: 'Draft a scene and mark where the reader should infer character desire.',
        sync: 'Scene workshop with audience-effect mapping, character-choice critique, and revision planning.',
        resources: 'Scene-drafting checklist; audience-effect map; character desire examples',
        evaluation: 'Score scene evidence, character clarity, audience-effect reasoning, and revision plan fit.',
      },
      {
        title: 'Dialogue, Point of View, and Subtext',
        goals: 'Students use dialogue and point of view to create subtext without overexplaining.',
        topics: 'Dialogue, point of view, subtext, revised passage, peer critique',
        objectives: 'Revise dialogue so point of view and subtext support the intended scene tension.',
        assessment:
          'Dialogue revision portfolio entry with point-of-view choice, subtext evidence, peer critique, and revised passage.',
        async: 'Revise a dialogue passage and identify one line where subtext changes the scene.',
        sync: 'Dialogue workshop with read-aloud testing, point-of-view critique, and subtext revision.',
        resources: 'Dialogue revision guide; point-of-view decision chart; subtext examples',
        evaluation: 'Score dialogue craft, point-of-view control, subtext evidence, and revised passage quality.',
      },
      {
        title: 'Structure, Pacing, and Sequence',
        goals: 'Students compare structure options and choose a pacing strategy for a draft.',
        topics: 'Structure map, pacing, sequence, transition, craft reflection',
        objectives: 'Map draft structure and revise sequence to strengthen movement and reader attention.',
        assessment:
          'Structure map and revised draft section with pacing rationale, sequence choice, and craft reflection.',
        async: 'Create a structure map for a draft and flag one pacing problem.',
        sync: 'Sequence clinic with structure-map comparison, pacing test, and revision decision.',
        resources: 'Structure map template; pacing checklist; sequence revision examples',
        evaluation: 'Score structure awareness, pacing rationale, sequence revision, and craft reflection.',
      },
      {
        title: 'Workshop Critique and Response Letter',
        goals: 'Students synthesize workshop critique into a practical response letter.',
        topics: 'Workshop critique, response letter, critique synthesis, revision priority, artistic intent',
        objectives: 'Write a response letter that selects a revision priority from peer critique evidence.',
        assessment:
          'Workshop response letter with critique synthesis, selected revision priority, evidence quote, and next-draft commitment.',
        async: 'Review peer critique notes and choose one revision priority with supporting evidence.',
        sync: 'Critique synthesis workshop with response-letter planning and next-draft commitment.',
        resources: 'Workshop response letter model; critique synthesis worksheet; revision priority guide',
        evaluation: 'Score critique synthesis, evidence quote use, revision priority, and artistic-intent protection.',
      },
      {
        title: 'Line-Level Revision and Style',
        goals: 'Students revise line-level choices for rhythm, tone, precision, and audience effect.',
        topics: 'Line-level revision, style, rhythm, tone, audience effect, marked-up draft',
        objectives: 'Mark and revise sentence-level choices to strengthen voice and reader experience.',
        assessment:
          'Line-level revision packet with marked-up draft, style choice, audience effect, and revision explanation.',
        async: 'Mark five line-level choices in a draft and explain the intended effect of two revisions.',
        sync: 'Style workshop with read-aloud comparison, line edit rationale, and audience-effect check.',
        resources: 'Line edit annotation key; style revision examples; rhythm and tone checklist',
        evaluation: 'Score marked-up evidence, style precision, audience-effect explanation, and revision quality.',
      },
      {
        title: 'Artist Statement and Portfolio Curation',
        goals: 'Students curate portfolio artifacts and explain their craft growth in an artist statement.',
        topics: 'Artist statement, revision portfolio, process journal, portfolio curation, craft evolution',
        objectives: 'Draft an artist statement that connects portfolio artifacts to visible revision decisions.',
        assessment:
          'Artist statement draft with curated portfolio artifacts, craft evolution, critique uptake, and revision rationale.',
        async: 'Select portfolio artifacts and annotate what each one shows about craft growth.',
        sync: 'Portfolio curation studio with artist statement peer review and revision-rationale check.',
        resources: 'Artist statement guide; portfolio curation checklist; process journal excerpts',
        evaluation: 'Score portfolio coherence, craft evolution, critique uptake, and artist-statement specificity.',
      },
      {
        title: 'Final Reading and Revision Portfolio',
        goals: 'Students present final creative work and defend revision choices through portfolio evidence.',
        topics: 'Final reading, revision portfolio, artist statement, audience reflection, process journal',
        objectives: 'Prepare a final reading and revision portfolio that documents craft choices and future goals.',
        assessment:
          'Final revision portfolio with selected creative work, artist statement, audience reflection, and process journal evidence.',
        async: 'Finalize portfolio selections and prepare a short final reading introduction.',
        sync: 'Final reading and portfolio showcase with audience reflection, craft evidence review, and future revision goal.',
        resources: 'Final portfolio checklist; reading introduction model; audience reflection prompt',
        evaluation:
          'Score final craft evidence, portfolio coherence, artist statement, audience reflection, and process journal use.',
      },
    ],
  }),
};

const BUSINESS_STRATEGY_CASE_GOLD_PROJECT = {
  id: 'gold-business-strategy-case-project',
  label: 'Business strategy case method gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Business Strategy Case Method',
    learningOutcomes:
      'Analyze business cases, interpret exhibits, weigh stakeholder tradeoffs, defend strategic recommendations, revise executive memos, and plan implementation risk responses.',
    lessons: [
      {
        title: 'Market Entry Decision Case',
        goals: 'Students distinguish market facts from assumptions before recommending an entry strategy.',
        topics: 'Business case, market entry, decision criteria, exhibit evidence, stakeholder tradeoff',
        objectives: 'Evaluate a market entry case and defend one recommendation using case evidence.',
        assessment:
          'Case analysis memo with market-entry recommendation, exhibit evidence, stakeholder tradeoff, decision criteria, and implementation risk.',
        async: 'Read the case packet and annotate exhibits for market size, margin, channel risk, and assumptions.',
        sync: 'Case decision board with fact sort, exhibit check, stakeholder tradeoff challenge, and recommendation defense.',
        resources: 'Case packet; exhibit analysis guide; recommendation memo template',
        evaluation:
          'Score case evidence, tradeoff reasoning, decision criteria, recommendation defense, and implementation risk.',
      },
      {
        title: 'Competitive Advantage and Operating Tradeoffs',
        goals: 'Students compare strategic options using advantage evidence and operating constraints.',
        topics: 'Competitive advantage, operating margin, capability fit, financial tradeoff, implementation risk',
        objectives: 'Revise an executive memo by comparing advantage claims against operating tradeoffs.',
        assessment:
          'Executive memo with strategic recommendation, competitive-advantage evidence, financial tradeoff, alternative option, and implementation-risk revision.',
        async: 'Prepare a tradeoff table comparing two strategic options using exhibit and operating-margin evidence.',
        sync: 'Decision-criteria debate with alternative recommendation challenge and operating-tradeoff review.',
        resources: 'Tradeoff table model; operating-margin exhibit; executive memo checklist',
        evaluation:
          'Assess strategic fit, exhibit use, alternative comparison, financial tradeoff, and revision quality.',
      },
      {
        title: 'Customer Segment and Value Proposition',
        goals: 'Students use case evidence to select a customer segment and defend the value proposition.',
        topics: 'Customer segment, value proposition, buying trigger, case exhibit, segment priority',
        objectives: 'Prioritize a customer segment and explain why the value proposition fits that segment.',
        assessment:
          'Segment recommendation memo with customer evidence, value-proposition fit, exhibit citation, and segment-priority tradeoff.',
        async:
          'Analyze customer-segment exhibits and tag evidence for pain point, willingness to pay, and adoption barrier.',
        sync: 'Segment prioritization board with case evidence comparison, value-proposition challenge, and recommendation revision.',
        resources: 'Customer segment exhibit; value proposition canvas; segment priority guide',
        evaluation:
          'Score segment evidence, value-proposition fit, tradeoff clarity, and recommendation defensibility.',
      },
      {
        title: 'Pricing, Margin, and Financial Tradeoff',
        goals: 'Students connect pricing decisions to margin evidence and strategic risk.',
        topics: 'Pricing, operating margin, financial tradeoff, exhibit analysis, risk note',
        objectives: 'Defend a pricing recommendation using margin evidence and risk language.',
        assessment:
          'Pricing decision memo with margin exhibit analysis, financial tradeoff, recommendation, and risk note.',
        async: 'Calculate margin implications from the exhibit and write one pricing assumption that needs review.',
        sync: 'Pricing case clinic with exhibit check, financial-tradeoff debate, and risk-note revision.',
        resources: 'Pricing exhibit; margin calculator; financial-tradeoff checklist',
        evaluation: 'Score exhibit accuracy, margin reasoning, pricing recommendation, and risk-note quality.',
      },
      {
        title: 'Go-to-Market Channel Choice',
        goals: 'Students compare go-to-market channels by cost, reach, partner risk, and strategic fit.',
        topics: 'Go-to-market, channel strategy, partner risk, customer reach, implementation constraint',
        objectives: 'Recommend a channel strategy and explain the implementation constraint it creates.',
        assessment:
          'Go-to-market recommendation brief with channel comparison, partner-risk evidence, decision criteria, and implementation constraint.',
        async: 'Build a channel comparison table and identify one partner or adoption risk from the case.',
        sync: 'Channel decision board with case evidence review, partner-risk challenge, and recommendation defense.',
        resources: 'Channel comparison table; partner-risk guide; go-to-market case notes',
        evaluation: 'Score channel evidence, reach/cost comparison, partner-risk reasoning, and implementation fit.',
      },
      {
        title: 'Stakeholder Tradeoff and Organizational Alignment',
        goals: 'Students identify stakeholder winners, losers, and alignment risks before final recommendation.',
        topics: 'Stakeholder tradeoff, organizational alignment, incentive conflict, decision resistance',
        objectives: 'Revise a recommendation so stakeholder tradeoffs and alignment risks are explicit.',
        assessment:
          'Stakeholder tradeoff memo with winners, losers, incentive conflict, alignment risk, and revised strategic recommendation.',
        async: 'Map stakeholder priorities and mark where the recommendation creates resistance.',
        sync: 'Stakeholder tradeoff challenge with alignment-risk debate and revised recommendation language.',
        resources: 'Stakeholder map; incentive conflict examples; alignment-risk checklist',
        evaluation:
          'Score stakeholder specificity, tradeoff honesty, alignment-risk reasoning, and recommendation revision.',
      },
      {
        title: 'Implementation Risk and Contingency Plan',
        goals: 'Students rank implementation risks and choose a mitigation plan tied to the case recommendation.',
        topics: 'Implementation risk, contingency plan, risk ranking, leading indicator, mitigation',
        objectives: 'Prioritize implementation risks and select a mitigation that protects the recommendation.',
        assessment:
          'Implementation-risk note with risk ranking, leading indicator, contingency plan, and recommendation revision.',
        async: 'Rank risks by impact and uncertainty, then select one leading indicator from the case.',
        sync: 'Risk review board with implementation-risk ranking, contingency critique, and memo revision.',
        resources: 'Risk ranking matrix; leading indicator guide; contingency-plan example',
        evaluation: 'Score risk prioritization, indicator fit, mitigation logic, and revision specificity.',
      },
      {
        title: 'Final Executive Recommendation Memo',
        goals: 'Students integrate case evidence, alternatives, criteria, tradeoffs, and risk into a final memo.',
        topics: 'Executive memo, strategic recommendation, alternative option, decision criteria, implementation plan',
        objectives: 'Defend a final executive recommendation against alternatives using case evidence.',
        assessment:
          'Final executive memo with strategic recommendation, case evidence, alternative comparison, stakeholder tradeoff, decision criteria, and implementation-risk plan.',
        async: 'Draft the final memo and annotate where each claim uses case evidence or exhibit analysis.',
        sync: 'Final case board with recommendation defense, alternative challenge, implementation-risk review, and executive-memo revision.',
        resources: 'Executive memo rubric; alternative comparison guide; final case-board protocol',
        evaluation:
          'Score case evidence integration, recommendation clarity, alternative comparison, stakeholder tradeoff, and implementation realism.',
      },
    ],
  }),
};

const CONSTITUTIONAL_LAW_GOLD_PROJECT = {
  id: 'gold-constitutional-law-project',
  label: 'Constitutional law doctrinal gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Constitutional Law: Rights and Structure',
    learningOutcomes:
      'Brief constitutional cases, synthesize legal rules, distinguish holdings and rationales, compare precedents, spot issues, apply doctrine to hypotheticals, and write revised IRAC legal memos.',
    lessons: [
      {
        title: 'Judicial Review and Case Briefing',
        goals: 'Students separate material facts, procedural posture, holding, rationale, and rule statement.',
        topics: 'Constitutional law, judicial review, case brief, holding, rationale, legal rule',
        objectives: 'Extract a constitutional holding and write a rule statement from a foundational case.',
        assessment:
          'Case brief with material facts, procedural posture, holding, rationale, legal rule, and hypothetical application.',
        async: 'Read the casebook excerpt and annotate facts, issue, holding, rationale, and dissent.',
        sync: 'Socratic rule application with case brief comparison, holding extraction, rule challenge, and hypothetical application.',
        resources: 'Casebook excerpt; case brief template; rule statement checklist',
        evaluation: 'Score holding accuracy, rationale distinction, rule statement, and hypothetical application.',
      },
      {
        title: 'Standing and Justiciability',
        goals: 'Students decide whether a plaintiff can bring a constitutional claim before reaching the merits.',
        topics: 'Standing, injury, causation, redressability, jurisdiction, justiciability',
        objectives: 'Apply standing doctrine to decide whether a new plaintiff has a justiciable claim.',
        assessment:
          'Standing issue-spotting response with injury, causation, redressability, precedent comparison, and legal conclusion.',
        async: 'Brief two standing cases and mark the facts that change jurisdictional analysis.',
        sync: 'Justiciability workshop with issue spotting, precedent comparison, and revised conclusion paragraph.',
        resources: 'Standing doctrine chart; issue-spotting checklist; precedent comparison notes',
        evaluation: 'Score issue identification, doctrinal accuracy, fact application, and jurisdictional conclusion.',
      },
      {
        title: 'Federalism and Commerce Power',
        goals: 'Students compare commerce-power precedents and identify doctrinal boundaries.',
        topics: 'Federalism, commerce clause, precedent, doctrinal limit, distinguishing facts',
        objectives: 'Distinguish commerce-power cases and explain which facts change the legal result.',
        assessment:
          'Commerce clause precedent map with rule statements, distinguishing facts, doctrinal limit, and hypothetical application.',
        async: 'Compare case excerpts and tag facts tied to economic activity, aggregation, and federalism concerns.',
        sync: 'Precedent mapping session with rule synthesis, fact distinction, and hypothetical application.',
        resources: 'Commerce clause case table; precedent map template; doctrinal limit guide',
        evaluation: 'Score precedent comparison, rule synthesis, fact distinction, and application accuracy.',
      },
      {
        title: 'Separation of Powers and Executive Authority',
        goals: 'Students analyze institutional authority and constitutional limits in executive-power disputes.',
        topics: 'Separation of powers, executive authority, statutory authorization, institutional role',
        objectives: 'Apply separation-of-powers doctrine to an executive action hypothetical.',
        assessment:
          'Executive authority IRAC memo with issue, rule statement, authority source, doctrinal limit, counterargument, and legal conclusion.',
        async: 'Read executive-power cases and identify the source of authority and the limiting rationale.',
        sync: 'Authority-source debate with rule statement challenge, counterargument, and IRAC revision.',
        resources: 'Executive authority framework; IRAC memo model; counterargument checklist',
        evaluation: 'Score authority source, rule application, counterargument, doctrinal limit, and conclusion.',
      },
      {
        title: 'Equal Protection and Scrutiny Standards',
        goals: 'Students choose and apply the correct scrutiny standard for equal protection claims.',
        topics: 'Equal protection, strict scrutiny, intermediate scrutiny, rational basis, precedent comparison',
        objectives: 'Apply scrutiny standards to a new fact pattern and explain which facts matter.',
        assessment:
          'Equal protection legal memo with issue spotting, scrutiny standard, rule statement, precedent comparison, and application to a new hypothetical.',
        async: 'Compare equal protection precedents and identify which facts trigger different scrutiny.',
        sync: 'Scrutiny application workshop with fact-sensitive rule challenge and revised IRAC paragraph.',
        resources: 'Scrutiny standards chart; precedent map; equal protection hypothetical set',
        evaluation:
          'Assess rule accuracy, precedent comparison, fact application, counterargument, and conclusion clarity.',
      },
      {
        title: 'Substantive Due Process and Liberty Interests',
        goals: 'Students define liberty interests and test doctrinal limits against new facts.',
        topics: 'Substantive due process, liberty interest, fundamental right, doctrinal limit, rationale',
        objectives: 'Analyze whether a claimed liberty interest fits existing substantive due process doctrine.',
        assessment:
          'Substantive due process rule synthesis with protected interest, holding/rationale evidence, doctrinal limit, and legal conclusion.',
        async: 'Brief liberty-interest cases and tag holding, rationale, and limiting language.',
        sync: 'Rule synthesis clinic with protected-interest comparison, doctrinal-limit challenge, and conclusion revision.',
        resources: 'Liberty interest case excerpts; rule synthesis template; doctrinal limit checklist',
        evaluation:
          'Score protected-interest definition, holding/rationale use, limit analysis, and conclusion support.',
      },
      {
        title: 'Free Speech Doctrine and Forum Analysis',
        goals: 'Students classify forums and apply speech standards to government restrictions.',
        topics: 'Free speech, forum analysis, government interest, content neutrality, constitutional standard',
        objectives: 'Apply forum doctrine and speech standards to a restriction hypothetical.',
        assessment:
          'Free speech issue-spotting memo with forum classification, rule statement, government-interest analysis, precedent comparison, and application.',
        async: 'Review forum doctrine examples and classify facts from three short hypotheticals.',
        sync: 'Forum analysis panel with classification challenge, government-interest test, and revised application.',
        resources: 'Forum doctrine chart; speech standards table; issue-spotting hypotheticals',
        evaluation:
          'Score forum classification, rule statement, precedent use, government-interest analysis, and application.',
      },
      {
        title: 'Final Constitutional Issue-Spotting Memo',
        goals: 'Students synthesize doctrines, identify issues, handle counterarguments, and reach legal conclusions.',
        topics: 'Issue spotting, rule synthesis, precedent comparison, counterargument, legal conclusion',
        objectives:
          'Write a final constitutional-law memo that integrates multiple doctrines into a defensible analysis.',
        assessment:
          'Final IRAC memo with issue spotting, rule synthesis, doctrinal evidence, precedent limits, counterargument, and legal conclusion.',
        async: 'Outline the final memo and annotate where each issue uses case evidence or doctrine.',
        sync: 'Final issue-spotting panel with rule synthesis, counterargument challenge, and revised legal conclusion.',
        resources: 'Final IRAC rubric; issue-spotting packet; precedent synthesis guide',
        evaluation:
          'Score issue coverage, rule synthesis, doctrinal evidence, counterargument handling, and conclusion quality.',
      },
    ],
  }),
};

const INFORMATION_LITERACY_GOLD_PROJECT = {
  id: 'gold-information-literacy-project',
  label: 'Information literacy and library research gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Information Literacy and Library Research',
    learningOutcomes:
      'Frame research questions, build database search strategies, evaluate source credibility and relevance, follow citation trails, create annotated bibliographies, synthesize sources in a matrix, and justify source-use decisions with attribution integrity.',
    lessons: [
      {
        title: 'Research Questions and Information Needs',
        goals: 'Students turn broad topics into researchable information needs and source boundaries.',
        topics: 'Information literacy, research question, information need, source scope, inquiry boundary',
        objectives: 'Narrow a broad topic into a research question and explain what source evidence is needed.',
        assessment:
          'Source-use plan with research question, information need, source boundary, preliminary search terms, and source-use decision.',
        async: 'Review sample topics and identify which ones are too broad, too narrow, or missing source scope.',
        sync: 'Question-framing workshop with information-need diagnosis, source-scope check, and search-plan revision.',
        resources: 'Research question checklist; information-need examples; source-scope worksheet',
        evaluation: 'Score question focus, source boundary, information need, and search-plan readiness.',
      },
      {
        title: 'Keywords, Controlled Vocabulary, and Search Strategy',
        goals: 'Students compare keyword search, subject headings, and controlled vocabulary.',
        topics: 'Database search, keyword search, controlled vocabulary, Boolean search, search strategy',
        objectives: 'Build and refine a database search string using keywords and controlled vocabulary.',
        assessment:
          'Database search log with search string, controlled vocabulary term, filter decision, result comparison, and search refinement.',
        async: 'Try two keyword searches in a library database and save result counts and strongest source titles.',
        sync: 'Search strategy lab with Boolean operators, subject heading comparison, filter critique, and revised search log.',
        resources: 'Database guide; controlled vocabulary example; search log template',
        evaluation: 'Score search-string logic, vocabulary fit, filter use, and relevance of retrieved sources.',
      },
      {
        title: 'Database Filters and Scholarly Source Retrieval',
        goals: 'Students select databases and filters that match the research question.',
        topics: 'Library database, peer-reviewed source, scholarly source, publication type, filter decision',
        objectives: 'Choose databases and filters that retrieve credible sources for a specific question.',
        assessment:
          'Source retrieval dossier with database choice, peer-reviewed filter, scholarly source evidence, relevance note, and source-use decision.',
        async: 'Compare one multidisciplinary database and one subject database for the same question.',
        sync: 'Database selection clinic with peer-reviewed filter check, source-type comparison, and retrieval plan revision.',
        resources: 'Database comparison table; peer-review explainer; source-type checklist',
        evaluation: 'Score database fit, filter decision, scholarly-source identification, and source relevance.',
      },
      {
        title: 'Source Credibility, Authority, and Bias',
        goals: 'Students evaluate source authority, methods, credibility, currency, and bias.',
        topics: 'Source evaluation, source credibility, authority, bias, currency, method evidence',
        objectives: 'Evaluate whether a source is credible and relevant enough to use in a research artifact.',
        assessment:
          'Source evaluation dossier with authority evidence, credibility check, relevance explanation, bias or currency note, and source-use decision.',
        async: 'Evaluate two sources with a credibility checklist and flag one uncertainty for review.',
        sync: 'Credibility review clinic with source comparison, authority challenge, bias check, and revised source decision.',
        resources: 'Source evaluation rubric; credibility checklist; bias and currency examples',
        evaluation: 'Score authority evidence, credibility reasoning, relevance, and bias/currency review.',
      },
      {
        title: 'Citation Trails and Source Networks',
        goals: 'Students follow citation trails to find stronger or more central sources.',
        topics: 'Citation trail, cited reference search, source network, related sources, bibliography mining',
        objectives: 'Use references and cited-by links to improve a source set.',
        assessment:
          'Citation-trail map with seed source, cited reference, cited-by source, relevance note, and revised source-use decision.',
        async: 'Choose a seed source and follow one reference and one cited-by link.',
        sync: 'Citation-trail mapping session with source network comparison, relevance challenge, and source-set revision.',
        resources: 'Citation-trail guide; source network map; bibliography mining example',
        evaluation: 'Score trail logic, relevance, source-network reasoning, and revision of the source set.',
      },
      {
        title: 'Annotated Bibliography and Attribution Integrity',
        goals: 'Students annotate sources with purpose, credibility, relevance, and attribution notes.',
        topics: 'Annotated bibliography, attribution, citation management, source summary, source relevance',
        objectives: 'Write annotations that connect source credibility and relevance to the research question.',
        assessment:
          'Annotated bibliography with citation, source summary, credibility note, relevance explanation, attribution plan, and source-use decision.',
        async: 'Draft two annotations and check each citation for required fields.',
        sync: 'Annotation workshop with citation check, relevance explanation, attribution review, and annotation revision.',
        resources: 'Annotated bibliography model; citation style guide; attribution checklist',
        evaluation:
          'Score citation accuracy, annotation specificity, relevance, credibility, and attribution integrity.',
      },
      {
        title: 'Synthesis Matrix and Gap Analysis',
        goals: 'Students compare claims, methods, and limits across sources instead of summarizing one by one.',
        topics: 'Synthesis matrix, source comparison, gap analysis, source limitation, evidence relationship',
        objectives: 'Use a synthesis matrix to identify relationships, gaps, and limits across sources.',
        assessment:
          'Synthesis matrix with source comparison, claim relationship, method or evidence difference, gap note, and synthesis decision.',
        async: 'Complete one row of a synthesis matrix comparing two sources.',
        sync: 'Synthesis matrix clinic with relationship naming, gap challenge, and source-group revision.',
        resources: 'Synthesis matrix template; gap analysis guide; source comparison example',
        evaluation: 'Score source comparison, relationship logic, gap quality, and synthesis decision.',
      },
      {
        title: 'Research Log and Final Source-Use Plan',
        goals: 'Students defend the final source set with search, credibility, citation, and synthesis evidence.',
        topics: 'Research log, source-use plan, database search, source credibility, citation trail, synthesis matrix',
        objectives: 'Prepare a final source-use plan that justifies each source and names remaining limits.',
        assessment:
          'Final source-use portfolio with research log, search strategy, source evaluation dossier, citation-trail map, synthesis matrix, and attribution plan.',
        async: 'Assemble the final research log and mark one source that still needs replacement or confirmation.',
        sync: 'Final source-use review with search-strategy defense, credibility challenge, synthesis check, and attribution handoff.',
        resources: 'Research log checklist; final source-use rubric; attribution handoff guide',
        evaluation:
          'Score search traceability, source credibility, synthesis quality, citation-trail evidence, and attribution readiness.',
      },
    ],
  }),
};

const TEACHER_PREPARATION_GOLD_PROJECT = {
  id: 'gold-teacher-preparation-project',
  label: 'Teacher preparation and instructional methods gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Teaching Methods and Classroom Practice',
    learningOutcomes:
      'Design standards-aligned lesson plans, rehearse microteaching moves, analyze student work, use formative assessment, differentiate instruction, manage classroom routines, and revise instructional decisions from classroom evidence.',
    lessons: [
      {
        title: 'Learning Targets and Standards Alignment',
        goals: 'Teacher candidates connect standards, learning targets, lesson tasks, and student evidence.',
        topics: 'Teaching methods, learning target, standards alignment, lesson plan, formative assessment',
        objectives: 'Write a learning target and align the lesson task and formative assessment to the standard.',
        assessment:
          'Lesson plan portfolio entry with learning target, standards alignment, formative assessment, student-evidence cue, and instructional decision.',
        async: 'Review two lesson plans and annotate where the target, task, and assessment align or drift.',
        sync: 'Lesson-study planning workshop with target-task alignment check, formative assessment critique, and plan revision.',
        resources: 'Standards excerpt; lesson-plan template; formative assessment examples',
        evaluation:
          'Score target-task alignment, standard fit, formative evidence, and revised instructional decision.',
      },
      {
        title: 'Teacher Modeling and Questioning Sequences',
        goals: 'Teacher candidates model a concept and plan questions that reveal student thinking.',
        topics: 'Instructional modeling, questioning sequence, think-aloud, student response, teaching move',
        objectives: 'Design a teaching model and question sequence that checks for student understanding.',
        assessment:
          'Teaching demonstration plan with modeling script, question sequence, anticipated student responses, formative check, and instructional decision.',
        async:
          'Annotate a model lesson video for teacher moves, student responses, and missed checks for understanding.',
        sync: 'Modeling rehearsal with question-sequence critique, student-response prediction, and revised teaching move.',
        resources: 'Modeling script example; questioning stems; student-response prediction chart',
        evaluation: 'Assess modeling clarity, question quality, student-thinking visibility, and revision plan.',
      },
      {
        title: 'Microteaching Rehearsal and Peer Observation',
        goals: 'Teacher candidates rehearse a short lesson segment and use peer observation evidence.',
        topics: 'Microteaching, teaching rehearsal, peer observation, feedback response, lesson revision',
        objectives: 'Rehearse a teaching segment and revise it from peer observation evidence.',
        assessment:
          'Microteaching reflection with teaching demonstration evidence, peer observation notes, feedback response, and revised instructional decision.',
        async: 'Prepare a five-minute microteaching segment and identify the student evidence to watch for.',
        sync: 'Microteaching lab with peer observation, feedback conference, and second teaching attempt.',
        resources: 'Microteaching protocol; peer observation checklist; feedback response template',
        evaluation: 'Score teaching clarity, peer-evidence use, feedback uptake, and revised instructional move.',
      },
      {
        title: 'Student Work Analysis and Misconception Diagnosis',
        goals: 'Teacher candidates analyze student work to identify misconceptions and next teaching moves.',
        topics: 'Student work analysis, misconception diagnosis, error pattern, formative evidence, reteach plan',
        objectives: 'Diagnose student misconceptions and decide what feedback or reteaching is needed.',
        assessment:
          'Student work analysis with error pattern, evidence citation, misconception diagnosis, feedback note, and reteach decision.',
        async: 'Sort student-work samples into ready, partial, and needs-reteach groups with evidence notes.',
        sync: 'Student-work clinic with misconception mapping, feedback revision, and targeted reteach planning.',
        resources: 'Student-work packet; misconception map; feedback-note examples',
        evaluation: 'Score evidence citation, diagnosis accuracy, feedback precision, and reteach rationale.',
      },
      {
        title: 'Differentiation and Accessibility Supports',
        goals: 'Teacher candidates adapt instruction without lowering the learning target.',
        topics: 'Differentiation, accessibility, scaffold, extension task, learner variability, accommodation',
        objectives: 'Revise a lesson plan with differentiated supports and equivalent evidence expectations.',
        assessment:
          'Differentiation plan with learner need, scaffold, extension option, accessibility support, evidence standard, and instructional decision.',
        async: 'Review learner profiles and identify which support changes access without changing the standard.',
        sync: 'Differentiation design studio with scaffold critique, accessibility check, and revised lesson plan.',
        resources: 'Learner profile set; differentiation checklist; accessibility planning guide',
        evaluation:
          'Score scaffold fit, access support, evidence-standard integrity, and feasibility of the adaptation.',
      },
      {
        title: 'Formative Assessment and Feedback Cycles',
        goals: 'Teacher candidates use formative assessment to plan feedback and next instruction.',
        topics: 'Formative assessment, exit ticket, feedback cycle, checks for understanding, instructional adjustment',
        objectives: 'Design a formative check and use results to plan feedback or reteaching.',
        assessment:
          'Formative assessment plan with exit ticket, success criteria, likely responses, feedback move, and reteach decision.',
        async: 'Compare two exit tickets and identify which one gives better evidence for instruction.',
        sync: 'Formative assessment workshop with response sorting, feedback drafting, and reteach decision rehearsal.',
        resources: 'Exit-ticket examples; feedback cycle model; response-sort template',
        evaluation: 'Assess formative-evidence quality, feedback specificity, and next-instruction decision.',
      },
      {
        title: 'Classroom Routines and Management for Learning',
        goals: 'Teacher candidates plan routines that protect learning time and participation.',
        topics: 'Classroom management, routines, transition plan, participation structure, behavior support',
        objectives: 'Plan a classroom routine that supports equitable participation and learning evidence.',
        assessment:
          'Classroom management plan with routine steps, transition cue, participation structure, behavior support, and evidence-monitoring decision.',
        async: 'Analyze classroom routine scenarios and flag where learning evidence or participation breaks down.',
        sync: 'Routine rehearsal with transition timing, participation audit, and classroom feasibility critique.',
        resources: 'Routine planning template; transition checklist; participation audit tool',
        evaluation: 'Score routine clarity, participation support, feasibility, and connection to learning evidence.',
      },
      {
        title: 'Final Lesson Plan Portfolio and Teaching Reflection',
        goals: 'Teacher candidates synthesize lesson-plan evidence into a classroom-ready teaching portfolio.',
        topics: 'Final lesson plan, teaching reflection, student evidence, differentiation, formative assessment',
        objectives: 'Defend a revised lesson plan using classroom evidence and feedback from the course.',
        assessment:
          'Final teaching plan portfolio with standards alignment, microteaching evidence, student work analysis, differentiation plan, formative assessment, and revised instructional decision.',
        async:
          'Assemble the final lesson-plan portfolio and mark one instructional decision that changed from evidence.',
        sync: 'Final lesson-study conference with portfolio defense, student-evidence challenge, and teaching reflection.',
        resources: 'Final portfolio rubric; reflection guide; classroom-ready lesson-plan checklist',
        evaluation:
          'Score standards alignment, classroom evidence, differentiation, feedback use, and readiness to teach.',
      },
    ],
  }),
};

const COUNSELING_PRACTICE_GOLD_PROJECT = {
  id: 'gold-counseling-practice-project',
  label: 'Counseling skills and social-work practice gold fixture',
  courseMap: makeGoldCourseMap({
    courseName: 'Counseling Skills and Social Work Practice',
    learningOutcomes:
      'Use active listening, reflective responses, client intake evidence, case conceptualization, risk assessment, safety planning, ethics and boundary reasoning, referral planning, and supervision feedback to make client-centered helping response decisions.',
    lessons: [
      {
        title: 'Client Intake, Rapport, and Helping Goals',
        goals: 'Students connect client context, stated concern, rapport, and helping goals.',
        topics: 'Client intake, rapport building, stated concern, helping goal, empathy',
        objectives: 'Use intake evidence to identify a client concern and a respectful helping goal.',
        assessment:
          'Intake note with client context, stated concern, empathy evidence, boundary note, and helping response decision.',
        async: 'Watch an intake clip and code rapport, empathy, open questions, and missed client cues.',
        sync: 'Client-intake role-play with observation coding, supervision feedback, and revised helping response.',
        resources: 'Intake-note model; client scenario packet; rapport checklist',
        evaluation: 'Score client cue recognition, rapport evidence, empathy, boundary awareness, and response fit.',
      },
      {
        title: 'Active Listening and Open Questions',
        goals: 'Students practice active listening and open questions before offering advice.',
        topics: 'Active listening, open question, reflection, summary, client goal, observation coding',
        objectives: 'Use open questions and reflections to clarify the client goal.',
        assessment:
          'Helping-skills transcript with open questions, reflection statements, client-goal evidence, observation code, and revised response.',
        async: 'Annotate a transcript for open questions, closed questions, reflections, and advice-giving.',
        sync: 'Helping-skills lab with paired client role-play, observation coding, and response revision.',
        resources: 'OARS skill guide; transcript annotation key; observation coding form',
        evaluation: 'Score listening accuracy, question quality, reflection fit, and client-goal clarity.',
      },
      {
        title: 'Reflective Listening, Empathy, and Summaries',
        goals: 'Students deepen client understanding through reflection, empathy, and summaries.',
        topics: 'Reflective listening, empathy, summary statement, affect cue, process recording',
        objectives: 'Write reflections and summaries that match client meaning and affect.',
        assessment:
          'Process recording with client quote, affect cue, reflection response, summary statement, supervision feedback, and helping response decision.',
        async: 'Compare weak and strong reflection examples and identify what client cue each one uses.',
        sync: 'Reflection rehearsal with process-recording review, peer coding, and supervision note.',
        resources: 'Process-recording template; empathy examples; reflection coding guide',
        evaluation: 'Assess client cue use, empathy accuracy, summary clarity, and feedback uptake.',
      },
      {
        title: 'Case Conceptualization and Strengths Assessment',
        goals: 'Students organize client strengths, context, needs, and goals into a case formulation.',
        topics: 'Case conceptualization, strengths assessment, presenting concern, context, client goal',
        objectives: 'Develop a case conceptualization that connects strengths, context, concern, and next support.',
        assessment:
          'Case conceptualization with client strengths, presenting concern, context evidence, goal statement, and helping response decision.',
        async: 'Review a case vignette and sort facts into strengths, concerns, context, and missing information.',
        sync: 'Case formulation conference with strengths review, missing-evidence challenge, and revised conceptualization.',
        resources: 'Strengths-assessment guide; case formulation map; vignette packet',
        evaluation: 'Score formulation accuracy, strengths use, context evidence, and decision fit.',
      },
      {
        title: 'Risk Assessment and Safety Planning',
        goals: 'Students identify risk cues, protective factors, and safety planning needs.',
        topics: 'Risk assessment, safety plan, protective factor, crisis response, client safety',
        objectives: 'Use client evidence to decide when a safety plan or escalation is needed.',
        assessment:
          'Risk assessment and safety plan with risk cue, protective factor, safety step, escalation note, and helping response decision.',
        async: 'Review risk scenarios and mark which cues require safety planning or consultation.',
        sync: 'Risk-review case conference with safety-plan critique, crisis response decision, and supervision question.',
        resources: 'Risk-screening guide; safety-plan template; crisis-response protocol',
        evaluation: 'Score risk recognition, protective-factor use, safety plan quality, and escalation reasoning.',
      },
      {
        title: 'Ethics, Boundaries, and Mandated Reporting',
        goals: 'Students preserve confidentiality while identifying ethics, boundary, and reporting limits.',
        topics: 'Ethical boundary, confidentiality, mandated reporting, informed consent, supervision note',
        objectives: 'Explain the boundary or reporting decision that fits a client scenario.',
        assessment:
          'Ethics boundary note with confidentiality limit, mandated-reporting cue, informed-consent language, supervision question, and revised helping response decision.',
        async: 'Analyze ethics vignettes and identify the confidentiality or reporting limit in each case.',
        sync: 'Ethics consultation round with boundary challenge, reporting decision, and response-language revision.',
        resources: 'Ethics code excerpt; mandated-reporting decision chart; consent language examples',
        evaluation: 'Assess ethics reasoning, boundary clarity, reporting judgment, and client-centered language.',
      },
      {
        title: 'Referral Planning and Service Coordination',
        goals: 'Students match client goals and risks to feasible referral or service options.',
        topics: 'Referral plan, service coordination, resource fit, client goal, follow-up plan',
        objectives: 'Justify a referral or service plan using client goals, risk, access, and fit.',
        assessment:
          'Referral plan with client goal, service option comparison, access barrier, referral rationale, and follow-up decision.',
        async: 'Compare referral options and note fit, access, and follow-up risks for the client scenario.',
        sync: 'Referral planning clinic with resource comparison, access challenge, and service-plan revision.',
        resources: 'Referral resource map; service-fit checklist; follow-up planning template',
        evaluation: 'Score referral fit, access reasoning, service coordination, and follow-up clarity.',
      },
      {
        title: 'Supervision Integration and Final Helping Plan',
        goals: 'Students synthesize client evidence, risk, ethics, referral, and supervision feedback.',
        topics: 'Supervision feedback, final helping plan, case note, process recording, referral rationale',
        objectives: 'Defend a final helping plan using client evidence and supervision feedback.',
        assessment:
          'Final helping-skills portfolio with intake note, process recording, case conceptualization, risk review, referral plan, supervision reflection, and revised helping response decision.',
        async: 'Assemble the final portfolio and mark one helping response that changed after supervision.',
        sync: 'Final case conference with client-evidence defense, supervision question, and helping-plan handoff.',
        resources: 'Final portfolio rubric; supervision reflection guide; helping-plan checklist',
        evaluation:
          'Score client-centered evidence, ethics and risk reasoning, referral rationale, supervision uptake, and readiness for practice.',
      },
    ],
  }),
};

export const DEFAULT_GOLD_SAMPLES = [
  {
    id: 'gold-research-methods-8',
    label: 'Curated applied social research methods expectation sample',
    project: DEFAULT_AUDIT_PROJECTS[0],
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: RESEARCH_METHODS_GOLD_ENRICHMENT,
    expectations: researchMethodsGoldExpectations(8),
  },
  {
    id: 'gold-research-methods-short-5',
    label: 'Curated short-module research methods scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[0],
    scope: 5,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(RESEARCH_METHODS_GOLD_ENRICHMENT, 5),
    expectations: researchMethodsGoldExpectations(5),
  },
  {
    id: 'gold-research-methods-semester-14',
    label: 'Curated full-semester research methods scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[0],
    scope: 14,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(RESEARCH_METHODS_GOLD_ENRICHMENT, 14, RESEARCH_METHODS_EXTRA_GOLD_LESSON_PHRASES),
    expectations: researchMethodsGoldExpectations(14),
  },
  {
    id: 'gold-ai-course-design-8',
    label: 'Curated AI-supported course design expectation sample',
    project: DEFAULT_AUDIT_PROJECTS[1],
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: AI_COURSE_DESIGN_GOLD_ENRICHMENT,
    expectations: aiCourseDesignGoldExpectations(8),
  },
  {
    id: 'gold-ai-course-design-short-5',
    label: 'Curated short-module AI-supported course design scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[1],
    scope: 5,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(AI_COURSE_DESIGN_GOLD_ENRICHMENT, 5),
    expectations: aiCourseDesignGoldExpectations(5),
  },
  {
    id: 'gold-ai-course-design-semester-14',
    label: 'Curated full-semester AI-supported course design scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[1],
    scope: 14,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(AI_COURSE_DESIGN_GOLD_ENRICHMENT, 14, AI_COURSE_DESIGN_EXTRA_GOLD_LESSON_PHRASES),
    expectations: aiCourseDesignGoldExpectations(14),
  },
  {
    id: 'gold-community-health-8',
    label: 'Curated community health evaluation expectation sample',
    project: DEFAULT_AUDIT_PROJECTS[2],
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: COMMUNITY_HEALTH_GOLD_ENRICHMENT,
    expectations: communityHealthGoldExpectations(8),
  },
  {
    id: 'gold-community-health-short-5',
    label: 'Curated short-module community health evaluation scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[2],
    scope: 5,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(COMMUNITY_HEALTH_GOLD_ENRICHMENT, 5),
    expectations: communityHealthGoldExpectations(5),
  },
  {
    id: 'gold-community-health-semester-14',
    label: 'Curated full-semester community health evaluation scope coverage sample',
    project: DEFAULT_AUDIT_PROJECTS[2],
    scope: 14,
    features: PIPELINE_FEATURES,
    enrichment: scopedGoldEnrichment(COMMUNITY_HEALTH_GOLD_ENRICHMENT, 14, COMMUNITY_HEALTH_EXTRA_GOLD_LESSON_PHRASES),
    expectations: communityHealthGoldExpectations(14),
  },
  {
    id: 'gold-interaction-design-studio-8',
    label: 'Curated interaction design studio expectation sample',
    project: INTERACTION_DESIGN_STUDIO_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: INTERACTION_DESIGN_STUDIO_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'studio-lab',
      artifactGenres: Array(8).fill('design-prototype'),
      packageMustMatch: [
        /prototype evidence/i,
        /studio critique/i,
        /usability test/i,
        /accessibility audit/i,
        /design decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/interaction design studio/i, /prototype/i],
            [/usability test/i, /accessibility audit/i, /design system/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/prototype evidence/i, /design decision/i],
        },
        slideDecks: {
          mustMatch: [/prototype evidence/i, /design decision/i],
          mustMatchAny: [[/studio critique case/i, /usability test/i]],
        },
        assignments: {
          mustMatch: [/prototype evidence/i, /interaction design studio/i],
        },
        rubrics: {
          mustMatch: [/prototype evidence/i],
        },
        discussions: {
          mustMatch: [/prototype evidence/i, /design decision/i],
        },
        quizBank: {
          mustMatch: [/prototype evidence/i, /design decision/i],
        },
        studyGuides: {
          mustMatch: [/prototype evidence/i, /design decision/i],
        },
        courseFaq: {
          mustMatch: [/prototype evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-spanish-healthcare-8',
    label: 'Curated Spanish healthcare communication expectation sample',
    project: SPANISH_HEALTHCARE_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: SPANISH_HEALTHCARE_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'clinical-simulation',
      artifactGenres: Array(8).fill('performance-simulation'),
      packageMustMatch: [
        /clinical Spanish/i,
        /patient interview/i,
        /role-play evidence/i,
        /cultural humility/i,
        /clinical communication decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Spanish for healthcare communication/i, /patient interview/i],
            [/interpreter protocol/i, /discharge instructions/i, /cultural humility/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/role-play evidence/i, /clinical communication decision/i],
        },
        slideDecks: {
          mustMatch: [/role-play evidence/i, /clinical communication decision/i],
          mustMatchAny: [[/patient-care scenario/i, /patient interview/i]],
        },
        assignments: {
          mustMatch: [/role-play evidence/i, /Spanish for healthcare communication/i],
        },
        rubrics: {
          mustMatch: [/role-play evidence/i],
        },
        discussions: {
          mustMatch: [/role-play evidence/i, /clinical communication decision/i],
        },
        quizBank: {
          mustMatch: [/role-play evidence/i, /clinical communication decision/i],
        },
        studyGuides: {
          mustMatch: [/role-play evidence/i, /clinical communication decision/i],
        },
        courseFaq: {
          mustMatch: [/role-play evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-clinical-judgment-8',
    label: 'Curated clinical judgment care-planning expectation sample',
    project: CLINICAL_JUDGMENT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: CLINICAL_JUDGMENT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'clinical-judgment-simulation',
      artifactGenres: Array(8).fill('clinical-care-plan'),
      packageMustMatch: [
        /clinical judgment/i,
        /patient-assessment evidence/i,
        /clinical care decision/i,
        /care plan/i,
        /SBAR/i,
        /patient safety/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/clinical judgment and care planning/i, /patient-assessment evidence/i],
            [/nursing diagnosis/i, /SBAR handoff/i, /patient safety/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/patient-assessment evidence/i, /clinical care decision/i],
        },
        slideDecks: {
          mustMatch: [/patient-assessment evidence/i, /clinical care decision/i],
          mustMatchAny: [[/patient-care case/i, /SBAR handoff/i]],
        },
        assignments: {
          mustMatch: [/patient-assessment evidence/i, /clinical judgment and care planning/i],
        },
        rubrics: {
          mustMatch: [/patient-assessment evidence/i],
        },
        discussions: {
          mustMatch: [/patient-assessment evidence/i, /clinical care decision/i],
        },
        quizBank: {
          mustMatch: [/patient-assessment evidence/i, /clinical care decision/i],
        },
        studyGuides: {
          mustMatch: [/patient-assessment evidence/i, /clinical care decision/i],
        },
        courseFaq: {
          mustMatch: [/patient-assessment evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-clinical-placement-8',
    label: 'Curated clinical placement practicum expectation sample',
    project: CLINICAL_PLACEMENT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: CLINICAL_PLACEMENT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'clinical-placement-practicum',
      artifactGenres: Array(8).fill('clinical-placement-evidence'),
      packageMustMatch: [
        /clinical placement/i,
        /supervised clinical evidence/i,
        /clinical placement decision/i,
        /preceptor feedback/i,
        /confidentiality/i,
        /scope of practice/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/clinical placement practice/i, /supervised clinical evidence/i],
            [/preceptor feedback/i, /scope of practice/i, /patient safety/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement decision/i],
        },
        slideDecks: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement decision/i],
          mustMatchAny: [[/patient-care placement scenario/i, /preceptor feedback/i]],
        },
        assignments: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement practice/i],
        },
        rubrics: {
          mustMatch: [/supervised clinical evidence/i],
        },
        discussions: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement decision/i],
        },
        quizBank: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement decision/i],
        },
        studyGuides: {
          mustMatch: [/supervised clinical evidence/i, /clinical placement decision/i],
        },
        courseFaq: {
          mustMatch: [/supervised clinical evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-beginning-spanish-8',
    label: 'Curated beginning Spanish communicative practice expectation sample',
    project: BEGINNING_SPANISH_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: BEGINNING_SPANISH_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'world-language',
      artifactGenres: Array(8).fill('language-performance'),
      packageMustMatch: [
        /target-language/i,
        /interpersonal dialogue/i,
        /proficiency task/i,
        /language-use evidence/i,
        /communication choice/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Beginning Spanish Communicative Practice/i, /target-language/i],
            [/interpersonal dialogue/i, /presentational speaking/i, /cultural comparison/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/language-use evidence/i, /communication choice/i],
        },
        slideDecks: {
          mustMatch: [/language-use evidence/i, /communication choice/i],
          mustMatchAny: [[/communicative scenario/i, /target-language/i]],
        },
        assignments: {
          mustMatch: [/language-use evidence/i, /communicative Spanish language learning/i],
        },
        rubrics: {
          mustMatch: [/language-use evidence/i],
        },
        discussions: {
          mustMatch: [/language-use evidence/i, /communication choice/i],
        },
        quizBank: {
          mustMatch: [/language-use evidence/i, /communication choice/i],
        },
        studyGuides: {
          mustMatch: [/language-use evidence/i, /communication choice/i],
        },
        courseFaq: {
          mustMatch: [/language-use evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-field-placement-8',
    label: 'Curated human services field placement expectation sample',
    project: FIELD_PLACEMENT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: FIELD_PLACEMENT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'field-applied',
      artifactGenres: Array(8).fill('field-evidence'),
      packageMustMatch: [
        /field placement/i,
        /site evidence/i,
        /stakeholder interview/i,
        /field evidence/i,
        /placement decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Human Services Field Placement Seminar/i, /site evidence/i],
            [/stakeholder interview/i, /supervision note/i, /professional boundary/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/field evidence/i, /placement decision/i],
        },
        slideDecks: {
          mustMatch: [/field evidence/i, /placement decision/i],
          mustMatchAny: [[/site-based practice scenario/i, /stakeholder interview/i]],
        },
        assignments: {
          mustMatch: [/field evidence/i, /field placement practice/i],
        },
        rubrics: {
          mustMatch: [/field evidence/i],
        },
        discussions: {
          mustMatch: [/field evidence/i, /placement decision/i],
        },
        quizBank: {
          mustMatch: [/field evidence/i, /placement decision/i],
        },
        studyGuides: {
          mustMatch: [/field evidence/i, /placement decision/i],
        },
        courseFaq: {
          mustMatch: [/field evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-biology-lab-8',
    label: 'Curated biology laboratory methods expectation sample',
    project: BIOLOGY_LAB_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: BIOLOGY_LAB_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'applied-lab',
      artifactGenres: Array(8).fill('lab-report'),
      packageMustMatch: [
        /lab safety/i,
        /lab notebook/i,
        /experimental variable|variable-control/i,
        /lab evidence/i,
        /experimental decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Biology Laboratory Methods/i, /lab safety/i],
            [/aseptic technique/i, /lab notebook/i, /protocol deviation/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/lab evidence/i, /experimental decision/i],
        },
        slideDecks: {
          mustMatch: [/lab evidence/i, /experimental decision/i],
          mustMatchAny: [[/wet-lab scenario/i, /lab notebook/i]],
        },
        assignments: {
          mustMatch: [/lab evidence/i, /biology laboratory methods/i],
        },
        rubrics: {
          mustMatch: [/lab evidence/i],
        },
        discussions: {
          mustMatch: [/lab evidence/i, /experimental decision/i],
        },
        quizBank: {
          mustMatch: [/lab evidence/i, /experimental decision/i],
        },
        studyGuides: {
          mustMatch: [/lab evidence/i, /experimental decision/i],
        },
        courseFaq: {
          mustMatch: [/lab evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-multi-section-seminar-8',
    label: 'Curated multi-section comparative literature seminar expectation sample',
    project: MULTI_SECTION_SEMINAR_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: MULTI_SECTION_SEMINAR_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'interpretive-humanities',
      artifactGenres: Array(8).fill('close-reading-analysis'),
      packageMustMatch: [
        /close reading/i,
        /historical context/i,
        /translation choice/i,
        /literary evidence/i,
        /interpretive decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Comparative Literature Seminar/i, /close reading/i],
            [/translation choice/i, /historical context/i, /critical lens/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/literary evidence/i, /interpretive decision/i],
        },
        slideDecks: {
          mustMatch: [/literary evidence/i, /interpretive decision/i],
          mustMatchAny: [[/comparative text case/i, /translation choice/i]],
        },
        assignments: {
          mustMatch: [/literary evidence/i, /comparative literature seminar/i],
        },
        rubrics: {
          mustMatch: [/literary evidence/i],
        },
        discussions: {
          mustMatch: [/literary evidence/i, /interpretive decision/i],
        },
        quizBank: {
          mustMatch: [/literary evidence/i, /interpretive decision/i],
        },
        studyGuides: {
          mustMatch: [/literary evidence/i, /interpretive decision/i],
        },
        courseFaq: {
          mustMatch: [/literary evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-online-writing-workshop-8',
    label: 'Curated online academic writing workshop expectation sample',
    project: ONLINE_WRITING_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: ONLINE_WRITING_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'online-hybrid',
      artifactGenres: Array(8).fill('memo-brief'),
      packageMustMatch: [
        /asynchronous discussion/i,
        /LMS checkpoint/i,
        /peer annotation/i,
        /online writing evidence/i,
        /revision decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Online Academic Writing Workshop/i, /asynchronous discussion/i],
            [/LMS checkpoint/i, /peer annotation/i, /version history/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/online writing evidence/i, /revision decision/i],
        },
        slideDecks: {
          mustMatch: [/online writing evidence/i, /revision decision/i],
          mustMatchAny: [[/asynchronous draft case/i, /LMS checkpoint/i]],
        },
        assignments: {
          mustMatch: [/online writing evidence/i, /online academic writing workshop/i],
        },
        rubrics: {
          mustMatch: [/online writing evidence/i],
        },
        discussions: {
          mustMatch: [/online writing evidence/i, /revision decision/i],
        },
        quizBank: {
          mustMatch: [/online writing evidence/i, /revision decision/i],
        },
        studyGuides: {
          mustMatch: [/online writing evidence/i, /revision decision/i],
        },
        courseFaq: {
          mustMatch: [/online writing evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-quantitative-problem-set-8',
    label: 'Curated quantitative problem-set expectation sample',
    project: QUANTITATIVE_PROBLEM_SET_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: QUANTITATIVE_PROBLEM_SET_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'weekly-applied-seminar',
      artifactGenres: Array(8).fill('problem-set'),
      packageMustMatch: [
        /worked solution/i,
        /equation setup/i,
        /solution check/i,
        /worked-solution evidence/i,
        /solution strategy decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/College Algebra Problem Solving/i, /worked solution/i],
            [/equation setup/i, /graph annotation/i, /error analysis/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/worked-solution evidence/i, /solution strategy decision/i],
        },
        slideDecks: {
          mustMatch: [/worked-solution evidence/i, /solution strategy decision/i],
          mustMatchAny: [[/worked algebra example/i, /equation setup/i]],
        },
        assignments: {
          mustMatch: [/worked-solution evidence/i, /college algebra problem solving/i],
        },
        rubrics: {
          mustMatch: [/worked-solution evidence/i],
        },
        discussions: {
          mustMatch: [/worked-solution evidence/i, /solution strategy decision/i],
        },
        quizBank: {
          mustMatch: [/worked-solution evidence/i, /solution strategy decision/i],
        },
        studyGuides: {
          mustMatch: [/worked-solution evidence/i, /solution strategy decision/i],
        },
        courseFaq: {
          mustMatch: [/worked-solution evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-statistics-inference-8',
    label: 'Curated statistical inference expectation sample',
    project: STATISTICS_INFERENCE_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: STATISTICS_INFERENCE_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'statistics-inference',
      artifactGenres: Array(8).fill('statistical-inference-report'),
      packageMustMatch: [
        /statistical evidence/i,
        /confidence interval/i,
        /hypothesis test/i,
        /p[-\s]?value|p value/i,
        /inference decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Introduction to Statistical Inference/i, /confidence interval/i],
            [/hypothesis test/i, /p[-\s]?value|p value/i, /assumption check/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/statistical evidence/i, /inference decision/i],
        },
        slideDecks: {
          mustMatch: [/statistical evidence/i, /inference decision/i],
          mustMatchAny: [[/confidence interval/i, /hypothesis test/i]],
        },
        assignments: {
          mustMatch: [/statistical inference/i, /statistical evidence/i],
        },
        rubrics: {
          mustMatch: [/statistical evidence/i],
        },
        discussions: {
          mustMatch: [/statistical evidence/i, /inference decision/i],
        },
        quizBank: {
          mustMatch: [/statistical evidence/i, /inference decision/i],
        },
        studyGuides: {
          mustMatch: [/statistical evidence/i, /inference decision/i],
        },
        courseFaq: {
          mustMatch: [/statistical evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-accounting-finance-8',
    label: 'Curated accounting and finance analysis expectation sample',
    project: ACCOUNTING_FINANCE_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: ACCOUNTING_FINANCE_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'accounting-finance-analysis',
      artifactGenres: Array(8).fill('financial-analysis-report'),
      packageMustMatch: [
        /financial evidence/i,
        /journal entry/i,
        /statement effect/i,
        /ratio analysis/i,
        /financial decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Financial Accounting and Statement Analysis/i, /journal entry/i],
            [/balance sheet/i, /income statement/i, /cash-flow/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/financial evidence/i, /financial decision/i],
        },
        slideDecks: {
          mustMatch: [/financial evidence/i, /financial decision/i],
          mustMatchAny: [[/statement effect/i, /ratio analysis/i]],
        },
        assignments: {
          mustMatch: [/financial evidence/i, /accounting and finance analysis/i],
        },
        rubrics: {
          mustMatch: [/financial evidence/i],
        },
        discussions: {
          mustMatch: [/financial evidence/i, /financial decision/i],
        },
        quizBank: {
          mustMatch: [/financial evidence/i, /financial decision/i],
        },
        studyGuides: {
          mustMatch: [/financial evidence/i, /financial decision/i],
        },
        courseFaq: {
          mustMatch: [/financial evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-policy-analysis-8',
    label: 'Curated public policy analysis expectation sample',
    project: POLICY_ANALYSIS_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: POLICY_ANALYSIS_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'policy-analysis',
      artifactGenres: Array(8).fill('policy-brief'),
      packageMustMatch: [
        /policy evidence/i,
        /policy memo/i,
        /stakeholder analysis/i,
        /equity analysis/i,
        /implementation risk/i,
        /policy decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Public Policy Analysis and Implementation/i, /policy memo/i],
            [/stakeholder/i, /equity/i, /feasibility/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/policy evidence/i, /policy decision/i],
        },
        slideDecks: {
          mustMatch: [/policy evidence/i, /policy decision/i],
          mustMatchAny: [[/stakeholder analysis/i, /implementation risk/i]],
        },
        assignments: {
          mustMatch: [/policy evidence/i, /public policy analysis/i],
        },
        rubrics: {
          mustMatch: [/policy evidence/i],
        },
        discussions: {
          mustMatch: [/policy evidence/i, /policy decision/i],
        },
        quizBank: {
          mustMatch: [/policy evidence/i, /policy decision/i],
        },
        studyGuides: {
          mustMatch: [/policy evidence/i, /policy decision/i],
        },
        courseFaq: {
          mustMatch: [/policy evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-economics-analysis-8',
    label: 'Curated economics analysis expectation sample',
    project: ECONOMICS_ANALYSIS_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: ECONOMICS_ANALYSIS_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'economics-analysis',
      artifactGenres: Array(8).fill('economic-analysis-brief'),
      packageMustMatch: [
        /economic evidence/i,
        /supply and demand/i,
        /market equilibrium/i,
        /elasticity/i,
        /welfare analysis|consumer surplus|deadweight loss/i,
        /economic decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Principles of Microeconomics and Market Analysis/i, /supply and demand/i],
            [/elasticity/i, /consumer surplus|producer surplus/i, /tax incidence/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/economic evidence/i, /economic decision/i],
        },
        slideDecks: {
          mustMatch: [/economic evidence/i, /economic decision/i],
          mustMatchAny: [[/market analysis scenario/i, /supply and demand/i]],
        },
        assignments: {
          mustMatch: [/economic evidence/i, /economics analysis/i],
        },
        rubrics: {
          mustMatch: [/economic evidence/i],
        },
        discussions: {
          mustMatch: [/economic evidence/i, /economic decision/i],
        },
        quizBank: {
          mustMatch: [/economic evidence/i, /economic decision/i],
        },
        studyGuides: {
          mustMatch: [/economic evidence/i, /economic decision/i],
        },
        courseFaq: {
          mustMatch: [/economic evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-ethics-argument-8',
    label: 'Curated ethics argumentation expectation sample',
    project: ETHICS_ARGUMENT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: ETHICS_ARGUMENT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'ethics-argumentation',
      artifactGenres: Array(8).fill('ethical-argument-brief'),
      packageMustMatch: [
        /moral argument evidence/i,
        /normative framework/i,
        /argument map/i,
        /objection/i,
        /reply/i,
        /moral decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Applied Ethics and Moral Reasoning/i, /normative framework/i],
            [/argument map/i, /objection/i, /reply/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/moral argument evidence/i, /moral decision/i],
        },
        slideDecks: {
          mustMatch: [/moral argument evidence/i, /moral decision/i],
          mustMatchAny: [[/ethical dilemma scenario/i, /argument map/i]],
        },
        assignments: {
          mustMatch: [/moral argument evidence/i, /ethics argumentation/i],
        },
        rubrics: {
          mustMatch: [/moral argument evidence/i],
        },
        discussions: {
          mustMatch: [/moral argument evidence/i, /moral decision/i],
        },
        quizBank: {
          mustMatch: [/moral argument evidence/i, /moral decision/i],
        },
        studyGuides: {
          mustMatch: [/moral argument evidence/i, /moral decision/i],
        },
        courseFaq: {
          mustMatch: [/moral argument evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-proof-seminar-8',
    label: 'Curated proof-based mathematics expectation sample',
    project: PROOF_SEMINAR_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: PROOF_SEMINAR_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'proof-seminar',
      artifactGenres: Array(8).fill('proof-portfolio'),
      packageMustMatch: [
        /proof evidence/i,
        /theorem proof/i,
        /definition use/i,
        /counterexample/i,
        /proof-strategy decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Real Analysis Proof Seminar/i, /theorem proof/i],
            [/definition use/i, /counterexample/i, /proof revision/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/proof evidence/i, /proof-strategy decision/i],
        },
        slideDecks: {
          mustMatch: [/proof evidence/i, /proof-strategy decision/i],
          mustMatchAny: [[/theorem proof scenario/i, /counterexample/i]],
        },
        assignments: {
          mustMatch: [/proof evidence/i, /proof-based mathematics seminar/i],
        },
        rubrics: {
          mustMatch: [/proof evidence/i],
        },
        discussions: {
          mustMatch: [/proof evidence/i, /proof-strategy decision/i],
        },
        quizBank: {
          mustMatch: [/proof evidence/i, /proof-strategy decision/i],
        },
        studyGuides: {
          mustMatch: [/proof evidence/i, /proof-strategy decision/i],
        },
        courseFaq: {
          mustMatch: [/proof evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-lecture-exam-8',
    label: 'Curated lecture-exam retrieval expectation sample',
    project: LECTURE_EXAM_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: LECTURE_EXAM_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'lecture-exam',
      artifactGenres: Array(8).fill('checkpoint-response'),
      packageMustMatch: [
        /retrieval practice/i,
        /concept check/i,
        /misconception repair/i,
        /exam blueprint/i,
        /concept-check evidence/i,
        /exam-readiness decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Introduction to Psychology Lecture/i, /exam blueprint/i],
            [/retrieval practice/i, /misconception repair/i, /practice quiz/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/concept-check evidence/i, /exam-readiness decision/i],
        },
        slideDecks: {
          mustMatch: [/concept-check evidence/i, /exam-readiness decision/i],
          mustMatchAny: [[/lecture concept example/i, /concept check/i]],
        },
        assignments: {
          mustMatch: [/concept-check evidence/i, /introductory psychology lecture/i],
        },
        rubrics: {
          mustMatch: [/concept-check evidence/i],
        },
        discussions: {
          mustMatch: [/concept-check evidence/i, /exam-readiness decision/i],
        },
        quizBank: {
          mustMatch: [/concept-check evidence/i, /exam-readiness decision/i],
        },
        studyGuides: {
          mustMatch: [/concept-check evidence/i, /exam-readiness decision/i],
        },
        courseFaq: {
          mustMatch: [/concept-check evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-capstone-project-8',
    label: 'Curated capstone project expectation sample',
    project: CAPSTONE_PROJECT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: CAPSTONE_PROJECT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'capstone-project',
      artifactGenres: Array(8).fill('capstone-project'),
      packageMustMatch: [
        /project charter/i,
        /sponsor constraint/i,
        /milestone evidence/i,
        /project evidence/i,
        /capstone decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Product Innovation Capstone/i, /project charter/i],
            [/sponsor constraint/i, /portfolio defense/i, /final showcase/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/project evidence/i, /capstone decision/i],
        },
        slideDecks: {
          mustMatch: [/project evidence/i, /capstone decision/i],
          mustMatchAny: [[/client project scenario/i, /milestone evidence/i]],
        },
        assignments: {
          mustMatch: [/project evidence/i, /capstone project integration/i],
        },
        rubrics: {
          mustMatch: [/project evidence/i],
        },
        discussions: {
          mustMatch: [/project evidence/i, /capstone decision/i],
        },
        quizBank: {
          mustMatch: [/project evidence/i, /capstone decision/i],
        },
        studyGuides: {
          mustMatch: [/project evidence/i, /capstone decision/i],
        },
        courseFaq: {
          mustMatch: [/project evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-competency-assessment-8',
    label: 'Curated competency-based assessment expectation sample',
    project: COMPETENCY_ASSESSMENT_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: COMPETENCY_ASSESSMENT_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'competency-based',
      artifactGenres: Array(8).fill('competency-evidence'),
      packageMustMatch: [
        /competency evidence/i,
        /benchmark descriptor/i,
        /proficiency decision/i,
        /remediation plan/i,
        /standards-aligned performance task|program standard/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Teacher Education Competency Assessment/i, /program standard/i],
            [/benchmark descriptor/i, /proficiency decision/i, /accreditation/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/competency evidence/i, /proficiency decision/i],
        },
        slideDecks: {
          mustMatch: [/competency evidence/i, /proficiency decision/i],
          mustMatchAny: [[/standards-aligned performance task/i, /benchmark descriptor/i]],
        },
        assignments: {
          mustMatch: [/competency evidence/i, /competency-based assessment/i],
        },
        rubrics: {
          mustMatch: [/competency evidence/i],
        },
        discussions: {
          mustMatch: [/competency evidence/i, /proficiency decision/i],
        },
        quizBank: {
          mustMatch: [/competency evidence/i, /proficiency decision/i],
        },
        studyGuides: {
          mustMatch: [/competency evidence/i, /proficiency decision/i],
        },
        courseFaq: {
          mustMatch: [/competency evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-performing-arts-8',
    label: 'Curated performing arts rehearsal expectation sample',
    project: PERFORMING_ARTS_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: PERFORMING_ARTS_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'performing-arts',
      artifactGenres: Array(8).fill('performance-rehearsal'),
      packageMustMatch: [
        /performance evidence/i,
        /rehearsal note/i,
        /director note/i,
        /critique uptake/i,
        /rehearsal decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Acting Studio and Performance Practice/i, /rehearsal note/i],
            [/director note/i, /ensemble cue/i, /performance recording/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/performance evidence/i, /rehearsal decision/i],
        },
        slideDecks: {
          mustMatch: [/performance evidence/i, /rehearsal decision/i],
          mustMatchAny: [[/rehearsal scenario/i, /run-through/i]],
        },
        assignments: {
          mustMatch: [/performance evidence/i, /performing arts rehearsal/i],
        },
        rubrics: {
          mustMatch: [/performance evidence/i],
        },
        discussions: {
          mustMatch: [/performance evidence/i, /rehearsal decision/i],
        },
        quizBank: {
          mustMatch: [/performance evidence/i, /rehearsal decision/i],
        },
        studyGuides: {
          mustMatch: [/performance evidence/i, /rehearsal decision/i],
        },
        courseFaq: {
          mustMatch: [/performance evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-programming-lab-8',
    label: 'Curated software programming lab expectation sample',
    project: PROGRAMMING_LAB_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: PROGRAMMING_LAB_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'programming-lab',
      artifactGenres: Array(8).fill('code-lab'),
      packageMustMatch: [
        /code evidence/i,
        /unit test/i,
        /debugging trace/i,
        /repository commit/i,
        /implementation decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Software Engineering Code Lab/i, /repository commit/i],
            [/unit test/i, /debugging trace/i, /code review/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/code evidence/i, /implementation decision/i],
        },
        slideDecks: {
          mustMatch: [/code evidence/i, /implementation decision/i],
          mustMatchAny: [[/code review scenario/i, /unit test/i]],
        },
        assignments: {
          mustMatch: [/code evidence/i, /software programming lab/i],
        },
        rubrics: {
          mustMatch: [/code evidence/i],
        },
        discussions: {
          mustMatch: [/code evidence/i, /implementation decision/i],
        },
        quizBank: {
          mustMatch: [/code evidence/i, /implementation decision/i],
        },
        studyGuides: {
          mustMatch: [/code evidence/i, /implementation decision/i],
        },
        courseFaq: {
          mustMatch: [/code evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-data-science-lab-8',
    label: 'Curated data science analytics lab expectation sample',
    project: DATA_SCIENCE_LAB_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: DATA_SCIENCE_LAB_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'data-science-lab',
      artifactGenres: Array(8).fill('data-science-notebook'),
      packageMustMatch: [
        /data-model evidence/i,
        /dataset provenance/i,
        /analytics notebook/i,
        /validation metric/i,
        /analytic decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Data Science Analytics Lab/i, /dataset provenance/i],
            [/data-cleaning log/i, /validation metric/i, /bias audit/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/data-model evidence/i, /analytic decision/i],
        },
        slideDecks: {
          mustMatch: [/data-model evidence/i, /analytic decision/i],
          mustMatchAny: [[/analytics notebook scenario/i, /validation metric/i]],
        },
        assignments: {
          mustMatch: [/data-model evidence/i, /data science analytics lab/i],
        },
        rubrics: {
          mustMatch: [/data-model evidence/i],
        },
        discussions: {
          mustMatch: [/data-model evidence/i, /analytic decision/i],
        },
        quizBank: {
          mustMatch: [/data-model evidence/i, /analytic decision/i],
        },
        studyGuides: {
          mustMatch: [/data-model evidence/i, /analytic decision/i],
        },
        courseFaq: {
          mustMatch: [/data-model evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-engineering-design-8',
    label: 'Curated engineering design build-test expectation sample',
    project: ENGINEERING_DESIGN_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: ENGINEERING_DESIGN_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'engineering-design-lab',
      artifactGenres: Array(8).fill('engineering-design-test'),
      packageMustMatch: [
        /engineering test evidence/i,
        /design requirement/i,
        /prototype test/i,
        /failure analysis/i,
        /design-verification decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Engineering Design Build Test Lab/i, /design requirement/i],
            [/prototype test/i, /failure analysis/i, /verification report/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/engineering test evidence/i, /design-verification decision/i],
        },
        slideDecks: {
          mustMatch: [/engineering test evidence/i, /design-verification decision/i],
          mustMatchAny: [[/prototype test scenario/i, /failure analysis/i]],
        },
        assignments: {
          mustMatch: [/engineering test evidence/i, /engineering design test lab/i],
        },
        rubrics: {
          mustMatch: [/engineering test evidence/i],
        },
        discussions: {
          mustMatch: [/engineering test evidence/i, /design-verification decision/i],
        },
        quizBank: {
          mustMatch: [/engineering test evidence/i, /design-verification decision/i],
        },
        studyGuides: {
          mustMatch: [/engineering test evidence/i, /design-verification decision/i],
        },
        courseFaq: {
          mustMatch: [/engineering test evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-creative-writing-8',
    label: 'Curated creative writing workshop expectation sample',
    project: CREATIVE_WRITING_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: CREATIVE_WRITING_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'creative-studio',
      artifactGenres: Array(8).fill('creative-portfolio'),
      packageMustMatch: [
        /craft evidence/i,
        /workshop critique/i,
        /revision portfolio/i,
        /artist statement/i,
        /revision decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Creative Writing Workshop/i, /workshop critique/i],
            [/artist statement/i, /revision portfolio/i, /final reading/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/craft evidence/i, /revision decision/i],
        },
        slideDecks: {
          mustMatch: [/craft evidence/i, /revision decision/i],
          mustMatchAny: [[/workshop draft/i, /craft choice/i]],
        },
        assignments: {
          mustMatch: [/craft evidence/i, /creative arts workshop/i],
        },
        rubrics: {
          mustMatch: [/craft evidence/i],
        },
        discussions: {
          mustMatch: [/craft evidence/i, /revision decision/i],
        },
        quizBank: {
          mustMatch: [/craft evidence/i, /revision decision/i],
        },
        studyGuides: {
          mustMatch: [/craft evidence/i, /revision decision/i],
        },
        courseFaq: {
          mustMatch: [/craft evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-business-strategy-case-8',
    label: 'Curated business strategy case-method expectation sample',
    project: BUSINESS_STRATEGY_CASE_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: BUSINESS_CASE_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'case-method',
      artifactGenres: Array(8).fill('case-analysis'),
      packageMustMatch: [
        /case evidence/i,
        /decision criteria/i,
        /stakeholder tradeoff/i,
        /strategic recommendation/i,
        /implementation risk/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Business Strategy Case Method/i, /case evidence/i],
            [/executive memo/i, /stakeholder tradeoff/i, /implementation risk/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/case evidence/i, /strategic recommendation/i],
        },
        slideDecks: {
          mustMatch: [/case evidence/i, /strategic recommendation/i],
          mustMatchAny: [[/business case scenario/i, /decision criteria/i]],
        },
        assignments: {
          mustMatch: [/case evidence/i, /business strategy case method/i],
        },
        rubrics: {
          mustMatch: [/case evidence/i],
        },
        discussions: {
          mustMatch: [/case evidence/i, /strategic recommendation/i],
        },
        quizBank: {
          mustMatch: [/case evidence/i, /strategic recommendation/i],
        },
        studyGuides: {
          mustMatch: [/case evidence/i, /strategic recommendation/i],
        },
        courseFaq: {
          mustMatch: [/case evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-constitutional-law-8',
    label: 'Curated constitutional law doctrinal expectation sample',
    project: CONSTITUTIONAL_LAW_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: CONSTITUTIONAL_LAW_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'legal-doctrinal',
      artifactGenres: Array(8).fill('legal-analysis'),
      packageMustMatch: [
        /doctrinal evidence/i,
        /case brief/i,
        /holding and rationale|holding/i,
        /rule statement/i,
        /legal conclusion/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Constitutional Law/i, /case brief/i],
            [/IRAC memo/i, /precedent comparison/i, /hypothetical application/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/doctrinal evidence/i, /legal conclusion/i],
        },
        slideDecks: {
          mustMatch: [/doctrinal evidence/i, /legal conclusion/i],
          mustMatchAny: [[/case hypothetical/i, /rule statement/i]],
        },
        assignments: {
          mustMatch: [/doctrinal evidence/i, /legal doctrine and case analysis/i],
        },
        rubrics: {
          mustMatch: [/doctrinal evidence/i],
        },
        discussions: {
          mustMatch: [/doctrinal evidence/i, /legal conclusion/i],
        },
        quizBank: {
          mustMatch: [/doctrinal evidence/i, /legal conclusion/i],
        },
        studyGuides: {
          mustMatch: [/doctrinal evidence/i, /legal conclusion/i],
        },
        courseFaq: {
          mustMatch: [/doctrinal evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-information-literacy-8',
    label: 'Curated information literacy and library research expectation sample',
    project: INFORMATION_LITERACY_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: INFORMATION_LITERACY_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'information-literacy',
      artifactGenres: Array(8).fill('source-evaluation-dossier'),
      packageMustMatch: [
        /source evidence/i,
        /database search/i,
        /search strategy/i,
        /source credibility/i,
        /source-use decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Information Literacy/i, /database search/i],
            [/annotated bibliography/i, /citation trail/i, /synthesis matrix/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/source evidence/i, /source-use decision/i],
        },
        slideDecks: {
          mustMatch: [/source evidence/i, /source-use decision/i],
          mustMatchAny: [[/database search scenario/i, /search strategy/i]],
        },
        assignments: {
          mustMatch: [/source evidence/i, /information literacy and source research/i],
        },
        rubrics: {
          mustMatch: [/source evidence/i],
        },
        discussions: {
          mustMatch: [/source evidence/i, /source-use decision/i],
        },
        quizBank: {
          mustMatch: [/source evidence/i, /source-use decision/i],
        },
        studyGuides: {
          mustMatch: [/source evidence/i, /source-use decision/i],
        },
        courseFaq: {
          mustMatch: [/source evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-teacher-preparation-8',
    label: 'Curated teacher preparation and instructional methods expectation sample',
    project: TEACHER_PREPARATION_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: TEACHER_PREPARATION_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'teacher-preparation',
      artifactGenres: Array(8).fill('teaching-plan-portfolio'),
      packageMustMatch: [
        /classroom evidence/i,
        /lesson plan/i,
        /microteaching/i,
        /student work/i,
        /instructional decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Teaching Methods and Classroom Practice/i, /lesson plan/i],
            [/microteaching/i, /student work analysis/i, /formative assessment/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/classroom evidence/i, /instructional decision/i],
        },
        slideDecks: {
          mustMatch: [/classroom evidence/i, /instructional decision/i],
          mustMatchAny: [[/microteaching lesson scenario/i, /student work/i]],
        },
        assignments: {
          mustMatch: [/classroom evidence/i, /teacher preparation and instructional practice/i],
        },
        rubrics: {
          mustMatch: [/classroom evidence/i],
        },
        discussions: {
          mustMatch: [/classroom evidence/i, /instructional decision/i],
        },
        quizBank: {
          mustMatch: [/classroom evidence/i, /instructional decision/i],
        },
        studyGuides: {
          mustMatch: [/classroom evidence/i, /instructional decision/i],
        },
        courseFaq: {
          mustMatch: [/classroom evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-counseling-practice-8',
    label: 'Curated counseling skills and social-work practice expectation sample',
    project: COUNSELING_PRACTICE_GOLD_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: COUNSELING_PRACTICE_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'counseling-practice',
      artifactGenres: Array(8).fill('case-conceptualization'),
      packageMustMatch: [
        /client-interaction evidence/i,
        /active listening/i,
        /case conceptualization/i,
        /risk assessment|safety plan/i,
        /helping response decision/i,
      ],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      features: {
        syllabus: {
          mustMatchAny: [
            [/Counseling Skills and Social Work Practice/i, /active listening/i],
            [/case conceptualization/i, /risk assessment/i, /referral plan/i],
          ],
        },
        lessonPlans: {
          mustMatch: [/client-interaction evidence/i, /helping response decision/i],
        },
        slideDecks: {
          mustMatch: [/client-interaction evidence/i, /helping response decision/i],
          mustMatchAny: [[/client-conversation scenario/i, /risk assessment/i]],
        },
        assignments: {
          mustMatch: [/client-interaction evidence/i, /counseling and helping-skills practice/i],
        },
        rubrics: {
          mustMatch: [/client-interaction evidence/i],
        },
        discussions: {
          mustMatch: [/client-interaction evidence/i, /helping response decision/i],
        },
        quizBank: {
          mustMatch: [/client-interaction evidence/i, /helping response decision/i],
        },
        studyGuides: {
          mustMatch: [/client-interaction evidence/i, /helping response decision/i],
        },
        courseFaq: {
          mustMatch: [/client-interaction evidence/i],
        },
      },
    },
  },
  {
    id: 'gold-sparse-assessment-resilience-8',
    label: 'Sparse assessment resilience expectation sample',
    project: SPARSE_ASSESSMENT_STRESS_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: RESEARCH_METHODS_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'applied-lab',
      artifactGenres: [
        'memo-brief',
        'literature-synthesis',
        'analysis-log',
        'analysis-log',
        'analysis-log',
        'analysis-log',
        'memo-brief',
        'checkpoint-response',
      ],
      packageMustMatch: [/empirical evidence/i, /method decision/i],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      blueprint: {
        minReviewFlags: 3,
        maxSourceGroundedLessonCount: 7,
        mustHaveReviewSignal: [/Weekly assessment was derived from evaluation\/design notes/i],
      },
    },
  },
  {
    id: 'gold-messy-clinical-resilience-8',
    label: 'Messy clinical import resilience expectation sample',
    project: MESSY_IMPORT_STRESS_PROJECT,
    scope: 8,
    features: PIPELINE_FEATURES,
    enrichment: COMMUNITY_HEALTH_GOLD_ENRICHMENT,
    expectations: {
      minQuality: GOLD_QUALITY_FLOOR,
      courseModality: 'clinical-simulation',
      artifactGenres: [
        'memo-brief',
        'memo-brief',
        'memo-brief',
        'field-evidence',
        'memo-brief',
        'memo-brief',
        'memo-brief',
        'memo-brief',
      ],
      packageMustMatch: [/health equity/i, /implementation evidence/i, /program decision/i],
      packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
      blueprint: {
        minReviewFlags: 3,
        maxSourceGroundedLessonCount: 7,
        mustHaveReviewSignal: [
          /Lesson title was derived from topic or section fields/i,
          /Assessment source contained unfinished language/i,
        ],
      },
    },
  },
];

function scopeCourseMap(courseMap, scope) {
  return {
    ...courseMap,
    lessons: Array.isArray(courseMap?.lessons) ? courseMap.lessons.slice(0, scope) : [],
  };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) out.push(trimmed);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function wordCount(text) {
  return (String(text || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function getFeatureArray(featureId, data) {
  if (!data || typeof data !== 'object') return [];
  const keys = {
    lessonPlans: ['lessonPlans', 'plans'],
    slideDecks: ['decks', 'slideDecks'],
    assignments: ['assignments'],
    rubrics: ['rubrics'],
    discussions: ['discussions'],
    quizBank: ['quizzes', 'quizBank'],
    studyGuides: ['studyGuides', 'guides'],
    courseFaq: ['faqs', 'courseFaq'],
  };
  for (const key of keys[featureId] || []) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function patternLabel(pattern) {
  return pattern instanceof RegExp ? `/${pattern.source}/${pattern.flags}` : String(pattern);
}

function patternMatches(pattern, text) {
  if (pattern instanceof RegExp) return pattern.test(text);
  return String(text || '')
    .toLowerCase()
    .includes(String(pattern || '').toLowerCase());
}

function cleanSignal(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSignal(value) {
  return cleanSignal(value).toLowerCase();
}

function uniqueSignals(values, limit = 80) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(cleanSignal).filter(Boolean)) {
    const key = normalizeSignal(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function countSignalMatches(signals, text) {
  const normalizedText = normalizeSignal(text);
  return signals.filter((signal) => normalizedText.includes(normalizeSignal(signal))).length;
}

function normalizeAuditToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordSet(value, limit = 8) {
  const stopWords = new Set([
    'about',
    'after',
    'against',
    'analysis',
    'apply',
    'before',
    'brief',
    'check',
    'class',
    'course',
    'decision',
    'evidence',
    'explain',
    'lesson',
    'memo',
    'notes',
    'plan',
    'practice',
    'review',
    'student',
    'students',
    'submit',
    'support',
    'using',
    'week',
    'with',
    'work',
  ]);
  const seen = new Set();
  const tokens = [];
  for (const token of normalizeAuditToken(value).split(' ')) {
    if (token.length < 5 || stopWords.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= limit) break;
  }
  return tokens;
}

function tokenOverlap(keywords, text) {
  const normalized = ` ${normalizeAuditToken(text)} `;
  return keywords.filter((token) => normalized.includes(` ${token} `));
}

function hasNormalizedTrace(expected, actual) {
  const expectedText = normalizeAuditToken(expected);
  if (!expectedText) return true;
  return ` ${normalizeAuditToken(actual)} `.includes(` ${expectedText} `);
}

function learnerContextPracticeText(profile = {}) {
  return [profile.learnerRole, profile.evidenceNoun, profile.decisionNoun, profile.coursePerformanceRole]
    .map(cleanSignal)
    .filter(Boolean)
    .join(' ');
}

function learnerContextModalityPattern(primaryMode) {
  const patterns = {
    'clinical-simulation': /\b(clinical|role[-\s]?play|patient|simulation|healthcare|communication)\b/i,
    'clinical-judgment-simulation':
      /\b(clinical judgment|patient assessment|care plan|sbar|patient safety|nursing|clinical care)\b/i,
    'clinical-placement-practicum':
      /\b(clinical placement|preceptor|supervised clinical|clinical site|competency log|scope of practice|confidentiality)\b/i,
    'studio-lab': /\b(design|studio|prototype|critique)\b/i,
    'capstone-project': /\b(capstone|project|sponsor|milestone|portfolio|showcase)\b/i,
    'competency-based': /\b(competency|proficiency|standard|benchmark|calibration|remediation)\b/i,
    'performing-arts': /\b(performance|rehearsal|acting|stage|ensemble|monologue|scene)\b/i,
    'engineering-design-lab': /\b(engineering|requirement|constraint|prototype|test|verification|redesign|failure)\b/i,
    'statistics-inference':
      /\b(statistical|statistics|inference|confidence|hypothesis|p[-\s]?value|assumption|uncertainty)\b/i,
    'accounting-finance-analysis':
      /\b(financial|accounting|statement|journal|ledger|ratio|cash[-\s]?flow|variance|valuation)\b/i,
    'policy-analysis':
      /\b(policy|public|stakeholder|equity|feasibility|implementation|regulatory|governance|impact)\b/i,
    'economics-analysis':
      /\b(economic|economics|market|supply|demand|elasticity|equilibrium|welfare|incentive|surplus)\b/i,
    'ethics-argumentation': /\b(ethics|ethical|moral|argument|framework|objection|reply|judgment|dilemma)\b/i,
    'data-science-lab': /\b(data|analytics|model|validation|notebook|dashboard|bias|analytic)\b/i,
    'programming-lab': /\b(code|programming|software|test|debug|repository|commit|implementation)\b/i,
    'creative-studio': /\b(creative|craft|workshop|draft|revision|portfolio|artist)\b/i,
    'case-method': /\b(case|business|strategy|recommendation|tradeoff|decision)\b/i,
    'legal-doctrinal': /\b(legal|law|doctrine|case|rule|holding|precedent|irac)\b/i,
    'interpretive-humanities': /\b(humanities|literature|interpretive|textual|passage|scene|source)\b/i,
    'lecture-exam': /\b(concept|exam|lecture|retrieval|quiz|misconception)\b/i,
    'proof-seminar': /\b(proof|theorem|definition|counterexample|quantifier|lemma|mathematical)\b/i,
    'world-language': /\b(language|communicative|target|interpersonal|interpretive|presentational|proficiency)\b/i,
    'field-applied': /\b(field|placement|stakeholder|community|implementation|program)\b/i,
    'applied-lab': /\b(research|method|data|empirical|analysis|lab)\b/i,
    'online-hybrid': /\b(online|asynchronous|lms|discussion|remote|virtual)\b/i,
  };
  return patterns[primaryMode] || null;
}

function countPassing(items, predicate) {
  return items.filter((item, index) => {
    try {
      return Boolean(predicate(item, index));
    } catch {
      return false;
    }
  }).length;
}

function buildDimension(id, label, checks) {
  const normalizedChecks = checks.filter(Boolean);
  const passed = normalizedChecks.filter((check) => check.pass).length;
  const total = normalizedChecks.length;
  const score = total > 0 ? Math.round((passed / total) * 10) : 0;
  return {
    id,
    label,
    score,
    passed,
    total,
    checks: normalizedChecks.map((check) => ({ label: check.label, pass: Boolean(check.pass) })),
    missing: normalizedChecks.filter((check) => !check.pass).map((check) => check.label),
  };
}

function makeFinding(severity, featureId, check, message) {
  return {
    severity,
    featureId,
    check,
    message,
  };
}

function addPatternFindings({ findings, featureId, text, expectations = {}, scopeLabel = 'feature' }) {
  for (const pattern of expectations.mustMatch || []) {
    if (!patternMatches(pattern, text)) {
      findings.push(
        makeFinding(
          'blocker',
          featureId,
          'mustMatch',
          `${scopeLabel} is missing required gold phrase ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
  for (const patternGroup of expectations.mustMatchAny || []) {
    if (!patternGroup.some((pattern) => patternMatches(pattern, text))) {
      findings.push(
        makeFinding(
          'blocker',
          featureId,
          'mustMatchAny',
          `${scopeLabel} is missing one of: ${patternGroup.map(patternLabel).join(', ')}.`,
        ),
      );
    }
  }
  for (const pattern of expectations.mustNotMatch || []) {
    if (patternMatches(pattern, text)) {
      findings.push(
        makeFinding(
          'blocker',
          featureId,
          'mustNotMatch',
          `${scopeLabel} contains forbidden publishability phrase ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
}

function allItemsPass(items, predicate) {
  return items.length > 0 && items.every(predicate);
}

function buildShapeFindings(featureId, data, scope) {
  const findings = [];
  const items = getFeatureArray(featureId, data);
  if (PER_LESSON_FEATURES.has(featureId) && items.length !== scope) {
    findings.push(
      makeFinding('blocker', featureId, 'lessonCoverage', `Expected ${scope} lesson item(s), found ${items.length}.`),
    );
  }

  switch (featureId) {
    case 'syllabus': {
      const syllabus = data?.syllabus || {};
      if (!Array.isArray(syllabus.weeklySchedule) || syllabus.weeklySchedule.length !== scope) {
        findings.push(makeFinding('blocker', featureId, 'weeklySchedule', 'Syllabus weekly schedule is incomplete.'));
      }
      if (!Array.isArray(syllabus.assessmentCalendar) || syllabus.assessmentCalendar.length < Math.min(4, scope)) {
        findings.push(makeFinding('blocker', featureId, 'assessmentCalendar', 'Assessment calendar is too thin.'));
      }
      break;
    }
    case 'lessonPlans':
      if (!allItemsPass(items, (item) => Array.isArray(item.outline) && item.outline.length >= 6)) {
        findings.push(
          makeFinding('blocker', featureId, 'outlineDepth', 'Every lesson plan needs a full teachable outline.'),
        );
      }
      if (
        !allItemsPass(
          items,
          (item) =>
            item.readyToTeachSupport?.workedExample &&
            item.readyToTeachSupport?.methodSpecificMiniRubric &&
            item.formativeCheck?.prompt,
        )
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'teacherSupport',
            'Lesson plans need worked examples, mini-rubrics, and formative checks.',
          ),
        );
      }
      break;
    case 'slideDecks':
      if (!allItemsPass(items, (deck) => Array.isArray(deck.slides) && deck.slides.length >= 10)) {
        findings.push(
          makeFinding('blocker', featureId, 'slideDepth', 'Every deck needs at least 10 instructional slides.'),
        );
      }
      if (
        !allItemsPass(items, (deck) =>
          (deck.slides || []).every(
            (slide) => wordCount(slide.notes) >= 35 && (slide.visual?.kind === 'none' || slide.visual?.altText),
          ),
        )
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'speakerNotes',
            'Slides need substantial speaker notes and accessible visual alt text.',
          ),
        );
      }
      if (!allItemsPass(items, hasPurposeAwareSlideVisuals)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'slideVisualPlan',
            'Slide visuals need purpose-aware evidence, artifact, modality, genre, and accessibility plans instead of rotating visual kinds.',
          ),
        );
      }
      break;
    case 'assignments':
      if (
        !allItemsPass(
          items,
          (item) => Array.isArray(item.scaffoldingMilestones) && item.scaffoldingMilestones.length >= 2,
        )
      ) {
        findings.push(
          makeFinding('blocker', featureId, 'scaffolding', 'Assignments need at least two scaffolding milestones.'),
        );
      }
      if (
        !allItemsPass(
          items,
          (item) => Array.isArray(item.highValueSuccessCriteria) && item.highValueSuccessCriteria.length >= 3,
        )
      ) {
        findings.push(
          makeFinding('blocker', featureId, 'successCriteria', 'Assignments need high-value success criteria.'),
        );
      }
      break;
    case 'rubrics':
      if (!allItemsPass(items, (item) => Array.isArray(item.criteria) && item.criteria.length >= 4)) {
        findings.push(makeFinding('blocker', featureId, 'criteriaDepth', 'Rubrics need at least four criteria.'));
      }
      if (
        !allItemsPass(items, (item) =>
          (item.criteria || []).every(
            (criterion) => criterion.exemplary && criterion.proficient && criterion.developing && criterion.beginning,
          ),
        )
      ) {
        findings.push(
          makeFinding('blocker', featureId, 'performanceBands', 'Rubric criteria need four performance bands.'),
        );
      }
      break;
    case 'discussions':
      if (!allItemsPass(items, (item) => Array.isArray(item.followUpProbes) && item.followUpProbes.length >= 5)) {
        findings.push(makeFinding('blocker', featureId, 'followUps', 'Discussions need enough follow-up probes.'));
      }
      if (
        !allItemsPass(
          items,
          (item) => Array.isArray(item.sourceArtifacts) && item.sourceArtifacts.length >= 2 && item.guidelines,
        )
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'facilitation',
            'Discussions need source artifacts and participation guidelines.',
          ),
        );
      }
      if (!allItemsPass(items, hasDiscussionProtocolProfile)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'discussionProtocol',
            'Discussions need a modality- and artifact-genre-specific protocol instead of a rotating format template.',
          ),
        );
      }
      break;
    case 'quizBank':
      if (
        !allItemsPass(items, (quiz) => {
          const types = new Set((quiz.questions || []).map((question) => question.type));
          return types.has('multiple_choice') && types.has('short_answer') && types.has('essay');
        })
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'questionVariety',
            'Each quiz needs multiple-choice, short-answer, and essay items.',
          ),
        );
      }
      if (
        !allItemsPass(items, (quiz) =>
          (quiz.questions || []).every((question) => question.explanation || question.scoringGuidance),
        )
      ) {
        findings.push(
          makeFinding('blocker', featureId, 'answerSupport', 'Quiz questions need explanations or scoring guidance.'),
        );
      }
      if (!allItemsPass(items, hasSourceGroundedQuizPlan)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'sourceGroundedQuizPlan',
            'Quiz questions need a source-grounded Bloom and objective plan instead of a fixed Bloom sequence.',
          ),
        );
      }
      break;
    case 'studyGuides':
      if (
        !allItemsPass(
          items,
          (item) => Array.isArray(item.commonMisconceptions) && item.commonMisconceptions.length >= 2,
        )
      ) {
        findings.push(makeFinding('blocker', featureId, 'misconceptions', 'Study guides need misconception support.'));
      }
      if (!allItemsPass(items, (item) => Array.isArray(item.reviewQuestions) && item.reviewQuestions.length >= 3)) {
        findings.push(
          makeFinding('blocker', featureId, 'reviewQuestions', 'Study guides need enough review questions.'),
        );
      }
      break;
    case 'courseFaq':
      if (!allItemsPass(items, (item) => Array.isArray(item.qs) && item.qs.length >= 5)) {
        findings.push(
          makeFinding('blocker', featureId, 'faqDepth', 'Course FAQ needs at least five questions per lesson.'),
        );
      }
      break;
    default:
      break;
  }

  return findings;
}

function summarizeFeatureStatus(findings) {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'blocked';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warnings';
  return 'pass';
}

function minQualityForCompiled({ runtime, compiledFeatures, compiled }) {
  const values = compiledFeatures
    .map((featureId) => runtime.computeAvgScore(runtime.scoreHeuristic(featureId, compiled[featureId])))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function mergeFeatureExpectations(globalExpectations = {}, featureId) {
  return {
    minQuality: globalExpectations.minQuality ?? GOLD_QUALITY_FLOOR,
    mustNotMatch: globalExpectations.packageMustNotMatch || [],
    ...(globalExpectations.features?.[featureId] || {}),
  };
}

function auditBlueprintMaturity(blueprint, scope, expectedLens = {}) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  if (lessons.length !== scope) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'lessonCoverage',
        `Expected ${scope} blueprint lesson(s), found ${lessons.length}.`,
      ),
    );
  }
  if (!blueprint?.courseArc?.throughline || !Array.isArray(blueprint?.courseArc?.stages)) {
    findings.push(makeFinding('blocker', 'blueprint', 'courseArc', 'Blueprint is missing a course arc throughline.'));
  }
  if (
    blueprint?.conceptDependencyGraph?.status !== 'sequenced' ||
    !Array.isArray(blueprint?.conceptDependencyGraph?.nodes) ||
    blueprint.conceptDependencyGraph.nodes.length !== scope ||
    !Array.isArray(blueprint?.conceptDependencyGraph?.practiceRows) ||
    blueprint.conceptDependencyGraph.practiceRows.length !== scope ||
    (scope > 1 &&
      (!Array.isArray(blueprint?.conceptDependencyGraph?.edges) ||
        blueprint.conceptDependencyGraph.edges.length < scope - 1)) ||
    !blueprint.conceptDependencyGraph?.conceptThread
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'conceptDependencyGraph',
        'Blueprint is missing concept dependency graph and practice progression evidence.',
      ),
    );
  }
  if (
    blueprint?.masteryEvidenceMap?.status !== 'complete' ||
    !Array.isArray(blueprint?.masteryEvidenceMap?.lessonRows) ||
    blueprint.masteryEvidenceMap.lessonRows.length !== scope ||
    !Array.isArray(blueprint?.masteryEvidenceMap?.checkedStages) ||
    blueprint.masteryEvidenceMap.checkedStages.length < 6 ||
    blueprint.masteryEvidenceMap.missingFieldCount !== 0
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'masteryEvidenceMap',
        'Blueprint is missing a complete mastery-evidence map.',
      ),
    );
  }
  if (
    blueprint?.evidenceResponseMap?.status !== 'complete' ||
    !Array.isArray(blueprint?.evidenceResponseMap?.lessonRows) ||
    blueprint.evidenceResponseMap.lessonRows.length !== scope ||
    !Array.isArray(blueprint?.evidenceResponseMap?.checkedStates) ||
    blueprint.evidenceResponseMap.checkedStates.length < 3 ||
    blueprint.evidenceResponseMap.missingFieldCount !== 0
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'evidenceResponseMap',
        'Blueprint is missing a complete evidence-response decision map.',
      ),
    );
  }
  if (
    !blueprint?.courseWorkload?.averagePerLessonMinutes ||
    !blueprint?.courseWorkload?.averagePlannedClassMinutes ||
    !blueprint?.courseWorkload?.timingStatus
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'workload', 'Blueprint is missing course-level workload estimates.'),
    );
  }
  if (
    !blueprint?.learnerContextProfile?.learnerRole ||
    !blueprint?.learnerContextProfile?.evidenceNoun ||
    !blueprint?.learnerContextProfile?.decisionNoun ||
    !blueprint?.learnerContextProfile?.coursePerformanceRole ||
    !Array.isArray(blueprint?.learnerContextProfile?.supportAssumptions) ||
    blueprint.learnerContextProfile.supportAssumptions.length === 0 ||
    !Array.isArray(blueprint?.learnerContextProfile?.participationModes) ||
    blueprint.learnerContextProfile.participationModes.length === 0
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'learnerContextProfile', 'Blueprint is missing learner-context profile.'),
    );
  }
  const expectedLearnerSignals = ['learnerRole', 'evidenceNoun', 'decisionNoun']
    .map((key) => cleanSignal(expectedLens?.[key]))
    .filter(Boolean);
  if (expectedLearnerSignals.length > 0) {
    const learnerContextText = collectStrings(blueprint?.learnerContextProfile || {}).join(' ');
    const missingSignals = expectedLearnerSignals.filter((signal) => !hasNormalizedTrace(signal, learnerContextText));
    if (missingSignals.length > 0) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'learnerContextLens',
          `Blueprint learner context does not preserve enrichment lens signal(s): ${missingSignals.join(', ')}.`,
        ),
      );
    }
  }
  const enrichmentTeachingMoves = blueprint?.enrichment?.teachingMoves || {};
  const missingTeachingMoveKeys = REQUIRED_TEACHING_MOVE_KEYS.filter(
    (key) => !cleanSignal(enrichmentTeachingMoves[key]),
  );
  if (missingTeachingMoveKeys.length > 0) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'enrichmentTeachingMoves',
        `Blueprint enrichment is missing reusable teaching moves: ${missingTeachingMoveKeys.join(', ')}.`,
      ),
    );
  }
  const primaryMode = blueprint?.courseModalityProfile?.primaryMode || '';
  const learnerModalityPattern = learnerContextModalityPattern(primaryMode);
  if (
    learnerModalityPattern &&
    !learnerModalityPattern.test(learnerContextPracticeText(blueprint?.learnerContextProfile || {}))
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'learnerContextModalityLens',
        `Blueprint learner context does not preserve the ${primaryMode} practice lens.`,
      ),
    );
  }
  if (
    !blueprint?.courseModalityProfile?.primaryMode ||
    !blueprint?.courseModalityProfile?.sessionPattern ||
    !blueprint?.courseModalityProfile?.interactionPattern ||
    !blueprint?.courseModalityProfile?.artifactEnvironment ||
    !blueprint?.courseModalityProfile?.teachingPattern?.signaturePractice ||
    !blueprint?.courseModalityProfile?.teachingPattern?.evidenceRoutine ||
    !blueprint?.courseModalityProfile?.teachingPattern?.feedbackRoutine ||
    !blueprint?.courseModalityProfile?.teachingPattern?.instructorMove ||
    !Array.isArray(blueprint?.courseModalityProfile?.participationDesign) ||
    blueprint.courseModalityProfile.participationDesign.length === 0
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'courseModalityProfile', 'Blueprint is missing course-modality fit profile.'),
    );
  }
  if (
    !blueprint?.classroomHandoffPlan?.status ||
    !Array.isArray(blueprint?.classroomHandoffPlan?.reviewOrder) ||
    blueprint.classroomHandoffPlan.reviewOrder.length === 0 ||
    !Array.isArray(blueprint?.classroomHandoffPlan?.requiredLocalConfirmations) ||
    blueprint.classroomHandoffPlan.requiredLocalConfirmations.length === 0 ||
    !Array.isArray(blueprint?.classroomHandoffPlan?.lessonReviewOrder) ||
    blueprint.classroomHandoffPlan.lessonReviewOrder.length !== scope ||
    !blueprint.classroomHandoffPlan.publishBoundary
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'classroomHandoffPlan', 'Blueprint is missing classroom handoff plan.'),
    );
  }
  if (
    !blueprint?.sourceRiskRegister?.status ||
    !Array.isArray(blueprint?.sourceRiskRegister?.lessonRows) ||
    blueprint.sourceRiskRegister.lessonRows.length !== scope ||
    !Number.isFinite(blueprint.sourceRiskRegister.highRiskCount) ||
    !Number.isFinite(blueprint.sourceRiskRegister.mediumRiskCount) ||
    !blueprint.sourceRiskRegister.riskPolicy ||
    blueprint.sourceRiskRegister.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.riskLevel ||
        !Array.isArray(row.reviewFocus) ||
        row.reviewFocus.length === 0,
    )
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'sourceRiskRegister', 'Blueprint is missing source-risk register.'),
    );
  }
  if (
    !blueprint?.sourceConflictReport?.status ||
    !Array.isArray(blueprint?.sourceConflictReport?.lessonRows) ||
    blueprint.sourceConflictReport.lessonRows.length !== scope ||
    !Number.isFinite(blueprint.sourceConflictReport.duplicateGroupCount) ||
    !Number.isFinite(blueprint.sourceConflictReport.conflictingGroupCount) ||
    !Number.isFinite(blueprint.sourceConflictReport.duplicateLessonCount) ||
    !blueprint.sourceConflictReport.policy ||
    blueprint.sourceConflictReport.lessonRows.some(
      (row) => !row?.lessonNumber || !row.lessonTitle || !row.conflictStatus,
    )
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'sourceConflictReport', 'Blueprint is missing source-conflict report.'),
    );
  }
  if (
    blueprint?.packageCoherenceMatrix?.status !== 'coherent' ||
    !Array.isArray(blueprint?.packageCoherenceMatrix?.lessonRows) ||
    blueprint.packageCoherenceMatrix.lessonRows.length !== scope ||
    !Array.isArray(blueprint?.packageCoherenceMatrix?.checkedArtifacts) ||
    blueprint.packageCoherenceMatrix.checkedArtifacts.length < 9 ||
    blueprint.packageCoherenceMatrix.missingFieldCount !== 0
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'packageCoherenceMatrix', 'Blueprint is missing package coherence matrix.'),
    );
  }
  if (
    !blueprint?.blueprintReviewSurface?.status ||
    !blueprint.blueprintReviewSurface.summary ||
    !blueprint.blueprintReviewSurface.humanReadablePolicy ||
    !blueprint.blueprintReviewSurface.courseDecode?.modality ||
    !blueprint.blueprintReviewSurface.courseDecode?.learnerRole ||
    !blueprint.blueprintReviewSurface.courseDecode?.signaturePractice ||
    blueprint.blueprintReviewSurface.instructionalMoveDecode?.status !== 'reviewable' ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.openingMove ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.practiceMove ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.feedbackMove ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.assessmentMove ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.reviewMove ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.sourceGrounding ||
    !blueprint.blueprintReviewSurface.instructionalMoveDecode?.reviewPolicy ||
    !Array.isArray(blueprint.blueprintReviewSurface.reviewerChecklist) ||
    blueprint.blueprintReviewSurface.reviewerChecklist.length < 5 ||
    !Array.isArray(blueprint.blueprintReviewSurface.lessonRows) ||
    blueprint.blueprintReviewSurface.lessonRows.length !== scope ||
    blueprint.blueprintReviewSurface.traceabilitySummary?.status !== 'traceable' ||
    blueprint.blueprintReviewSurface.traceabilitySummary?.traceableRows !== scope ||
    blueprint.blueprintReviewSurface.traceabilitySummary?.untraceableRows !== 0 ||
    !blueprint.blueprintReviewSurface.traceabilitySummary?.answerabilityPolicy ||
    blueprint.blueprintReviewSurface.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.sourceConfidence ||
        !row.assessmentArtifact ||
        !row.artifactGenre ||
        !row.teachingGoal ||
        !row.modalityPractice ||
        !row.compilerDecision ||
        !row.publishGate ||
        !row.reviewState ||
        !row.reviewerQuestion ||
        !row.answerabilityStatus ||
        row.answerabilityStatus === 'not-answerable' ||
        !row.sourceTrace?.sourceAnchor ||
        !Array.isArray(row.sourceTrace?.sourceFields) ||
        row.sourceTrace.sourceFields.length === 0 ||
        !row.sourceTrace?.evidenceRequirement ||
        !row.sourceTrace?.compilerReason ||
        !row.sourceTrace?.localConfirmationCue ||
        !Array.isArray(row.sourceTrace?.assumptionRefs) ||
        row.sourceTrace.assumptionRefs.length === 0 ||
        !row.teachingMoveTrace?.openingMove ||
        !row.teachingMoveTrace?.practiceMove ||
        !row.teachingMoveTrace?.feedbackMove ||
        !row.teachingMoveTrace?.assessmentMove ||
        !row.teachingMoveTrace?.reviewMove ||
        !row.teachingMoveTrace?.sourceAnchor ||
        !row.teachingMoveTrace?.artifactCue ||
        !row.teachingMoveTrace?.modalityCue,
    ) ||
    blueprint.blueprintReviewSurface.traceabilitySummary?.instructionalMoveRows !== scope ||
    !blueprint.blueprintReviewSurface.traceabilitySummary?.instructionalMovePolicy ||
    blueprint.blueprintReviewSurface.machineDecodeCompleteness?.lessonRows !== scope ||
    blueprint.blueprintReviewSurface.machineDecodeCompleteness?.assessmentRows !== scope ||
    !Number.isFinite(blueprint.blueprintReviewSurface.machineDecodeCompleteness?.checkedArtifacts) ||
    blueprint.blueprintReviewSurface.machineDecodeCompleteness.checkedArtifacts < 9
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'blueprintReviewSurface',
        'Blueprint is missing a human-readable compact review surface.',
      ),
    );
  }
  if (
    !blueprint?.blueprintAssumptionLedger?.status ||
    !Array.isArray(blueprint?.blueprintAssumptionLedger?.rows) ||
    blueprint.blueprintAssumptionLedger.rows.length === 0 ||
    blueprint.blueprintAssumptionLedger.rowCount !== blueprint.blueprintAssumptionLedger.rows.length ||
    !Array.isArray(blueprint.blueprintAssumptionLedger.categories) ||
    !blueprint.blueprintAssumptionLedger.categories.includes('handoff-boundary') ||
    !Number.isFinite(blueprint.blueprintAssumptionLedger.reviewRequiredCount) ||
    !blueprint.blueprintAssumptionLedger.reviewerPolicy ||
    blueprint.blueprintAssumptionLedger.rows.some(
      (row) =>
        !row?.id ||
        !row.category ||
        !row.assumption ||
        !row.evidence ||
        !row.source ||
        !row.confidence ||
        !Array.isArray(row.affectedArtifacts) ||
        row.affectedArtifacts.length === 0 ||
        !row.reviewerAction ||
        !row.resolutionStatus,
    )
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'blueprintAssumptionLedger',
        'Blueprint is missing a human-reviewable assumption ledger.',
      ),
    );
  }
  if (
    blueprint?.assessmentArchitecture?.status !== 'balanced' ||
    blueprint.assessmentArchitecture.totalWeightPercent !== 100 ||
    !Array.isArray(blueprint?.assessmentArchitecture?.lessonRows) ||
    blueprint.assessmentArchitecture.lessonRows.length !== scope ||
    !Array.isArray(blueprint?.assessmentArchitecture?.weightRows) ||
    blueprint.assessmentArchitecture.weightRows.length !== scope ||
    !blueprint.assessmentArchitecture.weightSourceStatus ||
    !Number.isFinite(blueprint.assessmentArchitecture.explicitWeightCount) ||
    !Number.isFinite(blueprint.assessmentArchitecture.compilerDistributedWeightCount) ||
    !Number.isFinite(blueprint.assessmentArchitecture.weightReviewRequiredCount) ||
    !blueprint.assessmentArchitecture.weightConfirmationPolicy ||
    !blueprint.assessmentArchitecture.policy
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'assessmentArchitecture', 'Blueprint is missing assessment architecture.'),
    );
  }
  if (!blueprint?.qualitySignals?.confidenceLevel) {
    findings.push(makeFinding('blocker', 'blueprint', 'qualitySignals', 'Blueprint is missing quality signals.'));
  }
  if (blueprint?.compilerContract?.status !== 'pass') {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'compilerContract',
        `Blueprint compiler contract is ${blueprint?.compilerContract?.status || 'missing'}.`,
      ),
    );
  }
  if (!blueprint?.compilerPath?.source || blueprint?.compilerPath?.deterministicCompiler !== true) {
    findings.push(makeFinding('blocker', 'blueprint', 'compilerPath', 'Blueprint is missing compiler path evidence.'));
  }
  if (!blueprint?.compilerPath?.adaptiveSafety?.status || !blueprint?.compilerPath?.adaptiveSafety?.modelFallback) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'adaptiveSafety', 'Blueprint is missing adaptive safety classification.'),
    );
  }
  if (
    !blueprint?.compilerDecisionMatrix?.status ||
    blueprint.compilerDecisionMatrix.deterministicCompiler !== true ||
    blueprint.compilerDecisionMatrix.modelFallback !== 'not used for blueprint-compiled deliverables' ||
    !Array.isArray(blueprint.compilerDecisionMatrix.lessonRows) ||
    blueprint.compilerDecisionMatrix.lessonRows.length !== scope ||
    !Number.isFinite(blueprint.compilerDecisionMatrix.reviewRequiredCount) ||
    !Number.isFinite(blueprint.compilerDecisionMatrix.localRepairCount) ||
    blueprint.compilerDecisionMatrix.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.generationPath ||
        !row.publishGate ||
        !row.sourceRiskLevel ||
        !row.assessmentSource ||
        !Array.isArray(row.reviewFocus) ||
        row.reviewFocus.length === 0,
    )
  ) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'compilerDecisionMatrix', 'Blueprint is missing compiler decision matrix.'),
    );
  }

  for (const lesson of lessons) {
    const prefix = `Lesson ${lesson.lessonNumber}`;
    if (!lesson.confidence?.level || !Number.isFinite(lesson.confidence?.score)) {
      findings.push(makeFinding('blocker', 'blueprint', 'confidence', `${prefix} is missing source confidence.`));
    }
    if (!Array.isArray(lesson.sourceAnchors) || lesson.sourceAnchors.length < 4) {
      findings.push(makeFinding('blocker', 'blueprint', 'sourceAnchors', `${prefix} is missing source anchors.`));
    }
    if (
      lesson.compilerDecision?.source !== 'deterministic-compiler-decision' ||
      !lesson.compilerDecision?.generationPath ||
      !lesson.compilerDecision?.safePath ||
      !lesson.compilerDecision?.publishGate ||
      !lesson.compilerDecision?.modelUsePolicy ||
      !lesson.compilerDecision?.repairPolicy ||
      !lesson.compilerDecision?.reason ||
      !lesson.compilerDecision?.evidence?.sourceRiskLevel ||
      !lesson.compilerDecision?.evidence?.assessmentSource ||
      !Array.isArray(lesson.compilerDecision?.reviewFocus) ||
      lesson.compilerDecision.reviewFocus.length === 0
    ) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'compilerDecision', `${prefix} is missing compiler decision evidence.`),
      );
    }
    if (
      !lesson.sourceEvidenceTrace?.sourceRowLabel ||
      !Array.isArray(lesson.sourceEvidenceTrace?.sourceFields) ||
      lesson.sourceEvidenceTrace.sourceFields.length < 6 ||
      !lesson.sourceEvidenceTrace?.unsupportedInferencePolicy ||
      lesson.sourceEvidenceTrace.sourceFields.some(
        (field) => !field?.field || !field.sourceColumn || !field.source || !field.compiledValue || !field.purpose,
      )
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sourceEvidenceTrace',
          `${prefix} is missing raw source provenance and compiler-use trace.`,
        ),
      );
    }
    if (
      Number(lesson.sourceEvidenceTrace?.sourceSectionCount || 0) > 1 &&
      (!Array.isArray(lesson.sourceEvidenceTrace?.sectionCoverage) ||
        lesson.sourceEvidenceTrace.sectionCoverage.length !== lesson.sourceEvidenceTrace.sourceSectionCount ||
        lesson.sourceEvidenceTrace.sectionCoverage.some(
          (section) =>
            !section?.sectionNumber ||
            !Array.isArray(section.sourceColumns) ||
            section.sourceColumns.length === 0 ||
            !Array.isArray(section.preservedSignals) ||
            section.preservedSignals.length === 0,
        ))
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sectionCoverageTrace',
          `${prefix} is missing section-by-section source coverage for a multi-section lesson.`,
        ),
      );
    }
    if (!lesson.workloadEstimate?.totalStudentMinutes) {
      findings.push(makeFinding('blocker', 'blueprint', 'workload', `${prefix} is missing workload estimates.`));
    }
    if (
      !lesson.classSessionPlan?.feasibilityStatus ||
      !lesson.classSessionPlan?.plannedClassMinutes ||
      !lesson.classSessionPlan?.sessionMinutes ||
      !Array.isArray(lesson.classSessionPlan?.segments) ||
      lesson.classSessionPlan.segments.length < 6 ||
      lesson.classSessionPlan.overageMinutes > 0
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'classSessionPlan',
          `${prefix} is missing a feasible class-session timing plan.`,
        ),
      );
    }
    if (!lesson.difficultyProfile?.cognitiveDemand) {
      findings.push(makeFinding('blocker', 'blueprint', 'difficulty', `${prefix} is missing a difficulty profile.`));
    }
    if (
      !lesson.bloomInference?.level ||
      lesson.bloomInference.level !== lesson.bloomsLevel ||
      !lesson.bloomInference?.source ||
      lesson.bloomInference.source === 'index-rotation' ||
      (lesson.bloomInference.fallbackUsed && !lesson.bloomInference.matchedSignal)
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'bloomInference',
          `${prefix} is missing source-text Bloom inference for cognitive demand.`,
        ),
      );
    }
    if (!lesson.evidencePlan?.evidenceRequirement || !lesson.evidencePlan?.limitationCue) {
      findings.push(makeFinding('blocker', 'blueprint', 'evidencePlan', `${prefix} is missing an evidence plan.`));
    }
    if (!lesson.learnerContextCue) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'learnerContextCue', `${prefix} is missing learner-context trace.`),
      );
    }
    if (!lesson.modalityCue) {
      findings.push(makeFinding('blocker', 'blueprint', 'modalityCue', `${prefix} is missing modality-fit trace.`));
    }
    if (
      !lesson.modalityDecode?.signaturePractice ||
      !lesson.modalityDecode?.evidenceRoutine ||
      !lesson.modalityDecode?.feedbackRoutine ||
      !lesson.modalityDecode?.instructorMove ||
      !lesson.modalityDecode?.artifactCheck
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'modalityDecode',
          `${prefix} is missing modality-specific teaching decode.`,
        ),
      );
    }
    if (
      !lesson.artifactGenre?.genre ||
      !lesson.artifactGenre?.outputFormat ||
      !lesson.artifactGenre?.evidenceRequirement ||
      !lesson.artifactGenre?.qualityFocus ||
      !lesson.artifactGenre?.reviewProtocol ||
      !lesson.artifactGenre?.commonFailure ||
      !lesson.artifactGenre?.revisionMove
    ) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'artifactGenre', `${prefix} is missing student-artifact genre decode.`),
      );
    }
    if (
      !Array.isArray(lesson.sourceUsePlan?.approvedSources) ||
      lesson.sourceUsePlan.approvedSources.length === 0 ||
      !lesson.sourceUsePlan?.citationExpectation ||
      !lesson.sourceUsePlan?.studentAttributionMove ||
      !lesson.sourceUsePlan?.noInventedSources ||
      !lesson.sourceUsePlan?.sourceEvaluationPrompt ||
      !lesson.sourceUsePlan?.localReplacementCue ||
      !lesson.sourceUsePlan?.copyrightReviewCue
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sourceUsePlan',
          `${prefix} is missing source-use and citation-integrity planning.`,
        ),
      );
    }
    if (!Array.isArray(lesson.misconceptionMap) || lesson.misconceptionMap.length < 2) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'misconceptionMap', `${prefix} is missing misconception mapping.`),
      );
    }
    if (
      !lesson.modelContrast?.exemplarMove ||
      !lesson.modelContrast?.nonExemplarMove ||
      !lesson.modelContrast?.transferPrompt
    ) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'modelContrast', `${prefix} is missing exemplar/non-exemplar contrast.`),
      );
    }
    if (
      !lesson.readinessSupport?.diagnosticPrompt ||
      !lesson.readinessSupport?.supportMove ||
      !lesson.readinessSupport?.extensionMove
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'readinessSupport',
          `${prefix} is missing diagnostic support and extension planning.`,
        ),
      );
    }
    if (
      !Array.isArray(lesson.prerequisitePlan?.assumedKnowledge) ||
      lesson.prerequisitePlan.assumedKnowledge.length === 0 ||
      !lesson.prerequisitePlan?.prerequisiteEvidence ||
      !lesson.prerequisitePlan?.diagnosticCheck ||
      !lesson.prerequisitePlan?.reteachMove ||
      !lesson.prerequisitePlan?.accelerationMove ||
      !lesson.prerequisitePlan?.localAssumptionReview
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'prerequisitePlan',
          `${prefix} is missing prerequisite-readiness planning.`,
        ),
      );
    }
    if (
      !lesson.conceptDependencyPlan?.node?.concept ||
      !lesson.conceptDependencyPlan?.dependencyCue ||
      !lesson.conceptDependencyPlan?.transferCue ||
      !lesson.practiceProgressionPlan?.currentConcept ||
      !lesson.practiceProgressionPlan?.practiceFocus ||
      !lesson.practiceProgressionPlan?.evidenceRoutine ||
      !lesson.practiceProgressionPlan?.feedbackRoutine ||
      !lesson.practiceProgressionPlan?.transferTask
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'conceptDependencyPlan',
          `${prefix} is missing concept dependency and practice progression planning.`,
        ),
      );
    }
    if (
      !lesson.masteryEvidencePlan?.diagnosticEvidence ||
      !lesson.masteryEvidencePlan?.guidedPracticeEvidence ||
      !lesson.masteryEvidencePlan?.independentPerformanceEvidence ||
      !lesson.masteryEvidencePlan?.feedbackRevisionEvidence ||
      !lesson.masteryEvidencePlan?.transferEvidence ||
      !lesson.masteryEvidencePlan?.misconceptionRepairEvidence ||
      !lesson.masteryEvidencePlan?.masteryThreshold ||
      !lesson.masteryEvidencePlan?.masteryDecision ||
      !Array.isArray(lesson.masteryEvidencePlan?.evidencePortfolio) ||
      lesson.masteryEvidencePlan.evidencePortfolio.length < 6
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'masteryEvidencePlan',
          `${prefix} is missing diagnostic, practice, performance, revision, transfer, and misconception-repair mastery evidence.`,
        ),
      );
    }
    if (
      !lesson.evidenceResponsePlan?.readySignal ||
      !lesson.evidenceResponsePlan?.partialSignal ||
      !lesson.evidenceResponsePlan?.supportSignal ||
      !lesson.evidenceResponsePlan?.readyMove ||
      !lesson.evidenceResponsePlan?.partialMove ||
      !lesson.evidenceResponsePlan?.supportMove ||
      !lesson.evidenceResponsePlan?.recheckCue ||
      !Array.isArray(lesson.evidenceResponsePlan?.decisionStates) ||
      lesson.evidenceResponsePlan.decisionStates.length < 3
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'evidenceResponsePlan',
          `${prefix} is missing ready, partial, and needs-support evidence-response decisions.`,
        ),
      );
    }
    if (
      !lesson.instructionalRationale?.sequenceRationale ||
      !lesson.instructionalRationale?.practiceRationale ||
      !lesson.instructionalRationale?.assessmentRationale ||
      !lesson.instructionalRationale?.reviewCue
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'instructionalRationale',
          `${prefix} is missing instructional design rationale.`,
        ),
      );
    }
    if (
      !lesson.accessibilityPlan?.representation ||
      !lesson.accessibilityPlan?.engagement ||
      !lesson.accessibilityPlan?.expression ||
      !lesson.accessibilityPlan?.participationProtocol ||
      !lesson.accessibilityPlan?.accommodationReviewCue
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'accessibilityPlan',
          `${prefix} is missing accessibility and participation planning.`,
        ),
      );
    }
    if (
      !lesson.feedbackCycle?.formativeEvidence ||
      !lesson.feedbackCycle?.feedbackMethod ||
      !lesson.feedbackCycle?.studentRevisionAction ||
      !lesson.feedbackCycle?.nextUse ||
      !lesson.feedbackCycle?.closureCheck
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'feedbackCycle',
          `${prefix} is missing structured feedback and revision cycle.`,
        ),
      );
    }
    if (
      !lesson.learningTransferPlan?.retrievalCue ||
      !lesson.learningTransferPlan?.spacedPracticeCue ||
      !lesson.learningTransferPlan?.transferTask ||
      !lesson.learningTransferPlan?.cumulativeConnection ||
      !lesson.learningTransferPlan?.metacognitivePrompt
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'learningTransferPlan',
          `${prefix} is missing retrieval and transfer planning.`,
        ),
      );
    }
    if (
      !lesson.teachingIntent?.teachingGoal ||
      !lesson.teachingIntent?.diagnosticMove ||
      !lesson.teachingIntent?.modelingMove ||
      !lesson.teachingIntent?.guidedPracticeMove ||
      !lesson.teachingIntent?.evidenceOfLearning ||
      !lesson.teachingIntent?.feedbackDecision ||
      !lesson.teachingIntent?.studentRevisionMove ||
      !lesson.teachingIntent?.transferMove ||
      !lesson.teachingIntent?.localReviewQuestion
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'teachingIntent',
          `${prefix} is missing explicit teaching-intent sequencing.`,
        ),
      );
    }
    if (!lesson.pacing?.bridgeFrom || !lesson.pacing?.bridgeTo) {
      findings.push(makeFinding('blocker', 'blueprint', 'pacing', `${prefix} is missing pacing bridges.`));
    }
  }

  for (const assessment of blueprint?.assessments || []) {
    if (
      !assessment.role ||
      !assessment.roleLabel ||
      !assessment.stakes ||
      !Number.isFinite(assessment.weightPercent) ||
      !assessment.gradingMode ||
      !assessment.roleRationale ||
      !assessment.studentFacingPurpose ||
      !assessment.revisionUse ||
      !assessment.cadence?.dueWindow ||
      !assessment.cadence?.feedbackWindow ||
      !assessment.cadence?.revisionWindow ||
      !assessment.validityEvidence?.targetConstruct ||
      !assessment.validityEvidence?.authenticPerformance ||
      !assessment.validityEvidence?.validityThreat ||
      !assessment.validityEvidence?.calibrationCheck ||
      !assessment.calibrationPlan?.anchorComparison ||
      !assessment.calibrationPlan?.scorerNorming ||
      !assessment.calibrationPlan?.biasCheck ||
      !assessment.calibrationPlan?.studentTransparency ||
      !assessment.calibrationPlan?.postScoreReview ||
      !assessment.anchorExampleSet?.strongSample ||
      !assessment.anchorExampleSet?.partialSample ||
      !assessment.anchorExampleSet?.strongSignal ||
      !assessment.anchorExampleSet?.partialSignal ||
      !assessment.anchorExampleSet?.scoringRationale ||
      !assessment.anchorExampleSet?.revisionPrompt ||
      !assessment.anchorExampleSet?.scorerCalibrationUse ||
      !assessment.anchorExampleSet?.studentFacingUse ||
      !Array.isArray(assessment.criterionEvidenceMap) ||
      assessment.criterionEvidenceMap.length < 4 ||
      !Array.isArray(assessment.criterionWeightPlan) ||
      assessment.criterionWeightPlan.length < 4 ||
      assessment.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry?.weight || 0), 0) !== 100 ||
      assessment.criterionEvidenceMap.some(
        (entry) =>
          !entry?.criterion ||
          !entry.evidenceNeeded ||
          !entry.strongSignal ||
          !entry.partialSignal ||
          !entry.feedbackMove ||
          !entry.calibrationQuestion,
      ) ||
      assessment.criterionWeightPlan.some(
        (entry) =>
          !entry?.criterion ||
          !Number.isFinite(entry.weight) ||
          !Number.isFinite(entry.points) ||
          !entry.priority ||
          !entry.rationale ||
          !entry.evidenceSignal ||
          !entry.calibrationUse ||
          !entry.feedbackUse ||
          !entry.studentTransparency,
      )
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'assessmentValidity',
          `${assessment.title || 'Assessment'} is missing assessment role, cadence, validity, anchor-example, criterion-evidence, criterion-weighting, or grading-calibration evidence.`,
        ),
      );
    }
  }

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'pass',
    confidenceLevel: blueprint?.qualitySignals?.confidenceLevel || 'unknown',
    averageConfidenceScore: blueprint?.qualitySignals?.averageConfidenceScore ?? null,
    sourceGroundedLessonCount: blueprint?.qualitySignals?.sourceGroundedLessonCount ?? null,
    reviewFlagCount: blueprint?.qualitySignals?.reviewFlagCount ?? null,
    reviewFlags: blueprint?.qualitySignals?.reviewFlags || [],
    averageWorkloadMinutes: blueprint?.courseWorkload?.averagePerLessonMinutes ?? null,
    timingStatus: blueprint?.courseWorkload?.timingStatus || 'missing',
    averagePlannedClassMinutes: blueprint?.courseWorkload?.averagePlannedClassMinutes ?? null,
    courseArc: blueprint?.courseArc?.throughline || '',
    conceptDependencyGraph: blueprint?.conceptDependencyGraph || null,
    sourceConflictReport: blueprint?.sourceConflictReport || null,
    sourceRiskRegister: blueprint?.sourceRiskRegister || null,
    assessmentArchitecture: blueprint?.assessmentArchitecture || null,
    blueprintAssumptionLedger: blueprint?.blueprintAssumptionLedger || null,
    blueprintReviewSurface: blueprint?.blueprintReviewSurface || null,
    compilerPath: blueprint?.compilerPath || null,
    adaptiveSafety: blueprint?.compilerPath?.adaptiveSafety || null,
    compilerDecisionMatrix: blueprint?.compilerDecisionMatrix || null,
    compilerContract: blueprint?.compilerContract || null,
    findings,
  };
}

function buildBlueprintExpectationFindings(blueprintMaturity, expectations = {}) {
  const findings = [];
  if (!expectations || typeof expectations !== 'object') return findings;
  if (
    Number.isFinite(expectations.minReviewFlags) &&
    Number(blueprintMaturity.reviewFlagCount || 0) < expectations.minReviewFlags
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'reviewFlags',
        `Expected at least ${expectations.minReviewFlags} review flag(s), found ${blueprintMaturity.reviewFlagCount || 0}.`,
      ),
    );
  }
  if (
    Number.isFinite(expectations.maxSourceGroundedLessonCount) &&
    Number(blueprintMaturity.sourceGroundedLessonCount || 0) > expectations.maxSourceGroundedLessonCount
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'sourceGrounding',
        `Expected no more than ${expectations.maxSourceGroundedLessonCount} fully source-grounded lesson(s), found ${blueprintMaturity.sourceGroundedLessonCount || 0}.`,
      ),
    );
  }
  const reviewText = (blueprintMaturity.reviewFlags || []).join(' ');
  for (const pattern of expectations.mustHaveReviewSignal || []) {
    if (!patternMatches(pattern, reviewText)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'reviewSignal',
          `Blueprint review flags are missing required signal ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
  return findings;
}

function buildBlueprintAlignmentFindings(blueprint, scope) {
  const findings = [];
  const rows = Array.isArray(blueprint?.alignmentMatrix) ? blueprint.alignmentMatrix : [];
  if (rows.length !== scope) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'alignmentMatrix',
        `Expected ${scope} alignment row(s), found ${rows.length}.`,
      ),
    );
  }
  for (const row of rows) {
    const prefix = `Lesson ${row.lessonNumber}`;
    if (row.alignmentStatus !== 'aligned') {
      findings.push(
        makeFinding('blocker', 'blueprint', 'alignmentStatus', `${prefix} is not marked aligned in the blueprint.`),
      );
    }
    if (!Array.isArray(row.objectives) || row.objectives.length === 0) {
      findings.push(makeFinding('blocker', 'blueprint', 'alignmentObjectives', `${prefix} has no objectives.`));
    }
    if (!row.inClassPractice) {
      findings.push(makeFinding('blocker', 'blueprint', 'alignmentPractice', `${prefix} has no practice anchor.`));
    }
    if (!row.assessmentArtifact) {
      findings.push(makeFinding('blocker', 'blueprint', 'alignmentArtifact', `${prefix} has no assessment artifact.`));
    }
    if (!Array.isArray(row.rubricCriteria) || row.rubricCriteria.length < 4) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'alignmentRubric', `${prefix} has fewer than four rubric criteria.`),
      );
    }
    if (!Array.isArray(row.successCriteria) || row.successCriteria.length < 3) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'alignmentSuccessCriteria', `${prefix} has weak success criteria.`),
      );
    }
    if (
      !row.evidenceRequirement ||
      !row.feedbackUse ||
      !row.misconceptionCheck ||
      !row.modelContrastCue ||
      !row.readinessSupportCue ||
      !row.prerequisiteCue ||
      !row.conceptDependencyCue ||
      !row.practiceProgressionCue ||
      !row.masteryDiagnosticCue ||
      !row.masteryGuidedPracticeCue ||
      !row.masteryPerformanceCue ||
      !row.masteryRevisionCue ||
      !row.masteryTransferCue ||
      !row.masteryThresholdCue ||
      !row.evidenceReadyResponseCue ||
      !row.evidencePartialResponseCue ||
      !row.evidenceSupportResponseCue ||
      !row.evidenceRecheckCue ||
      !row.sourceEvidenceCue ||
      !row.sourceRiskLevel ||
      !row.instructionalRationaleCue ||
      !row.accessibilityCue ||
      !row.feedbackCycleCue ||
      !row.learningTransferCue ||
      !row.teachingIntentCue ||
      !row.modalityCue ||
      !row.modalityDecodeCue ||
      !row.artifactGenreCue ||
      !row.criterionWeightCue ||
      !row.gradingCalibrationCue ||
      !row.criterionEvidenceCue ||
      !row.anchorExampleCue ||
      !row.sourceUseCue
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'alignmentTeachingLoop',
          `${prefix} is missing evidence, source evidence, source risk, source-use, prerequisite-readiness, concept-dependency, practice-progression, mastery-evidence, evidence-response decisions, modality-fit, modality teaching pattern, artifact genre, criterion-weighting, criterion-evidence, anchor-example, teaching-intent, feedback, revision, retrieval/transfer, misconception, exemplar-contrast, readiness-support, instructional-rationale, accessibility, or grading-calibration alignment.`,
        ),
      );
    }
  }
  return findings;
}

function featureItemForLesson(featureId, data, index) {
  if (featureId === 'syllabus') return data?.syllabus?.lessonAlignmentMatrix?.[index] || {};
  return getFeatureArray(featureId, data)[index] || {};
}

function buildCompiledAlignmentFindings({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const rows = Array.isArray(blueprint?.alignmentMatrix) ? blueprint.alignmentMatrix : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  rows.forEach((row, index) => {
    const lesson = blueprint.lessons?.[index] || {};
    const conceptKeywords = keywordSet([lesson.title, ...(lesson.keyConcepts || [])].join(' '), 6);
    const artifactKeywords = keywordSet(row.assessmentArtifact || lesson.studentArtifact, 6);
    const successKeywords = keywordSet((row.successCriteria || []).join(' '), 6);
    for (const featureId of lessonFeatures) {
      const data = compiled[featureId];
      const itemText = collectStrings(featureItemForLesson(featureId, data, index)).join(' ');
      if (!itemText) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'compiledAlignment',
            `Lesson ${row.lessonNumber} has no compiled item to align against.`,
          ),
        );
        continue;
      }
      if (conceptKeywords.length > 0 && tokenOverlap(conceptKeywords, itemText).length === 0) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'conceptAlignment',
            `Lesson ${row.lessonNumber} output does not reference the lesson concept (${conceptKeywords.slice(0, 3).join(', ')}).`,
          ),
        );
      }
      if (artifactKeywords.length > 0 && tokenOverlap(artifactKeywords, itemText).length === 0) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'artifactAlignment',
            `Lesson ${row.lessonNumber} output does not reference the assessment artifact (${artifactKeywords.slice(0, 3).join(', ')}).`,
          ),
        );
      }
      if (
        ['assignments', 'rubrics', 'lessonPlans', 'studyGuides'].includes(featureId) &&
        successKeywords.length > 0 &&
        tokenOverlap(successKeywords, itemText).length === 0
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'successCriteriaAlignment',
            `Lesson ${row.lessonNumber} output does not preserve success-criteria language (${successKeywords
              .slice(0, 3)
              .join(', ')}).`,
          ),
        );
      }
    }
  });
  return findings;
}

function sourceLessonSignals(sourceLesson, index) {
  const sections = Array.isArray(sourceLesson?.sections) ? sourceLesson.sections : [];
  const titleText = cleanSignal(sourceLesson?.title || `Lesson ${index + 1}`);
  const topicText = sections
    .map((section) =>
      [section.topicSection, section.learningGoals, section.learningObjectives, section.supportingResources]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');
  const assessmentText = sections
    .map((section) => [section.weeklyAssessments, section.evaluateDesign].filter(Boolean).join(' '))
    .join(' ');
  const activityText = sections
    .map((section) => [section.asyncActivities, section.syncActivities].filter(Boolean).join(' '))
    .join(' ');
  const titleKeywords = keywordSet(titleText, 8);
  const topicKeywords = keywordSet(topicText, 10);
  const assessmentKeywords = keywordSet(assessmentText, 10);
  const activityKeywords = keywordSet(activityText, 8);
  return {
    lessonNumber: index + 1,
    sourceTitle: titleText,
    titleKeywords,
    topicKeywords,
    assessmentKeywords,
    activityKeywords,
    conceptKeywords: uniqueSignals([...titleKeywords, ...topicKeywords, ...activityKeywords], 18),
    allKeywords: uniqueSignals([...titleKeywords, ...topicKeywords, ...assessmentKeywords, ...activityKeywords], 24),
  };
}

function buildSourceFidelityAudit({ courseMap, blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const sourceLessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const blueprintLessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));
  const assessmentTraceFeatures = new Set(['syllabus', 'lessonPlans', 'assignments', 'rubrics', 'quizBank']);

  const rows = sourceLessons.map((sourceLesson, index) => {
    const signals = sourceLessonSignals(sourceLesson, index);
    const lessonLabel = `Lesson ${signals.lessonNumber}`;
    const blueprintText = collectStrings(blueprintLessons[index] || {}).join(' ');
    const blueprintConceptMatches = tokenOverlap(signals.conceptKeywords, blueprintText);
    const blueprintAssessmentMatches = tokenOverlap(signals.assessmentKeywords, blueprintText);
    const compiledFindingsBefore = findings.length;
    const missingFeatures = [];

    if (signals.conceptKeywords.length > 0 && blueprintConceptMatches.length === 0) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sourceFidelityConcept',
          `${lessonLabel} blueprint does not preserve source topic/title signals from "${signals.sourceTitle}".`,
        ),
      );
    }
    if (signals.assessmentKeywords.length > 0 && blueprintAssessmentMatches.length === 0) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sourceFidelityAssessment',
          `${lessonLabel} blueprint does not preserve source assessment signals from "${signals.sourceTitle}".`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const conceptMatches = tokenOverlap(signals.conceptKeywords, itemText);
      const assessmentMatches = tokenOverlap(signals.assessmentKeywords, itemText);
      const missingConcept = signals.conceptKeywords.length > 0 && conceptMatches.length === 0;
      const missingAssessment =
        assessmentTraceFeatures.has(featureId) &&
        signals.assessmentKeywords.length > 0 &&
        assessmentMatches.length === 0;

      if (missingConcept) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'sourceFidelityConceptTrace',
            `${lessonLabel} ${FEATURE_LABELS[featureId] || featureId} does not preserve source topic/title signals from "${signals.sourceTitle}".`,
          ),
        );
      }
      if (missingAssessment) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'sourceFidelityAssessmentTrace',
            `${lessonLabel} ${FEATURE_LABELS[featureId] || featureId} does not preserve source assessment signals from "${signals.sourceTitle}".`,
          ),
        );
      }
    }

    return {
      lessonNumber: signals.lessonNumber,
      sourceTitle: signals.sourceTitle,
      sourceSignalCount: signals.allKeywords.length,
      blueprintConceptMatches: blueprintConceptMatches.length,
      blueprintAssessmentMatches: blueprintAssessmentMatches.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    sourceRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function percentCoverage(matches, total) {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Number((matches / total).toFixed(2));
}

function requiredSignalMatches(signalCount, ratio, floor, ceiling) {
  if (!Number.isFinite(signalCount) || signalCount <= 0) return 0;
  return Math.min(ceiling, Math.max(floor, Math.ceil(signalCount * ratio)));
}

function blueprintDecodePacketText(lesson = {}) {
  return collectStrings({
    title: lesson.title,
    keyConcepts: lesson.keyConcepts,
    studentArtifact: lesson.studentArtifact,
    sourceAnchors: lesson.sourceAnchors,
    sourceEvidenceTrace: lesson.sourceEvidenceTrace,
    evidencePlan: lesson.evidencePlan,
    sourceUsePlan: lesson.sourceUsePlan,
    assessmentAnchor: lesson.assessmentAnchor,
    teachingIntent: lesson.teachingIntent,
    modalityDecode: lesson.modalityDecode,
    artifactGenre: lesson.artifactGenre,
  }).join(' ');
}

function hasLosslessBlueprintDecodePacket(lesson = {}) {
  return Boolean(
    lesson.title &&
    Array.isArray(lesson.keyConcepts) &&
    lesson.keyConcepts.length >= 1 &&
    lesson.studentArtifact &&
    Array.isArray(lesson.sourceAnchors) &&
    lesson.sourceAnchors.length >= 1 &&
    Array.isArray(lesson.sourceEvidenceTrace?.sourceFields) &&
    lesson.sourceEvidenceTrace.sourceFields.length >= 6 &&
    lesson.evidencePlan?.evidenceRequirement &&
    lesson.sourceUsePlan?.noInventedSources &&
    lesson.teachingIntent?.teachingGoal &&
    lesson.modalityDecode?.signaturePractice &&
    lesson.artifactGenre?.genre,
  );
}

function buildBlueprintDecodeLosslessnessAudit({ courseMap, blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const sourceLessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const blueprintLessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  const rows = sourceLessons.map((sourceLesson, index) => {
    const signals = sourceLessonSignals(sourceLesson, index);
    const lessonLabel = `Lesson ${signals.lessonNumber}`;
    const lesson = blueprintLessons[index] || {};
    const blueprintText = blueprintDecodePacketText(lesson);
    const blueprintSignalMatches = tokenOverlap(signals.allKeywords, blueprintText);
    const blueprintTopicMatches = tokenOverlap(signals.topicKeywords, blueprintText);
    const blueprintAssessmentMatches = tokenOverlap(signals.assessmentKeywords, blueprintText);
    const compiledFeatureTexts = lessonFeatures.map((featureId) =>
      collectStrings(featureItemForLesson(featureId, compiled[featureId], index)).join(' '),
    );
    const compiledLessonText = compiledFeatureTexts.join(' ');
    const compiledSignalMatches = tokenOverlap(signals.allKeywords, compiledLessonText);
    const featuresWithSourceSignal = compiledFeatureTexts.filter(
      (text) => tokenOverlap(signals.allKeywords, text).length > 0,
    ).length;
    const requiredBlueprint = requiredSignalMatches(signals.allKeywords.length, 0.45, 5, 10);
    const requiredCompiled = requiredSignalMatches(signals.allKeywords.length, 0.6, 7, 14);
    const requiredTopic = requiredSignalMatches(signals.topicKeywords.length, 0.35, 2, 5);
    const requiredAssessment = requiredSignalMatches(signals.assessmentKeywords.length, 0.35, 1, 4);
    const compiledFindingsBefore = findings.length;

    if (!hasLosslessBlueprintDecodePacket(lesson)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'blueprintLosslessDecodePacket',
          `${lessonLabel} compact blueprint packet is missing source anchors, provenance, teaching intent, modality decode, artifact genre, or source-use controls.`,
        ),
      );
    }
    if (blueprintSignalMatches.length < requiredBlueprint) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'blueprintLosslessSourceCoverage',
          `${lessonLabel} compact blueprint preserves ${blueprintSignalMatches.length}/${signals.allKeywords.length} source signals; expected at least ${requiredBlueprint}.`,
        ),
      );
    }
    if (signals.topicKeywords.length > 0 && blueprintTopicMatches.length < requiredTopic) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'blueprintLosslessTopicCoverage',
          `${lessonLabel} compact blueprint under-preserves source topic signals from "${signals.sourceTitle}".`,
        ),
      );
    }
    if (signals.assessmentKeywords.length > 0 && blueprintAssessmentMatches.length < requiredAssessment) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'blueprintLosslessAssessmentCoverage',
          `${lessonLabel} compact blueprint under-preserves source assessment signals from "${signals.sourceTitle}".`,
        ),
      );
    }
    if (compiledSignalMatches.length < requiredCompiled) {
      findings.push(
        makeFinding(
          'blocker',
          'compiler',
          'compilerLosslessDecodeCoverage',
          `${lessonLabel} compiled package preserves ${compiledSignalMatches.length}/${signals.allKeywords.length} blueprint/source signals; expected at least ${requiredCompiled}.`,
        ),
      );
    }
    if (featuresWithSourceSignal !== lessonFeatures.length) {
      findings.push(
        makeFinding(
          'blocker',
          'compiler',
          'compilerLosslessFeatureCoverage',
          `${lessonLabel} decoded source signals appear in ${featuresWithSourceSignal}/${lessonFeatures.length} lesson-facing features.`,
        ),
      );
    }

    return {
      lessonNumber: signals.lessonNumber,
      sourceSignalCount: signals.allKeywords.length,
      blueprintSignalMatches: blueprintSignalMatches.length,
      blueprintCoverage: percentCoverage(blueprintSignalMatches.length, signals.allKeywords.length),
      compiledSignalMatches: compiledSignalMatches.length,
      compiledCoverage: percentCoverage(compiledSignalMatches.length, signals.allKeywords.length),
      featuresWithSourceSignal,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  const blueprintCoverageValues = rows.map((row) => row.blueprintCoverage).filter(Number.isFinite);
  const compiledCoverageValues = rows.map((row) => row.compiledCoverage).filter(Number.isFinite);
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    minBlueprintCoverage: blueprintCoverageValues.length ? Math.min(...blueprintCoverageValues) : null,
    minCompiledCoverage: compiledCoverageValues.length ? Math.min(...compiledCoverageValues) : null,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function hasTeachingIntentContract(intent = {}) {
  return Boolean(
    intent?.teachingGoal &&
    intent?.diagnosticMove &&
    intent?.modelingMove &&
    intent?.guidedPracticeMove &&
    intent?.evidenceOfLearning &&
    intent?.feedbackDecision &&
    intent?.studentRevisionMove &&
    intent?.transferMove &&
    intent?.localReviewQuestion,
  );
}

function teachingIntentTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') return item.teachingIntentCue || collectStrings(item.teachingIntent || {}).join(' ');
  return collectStrings(
    grounding.teachingIntent || item.teachingIntent || item.slideDeckSequenceGuide?.teachingIntent || {},
  ).join(' ');
}

function buildTeachingIntentAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const expectedTeachingGoal = lesson.teachingIntent?.teachingGoal || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (!hasTeachingIntentContract(lesson.teachingIntent)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'teachingIntentContract',
          `${lessonLabel} blueprint is missing explicit teaching-intent sequencing.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const intentText = teachingIntentTraceForFeature(featureId, item, grounding);
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(makeFinding('blocker', featureId, 'teachingIntentItem', `${lessonLabel} has no compiled item.`));
        continue;
      }
      if (expectedTeachingGoal && !hasKeywordTrace(expectedTeachingGoal, intentText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'teachingIntentStructuredTrace',
            `${lessonLabel} output does not preserve structured teaching intent.`,
          ),
        );
      }
      if (expectedTeachingGoal && !hasKeywordTrace(expectedTeachingGoal, itemText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'teachingIntentTextTrace',
            `${lessonLabel} output does not expose teaching-intent language.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      teachingGoal: expectedTeachingGoal,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function instructionalMoveTraceForFeature(featureId, item = {}) {
  if (featureId === 'lessonPlans') return item.instructionalMoveGuide || {};
  if (featureId === 'slideDecks') return item.slideDeckSequenceGuide?.instructionalMoveGuide || {};
  return {};
}

function buildInstructionalMovePropagationAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const surfaceRows = Array.isArray(blueprint?.blueprintReviewSurface?.lessonRows)
    ? blueprint.blueprintReviewSurface.lessonRows
    : [];
  const lessonFeatures = ['lessonPlans', 'slideDecks'].filter((featureId) => compiledFeatures.includes(featureId));

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber || index + 1}`;
    const expectedTrace = surfaceRows[index]?.teachingMoveTrace || {};
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;
    const missingBlueprintMoves = REQUIRED_TEACHING_MOVE_KEYS.filter((key) => !cleanSignal(expectedTrace[key]));

    if (missingBlueprintMoves.length > 0) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'instructionalMoveBlueprintTrace',
          `${lessonLabel} blueprint review surface is missing instructional move trace(s): ${missingBlueprintMoves.join(
            ', ',
          )}.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const moveGuide = instructionalMoveTraceForFeature(featureId, item);
      const moveGuideText = collectStrings(moveGuide).join(' ');
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'instructionalMoveItem',
            `${lessonLabel} has no compiled ${FEATURE_LABELS[featureId] || featureId} item.`,
          ),
        );
        continue;
      }

      for (const key of REQUIRED_TEACHING_MOVE_KEYS) {
        if (!cleanSignal(moveGuide[key])) {
          missingFeatures.push(featureId);
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'instructionalMoveCompiledTrace',
              `${lessonLabel} ${FEATURE_LABELS[featureId] || featureId} is missing the ${key} instructional move guide.`,
            ),
          );
          continue;
        }
        if (expectedTrace[key] && !hasKeywordTrace(expectedTrace[key], `${moveGuideText} ${itemText}`, 10)) {
          missingFeatures.push(featureId);
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'instructionalMoveCompiledTrace',
              `${lessonLabel} ${FEATURE_LABELS[featureId] || featureId} does not preserve the ${key} instructional move from the review surface.`,
            ),
          );
        }
      }
    }

    return {
      lessonNumber: lesson.lessonNumber || index + 1,
      checkedFeatures: lessonFeatures.length,
      propagatedMoveCount: lessonFeatures.reduce((count, featureId) => {
        const item = featureItemForLesson(featureId, compiled[featureId], index);
        const moveGuide = instructionalMoveTraceForFeature(featureId, item);
        return count + REQUIRED_TEACHING_MOVE_KEYS.filter((key) => cleanSignal(moveGuide[key])).length;
      }, 0),
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function hasModalityContract(profile = {}) {
  return Boolean(
    profile?.primaryMode &&
    profile?.sessionPattern &&
    profile?.interactionPattern &&
    profile?.artifactEnvironment &&
    profile?.teachingPattern?.signaturePractice &&
    profile?.teachingPattern?.evidenceRoutine &&
    profile?.teachingPattern?.feedbackRoutine &&
    profile?.teachingPattern?.instructorMove &&
    Array.isArray(profile?.participationDesign) &&
    profile.participationDesign.length > 0,
  );
}

function modalityTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') {
    return collectStrings({
      modalityCue: item.modalityCue,
      modalityDecodeCue: item.modalityDecodeCue,
      modalityDecode: item.modalityDecode,
      courseModalityProfile: item.courseModalityProfile,
    }).join(' ');
  }
  return collectStrings({
    modalityCue: item.modalityCue,
    modalityDecode: item.modalityDecode,
    courseModalityProfile: item.courseModalityProfile,
    modalityFit: item.modalityFit,
    readyToTeachModalityFit: item.readyToTeachSupport?.modalityFit,
    readyToTeachModalityPractice: item.readyToTeachSupport?.modalityPractice,
    readyToTeachModalityEvidenceRoutine: item.readyToTeachSupport?.modalityEvidenceRoutine,
    readyToTeachModalityFeedbackRoutine: item.readyToTeachSupport?.modalityFeedbackRoutine,
    slideDeckModalityFit: item.slideDeckSequenceGuide?.modalityFit,
    sourceGroundingModalityCue: grounding.modalityCue,
    sourceGroundingModalityDecode: grounding.modalityDecode,
    sourceGroundingCourseModalityProfile: grounding.courseModalityProfile,
  }).join(' ');
}

function buildModalityFitAudit({ blueprint, compiledFeatures, compiled, expectedMode = '' }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const profile = blueprint?.courseModalityProfile || {};
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  if (!hasModalityContract(profile)) {
    findings.push(
      makeFinding('blocker', 'blueprint', 'modalityFitProfile', 'Blueprint is missing course-modality fit profile.'),
    );
  }
  if (expectedMode && profile.primaryMode !== expectedMode) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'modalityGoldExpectation',
        `Blueprint course modality is ${profile.primaryMode || 'missing'}, expected ${expectedMode}.`,
      ),
    );
  }

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const expectedModalityCue = lesson.modalityCue || '';
    const expectedDecode = lesson.modalityDecode?.signaturePractice || profile.teachingPattern?.signaturePractice || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (!expectedModalityCue) {
      findings.push(
        makeFinding('blocker', 'blueprint', 'modalityFitLessonCue', `${lessonLabel} is missing modality-fit cue.`),
      );
    }
    if (
      !lesson.modalityDecode?.signaturePractice ||
      !lesson.modalityDecode?.evidenceRoutine ||
      !lesson.modalityDecode?.feedbackRoutine ||
      !lesson.modalityDecode?.instructorMove
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'modalityDecodeContract',
          `${lessonLabel} blueprint is missing modality-specific teaching decode.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const modalityText = modalityTraceForFeature(featureId, item, grounding);
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(makeFinding('blocker', featureId, 'modalityFitItem', `${lessonLabel} has no compiled item.`));
        continue;
      }
      if (expectedModalityCue && !hasKeywordTrace(expectedModalityCue, modalityText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'modalityFitStructuredTrace',
            `${lessonLabel} output does not preserve structured modality-fit evidence.`,
          ),
        );
      }
      if (expectedModalityCue && !hasKeywordTrace(expectedModalityCue, itemText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'modalityFitTextTrace',
            `${lessonLabel} output does not expose modality-fit language.`,
          ),
        );
      }
      if (expectedDecode && !hasKeywordTrace(expectedDecode, modalityText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'modalityDecodeStructuredTrace',
            `${lessonLabel} output does not preserve structured modality teaching pattern.`,
          ),
        );
      }
      if (expectedDecode && !hasKeywordTrace(expectedDecode, itemText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'modalityDecodeTextTrace',
            `${lessonLabel} output does not expose modality-specific teaching practice.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      primaryMode: profile.primaryMode || 'missing',
      modalityCue: expectedModalityCue,
      modalityDecode: expectedDecode,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    primaryMode: profile.primaryMode || 'missing',
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function hasArtifactGenreContract(artifactGenre = {}) {
  return Boolean(
    artifactGenre?.genre &&
    artifactGenre?.outputFormat &&
    artifactGenre?.evidenceRequirement &&
    artifactGenre?.qualityFocus &&
    artifactGenre?.reviewProtocol &&
    artifactGenre?.commonFailure &&
    artifactGenre?.revisionMove,
  );
}

function hasAssignmentArtifactSubmissionProfile(item = {}) {
  const profile = item?.submissionProfile || {};
  const workload = profile.workload || item?.workloadEstimate || {};
  const genericRotatingTypes = new Set(['case study', 'reflection', 'applied project']);
  const assignmentType = cleanSignal(profile.assignmentType || item.assignmentType).toLowerCase();
  return Boolean(
    profile.assignmentType &&
    profile.artifactGenre &&
    profile.expectedFormat &&
    profile.evidenceRequirement &&
    profile.qualityFocus &&
    profile.reviewProtocol &&
    profile.estimatedTime &&
    profile.estimatedTime !== '2-4 hours' &&
    item.assignmentType === profile.assignmentType &&
    !genericRotatingTypes.has(assignmentType) &&
    Number(workload.totalStudentMinutes || 0) > 0 &&
    Number.isFinite(Number(workload.outOfClassMinutes || 0)) &&
    profile.workload?.outOfClassEstimate &&
    item.formatRequirements?.format &&
    item.formatRequirements?.reviewProtocol,
  );
}

function hasDiscussionProtocolProfile(item = {}) {
  const protocol = item?.discussionProtocol || {};
  return Boolean(
    protocol.format &&
    item.format === protocol.format &&
    protocol.modality &&
    protocol.artifactGenre &&
    protocol.participationPattern &&
    protocol.evidenceMove &&
    protocol.artifactUse &&
    protocol.reviewFocus &&
    protocol.facilitationMove &&
    protocol.modalityFit &&
    protocol.artifactGenreFit &&
    item.sourceGrounding?.discussionProtocol?.format === protocol.format &&
    item.facilitationTips?.opening &&
    item.facilitationTips?.closure &&
    item.guidelines &&
    item.guidelines.includes(protocol.participationPattern),
  );
}

function hasSourceGroundedQuizPlan(quiz = {}) {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const plan = quiz.quizBlueprint || {};
  return Boolean(
    plan.source === 'source-grounded-quiz-plan' &&
    Array.isArray(plan.questionPlan) &&
    plan.questionPlan.length === questions.length &&
    questions.length >= 5 &&
    questions.every(
      (question) =>
        question?.quizPlan?.source === 'source-grounded-quiz-plan' &&
        question.quizPlan.role &&
        question.quizPlan.bloomSource &&
        question.quizPlan.sourceSignal &&
        question.quizPlan.objectiveAlignmentStrategy &&
        question.quizPlan.source !== 'fixed-sequence' &&
        question.objectiveAligned &&
        question.bloomsLevel,
    ),
  );
}

function hasPurposeAwareSlideVisuals(deck = {}) {
  const visualSlides = (deck.slides || []).filter((slide) => slide?.visual?.kind && slide.visual.kind !== 'none');
  const legacyRotatingKinds = new Set(['diagram', 'table', 'chart', 'image']);
  return Boolean(
    visualSlides.length >= 5 &&
    visualSlides.every((slide) => {
      const visual = slide.visual || {};
      const plan = visual.visualPlan || {};
      return (
        visual.kind &&
        !legacyRotatingKinds.has(String(visual.kind).toLowerCase()) &&
        visual.description &&
        visual.altText &&
        plan.slidePurpose &&
        plan.evidenceSource &&
        plan.artifactConnection &&
        plan.modalityFit &&
        plan.artifactGenreFit &&
        plan.studentAction &&
        plan.accessibilityCheck
      );
    }),
  );
}

function artifactGenreTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') {
    return collectStrings({
      artifactGenreCue: item.artifactGenreCue,
      artifactGenre: item.artifactGenre,
      packageCoherenceMatrix: item.packageCoherenceMatrix,
    }).join(' ');
  }
  return collectStrings({
    artifactGenre: item.artifactGenre,
    submissionProfile: item.submissionProfile,
    formatRequirements: item.formatRequirements,
    artifactGenreReviewProtocol: item.artifactGenreReviewProtocol,
    artifactGenreCommonFailure: item.artifactGenreCommonFailure,
    artifactGenreFit: item.artifactGenreFit,
    readyToTeachArtifactGenreFit: item.readyToTeachSupport?.artifactGenreFit,
    readyToTeachGenreReviewProtocol: item.readyToTeachSupport?.genreReviewProtocol,
    readyToTeachGenreCommonFailure: item.readyToTeachSupport?.genreCommonFailure,
    readyToTeachGenreRevisionMove: item.readyToTeachSupport?.genreRevisionMove,
    slideDeckArtifactGenreFit: item.slideDeckSequenceGuide?.artifactGenreFit,
    sourceGroundingArtifactGenre: grounding.artifactGenre,
  }).join(' ');
}

function normalizeExpectedArtifactGenreEntry(entry) {
  if (!entry) return [];
  const values = Array.isArray(entry) ? entry : [entry];
  return values.map(cleanSignal).filter(Boolean);
}

function buildArtifactGenreAudit({ blueprint, compiledFeatures, compiled, expectedGenres = [] }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const expectedGenre = lesson.artifactGenre?.genre || '';
    const goldExpectedGenres = normalizeExpectedArtifactGenreEntry(expectedGenres[index]);
    const expectedOutputFormat = lesson.artifactGenre?.outputFormat || '';
    const expectedEvidence = lesson.artifactGenre?.evidenceRequirement || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (!hasArtifactGenreContract(lesson.artifactGenre)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'artifactGenreContract',
          `${lessonLabel} blueprint is missing student-artifact genre decode.`,
        ),
      );
    }
    if (
      goldExpectedGenres.length > 0 &&
      !goldExpectedGenres.some((goldGenre) => normalizeSignal(goldGenre) === normalizeSignal(expectedGenre))
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'artifactGenreGoldExpectation',
          `${lessonLabel} artifact genre is ${expectedGenre || 'missing'}, expected ${goldExpectedGenres.join(' or ')}.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const genreText = artifactGenreTraceForFeature(featureId, item, grounding);
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(makeFinding('blocker', featureId, 'artifactGenreItem', `${lessonLabel} has no compiled item.`));
        continue;
      }
      if (expectedGenre && !hasNormalizedTrace(expectedGenre, genreText)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'artifactGenreStructuredTrace',
            `${lessonLabel} output does not preserve structured artifact-genre evidence.`,
          ),
        );
      }
      if (expectedOutputFormat && !hasKeywordTrace(expectedOutputFormat, itemText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'artifactGenreOutputFormatTrace',
            `${lessonLabel} output does not expose the artifact-genre output format.`,
          ),
        );
      }
      if (expectedEvidence && !hasKeywordTrace(expectedEvidence, itemText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'artifactGenreEvidenceTrace',
            `${lessonLabel} output does not expose the artifact-genre evidence standard.`,
          ),
        );
      }
      if (
        featureId === 'assignments' &&
        (!hasAssignmentArtifactSubmissionProfile(item) ||
          (expectedGenre &&
            normalizeSignal(item?.submissionProfile?.artifactGenre || '') !== normalizeSignal(expectedGenre)))
      ) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'artifactGenreSubmissionProfile',
            `${lessonLabel} assignment does not decode artifact genre, workload, format, and review protocol into the submission profile.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      genre: expectedGenre || 'missing',
      expectedGenre: goldExpectedGenres.join(' or '),
      genreExpectationStatus:
        goldExpectedGenres.length === 0
          ? 'not-specified'
          : goldExpectedGenres.some((goldGenre) => normalizeSignal(goldGenre) === normalizeSignal(expectedGenre))
            ? 'pass'
            : 'blocked',
      outputFormat: expectedOutputFormat,
      evidenceRequirement: expectedEvidence,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  const expectedRows = rows.filter((row) => row.expectedGenre);
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    expectedRows: expectedRows.length,
    expectedMatches: expectedRows.filter((row) => row.genreExpectationStatus === 'pass').length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function minutesFromDuration(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function buildSessionFeasibilityAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const lessonFeatures = ['lessonPlans', 'slideDecks'].filter((featureId) => compiledFeatures.includes(featureId));

  const rows = lessons.map((lesson, index) => {
    const plan = lesson.classSessionPlan || {};
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const segmentMinutes = Array.isArray(plan.segments)
      ? plan.segments.reduce((sum, segment) => sum + Number(segment.minutes || 0), 0)
      : 0;
    const missingFeatures = [];

    if (
      plan.feasibilityStatus !== 'fits-session' ||
      !plan.sessionMinutes ||
      !plan.plannedClassMinutes ||
      segmentMinutes !== plan.plannedClassMinutes ||
      Number(plan.overageMinutes || 0) > 0
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'sessionFeasibilityBlueprint',
          `${lessonLabel} does not have a feasible class-session timing plan.`,
        ),
      );
    }

    if (compiledFeatures.includes('lessonPlans')) {
      const lessonPlan = featureItemForLesson('lessonPlans', compiled.lessonPlans, index);
      const outlineMinutes = Array.isArray(lessonPlan?.outline)
        ? lessonPlan.outline.reduce((sum, item) => sum + minutesFromDuration(item.time), 0)
        : 0;
      if (
        lessonPlan?.classSessionPlan?.feasibilityStatus !== 'fits-session' ||
        lessonPlan?.outlineTiming?.status !== 'fits-session' ||
        outlineMinutes !== plan.plannedClassMinutes
      ) {
        missingFeatures.push('lessonPlans');
        findings.push(
          makeFinding(
            'blocker',
            'lessonPlans',
            'sessionFeasibilityLessonPlan',
            `${lessonLabel} lesson plan does not preserve the class-session timing plan.`,
          ),
        );
      }
    }

    if (compiledFeatures.includes('slideDecks')) {
      const deck = featureItemForLesson('slideDecks', compiled.slideDecks, index);
      if (
        deck?.slideTimingFit?.status !== 'fits-session-with-activity-time' ||
        !deck?.slideDeckSequenceGuide?.classSessionPlan?.plannedClassMinutes
      ) {
        missingFeatures.push('slideDecks');
        findings.push(
          makeFinding(
            'blocker',
            'slideDecks',
            'sessionFeasibilitySlideDeck',
            `${lessonLabel} slide deck does not expose feasible timing for live practice.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      status: plan.feasibilityStatus || 'missing',
      plannedClassMinutes: plan.plannedClassMinutes || 0,
      sessionMinutes: plan.sessionMinutes || 0,
      segmentMinutes,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: missingFeatures.length,
      missingFeatures,
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function buildAssessmentArchitectureAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const rows = Array.isArray(blueprint?.assessmentArchitecture?.lessonRows)
    ? blueprint.assessmentArchitecture.lessonRows
    : [];
  const lessonFeatures = ['assignments', 'rubrics'].filter((featureId) => compiledFeatures.includes(featureId));

  if (
    blueprint?.assessmentArchitecture?.status !== 'balanced' ||
    blueprint.assessmentArchitecture.totalWeightPercent !== 100 ||
    !blueprint.assessmentArchitecture.weightSourceStatus ||
    !Array.isArray(blueprint.assessmentArchitecture.weightRows) ||
    blueprint.assessmentArchitecture.weightRows.length !== (blueprint.lessons || []).length ||
    !blueprint.assessmentArchitecture.weightConfirmationPolicy ||
    rows.length !== (blueprint.lessons || []).length
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'assessmentArchitectureBlueprint',
        'Blueprint assessment architecture is missing or unbalanced.',
      ),
    );
  }

  rows.forEach((row, index) => {
    const lessonLabel = `Lesson ${row.lessonNumber}`;
    if (
      !row.role ||
      !row.roleLabel ||
      !row.weightPercent ||
      !row.weightProvenance?.source ||
      !row.feedbackWindow ||
      !row.revisionUse
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'assessmentArchitectureRow',
          `${lessonLabel} is missing assessment role, weight, feedback, or revision evidence.`,
        ),
      );
    }

    if (compiledFeatures.includes('assignments')) {
      const assignment = featureItemForLesson('assignments', compiled.assignments, index);
      if (
        assignment?.assessmentArchitecture?.role !== row.role ||
        assignment?.weightPercent !== row.weightPercent ||
        assignment?.assessmentArchitecture?.weightProvenance?.source !== row.weightProvenance?.source ||
        !assignment?.assessmentCadence?.feedbackWindow ||
        !assignment?.revisionUse
      ) {
        findings.push(
          makeFinding(
            'blocker',
            'assignments',
            'assessmentArchitectureAssignment',
            `${lessonLabel} assignment does not preserve assessment architecture.`,
          ),
        );
      }
    }

    if (compiledFeatures.includes('rubrics')) {
      const rubric = featureItemForLesson('rubrics', compiled.rubrics, index);
      if (
        rubric?.assessmentArchitecture?.role !== row.role ||
        rubric?.weightPercent !== row.weightPercent ||
        rubric?.assessmentArchitecture?.weightProvenance?.source !== row.weightProvenance?.source ||
        !rubric?.assessmentCadence?.feedbackWindow ||
        !rubric?.revisionUse
      ) {
        findings.push(
          makeFinding(
            'blocker',
            'rubrics',
            'assessmentArchitectureRubric',
            `${lessonLabel} rubric does not preserve assessment architecture.`,
          ),
        );
      }
    }
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    totalWeightPercent: blueprint?.assessmentArchitecture?.totalWeightPercent ?? null,
    highStakesWeightPercent: blueprint?.assessmentArchitecture?.highStakesWeightPercent ?? null,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function criterionWeightTotal(plan = []) {
  return plan.reduce((sum, entry) => sum + Number(entry?.weight || 0), 0);
}

function hasUsableCriterionWeightPlan(plan = [], expectedCount = 4) {
  return (
    Array.isArray(plan) &&
    plan.length >= expectedCount &&
    criterionWeightTotal(plan) === 100 &&
    plan.every(
      (entry) =>
        entry?.criterion &&
        Number.isFinite(entry.weight) &&
        Number.isFinite(entry.points) &&
        entry.priority &&
        entry.rationale &&
        entry.evidenceSignal &&
        entry.calibrationUse &&
        entry.feedbackUse,
    )
  );
}

function hasUsableCriterionObjectiveAlignment(plan = [], expectedCount = 4) {
  return (
    Array.isArray(plan) &&
    plan.length >= expectedCount &&
    plan.every(
      (entry) =>
        entry?.criterion && entry.objective && entry.strategy && entry.strategy !== 'index-rotation' && entry.rationale,
    )
  );
}

function hasUsableCriterionPerformanceBands(criteria = [], expectedCount = 4) {
  const bandNames = ['exemplary', 'proficient', 'developing', 'beginning'];
  const genericBandPattern =
    /\b(Exceeds expectations on|Meets ".+" with accurate evidence|Partially meets ".+" but needs stronger|Shows limited evidence for)\b/i;
  return (
    Array.isArray(criteria) &&
    criteria.length >= expectedCount &&
    criteria.every(
      (entry) =>
        bandNames.every((band) => wordCount(entry?.[band] || '') >= 10) &&
        !bandNames.some((band) => genericBandPattern.test(entry?.[band] || '')) &&
        entry?.performanceBandEvidence?.priority &&
        entry.performanceBandEvidence.evidenceSignal &&
        entry.performanceBandEvidence.scorerQuestion &&
        entry.performanceBandEvidence.commonPitfall &&
        entry.performanceBandEvidence.revisionTarget,
    )
  );
}

function buildCriterionWeightingAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const assessments = Array.isArray(blueprint?.assessments) ? blueprint.assessments : [];
  const lessonFeatures = ['assignments', 'rubrics'].filter((featureId) => compiledFeatures.includes(featureId));

  assessments.forEach((assessment, index) => {
    const lessonNumber = assessment.lessonNumbers?.[0] || index + 1;
    const lessonLabel = `Lesson ${lessonNumber}`;
    const expectedCount = Array.isArray(assessment.criteria) ? assessment.criteria.length : 4;
    if (!hasUsableCriterionWeightPlan(assessment.criterionWeightPlan, expectedCount)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'criterionWeightPlan',
          `${lessonLabel} assessment is missing a 100% criterion-weight plan with rationale, evidence, calibration, and feedback use.`,
        ),
      );
    }
    if (!hasUsableCriterionObjectiveAlignment(assessment.criterionObjectiveAlignment, expectedCount)) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'criterionObjectiveAlignment',
          `${lessonLabel} assessment is missing source-text criterion-to-objective alignment.`,
        ),
      );
    }

    if (compiledFeatures.includes('assignments')) {
      const assignment = featureItemForLesson('assignments', compiled.assignments, index);
      const assignmentPlan =
        assignment?.criterionWeightPlan ||
        assignment?.weightedGradingCriteria ||
        assignment?.sourceGrounding?.criterionWeightPlan ||
        [];
      if (!hasUsableCriterionWeightPlan(assignmentPlan, expectedCount) || !assignment?.criterionWeightGuidance) {
        findings.push(
          makeFinding(
            'blocker',
            'assignments',
            'criterionWeightPlanAssignment',
            `${lessonLabel} assignment does not preserve weighted criterion guidance.`,
          ),
        );
      }
    }

    if (compiledFeatures.includes('rubrics')) {
      const rubric = featureItemForLesson('rubrics', compiled.rubrics, index);
      const rubricPlan = rubric?.criterionWeightPlan || rubric?.blueprintGrounding?.criterionWeightPlan || [];
      const rubricCriteria = Array.isArray(rubric?.criteria) ? rubric.criteria : [];
      const rubricCriteriaTotal = criterionWeightTotal(rubricCriteria);
      if (
        !hasUsableCriterionWeightPlan(rubricPlan, expectedCount) ||
        !hasUsableCriterionObjectiveAlignment(
          rubric?.blueprintGrounding?.criterionObjectiveAlignment || rubric?.criterionObjectiveAlignment || [],
          expectedCount,
        ) ||
        rubricCriteria.length < expectedCount ||
        rubricCriteriaTotal !== 100 ||
        !hasUsableCriterionPerformanceBands(rubricCriteria, expectedCount) ||
        rubricCriteria.some(
          (entry) =>
            !entry.objectiveAligned ||
            !entry.objectiveAlignmentEvidence?.strategy ||
            entry.objectiveAlignmentEvidence.strategy === 'index-rotation' ||
            !entry.priority ||
            !entry.weightingRationale ||
            !entry.evidenceSignal ||
            !entry.calibrationUse ||
            !entry.feedbackUse,
        )
      ) {
        findings.push(
          makeFinding(
            'blocker',
            'rubrics',
            'criterionWeightPlanRubric',
            `${lessonLabel} rubric does not preserve criterion weights, objective alignment, rationale, evidence signals, performance bands, and calibration use.`,
          ),
        );
      }
    }
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: assessments.length,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows: assessments.map((assessment, index) => ({
      lessonNumber: assessment.lessonNumbers?.[0] || index + 1,
      assessmentTitle: assessment.title,
      criterionCount: Array.isArray(assessment.criterionWeightPlan) ? assessment.criterionWeightPlan.length : 0,
      totalWeight: criterionWeightTotal(assessment.criterionWeightPlan || []),
      weightCue: (assessment.criterionWeightPlan || [])
        .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
        .join('; '),
      objectiveAlignmentCue: (assessment.criterionObjectiveAlignment || [])
        .map((entry) => `${entry.criterion}: ${entry.objective}`)
        .join('; '),
    })),
  };
}

function structuredGroundingForFeature(featureId, item = {}) {
  if (featureId === 'syllabus') return item || {};
  return item?.sourceGrounding || item?.blueprintGrounding || {};
}

function hasConceptGraphContract(blueprint = {}, scope = 0) {
  const graph = blueprint.conceptDependencyGraph || {};
  return Boolean(
    graph.status === 'sequenced' &&
    Array.isArray(graph.nodes) &&
    graph.nodes.length === scope &&
    Array.isArray(graph.practiceRows) &&
    graph.practiceRows.length === scope &&
    graph.conceptThread &&
    (scope <= 1 || (Array.isArray(graph.edges) && graph.edges.length >= scope - 1)),
  );
}

function conceptGraphTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') {
    return collectStrings({
      conceptDependencyCue: item.conceptDependencyCue,
      conceptTransferCue: item.conceptTransferCue,
      practiceProgressionCue: item.practiceProgressionCue,
      practiceProgressionTransferCue: item.practiceProgressionTransferCue,
      conceptDependencyPlan: item.conceptDependencyPlan,
      practiceProgressionPlan: item.practiceProgressionPlan,
      conceptDependencyGraph: item.blueprintQualityReceipt?.conceptDependencyGraph || item.conceptDependencyGraph,
    }).join(' ');
  }
  return collectStrings({
    conceptDependencyPlan: grounding.conceptDependencyPlan || item.conceptDependencyPlan,
    practiceProgressionPlan: grounding.practiceProgressionPlan || item.practiceProgressionPlan,
    readyToTeachConceptDependency: item.readyToTeachSupport?.conceptDependencyCue,
    readyToTeachConceptTransfer: item.readyToTeachSupport?.conceptTransferCue,
    readyToTeachPracticeProgression: item.readyToTeachSupport?.practiceProgressionCue,
  }).join(' ');
}

function buildConceptGraphAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const scope = lessons.length;
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  if (!hasConceptGraphContract(blueprint, scope)) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'conceptDependencyGraph',
        'Blueprint is missing a sequenced concept dependency graph.',
      ),
    );
  }

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const expectedConcept = lesson.practiceProgressionPlan?.currentConcept || lesson.keyConcepts?.[0] || '';
    const expectedPractice = lesson.practiceProgressionPlan?.practiceFocus || '';
    const expectedTransfer =
      lesson.practiceProgressionPlan?.transferTask || lesson.conceptDependencyPlan?.transferCue || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (
      !lesson.conceptDependencyPlan?.node?.concept ||
      !lesson.conceptDependencyPlan?.dependencyCue ||
      !lesson.conceptDependencyPlan?.transferCue ||
      !lesson.practiceProgressionPlan?.practiceFocus ||
      !lesson.practiceProgressionPlan?.evidenceRoutine ||
      !lesson.practiceProgressionPlan?.feedbackRoutine ||
      !lesson.practiceProgressionPlan?.transferTask
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'conceptDependencyPlan',
          `${lessonLabel} is missing concept dependency or practice progression planning.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const traceText = `${conceptGraphTraceForFeature(featureId, item, grounding)} ${itemText}`;
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(makeFinding('blocker', featureId, 'conceptGraphItem', `${lessonLabel} has no compiled item.`));
        continue;
      }
      if (expectedConcept && !hasKeywordTrace(expectedConcept, traceText, 6)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'conceptGraphConceptTrace',
            `${lessonLabel} output does not preserve the concept dependency node.`,
          ),
        );
      }
      if (expectedPractice && !hasKeywordTrace(expectedPractice, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'conceptGraphPracticeTrace',
            `${lessonLabel} output does not preserve the practice progression routine.`,
          ),
        );
      }
      if (expectedTransfer && !hasKeywordTrace(expectedTransfer, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'conceptGraphTransferTrace',
            `${lessonLabel} output does not preserve the transfer edge.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      concept: expectedConcept,
      priorConcept: lesson.practiceProgressionPlan?.priorConcept || '',
      nextConcept: lesson.practiceProgressionPlan?.nextConcept || '',
      edgeCount:
        (lesson.conceptDependencyPlan?.incomingEdges || []).length +
        (lesson.conceptDependencyPlan?.outgoingEdges || []).length,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    nodeCount: blueprint?.conceptDependencyGraph?.nodeCount || 0,
    edgeCount: blueprint?.conceptDependencyGraph?.edgeCount || 0,
    checkedFeatures: lessonFeatures.length,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function hasMasteryEvidenceContract(blueprint = {}, scope = 0) {
  const map = blueprint.masteryEvidenceMap || {};
  return Boolean(
    map.status === 'complete' &&
    Array.isArray(map.lessonRows) &&
    map.lessonRows.length === scope &&
    Array.isArray(map.checkedStages) &&
    map.checkedStages.length >= 6 &&
    map.missingFieldCount === 0,
  );
}

function masteryEvidenceTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') {
    return collectStrings({
      masteryDiagnosticCue: item.masteryDiagnosticCue,
      masteryGuidedPracticeCue: item.masteryGuidedPracticeCue,
      masteryPerformanceCue: item.masteryPerformanceCue,
      masteryRevisionCue: item.masteryRevisionCue,
      masteryTransferCue: item.masteryTransferCue,
      masteryThresholdCue: item.masteryThresholdCue,
      masteryEvidencePlan: item.masteryEvidencePlan,
      masteryEvidenceMap: item.blueprintQualityReceipt?.masteryEvidenceMap || item.masteryEvidenceMap,
    }).join(' ');
  }
  return collectStrings({
    masteryEvidencePlan: grounding.masteryEvidencePlan || item.masteryEvidencePlan,
    readyToTeachDiagnostic: item.readyToTeachSupport?.masteryDiagnosticEvidence,
    readyToTeachPractice: item.readyToTeachSupport?.masteryGuidedPracticeEvidence,
    readyToTeachPerformance: item.readyToTeachSupport?.masteryPerformanceEvidence,
    readyToTeachRevision: item.readyToTeachSupport?.masteryRevisionEvidence,
    readyToTeachTransfer: item.readyToTeachSupport?.masteryTransferEvidence,
    readyToTeachThreshold: item.readyToTeachSupport?.masteryThreshold,
  }).join(' ');
}

function buildMasteryEvidenceAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const scope = lessons.length;
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  if (!hasMasteryEvidenceContract(blueprint, scope)) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'masteryEvidenceMap',
        'Blueprint is missing a complete mastery-evidence map.',
      ),
    );
  }

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const plan = lesson.masteryEvidencePlan || {};
    const expectedPerformance = plan.independentPerformanceEvidence || '';
    const expectedRevision = plan.feedbackRevisionEvidence || '';
    const expectedTransfer = plan.transferEvidence || '';
    const expectedThreshold = plan.masteryThreshold || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (
      !plan.diagnosticEvidence ||
      !plan.guidedPracticeEvidence ||
      !plan.independentPerformanceEvidence ||
      !plan.feedbackRevisionEvidence ||
      !plan.transferEvidence ||
      !plan.misconceptionRepairEvidence ||
      !plan.masteryThreshold ||
      !Array.isArray(plan.evidencePortfolio) ||
      plan.evidencePortfolio.length < 6
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'masteryEvidencePlan',
          `${lessonLabel} is missing mastery evidence stages.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const traceText = `${masteryEvidenceTraceForFeature(featureId, item, grounding)} ${itemText}`;
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(makeFinding('blocker', featureId, 'masteryEvidenceItem', `${lessonLabel} has no compiled item.`));
        continue;
      }
      if (expectedPerformance && !hasKeywordTrace(expectedPerformance, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'masteryPerformanceTrace',
            `${lessonLabel} output does not preserve independent-performance mastery evidence.`,
          ),
        );
      }
      if (expectedRevision && !hasKeywordTrace(expectedRevision, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'masteryRevisionTrace',
            `${lessonLabel} output does not preserve feedback-revision mastery evidence.`,
          ),
        );
      }
      if (expectedTransfer && !hasKeywordTrace(expectedTransfer, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'masteryTransferTrace',
            `${lessonLabel} output does not preserve transfer mastery evidence.`,
          ),
        );
      }
      if (expectedThreshold && !hasKeywordTrace(expectedThreshold, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'masteryThresholdTrace',
            `${lessonLabel} output does not preserve the mastery threshold.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      concept: plan.concept || lesson.keyConcepts?.[0] || '',
      evidenceStages: Array.isArray(plan.evidencePortfolio) ? plan.evidencePortfolio.length : 0,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    checkedStages: blueprint?.masteryEvidenceMap?.checkedStages?.length || 0,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function hasEvidenceResponseContract(blueprint = {}, scope = 0) {
  const map = blueprint.evidenceResponseMap || {};
  return Boolean(
    map.status === 'complete' &&
    Array.isArray(map.lessonRows) &&
    map.lessonRows.length === scope &&
    Array.isArray(map.checkedStates) &&
    map.checkedStates.length >= 3 &&
    map.missingFieldCount === 0,
  );
}

function evidenceResponseTraceForFeature(featureId, item = {}, grounding = {}) {
  if (featureId === 'syllabus') {
    return collectStrings({
      evidenceReadyResponseCue: item.evidenceReadyResponseCue,
      evidencePartialResponseCue: item.evidencePartialResponseCue,
      evidenceSupportResponseCue: item.evidenceSupportResponseCue,
      evidenceRecheckCue: item.evidenceRecheckCue,
      evidenceResponsePlan: item.evidenceResponsePlan,
      evidenceResponseMap: item.blueprintQualityReceipt?.evidenceResponseMap || item.evidenceResponseMap,
    }).join(' ');
  }
  return collectStrings({
    evidenceResponsePlan: grounding.evidenceResponsePlan || item.evidenceResponsePlan,
    readyResponse: item.readyToTeachSupport?.evidenceReadyResponse,
    partialResponse: item.readyToTeachSupport?.evidencePartialResponse,
    supportResponse: item.readyToTeachSupport?.evidenceSupportResponse,
    recheckResponse: item.readyToTeachSupport?.evidenceResponseRecheck,
  }).join(' ');
}

function buildEvidenceResponseAudit({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const scope = lessons.length;
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  if (!hasEvidenceResponseContract(blueprint, scope)) {
    findings.push(
      makeFinding(
        'blocker',
        'blueprint',
        'evidenceResponseMap',
        'Blueprint is missing a complete evidence-response decision map.',
      ),
    );
  }

  const rows = lessons.map((lesson, index) => {
    const lessonLabel = `Lesson ${lesson.lessonNumber}`;
    const plan = lesson.evidenceResponsePlan || {};
    const expectedReady = plan.readyMove || '';
    const expectedPartial = plan.partialMove || '';
    const expectedSupport = plan.supportMove || '';
    const expectedRecheck = plan.recheckCue || '';
    const missingFeatures = [];
    const compiledFindingsBefore = findings.length;

    if (
      !plan.readySignal ||
      !plan.partialSignal ||
      !plan.supportSignal ||
      !plan.readyMove ||
      !plan.partialMove ||
      !plan.supportMove ||
      !plan.recheckCue ||
      !Array.isArray(plan.decisionStates) ||
      plan.decisionStates.length < 3
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'blueprint',
          'evidenceResponsePlan',
          `${lessonLabel} is missing ready, partial, or needs-support evidence-response decisions.`,
        ),
      );
    }

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const traceText = `${evidenceResponseTraceForFeature(featureId, item, grounding)} ${itemText}`;
      if (!itemText) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding('blocker', featureId, 'evidenceResponseItem', `${lessonLabel} has no compiled item.`),
        );
        continue;
      }
      if (expectedReady && !hasKeywordTrace(expectedReady, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'evidenceReadyResponseTrace',
            `${lessonLabel} output does not preserve the ready-student response.`,
          ),
        );
      }
      if (expectedPartial && !hasKeywordTrace(expectedPartial, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'evidencePartialResponseTrace',
            `${lessonLabel} output does not preserve the partial-evidence response.`,
          ),
        );
      }
      if (expectedSupport && !hasKeywordTrace(expectedSupport, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'evidenceSupportResponseTrace',
            `${lessonLabel} output does not preserve the needs-support response.`,
          ),
        );
      }
      if (expectedRecheck && !hasKeywordTrace(expectedRecheck, traceText, 8)) {
        missingFeatures.push(featureId);
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'evidenceRecheckTrace',
            `${lessonLabel} output does not preserve the recheck cue.`,
          ),
        );
      }
    }

    return {
      lessonNumber: lesson.lessonNumber,
      concept: plan.concept || lesson.keyConcepts?.[0] || '',
      decisionStates: Array.isArray(plan.decisionStates) ? plan.decisionStates.length : 0,
      checkedFeatures: lessonFeatures.length,
      compiledFindingCount: findings.length - compiledFindingsBefore,
      missingFeatures: uniqueSignals(missingFeatures, lessonFeatures.length),
    };
  });

  const blueprintFindings = findings.filter((finding) => finding.featureId === 'blueprint').length;
  const compiledFindings = findings.length - blueprintFindings;
  return {
    status: summarizeFeatureStatus(findings),
    lessonRows: rows.length,
    checkedFeatures: lessonFeatures.length,
    checkedStates: blueprint?.evidenceResponseMap?.checkedStates?.length || 0,
    blueprintFindings,
    compiledFindings,
    findings,
    rows,
  };
}

function groundingEvidenceRequirement(grounding = {}, item = {}) {
  return (
    grounding?.evidencePlan?.evidenceRequirement ||
    grounding?.evidenceRequirement ||
    item?.evidencePlan?.evidenceRequirement ||
    ''
  );
}

function normalizedEqual(left, right) {
  return normalizeAuditToken(left) === normalizeAuditToken(right);
}

function hasKeywordTrace(expected, actual, limit = 5) {
  const keywords = keywordSet(expected, limit);
  if (keywords.length === 0) return true;
  return tokenOverlap(keywords, actual).length > 0;
}

export function buildBlueprintFidelityFindings({ blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const rows = Array.isArray(blueprint?.alignmentMatrix) ? blueprint.alignmentMatrix : [];
  const lessonFeatures = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ].filter((featureId) => compiledFeatures.includes(featureId));

  rows.forEach((row, index) => {
    const lesson = blueprint.lessons?.[index] || {};
    const expectedConfidence = lesson.confidence?.level || 'medium';
    const expectedEvidence = lesson.evidencePlan?.evidenceRequirement || row.evidenceRequirement || '';
    const expectedSourceUse = lesson.sourceUsePlan?.noInventedSources || row.sourceUseCue || '';
    const expectedSourceEvidence = collectStrings(lesson.sourceEvidenceTrace?.sourceFields || []).join(' ');
    const expectedSectionCoverage = collectStrings(lesson.sourceEvidenceTrace?.sectionCoverage || []).join(' ');
    const expectedSourceRisk = lesson.sourceRisk?.riskLevel || row.sourceRiskLevel || '';
    const expectedArtifact = row.assessmentArtifact || lesson.studentArtifact || '';
    const expectedMisconception = lesson.misconceptionMap?.[0]?.misconception || row.misconceptionCheck || '';
    const expectedModelContrast = lesson.modelContrast?.exemplarMove || '';
    const expectedReadinessSupport = lesson.readinessSupport?.supportMove || '';
    const expectedPrerequisitePlan = lesson.prerequisitePlan?.diagnosticCheck || row.prerequisiteCue || '';
    const expectedConceptDependency = lesson.conceptDependencyPlan?.dependencyCue || row.conceptDependencyCue || '';
    const expectedPracticeProgression =
      lesson.practiceProgressionPlan?.practiceFocus || row.practiceProgressionCue || '';
    const expectedMasteryEvidence =
      lesson.masteryEvidencePlan?.independentPerformanceEvidence || row.masteryPerformanceCue || '';
    const expectedEvidenceResponse = lesson.evidenceResponsePlan?.partialMove || row.evidencePartialResponseCue || '';
    const expectedInstructionalRationale = lesson.instructionalRationale?.assessmentRationale || '';
    const expectedAccessibilityPlan = lesson.accessibilityPlan?.participationProtocol || '';
    const expectedFeedbackCycle = lesson.feedbackCycle?.studentRevisionAction || '';
    const expectedLearningTransfer = lesson.learningTransferPlan?.transferTask || '';
    const expectedTeachingIntent = lesson.teachingIntent?.teachingGoal || '';
    const expectedModalityCue = lesson.modalityCue || blueprint.courseModalityProfile?.primaryMode || '';
    const expectedArtifactGenre = lesson.artifactGenre?.genre || row.artifactGenreCue || '';
    const expectedArtifactGenreEvidence =
      lesson.artifactGenre?.evidenceRequirement || lesson.artifactGenre?.evidenceStandard || '';
    const expectedClassSessionStatus = lesson.classSessionPlan?.feasibilityStatus || '';
    const expectedLearnerContext =
      lesson.learnerContextCue || blueprint.learnerContextProfile?.coursePerformanceRole || '';
    const expectedCompilerDecision = lesson.compilerDecision?.generationPath || row.compilerDecisionCue || '';
    const expectedPublishGate = lesson.compilerDecision?.publishGate || row.publishGate || '';
    const expectedModelUsePolicy = lesson.compilerDecision?.modelUsePolicy || '';
    const expectedReviewFocus = collectStrings(lesson.compilerDecision?.reviewFocus || []).join(' ');
    const expectedAssessmentValidity =
      blueprint.assessments?.find((assessment) => (assessment.lessonNumbers || []).includes(lesson.lessonNumber))
        ?.validityEvidence?.targetConstruct || '';
    const expectedGradingCalibration =
      blueprint.assessments?.find((assessment) => (assessment.lessonNumbers || []).includes(lesson.lessonNumber))
        ?.calibrationPlan?.biasCheck || '';
    const expectedCriterionEvidence =
      blueprint.assessments?.find((assessment) => (assessment.lessonNumbers || []).includes(lesson.lessonNumber))
        ?.criterionEvidenceMap?.[0]?.evidenceNeeded || '';
    const expectedAnchorExample =
      blueprint.assessments?.find((assessment) => (assessment.lessonNumbers || []).includes(lesson.lessonNumber))
        ?.anchorExampleSet?.strongSample ||
      row.anchorExampleCue ||
      '';
    const expectedReviewFlags = Array.isArray(lesson.missingSignals) ? lesson.missingSignals : [];
    const expectedSuccessCriteria = Array.isArray(lesson.successCriteria) ? lesson.successCriteria.join(' ') : '';

    for (const featureId of lessonFeatures) {
      const item = featureItemForLesson(featureId, compiled[featureId], index);
      const itemText = collectStrings(item).join(' ');
      const grounding = structuredGroundingForFeature(featureId, item);
      const groundingText = collectStrings(grounding).join(' ');
      const traceText = `${groundingText} ${itemText}`;
      const lessonLabel = `Lesson ${row.lessonNumber}`;

      if (!itemText) {
        findings.push(
          makeFinding('blocker', featureId, 'blueprintFidelityItem', `${lessonLabel} has no compiled item.`),
        );
        continue;
      }

      if (featureId !== 'syllabus') {
        if (grounding.confidence !== expectedConfidence) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityConfidence',
              `${lessonLabel} grounding confidence is ${grounding.confidence || 'missing'}, expected ${expectedConfidence}.`,
            ),
          );
        }
        const actualEvidence = groundingEvidenceRequirement(grounding, item);
        if (expectedEvidence && !normalizedEqual(actualEvidence, expectedEvidence)) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityEvidence',
              `${lessonLabel} grounding does not preserve the blueprint evidence requirement.`,
            ),
          );
        }
        if (
          expectedSourceUse &&
          !hasKeywordTrace(
            expectedSourceUse,
            collectStrings(grounding.sourceUsePlan || item.sourceUsePlan || item.citationAndSourceUse || {}).join(
              ' ',
            ) || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySourceUse',
              `${lessonLabel} grounding does not preserve source-use and citation-integrity guidance.`,
            ),
          );
        }
        if (
          !Array.isArray(grounding.sourceEvidenceTrace?.sourceFields) ||
          grounding.sourceEvidenceTrace.sourceFields.length < 6
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySourceEvidence',
              `${lessonLabel} grounding does not preserve raw source provenance.`,
            ),
          );
        }
        if (
          Number(lesson.sourceEvidenceTrace?.sourceSectionCount || 0) > 1 &&
          (!Array.isArray(grounding.sourceEvidenceTrace?.sectionCoverage) ||
            grounding.sourceEvidenceTrace.sectionCoverage.length !== lesson.sourceEvidenceTrace.sourceSectionCount)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySectionCoverage',
              `${lessonLabel} grounding does not preserve multi-section source coverage.`,
            ),
          );
        }
        if (
          expectedSourceEvidence &&
          !hasKeywordTrace(expectedSourceEvidence, collectStrings(grounding.sourceEvidenceTrace || {}).join(' '), 8)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySourceEvidenceTrace',
              `${lessonLabel} grounding source provenance does not match the blueprint source evidence trace.`,
            ),
          );
        }
        if (
          expectedSectionCoverage &&
          !hasKeywordTrace(expectedSectionCoverage, collectStrings(grounding.sourceEvidenceTrace || {}).join(' '), 8)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySectionCoverageTrace',
              `${lessonLabel} grounding section coverage does not match the blueprint section trace.`,
            ),
          );
        }
        if (expectedSourceRisk && grounding.sourceRisk?.riskLevel !== expectedSourceRisk) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySourceRisk',
              `${lessonLabel} grounding source-risk level is ${grounding.sourceRisk?.riskLevel || 'missing'}, expected ${expectedSourceRisk}.`,
            ),
          );
        }
        if (
          expectedClassSessionStatus &&
          grounding.classSessionPlan?.feasibilityStatus !== expectedClassSessionStatus
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityClassSession',
              `${lessonLabel} grounding does not preserve class-session feasibility evidence.`,
            ),
          );
        }
        if (
          expectedMisconception &&
          !hasKeywordTrace(expectedMisconception, grounding.misconceptionFocus || traceText)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityMisconception',
              `${lessonLabel} grounding does not preserve the primary misconception check.`,
            ),
          );
        }
        if (
          expectedModelContrast &&
          !hasKeywordTrace(
            expectedModelContrast,
            collectStrings(grounding.modelContrast || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityModelContrast',
              `${lessonLabel} grounding does not preserve the exemplar/non-exemplar contrast.`,
            ),
          );
        }
        if (
          expectedReadinessSupport &&
          !hasKeywordTrace(
            expectedReadinessSupport,
            collectStrings(grounding.readinessSupport || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityReadinessSupport',
              `${lessonLabel} grounding does not preserve diagnostic support planning.`,
            ),
          );
        }
        if (
          expectedPrerequisitePlan &&
          !hasKeywordTrace(
            expectedPrerequisitePlan,
            collectStrings(grounding.prerequisitePlan || item.prerequisitePlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityPrerequisitePlan',
              `${lessonLabel} grounding does not preserve prerequisite-readiness planning.`,
            ),
          );
        }
        if (
          expectedConceptDependency &&
          !hasKeywordTrace(
            expectedConceptDependency,
            collectStrings(grounding.conceptDependencyPlan || item.conceptDependencyPlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityConceptDependency',
              `${lessonLabel} grounding does not preserve concept dependency planning.`,
            ),
          );
        }
        if (
          expectedPracticeProgression &&
          !hasKeywordTrace(
            expectedPracticeProgression,
            collectStrings(grounding.practiceProgressionPlan || item.practiceProgressionPlan || {}).join(' ') ||
              traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityPracticeProgression',
              `${lessonLabel} grounding does not preserve practice progression planning.`,
            ),
          );
        }
        if (
          expectedMasteryEvidence &&
          !hasKeywordTrace(
            expectedMasteryEvidence,
            collectStrings(grounding.masteryEvidencePlan || item.masteryEvidencePlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityMasteryEvidence',
              `${lessonLabel} grounding does not preserve mastery-evidence planning.`,
            ),
          );
        }
        if (
          expectedEvidenceResponse &&
          !hasKeywordTrace(
            expectedEvidenceResponse,
            collectStrings(grounding.evidenceResponsePlan || item.evidenceResponsePlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityEvidenceResponse',
              `${lessonLabel} grounding does not preserve evidence-response decisions.`,
            ),
          );
        }
        if (
          expectedInstructionalRationale &&
          !hasKeywordTrace(
            expectedInstructionalRationale,
            collectStrings(grounding.instructionalRationale || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityInstructionalRationale',
              `${lessonLabel} grounding does not preserve instructional design rationale.`,
            ),
          );
        }
        if (
          expectedAccessibilityPlan &&
          !hasKeywordTrace(
            expectedAccessibilityPlan,
            collectStrings(grounding.accessibilityPlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityAccessibilityPlan',
              `${lessonLabel} grounding does not preserve accessibility and participation planning.`,
            ),
          );
        }
        if (
          expectedFeedbackCycle &&
          !hasKeywordTrace(
            expectedFeedbackCycle,
            collectStrings(grounding.feedbackCycle || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityFeedbackCycle',
              `${lessonLabel} grounding does not preserve feedback and revision cycle.`,
            ),
          );
        }
        if (
          expectedLearningTransfer &&
          !hasKeywordTrace(
            expectedLearningTransfer,
            collectStrings(grounding.learningTransferPlan || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityLearningTransfer',
              `${lessonLabel} grounding does not preserve retrieval and transfer planning.`,
            ),
          );
        }
        if (
          expectedTeachingIntent &&
          !hasKeywordTrace(expectedTeachingIntent, collectStrings(grounding.teachingIntent || {}).join(' '), 8)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityTeachingIntent',
              `${lessonLabel} grounding does not preserve teaching-intent sequencing.`,
            ),
          );
        }
        if (
          expectedModalityCue &&
          !hasKeywordTrace(expectedModalityCue, modalityTraceForFeature(featureId, item, grounding), 8)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityModalityFit',
              `${lessonLabel} grounding does not preserve modality-fit evidence.`,
            ),
          );
        }
        if (
          expectedArtifactGenre &&
          !hasNormalizedTrace(expectedArtifactGenre, artifactGenreTraceForFeature(featureId, item, grounding))
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityArtifactGenre',
              `${lessonLabel} grounding does not preserve artifact-genre evidence.`,
            ),
          );
        }
        if (
          expectedLearnerContext &&
          !hasKeywordTrace(
            expectedLearnerContext,
            [
              grounding.learnerContextCue,
              collectStrings(grounding.learnerContextProfile || {}).join(' '),
              item.learnerContextCue,
              traceText,
            ].join(' '),
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityLearnerContext',
              `${lessonLabel} grounding does not preserve learner-context assumptions.`,
            ),
          );
        }
        if (expectedCompilerDecision && grounding.compilerDecision?.generationPath !== expectedCompilerDecision) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityCompilerDecision',
              `${lessonLabel} grounding does not preserve the compiler decision path.`,
            ),
          );
        }
        if (expectedPublishGate && grounding.compilerDecision?.publishGate !== expectedPublishGate) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityPublishGate',
              `${lessonLabel} grounding does not preserve the publish gate.`,
            ),
          );
        }
        if (
          expectedModelUsePolicy &&
          !hasKeywordTrace(expectedModelUsePolicy, collectStrings(grounding.compilerDecision || {}).join(' '), 8)
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityModelUsePolicy',
              `${lessonLabel} grounding does not preserve the model-use policy.`,
            ),
          );
        }
        if (
          expectedReviewFocus &&
          !hasKeywordTrace(
            expectedReviewFocus,
            collectStrings(grounding.compilerDecision?.reviewFocus || []).join(' '),
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityHandoffReviewFocus',
              `${lessonLabel} grounding does not preserve the handoff review focus.`,
            ),
          );
        }
        if (
          ['assignments', 'rubrics'].includes(featureId) &&
          expectedAssessmentValidity &&
          !hasKeywordTrace(
            expectedAssessmentValidity,
            collectStrings(grounding.assessmentValidity || {}).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityAssessmentValidity',
              `${lessonLabel} grounding does not preserve assessment-validity evidence.`,
            ),
          );
        }
        if (
          ['lessonPlans', 'assignments', 'rubrics'].includes(featureId) &&
          expectedGradingCalibration &&
          !hasKeywordTrace(
            expectedGradingCalibration,
            collectStrings(
              grounding.gradingCalibrationPlan || item.gradingCalibration || item.calibrationProtocol || {},
            ).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityGradingCalibration',
              `${lessonLabel} grounding does not preserve grading-calibration evidence.`,
            ),
          );
        }
        if (
          ['lessonPlans', 'assignments', 'rubrics'].includes(featureId) &&
          expectedCriterionEvidence &&
          !hasKeywordTrace(
            expectedCriterionEvidence,
            collectStrings(
              grounding.criterionEvidenceMap ||
                item.criterionEvidenceMap ||
                item.criterionEvidenceChecklist ||
                item.readyToTeachSupport?.criterionEvidencePrompt ||
                {},
            ).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityCriterionEvidence',
              `${lessonLabel} grounding does not preserve criterion-evidence guidance.`,
            ),
          );
        }
        if (
          expectedAnchorExample &&
          !hasKeywordTrace(
            expectedAnchorExample,
            collectStrings(
              grounding.anchorExampleSet ||
                item.anchorExampleSet ||
                item.anchorExamples ||
                item.readyToTeachSupport?.assessmentAnchorExamples ||
                {},
            ).join(' ') || traceText,
            8,
          )
        ) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelityAnchorExample',
              `${lessonLabel} grounding does not preserve assessment anchor examples.`,
            ),
          );
        }
        if (expectedSuccessCriteria && !hasKeywordTrace(expectedSuccessCriteria, traceText, 8)) {
          findings.push(
            makeFinding(
              'blocker',
              featureId,
              'blueprintFidelitySuccessCriteria',
              `${lessonLabel} grounding does not preserve success criteria.`,
            ),
          );
        }
        if (expectedReviewFlags.length > 0) {
          const actualReviewFlags = collectStrings(grounding.localReviewNeeded || []).join(' ');
          if (!hasKeywordTrace(expectedReviewFlags.join(' '), actualReviewFlags, 8)) {
            findings.push(
              makeFinding(
                'blocker',
                featureId,
                'blueprintFidelityReviewFlags',
                `${lessonLabel} grounding does not preserve local-review flags.`,
              ),
            );
          }
        }
      }

      if (expectedEvidence && !hasKeywordTrace(expectedEvidence, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityEvidenceTrace',
            `${lessonLabel} output does not expose the evidence requirement trace.`,
          ),
        );
      }
      if (expectedSourceUse && !hasKeywordTrace(expectedSourceUse, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelitySourceUseTrace',
            `${lessonLabel} output does not expose the source-use trace.`,
          ),
        );
      }
      if (
        expectedSourceEvidence &&
        (featureId !== 'syllabus'
          ? !hasKeywordTrace(expectedSourceEvidence, traceText, 8)
          : !hasKeywordTrace(row.sourceEvidenceCue || '', traceText, 8))
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelitySourceEvidenceTextTrace',
            `${lessonLabel} output does not expose source provenance trace.`,
          ),
        );
      }
      if (expectedSourceRisk && !hasKeywordTrace(expectedSourceRisk, traceText, 3)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelitySourceRiskTrace',
            `${lessonLabel} output does not expose source-risk level.`,
          ),
        );
      }
      if (expectedLearnerContext && !hasKeywordTrace(expectedLearnerContext, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityLearnerContextTrace',
            `${lessonLabel} output does not expose the learner-context trace.`,
          ),
        );
      }
      if (expectedArtifact && !hasKeywordTrace(expectedArtifact, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityArtifactTrace',
            `${lessonLabel} output does not expose the assessment artifact trace.`,
          ),
        );
      }
      if (expectedReadinessSupport && !hasKeywordTrace(expectedReadinessSupport, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityReadinessSupportTrace',
            `${lessonLabel} output does not expose the readiness-support trace.`,
          ),
        );
      }
      if (expectedPrerequisitePlan && !hasKeywordTrace(expectedPrerequisitePlan, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityPrerequisitePlanTrace',
            `${lessonLabel} output does not expose the prerequisite-readiness trace.`,
          ),
        );
      }
      if (expectedConceptDependency && !hasKeywordTrace(expectedConceptDependency, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityConceptDependencyTrace',
            `${lessonLabel} output does not expose the concept-dependency trace.`,
          ),
        );
      }
      if (expectedPracticeProgression && !hasKeywordTrace(expectedPracticeProgression, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityPracticeProgressionTrace',
            `${lessonLabel} output does not expose the practice-progression trace.`,
          ),
        );
      }
      if (expectedInstructionalRationale && !hasKeywordTrace(expectedInstructionalRationale, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityInstructionalRationaleTrace',
            `${lessonLabel} output does not expose the instructional-rationale trace.`,
          ),
        );
      }
      if (expectedAccessibilityPlan && !hasKeywordTrace(expectedAccessibilityPlan, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityAccessibilityPlanTrace',
            `${lessonLabel} output does not expose the accessibility-plan trace.`,
          ),
        );
      }
      if (expectedFeedbackCycle && !hasKeywordTrace(expectedFeedbackCycle, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityFeedbackCycleTrace',
            `${lessonLabel} output does not expose the feedback-cycle trace.`,
          ),
        );
      }
      if (expectedLearningTransfer && !hasKeywordTrace(expectedLearningTransfer, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityLearningTransferTrace',
            `${lessonLabel} output does not expose the learning-transfer trace.`,
          ),
        );
      }
      if (expectedTeachingIntent && !hasKeywordTrace(expectedTeachingIntent, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityTeachingIntentTrace',
            `${lessonLabel} output does not expose the teaching-intent trace.`,
          ),
        );
      }
      if (expectedModalityCue && !hasKeywordTrace(expectedModalityCue, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityModalityFitTrace',
            `${lessonLabel} output does not expose the modality-fit trace.`,
          ),
        );
      }
      if (expectedArtifactGenre && !hasNormalizedTrace(expectedArtifactGenre, traceText)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityArtifactGenreTrace',
            `${lessonLabel} output does not expose the artifact-genre trace.`,
          ),
        );
      }
      if (expectedArtifactGenreEvidence && !hasKeywordTrace(expectedArtifactGenreEvidence, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityArtifactGenreEvidenceTrace',
            `${lessonLabel} output does not expose the artifact-genre evidence standard.`,
          ),
        );
      }
      if (expectedCompilerDecision && !hasKeywordTrace(expectedCompilerDecision, traceText, 4)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityCompilerDecisionTrace',
            `${lessonLabel} output does not expose the compiler decision path.`,
          ),
        );
      }
      if (expectedPublishGate && !hasNormalizedTrace(expectedPublishGate, traceText)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityPublishGateTrace',
            `${lessonLabel} output does not expose the publish gate.`,
          ),
        );
      }
      if (expectedModelUsePolicy && !hasKeywordTrace(expectedModelUsePolicy, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityModelUsePolicyTrace',
            `${lessonLabel} output does not expose the model-use policy.`,
          ),
        );
      }
      if (
        ['assignments', 'rubrics'].includes(featureId) &&
        expectedAssessmentValidity &&
        !hasKeywordTrace(expectedAssessmentValidity, traceText, 8)
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityAssessmentValidityTrace',
            `${lessonLabel} output does not expose the assessment-validity trace.`,
          ),
        );
      }
      if (
        ['lessonPlans', 'assignments', 'rubrics'].includes(featureId) &&
        expectedGradingCalibration &&
        !hasKeywordTrace(expectedGradingCalibration, traceText, 8)
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityGradingCalibrationTrace',
            `${lessonLabel} output does not expose the grading-calibration trace.`,
          ),
        );
      }
      if (
        ['lessonPlans', 'assignments', 'rubrics'].includes(featureId) &&
        expectedCriterionEvidence &&
        !hasKeywordTrace(expectedCriterionEvidence, traceText, 8)
      ) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityCriterionEvidenceTrace',
            `${lessonLabel} output does not expose the criterion-evidence trace.`,
          ),
        );
      }
      if (expectedAnchorExample && !hasKeywordTrace(expectedAnchorExample, traceText, 8)) {
        findings.push(
          makeFinding(
            'blocker',
            featureId,
            'blueprintFidelityAnchorExampleTrace',
            `${lessonLabel} output does not expose the assessment-anchor example trace.`,
          ),
        );
      }
    }
  });

  return findings;
}

function collectEnrichmentSignals(enrichment = {}) {
  const signatureSignals = uniqueSignals([
    ...(Array.isArray(enrichment.signatureTerms) ? enrichment.signatureTerms : []),
    ...Object.values(enrichment.lens || {}),
  ]);
  const lessonPhraseSignals = uniqueSignals([
    ...Object.values(enrichment.lessonPhrases || {}).flatMap((phrase) => [
      phrase?.context,
      phrase?.evidenceMove,
      phrase?.decisionMove,
    ]),
    ...Object.values(enrichment.teachingMoves || {}),
  ]);
  return {
    signatureSignals,
    lessonPhraseSignals,
  };
}

function buildEnrichmentImpactAudit({
  sample,
  runtime,
  courseMap,
  compiledFeatures,
  enrichedBlueprint,
  enrichedCompiled,
  enrichedFidelityFindings,
}) {
  const enrichment = sample.enrichment || {};
  const { signatureSignals, lessonPhraseSignals } = collectEnrichmentSignals(enrichment);
  if (signatureSignals.length === 0 && lessonPhraseSignals.length === 0) {
    return {
      status: 'not-applicable',
      source: enrichment.source || 'none',
      baselineSignatureMatches: 0,
      enrichedSignatureMatches: 0,
      signatureLift: 0,
      baselinePhraseMatches: 0,
      enrichedPhraseMatches: 0,
      phraseLift: 0,
      phraseCoverage: null,
      baselineMinQuality: null,
      enrichedMinQuality: null,
      baselineCompilerContractStatus: null,
      baselineFidelityFindings: 0,
      enrichedFidelityFindings: enrichedFidelityFindings.length,
      justifiesEnrichmentCall: false,
      findings: [],
    };
  }

  const baselineBlueprint = runtime.buildCourseBlueprint(courseMap, {});
  const baselineCompiled = runtime.compileBlueprintDeliverables(baselineBlueprint, compiledFeatures, {
    configMap: { courseFaq: { questionsPerLesson: 5 } },
    enforceCompilerContract: false,
  });
  const baselineText = collectStrings(baselineCompiled).join(' ');
  const enrichedText = collectStrings(enrichedCompiled).join(' ');
  const baselineSignatureMatches = countSignalMatches(signatureSignals, baselineText);
  const enrichedSignatureMatches = countSignalMatches(signatureSignals, enrichedText);
  const baselinePhraseMatches = countSignalMatches(lessonPhraseSignals, baselineText);
  const enrichedPhraseMatches = countSignalMatches(lessonPhraseSignals, enrichedText);
  const signatureLift = enrichedSignatureMatches - baselineSignatureMatches;
  const phraseLift = enrichedPhraseMatches - baselinePhraseMatches;
  const phraseCoverage =
    lessonPhraseSignals.length > 0 ? Number((enrichedPhraseMatches / lessonPhraseSignals.length).toFixed(2)) : null;
  const baselineFidelityFindings = buildBlueprintFidelityFindings({
    blueprint: baselineBlueprint,
    compiledFeatures,
    compiled: baselineCompiled,
  });
  const baselineMinQuality = minQualityForCompiled({ runtime, compiledFeatures, compiled: baselineCompiled });
  const enrichedMinQuality = minQualityForCompiled({ runtime, compiledFeatures, compiled: enrichedCompiled });
  const baselineCompilerContractStatus = baselineBlueprint?.compilerContract?.status || 'missing';
  const requiredPhraseCoverage = lessonPhraseSignals.length > 0 ? 0.75 : 0;
  const requiredPhraseLift = lessonPhraseSignals.length > 0 ? Math.min(3, lessonPhraseSignals.length) : 0;
  const findings = [];

  if (!Number.isFinite(baselineMinQuality) || baselineMinQuality < GOLD_QUALITY_FLOOR) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'deterministicBaselineQuality',
        `Deterministic baseline minimum quality ${baselineMinQuality ?? 'missing'} is below gold floor ${GOLD_QUALITY_FLOOR}.`,
      ),
    );
  }
  if (baselineFidelityFindings.length > 0) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'deterministicBaselineFidelity',
        `Deterministic baseline has ${baselineFidelityFindings.length} blueprint-fidelity finding(s); enrichment cannot be required to rescue fidelity.`,
      ),
    );
  }
  if (baselineCompilerContractStatus !== 'pass') {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'deterministicBaselineContract',
        `Deterministic baseline compiler contract is ${baselineCompilerContractStatus}.`,
      ),
    );
  }
  if (lessonPhraseSignals.length > 0 && phraseCoverage < requiredPhraseCoverage) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'phraseCoverage',
        `Enrichment phrase coverage ${phraseCoverage} is below required ${requiredPhraseCoverage}.`,
      ),
    );
  }
  if (signatureLift <= 0 && phraseLift < requiredPhraseLift) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'specificityLift',
        `Enrichment did not create enough course-specific lift (${signatureLift} signature, ${phraseLift} phrase).`,
      ),
    );
  }
  if (
    Number.isFinite(baselineMinQuality) &&
    Number.isFinite(enrichedMinQuality) &&
    enrichedMinQuality < baselineMinQuality
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'qualityRegression',
        `Enriched compile minimum quality ${enrichedMinQuality} fell below deterministic baseline ${baselineMinQuality}.`,
      ),
    );
  }
  if (enrichedFidelityFindings.length > baselineFidelityFindings.length) {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'fidelityRegression',
        `Enriched compile introduced ${enrichedFidelityFindings.length - baselineFidelityFindings.length} extra fidelity finding(s).`,
      ),
    );
  }
  if (enrichedBlueprint?.compilerContract?.status !== 'pass') {
    findings.push(
      makeFinding(
        'blocker',
        'enrichment',
        'compilerContract',
        `Enriched blueprint compiler contract is ${enrichedBlueprint?.compilerContract?.status || 'missing'}.`,
      ),
    );
  }

  return {
    status: summarizeFeatureStatus(findings),
    source: enrichment.source || 'none',
    signatureSignalCount: signatureSignals.length,
    phraseSignalCount: lessonPhraseSignals.length,
    baselineSignatureMatches,
    enrichedSignatureMatches,
    signatureLift,
    baselinePhraseMatches,
    enrichedPhraseMatches,
    phraseLift,
    phraseCoverage,
    baselineMinQuality,
    enrichedMinQuality,
    baselineCompilerContractStatus,
    baselineFidelityFindings: baselineFidelityFindings.length,
    enrichedFidelityFindings: enrichedFidelityFindings.length,
    justifiesEnrichmentCall: findings.length === 0 && (signatureLift > 0 || phraseLift >= requiredPhraseLift),
    findings,
  };
}

function getCompiledArrays(compiled) {
  return {
    lessonPlans: getFeatureArray('lessonPlans', compiled.lessonPlans),
    slideDecks: getFeatureArray('slideDecks', compiled.slideDecks),
    assignments: getFeatureArray('assignments', compiled.assignments),
    rubrics: getFeatureArray('rubrics', compiled.rubrics),
    discussions: getFeatureArray('discussions', compiled.discussions),
    quizBank: getFeatureArray('quizBank', compiled.quizBank),
    studyGuides: getFeatureArray('studyGuides', compiled.studyGuides),
    courseFaq: getFeatureArray('courseFaq', compiled.courseFaq),
  };
}

function fullCoverage(items, scope, predicate) {
  return items.length === scope && countPassing(items, predicate) === scope;
}

function hasFourRubricBands(rubric) {
  return (
    Array.isArray(rubric?.criteria) &&
    rubric.criteria.length >= 4 &&
    rubric.criteria.every(
      (criterion) => criterion.exemplary && criterion.proficient && criterion.developing && criterion.beginning,
    )
  );
}

function hasSourceTrace(item) {
  const grounding = item?.sourceGrounding || item?.blueprintGrounding;
  return (
    Boolean(grounding?.confidence) &&
    Array.isArray(grounding?.sourceEvidenceTrace?.sourceFields) &&
    grounding.sourceEvidenceTrace.sourceFields.length >= 6 &&
    Boolean(grounding?.sourceRisk?.riskLevel) &&
    (Boolean(grounding?.evidencePlan?.evidenceRequirement) ||
      Boolean(grounding?.evidenceRequirement) ||
      Boolean(grounding?.sourceCue)) &&
    ('localReviewNeeded' in grounding || Boolean(grounding?.sourceAnchors))
  );
}

function hasCompilerDecisionTrace(item) {
  const grounding = item?.sourceGrounding || item?.blueprintGrounding || {};
  const decision = grounding.compilerDecision || item?.compilerDecision;
  return Boolean(
    decision?.source === 'deterministic-compiler-decision' &&
    decision.generationPath &&
    decision.publishGate &&
    decision.modelUsePolicy &&
    decision.repairPolicy &&
    decision.evidence?.sourceRiskLevel &&
    decision.evidence?.assessmentSource &&
    Array.isArray(decision.reviewFocus) &&
    decision.reviewFocus.length > 0,
  );
}

function hasLearnerContextTrace(item) {
  const grounding = item?.sourceGrounding || item?.blueprintGrounding || {};
  return Boolean(
    item?.learnerContextCue || grounding?.learnerContextCue || grounding?.learnerContextProfile?.learnerRole,
  );
}

function hasModalityTrace(item) {
  const grounding = item?.sourceGrounding || item?.blueprintGrounding || {};
  return Boolean(
    item?.modalityCue ||
    item?.modalityDecode?.signaturePractice ||
    item?.courseModalityProfile?.primaryMode ||
    item?.readyToTeachSupport?.modalityFit?.primaryMode ||
    item?.readyToTeachSupport?.modalityPractice ||
    item?.slideDeckSequenceGuide?.modalityFit?.courseModalityProfile?.primaryMode ||
    item?.slideDeckSequenceGuide?.modalityFit?.modalityDecode?.signaturePractice ||
    grounding?.modalityCue ||
    grounding?.modalityDecode?.signaturePractice ||
    grounding?.courseModalityProfile?.primaryMode,
  );
}

function hasArtifactGenreTrace(item) {
  const grounding = item?.sourceGrounding || item?.blueprintGrounding || {};
  return Boolean(
    item?.artifactGenre?.genre ||
    item?.artifactGenreReviewProtocol ||
    item?.readyToTeachSupport?.artifactGenreFit ||
    item?.readyToTeachSupport?.genreReviewProtocol ||
    item?.slideDeckSequenceGuide?.artifactGenreFit?.artifactGenre?.genre ||
    grounding?.artifactGenre?.genre,
  );
}

function buildClassroomExcellenceScorecard({
  sample,
  blueprint,
  compiled,
  packageText,
  blueprintAlignmentFindings,
  compiledAlignmentFindings,
  blueprintFidelityFindings,
}) {
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const scope = lessons.length;
  const arrays = getCompiledArrays(compiled);
  const syllabus = compiled.syllabus?.syllabus || {};
  const stageCoverageCount = new Set((blueprint.courseArc?.stages || []).flatMap((stage) => stage.lessonNumbers || []))
    .size;
  const weakInputExpected = Number(sample.expectations?.blueprint?.minReviewFlags || 0) > 0;
  const placeholderFree = !patternMatches(/TBD|to be determined|lorem ipsum|placeholder/i, packageText);

  const dimensions = [
    buildDimension('instructionalAlignment', 'Instructional alignment', [
      {
        label: 'Blueprint contains one aligned row per lesson',
        pass:
          Array.isArray(blueprint.alignmentMatrix) &&
          blueprint.alignmentMatrix.length === scope &&
          blueprint.alignmentMatrix.every((row) => row.alignmentStatus === 'aligned'),
      },
      {
        label: 'Blueprint alignment has no findings',
        pass: blueprintAlignmentFindings.length === 0,
      },
      {
        label: 'Compiled artifacts preserve lesson concepts, assessment artifacts, and success criteria',
        pass: compiledAlignmentFindings.length === 0,
      },
      {
        label: 'Compiled artifacts preserve structured blueprint fidelity traces',
        pass: blueprintFidelityFindings.length === 0,
      },
      {
        label: 'Compiled lesson-facing artifacts preserve learner-context traces',
        pass: [
          'lessonPlans',
          'slideDecks',
          'assignments',
          'rubrics',
          'discussions',
          'quizBank',
          'studyGuides',
          'courseFaq',
        ].every((featureId) => fullCoverage(arrays[featureId], scope, hasLearnerContextTrace)),
      },
      {
        label: 'Compiled lesson-facing artifacts preserve artifact-genre traces',
        pass: [
          'lessonPlans',
          'slideDecks',
          'assignments',
          'rubrics',
          'discussions',
          'quizBank',
          'studyGuides',
          'courseFaq',
        ].every((featureId) => fullCoverage(arrays[featureId], scope, hasArtifactGenreTrace)),
      },
      {
        label: 'Syllabus exposes the lesson alignment matrix',
        pass: Array.isArray(syllabus.lessonAlignmentMatrix) && syllabus.lessonAlignmentMatrix.length === scope,
      },
      {
        label: 'Syllabus exposes package handoff and local-confirmation plan',
        pass:
          syllabus.classroomHandoffPlan?.status &&
          Array.isArray(syllabus.classroomHandoffPlan?.reviewOrder) &&
          syllabus.classroomHandoffPlan.reviewOrder.length > 0 &&
          Array.isArray(syllabus.classroomHandoffPlan?.lessonReviewOrder) &&
          syllabus.classroomHandoffPlan.lessonReviewOrder.length === scope &&
          syllabus.blueprintQualityReceipt?.classroomHandoffPlan?.publishBoundary,
      },
      {
        label: 'Syllabus exposes source-risk register',
        pass:
          syllabus.sourceRiskRegister?.status &&
          Array.isArray(syllabus.sourceRiskRegister?.lessonRows) &&
          syllabus.sourceRiskRegister.lessonRows.length === scope &&
          syllabus.blueprintQualityReceipt?.sourceRiskRegister?.riskPolicy,
      },
      {
        label: 'Syllabus exposes human-reviewable blueprint assumption ledger',
        pass:
          syllabus.blueprintAssumptionLedger?.status &&
          Array.isArray(syllabus.blueprintAssumptionLedger?.rows) &&
          syllabus.blueprintAssumptionLedger.rows.length > 0 &&
          syllabus.blueprintAssumptionLedger.rows.some((row) => row.category === 'handoff-boundary') &&
          syllabus.blueprintQualityReceipt?.blueprintAssumptionLedger?.reviewerPolicy,
      },
      {
        label: 'Syllabus exposes the package coherence matrix',
        pass:
          syllabus.packageCoherenceMatrix?.status === 'coherent' &&
          Array.isArray(syllabus.packageCoherenceMatrix?.lessonRows) &&
          syllabus.packageCoherenceMatrix.lessonRows.length === scope &&
          syllabus.blueprintQualityReceipt?.packageCoherenceMatrix?.missingFieldCount === 0,
      },
      {
        label:
          'Each lesson has learner context, modality fit, teaching intent, evidence, feedback cycle, misconception, exemplar, readiness-support, and accessibility anchors',
        pass: lessons.every(
          (lesson) =>
            blueprint.learnerContextProfile?.learnerRole &&
            blueprint.courseModalityProfile?.primaryMode &&
            lesson.modalityCue &&
            lesson.modalityDecode?.signaturePractice &&
            lesson.modalityDecode?.evidenceRoutine &&
            lesson.modalityDecode?.feedbackRoutine &&
            hasArtifactGenreContract(lesson.artifactGenre) &&
            lesson.teachingIntent?.teachingGoal &&
            lesson.teachingIntent?.feedbackDecision &&
            lesson.teachingIntent?.transferMove &&
            lesson.evidencePlan?.evidenceRequirement &&
            Array.isArray(lesson.sourceEvidenceTrace?.sourceFields) &&
            lesson.sourceEvidenceTrace.sourceFields.length >= 6 &&
            blueprint.sourceRiskRegister?.status &&
            lesson.sourceRisk?.riskLevel &&
            lesson.sourceUsePlan?.noInventedSources &&
            lesson.feedbackCycle?.formativeEvidence &&
            lesson.feedbackCycle?.studentRevisionAction &&
            lesson.feedbackCycle?.closureCheck &&
            Array.isArray(lesson.misconceptionMap) &&
            lesson.misconceptionMap.length >= 2 &&
            lesson.modelContrast?.exemplarMove &&
            lesson.modelContrast?.nonExemplarMove &&
            lesson.readinessSupport?.supportMove &&
            lesson.readinessSupport?.extensionMove &&
            lesson.instructionalRationale?.assessmentRationale &&
            lesson.accessibilityPlan?.participationProtocol,
        ),
      },
    ]),
    buildDimension('teachability', 'Teachability', [
      {
        label: 'Lesson plans have full teachable outlines',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) => Array.isArray(item.outline) && item.outline.length >= 6,
        ),
      },
      {
        label: 'Lesson plans preserve feasible session timing',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.classSessionPlan?.feasibilityStatus === 'fits-session' &&
            item.outlineTiming?.status === 'fits-session' &&
            item.readyToTeachSupport?.timingFit,
        ),
      },
      {
        label: 'Lesson plans include exemplar contrast, learner context, mini-rubrics, handouts, and instructor prep',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.readyToTeachSupport?.workedExample &&
            item.readyToTeachSupport?.nonExample &&
            item.readyToTeachSupport?.contrastQuestion &&
            item.readyToTeachSupport?.transferPrompt &&
            item.readyToTeachSupport?.criterionEvidencePrompt &&
            item.readyToTeachSupport?.sourceIntegrityCheck &&
            item.readyToTeachSupport?.learnerContextCue &&
            item.readyToTeachSupport?.methodSpecificMiniRubric &&
            item.readyToTeachSupport?.studentHandout &&
            item.readyToTeachSupport?.instructorPrep,
        ),
      },
      {
        label: 'Lesson plans include formative checks with diagnostic instructor action',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.formativeCheck?.prompt &&
            item.formativeCheck?.instructorAction &&
            item.readyToTeachSupport?.targetedSupport &&
            item.readyToTeachSupport?.extensionChallenge,
        ),
      },
      {
        label: 'Lesson plans expose instructional design rationale',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.instructionalRationale?.sequenceRationale &&
            item.instructionalRationale?.practiceRationale &&
            item.instructionalRationale?.assessmentRationale,
        ),
      },
      {
        label: 'Lesson plans expose explicit teaching intent',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.teachingIntent?.teachingGoal &&
            item.teachingIntent?.feedbackDecision &&
            item.readyToTeachSupport?.teachingIntentSummary,
        ),
      },
      {
        label: 'Lesson plans expose mastery evidence from diagnosis through transfer',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.masteryEvidencePlan?.diagnosticEvidence &&
            item.masteryEvidencePlan?.guidedPracticeEvidence &&
            item.masteryEvidencePlan?.independentPerformanceEvidence &&
            item.masteryEvidencePlan?.feedbackRevisionEvidence &&
            item.masteryEvidencePlan?.transferEvidence &&
            item.masteryEvidencePlan?.masteryThreshold &&
            item.readyToTeachSupport?.masteryDiagnosticEvidence &&
            item.readyToTeachSupport?.masteryPerformanceEvidence &&
            item.readyToTeachSupport?.masteryThreshold,
        ),
      },
      {
        label: 'Lesson plans expose ready, partial, and needs-support evidence responses',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.evidenceResponsePlan?.readyMove &&
            item.evidenceResponsePlan?.partialMove &&
            item.evidenceResponsePlan?.supportMove &&
            item.evidenceResponsePlan?.recheckCue &&
            item.readyToTeachSupport?.evidenceReadyResponse &&
            item.readyToTeachSupport?.evidencePartialResponse &&
            item.readyToTeachSupport?.evidenceSupportResponse &&
            item.readyToTeachSupport?.evidenceResponseRecheck,
        ),
      },
      {
        label: 'Lesson plans expose course-modality fit',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.modalityCue && item.courseModalityProfile?.primaryMode && item.readyToTeachSupport?.modalityFit,
        ),
      },
      {
        label: 'Lesson plans decode course modality into practice, evidence, and feedback routines',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.modalityDecode?.signaturePractice &&
            item.modalityDecode?.evidenceRoutine &&
            item.modalityDecode?.feedbackRoutine &&
            item.readyToTeachSupport?.modalityPractice &&
            item.readyToTeachSupport?.modalityEvidenceRoutine &&
            item.readyToTeachSupport?.modalityFeedbackRoutine,
        ),
      },
      {
        label: 'Lesson plans include UDL notes',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) => item.udlNotes?.representation && item.udlNotes?.engagement && item.udlNotes?.expression,
        ),
      },
      {
        label: 'Slide decks include at least 10 instructional slides per lesson',
        pass: fullCoverage(arrays.slideDecks, scope, (deck) => Array.isArray(deck.slides) && deck.slides.length >= 10),
      },
      {
        label: 'Slide decks include substantial speaker notes',
        pass: fullCoverage(arrays.slideDecks, scope, (deck) =>
          (deck.slides || []).every((slide) => wordCount(slide.notes) >= 35),
        ),
      },
      {
        label: 'Slide decks include accessibility and assessment sequence guidance',
        pass: fullCoverage(
          arrays.slideDecks,
          scope,
          (deck) =>
            deck.slideDeckSequenceGuide?.accessibilityStandards && deck.slideDeckSequenceGuide?.cumulativeAssessmentMap,
        ),
      },
      {
        label: 'Slide decks use purpose-aware visual plans tied to evidence and artifact genre',
        pass: fullCoverage(arrays.slideDecks, scope, hasPurposeAwareSlideVisuals),
      },
    ]),
    buildDimension('assessmentAuthenticity', 'Assessment authenticity', [
      {
        label: 'Blueprint assessment architecture balances roles, weights, feedback windows, and revision use',
        pass:
          blueprint.assessmentArchitecture?.status === 'balanced' &&
          blueprint.assessmentArchitecture?.totalWeightPercent === 100 &&
          blueprint.assessmentArchitecture?.weightSourceStatus &&
          blueprint.assessmentArchitecture?.weightConfirmationPolicy &&
          Array.isArray(blueprint.assessmentArchitecture?.lessonRows) &&
          blueprint.assessmentArchitecture.lessonRows.length === scope &&
          blueprint.assessmentArchitecture.lessonRows.every(
            (row) =>
              row.role && row.weightPercent && row.weightProvenance?.source && row.feedbackWindow && row.revisionUse,
          ),
      },
      {
        label: 'Assignments include objectives and high-value success criteria',
        pass: fullCoverage(
          arrays.assignments,
          scope,
          (item) =>
            Array.isArray(item.objectives) && item.objectives.length > 0 && item.highValueSuccessCriteria?.length >= 3,
        ),
      },
      {
        label: 'Assignments decode artifact genre, workload, submission format, and review protocol',
        pass: fullCoverage(arrays.assignments, scope, hasAssignmentArtifactSubmissionProfile),
      },
      {
        label:
          'Assignments include evidence plans, misconception checks, exemplar contrast, readiness support, validity, and grading calibration',
        pass: fullCoverage(
          arrays.assignments,
          scope,
          (item) =>
            item.evidencePlan?.evidenceRequirement &&
            item.misconceptionToWatch &&
            item.modelContrast &&
            item.readinessSupport &&
            item.learnerContextCue &&
            item.assessmentValidity?.targetConstruct &&
            item.validityCheck?.calibrationCheck &&
            item.gradingCalibration?.biasCheck &&
            item.assessmentArchitecture?.role &&
            item.assessmentCadence?.feedbackWindow &&
            item.revisionUse &&
            Array.isArray(item.criterionWeightPlan) &&
            item.criterionWeightPlan.length >= 4 &&
            item.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) === 100 &&
            item.criterionWeightGuidance &&
            item.citationAndSourceUse?.noInventedSources &&
            Array.isArray(item.criterionEvidenceChecklist) &&
            item.criterionEvidenceChecklist.length >= 4,
        ),
      },
      {
        label: 'Assignments include scaffolded feedback milestones',
        pass: fullCoverage(
          arrays.assignments,
          scope,
          (item) =>
            Array.isArray(item.scaffoldingMilestones) &&
            item.scaffoldingMilestones.length >= 2 &&
            item.scaffoldingMilestones.every((milestone) => milestone.feedback),
        ),
      },
      {
        label: 'Rubrics have criteria and four performance bands',
        pass: fullCoverage(arrays.rubrics, scope, hasFourRubricBands),
      },
      {
        label: 'Rubrics include task directions, anchor examples, validity, and grading calibration',
        pass: fullCoverage(
          arrays.rubrics,
          scope,
          (item) =>
            item.taskDirections &&
            item.anchorExamples?.exemplary &&
            item.assessmentValidity?.validityThreat &&
            item.gradingCalibrationPlan?.biasCheck &&
            item.assessmentArchitecture?.role &&
            item.assessmentCadence?.feedbackWindow &&
            item.revisionUse &&
            Array.isArray(item.criterionWeightPlan) &&
            item.criterionWeightPlan.length >= 4 &&
            item.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) === 100 &&
            (item.criteria || []).every(
              (criterion) =>
                Number.isFinite(criterion.weight) &&
                criterion.weightingRationale &&
                criterion.evidenceSignal &&
                criterion.calibrationUse &&
                criterion.performanceBandEvidence?.scorerQuestion &&
                criterion.performanceBandEvidence?.commonPitfall &&
                criterion.performanceBandEvidence?.revisionTarget,
            ) &&
            item.sourceUsePlan?.noInventedSources &&
            Array.isArray(item.criterionEvidenceMap) &&
            item.criterionEvidenceMap.length >= 4 &&
            /Calibration check/i.test(item.instructorFacilitationNote || ''),
        ),
      },
      {
        label: 'Quizzes include multiple-choice, short-answer, and essay questions',
        pass: fullCoverage(arrays.quizBank, scope, (quiz) => {
          const types = new Set((quiz.questions || []).map((question) => question.type));
          return types.has('multiple_choice') && types.has('short_answer') && types.has('essay');
        }),
      },
      {
        label: 'Quiz questions include explanations or scoring guidance',
        pass: fullCoverage(arrays.quizBank, scope, (quiz) =>
          (quiz.questions || []).every((question) => question.explanation || question.scoringGuidance),
        ),
      },
      {
        label: 'Quiz questions use source-grounded Bloom and objective planning',
        pass: fullCoverage(arrays.quizBank, scope, hasSourceGroundedQuizPlan),
      },
      {
        label: 'Quiz banks cover at least four cognitive levels per lesson',
        pass: fullCoverage(arrays.quizBank, scope, (quiz) => new Set(quiz.bloomsCoverage || []).size >= 4),
      },
    ]),
    buildDimension('feedbackAndRevision', 'Feedback and revision loop', [
      {
        label: 'Blueprint contains structured feedback and revision cycles',
        pass: lessons.every(
          (lesson) =>
            lesson.feedbackCycle?.formativeEvidence &&
            lesson.feedbackCycle?.feedbackMethod &&
            lesson.feedbackCycle?.studentRevisionAction &&
            lesson.feedbackCycle?.nextUse &&
            lesson.feedbackCycle?.closureCheck,
        ),
      },
      {
        label: 'Lesson plans connect formative evidence to instructor action',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            item.formativeCheck?.prompt &&
            item.formativeCheck?.instructorAction &&
            item.feedbackCycle?.studentRevisionAction &&
            item.readyToTeachSupport?.feedbackProtocol,
        ),
      },
      {
        label: 'Assignments define instructor feedback priorities and revision checks',
        pass: fullCoverage(
          arrays.assignments,
          scope,
          (item) =>
            item.instructorFeedbackPriority &&
            item.feedbackLoop &&
            item.feedbackCycle?.studentRevisionAction &&
            item.revisionCheck,
        ),
      },
      {
        label: 'Rubrics include facilitation notes and teacher feedback notes',
        pass: fullCoverage(
          arrays.rubrics,
          scope,
          (item) => item.instructorFacilitationNote && item.teacherNotes && item.feedbackCycle?.feedbackMethod,
        ),
      },
      {
        label: 'Discussions include facilitation tips, closure, and evaluation criteria',
        pass: fullCoverage(
          arrays.discussions,
          scope,
          (item) =>
            item.facilitationTips?.closure &&
            item.facilitationTips?.revisionCapture &&
            item.feedbackCycle?.closureCheck &&
            Array.isArray(item.evaluationCriteria) &&
            item.evaluationCriteria.length >= 4,
        ),
      },
      {
        label: 'Discussions decode modality and artifact genre into a concrete protocol',
        pass: fullCoverage(arrays.discussions, scope, hasDiscussionProtocolProfile),
      },
      {
        label: 'Quizzes include formative feedback notes',
        pass: fullCoverage(arrays.quizBank, scope, (quiz) => quiz.formativeFeedbackNote),
      },
      {
        label: 'Study guides include review questions and practice activities',
        pass: fullCoverage(
          arrays.studyGuides,
          scope,
          (item) =>
            Array.isArray(item.reviewQuestions) &&
            item.reviewQuestions.length >= 3 &&
            Array.isArray(item.practiceActivities) &&
            item.practiceActivities.length >= 2 &&
            item.learningTransferPlan?.metacognitivePrompt,
        ),
      },
    ]),
    buildDimension('cognitiveProgression', 'Cognitive progression', [
      {
        label: 'Course arc stage coverage includes every lesson',
        pass: stageCoverageCount === scope,
      },
      {
        label: 'Every lesson has a Bloom level and difficulty profile',
        pass: lessons.every((lesson) => lesson.bloomsLevel && lesson.difficultyProfile?.cognitiveDemand),
      },
      {
        label: 'Bloom levels are inferred from source text instead of lesson position',
        pass: lessons.every(
          (lesson) =>
            lesson.bloomInference?.level === lesson.bloomsLevel &&
            lesson.bloomInference?.source &&
            lesson.bloomInference.source !== 'index-rotation',
        ),
      },
      {
        label: 'Every lesson has retrieval and transfer planning',
        pass: lessons.every(
          (lesson) =>
            lesson.learningTransferPlan?.retrievalCue &&
            lesson.learningTransferPlan?.spacedPracticeCue &&
            lesson.learningTransferPlan?.transferTask &&
            lesson.learningTransferPlan?.cumulativeConnection &&
            lesson.learningTransferPlan?.metacognitivePrompt,
        ),
      },
      {
        label: 'Blueprint exposes a concept dependency graph and practice progression',
        pass:
          hasConceptGraphContract(blueprint, scope) &&
          lessons.every(
            (lesson) =>
              lesson.conceptDependencyPlan?.node?.concept &&
              lesson.conceptDependencyPlan?.transferCue &&
              lesson.practiceProgressionPlan?.practiceFocus &&
              lesson.practiceProgressionPlan?.evidenceRoutine &&
              lesson.practiceProgressionPlan?.feedbackRoutine &&
              lesson.practiceProgressionPlan?.transferTask,
          ),
      },
      {
        label: 'Every lesson has explicit teaching-intent sequencing',
        pass: lessons.every(
          (lesson) =>
            lesson.teachingIntent?.diagnosticMove &&
            lesson.teachingIntent?.modelingMove &&
            lesson.teachingIntent?.guidedPracticeMove &&
            lesson.teachingIntent?.evidenceOfLearning &&
            lesson.teachingIntent?.studentRevisionMove,
        ),
      },
      {
        label: 'Lesson plans include at least four Bloom levels',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) =>
            new Set(item.bloomsLevels || []).size >= 4 &&
            item.learningTransferPlan?.transferTask &&
            item.conceptDependencyPlan?.transferCue &&
            item.practiceProgressionPlan?.practiceFocus &&
            item.readyToTeachSupport?.retrievalPractice,
        ),
      },
      {
        label: 'Slide decks include application, analysis, and evaluation practice',
        pass: fullCoverage(arrays.slideDecks, scope, (deck) => {
          const blooms = new Set((deck.slides || []).map((slide) => slide.bloomsLevel || slide.bloom).filter(Boolean));
          return (
            blooms.has('Apply') &&
            blooms.has('Analyze') &&
            blooms.has('Evaluate') &&
            deck.slideDeckSequenceGuide?.learningTransferPlan?.transferTask
          );
        }),
      },
      {
        label: 'Assignments retain Bloom-level alignment',
        pass: fullCoverage(arrays.assignments, scope, (item) => item.bloomsLevel),
      },
      {
        label: 'Quiz banks progress from retrieval to synthesis',
        pass: fullCoverage(arrays.quizBank, scope, (quiz) => {
          const blooms = new Set(quiz.bloomsCoverage || []);
          return (
            blooms.has('Remember') &&
            blooms.has('Apply') &&
            blooms.has('Analyze') &&
            blooms.has('Create') &&
            quiz.learningTransferPlan?.spacedPracticeCue
          );
        }),
      },
    ]),
    buildDimension('accessibilityAndTrust', 'Accessibility and trust', [
      {
        label: 'Syllabus includes accommodations, AI policy, source-use policy, and blueprint receipt',
        pass:
          syllabus.accommodations && syllabus.aiPolicy && syllabus.sourceUsePolicy && syllabus.blueprintQualityReceipt,
      },
      {
        label: 'Blueprint contains lesson-level accessibility and participation plans',
        pass: lessons.every(
          (lesson) =>
            lesson.accessibilityPlan?.representation &&
            lesson.accessibilityPlan?.engagement &&
            lesson.accessibilityPlan?.expression &&
            lesson.accessibilityPlan?.participationProtocol &&
            lesson.accessibilityPlan?.accommodationReviewCue,
        ),
      },
      {
        label: 'Lesson plans include accessibility support',
        pass: fullCoverage(
          arrays.lessonPlans,
          scope,
          (item) => item.readyToTeachSupport?.accessibilityAndUDL && item.udlNotes && item.accessibilityPlan,
        ),
      },
      {
        label: 'Slides include accessible sequence guidance and alt text where visual assets are used',
        pass: fullCoverage(
          arrays.slideDecks,
          scope,
          (deck) =>
            deck.slideDeckSequenceGuide?.accessibilityStandards &&
            (deck.slides || []).every(
              (slide) =>
                slide.visual?.kind === 'none' ||
                (slide.visual?.altText && slide.visual?.visualPlan?.accessibilityCheck),
            ),
        ),
      },
      {
        label: 'Assignments include accessibility and integrity language',
        pass: fullCoverage(
          arrays.assignments,
          scope,
          (item) => item.accessibilityAndUDL && item.academicIntegrityStatement,
        ),
      },
      {
        label: 'Discussions include equity participation supports',
        pass: fullCoverage(arrays.discussions, scope, (item) => item.equityConsiderations),
      },
      {
        label: 'Weak-input samples surface review flags',
        pass:
          !weakInputExpected ||
          Number(blueprint.qualitySignals?.reviewFlagCount || 0) >= sample.expectations.blueprint.minReviewFlags,
      },
      {
        label: 'Compiled lesson features expose source grounding and raw provenance',
        pass:
          fullCoverage(arrays.lessonPlans, scope, hasSourceTrace) &&
          fullCoverage(arrays.slideDecks, scope, hasSourceTrace) &&
          fullCoverage(arrays.assignments, scope, hasSourceTrace) &&
          fullCoverage(arrays.rubrics, scope, hasSourceTrace) &&
          fullCoverage(arrays.discussions, scope, hasSourceTrace) &&
          fullCoverage(arrays.quizBank, scope, hasSourceTrace) &&
          fullCoverage(arrays.studyGuides, scope, hasSourceTrace) &&
          fullCoverage(arrays.courseFaq, scope, hasSourceTrace),
      },
      {
        label: 'Compiled lesson features expose compiler decisions and publish gates',
        pass:
          blueprint.compilerDecisionMatrix?.status &&
          fullCoverage(arrays.lessonPlans, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.slideDecks, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.assignments, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.rubrics, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.discussions, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.quizBank, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.studyGuides, scope, hasCompilerDecisionTrace) &&
          fullCoverage(arrays.courseFaq, scope, hasCompilerDecisionTrace),
      },
      {
        label: 'Compiled lesson features expose modality-fit traces',
        pass:
          fullCoverage(arrays.lessonPlans, scope, hasModalityTrace) &&
          fullCoverage(arrays.slideDecks, scope, hasModalityTrace) &&
          fullCoverage(arrays.assignments, scope, hasModalityTrace) &&
          fullCoverage(arrays.rubrics, scope, hasModalityTrace) &&
          fullCoverage(arrays.discussions, scope, hasModalityTrace) &&
          fullCoverage(arrays.quizBank, scope, hasModalityTrace) &&
          fullCoverage(arrays.studyGuides, scope, hasModalityTrace) &&
          fullCoverage(arrays.courseFaq, scope, hasModalityTrace),
      },
      {
        label: 'Compiled package is free of unfinished placeholders',
        pass: placeholderFree,
      },
    ]),
  ];

  const findings = dimensions
    .filter((dimension) => dimension.score < CLASSROOM_EXCELLENCE_FLOOR)
    .map((dimension) =>
      makeFinding(
        'blocker',
        'classroomExcellence',
        dimension.id,
        `${dimension.label} scored ${dimension.score}/10; missing: ${dimension.missing.join('; ') || 'unknown'}.`,
      ),
    );

  const minScore = dimensions.length ? Math.min(...dimensions.map((dimension) => dimension.score)) : 0;
  const avgScore = dimensions.length
    ? Number((dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length).toFixed(2))
    : 0;

  return {
    floor: CLASSROOM_EXCELLENCE_FLOOR,
    minScore,
    avgScore,
    dimensions,
    findings,
  };
}

export function auditGoldSample({ sample, runtime, features = sample.features || PIPELINE_FEATURES }) {
  if (!runtime) throw new Error('auditGoldSample requires a loaded audit runtime.');
  const rawCourseMap = scopeCourseMap(sample.project.courseMap, sample.scope);
  const courseMap = rawCourseMap;
  const scope = courseMap.lessons.length;
  const blueprint = runtime.buildCourseBlueprint(courseMap, { enrichment: sample.enrichment || {} });
  const blueprintMaturity = auditBlueprintMaturity(blueprint, scope, sample.enrichment?.lens || {});
  const blueprintExpectationFindings = buildBlueprintExpectationFindings(
    blueprintMaturity,
    sample.expectations?.blueprint,
  );
  const blueprintAlignmentFindings = buildBlueprintAlignmentFindings(blueprint, scope);
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(features);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, {
    configMap: { courseFaq: { questionsPerLesson: 5 } },
    enforceCompilerContract: false,
  });
  const sourceFidelity = buildSourceFidelityAudit({ courseMap, blueprint, compiledFeatures, compiled });
  const decodeLosslessness = buildBlueprintDecodeLosslessnessAudit({
    courseMap,
    blueprint,
    compiledFeatures,
    compiled,
  });
  const teachingIntent = buildTeachingIntentAudit({ blueprint, compiledFeatures, compiled });
  const instructionalMoves = buildInstructionalMovePropagationAudit({ blueprint, compiledFeatures, compiled });
  const modalityFit = buildModalityFitAudit({
    blueprint,
    compiledFeatures,
    compiled,
    expectedMode: sample.expectations?.courseModality || '',
  });
  const artifactGenre = buildArtifactGenreAudit({
    blueprint,
    compiledFeatures,
    compiled,
    expectedGenres: sample.expectations?.artifactGenres || [],
  });
  const sessionFeasibility = buildSessionFeasibilityAudit({ blueprint, compiledFeatures, compiled });
  const assessmentArchitecture = buildAssessmentArchitectureAudit({ blueprint, compiledFeatures, compiled });
  const criterionWeighting = buildCriterionWeightingAudit({ blueprint, compiledFeatures, compiled });
  const conceptGraph = buildConceptGraphAudit({ blueprint, compiledFeatures, compiled });
  const masteryEvidence = buildMasteryEvidenceAudit({ blueprint, compiledFeatures, compiled });
  const evidenceResponse = buildEvidenceResponseAudit({ blueprint, compiledFeatures, compiled });
  const compiledAlignmentFindings = buildCompiledAlignmentFindings({ blueprint, compiledFeatures, compiled });
  const blueprintFidelityFindings = buildBlueprintFidelityFindings({ blueprint, compiledFeatures, compiled });
  const enrichmentImpact = buildEnrichmentImpactAudit({
    sample,
    runtime,
    courseMap,
    compiledFeatures,
    enrichedBlueprint: blueprint,
    enrichedCompiled: compiled,
    enrichedFidelityFindings: blueprintFidelityFindings,
  });
  const packageText = collectStrings(compiled).join(' ');
  const classroomExcellence = buildClassroomExcellenceScorecard({
    sample,
    blueprint,
    compiled,
    packageText,
    blueprintAlignmentFindings,
    compiledAlignmentFindings,
    blueprintFidelityFindings,
  });
  const packageFindings = [];
  addPatternFindings({
    findings: packageFindings,
    featureId: 'package',
    text: packageText,
    expectations: {
      mustMatch: sample.expectations?.packageMustMatch || [],
      mustNotMatch: sample.expectations?.packageMustNotMatch || [],
    },
    scopeLabel: 'compiled package',
  });

  const featureResults = compiledFeatures.map((featureId) => {
    const data = compiled[featureId];
    const validation = runtime.validateDeliverableGeneration(featureId, data, {
      expectedLessonCount: scope,
      config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
    });
    const quality = runtime.scoreHeuristic(featureId, data);
    const qualityAvg = runtime.computeAvgScore(quality);
    const text = collectStrings(data).join(' ');
    const placeholders = runtime.findPublishabilityPlaceholders(text, { limit: 6 });
    const expectations = mergeFeatureExpectations(sample.expectations || {}, featureId);
    const findings = [
      ...validation.blockers.map((message) =>
        makeFinding('blocker', featureId, 'validator', `Generation validator failed: ${message}`),
      ),
      ...buildShapeFindings(featureId, data, scope),
    ];
    if (Number.isFinite(qualityAvg) && qualityAvg < expectations.minQuality) {
      findings.push(
        makeFinding(
          'blocker',
          featureId,
          'qualityFloor',
          `Heuristic quality ${qualityAvg} is below gold floor ${expectations.minQuality}.`,
        ),
      );
    }
    if (placeholders.length > 0) {
      findings.push(
        makeFinding('blocker', featureId, 'publishability', `Publishability placeholder detected: ${placeholders[0]}.`),
      );
    }
    addPatternFindings({
      findings,
      featureId,
      text,
      expectations,
      scopeLabel: FEATURE_LABELS[featureId] || featureId,
    });

    return {
      featureId,
      label: FEATURE_LABELS[featureId] || featureId,
      itemCount: featureId === 'syllabus' ? (data?.syllabus ? 1 : 0) : getFeatureArray(featureId, data).length,
      qualityAvg,
      validationStatus: validation.valid ? 'pass' : 'blocked',
      shapeStatus: summarizeFeatureStatus(
        findings.filter((finding) => finding.check !== 'mustMatch' && finding.check !== 'mustMatchAny'),
      ),
      expectationStatus: summarizeFeatureStatus(
        findings.filter(
          (finding) =>
            finding.check === 'mustMatch' || finding.check === 'mustMatchAny' || finding.check === 'mustNotMatch',
        ),
      ),
      findings,
    };
  });

  const findings = [
    ...blueprintMaturity.findings,
    ...blueprintExpectationFindings,
    ...sourceFidelity.findings,
    ...decodeLosslessness.findings,
    ...teachingIntent.findings,
    ...instructionalMoves.findings,
    ...modalityFit.findings,
    ...artifactGenre.findings,
    ...sessionFeasibility.findings,
    ...assessmentArchitecture.findings,
    ...criterionWeighting.findings,
    ...conceptGraph.findings,
    ...masteryEvidence.findings,
    ...evidenceResponse.findings,
    ...blueprintAlignmentFindings,
    ...compiledAlignmentFindings,
    ...blueprintFidelityFindings,
    ...enrichmentImpact.findings,
    ...classroomExcellence.findings,
    ...packageFindings,
    ...featureResults.flatMap((result) => result.findings),
  ];
  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const qualityValues = featureResults.map((result) => result.qualityAvg).filter(Number.isFinite);

  return {
    sampleId: sample.id,
    label: sample.label,
    courseName: courseMap.courseName,
    scope,
    enrichmentSource: sample.enrichment?.source || 'none',
    compiledFeatures,
    blueprintMaturity,
    alignmentSummary: {
      blueprintRows: Array.isArray(blueprint.alignmentMatrix) ? blueprint.alignmentMatrix.length : 0,
      compiledAlignmentFindings: compiledAlignmentFindings.length,
      blueprintAlignmentFindings: blueprintAlignmentFindings.length,
    },
    sourceFidelitySummary: {
      status: sourceFidelity.status,
      sourceRows: sourceFidelity.sourceRows,
      checkedFeatures: sourceFidelity.checkedFeatures,
      blueprintFindings: sourceFidelity.blueprintFindings,
      compiledFindings: sourceFidelity.compiledFindings,
      findings: sourceFidelity.findings.length,
    },
    sourceFidelity,
    decodeLosslessnessSummary: {
      status: decodeLosslessness.status,
      lessonRows: decodeLosslessness.lessonRows,
      checkedFeatures: decodeLosslessness.checkedFeatures,
      minBlueprintCoverage: decodeLosslessness.minBlueprintCoverage,
      minCompiledCoverage: decodeLosslessness.minCompiledCoverage,
      blueprintFindings: decodeLosslessness.blueprintFindings,
      compiledFindings: decodeLosslessness.compiledFindings,
      findings: decodeLosslessness.findings.length,
    },
    decodeLosslessness,
    teachingIntentSummary: {
      status: teachingIntent.status,
      lessonRows: teachingIntent.lessonRows,
      checkedFeatures: teachingIntent.checkedFeatures,
      blueprintFindings: teachingIntent.blueprintFindings,
      compiledFindings: teachingIntent.compiledFindings,
      findings: teachingIntent.findings.length,
    },
    teachingIntent,
    instructionalMoveSummary: {
      status: instructionalMoves.status,
      lessonRows: instructionalMoves.lessonRows,
      checkedFeatures: instructionalMoves.checkedFeatures,
      blueprintFindings: instructionalMoves.blueprintFindings,
      compiledFindings: instructionalMoves.compiledFindings,
      findings: instructionalMoves.findings.length,
    },
    instructionalMoves,
    modalityFitSummary: {
      status: modalityFit.status,
      primaryMode: modalityFit.primaryMode,
      lessonRows: modalityFit.lessonRows,
      checkedFeatures: modalityFit.checkedFeatures,
      blueprintFindings: modalityFit.blueprintFindings,
      compiledFindings: modalityFit.compiledFindings,
      findings: modalityFit.findings.length,
    },
    modalityFit,
    artifactGenreSummary: {
      status: artifactGenre.status,
      lessonRows: artifactGenre.lessonRows,
      expectedRows: artifactGenre.expectedRows,
      expectedMatches: artifactGenre.expectedMatches,
      checkedFeatures: artifactGenre.checkedFeatures,
      blueprintFindings: artifactGenre.blueprintFindings,
      compiledFindings: artifactGenre.compiledFindings,
      findings: artifactGenre.findings.length,
    },
    artifactGenre,
    sessionFeasibilitySummary: {
      status: sessionFeasibility.status,
      lessonRows: sessionFeasibility.lessonRows,
      checkedFeatures: sessionFeasibility.checkedFeatures,
      blueprintFindings: sessionFeasibility.blueprintFindings,
      compiledFindings: sessionFeasibility.compiledFindings,
      findings: sessionFeasibility.findings.length,
    },
    sessionFeasibility,
    assessmentArchitectureSummary: {
      status: assessmentArchitecture.status,
      lessonRows: assessmentArchitecture.lessonRows,
      checkedFeatures: assessmentArchitecture.checkedFeatures,
      totalWeightPercent: assessmentArchitecture.totalWeightPercent,
      highStakesWeightPercent: assessmentArchitecture.highStakesWeightPercent,
      blueprintFindings: assessmentArchitecture.blueprintFindings,
      compiledFindings: assessmentArchitecture.compiledFindings,
      findings: assessmentArchitecture.findings.length,
    },
    assessmentArchitecture,
    criterionWeightingSummary: {
      status: criterionWeighting.status,
      lessonRows: criterionWeighting.lessonRows,
      checkedFeatures: criterionWeighting.checkedFeatures,
      blueprintFindings: criterionWeighting.blueprintFindings,
      compiledFindings: criterionWeighting.compiledFindings,
      findings: criterionWeighting.findings.length,
    },
    criterionWeighting,
    conceptGraphSummary: {
      status: conceptGraph.status,
      lessonRows: conceptGraph.lessonRows,
      nodeCount: conceptGraph.nodeCount,
      edgeCount: conceptGraph.edgeCount,
      checkedFeatures: conceptGraph.checkedFeatures,
      blueprintFindings: conceptGraph.blueprintFindings,
      compiledFindings: conceptGraph.compiledFindings,
      findings: conceptGraph.findings.length,
    },
    conceptGraph,
    masteryEvidenceSummary: {
      status: masteryEvidence.status,
      lessonRows: masteryEvidence.lessonRows,
      checkedStages: masteryEvidence.checkedStages,
      checkedFeatures: masteryEvidence.checkedFeatures,
      blueprintFindings: masteryEvidence.blueprintFindings,
      compiledFindings: masteryEvidence.compiledFindings,
      findings: masteryEvidence.findings.length,
    },
    masteryEvidence,
    evidenceResponseSummary: {
      status: evidenceResponse.status,
      lessonRows: evidenceResponse.lessonRows,
      checkedStates: evidenceResponse.checkedStates,
      checkedFeatures: evidenceResponse.checkedFeatures,
      blueprintFindings: evidenceResponse.blueprintFindings,
      compiledFindings: evidenceResponse.compiledFindings,
      findings: evidenceResponse.findings.length,
    },
    evidenceResponse,
    fidelitySummary: {
      checkedFeatures: compiledFeatures.filter((featureId) =>
        [
          'syllabus',
          'lessonPlans',
          'slideDecks',
          'assignments',
          'rubrics',
          'discussions',
          'quizBank',
          'studyGuides',
          'courseFaq',
        ].includes(featureId),
      ).length,
      findings: blueprintFidelityFindings.length,
    },
    enrichmentImpact,
    classroomExcellence,
    packageFindings,
    featureResults,
    findings,
    summary: {
      status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'pass',
      blockerCount,
      warningCount,
      minQuality: qualityValues.length ? Math.min(...qualityValues) : null,
      minExcellence: classroomExcellence.minScore,
      avgQuality: qualityValues.length
        ? Number((qualityValues.reduce((sum, score) => sum + score, 0) / qualityValues.length).toFixed(2))
        : null,
    },
  };
}

function buildGoldScopeCoverage(results, requiredScopes = REQUIRED_GOLD_SCOPE_COVERAGE) {
  const scopeCounts = new Map();
  const scopeModalities = new Map();
  for (const result of results) {
    scopeCounts.set(result.scope, (scopeCounts.get(result.scope) || 0) + 1);
    const modality = result.modalityFitSummary?.primaryMode || 'unknown';
    if (!scopeModalities.has(result.scope)) scopeModalities.set(result.scope, new Set());
    scopeModalities.get(result.scope).add(modality);
  }
  const coveredScopes = [...scopeCounts.keys()].sort((a, b) => a - b);
  const missingScopes = requiredScopes.filter((scope) => !scopeCounts.has(scope));
  const missingModalityScopes = requiredScopes.filter(
    (scope) => (scopeModalities.get(scope)?.size || 0) < MIN_GOLD_MODALITIES_PER_REQUIRED_SCOPE,
  );
  const findings = missingScopes.map((scope) =>
    makeFinding(
      'blocker',
      'goldScopeCoverage',
      'scopeCoverage',
      `Gold audit is missing a strict A-quality sample at ${scope} lesson(s).`,
    ),
  );
  for (const scope of missingModalityScopes) {
    if (missingScopes.includes(scope)) continue;
    const modalities = [...(scopeModalities.get(scope) || new Set())].sort();
    findings.push(
      makeFinding(
        'blocker',
        'goldScopeCoverage',
        'scopeModalityCoverage',
        `Gold audit needs at least ${MIN_GOLD_MODALITIES_PER_REQUIRED_SCOPE} teaching modalities at ${scope} lessons; found ${modalities.length}: ${modalities.join(', ') || 'none'}.`,
      ),
    );
  }

  return {
    status: findings.length > 0 ? 'blocked' : 'pass',
    requiredScopes,
    minModalitiesPerRequiredScope: MIN_GOLD_MODALITIES_PER_REQUIRED_SCOPE,
    coveredScopes,
    missingScopes,
    missingModalityScopes,
    counts: Object.fromEntries([...scopeCounts.entries()].sort((a, b) => a[0] - b[0])),
    modalityCounts: Object.fromEntries(
      [...scopeModalities.entries()].sort((a, b) => a[0] - b[0]).map(([scope, modalities]) => [scope, modalities.size]),
    ),
    modalitiesByScope: Object.fromEntries(
      [...scopeModalities.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([scope, modalities]) => [scope, [...modalities].sort()]),
    ),
    findings,
  };
}

function summarizeGoldResults(results, auditFindings = []) {
  const blockers =
    results.reduce((sum, result) => sum + result.summary.blockerCount, 0) +
    auditFindings.filter((finding) => finding.severity === 'blocker').length;
  const warnings =
    results.reduce((sum, result) => sum + result.summary.warningCount, 0) +
    auditFindings.filter((finding) => finding.severity === 'warning').length;
  const qualityValues = results.map((result) => result.summary.minQuality).filter(Number.isFinite);
  const excellenceValues = results.map((result) => result.summary.minExcellence).filter(Number.isFinite);
  const enrichmentImpacts = results
    .map((result) => result.enrichmentImpact)
    .filter((impact) => impact && impact.status !== 'not-applicable');
  const enrichmentCoverageValues = enrichmentImpacts.map((impact) => impact.phraseCoverage).filter(Number.isFinite);
  const deterministicBaselineQualityValues = enrichmentImpacts
    .map((impact) => impact.baselineMinQuality)
    .filter(Number.isFinite);
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    goldSampleCount: results.length,
    blockers,
    warnings,
    minQuality: qualityValues.length ? Math.min(...qualityValues) : null,
    minExcellence: excellenceValues.length ? Math.min(...excellenceValues) : null,
    enrichmentImpactCount: enrichmentImpacts.length,
    enrichmentJustifiedCount: enrichmentImpacts.filter((impact) => impact.justifiesEnrichmentCall).length,
    minEnrichmentPhraseCoverage: enrichmentCoverageValues.length ? Math.min(...enrichmentCoverageValues) : null,
    minDeterministicBaselineQuality: deterministicBaselineQualityValues.length
      ? Math.min(...deterministicBaselineQualityValues)
      : null,
  };
}

export async function buildGoldSampleQualityAudit(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const samples = Array.isArray(options.samples) && options.samples.length > 0 ? options.samples : DEFAULT_GOLD_SAMPLES;
  const results = samples.map((sample) =>
    auditGoldSample({
      sample,
      runtime,
      features: options.features || sample.features || PIPELINE_FEATURES,
    }),
  );
  const scopeCoverage = buildGoldScopeCoverage(results, options.requiredScopes || REQUIRED_GOLD_SCOPE_COVERAGE);
  const auditFindings = [...scopeCoverage.findings];
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      qualityFloor: GOLD_QUALITY_FLOOR,
      classroomExcellenceFloor: CLASSROOM_EXCELLENCE_FLOOR,
      requiredScopeCoverage: scopeCoverage.requiredScopes,
      note: 'Gold samples are curated expectation fixtures. They are stricter than validators, but they are not a replacement for external expert-reviewed course samples.',
    },
    summary: {
      ...summarizeGoldResults(results, auditFindings),
      scopeCoverageStatus: scopeCoverage.status,
      coveredScopes: scopeCoverage.coveredScopes,
      missingScopes: scopeCoverage.missingScopes,
      missingScopeModalityCoverage: scopeCoverage.missingModalityScopes,
    },
    scopeCoverage,
    auditFindings,
    results,
  };
}

function markdownTable(rows) {
  return rows.join('\n');
}

export function renderGoldSampleQualityAuditMarkdown(payload) {
  const caseRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.scope} | ${result.enrichmentSource} | ${result.summary.status} | ${result.summary.minQuality} | ${result.summary.minExcellence} | ${result.summary.blockerCount} | ${result.summary.warningCount} |`,
  );
  const scopeCoverageRows = (payload.scopeCoverage?.requiredScopes || []).map((scope) => {
    const count = payload.scopeCoverage?.counts?.[scope] || 0;
    const modalityCount = payload.scopeCoverage?.modalityCounts?.[scope] || 0;
    const modalities = payload.scopeCoverage?.modalitiesByScope?.[scope] || [];
    const status =
      count > 0 && modalityCount >= (payload.scopeCoverage?.minModalitiesPerRequiredScope || 1) ? 'pass' : 'blocked';
    return `| ${scope} | ${status} | ${count} | ${modalityCount}/${payload.scopeCoverage?.minModalitiesPerRequiredScope || 1} | ${modalities.join(', ') || 'none'} |`;
  });
  const blueprintRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.blueprintMaturity.status} | ${result.blueprintMaturity.compilerPath?.source || 'missing'} | ${result.blueprintMaturity.adaptiveSafety?.status || 'missing'} | ${result.blueprintMaturity.compilerDecisionMatrix?.status || 'missing'} | ${result.blueprintMaturity.compilerDecisionMatrix?.reviewRequiredCount ?? ''} | ${result.blueprintMaturity.sourceRiskRegister?.status || 'missing'} | ${result.blueprintMaturity.sourceConflictReport?.status || 'missing'} | ${result.blueprintMaturity.blueprintAssumptionLedger?.status || 'missing'} | ${result.blueprintMaturity.blueprintAssumptionLedger?.reviewRequiredCount ?? ''} | ${result.blueprintMaturity.timingStatus || 'missing'} | ${result.blueprintMaturity.confidenceLevel} | ${result.blueprintMaturity.averageConfidenceScore} | ${result.blueprintMaturity.sourceGroundedLessonCount} | ${result.blueprintMaturity.averageWorkloadMinutes} | ${result.blueprintMaturity.averagePlannedClassMinutes} | ${result.blueprintMaturity.reviewFlagCount} |`,
  );
  const blueprintReviewRows = payload.results.map((result) => {
    const surface = result.blueprintMaturity.blueprintReviewSurface || {};
    return `| ${result.sampleId} | ${surface.status || 'missing'} | ${surface.traceabilitySummary?.status || 'missing'} | ${surface.instructionalMoveDecode?.status || 'missing'} | ${surface.instructionalMoveDecode?.source || 'missing'} | ${surface.courseDecode?.modality || 'missing'} | ${surface.courseDecode?.learnerRole || 'missing'} | ${surface.lessonRows?.length ?? 0} | ${surface.traceabilitySummary?.instructionalMoveRows ?? ''} | ${surface.localConfirmationSummary?.localConfirmationCount ?? ''} | ${surface.localConfirmationSummary?.sourceReviewRequiredCount ?? ''} | ${surface.traceabilitySummary?.untraceableRows ?? ''} | ${surface.machineDecodeCompleteness?.checkedArtifacts ?? ''} |`;
  });
  const featureRows = payload.results.flatMap((result) =>
    result.featureResults.map(
      (feature) =>
        `| ${result.sampleId} | ${feature.label} | ${feature.itemCount} | ${feature.qualityAvg} | ${feature.validationStatus} | ${feature.shapeStatus} | ${feature.expectationStatus} | ${feature.findings.length} |`,
    ),
  );
  const alignmentRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.alignmentSummary?.blueprintRows ?? 0} | ${result.alignmentSummary?.blueprintAlignmentFindings ?? 0} | ${result.alignmentSummary?.compiledAlignmentFindings ?? 0} |`,
  );
  const sourceFidelityRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.sourceFidelitySummary?.status || 'missing'} | ${result.sourceFidelitySummary?.sourceRows ?? 0} | ${result.sourceFidelitySummary?.checkedFeatures ?? 0} | ${result.sourceFidelitySummary?.blueprintFindings ?? 0} | ${result.sourceFidelitySummary?.compiledFindings ?? 0} |`,
  );
  const decodeLosslessnessRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.decodeLosslessnessSummary?.status || 'missing'} | ${result.decodeLosslessnessSummary?.lessonRows ?? 0} | ${result.decodeLosslessnessSummary?.checkedFeatures ?? 0} | ${result.decodeLosslessnessSummary?.minBlueprintCoverage ?? ''} | ${result.decodeLosslessnessSummary?.minCompiledCoverage ?? ''} | ${result.decodeLosslessnessSummary?.blueprintFindings ?? 0} | ${result.decodeLosslessnessSummary?.compiledFindings ?? 0} |`,
  );
  const teachingIntentRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.teachingIntentSummary?.status || 'missing'} | ${result.teachingIntentSummary?.lessonRows ?? 0} | ${result.teachingIntentSummary?.checkedFeatures ?? 0} | ${result.teachingIntentSummary?.blueprintFindings ?? 0} | ${result.teachingIntentSummary?.compiledFindings ?? 0} |`,
  );
  const instructionalMoveRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.instructionalMoveSummary?.status || 'missing'} | ${result.instructionalMoveSummary?.lessonRows ?? 0} | ${result.instructionalMoveSummary?.checkedFeatures ?? 0} | ${result.instructionalMoveSummary?.blueprintFindings ?? 0} | ${result.instructionalMoveSummary?.compiledFindings ?? 0} |`,
  );
  const modalityFitRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.modalityFitSummary?.status || 'missing'} | ${result.modalityFitSummary?.primaryMode || 'missing'} | ${result.modalityFitSummary?.lessonRows ?? 0} | ${result.modalityFitSummary?.checkedFeatures ?? 0} | ${result.modalityFitSummary?.blueprintFindings ?? 0} | ${result.modalityFitSummary?.compiledFindings ?? 0} |`,
  );
  const artifactGenreRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.artifactGenreSummary?.status || 'missing'} | ${result.artifactGenreSummary?.expectedMatches ?? 0}/${result.artifactGenreSummary?.expectedRows ?? 0} | ${result.artifactGenreSummary?.lessonRows ?? 0} | ${result.artifactGenreSummary?.checkedFeatures ?? 0} | ${result.artifactGenreSummary?.blueprintFindings ?? 0} | ${result.artifactGenreSummary?.compiledFindings ?? 0} |`,
  );
  const sessionFeasibilityRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.sessionFeasibilitySummary?.status || 'missing'} | ${result.sessionFeasibilitySummary?.lessonRows ?? 0} | ${result.sessionFeasibilitySummary?.checkedFeatures ?? 0} | ${result.sessionFeasibilitySummary?.blueprintFindings ?? 0} | ${result.sessionFeasibilitySummary?.compiledFindings ?? 0} |`,
  );
  const assessmentArchitectureRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.assessmentArchitectureSummary?.status || 'missing'} | ${result.assessmentArchitectureSummary?.lessonRows ?? 0} | ${result.assessmentArchitectureSummary?.checkedFeatures ?? 0} | ${result.assessmentArchitectureSummary?.totalWeightPercent ?? ''} | ${result.assessmentArchitectureSummary?.highStakesWeightPercent ?? ''} | ${result.assessmentArchitectureSummary?.blueprintFindings ?? 0} | ${result.assessmentArchitectureSummary?.compiledFindings ?? 0} |`,
  );
  const criterionWeightingRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.criterionWeightingSummary?.status || 'missing'} | ${result.criterionWeightingSummary?.lessonRows ?? 0} | ${result.criterionWeightingSummary?.checkedFeatures ?? 0} | ${result.criterionWeightingSummary?.blueprintFindings ?? 0} | ${result.criterionWeightingSummary?.compiledFindings ?? 0} |`,
  );
  const conceptGraphRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.conceptGraphSummary?.status || 'missing'} | ${result.conceptGraphSummary?.lessonRows ?? 0} | ${result.conceptGraphSummary?.nodeCount ?? 0} | ${result.conceptGraphSummary?.edgeCount ?? 0} | ${result.conceptGraphSummary?.checkedFeatures ?? 0} | ${result.conceptGraphSummary?.blueprintFindings ?? 0} | ${result.conceptGraphSummary?.compiledFindings ?? 0} |`,
  );
  const masteryEvidenceRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.masteryEvidenceSummary?.status || 'missing'} | ${result.masteryEvidenceSummary?.lessonRows ?? 0} | ${result.masteryEvidenceSummary?.checkedStages ?? 0} | ${result.masteryEvidenceSummary?.checkedFeatures ?? 0} | ${result.masteryEvidenceSummary?.blueprintFindings ?? 0} | ${result.masteryEvidenceSummary?.compiledFindings ?? 0} |`,
  );
  const evidenceResponseRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.evidenceResponseSummary?.status || 'missing'} | ${result.evidenceResponseSummary?.lessonRows ?? 0} | ${result.evidenceResponseSummary?.checkedStates ?? 0} | ${result.evidenceResponseSummary?.checkedFeatures ?? 0} | ${result.evidenceResponseSummary?.blueprintFindings ?? 0} | ${result.evidenceResponseSummary?.compiledFindings ?? 0} |`,
  );
  const fidelityRows = payload.results.map(
    (result) =>
      `| ${result.sampleId} | ${result.fidelitySummary?.checkedFeatures ?? 0} | ${result.fidelitySummary?.findings ?? 0} |`,
  );
  const enrichmentRows = payload.results.map((result) => {
    const impact = result.enrichmentImpact || {};
    return `| ${result.sampleId} | ${impact.status || 'missing'} | ${impact.source || 'none'} | ${impact.enrichedSignatureMatches ?? 0}/${impact.signatureSignalCount ?? 0} | ${impact.signatureLift ?? 0} | ${impact.enrichedPhraseMatches ?? 0}/${impact.phraseSignalCount ?? 0} | ${impact.phraseLift ?? 0} | ${impact.phraseCoverage ?? ''} | ${impact.baselineCompilerContractStatus || ''} | ${impact.baselineMinQuality ?? ''} -> ${impact.enrichedMinQuality ?? ''} | ${impact.baselineFidelityFindings ?? 0} -> ${impact.enrichedFidelityFindings ?? 0} | ${impact.justifiesEnrichmentCall ? 'yes' : 'no'} |`;
  });
  const excellenceRows = payload.results.flatMap((result) =>
    (result.classroomExcellence?.dimensions || []).map(
      (dimension) =>
        `| ${result.sampleId} | ${dimension.label} | ${dimension.score} | ${dimension.passed}/${dimension.total} | ${dimension.missing.length} |`,
    ),
  );
  const findings = payload.results.flatMap((result) =>
    result.findings.map((finding) => `- ${result.sampleId}/${finding.featureId}/${finding.check}: ${finding.message}`),
  );
  const auditFindings = (payload.auditFindings || []).map(
    (finding) => `- audit/${finding.featureId}/${finding.check}: ${finding.message}`,
  );

  const lines = [
    '# CourseMapper Gold-Sample Quality Audit',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    '',
    '## Summary',
    '',
    `Status: ${payload.summary.status}`,
    `Gold samples: ${payload.summary.goldSampleCount}`,
    `Minimum quality score: ${payload.summary.minQuality}`,
    `Minimum classroom excellence score: ${payload.summary.minExcellence}`,
    `Enrichment impact cases: ${payload.summary.enrichmentImpactCount}`,
    `Enrichment justified cases: ${payload.summary.enrichmentJustifiedCount}`,
    `Minimum enrichment phrase coverage: ${payload.summary.minEnrichmentPhraseCoverage}`,
    `Minimum deterministic baseline quality: ${payload.summary.minDeterministicBaselineQuality}`,
    `Scope coverage: ${payload.summary.scopeCoverageStatus} (${(payload.summary.coveredScopes || []).join(', ') || 'none'})`,
    `Blockers: ${payload.summary.blockers}`,
    `Warnings: ${payload.summary.warnings}`,
    '',
    `Note: ${payload.meta.note}`,
    '',
    '## Gold Case Matrix',
    '',
    markdownTable([
      '| Gold Sample | Scope | Enrichment Source | Status | Min Quality | Min Excellence | Blockers | Warnings |',
      '| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |',
      ...caseRows,
    ]),
    '',
    '## Scope Coverage Matrix',
    '',
    markdownTable([
      '| Required Scope | Status | Sample Count | Modality Coverage | Modalities |',
      '| ---: | --- | ---: | ---: | --- |',
      ...scopeCoverageRows,
    ]),
    '',
    '## Blueprint Maturity Matrix',
    '',
    markdownTable([
      '| Gold Sample | Blueprint Status | Compiler Path | Adaptive Safety | Compiler Decisions | Review Required Lessons | Source Risk | Source Conflicts | Assumption Ledger | Ledger Review Items | Timing | Confidence | Confidence Score | Source-Grounded Lessons | Avg Workload Minutes | Avg Live Minutes | Review Flags |',
      '| --- | --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...blueprintRows,
    ]),
    '',
    '## Blueprint Review Surface Matrix',
    '',
    markdownTable([
      '| Gold Sample | Review Surface | Traceability | Instructional Moves | Move Source | Modality | Learner Role | Lesson Rows | Move Rows | Local Confirmations | Source-Review Lessons | Untraceable Rows | Checked Artifacts |',
      '| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...blueprintReviewRows,
    ]),
    '',
    '## Instructional Alignment Matrix',
    '',
    markdownTable([
      '| Gold Sample | Blueprint Rows | Blueprint Alignment Findings | Compiled Alignment Findings |',
      '| --- | ---: | ---: | ---: |',
      ...alignmentRows,
    ]),
    '',
    '## Source Fidelity Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Source Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...sourceFidelityRows,
    ]),
    '',
    '## Blueprint Decode Losslessness Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Min Blueprint Coverage | Min Compiled Coverage | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...decodeLosslessnessRows,
    ]),
    '',
    '## Teaching Intent Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...teachingIntentRows,
    ]),
    '',
    '## Instructional Move Propagation Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...instructionalMoveRows,
    ]),
    '',
    '## Modality Fit Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Primary Mode | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | --- | ---: | ---: | ---: | ---: |',
      ...modalityFitRows,
    ]),
    '',
    '## Artifact Genre Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Gold Matches | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...artifactGenreRows,
    ]),
    '',
    '## Session Feasibility Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...sessionFeasibilityRows,
    ]),
    '',
    '## Assessment Architecture Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Total Weight | High-Stakes Weight | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...assessmentArchitectureRows,
    ]),
    '',
    '## Criterion Weighting Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...criterionWeightingRows,
    ]),
    '',
    '## Concept Dependency Graph Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Nodes | Edges | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...conceptGraphRows,
    ]),
    '',
    '## Mastery Evidence Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked Stages | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...masteryEvidenceRows,
    ]),
    '',
    '## Evidence Response Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Lessons | Checked States | Checked Features | Blueprint Findings | Compiled Findings |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
      ...evidenceResponseRows,
    ]),
    '',
    '## Blueprint Fidelity Matrix',
    '',
    markdownTable([
      '| Gold Sample | Checked Lesson-Facing Features | Fidelity Findings |',
      '| --- | ---: | ---: |',
      ...fidelityRows,
    ]),
    '',
    '## Enrichment Impact Matrix',
    '',
    markdownTable([
      '| Gold Sample | Status | Source | Signature Matches | Signature Lift | Phrase Matches | Phrase Lift | Phrase Coverage | Baseline Contract | Min Quality | Fidelity Findings | Justifies Call |',
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
      ...enrichmentRows,
    ]),
    '',
    '## Classroom Excellence Matrix',
    '',
    markdownTable([
      '| Gold Sample | Dimension | Score | Checks Passed | Missing Checks |',
      '| --- | --- | ---: | ---: | ---: |',
      ...excellenceRows,
    ]),
    '',
    '## Feature Gold Gate Matrix',
    '',
    markdownTable([
      '| Gold Sample | Feature | Items | Quality | Validator | Shape | Gold Expectations | Findings |',
      '| --- | --- | ---: | ---: | --- | --- | --- | ---: |',
      ...featureRows,
    ]),
    '',
    '## Findings',
    '',
  ];
  lines.push(
    ...(auditFindings.length + findings.length > 0 ? [...auditFindings, ...findings] : ['- No gold-sample findings.']),
  );
  return `${lines.join('\n')}\n`;
}

export async function writeGoldSampleQualityAudit(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderGoldSampleQualityAuditMarkdown(payload));
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildGoldSampleQualityAudit();
    const paths = await writeGoldSampleQualityAudit(payload, args.outputDir);
    console.log(`Gold-sample quality audit: ${payload.summary.status}`);
    console.log(`Report: ${paths.markdownPath}`);
    if (payload.summary.status !== 'pass') {
      process.exitCode = 1;
    }
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
