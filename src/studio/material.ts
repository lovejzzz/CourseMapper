import { z } from 'zod';
import { sourceSpans, evidenceSelectionSchema, bindEvidence, type SourceSpan } from './evidence';
import type { Source, Activity } from './domain';

export function materialLabel(
  origin: Activity['materialOrigin'],
  sources: Record<string, Source>,
  language: 'en' | 'zh',
): string {
  const zh = language === 'zh';
  if (!origin)
    return zh ? '旧版材料 · 来源尚未绑定，请核实' : 'Earlier material · source binding not recorded; verify before use';
  if (origin.kind === 'fictional') return zh ? '为练习虚构的材料' : 'Fictional material created for practice';
  const references = [
    ...new Set(
      origin.refs.map((ref) => {
        const source = sources[ref.sourceId];
        return `${source?.title ?? ref.sourceId} · v${ref.sourceVersion ?? '?'}${source?.kind === 'fictional' ? (zh ? '（虚构教学资料）' : ' (fictional teaching source)') : ''}`;
      }),
    ),
  ].join('; ');
  const label =
    origin.kind === 'adapted'
      ? zh
        ? '教师改编自'
        : 'Instructor adaptation of'
      : zh
        ? '原文摘录自'
        : 'Exact passage from';
  return `${label}: ${references}`;
}

export function materialSelectionSchema(sources: Source[], allowFictional: boolean, spans = sourceSpans(sources)) {
  const source = z.object({ kind: z.literal('source'), spans: evidenceSelectionSchema(spans).min(1) });
  const fictional = z.object({ kind: z.literal('fictional'), text: z.string().trim().min(1).max(12000) });
  if (!spans.length) return fictional;
  return allowFictional ? z.union([source, fictional]) : source;
}
export function bindMaterial(
  selection: { kind: 'source'; spans: { spanId: string }[] } | { kind: 'fictional'; text: string },
  spans: SourceSpan[],
) {
  if (selection.kind === 'fictional')
    return { material: selection.text, materialOrigin: { kind: 'fictional' as const, refs: [] } };
  const refs = bindEvidence(selection.spans, spans);
  return { material: refs.map((r) => r.quote).join('\n\n'), materialOrigin: { kind: 'source' as const, refs } };
}
