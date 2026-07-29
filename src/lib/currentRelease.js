import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 29, 2026',
  title: 'Measured Texture, Receipted Realization',
  landingTitle: 'Scion V0.16.97 Measures and Reduces Cross-Course Repetition',
  highlights: [
    'Scion now has a reproducible cross-package texture evaluator instead of relying on one package’s “Texture” badge. It extracts learner-visible units from all nine material families, classifies scaffolding, intentional alignment, and teaching prose explicitly, and reports every unclassified visible path.',
    'The ruler separates support burden, reader exposure, cross-package excess, and within-package excess. Raw, input-masked, path-free, path-aware, and same-position views prevent a single percentage from hiding whether repetition comes from user input, one template position, or actual cross-course reuse.',
    'Compiler realization tracing is opt-in, bounded, non-enumerable, and excluded from normal JSON. Receipts identify the pool owner, selected index, pool size, lesson, selected text, and consumed lesson slots while regression proof confirms that traced and ordinary compilation serialize identically.',
    'Repairs target proven high-salience owners instead of adding global synonyms. Assignment, study-guide, lesson-plan, slide, and discussion moves now compose from stable lesson context. Browser acceptance also fixed exact imperative titles and ordered sequences, Data Storytelling identity, duplicate terminal assessments, cross-lesson Agent grounding, source-scope citation grading, evidence-bound quiz depth, and narrow assignment cards at their actual owners.',
    'On the frozen 12-course cold-floor panel, support burden falls from 6.29% to 5.84%, reader exposure from 10.91% to 9.78%, cross-package excess from 7.97% to 6.75%, and within-package excess from 2.71% to 1.82%. Universal teaching-prose clusters fall from 31 to zero. On the retained 10-course real fixture panel, support burden falls from 10.22% to 9.11% and cross-package excess from 14.94% to 13.35%.',
    'The pre-repair baselines are immutable compressed artifacts with deterministic input hashes and canonical result bytes. Thin and retained-real profiles use the same evaluator; fast CI verifies their receipts, while Deep Proof recompiles both panels and fails any regression beyond the frozen tolerances.',
    'Release metadata is split from the historical changelog, so the landing route loads one small current-release record instead of the full archive. Provenance mechanics and new teaching-copy families also live in compiler-only cache leaves, keeping the landing bundle flat and the core compiler below its shipped byte ceiling.',
    'Six new browser courses across data storytelling, music, UX, astronomy, supply chain, and environmental ethics all reach the requested lesson count, complete every kernel and material family, report zero encoded findings, and download integrity-clean ZIPs in 3–29 seconds. This remains automated engineering evidence: Gemma weights and the inactive adapter are unchanged, and no factual, instructor, accessibility, classroom, or paid-model superiority claim is made.',
  ],
  landingHighlights: [
    'Cross-course repetition now has a reproducible ruler.',
    'Input, path, position, and provenance effects are separated.',
    'Optional receipts expose the compiler owner without changing output.',
    'Measured owners and browser-discovered defects are repaired.',
    'Universal cold-floor teaching collisions fall from 31 to zero.',
    'Frozen baselines become enforceable CI ratchets.',
    'Landing no longer loads the historical release archive.',
    'Six browser courses finish green; claim boundaries stay unchanged.',
  ],
  proof: {
    contract: 'release-contracts/v0.16.97.json',
    roadmap: 'docs/SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md',
    benchmark: 'verification-output/cross-package-texture/baseline-v1-thin.json.gz',
    browser: 'docs/SCION_V01697_CROSS_PACKAGE_TEXTURE_PROOF.md',
    auditCommand: 'npm run audit:release-history',
  },
};
