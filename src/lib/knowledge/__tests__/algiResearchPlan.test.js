import { describe, expect, it } from 'vitest';
import {
  inferAlgiResearchDomain,
  planAlgiCourseResearch,
  providerQueryForLesson,
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
});
