import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 30, 2026',
  title: 'One Finish Record',
  landingTitle: 'Scion V0.17.00 Makes Package Trust Order-Independent and Auditable',
  highlights: [
    'Package blocking is derived from every quality finding through one shared policy, not from whichever finding happens to appear first. Severity ordering keeps late P0 findings visible while preserving the deliberate partial-scope discipline-density exemption.',
    'Finalize grading carries a compact structured source-evidence snapshot from the assembled ZIP manifest into the finish record. Trust surfaces can now show exact source findings instead of reading receipt fields that no producer writes.',
    'New finishes publish one versioned warning-domain ledger for readiness, retry, export, quality, and source evidence. Source findings are assigned to one domain, ready receipts retain their detail, and legacy saved passes keep an explicit fallback.',
    'Completed repair and export summaries remain visible on warning-bearing downloadable packages. The component regression now uses the same warning shape the finalizer produces.',
    'The six-round Roundtable audit is retained as a code-backed report with verified findings, implementation disposition, and intentionally deferred workflow-state work.',
    'V0.17.00 is a package-trust stabilization release. It does not claim new model weights, adapter promotion, factual certification, instructor validation, accessibility certification, or classroom outcomes.',
  ],
  landingHighlights: [
    'Every P0 participates in the package gate.',
    'Late blockers remain visible.',
    'Source proof survives finalization.',
    'Warnings have one named owner.',
    'Ready receipts keep their evidence.',
    'Warning-bearing summaries remain visible.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.00.json',
    roadmap: 'docs/ROUNDTABLE_PROJECT_REVIEW_2026-07-30.md',
    benchmark: 'src/lib/__tests__/packageTrustStatus.test.js',
    browser: 'src/components/__tests__/ExportSidePanel.readiness.test.jsx',
    auditCommand: 'npm run audit:release-history',
  },
};
