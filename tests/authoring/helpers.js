import { createIndexedDbStore } from '../../src/lib/authoring/indexedDbStore.js';
import { createAuthoringService, LOCAL_PRINCIPAL } from '../../src/lib/authoringCore/service.js';
import { hash, id, clone } from '../../src/lib/authoringCore/core.js';
import fixture from './lesson-bundle.fixture.json' with { type: 'json' };
export { LOCAL_PRINCIPAL };
export const request = {
  title: 'Teaching unfamiliar ideas',
  brief: 'A complete introductory lesson with an open-ended task.',
  learnerProfile: 'Adult beginners',
  language: 'English',
  lessonCount: 1,
  sessionMinutes: 45,
  requestedFeatures: ['lessonPlans', 'assignments', 'rubrics'],
  mode: 'new-course',
  sourcePolicy: 'no-uploaded-sources',
  uncertainties: [],
};
export function bundleFor(lesson) {
  const bundle = clone(fixture);
  bundle.lessonId = lesson.id;
  const oldObjectives = [...bundle.objectiveIds];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (v.evidenceRefs) v.evidenceRefs = [];
    if (v.objectiveIds)
      v.objectiveIds = v.objectiveIds.map(
        (o) => lesson.objectives[oldObjectives.indexOf(o)]?.id || lesson.objectives[0].id,
      );
    Object.values(v).forEach(walk);
  }
  walk(bundle);
  return bundle;
}
export async function setup(indexedDB, options = {}) {
  const store = createIndexedDbStore({ indexedDB, name: `test-${id()}` });
  const service = createAuthoringService({ store, ...options });
  const principal = LOCAL_PRINCIPAL;
  const call = async (op, args, p = principal) => service.execute(`cm_v2_${op}`, args, p);
  const created = await service.createRequest(request, principal, { idempotencyKey: id(), base: options.base || null });
  const requestId = created.data.requestId;
  const c = await call('get_generation_contract', { requestId, kind: 'course-plan' });
  const made = await call('create_draft', {
    requestId,
    expectedRequestRevision: 0,
    baseContentRevision: created.data.baseContentRevision,
    idempotencyKey: id(),
  });
  const draftId = made.data.draftId;
  const planArgs = {
    requestId,
    draftId,
    expectedDraftRevision: 0,
    idempotencyKey: id(),
    contractHash: c.data.contractHash,
    plan: {
      title: request.title,
      description: request.brief,
      lessons: [
        {
          clientId: 'lesson-1',
          title: 'A lesson with new concepts',
          objectives: [
            { clientId: 'obj-1', text: 'Explain the new rule.' },
            { clientId: 'obj-2', text: 'Apply and critique it.' },
          ],
        },
      ],
    },
  };
  return { store, service, principal, call, requestId, draftId, planArgs };
}
export async function completeDraft(ctx) {
  const plan = await ctx.call('submit_course_plan', ctx.planArgs);
  if (!plan.ok) throw new Error(JSON.stringify(plan));
  const lesson = plan.data.plan.lessons[0];
  const c = await ctx.call('get_generation_contract', {
    requestId: ctx.requestId,
    draftId: ctx.draftId,
    lessonId: lesson.id,
    kind: 'lesson-bundle',
  });
  const bundle = bundleFor(lesson);
  const submitted = await ctx.call('submit_lesson_bundle', {
    requestId: ctx.requestId,
    draftId: ctx.draftId,
    lessonId: lesson.id,
    expectedDraftRevision: 1,
    idempotencyKey: id(),
    contractHash: c.data.contractHash,
    bundle,
  });
  if (!submitted.ok) throw new Error(JSON.stringify(submitted));
  const v = await ctx.call('validate_draft', {
    requestId: ctx.requestId,
    draftId: ctx.draftId,
    expectedDraftRevision: 2,
    idempotencyKey: id(),
  });
  if (!v.ok) throw new Error(JSON.stringify(v));
  const p = await ctx.call('preview_draft', {
    requestId: ctx.requestId,
    draftId: ctx.draftId,
    expectedDraftRevision: 3,
    idempotencyKey: id(),
    validationId: v.data.validationId,
  });
  if (!p.ok) throw new Error(JSON.stringify(p));
  return { record: await ctx.store.get(ctx.requestId), bundle, lesson };
}
