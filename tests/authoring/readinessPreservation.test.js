import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft } from './helpers.js';
import { projectDraft } from '../../src/lib/authoringCore/projector.js';
import { repairCourseMapReadiness, repairWorkspaceReadiness } from '../../src/lib/deliverableReadiness.js';

describe('authored content through export readiness repairs', () => {
  it('preserves assignment prose, two rubric criteria and 40/60 weights', async () => {
    const ctx = await setup(indexedDB);
    const { record } = await completeDraft(ctx);
    const projected = projectDraft(record.drafts[ctx.draftId], record.request);
    const before = structuredClone(projected.deliverables);
    const repaired = repairWorkspaceReadiness({ ...projected, selectedFeatures: ['assignments', 'rubrics'] });
    expect(repaired.changed).toBe(false);
    expect(repaired.deliverables).toEqual(before);
    // The fixture actually exercises the old mutation, rather than a no-op input.
    const legacy = Object.fromEntries(
      Object.entries(before).map(([key, entry]) => [key, { ...entry, authoredContent: undefined }]),
    );
    expect(
      repairWorkspaceReadiness({ ...projected, deliverables: legacy, selectedFeatures: ['assignments', 'rubrics'] })
        .changed,
    ).toBe(true);
  });

  it('does not fill authored course-map blanks with generic prose', () => {
    const courseMap = {
      authoringV2: { requestId: 'test' },
      courseName: 'Rules',
      lessons: [
        { title: 'Lesson 1', sections: [{ topicSection: 'Lesson 1', learningGoals: '', technologyNeeded: '' }] },
      ],
    };
    expect(repairCourseMapReadiness({ courseMap })).toEqual({ changed: false, courseMap, repairedFields: [] });
  });
});
