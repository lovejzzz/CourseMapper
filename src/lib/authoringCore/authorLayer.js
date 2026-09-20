import { FEATURES, clone } from './primitives.js';
export function synchronizeAuthorLayer(entry, data) {
  return entry?.authoredContent
    ? { ...entry, data, authoredContent: { ...entry.authoredContent, teacherOverride: clone(data) } }
    : null;
}
export function authoredFeatures(snapshot) {
  return FEATURES.filter((f) => snapshot?.deliverables?.[f]?.authoredContent);
}
export function preserveAuthoredSnapshot(snapshot) {
  if (!authoredFeatures(snapshot).length && !snapshot?.courseMap?.authoringV2) return snapshot;
  return {
    ...snapshot,
    formatVersion: 3,
    requiredCapabilities: ['authored-content-v2'],
    deliverableSaveMode: 'authored-content-v2',
    deliverables: clone(snapshot.deliverables),
  };
}
