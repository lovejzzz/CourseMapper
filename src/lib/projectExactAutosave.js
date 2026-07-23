import { buildCourseMapRecoveryAutosavePayload, buildIndexedDbAutosaveMarker } from './projectAutosave';
import { saveProjectIndexedDbAutosave } from './projectIndexedDbAutosave';

/**
 * Keep an oversized browser project exact. Recompilation is a last resort:
 * it can drift from the reviewed package and discard its completed grade.
 */
export async function persistOversizedProjectSnapshot({
  fullSnapshot,
  compactSnapshot,
  compactPayload,
  storage = globalThis.localStorage,
} = {}) {
  try {
    await saveProjectIndexedDbAutosave(JSON.stringify(fullSnapshot));
    storage.removeItem('coursemapper-project');
    storage.setItem('coursemapper-project', buildIndexedDbAutosaveMarker(fullSnapshot));
    return 'indexeddb';
  } catch (indexedDbError) {
    try {
      storage.removeItem('coursemapper-project');
      storage.setItem('coursemapper-project', compactPayload);
      return 'compact';
    } catch {
      try {
        storage.removeItem('coursemapper-project');
        storage.setItem('coursemapper-project', buildCourseMapRecoveryAutosavePayload(compactSnapshot));
        return 'course-map-recovery';
      } catch (fallbackError) {
        throw new AggregateError([indexedDbError, fallbackError], 'Exact project autosave failed.');
      }
    }
  }
}
