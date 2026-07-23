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
});
