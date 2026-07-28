import { describe, expect, it } from 'vitest';
import { buildScionLocalAgentAnswer } from '../scionLocalAgentAnswer';

describe('buildScionLocalAgentAnswer', () => {
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
