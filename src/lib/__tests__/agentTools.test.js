/**
 * agentTools.test.js — Comprehensive tests for the agent tool registry,
 * descriptions builder, result summarizer, and individual tool execute functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AGENT_TOOLS,
  TOOL_LABELS,
  buildToolDescriptions,
  summarizeToolResult,
  classifyRequestComplexity,
} from '../agentTools';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../pedagogicalValidator', () => ({
  generateCourseHealthReport: vi.fn(() => ({
    errorCount: 2,
    warningCount: 3,
    infoCount: 1,
    findings: [
      { severity: 'error', category: 'alignment', message: 'Misaligned objectives', lessonIndex: 0 },
      { severity: 'warning', category: 'readability', message: 'Complex sentence', lessonIndex: 1 },
    ],
  })),
}));

vi.mock('../grammarChecker', () => ({
  checkGrammar: vi.fn(() => ({
    matches: [
      {
        message: 'Possible typo',
        context: { text: 'teh cat', offset: 0, length: 3 },
        replacements: [{ value: 'the' }],
        rule: { id: 'MORFOLOGIK_RULE_EN_US' },
      },
      {
        message: 'Missing comma',
        context: { text: 'However the', offset: 0, length: 11 },
        replacements: [{ value: 'However, the' }],
        rule: { id: 'COMMA_COMPOUND_SENTENCE' },
      },
    ],
  })),
}));

vi.mock('../academicSearch', () => ({
  executeResearch: vi.fn(() => ({
    results: [{ items: [{ title: 'Paper 1' }, { title: 'Paper 2' }] }],
    formatted: '[1] Paper 1\n[2] Paper 2',
  })),
}));

vi.mock('../agentMemory', () => ({
  MEMORY_CATEGORIES: {
    teaching_style: 'Teaching Style & Preferences',
    assessment: 'Assessment Preferences',
    course_design: 'Course Design Patterns',
    feedback: 'User Feedback & Edit Patterns',
    institutional: 'Institutional Context',
    general: 'General Preferences',
  },
  addMemory: vi.fn(({ category, content, importance }) => ({
    id: 'mem_123_abc',
    category,
    content,
    importance: importance || 3,
    accessCount: 0,
  })),
  searchMemories: vi.fn(() => [
    { id: 'mem_1', category: 'teaching_style', content: 'Prefers Socratic method', importance: 4 },
  ]),
  getMemories: vi.fn(() => [
    { id: 'mem_1', category: 'teaching_style', content: 'Prefers Socratic method', importance: 4 },
    { id: 'mem_2', category: 'assessment', content: 'Likes formative assessments', importance: 3 },
  ]),
  deleteMemory: vi.fn(),
}));

vi.mock('../cloudStorage', () => ({
  saveAgentPrefs: vi.fn(() => Promise.resolve()),
}));

// ── Shared ctx ─────────────────────────────────────────────────────────────

let mockCtx;

beforeEach(() => {
  vi.clearAllMocks();

  // Provide a minimal localStorage stub for save_preference
  globalThis.localStorage = {
    _store: {},
    getItem(key) { return this._store[key] ?? null; },
    setItem(key, val) { this._store[key] = val; },
    removeItem(key) { delete this._store[key]; },
  };

  mockCtx = {
    courseMap: {
      courseName: 'Test Course',
      lessons: [
        { title: 'Lesson 1', sections: [{ learningObjectives: 'LO1', topicSection: 'Topic 1' }] },
        { title: 'Lesson 2', sections: [{ learningObjectives: 'LO2', topicSection: 'Topic 2' }] },
      ],
    },
    deliverables: {
      quizBank: { status: 'done', data: { quizzes: [{ lt: 'L1', qs: [{ q: 'Q1' }] }] } },
      lessonPlans: { status: 'done', data: { lessonPlans: [{ lt: 'L1', ob: 'Obj' }] } },
    },
    executeAction: vi.fn(() => ({ success: true, message: 'Applied' })),
    snapshot: vi.fn(),
    uid: 'test-user',
  };
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. AGENT_TOOLS registry
// ══════════════════════════════════════════════════════════════════════════════

describe('AGENT_TOOLS registry', () => {
  const EXPECTED_TOOLS = [
    'validate_course', 'check_grammar', 'search_research',
    'read_deliverable', 'read_lesson',
    'edit_course_map', 'edit_deliverables',
    'save_preference', 'remember', 'recall', 'compare_deliverables', 'undo_last', 'forget',
    'create_tool', 'run_tool',
  ];

  it('contains exactly 15 tools', () => {
    // 13 domain tools + create_tool / run_tool meta-tools for session macros.
    expect(Object.keys(AGENT_TOOLS)).toHaveLength(15);
  });

  it.each(EXPECTED_TOOLS)('has tool "%s" with description, params, and execute', (name) => {
    const tool = AGENT_TOOLS[name];
    expect(tool).toBeDefined();
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(10);
    expect(typeof tool.params).toBe('object');
    expect(typeof tool.execute).toBe('function');
  });

  it('edit_course_map and edit_deliverables have jsonSchema', () => {
    expect(AGENT_TOOLS.edit_course_map.jsonSchema).toBeDefined();
    expect(AGENT_TOOLS.edit_deliverables.jsonSchema).toBeDefined();
    expect(AGENT_TOOLS.edit_course_map.jsonSchema.required).toContain('patches');
    expect(AGENT_TOOLS.edit_deliverables.jsonSchema.required).toContain('actions');
  });

  it('remember, recall, and forget have jsonSchema', () => {
    expect(AGENT_TOOLS.remember.jsonSchema).toBeDefined();
    expect(AGENT_TOOLS.recall.jsonSchema).toBeDefined();
    expect(AGENT_TOOLS.forget.jsonSchema).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. TOOL_LABELS
// ══════════════════════════════════════════════════════════════════════════════

describe('TOOL_LABELS', () => {
  it('has a label for every tool in AGENT_TOOLS', () => {
    for (const name of Object.keys(AGENT_TOOLS)) {
      expect(TOOL_LABELS[name]).toBeDefined();
      expect(typeof TOOL_LABELS[name]).toBe('string');
    }
  });

  it('includes the "respond" pseudo-tool label', () => {
    expect(TOOL_LABELS.respond).toBe('Preparing response');
  });

  it('labels are human-readable (no underscores)', () => {
    for (const label of Object.values(TOOL_LABELS)) {
      expect(label).not.toMatch(/_/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. buildToolDescriptions()
// ══════════════════════════════════════════════════════════════════════════════

describe('buildToolDescriptions()', () => {
  it('returns a string containing all tool names', () => {
    const desc = buildToolDescriptions();
    for (const name of Object.keys(AGENT_TOOLS)) {
      expect(desc).toContain(`**${name}**`);
    }
  });

  it('includes tool descriptions', () => {
    const desc = buildToolDescriptions();
    expect(desc).toContain('pedagogical validation');
    expect(desc).toContain('grammar');
    expect(desc).toContain('academic sources');
  });

  it('includes "Args:" for each tool', () => {
    const desc = buildToolDescriptions();
    const argsCount = (desc.match(/Args:/g) || []).length;
    expect(argsCount).toBe(Object.keys(AGENT_TOOLS).length);
  });

  it('shows "Args: none" for tools with no params', () => {
    const desc = buildToolDescriptions();
    // validate_course has no params
    expect(desc).toContain('Args: none');
  });

  it('shows param names for tools with params', () => {
    const desc = buildToolDescriptions();
    expect(desc).toContain('lessonIndex');
    expect(desc).toContain('featureId');
    expect(desc).toContain('query');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. summarizeToolResult()
// ══════════════════════════════════════════════════════════════════════════════

describe('summarizeToolResult()', () => {
  it('returns "No result" for null result', () => {
    expect(summarizeToolResult('validate_course', null)).toBe('No result');
    expect(summarizeToolResult('anything', undefined)).toBe('No result');
  });

  it('returns the error message when result has error', () => {
    expect(summarizeToolResult('validate_course', { error: 'Something broke' })).toBe('Something broke');
  });

  describe('validate_course', () => {
    it('formats error/warning/info counts', () => {
      const result = { errorCount: 2, warningCount: 3, infoCount: 1 };
      expect(summarizeToolResult('validate_course', result)).toBe('2 errors, 3 warnings, 1 info');
    });

    it('handles zero counts', () => {
      expect(summarizeToolResult('validate_course', {})).toBe('0 errors, 0 warnings, 0 info');
    });
  });

  describe('check_grammar', () => {
    it('pluralizes "issues" for count != 1', () => {
      expect(summarizeToolResult('check_grammar', { matchCount: 0 })).toBe('0 grammar issues found');
      expect(summarizeToolResult('check_grammar', { matchCount: 5 })).toBe('5 grammar issues found');
    });

    it('uses singular for exactly 1 match', () => {
      expect(summarizeToolResult('check_grammar', { matchCount: 1 })).toBe('1 grammar issue found');
    });
  });

  describe('search_research', () => {
    it('formats total results', () => {
      expect(summarizeToolResult('search_research', { totalResults: 12 })).toBe('12 results found');
    });

    it('handles zero results', () => {
      expect(summarizeToolResult('search_research', {})).toBe('0 results found');
    });
  });

  describe('read_deliverable', () => {
    it('shows totalItems when present', () => {
      expect(summarizeToolResult('read_deliverable', { totalItems: 5 })).toBe('5 items loaded');
    });

    it('shows "Data loaded" when data is present', () => {
      expect(summarizeToolResult('read_deliverable', { data: { foo: 'bar' } })).toBe('Data loaded');
    });

    it('shows "No data" when no data and no totalItems', () => {
      expect(summarizeToolResult('read_deliverable', {})).toBe('No data');
    });
  });

  describe('read_lesson', () => {
    it('formats sections count', () => {
      expect(summarizeToolResult('read_lesson', { sections: [1, 2, 3] })).toBe('3 sections loaded');
    });

    it('handles missing sections', () => {
      expect(summarizeToolResult('read_lesson', {})).toBe('0 sections loaded');
    });
  });

  describe('edit_course_map', () => {
    it('formats applied/failed counts', () => {
      expect(summarizeToolResult('edit_course_map', { applied: 3, failed: 1 })).toBe('3 applied, 1 failed');
    });
  });

  describe('edit_deliverables', () => {
    it('formats applied/failed counts', () => {
      expect(summarizeToolResult('edit_deliverables', { applied: 2, failed: 0 })).toBe('2 applied, 0 failed');
    });
  });

  describe('save_preference', () => {
    it('shows saved key on success', () => {
      expect(summarizeToolResult('save_preference', { saved: true, key: 'blooms_focus' })).toBe('Saved blooms_focus');
    });

    it('shows "Failed" when not saved', () => {
      expect(summarizeToolResult('save_preference', { saved: false })).toBe('Failed');
    });
  });

  describe('remember', () => {
    it('shows truncated content on success', () => {
      const result = { saved: true, content: 'User prefers project-based assessments over exams and quizzes for measuring understanding' };
      const summary = summarizeToolResult('remember', result);
      expect(summary).toContain('Remembered:');
      // Content is sliced to 40 chars
      expect(summary.length).toBeLessThan(60);
    });

    it('shows "Failed" when not saved', () => {
      expect(summarizeToolResult('remember', { saved: false })).toBe('Failed');
    });
  });

  describe('recall', () => {
    it('shows memory count', () => {
      expect(summarizeToolResult('recall', { count: 3 })).toBe('3 memories found');
    });
  });

  describe('forget', () => {
    it('shows "Memory deleted" on success', () => {
      expect(summarizeToolResult('forget', { deleted: true })).toBe('Memory deleted');
    });

    it('shows "Failed" when not deleted', () => {
      expect(summarizeToolResult('forget', { deleted: false })).toBe('Failed');
    });
  });

  describe('respond', () => {
    it('always returns "Response ready"', () => {
      expect(summarizeToolResult('respond', {})).toBe('Response ready');
      expect(summarizeToolResult('respond', { anything: true })).toBe('Response ready');
    });
  });

  describe('unknown tool', () => {
    it('returns "Done"', () => {
      expect(summarizeToolResult('nonexistent_tool', {})).toBe('Done');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. classifyRequestComplexity() — edge cases not covered in requestComplexity.test.js
// ══════════════════════════════════════════════════════════════════════════════

describe('classifyRequestComplexity()', () => {
  it('returns "moderate" for empty input', () => {
    expect(classifyRequestComplexity('', {})).toBe('moderate');
    expect(classifyRequestComplexity(null, {})).toBe('moderate');
  });

  it('returns "simple" for short simple patterns', () => {
    expect(classifyRequestComplexity('fix the typo in lesson 1', {})).toBe('simple');
    expect(classifyRequestComplexity('rename this lesson', {})).toBe('simple');
    expect(classifyRequestComplexity('undo', {})).toBe('simple');
  });

  it('returns "complex" for bulk operations', () => {
    expect(classifyRequestComplexity('rewrite all quizzes to align with Bloom\'s', {})).toBe('complex');
    expect(classifyRequestComplexity('review my course for alignment issues', {})).toBe('complex');
    expect(classifyRequestComplexity('redesign the assessment strategy', {})).toBe('complex');
  });

  it('returns "complex" for long text with many done deliverables', () => {
    const longText = 'a'.repeat(301);
    const deliverables = {
      a: { status: 'done' },
      b: { status: 'done' },
      c: { status: 'done' },
      d: { status: 'done' },
    };
    expect(classifyRequestComplexity(longText, deliverables)).toBe('complex');
  });

  it('simple patterns must also be short (< 100 chars) to be "simple"', () => {
    const longSimple = 'fix the typo ' + 'in this very long sentence '.repeat(10);
    expect(longSimple.length).toBeGreaterThan(100);
    expect(classifyRequestComplexity(longSimple, {})).toBe('moderate');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Individual tool execute functions
// ══════════════════════════════════════════════════════════════════════════════

describe('Tool execute: validate_course', () => {
  it('calls generateCourseHealthReport and returns structured findings', async () => {
    const result = await AGENT_TOOLS.validate_course.execute({}, mockCtx);
    expect(result.errorCount).toBe(2);
    expect(result.warningCount).toBe(3);
    expect(result.infoCount).toBe(1);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toEqual({
      severity: 'error',
      category: 'alignment',
      message: 'Misaligned objectives',
      lessonIndex: 0,
    });
  });
});

describe('Tool execute: check_grammar', () => {
  it('returns matches for a lesson with sufficient text', async () => {
    // Lesson 0 sections have short strings (< 10 chars for values), so we need
    // to add longer content to pass the 20-char threshold.
    mockCtx.courseMap.lessons[0].sections[0].topicSection = 'This is a sufficiently long topic section for grammar checking purposes.';
    const result = await AGENT_TOOLS.check_grammar.execute({ lessonIndex: 0 }, mockCtx);
    expect(result.matchCount).toBe(2);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].message).toBe('Possible typo');
  });

  it('returns empty matches when text is too short', async () => {
    // Default short sections
    mockCtx.courseMap.lessons[0].sections = [{ learningObjectives: 'LO1', topicSection: 'Short' }];
    const result = await AGENT_TOOLS.check_grammar.execute({ lessonIndex: 0 }, mockCtx);
    expect(result.matches).toEqual([]);
    expect(result.note).toBe('Not enough text to check.');
  });

  it('returns empty when lesson index is out of range', async () => {
    const result = await AGENT_TOOLS.check_grammar.execute({ lessonIndex: 99 }, mockCtx);
    expect(result.matches).toEqual([]);
    expect(result.note).toBe('Not enough text to check.');
  });

  it('batch mode: checks all lessons when lessonIndex is omitted', async () => {
    // Add long text to both lessons
    mockCtx.courseMap.lessons[0].sections[0].topicSection = 'This is a sufficiently long topic section for grammar checking purposes.';
    mockCtx.courseMap.lessons[1].sections[0].topicSection = 'Another sufficiently long topic section for grammar checking purposes.';
    const result = await AGENT_TOOLS.check_grammar.execute({}, mockCtx);
    expect(result.mode).toBe('batch');
    expect(result.lessonsChecked).toBe(2);
    expect(result.totalMatches).toBeGreaterThanOrEqual(0);
    expect(result.lessons).toHaveLength(2);
    expect(result.lessons[0].lessonIndex).toBe(0);
    expect(result.lessons[1].lessonIndex).toBe(1);
  });

  it('batch mode: returns note for empty course', async () => {
    mockCtx.courseMap.lessons = [];
    const result = await AGENT_TOOLS.check_grammar.execute({}, mockCtx);
    expect(result.note).toBe('No lessons in course map.');
  });

  it('single lesson mode: includes lessonIndex in result', async () => {
    mockCtx.courseMap.lessons[0].sections[0].topicSection = 'This is a sufficiently long topic section for grammar checking purposes.';
    const result = await AGENT_TOOLS.check_grammar.execute({ lessonIndex: 0 }, mockCtx);
    expect(result.lessonIndex).toBe(0);
    expect(result.matchCount).toBeDefined();
  });
});

describe('Tool execute: search_research', () => {
  it('returns formatted results and total count', async () => {
    const result = await AGENT_TOOLS.search_research.execute(
      { query: 'active learning', sources: ['papers'] },
      mockCtx,
    );
    expect(result.totalResults).toBe(2);
    expect(result.formatted).toContain('Paper 1');
  });

  it('defaults sources to ["papers"] when not provided', async () => {
    const { executeResearch } = await import('../academicSearch');
    await AGENT_TOOLS.search_research.execute({ query: 'test' }, mockCtx);
    expect(executeResearch).toHaveBeenCalledWith(
      expect.objectContaining({ sources: ['papers'] }),
      undefined,
    );
  });
});

describe('Tool execute: read_lesson', () => {
  it('returns lesson data with sections for valid index', () => {
    const result = AGENT_TOOLS.read_lesson.execute({ lessonIndex: 0 }, mockCtx);
    expect(result.title).toBe('Lesson 1');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].sectionIndex).toBe(0);
    expect(result.sections[0].learningObjectives).toBe('LO1');
  });

  it('returns error for out-of-range index', () => {
    const result = AGENT_TOOLS.read_lesson.execute({ lessonIndex: 5 }, mockCtx);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('0-1');
  });

  it('returns error when no course map is loaded', () => {
    const result = AGENT_TOOLS.read_lesson.execute({ lessonIndex: 0 }, { courseMap: null });
    expect(result.error).toBe('No course map loaded.');
  });

  // ── read_lesson size capping (Bug 16) ──

  it('truncates large lesson data and adds truncation note', () => {
    const longText = 'A'.repeat(2000);
    const ctx = {
      courseMap: {
        lessons: [{
          title: 'Big Lesson',
          sections: [
            { learningObjectives: longText, topicSection: longText, syncActivities: longText, asyncActivities: longText },
          ],
        }],
      },
    };
    const result = AGENT_TOOLS.read_lesson.execute({ lessonIndex: 0 }, ctx);
    expect(result.truncated).toBe(true);
    expect(result.note).toContain('truncated');
    // Each field should be capped at ~300 chars + ellipsis
    for (const sec of result.sections) {
      for (const [k, v] of Object.entries(sec)) {
        if (typeof v === 'string' && k !== 'sectionIndex') {
          expect(v.length).toBeLessThanOrEqual(302); // 300 + '…' (multi-byte)
        }
      }
    }
  });

  it('does not truncate small lesson data', () => {
    const result = AGENT_TOOLS.read_lesson.execute({ lessonIndex: 0 }, mockCtx);
    expect(result.truncated).toBeUndefined();
    expect(result.note).toBeUndefined();
  });
});

describe('Tool execute: read_deliverable', () => {
  it('returns summary with totalItems when no lessonIndex specified', () => {
    const result = AGENT_TOOLS.read_deliverable.execute({ featureId: 'quizBank' }, mockCtx);
    expect(result.featureId).toBe('quizBank');
    expect(result.name).toBe('Quiz & Exam Bank');
    expect(result.totalItems).toBe(1);
    expect(result.items[0].index).toBe(0);
    expect(result.items[0].questionCount).toBe(1);
  });

  it('returns specific lesson data when lessonIndex provided', () => {
    const result = AGENT_TOOLS.read_deliverable.execute({ featureId: 'quizBank', lessonIndex: 0 }, mockCtx);
    expect(result.data).toBeDefined();
    expect(result.data.lt).toBe('L1');
    expect(result.data.qs).toHaveLength(1);
  });

  it('returns error for non-existent feature', () => {
    const result = AGENT_TOOLS.read_deliverable.execute({ featureId: 'nonexistent' }, mockCtx);
    expect(result.error).toContain('not generated yet');
  });

  it('returns error for lessonIndex out of range', () => {
    const result = AGENT_TOOLS.read_deliverable.execute({ featureId: 'quizBank', lessonIndex: 99 }, mockCtx);
    expect(result.error).toContain('out of range');
  });

  it('returns stringified data for non-array deliverables (e.g., syllabus)', () => {
    mockCtx.deliverables.syllabus = { status: 'done', data: { syllabus: { title: 'My Syllabus' } } };
    const result = AGENT_TOOLS.read_deliverable.execute({ featureId: 'syllabus' }, mockCtx);
    // syllabus data has no array key, so falls through to stringified fallback
    expect(result.data).toBeDefined();
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('My Syllabus');
  });
});

describe('Tool execute: edit_course_map', () => {
  it('applies a single cell edit patch', () => {
    const result = AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ lessonIndex: 0, sectionIndex: 0, field: 'topicSection', value: 'New Topic' }] },
      mockCtx,
    );
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockCtx.executeAction).toHaveBeenCalledWith({
      type: 'editCell',
      lessonIndex: 0,
      sectionIndex: 0,
      field: 'topicSection',
      value: 'New Topic',
    });
  });

  it('applies multiple patches', () => {
    const result = AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          { lessonIndex: 0, field: 'title', value: 'New Title' },
          { lessonIndex: 1, sectionIndex: 0, field: 'learningObjectives', value: 'Updated LO' },
        ],
      },
      mockCtx,
    );
    expect(result.applied).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockCtx.executeAction).toHaveBeenCalledTimes(2);
  });

  it('returns error for empty patches', () => {
    const result = AGENT_TOOLS.edit_course_map.execute({ patches: [] }, mockCtx);
    expect(result.error).toBe('No patches provided.');
  });

  it('maps title patches to editTitle action type', () => {
    AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ lessonIndex: 0, field: 'title', value: 'Renamed' }] },
      mockCtx,
    );
    expect(mockCtx.executeAction).toHaveBeenCalledWith({
      type: 'editTitle',
      lessonIndex: 0,
      newTitle: 'Renamed',
    });
  });

  it('maps addLesson patches correctly', () => {
    AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ action: 'addLesson', lessonIndex: undefined, title: 'New Lesson' }] },
      mockCtx,
    );
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addLesson', title: 'New Lesson' }),
    );
  });

  it('maps removeLesson patches correctly', () => {
    AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ action: 'removeLesson', lessonIndex: 1 }] },
      mockCtx,
    );
    expect(mockCtx.executeAction).toHaveBeenCalledWith({
      type: 'deleteLesson',
      lessonIndex: 1,
    });
  });

  it('tracks applied vs failed when executeAction returns mixed results', () => {
    mockCtx.executeAction
      .mockReturnValueOnce({ success: true, message: 'ok' })
      .mockReturnValueOnce({ success: false, message: 'nope' });
    const result = AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          { lessonIndex: 0, field: 'title', value: 'A' },
          { lessonIndex: 99, field: 'title', value: 'B' },
        ],
      },
      mockCtx,
    );
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('defaults sectionIndex to 0 when not provided', () => {
    AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ lessonIndex: 0, field: 'topicSection', value: 'X' }] },
      mockCtx,
    );
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ sectionIndex: 0 }),
    );
  });
});

describe('Tool execute: edit_deliverables', () => {
  it('applies a single action', () => {
    const result = AGENT_TOOLS.edit_deliverables.execute(
      { actions: [{ type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'qs', 0, 'q'], value: 'Updated?' }] },
      mockCtx,
    );
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'editItem', featureId: 'quizBank' }),
      { skipSnapshot: true },
    );
  });

  it('returns error for empty actions', () => {
    const result = AGENT_TOOLS.edit_deliverables.execute({ actions: [] }, mockCtx);
    expect(result.error).toBe('No actions provided.');
  });

  it('snapshots each affected featureId exactly once', () => {
    AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'qs', 0, 'q'], value: 'A' },
          { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 'qs', 0, 'q'], value: 'B' },
          { type: 'editItem', featureId: 'lessonPlans', path: ['lessonPlans', 0, 'ob'], value: 'C' },
        ],
      },
      mockCtx,
    );
    // quizBank snapshotted once, lessonPlans once
    expect(mockCtx.snapshot).toHaveBeenCalledTimes(2);
    expect(mockCtx.snapshot).toHaveBeenCalledWith('quizBank', mockCtx.deliverables.quizBank.data);
    expect(mockCtx.snapshot).toHaveBeenCalledWith('lessonPlans', mockCtx.deliverables.lessonPlans.data);
  });

  it('skips snapshot for features without data', () => {
    AGENT_TOOLS.edit_deliverables.execute(
      { actions: [{ type: 'editItem', featureId: 'rubrics' }] },
      mockCtx,
    );
    expect(mockCtx.snapshot).not.toHaveBeenCalled();
  });

  it('works without snapshot function', () => {
    delete mockCtx.snapshot;
    const result = AGENT_TOOLS.edit_deliverables.execute(
      { actions: [{ type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0], value: {} }] },
      mockCtx,
    );
    expect(result.applied).toBe(1);
  });
});

describe('Tool execute: save_preference', () => {
  it('saves preference to localStorage and returns success', () => {
    const result = AGENT_TOOLS.save_preference.execute(
      { key: 'blooms_focus', value: 'apply' },
      mockCtx,
    );
    expect(result.saved).toBe(true);
    expect(result.key).toBe('blooms_focus');
    expect(result.value).toBe('apply');

    const stored = JSON.parse(localStorage.getItem('coursemapper-agent-prefs'));
    expect(stored.blooms_focus).toBe('apply');
  });

  it('syncs to cloud when uid is present', async () => {
    const { saveAgentPrefs } = await import('../cloudStorage');
    AGENT_TOOLS.save_preference.execute({ key: 'style', value: 'formal' }, mockCtx);
    expect(saveAgentPrefs).toHaveBeenCalledWith('test-user', expect.objectContaining({ style: 'formal' }));
  });

  it('returns error on localStorage failure', () => {
    globalThis.localStorage = {
      getItem() { throw new Error('quota exceeded'); },
      setItem() { throw new Error('quota exceeded'); },
    };
    const result = AGENT_TOOLS.save_preference.execute({ key: 'k', value: 'v' }, mockCtx);
    expect(result.error).toContain('Failed to save preference');
    expect(result.error).toContain('quota exceeded');
  });
});

describe('Tool execute: remember', () => {
  it('saves a memory and returns the stored object', () => {
    const result = AGENT_TOOLS.remember.execute(
      { content: 'Prefers active learning', category: 'teaching_style', importance: 4 },
      mockCtx,
    );
    expect(result.saved).toBe(true);
    expect(result.id).toBe('mem_123_abc');
    expect(result.category).toBe('teaching_style');
    expect(result.content).toBe('Prefers active learning');
  });

  it('defaults importance to 3 when not provided', async () => {
    const { addMemory } = await import('../agentMemory');
    AGENT_TOOLS.remember.execute(
      { content: 'Something', category: 'general' },
      mockCtx,
    );
    expect(addMemory).toHaveBeenCalledWith(
      expect.objectContaining({ importance: 3 }),
    );
  });

  it('passes uid from ctx', async () => {
    const { addMemory } = await import('../agentMemory');
    AGENT_TOOLS.remember.execute(
      { content: 'Test', category: 'general' },
      mockCtx,
    );
    expect(addMemory).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'test-user' }),
    );
  });

  it('handles addMemory throwing (dedup detection returns error)', async () => {
    const { addMemory } = await import('../agentMemory');
    addMemory.mockImplementationOnce(() => { throw new Error('Storage full'); });
    const result = AGENT_TOOLS.remember.execute(
      { content: 'Test', category: 'general' },
      mockCtx,
    );
    expect(result.error).toContain('Failed to save memory');
    expect(result.error).toContain('Storage full');
  });
});

describe('Tool execute: recall', () => {
  it('searches memories when query is provided', async () => {
    const { searchMemories } = await import('../agentMemory');
    const result = AGENT_TOOLS.recall.execute({ query: 'Socratic' });
    expect(searchMemories).toHaveBeenCalledWith('Socratic');
    expect(result.count).toBe(1);
    expect(result.memories[0].content).toBe('Prefers Socratic method');
  });

  it('filters by category when provided without query', async () => {
    const { getMemories } = await import('../agentMemory');
    const result = AGENT_TOOLS.recall.execute({ category: 'assessment' });
    expect(getMemories).toHaveBeenCalled();
    expect(result.count).toBe(1);
    expect(result.memories[0].category).toBe('Assessment Preferences');
  });

  it('returns top memories when no query or category', async () => {
    const { getMemories } = await import('../agentMemory');
    const result = AGENT_TOOLS.recall.execute({});
    expect(getMemories).toHaveBeenCalled();
    expect(result.count).toBe(2);
    expect(result.total).toBe(2);
  });

  it('limits results to 10', async () => {
    const { getMemories } = await import('../agentMemory');
    const manyMemories = Array.from({ length: 15 }, (_, i) => ({
      id: `mem_${i}`,
      category: 'general',
      content: `Memory ${i}`,
      importance: 3,
    }));
    getMemories.mockReturnValueOnce(manyMemories);
    const result = AGENT_TOOLS.recall.execute({});
    expect(result.count).toBe(10);
    expect(result.total).toBe(15);
  });

  // ── recall truncation indicator (Bug 23) ──

  it('adds truncated indicator when results exceed 10', async () => {
    const { getMemories } = await import('../agentMemory');
    const manyMemories = Array.from({ length: 20 }, (_, i) => ({
      id: `mem_${i}`,
      category: 'general',
      content: `Memory ${i}`,
      importance: 3,
    }));
    getMemories.mockReturnValueOnce(manyMemories);
    const result = AGENT_TOOLS.recall.execute({});
    expect(result.truncated).toContain('[truncated]');
    expect(result.truncated).toContain('20');
  });

  it('does not add truncated indicator when results fit within limit', () => {
    const result = AGENT_TOOLS.recall.execute({});
    expect(result.truncated).toBeUndefined();
  });

  it('handles errors gracefully', async () => {
    const { getMemories } = await import('../agentMemory');
    getMemories.mockImplementationOnce(() => { throw new Error('Corrupt data'); });
    const result = AGENT_TOOLS.recall.execute({});
    expect(result.error).toContain('Failed to recall memories');
  });
});

describe('Tool execute: forget', () => {
  it('deletes an existing memory', async () => {
    const { deleteMemory } = await import('../agentMemory');
    const result = AGENT_TOOLS.forget.execute({ id: 'mem_1' }, mockCtx);
    expect(result.deleted).toBe(true);
    expect(result.id).toBe('mem_1');
    expect(deleteMemory).toHaveBeenCalledWith('mem_1', 'test-user');
  });

  it('passes null uid when ctx has no uid', async () => {
    const { deleteMemory } = await import('../agentMemory');
    const result = AGENT_TOOLS.forget.execute({ id: 'mem_1' }, {});
    expect(deleteMemory).toHaveBeenCalledWith('mem_1', null);
    expect(result.deleted).toBe(true);
  });

  it('returns error when deleteMemory throws (nonexistent)', async () => {
    const { deleteMemory } = await import('../agentMemory');
    deleteMemory.mockImplementationOnce(() => { throw new Error('Memory not found'); });
    const result = AGENT_TOOLS.forget.execute({ id: 'nonexistent' }, mockCtx);
    expect(result.error).toContain('Failed to delete memory');
    expect(result.error).toContain('Memory not found');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. compare_deliverables
// ══════════════════════════════════════════════════════════════════════════════

describe('Tool execute: compare_deliverables', () => {
  it('compares two deliverables and returns per-lesson results', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: { status: 'done', data: { quizzes: [
          { lt: 'L1', qs: [{ q: 'Q1?', bl: 'Remember' }] },
        ] } },
        lessonPlans: { status: 'done', data: { lessonPlans: [
          { lt: 'L1', ob: 'Explain supervised learning', bl: 'Understand' },
        ] } },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'lessonPlans' }, ctx,
    );
    expect(result.lessonsCompared).toBe(1);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].quizBank).toBeDefined();
    expect(result.comparisons[0].lessonPlans).toBeDefined();
    expect(result.comparisons[0].quizBank.questionCount).toBe(1);
  });

  it('returns error for non-existent deliverable', () => {
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'slideDecks' }, mockCtx,
    );
    expect(result.error).toContain('not generated yet');
  });

  it('detects Bloom\'s level gaps between deliverables', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: { status: 'done', data: { quizzes: [
          { lt: 'L1', qs: [{ q: 'Q1?', bl: 'Remember' }, { q: 'Q2?', bl: 'Apply' }] },
        ] } },
        lessonPlans: { status: 'done', data: { lessonPlans: [
          { lt: 'L1', ob: 'Apply concepts', bl: 'Understand' },
        ] } },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'lessonPlans' }, ctx,
    );
    expect(result.totalGaps).toBeGreaterThan(0);
    // quizBank has Remember+Apply, lessonPlans has only Understand
    // So lessonPlans is missing Remember and Apply
    const gaps = result.comparisons[0].gaps;
    expect(gaps.some(g => g.includes("Bloom's"))).toBe(true);
  });

  it('compares a single lesson when lessonIndex is provided', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: { status: 'done', data: { quizzes: [
          { lt: 'L1', qs: [{ q: 'Q1?' }] },
          { lt: 'L2', qs: [{ q: 'Q2?' }] },
        ] } },
        lessonPlans: { status: 'done', data: { lessonPlans: [
          { lt: 'L1', ob: 'Obj1' },
          { lt: 'L2', ob: 'Obj2' },
        ] } },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'lessonPlans', lessonIndex: 1 }, ctx,
    );
    expect(result.lessonsCompared).toBe(1);
    expect(result.comparisons[0].lessonIndex).toBe(1);
  });

  it('returns error for out-of-range lessonIndex', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: { status: 'done', data: { quizzes: [{ lt: 'L1', qs: [] }] } },
        lessonPlans: { status: 'done', data: { lessonPlans: [{ lt: 'L1', ob: '' }] } },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'lessonPlans', lessonIndex: 99 }, ctx,
    );
    expect(result.error).toContain('out of range');
  });
});

describe('summarizeToolResult: compare_deliverables', () => {
  it('formats comparison summary', () => {
    expect(summarizeToolResult('compare_deliverables', { lessonsCompared: 3, totalGaps: 2 }))
      .toBe('3 lessons compared, 2 gaps');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. undo_last
// ══════════════════════════════════════════════════════════════════════════════

describe('Tool execute: undo_last', () => {
  it('calls undoFn and returns success', () => {
    const undoFn = vi.fn();
    const result = AGENT_TOOLS.undo_last.execute({}, { undoFn });
    expect(undoFn).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.message).toContain('undone');
  });

  it('returns error when undoFn is not available', () => {
    const result = AGENT_TOOLS.undo_last.execute({}, {});
    expect(result.error).toContain('not available');
  });

  it('returns error when undoFn is null', () => {
    const result = AGENT_TOOLS.undo_last.execute({}, { undoFn: null });
    expect(result.error).toContain('not available');
  });

  it('catches undoFn exceptions', () => {
    const undoFn = vi.fn(() => { throw new Error('Stack empty'); });
    const result = AGENT_TOOLS.undo_last.execute({}, { undoFn });
    expect(result.error).toContain('Stack empty');
  });
});

describe('summarizeToolResult: undo_last', () => {
  it('shows "Edit undone" on success', () => {
    expect(summarizeToolResult('undo_last', { success: true })).toBe('Edit undone');
  });

  it('shows "Failed" on failure', () => {
    expect(summarizeToolResult('undo_last', { success: false })).toBe('Failed');
  });
});
