import { comparisonTaskBloom } from './teachingMaterialPresentation.js';
import { createReviewedPracticeCount } from './reviewedPracticeCount.js';
import { taskCopy, taskText } from './teachingTaskCopy.js';
import { projectTeachingTaskSyllabus } from './compilerTeachingTaskSyllabus.js';
import { teachingTaskRubric, teachingTaskWorkedExample } from './compilerTeachingTask.js';
import { projectTeachingStudyGuide } from './compilerTeachingStudyGuide.js';
import { compileTeachingProgram, teachingProgramReviewQuestions } from './compilerTeachingProgram.js';
import { teachingTaskSourceFromLesson } from './teachingTaskSource.js';
import { projectTeachingTaskSlides } from './compilerTeachingTaskSlides.js';
import { readTeachingTaskSources, withTeachingTaskSources } from './teachingProgram.js';
import { expandKeys } from './keyMaps.js';
import {
  projectTeachingQuestion,
  projectReviewedTeachingQuestionBank,
  usesStructuredPracticeScoring,
} from './compilerTeachingTaskQuiz.js';

const ref = (task) => ({ taskId: task.id, taskRevision: task.revision });
function codingClaims(task, prior = []) {
  const inputs = task.inputs.map((input) => input.text);
  const normalizedInputs = new Set(inputs.map((text) => text.replace(/\s+/g, ' ').trim()));
  return [...prior.filter((text) => !normalizedInputs.has(text.replace(/\s+/g, ' ').trim())), ...inputs];
}
function projectedTaskSources(blueprint) {
  const canonical = new Map(readTeachingTaskSources(blueprint).map((source) => [source.id, source]));
  return blueprint.lessons
    .map((lesson) => {
      const saved = canonical.get(lesson.teachingTask?.id);
      return saved
        ? { ...structuredClone(saved), lessonNumber: lesson.lessonNumber }
        : teachingTaskSourceFromLesson(lesson);
    })
    .filter(Boolean);
}
const evidence = (task, prior) => ({
  ...prior,
  claims: task.codingPractice ? codingClaims(task, prior?.claims || []) : task.inputs.map((x) => x.text),
});
const sourcePacket = (task) => task.inputs.map((input, index) => `Source record ${index + 1}: ${input.text}`).join(' ');
const isCompilerSourcePacket = (value) => typeof value === 'string' && /^Source record 1: /.test(value);
const copiesPacket = (value, packet) =>
  typeof value === 'string' &&
  packet &&
  (value.includes(packet) || (isCompilerSourcePacket(value) && packet.startsWith(value)));
function updateSourceCopy(value, packet, previousPacket) {
  if (!copiesPacket(value, previousPacket) || packet.startsWith(value)) return value;
  // Preserve an excerpt's length or any appended instructor annotation.
  return value.includes(previousPacket) ? value.split(previousPacket).join(packet) : packet.slice(0, value.length);
}

// These are live compiler copies, including the course-map resource packet
// used on regeneration. Keep authored resources and unrelated prose intact.
function projectSourceCopies(row, task, previousSource) {
  if (!previousSource) return;
  const packet = sourcePacket(task);
  const previousPacket = sourcePacket(previousSource);
  function update(value, field) {
    if (typeof value === 'string') {
      const copy = updateSourceCopy(value, packet, previousPacket);
      if (field !== 'preservedSignals') return copy;
      // The evidence trace also stores individual source excerpts, sometimes
      // followed by the next numbered-record label after sentence segmentation.
      for (const [index, input] of previousSource.inputs.entries()) {
        if (copy === input.text || copy.startsWith(`${input.text} Source record `))
          return task.inputs[index].text + copy.slice(input.text.length);
      }
      return copy;
    }
    if (Array.isArray(value)) return value.map((item) => update(item, field));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, update(item, key)]));
    return value;
  }
  for (const key of ['sourceGrounding', 'blueprintGrounding', 'sourceUsePlan', 'citationAndSourceUse'])
    if (row[key]) row[key] = update(row[key]);
}
const program = (task) => compileTeachingProgram({ admitted: true, teachingTask: task });
const questions = (task) => teachingProgramReviewQuestions(program(task));
const anchors = (task) =>
  task.contrastResponses?.length
    ? {
        language: task.language,
        sampleOrigin: 'synthetic-review-examples',
        strongSample: task.contrastResponses.find((example) => example.id === 'complete').response,
        partialSample: task.contrastResponses.find((example) => example.id === 'conclusion-without-reasoning').response,
        misconceptionSample: task.contrastResponses.find((example) => example.id === 'misconception').response,
        alternativeSample: task.contrastResponses.find((example) => example.id === 'alternative-representation')
          .response,
        scoringRationale: task.contrastResponses
          .find((example) => example.id === 'conclusion-without-reasoning')
          .judgments.map(
            (judgment) =>
              `${task.criteria.find((criterion) => criterion.id === judgment.criterionId).label}: ${judgment.rationale}`,
          )
          .join(' '),
        revisionPrompt: task.criteria.map((criterion) => criterion.feedback).join(' '),
      }
    : {
        strongSample: task.answer,
        partialSample: task.errors[0].response,
        scoringRationale: taskText(
          task,
          `The partial response fails ${task.criteria.find((c) => c.id === task.errors[0].criterionId).label}: ${task.errors[0].correction}`,
          `部分正确的回答未达到“${task.criteria.find((c) => c.id === task.errors[0].criterionId).label}”标准：${task.errors[0].correction}`,
        ),
        revisionPrompt: task.errors[0].feedback,
      };

function alignAssessmentCopies(row, task, criteria) {
  const weightGuidance = criteria
    .map((c) =>
      taskText(
        task,
        `${c.criterion}: ${c.points} points (${c.weight}%).`,
        `${c.criterion}：${c.points}分（${c.weight}%）。`,
      ),
    )
    .join(' ');
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
      studentFacingEstimate: taskText(
        task,
        `${task.minutes} minutes of classroom work and up to 5 minutes of revision.`,
        `课堂作答${task.minutes}分钟，修改最多5分钟。`,
      ),
      outOfClassEstimate: taskCopy(task, 'Up to 5 minutes of revision.'),
    });
  if (row.submissionProfile)
    Object.assign(row.submissionProfile, {
      expectedFormat: task.product,
      qualityFocus: criteria.map((c) => c.criterion).join('; '),
      evidenceRequirement: taskCopy(task, 'Use the source record reproduced with the task.'),
      commonFailure: task.errors[0].response,
      revisionMove: task.errors[0].feedback,
      estimatedTime: taskText(
        task,
        `${task.minutes} minutes in class; up to 5 minutes of revision`,
        `课堂${task.minutes}分钟，修改最多5分钟`,
      ),
      workload: row.workloadEstimate,
    });
}

function projectAssignment(row, task, blueprint) {
  const pooling = ['pooled-proportion', 'union-bounds'].includes(task.operationPlan?.operation);
  row.language = task.language;
  if (comparisonTaskBloom(task)) row.bloomsLevel = comparisonTaskBloom(task);
  const rubric = teachingTaskRubric(task, row.totalPoints);
  Object.assign(row, ref(task), {
    title: task.title,
    overview: task.question,
    instructions: [
      ...(task.preparation ? [task.preparation.instruction] : []),
      ...(task.directions || [task.question]),
      ...(!pooling
        ? [
            taskCopy(
              task,
              'Use the source record supplied here; label source statements separately from your reasoning.',
            ),
            task.product,
          ]
        : []),
      taskCopy(task, 'Check each criterion, then correct one error before submitting.'),
    ],
    objectives: [task.objective],
    formatRequirements: {
      ...row.formatRequirements,
      length: task.product,
      format: pooling ? '' : taskCopy(task, 'An annotated response in the configured submission format.'),
      citationStyle: taskCopy(
        task,
        'Identify the supplied source record and the statement used. Do not invent missing author, date or page information.',
      ),
      submissionPlatform: taskCopy(
        task,
        'Complete the classroom response and retain the corrected version. Use the submission method specified by the instructor.',
      ),
      latePolicy:
        blueprint.policies?.lateWork && !/^draft for local confirmation/i.test(blueprint.policies.lateWork)
          ? blueprint.policies.lateWork
          : pooling
            ? ''
            : taskCopy(task, 'Follow the deadline agreed with your instructor.'),
      workloadFit: taskText(
        task,
        `${task.minutes} minutes for the classroom response, plus up to 5 minutes to revise after feedback.`,
        `课堂作答${task.minutes}分钟，反馈后修改最多5分钟。`,
      ),
      reviewProtocol: task.criteria.map((c) => c.feedback).join(' '),
    },
    accessibilityAndUDL: task.codingPractice
      ? 'Submit executable code for the behavior checks. Explanations and test observations may be written or spoken; keyboard and assistive-tool use are welcome. Apply the same behavior criteria to every implementation.'
      : task.language === 'zh'
        ? '可以使用带标签的文字、图表或口述表达；按相同的证据与推理标准评价。'
        : 'An equivalent labeled written, diagrammatic or spoken response is acceptable. The same evidence and reasoning criteria apply.',
    estimatedTime: taskText(
      task,
      `${task.minutes} minutes in class; up to 5 minutes of revision`,
      `课堂${task.minutes}分钟，修改最多5分钟`,
    ),
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
      taskText(
        task,
        `After your first attempt, compare this worked response: ${task.answer}`,
        `首次作答后再比较示范答案：${task.answer}`,
      ),
      taskText(task, `Error example: ${task.errors[0].response}`, `错误示例：${task.errors[0].response}`),
      ['union-bounds', 'pooled-proportion', 'record-relative-day'].includes(task.operationPlan?.operation) &&
      task.operationPlan.presentationVersion >= 5
        ? task.contrastResponses
            .find((example) => example.response === task.errors[0].response)
            ?.judgments.map(
              (judgment) =>
                `${task.criteria.find((criterion) => criterion.id === judgment.criterionId).label}: ${judgment.rationale}`,
            )
            .join(' ') || task.errors[0].feedback
        : anchors(task).scoringRationale,
      anchors(task).revisionPrompt,
    ],
    modelContrast: {
      exemplarMove: task.answer,
      nonExemplarMove: task.errors[0].response,
      contrastQuestion: task.errors[0].correction,
      transferPrompt: task.checkpoint.question,
    },
    sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
    supportResources: task.inputs.map((input, i) =>
      taskText(task, `Source record ${i + 1}: ${input.text}`, `材料${i + 1}：${input.text}`),
    ),
    scaffoldingMilestones: [
      taskCopy(task, 'Read and annotate the supplied record.'),
      taskCopy(task, 'Draft the response with your reasoning.'),
      taskCopy(task, 'Use the criterion feedback to correct one error.'),
    ].map((description, i) => ({
      milestone: taskText(task, `Step ${i + 1}`, `步骤${i + 1}`),
      description,
      dueDate: taskCopy(task, 'During the classroom task'),
      feedback: task.criteria[i]?.feedback || '',
      points: 0,
      uploadChecklist: [],
    })),
    instructorFeedbackPriority: task.criteria.map((c) => c.feedback).join(' '),
    // The student sheet precedes the teacher reference page. Scoring bands
    // contain solutions; use process checks here rather than publishing the key.
    selfAssessmentRubric:
      task.studentChecks ||
      task.criteria.map((c) =>
        task.language === 'zh'
          ? `${c.label}：先独立作答，并标出自己答案中支持这一标准的证据或推理，再查看教师参考。`
          : `${c.label}: Before consulting the teacher reference, identify the evidence or reasoning in your own response that meets this criterion.`,
      ),
    misconceptionToWatch: {
      misconception: task.errors[0].response,
      correction: task.errors[0].correction,
      check: task.errors[0].feedback,
    },
    revisionCheck: task.errors[0].feedback,
    progressTracking: taskText(
      task,
      'Use the task rubric to check the classroom response, then allow up to 5 minutes for a specific correction.',
      '按任务评分标准检查课堂回答，再用最多5分钟完成一处具体修改。',
    ),
    feedbackLoop: taskText(
      task,
      'Use the criterion feedback to correct this task response and retain the revised version.',
      '根据评分标准的反馈修正回答，并保留修改稿。',
    ),
  });
  if (task.codingPractice) {
    row.instructions = [
      'Implement the starter to meet its acceptance checks. Run each check before comparing your work with the reference implementation.',
      ...task.errors.map((error) => `During review, test this claim: “${error.response}” Explain the observed result.`),
    ];
    row.formatRequirements = {
      format: 'Source files plus reproducible test commands or browser observations.',
      citationStyle:
        'Identify any code adapted from the linked API reference; distinguish it from your implementation.',
    };
    row.anchorExampleGuidance = [
      row.anchorExampleGuidance[0],
      row.anchorExampleGuidance[1],
      row.anchorExampleGuidance[2],
    ];
  }
  const errorRationale = row.anchorExampleGuidance[2];
  if (
    task.operationPlan?.operation === 'paired-condition-confound' ||
    (task.operationPlan?.operation === 'union-bounds' && task.operationPlan.presentationVersion >= 6)
  )
    row.anchorExampleGuidance = [
      taskText(task, 'Reference proposal — compare after your own attempt.', '参考方案——完成自己的作答后再比较。'),
      ...task.reasoning,
      taskText(task, `Error example: ${task.errors[0].response}`, `错误示例：${task.errors[0].response}`),
      errorRationale,
      anchors(task).revisionPrompt,
    ];
  alignAssessmentCopies(row, task, rubric);
}

function projectRubric(row, task) {
  row.language = task.language;
  if (comparisonTaskBloom(task)) row.bloomsLevel = comparisonTaskBloom(task);
  const criteria = teachingTaskRubric(task, row.totalPoints);
  Object.assign(row, ref(task), {
    title: taskText(task, `${task.title} — Rubric`, `${task.title}——评分标准`),
    gradedWork: task.title,
    taskDirections: task.question,
    gradingScale: {
      exemplary: taskText(task, '100% of criterion points', '该项分值的100%'),
      proficient: taskText(task, '75% of criterion points', '该项分值的75%'),
      developing: taskText(task, '50% of criterion points', '该项分值的50%'),
      beginning: taskText(task, '0% of criterion points', '该项分值的0%'),
    },
    criteria,
    criterionWeightPlan: criteria,
    highValueSuccessCriteria: task.criteria.map((c) => c.levels.exemplary),
    criterionWeightGuidance: criteria
      .map((c) =>
        taskText(
          task,
          `${c.criterion}: ${c.points} points (${c.weight}%).`,
          `${c.criterion}：${c.points}分（${c.weight}%）。`,
        ),
      )
      .join(' '),
    submissionRequirements: [task.product],
    submissionRequirementChecks: [],
    submissionRequirementPolicy: taskText(
      task,
      'Check the response format separately. Score the displayed reasoning and answer using these task-specific criteria.',
      '单独核对提交格式。按本任务的具体标准评价推理与回答。',
    ),
    anchorExamples: anchors(task),
    anchorExampleSet: anchors(task),
    instructorFacilitationNote: taskCopy(
      task,
      'For each criterion, select the descriptor best supported by the response: Excellent earns all criterion points; Proficient earns 75%; Developing earns 50%; Beginning or no assessable response earns 0. Sum criterion points without rounding intermediate scores. Cite the observed reasoning that determines each level; presentation quality cannot compensate for an incorrect conclusion.',
    ),
    accessibilityAndUDL: task.codingPractice
      ? 'Submit executable code for the behavior checks. Explanations and test observations may be written or spoken; keyboard and assistive-tool use are welcome. Apply the same behavior criteria to every implementation.'
      : task.language === 'zh'
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
      beforeClass:
        task.preparation?.instruction || taskCopy(task, 'The task uses the source record supplied in class.'),
      duringClass: task.question,
      afterClass: taskCopy(task, 'Revise the response using the matching criterion feedback.'),
      submittedArtifact: task.product,
    },
    objectives: [task.objective],
    materials: task.inputs.map((input, i) =>
      taskText(task, `Source record ${i + 1}: ${input.text}`, `材料${i + 1}：${input.text}`),
    ),
    sourceEvidenceBrief: evidence(task, row.sourceEvidenceBrief),
    assessmentCriteria: task.criteria.map((c) => c.levels.exemplary),
    commonMisconceptions: task.errors.map((e) =>
      taskText(task, `${e.response} Correction: ${e.correction}`, `${e.response} 修正：${e.correction}`),
    ),
    formativeCheck: {
      ...row.formativeCheck,
      ...ref(task),
      practiceId: `${task.id}:check`,
      prompt: task.checkpoint.question,
      expectedAnswer: task.checkpoint.answer,
      instructorAction: task.errors
        .map((e) => taskText(task, `${e.correction} Feedback: ${e.feedback}`, `${e.correction} 反馈：${e.feedback}`))
        .join(' '),
      successCriteria: task.criteria.map((c) => c.label),
      feedback: task.errors.map((e) => e.feedback).join(' '),
    },
    closingActivity: taskText(task, `Exit ticket: ${task.checkpoint.question}`, `离堂题：${task.checkpoint.question}`),
    homework: {
      ...row.homework,
      title: task.title,
      description: taskCopy(
        task,
        'Revise the classroom response using the criterion feedback. Identify the specific correction you made.',
      ),
      estimatedTime: taskCopy(task, 'Up to 5 minutes'),
      connectionToNext: taskCopy(
        task,
        'Retain the corrected response and your remaining question for the next review.',
      ),
    },
  });
  const phases = [
    [
      taskCopy(task, 'Read the actual record'),
      taskCopy(task, 'Underline the given observations. Mark any missing information.'),
      taskCopy(task, 'Check labels against the supplied record; separate observations from inferences.'),
    ],
    [taskCopy(task, 'Model the reasoning'), task.question, task.reasoning.join(' ')],
    [
      taskCopy(task, 'Diagnose an error'),
      taskText(task, `Evaluate: “${task.errors[0].response}”`, `评价：“${task.errors[0].response}”`),
      taskText(
        task,
        `${task.errors[0].correction} Feedback: ${task.errors[0].feedback}`,
        `${task.errors[0].correction} 反馈：${task.errors[0].feedback}`,
      ),
    ],
    [
      taskCopy(task, 'Compare and revise responses'),
      task.revisionActivity?.question || task.checkpoint.question,
      task.revisionActivity?.answer || task.checkpoint.answer,
    ],
    [taskCopy(task, 'Write the task response'), task.question, task.answer],
    [taskCopy(task, 'Check the conclusion'), task.checkpoint.question, task.checkpoint.answer],
  ];
  if (task.preparation)
    phases[0] = [
      taskCopy(task, 'Retrieve the earlier diagnosis'),
      task.preparation.prompt,
      task.preparation.expectedAnswer,
    ];
  if (transfer)
    phases[4] = [
      transfer.caseExposure?.kind === 'reused-in-course'
        ? taskText(task, 'Extend the reasoning on the returning case', '在延续案例上运用本课推理')
        : taskCopy(task, 'Apply the reasoning to a new case'),
      transfer.question,
      taskText(
        task,
        // The initial lesson-plan compiler stores these fields as one prose
        // paragraph. Use that same representation during source projection;
        // do not mistake its normalized line breaks for a teacher edit.
        `${transfer.answer} Scoring: ${transfer.criteria.join(' ')} Feedback: ${transfer.feedback}`,
        `${transfer.answer} 评分：${transfer.criteria.join(' ')} 反馈：${transfer.feedback}`,
      ),
    ];
  if (row.outline?.length === phases.length)
    row.outline.forEach((block, i) => {
      Object.assign(block, ref(task), {
        activity: phases[i][0],
        description: phases[i][1],
        instructorNotes: taskText(task, `Expected response: ${phases[i][2]}`, `参考回答：${phases[i][2]}`),
        instructorRole: taskCopy(
          task,
          'Find the first incorrect or missing reasoning step, give the matching criterion feedback, then ask for a revision.',
        ),
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
        taskCopy(
          task,
          'Ask each learner to label the given observations and underline one claim that requires an inference. Compare their labels with the supplied record.',
        ),
    });
}

/** The task is selected before fact rotation. Every visible question, answer,
 * feedback move and rubric band below is projected from that same revision. */
export function projectSharedTeachingTasks(feature, data, blueprint, options = {}) {
  if (!data) return data;
  const previousSources = data.teachingTaskSources || [];
  data.teachingTaskSources = projectedTaskSources(blueprint);
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
    projectTeachingTaskSyllabus(data.syllabus, blueprint, options);
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
    if (options.taskIds && !options.taskIds.includes(task.id)) return;
    if (task.codingPractice) {
      row.codingPractice = { reference: task.codingReference, scope: task.validation.scope };
      const background = row.sourceEvidenceBrief || {};
      const sources = [
        ...(background.sources || []),
        { title: 'API reference — ' + task.codingReference.supports, url: task.codingReference.url },
      ];
      row.sourceEvidenceBrief = {
        ...background,
        claims: codingClaims(task, background.claims || []),
        sources: sources.filter(
          (source, index) =>
            sources.findIndex((candidate) => (candidate.url || candidate.title) === (source.url || source.title)) ===
            index,
        ),
      };
    }
    projectSourceCopies(
      row,
      task,
      previousSources.find((source) => source.id === task.id),
    );
    if (task.codingPractice || task.operationPlan?.operation === 'paired-condition-confound') {
      // The selected task owns the lesson's generated example. Keep the full
      // demonstration in teacher material, not on the student assignment.
      if (feature === 'lessonPlans') row.workedExample = teachingTaskWorkedExample(task);
      if (feature === 'assignments') delete row.workedExample;
    }
    if (feature === 'assignments') {
      projectAssignment(row, task, blueprint);
      // The overview row is another copy of this generated assignment, not a
      // separate task. Match its stable assessment identity, never its position.
      for (const summary of data.courseAssignmentMap || []) {
        if (
          (row.assessmentId && summary.assessmentId === row.assessmentId) ||
          (!row.assessmentId &&
            !summary.assessmentId &&
            Number(summary.week) === lesson.lessonNumber &&
            rows.filter(
              (candidate) =>
                Number(candidate.lessonNumber) === lesson.lessonNumber ||
                candidate.relatedLessons?.includes(lesson.title),
            ).length === 1)
        )
          Object.assign(summary, ref(task), { artifact: task.title, expectedFile: task.product });
      }
    }
    if (feature === 'rubrics' && Array.isArray(row.criteria)) projectRubric(row, task);
    if (feature === 'lessonPlans') projectPlan(row, task);
    if (feature === 'slideDecks') projectTeachingTaskSlides(row, task);
    if (feature === 'studyGuides') projectTeachingStudyGuide(row, task);
    if (feature === 'discussions')
      Object.assign(row, ref(task), {
        context: task.inputs.map((x) => x.text).join('\n'),
        prompt: task.checkpoint.question,
        evidenceRequirement: taskCopy(
          task,
          'Identify the source statement that supports your conclusion and explain how it supports or limits the claim.',
        ),
        guidelines: taskCopy(
          task,
          'Draft an individual answer, compare it with a peer response, then revise one reasoning step using a specific source statement.',
        ),
        equityConsiderations: taskCopy(
          task,
          'Allow think-write time and equivalent spoken or written responses. Evaluate the reasoning and evidence using the same criteria.',
        ),
        positionMap: [],
        estimatedDuration: taskText(task, `${task.minutes} minutes`, `${task.minutes}分钟`),
        discussionProtocol: {
          ...row.discussionProtocol,
          estimatedDuration: taskText(task, `${task.minutes} minutes`, `${task.minutes}分钟`),
          artifactUse: task.product,
          reviewFocus: task.criteria.map((c) => c.label).join('; '),
          decisionMove: task.checkpoint.question,
        },
        followUpProbes: [
          ...task.errors.map((e) =>
            taskText(
              task,
              `A learner responds: “${e.response}” Which part needs correction, and which source statement supports the correction?`,
              `一位学生回答：“${e.response}” 哪一处需要修正？哪条材料支持这一修正？`,
            ),
          ),
          ...(task.scaffoldQuestions || []).map((q) => q.question),
        ].slice(0, 3),
        facilitationTips: {
          opening: 'Allow a short individual response before students compare their reasoning.',
          ifStalls: task.errors
            .map((e) =>
              taskText(task, `${e.correction} Feedback: ${e.feedback}`, `${e.correction} 反馈：${e.feedback}`),
            )
            .join(' '),
          ifDominates:
            'Ask a different participant to identify the source statement that supports or challenges the current reasoning.',
          closure: `Reference response: ${task.checkpoint.answer}`,
          revisionCapture: 'Each learner records the specific reasoning step corrected after the discussion.',
        },
        evaluationCriteria: task.criteria.map((c) => c.levels.exemplary),
        sourceArtifacts: task.inputs.map((x, i) => ({
          title: taskText(task, `Source record ${i + 1}`, `材料${i + 1}`),
          locator: x.text,
          use: taskCopy(task, 'Use this statement to support or bound the response.'),
        })),
      });
    if (feature === 'quizBank' && options.configMap?.quizBank?.machineScored !== true && !row.gradingSpec) {
      // A newly reviewed comparison replaces the legacy generated specimen
      // for this lesson. Otherwise its protected operation questions leave
      // no seats and the new task silently receives no assessment at all.
      // Authored questions and machine-scored specifications remain protected;
      // the surrounding three-way merge preserves teacher changes.
      const reviewedComparison = task.operationPlan?.operation === 'paired-condition-confound';
      const reviewedAttribution = task.operationPlan?.operation === 'claim-attribution';
      const reviewedBank =
        task.operationPlan?.version === 2 ||
        reviewedComparison ||
        reviewedAttribution ||
        ['pooled-proportion', 'union-bounds'].includes(task.operationPlan?.operation);
      const seats =
        row.questions?.filter(
          (q) =>
            !q.machineScored &&
            (!reviewedBank || !q.taskId || q.taskId === task.id || q.sourceTaskId === task.id) &&
            ((reviewedComparison && q.enrichmentSource === 'compiler-verified-operation-assessment') ||
              (reviewedBank && q.enrichmentSource === 'lesson-content-enrichment') ||
              (['short_answer', 'essay'].includes(q.type) &&
                (!q.enrichmentSource ||
                  [
                    'compiler-teaching-program',
                    'compiler-exact-source-ledger',
                    'source-bound-recovery',
                    'shared-teaching-task',
                    ...(task.codingPractice
                      ? ['compiler-created-practice-recovery', 'admitted-kernel-assessment']
                      : []),
                  ].includes(q.enrichmentSource)))),
        ) || [];
      if (seats.length || reviewedBank)
        row.practiceRecord = {
          ...ref(task),
          title: taskCopy(task, 'Supplied task record — guided practice'),
          context: task.title,
          records: task.inputs.map((x) => x.text),
          studentUse: taskCopy(
            task,
            'Use this record for the related task questions. These rehearse the taught example; they do not establish independent transfer to a new context.',
          ),
        };
      const quizQuestions = [
        ...questions(task).filter((question) => question.practiceKind === 'independent-transfer'),
        ...questions(task).filter(
          (question) =>
            question.practiceKind !== 'independent-transfer' &&
            (!usesStructuredPracticeScoring(task) ||
              !['task-scaffold', 'task-check'].includes(question.practiceKind)) &&
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
          question: usesStructuredPracticeScoring(task)
            ? taskText(
                task,
                `After the first attempt has been reviewed, return to the independent case. ${retry.question}`,
                `首次作答经审阅后，再回到独立案例。${retry.question}`,
              )
            : task.language === 'zh'
              ? `回到本题组的独立练习。反馈：${retry.feedback} ${retry.question}`
              : `Return to the independent case in this question bank. Feedback: ${retry.feedback} ${retry.question}`,
          ...(usesStructuredPracticeScoring(task) ? { feedback: retry.feedback } : {}),
          answer: retry.answer,
          successCriteria: transfer.criteria,
        });
      if (reviewedBank) {
        projectReviewedTeachingQuestionBank(row, task, quizQuestions, seats);
        row.reviewedPracticeCount = createReviewedPracticeCount(
          data.teachingTaskSources.find((source) => source.id === task.id),
          task,
          quizQuestions,
        );
      } else
        quizQuestions.forEach((q, i) => {
          if (seats[i]) projectTeachingQuestion(seats[i], q, task);
        });
      if (task.codingPractice && !reviewedBank && Array.isArray(row.questions)) {
        const unused = new Set(seats.slice(quizQuestions.length));
        row.questions = row.questions.filter((question) => !unused.has(question));
        row.totalQuestions = row.questions.length;
        row.totalPoints = row.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
      }
    }
    if (feature === 'courseFaq') {
      const projected = {
        qs: [
          { q: taskCopy(task, 'What will I learn to do?'), an: task.objective, ca: 'Concept Explanation' },
          { q: taskCopy(task, 'What do I need to submit?'), an: task.product, ca: 'Assignment Clarification' },
          {
            q: taskCopy(task, 'Which materials do I need?'),
            ca: 'Course Logistics',
            an:
              task.preparation?.instruction ||
              taskCopy(
                task,
                'Use the source record reproduced in the lesson plan and study guide. Label your reasoning separately from statements directly supplied by the record.',
              ),
          },
          {
            q: taskCopy(task, 'How will my response be evaluated?'),
            ca: 'Assignment Clarification',
            an:
              task.criteria.map((c) => `${c.label}: ${c.weight}%`).join('; ') +
              taskText(
                task,
                '. Check the task rubric for the specific evidence at each level.',
                '。请查阅评分量规中各等级要求的具体证据。',
              ),
          },
          {
            q: taskCopy(task, 'How can I check and improve my answer?'),
            ca: 'Assessment Prep',
            an: taskCopy(
              task,
              'Attempt the task before opening the study-guide answer. Compare reasoning step by step. Use the feedback for the first incorrect or missing step, then revise your response.',
            ),
          },
          {
            q: taskCopy(task, 'How much time should I allow?'),
            ca: 'Course Logistics',
            an: taskText(
              task,
              `${task.minutes} minutes for the classroom response, followed by up to 5 minutes to correct it using feedback.`,
              `课堂作答${task.minutes}分钟，随后按反馈修改，最多5分钟。`,
            ),
          },
        ],
      };
      // Saved/UI-normalized projects use questions/question/answer; the
      // compiler also accepts compact qs/q/an. Write the collection actually
      // consumed by the editor so a sync cannot create an invisible second FAQ.
      Object.assign(row, ref(task), Array.isArray(row.questions) ? expandKeys('courseFaq', projected) : projected);
    }
  });
  return data;
}

export function projectTeachingTasksIntoCourseMap(courseMap, blueprint, { generatedCodingMap = false } = {}) {
  if (!Array.isArray(courseMap?.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((sourceLesson, index) => {
    const lesson = blueprint.lessons.find((l) => l.lessonNumber === (sourceLesson.lessonNumber || index + 1));
    const task = lesson?.teachingTask;
    if (!task) return sourceLesson;
    changed = true;
    if (lesson.teachingTaskScope !== 'primary-task')
      return { ...sourceLesson, teachingTaskLink: { ...ref(task), question: task.question } };
    const previousSource = readTeachingTaskSources(courseMap).find((source) => source.id === task.id);
    const previousPacket = previousSource ? sourcePacket(previousSource) : sourcePacket(task);
    const generatedFields = {
      syncActivities: task.question,
      asyncActivities: taskCopy(
        task,
        'Revise the classroom response using the matching criterion feedback; identify the specific correction made.',
      ),
      ...(task.codingPractice
        ? {
            learningObjectives: task.objective,
            weeklyAssessments: `${task.title} → Assignment Briefs / Lesson ${String(lesson.lessonNumber).padStart(2, '0')}`,
            syncActivities: (task.directions || [task.question]).join('\n'),
          }
        : {}),
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
        if (!current || current === previous || compilerFallback || (generatedCodingMap && task.codingPractice))
          updated[field] = value;
      }
      if (typeof section.supportingResources === 'string')
        updated.supportingResources = updateSourceCopy(section.supportingResources, sourcePacket(task), previousPacket);
      return updated;
    });
    // Keep the objectives and authored activity edits intact. The link is also
    // present when an instructor supplies an alternative activity formulation.
    return { ...sourceLesson, sections, teachingTaskLink: { ...ref(task), question: task.question, generatedFields } };
  });
  return changed ? withTeachingTaskSources({ ...courseMap, lessons }, projectedTaskSources(blueprint)) : courseMap;
}

// Generation can finish after a teacher edits the visible map. Apply only
// changes to the exact baseline still on screen; never replace those edits.
export function mergeGeneratedTaskMap(current, baseline, projected) {
  if (!current?.lessons || current.lessons.length !== baseline.lessons.length) return current;
  if (current.lessons.some((lesson, index) => lesson.title !== baseline.lessons[index].title)) return current;
  return {
    ...current,
    lessons: current.lessons.map((lesson, index) => {
      const before = baseline.lessons[index];
      const after = projected.lessons[index];
      if (!after.teachingTaskLink || lesson.sections.length !== before.sections.length) return lesson;
      return {
        ...lesson,
        teachingTaskLink: after.teachingTaskLink,
        sections: lesson.sections.map((section, sectionIndex) => {
          const next = { ...section };
          for (const field of Object.keys(after.teachingTaskLink.generatedFields || {})) {
            if (JSON.stringify(section[field]) === JSON.stringify(before.sections[sectionIndex][field]))
              next[field] = after.sections[sectionIndex][field];
          }
          return next;
        }),
      };
    }),
  };
}
