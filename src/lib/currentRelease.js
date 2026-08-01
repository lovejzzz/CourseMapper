import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'August 1, 2026',
  title: 'Auditable Evidence, Distinct Teaching',
  landingTitle: 'EDUTOOL V0.17.09 Makes Every Quality Point Explainable',
  highlights: [
    'Package manifests now serialize the operational finish state, human trust state, warning and blocker domain ledgers, export integrity, and content disposition so a downloadable ZIP cannot silently become a clean publishing claim.',
    'The exporter no longer manufactures curated sources. Only evidence admitted during the authoring run can enter the package ledger; thin provenance remains visibly thin and review-required.',
    'P1 and P2 quality findings plus deterministic CurriculumV1 reconstruction enter the review channel, while the interface says “exportable with review notes” instead of calling warning-bearing work ready.',
    'The exact hyphenated lesson-count contract is preserved, and Python data-analysis courses now require a dataset, data dictionary, notebook, and script before their requested lab workflow can be complete.',
    'A fixed 100-point deterministic evidence ledger separates earned, lost, and unobserved points. Every rule carries its observed evidence, exact predicate, confidence basis, anti-gaming controls, reason, and concrete improvement action; missing evidence can never improve the score.',
    'SCORE_LEDGER.json preserves replayable conformance deductions and P0/P1 caps, binds the exact graded artifact inventory, and is SHA-256 linked from the manifest. Legacy, stale, invalid, and verified ledgers are distinct states; handoff logic no longer scrapes report prose or trusts an unexplained score threshold.',
    'Distinct deliverable families rotate among admitted facts and terminology, verified quiz evidence keeps priority, and short title finalization preserves meaningful complements instead of creating dangling labels.',
  ],
  landingHighlights: [
    'Trust and downloadability are separate claims.',
    'Export never invents research evidence.',
    'Review findings stay visible at handoff.',
    'Requested Python lab assets are required.',
    'Every quality point has a reason.',
    'Score ledgers bind the graded artifacts.',
    'Artifacts use different admitted anchors.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.09.json',
    roadmap: 'docs/V0.17.09_HONEST_HANDOFF_AND_OUTPUT_DIVERSITY.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.09-browser-preflight.json',
      sha256: '41b53399cfde328f4881656d119e4048686554db1b85403eb0b1504976eac254',
      bytes: 3119,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
