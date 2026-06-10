import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENRICHMENT_MODE_STORAGE_KEY,
  describeEnrichmentResolution,
  enrichmentPreferenceOverride,
  readEnrichmentPreference,
  saveEnrichmentPreference,
} from '../enrichmentPreference';

function installStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  });
  return store;
}

describe('enrichmentPreference (v0.12.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to auto and round-trips on/off', () => {
    installStorage();
    expect(readEnrichmentPreference()).toBe('auto');
    saveEnrichmentPreference('on');
    expect(readEnrichmentPreference()).toBe('on');
    saveEnrichmentPreference('off');
    expect(readEnrichmentPreference()).toBe('off');
    saveEnrichmentPreference('auto');
    expect(readEnrichmentPreference()).toBe('auto');
  });

  it('maps the preference onto the generateAll mode chain', () => {
    const store = installStorage();
    // auto → undefined so the generation plan default wins
    expect(enrichmentPreferenceOverride()).toBeUndefined();
    store.set(ENRICHMENT_MODE_STORAGE_KEY, 'on');
    expect(enrichmentPreferenceOverride()).toBe('required');
    store.set(ENRICHMENT_MODE_STORAGE_KEY, 'off');
    expect(enrichmentPreferenceOverride()).toBe(false);
    // junk values behave as auto
    store.set(ENRICHMENT_MODE_STORAGE_KEY, 'banana');
    expect(enrichmentPreferenceOverride()).toBeUndefined();
  });

  it('survives a missing localStorage (SSR / privacy mode)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readEnrichmentPreference()).toBe('auto');
    expect(enrichmentPreferenceOverride()).toBeUndefined();
    expect(() => saveEnrichmentPreference('on')).not.toThrow();
  });

  it('describes the resolved state for the Config control', () => {
    expect(describeEnrichmentResolution('on', 'adaptive')).toContain('Always runs');
    expect(describeEnrichmentResolution('off', 'adaptive')).toContain('mail-merge risk');
    expect(describeEnrichmentResolution('auto', 'adaptive')).toContain('Adaptive');
    expect(describeEnrichmentResolution('auto', false)).toContain('Off for this model');
  });
});
