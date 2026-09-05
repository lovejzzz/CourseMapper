import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from '../ErrorBoundary';

describe('ErrorBoundary chunk-load detection', () => {
  it('recognizes stale Vite dynamic-import failures', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/DeliverableView-abc.js')),
    ).toBe(true);
  });

  it('does not treat ordinary render errors as chunk-load failures', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
