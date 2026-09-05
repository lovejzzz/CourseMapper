import { z } from 'zod';

export type RichMark = {
  type: 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'link';
  attrs?: { href?: string; target?: string | null; rel?: string | null; class?: string | null };
};
export type RichNode = {
  type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'text'
    | 'hardBreak'
    | 'horizontalRule'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'blockquote'
    | 'codeBlock';
  text?: string;
  content?: RichNode[];
  marks?: RichMark[];
  attrs?: { level?: number; start?: number; language?: string | null; type?: string | null };
};
const nodeTypes = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
]);
const markTypes = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'link']);
function validDocument(value: unknown): value is RichNode {
  if (!value || typeof value !== 'object' || (value as RichNode).type !== 'doc') return false;
  const queue = [{ value, depth: 0 }];
  let count = 0,
    characters = 0;
  while (queue.length) {
    const { value: next, depth } = queue.pop()!;
    if (++count > 3000 || depth > 16 || !next || typeof next !== 'object' || Array.isArray(next)) return false;
    const node = next as RichNode;
    if (
      !nodeTypes.has(node.type) ||
      Object.keys(node).some((key) => !['type', 'text', 'content', 'marks', 'attrs'].includes(key))
    )
      return false;
    if (node.text !== undefined) {
      if (typeof node.text !== 'string' || node.type !== 'text') return false;
      characters += node.text.length;
      if (characters > 12000) return false;
    }
    if (node.attrs) {
      if (
        typeof node.attrs !== 'object' ||
        Object.keys(node.attrs).some((key) => !['level', 'start', 'language', 'type'].includes(key))
      )
        return false;
      if (node.attrs.level !== undefined && ![1, 2, 3].includes(node.attrs.level)) return false;
      if (
        node.attrs.start !== undefined &&
        (!Number.isInteger(node.attrs.start) || node.attrs.start < 1 || node.attrs.start > 10000)
      )
        return false;
      if (node.attrs.language != null && (typeof node.attrs.language !== 'string' || node.attrs.language.length > 50))
        return false;
      if (node.attrs.type != null && !['1', 'a', 'A', 'i', 'I'].includes(node.attrs.type)) return false;
    }
    if (node.marks) {
      if (!Array.isArray(node.marks) || node.marks.length > 6) return false;
      for (const mark of node.marks) {
        if (!mark || !markTypes.has(mark.type)) return false;
        if (mark.type === 'link' && (!mark.attrs?.href || !/^(https?:\/\/|mailto:|#)/i.test(mark.attrs.href)))
          return false;
      }
    }
    if (node.content) {
      if (!Array.isArray(node.content)) return false;
      for (const child of node.content) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return true;
}
export const RichDocumentSchema = z.custom<RichNode>(validDocument, 'Unsupported or oversized formatted document.');
export const FormattingSchema = z
  .object({ text: z.string().max(12000), document: RichDocumentSchema })
  .superRefine((value, context) => {
    if (value.text !== richPlainText(value.document))
      context.addIssue({ code: 'custom', message: 'Formatted content must match the canonical text.' });
  });
export function plainDocument(text: string): RichNode {
  return {
    type: 'doc',
    content: text
      .split('\n')
      .map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
  };
}
export function richPlainText(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const children = node.content ?? [];
  return children
    .map(richPlainText)
    .join(['doc', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type) ? '\n' : '');
}
export function escaped(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}
export function richHtml(node: RichNode): string {
  if (node.type === 'text') {
    let text = escaped(node.text ?? '');
    for (const mark of node.marks ?? []) {
      const tag = { bold: 'strong', italic: 'em', strike: 's', underline: 'u', code: 'code', link: 'a' }[mark.type];
      text =
        mark.type === 'link'
          ? `<a href="${escaped(mark.attrs?.href ?? '')}" rel="noopener noreferrer">${text}</a>`
          : `<${tag}>${text}</${tag}>`;
    }
    return text;
  }
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'horizontalRule') return '<hr>';
  const inner = (node.content ?? []).map(richHtml).join('');
  if (node.type === 'doc') return inner;
  const tag =
    node.type === 'heading'
      ? `h${node.attrs?.level ?? 2}`
      : {
          paragraph: 'p',
          bulletList: 'ul',
          orderedList: 'ol',
          listItem: 'li',
          blockquote: 'blockquote',
          codeBlock: 'pre',
        }[node.type];
  return `<${tag}${node.type === 'orderedList' && node.attrs?.start ? ` start="${node.attrs.start}"` : ''}${node.type === 'orderedList' && node.attrs?.type ? ` type="${escaped(node.attrs.type)}"` : ''}>${inner}</${tag}>`;
}
