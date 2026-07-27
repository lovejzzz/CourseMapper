import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateAlgiSessionCount, forecastAlgiCoverage } from '../algiCoverageForecast.js';
import { resetAlgiGenomeCacheForTests } from '../algiKernelComposer.js';

describe('Algi pre-generation coverage forecast', () => {
  it('uses an explicit duration before the shorter coverage list', () => {
    expect(
      estimateAlgiSessionCount(
        'UX Design Studio, 12-week course. Covers research, personas, journey maps, wireframes, and testing.',
      ),
    ).toBe(12);
    expect(estimateAlgiSessionCount('Build exactly five lessons: 1) A, 2) B, 3) C, 4) D, 5) E.')).toBe(5);
  });

  it('forecasts the private genome without making a provider request', async () => {
    const forecast = await forecastAlgiCoverage({
      source:
        'User Experience Design Studio, 3-week course. Lesson 1: User research. Lesson 2: Information architecture. Lesson 3: Usability testing.',
      researchEnabled: false,
    });

    expect(forecast.status).toBe('ready');
    expect(forecast.requested).toBe(3);
    expect(forecast.privateCovered + forecast.externalNeeded).toBe(3);
    expect(forecast.lessons).toHaveLength(3);
    expect(forecast.lessons.every((lesson) => ['private-ready', 'source-gap'].includes(lesson.status))).toBe(true);
  });

  it('labels uncovered private lessons as planned research only after opt-in', async () => {
    const source =
      'Novel Topics, exactly 2 lessons. Lesson 1: Xenobiotic archive choreography. Lesson 2: Counterfactual lattice gardening.';
    const privateForecast = await forecastAlgiCoverage({ source, researchEnabled: false });
    const researchForecast = await forecastAlgiCoverage({ source, researchEnabled: true });

    expect(privateForecast.externalNeeded).toBeGreaterThan(0);
    expect(privateForecast.route).toBe('private-coverage-gaps');
    expect(researchForecast.route).toBe('research-assisted');
    expect(researchForecast.lessons.some((lesson) => lesson.status === 'research-planned')).toBe(true);
  });

  it('recognizes the source-anchored OpenStax waterborne lesson before external research', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const relative = String(input)
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\//, '');
      return new Response(readFileSync(join(process.cwd(), 'public', relative), 'utf8'), { status: 200 });
    };
    resetAlgiGenomeCacheForTests();
    try {
      const forecast = await forecastAlgiCoverage({
        source:
          'Environmental Microbiology, exactly five lessons: 1) Microbial ecology, 2) Waterborne pathogens, 3) Biofilms, 4) Bioremediation, and 5) Microbial risk assessment.',
        researchEnabled: true,
      });

      expect(forecast.requested).toBe(5);
      expect(forecast.lessons.find((lesson) => lesson.title === 'Waterborne pathogens')).toMatchObject({
        status: 'private-ready',
      });
      expect(forecast.externalNeeded).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
      resetAlgiGenomeCacheForTests();
    }
  });
});
