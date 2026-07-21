import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  buildCourseMaterialsZip,
  downloadCourseMaterialsZip,
  PackageZipExportError,
  sanitizeFilePart,
} from '../packageZipExporter';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter';
import { buildXlsxBuffer } from '../xlsxGenerator';
import { saveAs } from 'file-saver';

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

describe('packageZipExporter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

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
          gates: { exportStatus: 'passed', exportChecked: 38, exportFailed: 0, exportWarnings: 0 },
        },
      },
    });

    expect(result.manifest).toMatchObject({
      manifestVersion: 2,
      generator: {
        app: 'CourseMapper',
        appVersion: '0.16.7',
        runId: 'run-provenance',
        finishRunId: 'finish-provenance',
        provider: 'public',
        models: ['scion-public'],
        scion: {
          product: 'Scion V0.16.7',
          localOnly: true,
          runtimeArtifact: {
            modelId: 'google/gemma-4-E2B-it-qat-q4_0-gguf',
            revision: '69536a21d70340464240401ba38223d805f6a709',
            sha256: '3646b4c147cd235a44d91df1546d3b7d8e29b547dbe4e1f80856419aa455e6fd',
          },
          adapter: { status: 'base-only', qualified: false },
        },
      },
      exportVerification: { status: 'passed', checked: 38, failed: 0, warnings: 0 },
      generationConstraints: { sessionMinutes: 50 },
    });
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
    expect(buildXlsxBuffer).toHaveBeenCalledOnce();
    expect(buildDeliverableDocxBlob).toHaveBeenCalledTimes(2);
    expect(buildSlideDeckPptxBlob).toHaveBeenCalledTimes(2);
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
    expect(rubricCalls).toHaveLength(5);
    expect(rubricCalls[2][1].rubrics).toEqual([]);
    expect(rubricCalls[4][1].rubrics).toEqual([
      expect.objectContaining({ lessonTitle: 'Lesson 5: Current and Resistance' }),
    ]);
  });

  it('uses precomputed finish quality for ZIP reports instead of requiring a second grade pass', async () => {
    const result = await buildCourseMaterialsZip({
      courseMap: makeCourseMap('Browser Export Course'),
      deliverables: {},
      featureIds: ['courseMap'],
      quality: {
        precomputed: {
          status: 'graded',
          score: 100,
          grade: 'A',
          graderVersion: 'test-precomputed',
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
          texture: { score: 95, version: 'test-texture' },
          findings: [],
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
        score: 100,
        grade: 'A',
        graderVersion: 'test-precomputed',
        texture: expect.objectContaining({ score: 95 }),
      }),
    );
    expect(report).toContain('Overall: 100/100 (A)');
    expect(report).toContain('verified finish-pass quality result');
    expect(report).toContain('| texture | 10 | 95 | A |');
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
    expect(sourceReport).toContain('Source Ledger');
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

  it('recovers UX sourceRef proof with licensed concept-linked sources when provider retrieval leaves only CourseIR review rows', async () => {
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

    expect(manifest.sourceLedger.length).toBeGreaterThanOrEqual(3);
    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ux-curated-usability-testing',
          provider: 'wikipedia',
          license: 'CC BY-SA 4.0',
          url: 'https://en.wikipedia.org/wiki/Usability_testing',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'usability testing' })]),
        }),
        expect.objectContaining({
          id: 'ux-curated-web-accessibility',
          provider: 'wikipedia',
          license: 'CC BY-SA 4.0',
          url: 'https://en.wikipedia.org/wiki/Web_accessibility',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'accessibility' })]),
        }),
        expect.objectContaining({
          id: 'ux-curated-software-prototyping',
          provider: 'wikipedia',
          license: 'CC BY-SA 4.0',
          url: 'https://en.wikipedia.org/wiki/Software_prototyping',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'prototype review' })]),
        }),
      ]),
    );
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(manifest.sourceLedgerSummary).toMatchObject({
      trustedCount: manifest.sourceLedger.length,
      trustedConceptLinkedCount: manifest.sourceLedger.length,
      providers: ['wikipedia'],
    });
    expect(manifest.courseIR).toMatchObject({
      sourceLedgerRows: manifest.sourceLedger.length,
      sourceRefBridge: {
        source: 'coursegraph-concept-linked-ledger',
        trustedRows: manifest.sourceLedger.length,
        conceptLinkedRows: manifest.sourceLedger.length,
      },
    });
    expect(manifest.courseIR.sourceRefBridge.replacedReviewRows).toBeGreaterThanOrEqual(1);
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: manifest.sourceLedger.length,
      totals: { total: 34, withRefs: 34, missing: 0, danglingRefs: 0 },
    });
    expect(sourceReport).toContain('Source Ledger');
    expect(sourceReport).toContain('Usability testing');
    expect(sourceReport).toContain('CC BY-SA 4.0');
    expect(sourceReport).not.toContain('Source Review Notes');
    expect(sourceReport).not.toContain('Existing course map fields');
  });

  it('recovers Python sourceRef proof with licensed OpenStax sections when provider proof collapses to CourseIR review rows', async () => {
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

    expect(manifest.sourceLedger.length).toBeGreaterThanOrEqual(8);
    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'python-openstax-variables',
          provider: 'openstax',
          license: 'CC BY 4.0',
          url: 'https://openstax.org/books/introduction-python-programming/pages/1-3-variables',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'variables' })]),
        }),
        expect.objectContaining({
          id: 'python-openstax-functions',
          url: 'https://openstax.org/books/introduction-python-programming/pages/6-1-defining-functions',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'functions' })]),
        }),
        expect.objectContaining({
          id: 'python-openstax-dictionaries',
          url: 'https://openstax.org/books/introduction-python-programming/pages/10-1-dictionary-basics',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'dictionaries' })]),
        }),
        expect.objectContaining({
          id: 'python-openstax-recursion',
          url: 'https://openstax.org/books/introduction-python-programming/pages/12-1-recursion-basics',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'recursion' })]),
        }),
      ]),
    );
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(manifest.sourceLedgerSummary).toMatchObject({
      trustedCount: manifest.sourceLedger.length,
      trustedConceptLinkedCount: manifest.sourceLedger.length,
      providers: ['openstax'],
    });
    expect(manifest.courseIR).toMatchObject({
      sourceLedgerRows: manifest.sourceLedger.length,
      sourceRefBridge: {
        source: 'coursegraph-concept-linked-ledger',
        trustedRows: manifest.sourceLedger.length,
        conceptLinkedRows: manifest.sourceLedger.length,
      },
    });
    expect(manifest.courseIR.sourceRefBridge.replacedReviewRows).toBeGreaterThanOrEqual(1);
    expect(manifest.courseIR.sourceRefCoverage).toMatchObject({
      sourceLedgerRows: manifest.sourceLedger.length,
      totals: { total: 269, withRefs: 269, missing: 0, danglingRefs: 0 },
    });
    expect(sourceReport).toContain('Source Ledger');
    expect(sourceReport).toContain('OpenStax Introduction to Python Programming');
    expect(sourceReport).toContain('CC BY 4.0');
    expect(sourceReport).not.toContain('Source Review Notes');
    expect(sourceReport).not.toContain('Existing course map fields');
  });

  it('recovers music-interval source proof with licensed Open Music Theory materials and drops search false friends', async () => {
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

    expect(manifest.sourceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'music-omt-intervals',
          provider: 'open-music-theory',
          license: 'CC BY-SA 4.0',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'generic interval' })]),
        }),
        expect.objectContaining({
          id: 'music-omt-intervals-worksheet-e',
          provider: 'open-music-theory',
          license: 'CC BY-SA 4.0',
          conceptLinks: expect.arrayContaining([expect.objectContaining({ label: 'interval inversion' })]),
        }),
      ]),
    );
    expect(manifest.sourceReviewRows).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('Classification of Multivariate Objects');
    expect(manifest.sourceLedgerSummary).toMatchObject({
      sourceCount: 2,
      trustedCount: 2,
      trustedConceptLinkedCount: 2,
      providers: ['open-music-theory'],
    });
    expect(sourceReport).toContain('Open Music Theory: Intervals');
    expect(sourceReport).toContain('CC BY-SA 4.0');
    expect(sourceReport).not.toContain('Source Review Notes');
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
    expect(sourceReport).toContain('sf2:');
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
    expect(manifest.courseIR.sourceRefCoverage.totals.total).toBeGreaterThan(0);
    expect(manifest.courseIR.sourceProofFallback).toMatchObject({
      source: 'export-course-map',
      projectedThrough: 'curriculumv1',
    });
    expect(sourceReport).toContain('Source Review Notes');
    expect(sourceReport).toContain('SourceRef Coverage');
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
          sourceRefCoverage,
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

    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.requiredAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'course-dataset', label: 'Course dataset' }),
        expect.objectContaining({ id: 'starter-notebook', label: 'Starter lab notebook' }),
        expect.objectContaining({ id: 'model-card-template', label: 'Model card or validation template' }),
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
