import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 30, 2026',
  title: 'Causal Texture, Enforced Ratchets',
  landingTitle: 'Scion V0.16.98 Makes Cross-Course Quality Regressions Unmergeable',
  highlights: [
    'The published cross-package summary now exposes total clusters, the K=2 pair-local bucket, support distribution, exact provenance coverage, and input-mask versus consumed-slot divergence. The retained receipts can no longer tell a more qualified story than the human-readable report.',
    'The no-regression comparator keeps broad improvement rates against the immutable pre-repair baseline while freezing V0.16.97’s post-repair support shape. It fails on any K=2 increase, growth in an existing cluster’s support or occurrences, a new universal high-salience cluster, or an unclassified visible path.',
    'Opt-in finalized-string realization receipts raise causal teaching-prose coverage from 3.7% to 90.01% on the 12-course thin panel and from 1.3% to 92.13% on the 10-course gold panel. Traced and ordinary complete packages still serialize byte-identically, and normal website generation does not enable the receipt.',
    'The causal view reveals a real sparse-brief weakness: thin-panel reader exposure is 38.47% after masking only slots the compiler actually consumed, versus 9.78% under broad input masking. Gold is 19.40% versus 19.32%. This is characterization for the next targeted repair, not a production-rate or quality-victory claim.',
    'Fast verification now recompiles both retained panels and applies the real comparator instead of only checking that baseline files are readable. The aggregate Fast verification status is the protected-branch merge gate; Deep Proof remains the slower defense-in-depth lane.',
    'Repository growth accounting now freezes the entire course compiler family—courseBlueprintCompiler.js plus every courseCompiler*.js leaf—so moving logic into a new cacheable module cannot masquerade as a compiler reduction. Trellis status prose is also normalized to the actual E1-green, E2-not-run ledger.',
  ],
  landingHighlights: [
    'K=2 clusters and provenance coverage are visible.',
    'Pair-local and cluster-growth regressions fail.',
    'Causal coverage reaches 90% on both retained panels.',
    'Sparse-brief fallback exposure is reported honestly.',
    'The real comparator runs before merge.',
    'The compiler-family ratchet sees extracted modules.',
  ],
  proof: {
    contract: 'release-contracts/v0.16.98.json',
    roadmap: 'docs/SCION_V01698_CAUSAL_TEXTURE_ENFORCEMENT.md',
    benchmark: 'verification-output/cross-package-texture/baseline-v1-thin.json.gz',
    browser: 'docs/SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md',
    auditCommand: 'npm run audit:release-history',
  },
};
