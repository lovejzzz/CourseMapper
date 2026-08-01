import {
  isRenderedDeliverableCollectionFeature,
  renderedDeliverableCollectionKey,
} from './renderedDeliverableCollection.js';

export {
  isRenderedDeliverableCollectionFeature,
  renderedDeliverableCollectionKey,
  renderedDeliverableCollectionKeys,
} from './renderedDeliverableCollection.js';

export function renderedDeliverableCollection(featureId, data) {
  const key = renderedDeliverableCollectionKey(featureId, data);
  return key ? data[key] : [];
}

/**
 * Resolve the content authority for package-wide inspection. Collection-backed
 * features expose only the array their renderer consumes. A wrapped syllabus
 * exposes exactly its inner document; unwrapped syllabus and custom payloads
 * remain object-rooted because their renderers consume the whole object.
 */
export function renderedDeliverableContentRoot(featureId, data) {
  if (!data || typeof data !== 'object') return data;
  if (featureId === 'syllabus' && data.syllabus && typeof data.syllabus === 'object' && !Array.isArray(data.syllabus)) {
    return data.syllabus;
  }
  const key = renderedDeliverableCollectionKey(featureId, data);
  if (key) return data[key];
  return isRenderedDeliverableCollectionFeature(featureId) ? [] : data;
}
