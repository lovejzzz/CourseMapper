import { describe, expect, it } from 'vitest';
import { repairDeliverableContentQuality } from '../contentQualityRepair';
import { auditDeliverableContentQuality } from '../contentQualityChecks';

describe('contentQualityRepair (v0.12.1 P2)', () => {
  it('fixes every mechanical finding class so the detector passes afterwards', () => {
    const data = {
      faq: [
        {
          question: 'What should I focus on?',
          answer: 'Connect ideas to the weekly memo.. Strong work explains a decision.',
        },
        { question: ': Leading label', answer: 'Pick a Evidence example aligned to .' },
      ],
    };
    const before = auditDeliverableContentQuality('courseFaq', data);
    expect(before.findings.length).toBeGreaterThan(0);

    const { data: repaired, changed, repairedStrings } = repairDeliverableContentQuality('courseFaq', data);
    expect(changed).toBe(true);
    expect(repairedStrings).toBeGreaterThan(0);
    expect(repaired.faq[0].answer).toBe('Connect ideas to the weekly memo. Strong work explains a decision.');
    expect(repaired.faq[1].question).toBe('Leading label');
    expect(repaired.faq[1].answer).toBe('Pick an Evidence example.');

    const after = auditDeliverableContentQuality('courseFaq', repaired);
    expect(after.findings).toHaveLength(0);
  });

  it('repairs duplicated learner subjects and malformed plural concept-detail frames', () => {
    const data = {
      decks: [
        {
          slides: [
            {
              bullets: [
                'Students may assume students often treat conformance as a checklist.',
                'Use feedback to separate a solid WCAG principles and conformance detail from the next gap.',
              ],
            },
          ],
        },
      ],
    };

    expect(auditDeliverableContentQuality('slideDecks', data).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicated-student-subject' }),
        expect.objectContaining({ code: 'malformed-concept-detail' }),
      ]),
    );

    const result = repairDeliverableContentQuality('slideDecks', data);
    expect(result.changed).toBe(true);
    expect(result.data.decks[0].slides[0].bullets).toEqual([
      'A common assumption is that people treat conformance as a checklist.',
      'Use feedback to separate a strong detail about WCAG principles and conformance from the next gap.',
    ]);
    expect(auditDeliverableContentQuality('slideDecks', result.data).findings).toHaveLength(0);
  });

  it('repairs legacy framing collisions and sentence-shaped assessment identities before export', () => {
    const data = {
      lessonPlans: [
        {
          objective: 'Audit a practical the Pandas Tabular Data focus example and explain one risk.',
          title: 'Apply Conditional Branching Logic to one example and name one limitation.',
          overview:
            'Use Apply Conditional Branching Logic to one example and name one limitation as the weekly checkpoint.',
        },
      ],
    };

    expect(auditDeliverableContentQuality('lessonPlans', data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'article-collision' })]),
    );

    const result = repairDeliverableContentQuality('lessonPlans', data);

    expect(result.changed).toBe(true);
    expect(result.data.lessonPlans[0]).toEqual({
      objective: 'Audit a practical Pandas Tabular Data focus example and explain one risk.',
      title: 'Conditional Branching Logic application check',
      overview: 'Use Conditional Branching Logic application check as the weekly checkpoint.',
    });
    expect(auditDeliverableContentQuality('lessonPlans', result.data).findings).toHaveLength(0);
  });

  it('keeps prefixed assessment titles and body references synchronized', () => {
    const data = {
      assignments: [
        {
          assessmentTitle: 'Unit 3: Apply Conditional Branching Logic to one example and name one limitation.',
          instructions:
            'Use Unit 3: Apply Conditional Branching Logic to one example and name one limitation before submission.',
        },
      ],
    };

    const result = repairDeliverableContentQuality('assignments', data);

    expect(result.data.assignments[0]).toEqual({
      assessmentTitle: 'Unit 3: Conditional Branching Logic application check',
      instructions: 'Use Unit 3: Conditional Branching Logic application check before submission.',
    });
  });

  it('removes a known off-topic source sentence from saved teaching copy without erasing surrounding guidance', () => {
    const data = {
      decks: [
        {
          lessonTitle: 'Lesson 6: Capstone Policy Memo',
          slides: [
            {
              bullets: [
                'Use policy evidence to bound the recommendation.',
                'The interoperability of ImageJ2 ensures Molecule Archives can easily be opened in multiple environments.',
              ],
              notes:
                'Compare the policy evidence first. The interoperability of ImageJ2 ensures Molecule Archives can easily be opened in multiple environments. Name one limitation before revising.',
            },
          ],
        },
      ],
    };

    const result = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Python for Public Policy Analysis',
    });

    expect(result.changed).toBe(true);
    expect(JSON.stringify(result.data)).not.toMatch(/ImageJ|Molecule Archives/i);
    expect(result.data.decks[0].slides[0].bullets).toEqual([
      'Use policy evidence to bound the recommendation.',
      'Use a course-aligned example and verify its source before publishing.',
    ]);
    expect(result.data.decks[0].slides[0].notes).toBe(
      'Compare the policy evidence first. Name one limitation before revising.',
    );

    const imageCourse = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Biomedical Image Analysis with ImageJ2',
    });
    expect(imageCourse.changed).toBe(false);

    const explicitlyRequested = repairDeliverableContentQuality('slideDecks', data, {
      courseName: 'Biomedical Imaging Studio',
      sourceBrief: 'Teach ImageJ2 workflows and require students to compare Molecule Archives.',
    });
    expect(explicitlyRequested.changed).toBe(false);

    const systematicReviewCourse = repairDeliverableContentQuality(
      'studyGuides',
      { reviewNotes: ['Use PRISMA to report the evidence synthesis.'] },
      { courseName: 'Systematic Review Methods' },
    );
    expect(systematicReviewCourse.changed).toBe(false);

    const artHistoryCourse = repairDeliverableContentQuality(
      'studyGuides',
      { reviewNotes: ['Compare L. S. Lowry with other painters of industrial life.'] },
      { courseName: 'Modern British Art History' },
    );
    expect(artHistoryCourse.changed).toBe(false);

    const prismaticLanguage = repairDeliverableContentQuality(
      'studyGuides',
      { reviewNotes: ['Describe the prismatic color structure in the painting.'] },
      { courseName: 'Color and Composition Studio' },
    );
    expect(prismaticLanguage.changed).toBe(false);

    const wholeFieldLeak = repairDeliverableContentQuality(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'The interoperability of ImageJ2 with SciJava.',
            objectives: ['The interoperability of ImageJ2 supports Molecule Archives.'],
          },
        ],
      },
      { courseName: 'Python for Public Policy Analysis' },
    );
    expect(wholeFieldLeak.changed).toBe(true);
    expect(wholeFieldLeak.data.lessonPlans[0].lessonTitle).toBe('Course-aligned source review');
    expect(wholeFieldLeak.data.lessonPlans[0].objectives).toEqual([
      'Use a course-aligned example and verify its source before publishing.',
    ]);
  });

  it('turns circular fallback glossary prose into an honest definition-review notice', () => {
    const data = {
      studyGuides: [
        {
          keyTerms: [
            {
              term: 'Accessibility evidence',
              definition:
                'Accessibility evidence names the evidence focus students use when deciding what counts as support.',
            },
          ],
        },
      ],
    };

    expect(auditDeliverableContentQuality('studyGuides', data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'procedural-term-definition' })]),
    );
    const result = repairDeliverableContentQuality('studyGuides', data);

    expect(result.changed).toBe(true);
    expect(result.data.studyGuides[0].keyTerms[0].definition).toMatch(/does not supply a disciplinary definition/i);
    expect(auditDeliverableContentQuality('studyGuides', result.data).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-disciplinary-definition' })]),
    );
  });

  it('preserves identity when nothing needs fixing and leaves ellipses alone', () => {
    const data = { notes: ['All good here.', 'Thinking… more thoughts...'] };
    const { data: repaired, changed } = repairDeliverableContentQuality('studyGuides', data);
    expect(changed).toBe(false);
    expect(repaired).toBe(data);
  });

  it('does not touch abbreviation periods (e.g., etc.)', () => {
    const data = { tip: 'Bring examples, readings, etc. A compact example, e.g., this one, stays intact.' };
    const { changed } = repairDeliverableContentQuality('studyGuides', data);
    expect(changed).toBe(false);
  });

  it('removes an impossible period before a comma without altering disciplinary content', () => {
    const data = {
      faq: [
        'For the Week 1 check., state one accurate claim.',
        'Use “我是学生。,” then compare the corrected example.',
        'The source says “use the contour.”, then asks students to listen again.',
      ],
    };

    const result = repairDeliverableContentQuality('courseFaq', data);

    expect(result.changed).toBe(true);
    expect(result.repairedStrings).toBe(3);
    expect(result.data.faq).toEqual([
      'For the Week 1 check, state one accurate claim.',
      'Use “我是学生,” then compare the corrected example.',
      'The source says “use the contour”, then asks students to listen again.',
    ]);
  });

  it('preserves valid phrasal verbs that end in a preposition', () => {
    const data = {
      notes: [
        'Ask students which cue they should watch for.',
        'Name the source they will work with.',
        'The conclusion holds whatever foods the energy comes from.',
      ],
    };
    const result = repairDeliverableContentQuality('slideDecks', data);

    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });

  it('turns assignment logistics deferrals into self-contained submission requirements', () => {
    const data = {
      assignments: [
        {
          formatRequirements: [
            'Submission format: organize the memo in the medium listed for the task.',
            'Use the format and channel listed for this task.',
            'Follow the word, page, or time limit specified in the course site.',
            'Use the course citation style.',
          ],
        },
      ],
    };

    const before = auditDeliverableContentQuality('assignments', data);
    expect(before.findings.some((finding) => finding.code === 'instructor-configuration-deferral')).toBe(true);

    const result = repairDeliverableContentQuality('assignments', data);
    const after = auditDeliverableContentQuality('assignments', result.data);

    expect(result.changed).toBe(true);
    expect(result.data.assignments[0].formatRequirements).toEqual([
      'Submission format: organize the memo with descriptive headings and an evidence list.',
      'submit one clearly labeled artifact that preserves the required evidence, reasoning, revision, and citations.',
      'use enough space to present the required evidence, reasoning, and revision without padding.',
      'use one consistent citation style and include enough information for readers to locate every source.',
    ]);
    expect(after.findings.filter((finding) => finding.code === 'instructor-configuration-deferral')).toHaveLength(0);
  });
});
