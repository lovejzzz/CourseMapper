import { describe, expect, it } from 'vitest';

import {
  appliedObjectiveCue,
  nonRedundantObjectiveDeclarations,
  objectiveConstructApplicationInstruction,
} from '../objectiveConstructInstruction.js';
import { objectiveTaskMapping } from '../quality/assessmentCoherence.js';

describe('objective construct application instruction', () => {
  it('keeps mathematical and unfamiliar objective wording instead of a comma-separated token list', () => {
    expect(
      appliedObjectiveCue(
        'Calculate 16/20 = 0.80 and distinguish the sample result from an unsupported population claim.',
      ),
    ).toBe('calculation of 16/20 = 0.80 and distinguish the sample result from an unsupported population claim');
    expect(appliedObjectiveCue('Sketch the circuit without shorting the battery.')).toBe(
      'Sketch the circuit without shorting the battery',
    );
    expect(appliedObjectiveCue('解释样本与总体的区别。')).toContain('解释样本与总体的区别');
  });
  it('turns inspect objectives into complete grammatical action cues', () => {
    expect(appliedObjectiveCue('Inspect dataset provenance and clean missing values before making a claim.')).toBe(
      'inspection of dataset provenance and clean missing values before making a claim',
    );
  });
  it('preserves coordinated noun phrases and normalizes comma edges before joining sequenced clauses', () => {
    const instruction = objectiveConstructApplicationInstruction(
      'Summarize center, spread, and any outliers, then interpret what the values show.',
      {
        artifact: 'calculation record',
        lessonTitle: 'Describing distributions numerically',
      },
    );
    expect(instruction).toContain(
      'First, summarize center, spread, and any outliers; then interpret what the values show',
    );
    expect(instruction).not.toContain('outliers,,');
    expect(instruction).not.toContain('grounded in summarize');
  });

  it('does not reconstruct an exact objective across adjacent transformed cue boundaries', () => {
    const objectives = [
      'Source-bound identification: Mandarin SVO example.',
      'Source-bound comparison: Mandarin SVO example, Irish VSO example.',
    ];
    const instruction = objectiveConstructApplicationInstruction(objectives, {
      artifact: 'evidence explanation',
      lessonTitle: 'Syntax: Sentence Frameworks',
    });
    const taskText = `${objectives.join(' ')} ${instruction}`;

    expect(objectiveTaskMapping(objectives[0], taskText)).toMatchObject({
      passed: true,
      declarationCount: 1,
      duplicatedDeclaration: false,
    });
  });

  it('turns audit, reference, and state objectives into grammatical action nouns', () => {
    const instruction = objectiveConstructApplicationInstruction(
      [
        'Audit ethical and contextual limits on an interpretation.',
        'Reference one visual detail that warrants the claim.',
        'State the boundary of the evidence.',
      ],
      { artifact: 'visual analysis memo', lessonTitle: 'Visual evidence' },
    );

    expect(instruction).toContain('audit of ethical and contextual limits');
    expect(instruction).toContain('reference to one visual detail');
    expect(instruction).not.toMatch(/“audit,|“reference,/i);
  });

  it('keeps atomic objectives when a source repeats them inside one concatenated declaration', () => {
    expect(
      nonRedundantObjectiveDeclarations([
        'Distinguish observable features from inference. Cite the deciding visual detail. Name what the evidence cannot establish.',
        'Distinguish observable features from inference.',
        'Cite the deciding visual detail.',
        'Name what the evidence cannot establish.',
      ]),
    ).toEqual([
      'Distinguish observable features from inference.',
      'Cite the deciding visual detail.',
      'Name what the evidence cannot establish.',
    ]);
  });
});
