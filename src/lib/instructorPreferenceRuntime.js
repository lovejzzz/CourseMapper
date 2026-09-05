import { getMemories } from './agentMemory';
import { buildInstructorPreferenceProfileFromMemories } from './instructorPreferenceProfile';

export function loadCurrentInstructorPreferenceProfile(options = {}) {
  return buildInstructorPreferenceProfileFromMemories(getMemories(), {
    minSignalCount: 1,
    ...options,
  });
}
