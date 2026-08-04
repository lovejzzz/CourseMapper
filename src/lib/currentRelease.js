import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 4, 2026',
  title: 'Truth Before Training',
  landingTitle: 'EDUTOOL V0.17.13 Makes Scion Earn What It Learns',
  highlights: [
    'Browser-side Scion events can no longer authorize their own training rows: same-model repairs stay diagnostic, the flywheel re-runs pair admission, and semantic evidence remains an offline source-bound responsibility.',
    'Scion now asks bounded, issue-specific questions only after local recovery is exhausted; rejected answers are withheld, authorized source indexes stay fixed, and strict selection keeps a valid control when teacher advice regresses.',
    'The first preregistered source holdout remains an explicit negative result because five of twelve reference seeds were invalid; its audit machinery is retained while every teacher-policy, adapter, and production promotion stays blocked.',
    'A new Truth Gate binds each candidate to a bounded source excerpt, canonical source identity, prompt and project identity, strict pedagogy checks, and exact plus conservative semantic source-disjointness checks.',
    'Review receipts are derived only from machine-readable verdicts inside sealed Roundtable messages signed by a bridge key frozen before review; complete schemas, immutable raw-review hashes, distinct reviewers, and unanimous verdicts fail closed.',
    'A source-disjoint six-seed pilot spans computer science, geology, and music theory and exercises the signed dual-review gate without running Scion or converting structural admission into a model-quality score.',
    'The twelve-case learning holdout remains blocked until discovery quotas and the executable review gate both pass; V0.17.13 freezes safer learning infrastructure, not learned weights, factual certification, instructor approval, or classroom outcomes.',
  ],
  landingHighlights: [
    'Scion cannot grade its own homework into training data.',
    'Student questions stay bounded to the failure at hand.',
    'Invalid gold seeds remain failed evidence.',
    'Sources are captured, bound, and checked for reuse.',
    'Independent verdicts come from pre-registered signed messages.',
    'The pilot tests the gate, not the model.',
    'The next holdout stays blocked until every condition is real.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.13.json',
    roadmap: 'docs/V0.17.13_SCION_TRUTH_GATE_CHECKPOINT.md',
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
    auditCommand: 'npm run audit:release-history',
  },
};
