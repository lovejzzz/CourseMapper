import { describe, it, expect } from 'vitest';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson } from '../teachingTaskSource.js';
import {
  createResponseReview,
  confirmResponseJudgment,
  undoResponseJudgment,
  summarizeResponseReviews,
  validateResponseReview,
} from '../teachingResponseReview.js';

function source() {
  const task = buildSharedTeachingTask({
    lessonId: 'response-review',
    objective: 'Explain how an amended record changes the interpretation of an earlier entry.',
    claims: [
      'A fictional permit log initially records 120 seats for a hall.',
      'A later entry explicitly amends the permitted capacity to 90 seats from 1 July.',
      'An attendance photograph has no reliable date.',
    ],
    admitted: true,
  });
  return teachingTaskSourceFromLesson({
    id: 'response-review',
    lessonNumber: 1,
    title: 'Records',
    teachingTask: task,
    teachingTaskScope: 'primary-task',
  });
}
const make = (id = 'sample') =>
  createResponseReview(source(), 'The amended limit is 90 seats. The photograph is undated.', { id });
function judgment(record, overrides = {}) {
  return {
    criterionId: record.snapshot.criteria[0].id,
    level: 'developing',
    reason: 'Names the amended value, but does not apply its effective date.',
    evidence: { start: 0, end: 29, quote: record.response.slice(0, 29) },
    ...overrides,
  };
}

describe('separate local student-response reviews', () => {
  it('freezes the original task and rubric independently of later source edits', () => {
    const input = source();
    const record = createResponseReview(input, '90 seats');
    input.inputs[0].text = 'Changed source';
    expect(record.snapshot.source.inputs[0].text).not.toBe('Changed source');
    expect(validateResponseReview(record)).toBe(record);
    record.snapshot.source.inputs[0].text = 'Corrupt snapshot';
    expect(() => validateResponseReview(record)).toThrow(/revision/);
  });
  it('does not infer a grade, and requires exact response evidence plus a teacher reason', () => {
    const record = make();
    expect(record.judgments).toEqual([]);
    expect(() => confirmResponseJudgment(record, judgment(record, { evidence: null }))).toThrow(/exact span/);
    expect(() =>
      confirmResponseJudgment(record, judgment(record, { evidence: { start: 0, end: 3, quote: '90' } })),
    ).toThrow(/exact span/);
    expect(() => confirmResponseJudgment(record, judgment(record, { reason: ' ' }))).toThrow(/reason/);
    expect(() => confirmResponseJudgment(record, judgment(record, { criterionId: 'different-rubric' }))).toThrow(
      /Unknown/,
    );
    const reviewed = confirmResponseJudgment(record, judgment(record));
    expect(reviewed.judgments[0].confirmedBy).toBe('teacher');
    expect(record.judgments).toEqual([]);
    expect(undoResponseJudgment(reviewed)).toEqual(record);
  });
  it('keeps insufficient evidence separate from beginning performance and unreviewed samples', () => {
    const first = make('one'),
      second = make('two'),
      third = make('three');
    const reviewed = confirmResponseJudgment(
      first,
      judgment(first, { level: 'insufficient', evidence: null, reason: 'No explanation of the date boundary.' }),
    );
    const mistaken = confirmResponseJudgment(second, judgment(second, { level: 'beginning' }));
    const result = summarizeResponseReviews(
      [reviewed, mistaken, third, reviewed],
      first.sourceRevision,
      first.rubricRevision,
    );
    expect(result.sampleCount).toBe(3);
    expect(result.criteria[0].counts).toEqual({
      exemplary: 0,
      proficient: 0,
      developing: 0,
      beginning: 1,
      insufficient: 1,
    });
    expect(result.criteria[0].unreviewed).toBe(1);
    expect(summarizeResponseReviews([reviewed], 'other-revision', first.rubricRevision).sampleCount).toBe(0);
    expect(summarizeResponseReviews([reviewed], first.sourceRevision, 'other-rubric').sampleCount).toBe(0);
  });
  it('retains prior confirmed evidence when a teacher corrects and undoes a judgment', () => {
    const record = make();
    const first = confirmResponseJudgment(record, judgment(record));
    const second = confirmResponseJudgment(
      first,
      judgment(first, { level: 'proficient', reason: 'The last sentence explicitly names the date uncertainty.' }),
    );
    expect(second.judgments).toHaveLength(1);
    expect(undoResponseJudgment(second)).toEqual(first);
    expect(validateResponseReview(JSON.parse(JSON.stringify(second)))).toEqual(second);
  });
  it('rejects oversized responses, forged confirmation and invalid archived evidence', () => {
    expect(() => createResponseReview(source(), 'x'.repeat(20001))).toThrow(/response/);
    const record = make();
    const reviewed = confirmResponseJudgment(record, judgment(record));
    reviewed.judgments[0].confirmedBy = 'model';
    expect(() => validateResponseReview(reviewed)).toThrow(/teacher/);
    const corrected = confirmResponseJudgment(confirmResponseJudgment(record, judgment(record)), judgment(record));
    corrected.history[1].judgments[0].evidence.quote = 'invented evidence';
    expect(() => validateResponseReview(corrected)).toThrow(/exact span/);
  });
});
