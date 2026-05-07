/**
 * Tests for chatPersistence.js — conversation save/load/search.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import {
  listConversations,
  saveConversation,
  loadConversation,
  deleteConversation,
  searchConversations,
  newConversationId,
} from '../chatPersistence';

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

describe('newConversationId', () => {
  it('generates unique IDs with conv_ prefix', () => {
    const id1 = newConversationId();
    const id2 = newConversationId();
    expect(id1).toMatch(/^conv_/);
    expect(id2).toMatch(/^conv_/);
    expect(id1).not.toBe(id2);
  });
});

describe('saveConversation + loadConversation', () => {
  it('saves and loads a conversation', () => {
    const messages = [
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: 'Hi there!' },
    ];
    saveConversation('test-1', messages, 'Test Chat');
    const loaded = loadConversation('test-1');
    expect(loaded).toEqual(messages);
  });

  it('strips API keys before saving messages', () => {
    const messages = [
      { role: 'user', text: 'Generate images' },
      {
        role: 'imageSearch',
        apiKey: 'sk-secret-should-not-persist',
        imageSearch: { query: 'cells', accessToken: 'token-secret' },
      },
    ];

    saveConversation('test-secret', messages, 'Secret Test');

    const raw = localStorage.getItem('coursemapper-conversations:test-secret');
    expect(raw).not.toContain('sk-secret-should-not-persist');
    expect(raw).not.toContain('token-secret');
    expect(loadConversation('test-secret')).toEqual([
      { role: 'user', text: 'Generate images' },
      { role: 'imageSearch', imageSearch: { query: 'cells' } },
    ]);
  });

  it('sanitizes older saved conversations while loading them', () => {
    localStorage.setItem(
      'coursemapper-conversations:old-secret',
      JSON.stringify([{ role: 'imageSearch', apiKey: 'sk-old-secret', imageSearch: { query: 'loops' } }]),
    );

    const loaded = loadConversation('old-secret');

    expect(loaded).toEqual([{ role: 'imageSearch', imageSearch: { query: 'loops' } }]);
    expect(localStorage.getItem('coursemapper-conversations:old-secret')).not.toContain('sk-old-secret');
  });

  it('auto-generates title from first user message', () => {
    const messages = [{ role: 'user', text: 'Add a quiz about regression' }];
    saveConversation('test-2', messages);
    const convs = listConversations();
    expect(convs[0].title).toBe('Add a quiz about regression');
  });

  it('updates existing conversation', () => {
    saveConversation('test-3', [{ role: 'user', text: 'v1' }], 'First');
    saveConversation(
      'test-3',
      [
        { role: 'user', text: 'v1' },
        { role: 'assistant', text: 'v2' },
      ],
      'Updated',
    );
    const convs = listConversations();
    expect(convs.filter((c) => c.id === 'test-3')).toHaveLength(1);
    expect(convs.find((c) => c.id === 'test-3').title).toBe('Updated');
    expect(convs.find((c) => c.id === 'test-3').messageCount).toBe(2);
  });

  it('returns null for non-existent conversation', () => {
    expect(loadConversation('nonexistent')).toBeNull();
  });
});

describe('listConversations', () => {
  it('returns empty array when no conversations', () => {
    expect(listConversations()).toEqual([]);
  });

  it('returns conversations sorted by most recent', () => {
    saveConversation('old', [{ role: 'user', text: 'Old' }], 'Old');
    // Small delay to ensure different timestamps
    saveConversation('new', [{ role: 'user', text: 'New' }], 'New');
    const convs = listConversations();
    expect(convs[0].id).toBe('new');
  });
});

describe('deleteConversation', () => {
  it('removes a conversation', () => {
    saveConversation('del-1', [{ role: 'user', text: 'Delete me' }], 'To Delete');
    deleteConversation('del-1');
    expect(listConversations().find((c) => c.id === 'del-1')).toBeUndefined();
    expect(loadConversation('del-1')).toBeNull();
  });
});

describe('searchConversations', () => {
  it('finds conversations by title keyword', () => {
    saveConversation('s-1', [{ role: 'user', text: 'something' }], 'Machine Learning Quiz');
    saveConversation('s-2', [{ role: 'user', text: 'other' }], 'Biology Assignment');
    const results = searchConversations('machine');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s-1');
  });

  it('finds conversations by message content', () => {
    saveConversation('s-3', [{ role: 'user', text: 'Add regression questions' }], 'Chat');
    const results = searchConversations('regression');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for short queries', () => {
    expect(searchConversations('a')).toEqual([]);
    expect(searchConversations('')).toEqual([]);
  });

  it('is case-insensitive', () => {
    saveConversation('s-4', [{ role: 'user', text: 'test' }], 'BLOOM taxonomy');
    expect(searchConversations('bloom')).toHaveLength(1);
  });
});
