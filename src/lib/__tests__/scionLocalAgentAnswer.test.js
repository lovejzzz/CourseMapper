import { describe, expect, it } from 'vitest';
import { buildScionLocalAgentAnswer } from '../scionLocalAgentAnswer';

describe('buildScionLocalAgentAnswer', () => {
  it('answers a production-routed lesson alignment audit from exact course-map fields', async () => {
    const result = await buildScionLocalAgentAnswer({
      question:
        'Read-only audit: inspect Lesson 2 and report one alignment gap between its objective and assessment, citing the exact fields.',
      courseMap: {
        lessons: [
          { title: 'Lesson 1', sections: [] },
          {
            title: 'Lesson 2: Arrays',
            sections: [
              {
                learningObjectives: 'Trace array indexing and explain its constant-time access.',
                weeklyAssessments: '',
              },
            ],
          },
        ],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-map-evidence' });
    expect(result.text).toContain('Lesson 2, section 1');
    expect(result.text).toContain('Learning objectives');
    expect(result.text).toContain('Trace array indexing');
    expect(result.text).toContain('Weekly assessments');
    expect(result.text).toContain('is empty');
  });

  it('loads only the source-answer capability for an assigned-source question', async () => {
    const result = await buildScionLocalAgentAnswer({
      question: 'Which assigned sources support semantic HTML, and what can each source establish?',
      courseMap: {
        lessons: [
          {
            title: 'Lesson 1: semantic HTML',
            sections: [
              {
                supportingResources:
                  '1. Semantic HTML (open encyclopedia, CC BY-SA 4.0 — https://en.wikipedia.org/wiki/Semantic_HTML) 2. Page structure (official accessibility tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/page-structure/)',
              },
            ],
          },
        ],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 1 });
    expect(result.text).toContain('**Semantic HTML**');
    expect(result.text).toContain('**Page structure**');
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/page-structure/');
    expect(result.text).toContain('do not by themselves prove');
  });

  it('routes list-every-official-source wording to the evidence answer', async () => {
    const result = await buildScionLocalAgentAnswer({
      question:
        'List every official source assigned to Lesson 1, including the evaluation methodology, and explain why Easy Checks cannot prove conformance.',
      courseMap: {
        lessons: [{ title: 'Lesson 1: accessibility testing and remediation', sections: [] }],
      },
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              conceptProvenance: {
                citations: [
                  {
                    displayTitle: 'Easy Checks',
                    sourceUrl: 'https://www.w3.org/WAI/test-evaluate/preliminary/',
                  },
                  {
                    displayTitle: 'WCAG-EM overview',
                    sourceUrl: 'https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/',
                  },
                ],
              },
            },
          },
        },
      },
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 1 });
    expect(result.text).toContain('**Easy Checks**');
    expect(result.text).toContain('**WCAG-EM overview**');
    expect(result.text).toContain('does not establish comprehensive accessibility or conformance');
  });

  it('answers an official-source question and explains the requested cross-lesson connection', async () => {
    const result = await buildScionLocalAgentAnswer({
      question: 'What official source supports Lesson 3 accessible forms, and how does it connect to Lesson 4?',
      courseMap: {
        lessons: [
          { title: 'Lesson 1: WCAG principles', sections: [] },
          { title: 'Lesson 2: semantic HTML', sections: [] },
          {
            title: 'Lesson 3: Accessible forms',
            sections: [
              {
                supportingResources:
                  '1. Accessible forms (official accessibility tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/) 2. Labels (official accessibility tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/labels/)',
              },
            ],
          },
          {
            title: 'Lesson 4: Evidence-based accessibility testing and remediation',
            sections: [],
          },
        ],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 3 });
    expect(result.text).toContain('**Accessible forms**');
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/forms/');
    expect(result.text).toContain('**Connection to Lesson 4: Evidence-based accessibility testing and remediation**');
    expect(result.text).toContain('findings and unresolved barriers from Lesson 3');
    expect(result.text).not.toContain('Lesson 1 uses');
  });

  it('connects lessons named by topic when the question omits lesson numbers', async () => {
    const result = await buildScionLocalAgentAnswer({
      question:
        'Which official sources support the accessible forms lesson, and how should evidence from that lesson inform the testing and remediation lesson?',
      courseMap: {
        lessons: [
          { title: 'Lesson 1: WCAG principles and conformance', sections: [] },
          { title: 'Lesson 2: Semantic HTML and keyboard accessibility', sections: [] },
          {
            title: 'Lesson 3: Accessible forms',
            sections: [
              {
                supportingResources:
                  '1. Accessible forms (official accessibility tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/) 2. Labels (official accessibility tutorial, W3C permissive license — https://www.w3.org/WAI/tutorials/forms/labels/)',
              },
            ],
          },
          {
            title: 'Lesson 4: Evidence-based accessibility testing and remediation',
            sections: [],
          },
        ],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 3 });
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/forms/');
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/forms/labels/');
    expect(result.text).toContain('**Connection to Lesson 4: Evidence-based accessibility testing and remediation**');
    expect(result.text).toContain('findings and unresolved barriers from Lesson 3');
  });

  it.each([
    {
      scenario: 'replaces display citations with classroom-resource prose',
      displayResources: 'Prototype or wireframe tool, shared critique notes, and the assigned UX example.',
    },
    {
      scenario: 'leaves a stale display link with the same source topic',
      displayResources:
        'Prototype or wireframe tool, shared critique notes, and an outdated Accessible forms link (https://example.invalid/forms).',
    },
  ])('answers from the canonical source ledger after sync $scenario', async ({ displayResources }) => {
    const result = await buildScionLocalAgentAnswer({
      question:
        'Which official sources support accessible forms, and how should Lesson 3 evidence inform Lesson 4 testing and remediation?',
      courseMap: {
        lessons: [
          { title: 'Lesson 1: WCAG principles and conformance decision-making', sections: [] },
          { title: 'Lesson 2: Semantic HTML and keyboard accessibility', sections: [] },
          {
            title: 'Lesson 3: accessible forms',
            sections: [
              {
                supportingResources: displayResources,
              },
            ],
          },
          {
            title: 'Lesson 4: evidence-based accessibility testing and remediation',
            sections: [],
          },
        ],
      },
      courseGraph: {
        sessions: [
          { id: 's1', number: 1 },
          { id: 's2', number: 2 },
          {
            id: 's3',
            number: 3,
            sections: [{ topic: 'accessible forms', resourceRefs: ['kr7', 'kr8'] }],
          },
          { id: 's4', number: 4 },
        ],
        resources: [
          {
            id: 'kr7',
            citation: 'Accessible forms',
            origin: 'w3c-wai',
            provider: 'w3c-wai',
            kind: 'official accessibility tutorial',
            url: 'https://www.w3.org/WAI/tutorials/forms/',
            license: 'W3C permissive license',
            sessionRefs: ['s3'],
          },
          {
            id: 'kr8',
            citation: 'Labels',
            origin: 'w3c-wai',
            provider: 'w3c-wai',
            kind: 'official accessibility tutorial',
            url: 'https://www.w3.org/WAI/tutorials/forms/labels/',
            license: 'W3C permissive license',
            sessionRefs: ['s3'],
          },
        ],
        readings: [],
      },
      deliverables: {},
    });

    expect(result).toMatchObject({ kind: 'course-evidence', lessonNumber: 3 });
    expect(result.text).toContain('**Accessible forms**');
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/forms/');
    expect(result.text).toContain('**Labels**');
    expect(result.text).toContain('https://www.w3.org/WAI/tutorials/forms/labels/');
    expect(result.text).not.toContain('https://example.invalid/forms');
    expect(result.text).toContain('**Connection to Lesson 4: Evidence-based accessibility testing and remediation**');
    expect(result.text).toContain('findings and unresolved barriers from Lesson 3');
    expect(result.text).not.toContain('I couldn’t finish');
  });

  it('falls through conservatively when no compiled evidence can answer', async () => {
    await expect(
      buildScionLocalAgentAnswer({
        question: 'Invent the best new case study for this course.',
        courseMap: { lessons: [] },
        deliverables: {},
      }),
    ).resolves.toBeNull();
  });
});
