import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCompilerProofBundle,
  buildSlideDeckIntermediateRepresentation,
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  estimateBlueprintCompilerSavings,
  getBlueprintCompiledFeatures,
  hydrateBlueprintForCompilation,
  validateBlueprintSemanticContract,
  validateCourseBlueprintContract,
  validateCompilerOutputContract,
} from '../courseBlueprintCompiler';
import { evaluateClassroomReadiness } from '../classroomReadiness';
import { validateDeliverableGeneration } from '../deliverablePostProcess';
import { deliverableToCsvRows } from '../exporters/csvExporter';
import { buildInstructorPreferenceProfile } from '../instructorPreferenceProfile';
import { findPromptArtifactContamination } from '../quality/artifactDefectPatterns';
import { validateSemanticContentQuality } from '../pedagogicalValidator';
import { computeTexture } from '../quality/textureMetric';
import { DEFAULT_AUDIT_PROJECTS, MESSY_IMPORT_STRESS_PROJECT } from '../../../scripts/hybridPipelineAudit.mjs';

let customDeliverables = {};

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => customDeliverables[id] || null),
}));

const makeCourseMap = (lessonCount = 6) => ({
  courseName: 'Applied Social Policy Studio',
  semester: 'Fall 2026',
  lessons: Array.from({ length: lessonCount }, (_, index) => ({
    title: `Lesson ${index + 1}: Policy Topic ${index + 1}`,
    sections: [
      {
        topicSection: `Policy Topic ${index + 1}; implementation context ${index + 1}`,
        learningObjectives: `Analyze policy evidence ${index + 1}; Evaluate implementation tradeoffs ${index + 1}`,
        learningGoals: `Connect policy design to client outcomes ${index + 1}`,
        weeklyAssessments: `Policy memo checkpoint ${index + 1}`,
        asyncActivities: `Read case packet ${index + 1}; annotate evidence`,
        syncActivities: `Small-group policy lab ${index + 1}; instructor debrief`,
        supportingResources: `Case packet ${index + 1}; data brief ${index + 1}`,
        evaluateDesign: `Score memo evidence and decision logic ${index + 1}`,
      },
    ],
  })),
});

const countWords = (value) => (String(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;

const makeBiologyLabCourseMap = () => ({
  courseName: 'Biology Laboratory Methods',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use lab safety, variable control, notebook evidence, data tables, and protocol troubleshooting to produce defensible lab conclusions.',
  lessons: [
    {
      title: 'Lesson 1: Measurement, Pipetting, and Uncertainty',
      sections: [
        {
          topicSection: 'Pipetting, measurement precision, replicate data, uncertainty, data table',
          learningObjectives: 'Analyze replicate measurements and evaluate measurement uncertainty.',
          learningGoals: 'Connect pipetting technique to reliable lab evidence.',
          weeklyAssessments:
            'Pipetting accuracy data log with replicate table, uncertainty note, and measurement decision.',
          asyncActivities: 'Review pipetting demo clips and identify measurement behaviors that increase uncertainty.',
          syncActivities:
            'Pipetting practice lab with replicate measurement checks and peer verification of data tables.',
          supportingResources: 'Pipette guide; uncertainty worksheet; replicate data table template',
          evaluateDesign:
            'Score technique accuracy, replicate recording, uncertainty explanation, and correction plan.',
        },
      ],
    },
    {
      title: 'Lesson 2: Contamination Troubleshooting and Protocol Revision',
      sections: [
        {
          topicSection: 'Contamination, aseptic technique, protocol deviation, troubleshooting, revision plan',
          learningObjectives: 'Evaluate contamination evidence and create a protocol revision for the next run.',
          learningGoals: 'Use wet-lab evidence to revise protocols safely.',
          weeklyAssessments:
            'Contamination troubleshooting log with aseptic-technique evidence, protocol deviation, and revision decision.',
          asyncActivities: 'Review contamination case notes and identify possible protocol deviations.',
          syncActivities:
            'Troubleshooting roundtable with evidence sorting, protocol revision, and next-run safety check.',
          supportingResources: 'Aseptic technique guide; contamination case notes; protocol revision template',
          evaluateDesign:
            'Assess evidence diagnosis, protocol revision specificity, safety reasoning, and next-run plan.',
        },
      ],
    },
  ],
});

const makeWorldLanguageCourseMap = () => ({
  courseName: 'Beginning Spanish Communicative Practice',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use target-language vocabulary, grammar, pronunciation, listening comprehension, and cultural comparison to complete interpersonal and presentational proficiency tasks.',
  lessons: [
    {
      title: 'Lesson 1: Greetings, Introductions, and Courtesy',
      sections: [
        {
          topicSection: 'Spanish greetings, introductions, courtesy phrases, pronunciation, interpersonal conversation',
          learningObjectives: 'Perform a short target-language dialogue and interpret basic greetings in context.',
          learningGoals: 'Students build confidence using comprehensible Spanish for interpersonal exchange.',
          weeklyAssessments:
            'Interpersonal dialogue recording with target-language utterances, pronunciation focus, cultural courtesy choice, and revised script.',
          asyncActivities: 'Listen to model greetings and mark vocabulary, pronunciation, and cultural-formality cues.',
          syncActivities:
            'Paired conversation rehearsal with feedback recasts, pronunciation practice, and revised target-language exchange.',
          supportingResources: 'Greeting audio; pronunciation guide; cultural formality notes; dialogue model',
          evaluateDesign:
            'Score comprehensibility, vocabulary accuracy, pronunciation, cultural fit, and revision after feedback.',
        },
      ],
    },
    {
      title: 'Lesson 2: Family Descriptions and Personal Details',
      sections: [
        {
          topicSection:
            'Family vocabulary, adjective agreement, listening comprehension, presentational speaking, cultural comparison',
          learningObjectives:
            'Describe family members using accurate adjectives and interpret a short listening sample.',
          learningGoals: 'Students connect grammar choices to meaning in a presentational description.',
          weeklyAssessments:
            'Presentational speaking script with family vocabulary, adjective agreement evidence, cultural comparison, and feedback revision.',
          asyncActivities:
            'Complete listening comprehension notes and annotate adjective agreement in a model description.',
          syncActivities:
            'Small-group speaking lab with language pattern noticing, recasts, and revised presentational performance.',
          supportingResources: 'Family vocabulary list; adjective agreement chart; listening sample',
          evaluateDesign:
            'Score meaning, grammar accuracy, comprehensibility, cultural comparison, and revision quality.',
        },
      ],
    },
    {
      title: 'Lesson 3: Food Ordering and Preferences',
      sections: [
        {
          topicSection:
            'Food vocabulary, preferences, quantities, polite requests, restaurant dialogue, cultural comparison',
          learningObjectives: 'Conduct a short food-ordering dialogue with clear preferences and quantities.',
          learningGoals: 'Students use Spanish for a realistic service exchange.',
          weeklyAssessments:
            'Restaurant dialogue performance with preference statement, quantity clarity, politeness choice, and revised script.',
          asyncActivities: 'Listen to menu-ordering examples and mark preference phrases and quantity words.',
          syncActivities: 'Restaurant role-play stations with focused recasts and peer comprehensibility checks.',
          supportingResources: 'Menu vocabulary; service-dialogue audio; politeness checklist',
          evaluateDesign:
            'Score comprehensibility, vocabulary range, quantity accuracy, cultural politeness, and revision.',
        },
      ],
    },
    {
      title: 'Lesson 4: Final Integrated Proficiency Performance',
      sections: [
        {
          topicSection:
            'Integrated proficiency task, listening comprehension, interpersonal exchange, presentation, reflection',
          learningObjectives:
            'Complete a novice-level integrated Spanish performance and explain one feedback-based language revision.',
          learningGoals: 'Students integrate listening, speaking, grammar, and culture in a final task.',
          weeklyAssessments:
            'Final proficiency portfolio with listening response, interpersonal dialogue, presentational script, cultural comparison, and revised target-language sample.',
          asyncActivities: 'Review earlier recordings and select one recurring language choice to improve.',
          syncActivities: 'Final proficiency performance with peer audience, feedback recast, and revision reflection.',
          supportingResources: 'Final proficiency rubric; portfolio checklist; cultural comparison prompt',
          evaluateDesign:
            'Assess comprehensibility, language accuracy, communicative function, cultural fit, and revision evidence.',
        },
      ],
    },
  ],
});

const makePerformingArtsCourseMap = () => ({
  courseName: 'Acting Studio and Performance Practice',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use rehearsal notes, vocal and movement technique, ensemble cues, scene analysis, critique uptake, and performance recordings to revise observable performance choices.',
  lessons: [
    {
      title: 'Lesson 1: Voice, Body, and Neutral Readiness',
      sections: [
        {
          topicSection: 'Vocal warm-up, physical readiness, neutral stance, breath support, rehearsal note',
          learningObjectives:
            'Perform a warm-up sequence and explain how breath, alignment, and focus change readiness.',
          learningGoals: 'Students prepare the body and voice for safe performance rehearsal.',
          weeklyAssessments:
            'Warm-up performance recording with vocal evidence, movement readiness note, critique uptake, and revised run-through.',
          asyncActivities: 'Review warm-up demonstrations and annotate one technique cue before class.',
          syncActivities:
            'Studio rehearsal with breath support modeling, peer observation notes, and revised warm-up run.',
          supportingResources: 'Vocal warm-up guide; movement safety notes; rehearsal journal template',
          evaluateDesign:
            'Score technique accuracy, readiness evidence, critique uptake, and revised performance choice.',
        },
      ],
    },
    {
      title: 'Lesson 2: Monologue Beats and Given Circumstances',
      sections: [
        {
          topicSection: 'Monologue, beats, objective, given circumstances, director note, performance critique',
          learningObjectives: 'Break a monologue into beats and revise one performance choice from director notes.',
          learningGoals: 'Students connect script evidence to observable monologue choices.',
          weeklyAssessments:
            'Monologue run-through with beat map, director note, revised performance choice, and reflection cue.',
          asyncActivities: 'Annotate the monologue for beats, objective shifts, and given circumstances.',
          syncActivities: 'Scene-study rehearsal with director notes, peer critique, and second run-through.',
          supportingResources: 'Monologue text; beat-map model; director-note checklist',
          evaluateDesign: 'Assess beat clarity, performance evidence, note uptake, and revised interpretive choice.',
        },
      ],
    },
    {
      title: 'Lesson 3: Partner Scene Listening and Ensemble Cues',
      sections: [
        {
          topicSection: 'Partner scene, listening cue, blocking, ensemble timing, stage picture',
          learningObjectives: 'Use partner listening and blocking choices to improve ensemble scene timing.',
          learningGoals: 'Students make performance choices responsive to the ensemble.',
          weeklyAssessments:
            'Partner scene recording with blocking note, ensemble cue evidence, critique uptake, and revised run.',
          asyncActivities: 'Watch a model scene and identify listening cues that change timing.',
          syncActivities: 'Partner rehearsal with blocking adjustments, ensemble cue checks, and performance run.',
          supportingResources: 'Scene excerpt; blocking map; ensemble timing checklist',
          evaluateDesign:
            'Score listening response, blocking clarity, ensemble awareness, and revised performance evidence.',
        },
      ],
    },
    {
      title: 'Lesson 4: Final Performance Run and Reflection',
      sections: [
        {
          topicSection: 'Final performance, run-through, rehearsal journal, audition note, next rehearsal cue',
          learningObjectives:
            'Perform a revised scene or monologue and justify the final rehearsal decision with evidence.',
          learningGoals: 'Students integrate technique, critique, and reflection into performance readiness.',
          weeklyAssessments:
            'Final performance portfolio with recording, rehearsal journal, critique-response note, and next rehearsal cue.',
          asyncActivities: 'Review rehearsal journal entries and select one recurring performance note.',
          syncActivities: 'Final studio run-through with audience response, director note, and reflection debrief.',
          supportingResources: 'Final performance rubric; rehearsal journal guide; audition reflection prompt',
          evaluateDesign:
            'Assess technique, artistic intention, performance presence, critique uptake, and next rehearsal plan.',
        },
      ],
    },
  ],
});

const makeProgrammingLabCourseMap = () => ({
  courseName: 'Software Engineering Code Lab',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use source code, repository commits, unit tests, debugging traces, edge-case checks, and code review notes to justify implementation decisions.',
  lessons: [
    {
      title: 'Lesson 1: Repository Setup and First Tests',
      sections: [
        {
          topicSection: 'Git repository, starter code, command line, unit test, failing test, commit note',
          learningObjectives: 'Run the starter test suite and explain what a failing test reveals about the code.',
          learningGoals: 'Students connect development environment setup to inspectable code evidence.',
          weeklyAssessments:
            'Repository commit with setup check, failing unit test, implementation note, and corrected test run.',
          asyncActivities: 'Install the toolchain, clone the repository, and record one setup issue or test result.',
          syncActivities:
            'Live coding lab with test harness setup, pair debugging, and first repository commit review.',
          supportingResources: 'Repository README; unit test guide; commit message checklist',
          evaluateDesign:
            'Score setup reliability, test evidence, debugging note, and clarity of the implementation rationale.',
        },
      ],
    },
    {
      title: 'Lesson 2: Functions, Edge Cases, and Refactoring',
      sections: [
        {
          topicSection: 'Function implementation, edge case, automated test, code review, refactor',
          learningObjectives: 'Implement a function and revise it after edge-case tests and code review.',
          learningGoals: 'Students use tests and peer review to improve implementation decisions.',
          weeklyAssessments:
            'Function implementation pull request with passing tests, edge-case check, code review note, and refactor commit.',
          asyncActivities: 'Read the function specification and predict two edge cases before coding.',
          syncActivities:
            'Pair programming with live test runs, debugging trace capture, peer code review, and refactor handoff.',
          supportingResources: 'Function specification; edge-case checklist; code review rubric',
          evaluateDesign: 'Assess correctness, test coverage, readability, edge-case reasoning, and refactor quality.',
        },
      ],
    },
    {
      title: 'Lesson 3: Debugging Trace and Failure Diagnosis',
      sections: [
        {
          topicSection: 'Debugging trace, failing output, breakpoint, hypothesis, root cause, passing test',
          learningObjectives: 'Use a debugging trace to identify a root cause and verify the fix with tests.',
          learningGoals: 'Students diagnose failing behavior before changing code.',
          weeklyAssessments:
            'Debugging log with failing output, hypothesis, code fix, passing test result, and root-cause note.',
          asyncActivities: 'Review a failing test transcript and write one debugging hypothesis.',
          syncActivities:
            'Debugging lab with trace inspection, breakpoint walkthrough, fix comparison, and passing test check.',
          supportingResources: 'Debugging trace template; failing-test sample; root-cause checklist',
          evaluateDesign: 'Score diagnosis quality, trace evidence, code fix fit, and verification with tests.',
        },
      ],
    },
    {
      title: 'Lesson 4: Final Feature Pull Request',
      sections: [
        {
          topicSection:
            'Feature issue, pull request, acceptance criteria, test suite, code review, implementation risk',
          learningObjectives: 'Build a small feature and prepare it for pull-request review with test evidence.',
          learningGoals: 'Students connect issue requirements, implementation, tests, and review notes.',
          weeklyAssessments:
            'Feature pull request with issue link, implementation diff, test suite result, code review response, and risk note.',
          asyncActivities: 'Break the feature issue into implementation tasks and test expectations.',
          syncActivities:
            'Feature sprint with pair implementation, test suite run, pull-request walkthrough, and review response.',
          supportingResources: 'Feature issue template; pull-request checklist; test suite report sample',
          evaluateDesign:
            'Assess requirement fit, implementation quality, test evidence, review response, and risk clarity.',
        },
      ],
    },
  ],
});

const makeDataScienceLabCourseMap = () => ({
  courseName: 'Data Science Analytics Lab',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use dataset provenance, data cleaning, notebook analysis, visualization, model validation, bias checks, and data stories to justify analytic decisions.',
  lessons: [
    {
      title: 'Lesson 1: Dataset Provenance and Cleaning',
      sections: [
        {
          topicSection: 'Dataset provenance, CSV import, missingness, data cleaning, reproducible notebook',
          learningObjectives: 'Inspect dataset provenance and clean missing values before making a claim.',
          learningGoals: 'Students connect data quality to defensible analytics evidence.',
          weeklyAssessments:
            'Analytics notebook with dataset provenance, data-cleaning log, missingness check, and revised analytic question.',
          asyncActivities: 'Review the data dictionary and mark two variables with quality concerns.',
          syncActivities:
            'Notebook lab with CSV import, data cleaning, missingness audit, peer check, and revised question.',
          supportingResources: 'Dataset dictionary; cleaning checklist; reproducible notebook template',
          evaluateDesign:
            'Score provenance evidence, cleaning rationale, missingness handling, and analytic question fit.',
        },
      ],
    },
    {
      title: 'Lesson 2: Exploratory Visualization and Data Story',
      sections: [
        {
          topicSection: 'Exploratory data analysis, visualization, dashboard, trend comparison, data story',
          learningObjectives: 'Create a visualization and explain what the data can and cannot support.',
          learningGoals: 'Students use exploratory visualization to make bounded analytic claims.',
          weeklyAssessments:
            'Data visualization notebook with chart choice, dashboard screenshot, interpretation, and limitation note.',
          asyncActivities: 'Sketch two chart options and predict which comparison each can support.',
          syncActivities:
            'Visualization critique with notebook output review, dashboard comparison, and revised interpretation.',
          supportingResources: 'Visualization guide; dashboard example; data story checklist',
          evaluateDesign: 'Assess chart fit, interpretation accuracy, limitation language, and data-story clarity.',
        },
      ],
    },
    {
      title: 'Lesson 3: Model Validation and Metrics',
      sections: [
        {
          topicSection: 'Predictive model, train-test split, validation metric, confusion matrix, feature evidence',
          learningObjectives: 'Validate a simple predictive model and interpret one metric correctly.',
          learningGoals: 'Students connect model evidence to an analytic decision without overclaiming.',
          weeklyAssessments:
            'Model evaluation notebook with train-test split, validation metric, confusion matrix, and analytic decision.',
          asyncActivities: 'Read the model specification and identify one metric that matches the decision context.',
          syncActivities:
            'Model validation lab with metric comparison, confusion-matrix interpretation, peer challenge, and revised claim.',
          supportingResources: 'Validation metric guide; confusion matrix example; model evaluation checklist',
          evaluateDesign: 'Score validation design, metric interpretation, model limitation, and decision fit.',
        },
      ],
    },
    {
      title: 'Lesson 4: Bias Audit and Final Insight Handoff',
      sections: [
        {
          topicSection: 'Bias audit, fairness check, subgroup comparison, model card, final data story',
          learningObjectives: 'Audit an analytics result for bias risk and revise the recommendation.',
          learningGoals: 'Students make analytic decisions transparent enough for local review.',
          weeklyAssessments:
            'Final data story with bias audit, fairness check, model card note, validation evidence, and revised recommendation.',
          asyncActivities: 'Review subgroup output and write one fairness or bias risk question.',
          syncActivities:
            'Analytics review clinic with bias audit, validation check, model-card handoff, and revised recommendation.',
          supportingResources: 'Bias audit checklist; model card template; final data story rubric',
          evaluateDesign:
            'Assess fairness reasoning, validation evidence, limitation transparency, and recommendation quality.',
        },
      ],
    },
  ],
});

const makeAppliedMachineLearningCourseMap = () => ({
  courseName: 'Applied Machine Learning',
  semester: 'Fall 2026',
  learningOutcomes:
    'Build notebook-based applied machine learning workflows with datasets, train-test validation, model-performance evidence, threshold tradeoffs, fairness checks, quizzes, study guides, and a final model card.',
  lessons: [
    {
      title: 'Lesson 1: Foundations of Applied Machine Learning',
      sections: [
        {
          topicSection: 'Applied machine learning workflow, supervised learning, dataset, features, target variable',
          learningObjectives:
            'Explain how a notebook workflow connects data, features, target labels, and model decisions.',
          learningGoals: 'Students connect machine learning concepts to a reproducible dataset workflow.',
          weeklyAssessments:
            'Concept check quiz and starter notebook annotation identifying dataset fields, target variable, and model-use risk.',
          asyncActivities: 'Read the dataset card and mark one likely data-quality limitation.',
          syncActivities:
            'Notebook lab with dataset inspection, feature/target identification, and peer explanation of model-use risk.',
          supportingResources: 'Starter notebook; course dataset; dataset card; study guide',
          evaluateDesign: 'Score data-quality evidence, feature/target clarity, and model-use limitation.',
        },
      ],
    },
    {
      title: 'Lesson 2: Model Validation and Train-Test Evidence',
      sections: [
        {
          topicSection:
            'Train-test split, validation metric, baseline model, overfitting, reproducible notebook evidence',
          learningObjectives: 'Use train-test evidence to decide whether a baseline model is useful.',
          learningGoals: 'Students separate model fit from defensible validation evidence.',
          weeklyAssessments:
            'Practice quiz and model validation notebook with baseline comparison, train-test metric, and limitation note.',
          asyncActivities: 'Review a short study guide on overfitting and validation metrics.',
          syncActivities: 'Notebook lab comparing baseline and trained model output with a validation debrief.',
          supportingResources: 'Validation notebook; metric guide; model card template',
          evaluateDesign: 'Assess validation evidence, metric interpretation, and limitation clarity.',
        },
      ],
    },
    {
      title: 'Lesson 3: Classification Modeling and Decision Thresholds',
      sections: [
        {
          topicSection:
            'Classification model, confusion matrix, decision threshold, precision, recall, false positives, false negatives',
          learningObjectives:
            'Evaluate a classification threshold using confusion matrix evidence, precision, and recall.',
          learningGoals: 'Students connect threshold choice to stakeholder risk and model performance.',
          weeklyAssessments:
            'Quiz and notebook checkpoint interpreting confusion matrix results, threshold tradeoffs, precision, recall, and false-positive/false-negative costs.',
          asyncActivities: 'Read threshold examples and predict which error is more costly.',
          syncActivities:
            'Notebook lab adjusting classification thresholds, comparing precision/recall, and writing a model-card limitation.',
          supportingResources: 'Classification notebook; confusion matrix guide; model card template',
          evaluateDesign: 'Score threshold rationale, metric interpretation, fairness concern, and model-card limit.',
        },
      ],
    },
    {
      title: 'Lesson 4: Fairness Audit and Model Card Handoff',
      sections: [
        {
          topicSection: 'Fairness audit, subgroup performance, model card, deployment limit, validation summary',
          learningObjectives: 'Audit model outputs for fairness risk and write a bounded model-card recommendation.',
          learningGoals: 'Students make model evidence transparent enough for review.',
          weeklyAssessments:
            'Final exam review and model-card handoff with subgroup check, validation evidence, fairness note, and recommendation.',
          asyncActivities: 'Study the model-card template and identify one missing evidence field.',
          syncActivities:
            'Analytics review clinic with subgroup metric comparison, fairness discussion, and model-card revision.',
          supportingResources: 'Fairness notebook; subgroup metric table; model card template; exam study guide',
          evaluateDesign:
            'Assess fairness evidence, validation summary, limitation transparency, and handoff readiness.',
        },
      ],
    },
  ],
});

const makeEngineeringDesignLabCourseMap = () => ({
  courseName: 'Engineering Design Build Test Lab',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use requirements, constraints, CAD or schematic decisions, prototype tests, measurement evidence, failure analysis, safety checks, redesign rationale, and verification reports to justify engineering design decisions.',
  lessons: [
    {
      title: 'Lesson 1: Requirements, Constraints, and Test Criteria',
      sections: [
        {
          topicSection:
            'Engineering design requirements, stakeholder constraints, tolerance, safety factor, verification criterion',
          learningObjectives: 'Translate a design problem into measurable requirements and verification criteria.',
          learningGoals: 'Students connect constraints and requirements to testable engineering decisions.',
          weeklyAssessments:
            'Requirements matrix with constraints, tolerance targets, safety factor note, test criterion, and design-verification decision.',
          asyncActivities: 'Review the design brief and identify one requirement, one constraint, and one safety risk.',
          syncActivities:
            'Engineering design review with requirement sorting, constraint tradeoff, and verification criterion check.',
          supportingResources: 'Design brief; requirements matrix template; safety factor guide',
          evaluateDesign:
            'Score requirement clarity, constraint reasoning, safety consideration, and verification criterion fit.',
        },
      ],
    },
    {
      title: 'Lesson 2: CAD Prototype and Bench Test Plan',
      sections: [
        {
          topicSection: 'CAD model, prototype fabrication, bench test, test fixture, measurement plan',
          learningObjectives: 'Create a prototype test plan that measures whether the CAD design meets requirements.',
          learningGoals: 'Students prepare a testable prototype instead of a display-only design.',
          weeklyAssessments:
            'CAD prototype test report with model decision, test fixture, measurement plan, tolerance check, and redesign risk.',
          asyncActivities: 'Annotate a CAD model and predict which dimension or tolerance needs testing.',
          syncActivities:
            'Prototype planning lab with CAD walkthrough, bench-test setup, peer review, and measurement checklist.',
          supportingResources: 'CAD model example; bench-test plan template; measurement checklist',
          evaluateDesign: 'Assess model decision, test setup validity, measurement plan, and tolerance reasoning.',
        },
      ],
    },
    {
      title: 'Lesson 3: Test Data, Failure Analysis, and Redesign',
      sections: [
        {
          topicSection: 'Test data, load test, failure mode, measurement error, redesign log',
          learningObjectives: 'Analyze test data and choose a redesign that addresses the failure mode.',
          learningGoals: 'Students use failure analysis to improve engineering performance.',
          weeklyAssessments:
            'Failure analysis memo with test data, load-test result, failure mode, measurement limitation, and redesign rationale.',
          asyncActivities: 'Review a failed prototype test and mark one likely failure cause.',
          syncActivities:
            'Failure-analysis lab with test-data comparison, measurement-limit check, redesign critique, and retest plan.',
          supportingResources: 'Failure mode checklist; load-test data sheet; redesign log template',
          evaluateDesign:
            'Score test-data interpretation, failure diagnosis, measurement limitation, and redesign rationale.',
        },
      ],
    },
    {
      title: 'Lesson 4: Verification Report and Handoff',
      sections: [
        {
          topicSection: 'Design verification, trade-off matrix, final test report, safety margin, engineering handoff',
          learningObjectives: 'Defend the final design using verification evidence and unresolved risk notes.',
          learningGoals: 'Students make engineering handoff decisions traceable and locally reviewable.',
          weeklyAssessments:
            'Final verification report with trade-off matrix, test evidence, safety margin, redesign note, and unresolved risk.',
          asyncActivities: 'Prepare a trade-off matrix comparing two design alternatives against requirements.',
          syncActivities:
            'Final engineering design review with verification evidence, safety margin challenge, and handoff debrief.',
          supportingResources: 'Verification report rubric; trade-off matrix; engineering handoff checklist',
          evaluateDesign: 'Assess requirement verification, tradeoff logic, safety margin, and handoff readiness.',
        },
      ],
    },
  ],
});

const makeMultiSectionSeminarCourseMap = () => ({
  courseName: 'Comparative Literature Seminar',
  semester: 'Fall 2026',
  learningOutcomes: 'Use literary evidence from passages and context to revise interpretive claims.',
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
  ],
});

const makeOnlineWritingCourseMap = () => ({
  courseName: 'Online Academic Writing Workshop',
  semester: 'Fall 2026',
  learningOutcomes: 'Revise academic writing through asynchronous discussion, LMS feedback, and version history.',
  lessons: [
    {
      title: 'Week 1: Discussion Board Claims',
      sections: [
        {
          topicSection: 'Online discussion-board claim, reply move, evidence cue, revision priority',
          learningObjectives: 'Analyze an asynchronous post and revise one claim using reply evidence.',
          learningGoals: 'Students make online participation and revision evidence visible.',
          weeklyAssessments: 'Claim-revision memo with original post, peer reply evidence, and revised claim.',
          asyncActivities: 'Post a claim in the LMS, reply to two peers, and tag the strongest evidence cue.',
          syncActivities: 'Optional virtual claim clinic with sample posts and reply-move comparison.',
          supportingResources: 'Discussion-board rubric; LMS checklist; claim revision example',
          evaluateDesign: 'Score claim focus, online evidence use, audience awareness, and revision specificity.',
        },
      ],
    },
    {
      title: 'Week 2: Feedback and Version History',
      sections: [
        {
          topicSection: 'Online feedback loop, version history, revision rationale, change evidence',
          learningObjectives: 'Compare draft versions and explain which feedback changed the writing and why.',
          learningGoals: 'Students connect feedback evidence to a documented revision decision.',
          weeklyAssessments: 'Version-history memo with feedback quote, change evidence, and revision rationale.',
          asyncActivities: 'Review LMS feedback, compare draft versions, and mark one sentence-level change.',
          syncActivities: 'Optional revision conference using version history and feedback-priority notes.',
          supportingResources: 'Version-history guide; feedback-priority checklist; revision rationale model',
          evaluateDesign: 'Score feedback selection, change evidence, rationale quality, and next-revision target.',
        },
      ],
    },
  ],
});

const makeQuantitativeProblemSetCourseMap = () => ({
  courseName: 'College Algebra Problem Solving',
  semester: 'Fall 2026',
  learningOutcomes: 'Solve equations, graph functions, verify answers, and explain worked-solution reasoning.',
  lessons: [
    {
      title: 'Week 1: Linear Equations and Solution Checks',
      sections: [
        {
          topicSection: 'Linear equation setup, inverse operations, solution check, common algebra error',
          learningObjectives: 'Solve linear equations and verify each answer by substitution.',
          learningGoals: 'Students show the setup and reasoning path, not only the final answer.',
          weeklyAssessments: 'Worked problem set with equation setup, step trace, solution check, and error note.',
          asyncActivities: 'Complete practice problems and annotate one incorrect worked solution.',
          syncActivities: 'Problem-solving clinic with setup comparison, step trace, and corrected solution.',
          supportingResources: 'Equation-solving guide; worked-example set; solution-check checklist',
          evaluateDesign: 'Score setup accuracy, step reasoning, answer verification, and error diagnosis.',
        },
      ],
    },
    {
      title: 'Week 2: Function Graphs and Representation Choice',
      sections: [
        {
          topicSection: 'Function notation, graphing, slope, intercept, representation choice',
          learningObjectives: 'Graph linear functions and explain how representation changes interpretation.',
          learningGoals: 'Students connect equations, graphs, and verbal meaning.',
          weeklyAssessments: 'Graphing problem set with equation, graph annotation, representation choice, and check.',
          asyncActivities: 'Graph two functions and identify one representation error.',
          syncActivities: 'Graph clinic comparing tables, equations, and annotated coordinate-plane evidence.',
          supportingResources: 'Graphing checklist; function notation guide; representation-choice examples',
          evaluateDesign: 'Score graph accuracy, representation alignment, explanation quality, and answer check.',
        },
      ],
    },
  ],
});

const makeStatisticsInferenceCourseMap = () => ({
  courseName: 'Introduction to Statistical Inference',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use confidence intervals, hypothesis tests, p-values, assumption checks, effect size, and limitation language to make defensible statistical inference decisions.',
  lessons: [
    {
      title: 'Week 1: Confidence Intervals and Sampling Uncertainty',
      sections: [
        {
          topicSection:
            'Statistical inference, sample, parameter, sampling distribution, standard error, margin of error, confidence interval',
          learningObjectives:
            'Construct and interpret a confidence interval using sample context, standard error, and margin of error.',
          learningGoals:
            'Students connect interval estimates to uncertainty, sample context, population claims, and limitations.',
          weeklyAssessments:
            'Confidence interval interpretation report with research question, sample context, standard error, margin of error, interval estimate, practical interpretation, and limitation note.',
          asyncActivities:
            'Annotate a confidence interval example and identify the parameter, sample, standard error, and limitation.',
          syncActivities:
            'Inference interpretation clinic with assumption check, guided interval calculation, uncertainty interpretation, and limitation revision.',
          supportingResources: 'Confidence interval guide; standard error calculator; interpretation checklist',
          evaluateDesign:
            'Score question fit, interval calculation, uncertainty interpretation, assumption check, and limitation language.',
        },
      ],
    },
    {
      title: 'Week 2: Hypothesis Tests, P-values, and Effect Size',
      sections: [
        {
          topicSection:
            'Null hypothesis, alternative hypothesis, test statistic, p-value, statistical significance, assumption check, effect size',
          learningObjectives:
            'Run a hypothesis test and interpret the p-value, effect size, assumptions, and inference decision.',
          learningGoals:
            'Students avoid treating statistical significance as practical importance without checking assumptions and effect size.',
          weeklyAssessments:
            'Hypothesis test write-up with null and alternative hypotheses, assumption check, test statistic, p-value explanation, effect size, inference decision, and limitation note.',
          asyncActivities: 'Compare two p-value explanations and flag one overclaim about significance.',
          syncActivities:
            'P-value interpretation clinic with output trace, assumption challenge, effect-size comparison, and revised inference decision.',
          supportingResources: 'Hypothesis-test checklist; p-value explanation examples; effect-size guide',
          evaluateDesign:
            'Score assumption validity, test statistic accuracy, p-value interpretation, effect-size reasoning, and limitation language.',
        },
      ],
    },
  ],
});

const makeAccountingFinanceCourseMap = () => ({
  courseName: 'Financial Accounting and Statement Analysis',
  semester: 'Fall 2026',
  learningOutcomes:
    'Prepare journal entries, connect transactions to financial statements, calculate ratios, analyze cash-flow effects, review controls, and make defensible financial decisions.',
  lessons: [
    {
      title: 'Week 1: Transactions, Journal Entries, and Statement Effects',
      sections: [
        {
          topicSection:
            'Source document, journal entry, debit, credit, ledger, trial balance, balance sheet, income statement',
          learningObjectives:
            'Record transactions as journal entries and explain the balance sheet and income statement effects.',
          learningGoals:
            'Students connect source documents, account classification, journal entries, and financial statement effects.',
          weeklyAssessments:
            'Journal-entry worksheet with source document, debit and credit account classification, ledger posting, trial balance check, statement effect, and control note.',
          asyncActivities:
            'Classify transactions by account and identify the source document that supports each journal entry.',
          syncActivities:
            'Financial analysis clinic with source document check, account classification, calculation trace, statement-effect review, and revised financial decision.',
          supportingResources: 'Chart of accounts; journal-entry guide; trial-balance checklist',
          evaluateDesign:
            'Score source-document fit, account classification, debit/credit accuracy, statement linkage, and control note.',
        },
      ],
    },
    {
      title: 'Week 2: Ratio Analysis, Cash Flow, and Decision Usefulness',
      sections: [
        {
          topicSection:
            'Financial statement analysis, ratio analysis, current ratio, debt-to-equity, gross margin, cash-flow statement, working capital',
          learningObjectives: 'Calculate financial ratios and interpret cash-flow signals for a decision.',
          learningGoals:
            'Students avoid ratio calculation without statement linkage, assumptions, and decision interpretation.',
          weeklyAssessments:
            'Financial statement analysis memo with balance sheet and income statement source lines, ratio calculation, cash-flow effect, assumption check, financial decision, and limitation note.',
          asyncActivities:
            'Review a balance sheet and income statement and flag one ratio that needs cash-flow context.',
          syncActivities:
            'Ratio analysis clinic with statement-line trace, assumption challenge, cash-flow interpretation, and revised decision.',
          supportingResources: 'Ratio formula sheet; cash-flow statement example; decision-usefulness checklist',
          evaluateDesign:
            'Score statement linkage, ratio accuracy, cash-flow interpretation, assumption check, and decision usefulness.',
        },
      ],
    },
  ],
});

const makePolicyAnalysisCourseMap = () => ({
  courseName: 'Public Policy Analysis and Implementation',
  semester: 'Fall 2026',
  learningOutcomes:
    'Frame public problems, compare policy options, analyze stakeholder and equity effects, test feasibility, plan implementation, and write defensible policy memos.',
  lessons: [
    {
      title: 'Week 1: Problem Definition and Policy Authority',
      sections: [
        {
          topicSection:
            'Public problem, policy authority, affected population, evidence source, agenda setting, administrative burden',
          learningObjectives:
            'Define a public policy problem and identify the authority, affected population, and evidence needed for action.',
          learningGoals:
            'Students avoid broad civic reflection by grounding policy analysis in a specific public problem and decision maker.',
          weeklyAssessments:
            'Policy memo with problem definition, affected population, policy authority, source evidence, administrative burden note, and policy decision.',
          asyncActivities:
            'Compare two problem statements and annotate which one identifies authority, evidence, and affected stakeholders.',
          syncActivities:
            'Policy option clinic with problem-definition check, stakeholder map, evidence trace, and revised policy decision.',
          supportingResources: 'Problem-definition guide; public authority map; policy memo examples',
          evaluateDesign:
            'Score problem framing, authority fit, source credibility, stakeholder representation, and decision usefulness.',
        },
      ],
    },
    {
      title: 'Week 2: Policy Options, Equity, and Feasibility',
      sections: [
        {
          topicSection:
            'Policy options, stakeholder analysis, equity analysis, feasibility, cost-benefit tradeoff, implementation risk',
          learningObjectives:
            'Compare policy options using evidence, equity effects, feasibility constraints, and implementation risks.',
          learningGoals:
            'Students learn to recommend a policy option only after testing equity, feasibility, stakeholder effects, and implementation constraints.',
          weeklyAssessments:
            'Policy option matrix with stakeholder analysis, equity analysis, cost-benefit note, feasibility constraint, implementation risk, and recommendation rationale.',
          asyncActivities:
            'Read a policy brief and flag one equity effect and one implementation constraint that change the option ranking.',
          syncActivities:
            'Option comparison clinic with stakeholder/equity challenge, cost-benefit note, implementation-risk review, and revised recommendation.',
          supportingResources: 'Option matrix template; equity impact checklist; implementation-risk examples',
          evaluateDesign:
            'Score option comparison, equity reasoning, feasibility analysis, implementation risk, and recommendation rationale.',
        },
      ],
    },
  ],
});

const makeEconomicsAnalysisCourseMap = () => ({
  courseName: 'Principles of Microeconomics and Market Analysis',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use supply and demand, elasticity, market equilibrium, consumer and producer surplus, tax incidence, externalities, and market structure evidence to make defensible economic decisions.',
  lessons: [
    {
      title: 'Week 1: Supply, Demand, and Market Equilibrium',
      sections: [
        {
          topicSection:
            'Microeconomics, supply and demand, market equilibrium, comparative statics, price signal, scarcity',
          learningObjectives:
            'Analyze a market shock by shifting supply or demand and explaining the equilibrium effect.',
          learningGoals: 'Students use economic models to connect assumptions, incentives, and market outcomes.',
          weeklyAssessments:
            'Economic analysis brief with supply-demand diagram, market equilibrium change, comparative statics explanation, assumption note, and economic decision.',
          asyncActivities: 'Annotate a supply-demand example and identify which assumption changes the market outcome.',
          syncActivities:
            'Economic model clinic with market definition, diagram trace, comparative-statics challenge, and revised economic decision.',
          supportingResources: 'Supply-demand guide; comparative-statics examples; market analysis template',
          evaluateDesign:
            'Score model fit, assumption clarity, diagram accuracy, comparative-statics reasoning, and decision usefulness.',
        },
      ],
    },
    {
      title: 'Week 2: Elasticity, Surplus, and Tax Incidence',
      sections: [
        {
          topicSection:
            'Elasticity, consumer surplus, producer surplus, deadweight loss, tax incidence, welfare analysis',
          learningObjectives:
            'Evaluate how elasticity changes tax incidence, surplus, deadweight loss, and welfare interpretation.',
          learningGoals:
            'Students avoid final-answer economics by tracing burden, incentives, welfare effects, and evidence limits.',
          weeklyAssessments:
            'Tax incidence analysis memo with elasticity estimate, consumer surplus, producer surplus, deadweight loss, welfare effect, and economic decision.',
          asyncActivities: 'Compare elastic and inelastic demand examples and predict who bears more of a tax burden.',
          syncActivities:
            'Welfare analysis clinic with elasticity comparison, surplus diagram, incidence challenge, and revised decision.',
          supportingResources: 'Elasticity formula sheet; surplus diagram model; incidence checklist',
          evaluateDesign:
            'Score elasticity reasoning, surplus interpretation, incidence logic, welfare analysis, and limitation language.',
        },
      ],
    },
  ],
});

const makeEthicsArgumentCourseMap = () => ({
  courseName: 'Applied Ethics and Moral Reasoning',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use normative frameworks, moral argument maps, thought experiments, objections, replies, stakeholder harms, rights, justice, and case evidence to make defensible moral decisions.',
  lessons: [
    {
      title: 'Week 1: Moral Arguments and Normative Frameworks',
      sections: [
        {
          topicSection:
            'Ethics, moral argument, normative framework, claim, reason, principle, value conflict, stakeholder harm',
          learningObjectives:
            'Construct a moral argument map that connects claim, reasons, principle, stakeholders, and decision limit.',
          learningGoals: 'Students avoid opinion-only ethics by making reasons, frameworks, and limits visible.',
          weeklyAssessments:
            'Ethical argument brief with moral issue, affected parties, normative framework, claim, reasons, objection, reply, and moral decision.',
          asyncActivities:
            'Annotate two moral arguments and mark the claim, supporting reason, principle, and missing objection.',
          syncActivities:
            'Ethical argument seminar with dilemma framing, framework comparison, argument-map share, objection and reply, and revised moral judgment.',
          supportingResources: 'Argument-map guide; normative framework overview; dilemma analysis template',
          evaluateDesign:
            'Score claim clarity, framework fit, reason support, objection strength, reply quality, and judgment limit.',
        },
      ],
    },
    {
      title: 'Week 2: Utilitarianism, Deontology, and Objection Reply',
      sections: [
        {
          topicSection:
            'Utilitarianism, deontology, rights, duty, consequences, thought experiment, objection, counterargument, reply',
          learningObjectives:
            'Compare utilitarian and deontological arguments by testing a thought experiment and answering an objection.',
          learningGoals:
            'Students revise moral judgments when a competing framework or case variation exposes a weakness.',
          weeklyAssessments:
            'Normative framework comparison with utilitarian argument, deontological argument, thought experiment, objection, reply, stakeholder effect, and moral decision.',
          asyncActivities:
            'Compare a utilitarian and deontological response to a case dilemma and write one objection to each.',
          syncActivities:
            'Framework comparison seminar with thought-experiment pressure, objection/reply practice, and revised moral decision.',
          supportingResources: 'Utilitarianism guide; deontology guide; thought-experiment examples',
          evaluateDesign:
            'Score framework accuracy, case application, objection quality, reply strength, and moral judgment revision.',
        },
      ],
    },
  ],
});

const makeProofSeminarCourseMap = () => ({
  courseName: 'Real Analysis Proof Seminar',
  semester: 'Fall 2026',
  learningOutcomes:
    'Write theorem proofs using definitions, hypotheses, quantifier precision, counterexample testing, logical implications, and revision after proof critique.',
  lessons: [
    {
      title: 'Week 1: Definitions, Quantifiers, and Direct Proof',
      sections: [
        {
          topicSection: 'Real analysis definitions, quantifiers, hypotheses, theorem statement, direct proof strategy',
          learningObjectives:
            'Use definitions and quantifiers to construct a direct proof with justified logical steps.',
          learningGoals: 'Students learn to parse theorem statements before writing proof steps.',
          weeklyAssessments:
            'Direct theorem proof write-up with definitions, hypotheses, quantifier precision, logical step justification, and revision note.',
          asyncActivities: 'Annotate a theorem statement and identify the definitions, hypotheses, and conclusion.',
          syncActivities:
            'Proof clinic with definition unpacking, proof-strategy comparison, guided proof construction, and peer critique.',
          supportingResources: 'Definition list; theorem annotation guide; proof critique checklist',
          evaluateDesign:
            'Score definition use, quantifier precision, logical validity, notation clarity, and revision quality.',
        },
      ],
    },
    {
      title: 'Week 2: Counterexamples and Epsilon-Delta Proofs',
      sections: [
        {
          topicSection:
            'Counterexample analysis, epsilon-delta proof, boundary cases, theorem conditions, proof revision',
          learningObjectives: 'Test theorem hypotheses with counterexamples and revise an epsilon-delta proof.',
          learningGoals: 'Students use counterexamples to understand why hypotheses matter.',
          weeklyAssessments:
            'Counterexample analysis and epsilon-delta proof revision with boundary case, theorem conditions, and revised proof step.',
          asyncActivities: 'Compare two attempted proofs and identify one missing hypothesis or counterexample risk.',
          syncActivities:
            'Counterexample workshop with edge-case testing, proof critique, and revised epsilon-delta argument.',
          supportingResources: 'Counterexample bank; epsilon-delta proof model; revision checklist',
          evaluateDesign:
            'Assess hypothesis tracking, counterexample reasoning, proof validity, and revision rationale.',
        },
      ],
    },
  ],
});

const makeLectureExamCourseMap = () => ({
  courseName: 'Introduction to Psychology Lecture',
  semester: 'Fall 2026',
  learningOutcomes:
    'Explain core psychology concepts, diagnose misconceptions, use retrieval practice, and prepare for midterm and final exam questions.',
  lessons: [
    {
      title: 'Week 1: Scientific Thinking and Psychology',
      sections: [
        {
          topicSection: 'Scientific reasoning, theory, hypothesis, operational definition, replication',
          learningObjectives: 'Explain how psychologists test claims and distinguish theories from opinions.',
          learningGoals: 'Students use concept-check evidence to avoid common reasoning misconceptions.',
          weeklyAssessments:
            'Concept check quiz with retrieval question, confidence rating, misconception diagnosis, and corrected explanation.',
          asyncActivities: 'Read lecture notes and answer a practice quiz on theory, hypothesis, and replication.',
          syncActivities:
            'Lecture concept check with clicker questions, wrong-answer sort, and exam-style transfer item.',
          supportingResources: 'Lecture notes; exam blueprint; misconception list; practice quiz',
          evaluateDesign:
            'Score concept accuracy, corrected explanation, confidence calibration, and transfer readiness.',
        },
      ],
    },
    {
      title: 'Week 2: Neurons and Neural Communication',
      sections: [
        {
          topicSection: 'Neuron structure, action potential, neurotransmitter, synapse, neural pathway',
          learningObjectives:
            'Describe neural communication and predict how a neurotransmitter change affects signaling.',
          learningGoals: 'Students connect biology vocabulary to exam-style reasoning rather than memorization only.',
          weeklyAssessments:
            'Exam blueprint worksheet with labeled neuron diagram, practice item, misconception repair, and study-guide update.',
          asyncActivities: 'Review lecture diagrams and complete a retrieval log for neuron terms.',
          syncActivities: 'Worked lecture example with concept-check polling and corrected explanation rehearsal.',
          supportingResources: 'Neuron diagram; practice item bank; study guide template; exam blueprint',
          evaluateDesign:
            'Score diagram accuracy, reasoning explanation, misconception repair, and study-guide quality.',
        },
      ],
    },
  ],
});

const makeFourLessonLectureExamCourseMap = () => {
  const base = makeLectureExamCourseMap();
  return {
    ...base,
    lessons: [
      ...base.lessons,
      {
        title: 'Week 3: Learning and Conditioning',
        sections: [
          {
            topicSection: 'Classical conditioning, operant conditioning, reinforcement, extinction, generalization',
            learningObjectives: 'Explain conditioning principles and apply them to a concept-check scenario.',
            learningGoals: 'Students use retrieval practice to diagnose learning misconceptions.',
            weeklyAssessments:
              'Conditioning concept check with scenario answer, misconception diagnosis, and corrected explanation.',
            asyncActivities: 'Review lecture examples and complete a retrieval log on reinforcement and extinction.',
            syncActivities: 'Clicker-question sequence with wrong-answer diagnosis and exam-style transfer.',
            supportingResources: 'Conditioning lecture notes; practice item bank; exam blueprint',
            evaluateDesign:
              'Score scenario accuracy, misconception repair, confidence calibration, and transfer explanation.',
          },
        ],
      },
      {
        title: 'Week 4: Memory and Bias',
        sections: [
          {
            topicSection: 'Working memory, long-term memory, retrieval cues, confirmation bias, availability heuristic',
            learningObjectives: 'Compare memory processes and bias patterns in exam-style judgment questions.',
            learningGoals: 'Students connect memory and bias concepts to corrected explanations.',
            weeklyAssessments:
              'Memory and bias practice quiz with confidence rating, wrong-answer sort, and study-guide update.',
            asyncActivities: 'Read lecture notes and answer retrieval prompts on memory and cognitive bias.',
            syncActivities: 'Worked lecture example with concept-check polling and corrected explanation rehearsal.',
            supportingResources: 'Memory lecture notes; bias examples; study guide template; exam blueprint',
            evaluateDesign:
              'Score concept discrimination, corrected explanation, study-guide quality, and transfer readiness.',
          },
        ],
      },
    ],
  };
};

const makeFifteenLessonLectureExamCourseMap = () => {
  const topics = [
    ['Scientific Thinking and Psychology', 'theory, hypothesis, operational definition, replication'],
    ['Neurons and Neural Communication', 'neuron structure, action potential, neurotransmitter, synapse'],
    ['Learning and Conditioning', 'classical conditioning, reinforcement, extinction, generalization'],
    ['Memory Systems', 'working memory, retrieval cue, encoding, forgetting curve'],
    ['Cognition and Problem Solving', 'heuristic, algorithm, confirmation bias, mental set'],
    ['Development Across the Lifespan', 'attachment, cognitive development, identity, aging'],
    ['Sensation and Perception', 'threshold, adaptation, depth cue, perceptual set'],
    ['Emotion and Motivation', 'arousal, appraisal, intrinsic motivation, goal conflict'],
    ['Personality Theories', 'trait model, psychodynamic explanation, social-cognitive theory'],
    ['Social Psychology', 'attribution, conformity, obedience, group polarization'],
    ['Stress and Health', 'stressor, coping strategy, resilience, health behavior'],
    ['Psychological Disorders', 'diagnostic criteria, impairment, stigma, comorbidity'],
    ['Therapy and Treatment', 'CBT, exposure, therapeutic alliance, evidence-based treatment'],
    ['Research Ethics and Bias', 'informed consent, sampling bias, demand characteristic, validity'],
    ['Exam Synthesis and Transfer', 'concept discrimination, transfer question, study plan, correction log'],
  ];
  return {
    courseName: 'Introduction to Psychology Lecture',
    semester: 'Fall 2026',
    learningOutcomes:
      'Explain core psychology concepts, diagnose misconceptions, use retrieval practice, and prepare for midterm and final exam questions.',
    lessons: topics.map(([title, topicSection], index) => ({
      title: `Week ${index + 1}: ${title}`,
      sections: [
        {
          topicSection,
          learningObjectives: `Explain ${title.toLowerCase()} and apply it to an exam-style scenario.`,
          learningGoals: `Students use retrieval practice to diagnose misconceptions about ${title.toLowerCase()}.`,
          weeklyAssessments: `${title} concept check with answer rationale, confidence mark, correction note, and transfer prompt.`,
          asyncActivities: `Review lecture notes and complete a short retrieval log on ${title.toLowerCase()}.`,
          syncActivities:
            'Lecture concept polling with distractor diagnosis, corrected explanation, and parallel exam practice.',
          supportingResources: 'Lecture notes; exam blueprint; misconception list; practice quiz',
          evaluateDesign: `Score concept accuracy, correction quality, confidence calibration, and transfer readiness for ${title.toLowerCase()}.`,
        },
      ],
    })),
  };
};

const makeCapstoneProjectCourseMap = () => ({
  courseName: 'Product Innovation Capstone',
  semester: 'Fall 2026',
  learningOutcomes:
    'Integrate research, design, feasibility, stakeholder evidence, and implementation planning into a defensible capstone project.',
  lessons: [
    {
      title: 'Week 1: Project Charter and Sponsor Need',
      sections: [
        {
          topicSection: 'Project charter, sponsor need, stakeholder constraint, success criteria',
          learningObjectives: 'Define a capstone project charter that connects sponsor needs to success criteria.',
          learningGoals: 'Students frame a feasible capstone project around evidence and constraints.',
          weeklyAssessments:
            'Project charter with sponsor need, stakeholder constraint, success criteria, risk note, and revision commitment.',
          asyncActivities: 'Review sponsor notes and identify one constraint that changes the project scope.',
          syncActivities: 'Milestone review with sponsor-need comparison, project evidence check, and risk triage.',
          supportingResources: 'Project charter template; sponsor brief; milestone evidence checklist',
          evaluateDesign: 'Score sponsor fit, project scope, evidence use, risk clarity, and revision commitment.',
        },
      ],
    },
    {
      title: 'Week 2: Implementation Plan and Milestone Defense',
      sections: [
        {
          topicSection: 'Implementation plan, milestone decision, feasibility risk, portfolio defense',
          learningObjectives: 'Defend an implementation plan using project evidence and feasibility constraints.',
          learningGoals: 'Students justify the next milestone before moving toward final showcase.',
          weeklyAssessments:
            'Implementation plan milestone brief with project evidence, feasibility risk, decision log, and defense notes.',
          asyncActivities: 'Draft a decision log and flag the highest implementation risk.',
          syncActivities:
            'Milestone design review with evidence defense, sponsor constraint check, and next-revision commitment.',
          supportingResources: 'Implementation plan model; decision-log template; defense rehearsal guide',
          evaluateDesign: 'Assess project coherence, stakeholder fit, feasibility risk, and defense readiness.',
        },
      ],
    },
  ],
});

const makeCompetencyAssessmentCourseMap = () => ({
  courseName: 'Teacher Education Competency Assessment',
  semester: 'Fall 2026',
  learningOutcomes:
    'Collect standards-aligned competency evidence, calibrate proficiency decisions, plan remediation, and document reassessment readiness.',
  lessons: [
    {
      title: 'Week 1: Standards-Aligned Lesson Facilitation Competency',
      sections: [
        {
          topicSection: 'Teaching competency, program standard, observable performance evidence, benchmark descriptor',
          learningObjectives:
            'Map a teaching performance task to the program standard and identify evidence of proficiency.',
          learningGoals: 'Students connect observable practice evidence to a calibrated competency descriptor.',
          weeklyAssessments:
            'Competency evidence portfolio entry with performance task evidence, benchmark descriptor, assessor note, and proficiency decision.',
          asyncActivities: 'Review the program standard and annotate one performance video for evidence.',
          syncActivities:
            'Competency calibration panel with benchmark comparison, assessor-note review, and remediation planning.',
          supportingResources: 'Program standard; competency checklist; benchmark descriptor guide',
          evaluateDesign:
            'Score standards alignment, evidence sufficiency, proficiency calibration, and reassessment plan.',
        },
      ],
    },
    {
      title: 'Week 2: Feedback and Remediation Competency',
      sections: [
        {
          topicSection: 'Feedback competency, remediation plan, reassessment evidence, calibration note',
          learningObjectives: 'Design a remediation plan that responds to a specific proficiency gap.',
          learningGoals: 'Students use assessor feedback to plan the next evidence opportunity.',
          weeklyAssessments:
            'Remediation plan with proficiency gap evidence, feedback target, reassessment task, and calibration note.',
          asyncActivities: 'Compare two assessor notes and identify which benchmark descriptor is not yet met.',
          syncActivities:
            'Calibration review with proficiency-gap diagnosis, remediation option comparison, and reassessment commitment.',
          supportingResources: 'Remediation planning template; calibration-note examples; reassessment checklist',
          evaluateDesign:
            'Assess feedback precision, remediation fit, reassessment alignment, and proficiency-decision clarity.',
        },
      ],
    },
  ],
});

const makeCreativeWritingCourseMap = () => ({
  courseName: 'Creative Writing Workshop',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use craft vocabulary, workshop critique, draft evidence, and revision portfolios to develop creative work for a reader.',
  lessons: [
    {
      title: 'Week 1: Image, Voice, and Draft Evidence',
      sections: [
        {
          topicSection: 'Poetry image, voice, line break, draft evidence, craft choice',
          learningObjectives: 'Revise a poem draft by making one image and voice choice visible.',
          learningGoals: 'Students connect craft vocabulary to draft evidence and reader effect.',
          weeklyAssessments:
            'Creative draft portfolio entry with poem draft, craft annotation, workshop critique note, and revision decision.',
          asyncActivities: 'Annotate one model poem for image, voice, and line-break craft choices.',
          syncActivities:
            'Creative workshop critique with silent read, craft observation, peer response, and next-draft commitment.',
          supportingResources: 'Craft vocabulary guide; workshop protocol; revision portfolio template',
          evaluateDesign: 'Score craft intentionality, draft evidence, critique uptake, and revision clarity.',
        },
      ],
    },
    {
      title: 'Week 2: Scene, Character, and Revision Portfolio',
      sections: [
        {
          topicSection: 'Fiction scene, character desire, dialogue, audience effect, revision portfolio',
          learningObjectives: 'Revise a fiction scene so character desire and audience effect are clearer.',
          learningGoals: 'Students use workshop critique to make one visible scene revision.',
          weeklyAssessments:
            'Revision portfolio entry with scene draft, critique notes, craft rationale, revised passage, and artist statement.',
          asyncActivities: 'Draft a short scene and mark one line of dialogue that reveals character desire.',
          syncActivities: 'Workshop critique comparing craft intention, reader effect, and targeted revision options.',
          supportingResources: 'Scene craft checklist; character desire model; artist statement prompt',
          evaluateDesign: 'Assess craft rationale, reader effect, visible revision, and portfolio coherence.',
        },
      ],
    },
  ],
});

const makeBusinessCaseCourseMap = () => ({
  courseName: 'Business Strategy Case Method',
  semester: 'Fall 2026',
  learningOutcomes:
    'Analyze business cases, interpret exhibits, weigh stakeholder tradeoffs, defend strategic recommendations, and revise implementation-risk memos.',
  lessons: [
    {
      title: 'Week 1: Market Entry Decision Case',
      sections: [
        {
          topicSection: 'Business case, market entry, decision criteria, exhibit evidence, stakeholder tradeoff',
          learningObjectives:
            'Evaluate a market entry case and defend one recommendation using case evidence and decision criteria.',
          learningGoals: 'Students separate case facts from assumptions before defending a strategic recommendation.',
          weeklyAssessments:
            'Case analysis memo with market-entry recommendation, exhibit evidence, stakeholder tradeoff, decision criteria, and implementation risk.',
          asyncActivities: 'Read the case packet and annotate exhibits for market size, margin, and channel risk.',
          syncActivities:
            'Case decision board with fact sort, exhibit check, stakeholder tradeoff challenge, and recommendation defense.',
          supportingResources: 'Case packet; exhibit analysis guide; recommendation memo template',
          evaluateDesign:
            'Score case evidence, tradeoff reasoning, decision criteria, recommendation defense, and implementation risk.',
        },
      ],
    },
    {
      title: 'Week 2: Competitive Advantage and Operating Tradeoffs',
      sections: [
        {
          topicSection:
            'Competitive advantage, operating margin, customer segment, financial tradeoff, implementation risk',
          learningObjectives:
            'Compare strategic options and revise an executive memo based on operational tradeoff evidence.',
          learningGoals: 'Students use exhibit evidence to test whether a strategy is feasible.',
          weeklyAssessments:
            'Executive memo with strategic recommendation, competitive-advantage evidence, financial tradeoff, alternative option, and implementation-risk revision.',
          asyncActivities:
            'Prepare a tradeoff table comparing two strategic options using exhibit and customer-segment evidence.',
          syncActivities:
            'Decision-criteria debate with alternative recommendation challenge and implementation-risk revision.',
          supportingResources: 'Tradeoff table model; operating-margin exhibit; executive memo checklist',
          evaluateDesign:
            'Assess strategic fit, exhibit use, alternative comparison, financial tradeoff, and revision quality.',
        },
      ],
    },
  ],
});

const makeConstitutionalLawCourseMap = () => ({
  courseName: 'Constitutional Law: Rights and Structure',
  semester: 'Fall 2026',
  learningOutcomes:
    'Brief constitutional cases, synthesize legal rules, distinguish holdings and rationales, spot issues, and apply doctrine to new hypotheticals.',
  lessons: [
    {
      title: 'Week 1: Judicial Review and Case Briefing',
      sections: [
        {
          topicSection: 'Constitutional law, case brief, holding, rationale, procedural posture, legal rule',
          learningObjectives:
            'Extract a constitutional holding and rule statement from a foundational judicial review case.',
          learningGoals:
            'Students distinguish material facts, procedural posture, holding, rationale, and rule statement.',
          weeklyAssessments:
            'Case brief with material facts, procedural posture, holding, rationale, legal rule, and hypothetical application.',
          asyncActivities: 'Read the case and annotate facts, issue, holding, rationale, and dissent.',
          syncActivities:
            'Socratic rule application with case brief comparison, holding extraction, rule challenge, and hypothetical application.',
          supportingResources: 'Casebook excerpt; case brief template; rule statement checklist',
          evaluateDesign:
            'Score holding accuracy, rationale distinction, rule statement, and hypothetical application.',
        },
      ],
    },
    {
      title: 'Week 2: Equal Protection and Scrutiny Standards',
      sections: [
        {
          topicSection:
            'Equal protection, strict scrutiny, intermediate scrutiny, rational basis, precedent, issue spotting',
          learningObjectives:
            'Apply scrutiny standards to a new fact pattern and explain which facts change the legal conclusion.',
          learningGoals: 'Students use precedent and doctrine to write a fact-sensitive legal conclusion.',
          weeklyAssessments:
            'IRAC legal memo with issue spotting, rule statement, scrutiny standard, precedent comparison, and application to a new hypothetical.',
          asyncActivities:
            'Compare two equal protection precedents and identify which facts trigger different scrutiny.',
          syncActivities:
            'Hypothetical application workshop with precedent map, rule challenge, counterargument, and revised IRAC paragraph.',
          supportingResources: 'Scrutiny standards chart; precedent map; IRAC memo model',
          evaluateDesign:
            'Assess rule accuracy, precedent comparison, fact application, counterargument, and conclusion clarity.',
        },
      ],
    },
  ],
});

const makeInformationLiteracyCourseMap = () => ({
  courseName: 'Information Literacy and Library Research',
  semester: 'Fall 2026',
  learningOutcomes:
    'Frame research questions, build database search strategies, evaluate source credibility, follow citation trails, create annotated bibliographies, synthesize sources, and justify source-use decisions.',
  lessons: [
    {
      title: 'Week 1: Research Questions and Information Needs',
      sections: [
        {
          topicSection: 'Information literacy, research question, information need, source scope, source-use decision',
          learningObjectives:
            'Narrow a broad topic into a research question and explain what source evidence is needed.',
          learningGoals: 'Students define an information need before searching for sources.',
          weeklyAssessments:
            'Source-use plan with research question, information need, source boundary, preliminary search terms, and source-use decision.',
          asyncActivities: 'Review sample topics and identify which ones need stronger source scope.',
          syncActivities:
            'Question-framing workshop with information-need diagnosis, source-scope check, and search-plan revision.',
          supportingResources: 'Research question checklist; information-need examples; source-scope worksheet',
          evaluateDesign: 'Score question focus, source boundary, information need, and search-plan readiness.',
        },
      ],
    },
    {
      title: 'Week 2: Keywords, Database Search, and Source Credibility',
      sections: [
        {
          topicSection:
            'Database search, keyword search, controlled vocabulary, peer-reviewed source, source credibility',
          learningObjectives:
            'Build a database search string and evaluate whether retrieved sources are credible and relevant.',
          learningGoals: 'Students use search strategy evidence and credibility checks to select scholarly sources.',
          weeklyAssessments:
            'Source evaluation dossier with database search log, controlled vocabulary, peer-reviewed filter, credibility check, citation-trail note, and source-use decision.',
          asyncActivities:
            'Try two keyword searches in a library database and save result counts and strongest source titles.',
          syncActivities:
            'Source evaluation clinic with database-search trace, credibility screen, citation-trail comparison, and revised source-use decision.',
          supportingResources: 'Database guide; controlled vocabulary example; source evaluation rubric',
          evaluateDesign: 'Score search-string logic, source credibility, relevance, and citation-trail reasoning.',
        },
      ],
    },
  ],
});

const makeTeacherPreparationCourseMap = () => ({
  courseName: 'Teaching Methods and Classroom Practice',
  semester: 'Fall 2026',
  learningOutcomes:
    'Design standards-aligned lesson plans, rehearse microteaching moves, analyze student work, use formative assessment, differentiate instruction, manage classroom routines, and revise teaching decisions from evidence.',
  lessons: [
    {
      title: 'Week 1: Learning Targets, Standards, and Lesson Alignment',
      sections: [
        {
          topicSection: 'Teaching methods, learning target, standards alignment, lesson plan, formative assessment',
          learningObjectives:
            'Write a learning target and align the lesson task and formative assessment to the standard.',
          learningGoals: 'Teacher candidates connect standards, targets, tasks, and student evidence.',
          weeklyAssessments:
            'Lesson plan portfolio entry with learning target, standards alignment, formative assessment, student-evidence cue, and instructional decision.',
          asyncActivities:
            'Review two lesson plans and annotate where the target, task, and assessment align or drift.',
          syncActivities:
            'Lesson-study planning workshop with target-task alignment check, formative assessment critique, and plan revision.',
          supportingResources: 'Standards excerpt; lesson-plan template; formative assessment examples',
          evaluateDesign:
            'Score target-task alignment, standard fit, formative evidence, and revised instructional decision.',
        },
      ],
    },
    {
      title: 'Week 2: Microteaching, Student Work, and Differentiation',
      sections: [
        {
          topicSection: 'Microteaching, student work analysis, differentiation, classroom management, reteach plan',
          learningObjectives:
            'Rehearse a teaching move, analyze student responses, and revise instruction for learner variability.',
          learningGoals: 'Teacher candidates use classroom evidence to improve instruction and differentiation.',
          weeklyAssessments:
            'Microteaching reflection with student work analysis, differentiation plan, classroom-management cue, feedback response, and reteach decision.',
          asyncActivities:
            'Watch a microteaching clip and sort student responses into ready, partial, and needs-reteach groups.',
          syncActivities:
            'Microteaching rehearsal with peer observation, student-work analysis, differentiation challenge, and reteach planning.',
          supportingResources: 'Microteaching protocol; student-work samples; differentiation checklist',
          evaluateDesign:
            'Assess student-evidence analysis, differentiation fit, classroom feasibility, and reteach rationale.',
        },
      ],
    },
  ],
});

const makeCounselingPracticeCourseMap = () => ({
  courseName: 'Counseling Skills and Social Work Practice',
  semester: 'Fall 2026',
  learningOutcomes:
    'Use active listening, reflective responses, client intake evidence, case conceptualization, risk assessment, safety planning, referral reasoning, and supervision feedback to make ethical helping response decisions.',
  lessons: [
    {
      title: 'Week 1: Client Intake, Rapport, and Active Listening',
      sections: [
        {
          topicSection: 'Counseling skills, client intake, rapport building, active listening, open question, empathy',
          learningObjectives: 'Use active listening and open questions to identify a client concern and helping goal.',
          learningGoals: 'Students connect client cues to observable helping responses and intake-note evidence.',
          weeklyAssessments:
            'Intake note with client context, stated concern, active-listening transcript, empathy evidence, boundary note, and helping response decision.',
          asyncActivities:
            'Watch an intake clip and code open questions, reflections, empathy statements, and missed client cues.',
          syncActivities:
            'Helping-skills role-play with client scenario, observation coding, supervision feedback, and revised response.',
          supportingResources: 'Intake-note model; active-listening checklist; client scenario packet',
          evaluateDesign:
            'Score client cue recognition, helping response fit, observation evidence, boundary awareness, and revision quality.',
        },
      ],
    },
    {
      title: 'Week 2: Case Conceptualization, Risk, and Referral',
      sections: [
        {
          topicSection:
            'Case conceptualization, risk assessment, safety plan, mandated reporting, referral plan, supervision note',
          learningObjectives:
            'Develop a case conceptualization that includes risk cues, safety planning, and a referral rationale.',
          learningGoals: 'Students use client-interaction evidence to make ethical referral and safety decisions.',
          weeklyAssessments:
            'Case conceptualization with client goal, risk assessment, safety plan, ethics boundary, referral rationale, supervision feedback, and revised helping response decision.',
          asyncActivities: 'Review a case vignette and flag risk, safety, boundary, and referral cues before class.',
          syncActivities:
            'Case conference with risk review, referral comparison, supervision question, and service-plan revision.',
          supportingResources: 'Risk-screening guide; safety-plan template; referral decision chart',
          evaluateDesign:
            'Assess risk recognition, ethics boundary, referral fit, supervision uptake, and helping decision quality.',
        },
      ],
    },
  ],
});

describe('courseBlueprintCompiler', () => {
  beforeEach(() => {
    customDeliverables = {};
  });

  it('decodes biology laboratory artifacts as lab reports instead of generic analysis logs', () => {
    const blueprint = buildCourseBlueprint(makeBiologyLabCourseMap(), {
      enrichment: {
        source: 'test-lab-enrichment',
        lens: {
          domain: 'biology laboratory methods',
          evidenceNoun: 'lab evidence',
          decisionNoun: 'experimental decision',
          learnerRole: 'laboratory student',
          exampleNoun: 'wet-lab scenario',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('applied-lab');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(['lab-report', 'lab-report']);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('lab notebook entry'),
      evidenceRequirement: expect.stringContaining('safety or protocol check'),
      reviewProtocol: expect.stringContaining('inspect the notebook evidence or data table'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Lab report and notebook entry',
      artifactGenre: expect.objectContaining({ genre: 'lab-report' }),
      expectedSubmissionFormat: expect.stringContaining('data table'),
      artifactGenreReviewProtocol: expect.stringContaining('protocol step'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Lab Evidence Clinic',
      artifactGenre: expect.objectContaining({ genre: 'lab-report' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('protocol trace'),
        reviewFocus: expect.stringContaining('data integrity'),
      }),
    });
  });

  it('keeps full research-methods courses in applied-lab when later lessons mention tests and portfolios', () => {
    const sourceCourseMap = DEFAULT_AUDIT_PROJECTS[0].courseMap;
    const blueprint = buildCourseBlueprint({
      ...sourceCourseMap,
      lessons: sourceCourseMap.lessons.slice(0, 14),
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('applied-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('lecture-exam');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('competency-based');
    expect(blueprint.courseModalityProfile.modalitySignals.labScore).toBeGreaterThan(
      blueprint.courseModalityProfile.modalitySignals.lectureExamScore,
    );
  });

  it('keeps syllabus trust surfaces compact instead of copying full internal proof maps', () => {
    const sourceCourseMap = DEFAULT_AUDIT_PROJECTS[0].courseMap;
    const blueprint = buildCourseBlueprint({
      ...sourceCourseMap,
      lessons: sourceCourseMap.lessons.slice(0, 14),
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus'], {
      enforceCompilerContract: false,
    });
    const syllabus = compiled.syllabus.syllabus;

    expect(new Set(blueprint.lessons.map((lesson) => lesson.modalityDecode.evidenceRoutine)).size).toBe(
      blueprint.lessons.length,
    );
    expect(blueprint.lessons[0].modalityDecode.evidenceRoutine).toContain('Question-quality memo');
    expect(blueprint.lessons[1].modalityDecode.evidenceRoutine).not.toBe(
      blueprint.lessons[0].modalityDecode.evidenceRoutine,
    );

    expect(syllabus.blueprintQualityReceipt.conceptDependencyGraph).toMatchObject({
      status: 'sequenced',
      nodeCount: 14,
      practiceRowCount: 14,
    });
    expect(syllabus.blueprintQualityReceipt.conceptDependencyGraph.practiceRows).toBeUndefined();
    expect(syllabus.blueprintQualityReceipt.masteryEvidenceMap.lessonRows).toBeUndefined();
    expect(syllabus.blueprintQualityReceipt.workloadBalance).toMatchObject({
      status: 'balanced',
      workloadReviewCount: 0,
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          workloadSpike: false,
        }),
      ]),
    });
    expect(syllabus.courseAtAGlance[0]).toMatchObject({
      week: 'Week 1',
      // v0.8.61 language finalizer shortens repeated artifact titles to
      // week-anchored references after their first mentions.
      readinessCue: expect.stringMatching(/Question-quality memo|Week 1 memo/),
      feedbackUse: expect.stringMatching(/next|later|discussion|synthesis|artifact/i),
      publishGate: 'instructor-spot-check-before-publish',
      // v0.15.188: the workload line now shows its breakdown (Prof catch —
      // a bare "N hours including class time" read as contradictory next to
      // the visible lesson-plan minutes).
      workload: expect.stringMatching(/hours this week \(\d+ min in class/),
    });
    expect(syllabus.courseAtAGlance[0].masteryEvidencePlan).toBeUndefined();
    expect(syllabus.courseAtAGlance[0].sourceEvidenceTrace).toBeUndefined();
    expect(syllabus.assessmentCalendar[0].criterionEvidenceMap).toBeUndefined();
    expect(syllabus.assessmentCalendar[0].criterionWeightSummary).toContain('%');
  });

  it('decodes quantitative worked artifacts as problem sets with solution tracing', () => {
    const blueprint = buildCourseBlueprint(makeQuantitativeProblemSetCourseMap(), {
      enrichment: {
        source: 'test-problem-set-enrichment',
        lens: {
          domain: 'college algebra problem solving',
          evidenceNoun: 'worked-solution evidence',
          decisionNoun: 'solution strategy decision',
          learnerRole: 'quantitative problem solver',
          exampleNoun: 'worked algebra example',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('weekly-applied-seminar');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(['problem-set', 'problem-set']);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('worked problem set'),
      evidenceRequirement: expect.stringContaining('equation or representation'),
      reviewProtocol: expect.stringContaining('trace each solution step'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Worked problem set',
      artifactGenre: expect.objectContaining({ genre: 'problem-set' }),
      expectedSubmissionFormat: expect.stringContaining('solution trace'),
      artifactGenreReviewProtocol: expect.stringContaining('corrected or verified step'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Problem-Solving Clinic',
      artifactGenre: expect.objectContaining({ genre: 'problem-set' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('step trace'),
        reviewFocus: expect.stringContaining('error analysis'),
      }),
    });

    const highDemandMap = makeQuantitativeProblemSetCourseMap();
    highDemandMap.lessons[0].sections[0].learningObjectives =
      'Evaluate two linear-equation strategies and create a verified correction for a flawed worked solution.';
    const highDemandBlueprint = buildCourseBlueprint(highDemandMap);
    expect(highDemandBlueprint.courseWorkload.workloadBalanceStatus).toBe('balanced');
    expect(highDemandBlueprint.courseWorkload.workloadReviewCount).toBe(0);
    expect(
      Math.max(...highDemandBlueprint.courseWorkload.lessonRows.map((row) => row.outOfClassMinutes)),
    ).toBeLessThanOrEqual(150);
  });

  it('decodes inferential statistics as statistics-inference instead of generic analysis logs', () => {
    const blueprint = buildCourseBlueprint(makeStatisticsInferenceCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'statistics-inference',
      sessionPattern: expect.stringContaining('statistical question framing'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('inference cycle'),
        evidenceRoutine: expect.stringContaining('confidence interval or test statistic'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('applied-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('data-science-lab');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'statistical inference',
      evidenceNoun: 'statistical evidence',
      decisionNoun: 'inference decision',
      learnerRole: 'statistical analyst',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'statistical-inference-report',
      'statistical-inference-report',
    ]);
    const statisticalQuestionMap = makeStatisticsInferenceCourseMap();
    statisticalQuestionMap.lessons = statisticalQuestionMap.lessons.map((lesson, index) =>
      index === 0
        ? {
            ...lesson,
            title: 'Week 1: Statistical Questions, Variables, and Samples',
            sections: lesson.sections.map((section) => ({
              ...section,
              topicSection: 'Statistical question, variable, parameter, population, sample, inference claim',
              weeklyAssessments:
                'Inference question memo with research question, variable or parameter, sample context, population claim, assumption note, and limitation.',
            })),
          }
        : lesson,
    );
    const statisticalQuestionBlueprint = buildCourseBlueprint(statisticalQuestionMap);
    expect(statisticalQuestionBlueprint.lessons[0].artifactGenre.genre).toBe('statistical-inference-report');
    const chiSquareMap = makeStatisticsInferenceCourseMap();
    chiSquareMap.lessons = [
      {
        title: 'Week 6: Chi-Square Tests and Association',
        sections: [
          {
            topicSection:
              'Chi-square test, categorical variables, expected counts, association, independence, assumption check',
            learningObjectives:
              'Interpret a chi-square test using expected counts, p-value, association language, and limitations.',
            learningGoals:
              'Students use categorical data to evaluate association while checking expected counts and assumptions.',
            weeklyAssessments:
              'Chi-square inference memo with contingency table, expected-count check, test statistic, p-value explanation, association conclusion, and limitation note.',
            asyncActivities: 'Inspect a contingency table and identify one expected-count or independence concern.',
            syncActivities:
              'Categorical-data clinic with expected-count check, chi-square output trace, and association-language revision.',
            supportingResources: 'Chi-square guide; contingency-table template; expected-count checklist',
            evaluateDesign:
              'Score table setup, expected-count check, p-value interpretation, association claim, and limitation note.',
          },
        ],
      },
    ];
    const chiSquareBlueprint = buildCourseBlueprint(chiSquareMap);
    expect(chiSquareBlueprint.lessons[0].artifactGenre.genre).toBe('statistical-inference-report');
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'question and assumption check',
      'statistical model demonstration',
      'guided calculation or software output',
      'interpretation and uncertainty check',
      'assumption and limitation review',
      'inference handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain('inference cycle');
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Statistical inference report',
      artifactGenre: expect.objectContaining({ genre: 'statistical-inference-report' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('confidence-interval interpretation'),
        evidenceRequirement: expect.stringContaining('sample context'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Inference Interpretation Clinic',
      modalityDecode: expect.objectContaining({ mode: 'statistics-inference' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('p-value or interval interpretation'),
        reviewFocus: expect.stringContaining('uncertainty interpretation'),
      }),
    });
  });

  it('keeps accessibility audit memos in studio courses as design prototypes', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Interaction Design Studio',
      semester: 'Fall 2026',
      learningOutcomes:
        'Frame user problems, prototype interaction flows, test usability, improve accessibility, and defend design decisions with evidence.',
      lessons: [
        {
          title: 'Week 1: Wireframes and Interaction Flows',
          sections: [
            {
              topicSection: 'Wireframes, task flow, information architecture, sketching alternatives, flow friction',
              learningObjectives:
                'Evaluate alternate wireframes against a task flow and select a testable interaction direction.',
              learningGoals: 'Students compare low-fidelity concepts and select an interaction flow for prototyping.',
              weeklyAssessments:
                'Wireframe critique packet with three alternatives, task-flow rationale, and revision target.',
              asyncActivities: 'Sketch low-fidelity alternatives and annotate flow decisions.',
              syncActivities: 'Wireframe charrette comparing interaction flow, hierarchy, and task friction.',
              supportingResources: 'Wireframe kit; task-flow examples; information architecture checklist',
              evaluateDesign: 'Score alternative breadth, task-flow fit, and rationale for the selected direction.',
            },
          ],
        },
        {
          title: 'Week 2: Accessibility Audit and Inclusive Interaction',
          sections: [
            {
              topicSection:
                'Accessibility audit, contrast, keyboard navigation, alt text, inclusive interaction patterns',
              learningObjectives:
                'Evaluate a prototype against accessibility criteria and revise interaction details for equivalent use.',
              learningGoals: 'Students audit prototypes for accessibility barriers and revise interaction details.',
              weeklyAssessments:
                'Accessibility audit memo with barriers, evidence screenshots, and inclusive revision plan.',
              asyncActivities: 'Run contrast and keyboard checks; annotate barriers in the prototype.',
              syncActivities: 'Accessibility audit studio with barrier triage and inclusive interaction revision.',
              supportingResources: 'Accessibility checklist; contrast tool guide; inclusive interaction examples',
              evaluateDesign:
                'Score audit evidence, barrier priority, equivalent-use reasoning, and revision specificity.',
            },
          ],
        },
      ],
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('studio-lab');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'design-prototype',
      'design-prototype',
    ]);
  });

  it('decodes information literacy courses as source evaluation instead of generic research synthesis', () => {
    const blueprint = buildCourseBlueprint(makeInformationLiteracyCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'information-literacy',
      sessionPattern: expect.stringContaining('database search'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('question-to-source cycle'),
        evidenceRoutine: expect.stringContaining('citation-trail note'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('applied-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('weekly-applied-seminar');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'information literacy and source research',
      evidenceNoun: 'source evidence',
      decisionNoun: 'source-use decision',
      learnerRole: 'academic researcher',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'source-evaluation-dossier',
      'source-evaluation-dossier',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'research question and need check',
      'database search model',
      'guided source retrieval',
      'credibility and relevance check',
      'synthesis and attribution review',
      'source-use handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'question-to-source cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Source evaluation dossier',
      artifactGenre: expect.objectContaining({ genre: 'source-evaluation-dossier' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('database-search strategy'),
        evidenceRequirement: expect.stringContaining('citation-trail note'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Source Evaluation Clinic',
      modalityDecode: expect.objectContaining({ mode: 'information-literacy' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('database-search trace'),
        reviewFocus: expect.stringContaining('source-use judgment'),
      }),
    });
  });

  it('decodes teacher-preparation courses as instructional practice instead of generic education writing', () => {
    const blueprint = buildCourseBlueprint(makeTeacherPreparationCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'teacher-preparation',
      sessionPattern: expect.stringContaining('microteaching rehearsal'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('lesson-study cycle'),
        evidenceRoutine: expect.stringContaining('student-work evidence'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('policy-analysis');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('competency-based');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'teacher preparation and instructional practice',
      evidenceNoun: 'classroom evidence',
      decisionNoun: 'instructional decision',
      learnerRole: 'teacher candidate',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'teaching-plan-portfolio',
      'teaching-plan-portfolio',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'standards and learning-target check',
      'teaching model or think-aloud',
      'microteaching rehearsal',
      'student work and formative evidence analysis',
      'differentiation and reteach planning',
      'lesson-plan handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain('lesson-study cycle');
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Teaching plan portfolio',
      artifactGenre: expect.objectContaining({ genre: 'teaching-plan-portfolio' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('microteaching demonstration'),
        evidenceRequirement: expect.stringContaining('student-work or formative-assessment evidence'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Microteaching Lesson Study',
      modalityDecode: expect.objectContaining({ mode: 'teacher-preparation' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('student-work analysis'),
        reviewFocus: expect.stringContaining('reteach readiness'),
      }),
    });
  });

  it('decodes counseling and social-work practice as helping-skills cases instead of generic reflection', () => {
    const blueprint = buildCourseBlueprint(makeCounselingPracticeCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'counseling-practice',
      sessionPattern: expect.stringContaining('helping-skills model'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('helping-skills cycle'),
        evidenceRoutine: expect.stringContaining('observable response language'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('clinical-simulation');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('field-applied');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'counseling and helping-skills practice',
      evidenceNoun: 'client-interaction evidence',
      decisionNoun: 'helping response decision',
      learnerRole: 'helping professional',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'case-conceptualization',
      'case-conceptualization',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'client context and goal check',
      'helping response model',
      'role-play rehearsal and observation coding',
      'ethics risk and boundary review',
      'case plan and referral decision',
      'supervision handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain('helping-skills cycle');
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Case conceptualization and helping-skills record',
      artifactGenre: expect.objectContaining({ genre: 'case-conceptualization' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('process recording'),
        evidenceRequirement: expect.stringContaining('risk/safety cue'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Helping Skills Case Conference',
      modalityDecode: expect.objectContaining({ mode: 'counseling-practice' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('observation coding'),
        reviewFocus: expect.stringContaining('referral reasoning'),
      }),
    });
  });

  it('decodes accounting and finance courses as financial analysis instead of business cases or problem sets', () => {
    const blueprint = buildCourseBlueprint(makeAccountingFinanceCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'accounting-finance-analysis',
      sessionPattern: expect.stringContaining('source document check'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('source-to-decision cycle'),
        evidenceRoutine: expect.stringContaining('statement effect'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('case-method');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('weekly-applied-seminar');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'accounting and finance analysis',
      evidenceNoun: 'financial evidence',
      decisionNoun: 'financial decision',
      learnerRole: 'financial analyst',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'financial-analysis-report',
      'financial-analysis-report',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'source document and account check',
      'financial statement or model demonstration',
      'guided calculation and classification',
      'interpretation and control check',
      'assumption variance or risk review',
      'financial decision handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'source-to-decision cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Financial analysis report',
      artifactGenre: expect.objectContaining({ genre: 'financial-analysis-report' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('journal-entry worksheet'),
        evidenceRequirement: expect.stringContaining('statement or cash-flow effect'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Financial Analysis Clinic',
      modalityDecode: expect.objectContaining({ mode: 'accounting-finance-analysis' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('account classification'),
        reviewFocus: expect.stringContaining('statement linkage'),
      }),
    });
  });

  it('decodes public policy courses as policy analysis instead of business cases or generic memos', () => {
    const blueprint = buildCourseBlueprint(makePolicyAnalysisCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'policy-analysis',
      sessionPattern: expect.stringContaining('policy option comparison'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('problem-to-policy cycle'),
        evidenceRoutine: expect.stringContaining('stakeholder/equity effect'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('case-method');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('field-applied');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'public policy analysis',
      evidenceNoun: 'policy evidence',
      decisionNoun: 'policy decision',
      learnerRole: 'policy analyst',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(['policy-brief', 'policy-brief']);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'problem and authority check',
      'policy option demonstration',
      'stakeholder and evidence mapping',
      'equity feasibility and tradeoff review',
      'implementation and risk check',
      'policy memo handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'problem-to-policy cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Policy analysis memo',
      artifactGenre: expect.objectContaining({ genre: 'policy-brief' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('policy memo'),
        evidenceRequirement: expect.stringContaining('stakeholder/equity effect'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Policy Option Clinic',
      modalityDecode: expect.objectContaining({ mode: 'policy-analysis' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('stakeholder map'),
        reviewFocus: expect.stringContaining('implementation realism'),
      }),
    });
  });

  it('adds an instructor-provided throughline across compiled social policy materials', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(2));
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'discussions', 'quizBank', 'studyGuides', 'courseFaq'],
      { enforceCompilerContract: false },
    );

    expect(blueprint.courseThroughlineContext).toMatchObject({
      projectName: 'Applied Social Policy Studio Policy Casebook',
      clientName: 'the course audience',
      sourceMode: 'instructor-provided',
    });
    expect(blueprint.courseArc.throughline).toContain('Applied Social Policy Studio Policy Casebook');
    expect(blueprint.lessons[0].throughlineCase).toMatchObject({
      projectName: 'Applied Social Policy Studio Policy Casebook',
      // v0.12.1: lesson-specific resources resolve as the evidence packet
      // instead of the unresolved placeholder.
      evidencePacket: expect.stringContaining('Case packet 1'),
    });
    expect(blueprint.lessons[0].readings[0]).toContain('Case packet 1');
    expect(blueprint.lessons[0].studentArtifact).toBe('Policy memo checkpoint 1');

    expect(compiled.lessonPlans.lessonPlans[0].materials.join(' ')).toContain('Case packet 1');
    expect(compiled.slideDecks.decks[0].slides.flatMap((slide) => slide.bullets).join(' ')).toContain('Case packet 1');
    expect(compiled.assignments.assignments[0].sourceUsePlan.approvedSources[0]).toMatch(
      /Case packet|Instructor-provided|the Lesson 1 materials/,
    );
    expect(compiled.rubrics.rubrics[0].criteria[0].evidenceSignal).toMatch(
      /Case packet|Instructor-provided|the Lesson 1 materials/,
    );
    expect(compiled.discussions.discussions[0].sourceArtifacts[0].locator).toMatch(
      /Case packet|Instructor-provided|[Tt]he Lesson 1 materials/,
    );
    expect(compiled.quizBank.quizzes[0].questions.map((question) => question.sampleAnswer || '').join(' ')).toMatch(
      /Case packet|Instructor-provided|[Tt]he Lesson 1 materials/,
    );
    const repeatedOptionGroups = compiled.quizBank.quizzes.flatMap((quiz, quizIndex) => {
      const groups = new Map();
      quiz.questions
        .filter((question) => question.type === 'multiple_choice')
        .flatMap((question) => question.options || [])
        .forEach((option) => {
          const key = option
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          groups.set(key, (groups.get(key) || 0) + 1);
        });
      return [...groups.entries()]
        .filter(([, count]) => count > 2)
        .map(([text, count]) => ({ quizIndex, text, count }));
    });
    expect(repeatedOptionGroups).toEqual([]);
    expect(compiled.studyGuides.studyGuides[0].sourceGrounding.throughlineCase.projectName).toContain(
      'Applied Social Policy Studio',
    );
    expect(compiled.courseFaq.faqs[0].qs.map((item) => item.an).join(' ')).toMatch(
      /Case packet|Instructor-provided|[Tt]he Lesson 1 materials/,
    );
  });

  it('decodes economics courses as market analysis instead of lecture-exam, policy, or problem sets', () => {
    const blueprint = buildCourseBlueprint(makeEconomicsAnalysisCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'economics-analysis',
      sessionPattern: expect.stringContaining('economic question framing'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('model-to-decision cycle'),
        evidenceRoutine: expect.stringContaining('welfare or distributional implication'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('lecture-exam');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('policy-analysis');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('weekly-applied-seminar');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'economics analysis',
      evidenceNoun: 'economic evidence',
      decisionNoun: 'economic decision',
      learnerRole: 'economic analyst',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'economic-analysis-brief',
      'economic-analysis-brief',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'economic question and market check',
      'economic model demonstration',
      'comparative statics or calculation build',
      'welfare incentive and assumption review',
      'market failure or policy-effect check',
      'economic analysis handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'model-to-decision cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Economic analysis brief',
      artifactGenre: expect.objectContaining({ genre: 'economic-analysis-brief' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('supply-demand diagram'),
        evidenceRequirement: expect.stringContaining('incentive or welfare effect'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Economic Model Clinic',
      modalityDecode: expect.objectContaining({ mode: 'economics-analysis' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('comparative-static challenge'),
        reviewFocus: expect.stringContaining('welfare or distributional effect'),
      }),
    });
  });

  it('decodes ethics courses as argumentation instead of legal, policy, or generic humanities memos', () => {
    const blueprint = buildCourseBlueprint(makeEthicsArgumentCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'ethics-argumentation',
      sessionPattern: expect.stringContaining('ethical issue framing'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('argument-to-judgment cycle'),
        evidenceRoutine: expect.stringContaining('objection'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('legal-doctrinal');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('policy-analysis');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('interpretive-humanities');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'ethics argumentation',
      evidenceNoun: 'moral argument evidence',
      decisionNoun: 'moral decision',
      learnerRole: 'ethical reasoner',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'ethical-argument-brief',
      'ethical-argument-brief',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'ethical issue and stakeholder check',
      'normative framework model',
      'argument map construction',
      'objection reply and case pressure',
      'application and judgment review',
      'ethical argument handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'argument-to-judgment cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Ethical argument brief',
      artifactGenre: expect.objectContaining({ genre: 'ethical-argument-brief' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('argument map'),
        evidenceRequirement: expect.stringContaining('normative framework'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Ethical Argument Seminar',
      modalityDecode: expect.objectContaining({ mode: 'ethics-argumentation' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('objection and reply'),
        reviewFocus: expect.stringContaining('moral decision quality'),
      }),
    });
  });

  it('decodes proof-based mathematics as theorem proof seminars instead of generic problem sets', () => {
    const blueprint = buildCourseBlueprint(makeProofSeminarCourseMap(), {
      enrichment: {
        source: 'test-proof-seminar-enrichment',
        lens: {
          domain: 'proof-based mathematics seminar',
          evidenceNoun: 'proof evidence',
          decisionNoun: 'proof-strategy decision',
          learnerRole: 'mathematical proof writer',
          exampleNoun: 'theorem proof scenario',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'assignments', 'discussions', 'quizBank'],
      {
        enforceCompilerContract: false,
      },
    );

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'proof-seminar',
      sessionPattern: expect.stringContaining('theorem modeling'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('theorem-to-proof cycle'),
        evidenceRoutine: expect.stringContaining('justified steps'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('weekly-applied-seminar');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'proof-based mathematics seminar',
      evidenceNoun: 'proof evidence',
      decisionNoun: 'proof-strategy decision',
      learnerRole: 'mathematical proof writer',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'proof-portfolio',
      'proof-portfolio',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'definition and prerequisite check',
      'theorem model and proof strategy',
      'guided proof construction',
      'counterexample or edge-case test',
      'proof critique and revision',
      'proof portfolio handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'theorem-to-proof cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Proof portfolio and theorem justification',
      artifactGenre: expect.objectContaining({ genre: 'proof-portfolio' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('theorem proof'),
        evidenceRequirement: expect.stringContaining('precise definition'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Proof Clinic',
      modalityDecode: expect.objectContaining({ mode: 'proof-seminar' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('proof-strategy comparison'),
        reviewFocus: expect.stringContaining('logical validity'),
      }),
    });
    const quizSampleAnswers = compiled.quizBank.quizzes
      .flatMap((quiz) => quiz.questions.map((question) => question.sampleAnswer || ''))
      .join(' ');
    expect(quizSampleAnswers).toContain('exact source detail');
    expect(quizSampleAnswers).not.toMatch(/\bproof packet\b/i);
  });

  it('decodes lecture exam courses into retrieval and misconception repair checkpoints', () => {
    const blueprint = buildCourseBlueprint(makeLectureExamCourseMap(), {
      enrichment: {
        source: 'test-lecture-exam-enrichment',
        lens: {
          domain: 'introductory psychology lecture',
          evidenceNoun: 'concept-check evidence',
          decisionNoun: 'exam-readiness decision',
          learnerRole: 'conceptual learner',
          exampleNoun: 'lecture concept example',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('lecture-exam');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'checkpoint-response',
      'checkpoint-response',
    ]);
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'retrieval warm-up',
      'focused concept model',
      'guided concept check',
      'misconception repair',
      'exam-style transfer practice',
      'study-guide handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].classSessionPlan.deliveryMode).toBe('live-or-blended-class-session');
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Checkpoint response',
      artifactGenre: expect.objectContaining({ genre: 'checkpoint-response' }),
      expectedSubmissionFormat: expect.stringContaining('quiz response'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Exam Readiness Clinic',
      modalityDecode: expect.objectContaining({ mode: 'lecture-exam' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('wrong-answer sort'),
        reviewFocus: expect.stringContaining('exam-transfer readiness'),
      }),
    });
  });

  it('keeps article-led discussion concepts grammatical in peer and review text', () => {
    const courseMap = {
      courseName: 'User Experience Design Studio',
      semester: 'Fall 2026',
      lessons: Array.from({ length: 10 }, (_, index) => {
        const lessonNumber = index + 1;
        const isTargetLesson = lessonNumber === 10;
        const topic = isTargetLesson ? 'the logic of A/B testing' : `UX research concept ${lessonNumber}`;
        return {
          title: isTargetLesson ? 'Lesson 10: A/B testing' : `Lesson ${lessonNumber}: UX Studio Topic ${lessonNumber}`,
          sections: [
            {
              topicSection: topic,
              learningObjectives: `Explain the key ideas in ${topic} and apply them in a design decision.`,
              learningGoals: `Use ${topic} to improve a UX artifact.`,
              weeklyAssessments: isTargetLesson
                ? 'A/B testing uncertainty note'
                : `UX artifact critique ${lessonNumber}`,
              asyncActivities: `Review assigned materials and prepare notes on ${topic}.`,
              syncActivities: `Discuss examples and practice applying ${topic}.`,
              supportingResources: `Design journal; critique notes; ${topic} example`,
              evaluateDesign: `Score evidence use, design reasoning, and revision quality for ${topic}.`,
            },
          ],
        };
      }),
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'test-ux-discussion-grammar',
        lens: {
          domain: 'interaction design studio',
          evidenceNoun: 'prototype evidence',
          decisionNoun: 'design decision',
          learnerRole: 'studio designer',
          exampleNoun: 'studio critique case',
        },
      },
    });
    blueprint.lessons[9].keyConcepts = ['the logic of A/B testing'];
    blueprint.lessons[9].studentArtifact = 'A/B testing uncertainty note';

    const compiled = compileBlueprintDeliverables(blueprint, ['discussions'], {
      enforceCompilerContract: false,
    });
    const targetDiscussion = compiled.discussions.discussions[9];
    const text = [
      targetDiscussion.guidelines,
      ...(targetDiscussion.responseStems || []),
      ...(targetDiscussion.evaluationCriteria || []),
    ].join(' ');

    expect(text).toContain('claim about the logic of A/B testing');
    expect(text).toContain('name one uncertainty in the logic of A/B testing worth testing');
    expect(text).not.toMatch(/\bname one the logic/i);
    expect(text).not.toMatch(/\btheir the logic/i);
    expect(text).not.toMatch(/\bevidence-backed the logic/i);
    expect(text).not.toMatch(/\bthis the logic/i);
    expect(text).not.toMatch(/\bthe the logic/i);
  });

  it('varies UX assignment critique instructions instead of repeating the before-after scaffold', () => {
    const topics = [
      ['Design studio introduction', 'design journals'],
      ['User research interviews', 'interview plan'],
      ['Personas', 'persona brief'],
      ['Journey mapping', 'journey map'],
      ['Information architecture', 'site map'],
      ['Wireframing', 'wireframe critique'],
      ['Prototyping', 'prototype rationale'],
      ['Usability testing', 'test plan'],
      ['Accessibility review', 'accessibility notes'],
      ['A/B testing', 'experiment summary'],
      ['Portfolio case study', 'case study draft'],
      ['Final UX design presentation', 'presentation deck'],
    ];
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'User Experience Design Studio',
        semester: 'Fall 2026',
        lessons: topics.map(([topic, artifact], index) => ({
          title: `Lesson ${index + 1}: ${topic}`,
          sections: [
            {
              topicSection: topic,
              learningGoals: `Use ${topic} evidence to improve a UX design artifact.`,
              learningObjectives: `Explain ${topic} and apply it to a UX design decision.`,
              weeklyAssessments: artifact,
              asyncActivities: `Review assigned UX examples and prepare critique notes on ${topic}.`,
              syncActivities: `Studio critique and practice applying ${topic}.`,
              supportingResources: 'UX example packet; critique protocol; design artifact template',
              evaluateDesign: `Score evidence, reasoning, limitation, and revision quality for ${artifact}.`,
            },
          ],
        })),
      },
      {
        enrichment: {
          source: 'test-ux-assignment-texture',
          lens: {
            domain: 'UX design studio',
            evidenceNoun: 'research evidence',
            decisionNoun: 'design decision',
            learnerRole: 'studio designer',
            exampleNoun: 'critique case',
          },
        },
      },
    );

    blueprint.lessons.forEach((lesson) => {
      const focus = lesson.title.replace(/^Lesson \d+:\s*/, '');
      lesson.artifactGenre = {
        ...(lesson.artifactGenre || {}),
        genre: 'design-prototype',
        label: 'Prototype design artifact',
        reviewProtocol: `compare the before/after artifact, inspect critique evidence, and require one named next iteration for ${focus}`,
      };
      lesson.evidencePlan = {
        ...(lesson.evidencePlan || {}),
        limitationCue: `Name one limitation, assumption, or boundary condition before applying ${focus}`,
      };
      if (lesson.lessonNumber === 11) {
        lesson.enrichment = {
          ...(lesson.enrichment || {}),
          assignmentCore: {
            taskDescription: 'Build a portfolio-ready case study from the project story and critique evidence.',
            parameters: ['1 project story', '3-5 sections', 'Use concise captions', 'Include process and outcome'],
          },
        };
      }
    });

    const compiled = compileBlueprintDeliverables(blueprint, ['assignments'], {
      enforceCompilerContract: false,
    });
    const assignmentTexts = compiled.assignments.assignments.map((assignment) =>
      [
        assignment.expectedSubmissionFormat,
        ...(assignment.instructions || []),
        assignment.formatRequirements?.reviewProtocol,
      ].join(' '),
    );
    const countDocumentsWith = (pattern) => assignmentTexts.filter((text) => pattern.test(text)).length;
    const texture = computeTexture(
      assignmentTexts.map((text, index) => ({ id: `assignment-${index}`, feature: 'assignments', text })),
    );
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');

    expect(assignmentTexts.join(' ')).not.toMatch(/compare the before\/after artifact/i);
    expect(assignmentTexts.join(' ')).not.toMatch(/\b\d+(?:-\d+)? sections\b/i);
    expect(assignmentTexts.join(' ')).toMatch(/\b3-5 labeled parts\b/i);
    expect(countDocumentsWith(/review the materials for .* identify the central problem or decision/i)).toBeLessThan(4);
    expect(countDocumentsWith(/select specific research evidence from course readings/i)).toBeLessThan(4);
    expect(countDocumentsWith(/name one limitation, assumption, or boundary condition before applying/i)).toBeLessThan(
      4,
    );
    expect(evidence).not.toMatch(/after artifact inspect critique evidence and require/i);
  });

  it('scrubs stale notebook and model-card slide metadata from non-data UX courses', () => {
    const courseMap = {
      courseName: 'User Experience Design Studio',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: Design systems',
          sections: [
            {
              topicSection: 'Design systems, component states, critique evidence',
              learningGoals: 'Use design-system evidence to improve a UX artifact.',
              learningObjectives: 'Analyze component consistency and justify one design-system revision.',
              weeklyAssessments: 'Design-system critique note',
              asyncActivities: 'Review assigned UX examples and annotate design-system evidence.',
              syncActivities: 'Studio critique comparing component states and accessibility choices.',
              supportingResources: 'Design-system examples; critique protocol; component-state checklist',
              evaluateDesign: 'Score evidence, accessibility reasoning, limitation, and revision quality.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'test-ux-slide-domain-scrub',
        lens: {
          domain: 'UX design studio',
          evidenceNoun: 'critique evidence',
          decisionNoun: 'design-system decision',
          learnerRole: 'studio designer',
          exampleNoun: 'component critique',
        },
      },
    });
    blueprint.lessons[0].artifactGenre = {
      genre: 'data-science-notebook',
      label: 'Data science notebook',
      reviewProtocol: 'inspect the Jupyter notebook, starter notebook, and model-card limitation before revision',
      commonFailure: 'The model card does not justify the notebook output.',
      revisionMove: 'Update the model-card note and rerun the IPYNB evidence check.',
    };
    blueprint.lessons[0].outcomes = [
      'Inspect the Jupyter notebook and model-card evidence before revising the design-system critique note.',
    ];

    const ir = buildSlideDeckIntermediateRepresentation(blueprint);
    const irText = JSON.stringify(ir);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const compiledText = JSON.stringify(compiled.slideDecks);
    const findings = validateSemanticContentQuality(courseMap, compiled);

    expect(blueprint.courseModalityProfile.primaryMode).toBe('studio-lab');
    expect(irText).not.toMatch(/\b(?:Jupyter|IPYNB|starter notebook|model[-\s]card|data-science-notebook)\b/i);
    expect(irText).toMatch(/\breview note\b/i);
    expect(compiledText).not.toMatch(/\b(?:Jupyter|IPYNB|starter notebook|model[-\s]card|data-science-notebook)\b/i);
    expect(findings.map((finding) => finding.id)).not.toContain('semantic-nonml-lab-assets');
  });

  it('varies UX lesson-plan, discussion, and slide texture frames from the v0.15.101 audit', () => {
    const topics = [
      ['Course overview', 'course overview evidence note'],
      ['Design journals', 'design journal critique'],
      ['User research interviews', 'interview plan'],
      ['Personas', 'persona brief'],
      ['Journey mapping', 'journey map'],
      ['Information architecture', 'site map'],
      ['Wireframing', 'wireframe critique'],
      ['Prototyping', 'prototype rationale'],
      ['Usability testing', 'test plan'],
      ['Accessibility reviews', 'accessibility notes'],
      ['Design systems', 'design-system review'],
      ['Portfolio case studies', 'case study draft'],
    ];
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'User Experience Design Studio',
        semester: 'Fall 2026',
        lessons: topics.map(([topic, artifact], index) => ({
          title: `Lesson ${index + 1}: ${topic}`,
          sections: [
            {
              topicSection: `${topic}; ${artifact}; critique evidence`,
              learningGoals: `Use ${topic} evidence to improve a UX design artifact.`,
              learningObjectives: `Explain ${topic} and apply it to a UX design decision.`,
              weeklyAssessments: artifact,
              asyncActivities: `Review assigned UX examples and prepare critique notes on ${topic}.`,
              syncActivities: `Studio critique and practice applying ${topic}.`,
              supportingResources: 'UX example packet; critique protocol; design artifact template',
              evaluateDesign: `Score evidence, reasoning, limitation, and revision quality for ${artifact}.`,
            },
          ],
        })),
      },
      {
        enrichment: {
          source: 'test-ux-v015101-texture',
          lens: {
            domain: 'UX design studio',
            evidenceNoun: 'research evidence',
            decisionNoun: 'design decision',
            learnerRole: 'studio designer',
            exampleNoun: 'critique case',
          },
        },
      },
    );
    blueprint.lessons.forEach((lesson, index) => {
      const focus = lesson.title.replace(/^Lesson \d+:\s*/, '');
      lesson.evidencePlan = {
        ...(lesson.evidencePlan || {}),
        sourceCue: `UX research packet for ${focus}`,
      };
      lesson.artifactGenre = {
        ...(lesson.artifactGenre || {}),
        genre: 'design-prototype',
        label: 'Prototype design artifact',
      };
      lesson.enrichment = {
        ...(lesson.enrichment || {}),
        keyTerms: [
          {
            term: lesson.keyConcepts?.[0] || focus,
            definition: `${focus} turns observed user evidence into a defensible design move.`,
            misconception: `Students may treat ${focus} as a label instead of evidence for the design choice.`,
            correction: `The ${focus} evidence must justify one visible change in the artifact.`,
          },
          {
            term: lesson.keyConcepts?.[1] || `${focus} evidence`,
            definition: `${focus} evidence names what users did, said, or could not complete.`,
            misconception: `Students may rely on preference language without linking it to ${focus} evidence.`,
            correction: `A credible critique ties preference language to a user action or accessibility cue.`,
          },
        ],
        conceptProvenance: { citations: [`UX research packet ${index + 1}`] },
      };
    });

    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'discussions', 'studyGuides'],
      {
        configMap: { lessonPlans: { depth: 'deep' } },
        enforceCompilerContract: false,
      },
    );
    const planTexts = compiled.lessonPlans.lessonPlans.map((plan) =>
      plan.outline.map((item) => `${item.description || ''} ${item.instructorNotes || ''}`).join(' '),
    );
    const deckTexts = compiled.slideDecks.decks.map((deck) =>
      deck.slides
        .map((slide) => `${slide.title || ''} ${(slide.bullets || []).join(' ')} ${slide.notes || ''}`)
        .join(' '),
    );
    const discussionTexts = compiled.discussions.discussions.map((discussion) =>
      [
        discussion.prompt,
        discussion.guidelines,
        discussion.discussionProtocol?.participationPattern,
        discussion.discussionProtocol?.facilitationMove,
        discussion.equityConsiderations,
        ...(discussion.artifactsToReview || []).map((artifact) => `${artifact.title || ''} ${artifact.use || ''}`),
        ...(discussion.followUpProbes || []),
        ...(discussion.evaluationCriteria || []),
        discussion.facilitationTips?.opening,
        discussion.facilitationTips?.closure,
      ].join(' '),
    );
    const assignmentTexts = compiled.assignments.assignments.map((assignment) =>
      [
        assignment.summary,
        assignment.academicIntegrityStatement,
        assignment.formatRequirements?.latePolicy,
        ...(assignment.milestones || []).map((milestone) =>
          [milestone.milestone, milestone.description, milestone.feedback, ...(milestone.uploadChecklist || [])].join(
            ' ',
          ),
        ),
      ].join(' '),
    );
    const rubricTexts = compiled.rubrics.rubrics.map((rubric) =>
      [
        rubric.instructorFacilitationNote,
        rubric.assessmentValidity?.calibrationCheck,
        rubric.gradingCalibrationPlan?.scorerNorming,
        rubric.gradingCalibrationPlan?.anchorComparison,
        rubric.anchorExamples?.scoringRationale,
        rubric.anchorExamples?.revisionPrompt,
      ].join(' '),
    );
    const studyGuideTexts = compiled.studyGuides.studyGuides.map((guide) =>
      [
        guide.summary,
        ...(guide.reviewQuestions || []).map((item) => `${item.question || ''} ${item.hint || ''}`),
        ...(guide.practiceActivities || []),
        guide.examPrep?.reviewStrategy,
      ].join(' '),
    );
    const allTexts = [
      ...planTexts.map((text, index) => ({ id: `plan-${index}`, feature: 'lessonPlans', text })),
      ...deckTexts.map((text, index) => ({ id: `deck-${index}`, feature: 'slideDecks', text })),
      ...assignmentTexts.map((text, index) => ({ id: `assignment-${index}`, feature: 'assignments', text })),
      ...rubricTexts.map((text, index) => ({ id: `rubric-${index}`, feature: 'rubrics', text })),
      ...discussionTexts.map((text, index) => ({ id: `discussion-${index}`, feature: 'discussions', text })),
      ...studyGuideTexts.map((text, index) => ({ id: `guide-${index}`, feature: 'studyGuides', text })),
    ];
    const countDocsWith = (texts, pattern) => texts.filter((text) => pattern.test(text)).length;

    expect(countDocsWith(planTexts, /show one line of reasoning students should reuse/i)).toBe(0);
    expect(countDocsWith(discussionTexts, /proposed decision would hold up in assessed work/i)).toBe(0);
    expect(countDocsWith(deckTexts, /quick true\/false vote before revealing the corrective/i)).toBe(0);
    expect(countDocsWith(deckTexts, /objectives as vocabulary only, restate them as decisions/i)).toBe(0);
    expect(countDocsWith(deckTexts, /now feels strongest for/i)).toBe(0);
    expect(countDocsWith(deckTexts, /ask which prior move already supports the criterion/i)).toBe(0);
    expect(countDocsWith(deckTexts, /avoid vague homework language/i)).toBe(0);
    expect(countDocsWith(discussionTexts, /speak or post at least twice/i)).toBe(0);
    expect(countDocsWith(deckTexts, /changes the design decision students will make/i)).toBeLessThan(4);
    expect(
      countDocsWith(assignmentTexts, /follow the course late work policy and contact the instructor before/i),
    ).toBeLessThan(4);
    expect(countDocsWith(rubricTexts, /rubric before students draft, then use criterion-level feedback/i)).toBeLessThan(
      4,
    );
    expect(countDocsWith(rubricTexts, /audience language makes the .* evidence harder to follow/i)).toBe(0);
    expect(countDocsWith(rubricTexts, /the stronger sample should cite/i)).toBeLessThan(4);
    expect(countDocsWith(studyGuideTexts, /one .* evidence source, and one implication for/i)).toBeLessThan(4);
    expect(countDocsWith(discussionTexts, /artifact walk-through, critique notes, revision commitment/i)).toBeLessThan(
      4,
    );
    expect(
      countDocsWith(discussionTexts, /wait time, written or spoken response options, and sentence frames/i),
    ).toBeLessThan(4);
    expect(
      countDocsWith(discussionTexts, /written or spoken response options, and sentence frames so students can cite/i),
    ).toBeLessThan(4);
    expect(countDocsWith(deckTexts, /readiness checklist.*confirm the feedback action/i)).toBe(0);
    expect(countDocsWith(deckTexts, /circulate for whether pairs can point to one concrete/i)).toBe(0);
    expect(countDocsWith(studyGuideTexts, /cite evidence, and explain why it matters/i)).toBeLessThan(4);

    const texture = computeTexture(allTexts);
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');
    expect(evidence).not.toMatch(/show one line of reasoning students should reuse/i);
    expect(evidence).not.toMatch(/proposed decision would hold up/i);
    expect(evidence).not.toMatch(/quick true false vote before revealing the corrective/i);
    expect(evidence).not.toMatch(/objectives as vocabulary only restate them as decisions/i);
    expect(evidence).not.toMatch(/now feels strongest for/i);
    expect(evidence).not.toMatch(/prior move already supports the criterion/i);
    expect(evidence).not.toMatch(/vague homework language/i);
    expect(evidence).not.toMatch(/speak or post at least twice/i);
    expect(evidence).not.toMatch(/changes the design decision students will make/i);
    expect(evidence).not.toMatch(/and usability evidence source and one implication for the week .* assessment/i);
    expect(evidence).not.toMatch(/assessment follow the course late work policy and contact the instructor before/i);
    expect(evidence).not.toMatch(/assessment rubric before students draft then use criterion-level feedback/i);
    expect(evidence).not.toMatch(/audience language makes the user evidence harder to follow/i);
    expect(evidence).not.toMatch(/criterion-level feedback that names the strongest evidence move/i);
    expect(evidence).not.toMatch(/critique a visible prototype or design artifact then revise one concrete element/i);
    expect(evidence).not.toMatch(/and one partial week .* assessment sample the stronger sample should cite/i);
    expect(evidence).not.toMatch(
      /assessment then name the protocol artifact walk-through critique notes revision commitment/i,
    );
    expect(evidence).not.toMatch(/time written or spoken response options and sentence frames so students can/i);
    expect(evidence).not.toMatch(/written or spoken response options and sentence frames so students can cite/i);
    expect(evidence).not.toMatch(/readiness checklist readiness checklist confirm the feedback action/i);
    expect(evidence).not.toMatch(/circulate for whether pairs can point to one concrete/i);
    expect(evidence).not.toMatch(/cite evidence and explain why it matters/i);
  });

  it('varies lecture-exam slide and lesson-plan texture instead of repeating compiler tails', () => {
    const blueprint = buildCourseBlueprint(makeFourLessonLectureExamCourseMap(), {
      enrichment: {
        source: 'test-lecture-exam-texture-enrichment',
        lens: {
          domain: 'introductory psychology lecture',
          evidenceNoun: 'concept-check evidence',
          decisionNoun: 'exam-readiness decision',
          learnerRole: 'conceptual learner',
          exampleNoun: 'lecture concept example',
        },
      },
    });
    blueprint.lessons.forEach((lesson, index) => {
      lesson.enrichment = {
        ...(lesson.enrichment || {}),
        keyTerms: [
          {
            term: lesson.keyConcepts[0] || `concept ${index + 1}`,
            definition: `A usable definition for ${lesson.title}.`,
            misconception: `Students may treat ${lesson.keyConcepts[0] || 'the concept'} as memorized vocabulary only.`,
            correction: `The concept has to explain a specific answer choice or exam transfer move.`,
          },
        ],
        conceptProvenance: { citations: [`OpenStax Psychology chapter ${index + 1}`] },
      };
    });

    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'discussions', 'studyGuides', 'courseFaq'],
      {
        configMap: { lessonPlans: { depth: 'deep' } },
        enforceCompilerContract: false,
      },
    );
    const deckTexts = compiled.slideDecks.decks.map((deck) =>
      deck.slides
        .map((slide) => `${slide.title || ''} ${(slide.bullets || []).join(' ')} ${slide.notes || ''}`)
        .join(' '),
    );
    const planTexts = compiled.lessonPlans.lessonPlans.map((plan) =>
      plan.outline.map((item) => `${item.description || ''} ${item.instructorNotes || ''}`).join(' '),
    );
    const studyGuideTexts = compiled.studyGuides.studyGuides.map((guide) =>
      [
        guide.summary,
        ...(guide.reviewQuestions || []).map((item) => `${item.question || ''} ${item.hint || ''}`),
        ...(guide.practiceActivities || []),
        guide.examPrep?.reviewStrategy,
      ].join(' '),
    );
    const faqTexts = compiled.courseFaq.faqs.map((faq) =>
      (faq.qs || []).map((item) => `${item.q || ''} ${item.an || ''}`).join(' '),
    );
    const assignmentTexts = compiled.assignments.assignments.map((assignment) =>
      [
        assignment.summary,
        assignment.academicIntegrityStatement,
        assignment.formatRequirements?.latePolicy,
        assignment.formatRequirements?.citationStyle,
        ...(assignment.milestones || []).map((milestone) =>
          [milestone.milestone, milestone.description, milestone.feedback, ...(milestone.uploadChecklist || [])].join(
            ' ',
          ),
        ),
      ].join(' '),
    );
    const rubricTexts = compiled.rubrics.rubrics.map((rubric) =>
      [
        rubric.instructorFacilitationNote,
        rubric.assessmentValidity?.calibrationCheck,
        rubric.gradingCalibrationPlan?.scorerNorming,
        rubric.gradingCalibrationPlan?.anchorComparison,
        rubric.anchorExamples?.scoringRationale,
        rubric.anchorExamples?.revisionPrompt,
      ].join(' '),
    );
    const discussionTexts = compiled.discussions.discussions.map((discussion) =>
      [
        discussion.prompt,
        discussion.guidelines,
        discussion.discussionProtocol?.participationPattern,
        discussion.discussionProtocol?.facilitationMove,
        ...(discussion.followUpProbes || []),
        ...(discussion.evaluationCriteria || []),
        discussion.facilitationTips?.opening,
        discussion.facilitationTips?.closure,
        discussion.facilitationGuide?.openingMove,
        discussion.facilitationGuide?.evidencePush,
        discussion.facilitationGuide?.closureMove,
      ].join(' '),
    );
    const countDecksWith = (pattern) => deckTexts.filter((text) => pattern.test(text)).length;
    const countPlansWith = (pattern) => planTexts.filter((text) => pattern.test(text)).length;
    const countStudyGuidesWith = (pattern) => studyGuideTexts.filter((text) => pattern.test(text)).length;
    const countFaqsWith = (pattern) => faqTexts.filter((text) => pattern.test(text)).length;
    const countAssignmentsWith = (pattern) => assignmentTexts.filter((text) => pattern.test(text)).length;
    const countRubricsWith = (pattern) => rubricTexts.filter((text) => pattern.test(text)).length;
    const countDiscussionsWith = (pattern) => discussionTexts.filter((text) => pattern.test(text)).length;

    expect(countDecksWith(/with a peer before deciding what/i)).toBe(0);
    expect(
      countDecksWith(/retrieval-to-exam practice cycle where students answer, explain, diagnose, and correct/i),
    ).toBe(0);
    expect(
      countDecksWith(/Give students a short work window to revise .* with a partner before the debrief/i),
    ).toBeLessThan(4);
    expect(countDecksWith(/what it reveals about .* and what it does not prove/i)).toBeLessThan(4);
    expect(countDecksWith(/too early, bring them back to what the .* example actually shows/i)).toBeLessThan(4);
    expect(countPlansWith(/A secure ticket restates the correction in the student.s own words/i)).toBeLessThan(4);
    expect(countPlansWith(/Conference against the kernel bar for .* redirect drafts drifting toward/i)).toBeLessThan(4);
    expect(
      countStudyGuidesWith(/Name one observation that backs the claim and connect it to the method decision/i),
    ).toBe(0);
    expect(
      countFaqsWith(/concept accuracy, retrieval strength, explanation quality, and readiness for the next artifact/i),
    ).toBeLessThan(4);
    expect(
      countDecksWith(/against live .* evidence for .*Clarify that preparation, practice, and debrief/i),
    ).toBeLessThan(4);
    expect(countDecksWith(/all support .* rather than disconnected tasks. Use the agenda/i)).toBeLessThan(4);
    expect(countAssignmentsWith(/AI use when it contributes to the submission. Do not invent authors/i)).toBeLessThan(
      4,
    );
    expect(countAssignmentsWith(/follow the course late work policy and contact the instructor before/i)).toBeLessThan(
      4,
    );
    expect(countRubricsWith(/rubric before students draft, then use criterion-level feedback/i)).toBeLessThan(4);
    expect(countRubricsWith(/audience language makes .* evidence harder to follow/i)).toBe(0);
    expect(countRubricsWith(/the stronger sample should cite/i)).toBeLessThan(4);
    expect(countStudyGuidesWith(/one .* evidence source, and one implication for/i)).toBeLessThan(4);
    expect(countDiscussionsWith(/artifact walk-through, critique notes, revision commitment/i)).toBeLessThan(4);
    expect(countAssignmentsWith(/\bIntegrity for the Week \d+ transfer means/i)).toBe(0);
    expect(
      countDiscussionsWith(
        /alternative participation mode, use the instructor-approved written or chat response option/i,
      ),
    ).toBeLessThan(4);
    expect(
      countDiscussionsWith(/Which alternative reading of the same evidence about .* would challenge your claim/i),
    ).toBeLessThan(4);
    expect(countDiscussionsWith(/whether you name a limitation or revision move tied to/i)).toBeLessThan(4);
    expect(countDecksWith(/Students should be able to name the .* decision the product will capture/i)).toBeLessThan(4);
    expect(
      countDecksWith(/Prevent compartmentalized thinking by showing how today.s .* revision changes/i),
    ).toBeLessThan(4);
    expect(countPlansWith(/Students identify which evidence, assumptions, and constraints matter most/i)).toBeLessThan(
      4,
    );
    expect(countPlansWith(/Activate prior knowledge and focus students on the central .* decision/i)).toBeLessThan(4);
    expect(countPlansWith(/not only topic recall/i)).toBeLessThan(4);
    expect(countPlansWith(/Independent artifact sprint/i)).toBeLessThan(4);
    expect(countPlansWith(/Debrief and exit ticket/i)).toBeLessThan(4);
    expect(countPlansWith(/take a position on the lesson.s live question/i)).toBeLessThan(4);
    expect(countPlansWith(/Course site agenda and lesson handout/i)).toBe(0);
    expect(countDecksWith(/practice workflow/i)).toBeLessThan(4);
    expect(countDecksWith(/what check would catch it/i)).toBeLessThan(4);
    expect(countDiscussionsWith(/one concrete detail from .* or its success criteria/i)).toBeLessThan(4);
    expect(countPlansWith(/one revision they still need before/i)).toBeLessThan(4);

    const texture = computeTexture([
      ...deckTexts.map((text, index) => ({ id: `deck-${index}`, feature: 'slideDecks', text })),
      ...planTexts.map((text, index) => ({ id: `plan-${index}`, feature: 'lessonPlans', text })),
      ...assignmentTexts.map((text, index) => ({ id: `assignment-${index}`, feature: 'assignments', text })),
      ...rubricTexts.map((text, index) => ({ id: `rubric-${index}`, feature: 'rubrics', text })),
      ...discussionTexts.map((text, index) => ({ id: `discussion-${index}`, feature: 'discussions', text })),
      ...studyGuideTexts.map((text, index) => ({ id: `guide-${index}`, feature: 'studyGuides', text })),
      ...faqTexts.map((text, index) => ({ id: `faq-${index}`, feature: 'courseFaq', text })),
    ]);
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');
    expect(evidence).not.toMatch(/retrieval-to-exam practice cycle/i);
    expect(evidence).not.toMatch(/too early bring them back/i);
    expect(evidence).not.toMatch(/backs the claim and connect it to/i);
    expect(evidence).not.toMatch(/readiness for the next artifact/i);
    expect(evidence).not.toMatch(/redirect drafts drifting/i);
    expect(evidence).not.toMatch(/against live .* evidence for .* clarify that/i);
    expect(evidence).not.toMatch(/ai use when it contributes to the submission do not invent authors/i);
    expect(evidence).not.toMatch(/all support .* rather than disconnected tasks use the agenda/i);
    expect(evidence).not.toMatch(
      /alternative participation mode use the instructor-approved written or chat response/i,
    );
    expect(evidence).not.toMatch(/alternative reading of the same evidence/i);
    expect(evidence).not.toMatch(/limitation or revision move tied to/i);
    expect(evidence).not.toMatch(/decision the product will capture/i);
    expect(evidence).not.toMatch(/prevent compartmentalized thinking/i);
    expect(evidence).not.toMatch(/students identify which evidence assumptions and constraints matter most/i);
    expect(evidence).not.toMatch(/activate prior knowledge and focus students/i);
    expect(evidence).not.toMatch(/not only topic recall/i);
    expect(evidence).not.toMatch(/independent artifact sprint/i);
    expect(evidence).not.toMatch(/debrief and exit ticket/i);
    expect(evidence).not.toMatch(/take a position on the lesson.s live question/i);
    expect(evidence).not.toMatch(
      /agenda and lesson handout shared notes or collaboration document submission template/i,
    );
    expect(evidence).not.toMatch(/practice workflow practice workflow/i);
    expect(evidence).not.toMatch(/what check would catch it/i);
    expect(evidence).not.toMatch(/accessibility description decision matrix for which lecture exam evidence choice/i);
    expect(evidence).not.toMatch(/and one concrete detail from the week .* assessment or its success/i);
    expect(evidence).not.toMatch(/and one partial week .* assessment sample the stronger sample should cite/i);
    expect(evidence).not.toMatch(/and one revision they still need before the week .* assessment is/i);
    expect(evidence).not.toMatch(/and partial week .* assessment samples before you submit then self check/i);
    expect(evidence).not.toMatch(/and usability evidence source and one implication for the week .* assessment/i);
    expect(evidence).not.toMatch(/assessment follow the course late work policy and contact the instructor before/i);
    expect(evidence).not.toMatch(/assessment rubric before students draft then use criterion-level feedback/i);
    expect(evidence).not.toMatch(/audience language makes .* evidence harder to follow/i);
    expect(evidence).not.toMatch(/criterion-level feedback that names the strongest evidence move/i);
    expect(evidence).not.toMatch(/critique a visible prototype or design artifact then revise one concrete element/i);
    expect(evidence).not.toMatch(
      /assessment then name the protocol artifact walk-through critique notes revision commitment/i,
    );
  });

  it('keeps full lecture-exam courses from repeating concept-check scaffolds across every deck', () => {
    const blueprint = buildCourseBlueprint(makeFifteenLessonLectureExamCourseMap(), {
      enrichment: {
        source: 'test-full-lecture-exam-texture-enrichment',
        lens: {
          domain: 'introductory psychology lecture',
          evidenceNoun: 'concept-check evidence',
          decisionNoun: 'exam-readiness decision',
          learnerRole: 'conceptual learner',
          exampleNoun: 'lecture concept example',
        },
      },
    });
    blueprint.lessons.forEach((lesson, index) => {
      lesson.enrichment = {
        ...(lesson.enrichment || {}),
        keyTerms: [
          {
            term: lesson.keyConcepts[0] || `concept ${index + 1}`,
            definition: `A usable definition for ${lesson.title}.`,
            misconception: `Students may treat ${lesson.keyConcepts[0] || 'the concept'} as memorized vocabulary only.`,
            correction: `The concept has to explain a specific answer choice or exam transfer move.`,
          },
        ],
        conceptProvenance: { citations: [`OpenStax Psychology chapter ${index + 1}`] },
      };
    });

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'slideDecks', 'discussions'], {
      configMap: { lessonPlans: { depth: 'deep' } },
      enforceCompilerContract: false,
    });
    const deckTexts = compiled.slideDecks.decks.map((deck) =>
      deck.slides
        .map((slide) => `${slide.title || ''} ${(slide.bullets || []).join(' ')} ${slide.notes || ''}`)
        .join(' '),
    );
    const planTexts = compiled.lessonPlans.lessonPlans.map((plan) =>
      plan.outline.map((item) => `${item.description || ''} ${item.instructorNotes || ''}`).join(' '),
    );
    const discussionTexts = compiled.discussions.discussions.map((discussion) =>
      [
        discussion.prompt,
        discussion.guidelines,
        discussion.discussionProtocol?.participationPattern,
        discussion.discussionProtocol?.facilitationMove,
        discussion.discussionProtocol?.reviewFocus,
        ...(discussion.followUpProbes || []),
      ].join(' '),
    );
    const countDecksWith = (pattern) => deckTexts.filter((text) => pattern.test(text)).length;
    const countDiscussionsWith = (pattern) => discussionTexts.filter((text) => pattern.test(text)).length;

    expect(countDecksWith(/collect concept-check answers, confidence ratings, misconception patterns/i)).toBe(0);
    expect(countDecksWith(/answers confidence ratings misconception patterns and corrected explanations/i)).toBe(0);
    expect(
      countDiscussionsWith(/retrieval attempt, confidence check, wrong-answer sort, misconception repair/i),
    ).toBeLessThan(4);
    expect(
      countDiscussionsWith(/concept accuracy, retrieval strength, misconception repair, confidence calibration/i),
    ).toBeLessThan(4);

    const texture = computeTexture([
      ...deckTexts.map((text, index) => ({ id: `deck-${index}`, feature: 'slideDecks', text })),
      ...planTexts.map((text, index) => ({ id: `plan-${index}`, feature: 'lessonPlans', text })),
      ...discussionTexts.map((text, index) => ({ id: `discussion-${index}`, feature: 'discussions', text })),
    ]);
    const evidence = texture.evidence.map((item) => item.shingle).join('\n');
    expect(evidence).not.toMatch(/answers confidence ratings misconception patterns and corrected explanations/i);
    expect(evidence).not.toMatch(/concept-check answers confidence ratings misconception patterns/i);
    expect(evidence).not.toMatch(
      /confidence check wrong-answer sort misconception repair and exam-style transfer item/i,
    );
    expect(evidence).not.toMatch(/concept accuracy retrieval strength misconception repair confidence calibration/i);
  });

  it('decodes capstone project milestones with sponsor constraints and defense readiness', () => {
    const blueprint = buildCourseBlueprint(makeCapstoneProjectCourseMap(), {
      enrichment: {
        source: 'test-capstone-enrichment',
        lens: {
          domain: 'capstone project integration',
          evidenceNoun: 'project evidence',
          decisionNoun: 'capstone decision',
          learnerRole: 'capstone project lead',
          exampleNoun: 'client project scenario',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('capstone-project');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'capstone-project',
      'capstone-project',
    ]);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('project charter'),
      evidenceRequirement: expect.stringContaining('sponsor or stakeholder need'),
      reviewProtocol: expect.stringContaining('next-milestone revision'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Capstone project milestone',
      artifactGenre: expect.objectContaining({ genre: 'capstone-project' }),
      expectedSubmissionFormat: expect.stringContaining('project charter'),
      artifactGenreReviewProtocol: expect.stringContaining('sponsor constraints'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Milestone Design Review',
      artifactGenre: expect.objectContaining({ genre: 'capstone-project' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('sponsor constraint check'),
        reviewFocus: expect.stringContaining('defense readiness'),
      }),
    });
  });

  it('keeps long AI course design studios from being reclassified as capstone projects', () => {
    const blueprint = buildCourseBlueprint(DEFAULT_AUDIT_PROJECTS[1].courseMap, {
      enrichment: {
        source: 'test-ai-course-design-enrichment',
        lens: {
          domain: 'AI-supported course design',
          evidenceNoun: 'design evidence',
          decisionNoun: 'instructional design decision',
          learnerRole: 'course designer',
          exampleNoun: 'AI teaching workflow',
        },
      },
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('studio-lab');
    expect(blueprint.lessons).toHaveLength(14);
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(Array(14).fill('design-prototype'));
    expect(blueprint.lessons[13].title).toContain('Capstone AI Course Redesign Portfolio');
  });

  it('decodes competency-based assessment artifacts with calibrated proficiency evidence', () => {
    const blueprint = buildCourseBlueprint(makeCompetencyAssessmentCourseMap(), {
      enrichment: {
        source: 'test-competency-enrichment',
        lens: {
          domain: 'competency-based assessment',
          evidenceNoun: 'competency evidence',
          decisionNoun: 'proficiency decision',
          learnerRole: 'competency candidate',
          exampleNoun: 'standards-aligned performance task',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('competency-based');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'competency-evidence',
      'competency-evidence',
    ]);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('competency checklist'),
      evidenceRequirement: expect.stringContaining('benchmark descriptor'),
      reviewProtocol: expect.stringContaining('calibrate the proficiency decision'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Competency evidence portfolio',
      artifactGenre: expect.objectContaining({ genre: 'competency-evidence' }),
      expectedSubmissionFormat: expect.stringContaining('standards-aligned performance task'),
      artifactGenreReviewProtocol: expect.stringContaining('competency descriptor'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Competency Calibration Panel',
      artifactGenre: expect.objectContaining({ genre: 'competency-evidence' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('proficiency calibration'),
        reviewFocus: expect.stringContaining('remediation fit'),
      }),
    });
  });

  it('decodes creative workshop artifacts as revision portfolios with craft critique evidence', () => {
    const blueprint = buildCourseBlueprint(makeCreativeWritingCourseMap(), {
      enrichment: {
        source: 'test-creative-writing-enrichment',
        lens: {
          domain: 'creative arts workshop',
          evidenceNoun: 'craft evidence',
          decisionNoun: 'revision decision',
          learnerRole: 'creative practitioner',
          exampleNoun: 'workshop draft',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('creative-studio');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual([
      'creative-portfolio',
      'creative-portfolio',
    ]);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('creative draft'),
      evidenceRequirement: expect.stringContaining('craft choice'),
      reviewProtocol: expect.stringContaining('critique notes'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Creative revision portfolio',
      artifactGenre: expect.objectContaining({ genre: 'creative-portfolio' }),
      expectedSubmissionFormat: expect.stringContaining('workshop response'),
      artifactGenreReviewProtocol: expect.stringContaining('next draft decision'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Creative Workshop Critique',
      artifactGenre: expect.objectContaining({ genre: 'creative-portfolio' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('craft observation'),
        reviewFocus: expect.stringContaining('critique uptake'),
      }),
    });
  });

  it('decodes case-method artifacts as recommendation memos with tradeoff evidence', () => {
    const blueprint = buildCourseBlueprint(makeBusinessCaseCourseMap(), {
      enrichment: {
        source: 'test-business-case-enrichment',
        lens: {
          domain: 'business strategy case method',
          evidenceNoun: 'case evidence',
          decisionNoun: 'strategic recommendation',
          learnerRole: 'case analyst',
          exampleNoun: 'business case scenario',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('case-method');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(['case-analysis', 'case-analysis']);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('case analysis memo'),
      evidenceRequirement: expect.stringContaining('stakeholder tradeoffs'),
      reviewProtocol: expect.stringContaining('recommendation against case facts'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Case analysis memo',
      artifactGenre: expect.objectContaining({ genre: 'case-analysis' }),
      expectedSubmissionFormat: expect.stringContaining('executive recommendation'),
      artifactGenreReviewProtocol: expect.stringContaining('implementation-risk revision'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Case Decision Board',
      artifactGenre: expect.objectContaining({ genre: 'case-analysis' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('stakeholder tradeoff challenge'),
        reviewFocus: expect.stringContaining('recommendation defense'),
      }),
    });
  });

  it('decodes legal doctrinal artifacts as rule-application memos', () => {
    const blueprint = buildCourseBlueprint(makeConstitutionalLawCourseMap(), {
      enrichment: {
        source: 'test-legal-doctrinal-enrichment',
        lens: {
          domain: 'legal doctrine and case analysis',
          evidenceNoun: 'doctrinal evidence',
          decisionNoun: 'legal conclusion',
          learnerRole: 'legal analyst',
          exampleNoun: 'case hypothetical',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('legal-doctrinal');
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(['legal-analysis', 'legal-analysis']);
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      outputFormat: expect.stringContaining('case brief'),
      evidenceRequirement: expect.stringContaining('holding'),
      reviewProtocol: expect.stringContaining('hypothetical'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Legal analysis memo',
      artifactGenre: expect.objectContaining({ genre: 'legal-analysis' }),
      expectedSubmissionFormat: expect.stringContaining('IRAC memo'),
      artifactGenreReviewProtocol: expect.stringContaining('revised application paragraph'),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Socratic Rule Application',
      artifactGenre: expect.objectContaining({ genre: 'legal-analysis' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('holding extraction'),
        reviewFocus: expect.stringContaining('doctrinal limits'),
      }),
    });
  });

  it('preserves section-by-section source coverage for multi-section lessons', () => {
    const blueprint = buildCourseBlueprint(makeMultiSectionSeminarCourseMap(), {
      enrichment: {
        source: 'test-multi-section-enrichment',
        lens: {
          domain: 'comparative literature seminar',
          evidenceNoun: 'literary evidence',
          decisionNoun: 'interpretive decision',
          learnerRole: 'seminar reader',
          exampleNoun: 'comparative text case',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions'], {
      enforceCompilerContract: false,
    });
    const trace = blueprint.lessons[0].sourceEvidenceTrace;

    expect(blueprint.courseModalityProfile.primaryMode).toBe('interpretive-humanities');
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      genre: 'close-reading-analysis',
      outputFormat: expect.stringContaining('close-reading memo'),
    });
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'evidence entry',
      'close-reading model',
      'context and source check',
      'competing interpretation challenge',
      'interpretive artifact sprint',
      'synthesis and transfer',
    ]);
    expect(trace).toMatchObject({
      sourceSectionCount: 2,
      sectionCoverageStatus: 'multi-section-traced',
    });
    expect(trace.sectionCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sectionNumber: 1,
          sourceColumns: expect.arrayContaining(['topicSection', 'weeklyAssessments']),
          // Concept extraction emits multi-word phrases since v0.8.61,
          // never bare title tokens.
          preservedSignals: expect.arrayContaining([expect.stringMatching(/close reading/i)]),
        }),
        expect.objectContaining({
          sectionNumber: 2,
          sourceColumns: expect.arrayContaining(['topicSection', 'weeklyAssessments']),
          preservedSignals: expect.arrayContaining([expect.stringMatching(/historical context/i)]),
        }),
      ]),
    );
    expect(compiled.lessonPlans.lessonPlans[0].blueprintGrounding.sourceEvidenceTrace.sectionCoverage).toHaveLength(2);
    expect(compiled.assignments.assignments[0].sourceGrounding.sourceEvidenceTrace.sectionCoverage[1]).toMatchObject({
      sectionNumber: 2,
      rawText: expect.stringContaining('Historical context'),
    });
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Interpretive analysis portfolio',
      artifactGenre: expect.objectContaining({ genre: 'close-reading-analysis' }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Interpretive Evidence Seminar',
      modalityDecode: expect.objectContaining({ mode: 'interpretive-humanities' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('competing interpretation challenge'),
        reviewFocus: expect.stringContaining('source integrity'),
      }),
    });
  });

  it('decodes online-hybrid courses into asynchronous module and discussion plans', () => {
    const blueprint = buildCourseBlueprint(makeOnlineWritingCourseMap(), {
      enrichment: {
        source: 'test-online-writing-enrichment',
        lens: {
          domain: 'online academic writing workshop',
          evidenceNoun: 'online writing evidence',
          decisionNoun: 'revision decision',
          learnerRole: 'online writing student',
          exampleNoun: 'asynchronous draft case',
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'discussions'], {
      enforceCompilerContract: false,
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('online-hybrid');
    expect(blueprint.learnerContextProfile).toMatchObject({
      learnerRole: 'online writing student',
      evidenceNoun: 'online writing evidence',
      decisionNoun: 'revision decision',
    });
    expect(blueprint.lessons[0].classSessionPlan).toMatchObject({
      deliveryMode: 'online-hybrid-module',
      synchronousAssumption: expect.stringContaining('Do not assume live facilitation'),
    });
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'asynchronous readiness check',
      'model response or screencast',
      'discussion-board evidence checkpoint',
      'peer reply and revision cue',
      'independent LMS artifact sprint',
      'feedback follow-up and transfer',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].classSessionPlan.deliveryMode).toBe('online-hybrid-module');
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'asynchronous checkpoint',
    );
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Asynchronous Online',
      modalityDecode: expect.objectContaining({ mode: 'online-hybrid' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('initial post'),
        artifactUse: expect.stringContaining('visible online'),
      }),
    });
  });

  it('builds a reusable blueprint with lesson and assessment anchors', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(4));

    expect(blueprint.lessons).toHaveLength(4);
    expect(blueprint.assessments).toHaveLength(4);
    expect(blueprint.lessons.map((lesson) => lesson.bloomsLevel)).toEqual([
      'Evaluate',
      'Evaluate',
      'Evaluate',
      'Evaluate',
    ]);
    expect(blueprint.lessons[0].bloomInference).toMatchObject({
      level: 'Evaluate',
      source: 'learning objectives',
      matchedVerb: 'evaluate',
      fallbackUsed: false,
    });
    expect(blueprint.courseArc.throughline).toContain('evidence, practice, feedback');
    expect(blueprint.courseArc.stages.flatMap((stage) => stage.lessonNumbers).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(blueprint.courseArc.conceptThread).toContain('Policy Topic 1');
    expect(blueprint.conceptDependencyGraph).toMatchObject({
      status: 'sequenced',
      nodeCount: 4,
      edgeCount: 6,
      conceptThread: expect.stringContaining('Policy Topic 1'),
      nodes: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          concept: 'Policy Topic 1',
          assessmentArtifact: 'Policy memo checkpoint 1',
        }),
      ]),
      practiceRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          currentConcept: 'Policy Topic 1',
          practiceFocus: expect.stringContaining('stakeholder'),
          transferTask: expect.stringContaining('Policy memo checkpoint 2'),
        }),
      ]),
    });
    expect(blueprint.lessons[0].conceptDependencyPlan).toMatchObject({
      node: expect.objectContaining({ concept: 'Policy Topic 1' }),
      transferCue: expect.stringContaining('Policy memo checkpoint 2'),
    });
    expect(blueprint.lessons[1].conceptDependencyPlan.incomingEdges[0]).toMatchObject({
      type: 'prerequisite',
      fromConcept: 'Policy Topic 1',
      toConcept: 'Policy Topic 2',
    });
    expect(blueprint.lessons[0].practiceProgressionPlan).toMatchObject({
      currentConcept: 'Policy Topic 1',
      nextConcept: 'Policy Topic 2',
      feedbackRoutine: expect.stringContaining('implementation risk'),
    });
    expect(blueprint.masteryEvidenceMap).toMatchObject({
      status: 'complete',
      missingFieldCount: 0,
      checkedStages: expect.arrayContaining(['diagnostic', 'independent-performance', 'feedback-revision']),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          concept: 'Policy Topic 1',
          artifact: 'Policy memo checkpoint 1',
          evidencePortfolioStages: expect.arrayContaining(['diagnostic', 'transfer']),
        }),
      ]),
    });
    expect(blueprint.lessons[0].masteryEvidencePlan).toMatchObject({
      concept: 'Policy Topic 1',
      artifact: 'Policy memo checkpoint 1',
      diagnosticEvidence: expect.stringContaining('ready when they can cite inspectable evidence'),
      guidedPracticeEvidence: expect.stringContaining('stakeholder/equity effect'),
      independentPerformanceEvidence: expect.stringContaining('Policy memo checkpoint 1'),
      feedbackRevisionEvidence: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      transferEvidence: expect.stringContaining('Policy memo checkpoint 2'),
      masteryThreshold: expect.stringContaining('Strong evidence names'),
      evidencePortfolio: expect.arrayContaining([
        expect.objectContaining({ stage: 'diagnostic' }),
        expect.objectContaining({ stage: 'misconception-repair' }),
      ]),
    });
    expect(blueprint.evidenceResponseMap).toMatchObject({
      status: 'complete',
      missingFieldCount: 0,
      checkedStates: expect.arrayContaining(['ready', 'partial', 'needs-support']),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          concept: 'Policy Topic 1',
          decisionStateCount: 3,
        }),
      ]),
    });
    expect(blueprint.lessons[0].evidenceResponsePlan).toMatchObject({
      concept: 'Policy Topic 1',
      readyMove: expect.stringContaining('compare two possible evidence choices'),
      partialMove: expect.stringContaining('criterion-level feedback'),
      supportMove: expect.stringContaining('sentence frame'),
      recheckCue: expect.stringContaining('what feedback changed'),
      decisionStates: expect.arrayContaining([
        expect.objectContaining({ state: 'ready' }),
        expect.objectContaining({ state: 'partial' }),
        expect.objectContaining({ state: 'needs-support' }),
      ]),
    });
    expect(blueprint.objectiveEvidenceMap).toMatchObject({
      status: 'complete',
      missingEvidenceCount: 0,
      totalObjectiveRows: expect.any(Number),
      checkedEvidenceTypes: expect.arrayContaining(['practice', 'assessment', 'rubric', 'quiz-check']),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          objectiveCount: expect.any(Number),
          missingEvidenceCount: 0,
          artifact: 'Policy memo checkpoint 1',
        }),
      ]),
    });
    expect(blueprint.lessons[0].objectiveEvidencePlan).toMatchObject({
      status: 'complete',
      missingEvidenceCount: 0,
      objectiveRows: expect.arrayContaining([
        expect.objectContaining({
          objective: expect.stringContaining('policy evidence 1'),
          practiceEvidence: expect.stringContaining('Small-group policy lab 1'),
          assessmentEvidence: 'Policy memo checkpoint 1',
          rubricCriteria: expect.arrayContaining([expect.stringContaining('Policy Topic 1')]),
          quizQuestionRoles: expect.arrayContaining(['diagnostic-retrieval']),
          feedbackEvidence: expect.stringContaining('criterion-level feedback'),
          revisionEvidence: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
        }),
      ]),
    });
    expect(blueprint.courseWorkload.averagePerLessonHours).toBeGreaterThan(2);
    expect(blueprint.courseWorkload).toMatchObject({
      timingStatus: 'fits-session',
      averagePlannedClassMinutes: 110,
      workloadBalanceStatus: 'balanced',
      workloadReviewCount: 0,
      timingReviewCount: 0,
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          workloadFit: expect.stringMatching(/manageable/),
          workloadSpike: false,
          outOfClassMinutes: expect.any(Number),
        }),
      ]),
    });
    expect(blueprint.learnerContextProfile).toMatchObject({
      source: 'compiler-derived-from-course-map',
      learnerRole: expect.stringContaining('policy analyst'),
      coursePerformanceRole: expect.stringContaining('evidence'),
      supportAssumptions: expect.arrayContaining([expect.stringContaining('Policy Topic 1')]),
      participationModes: expect.arrayContaining(['individual think-write']),
    });
    expect(blueprint.courseModalityProfile).toMatchObject({
      source: 'compiler-inferred-from-course-map',
      primaryMode: 'policy-analysis',
      sessionPattern: expect.stringContaining('policy option comparison'),
      artifactEnvironment: expect.stringContaining('policy memos'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('stakeholder'),
        evidenceRoutine: expect.stringContaining('stakeholder/equity effect'),
        feedbackRoutine: expect.stringContaining('implementation risk'),
      }),
    });
    expect(blueprint.classroomHandoffPlan).toMatchObject({
      status: 'ready-with-spot-check',
      reviewOrder: expect.arrayContaining([expect.stringContaining('Confirm official course facts')]),
      sourceRiskRegister: expect.objectContaining({
        status: 'clear-with-spot-check',
      }),
      packageCoherenceChecks: expect.arrayContaining([expect.stringContaining('learner context')]),
      lessonReviewOrder: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          artifact: expect.stringContaining('Policy memo checkpoint 1'),
          sourceRisk: 'none',
          compilerDecision: expect.objectContaining({
            generationPath: 'deterministic-compile',
            publishGate: 'instructor-spot-check-before-publish',
          }),
        }),
      ]),
      publishBoundary: expect.stringContaining('Do not publish'),
    });
    expect(blueprint.classroomDryRunPlan).toMatchObject({
      status: 'ready-for-classroom-dry-run',
      source: 'deterministic-classroom-dry-run-plan',
      lessonRowCount: 4,
      reviewRequiredCount: 0,
      timingReviewCount: 0,
      rehearsalPolicy: expect.stringContaining('rehearse'),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          lessonTitle: expect.stringContaining('Policy Topic 1'),
          dryRunFocus: expect.stringContaining('Policy Topic 1'),
          evidenceCheckpoint: expect.stringContaining('Policy Topic 1'),
          publishGate: 'instructor-spot-check-before-publish',
          reviewerAction: expect.stringContaining('Policy Topic 1'),
        }),
      ]),
    });
    expect(blueprint.classroomEvidenceLoopPlan).toMatchObject({
      status: 'ready-for-implementation-evidence',
      source: 'deterministic-classroom-evidence-loop',
      lessonRowCount: 4,
      reviewRequiredCount: 0,
      evidencePolicy: expect.stringContaining('observable student work'),
      preferenceLearningPolicy: expect.stringContaining('Instructor edits'),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          lessonTitle: expect.stringContaining('Policy Topic 1'),
          implementationFocus: expect.stringContaining('Policy Topic 1'),
          studentWorkSampleCue: expect.stringContaining('Policy memo checkpoint 1'),
          adjustmentDecision: expect.stringContaining('feedback changed'),
          preferenceLearningSignal: expect.stringContaining('instructor edits'),
          publishGate: 'instructor-spot-check-before-publish',
        }),
      ]),
    });
    expect(blueprint.instructorFeedbackLoadPlan).toMatchObject({
      status: 'feedback-load-ready',
      source: 'deterministic-instructor-feedback-load-plan',
      lessonRowCount: 4,
      averageEstimatedFeedbackMinutes: expect.any(Number),
      feedbackLoadPolicy: expect.stringContaining('instructor feedback work'),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          assessmentTitle: expect.stringContaining('Policy memo checkpoint 1'),
          estimatedFeedbackMinutes: expect.any(Number),
          feedbackFocus: expect.stringContaining('criterion-level feedback'),
          batchingStrategy: expect.stringContaining('Policy memo checkpoint 1'),
          publishGate: 'instructor-spot-check-before-publish',
        }),
      ]),
    });
    expect(blueprint.sourceRiskRegister).toMatchObject({
      status: 'clear-with-spot-check',
      highRiskCount: 0,
      mediumRiskCount: 0,
      reviewItemCount: 0,
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          riskLevel: 'none',
          directCourseMapFieldCount: 6,
          inferredFieldCount: 0,
          reviewRequired: false,
        }),
      ]),
    });
    expect(blueprint.blueprintAssumptionLedger).toMatchObject({
      status: 'local-confirmation-required',
      categories: expect.arrayContaining([
        'learner-context',
        'course-modality',
        'assessment-weight',
        'handoff-boundary',
      ]),
      reviewRequiredCount: expect.any(Number),
    });
    expect(blueprint.blueprintAssumptionLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'assessment-weight',
          source: 'compiler-distributed-by-assessment-role',
          reviewRequired: true,
          reviewerAction: expect.stringContaining('Confirm the official grading weight'),
        }),
        expect.objectContaining({
          category: 'handoff-boundary',
          reviewRequired: true,
          assumption: expect.stringContaining('Do not publish'),
        }),
      ]),
    );
    expect(blueprint.compilerDecisionMatrix).toMatchObject({
      status: 'ready-with-spot-check',
      deterministicCompiler: true,
      modelFallback: 'not used for blueprint-compiled deliverables',
      reviewRequiredCount: 0,
      localRepairCount: 0,
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          generationPath: 'deterministic-compile',
          publishGate: 'instructor-spot-check-before-publish',
          sourceRiskLevel: 'none',
          assessmentSource: 'course-map',
        }),
      ]),
    });
    expect(blueprint.lessons[0].compilerDecision).toMatchObject({
      source: 'deterministic-compiler-decision',
      generationPath: 'deterministic-compile',
      safePath: 'compile-from-blueprint-with-spot-check',
      publishGate: 'instructor-spot-check-before-publish',
      reviewRequired: false,
      localRepairUsed: false,
      evidence: {
        confidenceLevel: 'high',
        sourceRiskLevel: 'none',
        assessmentSource: 'course-map',
      },
    });
    expect(blueprint.assessmentArchitecture).toMatchObject({
      status: 'balanced',
      totalWeightPercent: 100,
      weightSourceStatus: 'compiler-distributed-draft',
      explicitWeightCount: 0,
      compilerDistributedWeightCount: 4,
      weightReviewRequiredCount: 4,
      assessmentCount: 4,
      roleCounts: expect.objectContaining({
        'diagnostic-checkpoint': 1,
        'summative-synthesis': 1,
      }),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          role: 'diagnostic-checkpoint',
          roleLabel: 'Diagnostic checkpoint',
          weightProvenance: expect.objectContaining({
            source: 'compiler-distributed-by-assessment-role',
            reviewRequired: true,
          }),
          feedbackWindow: expect.stringContaining('next class session'),
          revisionUse: expect.stringContaining('readiness feedback'),
          criterionWeightCue: expect.stringContaining('30%'),
        }),
      ]),
    });
    expect(blueprint.assessments[0]).toMatchObject({
      bloomsLevel: 'Evaluate',
      role: 'diagnostic-checkpoint',
      roleLabel: 'Diagnostic checkpoint',
      stakes: 'low',
      weightPercent: expect.any(Number),
      weightProvenance: expect.objectContaining({
        planStatus: 'compiler-distributed-draft',
        source: 'compiler-distributed-by-assessment-role',
        reviewRequired: true,
      }),
      cadence: expect.objectContaining({
        dueWindow: 'Week 1',
        weightSource: 'compiler-distributed-by-assessment-role',
        feedbackWindow: expect.stringContaining('next class session'),
        revisionWindow: expect.stringContaining('Week 2'),
      }),
      revisionUse: expect.stringContaining('readiness feedback'),
    });
    expect(blueprint.assessments[0].criterionWeightPlan).toHaveLength(4);
    expect(blueprint.assessments[0].criterionWeightPlan.map((entry) => entry.weight)).toEqual([30, 30, 20, 20]);
    expect(blueprint.assessments[0].criterionWeightPlan.reduce((sum, entry) => sum + Number(entry.weight), 0)).toBe(
      100,
    );
    expect(blueprint.assessments[0].criterionWeightPlan[0]).toMatchObject({
      priority: 'source-grounded concept evidence',
      rationale: expect.stringContaining('Policy memo checkpoint 1'),
      evidenceSignal: expect.stringContaining('inspectable Policy Topic 1 detail'),
      calibrationUse: expect.stringContaining('compare one strong and one partial Policy memo checkpoint 1'),
      feedbackUse: expect.stringContaining('Policy memo checkpoint 1'),
    });
    expect(blueprint.assessments[0].criterionObjectiveAlignment).toHaveLength(4);
    expect(blueprint.assessments[0].criterionObjectiveAlignment[0]).toMatchObject({
      criterion: expect.stringContaining('Policy Topic 1 accuracy'),
      objective: expect.stringContaining('Analyze policy evidence 1'),
      strategy: 'source-evidence-objective-match',
    });
    expect(blueprint.assessments[0].criterionObjectiveAlignment[1]).toMatchObject({
      criterion: expect.stringContaining('Analysis logic'),
      objective: expect.stringContaining('Evaluate implementation tradeoffs 1'),
      strategy: 'analysis-decision-objective-match',
    });
    expect(blueprint.packageCoherenceMatrix).toMatchObject({
      status: 'coherent',
      missingFieldCount: 0,
      checkedArtifacts: expect.arrayContaining(['syllabus', 'lessonPlans', 'courseFaq']),
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          assessmentArtifact: expect.stringContaining('Policy memo checkpoint 1'),
          assessmentRole: 'Diagnostic checkpoint',
          assessmentCadenceCue: expect.stringContaining('Week 1'),
          criterionWeightCue: expect.stringContaining('source-grounded concept evidence: 30%'),
          sourceEvidenceCue: expect.stringContaining('learning objectives: course-map'),
          sourceRiskLevel: 'none',
          compilerDecisionCue: 'deterministic-compile',
          publishGate: 'instructor-spot-check-before-publish',
          learnerContextCue: expect.stringContaining('Policy Topic 1'),
          prerequisiteCue: expect.stringContaining('define Policy Topic 1'),
          conceptDependencyCue: expect.stringContaining('checking readiness for Policy Topic 1'),
          practiceProgressionCue: expect.stringContaining('stakeholder'),
          masteryEvidenceCue: expect.stringContaining('Policy memo checkpoint 1'),
          masteryRevisionCue: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
          masteryTransferCue: expect.stringContaining('Policy memo checkpoint 2'),
          evidenceResponseCue: expect.stringContaining('criterion-level feedback'),
          evidenceSupportCue: expect.stringContaining('sentence frame'),
          evidenceExtensionCue: expect.stringContaining('compare two possible evidence choices'),
          modalityCue: expect.stringContaining('policy-analysis'),
          modalityDecodeCue: expect.stringContaining('stakeholder'),
          artifactGenreCue: 'policy-brief',
          classSessionCue: expect.stringContaining('110/110 minutes'),
        }),
      ]),
    });
    expect(blueprint.qualitySignals).toMatchObject({
      confidenceLevel: 'high',
      reviewFlagCount: 0,
    });
    expect(blueprint.blueprintReviewSurface).toMatchObject({
      status: 'review-ready-with-local-confirmations',
      audience: 'instructor-review-before-package-expansion',
      courseDecode: {
        modality: 'policy-analysis',
        learnerRole: expect.stringContaining('policy analyst'),
        signaturePractice: expect.stringContaining('stakeholder'),
      },
      localConfirmationSummary: {
        sourceReviewRequiredCount: 0,
      },
      instructionalMoveDecode: {
        status: 'reviewable',
        openingMove: expect.stringContaining('policy memo'),
        practiceMove: expect.stringContaining('evidence'),
        feedbackMove: expect.stringContaining('revision'),
        assessmentMove: expect.stringContaining('assessment'),
        reviewMove: expect.stringContaining('handoff'),
        sourceGrounding: expect.stringContaining('stakeholder'),
      },
      traceabilitySummary: {
        status: 'traceable',
        traceableRows: 4,
        untraceableRows: 0,
        instructionalMoveRows: 4,
      },
      machineDecodeCompleteness: {
        lessonRows: 4,
        assessmentRows: 4,
        checkedArtifacts: 9,
      },
      lessonRows: expect.arrayContaining([
        expect.objectContaining({
          lessonNumber: 1,
          artifactGenre: 'policy-brief',
          reviewState: 'spot-check-ready',
          answerabilityStatus: 'answerable-from-blueprint',
          reviewerQuestion: expect.stringContaining('Policy Topic 1'),
          sourceTrace: expect.objectContaining({
            sourceAnchor: expect.stringContaining('Case packet'),
            evidenceRequirement: expect.stringContaining('Use a concrete detail'),
            compilerReason: expect.stringContaining('high-confidence source fields'),
            localConfirmationCue: expect.stringContaining('Spot-check official dates'),
            assumptionRefs: expect.arrayContaining([expect.stringContaining('course-modality')]),
          }),
          teachingMoveTrace: expect.objectContaining({
            openingMove: expect.stringContaining('Policy Topic 1'),
            practiceMove: expect.stringContaining('Policy memo checkpoint 1'),
            feedbackMove: expect.stringContaining('Policy memo checkpoint 1'),
            sourceAnchor: expect.stringContaining('Case packet'),
            artifactCue: expect.stringContaining('Policy memo checkpoint 1'),
            modalityCue: expect.stringContaining('stakeholder'),
          }),
        }),
      ]),
    });
    expect(blueprint.compilerPath).toMatchObject({
      mode: 'deterministic',
      source: 'deterministic-blueprint',
      deterministicCompiler: true,
      enrichmentCallCount: 0,
      adaptiveSafety: {
        status: 'ready-with-spot-check',
        localRepair: 'no source-inferred local repair needed',
        locallyRepairedLessonCount: 0,
        modelFallback: 'not used for blueprint-compiled deliverables',
      },
      adaptiveRepairPlan: {
        status: 'deterministic-compile-no-repair',
        deterministicRepairCount: 0,
        modelGeneratedFallbackCount: 0,
        modelFallbackPolicy: {
          status: 'not-used-for-blueprint-compiled-core',
        },
        repairRows: [],
      },
    });
    expect(blueprint.compilerContract).toMatchObject({
      status: 'pass',
      blockerCount: 0,
      lessonCount: 4,
      assessmentCount: 4,
      alignmentRowCount: 4,
      compilerDecisionStatus: 'ready-with-spot-check',
      compilerReviewRequiredCount: 0,
      blueprintReviewSurfaceStatus: 'review-ready-with-local-confirmations',
      blueprintReviewSourceRequiredCount: 0,
      blueprintReviewTraceabilityStatus: 'traceable',
      blueprintReviewUntraceableRows: 0,
      blueprintReviewInstructionalMoveStatus: 'reviewable',
      blueprintReviewInstructionalMoveRows: 4,
      conceptGraphStatus: 'sequenced',
      masteryEvidenceStatus: 'complete',
      evidenceResponseStatus: 'complete',
      objectiveEvidenceStatus: 'complete',
      objectiveEvidenceMissingCount: 0,
    });
    expect(blueprint.alignmentMatrix).toHaveLength(4);
    expect(blueprint.alignmentMatrix[0]).toMatchObject({
      lessonNumber: 1,
      alignmentStatus: 'aligned',
      assessmentArtifact: expect.stringContaining('Policy memo checkpoint 1'),
    });
    expect(blueprint.alignmentMatrix[0].rubricCriteria).toHaveLength(4);
    expect(blueprint.alignmentMatrix[0].evidenceRequirement).toContain('Use a concrete detail');
    expect(blueprint.alignmentMatrix[0].sourceEvidenceCue).toContain('assessment artifact: course-map');
    expect(blueprint.alignmentMatrix[0].sourceUseCue).toContain('Do not invent authors');
    expect(blueprint.alignmentMatrix[0].prerequisiteCue).toContain('define Policy Topic 1');
    expect(blueprint.alignmentMatrix[0].conceptDependencyCue).toContain('checking readiness for Policy Topic 1');
    expect(blueprint.alignmentMatrix[0].practiceProgressionCue).toContain('stakeholder');
    expect(blueprint.alignmentMatrix[0].objectiveEvidenceCue).toContain('Policy memo checkpoint 1');
    expect(blueprint.alignmentMatrix[0].masteryDiagnosticCue).toContain('ready when they can cite');
    expect(blueprint.alignmentMatrix[0].masteryGuidedPracticeCue).toContain('stakeholder/equity effect');
    expect(blueprint.alignmentMatrix[0].masteryPerformanceCue).toContain('Policy memo checkpoint 1');
    expect(blueprint.alignmentMatrix[0].masteryRevisionCue).toContain('evidence-backed Policy Topic 1 reasoning');
    expect(blueprint.alignmentMatrix[0].masteryTransferCue).toContain('Policy memo checkpoint 2');
    expect(blueprint.alignmentMatrix[0].masteryThresholdCue).toContain('Strong evidence names');
    expect(blueprint.alignmentMatrix[0].evidenceReadyResponseCue).toContain('compare two possible evidence choices');
    expect(blueprint.alignmentMatrix[0].evidencePartialResponseCue).toContain('criterion-level feedback');
    expect(blueprint.alignmentMatrix[0].evidenceSupportResponseCue).toContain('sentence frame');
    expect(blueprint.alignmentMatrix[0].evidenceRecheckCue).toContain('what feedback changed');
    expect(blueprint.alignmentMatrix[0].instructionalRationaleCue).toContain('appropriate performance evidence');
    expect(blueprint.alignmentMatrix[0].accessibilityCue).toContain('written or spoken response options');
    expect(blueprint.alignmentMatrix[0].feedbackCycleCue).toContain('evidence-backed Policy Topic 1 reasoning');
    expect(blueprint.alignmentMatrix[0].learningTransferCue).toContain('Policy memo checkpoint 2');
    expect(blueprint.alignmentMatrix[0].modalityCue).toContain('policy-analysis');
    expect(blueprint.alignmentMatrix[0].modalityDecodeCue).toContain('stakeholder');
    expect(blueprint.alignmentMatrix[0].artifactGenreCue).toBe('policy-brief');
    expect(blueprint.alignmentMatrix[0].artifactGenreOutputFormat).toContain('Policy memo checkpoint 1');
    expect(blueprint.alignmentMatrix[0].classSessionCue).toContain('110/110 minutes');
    expect(blueprint.alignmentMatrix[0].assessmentRoleCue).toBe('Diagnostic checkpoint');
    expect(blueprint.alignmentMatrix[0].assessmentCadenceCue).toContain('next class session');
    expect(blueprint.alignmentMatrix[0].criterionWeightCue).toContain('source-grounded concept evidence: 30%');
    expect(blueprint.alignmentMatrix[0].teachingIntentCue).toContain('evidence-backed Policy Topic 1 decisions');
    expect(blueprint.alignmentMatrix[0].gradingCalibrationCue).toContain('rubric evidence for Policy Topic 1');
    expect(blueprint.alignmentMatrix[0].criterionEvidenceCue).toContain('inspectable Policy Topic 1 detail');
    expect(blueprint.alignmentMatrix[0].anchorExampleCue).toContain('Strong Policy memo checkpoint 1 anchor');
    expect(blueprint.lessons[0]).toMatchObject({
      lessonNumber: 1,
      title: 'Lesson 1: Policy Topic 1',
      confidence: {
        level: 'high',
      },
      workloadEstimate: {
        inClassMinutes: 110,
      },
      classSessionPlan: {
        feasibilityStatus: 'fits-session',
        plannedClassMinutes: 110,
        sessionMinutes: 110,
        segmentCount: 6,
      },
      difficultyProfile: {
        stage: 'foundation',
      },
    });
    expect(blueprint.lessons[0].sourceAnchors.map((anchor) => anchor.field)).toEqual([
      'title',
      'objectives',
      'topics',
      'assessment',
      'resources',
      'throughline case',
    ]);
    expect(blueprint.lessons[0].sourceEvidenceTrace).toMatchObject({
      sourceKind: 'course-map-lesson-row',
      sourceRowLabel: 'Lesson 1: Policy Topic 1',
      directCourseMapFieldCount: 6,
      unsupportedInferencePolicy: expect.stringContaining('must not be treated as official facts'),
    });
    expect(blueprint.lessons[0].sourceEvidenceTrace.sourceFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'learning objectives',
          sourceColumn: 'learningObjectives',
          source: 'course-map',
          rawText: expect.stringContaining('Analyze policy evidence 1'),
          compiledValue: expect.stringContaining('Analyze policy evidence 1'),
        }),
        expect.objectContaining({
          field: 'assessment artifact',
          sourceColumn: 'weeklyAssessments',
          source: 'course-map',
          rawText: expect.stringContaining('Policy memo checkpoint 1'),
        }),
      ]),
    );
    expect(blueprint.lessons[0].misconceptionMap[0].misconception).toContain('definition to memorize');
    expect(blueprint.lessons[0].evidencePlan.evidenceRequirement).toContain('Use a concrete detail');
    expect(blueprint.lessons[0].sourceUsePlan).toMatchObject({
      approvedSources: expect.arrayContaining(['Case packet 1']),
      citationExpectation: expect.stringContaining('Use instructor-provided materials'),
      studentAttributionMove: expect.stringContaining('Before explaining Policy Topic 1'),
      noInventedSources: expect.stringContaining('Do not invent authors'),
      sourceEvaluationPrompt: expect.stringContaining('what it cannot prove'),
      localReplacementCue: expect.stringContaining('official local reading'),
      copyrightReviewCue: expect.stringContaining('licensed or institutionally approved'),
    });
    expect(blueprint.lessons[0].modelContrast).toMatchObject({
      exemplarMove: expect.stringContaining('Strong Policy memo checkpoint 1 work'),
      nonExemplarMove: expect.stringContaining('Weak Policy memo checkpoint 1 work'),
      transferPrompt: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
    });
    expect(blueprint.lessons[0].readinessSupport).toMatchObject({
      diagnosticPrompt: expect.stringContaining('explain Policy Topic 1'),
      supportMove: expect.stringContaining('sentence frame'),
      extensionMove: expect.stringContaining('compare two possible evidence choices'),
    });
    expect(blueprint.lessons[0].prerequisitePlan).toMatchObject({
      assumedKnowledge: expect.arrayContaining([expect.stringContaining('Policy Topic 1')]),
      prerequisiteEvidence: expect.stringContaining('prior example'),
      diagnosticCheck: expect.stringContaining('define Policy Topic 1'),
      reteachMove: expect.stringContaining('sentence frame'),
      accelerationMove: expect.stringContaining('harder'),
      localAssumptionReview: expect.stringContaining('prior materials'),
    });
    expect(blueprint.lessons[1].prerequisitePlan).toMatchObject({
      assumedKnowledge: expect.arrayContaining(['Policy Topic 1']),
      prerequisiteEvidence: expect.stringContaining('Policy memo checkpoint 1'),
      diagnosticCheck: expect.stringContaining('Policy Topic 1'),
      reteachMove: expect.stringContaining('Policy memo checkpoint 1'),
    });
    expect(blueprint.lessons[0].instructionalRationale).toMatchObject({
      sequenceRationale: expect.stringContaining('diagnostic evidence work'),
      practiceRationale: expect.stringContaining('Guided and collaborative practice'),
      assessmentRationale: expect.stringContaining('appropriate performance evidence'),
      reviewCue: expect.stringContaining("instructor's actual materials"),
    });
    expect(blueprint.lessons[0].accessibilityPlan).toMatchObject({
      representation: expect.stringContaining('spoken explanation'),
      engagement: expect.stringContaining('quiet think-write entry point'),
      expression: expect.stringContaining('memo'),
      participationProtocol: expect.stringContaining('written or spoken response options'),
      accommodationReviewCue: expect.stringContaining('captions or alt text'),
    });
    expect(blueprint.lessons[0].feedbackCycle).toMatchObject({
      formativeEvidence: expect.stringContaining('annotated Policy memo checkpoint 1 line'),
      feedbackMethod: expect.stringContaining('criterion-level feedback'),
      studentRevisionAction: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      nextUse: expect.stringMatching(/next|later|discussion|synthesis|artifact/i),
      closureCheck: expect.stringContaining('what feedback changed'),
    });
    expect(blueprint.lessons[0].learningTransferPlan).toMatchObject({
      retrievalCue: expect.stringContaining('prior experience'),
      spacedPracticeCue: expect.stringContaining('low-stakes quiz item'),
      transferTask: expect.stringContaining('Policy memo checkpoint 2'),
      cumulativeConnection: expect.stringContaining('Policy memo checkpoint 2'),
      metacognitivePrompt: expect.stringContaining('reuse'),
    });
    expect(blueprint.lessons[0].modalityCue).toContain('policy-analysis');
    expect(blueprint.lessons[0].modalityDecode).toMatchObject({
      mode: 'policy-analysis',
      signaturePractice: expect.stringContaining('stakeholder'),
      evidenceRoutine: expect.stringContaining('stakeholder/equity effect'),
      feedbackRoutine: expect.stringContaining('implementation risk'),
      instructorMove: expect.stringContaining('equity, feasibility'),
    });
    expect(blueprint.lessons[0].artifactGenre).toMatchObject({
      genre: 'policy-brief',
      outputFormat: expect.stringContaining('Policy memo checkpoint 1'),
      evidenceRequirement: expect.stringContaining('Policy Topic 1'),
      qualityFocus: expect.stringContaining('Policy memo checkpoint 1'),
      reviewProtocol: expect.stringContaining('problem definition and authority'),
      commonFailure: expect.stringContaining('without a precise public problem'),
      revisionMove: expect.stringContaining('implementation risk'),
    });
    expect(blueprint.lessons[0].teachingIntent).toMatchObject({
      teachingGoal: expect.stringContaining('evidence-backed Policy Topic 1 decisions'),
      diagnosticMove: expect.stringContaining('explain Policy Topic 1'),
      modelingMove: expect.stringContaining('Strong Policy memo checkpoint 1 work'),
      guidedPracticeMove: expect.stringContaining('more defensible'),
      evidenceOfLearning: expect.stringContaining('Use a concrete detail'),
      feedbackDecision: expect.stringContaining('criterion-level feedback'),
      studentRevisionMove: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      transferMove: expect.stringContaining('Policy memo checkpoint 2'),
      localReviewQuestion: expect.stringContaining("instructor's actual materials"),
    });
    expect(blueprint.lessons[1].pacing.bridgeFrom).toContain('Carry forward');
    expect(blueprint.assessments[0].relatedLessons[0]).toContain('Lesson 1');
    expect(blueprint.assessments[0].validityEvidence).toMatchObject({
      targetConstruct: expect.stringContaining('Policy memo checkpoint 1'),
      validityThreat: expect.stringContaining('unsupported Policy memo checkpoint 1'),
      calibrationCheck: expect.stringContaining('compare one strong and one partial Policy memo checkpoint 1'),
    });
    expect(blueprint.assessments[0].calibrationPlan).toMatchObject({
      anchorComparison: expect.stringContaining('evidence for Policy Topic 1'),
      scorerNorming: expect.stringContaining('compare one strong and one partial Policy memo checkpoint 1'),
      biasCheck: expect.stringContaining('rubric evidence for Policy Topic 1'),
      studentTransparency: expect.stringContaining('criteria'),
      postScoreReview: expect.stringContaining('what feedback changed'),
    });
    expect(blueprint.assessments[0].criterionEvidenceMap[0]).toMatchObject({
      criterion: expect.stringContaining('Policy Topic 1 accuracy'),
      evidenceNeeded: expect.stringContaining('inspectable Policy Topic 1 detail'),
      strongSignal: expect.stringContaining('Strong evidence names'),
      partialSignal: expect.stringContaining('Partial evidence mentions Policy Topic 1'),
      feedbackMove: expect.stringContaining('tying the Policy Topic 1 evidence'),
      calibrationQuestion: expect.stringContaining('compare one strong and one partial Policy memo checkpoint 1'),
    });
    expect(blueprint.assessments[0].anchorExampleSet).toMatchObject({
      strongSample: expect.stringContaining('Strong Policy memo checkpoint 1 anchor'),
      partialSample: expect.stringContaining('Partial Policy memo checkpoint 1 anchor'),
      scoringRationale: expect.stringContaining('Policy Topic 1 accuracy'),
      revisionPrompt: expect.stringContaining('making the Policy Topic 1 accuracy'),
      scorerCalibrationUse: expect.stringContaining('compare the strong and partial Policy memo checkpoint 1 anchors'),
      // v0.8.61: studentFacingUse speaks to the student directly instead of
      // describing an instructor move.
      studentFacingUse: expect.stringContaining('strong and partial Policy memo checkpoint 1 samples'),
    });
  });

  it('scrubs reusable scaffold phrases from physics compiled deliverables', () => {
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'Introductory Physics II: Electricity and Magnetism',
        semester: 'Fall 2026',
        lessons: [
          {
            title: 'Lesson 1: Electric Fields and Gauss Law',
            sections: [
              {
                topicSection: 'Electric field lines; flux; Gaussian surface',
                learningObjectives: 'Apply electric field and flux concepts to solve symmetry problems.',
                learningGoals: 'Connect electric field representations to quantitative physics problem solving.',
                weeklyAssessments: 'Electric field problem set',
                asyncActivities: 'Review worked examples on electric fields and flux.',
                syncActivities: 'Solve Gaussian-surface examples in groups.',
                supportingResources: 'OpenStax University Physics Volume 2, Ch. 5-6',
              },
            ],
          },
        ],
      },
      {
        enrichment: {
          lessonPhrases: {
            'lesson-1': {
              context: 'Week N covering field pattern',
              evidenceMove: 'use field pattern in the lesson evidence thread',
              decisionMove: 'Genre-specific quality focus: explain the field pattern',
            },
          },
        },
      },
    );

    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'studyGuides']);
    const text = JSON.stringify(compiled);

    expect(blueprint.enrichment.lens.domain).toBe('introductory physics problem solving');
    expect(text).toContain('worked-example evidence');
    expect(text).not.toMatch(/field pattern|Week N covering|lesson evidence thread|Genre-specific quality focus/i);
    expect(text).not.toMatch(/anchor examples before/i);
  });

  it('uses source-text cognitive demand when synthesizing sparse assessment anchors', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Patient Education Design Studio',
      lessons: [
        {
          title: 'Lesson 1: Discharge Instruction Prototype',
          sections: [
            {
              topicSection: 'Discharge instruction clarity; patient teach-back',
              learningObjectives:
                'Create a patient education script that adapts discharge instructions for a realistic care scenario.',
              learningGoals: 'Prepare students to communicate discharge instructions with patient-centered language.',
              weeklyAssessments: '',
              asyncActivities: 'Review sample discharge instructions; identify patient questions',
              syncActivities: 'Prototype a teach-back conversation and peer critique the script',
              supportingResources: 'Discharge instruction examples; patient communication checklist',
              evaluateDesign: '',
            },
          ],
        },
      ],
    });

    expect(blueprint.lessons[0]).toMatchObject({
      bloomsLevel: 'Create',
      assessmentSource: 'sparse-fallback',
      bloomInference: expect.objectContaining({
        level: 'Create',
        source: 'learning objectives',
        matchedVerb: 'create',
        fallbackUsed: false,
      }),
    });
    expect(blueprint.lessons[0].studentArtifact).toMatch(
      /Discharge Instruction Prototype (design draft|prototype brief|synthesis artifact|implementation note)/i,
    );
    expect(blueprint.assessments[0]).toMatchObject({
      bloomsLevel: 'Create',
      source: 'sparse-fallback',
      artifact: expect.stringMatching(
        /Discharge Instruction Prototype (design draft|prototype brief|synthesis artifact|implementation note)/i,
      ),
    });
  });

  it('filters selected features to the blueprint compiler set', () => {
    expect(getBlueprintCompiledFeatures(['courseMap', 'syllabus', 'lessonPlans', 'quizBank', 'studyGuides'])).toEqual([
      'syllabus',
      'lessonPlans',
      'quizBank',
      'studyGuides',
    ]);
    expect(getBlueprintCompiledFeatures(['syllabus'], { enabled: false })).toEqual([]);
  });

  it('validates the blueprint contract before compilation', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(3));
    const brokenBlueprint = {
      ...blueprint,
      learnerContextProfile: {},
      courseModalityProfile: {},
      classroomHandoffPlan: {},
      classroomDryRunPlan: {},
      classroomEvidenceLoopPlan: {},
      instructorFeedbackLoadPlan: {},
      sourceRiskRegister: {},
      compilerDecisionMatrix: {},
      assessmentArchitecture: {},
      blueprintAssumptionLedger: {},
      packageCoherenceMatrix: {},
      blueprintReviewSurface: {},
      conceptDependencyGraph: {},
      masteryEvidenceMap: {},
      evidenceResponseMap: {},
      objectiveEvidenceMap: {},
      lessons: [
        {
          ...blueprint.lessons[0],
          sourceAnchors: [],
          compilerDecision: {},
          sourceEvidenceTrace: null,
          sourceRisk: null,
          classSessionPlan: {},
          evidencePlan: {},
          sourceUsePlan: {},
          modelContrast: {},
          readinessSupport: {},
          prerequisitePlan: {},
          conceptDependencyPlan: {},
          practiceProgressionPlan: {},
          objectiveEvidencePlan: {},
          masteryEvidencePlan: {},
          evidenceResponsePlan: {},
          instructionalRationale: {},
          accessibilityPlan: {},
          feedbackCycle: {},
          learningTransferPlan: {},
          teachingIntent: {},
          learnerContextCue: '',
          modalityCue: '',
          modalityDecode: {},
          artifactGenre: {},
          bloomInference: null,
        },
      ],
      assessments: [],
      alignmentMatrix: [],
      totalLessons: 3,
    };

    const valid = validateCourseBlueprintContract(blueprint);
    const invalid = validateCourseBlueprintContract(brokenBlueprint);

    expect(valid).toMatchObject({
      status: 'pass',
      blockerCount: 0,
      lessonCount: 3,
    });
    expect(invalid.status).toBe('blocked');
    expect(invalid.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'lessonCoverage',
        'learnerContextProfile',
        'classroomHandoffPlan',
        'classroomDryRunPlan',
        'classroomEvidenceLoopPlan',
        'instructorFeedbackLoadPlan',
        'packageCoherenceMatrix',
        'sourceAnchors',
        'sourceEvidenceTrace',
        'sourceRiskRegister',
        'compilerDecisionMatrix',
        'compilerDecision',
        'assessmentArchitecture',
        'blueprintAssumptionLedger',
        'blueprintReviewSurface',
        'classSessionPlan',
        'bloomInference',
        'evidencePlan',
        'sourceUsePlan',
        'modelContrast',
        'readinessSupport',
        'prerequisitePlan',
        'instructionalRationale',
        'accessibilityPlan',
        'feedbackCycle',
        'learningTransferPlan',
        'teachingIntent',
        'learnerContextCue',
        'courseModalityProfile',
        'conceptDependencyGraph',
        'conceptDependencyPlan',
        'masteryEvidenceMap',
        'masteryEvidencePlan',
        'evidenceResponseMap',
        'evidenceResponsePlan',
        'objectiveEvidenceMap',
        'objectiveEvidencePlan',
        'modalityCue',
        'modalityDecode',
        'artifactGenre',
        'assessmentCoverage',
      ]),
    );
    expect(() =>
      compileBlueprintDeliverables(
        {
          ...brokenBlueprint,
          compilerContract: invalid,
        },
        ['syllabus'],
      ),
    ).toThrow(/Contract blocked compilation/);
    expect(
      compileBlueprintDeliverables(
        {
          ...brokenBlueprint,
          compilerContract: invalid,
        },
        ['syllabus'],
        { enforceCompilerContract: false },
      ).syllabus,
    ).toBeTruthy();
  });

  it('compiles a lean semantic blueprint by deriving compiler-owned proof surfaces', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(4));
    const leanBlueprint = {
      ...blueprint,
      lessons: blueprint.lessons.map((lesson) => ({
        ...lesson,
        workloadEstimate: undefined,
        difficultyProfile: undefined,
        classSessionPlan: undefined,
        modelContrast: undefined,
        readinessSupport: undefined,
        prerequisitePlan: undefined,
        conceptDependencyPlan: undefined,
        practiceProgressionPlan: undefined,
        objectiveEvidencePlan: undefined,
        masteryEvidencePlan: undefined,
        evidenceResponsePlan: undefined,
        instructionalRationale: undefined,
        accessibilityPlan: undefined,
        feedbackCycle: undefined,
        learningTransferPlan: undefined,
        teachingIntent: undefined,
        learnerContextCue: '',
        modalityCue: '',
        modalityDecode: undefined,
        artifactGenre: undefined,
        bloomInference: undefined,
        bloomsLevel: '',
      })),
      semanticContract: undefined,
      compilerProofBundle: undefined,
      compilerContract: {
        status: 'blocked',
        blockerCount: 1,
        findings: [{ severity: 'blocker', code: 'staleLegacyAudit', message: 'Old audit result from restored state.' }],
      },
      assessmentArchitecture: undefined,
      alignmentMatrix: [],
      courseArc: undefined,
      conceptDependencyGraph: undefined,
      masteryEvidenceMap: undefined,
      evidenceResponseMap: undefined,
      objectiveEvidenceMap: undefined,
      courseWorkload: undefined,
      classroomHandoffPlan: undefined,
      classroomDryRunPlan: undefined,
      classroomEvidenceLoopPlan: undefined,
      instructorFeedbackLoadPlan: undefined,
      blueprintAssumptionLedger: undefined,
      packageCoherenceMatrix: undefined,
      blueprintReviewSurface: undefined,
      compilerDecisionMatrix: undefined,
    };

    expect(validateBlueprintSemanticContract(leanBlueprint)).toMatchObject({
      status: 'pass',
      blockerCount: 0,
      lessonCount: 4,
    });
    expect(validateCourseBlueprintContract(leanBlueprint).status).toBe('blocked');

    const proofBundle = buildCompilerProofBundle(leanBlueprint);
    expect(proofBundle).toMatchObject({
      status: 'pass',
      modelFallback: 'not used for blueprint-compiled deliverables',
      proofSummary: {
        lessonCount: 4,
        dryRunRows: 4,
        evidenceLoopRows: 4,
        feedbackLoadRows: 4,
        coherenceRows: 4,
        verificationStatus: 'verified-by-reading-derived-state',
      },
    });

    const featureIds = ['syllabus', 'lessonPlans', 'assignments', 'rubrics'];
    const compiled = compileBlueprintDeliverables(leanBlueprint, featureIds);
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(4);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.dryRunChecklist.length).toBeGreaterThan(0);
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt).toMatchObject({
      semanticContract: {
        status: 'pass',
      },
      compilerProofBundle: {
        status: 'pass',
        proofSummary: {
          verificationStatus: 'verified-by-reading-derived-state',
        },
      },
    });
    expect(validateCompilerOutputContract({ blueprint: leanBlueprint, compiled, featureIds })).toMatchObject({
      status: 'pass',
      compiledFeatureCount: featureIds.length,
      proofBundleStatus: 'pass',
      semanticStatus: 'pass',
    });
  });

  it('stores compact blueprint atoms and hydrates compiler-owned proof state after reload', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(8));
    const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
    const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint);
    const hydratedBytes = Buffer.byteLength(JSON.stringify(hydratedBlueprint));
    const storedBytes = Buffer.byteLength(JSON.stringify(storedBlueprint));

    expect(blueprint.blueprintStorageVersion).toBe(2);
    expect(storedBlueprint.blueprintStorageVersion).toBe(2);
    expect(storedBytes).toBeLessThan(hydratedBytes * 0.1);
    expect(blueprint.courseArc.throughline).toContain('evidence, practice, feedback');
    expect(blueprint.compilerProofBundle.proofSummary.verificationStatus).toBe('verified-by-reading-derived-state');
    expect(blueprint.lessons[0].compilerDecision).toMatchObject({
      source: 'deterministic-compiler-decision',
      generationPath: 'deterministic-compile',
    });

    expect(storedBlueprint.compilerProofBundle).toBeUndefined();
    expect(storedBlueprint.assessmentArchitecture).toBeUndefined();
    expect(storedBlueprint.alignmentMatrix).toBeUndefined();
    expect(storedBlueprint.courseArc).toBeUndefined();
    expect(storedBlueprint.conceptDependencyGraph).toBeUndefined();
    expect(storedBlueprint.masteryEvidenceMap).toBeUndefined();
    expect(storedBlueprint.evidenceResponseMap).toBeUndefined();
    expect(storedBlueprint.objectiveEvidenceMap).toBeUndefined();
    expect(storedBlueprint.courseWorkload).toBeUndefined();
    expect(storedBlueprint.classroomHandoffPlan).toBeUndefined();
    expect(storedBlueprint.classroomDryRunPlan).toBeUndefined();
    expect(storedBlueprint.classroomEvidenceLoopPlan).toBeUndefined();
    expect(storedBlueprint.instructorFeedbackLoadPlan).toBeUndefined();
    expect(storedBlueprint.blueprintAssumptionLedger).toBeUndefined();
    expect(storedBlueprint.packageCoherenceMatrix).toBeUndefined();
    expect(storedBlueprint.blueprintReviewSurface).toBeUndefined();
    expect(storedBlueprint.compilerDecisionMatrix).toBeUndefined();
    expect(storedBlueprint.compilerPath).toBeUndefined();
    expect(storedBlueprint.semanticContract).toBeUndefined();
    expect(storedBlueprint.compilerContract).toBeUndefined();

    // v0.14.1 (3.2): weight/weightPercent joined the persisted anchor keys —
    // the registry path's grading weights must survive storage (kind/
    // registryId/dueSession persist too, but only registry anchors carry
    // them; this legacy anchor does not).
    expect(Object.keys(storedBlueprint.assessments[0]).sort()).toEqual(
      ['artifact', 'id', 'lessonNumbers', 'relatedLessons', 'source', 'title', 'weight', 'weightPercent'].sort(),
    );
    expect(storedBlueprint.assessments[0]).toMatchObject({
      id: 'assessment-1',
      title: 'Policy memo checkpoint 1',
      artifact: 'Policy memo checkpoint 1',
      lessonNumbers: [1],
      source: 'course-map',
    });
    expect(storedBlueprint.assessments[0].criteria).toBeUndefined();
    expect(storedBlueprint.assessments[0].criterionWeightPlan).toBeUndefined();
    expect(storedBlueprint.assessments[0].validityEvidence).toBeUndefined();
    expect(storedBlueprint.assessments[0].calibrationPlan).toBeUndefined();
    expect(storedBlueprint.assessments[0].criterionObjectiveAlignment).toBeUndefined();
    expect(storedBlueprint.assessments[0].anchorExampleSet).toBeUndefined();
    expect(storedBlueprint.assessments[0].cadence).toBeUndefined();
    expect(storedBlueprint.lessons[0].compilerDecision).toBeUndefined();
    expect(storedBlueprint.lessons[0].sourceRisk).toBeUndefined();
    expect(storedBlueprint.lessons[0].sourceEvidenceTrace.sectionCoverage).toBeUndefined();
    expect(storedBlueprint.lessons[0].sourceEvidenceTrace.preservedSignals).toBeUndefined();
    expect(storedBlueprint.lessons[0].sourceEvidenceTrace.reviewerUse).toBeUndefined();
    expect(storedBlueprint.lessons[0].sourceEvidenceTrace.sourceFields.length).toBeGreaterThanOrEqual(6);

    expect(validateBlueprintSemanticContract(storedBlueprint)).toMatchObject({
      status: 'warnings',
      blockerCount: 0,
      warningCount: 8,
    });
    expect(hydratedBlueprint.compilerContract).toMatchObject({
      status: 'pass',
      lessonCount: 8,
      assessmentCount: 8,
    });
    expect(hydratedBlueprint.assessments[0].criterionWeightPlan).toHaveLength(4);
    expect(hydratedBlueprint.lessons[0].compilerDecision).toMatchObject({
      source: 'deterministic-compiler-decision',
      generationPath: 'deterministic-compile',
    });

    const featureIds = [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ];
    const compiled = compileBlueprintDeliverables(storedBlueprint, featureIds, {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    expect(validateCompilerOutputContract({ blueprint: storedBlueprint, compiled, featureIds })).toMatchObject({
      status: 'pass',
      compiledFeatureCount: featureIds.length,
      proofBundleStatus: 'pass',
      semanticStatus: 'pass',
    });
    for (const featureId of featureIds) {
      const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
        expectedLessonCount: 8,
        config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
      });
      expect(validation.valid, `${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
    }
  });

  it('keeps the compiler-output contract stable across prompt styles and lesson scopes', () => {
    const scenarios = [
      {
        name: 'policy studio scoped weeks',
        courseMap: makeCourseMap(8),
        scopeIndices: [0, 2, 4],
        featureIds: ['syllabus', 'lessonPlans', 'courseFaq'],
      },
      {
        name: 'large policy package',
        courseMap: makeCourseMap(14),
        scopeIndices: null,
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'quizBank'],
      },
      {
        name: 'biology lab',
        courseMap: makeBiologyLabCourseMap(),
        scopeIndices: null,
        featureIds: ['lessonPlans', 'studyGuides', 'quizBank'],
      },
      {
        name: 'programming lab subset',
        courseMap: makeProgrammingLabCourseMap(),
        scopeIndices: [0, 1, 3],
        featureIds: ['lessonPlans', 'assignments', 'rubrics'],
      },
      {
        name: 'data science lab',
        courseMap: makeDataScienceLabCourseMap(),
        scopeIndices: null,
        featureIds: ['syllabus', 'lessonPlans', 'slideDecks'],
      },
      {
        name: 'engineering design checkpoints',
        courseMap: makeEngineeringDesignLabCourseMap(),
        scopeIndices: [0, 2],
        featureIds: ['lessonPlans', 'assignments', 'courseFaq'],
      },
      {
        name: 'online writing',
        courseMap: makeOnlineWritingCourseMap(),
        scopeIndices: null,
        featureIds: ['syllabus', 'lessonPlans', 'studyGuides'],
      },
      {
        name: 'quantitative problem set',
        courseMap: makeQuantitativeProblemSetCourseMap(),
        scopeIndices: null,
        featureIds: ['lessonPlans', 'quizBank', 'rubrics'],
      },
      {
        name: 'capstone project',
        courseMap: makeCapstoneProjectCourseMap(),
        scopeIndices: [0, 1, 2],
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'courseFaq'],
      },
      {
        name: 'counseling practice',
        courseMap: makeCounselingPracticeCourseMap(),
        scopeIndices: null,
        featureIds: ['syllabus', 'lessonPlans', 'discussions'],
      },
    ];

    for (const scenario of scenarios) {
      const blueprint = buildCourseBlueprint(scenario.courseMap, {
        ...(scenario.scopeIndices ? { scopeIndices: scenario.scopeIndices } : {}),
      });
      const leanBlueprint = {
        ...blueprint,
        compilerProofBundle: undefined,
        classroomDryRunPlan: undefined,
        classroomEvidenceLoopPlan: undefined,
        instructorFeedbackLoadPlan: undefined,
        blueprintAssumptionLedger: undefined,
        packageCoherenceMatrix: undefined,
        blueprintReviewSurface: undefined,
      };
      const compiled = compileBlueprintDeliverables(leanBlueprint, scenario.featureIds);
      const outputContract = validateCompilerOutputContract({
        blueprint: leanBlueprint,
        compiled,
        featureIds: scenario.featureIds,
      });

      expect(validateBlueprintSemanticContract(leanBlueprint).status, scenario.name).toBe('pass');
      expect(
        outputContract.status,
        `${scenario.name}: ${outputContract.findings.map((item) => item.code).join(', ')}`,
      ).toBe('pass');
      if (compiled.lessonPlans) {
        expect(compiled.lessonPlans.lessonPlans, scenario.name).toHaveLength(blueprint.lessons.length);
      }
    }
  });

  it('hydrates compact blueprint storage across ten real course scenarios', () => {
    const scenarios = [
      {
        name: 'biology lab methods',
        courseMap: makeBiologyLabCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'quizBank'],
      },
      {
        name: 'world language proficiency',
        courseMap: makeWorldLanguageCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'discussions', 'studyGuides'],
      },
      {
        name: 'performing arts studio',
        courseMap: makePerformingArtsCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'discussions'],
      },
      {
        name: 'programming lab',
        courseMap: makeProgrammingLabCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'quizBank'],
      },
      {
        name: 'data science lab',
        courseMap: makeDataScienceLabCourseMap(),
        featureIds: ['syllabus', 'lessonPlans', 'slideDecks', 'quizBank'],
      },
      {
        name: 'engineering design lab',
        courseMap: makeEngineeringDesignLabCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'courseFaq'],
      },
      {
        name: 'online writing workshop',
        courseMap: makeOnlineWritingCourseMap(),
        featureIds: ['syllabus', 'lessonPlans', 'discussions', 'studyGuides'],
      },
      {
        name: 'quantitative problem set',
        courseMap: makeQuantitativeProblemSetCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'rubrics', 'quizBank'],
      },
      {
        name: 'business case method',
        courseMap: makeBusinessCaseCourseMap(),
        featureIds: ['lessonPlans', 'assignments', 'discussions', 'courseFaq'],
      },
      {
        name: 'constitutional law doctrine',
        courseMap: makeConstitutionalLawCourseMap(),
        featureIds: ['syllabus', 'lessonPlans', 'assignments', 'rubrics'],
      },
    ];

    for (const scenario of scenarios) {
      const blueprint = buildCourseBlueprint(scenario.courseMap);
      const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
      const hydratedBlueprint = hydrateBlueprintForCompilation(storedBlueprint);
      const storedBytes = Buffer.byteLength(JSON.stringify(storedBlueprint));
      const hydratedBytes = Buffer.byteLength(JSON.stringify(hydratedBlueprint));
      const semanticContract = validateBlueprintSemanticContract(storedBlueprint);
      const compiled = compileBlueprintDeliverables(storedBlueprint, scenario.featureIds, {
        configMap: { courseFaq: { questionsPerLesson: 5 } },
      });
      const outputContract = validateCompilerOutputContract({
        blueprint: storedBlueprint,
        compiled,
        featureIds: scenario.featureIds,
      });

      expect(storedBytes, scenario.name).toBeLessThan(hydratedBytes * 0.15);
      expect(storedBlueprint.compilerProofBundle, scenario.name).toBeUndefined();
      expect(storedBlueprint.courseArc, scenario.name).toBeUndefined();
      expect(storedBlueprint.assessments[0].criteria, scenario.name).toBeUndefined();
      expect(storedBlueprint.lessons[0].compilerDecision, scenario.name).toBeUndefined();
      expect(semanticContract.blockerCount, scenario.name).toBe(0);
      expect(hydratedBlueprint.compilerContract.status, scenario.name).not.toBe('blocked');
      expect(hydratedBlueprint.compilerContract.blockerCount, scenario.name).toBe(0);
      expect(hydratedBlueprint.compilerProofBundle.proofSummary.verificationStatus, scenario.name).toBe(
        'verified-by-reading-derived-state',
      );
      expect(
        outputContract.status,
        `${scenario.name}: ${outputContract.findings.map((item) => item.code).join(', ')}`,
      ).toBe('pass');

      for (const featureId of scenario.featureIds) {
        const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
          expectedLessonCount: storedBlueprint.lessons.length,
          config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
        });
        expect(validation.valid, `${scenario.name} ${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
      }
    }
  }, 20000);

  it('compiles stable deliverables in existing app shapes', () => {
    const courseMap = makeCourseMap(6);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ]);

    expect(compiled.syllabus.syllabus.courseTitle).toBe(courseMap.courseName);
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(6);
    expect(compiled.lessonPlans.lessonPlans[0].outline).toHaveLength(6);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.studentHandout).toContain('success criteria');
    expect(compiled.lessonPlans.lessonPlans[0].blueprintGrounding).toMatchObject({
      confidence: 'high',
      evidencePlan: expect.objectContaining({
        evidenceRequirement: expect.stringContaining('Use a concrete detail'),
      }),
      sourceEvidenceTrace: expect.objectContaining({
        sourceFields: expect.arrayContaining([
          expect.objectContaining({
            field: 'assessment artifact',
            rawText: expect.stringContaining('Policy memo checkpoint 1'),
          }),
        ]),
      }),
      sourceUsePlan: expect.objectContaining({
        noInventedSources: expect.stringContaining('Do not invent authors'),
      }),
      compilerDecision: expect.objectContaining({
        generationPath: 'deterministic-compile',
        publishGate: 'instructor-spot-check-before-publish',
        modelUsePolicy: expect.stringContaining('Do not use a model to invent missing course facts'),
      }),
      modelContrast: expect.objectContaining({
        exemplarMove: expect.stringContaining('Strong Policy memo checkpoint 1 work'),
      }),
      readinessSupport: expect.objectContaining({
        supportMove: expect.stringContaining('sentence frame'),
      }),
      prerequisitePlan: expect.objectContaining({
        diagnosticCheck: expect.stringContaining('define Policy Topic 1'),
      }),
      conceptDependencyPlan: expect.objectContaining({
        transferCue: expect.stringContaining('Policy memo checkpoint 2'),
      }),
      practiceProgressionPlan: expect.objectContaining({
        practiceFocus: expect.stringContaining('stakeholder'),
      }),
      masteryEvidencePlan: expect.objectContaining({
        independentPerformanceEvidence: expect.stringContaining('Policy memo checkpoint 1'),
        feedbackRevisionEvidence: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
        masteryThreshold: expect.stringContaining('Strong evidence names'),
      }),
      evidenceResponsePlan: expect.objectContaining({
        readyMove: expect.stringContaining('compare two possible evidence choices'),
        partialMove: expect.stringContaining('criterion-level feedback'),
        supportMove: expect.stringContaining('sentence frame'),
      }),
      instructionalRationale: expect.objectContaining({
        assessmentRationale: expect.stringContaining('appropriate performance evidence'),
      }),
      accessibilityPlan: expect.objectContaining({
        participationProtocol: expect.stringContaining('written or spoken response options'),
      }),
      feedbackCycle: expect.objectContaining({
        studentRevisionAction: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      }),
      learningTransferPlan: expect.objectContaining({
        transferTask: expect.stringContaining('Policy memo checkpoint 2'),
      }),
      teachingIntent: expect.objectContaining({
        teachingGoal: expect.stringContaining('evidence-backed Policy Topic 1 decisions'),
      }),
      modalityCue: expect.stringContaining('policy-analysis'),
      modalityDecode: expect.objectContaining({
        signaturePractice: expect.stringContaining('stakeholder'),
      }),
      artifactGenre: expect.objectContaining({
        genre: 'policy-brief',
        outputFormat: expect.stringContaining('Policy memo checkpoint 1'),
      }),
      courseModalityProfile: expect.objectContaining({
        primaryMode: 'policy-analysis',
      }),
      assessmentValidity: expect.objectContaining({
        targetConstruct: expect.stringContaining('Policy memo checkpoint 1'),
      }),
      criterionObjectiveAlignment: expect.arrayContaining([
        expect.objectContaining({
          objective: expect.stringContaining('Analyze policy evidence 1'),
          strategy: 'source-evidence-objective-match',
        }),
      ]),
      anchorExampleSet: expect.objectContaining({
        strongSample: expect.stringContaining('Strong Policy memo checkpoint 1 anchor'),
      }),
    });
    expect(compiled.lessonPlans.lessonPlans[0].instructionalRationale.assessmentRationale).toContain(
      'appropriate performance evidence',
    );
    expect(compiled.lessonPlans.lessonPlans[0].accessibilityPlan.participationProtocol).toContain(
      'written or spoken response options',
    );
    expect(compiled.lessonPlans.lessonPlans[0].feedbackCycle.studentRevisionAction).toContain(
      'evidence-backed Policy Topic 1 reasoning',
    );
    expect(compiled.lessonPlans.lessonPlans[0].learningTransferPlan.transferTask).toContain('Policy memo checkpoint 2');
    expect(compiled.lessonPlans.lessonPlans[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.lessonPlans.lessonPlans[0].conceptDependencyPlan.transferCue).toContain('Policy memo checkpoint 2');
    expect(compiled.lessonPlans.lessonPlans[0].practiceProgressionPlan.practiceFocus).toContain('stakeholder');
    expect(compiled.lessonPlans.lessonPlans[0].masteryEvidencePlan.masteryThreshold).toContain('Strong evidence names');
    expect(compiled.lessonPlans.lessonPlans[0].evidenceResponsePlan.partialMove).toContain('criterion-level feedback');
    expect(compiled.lessonPlans.lessonPlans[0].classSessionPlan).toMatchObject({
      feasibilityStatus: 'fits-session',
      plannedClassMinutes: 110,
      sessionMinutes: 110,
    });
    expect(compiled.lessonPlans.lessonPlans[0].classroomDryRun).toMatchObject({
      lessonNumber: 1,
      firstTenMinutes: expect.stringContaining('define Policy Topic 1'),
      evidenceCheckpoint: expect.stringContaining('Policy Topic 1'),
      likelyFailureMode: expect.stringContaining('Policy Topic 1'),
      instructorAdjustment: expect.stringContaining('sentence frame'),
    });
    expect(compiled.lessonPlans.lessonPlans[0].classroomEvidenceLoop).toMatchObject({
      lessonNumber: 1,
      implementationFocus: expect.stringContaining('Policy Topic 1'),
      studentWorkSampleCue: expect.stringContaining('Policy memo checkpoint 1'),
      adjustmentDecision: expect.stringContaining('feedback changed'),
      preferenceLearningSignal: expect.stringContaining('instructor edits'),
    });
    expect(compiled.lessonPlans.lessonPlans[0].instructorFeedbackLoad).toMatchObject({
      lessonNumber: 1,
      assessmentTitle: expect.stringContaining('Policy memo checkpoint 1'),
      estimatedFeedbackMinutes: expect.any(Number),
      batchingStrategy: expect.stringContaining('Policy memo checkpoint 1'),
      calibrationCue: expect.stringContaining('strong and one partial'),
    });
    expect(compiled.lessonPlans.lessonPlans[0].outlineTiming).toMatchObject({
      outlineMinutes: 110,
      status: 'fits-session',
    });
    expect(compiled.lessonPlans.lessonPlans[0].prerequisiteKnowledge).toContain('prior example');
    expect(compiled.lessonPlans.lessonPlans[0].teachingIntent.feedbackDecision).toContain('criterion-level feedback');
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport).toMatchObject({
      dryRunChecklist: expect.arrayContaining([expect.stringContaining('Policy Topic 1')]),
      dryRunOpeningCheck: expect.stringContaining('define Policy Topic 1'),
      dryRunEvidenceCheckpoint: expect.stringContaining('Policy Topic 1'),
      dryRunFailureMode: expect.stringContaining('Policy Topic 1'),
      dryRunInstructorAdjustment: expect.stringContaining('sentence frame'),
      implementationEvidenceToCollect: expect.arrayContaining([expect.stringContaining('Policy Topic 1')]),
      implementationStudentWorkSampleCue: expect.stringContaining('Policy memo checkpoint 1'),
      implementationAdjustmentDecision: expect.stringContaining('feedback changed'),
      implementationPreferenceLearningSignal: expect.stringContaining('instructor edits'),
      feedbackLoadEstimate: expect.stringContaining('Policy memo checkpoint 1'),
      feedbackBatchingStrategy: expect.stringContaining('Policy memo checkpoint 1'),
      feedbackCalibrationCue: expect.stringContaining('strong and one partial'),
      feedbackNextInstructionCue: expect.stringContaining('Policy memo checkpoint 2'),
      workedExample: expect.stringContaining('Strong Policy memo checkpoint 1 work'),
      nonExample: expect.stringContaining('Weak Policy memo checkpoint 1 work'),
      contrastQuestion: expect.stringContaining('evidence for Policy Topic 1'),
      transferPrompt: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      targetedSupport: expect.stringContaining('sentence frame'),
      extensionChallenge: expect.stringContaining('compare two possible evidence choices'),
      feedbackProtocol: expect.stringContaining('criterion-level feedback'),
      revisionClosure: expect.stringContaining('what feedback changed'),
      retrievalPractice: expect.stringContaining('low-stakes quiz item'),
      prerequisiteDiagnostic: expect.stringContaining('define Policy Topic 1'),
      prerequisiteReteach: expect.stringContaining('sentence frame'),
      conceptDependencyCue: expect.stringContaining('checking readiness for Policy Topic 1'),
      conceptTransferCue: expect.stringContaining('Policy memo checkpoint 2'),
      practiceProgressionCue: expect.stringContaining('stakeholder'),
      masteryDiagnosticEvidence: expect.stringContaining('ready when they can cite'),
      masteryGuidedPracticeEvidence: expect.stringContaining('stakeholder/equity effect'),
      masteryPerformanceEvidence: expect.stringContaining('Policy memo checkpoint 1'),
      masteryRevisionEvidence: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      masteryTransferEvidence: expect.stringContaining('Policy memo checkpoint 2'),
      masteryThreshold: expect.stringContaining('Strong evidence names'),
      evidenceReadyResponse: expect.stringContaining('compare two possible evidence choices'),
      evidencePartialResponse: expect.stringContaining('criterion-level feedback'),
      evidenceSupportResponse: expect.stringContaining('sentence frame'),
      evidenceResponseRecheck: expect.stringContaining('what feedback changed'),
      transferTask: expect.stringContaining('Policy memo checkpoint 2'),
      teachingIntentSummary: expect.stringContaining('evidence-backed Policy Topic 1 decisions'),
      modalityFit: expect.stringContaining('policy-analysis'),
      modalityPractice: expect.stringContaining('stakeholder'),
      modalityEvidenceRoutine: expect.stringContaining('stakeholder/equity effect'),
      modalityFeedbackRoutine: expect.stringContaining('implementation risk'),
      timingFit: expect.stringContaining('110/110 live minutes'),
      artifactGenreFit: expect.stringContaining('policy-brief'),
      genreReviewProtocol: expect.stringContaining('problem definition and authority'),
      genreCommonFailure: expect.stringContaining('without a precise public problem'),
      genreRevisionMove: expect.stringContaining('implementation risk'),
      assessmentAnchorExamples: expect.objectContaining({
        strongSample: expect.stringContaining('Strong Policy memo checkpoint 1 anchor'),
      }),
      anchorExampleStrong: expect.stringContaining('Strong Policy memo checkpoint 1 anchor'),
      sourceIntegrityCheck: expect.stringContaining('Do not invent authors'),
      learnerContextCue: expect.stringContaining('Policy Topic 1'),
    });
    expect(compiled.slideDecks.decks).toHaveLength(6);
    expect(compiled.slideDecks.decks[0].slides).toHaveLength(12);
    expect(compiled.slideDecks.decks[0].sourceGrounding).toMatchObject({
      confidence: 'high',
      difficulty: expect.any(String),
      sourceCue: expect.any(String),
      learnerContextCue: expect.stringContaining('Policy Topic 1'),
    });
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.learningTransferPlan.transferTask).toContain(
      'Policy memo checkpoint 2',
    );
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.prerequisitePlan.diagnosticCheck).toContain(
      'define Policy Topic 1',
    );
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.teachingIntent.teachingGoal).toContain(
      'evidence-backed Policy Topic 1 decisions',
    );
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.modalityFit).toMatchObject({
      courseModalityProfile: expect.objectContaining({ primaryMode: 'policy-analysis' }),
      modalityCue: expect.stringContaining('policy-analysis'),
      modalityDecode: expect.objectContaining({
        signaturePractice: expect.stringContaining('stakeholder'),
      }),
    });
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.classSessionPlan).toMatchObject({
      feasibilityStatus: 'fits-session',
      plannedClassMinutes: 110,
    });
    expect(compiled.slideDecks.decks[0].slideTimingFit).toMatchObject({
      status: 'fits-session-with-activity-time',
      sessionMinutes: 110,
    });
    expect(compiled.slideDecks.decks[0].slides[3].visual).toMatchObject({
      kind: 'learning-thread timeline',
      visualPlan: expect.objectContaining({
        slidePurpose: expect.stringContaining('Policy Topic 1'),
        evidenceSource: expect.stringContaining('Case packet'),
        artifactConnection: expect.stringContaining('Policy memo checkpoint 1'),
        modalityFit: expect.stringContaining('stakeholder'),
        artifactGenreFit: expect.stringContaining('problem framing'),
        accessibilityCheck: expect.stringContaining('Alt text'),
      }),
    });
    expect(compiled.slideDecks.decks[0].slides[5].visual.kind).toBe('evidence table');
    expect(['diagram', 'table', 'chart', 'image']).not.toContain(compiled.slideDecks.decks[0].slides[5].visual.kind);
    expect(
      Math.max(
        ...compiled.slideDecks.decks.flatMap((deck) =>
          deck.slides.map((slide) => countWords([slide.title, ...(slide.bullets || [])].join(' '))),
        ),
      ),
    ).toBeLessThanOrEqual(120);
    const activitySlide = compiled.slideDecks.decks[0].slides.find((slide) => slide.type === 'activity');
    expect(activitySlide.notes).toContain('Detailed activity sequence');
    expect(activitySlide.notes).toContain('stakeholder');
    expect(compiled.slideDecks.decks[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.artifactGenreFit).toMatchObject({
      artifactGenre: expect.objectContaining({ genre: 'policy-brief' }),
      reviewProtocol: expect.stringContaining('problem definition and authority'),
    });
    expect(compiled.syllabus.syllabus.weeklySchedule).toHaveLength(6);
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt).toMatchObject({
      confidenceLevel: 'high',
      reviewFlagCount: 0,
      compilerPath: {
        mode: 'deterministic',
        source: 'deterministic-blueprint',
        enrichmentCallCount: 0,
        adaptiveSafety: {
          status: 'ready-with-spot-check',
        },
      },
      learnerContextProfile: {
        learnerRole: expect.stringContaining('policy analyst'),
      },
      courseModalityProfile: {
        primaryMode: 'policy-analysis',
      },
      classroomHandoffPlan: {
        status: 'ready-with-spot-check',
        publishBoundary: expect.stringContaining('Do not publish'),
      },
      classroomDryRunPlan: {
        status: 'ready-for-classroom-dry-run',
        source: 'deterministic-classroom-dry-run-plan',
        lessonRowCount: 6,
        reviewRequiredCount: 0,
      },
      classroomEvidenceLoopPlan: {
        status: 'ready-for-implementation-evidence',
        source: 'deterministic-classroom-evidence-loop',
        lessonRowCount: 6,
        reviewRequiredCount: 0,
      },
      instructorFeedbackLoadPlan: {
        status: 'feedback-load-ready',
        source: 'deterministic-instructor-feedback-load-plan',
        lessonRowCount: 6,
        averageEstimatedFeedbackMinutes: expect.any(Number),
      },
      sourceRiskRegister: {
        status: 'clear-with-spot-check',
        highRiskCount: 0,
      },
      compilerDecisionMatrix: {
        status: 'ready-with-spot-check',
        reviewRequiredCount: 0,
      },
      assessmentArchitecture: {
        status: 'balanced',
        totalWeightPercent: 100,
      },
      packageCoherenceMatrix: {
        status: 'coherent',
        missingFieldCount: 0,
      },
      blueprintReviewSurface: {
        status: 'review-ready-with-local-confirmations',
        traceabilitySummary: {
          status: 'traceable',
        },
        courseDecode: {
          modality: 'policy-analysis',
        },
      },
      timingStatus: 'fits-session',
      averagePlannedClassMinutes: 110,
      compilerContract: {
        status: 'pass',
        blockerCount: 0,
      },
    });
    expect(compiled.syllabus.syllabus.lessonAlignmentMatrix).toHaveLength(6);
    expect(compiled.syllabus.syllabus.courseModalityProfile.primaryMode).toBe('policy-analysis');
    expect(compiled.syllabus.syllabus.learnerContextProfile.supportAssumptions[0]).toContain('Policy Topic 1');
    expect(compiled.syllabus.syllabus.classroomHandoffPlan.lessonReviewOrder[0].lessonTitle).toContain(
      'Policy Topic 1',
    );
    expect(compiled.syllabus.syllabus.classroomDryRunPlan.lessonRows[0]).toMatchObject({
      lessonNumber: 1,
      dryRunFocus: expect.stringContaining('Policy Topic 1'),
      evidenceCheckpoint: expect.stringContaining('Policy Topic 1'),
    });
    expect(compiled.syllabus.syllabus.classroomEvidenceLoopPlan.lessonRows[0]).toMatchObject({
      lessonNumber: 1,
      implementationFocus: expect.stringContaining('Policy Topic 1'),
      adjustmentDecision: expect.stringContaining('feedback changed'),
    });
    expect(compiled.syllabus.syllabus.instructorFeedbackLoadPlan.lessonRows[0]).toMatchObject({
      lessonNumber: 1,
      assessmentTitle: expect.stringContaining('Policy memo checkpoint 1'),
      batchingStrategy: expect.stringContaining('Policy memo checkpoint 1'),
    });
    expect(compiled.syllabus.syllabus.packageCoherenceMatrix.lessonRows[0]).toMatchObject({
      lessonNumber: 1,
      assessmentArtifact: expect.stringContaining('Policy memo checkpoint 1'),
      assessmentRole: 'Diagnostic checkpoint',
      assessmentCadenceCue: expect.stringContaining('next class session'),
      sourceEvidenceCue: expect.stringContaining('assessment artifact: course-map'),
      sourceRiskLevel: 'none',
      compilerDecisionCue: 'deterministic-compile',
      publishGate: 'instructor-spot-check-before-publish',
      sourceUseCue: expect.stringContaining('Do not invent authors'),
      prerequisiteCue: expect.stringContaining('define Policy Topic 1'),
      teachingIntentCue: expect.stringContaining('evidence-backed Policy Topic 1 decisions'),
      modalityCue: expect.stringContaining('policy-analysis'),
      modalityDecodeCue: expect.stringContaining('stakeholder'),
      artifactGenreCue: 'policy-brief',
      classSessionCue: expect.stringContaining('110/110 minutes'),
    });
    expect(compiled.syllabus.syllabus.sourceUsePolicy.noInventedSources).toContain('Do not invent authors');
    expect(compiled.syllabus.syllabus.lessonAlignmentMatrix[0]).toMatchObject({
      week: 'Week 1',
      assessmentArtifact: expect.stringContaining('Policy memo checkpoint 1'),
      sourceEvidenceCue: expect.stringContaining('assessment artifact: course-map'),
      sourceRiskLevel: 'none',
      compilerDecisionCue: 'deterministic-compile',
      publishGate: 'instructor-spot-check-before-publish',
      sourceUseCue: expect.stringContaining('Do not invent authors'),
      prerequisiteCue: expect.stringContaining('define Policy Topic 1'),
      modelContrastCue: expect.stringContaining('evidence for Policy Topic 1'),
      readinessSupportCue: expect.stringContaining('sentence frame'),
      instructionalRationaleCue: expect.stringContaining('appropriate performance evidence'),
      accessibilityCue: expect.stringContaining('written or spoken response options'),
      feedbackCycleCue: expect.stringContaining('evidence-backed Policy Topic 1 reasoning'),
      learningTransferCue: expect.stringContaining('Policy memo checkpoint 2'),
      teachingIntentCue: expect.stringContaining('evidence-backed Policy Topic 1 decisions'),
      modalityCue: expect.stringContaining('policy-analysis'),
      modalityDecodeCue: expect.stringContaining('stakeholder'),
      artifactGenreCue: 'policy-brief',
      artifactGenreOutputFormat: expect.stringContaining('Policy memo checkpoint 1'),
      classSessionCue: expect.stringContaining('110/110 minutes'),
      assessmentRoleCue: 'Diagnostic checkpoint',
      assessmentCadenceCue: expect.stringContaining('next class session'),
      criterionWeightCue: expect.stringContaining('source-grounded concept evidence: 30%'),
      gradingCalibrationCue: expect.stringContaining('rubric evidence for Policy Topic 1'),
      criterionEvidenceCue: expect.stringContaining('inspectable Policy Topic 1 detail'),
      anchorExampleCue: expect.stringContaining('Strong Policy memo checkpoint 1 anchor'),
      status: 'aligned',
    });
    expect(compiled.assignments.assignments).toHaveLength(6);
    expect(compiled.assignments.assignments[0].misconceptionToWatch.misconception).toContain('definition to memorize');
    expect(compiled.assignments.assignments[0].citationAndSourceUse.noInventedSources).toContain(
      'Do not invent authors',
    );
    expect(compiled.assignments.assignments[0].academicIntegrityStatement).toContain('Do not invent authors');
    expect(compiled.assignments.assignments[0].modelContrast.exemplarMove).toContain(
      'Strong Policy memo checkpoint 1 work',
    );
    expect(compiled.assignments.assignments[0].readinessSupport.supportMove).toContain('sentence frame');
    expect(compiled.assignments.assignments[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.assignments.assignments[0].scaffoldingMilestones[0].milestone).toBe('Prerequisite readiness check');
    expect(
      new Set(compiled.assignments.assignments.map((assignment) => assignment.workloadEstimate.outOfClassEstimate))
        .size,
    ).toBeGreaterThan(1);
    expect(
      new Set(compiled.assignments.assignments.map((assignment) => assignment.formatRequirements.citationStyle)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(compiled.assignments.assignments.map((assignment) => assignment.scaffoldingMilestones[0].milestone)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(compiled.assignments.assignments.map((assignment) => assignment.progressTracking)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(compiled.assignments.assignments.map((assignment) => assignment.citationAndSourceUse.noInventedSources))
        .size,
    ).toBeGreaterThan(1);
    expect(compiled.assignments.assignments[0].instructionalRationale.assessmentRationale).toContain(
      'appropriate performance evidence',
    );
    expect(compiled.assignments.assignments[0].accessibilityPlan.expression).toContain('memo');
    expect(compiled.assignments.assignments[0].accessibilityAndUDL).toContain('captions or alt text');
    expect(compiled.assignments.assignments[0].feedbackCycle.studentRevisionAction).toContain(
      'evidence-backed Policy Topic 1 reasoning',
    );
    expect(compiled.assignments.assignments[0].teachingIntent.teachingGoal).toContain(
      'evidence-backed Policy Topic 1 decisions',
    );
    expect(compiled.assignments.assignments[0].revisionCheck).toContain('what feedback changed');
    expect(compiled.assignments.assignments[0].assessmentValidity.targetConstruct).toContain(
      'Policy memo checkpoint 1',
    );
    expect(compiled.assignments.assignments[0].assessmentArchitecture).toMatchObject({
      role: 'diagnostic-checkpoint',
      roleLabel: 'Diagnostic checkpoint',
      cadence: expect.objectContaining({
        feedbackWindow: expect.stringContaining('next class session'),
      }),
    });
    expect(compiled.assignments.assignments[0].assessmentCadence.feedbackWindow).toContain('next class session');
    expect(compiled.assignments.assignments[0].revisionUse).toContain('readiness feedback');
    expect(compiled.assignments.assignments[0].criterionWeightPlan.map((entry) => entry.weight)).toEqual([
      30, 30, 20, 20,
    ]);
    expect(compiled.assignments.assignments[0].criterionWeightGuidance).toContain(
      'source-grounded concept evidence 30%',
    );
    expect(compiled.assignments.assignments[0].weightedGradingCriteria[0].calibrationUse).toContain(
      'Policy memo checkpoint 1',
    );
    expect(compiled.assignments.assignments[0].validityCheck.calibrationCheck).toContain(
      'compare one strong and one partial Policy memo checkpoint 1',
    );
    expect(compiled.assignments.assignments[0].gradingCalibration.biasCheck).toContain(
      'rubric evidence for Policy Topic 1',
    );
    expect(compiled.assignments.assignments[0].criterionEvidenceChecklist[0].evidenceNeeded).toContain(
      'inspectable Policy Topic 1 detail',
    );
    expect(compiled.assignments.assignments[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.assignments.assignments[0].anchorExampleGuidance[0]).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.assignments.assignments[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.assignments.assignments[0].modalityCue).toContain('policy-analysis');
    expect(compiled.assignments.assignments[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.assignments.assignments[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.assignments.assignments[0].assignmentType).toBe('Policy analysis memo');
    expect(compiled.assignments.assignments[0].estimatedTime).not.toBe('2-4 hours');
    expect(compiled.assignments.assignments[0].submissionProfile).toMatchObject({
      assignmentType: 'Policy analysis memo',
      artifactGenre: 'policy-brief',
      expectedFormat: expect.stringContaining('Policy memo checkpoint 1'),
      reviewProtocol: expect.stringContaining('problem definition and authority'),
      estimatedTime: expect.stringMatching(/hours this week \(\d+ min in class/),
      workload: expect.objectContaining({
        totalStudentMinutes: expect.any(Number),
        outOfClassEstimate: expect.stringContaining('outside class'),
      }),
    });
    expect(compiled.assignments.assignments[0].expectedSubmissionFormat).toContain('Expected format');
    expect(compiled.assignments.assignments[0].expectedSubmissionFormat).toContain('Evidence standard');
    expect(compiled.assignments.assignments[0].formatRequirements.format).toContain('Policy memo checkpoint 1');
    expect(compiled.assignments.assignments[0].artifactGenreReviewProtocol).toContain(
      'problem definition and authority',
    );
    expect(compiled.assignments.assignments[0].courseModalityProfile.primaryMode).toBe('policy-analysis');
    expect(compiled.assignments.assignments[0].sourceGrounding.learnerContextProfile.learnerRole).toContain(
      'policy analyst',
    );
    expect(compiled.assignments.assignments[0].sourceGrounding.sourceEvidenceTrace.sourceFields[0]).toMatchObject({
      field: 'lesson identity',
      source: 'course-map',
    });
    expect(compiled.assignments.assignments[0].sourceGrounding.sourceRisk).toMatchObject({
      riskLevel: 'none',
      reviewRequired: false,
    });
    expect(compiled.assignments.assignments[0].sourceGrounding.assessmentArchitecture.role).toBe(
      'diagnostic-checkpoint',
    );
    expect(compiled.assignments.assignments[0].sourceGrounding.criterionWeightPlan[0].weight).toBe(30);
    expect(compiled.assignments.assignments[0].sourceGrounding.criterionObjectiveAlignment[0]).toMatchObject({
      objective: expect.stringContaining('Analyze policy evidence 1'),
      strategy: 'source-evidence-objective-match',
    });
    expect(compiled.assignments.assignments[0].sourceGrounding.courseModalityProfile.primaryMode).toBe(
      'policy-analysis',
    );
    expect(compiled.assignments.assignments[0].selfAssessmentRubric[0]).toContain('(30%)');
    expect(compiled.assignments.assignments[0].selfAssessmentRubric[0]).toContain('inspectable Policy Topic 1 detail');
    expect(compiled.assignments.assignments[0].workloadEstimate.totalStudentMinutes).toBeGreaterThan(150);
    expect(compiled.rubrics.rubrics).toHaveLength(6);
    expect(compiled.rubrics.rubrics[0].assessmentValidity.validityThreat).toContain(
      'unsupported Policy memo checkpoint 1',
    );
    expect(compiled.rubrics.rubrics[0].assessmentArchitecture).toMatchObject({
      role: 'diagnostic-checkpoint',
      roleLabel: 'Diagnostic checkpoint',
      cadence: expect.objectContaining({
        feedbackWindow: expect.stringContaining('next class session'),
      }),
    });
    expect(compiled.rubrics.rubrics[0].gradePolicyConnection).toContain('Diagnostic checkpoint');
    expect(compiled.rubrics.rubrics[0].sourceUsePlan.noInventedSources).toContain('Do not invent authors');
    expect(compiled.rubrics.rubrics[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.rubrics.rubrics[0].instructorFacilitationNote).toContain('Prerequisite check');
    expect(compiled.rubrics.rubrics[0].instructorFacilitationNote).toContain('Source check');
    expect(compiled.rubrics.rubrics[0].instructionalRationale.practiceRationale).toContain('evidence choices');
    expect(compiled.rubrics.rubrics[0].accessibilityPlan.accommodationReviewCue).toContain('captions or alt text');
    expect(compiled.rubrics.rubrics[0].accessibilityAndUDL).toContain('memo');
    expect(compiled.rubrics.rubrics[0].feedbackCycle.feedbackMethod).toContain('criterion-level feedback');
    expect(compiled.rubrics.rubrics[0].teachingIntent.feedbackDecision).toContain('criterion-level feedback');
    expect(compiled.rubrics.rubrics[0].instructorFacilitationNote).toContain('Calibration check');
    expect(compiled.rubrics.rubrics[0].calibrationProtocol.biasCheck).toContain('rubric evidence for Policy Topic 1');
    expect(compiled.rubrics.rubrics[0].criterionEvidenceMap[0].strongSignal).toContain('Strong evidence names');
    expect(compiled.rubrics.rubrics[0].criterionWeightPlan.map((entry) => entry.weight)).toEqual([30, 30, 20, 20]);
    expect(compiled.rubrics.rubrics[0].criterionWeightGuidance).toContain('analysis and decision logic 30%');
    expect(compiled.rubrics.rubrics[0].criteria[0]).toMatchObject({
      weight: 30,
      points: 30,
      priority: 'source-grounded concept evidence',
      weightingRationale: expect.stringContaining('Policy memo checkpoint 1'),
      objectiveAligned: expect.stringContaining('Analyze policy evidence 1'),
      objectiveAlignmentEvidence: expect.objectContaining({
        strategy: 'source-evidence-objective-match',
      }),
      evidenceSignal: expect.stringContaining('inspectable Policy Topic 1 detail'),
      calibrationUse: expect.stringContaining('Policy memo checkpoint 1'),
      exemplary: expect.stringMatching(/Case packet|Instructor-provided course materials|the Lesson 1 materials/),
      proficient: expect.stringContaining('Policy Topic 1'),
      developing: expect.stringContaining('evidence link'),
      beginning: expect.stringContaining('unsupported claims'),
      performanceBandEvidence: expect.objectContaining({
        priority: 'source-grounded concept evidence',
        scorerQuestion: expect.stringContaining('Policy memo checkpoint 1'),
        commonPitfall: expect.stringContaining('Do not give full credit'),
        revisionTarget: expect.stringContaining('Policy memo checkpoint 1'),
      }),
    });
    expect(compiled.rubrics.rubrics[0].criteria[1]).toMatchObject({
      priority: 'analysis and decision logic',
      objectiveAligned: expect.stringContaining('Evaluate implementation tradeoffs 1'),
      objectiveAlignmentEvidence: expect.objectContaining({
        strategy: 'analysis-decision-objective-match',
      }),
      exemplary: expect.stringContaining('decision in Policy memo checkpoint 1'),
      performanceBandEvidence: expect.objectContaining({
        commonPitfall: expect.stringContaining('decision logic'),
      }),
    });
    expect(compiled.rubrics.rubrics[0].criteria[3]).toMatchObject({
      priority: 'feedback-informed revision',
      exemplary: expect.stringContaining('feedback-informed change'),
    });
    expect(compiled.rubrics.rubrics[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.rubrics.rubrics[0].anchorExamples.strongSample).toContain('Strong Policy memo checkpoint 1 anchor');
    expect(compiled.rubrics.rubrics[0].anchorExamples.exemplary).toContain('Strong evidence names');
    expect(compiled.rubrics.rubrics[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.rubrics.rubrics[0].modalityCue).toContain('policy-analysis');
    expect(compiled.rubrics.rubrics[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.rubrics.rubrics[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.rubrics.rubrics[0].taskDirections).toContain('Policy brief');
    expect(compiled.rubrics.rubrics[0].courseModalityProfile.primaryMode).toBe('policy-analysis');
    expect(compiled.discussions.discussions).toHaveLength(6);
    expect(compiled.discussions.discussions[0].sourceGrounding.evidenceRequirement).toContain('Use a concrete detail');
    expect(compiled.discussions.discussions[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.discussions.discussions[0].modalityCue).toContain('policy-analysis');
    expect(compiled.discussions.discussions[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.discussions.discussions[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.discussions.discussions[0].format).toBe('Policy Option Clinic');
    expect(compiled.discussions.discussions[0].estimatedDuration).toBe('25-30 min');
    expect(compiled.discussions.discussions[0].discussionProtocol).toMatchObject({
      format: 'Policy Option Clinic',
      modality: 'policy-analysis',
      artifactGenre: 'policy-brief',
      participationPattern: expect.stringContaining('problem definition check'),
      artifactUse: expect.stringContaining('Policy memo checkpoint 1'),
      reviewFocus: expect.stringContaining('problem framing'),
      modalityFit: expect.stringContaining('policy-analysis'),
      artifactGenreFit: expect.stringContaining('Policy brief'),
    });
    expect(compiled.discussions.discussions[0].prerequisitePrompt).toContain('define Policy Topic 1');
    expect(compiled.discussions.discussions[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.discussions.discussions[0].sourceGrounding.courseModalityProfile.primaryMode).toBe(
      'policy-analysis',
    );
    expect(compiled.discussions.discussions[0].sourceGrounding.discussionProtocol.format).toBe('Policy Option Clinic');
    expect(compiled.discussions.discussions[0].followUpProbes).toHaveLength(5);
    expect(compiled.discussions.discussions[0].feedbackCycle.closureCheck).toContain('what feedback changed');
    expect(compiled.discussions.discussions[0].teachingIntent.transferMove).toContain('Policy memo checkpoint 2');
    expect(compiled.discussions.discussions[0].facilitationTips.revisionCapture).toContain('what feedback changed');
    expect(compiled.discussions.discussions[0].facilitationTips.closure).toContain('problem framing');
    expect(compiled.discussions.discussions[0].guidelines).toContain('problem definition check');
    expect(compiled.quizBank.quizzes).toHaveLength(6);
    expect(compiled.quizBank.quizzes[0].blueprintGrounding.misconceptionFocus).toContain('definition to memorize');
    expect(compiled.quizBank.quizzes[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.quizBank.quizzes[0].modalityCue).toContain('policy-analysis');
    expect(compiled.quizBank.quizzes[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.quizBank.quizzes[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.quizBank.quizzes[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.quizBank.quizzes[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.quizBank.quizzes[0].blueprintGrounding.courseModalityProfile.primaryMode).toBe('policy-analysis');
    expect(compiled.quizBank.quizzes[0].learningTransferPlan.spacedPracticeCue).toContain('low-stakes quiz item');
    expect(compiled.quizBank.quizzes[0].teachingIntent.evidenceOfLearning).toContain('Use a concrete detail');
    expect(compiled.quizBank.quizzes[0].questions).toHaveLength(6);
    expect(compiled.quizBank.quizzes[0].quizBlueprint).toMatchObject({
      source: 'source-grounded-quiz-plan',
      lessonBloom: 'Evaluate',
      questionPlan: expect.arrayContaining([
        expect.objectContaining({
          role: 'quality-evaluation',
          bloomSource: 'success criteria and calibration plan',
          objectiveAlignmentStrategy: 'analysis-decision-objective-match',
        }),
      ]),
    });
    // v0.14.1 (5.4): coverage states only the levels actually present on the
    // items (stem-verb derived), deduped and in taxonomy order — the old pin
    // byte-encoded the audited "all five levels in every quiz" defect.
    expect(compiled.quizBank.quizzes[0].bloomsCoverage).toEqual(['Understand', 'Apply', 'Create']);
    expect(compiled.quizBank.quizzes[0].quizBlueprint.questionPlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'transfer-synthesis',
          bloom: 'Create',
          bloomSource: 'transfer plan and lesson cognitive demand',
        }),
      ]),
    );
    expect(compiled.quizBank.quizzes[0].blueprintGrounding.quizBlueprint[0]).toMatchObject({
      source: 'source-grounded-quiz-plan',
      bloomSource: 'prerequisite diagnostic',
    });
    expect(compiled.quizBank.quizzes[0].questions[0].quizPlan).toMatchObject({
      source: 'source-grounded-quiz-plan',
      role: 'diagnostic-retrieval',
      bloomSource: 'prerequisite diagnostic',
    });
    expect(compiled.quizBank.quizzes[0].questions[4]).toMatchObject({
      // v0.14.1 (5.4): the tag follows the question's stem verb ("Which use
      // of evidence…" → Apply); the planned Evaluate level stays visible in
      // quizPlan.bloom as provenance.
      bloomsLevel: 'Apply',
      objectiveAligned: expect.stringContaining('Evaluate implementation tradeoffs 1'),
      quizPlan: expect.objectContaining({
        role: 'quality-evaluation',
        bloom: 'Evaluate',
        objectiveAlignmentStrategy: 'analysis-decision-objective-match',
      }),
    });
    expect(compiled.quizBank.quizzes[0].questions[5]).toMatchObject({
      bloomsLevel: 'Create',
      quizPlan: expect.objectContaining({
        role: 'transfer-synthesis',
      }),
    });
    // v0.14.1 (5.4) Bloom honesty: every quiz's coverage line must equal the
    // set of its items' actual tags (the old pin demanded all five levels in
    // every quiz — the audited verbatim-coverage defect).
    expect(
      compiled.quizBank.quizzes.every((quiz) => {
        const itemLevels = new Set(quiz.questions.map((question) => question.bloomsLevel));
        return (
          quiz.bloomsCoverage.length === itemLevels.size && quiz.bloomsCoverage.every((level) => itemLevels.has(level))
        );
      }),
    ).toBe(true);
    expect(compiled.quizBank.bankIndex).toHaveLength(36);
    expect(compiled.studyGuides.studyGuides).toHaveLength(6);
    expect(compiled.studyGuides.studyGuides[0].sourceGrounding.workloadEstimate).toBeTruthy();
    expect(compiled.studyGuides.studyGuides[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.studyGuides.studyGuides[0].modalityCue).toContain('policy-analysis');
    expect(compiled.studyGuides.studyGuides[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.studyGuides.studyGuides[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.studyGuides.studyGuides[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.studyGuides.studyGuides[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.studyGuides.studyGuides[0].sourceGrounding.courseModalityProfile.primaryMode).toBe(
      'policy-analysis',
    );
    expect(compiled.studyGuides.studyGuides[0].learningTransferPlan.metacognitivePrompt).toContain('reuse');
    expect(compiled.studyGuides.studyGuides[0].teachingIntent.studentRevisionMove).toContain(
      'evidence-backed Policy Topic 1 reasoning',
    );
    expect(
      new Set(
        compiled.studyGuides.studyGuides.map(
          (guide) => guide.reviewQuestions.find((question) => question.bloomsLevel === 'Apply')?.question || '',
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(compiled.studyGuides.studyGuides[0].commonMisconceptions[0].misconception).toContain(
      'definition to memorize',
    );
    expect(compiled.courseFaq.faqs).toHaveLength(6);
    // v0.16 B4: default FAQ depth is 7 (two demand-driven entries added).
    expect(compiled.courseFaq.faqs[0].qs).toHaveLength(7);
    expect(compiled.courseFaq.faqGuide.sourceGroundingPolicy).toContain('source anchors');
    expect(compiled.courseFaq.faqs[0].sourceGrounding).toMatchObject({
      confidence: 'high',
      evidenceRequirement: expect.stringContaining('Use a concrete detail'),
      learnerContextCue: expect.stringContaining('Policy Topic 1'),
    });
    expect(compiled.courseFaq.faqs[0].learnerContextCue).toContain('Policy Topic 1');
    expect(compiled.courseFaq.faqs[0].modalityCue).toContain('policy-analysis');
    expect(compiled.courseFaq.faqs[0].modalityDecode.signaturePractice).toContain('stakeholder');
    expect(compiled.courseFaq.faqs[0].artifactGenre.genre).toBe('policy-brief');
    expect(compiled.courseFaq.faqs[0].prerequisitePlan.diagnosticCheck).toContain('define Policy Topic 1');
    expect(compiled.courseFaq.faqs[0].anchorExampleSet.strongSample).toContain(
      'Strong Policy memo checkpoint 1 anchor',
    );
    expect(compiled.courseFaq.faqs[0].qs[2].an).toContain('Policy brief');
    expect(compiled.courseFaq.faqs[0].qs[2].an).toContain('Strong Policy memo checkpoint 1 anchor');
    expect(compiled.courseFaq.faqs[0].sourceGrounding.courseModalityProfile.primaryMode).toBe('policy-analysis');
    expect(compiled.courseFaq.faqs[0].teachingIntent.feedbackDecision).toContain('criterion-level feedback');
  });

  it('applies learned instructor preferences when a profile is provided', () => {
    const preferenceProfile = buildInstructorPreferenceProfile([
      { featureId: 'rubrics', field: 'criteria', action: 'accepted', accessCount: 5, importance: 4 },
      { featureId: 'quizBank', field: 'question', action: 'accepted' },
      { featureId: 'slideDecks', field: 'slides.notes', action: 'edited' },
      { featureId: 'lessonPlans', field: 'outline.duration', action: 'edited' },
      { featureId: 'courseMap', field: 'editTitle', action: 'accepted' },
    ]);
    const blueprint = buildCourseBlueprint(makeCourseMap(3), { instructorPreferences: preferenceProfile });
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
    ]);

    expect(blueprint.instructorPreferenceProfile).toMatchObject({
      signalCount: 5,
      feedbackStyle: 'criterion-specific',
    });
    expect(blueprint.qualitySignals.instructorPreferenceSignals).toBe(5);
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt.instructorPreferenceProfile).toMatchObject({
      signalCount: 5,
      summary: expect.stringContaining('criterion-specific feedback'),
    });
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.instructorPrep).toContain('practice-heavy pacing');
    expect(compiled.slideDecks.decks[0].sourceGrounding.instructorPreference).toContain(
      'concise course-specific notes',
    );
    expect(compiled.rubrics.rubrics[0].teacherNotes).toContain('rubric criteria');
    expect(compiled.assignments.assignments[0].sourceGrounding.instructorPreference).toContain('criterion-specific');
    expect(compiled.discussions.discussions[0].guidelines).toContain('rubric criteria');
    expect(compiled.quizBank.quizzes[0].assessmentBlueprint).toContain('applied analysis');
  });

  it('surfaces enriched compiler path evidence in the syllabus receipt', () => {
    const enrichment = {
      source: 'model-blueprint-enrichment',
      signatureTerms: ['policy evidence', 'implementation tradeoff'],
      lens: {
        domain: 'applied policy studio',
        evidenceNoun: 'policy evidence',
        decisionNoun: 'implementation tradeoff',
      },
      quality: {
        status: 'accepted',
        sourceGroundingSignalCount: 4,
        specificWordCount: 7,
        genericPhraseCount: 0,
      },
    };
    const blueprint = buildCourseBlueprint(makeCourseMap(3), {
      enrichment,
      compilerPath: {
        mode: 'enriched',
        reason: 'Adaptive compiler accepted source-grounded enrichment before deterministic output.',
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus']);

    expect(blueprint.compilerPath).toMatchObject({
      mode: 'enriched',
      source: 'enriched-blueprint',
      deterministicCompiler: true,
      enrichmentCallCount: 1,
      adaptiveSafety: {
        status: 'ready-with-spot-check',
        recommendedPath: 'enriched-compile-with-instructor-spot-check',
      },
      reason: expect.stringContaining('Adaptive compiler accepted'),
    });
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt).toMatchObject({
      compilerPath: {
        mode: 'enriched',
        source: 'enriched-blueprint',
        enrichmentCallCount: 1,
        adaptiveSafety: {
          modelFallback: 'not used for blueprint-compiled deliverables',
        },
      },
      enrichmentQuality: {
        status: 'accepted',
        sourceGroundingSignalCount: 4,
      },
      enrichmentLanguage: {
        source: 'model-blueprint-enrichment',
        signatureTerms: expect.arrayContaining(['policy evidence', 'implementation tradeoff']),
        lens: {
          domain: 'applied policy studio',
          evidenceNoun: 'policy evidence',
          decisionNoun: 'implementation tradeoff',
        },
      },
    });
  });

  it('keeps learner context aligned to the enrichment lens', () => {
    const fieldCourseMap = {
      courseName: 'Human Services Field Placement Seminar',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Week 1: Placement Roles and Site Expectations',
          sections: [
            {
              topicSection: 'Field placement roles, site evidence, stakeholder questions, professional boundaries',
              learningObjectives: 'Analyze site evidence and choose a grounded placement decision.',
              learningGoals: 'Connect field placement expectations to ethical practice decisions.',
              weeklyAssessments:
                'Field placement learning contract with site evidence, role boundaries, stakeholder questions, and review target.',
              asyncActivities: 'Read the placement handbook and annotate site expectations.',
              syncActivities: 'Site-expectation case roundtable with role sorting and evidence check.',
              supportingResources: 'Placement handbook; learning-contract template; site evidence checklist',
              evaluateDesign: 'Score role clarity, site-evidence grounding, and boundary awareness.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(fieldCourseMap, {
      enrichment: {
        source: 'curated-gold-sample-enrichment',
        signatureTerms: ['field placement', 'site evidence', 'stakeholder interview'],
        lens: {
          domain: 'field placement practice',
          evidenceNoun: 'field evidence',
          decisionNoun: 'placement decision',
          learnerRole: 'field practitioner',
          exampleNoun: 'site-based practice scenario',
        },
      },
    });

    expect(blueprint.learnerContextProfile).toMatchObject({
      domain: 'field placement practice',
      evidenceNoun: 'field evidence',
      decisionNoun: 'placement decision',
      learnerRole: 'field practitioner',
    });
    expect(blueprint.learnerContextProfile.coursePerformanceRole).toContain('field evidence');
    expect(blueprint.learnerContextProfile.coursePerformanceRole).toContain('placement decision');
    expect(blueprint.lessons[0].learnerContextCue).toContain('field practitioner');
    expect(blueprint.lessons[0].learnerContextCue).toContain('field evidence');
    expect(blueprint.lessons[0].learnerContextCue).toContain('placement decision');
  });

  it('blends clinical modality into reused community-health lenses', () => {
    const clinicalCourseMap = {
      courseName: 'Community Health Clinical Studio',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Week 1: Clinical Placement Orientation',
          sections: [
            {
              topicSection: 'Clinical placement orientation, patient handoff, stakeholder context',
              learningObjectives:
                'Analyze implementation evidence and practice patient-facing clinical communication decisions.',
              learningGoals: 'Connect program context to safe clinical simulation choices.',
              weeklyAssessments:
                'Community health evaluation memo with implementation evidence plus a role-play debrief note.',
              asyncActivities: 'Review placement handbook and patient-safety communication examples.',
              syncActivities: 'Clinical simulation with role-play, debrief, and implementation evidence check.',
              supportingResources: 'Placement handbook; role-play script; stakeholder evidence checklist',
              evaluateDesign: 'Score implementation evidence, program decision logic, and safe communication.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(clinicalCourseMap, {
      enrichment: {
        source: 'curated-gold-sample-enrichment',
        signatureTerms: ['health equity', 'stakeholder evidence', 'implementation evidence'],
        lens: {
          domain: 'community health evaluation',
          evidenceNoun: 'implementation evidence',
          decisionNoun: 'program decision',
          learnerRole: 'evaluation practitioner',
          exampleNoun: 'community implementation case',
        },
      },
    });

    expect(blueprint.courseModalityProfile.primaryMode).toBe('clinical-simulation');
    expect(blueprint.learnerContextProfile).toMatchObject({
      domain: 'clinical community health evaluation',
      learnerRole: 'clinical evaluation practitioner',
    });
    expect(blueprint.learnerContextProfile.evidenceNoun).toContain('implementation evidence');
    expect(blueprint.learnerContextProfile.evidenceNoun).toContain('role-play evidence');
    expect(blueprint.learnerContextProfile.decisionNoun).toContain('program decision');
    expect(blueprint.learnerContextProfile.decisionNoun).toContain('clinical communication decision');
    expect(blueprint.learnerContextProfile.coursePerformanceRole).toContain('clinical evaluation practitioners');
    expect(blueprint.learnerContextProfile.coursePerformanceRole).toContain(
      'program decisions or clinical communication decisions',
    );
    expect(blueprint.lessons[0].learnerContextCue).toContain('clinical evaluation practitioner');
    expect(blueprint.lessons[0].learnerContextCue).toContain('role-play evidence');
    expect(blueprint.lessons[0].learnerContextCue).toContain('clinical communication decision');
  });

  it('decodes clinical judgment courses as care planning instead of generic role-play', () => {
    const clinicalJudgmentCourseMap = {
      courseName: 'Nursing Clinical Judgment and Care Planning',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: Patient Assessment and Cue Recognition',
          sections: [
            {
              topicSection: 'Patient assessment data, vital signs, clinical cues, safety risk, prioritization',
              learningObjectives: 'Prioritize patient assessment cues and justify an initial clinical care decision.',
              learningGoals: 'Build clinical judgment from patient evidence and safety priorities.',
              weeklyAssessments:
                'Clinical care plan with patient assessment data, nursing diagnosis, safety priority, and monitoring plan.',
              asyncActivities: 'Review EHR chart excerpts and identify relevant assessment cues.',
              syncActivities: 'Patient case simulation with cue sorting, priority ranking, and SBAR handoff debrief.',
              supportingResources: 'Patient chart excerpt; SBAR template; nursing diagnosis guide',
              evaluateDesign: 'Score cue recognition, prioritization, intervention rationale, and safety monitoring.',
            },
          ],
        },
        {
          title: 'Lesson 2: Medication Safety and Intervention Rationale',
          sections: [
            {
              topicSection: 'Medication administration, contraindications, intervention rationale, monitoring cues',
              learningObjectives:
                'Choose a safe intervention and explain medication-safety monitoring from patient data.',
              learningGoals: 'Use patient-assessment evidence to defend clinical care decisions.',
              weeklyAssessments:
                'Medication-safety rationale and revised care plan with escalation cue and SBAR handoff.',
              asyncActivities: 'Annotate medication orders and patient lab values for safety risks.',
              syncActivities: 'Clinical judgment conference with intervention comparison and debrief revision.',
              supportingResources: 'Medication administration checklist; lab value reference; SBAR handoff sample',
              evaluateDesign: 'Score safety reasoning, intervention fit, monitoring clarity, and handoff usefulness.',
            },
          ],
        },
        {
          title: 'Lesson 3: Deteriorating Patient Priorities',
          sections: [
            {
              topicSection: 'Clinical deterioration, risk assessment, escalation cue, urgent intervention priority',
              learningObjectives:
                'Rank clinical priorities for a deteriorating patient and justify escalation with assessment data.',
              learningGoals: 'Connect patient safety, clinical cue recognition, and intervention selection.',
              weeklyAssessments:
                'Escalation-focused care plan with risk assessment, priority intervention, monitoring plan, and SBAR update.',
              asyncActivities: 'Review trending vital signs and charting notes for a patient whose condition changes.',
              syncActivities:
                'Clinical judgment simulation with prioritization huddle, intervention safety review, and SBAR handoff.',
              supportingResources: 'Deterioration case; rapid-response criteria; clinical judgment worksheet',
              evaluateDesign: 'Score priority setting, escalation rationale, safety monitoring, and handoff clarity.',
            },
          ],
        },
        {
          title: 'Lesson 4: Integrated Care Plan and Handoff',
          sections: [
            {
              topicSection: 'ADPIE cycle, integrated care plan, interdisciplinary handoff, patient-safety debrief',
              learningObjectives:
                'Integrate patient-assessment evidence into a complete care plan and communicate it through SBAR.',
              learningGoals:
                'Synthesize clinical judgment, nursing diagnosis, intervention rationale, and handoff evidence.',
              weeklyAssessments:
                'Final clinical judgment map and care plan with nursing diagnosis, interventions, monitoring, and SBAR handoff.',
              asyncActivities: 'Prepare a care-plan draft from EHR notes, lab values, and patient assessment findings.',
              syncActivities: 'Care-plan conference with safety challenge, peer debrief, and handoff revision.',
              supportingResources: 'ADPIE guide; care-plan rubric; SBAR handoff exemplar',
              evaluateDesign:
                'Score integrated patient-assessment evidence, clinical care decision quality, safety rationale, and communication.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(clinicalJudgmentCourseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'clinical-judgment-simulation',
      sessionPattern: expect.stringContaining('patient case assessment'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('patient case'),
        evidenceRoutine: expect.stringContaining('patient-assessment data'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('clinical-simulation');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'clinical judgment and care planning',
      evidenceNoun: 'patient-assessment evidence',
      decisionNoun: 'clinical care decision',
      learnerRole: 'clinical decision maker',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(Array(4).fill('clinical-care-plan'));
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'patient cue and safety check',
      'clinical judgment model',
      'prioritization and care-plan build',
      'intervention safety and monitoring review',
      'SBAR handoff and debrief',
      'clinical transfer handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain('patient case');
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Clinical care plan and safety rationale',
      artifactGenre: expect.objectContaining({ genre: 'clinical-care-plan' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('clinical care plan'),
        evidenceRequirement: expect.stringContaining('patient-assessment data'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Clinical Judgment Conference',
      modalityDecode: expect.objectContaining({ mode: 'clinical-judgment-simulation' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('patient-cue sort'),
        reviewFocus: expect.stringContaining('handoff clarity'),
      }),
    });
  });

  it('decodes clinical placement practicums as supervised site evidence instead of simulation', () => {
    const clinicalPlacementCourseMap = {
      courseName: 'Nursing Clinical Placement Practicum',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Week 1: Clinical Site Orientation and Confidentiality',
          sections: [
            {
              topicSection: 'Clinical placement orientation, clinical site expectations, HIPAA, scope of practice',
              learningObjectives:
                'Explain site expectations, confidentiality rules, and scope limits before supervised patient care.',
              learningGoals: 'Prepare for safe supervised clinical practice with patient-safety boundaries.',
              weeklyAssessments:
                'Clinical placement readiness checklist with confidentiality check, site expectation, and scope-of-practice note.',
              asyncActivities: 'Review placement handbook, HIPAA guidance, and site supervisor expectations.',
              syncActivities:
                'Clinical conference with site-readiness scenarios, confidentiality screen, and scope boundary debrief.',
              supportingResources: 'Placement handbook; HIPAA guide; clinical site orientation checklist',
              evaluateDesign: 'Score confidentiality, site readiness, scope awareness, and patient-safety reasoning.',
            },
          ],
        },
        {
          title: 'Week 2: Patient Encounter Logs and Preceptor Feedback',
          sections: [
            {
              topicSection:
                'Deidentified patient encounter log, preceptor feedback, supervised practice evidence, patient safety',
              learningObjectives:
                'Use deidentified patient-care evidence and preceptor feedback to revise a placement decision.',
              learningGoals: 'Connect supervised clinical evidence to safe next-shift action.',
              weeklyAssessments:
                'Patient encounter log with deidentified site evidence, preceptor feedback, safety action, and follow-up plan.',
              asyncActivities: 'Annotate sample encounter logs for deidentification, safety cues, and feedback uptake.',
              syncActivities:
                'Preceptor-feedback review conference with competency target, patient-safety challenge, and handoff revision.',
              supportingResources: 'Encounter log template; preceptor feedback form; patient-safety checklist',
              evaluateDesign:
                'Score evidence grounding, deidentification, preceptor-feedback uptake, and safety action.',
            },
          ],
        },
        {
          title: 'Week 3: Skills Checklist and Competency Progression',
          sections: [
            {
              topicSection:
                'Skills checklist, competency log, site supervisor observation, scope boundary, remediation target',
              learningObjectives:
                'Calibrate a competency-log entry against site-supervisor observation and scope-of-practice limits.',
              learningGoals: 'Use supervised practice evidence to document clinical competency progression.',
              weeklyAssessments:
                'Competency log update with skills checklist evidence, site supervisor note, scope boundary, and remediation plan.',
              asyncActivities: 'Compare sample competency logs and identify unsupported competency claims.',
              syncActivities:
                'Competency calibration conference with skills evidence, supervisor observation, and remediation planning.',
              supportingResources: 'Skills checklist; competency log template; site supervisor observation sample',
              evaluateDesign: 'Score competency evidence, calibration accuracy, scope awareness, and remediation plan.',
            },
          ],
        },
        {
          title: 'Week 4: Clinical Handoff and Placement Transfer',
          sections: [
            {
              topicSection:
                'Clinical handoff, patient-safety transfer, preceptor follow-up, site evaluation, next placement goal',
              learningObjectives:
                'Synthesize placement evidence into a safe handoff, site evaluation, and next clinical learning goal.',
              learningGoals: 'Transfer supervised clinical evidence into safer future placement decisions.',
              weeklyAssessments:
                'Final clinical placement evidence portfolio with handoff note, site evaluation, preceptor feedback, and next-shift action plan.',
              asyncActivities:
                'Prepare final deidentified placement artifacts and tag evidence for safety and competency growth.',
              syncActivities:
                'Clinical placement conference with handoff boundary review, site evaluation debrief, and transfer plan.',
              supportingResources: 'Site evaluation form; handoff checklist; clinical placement portfolio rubric',
              evaluateDesign:
                'Score patient-safety transfer, preceptor evidence, handoff clarity, competency growth, and confidentiality.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(clinicalPlacementCourseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'clinical-placement-practicum',
      sessionPattern: expect.stringContaining('preceptor evidence review'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('supervised clinical placement evidence'),
        evidenceRoutine: expect.stringContaining('preceptor feedback'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('clinical-simulation');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('field-applied');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'clinical placement practice',
      evidenceNoun: 'supervised clinical evidence',
      decisionNoun: 'clinical placement decision',
      learnerRole: 'clinical placement practitioner',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('clinical-placement-evidence'),
    );
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'clinical site readiness and confidentiality check',
      'preceptor evidence model',
      'supervised practice evidence review',
      'competency log and safety feedback',
      'handoff boundary and debrief',
      'placement transfer plan',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'supervised clinical placement evidence',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Clinical placement evidence and preceptor-feedback record',
      artifactGenre: expect.objectContaining({ genre: 'clinical-placement-evidence' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('clinical hours log'),
        evidenceRequirement: expect.stringContaining('preceptor'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Clinical Placement Conference',
      modalityDecode: expect.objectContaining({ mode: 'clinical-placement-practicum' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('preceptor-feedback review'),
        reviewFocus: expect.stringContaining('scope of practice'),
      }),
    });
  });

  it('decodes general world-language courses as communicative proficiency practice, not clinical simulation', () => {
    const blueprint = buildCourseBlueprint(makeWorldLanguageCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'world-language',
      sessionPattern: expect.stringContaining('comprehensible input'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('communicative proficiency cycle'),
        evidenceRoutine: expect.stringContaining('target-language utterances'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('clinical-simulation');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'communicative language learning',
      evidenceNoun: 'language-use evidence',
      decisionNoun: 'communication choice',
      learnerRole: 'language learner',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('language-performance'),
    );
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'comprehensible input warm-up',
      'language pattern noticing',
      'guided interpersonal rehearsal',
      'feedback and recast cycle',
      'presentational or interpretive transfer',
      'proficiency reflection handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'communicative proficiency cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Communicative language performance',
      artifactGenre: expect.objectContaining({ genre: 'language-performance' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('dialogue'),
        evidenceRequirement: expect.stringContaining('target-language sample'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Communicative Practice Lab',
      modalityDecode: expect.objectContaining({ mode: 'world-language' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('target-language rehearsal'),
        reviewFocus: expect.stringContaining('revised target-language use'),
      }),
    });
  });

  it.each([
    {
      courseName: 'Elementary Mandarin Chinese I',
      topic: 'Pinyin, four tones, greetings, self-introductions, and oral performance',
      decisionNoun: 'communication choice',
    },
    {
      courseName: 'World Literature',
      topic: 'Oral epic, Homeric epic, Tang poetry, frame narratives, and modernist poetry',
      decisionNoun: 'interpretive claim',
    },
    {
      courseName: 'Introduction to Psychology',
      topic: 'Classical conditioning, memory encoding, psychosocial development, and overjustification',
      decisionNoun: 'psychological explanation',
    },
    {
      courseName: 'Human Nutrition',
      topic: 'Nutrients, carbohydrates, proteins, lipids, vitamins, and minerals',
      decisionNoun: 'diet-analysis conclusion',
    },
    {
      courseName: 'Introduction to Astronomy',
      topic: 'Celestial coordinates, Moon phases, stellar parallax, solar nebula, and Hubble law',
      decisionNoun: 'astronomical explanation',
    },
  ])('does not let a generic model lens flatten $courseName', ({ courseName, topic, decisionNoun }) => {
    const blueprint = buildCourseBlueprint(
      {
        courseName,
        semester: 'Fall 2026',
        lessons: [
          {
            title: `Lesson 1: ${topic.split(',')[0]}`,
            sections: [
              {
                topicSection: topic,
                learningObjectives: `Explain and apply ${topic}.`,
                weeklyAssessments: `Evidence-backed response about ${topic}.`,
              },
            ],
          },
        ],
      },
      {
        enrichment: {
          source: 'generic-model-probe',
          lens: {
            domain: 'applied course practice',
            evidenceNoun: 'source evidence',
            decisionNoun: 'professional decision',
            learnerRole: 'course practitioner',
            exampleNoun: 'applied case',
          },
        },
      },
    );

    expect(blueprint.enrichment.lens.decisionNoun).toBe(decisionNoun);
    expect(JSON.stringify(blueprint.enrichment.lens)).not.toContain('professional decision');
  });

  it('decodes performing arts courses as rehearsal evidence instead of generic simulation', () => {
    const blueprint = buildCourseBlueprint(makePerformingArtsCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'performing-arts',
      sessionPattern: expect.stringContaining('guided rehearsal'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('rehearsal-to-performance cycle'),
        evidenceRoutine: expect.stringContaining('recorded performance evidence'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('clinical-simulation');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'performing arts rehearsal',
      evidenceNoun: 'performance evidence',
      decisionNoun: 'rehearsal decision',
      learnerRole: 'performing artist',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('performance-rehearsal'),
    );
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'body voice or instrument readiness',
      'technique model',
      'guided rehearsal',
      'critique and note uptake',
      'performance run-through',
      'rehearsal reflection and next cue',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'rehearsal-to-performance cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Performance rehearsal portfolio',
      artifactGenre: expect.objectContaining({ genre: 'performance-rehearsal' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('performance recording'),
        evidenceRequirement: expect.stringContaining('observable performance attempt'),
      }),
    });
    expect(compiled.assignments.assignments[0].scaffoldingMilestones[2].feedback).not.toBe(
      compiled.assignments.assignments[0].instructorFeedbackPriority,
    );
    // v0.8.61: later mentions use the week-anchored short reference instead
    // of restating the full artifact title.
    expect(compiled.assignments.assignments[0].scaffoldingMilestones[2].feedback).toMatch(
      /Warm-up performance recording with vocal evidence|Week 1 recording/,
    );
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Rehearsal Critique Lab',
      modalityDecode: expect.objectContaining({ mode: 'performing-arts' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('revised performance run'),
        reviewFocus: expect.stringContaining('revised performance evidence'),
      }),
    });
  });

  it('decodes programming courses as code labs with tests, debugging, and review evidence', () => {
    const blueprint = buildCourseBlueprint(makeProgrammingLabCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'programming-lab',
      sessionPattern: expect.stringContaining('test/debug loop'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('test-driven coding cycle'),
        evidenceRoutine: expect.stringContaining('failing and passing tests'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('applied-lab');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'software programming lab',
      evidenceNoun: 'code evidence',
      decisionNoun: 'implementation decision',
      learnerRole: 'software developer',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(Array(4).fill('code-lab'));
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'environment and test setup',
      'live code model',
      'guided implementation',
      'debugging and test loop',
      'code review and refactor',
      'commit handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'test-driven coding cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Code lab and test evidence',
      artifactGenre: expect.objectContaining({ genre: 'code-lab' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('repository commit'),
        evidenceRequirement: expect.stringContaining('failing and passing test result'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Code Review Clinic',
      modalityDecode: expect.objectContaining({ mode: 'programming-lab' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('failing or passing test trace'),
        reviewFocus: expect.stringContaining('debugging evidence'),
      }),
    });
    expect(blueprint.courseWorkload.workloadBalanceStatus).toBe('balanced');
    expect(blueprint.courseWorkload.workloadReviewCount).toBe(0);
    expect(Math.max(...blueprint.courseWorkload.lessonRows.map((row) => row.outOfClassMinutes))).toBeLessThanOrEqual(
      150,
    );
  });

  it('decodes data science courses as analytics notebooks with validation and bias evidence', () => {
    const blueprint = buildCourseBlueprint(makeDataScienceLabCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'data-science-lab',
      sessionPattern: expect.stringContaining('dataset provenance check'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('dataset-to-insight cycle'),
        evidenceRoutine: expect.stringContaining('validation metrics'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('programming-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('applied-lab');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'data science analytics lab',
      evidenceNoun: 'validation and model-performance evidence',
      decisionNoun: 'analytic decision',
      learnerRole: 'data analyst',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('data-science-notebook'),
    );
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'dataset readiness and provenance check',
      'analysis or model demonstration',
      'guided notebook build',
      'validation and interpretation check',
      'bias limitation and decision review',
      'insight handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'dataset-to-insight cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Data science notebook and validation evidence',
      artifactGenre: expect.objectContaining({ genre: 'data-science-notebook' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('analytics notebook'),
        evidenceRequirement: expect.stringContaining('dataset provenance'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Analytics Review Clinic',
      modalityDecode: expect.objectContaining({ mode: 'data-science-lab' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('validation comparison'),
        reviewFocus: expect.stringContaining('bias or fairness risk'),
      }),
    });
  });

  it('keeps applied machine learning in data-science lab mode despite quizzes and study guides', () => {
    const blueprint = buildCourseBlueprint(makeAppliedMachineLearningCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, [
      'lessonPlans',
      'slideDecks',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ]);
    const compiledText = JSON.stringify(compiled).toLowerCase();
    const blueprintText = JSON.stringify(blueprint).toLowerCase();
    const classificationGuide = compiled.studyGuides.studyGuides.find((guide) =>
      /classification modeling/i.test(guide.lessonTitle),
    );
    const classificationGuideText = JSON.stringify(classificationGuide).toLowerCase();

    expect(blueprint.courseModalityProfile.primaryMode).toBe('data-science-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('lecture-exam');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'applied machine learning lab',
      evidenceNoun: 'validation and model-performance evidence',
      decisionNoun: 'modeling decision',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('data-science-notebook'),
    );
    expect(blueprint.lessons[0].throughlineCase).toMatchObject({
      projectName: 'Riverton Civic Services Modeling Project',
      datasetName: 'Riverton Civic Services Triage Dataset',
      evidencePacket: expect.stringContaining('Riverton Model Evidence Packet'),
    });
    expect(blueprintText).not.toContain('research design evidence packet');
    expect(compiledText).not.toContain('lecture-exam evidence choice');
    expect(compiledText).not.toContain('design evidence');
    expect(classificationGuideText).toContain('confusion matrix');
    expect(classificationGuideText).toContain('precision');
    expect(classificationGuideText).toContain('recall');
    expect(classificationGuideText).toContain('false positives');
    expect(classificationGuideText).toContain('false negatives');
    expect(classificationGuideText).toContain('model-card');
  });

  it('compiles non-data courses without objective-stem leaks, generic quiz keys, or invented lab packets', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introduction to Psychology',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: What Psychology Is and Why It Matters',
          sections: [
            {
              topicSection: 'Psychological science, perspectives, research evidence',
              learningObjectives:
                'Students will be able to:\n1a. Explain how psychologists study behavior and mental processes.\n1b. Compare major psychological perspectives.',
              learningGoals: 'Connect evidence-based psychology to everyday reasoning.',
              weeklyAssessments: 'Concept application quiz with evidence explanation.',
              asyncActivities: 'Read an introductory chapter and mark examples of evidence-based claims.',
              syncActivities: 'Small-group analysis of everyday psychology claims.',
              supportingResources: 'Introductory textbook chapter; instructor lecture notes',
              evaluateDesign: 'Score concept accuracy, evidence use, and reasoning.',
            },
          ],
        },
        {
          title: 'Lesson 2: Research Methods in Psychology',
          sections: [
            {
              topicSection: 'Observation, experiment, correlation, ethics',
              learningObjectives: 'Analyze research design choices and explain evidence limits.',
              learningGoals: 'Use methods vocabulary to judge psychological claims.',
              weeklyAssessments: 'Research claim critique.',
              asyncActivities: 'Read methods notes and identify variables.',
              syncActivities: 'Compare two short research scenarios.',
              supportingResources: 'Methods handout; instructor-provided scenarios',
              evaluateDesign: 'Score method fit, limitation language, and evidence quality.',
            },
          ],
        },
      ],
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides', 'lessonPlans']);
    const compiledText = JSON.stringify(compiled);
    const firstQuiz = compiled.quizBank.quizzes[0];
    const mcQuestions = firstQuiz.questions.filter((question) => question.type === 'multiple_choice');
    const studentFacingText = JSON.stringify({
      questions: firstQuiz.questions.map((question) => ({
        question: question.question,
        options: question.options,
        answer: question.answer,
        objectiveAligned: question.objectiveAligned,
        sampleAnswer: question.sampleAnswer,
        tags: question.tags,
      })),
      keyTerms: compiled.studyGuides.studyGuides[0].keyTerms,
      lessonPlan: compiled.lessonPlans.lessonPlans[0].outline,
    });

    expect(studentFacingText).not.toMatch(/Students will be able to:?/i);
    expect(compiledText).not.toMatch(/\b(Riverton|Westbrook)\b/);
    expect(compiledText).not.toMatch(/\b(?:Jupyter|starter notebook|model card)\b/i);
    expect(studentFacingText).not.toMatch(/background information and move directly to a general summary/i);
    expect(new Set(mcQuestions.map((question) => question.answer)).size).toBeGreaterThan(1);
    expect(firstQuiz.questions.flatMap((question) => question.tags || [])).not.toContain(
      'Lesson 1: What Psychology Is and Why It Matters',
    );
    expect(compiled.studyGuides.studyGuides[0].keyTerms[0].definition).toMatch(/evidence focus|self-check|artifact/i);
  });

  it('decodes engineering design courses as test-and-verification labs', () => {
    const blueprint = buildCourseBlueprint(makeEngineeringDesignLabCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'discussions']);

    expect(blueprint.courseModalityProfile).toMatchObject({
      primaryMode: 'engineering-design-lab',
      sessionPattern: expect.stringContaining('failure analysis'),
      teachingPattern: expect.objectContaining({
        signaturePractice: expect.stringContaining('design-build-test cycle'),
        evidenceRoutine: expect.stringContaining('failure mode'),
      }),
    });
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('studio-lab');
    expect(blueprint.courseModalityProfile.primaryMode).not.toBe('capstone-project');
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'engineering design test lab',
      evidenceNoun: 'engineering test evidence',
      decisionNoun: 'design-verification decision',
      learnerRole: 'engineering designer',
    });
    expect(blueprint.lessons.map((lesson) => lesson.artifactGenre.genre)).toEqual(
      Array(4).fill('engineering-design-test'),
    );
    expect(blueprint.lessons[0].classSessionPlan.segments.map((segment) => segment.phase)).toEqual([
      'requirements and constraint check',
      'engineering model or test demonstration',
      'guided prototype or calculation build',
      'test data and failure analysis',
      'redesign review',
      'verification handoff',
    ]);
    expect(compiled.lessonPlans.lessonPlans[0].readyToTeachSupport.modalityPractice).toContain(
      'design-build-test cycle',
    );
    expect(compiled.assignments.assignments[0]).toMatchObject({
      assignmentType: 'Engineering design test report',
      artifactGenre: expect.objectContaining({ genre: 'engineering-design-test' }),
      submissionProfile: expect.objectContaining({
        expectedFormat: expect.stringContaining('engineering prototype'),
        evidenceRequirement: expect.stringContaining('design requirement'),
      }),
    });
    expect(compiled.discussions.discussions[0]).toMatchObject({
      format: 'Engineering Design Review',
      modalityDecode: expect.objectContaining({ mode: 'engineering-design-lab' }),
      discussionProtocol: expect.objectContaining({
        participationPattern: expect.stringContaining('failure-mode diagnosis'),
        reviewFocus: expect.stringContaining('verification readiness'),
      }),
    });
  });

  it('does not misclassify disciplinary models as AI course design', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Community Health Program Evaluation',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Week 1: Program Logic Model Design',
          sections: [
            {
              topicSection: 'Program logic model, health equity data, stakeholder assumptions',
              learningObjectives: 'Use implementation evidence to evaluate a program logic model.',
              learningGoals: 'Connect stakeholder evidence to program decision-making.',
              weeklyAssessments:
                'Community health evaluation memo with implementation evidence and program decision rationale.',
              asyncActivities: 'Review a program logic model and note missing stakeholder evidence.',
              syncActivities: 'Case conference on logic-model assumptions and implementation barriers.',
              supportingResources: 'Logic-model template; health equity data brief; stakeholder notes',
              evaluateDesign: 'Score evidence fit, equity risk, and decision rationale.',
            },
          ],
        },
      ],
    });

    expect(blueprint.enrichment.lens.domain).toBe('community health evaluation');
    expect(blueprint.enrichment.lens.exampleNoun).toBe('community implementation case');
    expect(blueprint.enrichment.lens.exampleNoun).not.toMatch(/AI-supported/i);
    expect(blueprint.learnerContextProfile.learnerRole).toBe('evaluation practitioner');
  });

  it('honors configured Course FAQ question targets for compiled output', () => {
    const courseMap = makeCourseMap(4);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 6 } },
    });

    expect(compiled.courseFaq.faqs).toHaveLength(4);
    expect(compiled.courseFaq.faqs.every((lesson) => lesson.qs.length === 6)).toBe(true);

    const validation = validateDeliverableGeneration('courseFaq', compiled.courseFaq, {
      expectedLessonCount: 4,
      config: { questionsPerLesson: 6 },
    });
    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
  });

  it('produces deliverables that pass existing generation validators', () => {
    const courseMap = makeCourseMap(5);
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'assignments',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ]);

    for (const featureId of Object.keys(compiled)) {
      const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
        expectedLessonCount: 5,
        config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
      });
      expect(validation.valid, `${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
    }
  });

  it('estimates avoided chunk calls for compiled features', () => {
    const savedCalls = estimateBlueprintCompilerSavings(['syllabus', 'assignments', 'quizBank', 'courseFaq'], 14);

    expect(savedCalls).toBeGreaterThan(0);
    expect(savedCalls).toBeLessThan(25);
  });

  it('builds slide IR and sparse assessment fallbacks before compiling rich features', () => {
    const sparseMap = makeCourseMap(3);
    sparseMap.lessons[1].sections[0].weeklyAssessments = '';
    sparseMap.lessons[1].sections[0].evaluateDesign = '';

    const blueprint = buildCourseBlueprint(sparseMap);
    const ir = buildSlideDeckIntermediateRepresentation(blueprint);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks', 'quizBank', 'assignments']);

    expect(blueprint.lessons[1].assessmentSource).toBe('sparse-fallback');
    expect(blueprint.lessons[1].bloomsLevel).toBe('Evaluate');
    expect(blueprint.lessons[1].bloomInference).toMatchObject({
      level: 'Evaluate',
      source: 'learning objectives',
      matchedVerb: 'evaluate',
      fallbackUsed: false,
    });
    expect(blueprint.lessons[1].studentArtifact).toMatch(
      /Policy Topic 2 (decision memo|criteria check|judgment worksheet|case response)/i,
    );
    expect(blueprint.lessons[1].confidence.fields.assessment).toMatchObject({
      source: 'sparse-fallback',
      confidence: 'needs-review',
    });
    expect(blueprint.lessons[1].missingSignals).toContain(
      'Weekly assessment was synthesized from lesson goals and activities.',
    );
    expect(blueprint.lessons[1].sourceEvidenceTrace.inferredOrDerivedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'assessment artifact',
          source: 'sparse-fallback',
        }),
      ]),
    );
    expect(blueprint.sourceRiskRegister).toMatchObject({
      status: 'source-review-required',
      highRiskCount: expect.any(Number),
    });
    expect(blueprint.lessons[1].sourceRisk).toMatchObject({
      riskLevel: 'high',
      reviewRequired: true,
    });
    expect(blueprint.lessons[1].compilerDecision).toMatchObject({
      generationPath: 'deterministic-compile-with-source-repair-review',
      publishGate: 'local-review-required-before-publish',
      reviewRequired: true,
      localRepairUsed: true,
      evidence: {
        sourceRiskLevel: 'high',
        assessmentSource: 'sparse-fallback',
      },
    });
    expect(blueprint.lessons[1].compilerDecision.reviewFocus[0]).toMatch(/Policy Topic 2|Lesson 2/i);
    expect(blueprint.compilerDecisionMatrix).toMatchObject({
      status: 'review-required',
      reviewRequiredCount: 1,
      localRepairCount: 1,
    });
    expect(blueprint.compilerPath.adaptiveSafety).toMatchObject({
      status: 'review-required',
      locallyRepairedLessonCount: 1,
      synthesizedAssessmentCount: 1,
      humanReview: 'required for flagged source gaps or conflicts before classroom handoff',
      recommendedPath: 'deterministic-compile-with-local-review',
    });
    expect(blueprint.compilerPath.adaptiveRepairPlan).toMatchObject({
      status: 'deterministic-repair-with-local-review',
      deterministicRepairCount: 1,
      localReviewRequiredCount: 1,
      synthesizedAssessmentCount: 1,
      modelGeneratedFallbackCount: 0,
      modelFallbackPolicy: {
        status: 'not-used-for-blueprint-compiled-core',
        blockedFor: expect.arrayContaining([expect.stringContaining('inventing missing official dates')]),
      },
      repairRows: [
        expect.objectContaining({
          lessonNumber: 2,
          publishGate: 'local-review-required-before-publish',
          repairKinds: expect.arrayContaining([
            'missing-source-signal',
            'source-inferred-field',
            'synthesized-assessment',
          ]),
          reviewerAction: expect.stringMatching(/Policy Topic 2|Lesson 2/i),
        }),
      ],
    });
    expect(ir.decks[1].slides.map((slide) => slide.type)).toContain('activity');
    expect(compiled.slideDecks.decks[1].slideDeckSequenceGuide.cumulativeAssessmentMap).toContain(
      blueprint.lessons[1].studentArtifact,
    );
    expect(compiled.slideDecks.decks[1].sourceGrounding.reviewActionability).toMatchObject({
      status: 'local-review-required',
      publishGate: 'local-review-required-before-publish',
      reviewRequired: true,
    });
    expect(compiled.slideDecks.decks[1].slideDeckSequenceGuide.localReviewAction).toMatch(/Policy Topic 2|Lesson 2/i);
    expect(compiled.quizBank.quizzes[1].quizBlueprint).toMatchObject({
      source: 'source-grounded-quiz-plan',
      lessonBloom: 'Evaluate',
    });
    // v0.14.1 (5.4): coverage reflects actual stem-verb tags (the synthetic
    // frames span Understand/Apply/Create), not the planned five-level claim.
    expect(new Set(compiled.quizBank.quizzes[1].bloomsCoverage).size).toBeGreaterThanOrEqual(3);
    expect(compiled.quizBank.quizzes[1].questions.every((question) => question.quizPlan?.bloomSource)).toBe(true);
    expect(compiled.assignments.assignments[1].title).toContain(blueprint.lessons[1].studentArtifact);
    expect(compiled.assignments.assignments[1].sourceGrounding.reviewActionability.reviewerAction).toMatch(
      /Policy Topic 2|Lesson 2/i,
    );
  });

  it('flags assessment anchors derived from evaluation notes instead of overclaiming source confidence', () => {
    const sparseMap = makeCourseMap(3);
    sparseMap.lessons[1].sections[0].weeklyAssessments = '';

    const blueprint = buildCourseBlueprint(sparseMap);

    expect(blueprint.lessons[1].assessmentSource).toBe('evaluation-design-derived');
    expect(blueprint.lessons[1].confidence.fields.assessment).toMatchObject({
      source: 'evaluation-design-derived',
      confidence: 'medium',
    });
    expect(blueprint.lessons[1].missingSignals).toContain(
      'Weekly assessment was derived from evaluation/design notes and needs local review.',
    );
    expect(blueprint.qualitySignals.reviewFlagCount).toBe(1);
    expect(blueprint.qualitySignals.sourceGroundedLessonCount).toBe(2);
    expect(blueprint.compilerPath.adaptiveSafety).toMatchObject({
      status: 'review-required',
      locallyRepairedLessonCount: 1,
      derivedAssessmentCount: 1,
    });
  });

  it('replaces placeholder course terms with local confirmation language in compiled syllabi', () => {
    const sparseMap = makeCourseMap(4);
    sparseMap.semester = 'TBD';

    const blueprint = buildCourseBlueprint(sparseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus']);
    const syllabus = compiled.syllabus.syllabus;
    const serialized = JSON.stringify(syllabus);

    expect(blueprint.semester).toBe('Official term to confirm locally');
    expect(syllabus.semester).toBe('Official term to confirm locally');
    expect(serialized).not.toMatch(/\bTBD\b|to be determined|\[semester year\]/i);
    expect(syllabus.classroomHandoffPlan.publishBoundary).toMatch(/official dates/i);
    expect(syllabus.blueprintQualityReceipt.compilerPath.reviewPolicy).toMatch(/official dates|source inputs/i);
  });

  it('preserves explicit source grading weights and labels compiler-distributed weights as draft policy', () => {
    const weightedMap = makeCourseMap(4);
    [10, 20, 30, 40].forEach((weight, index) => {
      weightedMap.lessons[index].sections[0].weeklyAssessments =
        `${weightedMap.lessons[index].sections[0].weeklyAssessments} (${weight}% of course grade)`;
    });

    const weightedBlueprint = buildCourseBlueprint(weightedMap);
    const weightedCompiled = compileBlueprintDeliverables(weightedBlueprint, ['syllabus', 'assignments', 'rubrics']);

    expect(weightedBlueprint.assessments.map((assessment) => assessment.weightPercent)).toEqual([10, 20, 30, 40]);
    expect(weightedBlueprint.assessmentArchitecture).toMatchObject({
      status: 'balanced',
      totalWeightPercent: 100,
      weightSourceStatus: 'source-explicit',
      explicitWeightCount: 4,
      compilerDistributedWeightCount: 0,
      weightReviewRequiredCount: 0,
      weightConfirmationPolicy: expect.stringContaining('Official grading weights'),
    });
    expect(weightedBlueprint.assessments[0].weightProvenance).toMatchObject({
      planStatus: 'source-explicit',
      source: 'course-map-explicit',
      sourceWeightPercent: 10,
      reviewRequired: false,
    });
    expect(weightedBlueprint.blueprintAssumptionLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'assessment-weight',
          source: 'course-map-explicit',
          confidence: 'high',
          reviewRequired: false,
        }),
      ]),
    );
    expect(weightedCompiled.syllabus.syllabus.assessmentCalendar[0].gradingWeightProvenance).toMatchObject({
      source: 'course-map-explicit',
      reviewRequired: false,
      reviewCode: 'source-weight-spot-check',
    });
    expect(weightedCompiled.syllabus.syllabus.assessmentCalendar[0].gradingWeightProvenance.planPolicy).toBeUndefined();
    expect(
      weightedCompiled.syllabus.syllabus.assessmentCalendar[0].gradingWeightProvenance.planReviewReason,
    ).toBeUndefined();
    expect(weightedCompiled.assignments.assignments[0].assessmentArchitecture.weightProvenance).toMatchObject({
      source: 'course-map-explicit',
      reviewCode: 'source-weight-spot-check',
    });
    expect(
      weightedCompiled.assignments.assignments[0].assessmentArchitecture.weightProvenance.planPolicy,
    ).toBeUndefined();
    expect(weightedCompiled.rubrics.rubrics[0].assessmentArchitecture.weightProvenance).toMatchObject({
      source: 'course-map-explicit',
      reviewCode: 'source-weight-spot-check',
    });
    expect(weightedCompiled.rubrics.rubrics[0].assessmentArchitecture.weightProvenance.planPolicy).toBeUndefined();

    const draftBlueprint = buildCourseBlueprint(makeCourseMap(4));
    expect(draftBlueprint.assessmentArchitecture).toMatchObject({
      weightSourceStatus: 'compiler-distributed-draft',
      explicitWeightCount: 0,
      compilerDistributedWeightCount: 4,
      weightReviewRequiredCount: 4,
    });
    expect(draftBlueprint.assessments[0].weightProvenance).toMatchObject({
      source: 'compiler-distributed-by-assessment-role',
      reviewRequired: true,
      reviewerAction: expect.stringContaining('Confirm the official grading weight'),
    });
  });

  it('keeps contradictory duplicate source rows visible as local-review risks', () => {
    const duplicateMap = makeCourseMap(4);
    duplicateMap.lessons[1] = {
      title: 'Week 2: Survey Design',
      sections: [
        {
          topicSection: 'Survey sampling, question wording, bias, response scale',
          learningObjectives: 'Evaluate survey questions for sampling and wording bias.',
          learningGoals: 'Use survey evidence to improve a research instrument.',
          weeklyAssessments: 'Survey critique memo with sampling concern, wording revision, and bias-control decision.',
          asyncActivities: 'Annotate two flawed survey questions and identify likely bias.',
          syncActivities: 'Survey design clinic with question rewrite and peer bias check.',
          supportingResources: 'Survey methods guide; sample questionnaire; bias checklist',
          evaluateDesign: 'Score bias diagnosis, wording revision, and evidence-supported design decision.',
        },
      ],
    };
    duplicateMap.lessons[2] = {
      title: 'Week 2: Interview Protocol',
      sections: [
        {
          topicSection: 'Semi-structured interviews, probing questions, consent, interview protocol',
          learningObjectives: 'Create interview probes that preserve consent and elicit usable qualitative evidence.',
          learningGoals: 'Use interview evidence to refine a qualitative research protocol.',
          weeklyAssessments:
            'Interview protocol draft with consent language, three probes, and evidence-quality rationale.',
          asyncActivities: 'Review sample interview excerpts and mark probe quality.',
          syncActivities: 'Interview role-play with consent check, probe revision, and debrief.',
          supportingResources: 'Interview protocol template; consent checklist; qualitative methods excerpt',
          evaluateDesign: 'Score consent fit, probe quality, evidence rationale, and revision plan.',
        },
      ],
    };

    const blueprint = buildCourseBlueprint(duplicateMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'syllabus']);

    expect(blueprint.sourceConflictReport).toMatchObject({
      status: 'source-conflicts-review-required',
      duplicateGroupCount: 1,
      conflictingGroupCount: 1,
      duplicateLessonCount: 2,
    });
    expect(blueprint.sourceConflictReport.conflictGroups[0]).toMatchObject({
      label: 'Week 2',
      lessonNumbers: [2, 3],
      conflictFields: expect.arrayContaining(['lesson identity', 'learning objectives', 'topic and concepts']),
    });
    expect(blueprint.lessons[1].sourceConflict).toMatchObject({
      status: 'source-conflict',
      duplicateLessonNumbers: [2, 3],
    });
    expect(blueprint.lessons[1].missingSignals.join(' ')).toMatch(/Source conflict/i);
    expect(blueprint.lessons[1].sourceRisk).toMatchObject({
      riskLevel: 'high',
      sourceConflictStatus: 'source-conflict',
      reviewRequired: true,
    });
    expect(blueprint.lessons[1].compilerDecision).toMatchObject({
      generationPath: 'deterministic-compile-with-source-repair-review',
      publishGate: 'local-review-required-before-publish',
      reviewRequired: true,
      evidence: expect.objectContaining({
        sourceRiskLevel: 'high',
      }),
    });
    expect(blueprint.compilerContract).toMatchObject({
      status: 'pass',
      sourceConflictStatus: 'source-conflicts-review-required',
      sourceConflictDuplicateLessonCount: 2,
    });
    expect(blueprint.packageCoherenceMatrix.lessonRows[1].sourceConflictCue).toMatch(/duplicate source row/i);
    expect(compiled.lessonPlans.lessonPlans[1].blueprintGrounding.localReviewNeeded.join(' ')).toMatch(
      /Source conflict/i,
    );
    expect(compiled.lessonPlans.lessonPlans[1].blueprintGrounding.reviewActionability).toMatchObject({
      status: 'local-review-required',
      publishGate: 'local-review-required-before-publish',
      reviewRequired: true,
    });
    expect(compiled.lessonPlans.lessonPlans[1].readyToTeachSupport.localReviewAction).toMatch(/duplicate source row/i);
    expect(compiled.assignments.assignments[1].sourceGrounding.sourceEvidenceTrace.sourceConflict).toMatchObject({
      status: 'source-conflict',
    });
    expect(compiled.syllabus.syllabus.courseAtAGlance[1].localReviewAction).toMatch(/duplicate source row/i);
    expect(compiled.syllabus.syllabus.blueprintQualityReceipt.sourceConflictReport).toMatchObject({
      status: 'source-conflicts-review-required',
      duplicateLessonCount: 2,
    });
  });

  it('keeps messy-import slide sequencing inspectable without repeated boilerplate warnings', () => {
    const blueprint = buildCourseBlueprint(MESSY_IMPORT_STRESS_PROJECT.courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks']);

    expect(blueprint.qualitySignals.reviewFlagCount).toBeGreaterThan(0);
    expect(blueprint.qualitySignals.sourceGroundedLessonCount).toBeLessThan(blueprint.totalLessons);
    expect(blueprint.lessons[0].missingSignals).toContain('Lesson title was derived from topic or section fields.');
    expect(blueprint.lessons[2].title).toContain('Health Equity Data Sources');

    const result = evaluateClassroomReadiness({
      courseMap: MESSY_IMPORT_STRESS_PROJECT.courseMap,
      selectedFeatures: ['slideDecks'],
      deliverables: {
        slideDecks: {
          status: 'done',
          data: compiled.slideDecks,
        },
      },
    });

    expect(
      result.warnings.some((issue) => issue.message.includes('repeats the same boilerplate')),
      JSON.stringify(result.warnings, null, 2),
    ).toBe(false);
    expect(compiled.slideDecks.decks[0].slideDeckSequenceGuide.cumulativeAssessmentMap).toMatch(
      /practice slides (reinforce|rehearse)|practice focus/,
    );
    expect(compiled.slideDecks.decks[0].slides[0].notes).toContain('working session');
    expect(JSON.stringify(compiled.slideDecks.decks[0])).not.toMatch(/\bTBD\b|Anchor the explanation in/i);
    expect(compiled.slideDecks.decks[0].lessonTitle).toBe('Lesson 1: Placement orientation and community context');
    expect(compiled.slideDecks.decks[0].slides[1].bullets.join(' ')).toContain('Practice with');
  });

  it('keeps course-prefixed title anchors and numbered assessment echoes out of slide decks', () => {
    const courseMap = {
      courseName: 'Environmental Justice and Climate Policy',
      semester: 'Fall 2026',
      lessons: [
        {
          title: 'Lesson 1: Climate vulnerability and environmental justice',
          sections: [
            {
              topicSection: 'climate vulnerability; environmental racism; policy context',
              learningObjectives: 'Analyze climate vulnerability evidence; explain environmental racism.',
              learningGoals: 'Connect environmental justice concepts to policy decisions.',
              weeklyAssessments: 'Lesson 1 evidence check: Climate vulnerability and environmental justice (25%)',
              asyncActivities: 'Review climate vulnerability source packet.',
              syncActivities: 'Seminar evidence mapping.',
              supportingResources: 'Climate vulnerability source packet',
              evaluateDesign: 'Check evidence use and policy reasoning.',
            },
          ],
        },
        {
          title: 'Lesson 2: Regulatory policy',
          sections: [
            {
              topicSection: 'regulatory policy; governance tools; implementation',
              learningObjectives: 'Compare governance tools; evaluate implementation constraints.',
              learningGoals: 'Use regulatory policy evidence to justify decisions.',
              weeklyAssessments: 'Lesson 2 applied problem: Regulatory policy (25%)',
              asyncActivities: 'Read regulatory policy source packet.',
              syncActivities: 'Policy lab.',
              supportingResources: 'Regulatory policy source packet',
              evaluateDesign: 'Score policy reasoning.',
            },
          ],
        },
        {
          title: 'Lesson 3: Community health evidence',
          sections: [
            {
              topicSection: 'community health evidence; data sources; equity impacts',
              learningObjectives: 'Interpret health evidence; explain equity implications.',
              learningGoals: 'Connect data evidence to environmental justice analysis.',
              weeklyAssessments: 'Lesson 3 practice brief: Community health evidence (25%)',
              asyncActivities: 'Annotate health evidence source packet.',
              syncActivities: 'Evidence interpretation workshop.',
              supportingResources: 'Community health evidence source packet',
              evaluateDesign: 'Score evidence interpretation.',
            },
          ],
        },
        {
          title: 'Lesson 4: Policy memo methods',
          sections: [
            {
              topicSection: 'policy memo methods; brief writing; course synthesis',
              learningObjectives: 'Write an actionable recommendation; synthesize climate and justice evidence.',
              learningGoals: 'Use policy memo methods to make evidence-backed recommendations.',
              weeklyAssessments:
                'Lesson 4 concept transfer: Policy memo methods (25%): 1. Lesson 4 concept transfer: Policy memo methods (25%)',
              asyncActivities: 'Review policy memo source packet.',
              syncActivities: 'Memo recommendation clinic.',
              supportingResources: 'Policy memo methods source packet',
              evaluateDesign: 'Score recommendation, evidence trail, and feasibility.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks', 'syllabus']);
    const deck = compiled.slideDecks.decks.find((item) => /Policy memo methods/i.test(item.lessonTitle));
    const deckText = deck.slides
      .map((slide) =>
        [
          slide.title,
          ...(slide.bullets || []),
          slide.notes,
          slide.visual?.description,
          slide.visual?.altText,
          JSON.stringify(slide.visual?.visualPlan || {}),
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join('\n');

    expect(deckText).toContain('Policy memo methods');
    expect(deckText).not.toMatch(/Environmental Justice and Climate Policy:\s+Policy memo methods/i);
    expect(deckText).not.toMatch(
      /Lesson 4 concept transfer: Policy memo methods \(25%\):\s*1\.\s*Lesson 4 concept transfer/i,
    );
    const visibleSyllabusText = JSON.stringify({
      courseRequirements: compiled.syllabus.syllabus.courseRequirements,
      outcomeAlignmentMatrix: compiled.syllabus.syllabus.outcomeAlignmentMatrix,
      assessmentCalendar: compiled.syllabus.syllabus.assessmentCalendar,
      weeklySchedule: compiled.syllabus.syllabus.weeklySchedule,
      importantDates: compiled.syllabus.syllabus.importantDates,
    });
    expect(visibleSyllabusText).toContain('Policy memo methods');
    expect(visibleSyllabusText).not.toMatch(
      /Lesson 4 concept transfer: Policy memo methods \(25%\):\s*1\.\s*Lesson 4 concept transfer/i,
    );
  });

  it('compiles predictable weekly reflection custom deliverables from the blueprint', () => {
    customDeliverables = {
      custom_weeklyReflection: {
        id: 'custom_weeklyReflection',
        name: 'Weekly Reflection',
        description: 'A per-week reflection and check-in for each lesson.',
        systemPrompt:
          'Create one Weekly Reflection item for each lesson/week with a reflection prompt and check-in guidance.',
        userPromptTemplate:
          'Generate a Weekly Reflection for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
    };

    const blueprint = buildCourseBlueprint(makeCourseMap(5), { scopeIndices: [1, 2, 4] });
    const compiled = compileBlueprintDeliverables(blueprint, ['custom_weeklyReflection']);
    const reflection = compiled.custom_weeklyReflection;

    expect(getBlueprintCompiledFeatures(['custom_weeklyReflection', 'custom_unknown'])).toEqual([
      'custom_weeklyReflection',
    ]);
    expect(reflection.deliverableName).toBe('Weekly Reflection');
    expect(reflection.weekly_reflection).toHaveLength(3);
    expect(reflection.weekly_reflection.map((item) => item.lessonTitle)).toEqual([
      'Lesson 2: Policy Topic 2',
      'Lesson 3: Policy Topic 3',
      'Lesson 5: Policy Topic 5',
    ]);
    expect(reflection.weekly_reflection.every((item) => item.promptTitle.includes('Weekly Reflection'))).toBe(true);
    expect(reflection.weekly_reflection[0].sourceGrounding).toMatchObject({
      confidence: 'high',
      compiledPattern: 'reflection-check-in',
      evidenceRequirement: expect.stringMatching(/Policy Topic 2.*Case packet 2|Case packet 2.*Policy Topic 2/),
    });
    expect(reflection.weekly_reflection.map((item) => item.checkInQuestion).join(' ')).toContain(
      'public policy analysis work',
    );
    expect(JSON.stringify(reflection)).not.toMatch(/community health|generic reflection filler/i);

    const validation = validateDeliverableGeneration('custom_weeklyReflection', reflection, {
      expectedLessonCount: 3,
    });
    const csv = deliverableToCsvRows('custom_weeklyReflection', reflection);

    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
    expect(csv.headers).toContain('Prompt Title');
    expect(csv.rows).toHaveLength(3);
    expect(csv.headers).not.toContain('Source Grounding');
    expect(csv.rows.flat().join(' ')).not.toContain('compiledPattern');
  });

  it('keeps compiled environmental-policy reflections out of stale community-health phrasing', () => {
    customDeliverables = {
      custom_weeklyReflection: {
        id: 'custom_weeklyReflection',
        name: 'Weekly Reflection',
        description: 'A per-week reflection and check-in for each lesson.',
        systemPrompt:
          'Create one Weekly Reflection item for each lesson/week with a reflection prompt and check-in guidance.',
        userPromptTemplate:
          'Generate a Weekly Reflection for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
    };
    const environmentalPolicyCourse = {
      courseName: 'Applied Environmental Policy Studio',
      semester: 'Fall 2026',
      learningOutcomes:
        'Analyze climate policy, environmental justice, stakeholder mapping, regulatory impact, cost-benefit reasoning, public comment, implementation planning, and briefing delivery.',
      lessons: [
        {
          title: 'Lesson 1: Foundations of Environmental Policy Analysis',
          sections: [
            {
              topicSection:
                'Climate policy, environmental justice, stakeholder mapping, regulatory impact, cost-benefit reasoning',
              learningObjectives:
                'Analyze environmental policy evidence and evaluate stakeholder consequences for implementation decisions.',
              learningGoals: 'Connect environmental justice frameworks to defensible policy memo recommendations.',
              weeklyAssessments:
                'Policy memo checkpoint with stakeholder map, regulatory impact evidence, and implementation decision.',
              asyncActivities:
                'Read a climate policy case and annotate public comment evidence, implementation constraints, and equity trade-offs.',
              syncActivities:
                'Policy option studio with stakeholder mapping, cost-benefit evidence, public comment review, and revised implementation recommendation.',
              supportingResources: 'Climate policy case; stakeholder map template; public comment example',
              evaluateDesign:
                'Score evidence quality, equity reasoning, regulatory impact analysis, and implementation realism.',
            },
          ],
        },
      ],
    };

    const blueprint = buildCourseBlueprint(environmentalPolicyCourse);
    const reflection = compileBlueprintDeliverables(blueprint, ['custom_weeklyReflection'], {
      enforceCompilerContract: false,
    }).custom_weeklyReflection;
    const item = reflection.weekly_reflection[0];
    const exportedText = JSON.stringify(reflection);

    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'public policy analysis',
      decisionNoun: 'policy decision',
    });
    expect(item.checkInQuestion).toContain('public policy analysis work');
    expect(item.reflectionPrompt).toContain('policy decision');
    expect(item.evidenceToReference[0].length).toBeLessThan(150);
    expect(exportedText).not.toMatch(/community health|generic reflection filler|custom_\d+/i);
  });

  it('compiles predictable per-lesson reading response custom deliverables from the blueprint', () => {
    customDeliverables = {
      custom_readingResponse: {
        id: 'custom_readingResponse',
        name: 'Lesson Reading Response',
        description: 'A per-lesson reading response for each week in the course.',
        systemPrompt:
          'Create one Lesson Reading Response item for each lesson/week with a reading-based prompt and submission checklist.',
        userPromptTemplate:
          'Generate one Lesson Reading Response for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
      custom_readingReflection: {
        id: 'custom_readingReflection',
        name: 'Lesson Reading Reflection',
        description: 'A per-lesson reading reflection for each week in the course.',
        systemPrompt:
          'Create one Lesson Reading Reflection item for each lesson/week with a reading-based prompt and submission checklist.',
        userPromptTemplate:
          'Generate one Lesson Reading Reflection for each lesson in the course. Return one item per lesson/week. {{courseMap}}',
      },
    };

    const blueprint = buildCourseBlueprint(makeCourseMap(5), { scopeIndices: [0, 2, 3] });
    const compiled = compileBlueprintDeliverables(blueprint, ['custom_readingResponse']);
    const readingResponse = compiled.custom_readingResponse;

    expect(getBlueprintCompiledFeatures(['custom_readingResponse', 'custom_unknown'])).toEqual([
      'custom_readingResponse',
    ]);
    expect(getBlueprintCompiledFeatures(['custom_readingReflection'])).toEqual(['custom_readingReflection']);
    expect(readingResponse.deliverableName).toBe('Lesson Reading Response');
    expect(readingResponse.lesson_reading_response).toHaveLength(3);
    expect(readingResponse.lesson_reading_response.map((item) => item.lessonTitle)).toEqual([
      'Lesson 1: Policy Topic 1',
      'Lesson 3: Policy Topic 3',
      'Lesson 4: Policy Topic 4',
    ]);
    expect(
      readingResponse.lesson_reading_response.every((item) => item.promptTitle.includes('Lesson Reading Response')),
    ).toBe(true);
    expect(readingResponse.lesson_reading_response[0].sourceGrounding).toMatchObject({
      confidence: 'high',
      compiledPattern: 'reading-response',
      focusReading: expect.stringContaining('Case packet'),
    });

    const validation = validateDeliverableGeneration('custom_readingResponse', readingResponse, {
      expectedLessonCount: 3,
    });
    const csv = deliverableToCsvRows('custom_readingResponse', readingResponse);

    expect(validation.valid, validation.blockers.join('; ')).toBe(true);
    expect(csv.headers).toContain('Prompt Title');
    expect(csv.rows).toHaveLength(3);
    expect(csv.headers).not.toContain('Source Grounding');
    expect(csv.rows.flat().join(' ')).not.toContain('compiledPattern');
  });

  it('compiles supported structured custom deliverable families from the blueprint', () => {
    customDeliverables = {
      custom_feedbackForm: {
        id: 'custom_feedbackForm',
        name: 'Feedback Form',
        description: 'A peer feedback form for each lesson/week.',
        systemPrompt: 'Return one peer feedback form for each lesson/week.',
        userPromptTemplate: 'Generate one feedback form for each lesson/week. {{courseMap}}',
      },
      custom_studyTrip: {
        id: 'custom_studyTrip',
        name: 'Trip plan for study',
        description: 'A per-lesson study trip plan with field evidence and logistics.',
        systemPrompt:
          'Return one trip plan for each lesson/week and include a peer feedback step after students return.',
        userPromptTemplate:
          'Generate one study trip plan for each lesson/week, then use feedback to revise the lesson artifact. {{courseMap}}',
      },
      custom_projectMilestone: {
        id: 'custom_projectMilestone',
        name: 'Project Milestone Checklist',
        description: 'A project milestone checklist for each lesson/week.',
        systemPrompt: 'Return one project milestone checklist for each lesson/week.',
        userPromptTemplate: 'Generate one project milestone checklist for each lesson/week. {{courseMap}}',
      },
      custom_labReport: {
        id: 'custom_labReport',
        name: 'Lab Report',
        description: 'A lab report shell for each lesson/week.',
        systemPrompt: 'Return one lab report worksheet for each lesson/week.',
        userPromptTemplate: 'Generate one lab report for each lesson/week. {{courseMap}}',
      },
      custom_caseBrief: {
        id: 'custom_caseBrief',
        name: 'Case Brief',
        description: 'A case brief worksheet for each lesson/week.',
        systemPrompt: 'Return one case brief for each lesson/week.',
        userPromptTemplate: 'Generate one case brief for each lesson/week. {{courseMap}}',
      },
      custom_policyMemo: {
        id: 'custom_policyMemo',
        name: 'Policy Memo Checkpoint',
        description: 'A policy memo checkpoint for each lesson/week.',
        systemPrompt: 'Return one policy memo checkpoint for each lesson/week.',
        userPromptTemplate: 'Generate one policy memo checkpoint for each lesson/week. {{courseMap}}',
      },
      custom_observationChecklist: {
        id: 'custom_observationChecklist',
        name: 'Observation Checklist',
        description: 'An observation checklist for each lesson/week.',
        systemPrompt: 'Return one observation checklist for each lesson/week.',
        userPromptTemplate: 'Generate one observation checklist for each lesson/week. {{courseMap}}',
      },
      custom_selfAssessment: {
        id: 'custom_selfAssessment',
        name: 'Participation Self Assessment',
        description: 'A participation self-assessment for each lesson/week.',
        systemPrompt: 'Return one participation self-assessment for each lesson/week.',
        userPromptTemplate: 'Generate one participation self-assessment for each lesson/week. {{courseMap}}',
      },
      custom_capstoneProgress: {
        id: 'custom_capstoneProgress',
        name: 'Capstone Progress Report',
        description: 'A capstone progress report for each lesson/week.',
        systemPrompt: 'Return one capstone progress report for each lesson/week.',
        userPromptTemplate: 'Generate one capstone progress report for each lesson/week. {{courseMap}}',
      },
      custom_problemSet: {
        id: 'custom_problemSet',
        name: 'Problem Set Worksheet',
        description: 'A problem set worksheet for each lesson/week.',
        systemPrompt: 'Return one problem set worksheet for each lesson/week.',
        userPromptTemplate: 'Generate one problem set worksheet for each lesson/week. {{courseMap}}',
      },
      custom_unknown: {
        id: 'custom_unknown',
        name: 'Studio Artifact Pack',
        description: 'A broad custom studio artifact pack.',
        systemPrompt: 'Generate custom studio materials.',
        userPromptTemplate: 'Create the custom deliverable for the course. {{courseMap}}',
      },
      custom_wholeCourseFeedback: {
        id: 'custom_wholeCourseFeedback',
        name: 'Feedback Form',
        description: 'One whole-course feedback form.',
        systemPrompt: 'Return one whole-course feedback form.',
        userPromptTemplate: 'Generate one feedback form for the full course. {{courseMap}}',
      },
    };
    const featureIds = [
      'custom_studyTrip',
      'custom_feedbackForm',
      'custom_projectMilestone',
      'custom_labReport',
      'custom_caseBrief',
      'custom_policyMemo',
      'custom_observationChecklist',
      'custom_selfAssessment',
      'custom_capstoneProgress',
      'custom_problemSet',
    ];

    const blueprint = buildCourseBlueprint(makeCourseMap(5), { scopeIndices: [0, 2, 4] });
    const compiledFeatureIds = getBlueprintCompiledFeatures([
      ...featureIds,
      'custom_unknown',
      'custom_wholeCourseFeedback',
    ]);
    const compiled = compileBlueprintDeliverables(blueprint, compiledFeatureIds);

    expect(compiledFeatureIds).toEqual(featureIds);
    expect(compiled.custom_studyTrip.trip_plan_for_study).toHaveLength(3);
    expect(compiled.custom_studyTrip.deliverableType).toBe('compiled-study-trip-plan');
    expect(compiled.custom_studyTrip.trip_plan_for_study[0].fieldEvidenceTasks.join(' ')).toContain(
      'directly observed',
    );
    expect(compiled.custom_studyTrip.trip_plan_for_study[0].logisticsToConfirm.join(' ')).toContain('accessibility');
    expect(JSON.stringify(compiled.custom_studyTrip)).not.toMatch(/local-review item|before publishing Review/i);
    expect(compiled.custom_feedbackForm.feedback_form).toHaveLength(3);
    expect(compiled.custom_feedbackForm.feedback_form[0].feedbackPrompts.join(' ')).toContain('revision');
    expect(compiled.custom_projectMilestone.project_milestone_checklist[0].milestoneChecklist.join(' ')).toContain(
      'blocker',
    );
    expect(compiled.custom_labReport.lab_report[0].labReportSections.join(' ')).toContain('Results');
    expect(compiled.custom_caseBrief.case_brief[0].caseBriefSections.join(' ')).toContain('Recommendation');
    expect(compiled.custom_policyMemo.policy_memo_checkpoint[0].policyMemoSections.join(' ')).toContain('tradeoffs');
    expect(compiled.custom_observationChecklist.observation_checklist[0].observationTargets.join(' ')).toContain(
      'inference',
    );
    expect(compiled.custom_selfAssessment.participation_self_assessment[0].selfAssessmentPrompts.join(' ')).toContain(
      'contribute',
    );
    expect(compiled.custom_capstoneProgress.capstone_progress_report[0].progressReportSections.join(' ')).toContain(
      'Completed work',
    );
    expect(compiled.custom_problemSet.problem_set_worksheet[0].worksheetTasks.join(' ')).toContain('Error analysis');

    for (const featureId of featureIds) {
      const validation = validateDeliverableGeneration(featureId, compiled[featureId], {
        expectedLessonCount: 3,
      });
      const csv = deliverableToCsvRows(featureId, compiled[featureId]);

      expect(validation.valid, `${featureId}: ${validation.blockers.join('; ')}`).toBe(true);
      expect(csv.headers).toContain('Prompt Title');
      expect(csv.rows).toHaveLength(3);
      expect(csv.headers).not.toContain('Source Grounding');
      expect(csv.rows.flat().join(' ')).not.toContain('compiledPattern');
      expect(compiled[featureId].compilerTrustReceipt).toMatchObject({
        modelFallback: 'not used',
      });
    }

    expect(JSON.stringify(compiled)).not.toMatch(/generic filler|custom_\d+/i);
  });

  it('keeps assignment checklist support resources compact and lesson-specific', () => {
    const lessons = [
      ['Client Intake, Rapport, and Helping Goals', 'Intake note with client context and stated concern'],
      ['Active Listening and Open Questions', 'Helping-skills transcript with open questions'],
      ['Risk Assessment and Safety Planning', 'Risk assessment and safety plan with risk cue'],
      ['Supervision Integration and Final Helping Plan', 'Final helping-skills portfolio with intake note'],
    ].map(([title, assessment], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: title,
          learningGoals: `Use counseling skills and social work practice evidence for ${title}.`,
          learningObjectives: `Analyze ${title} evidence and explain the helping decision.`,
          weeklyAssessments: assessment,
          asyncActivities: 'Review client notes and prepare one practice response.',
          syncActivities: 'Skills rehearsal, peer feedback, and supervision debrief.',
          supportingResources: 'Client vignette; supervision checklist; practice transcript',
          evaluateDesign: 'Score client-centered evidence, ethics, and feedback uptake.',
        },
      ],
    }));
    const blueprint = buildCourseBlueprint({
      courseName: 'Counseling Skills and Social Work Practice',
      semester: 'Fall 2026',
      lessons,
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments']);
    const checklistResources = compiled.assignments.assignments.map((assignment) => assignment.supportResources[2]);

    expect(new Set(checklistResources).size).toBe(checklistResources.length);
    expect(checklistResources.every((resource) => resource.length < 140)).toBe(true);
    expect(checklistResources.join(' ')).not.toMatch(
      /case conceptualization checklist:\s*client-centered evidence, active listening, helping-skill fit/i,
    );
  });

  it('keeps generic Week N assignment labels and dictionary scaffolds out of deep lesson-plan workshop prose', () => {
    const blueprint = buildCourseBlueprint(makeCourseMap(4));
    Object.assign(blueprint.lessons[3], {
      title: 'Lesson 4: Usability testing',
      studentArtifact: 'Week 4 assignment',
      keyConcepts: ['usability testing'],
      outcomes: ['Use usability testing evidence to improve a prototype review.'],
      enrichment: {
        keyTerms: [
          {
            term: 'usability testing',
            definition: 'A method for evaluating how easily people can complete tasks with a product or prototype.',
          },
        ],
        conceptProvenance: {
          citations: ['Usability testing source packet'],
        },
      },
    });

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: { lessonPlans: { depth: 'deep' } },
    });
    const lessonFour = compiled.lessonPlans.lessonPlans[3];
    const renderedPlanText = JSON.stringify({
      outline: lessonFour.outline,
      summary: lessonFour.studentFacingSummary,
      criteria: lessonFour.weeklySubmissionCriteria,
    });

    expect(renderedPlanText).toMatch(/usability testing/i);
    expect(renderedPlanText).not.toMatch(/\bWeek 4(?:\s+[a-z-]+){0,3}\s+(?:assignment|artifact|work)\b/i);
    expect(renderedPlanText).not.toMatch(/\bArtifact revision block\b/i);
    expect(renderedPlanText).not.toMatch(/precise use of usability testing\s+[—-]\s+A method/i);
  });

  it('renders prompt-labeled UX weekly assessments as natural lesson-plan artifact references', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'User Experience Design Studio',
      semester: 'Fall 2026',
      lessons: Array.from({ length: 5 }, (_, index) => {
        const lessonNumber = index + 1;
        const isTarget = lessonNumber === 5;
        const topic = isTarget ? 'Usability testing' : `UX studio topic ${lessonNumber}`;
        return {
          title: `Lesson ${lessonNumber}: ${topic}`,
          sections: [
            {
              topicSection: isTarget ? 'test planning' : topic,
              learningGoals: `Use ${topic} evidence to improve a UX artifact.`,
              learningObjectives: `Explain the key ideas in ${topic.toLowerCase()} and apply them in course activities.`,
              weeklyAssessments: isTarget
                ? 'Discussion prompts: Usability testing'
                : `UX evidence note ${lessonNumber}`,
              asyncActivities: `Review assigned materials and prepare notes on ${topic}.`,
              syncActivities: `Studio critique and practice applying ${topic}.`,
              supportingResources: 'UX example packet; critique protocol; design artifact template',
              evaluateDesign: `Score evidence, reasoning, limitation, and revision quality for ${topic}.`,
            },
          ],
        };
      }),
    });
    Object.assign(blueprint.lessons[4], {
      keyConcepts: ['usability testing'],
      studentArtifact: 'Discussion prompts: Usability testing',
      enrichment: {
        keyTerms: [
          {
            term: 'usability testing',
            definition: 'A method for evaluating how easily people can complete tasks with a product or prototype.',
          },
        ],
        discussionPrompt: {
          prompt: 'Should usability testing focus more on realistic tasks or on isolated interface elements?',
          positions: [
            'Focus on realistic tasks to capture the whole experience',
            'Focus on isolated elements to diagnose specific issues efficiently',
          ],
        },
      },
    });

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: { lessonPlans: { depth: 'deep' } },
    });
    const lessonFive = compiled.lessonPlans.lessonPlans[4];
    const renderedPlanText = JSON.stringify({
      materials: lessonFive.materials,
      assessments: lessonFive.assessmentsThisWeek,
      outline: lessonFive.outline,
      homework: lessonFive.homework,
      summary: lessonFive.studentFacingSummary,
      criteria: lessonFive.weeklySubmissionCriteria,
    });

    expect(renderedPlanText).toMatch(/Week 5 discussion prompt/i);
    expect(renderedPlanText).not.toMatch(/Discussion prompts:\s*Usability testing/i);
    expect(renderedPlanText).not.toMatch(/Discussion prompts[^.]{0,80}evidence about Usability testing/i);
    expect(
      findPromptArtifactContamination(
        'LESSON PLANS User Experience Design Studio Lesson 5: Usability testing Teams take a position on the lesson live question: Should usability testing focus more on realistic tasks or isolated interface elements?',
      ),
    ).toBeNull();
    expect(
      findPromptArtifactContamination('This activity focuses on Discussion prompts rather than the course concept.'),
    ).toEqual(expect.objectContaining({ label: 'discussion prompts' }));
  });
});
