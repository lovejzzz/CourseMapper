import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  buildEvidenceArtifactBinding,
  buildCourseMaterialsZip,
  buildOperationQualifiedEvidenceReceipt,
  buildPackageReadinessBinding,
  buildPackageReadinessReceipt,
  downloadCourseMaterialsZip,
  hasVerifiedPackageDownloadReceipt,
  mergeSourceLedgerBundles,
  normalizeOfficeArchiveForPackage,
  PackageZipExportError,
  sanitizeFilePart,
} from '../packageZipExporter';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter';
import { buildXlsxBuffer } from '../xlsxGenerator';
import { saveAs } from 'file-saver';
import { buildNotApplicableDisposition } from '../deliverableApplicability';
import { APP_VERSION } from '../appVersion';
import { buildFinalizeSourceEvidence } from '../quality/sourceEvidence';
import { GRADER_VERSION } from '../quality/graderVersion';
import { TEXTURE_VERSION } from '../quality/textureMetric';
import { verifyScoreLedger } from '../quality/scoreLedgerVerifier';

const qualityGraderOverride = vi.hoisted(() => ({ grade: null }));

it('preserves compact numeric structural blockers in download-safety receipts', () => {
  expect(
    buildPackageReadinessReceipt({
      readiness: { status: 'blocked', blockers: 2, warnings: 1 },
      quality: { status: 'graded', score: 92, grade: 'A', findingCounts: { p0: 0, p1: 1, p2: 0 } },
      exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0 },
    }),
  ).toMatchObject({
    contentReadiness: { status: 'review' },
    downloadSafety: { status: 'blocked', blockerCount: 2, structuralBlockerCount: 2 },
  });
});

it('preserves exporter warning evidence without turning an otherwise verified download red', () => {
  expect(
    buildPackageReadinessReceipt({
      readiness: { status: 'ready', blockers: 0, warnings: 0 },
      quality: { status: 'graded', score: 89, grade: 'B', findingCounts: { p0: 0, p1: 1, p2: 1 } },
      exportVerification: { status: 'warnings', checked: 38, failed: 0, warnings: 2 },
    }),
  ).toMatchObject({
    contentReadiness: { status: 'review', reviewFindingCount: 2 },
    exportVerification: { status: 'warnings', checked: 38, failed: 0, warningCount: 2 },
    downloadSafety: { status: 'verified', blockerCount: 0 },
  });
});

it('keeps encoded conformance separate from deterministic evidence readiness', () => {
  const receipt = buildPackageReadinessReceipt({
    readiness: { status: 'ready', blockers: [], warnings: [] },
    quality: {
      status: 'graded',
      score: 99,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
      readiness: {
        evidenceClass: 'deterministic',
        score: 59,
        maxScore: 100,
        points: { potential: 100, earned: 59, lost: 1, unobserved: 40 },
      },
    },
    exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
  });

  expect(receipt).toMatchObject({
    encodedConformance: { status: 'clear', score: 99, maxScore: 100 },
    deterministicEvidenceReadiness: {
      status: 'review',
      score: 59,
      maxScore: 100,
      unobservedPoints: 40,
    },
    contentReadiness: { status: 'review', deprecated: true },
  });
  expect(receipt.encodedConformance).not.toHaveProperty('grade');
});

it('surfaces incomplete authentic-language coverage as a non-autofixable P1 promotion warning', () => {
  const receipt = buildPackageReadinessReceipt({
    readiness: { status: 'ready', blockers: [], warnings: [] },
    quality: { status: 'graded', score: 93, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
    exportVerification: { status: 'passed', checked: 10, failed: 0, warningCount: 0 },
    authenticLanguageDataCoverage: {
      protocol: 'coursemapper-authentic-language-data-coverage-v1',
      requiredLessonCount: 3,
      admittedLessonCount: 2,
      coverage: 2 / 3,
      lessons: [
        { lessonNumber: 1, admitted: true },
        { lessonNumber: 2, admitted: false },
        { lessonNumber: 3, admitted: true },
      ],
    },
  });

  expect(receipt).toMatchObject({
    readiness: {
      status: 'warnings',
      warningCount: 1,
      issues: [
        expect.objectContaining({
          source: 'authenticLanguageDataCoverage',
          promotionSeverity: 'P1',
          autoFixable: false,
          message: expect.stringMatching(/2\/3.*Lessons? 2/i),
        }),
      ],
    },
    contentReadiness: { status: 'review', reviewFindingCount: 1 },
    promotionReadiness: { status: 'blocked', p1Count: 1 },
    downloadSafety: { status: 'verified', blockerCount: 0 },
  });
});

it('surfaces incomplete operation-qualified evidence as a non-autofixable P1 promotion warning', () => {
  const receipt = buildPackageReadinessReceipt({
    readiness: { status: 'ready', blockers: [], warnings: [] },
    quality: { status: 'graded', score: 93, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
    exportVerification: { status: 'passed', checked: 10, failed: 0, warningCount: 0 },
    operationQualifiedEvidence: {
      protocol: 'coursemapper-operation-qualified-evidence-receipt-v1',
      summary: { demandedLessonCount: 5, completeLessonCount: 4, status: 'failed' },
      missingLessonNumbers: [7],
    },
  });

  expect(receipt).toMatchObject({
    readiness: {
      status: 'warnings',
      warningCount: 1,
      issues: [
        expect.objectContaining({
          source: 'operationQualifiedEvidence',
          promotionSeverity: 'P1',
          autoFixable: false,
          message: expect.stringMatching(/4\/5.*Lessons? 7/i),
        }),
      ],
    },
    contentReadiness: { status: 'review', reviewFindingCount: 1 },
    promotionReadiness: { status: 'blocked', p1Count: 1 },
    downloadSafety: { status: 'verified', blockerCount: 0 },
  });
});

it('requires the projected operation to match the exact action-bearing objective', () => {
  const specimen = {
    protocol: 'coursemapper-operation-qualified-evidence-v1',
    authority: 'compiler-verified-calculation',
    operation: 'calculate-and-interpret-confidence-interval',
    inputs: ['n = 100', 'p-hat = 0.58'],
    steps: ['Compute a standard error.', 'Compute both endpoints.'],
    result: '[0.48, 0.68]',
    interpretation: 'This interval comes from a repeated-sampling procedure.',
    boundary: 'The synthetic example depends on its assumptions.',
    transferTask: 'Repeat with a different sample proportion.',
    verification: { checked: true },
  };
  const project = (featureId) => ({
    status: 'done',
    data: [{ lessonNumber: 2, [featureId]: specimen, workedExample: specimen }],
  });
  const receipt = buildOperationQualifiedEvidenceReceipt({
    lessons: [
      {
        lessonNumber: 2,
        title: 'Lesson 2: Inference Decision',
        objectives: ['Calculate and interpret a p-value for a one-proportion test.'],
      },
    ],
    deliverables: {
      assignments: project('assignment'),
      lessonPlans: project('plan'),
      slideDecks: project('deck'),
      studyGuides: project('guide'),
    },
  });

  expect(receipt).toMatchObject({
    demandedOperations: [{ lessonNumber: 2, operation: 'calculate-and-interpret-one-proportion-test' }],
    missingLessonNumbers: [2],
    summary: { demandedLessonCount: 1, completeLessonCount: 0, status: 'failed' },
  });
  expect(receipt.items[0]).toMatchObject({
    operation: 'calculate-and-interpret-confidence-interval',
    demandedOperation: 'calculate-and-interpret-one-proportion-test',
    complete: false,
  });
});

it('requires an exact verified v2 receipt at the final download boundary', () => {
  const verified = buildPackageReadinessReceipt({
    readiness: { status: 'ready', blockers: 0, warnings: 0 },
    quality: { status: 'graded', score: 89, grade: 'B', findingCounts: { p0: 0, p1: 1, p2: 0 } },
    exportVerification: { status: 'warnings', checked: 4, failed: 0, warningCount: 1 },
  });
  expect(hasVerifiedPackageDownloadReceipt(verified)).toBe(true);
  expect(
    hasVerifiedPackageDownloadReceipt({ ...verified, protocol: 'coursemapper-package-readiness-receipt-v1' }),
  ).toBe(false);
  expect(
    hasVerifiedPackageDownloadReceipt({
      ...verified,
      exportVerification: { ...verified.exportVerification, checked: 0, status: 'unverified' },
      downloadSafety: { ...verified.downloadSafety, status: 'unverified' },
    }),
  ).toBe(false);
  expect(
    hasVerifiedPackageDownloadReceipt({
      ...verified,
      downloadSafety: { ...verified.downloadSafety, status: 'blocked', blockerCount: 1 },
    }),
  ).toBe(false);
});

vi.mock('../quality/deepQualityGrader.js', async () => {
  const actual = await vi.importActual('../quality/deepQualityGrader.js');
  return {
    ...actual,
    grade: (...args) =>
      typeof qualityGraderOverride.grade === 'function' ? qualityGraderOverride.grade(...args) : actual.grade(...args),
  };
});

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => (id === 'custom_weeklyReflection' ? { name: 'Weekly Reflection' } : null)),
}));

vi.mock('../xlsxGenerator', () => ({
  buildXlsxBuffer: vi.fn(),
}));

vi.mock('../exporters/bulkDocxExporter', () => ({
  buildDeliverableDocxBlob: vi.fn(),
}));

vi.mock('../exporters/pptxExporter', () => ({
  buildSlideDeckPptxBlob: vi.fn(),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

function makeCourseMap(courseName = 'Export Smoke Course') {
  return {
    courseName,
    lessons: [
      { title: 'Lesson 1: Export Reliability', sections: [{ learningObjectives: 'Verify exports.' }] },
      { title: 'Lesson 2: Portable Course Materials', sections: [{ learningObjectives: 'Package files.' }] },
    ],
  };
}

async function makeOfficeXmlBlob(path, xml) {
  const zip = new JSZip();
  zip.file(path, xml);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([buffer]);
}

async function makeOfficeXmlBuffer(path, xml) {
  return await (await makeOfficeXmlBlob(path, xml)).arrayBuffer();
}

async function makeTimestampedOfficeBuffer(path, xml, timestamp) {
  const zip = new JSZip();
  const date = new Date(timestamp);
  zip.file(path, xml, { date });
  zip.file(
    'docProps/core.xml',
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`,
    { date },
  );
  return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

describe('packageZipExporter', () => {
  it('keeps one work in separate ledger rows when its construct bindings differ', () => {
    const merged = mergeSourceLedgerBundles({
      rows: [
        {
          id: 'openstax:statistics#7--sampling-distribution',
          provider: 'openstax',
          title: 'Introductory Statistics 2e',
          url: 'https://openstax.org/books/introductory-statistics-2e/pages/7-introduction',
          license: 'CC BY 4.0',
          sessionRefs: ['s5'],
          conceptLinks: [{ id: 'sampling-distribution', label: 'Sampling distributions' }],
        },
        {
          id: 'openstax:statistics#7--sampling-design-review',
          provider: 'openstax',
          title: 'Introductory Statistics 2e',
          url: 'https://openstax.org/books/introductory-statistics-2e/pages/7-introduction',
          license: 'CC BY 4.0',
          sessionRefs: ['s7'],
          conceptLinks: [{ id: 'sampling-design', label: 'Probability sampling design' }],
        },
      ],
    });

    expect(merged.rows).toHaveLength(2);
    expect(merged.rows[0].sessionRefs).toEqual(['s5']);
    expect(merged.rows[1].sessionRefs).toEqual(['s7']);
    expect(merged.rows[0].conceptLinks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sampling-design' })]),
    );
  });

  it('drops a fallback syllabus review row once trusted research covers the same concept', () => {
    const merged = mergeSourceLedgerBundles(
      {
        rows: [
          {
            id: 'kr1',
            provider: 'wikipedia',
            url: 'https://en.wikipedia.org/wiki/Contextual_inquiry',
            license: 'CC BY-SA 4.0',
            conceptLinks: [
              { id: 'c1', label: 'contextual inquiry and field notes' },
              { id: 'research/contextual-inquiry', label: 'Contextual inquiry' },
            ],
          },
        ],
      },
      {
        reviewRows: [
          {
            id: 'r1',
            origin: 'syllabus',
            provider: 'syllabus',
            title: 'UX example and design-journal prompt.',
            conceptLinks: [{ id: 'c1', label: 'contextual inquiry and field notes' }],
          },
        ],
      },
    );

    expect(merged.rows).toHaveLength(1);
    expect(merged.reviewRows).toBeUndefined();
    expect(merged.summary.reviewRequiredCount).toBeUndefined();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    qualityGraderOverride.grade = null;

    buildXlsxBuffer.mockResolvedValue(
      await makeOfficeXmlBuffer(
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row><c t="inlineStr"><is><t>Lesson 1 Verify exports.</t></is></c></row></sheetData></worksheet>',
      ),
    );
    buildDeliverableDocxBlob.mockResolvedValue(
      await makeOfficeXmlBlob(
        'word/document.xml',
        '<w:document><w:body><w:p><w:r><w:t>Lesson 1 Verify exports.</w:t></w:r></w:p></w:body></w:document>',
      ),
    );
    buildSlideDeckPptxBlob.mockResolvedValue(
      await makeOfficeXmlBlob(
        'ppt/slides/slide1.xml',
        '<p:sld><p:cSld><a:t>Lesson 1 Verify exports.</a:t></p:cSld></p:sld>',
      ),
    );
  });

  it('sanitizes unsafe filename characters', () => {
    expect(sanitizeFilePart('Course: A/B? <Draft>')).toBe('Course - A - B - Draft');
    expect(sanitizeFilePart('   ')).toBe('Course');
  });

  it('normalizes Office and package timestamps so identical inputs reproduce identical ZIP bytes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      buildXlsxBuffer.mockImplementation(async () =>
        makeTimestampedOfficeBuffer(
          'xl/worksheets/sheet1.xml',
          '<worksheet><sheetData><row><c t="inlineStr"><is><t>Stable package</t></is></c></row></sheetData></worksheet>',
          new Date().toISOString(),
        ),
      );

      vi.setSystemTime(new Date('2026-08-02T14:00:00.000Z'));
      const first = await buildCourseMaterialsZip({
        courseMap: makeCourseMap('Reproducible Package'),
        featureIds: ['courseMap'],
        quality: false,
        generatedAt: '2026-08-01T21:48:38.112Z',
      });
      vi.setSystemTime(new Date('2027-09-03T15:30:00.000Z'));
      const second = await buildCourseMaterialsZip({
        courseMap: makeCourseMap('Reproducible Package'),
        featureIds: ['courseMap'],
        quality: false,
        generatedAt: '2026-08-01T21:48:38.112Z',
      });

      const firstBytes = Buffer.from(await first.blob.arrayBuffer());
      const secondBytes = Buffer.from(await second.blob.arrayBuffer());
      expect(firstBytes.equals(secondBytes)).toBe(true);

      const outer = await JSZip.loadAsync(firstBytes);
      for (const entry of Object.values(outer.files)) {
        expect(entry.date.toISOString()).toBe('2000-01-01T00:00:00.000Z');
      }
      const workbookPath = Object.keys(outer.files).find((name) => name.endsWith('.xlsx'));
      const workbook = await JSZip.loadAsync(await outer.file(workbookPath).async('uint8array'));
      const core = await workbook.file('docProps/core.xml').async('string');
      expect(core).not.toContain('2026-08-02');
      expect(core).not.toContain('2027-09-03');
      expect(core.match(/2000-01-01T00:00:00Z/g)).toHaveLength(2);
      for (const entry of Object.values(workbook.files)) {
        expect(entry.date.toISOString()).toBe('2000-01-01T00:00:00.000Z');
      }

      const normalized = await normalizeOfficeArchiveForPackage(await makeOfficeXmlBuffer('word/document.xml', 'x'));
      expect(normalized).toBeInstanceOf(Uint8Array);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not invent a source-pipeline claim for an evidence-free deterministic compile', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Headless Compiler Proof'),
      featureIds: ['courseMap'],
      quality: false,
    });

    expect(result.manifest.pipeline).toBeUndefined();
    expect(JSON.stringify(result.manifest)).not.toContain('not evaluated (0 genome-linked lessons)');
    expect(result.manifest.lessons).toEqual([
      {
        lessonNumber: 1,
        title: 'Lesson 1: Export Reliability',
        objectives: ['Verify exports.'],
      },
      {
        lessonNumber: 2,
        title: 'Lesson 2: Portable Course Materials',
        objectives: ['Package files.'],
      },
    ]);
  });

  it('embeds truthful run, Scion base, and export-verification provenance in the manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Scion Provenance Course'),
      featureIds: ['courseMap'],
      quality: {
        expectedSessionMinutes: 50,
        digest: {
          appVersion: '0.16.7',
          runId: 'run-provenance',
          finishRunId: 'finish-provenance',
          run: { provider: 'public', models: ['scion-public'] },
          gates: {
            finalStatus: 'ready',
            trustState: 'review',
            warningDomains: { version: 1, total: 2, domains: { contentQuality: 2 } },
            blockerDomains: { version: 1, total: 0, domains: {} },
            exportStatus: 'passed',
            exportChecked: 38,
            exportFailed: 0,
            exportWarnings: 0,
          },
        },
      },
    });

    expect(result.manifest).toMatchObject({
      manifestVersion: 2,
      generator: {
        app: 'CourseMapper',
        appVersion: APP_VERSION,
        runId: 'run-provenance',
        finishRunId: 'finish-provenance',
        provider: 'public',
        models: ['scion-public'],
        scion: {
          product: `Scion V${APP_VERSION}`,
          localOnly: true,
          runtimeArtifact: {
            modelId: 'google/gemma-4-E2B-it-qat-q4_0-gguf',
            revision: '69536a21d70340464240401ba38223d805f6a709',
            sha256: '3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd',
          },
          adapter: { status: 'base-only', qualified: false },
        },
      },
      exportVerification: {
        status: 'passed',
        scope: 'aggregate-selected-feature-export-probes',
        checked: 38,
        failed: 0,
        warnings: 0,
        archivedOfficeMembersInspected: 0,
        claimBoundary: expect.stringMatching(/does not enumerate.*every archived Office member/i),
      },
      handoffTrust: {
        finishStatus: 'ready',
        trustState: 'review',
        warningDomains: { version: 1, total: 2, domains: { contentQuality: 2 } },
        blockerDomains: { version: 1, total: 0, domains: {} },
      },
      generationConstraints: { sessionMinutes: 50 },
    });
  });

  it('records the current exporter and the original generation version after resume', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Resumed Scion Course'),
      featureIds: ['courseMap'],
      quality: {
        digest: {
          appVersion: '0.16.73',
          runId: 'run-resumed',
          run: { provider: 'public', models: ['scion-public'] },
          gates: { exportStatus: 'passed', exportChecked: 38, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest.generator).toMatchObject({
      appVersion: APP_VERSION,
      generationAppVersion: '0.16.73',
      scion: { product: `Scion V${APP_VERSION}` },
    });
  });

  it('records the adaptive Scion evidence lane without claiming model inference or downloaded weights', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Adaptive Scion Course'),
      featureIds: ['courseMap'],
      pipelineState: {
        scionExecution: 'private evidence compiler · zero model download · zero model inference',
        knowledgeBackbone: 'Private mode · shipped teaching genome only',
      },
      quality: {
        digest: {
          appVersion: APP_VERSION,
          runId: 'run-adaptive-scion',
          run: { provider: 'public', models: ['scion-public'], providerCalls: 0 },
          gates: { exportStatus: 'passed', exportChecked: 1, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest.generator.scion).toMatchObject({
      product: `Scion V${APP_VERSION}`,
      execution: {
        lane: 'evidence-compiler',
        modelInference: false,
        modelWeightsDownloaded: false,
        sourceResearch: false,
      },
      adapter: { status: 'not-used', qualified: false },
    });
    expect(result.manifest.generator.scion.trainingBase).toBeUndefined();
    expect(result.manifest.generator.scion.runtimeArtifact).toBeUndefined();
    expect(result.manifest.generator.scion.runtime).toBeUndefined();
  });

  it('records Algi as a no-inference compiler instead of mislabeling it as Scion', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Algi Manifest Course'),
      featureIds: ['courseMap'],
      pipelineState: {
        knowledgeBackbone: '2/2 lessons source-researched · 4 cited open resources (algi-research: 4)',
      },
      quality: {
        digest: {
          appVersion: APP_VERSION,
          runId: 'run-algi',
          run: { provider: 'public', models: ['algi-v0'], providerCalls: 0 },
          gates: { exportStatus: 'passed', exportChecked: 1, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest.generator).toMatchObject({
      provider: 'public',
      models: ['algi-v0'],
      algi: {
        product: 'Algi V0',
        architecture: 'deterministic source-and-genome course compiler',
        modelInference: false,
        modelWeights: false,
        localCompiler: true,
        sourceResearch: true,
      },
    });
    expect(result.manifest.generator.scion).toBeUndefined();
  });

  it('keeps Algi research lesson references in the exported source receipt', async () => {
    const courseMap = makeCourseMap('Algi Source Receipt Course');
    const courseGraph = {
      version: 1,
      course: { name: 'Algi Source Receipt Course' },
      concepts: [{ id: 'c1', term: 'Quantum gate' }],
      outcomes: [],
      assessments: [],
      sessions: [
        {
          id: 's1',
          number: 1,
          title: 'Quantum gates',
          sections: [{ id: 'sec1', topic: 'Quantum gates', conceptRefs: ['c1'], resourceRefs: ['kr1'] }],
        },
      ],
      resources: [
        {
          id: 'kr1',
          citation: 'Quantum logic gate (open encyclopedia)',
          origin: 'algi-research',
          provider: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Quantum_logic_gate',
          license: 'CC BY-SA 4.0',
          attribution: 'Wikipedia contributors',
          revisionId: '202',
          sessionRefs: ['s1'],
        },
      ],
      readings: [],
      edges: {
        teaches: [{ from: 's1', to: 'c1' }],
        assesses: [],
        requires: [],
        practicedIn: [],
        instanceOf: [],
        genomeLink: [],
      },
    };
    const result = await buildCourseMaterialsZip({
      courseMap,
      courseGraph,
      featureIds: ['courseMap'],
      pipelineState: {
        knowledgeBackbone: '1/1 lessons source-researched · 1 cited open resource (algi-research: 1)',
      },
      quality: {
        digest: {
          appVersion: APP_VERSION,
          runId: 'run-algi-source-receipt',
          run: { provider: 'public', models: ['algi-v0'], providerCalls: 0 },
          gates: { exportStatus: 'passed', exportChecked: 1, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest.sourceLedger).toEqual([
      expect.objectContaining({
        id: 'kr1',
        origin: 'algi-research',
        provider: 'wikipedia',
        revisionId: '202',
        sessionRefs: ['s1'],
      }),
    ]);
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file('SOURCE_REPORT.md').async('string')).toContain('sessions=s1');
  });

  it('presents the private research layer as Scion in Scion package receipts', async () => {
    const courseGraph = {
      version: 1,
      course: { name: 'Scion Research Receipt Course' },
      concepts: [{ id: 'c1', term: 'Accessible forms' }],
      outcomes: [],
      assessments: [],
      sessions: [
        {
          id: 's1',
          number: 1,
          title: 'Accessible forms',
          sections: [{ id: 'sec1', topic: 'Accessible forms', conceptRefs: ['c1'], resourceRefs: ['kr1'] }],
        },
      ],
      resources: [
        {
          id: 'kr1',
          title: 'Accessible forms',
          citation: 'Accessible forms (official accessibility tutorial)',
          origin: 'algi-research',
          provider: 'w3c-wai',
          url: 'https://www.w3.org/WAI/tutorials/forms/',
          license: 'W3C permissive license',
          attribution: 'W3C Web Accessibility Initiative',
          sessionRefs: ['s1'],
        },
      ],
      readings: [],
      edges: {
        teaches: [{ from: 's1', to: 'c1' }],
        assesses: [],
        requires: [],
        practicedIn: [],
        instanceOf: [],
        genomeLink: [],
      },
    };
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'Scion Research Receipt Course',
        lessons: [{ title: 'Lesson 1: Accessible forms', sections: [{ topicSection: 'Accessible forms' }] }],
      },
      courseGraph,
      featureIds: ['courseMap'],
      pipelineState: {
        scionExecution: 'private evidence compiler · zero model download · zero model inference',
        knowledgeBackbone: '1/1 lessons source-researched · 1 cited open resource (algi-research: 1)',
      },
      quality: {
        digest: {
          appVersion: APP_VERSION,
          runId: 'run-scion-research-receipt',
          run: { provider: 'public', models: ['scion-public'], providerCalls: 0 },
          gates: { exportStatus: 'passed', exportChecked: 1, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest.sourceLedger[0]).toMatchObject({
      origin: 'scion-research',
      provider: 'w3c-wai',
    });
    expect(JSON.stringify(result.manifest)).not.toMatch(/\bAlgi\b|algi-research/i);
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file('SOURCE_REPORT.md').async('string')).not.toMatch(/\bAlgi\b|algi-research/i);
  });

  it('builds a ZIP with selected files and a package manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Export/Smoke: Course'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Export Reliability', objectives: ['Verify exports.'] },
              { lessonTitle: 'Lesson 2: Portable Course Materials', objectives: ['Package files.'] },
            ],
          },
        },
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              { lessonTitle: 'Lesson 1: Export Reliability', slides: [{ title: 'Export', bullets: ['Verify'] }] },
              {
                lessonTitle: 'Lesson 2: Portable Course Materials',
                slides: [{ title: 'Package', bullets: ['Download'] }],
              },
            ],
          },
        },
      },
      selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
      featureIds: ['courseMap', 'lessonPlans', 'slideDecks'],
    });

    expect(result.fileName).toBe('Export - Smoke - Course - Course Materials.zip');
    expect(result.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        'Course Map/Export - Smoke - Course - Course Map.xlsx',
        'Lesson Plans/Lesson 01 - Export Reliability - Lesson Plans.docx',
        'Lesson Plans/Lesson 02 - Portable Course Materials - Lesson Plans.docx',
        'Slide Decks/Lesson 01 - Export Reliability - Slide Decks.pptx',
        'Slide Decks/Lesson 02 - Portable Course Materials - Slide Decks.pptx',
        'PACKAGE_MANIFEST.json',
      ]),
    );

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.courseName).toBe('Export - Smoke - Course');
    expect(manifest.requestedFeatures).toEqual([
      { featureId: 'courseMap', label: 'Course Map' },
      { featureId: 'lessonPlans', label: 'Lesson Plans' },
      { featureId: 'slideDecks', label: 'Slide Decks' },
    ]);
    expect(manifest.lessons[0].objectives).toEqual(['Verify exports.']);
    expect(buildXlsxBuffer).toHaveBeenCalledOnce();
    expect(buildDeliverableDocxBlob).toHaveBeenCalledTimes(2);
    expect(buildSlideDeckPptxBlob).toHaveBeenCalledTimes(2);
  });

  it('publishes the compiled assignment objective on its manifest assessment declaration', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'Objective Contract Course',
        lessons: [
          {
            title: 'Lesson 1: Conditional Branching',
            sections: [{ learningObjectives: 'Summarize an older course-map objective.' }],
          },
        ],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                assessmentId: 'A1.1',
                lessonNumber: 1,
                title: 'Conditional Branching application check',
                objectives: ['Trace a conditional branch and justify one boundary decision.'],
              },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'assignments'],
      courseGraph: {
        sessions: [{ id: 's1', number: 1, title: 'Lesson 1: Conditional Branching' }],
        resources: [],
        readings: [],
        assessments: [
          {
            id: 'A1.1',
            title: 'Conditional Branching application check',
            kind: 'graded-artifact',
            dueSession: 1,
          },
        ],
      },
      quality: false,
    });

    expect(result.manifest.lessons[0].objectives).toEqual(['Summarize an older course-map objective.']);
    expect(result.manifest.assessments[0].objectives).toEqual([
      'Trace a conditional branch and justify one boundary decision.',
    ]);
  });

  it('carries the canonical activity packet into the Assignment Briefs ZIP export', async () => {
    const activityPacket = {
      protocol: 'scion-experiential-activity-v1',
      activityType: 'Checkout flow studio critique',
      scenario:
        'A checkout prototype loses users after an address-validation error and needs one evidence-backed revision.',
      roles: [
        {
          name: 'Presenting design team',
          goal: 'Choose one feasible checkout revision.',
          constraint: 'Use only visible prototype or usability evidence.',
          privateInformation: '',
        },
        {
          name: 'Critique evidence team',
          goal: 'Test whether each critique claim is observed.',
          constraint: 'Separate user observation from design preference.',
          privateInformation: '',
        },
      ],
      evidence: ['Three participants abandon checkout after the address-validation error.'],
      phases: [
        {
          title: 'Engineering constraint',
          information: 'Validation copy can change but the address service cannot.',
          requiredDecision: 'Prioritize one revision and record its evidence.',
        },
      ],
      artifact: {
        title: 'Checkout critique revision board',
        requirements: ['Pair each claim with evidence.', 'Show the revision.', 'Name the next test question.'],
      },
      timing: [
        { phase: 'Evidence walk', minutes: 15 },
        { phase: 'Critique', minutes: 25 },
        { phase: 'Update', minutes: 15 },
        { phase: 'Revision and debrief', minutes: 20 },
      ],
      totalMinutes: 75,
      activityLogFields: ['Evidence inspected', 'Revision decision'],
      debriefPrompts: ['Which observation most changed the revision?'],
      safetyBoundary: 'Critique the checkout work rather than its designers and protect participant privacy.',
    };
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('UX Studio'),
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                title: 'Checkout critique revision board — activity packet',
                lessonNumber: 1,
                relatedLessons: ['Lesson 1: Checkout Flow Studio Critique'],
                activityPacket,
              },
            ],
          },
        },
      },
      selectedFeatures: ['assignments'],
      featureIds: ['assignments'],
    });

    const assignmentCall = buildDeliverableDocxBlob.mock.calls.find(([featureId]) => featureId === 'assignments');
    expect(assignmentCall?.[1]?.assignments?.[0]?.activityPacket).toEqual(activityPacket);
    expect(result.files.some((file) => /^Assignment Briefs\/.*\.docx$/.test(file.path))).toBe(true);
  });

  it('exports one course-level handoff for a compiler-routed empty material', async () => {
    const courseMap = makeCourseMap('Exam Only Course');
    const data = {
      deliverableDisposition: buildNotApplicableDisposition('assignments', {
        reasonCode: 'no-standalone-assessment',
        summary: 'No separate assignment brief is needed for this course.',
        routeFeatureId: 'quizBank',
        routeLabel: 'Quiz & Exam Bank',
      }),
      assignments: [],
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: { assignments: { status: 'done', data } },
      featureIds: ['courseMap', 'assignments'],
      quality: false,
    });

    const assignmentFiles = result.files.filter((file) => file.featureId === 'assignments');
    expect(assignmentFiles).toHaveLength(1);
    expect(assignmentFiles[0].path).toBe('Assignment Briefs/Exam Only Course - Assignment Briefs.docx');
    const assignmentCalls = buildDeliverableDocxBlob.mock.calls.filter(([featureId]) => featureId === 'assignments');
    expect(assignmentCalls).toHaveLength(1);
    expect(assignmentCalls[0][1]).toMatchObject({
      deliverableDisposition: expect.objectContaining({ status: 'not-applicable' }),
      assignments: [],
    });
  });

  it('preserves the source lesson number in focused-workspace paths and manifest scope', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'Focused Marketing Course',
        lessons: [
          {
            title: 'Lesson 5: Marketing Concept',
            sourceLessonNumber: 5,
            sections: [{ learningObjectives: 'Apply the marketing concept.' }],
          },
        ],
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lessonTitle: 'Lesson 5: Marketing Concept', objectives: ['Apply it.'] }] },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      quality: false,
    });

    expect(result.files.map((file) => file.path)).toContain(
      'Lesson Plans/Lesson 05 - Marketing Concept - Lesson Plans.docx',
    );
    expect(result.manifest.lessonScope).toEqual([5]);
  });

  it('keeps a labeled Lesson 5 rubric out of the Lesson 3 package file', async () => {
    const courseMap = {
      courseName: 'Introductory Physics II - Electricity and Magnetism',
      lessons: Array.from({ length: 5 }, (_, index) => ({
        title: `Lesson ${index + 1}: ${['Charge', 'Gauss Law', 'Electric Potential', 'Capacitance', 'Current and Resistance'][index]}`,
        sections: [{ learningObjectives: `Apply lesson ${index + 1}.` }],
      })),
    };
    await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              { lessonNumber: 2, lessonTitle: 'Lesson 2: Gauss Law', title: 'Gauss Law Rubric' },
              { lessonNumber: 4, lessonTitle: 'Lesson 4: Capacitance', title: 'Capacitance Rubric' },
              { lessonTitle: 'Lesson 5: Current and Resistance', title: 'Current and Resistance Rubric' },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'rubrics'],
      quality: false,
    });

    const rubricCalls = buildDeliverableDocxBlob.mock.calls.filter(([featureId]) => featureId === 'rubrics');
    expect(rubricCalls).toHaveLength(3);
    expect(rubricCalls.some(([, data]) => data.rubrics.length === 0)).toBe(false);
    expect(rubricCalls[2][1].rubrics).toEqual([
      expect.objectContaining({ lessonTitle: 'Lesson 5: Current and Resistance' }),
    ]);
  });

  it('rejects a legacy precomputed score without a replayable ledger and regrades the ZIP', async () => {
    const courseMap = makeCourseMap('Browser Export Course');
    const binding = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: false,
      assembleOnly: true,
    });
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: {
        precomputed: {
          status: 'graded',
          score: 89,
          grade: 'B',
          graderVersion: GRADER_VERSION,
          scopeBinding: binding.qualityScopeBinding,
          findingCounts: { p0: 0, p1: 1, p2: 0 },
          readiness: {
            protocol: 'coursemapper-automated-readiness-v1',
            score: 54,
            maxScore: 100,
            rawScore: 74,
            evidenceCeiling: 69,
            band: 'bounded-review',
            claimBoundary:
              'Automated signals cannot prove factual accuracy, teachability, accessibility, or instructor validation.',
            components: {
              evidenceGrounding: { weight: 25, score: 28 },
            },
          },
          dimensions: {
            identity: 100,
            substance: 100,
            citations: 100,
            honesty: 100,
            discipline: 100,
            consistency: 100,
            structure: 100,
            format: 100,
            texture: 95,
          },
          grades: {
            identity: 'A',
            substance: 'A',
            citations: 'A',
            honesty: 'A',
            discipline: 'A',
            consistency: 'A',
            structure: 'A',
            format: 'A',
            texture: 'A',
          },
          texture: { score: 95, version: TEXTURE_VERSION },
          findings: [
            {
              severity: 'P1',
              dimension: 'substance',
              file: 'quizBank',
              detail: 'lesson knowledge did not clear admission',
            },
          ],
          fileCount: 2,
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const report = await zip.file('QUALITY_REPORT.md').async('string');
    expect(manifest.quality).toEqual(
      expect.objectContaining({
        status: 'graded',
        score: 89,
        grade: 'B',
        graderVersion: GRADER_VERSION,
        readiness: expect.objectContaining({ score: 35, maxScore: 100 }),
        texture: expect.objectContaining({ score: 100 }),
        scoreLedger: expect.objectContaining({ path: 'SCORE_LEDGER.json' }),
      }),
    );
    expect(await zip.file('SCORE_LEDGER.json').async('string')).toContain('coursemapper-score-ledger-v1');
    const scoreLedger = JSON.parse(await zip.file('SCORE_LEDGER.json').async('string'));
    const qualityFindings = JSON.parse(await zip.file('QUALITY_FINDINGS.json').async('string'));
    const packageReadiness = JSON.parse(await zip.file('PACKAGE_READINESS.json').async('string'));
    expect(qualityFindings).toMatchObject({
      protocol: 'coursemapper-quality-findings-v1',
      graderVersion: GRADER_VERSION,
      findingCount:
        manifest.quality.findingCounts.p0 + manifest.quality.findingCounts.p1 + manifest.quality.findingCounts.p2,
    });
    expect(scoreLedger.bindings.qualityFindings).toMatchObject({
      algorithm: 'sha256',
      path: 'QUALITY_FINDINGS.json',
      count: qualityFindings.findingCount,
    });
    expect(packageReadiness).toMatchObject({
      protocol: 'coursemapper-package-readiness-receipt-v2',
      purpose: 'post-grade-package-handoff',
      claimBoundary: expect.stringMatching(/does not claim.*classroom readiness/i),
      readiness: scoreLedger.bindings.packageReadiness,
      contentReadiness: expect.objectContaining({ status: 'review', score: 89, grade: 'B', blockerCount: 0 }),
      exportVerification: expect.objectContaining({ status: 'unverified', checked: 0, failed: 0 }),
      downloadSafety: expect.objectContaining({ status: 'unverified', blockerCount: 0 }),
    });
    expect(scoreLedger.bindings.packageReadinessReceipt).toMatchObject({
      algorithm: 'sha256',
      path: 'PACKAGE_READINESS.json',
    });
    const replay = await verifyScoreLedger({
      ledger: scoreLedger,
      quality: manifest.quality,
      findings: qualityFindings.findings,
      packageReadinessReceipt: packageReadiness,
      currentGraderVersion: GRADER_VERSION,
      evidenceArtifacts: scoreLedger.bindings.evidenceArtifacts,
    });
    expect(replay.status, replay.reason).toBe('verified');
    const forgedReadiness = structuredClone(packageReadiness);
    forgedReadiness.readiness.status = 'ready';
    expect(
      (
        await verifyScoreLedger({
          ledger: scoreLedger,
          quality: manifest.quality,
          findings: qualityFindings.findings,
          packageReadinessReceipt: forgedReadiness,
          currentGraderVersion: GRADER_VERSION,
        })
      ).status,
    ).toBe('invalid');
    const extractedFileMap = {};
    for (const entry of Object.values(zip.files)) {
      if (!entry.dir) extractedFileMap[entry.name] = await entry.async('uint8array');
    }
    const directBinding = await buildEvidenceArtifactBinding(extractedFileMap);
    expect(directBinding).toMatchObject({
      algorithm: 'sha256-sorted-teaching-artifact-bytes-inventory-v2',
      rootSha256: scoreLedger.bindings.evidenceArtifacts.rootSha256,
      excludedPaths: expect.arrayContaining([
        'PACKAGE_MANIFEST.json',
        'SCORE_LEDGER.json',
        'QUALITY_FINDINGS.json',
        'PACKAGE_READINESS.json',
        'QUALITY_REPORT.md',
      ]),
    });
    expect(directBinding.entries.map((entry) => entry.path)).not.toEqual(
      expect.arrayContaining([
        'PACKAGE_MANIFEST.json',
        'SCORE_LEDGER.json',
        'QUALITY_FINDINGS.json',
        'PACKAGE_READINESS.json',
        'QUALITY_REPORT.md',
      ]),
    );
    expect(report).toContain('Deterministic package evidence: 35/100 earned');
    expect(report).toContain('Package conformance: 89/100 (B)');
    expect(report).not.toContain('verified finish-pass quality result');
    expect(report).not.toContain('lesson knowledge did not clear admission');
    expect(report).toContain('| texture | 25 | 100 | A |');
    expect(report).toContain('| **overall** | 135 |');
  });

  it('exports the ordered lesson constraint needed to reproduce curriculum scoring offline', async () => {
    const lessonTitles = [
      'Python and pandas for public datasets',
      'Data cleaning, missing values, and reproducible notebooks',
      'Data visualization with matplotlib for policy audiences',
      'Correlation versus causation in policy analysis',
      'Evidence-based policy memo with limitations and recommendations',
    ];
    const courseMap = {
      courseName: 'Python for Public Policy',
      lessons: lessonTitles.map((title, index) => ({
        title: `Lesson ${index + 1}: ${title}`,
        sections: [{ learningObjectives: `Apply ${title}.` }],
      })),
    };
    const coursePrompt =
      `Beginner undergraduate course: Python for Public Policy. Use this exact five-lesson sequence: ` +
      lessonTitles.map((title, index) => `${index + 1}) ${title}`).join('; ') +
      '. Include a CSV public-policy dataset, data dictionary, runnable Jupyter notebook, and Python script.';

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000, coursePrompt },
      assembleOnly: true,
    });

    expect(result.manifest.generationConstraints).toMatchObject({
      explicitLessonSequence: lessonTitles,
      orderedLessonContract: {
        mode: 'explicit-lesson-sequence',
        declaredCount: 5,
        topics: lessonTitles,
      },
    });
    expect(result.quality.readiness.components.curriculumFidelity).toMatchObject({
      status: 'evaluated',
      points: { max: 25, earned: 25, lost: 0, unobserved: 0 },
    });
  });

  it('exports a source-verified ordered lesson contract retained by the course graph', async () => {
    const topics = ['Picturing Distributions', 'Describing Distributions'];
    const courseMap = {
      courseName: 'Introduction to Statistics',
      lessons: topics.map((title, index) => ({
        title: `Lesson ${index + 1}: ${title}`,
        sections: [{ learningObjectives: `Apply ${title}.` }],
      })),
    };
    const orderedLessonContract = {
      protocol: 'coursemapper-governing-source-course-contract-v1',
      mode: 'governing-source-ordered-subset',
      topics,
      matches: topics.map((topic, index) => ({ lessonNumber: index + 1, topic, coverage: 1 })),
      sourceTokenCount: 12,
      claimBoundary: 'Curriculum identity only.',
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      courseGraph: {
        course: { name: courseMap.courseName, meta: { orderedLessonContract } },
        sessions: [],
        resources: [],
        readings: [],
      },
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000, coursePrompt: 'Create a two-lesson statistics course.' },
      assembleOnly: true,
    });

    expect(result.manifest.generationConstraints.orderedLessonContract).toEqual(orderedLessonContract);
    expect(result.quality.readiness.components.curriculumFidelity).toMatchObject({
      status: 'evaluated',
      points: { max: 25, earned: 25, lost: 0, unobserved: 0 },
    });
  });

  it('exports the explicit all-lessons functional-visual contract with a byte-bound source brief', async () => {
    const courseMap = {
      courseName: 'Visual Evidence Studio',
      lessons: Array.from({ length: 3 }, (_, index) => ({
        title: `Lesson ${index + 1}: Visual evidence ${index + 1}`,
        sections: [{ learningObjectives: `Analyze visual evidence ${index + 1}.` }],
      })),
    };
    const coursePrompt =
      'Create a three-lesson studio. Every lesson must require students to analyze a concrete visual and produce an evidence-based annotation or comparison. Use only open-licensed or public-domain visuals and preserve attribution and license boundaries.';

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000, coursePrompt },
      assembleOnly: true,
    });

    expect(result.manifest.generationConstraints.briefQualityContract).toMatchObject({
      protocol: 'coursemapper-brief-quality-contract-v1',
      scope: 'all-lessons',
      requiredLessonNumbers: [1, 2, 3],
      functionalVisual: {
        required: true,
        processAction: 'analyze',
        productActions: ['annotate', 'compare'],
      },
      rightsBoundary: {
        mode: 'open-or-public-domain',
        externalAssetAllowedOnlyWithInspectableRights: true,
        originalNativeAllowed: false,
      },
    });
    expect(result.manifest.generationConstraints.sourceBriefBinding).toMatchObject({
      protocol: 'coursemapper-source-brief-binding-v1',
      text: coursePrompt,
      utf8Bytes: new TextEncoder().encode(coursePrompt).byteLength,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('regrades when a full-course finish receipt is reused for a lesson subset', async () => {
    const courseMap = makeCourseMap('Scope Bound Export Course');
    const full = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000 },
      assembleOnly: true,
    });

    const subset = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      lessonFilter: [0],
      quality: {
        timeoutMs: 5000,
        precomputed: { ...full.quality, gradedAt: '2000-01-01T00:00:00.000Z' },
      },
      assembleOnly: true,
    });

    expect(subset.quality.scopeBinding.sha256).not.toBe(full.quality.scopeBinding.sha256);
    expect(subset.quality.gradedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(subset.manifest.lessonScope).toEqual([1]);
  });

  it('regrades when a precomputed receipt carries an older texture policy', async () => {
    const courseMap = makeCourseMap('Texture Bound Export Course');
    const current = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000 },
      assembleOnly: true,
    });
    const stale = {
      ...current.quality,
      gradedAt: '2000-01-01T00:00:00.000Z',
      texture: { ...current.quality.texture, version: '1.3.0' },
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000, precomputed: stale },
      assembleOnly: true,
    });

    expect(result.quality.texture.version).toBe(TEXTURE_VERSION);
    expect(result.quality.gradedAt).not.toBe(stale.gradedAt);
  });

  it('regrades a persisted finish result produced by an older grader version', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Persisted Browser Export Course'),
      deliverables: {},
      featureIds: ['courseMap'],
      quality: {
        timeoutMs: 5000,
        precomputed: {
          status: 'graded',
          score: 99,
          grade: 'A',
          graderVersion: '1.11.0',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
          dimensions: {
            identity: 100,
            substance: 100,
            citations: 100,
            honesty: 100,
            discipline: 100,
            consistency: 100,
            structure: 100,
            format: 100,
            texture: 96,
          },
          findings: [],
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const report = await zip.file('QUALITY_REPORT.md').async('string');

    expect(manifest.quality.graderVersion).toBe(GRADER_VERSION);
    expect(manifest.quality.graderVersion).not.toBe('1.11.0');
    expect(report).not.toContain('verified finish-pass quality result');
  });

  it('records unresolved lesson evidence dependencies in the package manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'Oral History Methods',
        lessons: [
          {
            title: 'Lesson 1: Interview Evidence',
            sections: [{ learningObjectives: 'Evaluate interview evidence.' }],
          },
        ],
      },
      courseGraph: {
        sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Interview evidence', resourceRefs: [] }] }],
        resources: [],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                lessonNumber: 1,
                title: 'Interview Evidence Brief',
                instructions: [
                  'Analyze the supplied recording/transcript and cite the narrator-context note before making a claim.',
                ],
              },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'assignments'],
      quality: false,
    });

    expect(result.manifest.evidenceDependencies).toMatchObject({
      status: 'unresolved',
      lessonCount: 1,
      unresolvedCount: 1,
    });
    expect(result.manifest.evidenceDependencies.lessons[0].requirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'recording-or-transcript', status: 'unresolved' })]),
    );
  });

  it('falls back to final ZIP grading when precomputed findings reference repaired-away files', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Browser Export Course'),
      deliverables: {},
      featureIds: ['courseMap'],
      quality: {
        timeoutMs: 5000,
        precomputed: {
          status: 'graded',
          score: 97,
          grade: 'A',
          graderVersion: 'stale-precomputed',
          findingCounts: { p0: 0, p1: 1, p2: 0 },
          dimensions: {
            identity: 97,
            substance: 92,
            citations: 92,
            honesty: 100,
            discipline: 100,
            consistency: 100,
            structure: 100,
            format: 100,
            texture: 93,
          },
          grades: {
            identity: 'A',
            substance: 'A',
            citations: 'A',
            honesty: 'A',
            discipline: 'A',
            consistency: 'A',
            structure: 'A',
            format: 'A',
            texture: 'A',
          },
          texture: { score: 93, version: 'stale-texture' },
          findings: [
            {
              severity: 'P1',
              dimension: 'citations',
              file: 'Lesson Plans/Lesson 08 - Quiz,Assignment - Lesson Plans.docx',
              detail: 'stale pre-repair finding',
            },
          ],
          fileCount: 99,
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const report = await zip.file('QUALITY_REPORT.md').async('string');

    expect(manifest.quality.graderVersion).not.toBe('stale-precomputed');
    expect(report).not.toContain('Lesson 08 - Quiz,Assignment');
    expect(report).not.toContain('stale pre-repair finding');
  });

  it('regrades a blocked export when the precomputed finish report omits its readiness blocker', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Blocked Readiness Export'),
      deliverables: {},
      featureIds: ['courseMap'],
      readiness: {
        status: 'blocked',
        blockers: [{ message: 'One generated assessment needs correction before sharing.' }],
        warnings: [],
        issues: [],
      },
      quality: {
        timeoutMs: 5000,
        precomputed: {
          status: 'graded',
          score: 99,
          grade: 'A',
          graderVersion: 'stale-readiness-precomputed',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
          dimensions: {
            identity: 100,
            substance: 100,
            citations: 100,
            honesty: 100,
            discipline: 100,
            consistency: 100,
            structure: 100,
            format: 100,
            texture: 100,
          },
          findings: [],
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const report = await zip.file('QUALITY_REPORT.md').async('string');

    expect(manifest.quality.graderVersion).not.toBe('stale-readiness-precomputed');
    expect(manifest.readiness).toMatchObject({ status: 'blocked', blockers: 1 });
    expect(report).toContain('package readiness reports 1 blocker');
  });

  it('does not let blocker-shaped finding prose substitute for the structured readiness binding', async () => {
    const courseMap = makeCourseMap('Structured Readiness Binding');
    const initial = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      quality: { timeoutMs: 5000 },
      assembleOnly: true,
    });
    const forgedTimestamp = '2000-01-01T00:00:00.000Z';
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      readiness: {
        status: 'blocked',
        blockers: [{ severity: 'blocker', source: 'readiness', message: 'Current blocker identity' }],
        warnings: [],
        issues: [],
      },
      quality: {
        timeoutMs: 5000,
        precomputed: {
          ...initial.quality,
          gradedAt: forgedTimestamp,
          grades: initial.qualityResult.grades,
          findings: [
            {
              severity: 'P1',
              dimension: 'substance',
              detail: 'package readiness reports 1 blocker',
            },
          ],
          scoreLedger: initial.qualityResult.scoreLedger,
          packageReadinessBinding: buildPackageReadinessBinding({
            status: 'blocked',
            blockers: [{ severity: 'blocker', source: 'readiness', message: 'Forged blocker identity' }],
            warnings: [],
            issues: [],
          }),
        },
      },
      assembleOnly: true,
    });

    expect(result.quality.gradedAt).not.toBe(forgedTimestamp);
    expect(result.manifest.readiness).toMatchObject({ status: 'blocked', blockers: 1 });
    expect(JSON.parse(result.fileContents['SCORE_LEDGER.json']).bindings.packageReadiness).toEqual(
      buildPackageReadinessBinding({
        status: 'blocked',
        blockers: [{ severity: 'blocker', source: 'readiness', message: 'Current blocker identity' }],
        warnings: [],
        issues: [],
      }),
    );
  });

  it('keeps partial enrichment blockers in the exported manifest and readiness report', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Partial Enrichment Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Export Reliability', objectives: ['Verify exports.'] },
              { lessonTitle: 'Lesson 2: Portable Course Materials', objectives: ['Package files.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      readiness: {
        status: 'ready',
        blockers: [],
        warnings: [],
        issues: [],
        featureCount: 2,
        doneFeatureCount: 2,
      },
      pipelineState: {
        enrichment: 'ran (11/12 — lesson 3 fell back to template)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const readinessReport = await zip.file('READINESS_REPORT.txt').async('string');

    expect(manifest.readiness).toEqual({
      status: 'blocked',
      blockers: 1,
      warnings: 0,
      checkedSections: '2/2',
    });
    expect(readinessReport).toContain(
      'Enrichment covered 11/12 lessons; lesson 3 fell back to template. Retry or repair enrichment before exporting a clean package.',
    );
  });

  it('keeps partial enrichment blockers after package quality warnings are merged into the manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Graded Partial Enrichment Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Export Reliability', objectives: ['Verify exports.'] },
              { lessonTitle: 'Lesson 2: Portable Course Materials', objectives: ['Package files.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      readiness: {
        status: 'ready',
        blockers: [],
        warnings: [],
        issues: [],
        featureCount: 2,
        doneFeatureCount: 2,
      },
      pipelineState: {
        enrichment: 'ran (11/12 — lesson 3 fell back to template)',
      },
      quality: { timeoutMs: 5000 },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const readinessReport = await zip.file('READINESS_REPORT.txt').async('string');

    expect(manifest.quality.status).toBe('graded');
    expect(
      Number(manifest.quality.findingCounts?.p0 || 0) +
        Number(manifest.quality.findingCounts?.p1 || 0) +
        Number(manifest.quality.findingCounts?.p2 || 0),
    ).toBeGreaterThan(0);
    expect(manifest.readiness).toMatchObject({
      status: 'blocked',
      blockers: 1,
      warnings: 1,
      checkedSections: '2/2',
      isBlocked: true,
    });
    expect(readinessReport).toContain(
      'Enrichment covered 11/12 lessons; lesson 3 fell back to template. Retry or repair enrichment before exporting a clean package.',
    );
  });

  it('includes slim CourseIR and native-repair proof in the package manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('CourseIR Export Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Export Reliability', objectives: ['Verify exports.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2'],
          conceptIds: ['C1', 'C2', 'C3'],
          assessmentIds: ['A1', 'A2'],
          nativeAssembly: {
            source: 'native-wire-map',
            projectedThrough: 'curriculumv1',
          },
        },
        nativeRepair: {
          code: 'degenerate-skeleton-repaired',
          source: 'curriculumv1',
          courseIRVersion: 'courseir.v1',
          stats: { lessons: 2, concepts: 3, assessments: 2, constraints: 3 },
          readinessRepairedFieldCount: 4,
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));

    expect(manifest.courseIR).toEqual({
      version: 'courseir.v1',
      lessonCount: 2,
      conceptCount: 3,
      assessmentCount: 2,
      nativeAssembly: {
        source: 'native-wire-map',
        projectedThrough: 'curriculumv1',
        editedAfterProjection: false,
      },
      nativeRepair: {
        code: 'degenerate-skeleton-repaired',
        source: 'curriculumv1',
        courseIRVersion: 'courseir.v1',
        stats: { lessons: 2, concepts: 3, assessments: 2, constraints: 3 },
        readinessRepairedFieldCount: 4,
      },
    });
  });

  it('includes direct CourseIR authoring proof in the package manifest', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Direct CourseIR Export Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Source Truth', objectives: ['Compile from CourseIR.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1', 'C2'],
          assessmentIds: ['A1'],
          directAuthoring: {
            source: 'provider-courseir',
            projectedThrough: 'curriculumv1',
            accepted: true,
          },
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));

    expect(manifest.courseIR).toEqual({
      version: 'courseir.v1',
      lessonCount: 1,
      conceptCount: 2,
      assessmentCount: 1,
      directAuthoring: {
        source: 'provider-courseir',
        projectedThrough: 'curriculumv1',
        accepted: true,
      },
    });
  });

  it('exports a normalized source ledger and source report when CourseIR sourceRefs are present', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Source Ledger Export Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Source Truth', objectives: ['Trace sources.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        concepts: [{ id: 'c1', term: 'Limits' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Limits', conceptRefs: ['c1'], resourceRefs: ['kr1'] }],
          },
        ],
        resources: [
          {
            id: 'kr1',
            citation: 'OpenStax Calculus Volume 1 §2.2',
            origin: 'genome',
            kind: 'textbook section',
            url: 'https://openstax.org/books/calculus-volume-1/pages/2-2-the-limit-of-a-function',
            license: 'CC BY-NC-SA 4.0',
            attribution: 'OpenStax, Rice University',
            sessionRefs: ['s1'],
          },
        ],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'concepts',
              status: 'source-provided',
              title: 'Calculus Volume 1',
              authors: ['OpenStax'],
              url: 'https://openstax.org/books/calculus-volume-1',
              license: 'CC BY-NC-SA 4.0',
              provider: 'openstax',
              evidence: 'Limits chapter.',
              conceptLinks: [{ id: 'C1', label: 'Limit' }],
            },
          ],
          sourceRefCoverage: {
            categories: {
              outcomes: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0 },
          },
        },
      },
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'openstax',
          license: 'CC BY-NC-SA 4.0',
          accessStatus: 'reference-present',
        }),
        expect.objectContaining({
          id: 'kr1',
          provider: 'genome',
          conceptLinks: [{ id: 'c1', label: 'Limits' }],
        }),
      ]),
    );
    expect(manifest.sourceLedgerSummary).toMatchObject({ sourceCount: 2, accessibleCount: 2 });
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 2 });
    expect(manifest.courseIR.sourceRefCoverage.categories.outcomes).toMatchObject({ total: 1, withRefs: 1 });
    expect(sourceReport).toContain('Source Ledger');
    expect(sourceReport).toContain('outcomes: 1/1 with sourceRefs');
  });

  it('bridges complete CourseIR sourceRef coverage to trusted concept-linked ledger rows', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Trusted SourceRef Bridge'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Genetics Source Truth', objectives: ['Trace sources.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        concepts: [
          { id: 'c1', term: 'DNA' },
          { id: 'c2', term: 'Genetic testing' },
          { id: 'c3', term: 'CRISPR' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [
              { id: 'sec1', topic: 'DNA', conceptRefs: ['c1'], resourceRefs: ['kr1'] },
              { id: 'sec2', topic: 'Testing', conceptRefs: ['c2'], resourceRefs: ['kr2'] },
              { id: 'sec3', topic: 'Editing', conceptRefs: ['c3'], resourceRefs: ['sf1'] },
            ],
          },
        ],
        resources: [
          {
            id: 'kr1',
            title: 'DNA structure and inheritance',
            origin: 'openalex',
            kind: 'article',
            url: 'https://openalex.org/W1',
            license: 'cc-by',
            sessionRefs: ['s1'],
          },
          {
            id: 'kr2',
            title: 'Genetic testing and privacy',
            origin: 'openalex',
            kind: 'article',
            url: 'https://openalex.org/W2',
            license: 'public-domain',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf1',
            title: 'CRISPR genome editing review',
            origin: 'source-finder',
            kind: 'source-finder source',
            url: 'https://example.edu/crispr-review',
            license: 'cc-by',
            sessionRefs: ['s1'],
          },
        ],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1', 'C2', 'C3'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              examples: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
              assessments: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
              rubricCriteria: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toHaveLength(3);
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 3 });
    expect(manifest.sourceReport.sourceReviewCount).toBeUndefined();
    expect(manifest.courseIR).toMatchObject({
      sourceLedgerRows: 3,
      sourceRefBridge: {
        source: 'coursegraph-concept-linked-ledger',
        trustedRows: 3,
        conceptLinkedRows: 3,
        replacedReviewRows: 1,
      },
    });
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: 3,
      totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
    });
    expect(manifest.courseIR.sourceRefCoverage.trusted).toBeUndefined();
    expect(buildFinalizeSourceEvidence(manifest, []).refCoverage).toEqual({
      total: 12,
      withRefs: 0,
      missing: 12,
      danglingRefs: 0,
      basis: 'trusted-concept-linked',
    });
    expect(sourceReport).toContain('Source Ledger');
    expect(sourceReport).toContain(
      'not established: 3 trusted, concept-linked source ledger rows are included, but this package does not map individual CourseIR sourceRefs to those trusted rows',
    );
    expect(sourceReport).not.toContain('Source Review Notes');
  });

  it('deduplicates duplicate trusted source-finder work rows before counting source proof', async () => {
    const prototypingEvidence =
      'UX prototyping source evidence for wireframes, mockups, and iterative prototype development.';
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'User Experience Design Studio',
        lessons: [
          {
            title: 'Lesson 1: Prototype development',
            sections: [
              {
                topicSection: 'wireframes and prototype development',
                learningObjectives: 'Use wireframes and prototype iterations to test design ideas.',
              },
            ],
          },
        ],
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Prototype development', objectives: ['Prototype with evidence.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'wireframes' },
          { id: 'c2', term: 'prototype development' },
          { id: 'c3', term: 'test planning' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Prototype development',
            sections: [
              {
                id: 'sec1',
                topic: 'wireframes and prototype development',
                conceptRefs: ['c1', 'c2', 'c3'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        readings: [],
        sourceFinderMiniShard: {
          topics: [
            {
              lessonNumber: 1,
              topic: 'prototype development',
              sources: [
                {
                  id: 'sf1',
                  title: 'Prototyping (Wireframes, Mockups &amp; Co)',
                  authors: ['Margret Plank'],
                  provider: 'crossref',
                  kind: 'posted-content',
                  doi: '10.65527/sfxsp-76774',
                  license: 'CC BY 4.0',
                  snippet: prototypingEvidence,
                },
                {
                  id: 'sf-4-2',
                  title: 'Prototyping (Wireframes, Mockups &amp;amp; Co)',
                  authors: ['Margret Plank'],
                  provider: 'crossref',
                  kind: 'posted-content',
                  doi: '10.65527/4gsph-jk398',
                  license: 'CC BY 4.0',
                  snippet: prototypingEvidence,
                },
                {
                  id: 'sf2',
                  title: 'A/B testing',
                  authors: ['Wikipedia contributors'],
                  provider: 'wikipedia',
                  kind: 'encyclopedia article',
                  url: 'https://en.wikipedia.org/wiki/A/B_testing',
                  license: 'CC BY-SA 4.0',
                  snippet: 'A/B testing source evidence for test planning and task-scenario comparison.',
                },
              ],
            },
          ],
        },
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1', 'C2', 'C3'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0 },
            },
            totals: { total: 9, withRefs: 9, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toHaveLength(2);
    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Prototyping (Wireframes, Mockups &amp; Co)',
          provider: 'crossref',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'wireframes' })]),
        }),
        expect.objectContaining({
          title: 'A/B testing',
          provider: 'wikipedia',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'test planning' })]),
        }),
      ]),
    );
    expect(manifest.sourceLedger.filter((row) => /prototyping/i.test(row.title || ''))).toHaveLength(1);
    expect(manifest.sourceLedgerSummary).toMatchObject({
      sourceCount: 2,
      trustedCount: 2,
      trustedConceptLinkedCount: 2,
    });
    expect(manifest.courseIR).toMatchObject({
      sourceLedgerRows: 2,
      sourceRefBridge: {
        source: 'coursegraph-concept-linked-ledger',
        trustedRows: 2,
        conceptLinkedRows: 2,
        replacedReviewRows: 1,
      },
    });
    expect(sourceReport.match(/Prototyping/g)).toHaveLength(1);
  });

  it('keeps parenthesized syllabus URLs intact and dedupes them against trusted source-finder rows', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'User Experience Design Studio',
        lessons: [
          {
            title: 'Lesson 1: Personas',
            sections: [
              {
                topicSection: 'user profiles and personas',
                learningObjectives: 'Use persona evidence to explain user needs and scenarios.',
              },
            ],
          },
        ],
      },
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            syllabus: {
              courseTitle: 'User Experience Design Studio',
              weeklySchedule: [
                {
                  week: 'Week 1',
                  topic: 'Personas',
                  readings:
                    'Wikipedia contributors. Persona (user experience). Wikipedia: https://en.wikipedia.org/wiki/Persona_(user_experience) (CC BY-SA 4.0)',
                },
              ],
            },
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Personas', objectives: ['Use personas with evidence.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'syllabus', 'lessonPlans'],
      courseGraph: {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'user profiles' },
          { id: 'c2', term: 'needs' },
          { id: 'c3', term: 'scenarios' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Personas',
            sections: [
              {
                id: 'sec1',
                topic: 'user profiles and personas',
                conceptRefs: ['c1', 'c2', 'c3'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        readings: [],
        sourceFinderMiniShard: {
          topics: [
            {
              lessonNumber: 1,
              topic: 'personas',
              sources: [
                {
                  id: 'sf1',
                  title: 'Persona (user experience)',
                  authors: ['Wikipedia contributors'],
                  provider: 'wikipedia',
                  kind: 'encyclopedia article',
                  url: 'https://en.wikipedia.org/wiki/Persona_(user_experience)',
                  license: 'CC BY-SA 4.0',
                  snippet:
                    'Personas are semi-fictional representations of users in user-centered design and UX research.',
                },
              ],
            },
          ],
        },
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1', 'C2', 'C3'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 3, withRefs: 3, missing: 0, danglingRefs: 0 },
            },
            totals: { total: 9, withRefs: 9, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger.filter((row) => /Persona \(user experience\)/i.test(row.title || ''))).toHaveLength(1);
    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf1',
          provider: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Persona_(user_experience)',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'user profiles' })]),
        }),
      ]),
    );
    expect(manifest.sourceLedger.some((row) => /^syllabus-src-/i.test(row.id || ''))).toBe(false);
    expect(JSON.stringify(manifest.sourceLedger)).not.toContain('Persona_(user_experience"');
    expect(sourceReport).toContain('https://en.wikipedia.org/wiki/Persona_(user_experience)');
    expect(sourceReport).not.toContain('syllabus-src-');
  });

  it('does not invent UX source proof when the admitted run has only CourseIR review rows', async () => {
    const courseMap = {
      courseName: 'User Experience Design Studio',
      lessons: [
        {
          title: 'Lesson 1: Design research',
          sections: [
            {
              topicSection: 'user research methods',
              learningObjectives: 'Apply user experience research methods to identify user needs.',
            },
          ],
        },
        {
          title: 'Lesson 2: Prototype review',
          sections: [
            {
              topicSection: 'usability testing and accessibility',
              learningObjectives: 'Use prototype feedback, usability findings, and accessibility checks.',
            },
          ],
        },
      ],
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Design research', objectives: ['Apply user research methods.'] },
              { lessonTitle: 'Lesson 2: Prototype review', objectives: ['Use usability findings.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'user experience' },
          { id: 'c2', term: 'usability testing' },
          { id: 'c3', term: 'accessibility' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Design research',
            sections: [{ id: 'sec1', topic: 'user research methods', conceptRefs: ['c1'], resourceRefs: [] }],
          },
          {
            id: 's2',
            number: 2,
            title: 'Prototype review',
            sections: [
              { id: 'sec2', topic: 'usability testing and accessibility', conceptRefs: ['c2', 'c3'], resourceRefs: [] },
            ],
          },
        ],
        resources: [],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2'],
          conceptIds: ['C1', 'C2', 'C3'],
          assessmentIds: ['A1', 'A2'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0, missingIds: [] },
              examples: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              assessments: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              rubricCriteria: { total: 6, withRefs: 6, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 34, withRefs: 34, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('ux-curated-');
    expect(sourceReport).not.toContain('Usability testing');
    expect(sourceReport).not.toContain('Web accessibility');
    expect(sourceReport).not.toContain('Software prototyping');
  });

  it('does not turn named readings into exporter-invented bibliography proof', async () => {
    const courseMap = {
      courseName: 'World Literature Seminar',
      lessons: [
        {
          title: 'Lesson 1: Homeric Epic',
          sections: [{ topicSection: 'The Odyssey', learningObjectives: 'Analyze recognition and hospitality.' }],
        },
        {
          title: 'Lesson 2: Infinite Libraries',
          sections: [
            {
              topicSection: 'The Library of Babel',
              learningObjectives: 'Evaluate combinatorial totality and epistemic uncertainty.',
            },
          ],
        },
      ],
    };
    const readings = [
      { id: 'R1', title: 'The Odyssey', lesson: 1, provenance: 'instructor-named' },
      { id: 'R2', title: 'The Library of Babel', lesson: 2, provenance: 'instructor-named' },
    ];
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Homeric Epic', objectives: ['Analyze recognition and hospitality.'] },
              { lessonTitle: 'Lesson 2: Infinite Libraries', objectives: ['Evaluate combinatorial totality.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        course: { name: 'World Literature Seminar' },
        concepts: [
          { id: 'c1', term: 'recognition scene' },
          { id: 'c2', term: 'combinatorial totality' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Homeric Epic',
            sections: [{ id: 'sec1', topic: 'The Odyssey', conceptRefs: ['c1'], resourceRefs: [] }],
          },
          {
            id: 's2',
            number: 2,
            title: 'Infinite Libraries',
            sections: [{ id: 'sec2', topic: 'The Library of Babel', conceptRefs: ['c2'], resourceRefs: [] }],
          },
        ],
        resources: [],
        readings,
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('literature-curated-source');
    expect(sourceReport).not.toContain('https://www.gutenberg.org/ebooks/1727');
    expect(sourceReport).not.toContain('https://en.wikipedia.org/wiki/The_Library_of_Babel');
  });

  it('does not invent Python source proof when provider proof collapses to CourseIR review rows', async () => {
    const courseMap = {
      courseName: 'Introduction to Computer Science with Python',
      lessons: [
        {
          title: 'Lesson 1: Variables and expressions',
          sections: [
            {
              topicSection: 'variables, data types, and expressions',
              learningObjectives: 'Trace Python variables, data types, and expressions before running code.',
            },
          ],
        },
        {
          title: 'Lesson 2: Control flow and functions',
          sections: [
            {
              topicSection: 'conditionals, loops, and functions',
              learningObjectives: 'Use conditionals, loops, and functions to solve small Python problems.',
            },
          ],
        },
        {
          title: 'Lesson 3: Collections and files',
          sections: [
            {
              topicSection: 'lists, dictionaries, strings, and file input/output',
              learningObjectives: 'Manipulate Python collections and read or write text files.',
            },
          ],
        },
        {
          title: 'Lesson 4: Recursion and object-oriented programming',
          sections: [
            {
              topicSection: 'recursion, classes, and objects',
              learningObjectives: 'Explain recursive base cases and model simple objects with classes.',
            },
          ],
        },
      ],
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Variables and expressions', objectives: ['Trace variables.'] },
              { lessonTitle: 'Lesson 2: Control flow and functions', objectives: ['Use functions.'] },
              { lessonTitle: 'Lesson 3: Collections and files', objectives: ['Read files.'] },
              { lessonTitle: 'Lesson 4: Recursion and object-oriented programming', objectives: ['Model objects.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        course: { name: 'Introduction to Computer Science with Python' },
        concepts: [
          { id: 'c1', term: 'variables' },
          { id: 'c2', term: 'expressions' },
          { id: 'c3', term: 'conditionals' },
          { id: 'c4', term: 'loops' },
          { id: 'c5', term: 'functions' },
          { id: 'c6', term: 'lists' },
          { id: 'c7', term: 'dictionaries' },
          { id: 'c8', term: 'strings' },
          { id: 'c9', term: 'file input/output' },
          { id: 'c10', term: 'recursion' },
          { id: 'c11', term: 'classes' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Variables and expressions',
            sections: [{ id: 'sec1', topic: 'variables and expressions', conceptRefs: ['c1', 'c2'], resourceRefs: [] }],
          },
          {
            id: 's2',
            number: 2,
            title: 'Control flow and functions',
            sections: [
              {
                id: 'sec2',
                topic: 'conditionals, loops, and functions',
                conceptRefs: ['c3', 'c4', 'c5'],
                resourceRefs: [],
              },
            ],
          },
          {
            id: 's3',
            number: 3,
            title: 'Collections and files',
            sections: [
              {
                id: 'sec3',
                topic: 'lists, dictionaries, strings, and file input/output',
                conceptRefs: ['c6', 'c7', 'c8', 'c9'],
                resourceRefs: [],
              },
            ],
          },
          {
            id: 's4',
            number: 4,
            title: 'Recursion and object-oriented programming',
            sections: [
              {
                id: 'sec4',
                topic: 'recursion, classes, and objects',
                conceptRefs: ['c10', 'c11'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2', 'L3', 'L4'],
          conceptIds: ['C1', 'C2', 'C3', 'C4'],
          assessmentIds: ['A1', 'A2'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 40, withRefs: 40, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 60, withRefs: 60, missing: 0, danglingRefs: 0, missingIds: [] },
              examples: { total: 15, withRefs: 15, missing: 0, danglingRefs: 0, missingIds: [] },
              assessments: { total: 15, withRefs: 15, missing: 0, danglingRefs: 0, missingIds: [] },
              rubricCriteria: { total: 45, withRefs: 45, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 94, withRefs: 94, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 269, withRefs: 269, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('python-openstax-');
    expect(sourceReport).not.toContain('OpenStax Introduction to Python Programming');
  });

  it('drops music search false friends without inventing replacement source proof', async () => {
    const courseMap = {
      courseName: 'Interval Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Classifying Written and Heard Intervals',
          sections: [
            {
              topicSection: 'generic interval number, interval quality, and semitone evidence',
              learningObjectives: 'Classify written and heard musical intervals from pitch spelling and semitones.',
            },
          ],
        },
        {
          title: 'Lesson 2: Compound Intervals and Inversions',
          sections: [
            {
              topicSection: 'compound reduction, sum-to-nine inversions, and quality exchange',
              learningObjectives: 'Reduce compound intervals and verify interval inversions.',
            },
          ],
        },
      ],
    };
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      courseGraph: {
        course: { name: 'Interval Evidence Studio: Music Theory and Aural Skills' },
        concepts: [
          { id: 'c1', term: 'generic interval' },
          { id: 'c2', term: 'interval quality' },
          { id: 'c3', term: 'compound interval' },
          { id: 'c4', term: 'interval inversion' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Classifying written and heard musical intervals',
            sections: [
              {
                id: 'sec1',
                topic: 'generic interval, interval quality, and semitone evidence',
                conceptRefs: ['c1', 'c2'],
                resourceRefs: [],
              },
            ],
          },
          {
            id: 's2',
            number: 2,
            title: 'Compound intervals and inversions',
            sections: [
              {
                id: 'sec2',
                topic: 'compound interval reduction and interval inversion',
                conceptRefs: ['c3', 'c4'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        readings: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'musical interval classification',
              sources: [
                {
                  provider: 'openalex',
                  kind: 'journal article',
                  title: 'Classification of Multivariate Objects Using Interval Quantile Classes',
                  url: 'https://doi.org/10.0000/statistics-interval-classes',
                  license: 'CC BY 4.0',
                  snippet: 'A statistics paper about interval quantile classes.',
                },
              ],
            },
          ],
        },
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2'],
          conceptIds: ['c1', 'c2', 'c3', 'c4'],
          assessmentIds: ['A1', 'A2'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
          },
        },
      },
      pipelineState: {
        knowledgeBackbone: '0/2 lessons genome-linked · 1 open resource (source-finder: 1)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('Classification of Multivariate Objects');
    expect(JSON.stringify(manifest)).not.toContain('music-omt-intervals');
    expect(sourceReport).not.toContain('Open Music Theory: Intervals');
  });

  it('does not inflate CourseIR sourceRef coverage with trusted but unlinked source rows', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Trusted Unlinked SourceRef Bridge'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Project Sources', objectives: ['Trace source alignment.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        concepts: [{ id: 'c1', term: 'Project charter' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Project charter', conceptRefs: ['c1'], resourceRefs: ['kr1'] }],
          },
        ],
        resources: [
          {
            id: 'kr1',
            title: 'Project charter design evidence',
            origin: 'openalex',
            kind: 'article',
            url: 'https://openalex.org/W-linked',
            license: 'cc-by',
            sessionRefs: ['s1'],
          },
          {
            id: 'kr2',
            title: 'Project management metadata with no lesson link',
            origin: 'openalex',
            kind: 'article',
            url: 'https://openalex.org/W-unlinked',
            license: 'cc-by',
          },
        ],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toHaveLength(1);
    expect(manifest.sourceLedgerSummary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      conceptLinkedCount: 1,
      trustedConceptLinkedCount: 1,
      reviewRequiredCount: 2,
    });
    expect(manifest.sourceReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'courseir',
          accessStatus: 'no-url-or-doi',
        }),
        expect.objectContaining({
          id: 'kr2',
          provider: 'openalex',
          accessStatus: 'reference-present',
          licenseAmbiguous: false,
          conceptLinks: [],
        }),
      ]),
    );
    expect(manifest.courseIR.sourceRefBridge).toBeUndefined();
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: 1,
      totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
    });
    expect(sourceReport).toContain('Project management metadata with no lesson link');
    expect(sourceReport).toContain('Source Review Notes');
  });

  it('bridges CourseIR sourceRef coverage to source rows recovered from syllabus weekly readings', async () => {
    const courseMap = makeCourseMap('Project Management Source Recovery');
    courseMap.lessons[0].sections[0].topicSection = 'Project life cycle';
    courseMap.lessons[1].sections[0].topicSection = 'Scope definition';

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            syllabus: {
              courseTitle: 'Project Management Source Recovery',
              weeklySchedule: [
                {
                  week: 'Week 1',
                  topic: 'Project life cycle',
                  readings:
                    'Existing course map fields.; Xun Xu, Ling Ma, Lieyun Ding (2014). A Framework for BIM-Enabled Life-Cycle Information Management of Construction Project. OpenAlex: https://doi.org/10.5772/58445 (cc-by); Instructor-approved readings for Project life cycle.',
                  assignments: 'Project charter',
                },
                {
                  week: 'Week 2',
                  topic: 'Scope definition',
                  readings:
                    'Course materials students need to prepare.; Mai Pham, Andrijana Rajic, Judy Greig et al. (2014). A scoping review of scoping reviews. OpenAlex: https://doi.org/10.1002/jrsm.1123 (cc-by)',
                  assignments: 'Scope memo',
                },
              ],
            },
          },
        },
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Project life cycle', objectives: ['Trace source proof.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'syllabus', 'lessonPlans'],
      courseGraph: {
        sessions: [],
        resources: [],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2'],
          conceptIds: ['C1', 'C2'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              examples: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              assessments: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
              rubricCriteria: { total: 6, withRefs: 6, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 20, withRefs: 20, missing: 0, danglingRefs: 0 },
          },
        },
      },
      pipelineState: {
        knowledgeBackbone: '0/2 lessons genome-linked · 2 open resources (openalex: 2)',
        nativeAuthoring: 'assembled 2 sessions · CurriculumV1 repaired 2 lessons / 1 assessments',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toHaveLength(2);
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          doi: '10.5772/58445',
          license: 'CC BY',
          accessStatus: 'reference-present',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'Project life cycle' })]),
        }),
        expect.objectContaining({
          provider: 'openalex',
          doi: '10.1002/jrsm.1123',
          license: 'CC BY',
          accessStatus: 'reference-present',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'Scope definition' })]),
        }),
      ]),
    );
    expect(manifest.courseIR).toMatchObject({
      sourceLedgerRows: 2,
      sourceRefBridge: {
        source: 'coursegraph-concept-linked-ledger',
        trustedRows: 2,
        conceptLinkedRows: 2,
        replacedReviewRows: 1,
      },
    });
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: 2,
      totals: { total: 20, withRefs: 20, missing: 0, danglingRefs: 0 },
    });
    expect(sourceReport).toContain('A Framework for BIM-Enabled Life-Cycle Information Management');
    expect(sourceReport).not.toContain('Existing course map fields');
  });

  it('does not bridge CourseIR sourceRef coverage to metadata-only source rows', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Metadata Only Source Bridge'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Source Trust', objectives: ['Separate metadata from proof.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        concepts: [{ id: 'c1', term: 'Source trust' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Source trust', conceptRefs: ['c1'], resourceRefs: ['ol1', 'cr1'] }],
          },
        ],
        resources: [
          {
            id: 'ol1',
            title: 'Metadata-only project source',
            origin: 'openlibrary',
            kind: 'book metadata',
            url: 'https://openlibrary.org/works/OL1',
            license: 'Open Library public metadata',
            sessionRefs: ['s1'],
          },
          {
            id: 'cr1',
            title: 'Crossref metadata-only source',
            origin: 'crossref',
            kind: 'scholarly work',
            url: 'https://doi.org/10.1000/metadata-only',
            doi: '10.1000/metadata-only',
            license: 'Crossref public metadata',
            sessionRefs: ['s1'],
          },
        ],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            sourceLedgerRows: 1,
            categories: {
              outcomes: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              activities: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
              factualClaims: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
          },
        },
      },
      pipelineState: {
        knowledgeBackbone: '0/1 lessons genome-linked · 2 open resources (openlibrary: 1, crossref: 1)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(manifest.sourceLedgerSummary).toMatchObject({
      sourceCount: 0,
      trustedCount: 0,
      licenseAmbiguousCount: 0,
      reviewRequiredCount: 3,
    });
    expect(manifest.sourceReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'courseir',
          accessStatus: 'no-url-or-doi',
        }),
        expect.objectContaining({
          id: 'ol1',
          provider: 'openlibrary',
          licenseAmbiguous: true,
        }),
        expect.objectContaining({
          id: 'cr1',
          provider: 'crossref',
          licenseAmbiguous: true,
        }),
      ]),
    );
    expect(manifest.courseIR.sourceRefBridge).toBeUndefined();
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: 1,
      totals: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
    });
    expect(sourceReport).toContain('Source Review Notes');
    expect(sourceReport).toContain('Crossref metadata-only source');
  });

  it('dedupes weaker syllabus source rows when a trusted DOI source already exists', async () => {
    const courseMap = makeCourseMap('Source Duplicate Merge');
    courseMap.lessons[0].sections[0].topicSection = 'Fundraising stages';

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            syllabus: {
              courseTitle: 'Source Duplicate Merge',
              weeklySchedule: [
                {
                  week: 'Week 1',
                  topic: 'Fundraising stages',
                  readings:
                    'Susan Kay-Williams (2000). The five stages of fundraising. Crossref: https://doi.org/10.1002/nvsm.115 (https://creativecommons.org/licenses/by/4.0/)',
                  assignments: 'Funding memo',
                },
              ],
            },
          },
        },
      },
      featureIds: ['courseMap', 'syllabus'],
      courseGraph: {
        concepts: [{ id: 'c1', term: 'Fundraising stages' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Fundraising stages', conceptRefs: ['c1'], resourceRefs: ['sf2'] }],
          },
        ],
        resources: [
          {
            id: 'sf2',
            title: 'The five stages of fundraising: a framework for the development of fundraising',
            origin: 'source-finder',
            kind: 'scholarly work',
            url: 'https://doi.org/10.1002/nvsm.115',
            doi: '10.1002/nvsm.115',
            license: 'https://creativecommons.org/licenses/by/4.0/',
            sessionRefs: ['s1'],
          },
        ],
        readings: [],
      },
      pipelineState: {
        knowledgeBackbone: '1 open resource (source-finder: 1)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toHaveLength(1);
    expect(manifest.sourceLedger[0]).toMatchObject({
      id: 'sf2',
      doi: '10.1002/nvsm.115',
      provider: 'source-finder',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      accessStatus: 'reference-present',
      conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'Fundraising stages' })]),
    });
    expect(sourceReport).toContain('(source id: sf2)');
    expect(sourceReport).not.toContain('syllabus-src-');
  });

  it('drops generated syllabus public-metadata false friends instead of exporting review notes', async () => {
    const courseMap = makeCourseMap('User Experience Design Studio');
    courseMap.lessons[0].sections[0].topicSection = 'Design journals';

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        syllabus: {
          status: 'done',
          data: {
            syllabus: {
              courseTitle: 'User Experience Design Studio',
              weeklySchedule: [
                {
                  week: 'Week 1',
                  topic: 'Design journals',
                  readings:
                    'Crossref public metadata (2022). Journals of Mechatronics Machine Design and Manufacturing. Crossref: https://doi.org/10.46610/jmmdm (Crossref public metadata)',
                  assignments: 'Design journal reflection',
                },
              ],
            },
          },
        },
      },
      featureIds: ['courseMap', 'syllabus'],
      courseGraph: {
        course: { name: 'User Experience Design Studio' },
        concepts: [{ id: 'c1', term: 'Design journals' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Design journals', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        readings: [],
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));

    expect(manifest.sourceLedger).toBeUndefined();
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(manifest.sourceReport).toBeUndefined();
    expect(zip.file('SOURCE_REPORT.md')).toBeNull();
  });

  it('recovers source report proof from rendered course-map resources when the export graph is sparse', async () => {
    const courseMap = makeCourseMap('Sociology Source Fallback');
    courseMap.lessons[0].sections[0] = {
      topicSection: 'Socialization',
      learningObjectives: 'Explain how agents of socialization shape identity.',
      supportingResources:
        'course map; syllabus; lesson plans; slide decks; assignment briefs; rubrics; discussion prompts; quiz and exam bank; study guides; course FAQ; Worked examples, readings, or activity sheets aligned to institutions.; OpenStax Introduction to Sociology 3e, Socialization, https://openstax.org/books/introduction-sociology-3e/pages/5-introduction-to-socialization, CC BY 4.0',
    };

    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Socialization', objectives: ['Explain socialization.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: { sessions: [], resources: [], readings: [] },
      pipelineState: {
        genomeLinker: '1 genome + 0 cached of 4 lessons (1 concepts, 1 citations, 0 bridges)',
        judgment: 'limited knowledge check (1 linked concept across 1 genome-linked lesson)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openstax',
          url: 'https://openstax.org/books/introduction-sociology-3e/pages/5-introduction-to-socialization',
          license: 'CC BY 4.0',
          accessStatus: 'reference-present',
        }),
      ]),
    );
    expect(manifest.sourceLedgerSummary).toMatchObject({ sourceCount: 1, accessibleCount: 1 });
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 1 });
    expect(sourceReport).toContain('OpenStax Introduction to Sociology 3e');
    expect(sourceReport).not.toContain('course map');
    expect(sourceReport).not.toContain('lesson plans');
    expect(sourceReport).not.toContain('Worked examples, readings, or activity sheets');
  });

  it('exports CourseIR review proof when source-backed pipeline state loses its graph ledger', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Genetics Source Proof Fallback'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Export Reliability', objectives: ['Verify source proof.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: { sessions: [], resources: [], readings: [] },
      pipelineState: {
        enrichment: 'ran (4 lessons enriched)',
        genomeLinker: '0 genome + 0 cached of 4 lessons (0 concepts, 0 citations, 0 bridges)',
        nativeAuthoring: 'CurriculumV1 repaired 4 lessons / 4 assessments',
        knowledgeBackbone: '0/4 lessons genome-linked · 5 open resources (openlibrary: 1, source-finder: 4)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(manifest.sourceReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'courseir',
          accessStatus: 'no-url-or-doi',
        }),
      ]),
    );
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 0, sourceReviewCount: 1 });
    expect(manifest.courseIR.sourceRefCoverage).toBeUndefined();
    expect(manifest.courseIR.valid).toBe(false);
    expect(manifest.courseIR.sourceProofFallback).toMatchObject({
      source: 'export-course-map',
      projectedThrough: 'curriculumv1',
      valid: false,
    });
    expect(sourceReport).toContain('Source Review Notes');
    expect(sourceReport).not.toContain('SourceRef Coverage');
  });

  it('never injects Python proof into a UX course that mentions iteration, testing, functions, objects, and classes', async () => {
    const courseMap = makeCourseMap('User Experience Design Studio');
    courseMap.lessons = [
      {
        title: 'Lesson 1: Usability Testing and Evidence-Based Iteration',
        sections: [
          {
            topicSection: 'Test prototype objects with a class of participants',
            learningObjectives: 'Evaluate interface functions and iterate from usability evidence.',
          },
        ],
      },
    ];
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      courseGraph: { sessions: [], resources: [], readings: [] },
      pipelineState: {
        enrichment: 'ran (1 lesson enriched)',
        genomeLinker: '0 genome + 0 cached of 1 lessons (0 concepts, 0 citations, 0 bridges)',
        knowledgeBackbone: '0/1 lessons genome-linked · 0 cited open resources',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const allRows = [...(manifest.sourceLedger || []), ...(manifest.sourceReviewRows || [])];
    expect(allRows.some((row) => String(row.id || '').startsWith('python-openstax-'))).toBe(false);
    expect(allRows.some((row) => /Introduction to Python Programming/i.test(String(row.title || '')))).toBe(false);
  });

  it('rejects the production Python-policy false friend and packages its required data assets', async () => {
    const courseMap = {
      courseName: 'Python for Public Policy',
      lessons: [
        { title: 'Python and pandas for public datasets', sections: [{ topicSection: 'pandas data structures' }] },
        {
          title: 'Data cleaning, missing values, and reproducible notebooks',
          sections: [{ topicSection: 'Handling Missing Data' }],
        },
        {
          title: 'Data visualization with matplotlib for policy audiences',
          sections: [{ topicSection: 'matplotlib visualization' }],
        },
      ],
    };
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      // The live runtime carried retrieval state without repeating the course
      // identity on this graph. ZIP assembly must bind courseMap identity
      // before deciding whether the result is admissible.
      courseGraph: {
        sessions: [],
        resources: [],
        readings: [],
        sourceFinderMiniShard: {
          topics: [
            {
              lessonNumber: 2,
              topic: 'Handling Missing Data',
              sources: [
                {
                  id: 'sf1',
                  title: 'Open energy system models',
                  provider: 'wikipedia',
                  url: 'https://en.wikipedia.org/wiki/Open_energy_system_models',
                  license: 'CC BY-SA 4.0',
                  kind: 'encyclopedia background',
                  snippet: 'Open-source energy models used for climate policy.',
                },
              ],
            },
          ],
        },
      },
      pipelineState: {
        enrichment: 'ran (3 lessons enriched)',
        knowledgeBackbone: '0/3 lessons genome-linked · 1 cited open resource (source-finder: 1)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const allRows = [...(manifest.sourceLedger || []), ...(manifest.sourceReviewRows || [])];

    expect(allRows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Open energy system models' })]),
    );
    expect(allRows.some((row) => String(row.id || '').startsWith('ux-curated-'))).toBe(false);
    expect(allRows.some((row) => String(row.id || '').startsWith('python-openstax-'))).toBe(false);
    expect(manifest.requiredAssets.map((asset) => asset.id)).toEqual(
      expect.arrayContaining(['course-dataset', 'data-dictionary', 'starter-notebook', 'starter-script']),
    );
    expect(zip.file('Required Assets/Python for Public Policy - Required Lab Assets.md')).not.toBeNull();
    expect(zip.file('Required Assets/policy_outcomes_sample.csv')).not.toBeNull();
    expect(zip.file('Required Assets/DATA_DICTIONARY.md')).not.toBeNull();
    expect(zip.file('Required Assets/starter_policy_analysis.ipynb')).not.toBeNull();
    expect(zip.file('Required Assets/starter_policy_analysis.py')).not.toBeNull();
    expect(manifest.requiredAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'course-dataset', status: 'bundled-starter' }),
        expect.objectContaining({ id: 'starter-notebook', status: 'bundled-starter' }),
      ]),
    );
  });

  it('never assumes a quantum-computing course uses Python', async () => {
    const courseMap = makeCourseMap('Introduction to Quantum Computing');
    courseMap.lessons = [
      {
        title: 'Lesson 1: Quantum gates and algorithms',
        sections: [
          {
            topicSection: 'Quantum circuits',
            learningObjectives: 'Analyze a quantum algorithm and compare circuit outcomes.',
          },
        ],
      },
    ];
    const result = await buildCourseMaterialsZip({
      courseMap,
      deliverables: {},
      featureIds: ['courseMap'],
      courseGraph: { sessions: [], resources: [], readings: [] },
      pipelineState: {
        enrichment: 'ran (1 lesson enriched)',
        courseMap: 'algi-v0 · typed skeleton',
        knowledgeBackbone: '0/1 lessons genome-linked · 0 cited open resources',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const allRows = [...(manifest.sourceLedger || []), ...(manifest.sourceReviewRows || [])];
    expect(allRows.some((row) => String(row.id || '').startsWith('python-openstax-'))).toBe(false);
    expect(allRows.some((row) => /Introduction to Python Programming/i.test(String(row.title || '')))).toBe(false);
  });

  it('keeps CourseIR fallback rows out of trusted sourceLedger proof', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('CourseIR Review Source Proof'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Source Review', objectives: ['Review source proof.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        sessions: [],
        resources: [],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1'],
          conceptIds: ['C1'],
          assessmentIds: ['A1'],
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
          sourceRefCoverage: {
            categories: {
              outcomes: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
            },
            totals: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0 },
          },
        },
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(manifest.sourceReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'courseir',
          accessStatus: 'no-url-or-doi',
        }),
      ]),
    );
    expect(manifest.sourceLedgerSummary).toMatchObject({ sourceCount: 0, reviewRequiredCount: 1 });
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 0, sourceReviewCount: 1 });
    expect(sourceReport).toContain('Source Review Notes');
    expect(sourceReport).toContain('trustedBibliography=false');
    expect(sourceReport).toContain('course plan and instructor notes');
    expect(sourceReport).not.toContain('Existing course map fields');
    expect(sourceReport).not.toContain('## Source Ledger');
  });

  it('replaces stale zero-genome judgment when exported source proof is complete', async () => {
    const sourceRefCoverage = {
      version: 'courseir.v1',
      sourceLedgerRows: 2,
      totals: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
      categories: {
        outcomes: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
        activities: { total: 2, withRefs: 2, missing: 0, danglingRefs: 0, missingIds: [] },
        examples: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
        assessments: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
        rubricCriteria: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
        factualClaims: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
      },
    };
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Introduction to Computer Science with Python'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [
              { lessonTitle: 'Lesson 1: Variables', objectives: ['Use Python variables.'] },
              { lessonTitle: 'Lesson 2: Loops', objectives: ['Trace Python loops.'] },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        courseName: 'Introduction to Computer Science with Python',
        sessions: [
          { id: 's1', number: 1, title: 'Lesson 1: Variables' },
          { id: 's2', number: 2, title: 'Lesson 2: Loops' },
        ],
        concepts: [
          { id: 'c1', term: 'variables' },
          { id: 'c2', term: 'loops' },
        ],
        resources: [],
        readings: [],
        courseIR: {
          version: 'courseir.v1',
          lessonIds: ['L1', 'L2'],
          conceptIds: ['c1', 'c2'],
          assessmentIds: ['A1', 'A2'],
          sourceLedger: [
            {
              id: 'SL1',
              title: 'OpenStax Introduction to Python Programming section 1.3 Variables',
              provider: 'openstax',
              sourceType: 'open textbook section',
              url: 'https://openstax.org/books/introduction-python-programming/pages/1-3-variables',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'c1', label: 'variables' }],
            },
            {
              id: 'SL2',
              title: 'OpenStax Introduction to Python Programming section 5.1 While Loop',
              provider: 'openstax',
              sourceType: 'open textbook section',
              url: 'https://openstax.org/books/introduction-python-programming/pages/5-1-while-loop',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'c2', label: 'loops' }],
            },
          ],
          sourceRefCoverage: {
            ...sourceRefCoverage,
            trusted: {
              sourceLedgerRows: 2,
              totals: sourceRefCoverage.totals,
              categories: sourceRefCoverage.categories,
            },
          },
        },
      },
      pipelineState: {
        genomeLinker: '0 genome + 0 cached of 2 lessons (0 concepts, 0 citations, 0 bridges)',
        judgment: 'not evaluated (0 genome-linked lessons)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.pipeline.judgment).toBe(
      'source-backed coverage check (8/8 sourceRef atoms covered; 2/2 lessons with cited resources; genome prerequisite judgment unavailable)',
    );
    expect(manifest.sourceLedgerSummary).toMatchObject({
      sourceCount: 2,
      trustedCount: 2,
      conceptLinkedCount: 2,
      trustedConceptLinkedCount: 2,
    });
    expect(sourceReport).toContain('outcomes: 2/2 with sourceRefs');
  });

  it('exports metadata-only source-finder fallbacks as review rows when no trusted source exists', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Metadata Source Finder Review'),
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [{ lessonTitle: 'Lesson 1: Project Charter', objectives: ['Explain source trust.'] }],
          },
        },
      },
      featureIds: ['courseMap', 'lessonPlans'],
      courseGraph: {
        concepts: [{ id: 'c1', term: 'Project charter' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Project charter', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        readings: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'project charter',
              sources: [
                {
                  provider: 'openlibrary',
                  kind: 'book metadata',
                  title: 'Project Management Metadata',
                  url: 'https://openlibrary.org/works/OL3429343W',
                  license: 'Open Library public metadata',
                  snippet: 'Bibliographic metadata for a project management title.',
                },
              ],
            },
          ],
        },
      },
      pipelineState: {
        knowledgeBackbone: '0/1 lessons genome-linked · 1 open resource (openlibrary: 1)',
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    const sourceReport = await zip.file('SOURCE_REPORT.md').async('string');

    expect(manifest.sourceLedger).toBeUndefined();
    expect(manifest.sourceReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf-1-1',
          provider: 'openlibrary',
          title: 'Project Management Metadata',
          status: 'review-required: metadata-only, license, access, or concept-link gap',
          conceptLinks: [{ id: 'c1', label: 'Project charter' }],
        }),
      ]),
    );
    expect(manifest.sourceLedgerSummary).toMatchObject({ sourceCount: 0, reviewRequiredCount: 1 });
    expect(manifest.sourceReport).toMatchObject({ path: 'SOURCE_REPORT.md', sourceCount: 0, sourceReviewCount: 1 });
    expect(sourceReport).toContain('Source Review Notes');
    expect(sourceReport).toContain('Project Management Metadata');
  });

  it('uses custom deliverable names in ZIP paths and manifest labels', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap(),
      deliverables: {
        custom_weeklyReflection: {
          status: 'done',
          data: { weekly_reflection: [{ lessonTitle: 'Lesson 1', reflectionPrompt: 'Connect practice to care.' }] },
        },
      },
      featureIds: ['courseMap', 'custom_weeklyReflection'],
    });

    const paths = result.files.map((file) => file.path).join('\n');
    expect(paths).toContain('Weekly Reflection/Export Smoke Course - Weekly Reflection.docx');
    expect(paths).not.toContain('custom_weeklyReflection');

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifestText = await zip.file('PACKAGE_MANIFEST.json').async('string');
    const manifest = JSON.parse(manifestText);
    expect(manifest.requestedFeatures).toContainEqual({ featureId: 'custom', label: 'Weekly Reflection' });
    expect(manifest.files).toContainEqual(
      expect.objectContaining({
        path: 'Weekly Reflection/Export Smoke Course - Weekly Reflection.docx',
        featureId: 'custom',
        label: 'Weekly Reflection',
      }),
    );
    expect(manifestText).not.toContain('custom_weeklyReflection');
  });

  it('resolves an original native visual source only from its complete typed contract', async () => {
    const artifact = 'Annotated composition comparison';
    const typedSpecimen = {
      protocol: 'coursemapper-typed-evidence-specimen-v1',
      lessonNumber: 1,
      conceptBinding: 'composition',
      specimenKind: 'spatial-composition',
      taskContract: {
        protocol: 'coursemapper-functional-visual-task-contract-v1',
        contractId: 'VTC-L01',
        upstreamRequirementSha256: 'a'.repeat(64),
        constructFamily: 'spatial-composition',
        predicates: [{ id: 'primary-directs-attention' }],
        counterexample: { stateId: 'reversed-direction' },
      },
      taskContractSha256: 'b'.repeat(64),
      entities: [
        { id: 'primary', geometry: { x: 5, y: 15, w: 40, h: 25 } },
        { id: 'secondary', geometry: { x: 8, y: 58, w: 24, h: 15 } },
        { id: 'anchor', geometry: { x: 75, y: 18, w: 14, h: 24 } },
      ],
      relations: [
        {
          id: 'eye-path',
          from: 'primary',
          to: 'anchor',
          visibleStatement: 'The primary mass directs attention to the anchor.',
        },
      ],
      sourceBinding: {
        id: 'CM-SRC-L01',
        label: 'Original CourseMapper-native composition specimen',
        resolution: 'native-evidence-specimen',
        verificationRule: 'Inspect the typed entities and relation before interpretation.',
      },
      learnerProduct: { id: 'CM-PROD-L01', artifact },
      rightsBinding: {
        mode: 'open-or-public-domain-or-original-native',
        assetRightsClass: 'original-native-owner-controlled',
        disclosure: 'Original CourseMapper-native vector; no external image asset.',
      },
      visibleTask: {
        protocol: 'coursemapper-visible-functional-task-v1',
        cardTextSha256: 'c'.repeat(64),
        authoredSummarySha256: 'd'.repeat(64),
        authoredBulletsSha256: 'e'.repeat(64),
        sourceBindingId: 'CM-SRC-L01',
        learnerProductId: 'CM-PROD-L01',
        artifact,
        successCriterion: 'Name the visible relationship.',
        rightsDisclosure: 'Original CourseMapper-native vector; no external image asset.',
      },
    };
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Native Visual Trust'),
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonNumber: 1,
                lessonTitle: 'Lesson 1: Composition',
                slides: [
                  {
                    type: 'keyTerm',
                    title: 'Inspect composition',
                    bullets: ['Analyze the visible relationship and annotate its evidence.'],
                    visual: { kind: 'evidence specimen', typedSpecimen },
                  },
                ],
              },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'slideDecks'],
      courseGraph: {
        sessions: [{ id: 's1', number: 1, title: 'Lesson 1: Composition' }],
        resources: [],
        readings: [],
        assessments: [{ id: 'A1.1', title: artifact, kind: 'graded-artifact', dueSession: 1 }],
      },
      quality: false,
    });

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.functionalVisualBindings).toContainEqual(
      expect.objectContaining({
        lessonNumber: 1,
        visibleTask: expect.objectContaining({
          protocol: 'coursemapper-visible-functional-task-v1',
          hashBound: true,
          cardTextSha256: 'c'.repeat(64),
          authoredSummarySha256: 'd'.repeat(64),
          authoredBulletsSha256: 'e'.repeat(64),
          successCriterion: 'Name the visible relationship.',
        }),
        source: expect.objectContaining({
          bindingId: 'CM-SRC-L01',
          resolution: 'native-evidence-specimen',
          resolved: true,
        }),
      }),
    );
  });

  it('adds a required lab-assets marker when notebook and dataset assets are referenced', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: {
        courseName: 'Applied Machine Learning',
        lessons: [
          {
            title: 'Lesson 1: Model Validation',
            sections: [
              {
                supportingResources: 'Starter notebook; course dataset; model card template',
                weeklyAssessments:
                  'Model validation notebook using a train-test split, confusion matrix, threshold tradeoff, precision, recall, and fairness note.',
              },
            ],
          },
        ],
      },
      deliverables: {
        studyGuides: {
          status: 'done',
          data: {
            studyGuides: [
              {
                lessonTitle: 'Lesson 1: Model Validation',
                summary: 'Use the Jupyter notebook and dataset to compare validation metrics and model-card limits.',
              },
            ],
          },
        },
      },
      featureIds: ['courseMap', 'studyGuides'],
    });

    const assetPath = 'Required Assets/Applied Machine Learning - Required Lab Assets.md';
    expect(result.files.map((file) => file.path)).toContain(assetPath);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const report = await zip.file(assetPath).async('string');
    expect(report).toContain('Course dataset');
    expect(report).toContain('Starter lab notebook');
    expect(report).toContain('Model card or validation template');
    expect(report).toContain('Bundled starter assets');
    expect(report).toContain('Instructor-provided assets still required');
    expect(report).not.toMatch(/`[^`]+`/);
    expect(zip.file('Required Assets/policy_outcomes_sample.csv')).toBeNull();
    expect(zip.file('Required Assets/starter_policy_analysis.ipynb')).toBeNull();
    expect(zip.file('Required Assets/MODEL_CARD_TEMPLATE.md')).not.toBeNull();

    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.requiredAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'course-dataset', label: 'Course dataset', status: 'unresolved' }),
        expect.objectContaining({ id: 'starter-notebook', label: 'Starter lab notebook', status: 'unresolved' }),
        expect.objectContaining({
          id: 'model-card-template',
          label: 'Model card or validation template',
          status: 'bundled-starter',
        }),
      ]),
    );
  });

  it('fails closed instead of downloading a partial ZIP when a selected file cannot be built', async () => {
    buildDeliverableDocxBlob.mockRejectedValueOnce(new Error('DOCX build failed'));

    await expect(
      downloadCourseMaterialsZip({
        courseMap: makeCourseMap(),
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: { lessonPlans: [{ lessonTitle: 'Lesson 1', objectives: ['Verify exports.'] }] },
          },
        },
        featureIds: ['courseMap', 'lessonPlans'],
      }),
    ).rejects.toBeInstanceOf(PackageZipExportError);

    expect(saveAs).not.toHaveBeenCalled();
  });

  it('keeps an assembled ZIP recoverable but does not save it when an attempted grade times out', async () => {
    qualityGraderOverride.grade = () => new Promise(() => {});
    const result = await downloadCourseMaterialsZip({
      courseMap: makeCourseMap(),
      featureIds: ['courseMap'],
      quality: {
        timeoutMs: 1,
        precomputed: {
          status: 'graded',
          score: 99,
          grade: 'A',
          graderVersion: 'rejected-cached-grade',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
        },
      },
    });

    expect(result.downloaded).toBe(false);
    expect(result.downloadFailure).toEqual({ code: 'quality-proof-unavailable' });
    expect(result.quality).toMatchObject({ status: 'not-graded' });
    expect(result.packageReadinessReceipt.contentReadiness).toMatchObject({
      status: 'not-graded',
      score: null,
      grade: null,
    });
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.qualityReportMarkdown.toLowerCase()).toContain('quality proof unavailable');
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('keeps a graded ZIP recoverable but does not save it without positive export verification', async () => {
    const result = await downloadCourseMaterialsZip({
      courseMap: makeCourseMap(),
      featureIds: ['courseMap'],
    });

    expect(result.quality).toMatchObject({ status: 'graded' });
    expect(result.packageReadinessReceipt).toMatchObject({
      protocol: 'coursemapper-package-readiness-receipt-v2',
      exportVerification: { status: 'unverified', checked: 0, failed: 0 },
      downloadSafety: { status: 'unverified', blockerCount: 0 },
    });
    expect(result.downloaded).toBe(false);
    expect(result.downloadFailure).toEqual({ code: 'package-safety-unverified' });
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('does not save when current structural blockers invalidate otherwise passing export checks', async () => {
    const blocker = {
      severity: 'blocker',
      source: 'readiness',
      featureId: 'courseMap',
      message: 'Course map preparation is incomplete.',
    };
    const result = await downloadCourseMaterialsZip({
      courseMap: makeCourseMap(),
      featureIds: ['courseMap'],
      readiness: { status: 'blocked', blockers: [blocker], warnings: [], issues: [blocker] },
      quality: {
        digest: {
          gates: { exportStatus: 'passed', exportChecked: 4, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.quality).toMatchObject({ status: 'graded' });
    expect(result.packageReadinessReceipt.downloadSafety).toMatchObject({
      status: 'blocked',
      blockerCount: 1,
      structuralBlockerCount: 1,
    });
    expect(result.downloaded).toBe(false);
    expect(result.downloadFailure).toEqual({ code: 'package-safety-unverified' });
    expect(saveAs).not.toHaveBeenCalled();
  });

  it('saves only after the rebuilt package carries positive verified-v2 export evidence', async () => {
    const result = await downloadCourseMaterialsZip({
      courseMap: makeCourseMap(),
      featureIds: ['courseMap'],
      readiness: { status: 'ready', blockers: [], warnings: [], issues: [] },
      quality: {
        digest: {
          gates: { exportStatus: 'passed', exportChecked: 4, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.quality).toMatchObject({ status: 'graded' });
    expect(result.packageReadinessReceipt.downloadSafety).toMatchObject({ status: 'verified', blockerCount: 0 });
    expect(result.downloaded).toBe(true);
    expect(saveAs).toHaveBeenCalledWith(result.blob, result.fileName);
  });

  it('still saves an explicitly ungraded diagnostic export when grading was deliberately disabled', async () => {
    const result = await downloadCourseMaterialsZip({
      courseMap: makeCourseMap(),
      featureIds: ['courseMap'],
      quality: false,
    });

    expect(result.downloaded).toBe(true);
    expect(saveAs).toHaveBeenCalledWith(result.blob, result.fileName);
  });

  it('fails closed when a selected ZIP document leaks internal proof language', async () => {
    buildDeliverableDocxBlob.mockResolvedValueOnce(
      await makeOfficeXmlBlob(
        'word/document.xml',
        '<w:document><w:body><w:p><w:r><w:t>This handout exposes the compiler decision.</w:t></w:r></w:p></w:body></w:document>',
      ),
    );

    await expect(
      buildCourseMaterialsZip({
        courseMap: makeCourseMap(),
        deliverables: {
          lessonPlans: {
            status: 'done',
            data: { lessonPlans: [{ lessonTitle: 'Lesson 1', objectives: ['Verify exports.'] }] },
          },
        },
        featureIds: ['courseMap', 'lessonPlans'],
      }),
    ).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          featureId: 'lessonPlans',
          format: 'docx',
          message: 'Lesson Plans DOCX export exposes internal compiler decision language in word/document.xml.',
        }),
      ],
    });
  });

  it('fails closed when the ZIP course-map workbook leaks internal proof language', async () => {
    buildXlsxBuffer.mockResolvedValueOnce(
      await makeOfficeXmlBuffer(
        'xl/sharedStrings.xml',
        '<sst><si><t>This workbook exposes source grounding details.</t></si></sst>',
      ),
    );

    await expect(
      buildCourseMaterialsZip({
        courseMap: makeCourseMap(),
        deliverables: {},
        featureIds: ['courseMap'],
      }),
    ).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          featureId: 'courseMap',
          format: 'xlsx',
          message: 'Course Map XLSX export exposes internal source grounding language in xl/sharedStrings.xml.',
        }),
      ],
    });
  });
});
