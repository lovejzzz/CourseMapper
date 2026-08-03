import { describe, expect, it } from 'vitest';
import { openCourseSourceTitle } from '../compilerOpenCourseSources';

describe('compiler open-course source titles', () => {
  it('preserves a canonical title parenthetical while removing citation metadata', () => {
    expect(
      openCourseSourceTitle(
        'Functions and automated tests — Function (computer programming) (open encyclopedia, CC BY-SA 4.0 — https://en.wikipedia.org/wiki/Function_(computer_programming))',
      ),
    ).toBe('Function (computer programming)');
  });

  it('removes the lesson-focus prefix and metadata wrapper from a simple source title', () => {
    expect(
      openCourseSourceTitle('Qubits — Qubit (open encyclopedia, CC BY-SA 4.0 — https://en.wikipedia.org/wiki/Qubit)'),
    ).toBe('Qubit');
  });

  it('preserves punctuation that belongs to the source title', () => {
    expect(
      openCourseSourceTitle(
        'Learning systems — State-of-the-art methods (open article, CC BY 4.0 — https://example.edu/state-of-the-art)',
      ),
    ).toBe('State-of-the-art methods');
  });

  it('recognizes explicit open-source metadata even when a display citation omits its URL', () => {
    expect(openCourseSourceTitle('Quantum gates — Quantum logic gate (open encyclopedia)')).toBe('Quantum logic gate');
  });
});
