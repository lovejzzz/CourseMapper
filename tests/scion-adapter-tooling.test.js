import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildScionAdapterDataset } from '../scripts/scionAdapterDataset.mjs';
import { getCourseById } from '../scripts/crucible/courses.mjs';
import { buildScionAdapterManifest, sha256File, verifyScionAdapterPackage } from '../scripts/scionAdapterPackage.mjs';
import { assessScionAdapterPromotion } from '../scripts/scionAdapterPromotionAudit.mjs';
import {
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

function approvedRow() {
  return {
    kind: 'mc-item',
    prompt: 'Write one evidence-grounded multiple-choice item.',
    chosen: goodMc(),
    rejected: goodMc({ q: 'Which observation suggests changing the prototype navigation?' }),
    context: { domain: 'user experience design', courseId: 'ux-101' },
    preferenceEvidence: {
      kind: 'blind-instructor-preference',
      verified: true,
      preferred: 'chosen',
      unanimous: true,
      reviewerIds: ['instructor-a', 'instructor-b'],
      reviewerRoles: ['working-instructor', 'working-instructor'],
      reviewHashes: ['review-a', 'review-b'],
    },
  };
}

function balancedTrainingEvidence(domains = TRAINING_DOMAINS, instructorPairsPerDomain = 20) {
  return {
    instructorDomainCount: domains.length,
    domainGroupCounts: Object.fromEntries(domains.map((domain) => [domain, 3])),
    instructorDomainCounts: Object.fromEntries(domains.map((domain) => [domain, instructorPairsPerDomain])),
    splitCounts: { train: 1200, valid: 1000, test: 1000 },
    splitDomainCounts: { train: domains.length, valid: domains.length, test: domains.length },
  };
}

describe('Scion adapter tooling', () => {
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
      },
      leakage: { groupOverlapCount: 0 },
    });
    expect(result.manifest.quarantine[0].issues).toContain('duplicate-pair');
  });

  it('builds a non-promotable research tier only with balanced course groups', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-research-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [];
    for (const domain of ['computer-science', 'geology', 'music-theory', 'user-experience-design']) {
      for (let course = 1; course <= 3; course += 1) {
        for (let item = 1; item <= 9; item += 1) {
          rows.push({
            ...approvedRow(),
            prompt: `Write grounded item ${item} for ${domain} course ${course}.`,
            chosen: goodMc({
              q: `Which evidence most directly supports decision ${item} in ${domain} course ${course}?`,
            }),
            rejected: goodMc({
              q: `Which observation should be considered for decision ${item} in ${domain} course ${course}?`,
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
      status: 'research-ready',
      promotable: false,
      counts: {
        total: 108,
        domains: 4,
        groups: 12,
        train: 36,
        valid: 36,
        test: 36,
        trainDomains: 4,
        validDomains: 4,
        testDomains: 4,
        blindInstructorPairs: 108,
        blindInstructorDomains: 4,
      },
      instructorDomainCounts: {
        'computer-science': 27,
        geology: 27,
        'music-theory': 27,
        'user-experience-design': 27,
      },
      splitIdentity: {
        strategy: 'domain-stratified-hash-v1',
        domains: {
          train: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
          valid: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
          test: expect.arrayContaining(['computer-science', 'geology', 'music-theory', 'user-experience-design']),
        },
      },
      gate: { profiles: { research: { qualifiedInstructorDomains: 4, issues: [] } } },
      leakage: { groupOverlapCount: 0 },
    });
    expect(result.manifest.gate.profiles.production.issues).toContain('verified-pairs:108<3000');
  });

  it('blocks research when instructor evidence is concentrated in one domain', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-adapter-unbalanced-instructor-dataset-'));
    const source = path.join(root, 'source.jsonl');
    const rows = [];
    for (let item = 1; item <= 100; item += 1) {
      const course = (item % 3) + 1;
      rows.push({
        ...approvedRow(),
        prompt: `Write instructor-reviewed computer science item ${item}.`,
        chosen: goodMc({ q: `Which evidence validates computer science decision ${item}?` }),
        rejected: goodMc({ q: `Which observation relates to computer science decision ${item}?` }),
        context: { domain: 'computer-science', courseId: `computer-science-${course}` },
      });
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
      counts: { total: 127, domains: 4, groups: 12, blindInstructorPairs: 100, blindInstructorDomains: 1 },
      gate: { profiles: { research: { qualifiedInstructorDomains: 1 } } },
    });
    expect(result.manifest.gate.profiles.research.issues).toContain('blind-instructor-qualified-domains:1<4');
  });

  it('freezes five real held-out course fixtures and requires dataset group proof', async () => {
    const benchmark = JSON.parse(
      await fs.readFile('evaluation/scion-adapters/held-out-course-benchmark-v1.json', 'utf8'),
    );
    expect(validateScionHeldoutBenchmark(benchmark)).toMatchObject({
      valid: true,
      issues: [],
      domains: expect.arrayContaining(['world-languages', 'world-literature', 'psychology', 'nutrition', 'astronomy']),
    });

    const cleanDataset = {
      domains: ['computer-science', 'geology', 'business-ethics'],
      groupIdentity: { algorithm: 'sha256-domain-colon-course-id', hashes: [sha256Value('geology:geo-101')] },
    };
    expect(assessHeldoutDatasetBoundary(benchmark, cleanDataset)).toMatchObject({
      pass: true,
      groupProofAvailable: true,
      domainOverlap: [],
      groupOverlap: [],
    });

    expect(assessHeldoutDatasetBoundary(benchmark, { domains: [] })).toMatchObject({
      pass: false,
      groupProofAvailable: false,
    });
    expect(
      assessHeldoutDatasetBoundary(benchmark, {
        domains: ['astronomy'],
        groupIdentity: {
          algorithm: 'sha256-domain-colon-course-id',
          hashes: [sha256Value('world-literature:world-lit-readings')],
        },
      }),
    ).toMatchObject({
      pass: false,
      domainOverlap: ['astronomy'],
      groupOverlap: ['world-lit-readings'],
    });
  });

  it('derives promotion evidence from two hash-bound Crucible rounds', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-paired-evidence-'));
    const benchmarkPath = path.resolve('evaluation/scion-adapters/held-out-course-benchmark-v1.json');
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
        schemaVersion: 2,
        status: 'ready',
        counts: {
          total: 3200,
          domains: 5,
          groups: 15,
          blindInstructorPairs: 100,
          blindInstructorDomains: 5,
          train: 1200,
          valid: 1000,
          test: 1000,
          trainDomains: 5,
          validDomains: 5,
          testDomains: 5,
        },
        domains: TRAINING_DOMAINS,
        domainGroupCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 3])),
        instructorDomainCounts: Object.fromEntries(TRAINING_DOMAINS.map((domain) => [domain, 20])),
        groupIdentity: {
          algorithm: 'sha256-domain-colon-course-id',
          hashes: [sha256Value('geology:geo-training-101')],
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
      status: 'candidate',
    });
    const adapterManifestSha256 = await sha256File(built.outputPath);
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
        fs.writeFile(path.join(courseDir, 'console.log'), ''),
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
      schemaVersion: 2,
      status: 'smoke-only',
      counts: { total: 1, domains: 1, groups: 1 },
      domainMap: { entries: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(JSON.parse(curated)).toMatchObject({
      context: { domain: 'user-experience-design', courseId: 'ux-101', domainSource: 'registry' },
      preferenceEvidence: {
        kind: 'deterministic-contract-margin',
        scope: 'non-semantic-contract-only',
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
    expect(launcher).not.toContain('BASE_MODEL=google/gemma-4-E2B-it\n');
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
    const manifestSha256 = 'c'.repeat(64);
    const manifest = {
      schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.6', format: 'mlx-lora-safetensors' },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      training: {
        method: 'orpo-lora',
        datasetManifestSha256: 'd'.repeat(64),
        datasetStatus: 'ready',
        pairCount: 3200,
        domainCount: 5,
        groupCount: 15,
        instructorPairCount: 100,
        ...balancedTrainingEvidence(),
      },
      files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: 'e'.repeat(64) }],
      runtime: { supported: ['mlx-vlm'] },
      promotion: {
        status: 'candidate',
        promotable: false,
        evidence: ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map(
          (type) => ({ type, status: 'pass', sha256: 'f'.repeat(64) }),
        ),
      },
    };
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
      baseContractSha256: 'c'.repeat(64),
      compilerTreeDirty: false,
      variant,
    });
    const candidateEvidence = [
      {
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
          adapterManifestSha256: manifestSha256,
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
          adapterManifestSha256: null,
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
      manifestSha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(report).toMatchObject({ status: 'pass', promotable: true, efficiency: { medianReduction: 0.25 } });

    baseEvidence[0].fullCourses[0].packageGrade = 100;
    const qualityRegression = assessScionAdapterPromotion({
      manifest,
      manifestSha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(qualityRegression).toMatchObject({ status: 'blocked', promotable: false });
    expect(qualityRegression.courseChecks[0].qualityNonRegression).toBe(false);
    baseEvidence[0].fullCourses[0].packageGrade = 99;

    candidateEvidence[0].fullCourses[0].adapterManifestSha256 = '0'.repeat(64);
    const mismatched = assessScionAdapterPromotion({
      manifest,
      manifestSha256,
      candidateEvidence,
      baseEvidence,
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
          type,
          true,
        ]),
      ),
    });
    expect(mismatched).toMatchObject({ status: 'blocked', promotable: false });
    expect(mismatched.failedGates).toContain('courseQuality');
  });

  it('rejects unpaired, dirty, duplicate, or scale-mismatched adapter course evidence', () => {
    const manifestSha256 = 'c'.repeat(64);
    const manifest = {
      schemaVersion: SCION_ADAPTER_MANIFEST_SCHEMA_VERSION,
      adapter: { id: 'scion-g4e2b-v1', scionVersion: '0.16.7', format: 'mlx-lora-safetensors' },
      base: { ...SCION_GEMMA4_E2B_BASE, exactRevisionRequired: true },
      training: {
        method: 'orpo-lora',
        datasetManifestSha256: 'd'.repeat(64),
        datasetStatus: 'ready',
        pairCount: 3200,
        domainCount: 5,
        groupCount: 15,
        instructorPairCount: 100,
        ...balancedTrainingEvidence(),
      },
      files: [{ path: 'adapters.safetensors', bytes: 1024, sha256: 'e'.repeat(64) }],
      runtime: { supported: ['mlx-vlm'] },
      promotion: {
        status: 'candidate',
        promotable: false,
        evidence: ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map(
          (type) => ({ type, status: 'pass', sha256: 'f'.repeat(64) }),
        ),
      },
    };
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
      adapterManifestSha256: variant === 'adapter' ? manifestSha256 : null,
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
      manifestSha256,
      candidateEvidence: [{ fullCourses: candidateCourses }],
      baseEvidence: [{ fullCourses: baseCourses }],
      verifiedExternalEvidence: Object.fromEntries(
        ['factual-canaries', 'blind-instructor', 'browser-device-matrix', 'production-canaries'].map((type) => [
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
