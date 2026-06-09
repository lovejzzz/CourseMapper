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
import { executeAction } from '../agentActions';
import { generateImages } from '../imageSearch';

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

vi.mock('../imageSearch', () => ({
  OPENAI_SLIDE_IMAGE_MODEL: 'gpt-image-2',
  generateImages: vi.fn(() =>
    Promise.resolve({
      images: [
        {
          url: 'data:image/png;base64,ZmFrZQ==',
          provider: 'gpt-image-1.5',
          revisedPrompt: 'revised prompt',
        },
      ],
    }),
  ),
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

vi.mock('../packageExportVerifier', () => ({
  verifyPackageExports: vi.fn(() =>
    Promise.resolve({
      status: 'passed',
      checked: 3,
      passed: 3,
      failed: 0,
      warningCount: 0,
      checks: [
        {
          featureId: 'courseMap',
          label: 'Course Map',
          format: 'xlsx',
          status: 'passed',
          message: 'Course map spreadsheet can be generated.',
        },
      ],
    }),
  ),
}));

vi.mock('../agentModelRouting', () => ({
  getModelRoutingAdvice: vi.fn(() => ({
    mode: 'stay-on-current-model',
    currentModel: 'gpt-5.4-mini',
    nextModel: 'gpt-5.4-mini',
    shouldEscalate: false,
    reason: 'Use targeted retry before changing models.',
  })),
}));

// ── Shared ctx ─────────────────────────────────────────────────────────────

let mockCtx;

beforeEach(() => {
  vi.clearAllMocks();

  // Provide a minimal localStorage stub for save_preference
  globalThis.localStorage = {
    _store: {},
    getItem(key) {
      return this._store[key] ?? null;
    },
    setItem(key, val) {
      this._store[key] = val;
    },
    removeItem(key) {
      delete this._store[key];
    },
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
    optimisticUpdate: vi.fn(),
    setCurrentDeliverables: vi.fn((next) => {
      mockCtx.deliverables = next;
    }),
    snapshot: vi.fn(),
    uid: 'test-user',
  };
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. AGENT_TOOLS registry
// ══════════════════════════════════════════════════════════════════════════════

describe('AGENT_TOOLS registry', () => {
  const EXPECTED_TOOLS = [
    'inspect_workspace',
    'plan_workspace_next_step',
    'validate_course',
    'finalize_package',
    'verify_package_exports',
    'review_package_readiness',
    'repair_package_readiness',
    'retry_package_weak_spots',
    'check_grammar',
    'search_research',
    'read_deliverable',
    'read_lesson',
    'edit_course_map',
    'edit_deliverables',
    'generate_slide_images',
    'verify_slide_images',
    'verify_slide_export',
    'save_preference',
    'remember',
    'recall',
    'compare_deliverables',
    'undo_last',
    'forget',
    'create_tool',
    'run_tool',
  ];

  it('contains exactly 30 tools', () => {
    // Domain tools + create_tool / run_tool meta-tools for session macros.
    expect(Object.keys(AGENT_TOOLS)).toHaveLength(30);
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
    expect(AGENT_TOOLS.edit_deliverables.jsonSchema.properties.actions.items.properties.syncPolicy.enum).toEqual([
      'auto',
      'localOnly',
      'blueprint',
    ]);
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

  describe('inspect_workspace', () => {
    it('formats course, generated, stale, and blocker counts', () => {
      expect(
        summarizeToolResult('inspect_workspace', {
          course: { lessonCount: 8 },
          generatedFeatureCount: 3,
          staleFeatureCount: 1,
          readiness: { blockerCount: 2 },
        }),
      ).toBe('8 lessons, 3 generated, 1 stale, 2 blockers');
    });
  });

  describe('plan_workspace_next_step', () => {
    it('formats the highest-impact action title', () => {
      expect(
        summarizeToolResult('plan_workspace_next_step', {
          highestImpactAction: { title: 'Clear package readiness blockers' },
          actions: [{ title: 'Clear package readiness blockers' }],
        }),
      ).toBe('Clear package readiness blockers');
    });
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

  describe('package readiness tools', () => {
    it('formats package finalizer confidence', () => {
      expect(
        summarizeToolResult('finalize_package', {
          confidence: 'Good with assumptions',
          repairsApplied: 2,
          readiness: { blockerCount: 0, warningCount: 3 },
          exportVerification: { status: 'passed' },
        }),
      ).toBe('Decision needed: 2 repaired, 0 issue(s) to fix, 3 review item(s), passed');
    });

    it('formats export verification checks', () => {
      expect(summarizeToolResult('verify_package_exports', { status: 'passed', passed: 4, checked: 4 })).toBe(
        'passed: 4/4 export checks passed',
      );
    });

    it('formats readiness review status', () => {
      expect(
        summarizeToolResult('review_package_readiness', {
          status: 'warnings',
          blockerCount: 1,
          warningCount: 2,
        }),
      ).toBe('warnings: 1 issue(s) to fix, 2 review item(s)');
    });

    it('formats readiness repair counts', () => {
      expect(summarizeToolResult('repair_package_readiness', { applied: 2, failed: 1 })).toBe('2 repaired, 1 failed');
    });

    it('formats targeted retry counts', () => {
      expect(summarizeToolResult('retry_package_weak_spots', { started: 2, pending: 2, failed: 0 })).toBe(
        '2 retries started, 2 pending',
      );
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

  describe('read_deliverable', () => {
    it('summarizes quiz-bank question totals instead of lesson-bank items', () => {
      expect(
        summarizeToolResult('read_deliverable', { featureId: 'quizBank', totalItems: 3, totalQuestions: 15 }),
      ).toBe('15 quiz questions loaded');
    });
  });

  describe('generate_slide_images', () => {
    it('formats generated/failed counts', () => {
      expect(summarizeToolResult('generate_slide_images', { applied: 2, failed: 1 })).toBe(
        '2 images generated, 1 failed',
      );
    });
  });

  describe('verify_slide_images', () => {
    it('formats generated image coverage', () => {
      expect(summarizeToolResult('verify_slide_images', { generatedSlides: 2, imageReadySlides: 3 })).toBe(
        '2/3 image-ready slides have images',
      );
    });
  });

  describe('verify_slide_export', () => {
    it('formats export integrity counts', () => {
      expect(summarizeToolResult('verify_slide_export', { slidesExported: 4, mediaFiles: 2, pictureElements: 2 })).toBe(
        '4 slides, 2 media files, 2 pictures',
      );
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
      const result = {
        saved: true,
        content: 'User prefers project-based assessments over exams and quizzes for measuring understanding',
      };
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
    expect(classifyRequestComplexity("rewrite all quizzes to align with Bloom's", {})).toBe('complex');
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

describe('Tool execute: inspect_workspace', () => {
  it('returns grounded workspace state for planning', async () => {
    mockCtx.selectedFeatures = ['courseMap', 'lessonPlans', 'quizBank', 'rubrics'];
    mockCtx.activeTab = 'lessonPlans';
    mockCtx.dryRun = true;
    mockCtx.deliverables.quizBank.stale = true;
    mockCtx.deliverables.rubrics = { status: 'error', error: 'Generation failed', data: null };

    const result = await AGENT_TOOLS.inspect_workspace.execute({}, mockCtx);

    expect(result.course).toMatchObject({
      name: 'Test Course',
      lessonCount: 2,
      activeTab: 'lessonPlans',
      activeTabLabel: 'Lesson Plans',
    });
    expect(result.executionMode).toBe('inspect-first');
    expect(result.selectedFeatureCount).toBe(4);
    expect(result.generatedFeatureCount).toBe(2);
    expect(result.staleFeatureCount).toBe(1);
    expect(result.failedFeatureCount).toBe(1);
    expect(result.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: 'lessonPlans', label: 'Lesson Plans', status: 'done', itemCount: 1 }),
        expect.objectContaining({ featureId: 'quizBank', label: 'Quiz & Exam Bank', stale: true }),
        expect.objectContaining({ featureId: 'rubrics', label: 'Rubrics', status: 'error' }),
      ]),
    );
    expect(result.readiness).toEqual(
      expect.objectContaining({
        blockerCount: expect.any(Number),
        warningCount: expect.any(Number),
        checkedSections: expect.any(String),
      }),
    );
    expect(result.nextChecks.join(' ')).toMatch(/failed generation|stale/i);
  });
});

describe('Tool execute: plan_workspace_next_step', () => {
  it('prioritizes failed and stale deliverables before general quality work', async () => {
    mockCtx.selectedFeatures = ['courseMap', 'lessonPlans', 'quizBank', 'rubrics'];
    mockCtx.activeTab = 'lessonPlans';
    mockCtx.deliverables.quizBank.stale = true;
    mockCtx.deliverables.rubrics = { status: 'error', error: 'Generation failed', data: null };

    const result = await AGENT_TOOLS.plan_workspace_next_step.execute({}, mockCtx);

    expect(result.course).toMatchObject({
      name: 'Test Course',
      lessonCount: 2,
      activeTab: 'lessonPlans',
      activeTabLabel: 'Lesson Plans',
    });
    expect(result.evidence).toMatchObject({
      selectedFeatureCount: 4,
      generatedFeatureCount: 2,
      staleFeatureCount: 1,
      failedFeatureCount: 1,
    });
    expect(result.highestImpactAction).toMatchObject({
      priority: 'P0',
      title: expect.stringContaining('Resolve failed generation'),
      target: 'Rubrics',
      suggestedCommand: 'Regenerate Rubrics',
      safeMode: 'requires-generation',
      featureIds: ['rubrics'],
      intent: { type: 'regenerate_failed_feature', featureIds: ['rubrics'] },
    });
    expect(result.actions[1]).toMatchObject({
      title: expect.stringContaining('Sync stale deliverables'),
      intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
    });
    expect(result.actions.map((action) => action.title).join(' ')).toContain('Sync stale deliverables');
    expect(result.actions.map((action) => action.title).join(' ')).toContain('Improve the active Lesson Plans');
  });
});

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

describe('Tool execute: package readiness', () => {
  it('finalizes a package with safe repairs, readiness, and validation confidence', async () => {
    mockCtx.deliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lt: 'Lesson 1',
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
    mockCtx.selectedFeatures = ['quizBank'];

    const result = await AGENT_TOOLS.finalize_package.execute({}, mockCtx);

    expect(result.confidence).toBe('Needs attention');
    expect(result.repairsApplied).toBe(1);
    expect(result.readiness.warningCount).toBeGreaterThan(0);
    expect(result.classroomReadiness.warningCount).toBeGreaterThan(0);
    expect(result.repairQueue.retryActionCount).toBeGreaterThan(0);
    expect(result.repairQueue.nextTool).toBe('retry_package_weak_spots');
    expect(result.validation.errorCount).toBe(2);
    expect(result.exportVerification.status).toBe('passed');
    expect(result.modelRouting.currentModel).toBe('gpt-5.4-mini');
    expect(mockCtx.optimisticUpdate).toHaveBeenCalledWith('quizBank', expect.any(Object));
    expect(mockCtx.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
    expect(mockCtx.deliverables.quizBank.data.quizzes[0].tp).toBe(18);
  });

  it('returns a repair queue from finalize_package for localized weak sections', async () => {
    mockCtx.deliverables = {
      slideDecks: {
        status: 'done',
        data: {
          decks: [{ lt: 'Lesson 1', sl: [{ t: 'Only slide' }] }],
        },
      },
    };
    mockCtx.selectedFeatures = ['slideDecks'];

    const result = await AGENT_TOOLS.finalize_package.execute({}, mockCtx);

    expect(result.repairQueue).toEqual(
      expect.objectContaining({
        nextTool: 'retry_package_weak_spots',
        retryActionCount: 2,
      }),
    );
    expect(result.repairQueue.retryActions[0]).toEqual(
      expect.objectContaining({
        featureId: 'slideDecks',
        lessonIndex: 0,
        lessonNumber: 1,
      }),
    );
    expect(result.nextAction).toContain('Regenerate 2 localized weak sections');
  });

  it('verifies package exports without downloading files', async () => {
    const result = await AGENT_TOOLS.verify_package_exports.execute({}, mockCtx);

    expect(result.status).toBe('passed');
    expect(result.checked).toBe(3);
    expect(result.checks[0]).toEqual(
      expect.objectContaining({
        featureId: 'courseMap',
        format: 'xlsx',
      }),
    );
  });

  it('reviews readiness with compact blocker and warning counts', async () => {
    mockCtx.selectedFeatures = ['courseMap', 'quizBank'];
    const result = await AGENT_TOOLS.review_package_readiness.execute({}, mockCtx);

    expect(result.status).toBe('warnings');
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.classroomReadiness.warningCount).toBeGreaterThan(0);
    expect(result.checkedSections).toBe('2/2');
    expect(result.warnings[0]).toHaveProperty('message');
  });

  it('repairs safe readiness issues through optimistic update', async () => {
    mockCtx.deliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lt: 'Lesson 1',
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
    mockCtx.selectedFeatures = ['quizBank'];

    const result = await AGENT_TOOLS.repair_package_readiness.execute({}, mockCtx);

    expect(result.applied).toBe(1);
    expect(mockCtx.snapshot).toHaveBeenCalledWith('quizBank', expect.any(Object));
    expect(mockCtx.optimisticUpdate).toHaveBeenCalledWith('quizBank', expect.any(Object));
    expect(mockCtx.deliverables.quizBank.data.quizzes[0].qs).toHaveLength(5);
    expect(mockCtx.deliverables.quizBank.data.quizzes[0].tp).toBe(18);
  });

  it('repairs classroom-readiness discussion artifact labels without touching clean deliverables', async () => {
    mockCtx.deliverables = {
      discussions: {
        status: 'done',
        data: {
          discussions: [
            {
              lt: 'Lesson 1: Sampling',
              pr: 'Which sampling revision is best supported?',
              er: 'Use the sampling plan rows 1-4.',
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
            ...[1, 2].map((lessonNumber) => ({
              lt: `Lesson ${lessonNumber}`,
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
            })),
          ],
        },
      },
    };
    mockCtx.selectedFeatures = ['discussions', 'quizBank'];

    const result = await AGENT_TOOLS.repair_package_readiness.execute({}, mockCtx);

    expect(result.applied).toBe(1);
    expect(mockCtx.optimisticUpdate).toHaveBeenCalledWith(
      'discussions',
      expect.objectContaining({
        discussions: [
          expect.objectContaining({
            sourceArtifacts: [expect.objectContaining({ title: 'Sampling Plan Excerpt' })],
          }),
        ],
      }),
    );
    expect(mockCtx.optimisticUpdate).not.toHaveBeenCalledWith('quizBank', expect.any(Object));
  });

  it('refuses package readiness repairs when the deliverable updater is unavailable', async () => {
    mockCtx.optimisticUpdate = null;

    const result = await AGENT_TOOLS.repair_package_readiness.execute({}, mockCtx);

    expect(result.error).toContain('Deliverable update API is not available');
  });

  it('refuses package finalization repairs when the deliverable updater is unavailable', async () => {
    mockCtx.optimisticUpdate = null;

    const result = await AGENT_TOOLS.finalize_package.execute({}, mockCtx);

    expect(result.error).toContain('Deliverable update API is not available');
  });

  it('starts targeted retries for localized weak generated sections', async () => {
    mockCtx.deliverables = {
      slideDecks: {
        status: 'done',
        data: {
          decks: [{ lt: 'Lesson 1', sl: [{ t: 'Only slide' }] }],
        },
      },
    };
    mockCtx.selectedFeatures = ['slideDecks'];
    mockCtx.executeAction = vi.fn(() => ({ success: true, pending: true, message: 'Regenerating' }));

    const result = await AGENT_TOOLS.retry_package_weak_spots.execute({ maxActions: 2 }, mockCtx);

    expect(result.started).toBe(1);
    expect(result.pending).toBe(1);
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      { type: 'regenerateLesson', featureId: 'slideDecks', lessonIndex: 0 },
      expect.objectContaining({ skipSnapshot: true }),
    );
  });

  it.each([0, 9, 1.5, '2'])('rejects invalid retry maxActions before starting retries (%s)', async (maxActions) => {
    mockCtx.executeAction = vi.fn();

    const result = await AGENT_TOOLS.retry_package_weak_spots.execute({ maxActions }, mockCtx);

    expect(result.error).toBe('Invalid maxActions - expected an integer from 1 to 8.');
    expect(mockCtx.executeAction).not.toHaveBeenCalled();
  });
});

describe('Tool execute: run_tool', () => {
  it('delegates known built-in tool names when the model routes them through run_tool', async () => {
    const invokeBuiltin = vi.fn(async () => ({ started: 1, pending: 1, failed: 0 }));
    const validateBuiltinDelegation = vi.fn(() => null);

    const result = await AGENT_TOOLS.run_tool.execute(
      { name: 'retry_package_weak_spots', args: { maxActions: 2 } },
      {
        customTools: {
          registry: { get: vi.fn(() => null) },
          invokeBuiltin,
          validateBuiltinDelegation,
        },
      },
    );

    expect(validateBuiltinDelegation).toHaveBeenCalledWith('retry_package_weak_spots', { maxActions: 2 });
    expect(invokeBuiltin).toHaveBeenCalledWith('retry_package_weak_spots', { maxActions: 2 }, undefined);
    expect(result).toEqual({
      ok: true,
      delegatedTool: 'retry_package_weak_spots',
      result: { started: 1, pending: 1, failed: 0 },
    });
    expect(summarizeToolResult('run_tool', result)).toBe('1 retries started, 1 pending');
  });

  it('blocks mutation-capable built-in delegation without a validation hook', async () => {
    const invokeBuiltin = vi.fn();

    const result = await AGENT_TOOLS.run_tool.execute(
      { name: 'edit_course_map', args: { patches: [{ lessonIndex: 0, field: 'title', value: 'Unsafe' }] } },
      {
        customTools: {
          registry: { get: vi.fn(() => null) },
          invokeBuiltin,
        },
      },
    );

    expect(result.error).toContain('Mutation-capable tool "edit_course_map"');
    expect(invokeBuiltin).not.toHaveBeenCalled();
  });

  it('blocks custom macro mutation steps when the validation hook refuses them', async () => {
    const invokeBuiltin = vi.fn(async () => ({ applied: 1, failed: 0 }));
    const validateBuiltinDelegation = vi.fn(() => ({ error: 'Please confirm this broad course-map rewrite first.' }));
    const registry = {
      get: vi.fn(() => ({
        plan: [
          {
            id: 'edit',
            tool: 'edit_course_map',
            args: { patches: [{ lessonIndex: 0, field: 'title', value: 'Unsafe' }] },
          },
        ],
      })),
    };

    const result = await AGENT_TOOLS.run_tool.execute(
      { name: 'unsafe_macro', args: {} },
      {
        customTools: {
          registry,
          invokeBuiltin,
          validateBuiltinDelegation,
        },
      },
    );

    expect(result.error).toContain('step "edit" (edit_course_map) failed: Please confirm');
    expect(validateBuiltinDelegation).toHaveBeenCalledWith('edit_course_map', {
      patches: [{ lessonIndex: 0, field: 'title', value: 'Unsafe' }],
    });
    expect(invokeBuiltin).not.toHaveBeenCalled();
  });

  it('does not delegate unknown or meta tool names through run_tool', async () => {
    const invokeBuiltin = vi.fn();
    const ctx = {
      customTools: {
        registry: { get: vi.fn(() => null) },
        invokeBuiltin,
      },
    };

    await expect(AGENT_TOOLS.run_tool.execute({ name: 'create_tool', args: {} }, ctx)).resolves.toEqual({
      error: 'No custom tool named "create_tool". Create it first with create_tool.',
    });
    await expect(AGENT_TOOLS.run_tool.execute({ name: 'missing_tool', args: {} }, ctx)).resolves.toEqual({
      error: 'No custom tool named "missing_tool". Create it first with create_tool.',
    });
    expect(invokeBuiltin).not.toHaveBeenCalled();
  });
});

describe('Tool execute: check_grammar', () => {
  it('returns matches for a lesson with sufficient text', async () => {
    // Lesson 0 sections have short strings (< 10 chars for values), so we need
    // to add longer content to pass the 20-char threshold.
    mockCtx.courseMap.lessons[0].sections[0].topicSection =
      'This is a sufficiently long topic section for grammar checking purposes.';
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
    mockCtx.courseMap.lessons[0].sections[0].topicSection =
      'This is a sufficiently long topic section for grammar checking purposes.';
    mockCtx.courseMap.lessons[1].sections[0].topicSection =
      'Another sufficiently long topic section for grammar checking purposes.';
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
    mockCtx.courseMap.lessons[0].sections[0].topicSection =
      'This is a sufficiently long topic section for grammar checking purposes.';
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
    expect(executeResearch).toHaveBeenCalledWith(expect.objectContaining({ sources: ['papers'] }), undefined);
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
        lessons: [
          {
            title: 'Big Lesson',
            sections: [
              {
                learningObjectives: longText,
                topicSection: longText,
                syncActivities: longText,
                asyncActivities: longText,
              },
            ],
          },
        ],
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
    expect(result.totalQuestions).toBe(1);
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
    AGENT_TOOLS.edit_course_map.execute({ patches: [{ lessonIndex: 0, field: 'title', value: 'Renamed' }] }, mockCtx);
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
      expect.objectContaining({ type: 'addLesson', lessonIndex: 2, title: 'New Lesson' }),
    );
  });

  it('does not require lessonIndex for addLesson patch schema entries', () => {
    const patchSchema = AGENT_TOOLS.edit_course_map.jsonSchema.properties.patches.items;
    expect(patchSchema.required || []).not.toContain('lessonIndex');
  });

  it('assigns sequential indexes for multiple append-style addLesson patches', () => {
    AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          { action: 'addLesson', title: 'New Lesson 3' },
          { action: 'addLesson', lesson: { title: 'New Lesson 4', sections: [{ topicSection: 'Topic 4' }] } },
        ],
      },
      mockCtx,
    );

    expect(mockCtx.executeAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'addLesson', lessonIndex: 2, title: 'New Lesson 3' }),
    );
    expect(mockCtx.executeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'addLesson',
        lessonIndex: 3,
        title: 'New Lesson 4',
        sections: [{ topicSection: 'Topic 4' }],
      }),
    );
  });

  it('maps removeLesson patches correctly', () => {
    AGENT_TOOLS.edit_course_map.execute({ patches: [{ action: 'removeLesson', lessonIndex: 1 }] }, mockCtx);
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
    AGENT_TOOLS.edit_course_map.execute({ patches: [{ lessonIndex: 0, field: 'topicSection', value: 'X' }] }, mockCtx);
    expect(mockCtx.executeAction).toHaveBeenCalledWith(expect.objectContaining({ sectionIndex: 0 }));
  });

  it('rejects invalid course-map patches before calling executeAction', () => {
    const result = AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ lessonIndex: 0, field: 'ghostField', value: 'Do not write this' }] },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 0,
      failed: 1,
      details: [
        expect.objectContaining({ success: false, message: expect.stringContaining('Unknown course-map field') }),
      ],
    });
    expect(mockCtx.executeAction).not.toHaveBeenCalled();
  });

  it('prevalidates the whole course-map batch before executing valid patches', () => {
    const result = AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          { lessonIndex: 0, field: 'topicSection', value: 'Valid topic' },
          { lessonIndex: 50, field: 'topicSection', value: 'Invalid target' },
        ],
      },
      mockCtx,
    );

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.details[1]).toMatchObject({
      success: false,
      message: expect.stringContaining('out of range'),
    });
    expect(mockCtx.executeAction).toHaveBeenCalledTimes(1);
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'editCell', lessonIndex: 0, field: 'topicSection' }),
    );
  });

  it('blocks duplicate lesson titles within one addLesson batch', () => {
    const result = AGENT_TOOLS.edit_course_map.execute(
      {
        patches: [
          { action: 'addLesson', title: 'New Studio', sections: [{ topicSection: 'A' }] },
          { action: 'addLesson', title: 'New Studio', sections: [{ topicSection: 'B' }] },
        ],
      },
      mockCtx,
    );

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.details[1]).toMatchObject({
      success: false,
      message: expect.stringContaining('already exists'),
    });
    expect(mockCtx.executeAction).toHaveBeenCalledTimes(1);
  });

  it('allows runtime custom course-map columns', () => {
    mockCtx.columns = [{ key: 'communityPartner' }];
    const result = AGENT_TOOLS.edit_course_map.execute(
      { patches: [{ lessonIndex: 0, field: 'communityPartner', value: 'Local clinic' }] },
      mockCtx,
    );

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'communityPartner', value: 'Local clinic' }),
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
      expect.objectContaining({ skipSnapshot: true }),
    );
  });

  it('marks explicit local-only edits so chat does not raise sync state', () => {
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn(() => ({
      patch: {
        field: 'weeklyAssessments',
        label: 'weekly assessments',
        lessonIndex: 0,
        value: 'Harder quiz focus',
      },
    }));

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'quizBank',
            path: ['quizzes', 0, 'qs', 0, 'q'],
            value: 'Corrected typo?',
            syncPolicy: 'localOnly',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 1,
      pending: 0,
      failed: 0,
    });
    expect(result.details[0]).toMatchObject({
      action: 'editItem',
      featureId: 'quizBank',
      success: true,
      syncPolicy: 'localOnly',
      localOnly: true,
    });
    expect(mockCtx.projectDeliverableActionToCanonicalPatch).not.toHaveBeenCalled();
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ syncPolicy: 'localOnly' }),
      expect.objectContaining({ skipSnapshot: true }),
    );
  });

  it('treats direct quiz question wording edits as local-only artifact changes', () => {
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn(() => ({
      patch: { field: 'learningObjectives', lessonIndex: 0, value: 'Projected objective' },
    }));

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'quizBank',
            path: ['quizzes', 0, 'questions', 0, 'question'],
            value: 'What evidence proves export readiness?',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({ applied: 1, pending: 0, failed: 0 });
    expect(result.details[0]).toMatchObject({ featureId: 'quizBank', localOnly: true });
    expect(mockCtx.projectDeliverableActionToCanonicalPatch).not.toHaveBeenCalled();
  });

  it('marks lesson-plan outline additions as local-only even when the model omits syncPolicy', () => {
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn();
    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'addItem',
            featureId: 'lessonPlans',
            lessonIndex: 0,
            subKey: 'outline',
            item: { time: '5 min', activity: 'Opening check', description: 'Name one export risk.' },
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 1,
      pending: 0,
      failed: 0,
    });
    expect(result.details[0]).toMatchObject({
      action: 'addItem',
      featureId: 'lessonPlans',
      success: true,
      syncPolicy: 'localOnly',
      localOnly: true,
    });
    expect(mockCtx.projectDeliverableActionToCanonicalPatch).not.toHaveBeenCalled();
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addItem' }),
      expect.objectContaining({ skipSnapshot: true }),
    );
  });

  it('preserves multiple direct slide-note edits from one tool call', () => {
    mockCtx.deliverables.slideDecks = {
      status: 'done',
      data: {
        decks: [
          { lessonTitle: 'Lesson 1', slides: [{ title: 'L1', speakerNotes: 'L1 notes' }] },
          {
            lessonTitle: 'Lesson 2',
            slides: [
              { title: 'Purpose', speakerNotes: 'Old opening notes.' },
              { title: 'Practice', speakerNotes: 'Old practice notes.' },
            ],
          },
        ],
      },
    };
    mockCtx.executeAction = vi.fn((action, opts = {}) =>
      executeAction(action, {
        ...mockCtx,
        deliverables: opts.deliverables || mockCtx.deliverables,
        optimisticUpdate: opts.optimisticUpdate || mockCtx.optimisticUpdate,
        skipSnapshot: opts.skipSnapshot,
      }),
    );

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'slideDecks',
            lessonIndex: 1,
            path: ['decks', 1, 'slides', 0, 'speakerNotes'],
            value: 'Substitute instructor opening: state the purpose, pacing, and fallback question.',
          },
          {
            type: 'editItem',
            featureId: 'slideDecks',
            lessonIndex: 1,
            path: ['decks', 1, 'slides', 1, 'speakerNotes'],
            value: 'Substitute instructor practice cue: compare artifacts and choose a verbal fallback.',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({ applied: 2, failed: 0 });
    const slides = mockCtx.deliverables.slideDecks.data.decks[1].slides;
    expect(slides[0].speakerNotes).toContain('Substitute instructor opening');
    expect(slides[1].speakerNotes).toContain('Substitute instructor practice cue');
    expect(mockCtx.snapshot).toHaveBeenCalledTimes(1);
  });

  it('normalizes Course FAQ cloud-export edits to the matching FAQ question across lessons', () => {
    mockCtx.deliverables.courseFaq = {
      status: 'done',
      data: {
        faqs: [
          {
            lessonTitle: 'Lesson 1',
            questions: [
              { question: 'What should I check?', answer: 'Open the export.' },
              {
                question: 'What should I do if a cloud export fails?',
                answer: 'Use the local download first, then reconnect Google Drive.',
              },
            ],
          },
          {
            lessonTitle: 'Lesson 2',
            questions: [
              { question: 'What should I check?', answer: 'Open the export.' },
              {
                question: 'What should I do if a cloud export fails?',
                answer: 'Use the local download first, then reconnect Google Drive.',
              },
            ],
          },
        ],
      },
    };
    mockCtx.userMessage =
      'In the Course FAQ, update the cloud export failure answer so it says to use the local ZIP first. Apply it directly.';

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'courseFaq',
            path: ['faqs', 1, 'questions', 0, 'answer'],
            value: 'Use the local ZIP first.',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({ applied: 2, failed: 0 });
    expect(mockCtx.executeAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        featureId: 'courseFaq',
        lessonIndex: 0,
        path: ['faqs', 0, 'questions', 1, 'answer'],
        value: expect.stringContaining('local ZIP first'),
        syncPolicy: 'localOnly',
      }),
      expect.objectContaining({ skipSnapshot: true }),
    );
    expect(mockCtx.executeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        featureId: 'courseFaq',
        lessonIndex: 1,
        path: ['faqs', 1, 'questions', 1, 'answer'],
      }),
      expect.objectContaining({ skipSnapshot: true }),
    );
  });

  it('keeps Course FAQ cloud-export shortening on the requested lesson and preserves the local ZIP instruction', () => {
    mockCtx.deliverables.courseFaq = {
      status: 'done',
      data: {
        faqs: [
          {
            lessonTitle: 'Lesson 1',
            questions: [
              {
                question: 'What should I do if a cloud export fails?',
                answer: 'Use the local ZIP first if cloud export fails, then retry cloud export.',
              },
            ],
          },
          {
            lessonTitle: 'Lesson 2',
            questions: [
              {
                question: 'What should I do if a cloud export fails?',
                answer: 'Use the local ZIP first if cloud export fails, then retry cloud export.',
              },
            ],
          },
        ],
      },
    };
    mockCtx.userMessage = 'Shorten the Lesson 1 Course FAQ answer about cloud export failure to one sentence.';

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'courseFaq',
            path: ['faqs', 1, 'questions', 0, 'answer'],
            value: 'Record the failed step, then retry.',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(mockCtx.executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'courseFaq',
        lessonIndex: 0,
        path: ['faqs', 0, 'questions', 0, 'answer'],
        value: expect.stringContaining('local ZIP first'),
      }),
      expect.objectContaining({ skipSnapshot: true }),
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
    AGENT_TOOLS.edit_deliverables.execute({ actions: [{ type: 'editItem', featureId: 'rubrics' }] }, mockCtx);
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

  it('queues projected course-design edits as blueprint sync instead of direct artifact mutation', () => {
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn(() => ({
      patch: {
        field: 'learningObjectives',
        label: 'learning objectives',
        lessonIndex: 0,
        sectionIndex: 0,
        value: 'Analyze evidence quality.',
        sourceFeatureId: 'lessonPlans',
      },
      editContext: 'learning objectives changed',
    }));

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'lessonPlans',
            lessonIndex: 0,
            path: ['lessonPlans', 0, 'learningObjectives'],
            value: 'Analyze evidence quality.',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 0,
      pending: 1,
      failed: 0,
    });
    expect(result.details[0]).toMatchObject({
      action: 'blueprintPatch',
      featureId: 'lessonPlans',
      lessonIndex: 0,
      success: true,
      pending: true,
      editContext: 'learning objectives changed',
    });
    expect(result.details[0].canonicalPatches[0]).toMatchObject({
      field: 'learningObjectives',
      value: 'Analyze evidence quality.',
    });
    expect(result.canonicalSyncEdits).toHaveLength(1);
    expect(mockCtx.executeAction).not.toHaveBeenCalled();
    expect(mockCtx.snapshot).not.toHaveBeenCalled();
  });

  it('queues ambiguous course-design edits as blueprint patch requests instead of direct artifact mutation', () => {
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn(() => ({
      patchRequest: {
        id: 'request-1',
        sourceFeatureId: 'lessonPlans',
        lessonIndex: 0,
        label: 'course-design edit',
        artifactValue: 'Use a named dataset throughout the lesson.',
      },
      canonicalPatchRequests: [
        {
          id: 'request-1',
          sourceFeatureId: 'lessonPlans',
          lessonIndex: 0,
          label: 'course-design edit',
          artifactValue: 'Use a named dataset throughout the lesson.',
        },
      ],
      editContext: 'custom instruction changed',
    }));

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'lessonPlans',
            lessonIndex: 0,
            path: ['lessonPlans', 0, 'customInstruction'],
            value: 'Use a named dataset throughout the lesson.',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 0,
      pending: 1,
      failed: 0,
    });
    expect(result.details[0]).toMatchObject({
      action: 'blueprintPatchRequest',
      featureId: 'lessonPlans',
      lessonIndex: 0,
      success: true,
      pending: true,
      editContext: 'custom instruction changed',
    });
    expect(result.details[0].canonicalPatchRequests).toHaveLength(1);
    expect(result.canonicalSyncEdits).toHaveLength(1);
    expect(mockCtx.executeAction).not.toHaveBeenCalled();
    expect(mockCtx.snapshot).not.toHaveBeenCalled();
  });

  it('does not silently mutate artifacts when blueprint sync is forced but no mapping exists', () => {
    mockCtx.deliverables.slideDecks = {
      status: 'done',
      data: {
        decks: [{ lessonTitle: 'L1', slides: [{ title: 'Old title', notes: 'Notes' }] }],
      },
    };
    mockCtx.projectDeliverableActionToCanonicalPatch = vi.fn(() => null);

    const result = AGENT_TOOLS.edit_deliverables.execute(
      {
        actions: [
          {
            type: 'editItem',
            featureId: 'slideDecks',
            lessonIndex: 0,
            path: ['decks', 0, 'slides', 0, 'title'],
            value: 'Cleaner title',
            syncPolicy: 'blueprint',
          },
        ],
      },
      mockCtx,
    );

    expect(result).toMatchObject({
      applied: 0,
      pending: 0,
      failed: 1,
    });
    expect(result.details[0]).toMatchObject({
      action: 'blueprintPatch',
      featureId: 'slideDecks',
      success: false,
      syncPolicy: 'blueprint',
    });
    expect(mockCtx.executeAction).not.toHaveBeenCalled();
    expect(mockCtx.snapshot).not.toHaveBeenCalled();
  });
});

describe('Tool execute: generate_slide_images', () => {
  function makeSlideImageCtx(overrides = {}) {
    return {
      ...mockCtx,
      provider: 'openai',
      apiKey: 'sk-test',
      optimisticUpdate: vi.fn(),
      deliverables: {
        ...mockCtx.deliverables,
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonTitle: 'Lesson 1',
                slides: [
                  {
                    title: 'Visual Slide',
                    type: 'content',
                    bullets: ['A', 'B'],
                    visual: {
                      kind: 'image',
                      description: 'Students mapping a course roadmap',
                      altText: 'Students stand near a whiteboard roadmap.',
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      ...overrides,
    };
  }

  it('generates and attaches slide image metadata in one optimistic update', async () => {
    const ctx = makeSlideImageCtx();
    const result = await AGENT_TOOLS.generate_slide_images.execute({ maxImages: 1 }, ctx);

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.modelsUsed).toEqual(['gpt-image-1.5']);
    expect(generateImages).toHaveBeenCalledWith(
      expect.stringContaining('Visual Slide'),
      expect.objectContaining({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-image-2' }),
      undefined,
    );
    expect(ctx.snapshot).toHaveBeenCalledWith('slideDecks', ctx.deliverables.slideDecks.data);
    expect(ctx.optimisticUpdate).toHaveBeenCalledTimes(1);
    const patched = ctx.optimisticUpdate.mock.calls[0][1];
    expect(patched.decks[0].slides[0].visual.generatedImage).toEqual(
      expect.objectContaining({
        url: 'data:image/png;base64,ZmFrZQ==',
        model: 'gpt-image-1.5',
        revisedPrompt: 'revised prompt',
      }),
    );
  });

  it('returns a useful note when no image-ready slides exist', async () => {
    const ctx = makeSlideImageCtx({
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonTitle: 'Lesson 1',
                slides: [{ title: 'Text Only', type: 'content', visual: { kind: 'none' } }],
              },
            ],
          },
        },
      },
    });
    const result = await AGENT_TOOLS.generate_slide_images.execute({}, ctx);

    expect(result.applied).toBe(0);
    expect(result.candidateCount).toBe(0);
    expect(result.note).toContain('No image-ready slides');
    expect(ctx.optimisticUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid slide image mutation args before provider calls or state updates', async () => {
    const invalidCases = [
      { args: { lessonIndex: -1 }, error: 'lessonIndex' },
      { args: { lessonIndex: 1.5 }, error: 'lessonIndex' },
      { args: { maxImages: 0 }, error: 'maxImages' },
      { args: { maxImages: 13 }, error: 'maxImages' },
      { args: { force: 'true' }, error: 'force' },
      { args: { model: 123 }, error: 'model' },
    ];

    for (const invalidCase of invalidCases) {
      const ctx = makeSlideImageCtx();
      generateImages.mockClear();

      const result = await AGENT_TOOLS.generate_slide_images.execute(invalidCase.args, ctx);

      expect(result.error).toContain(invalidCase.error);
      expect(generateImages).not.toHaveBeenCalled();
      expect(ctx.snapshot).not.toHaveBeenCalled();
      expect(ctx.optimisticUpdate).not.toHaveBeenCalled();
    }
  });
});

describe('Tool execute: verify_slide_images', () => {
  it('reports generated image coverage and export-ready data URLs', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonTitle: 'Lesson 1',
                slides: [
                  {
                    title: 'Generated',
                    type: 'content',
                    visual: {
                      kind: 'image',
                      generatedImage: { url: 'data:image/png;base64,abc', model: 'gpt-image-1.5' },
                    },
                  },
                  {
                    title: 'Missing',
                    type: 'content',
                    visual: { kind: 'diagram', description: 'Flow' },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const result = AGENT_TOOLS.verify_slide_images.execute({}, ctx);

    expect(result.imageReadySlides).toBe(2);
    expect(result.generatedSlides).toBe(1);
    expect(result.missingGeneratedImages).toBe(1);
    expect(result.dataUrlImages).toBe(1);
    expect(result.exportReadyImages).toBe(1);
    expect(result.slides[0]).toEqual(
      expect.objectContaining({
        title: 'Generated',
        hasGeneratedImage: true,
        imageStorage: 'dataUrl',
        model: 'gpt-image-1.5',
      }),
    );
  });
});

describe('Tool execute: save_preference', () => {
  it('saves preference to localStorage and returns success', () => {
    const result = AGENT_TOOLS.save_preference.execute({ key: 'blooms_focus', value: 'apply' }, mockCtx);
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

  it('rejects blank preference keys and values before writing', async () => {
    const { saveAgentPrefs } = await import('../cloudStorage');

    expect(AGENT_TOOLS.save_preference.execute({ key: '   ', value: 'formal' }, mockCtx).error).toContain(
      'Preference key',
    );
    expect(AGENT_TOOLS.save_preference.execute({ key: 'style', value: '   ' }, mockCtx).error).toContain(
      'Preference value',
    );
    expect(localStorage.getItem('coursemapper-agent-prefs')).toBeNull();
    expect(saveAgentPrefs).not.toHaveBeenCalled();
  });

  it('returns error on localStorage failure', () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error('quota exceeded');
      },
      setItem() {
        throw new Error('quota exceeded');
      },
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
    AGENT_TOOLS.remember.execute({ content: 'Something', category: 'general' }, mockCtx);
    expect(addMemory).toHaveBeenCalledWith(expect.objectContaining({ importance: 3 }));
  });

  it('passes uid from ctx', async () => {
    const { addMemory } = await import('../agentMemory');
    AGENT_TOOLS.remember.execute({ content: 'Test', category: 'general' }, mockCtx);
    expect(addMemory).toHaveBeenCalledWith(expect.objectContaining({ uid: 'test-user' }));
  });

  it('rejects invalid memory payloads before writing', async () => {
    const { addMemory } = await import('../agentMemory');

    expect(AGENT_TOOLS.remember.execute({ content: '   ', category: 'general' }, mockCtx).error).toContain(
      'Memory content',
    );
    expect(AGENT_TOOLS.remember.execute({ content: 'Use cases', category: 'unknown' }, mockCtx).error).toContain(
      'Invalid memory category',
    );
    expect(
      AGENT_TOOLS.remember.execute({ content: 'Use cases', category: 'general', importance: 6 }, mockCtx).error,
    ).toContain('importance');
    expect(addMemory).not.toHaveBeenCalled();
  });

  it('handles addMemory throwing (dedup detection returns error)', async () => {
    const { addMemory } = await import('../agentMemory');
    addMemory.mockImplementationOnce(() => {
      throw new Error('Storage full');
    });
    const result = AGENT_TOOLS.remember.execute({ content: 'Test', category: 'general' }, mockCtx);
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
    getMemories.mockImplementationOnce(() => {
      throw new Error('Corrupt data');
    });
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

  it('rejects missing memory id before deleting', async () => {
    const { deleteMemory } = await import('../agentMemory');
    const result = AGENT_TOOLS.forget.execute({ id: '   ' }, mockCtx);

    expect(result.error).toContain('Memory id');
    expect(deleteMemory).not.toHaveBeenCalled();
  });

  it('returns error when deleteMemory throws (nonexistent)', async () => {
    const { deleteMemory } = await import('../agentMemory');
    deleteMemory.mockImplementationOnce(() => {
      throw new Error('Memory not found');
    });
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
        quizBank: { status: 'done', data: { quizzes: [{ lt: 'L1', qs: [{ q: 'Q1?', bl: 'Remember' }] }] } },
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lt: 'L1', ob: 'Explain supervised learning', bl: 'Understand' }] },
        },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute({ featureA: 'quizBank', featureB: 'lessonPlans' }, ctx);
    expect(result.lessonsCompared).toBe(1);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].quizBank).toBeDefined();
    expect(result.comparisons[0].lessonPlans).toBeDefined();
    expect(result.comparisons[0].quizBank.questionCount).toBe(1);
  });

  it('returns error for non-existent deliverable', () => {
    const result = AGENT_TOOLS.compare_deliverables.execute({ featureA: 'quizBank', featureB: 'slideDecks' }, mockCtx);
    expect(result.error).toContain('not generated yet');
  });

  it("detects Bloom's level gaps between deliverables", () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              {
                lt: 'L1',
                qs: [
                  { q: 'Q1?', bl: 'Remember' },
                  { q: 'Q2?', bl: 'Apply' },
                ],
              },
            ],
          },
        },
        lessonPlans: { status: 'done', data: { lessonPlans: [{ lt: 'L1', ob: 'Apply concepts', bl: 'Understand' }] } },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute({ featureA: 'quizBank', featureB: 'lessonPlans' }, ctx);
    expect(result.totalGaps).toBeGreaterThan(0);
    // quizBank has Remember+Apply, lessonPlans has only Understand
    // So lessonPlans is missing Remember and Apply
    const gaps = result.comparisons[0].gaps;
    expect(gaps.some((g) => g.includes("Bloom's"))).toBe(true);
  });

  it('compares a single lesson when lessonIndex is provided', () => {
    const ctx = {
      ...mockCtx,
      deliverables: {
        quizBank: {
          status: 'done',
          data: {
            quizzes: [
              { lt: 'L1', qs: [{ q: 'Q1?' }] },
              { lt: 'L2', qs: [{ q: 'Q2?' }] },
            ],
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lt: 'L1', ob: 'Obj1' },
              { lt: 'L2', ob: 'Obj2' },
            ],
          },
        },
      },
    };
    const result = AGENT_TOOLS.compare_deliverables.execute(
      { featureA: 'quizBank', featureB: 'lessonPlans', lessonIndex: 1 },
      ctx,
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
      { featureA: 'quizBank', featureB: 'lessonPlans', lessonIndex: 99 },
      ctx,
    );
    expect(result.error).toContain('out of range');
  });
});

describe('summarizeToolResult: compare_deliverables', () => {
  it('formats comparison summary', () => {
    expect(summarizeToolResult('compare_deliverables', { lessonsCompared: 3, totalGaps: 2 })).toBe(
      '3 lessons compared, 2 gaps',
    );
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
    const undoFn = vi.fn(() => {
      throw new Error('Stack empty');
    });
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
