import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, LOCAL_PRINCIPAL, request, bundleFor } from './helpers.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';
import { buildRevisionTask, importRevision } from '../../src/lib/authoring/revisionTransfer.js';

async function revision() {
  const ctx = await setup(indexedDB);
  const { record, lesson } = await completeDraft(ctx);
  record.sources = [
    {
      sourceId: 'private',
      sourceRevision: 'a'.repeat(64),
      title: 'Private source',
      excerpts: [{ excerptId: 'e', text: 'UNSHARED-SENTINEL' }],
    },
  ];
  await ctx.store.cas(record.id, record.storageVersion, { ...record, storageVersion: record.storageVersion + 1 });
  const scoped = await setRequestGrant(ctx.store, record.id, record.storageVersion + 1, 'local', {
    draftId: ctx.draftId,
    lessonIds: [lesson.id],
    featureIds: ['lessonPlans'],
    sourceIds: [],
  });
  const task = await buildRevisionTask(ctx.service, scoped, LOCAL_PRINCIPAL);
  const input = JSON.parse(task.split('Response envelope: ')[1]);
  return { ctx, scoped, task, input };
}
describe('scoped clipboard revision transfer', () => {
  it('copies only permitted sources and revises the existing draft idempotently', async () => {
    const { ctx, scoped, task, input } = await revision();
    expect(task).not.toContain('UNSHARED-SENTINEL');
    input.bundles[0].concepts[0].explanation.text += ' Additional teacher-requested clarification.';
    const first = await importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL);
    expect(await importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL)).toEqual(first);
    const saved = await ctx.store.get(scoped.id);
    expect(Object.keys(saved.drafts)).toEqual([ctx.draftId]);
    expect(saved.drafts[ctx.draftId].bundles[input.bundles[0].lessonId]).toEqual(input.bundles[0]);
    expect(saved.drafts[ctx.draftId].preview).toBeUndefined();
  });
  it('rejects unpermitted changes and stale scope without applying content', async () => {
    const { ctx, scoped, input } = await revision();
    input.bundles[0].rubric[0].name = 'Forbidden rubric rewrite';
    await expect(importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL)).rejects.toThrow('rubrics');
    expect((await ctx.store.get(scoped.id)).drafts[ctx.draftId].revision).toBe(input.expectedDraftRevision);
    await expect(
      importRevision(ctx.service, { ...scoped, grantVersion: scoped.grantVersion + 1 }, input, LOCAL_PRINCIPAL),
    ).rejects.toThrow('fresh revision');
    await expect(
      importRevision(ctx.service, scoped, { ...input, draftId: 'different' }, LOCAL_PRINCIPAL),
    ).rejects.toThrow('does not match');
  });
  it('retries a partially saved multi-lesson response without duplicating the first revision', async () => {
    const ctx = await setup(indexedDB);
    const made = await ctx.service.createRequest({ ...request, lessonCount: 2 }, LOCAL_PRINCIPAL, {
      idempotencyKey: 'two-lessons',
    });
    const requestId = made.data.requestId;
    const created = await ctx.call('create_draft', {
      requestId,
      expectedRequestRevision: 0,
      baseContentRevision: made.data.baseContentRevision,
      idempotencyKey: 'draft',
    });
    const draftId = created.data.draftId;
    const contract = await ctx.call('get_generation_contract', { requestId, kind: 'course-plan' });
    const plan = {
      title: 'Two lessons',
      description: 'Revision recovery',
      lessons: [1, 2].map((n) => ({
        clientId: `lesson${n}`,
        title: `Lesson ${n}`,
        objectives: [
          { clientId: `explain${n}`, text: 'Explain the rule.' },
          { clientId: `apply${n}`, text: 'Apply the rule.' },
        ],
      })),
    };
    const planned = await ctx.call('submit_course_plan', {
      requestId,
      draftId,
      expectedDraftRevision: 0,
      idempotencyKey: 'plan',
      contractHash: contract.data.contractHash,
      plan,
    });
    expect(planned.ok).toBe(true);
    let revision = planned.data.revision;
    for (const [index, lesson] of planned.data.plan.lessons.entries()) {
      const bundle = bundleFor(lesson);
      bundle.concepts.forEach((concept) => {
        concept.clientId += `-${index}`;
      });
      const contract = await ctx.call('get_generation_contract', {
        requestId,
        draftId,
        lessonId: lesson.id,
        kind: 'lesson-bundle',
      });
      const saved = await ctx.call('submit_lesson_bundle', {
        requestId,
        draftId,
        lessonId: lesson.id,
        expectedDraftRevision: revision,
        idempotencyKey: `bundle-${index}`,
        contractHash: contract.data.contractHash,
        bundle,
      });
      expect(saved.ok).toBe(true);
      revision = saved.data.revision;
    }
    const record = await ctx.store.get(requestId);
    const scoped = await setRequestGrant(ctx.store, requestId, record.storageVersion, 'local', {
      draftId,
      lessonIds: planned.data.plan.lessons.map((l) => l.id),
      featureIds: ['lessonPlans'],
      sourceIds: [],
    });
    const task = await buildRevisionTask(ctx.service, scoped, LOCAL_PRINCIPAL);
    const input = JSON.parse(task.split('Response envelope: ')[1]);
    input.bundles.forEach((bundle) => {
      bundle.concepts[0].explanation.text += ' Revised explanation.';
    });
    const secondRubric = input.bundles[1].rubric[0].name;
    input.bundles[1].rubric[0].name = 'Unpermitted rewrite';
    await expect(importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL)).rejects.toThrow(
      '1 lesson revision(s) saved',
    );
    input.bundles[1].rubric[0].name = secondRubric;
    await importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL);
    const result = await ctx.store.get(requestId);
    expect(result.drafts[draftId].revision).toBe(input.expectedDraftRevision + 2);
    expect(Object.values(result.drafts[draftId].bundles)).toEqual(input.bundles);
  });
  it('preserves unchanged citations to unshared sources but rejects reusing them in rewritten passages', async () => {
    const ctx = await setup(indexedDB);
    const { record, lesson, bundle } = await completeDraft(ctx);
    record.sources = [
      {
        sourceId: 'hidden',
        sourceRevision: 'b'.repeat(64),
        title: 'Hidden',
        excerpts: [{ excerptId: 'definition', text: 'Private reference text.' }],
      },
    ];
    bundle.concepts[0].explanation.evidenceRefs = [
      { sourceId: 'hidden', sourceRevision: 'b'.repeat(64), excerptId: 'definition' },
    ];
    record.drafts[ctx.draftId].bundles[lesson.id] = bundle;
    await ctx.store.cas(record.id, record.storageVersion, { ...record, storageVersion: record.storageVersion + 1 });
    const scoped = await setRequestGrant(ctx.store, record.id, record.storageVersion + 1, 'local', {
      draftId: ctx.draftId,
      lessonIds: [lesson.id],
      featureIds: ['lessonPlans'],
      sourceIds: [],
    });
    const task = await buildRevisionTask(ctx.service, scoped, LOCAL_PRINCIPAL);
    expect(task).not.toContain('Private reference text.');
    const input = JSON.parse(task.split('Response envelope: ')[1]);
    input.bundles[0].concepts[1].explanation.text += ' Clarification without changing the hidden citation.';
    await importRevision(ctx.service, scoped, input, LOCAL_PRINCIPAL);
    const fresh = await ctx.store.get(record.id);
    const retryTask = await buildRevisionTask(ctx.service, fresh, LOCAL_PRINCIPAL);
    const rewrite = JSON.parse(retryTask.split('Response envelope: ')[1]);
    rewrite.bundles[0].concepts[0].explanation.text = 'Different claim using an unshared source.';
    await expect(importRevision(ctx.service, fresh, rewrite, LOCAL_PRINCIPAL)).rejects.toThrow('unshared source');
  });
});
