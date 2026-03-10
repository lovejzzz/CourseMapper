import { describe, it, expect } from 'vitest';
import { extractEditContext } from '../editContextExtractor';

describe('extractEditContext', () => {
  // ── Null / invalid input ──
  it('returns null for null/undefined inputs', () => {
    expect(extractEditContext(null, {}, ['a', 0])).toBeNull();
    expect(extractEditContext({}, null, ['a', 0])).toBeNull();
    expect(extractEditContext({}, {}, null)).toBeNull();
    expect(extractEditContext({}, {}, [])).toBeNull();
    expect(extractEditContext({}, {}, ['a'])).toBeNull();  // path < 2
  });

  // ── Primitive diffs ──
  it('describes a simple string change', () => {
    const oldData = { lessonPlans: [{ title: 'Introduction' }] };
    const newData = { lessonPlans: [{ title: 'Advanced Introduction' }] };
    const result = extractEditContext(oldData, newData, ['lessonPlans', 0, 'title']);
    expect(result).toContain('title');
    expect(result).toContain('Introduction');
    expect(result).toContain('Advanced Introduction');
    expect(result).toContain('→');
  });

  it('returns null when nothing changed', () => {
    const data = { lessonPlans: [{ title: 'Same' }] };
    const result = extractEditContext(data, data, ['lessonPlans', 0, 'title']);
    expect(result).toBeNull();
  });

  // ── Array diffs ──
  it('describes item addition in an array', () => {
    const oldData = { quizBank: [{ questions: ['Q1', 'Q2'] }] };
    const newData = { quizBank: [{ questions: ['Q1', 'Q2', 'Q3'] }] };
    const result = extractEditContext(oldData, newData, ['quizBank', 0, 'questions']);
    expect(result).toContain('added');
    expect(result).toContain('1');
  });

  it('describes item removal from an array', () => {
    const oldData = { slides: [{ bullets: ['A', 'B', 'C'] }] };
    const newData = { slides: [{ bullets: ['A', 'B'] }] };
    const result = extractEditContext(oldData, newData, ['slides', 0, 'bullets']);
    expect(result).toContain('removed');
    expect(result).toContain('1');
  });

  it('describes array reorder', () => {
    const oldData = { plans: [{ items: ['A', 'B', 'C'] }] };
    const newData = { plans: [{ items: ['C', 'A', 'B'] }] };
    const result = extractEditContext(oldData, newData, ['plans', 0, 'items']);
    expect(result).toContain('reordered');
  });

  // ── Object diffs ──
  it('describes a nested object change', () => {
    const oldData = { plans: [{ warmUp: { type: 'poll', prompt: 'Old question' } }] };
    const newData = { plans: [{ warmUp: { type: 'poll', prompt: 'New question' } }] };
    const result = extractEditContext(oldData, newData, ['plans', 0, 'warmUp']);
    expect(result).toContain('prompt');
    expect(result).toContain('Old question');
    expect(result).toContain('New question');
  });

  // ── Path label generation ──
  it('generates readable labels from camelCase paths', () => {
    const oldData = { guides: [{ learningObjectives: 'old' }] };
    const newData = { guides: [{ learningObjectives: 'new' }] };
    const result = extractEditContext(oldData, newData, ['guides', 0, 'learningObjectives']);
    expect(result).toContain('learning');
    expect(result).toContain('Objectives');
  });

  // ── Truncation ──
  it('truncates long values', () => {
    const longText = 'A'.repeat(200);
    const oldData = { plans: [{ description: 'short' }] };
    const newData = { plans: [{ description: longText }] };
    const result = extractEditContext(oldData, newData, ['plans', 0, 'description']);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});
