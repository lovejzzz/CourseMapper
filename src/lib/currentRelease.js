import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 1, 2026',
  title: 'Proof That Travels, Sources That Belong',
  landingTitle: 'EDUTOOL V0.17.08 Makes Release Proof Reproducible',
  highlights: [
    'Current release evidence is a tracked, hash-bound record. Missing files, ignored local paths, unsafe traversal, byte drift, and SHA-256 mismatches now fail the release-history audit on the authoring machine as well as CI.',
    'The Algi/Scion/hybrid evaluator rejects missing or non-finite metrics instead of letting JavaScript NaN comparisons pass silently.',
    'Every benchmark artifact is verified from an on-disk path, byte count, and SHA-256; truthy placeholders and tampered files fail closed.',
    'Benchmark verdicts require a blinded judge identity, substantive attestation, and one complete randomized arm order for every frozen case.',
    'Python source admission now requires an exact recognized lesson-topic anchor. PyGMT, XSO, and unrelated archive bycatch cannot enter a lesson merely because their metadata says Python.',
    'A source dependency becomes resolved only when source ID, locator, quotation, semantic claim, and learner-visible rendered location form one inspectable chain. URL-only and extraction-only rows remain review-required.',
  ],
  landingHighlights: [
    'Release proof must exist in Git and match its digest.',
    'Missing benchmark numbers fail closed.',
    'Artifact placeholders cannot impersonate evidence.',
    'Blind judging records its identity and order.',
    'Broad Python-package bycatch is quarantined.',
    'Resolved sources must reach a rendered claim.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.08.json',
    roadmap: 'docs/V0.17.08_EVIDENCE_AND_SOURCE_ADMISSION_RECOVERY.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.08-browser-preflight.json',
      sha256: '8fa3d2f79d6fd25f01b52da4e188e04a6c1f2d972690f584d0697fa484f3fc43',
      bytes: 1496,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
