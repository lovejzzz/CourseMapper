import { describe, expect, it } from 'vitest';
import {
  inferAlgiResearchDomain,
  planAlgiCourseResearch,
  providerQueryForLesson,
  providerQueryVariantsForLesson,
  providerSupportsLesson,
  summarizeAlgiResearchPlan,
} from '../algiResearchPlan.js';

describe('Algi course research planning', () => {
  it('routes biomedical research to Europe PMC before broad discovery', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Environmental Microbiology',
      lessons: [
        { lessonId: 'lesson-1', title: 'Waterborne pathogens' },
        { lessonId: 'lesson-2', title: 'Microbial risk assessment' },
      ],
      now: Date.UTC(2026, 6, 27),
    });

    expect(plan).toMatchObject({
      protocol: 'algi-course-research-plan-v1',
      domain: 'biomedical',
      providerOrder: ['europe-pmc', 'doaj', 'wikipedia'],
      maximumProviderPasses: 3,
    });
    expect(providerQueryForLesson(plan, 'Waterborne pathogens', 'europe-pmc')).toContain('"Waterborne pathogens"');
    expect(providerSupportsLesson(plan, 'Waterborne pathogens', 'europe-pmc')).toBe(true);
    expect(summarizeAlgiResearchPlan(plan)).toMatchObject({
      lessonCount: 2,
      providerOrder: ['europe-pmc', 'doaj', 'wikipedia'],
      queryCount: 6,
    });
  });

  it('does not spend biomedical catalog calls on humanities courses', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'World Literature',
      lessons: [{ lessonId: 'lesson-1', title: 'Postcolonial narrative and voice' }],
    });

    expect(inferAlgiResearchDomain('World Literature', plan.lessons)).toBe('humanities');
    expect(plan.providerOrder).toEqual(['doaj', 'wikipedia']);
    expect(providerSupportsLesson(plan, 'Postcolonial narrative and voice', 'europe-pmc')).toBe(false);
    expect(providerQueryForLesson(plan, 'Postcolonial narrative and voice', 'wikipedia')).toBe(
      '(postcolonial narrative OR voice)',
    );
  });

  it('learns foundational quantitative concepts from a reference source before adjacent papers', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Applied Programming and Statistics',
      lessons: [
        { lessonId: 'lesson-1', title: 'Data types and expressions' },
        { lessonId: 'lesson-2', title: 'Control flow structures' },
      ],
    });

    expect(plan.domain).toBe('quantitative');
    expect(plan.providerOrder).toEqual(['wikipedia', 'doaj']);
    expect(plan.lessons.every((lesson) => lesson.providerOrder[0] === 'wikipedia')).toBe(true);
    expect(providerQueryForLesson(plan, 'Data types and expressions', 'wikipedia')).toBe(
      '(data types OR expressions) computer programming',
    );
    expect(providerQueryVariantsForLesson(plan, 'Data types and expressions', 'wikipedia')).toEqual([
      '(data types OR expressions) computer programming',
      '"data types" computer programming',
      '"expressions" computer programming',
    ]);
  });

  it('lets biomedical course context outrank collision-prone programming words', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Molecular Biology',
      lessons: [
        { lessonId: 'lesson-1', title: 'Gene expression and regulation' },
        { lessonId: 'lesson-2', title: 'Cardiac function and output' },
      ],
    });

    expect(plan.domain).toBe('biomedical');
    expect(providerQueryForLesson(plan, 'Gene expression and regulation', 'wikipedia')).toBe(
      '(gene expression OR regulation) biology',
    );
    expect(providerQueryForLesson(plan, 'Cardiac function and output', 'wikipedia')).toBe(
      '(cardiac function OR output) biology',
    );
  });

  it('treats digital accessibility as a research domain and disambiguates encyclopedia queries', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Digital Accessibility for Product Teams',
      lessons: [{ lessonId: 'lesson-1', title: 'accessible forms' }],
    });
    expect(plan.domain).toBe('social-science');
    expect(plan.providerOrder).toEqual(['w3c-wai', 'wikipedia', 'doaj']);
    expect(providerQueryForLesson(plan, 'accessible forms', 'wikipedia')).toBe('"accessible forms" digital');
  });

  it('marks current policy lessons for a short cache lifetime', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Technology Policy',
      lessons: [{ lessonId: 'lesson-1', title: 'Current AI regulation and standards' }],
    });
    expect(plan.lessons[0]).toMatchObject({
      timeSensitive: true,
      freshnessDays: 2,
      intent: 'concept-and-application',
    });
  });

  it('searches scholarly catalogs for concept phrases instead of an instructor wrapper sentence', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Urban Heat Resilience and Environmental Justice',
      lessons: [
        {
          lessonId: 'lesson-4',
          title: 'Cooling interventions, implementation trade-offs, and evaluation',
        },
        {
          lessonId: 'lesson-5',
          title: 'Community-engaged heat resilience planning',
        },
      ],
    });

    expect(
      providerQueryForLesson(plan, 'Cooling interventions, implementation trade-offs, and evaluation', 'doaj'),
    ).toBe('"cooling interventions" AND urban');
    expect(providerQueryForLesson(plan, 'Community-engaged heat resilience planning', 'doaj')).toBe(
      '"community-engaged heat resilience" AND urban',
    );
  });
});
