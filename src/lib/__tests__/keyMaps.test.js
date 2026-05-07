import { describe, it, expect } from 'vitest';
import { KEY_MAPS, expandKeys } from '../keyMaps';

describe('KEY_MAPS', () => {
  it('has maps for all expected deliverables', () => {
    expect(KEY_MAPS).toHaveProperty('lessonPlans');
    expect(KEY_MAPS).toHaveProperty('slideDecks');
    expect(KEY_MAPS).toHaveProperty('rubrics');
    expect(KEY_MAPS).toHaveProperty('quizBank');
    expect(KEY_MAPS).toHaveProperty('assignments');
    expect(KEY_MAPS).toHaveProperty('discussions');
    expect(KEY_MAPS).toHaveProperty('studyGuides');
    expect(KEY_MAPS).toHaveProperty('courseFaq');
  });

  it('does not include syllabus (intentionally excluded)', () => {
    expect(KEY_MAPS).not.toHaveProperty('syllabus');
  });

  it('maps short keys to full names in lessonPlans', () => {
    expect(KEY_MAPS.lessonPlans.lt).toBe('lessonTitle');
    expect(KEY_MAPS.lessonPlans.wk).toBe('weekNumber');
    expect(KEY_MAPS.lessonPlans.dur).toBe('duration');
    expect(KEY_MAPS.lessonPlans.ob).toBe('objectives');
  });

  it('maps short keys to full names in quizBank', () => {
    expect(KEY_MAPS.quizBank.q).toBe('question');
    expect(KEY_MAPS.quizBank.an).toBe('answer');
    expect(KEY_MAPS.quizBank.ty).toBe('type');
    expect(KEY_MAPS.quizBank.df).toBe('difficulty');
  });

  it('maps slide visual wrapper alias', () => {
    expect(KEY_MAPS.slideDecks.vi).toBe('visual');
  });
});

describe('expandKeys', () => {
  it('expands minified keys in a flat object', () => {
    const input = { lt: 'Lesson 1', wk: 1, dur: '50min' };
    const result = expandKeys('lessonPlans', input);
    expect(result).toEqual({ lessonTitle: 'Lesson 1', weekNumber: 1, duration: '50min' });
  });

  it('expands keys in nested arrays', () => {
    const input = {
      lt: 'Lesson 1',
      ol: [{ tm: '10min', ac: 'Lecture', de: 'Introduction' }],
    };
    const result = expandKeys('lessonPlans', input);
    expect(result.lessonTitle).toBe('Lesson 1');
    expect(result.outline[0].time).toBe('10min');
    expect(result.outline[0].activity).toBe('Lecture');
    expect(result.outline[0].description).toBe('Introduction');
  });

  it('passes through full key names unchanged', () => {
    const input = { lessonTitle: 'Already expanded', weekNumber: 5 };
    const result = expandKeys('lessonPlans', input);
    expect(result).toEqual({ lessonTitle: 'Already expanded', weekNumber: 5 });
  });

  it('passes through data for unknown featureId', () => {
    const input = { foo: 'bar' };
    const result = expandKeys('syllabus', input);
    expect(result).toEqual({ foo: 'bar' });
  });

  it('returns null/undefined for null/undefined input', () => {
    expect(expandKeys('lessonPlans', null)).toBeNull();
    expect(expandKeys('lessonPlans', undefined)).toBeUndefined();
  });

  it('handles deeply nested quiz bank data', () => {
    const input = {
      lt: 'Quiz 1',
      tq: 2,
      qs: [
        { ty: 'multiple_choice', q: 'What is 2+2?', op: ['3', '4'], an: '4', bl: 'Remember' },
        { ty: 'short_answer', q: 'Explain gravity', sa: 'Force of attraction', bl: 'Understand' },
      ],
    };
    const result = expandKeys('quizBank', input);
    expect(result.lessonTitle).toBe('Quiz 1');
    expect(result.totalQuestions).toBe(2);
    expect(result.questions[0].type).toBe('multiple_choice');
    expect(result.questions[0].question).toBe('What is 2+2?');
    expect(result.questions[0].answer).toBe('4');
    expect(result.questions[1].sampleAnswer).toBe('Force of attraction');
  });

  it('handles mixed short and full keys gracefully', () => {
    const input = { lt: 'Mixed', lessonTitle: 'Ignored', wk: 3 };
    const result = expandKeys('lessonPlans', input);
    // Both "lt" → "lessonTitle" and existing "lessonTitle" should be in result
    expect(result.lessonTitle).toBeDefined();
    expect(result.weekNumber).toBe(3);
  });

  it('handles primitive values in arrays', () => {
    const input = { ob: ['Objective 1', 'Objective 2'] };
    const result = expandKeys('lessonPlans', input);
    expect(result.objectives).toEqual(['Objective 1', 'Objective 2']);
  });

  it('expands slide visuals without confusing alt text for activity type', () => {
    const input = {
      decks: [
        {
          lt: 'Lesson 1',
          sl: [
            {
              t: 'A model needs evidence',
              ty: 'content',
              at: null,
              vi: { k: 'image', d: 'A model comparison visual', at: 'Two model cards compared side by side.' },
            },
          ],
        },
      ],
    };
    const result = expandKeys('slideDecks', input);
    const slide = result.decks[0].slides[0];
    expect(slide.title).toBe('A model needs evidence');
    expect(slide.activityType).toBeNull();
    expect(slide.visual).toEqual({
      kind: 'image',
      description: 'A model comparison visual',
      altText: 'Two model cards compared side by side.',
    });
    expect(slide.visual.activityType).toBeUndefined();
  });
});
