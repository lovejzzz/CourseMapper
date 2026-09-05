import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateAlgiSessionCount, forecastAlgiCoverage, formatCoverageTopicLabel } from '../algiCoverageForecast.js';
import { composeAlgiLessonKernels, resetAlgiGenomeCacheForTests } from '../algiKernelComposer.js';

describe('Algi pre-generation coverage forecast', () => {
  it('preserves common course acronyms in visible lesson labels', () => {
    expect(formatCoverageTopicLabel('Wcag principles for ui and ux')).toBe('WCAG principles for UI and UX');
    expect(formatCoverageTopicLabel('SQL and LMS integration')).toBe('SQL and LMS integration');
  });

  it('uses an explicit duration before the shorter coverage list', () => {
    expect(
      estimateAlgiSessionCount(
        'UX Design Studio, 12-week course. Covers research, personas, journey maps, wireframes, and testing.',
      ),
    ).toBe(12);
    expect(estimateAlgiSessionCount('Build exactly five lessons: 1) A, 2) B, 3) C, 4) D, 5) E.')).toBe(5);
    expect(
      estimateAlgiSessionCount(
        'Urban Heat Resilience — a five-week course. Use this exact lesson sequence: 1) Heat measurement; 2) Environmental justice; 3) Public-health evidence; 4) Cooling interventions; 5) Community planning.',
      ),
    ).toBe(5);
    expect(
      estimateAlgiSessionCount(
        'Create a five-lesson introductory undergraduate course titled Visual Evidence and Image Analysis. Students learn composition, visual hierarchy, color and contrast, perspective and framing, and ethical contextual interpretation. Every lesson must require students to analyze a concrete visual.',
      ),
    ).toBe(5);
  });

  it('keeps semicolon-numbered lessons intact when a lesson title contains commas', async () => {
    const source =
      'Digital Accessibility for Product Teams, exactly three lessons: 1) WCAG principles and conformance; 2) semantic HTML and keyboard accessibility; 3) accessible forms, testing, and remediation. Project-based professional course.';
    const forecast = await forecastAlgiCoverage({ source, researchEnabled: true });
    expect(forecast.lessons.map((lesson) => lesson.title)).toEqual([
      'WCAG principles and conformance',
      'semantic HTML and keyboard accessibility',
      'accessible forms, testing, and remediation',
    ]);
    expect(forecast.researchPlan.lessonCount).toBe(forecast.externalNeeded);
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
    expect(researchForecast.researchPlan).toMatchObject({
      protocol: 'algi-course-research-plan-v1',
      lessonCount: researchForecast.externalNeeded,
      providerOrder: ['doaj', 'wikipedia'],
    });
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
      expect(forecast.researchPlan).toMatchObject({
        domain: 'biomedical',
        providerOrder: ['europe-pmc', 'doaj', 'wikipedia'],
      });
    } finally {
      globalThis.fetch = originalFetch;
      resetAlgiGenomeCacheForTests();
    }
  });

  it('does not let verbose teaching directions erase a source-matched section identity', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const relative = String(input)
        .replace(/^https?:\/\/[^/]+/, '')
        .replace(/^\//, '');
      return new Response(readFileSync(join(process.cwd(), 'public', relative), 'utf8'), { status: 200 });
    };
    resetAlgiGenomeCacheForTests();
    try {
      const result = await composeAlgiLessonKernels({
        structuredPrompt: {
          courseName: 'Introduction to Statistics',
          lessons: [
            {
              lessonId: 'lesson-1',
              title: 'Inference in Practice',
              topics: [
                '8.1: Confidence Intervals: The Basics',
                'Use source evidence about confidence intervals and p-values to justify one decision in inference.',
              ],
              objectives: ['Apply the evidence in an assessment and document the lesson-specific revision path.'],
            },
          ],
        },
        factCount: 5,
      });

      expect(result.covered).toBe(1);
      expect(JSON.parse(result.text).lessons[0]).toMatchObject({ lessonId: 'lesson-1' });
    } finally {
      globalThis.fetch = originalFetch;
      resetAlgiGenomeCacheForTests();
    }
  });

  it('does not call general WCAG background sufficient for accessibility evaluation and remediation', async () => {
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
          'Digital Accessibility for Product Teams, exactly four lessons: WCAG principles and conformance; semantic HTML and keyboard accessibility; accessible forms; evidence-based accessibility testing and remediation.',
        researchEnabled: false,
      });

      expect(forecast.lessons.at(-1)).toMatchObject({
        title: 'evidence-based accessibility testing and remediation',
        status: 'source-gap',
        route: 'unsupported-private',
      });
      expect(forecast.externalNeeded).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
      resetAlgiGenomeCacheForTests();
    }
  });
});
