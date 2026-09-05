import { describe, expect, it } from 'vitest';
import { materialSelectionSchema, bindMaterial } from '../material';
import { sourceSpans } from '../evidence';
import { sourceContext } from '../context';
const source = {
  id: 'object',
  version: 1,
  title: 'Original museum card',
  kind: 'fictional' as const,
  text: 'B09: a wooden box with a circular hole in the lid. Its creation date is unknown.',
};
describe('original learner inputs', () => {
  it('offers only retrieved passages and keeps aliases short without losing full source identity', () => {
    const reading = {
      ...source,
      id: 'source_very_long_import_identifier_00000000_11111111_22222222',
      text: Array.from({ length: 100 }, (_, i) => `[L${i}] A distinct complete record numbered ${i}.`).join('\n'),
    };
    const spans = sourceContext([reading], 'record 99', 600);
    const schema = materialSelectionSchema([reading], false, spans);
    const omitted = sourceSpans([reading]).find((span) => !spans.some((selected) => selected.spanId === span.spanId))!;
    expect(schema.safeParse({ kind: 'source', spans: [{ spanId: omitted.spanId }] }).success).toBe(false);
    expect(spans.every((span) => span.spanId.length < 20)).toBe(true);
    const bound = bindMaterial({ kind: 'source', spans: [{ spanId: spans[0].spanId }] }, spans);
    expect(bound.materialOrigin.refs[0].sourceId).toBe(reading.id);
    expect(reading.text.slice(bound.materialOrigin.refs[0].start, bound.materialOrigin.refs[0].end)).toBe(
      bound.material,
    );
  });
  it('renders the stored original instead of a model-rewritten record', () => {
    const spans = sourceSpans([source]);
    const selection = materialSelectionSchema([source], false).parse({
      kind: 'source',
      spans: [{ spanId: spans[0].spanId }],
    });
    const bound = bindMaterial(selection, spans);
    expect(bound.material).toBe(source.text);
    expect(bound.materialOrigin.refs[0].sourceVersion).toBe(1);
    expect(() => bindMaterial({ kind: 'source', spans: [{ spanId: 'invented-object' }] }, spans)).toThrow();
  });
  it('allows new fictional material only when explicitly enabled and identifies its origin', () => {
    const invented = { kind: 'fictional', text: 'A new fictional C13 clay bowl.' };
    expect(materialSelectionSchema([source], false).safeParse(invented).success).toBe(false);
    const selection = materialSelectionSchema([source], true).parse(invented);
    expect(bindMaterial(selection, sourceSpans([source])).materialOrigin.kind).toBe('fictional');
  });
});
