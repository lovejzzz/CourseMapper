import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 1, 2026',
  title: 'Quality Evidence Without Score Inflation',
  landingTitle: 'EDUTOOL V0.17.10 Says What Every Quality Point Actually Proves',
  highlights: [
    'The deterministic evidence report now separates narrow positive metrics, negative-evidence-only conformance, and unobserved constructs instead of presenting every earned point as positive teaching-quality evidence.',
    'Package-specific attainable and evidence ceilings are derived from evaluated rules. The verifier pins and replays the canonical rule and conformance protocols, then checks every displayed component instead of trusting balanced totals.',
    'Python in a policy topic no longer misclassifies a memo as a code lab. Genuine code labs retain dedicated computational directions and now receive matching correctness, code-clarity, verification, and revision performance bands.',
    'Compiler-owned language fixes prevent article collisions, preserve conjunctions in compact evidence labels, stop dangling concept-map identities, and remove duplicated answer-key prefixes at the DOCX boundary.',
    'Cached quality is reusable only when its structured package-readiness binding exactly matches the current export; blocker-shaped prose cannot authorize a stale or mutually rewritten score.',
    'Rendered-claim grounding and objective-task-rubric coherence remain unobserved until post-render, calibrated protocols exist; this release does not turn structural receipts or one regression fix into semantic credit.',
    'A six-round code-and-package audit plus a separate three-round adversarial code audit record the reproduced defects, verifier exploits, rejected shortcuts, implemented owners, and remaining limits.',
  ],
  landingHighlights: [
    'Positive metrics and no-defect credit are separate.',
    'Canonical rules are replayed, not trusted.',
    'Policy work is not mislabeled as a code lab.',
    'Code-lab rubrics grade code evidence.',
    'Cached scores require exact current readiness.',
    'Concept labels remain complete identities.',
    'Missing semantic evidence stays unobserved.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.10.json',
    roadmap: 'docs/V0.17.10_ROUNDTABLE_OUTPUT_QUALITY_AUDIT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.10-browser-preflight.json',
      sha256: '3112d613009fe2e21301662395ff9f166915bda4840762967f051a951e545e38',
      bytes: 2846,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
