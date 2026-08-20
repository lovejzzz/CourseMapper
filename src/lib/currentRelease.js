import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 20, 2026',
  title: 'Warning-Free, Recovery-Safe Output',
  landingTitle: 'EDUTOOL V0.18.6 Finishes Cleanly',
  highlights: [
    'Evidence-only lesson gaps are authorized inside the signed instructional graph before blueprint compilation, so one missing source can no longer fail all nine material families.',
    'DOCX lists use native Word structure, repeated export boilerplate is lesson-specific, and the 34-course torture matrix finishes with zero package blockers and zero quality warnings.',
    'Known informational llama.cpp notices stay out of the browser console while unknown runtime warnings and errors remain visible, and Node 25 verification runs no longer emit experimental Web Storage warnings.',
  ],
  landingHighlights: [
    'Recover one lesson without losing the package.',
    'Export native Office structure with clean copy.',
    'Keep real warnings visible and routine noise quiet.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.6.json',
    roadmap: 'docs/EDUTOOL_V0186_WARNING_FREE_OUTPUT.md',
    benchmark: {
      path: 'evaluation/v0.18.6-warning-free-output-benchmark.json',
      sha256: 'fb327a9dcb94c5ec0fb821cd2870bb1864b0c22f2dcc20f024c7a811f38551e8',
      bytes: 1679,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.6-browser-acceptance.json',
      sha256: '1c96aee2912f5bfdba6d3d4d63392de86546bfb26a5597459429493f88115f3f',
      bytes: 1536,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.6-production-package-attestation.json',
      sha256: 'c26097208233e3b34461ae3ada09fb701b5c1e91df8a8d07642e8c049c791387',
      bytes: 1487,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
