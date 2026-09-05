import type { Course } from './domain';
import type { MaterialDocument, MaterialBlock } from './materials';
import { formattedBlock } from './materialFormat';
import { plainDocument, type RichNode, type RichMark } from './richText';

export async function renderMaterialDocx(course: Course, material: MaterialDocument): Promise<Uint8Array> {
  const {
    Document,
    Paragraph,
    TextRun,
    Packer,
    HeadingLevel,
    PageBreak,
    Table,
    TableRow,
    TableCell,
    WidthType,
    Footer,
    PageNumber,
    AlignmentType,
    ExternalHyperlink,
    LevelFormat,
    BorderStyle,
  } = await import('docx');
  type Inline = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;
  const textRun = (text: string, marks: RichMark[] = []): Inline => {
    const run = new TextRun({
      text,
      bold: marks.some((mark) => mark.type === 'bold'),
      italics: marks.some((mark) => mark.type === 'italic'),
      strike: marks.some((mark) => mark.type === 'strike'),
      underline: marks.some((mark) => mark.type === 'underline') ? {} : undefined,
      ...(marks.some((mark) => mark.type === 'code') ? { font: 'Courier New' } : {}),
    });
    const link = marks.find((mark) => mark.type === 'link');
    return link?.attrs?.href ? new ExternalHyperlink({ link: link.attrs.href, children: [run] }) : run;
  };
  const inline = (node: RichNode): Inline[] =>
    node.type === 'text'
      ? [textRun(node.text ?? '', node.marks)]
      : node.type === 'hardBreak'
        ? [new TextRun({ text: '', break: 1 })]
        : (node.content ?? []).flatMap(inline);
  let listId = 0;
  const numbering: {
    reference: string;
    levels: {
      level: number;
      format: typeof LevelFormat.DECIMAL;
      text: string;
      start: number;
      style: { paragraph: { indent: { left: number; hanging: number } } };
    }[];
  }[] = [];
  const paragraphs = (
    node: RichNode,
    depth = 0,
    list?: { reference?: string; bullet: boolean },
  ): InstanceType<typeof Paragraph>[] => {
    if (node.type === 'doc' || node.type === 'blockquote' || node.type === 'listItem')
      return (node.content ?? []).flatMap((child, index) => paragraphs(child, depth, index === 0 ? list : undefined));
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const reference = `material-list-${listId++}`;
      if (node.type === 'orderedList')
        numbering.push({
          reference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              start: node.attrs?.start ?? 1,
              style: { paragraph: { indent: { left: 360 * (depth + 1), hanging: 240 } } },
            },
          ],
        });
      return (node.content ?? []).flatMap((child) =>
        paragraphs(child, depth + 1, { reference, bullet: node.type === 'bulletList' }),
      );
    }
    if (node.type === 'horizontalRule')
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BCC6C0' } } })];
    return [
      new Paragraph({
        children: inline(node),
        spacing: { after: 120, line: 280 },
        ...(node.type === 'heading'
          ? { heading: node.attrs?.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2 }
          : {}),
        ...(list
          ? list.bullet
            ? { bullet: { level: Math.min(depth - 1, 8) } }
            : { numbering: { reference: list.reference!, level: 0 } }
          : {}),
      }),
    ];
  };
  const content = (block: Pick<MaterialBlock, 'text' | 'reference'>) =>
    paragraphs(formattedBlock(course, block) ?? plainDocument(block.text));
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const block of material.blocks) {
    if (block.type === 'page') {
      children.push(new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } }));
      continue;
    }
    if (block.type === 'space') {
      children.push(
        new Paragraph({ children: [new TextRun({ text: block.text, size: 18, color: '58645D' })], keepNext: true }),
      );
      for (let i = 0; i < (block.lines ?? 3); i++)
        children.push(
          new Paragraph({
            text: ' ',
            spacing: { after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CCD2CE' } },
          }),
        );
      continue;
    }
    if (block.type === 'table') {
      const columnCount = block.headers?.length ?? block.rows?.[0]?.length ?? 1;
      const widths = columnCount === 5 ? [16, 6, 26, 26, 26] : Array(columnCount).fill(100 / columnCount);
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: (block.headers ?? []).map(
                (text, index) =>
                  new TableCell({
                    width: { size: widths[index], type: WidthType.PERCENTAGE },
                    shading: { fill: 'EAF0EC' },
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text, bold: true, size: 18 })],
                        spacing: { after: 80 },
                      }),
                    ],
                  }),
              ),
            }),
            ...(block.rows ?? []).map(
              (row) =>
                new TableRow({
                  cantSplit: true,
                  children: row.map(
                    (cell, index) =>
                      new TableCell({
                        width: { size: widths[index], type: WidthType.PERCENTAGE },
                        children: content(cell),
                        margins: { top: 100, bottom: 100, left: 100, right: 100 },
                      }),
                  ),
                }),
            ),
          ],
        }),
      );
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      continue;
    }
    if (block.type === 'body') children.push(...content(block));
    else
      children.push(
        new Paragraph({
          heading:
            block.type === 'title'
              ? HeadingLevel.TITLE
              : block.type === 'heading'
                ? HeadingLevel.HEADING_1
                : HeadingLevel.HEADING_2,
          children: inline(formattedBlock(course, block) ?? plainDocument(block.text)),
          spacing: { before: block.type === 'title' ? 0 : 220, after: 140 },
          keepNext: true,
        }),
      );
  }
  const doc = new Document({
    title: `${material.title} — ${material.subtitle}`,
    creator: 'EduTool',
    numbering: { config: numbering },
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Noto Sans SC' }, size: 21, color: '000000' },
        },
        title: { run: { size: 44, bold: true, color: '000000' }, paragraph: { keepNext: true } },
        heading1: { run: { size: 32, bold: true, color: '000000' }, paragraph: { keepNext: true } },
        heading2: { run: { size: 24, bold: true, color: '000000' }, paragraph: { keepNext: true } },
      },
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, bottom: 1020, left: 1020, right: 1020 } },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${material.subtitle} · `, size: 16, color: '58645D' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
