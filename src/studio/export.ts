import type { Course } from './domain';
import { auditCourse } from './verify';
import { MATERIALS, materialDocument, type MaterialDocument, type MaterialKind, type MaterialBlock } from './materials';
import { escaped, richHtml } from './richText';
import { formattedBlock } from './materialFormat';

export type Block = MaterialBlock;
export function courseBlocks(course: Course, audience: 'student' | 'teacher'): Block[] {
  return materialDocument(course, audience, audience).blocks;
}
export function assertExportable(course: Course): void {
  const blocking = auditCourse(course).filter((issue) => issue.severity === 'block');
  if (blocking.length)
    throw new Error(
      `Correct these issues before exporting teaching materials: ${blocking.map((i) => i.message).join(' ')}`,
    );
}
export const documentCss = `body{max-width:780px;margin:44px auto;padding:0 24px;font:16px/1.55 Arial,"Noto Sans SC",sans-serif;color:#18241f}h1,h2,h3{line-height:1.25;break-after:avoid}h1{font-size:30px}h2{margin-top:28px;font-size:23px}h3{font-size:17px}p{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px;table-layout:fixed;margin:18px 0}td,th{border:1px solid #afb8b3;padding:9px;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf0ec;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}td p{margin:0}li p{margin:3px 0}.page{margin:54px 0;border:0;border-top:1px solid #ccd2ce}.answer-line{height:28px;border-bottom:1px solid #bdc4bf}.response{break-inside:avoid}a{color:inherit}.formatted-heading{font-weight:bold;line-height:1.25;break-after:avoid}.formatted-heading p{margin:0}.formatted-heading.h1{font-size:30px}.formatted-heading.h2{font-size:23px;margin-top:28px}.formatted-heading.h3{font-size:17px}@media print{body{margin:0;max-width:none;font-size:10.5pt}.page{break-before:page;border:0;margin:0}h1{font-size:22pt}h2{font-size:17pt}table{font-size:9pt}@page{size:A4;margin:18mm}}`;
export function renderMaterialHtml(course: Course, doc: MaterialDocument): string {
  const formatted = (block: Pick<MaterialBlock, 'text' | 'reference'>) => {
    const rich = formattedBlock(course, block);
    return rich ? richHtml(rich) : escaped(block.text);
  };
  const body = doc.blocks
    .map((block) => {
      if (block.type === 'page') return '<hr class="page">';
      if (block.type === 'space')
        return `<div class="response"><small>${escaped(block.text)}</small>${'<div class="answer-line"></div>'.repeat(block.lines ?? 3)}</div>`;
      if (block.type === 'table')
        return `<table><thead><tr>${block.headers?.map((text) => `<th>${escaped(text)}</th>`).join('')}</tr></thead><tbody>${block.rows?.map((row) => `<tr>${row.map((cell) => `<td>${formatted(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      const rich = formattedBlock(course, block);
      if (rich && block.type === 'body') return richHtml(rich);
      const tag = { title: 'h1', heading: 'h2', subheading: 'h3', body: 'p' }[block.type];
      if (rich)
        return `<div role="heading" aria-level="${tag.slice(1)}" class="formatted-heading ${tag}">${richHtml(rich)}</div>`;
      return `<${tag}>${escaped(block.text)}</${tag}>`;
    })
    .join('\n');
  return `<!doctype html><html lang="${doc.language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped(doc.title)} — ${escaped(doc.subtitle)}</title><style>${documentCss}</style><body>${body}</body></html>`;
}
export function renderCourseHtml(course: Course, audience: 'student' | 'teacher'): string {
  return renderMaterialHtml(course, materialDocument(course, audience, audience));
}
export async function renderCourseDocx(course: Course, audience: 'student' | 'teacher'): Promise<Uint8Array> {
  return (await import('./exportDocx')).renderMaterialDocx(course, materialDocument(course, audience, audience));
}
export type ExportFormat = 'docx' | 'pdf' | 'html' | 'csv' | 'xlsx' | 'pptx';
export const MIME: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  html: 'text/html;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export function safeFilename(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .trim()
      .slice(0, 100) || 'Course'
  );
}
export async function exportMaterial(
  course: Course,
  kind: MaterialKind,
  audience: 'student' | 'teacher',
  format: ExportFormat,
): Promise<Blob> {
  assertExportable(course);
  const doc = materialDocument(course, kind, audience);
  let bytes: Uint8Array | string;
  if (format === 'html') bytes = renderMaterialHtml(course, doc);
  else if (format === 'docx') bytes = await (await import('./exportDocx')).renderMaterialDocx(course, doc);
  else if (format === 'pdf') bytes = await (await import('./exportPdf')).renderMaterialPdf(course, doc);
  else if (format === 'pptx') bytes = await (await import('./exportSlides')).renderMaterialPptx(course, doc);
  else if (format === 'csv') bytes = (await import('./exportSheets')).renderMaterialCsv(doc);
  else bytes = await (await import('./exportSheets')).renderMaterialXlsx(doc);
  return new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], { type: MIME[format] });
}
export async function exportCourse(course: Course, onProgress: (message: string) => void = () => {}): Promise<Blob> {
  assertExportable(course);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const material of MATERIALS) {
    const kind = material.id;
    const audience = kind === 'teacher' || kind === 'lessonPlans' ? 'teacher' : 'student';
    onProgress(`Preparing ${material[course.brief.language]}…`);
    const doc = materialDocument(course, kind, audience);
    zip.file(`${kind}.html`, renderMaterialHtml(course, doc));
    zip.file(`${kind}.docx`, await (await import('./exportDocx')).renderMaterialDocx(course, doc));
    zip.file(`${kind}.csv`, (await import('./exportSheets')).renderMaterialCsv(doc));
    if (kind === 'courseMap') zip.file(`${kind}.xlsx`, await (await import('./exportSheets')).renderMaterialXlsx(doc));
    if (kind === 'slideDecks')
      zip.file(`${kind}.pptx`, await (await import('./exportSlides')).renderMaterialPptx(course, doc));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  zip.file('course.edutool.json', JSON.stringify(course, null, 2));
  zip.file(
    'review.txt',
    [
      'Automated checks cover structure, exact source spans and selected numerical answers. They do not establish educational effectiveness.',
      `Instructor approvals: ${Object.values(course.lessons).filter((lesson) => lesson.review === 'approved').length}/${course.lessonOrder.length}`,
      'Materials are linked inside EduTool. Downloaded or Google Drive copies are snapshots; re-export to update those copies.',
      'PDFs are available from each material’s export menu. Question-bank items reuse course practice and are labelled for revision.',
      ...auditCourse(course).map(
        (issue) => `${issue.severity.toUpperCase()} ${issue.lessonId ?? ''}: ${issue.message}`,
      ),
    ].join('\n'),
  );
  onProgress('Packing course files…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
