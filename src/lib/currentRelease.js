import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 4, 2026',
  title: 'Discipline Before Keywords',
  landingTitle: 'EDUTOOL V0.17.14 Stops a Wrong Source Before It Teaches',
  highlights: [
    'A fresh production Film Form course exposed the truth the previous score missed: a film-editing lesson retrieved music metre, Indian tala, and poetry prosody, propagated them across the package, and still received 89/B with discipline 100.',
    'Source Finder v12 makes the course discipline authoritative when a lesson word is overloaded. Film rhythm no longer activates the music-theory gate, and a moving-image source must identify film, cinema, shots, editing, montage, or another film anchor.',
    'The shared source ledger now recognizes film-editing metre false friends, and the reading engine rejects them before they become graph resources. Legitimate interdisciplinary sources remain admissible when the source itself names its film context.',
    'The compiler now quarantines an entire lesson enrichment payload when one of its retained citations fails the course-aware source gate, removes weak resources from the safe graph, and compiles from that safe graph instead of rebuilding from the unsafe original.',
    'Deep grader 1.16.0 converts the exact audited contamination into a discipline P0. Regrading the unchanged production ZIP moves its conformance result from 89/B and discipline 100 to 74/C and discipline 75, making the score less flattering and more useful.',
    'The regression suite mutates the real failure shape at retrieval, graph attachment, compiler propagation, and rendered-package grading boundaries. Visual sterility and sparse DOCX pagination remain documented follow-up work rather than being claimed fixed.',
  ],
  landingHighlights: [
    'A real film course found the score’s blind spot.',
    'Course identity now outranks an overloaded keyword.',
    'Wrong-field research is rejected before compilation.',
    'One bad citation quarantines its lesson payload.',
    'The same old ZIP now scores 74/C, not 89/B.',
    'Formatting debt stays visible as follow-up work.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.14.json',
    roadmap: 'docs/V0.17.14_FILM_GROUNDING_AUDIT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.12-browser-preflight.json',
      sha256: '959269fcac8fbd99074676a1a4a77a7e55b090fdc9109f550a0feb72ff45ca88',
      bytes: 5759,
    },
    productionCourseContract: {
      path: 'evaluation/release-proofs/v0.17.12-production-course-contract.json',
      sha256: '5182b64ba6314013de3e6b7e473f807d98a2fbcf0fb9dbb6d8df11f896c45d60',
      bytes: 2578,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.17.12-production-package-attestation.json',
      sha256: 'e2b24a3e402ea98b43e619bd5e119b6d9651d6f7dc456cf29a656853fd32b195',
      bytes: 2094,
    },
    productionFilmAudit: {
      path: 'evaluation/release-proofs/v0.17.14-film-quality-audit.json',
      sha256: '838807808f98ac41f24635039393bd9d042321a2d5594b08a4a7b68ac321b165',
      bytes: 2263,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
