function preferred(value, fallback) {
  return value || fallback;
}

export function buildTechnicalSessionSegments({ lesson, modality, concept, artifact, sessionMinutes }) {
  const common = { lesson, modality, concept, artifact, sessionMinutes };
  if (modality?.mode === 'data-storytelling-studio') return dataStorytellingSegments(common);
  if (modality?.mode === 'data-science-lab') return dataScienceSegments(common);
  if (modality?.mode === 'programming-lab') return programmingSegments(common);
  return null;
}

function dataStorytellingSegments({ lesson, modality, concept, artifact, sessionMinutes }) {
  return [
    {
      phase: 'source and stakeholder check',
      minutes: 10,
      purpose: preferred(
        lesson.prerequisitePlan?.diagnosticCheck,
        `Check the source ledger, represented stakeholders, missing voices, and evidence boundary for ${concept}.`,
      ),
      evidenceOfLearning: preferred(
        lesson.readinessSupport?.readinessEvidence,
        'Students name the source, represented audience, missing voice, and one claim limit before authoring.',
      ),
    },
    {
      phase: 'source-to-chart demonstration',
      minutes: 15,
      purpose: preferred(
        lesson.teachingIntent?.modelingIntent,
        `Model how one source detail and transformation decision changes the visual claim in ${artifact}.`,
      ),
      evidenceOfLearning: preferred(
        lesson.modelContrast?.contrastQuestion,
        'Students explain why one source, cleaning, or visual-encoding choice is more honest than another.',
      ),
    },
    {
      phase: 'guided data-story studio',
      minutes: 20,
      purpose: preferred(
        modality.signaturePractice || lesson.teachingIntent?.guidedPracticeIntent,
        'Students build the next source, cleaning, chart, or narrative-sequence element with an inspectable evidence trail.',
      ),
      evidenceOfLearning: preferred(
        modality.evidenceRoutine || lesson.evidencePlan?.evidenceRequirement,
        'Students produce one source-ledger, transformation-log, or annotated-chart entry tied to the public claim.',
      ),
    },
    {
      phase: 'visual honesty and uncertainty critique',
      minutes: 20,
      purpose: `Students test ${artifact} for scale choice, claim-to-chart fit, uncertainty, and missing context.`,
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.formativeEvidence,
        'Students annotate one visual or narrative choice and revise an overclaim or hidden uncertainty.',
      ),
    },
    {
      phase: 'audience and accessibility review',
      minutes: 20,
      purpose: `Students review ${artifact} for audience comprehension, accessibility, represented voices, and possible harm.`,
      evidenceOfLearning: preferred(
        lesson.assessmentLink || lesson.studentArtifact,
        'Students record one accessibility or audience finding and the portfolio change it requires.',
      ),
    },
    {
      phase: 'visible portfolio revision',
      minutes: Math.max(10, sessionMinutes - 85),
      purpose: preferred(
        lesson.learningTransferPlan?.transferTask,
        'Students update the data-story portfolio and carry its source, transformation, uncertainty, and revision record forward.',
      ),
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.closureCheck,
        'Students submit one visible revision, the evidence that required it, and the remaining uncertainty.',
      ),
    },
  ];
}

function dataScienceSegments({ lesson, modality, concept, artifact, sessionMinutes }) {
  return [
    {
      phase: 'dataset readiness and provenance check',
      minutes: 10,
      purpose: preferred(
        lesson.prerequisitePlan?.diagnosticCheck,
        `Check whether students can open the dataset, name its source, and identify one data-quality risk for ${concept}.`,
      ),
      evidenceOfLearning: preferred(
        lesson.readinessSupport?.readinessEvidence,
        'Students document dataset provenance, a missingness or quality cue, and one analysis question before modeling.',
      ),
    },
    {
      phase: 'analysis or model demonstration',
      minutes: 15,
      purpose: preferred(
        lesson.teachingIntent?.modelingIntent,
        `Model one notebook step that turns raw data into an interpretable ${concept} output for ${artifact}.`,
      ),
      evidenceOfLearning: preferred(
        lesson.modelContrast?.contrastQuestion,
        'Students can explain why one cleaning, visualization, or model choice is more defensible than another.',
      ),
    },
    {
      phase: 'guided notebook build',
      minutes: 20,
      purpose: preferred(
        modality.signaturePractice || lesson.teachingIntent?.guidedPracticeIntent,
        'Students build the next analysis step with visible dataset, code, output, and interpretation evidence.',
      ),
      evidenceOfLearning: preferred(
        modality.evidenceRoutine || lesson.evidencePlan?.evidenceRequirement,
        'Students produce a notebook cell, data table, visualization, or model output tied to the question.',
      ),
    },
    {
      phase: 'validation and interpretation check',
      minutes: 25,
      purpose: `Students test whether the output in ${artifact} supports the interpretation, metric, or recommendation.`,
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.formativeEvidence,
        'Students record a validation metric, comparison, or interpretation check before revising the analysis.',
      ),
    },
    {
      phase: 'bias limitation and decision review',
      minutes: 25,
      purpose: `Students review ${artifact} for data limitations, bias or fairness risk, and decision consequences.`,
      evidenceOfLearning: preferred(
        lesson.assessmentLink || lesson.studentArtifact,
        'Students document one limitation, bias check, or alternate interpretation with a revised analytic decision.',
      ),
    },
    {
      phase: 'insight handoff',
      minutes: Math.max(10, sessionMinutes - 95),
      purpose: preferred(
        lesson.learningTransferPlan?.transferTask,
        'Students prepare the notebook, dashboard, or data story evidence that carries into the next analytics task.',
      ),
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.closureCheck,
        'Students submit or state one validation or model-performance evidence claim, one limitation, and one next analysis risk.',
      ),
    },
  ];
}

function programmingSegments({ lesson, modality, concept, artifact, sessionMinutes }) {
  return [
    {
      phase: 'environment and test setup',
      minutes: 10,
      purpose: preferred(
        lesson.prerequisitePlan?.diagnosticCheck,
        `Check whether students can open the repository, run the starter code, and execute the test harness for ${concept}.`,
      ),
      evidenceOfLearning: preferred(
        lesson.readinessSupport?.readinessEvidence,
        'Students produce one setup check, failing test, or environment note before implementation begins.',
      ),
    },
    {
      phase: 'live code model',
      minutes: 15,
      purpose: preferred(
        lesson.teachingIntent?.modelingIntent,
        `Model one small implementation decision for ${artifact}, including the code, test, and reasoning trace.`,
      ),
      evidenceOfLearning: preferred(
        lesson.modelContrast?.contrastQuestion,
        'Students can explain why one code path is clearer, safer, or better tested than another.',
      ),
    },
    {
      phase: 'guided implementation',
      minutes: 20,
      purpose: preferred(
        modality.signaturePractice || lesson.teachingIntent?.guidedPracticeIntent,
        `Students implement the next ${concept} step with visible code evidence and instructor check-ins.`,
      ),
      evidenceOfLearning: preferred(
        modality.evidenceRoutine || lesson.evidencePlan?.evidenceRequirement,
        'Students produce a code diff, function, notebook cell, or script segment tied to the requirement.',
      ),
    },
    {
      phase: 'debugging and test loop',
      minutes: 25,
      purpose: `Students run tests, inspect failures, debug the implementation, and revise ${artifact}.`,
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.formativeEvidence,
        'Students capture a failing or passing test, debugging trace, and one corrected implementation choice.',
      ),
    },
    {
      phase: 'code review and refactor',
      minutes: 25,
      purpose: `Students review ${artifact} for correctness, readability, edge cases, and refactor opportunities.`,
      evidenceOfLearning: preferred(
        lesson.assessmentLink || lesson.studentArtifact,
        'Students document one code review note plus a refactor, test, or edge-case improvement.',
      ),
    },
    {
      phase: 'commit handoff',
      minutes: Math.max(10, sessionMinutes - 95),
      purpose: preferred(
        lesson.learningTransferPlan?.transferTask,
        'Students prepare the repository, notebook, or pull-request evidence that carries into the next coding task.',
      ),
      evidenceOfLearning: preferred(
        lesson.feedbackCycle?.closureCheck,
        'Students submit or state one commit, test result, and next implementation risk.',
      ),
    },
  ];
}
