import { safeImport } from './safeImport.js';

let _JSZip;

async function getJSZip() {
  if (!_JSZip) _JSZip = (await safeImport(() => import('jszip'))).default;
  return _JSZip;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function getAttr(source, name) {
  const match = source.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

export function columnName(index) {
  let current = index;
  let name = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function columnIndex(ref) {
  return ref.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function normalizeSheetName(name) {
  return (
    String(name || 'Sheet1')
      .replaceAll('\\', ' ')
      .replaceAll('/', ' ')
      .replaceAll(':', ' ')
      .replaceAll('*', ' ')
      .replaceAll('?', ' ')
      .replaceAll('[', ' ')
      .replaceAll(']', ' ')
      .trim()
      .slice(0, 31) || 'Sheet1'
  );
}

function styleId(style) {
  if (style === 'header') return 1;
  if (style === 'lesson') return 3;
  if (style === 'alt') return 4;
  if (style === 'center') return 5;
  return 2;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Inter"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Inter"/></font>
    <font><sz val="10"/><name val="Inter"/></font>
    <font><b/><sz val="10"/><name val="Inter"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F6FC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFB4C6E7"/></left>
      <right style="thin"><color rgb="FFB4C6E7"/></right>
      <top style="thin"><color rgb="FFB4C6E7"/></top>
      <bottom style="thin"><color rgb="FFB4C6E7"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="left" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function buildWorksheetXml(sheet) {
  const rows = sheet.rows || [];
  const maxCols = Math.max(sheet.columns?.length || 0, ...rows.map((row) => row.length), 1);
  const columns = Array.from({ length: maxCols }, (_, index) => sheet.columns?.[index] || {});
  const getStyle = sheet.getStyle || ((rowIndex) => (rowIndex === 0 ? 'header' : 'data'));

  const colsXml = columns
    .map((col, index) => {
      const width = Number(col.width) || 20;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const sheetDataXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const rowOpts = sheet.rowOptions?.[rowIndex] || {};
      const cells = Array.from({ length: maxCols }, (_, colIndex) => {
        const value = row[colIndex] ?? '';
        const cellRef = `${columnName(colIndex + 1)}${rowNumber}`;
        const style = styleId(getStyle(rowIndex, colIndex, value));
        return `<c r="${cellRef}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join('');
      const height = rowOpts.height ? ` ht="${rowOpts.height}" customHeight="1"` : '';
      return `<row r="${rowNumber}"${height}>${cells}</row>`;
    })
    .join('');

  const frozenRows = Number(sheet.frozenRows) || 0;
  const viewXml =
    frozenRows > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  const mergeXml = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${escapeXml(ref)}"/>`).join('')}</mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${viewXml}
  <cols>${colsXml}</cols>
  <sheetData>${sheetDataXml}</sheetData>
  ${mergeXml}
</worksheet>`;
}

export async function buildXlsxWorkbook({ sheets, creator = 'Course Mapper', title = 'Course Mapper Export' }) {
  const JSZip = await getJSZip();
  const zip = new JSZip();
  const safeSheets = (sheets?.length ? sheets : [{ name: 'Sheet1', rows: [[]] }]).map((sheet) => ({
    ...sheet,
    name: normalizeSheetName(sheet.name),
  }));

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${safeSheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('\n  ')}
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );

  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${escapeXml(creator)}</dc:creator>
  <dc:title>${escapeXml(title)}</dc:title>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`,
  );

  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Course Mapper</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
</Properties>`,
  );

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safeSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('\n    ')}
  </sheets>
</workbook>`,
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('\n  ')}
  <Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  zip.file('xl/styles.xml', buildStylesXml());
  safeSheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, buildWorksheetXml(sheet));
  });

  return await zip.generateAsync({ type: 'arraybuffer', mimeType: XLSX_MIME });
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  const siPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let siMatch = siPattern.exec(xml);
  while (siMatch) {
    const parts = [];
    const tPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let tMatch = tPattern.exec(siMatch[1]);
    while (tMatch) {
      parts.push(decodeXml(tMatch[1]));
      tMatch = tPattern.exec(siMatch[1]);
    }
    strings.push(parts.join(''));
    siMatch = siPattern.exec(xml);
  }
  return strings;
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const rels = new Map();
  const relPattern = /<Relationship\b([^>]*)\/>/gi;
  let relMatch = relPattern.exec(relsXml || '');
  while (relMatch) {
    const attrs = relMatch[1];
    rels.set(getAttr(attrs, 'Id'), getAttr(attrs, 'Target'));
    relMatch = relPattern.exec(relsXml || '');
  }

  const sheets = [];
  const sheetPattern = /<sheet\b([^>]*)\/>/gi;
  let sheetMatch = sheetPattern.exec(workbookXml || '');
  while (sheetMatch) {
    const attrs = sheetMatch[1];
    const relId = getAttr(attrs, 'r:id');
    const target = rels.get(relId) || `worksheets/sheet${sheets.length + 1}.xml`;
    sheets.push({
      name: getAttr(attrs, 'name') || `Sheet${sheets.length + 1}`,
      path: target.startsWith('xl/') ? target : `xl/${target}`,
    });
    sheetMatch = sheetPattern.exec(workbookXml || '');
  }
  return sheets.length ? sheets : [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }];
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
  let match = cellPattern.exec(xml || '');
  while (match) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const ref = getAttr(attrs, 'r');
    const refMatch = ref.match(/^([A-Z]+)(\d+)$/i);
    if (!refMatch) {
      match = cellPattern.exec(xml || '');
      continue;
    }

    const rowIndex = Number(refMatch[2]) - 1;
    const colIndex = columnIndex(refMatch[1].toUpperCase()) - 1;
    const type = getAttr(attrs, 't');
    let value = '';

    if (type === 's') {
      const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
      value = sharedStrings[Number(valueMatch?.[1] || 0)] || '';
    } else if (type === 'inlineStr') {
      const parts = [];
      const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
      let textMatch = textPattern.exec(body);
      while (textMatch) {
        parts.push(decodeXml(textMatch[1]));
        textMatch = textPattern.exec(body);
      }
      value = parts.join('');
    } else {
      const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
      value = decodeXml(valueMatch?.[1] || '');
    }

    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex][colIndex] = value;
    match = cellPattern.exec(xml || '');
  }

  const maxCol = rows.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  return rows.map((row) => Array.from({ length: maxCol }, (_, index) => row?.[index] || ''));
}

export async function readXlsxSheets(fileOrBuffer) {
  const JSZip = await getJSZip();
  const buffer = fileOrBuffer?.arrayBuffer ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const sharedStrings = parseSharedStrings(sharedXml);
  const sheets = parseWorkbookSheets(workbookXml, relsXml);

  const parsed = [];
  for (const sheet of sheets) {
    const file = zip.file(sheet.path);
    if (!file) continue;
    parsed.push({
      name: sheet.name,
      rows: parseSheetRows(await file.async('text'), sharedStrings),
    });
  }
  return parsed;
}

export async function readFirstXlsxSheetRows(fileOrBuffer) {
  const sheets = await readXlsxSheets(fileOrBuffer);
  return sheets[0]?.rows || [];
}
