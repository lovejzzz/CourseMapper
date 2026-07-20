import { describe, expect, it } from 'vitest';

import { humanizeQuizText } from '../compilerText.js';

describe('humanizeQuizText', () => {
  it('removes a dangling math delimiter after sentence punctuation', () => {
    expect(humanizeQuizText('Which distinction is supported?$')).toBe('Which distinction is supported?');
  });

  it('preserves balanced inline math at the end of a prompt', () => {
    expect(humanizeQuizText('Evaluate $x$')).toBe('Evaluate $x$');
  });
});
