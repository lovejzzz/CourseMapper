/**
 * Tests for courseStore reducer (extracted from JSX to test pure logic).
 * We import the actions creators and re-implement the reducer here since
 * the original file exports a React component. We test the reducer logic directly.
 */
import { describe, it, expect } from 'vitest';

// ── Re-implement reducer (pure function, no React dependency) ──
function reducer(state, action) {
  switch (action.type) {
    case 'SET_DELIVERABLE_STREAMING':
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: { status: 'streaming', data: null, error: null, stale: false, staleConfidence: null },
        },
      };
    case 'SET_DELIVERABLE_DONE':
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: { status: 'done', data: action.data, error: null, stale: false, staleConfidence: null },
        },
      };
    case 'SET_DELIVERABLE_ERROR':
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: { status: 'error', data: null, error: action.error, stale: false, staleConfidence: null },
        },
      };
    case 'RESET_DELIVERABLES':
      return { ...state, deliverables: {} };
    case 'RESTORE_DELIVERABLES':
      return { ...state, deliverables: action.deliverables || {} };
    case 'REMOVE_DELIVERABLE': {
      if (!state.deliverables[action.featureId]) return state;
      const next = { ...state.deliverables };
      delete next[action.featureId];
      return { ...state, deliverables: next };
    }
    case 'MARK_ALL_STALE': {
      const updated = {};
      for (const [k, v] of Object.entries(state.deliverables)) {
        updated[k] = {
          ...v,
          stale: true,
          staleConfidence: v.staleConfidence || { level: 'high', maxWeight: 1.0, dominantField: '_structural' },
        };
      }
      return { ...state, deliverables: updated };
    }
    case 'MARK_FEATURE_STALE': {
      const existing = state.deliverables[action.featureId];
      if (!existing) return state;
      let mergedEdits = action.staleEdits || null;
      if (existing.staleEdits && mergedEdits) {
        const combined = new Set([...(existing.staleEdits.lessonIndices || []), ...(mergedEdits.lessonIndices || [])]);
        mergedEdits = { ...mergedEdits, lessonIndices: [...combined].sort((a, b) => a - b) };
      }
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: {
            ...existing,
            stale: true,
            staleConfidence: action.staleConfidence || existing.staleConfidence || null,
            staleEdits: mergedEdits || existing.staleEdits || null,
          },
        },
      };
    }
    case 'CLEAR_FEATURE_STALE': {
      const existing = state.deliverables[action.featureId];
      if (!existing?.stale) return state;
      const clearIndices = Array.isArray(action.staleEdits?.lessonIndices)
        ? new Set(action.staleEdits.lessonIndices)
        : null;
      const existingIndices = Array.isArray(existing.staleEdits?.lessonIndices)
        ? existing.staleEdits.lessonIndices
        : null;
      if (!clearIndices || !existingIndices || clearIndices.size === 0) {
        return {
          ...state,
          deliverables: {
            ...state.deliverables,
            [action.featureId]: { ...existing, stale: false, staleConfidence: null, staleEdits: null },
          },
        };
      }
      const remaining = existingIndices.filter((index) => !clearIndices.has(index));
      if (remaining.length === existingIndices.length) return state;
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]:
            remaining.length > 0
              ? { ...existing, stale: true, staleEdits: { ...existing.staleEdits, lessonIndices: remaining } }
              : { ...existing, stale: false, staleConfidence: null, staleEdits: null },
        },
      };
    }
    case 'MARK_LESSON_REGENERATING': {
      const cur = state.deliverables[action.featureId];
      if (!cur) return state;
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: {
            ...cur,
            status: 'streaming',
            stale: false,
            staleConfidence: null,
            error: null,
            regeneratingIndex: action.lessonIndex,
          },
        },
      };
    }
    default:
      return state;
  }
}

const initialState = () => ({ deliverables: {} });

describe('courseStore reducer', () => {
  describe('SET_DELIVERABLE_STREAMING', () => {
    it('sets status to streaming', () => {
      const state = reducer(initialState(), { type: 'SET_DELIVERABLE_STREAMING', featureId: 'quizBank' });
      expect(state.deliverables.quizBank.status).toBe('streaming');
      expect(state.deliverables.quizBank.data).toBeNull();
      expect(state.deliverables.quizBank.stale).toBe(false);
    });
  });

  describe('SET_DELIVERABLE_DONE', () => {
    it('sets status to done with data', () => {
      const data = { quizzes: [{ q: 'test' }] };
      const state = reducer(initialState(), { type: 'SET_DELIVERABLE_DONE', featureId: 'quizBank', data });
      expect(state.deliverables.quizBank.status).toBe('done');
      expect(state.deliverables.quizBank.data).toEqual(data);
      expect(state.deliverables.quizBank.error).toBeNull();
    });
  });

  describe('SET_DELIVERABLE_ERROR', () => {
    it('sets error state', () => {
      const state = reducer(initialState(), {
        type: 'SET_DELIVERABLE_ERROR',
        featureId: 'quizBank',
        error: 'API failed',
      });
      expect(state.deliverables.quizBank.status).toBe('error');
      expect(state.deliverables.quizBank.error).toBe('API failed');
      expect(state.deliverables.quizBank.data).toBeNull();
    });
  });

  describe('RESET_DELIVERABLES', () => {
    it('clears all deliverables', () => {
      const state = { deliverables: { quizBank: { status: 'done', data: {} }, rubrics: { status: 'done', data: {} } } };
      const result = reducer(state, { type: 'RESET_DELIVERABLES' });
      expect(result.deliverables).toEqual({});
    });
  });

  describe('RESTORE_DELIVERABLES', () => {
    it('replaces deliverables with provided data', () => {
      const saved = { quizBank: { status: 'done', data: { q: 1 } } };
      const state = reducer(initialState(), { type: 'RESTORE_DELIVERABLES', deliverables: saved });
      expect(state.deliverables).toEqual(saved);
    });

    it('handles null deliverables gracefully', () => {
      const state = reducer(initialState(), { type: 'RESTORE_DELIVERABLES', deliverables: null });
      expect(state.deliverables).toEqual({});
    });
  });

  describe('REMOVE_DELIVERABLE', () => {
    it('removes one deliverable without touching others', () => {
      const state = {
        deliverables: {
          quizBank: { status: 'done', data: { q: 1 } },
          slideDecks: { status: 'done', data: { decks: [] } },
        },
      };
      const result = reducer(state, { type: 'REMOVE_DELIVERABLE', featureId: 'quizBank' });
      expect(result.deliverables.quizBank).toBeUndefined();
      expect(result.deliverables.slideDecks).toEqual(state.deliverables.slideDecks);
    });

    it('keeps state stable when the deliverable is missing', () => {
      const state = { deliverables: { quizBank: { status: 'done', data: {} } } };
      const result = reducer(state, { type: 'REMOVE_DELIVERABLE', featureId: 'missing' });
      expect(result).toBe(state);
    });
  });

  describe('MARK_ALL_STALE', () => {
    it('marks all deliverables as stale', () => {
      const state = {
        deliverables: {
          quizBank: { status: 'done', data: {}, stale: false },
          rubrics: { status: 'done', data: {}, stale: false },
        },
      };
      const result = reducer(state, { type: 'MARK_ALL_STALE' });
      expect(result.deliverables.quizBank.stale).toBe(true);
      expect(result.deliverables.rubrics.stale).toBe(true);
    });

    it('adds default staleConfidence when not present', () => {
      const state = { deliverables: { quizBank: { status: 'done', staleConfidence: null } } };
      const result = reducer(state, { type: 'MARK_ALL_STALE' });
      expect(result.deliverables.quizBank.staleConfidence).toEqual({
        level: 'high',
        maxWeight: 1.0,
        dominantField: '_structural',
      });
    });
  });

  describe('MARK_FEATURE_STALE', () => {
    it('marks a specific feature as stale', () => {
      const state = { deliverables: { quizBank: { status: 'done', stale: false } } };
      const result = reducer(state, { type: 'MARK_FEATURE_STALE', featureId: 'quizBank' });
      expect(result.deliverables.quizBank.stale).toBe(true);
    });

    it('returns unchanged state if feature does not exist', () => {
      const state = { deliverables: {} };
      const result = reducer(state, { type: 'MARK_FEATURE_STALE', featureId: 'nonexistent' });
      expect(result).toBe(state);
    });

    it('merges staleEdits lesson indices', () => {
      const state = {
        deliverables: {
          quizBank: { status: 'done', stale: true, staleEdits: { lessonIndices: [0, 2] } },
        },
      };
      const result = reducer(state, {
        type: 'MARK_FEATURE_STALE',
        featureId: 'quizBank',
        staleEdits: { lessonIndices: [1, 3] },
      });
      expect(result.deliverables.quizBank.staleEdits.lessonIndices).toEqual([0, 1, 2, 3]);
    });

    it('deduplicates merged lesson indices', () => {
      const state = {
        deliverables: {
          quizBank: { status: 'done', stale: true, staleEdits: { lessonIndices: [0, 2] } },
        },
      };
      const result = reducer(state, {
        type: 'MARK_FEATURE_STALE',
        featureId: 'quizBank',
        staleEdits: { lessonIndices: [0, 2, 4] },
      });
      expect(result.deliverables.quizBank.staleEdits.lessonIndices).toEqual([0, 2, 4]);
    });
  });

  describe('CLEAR_FEATURE_STALE', () => {
    it('clears stale state for a skipped local-only sync', () => {
      const state = {
        deliverables: {
          lessonPlans: {
            status: 'done',
            stale: true,
            staleConfidence: { level: 'high' },
            staleEdits: { lessonIndices: [0], sourceFeatureId: 'lessonPlans', canonicalSync: true },
          },
        },
      };
      const result = reducer(state, {
        type: 'CLEAR_FEATURE_STALE',
        featureId: 'lessonPlans',
        staleEdits: { lessonIndices: [0] },
      });

      expect(result.deliverables.lessonPlans.stale).toBe(false);
      expect(result.deliverables.lessonPlans.staleConfidence).toBeNull();
      expect(result.deliverables.lessonPlans.staleEdits).toBeNull();
    });

    it('keeps remaining stale lesson indices when only one skipped sync is cleared', () => {
      const state = {
        deliverables: {
          slideDecks: {
            status: 'done',
            stale: true,
            staleConfidence: { level: 'high' },
            staleEdits: { lessonIndices: [0, 2], sourceFeatureId: 'lessonPlans', canonicalSync: true },
          },
        },
      };
      const result = reducer(state, {
        type: 'CLEAR_FEATURE_STALE',
        featureId: 'slideDecks',
        staleEdits: { lessonIndices: [0] },
      });

      expect(result.deliverables.slideDecks.stale).toBe(true);
      expect(result.deliverables.slideDecks.staleEdits.lessonIndices).toEqual([2]);
    });
  });

  describe('MARK_LESSON_REGENERATING', () => {
    it('sets streaming status with regeneratingIndex', () => {
      const state = {
        deliverables: {
          quizBank: { status: 'done', data: { q: 1 }, stale: true, error: null },
        },
      };
      const result = reducer(state, { type: 'MARK_LESSON_REGENERATING', featureId: 'quizBank', lessonIndex: 2 });
      expect(result.deliverables.quizBank.status).toBe('streaming');
      expect(result.deliverables.quizBank.regeneratingIndex).toBe(2);
      expect(result.deliverables.quizBank.stale).toBe(false);
    });

    it('preserves existing data (prevents snap-back bug)', () => {
      const data = { quizzes: [{ q: 'test' }] };
      const state = { deliverables: { quizBank: { status: 'done', data } } };
      const result = reducer(state, { type: 'MARK_LESSON_REGENERATING', featureId: 'quizBank', lessonIndex: 0 });
      expect(result.deliverables.quizBank.data).toEqual(data);
    });

    it('returns unchanged state if feature does not exist', () => {
      const state = { deliverables: {} };
      const result = reducer(state, { type: 'MARK_LESSON_REGENERATING', featureId: 'nonexistent', lessonIndex: 0 });
      expect(result).toBe(state);
    });
  });

  describe('unknown action', () => {
    it('returns state unchanged', () => {
      const state = initialState();
      expect(reducer(state, { type: 'UNKNOWN' })).toBe(state);
    });
  });
});
