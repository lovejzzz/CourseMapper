import type { MaterialDocument } from './materials';
import { escaped } from './richText';

type SheetRow = { values: string[]; heading?: boolean };
/** Splitting long prose into consecutive rows avoids Excel's 32,767-character
 * cell limit and preserves readable row heights without silently truncating. */
function proseRows(text: string, heading = false): SheetRow[] {
  const parts = text.match(/[\s\S]{1,600}/g) ?? [''];
  return parts.map((part) => ({ values: [part], heading }));
}
export function materialRows(doc: MaterialDocument): SheetRow[] {
  return doc.blocks.flatMap((block): SheetRow[] => {
    if (block.type === 'page' || block.type === 'space') return [];
    if (block.type === 'table')
      return [
        { values: block.headers ?? [], heading: true },
        ...(block.rows ?? []).flatMap((row) => {
          const chunks = row.map((cell) => cell.text.match(/[\s\S]{1,350}/g) ?? ['']);
          return Array.from({ length: Math.max(...chunks.map((parts) => parts.length)) }, (_, i) => ({
            values: chunks.map((parts) => parts[i] ?? ''),
          }));
        }),
      ];
    return proseRows(block.text, block.type !== 'body');
  });
}
function safeCsvCell(text: string): string {
  // Quoting alone does not stop spreadsheet formula execution.
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function renderMaterialCsv(doc: MaterialDocument): string {
  return (
    '\ufeff' +
    materialRows(doc)
      .map((row) => row.values.map(safeCsvCell).join(','))
      .join('\r\n')
  );
}
function column(index: number): string {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function xml(text: string): string {
  return escaped(text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''));
}
export async function renderMaterialXlsx(doc: MaterialDocument): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const rows = materialRows(doc);
  const columns = Math.max(2, ...rows.map((row) => row.values.length));
  const width = Math.min(52, 160 / columns);
  const merges: string[] = [];
  const sheet = rows
    .map((row, index) => {
      const n = index + 1;
      if (row.values.length === 1) merges.push(`A${n}:${column(columns - 1)}${n}`);
      const availableWidth = row.values.length === 1 ? width * columns : width;
      const lines = Math.max(
        ...row.values.map((value) =>
          value
            .split('\n')
            .reduce(
              (sum, line) =>
                sum +
                Math.max(
                  1,
                  Math.ceil([...line].reduce((s, char) => s + (/[^\x00-\xff]/.test(char) ? 2 : 1), 0) / availableWidth),
                ),
              0,
            ),
        ),
      );
      return `<row r="${n}" ht="${Math.min(409, Math.max(24, lines * 15 + 10))}" customHeight="1">${row.values.map((text, i) => `<c r="${column(i)}${n}" t="inlineStr" s="${row.heading ? 1 : 0}"><is><t xml:space="preserve">${xml(text)}</t></is></c>`).join('')}</row>`;
    })
    .join('');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(doc.subtitle.slice(0, 31).replace(/[\\/?*\[\]:]/g, ' '))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0EC"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${columns}" width="${width}" customWidth="1"/></cols><sheetData>${sheet}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
