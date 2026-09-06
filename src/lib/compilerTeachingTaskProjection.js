import { projectTeachingTaskSyllabus } from './compilerTeachingTaskSyllabus.js';
import { teachingTaskRubric, teachingTaskWorkedExample } from './compilerTeachingTask.js';
import { compileTeachingProgram, teachingProgramReviewQuestions } from './compilerTeachingProgram.js';
import { teachingTaskSourceFromLesson } from './teachingTaskSource.js';
import { projectTeachingTaskSlides } from './compilerTeachingTaskSlides.js';

const ref = (task) => ({ taskId: task.id, taskRevision: task.revision });
const evidence = (task, prior) => ({ ...prior, claims: task.inputs.map((x) => x.text) });
const program = (task) => compileTeachingProgram({ admitted: true, teachingTask: task });
const questions = (task) => teachingProgramReviewQuestions(program(task));
const anchors = (task) => ({
  strongSample: task.answer,
  partialSample: task.errors[0].response,
  scoringRationale: `The partial response fails ${task.criteria.find((c) => c.id === task.errors[0].criterionId).label}: ${task.errors[0].correction}`,
  revisionPrompt: task.errors[0].feedback,
});

function alignAssessmentCopies(row, task, criteria) {
  const weightGuidance = criteria.map((c) => `${c.criterion}: ${c.points} points (${c.weight}%).`).join(' ');
  const evidenceMap = criteria.map((c) => ({
    criterion: c.criterion,
    evidenceNeeded: c.exemplary,
    strongSignal: c.exemplary,
    partialSignal: c.developing,
    feedbackMove: c.feedbackUse,
  }));
  for (const surface of [row, row.assessmentArchitecture, row.sourceGrounding, row.blueprintGrounding]) {
    if (!surface || typeof surface !== 'object') continue;
    if ('criterionWeightPlan' in surface) surface.criterionWeightPlan = criteria;
    if ('criterionEvidenceMap' in surface) surface.criterionEvidenceMap = evidenceMap;
    if ('anchorExampleSet' in surface) surface.anchorExampleSet = anchors(task);
    if ('criterionObjectiveAlignment' in surface)
      surface.criterionObjectiveAlignment = criteria.map((c) => ({
        criterion: c.criterion,
        objective: task.objective,
      }));
    if ('criterionWeightGuidance' in surface) surface.criterionWeightGuidance = weightGuidance;
  }
  if (row.workloadEstimate)
    Object.assign(row.workloadEstimate, {
      beforeClassMinutes: 0,
      inClassMinutes: task.minutes,
      afterClassMinutes: 5,
      outOfClassMinutes: 5,
      totalStudentMinutes: task.minutes + 5,
      estimatedHours: Math.round((task.minutes + 5) / 6) / 10,
      studentFacingEstimate: `${task.minutes} minutes of classroom work and up to 5 minutes of revision.`,
      outOfClassEstimate: 'Up to 5 minutes of revision.',
    });
  if (row.submissionProfile)
    Object.assign(row.submissionProfile, {
      expectedFormat: task.product,
      qualityFocus: criteria.map((c) => c.criterion).join('; '),
      evidenceRequirement: 'Use the source record reproduced with the task.',
      commonFailure: task.errors[0].response,
      revisionMove: task.errors[0].feedback,
      estimatedTime: `${task.minutes} minutes in class; up to 5 minutes of revision`,
      workload: row.workloadEstimate,
    });
}

function projectAssignment(row, task, blueprint) {
  const rubric = teachingTaskRubric(task, row.totalPoints);
  Object.assign(row, ref(task), {
    title: task.title,
    overview: task.question,
    instructions: [
      ...(task.preparation ? [task.preparation.instruction] : []),
      ...(task.directions || [task.question]),
      'Use the source record supplied here; label source statements separately from your reasoning.',
      task.product,
      'Check each criterion, then correct one error before submitting.',
    ],
    objectives: [task.objective],
    formatRequirements: {
      ...row.formatRequirements,
      length: task.product,
      format: 'An annotated response in the configured submission format.',
      citationStyle:
        'Identify the supplied source record and the statement used. Do not invent missing author, date or page information.',
      submissionPlatform:
        'Complete the classroom response and retain the corrected version. Use the submission method specified by the instructor.',
      latePolicy:
        blueprint.policies?.lateWork && !/^draft for local confirmation/i.test(blueprint.policies.lateWork)
          ? blueprint.policies.lateWork
          : 'Follow the deadline agreed with your instructor.',
      workloadFit: `${task.minutes} minutes for the classroom response, plus up to 5 minutes to revise after feedback.`,
      reviewProtocol: task.criteria.map((c) => c.feedback).join(' '),
    },
    accessibilityAndUDL:
      task.language === 'zh'
        ? '可以使用带标签的文字、图表或口述表达；按相同的证据与推理标准评价。'
        : 'An equivalent labeled written, diagrammatic or spoken response is acceptable. The same evidence and reasoning criteria apply.',
    estimatedTime: `${task.minutes} minutes in class; up to 5 minutes of revision`,
    expectedSubmissionFormat: task.product,
    submissionProfile: {
      ...row.submissionProfile,
      extent: task.product,
      parameterLines: [task.product],
      reviewProtocol: task.criteria.map((c) => c.feedback).join(' '),
    },
    deliverables: [task.product],
    gradingCriteria: task.criteria.map((c) => c.label),
    weightedGradingCriteria: rubric,
    highValueSuccessCriteria: task.criteria.map((c) => c.levels.exemplary),
    criterionWeightPlan: rubric,
    criterionEvidenceMap: rubric.map((c) => ({
      criterion: c.criterion,
      evidenceNeeded: c.exemplary,
      strongSignal: c.exemplary,
      partialSignal: c.developing,
      feedbackMove: c.feedbackUse,
    })),
    anchorExampleSet: anchors(task),
    anchorExampleGuidance: [
      `After your first attempt, compare this worked response: ${task.answer}`,
      `Error example: ${task.errors[0].response}`,
      anchors(task).scoringRationale,
      anchors(task).revisionPrompt,
    ],
    modelContrast: {
      exemplarMove: task.answer,
      nonExemplarMove: task.errors[0].response,
      contrastQuestion: task.errors[0].correction,
      transferPrompt: task.checkpoint.question,
    },
    sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
    supportResources: task.inputs.map((input, i) => `Source record ${i + 1}: ${input.text}`),
    scaffoldingMilestones: [
      'Read and annotate the supplied record.',
      'Draft the response with your reasoning.',
      'Use the criterion feedback to correct one error.',
    ].map((description, i) => ({
      milestone: `Step ${i + 1}`,
      description,
      dueDate: 'During the classroom task',
      feedback: task.criteria[i]?.feedback || '',
      points: 0,
      uploadChecklist: [],
    })),
    instructorFeedbackPriority: task.criteria.map((c) => c.feedback).join(' '),
    selfAssessmentRubric: task.criteria.map((c) => `${c.label}: ${c.levels.exemplary}`),
    misconceptionToWatch: {
      misconception: task.errors[0].response,
      correction: task.errors[0].correction,
      check: task.errors[0].feedback,
    },
    revisionCheck: task.errors[0].feedback,
    progressTracking: `Use the task rubric to check the classroom response, then allow up to 5 minutes for a specific correction.`,
    feedbackLoop: 'Use the criterion feedback to correct this task response and retain the revised version.',
  });
  alignAssessmentCopies(row, task, rubric);
}

function projectRubric(row, task) {
  const criteria = teachingTaskRubric(task, row.totalPoints);
  Object.assign(row, ref(task), {
    title: `${task.title} — Rubric`,
    gradedWork: task.title,
    taskDirections: task.question,
    gradingScale: {
      exemplary: '100% of criterion points',
      proficient: '75% of criterion points',
      developing: '50% of criterion points',
      beginning: '0% of criterion points',
    },
    criteria,
    criterionWeightPlan: criteria,
    highValueSuccessCriteria: task.criteria.map((c) => c.levels.exemplary),
    criterionWeightGuidance: criteria.map((c) => `${c.criterion}: ${c.points} points (${c.weight}%).`).join(' '),
    submissionRequirements: [task.product],
    submissionRequirementChecks: [],
    submissionRequirementPolicy:
      'Check the response format separately. Score the displayed reasoning and answer using these task-specific criteria.',
    anchorExamples: anchors(task),
    anchorExampleSet: anchors(task),
    instructorFacilitationNote:
      'For each criterion, select the descriptor best supported by the response: Excellent earns all criterion points; Proficient earns 75%; Developing earns 50%; Beginning or no assessable response earns 0. Sum criterion points without rounding intermediate scores. Cite the observed reasoning that determines each level; presentation quality cannot compensate for an incorrect conclusion.',
    accessibilityAndUDL:
      task.language === 'zh'
        ? '使用同一标准评价不同表达形式，区分内容理解与表达形式。'
        : 'Apply the same criteria across equivalent response formats; distinguish understanding from presentation format.',
    teacherNotes: task.criteria.map((c) => c.feedback).join(' '),
    scorerCalibrationUse: anchors(task).scoringRationale,
    sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
  });
  alignAssessmentCopies(row, task, criteria);
}

function projectPlan(row, task) {
  const transfer = task.sequence?.find((unit) => unit.kind === 'independent-transfer');
  Object.assign(row, ref(task), {
    studentFacingSummary: {
      beforeClass: task.preparation?.instruction || 'The task uses the source record supplied in class.',
      duringClass: task.question,
      afterClass: 'Revise the response using the matching criterion feedback.',
      submittedArtifact: task.product,
    },
    objectives: [task.objective],
    materials: task.inputs.map((input, i) => `Source record ${i + 1}: ${input.text}`),
    sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
    assessmentCriteria: task.criteria.map((c) => c.levels.exemplary),
    commonMisconceptions: task.errors.map((e) => `${e.response} Correction: ${e.correction}`),
    formativeCheck: {
      ...row.formativeCheck,
      ...ref(task),
      practiceId: `${task.id}:check`,
      prompt: task.checkpoint.question,
      expectedAnswer: task.checkpoint.answer,
      instructorAction: task.errors.map((e) => `${e.correction} Feedback: ${e.feedback}`).join(' '),
      successCriteria: task.criteria.map((c) => c.label),
      feedback: task.errors.map((e) => e.feedback).join(' '),
    },
    closingActivity: `Exit ticket: ${task.checkpoint.question}`,
    homework: {
      ...row.homework,
      title: task.title,
      description:
        'Revise the classroom response using the criterion feedback. Identify the specific correction you made.',
      estimatedTime: 'Up to 5 minutes',
      connectionToNext: 'Retain the corrected response and your remaining question for the next review.',
    },
  });
  const phases = [
    [
      'Read the actual record',
      'Underline the given observations. Mark any missing information.',
      'Check labels against the supplied record; separate observations from inferences.',
    ],
    ['Model the reasoning', task.question, task.reasoning.join(' ')],
    [
      'Diagnose an error',
      `Evaluate: “${task.errors[0].response}”`,
      `${task.errors[0].correction} Feedback: ${task.errors[0].feedback}`,
    ],
    ['Compare and revise responses', task.checkpoint.question, task.checkpoint.answer],
    ['Write the task response', task.question, task.answer],
    ['Check the conclusion', task.checkpoint.question, task.checkpoint.answer],
  ];
  if (task.preparation)
    phases[0] = ['Retrieve the earlier diagnosis', task.preparation.prompt, task.preparation.expectedAnswer];
  if (transfer)
    phases[4] = [
      'Apply the reasoning to a new case',
      transfer.question,
      `${transfer.answer}\nScoring: ${transfer.criteria.join(' ')}\nFeedback: ${transfer.feedback}`,
    ];
  if (row.outline?.length === phases.length)
    row.outline.forEach((block, i) => {
      Object.assign(block, ref(task), {
        activity: phases[i][0],
        description: phases[i][1],
        instructorNotes: `Expected response: ${phases[i][2]}`,
        instructorRole:
          'Find the first incorrect or missing reasoning step, give the matching criterion feedback, then ask for a revision.',
      });
    });
  if (row.classSessionPlan?.segments?.length === phases.length)
    row.classSessionPlan.segments.forEach((block, i) => {
      Object.assign(block, ref(task), { purpose: phases[i][1], evidenceOfLearning: phases[i][2] });
    });
  if (row.warmUp)
    Object.assign(row.warmUp, {
      prompt: phases[0][1],
      purpose: phases[0][2],
      facilitation:
        task.preparation?.instruction ||
        'Ask each learner to label the given observations and underline one claim that requires an inference. Compare their labels with the supplied record.',
    });
}

/** The task is selected before fact rotation. Every visible question, answer,
 * feedback move and rubric band below is projected from that same revision. */
export function projectSharedTeachingTasks(feature, data, blueprint, options = {}) {
  if (!data) return data;
  data.teachingTaskSources = blueprint.lessons.map(teachingTaskSourceFromLesson).filter(Boolean);
  const keys = {
    lessonPlans: 'lessonPlans',
    slideDecks: 'decks',
    assignments: 'assignments',
    rubrics: 'rubrics',
    discussions: 'discussions',
    quizBank: 'quizzes',
    studyGuides: 'studyGuides',
    courseFaq: 'faqs',
  };
  if (feature === 'syllabus') {
    projectTeachingTaskSyllabus(data.syllabus, blueprint);
    return data;
  }
  const rows = data[keys[feature]];
  if (!Array.isArray(rows)) return data;
  rows.forEach((row, index) => {
    const lesson =
      blueprint.lessons.find(
        (l) =>
          Number(row.lessonNumber) === l.lessonNumber ||
          row.lessonTitle === l.title ||
          row.relatedLessons?.includes(l.title),
      ) ||
      (!['assignments', 'rubrics'].includes(feature)
        ? blueprint.lessons[index]
        : blueprint.lessons.length === 1 && rows.length === 1
          ? blueprint.lessons[0]
          : null);
    const task = lesson?.teachingTask;
    if (!task || lesson.teachingTaskScope !== 'primary-task') return;
    if (feature === 'assignments') projectAssignment(row, task, blueprint);
    if (feature === 'rubrics' && Array.isArray(row.criteria)) projectRubric(row, task);
    if (feature === 'lessonPlans') projectPlan(row, task);
    if (feature === 'slideDecks') projectTeachingTaskSlides(row, task);
    if (feature === 'studyGuides')
      Object.assign(row, ref(task), {
        summary: task.summary,
        objectivePractice: [task.question],
        conceptConnections: task.criteria.map((c) => `${c.label}: ${c.levels.exemplary}`),
        workedExample: teachingTaskWorkedExample(task),
        reviewQuestions: questions(task),
        teachingProgram: program(task),
        practiceActivities: [
          ...(task.preparation ? [task.preparation.instruction] : []),
          task.question,
          task.checkpoint.question,
        ],
        sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
        commonMisconceptions: task.errors.map((e) => ({ misconception: e.response, correction: e.correction })),
        examPrep: {
          ...row.examPrep,
          timeline:
            'Attempt the task independently after the lesson; use the answer and criterion feedback to revise. Revisit any reasoning step you could not explain.',
          keyTopicsToKnow: task.criteria.map((c) => c.label),
          commonErrors: task.errors.map((e) => e.response).join(' '),
          reviewStrategy:
            'Practice the supplied task without looking at its solution, then check each reasoning step. This is rehearsal of this record; a new context requires a separate assessment.',
        },
      });
    if (feature === 'discussions')
      Object.assign(row, ref(task), {
        context: task.inputs.map((x) => x.text).join('\n'),
        prompt: task.checkpoint.question,
        evidenceRequirement:
          'Identify the source statement that supports your conclusion and explain how it supports or limits the claim.',
        guidelines:
          'Draft an individual answer, compare it with a peer response, then revise one reasoning step using a specific source statement.',
        equityConsiderations:
          'Allow think-write time and equivalent spoken or written responses. Evaluate the reasoning and evidence using the same criteria.',
        positionMap: [],
        estimatedDuration: `${task.minutes} minutes`,
        discussionProtocol: {
          ...row.discussionProtocol,
          estimatedDuration: `${task.minutes} minutes`,
          artifactUse: task.product,
          reviewFocus: task.criteria.map((c) => c.label).join('; '),
          decisionMove: task.checkpoint.question,
        },
        followUpProbes: [
          ...task.errors.map(
            (e) =>
              `A learner responds: “${e.response}” Which part needs correction, and which source statement supports the correction?`,
          ),
          ...(task.scaffoldQuestions || []).map((q) => q.question),
        ].slice(0, 3),
        facilitationTips: {
          opening: 'Allow a short individual response before students compare their reasoning.',
          ifStalls: task.errors.map((e) => `${e.correction} Feedback: ${e.feedback}`).join(' '),
          ifDominates:
            'Ask a different participant to identify the source statement that supports or challenges the current reasoning.',
          closure: `Reference response: ${task.checkpoint.answer}`,
          revisionCapture: 'Each learner records the specific reasoning step corrected after the discussion.',
        },
        evaluationCriteria: task.criteria.map((c) => c.levels.exemplary),
        sourceArtifacts: task.inputs.map((x, i) => ({
          title: `Source record ${i + 1}`,
          locator: x.text,
          use: 'Use this statement to support or bound the response.',
        })),
      });
    if (feature === 'quizBank' && options.configMap?.quizBank?.machineScored !== true && !row.gradingSpec) {
      const seats =
        row.questions?.filter(
          (q) =>
            !q.machineScored &&
            ['short_answer', 'essay'].includes(q.type) &&
            (!q.enrichmentSource ||
              [
                'compiler-teaching-program',
                'compiler-exact-source-ledger',
                'source-bound-recovery',
                'shared-teaching-task',
              ].includes(q.enrichmentSource)),
        ) || [];
      if (seats.length)
        row.practiceRecord = {
          ...ref(task),
          title: 'Supplied task record — guided practice',
          context: task.title,
          records: task.inputs.map((x) => x.text),
          studentUse:
            'Use this record for the related task questions. These rehearse the taught example; they do not establish independent transfer to a new context.',
        };
      const quizQuestions = [
        ...questions(task).filter((question) => question.practiceKind === 'independent-transfer'),
        ...questions(task).filter(
          (question) =>
            question.practiceKind !== 'independent-transfer' &&
            (!task.assessmentExtensions?.length || question.practiceKind !== 'task-check'),
        ),
        ...(task.assessmentExtensions || []).map((q, index) => ({
          question: q.question,
          answer: q.answer,
          successCriteria: q.criteria,
          practiceId: `${task.id}:assessment-extension-${index}`,
          ...ref(task),
        })),
      ];
      const transfer = task.sequence?.find((unit) => unit.kind === 'independent-transfer');
      const retry = task.sequence?.find((unit) => unit.kind === 'feedback-retry');
      if (transfer && retry)
        quizQuestions.push({
          ...ref(task),
          practiceId: retry.id,
          practiceKind: retry.kind,
          question:
            task.language === 'zh'
              ? `回到本题组的独立练习。反馈：${retry.feedback} ${retry.question}`
              : `Return to the independent case in this question bank. Feedback: ${retry.feedback} ${retry.question}`,
          answer: retry.answer,
          successCriteria: transfer.criteria,
        });
      quizQuestions.forEach((q, i) => {
        if (!seats[i]) return;
        Object.assign(seats[i], q, {
          type: seats[i].type === 'essay' ? 'essay' : 'short_answer',
          sampleAnswer: q.answer,
          options: [],
          answerIndex: undefined,
          distractorRationales: [],
          scoringGuidance: q.successCriteria.join(' '),
          explanation: q.answer,
          enrichmentSource: 'shared-teaching-task',
          sourceReviewRequired: false,
          intendedUse:
            q.practiceKind === 'independent-transfer'
              ? 'Independent response to a new fictional case; use the record in this question.'
              : task.purpose,
        });
      });
    }
    if (feature === 'courseFaq')
      Object.assign(row, ref(task), {
        qs: [
          { q: 'What will I learn to do?', an: task.objective, ca: 'Concept Explanation' },
          { q: 'What do I need to submit?', an: task.product, ca: 'Assignment Clarification' },
          {
            q: 'Which materials do I need?',
            ca: 'Course Logistics',
            an:
              task.preparation?.instruction ||
              'Use the source record reproduced in the lesson plan and study guide. Label your reasoning separately from statements directly supplied by the record.',
          },
          {
            q: 'How will my response be evaluated?',
            ca: 'Assignment Clarification',
            an:
              task.criteria.map((c) => `${c.label}: ${c.weight}%`).join('; ') +
              '. Check the task rubric for the specific evidence at each level.',
          },
          {
            q: 'How can I check and improve my answer?',
            ca: 'Assessment Prep',
            an: 'Attempt the task before opening the study-guide answer. Compare reasoning step by step. Use the feedback for the first incorrect or missing step, then revise your response.',
          },
          {
            q: 'How much time should I allow?',
            ca: 'Course Logistics',
            an: `${task.minutes} minutes for the classroom response, followed by up to 5 minutes to correct it using feedback.`,
          },
        ],
      });
  });
  return data;
}

export function projectTeachingTasksIntoCourseMap(courseMap, blueprint) {
  if (!Array.isArray(courseMap?.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((sourceLesson, index) => {
    const lesson = blueprint.lessons.find((l) => l.lessonNumber === (sourceLesson.lessonNumber || index + 1));
    const task = lesson?.teachingTask;
    if (!task) return sourceLesson;
    changed = true;
    if (lesson.teachingTaskScope !== 'primary-task')
      return { ...sourceLesson, teachingTaskLink: { ...ref(task), question: task.question } };
    const generatedFields = {
      syncActivities: task.question,
      asyncActivities:
        'Revise the classroom response using the matching criterion feedback; identify the specific correction made.',
    };
    const sections = (sourceLesson.sections || []).map((section, sectionIndex) => {
      if (sectionIndex !== 0) return section;
      const updated = { ...section };
      for (const [field, value] of Object.entries(generatedFields)) {
        const previous = sourceLesson.teachingTaskLink?.generatedFields?.[field];
        const current = String(section[field] || '');
        const compilerFallback =
          /^(?:1\.\s*)?(?:Compare claims and justify|Annotate the available course evidence|Audit one practical example|Revisit the supplied facts)/i.test(
            current,
          );
        if (!current || current === previous || compilerFallback) updated[field] = value;
      }
      return updated;
    });
    // Keep the objectives and authored activity edits intact. The link is also
    // present when an instructor supplies an alternative activity formulation.
    return { ...sourceLesson, sections, teachingTaskLink: { ...ref(task), question: task.question, generatedFields } };
  });
  return changed
    ? {
        ...courseMap,
        lessons,
        teachingTaskSources: blueprint.lessons.map(teachingTaskSourceFromLesson).filter(Boolean),
      }
    : courseMap;
}
