import { describe, expect, it } from 'vitest';
import { joinAnswerParts, responseLength, responseLengths, verifyAnswer } from '../answer';
import type { Activity } from '../domain';

describe('model answers must meet the student task', () => {
  it('counts the actual response, not its heading or an asserted word count', () => {
    expect(responseLength("A well-supported claim isn't a survey.", 'words')).toBe(6);
    expect(responseLength('陶片甲：红褐色，有刻痕。', 'characters')).toBe(9);
    expect(responseLengths('between 100 and 150 words; 一份120至180字展签')).toEqual([
      { min: 100, max: 150, unit: 'words' },
      { min: 120, max: 180, unit: 'characters' },
    ]);
  });
  it('rejects a short model response even when its own declared limit is reduced', () => {
    const answerParts = [
      {
        title: 'Recommendation',
        text: 'Collect broader evidence before deciding.',
        length: { unit: 'words' as const, min: 1, max: 10 },
      },
    ];
    const a = {
      prompt: 'Write a 100–150 word recommendation.',
      product: 'Recommendation',
      answerParts,
      answer: joinAnswerParts(answerParts),
    } as Activity;
    expect(verifyAnswer(a).join(' ')).toContain('100–150');
    expect(
      verifyAnswer({ ...a, prompt: 'Write a recommendation.' }, 'The final assessment requires 300–400 words.').join(
        ' ',
      ),
    ).toContain('300–400');
  });
  it('checks the label separately from its accompanying evidence explanation', () => {
    const answerParts = [
      { title: '展签', text: '红褐陶片具有两条刻痕。', length: { unit: 'characters' as const, min: 8, max: 14 } },
      { title: '证据说明', text: '登记卡没有记载烧制年代。因此不能把入藏时间误写成制作年代。', length: null },
    ];
    const a = {
      prompt: '写一份8至14字展签及证据说明。',
      product: '展签及说明',
      answerParts,
      answer: joinAnswerParts(answerParts),
    } as Activity;
    expect(verifyAnswer(a)).toEqual([]);
    expect(verifyAnswer({ ...a, answer: 'An unrecorded replacement answer.' }).join(' ')).toContain('disagree');
  });
});
