#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createServer } from 'vite';
import { buildHumanReviewRecommendation, summarizeRepairEvidence } from '../src/lib/packageTrust.js';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'hybrid-pipeline-audit');
const DEFAULT_SCOPES = [5, 8, 14];
const QUALITY_FLOOR = 6;

export const PIPELINE_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

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

const DEFAULT_COLUMNS = [
  { key: 'learningGoals', label: 'Learning Goals', enabled: true },
  { key: 'topicSection', label: 'Topic/Section', enabled: true },
  { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
  { key: 'weeklyAssessments', label: 'Weekly Assessments', enabled: true },
  { key: 'asyncActivities', label: 'Asynchronous Activities', enabled: true },
  { key: 'syncActivities', label: 'Synchronous Activities', enabled: true },
  { key: 'technologyNeeded', label: 'Technology Needed', enabled: true },
  { key: 'presentationFormat', label: 'Presentation Format', enabled: true },
  { key: 'supportingResources', label: 'Supporting Resources', enabled: true },
  { key: 'evaluateDesign', label: 'Evaluation/Design', enabled: true },
];

const GENERIC_FILLER_RE =
  /\b(concepts?|frameworks?|methodolog(?:y|ies)|content|materials?|resources?|activities?|appropriate|relevant|various|understanding|knowledge)\b/gi;
const PER_LESSON_COMPILED_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

let auditRuntimePromise = null;

export async function loadHybridPipelineAuditRuntime() {
  if (auditRuntimePromise) return auditRuntimePromise;
  auditRuntimePromise = (async () => {
    const server = await createServer({
      appType: 'custom',
      cacheDir: path.join(ROOT, 'node_modules', '.vite', `audit-${process.pid}`),
      logLevel: 'error',
      optimizeDeps: { entries: [], noDiscovery: true },
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: {
          // The audit runtime only loads source modules explicitly. Watching retained
          // ZIPs, model runs, and prior reports makes startup scale with evidence
          // volume and can stall a release audit before the first fixture begins.
          ignored: [
            /(^|[/\\])verification-output([/\\]|$)/,
            /(^|[/\\])trellis[/\\]runs([/\\]|$)/,
            /(^|[/\\])trellis[/\\]tendril[/\\]distill[/\\](models|runs|tutor)([/\\]|$)/,
          ],
        },
      },
    });
    // Load these modules in a stable order. Several of them converge on the
    // Firebase/gRPC CommonJS graph; parallel SSR evaluation can observe a
    // partially initialized CJS export and strand the audit before fixture 1.
    const apiCostControl = await server.ssrLoadModule('/src/lib/apiCostControl.js');
    const courseBlueprintCompiler = await server.ssrLoadModule('/src/lib/courseBlueprintCompiler.js');
    const contentFallbackTelemetry = await server.ssrLoadModule('/src/lib/contentFallbackTelemetry.js');
    const classroomReadiness = await server.ssrLoadModule('/src/lib/classroomReadiness.js');
    const deliverableReadiness = await server.ssrLoadModule('/src/lib/deliverableReadiness.js');
    const deliverableQualityScorer = await server.ssrLoadModule('/src/lib/deliverableQualityScorer.js');
    const deliverablePostProcess = await server.ssrLoadModule('/src/lib/deliverablePostProcess.js');
    const publishabilityPlaceholders = await server.ssrLoadModule('/src/lib/publishabilityPlaceholders.js');
    return {
      server,
      buildApiCostPlan: apiCostControl.buildApiCostPlan,
      buildCourseBlueprint: courseBlueprintCompiler.buildCourseBlueprint,
      compileBlueprintDeliverables: courseBlueprintCompiler.compileBlueprintDeliverables,
      getContentFallbackTelemetry: contentFallbackTelemetry.getContentFallbackTelemetry,
      resetContentFallbackTelemetry: contentFallbackTelemetry.resetContentFallbackTelemetry,
      estimateBlueprintCompilerSavings: courseBlueprintCompiler.estimateBlueprintCompilerSavings,
      getBlueprintCompiledFeatures: courseBlueprintCompiler.getBlueprintCompiledFeatures,
      evaluateClassroomReadiness: classroomReadiness.evaluateClassroomReadiness,
      evaluateWorkspaceReadiness: deliverableReadiness.evaluateWorkspaceReadiness,
      repairCourseMapReadiness: deliverableReadiness.repairCourseMapReadiness,
      computeAvgScore: deliverableQualityScorer.computeAvgScore,
      scoreHeuristic: deliverableQualityScorer.scoreHeuristic,
      validateDeliverableGeneration: deliverablePostProcess.validateDeliverableGeneration,
      findPublishabilityPlaceholders: publishabilityPlaceholders.findPublishabilityPlaceholders,
      close: () => server.close(),
    };
  })();
  return auditRuntimePromise;
}

export async function closeHybridPipelineAuditRuntime() {
  if (!auditRuntimePromise) return;
  const runtime = await auditRuntimePromise;
  await runtime.close();
  auditRuntimePromise = null;
}

function makeCourseMap({ courseName, semester = 'Fall 2026', outcomes, lessons }) {
  return {
    courseName,
    semester,
    learningOutcomes: outcomes,
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
          technologyNeeded: lesson.technology || 'Course site, shared documents, and assigned analysis tools.',
          presentationFormat: lesson.format || 'Brief instructor framing, applied lab, peer review, and debrief.',
          supportingResources: lesson.resources,
          evaluateDesign: lesson.evaluation,
        },
      ],
    })),
  };
}

const RESEARCH_METHODS_LESSONS = [
  {
    title: 'Asking Researchable Social Science Questions',
    goals: 'Students distinguish broad social problems from empirical research questions.',
    topics: 'Research questions, constructs, variables, population, feasibility, scope',
    objectives: 'Analyze a broad issue and formulate a focused empirical research question.',
    assessment: 'Question-quality memo with two revised research questions and rationale.',
    async: 'Annotated examples and a feasibility checklist.',
    sync: 'Question clinic with peer critique using feasibility and ethics criteria.',
    resources: 'Question formulation checklist; empirical article examples; library search guide',
    evaluation: 'Score population, variable clarity, feasibility, and ethical fit.',
  },
  {
    title: 'Reviewing Literature and Building a Conceptual Frame',
    goals: 'Students use scholarly literature to locate a research gap.',
    topics: 'Library search, source quality, synthesis matrix, conceptual frame, gap statements',
    objectives: 'Synthesize empirical articles into a concise rationale for a study.',
    assessment: 'Mini literature matrix with three sources and a gap statement.',
    async: 'Library database walkthrough and source-quality checklist.',
    sync: 'Search lab and synthesis workshop using social work research articles.',
    resources: 'Library guide; synthesis matrix template; source evaluation checklist',
    evaluation: 'Assess source relevance, synthesis quality, and gap logic.',
  },
  {
    title: 'Designing Ethical Sampling and Recruitment Plans',
    goals: 'Students compare sampling strategies and identify recruitment risks.',
    topics: 'Sampling frames, purposive sampling, stratified sampling, recruitment, consent',
    objectives: 'Evaluate fit between a question, population, sampling strategy, and recruitment plan.',
    assessment: 'Sampling critique diagnosing bias risks and recommending improvements.',
    async: 'Sampling mini-lecture and ethics reading notes.',
    sync: 'Case analysis lab comparing convenience, purposive, stratified, and snowball sampling.',
    resources: 'Sampling decision tree; IRB recruitment examples; bias checklist',
    evaluation: 'Score sampling fit, bias diagnosis, and participant protection.',
  },
  {
    title: 'Collecting Survey and Interview Data',
    goals: 'Students design instruments that align constructs and reduce measurement error.',
    topics: 'Survey items, interview protocols, reliability, validity, pilot testing',
    objectives: 'Design survey or interview questions that operationalize a construct.',
    assessment: 'Instrument revision lab improving flawed survey and interview questions.',
    async: 'Measurement validity reading and biased wording practice.',
    sync: 'Item-writing workshop and peer review.',
    resources: 'Question-wording checklist; interview protocol template; validity examples',
    evaluation: 'Check construct alignment, clarity, and bias reduction.',
  },
  {
    title: 'Using Observation and Field Notes Responsibly',
    goals: 'Students plan observations while accounting for positionality and context.',
    topics: 'Observation protocols, field notes, reflexivity, positionality',
    objectives: 'Create an observation protocol separating behavior, context, and reflexive notes.',
    assessment: 'Field-note coding exercise using an observation scenario.',
    async: 'Example field notes and video observation practice.',
    sync: 'Protocol design workshop and observer-effects debrief.',
    resources: 'Observation template; reflexivity prompts; field-note excerpt',
    evaluation: 'Score protocol specificity, ethical care, and evidence traceability.',
  },
  {
    title: 'Preparing Data for Analysis',
    goals: 'Students clean and organize small datasets while preserving transparent decisions.',
    topics: 'Data dictionaries, missing data, coding decisions, documentation',
    objectives: 'Apply a cleaning protocol and document each decision.',
    assessment: 'Data-cleaning log with before and after variable notes.',
    async: 'Spreadsheet walkthrough and inconsistent-code practice.',
    sync: 'Data lab focused on missing values and coding rules.',
    resources: 'Data dictionary template; cleaning log; sample dataset',
    evaluation: 'Check cleaning traceability, decision quality, and documentation.',
  },
  {
    title: 'Interpreting Descriptive Statistics',
    goals: 'Students summarize patterns without overstating claims.',
    topics: 'Frequencies, means, medians, variation, tables, charts',
    objectives: 'Interpret descriptive statistics in plain language and state limitations.',
    assessment: 'Interpretation memo using one table and one chart.',
    async: 'Frequency table and distribution chart practice.',
    sync: 'Spreadsheet lab and peer critique of interpretation claims.',
    resources: 'Plain-language statistics guide; chart checklist; sample table',
    evaluation: 'Score accuracy, practical interpretation, and limitation language.',
  },
  {
    title: 'Testing Associations and Group Differences',
    goals: 'Students select simple inferential tests that match variables and questions.',
    topics: 'Cross-tabs, correlation, t-tests, chi-square, assumptions, practical significance',
    objectives: 'Compare tests and justify the best option for a research question.',
    assessment: 'Test-selection worksheet with interpretation of a provided result.',
    async: 'Variable-type examples and test-choice quiz.',
    sync: 'Decision-tree lab using social service outcome scenarios.',
    resources: 'Test-selection decision tree; interpretation examples; assumptions checklist',
    evaluation: 'Assess test fit, assumption checking, and interpretation quality.',
  },
  {
    title: 'Coding Qualitative Data',
    goals: 'Students code qualitative excerpts and connect themes to evidence.',
    topics: 'Open coding, codebooks, analytic memos, credibility, theme development',
    objectives: 'Apply initial codes and justify an emerging theme with evidence.',
    assessment: 'Codebook draft and analytic memo excerpt.',
    async: 'Qualitative coding demonstration and credibility reading.',
    sync: 'Collaborative coding comparison and theme-naming workshop.',
    resources: 'Codebook template; memo model; interview excerpt',
    evaluation: 'Score code clarity, evidence use, and memo reasoning.',
  },
  {
    title: 'Mixed Methods Integration',
    goals: 'Students explain when mixed methods strengthens a study.',
    topics: 'Convergent, explanatory, exploratory mixed methods, integration displays',
    objectives: 'Design an integration plan connecting quantitative and qualitative evidence.',
    assessment: 'Mixed methods design sketch with integration rationale.',
    async: 'Mixed methods diagram comparison and design quiz.',
    sync: 'Design studio matching questions to mixed methods structures.',
    resources: 'Mixed methods chart; integration prompt bank; sample diagrams',
    evaluation: 'Check strand fit, integration logic, and research-question alignment.',
  },
  {
    title: 'Research Ethics and IRB Preparation',
    goals: 'Students identify ethical risks and prepare participant-facing protections.',
    topics: 'Informed consent, confidentiality, mandated reporting, risk minimization, IRB',
    objectives: 'Critique a consent process for clarity, autonomy, and risk mitigation.',
    assessment: 'Consent-language revision with ethical justification.',
    async: 'Ethics case reading and IRB terminology review.',
    sync: 'Consent form workshop and scenario-based ethics discussion.',
    resources: 'Consent checklist; ethics case set; IRB guide',
    evaluation: 'Assess consent clarity, risk mitigation, and participant dignity.',
  },
  {
    title: 'Evaluating Program and Policy Evidence',
    goals: 'Students assess evidence quality for programs affecting communities.',
    topics: 'Logic models, outcomes, indicators, evidence strength, policy recommendations',
    objectives: 'Evaluate whether program evidence supports a practice or policy recommendation.',
    assessment: 'Evidence-quality brief using a logic model and outcome indicators.',
    async: 'Logic model tutorial and evaluation summary example.',
    sync: 'Program evidence critique in small groups.',
    resources: 'Logic model template; evidence rubric; outcome indicator examples',
    evaluation: 'Score indicator fit, evidence quality, and recommendation strength.',
  },
  {
    title: 'Communicating Findings to Practitioner Audiences',
    goals: 'Students translate findings into responsible recommendations.',
    topics: 'Plain-language summaries, visualization, limitations, audience adaptation',
    objectives: 'Create a practitioner summary that explains findings and limitations.',
    assessment: 'One-page findings brief for a practitioner audience.',
    async: 'Plain-language writing practice and visualization checklist.',
    sync: 'Brief critique and revision studio.',
    resources: 'Plain-language guide; visualization checklist; practitioner memo example',
    evaluation: 'Assess clarity, limitation language, and audience fit.',
  },
  {
    title: 'Final Evidence Portfolio and Reflection',
    goals: 'Students synthesize revised artifacts into a coherent evidence portfolio.',
    topics: 'Portfolio synthesis, revision evidence, reflection, professional presentation',
    objectives: 'Synthesize revised research artifacts and explain growth in evidence reasoning.',
    assessment: 'Final evidence portfolio with reflective memo and revised artifacts.',
    async: 'Portfolio assembly checklist and reflection prompt.',
    sync: 'Peer review gallery and final consultation.',
    resources: 'Portfolio checklist; reflection guide; revision tracker',
    evaluation: 'Score coherence, revision use, evidence quality, and reflection depth.',
  },
];

const AI_COURSE_DESIGN_LESSONS = RESEARCH_METHODS_LESSONS.map((lesson, index) => ({
  title:
    [
      'Learning-Goal Analysis for AI Course Design',
      'Prompt Patterns for Learning Activities',
      'Assessment Design with AI Feedback',
      'Rubric Calibration and Bias Review',
      'Accessible AI-Supported Materials',
      'Student Data Privacy and Tool Selection',
      'AI Tutoring Workflows and Escalation',
      'Evaluating AI Outputs for Accuracy',
      'Designing Human-in-the-Loop Review',
      'Multimodal Content and Captioning',
      'Academic Integrity and Disclosure',
      'Course Analytics and Intervention Planning',
      'Faculty Workflow Automation',
      'Capstone AI Course Redesign Portfolio',
    ][index] || lesson.title,
  goals: 'Students design AI-supported learning experiences that keep instructors accountable for quality and equity.',
  topics: `AI pedagogy, prompt design, feedback loops, accessibility, privacy, evaluation, ${lesson.topics}`,
  objectives: `Evaluate AI-supported instructional decisions and create a course-ready artifact for ${lesson.title}.`,
  assessment: `AI course design artifact ${index + 1}: quality review, risk analysis, and implementation plan.`,
  async: 'Review AI teaching examples, complete a prompt critique, and annotate risk controls.',
  sync: 'Design studio, peer testing, instructor calibration, and revision planning.',
  resources: 'AI teaching checklist; accessibility guide; prompt audit rubric; privacy decision tree',
  evaluation: 'Score alignment, learner support, accessibility, privacy, and implementation feasibility.',
}));

const COMMUNITY_HEALTH_LESSONS = RESEARCH_METHODS_LESSONS.map((lesson, index) => ({
  title:
    [
      'Community Needs Assessment Framing',
      'Stakeholder Mapping and Engagement',
      'Health Equity Data Sources',
      'Program Logic Model Design',
      'Screening and Referral Workflows',
      'Culturally Responsive Communication',
      'Implementation Barriers and Facilitators',
      'Outcome Indicator Selection',
      'Qualitative Feedback from Participants',
      'Mixed Evidence for Program Adaptation',
      'Ethics in Community Health Evaluation',
      'Policy Evidence and Advocacy Briefs',
      'Practitioner-Facing Findings',
      'Community Health Evaluation Portfolio',
    ][index] || lesson.title,
  goals: 'Students evaluate community health interventions with equity, implementation, and stakeholder evidence.',
  topics: `community health, equity, implementation, outcomes, stakeholder evidence, ${lesson.topics}`,
  objectives: `Analyze community health evidence and recommend an implementation decision for ${lesson.title}.`,
  assessment: `Community health evaluation memo ${index + 1}: evidence table, equity risk, and recommendation.`,
  async: 'Read a community case brief, inspect an outcome table, and prepare equity notes.',
  sync: 'Stakeholder simulation, data interpretation lab, and recommendation debrief.',
  resources: 'Community case packet; health equity checklist; logic model; implementation rubric',
  evaluation: 'Score equity reasoning, evidence traceability, implementation fit, and stakeholder communication.',
}));

export const DEFAULT_AUDIT_PROJECTS = [
  {
    id: 'research-methods',
    courseMap: makeCourseMap({
      courseName: 'Applied Social Research Methods',
      outcomes:
        'Formulate research questions, evaluate evidence quality, select methods, and communicate findings responsibly.',
      lessons: RESEARCH_METHODS_LESSONS,
    }),
    vocabulary:
      /research|question|sampling|survey|interview|validity|reliability|data|statistics|coding|qualitative|quantitative|evidence|ethics|IRB|logic model|portfolio/i,
  },
  {
    id: 'ai-course-design',
    courseMap: makeCourseMap({
      courseName: 'AI-Supported Course Design Studio',
      outcomes:
        'Design AI-supported learning workflows, evaluate output quality, protect privacy, and improve course materials.',
      lessons: AI_COURSE_DESIGN_LESSONS,
    }),
    vocabulary:
      /AI|prompt|feedback|rubric|accessibility|privacy|bias|calibration|workflow|learning|assessment|caption|integrity|analytics/i,
  },
  {
    id: 'community-health-evaluation',
    courseMap: makeCourseMap({
      courseName: 'Community Health Program Evaluation',
      outcomes:
        'Assess community needs, interpret outcome evidence, evaluate implementation, and communicate recommendations.',
      lessons: COMMUNITY_HEALTH_LESSONS,
    }),
    vocabulary:
      /community|health|equity|stakeholder|implementation|outcome|indicator|logic model|referral|screening|policy|program|evidence/i,
  },
];

export const SPARSE_ASSESSMENT_STRESS_PROJECT = {
  id: 'sparse-assessment-stress',
  stress: true,
  stressFocus: 'Sparse weekly assessments',
  courseMap: makeCourseMap({
    courseName: 'Sparse Assessment Course',
    outcomes: 'Stress-test the compiler when course maps omit some weekly assessments.',
    lessons: RESEARCH_METHODS_LESSONS.map((lesson, index) => ({
      ...lesson,
      assessment: index % 3 === 0 ? lesson.assessment : '',
    })),
  }),
  vocabulary: DEFAULT_AUDIT_PROJECTS[0].vocabulary,
};

export const MESSY_IMPORT_STRESS_PROJECT = {
  id: 'messy-import-stress',
  stress: true,
  stressFocus: 'Messy imported clinical studio map',
  courseMap: {
    courseName: 'Community Health Clinical Studio',
    semester: 'Spring 2027',
    learningOutcomes:
      'Coordinate clinical placement learning, connect field evidence to course frameworks, and communicate recommendations to community partners.',
    lessons: COMMUNITY_HEALTH_LESSONS.map((lesson, index) => ({
      title: index === 0 ? 'TBD' : index % 5 === 2 ? '' : `Clinical Block ${index + 1} / ${lesson.title}`,
      sections: [
        {
          learningGoals: index === 0 ? 'TBD' : lesson.goals,
          topicSection: index === 0 ? 'Placement orientation / community context' : `Studio seminar / ${lesson.topics}`,
          learningObjectives: index % 4 === 1 ? '' : lesson.objectives,
          weeklyAssessments: index % 5 === 3 ? 'To be determined' : lesson.assessment,
          asyncActivities: lesson.async,
          syncActivities:
            index % 6 === 4 ? 'Clinical debrief, simulation check-in, partner case conference.' : lesson.sync,
          technologyNeeded: index % 4 === 2 ? '' : 'LMS, placement log, shared drive, and video reflection tools.',
          presentationFormat: index === 1 ? 'Clinical placement huddle + studio critique + debrief.' : lesson.format,
          supportingResources:
            index % 5 === 4 ? '' : 'Placement handbook; partner brief; observation template; debrief guide',
          evaluateDesign: lesson.evaluation,
        },
        {
          learningGoals: `Field application for ${lesson.title}.`,
          topicSection: `Clinical placement / ${lesson.title}`,
          learningObjectives: `Connect field evidence from ${lesson.title} to the seminar debrief.`,
          weeklyAssessments: index % 6 === 2 ? '' : `Field note and supervisor check-in for ${lesson.title}.`,
          asyncActivities: 'Placement documentation, reflection notes, and case preparation.',
          syncActivities: 'Instructor conference, peer consult, and evidence-to-practice synthesis.',
          technologyNeeded: 'Placement log, LMS, and approved communication tools.',
          presentationFormat: 'Partner update, studio critique, and next-step planning.',
          supportingResources: 'Supervisor feedback form; case reflection template; clinical protocol notes',
          evaluateDesign: 'Check placement evidence, ethical judgment, and transfer to course outcomes.',
        },
      ],
    })),
  },
  vocabulary:
    /clinical|placement|field|community|partner|debrief|studio|simulation|supervisor|case conference|reflection|evidence/i,
};

const DEFAULT_STRESS_PROJECTS = [SPARSE_ASSESSMENT_STRESS_PROJECT, MESSY_IMPORT_STRESS_PROJECT];

function scopeCourseMap(courseMap, scope) {
  return {
    ...courseMap,
    lessons: Array.isArray(courseMap.lessons) ? courseMap.lessons.slice(0, scope) : [],
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

function globalize(regex) {
  return new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
}

function wordCount(text) {
  return (String(text || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function countFeatureItems(featureId, data) {
  if (featureId === 'syllabus') return data?.syllabus ? 1 : 0;
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
    if (Array.isArray(data?.[key])) return data[key].length;
  }
  return 0;
}

function normalizeAuditString(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function auditContentSpecificity({ data, vocabulary, findPublishabilityPlaceholders, sourceAnchors = [] }) {
  const strings = collectStrings(data);
  const blob = strings.join(' ');
  const words = Math.max(1, wordCount(blob));
  const placeholders = findPublishabilityPlaceholders(blob, { limit: 8 });
  const vocabularyMatches = blob.match(globalize(vocabulary)) || [];
  const genericMatches = blob.match(GENERIC_FILLER_RE) || [];
  const anchorSet = new Set(sourceAnchors.map(normalizeAuditString).filter(Boolean));
  const repeated = new Map();
  for (const text of strings) {
    if (text.length < 70) continue;
    const normalized = normalizeAuditString(text);
    if (!normalized) continue;
    if (anchorSet.has(normalized)) continue;
    repeated.set(normalized, (repeated.get(normalized) || 0) + 1);
  }
  const repeatedLongStrings = [...repeated.entries()].filter(([, count]) => count > 1);

  return {
    wordCount: words,
    vocabularyMatches: vocabularyMatches.length,
    genericRatio: Number((genericMatches.length / words).toFixed(4)),
    placeholders,
    repeatedLongStringCount: repeatedLongStrings.length,
  };
}

function featureAuditFindings({ featureId, validation, qualityAvg, content, itemCount, scope }) {
  const findings = [];
  validation.blockers.forEach((message) =>
    findings.push({ severity: 'blocker', featureId, message: `Validation failed: ${message}` }),
  );
  if (qualityAvg < QUALITY_FLOOR) {
    findings.push({
      severity: 'blocker',
      featureId,
      message: `Heuristic quality ${qualityAvg} is below floor ${QUALITY_FLOOR}.`,
    });
  } else if (qualityAvg < 7) {
    findings.push({ severity: 'warning', featureId, message: `Heuristic quality ${qualityAvg} is below target 7.` });
  }
  if (content.placeholders.length > 0) {
    findings.push({
      severity: 'blocker',
      featureId,
      message: `Publishability placeholder detected: ${content.placeholders.slice(0, 3).join(', ')}`,
    });
  }
  if (content.vocabularyMatches < Math.max(8, scope)) {
    findings.push({
      severity: 'warning',
      featureId,
      message: `Subject vocabulary is thin (${content.vocabularyMatches} matches).`,
    });
  }
  if (content.genericRatio > 0.065) {
    findings.push({
      severity: 'warning',
      featureId,
      message: `Generic filler ratio is high (${content.genericRatio}).`,
    });
  }
  if (PER_LESSON_COMPILED_FEATURES.has(featureId) && itemCount !== scope) {
    findings.push({
      severity: 'blocker',
      featureId,
      message: `Expected ${scope} lesson item(s), found ${itemCount}.`,
    });
  }
  return findings;
}

function summarizeReadinessFindings(readiness, source) {
  return [
    ...(readiness.blockers || []).map((issue) => ({
      severity: 'blocker',
      featureId: issue.featureId,
      message: `${source}: ${issue.label}: ${issue.message}`,
    })),
    ...(readiness.warnings || []).map((issue) => ({
      severity: 'warning',
      featureId: issue.featureId,
      message: `${source}: ${issue.label}: ${issue.message}`,
    })),
  ];
}

function summarizeGateStatus({ blockers = [], warnings = [] } = {}) {
  if ((blockers || []).length > 0) return 'blocked';
  if ((warnings || []).length > 0) return 'warnings';
  return 'pass';
}

function formatGateStatus(status) {
  return status === 'pass' ? 'pass' : status === 'warnings' ? 'warnings' : 'blocked';
}

export function auditHybridPipelineCase({ project, scope, runtime, features = PIPELINE_FEATURES }) {
  if (!runtime) throw new Error('auditHybridPipelineCase requires a loaded audit runtime.');
  const rawCourseMap = scopeCourseMap(project.courseMap, scope);
  const courseMapRepair = runtime.repairCourseMapReadiness({
    courseMap: rawCourseMap,
    columns: DEFAULT_COLUMNS,
  });
  const courseMap = courseMapRepair.courseMap || rawCourseMap;
  const lessonCount = courseMap.lessons.length;
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(features);
  const modelFeatures = features.filter((featureId) => !compiledFeatures.includes(featureId));
  const baselinePlan = runtime.buildApiCostPlan({
    featureIds: features,
    lessonCount,
    includeRepairRetryReserve: false,
  });
  const hybridPlan = runtime.buildApiCostPlan({
    featureIds: modelFeatures,
    lessonCount,
    includeRepairRetryReserve: false,
  });
  const modelFeatureCalls = Object.fromEntries(
    modelFeatures.map((featureId) => [
      featureId,
      runtime.buildApiCostPlan({
        featureIds: [featureId],
        lessonCount,
        includeRepairRetryReserve: false,
      }).deliverableChunkCalls,
    ]),
  );
  const savedCalls = runtime.estimateBlueprintCompilerSavings(compiledFeatures, lessonCount);
  const blueprint = runtime.buildCourseBlueprint(courseMap);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, {
    configMap: { courseFaq: { questionsPerLesson: 5 } },
  });
  const deliverables = Object.fromEntries(
    Object.entries(compiled).map(([featureId, data]) => [featureId, { status: 'done', data }]),
  );
  const sourceAnchors = collectStrings(courseMap);
  const featureAudits = compiledFeatures.map((featureId) => {
    const data = compiled[featureId];
    const validation = runtime.validateDeliverableGeneration(featureId, data, {
      expectedLessonCount: lessonCount,
      config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
    });
    const quality = runtime.scoreHeuristic(featureId, data);
    const qualityAvg = runtime.computeAvgScore(quality);
    const content = auditContentSpecificity({
      data,
      vocabulary: project.vocabulary,
      findPublishabilityPlaceholders: runtime.findPublishabilityPlaceholders,
      sourceAnchors,
    });
    const itemCount = countFeatureItems(featureId, data);
    const findings = featureAuditFindings({
      featureId,
      validation,
      qualityAvg,
      content,
      itemCount,
      scope: lessonCount,
    });
    return {
      featureId,
      label: FEATURE_LABELS[featureId] || featureId,
      source: 'blueprintCompiler',
      itemCount,
      validation,
      quality,
      qualityAvg,
      content,
      findings,
    };
  });
  const selectedFeatures = ['courseMap', ...compiledFeatures];
  const workspaceReadiness = runtime.evaluateWorkspaceReadiness({
    courseMap,
    deliverables,
    selectedFeatures,
    columns: DEFAULT_COLUMNS,
  });
  const classroomReadiness = runtime.evaluateClassroomReadiness({
    courseMap,
    deliverables,
    selectedFeatures,
  });
  const findings = [
    ...featureAudits.flatMap((audit) => audit.findings),
    ...summarizeReadinessFindings(workspaceReadiness, 'workspace readiness'),
    ...summarizeReadinessFindings(classroomReadiness, 'classroom readiness'),
  ];
  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const qualityValues = featureAudits.map((audit) => audit.qualityAvg).filter((score) => Number.isFinite(score));
  const validationStatus = featureAudits.some((audit) => audit.validation.blockers.length > 0) ? 'blocked' : 'pass';
  const qualityFloorStatus = qualityValues.some((score) => score < QUALITY_FLOOR)
    ? 'blocked'
    : qualityValues.some((score) => score < 7)
      ? 'warnings'
      : 'pass';
  const workspaceStatus = summarizeGateStatus(workspaceReadiness);
  const classroomStatus = summarizeGateStatus(classroomReadiness);
  const reviewRecommendation = buildHumanReviewRecommendation({
    blockerCount,
    warningCount,
    repaired: Boolean(courseMapRepair.changed),
    repairScope: 'repaired course-map fields',
  });
  const repairEvidence = summarizeRepairEvidence(courseMapRepair.repairedFields);

  return {
    projectId: project.id,
    stress: Boolean(project.stress),
    stressFocus: project.stressFocus || null,
    courseName: courseMap.courseName,
    scope: lessonCount,
    courseMapRepair: {
      changed: Boolean(courseMapRepair.changed),
      repairedFieldCount: courseMapRepair.repairedFields?.length || 0,
      repairedFields: courseMapRepair.repairedFields || [],
    },
    compiledFeatures,
    modelFeatures,
    modelFeatureCalls,
    cost: {
      baselineDeliverableCalls: baselinePlan.deliverableChunkCalls,
      hybridDeliverableCalls: hybridPlan.deliverableChunkCalls,
      savedCalls,
      savedPercent:
        baselinePlan.deliverableChunkCalls > 0
          ? Number(((savedCalls / baselinePlan.deliverableChunkCalls) * 100).toFixed(1))
          : 0,
    },
    featureAudits,
    workspaceReadiness: {
      status: workspaceReadiness.status,
      blockers: workspaceReadiness.blockers,
      warnings: workspaceReadiness.warnings,
    },
    classroomReadiness: {
      status: classroomReadiness.status,
      blockers: classroomReadiness.blockers,
      warnings: classroomReadiness.warnings,
    },
    qualityGates: {
      validators: validationStatus,
      qualityFloor: qualityFloorStatus,
      workspaceReadiness: workspaceStatus,
      classroomReadiness: classroomStatus,
    },
    trustEvidence: {
      deliveryPath: `${compiledFeatures.length} compiled / ${modelFeatures.length} model-generated`,
      repairSummary: repairEvidence,
      reviewRecommendation,
    },
    reviewRecommendation,
    findings,
    summary: {
      status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'pass',
      blockerCount,
      warningCount,
      minQuality: qualityValues.length ? Math.min(...qualityValues) : null,
      avgQuality: qualityValues.length
        ? Number((qualityValues.reduce((sum, score) => sum + score, 0) / qualityValues.length).toFixed(2))
        : null,
    },
  };
}

function rankRemainingModelWork(results) {
  const totals = new Map();
  for (const result of results.filter((item) => !item.stress)) {
    for (const [featureId, calls] of Object.entries(result.modelFeatureCalls || {})) {
      totals.set(featureId, (totals.get(featureId) || 0) + calls);
    }
  }
  return [...totals.entries()]
    .map(([featureId, calls]) => ({ featureId, label: FEATURE_LABELS[featureId] || featureId, calls }))
    .sort((a, b) => b.calls - a.calls || a.label.localeCompare(b.label));
}

export function inferHybridPipelineNextActions(results) {
  const releaseResults = results.filter((result) => !result.stress);
  const stressResults = results.filter((result) => result.stress);
  const blockers = releaseResults.flatMap((result) =>
    result.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => ({ ...finding, projectId: result.projectId, scope: result.scope })),
  );
  const warnings = releaseResults.flatMap((result) =>
    result.findings
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => ({ ...finding, projectId: result.projectId, scope: result.scope })),
  );
  const modelWork = rankRemainingModelWork(results);
  const stressBlockers = stressResults.flatMap((result) =>
    result.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => ({ ...finding, projectId: result.projectId, scope: result.scope })),
  );
  const stressWarnings = stressResults.flatMap((result) =>
    result.findings
      .filter((finding) => finding.severity === 'warning')
      .map((finding) => ({ ...finding, projectId: result.projectId, scope: result.scope })),
  );
  const actions = [];

  if (blockers.length > 0) {
    actions.push({
      priority: 'P0',
      title: 'Fix compiler release blockers before expanding the pipeline',
      reason: blockers
        .slice(0, 3)
        .map((finding) => `${finding.projectId}/${finding.scope}: ${finding.message}`)
        .join(' | '),
    });
  } else {
    actions.push({
      priority: 'P0',
      title: 'Keep audit:pipeline as the required v0.8 regression gate',
      reason:
        'Compiled deliverables passed validators, readiness, classroom checks, and quality floors across release fixtures.',
    });
  }

  if (modelWork.length > 0) {
    const top = modelWork[0];
    actions.push({
      priority: 'P1',
      title: `Prototype atom generation for ${top.label}`,
      reason: `${top.label} is the largest remaining model-call pool in the audited hybrid path (${top.calls} chunk call units across release fixtures).`,
    });
  }
  if (modelWork.length > 1) {
    const next = modelWork[1];
    actions.push({
      priority: 'P1',
      title: `Design compact intermediate representation for ${next.label}`,
      reason: `${next.label} is the second-largest remaining model-call pool (${next.calls} chunk call units).`,
    });
  }
  if (warnings.length > 0) {
    actions.push({
      priority: 'P2',
      title: 'Add a model-enriched blueprint pass for subject-specific phrasing',
      reason: warnings
        .slice(0, 3)
        .map((finding) => `${finding.projectId}/${finding.featureId}: ${finding.message}`)
        .join(' | '),
    });
  }
  if (stressBlockers.length > 0) {
    actions.push({
      priority: 'P2',
      title: 'Add sparse-assessment fallback rules before compiling assignments and rubrics',
      reason: stressBlockers
        .slice(0, 3)
        .map((finding) => `${finding.projectId}/${finding.scope}: ${finding.message}`)
        .join(' | '),
    });
  }
  if (stressWarnings.length > 0) {
    actions.push({
      priority: 'P2',
      title: 'Tighten compiled deliverables for messy-import stress cases',
      reason: stressWarnings
        .slice(0, 3)
        .map((finding) => `${finding.projectId}/${finding.featureId}: ${finding.message}`)
        .join(' | '),
    });
  }

  return actions;
}

function summarizeResults(results) {
  const releaseResults = results.filter((result) => !result.stress);
  const blockers = releaseResults.reduce((sum, result) => sum + result.summary.blockerCount, 0);
  const warnings = releaseResults.reduce((sum, result) => sum + result.summary.warningCount, 0);
  const savedCalls = releaseResults.reduce((sum, result) => sum + result.cost.savedCalls, 0);
  const baselineCalls = releaseResults.reduce((sum, result) => sum + result.cost.baselineDeliverableCalls, 0);
  const hybridCalls = releaseResults.reduce((sum, result) => sum + result.cost.hybridDeliverableCalls, 0);
  const sparseRepairFields = results.reduce(
    (sum, result) => sum + (result.courseMapRepair?.repairedFieldCount || 0),
    0,
  );
  const compiledFeatureCount = releaseResults.reduce((sum, result) => sum + (result.compiledFeatures?.length || 0), 0);
  const modelFeatureCount = releaseResults.reduce((sum, result) => sum + (result.modelFeatures?.length || 0), 0);
  const minQuality = Math.min(...releaseResults.map((result) => result.summary.minQuality).filter(Number.isFinite));
  return {
    status: blockers > 0 ? 'blocked' : 'pass',
    releaseCaseCount: releaseResults.length,
    stressCaseCount: results.length - releaseResults.length,
    blockers,
    warnings,
    baselineCalls,
    hybridCalls,
    savedCalls,
    savedPercent: baselineCalls > 0 ? Number(((savedCalls / baselineCalls) * 100).toFixed(1)) : 0,
    sparseRepairFields,
    compiledFeatureCount,
    modelFeatureCount,
    minQuality: Number.isFinite(minQuality) ? minQuality : null,
  };
}

export async function buildHybridPipelineAudit(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const scopes = Array.isArray(options.scopes) && options.scopes.length > 0 ? options.scopes : DEFAULT_SCOPES;
  const projects =
    Array.isArray(options.projects) && options.projects.length > 0 ? options.projects : DEFAULT_AUDIT_PROJECTS;
  const includeStress = options.includeStress !== false;
  const auditProjects = includeStress ? [...projects, ...DEFAULT_STRESS_PROJECTS] : projects;
  const results = auditProjects.flatMap((project) =>
    scopes.map((scope) =>
      auditHybridPipelineCase({
        project,
        scope: Math.min(scope, project.courseMap.lessons.length),
        runtime,
        features: options.features || PIPELINE_FEATURES,
      }),
    ),
  );
  const summary = summarizeResults(results);
  const nextActions = inferHybridPipelineNextActions(results);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      scopes,
      releaseProjects: projects.map((project) => project.id),
      includeStress,
      qualityFloor: QUALITY_FLOOR,
      compiledFeatures: runtime.getBlueprintCompiledFeatures(PIPELINE_FEATURES),
    },
    summary,
    nextActions,
    results,
  };
}

function markdownTable(rows) {
  return rows.join('\n');
}

export function renderHybridPipelineAuditMarkdown(payload) {
  const sourceRows = payload.results
    .filter((result) => !result.stress)
    .map(
      (result) =>
        `| ${result.projectId} | ${result.scope} | ${result.compiledFeatures.join(', ')} | ${result.modelFeatures.join(', ')} |`,
    );
  const trustRows = payload.results
    .filter((result) => !result.stress)
    .map(
      (result) =>
        `| ${result.projectId} | ${result.scope} | ${result.courseMapRepair?.repairedFieldCount || 0} | ${result.trustEvidence?.repairSummary || 'none'} | ${result.trustEvidence?.deliveryPath || `${result.compiledFeatures.length} compiled / ${result.modelFeatures.length} model-generated`} | ${result.reviewRecommendation} |`,
    );
  const qualityGateRows = payload.results
    .filter((result) => !result.stress)
    .map(
      (result) =>
        `| ${result.projectId} | ${result.scope} | ${formatGateStatus(result.qualityGates.validators)} | ${formatGateStatus(result.qualityGates.qualityFloor)} | ${formatGateStatus(result.qualityGates.workspaceReadiness)} | ${formatGateStatus(result.qualityGates.classroomReadiness)} | ${result.reviewRecommendation} |`,
    );
  const stressRows = payload.results
    .filter((result) => result.stress)
    .map(
      (result) =>
        `| ${result.projectId} | ${result.scope} | ${result.summary.status} | ${result.courseMapRepair?.repairedFieldCount || 0} | ${result.stressFocus || 'Stress coverage'} | ${result.reviewRecommendation} |`,
    );
  const lines = [
    '# CourseMapper Hybrid Pipeline Audit',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    '',
    '## Summary',
    '',
    `Status: ${payload.summary.status}`,
    `Release cases: ${payload.summary.releaseCaseCount}`,
    `Stress cases: ${payload.summary.stressCaseCount}`,
    `Cost comparison: ${payload.summary.baselineCalls} baseline calls -> ${payload.summary.hybridCalls} hybrid calls (${payload.summary.savedCalls} saved, ${payload.summary.savedPercent}%)`,
    `Feature sources: ${payload.summary.compiledFeatureCount} compiled feature entries, ${payload.summary.modelFeatureCount} model-generated feature entries across release cases`,
    `Minimum compiled quality score: ${payload.summary.minQuality}`,
    `Sparse course-map fields repaired before compile: ${payload.summary.sparseRepairFields}`,
    `Release blockers: ${payload.summary.blockers}`,
    `Release warnings: ${payload.summary.warnings}`,
    '',
    '## Release Case Matrix',
    '',
    markdownTable([
      '| Project | Scope | Status | Saved Calls | Min Quality | Warnings |',
      '| --- | ---: | --- | ---: | ---: | ---: |',
      ...payload.results
        .filter((result) => !result.stress)
        .map(
          (result) =>
            `| ${result.projectId} | ${result.scope} | ${result.summary.status} | ${result.cost.savedCalls}/${result.cost.baselineDeliverableCalls} | ${result.summary.minQuality} | ${result.summary.warningCount} |`,
        ),
    ]),
    '',
    '## Feature Source Matrix',
    '',
    markdownTable([
      '| Project | Scope | Compiled Features | Model-Generated Features |',
      '| --- | ---: | --- | --- |',
      ...sourceRows,
    ]),
    '',
    '## Trust Evidence Matrix',
    '',
    markdownTable([
      '| Project | Scope | Repaired Course-Map Fields | Repair Evidence | Delivery Path | Human Review Recommendation |',
      '| --- | ---: | ---: | --- | --- | --- |',
      ...trustRows,
    ]),
    '',
    '## Quality Gate Matrix',
    '',
    markdownTable([
      '| Project | Scope | Validators | Quality Floor | Workspace Readiness | Classroom Readiness | Human Review Recommendation |',
      '| --- | ---: | --- | --- | --- | --- | --- |',
      ...qualityGateRows,
    ]),
    '',
    '## Stress Case Matrix',
    '',
    markdownTable([
      '| Project | Scope | Status | Repaired Fields | Focus | Human Review Recommendation |',
      '| --- | ---: | --- | ---: | --- | --- |',
      ...stressRows,
    ]),
    '',
    '## Next Actions',
    '',
    ...payload.nextActions.map((action) => `- ${action.priority}: ${action.title}. ${action.reason}`),
    '',
    '## Stress Findings',
    '',
  ];

  const stressFindings = payload.results
    .filter((result) => result.stress)
    .flatMap((result) =>
      result.findings.map(
        (finding) => `- ${result.projectId}/${result.scope}/${finding.featureId}: ${finding.message}`,
      ),
    );
  if (stressFindings.length > 0) lines.push(...stressFindings);
  else lines.push('- No stress findings.');

  return `${lines.join('\n')}\n`;
}

export async function writeHybridPipelineAudit(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderHybridPipelineAuditMarkdown(payload));
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    includeStress: true,
    scopes: DEFAULT_SCOPES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
    else if (arg === '--no-stress') args.includeStress = false;
    else if (arg === '--scopes') {
      args.scopes = String(argv[++i] || '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildHybridPipelineAudit({ scopes: args.scopes, includeStress: args.includeStress });
    const paths = await writeHybridPipelineAudit(payload, args.outputDir);
    console.log(`Hybrid pipeline audit: ${payload.summary.status}`);
    console.log(
      `Cost: ${payload.summary.baselineCalls} baseline calls -> ${payload.summary.hybridCalls} hybrid calls (${payload.summary.savedCalls} saved, ${payload.summary.savedPercent}%).`,
    );
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
