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
