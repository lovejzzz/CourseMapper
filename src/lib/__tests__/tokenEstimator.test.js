import { describe, it, expect } from 'vitest';
import { estimateTokens, getModelLimit, checkTokenLimit } from '../tokenEstimator';

describe('estimateTokens', () => {
  it('estimates roughly 1 token per 4 characters', () => {
    const text = 'a'.repeat(400);
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThanOrEqual(90);
    expect(tokens).toBeLessThanOrEqual(110);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('getModelLimit', () => {
  it('returns known limits for exact model IDs', () => {
    expect(getModelLimit('gpt-4o')).toBe(128000);
    expect(getModelLimit('claude-3-5-sonnet')).toBe(200000);
    expect(getModelLimit('o3')).toBe(200000);
  });

  it('returns limits for GPT-5+ models', () => {
    expect(getModelLimit('gpt-5')).toBe(200000);
    expect(getModelLimit('gpt-5.2')).toBe(200000);
    expect(getModelLimit('gpt-5.4')).toBe(1050000);
    expect(getModelLimit('gpt-5.4-mini')).toBe(400000);
    expect(getModelLimit('gpt-4.1')).toBe(200000);
    expect(getModelLimit('gpt-4.1-mini')).toBe(200000);
  });

  it('uses heuristic for unknown models', () => {
    expect(getModelLimit('claude-99-mega')).toBe(200000);
    expect(getModelLimit('gemini-3.0-ultra')).toBe(1000000);
    expect(getModelLimit('o9-mini')).toBe(200000);
  });

  it('returns conservative default for unknown models', () => {
    expect(getModelLimit('some-unknown-model')).toBe(128000);
  });

  it('matches partial model IDs with date suffixes', () => {
    expect(getModelLimit('gpt-4o-2024-08-06')).toBe(128000);
    expect(getModelLimit('gpt-5.4-mini-2026-03-18')).toBe(400000);
    expect(getModelLimit('gpt-5.4-2026-03-12')).toBe(1050000);
  });
});

describe('checkTokenLimit', () => {
  it('reports fits=true for small text', () => {
    const result = checkTokenLimit('Hello world', 'gpt-4o');
    expect(result.fits).toBe(true);
    expect(result.limit).toBe(128000);
  });

  it('reports overBy when text exceeds limit', () => {
    const hugeText = 'word '.repeat(200000);
    const result = checkTokenLimit(hugeText, 'gpt-3.5-turbo');
    expect(result.fits).toBe(false);
    expect(result.overBy).toBeGreaterThan(0);
  });
});
