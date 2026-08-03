import { APP_VERSION } from './appVersion.js';

/**
 * The one small release record needed on first paint. Historical releases stay
 * in releaseManifest.js and load only with the changelog surface.
 */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  checkpointPhase: 'predeploy',
  date: 'August 3, 2026',
  title: 'Learner-Ready Course Work',
  landingTitle: 'EDUTOOL V0.17.12 Makes the Assignment Match the Learning',
  highlights: [
    'Assignment genre is inferred from each lesson’s actual work before broad course defaults, so an automated-testing lesson becomes a code lab and an explicit policy-memo capstone becomes a policy brief.',
    'Code-lab briefs now require executable source or a notebook, a clean-start command, initially failing and then passing test evidence, a normal case, a boundary or error case, and a short debugging record.',
    'Policy-memo briefs now require a public problem, affected population, decision maker, at least two feasible options, stakeholder and equity effects, tradeoffs, a recommendation, implementation ownership, risk, and monitoring.',
    'Every assignment and rubric exports its retained evidence packet and strong/partial anchor contrast, while page grouping keeps anchor samples and milestone checklists attached to their labels.',
    'Confidence-interval language is repaired at the content boundary, including abbreviated CL forms, so learner materials describe repeated-procedure coverage without assigning probability to a fixed parameter.',
    'PowerPoint pitfall headings use renderer-safe sizing, wide course maps retain readable print scale with repeated identity columns, and bundled automated-testing assets execute as a real three-test starter suite.',
    'A fresh six-lesson Applied Civic Data Analysis recompile is byte-reproducible and grades 99/A with zero P0, P1, or P2 findings; rendered Office inspection remains engineering evidence, not instructor approval or classroom validation.',
  ],
  landingHighlights: [
    'Testing lessons assign real testing work.',
    'Policy memos require real policy decisions.',
    'Evidence packets and anchor samples reach the exported files.',
    'Statistical claims keep their uncertainty boundary.',
    'Slides and wide course maps render safely.',
    'Starter tests run from the downloaded package.',
    'The score stays honest about what it does not prove.',
  ],
  proof: {
    contract: 'release-contracts/v0.17.12.json',
    roadmap: 'docs/V0.17.12_LEARNER_CHECKPOINT.md',
    benchmark: {
      path: 'evaluation/algi/algi-scion-hybrid-benchmark-v1.json',
      sha256: 'e2e1dd2ac702323284aaf2cb40194768db6af3faf4cf42536155b9bed9c5ac30',
      bytes: 3412,
    },
    browser: {
      path: 'evaluation/release-proofs/v0.17.12-browser-preflight.json',
      sha256: '5ba7445dc4363fb5a995517679ed762e2ff3dd03f5a11d455b948ae89c36d1a3',
      bytes: 1695,
    },
    productionCourseContract: {
      path: 'evaluation/release-proofs/v0.17.12-production-course-contract.json',
      sha256: '5182b64ba6314013de3e6b7e473f807d98a2fbcf0fb9dbb6d8df11f896c45d60',
      bytes: 2578,
    },
    productionPackageAttestation: {
      path: 'evaluation/release-proofs/v0.17.12-production-package-attestation.json',
      sha256: '945f54d6509903342d8443c74d35ccc2cc59c47083b32df4549eb423aa814530',
      bytes: 578,
    },
    auditCommand: 'npm run audit:release-history',
  },
};
