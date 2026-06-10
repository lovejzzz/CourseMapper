/**
 * src/lib/knowledge — v0.13.5: the Open Knowledge Backbone.
 *
 * Provider layer (OpenAlex / ERIC / Open Library, cached + degrading),
 * the reading-list engine (Resource entities on the Course Graph), and
 * the curated pedagogy evidence base. Build-time ingestion (OpenStax,
 * CORE) lives in scripts/foundry/ — never in the browser bundle.
 */

export {
  searchScholarlyReadings,
  searchEducationResearch,
  searchBookMetadata,
  checkRetractions,
  isoWeekStamp,
} from './providers.js';
export { attachGenomeResources, attachOpenReadings, knowledgeCoverage } from './readingListEngine.js';
export { PEDAGOGY_EVIDENCE, evidenceForMove, buildMethodsStatement } from './pedagogyEvidence.js';
export { buildCompetencyMap, competencyStandardsUrls } from './competencyMap.js';
