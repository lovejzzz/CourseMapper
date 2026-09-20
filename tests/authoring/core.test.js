import { describe, it, expect } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, bundleFor, LOCAL_PRINCIPAL } from './helpers.js';
import { id, clone, mergeThreeWay, validateBundle, hash } from '../../src/lib/authoringCore/core.js';
import { previewApplication, applyLocalDraft, undoApplication } from '../../src/lib/authoring/application.js';
import { projectDraft, synchronizeAuthorLayer } from '../../src/lib/authoringCore/projector.js';
import { registerPageTools } from '../../src/lib/authoring/webmcp.js';
import { setAuthoringExecutionMode, assertSiteInferenceAllowed } from '../../src/lib/authoring/inferencePolicy.js';

describe('external authoring contracts and durable application', () => {
  it('author content survives submit, preview, durable apply, file roundtrip and checked undo', async () => {
    const ctx = await setup(indexedDB);
    const { record, bundle } = await completeDraft(ctx);
    let current = null;
    const preview = await previewApplication(record, ctx.draftId, current);
    expect(preview.conflicts).toEqual([]);
    const app = await applyLocalDraft({
      store: ctx.store,
      record,
      draftId: ctx.draftId,
      preview,
      getCurrent: () => current,
    });
    current = app.snapshot;
    const saved = await ctx.store.get(`application:${app.id}`);
    expect(
      JSON.parse(JSON.stringify(saved.snapshot)).deliverables.lessonPlans.authoredContent.bundles[bundle.lessonId],
    ).toEqual(bundle);
    expect(saved.snapshot.deliverables.assignments.data).not.toHaveProperty('teacherNotes');
    expect(JSON.stringify(saved.snapshot.deliverables.assignments.data)).not.toContain(
      bundle.assessments[0].evaluation.teacherText.text,
    );
    expect(JSON.stringify(saved.snapshot.deliverables.lessonPlans.data)).toContain(bundle.examples[0].result.text);
    expect(await undoApplication({ store: ctx.store, application: app, getCurrent: () => current })).toBeNull();
  });
  it('same-key retry returns the original receipt; altered payload fails', async () => {
    const ctx = await setup(indexedDB);
    const result = await ctx.call('submit_course_plan', ctx.planArgs);
    expect(result.ok).toBe(true);
    expect(await ctx.call('submit_course_plan', ctx.planArgs)).toEqual(result);
    const changed = clone(ctx.planArgs);
    changed.plan.title = 'Different';
    expect((await ctx.call('submit_course_plan', changed)).error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('two simultaneous writers cannot both commit the same revision', async () => {
    const ctx = await setup(indexedDB);
    const results = await Promise.all([
      ctx.call('submit_course_plan', ctx.planArgs),
      ctx.call('submit_course_plan', { ...ctx.planArgs, idempotencyKey: id() }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok).error.code).toBe('REVISION_CONFLICT');
  });
  it('rejects guessed IDs, revoked grants, missing scopes and expired access', async () => {
    let clock = Date.now();
    const ctx = await setup(indexedDB, { now: () => clock });
    expect((await ctx.call('get_context', { requestId: ctx.requestId }, { ...LOCAL_PRINCIPAL, uid: 'other' })).ok).toBe(
      false,
    );
    expect(
      (await ctx.call('get_context', { requestId: ctx.requestId }, { ...LOCAL_PRINCIPAL, scopes: [] })).error.code,
    ).toBe('FORBIDDEN');
    clock += 31 * 86400000;
    expect((await ctx.call('submit_course_plan', ctx.planArgs)).error.code).toBe('GRANT_REVOKED');
    clock -= 31 * 86400000;
    const record = await ctx.store.get(ctx.requestId);
    const version = record.storageVersion;
    record.revoked = true;
    record.storageVersion++;
    await ctx.store.cas(record.id, version, record);
    expect((await ctx.call('submit_course_plan', ctx.planArgs)).error.code).toBe('GRANT_REVOKED');
  });
  it('does not accept model-supplied authority, oversized input or stale contracts', async () => {
    const ctx = await setup(indexedDB);
    expect((await ctx.call('submit_course_plan', { ...ctx.planArgs, teacherConfirmed: true })).error.code).toBe(
      'RESERVED_FIELD',
    );
    expect((await ctx.call('submit_course_plan', { ...ctx.planArgs, contractHash: 'a'.repeat(64) })).error.code).toBe(
      'STALE_CONTRACT',
    );
    expect((await ctx.call('get_context', { requestId: 'x'.repeat(140000) })).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect((await ctx.call('apply', {})).error.code).toBe('UNKNOWN_TOOL');
  });
  it('validates evidence, objective and assessment references, timing and rubric bands', () => {
    const lesson = { id: 'lesson', objectives: [{ id: 'o1' }, { id: 'o2' }] };
    const good = bundleFor(lesson);
    expect(validateBundle(good, { lesson }).valid).toBe(true);
    for (const mutate of [
      (b) => b.lessonPlan.blocks[0].durationMinutes++,
      (b) => b.rubric[0].weightPercent++,
      (b) => (b.rubric[0].bands[0].level = b.rubric[0].bands[1].level),
      (b) => (b.assessments[0].objectiveIds = ['fake']),
      (b) => (b.rubric[0].assessmentClientIds = ['fake']),
      (b) => (b.concepts[0].explanation.evidenceRefs = [{ sourceId: 'fake', sourceRevision: 'v1', excerptId: 'e1' }]),
    ]) {
      const b = clone(good);
      mutate(b);
      expect(() => validateBundle(b, { lesson })).toThrow();
    }
  });
  it('preserves teacher edits and rejects stale previews and unsafe undo', async () => {
    const base = { courseMap: { courseName: 'Base', lessons: [] }, deliverables: {}, userEdits: ['keep'] };
    const ctx = await setup(indexedDB, { base });
    const { record } = await completeDraft(ctx);
    const edited = clone(base);
    edited.courseMap.courseName = 'Teacher title';
    const preview = await previewApplication(record, ctx.draftId, edited);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    expect(preview.snapshot.courseMap.courseName).toBe('Teacher title');
    expect(preview.snapshot.userEdits).toEqual(['keep']);
    const clean = await previewApplication(record, ctx.draftId, base);
    await expect(
      applyLocalDraft({ store: ctx.store, record, draftId: ctx.draftId, preview: clean, getCurrent: () => edited }),
    ).rejects.toThrow('course changed');
    const application = await applyLocalDraft({
      store: ctx.store,
      record,
      draftId: ctx.draftId,
      preview: clean,
      getCurrent: () => base,
    });
    const later = clone(application.snapshot);
    later.courseMap.courseName = 'Later edit';
    await expect(undoApplication({ store: ctx.store, application, getCurrent: () => later })).rejects.toThrow(
      'Edits made after',
    );
  });
  it('treats concurrent reorders as a conflict and keeps later editor overrides', () => {
    expect(mergeThreeWay([1, 2], [2, 1], [1, 3]).conflicts).toHaveLength(1);
    const entry = {
      data: { value: 'old' },
      authoredContent: { bundles: { lesson: 'original' } },
      stale: true,
      staleEdits: { lessonIndices: [3] },
    };
    expect(synchronizeAuthorLayer(entry, { value: 'teacher' })).toEqual({
      ...entry,
      data: { value: 'teacher' },
      authoredContent: { ...entry.authoredContent, teacherOverride: { value: 'teacher' } },
    });
  });
  it('registers once across StrictMode and rejects old document epochs', async () => {
    const registered = new Map();
    const fakeWindow = {};
    fakeWindow.top = fakeWindow;
    const document = {
      defaultView: fakeWindow,
      modelContext: {
        registerTool: async (t) => {
          expect(registered.has(t.name)).toBe(false);
          registered.set(t.name, t);
        },
        unregisterTool: (name) => registered.delete(name),
      },
    };
    const ctx = await setup(indexedDB);
    const getContext = () => ({
      service: ctx.service,
      principal: { ...LOCAL_PRINCIPAL, requestIds: [ctx.requestId] },
      epoch: 'fresh',
    });
    const dispose1 = registerPageTools({ document, getContext });
    dispose1();
    const dispose2 = registerPageTools({ document, getContext });
    await new Promise((r) => setTimeout(r, 10));
    expect(registered.size).toBe(13);
    expect(
      (await registered.get('cm_v2_get_context').execute({ requestId: ctx.requestId, documentEpoch: 'old' })).error
        .code,
    ).toBe('PAGE_ACCESS_REQUIRED');
    const retained = registered.get('cm_v2_get_context');
    const before = await ctx.store.get(ctx.requestId);
    const originalCas = ctx.store.cas;
    ctx.store.cas = async (...args) => {
      dispose2();
      return originalCas(...args);
    };
    const interrupted = await registered.get('cm_v2_submit_course_plan').execute({
      ...ctx.planArgs,
      documentEpoch: 'fresh',
    });
    ctx.store.cas = originalCas;
    expect(interrupted.error.code).toBe('PAGE_ACCESS_REQUIRED');
    expect(await ctx.store.get(ctx.requestId)).toEqual(before);
    expect((await retained.execute({ requestId: ctx.requestId, documentEpoch: 'fresh' })).error.code).toBe(
      'PAGE_ACCESS_REQUIRED',
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(registered.size).toBe(0);
    expect((await retained.execute({ requestId: ctx.requestId, documentEpoch: 'fresh' })).error.code).toBe(
      'PAGE_ACCESS_REQUIRED',
    );
  });
  it('blocks site inference explicitly without any fallback', () => {
    setAuthoringExecutionMode('external-agent');
    expect(() => assertSiteInferenceAllowed()).toThrow('disabled');
    setAuthoringExecutionMode('site-model');
    expect(() => assertSiteInferenceAllowed()).not.toThrow();
  });
});
