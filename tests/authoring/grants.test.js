import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, LOCAL_PRINCIPAL } from './helpers.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';
import { clone, id } from '../../src/lib/authoringCore/primitives.js';
import { createAuthoringService } from '../../src/lib/authoringCore/service.js';

it('narrows reads and writes before consulting old receipts and preserves ungranted features', async () => {
  const ctx = await setup(indexedDB);
  let { record } = await completeDraft(ctx);
  const draft = record.drafts[ctx.draftId],
    selected = draft.plan.lessons[0];
  const other = {
    ...clone(selected),
    id: id(),
    title: 'Private second lesson',
    objectives: [{ id: id(), text: 'Private objective' }],
  };
  draft.plan.lessons.push(other);
  draft.bundles[other.id] = { ...clone(draft.bundles[selected.id]), lessonId: other.id };
  record.sources = [
    {
      sourceId: 'private',
      sourceRevision: 'a'.repeat(64),
      title: 'Private source',
      excerpts: [{ excerptId: 'private', text: 'Private body' }],
    },
  ];
  record.remoteAllowed = true;
  const previous = record.storageVersion++;
  await ctx.store.cas(record.id, previous, record);
  record = await setRequestGrant(ctx.store, record.id, record.storageVersion, 'local', {
    draftId: draft.id,
    lessonIds: [selected.id],
    sourceIds: [],
    featureIds: ['rubrics'],
  });
  const remote = createAuthoringService({ store: ctx.store, channel: 'remote' });
  const call = (op, args = {}) => remote.execute(`cm_v2_${op}`, { requestId: record.id, ...args }, LOCAL_PRINCIPAL);
  const status = await call('get_draft_status', { draftId: draft.id });
  expect(status.data.lessons.map((l) => l.id)).toEqual([selected.id]);
  expect(JSON.stringify(status)).not.toContain('Private second lesson');
  expect((await call('get_context')).data.sources).toEqual([]);
  expect((await call('search_content', { query: 'Private' })).data.matches).toEqual([]);
  expect(
    (await call('read_content', { contentId: 'private:private', expectedRevision: 'a'.repeat(64) })).error.code,
  ).toBe('SOURCE_CHANGED');
  expect(
    (await call('get_generation_contract', { kind: 'lesson-bundle', draftId: draft.id, lessonId: other.id })).error
      .code,
  ).toBe('NOT_FOUND');
  expect((await call('get_generation_contract', { kind: 'course-plan' })).error.code).toBe('FORBIDDEN');
  expect(
    (
      await call('create_draft', {
        expectedRequestRevision: record.revision,
        baseContentRevision: record.baseContentRevision,
        idempotencyKey: id(),
      })
    ).error.code,
  ).toBe('FORBIDDEN');
  const contract = await call('get_generation_contract', {
    kind: 'lesson-bundle',
    draftId: draft.id,
    lessonId: selected.id,
  });
  expect(contract.data.existingBundle).toEqual(draft.bundles[selected.id]);
  const bundle = clone(draft.bundles[selected.id]);
  bundle.concepts[0].name = 'Unpermitted change';
  const args = {
    draftId: draft.id,
    lessonId: selected.id,
    expectedDraftRevision: draft.revision,
    contractHash: contract.data.contractHash,
    bundle,
    idempotencyKey: id(),
  };
  expect((await call('submit_lesson_bundle', args)).error.code).toBe('FORBIDDEN');
  const permitted = clone(draft.bundles[selected.id]);
  permitted.rubric[0].name += ' (revised)';
  const accepted = await call('submit_lesson_bundle', { ...args, bundle: permitted, idempotencyKey: id() });
  expect(accepted.ok, JSON.stringify(accepted.error)).toBe(true);
  const saved = await ctx.store.get(record.id);
  expect(saved.drafts[draft.id].bundles[other.id]).toEqual(draft.bundles[other.id]);
  expect(saved.drafts[draft.id].bundles[selected.id].concepts).toEqual(draft.bundles[selected.id].concepts);
  const expanded = await setRequestGrant(ctx.store, record.id, saved.storageVersion, 'local', {
    draftId: draft.id,
    lessonIds: [selected.id],
    sourceIds: [],
    featureIds: ['lessonPlans', 'assignments', 'rubrics'],
  });
  const updatedContract = await call('get_generation_contract', {
    kind: 'lesson-bundle',
    draftId: draft.id,
    lessonId: selected.id,
  });
  const unauthorizedCitation = clone(expanded.drafts[draft.id].bundles[selected.id]);
  unauthorizedCitation.concepts[0].explanation.evidenceRefs = [
    { sourceId: 'private', sourceRevision: 'a'.repeat(64), excerptId: 'private' },
  ];
  const rejectedCitation = await call('submit_lesson_bundle', {
    ...args,
    expectedDraftRevision: expanded.drafts[draft.id].revision,
    contractHash: updatedContract.data.contractHash,
    bundle: unauthorizedCitation,
    idempotencyKey: id(),
  });
  // Hidden-source citation changes are now denied at the permission boundary,
  // before general content validation. They must still leave storage unchanged.
  expect(rejectedCitation.error.code).toBe('FORBIDDEN');
  expect((await ctx.store.get(record.id)).storageVersion).toBe(expanded.storageVersion);
  await expect(setRequestGrant(ctx.store, record.id, saved.storageVersion, 'different-user', null)).rejects.toThrow(
    'not available',
  );
  await expect(setRequestGrant(ctx.store, record.id, record.storageVersion, 'local', null)).rejects.toThrow('changed');
});
