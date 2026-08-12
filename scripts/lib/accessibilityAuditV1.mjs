import crypto from 'node:crypto';
import path from 'node:path';

import JSZip from 'jszip';

import {
  extractPptxStructuralObjectTags,
  pptxSemanticDescriptionIsMeaningful,
} from '../../src/lib/exportRenderedTextAudit.js';

export const PACKAGE_ACCESSIBILITY_AUDIT_V1_PROTOCOL = 'coursemapper-package-accessibility-audit-v1';

const OFFICE_PATTERN = /\.(?:docx|pptx|xlsx)$/i;
const GENERIC_SHEET_NAME = /^(?:sheet|worksheet)\s*\d*$/i;
const MINIMUM_TEXT_CONTRAST = 4.5;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalSha256(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function attribute(tag, name) {
  return decodeXml(String(tag || '').match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '').trim();
}

function visibleText(xml, tag = 'w:t') {
  return [...String(xml || '').matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map((match) =>
      decodeXml(match[1])
        .replace(/<[^>]+>/g, '')
        .trim(),
    )
    .filter(Boolean);
}

function normalizedHex(value, fallback = '') {
  const candidate = String(value || '')
    .replace(/^#/, '')
    .replace(/^FF(?=[0-9A-F]{6}$)/i, '')
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(candidate) ? candidate : fallback;
}

function relativeLuminance(hex) {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function textContrastRatio(foreground, background) {
  const foregroundHex = normalizedHex(foreground);
  const backgroundHex = normalizedHex(background);
  if (!foregroundHex || !backgroundHex) return null;
  const values = [relativeLuminance(foregroundHex), relativeLuminance(backgroundHex)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function explicitColor(xml, pattern, fallback) {
  return normalizedHex(String(xml || '').match(pattern)?.[1], fallback);
}

function contrastRecord({ foreground, background, location, minimum = MINIMUM_TEXT_CONTRAST }) {
  const ratio = textContrastRatio(foreground, background);
  return {
    foreground,
    background,
    ratio: Number((ratio || 0).toFixed(2)),
    minimum,
    location,
    status: ratio >= minimum ? 'passed' : 'failed',
  };
}

function docxContrastRecords(documentXml) {
  const records = [];
  const inspectRuns = (xml, background, location) => {
    for (const [index, run] of (String(xml || '').match(/<w:r\b[\s\S]*?<\/w:r>/g) || []).entries()) {
      if (visibleText(run).join('').length === 0) continue;
      const foreground = explicitColor(run, /<w:color\b[^>]*w:val="([0-9A-Fa-f]{6})"/, '000000');
      records.push(contrastRecord({ foreground, background, location: `${location}/run-${index + 1}` }));
    }
  };
  let remainder = String(documentXml || '');
  for (const [index, cell] of (remainder.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []).entries()) {
    const background = explicitColor(cell, /<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/, 'FFFFFF');
    inspectRuns(cell, background, `table-cell-${index + 1}`);
  }
  remainder = remainder.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, '');
  inspectRuns(remainder, 'FFFFFF', 'document');
  return records;
}

function pptxBounds(block) {
  const transform = String(block || '').match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/)?.[0] || '';
  const offset = transform.match(/<a:off\b[^>]*x="(\d+)"[^>]*y="(\d+)"/) || [];
  const extent = transform.match(/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/) || [];
  return offset.length && extent.length
    ? { x: Number(offset[1]), y: Number(offset[2]), width: Number(extent[1]), height: Number(extent[2]) }
    : null;
}

function overlapShare(inner, outer) {
  if (!inner || !outer || inner.width <= 0 || inner.height <= 0) return 0;
  const width = Math.max(0, Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x));
  const height = Math.max(0, Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y));
  return (width * height) / (inner.width * inner.height);
}

function pptxPaint(block) {
  const shapeProperties = String(block || '').match(/<p:spPr\b[\s\S]*?<\/p:spPr>/)?.[0] || '';
  if (!shapeProperties || /<a:noFill\s*\/>/.test(shapeProperties)) return null;
  const fill = shapeProperties.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/)?.[0] || '';
  const color = explicitColor(fill, /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/, '');
  const alpha = Math.min(1, Math.max(0, Number(fill.match(/<a:alpha\b[^>]*val="(\d+)"/)?.[1] || 100000) / 100000));
  return color ? { color, alpha, bounds: pptxBounds(block) } : null;
}

function compositeHex(foreground, background, alpha = 1) {
  const channels = [0, 2, 4].map((offset) =>
    Math.round(
      Number.parseInt(foreground.slice(offset, offset + 2), 16) * alpha +
        Number.parseInt(background.slice(offset, offset + 2), 16) * (1 - alpha),
    ),
  );
  return channels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function pptxTextMinimum(run) {
  const properties = String(run || '').match(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*>/)?.[0] || '';
  const points = Number(attribute(properties, 'sz') || 0) / 100;
  const bold = attribute(properties, 'b') === '1';
  return points >= 18 || (bold && points >= 14) ? 3 : MINIMUM_TEXT_CONTRAST;
}

function pptxContrastRecords(slideXml, slideNumber) {
  const records = [];
  const slideBackground = explicitColor(
    String(slideXml || '').match(/<p:bg\b[\s\S]*?<\/p:bg>/)?.[0],
    /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/,
    'FFFFFF',
  );
  const blocks = pptxObjectBlocks(slideXml);
  const paints = blocks.map(pptxPaint);
  for (const [index, block] of blocks.entries()) {
    if (visibleText(block, 'a:t').join('').length === 0) continue;
    if (block.startsWith('<p:graphicFrame') && /<a:tbl\b/.test(block)) {
      for (const [cellIndex, cell] of (block.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).entries()) {
        const cellProperties = cell.match(/<a:tcPr\b[\s\S]*?<\/a:tcPr>/)?.[0] || '';
        const cellFills = cellProperties.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/g) || [];
        const background = explicitColor(cellFills.at(-1), /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/, slideBackground);
        for (const [runIndex, run] of (cell.match(/<a:r\b[\s\S]*?<\/a:r>/g) || []).entries()) {
          if (visibleText(run, 'a:t').join('').length === 0) continue;
          const foreground = explicitColor(run, /<a:rPr\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/, '000000');
          records.push(
            contrastRecord({
              foreground,
              background,
              location: `slide-${slideNumber}/table-${index + 1}/cell-${cellIndex + 1}/run-${runIndex + 1}`,
              minimum: pptxTextMinimum(run),
            }),
          );
        }
      }
      continue;
    }
    const ownPaint = pptxPaint(block);
    const bounds = pptxBounds(block);
    const underlays = paints
      .slice(0, index)
      .map((paint, paintIndex) => ({ paint, paintIndex }))
      .filter(({ paint }) => paint?.bounds && overlapShare(bounds, paint.bounds) >= 0.8);
    const underlayBackground = underlays.reduce(
      (background, { paint }) => compositeHex(paint.color, background, paint.alpha),
      slideBackground,
    );
    const background = ownPaint ? compositeHex(ownPaint.color, underlayBackground, ownPaint.alpha) : underlayBackground;
    const textRuns = block.match(/<a:r\b[\s\S]*?<\/a:r>/g) || [];
    if (textRuns.length === 0) {
      const foreground = explicitColor(
        block,
        /<a:(?:defRPr|endParaRPr)\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/,
        '000000',
      );
      records.push(
        contrastRecord({
          foreground,
          background,
          location: `slide-${slideNumber}/object-${index + 1}`,
          minimum: pptxTextMinimum(block),
        }),
      );
      continue;
    }
    for (const [runIndex, run] of textRuns.entries()) {
      if (visibleText(run, 'a:t').join('').length === 0) continue;
      const foreground = explicitColor(
        run,
        /<a:(?:rPr|defRPr|endParaRPr)\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/,
        explicitColor(block, /<a:defRPr\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/, '000000'),
      );
      records.push(
        contrastRecord({
          foreground,
          background,
          location: `slide-${slideNumber}/object-${index + 1}/run-${runIndex + 1}`,
          minimum: pptxTextMinimum(run),
        }),
      );
    }
  }
  return records;
}

function contrastFindings(records) {
  return records
    .filter((record) => record.status === 'failed')
    .map((record) => ({
      code: 'text-contrast-below-aa',
      observation: `${record.location} uses #${record.foreground} on #${record.background} at ${record.ratio}:1; ${record.minimum}:1 is required.`,
    }));
}

async function analyzeDocx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  const findings = [];
  if (!documentXml) {
    findings.push({ code: 'missing-document-xml', observation: 'The DOCX has no word/document.xml part.' });
    return { status: 'failed', metrics: {}, findings };
  }

  const headingLevels = [
    ...documentXml.matchAll(/<w:p\b[\s\S]*?<w:pStyle\b[^>]*w:val="(Title|Heading([1-6]))"[^>]*>[\s\S]*?<\/w:p>/g),
  ].map((match) => (match[1] === 'Title' ? 1 : Number(match[2])));
  const contrast = docxContrastRecords(documentXml);
  findings.push(...contrastFindings(contrast));
  if (headingLevels.length === 0) {
    findings.push({ code: 'no-heading-structure', observation: 'No Title or Heading 1–6 paragraph is present.' });
  }
  for (let index = 1; index < headingLevels.length; index += 1) {
    if (headingLevels[index] > headingLevels[index - 1] + 1) {
      findings.push({
        code: 'heading-level-skip',
        observation: `Heading level ${headingLevels[index - 1]} is followed by level ${headingLevels[index]}.`,
      });
      break;
    }
  }

  let multirowTableCount = 0;
  let semanticHeaderTableCount = 0;
  for (const tableXml of documentXml.split('<w:tbl>').slice(1)) {
    const rowCount = tableXml.match(/<w:tr(?:\s[^>]*)?>/g)?.length || 0;
    if (rowCount < 2) continue;
    multirowTableCount += 1;
    const firstRow = tableXml.split('</w:tr>')[0] || '';
    if (/<w:tblHeader(?:\s[^>]*)?\/?\s*>/.test(firstRow)) semanticHeaderTableCount += 1;
    else {
      findings.push({
        code: 'table-without-header-semantics',
        observation: `Multirow table ${multirowTableCount} does not mark its first row as a repeating semantic header.`,
      });
    }
  }

  let hyperlinkCount = 0;
  for (const hyperlink of documentXml.match(/<w:hyperlink\b[\s\S]*?<\/w:hyperlink>/g) || []) {
    hyperlinkCount += 1;
    const label = visibleText(hyperlink).join(' ').replace(/\s+/g, ' ').trim();
    if (!label || /^(?:click here|here|link)$/i.test(label)) {
      findings.push({
        code: 'hyperlink-without-readable-label',
        observation: `Hyperlink ${hyperlinkCount} has no descriptive reader-visible label.`,
      });
    }
  }

  const drawingTags = [...documentXml.matchAll(/<wp:docPr\b[^>]*>/g)].map((match) => match[0]);
  let meaningfulDrawingDescriptionCount = 0;
  for (const [index, tag] of drawingTags.entries()) {
    const description = attribute(tag, 'descr') || attribute(tag, 'title');
    if (description && !/^(?:image|picture|graphic|decorative)$/i.test(description)) {
      meaningfulDrawingDescriptionCount += 1;
    } else {
      findings.push({
        code: 'drawing-without-meaningful-description',
        observation: `Drawing ${index + 1} has no meaningful alternative description.`,
      });
    }
  }
  const footerCount = Object.keys(zip.files).filter((name) => /^word\/footer\d*\.xml$/.test(name)).length;
  if (footerCount === 0) findings.push({ code: 'no-footer', observation: 'The document has no footer part.' });

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    metrics: {
      headingCount: headingLevels.length,
      multirowTableCount,
      semanticHeaderTableCount,
      hyperlinkCount,
      drawingCount: drawingTags.length,
      meaningfulDrawingDescriptionCount,
      footerCount,
      textContrast: {
        checkedPairCount: contrast.length,
        passedPairCount: contrast.filter((record) => record.status === 'passed').length,
        minimumRatio: contrast.length ? Math.min(...contrast.map((record) => record.ratio)) : null,
        records: contrast,
      },
    },
    findings,
  };
}

function pptxObjectBlocks(xml) {
  return [...String(xml || '').matchAll(/<p:(sp|pic|cxnSp|graphicFrame)\b[\s\S]*?<\/p:\1>/g)].map((match) => match[0]);
}

function functionalVisualRecoveryEvidence(tags = []) {
  const records = tags
    .map((tag) => ({ name: attribute(tag, 'name'), description: attribute(tag, 'descr') }))
    .filter(
      (record) =>
        /^(?:cmViz|cmEntity_|cmRelation_|cmInvariant_|cmSpecimen)/i.test(record.name) &&
        record.name !== 'cmVizLayer' &&
        !/^decorative\b/i.test(record.description),
    );
  if (records.length === 0) return null;
  const corpus = records.map((record) => record.description).join(' ');
  const names = records.map((record) => record.name).join(' ');
  const dataVisual = /(?:Chart|Scatter|DotPlot|Contingency|NumberLine|Interval|Sampling|Table|Matrix)/i.test(names);
  const entityCount = records.filter(
    (record) =>
      /(?:Hub|Spoke|Entity_|Point|Marker|Unit|Bar|Focal|Anchor|Frame)/i.test(record.name) &&
      /(?:central(?: course)? concept|related idea|observable entity|point|marker|unit|bar|focal|anchor|frame|node)/i.test(
        record.description,
      ),
  ).length;
  const relationCount = records.filter(
    (record) =>
      /(?:Conn|Relation_|Direction|RegressionLine|Interval|Sampling|Chart|Scatter|DotPlot|Contingency|NumberLine|Table|Matrix)/i.test(
        record.name,
      ) &&
      /(?:connector|relation|from .+ to|toward|through|interval|selected|chart|plot|table|matrix|compar|rows: .+ means |options: .+(?:;|$))/i.test(
        record.description,
      ),
  ).length;
  const quantitativeDetail =
    /(?:\b-?\d+(?:\.\d+)?\b|largest|medium|smallest|selected|not selected)/i.test(corpus) ||
    /(?:rows|options): .+(?:;| means )/i.test(corpus);
  const passed = dataVisual ? relationCount >= 1 && quantitativeDetail : entityCount >= 2 && relationCount >= 1;
  return {
    status: passed ? 'passed' : 'failed',
    mode: dataVisual ? 'data-relationship-recovery' : 'entity-relationship-recovery',
    semanticObjectCount: records.length,
    entityDescriptionCount: entityCount,
    relationDescriptionCount: relationCount,
    quantitativeDetailPresent: quantitativeDetail,
  };
}

async function analyzePptx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const findings = [];
  if (slideNames.length === 0)
    findings.push({ code: 'no-slides', observation: 'The PPTX contains no slide XML parts.' });
  let pictureCount = 0;
  let meaningfulPictureDescriptionCount = 0;
  let semanticObjectCount = 0;
  let meaningfulSemanticObjectCount = 0;
  let slidesWithReadingOrderProxy = 0;
  let functionalVisualSlideCount = 0;
  let nonvisualRecoveryPassedSlideCount = 0;
  const nonvisualRecovery = [];
  const contrast = [];

  for (const [slideIndex, slideName] of slideNames.entries()) {
    const xml = await zip.file(slideName).async('string');
    contrast.push(...pptxContrastRecords(xml, slideIndex + 1));
    const objects = pptxObjectBlocks(xml);
    let firstTextIndex = -1;
    let firstSemanticIndex = -1;
    for (const [objectIndex, block] of objects.entries()) {
      const tag = block.match(/<(?:p|pic):cNvPr\b[^>]*>/)?.[0] || '';
      const name = attribute(tag, 'name');
      const description = attribute(tag, 'descr');
      const text = visibleText(block, 'a:t').join(' ').trim();
      if (text && firstTextIndex < 0) firstTextIndex = objectIndex;
      if (/^cmViz/i.test(name) && firstSemanticIndex < 0) firstSemanticIndex = objectIndex;
      if (block.startsWith('<p:pic')) {
        pictureCount += 1;
        if (description && !/^(?:image|picture|graphic|decorative)$/i.test(description)) {
          meaningfulPictureDescriptionCount += 1;
        } else {
          findings.push({
            code: 'image-without-meaningful-alt',
            observation: `Slide ${slideIndex + 1} picture “${name || pictureCount}” has no meaningful alternative text.`,
          });
        }
      }
    }
    const structuralTags = extractPptxStructuralObjectTags(xml);
    for (const tag of structuralTags) {
      if (!/^cmViz/i.test(attribute(tag, 'name')) || attribute(tag, 'name') === 'cmVizLayer') continue;
      semanticObjectCount += 1;
      if (pptxSemanticDescriptionIsMeaningful(tag)) meaningfulSemanticObjectCount += 1;
      else {
        findings.push({
          code: 'semantic-object-description-not-meaningful',
          observation: `Slide ${slideIndex + 1} semantic object “${attribute(tag, 'name') || semanticObjectCount}” has no meaningful description.`,
        });
      }
    }
    const recovery = functionalVisualRecoveryEvidence(structuralTags);
    if (recovery) {
      functionalVisualSlideCount += 1;
      nonvisualRecovery.push({ slideNumber: slideIndex + 1, ...recovery });
      if (recovery.status === 'passed') nonvisualRecoveryPassedSlideCount += 1;
      else {
        findings.push({
          code: 'functional-visual-nonvisual-recovery-missing',
          observation: `Slide ${slideIndex + 1} descriptions do not recover both the visual entities/data and their functional relationship.`,
        });
      }
    }
    if (firstTextIndex >= 0 && (firstSemanticIndex < 0 || firstTextIndex < firstSemanticIndex)) {
      slidesWithReadingOrderProxy += 1;
    } else {
      findings.push({
        code: 'reading-order-proxy-failed',
        observation: `Slide ${slideIndex + 1} does not place reader-visible orienting text before its first semantic visual.`,
      });
    }
  }
  findings.push(...contrastFindings(contrast));

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    metrics: {
      slideCount: slideNames.length,
      slidesWithReadingOrderProxy,
      pictureCount,
      meaningfulPictureDescriptionCount,
      semanticObjectCount,
      meaningfulSemanticObjectCount,
      functionalVisualSlideCount,
      nonvisualRecoveryPassedSlideCount,
      nonvisualRecovery,
      textContrast: {
        checkedPairCount: contrast.length,
        passedPairCount: contrast.filter((record) => record.status === 'passed').length,
        minimumRatio: contrast.length ? Math.min(...contrast.map((record) => record.ratio)) : null,
        records: contrast,
      },
    },
    findings,
  };
}

function relationshipTargets(xml) {
  return new Map(
    [...String(xml || '').matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

async function analyzeXlsx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const stylesXml = (await zip.file('xl/styles.xml')?.async('string')) || '';
  const findings = [];
  if (!workbookXml || !relsXml) {
    findings.push({ code: 'missing-workbook-structure', observation: 'The XLSX lacks workbook or relationship XML.' });
    return { status: 'failed', metrics: {}, findings };
  }
  const targets = relationshipTargets(relsXml);
  const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?\s*>/g)].map(
    (match) => ({ name: decodeXml(match[1]).trim(), relationshipId: match[2] }),
  );
  const normalizedNames = sheets.map((sheet) => sheet.name.toLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    findings.push({ code: 'duplicate-sheet-name', observation: 'Worksheet names are not unique.' });
  }
  let sheetsWithContent = 0;
  let sheetsWithHeaderLabels = 0;
  let sheetsWithFrozenPane = 0;
  const contrast = [];
  const fontBlocks = stylesXml.match(/<font\b[\s\S]*?<\/font>/g) || [];
  const fillBlocks = stylesXml.match(/<fill\b[\s\S]*?<\/fill>/g) || [];
  const cellXfsXml = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || '';
  const cellXfs = cellXfsXml.match(/<xf\b[^>]*\/?\s*>/g) || [];
  for (const [index, sheet] of sheets.entries()) {
    if (!sheet.name || GENERIC_SHEET_NAME.test(sheet.name)) {
      findings.push({
        code: 'non-descriptive-sheet-name',
        observation: `Worksheet ${index + 1} uses the generic name “${sheet.name || '(blank)'}”.`,
      });
    }
    const target = targets.get(sheet.relationshipId) || '';
    const sheetPath = path.posix.normalize(`xl/${target.replace(/^\//, '').replace(/^xl\//, '')}`);
    const xml = await zip.file(sheetPath)?.async('string');
    if (!xml) {
      findings.push({ code: 'missing-worksheet', observation: `Worksheet “${sheet.name}” has no readable XML part.` });
      continue;
    }
    const cells = xml.match(/<c\b[\s\S]*?<\/c>/g) || [];
    for (const [cellIndex, cell] of cells.entries()) {
      if (!/<(?:v|t)>[\s\S]*?<\/(?:v|t)>/.test(cell)) continue;
      const styleId = Number(attribute(cell.match(/<c\b[^>]*>/)?.[0] || '', 's') || 0);
      const xf = cellXfs[styleId] || '';
      const fontId = Number(attribute(xf, 'fontId') || 0);
      const fillId = Number(attribute(xf, 'fillId') || 0);
      const foreground = explicitColor(fontBlocks[fontId], /<color\b[^>]*rgb="(?:FF)?([0-9A-Fa-f]{6})"/, '000000');
      const background =
        fillId <= 1
          ? 'FFFFFF'
          : explicitColor(fillBlocks[fillId], /<fgColor\b[^>]*rgb="(?:FF)?([0-9A-Fa-f]{6})"/, 'FFFFFF');
      contrast.push(
        contrastRecord({
          foreground,
          background,
          location: `worksheet-${index + 1}/cell-${attribute(cell.match(/<c\b[^>]*>/)?.[0] || '', 'r') || cellIndex + 1}`,
        }),
      );
    }
    if (cells.length > 0) sheetsWithContent += 1;
    else findings.push({ code: 'empty-worksheet', observation: `Worksheet “${sheet.name}” contains no cells.` });
    const firstRow = xml.match(/<row\b[^>]*r="1"[^>]*>[\s\S]*?<\/row>/)?.[0] || '';
    const headerLabels = visibleText(firstRow, 't').filter((label) => label.length > 1);
    if (headerLabels.length >= 2) sheetsWithHeaderLabels += 1;
    else {
      findings.push({
        code: 'worksheet-without-readable-header-row',
        observation: `Worksheet “${sheet.name}” has fewer than two readable labels in row 1.`,
      });
    }
    if (/<pane\b[^>]*state="frozen"/.test(xml)) sheetsWithFrozenPane += 1;
    else {
      findings.push({
        code: 'worksheet-header-not-frozen',
        observation: `Worksheet “${sheet.name}” does not freeze its header context for navigation.`,
      });
    }
  }
  findings.push(...contrastFindings(contrast));
  if (sheets.length === 0) findings.push({ code: 'no-worksheets', observation: 'The XLSX contains no worksheets.' });
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    metrics: {
      sheetCount: sheets.length,
      sheetsWithContent,
      sheetsWithHeaderLabels,
      sheetsWithFrozenPane,
      sheetNames: sheets.map((sheet) => sheet.name),
      textContrast: {
        checkedPairCount: contrast.length,
        passedPairCount: contrast.filter((record) => record.status === 'passed').length,
        minimumRatio: contrast.length ? Math.min(...contrast.map((record) => record.ratio)) : null,
        records: contrast,
      },
    },
    findings,
  };
}

export async function analyzeOfficeAccessibilityV1(bytes, kind) {
  if (kind === 'docx') return analyzeDocx(bytes);
  if (kind === 'pptx') return analyzePptx(bytes);
  if (kind === 'xlsx') return analyzeXlsx(bytes);
  throw new Error(`Unsupported Office kind: ${kind}`);
}

function receiptHash(receipt) {
  const body = { ...receipt };
  delete body.receiptSha256;
  return canonicalSha256(body);
}

export async function capturePackageAccessibilityAuditV1({
  packageBytes,
  packagePath = '',
  capturedAt = new Date().toISOString(),
} = {}) {
  const bytes = Buffer.from(packageBytes || []);
  if (bytes.length === 0) throw new Error('packageBytes are required');
  const packageZip = await JSZip.loadAsync(bytes);
  const artifacts = [];
  for (const entryName of Object.keys(packageZip.files)
    .filter((name) => OFFICE_PATTERN.test(name))
    .sort()) {
    const entry = packageZip.file(entryName);
    if (!entry || entry.dir) continue;
    const artifactBytes = Buffer.from(await entry.async('uint8array'));
    const kind = path.extname(entryName).slice(1).toLowerCase();
    artifacts.push({
      path: entryName,
      kind,
      bytes: artifactBytes.length,
      sha256: sha256(artifactBytes),
      ...(await analyzeOfficeAccessibilityV1(artifactBytes, kind)),
    });
  }
  if (artifacts.length === 0) throw new Error('Package contains no DOCX, PPTX, or XLSX artifacts');
  const failedArtifacts = artifacts.filter((artifact) => artifact.status !== 'passed');
  const receipt = {
    schemaVersion: 1,
    protocol: PACKAGE_ACCESSIBILITY_AUDIT_V1_PROTOCOL,
    capturedAt,
    packageFile: {
      path: String(packagePath || ''),
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
    policy: {
      artifactExtensions: ['docx', 'pptx', 'xlsx'],
      aggregation: 'all-office-artifacts-must-pass-no-averaging',
      checks: {
        docx: [
          'heading-order',
          'table-header-semantics',
          'readable-hyperlink-labels',
          'drawing-alt',
          'footer',
          'wcag-aa-text-contrast',
        ],
        pptx: [
          'picture-alt',
          'semantic-object-descriptions',
          'functional-visual-nonvisual-recovery',
          'reading-order-proxy',
          'wcag-aa-text-contrast',
        ],
        xlsx: [
          'descriptive-sheet-names',
          'nonempty-sheets',
          'readable-header-row',
          'frozen-header-context',
          'wcag-aa-text-contrast',
        ],
      },
    },
    status: failedArtifacts.length === 0 ? 'passed' : 'failed',
    summary: {
      artifactCount: artifacts.length,
      passedArtifactCount: artifacts.length - failedArtifacts.length,
      failedArtifactCount: failedArtifacts.length,
      findingCount: artifacts.reduce((sum, artifact) => sum + artifact.findings.length, 0),
      formatCounts: Object.fromEntries(
        ['docx', 'pptx', 'xlsx'].map((kind) => [kind, artifacts.filter((artifact) => artifact.kind === kind).length]),
      ),
    },
    artifacts,
    claimBoundary:
      'This is a reproducible structural accessibility audit of exact Office package bytes, including positive static evidence that functional visual entities/data and relationships are recoverable from descriptions. It is not WCAG certification, assistive-technology user testing, or a qualified-human accessibility review.',
  };
  receipt.receiptSha256 = receiptHash(receipt);
  return receipt;
}

export async function verifyPackageAccessibilityAuditV1({ packageBytes, receipt } = {}) {
  const issues = [];
  if (receipt?.protocol !== PACKAGE_ACCESSIBILITY_AUDIT_V1_PROTOCOL) {
    issues.push('unsupported accessibility-audit protocol');
  }
  if (receiptHash(receipt || {}) !== receipt?.receiptSha256) {
    issues.push('accessibility-audit receipt digest does not reproduce');
  }
  const replay = await capturePackageAccessibilityAuditV1({
    packageBytes,
    packagePath: receipt?.packageFile?.path || '',
    capturedAt: receipt?.capturedAt,
  });
  if (replay.packageFile.sha256 !== receipt?.packageFile?.sha256) {
    issues.push('accessibility audit is not bound to the package ZIP');
  }
  if (
    replay.status !== receipt?.status ||
    canonicalSha256(replay.artifacts) !== canonicalSha256(receipt?.artifacts || [])
  ) {
    issues.push('accessibility-audit artifact results do not reproduce from the package ZIP');
  }
  if (receipt?.status !== 'passed') issues.push('accessibility audit did not pass every Office artifact');
  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    issues,
    receiptSha256: receipt?.receiptSha256 || '',
    fileSummary: replay.summary,
  };
}
