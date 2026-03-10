/**
 * Tests for classifyRequestComplexity from agentTools.js
 */
import { describe, it, expect } from 'vitest';
import { classifyRequestComplexity } from '../agentTools';

const doneDeliverables = {
  lessonPlans: { status: 'done' },
  slideDecks: { status: 'done' },
  quizBank: { status: 'done' },
  rubrics: { status: 'done' },
};

describe('classifyRequestComplexity', () => {
  it('classifies typo fixes as simple', () => {
    expect(classifyRequestComplexity('Fix the typo in lesson 3', {})).toBe('simple');
  });

  it('classifies rename as simple', () => {
    expect(classifyRequestComplexity('Rename lesson 1', {})).toBe('simple');
  });

  it('classifies "what is" questions as simple', () => {
    expect(classifyRequestComplexity("What is Bloom's taxonomy?", {})).toBe('simple');
  });

  it('classifies bulk operations as complex', () => {
    expect(classifyRequestComplexity('Rewrite all quizzes to be harder', doneDeliverables)).toBe('complex');
  });

  it('classifies course review as complex', () => {
    expect(classifyRequestComplexity('Review my course for alignment issues', doneDeliverables)).toBe('complex');
  });

  it('classifies redesign as complex', () => {
    expect(classifyRequestComplexity('Redesign the rubrics for project-based learning', doneDeliverables)).toBe('complex');
  });

  it('classifies moderate requests correctly', () => {
    expect(classifyRequestComplexity('Add a discussion prompt about ethics in AI', {})).toBe('moderate');
  });

  it('classifies long requests with many deliverables as complex', () => {
    const longText = 'I need you to update the learning objectives across all lessons to better align with the program outcomes. Also update the assessments to match the new objectives and make sure the rubrics reflect the changes too. ' + 'x'.repeat(200);
    expect(classifyRequestComplexity(longText, doneDeliverables)).toBe('complex');
  });

  it('handles null/empty text', () => {
    expect(classifyRequestComplexity('', {})).toBe('moderate');
    expect(classifyRequestComplexity(null, {})).toBe('moderate');
  });

  it('handles null deliverables', () => {
    expect(classifyRequestComplexity('Fix typo', null)).toBe('simple');
  });
});
