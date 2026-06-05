export {
  COMPILER_OWNED_STORAGE_FIELDS,
  SUPPORTED_CUSTOM_DELIVERABLES,
  UNKNOWN_CUSTOM_DELIVERABLES,
  scenario,
} from './blueprintQualityScenarioFactory.js';
export { CORE_REAL_COURSE_SCENARIOS } from './realCourseQualityCoreScenarios.js';
export { EXTENDED_REAL_COURSE_DEFINITIONS } from './realCourseQualityExtendedScenarios.js';
export {
  MESSY_UPLOAD_QUALITY_SCENARIOS,
  SPARSE_SOURCE_BOUNDARY_SCENARIOS,
  makeMissingSourceBlueprint,
} from './realCourseQualitySparseScenarios.js';

import { scenario } from './blueprintQualityScenarioFactory.js';
import { CORE_REAL_COURSE_SCENARIOS } from './realCourseQualityCoreScenarios.js';
import { EXTENDED_REAL_COURSE_DEFINITIONS } from './realCourseQualityExtendedScenarios.js';

export const REAL_COURSE_QUALITY_SCENARIOS = [
  ...CORE_REAL_COURSE_SCENARIOS,
  ...EXTENDED_REAL_COURSE_DEFINITIONS.map(scenario),
];
