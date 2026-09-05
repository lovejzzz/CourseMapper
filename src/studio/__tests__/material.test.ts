import { describe, expect, it } from 'vitest';
import { materialSelectionSchema, bindMaterial } from '../material';
import { sourceSpans } from '../evidence';
const source = {
  id: 'object',
  version: 1,
  title: 'Original museum card',
  kind: 'fictional' as const,
  text: 'B09: a wooden box with a circular hole in the lid. Its creation date is unknown.',
};
describe('original learner inputs', () => {
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
