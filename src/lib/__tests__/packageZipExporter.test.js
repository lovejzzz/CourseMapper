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
    expect(sourceReport).not.toContain('## Source Ledger');
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
