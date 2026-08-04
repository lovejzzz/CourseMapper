import { describe, expect, it } from 'vitest';

import { selectScionSourceRetentionCandidate } from '../lib/scionSourceRetentionSelector.mjs';

const claims = ['A variable scope is the part of a program where the variable can be accessed.'];
const base = {
  sourceFactIndexes: [0],
  tr: 'Variable scope',
  df: 'The region of a program in which a variable remains accessible.',
  eg: 'A function-local name cannot be read from an unrelated outer statement.',
  mi: 'Scope is only the line where the variable first receives a value.',
};

describe('Scion source retention selector', () => {
  it('retains an admitted control instead of letting teacher output replace it', () => {
    const control = {
      ...base,
      cx: 'Accessibility depends on the program region, not merely the first assignment line.',
    };
    const teacher = { ...base, cx: 'A variable is available everywhere after assignment.' };
    expect(selectScionSourceRetentionCandidate({ control, teacher, authorizedClaims: claims })).toMatchObject({
      status: 'selected',
      selectedArm: 'matched-control',
    });
  });

  it('uses teacher output only as a strict-gate rescue', () => {
    const control = { ...base, cx: base.df };
    const teacher = {
      ...base,
      cx: 'Accessibility depends on the program region, not merely the first assignment line.',
    };
    expect(selectScionSourceRetentionCandidate({ control, teacher, authorizedClaims: claims })).toMatchObject({
      status: 'selected',
      selectedArm: 'teacher-rescue',
    });
  });

  it('quarantines when neither candidate clears the strict source gate', () => {
    const invalid = { ...base, cx: base.df };
    expect(
      selectScionSourceRetentionCandidate({ control: invalid, teacher: invalid, authorizedClaims: claims }),
    ).toMatchObject({
      status: 'quarantined',
      selectedArm: 'quarantine',
      selectedTermSha256: null,
    });
  });
});
