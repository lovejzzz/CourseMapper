import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, request } from './helpers.js';
import { previewApplication, applyLocalDraft } from '../../src/lib/authoring/application.js';

it.each(['lessonPlans', 'assignments', 'rubrics'])(
  'applies and opens only the requested %s material',
  async (feature) => {
    const ctx = await setup(indexedDB, { request: { ...request, requestedFeatures: [feature] } });
    const { record, bundle } = await completeDraft(ctx);
    const preview = await previewApplication(record, ctx.draftId, null);
    expect(preview.snapshot.activeTab).toBe(feature);
    expect(preview.snapshot.selectedFeatures).toEqual(['courseMap', feature]);
    expect(Object.keys(preview.snapshot.deliverables)).toEqual([feature]);
    const application = await applyLocalDraft({
      store: ctx.store,
      record,
      draftId: ctx.draftId,
      preview,
      getCurrent: () => null,
    });
    const saved = await ctx.store.get(`application:${application.id}`);
    expect(saved.snapshot.activeTab).toBe(feature);
    expect(Object.keys(saved.snapshot.deliverables)).toEqual([feature]);
    expect(saved.snapshot.deliverables[feature].authoredContent.bundles[bundle.lessonId]).toEqual(bundle);
  },
);
