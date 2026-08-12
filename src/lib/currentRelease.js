import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 11, 2026',
  title: 'Plan-First Coherent Draft',
  landingTitle: 'EDUTOOL V0.17.18 Plans Before It Drafts',
  highlights: [
    'Scion now builds and validates a lesson-specific instructional intent graph before package drafting, then binds each objective, evidence task, assessment, visual-analysis need, source claim, and artifact family to that plan.',
    'Governing syllabus facts survive the full authoring path: required course materials, late-work rules, workload, grading weights, and source authority are recovered once and projected without being displaced by generic supplemental resources.',
    'Assessment and source receipts distinguish semantic claims from compiler structure, verify tuple integrity, and reject neighboring-domain evidence, dangling prose, machine-facing identifiers, and unsupported source assertions before they can look complete.',
    'A fresh five-lesson visual-analysis export produced every requested course-material family, passed all 38 package export checks, rendered 42 Office artifacts across 141 pages, slides, and sheets, and recorded 99/100 deterministic conformance with zero encoded findings.',
  ],
  landingHighlights: [
    'Plan each lesson before drafting it.',
    'Keep governing syllabus facts authoritative.',
    'Verify claims and assessment tuples separately.',
    'Verify a fresh package before publishing.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.18.json',
    roadmap: 'docs/V0.17.18_VERIFIED_COHERENT_DRAFT_CHECKPOINT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.18-browser-preflight.json',
      sha256: 'c0e5b34d6d7276dc3331b1bc44aca7cd18ca74a636de04e3e74e955337226647',
      bytes: 1014,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.17.18-production-package-attestation.json',
      sha256: 'a1ca46d6502ef540b12f4ad94dc08fc7d230e6b45e752617ce27fa812d4f2d51',
      bytes: 928,
    },
    representativeExport: {
      path: 'evaluation/release-proofs/v0.17.18-representative-export-audit.json',
      sha256: 'c8fa6a68e55bf0a91105ec9c2a480142b274e400ae4fe390dbb5260b3bd6dc99',
      bytes: 1476,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
