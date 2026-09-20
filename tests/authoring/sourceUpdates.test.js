import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft } from './helpers.js';
import { replaceRequestSources } from '../../src/lib/authoringCore/sourceUpdates.js';
import { previewApplication, applyLocalDraft } from '../../src/lib/authoring/application.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';

const source = {
  sourceId: 'source-rules',
  title: 'Rules',
  excerpts: [{ excerptId: 'definition', text: 'Compare the first and third symbols.' }],
};
describe('teacher source changes invalidate review', () => {
  it('rejects stale contracts, citations, previews and applications after a source revision', async () => {
    const ctx = await setup(indexedDB);
    const { record, bundle, lesson } = await completeDraft(ctx);
    let next = await replaceRequestSources(ctx.store, record.id, record.storageVersion, 'local', [source]);
    const contract = await ctx.call('get_generation_contract', {
      requestId: record.id,
      draftId: ctx.draftId,
      lessonId: lesson.id,
      kind: 'lesson-bundle',
    });
    bundle.concepts[0].explanation.evidenceRefs = [
      { sourceId: source.sourceId, excerptId: 'definition', sourceRevision: next.sources[0].sourceRevision },
    ];
    const args = {
      requestId: record.id,
      draftId: ctx.draftId,
      lessonId: lesson.id,
      bundle,
      contractHash: contract.data.contractHash,
      expectedDraftRevision: next.drafts[ctx.draftId].revision,
      idempotencyKey: 'source-bundle',
    };
    const submitted = await ctx.call('submit_lesson_bundle', args);
    expect(submitted.ok).toBe(true);
    const validated = await ctx.call('validate_draft', {
      requestId: record.id,
      draftId: ctx.draftId,
      expectedDraftRevision: submitted.data.revision,
      idempotencyKey: 'source-validate',
    });
    expect(validated.ok).toBe(true);
    const previewed = await ctx.call('preview_draft', {
      requestId: record.id,
      draftId: ctx.draftId,
      expectedDraftRevision: submitted.data.revision + 1,
      validationId: validated.data.validationId,
      idempotencyKey: 'source-preview',
    });
    expect(previewed.ok).toBe(true);
    const reviewed = await ctx.store.get(record.id);
    const preview = await previewApplication(reviewed, ctx.draftId, null);
    next = await replaceRequestSources(ctx.store, record.id, reviewed.storageVersion, 'local', [
      { ...source, excerpts: [{ excerptId: 'definition', text: 'Now compare the first and second symbols.' }] },
    ]);
    expect(next.sources[0].sourceRevision).not.toBe(reviewed.sources[0].sourceRevision);
    expect(next.drafts[ctx.draftId].preview).toBeUndefined();
    await expect(previewApplication(next, ctx.draftId, null)).rejects.toThrow('preview');
    await expect(
      applyLocalDraft({ store: ctx.store, record: reviewed, draftId: ctx.draftId, preview, getCurrent: () => null }),
    ).rejects.toThrow('Request changed');
    expect(
      (
        await ctx.call('submit_lesson_bundle', {
          ...args,
          idempotencyKey: 'fresh-retry',
          expectedDraftRevision: next.drafts[ctx.draftId].revision,
        })
      ).error.code,
    ).toBe('STALE_CONTRACT');
    const invalid = await ctx.call('validate_draft', {
      requestId: record.id,
      draftId: ctx.draftId,
      expectedDraftRevision: next.drafts[ctx.draftId].revision,
      idempotencyKey: 'source-validate',
    });
    expect(invalid.ok).toBe(false);
    expect(JSON.stringify(invalid.error)).toContain('evidenceRefs');
  });

  it('keeps scope narrow when sources are replaced and rejects stale writers', async () => {
    const ctx = await setup(indexedDB);
    const { record, lesson } = await completeDraft(ctx);
    let next = await replaceRequestSources(ctx.store, record.id, record.storageVersion, 'local', [source]);
    next = await setRequestGrant(ctx.store, record.id, next.storageVersion, 'local', {
      draftId: ctx.draftId,
      lessonIds: [lesson.id],
      featureIds: ['lessonPlans'],
      sourceIds: [source.sourceId],
    });
    const updated = await replaceRequestSources(ctx.store, record.id, next.storageVersion, 'local', [
      { ...source, sourceId: 'new-source' },
    ]);
    expect(updated.grant.sourceIds).toEqual([]);
    expect(updated.grantVersion).toBe(next.grantVersion + 1);
    expect(updated.grant.revocationVersion).toBe(updated.grantVersion);
    await expect(replaceRequestSources(ctx.store, record.id, next.storageVersion, 'local', [])).rejects.toThrow(
      'Refresh',
    );
    await expect(replaceRequestSources(ctx.store, record.id, updated.storageVersion, 'other', [])).rejects.toThrow(
      'not available',
    );
  });

  it('protects pending application reservations and leaves applied records intact', async () => {
    const ctx = await setup(indexedDB);
    const { record } = await completeDraft(ctx);
    const version = record.storageVersion;
    const draft = record.drafts[ctx.draftId];
    draft.reservation = { applicationId: 'app1' };
    record.storageVersion++;
    await ctx.store.cas(record.id, version, record);
    await expect(replaceRequestSources(ctx.store, record.id, record.storageVersion, 'local', [])).rejects.toThrow(
      'pending application',
    );
    draft.application = { applicationId: 'app1', contentHash: 'saved' };
    draft.state = 'applied';
    const before = structuredClone(draft);
    await ctx.store.cas(record.id, record.storageVersion, { ...record, storageVersion: record.storageVersion + 1 });
    const next = await replaceRequestSources(ctx.store, record.id, record.storageVersion + 1, 'local', []);
    expect(next.drafts[ctx.draftId]).toEqual(before);
  });
});
