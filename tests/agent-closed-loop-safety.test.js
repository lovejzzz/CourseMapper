import { describe, expect, it } from 'vitest';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';
import { executeAction, preValidateAction } from '../src/lib/agentActions.js';
import {
  buildAgentStateDiffsFromToolResult,
  buildModelAgentReceiptFromProgress,
} from '../src/components/chat/useToolInvoker.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(value) {
  return JSON.stringify(value);
}

function baseCourseMap() {
  return {
    courseName: 'Closed Loop Agent Safety',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Foundations',
        sections: [{ learningObjectives: 'Define agent reliability', topicSection: 'Safety, state, recovery' }],
      },
      {
        title: 'Tool Use',
        sections: [{ learningObjectives: 'Use tools safely', topicSection: 'Validation, mutation, verification' }],
      },
      {
        title: 'Recovery',
        sections: [{ learningObjectives: 'Recover from failed calls', topicSection: 'Retries, receipts, proof' }],
      },
    ],
  };
}

function fourteenLessonCourseMap() {
  return {
    courseName: 'Large Agent Reliability Studio',
    semester: 'Fall 2026',
    lessons: Array.from({ length: 14 }, (_, index) => ({
      title: `Module ${index + 1}`,
      sections: [
        {
          learningObjectives: `Evaluate reliability evidence ${index + 1}`,
          topicSection: `Agent reliability scenario ${index + 1}`,
        },
      ],
    })),
  };
}

function baseDeliverables() {
  return {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          { lt: 'Foundations', qs: [{ q: 'What is reliability?', ty: 'short_answer', bl: 'Understand', pt: 2 }] },
          { lt: 'Tool Use', qs: [{ q: 'What should validation prevent?', ty: 'short_answer', bl: 'Apply', pt: 2 }] },
          { lt: 'Recovery', qs: [{ q: 'What should a retry preserve?', ty: 'short_answer', bl: 'Analyze', pt: 2 }] },
        ],
      },
    },
    rubrics: {
      status: 'done',
      data: {
        rubrics: [
          { lt: 'Foundations', cr: [{ cn: 'Accuracy', ex: 'Precise', pr: 'Mostly precise', wt: 50 }] },
          { lt: 'Tool Use', cr: [{ cn: 'Safety', ex: 'Validates first', pr: 'Usually validates', wt: 50 }] },
          { lt: 'Recovery', cr: [{ cn: 'Recovery', ex: 'Verifies state', pr: 'Checks output', wt: 50 }] },
        ],
      },
    },
    assignments: {
      status: 'done',
      data: {
        assignments: [{ t: 'Reliability memo', ov: 'Explain a safe agent workflow.', rl: ['Foundations'] }],
      },
    },
    slideDecks: {
      status: 'done',
      data: {
        decks: [
          {
            lessonTitle: 'Foundations',
            slides: [{ title: 'Reliability', notes: 'Define reliability.', visual: { kind: 'none' } }],
          },
          {
            lessonTitle: 'Tool Use',
            slides: [{ title: 'Validation', notes: 'Explain validation.', visual: { kind: 'diagram' } }],
          },
          {
            lessonTitle: 'Recovery',
            slides: [{ title: 'Recovery', notes: 'Explain recovery.', visual: { kind: 'chart' } }],
          },
        ],
      },
    },
    lessonPlans: {
      status: 'done',
      data: {
        lessonPlans: [
          { lt: 'Foundations', ob: 'Define reliability', ol: [{ tm: 'Reliability', de: 'State safety' }] },
          { lt: 'Tool Use', ob: 'Use tools safely', ol: [{ tm: 'Validation', de: 'Guard mutations' }] },
          { lt: 'Recovery', ob: 'Recover from failures', ol: [{ tm: 'Recovery', de: 'Verify outcomes' }] },
        ],
      },
    },
    studyGuides: {
      status: 'done',
      data: {
        studyGuides: [
          { lt: 'Foundations', kt: [{ tm: 'Reliability', df: 'Consistent safe behavior' }], rq: [], cm: [] },
          { lt: 'Tool Use', kt: [{ tm: 'Validation', df: 'Checking before mutation' }], rq: [], cm: [] },
          { lt: 'Recovery', kt: [{ tm: 'Recovery', df: 'Returning to good state' }], rq: [], cm: [] },
        ],
      },
    },
    discussions: {
      status: 'done',
      data: {
        discussions: [
          { lt: 'Foundations', pr: 'Where can agent reliability fail?' },
          { lt: 'Tool Use', pr: 'What should tools prove before mutation?' },
          { lt: 'Recovery', pr: 'How should failures be recovered?' },
        ],
      },
    },
    courseFaq: {
      status: 'done',
      data: {
        faqs: [
          { lt: 'Foundations', qs: [{ q: 'Why reliability?', an: 'It protects user work.' }] },
          { lt: 'Tool Use', qs: [{ q: 'Why validation?', an: 'It prevents invalid writes.' }] },
          { lt: 'Recovery', qs: [{ q: 'Why receipts?', an: 'They make changes inspectable.' }] },
        ],
      },
    },
  };
}

function repairableQuizDeliverables() {
  return {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          {
            lt: 'Foundations',
            qs: [
              {
                ty: 'mc',
                df: '',
                em: 0,
                q: 'Which option is strongest?',
                op: ['A. One', 'B. Two', 'C. Three', 'D. Four'],
                an: 'B',
                pt: 0,
                ex: '',
              },
            ],
            tp: 99,
          },
        ],
      },
    },
  };
}

function repairableDiscussionDeliverables() {
  return {
    discussions: {
      status: 'done',
      data: {
        discussions: [
          {
            lt: 'Foundations',
            pr: 'Which reliability revision is best supported?',
            er: 'Use the audit rows 1-4.',
            fp: ['What evidence supports that?', 'What limitation remains?', 'What revision would you test?'],
            ft: { op: 'Start with individual annotation.', is: 'Compare one row aloud.', cl: 'Name one revision.' },
            ec: ['Uses specific evidence', 'Explains method reasoning'],
            af: [{ at: 'Week 1 artifact 1', lo: 'Rows 1-4', ut: 'Support one claim.' }],
          },
        ],
      },
    },
    quizBank: {
      status: 'done',
      data: {
        quizzes: [
          {
            lt: 'Foundations',
            tq: 5,
            tp: 10,
            bc: ['Understand'],
            qs: Array.from({ length: 5 }, (_, index) => ({
              q: `Question ${index + 1}`,
              ty: 'short_answer',
              df: 'Medium',
              em: 4,
              pt: 2,
              bl: 'Understand',
              an: 'A complete response names the relevant evidence and method decision.',
              ex: 'A complete answer names the evidence and explains the method decision.',
            })),
          },
        ],
      },
    },
  };
}

function weakSlideDeckDeliverables() {
  return {
    slideDecks: {
      status: 'done',
      data: {
        decks: [{ lt: 'Foundations', sl: [{ t: 'Only slide' }] }],
      },
    },
  };
}

function createHarness(overrides = {}) {
  const state = {
    courseMap: clone(overrides.courseMap || baseCourseMap()),
    deliverables: clone(overrides.deliverables || baseDeliverables()),
    regenerateCalls: [],
    snapshots: [],
  };

  const editor = {
    handleCellEdit(lessonIndex, sectionIndex, field, value) {
      state.courseMap.lessons[lessonIndex].sections ||= [];
      state.courseMap.lessons[lessonIndex].sections[sectionIndex] ||= {};
      state.courseMap.lessons[lessonIndex].sections[sectionIndex][field] = value;
    },
    handleTitleEdit(lessonIndex, newTitle) {
      state.courseMap.lessons[lessonIndex].title = newTitle;
    },
    handleAddLesson({ title, sections, lesson, lessonIndex } = {}) {
      const nextLesson = lesson || { title: title || 'New Lesson', sections: sections || [{}] };
      const insertAt = Number.isInteger(lessonIndex) ? lessonIndex : state.courseMap.lessons.length;
      state.courseMap.lessons.splice(insertAt, 0, nextLesson);
      return insertAt;
    },
    handleDeleteLesson(lessonIndex) {
      state.courseMap.lessons.splice(lessonIndex, 1);
    },
  };

  const optimisticUpdate = (featureId, data) => {
    state.deliverables[featureId] = {
      ...(state.deliverables[featureId] || {}),
      status: state.deliverables[featureId]?.status || 'done',
      data,
    };
  };

  function actionCtx(extra = {}) {
    return {
      editor,
      courseMap: state.courseMap,
      deliverables: state.deliverables,
      optimisticUpdate,
      regenerateLesson: (featureId, courseMap, lessonIndex) => {
        state.regenerateCalls.push({ featureId, lessonIndex, lessonTitle: courseMap.lessons[lessonIndex]?.title });
      },
      snapshot: (featureId, data) => state.snapshots.push({ featureId, data: clone(data) }),
      ...extra,
    };
  }

  function toolCtx() {
    return {
      courseMap: state.courseMap,
      deliverables: state.deliverables,
      selectedFeatures: overrides.selectedFeatures || ['courseMap', ...Object.keys(state.deliverables)],
      columns: overrides.columns || [],
      activeTab: overrides.activeTab || 'courseMap',
      executeAction:
        overrides.executeAction === undefined
          ? (action, opts = {}) => executeAction(action, actionCtx(opts))
          : overrides.executeAction,
      projectDeliverableActionToCanonicalPatch: overrides.projectDeliverableActionToCanonicalPatch || (() => null),
      optimisticUpdate: overrides.optimisticUpdate === undefined ? optimisticUpdate : overrides.optimisticUpdate,
      setCurrentDeliverables: (nextDeliverables) => {
        if (nextDeliverables) state.deliverables = nextDeliverables;
      },
      snapshot: (featureId, data) => state.snapshots.push({ featureId, data: clone(data) }),
      undoFn: overrides.undoFn || null,
      customTools: overrides.customTools || null,
    };
  }

  return {
    state,
    actionCtx,
    toolCtx,
    runDeliverableActions: (actions) => AGENT_TOOLS.edit_deliverables.execute({ actions }, toolCtx()),
    runCourseMapPatches: (patches) => AGENT_TOOLS.edit_course_map.execute({ patches }, toolCtx()),
    readDeliverable: (args) => AGENT_TOOLS.read_deliverable.execute(args, toolCtx()),
  };
}

const TOOL_LABELS = {
  inspect_workspace: 'Inspect workspace',
  plan_workspace_next_step: 'Plan next step',
  edit_course_map: 'Edit course map',
  edit_deliverables: 'Edit deliverables',
  finalize_package: 'Finish package',
  repair_package_readiness: 'Repair package readiness',
  retry_package_weak_spots: 'Retry weak sections',
  review_package_readiness: 'Review package readiness',
  run_tool: 'Run custom tool',
  undo_last: 'Undo last change',
  read_lesson: 'Read lesson',
  read_deliverable: 'Read deliverable',
  validate_course: 'Validate course materials',
};

function classifyMutationStepStatus(result = {}) {
  if (result.error) return 'error';
  const applied = Number(result.applied || result.started || 0);
  const failed = Number(result.failed || 0);
  if (failed > 0) return applied > 0 ? 'partial' : 'error';
  return 'done';
}

function summarizeMutationResult(result = {}) {
  if (result.error) return result.error;
  const applied = Number(result.applied || result.started || 0);
  const pending = Number(result.pending || 0);
  const failed = Number(result.failed || 0);
  const parts = [];
  if (applied > 0) parts.push(`${applied} applied`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(', ') || result.note || 'Tool result status';
}

function summarizeVerifierResult(toolName, result = {}, args = {}) {
  if (result.error) return result.error;
  if (toolName === 'inspect_workspace') return result.summary || 'Workspace inspected';
  if (toolName === 'plan_workspace_next_step') return result.nextAction?.title || result.recommendation || 'Plan ready';
  if (toolName === 'read_lesson') return `Verified Lesson ${Number(args.lessonIndex) + 1}`;
  if (toolName === 'read_deliverable') {
    if (Number.isFinite(result.totalItems)) return `Verified ${result.totalItems} items`;
    return result.data ? 'Verified data' : 'Verified deliverable';
  }
  if (toolName === 'validate_course') {
    return `${result.errorCount || 0} errors, ${result.warningCount || 0} warnings`;
  }
  return 'Verified state';
}

function defaultFinalResponseForScenario({ verifier = null } = {}, mutationStatus = 'done') {
  if (mutationStatus === 'error') {
    return { chatReply: 'I did not apply the unsafe change. The blocked action is listed in the receipt.' };
  }
  if (mutationStatus === 'partial') {
    return { chatReply: 'I applied the safe part, verified the target, and surfaced the failed action for review.' };
  }
  if (verifier) {
    return { chatReply: 'Applied the requested change and verified the final state before responding.' };
  }
  return { chatReply: 'Applied the requested change and surfaced the receipt evidence for review.' };
}

function runClosedLoopScenario(
  harness,
  {
    toolName,
    args,
    preludeSteps = [],
    verifier = null,
    activeTab = 'courseMap',
    finalResponse = null,
    qualityExpectations = null,
  },
) {
  const beforeContext = {
    courseMap: clone(harness.state.courseMap),
    deliverables: clone(harness.state.deliverables),
  };
  const steps = [];
  const preludeResults = [];
  for (const prelude of preludeSteps) {
    const preludeResult = AGENT_TOOLS[prelude.toolName].execute(prelude.args || {}, harness.toolCtx());
    preludeResults.push(preludeResult);
    steps.push({
      tool: prelude.toolName,
      label: TOOL_LABELS[prelude.toolName] || prelude.toolName,
      status: preludeResult?.error ? 'error' : 'done',
      summary: summarizeVerifierResult(prelude.toolName, preludeResult, prelude.args || {}),
      targets: prelude.targets || ['Workspace'],
    });
  }
  const tool = AGENT_TOOLS[toolName];
  const result = tool.execute(args, harness.toolCtx());
  const stateDiffs = buildAgentStateDiffsFromToolResult(toolName, args, result, beforeContext);
  const mutationStatus = classifyMutationStepStatus(result);
  steps.push({
    tool: toolName,
    label: TOOL_LABELS[toolName] || toolName,
    status: mutationStatus,
    summary: summarizeMutationResult(result),
    targets: [activeTab],
    stateDiffs,
  });

  let verifierResult = null;
  if (verifier) {
    verifierResult = AGENT_TOOLS[verifier.toolName].execute(verifier.args || {}, harness.toolCtx());
    steps.push({
      tool: verifier.toolName,
      label: TOOL_LABELS[verifier.toolName] || verifier.toolName,
      status: verifierResult?.error ? 'error' : 'done',
      summary: summarizeVerifierResult(verifier.toolName, verifierResult, verifier.args),
      targets: verifier.targets || [activeTab],
    });
  }

  return {
    result,
    preludeResults,
    verifierResult,
    receiptMessage: buildModelAgentReceiptFromProgress(
      {
        status: 'complete',
        steps,
      },
      {
        finalResponse: finalResponse || defaultFinalResponseForScenario({ verifier }, mutationStatus),
        qualityExpectations: {
          intent: 'content_edit',
          ...(qualityExpectations || {}),
        },
      },
    ),
    stateDiffs,
  };
}

async function runAsyncClosedLoopScenario(
  harness,
  {
    toolName,
    args,
    preludeSteps = [],
    verifier = null,
    activeTab = 'courseMap',
    finalResponse = null,
    qualityExpectations = null,
  },
) {
  const beforeContext = {
    courseMap: clone(harness.state.courseMap),
    deliverables: clone(harness.state.deliverables),
    activeTab,
  };
  const steps = [];
  const preludeResults = [];
  for (const prelude of preludeSteps) {
    const preludeResult = await AGENT_TOOLS[prelude.toolName].execute(prelude.args || {}, harness.toolCtx());
    preludeResults.push(preludeResult);
    steps.push({
      tool: prelude.toolName,
      label: TOOL_LABELS[prelude.toolName] || prelude.toolName,
      status: preludeResult?.error ? 'error' : 'done',
      summary: summarizeVerifierResult(prelude.toolName, preludeResult, prelude.args || {}),
      targets: prelude.targets || ['Workspace'],
    });
  }
  const tool = AGENT_TOOLS[toolName];
  const result = await tool.execute(args, harness.toolCtx());
  const stateDiffs = buildAgentStateDiffsFromToolResult(toolName, args, result, beforeContext);
  const mutationStatus = classifyMutationStepStatus(result);
  steps.push({
    tool: toolName,
    label: TOOL_LABELS[toolName] || toolName,
    status: mutationStatus,
    summary: summarizeMutationResult(result),
    targets: [activeTab],
    stateDiffs,
  });

  let verifierResult = null;
  if (verifier) {
    verifierResult = await AGENT_TOOLS[verifier.toolName].execute(verifier.args || {}, harness.toolCtx());
    steps.push({
      tool: verifier.toolName,
      label: TOOL_LABELS[verifier.toolName] || verifier.toolName,
      status: verifierResult?.error ? 'error' : 'done',
      summary: summarizeVerifierResult(verifier.toolName, verifierResult, verifier.args),
      targets: verifier.targets || [activeTab],
    });
  }

  return {
    result,
    preludeResults,
    verifierResult,
    receiptMessage: buildModelAgentReceiptFromProgress(
      {
        status: result?.error ? 'error' : 'complete',
        steps,
      },
      {
        finalResponse: finalResponse || defaultFinalResponseForScenario({ verifier }, mutationStatus),
        qualityExpectations: {
          intent: 'content_edit',
          ...(qualityExpectations || {}),
        },
      },
    ),
    stateDiffs,
  };
}

const noMutationCases = [
  {
    name: 'blocks adding rubric criteria when rubrics were never generated',
    remove: ['rubrics'],
    action: { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Ghost', ex: 'No' } },
  },
  {
    name: 'blocks creating assignments when assignments were never generated',
    remove: ['assignments'],
    action: { type: 'addItem', featureId: 'assignments', item: { t: 'Ghost assignment' } },
  },
  {
    name: 'blocks adding rubric criteria while rubrics are loading',
    patch: { rubrics: { status: 'loading', data: null } },
    action: { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Ghost', ex: 'No' } },
  },
  {
    name: 'blocks adding assignments after assignment generation failed',
    patch: { assignments: { status: 'error', error: 'quota', data: null } },
    action: { type: 'addItem', featureId: 'assignments', item: { t: 'Ghost assignment' } },
  },
  {
    name: 'blocks adding a rubric entry for a missing lesson slot',
    action: { type: 'addItem', featureId: 'rubrics', lessonIndex: 3, item: { cn: 'Ghost', ex: 'No' } },
  },
  {
    name: 'blocks adding a lesson-plan entry for a missing lesson slot',
    action: { type: 'addItem', featureId: 'lessonPlans', lessonIndex: 3, item: { ob: 'Ghost objective' } },
  },
  {
    name: 'blocks editing slide data outside generated lesson range',
    action: { type: 'editItem', featureId: 'slideDecks', path: ['decks', 8, 'slides', 0, 'notes'], value: 'Ghost' },
  },
  {
    name: 'blocks removing FAQ content when FAQ was never generated',
    remove: ['courseFaq'],
    action: { type: 'removeItem', featureId: 'courseFaq', lessonIndex: 0, itemIndex: 0 },
  },
  {
    name: 'blocks removeItem without an item index',
    action: { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0 },
  },
  {
    name: 'blocks regenerating a study guide that does not exist',
    remove: ['studyGuides'],
    action: { type: 'regenerateLesson', featureId: 'studyGuides', lessonIndex: 0 },
  },
  {
    name: 'blocks regenerating outside the generated range',
    action: { type: 'regenerateLesson', featureId: 'studyGuides', lessonIndex: 9 },
  },
  {
    name: 'blocks editing an unknown deliverable id',
    action: { type: 'editItem', featureId: 'custom_missing', path: ['items', 0, 'text'], value: 'Ghost' },
  },
  {
    name: 'blocks duplicate quiz questions in the same lesson',
    action: { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is reliability?' } },
  },
  {
    name: 'blocks quiz additions without the required question text',
    action: { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { ty: 'short_answer' } },
  },
  {
    name: 'blocks invalid edit paths without creating new objects',
    action: { type: 'editItem', featureId: 'rubrics', path: ['rubrics', 0, 'missing', 0, 'ex'], value: 'Ghost' },
  },
];

describe('agent closed-loop safety guards', () => {
  it.each(noMutationCases)('$name', async ({ remove = [], patch = {}, action }) => {
    const deliverables = baseDeliverables();
    remove.forEach((featureId) => delete deliverables[featureId]);
    Object.entries(patch).forEach(([featureId, entry]) => {
      deliverables[featureId] = entry;
    });
    const harness = createHarness({ deliverables });
    const before = hash(harness.state.deliverables);

    const result = await harness.runDeliverableActions([action]);

    expect(result.failed).toBe(1);
    expect(result.applied || 0).toBe(0);
    expect(hash(harness.state.deliverables)).toBe(before);
  });

  const mutationCases = [
    {
      name: 'renames the requested lesson and verifies final title',
      run: async (h) => h.runCourseMapPatches([{ field: 'title', lessonIndex: 1, value: 'Tool Safety Lab' }]),
      assert: (h) => expect(h.state.courseMap.lessons[1].title).toBe('Tool Safety Lab'),
    },
    {
      name: 'updates a course-map field through an alias',
      run: async (h) => h.runCourseMapPatches([{ lessonIndex: 0, field: 'lo', value: 'Prove state-safe behavior' }]),
      assert: (h) =>
        expect(h.state.courseMap.lessons[0].sections[0].learningObjectives).toBe('Prove state-safe behavior'),
    },
    {
      name: 'adds a course-map lesson at the end',
      run: async (h) =>
        h.runCourseMapPatches([
          { action: 'addLesson', title: 'Evaluation', sections: [{ learningObjectives: 'Evaluate agents' }] },
        ]),
      assert: (h) => expect(h.state.courseMap.lessons.map((lesson) => lesson.title)).toContain('Evaluation'),
    },
    {
      name: 'deletes a course-map lesson when more than one lesson exists',
      run: async (h) => h.runCourseMapPatches([{ action: 'removeLesson', lessonIndex: 2 }]),
      assert: (h) => expect(h.state.courseMap.lessons.map((lesson) => lesson.title)).not.toContain('Recovery'),
    },
    {
      name: 'adds a quiz question to an existing generated lesson',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'addItem',
            featureId: 'quizBank',
            lessonIndex: 1,
            item: { q: 'Which guard runs first?', ty: 'short_answer' },
          },
        ]),
      assert: (h) => expect(h.state.deliverables.quizBank.data.quizzes[1].qs.at(-1).q).toBe('Which guard runs first?'),
    },
    {
      name: 'edits a quiz question and verifies through read_deliverable',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'editItem',
            featureId: 'quizBank',
            path: ['quizzes', 0, 'qs', 0, 'q'],
            value: 'What is state-safe reliability?',
          },
        ]),
      assert: (h) => {
        const read = h.readDeliverable({ featureId: 'quizBank', lessonIndex: 0 });
        expect(read.data.qs[0].q).toBe('What is state-safe reliability?');
      },
    },
    {
      name: 'removes the targeted quiz question only',
      run: async (h) =>
        h.runDeliverableActions([{ type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 0 }]),
      assert: (h) => expect(h.state.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(0),
    },
    {
      name: 'adds a rubric criterion to an existing lesson',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'addItem',
            featureId: 'rubrics',
            lessonIndex: 0,
            item: { cn: 'Evidence', ex: 'Cites state proof', pr: 'Cites output' },
          },
        ]),
      assert: (h) => expect(h.state.deliverables.rubrics.data.rubrics[0].cr.at(-1).cn).toBe('Evidence'),
    },
    {
      name: 'edits a rubric descriptor with a canonical path',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'editItem',
            featureId: 'rubrics',
            path: ['rubrics', 1, 'cr', 0, 'ex'],
            value: 'Validates before every mutation',
          },
        ]),
      assert: (h) =>
        expect(h.state.deliverables.rubrics.data.rubrics[1].cr[0].ex).toBe('Validates before every mutation'),
    },
    {
      name: 'adds an assignment to the existing assignment deliverable',
      run: async (h) =>
        h.runDeliverableActions([
          { type: 'addItem', featureId: 'assignments', item: { t: 'Tool audit memo', ov: 'Audit tool safety.' } },
        ]),
      assert: (h) => expect(h.state.deliverables.assignments.data.assignments.at(-1).t).toBe('Tool audit memo'),
    },
    {
      name: 'edits assignment overview by path',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'editItem',
            featureId: 'assignments',
            path: ['assignments', 0, 'ov'],
            value: 'Explain a verified agent workflow.',
          },
        ]),
      assert: (h) =>
        expect(h.state.deliverables.assignments.data.assignments[0].ov).toBe('Explain a verified agent workflow.'),
    },
    {
      name: 'removes an assignment by index',
      run: async (h) => h.runDeliverableActions([{ type: 'removeItem', featureId: 'assignments', itemIndex: 0 }]),
      assert: (h) => expect(h.state.deliverables.assignments.data.assignments).toHaveLength(0),
    },
    {
      name: 'edits slide notes using shorthand aliases',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'editItem',
            featureId: 'slideDecks',
            path: ['slideDecks', 0, 'sl', 0, 'no'],
            value: 'Define reliability with a concrete state example.',
          },
        ]),
      assert: (h) =>
        expect(h.state.deliverables.slideDecks.data.decks[0].slides[0].notes).toBe(
          'Define reliability with a concrete state example.',
        ),
    },
    {
      name: 'edits study guide term definitions in place',
      run: async (h) =>
        h.runDeliverableActions([
          {
            type: 'editItem',
            featureId: 'studyGuides',
            path: ['studyGuides', 1, 'kt', 0, 'df'],
            value: 'A pre-mutation safety check.',
          },
        ]),
      assert: (h) =>
        expect(h.state.deliverables.studyGuides.data.studyGuides[1].kt[0].df).toBe('A pre-mutation safety check.'),
    },
    {
      name: 'starts regeneration only for an existing generated lesson',
      run: async (h) =>
        h.runDeliverableActions([{ type: 'regenerateLesson', featureId: 'lessonPlans', lessonIndex: 2 }]),
      assert: (h) =>
        expect(h.state.regenerateCalls).toEqual([
          { featureId: 'lessonPlans', lessonIndex: 2, lessonTitle: 'Recovery' },
        ]),
    },
  ];

  it.each(mutationCases)('$name', async ({ run, assert }) => {
    const harness = createHarness();
    const result = await run(harness);

    expect(result.error).toBeUndefined();
    expect((result.applied || 0) + (result.pending || 0)).toBeGreaterThan(0);
    assert(harness);
  });

  const receiptClosedLoopCases = [
    {
      name: 'course-map rename executes, reads back the lesson, and receipts the before-after state',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 1, field: 'title', value: 'Verifier Lab' }] },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 1 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[1].title).toBe('Verifier Lab');
        expect(receiptMessage.receipt).toMatchObject({
          status: 'done',
          verification: expect.objectContaining({ status: 'verified' }),
          stateDiffs: [expect.objectContaining({ status: 'changed', before: 'Tool Use', after: 'Verifier Lab' })],
        });
      },
    },
    {
      name: 'course-map alias edit records canonical before-after evidence',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 0, field: 'lo', value: 'Define verifier-backed receipts' }] },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 0 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[0].sections[0].learningObjectives).toBe(
          'Define verifier-backed receipts',
        );
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          before: 'Define agent reliability',
          after: 'Define verifier-backed receipts',
        });
      },
    },
    {
      name: 'large fourteen-lesson course appends a new lesson and verifies the new slot',
      makeHarness: () => createHarness({ courseMap: fourteenLessonCourseMap(), deliverables: {} }),
      scenario: {
        toolName: 'edit_course_map',
        args: {
          patches: [
            {
              action: 'addLesson',
              title: 'Capstone Audit',
              sections: [{ learningObjectives: 'Audit an agent run end to end.' }],
            },
          ],
        },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 14 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons).toHaveLength(15);
        expect(harness.state.courseMap.lessons[14].title).toBe('Capstone Audit');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'changed',
          before: '14 lessons',
          after: 'Capstone Audit',
        });
      },
    },
    {
      name: 'quiz wording edit mutates state, reads back the deliverable, and receipts the exact question diff',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              lessonIndex: 0,
              path: ['quizzes', 0, 'qs', 0, 'q'],
              value: 'What evidence proves a verifier ran?',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 0 } },
        activeTab: 'Quiz & Exam Bank',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs[0].q).toBe(
          'What evidence proves a verifier ran?',
        );
        expect(receiptMessage.receipt).toMatchObject({
          status: 'done',
          stateDiffs: [
            expect.objectContaining({
              status: 'changed',
              before: 'What is reliability?',
              after: 'What evidence proves a verifier ran?',
            }),
          ],
        });
      },
    },
    {
      name: 'assignment addition records the new item and verifies assignment state',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'addItem',
              featureId: 'assignments',
              item: { t: 'Recovery memo', ov: 'Explain the verifier loop.' },
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'assignments' } },
        activeTab: 'Assignment Briefs',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.assignments.data.assignments.at(-1).t).toBe('Recovery memo');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'changed',
          action: 'addItem',
          target: 'Assignment Briefs',
          after: 'Recovery memo',
        });
      },
    },
    {
      name: 'partial batch keeps successful edit, records failed action, verifies the successful target, and needs review',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              lessonIndex: 0,
              path: ['quizzes', 0, 'qs', 0, 'q'],
              value: 'What changed safely?',
            },
            {
              type: 'addItem',
              featureId: 'rubrics',
              lessonIndex: 99,
              item: { cn: 'Ghost criterion', ex: 'Impossible', pr: 'Impossible' },
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 0 } },
        activeTab: 'Quiz & Exam Bank',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs[0].q).toBe('What changed safely?');
        expect(receiptMessage.receipt.status).toBe('review');
        expect(receiptMessage.receipt.verification.status).toBe('verified');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['changed', 'failed']);
        expect(receiptMessage.receipt.stateDiffs[1]).toMatchObject({
          target: 'Rubrics',
          reason: expect.stringContaining('out of range'),
        });
      },
    },
    {
      name: 'missing deliverable edit refuses ghost assignment creation and leaves state unchanged',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        delete deliverables.assignments;
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [{ type: 'addItem', featureId: 'assignments', item: { t: 'Ghost assignment' } }],
        },
        activeTab: 'Assignment Briefs',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt).toMatchObject({
          status: 'blocked',
          verification: expect.objectContaining({ status: 'not_required' }),
          stateDiffs: [expect.objectContaining({ status: 'failed', target: 'Assignment Briefs' })],
        });
      },
    },
    {
      name: 'loading deliverable edit refuses mutation while generation is incomplete',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.rubrics = { status: 'loading', data: null };
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [{ type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Too early' } }],
        },
        activeTab: 'Rubrics',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'failed',
          target: 'Rubrics',
        });
      },
    },
    {
      name: 'duplicate quiz addition is refused with a failed state-diff reason',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'addItem',
              featureId: 'quizBank',
              lessonIndex: 0,
              item: { q: 'What is reliability?', ty: 'short_answer' },
            },
          ],
        },
        activeTab: 'Quiz & Exam Bank',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'failed',
          reason: expect.stringContaining('Duplicate'),
        });
      },
    },
    {
      name: 'blueprint sync projection queues a pending state diff without directly mutating artifacts',
      makeHarness: () =>
        createHarness({
          projectDeliverableActionToCanonicalPatch: () => ({
            patch: {
              field: 'learningObjectives',
              label: 'learning objectives',
              lessonIndex: 0,
              value: 'Audit verifier evidence.',
            },
            editContext: 'learning objectives changed',
          }),
        }),
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'lessonPlans',
              lessonIndex: 0,
              path: ['lessonPlans', 0, 'ob'],
              value: 'Audit verifier evidence.',
            },
          ],
        },
        activeTab: 'Lesson Plans',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.lessonPlans.data.lessonPlans[0].ob).toBe('Define reliability');
        expect(receiptMessage.receipt.status).toBe('review');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'pending',
          target: 'Lesson Plans',
          before: 'Define reliability',
          after: expect.stringContaining('Queued learning objectives'),
        });
      },
    },
    {
      name: 'localized regeneration records a queued diff and verifies the existing deliverable slot',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [{ type: 'regenerateLesson', featureId: 'lessonPlans', lessonIndex: 2 }],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'lessonPlans', lessonIndex: 2 } },
        activeTab: 'Lesson Plans',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.regenerateCalls).toEqual([
          { featureId: 'lessonPlans', lessonIndex: 2, lessonTitle: 'Recovery' },
        ]);
        expect(receiptMessage.receipt.verification.status).toBe('verified');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'pending',
          after: expect.stringContaining('Regeneration started'),
        });
      },
    },
  ];

  it.each(receiptClosedLoopCases)('$name', ({ makeHarness, scenario, assert }) => {
    const harness = makeHarness ? makeHarness() : createHarness();
    const beforeHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });
    const outcome = runClosedLoopScenario(harness, scenario);
    const afterHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });

    expect(outcome.receiptMessage?.role).toBe('agentReceipt');
    expect(outcome.receiptMessage.receipt.runStats.stateDiffCount).toBe(
      outcome.receiptMessage.receipt.stateDiffs.length,
    );
    expect(outcome.receiptMessage.receipt.quality).toMatchObject({
      score: expect.any(Number),
      dimensions: expect.arrayContaining([
        expect.objectContaining({ id: 'intent' }),
        expect.objectContaining({ id: 'safety' }),
        expect.objectContaining({ id: 'verification' }),
        expect.objectContaining({ id: 'response' }),
        expect.objectContaining({ id: 'recovery' }),
      ]),
    });
    expect(outcome.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(scenario.minimumQualityScore || 75);
    if (outcome.receiptMessage.receipt.status === 'done') {
      expect(outcome.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(90);
    }
    assert({ harness, beforeHash, afterHash, ...outcome });
  });

  const advancedClosedLoopCases = [
    {
      name: 'course-map unknown field is blocked before creating a stray property',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 0, field: 'ghostField', value: 'Do not write this' }] },
        activeTab: 'Course Map',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt).toMatchObject({
          status: 'blocked',
          stateDiffs: [expect.objectContaining({ status: 'failed', reason: expect.stringContaining('Unknown') })],
        });
      },
    },
    {
      name: 'partial course-map batch applies safe rename and blocks invalid field',
      scenario: {
        toolName: 'edit_course_map',
        args: {
          patches: [
            { lessonIndex: 0, field: 'title', value: 'Foundations Lab' },
            { lessonIndex: 0, field: 'ghostField', value: 'No stray field' },
          ],
        },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 0 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[0].title).toBe('Foundations Lab');
        expect(harness.state.courseMap.lessons[0].sections[0].ghostField).toBeUndefined();
        expect(receiptMessage.receipt.status).toBe('review');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['changed', 'failed']);
      },
    },
    {
      name: 'duplicate existing lesson title is blocked before addLesson mutates state',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ action: 'addLesson', title: 'Foundations', sections: [{ topicSection: 'Duplicate' }] }] },
        activeTab: 'Course Map',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0].reason).toContain('already exists');
      },
    },
    {
      name: 'duplicate lesson title inside one add batch becomes partial with one safe insertion',
      scenario: {
        toolName: 'edit_course_map',
        args: {
          patches: [
            { action: 'addLesson', title: 'Studio Sprint', sections: [{ topicSection: 'Sprint A' }] },
            { action: 'addLesson', title: 'Studio Sprint', sections: [{ topicSection: 'Sprint B' }] },
          ],
        },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 3 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons).toHaveLength(4);
        expect(harness.state.courseMap.lessons[3].title).toBe('Studio Sprint');
        expect(receiptMessage.receipt.status).toBe('review');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['changed', 'failed']);
      },
    },
    {
      name: 'custom course-map column edit is allowed when runtime columns declare it',
      makeHarness: () => createHarness({ columns: [{ key: 'communityPartner' }] }),
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 0, field: 'communityPartner', value: 'Local clinic' }] },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 0 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[0].sections[0].communityPartner).toBe('Local clinic');
        expect(receiptMessage.receipt.status).toBe('done');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({ after: 'Local clinic' });
      },
    },
    {
      name: 'explicit lesson insertion verifies the inserted slot',
      scenario: {
        toolName: 'edit_course_map',
        args: {
          patches: [
            {
              action: 'addLesson',
              lessonIndex: 1,
              title: 'Midpoint Lab',
              sections: [{ learningObjectives: 'Practice midpoint verification.' }],
            },
          ],
        },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 1 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[1].title).toBe('Midpoint Lab');
        expect(receiptMessage.receipt.status).toBe('done');
      },
    },
    {
      name: 'course-map removeLesson records removed lesson evidence and verifies remaining state',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ action: 'removeLesson', lessonIndex: 2 }] },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 1 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons.map((lesson) => lesson.title)).not.toContain('Recovery');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'changed',
          action: 'removeLesson',
          before: 'Recovery',
          after: 'Removed lesson',
        });
      },
    },
    {
      name: 'course-map section index outside range is blocked before mutation',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 0, sectionIndex: 9, field: 'topicSection', value: 'No write' }] },
        activeTab: 'Course Map',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0].reason).toContain('sectionIndex');
      },
    },
    {
      name: 'blank course-map title is blocked before mutation',
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ lessonIndex: 1, field: 'title', value: '   ' }] },
        activeTab: 'Course Map',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0].reason).toContain('blank');
      },
    },
    {
      name: 'slide visual kind edit is verified through read_deliverable',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'slideDecks',
              path: ['decks', 0, 'slides', 0, 'visual', 'kind'],
              value: 'image',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'slideDecks', lessonIndex: 0 } },
        activeTab: 'Slide Decks',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.slideDecks.data.decks[0].slides[0].visual.kind).toBe('image');
        expect(receiptMessage.receipt.status).toBe('done');
      },
    },
    {
      name: 'slide visual alt text edit keeps the visual object intact',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'slideDecks',
              path: ['decks', 1, 'slides', 0, 'visual', 'altText'],
              value: 'Flowchart of validation and verification.',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'slideDecks', lessonIndex: 1 } },
        activeTab: 'Slide Decks',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.slideDecks.data.decks[1].slides[0].visual).toMatchObject({
          kind: 'diagram',
          altText: 'Flowchart of validation and verification.',
        });
      },
    },
    {
      name: 'discussion prompt edit verifies the exact lesson prompt',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'discussions',
              path: ['discussions', 1, 'pr'],
              value: 'When should an agent ask before editing?',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'discussions', lessonIndex: 1 } },
        activeTab: 'Discussion Prompts',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.discussions.data.discussions[1].pr).toBe(
          'When should an agent ask before editing?',
        );
      },
    },
    {
      name: 'FAQ answer edit verifies nested answer text',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'courseFaq',
              path: ['faqs', 0, 'qs', 0, 'an'],
              value: 'Reliability protects instructor work and student-facing materials.',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'courseFaq', lessonIndex: 0 } },
        activeTab: 'Course FAQ',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.courseFaq.data.faqs[0].qs[0].an).toBe(
          'Reliability protects instructor work and student-facing materials.',
        );
      },
    },
    {
      name: 'assignment title edit verifies flat assignment data',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'assignments',
              path: ['assignments', 0, 't'],
              value: 'Verified reliability memo',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'assignments' } },
        activeTab: 'Assignment Briefs',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.assignments.data.assignments[0].t).toBe('Verified reliability memo');
      },
    },
    {
      name: 'study guide review question insertion verifies nested array mutation',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'studyGuides',
              path: ['studyGuides', 0, 'rq', 0],
              value: 'What evidence proves a safe edit?',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'studyGuides', lessonIndex: 0 } },
        activeTab: 'Study Guides',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.studyGuides.data.studyGuides[0].rq[0]).toBe(
          'What evidence proves a safe edit?',
        );
      },
    },
    {
      name: 'lesson plan homework edit verifies expanded key mutation',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'lessonPlans',
              path: ['lessonPlans', 0, 'hw'],
              value: 'Audit the receipt and identify one missing verifier.',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'lessonPlans', lessonIndex: 0 } },
        activeTab: 'Lesson Plans',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.lessonPlans.data.lessonPlans[0].homework).toBe(
          'Audit the receipt and identify one missing verifier.',
        );
      },
    },
    {
      name: 'custom deliverable edit verifies custom item data',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.custom_reflections = {
          status: 'done',
          data: { items: [{ title: 'Week 1 Reflection', prompt: 'Old reflection prompt' }] },
        };
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'custom_reflections',
              path: ['items', 0, 'prompt'],
              value: 'Reflect on one verified agent recovery.',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'custom_reflections' } },
        activeTab: 'Custom Reflections',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.custom_reflections.data.items[0].prompt).toBe(
          'Reflect on one verified agent recovery.',
        );
        expect(receiptMessage.receipt.status).toBe('done');
      },
    },
    {
      name: 'stale deliverable targeted edit preserves stale marker while changing content',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.quizBank.stale = true;
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              path: ['quizzes', 1, 'qs', 0, 'q'],
              value: 'What should stale-state recovery preserve?',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 1 } },
        activeTab: 'Quiz & Exam Bank',
      },
      assert: ({ harness }) => {
        expect(harness.state.deliverables.quizBank.stale).toBe(true);
        expect(harness.state.deliverables.quizBank.data.quizzes[1].qs[0].q).toBe(
          'What should stale-state recovery preserve?',
        );
      },
    },
    {
      name: 'failed generation state blocks FAQ edit without mutation',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.courseFaq = { status: 'error', error: 'quota', data: null };
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'courseFaq',
              path: ['faqs', 0, 'qs', 0, 'an'],
              value: 'Ghost answer',
            },
          ],
        },
        activeTab: 'Course FAQ',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0].reason).toContain('not generated yet');
      },
    },
    {
      name: 'partial mixed deliverable batch adds assignment and blocks malformed quiz',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            { type: 'addItem', featureId: 'assignments', item: { t: 'Recovery worksheet', ov: 'Trace a failure.' } },
            { type: 'addItem', featureId: 'quizBank', lessonIndex: 2, item: { ty: 'short_answer' } },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'assignments' } },
        activeTab: 'Assignment Briefs',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.assignments.data.assignments.at(-1).t).toBe('Recovery worksheet');
        expect(receiptMessage.receipt.status).toBe('review');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['changed', 'failed']);
      },
    },
    {
      name: 'large fourteen-lesson objective batch verifies the final lesson and caps receipt rows',
      makeHarness: () => createHarness({ courseMap: fourteenLessonCourseMap(), deliverables: {} }),
      scenario: {
        toolName: 'edit_course_map',
        args: {
          patches: Array.from({ length: 14 }, (_, index) => ({
            lessonIndex: index,
            field: 'lo',
            value: `Verified objective ${index + 1}`,
          })),
        },
        verifier: { toolName: 'read_lesson', args: { lessonIndex: 13 }, targets: ['Course Map'] },
        activeTab: 'Course Map',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.courseMap.lessons[13].sections[0].learningObjectives).toBe('Verified objective 14');
        expect(receiptMessage.receipt.status).toBe('done');
        expect(receiptMessage.receipt.stateDiffs).toHaveLength(8);
        expect(receiptMessage.receipt.runStats.stateDiffCount).toBe(8);
      },
    },
    {
      name: 'cross-deliverable batch edits quiz and study guide then validates the course',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              path: ['quizzes', 1, 'qs', 0, 'q'],
              value: 'How does validation protect state?',
            },
            {
              type: 'editItem',
              featureId: 'studyGuides',
              path: ['studyGuides', 1, 'kt', 0, 'df'],
              value: 'A guard that protects workspace state before a tool mutates it.',
            },
          ],
        },
        verifier: { toolName: 'validate_course', args: {}, targets: ['Package'] },
        activeTab: 'Quiz & Exam Bank',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.quizBank.data.quizzes[1].qs[0].q).toBe(
          'How does validation protect state?',
        );
        expect(harness.state.deliverables.studyGuides.data.studyGuides[1].kt[0].df).toContain('protects workspace');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['changed', 'changed']);
        expect(receiptMessage.receipt.verification.status).toBe('verified');
      },
    },
    {
      name: 'regeneration plus local wording edit records pending and changed rows',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            { type: 'regenerateLesson', featureId: 'lessonPlans', lessonIndex: 1 },
            {
              type: 'editItem',
              featureId: 'lessonPlans',
              path: ['lessonPlans', 1, 'ob'],
              value: 'Use tools safely after reviewing the pending regeneration.',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'lessonPlans', lessonIndex: 1 } },
        activeTab: 'Lesson Plans',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.regenerateCalls).toEqual([
          { featureId: 'lessonPlans', lessonIndex: 1, lessonTitle: 'Tool Use' },
        ]);
        expect(harness.state.deliverables.lessonPlans.data.lessonPlans[1].ob).toContain('pending regeneration');
        expect(receiptMessage.receipt.stateDiffs.map((diff) => diff.status)).toEqual(['pending', 'changed']);
        expect(receiptMessage.receipt.verification.status).toBe('verified');
      },
    },
    {
      name: 'missing custom deliverable refuses a ghost custom artifact mutation',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'custom_reflections',
              path: ['items', 0, 'prompt'],
              value: 'Ghost custom prompt',
            },
          ],
        },
        activeTab: 'Custom Reflections',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'failed',
          featureId: 'custom_reflections',
        });
      },
    },
    {
      name: 'single-lesson course refuses destructive delete before mutation',
      makeHarness: () =>
        createHarness({
          courseMap: {
            courseName: 'Single Lesson',
            semester: 'Fall 2026',
            lessons: [{ title: 'Only Lesson', sections: [{ topicSection: 'Keep this lesson' }] }],
          },
          deliverables: {},
        }),
      scenario: {
        toolName: 'edit_course_map',
        args: { patches: [{ action: 'removeLesson', lessonIndex: 0 }] },
        activeTab: 'Course Map',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0].reason).toContain('only lesson');
      },
    },
    {
      name: 'slide title and notes batch verifies both local-only presentation edits',
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'slideDecks',
              path: ['decks', 0, 'slides', 0, 'title'],
              value: 'Reliability Evidence',
              syncPolicy: 'localOnly',
            },
            {
              type: 'editItem',
              featureId: 'slideDecks',
              path: ['decks', 0, 'slides', 0, 'notes'],
              value: 'Show before/after evidence from the receipt.',
              syncPolicy: 'localOnly',
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'slideDecks', lessonIndex: 0 } },
        activeTab: 'Slide Decks',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.slideDecks.data.decks[0].slides[0]).toMatchObject({
          title: 'Reliability Evidence',
          notes: 'Show before/after evidence from the receipt.',
        });
        expect(receiptMessage.receipt.status).toBe('done');
        expect(receiptMessage.receipt.stateDiffs).toHaveLength(2);
      },
    },
    {
      name: 'custom deliverable sub-array addition verifies generated custom data',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.custom_reflections = {
          status: 'done',
          data: { items: [{ title: 'Week 1 Reflection', prompt: 'Name one safe tool behavior.' }] },
        };
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [
            {
              type: 'addItem',
              featureId: 'custom_reflections',
              lessonIndex: 0,
              subKey: 'responses',
              item: { text: 'Require a verifier before reporting success.' },
            },
          ],
        },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'custom_reflections' } },
        activeTab: 'Custom Reflections',
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.custom_reflections.data.items[0].responses[0].text).toBe(
          'Require a verifier before reporting success.',
        );
        expect(receiptMessage.receipt.status).toBe('done');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'changed',
          featureId: 'custom_reflections',
        });
      },
    },
    {
      name: 'custom deliverable remove without sub-array refuses unsafe removal',
      makeHarness: () => {
        const deliverables = baseDeliverables();
        deliverables.custom_reflections = {
          status: 'done',
          data: { items: [{ title: 'Week 1 Reflection', prompt: 'Do not remove root item blindly.' }] },
        };
        return createHarness({ deliverables });
      },
      scenario: {
        toolName: 'edit_deliverables',
        args: {
          actions: [{ type: 'removeItem', featureId: 'custom_reflections', lessonIndex: 0, itemIndex: 0 }],
        },
        activeTab: 'Custom Reflections',
      },
      assert: ({ beforeHash, afterHash, receiptMessage }) => {
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'failed',
          reason: expect.stringContaining('Cannot remove'),
        });
      },
    },
    {
      name: 'planned broad deliverable batch inspects workspace before multi-feature mutation',
      scenario: {
        toolName: 'edit_deliverables',
        preludeSteps: [{ toolName: 'inspect_workspace', args: {}, targets: ['Workspace'] }],
        args: {
          actions: [
            {
              type: 'editItem',
              featureId: 'quizBank',
              path: ['quizzes', 0, 'qs', 0, 'q'],
              value: 'What proves broad edits were planned?',
            },
            {
              type: 'editItem',
              featureId: 'courseFaq',
              path: ['faqs', 0, 'qs', 0, 'an'],
              value: 'Planning evidence plus verification protects broad edits.',
            },
          ],
        },
        verifier: { toolName: 'validate_course', args: {}, targets: ['Package'] },
        activeTab: 'Workspace',
        qualityExpectations: { intent: 'content_edit', requiresPlan: true },
      },
      assert: ({ harness, receiptMessage }) => {
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs[0].q).toBe(
          'What proves broad edits were planned?',
        );
        expect(harness.state.deliverables.courseFaq.data.faqs[0].qs[0].an).toContain('Planning evidence');
        expect(receiptMessage.receipt.planning.status).toBe('planned');
        expect(receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
  ];

  it.each(advancedClosedLoopCases)('$name', ({ makeHarness, scenario, assert }) => {
    const harness = makeHarness ? makeHarness() : createHarness();
    const beforeHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });
    const outcome = runClosedLoopScenario(harness, scenario);
    const afterHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });

    expect(outcome.receiptMessage?.role).toBe('agentReceipt');
    expect(outcome.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(scenario.minimumQualityScore || 75);
    assert({ harness, beforeHash, afterHash, ...outcome });
  });

  const multiTurnCases = [
    {
      name: 'user changes their mind after a verified lesson rename',
      run: () => {
        const harness = createHarness();
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_course_map',
          args: { patches: [{ lessonIndex: 1, field: 'title', value: 'Draft Tool Lab' }] },
          verifier: { toolName: 'read_lesson', args: { lessonIndex: 1 }, targets: ['Course Map'] },
          activeTab: 'Course Map',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_course_map',
          args: { patches: [{ lessonIndex: 1, field: 'title', value: 'Final Tool Lab' }] },
          verifier: { toolName: 'read_lesson', args: { lessonIndex: 1 }, targets: ['Course Map'] },
          activeTab: 'Course Map',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          before: 'Draft Tool Lab',
          after: 'Final Tool Lab',
        });
        expect(harness.state.courseMap.lessons[1].title).toBe('Final Tool Lab');
      },
    },
    {
      name: 'safe FAQ edit persists after a later invalid duplicate quiz request',
      run: () => {
        const harness = createHarness();
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'courseFaq',
                path: ['faqs', 0, 'qs', 0, 'an'],
                value: 'Reliability keeps instructor work inspectable.',
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'courseFaq', lessonIndex: 0 } },
          activeTab: 'Course FAQ',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [{ type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: 'What is reliability?' } }],
          },
          activeTab: 'Quiz & Exam Bank',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.status).toBe('blocked');
        expect(harness.state.deliverables.courseFaq.data.faqs[0].qs[0].an).toBe(
          'Reliability keeps instructor work inspectable.',
        );
      },
    },
    {
      name: 'queued blueprint sync can be followed by a local-only wording edit',
      run: () => {
        const harness = createHarness({
          projectDeliverableActionToCanonicalPatch: (action) =>
            action.syncPolicy === 'localOnly'
              ? null
              : {
                  patch: {
                    field: 'learningObjectives',
                    label: 'learning objectives',
                    lessonIndex: 0,
                    value: 'Analyze verifier evidence.',
                  },
                },
        });
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'lessonPlans',
                lessonIndex: 0,
                path: ['lessonPlans', 0, 'ob'],
                value: 'Analyze verifier evidence.',
              },
            ],
          },
          activeTab: 'Lesson Plans',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'lessonPlans',
                path: ['lessonPlans', 0, 'ob'],
                value: 'Use verified wording locally.',
                syncPolicy: 'localOnly',
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'lessonPlans', lessonIndex: 0 } },
          activeTab: 'Lesson Plans',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.stateDiffs[0].status).toBe('pending');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(harness.state.deliverables.lessonPlans.data.lessonPlans[0].ob).toBe('Use verified wording locally.');
      },
    },
    {
      name: 'new lesson can be edited in the next turn and verified',
      run: () => {
        const harness = createHarness();
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_course_map',
          args: {
            patches: [{ action: 'addLesson', title: 'Workshop', sections: [{ learningObjectives: 'Draft' }] }],
          },
          verifier: { toolName: 'read_lesson', args: { lessonIndex: 3 }, targets: ['Course Map'] },
          activeTab: 'Course Map',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_course_map',
          args: { patches: [{ lessonIndex: 3, field: 'lo', value: 'Build a verified recovery plan.' }] },
          verifier: { toolName: 'read_lesson', args: { lessonIndex: 3 }, targets: ['Course Map'] },
          activeTab: 'Course Map',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(harness.state.courseMap.lessons[3].sections[0].learningObjectives).toBe(
          'Build a verified recovery plan.',
        );
      },
    },
    {
      name: 'partial failure can be recovered by retrying only the failed rubric action',
      run: () => {
        const harness = createHarness();
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'quizBank',
                path: ['quizzes', 2, 'qs', 0, 'q'],
                value: 'What should recovery preserve?',
              },
              {
                type: 'addItem',
                featureId: 'rubrics',
                lessonIndex: 99,
                item: { cn: 'Impossible', ex: 'No', pr: 'No' },
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 2 } },
          activeTab: 'Quiz & Exam Bank',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'addItem',
                featureId: 'rubrics',
                lessonIndex: 2,
                item: { cn: 'Recovery evidence', ex: 'Verifies final state', pr: 'Mentions final state' },
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'rubrics', lessonIndex: 2 } },
          activeTab: 'Rubrics',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('review');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(harness.state.deliverables.rubrics.data.rubrics[2].cr.at(-1).cn).toBe('Recovery evidence');
      },
    },
    {
      name: 'user revises a verified quiz edit in a later turn',
      run: () => {
        const harness = createHarness();
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'quizBank',
                path: ['quizzes', 1, 'qs', 0, 'q'],
                value: 'Draft validation question?',
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 1 } },
          activeTab: 'Quiz & Exam Bank',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'quizBank',
                path: ['quizzes', 1, 'qs', 0, 'q'],
                value: 'What should validation prevent before mutation?',
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 1 } },
          activeTab: 'Quiz & Exam Bank',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          before: 'Draft validation question?',
          after: 'What should validation prevent before mutation?',
        });
        expect(harness.state.deliverables.quizBank.data.quizzes[1].qs[0].q).toBe(
          'What should validation prevent before mutation?',
        );
      },
    },
    {
      name: 'blocked missing assignment request succeeds after the deliverable exists',
      run: () => {
        const deliverables = baseDeliverables();
        delete deliverables.assignments;
        const harness = createHarness({ deliverables });
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: { actions: [{ type: 'addItem', featureId: 'assignments', item: { t: 'Blocked draft' } }] },
          activeTab: 'Assignment Briefs',
        });
        harness.state.deliverables.assignments = { status: 'done', data: { assignments: [] } };
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'addItem',
                featureId: 'assignments',
                item: { t: 'Verified assignment', ov: 'Trace a planner-executor-verifier loop.' },
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'assignments' } },
          activeTab: 'Assignment Briefs',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('blocked');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(harness.state.deliverables.assignments.data.assignments[0].t).toBe('Verified assignment');
      },
    },
    {
      name: 'stale quiz wording can be fixed and then audited without clearing stale state',
      run: () => {
        const deliverables = baseDeliverables();
        deliverables.quizBank.stale = true;
        const harness = createHarness({ deliverables });
        const first = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'quizBank',
                path: ['quizzes', 2, 'qs', 0, 'q'],
                value: 'What should stale content recovery preserve?',
              },
            ],
          },
          verifier: { toolName: 'read_deliverable', args: { featureId: 'quizBank', lessonIndex: 2 } },
          activeTab: 'Quiz & Exam Bank',
        });
        const second = runClosedLoopScenario(harness, {
          toolName: 'edit_deliverables',
          args: {
            actions: [
              {
                type: 'editItem',
                featureId: 'studyGuides',
                path: ['studyGuides', 2, 'rq', 0],
                value: 'How would you verify a stale-content repair?',
              },
            ],
          },
          verifier: { toolName: 'validate_course', args: {}, targets: ['Package'] },
          activeTab: 'Study Guides',
        });
        return { harness, first, second };
      },
      assert: ({ harness, first, second }) => {
        expect(first.receiptMessage.receipt.status).toBe('done');
        expect(second.receiptMessage.receipt.status).toBe('done');
        expect(harness.state.deliverables.quizBank.stale).toBe(true);
        expect(harness.state.deliverables.studyGuides.data.studyGuides[2].rq[0]).toContain('stale-content');
      },
    },
  ];

  it.each(multiTurnCases)('$name', ({ run, assert }) => {
    const outcome = run();
    expect(outcome.first.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(75);
    expect(outcome.second.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(75);
    assert(outcome);
  });

  const asyncPackageClosedLoopCases = [
    {
      name: 'package repair fixes quiz scoring metadata and receipts the repaired feature',
      makeHarness: () => createHarness({ deliverables: repairableQuizDeliverables(), selectedFeatures: ['quizBank'] }),
      scenario: {
        toolName: 'repair_package_readiness',
        args: {},
        verifier: { toolName: 'review_package_readiness', args: {}, targets: ['Package'] },
        activeTab: 'Package',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.applied).toBe(1);
        expect(harness.state.snapshots).toHaveLength(1);
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'changed',
          action: 'repair_package_readiness',
          target: 'Quiz & Exam Bank',
          featureId: 'quizBank',
        });
      },
    },
    {
      name: 'package repair updates only the dirty discussion artifact evidence',
      makeHarness: () =>
        createHarness({
          deliverables: repairableDiscussionDeliverables(),
          selectedFeatures: ['discussions'],
        }),
      scenario: {
        toolName: 'repair_package_readiness',
        args: {},
        verifier: { toolName: 'review_package_readiness', args: {}, targets: ['Package'] },
        activeTab: 'Package',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.applied).toBe(1);
        expect(harness.state.deliverables.discussions.data.discussions[0].sourceArtifacts[0].title).toBe(
          'Foundations Evidence Packet 1',
        );
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          target: 'Discussion Prompts',
          after: expect.stringContaining('normalized discussion guidance'),
        });
      },
    },
    {
      name: 'planned package repair inspects workspace before mutating readiness metadata',
      makeHarness: () => createHarness({ deliverables: repairableQuizDeliverables(), selectedFeatures: ['quizBank'] }),
      scenario: {
        toolName: 'repair_package_readiness',
        args: {},
        preludeSteps: [{ toolName: 'inspect_workspace', args: {}, targets: ['Workspace'] }],
        verifier: { toolName: 'review_package_readiness', args: {}, targets: ['Package'] },
        activeTab: 'Package',
        qualityExpectations: { intent: 'package_repair', requiresPlan: true },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.applied).toBe(1);
        expect(receiptMessage.receipt.planning).toMatchObject({
          required: true,
          status: 'planned',
          plannerTools: ['Inspect workspace'],
        });
        expect(receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'package repair no-op verifies without inventing a state diff',
      makeHarness: () =>
        createHarness({
          deliverables: { assignments: baseDeliverables().assignments },
          selectedFeatures: ['courseMap'],
        }),
      scenario: {
        toolName: 'repair_package_readiness',
        args: {},
        verifier: { toolName: 'review_package_readiness', args: {}, targets: ['Package'] },
        activeTab: 'Package',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.applied).toBe(0);
        expect(receiptMessage.receipt.stateDiffs).toEqual([]);
        expect(receiptMessage.receipt.verification.status).toBe('verified');
      },
    },
    {
      name: 'package repair refuses to mutate when updater is unavailable',
      makeHarness: () =>
        createHarness({
          deliverables: repairableQuizDeliverables(),
          selectedFeatures: ['quizBank'],
          optimisticUpdate: null,
        }),
      scenario: {
        toolName: 'repair_package_readiness',
        args: {},
        activeTab: 'Package',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.error).toContain('Deliverable update API is not available');
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
    {
      name: 'finalize package applies safe quiz repair and self-verifies receipt evidence',
      makeHarness: () => createHarness({ deliverables: repairableQuizDeliverables(), selectedFeatures: ['quizBank'] }),
      scenario: {
        toolName: 'finalize_package',
        args: {},
        activeTab: 'Package',
        qualityExpectations: { intent: 'finish_package' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.repairsApplied).toBe(1);
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
        expect(receiptMessage.receipt.verification.status).toBe('verified');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          action: 'finalize_package',
          target: 'Quiz & Exam Bank',
        });
      },
    },
    {
      name: 'planned finalize package inspects workspace before safe repair and export verification',
      makeHarness: () => createHarness({ deliverables: repairableQuizDeliverables(), selectedFeatures: ['quizBank'] }),
      scenario: {
        toolName: 'finalize_package',
        args: {},
        preludeSteps: [{ toolName: 'inspect_workspace', args: {}, targets: ['Workspace'] }],
        activeTab: 'Package',
        qualityExpectations: { intent: 'finish_package', requiresPlan: true },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.repairsApplied).toBe(1);
        expect(harness.state.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
        expect(receiptMessage.receipt.planning.status).toBe('planned');
        expect(receiptMessage.receipt.verification.status).toBe('verified');
      },
    },
    {
      name: 'finalize package blocks when safe repair mutation API is unavailable',
      makeHarness: () =>
        createHarness({
          deliverables: repairableQuizDeliverables(),
          selectedFeatures: ['quizBank'],
          optimisticUpdate: null,
        }),
      scenario: {
        toolName: 'finalize_package',
        args: {},
        activeTab: 'Package',
        qualityExpectations: { intent: 'finish_package' },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.error).toContain('Deliverable update API is not available');
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
    {
      name: 'localized weak slide deck retry starts regeneration and receipts pending work',
      makeHarness: () =>
        createHarness({
          deliverables: weakSlideDeckDeliverables(),
          selectedFeatures: ['slideDecks'],
        }),
      scenario: {
        toolName: 'retry_package_weak_spots',
        args: { maxActions: 2 },
        verifier: { toolName: 'read_deliverable', args: { featureId: 'slideDecks', lessonIndex: 0 } },
        activeTab: 'Slide Decks',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.started).toBe(1);
        expect(harness.state.regenerateCalls).toEqual([
          { featureId: 'slideDecks', lessonIndex: 0, lessonTitle: 'Foundations' },
        ]);
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          status: 'pending',
          action: 'regenerateLesson',
          target: 'Slide Decks',
          lessonIndex: 0,
        });
      },
    },
    {
      name: 'planned weak-spot retry inspects workspace before starting localized regeneration',
      makeHarness: () =>
        createHarness({
          deliverables: weakSlideDeckDeliverables(),
          selectedFeatures: ['slideDecks'],
        }),
      scenario: {
        toolName: 'retry_package_weak_spots',
        args: { maxActions: 1 },
        preludeSteps: [{ toolName: 'inspect_workspace', args: {}, targets: ['Workspace'] }],
        verifier: { toolName: 'read_deliverable', args: { featureId: 'slideDecks', lessonIndex: 0 } },
        activeTab: 'Slide Decks',
        qualityExpectations: { intent: 'package_repair', requiresPlan: true },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.started).toBe(1);
        expect(harness.state.regenerateCalls).toHaveLength(1);
        expect(receiptMessage.receipt.planning.status).toBe('planned');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({ status: 'pending' });
      },
    },
    {
      name: 'retry package weak spots rejects invalid maxActions before regeneration',
      makeHarness: () =>
        createHarness({
          deliverables: weakSlideDeckDeliverables(),
          selectedFeatures: ['slideDecks'],
        }),
      scenario: {
        toolName: 'retry_package_weak_spots',
        args: { maxActions: 9 },
        activeTab: 'Slide Decks',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.error).toContain('Invalid maxActions');
        expect(harness.state.regenerateCalls).toEqual([]);
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
    {
      name: 'retry package weak spots blocks when executeAction is unavailable',
      makeHarness: () =>
        createHarness({
          deliverables: weakSlideDeckDeliverables(),
          selectedFeatures: ['slideDecks'],
          executeAction: null,
        }),
      scenario: {
        toolName: 'retry_package_weak_spots',
        args: { maxActions: 2 },
        activeTab: 'Slide Decks',
        qualityExpectations: { intent: 'package_repair' },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.error).toContain('Deliverable action API is not available');
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
    {
      name: 'undo restores prior deliverable state and receipts the snapshot restore',
      makeHarness: () => {
        let harness;
        const undoFn = () => {
          harness.state.deliverables.lessonPlans.data.lessonPlans[0].ob = 'Restored objective';
        };
        harness = createHarness({ undoFn, activeTab: 'lessonPlans' });
        return harness;
      },
      scenario: {
        toolName: 'undo_last',
        args: {},
        activeTab: 'Lesson Plans',
        qualityExpectations: { intent: 'content_edit' },
      },
      assert: ({ harness, result, receiptMessage }) => {
        expect(result.success).toBe(true);
        expect(harness.state.deliverables.lessonPlans.data.lessonPlans[0].ob).toBe('Restored objective');
        expect(receiptMessage.receipt.stateDiffs[0]).toMatchObject({
          action: 'undo_last',
          target: 'Lesson Plans',
          before: 'Latest deliverable state',
        });
      },
    },
    {
      name: 'undo without a snapshot reports blocked recovery instead of pretending success',
      scenario: {
        toolName: 'undo_last',
        args: {},
        activeTab: 'Lesson Plans',
        qualityExpectations: { intent: 'content_edit' },
      },
      assert: ({ result, receiptMessage }) => {
        expect(result.error).toContain('Undo not available');
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
    {
      name: 'run_tool blocks mutation-capable delegation without validation hook',
      makeHarness: () =>
        createHarness({
          customTools: {
            registry: { get: () => null },
            invokeBuiltin: async () => ({ applied: 1, failed: 0 }),
          },
        }),
      scenario: {
        toolName: 'run_tool',
        args: {
          name: 'edit_course_map',
          args: { patches: [{ lessonIndex: 0, field: 'title', value: 'Macro Bypass' }] },
        },
        activeTab: 'Agent tools',
        qualityExpectations: { intent: 'agent_tooling' },
      },
      assert: ({ beforeHash, afterHash, result, receiptMessage }) => {
        expect(result.error).toContain('Mutation-capable tool "edit_course_map"');
        expect(afterHash).toBe(beforeHash);
        expect(receiptMessage.receipt.status).toBe('blocked');
      },
    },
  ];

  it.each(asyncPackageClosedLoopCases)('$name', async ({ makeHarness, scenario, assert }) => {
    const harness = makeHarness ? makeHarness() : createHarness();
    const beforeHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });
    const outcome = await runAsyncClosedLoopScenario(harness, scenario);
    const afterHash = hash({ courseMap: harness.state.courseMap, deliverables: harness.state.deliverables });

    expect(outcome.receiptMessage?.role).toBe('agentReceipt');
    expect(outcome.receiptMessage.receipt.quality).toBeTruthy();
    expect(outcome.receiptMessage.receipt.quality.score).toBeGreaterThanOrEqual(
      outcome.receiptMessage.receipt.status === 'blocked' ? 60 : 75,
    );
    assert({ harness, beforeHash, afterHash, ...outcome });
  });

  const receiptOnlyRecoveryCases = [
    {
      name: 'broad rewrite confirmation request scores as useful response',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'edit_course_map',
            label: 'Edit course map',
            status: 'error',
            summary: 'This looks like a broad course-map rewrite. Please confirm before I apply it.',
            targets: ['Course Map'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'This is a broad rewrite. Should I apply it to all lessons?' },
        qualityExpectations: { intent: 'content_edit', shouldAsk: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(
          receipt.quality.dimensions.find((dimension) => dimension.id === 'response').score,
        ).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'destructive delete confirmation request is blocked with recovery next step',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'error',
            summary: 'This deliverable change can remove existing content. Please confirm before I apply it.',
            targets: ['Assignment Briefs'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Removing this assignment is destructive. Please confirm before I delete it.' },
        qualityExpectations: { intent: 'content_edit', shouldAsk: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.next).toContain('issue');
      },
    },
    {
      name: 'ambiguous target asks instead of guessing a mutation',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'error',
            summary: 'The deliverable target is ambiguous. Please confirm before I apply it.',
            targets: ['Workspace'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Which lesson and deliverable should I edit?' },
        qualityExpectations: { intent: 'content_edit', shouldAsk: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'provider failure receipt exposes research recovery path',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'search_research',
            label: 'Search research',
            status: 'error',
            summary: 'Provider request failed',
            targets: ['Research'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'The research provider failed. Try a smaller query or retry search later.' },
        qualityExpectations: { intent: 'research', responseIncludes: ['provider failed', 'retry'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.intent.type).toBe('research');
      },
    },
    {
      name: 'read-only workspace plan scores without workspace mutation',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'inspect_workspace',
            label: 'Inspect workspace',
            status: 'done',
            summary: 'Found stale slide decks',
            targets: ['Workspace'],
          },
          {
            tool: 'plan_workspace_next_step',
            label: 'Plan next step',
            status: 'done',
            summary: 'Sync stale slide deck after confirming scope',
            targets: ['Workspace'],
          },
        ],
      },
      options: {
        dryRun: true,
        activeTab: 'slideDecks',
        finalResponse: { chatReply: 'The next step is to confirm the stale slide deck scope before editing.' },
        qualityExpectations: { intent: 'workspace_plan', status: 'done', responseIncludes: ['next step'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.runStats.readOnly).toBe(true);
        expect(receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'missing verifier receipt keeps quality score below excellent',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'edit_course_map',
            label: 'Edit course map',
            status: 'done',
            summary: '1 applied',
            targets: ['Course Map'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Renamed the lesson.' },
        qualityExpectations: { intent: 'content_edit', requiresVerification: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('review');
        expect(receipt.quality.score).toBeLessThan(85);
        expect(receipt.quality.dimensions.find((dimension) => dimension.id === 'verification').status).toBe('fail');
      },
    },
    {
      name: 'macro mutation delegation block tells user why validation is required',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'run_tool',
            label: 'Run custom tool',
            status: 'error',
            summary: 'Mutation-capable tool "edit_course_map" cannot run through run_tool without a validation hook.',
            targets: ['Agent tools'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'That macro can edit the course map, so I need the normal safety validation before running it.',
        },
        qualityExpectations: { intent: 'agent_tooling', responseIncludes: ['safety validation'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.intent.type).toBe('agent_tooling');
      },
    },
    {
      name: 'macro confirmation refusal surfaces the blocked step instead of hiding inside run_tool',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'run_tool',
            label: 'Run custom tool',
            status: 'error',
            summary: 'step "edit" (edit_course_map) failed: This looks like a broad course-map rewrite.',
            targets: ['Course Map'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'This macro would rewrite broad course-map content. Please confirm before I run it.',
        },
        qualityExpectations: { intent: 'agent_tooling', shouldAsk: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.issues[0]).toContain('edit_course_map');
      },
    },
    {
      name: 'undo failure receipt recommends recovery without claiming a restore',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'undo_last',
            label: 'Undo last change',
            status: 'error',
            summary: 'Undo not available in this context.',
            targets: ['Lesson Plans'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'There is no undo snapshot available, so I did not change the workspace.' },
        qualityExpectations: { intent: 'content_edit', responseIncludes: ['no undo snapshot'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.stateDiffs).toEqual([]);
      },
    },
    {
      name: 'package repair updater failure points to runtime wiring instead of content edits',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'repair_package_readiness',
            label: 'Repair package readiness',
            status: 'error',
            summary: 'Deliverable update API is not available in this workspace.',
            targets: ['Package'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Package repairs could not run because the deliverable updater is unavailable.' },
        qualityExpectations: { intent: 'package_repair', responseIncludes: ['updater is unavailable'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.intent.type).toBe('package_repair');
      },
    },
    {
      name: 'finish-package export failure keeps download confidence blocked',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'finalize_package',
            label: 'Finish package',
            status: 'error',
            summary: 'Export verification failed for Slide Decks.',
            targets: ['Package'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'The package is not ready to download because Slide Deck export verification failed.',
        },
        qualityExpectations: { intent: 'finish_package', responseIncludes: ['not ready to download'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.next).toContain('package issue');
      },
    },
    {
      name: 'expired provider key failure tells loaded-project user to reconfigure model settings',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'search_research',
            label: 'Search research',
            status: 'error',
            summary: 'No API key configured for this provider.',
            targets: ['Research'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply:
            'The API key is missing or expired. Use the model settings in the workspace to change the key or model.',
        },
        qualityExpectations: { intent: 'research', responseIncludes: ['change the key', 'model'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.intent.type).toBe('research');
      },
    },
    {
      name: 'provider rate limit failure suggests a smaller retry path',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'search_research',
            label: 'Search research',
            status: 'error',
            summary: '429 rate limit from provider.',
            targets: ['Research'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'The provider rate-limited the request. Retry with a smaller query or wait and retry.',
        },
        qualityExpectations: { intent: 'research', responseIncludes: ['rate-limited', 'retry'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.quality.dimensions.find((dimension) => dimension.id === 'recovery').status).toBe('pass');
      },
    },
    {
      name: 'provider failure without recovery wording does not score as excellent',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'search_research',
            label: 'Search research',
            status: 'error',
            summary: 'Provider request failed',
            targets: ['Research'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'The provider failed.' },
        qualityExpectations: { intent: 'research', responseIncludes: ['retry'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.quality.score).toBeLessThan(90);
      },
    },
    {
      name: 'root overwrite confirmation blocks a deliverable replacement',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'error',
            summary: 'Root-level overwrite requires confirmation.',
            targets: ['Quiz & Exam Bank'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'Replacing the whole quiz bank could overwrite existing work. Please confirm first.',
        },
        qualityExpectations: { intent: 'content_edit', shouldAsk: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.quality.score).toBeGreaterThanOrEqual(85);
      },
    },
    {
      name: 'missing deliverable refusal explains no ghost artifact will be created',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'edit_deliverables',
            label: 'Edit deliverables',
            status: 'error',
            summary: 'Assignment Briefs is not generated and ready, so I will not create a ghost artifact.',
            targets: ['Assignment Briefs'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Assignment Briefs do not exist yet, so I will not create a ghost assignment.' },
        qualityExpectations: { intent: 'content_edit', responseIncludes: ['do not exist', 'ghost'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.issues[0]).toContain('ghost artifact');
      },
    },
    {
      name: 'invalid retry-package args are blocked before any package mutation receipt',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'retry_package_weak_spots',
            label: 'Retry weak sections',
            status: 'error',
            summary: 'Invalid maxActions - expected an integer from 1 to 8.',
            targets: ['Package'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'I did not retry weak sections because maxActions must be 1 to 8.' },
        qualityExpectations: { intent: 'package_repair', responseIncludes: ['did not retry'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.stateDiffs).toEqual([]);
      },
    },
    {
      name: 'slide image generation receipt verifies generated image attachment',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'generate_slide_images',
            label: 'Generate slide images',
            status: 'done',
            summary: '1 generated, 0 failed',
            targets: ['Slide Decks'],
            stateDiffs: [
              {
                status: 'changed',
                action: 'generateImage',
                target: 'Slide Decks',
                featureId: 'slideDecks',
                lessonIndex: 0,
                before: 'Image-ready slide',
                after: 'Generated image for slide 1',
              },
            ],
          },
          {
            tool: 'verify_slide_images',
            label: 'Verify slide images',
            status: 'done',
            summary: '1 generated image, 0 missing',
            targets: ['Slide Decks'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Generated one slide image and verified the image attachment.' },
        qualityExpectations: { intent: 'content_edit', requiresVerification: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.verification.status).toBe('verified');
        expect(receipt.stateDiffs[0]).toMatchObject({ action: 'generateImage', target: 'Slide Decks' });
        expect(receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'slide image generation without OpenAI key tells loaded-project user how to recover',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'generate_slide_images',
            label: 'Generate slide images',
            status: 'error',
            summary: 'No OpenAI API key configured.',
            targets: ['Slide Decks'],
          },
        ],
      },
      options: {
        finalResponse: {
          chatReply: 'Slide image generation needs an OpenAI key. Change the key or model in workspace settings.',
        },
        qualityExpectations: { intent: 'content_edit', responseIncludes: ['change the key', 'model'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.stateDiffs).toEqual([]);
        expect(receipt.quality.dimensions.find((dimension) => dimension.id === 'response').status).toBe('pass');
      },
    },
    {
      name: 'save preference receipt mutates agent state without demanding workspace state diff',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'save_preference',
            label: 'Save preference',
            status: 'done',
            summary: 'Saved teaching_style',
            targets: ['Agent memory'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Saved the teaching style preference for future Agent turns.' },
        qualityExpectations: { intent: 'agent_memory', responseIncludes: ['Saved'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.runStats).toMatchObject({
          mutatesWorkspace: false,
          mutatesAgentState: true,
          verificationStatus: 'not_required',
          stateDiffCount: 0,
        });
        expect(receipt.quality.dimensions.find((dimension) => dimension.id === 'safety')).toMatchObject({
          status: 'pass',
        });
      },
    },
    {
      name: 'remember receipt stores agent memory without workspace verification requirement',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'remember',
            label: 'Remember',
            status: 'done',
            summary: 'Remembered assessment preference',
            targets: ['Agent memory'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'Remembered the assessment preference for future course edits.' },
        qualityExpectations: { intent: 'agent_memory', responseIncludes: ['Remembered'] },
      },
      assert: (receipt) => {
        expect(receipt.intent.type).toBe('agent_memory');
        expect(receipt.runStats.mutatesWorkspace).toBe(false);
        expect(receipt.runStats.mutatesAgentState).toBe(true);
        expect(receipt.verification.status).toBe('not_required');
        expect(receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'forget failure reports blocked memory recovery without claiming deletion',
      progress: {
        status: 'error',
        steps: [
          {
            tool: 'forget',
            label: 'Forget',
            status: 'error',
            summary: 'Memory not found',
            targets: ['Agent memory'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'That memory was not found, so no saved preference was deleted.' },
        qualityExpectations: { intent: 'agent_memory', responseIncludes: ['not found'] },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('blocked');
        expect(receipt.intent.type).toBe('agent_memory');
        expect(receipt.stateDiffs).toEqual([]);
        expect(receipt.issues[0]).toContain('Memory not found');
      },
    },
    {
      name: 'package repair receipt with verifier scores as a complete package-repair loop',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'repair_package_readiness',
            label: 'Repair package readiness',
            status: 'done',
            summary: '1 repaired, 0 failed',
            targets: ['Package'],
            stateDiffs: [
              {
                status: 'changed',
                action: 'repair_package_readiness',
                target: 'Quiz & Exam Bank',
                featureId: 'quizBank',
                before: 'Generated deliverable state',
                after: 'added scoring metadata',
              },
            ],
          },
          {
            tool: 'review_package_readiness',
            label: 'Review package readiness',
            status: 'done',
            summary: '0 blockers, 0 warnings',
            targets: ['Package'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'I repaired the quiz metadata and verified package readiness after the change.' },
        qualityExpectations: { intent: 'package_repair', requiresVerification: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.intent.type).toBe('package_repair');
        expect(receipt.verification.status).toBe('verified');
        expect(receipt.runStats.stateDiffCount).toBe(1);
        expect(receipt.quality.score).toBeGreaterThanOrEqual(90);
      },
    },
    {
      name: 'package retry receipt with readback verifier scores as recovered pending work',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'retry_package_weak_spots',
            label: 'Retry weak sections',
            status: 'done',
            summary: '1 retries started, 1 pending',
            targets: ['Slide Decks'],
            stateDiffs: [
              {
                status: 'pending',
                action: 'regenerateLesson',
                target: 'Slide Decks',
                featureId: 'slideDecks',
                lessonIndex: 0,
                before: 'readiness issue',
                after: 'Regeneration started for slideDecks Lesson 1',
              },
            ],
          },
          {
            tool: 'read_deliverable',
            label: 'Read slide deck',
            status: 'done',
            summary: 'Verified existing generated slot',
            targets: ['Slide Decks'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'I started the localized slide retry and verified the current slide-deck slot.' },
        qualityExpectations: { intent: 'package_repair', requiresVerification: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.verification.status).toBe('verified');
        expect(receipt.stateDiffs[0]).toMatchObject({ status: 'pending', action: 'regenerateLesson' });
      },
    },
    {
      name: 'undo receipt with state diff and verifier is treated as a complete recovery loop',
      progress: {
        status: 'complete',
        steps: [
          {
            tool: 'undo_last',
            label: 'Undo last change',
            status: 'done',
            summary: 'Last deliverable edit undone.',
            targets: ['Lesson Plans'],
            stateDiffs: [
              {
                status: 'changed',
                action: 'undo_last',
                target: 'Lesson Plans',
                before: 'Latest deliverable state',
                after: 'Previous deliverable snapshot restored.',
              },
            ],
          },
          {
            tool: 'read_deliverable',
            label: 'Read lesson plans',
            status: 'done',
            summary: 'Verified restored lesson plans',
            targets: ['Lesson Plans'],
          },
        ],
      },
      options: {
        finalResponse: { chatReply: 'I restored the previous lesson-plan snapshot and verified it afterward.' },
        qualityExpectations: { intent: 'content_edit', requiresVerification: true },
      },
      assert: (receipt) => {
        expect(receipt.status).toBe('done');
        expect(receipt.stateDiffs[0]).toMatchObject({ action: 'undo_last' });
        expect(receipt.verification.status).toBe('verified');
      },
    },
  ];

  it.each(receiptOnlyRecoveryCases)('$name', ({ progress, options, assert }) => {
    const receiptMessage = buildModelAgentReceiptFromProgress(progress, options);
    expect(receiptMessage?.role).toBe('agentReceipt');
    expect(receiptMessage.receipt.quality).toBeTruthy();
    assert(receiptMessage.receipt);
  });

  it('bad model tool calls become blocked receipts instead of silent success', () => {
    const receiptMessage = buildModelAgentReceiptFromProgress({
      status: 'complete',
      steps: [
        {
          tool: 'invent_rubric_from_air',
          label: 'invent_rubric_from_air',
          status: 'error',
          summary: 'Unknown tool: invent_rubric_from_air',
          targets: ['Agent tools'],
        },
      ],
    });

    expect(receiptMessage.receipt).toMatchObject({
      status: 'blocked',
      issues: ['invent_rubric_from_air: Unknown tool: invent_rubric_from_air'],
      verification: expect.objectContaining({ status: 'not_required' }),
    });
  });

  it('provider-style tool failures become blocked receipts with the failed tool surfaced', () => {
    const receiptMessage = buildModelAgentReceiptFromProgress({
      status: 'error',
      steps: [
        {
          tool: 'search_research',
          label: 'Search research',
          status: 'error',
          summary: 'Provider request failed',
          targets: ['Research'],
        },
      ],
    });

    expect(receiptMessage.receipt).toMatchObject({
      status: 'blocked',
      title: 'Research needs attention',
      issues: ['Search research: Provider request failed'],
    });
  });

  it('pre-validates missing selected deliverables before execution can mutate state', () => {
    const deliverables = baseDeliverables();
    delete deliverables.rubrics;

    const validation = preValidateAction(
      { type: 'addItem', featureId: 'rubrics', lessonIndex: 0, item: { cn: 'Ghost' } },
      { courseMap: baseCourseMap(), deliverables },
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('rubrics');
  });
});
