import { describe, expect, it } from 'vitest';
import { AGENT_TOOLS } from '../src/lib/agentTools.js';
import { executeAction, preValidateAction } from '../src/lib/agentActions.js';

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
      selectedFeatures: ['courseMap', ...Object.keys(state.deliverables)],
      executeAction: (action, opts = {}) => executeAction(action, actionCtx(opts)),
      projectDeliverableActionToCanonicalPatch: () => null,
      snapshot: (featureId, data) => state.snapshots.push({ featureId, data: clone(data) }),
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
