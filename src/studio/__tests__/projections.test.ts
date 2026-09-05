import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { completeCourse } from './fixtures';
import { MATERIALS, materialDocument } from '../materials';
import { editLinkedText, type FieldReference } from '../references';
import { plainDocument } from '../richText';
import { renderMaterialHtml } from '../export';
import { renderMaterialDocx } from '../exportDocx';
import { renderMaterialCsv, renderMaterialXlsx } from '../exportSheets';
import { materialSlides, splitSlideText, slideLines, renderMaterialPptx } from '../exportSlides';
import { verifyActivity, verifyIndependentTask } from '../verify';

it('allows an intentional student sentence frame but rejects missing stimulus or model answer', () => {
  const course = completeCourse();
  const task = course.lessons[course.lessonOrder[0]].activities[0];
  task.prompt = 'Counterargument: [insert objection based on the supplied record]. Explain why it matters.';
  expect(verifyActivity(task, course.sources, true).join(' ')).not.toContain('placeholder');
  task.prompt = 'Analyze [insert source passage].';
  expect(verifyActivity(task, course.sources, true).join(' ')).toContain('placeholder');
  task.prompt = 'Explain the objection.';
  task.answer = '[insert objection based on the record]';
  expect(verifyActivity(task, course.sources, true).join(' ')).toContain('placeholder');
});

it('rejects the observed failure where one activity contains both guided and independent phases', () => {
  const course = completeCourse();
  const task = course.lessons[course.lessonOrder[0]].activities[1];
  task.prompt = '第一部分：指导练习。把原句改写。第二部分：独立任务。再完成全文。';
  expect(verifyActivity(task, course.sources, true).join(' ')).toContain('another named guided/independent phase');
});

it('rejects practice which merely selects a subset of already solved demonstration calculations', () => {
  const course = completeCourse();
  const lesson = course.lessons[course.lessonOrder[0]];
  const task = structuredClone(lesson.activities[0]);
  task.calculations = task.calculations.slice(0, 1);
  expect(verifyIndependentTask(lesson.workedExample, task, true).join(' ')).toContain('already solved');
  task.datasets[0].values = [2, 4, 6, 12];
  expect(verifyIndependentTask(lesson.workedExample, task, true)).toEqual([]);
});

it('links canonical task edits across all applicable materials while withholding instructor answers', async () => {
  const course = completeCourse();
  const id = course.lessonOrder[0];
  const task = course.lessons[id].activities[1];
  task.answer = 'PRIVATE_ANSWER';
  task.feedback[0].diagnosis = 'PRIVATE_DIAGNOSIS';
  const ref: FieldReference = { kind: 'task', lessonId: id, taskId: task.id!, path: ['prompt'] };
  const rich = plainDocument('Revised task with linked formatting.');
  rich.content![0].content![0].marks = [{ type: 'bold' }];
  const edited = editLinkedText(course, ref, 'Revised task with linked formatting.', course.revision, rich);
  for (const kind of ['student', 'assignments', 'quizBank', 'slideDecks'] as const) {
    const doc = materialDocument(edited, kind);
    expect(doc.blocks.some((block) => block.text === 'Revised task with linked formatting.')).toBe(true);
    const html = renderMaterialHtml(edited, doc);
    expect(html).toContain('<strong>Revised task with linked formatting.</strong>');
    expect(html).not.toContain('PRIVATE_');
  }
  for (const { id: kind } of MATERIALS.filter((material) => !['teacher', 'lessonPlans'].includes(material.id)))
    expect(renderMaterialHtml(edited, materialDocument(edited, kind))).not.toContain('PRIVATE_');
  expect(edited.lessons[id].review).toBe('pending');
  const doc = materialDocument(edited, 'assignments');
  const word = await JSZip.loadAsync(await renderMaterialDocx(edited, doc));
  const xml = await word.file('word/document.xml')!.async('string');
  expect(xml).toContain('<w:b/>');
  expect(xml).toContain('Revised task with linked formatting.');
  expect(xml).not.toContain('PRIVATE_');
  const slides = await JSZip.loadAsync(await renderMaterialPptx(edited, materialDocument(edited, 'slideDecks')));
  const slideXml = (
    await Promise.all(
      Object.keys(slides.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map((name) => slides.file(name)!.async('string')),
    )
  ).join('');
  expect(slideXml).toContain('Revised task with linked formatting.');
  expect(slideXml).toMatch(/b="1"[^<]*>[\s\S]{0,400}<a:t>Revised task with linked formatting\./);
  expect(slideXml).not.toContain('PRIVATE_');
});

it('prevents formulas in spreadsheet exports while preserving multilingual content and long readings', async () => {
  const course = completeCourse();
  course.plan!.title = '=HYPERLINK("https://example.invalid")';
  course.sources[Object.keys(course.sources)[0]].text = '中文资料'.repeat(9000);
  const doc = materialDocument(course, 'sourceReader');
  const csv = renderMaterialCsv(doc);
  expect(csv).toContain('"\'=HYPERLINK');
  const workbook = await JSZip.loadAsync(await renderMaterialXlsx(doc));
  const xml = await workbook.file('xl/worksheets/sheet1.xml')!.async('string');
  expect(xml).not.toContain('<f>');
  expect((xml.match(/中文资料/g) ?? []).length).toBe(9000);
  expect(await workbook.file('xl/styles.xml')!.async('string')).toContain('wrapText="1"');
});

it('keeps slide content intact when long English or Chinese text needs several readable slides', () => {
  const text = 'This paragraph must remain complete. '.repeat(50) + '这些文字不能被截断。'.repeat(50);
  expect(splitSlideText(text).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  const course = completeCourse();
  const doc = materialDocument(course, 'slideDecks');
  const slides = materialSlides(doc);
  expect(slides.length).toBeGreaterThan(5);
  expect(slides.flatMap((slide) => slide.paragraphs).join('\n')).toContain('Explain why the large delay');
  expect(slides.every((slide) => slide.paragraphs.join('').length < 600)).toBe(true);
});

it('paginates short lines and very long headings instead of overflowing fixed slide boxes', () => {
  const course = completeCourse();
  const doc = materialDocument(course, 'slideDecks');
  const lines = Array.from({ length: 40 }, (_, i) => `命题 ${i + 1}：判断证据。`).join('\n');
  const title = '需要完整保留而不能缩小到看不见的长标题'.repeat(12);
  doc.blocks = [
    { id: 'heading', type: 'heading', text: title },
    { id: 'body', type: 'body', text: lines },
  ];
  const slides = materialSlides(doc);
  expect(
    slides
      .filter((page) => !page.paragraphs.length)
      .map((page) => page.title)
      .join(''),
  ).toContain(title);
  expect(slides.every((page) => slideLines(page.paragraphs.join('\n\n')) <= 9)).toBe(true);
  expect(slides.every((page) => slideLines(page.title, 48) <= 2)).toBe(true);
  expect(slides.flatMap((page) => page.paragraphs).join('\n')).toBe(lines);
});
