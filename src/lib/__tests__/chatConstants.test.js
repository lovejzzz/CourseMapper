/**
 * Tests for chat routing pure functions from constants.js:
 * getChatOpener, resolveLabel, FEATURE_LABELS, STEPS.
 *
 * These functions are called by useChatRouter but are pure logic
 * that can be tested without React hooks.
 */
import { describe, it, expect, vi } from 'vitest';
import { getChatOpener, resolveLabel, FEATURE_LABELS, STEPS } from '../../components/chat/constants';

// Mock dependencies to isolate pure logic
vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => {
    if (id === 'custom_peerReview') return { name: 'Peer Review' };
    return null;
  }),
}));

vi.mock('../pedagogicalValidator', () => ({
  generateCourseHealthReport: vi.fn(() => ({
    findings: [{ suggestedPrompt: "Review Bloom's alignment for Lesson 3", severity: 'warning' }],
  })),
}));

vi.mock('../syncDependencies', () => ({
  getArrayKey: vi.fn(() => null),
}));

// ── Test fixtures ────────────────────────────────────────────────────────────

const makeCourseMap = (lessonCount = 3) => ({
  courseName: 'Intro to AI',
  semester: 'Fall 2026',
  lessons: Array.from({ length: lessonCount }, (_, i) => ({
    title: `Lesson ${i + 1}: Topic ${String.fromCharCode(65 + i)}`,
    sections: [
      {
        learningObjectives: i === 0 ? '' : `Objective for lesson ${i + 1} with enough content`,
        topicSection: `Topic ${i + 1}`,
      },
    ],
  })),
});

const makeDoneDeliverables = () => ({
  quizBank: { status: 'done', data: { quizzes: [] } },
  lessonPlans: { status: 'done', data: { lessonPlans: [] } },
  slideDecks: { status: 'done', data: { decks: [] } },
});

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE_LABELS
// ═════════════════════════════════════════════════════════════════════════════

describe('FEATURE_LABELS', () => {
  it('contains all built-in feature IDs', () => {
    const expectedKeys = [
      'lessonPlans',
      'slideDecks',
      'rubrics',
      'quizBank',
      'discussions',
      'assignments',
      'studyGuides',
      'syllabus',
      'courseFaq',
    ];
    for (const key of expectedKeys) {
      expect(FEATURE_LABELS[key]).toBeDefined();
      expect(typeof FEATURE_LABELS[key]).toBe('string');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STEPS
// ═════════════════════════════════════════════════════════════════════════════

describe('STEPS', () => {
  it('is an array of step objects with key and label', () => {
    expect(Array.isArray(STEPS)).toBe(true);
    for (const step of STEPS) {
      expect(typeof step.key).toBe('string');
      expect(typeof step.label).toBe('string');
    }
  });

  it('includes parsing, generating, and done steps', () => {
    const keys = STEPS.map((s) => s.key);
    expect(keys).toContain('parsing');
    expect(keys).toContain('generating');
    expect(keys).toContain('done');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveLabel
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveLabel', () => {
  it('returns label for known feature IDs', () => {
    expect(resolveLabel('quizBank')).toBe('Quiz & Exam Bank');
    expect(resolveLabel('lessonPlans')).toBe('Lesson Plans');
    expect(resolveLabel('syllabus')).toBe('Syllabus');
  });

  it('returns custom deliverable name for custom_ IDs', () => {
    expect(resolveLabel('custom_peerReview')).toBe('Peer Review');
  });

  it('returns "Custom Deliverable" for unknown custom_ IDs', () => {
    expect(resolveLabel('custom_unknown')).toBe('Custom Deliverable');
  });

  it('returns the raw ID for completely unknown IDs', () => {
    expect(resolveLabel('somethingRandom')).toBe('somethingRandom');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getChatOpener — Tier 1: No course map
// ═════════════════════════════════════════════════════════════════════════════

describe('getChatOpener — Tier 1 (no course map)', () => {
  it('returns onboarding greeting and starters', () => {
    const result = getChatOpener(null, false, null);
    expect(result.greeting).toContain('teaching assistant');
    expect(result.starters.length).toBeGreaterThanOrEqual(2);
  });

  it('includes "How do I get started?" starter', () => {
    const result = getChatOpener(null, false, null);
    const texts = result.starters.map((s) => s.text);
    expect(texts).toContain('How do I get started?');
  });

  it('includes starters about deliverables and API keys', () => {
    const result = getChatOpener(null, false, null);
    const texts = result.starters.map((s) => s.text);
    expect(texts.some((t) => t.includes('deliverables'))).toBe(true);
    expect(texts.some((t) => t.includes('API key'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getChatOpener — Tier 2: Course map exists, no deliverables
// ═════════════════════════════════════════════════════════════════════════════

describe('getChatOpener — Tier 2 (course map, no deliverables)', () => {
  it('includes course name and lesson count in greeting', () => {
    const cm = makeCourseMap(5);
    const result = getChatOpener(cm, false, null);
    expect(result.greeting).toContain('Intro to AI');
    expect(result.greeting).toContain('5 lessons');
  });

  it('uses singular "lesson" for 1 lesson', () => {
    const cm = makeCourseMap(1);
    const result = getChatOpener(cm, false, null);
    expect(result.greeting).toContain('1 lesson');
    expect(result.greeting).not.toContain('1 lessons');
  });

  it('returns up to 2 starters', () => {
    const cm = makeCourseMap(5);
    const result = getChatOpener(cm, false, null);
    expect(result.starters.length).toBeLessThanOrEqual(2);
    expect(result.starters.length).toBeGreaterThan(0);
  });

  it('suggests reviewing the weakest lesson', () => {
    const cm = makeCourseMap(3);
    // Lesson 1 has empty objectives (weakest)
    const result = getChatOpener(cm, false, null);
    const texts = result.starters.map((s) => s.text);
    expect(texts.some((t) => t.includes('Review') && t.includes('gaps'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getChatOpener — Tier 3: Agent mode
// ═════════════════════════════════════════════════════════════════════════════

describe('getChatOpener — Tier 3 (agent mode)', () => {
  it('shows agent greeting', () => {
    const cm = makeCourseMap();
    const result = getChatOpener(cm, true, 'quizBank', makeDoneDeliverables());
    expect(result.greeting).toContain('finish, fix, and verify your course materials');
  });

  it('returns up to 2 starters', () => {
    const cm = makeCourseMap();
    const result = getChatOpener(cm, true, 'quizBank', makeDoneDeliverables());
    expect(result.starters.length).toBeLessThanOrEqual(2);
  });

  it('provides tab-specific starters for quizBank', () => {
    const cm = makeCourseMap();
    const deliverables = makeDoneDeliverables();
    const result = getChatOpener(cm, true, 'quizBank', deliverables);
    const texts = result.starters.map((s) => s.text);
    expect(texts.some((t) => t.toLowerCase().includes('quiz'))).toBe(true);
  });

  it('keeps the second starter relevant to the active deliverable tab', () => {
    const cm = makeCourseMap();
    const deliverables = makeDoneDeliverables();
    const result = getChatOpener(cm, true, 'slideDecks', deliverables);
    const texts = result.starters.map((s) => s.text);

    expect(texts).toContain('Audit slide speaker notes and activities');
    expect(texts.join(' ')).not.toContain("Review Bloom's alignment");
  });

  it('provides tab-specific starters for discussions', () => {
    const cm = makeCourseMap();
    const deliverables = { ...makeDoneDeliverables(), discussions: { status: 'done', data: { discussions: [] } } };
    const result = getChatOpener(cm, true, 'discussions', deliverables);
    const texts = result.starters.map((s) => s.text);
    expect(texts.some((t) => t.toLowerCase().includes('discussion'))).toBe(true);
  });

  it('provides course map tab starters for "courseMap" activeTab', () => {
    const cm = makeCourseMap();
    const result = getChatOpener(cm, true, 'courseMap', makeDoneDeliverables());
    const texts = result.starters.map((s) => s.text);
    expect(texts.some((t) => t.includes('Review') || t.includes('gaps'))).toBe(true);
  });

  it('uses custom deliverable names in agent starters', () => {
    const cm = makeCourseMap();
    const deliverables = {
      ...makeDoneDeliverables(),
      custom_peerReview: { status: 'done', data: { peerReviews: [] } },
    };
    const result = getChatOpener(cm, true, 'custom_peerReview', deliverables);
    const texts = result.starters.map((s) => s.text);

    expect(texts).toContain('Review Peer Review for completeness');
    expect(texts.join(' ')).not.toContain('custom_peerReview');
  });

  it('shows configure action instead of edit starters when agent provider is unavailable', () => {
    const cm = makeCourseMap();
    const result = getChatOpener(cm, true, 'quizBank', makeDoneDeliverables(), false, false, false);

    expect(result.greeting).toContain('Configure AI');
    expect(result.starters).toEqual([
      expect.objectContaining({
        text: 'Configure AI to use agent',
        action: 'configure-ai',
      }),
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// getChatOpener — Generation in progress
// ═════════════════════════════════════════════════════════════════════════════

describe('getChatOpener — generation in progress', () => {
  it('returns generating message with no starters when course map generating', () => {
    const result = getChatOpener(null, false, null, null, true, false);
    expect(result.greeting).toContain('Generating your course map');
    expect(result.starters).toHaveLength(0);
  });

  it('returns deliverable generating message with no starters', () => {
    const cm = makeCourseMap();
    const result = getChatOpener(cm, true, 'quizBank', null, false, true);
    expect(result.greeting).toContain('Generating your deliverables');
    expect(result.starters).toHaveLength(0);
  });

  it('prioritizes isGenerating over isDelivGenerating', () => {
    const result = getChatOpener(null, false, null, null, true, true);
    expect(result.greeting).toContain('course map');
  });
});
