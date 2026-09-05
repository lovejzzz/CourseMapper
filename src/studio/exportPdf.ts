import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Course } from './domain';
import type { MaterialDocument, MaterialBlock } from './materials';
import type { RichNode } from './richText';
import { formattedBlock } from './materialFormat';
import { materialSlides } from './exportSlides';

let fontLoad: Promise<void> | undefined;
async function pdfRuntime(cjk: boolean) {
  const { default: runtime } = await import('pdfmake/build/pdfmake');
  const pdfMake = runtime as typeof runtime & {
    addVirtualFileSystem: (fonts: Record<string, string>) => void;
    addFonts: (fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>) => void;
  };
  const { default: vfs } = await import('pdfmake/build/vfs_fonts');
  pdfMake.addVirtualFileSystem(vfs as unknown as Record<string, string>);
  if (cjk && !fontLoad)
    fontLoad = (async () => {
      const fonts: Record<string, string> = {};
      for (const weight of ['Regular', 'Bold']) {
        const filename = `NotoSansSC-${weight}.otf`;
        const response = await fetch(`${import.meta.env.BASE_URL}fonts/${filename}`);
        if (!response.ok) throw new Error('The Chinese PDF font could not be loaded. Please try the export again.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        fonts[filename] = btoa(binary);
      }
      pdfMake.addVirtualFileSystem(fonts);
      pdfMake.addFonts({
        NotoSansSC: {
          normal: 'NotoSansSC-Regular.otf',
          bold: 'NotoSansSC-Bold.otf',
          italics: 'NotoSansSC-Regular.otf',
          bolditalics: 'NotoSansSC-Bold.otf',
        },
      });
    })().catch((error) => {
      fontLoad = undefined;
      throw error;
    });
  if (cjk) await fontLoad;
  return pdfMake;
}
function richPdf(node: RichNode): Content {
  if (node.type === 'text') {
    const marks = node.marks ?? [];
    return {
      text: node.text ?? '',
      bold: marks.some((mark) => mark.type === 'bold'),
      italics: marks.some((mark) => mark.type === 'italic'),
      decoration: marks.some((mark) => mark.type === 'underline')
        ? 'underline'
        : marks.some((mark) => mark.type === 'strike')
          ? 'lineThrough'
          : undefined,
      link: marks.find((mark) => mark.type === 'link')?.attrs?.href,
    };
  }
  if (node.type === 'hardBreak') return { text: '\n' };
  const children = (node.content ?? []).map(richPdf);
  if (node.type === 'bulletList') return { ul: children, margin: [0, 4, 0, 8] };
  if (node.type === 'orderedList') return { ol: children, start: node.attrs?.start ?? 1, margin: [0, 4, 0, 8] };
  if (node.type === 'doc' || node.type === 'listItem' || node.type === 'blockquote') return { stack: children };
  return {
    text: children as ContentText[],
    ...(node.type === 'heading' ? { fontSize: 14, bold: true } : {}),
    margin: [0, 0, 0, 7],
  };
}
export function pdfDefinition(course: Course, doc: MaterialDocument): TDocumentDefinitions {
  const cjk = /[^\u0000-\u024f\u2000-\u206f]/.test(
    doc.blocks.map((block) => block.text + JSON.stringify(block.rows ?? [])).join(''),
  );
  const defaultStyle = { font: cjk ? 'NotoSansSC' : 'Roboto', fontSize: 10.5, lineHeight: 1.1 };
  if (doc.kind === 'slideDecks') {
    const pages = materialSlides(doc, course);
    return {
      pageSize: { width: 960, height: 540 },
      pageMargins: [48, 42, 48, 36],
      defaultStyle: { ...defaultStyle, color: 'F5F3E8' },
      background: { canvas: [{ type: 'rect', x: 0, y: 0, w: 960, h: 540, color: '#173C32' }] },
      content: pages.map((page, index) => ({
        stack: [
          { text: page.title, fontSize: 27, bold: true, margin: [0, 0, 0, 28] },
          ...page.runs.map((runs) => ({
            text: runs.map((run) => richPdf({ type: 'text', ...run })) as ContentText[],
            fontSize: 20,
            margin: [0, 0, 0, 14],
          })),
        ] as Content[],
        ...(index ? { pageBreak: 'before' as const } : {}),
      })),
      footer: (page, count) => ({
        text: `${doc.subtitle} · ${page}/${count}`,
        fontSize: 9,
        margin: [48, 5, 48, 0],
        color: '#BCCDC3',
      }),
    };
  }
  const formatted = (block: Pick<MaterialBlock, 'text' | 'reference'>): Content => {
    const rich = formattedBlock(course, block);
    return rich ? richPdf(rich) : { text: block.text, margin: [0, 0, 0, 5] };
  };
  const content: Content[] = [];
  let nextPage = false;
  for (const block of doc.blocks) {
    if (block.type === 'page') {
      nextPage = true;
      continue;
    }
    let entry: Content;
    if (block.type === 'table')
      entry = {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          keepWithHeaderRows: 1,
          widths: block.headers?.length === 5 ? [72, 35, 110, 110, 110] : (block.headers ?? []).map(() => '*'),
          body: [
            (block.headers ?? []).map((text) => ({ text, bold: true, fillColor: '#EAF0EC' })),
            ...(block.rows ?? []).map((row) => row.map(formatted)),
          ],
        },
        fontSize: 8.5,
        layout: 'lightHorizontalLines',
        margin: [0, 6, 0, 12],
      };
    else if (block.type === 'space')
      entry = {
        unbreakable: true,
        stack: [
          { text: block.text, fontSize: 8, color: '#58645D', margin: [0, 6, 0, 4] },
          ...Array.from({ length: block.lines ?? 3 }, () => ({
            canvas: [{ type: 'line' as const, x1: 0, y1: 22, x2: 493, y2: 22, lineWidth: 0.4, lineColor: '#BCC6C0' }],
            margin: [0, 0, 0, 2] as [number, number, number, number],
          })),
        ],
      };
    else if (block.type === 'body') entry = formatted(block);
    else
      entry = {
        text: block.text,
        fontSize: block.type === 'title' ? 21 : block.type === 'heading' ? 16 : 11.5,
        bold: true,
        margin: [0, block.type === 'title' ? 0 : 8, 0, 5],
        headlineLevel: block.type === 'title' ? 1 : 2,
      };
    if (nextPage) {
      entry = { stack: [entry], pageBreak: 'before' };
      nextPage = false;
    }
    content.push(entry);
  }
  return {
    pageSize: 'A4',
    pageMargins: [51, 48, 51, 48],
    defaultStyle,
    content,
    info: { title: `${doc.title} — ${doc.subtitle}`, author: 'EduTool' },
    pageBreakBefore: (node, following) => Boolean(node.headlineLevel && following.length === 0),
    footer: (page, count) => ({
      text: `${doc.subtitle} · ${page}/${count}`,
      alignment: 'right',
      fontSize: 8,
      color: '#58645D',
      margin: [51, 14, 51, 0],
    }),
  };
}
export async function renderMaterialPdf(course: Course, doc: MaterialDocument): Promise<Uint8Array> {
  const definition = pdfDefinition(course, doc);
  const pdfMake = await pdfRuntime(definition.defaultStyle?.font === 'NotoSansSC');
  // All fonts are already in memory. The synchronous getStream overload lets
  // layout failures reject this promise; getBuffer hides them in a callback.
  return new Promise((resolve, reject) => {
    const stream = pdfMake.createPdf(definition).getStream();
    const chunks: Uint8Array[] = [];
    let size = 0;
    stream.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk);
      size += chunk.length;
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(bytes);
    });
    stream.end();
  });
}
