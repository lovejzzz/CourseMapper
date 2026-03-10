/**
 * Tests for agentMemory.js — uses a mocked localStorage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock cloudStorage to avoid Firebase dependency
vi.mock('../cloudStorage', () => ({
  loadAgentMemories: vi.fn().mockResolvedValue([]),
  saveAgentMemory: vi.fn().mockResolvedValue(),
  deleteAgentMemory: vi.fn().mockResolvedValue(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
  MEMORY_CATEGORIES,
  getMemories,
  getMemoriesByCategory,
  searchMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  touchMemory,
  recordEditPattern,
  buildMemoryContext,
} from '../agentMemory';

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('MEMORY_CATEGORIES', () => {
  it('has all expected categories', () => {
    expect(MEMORY_CATEGORIES).toHaveProperty('teaching_style');
    expect(MEMORY_CATEGORIES).toHaveProperty('assessment');
    expect(MEMORY_CATEGORIES).toHaveProperty('course_design');
    expect(MEMORY_CATEGORIES).toHaveProperty('feedback');
    expect(MEMORY_CATEGORIES).toHaveProperty('institutional');
    expect(MEMORY_CATEGORIES).toHaveProperty('general');
  });
});

describe('addMemory', () => {
  it('creates a memory with generated id', () => {
    const mem = addMemory({ category: 'teaching_style', content: 'Prefers Socratic method' });
    expect(mem.id).toMatch(/^mem_/);
    expect(mem.category).toBe('teaching_style');
    expect(mem.content).toBe('Prefers Socratic method');
    expect(mem.importance).toBe(3);
    expect(mem.accessCount).toBe(0);
  });

  it('deduplicates exact matches and bumps access count', () => {
    addMemory({ category: 'general', content: 'Same content' });
    const updated = addMemory({ category: 'general', content: 'Same content' });
    expect(updated.accessCount).toBe(1);
  });

  it('respects custom importance', () => {
    const mem = addMemory({ category: 'institutional', content: 'ABET accredited', importance: 5 });
    expect(mem.importance).toBe(5);
  });
});

describe('getMemories', () => {
  it('returns empty array when no memories exist', () => {
    expect(getMemories()).toEqual([]);
  });

  it('returns memories sorted by importance (descending)', () => {
    addMemory({ category: 'general', content: 'Low', importance: 1 });
    addMemory({ category: 'general', content: 'High', importance: 5 });
    addMemory({ category: 'general', content: 'Mid', importance: 3 });
    const memories = getMemories();
    expect(memories[0].content).toBe('High');
    expect(memories[2].content).toBe('Low');
  });
});

describe('getMemoriesByCategory', () => {
  it('filters by category', () => {
    addMemory({ category: 'teaching_style', content: 'A' });
    addMemory({ category: 'assessment', content: 'B' });
    addMemory({ category: 'teaching_style', content: 'C' });
    const result = getMemoriesByCategory('teaching_style');
    expect(result).toHaveLength(2);
    expect(result.every(m => m.category === 'teaching_style')).toBe(true);
  });
});

describe('searchMemories', () => {
  it('finds memories by keyword in content', () => {
    addMemory({ category: 'general', content: 'Uses problem-based learning' });
    addMemory({ category: 'general', content: 'Prefers multiple choice quizzes' });
    const results = searchMemories('problem-based');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('problem-based');
  });

  it('is case-insensitive', () => {
    addMemory({ category: 'general', content: 'Socratic Method' });
    expect(searchMemories('socratic')).toHaveLength(1);
  });
});

describe('updateMemory', () => {
  it('updates content and importance', () => {
    const mem = addMemory({ category: 'general', content: 'Original' });
    const updated = updateMemory(mem.id, { content: 'Updated', importance: 5 });
    expect(updated.content).toBe('Updated');
    expect(updated.importance).toBe(5);
  });

  it('returns null for non-existent id', () => {
    expect(updateMemory('nonexistent', { content: 'x' })).toBeNull();
  });
});

describe('deleteMemory', () => {
  it('removes a memory', () => {
    const mem = addMemory({ category: 'general', content: 'To delete' });
    deleteMemory(mem.id);
    expect(getMemories().find(m => m.id === mem.id)).toBeUndefined();
  });
});

describe('touchMemory', () => {
  it('increments access count', () => {
    const mem = addMemory({ category: 'general', content: 'Touched' });
    touchMemory(mem.id);
    touchMemory(mem.id);
    const found = getMemories().find(m => m.id === mem.id);
    expect(found.accessCount).toBe(2);
  });
});

describe('recordEditPattern', () => {
  it('creates a feedback memory', () => {
    const mem = recordEditPattern({ featureId: 'quizBank', field: 'question', action: 'edits' });
    expect(mem.category).toBe('feedback');
    expect(mem.content).toContain('quizBank');
    expect(mem.content).toContain('question');
  });

  it('bumps importance with repeated patterns', () => {
    for (let i = 0; i < 6; i++) {
      recordEditPattern({ featureId: 'rubrics', field: 'criteria', action: 'edits' });
    }
    const memories = getMemories().filter(m => m.meta?.featureId === 'rubrics');
    expect(memories[0].importance).toBe(4); // >= 5 occurrences
  });
});

describe('buildMemoryContext', () => {
  it('returns empty string when no memories', () => {
    expect(buildMemoryContext()).toBe('');
  });

  it('builds formatted context string', () => {
    addMemory({ category: 'teaching_style', content: 'Prefers discussion-based' });
    addMemory({ category: 'assessment', content: 'Likes rubrics with 4 criteria' });
    const context = buildMemoryContext();
    expect(context).toContain('Teaching Style');
    expect(context).toContain('Prefers discussion-based');
    expect(context).toContain('Assessment');
  });

  it('caps output at ~1500 chars', () => {
    for (let i = 0; i < 50; i++) {
      addMemory({ category: 'general', content: `Memory ${i}: ${'A'.repeat(100)}`, importance: 5 });
    }
    const context = buildMemoryContext();
    expect(context.length).toBeLessThanOrEqual(1600); // some buffer
  });
});
