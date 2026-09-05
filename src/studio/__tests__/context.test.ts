import { describe, it, expect } from 'vitest';
import { sourceContext } from '../context';
import { sourceSpans } from '../evidence';
import type { Source } from '../domain';
const source = (id: string, text: string): Source => ({ id, text, title: id, version: 2, kind: 'provided' });
describe('bounded source context', () => {
  it('keeps a short packet complete and retrieves relevant late material with original addresses from a long reading', () => {
    const short = source('short', '[L1] The library closes at eight.\n[L2] No opening time is given.');
    expect(sourceContext([short], 'hours')).toEqual(sourceSpans([short]));
    const long = source(
      'long',
      Array.from({ length: 60 }, (_, i) => `Chapter ${i}: unrelated ornamental flowers and garden paths. `).join('\n') +
        '\nThe library staffing budget has not been specified.\nA trial requires an approved staffing plan.',
    );
    const selected = sourceContext([long], 'library staffing budget', 1000);
    expect(selected.some((span) => span.quote.includes('has not been specified'))).toBe(true);
    expect(selected.some((span) => span.quote.includes('approved staffing plan'))).toBe(true);
    expect(selected.reduce((n, span) => n + span.quote.length + span.spanId.length + 80, 0)).toBeLessThanOrEqual(1000);
    for (const span of selected) expect(long.text.slice(span.start, span.end)).toBe(span.quote);
  });
  it('retrieves Chinese terms and represents each selected document', () => {
    const a = source('a', '无关的材料。\n'.repeat(80) + '预算尚未说明，不能据此推断没有预算。');
    const b = source('b', '馆方要求提交人员安排方案。');
    const selected = sourceContext([a, b], '预算与人员安排', 1000);
    expect(new Set(selected.map((s) => s.sourceId))).toEqual(new Set(['a', 'b']));
    expect(selected.some((s) => s.quote.includes('预算尚未说明'))).toBe(true);
  });
});
