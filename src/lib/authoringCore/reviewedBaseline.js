import { canonical, clone, FEATURES, hash } from './primitives.js';
import { projectDraft } from './projector.js';
import { redactSourceText } from './sourceSnapshots.js';

// Only material content is shared with an AI. Never expose workspace settings,
// chat history, credentials, local file metadata or previous project versions.
export function reviewedMaterials(base) {
  return {
    courseMap: base?.courseMap || null,
    deliverables: Object.fromEntries(
      FEATURES.filter((feature) => base?.deliverables?.[feature]?.data).map((feature) => [
        feature,
        base.deliverables[feature].data,
      ]),
    ),
  };
}
export function baselineDraft(record) {
  const entries = record.request.requestedFeatures.map(
    (feature) => record.base?.deliverables?.[feature]?.authoredContent,
  );
  const first = entries[0];
  if (
    !first?.plan?.lessons?.length ||
    !first.bundles ||
    entries.some(
      (e) =>
        !e ||
        e.projectorVersion !== 1 ||
        canonical(e.plan) !== canonical(first.plan) ||
        canonical(e.bundles) !== canonical(first.bundles),
    )
  )
    return null;
  if (
    first.plan.lessons.length !== record.request.lessonCount ||
    first.plan.lessons.some((l) => !first.bundles[l.id] || l.sessionMinutes !== record.request.sessionMinutes)
  )
    return null;
  return { plan: clone(first.plan), bundles: clone(first.bundles) };
}
export async function baselineTexts(record) {
  if (!record.base || record.grant) return [];
  const entries = [];
  function walk(value, path) {
    if (typeof value === 'string') entries.push({ path, value: redactSourceText(value) });
    else if (value === null || typeof value === 'number' || typeof value === 'boolean') entries.push({ path, value });
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}/${i}`));
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([key, item]) =>
        walk(item, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`),
      );
  }
  walk(reviewedMaterials(record.base), '');
  return Promise.all(
    entries.map(async ({ path, value }) => ({
      contentId: `baseline:${await hash(path)}`,
      contentRevision: record.baseContentRevision,
      title: `Reviewed course ${path}`,
      text: JSON.stringify({ path, value }),
    })),
  );
}
export async function reviewedLessonMaterials(record, lessonId) {
  const baseline = baselineDraft(record);
  if (!baseline) return null;
  const generated = projectDraft(baseline, record.request).deliverables;
  const changes = [];
  function changed(before, after, path) {
    if (canonical(before) === canonical(after)) return;
    if (after && typeof after === 'object') {
      for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after)]))
        changed(before?.[key], after[key], `${path}/${key}`);
    } else changes.push({ path, removed: after === undefined });
  }
  for (const feature of record.request.requestedFeatures) {
    const data = record.base.deliverables[feature].data;
    for (const [key, value] of Object.entries(data)) {
      if (!Array.isArray(value)) continue;
      const index = value.findIndex((item) => item?.lessonId === lessonId);
      if (index < 0) continue;
      const previous = generated[feature]?.data[key]?.find((item) => item?.lessonId === lessonId);
      changed(previous, value[index], `/deliverables/${feature}/${key}/${index}`);
    }
  }
  return {
    fields: await Promise.all(
      changes.slice(0, 40).map(async ({ path, removed }) => ({
        path,
        removed,
        contentId: removed ? null : `baseline:${await hash(path)}`,
        contentRevision: record.baseContentRevision,
      })),
    ),
    more: changes.length > 40,
    readVia: 'search_content/read_content',
  };
}
