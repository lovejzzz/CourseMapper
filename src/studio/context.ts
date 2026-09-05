import { sourceSpans, type SourceSpan } from './evidence';
import type { Source } from './domain';

// A bounded, inspectable retrieval step. It keeps exact source addresses;
// lexical relevance selects context, never certifies a claim as true.
function terms(text: string): Set<string> {
  const words = text.toLocaleLowerCase().match(/[a-z0-9]{3,}|[\p{Script=Han}]+/gu) ?? [];
  return new Set(
    words.flatMap((word) =>
      /\p{Script=Han}/u.test(word)
        ? Array.from(word)
            .slice(0, -1)
            .map((_, i, chars) => chars[i] + Array.from(word)[i + 1])
        : [word],
    ),
  );
}

export function sourceContext(sources: Source[], query: string, budget = 16000): SourceSpan[] {
  const spans = sourceSpans(sources);
  const cost = (span: SourceSpan) => span.quote.length + span.spanId.length + 80;
  if (spans.reduce((n, span) => n + cost(span), 0) <= budget) return spans;
  const wanted = terms(query);
  const tokens = spans.map((span) => terms(span.quote));
  const frequency = new Map<string, number>();
  for (const token of wanted) frequency.set(token, tokens.filter((set) => set.has(token)).length);
  const ranked = spans
    .map((span, index) => ({
      span,
      index,
      score: [...wanted].reduce(
        (n, token) =>
          n + (tokens[index].has(token) ? Math.log(1 + spans.length / (1 + (frequency.get(token) ?? 0))) : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Set<number>();
  let used = 0;
  const add = (index: number) => {
    if (selected.has(index) || used + cost(spans[index]) > budget) return;
    selected.add(index);
    used += cost(spans[index]);
  };
  // Represent each selected document before filling by relevance. Neighbours
  // retain local attribution and qualifications when a passage is retrieved.
  for (const source of sources) {
    const best = ranked.find((entry) => entry.span.sourceId === source.id);
    if (best) add(best.index);
  }
  for (const { index } of ranked) {
    add(index);
    for (const next of [index - 1, index + 1]) if (spans[next]?.sourceId === spans[index].sourceId) add(next);
  }
  return spans.filter((_, index) => selected.has(index));
}
