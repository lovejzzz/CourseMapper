/**
 * Tests for exporter utility functions: resolveFeatureLabel, FEATURE_LABELS.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveFeatureLabel, FEATURE_LABELS } from '../exporters/exporterUtils';

// Mock the custom deliverable library to avoid side effects
vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => {
    if (id === 'custom_peerReview') return { name: 'Peer Review Rubric' };
    return null;
  }),
}));

// ═════════════════════════════════════════════════════════════════════════════
// FEATURE_LABELS constant
// ═════════════════════════════════════════════════════════════════════════════

describe('FEATURE_LABELS', () => {
  it('contains all built-in deliverable types', () => {
    const expectedKeys = [
      'courseMap', 'lessonPlans', 'rubrics', 'slideDecks', 'quizBank',
      'discussions', 'assignments', 'studyGuides', 'syllabus', 'courseFaq',
    ];
    for (const key of expectedKeys) {
      expect(FEATURE_LABELS[key]).toBeDefined();
      expect(typeof FEATURE_LABELS[key]).toBe('string');
    }
  });

  it('has human-readable labels (no camelCase)', () => {
    for (const label of Object.values(FEATURE_LABELS)) {
      // Should have at least one space (multi-word) or be a single word without camelCase
      expect(label).toMatch(/^[A-Z][a-z &]+(?:\s[A-Za-z&]+)*$/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// resolveFeatureLabel
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveFeatureLabel', () => {
  it('returns label for known feature IDs', () => {
    expect(resolveFeatureLabel('courseMap')).toBe('Course Map');
    expect(resolveFeatureLabel('quizBank')).toBe('Quiz & Exam Bank');
    expect(resolveFeatureLabel('lessonPlans')).toBe('Lesson Plans');
    expect(resolveFeatureLabel('syllabus')).toBe('Syllabus');
    expect(resolveFeatureLabel('courseFaq')).toBe('Course FAQ');
  });

  it('returns custom deliverable name for custom_ prefixed IDs', () => {
    expect(resolveFeatureLabel('custom_peerReview')).toBe('Peer Review Rubric');
  });

  it('falls back to title-cased split for unknown IDs', () => {
    const result = resolveFeatureLabel('myCustomThing');
    // camelCase should be split: "My Custom Thing"
    expect(result).toBe('My Custom Thing');
  });

  it('falls back to title-cased split for unknown custom_ IDs not in library', () => {
    const result = resolveFeatureLabel('custom_unknownWidget');
    // Not in mock, so falls through to the regex fallback
    expect(result).toBe('Custom_unknown Widget');
  });
});
