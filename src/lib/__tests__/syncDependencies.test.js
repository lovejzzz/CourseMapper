import { describe, it, expect } from 'vitest';
import {
    getArrayKey,
    getAffectedFeatures,
    buildSyncPlan,
    computeStaleConfidence,
    DELIVERABLE_OUTBOUND_MAP,
} from '../syncDependencies';

describe('getArrayKey', () => {
    it('returns known key for standard feature IDs', () => {
        expect(getArrayKey('lessonPlans', { lessonPlans: [1] })).toBe('lessonPlans');
        expect(getArrayKey('quizBank', { quizzes: [1] })).toBe('quizzes');
        expect(getArrayKey('rubrics', { rubrics: [1] })).toBe('rubrics');
    });

    it('returns alias key when primary is missing', () => {
        expect(getArrayKey('slideDecks', { decks: [1] })).toBe('decks');
        expect(getArrayKey('slideDecks', { slides: [1] })).toBe('slides');
        expect(getArrayKey('courseFaq', { faq: [1] })).toBe('faq');
    });

    it('falls back to first array key in object', () => {
        expect(getArrayKey('unknown', { items: [1, 2], name: 'test' })).toBe('items');
    });

    it('returns null for null/undefined/non-object input', () => {
        expect(getArrayKey('lessonPlans', null)).toBeNull();
        expect(getArrayKey('lessonPlans', undefined)).toBeNull();
        expect(getArrayKey('lessonPlans', 'string')).toBeNull();
    });

    it('returns null when no array keys exist', () => {
        expect(getArrayKey('unknown', { name: 'test', count: 5 })).toBeNull();
    });
});

describe('getAffectedFeatures', () => {
    it('returns correct features for known field keys', () => {
        const titleAffected = getAffectedFeatures('title');
        expect(titleAffected).toContain('lessonPlans');
        expect(titleAffected).toContain('slideDecks');
        expect(titleAffected).toContain('rubrics');
    });

    it('returns empty array for _deliverableEdit (resolved dynamically)', () => {
        expect(getAffectedFeatures('_deliverableEdit')).toEqual([]);
    });

    it('falls back to selected features for unknown keys', () => {
        const selected = ['lessonPlans', 'quizBank', 'courseMap'];
        const affected = getAffectedFeatures('customColumn', selected);
        expect(affected).toContain('lessonPlans');
        expect(affected).toContain('quizBank');
        expect(affected).not.toContain('courseMap');
    });

    it('uses hardcoded fallback when no selectedFeatures provided', () => {
        const affected = getAffectedFeatures('unknownKey');
        expect(affected).toEqual(['lessonPlans', 'slideDecks']);
    });
});

describe('computeStaleConfidence', () => {
    it('returns high for high-impact fields', () => {
        const result = computeStaleConfidence(['learningObjectives']);
        expect(result.level).toBe('high');
        expect(result.maxWeight).toBe(1.0);
        expect(result.dominantField).toBe('learningObjectives');
    });

    it('returns medium for mid-impact fields', () => {
        const result = computeStaleConfidence(['title']);
        expect(result.level).toBe('medium');
        expect(result.maxWeight).toBe(0.5);
    });

    it('returns low for low-impact fields', () => {
        const result = computeStaleConfidence(['semester']);
        expect(result.level).toBe('low');
        expect(result.maxWeight).toBe(0.2);
    });

    it('returns low for empty array', () => {
        const result = computeStaleConfidence([]);
        expect(result.level).toBe('low');
        expect(result.maxWeight).toBe(0);
    });

    it('picks the highest-weight field as dominant', () => {
        const result = computeStaleConfidence(['semester', 'learningObjectives', 'title']);
        expect(result.dominantField).toBe('learningObjectives');
        expect(result.level).toBe('high');
    });

    it('defaults unknown fields to 0.5 weight', () => {
        const result = computeStaleConfidence(['someUnknownField']);
        expect(result.maxWeight).toBe(0.5);
        expect(result.level).toBe('medium');
    });
});

describe('buildSyncPlan', () => {
    const deliverables = {
        lessonPlans: { status: 'done' },
        slideDecks: { status: 'done' },
        rubrics: { status: 'done' },
        quizBank: { status: 'streaming' },
    };
    const selected = ['courseMap', 'lessonPlans', 'slideDecks', 'rubrics', 'quizBank'];

    it('returns empty plan for empty edits', () => {
        expect(buildSyncPlan([], selected, deliverables)).toEqual([]);
    });

    it('returns empty plan for no selected features', () => {
        expect(buildSyncPlan([{ lessonIdx: 0, key: 'title' }], [], deliverables)).toEqual([]);
    });

    it('only syncs features with status done', () => {
        const edits = [{ lessonIdx: 0, key: 'weeklyAssessments' }];
        const plan = buildSyncPlan(edits, selected, deliverables);
        // quizBank is 'streaming' so should NOT be in plan
        const featureIds = plan.map(p => p.featureId);
        expect(featureIds).not.toContain('quizBank');
        expect(featureIds).toContain('rubrics');
    });

    it('creates surgical plan with lesson indices for field edits', () => {
        const edits = [{ lessonIdx: 2, key: 'topicSection' }];
        const plan = buildSyncPlan(edits, selected, deliverables);
        const lpEntry = plan.find(p => p.featureId === 'lessonPlans');
        expect(lpEntry).toBeDefined();
        expect(lpEntry.lessonIndices).toEqual([2]);
    });

    it('sets lessonIndices to null for structural changes', () => {
        const edits = [{ lessonIdx: null, key: '_structural' }];
        const plan = buildSyncPlan(edits, selected, deliverables);
        for (const entry of plan) {
            expect(entry.lessonIndices).toBeNull();
        }
    });

    it('deduplicates lesson indices across multiple edits', () => {
        const edits = [
            { lessonIdx: 0, key: 'topicSection' },
            { lessonIdx: 0, key: 'learningGoals' },
            { lessonIdx: 1, key: 'topicSection' },
        ];
        const plan = buildSyncPlan(edits, selected, deliverables);
        const lpEntry = plan.find(p => p.featureId === 'lessonPlans');
        expect(lpEntry.lessonIndices).toEqual([0, 1]);
    });

    it('prioritizes the specified feature ID', () => {
        const edits = [{ lessonIdx: 0, key: 'title' }];
        const plan = buildSyncPlan(edits, selected, deliverables, 'rubrics');
        expect(plan[0].featureId).toBe('rubrics');
    });

    it('resolves _deliverableEdit via DELIVERABLE_OUTBOUND_MAP', () => {
        const edits = [{ lessonIdx: 0, key: '_deliverableEdit', excludeFeatureId: 'lessonPlans' }];
        const plan = buildSyncPlan(edits, selected, deliverables);
        const featureIds = plan.map(p => p.featureId);
        // lessonPlans outbound map: ['slideDecks', 'studyGuides']
        expect(featureIds).toContain('slideDecks');
        expect(featureIds).not.toContain('lessonPlans');
    });
});

describe('DELIVERABLE_OUTBOUND_MAP', () => {
    it('has entries for all standard deliverables', () => {
        const expected = ['lessonPlans', 'slideDecks', 'studyGuides', 'rubrics', 'quizBank', 'discussions', 'assignments'];
        for (const key of expected) {
            expect(DELIVERABLE_OUTBOUND_MAP).toHaveProperty(key);
            expect(Array.isArray(DELIVERABLE_OUTBOUND_MAP[key])).toBe(true);
        }
    });

    it('discussions has no outbound dependencies', () => {
        expect(DELIVERABLE_OUTBOUND_MAP.discussions).toEqual([]);
    });
});
