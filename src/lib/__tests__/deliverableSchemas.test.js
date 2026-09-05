import { describe, expect, it } from 'vitest';
import { getDeliverableResponseSchema } from '../deliverableSchemas';

describe('deliverableSchemas', () => {
  it('builds strict schemas from the compact deliverable contract', () => {
    const schema = getDeliverableResponseSchema('slideDecks');

    expect(schema).toMatchObject({
      name: 'coursemapper_slideDecks',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
      },
    });
    expect(schema.schema.required).toContain('decks');
    expect(schema.schema.properties.decks.items.required).toEqual(expect.arrayContaining(['lt', 'sl']));
  });

  it('does not force schemas onto custom deliverables', () => {
    expect(getDeliverableResponseSchema('custom_reader')).toBeNull();
  });
});
