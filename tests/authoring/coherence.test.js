import { indexedDB } from 'fake-indexeddb';
import { setup, completeDraft, bundleFor } from './helpers.js';
import { id } from '../../src/lib/authoringCore/primitives.js';
import { it, expect } from 'vitest';
import fixture from './lesson-bundle.fixture.json' with { type: 'json' };
import { clone, validateBundle, validateConceptGraph } from '../../src/lib/authoringCore/core.js';
function bundle() {
  const b = clone(fixture);
  const clean = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.evidenceRefs) value.evidenceRefs = [];
    Object.values(value).forEach(clean);
  };
  clean(b);
  return b;
}
it('rejects objective omissions and grading criteria attached to unrelated objectives', () => {
  const b = bundle();
  const lesson = { id: b.lessonId, objectives: b.objectiveIds.map((id) => ({ id })) };
  expect(validateBundle(b, { lesson }).valid).toBe(true);
  const missing = clone(b);
  missing.objectiveIds.pop();
  expect(() => validateBundle(missing, { lesson })).toThrow();
  const unassessed = clone(b);
  unassessed.assessments[0].objectiveIds.pop();
  expect(() => validateBundle(unassessed, { lesson })).toThrow();
  const ungraded = clone(b);
  ungraded.rubric[1].objectiveIds = [b.objectiveIds[0]];
  expect(() => validateBundle(ungraded, { lesson })).toThrow();
});
it('accepts a multi-lesson dependency chain and rejects cycles, duplicate definitions, and dangling prerequisites', () => {
  const first = bundle(),
    second = bundle(),
    third = bundle();
  first.lessonId = 'lesson-one';
  second.lessonId = 'lesson-two';
  third.lessonId = 'lesson-three';
  first.concepts = [{ clientId: 'a', prerequisiteConceptIds: [] }];
  second.concepts = [{ clientId: 'b', prerequisiteConceptIds: ['a'] }];
  third.concepts = [{ clientId: 'c', prerequisiteConceptIds: ['b'] }];
  const course = { first, second, third };
  expect(validateConceptGraph(course).valid).toBe(true);
  first.concepts[0].prerequisiteConceptIds = ['c'];
  expect(() => validateConceptGraph(course)).toThrow('prerequisite graph');
  first.concepts[0].prerequisiteConceptIds = [];
  third.concepts[0].clientId = 'a';
  expect(() => validateConceptGraph(course)).toThrow('prerequisite graph');
  third.concepts[0].clientId = 'c';
  third.concepts[0].prerequisiteConceptIds = ['missing'];
  expect(() => validateConceptGraph(course)).toThrow('prerequisite graph');
});

it('prevents a cyclic multi-lesson draft from becoming validated through the service', async () => {
  const ctx = await setup(indexedDB);
  const { record } = await completeDraft(ctx);
  const draft = record.drafts[ctx.draftId];
  const first = draft.plan.lessons[0];
  const second = {
    ...clone(first),
    id: id(),
    title: 'Second lesson',
    objectives: first.objectives.map((o) => ({ ...o, id: id() })),
  };
  draft.plan.lessons.push(second);
  draft.bundles[second.id] = bundleFor(second);
  draft.bundles[first.id].concepts[0].clientId = 'first-concept';
  draft.bundles[first.id].concepts[0].prerequisiteConceptIds = ['second-concept'];
  draft.bundles[second.id].concepts[0].clientId = 'second-concept';
  draft.bundles[second.id].concepts[0].prerequisiteConceptIds = ['first-concept'];
  draft.state = 'editing';
  delete draft.preview;
  delete draft.validation;
  const previous = record.storageVersion++;
  await ctx.store.cas(record.id, previous, record);
  const result = await ctx.call('validate_draft', {
    requestId: record.id,
    draftId: draft.id,
    expectedDraftRevision: draft.revision,
    idempotencyKey: id(),
  });
  expect(result.error.code).toBe('CONTENT_INVALID');
  expect(result.error.issues.some((issue) => issue.message.includes('cycle'))).toBe(true);
  expect((await ctx.store.get(record.id)).drafts[draft.id].validation).toBeUndefined();
});

it('redacts dependency issues in lessons outside the connection’s scope', async () => {
  const { setRequestGrant } = await import('../../src/lib/authoringCore/grants.js');
  const ctx = await setup(indexedDB);
  let { record } = await completeDraft(ctx);
  const draft = record.drafts[ctx.draftId],
    first = draft.plan.lessons[0];
  const hidden = [1, 2].map((index) => ({
    ...clone(first),
    id: id(),
    title: `Hidden ${index}`,
    objectives: first.objectives.map((o) => ({ ...o, id: id() })),
  }));
  record.request.lessonCount = 3;
  draft.plan.lessons.push(...hidden);
  for (const lesson of hidden) {
    draft.bundles[lesson.id] = bundleFor(lesson);
    draft.bundles[lesson.id].concepts[0].clientId = 'private-duplicate-definition';
  }
  const previous = record.storageVersion++;
  await ctx.store.cas(record.id, previous, record);
  record = await setRequestGrant(ctx.store, record.id, record.storageVersion, 'local', {
    draftId: draft.id,
    lessonIds: [first.id],
    sourceIds: [],
    featureIds: ['lessonPlans', 'assignments', 'rubrics'],
  });
  const result = await ctx.call('validate_draft', {
    requestId: record.id,
    draftId: draft.id,
    expectedDraftRevision: draft.revision,
    idempotencyKey: id(),
  });
  expect(result.error.code).toBe('CONTENT_INVALID');
  expect(result.error.issues.some((issue) => issue.path === '/course')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private-duplicate-definition');
  for (const lesson of hidden) expect(JSON.stringify(result)).not.toContain(lesson.id);
});
