import { describe, expect, it } from 'vitest';
import { buildLocalAutosavePayload } from '../projectAutosave';

describe('buildLocalAutosavePayload', () => {
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
    expect(saved.deliverables).toEqual({});
    expect(result.payload).not.toContain(largeBody);
  });
});
