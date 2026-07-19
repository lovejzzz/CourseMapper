import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  SCION_ADAPTER_DATASET_PROFILES,
  SCION_ADAPTER_SEMANTIC_PROFILES,
  buildScionAdapterDataset,
  registerScionLessonKernelCase,
} from '../scripts/scionAdapterDataset.mjs';
import { getCourseById } from '../scripts/crucible/courses.mjs';
import { computeScionAdapterPackageIdentity } from '../scripts/lib/scionBrowserDeviceMatrix.mjs';
import { buildScionAdapterManifest, sha256File, verifyScionAdapterPackage } from '../scripts/scionAdapterPackage.mjs';
import { assessScionAdapterPromotion } from '../scripts/scionAdapterPromotionAudit.mjs';
import { auditScionAdapterTaskScope } from '../scripts/scionAdapterTaskScopeAudit.mjs';
import {
  assessScionAdapterRouteEvidence,
  assessHeldoutDatasetBoundary,
  prepareScionBenchmarkRun,
  produceScionPairedEvidence,
  sha256Value,
  validateScionHeldoutBenchmark,
} from '../scripts/scionAdapterPairedEvidence.mjs';
import { SCION_ADAPTER_MANIFEST_SCHEMA_VERSION, SCION_GEMMA4_E2B_BASE } from '../src/lib/scionAdapterManifest.js';

const execFile = promisify(execFileCallback);
const TRAINING_DOMAINS = ['business-ethics', 'computer-science', 'geology', 'music-theory', 'user-experience-design'];

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

function goodMc(overrides = {}) {
  return {
    q: 'Which evidence most directly supports revising the prototype navigation?',
    op: [
      'Three participants fail the same labeled task',
      'One participant says the colors look pleasant',
      'The designer prefers the original navigation',
      'A stakeholder requests a larger project logo',
    ],
    ai: 0,
    ex: 'Repeated task failure is direct behavioral evidence, whereas the other options do not demonstrate a navigation breakdown.',
    ...overrides,
  };
}

function bindModelJudgeEvidence(row) {
  row.preferenceEvidence.sourceContextSha256 = sha256Value(JSON.stringify(row.sourceContext));
  row.preferenceEvidence.chosenArtifactSha256 = sha256Value(JSON.stringify(row.chosen));
  row.preferenceEvidence.rejectedArtifactSha256 = sha256Value(JSON.stringify(row.rejected));
  row.preferenceEvidence.trainingPairSha256 = sha256Value(
    JSON.stringify({
      kind: row.kind,
      prompt: row.prompt,
      chosen: row.chosen,
      rejected: row.rejected,
      domain: row.domain || row?.context?.domain,
      courseGroupSha256: row.courseGroupSha256 || row?.context?.courseGroupSha256,
    }),
  );
  return row;
}

function approvedRow(overrides = {}) {
  const row = {
    kind: 'mc-item',
    prompt: 'Write one evidence-grounded multiple-choice item.',
    chosen: goodMc(),
    rejected: goodMc({ q: 'Which observation suggests changing the prototype navigation?' }),
    context: { domain: 'user experience design', courseId: 'ux-101' },
    sourceContext: {
      sourcePacketSha256: 'f'.repeat(64),
      kernelId: 'ux/prototype-evidence',
      term: 'Prototype evidence',
      claims: ['Repeated failure on the same realistic task is behavioral evidence for revising a prototype.'],
      attribution: ['Synthetic test fixture'],
      license: 'test-only',
    },
    ...overrides,
    preferenceEvidence: {
      kind: 'single-model-judge-preference',
      protocol: 'scion-codex-training-review-v2',
      benchmarkProtocol: 'honest-quality-benchmark-v1',
      policyId: 'scion-codex-judge-policy-v1',
      verified: true,
      preferred: 'chosen',
      primaryPreferenceEvidence: 'single-model-judge',
      stable: true,
      scoredBeforePreference: true,
      humanEvidence: false,
      independentEvidence: false,
      judge: {
        model: 'openai/codex',
        revision: 'codex-test-revision',
        runtime: 'vitest',
        sessionIds: ['session-a', 'session-b'],
        promptPath: 'evaluation/quality-benchmark/v1/single-model-training-atom-judge-prompt-v2.md',
        promptSha256: '0f062d551af9e2704892e5f1ebdf9b4c66a6d79de6ac1c9cf39b7cb4fa15ecd7',
      },
      orders: ['A/B', 'B/A'],
      passHashes: ['1'.repeat(64), '2'.repeat(64)],
      scorecardHashes: ['3'.repeat(64), '4'.repeat(64), '5'.repeat(64), '6'.repeat(64)],
      caseDigest: '7'.repeat(64),
      courseGroupSha256: '8'.repeat(64),
      reviewPacketDigest: '9'.repeat(64),
      sourceRowSha256: 'a'.repeat(64),
      sourceContextSha256: 'b'.repeat(64),
      trainingPairSha256: 'c'.repeat(64),
      chosenArtifactSha256: 'd'.repeat(64),
      rejectedArtifactSha256: 'e'.repeat(64),
      winnerMinimumScores: {
        factualCorrectness: 5,
        sourceFidelity: 5,
        teachability: 5,
        coherence: 5,
        taskQuality: 5,
      },
      minimumScoreMargin: 2,
      decisionDefects: ['A/B: The losing side is less precise.', 'B/A: The losing side remains less precise.'],
      claimBoundary: 'Stable single-model Codex evidence; not human or independent validation.',
    },
  };
  return bindModelJudgeEvidence(row);
}

function balancedTrainingEvidence(domains = TRAINING_DOMAINS, modelJudgePairsPerDomain = 20) {
  return {
    primaryPreferenceEvidence: 'single-model-judge',
    modelJudgePairCount: domains.length * modelJudgePairsPerDomain,
    modelJudgeDomainCount: domains.length,
    domainGroupCounts: Object.fromEntries(domains.map((domain) => [domain, 3])),
    modelJudgeDomainCounts: Object.fromEntries(domains.map((domain) => [domain, modelJudgePairsPerDomain])),
    splitCounts: { train: 1200, valid: 1000, test: 1000 },
    splitDomainCounts: { train: domains.length, valid: domains.length, test: domains.length },
  };
}

function bindSyntheticTrainingRun(manifest, lane = 'production') {
  const planSha256 = '1'.repeat(64);
  const resultSha256 = '2'.repeat(64);
  manifest.training.datasetIdentitySha256 ||= '3'.repeat(64);
  manifest.training.run = {
    protocol: 'scion-adapter-training-run-v1',
    lane,
    seed: 16031,
    planPath: 'training-plan.json',
    planSha256,
    planIdentitySha256: '4'.repeat(64),
    resultPath: 'training-result.json',
    resultSha256,
    resultIdentitySha256: '5'.repeat(64),
    datasetIdentitySha256: manifest.training.datasetIdentitySha256,
    toolchainPolicySha256: '6'.repeat(64),
    repositoryCommit: '7'.repeat(40),
    repositoryTree: '8'.repeat(40),
    repositoryDirty: false,
  };
  manifest.files.push(
    { path: 'training-plan.json', bytes: 512, sha256: planSha256 },
    { path: 'training-result.json', bytes: 512, sha256: resultSha256 },
  );
  return manifest;
}

describe('Scion adapter tooling', () => {
  it('allows the exact source-strict V6 production admission profile for task-matched datasets', () => {
    expect(SCION_ADAPTER_SEMANTIC_PROFILES).toContain('source-strict-v6');
    expect(SCION_ADAPTER_DATASET_PROFILES['lesson-kernel-v0.16.54']).toMatchObject({
      minimumPairs: 100,
      minimumDomains: 7,
      minimumGroupsPerDomain: 2,
      minimumSourceKernelsPerDomain: 6,
      minimumModelJudgePairs: 100,
      minimumModelJudgeDomains: 7,
      minimumModelJudgePairsPerDomain: 8,
      semanticProfile: 'source-strict-v6',
    });
    expect(SCION_ADAPTER_DATASET_PROFILES['lesson-kernel-v0.16.54'].sources).toHaveLength(2);
  });

  it('refuses to inflate the lesson-kernel target with two preferences for one campaign case', () => {
    const seenCases = new Set();
    expect(
      registerScionLessonKernelCase(seenCases, {
        kind: 'lesson-kernel',
        taskFamily: 'lesson-kernel',
        caseId: 'scion-kernel-one',
      }),
    ).toEqual([]);
    expect(
      registerScionLessonKernelCase(seenCases, {
        kind: 'lesson-kernel',
        taskFamily: 'lesson-kernel',
        caseId: 'scion-kernel-one',
      }),
    ).toEqual(['duplicate-lesson-kernel-case:scion-kernel-one']);
    expect(registerScionLessonKernelCase(seenCases, { kind: 'mc-item' })).toEqual([]);
  });

  it('builds a leakage-safe smoke dataset while quarantining duplicate pairs', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    await fs.writeFile(source, `${JSON.stringify(row)}\n${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      minimumPairs: 3000,
      minimumDomains: 5,
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({
      status: 'smoke-only',
      promotable: false,
      counts: { loaded: 2, total: 1, quarantined: 1, domains: 1, groups: 1 },
      groupIdentity: {
        algorithm: 'sha256-domain-colon-course-id',
        hashes: [sha256Value('user experience design:ux-101')],
        courseIdAlgorithm: 'sha256-course-id',
        courseIdHashes: [sha256Value('ux-101')],
      },
      leakage: { groupOverlapCount: 0 },
    });
    expect(result.manifest.quarantine[0].issues).toContain('duplicate-pair');
  });

  it('keeps repeated source tasks in one split even when declared course groups differ', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-source-task-split-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [1, 2, 3].map((index) =>
      approvedRow({
        chosen: goodMc({
          q: `Which evidence most directly supports revising prototype navigation in sample ${index}?`,
        }),
        rejected: goodMc({ q: `Which observation relates to prototype navigation in sample ${index}?` }),
        context: { domain: 'user-experience-design', courseId: `ux-replicate-${index}` },
      }),
    );
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({
      counts: { total: 3, groups: 3, trainingTaskGroups: 1, trainingSourceKernels: 1 },
      domainGroupCounts: { 'user-experience-design': 3 },
      domainTaskGroupCounts: { 'user-experience-design': 1 },
      domainSourceKernelCounts: { 'user-experience-design': 1 },
      trainingTaskIdentity: {
        algorithm: 'sha256-source-task-or-course-group-v2',
        sourceBoundGroups: 1,
        courseFallbackGroups: 0,
      },
      leakage: { groupOverlapCount: 0 },
    });
    const nonEmptySplits = Object.values(result.manifest.files).filter((file) => file.rows > 0);
    expect(nonEmptySplits).toHaveLength(1);
    expect(nonEmptySplits[0].rows).toBe(3);
  });

  it('quarantines a judged row when its restored source context no longer matches the sealed digest', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-source-context-tamper-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    row.sourceContext.claims[0] = 'A changed claim that was not available during blind judgment.';
    await fs.writeFile(source, `${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({
      status: 'blocked',
      counts: { loaded: 1, total: 0, quarantined: 1, singleModelJudgePairs: 0 },
    });
    expect(result.manifest.quarantine[0].issues).toContain('source-context-binding');
  });

  it('permits declared noncommercial sources only in non-production research lanes', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-source-license-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    row.sourceContext.license = 'CC-BY-NC-SA-4.0';
    bindModelJudgeEvidence(row);
    await fs.writeFile(source, `${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest.sourceLicensePolicy).toMatchObject({
      declaredRows: 1,
      missingRows: 0,
      licenses: { 'CC-BY-NC-SA-4.0': 1 },
      nonCommercialRows: 1,
      shareAlikeRows: 1,
      researchCompatible: true,
      productionCompatible: false,
    });
    expect(result.manifest.gate.profiles.production.issues).toEqual(
      expect.arrayContaining(['source-license-noncommercial:1', 'source-license-sharealike-review:1']),
    );
    expect(result.manifest.gate.profiles.research.issues).not.toEqual(
      expect.arrayContaining([expect.stringContaining('source-license')]),
    );
  });

  it('quarantines frozen holdout domains and course IDs before any training split is written', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-holdout-firewall-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [
      approvedRow({
        prompt: 'Write one astronomy training item.',
        context: { domain: 'astronomy', courseId: 'astronomy-training-101' },
      }),
      approvedRow({
        prompt: 'Write one relabeled held-out course item.',
        context: { domain: 'computer-science', courseId: 'astro-101' },
      }),
      approvedRow({
        prompt: 'Write one safe computer science item.',
        context: { domain: 'computer-science', courseId: 'cs-safe-101' },
      }),
    ];
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({
      schemaVersion: 4,
      status: 'smoke-only',
      counts: { loaded: 3, total: 1, quarantined: 2 },
      holdoutBoundary: {
        protocol: 'scion-training-holdout-firewall-v1',
        status: 'pass',
        admittedDomainOverlapCount: 0,
        admittedCourseGroupOverlapCount: 0,
        excludedPairCount: 2,
        excludedDomainPairCount: 1,
        excludedCourseGroupPairCount: 1,
      },
      identity: { protocol: 'scion-adapter-dataset-identity-v2' },
    });
    expect(result.manifest.quarantine.map((entry) => entry.issues)).toEqual(
      expect.arrayContaining([['heldout-domain:astronomy'], ['heldout-course-group:astro-101']]),
    );
    expect(result.manifest.groupIdentity.courseIdHashes).not.toContain(sha256Value('astro-101'));
  });

  it('builds a non-promotable research tier only with balanced course groups', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-research-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [];
    for (const domain of ['computer-science', 'geology', 'music-theory', 'user-experience-design']) {
      for (let course = 1; course <= 3; course += 1) {
        for (let item = 1; item <= 9; item += 1) {
          rows.push(
            approvedRow({
              prompt: `Write grounded item ${item} for ${domain} course ${course}.`,
              chosen: goodMc({
                q: `Which evidence most directly supports decision ${item} in ${domain} course ${course}?`,
              }),
              rejected: goodMc({
                q: `Which observation should be considered for decision ${item} in ${domain} course ${course}?`,
              }),
              context: { domain, courseId: `${domain}-${course}` },
              sourceContext: {
                sourcePacketSha256: 'f'.repeat(64),
                kernelId: `${domain}/decision-${course}-${item}`,
                term: `${domain} decision ${course}-${item}`,
                claims: [`Evidence ${item} grounds decision ${course} in the ${domain} fixture.`],
                attribution: ['Synthetic diversity fixture'],
                license: 'test-only',
              },
            }),
          );
        }
      }
    }
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowResearch: true,
    });

    expect(result.manifest).toMatchObject({
      status: 'research-ready',
      promotable: false,
      admissionPolicy: {
        protocol: 'scion-adapter-semantic-admission-v1',
        semanticProfile: 'legacy',
      },
      counts: {
        total: 108,
        domains: 4,
        groups: 12,
        trainingTaskGroups: 108,
        trainingSourceKernels: 108,
        train: 84,
        valid: 12,
        test: 12,
        trainDomains: 4,
        validDomains: 4,
        testDomains: 4,
        singleModelJudgePairs: 108,
        singleModelJudgeDomains: 4,
      },
      modelJudgeDomainCounts: {
        'computer-science': 27,
        geology: 27,
        'music-theory': 27,
        'user-experience-design': 27,
      },
      domainSourceKernelCounts: {
        'computer-science': 27,
        geology: 27,
        'music-theory': 27,
        'user-experience-design': 27,
      },
      trainingSourceKernelIdentity: {
        algorithm: 'sha256-semantic-source-kernel-v1',
        groups: 108,
      },
      splitIdentity: {
        strategy: 'domain-stratified-source-task-hash-v2',
        domains: {
          train: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
          valid: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
          test: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
        },
      },
      gate: { profiles: { research: { qualifiedModelJudgeDomains: 4, issues: [] } } },
      leakage: { groupOverlapCount: 0 },
    });
    expect(result.manifest.gate.profiles.production.issues).toContain('verified-pairs:108<3000');
  });

  it('blocks research when model-judge evidence is concentrated in one domain', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-unbalanced-model-judge-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [];
    for (let item = 1; item <= 100; item += 1) {
      const course = (item % 3) + 1;
      rows.push(
        approvedRow({
          prompt: `Write Codex-reviewed computer science item ${item}.`,
          chosen: goodMc({ q: `Which evidence validates computer science decision ${item}?` }),
          rejected: goodMc({ q: `Which observation relates to computer science decision ${item}?` }),
          context: { domain: 'computer-science', courseId: `computer-science-${course}` },
        }),
      );
    }
    for (const domain of ['geology', 'music-theory', 'user-experience-design']) {
      for (let course = 1; course <= 3; course += 1) {
        for (let item = 1; item <= 3; item += 1) {
          rows.push({
            kind: 'mc-item',
            prompt: `Write deterministic contract item ${item} for ${domain} course ${course}.`,
            chosen: goodMc({ q: `Which evidence supports ${domain} decision ${course}-${item}?` }),
            rejected: goodMc({
              q: `Which observation relates to ${domain} decision ${course}-${item}?`,
              op: ['Repeated answer', 'Repeated answer', 'Alternative C', 'Alternative D'],
            }),
            context: { domain, courseId: `${domain}-${course}` },
          });
        }
      }
    }
    await fs.writeFile(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowResearch: true,
    });

    expect(result.manifest).toMatchObject({
      status: 'blocked',
      counts: { total: 127, domains: 4, groups: 12, singleModelJudgePairs: 100, singleModelJudgeDomains: 1 },
      gate: { profiles: { research: { qualifiedModelJudgeDomains: 1 } } },
    });
    expect(result.manifest.gate.profiles.research.issues).toContain('single-model-judge-qualified-domains:1<4');
  });

  it('freezes five real held-out course fixtures and requires dataset group proof', async () => {
    const benchmark = JSON.parse(
      await fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v1.json', 'utf8'),
    );
    const transitivelyBoundBenchmark = JSON.parse(
      await fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v4.json', 'utf8'),
    );
    const taskScopedBenchmark = JSON.parse(
      await fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v5.json', 'utf8'),
    );
    const currentGraderBenchmark = JSON.parse(
      await fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v6.json', 'utf8'),
    );
    expect(validateScionHeldoutBenchmark(benchmark)).toMatchObject({
      valid: true,
      issues: [],
      domains: expect.arrayContaining(['world-languages', 'world-literature', 'psychology', 'nutrition', 'astronomy']),
    });
    expect(validateScionHeldoutBenchmark(transitivelyBoundBenchmark)).toMatchObject({ valid: true, issues: [] });
    expect(validateScionHeldoutBenchmark(taskScopedBenchmark)).toMatchObject({ valid: true, issues: [] });
    expect(validateScionHeldoutBenchmark(currentGraderBenchmark)).toMatchObject({ valid: true, issues: [] });

    const cleanDataset = {
      domains: ['computer-science', 'geology', 'business-ethics'],
      groupIdentity: {
        algorithm: 'sha256-domain-colon-course-id',
        hashes: [sha256Value('geology:geo-101')],
        courseIdAlgorithm: 'sha256-course-id',
        courseIdHashes: [sha256Value('geo-101')],
      },
    };
    expect(assessHeldoutDatasetBoundary(benchmark, cleanDataset)).toMatchObject({
      pass: true,
      groupProofAvailable: true,
      courseIdProofAvailable: true,
      domainOverlap: [],
      groupOverlap: [],
    });

    expect(assessHeldoutDatasetBoundary(benchmark, { domains: [] })).toMatchObject({
      pass: false,
      groupProofAvailable: false,
    });
    expect(
      assessHeldoutDatasetBoundary(benchmark, {
        domains: ['computer-science'],
        groupIdentity: {
          algorithm: 'sha256-domain-colon-course-id',
          hashes: [sha256Value('computer-science:world-lit-readings')],
          courseIdAlgorithm: 'sha256-course-id',
          courseIdHashes: [sha256Value('world-lit-readings')],
        },
      }),
    ).toMatchObject({
      pass: false,
      domainOverlap: [],
      groupOverlap: ['world-lit-readings'],
    });
  });

  it('requires hash-bound adapter use and base avoidance for each benchmark task family', () => {
    const policy = {
      adapterRequiredFamilies: ['lesson-kernel'],
      baseOnlyRequiredFamilies: ['course-map'],
      unclassifiedPolicy: 'forbid',
    };
    const shared = {
      adapterId: 'scion-task-scoped',
      adapterManifestSha256: 'a'.repeat(64),
      adapterScopeIdentitySha256: 'b'.repeat(64),
    };
    const event = (taskFamily, routeMode, nativeAdapterActive) => ({
      type: 'scionAdapterRoute',
      routeProtocol: 'scion-adapter-runtime-route-v1',
      taskFamily,
      routeMode,
      nativeAdapterActive,
      ...shared,
    });
    expect(
      assessScionAdapterRouteEvidence({
        events: [event('lesson-kernel', 'adapter', true), event('course-map', 'base-only', false)],
        policy,
        arm: 'adapter',
        ...shared,
      }),
    ).toMatchObject({ valid: true, issues: [], routeCount: 2 });

    const globalAdapter = assessScionAdapterRouteEvidence({
      events: [event('lesson-kernel', 'adapter', true), event('course-map', 'adapter', true)],
      policy,
      arm: 'adapter',
      ...shared,
    });
    expect(globalAdapter.valid).toBe(false);
    expect(globalAdapter.issues).toEqual(
      expect.arrayContaining(['route-state:course-map', 'unexpected-adapter-route:course-map']),
    );

    expect(
      assessScionAdapterRouteEvidence({
        events: [
          event('lesson-kernel', 'adapter', true),
          event('lesson-kernel', 'base-only', false),
          event('course-map', 'base-only', false),
        ],
        policy,
        arm: 'adapter',
        ...shared,
      }),
    ).toMatchObject({ valid: false, issues: expect.arrayContaining(['route-state:lesson-kernel']) });

    expect(
      assessScionAdapterRouteEvidence({
        events: [event('lesson-kernel', 'base-only', false), event('course-map', 'base-only', false)],
        policy,
        arm: 'base-only',
        ...shared,
      }),
    ).toMatchObject({ valid: true, issues: [] });
  });

  it('reports the existing atom corpus as valid research but ineligible for a lesson-kernel adapter claim', async () => {
    const [evidence, benchmark] = await Promise.all([
      fs.readFile('evaluation/scion-adapters/evidence/task-scope-audit-v0.16.53.json', 'utf8').then(JSON.parse),
      fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v5.json', 'utf8').then(JSON.parse),
    ]);
    const dataset = {
      counts: { total: evidence.dataset.admittedRows },
      taskScope: evidence.dataset.taskScope,
      identity: { sha256: evidence.dataset.identitySha256 },
    };
    const report = auditScionAdapterTaskScope({ dataset, benchmark, generatedAt: '2026-07-18T05:45:00.000Z' });
    expect(report).toMatchObject({
      status: 'pass',
      issues: [],
      dataset: {
        admittedRows: 143,
        taskScope: {
          families: [
            { id: 'source-key-term-atom', rows: 93 },
            { id: 'source-mc-item-atom', rows: 50 },
          ],
        },
      },
      courseBenchmark: { eligible: false, missingAdapterFamilies: ['lesson-kernel'] },
    });
  });

  it('derives promotion evidence from two hash-bound Crucible rounds', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-paired-evidence-'));
    const benchmarkPath = path.resolve('evaluation/scion-adapters/held-out-course-benchmark-v6.json');
    const benchmark = JSON.parse(await fs.readFile(benchmarkPath, 'utf8'));
    const benchmarkSha256 = await sha256File(benchmarkPath);
    const datasetDir = path.join(root, 'dataset');
    const adapterDir = path.join(root, 'adapter');
    const candidateRoundDir = path.join(root, 'candidate-round');
    const baseRoundDir = path.join(root, 'base-round');
    await Promise.all([
      fs.mkdir(datasetDir, { recursive: true }),
      fs.mkdir(adapterDir, { recursive: true }),
      fs.mkdir(candidateRoundDir, { recursive: true }),
      fs.mkdir(baseRoundDir, { recursive: true }),
    ]);
    const datasetManifestPath = path.join(datasetDir, 'dataset-manifest.json');
    await fs.writeFile(
      datasetManifestPath,
      `${JSON.stringify({
        schemaVersion: 4,
        status: 'ready',
        primaryPreferenceEvidence: 'single-model-judge',
        counts: {
          total: 3200,
          domains: 5,
          groups: 15,
          singleModelJudgePairs: 100,
          singleModelJudgeDomains: 5,
          train: 1200,
          valid: 1000,
          test: 1000,
          trainDomains: 5,
          validDomains: 5,
          testDomains: 5,
        },
        domains: TRAINING_DOMAINS,
        domainGroupCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 3])),
        modelJudgeDomainCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 20])),
        groupIdentity: {
          algorithm: 'sha256-domain-colon-course-id',
          hashes: [sha256Value('geology:geo-training-101')],
          courseIdAlgorithm: 'sha256-course-id',
          courseIdHashes: [sha256Value('geo-training-101')],
        },
        taskScope: {
          protocol: 'scion-adapter-task-scope-v1',
          mode: 'allowlist',
          families: [{ id: 'lesson-kernel', rows: 3200 }],
          unclassifiedPolicy: 'base-only',
          compositePolicy: 'exact-family-only',
          identity: {
            algorithm: 'sha256-canonical-scion-adapter-task-scope-v1',
            sha256: 'a'.repeat(64),
          },
        },
      })}\n`,
    );
    await fs.writeFile(path.join(adapterDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.writeFile(path.join(adapterDir, 'adapters.safetensors'), Buffer.from('candidate-adapter-weights'));
    const built = await buildScionAdapterManifest({
      adapterDir,
      adapterId: 'scion-heldout-test-v1',
      scionVersion: '0.16.8',
      datasetManifest: datasetManifestPath,
      status: 'smoke',
    });
    built.manifest.promotion = { status: 'candidate', promotable: false, evidence: [] };
    bindSyntheticTrainingRun(built.manifest);
    await fs.writeFile(built.outputPath, `${JSON.stringify(built.manifest, null, 2)}\n`);
    const adapterManifestSha256 = await sha256File(built.outputPath);
    const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(built.manifest).sha256;
    await fs.writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
    await execFile('git', ['init', '-b', 'main'], { cwd: root });
    await execFile('git', ['config', 'user.email', 'scion-test@example.invalid'], { cwd: root });
    await execFile('git', ['config', 'user.name', 'Scion Test'], { cwd: root });
    await execFile('git', ['add', 'package-lock.json'], { cwd: root });
    await execFile('git', ['commit', '-m', 'frozen compiler'], { cwd: root });
    const prepared = await prepareScionBenchmarkRun({
      benchmarkPath,
      datasetPath: datasetManifestPath,
      adapterManifestPath: built.outputPath,
      arm: 'adapter',
      pairRunId: 'heldout-test',
      courses: benchmark.courses.map((course) => ({ id: course.courseId })),
      localModel: {
        sourceModelId: built.manifest.base.modelId,
        sourceRevision: built.manifest.base.revision,
        adapterActive: true,
        adapterId: built.manifest.adapter.id,
        adapterManifestSha256,
        adapterPackageIdentitySha256,
        adapterScale: 1,
      },
      cwd: root,
      compilerOptions: { provider: 'local', courses: benchmark.courses.map((course) => course.courseId).sort() },
    });
    expect(prepared).toMatchObject({
      arm: 'adapter',
      pairRunId: 'heldout-test',
      provenance: { dirty: false, commit: expect.stringMatching(/^[a-f0-9]{40}$/) },
      compilerConfigSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.keys(prepared.byCourseId)).toEqual(benchmark.courses.map((course) => course.courseId));

    const routeConsole = (isAdapter) =>
      [
        {
          type: 'scionAdapterRoute',
          routeProtocol: 'scion-adapter-runtime-route-v1',
          taskFamily: 'lesson-kernel',
          routeMode: isAdapter ? 'adapter' : 'base-only',
          nativeAdapterActive: isAdapter,
          adapterId: isAdapter ? built.manifest.adapter.id : null,
          adapterManifestSha256: isAdapter ? adapterManifestSha256 : null,
          adapterScopeIdentitySha256: isAdapter ? built.manifest.training.taskScope.identity.sha256 : null,
        },
        {
          type: 'scionAdapterRoute',
          routeProtocol: 'scion-adapter-runtime-route-v1',
          taskFamily: 'course-map',
          routeMode: 'base-only',
          nativeAdapterActive: false,
        },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n');

    const writeCourse = async (roundDir, benchmarkCourse, variant) => {
      const courseDir = path.join(roundDir, `${benchmarkCourse.courseId}--quiet--local`);
      await fs.mkdir(path.join(courseDir, 'extracted'), { recursive: true });
      const fixture = getCourseById(benchmarkCourse.courseId);
      const comparison = {
        protocolVersion: 1,
        evidenceProducer: 'scion-paired-evidence-v1',
        pairId: `heldout-test:${benchmarkCourse.domain}`,
        benchmarkManifestSha256: benchmarkSha256,
        courseInputSha256: benchmarkCourse.courseInputSha256,
        sourcePacketSha256: benchmarkCourse.sourcePacketSha256,
        compilerCommit: 'a'.repeat(40),
        compilerTree: 'b'.repeat(40),
        compilerConfigSha256: 'c'.repeat(64),
        graderVersion: benchmark.grader.id,
        graderSha256: benchmark.grader.sha256,
        graderImplementationSha256: benchmark.grader.implementationSha256,
        baseContractSha256: benchmark.base.contractSha256,
        compilerTreeDirty: false,
        variant,
      };
      const isAdapter = variant === 'adapter';
      const packageManifestText = `${JSON.stringify({
        quality: { score: 99, findingCounts: { p2: 0 } },
        readiness: { status: 'ready', blockers: 0, warnings: 0 },
      })}\n`;
      const zip = new JSZip();
      zip.file('PACKAGE_MANIFEST.json', packageManifestText);
      zip.file('payload.bin', Buffer.alloc(10_001, isAdapter ? 1 : 2));
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
      await Promise.all([
        fs.writeFile(
          path.join(courseDir, 'course.json'),
          `${JSON.stringify({
            id: benchmarkCourse.courseId,
            baseId: benchmarkCourse.courseId,
            lessonCount: benchmarkCourse.lessonCount,
            prompt: fixture.prompt,
            provider: 'local',
            comparison,
            localModel: {
              sourceModelId: built.manifest.base.modelId,
              sourceRevision: built.manifest.base.revision,
              adapterActive: isAdapter,
              adapterId: isAdapter ? built.manifest.adapter.id : null,
              adapterManifestSha256: isAdapter ? adapterManifestSha256 : null,
              adapterPackageIdentitySha256: isAdapter ? adapterPackageIdentitySha256 : null,
              adapterScale: isAdapter ? 1 : 0,
            },
          })}\n`,
        ),
        fs.writeFile(
          path.join(courseDir, 'project.json'),
          `${JSON.stringify({ hasGenerated: true, provider: 'local', promptText: fixture.prompt })}\n`,
        ),
        fs.writeFile(
          path.join(courseDir, 'report.json'),
          `${JSON.stringify({
            run: { status: 'passed', durationMs: 1000 },
            normalized: { overall: 99, overallGrade: 'A', p0Count: 0, p1Count: 0 },
          })}\n`,
        ),
        fs.writeFile(
          path.join(courseDir, 'digest.json'),
          `${JSON.stringify({ cost: { byTask: [{ task: 'scionPass', calls: isAdapter ? 75 : 100 }] } })}\n`,
        ),
        fs.writeFile(path.join(courseDir, 'console.log'), `${routeConsole(isAdapter)}\n`),
        fs.writeFile(path.join(courseDir, 'extracted', 'PACKAGE_MANIFEST.json'), packageManifestText),
        fs.writeFile(path.join(courseDir, 'package.zip'), zipBuffer),
      ]);
      return courseDir;
    };
    for (const course of benchmark.courses) {
      await Promise.all([
        writeCourse(candidateRoundDir, course, 'adapter'),
        writeCourse(baseRoundDir, course, 'base-only'),
      ]);
    }

    const result = await produceScionPairedEvidence({
      benchmarkPath,
      datasetPath: datasetManifestPath,
      adapterManifestPath: built.outputPath,
      candidateRoundDir,
      baseRoundDir,
      outputDir: path.join(root, 'evidence'),
    });
    expect(result.receipt).toMatchObject({
      status: 'captured',
      promotionEligible: true,
      domains: benchmark.courses.map((course) => course.domain),
    });
    expect(result.candidateEvidence.fullCourses).toHaveLength(5);
    expect(result.baseEvidence.fullCourses).toHaveLength(5);
    expect(result.candidateEvidence.fullCourses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageValid: true,
          scionPassCalls: 75,
          adapterActive: true,
          evidenceProducer: 'scion-paired-evidence-v1',
          artifactReceiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );

    const blockedBaseCourse = benchmark.courses[0];
    const blockedBaseDir = path.join(baseRoundDir, `${blockedBaseCourse.courseId}--quiet--local`);
    const blockedFixture = getCourseById(blockedBaseCourse.courseId);
    await Promise.all([
      fs.rm(path.join(blockedBaseDir, 'extracted'), { recursive: true, force: true }),
      fs.rm(path.join(blockedBaseDir, 'package.zip'), { force: true }),
      fs.rm(path.join(blockedBaseDir, 'project.json'), { force: true }),
      fs.rm(path.join(blockedBaseDir, 'digest.json'), { force: true }),
      fs.rm(path.join(blockedBaseDir, 'console.log'), { force: true }),
    ]);
    await Promise.all([
      fs.writeFile(
        path.join(blockedBaseDir, 'project-at-failure-finalizing-package.json'),
        `${JSON.stringify({ hasGenerated: true, provider: 'local', promptText: blockedFixture.prompt })}\n`,
      ),
      fs.writeFile(
        path.join(blockedBaseDir, 'digest-attempt1.json'),
        `${JSON.stringify({
          run: { lessonCount: blockedBaseCourse.lessonCount },
          cost: { byTask: [{ task: 'scionPass', calls: 100 }] },
          gates: {
            finalStatus: 'blocked',
            qualityStatus: 'graded',
            qualityScore: 74,
            qualityGrade: 'C',
            qualityP0: 1,
            qualityP1: 3,
            qualityP2: 3,
          },
        })}\n`,
      ),
      fs.writeFile(path.join(blockedBaseDir, 'console-attempt1.log'), `${routeConsole(false)}\n`),
      fs.writeFile(
        path.join(blockedBaseDir, 'report.json'),
        `${JSON.stringify({
          run: {
            status: 'failed',
            durationMs: 1000,
            phase: 'finalizing-package',
            error: 'Package was not ready to download after finalization.',
          },
          normalized: { graded: false, status: 'no-artifacts' },
        })}\n`,
      ),
    ]);
    const blockedBaseResult = await produceScionPairedEvidence({
      benchmarkPath,
      datasetPath: datasetManifestPath,
      adapterManifestPath: built.outputPath,
      candidateRoundDir,
      baseRoundDir,
      outputDir: path.join(root, 'blocked-base-evidence'),
    });
    expect(blockedBaseResult.receipt).toMatchObject({ status: 'captured', promotionEligible: true });
    expect(blockedBaseResult.baseEvidence.fullCourses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseId: blockedBaseCourse.courseId,
          packageValid: false,
          evaluationValid: true,
          evaluationStatus: 'quality-blocked-evaluation',
          packageGrade: 74,
          p0: 1,
          p1: 3,
          p2: 3,
          scionPassCalls: 100,
        }),
      ]),
    );

    const tamperedCourse = path.join(
      candidateRoundDir,
      `${benchmark.courses[0].courseId}--quiet--local`,
      'extracted',
      'PACKAGE_MANIFEST.json',
    );
    await fs.writeFile(
      tamperedCourse,
      `${JSON.stringify({
        quality: { score: 100, findingCounts: { p2: 0 } },
        readiness: { status: 'ready', blockers: 0, warnings: 0 },
      })}\n`,
    );
    await expect(
      produceScionPairedEvidence({
        benchmarkPath,
        datasetPath: datasetManifestPath,
        adapterManifestPath: built.outputPath,
        candidateRoundDir,
        baseRoundDir,
        outputDir: path.join(root, 'tampered-evidence'),
      }),
    ).rejects.toThrow('ZIP manifest does not match its extracted manifest');
  });

  it('quarantines rows that cannot be grouped by a known course and domain', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-identity-'));
    const source = path.join(root, 'source.jsonl');
    const row = approvedRow();
    delete row.context;
    bindModelJudgeEvidence(row);
    await fs.writeFile(source, `${JSON.stringify(row)}\n`);

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      allowSmoke: true,
    });

    expect(result.manifest).toMatchObject({ status: 'blocked', counts: { loaded: 1, total: 0, quarantined: 1 } });
    expect(result.manifest.quarantine[0].issues).toEqual(
      expect.arrayContaining(['missing-domain', 'missing-course-group']),
    );
  });

  it('curates a legacy structural pair with exact validator evidence and an explicit course-domain registry', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-derived-'));
    const source = path.join(root, 'source.jsonl');
    const domainMapPath = path.join(root, 'domain-map.json');
    await fs.writeFile(
      source,
      `${JSON.stringify({
        kind: 'mc-item',
        prompt: 'Write one evidence-grounded multiple-choice item.',
        chosen: goodMc(),
        rejected: goodMc({ op: ['A', 'A', 'B', 'C'] }),
        courseId: 'ux-101',
      })}\n`,
    );
    await fs.writeFile(
      domainMapPath,
      `${JSON.stringify({ schemaVersion: 1, courses: { 'ux-101': 'user-experience-design' } })}\n`,
    );

    const result = await buildScionAdapterDataset({
      sources: [source],
      outputDir: path.join(root, 'dataset'),
      domainMapPath,
      allowSmoke: true,
    });
    const curated = await fs.readFile(path.join(root, 'dataset', 'test.jsonl'), 'utf8');

    expect(result.manifest).toMatchObject({
      schemaVersion: 4,
      status: 'smoke-only',
      counts: { total: 1, domains: 1, groups: 1 },
      domainMap: { entries: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(JSON.parse(curated)).toMatchObject({
      provenance: {
        domain: 'user-experience-design',
        domainSource: 'registry',
        preferenceEvidenceKind: 'deterministic-contract-margin',
        preferenceEvidenceScope: 'non-semantic-contract-only',
      },
    });
  });

  it('pins training and local evaluation defaults to the browser-compatible QAT parent', async () => {
    const [launcher, server, shim] = await Promise.all([
      fs.readFile('trellis/tendril/distill/run_orpo_g4.sh', 'utf8'),
      fs.readFile('trellis/tendril/distill/serve_g4.py', 'utf8'),
      fs.readFile('scripts/crucible/e2bOpenAIShim.mjs', 'utf8'),
    ]);
    for (const source of [launcher, server, shim]) {
      expect(source).toContain(SCION_GEMMA4_E2B_BASE.modelId);
    }
    expect(launcher).toContain(SCION_GEMMA4_E2B_BASE.revision);
    expect(launcher).toContain('codex-approved-preferences-v0.16.47-readiness-gap.jsonl');
    expect(launcher).toContain('--source "$RESEARCH_PREFERENCE_SOURCE"');
    expect(launcher).toContain('--semantic-profile strict');
    expect(launcher).toContain('--mlx-self-test');
    expect(launcher).toContain('$LESSON_KERNEL_V01654 && MAX_SEQUENCE_LENGTH=2580');
    expect(launcher).toContain('$LESSON_KERNEL_V01654 && DEFAULT_ITERS=200');
    expect(launcher).toContain('mktemp "${TMPDIR:-/tmp}/scion-toolchain.XXXXXX"');
    expect(launcher).toContain('--max-sequence-length "$MAX_SEQUENCE_LENGTH"');
    expect(launcher).toContain('--max-seq-length "$MAX_SEQUENCE_LENGTH"');
    expect(launcher).not.toContain('BASE_MODEL=google/gemma-4-E2B-it\n');
  });

  it('checkpoints the real Gemma 4 decoder stack during ORPO training', async () => {
    const wrapper = await fs.readFile('trellis/tendril/distill/scion_seeded_mlx_vlm_lora.py', 'utf8');

    expect(wrapper).toContain('model.language_model.model.layers');
    expect(wrapper).toContain('grad_checkpoint(decoder_layers[0])');
    expect(wrapper).toContain('args.grad_checkpoint = False');
    expect(wrapper).toContain('SCION_LOGIT_CHUNK_TOKENS = 128');
    expect(wrapper).toContain('SCION_TRAINING_SHAPE_POLICY = "fixed-max-sequence-v1"');
    expect(wrapper).toContain('_pad_training_side_to_fixed_length');
    expect(wrapper).toContain('mx.checkpoint(chunk_logps)');
    expect(wrapper).toContain('mx.eval(model.trainable_parameters(), optimizer.state)');
    expect(wrapper).not.toContain('mx.eval(model.state, optimizer.state)');
    expect(wrapper).not.toContain('outputs.logits.astype(mx.float32)');
  });

  it('keeps the MLX-to-PEFT bridge narrow enough to self-test without Apple ML dependencies', async () => {
    const { stdout } = await execFile('python3', [
      'trellis/tendril/distill/convert_mlx_lora_to_peft.py',
      '--self-test',
    ]);
    expect(JSON.parse(stdout)).toEqual({ status: 'pass', test: 'scion-mlx-lora-name-contract' });
  });

  it('hash-binds an adapter to its exact base and dataset, then detects mutation', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-package-'));
    const adapterDir = path.join(root, 'adapter');
    const datasetDir = path.join(root, 'dataset');
    await fs.mkdir(adapterDir, { recursive: true });
    await fs.mkdir(datasetDir, { recursive: true });
    await fs.writeFile(path.join(adapterDir, 'adapter_config.json'), '{"rank":16}\n');
    await fs.writeFile(path.join(adapterDir, 'adapters.safetensors'), Buffer.from('adapter-weights'));
    const datasetManifest = path.join(datasetDir, 'dataset-manifest.json');
    await fs.writeFile(datasetManifest, '{"status":"smoke-only","counts":{"total":1,"domains":1}}\n');

    const built = await buildScionAdapterManifest({
      adapterDir,
      adapterId: 'scion-g4e2b-smoke',
      scionVersion: '0.16.6',
      datasetManifest,
      status: 'smoke',
    });
    await expect(verifyScionAdapterPackage({ manifestPath: built.outputPath })).resolves.toMatchObject({
      status: 'pass',
      valid: true,
      adapterId: 'scion-g4e2b-smoke',
    });

    await fs.appendFile(path.join(adapterDir, 'adapters.safetensors'), '-tampered');
    const tampered = await verifyScionAdapterPackage({ manifestPath: built.outputPath });
    expect(tampered.valid).toBe(false);
    expect(tampered.issues).toEqual(
      expect.arrayContaining(['adapters.safetensors:bytes-mismatch', 'adapters.safetensors:sha256-mismatch']),
    );
  });

  it('promotes only exact adapter evidence with five clean domains and a real call reduction', () => {
    const manifest = {
      schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.6', format: 'mlx-lora-safetensors' },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      training: {
        method: 'orpo-lora',
        datasetManifestSha256: 'd'.repeat(64),
        datasetStatus: 'ready',
        primaryPreferenceEvidence: 'single-model-judge',
        pairCount: 3200,
        domainCount: 5,
        groupCount: 15,
        taskScope: {
          protocol: 'scion-adapter-task-scope-v1',
          mode: 'allowlist',
          families: [{ id: 'lesson-kernel', rows: 3200 }],
          unclassifiedPolicy: 'base-only',
          compositePolicy: 'exact-family-only',
          identity: {
            algorithm: 'sha256-canonical-scion-adapter-task-scope-v1',
            sha256: '1'.repeat(64),
          },
        },
        ...balancedTrainingEvidence(),
      },
      files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: 'e'.repeat(64) }],
      runtime: { supported: ['mlx-vlm'] },
      promotion: {
        status: 'candidate',
        promotable: false,
        evidence: ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map(
          (type) => ({ type, status: 'pass', sha256: 'f'.repeat(64) }),
        ),
      },
    };
    bindSyntheticTrainingRun(manifest);
    const taskScopedManifest = structuredClone(manifest);
    const taskScopedDomains = [
      'anatomy',
      'computer-science',
      'economics',
      'geology',
      'music-theory',
      'physics',
      'user-experience-design',
    ];
    Object.assign(taskScopedManifest.training, {
      pairCount: 129,
      domainCount: 7,
      groupCount: 25,
      modelJudgePairCount: 129,
      modelJudgeDomainCount: 7,
      domainGroupCounts: Object.fromEntries(taskScopedDomains.map((domain) => [domain, 2])),
      modelJudgeDomainCounts: Object.fromEntries(taskScopedDomains.map((domain) => [domain, 8])),
      splitCounts: { train: 106, valid: 12, test: 11 },
      splitDomainCounts: { train: 7, valid: 7, test: 7 },
      taskScope: {
        ...taskScopedManifest.training.taskScope,
        families: [{ id: 'lesson-kernel', rows: 129 }],
      },
    });
    const taskScopedGate = assessScionAdapterPromotion({ manifest: taskScopedManifest });
    expect(taskScopedGate.gates).toMatchObject({ manifest: true, dataset: true });

    const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(manifest).sha256;
    const domains = ['ethics', 'music', 'ux', 'geology', 'literature'];
    const pairedComparison = (domain, index, variant) => ({
      protocolVersion: 1,
      evidenceProducer: 'scion-paired-evidence-v1',
      pairId: `scion-adapter-${domain}`,
      benchmarkManifestSha256: '9'.repeat(64),
      courseInputSha256: String(index + 1).repeat(64),
      sourcePacketSha256: String(index + 2).repeat(64),
      compilerCommit: 'a'.repeat(40),
      compilerTree: 'e'.repeat(40),
      compilerConfigSha256: 'b'.repeat(64),
      graderVersion: 'deep-quality-v1',
      graderSha256: '8'.repeat(64),
      graderImplementationSha256: '6'.repeat(64),
      baseContractSha256: 'c'.repeat(64),
      compilerTreeDirty: false,
      variant,
    });
    const candidateEvidence = [
      {
        graderBinding: {
          status: 'transitively-bound',
          transitiveBound: true,
          implementationSha256: '6'.repeat(64),
          declaredImplementationSha256: '6'.repeat(64),
          implementationFileCount: 10,
        },
        fullCourses: domains.map((domain, index) => ({
          domain,
          courseId: `${domain}-course`,
          lessonCount: 12,
          packageValid: true,
          packageGrade: 99,
          p0: 0,
          p1: 0,
          p2: 0,
          scionPassCalls: 75,
          adapterActive: true,
          adapterId: manifest.adapter.id,
          adapterPackageIdentitySha256,
          baseRevision: manifest.base.revision,
          adapterScale: 1,
          evidenceProducer: 'scion-paired-evidence-v1',
          artifactReceiptSha256: String(index + 3).repeat(64),
          comparison: pairedComparison(domain, index, 'adapter'),
        })),
      },
    ];
    const baseEvidence = [
      {
        graderBinding: {
          status: 'transitively-bound',
          transitiveBound: true,
          implementationSha256: '6'.repeat(64),
          declaredImplementationSha256: '6'.repeat(64),
          implementationFileCount: 10,
        },
        fullCourses: domains.map((domain, index) => ({
          domain,
          courseId: `${domain}-course`,
          lessonCount: 12,
          packageValid: true,
          packageGrade: 99,
          p0: 0,
          p1: 0,
          p2: 0,
          scionPassCalls: 100,
          adapterActive: false,
          adapterId: null,
          adapterPackageIdentitySha256: null,
          baseRevision: manifest.base.revision,
          adapterScale: 0,
          evidenceProducer: 'scion-paired-evidence-v1',
          artifactReceiptSha256: String(index + 4).repeat(64),
          comparison: pairedComparison(domain, index, 'base-only'),
        })),
      },
    ];

    const report = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(report).toMatchObject({ status: 'pass', promotable: true, efficiency: { medianReduction: 0.25 } });

    Object.assign(baseEvidence[0].fullCourses[0], {
      packageValid: false,
      evaluationValid: true,
      evaluationStatus: 'quality-blocked-evaluation',
      packageGrade: 74,
      p0: 1,
      p1: 3,
      p2: 3,
    });
    const improvedOverBlockedBase = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(improvedOverBlockedBase).toMatchObject({ status: 'pass', promotable: true });
    expect(improvedOverBlockedBase.courseChecks[0]).toMatchObject({
      baseComparable: true,
      qualityNonRegression: true,
      baseGrade: 74,
    });
    Object.assign(baseEvidence[0].fullCourses[0], {
      packageValid: true,
      evaluationValid: true,
      evaluationStatus: 'publishable-package',
      packageGrade: 99,
      p0: 0,
      p1: 0,
      p2: 0,
    });

    candidateEvidence[0].graderBinding.transitiveBound = false;
    const unboundGrader = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(unboundGrader).toMatchObject({
      status: 'blocked',
      promotable: false,
      gates: { graderBinding: false, pairedEvidence: false },
    });
    candidateEvidence[0].graderBinding.transitiveBound = true;

    baseEvidence[0].fullCourses[0].packageGrade = 100;
    const qualityRegression = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(qualityRegression).toMatchObject({ status: 'blocked', promotable: false });
    expect(qualityRegression.courseChecks[0].qualityNonRegression).toBe(false);
    baseEvidence[0].fullCourses[0].packageGrade = 99;

    candidateEvidence[0].fullCourses[0].adapterPackageIdentitySha256 = '0'.repeat(64);
    const mismatched = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(mismatched).toMatchObject({ status: 'blocked', promotable: false });
    expect(mismatched.failedGates).toContain('courseQuality');
  });

  it('rejects unpaired, dirty, duplicate, or scale-mismatched adapter course evidence', () => {
    const manifest = {
      schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.7', format: 'mlx-lora-safetensors' },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      training: {
        method: 'orpo-lora',
        datasetManifestSha256: 'd'.repeat(64),
        datasetStatus: 'ready',
        primaryPreferenceEvidence: 'single-model-judge',
        pairCount: 3200,
        domainCount: 5,
        groupCount: 15,
        ...balancedTrainingEvidence(),
      },
      files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: 'e'.repeat(64) }],
      runtime: { supported: ['mlx-vlm'] },
      promotion: {
        status: 'candidate',
        promotable: false,
        evidence: ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map(
          (type) => ({ type, status: 'pass', sha256: 'f'.repeat(64) }),
        ),
      },
    };
    bindSyntheticTrainingRun(manifest);
    const adapterPackageIdentitySha256 = computeScionAdapterPackageIdentity(manifest).sha256;
    const comparison = (variant) => ({
      protocolVersion: 1,
      evidenceProducer: 'scion-paired-evidence-v1',
      pairId: 'duplicate-pair',
      benchmarkManifestSha256: '9'.repeat(64),
      courseInputSha256: '1'.repeat(64),
      sourcePacketSha256: '2'.repeat(64),
      compilerCommit: 'a'.repeat(40),
      compilerTree: 'e'.repeat(40),
      compilerConfigSha256: 'b'.repeat(64),
      graderVersion: 'deep-quality-v1',
      graderSha256: '8'.repeat(64),
      graderImplementationSha256: '6'.repeat(64),
      baseContractSha256: 'c'.repeat(64),
      compilerTreeDirty: false,
      variant,
    });
    const course = (domain, variant) => ({
      domain,
      courseId: `${domain}-course`,
      lessonCount: 12,
      packageValid: true,
      packageGrade: 99,
      p0: 0,
      p1: 0,
      p2: 0,
      scionPassCalls: variant === 'adapter' ? 75 : 100,
      adapterActive: variant === 'adapter',
      adapterId: variant === 'adapter' ? manifest.adapter.id : null,
      adapterPackageIdentitySha256: variant === 'adapter' ? adapterPackageIdentitySha256 : null,
      baseRevision: manifest.base.revision,
      adapterScale: variant === 'adapter' ? 1 : 0,
      evidenceProducer: 'scion-paired-evidence-v1',
      artifactReceiptSha256: '7'.repeat(64),
      comparison: comparison(variant),
    });
    const domains = ['ethics', 'music', 'ux', 'geology', 'literature'];
    const candidateCourses = domains.map((domain) => course(domain, 'adapter'));
    const baseCourses = domains.map((domain) => course(domain, 'base-only'));
    candidateCourses[0].comparison.compilerTreeDirty = true;
    candidateCourses[1].adapterScale = 4;
    candidateCourses.push({ ...candidateCourses[2] });
    candidateCourses.push(course('history', 'adapter'));

    const report = assessScionAdapterPromotion({
      manifest,
      adapterPackageIdentitySha256,
      candidateEvidence: [
        {
          graderBinding: {
            status: 'transitively-bound',
            transitiveBound: true,
            implementationSha256: '6'.repeat(64),
            declaredImplementationSha256: '6'.repeat(64),
            implementationFileCount: 10,
          },
          fullCourses: candidateCourses,
        },
      ],
      baseEvidence: [
        {
          graderBinding: {
            status: 'transitively-bound',
            transitiveBound: true,
            implementationSha256: '6'.repeat(64),
            declaredImplementationSha256: '6'.repeat(64),
            implementationFileCount: 10,
          },
          fullCourses: baseCourses,
        },
      ],
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'single-model-judge', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });

    expect(report).toMatchObject({
      status: 'blocked',
      promotable: false,
      pairing: { uniquePairIds: false, unmatchedCandidateDomains: ['history'] },
    });
    expect(report.failedGates).toEqual(expect.arrayContaining(['pairedEvidence', 'courseQuality']));
    expect(report.courseChecks.find((entry) => entry.domain === 'ethics')?.pairing.contractShapePass).toBe(false);
    expect(report.courseChecks.find((entry) => entry.domain === 'music')?.pairing.scalePass).toBe(false);
    expect(report.courseChecks.find((entry) => entry.domain === 'ux')?.uniqueEvidencePass).toBe(false);
  });
});
