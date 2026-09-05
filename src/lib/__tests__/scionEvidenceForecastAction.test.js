import { describe, expect, it } from 'vitest';
import { shouldOfferCurrentSourceResearch } from '../scionEvidenceForecastAction';

describe('Scion evidence forecast action', () => {
  const gapForecast = { status: 'ready', externalNeeded: 3 };

  it('offers current-source research whenever Scion has an evidence gap', () => {
    expect(
      shouldOfferCurrentSourceResearch({
        scionSelected: true,
        researchEnabled: false,
        forecast: gapForecast,
      }),
    ).toBe(true);
  });

  it('does not depend on whether the device can run a local model', () => {
    const capableDevice = { localGemma: true, evidenceCompiler: false };
    expect(
      shouldOfferCurrentSourceResearch({
        scionSelected: true,
        researchEnabled: false,
        forecast: gapForecast,
        deviceCapability: capableDevice,
      }),
    ).toBe(true);
  });

  it('does not re-offer research when coverage is complete, consent is already on, or Scion is not selected', () => {
    expect(
      shouldOfferCurrentSourceResearch({
        scionSelected: true,
        researchEnabled: false,
        forecast: { status: 'ready', externalNeeded: 0 },
      }),
    ).toBe(false);
    expect(
      shouldOfferCurrentSourceResearch({
        scionSelected: true,
        researchEnabled: true,
        forecast: gapForecast,
      }),
    ).toBe(false);
    expect(
      shouldOfferCurrentSourceResearch({
        scionSelected: false,
        researchEnabled: false,
        forecast: gapForecast,
      }),
    ).toBe(false);
  });
});
