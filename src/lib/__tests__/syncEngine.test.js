/**
 * Extended tests for the sync engine — buildSyncPlan, getAffectedFeatures,
 * computeStaleConfidence, getOutboundTargets, and full edit→plan scenarios.
 *
 * Note: syncDependencies.test.js already has 25 tests. This file covers
 * the edit→sync flow: multi-field edits, structural changes, deliverable
 * body edits, priority ordering, and cascading.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSyncPlan,
  getAffectedFeatures,
  computeStaleConfidence,
  getOutboundTargets,
  getArrayKey,
  DELIVERABLE_OUTBOUND_MAP,
  FIELD_WEIGHT,
} from '../syncDependencies';

// ── Fixtures ──

const ALL_FEATURES = ['courseMap', 'lessonPlans', 'slideDecks', 'rubrics', 'quizBank', 'discussions', 'assignments', 'studyGuides'];

const makeDoneDeliverables = (features = ['lessonPlans', 'slideDecks', 'rubrics', 'quizBank', 'discussions', 'assignments', 'studyGuides']) => {
  const d = {};
  for (const f of features) d[f] = { status: 'done', data: {} };
  return d;
};

// ── getAffectedFeatures — extended scenarios ──

describe('getAffectedFeatures — edit→feature mapping', () => {
  it('learningObjectives affects content + assessment deliverables', () => {
    const affected = getAffectedFeatures('learningObjectives');
    expect(affected).toContain('lessonPlans');
    expect(affected).toContain('slideDecks');
    expect(affected).toContain('rubrics');
    expect(affected).toContain('quizBank');
    expect(affected).toContain('studyGuides');
    expect(affected).not.toContain('discussions');
  });

  it('title affects all per-lesson deliverables', () => {
    const affected = getAffectedFeatures('title');
    expect(affected.length).toBeGreaterThanOrEqual(7);
  });

  it('weeklyAssessments affects rubrics, quizBank, assignments', () => {
    const affected = getAffectedFeatures('weeklyAssessments');
    expect(affected).toContain('rubrics');
    expect(affected).toContain('quizBank');
    expect(affected).toContain('assignments');
    expect(affected).not.toContain('discussions');
  });

  it('courseName only affects syllabus', () => {
    expect(getAffectedFeatures('courseName')).toEqual(['syllabus']);
  });

  it('_structural affects all per-lesson features', () => {
    const affected = getAffectedFeatures('_structural');
    expect(affected.length).toBeGreaterThanOrEqual(7);
  });

  it('unknown column falls back to selectedFeatures (minus courseMap/syllabus)', () => {
    const affected = getAffectedFeatures('customColumn', ['courseMap', 'lessonPlans', 'rubrics', 'syllabus']);
    expect(affected).toEqual(['lessonPlans', 'rubrics']);
  });

  it('unknown column without selectedFeatures falls back to lessonPlans + slideDecks', () => {
    expect(getAffectedFeatures('unknownField')).toEqual(['lessonPlans', 'slideDecks']);
  });
});

// ── getOutboundTargets — deliverable cascade ──

describe('getOutboundTargets — deliverable cascade', () => {
  it('lessonPlans cascades to slideDecks + studyGuides', () => {
    expect(getOutboundTargets('lessonPlans')).toEqual(['slideDecks', 'studyGuides']);
  });

  it('assignments cascades to rubrics', () => {
    expect(getOutboundTargets('assignments')).toEqual(['rubrics']);
  });

  it('discussions has no cascade targets', () => {
    expect(getOutboundTargets('discussions')).toEqual([]);
  });

  it('custom deliverables cascade to lessonPlans + studyGuides', () => {
    expect(getOutboundTargets('custom_myThing')).toEqual(['lessonPlans', 'studyGuides']);
  });

  it('unknown non-custom feature returns empty array', () => {
    expect(getOutboundTargets('nonexistent')).toEqual([]);
  });
});

// ── computeStaleConfidence ──

describe('computeStaleConfidence', () => {
  it('returns high for learningObjectives (weight 1.0)', () => {
    const result = computeStaleConfidence(['learningObjectives']);
    expect(result.level).toBe('high');
    expect(result.maxWeight).toBe(1.0);
    expect(result.dominantField).toBe('learningObjectives');
  });

  it('returns medium for title (weight 0.5)', () => {
    const result = computeStaleConfidence(['title']);
    expect(result.level).toBe('medium');
    expect(result.maxWeight).toBe(0.5);
  });

  it('returns low for empty edit keys', () => {
    const result = computeStaleConfidence([]);
    expect(result.level).toBe('low');
    expect(result.maxWeight).toBe(0);
  });

  it('picks the highest weight when multiple keys', () => {
    const result = computeStaleConfidence(['title', 'learningObjectives', 'technologyNeeded']);
    expect(result.level).toBe('high');
    expect(result.dominantField).toBe('learningObjectives');
    expect(result.maxWeight).toBe(1.0);
  });

  it('unknown field defaults to weight 0.5 (medium)', () => {
    const result = computeStaleConfidence(['customField']);
    expect(result.level).toBe('medium');
    expect(result.maxWeight).toBe(0.5);
  });
});

// ── buildSyncPlan — full edit→plan scenarios ──

describe('buildSyncPlan — edit scenarios', () => {
  const deliverables = makeDoneDeliverables();

  it('single cell edit → surgical sync for affected features', () => {
    const edits = [{ lessonIdx: 0, key: 'learningObjectives' }];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables);
    expect(plan.length).toBeGreaterThan(0);
    // Each plan entry should have lessonIndices (not null) since this is a cell edit
    for (const entry of plan) {
      expect(entry.lessonIndices).toEqual([0]);
    }
    // Should include lessonPlans (affected by learningObjectives)
    expect(plan.some(e => e.featureId === 'lessonPlans')).toBe(true);
  });

  it('multiple cell edits in different lessons → merged plan', () => {
    const edits = [
      { lessonIdx: 0, key: 'learningObjectives' },
      { lessonIdx: 2, key: 'learningObjectives' },
    ];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables);
    const lpEntry = plan.find(e => e.featureId === 'lessonPlans');
    expect(lpEntry).toBeDefined();
    expect(lpEntry.lessonIndices).toEqual([0, 2]); // both lessons
  });

  it('structural edit (add lesson) → full regen (lessonIndices=null)', () => {
    const edits = [{ lessonIdx: null, key: '_structural' }];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables);
    expect(plan.length).toBeGreaterThan(0);
    for (const entry of plan) {
      expect(entry.lessonIndices).toBeNull();
    }
  });

  it('mixed structural + cell edit → structural wins (null)', () => {
    const edits = [
      { lessonIdx: 0, key: 'learningObjectives' },
      { lessonIdx: null, key: '_structural' },
    ];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables);
    const lpEntry = plan.find(e => e.featureId === 'lessonPlans');
    expect(lpEntry.lessonIndices).toBeNull(); // structural overrides
  });

  it('deliverable body edit → uses outbound map (not all features)', () => {
    const edits = [{ lessonIdx: 0, key: '_deliverableEdit', excludeFeatureId: 'lessonPlans' }];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables);
    // lessonPlans → slideDecks + studyGuides
    const featureIds = plan.map(e => e.featureId);
    expect(featureIds).toContain('slideDecks');
    expect(featureIds).toContain('studyGuides');
    // Should NOT include rubrics, quizBank, etc.
    expect(featureIds).not.toContain('rubrics');
    expect(featureIds).not.toContain('quizBank');
  });

  it('only syncs features with done status', () => {
    const partialDelivs = {
      lessonPlans: { status: 'done', data: {} },
      slideDecks: { status: 'idle', data: null },
      rubrics: { status: 'error', data: null },
    };
    const edits = [{ lessonIdx: 0, key: 'title' }];
    const plan = buildSyncPlan(edits, ALL_FEATURES, partialDelivs);
    const featureIds = plan.map(e => e.featureId);
    expect(featureIds).toContain('lessonPlans');
    expect(featureIds).not.toContain('slideDecks'); // idle
    expect(featureIds).not.toContain('rubrics');     // error
  });

  it('priorityFeatureId moves that feature to front of plan', () => {
    const edits = [{ lessonIdx: 0, key: 'title' }];
    const plan = buildSyncPlan(edits, ALL_FEATURES, deliverables, 'studyGuides');
    expect(plan[0].featureId).toBe('studyGuides');
  });

  it('returns empty plan when no features are selected', () => {
    expect(buildSyncPlan([{ lessonIdx: 0, key: 'title' }], [], deliverables)).toEqual([]);
  });

  it('returns empty plan for empty edits', () => {
    expect(buildSyncPlan([], ALL_FEATURES, deliverables)).toEqual([]);
  });

  it('courseName edit only affects syllabus', () => {
    const delivsWithSyllabus = { ...deliverables, syllabus: { status: 'done', data: {} } };
    const edits = [{ lessonIdx: null, key: 'courseName' }];
    const plan = buildSyncPlan(edits, [...ALL_FEATURES, 'syllabus'], delivsWithSyllabus);
    expect(plan).toHaveLength(1);
    expect(plan[0].featureId).toBe('syllabus');
  });
});

// ── getArrayKey ──

describe('getArrayKey', () => {
  it('resolves known keys', () => {
    expect(getArrayKey('quizBank', { quizzes: [] })).toBe('quizzes');
    expect(getArrayKey('lessonPlans', { lessonPlans: [] })).toBe('lessonPlans');
    expect(getArrayKey('courseFaq', { faqs: [] })).toBe('faqs');
  });

  it('resolves aliased keys', () => {
    expect(getArrayKey('slideDecks', { decks: [] })).toBe('decks');
    expect(getArrayKey('studyGuides', { guides: [] })).toBe('guides');
    expect(getArrayKey('lessonPlans', { plans: [] })).toBe('plans');
  });

  it('falls back to first array key', () => {
    expect(getArrayKey('unknownFeature', { myItems: [], name: 'test' })).toBe('myItems');
  });

  it('returns null for non-object', () => {
    expect(getArrayKey('quizBank', null)).toBeNull();
    expect(getArrayKey('quizBank', 'string')).toBeNull();
  });
});
