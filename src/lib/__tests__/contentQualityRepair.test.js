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
