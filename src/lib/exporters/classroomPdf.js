import { _buildDocxContentShared, buildDocxTitleChildren } from './docxExporter.js';
import { resolveFeatureLabel } from './exporterUtils.js';

// Reuse the Word content builder so PDF carries the same source ledger,
// worked steps, response paper and separately paginated teacher key.
// This adapter translates document primitives, never the teaching text.
const color = (value) => (value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined);
class TextRun {
  constructor(options = {}) {
    if (typeof options === 'string') options = { text: options };
    return {
      text: `${'\n'.repeat(options.break || 0)}${options.text ?? ''}`,
      bold: options.bold,
      italics: options.italics,
      fontSize: options.size ? Math.max(9, options.size / 2) : undefined,
      color: color(options.color),
      decoration: options.underline ? 'underline' : options.strike ? 'lineThrough' : undefined,
    };
  }
}
class PageBreak {
  constructor() {
    return { pageBreak: 'after', text: '' };
  }
}
class Paragraph {
  constructor(options = {}) {
    if (typeof options === 'string') options = { text: options };
    const runs = options.children || [{ text: options.text || '' }];
    if (runs.some((run) => run.pageBreak)) return { text: '', pageBreak: 'after' };
    return {
      ...(options.bullet ? { ul: [{ text: runs }], type: 'disc' } : { text: runs }),
      alignment: options.alignment,
      headlineLevel: options.heading ? 1 : undefined,
      _keepNext: options.keepNext === true,
      pageBreak: options.pageBreakBefore ? 'before' : undefined,
      margin: [options.bullet ? 12 : 0, (options.spacing?.before || 0) / 20, 0, (options.spacing?.after || 0) / 20],
    };
  }
}
class TableCell {
  constructor(options = {}) {
    return { stack: options.children || [{ text: '' }], fillColor: color(options.shading?.fill) };
  }
}
class TableRow {
  constructor(options = {}) {
    return { cells: options.children || [], header: options.tableHeader === true };
  }
}
class Table {
  constructor(options = {}) {
    const rows = options.rows || [];
    const columns = options.columnWidths || rows[0]?.cells.map(() => 1) || [];
    const total = columns.reduce((sum, width) => sum + width, 0);
    return {
      table: {
        headerRows: rows[0]?.header ? 1 : 0,
        // Percentage widths fit both portrait pages and nested layouts.
        widths: columns.map((width) => `${(width / total) * 100}%`),
        body: rows.map((row) => row.cells),
      },
      layout: 'lightHorizontalLines',
      margin: [0, 4, 0, 8],
    };
  }
}
const documentAdapter = {
  Paragraph,
  TextRun,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  HeadingLevel: { TITLE: 'title', HEADING_1: 'h1', HEADING_2: 'h2', HEADING_3: 'h3' },
  AlignmentType: { CENTER: 'center', LEFT: 'left', RIGHT: 'right' },
  BorderStyle: { SINGLE: 'single', NONE: 'none' },
  WidthType: { DXA: 'dxa', PERCENTAGE: 'pct' },
  ShadingType: { CLEAR: 'clear' },
  TableLayoutType: { FIXED: 'fixed' },
};

function visibleTextLength(node) {
  if (typeof node === 'string') return node.length;
  if (Array.isArray(node)) return node.reduce((sum, entry) => sum + visibleTextLength(entry), 0);
  if (!node || typeof node !== 'object') return 0;
  return visibleTextLength(node.text || node.ul || node.stack || node.table?.body || []);
}

function keepHeadingWithContent(content) {
  const result = [];
  for (let index = 0; index < content.length; index++) {
    const item = content[index];
    const next = content[index + 1];
    // Keep a heading with an ordinary paragraph or small criterion table.
    // Oversized authored sections must retain normal page flow.
    if (item._keepNext && next && !next.pageBreak && visibleTextLength(next) < 1500) {
      result.push({
        stack: [{ ...item, pageBreak: undefined }, next],
        unbreakable: true,
        pageBreak: item.pageBreak,
      });
      index++;
    } else result.push(item);
  }
  return result;
}

export function classroomPdfDefinition(content, courseName, label, options = {}) {
  return {
    pageSize: 'A4',
    pageMargins: [36, 30, 36, 36],
    ...options,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1, color: '#333333' },
    info: { title: `${courseName || 'Course'} — ${label}`, creator: 'EduTool' },
    content: keepHeadingWithContent(content),
    footer: (page, count) => ({
      text: `${label} · ${page} / ${count}`,
      alignment: 'right',
      fontSize: 8,
      color: '#596779',
      margin: [36, 10, 36, 0],
    }),
    pageBreakBefore: (node, following) => node.headlineLevel && following.length === 0,
  };
}

export function deliverablePdfDefinition(featureId, data, courseName) {
  const label = resolveFeatureLabel(featureId);
  const content = buildDocxTitleChildren(documentAdapter, courseName, label, { compact: true });
  _buildDocxContentShared(featureId, data, content, { ...documentAdapter, exportTitle: courseName });
  // Legacy six-column rubric matrices need a wider sheet; shared-task
  // rubrics already use individual two-column criterion tables.
  const landscape = content.some((item) => item.table?.widths.length >= 6);
  return classroomPdfDefinition(content, courseName, label, { pageOrientation: landscape ? 'landscape' : 'portrait' });
}

let runtimePromise;
let cjkPromise;
let symbolsPromise;
const fontFiles = {};
function registerFontFiles(pdfMake, files) {
  // In pdfmake 0.2 addVirtualFileSystem replaces the VFS, despite its name.
  Object.assign(fontFiles, files);
  pdfMake.addVirtualFileSystem(fontFiles);
}
const symbolPattern = /([←↑→↓↔↕↖↗↘↙↸↹⇄⇅⇆⇋⇌⇐⇒⇔⇦⇧⇨⇩⇵✓]+)/u;

function withSymbolRuns(node) {
  if (Array.isArray(node)) return node.map(withSymbolRuns);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      key === 'text' && typeof value === 'string' && symbolPattern.test(value)
        ? value
            .split(symbolPattern)
            .filter(Boolean)
            .map((text) => ({ text, ...(symbolPattern.test(text) ? { font: 'CourseSymbols' } : {}) }))
        : withSymbolRuns(value),
    ]),
  );
}

async function loadSymbols(pdfMake) {
  if (!symbolsPromise)
    symbolsPromise = (async () => {
      // 3.4 KiB subset of the already licensed Noto font; an English arrow
      // must not require downloading the full Chinese font family.
      const { default: url } = await import('../../../studio-public/fonts/NotoSansSC-Symbols.otf?url&no-inline');
      const response = await fetch(url);
      if (!response.ok) throw new Error('The PDF symbols could not be loaded. Please retry the export.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const encoded = btoa(String.fromCharCode(...bytes));
      registerFontFiles(pdfMake, { 'CourseSymbols.otf': encoded });
      pdfMake.addFonts({
        CourseSymbols: {
          normal: 'CourseSymbols.otf',
          bold: 'CourseSymbols.otf',
          italics: 'CourseSymbols.otf',
          bolditalics: 'CourseSymbols.otf',
        },
      });
    })().catch((error) => {
      symbolsPromise = undefined;
      throw error;
    });
  await symbolsPromise;
}

async function loadRuntime(cjk) {
  if (!runtimePromise)
    runtimePromise = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([runtime, fonts]) => {
        const pdfMake = runtime.default;
        registerFontFiles(pdfMake, fonts.default);
        // Register the default explicitly: addFonts otherwise creates an
        // explicit map containing only the later CJK/symbol font, disabling
        // pdfmake's implicit Roboto fallback for subsequent English exports.
        pdfMake.addFonts({
          Roboto: {
            normal: 'Roboto-Regular.ttf',
            bold: 'Roboto-Medium.ttf',
            italics: 'Roboto-Italic.ttf',
            bolditalics: 'Roboto-MediumItalic.ttf',
          },
        });
        return pdfMake;
      })
      .catch((error) => {
        runtimePromise = undefined;
        throw error;
      });
  const pdfMake = await runtimePromise;
  if (cjk && !cjkPromise)
    cjkPromise = (async () => {
      const [regular, bold] = await Promise.all([
        import('../../../studio-public/fonts/NotoSansSC-Regular.otf?url'),
        import('../../../studio-public/fonts/NotoSansSC-Bold.otf?url'),
      ]);
      const vfs = {};
      for (const [name, url] of [
        ['NotoSansSC-Regular.otf', regular.default],
        ['NotoSansSC-Bold.otf', bold.default],
      ]) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('The Chinese PDF font could not be loaded. Please retry the export.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        vfs[name] = btoa(binary);
      }
      registerFontFiles(pdfMake, vfs);
      pdfMake.addFonts({
        NotoSansSC: {
          normal: 'NotoSansSC-Regular.otf',
          bold: 'NotoSansSC-Bold.otf',
          italics: 'NotoSansSC-Regular.otf',
          bolditalics: 'NotoSansSC-Bold.otf',
        },
      });
    })().catch((error) => {
      cjkPromise = undefined;
      throw error;
    });
  if (cjk) await cjkPromise;
  return pdfMake;
}

export async function buildClassroomPdfBlob(definition) {
  const cjk = /[\u2e80-\u9fff\uf900-\ufaff]/u.test(JSON.stringify(definition.content));
  const runtime = await loadRuntime(cjk);
  const needsSymbols = !cjk && symbolPattern.test(JSON.stringify(definition.content));
  if (needsSymbols) await loadSymbols(runtime);
  const document = {
    ...definition,
    content: needsSymbols ? withSymbolRuns(definition.content) : definition.content,
    defaultStyle: { ...definition.defaultStyle, font: cjk ? 'NotoSansSC' : 'Roboto' },
  };
  return new Promise((resolve, reject) => {
    try {
      // All fonts are already in the VFS; synchronous stream construction
      // lets malformed document errors reject the export instead of escaping
      // pdfmake's callback promise and leaving the UI spinning.
      const stream = runtime.createPdf(document).getStream();
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(new Uint8Array(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
      stream.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function downloadClassroomPdf(definition, filename) {
  const blob = await buildClassroomPdfBlob(definition);
  const { getSaveAs } = await import('./exporterUtils.js');
  (await getSaveAs())(blob, filename);
  return filename;
}
