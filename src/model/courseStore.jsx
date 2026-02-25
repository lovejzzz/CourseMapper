/**
 * courseStore.jsx — Minimal React context for deliverables state.
 * Keeps transient deliverable generation results so useDeliverables can
 * read/write them without the full V1.5 refactor being complete.
 *
 * State shape:
 *   deliverables: {
 *     [featureId]: { status: 'idle'|'streaming'|'done'|'error', data: any, error: string|null, stale: bool, staleConfidence: object|null, regeneratingIndex: number|null }
 *   }
 */
import React, { createContext, useReducer } from 'react';

// ── Action creators ────────────────────────────────────────────────────────────

export const actions = {
  setDeliverableStreaming: (featureId) => ({
    type: 'SET_DELIVERABLE_STREAMING', featureId,
  }),
  setDeliverableDone: (featureId, data) => ({
    type: 'SET_DELIVERABLE_DONE', featureId, data,
  }),
  setDeliverableError: (featureId, error) => ({
    type: 'SET_DELIVERABLE_ERROR', featureId, error,
  }),
  resetDeliverables: () => ({
    type: 'RESET_DELIVERABLES',
  }),
  markAllStale: () => ({
    type: 'MARK_ALL_STALE',
  }),
  markFeatureStale: (featureId, staleConfidence = null) => ({
    type: 'MARK_FEATURE_STALE', featureId, staleConfidence,
  }),
  setDeliverable: (featureId, status, data, error, stale) => ({
    type: 'SET_DELIVERABLE', featureId, status, data, error, stale,
  }),
  restoreDeliverables: (deliverables) => ({
    type: 'RESTORE_DELIVERABLES', deliverables,
  }),
};

// ── Reducer ────────────────────────────────────────────────────────────────────

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
    case 'MARK_ALL_STALE': {
      const updated = {};
      for (const [k, v] of Object.entries(state.deliverables)) {
        updated[k] = { ...v, stale: true, staleConfidence: v.staleConfidence || { level: 'high', maxWeight: 1.0, dominantField: '_structural' } };
      }
      return { ...state, deliverables: updated };
    }
    case 'MARK_FEATURE_STALE': {
      const existing = state.deliverables[action.featureId];
      if (!existing) return state;
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: {
            ...existing,
            stale: true,
            staleConfidence: action.staleConfidence || existing.staleConfidence || null,
          },
        },
      };
    }
    case 'SET_DELIVERABLE': {
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: {
            status: action.status,
            data: action.data,
            error: action.error,
            stale: action.stale,
            staleConfidence: action.staleConfidence ?? null,
            regeneratingIndex: action.regeneratingIndex ?? null,
          },
        },
      };
    }
    // Mark a specific lesson as regenerating WITHOUT clearing data or changing status.
    // Prevents the snap-back bug where dispatching existing.data overwrites user edits.
    case 'MARK_LESSON_REGENERATING': {
      const cur = state.deliverables[action.featureId];
      if (!cur) return state;
      return {
        ...state,
        deliverables: {
          ...state.deliverables,
          [action.featureId]: {
            ...cur,
            status: 'streaming',   // show streaming indicator immediately
            stale: false,
            staleConfidence: null,
            error: null,
            regeneratingIndex: action.lessonIndex,
            // data is intentionally NOT changed — preserves user edits
          },
        },
      };
    }
    default:
      return state;
  }
}

// ── Contexts ───────────────────────────────────────────────────────────────────

export const CourseStateContext = createContext(null);
export const CourseDispatchContext = createContext(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function CourseStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { deliverables: {} });
  return (
    <CourseStateContext.Provider value={state}>
      <CourseDispatchContext.Provider value={dispatch}>
        {children}
      </CourseDispatchContext.Provider>
    </CourseStateContext.Provider>
  );
}
