import { describe, expect, it } from 'vitest';
import { operationSpecificTransfer } from '../teachingTaskTransferOperations.js';
import { projectTeachingTaskSlides } from '../compilerTeachingTaskSlides.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';

describe('independent practice preserves the operation being assessed', () => {
  it.each([
    ['counterbalance-order-and-task', /four sequences/, /symbol-search/],
    ['self-selection-and-baseline', /baseline-score bands/, /vocabulary/],
    ['cluster-treatment-unit', /independent trays/, /seedling/],
    ['incomplete-measurement-plan', /proposed choices/, /growing media/],
  ])('%s gives a new packet with an executable matching key', (kind, key, source) => {
    const result = operationSpecificTransfer({ operation: { kind } });
    expect(result.operationKind).toBe(kind);
    expect(result.sources.join(' ')).toMatch(source);
    expect(result.answer).toMatch(key);
    expect(result.question).not.toContain('Proposed procedure');
    expect(result.rubric).toHaveLength(3);
    result.rubric.forEach((criterion) =>
      expect(
        new Set(['exemplary', 'proficient', 'developing', 'beginning'].map((level) => criterion[level])).size,
      ).toBe(4),
    );
  });
  it('compares rate and count with different rankings, and diagnoses impossible counts without correcting them', () => {
    const comparison = operationSpecificTransfer({ kind: 'source-proportion-comparison' });
    expect(comparison.answer).toContain('70%');
    expect(comparison.answer).toContain('60%');
    expect(comparison.answer).toContain('first record has the higher proportion');
    expect(comparison.answer).toContain('second record has more counted outcomes');
    const validation = operationSpecificTransfer({ kind: 'source-proportion-validation' });
    expect(validation.answer).toContain('21 distinct completers exceed the 18');
    expect(validation.answer).toContain('does not identify which count is wrong');
  });
  it('returns no invented operation for an unsupported task', () => {
    expect(operationSpecificTransfer({ operation: { kind: 'unknown' } })).toBeNull();
  });
});

describe('slide content follows the teaching sequence and fits readable chunks', () => {
  const makeTask = () =>
    buildSharedTeachingTask({
      admitted: true,
      lessonId: 'test-order',
      objective: 'Design an experiment controlling order and practice.',
      claims: [
        'Everyone completes a puzzle in silence and then repeats the same puzzle with music.',
        'Practice and order are confounded; no counterbalanced order was used.',
      ],
    });
  it('adds all required reasoning before practice and removes obsolete chunks on replay', () => {
    const task = makeTask();
    const deck = {
      slides: [
        { type: 'title' },
        { type: 'activity' },
        { type: 'content' },
        { enrichmentSource: 'instructor', title: 'Teacher drawing', notes: 'Keep this' },
      ],
    };
    task.reasoning.push(Array(145).fill('reasoning').join(' '));
    projectTeachingTaskSlides(deck, task);
    const activity = deck.slides.findIndex((slide) => slide.taskRole === 'activity');
    expect(deck.slides.every((slide, i) => !slide.taskRole?.startsWith('worked:') || i < activity)).toBe(true);
    expect(
      deck.slides
        .filter((slide) => /^(record|worked|transfer-record)/.test(slide.taskRole))
        .every((slide) => slide.bullets.join(' ').split(/\s+/).length <= 60),
    ).toBe(true);
    const longCount = deck.slides.length;
    task.reasoning = ['One short step.'];
    projectTeachingTaskSlides(deck, task);
    expect(deck.slides.length).toBeLessThan(longCount);
    expect(deck.slides.find((slide) => slide.title === 'Teacher drawing').notes).toBe('Keep this');
    expect(new Set(deck.slides.map((slide) => slide.taskRole).filter(Boolean)).size).toBe(
      deck.slides.filter((slide) => slide.taskRole).length,
    );
  });
  it('bounds Chinese source chunks even without spaces', () => {
    const task = makeTask();
    task.language = 'zh';
    task.inputs = [{ text: '这是用于检查中文长段落换页的材料。'.repeat(40) }];
    const deck = { slides: [{ type: 'activity' }] };
    projectTeachingTaskSlides(deck, task);
    const records = deck.slides.filter((slide) => slide.taskRole?.startsWith('record:'));
    expect(records.length).toBeGreaterThan(1);
    expect(records.every((slide) => [...slide.bullets[0].replace(/\s/g, '')].length <= 180)).toBe(true);
  });
});
