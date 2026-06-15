export const CURRENT_RELEASE = {
  version: '0.15.5',
  date: 'June 14, 2026',
  title: 'The Truth Ledger: the changelog becomes a contract',
  landingTitle: 'The Truth Ledger: release history with receipts',
  highlights: [
    'Release metadata now has one current source: package version, app version, latest-release popover, top changelog entry, and workspace/config/footer labels all derive from the release manifest.',
    'The changelog keeps v0.15.5 as the generated current entry while preserving v0.15.4 as a historical contract-backed release instead of burying the truthfulness work.',
    'Current release claims now require a machine-readable contract with claim ids, changelog indexes, code/doc anchors, proof commands, and proof-scope labels.',
    'The old v0.15.4 "Moving the Means" roadmap is explicitly marked superseded/carry-forward, with the remaining depth, judge-mean, instructor, and diet lanes moved into future work instead of implied as shipped.',
    'Release-history audit now fails on version drift, missing contracts, stale footer versions, stale default comments, missing roadmap sections, invalid claim metadata, duplicate claim indexes, or anchors that no longer exist.',
    'Remote proof is now named honestly: local proof, fast CI, deep CI, live-provider proof, and manual-human proof are separate contract buckets, so a release cannot imply current deep proof without recording the run.',
  ],
  landingHighlights: [
    'Version labels, release popovers, and the first changelog entry now agree because they are generated from one manifest.',
    'Each current changelog claim has a contract entry with code anchors and proof commands, and the audit script proves those anchors still exist.',
    'Deep proof, live-provider proof, and human review are no longer blurred into one vague testing story; the contract says exactly what was proved and what is pending or not applicable.',
  ],
  proof: {
    contract: 'release-contracts/v0.15.5.json',
    roadmap: 'docs/V0.15.5_TRUTH_LEDGER_ROADMAP.md',
    auditCommand: 'npm run audit:release-history',
  },
};

export const APP_VERSION = CURRENT_RELEASE.version;

export const CURRENT_RELEASE_CHANGELOG = {
  version: CURRENT_RELEASE.version,
  date: CURRENT_RELEASE.date,
  title: CURRENT_RELEASE.title,
  highlights: CURRENT_RELEASE.highlights,
};

export const HISTORICAL_RELEASE_CHANGELOGS = [
  {
    version: '0.15.4',
    date: 'June 14, 2026',
    title: 'Truthful Course Packages: the audit catches what teachers see',
    highlights: [
      'Linear Algebra no longer inherits the wrong lab identity: "Computational lab in Python" stays computational, while physical supplies still appear for real wet-lab courses with specimens, safety equipment, hand lenses, or field notebooks.',
      'Sparse secondary course-map rows now repair from their own topic before borrowing from sibling sections, so "dimension" does not carry "bases" objectives/resources and review/exam rows stop inheriting stale topic content.',
      'Assessment identity is stricter: problem sets and computational labs about midterm/final review stay graded artifacts instead of becoming full exam records.',
      'Study guides keep topic-specific language after title compression; the pass no longer creates learner-facing phrases like "this lesson criterion" or generic "the lesson" questions.',
      'Math slide decks gain deterministic Linear Algebra worked examples when enrichment is missing, including chartable numeric steps for systems, matrices, determinants, bases, projections, eigenvalues, and SVD.',
      'The package grader now flags physical wet-lab Required Assets in non-wet-lab courses, generic lesson-artifact placeholders, and unevaluated structured-STEM judgments, so these packages cannot quietly claim a perfect 100/A.',
    ],
  },
];
