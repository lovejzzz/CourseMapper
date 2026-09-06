import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function inspectPdf(bytes) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim());
    expect(items.length, `page ${i} must not be empty`).toBeGreaterThan(1);
    for (const item of items) {
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(-1);
      expect(item.transform[4] + item.width, item.str).toBeLessThanOrEqual(viewport.width + 1);
      expect(item.transform[5], item.str).toBeGreaterThanOrEqual(0);
      expect(item.transform[5], item.str).toBeLessThanOrEqual(viewport.height);
    }
    pages.push(items.map((item) => item.str).join(' '));
  }
  await pdf.destroy();
  return pages;
}

test('course-map PDF retains linked-assessment arrows and evaluation checkmarks', async ({ page }, testInfo) => {
  await page.goto('/');
  const download = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { generatePdf } = await import('/src/lib/exporters.js');
    await generatePdf({
      courseName: 'Course Map Symbol Check',
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ weeklyAssessments: 'Calculation → Assignment Briefs / Lesson 01', evaluateDesign: true }],
        },
      ],
    });
  });
  const file = await download;
  const path = testInfo.outputPath('course-map.pdf');
  await file.saveAs(path);
  const pages = await inspectPdf(await fs.readFile(path));
  expect(pages.join(' ')).toContain('Calculation → Assignment Briefs / Lesson 01');
  expect(pages.join(' ')).toContain('✓');
});

for (const caseId of ['d-c04-recurring', 'd-s02-same-event-conflict', 'd-e03-order-effects']) {
  test(`all nine ${caseId} PDFs retain content inside printable pages`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const fixture = JSON.parse(await fs.readFile(`benchmarks/classroom/v2/cases/${caseId}.json`, 'utf8'));
    await page.goto('/');
    const files = await page.evaluate(async (input) => {
      const { buildCourseBlueprint, compileBlueprintDeliverables } =
        await import('/src/lib/courseBlueprintCompiler.js');
      const { repairDeliverableContentQuality } = await import('/src/lib/contentQualityRepair.js');
      const { deliverablePdfDefinition, buildClassroomPdfBlob } = await import('/src/lib/exporters/classroomPdf.js');
      const { slideDeckPdfDefinition } = await import('/src/lib/exporters/slideDeckPdfExporter.js');
      const features = [
        'syllabus',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
        'discussions',
        'quizBank',
        'studyGuides',
        'courseFaq',
      ];
      const map = {
        courseName: 'Classroom PDF Verification',
        lessons: [
          {
            title: input.id,
            sections: [
              {
                learningObjectives: input.request,
                weeklyAssessments: 'A reasoned response using the supplied record.',
              },
            ],
          },
        ],
      };
      const blueprint = buildCourseBlueprint(map, {
        instructorProvidedFacts: input.sources,
        sourceBrief: input.request,
        sessionMinutes: input.sessionMinutes,
      });
      const outputs = compileBlueprintDeliverables(blueprint, features);
      const files = [];
      for (const feature of features) {
        const data = repairDeliverableContentQuality(feature, outputs[feature], { sourceFacts: input.sources }).data;
        const definition =
          feature === 'slideDecks'
            ? slideDeckPdfDefinition(data, map.courseName)
            : deliverablePdfDefinition(feature, data, map.courseName);
        const blob = await buildClassroomPdfBlob(definition);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        files.push({ feature, base64: btoa(binary) });
      }
      return files;
    }, fixture);
    expect(files).toHaveLength(9);
    for (const file of files) {
      const bytes = Buffer.from(file.base64, 'base64');
      await fs.writeFile(testInfo.outputPath(`${file.feature}.pdf`), bytes);
      const pages = await inspectPdf(bytes);
      await fs.writeFile(testInfo.outputPath(`${file.feature}.txt`), pages.join('\n\f\n'));
      expect(pages.join(' ')).not.toContain('the cited evidence on strips');
      if (file.feature === 'quizBank') {
        const answerPage = pages.findIndex((text) => /ANSWER KEY/i.test(text));
        expect(answerPage).toBeGreaterThan(0);
        expect(pages[answerPage]).toMatch(/^ANSWER KEY/i);
      }
      if (caseId === 'd-c04-recurring' && file.feature === 'studyGuides') {
        expect(pages.join(' ')).toContain('58.33%');
        expect(pages.join(' ')).toContain('≈');
        expect(pages.join(' ')).toContain('other batches were not tested');
        expect(pages.join(' ')).toContain('WORKED EXAMPLE');
      }
    }
  });
}

test('Chinese PDF embeds readable text, and slide handouts never discard long content', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/');
  const files = await page.evaluate(async () => {
    const { buildClassroomPdfBlob } = await import('/src/lib/exporters/classroomPdf.js');
    const { slideDeckPdfDefinition } = await import('/src/lib/exporters/slideDeckPdfExporter.js');
    const bullets = Array.from(
      { length: 30 },
      (_, i) => `第${i + 1}步：保留完整推理，7/12 ≈ 58.33%。未测试的批次不能推断。`,
    );
    const data = {
      slideDecks: [
        {
          lessonTitle: '比例与证据',
          slides: [{ title: '完整推理', bullets, speakerNotes: '教师参考：最后一条说明必须保留。' }],
        },
      ],
    };
    let rejected = false;
    try {
      await buildClassroomPdfBlob({ content: [{ table: { body: [] } }] });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('Malformed PDF must reject so the next export can recover.');
    const blob = await buildClassroomPdfBlob(slideDeckPdfDefinition(data, '中文课程'));
    const english = await buildClassroomPdfBlob(
      slideDeckPdfDefinition(
        {
          slideDecks: [
            {
              lessonTitle: 'English after Chinese',
              slides: [{ title: 'Retain default font', bullets: ['Calculation → Assignment ✓'] }],
            },
          ],
        },
        'English after Chinese',
      ),
    );
    const files = [];
    for (const file of [blob, english]) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      files.push(btoa(binary));
    }
    return files;
  });
  const englishPages = await inspectPdf(Buffer.from(files[1], 'base64'));
  expect(englishPages.join(' ')).toContain('Calculation → Assignment ✓');
  const bytes = Buffer.from(files[0], 'base64');
  await fs.writeFile(testInfo.outputPath('chinese-long-slide.pdf'), bytes);
  const pages = await inspectPdf(bytes);
  const text = pages.join(' ').replace(/\s+/g, '');
  expect(pages.length).toBeGreaterThan(1);
  expect(text).toContain('第1步');
  expect(text).toContain('第30步');
  expect(text).toContain('7/12≈58.33%');
  expect(text).toContain('教师参考：最后一条说明必须保留。');
});
