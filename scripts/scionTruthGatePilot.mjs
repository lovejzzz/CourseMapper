#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import {
  assessScionTruthGate,
  buildScionTruthGateSeed,
  scionTruthGateSourceClaimSha256,
} from './lib/scionTruthGate.mjs';

const PRIOR_PREREG = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-prereg-v0.17.12.json';
const PRIOR_RESULT = 'evaluation/scion-adapters/evidence/scion-roundtable-source-holdout-v0.17.12.json';
const PACKET = 'evaluation/scion-adapters/evidence/scion-truth-gate-pilot-packet-v0.17.13.json';
const REVIEWS = 'evaluation/scion-adapters/evidence/scion-truth-gate-pilot-review-bundle-v0.17.13.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/scion-truth-gate-pilot-result-v0.17.13.json';
const CREATED_AT = '2026-08-04T19:30:00.000Z';
const ASSESSED_AT = '2026-08-04T20:00:00.000Z';
const execFile = promisify(execFileCallback);

function identityFor(value) {
  const copy = structuredClone(value);
  delete copy.identity;
  return { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(copy) };
}

function candidate({ slug, domain, source, term }) {
  return buildScionTruthGateSeed({
    caseId: `truth-gate-pilot/${slug}:key-term-0`,
    projectId: `truth-gate-pilot-${slug}`,
    promptId: `truth-gate-pilot/${slug}`,
    domain,
    sourcePacket: source,
    term,
    createdAt: CREATED_AT,
  });
}

function buildPilotSeeds() {
  return [
    candidate({
      slug: 'python-short-circuit-and',
      domain: 'computer-science',
      source: {
        sourceId: 'python-reference-boolean-and',
        url: 'https://docs.python.org/3/reference/expressions.html#boolean-operations',
        title: 'Python Language Reference: Boolean operations',
        publisher: 'Python Software Foundation',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          locator: 'Boolean operations, paragraph describing x and y',
          capturedText: 'The expression x and y first evaluates x; if x is false, its value is returned; otherwise, y is evaluated.',
        },
        claims: [
          "Short-circuit evaluation for Python's and operator evaluates the left operand first; if it is false, that operand is returned without evaluating the right operand, otherwise the right operand is evaluated and returned.",
        ],
      },
      term: {
        tr: 'Short-circuit evaluation',
        df: "For Python's and operator, a false left operand is returned and the right operand is skipped instead of being evaluated.",
        eg: 'The expression 0 and expensive_call() returns 0 without calling expensive_call().',
        mi: 'Python and always evaluates both operands before choosing a Boolean result.',
        cx: 'The right operand is skipped when the left operand is false, rather than both operands always being evaluated.',
        sourceFactIndexes: [0],
      },
    }),
    candidate({
      slug: 'python-hashable-dictionary-keys',
      domain: 'computer-science',
      source: {
        sourceId: 'python-glossary-hashable-keys',
        url: 'https://docs.python.org/3/glossary.html#term-hashable',
        title: 'Python Glossary: hashable',
        publisher: 'Python Software Foundation',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          captures: [
            {
              locator: 'Glossary entry: hashable, opening definition',
              capturedText: 'An object is hashable if it has a hash value which never changes during its lifetime (it needs a __hash__() method), and can be compared to other objects (it needs an __eq__() method).',
            },
            {
              locator: 'Glossary entry: hashable, container examples',
              capturedText: 'Mutable containers such as lists or dictionaries are not hashable; tuples and frozensets are only hashable if their elements are hashable.',
            },
          ],
        },
        claims: [
          'Hashable dictionary keys have stable hash and equality behavior: mutable containers such as lists and dictionaries are not hashable, while tuples are hashable only when all of their elements are hashable.',
        ],
      },
      term: {
        tr: 'Hashable dictionary keys',
        df: 'A Python dictionary key must have a stable hash and equality behavior, so mutable containers cannot serve as keys.',
        eg: 'A tuple of strings can be a key, but a tuple containing a list cannot be a key.',
        mi: 'Every tuple is a valid dictionary key simply because tuples are immutable containers.',
        cx: 'A tuple is hashable only when all its elements are hashable, not merely because the outer container is immutable.',
        sourceFactIndexes: [0],
      },
    }),
    candidate({
      slug: 'earthquake-p-s-arrival-gap',
      domain: 'geology',
      source: {
        sourceId: 'usgs-earthquake-p-s-arrivals',
        url: 'https://www.usgs.gov/programs/earthquake-hazards/science-earthquakes',
        title: 'The Science of Earthquakes',
        publisher: 'U.S. Geological Survey',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          captures: [
            {
              locator: 'How can scientists tell where the earthquake happened?, wave-speed paragraph',
              capturedText: 'P waves are also faster than S waves, and this fact is what allows us to tell where an earthquake was.',
            },
            {
              locator: 'How can scientists tell where the earthquake happened?, arrival-gap paragraph',
              capturedText: 'If you are close to the earthquake, the P and S wave will come one right after the other, but if you are far away, there will be more time between the two.',
            },
          ],
        },
        claims: [
          'The P-wave and S-wave arrival interval records the faster P wave first, and the time between P and S arrivals becomes larger as a station is farther from the earthquake.',
        ],
      },
      term: {
        tr: 'P-wave and S-wave arrival interval',
        df: 'The arrival interval is the measured time between the faster P wave and the later S wave on a seismogram.',
        eg: 'A station farther from the earthquake records a larger delay between its P-wave and S-wave arrivals.',
        mi: 'The P-wave and S-wave arrival interval becomes smaller as a station gets farther from the earthquake.',
        cx: 'The arrival interval grows with station distance, rather than shrinking as the station moves farther away.',
        sourceFactIndexes: [0],
      },
    }),
    candidate({
      slug: 'igneous-cooling-crystal-texture',
      domain: 'geology',
      source: {
        sourceId: 'usgs-igneous-cooling-texture',
        url: 'https://www.usgs.gov/faqs/what-are-igneous-rocks',
        title: 'What are igneous rocks?',
        publisher: 'U.S. Geological Survey',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          captures: [
            {
              locator: 'Intrusive Igneous Rocks',
              capturedText: 'Slow cooling means the individual mineral grains have a very long time to grow, so they grow to a relatively large size.',
            },
            {
              locator: 'Extrusive Igneous Rocks',
              capturedText: "Quick cooling means that mineral crystals don't have much time to grow, so these rocks have a very fine-grained or even glassy texture.",
            },
          ],
        },
        claims: [
          'Igneous cooling rate and crystal texture are linked: intrusive magma cools slowly underground and develops relatively large grains, whereas extrusive lava cools quickly near the surface and develops fine-grained or glassy texture.',
        ],
      },
      term: {
        tr: 'Igneous cooling rate and crystal texture',
        df: 'Cooling rate controls the time available for mineral growth, linking slow cooling to coarse grains and rapid cooling to fine texture.',
        eg: 'Slowly cooled intrusive granite has coarser grains than rapidly cooled extrusive obsidian.',
        mi: 'Rapid cooling gives mineral crystals more time to grow and therefore creates a coarse-grained rock.',
        cx: 'Slow cooling permits larger crystals, whereas rapid cooling limits growth instead of producing coarse grains.',
        sourceFactIndexes: [0],
      },
    }),
    candidate({
      slug: 'major-scale-step-pattern',
      domain: 'music-theory',
      source: {
        sourceId: 'open-music-theory-major-scale-pattern',
        url: 'https://open-musictheory.github.io/docs/fundamentals/scales/',
        title: 'Scales and scale degrees',
        publisher: 'Open Music Theory',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          locator: 'The major scale',
          capturedText: 'A major scale consists of seven whole and half steps in the following succession: W-W-H-W-W-W-H.',
        },
        claims: [
          'A major scale uses the ordered step pattern whole, whole, half, whole, whole, whole, half from tonic to the octave.',
        ],
      },
      term: {
        tr: 'Major-scale whole-step and half-step pattern',
        df: 'A major scale orders its seven adjacent steps as whole, whole, half, whole, whole, whole, then half.',
        eg: 'C to D and D to E are whole steps, while E to F is the first half step in C major.',
        mi: 'A major scale alternates whole steps and half steps evenly from tonic to octave.',
        cx: 'The pattern is W-W-H-W-W-W-H, not an even alternation of whole and half steps.',
        sourceFactIndexes: [0],
      },
    }),
    candidate({
      slug: 'deceptive-dominant-motion',
      domain: 'music-theory',
      source: {
        sourceId: 'open-music-theory-deceptive-motion',
        url: 'https://viva.pressbooks.pub/openmusictheory/chapter/la-in-the-bass/',
        title: 'La in the Bass at Beginnings, Middles, and Endings',
        publisher: 'Open Music Theory',
        retrievedAt: CREATED_AT,
        sourceEvidence: {
          locator: 'Deceptive motion',
          capturedText: 'Deceptive motion most commonly occurs when V moves to vi rather than I, with the bass moving sol-la.',
        },
        claims: [
          'Deceptive motion occurs when a dominant sets up a cadential expectation but moves to an unexpected non-tonic harmony, most commonly vi instead of I.',
        ],
      },
      term: {
        tr: 'Deceptive dominant motion',
        df: 'Deceptive motion redirects an expected dominant resolution to a non-tonic harmony, most commonly from V to vi.',
        eg: 'In C major, a G dominant harmony moving to A minor creates the common V-to-vi deceptive motion.',
        mi: 'Deceptive motion is the expected resolution from dominant V directly to tonic I.',
        cx: 'The dominant moves unexpectedly to a non-tonic harmony such as vi, rather than resolving as expected to I.',
        sourceFactIndexes: [0],
      },
    }),
  ];
}

async function readJsonIfPresent(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function main() {
  const preparing = process.argv.includes('--prepare');
  let packet;
  if (preparing) {
    const configuredBridgeFingerprint = String(process.env.SCION_TRUTH_GATE_BRIDGE_FINGERPRINT || '').trim();
    if (!/^[a-f0-9]{64}$/.test(configuredBridgeFingerprint)) {
      throw new Error('Preparing the pilot requires one valid SCION_TRUTH_GATE_BRIDGE_FINGERPRINT');
    }
    packet = {
      schemaVersion: 1,
      protocol: 'scion-truth-gate-pilot-packet-v1',
      status: 'frozen-before-independent-review',
      frozenAt: CREATED_AT,
      design: { domains: ['computer-science', 'geology', 'music-theory'], casesPerDomain: 2, totalCases: 6 },
      trustedReviewAuthorityFingerprints: [configuredBridgeFingerprint],
      seeds: buildPilotSeeds(),
      productionEligible: false,
      trainingEligible: false,
      claimBoundary: 'This packet exists to test semantic admission. It contains no model outcome and cannot prove Scion quality.',
    };
    packet.identity = identityFor(packet);
    await fs.writeFile(PACKET, `${JSON.stringify(packet, null, 2)}\n`);
  } else {
    packet = JSON.parse(await fs.readFile(PACKET, 'utf8'));
    const packetCopy = structuredClone(packet);
    delete packetCopy.identity;
    if (
      packet.protocol !== 'scion-truth-gate-pilot-packet-v1' ||
      packet.schemaVersion !== 1 ||
      packet.status !== 'frozen-before-independent-review' ||
      packet.productionEligible !== false ||
      packet.trainingEligible !== false ||
      packet.trustedReviewAuthorityFingerprints?.length !== 1 ||
      packet.identity?.algorithm !== 'sha256-canonical-json' ||
      packet.identity?.sha256 !== scionLessonKernelSha256(packetCopy)
    ) {
      throw new Error('Frozen Truth Gate pilot packet failed protocol or identity validation');
    }
  }
  const seeds = packet.seeds;

  const priorPrereg = JSON.parse(await fs.readFile(PRIOR_PREREG, 'utf8'));
  const priorResult = JSON.parse(await fs.readFile(PRIOR_RESULT, 'utf8'));
  const priorSourceContentHashes = priorResult.rows.flatMap((row) =>
    row.postRunReview.numberedSourceClaims.map((claim) => scionTruthGateSourceClaimSha256(claim.text)),
  );
  const priorSourceClaims = priorResult.rows.flatMap((row) =>
    row.postRunReview.numberedSourceClaims.map((claim) => claim.text),
  );
  const excludedProjectIds = priorPrereg.cases.map((entry) => entry.caseId.split(':')[0]);
  const excludedPromptIds = priorPrereg.cases.map((entry) => entry.caseId.replace(/:key-term-\d+$/, ''));
  const reviewBundle = await readJsonIfPresent(REVIEWS, { receipts: [], reviewAuthorities: [] });
  const bundleIssues = [];
  if (reviewBundle.receipts?.length > 0) {
    if (reviewBundle.protocol !== 'scion-truth-gate-pilot-review-bundle-v1' || reviewBundle.schemaVersion !== 1) {
      bundleIssues.push('invalid-review-bundle-protocol');
    }
    if (reviewBundle.pilotPacketSha256 !== packet.identity.sha256) {
      bundleIssues.push('review-bundle-pilot-packet-mismatch');
    }
    try {
      if (!/^[a-f0-9]{40}$/.test(reviewBundle.pilotPacketGitCommit || '')) throw new Error('invalid commit');
      const { stdout } = await execFile('git', ['show', `${reviewBundle.pilotPacketGitCommit}:${PACKET}`], {
        maxBuffer: 2_000_000,
      });
      const committedPacket = JSON.parse(stdout);
      if (committedPacket.identity?.sha256 !== packet.identity.sha256) throw new Error('packet mismatch');
    } catch {
      bundleIssues.push('review-bundle-preregistration-commit-mismatch');
    }
    const reviewBundleCopy = structuredClone(reviewBundle);
    delete reviewBundleCopy.identity;
    if (
      reviewBundle.identity?.algorithm !== 'sha256-canonical-json' ||
      reviewBundle.identity?.sha256 !== scionLessonKernelSha256(reviewBundleCopy)
    ) {
      bundleIssues.push('invalid-review-bundle-identity');
    }
  }
  const result = assessScionTruthGate({
    seeds,
    receipts: bundleIssues.length === 0 ? reviewBundle.receipts || [] : [],
    reviewAuthorities: bundleIssues.length === 0 ? reviewBundle.reviewAuthorities || [] : [],
    trustedReviewAuthorityFingerprints: packet.trustedReviewAuthorityFingerprints,
    priorSourceContentHashes,
    priorSourceClaims,
    excludedProjectIds,
    excludedPromptIds,
    requiredCasesPerDomain: 2,
    assessedAt: ASSESSED_AT,
    mode: 'pilot',
  });
  result.reviewBundle = {
    present: reviewBundle.receipts?.length > 0,
    receiptCount: reviewBundle.receipts?.length || 0,
    authorityCount: reviewBundle.reviewAuthorities?.length || 0,
    packetBindingValid: bundleIssues.length === 0,
    issues: bundleIssues,
  };
  if (bundleIssues.length > 0) {
    result.status = 'blocked-truth-gate';
    result.gateEligible = false;
    result.issues = [...new Set([...result.issues, ...bundleIssues])];
  }
  result.identity = identityFor(result);
  await fs.writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    status: result.status,
    gateEligible: result.gateEligible,
    availableByDomain: result.availableByDomain,
    receiptCount: result.reviewBundle.receiptCount,
    issueCount: result.issues.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
