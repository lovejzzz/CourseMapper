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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildAgentSystemPrompt', () => {
  it('includes course name in the output', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Introduction to Machine Learning');
  });

  it('includes semester in the output', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Fall 2026');
  });

  it('lists lessons with 1-based display numbers and 0-based indices', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Lesson 1 (index 0): Lesson 1: Linear Regression');
    expect(prompt).toContain('Lesson 2 (index 1): Lesson 2: Classification');
    expect(prompt).toContain('Lesson 3 (index 2): Lesson 3: Neural Networks');
  });

  it('shows active tab name "Quiz & Exam Bank" for quizBank', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Quiz & Exam Bank');
  });

  it('shows active tab name "Slide Decks" for slideDecks', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'slideDecks', baseDeliverables);
    expect(prompt).toContain('**Active Tab:** Slide Decks');
  });

  it('includes ITEM SCHEMA section when active tab has a schema', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('ITEM SCHEMA');
    expect(prompt).toContain('multiple_choice');
  });

  it('does not include ITEM SCHEMA section for courseMap tab', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', baseDeliverables);
    expect(prompt).not.toContain('ITEM SCHEMA for Course Map');
  });

  it('lists deliverable statuses', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    expect(prompt).toContain('Quiz & Exam Bank: done');
    expect(prompt).toContain('(ACTIVE TAB)');
    expect(prompt).toContain('Assignments: done');
  });

  it('injects health summary when provided', () => {
    const healthSummary = 'Course Health: 2 errors, 1 warning\n- ERROR: Bloom mismatch in Lesson 1';
    const prompt = buildAgentSystemPrompt(
      baseCourseMap,
      'quizBank',
      baseDeliverables,
      healthSummary
    );
    // The dynamic section includes the marker text
    expect(prompt).toContain('COURSE HEALTH (auto-detected issues');
    expect(prompt).toContain('2 errors, 1 warning');
    expect(prompt).toContain('Bloom mismatch in Lesson 1');
  });

  it('does not inject the dynamic health section when healthSummary is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null);
    // The dynamic section header includes "(auto-detected issues" — this should NOT appear
    expect(prompt).not.toContain('COURSE HEALTH (auto-detected issues');
  });

  it('handles null courseMap gracefully with Untitled and (no lessons)', () => {
    const prompt = buildAgentSystemPrompt(null, 'courseMap', {});
    expect(prompt).toContain('Untitled');
    expect(prompt).toContain('(no lessons)');
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

  it('contains native tool-calling protocol and response formats', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables);
    // Native tool-calling references the "respond" tool
    expect(prompt).toContain('"respond"');
    expect(prompt).toContain('Call tools');
    // Final response formats referenced in respond tool description
    expect(prompt).toContain('chatReply');
    expect(prompt).toContain('proposal');
    expect(prompt).toContain('diagram');
    expect(prompt).toContain('chart');
    expect(prompt).toContain('imageSearch');
    // Tool names referenced in decision rules (tools are now declared natively, not embedded)
    expect(prompt).toContain('validate_course');
    expect(prompt).toContain('check_grammar');
    expect(prompt).toContain('search_research');
    expect(prompt).toContain('read_deliverable');
    expect(prompt).toContain('edit_course_map');
    expect(prompt).toContain('edit_deliverables');
  });

  it('includes user preferences when provided', () => {
    const prefs = { blooms_focus: 'higher-order', teaching_style: 'socratic' };
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null, prefs);
    expect(prompt).toContain('USER PREFERENCES');
    expect(prompt).toContain('blooms_focus: higher-order');
    expect(prompt).toContain('teaching_style: socratic');
  });

  it('does not include user preferences section when prefs is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'quizBank', baseDeliverables, null, null);
    expect(prompt).not.toContain('USER PREFERENCES');
  });

  it('shows "(none generated)" when deliverables is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, 'courseMap', null);
    expect(prompt).toContain('(none generated)');
  });

  it('defaults active tab name to "Course Map" when activeTab is null', () => {
    const prompt = buildAgentSystemPrompt(baseCourseMap, null, baseDeliverables);
    expect(prompt).toContain('**Active Tab:** Course Map');
  });
});
