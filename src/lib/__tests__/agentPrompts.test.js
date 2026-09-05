import { describe, it, expect, vi } from 'vitest';

// Mock syncDependencies before importing the module under test
vi.mock('../syncDependencies', () => ({
  getArrayKey: (featureId, data) => {
    const map = {
      quizBank: 'quizzes',
      slideDecks: 'decks',
      discussions: 'discussions',
      lessonPlans: 'plans',
      rubrics: 'rubrics',
      assignments: 'assignments',
      studyGuides: 'guides',
      courseFaq: 'faqs',
    };
    return map[featureId] || null;
  },
}));

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => {
    if (id === 'custom_peerReview') return { name: 'Peer Review' };
    return null;
  }),
}));

import { buildAgentSystemPrompt } from '../agentPrompts';

// ── Fixtures ────────────────────────────────────────────────────────────────

const baseCourseMap = {
  courseName: 'Introduction to Machine Learning',
  semester: 'Fall 2026',
  lessons: [
    { title: 'Lesson 1: Linear Regression', sections: [] },
    { title: 'Lesson 2: Classification', sections: [] },
    { title: 'Lesson 3: Neural Networks', sections: [] },
  ],
};

const baseDeliverables = {
  quizBank: {
    status: 'done',
    data: {
      quizzes: [
        { lt: 'Lesson 1', qs: [{ q: 'What is regression?', ty: 'multiple_choice' }] },
        { lt: 'Lesson 2', qs: [] },
        { lt: 'Lesson 3', qs: [] },
      ],
    },
  },
  slideDecks: { status: 'idle', data: null },
  assignments: { status: 'done', data: { assignments: [{ t: 'HW1', rl: ['Lesson 1'] }] } },
};

function withProfile(profile, callback) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key) => (key === 'coursemapper-professorProfile' ? JSON.stringify(profile) : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  });

  try {
    return callback();
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    else delete globalThis.localStorage;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildAgentSystemPrompt', () => {
  it('includes course name in the output', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Introduction to Machine Learning');
  });

  it('includes a bounded source-grounded evidence ledger from compiled study guides', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', {
      ...baseDeliverables,
      studyGuides: {
        status: 'done',
        data: {
          guides: [
            {
              lt: 'Lesson 1: Linear Regression',
              kt: [
                {
                  tm: 'Residual',
                  df: 'A residual is the observed response minus the response predicted by the fitted model.',
                },
              ],
            },
          ],
        },
      },
    });

    expect(prompt).toContain('Compiled evidence cards (source-grounded, read-only)');
    expect(prompt).toContain('"term":"Residual"');
    expect(prompt).toContain('observed response minus the response predicted');
  });

  it('includes semester in the output', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Fall 2026');
  });

  it('lists lessons with 1-based display and toolIndex', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Lesson 1:');
    expect(prompt).toContain('Lesson 2:');
    expect(prompt).toContain('Lesson 3:');
    expect(prompt).toContain('toolIndex=0');
    expect(prompt).toContain('toolIndex=1');
    expect(prompt).toContain('toolIndex=2');
  });

  it('gives the Agent authoritative duplicate-title conflicts from the compiler', () => {
    const courseMap = {
      courseName: 'Macroeconomics',
      semester: 'Fall 2026',
      lessons: [
        { title: 'Lesson 2: Supply and Demand', sections: [] },
        { title: 'Lesson 4: Supply & Demand', sections: [] },
        { title: 'Lesson 3: Measuring Inflation with CPI', sections: [] },
        { title: 'Lesson 5: Measuring Inflation with Consumer Price Index', sections: [] },
      ],
    };

    const prompt = buildAgentSystemPrompt(courseMap, 'courseMap', {});

    expect(prompt).toContain('Deterministic title conflicts (authoritative)');
    expect(prompt).toContain('Lessons 1 and 2 repeat the same topic identity');
    expect(prompt).toContain('Lessons 3 and 4 repeat the same topic identity');
  });

  it('shows active tab name "Quiz & Exam Bank" for quizBank', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Quiz & Exam Bank');
  });

  it('shows active tab in status line for slideDecks', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'slideDecks', baseDeliverables);
    expect(prompt).toContain('**Active:** Slide Decks');
  });

  it('includes ITEM SCHEMA section when active tab has a schema', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('ITEM SCHEMA');
    expect(prompt).toContain('multiple_choice');
  });

  it('requires read_deliverable before lesson-specific deliverable judgments', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Lesson-specific deliverable judgments');
    expect(prompt).toContain('read_rendered(target featureId + lessonIndex) first');
    expect(prompt).toContain("don't judge quality");
  });

  it('teaches direct local-only assignment checklist edits', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'assignments', baseDeliverables);

    expect(prompt).toContain('Assignment checklist');
    expect(prompt).toContain('["assignments",lessonIdx,"deliverables"]');
    expect(prompt).toContain('localOnly');
    expect(prompt).toContain('then read back');
  });

  it('teaches local-only FAQ answer and lesson-plan activity edits', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'lessonPlans', baseDeliverables);

    expect(prompt).toContain('FAQ Q/A + lesson-plan outline/activity tweaks');
    expect(prompt).toContain('localOnly unless redesigning the course map');
  });

  it('does not include ITEM SCHEMA section for courseMap tab', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', baseDeliverables);
    expect(prompt).not.toContain('ITEM SCHEMA for Course Map');
  });

  it('lists deliverable statuses in compact format', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Editable:');
    expect(prompt).toContain('*quizBank'); // active tab marked
    expect(prompt).toContain('assignments');
    expect(prompt).toContain('slideDecks:idle'); // non-done shown in Other
  });

  it('injects health summary when provided', () => {
    const healthSummary = 'Course Health: 2 errors, 1 warning\n- ERROR: Bloom mismatch in Lesson 1';
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, healthSummary);
    expect(prompt).toContain('Course health:');
    expect(prompt).toContain('2 errors, 1 warning');
  });

  it('does not inject health section when healthSummary is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null);
    expect(prompt).not.toContain('Course health:');
  });

  it('handles null courseMap gracefully', () => {
    const prompt = buildAgentSystemPrompt(null, 'courseMap', {});
    expect(prompt).toContain('Untitled');
    expect(prompt).toContain('(none)');
  });

  it('defaults active tab name to "Course Map" when activeTab is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, null, baseDeliverables);
    expect(prompt).toContain('**Active:** Course Map');
  });

  it('uses custom deliverable names in active tab context', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'custom_peerReview', {
      ...baseDeliverables,
      custom_peerReview: { status: 'done', data: { peerReviews: [] } },
    });

    expect(prompt).toContain('**Active:** Peer Review');
    expect(prompt).not.toContain('**Active:** custom_peerReview');
  });

  it('does NOT contain "Pixabay" anywhere', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).not.toContain('Pixabay');
    expect(prompt).not.toContain('pixabay');
  });

  it('contains "imageSearch" format description', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('imageSearch');
  });

  it('contains tool-calling protocol and response formats', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('"respond"');
    expect(prompt).toContain('chatReply');
    expect(prompt).toContain('proposal');
    expect(prompt).toContain('diagram');
    expect(prompt).toContain('chart');
    expect(prompt).toContain('validate_course');
    expect(prompt).toContain('search_research');
    expect(prompt).toContain('edit_course_map');
    expect(prompt).toContain('edit_deliverables');
  });

  it('includes user preferences when provided', () => {
    const prefs = { blooms_focus: 'higher-order', teaching_style: 'socratic' };
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null, prefs);
    expect(prompt).toContain('User prefs:');
    expect(prompt).toContain('blooms_focus=higher-order');
    expect(prompt).toContain('teaching_style=socratic');
  });

  it('includes institution profile defaults for autonomous repair decisions', () => {
    withProfile(
      {
        institution: 'NYU Silver',
        aiPolicy: 'Students may use AI for brainstorming but must cite substantial assistance.',
        lateWorkPolicy: 'Late work requires prior instructor approval.',
      },
      () => {
        const prompt = buildAgentSystemPrompt(baseCourseMap, 'assignments', baseDeliverables);

        expect(prompt).toContain('Institution/profile defaults');
        expect(prompt).toContain('NYU Silver');
        expect(prompt).toContain('Late work requires prior instructor approval');
        expect(prompt).toContain('cite substantial assistance');
      },
    );
  });

  it('does not include user preferences section when prefs is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null, null);
    expect(prompt).not.toContain('User prefs:');
  });

  it('shows "none" when deliverables is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', null);
    expect(prompt).toContain('none');
  });

  // ── Context optimization tests ──

  it('only includes path example for active tab, not all deliverables', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('["quizzes"'); // active tab path
    expect(prompt).not.toContain('["slideDecks"'); // other tab path
    expect(prompt).not.toContain('["rubrics"'); // other tab path
  });

  it('does NOT include OTHER DELIVERABLE SCHEMAS section', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).not.toContain('OTHER DELIVERABLE SCHEMAS');
  });

  it('lists other done deliverables by name with read_deliverable hint', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('assignments');
    expect(prompt).toContain('read_deliverable');
  });

  it('prompt is compact (under 15500 chars for base case)', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    // Includes few-shot examples, response style rules, tone rules, quality rules, schema + context,
    // plus the v0.9 TA persona: agency contract, grounding rules, critique pattern, and the
    // course-brief dynamic section. The static prefix sits behind a prompt-cache breakpoint,
    // so the added budget is paid once per session, not per call.
    // v0.9.1 adds the localization-interview rule; the static prefix remains
    // behind a prompt-cache breakpoint, so growth is paid once per session.
    expect(prompt.length).toBeLessThan(15500);
  });

  it('shows path example for slideDecks when that tab is active', () => {
    const delivs = {
      ...baseDeliverables,
      slideDecks: { status: 'done', data: { decks: [{ lt: 'L1', sl: [{ t: 'Slide 1' }] }] } },
    };
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'slideDecks', delivs);
    expect(prompt).toContain('["slideDecks"');
    // The editItem path section should NOT show quizBank path when slideDecks is active
    // (few-shot examples may reference other deliverables — that's fine)
    expect(prompt).toContain('editItem path for Slide Decks');
  });

  it('health summary is 1-line with tool hint for multi-line summaries', () => {
    const health = 'Line 1\nLine 2\nLine 3';
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, health);
    expect(prompt).toContain('Line 1');
    expect(prompt).toContain('validate_course for details');
    expect(prompt).not.toContain('Line 2');
  });

  // ── Cross-deliverable sync tests ──

  it('includes dependency map in system prompt', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('CROSS-DELIVERABLE SYNC');
    expect(prompt).toContain('lessonPlans → slideDecks, studyGuides');
    expect(prompt).toContain('assignments → rubrics');
    expect(prompt).toContain('quizBank → studyGuides');
  });

  it('dependency map instructs proactive editing of related deliverables', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    // The exact wording was tightened in the prompt-trim pass; the test
    // now checks the underlying instruction instead of a literal phrase.
    expect(prompt).toMatch(/one\s+edit_deliverables\s+call|same\s+(edit_deliverables\s+)?call/i);
    expect(prompt).toContain('CROSS-DELIVERABLE SYNC');
  });

  it('instructs artifact-only edits to use explicit local-only sync policy', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('syncPolicy');
    expect(prompt).toContain('localOnly for wording/style artifact fixes');
    expect(prompt).toContain('syncPolicy:"localOnly"');
  });

  // ── Empty lessons hint (Bug 1) ──

  it('includes empty-lessons hint when course map has 0 lessons', () => {
    const emptyCourseMap = { courseName: 'Empty Course', semester: 'Spring 2026', lessons: [] };
    const prompt = buildAgentSystemPrompt(emptyCourseMap, 'courseMap', {});
    expect(prompt).toContain('No lessons yet');
    expect(prompt).toContain('addLesson');
  });

  it('does NOT include empty-lessons hint when course map has lessons', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', {});
    expect(prompt).not.toContain('No lessons yet');
  });

  it('includes empty-lessons hint when courseMap is null', () => {
    const prompt = buildAgentSystemPrompt(null, 'courseMap', {});
    expect(prompt).toContain('No lessons yet');
  });
});
