import { newId, SourceSchema, type Source } from './domain';

export async function readSourceFile(file: File): Promise<Source[]> {
  if (file.size > 20_000_000) throw new Error(`${file.name}: files must be smaller than 20 MB.`);
  const source = (title: string, text: string): Source =>
    SourceSchema.parse({ id: newId('source'), version: 1, kind: 'provided', title, text });
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      if (pdf.numPages > 80) throw new Error('Select a PDF of at most 80 pages or split it into smaller readings.');
      const pages: Source[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('')
          .trim();
        if (text) pages.push(source(`${file.name} · page ${n}`, text));
      }
      if (!pages.length)
        throw new Error('This PDF has no extractable text. Supply a text transcript for scanned pages.');
      if (pages.reduce((n, p) => n + p.text.length, 0) > 60000)
        throw new Error('Choose the relevant pages: extracted text exceeds 60,000 characters.');
      return pages;
    } finally {
      await pdf.destroy();
    }
  }
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return [source(file.name, result.value.trim())];
  }
  if (!/\.(txt|md|csv)$/i.test(file.name)) throw new Error('Use PDF, DOCX, TXT, Markdown or CSV source files.');
  return [source(file.name, (await file.text()).trim())];
}
