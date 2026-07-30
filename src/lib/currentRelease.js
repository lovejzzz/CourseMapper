import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'July 30, 2026',
  title: 'Discipline-Safe Sparse Briefs',
  landingTitle: 'Scion V0.16.99 Turns Sparse Briefs into Discipline-Correct Courses',
  highlights: [
    'The measured sparse-brief repair replaces generic whole-sentence fallbacks with course-aware teaching lenses and contextual realization. On the 12-course thin panel, input-mask/path-free clusters fall from 536 to 502, K=2 clusters from 195 to 181, reader exposure from 9.78% to 9.01%, and cross-package excess from 6.75% to 6.23%.',
    'The strong-source gold panel holds while the real no-regression comparator passes: reader exposure is 18.87%, cross-package excess is 12.93%, no retained cluster grows, no new universal high-salience frame appears, and compiler-frame provenance coverage remains 92.13%.',
    'Knowledge now fails closed at discipline boundaries. Unclassified courses cannot silently borrow an unrelated genome shard, and canonical source families plus course-aware gates reject database and oral-history false friends before they reach a lesson ledger.',
    'Database retrieval now distinguishes enterprise BTM from transactions, moral integrity from data integrity, and relational algebra from a mathematics answer-check frame. Compact exact subsets of a verified fact ledger retain their citations without admitting paraphrases or new claims.',
    'A fresh Database Systems browser course finishes in 35 seconds with 8/8 grounded lessons, 9/9 material families, 65/100 Automated Readiness, 100/100 evidence grounding, 99/A package conformance, zero encoded findings, 22 source receipts, and complete source-reference coverage in the physical ZIP.',
    'A same-brief Community Oral History course improves from 48 to 29 seconds, readiness 58 to 62, evidence grounding 61 to 84, specificity 97 to 98, and texture 95 to 96. The final UI and ZIP remove Western-civilization, wastewater, UX prototype, and pronunciation/fluency false friends while retaining zero encoded findings.',
    '“Oral History” no longer means “oral performance.” Real presentations, speaking tasks, performances, defenses, and exams keep their speaking rubric; oral-history assignments compile as interview/transcript evidence work with narrator context and consent boundaries.',
    'This release changes the shared compiler, evidence router, source admission, and assessment classifier. Gemma weights remain unchanged, the optional adapter remains inactive, and no factual, instructor, accessibility, classroom, or paid-model superiority claim is made.',
  ],
  landingHighlights: [
    'Sparse briefs use discipline-aware teaching moves.',
    'Cross-course fallback exposure falls measurably.',
    'Unclassified knowledge reuse fails closed.',
    'Database and oral-history false friends are blocked.',
    'Source receipts survive compact exact selection.',
    'Fresh browser courses finish green and export cleanly.',
  ],
  proof: {
    contract: 'release-contracts/v0.16.99.json',
    roadmap: 'docs/SCION_V01699_DISCIPLINE_SAFE_SPARSE_BRIEFS.md',
    benchmark: 'verification-output/cross-package-texture/baseline-v1-thin.json.gz',
    browser: 'docs/SCION_V01699_DISCIPLINE_SAFE_SPARSE_BRIEFS.md',
    auditCommand: 'npm run audit:release-history',
  },
};
