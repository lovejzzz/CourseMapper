import { describe, expect, it } from 'vitest';
import { canFetchCrossrefDirectly } from '../crossrefRuntime.js';

describe('canFetchCrossrefDirectly', () => {
  it('keeps Crossref available to Node/build-time callers', () => {
    expect(canFetchCrossrefDirectly({})).toBe(true);
  });

  it('fails closed in a browser before an unsupported CORS request reaches fetch', () => {
    expect(canFetchCrossrefDirectly({ window: { document: {} } })).toBe(false);
  });
});
