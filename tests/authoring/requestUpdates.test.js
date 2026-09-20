import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft } from './helpers.js';
import { updateRequestRequirements } from '../../src/lib/authoringCore/requestUpdates.js';
import { replaceRequestSources } from '../../src/lib/authoringCore/sourceUpdates.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';
import { previewApplication, applyLocalDraft } from '../../src/lib/authoring/application.js';

describe('teacher changes to teaching requirements', () => {
  it('supersedes old drafts and rejects old receipts, contracts and application before allowing a fresh draft', async () => {
    const ctx = await setup(indexedDB);
    const { record } = await completeDraft(ctx);
    const preview = await previewApplication(record, ctx.draftId, null);
    const updated = await updateRequestRequirements(ctx.store, record.id, record.storageVersion, 'local', {
      brief: 'Teach a different learning objective.',
      lessonCount: 2,
      sessionMinutes: 30,
    });
    expect(updated.drafts[ctx.draftId].state).toBe('superseded');
    expect(updated.drafts[ctx.draftId].requestBeforeSupersession).toEqual(record.request);
    expect(updated.drafts[ctx.draftId].bundles).toEqual(record.drafts[ctx.draftId].bundles);
    expect((await ctx.call('submit_course_plan', ctx.planArgs)).error.code).toBe('STALE_REQUEST');
    expect(
      (
        await ctx.call('get_generation_contract', {
          requestId: record.id,
          draftId: ctx.draftId,
          lessonId: record.drafts[ctx.draftId].plan.lessons[0].id,
          kind: 'lesson-bundle',
        })
      ).error.code,
    ).toBe('STALE_REQUEST');
    await expect(
      applyLocalDraft({ store: ctx.store, record, draftId: ctx.draftId, preview, getCurrent: () => null }),
    ).rejects.toThrow('Request changed');
    const contract = await ctx.call('get_generation_contract', { requestId: record.id, kind: 'course-plan' });
    expect(contract.data.requirements.lessonCount).toBe(2);
    expect(contract.data.requirements.brief).toContain('different learning objective');
    const created = await ctx.call('create_draft', {
      requestId: record.id,
      expectedRequestRevision: updated.revision,
      baseContentRevision: updated.baseContentRevision,
      idempotencyKey: 'new-requirements',
    });
    expect(created.ok).toBe(true);
    expect(created.data.draftId).not.toBe(ctx.draftId);
    const current = await ctx.store.get(record.id);
    const afterSources = await replaceRequestSources(ctx.store, record.id, current.storageVersion, 'local', []);
    expect(afterSources.drafts[ctx.draftId].state).toBe('superseded');
    await expect(
      setRequestGrant(ctx.store, record.id, afterSources.storageVersion, 'local', {
        draftId: ctx.draftId,
        lessonIds: [record.drafts[ctx.draftId].plan.lessons[0].id],
        sourceIds: [],
        featureIds: ['rubrics'],
      }),
    ).rejects.toThrow('editable');
  });
  it('blocks unresolved applications and preserves completed application history', async () => {
    const ctx = await setup(indexedDB);
    const { record } = await completeDraft(ctx);
    const reserved = structuredClone(record);
    reserved.storageVersion++;
    reserved.drafts[ctx.draftId].reservation = { applicationId: 'pending-application' };
    await ctx.store.cas(record.id, record.storageVersion, reserved);
    await expect(
      updateRequestRequirements(ctx.store, record.id, reserved.storageVersion, 'local', {
        brief: 'New objective',
      }),
    ).rejects.toThrow('Resolve the pending application');
    expect(await ctx.store.get(record.id)).toEqual(reserved);
    const applied = structuredClone(reserved);
    applied.storageVersion++;
    applied.drafts[ctx.draftId].application = { applicationId: 'pending-application', contentHash: 'saved-content' };
    await ctx.store.cas(record.id, reserved.storageVersion, applied);
    const updated = await updateRequestRequirements(ctx.store, record.id, applied.storageVersion, 'local', {
      brief: 'New objective',
    });
    expect(updated.drafts[ctx.draftId]).toEqual(applied.drafts[ctx.draftId]);
    expect(updated.request.brief).toBe('New objective');
  });
  it('rejects cross-owner, stale, malformed and restricted-grant changes without widening access', async () => {
    const ctx = await setup(indexedDB);
    const { record, lesson } = await completeDraft(ctx);
    for (const changes of [{ lessonCount: 0 }, { owner: 'other' }])
      await expect(
        updateRequestRequirements(ctx.store, record.id, record.storageVersion, 'local', changes),
      ).rejects.toThrow();
    await expect(
      updateRequestRequirements(ctx.store, record.id, record.storageVersion, 'other', { title: 'Changed' }),
    ).rejects.toThrow('not available');
    const scoped = await setRequestGrant(ctx.store, record.id, record.storageVersion, 'local', {
      draftId: ctx.draftId,
      lessonIds: [lesson.id],
      sourceIds: [],
      featureIds: ['rubrics'],
    });
    await expect(
      updateRequestRequirements(ctx.store, record.id, scoped.storageVersion, 'local', { title: 'Changed' }),
    ).rejects.toThrow('Restore full');
    await expect(
      updateRequestRequirements(ctx.store, record.id, record.storageVersion, 'local', { title: 'Changed' }),
    ).rejects.toThrow('Refresh');
    expect((await ctx.store.get(record.id)).grant).toEqual(scoped.grant);
  });
});
