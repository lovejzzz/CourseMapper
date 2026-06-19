import { APP_VERSION } from './appVersion.js';

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'June 19, 2026',
  title: 'CourseIR Architecture: one canonical course brain before compilation',
  landingTitle: 'CourseIR Architecture',
  highlights: [
    'The next architecture lane is CourseIR-first: one dense, validated course source before deterministic package compilation.',
    'The design rejects one giant final-prose blob and asks the model for compact semantic atoms: lesson kernels, concept graph, factual anchors, examples, and assessment blueprints.',
    'The model-capacity plan chooses one whole-course IR call when safe, or the fewest sharded IR calls when output caps, reserve, reliability, or cost require it.',
    'The compiler contract is explicit: final ZIP materials decode from CourseIR through deterministic adapters, schema checks, coverage checks, and path-scoped repairs.',
    'The proof ladder is set before implementation: flagged 5-, 8-, and 15-lesson comparisons of calls, cost, deep-grade findings, digest caveats, export parity.',
  ],
  landingHighlights: [
    'One canonical CourseIR before package compilation.',
    'Model-capacity planning chooses one-call or fewest-call sharding per provider.',
    'Implementation proof is defined before the feature flag flips.',
  ],
  proof: {
    contract: 'release-contracts/v0.15.10.json',
    roadmap: 'docs/V0.15.10_COURSEIR_ARCHITECTURE_ROADMAP.md',
    auditCommand: 'npm run audit:release-history',
  },
};

export { APP_VERSION };

export const CURRENT_RELEASE_CHANGELOG = {
  version: CURRENT_RELEASE.version,
  date: CURRENT_RELEASE.date,
  title: CURRENT_RELEASE.title,
  highlights: CURRENT_RELEASE.highlights,
};

export const HISTORICAL_RELEASE_CHANGELOGS = [
  {
    version: '0.15.9',
    date: 'June 19, 2026',
    title: 'Provider Call Rightsizing: the course package stops paying for avoidable batches',
    highlights: [
      'Native Pass B now batches by real model output capacity, so long-output structured models can author a normal 15-lesson course in one enrichment call.',
      'Native recovery stops after a no-progress retry instead of spending again on the same missing lesson set.',
      'The voice pass sends the selected eight-surface set in one fixed 4k-output call.',
      'GPT-5.4/GPT-5.5 context metadata is current, and model-limit lookup prefers the most specific model prefix.',
    ],
  },
  {
    version: '0.15.8',
    date: 'June 19, 2026',
    title: 'EduTool Audit Truth: generated packages stop looking cleaner than they are',
    highlights: [
      'Package quality now scores run-digest caveats from real EduTool exports, including partial enrichment/template fallback and course-map assessment coverage gaps.',
      'Saved DevTools logs are scoped to the current run digest before honesty checks, so stale rows from earlier generations cannot create false genome-count P1s.',
      'The finished-package overview surfaces P0/P1 quality caveats beside the grade with a compact review chip that opens the detailed quality report.',
      'Assignment Brief DOCX exports render an explicit handoff note for lessons with no standalone submitted assignment instead of shipping a title-only file.',
      'The grader now flags title-only assignment briefs as substantive P1 package defects, using the live Introduction to CS Lesson 14 failure shape as regression coverage.',
      'Slide decks collapse course-title echo chains in title bullets and speaker notes, preventing "course: course" repetition in first-lesson decks.',
    ],
  },
  {
    version: '0.15.7',
    date: 'June 17, 2026',
    title: 'Finished Package Surface: ready means handoff, not audit work',
    highlights: [
      'Ready Course Map now opens to a finished-package overview instead of the dense editable table, with Edit course map one click away.',
      'The overview summarizes lesson count, material readiness, quality/texture, safe repairs, export checks, and material shortcuts while the side panel remains the single package export surface.',
      'The agent panel enters compact ready mode: project-brief strip, working-set panel, opener buttons, and old queue cards are hidden while the package receipt and chat input remain available.',
      'Finished-package material cards jump directly to generated artifact tabs, while the Course Map card opens the editable map only when requested.',
      'The v0.15.7 release contract and tests pin the overwhelmed-ready-state fix separately from v0.15.6 backend/grader truth work.',
      'Browser smoke remains part of the proof path so the download handoff is exercised in a real workspace before the release is trusted.',
    ],
  },
  {
    version: '0.15.6',
    date: 'June 17, 2026',
    title: 'Classroom Truth: coverage, texture, and ready states get stricter',
    highlights: [
      'Anatomy and Physiology I now has a source-anchored anatomy genome shard, so the linker can cover real A&P lessons instead of calling one weak concept match clean.',
      'Native authoring recovers missing skeleton resources instead of falling back to prose when Pass A names resources but the skeleton omits them.',
      'Required Assets now classifies A&P as an anatomy lab course with models, histology slides, lab manuals, and specimen/model policy; the grader flags geology or chemistry field kits in A&P packages.',
      'Texture is score-bearing: repeated package templates and low texture now create findings, so 100/A cannot hide same-pattern prose.',
      'Ready-state UI is calmer and more truthful: weak knowledge coverage says "Limited knowledge check", material coverage is not confused with learning coverage, duplicate ZIP CTAs are hidden, and dependency tooltips use plainer wording.',
      'Genome builds are reproducible again: anatomy and physics foundry sources validate cleanly and rebuild the shipped shards from explicit source files.',
    ],
  },
  {
    version: '0.15.5',
    date: 'June 14, 2026',
    title: 'The Truth Ledger: the changelog becomes a contract',
    highlights: [
      'Release metadata now has one current source: package version, app version, latest-release popover, top changelog entry, and workspace/config/footer labels all derive from the release manifest.',
      'The changelog keeps v0.15.5 as the generated current entry while preserving v0.15.4 as a historical contract-backed release instead of burying the truthfulness work.',
      'Current release claims now require a machine-readable contract with claim ids, changelog indexes, code/doc anchors, proof commands, and proof-scope labels.',
      'The old v0.15.4 "Moving the Means" roadmap is explicitly marked superseded/carry-forward, with the remaining depth, judge-mean, instructor, and diet lanes moved into future work instead of implied as shipped.',
      'Release-history audit now fails on version drift, missing contracts, stale footer versions, stale default comments, missing roadmap sections, invalid claim metadata, duplicate claim indexes, or anchors that no longer exist.',
      'Remote proof is now named honestly: local proof, fast CI, deep CI, live-provider proof, and manual-human proof are separate contract buckets, so a release cannot imply current deep proof without recording the run.',
    ],
  },
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
