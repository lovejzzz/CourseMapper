import { describe, expect, it } from 'vitest';
import { appendOpenCourseSourceTexts, openCourseSourceTitle, openCourseSourceUrl } from '../compilerOpenCourseSources';

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

  it('preserves balanced URL parentheticals and removes the outer metadata wrapper', () => {
    const citation =
      'Python data types — Expression (computer science) (open encyclopedia, CC BY-SA 4.0 — https://en.wikipedia.org/wiki/Expression_(computer_science))';
    expect(openCourseSourceUrl(citation)).toBe('https://en.wikipedia.org/wiki/Expression_(computer_science)');

    const texts = [];
    appendOpenCourseSourceTexts({ lessons: [{ readings: [citation] }] }, texts, new Set());
    expect(texts).toEqual([
      expect.objectContaining({
        title: 'Expression (computer science)',
        note: expect.stringContaining('https://en.wikipedia.org/wiki/Expression_(computer_science).'),
      }),
    ]);
  });

  it('uses the outer metadata wrapper when its details contain a nested parenthetical', () => {
    const citation =
      'Visualization — Assessing multisensor integration for geological modeling (open scholarly article, CC0 1.0 (DOAJ article metadata) — https://example.org/doi/10.1000/example)';
    expect(openCourseSourceTitle(citation)).toBe('Assessing multisensor integration for geological modeling');

    const texts = [];
    appendOpenCourseSourceTexts({ lessons: [{ readings: [citation] }] }, texts, new Set());
    expect(texts[0]).toMatchObject({
      title: 'Assessing multisensor integration for geological modeling',
      note: 'Assigned open course source (open scholarly article, CC0 1.0 (DOAJ article metadata)) — https://example.org/doi/10.1000/example.',
    });
  });
});
