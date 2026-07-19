/**
 * v0143-quality-badge.test.js — WS-A proof: the package grades itself.
 *
 * Covers the V0.14.3 roadmap A1–A3 contracts end-to-end through the REAL
 * exporters (no mocks):
 *
 *   (1) FileProvider parity — the same fixture package grades byte-
 *       identically through the Node fs provider (Crucible path, via the
 *       tests/lib shim) and the browser memory provider; the in-app honesty
 *       source (honestyFromDigest) differs from console mode by EXACTLY the
 *       checks named in IN_APP_EXCLUDED_CHECKS.
 *   (2) Healthy package through the real packageZipExporter — manifest
 *       gains quality { score ≥ 85, grade, graderVersion, findingCounts,
 *       dimensions, gradedAt }, QUALITY_REPORT.md ships at the zip root,
 *       and the grader never grades its own outputs (a regrade of the
 *       downloaded zip reproduces the embedded score).
 *   (3) Seeded P0 — a discipline P0 (Mandarin-titled course with zero CJK)
 *       lands in manifest.quality.findingCounts AND surfaces as a
 *       finalizer readiness blocker through applyQualityToFinalizerResult.
 *   (4) Timeout path — quality { status: 'not-graded', reason } while the
 *       zip stays complete.
 *   (5) Export verifier count regression net — QUALITY_REPORT.md adds no
 *       verifier checks and changes no counts.
 *
 * The Crucible cross-check column (roadmap A5(4), inAppScore in the round
 * report) belongs to the WS-B/release agent — deliberately not here.
 *
 * V0.14.4 WS-B2 adds the chip-placement contracts at the bottom: the
 * workspace-header WorkspaceQualityChip states (grading… / Quality N · G /
 * Not graded) and ExportSidePanel's compact download-card QualityStamp,
 * both rendered from the same packageQualityPass.quality value.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
} from '../src/lib/courseGraph';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { verifyPackageExports } from '../src/lib/packageExportVerifier.js';
import { applyQualityToFinalizerResult, runDeterministicPackageFinalizer } from '../src/lib/packageFinalizer.js';
import { buildRunDigest } from '../src/lib/runDigest.js';
// The shim path — the exact module the Crucible driver lazy-imports. It must
// keep the legacy grade({ extractedDir }) signature working (A1).
import { grade, honestyFromDigest, GRADER_VERSION, IN_APP_EXCLUDED_CHECKS } from './lib/deepQualityGrader.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import WorkspaceQualityChip from '../src/components/WorkspaceQualityChip.jsx';
import { QualityStamp } from '../src/components/ExportSidePanel.jsx';
import { getPackageTrustStatus } from '../src/lib/packageTrustStatus.js';

beforeAll(() => {
  // pptx text-fit pass measures with OffscreenCanvas — stub for node env.
  const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
});

const GEO_FEATURES = ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];
const GEO_COURSE = { id: 'geology', title: 'Physical Geology', featureIds: GEO_FEATURES };

const PIPELINE_STATE = {
  genomeLinker: '2 genome + 0 cached of 4 lessons (8 concepts, 6 citations, 1 bridges)',
  enrichment: 'ran (4/4)',
  judgment: 'no gaps across 8 linked concepts',
  knowledgeBackbone: '2/4 lessons genome-linked · 6 cited open resources',
};

function geologyCourseMap(courseName = 'Physical Geology') {
  const topics = [
    ['Minerals', 'mineral identification'],
    ['Igneous Rocks', 'igneous textures'],
    ['Sedimentary Rocks', 'sedimentary environments'],
    ['Metamorphic Rocks', 'metamorphic grade'],
  ];
  return {
    courseName,
    semester: 'Fall 2026',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${concept}.`,
          learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
          weeklyAssessments: `Quiz: ${concept} problems`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${concept} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

function healthyBudget() {
  return { runId: 'run-quality-1', usageLedger: [], pipeline: { ...PIPELINE_STATE } };
}

function healthyDigest() {
  return buildRunDigest({
    budget: healthyBudget(),
    exportVerification: { status: 'passed', checked: 30, failed: 0, warningCount: 0, checks: [] },
    finish: { finalStatus: 'ready', blockers: 0, warnings: 0, repairsApplied: 0, retryCallCount: 0 },
    generation: { provider: 'anthropic', lessonCount: 4, featureIds: GEO_FEATURES },
  });
}

// Console transcript for the fs/Crucible grading mode — consistent with
// PIPELINE_STATE so the healthy honesty checks all pass.
function healthyConsoleLog() {
  return [
    `[CM][API] genomeLink {"label":"CurriculumOS linker","detail":"${PIPELINE_STATE.genomeLinker}"}`,
    `[CM][API] pipelineDecision {"label":"Course judgment","detail":"${PIPELINE_STATE.judgment}"}`,
    `2/4 lessons genome-linked · 6 cited open resources`,
    `enrichment: ran (4/4)`,
  ].join('\n');
}

function buildPackageFixture(courseName = 'Physical Geology') {
  const courseMap = geologyCourseMap(courseName);
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, GEO_FEATURES);
  const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
  const deliverables = {};
  for (const featureId of GEO_FEATURES) {
    deliverables[featureId] = { status: 'done', data: compiled[featureId] };
  }
  return { courseMap: displayMap, deliverables, graph };
}

async function buildPackage({ courseName = 'Physical Geology', quality = {}, pipelineState = PIPELINE_STATE } = {}) {
  const { courseMap, deliverables, graph } = buildPackageFixture(courseName);
  const result = await buildCourseMaterialsZip({
    courseMap,
    courseName,
    deliverables,
    featureIds: ['courseMap', ...GEO_FEATURES],
    courseGraph: graph,
    pipelineState: { ...pipelineState },
    quality,
  });
  return { ...result, fixture: { courseMap, deliverables, graph } };
}

async function extractZipToDir(blob, dir) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const dest = path.join(dir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, await entry.async('nodebuffer'));
  }
}

async function fileMapFromZip(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const map = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    map[name] = await entry.async('uint8array');
  }
  return map;
}

describe('A5(1) — memory vs fs FileProvider parity', () => {
  it('grades the same package identically through both providers, minus IN_APP_EXCLUDED_CHECKS', async () => {
    const { blob } = await buildPackage({ quality: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0143-parity-'));
    try {
      await extractZipToDir(blob, dir);
      // Seed BOTH console-only honesty signals so the exclusion list is
      // exercised, not vacuous: a genuine app error (console-noise P2) and a
      // mass LO-field repair line (mass-repair-fill P1).
      const consoleLogText = [
        healthyConsoleLog(),
        "[error] Uncaught TypeError: Cannot read properties of undefined (reading 'lessons')",
        '[CM] blueprint_course_map_repaired {"repairedFieldCount": 14}',
      ].join('\n');
      const digest = healthyDigest();

      // (a) Pure provider parity — same console honesty mode, fs vs memory.
      const fsResult = await grade({ extractedDir: dir, consoleLogText, digest, course: GEO_COURSE });
      const memResult = await grade({
        fileProvider: createMemoryFileProvider(await fileMapFromZip(blob)),
        consoleLogText,
        digest,
        course: GEO_COURSE,
      });
      expect(memResult.findings).toEqual(fsResult.findings);
      expect(memResult.scores).toEqual(fsResult.scores);
      expect(memResult.overall).toEqual(fsResult.overall);

      // (b) In-app honesty mode differs by EXACTLY the excluded checks.
      expect(IN_APP_EXCLUDED_CHECKS.map((check) => check.id)).toEqual(['console-noise', 'mass-repair-fill']);
      for (const check of IN_APP_EXCLUDED_CHECKS) {
        expect(check.reason.length, check.id).toBeGreaterThan(10);
        // Each excluded check actually fired in console mode (seeded above).
        expect(
          fsResult.findings.some((finding) => check.detailPattern.test(finding.detail)),
          `expected seeded console-mode finding for ${check.id}`,
        ).toBe(true);
      }
      const inAppResult = await grade({
        fileProvider: createMemoryFileProvider(await fileMapFromZip(blob)),
        honesty: honestyFromDigest(healthyBudget(), digest),
        course: GEO_COURSE,
      });
      const stripIds = (findings) => findings.map(({ id: _id, ...rest }) => rest);
      const fsMinusExcluded = fsResult.findings.filter(
        (finding) => !IN_APP_EXCLUDED_CHECKS.some((check) => check.detailPattern.test(finding.detail)),
      );
      expect(stripIds(inAppResult.findings)).toEqual(stripIds(fsMinusExcluded));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

describe('A5(2) — healthy package ships its own audit', () => {
  it('manifest.quality score ≥ 85, QUALITY_REPORT.md in the zip, self-outputs never graded', async () => {
    const result = await buildPackage({ quality: { budget: healthyBudget(), digest: healthyDigest() } });

    expect(result.quality?.status).toBe('graded');
    expect(result.quality.score).toBeGreaterThanOrEqual(85);
    expect(result.quality.graderVersion).toBe(GRADER_VERSION);
    expect(result.quality.findingCounts.p0).toBe(0);
    expect(Object.keys(result.quality.dimensions)).toContain('honesty');
    expect(result.quality.gradedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const report = await zip.file('QUALITY_REPORT.md').async('string');
    expect(report).toContain('## Scores');
    expect(report).toContain(`**Overall: ${result.quality.score}/100 (${result.quality.grade})**`);
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.quality).toEqual(result.quality);
    // The report rides the returned files list but, like the manifest's own
    // entry, is not in manifest.files (the manifest is finalized first).
    expect(result.files.some((file) => file.path === 'QUALITY_REPORT.md')).toBe(true);
    expect((manifest.files || []).some((file) => file.path === 'QUALITY_REPORT.md')).toBe(false);

    // Self-grading exclusion: regrading the DOWNLOADED zip (which now
    // contains manifest.quality + QUALITY_REPORT.md) reproduces the embedded
    // score exactly — the grader ignores its own outputs.
    const regrade = await grade({
      fileProvider: createMemoryFileProvider(await fileMapFromZip(result.blob)),
      honesty: honestyFromDigest(healthyBudget(), healthyDigest()),
      course: GEO_COURSE,
    });
    expect(regrade.overall.score).toBe(result.quality.score);
    expect(regrade.findings.filter((finding) => /quality_report/i.test(finding.file))).toEqual([]);
  }, 120000);

  it('manifest and QUALITY_REPORT preserve native authoring fallback caveats offline', async () => {
    const digest = healthyDigest();
    digest.pipeline = {
      ...(digest.pipeline || {}),
      nativeAuthoring: 'fell back to prose: degenerate-skeleton (1 assessment for 8 lessons)',
    };
    const result = await buildPackage({ quality: { budget: healthyBudget(), digest } });

    expect(result.quality?.status).toBe('graded');
    expect(result.quality.findingCounts.p2).toBeGreaterThanOrEqual(1);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const report = await zip.file('QUALITY_REPORT.md').async('string');
    expect(manifest.pipeline.nativeAuthoring).toContain('fell back to prose');
    expect(report).toContain('**[substance] native authoring fell back to prose**');
    expect(report).toContain('degenerate-skeleton (1 assessment for 8 lessons)');

    const regrade = await grade({
      fileProvider: createMemoryFileProvider(await fileMapFromZip(result.blob)),
      consoleLogText: healthyConsoleLog(),
      digest,
      course: GEO_COURSE,
    });
    expect(
      regrade.findings.some(
        (finding) => finding.dimension === 'substance' && finding.detail === 'native authoring fell back to prose',
      ),
    ).toBe(true);

    const offlineRegrade = await grade({
      fileProvider: createMemoryFileProvider(await fileMapFromZip(result.blob)),
      course: GEO_COURSE,
    });
    expect(
      offlineRegrade.findings.some(
        (finding) => finding.dimension === 'substance' && finding.detail === 'native authoring fell back to prose',
      ),
    ).toBe(true);
  }, 120000);

  it('texture repeated-prose warnings do not masquerade as native authoring fallback', async () => {
    const digest = healthyDigest();
    digest.gates = {
      ...(digest.gates || {}),
      flaggedChecks: [
        {
          featureId: 'quality',
          status: 'warning',
          message:
            'quality grade 99/100 (A) — 0 P0, 0 P1, 1 P2; Texture score 83/100 indicates repeated prose patterns across deliverables',
        },
      ],
    };
    const result = await buildPackage({ quality: false });

    const regrade = await grade({
      fileProvider: createMemoryFileProvider(await fileMapFromZip(result.blob)),
      honesty: honestyFromDigest(healthyBudget(), digest),
      course: GEO_COURSE,
    });

    expect(
      regrade.findings.some(
        (finding) => finding.dimension === 'honesty' && finding.detail === 'native fallback missing manifest',
      ),
    ).toBe(false);
  }, 120000);

  it('offline grading detects unenriched compiled packages and caps major findings below A', async () => {
    const result = await buildPackage({
      quality: false,
      pipelineState: {
        ...PIPELINE_STATE,
        genomeLinker: '0 genome + 0 cached of 4 lessons (0 concepts, 0 citations, 0 bridges)',
        enrichment: 'none',
      },
    });
    const offlineRegrade = await grade({
      fileProvider: createMemoryFileProvider(await fileMapFromZip(result.blob)),
      course: GEO_COURSE,
    });
    expect(
      offlineRegrade.findings.some(
        (finding) =>
          finding.severity === 'P1' &&
          finding.detail === 'deliverables compiled without enrichment, creating mail-merge content risk',
      ),
    ).toBe(true);
    expect(offlineRegrade.overall.score).toBeLessThanOrEqual(89);
    expect(offlineRegrade.overall.grade).toBe('B');
  }, 120000);

  it('console-assisted grading catches legacy native fallback packages that did not disclose it in the manifest', async () => {
    const result = await buildPackage({ quality: false });
    const fileMap = await fileMapFromZip(result.blob);
    const manifest = JSON.parse(new TextDecoder().decode(fileMap['PACKAGE_MANIFEST.json']));
    delete manifest.pipeline.nativeAuthoring;
    fileMap['PACKAGE_MANIFEST.json'] = JSON.stringify(manifest, null, 2);
    const regrade = await grade({
      fileProvider: createMemoryFileProvider(fileMap),
      consoleLogText: `${healthyConsoleLog()}\n[CM][API] nativeAuthoringFellBack {"detail":"fell back to prose: degenerate-skeleton"}`,
      course: GEO_COURSE,
    });
    expect(
      regrade.findings.some(
        (finding) => finding.dimension === 'honesty' && finding.detail === 'native fallback missing manifest',
      ),
    ).toBe(true);
  }, 120000);
});

describe('A5(3) — seeded P0 reaches the manifest and the readiness channel', () => {
  it('a Mandarin-titled package with zero CJK carries the discipline P0 and blocks readiness', async () => {
    // The in-zip course identity comes from the manifest courseName — naming
    // the geology-content fixture as a Mandarin course makes the language
    // probe fire deterministically (zero CJK/pinyin in its own materials).
    const result = await buildPackage({
      courseName: 'Elementary Mandarin Chinese I',
      quality: { budget: healthyBudget(), digest: healthyDigest() },
    });
    expect(result.quality?.status).toBe('graded');
    expect(result.quality.findingCounts.p0).toBeGreaterThanOrEqual(1);
    const manifest = JSON.parse(
      await (await JSZip.loadAsync(await result.blob.arrayBuffer())).file('PACKAGE_MANIFEST.json').async('string'),
    );
    expect(manifest.quality.findingCounts.p0).toBeGreaterThanOrEqual(1);
    expect(manifest.readiness.status).toBe('blocked');
    expect(manifest.readiness.blockers.some((issue) => issue.source === 'qualityGate')).toBe(true);

    // The finalizer integration seam AppFlow applies after grading: a P0 is
    // no longer a soft warning because the package is not safe to hand off.
    const { fixture } = result;
    const finalizerResult = runDeterministicPackageFinalizer({
      courseMap: fixture.courseMap,
      deliverables: fixture.deliverables,
      selectedFeatures: GEO_FEATURES,
      courseGraph: fixture.graph,
    });
    const withQuality = applyQualityToFinalizerResult(finalizerResult, result.quality);
    expect(withQuality.quality).toEqual(result.quality);
    const blocker = withQuality.readiness.blockers.find((issue) => issue.source === 'qualityGate');
    expect(blocker, JSON.stringify(withQuality.readiness.blockers)).toBeTruthy();
    expect(blocker.severity).toBe('blocker');
    expect(blocker.message).toMatch(/P0 finding/);
    expect(blocker.message).toMatch(/quality report/i);
    expect(withQuality.readiness.status).toBe('blocked');

    // A clean grade adds nothing to the channel.
    const clean = applyQualityToFinalizerResult(finalizerResult, {
      status: 'graded',
      score: 100,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    });
    expect(clean.readiness.warnings.filter((issue) => issue.source === 'qualityGate')).toEqual([]);
  }, 120000);
});

describe('A5(4) — timeout path never blocks the package', () => {
  it('quality reports not-graded on timeout while the zip stays complete', async () => {
    const result = await buildPackage({ quality: { timeoutMs: 0 } });
    expect(result.quality.status).toBe('not-graded');
    expect(result.quality.reason).toMatch(/timed out/);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.quality).toEqual(result.quality);
    // No report without a grade, and every regular file still ships.
    expect(zip.file('QUALITY_REPORT.md')).toBeNull();
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
    expect(names).toContain('PACKAGE_MANIFEST.json');
    for (const featureFolder of ['Course Map', 'Lesson Plans', 'Slide Decks', 'Quiz & Exam Bank']) {
      expect(
        names.some((name) => name.startsWith(`${featureFolder}/`)),
        `missing ${featureFolder} in ${names.join(', ')}`,
      ).toBe(true);
    }
  }, 120000);
});

// ── V0.14.4 WS-B2: quality to the crown ──────────────────────────────────────
// The PRIMARY chip renders in the workspace header from the same
// packageQualityPass state the export panel reads; the panel keeps a compact
// stamp on the Ready-to-download card. Both open the same report modal
// (open-state lifted to AppFlow; the panel renders it in controlled mode).
const gradedQuality = (overrides = {}) => ({
  status: 'graded',
  score: 100,
  grade: 'A',
  findingCounts: { p0: 0, p1: 0, p2: 0 },
  ...overrides,
});

describe('B2 — WorkspaceQualityChip header states', () => {
  const render = (packageQualityPass) =>
    renderToStaticMarkup(React.createElement(WorkspaceQualityChip, { packageQualityPass, onOpenReport: () => {} }));

  it('renders nothing before any finish pass runs', () => {
    expect(render(null)).toBe('');
    expect(render({ status: 'idle' })).toBe('');
    // A blocked generation without a grade result stays silent too.
    expect(render({ status: 'blocked', message: 'Generation failed.' })).toBe('');
  });

  it('pulses a slate "Grading…" state while the finish/grade pass runs', () => {
    const html = render({ status: 'running', message: 'Finishing package…' });
    expect(html).toContain('workspace-quality-chip-grading');
    expect(html).toContain('Grading…');
    expect(html).toContain('animate-pulse');
    expect(html).toContain('slate');
    expect(html).toContain('aria-label="Package quality: grading in progress"');
  });

  it('renders the emerald graded chip only for a clean 100/100 package, as a ≥32px button', () => {
    const html = render({ status: 'ready', quality: gradedQuality() });
    expect(html).toContain('workspace-quality-chip');
    expect(html).toContain('Quality 100 · A');
    expect(html).toContain('emerald');
    expect(html).toContain('<button');
    expect(html).toContain('min-h-[32px]');
    expect(html).toContain('aria-label="Package quality: 100 out of 100, grade A, 0 issues — open the quality report"');
  });

  it('turns amber when the grade has findings, score loss, or texture loss', () => {
    const caveatedA = render({
      status: 'ready',
      quality: gradedQuality({ score: 97, grade: 'A', findingCounts: { p0: 0, p1: 2, p2: 0 }, texture: { score: 93 } }),
      receipt: { exportWarningCount: 1 },
    });
    expect(caveatedA).toContain('amber');
    expect(caveatedA).not.toContain('emerald');
    expect(caveatedA).toContain('Quality 97');
    expect(caveatedA).toContain('Texture 93');

    const withP0 = render({
      status: 'ready',
      quality: gradedQuality({ score: 88, grade: 'B', findingCounts: { p0: 1, p1: 0, p2: 2 } }),
    });
    expect(withP0).toContain('border-red-200');
    expect(withP0).not.toContain('emerald');
    expect(withP0).toContain('Fix required');
    expect(withP0).toContain('including 1 critical');

    const gradeC = render({
      status: 'ready',
      quality: gradedQuality({ score: 74, grade: 'C', findingCounts: { p0: 0, p1: 3, p2: 1 } }),
    });
    expect(gradeC).toContain('amber');
    expect(gradeC).toContain('Quality 74 · C');
  });

  it('does not foreground a 100/100 grade when the finish pass is blocked', () => {
    const html = render({
      status: 'blocked',
      blockers: 1,
      warnings: 27,
      quality: gradedQuality({
        score: 100,
        grade: 'A',
        findingCounts: { p0: 0, p1: 0, p2: 0 },
        texture: { score: 94 },
      }),
    });
    expect(html).toContain('workspace-quality-chip');
    expect(html).toContain('Needs review');
    expect(html).toContain('border-red-200');
    expect(html).toContain('export blocked by 1 blocker');
    expect(html).toContain('grade result 100 out of 100');
    expect(html).toContain('Texture 94');
    expect(html).not.toContain('Quality 100');
    expect(html).not.toContain('emerald');
  });

  it('renders the slate "Not graded" state with the reason in the tooltip', () => {
    const html = render({
      status: 'ready',
      quality: { status: 'not-graded', reason: 'quality grading timed out after 20000ms' },
    });
    expect(html).toContain('workspace-quality-chip-not-graded');
    expect(html).toContain('Not graded');
    expect(html).toContain('slate');
    expect(html).toContain('title="Quality grading did not run: quality grading timed out after 20000ms"');
  });
});

describe('B2 — ExportSidePanel compact download-card stamp', () => {
  const render = (quality) => renderToStaticMarkup(React.createElement(QualityStamp, { quality, onOpen: () => {} }));

  it('stamps "100 · A" on the card for a graded package', () => {
    const html = render(gradedQuality());
    expect(html).toContain('quality-stamp');
    expect(html).toContain('100 · A');
    expect(html).toContain('emerald');
    expect(html).toContain('<button');
  });

  it('turns amber for P0/low grades and stays silent when not graded', () => {
    expect(render(gradedQuality({ score: 70, grade: 'C' }))).toContain('amber');
    expect(render({ status: 'not-graded', reason: 'timeout' })).toBe('');
    expect(render(null)).toBe('');
  });
});

describe('V0.15.49 — shared package trust status spine', () => {
  it('counts one quality P0 once even when finalizer and readiness mirror the same blocker', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        quality: gradedQuality({
          score: 74,
          grade: 'C',
          findingCounts: { p0: 1, p1: 1, p2: 2 },
          texture: { score: 88 },
        }),
        receipt: { exportFailed: 0 },
      },
      readiness: { blockers: [{ source: 'qualityGate' }], warnings: [] },
    });

    expect(status.blocked).toBe(true);
    expect(status.blockerCount).toBe(1);
    expect(status.qualityIssue.count).toBe(4);
  });

  it('marks a downloadable 97/100 package with P1, texture loss, and export warnings as review, not clean', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        warnings: 0,
        blockers: 0,
        quality: gradedQuality({
          score: 97,
          grade: 'A',
          findingCounts: { p0: 0, p1: 2, p2: 0 },
          texture: { score: 93 },
        }),
        receipt: { exportWarningCount: 1 },
      },
    });

    expect(status.clean).toBe(false);
    expect(status.review).toBe(true);
    expect(status.canDownload).toBe(true);
    expect(status.toneKey).toBe('assumptions');
    expect(status.reviewMeta).toContain('content note');
    expect(status.reviewMeta).toContain('export note');
  });

  it('keeps only a perfect graded package in clean green state', () => {
    const status = getPackageTrustStatus({
      packageQualityPass: {
        status: 'ready',
        warnings: 0,
        blockers: 0,
        quality: gradedQuality({ texture: { score: 100 } }),
        receipt: { exportWarningCount: 0, exportFailed: 0 },
      },
    });

    expect(status.clean).toBe(true);
    expect(status.review).toBe(false);
    expect(status.toneKey).toBe('excellent');
  });
});

describe('A5(5) — export verifier count regression net', () => {
  it('the report file adds no verifier checks: counts match the feature formula exactly', async () => {
    const { courseMap, deliverables } = buildPackageFixture();
    const verification = await verifyPackageExports({
      courseMap,
      deliverables,
      selectedFeatures: ['courseMap', ...GEO_FEATURES],
    });
    expect(verification.failed).toBe(0);
    // courseMap → 2 checks (xlsx + pdf); each deliverable → 4 checks
    // (content + csv + docx/pptx + pdf). QUALITY_REPORT.md must not appear.
    expect(verification.checked).toBe(2 + GEO_FEATURES.length * 4);
    expect(verification.checks.every((check) => check.featureId !== 'quality')).toBe(true);
  }, 120000);
});
