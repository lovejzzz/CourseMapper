import { describe, it, expect } from 'vitest';
import {
    mergeChunkResults,
    findMissingIndices,
    getCoverageRetryMissingLessons,
    chunkArray,
    createChunkPlan,
} from '../parallelGenerator';

describe('mergeChunkResults', () => {
    it('merges two chunks in order', () => {
        const map = new Map([
            [0, { plans: [{ lessonTitle: 'Lesson 1: Intro' }] }],
            [1, { plans: [{ lessonTitle: 'Lesson 2: Methods' }] }],
        ]);
        const result = mergeChunkResults('lessonPlans', map);
        expect(result.plans).toHaveLength(2);
        expect(result.plans[0].lessonTitle).toBe('Lesson 1: Intro');
        expect(result.plans[1].lessonTitle).toBe('Lesson 2: Methods');
    });

    it('deduplicates by normalized lesson number (keeps LAST)', () => {
        const map = new Map([
            [0, {
                plans: [
                    { lessonTitle: 'Lesson 3: Social Work Values & Ethics', objectives: ['old'] },
                ]
            }],
            [1, {
                plans: [
                    { lessonTitle: 'Lesson 3: Social Work Values and Ethics', objectives: ['new'] },
                ]
            }],
        ]);
        const result = mergeChunkResults('lessonPlans', map);
        expect(result.plans).toHaveLength(1);
        expect(result.plans[0].objectives[0]).toBe('new');
    });

    it('deduplicates when retry produces same lesson with slightly different title', () => {
        const map = new Map([
            [0, {
                guides: [
                    { lessonTitle: 'Lesson 5: Social Location & Use of Self' },
                    { lessonTitle: 'Lesson 6: Skill Development' },
                ]
            }],
            [100, {
                guides: [
                    { lessonTitle: 'Lesson 5: Social Location and Use of Self (Revised)' },
                ]
            }],
        ]);
        const result = mergeChunkResults('studyGuides', map);
        expect(result.guides).toHaveLength(2);
        // The retry version (last occurrence) wins
        expect(result.guides.find(g => /Lesson 5/.test(g.lessonTitle)).lessonTitle)
            .toContain('Revised');
    });

    it('handles items without lesson numbers (rubric assessment titles)', () => {
        const map = new Map([
            [0, {
                rubrics: [
                    { title: 'Reflection Paper', lessonTitle: 'Lesson 1: Intro' },
                    { title: 'Case Study', lessonTitle: 'Lesson 2: Methods' },
                ]
            }],
            [1, {
                rubrics: [
                    { title: 'Group Project', lessonTitle: 'Lesson 3: Ethics' },
                ]
            }],
        ]);
        const result = mergeChunkResults('rubrics', map);
        expect(result.rubrics).toHaveLength(3);
    });

    it('returns null for empty chunkMap', () => {
        expect(mergeChunkResults('lessonPlans', new Map())).toBeNull();
    });

    it('returns single chunk directly without dedup', () => {
        const data = { plans: [{ lessonTitle: 'Lesson 1: X' }] };
        const map = new Map([[0, data]]);
        const result = mergeChunkResults('lessonPlans', map);
        expect(result).toBe(data);
    });
});

describe('findMissingIndices', () => {
    it('finds missing lessons by content matching', () => {
        const arr = [
            { lessonTitle: 'Lesson 1: Intro' },
            { lessonTitle: 'Lesson 3: Ethics' },
        ];
        const missing = findMissingIndices(arr, [0, 1, 2, 3, 4]);
        // Indices are 0-based, lesson numbers are 1-based
        // Present: lesson 1 (idx 0), lesson 3 (idx 2)
        // Missing: idx 1 (lesson 2), idx 3 (lesson 4), idx 4 (lesson 5)
        expect(missing).toEqual([1, 3, 4]);
    });

    it('returns empty when all present', () => {
        const arr = [
            { lessonTitle: 'Lesson 1: A' },
            { lessonTitle: 'Lesson 2: B' },
            { lessonTitle: 'Lesson 3: C' },
        ];
        expect(findMissingIndices(arr, [0, 1, 2])).toEqual([]);
    });

    it('falls back to tail detection when no lesson numbers', () => {
        const arr = [{ title: 'Reflection Paper' }, { title: 'Case Study' }];
        const missing = findMissingIndices(arr, [0, 1, 2, 3]);
        expect(missing).toEqual([2, 3]);
    });
});

describe('getCoverageRetryMissingLessons', () => {
    it('detects skipped lessons even when the item count is high enough', () => {
        const arr = [
            { lessonTitle: 'Lesson 1: Intro' },
            { lessonTitle: 'Lesson 3: Ethics' },
            { lessonTitle: 'Lesson 3: Ethics Review' },
            { lessonTitle: 'Lesson 5: Wrap-up' },
        ];

        const result = getCoverageRetryMissingLessons(arr, 5);

        expect([...result.coveredSet].sort((a, b) => a - b)).toEqual([1, 3, 5]);
        expect(result.missingLessons).toEqual([2, 4]);
        expect(result.missingIndices).toEqual([1, 3]);
    });

    it('counts relatedLessons for per-assessment outputs', () => {
        const arr = [
            { title: 'Reflection Paper', relatedLessons: 'Lessons 1 and 2' },
            { title: 'Case Study', relatedLesson: 'Week 4' },
            { title: 'Practice Quiz', lessonNumber: 5 },
        ];

        const result = getCoverageRetryMissingLessons(arr, 5);

        expect([...result.coveredSet].sort((a, b) => a - b)).toEqual([1, 2, 4, 5]);
        expect(result.missingLessons).toEqual([3]);
        expect(result.missingIndices).toEqual([2]);
    });

    it('does not request coverage retries when no lesson numbers are present', () => {
        const arr = [
            { title: 'Reflection Paper' },
            { title: 'Group Presentation' },
        ];

        const result = getCoverageRetryMissingLessons(arr, 4);

        expect(result.coveredSet.size).toBe(0);
        expect(result.missingLessons).toEqual([]);
        expect(result.missingIndices).toEqual([]);
    });
});

describe('chunkArray', () => {
    it('splits evenly', () => {
        expect(chunkArray([0, 1, 2, 3, 4, 5], 3)).toEqual([[0, 1, 2], [3, 4, 5]]);
    });

    it('handles remainder', () => {
        expect(chunkArray([0, 1, 2, 3, 4], 3)).toEqual([[0, 1, 2], [3, 4]]);
    });
});

describe('createChunkPlan', () => {
    it('creates 3 chunks for 15 lessons with chunk size 5', () => {
        const tasks = createChunkPlan(['lessonPlans'], 15);
        expect(tasks).toHaveLength(3);
        expect(tasks[0].chunkScope).toEqual([0, 1, 2, 3, 4]);
        expect(tasks[1].chunkScope).toEqual([5, 6, 7, 8, 9]);
        expect(tasks[2].chunkScope).toEqual([10, 11, 12, 13, 14]);
    });

    it('marks syllabus as whole-course', () => {
        const tasks = createChunkPlan(['syllabus'], 15);
        expect(tasks).toHaveLength(1);
        expect(tasks[0].isWholeCourse).toBe(true);
        expect(tasks[0].chunkScope).toBeNull();
    });
});
