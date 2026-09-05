import type { Course } from './domain';
import type { MaterialDocument } from './materials';
import { formattedBlock } from './materialFormat';
import type { RichNode, RichMark } from './richText';

export type SlideRun = { text: string; marks?: RichMark[] };
export type SlidePage = { title: string; paragraphs: string[]; runs: SlideRun[][]; section: string };
function units(text: string): number {
  return [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 2 : 1), 0);
}
export function slideLines(text: string, width = 68): number {
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(units(line) / width)), 0);
}
/** Account for explicit line breaks as well as wrapping. Preserve all words;
 * paginate rather than shrinking text or silently clipping a long reading. */
export function splitSlideText(text: string, limit = 460, lines = 9, width = 68): string[] {
  const result: string[] = [];
  let current = '';
  const fits = (candidate: string) => units(candidate) <= limit && slideLines(candidate, width) <= lines;
  const flush = () => {
    if (current.trim()) result.push(current.trim());
    current = '';
  };
  for (const token of text.match(/[^\s\u2e80-\u9fff]+[ \t]*|[\u2e80-\u9fff]|\s/g) ?? []) {
    if (!fits(current + token) && current.trim()) flush();
    if (!fits(token)) {
      for (const char of token) {
        if (!fits(current + char)) flush();
        current += char;
      }
    } else current += token;
  }
  flush();
  return result;
}
function richRuns(node: RichNode, inherited: RichMark[] = []): SlideRun[] {
  if (node.type === 'text') return [{ text: node.text ?? '', marks: [...inherited, ...(node.marks ?? [])] }];
  if (node.type === 'hardBreak') return [{ text: '\n' }];
  const marks = node.type === 'heading' ? [...inherited, { type: 'bold' as const }] : inherited;
  const separator = ['doc', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type) ? '\n' : '';
  return (node.content ?? []).flatMap((child, index) => [
    ...(index && separator ? [{ text: separator }] : []),
    ...(node.type === 'bulletList'
      ? [{ text: '• ' }]
      : node.type === 'orderedList'
        ? [{ text: `${(node.attrs?.start ?? 1) + index}. ` }]
        : []),
    ...richRuns(child, marks),
  ]);
}
function sliceRuns(runs: SlideRun[], start: number, end: number): SlideRun[] {
  let offset = 0;
  return runs.flatMap((run) => {
    const from = Math.max(0, start - offset),
      to = Math.min(run.text.length, end - offset);
    offset += run.text.length;
    return to > from ? [{ ...run, text: run.text.slice(from, to) }] : [];
  });
}
export function materialSlides(doc: MaterialDocument, course?: Course): SlidePage[] {
  const pages: SlidePage[] = [];
  let section = doc.subtitle,
    heading = doc.title;
  let paragraphs: string[] = [],
    runs: SlideRun[][] = [];
  const titleParts = (title: string) => splitSlideText(title, 96, 2, 48);
  const cover = (title: string) => {
    for (const part of titleParts(title)) pages.push({ title: part, section, paragraphs: [], runs: [] });
  };
  cover(doc.title);
  const flush = () => {
    if (paragraphs.length) {
      pages.push({ title: titleParts(heading)[0] ?? '', section, paragraphs, runs });
      paragraphs = [];
      runs = [];
    }
  };
  for (const block of doc.blocks) {
    if (block.type === 'page') {
      flush();
      continue;
    }
    if (block.type === 'title' || block.type === 'heading' || block.type === 'subheading') {
      flush();
      if (block.type === 'heading') section = block.text;
      heading = block.text;
      if (block.type !== 'title' && titleParts(heading).length > 1) cover(heading);
      continue;
    }
    if (block.type === 'space') continue;
    const text =
      block.type === 'table'
        ? [block.headers?.join(' · '), ...(block.rows?.map((row) => row.map((cell) => cell.text).join(' · ')) ?? [])]
            .filter(Boolean)
            .join('\n')
        : block.text;
    const rich = course && formattedBlock(course, block);
    const blockRuns = rich ? richRuns(rich) : [{ text }];
    const rendered = blockRuns.map((run) => run.text).join('');
    let offset = 0;
    for (const chunk of splitSlideText(rendered)) {
      const joined = [...paragraphs, chunk].join('\n\n');
      if (units(joined) > 460 || slideLines(joined) > 9) flush();
      const start = rendered.indexOf(chunk, offset);
      paragraphs.push(chunk);
      runs.push(sliceRuns(blockRuns, start, start + chunk.length));
      offset = start + chunk.length;
    }
  }
  flush();
  return pages;
}
export async function renderMaterialPptx(course: Course, doc: MaterialDocument): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'EduTool';
  pptx.subject = doc.subtitle;
  pptx.title = doc.title;
  const font = doc.language === 'zh' ? 'Noto Sans SC' : 'Arial';
  pptx.theme = { headFontFace: font, bodyFontFace: font };
  const pages = materialSlides(doc, course);
  for (const [index, page] of pages.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: '173C32' };
    slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 0.7, w: 0.8, h: 0, line: { color: 'DBC488', width: 2 } });
    slide.addText(page.title, {
      x: 0.7,
      y: 1,
      w: 11.8,
      h: 1.05,
      fontFace: font,
      fontSize: 32,
      bold: true,
      color: 'F5F3E8',
      margin: 0,
      valign: 'middle',
      paraSpaceAfter: 0,
    });
    if (page.paragraphs.length)
      slide.addText(
        page.runs.flatMap((runs, index) => [
          ...(index ? [{ text: '\n\n', options: {} }] : []),
          ...runs.map((run) => ({
            text: run.text,
            options: {
              bold: run.marks?.some((mark) => mark.type === 'bold'),
              italic: run.marks?.some((mark) => mark.type === 'italic'),
              underline: run.marks?.some((mark) => mark.type === 'underline') ? { style: 'sng' as const } : undefined,
              strike: run.marks?.some((mark) => mark.type === 'strike') ? ('sngStrike' as const) : undefined,
              ...(run.marks?.find((mark) => mark.type === 'link')?.attrs?.href
                ? { hyperlink: { url: run.marks.find((mark) => mark.type === 'link')!.attrs!.href! } }
                : {}),
            },
          })),
        ]),
        {
          x: 0.7,
          y: 2.35,
          w: 11.8,
          h: 4.12,
          fontFace: font,
          fontSize: 22,
          color: 'F5F3E8',
          margin: 0,
          valign: 'top',
          paraSpaceAfter: 0,
          lineSpacingMultiple: 1.12,
        },
      );
    slide.addText(`${index + 1} / ${pages.length}`, {
      x: 10.5,
      y: 6.95,
      w: 2,
      h: 0.25,
      align: 'right',
      fontFace: font,
      fontSize: 10,
      color: 'BCCDC3',
      margin: 0,
    });
  }
  const output = await pptx.write({ outputType: 'arraybuffer' });
  return new Uint8Array(output as ArrayBuffer);
}
