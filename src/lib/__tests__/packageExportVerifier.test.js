import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { verifyPackageExports } from '../packageExportVerifier';
import { buildXlsxBuffer } from '../xlsxGenerator';
import { deliverableToCsvRows } from '../exporters/csvExporter';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter';
import { buildNotApplicableDisposition } from '../deliverableApplicability';

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn((id) => {
    if (id === 'custom_weeklyReflection') return { name: 'Weekly Reflection' };
    if (id === 'custom_readingResponse') return { name: 'Lesson Reading Response' };
    return null;
  }),
}));

vi.mock('../xlsxGenerator', () => ({
  buildXlsxBuffer: vi.fn(),
}));

vi.mock('../exporters/csvExporter', () => ({
  deliverableToCsvRows: vi.fn(() => ({ headers: ['Lesson'], rows: [['Lesson 1']] })),
}));

vi.mock('../exporters/bulkDocxExporter', () => ({
  buildDeliverableDocxBlob: vi.fn(() => Promise.resolve({ size: 256 })),
}));

vi.mock('../exporters/pptxExporter', () => ({
  buildSlideDeckPptxBlob: vi.fn(() => Promise.resolve({ size: 256 })),
}));

async function makeOfficeXmlBlob(path, xml) {
  const zip = new JSZip();
  zip.file(path, xml);
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([buffer]);
}

async function makeOfficeXmlBuffer(path, xml) {
  return await (await makeOfficeXmlBlob(path, xml)).arrayBuffer();
}

async function makeHealthyDocxBlob() {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Lesson</w:t></w:r></w:p></w:body></w:document>',
  );
  zip.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>Course footer</w:t></w:r></w:p></w:ftr>');
  return await zip.generateAsync({ type: 'blob' });
}

async function makeHealthyPptxBlob() {
  return await makeOfficeXmlBlob(
    'ppt/slides/slide1.xml',
    '<p:sld><p:cSld><p:sp><p:nvSpPr><p:cNvPr name="cmA11y-test" descr="A test semantic object."/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Lesson</a:t></a:r></a:p></p:txBody></p:sp></p:cSld></p:sld>',
  );
}

beforeEach(async () => {
  vi.mocked(buildXlsxBuffer).mockReset();
  vi.mocked(deliverableToCsvRows).mockReset();
  vi.mocked(buildDeliverableDocxBlob).mockReset();
  vi.mocked(buildSlideDeckPptxBlob).mockReset();

  vi.mocked(buildXlsxBuffer).mockResolvedValue(
    await makeOfficeXmlBuffer(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row><c t="inlineStr"><is><t>Lesson 1 Define sampling.</t></is></c></row></sheetData></worksheet>',
    ),
  );
  vi.mocked(deliverableToCsvRows).mockReturnValue({ headers: ['Lesson'], rows: [['Lesson 1']] });
  vi.mocked(buildDeliverableDocxBlob).mockResolvedValue(await makeHealthyDocxBlob());
  vi.mocked(buildSlideDeckPptxBlob).mockResolvedValue(await makeHealthyPptxBlob());
});

describe('verifyPackageExports', () => {
  it('runs in-memory checks for course map and selected deliverables', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] }],
      },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lt: 'Lesson 1', ob: 'Define sampling.' }] },
        },
      },
      selectedFeatures: ['courseMap', 'lessonPlans'],
    });

    expect(result.status).toBe('passed');
    expect(result.checked).toBe(6);
    expect(result.failed).toBe(0);
    expect(result.checks.map((check) => check.format)).toEqual(['xlsx', 'pdf', 'content', 'csv', 'docx', 'pdf']);
  });

  it('blocks DOCX accessibility failures without a duplicated format preamble', async () => {
    vi.mocked(buildDeliverableDocxBlob).mockResolvedValueOnce(
      await makeOfficeXmlBlob(
        'word/document.xml',
        '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Lesson</w:t></w:r></w:p></w:body></w:document>',
      ),
    );

    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lessonTitle: 'Lesson 1', outline: [] }] },
        },
      },
      selectedFeatures: ['lessonPlans'],
    });

    const docxCheck = result.checks.find((check) => check.format === 'docx');
    expect(result).toMatchObject({ status: 'failed', contentDisposition: 'blocked' });
    expect(docxCheck).toMatchObject({
      label: 'Lesson Plans',
      status: 'failed',
      message: 'Accessibility scan: no-footer.',
    });
    expect(`${docxCheck.label}: ${docxCheck.message}`).not.toMatch(/\b([A-Z][\w &'-]{3,50}): \1\b/);
  });

  it('does not report a clean export when assignment logistics defer to missing instructor configuration', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Compare sampling plans.' }] }],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [
              {
                lessonTitle: 'Lesson 1',
                instructions: ['Compare two sampling plans and defend one choice.'],
                formatRequirements: {
                  length: 'Follow the instructor length guidance when provided.',
                  format: 'Use the submission format listed for the memo in the course site.',
                  citationStyle: 'Apply the course citation format.',
                },
              },
            ],
          },
        },
      },
      selectedFeatures: ['assignments'],
    });

    expect(result.status).toBe('passed');
    expect(result.contentDisposition).toBe('needs-review');
    expect(result.checks.find((check) => check.format === 'content')).toMatchObject({
      featureId: 'assignments',
      status: 'warning',
    });
    expect(result.checks.find((check) => check.format === 'content')?.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'instructor-configuration-deferral' })]),
    );
  });

  it('treats compiler-routed non-applicable materials as complete without empty CSV or PDF warnings', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Introduction to Astronomy',
        lessons: [{ title: 'Lesson 1', sections: [{ weeklyAssessments: 'In-class evidence check.' }] }],
      },
      deliverables: {
        assignments: {
          status: 'done',
          data: {
            assignments: [],
            deliverableDisposition: buildNotApplicableDisposition('assignments', {
              reasonCode: 'no-standalone-assignment',
              summary: 'No separate assignment brief is needed for this course.',
              routeFeatureId: 'quizBank',
              routeLabel: 'Quiz & Exam Bank',
            }),
          },
        },
      },
      selectedFeatures: ['assignments'],
    });

    expect(result.status).toBe('passed');
    expect(result.warningCount).toBe(0);
    expect(result.checks.map((check) => check.format)).toEqual(['content', 'applicability', 'docx']);
    expect(deliverableToCsvRows).not.toHaveBeenCalled();
  });

  it('treats an answer-key rubric handoff as narrative-only instead of warning about empty tables', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Introduction to Astronomy',
        lessons: [{ title: 'Lesson 2: Seasons and Axial Tilt', sections: [{ weeklyAssessments: 'Midterm.' }] }],
      },
      deliverables: {
        rubrics: {
          status: 'done',
          data: {
            rubrics: [
              {
                title: 'Midterm — Answer Key Handoff',
                lessonTitle: 'Lesson 2: Seasons and Axial Tilt',
                gradedWork: 'Midterm',
                assessmentType: 'Exam (scored by answer key)',
                criteria: [],
                teacherNotes: 'Open the Quiz & Exam Bank for the answer key and per-question point values.',
              },
            ],
          },
        },
      },
      selectedFeatures: ['rubrics'],
    });

    expect(result.status).toBe('passed');
    expect(result.warningCount).toBe(0);
    expect(result.checks.map((check) => check.format)).toEqual(['content', 'applicability', 'docx']);
    expect(deliverableToCsvRows).not.toHaveBeenCalled();
  });

  it('fails honestly when the course map export has no lessons', async () => {
    const result = await verifyPackageExports({
      courseMap: { courseName: 'Empty', lessons: [] },
      deliverables: {},
      selectedFeatures: ['courseMap'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks[0].message).toContain('no lessons');
  });

  it('fails export verification when generated XLSX text leaks internal compiler language', async () => {
    vi.mocked(buildXlsxBuffer).mockResolvedValueOnce(
      await makeOfficeXmlBuffer(
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row><c t="inlineStr"><is><t>This course map exposes the compiler decision.</t></is></c></row></sheetData></worksheet>',
      ),
    );

    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] }],
      },
      deliverables: {},
      selectedFeatures: ['courseMap'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks[0]).toMatchObject({
      featureId: 'courseMap',
      format: 'xlsx',
      status: 'failed',
      message: 'Course map spreadsheet exposes internal compiler decision language in xl/worksheets/sheet1.xml.',
    });
  });

  it('fails export verification when generated XLSX shared strings leak internal proof language', async () => {
    vi.mocked(buildXlsxBuffer).mockResolvedValueOnce(
      await makeOfficeXmlBuffer(
        'xl/sharedStrings.xml',
        '<sst><si><t>This workbook exposes source grounding details.</t></si></sst>',
      ),
    );

    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [{ title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] }],
      },
      deliverables: {},
      selectedFeatures: ['courseMap'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks[0]).toMatchObject({
      featureId: 'courseMap',
      format: 'xlsx',
      status: 'failed',
      message: 'Course map spreadsheet exposes internal source grounding language in xl/sharedStrings.xml.',
    });
  });

  it('passes course-map PDF verification after sanitizing known internal proof language', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [
          {
            title: 'Lesson 1',
            sections: [{ learningGoals: 'This PDF row exposes source grounding details.' }],
          },
        ],
      },
      deliverables: {},
      selectedFeatures: ['courseMap'],
    });

    expect(result.status).toBe('passed');
    expect(result.checks.find((check) => check.format === 'pdf')).toMatchObject({
      featureId: 'courseMap',
      status: 'passed',
      message: 'PDF export text can be generated.',
    });
  });

  it('uses custom deliverable names in export verification messages', async () => {
    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: { custom_weeklyReflection: { status: 'error' } },
      selectedFeatures: ['custom_weeklyReflection'],
    });

    expect(result.status).toBe('passed');
    expect(result.contentDisposition).toBe('needs-review');
    expect(result.checks[0]).toMatchObject({
      featureId: 'custom_weeklyReflection',
      label: 'Weekly Reflection',
      message: 'Weekly Reflection has no generated data.',
    });
    expect(result.checks[0].message).not.toContain('custom_weeklyReflection');
  });

  it('passes export verification for compiled weekly reflection custom deliverables', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [
          { title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] },
          { title: 'Lesson 2', sections: [{ learningObjectives: 'Compare interview protocols.' }] },
        ],
      },
      deliverables: {
        custom_weeklyReflection: {
          status: 'done',
          data: {
            deliverableName: 'Weekly Reflection',
            weekly_reflection: [
              {
                lessonTitle: 'Lesson 1: Define sampling',
                weekNumber: 'Week 1',
                promptTitle: 'Weekly Reflection 1',
                reflectionPrompt: 'Connect sampling choices to your next research decision.',
              },
              {
                lessonTitle: 'Lesson 2: Compare interview protocols',
                weekNumber: 'Week 2',
                promptTitle: 'Weekly Reflection 2',
                reflectionPrompt: 'Explain how protocol choices shape your interview planning.',
              },
            ],
          },
        },
      },
      selectedFeatures: ['custom_weeklyReflection'],
    });

    expect(result.status).toBe('passed');
    expect(result.checks.map((check) => check.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
  });

  it('passes export verification for compiled reading response custom deliverables', async () => {
    const result = await verifyPackageExports({
      courseMap: {
        courseName: 'Research Methods',
        lessons: [
          { title: 'Lesson 1', sections: [{ learningObjectives: 'Define sampling.' }] },
          { title: 'Lesson 2', sections: [{ learningObjectives: 'Compare interview protocols.' }] },
        ],
      },
      deliverables: {
        custom_readingResponse: {
          status: 'done',
          data: {
            deliverableName: 'Lesson Reading Response',
            lesson_reading_response: [
              {
                lessonTitle: 'Lesson 1: Define sampling',
                weekNumber: 'Week 1',
                promptTitle: 'Lesson Reading Response 1',
                responsePrompt: 'Explain how the sampling reading changes your evidence choices.',
              },
              {
                lessonTitle: 'Lesson 2: Compare interview protocols',
                weekNumber: 'Week 2',
                promptTitle: 'Lesson Reading Response 2',
                responsePrompt: 'Connect the interview reading to your next protocol revision.',
              },
            ],
          },
        },
      },
      selectedFeatures: ['custom_readingResponse'],
    });

    expect(result.status).toBe('passed');
    expect(result.checks.map((check) => check.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
  });

  it('fails export verification when exported CSV text leaks internal compiler language', async () => {
    vi.mocked(deliverableToCsvRows).mockReturnValueOnce({
      headers: ['Lesson', 'Prompt'],
      rows: [['Lesson 1', 'This prompt exposes the compiler decision and publish gate.']],
    });

    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        custom_weeklyReflection: {
          status: 'done',
          data: {
            weekly_reflection: [
              {
                lessonTitle: 'Lesson 1',
                reflectionPrompt: 'This prompt exposes the compiler decision and publish gate.',
              },
            ],
          },
        },
      },
      selectedFeatures: ['custom_weeklyReflection'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.format === 'csv')).toMatchObject({
      featureId: 'custom_weeklyReflection',
      format: 'csv',
      status: 'failed',
      message: 'CSV export exposes internal compiler decision language in Prompt.',
    });
  });

  it('fails export verification when generated DOCX text leaks internal compiler language', async () => {
    vi.mocked(buildDeliverableDocxBlob).mockResolvedValueOnce(
      await makeOfficeXmlBlob(
        'word/document.xml',
        '<w:document><w:body><w:p><w:r><w:t>This handout exposes the compiler decision.</w:t></w:r></w:p></w:body></w:document>',
      ),
    );

    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lessonTitle: 'Lesson 1', objectives: ['Define sampling.'] }] },
        },
      },
      selectedFeatures: ['lessonPlans'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.format === 'docx')).toMatchObject({
      featureId: 'lessonPlans',
      status: 'failed',
      message: 'DOCX export exposes internal compiler decision language in word/document.xml.',
    });
  });

  it('fails export verification when deliverable PDF text would leak internal proof language', async () => {
    vi.mocked(deliverableToCsvRows)
      .mockReturnValueOnce({ headers: ['Lesson', 'Prompt'], rows: [['Lesson 1', 'Clean prompt.']] })
      .mockReturnValueOnce({
        headers: ['Lesson', 'Prompt'],
        rows: [['Lesson 1', 'This PDF prompt exposes the publish gate.']],
      });

    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: { lessonPlans: [{ lessonTitle: 'Lesson 1', objectives: ['Define sampling.'] }] },
        },
      },
      selectedFeatures: ['lessonPlans'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.format === 'pdf')).toMatchObject({
      featureId: 'lessonPlans',
      status: 'failed',
      message: 'Lesson Plans PDF export exposes internal publish gate language in Prompt.',
    });
  });

  it('fails export verification when generated PPTX text leaks internal proof language', async () => {
    vi.mocked(buildSlideDeckPptxBlob).mockResolvedValueOnce(
      await makeOfficeXmlBlob(
        'ppt/slides/slide1.xml',
        '<p:sld><p:cSld><a:t>This slide still exposes a publish gate.</a:t></p:cSld></p:sld>',
      ),
    );

    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [{ lessonTitle: 'Lesson 1', slides: [{ title: 'Sampling', bullets: ['Define sampling.'] }] }],
          },
        },
      },
      selectedFeatures: ['slideDecks'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.format === 'pptx')).toMatchObject({
      featureId: 'slideDecks',
      status: 'failed',
      message: 'Slide deck PowerPoint export exposes internal publish gate language in ppt/slides/slide1.xml.',
    });
  });

  it('fails export verification when slide-deck PDF speaker notes would leak internal proof language', async () => {
    const result = await verifyPackageExports({
      courseMap: { courseName: 'Research Methods', lessons: [{ title: 'Lesson 1', sections: [] }] },
      deliverables: {
        slideDecks: {
          status: 'done',
          data: {
            decks: [
              {
                lessonTitle: 'Lesson 1',
                slides: [
                  {
                    title: 'Sampling',
                    bullets: ['Define sampling.'],
                    speakerNotes: 'This speaker note exposes the model-use policy.',
                  },
                ],
              },
            ],
          },
        },
      },
      selectedFeatures: ['slideDecks'],
    });

    expect(result.status).toBe('failed');
    expect(result.checks.find((check) => check.format === 'pdf')).toMatchObject({
      featureId: 'slideDecks',
      status: 'failed',
      message: 'Slide Decks PDF export exposes internal model-use policy language in Content.',
    });
  });
});
