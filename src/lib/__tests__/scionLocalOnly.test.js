import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicScionModelOptionById, publicScionProviderModelOptions } from '../publicScionIdentity';
import { restorePublicScionAIConfig } from '../../contexts/AIConfigContext';
import { requestHostedScion, runScionHostedCompletion } from '../scionHostedProvider';
import { checkHostedScionAvailability } from '../scionHostedAvailability';

describe('local Scion while the shared free API is paused', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('offers only browser inference and migrates saved online projects to the local model', () => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    });
    expect(publicScionProviderModelOptions().map((option) => option.id)).toEqual(['scion-public']);
    expect(publicScionModelOptionById('scion-hosted').source).toBe('browser-local');
    const setters = Array.from({ length: 5 }, () => vi.fn());
    restorePublicScionAIConfig(...setters, 'scion-hosted');
    expect(setters[0]).toHaveBeenCalledWith('public');
    expect(setters[2]).toHaveBeenCalledWith('scion-public');
    expect(localStorage.getItem('coursemapper-modelid')).toBe('scion-public');
  });
  it('makes no health, inference or runtime call even when a stale client asks for the paused route', async () => {
    const fetchImpl = vi.fn();
    const runtimeLoader = vi.fn();
    expect(await checkHostedScionAvailability({ fetchImpl })).toMatchObject({ ready: false, scope: 'paused' });
    await expect(requestHostedScion({}, { fetchImpl })).rejects.toMatchObject({ code: 'SCION_HOSTED_PAUSED' });
    await expect(runScionHostedCompletion({ runtimeLoader })).rejects.toMatchObject({ code: 'SCION_HOSTED_PAUSED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runtimeLoader).not.toHaveBeenCalled();
  });
});
