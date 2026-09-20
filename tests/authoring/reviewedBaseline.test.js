import { it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, bundleFor, request, LOCAL_PRINCIPAL } from './helpers.js';
import { clone, id, hash } from '../../src/lib/authoringCore/core.js';
import { projectDraft } from '../../src/lib/authoringCore/projector.js';
import { previewApplication } from '../../src/lib/authoring/application.js';
import { setRequestGrant } from '../../src/lib/authoringCore/grants.js';

const note = 'Teacher review note: quiet written responses before discussion.';
async function fixture() {
  const original = await setup(indexedDB);
  const complete = await completeDraft(original);
  const draft = clone(complete.record.drafts[original.draftId]);
  const second = clone(draft.plan.lessons[0]);
  second.id = id();
  second.clientId = 'lesson-2';
  second.title = 'Dependent second lesson';
  second.objectives = second.objectives.map((o, i) => ({ ...o, id: id(), clientId: `second-objective-${i}` }));
  const bundle = bundleFor(second);
  const names = new Map();
  function collect(v) {
    if (!v || typeof v !== 'object') return;
    if (v.clientId) names.set(v.clientId, `second-${v.clientId}`);
    Object.values(v).forEach(collect);
  }
  collect(bundle);
  function rename(v) {
    if (typeof v === 'string') return names.get(v) || v;
    if (Array.isArray(v)) return v.map(rename);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]));
    return v;
  }
  draft.plan.lessons.push(second);
  draft.bundles[second.id] = rename(bundle);
  const req = { ...request, lessonCount: 2 };
  const base = projectDraft(draft, req);
  base.deliverables.lessonPlans.data.plans[0].outline[0].instructorNotes += '\n' + note;
  base.chatHistory = [{ text: 'PRIVATE CHAT NOT SHARED' }];
  base.provider = { apiKey: 'PRIVATE SETTING NOT SHARED' };
  const ctx = await setup(indexedDB, { request: req, base });
  const record = await ctx.store.get(ctx.requestId);
  const made = await ctx.call('create_draft', {
    requestId: ctx.requestId,
    expectedRequestRevision: 0,
    baseContentRevision: record.baseContentRevision,
    fromReviewedBaseline: true,
    idempotencyKey: id(),
  });
  expect(made.ok, JSON.stringify(made.error)).toBe(true);
  return { ctx, base, draft, made, record, first: draft.plan.lessons[0], second };
}
async function revise(f, mutate) {
  const draftId = f.made.data.draftId;
  const c = await f.ctx.call('get_generation_contract', {
    requestId: f.ctx.requestId,
    draftId,
    kind: 'lesson-bundle',
    lessonId: f.second.id,
  });
  const bundle = clone(c.data.existingBundle);
  mutate(bundle);
  const saved = await f.ctx.call('submit_lesson_bundle', {
    requestId: f.ctx.requestId,
    draftId,
    lessonId: f.second.id,
    expectedDraftRevision: 0,
    contractHash: c.data.contractHash,
    bundle,
    idempotencyKey: id(),
  });
  expect(saved.ok, JSON.stringify(saved.error)).toBe(true);
  const validated = await f.ctx.call('validate_draft', {
    requestId: f.ctx.requestId,
    draftId,
    expectedDraftRevision: 1,
    idempotencyKey: id(),
  });
  expect(validated.ok, JSON.stringify(validated.error)).toBe(true);
  const preview = await f.ctx.call('preview_draft', {
    requestId: f.ctx.requestId,
    draftId,
    expectedDraftRevision: 2,
    validationId: validated.data.validationId,
    idempotencyKey: id(),
  });
  expect(preview.ok, JSON.stringify(preview.error)).toBe(true);
  return { draftId, record: await f.ctx.store.get(f.ctx.requestId) };
}
it('retains stable IDs and complete bundles only when revision mode is explicit', async () => {
  const f = await fixture();
  expect(f.made.data.plan).toEqual(f.draft.plan);
  expect(f.made.data.receivedLessonIds).toEqual(Object.keys(f.draft.bundles));
  const r = await f.ctx.store.get(f.ctx.requestId);
  expect(r.drafts[f.ctx.draftId].plan).toBeNull(); // Default behavior still creates a new course.
  const c = await f.ctx.call('get_generation_contract', {
    requestId: f.ctx.requestId,
    draftId: f.made.data.draftId,
    lessonId: f.first.id,
    kind: 'lesson-bundle',
  });
  expect(c.data.reviewedLessonMaterials.fields).toHaveLength(1);
  const field = c.data.reviewedLessonMaterials.fields[0];
  const read = await f.ctx.call('read_content', {
    requestId: f.ctx.requestId,
    contentId: field.contentId,
    expectedRevision: field.contentRevision,
  });
  expect(read.data.text).toContain(note);
});
it('searches version-bound material without exposing workspace history or settings', async () => {
  const f = await fixture();
  const search = await f.ctx.call('search_content', { requestId: f.ctx.requestId, query: 'Teacher review note' });
  expect(search.data.matches).toHaveLength(1);
  const m = search.data.matches[0];
  const read = await f.ctx.call('read_content', {
    requestId: f.ctx.requestId,
    contentId: m.contentId,
    expectedRevision: m.contentRevision,
  });
  expect(read.data.text).toContain(note);
  for (const query of ['PRIVATE CHAT', 'PRIVATE SETTING'])
    expect((await f.ctx.call('search_content', { requestId: f.ctx.requestId, query })).data.matches).toEqual([]);
  expect(
    (
      await f.ctx.call('read_content', {
        requestId: f.ctx.requestId,
        contentId: m.contentId,
        expectedRevision: await hash('wrong'),
      })
    ).error.code,
  ).toBe('SOURCE_CHANGED');
  const denied = await f.ctx.call(
    'read_content',
    { requestId: f.ctx.requestId, contentId: m.contentId, expectedRevision: m.contentRevision },
    { ...LOCAL_PRINCIPAL, uid: 'other' },
  );
  expect(denied.error.code).toBe('NOT_FOUND');
});
it('does not expose the full baseline after a grant narrows lesson access', async () => {
  const f = await fixture();
  const r = await f.ctx.store.get(f.ctx.requestId);
  const search = await f.ctx.call('search_content', { requestId: f.ctx.requestId, query: 'Teacher review note' });
  const m = search.data.matches[0];
  await setRequestGrant(f.ctx.store, r.id, r.storageVersion, LOCAL_PRINCIPAL.uid, {
    draftId: f.made.data.draftId,
    lessonIds: [f.second.id],
    sourceIds: [],
    featureIds: ['assignments'],
  });
  expect((await f.ctx.call('search_content', { requestId: r.id, query: 'Teacher review note' })).data.matches).toEqual(
    [],
  );
  expect(
    (await f.ctx.call('read_content', { requestId: r.id, contentId: m.contentId, expectedRevision: m.contentRevision }))
      .error.code,
  ).toBe('SOURCE_CHANGED');
  expect((await f.ctx.call('get_context', { requestId: r.id })).data.reviewedBaseline).toBeNull();
});
it('preserves a teacher edit in lesson one while revising lesson two assessment', async () => {
  const f = await fixture();
  const next = await revise(f, (b) => {
    b.assessments[0].prompt.text += ' Justify one decision after feedback.';
  });
  const preview = await previewApplication(next.record, next.draftId, f.base);
  expect(preview.conflicts).toEqual([]);
  expect(preview.snapshot.deliverables.lessonPlans.data.plans[0]).toEqual(
    f.base.deliverables.lessonPlans.data.plans[0],
  );
  expect(preview.snapshot.deliverables.assignments.data.assignments[1].instructions[0]).toContain(
    'Justify one decision',
  );
  expect(preview.snapshot.courseMap.lessons.map((l) => l.id)).toEqual(f.base.courseMap.lessons.map((l) => l.id));
});
it('blocks an overlapping teacher edit instead of replacing it', async () => {
  const f = await fixture();
  const next = await revise(f, (b) => {
    b.assessments[0].prompt.text += ' AI change';
  });
  const current = clone(f.base);
  current.deliverables.assignments.data.assignments[1].instructions[0] += ' Teacher change';
  const preview = await previewApplication(next.record, next.draftId, current);
  expect(preview.conflicts.some((c) => c.path.endsWith('/instructions'))).toBe(true);
  expect(preview.snapshot.deliverables.assignments.data.assignments[1].instructions[0]).toContain('Teacher change');
});
it('requires source-read permission to seed an existing reviewed course', async () => {
  const f = await fixture();
  const result = await f.ctx.call(
    'create_draft',
    {
      requestId: f.ctx.requestId,
      expectedRequestRevision: 0,
      baseContentRevision: f.record.baseContentRevision,
      fromReviewedBaseline: true,
      idempotencyKey: id(),
    },
    { ...LOCAL_PRINCIPAL, scopes: ['authoring.drafts.write'] },
  );
  expect(result.error.code).toBe('FORBIDDEN');
});
it('redacts credentials in shared material and keeps numeric teacher fields readable', async () => {
  const f = await fixture();
  const r = await f.ctx.store.get(f.ctx.requestId);
  const secret = 'sk-proj-' + 'S'.repeat(28);
  r.base.deliverables.lessonPlans.data.plans[0].materials.push('Private key ' + secret);
  r.base.deliverables.rubrics.data.rubrics[0].criteria[0].weight = 42;
  r.baseContentRevision = await hash(r.base);
  const version = r.storageVersion;
  r.storageVersion++;
  await f.ctx.store.cas(r.id, version, r);
  const search = await f.ctx.call('search_content', { requestId: r.id, query: 'Private key' });
  const m = search.data.matches[0];
  const read = await f.ctx.call('read_content', {
    requestId: r.id,
    contentId: m.contentId,
    expectedRevision: m.contentRevision,
  });
  expect(read.data.text).toContain('[redacted secret]');
  expect(read.data.text).not.toContain(secret);
  const n = await f.ctx.call('search_content', { requestId: r.id, query: '/criteria/0/weight' });
  const item = n.data.matches[0];
  const numeric = await f.ctx.call('read_content', {
    requestId: r.id,
    contentId: item.contentId,
    expectedRevision: item.contentRevision,
  });
  expect(JSON.parse(numeric.data.text).value).toBe(42);
  r.revoked = true;
  const v = r.storageVersion;
  r.storageVersion++;
  await f.ctx.store.cas(r.id, v, r);
  expect(
    (await f.ctx.call('read_content', { requestId: r.id, contentId: m.contentId, expectedRevision: m.contentRevision }))
      .error.code,
  ).toBe('GRANT_REVOKED');
});
it('does not merge reordered lesson arrays by position', async () => {
  const f = await fixture();
  const next = await revise(f, (b) => {
    b.assessments[0].prompt.text += ' AI change';
  });
  const current = clone(f.base);
  current.deliverables.assignments.data.assignments.reverse();
  const preview = await previewApplication(next.record, next.draftId, current);
  expect(preview.conflicts.some((c) => c.path === '/deliverables/assignments/assignments')).toBe(true);
  expect(preview.snapshot.deliverables.assignments.data.assignments[0].lessonId).toBe(f.second.id);
});
it('rejects revision mode without a compatible authored baseline', async () => {
  const ctx = await setup(indexedDB);
  const r = await ctx.store.get(ctx.requestId);
  const result = await ctx.call('create_draft', {
    requestId: r.id,
    expectedRequestRevision: 0,
    baseContentRevision: r.baseContentRevision,
    fromReviewedBaseline: true,
    idempotencyKey: id(),
  });
  expect(result.error.code).toBe('BASELINE_UNAVAILABLE');
  expect(Object.keys((await ctx.store.get(r.id)).drafts)).toEqual([ctx.draftId]);
});
