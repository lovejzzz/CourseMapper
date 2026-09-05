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
  it('binds every provider query variant to the immutable instructional instance', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Evidence Methods',
      lessons: [
        {
          lessonId: 'lesson-1',
          instructionalInstanceId: 'a'.repeat(64),
          planBodySha256: 'b'.repeat(64),
          title: 'Minimal pair evidence',
        },
      ],
    });

    expect(plan.lessons[0]).toMatchObject({
      instructionalInstanceId: 'a'.repeat(64),
      planBodySha256: 'b'.repeat(64),
    });
    expect(Object.values(plan.lessons[0].providerQueryReceipts).flat()).not.toHaveLength(0);
    expect(
      Object.values(plan.lessons[0].providerQueryReceipts)
        .flat()
        .every((receipt) => /^[a-f0-9]{64}$/.test(receipt.queryId) && receipt.query),
    ).toBe(true);
  });

  it('routes visual-analysis foundations through canonical sources before scholarly search', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Visual Evidence and Image Analysis',
      lessons: [
        {
          lessonId: 'lesson-1',
          title: 'Rule of Thirds Application · Foundational Composition Elements',
        },
      ],
      now: Date.UTC(2026, 7, 4),
    });

    expect(inferAlgiResearchDomain(plan.courseName, plan.lessons)).toBe('visual-humanities');
    expect(plan.providerOrder).toEqual(['wikipedia', 'doaj']);
    expect(plan.lessons[0].providerQueries.wikipedia).toContain('visual arts');
  });

  it('uses catalog morphology in the primary query for an abstract multiword lesson label', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Visual Evidence and Image Analysis',
      lessons: [{ lessonId: 'lesson-5', title: 'Ethical contextual interpretation' }],
    });

    expect(providerQueryForLesson(plan, 'Ethical contextual interpretation', 'wikipedia')).toBe(
      'ethical context interpretation visual arts',
    );
  });

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
      'data types computer programming',
    ]);
  });

  it('does not send textbook section locators to source providers', () => {
    const title = 'Describing Distributions with Numbers (2.4) · Describing Distributions with Numbers';
    const plan = planAlgiCourseResearch({
      courseName: 'Introduction to Statistics',
      lessons: [{ lessonId: 'lesson-2', title }],
    });

    expect(plan.lessons[0].title).toBe(title);
    expect(providerQueryVariantsForLesson(plan, title, 'wikipedia').join(' ')).not.toContain('(2.4)');
  });

  it('uses the planned evidence object and a statistics disambiguator for ambiguous lesson labels', () => {
    const title = 'Two-Way Tables Analysis · Two-Way Tables';
    const plan = planAlgiCourseResearch({
      courseName: 'Introduction to the Practice of Statistics',
      lessons: [
        {
          lessonId: 'lesson-6',
          title,
          objectives: ['Compare conditional proportions for two categorical variables.'],
          evidenceIntent: ['Interpret an observed association without claiming causation.'],
        },
      ],
    });

    const variants = providerQueryVariantsForLesson(plan, title, 'wikipedia');
    expect(variants[0]).toContain('statistics');
    expect(variants.some((query) => /categorical variables/i.test(query))).toBe(true);
    expect(plan.lessons[0].evidenceContext).toMatch(/conditional proportions/i);
  });

  it('searches frozen evidence clauses independently when a broad lesson title can hide the taught specialization', () => {
    const title = 'Cross-Linguistic Comparison';
    const plan = planAlgiCourseResearch({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          lessonId: 'lesson-12',
          title,
          topics: ['Typological Approaches to Language Comparison', 'Comparative Analysis of Grammatical Structures'],
          objectives: ['Compare attested structures and bound the conclusion to the sampled languages.'],
        },
      ],
    });

    const variants = providerQueryVariantsForLesson(plan, title, 'wikipedia');
    expect(variants[0]).toBe('"cross-linguistic" linguistics');
    expect(variants).toEqual(
      expect.arrayContaining([
        '"typological approaches language" linguistics',
        '"comparative analysis grammatical structures" linguistics',
      ]),
    );
  });

  it('does not misroute language data and corpus lessons as quantitative research', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Introduction to Language Structure',
      lessons: [
        { lessonId: 'lesson-1', title: 'Phoneme Definition and Contrast · Phonological Systems' },
        { lessonId: 'lesson-2', title: 'Corpus Selection and Annotation · Data Analysis Project' },
        { lessonId: 'lesson-3', title: 'Head Movement and Structure · Advanced Syntax' },
      ],
    });

    expect(plan.domain).toBe('linguistics');
    expect(plan.providerOrder).toEqual(['wikipedia', 'doaj']);
    expect(providerQueryForLesson(plan, 'Head Movement and Structure · Advanced Syntax', 'wikipedia')).toBe(
      '(head movement OR structure OR advanced syntax) linguistics',
    );
  });

  it('searches for the disciplinary concept inside a pedagogical action label', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Introduction to Language Structure',
      lessons: [{ lessonId: 'lesson-1', title: 'Defining Linguistic Evidence' }],
    });

    expect(providerQueryForLesson(plan, 'Defining Linguistic Evidence', 'wikipedia')).toBe(
      '"linguistic evidence" linguistics',
    );
    expect(providerQueryVariantsForLesson(plan, 'Defining Linguistic Evidence', 'wikipedia')).toContain(
      'linguistic evidence linguistics',
    );
  });

  it('inherits one bounded parent-domain disambiguator across clause revisions', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Applied Programming and Statistics',
      lessons: [{ lessonId: 'lesson-1', title: 'Inputs, outputs, debugging, deployment, and review' }],
    });

    const variants = providerQueryVariantsForLesson(
      plan,
      'Inputs, outputs, debugging, deployment, and review',
      'wikipedia',
    );
    expect(variants).toHaveLength(4);
    expect(variants.slice(1)).toEqual([
      '"inputs" computer programming',
      '"outputs" computer programming',
      '"debugging" computer programming',
    ]);
  });

  it('does not mistake systems-engineering inputs and functions for programming', () => {
    const plan = planAlgiCourseResearch({
      courseName: 'Systems Engineering',
      lessons: [{ lessonId: 'lesson-1', title: 'Inputs, outputs, and transfer functions' }],
    });

    expect(plan.domain).toBe('quantitative');
    expect(providerQueryVariantsForLesson(plan, 'Inputs, outputs, and transfer functions', 'wikipedia')).toEqual([
      '(inputs OR outputs OR transfer functions) data analysis',
      '"inputs" data analysis',
      '"outputs" data analysis',
      '"transfer functions" data analysis',
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
