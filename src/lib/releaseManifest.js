import { APP_VERSION } from './appVersion.js';

export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'June 19, 2026',
  title: 'CurriculumV1 Source Truth: healthy native plans compile from the brain',
  landingTitle: 'CurriculumV1 Source Truth',
  highlights: [
    'Healthy native assembly now validates the Pass A/Pass B wire map as CourseIR and projects the compile graph from CurriculumV1 before any deliverable compiler runs.',
    'Native source surfaces stay honest during that projection: real instructor readings remain readings, real resources remain resources, and CourseIR support notes no longer inflate the resource registry.',
    'The run digest/log trail now marks healthy native generation as a CurriculumV1 source graph, while repaired sparse plans keep their explicit CurriculumV1 repair disclosure.',
    'Downloaded package manifests now include `courseIR.nativeAssembly` proof for healthy native CourseIR projection, including whether later map edits occurred after projection.',
    'Course-map edits on CurriculumV1-projected native graphs keep stable native entity ids, preserving the B4 re-derive behavior while the graph remains marked as CourseIR-authored.',
  ],
  landingHighlights: [
    'Healthy native plans compile from a validated CourseIR brain.',
    'Readings/resources stay honest through CurriculumV1 projection.',
    'ZIP manifests disclose healthy native CourseIR projection proof.',
  ],
  proof: {
    contract: 'release-contracts/v0.15.16.json',
    roadmap: 'docs/V0.15.16_CURRICULUMV1_SOURCE_TRUTH_ROADMAP.md',
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
    version: '0.15.15',
    date: 'June 19, 2026',
    title: 'CurriculumV1 Native Repair: sparse native plans stop falling back',
    highlights: [
      'CurriculumV1 now carries more of the course brain: constraints, prerequisite concept links, source ledger repair, lesson concept repair, and under-assessed course repair are validated before graph compilation.',
      'Native assembly no longer treats the common one-assessment skeleton as an automatic prose fallback. Recoverable sparse native graphs repair through CurriculumV1 first, return a CourseIR-backed graph, and log the repair explicitly.',
      'Downloaded package manifests now carry slim CourseIR/native-repair proof metadata, so exported ZIPs can disclose whether a package came from a repaired curriculum graph instead of hiding the recovery path.',
      'The genome gained an introductory research-methods shard and coverage tests, improving the grounding layer for hypothesis, variables, operational definitions, causation, and informed-consent courses.',
      'The proof is broad because this touches compiler architecture: targeted native/CourseIR/package/genome tests, full unit suite, constitution audit, build, bundle budget, and all 40 gold samples pass locally.',
    ],
  },
  {
    version: '0.15.14',
    date: 'June 19, 2026',
    title: 'Teacher-Ready Constitution: package quality gets a fast standard',
    highlights: [
      'The Teacher-Ready Package Constitution now defines seven non-negotiable obligations for generated packages: identity coherence, complete structure, assessment coverage, caveat honesty, discipline fit, artifact substance, and clear handoff.',
      'A machine-readable `quality-constitution/v1.json` contract names `npm run audit:constitution` as the fast package-safety release gate while keeping `npm run audit:gold` for scheduled broad regression and large compiler/generator changes.',
      'Five canonical fixtures now probe distinct structural risks: a clean package, hidden digest caveat, missing assessment artifact, wrong-discipline assets, and a green handoff with thin artifacts.',
      'The deterministic constitution audit evaluates those fixtures without provider calls and writes both JSON and Markdown reports under `verification-output/constitution-audit/`.',
      'Focused Vitest coverage pins the npm script wiring, contract policy, fixture set, and report output so narrow quality releases no longer need the full 40-sample gold corpus as default proof.',
    ],
  },
  {
    version: '0.15.13',
    date: 'June 19, 2026',
    title: 'Native Fallback Audit Truth: digest caveats reach generated packages',
    highlights: [
      'A live EduTool.dev Microeconomics package exposed a report-truth gap: the run digest recorded a native-authoring prose fallback, but the shipped package report only showed the assessment-coverage observation.',
      'The deep package grader now converts digest `pipeline.nativeAuthoring` prose fallbacks into scored P2 honesty findings, including the evidence string from the run digest.',
      'When the package manifest omits that native-authoring fallback, the quality report names the missing disclosure explicitly instead of letting the ZIP look cleaner than the run that created it.',
      'Regression coverage now builds a package with a digest-only native fallback and regrades the downloaded-ZIP path, proving the report surfaces the caveat and the manifest omission.',
      'The release keeps the CourseIR one-call compiler architecture as carry-forward work; this patch improves the current audit/report layer without changing provider-call routing.',
    ],
  },
  {
    version: '0.15.12',
    date: 'June 19, 2026',
    title: 'Prompt Artifact Precision: worked examples stop false-positive grading',
    highlights: [
      'A live EduTool.dev astronomy run proved the v0.15.11 Course Map firewall held, but also exposed an overbroad grader P1 when “worked examples” appeared as an ordinary supporting resource.',
      'Prompt artifact detection now keeps “worked examples” suspicious as a numbered lesson topic while allowing normal FAQ and resource phrasing such as worked examples, readings, or activity sheets.',
      'The stricter P0 behavior remains intact for multi-label Course Map leakage, so requested deliverables still cannot masquerade as lesson concepts.',
      'Regression coverage now includes the exact astronomy false-positive shape alongside the environmental-science contamination blocker and instructional-design exemption.',
      'The release keeps the CourseIR one-call architecture as carry-forward work; this patch tunes the shipped grader without changing the generation architecture.',
    ],
  },
  {
    version: '0.15.11',
    date: 'June 19, 2026',
    title: 'Prompt Artifact Firewall: requested deliverables stop becoming lesson concepts',
    highlights: [
      'A live EduTool.dev environmental-science run exposed prompt artifact contamination: “lesson plans,” “slide decks,” “assignment briefs,” and related requested deliverables became course-map topics while the package still reported 99/A.',
      'Course-map readiness repair now treats prompt artifact labels as invalid topic candidates for normal disciplinary courses and rewrites contaminated cells from the real lesson topic before compilation.',
      'The Crucible grader now scores prompt artifact contamination as a package defect, with multi-label course-map contamination becoming a P0 so a polished ZIP cannot hide unusable lesson concepts behind an A badge.',
      'Regression coverage pins both layers: the repair test proves contaminated environmental-science sections return to ecosystems, and the grader test proves the old ZIP shape regrades as unsafe instead of clean.',
      'The release keeps the CourseIR one-call architecture as carry-forward work; this patch narrows the current shipped path while CourseIR remains behind proof gates.',
    ],
  },
  {
    version: '0.15.10',
    date: 'June 19, 2026',
    title: 'CourseIR Architecture: one canonical course brain before compilation',
    highlights: [
      'CourseIR v1 now normalizes and validates a dense course source of truth with source-ledger, concept, lesson, assessment, repair-path, and coverage-ledger checks.',
      'The dense prompt contract asks providers for semantic atoms instead of final artifact prose: lesson kernels, concept graph, factual anchors, examples, and assessment blueprints.',
      'The model-capacity planner chooses one whole-course IR call when safe, or the fewest sharded IR calls when output caps, reserve, reliability, or cost require it.',
      'The CurriculumOS compiler facade accepts CourseIR and deterministically renders selected package artifacts through the existing CourseGraph/blueprint path with zero provider calls.',
      'CourseIR proof metadata can ride into package assembly, while the default product flip still waits for flagged 5-, 8-, and 15-lesson quality/cost comparisons.',
    ],
  },
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
