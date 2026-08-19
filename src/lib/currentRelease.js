import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 19, 2026',
  title: 'The Free Product Promise',
  landingTitle: 'EDUTOOL V0.18.4 Is Free—Without an Upsell',
  highlights: [
    'The paid concierge pilot is gone from the landing page, contact path, privacy policy, terms, README, public sample, inquiry template, sitemap, and discovery metadata.',
    'Course Mapper now states the product promise plainly: it is free and will stay free, with no paid tier, subscription, or concierge upsell.',
    'Search, social, and structured discovery data describe the free local-first browser workspace and publish a zero-dollar application offer without a paid-promotion asset.',
    'General support remains available, and users may still choose external providers with their own keys; those provider charges are not an EDUTOOL fee or paid product tier.',
  ],
  landingHighlights: [
    'Remove the paid pilot everywhere.',
    'Promise one permanently free product.',
    'Keep discovery metadata honest and free.',
    'Preserve support without an upsell.',
  ],
  proof: {
    contract: 'release-contracts/v0.18.4.json',
    roadmap: 'docs/EDUTOOL_V0184_FREE_PRODUCT_PROMISE.md',
    benchmark: {
      path: 'evaluation/v0.18.4-free-product-benchmark.json',
      sha256: '97a7078387749721d2d30e88856cb7c264e81cd2d08ac78d6e28b216948ab11f',
      bytes: 1923,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.18.4-browser-acceptance.json',
      sha256: '6dd8d2d6a5dcce8260765eb2f265ffd31e982b9300ed1f33598983e83fa9897f',
      bytes: 1684,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.18.4-production-package-attestation.json',
      sha256: 'ef03a1ee7706b03ffb708693c3b1cd5d13807a1e69416b2af1ce86a30f9bd96c',
      bytes: 1246,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
