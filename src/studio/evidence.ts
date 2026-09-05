import { z } from 'zod';
import type { Source } from './domain';

export interface SourceSpan {
  spanId: string;
  sourceId: string;
  version: number;
  start: number;
  end: number;
  quote: string;
}

// Short request-local aliases keep repeated JSON-schema enums small. Durable
// evidence stores the full source identity, version and exact offsets below.
export function sourceSpans(sources: Source[]): SourceSpan[] {
  return sources.flatMap((source, sourceIndex) => {
    const spans: SourceSpan[] = [];
    // Explicit record labels remain independently selectable even when the
    // pasted packet uses a single paragraph. Do not rewrite the source text.
    const starts = new Set([0, source.text.length]);
    for (const match of source.text.matchAll(/\n|\[[A-Z]{1,8}\d{1,6}\](?=\s)/g)) {
      starts.add(match[0] === '\n' ? match.index! + 1 : match.index!);
    }
    const positions = [...starts].sort((a, b) => a - b);
    const lines = positions
      .slice(0, -1)
      .map((start, i) => ({ 0: source.text.slice(start, positions[i + 1]), index: start }));
    for (const line of lines) {
      let offset = 0;
      while (offset < line[0].length) {
        let end = Math.min(offset + 320, line[0].length);
        if (end < line[0].length) {
          const chunk = line[0].slice(offset, end);
          const sentences = [...chunk.matchAll(/[。！？][”’"']*|[.!?][”’"']*\s+/g)];
          const words = [...chunk.matchAll(/\s+/g)];
          const sentence = sentences.at(-1);
          // Prefer a complete sentence, even when a later whitespace would
          // pack more characters. A clipped factual record changes the task.
          const boundary = sentence && sentence.index! > 60 ? sentence : words.at(-1);
          if (boundary) end = offset + boundary.index! + boundary[0].length;
          if (/[\uD800-\uDBFF]/.test(line[0][end - 1])) end--;
        }
        const raw = line[0].slice(offset, end);
        const leading = raw.length - raw.trimStart().length;
        const trailing = raw.length - raw.trimEnd().length;
        const first = line.index! + offset + leading;
        const last = line.index! + end - trailing;
        if (last > first)
          spans.push({
            spanId: `s${sourceIndex}v${source.version}p${first}`,
            sourceId: source.id,
            version: source.version,
            start: first,
            end: last,
            quote: source.text.slice(first, last),
          });
        offset = end;
      }
    }
    return spans;
  });
}

export function evidenceSelectionSchema(spans: SourceSpan[]) {
  return z
    .array(
      z.object({ spanId: spans.length ? z.enum(spans.map((s) => s.spanId) as [string, ...string[]]) : z.string() }),
    )
    .max(spans.length ? 8 : 0);
}

export function bindEvidence(selected: { spanId: string }[], spans: SourceSpan[]) {
  if (new Set(selected.map((s) => s.spanId)).size !== selected.length)
    throw new Error('Do not cite the same source span twice.');
  return selected.map((selection) => {
    const span = spans.find((s) => s.spanId === selection.spanId);
    if (!span) throw new Error(`Unknown source span ${selection.spanId}.`);
    return {
      sourceId: span.sourceId,
      quote: span.quote,
      sourceVersion: span.version,
      start: span.start,
      end: span.end,
    };
  });
}
