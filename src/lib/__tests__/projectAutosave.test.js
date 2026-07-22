import { describe, expect, it } from 'vitest';
import { buildCourseMapRecoveryAutosavePayload, buildLocalAutosavePayload } from '../projectAutosave';

describe('buildLocalAutosavePayload', () => {
  it('v0.15: prunes history but KEEPS deliverables before ever falling to compact', () => {
    const fullSnapshot = {
      courseMap: { lessons: [] },
      chatHistory: Array.from({ length: 200 }, (_, i) => ({ role: 'assistant', text: 'x'.repeat(50) + i })),
      versionHistory: Array.from({ length: 30 }, () => ({ map: 'y'.repeat(100) })),
      userEdits: [{ key: 'title' }],
      deliverables: { rubrics: { status: 'done', data: { body: 'the package itself' } } },
    };
    const compactSnapshot = { deliverableSaveMode: 'recompile-on-open', deliverables: {} };
    const result = buildLocalAutosavePayload({ fullSnapshot, compactSnapshot, maxFullChars: 5_000 });
    expect(result.mode).toBe('pruned');
    const parsed = JSON.parse(result.payload);
    expect(parsed.deliverables.rubrics.data.body).toBe('the package itself');
    expect(parsed.chatHistory).toEqual([]);
    expect(parsed.localSaveMode).toBe('pruned-history-autosave');
  });

  it('keeps full snapshots when they fit in the browser autosave budget', () => {
    const fullSnapshot = {
      courseMap: { lessons: [] },
      deliverables: {
        rubrics: { status: 'done', data: { body: 'short rubric body' } },
      },
    };
    const compactSnapshot = {
      courseMap: { lessons: [] },
      deliverableSaveMode: 'recompile-on-open',
      deliverables: {},
    };

    const result = buildLocalAutosavePayload({
      fullSnapshot,
      compactSnapshot,
      maxFullChars: 1_000,
    });

    expect(result.mode).toBe('full');
    expect(JSON.parse(result.payload).deliverables.rubrics.data.body).toBe('short rubric body');
  });

  it('stores a compact recompile snapshot when generated artifacts are too large', () => {
    const largeBody = 'rubric body '.repeat(200);
    const fullSnapshot = {
      courseMap: { lessons: [{ lessonNumber: 1, title: 'Foundations' }] },
      deliverables: {
        rubrics: { status: 'done', data: { body: largeBody } },
      },
    };
    const compactSnapshot = {
      courseMap: { lessons: [{ lessonNumber: 1, title: 'Foundations' }] },
      apiCallBudgetReceipt: {
        pipeline: { judgment: 'not evaluated (0 genome-linked lessons)' },
        enrichmentOutcome: { modelStage: 'ran', requestedLessons: 1, enrichedLessons: 1 },
      },
      deliverableSaveMode: 'recompile-on-open',
      deliverableManifest: { rubrics: { status: 'done' } },
      deliverables: {},
    };

    const result = buildLocalAutosavePayload({
      fullSnapshot,
      compactSnapshot,
      maxFullChars: 200,
    });

    const saved = JSON.parse(result.payload);
    expect(result.mode).toBe('compact');
    expect(saved.deliverableSaveMode).toBe('recompile-on-open');
    expect(saved.deliverableManifest.rubrics.status).toBe('done');
    expect(saved.apiCallBudgetReceipt.pipeline.judgment).toBe('not evaluated (0 genome-linked lessons)');
    expect(saved.apiCallBudgetReceipt.enrichmentOutcome.enrichedLessons).toBe(1);
    expect(saved.deliverables).toEqual({});
    expect(result.payload).not.toContain(largeBody);
  });
});

describe('buildCourseMapRecoveryAutosavePayload', () => {
  it('preserves a re-compilable course while omitting quota-heavy graph and artifact data', () => {
    const payload = buildCourseMapRecoveryAutosavePayload({
      projectId: 'geo-1',
      courseMap: { courseName: 'Physical Geology', lessons: [{ title: 'Lesson 1: Minerals' }] },
      courseGraphJson: 'graph'.repeat(10_000),
      deliverables: { quizBank: { data: 'quiz'.repeat(10_000) } },
      selectedFeatures: ['courseMap', 'quizBank'],
      deliverableManifest: { quizBank: { status: 'done' } },
      promptText: 'syllabus '.repeat(2_000),
    });
    const saved = JSON.parse(payload);

    expect(saved.courseMap.courseName).toBe('Physical Geology');
    expect(saved.selectedFeatures).toEqual(['courseMap', 'quizBank']);
    expect(saved.deliverableManifest.quizBank.status).toBe('done');
    expect(saved.deliverables).toEqual({});
    expect(saved.deliverableSaveMode).toBe('recompile-on-open');
    expect(saved.localSaveMode).toBe('course-map-recovery-autosave');
    expect(saved.promptText.length).toBeLessThanOrEqual(8_000);
    expect(payload).not.toContain('graphgraph');
    expect(payload).not.toContain('quizquiz');
  });
});
